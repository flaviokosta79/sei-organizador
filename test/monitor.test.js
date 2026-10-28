import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {createStore} from '../server/store.js';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const base='https://sei.rj.gov.br/sei/controlador.php';
const blockUrl=`${base}?acao=rel_bloco_protocolo_listar&id_bloco=2&infra_unidade_atual=1&infra_hash=signed`;
const identity={unit:'1',org:'SEPM',login:'teste'};
const item=id=>({id,number:`SEI-350024/${id}/2026`,url:`${base}?acao=procedimento_trabalhar&id_procedimento=${id}&infra_unidade_atual=1&infra_hash=process-signed`});
const header='<a id="lnkUsuarioSistema" title="Pessoa (teste/SEPM)" href="?infra_unidade_atual=1"></a>';
function html(ids,{page=0,total=ids.length,search='',title='Processos do Bloco Interno'}={}){
 return `<title>${title}</title><h1>${title}</h1>${header}<form id="frmRelBlocoProtocoloLista" action="${blockUrl}"><input name="txtDescricao" id="txtDescricao" value="Bloco de teste" disabled><input id="txtPalavrasPesquisaRelBlocoProtocolo" name="txtPalavrasPesquisaRelBlocoProtocolo" value="${search}"><input name="hdnInfraPaginaAtual" value="${page}"><input name="hdnInfraItensSelecionados" value="selecionado"><table id="tblProtocolosBlocos"><caption>Lista de Processos (${total} registros)</caption><tr><th>Processo</th></tr>${ids.map(id=>`<tr><td><a href="${item(id).url}">${item(id).number}</a></td></tr>`).join('')}</table></form>`;
}
function reader(fetch){
 const dom=new JSDOM('',{url:blockUrl,runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{fetch,TextDecoder,AbortSignal,SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}});
 w.eval(read('monitor-data.js'));return {D:w.seiBlockMonitor,dom};
}
const response=html=>new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
const target={block:'2',url:blockUrl};
const plain=v=>JSON.parse(JSON.stringify(v));
function worker({local={},session={},sharedFetch,scopeStore}={}){
 const listeners={},notices=[],sounds=[],tabs=[],badges=[];
 const event=name=>({addListener:fn=>listeners[name]=fn});
 const area=data=>({get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))});
 let notifyFails=false,audioFails=false,readyFailures=0,readyAttempts=0,organizer={version:0,statuses:{},history:[]};
 const chrome={
  runtime:{onMessage:event('message'),getURL:p=>'chrome-extension://test/'+p,getContexts:async()=>[],sendMessage:async msg=>{if(msg.type==='monitor:audio-ready'){readyAttempts++;if(readyFailures-->0)throw Error('Ainda iniciando');return {ready:true};}sounds.push(msg);return audioFails?{error:'Sem áudio'}:{ok:true};},openOptionsPage:async()=>{}},
  storage:{local:area(local),session:area(session)},
  action:{setBadgeText:async b=>badges.push(b.text),setBadgeBackgroundColor:async()=>{},onClicked:event('action')},
  offscreen:{createDocument:async()=>{}},windows:{update:async()=>{}},
  notifications:{create:async(id,data)=>{if(notifyFails)throw Error('Negado');notices.push({id,data});},clear:async()=>true,onClicked:event('notification')},
  alarms:{onAlarm:event('alarm'),get:async()=>null,create:async()=>{}},
  tabs:{query:async()=>[{id:5,windowId:1}],sendMessage:async(id,msg)=>{tabs.push({id,msg});},create:async data=>tabs.push(data),update:async()=>{},onRemoved:event('removed'),onUpdated:event('updated')}
 };
 runInNewContext(read('monitor-sounds.js')+';'+read('monitor-sign.js')+';'+read('monitor-background.js'),{chrome,URL,crypto,Date,setTimeout,AbortSignal,fetch:sharedFetch,seiWorkScopeStore:scopeStore,SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM',...(sharedFetch?{serviceUrl:'https://ext.5cpa.com.br'}:{})}});
 const send=(msg,{tabId=5,url=base,frameId=0}={})=>msg.type==='api'?Promise.resolve({data:msg.history?organizer.history:{version:organizer.version,statuses:organizer.statuses}}):new Promise(resolve=>listeners.message({identity,...msg},{tab:{id:tabId,url},frameId},resolve));
 const call=async(msg,options)=>{const result=await send(msg,options);if(result.error)throw Error(result.error);return result.data;};
 const poll=options=>call({type:'monitor:sync',poll:true,force:true,registration:{block:'2',url:blockUrl,name:'Teste'}},options);
 return {local,session,listeners,notices,sounds,tabs,badges,send,call,poll,set notifyFails(v){notifyFails=v;},set audioFails(v){audioFails=v;},set readyFailures(v){readyFailures=v;},get readyAttempts(){return readyAttempts;},set organizer(v){organizer=v;}};
}

test('dois navegadores compartilham vistos, rejeitam aberturas falsas e retomam fila offline',async()=>{
 const store=createStore(':memory:');let offline=false;const requests=[];
 const sharedFetch=async(url,options={})=>{
  if(offline)throw Error('Offline');requests.push({url:String(url),options});const path=new URL(url).pathname;
  const body=options.body?JSON.parse(options.body):null;
  try{
   const match=path.match(/blocks\/(\d+)\/alerts/);let data;
   if(match)data=body?store.alerts.snapshot('1',match[1],body):store.alerts.read('1',match[1]);
   else data=store.alerts.opened('1',path.match(/processes\/(\d+)\/opened/)[1],body.actor);
   return {ok:true,json:async()=>data};
  }catch(e){return {ok:false,status:e.status||400};}
 };
 const a=worker({sharedFetch}),b=worker({sharedFetch});
 const snapshot=async(f,ids)=>{const poll=(await f.poll()).poll;try{return await f.call({type:'monitor:result',block:'2',lease:poll.id,sharedVersion:poll.targets[0].sharedVersion,items:ids.map(item)});}finally{await f.call({type:'monitor:done',lease:poll.id});}};
 try{
  await snapshot(a,['100']);await snapshot(b,['100']);
  let view=await snapshot(a,['100','200']);assert.equal(view.records[0].pending[0].id,'200');
  view=await snapshot(b,['100','200']);assert.equal(view.records[0].pending[0].id,'200');
  await assert.rejects(b.call({type:'monitor:opened',process:'200'}),/Processo aberto inválido/);
  await assert.rejects(b.call({type:'monitor:opened',process:'201'},{url:item('200').url}),/Processo aberto inválido/);
  await b.call({type:'monitor:opened',process:'200'},{url:item('200').url});
  view=await a.call({type:'monitor:sync'});assert.equal(view.records[0].pending.length,0);assert.equal(a.badges.at(-1),'');
  await snapshot(a,['100','200','300']);offline=true;
  await b.call({type:'monitor:opened',process:'300'},{url:item('300').url});assert.ok(Object.keys(b.local.seiBlockAlerts.openQueue).length);
  view=await a.call({type:'monitor:sync'});assert.match(view.records[0].sharedError,/Offline/);assert.equal(view.records[0].pending[0].id,'300');
  offline=false;await b.call({type:'monitor:sync'});assert.equal(Object.keys(b.local.seiBlockAlerts.openQueue).length,0);
  view=await a.call({type:'monitor:sync'});assert.equal(view.records[0].pending.length,0);
  for(const request of requests){assert.equal(request.options.credentials,'omit');assert.equal(request.url.includes('infra_hash'),false);assert.equal(request.options.body?.includes('infra_hash')||false,false);}
 }finally{store.close();}
});

test('abrir processo no SEI envia reconhecimento, lista e sessão fora da unidade não enviam',async()=>{
 for(const [url,markup,expected] of [[item('200').url,header,1],[blockUrl,header,0],[item('200').url,header.replace('infra_unidade_atual=1','infra_unidade_atual=2'),0]]){
  const dom=new JSDOM(markup,{url,runScripts:'outside-only'}),w=dom.window,messages=[],listeners=[];
  Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'},AbortSignal,AbortController,TextDecoder});
  w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async msg=>{messages.push(msg);return {data:{sound:true,records:[]}};}}};
  try{
   for(const file of ['monitor-data.js','monitor-sounds.js','monitor-settings.js','monitor.js'])w.eval(read(file));
   await new Promise(r=>setTimeout(r,30));listeners[0]?.({type:'monitor:tick'});await new Promise(r=>setTimeout(r,30));
   const opened=messages.filter(m=>m.type==='monitor:opened');assert.equal(opened.length,expected);if(expected)assert.equal(opened[0].process,'200');
  }finally{w.close();}
 }
});

test('monitor mostra e consulta somente o bloco de trabalho e troca sem conservar a consulta antiga',async()=>{
 let block='2';const scopeStore={get:async()=>({block}),requireBlock:async(identity,id)=>{if(id!==block)throw Error('Outro bloco');}};
 const f=worker({scopeStore});let view=await f.poll();assert.equal(view.records.length,1);assert.equal(view.poll.targets[0].block,'2');
 await assert.rejects(f.call({type:'monitor:sync',registration:{block:'3',url:blockUrl.replace('id_bloco=2','id_bloco=3')}}),/Outro bloco/);
 block='3';view=await f.call({type:'monitor:sync',poll:true,registration:{block:'3',url:blockUrl.replace('id_bloco=2','id_bloco=3')}});
 assert.equal(view.records.length,1);assert.equal(view.records[0].block,'3');assert.equal(view.poll.targets.length,1);assert.equal(view.poll.targets[0].block,'3');
});

test('monitor lê todas as páginas sem pesquisa e limpa seleção sem executar ações nativas',async()=>{
 const calls=[];const f=reader(async(url,init)=>{calls.push({url:String(url),init});if(!init.body)return response(html(['999'],{total:1,search:'filtrado'}));const p=Number(init.body.get('hdnInfraPaginaAtual'));return response(html(p?['300']:['100','200'],{page:p,total:3}));});
 try{const result=await f.D.snapshot(target,new AbortController().signal);
  assert.deepEqual(plain(result.items.map(p=>p.id)),['100','200','300']);assert.equal(calls.length,3);
  for(const c of calls){assert.equal(c.init.credentials,'same-origin');assert.equal(c.init.redirect,'error');if(c.init.body){assert.equal(c.init.body.get('txtPalavrasPesquisaRelBlocoProtocolo'),'');assert.equal(c.init.body.get('hdnInfraItensSelecionados'),'');assert.equal(c.init.body.has('txtDescricao'),false);}}
 }finally{f.dom.window.close();}
});

test('monitor recusa login, outro tipo de bloco, contagem ausente, paginação repetida e lista que mudou',async()=>{
 for(const page of ['<form>Login</form>',html(['100'],{title:'Processos do Bloco de Assinatura'}),html(['100']).replace(/<caption>.*?<\/caption>/,'')]){
  const f=reader(async()=>response(page));try{await assert.rejects(f.D.snapshot(target,new AbortController().signal));}finally{f.dom.window.close();}
 }
 for(const changed of [false,true]){
  let n=0;const f=reader(async()=>response(html(['100'],{page:n++,total:changed&&n>1?3:2})));
  try{await assert.rejects(f.D.snapshot(target,new AbortController().signal),/Paginação repetida|lista mudou/);}finally{f.dom.window.close();}
 }
 const f=reader(async()=>{throw Error('Não deveria consultar');});try{await assert.rejects(f.D.snapshot({block:'2',url:'https://evil.test'},new AbortController().signal),/Endereço de bloco inválido/);}finally{f.dom.window.close();}
});

test('primeira leitura é silenciosa; compara IDs, preserva pendências e alerta reinclusão',async()=>{
 const f=worker();let {poll}=await f.poll();
 await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100'),item('200')]});assert.equal(f.notices.length,0);assert.equal(f.sounds.length,0);
 await f.call({type:'monitor:done',lease:poll.id});({poll}=await f.poll());
 let view=await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('200'),item('300')]});
 assert.deepEqual(plain(view.records[0].pending.map(p=>p.id)),['300']);assert.equal(f.notices.length,1);assert.equal(f.sounds.length,1);assert.equal(f.badges.at(-1),'1');
 await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('200'),item('300')]});assert.equal(f.notices.length,1);
 await f.call({type:'monitor:ack',block:'2'});assert.equal(f.badges.at(-1),'');
 await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('200')]});
 view=await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('200'),item('300')]});
 assert.equal(f.notices.length,2);assert.equal(view.records[0].pending.length,1);
 assert.equal(JSON.stringify(f.local).includes('infra_hash'),false);assert.equal(JSON.stringify(f.session).includes('infra_hash'),true);
});

test('uma aba por usuário consulta; falha não substitui referência, e navegação libera consulta',async()=>{
 const f=worker();let {poll}=await f.poll();assert.ok(poll);
 const other=await f.poll({tabId:6});assert.equal(other.poll,null);
 await assert.rejects(f.call({type:'monitor:result',block:'2',lease:poll.id,items:[]},{tabId:6}),/substituída/);
 await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100')]});
 let view=await f.call({type:'monitor:result',block:'2',lease:poll.id,error:'Sessão expirada'});assert.equal(view.records[0].error,'Sessão expirada');
 view=await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100')]});assert.equal(f.notices.length,0);assert.equal(view.records[0].error,'');
 f.listeners.updated(5,{status:'loading'});await new Promise(r=>setTimeout(r,5));
 const next=await f.poll({tabId:6});assert.ok(next.poll);
 await f.call({type:'monitor:result',block:'2',lease:next.poll.id,items:[item('100'),item('200')]},{tabId:6});assert.equal(f.notices.length,1);
});

test('som silenciável; falhas de notificação e áudio não perdem alertas visuais; clique abre bloco',async()=>{
 const f=worker();const {poll}=await f.poll();await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[]});
 await f.call({type:'monitor:sound',enabled:false});
 await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100')]});assert.equal(f.sounds.length,0);
 await f.call({type:'monitor:sound',enabled:true,test:true});assert.equal(f.sounds.length,1);
 f.notifyFails=true;f.audioFails=true;
 const view=await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100'),item('200')]});
 assert.equal(view.records[0].pending.length,2);assert.match(view.soundError,/Som indisponível/);assert.match(view.records[0].notificationError,/Notificação/);
 f.listeners.notification(f.notices[0].id);await new Promise(r=>setTimeout(r,5));assert.equal(f.tabs.at(-1).url,blockUrl);
 f.listeners.alarm({name:'sei-block-monitor'});await new Promise(r=>setTimeout(r,5));assert.equal(f.tabs.at(-1).msg.type,'monitor:tick');
});

test('monitor restringe unidade, origem, frame e usuário; registro de links não sai para API',async()=>{
 const f=worker();for(const [msg,options] of [
  [{type:'monitor:sync',identity:{...identity,unit:'9'}},{}],
  [{type:'monitor:sync'},{url:'https://evil.test'}],
  [{type:'monitor:sync'},{frameId:2}],
  [{type:'monitor:sync',registration:{block:'2',url:'https://evil.test'}},{}]
 ])assert.ok((await f.send(msg,options)).error);
 await f.poll();const other=await f.call({type:'monitor:sync',identity:{...identity,login:'colega'}});assert.equal(other.records.length,0);
 const restarted=worker({local:f.local,session:f.session});const view=await restarted.call({type:'monitor:sync'});assert.equal(view.records.length,1);
});

test('painel em outra tela do SEI mostra links, destaque Novo e reconhece avisos sem alterar controles nativos',async()=>{
 const dom=new JSDOM(html(['100']),{url:blockUrl,runScripts:'outside-only'}),w=dom.window;
 const listeners=[];let pending=[],requests=0;
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'},AbortSignal,AbortController,TextDecoder,fetch:async()=>{requests++;return response(html(['100']));}});
 const view=()=>({sound:true,records:[{block:'2',name:'Teste',url:blockUrl,checked:Date.now(),pending:pending.map(p=>({...p,url:item(p.id).url}))}]});
 w.chrome={runtime:{onMessage:{addListener:f=>listeners.push(f)},sendMessage:async msg=>{if(msg.type==='monitor:ack')pending=[];return {data:view()};}}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));await new Promise(r=>setTimeout(r,30));
 try{
  const root=w.document.querySelector('#sei-organizador-alertas').shadowRoot;
  pending=[item('100')];listeners[0]({type:'monitor:tick'});await new Promise(r=>setTimeout(r,30));
  assert.match(root.querySelector('summary').textContent,/1 processo novo/);assert.equal(root.querySelector('li a').href,item('100').url);
  assert.equal(w.document.querySelectorAll('.so-new-process-label').length,1);assert.equal(w.document.querySelectorAll('#tblProtocolosBlocos a').length,1);
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Marcar todos como vistos').click();await new Promise(r=>setTimeout(r,30));
  assert.equal(w.document.querySelectorAll('.so-new-process-label').length,0);assert.equal(requests,0);
  w.history.pushState({},'',base+'?acao=procedimento_trabalhar&infra_unidade_atual=1');
  listeners[0]({type:'monitor:tick'});await new Promise(r=>setTimeout(r,30));assert.ok(w.document.querySelector('#sei-organizador-alertas'));
 }finally{w.close();}
});

test('integração: consulta continua em outra tela, rejeita sessão expirada e retoma sem duplicar',async()=>{
 const f=worker();let ids=['100'],failed=false,fetches=0;
 const dom=new JSDOM(html(ids),{url:blockUrl,runScripts:'outside-only'}),w=dom.window,listeners=[];
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'},AbortSignal,AbortController,TextDecoder,fetch:async()=>{fetches++;return response(failed?'<form>Login</form>':html(ids));}});
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:msg=>f.send(msg)}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));
 const settle=()=>new Promise(r=>setTimeout(r,40));await settle();
 assert.equal(fetches,0,"consultas automáticas aguardam a navegação");
 await new Promise(r=>setTimeout(r,1700));
 const due=()=>{for(const owner of Object.keys(f.session.seiBlockTargets.lastPoll))f.session.seiBlockTargets.lastPoll[owner]=0;};
 try{
  assert.equal(fetches,1);assert.equal(f.notices.length,0);
  w.document.querySelector('form').remove();w.history.pushState({},'',base+'?acao=bloco_interno_listar&infra_unidade_atual=1');
  ids=['100','200'];due();listeners[0]({type:'monitor:tick'});await settle();
  assert.equal(f.notices.length,1);assert.equal(f.sounds.length,1);const root=w.document.querySelector('#sei-organizador-alertas').shadowRoot;
  assert.match(root.textContent,/1 processo novo/);assert.equal(root.querySelector('li a').href,item('200').url);
  failed=true;due();listeners[0]({type:'monitor:tick'});await settle();assert.match(root.textContent,/Sem atualização: Lista interna não reconhecida/);
  failed=false;due();listeners[0]({type:'monitor:tick'});await settle();assert.equal(f.notices.length,1);assert.doesNotMatch(root.textContent,/Sem atualização/);
  const before=fetches;w.history.pushState({},'',base+'?acao=procedimento_trabalhar&infra_unidade_atual=1');
  due();listeners[0]({type:'monitor:tick'});await settle();assert.equal(fetches,before,'processo não inicia consultas automáticas ao SEI');
 }finally{w.close();}
});

test('consultas concorrentes e reinício do worker não duplicam entrada; resultado inválido preserva estado',async()=>{
 const f=worker();const results=await Promise.all([f.poll({tabId:5}),f.poll({tabId:6})]);assert.equal(results.filter(r=>r.poll).length,1);
 const poll=results[0].poll;await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100')]});
 const before=JSON.stringify(f.local);
 await assert.rejects(f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100'),{...item('200'),url:'https://evil.test'}]}),/Link de processo inválido/);
 assert.equal(JSON.stringify(f.local),before);
 await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100'),item('200')]});
 await f.call({type:'monitor:done',lease:poll.id});
 const restarted=worker({local:f.local,session:f.session});const next=await restarted.poll();
 await restarted.call({type:'monitor:result',block:'2',lease:next.poll.id,items:[item('100'),item('200')]});
 assert.equal(restarted.notices.length,0);const view=await restarted.call({type:'monitor:sync'});assert.equal(view.records[0].pending.length,1);
});

test('áudio empacotado responde somente à extensão e informa falha de reprodução',async()=>{
 let listener,plays=0,fail=false,created;
 class AudioMock extends EventTarget{constructor(url){super();created=this;this.url=url;}pause(){}play(){plays++;if(fail)return Promise.reject(Error('Bloqueado'));queueMicrotask(()=>this.dispatchEvent(new Event('ended')));return Promise.resolve();}}
 runInNewContext(read('monitor-sounds.js')+';'+read('monitor-audio.js'),{Audio:AudioMock,setTimeout,clearTimeout,chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn}}}});
 listener({type:'monitor:audio'},{id:'outro'},()=>assert.fail('Origem inválida'));assert.equal(plays,0);
 const play=()=>new Promise(resolve=>listener({type:'monitor:audio'},{id:'test'},resolve));
 assert.equal((await play()).ok,true);assert.equal(created.volume,0.85);assert.equal(created.currentTime,0);assert.match(created.url,/sound\/novosei.mp3$/);
 fail=true;assert.match((await play()).error,/indisponível/);
 
});

test('instalação mantém permissões limitadas e empacota scripts e arquivos de aviso',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 assert.deepEqual(manifest.permissions,['storage','alarms','notifications','offscreen']);
 assert.ok(manifest.host_permissions.includes('https://sei.rj.gov.br/*'));assert.equal(manifest.host_permissions.includes('<all_urls>'),false);
 assert.equal(manifest.minimum_chrome_version,'120');
 for(const script of manifest.content_scripts.flatMap(c=>c.js))assert.ok(read(script).length);
 assert.match(read('background.js'),/importScripts\('monitor-background.js'\)/);
 assert.match(read('monitor-audio.html'),/monitor-audio.js/);
 assert.equal(readFileSync(new URL('../extension/monitor-icon.png',import.meta.url)).subarray(1,4).toString(),'PNG');
});

test('áudio confirma somente ao terminar e enfileira avisos sem cortar o anterior',async()=>{
 let listener,created,plays=0,replyCount=0;const timeouts=new Map();let timer=0;
 class AudioMock extends EventTarget{constructor(){super();created=this;}pause(){}play(){plays++;return Promise.resolve();}}
 runInNewContext(read('monitor-sounds.js')+';'+read('monitor-audio.js'),{Audio:AudioMock,setTimeout:fn=>{const id=++timer;timeouts.set(id,fn);return id;},clearTimeout:id=>timeouts.delete(id),chrome:{runtime:{id:'test',getURL:p=>p,onMessage:{addListener:fn=>listener=fn}}}});
 const call=()=>new Promise(resolve=>listener({type:'monitor:audio'},{id:'test'},r=>{replyCount++;resolve(r);}));
 const first=call(),second=call();await new Promise(r=>setTimeout(r,0));
 assert.equal(plays,1);assert.equal(replyCount,0);
 created.dispatchEvent(new Event('ended'));assert.equal((await first).ok,true);await new Promise(r=>setTimeout(r,0));assert.equal(plays,2);
 created.dispatchEvent(new Event('error'));assert.match((await second).error,/Falha/);assert.equal(timeouts.size,0);
 const third=call();await new Promise(r=>setTimeout(r,0));assert.equal(plays,3);
 [...timeouts.values()][0]();assert.match((await third).error,/não terminou/);assert.equal(timeouts.size,0);
});

test('reprodutor aguarda inicialização, registra conclusão e mantém diagnóstico de teste que falhou',async()=>{
 const f=worker();f.readyFailures=2;
 let view=await f.call({type:'monitor:sound',enabled:true,test:true});
 assert.equal(f.readyAttempts,3);assert.equal(f.sounds.length,1);assert.ok(view.soundPlayedAt);assert.equal(view.soundError,'');
 const last=view.soundPlayedAt;f.readyFailures=3;
 view=await f.call({type:'monitor:sound',enabled:false,test:true});
 assert.equal(f.sounds.length,1);assert.equal(view.sound,false);assert.equal(view.soundPlayedAt,last);assert.match(view.soundError,/reprodutor.*não respondeu/);
 const saved=await f.call({type:'monitor:sync'});assert.equal(saved.soundError,view.soundError);
 f.readyFailures=0;view=await f.call({type:'monitor:sound',enabled:false,test:true});assert.equal(view.sound,false);assert.equal(view.soundError,'');assert.equal(f.sounds.length,2);
});

test('Teste de som mostra progresso e diagnóstico sem retirar controles nem avisos',async()=>{
 const dom=new JSDOM(html(['100']),{url:blockUrl,runScripts:'outside-only'}),w=dom.window;let release,fail=true;
 const view=()=>({sound:true,soundError:fail?'Som indisponível: áudio bloqueado':'',soundPlayedAt:fail?null:Date.now(),records:[]});
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}});
 w.chrome={runtime:{onMessage:{addListener:()=>{}},sendMessage:async msg=>{if(msg.type==='monitor:sound')await new Promise(r=>release=r);return {data:view()};}}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));const settle=()=>new Promise(r=>setTimeout(r,20));await settle();
 try{
  w.document.querySelector('#sei-organizador-settings-button').click();
  const root=w.document.querySelector('#sei-organizador-configuracoes').shadowRoot;
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Testar som').click();await settle();
  assert.match(root.textContent,/Reproduzindo teste de som/);assert.ok([...root.querySelectorAll('.body button')].every(b=>b.disabled));
  release();await settle();assert.match(root.textContent,/Som indisponível: áudio bloqueado/);assert.ok([...root.querySelectorAll('button')].every(b=>!b.disabled));
  fail=false;[...root.querySelectorAll('button')].find(b=>b.textContent==='Testar som').click();await settle();release();await settle();
  assert.match(root.textContent,/Última reprodução concluída/);assert.match(root.textContent,/Som ativado/);assert.doesNotMatch(root.textContent,/Som indisponível/);
 }finally{w.close();}
});

test('sons fixos por evento preservam silenciamento e recusam toque removido',async()=>{
 const f=worker();let view=await f.call({type:'monitor:sound',enabled:false,soundId:'novosei',test:true});
 assert.equal(view.sound,false);assert.equal(f.sounds.at(-1).soundId,'novosei');
 await f.call({type:'monitor:sound',soundId:'assinar',test:true});assert.equal(f.sounds.at(-1).soundId,'assinar');
 await assert.rejects(f.call({type:'monitor:sound',soundId:'default',test:true}),/Áudio inválido/);
 const {poll}=await f.poll();await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[]});
 await f.call({type:'monitor:sound',enabled:true});await f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100')]});
 assert.equal(f.sounds.at(-1).soundId,'novosei');assert.equal(view.soundId,undefined);
});

test('reprodutor usa somente áudios empacotados e mantém a escolha de cada aviso na fila',async()=>{
 let listener,created;const played=[];
 class AudioMock extends EventTarget{constructor(){super();created=this;}pause(){}play(){played.push(this.src);return Promise.resolve();}}
 runInNewContext(read('monitor-sounds.js')+';'+read('monitor-audio.js'),{Audio:AudioMock,setTimeout,clearTimeout,chrome:{runtime:{id:'test',getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listener=fn}}}});
 const play=soundId=>new Promise(resolve=>listener({type:'monitor:audio',soundId},{id:'test'},resolve));
 const first=play('novosei'),second=play('assinar');await new Promise(r=>setTimeout(r,0));
 assert.deepEqual(played,['chrome-extension://test/sound/novosei.mp3']);created.dispatchEvent(new Event('ended'));await first;await new Promise(r=>setTimeout(r,0));
 assert.equal(played[1],'chrome-extension://test/sound/assinar.mp3');created.dispatchEvent(new Event('ended'));await second;
 assert.match((await play('../secret.mp3')).error,/Áudio inválido/);assert.equal(played.length,2);
 for(const name of ['novosei','assinar'])assert.deepEqual(readFileSync(new URL(`../extension/sound/${name}.mp3`,import.meta.url)),readFileSync(new URL(`../sound/${name}.mp3`,import.meta.url)));
});

test('painel mostra eventos fixos e configura chefe pelo login identificado no SEI',async()=>{
 const f=worker(),dom=new JSDOM(html(['100']),{url:blockUrl,runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}});
 w.chrome={runtime:{onMessage:{addListener:()=>{}},sendMessage:msg=>f.send(msg)}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));const settle=()=>new Promise(r=>setTimeout(r,20));await settle();
 try{
 const alerts=w.document.querySelector('#sei-organizador-alertas').shadowRoot;assert.equal(alerts.querySelector('textarea'),null);assert.doesNotMatch(alerts.textContent,/Chefes de seção|Testar Assinar|Silenciar som/);
 w.document.querySelector('#sei-organizador-settings-button').click();
 const root=w.document.querySelector('#sei-organizador-configuracoes').shadowRoot;
 assert.equal(root.querySelector('select'),null);assert.doesNotMatch(root.textContent,/três toques|Áudio do alerta/);
 assert.match(root.textContent,/Usuário do SEI: teste/);
 [...root.querySelectorAll('button')].find(b=>b.textContent==='Adicionar meu login').click();
 [...root.querySelectorAll('button')].find(b=>b.textContent==='Salvar chefes').click();await settle();
 assert.match(root.textContent,/Recebe avisos de Assinar/);assert.equal(root.querySelector('textarea').value,'teste');
 [...root.querySelectorAll('button')].find(b=>b.textContent==='Testar Assinar').click();await settle();assert.equal(f.sounds.at(-1).soundId,'assinar');
 }finally{w.close();}
});

test('mudança para Assinar feita por colega toca apenas no login de chefe configurado',async()=>{
 const f=worker();let view=await f.call({type:'monitor:chiefs',logins:['TESTE','teste']});assert.deepEqual(plain(view.chiefLogins),['teste']);assert.equal(view.chiefEligible,true);
 const {poll}=await f.poll();
 const result=(version,status,history)=>f.call({type:'monitor:result',block:'2',lease:poll.id,items:[item('100')],organizer:{version,statuses:{'100':status},history}});
 await result(0,'none',[]);
 const change={id:1,version:1,actor:{login:'colega'},action:{type:'status',status:'sign',previousStatus:'none',processIds:['100']}};
 view=await result(1,'sign',[change]);assert.equal(f.sounds.at(-1).soundId,'assinar');assert.equal(view.records[0].signPending.length,1);assert.equal(f.badges.at(-1),'1');
 await result(1,'sign',[change]);assert.equal(f.sounds.length,1);
 await f.call({type:'monitor:chiefs',logins:[]});view=await f.call({type:'monitor:sync'});assert.equal(view.records[0].signPending.length,0);assert.equal(f.badges.at(-1),'');
 await result(2,'none',[{id:2,version:2,action:{type:'status',status:'none',processIds:['100']}},change]);await result(3,'sign',[{...change,id:3,version:3},change]);assert.equal(f.sounds.length,1);
 await assert.rejects(f.call({type:'monitor:chiefs',logins:['nome completo']}),/logins válidos/);
});

test('entrada e Assinar têm sons separados, avisos reconhecíveis e falhas não inventam mudanças',async()=>{
 const f=worker();await f.call({type:'monitor:chiefs',logins:['teste']});const {poll}=await f.poll();
 const report=(items,organizer,extra={})=>f.call({type:'monitor:result',block:'2',lease:poll.id,items,organizer,...extra});
 await report([item('100')],{version:0,statuses:{},history:[]});
 const change={id:1,version:1,action:{type:'status',status:'sign',previousStatus:'none',processIds:['100']}};
 let view=await report([item('100'),item('200')],{version:1,statuses:{'100':'sign'},history:[change]});
 assert.deepEqual(f.sounds.map(s=>s.soundId),['novosei','assinar']);assert.equal(f.notices.length,2);assert.equal(f.badges.at(-1),'2');
 assert.equal(view.records[0].pending.length,1);assert.equal(view.records[0].signPending.length,1);
 await f.call({type:'monitor:ack',block:'2'});assert.equal(f.badges.at(-1),'');
 view=await report([item('100'),item('200')],undefined,{organizerError:'API indisponível'});assert.match(view.records[0].signError,/API indisponível/);assert.equal(f.sounds.length,2);
 await report([item('100'),item('200')],{version:1,statuses:{'100':'sign'},history:[change]});assert.equal(f.sounds.length,2);
});

test('integração consulta status e histórico compartilhados e mantém configuração de chefe ao reiniciar',async()=>{
 const f=worker();await f.call({type:'monitor:chiefs',logins:['teste']});
 const dom=new JSDOM(html(['100']),{url:blockUrl,runScripts:'outside-only'}),w=dom.window,listeners=[];
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'},AbortSignal,AbortController,TextDecoder,fetch:async()=>response(html(['100']))});
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:msg=>f.send(msg)}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));const settle=()=>new Promise(r=>setTimeout(r,40));await new Promise(r=>setTimeout(r,1700));
 try{
  f.organizer={version:1,statuses:{'100':'sign'},history:[{id:1,version:1,action:{type:'status',status:'sign',previousStatus:'none',processIds:['100']}}]};
  for(const owner of Object.keys(f.session.seiBlockTargets.lastPoll))f.session.seiBlockTargets.lastPoll[owner]=0;
  listeners[0]({type:'monitor:tick'});await settle();assert.equal(f.sounds.at(-1).soundId,'assinar');
  assert.match(w.document.querySelector('#sei-organizador-alertas').shadowRoot.textContent,/1 para assinar/);
  const restarted=worker({local:f.local,session:f.session});const view=await restarted.call({type:'monitor:sync'});assert.equal(view.chiefEligible,true);assert.deepEqual(plain(view.chiefLogins),['teste']);
 }finally{w.close();}
});

test('botão no header abre janela separada, preserva rascunho e foco e se recupera sem duplicar',async()=>{
 const nativeHeader=`<div id="divInfraBarraSistemaPadraoD"><div class="infraAcaoBarraSistema">${header}</div></div>`;
 const dom=new JSDOM(html(['100']).replace(header,nativeHeader),{url:blockUrl,runScripts:'outside-only'}),w=dom.window,listeners=[];
 const view={sound:true,chiefLogins:[],chiefEligible:false,records:[]};
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}});
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async()=>({data:view})}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));const settle=ms=>new Promise(r=>setTimeout(r,ms||25));await settle();
 try{
  let button=w.document.querySelector('#sei-organizador-settings-button');assert.equal(button.parentElement.parentElement.id,'divInfraBarraSistemaPadraoD');assert.equal(button.getAttribute('aria-haspopup'),'dialog');
  const alerts=w.document.querySelector('#sei-organizador-alertas').shadowRoot;assert.equal(alerts.querySelector('textarea'),null);assert.doesNotMatch(alerts.textContent,/Chefes de seção|Testar som|Adicionar meu login/);
  button.click();const settings=w.document.querySelector('#sei-organizador-configuracoes').shadowRoot,dialog=settings.querySelector('dialog');assert.equal(dialog.open,true);
  const input=settings.querySelector('textarea');input.value='chefe.teste';input.dispatchEvent(new w.Event('input'));
  listeners[0]({type:'monitor:tick'});await settle();assert.equal(settings.querySelector('textarea'),input);assert.equal(input.value,'chefe.teste');
  dialog.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(dialog.open,false);assert.equal(w.document.activeElement,button);
  button.click();assert.equal(settings.querySelector('textarea').value,'chefe.teste');
  button.remove();await settle(320);assert.equal(w.document.querySelectorAll('#sei-organizador-settings-button').length,1);assert.equal(w.document.querySelectorAll('#sei-organizador-settings-header').length,1);
  w.document.querySelector('#lnkUsuarioSistema').setAttribute('href','?infra_unidade_atual=9');listeners[0]({type:'monitor:tick'});await settle();assert.equal(w.document.querySelector('#sei-organizador-settings-button'),null);assert.equal(w.document.querySelector('#sei-organizador-configuracoes'),null);
 }finally{w.close();}
});

test('erro ao salvar chefe fica na janela de configurações, preserva edição e permite tentar novamente',async()=>{
 const dom=new JSDOM(html(['100']),{url:blockUrl,runScripts:'outside-only'}),w=dom.window;let fail=true;
 const view={sound:true,chiefLogins:[],chiefEligible:false,records:[]};
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}});
 w.chrome={runtime:{onMessage:{addListener:()=>{}},sendMessage:async msg=>msg.type==='monitor:chiefs'&&fail?{error:'Não foi possível salvar os chefes'}:{data:view}}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));const settle=()=>new Promise(r=>setTimeout(r,25));await settle();
 try{
  w.document.querySelector('#sei-organizador-settings-button').click();const settings=w.document.querySelector('#sei-organizador-configuracoes').shadowRoot;
  const input=settings.querySelector('textarea');input.value='chefe';input.dispatchEvent(new w.Event('input'));
  const save=()=>[...settings.querySelectorAll('button')].find(b=>b.textContent==='Salvar chefes');save().click();await settle();
  assert.match(settings.querySelector('[role=status]').textContent,/Não foi possível salvar/);assert.equal(settings.querySelector('textarea').value,'chefe');assert.equal(save().disabled,false);
  const alerts=w.document.querySelector('#sei-organizador-alertas').shadowRoot;assert.doesNotMatch(alerts.textContent,/Não foi possível salvar|Monitor sem atualização/);
  fail=false;view.chiefLogins=['chefe'];save().click();await settle();assert.match(settings.querySelector('[role=status]').textContent,/Configurações salvas/);assert.equal(settings.querySelector('textarea').value,'chefe');
 }finally{w.close();}
});

test('rodapé acompanha cor original do header, reserva altura e restaura layout ao sair da unidade',async()=>{
 const native=`<nav id="navInfraBarraNavegacao">${header}</nav><div id="divInfraAreaTela">Conteúdo nativo</div>`;
 const dom=new JSDOM(`<div id="divInfraAreaGlobal" style="display:flex;flex-direction:column;height:100vh">${native}</div>`,{url:blockUrl,runScripts:'outside-only'}),w=dom.window,listeners=[];
 const view={sound:true,records:[]};Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}});
 w.document.documentElement.style.setProperty('--infra-esquema-cor-barra-sistema','#0494c7');
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async()=>({data:view})}};
 w.eval(read('theme.js'));w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));const settle=()=>new Promise(r=>setTimeout(r,25));await settle();
 try{
  const global=w.document.querySelector('#divInfraAreaGlobal'),before=global.getAttribute('style'),footer=w.document.querySelector('#sei-organizador-alertas');
  assert.equal(footer.tagName,'FOOTER');assert.equal(footer.style.getPropertyValue('--so-header-bg'),'rgb(4,148,199)');
  const spacer=w.document.querySelector('#sei-organizador-alertas-spacer');assert.equal(spacer.parentElement,global);assert.equal(spacer.style.height,'34px');assert.equal(spacer.getAttribute('aria-hidden'),'true');
  footer.shadowRoot.querySelector('summary').getBoundingClientRect=()=>({height:46});w.dispatchEvent(new w.Event('resize'));assert.equal(spacer.style.height,'46px');assert.equal(global.getAttribute('style'),before);
  w.document.documentElement.style.setProperty('--infra-esquema-cor-barra-sistema','#111111');await settle();assert.equal(footer.style.getPropertyValue('--so-header-bg'),'rgb(17,17,17)');assert.equal(footer.style.getPropertyValue('--so-header-fg'),'#ffffff');
  w.document.querySelector('#lnkUsuarioSistema').setAttribute('href','?infra_unidade_atual=9');listeners[0]({type:'monitor:tick'});await settle();
  assert.equal(w.document.querySelector('#sei-organizador-alertas'),null);assert.equal(w.document.querySelector('#sei-organizador-alertas-spacer'),null);assert.equal(global.getAttribute('style'),before);
 }finally{w.close();}
});

test('rodapé não expande sozinho, distingue alerta de falha e fecha detalhes por Escape',async()=>{
 const dom=new JSDOM(html(['100']),{url:blockUrl,runScripts:'outside-only'}),w=dom.window,listeners=[];
 const record={block:'2',name:'Teste',url:blockUrl,pending:[],signPending:[]};const view={sound:true,records:[record]};
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}});
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async()=>({data:view})}};
 w.eval(read('monitor-data.js'));w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));w.eval(read('monitor.js'));const settle=()=>new Promise(r=>setTimeout(r,25));await settle();
 try{
  const root=w.document.querySelector('#sei-organizador-alertas').shadowRoot,details=root.querySelector('details'),summary=root.querySelector('summary');
  assert.match(summary.textContent,/Nenhum alerta novo/);assert.equal(details.open,false);
  record.pending=[item('100')];record.signPending=[item('200')];listeners[0]({type:'monitor:changed'});await settle();
  assert.match(summary.textContent,/1 novo processo.*1 para assinar/);assert.equal(details.open,false);assert.equal(root.querySelector('section').dataset.new,'true');
  listeners[0]({type:'monitor:open'});assert.equal(details.open,true);
  details.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(details.open,false);assert.equal(root.activeElement,summary);
  record.pending=[];record.signPending=[];record.error='Sessão expirada';listeners[0]({type:'monitor:changed'});await settle();
  assert.match(summary.textContent,/atenção/);assert.equal(root.querySelector('section').dataset.error,'true');assert.equal(root.querySelector('section').dataset.new,'false');
 }finally{w.close();}
});
