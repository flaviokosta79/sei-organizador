import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('worker usa servico e unidade fixos, sem token, cookies ou configuracao manual',async()=>{
 const token='a'.repeat(43);let listener;const requests=[];
 runInNewContext(readFileSync(new URL('../extension/service-client.js',import.meta.url),'utf8')+';'+readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{
  URL,AbortSignal,structuredClone,importScripts:()=>{},SEI_ORGANIZADOR_CONFIG:{serviceUrl:'https://ext.5cpa.com.br',unitId:'1'},
  chrome:{runtime:{onMessage:{addListener:f=>listener=f}},storage:{local:{get:async()=>({serviceUrl:'http://127.0.0.1:8787',unitId:'9',apiToken:token})}}},
  fetch:async(url,options)=>{requests.push({url:url.toString(),options});return {ok:true,json:async()=>({version:1})};}
 });
 for(const body of [undefined,{version:0,action:{type:'create',name:'Teste'}}]){
  const response=await new Promise(resolve=>listener({type:'api',unit:'1',block:'2',body},{tab:{url:'https://sei.rj.gov.br/sei/controlador.php'}},resolve));
  assert.equal(response.error,undefined);
 }
 for(const {url,options} of requests){assert.equal(url.includes(token),false);assert.equal(options.headers.Authorization,undefined);assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.body?.includes(token)||false,false);}
 assert.equal(requests[0].url,'https://ext.5cpa.com.br/v1/units/1/blocks/2');
 const denied=await new Promise(resolve=>listener({type:'api',unit:'9',block:'2'},{tab:{url:'https://sei.rj.gov.br/sei/controlador.php'}},resolve));
 assert.equal(denied.error,'Unidade ou bloco inválido');assert.equal(requests.length,2);
});

test('worker traduz respostas que não são JSON em mensagem amigável',async()=>{
 let listener,next;
 runInNewContext(readFileSync(new URL('../extension/service-client.js',import.meta.url),'utf8')+';'+readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{
  URL,AbortSignal,structuredClone,importScripts:()=>{},SEI_ORGANIZADOR_CONFIG:{serviceUrl:'https://ext.5cpa.com.br',unitId:'1'},
  chrome:{runtime:{onMessage:{addListener:f=>listener=f}}},fetch:async()=>next
 });
 const call=()=>new Promise(resolve=>listener({type:'api',unit:'1',block:'2'},{tab:{url:'https://sei.rj.gov.br/sei/controlador.php'}},resolve));
 const html={json:async()=>{throw new SyntaxError("Unexpected token '<'");}};
 next={ok:false,status:502,...html};assert.equal((await call()).error,'Serviço indisponível (HTTP 502). Tente novamente em instantes.');
 next={ok:true,status:200,...html};assert.equal((await call()).error,'Resposta inválida do serviço. Tente novamente em instantes.');
 next={ok:false,status:409,json:async()=>({error:'Estado atualizado por outro colega.'})};assert.equal((await call()).error,'Estado atualizado por outro colega.');
 next={ok:true,status:200,json:async()=>({version:3})};assert.deepEqual((await call()).data,{version:3});
});

test('leituras iguais do mesmo bloco compartilham uma consulta curta e gravações invalidam o cache',async()=>{
 let listener,version=1;const requests=[];let gate=null;
 runInNewContext(readFileSync(new URL('../extension/service-client.js',import.meta.url),'utf8')+';'+readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{
  URL,AbortSignal,structuredClone,importScripts:()=>{},SEI_ORGANIZADOR_CONFIG:{serviceUrl:'https://ext.5cpa.com.br',unitId:'1'},
  chrome:{runtime:{onMessage:{addListener:f=>listener=f}}},
  fetch:async(url,options)=>{requests.push(`${options.method} ${new URL(url).pathname}`);if(gate&&!options.body)await gate;return {ok:true,json:async()=>({version:options.body?++version:version})};}
 });
 const call=(extra={})=>new Promise(resolve=>listener({type:'api',unit:'1',block:'2',...extra},{tab:{url:'https://sei.rj.gov.br/sei/controlador.php'}},resolve));
 const [a,b]=await Promise.all([call(),call()]);assert.equal(a.data.version,1);assert.equal(b.data.version,1);
 a.data.version=99;assert.equal((await call()).data.version,1,'cópias independentes');
 assert.equal(requests.length,1,'abas e card simultâneos fazem uma consulta');
 await call({block:'20'});assert.equal(requests.length,2,'outro bloco não usa o cache');
 await call({history:true});assert.equal(requests.length,3);
 assert.equal((await call({body:{version:1,action:{type:'create',name:'X'}}})).data.version,2);
 assert.equal((await call()).data.version,2,'gravação invalida a leitura');assert.equal(requests.length,5);
 // A read that began before a write is not reused after it.
 let open;gate=new Promise(r=>open=r);const slow=call({block:'30'});await new Promise(r=>setTimeout(r,0));
 await call({block:'30',body:{version:2,action:{type:'create',name:'Y'}}});gate=null;open();await slow;
 const before=requests.length;await call({block:'30'});assert.equal(requests.length,before+1);
});
