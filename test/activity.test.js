import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const sei={tab:{id:1,url:'https://sei.rj.gov.br/sei/controlador.php?acao=procedimento_controlar'}};

function background(){
 let clock=1_000_000,listener;
 const context={Date:{now:()=>clock},chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}}}};
 runInNewContext(read('activity-background.js'),context);
 const send=(msg,sender=sei)=>{let reply;listener(msg,sender,r=>reply=r);return reply;};
 return {A:context.seiActivity,send,advance:ms=>clock+=ms,get now(){return clock;}};
}

test('rodada só começa após 15 s sem navegação, salvo se ficou 5 min sem rodar',()=>{
 const b=background();
 assert.equal(b.A.due('monitor',0),true);
 b.send({type:'sei:activity'});
 assert.equal(b.A.due('monitor',b.now-60000),false);
 b.advance(14000);assert.equal(b.A.due('monitor',b.now-60000),false);
 b.advance(1000);assert.equal(b.A.due('monitor',b.now-60000),true);
 // Interval still applies when quiet.
 assert.equal(b.A.due('monitor',b.now-30000),false);
 // Constant navigation never blocks a cycle for more than 5 min.
 b.send({type:'sei:activity'});
 assert.equal(b.A.due('monitor',b.now-299000),false);
 assert.equal(b.A.due('monitor',b.now-300000),true);
});

test('atividade de fora do SEI é ignorada e a espera entre leituras segue a última navegação',()=>{
 const b=background();
 assert.equal(b.send({type:'sei:activity'},{tab:{id:2,url:'https://exemplo.com/'}}),undefined);
 assert.equal(b.A.due('monitor',b.now-60000),true);
 assert.deepEqual({...b.send({type:'sei:activity-wait'})},{wait:0});
 b.send({type:'sei:activity'});
 assert.deepEqual({...b.send({type:'sei:activity-wait'})},{wait:2500});
 b.advance(1000);assert.deepEqual({...b.send({type:'sei:activity-wait'})},{wait:1500});
 assert.equal(b.send({type:'sei:activity-wait'},{tab:{id:2,url:'https://exemplo.com/'}}),undefined);
});

test('SEI lento dobra o intervalo até 5 min e volta ao normal quando responde bem',()=>{
 const b=background();
 assert.equal(b.A.interval('monitor:x'),55000);
 b.A.report('monitor:x',true);assert.equal(b.A.interval('monitor:x'),110000);
 assert.equal(b.A.due('monitor:x',b.now-60000),false);assert.equal(b.A.due('monitor:x',b.now-110000),true);
 for(let i=0;i<5;i++)b.A.report('monitor:x',true);
 assert.equal(b.A.interval('monitor:x'),300000);
 assert.equal(b.A.interval('receipts:x'),55000);
 b.A.report('monitor:x',false);assert.equal(b.A.interval('monitor:x'),55000);
});

function pacer({latency=100,waits=[]}={}){
 let clock=0;const sleeps=[],requests=[];
 const context={
  Date:{now:()=>clock},
  setTimeout:(fn,ms)=>{sleeps.push(ms);clock+=ms;queueMicrotask(fn);return sleeps.length;},clearTimeout:()=>{},
  fetch:async url=>{requests.push({url,at:clock});clock+=typeof latency==='function'?latency(requests.length):latency;return {ok:true};},
  chrome:{runtime:{sendMessage:async msg=>{assert.equal(msg.type,'sei:activity-wait');return {wait:waits.shift()||0};}}},
 };
 runInNewContext(read('pace.js'),context);
 return {fetch:context.seiPacedFetch,sleeps,requests,get now(){return clock;}};
}

test('leituras em segundo plano ficam espaçadas e esperam a navegação do usuário assentar',async()=>{
 const p=pacer({waits:[0,0,2500,1500,500]});
 await p.fetch('a');await p.fetch('b');
 assert.ok(p.requests[1].at-p.requests[0].at>=1100,'pelo menos 1 s depois do fim da anterior');
 await p.fetch('c');
 // Navigation happened: waits until 2.5 s after it, polling again in steps of at most 1 s.
 assert.ok(p.requests[2].at-p.requests[1].at>=1100+2500);
 const slow=pacer({latency:6000});
 await slow.fetch('a');await slow.fetch('b');
 assert.ok(slow.requests[1].at-slow.requests[0].at>=12000,'espaço acompanha a demora do SEI');
 await slow.fetch('c');assert.equal(slow.fetch.slow(),true);
 const quick=pacer();for(const u of 'abc')await quick.fetch(u);assert.equal(quick.fetch.slow(),false);
});

test('espera por navegação tem limite de 5 s por leitura e respeita o cancelamento',async()=>{
 const p=pacer({waits:Array(20).fill(2500)});
 await p.fetch('a');
 // 1 s of spacing, then at most 5 s waiting for navigation.
 assert.ok(p.requests[0].at>=5000&&p.requests[0].at<=6000);
 const controller=new AbortController();controller.abort(new Error('cancelado'));
 await assert.rejects(p.fetch('b',{signal:controller.signal}),/cancelado/);
 assert.equal(p.requests.length,1);
});

test('manifesto avisa navegação no início de cada frame e só as leituras de fundo usam o ritmo',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 const first=manifest.content_scripts[0];
 assert.deepEqual(first.js,['activity.js']);assert.equal(first.run_at,'document_start');assert.equal(first.all_frames,true);
 const top=manifest.content_scripts.find(c=>c.js.includes('monitor-data.js'));
 assert.ok(top.js.indexOf('pace.js')<top.js.indexOf('monitor-data.js'));
 assert.match(read('background.js'),/importScripts\('activity-background.js'\)[\s\S]*importScripts\('monitor-background.js'\)/);
 for(const f of ['monitor-data.js','receipts-data.js','signature-data.js'])assert.match(read(f),/seiPacedFetch \|\| fetch/);
 // User-requested reads (process card, history pages) are never delayed.
 for(const f of ['document.js','history-pages.js','scope.js'])assert.doesNotMatch(read(f),/seiPacedFetch/);
});

test('aviso de navegação é enviado no início, ao sair, ao clicar e ao terminar de carregar',()=>{
 const listeners={},messages=[];let clock=0;
 runInNewContext(read('activity.js'),{Date:{now:()=>clock},window:{addEventListener:(t,fn)=>listeners[t]=fn},chrome:{runtime:{sendMessage:async m=>{messages.push(m);}}}});
 assert.equal(messages.length,1);
 listeners.pointerdown();assert.equal(messages.length,1,'no máximo um aviso a cada 0,5 s');
 clock+=600;listeners.pointerdown();clock+=600;listeners.keydown({key:'a'});listeners.keydown({key:'Enter'});
 clock+=600;listeners.beforeunload();clock+=600;listeners.load();
 assert.equal(messages.length,5);assert.ok(messages.every(m=>m.type==='sei:activity'));
});
