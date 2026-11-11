import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const sei={tab:{id:1,url:'https://sei.rj.gov.br/sei/controlador.php?acao=procedimento_controlar'}};

// Deterministic clock: timers run in due order, after pending promises settle.
function clock(){
 let now=1_000_000,seq=0;const timers=[];
 return {
  now:()=>now,
  advance:ms=>{now+=ms;},
  setTimeout:(fn,ms=0)=>{const id=++seq;timers.push({id,at:now+Math.max(0,ms),fn});return id;},
  clearTimeout:id=>{const i=timers.findIndex(t=>t.id===id);if(i>=0)timers.splice(i,1);},
  async run(done=()=>false,limit=600000){
   const end=now+limit;
   for(;;){
    for(let i=0;i<3;i++)await new Promise(r=>setImmediate(r));
    if(done()||!timers.length)return;
    timers.sort((a,b)=>a.at-b.at||a.id-b.id);const t=timers.shift();now=Math.max(now,t.at);
    if(now>end)throw Error('clock limit');t.fn();
   }
  },
 };
}
function background(c=clock(),stored={}){
 let listener;
 const session={get:async k=>({[k]:structuredClone(stored[k])}),set:async v=>Object.assign(stored,structuredClone(v)),remove:async keys=>{for(const k of keys)delete stored[k];}};
 const context={Date:{now:c.now},crypto,chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}},storage:{session}}};
 runInNewContext(read('activity-background.js'),context);
 const send=(msg,sender=sei)=>{let reply;listener(msg,sender,r=>reply=r);return reply;};
 return {A:context.seiActivity,send,stored,clock:c,
  latency:ms=>{c.advance(20000);const slot=send({type:'sei:slot',ignoreNavigation:true});if(slot.id)send({type:'sei:slot-done',id:slot.id,latency:ms});}};
}
function tab(b,{latency=100}={}){
 const c=b.clock,requests=[];
 const context={Date:{now:c.now},setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,AbortController,AbortSignal,DOMException,Response,
  fetch:(url)=>{const r={url,start:c.now()};requests.push(r);return new Promise(resolve=>c.setTimeout(()=>{r.end=c.now();resolve(new Response('ok'));},typeof latency==='function'?latency(url):latency));},
  chrome:{runtime:{sendMessage:async msg=>b.send(msg)}}};
 runInNewContext(read('pace.js'),context);
 return {fetch:context.seiPacedFetch,requests};
}

test('rodada só começa após 15 s sem navegação, salvo se ficou 2 min sem rodar',()=>{
 const b=background(),now=()=>b.clock.now();
 assert.equal(b.A.due('monitor',0),true);
 b.send({type:'sei:activity'});
 assert.equal(b.A.due('monitor',now()-60000),false);
 assert.equal(b.A.due('monitor',now()-119000),false);
 assert.equal(b.A.due('monitor',now()-120000),true,'navegação contínua não impede uma rodada por mais de 2 min');
 assert.equal(b.A.due('monitor',now()-30000),false,'intervalo mínimo continua valendo');
 assert.equal(b.send({type:'sei:activity'},{tab:{id:2,url:'https://exemplo.com/'}}),undefined);
});

test('SEI lento dobra o intervalo até 5 min, sobrevive ao reinício do service worker e volta ao normal',async()=>{
 const b=background();
 b.A.report('monitor:x');assert.equal(b.A.interval('monitor:x'),55000,'sem medições suficientes não muda');
 for(let i=0;i<3;i++)b.latency(6000);
 assert.equal(b.A.slow(),true);
 b.A.report('monitor:x');assert.equal(b.A.interval('monitor:x'),110000);
 assert.equal(b.A.due('monitor:x',b.clock.now()-60000),false);
 for(let i=0;i<5;i++)b.A.report('monitor:x');
 assert.equal(b.A.interval('monitor:x'),300000);assert.equal(b.A.longestGap('monitor:x'),300000);
 assert.equal(b.A.interval('receipts:x'),55000);assert.equal(b.A.longestGap('receipts:x'),120000);
 await new Promise(r=>setImmediate(r));
 const restarted=background(clock(),b.stored);await restarted.A.loaded;
 assert.equal(restarted.A.interval('monitor:x'),300000,'recuo guardado na sessão');
 for(let i=0;i<10;i++)b.latency(200);
 b.A.report('monitor:x');assert.equal(b.A.interval('monitor:x'),55000);
});

test('uma leitura de fundo por vez entre abas, espaçada pelo tempo da última resposta',async()=>{
 const b=background(),a=tab(b,{latency:3000}),other=tab(b,{latency:500});
 const done=Promise.all([a.fetch('a1'),other.fetch('b1'),a.fetch('a2')]);let finished=false;done.then(()=>finished=true);
 await b.clock.run(()=>finished);
 const all=[...a.requests,...other.requests].sort((x,y)=>x.start-y.start);
 assert.equal(all.length,3);
 for(let i=1;i<all.length;i++){
  assert.ok(all[i].start>=all[i-1].end,'nunca duas leituras ao mesmo tempo');
  assert.ok(all[i].start-all[i-1].end>=Math.max(1000,all[i-1].end-all[i-1].start),'espaço acompanha a demora');
 }
});

test('leitura espera a navegação assentar, mas no máximo cerca de 5 s',async()=>{
 const b=background(),t=tab(b);
 b.send({type:'sei:activity'});const navigated=b.clock.now();
 let finished=false;t.fetch('a').then(()=>finished=true);await b.clock.run(()=>finished);
 assert.ok(t.requests[0].start>=navigated+2500);
 // Constant navigation: activity every 500 ms never holds a read for long.
 const c=b.clock;let stop=false;const keep=()=>{if(stop)return;b.send({type:'sei:activity'});c.setTimeout(keep,500);};keep();
 const before=c.now();finished=false;t.fetch('b').then(()=>{finished=true;stop=true;});await c.run(()=>finished);
 const waited=t.requests[1].start-before;
 assert.ok(waited>=5000&&waited<=7000,`esperou ${waited} ms`);
});

test('tempo limite conta só a leitura, não a espera pela vaga, e o cancelamento interrompe a espera',async()=>{
 const b=background(),busy=tab(b,{latency:20000}),t=tab(b,{latency:100});
 busy.fetch('longa');await b.clock.run(()=>busy.requests.length===1);
 const limit=t.fetch.timeout(2000);
 let finished=false;t.fetch('depois').then(()=>finished=true);await b.clock.run(()=>finished);
 assert.ok(t.requests[0].start-busy.requests[0].start>=20000,'esperou a vaga');
 assert.equal(limit.aborted,false,'a espera de 20 s não consumiu os 2 s');
 await b.clock.run(()=>limit.aborted);assert.equal(limit.reason.name,'TimeoutError');
 const controller=new AbortController();
 const first=background();const holder=tab(first,{latency:60000}),waiting=tab(first);
 holder.fetch('x');await first.clock.run(()=>holder.requests.length===1);
 const pending=waiting.fetch('y',{signal:controller.signal});controller.abort(new Error('cancelado'));
 await assert.rejects(pending,/cancelado/);assert.equal(waiting.requests.length,0);
});

test('manifesto avisa navegação no início de cada frame e só as leituras de fundo usam o ritmo',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 const first=manifest.content_scripts[0];
 assert.deepEqual(first.js,['activity.js']);assert.equal(first.run_at,'document_start');assert.equal(first.all_frames,true);
 const top=manifest.content_scripts.find(c=>c.js.includes('monitor-data.js'));
 assert.ok(top.js.indexOf('pace.js')<top.js.indexOf('monitor-data.js'));
 assert.match(read('background.js'),/importScripts\('activity-background.js'\)[\s\S]*importScripts\('monitor-background.js'\)/);
 for(const f of ['monitor-data.js','receipts-data.js','signature-data.js'])assert.match(read(f),/seiPacedFetch\(url, \{ \.\.\.init, timeout \}\)/);
 // User-requested reads (process card, history pages) are never delayed.
 assert.doesNotMatch(read('document.js'),/seiPacedFetch/);
 // History pages are paced only when the signature monitor (background) asks for it.
 assert.match(read('history-pages.js'),/paced && globalThis.seiPacedFetch/);assert.match(read('signature-data.js'),/finish([^)]*{ paced: true })/);assert.doesNotMatch(read('document.js'),/paced: true/);
 // The options page's block-list refresh is a background read too.
 assert.match(read('scope.js'),/seiPacedFetch\(url/);assert.doesNotMatch(read('options.js'),/Promise.allSettled/);
});

test('aviso de navegação é enviado no início, ao sair, ao clicar e ao terminar de carregar',()=>{
 const listeners={},messages=[];let now=0;
 runInNewContext(read('activity.js'),{Date:{now:()=>now},window:{addEventListener:(t,fn)=>listeners[t]=fn},chrome:{runtime:{sendMessage:async m=>{messages.push(m);}}}});
 assert.equal(messages.length,1);
 listeners.pointerdown();assert.equal(messages.length,1,'no máximo um aviso a cada 0,5 s');
 now+=600;listeners.pointerdown();now+=600;listeners.keydown({key:'a'});listeners.keydown({key:'Enter'});
 now+=600;listeners.beforeunload();now+=600;listeners.load();
 assert.equal(messages.length,5);assert.ok(messages.every(m=>m.type==='sei:activity'));
});

test('esperas sobrepostas na mesma aba não quebram o tempo limite e a vez só volta depois do corpo',async()=>{
 const b=background(),c=b.clock,holder=tab(b,{latency:4000}),t=tab(b,{latency:100});
 holder.fetch('ocupada');await c.run(()=>holder.requests.length===1);
 const limit=t.fetch.timeout(2000);let done=0;
 t.fetch('a').then(()=>done++);t.fetch('b').then(()=>done++);
 await c.run(()=>done===2);
 assert.equal(limit.aborted,false,'esperas não contam');
 const before=c.now();await c.run(()=>limit.aborted,60000);
 assert.ok(c.now()-before<=2100,'dispara depois de ~2 s de leitura, sem laço infinito');
 // Body arriving 3 s after the headers keeps the slot: the next read starts only after it.
 const slowBody={requests:[]};
 const ctx={Date:{now:c.now},setTimeout:c.setTimeout,clearTimeout:c.clearTimeout,AbortController,AbortSignal,DOMException,Response,
  fetch:async url=>{slowBody.requests.push({url,start:c.now()});return {status:200,statusText:'OK',headers:new Headers(),arrayBuffer:()=>new Promise(r=>c.setTimeout(()=>{slowBody.end=c.now();r(new ArrayBuffer(1));},3000))};},
  chrome:{runtime:{sendMessage:async msg=>b.send(msg)}}};
 runInNewContext(read('pace.js'),ctx);
 let finished=0;ctx.seiPacedFetch('corpo').then(()=>finished++);const next=tab(b);next.fetch('depois').then(()=>finished++);
 await c.run(()=>finished===2);
 assert.ok(next.requests[0].start>=slowBody.end+1000,'próxima leitura espera o corpo e o intervalo');
});

test('falha de rede ou redirecionamento para o login vira mensagem clara; cancelamento mantém o erro próprio',async()=>{
 const run=fetch=>{const done=[],pauses=[];const context={Date,setTimeout:(fn,ms)=>{pauses.push(ms);return setTimeout(fn,0);},clearTimeout,AbortController,AbortSignal,DOMException,Response,fetch,chrome:{runtime:{sendMessage:async msg=>{if(msg.type==='sei:slot')return {id:'s1',wait:0};done.push(msg);return {ok:true};}}}};runInNewContext(read('pace.js'),context);return {fetch:context.seiPacedFetch,done,pauses};};
 let calls=0;const failed=run(async()=>{calls++;throw new TypeError('Failed to fetch');});
 await assert.rejects(failed.fetch('https://sei.rj.gov.br/sei/controlador.php'),e=>/o SEI não respondeu \(sem conexão ou sessão expirada\)/.test(e.message)&&!/Failed to fetch/.test(e.message));
 assert.equal(calls,2,'uma única nova tentativa antes de acusar a falha');assert.deepEqual(failed.pauses,[3000]);
 assert.equal(failed.done.filter(m=>m.type==='sei:slot-done').length,1,'a vez é devolvida mesmo na falha');
 calls=0;const blip=run(async()=>{if(!calls++)throw new TypeError('Failed to fetch');return new Response('ok');});
 assert.equal(await (await blip.fetch('https://sei.rj.gov.br/sei/controlador.php')).text(),'ok','falha momentânea de rede não vira erro');
 assert.equal(calls,2);assert.equal(blip.done.filter(m=>m.type==='sei:slot-done').length,1);
 calls=0;const aborted=run(async()=>{calls++;throw new DOMException('The user aborted a request.','AbortError');});
 await assert.rejects(aborted.fetch('https://sei.rj.gov.br/sei/controlador.php'),e=>e.name==='AbortError');assert.equal(calls,1,'cancelamento não é repetido');
});

test('leitura pedida pelo usuário não espera a navegação assentar, mas continua pedindo a vez',async()=>{
 const slots=[];const context={Date,setTimeout,clearTimeout,AbortController,AbortSignal,DOMException,Response,fetch:async()=>new Response('ok'),chrome:{runtime:{sendMessage:async msg=>{if(msg.type==='sei:slot'){slots.push(msg.ignoreNavigation);return {id:'s',wait:0};}return {ok:true};}}}};
 runInNewContext(read('pace.js'),context);
 await context.seiPacedFetch('https://sei.rj.gov.br/sei/controlador.php',{urgent:true});
 await context.seiPacedFetch('https://sei.rj.gov.br/sei/controlador.php',{});
 assert.deepEqual(slots,[true,false]);
 assert.match(read('users.js'),/urgent: true/);
 for(const f of ['monitor-data.js','receipts-data.js','signature-data.js','scope.js'])assert.doesNotMatch(read(f),/urgent/,'leituras de fundo continuam cedendo a vez');
});

test('novo acesso ao SEI descarta os endereços guardados do acesso anterior e recusa leituras de abas antigas',async()=>{
 const h=c=>c.repeat(64),stores=()=>({seiBlockTargets:{targets:{a:{url:'x'}}},seiSecretariatReceiptTargets:{o:{url:'y'}},seiSignatureProcesses:{o:[['1','z',1]]},seiSignatureScans:{o:{}},seiActivityIntervals:{k:110000}});
 const stored=stores(),b=background(clock(),stored);
 assert.equal(await b.A.checkSession({u:h('a'),t:h('b')},1000),false);
 assert.equal(await b.A.checkSession({u:h('a')},2000),false,'mesma sessão em outra página');
 assert.ok(stored.seiBlockTargets&&stored.seiSignatureProcesses,'sem troca de sessão nada é descartado');
 assert.equal(await b.A.checkSession({t:'curto'},3000),false,'marca inválida é ignorada');assert.ok(stored.seiBlockTargets);
 assert.equal(await b.A.checkSession({u:h('c'),t:h('d')},5000),false,'página mais nova com outra assinatura: novo acesso');
 for(const k of ['seiBlockTargets','seiSecretariatReceiptTargets','seiSignatureProcesses','seiSignatureScans'])assert.equal(stored[k],undefined,k);
 assert.deepEqual(stored.seiActivityIntervals,{k:110000},'o que não guarda endereço permanece');
 assert.equal(await b.A.checkSession({u:h('a'),t:h('b')},2000),true,'aba carregada no acesso anterior não lê o SEI');
 assert.equal(await b.A.checkSession({t:h('b')},1500),true);
 Object.assign(stored,{seiBlockTargets:{targets:{n:{url:'novo'}}}});
 assert.equal(await b.A.checkSession({u:h('a')},2000),true);assert.ok(stored.seiBlockTargets,'aba antiga não apaga os endereços do acesso atual');
 assert.equal(await b.A.checkSession({t:h('d')},6000),false);assert.ok(stored.seiBlockTargets);
 const restarted=background(clock(),stored);
 assert.equal(await restarted.A.checkSession({u:h('a')},2000),true,'a marca sobrevive ao reinício do service worker');
 const reply=await new Promise(r=>{let listener;const session={get:async k=>({[k]:stored[k]}),set:async v=>Object.assign(stored,v),remove:async()=>{}};
  runInNewContext(read('activity-background.js'),{Date,crypto,chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}},storage:{session}}});
  assert.equal(listener({type:'sei:session',marks:{u:h('a')},loaded:2000},sei,r),true);});
 assert.equal(reply.stale,true);
 const only=background(clock(),{});await only.A.checkSession({u:h('a')},1000);
 assert.equal(await only.A.checkSession({t:h('e')},500),false,'sem marca em comum não há como comparar: nada muda');
 assert.equal(await only.A.checkSession({u:h('a'),t:h('e')},1200),false);
});

test('leitura parte da página só se ela for do acesso atual; a marca vem de links fixos do cabeçalho',async()=>{
 const base='https://sei.rj.gov.br/sei/controlador.php',hash='ab'.repeat(32),other='cd'.repeat(32);
 const page=(links,stale)=>{const sent=[];let fetches=0;const context={Date,setTimeout,clearTimeout,AbortController,AbortSignal,DOMException,Response,URL,
   SEI_ORGANIZADOR_CONFIG:{unitId:'1'},location:{href:base+'?acao=procedimento_controlar'},performance:{timeOrigin:1234.6},
   document:{querySelector:sel=>links[sel]?{getAttribute:name=>links[sel][name]??null}:null},
   fetch:async()=>{fetches++;return new Response('ok');},
   chrome:{runtime:{sendMessage:async msg=>{if(msg.type==='sei:session'){sent.push(msg);return {stale:stale&&!!msg.marks};}if(msg.type==='sei:slot')return {id:'s',wait:0};return {ok:true};}}}};
  runInNewContext(read('pace.js'),context);return {fetch:context.seiPacedFetch,sent,fetches:()=>fetches};};
 const links={'#lnkUsuarioSistema':{href:'controlador.php?acao=infra_acesso_usuario_listar&infra_sistema=100000100&infra_unidade_atual=1&infra_hash='+hash},
  '#lnkInfraUnidade':{href:'#',onclick:"window.location.href='controlador.php?acao=infra_trocar_unidade&infra_sistema=100000100&infra_unidade_atual=1&infra_hash="+other+"';"}};
 const fresh=page(links,false);assert.equal(await (await fresh.fetch(base)).text(),'ok');
 assert.deepEqual(JSON.parse(JSON.stringify(fresh.sent)),[{type:'sei:session',marks:{u:hash,t:other},loaded:1235}]);
 const old=page(links,true);await assert.rejects(old.fetch(base),/acesso anterior ao SEI/);assert.equal(old.fetches(),0,'nenhum pedido chega ao SEI');
 assert.equal(await old.fetch.staleSession(),true);
 const extra=page({'#lnkUsuarioSistema':{href:links['#lnkUsuarioSistema'].href.replace('&infra_sistema','&id_bloco=9&infra_sistema')}},true);
 assert.equal(await (await extra.fetch(base)).text(),'ok','link com parâmetro da tela não serve de marca');assert.ok(extra.sent.length&&extra.sent.every(m=>m.marks===null),'sem marca, a página ainda pergunta se é anterior ao fim de uma sessão');
 const unit=page({'#lnkUsuarioSistema':{href:links['#lnkUsuarioSistema'].href.replace('infra_unidade_atual=1','infra_unidade_atual=2')}},true);
 await unit.fetch(base);assert.ok(unit.sent.every(m=>m.marks===null),'outra unidade não gera marca');
});

test('redirecionamento do SEI numa leitura de fundo encerra o uso dos endereços e das abas daquele acesso',async()=>{
 const h=c=>c.repeat(64),stored={seiBlockTargets:{targets:{a:{url:'x'}}},seiSecretariatReceiptTargets:{o:{url:'y'}},seiSignatureProcesses:{o:[['1','z',1]]},seiSignatureScans:{o:{}},seiActivityIntervals:{k:110000}};
 const c=clock(),b=background(c,stored);
 assert.equal(await b.A.checkSession({u:h('a')},c.now()-5000),false);
 // The page reads the SEI and gets the redirect to the login page: not followed, not retried.
 let calls=0;const sent=[];const context={Date,setTimeout,clearTimeout,AbortController,AbortSignal,DOMException,Response,fetch:async(url,init)=>{calls++;assert.equal(init.redirect,'manual');return {type:'opaqueredirect',status:0};},chrome:{runtime:{sendMessage:async msg=>{sent.push(msg.type);if(msg.type==='sei:slot')return {id:'s',wait:0};if(msg.type==='sei:session-ended'){b.send(msg);await b.A.endSession(c.now());}return {ok:true};}}}};
 runInNewContext(read('pace.js'),context);
 await assert.rejects(context.seiPacedFetch('https://sei.rj.gov.br/sei/controlador.php',{redirect:'error'}),/a sessão do SEI terminou/);
 assert.equal(calls,1);assert.ok(sent.includes('sei:session-ended'));assert.ok(sent.includes('sei:slot-done'),'a vez é devolvida');
 for(const k of ['seiBlockTargets','seiSecretariatReceiptTargets','seiSignatureProcesses','seiSignatureScans'])assert.equal(stored[k],undefined,k);
 assert.deepEqual(stored.seiActivityIntervals,{k:110000});
 // Pages loaded before that moment stop reading, with or without marks, even with the same marks.
 assert.equal(await b.A.checkSession({u:h('a')},c.now()-5000),true);assert.equal(await b.A.checkSession(null,c.now()-1),true);
 // The new login may land on another unit (no marks to compare): its pages are newer, so they read.
 c.advance(60000);assert.equal(await b.A.checkSession(null,c.now()),false);
 assert.equal(await b.A.checkSession({u:h('b')},c.now()),false,'novo acesso');assert.equal(await b.A.checkSession({u:h('a')},c.now()-70000),true,'a aba antiga continua parada depois do novo acesso');
 const restarted=background(c,stored);assert.equal(await restarted.A.checkSession(null,c.now()-70000),true,'sobrevive ao reinício do service worker');assert.equal(await restarted.A.checkSession({u:h('b')},c.now()),false);
});
