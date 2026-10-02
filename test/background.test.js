import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('worker usa servico e unidade fixos, sem token, cookies ou configuracao manual',async()=>{
 const token='a'.repeat(43);let listener;const requests=[];
 runInNewContext(readFileSync(new URL('../extension/background.js',import.meta.url),'utf8'),{
  URL,AbortSignal,importScripts:()=>{},SEI_ORGANIZADOR_CONFIG:{serviceUrl:'https://ext.5cpa.com.br',unitId:'1'},
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
