import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {createStore} from '../server/store.js';
const read=file=>readFileSync(new URL('../extension/'+file,import.meta.url),'utf8');
const base='https://sei.rj.gov.br/sei/controlador.php';
const identity={unit:'1',org:'SEPM',login:'pessoa',name:'Pessoa Teste'};
const session='11111111-1111-4111-8111-111111111111';
const payload=(extra={})=>({session,document:'901',number:'555',actor:identity,activityAgeMs:null,...extra});
const header='<a id="lnkUsuarioSistema" title="Pessoa Teste (pessoa/SEPM)" href="?infra_unidade_atual=1"></a>';
const editorUrl=base+'?acao=editor_montar&id_procedimento=900&id_documento=901&infra_unidade_atual=1&infra_hash=private';
const tick=()=>new Promise(r=>setTimeout(r,140));

test('presença distingue editor aberto de atividade recente, expira e não altera classificações',(t)=>{
 t.mock.timers.enable({apis:['Date'],now:1800000000000});const store=createStore(':memory:');try{
  store.editing.update('1','900',payload());let result=store.editing.query('1',['900']);assert.equal(result.entries.length,1);assert.equal(result.entries[0].activityAt,null);
  t.mock.timers.tick(20000);store.editing.update('1','900',payload({activityAgeMs:3000}));result=store.editing.query('1',['900']);assert.equal(result.serverTime-result.entries[0].activityAt,3000);
  assert.equal(store.editing.query('2',['900']).entries.length,0);assert.equal(store.editing.query('1',['999']).entries.length,0);
  t.mock.timers.tick(90001);assert.equal(store.editing.query('1',['900']).entries.length,0);
  assert.equal(store.read('1','900').version,0);assert.equal(store.history('1','900').length,0);
 }finally{store.close();}
});

test('múltiplos editores e janelas são independentes e fechar uma janela preserva a outra',()=>{
 const store=createStore(':memory:');try{
  store.editing.update('1','900',payload());store.editing.update('1','900',payload({session:'22222222-2222-4222-8222-222222222222',activityAgeMs:10}));
  let result=store.editing.query('1',['900']);assert.equal(result.entries.length,1);assert.notEqual(result.entries[0].activityAt,null);
  store.editing.update('1','900',payload({session:'33333333-3333-4333-8333-333333333333',actor:{...identity,login:'colega',name:'Colega'}}));
  assert.equal(store.editing.query('1',['900']).entries.length,2);
  store.editing.update('1','900',payload({stop:true}));assert.equal(store.editing.query('1',['900']).entries.length,2);
  store.editing.update('1','900',payload({session:'22222222-2222-4222-8222-222222222222',stop:true}));result=store.editing.query('1',['900']);assert.equal(result.entries.length,1);assert.equal(result.entries[0].actor.login,'colega');
 }finally{store.close();}
});

test('presença valida dados, limites, documento, unidade e consultas',()=>{
 const store=createStore(':memory:');try{
  for(const data of [{session:'x'},{document:'x'},{number:'<script>'},{activityAgeMs:-1},{activityAgeMs:60001},{actor:{...identity,login:''}},{actor:{...identity,name:'x'.repeat(151)}}])assert.throws(()=>store.editing.update('1','900',payload(data)));
  for(const ids of [[],['x'],['900','900'],Array.from({length:1001},(_,i)=>String(i))])assert.throws(()=>store.editing.query('1',ids));
  assert.equal(store.editing.query('1',['900']).entries.length,0);
 }finally{store.close();}
});

test('worker rejeita presença fora do editor e não envia links, cookies ou campos extras',async()=>{
 let listener;const requests=[];
 runInNewContext(read('editing-background.js'),{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM',serviceUrl:'https://ext.5cpa.com.br'},URL,AbortSignal,chrome:{runtime:{onMessage:{addListener:fn=>listener=fn}}},fetch:async(url,options)=>{requests.push({url:String(url),options});return {ok:true,json:async()=>({ok:true})};}});
 const send=(msg,url=editorUrl)=>new Promise(r=>listener({identity,type:'editing:heartbeat',session,process:'900',document:'901',number:'555',...msg},{url,tab:{url:base},frameId:0},r));
 assert.ok((await send({},base+'?acao=documento_visualizar')).error);assert.ok((await send({document:'902'})).error);assert.ok((await send({identity:{...identity,unit:'2'}})).error);
 assert.equal(requests.length,0);assert.equal((await send({text:'CONTEUDO_SECRETO',url:editorUrl})).error,undefined);
 const request=requests[0];assert.equal(request.options.credentials,'omit');assert.equal(request.options.referrerPolicy,'no-referrer');assert.equal(JSON.stringify(request).includes('CONTEUDO_SECRETO'),false);assert.equal(JSON.stringify(request).includes('private'),false);assert.equal(JSON.parse(request.options.body).actor.login,'pessoa');
});

function client({url=editorUrl,html=header+'<title>SEI/ERJ - 555 - Despacho</title><div contenteditable="true"></div>',store=createStore(':memory:')}={}){
 const dom=new JSDOM(html,{url,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[],intervals=[];let offline=false;
 w.SEI_ORGANIZADOR_CONFIG={unitId:'1',org:'SEPM'};
 w.setInterval=fn=>{intervals.push(fn);return intervals.length;};w.clearInterval=()=>{};
 w.chrome={runtime:{sendMessage:async msg=>{calls.push(msg);if(offline)throw Error('Offline');try{return {data:msg.type==='editing:query'?store.editing.query('1',msg.processIds):store.editing.update('1',msg.process,{...msg,actor:msg.identity})};}catch(e){return {error:e.message};}}}};
 const start=()=>w.eval(read('editing.js'));
 return {dom,w,calls,store,start,intervals,set offline(value){offline=value;},close:()=>{w.dispatchEvent(new w.PageTransitionEvent('pagehide'));w.close();store.close();}};
}

test('editor envia presença e atividade sem capturar texto; pagehide encerra a sessão',async()=>{
 const f=client();try{f.start();await tick();assert.equal(f.store.editing.query('1',['900']).entries.length,1);
  const editor=f.w.document.querySelector('[contenteditable]');editor.textContent='TEXTO_PRIVADO_QUE_NAO_PODE_SAIR';editor.dispatchEvent(new f.w.Event('input',{bubbles:true}));f.intervals[0]();await tick();
  const heartbeats=f.calls.filter(m=>m.type==='editing:heartbeat');assert.ok(heartbeats.some(m=>m.activityAgeMs!==null&&m.activityAgeMs>=0));assert.equal(JSON.stringify(f.calls).includes('TEXTO_PRIVADO'),false);assert.equal(JSON.stringify(f.calls).includes('infra_hash'),false);
  f.w.dispatchEvent(new f.w.PageTransitionEvent('pagehide'));await tick();assert.equal(f.store.editing.query('1',['900']).entries.length,0);
 }finally{f.close();}
});

test('aviso de edição na lista só aparece no bloco escolhido',async()=>{
 const f=client({url:base+'?acao=rel_bloco_protocolo_listar&id_bloco=3&infra_unidade_atual=1',html:header+'<table id="tblProtocolosBlocos"><tr><td><a href="?id_procedimento=900">Processo 900</a></td></tr></table>'});
 try{let block='2';f.w.seiWorkScope={get block(){return block;},allows:id=>id===block};f.store.editing.update('1','900',payload({block:'3'}));f.start();await tick();assert.equal(f.calls.length,0);assert.equal(f.w.document.querySelector('.so-editing-presence'),null);
  block='3';f.w.dispatchEvent(new f.w.Event('sei-organizador:scope'));await tick();await tick();assert.ok(f.w.document.querySelector('.so-editing-presence'));
  block='2';f.w.dispatchEvent(new f.w.Event('sei-organizador:scope'));await tick();assert.equal(f.w.document.querySelector('.so-editing-presence'),null);
 }finally{f.close();}
});

test('visualização, editor ainda vazio e outra unidade não registram edição',async()=>{
 for(const options of [{url:base+'?acao=documento_visualizar&id_procedimento=900&id_documento=901&infra_unidade_atual=1'},{html:header+'<p>Carregando editor</p>'},{html:header.replace('infra_unidade_atual=1','infra_unidade_atual=2')+'<div contenteditable="true"></div>'}]){
  const f=client(options);try{f.start();await tick();assert.equal(f.calls.filter(m=>m.type==='editing:heartbeat').length,0);}finally{f.close();}
 }
});

test('detecta editor tardio, iframe editável e identidade herdada da janela de origem',async()=>{
 const f=client({html:'<title>Editor</title><iframe></iframe>'});const opener=new JSDOM(header,{url:base+'?infra_unidade_atual=1'});
 try{Object.defineProperty(f.w,'opener',{value:opener.window,configurable:true});f.start();await tick();assert.equal(f.calls.length,0);
  const doc=f.w.document.querySelector('iframe').contentDocument;doc.body.innerHTML='<div contenteditable="true"></div>';f.intervals[0]();await tick();
  assert.equal(f.store.editing.query('1',['900']).entries.length,1);doc.querySelector('div').dispatchEvent(new f.w.Event('input',{bubbles:true}));f.intervals[0]();await tick();assert.ok(f.calls.some(m=>m.activityAgeMs!==null&&m.activityAgeMs>=0));
 }finally{f.close();opener.window.close();}
});

test('bloco e card mostram vários colegas sem duplicar avisos; expiração e falha removem estado antigo',async(t)=>{
 const f=client({url:base+'?acao=rel_bloco_protocolo_listar&infra_unidade_atual=1',html:header+'<table id="tblProtocolosBlocos"><tr><td><a href="?id_procedimento=900">Processo 900</a><button>Copiar</button></td></tr></table><div id="sei-organizador-documento" data-process="900"></div>'});
 try{
  const root=f.w.document.querySelector('#sei-organizador-documento').attachShadow({mode:'open'});root.innerHTML='<ul><li class="activity-section">Última movimentação</li></ul>';
  f.store.editing.update('1','900',payload({activityAgeMs:0}));f.store.editing.update('1','900',payload({session:'22222222-2222-4222-8222-222222222222',actor:{...identity,name:'Colega',login:'colega'}}));
  f.start();await tick();await tick();assert.ok(f.w.document.querySelector('.so-editing-presence'),JSON.stringify({calls:f.calls,root:root.innerHTML}));assert.match(f.w.document.querySelector('.so-editing-presence').textContent,/Pessoa Teste.*edição recente/);assert.match(root.querySelector('.editing-presence').textContent,/Colega.*editor aberto/);
  for(let i=0;i<3;i++){f.intervals[0]();await tick();}assert.equal(f.w.document.querySelectorAll('.so-editing-presence').length,1);assert.equal(root.querySelectorAll('.editing-presence').length,1);assert.equal(f.w.document.querySelectorAll('button').length,1);
  f.offline=true;f.intervals[0]();await tick();assert.match(root.querySelector('.editing-presence').textContent,/sincronização indisponível/);
  // Expire cached records using the view's clock, without a network round trip.
  const original=f.w.Date.now;f.w.Date.now=()=>original()+100000;f.intervals[0]();await tick();assert.equal(f.w.document.querySelector('.so-editing-presence'),null);assert.doesNotMatch(root.querySelector('.editing-presence').textContent,/Pessoa Teste|Colega/);
 }finally{f.close();}
});

test('documento de visualização não instala observador ou temporizador de presença',async()=>{
 const f=client({url:base+'?acao=documento_visualizar&id_documento=901&infra_unidade_atual=1'});try{
  let observers=0;const Original=f.w.MutationObserver;f.w.MutationObserver=class extends Original{constructor(callback){super(callback);observers++;}};
  f.start();f.w.document.body.append(f.w.document.createElement('p'));await tick();
  assert.equal(observers,0);assert.equal(f.intervals.length,0);assert.equal(f.calls.length,0);
 }finally{f.close();}
});
