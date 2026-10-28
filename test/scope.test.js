import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {createStore} from '../server/store.js';
const read=file=>readFileSync(new URL('../extension/'+file,import.meta.url),'utf8');
const base='https://sei.rj.gov.br/sei/controlador.php';
const actor={unit:'1',org:'SEPM',login:'pessoa',name:'Pessoa Teste'};
const url=id=>base+`?acao=rel_bloco_protocolo_listar&id_bloco=${id}&infra_unidade_atual=1`;
const options='chrome-extension://test/options.html';
const tick=()=>new Promise(r=>setTimeout(r,90));
function worker(){
 const data={},listeners=[],notices=[],requests=[];
 const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,openOptionsPage:async()=>{},onMessage:{addListener:fn=>listeners.push(fn)}},storage:{local:{get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))}},tabs:{query:async()=>[{id:1}],sendMessage:async(id,msg)=>notices.push(msg)}};
 const context={chrome,URL,AbortSignal,SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM',serviceUrl:'https://ext.5cpa.com.br'},importScripts:()=>{},fetch:async(url,init)=>{requests.push(String(url));return {ok:true,json:async()=>({version:0,tabs:[],assignments:{},statuses:{}})};}};
 runInNewContext(read('scope-background.js')+';'+read('background.js'),context);
 const send=(msg,source=url('2'))=>new Promise(resolve=>{for(const listener of listeners)listener(msg,{url:source,tab:{id:1,url:source},frameId:0},resolve);});
 const call=async(msg,source)=>{const result=await send({identity:actor,...msg},source);if(result.error)throw Error(result.error);return result.data;};
 const remember=(id,identity=actor)=>call({identity,type:'scope:remember',blocks:[{id,name:'Bloco '+id}]},url(id));
 return {call,send,remember,data,notices,requests,store:context.seiWorkScopeStore};
}

test('bloco de trabalho é automático na primeira abertura, persistente e separado por usuário',async()=>{
 const w=worker();assert.equal((await w.remember('2')).block,'2');assert.equal((await w.remember('3')).block,'2');
 const colleague={...actor,login:'colega'};assert.equal((await w.remember('3',colleague)).block,'3');
 const profiles=await w.call({type:'scope:options'},options);assert.equal(profiles.profiles.length,2);
 await w.call({type:'scope:set',profile:'1:SEPM:pessoa',block:'3'},options);assert.equal((await w.store.get(actor)).block,'3');assert.equal((await w.store.get(colleague)).block,'3');
 await w.call({type:'scope:set',profile:'1:SEPM:pessoa',block:'2'},options);assert.equal((await w.store.get(colleague)).block,'3');assert.ok(w.notices.some(m=>m.type==='scope:changed'));
 await assert.rejects(w.call({type:'scope:set',profile:'1:SEPM:pessoa',block:'999'},options),/Escolha um bloco/);
 await assert.rejects(w.call({type:'scope:get'},'https://evil.test'),/Origem/);
});

test('API bloqueia classificação de outro bloco, mesmo com mensagem forjada',async()=>{
 const w=worker();await w.remember('2');
 assert.ok((await w.send({type:'api',identity:actor,unit:'1',block:'3'},url('3'))).error);assert.equal(w.requests.length,0);
 assert.ok((await w.send({type:'api',identity:actor,unit:'1',block:'2'},url('2'))).data);assert.equal(w.requests.length,1);
});

test('opções mostram número e descrição, preservando descrição ao reabrir sem o campo',async()=>{
 const state=worker(),source=base+'?acao=bloco_interno_listar&infra_unidade_atual=1';
 const html='<a id="lnkUsuarioSistema" title="Pessoa Teste (pessoa/SEPM)" href="?infra_unidade_atual=1"></a><table id="tblBlocos"><tr><th>Número</th><th>Descrição</th><th>Ações</th><th>Grupo</th></tr><tr><td><a href="?acao=rel_bloco_protocolo_listar&id_bloco=2">2</a></td><td>Descrição diferente</td><td></td><td>P/3</td></tr><tr><td><a href="?acao=rel_bloco_protocolo_listar&id_bloco=3">3</a></td><td>Outra descrição</td><td></td><td></td></tr></table>';
 const dom=new JSDOM(html,{url:source,runScripts:'outside-only'}),w=dom.window;
 w.SEI_ORGANIZADOR_CONFIG={unitId:'1',org:'SEPM'};w.chrome={runtime:{onMessage:{addListener:()=>{}},sendMessage:msg=>state.send(msg,source)}};
 try{w.eval(read('scope.js'));await tick();const pref=await state.store.get(actor);assert.equal(pref.catalog.find(b=>b.id==='2').group,'P/3');assert.equal(pref.catalog.find(b=>b.id==='3').group,'');
  await state.remember('2');assert.equal((await state.store.get(actor)).catalog.find(b=>b.id==='2').group,'P/3');assert.equal((await state.store.get(actor)).catalog.find(b=>b.id==='2').name,'Descrição diferente');
  await state.remember('4');const opts=new JSDOM(read('options.html'),{url:options,runScripts:'outside-only'});try{opts.window.chrome={runtime:{sendMessage:msg=>state.send(msg,options)},tabs:{query:async()=>[]}};opts.window.eval(read('options.js'));await tick();const labels=[...opts.window.document.querySelector('#block').options].map(o=>o.textContent);assert.deepEqual(labels,['2 · Descrição diferente','3 · Outra descrição','4 · Descrição não identificada']);assert.ok(!labels.some(text=>text.includes('P/3') || text.includes('Sem grupo')));}finally{opts.window.close();}
 }finally{w.close();}
});

test('atualizar lista lê Grupo pelo cabeçalho, independentemente da ordem das colunas',async()=>{
 const state=worker(),source=url('2');let requests=0;
 const html='<title>Processos do Bloco Interno</title><a id="lnkUsuarioSistema" title="Pessoa Teste (pessoa/SEPM)" href="?infra_unidade_atual=1"></a><a href="?acao=bloco_interno_listar&infra_unidade_atual=1">Internos</a><form id="frmRelBlocoProtocoloLista"><input id="txtDescricao" value="Isto é descrição"></form>';
 const dom=new JSDOM(html,{url:source,runScripts:'outside-only'}),w=dom.window,listeners=[];
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'},TextDecoder,AbortSignal,fetch:async()=>{requests++;return new Response('<table id="tblBlocos"><tr><th>Grupo</th><th>Descrição</th><th>Número</th></tr><tr><td>Seção P/3</td><td>Isto é descrição</td><td><a href="?acao=rel_bloco_protocolo_listar&id_bloco=2">2</a></td></tr></table>',{headers:{'content-type':'text/html; charset=utf-8'}});}});
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:msg=>state.send(msg,source)}};
 try{w.eval(read('scope.js'));await tick();const response=await new Promise(resolve=>listeners[0]({type:'scope:catalog-request'},{},resolve));assert.equal(response.error,undefined);assert.equal(requests,1);assert.equal((await state.store.get(actor)).catalog.find(b=>b.id==='2').group,'Seção P/3');}finally{w.close();}
});

test('trocar preferência ativa só o bloco escolhido e restaura a lista nativa ao sair',async()=>{
 const workerState=worker();await workerState.remember('2');
 const html='<title>Processos do Bloco Interno</title><h1>Processos do Bloco Interno</h1><a id="lnkUsuarioSistema" title="Pessoa Teste (pessoa/SEPM)" href="?infra_unidade_atual=1"></a><form id="frmRelBlocoProtocoloLista"><input id="txtDescricao" value="Pessoal"><div id="divInfraAreaPaginacaoSuperior"></div><table id="tblProtocolosBlocos"><tr><th>Processo</th><th>Tipo</th><th>Anotações</th><th>Ações</th></tr><tr><td><a href="?id_procedimento=100">SEI-350024/000100/2026</a></td><td>Tipo</td><td>Anotação</td><td><button id="native">Ação SEI</button></td></tr></table></form>';
 const dom=new JSDOM(html,{url:url('3'),runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,callbacks=[];
 w.SEI_ORGANIZADOR_CONFIG={unitId:'1',org:'SEPM'};w.chrome={runtime:{onMessage:{addListener:fn=>callbacks.push(fn)},sendMessage:msg=>workerState.send(msg,url('3'))}};
 try{
  for(const file of ['scope.js','history.js','theme.js','content.js'])w.eval(read(file));await tick();await tick();
  assert.equal(w.document.querySelector('#sei-organizador'),null);assert.equal(w.document.querySelector('#sei-work-scope-notice'),null);assert.equal(workerState.requests.length,0);
  await workerState.call({type:'scope:set',profile:'1:SEPM:pessoa',block:'3'},options);callbacks.forEach(fn=>fn({type:'scope:changed'}, {},()=>{}));await tick();await tick();
  assert.ok(w.document.querySelector('#sei-organizador'));assert.equal(w.document.querySelectorAll('.so-copy-number').length,1);
  await workerState.call({type:'scope:set',profile:'1:SEPM:pessoa',block:'2'},options);callbacks.forEach(fn=>fn({type:'scope:changed'}, {},()=>{}));await tick();
  assert.equal(w.document.querySelector('#sei-organizador'),null);assert.equal(w.document.querySelectorAll('.so-copy-number').length,0);assert.ok(w.document.querySelector('#native'));assert.equal(w.document.querySelector('#sei-work-scope-notice'),null);
 }finally{w.close();}
});

test('opções identificam usuário, mostram blocos e salvam a escolha',async()=>{
 const state=worker();await state.remember('2');await state.remember('3');
 const dom=new JSDOM(read('options.html'),{url:options,runScripts:'outside-only'}),w=dom.window;
 w.chrome={runtime:{sendMessage:msg=>state.send(msg,options)},tabs:{query:async()=>[]}};
 try{w.eval(read('options.js'));await tick();const select=w.document.querySelector('#block');assert.equal(select.options.length,2);assert.equal(select.value,'2');select.value='3';w.document.querySelector('#save').click();await tick();assert.equal((await state.store.get(actor)).block,'3');assert.match(w.document.querySelector('#status').textContent,/Bloco 3 salvo/);}finally{w.close();}
});

test('consulta completa limpa só classificações ausentes do mesmo bloco e conserva histórico',()=>{
 const store=createStore(':memory:');const user={login:'pessoa',org:'SEPM'};
 try{
  let s=store.mutate('1','2',0,user,{type:'create',name:'Assunto'});const tab=s.tabs[0].id;
  s=store.mutate('1','2',s.version,user,{type:'assign',tabId:tab,processIds:['100','200']});
  s=store.mutate('1','2',s.version,user,{type:'status',status:'sign',processIds:['100','200']});const original=store.history('1','2')[0].id;
  store.mutate('1','3',0,user,{type:'status',status:'urgent',processIds:['100']});
  let snapshot=store.alerts.snapshot('1','2',{version:0,ids:['100','200']});
  assert.throws(()=>store.alerts.snapshot('1','2',{version:0,ids:['200']}),e=>e.status===409);assert.equal(store.read('1','2').statuses['100'],'sign');
  snapshot=store.alerts.snapshot('1','2',{version:snapshot.version,ids:['200']});s=store.read('1','2');
  assert.equal(s.statuses['100'],undefined);assert.equal(s.assignments['100'],undefined);assert.equal(s.statuses['200'],'sign');assert.deepEqual(s.assignments['200'],[tab]);assert.equal(s.tabs.length,1);assert.equal(store.read('1','3').statuses['100'],'urgent');
  const history=store.history('1','2');assert.equal(history[0].action.type,'departed');assert.equal(history[0].undoable,false);
  assert.throws(()=>store.mutate('1','2',s.version,user,{type:'undo',historyId:original}),e=>e.status===409);
  snapshot=store.alerts.snapshot('1','2',{version:snapshot.version,ids:['100','200']});assert.equal(store.read('1','2').statuses['100'],undefined);assert.equal(store.history('1','2').length,history.length);
 }finally{store.close();}
});

test('abertura e presença ficam isoladas por bloco mesmo para o mesmo processo',()=>{
 const store=createStore(':memory:');try{
  for(const block of ['2','3'])store.alerts.snapshot('1',block,{version:0,ids:['100'],pendingIds:['100']});
  store.alerts.opened('1','100',{login:'pessoa'},'2');assert.equal(store.alerts.read('1','2').entries['100'].seen,true);assert.equal(store.alerts.read('1','3').entries['100'].seen,false);
  const payload={session:'11111111-1111-4111-8111-111111111111',document:'11',number:'555',actor,block:'2'};
  store.editing.update('1','100',payload);assert.equal(store.editing.query('1',['100'],'2').entries.length,1);assert.equal(store.editing.query('1',['100'],'3').entries.length,0);
 }finally{store.close();}
});

test('primeira consulta completa limpa vínculos antigos ausentes; dados inválidos e chamadas manuais não limpam',()=>{
 const store=createStore(':memory:');try{const user={login:'pessoa',org:'SEPM'};let state=store.mutate('1','2',0,user,{type:'status',status:'urgent',processIds:['100']});
  assert.throws(()=>store.alerts.snapshot('1','2',{version:0,ids:['200','200']}));assert.equal(store.read('1','2').statuses['100'],'urgent');
  assert.throws(()=>store.mutate('1','2',state.version,user,{type:'departed',processIds:['100']}));assert.equal(store.read('1','2').statuses['100'],'urgent');
  store.alerts.snapshot('1','2',{version:0,ids:['200']});state=store.read('1','2');assert.equal(state.statuses['100'],undefined);const count=store.history('1','2').length;
  store.alerts.snapshot('1','2',{version:1,ids:['200']});assert.equal(store.history('1','2').length,count);
 }finally{store.close();}
});
