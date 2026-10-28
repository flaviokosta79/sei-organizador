import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {createStore} from '../server/store.js';
const read=name=>readFileSync(new URL('../extension/'+name,import.meta.url),'utf8');
const native=n=>readFileSync(new URL(`../referencias/amostras/controle-processos-pagina-${n}.html`,import.meta.url));
const base='https://sei.rj.gov.br/sei/controlador.php', unit='120000124';
const control=base+'?acao=procedimento_controlar&infra_unidade_atual='+unit+'&infra_hash=session-only';
const identity={unit,org:'SEPM',login:'secretaria'};
const item=(id,pending=true)=>({id,number:`SEI-350024/${id.padStart(6,'0')}/2026`,pending,url:base+`?acao=procedimento_trabalhar&id_procedimento=${id}&infra_unidade_atual=${unit}&infra_hash=private-session`});
const data=(version,items,extra={})=>({version,items,complete:true,block:'1396',actor:identity,...extra});
function reader(fetch){
 const dom=new JSDOM('',{url:control,runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{fetch,TextDecoder,AbortSignal,AbortController,SEI_ORGANIZADOR_CONFIG:{unitId:unit}});w.eval(read('receipts-data.js'));return {dom,w,D:w.seiSecretariatData};
}
const nativeDoc=(w,n)=>new w.DOMParser().parseFromString(new TextDecoder('windows-1252').decode(native(n)),'text/html');
function fixture(index,{total=217,pending=false,filtered=false}={}){
 const start=index*40+1,end=Math.min(total,start+39),items=Array.from({length:Math.max(0,end-start+1)},(_,i)=>item(String(900000+start+i),pending&&i===0));
 return `<title>Controle de Processos</title><form id="frmProcedimentoControlar" action="${control}" method="post"><input name="hdnTipoVisualizacao" value="R"><input name="hdnMeusProcessos" value="${filtered?'M':'T'}"><input name="hdnRecebidosPaginaAtual" value="${index}"><input name="hdnRecebidosHashCriterios" value="19940c4a6dd93350f75cad197efba1f4"><input name="hdnGeradosPaginaAtual" value="0"><input name="hdnRecebidosItensSelecionados" value="selected"><input name="hdnGeradosItensSelecionados" value="selected"><input type="checkbox" name="chkRecebidosItem0" checked value="danger"><input name="hdnIdMarcador${unit}" value=""><input name="hdnIdTipoProcedimento${unit}" value=""><input name="hdnIdTipoPrioridade${unit}" value=""><table id="tblProcessosRecebidos"><caption>Processos recebidos (${total} registros${total?` - ${start} a ${end}`:''}):</caption><tr><th>Recebidos</th></tr>${items.map(p=>`<tr id="P${p.id}"><td><a class="${p.pending?'processoNaoVisualizado':'processoVisualizado'}" href="${p.url}">${p.number}</a></td></tr>`).join('')}</table></form>`;
}
const response=text=>new Response(text,{headers:{'content-type':'text/html; charset=utf-8'}});

test('HTMLs reais confirmam 80 processos únicos, dois não recebidos na primeira página e nenhum na segunda',()=>{
 const {dom,w,D}=reader();
 try{
  const a=D.parse(nativeDoc(w,1),control),b=D.parse(nativeDoc(w,2),control);
  assert.equal(a.total,217);assert.equal(a.page,0);assert.equal(a.start,1);assert.equal(a.end,40);assert.equal(a.items.length,40);assert.equal(a.items.filter(p=>p.pending).length,2);
  assert.equal(b.page,1);assert.equal(b.start,41);assert.equal(b.end,80);assert.equal(b.items.filter(p=>p.pending).length,0);assert.equal(new Set([...a.items,...b.items].map(p=>p.id)).size,80);
  const body=D.body(a.form,1);assert.equal(body.get('hdnRecebidosPaginaAtual'),'1');assert.equal(body.get('hdnGeradosPaginaAtual'),'0');assert.equal(body.get('hdnRecebidosHashCriterios'),a.criteria);assert.equal(body.get('hdnRecebidosItensSelecionados'),'');assert.equal(body.has('chkRecebidosItem0'),false);
  const sigiloso=a.items.find(p=>p.number.includes('SEI')&&!p.pending);assert.ok(sigiloso);
 }finally{dom.window.close();}
});

test('leitura completa percorre seis páginas e nunca consulta um processo',async()=>{
 const calls=[];let criteria;
 const {dom,w,D}=reader(async(url,options={})=>{
  assert.equal(new URL(url).searchParams.get('acao'),'procedimento_controlar');calls.push({url:String(url),options});
  const index=options.body?Number(options.body.get('hdnRecebidosPaginaAtual')):0;
  if(index<2)return new Response(native(index+1),{headers:{'content-type':'text/html; charset=iso-8859-1'}});
  assert.equal(options.body.get('hdnRecebidosHashCriterios'),criteria);assert.equal(options.body.get('hdnGeradosPaginaAtual'),'0');assert.equal(options.body.get('hdnRecebidosItensSelecionados'),'');
  return response(fixture(index,{pending:index===5}).replace('19940c4a6dd93350f75cad197efba1f4',criteria));
 });
 try{
  criteria=D.parse(nativeDoc(w,1),control).criteria;
  const result=await D.snapshot(control,new AbortController().signal);assert.equal(result.complete,true);assert.equal(result.items.length,217);assert.equal(result.items.filter(p=>p.pending).length,3);assert.equal(calls.length,6);assert.equal(calls[0].options.method,undefined);assert.ok(calls.slice(1).every(c=>c.options.method==='POST'));
 }finally{dom.window.close();}
});

test('listagem filtrada é normalizada sem alterar DOM visível; página repetida, parcial ou trocada é rejeitada',async()=>{
 let mode='normalize',calls=0;
 const {dom,w,D}=reader(async(url,options={})=>{
  calls++;
  if(mode==='normalize'){
   if(!options.body)return response(fixture(1,{total:80,filtered:true}));
   assert.equal(options.body.get('hdnMeusProcessos'),'T');assert.equal(options.body.get('hdnTipoVisualizacao'),'R');assert.equal(options.body.has('chkRecebidosItem0'),false);
   return response(fixture(Number(options.body.get('hdnRecebidosPaginaAtual')),{total:80}));
  }
  const index=options.body?Number(options.body.get('hdnRecebidosPaginaAtual')):0;
  if(mode==='repeat')return response(fixture(0,{total:80}));
  if(mode==='change')return response(fixture(index,{total:index?81:80}));
  return response(fixture(index,{total:80}).replace(/<tr id="P900080">[\s\S]*?<\/tr>/,''));
 });
 try{
  w.document.body.innerHTML=fixture(1,{total:80,filtered:true});const original=w.document.body.innerHTML;
  let result=await D.snapshot(control,new AbortController().signal);assert.equal(result.items.length,80);assert.equal(w.document.body.innerHTML,original);assert.equal(calls,3);
  mode='repeat';await assert.rejects(D.snapshot(control,new AbortController().signal),/mudou|repetid/);
  mode='change';await assert.rejects(D.snapshot(control,new AbortController().signal),/mudou/);
  mode='partial';await assert.rejects(D.snapshot(control,new AbortController().signal),/incompleta/);
  const unknown=nativeDoc(w,1);unknown.querySelector('a.processoNaoVisualizado').className='unknown';assert.throws(()=>D.parse(unknown,control),/não reconhecida/);
  const restricted=nativeDoc(w,1);restricted.querySelector('a.processoNaoVisualizado').className='processoNaoVisualizadoSigiloso processoVisitado';assert.equal(D.parse(restricted,control).items.filter(p=>p.pending).length,2);
  assert.throws(()=>D.address(base+'?acao=procedimento_trabalhar&infra_unidade_atual='+unit),/inválido/);
 }finally{dom.window.close();}
});

test('API separa recebimento de classificações, preserva tokens e rejeita listas antigas ou incompletas',()=>{
 const store=createStore(':memory:');
 try{
  store.mutate(unit,'1396',0,{login:'secretaria'},{type:'status',status:'urgent',processIds:['10']});
  let state=store.receipts.read(unit);assert.equal(state.initialized,false);
  state=store.receipts.snapshot(unit,data(0,[item('10')]));assert.equal(state.pending[0].baseline,true);const baseline=state.pending[0].token;
  state=store.receipts.snapshot(unit,data(state.version,[item('10'),item('20')]));assert.equal(state.pending.find(p=>p.id==='10').token,baseline);assert.equal(state.pending.find(p=>p.id==='20').baseline,false);const token=state.pending.find(p=>p.id==='20').token;
  assert.throws(()=>store.receipts.snapshot(unit,data(0,[])),e=>e.status===409);assert.throws(()=>store.receipts.snapshot(unit,data(state.version,[],{complete:false})));
  assert.equal(store.receipts.read(unit).pending.length,2);
  state=store.receipts.snapshot(unit,data(state.version,[item('10'),item('20',false)]));assert.equal(state.pending.length,1);
  state=store.receipts.snapshot(unit,data(state.version,[item('10'),item('20')]));assert.notEqual(state.pending.find(p=>p.id==='20').token,token);
  assert.equal(store.read(unit,'1396').statuses['10'],'urgent');assert.equal(store.history(unit,'1396').length,1);assert.equal(store.receipts.read('other').initialized,false);
  assert.throws(()=>store.receipts.snapshot(unit,data(state.version,[],{block:'1343'})),e=>e.status===403);
  assert.throws(()=>store.receipts.snapshot(unit,data(state.version,[item('10'),item('10')])));
  assert.throws(()=>store.receipts.snapshot(unit,data(state.version,[{...item('10'),pending:'yes'}])));
 }finally{store.close();}
});

test('pendências de recebimento persistem após reiniciar o banco',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-receipts-'));let store=createStore(join(dir,'db.sqlite'));
 try{const state=store.receipts.snapshot(unit,data(0,[item('10')]));store.close();store=createStore(join(dir,'db.sqlite'));assert.deepEqual(store.receipts.read(unit),state);}finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

function browser(store,{local={},session={}}={}){
 const listeners={},notices=[],sounds=[],opened=[];let offline=false,scope='1396',muted=false,notificationFails=false,audioFails=false;
 const event=name=>({addListener:fn=>listeners[name]=fn});const area=value=>({get:async key=>({[key]:key==='seiBlockAlerts'?{sound:!muted}:structuredClone(value[key])}),set:async v=>Object.assign(value,structuredClone(v))});
 const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:event('message')},storage:{local:area(local),session:area(session)},notifications:{create:async(id,data)=>{if(notificationFails)throw Error('negado');notices.push({id,data});},onClicked:event('notification')},tabs:{create:async v=>opened.push(v.url),onRemoved:event('removed'),onUpdated:event('updated')}};
 runInNewContext(read('receipts-background.js'),{chrome,URL,crypto,Date,AbortSignal,SEI_ORGANIZADOR_CONFIG:{unitId:unit,org:'SEPM',serviceUrl:'https://ext.5cpa.com.br'},seiWorkScopeStore:{requireBlock:async(a,b)=>{if(scope!==b)throw Error('Bloco não escolhido');}},seiPlayAlertSound:async id=>{if(audioFails)throw Error('áudio bloqueado');sounds.push(id);},fetch:async(url,options)=>{if(offline)throw Error('Offline');try{const state=options.body?store.receipts.snapshot(unit,JSON.parse(options.body)):store.receipts.read(unit);return {ok:true,json:async()=>state};}catch(e){return {ok:false,status:e.status||400};}}});
 const call=async(type,extra={},sender={tab:{url:control,id:1},frameId:0})=>{const result=await new Promise(resolve=>listeners.message({type,identity,...extra},sender,resolve));if(result.error)throw Error(result.error);return result.data;};
 const sync=(extra={})=>call('receipts:sync',{url:control,...extra});
 const poll=async(items)=>{const target=(await sync({poll:true})).poll;assert.ok(target);try{return await call('receipts:result',{lease:target.id,complete:true,items,url:control});}finally{await call('receipts:done',{lease:target.id});}};
 const due=()=>{for(const t of Object.values(session.seiSecretariatReceiptTargets || {}))t.lastPoll=0;};
 return {call,sync,poll,due,notices,sounds,opened,listeners,local,session,set offline(v){offline=v;},set scope(v){scope=v;},set muted(v){muted=v;},set notificationFails(v){notificationFails=v;},set audioFails(v){audioFails=v;}};
}

test('dois navegadores recebem uma vez, primeira leitura é silenciosa e recebimento confirmado retira pendência dos dois',async()=>{
 const store=createStore(':memory:');const a=browser(store),b=browser(store);
 try{
  let view=await a.poll([item('10')]);assert.equal(view.pending.length,1);assert.equal(a.sounds.length,0);await b.sync();
  a.due();view=await a.poll([item('10'),item('20')]);assert.equal(a.sounds[0],'novosei');assert.equal(a.notices.length,1);assert.match(a.notices[0].data.title,/Secretaria/);
  view=await b.sync();assert.equal(view.pending.length,2);assert.equal(b.sounds.length,1);await b.sync();assert.equal(b.sounds.length,1);
  a.due();await a.poll([item('10',false),item('20',false)]);assert.equal((await b.sync()).pending.length,0);
  a.due();await a.poll([item('10'),item('20',false)]);assert.equal(a.sounds.length,2);assert.equal((await b.sync()).pending.length,1);assert.equal(b.sounds.length,2);
  const restarted=browser(store,{local:b.local,session:b.session});await restarted.sync();assert.equal(restarted.sounds.length,0);
  b.listeners.notification(b.notices[0].id);await new Promise(r=>setTimeout(r,10));assert.equal(b.opened[0],control);assert.ok(!b.opened.some(url=>url.includes('procedimento_trabalhar')));
 }finally{store.close();}
});

test('falhas, concorrência e troca de bloco não limpam pendências nem permitem notificações fora da Secretaria',async()=>{
 const store=createStore(':memory:');const a=browser(store),b=browser(store);
 try{
  await a.poll([item('10')]);await b.sync();a.due();const first=(await a.sync({poll:true})).poll;assert.ok(first);assert.equal((await a.sync({poll:true})).poll,null);
  const competing=(await b.sync({poll:true})).poll;await b.call('receipts:result',{lease:competing.id,complete:true,items:[item('10'),item('20')],url:control});await b.call('receipts:done',{lease:competing.id});
  let view=await a.call('receipts:result',{lease:first.id,complete:true,items:[],url:control});assert.match(view.error,/substituída/);assert.equal(view.pending.length,1);assert.equal(store.receipts.read(unit).pending.length,2);await a.call('receipts:done',{lease:first.id});
  view=await a.sync();assert.equal(view.pending.length,2);a.offline=true;view=await a.sync();assert.equal(view.pending.length,2);assert.match(view.error,/Offline/);a.offline=false;
  a.due();const target=(await a.sync({poll:true})).poll;view=await a.call('receipts:result',{lease:target.id,error:'Paginação incompleta'});assert.equal(view.pending.length,2);assert.match(view.error,/incompleta/);
  await assert.rejects(a.call('receipts:result',{lease:target.id,complete:false,items:[]}),/completa/);
  a.scope='1343';await assert.rejects(a.sync(),/não escolhido/);await assert.rejects(a.call('receipts:result',{lease:target.id,complete:true,items:[]}),/não escolhido/);assert.equal(store.receipts.read(unit).pending.length,2);
  a.scope='1396';await assert.rejects(a.call('receipts:sync',{}, {tab:{url:'https://evil.test'},frameId:0}),/Origem/);await assert.rejects(a.call('receipts:sync',{}, {tab:{url:control},frameId:1}),/Origem/);
 }finally{store.close();}
});

test('silenciamento preserva aviso visual e falhas de áudio/notificação ficam explícitas',async()=>{
 const store=createStore(':memory:');const a=browser(store);
 try{await a.poll([]);a.due();a.muted=true;let v=await a.poll([item('10')]);assert.equal(v.pending.length,1);assert.equal(a.sounds.length,0);assert.equal(a.notices.length,1);
  a.due();a.muted=false;a.notificationFails=true;a.audioFails=true;v=await a.poll([item('10'),item('20')]);assert.equal(v.pending.length,2);assert.match(v.notificationError,/indisponível/);assert.match(v.soundError,/bloqueado/);
 }finally{store.close();}
});

test('painel da Secretaria mostra pendência sem botão de visto e não consulta recebidos em outro bloco',async()=>{
 const dom=new JSDOM('<a id="lnkInfraUnidade">SEPM/5°CPA</a>',{url:control,runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window,calls=[];
 let pending=[item('10')];
 const listeners=[];
 w.seiBlockMonitor={context:()=>identity};w.seiWorkScope={block:'1343'};w.seiOrganizerSettings=()=>({mount(){},reset(){},dispose(){}});
 w.seiSecretariatData={source:()=>control,snapshot:()=>{throw Error('Sem autorização de consulta');}};
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async msg=>{calls.push(msg.type);return {data:msg.type==='receipts:sync'?{pending,url:control,checked:Date.now(),initialized:true}:{records:[],sound:true}};}}};
 const wait=()=>new Promise(r=>setTimeout(r,90));
 try{
  w.eval(read('monitor.js'));await wait();assert.ok(!calls.includes('receipts:sync'));
  w.seiWorkScope.block='1396';w.dispatchEvent(new w.Event('sei-organizador:scope'));await wait();
  let root=w.document.querySelector('#sei-organizador-alertas').shadowRoot;assert.match(root.textContent,/Secretaria · 1 para receber/);assert.equal(root.querySelector('li a').href,item('10').url);assert.equal(root.querySelector('button'),null);assert.match(root.textContent,/registrar o recebimento/);
  pending=[];listeners[0]({type:'monitor:tick'});await wait();assert.match(root.textContent,/Nenhum processo aguardando recebimento/);
  w.seiWorkScope.block='1343';w.dispatchEvent(new w.Event('sei-organizador:scope'));await wait();root=w.document.querySelector('#sei-organizador-alertas').shadowRoot;assert.doesNotMatch(root.textContent,/Secretaria/);
 }finally{w.close();}
});

test('consulta de zero recebidos é válida e mudanças de estado entre tokens não confundem visto com recebimento',async()=>{
 const {dom,D}=reader(async()=>response(fixture(0,{total:0})));
 try{const result=await D.snapshot(control,new AbortController().signal);assert.equal(result.items.length,0);assert.equal(result.complete,true);}finally{dom.window.close();}
 const store=createStore(':memory:');const a=browser(store);
 try{
  await a.poll([item('10')]);store.alerts.opened(unit,'10',identity,'1396');assert.equal((await a.sync()).pending.length,1);
  a.due();const lease=(await a.sync({poll:true})).poll;
  await assert.rejects(a.call('receipts:result',{lease:lease.id,complete:true,items:[{...item('20'),url:'https://evil.test'}],url:control}),/inválido/);
  assert.equal(store.receipts.read(unit).pending.length,1);
 }finally{store.close();}
});

test('integração do monitor lê seis páginas, exibe estoque e avisa nova chegada sem abrir processos',async()=>{
 const store=createStore(':memory:'),backend=browser(store),requests=[];let stage=0,criteria;
 const {dom,w,D}=reader(async(url,options={})=>{
  requests.push(String(url));assert.equal(new URL(url).searchParams.get('acao'),'procedimento_controlar');
  const index=options.body?Number(options.body.get('hdnRecebidosPaginaAtual')):0;
  if(index<2){
   const doc=nativeDoc(w,index+1);if(index===0&&stage)doc.querySelector('#tblProcessosRecebidos a.processoVisualizado').className='processoNaoVisualizado';
   return response(doc.documentElement.outerHTML);
  }
  return response(fixture(index,{pending:index===5}).replace('19940c4a6dd93350f75cad197efba1f4',criteria));
 });
 const listeners=[];
 w.document.body.innerHTML=nativeDoc(w,1).body.innerHTML;
 criteria=D.parse(nativeDoc(w,1),control).criteria;
 w.seiWorkScope={block:'1396'};w.seiBlockMonitor={context:()=>identity};w.seiOrganizerSettings=()=>({mount(){if(!w.document.querySelector('#sei-organizador-settings-button')){const b=w.document.createElement('button');b.id='sei-organizador-settings-button';w.document.body.append(b);}},reset(){},dispose(){}});
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async msg=>({data:msg.type.startsWith('receipts:')?await backend.call(msg.type,msg):{records:[],sound:true}})}};
 const waitFor=async fn=>{const until=Date.now()+6000;while(Date.now()<until){if(fn())return;await new Promise(r=>setTimeout(r,20));}assert.fail('Monitor não terminou a leitura: '+JSON.stringify({panel:w.document.querySelector('#sei-organizador-alertas')?.shadowRoot.querySelector('section')?.textContent,error:Object.values(backend.local.seiSecretariatReceipts || {}).map(r=>r.error),requests:requests.length}));};
 try{
  w.eval(read('monitor.js'));await waitFor(()=>w.document.querySelector('#sei-organizador-alertas')?.shadowRoot.textContent.includes('Secretaria · 3 para receber'));
  assert.equal(backend.sounds.length,0);assert.equal(store.receipts.read(unit).pending.length,3);assert.equal(requests.length,6);
  stage=1;backend.due();listeners[0]({type:'monitor:tick'});await waitFor(()=>w.document.querySelector('#sei-organizador-alertas').shadowRoot.textContent.includes('Secretaria · 4 para receber'));
  assert.equal(backend.sounds.length,1);assert.equal(backend.notices.length,1);assert.equal(requests.length,12);
  assert.ok(!JSON.stringify(store.receipts.read(unit)).includes('infra_hash'));assert.ok(!JSON.stringify(backend.local).includes('infra_hash'));
 }finally{w.close();store.close();}
});
