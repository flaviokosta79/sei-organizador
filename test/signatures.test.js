import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
import {createStore} from '../server/store.js';
const read=name=>readFileSync(new URL('../extension/'+name,import.meta.url),'utf8');
const base='https://sei.rj.gov.br/sei/controlador.php';
const actor=login=>({unit:'1',org:'SEPM',login,name:login});
const observation=(extra={})=>({process:'10',document:'11',number:'555',signatureBlock:'99',includedAt:Date.now()-60000,includedBy:{login:'p3a',name:'Pessoa P3'},signature:{time:Date.now(),signer:{login:'chefe',name:'Nome do Chefe'}},...extra});

test('assinatura real é compartilhada por bloco, deduplicada e preservada após reinício',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-signature-'));let store=createStore(join(dir,'db.sqlite'));
 try{
  const s=store.signatures;
  for(const [login,block] of [['p3a','2'],['p3b','2'],['p1','3']])assert.equal(s.sync('1',block,{actor:actor(login),after:null}).events.length,0);
  const item=observation();assert.equal(s.observe('1','2',{actor:actor('p3a'),observations:[item]}).accepted,1);
  assert.equal(s.observe('1','2',{actor:actor('p3b'),observations:[{...item,signature:{...item.signature,signer:{login:'CHEFE',name:'Outro nome exibido'}}}]}).accepted,0);
  const events=s.sync('1','2',{actor:actor('p3b'),after:0});assert.equal(events.events.length,1);assert.equal(events.events[0].signer.login,'chefe');assert.equal(events.events[0].signer.name,'Nome do Chefe');
  assert.equal(s.sync('1','3',{actor:actor('p1'),after:0}).events.length,0);
  assert.equal(s.sync('9','2',{actor:actor('p3b'),after:0}).events.length,0);
  assert.equal(s.sync('1','2',{actor:actor('p3a'),after:events.cursor}).events.length,0);
  store.close();store=createStore(join(dir,'db.sqlite'));assert.equal(store.signatures.sync('1','2',{actor:actor('p3b'),after:0}).events.length,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});

test('assinaturas antigas não alertam, inclusão fixa grupo de origem e entrada inválida é atômica',()=>{
 const store=createStore(':memory:');const s=store.signatures;
 try{
  s.sync('1','2',{actor:actor('p3a'),after:null});s.sync('1','2',{actor:actor('p3b'),after:null});s.sync('1','3',{actor:actor('p1'),after:null});
  const old=observation({includedAt:Date.now()-8000000,signature:{time:Date.now()-7000000,signer:{login:'chefe',name:'Chefe'}}});
  assert.equal(s.observe('1','2',{actor:actor('p3a'),observations:[old]}).accepted,0);
  const item=observation({document:'12',signature:undefined});s.observe('1','2',{actor:actor('p3b'),observations:[item]});
  s.sync('1','3',{actor:actor('p3a'),after:null});
  const signed={...item,signature:{time:Date.now(),signer:{login:'chefe',name:'Chefe'}}};
  assert.equal(s.observe('1','2',{actor:actor('p3b'),observations:[signed]}).accepted,1);
  assert.equal(s.sync('1','2',{actor:actor('p3b'),after:0}).events.length,1);
  assert.equal(s.sync('1','3',{actor:actor('p1'),after:0}).events.length,0);
  assert.throws(()=>s.observe('1','2',{actor:actor('p3a'),observations:[signed]}),e=>e.status===409);
  assert.throws(()=>s.observe('1','2',{actor:actor('p3b'),observations:[observation({document:'13'}),observation({document:'bad'})]}));
  assert.equal(s.sync('1','2',{actor:actor('p3b'),after:0}).events.length,1);
  assert.throws(()=>s.observe('1','2',{actor:actor('p3b'),observations:[observation({signature:{time:Date.now()+120000,signer:{name:'Chefe',login:'chefe'}}})]}));
  assert.throws(()=>s.sync('1','2',{actor:actor('p3b'),after:-1}));
 }finally{store.close();}
});

function reader(unit='1'){
 const dom=new JSDOM('',{url:base+'?infra_unidade_atual='+unit,runScripts:'outside-only'}),w=dom.window;
 Object.assign(w,{SEI_ORGANIZADOR_CONFIG:{unitId:unit},TextDecoder,AbortSignal});w.eval(read('document-data.js'));w.eval(read('history-pages.js'));w.eval(read('signature-data.js'));return {dom,w,D:w.seiSignatureData};
}
const documentLink='<a href="?acao=documento_visualizar&id_documento=11&infra_unidade_atual=1">555</a>';
const history=rows=>`<table id="tblHistorico"><caption>Lista (${rows.length} registros)</caption><tr><th>Data/Hora</th><th>Unidade</th><th>Usuário</th><th>Descrição</th></tr>${rows.map(([time,text,user='p3a',unit='SEPM/P3'])=>`<tr><td>27/10/2026 ${time}</td><td>${unit}</td><td><a title="Nome P3">${user}</a></td><td>${text}</td></tr>`).join('')}</table>`;
const insertion=`Documento ${documentLink} (CI) inserido no bloco <a href="?id_bloco=99">99</a>`;
const removal=`Documento ${documentLink} (CI) retirado do bloco <a href="?id_bloco=99">99</a>`;
const signing=`Assinado Documento ${documentLink} (CI) por <a href="javascript:void(0)" title="Nome do Chefe">chefe</a>`;

test('leitor usa assinatura e autor da descrição do SEI, ignora retirada anterior e outro bloco/unidade',()=>{
 const {dom,w,D}=reader();
 try{
  const parse=rows=>D.observations(new w.DOMParser().parseFromString(history(rows),'text/html'),'10',new Set(['99']),'SEPM/P3');
  let result=parse([['10:03',removal],['10:02',signing,'delegado'],['10:01',insertion]]);
  assert.equal(result.length,1);assert.equal(result[0].signature.signer.login,'chefe');assert.equal(result[0].signature.signer.name,'Nome do Chefe');assert.equal(result[0].includedBy.login,'p3a');
  result=parse([['10:03',signing],['10:02',removal],['10:01',insertion]]);assert.equal(result.length,0);
  result=parse([['10:03',signing],['10:01',insertion,'outro','SEPM/P1']]);assert.equal(result.length,0);
  result=D.observations(new w.DOMParser().parseFromString(history([['10:03',signing],['10:01',insertion]]),'text/html'),'10',new Set(['88']),'SEPM/P3');assert.equal(result.length,0);
  result=parse([['10:03',signing],['10:02',insertion],['10:01',removal],['10:00',insertion]]);assert.equal(result.find(o=>o.signature).includedAt,new Date(2026,9,27,10,2).getTime());
  const partial=new w.DOMParser().parseFromString(history([['10:03',signing],['10:01',insertion]]).replace('(2 registros)','(3 registros)'),'text/html');assert.throws(()=>D.observations(partial,'10',new Set(['99']),'SEPM/P3'),/incompleto/);
 }finally{dom.window.close();}
});

test('amostra real identifica inclusão, assinatura e nome do assinante mesmo após retirada',()=>{
 const {dom,w,D}=reader('120000124');
 try{
  const html=new TextDecoder('windows-1252').decode(readFileSync(new URL('../referencias/amostras/andamento.html',import.meta.url)));
  const doc=new w.DOMParser().parseFromString(html,'text/html');
  const result=D.observations(doc,'150184527',new Set(['14350','2653']),'SEPM/5°CPA');
  const event=result.find(o=>o.number==='144413782'&&o.signature);assert.ok(event);assert.equal(event.signature.signer.login,'daniele.farias');assert.equal(event.signature.signer.name,'Daniele Ezequiel Farias da Silva');assert.equal(event.signatureBlock,'14350');
 }finally{dom.window.close();}
});

function browser(store,{local={},session={}}={}){
 const listeners=[],notices=[],sounds=[];let offline=false;
 const area=data=>({get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))});
 const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.push(fn)},openOptionsPage:async()=>{}},storage:{local:area(local),session:area(session)},notifications:{create:async(id,data)=>notices.push({id,data}),clear:async()=>{},onClicked:{addListener:()=>{}}}};
 const context={chrome,URL,AbortSignal,Date,SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM',serviceUrl:'https://ext.5cpa.com.br'},seiWorkScopeStore:{requireBlock:async(identity,block)=>{if(block!=='2')throw Error('Bloco não escolhido');}},seiPlayAlertSound:async id=>sounds.push(id),fetch:async(url,options)=>{if(offline)throw Error('Offline');const m=new URL(url).pathname.match(/blocks\/(\d+)\/signatures\/(sync|observe)$/);try{return {ok:true,json:async()=>store.signatures[m[2]]('1',m[1],JSON.parse(options.body))};}catch(e){return {ok:false,status:e.status||400};}}};
 runInNewContext(read('signature-background.js'),context);
 const call=async(type,extra={},sender={tab:{url:base,id:1},frameId:0})=>{const result=await new Promise(resolve=>listeners[0]({type,identity:actor('p3a'),block:'2',...extra},sender,resolve));if(result.error)throw Error(result.error);return result.data;};
 return {call,local,session,notices,sounds,set offline(v){offline=v;}};
}

test('dois navegadores recebem som e alerta uma vez, vistos são individuais e offline não perde cursor',async()=>{
 const store=createStore(':memory:');const a=browser(store),b=browser(store);
 try{
  await a.call('signature:sync',{poll:true});await b.call('signature:sync');
  await a.call('signature:observe',{observations:[observation()]});
  const av=await a.call('signature:sync'),bv=await b.call('signature:sync');assert.equal(av.events.length,1);assert.equal(bv.events.length,1);assert.equal(a.sounds[0],'assinar');assert.equal(b.sounds[0],'assinar');assert.match(b.notices[0].data.message,/555 assinado por Nome do Chefe \(chefe\)/);
  await a.call('signature:sync');assert.equal(a.sounds.length,1);
  await b.call('signature:ack');assert.equal((await a.call('signature:sync')).events.length,1);assert.equal((await b.call('signature:sync')).events.length,0);
  const restarted=browser(store,{local:a.local,session:a.session});await restarted.call('signature:sync');assert.equal(restarted.sounds.length,0);
  b.offline=true;assert.match((await b.call('signature:sync')).error,/Offline/);await a.call('signature:observe',{observations:[observation({document:'12'})]});b.offline=false;assert.equal((await b.call('signature:sync')).events.length,1);assert.equal(b.sounds.length,2);
  await assert.rejects(a.call('signature:sync',{block:'3'}),/não escolhido/);await assert.rejects(a.call('signature:sync',{}, {tab:{url:'https://evil.test'},frameId:0}),/Origem/);
 }finally{store.close();}
});

test('scanner percorre telas nativas, confirma andamento e preserva acompanhamento ao navegar',async()=>{
 const load=name=>new TextDecoder('windows-1252').decode(readFileSync(new URL('../referencias/amostras/'+name,import.meta.url)));
 const {dom,w,D}=reader('120000124');
 const calls=[];let signatureList=load('lista-blocos-assinatura.html');
 w.document.body.innerHTML='<a id="lnkInfraUnidade">SEPM/P3</a><a href="?acao=bloco_assinatura_listar&infra_unidade_atual=120000124">Assinatura</a>';
 const process='147797799';
 w.fetch=async(url,options={})=>{
  const u=new URL(url),action=u.searchParams.get('acao');calls.push({action,body:options.body});
  let html;
  if(action==='bloco_assinatura_listar')html=signatureList;
  else if(action==='rel_bloco_protocolo_listar')html=load('bloco-assinatura.html').replaceAll('1420987',u.searchParams.get('id_bloco'));
  else if(action==='procedimento_trabalhar')html=`<iframe id="ifrArvore" src="?acao=procedimento_visualizar&id_procedimento=${process}&infra_unidade_atual=120000124"></iframe>`;
  else if(action==='procedimento_visualizar')html=`<a onclick="consultar('controlador.php?acao=procedimento_consultar_historico&id_procedimento=${process}&infra_unidade_atual=120000124')">Andamento</a>`;
  else if(action==='procedimento_consultar_historico')html=history([['10:03',signing],['10:01',insertion.replaceAll('99','1420987')]]);
  else throw Error(action);
  return new Response(html,{headers:{'content-type':'text/html; charset=utf-8'}});
 };
 try{
  const frame=w.document.createElement('iframe');frame.id='ifrArvore';w.document.body.append(frame);frame.contentDocument.body.innerHTML=`<a onclick="consultar('${base}?acao=procedimento_consultar_historico&id_procedimento=${process}&infra_unidade_atual=120000124')">Andamento</a>`;
  w.eval(read('signature-monitor.js'));let result=await w.seiSignatureScanner.scan(actor('p3a'),'2',new AbortController().signal);
  assert.equal(result.error,'');assert.equal(result.blocks,15);assert.equal(result.processes,1);assert.ok(result.observations.some(o=>o.signature?.signer.login==='chefe'));
  assert.equal(calls.filter(c=>c.action==='rel_bloco_protocolo_listar').length,0);assert.ok(!calls.some(c=>['procedimento_trabalhar','procedimento_visualizar','documento_visualizar'].includes(c.action)));
  const post=calls.find(c=>c.action==='bloco_assinatura_listar'&&c.body);assert.equal(post.body.get('hdnMeusBlocos'),'T');assert.equal(post.body.get('txtPalavrasPesquisaBloco'),'');assert.equal(post.body.get('chkSinEstadoConcluido'),'on');
  assert.ok(w.sessionStorage.getItem('seiSignatureScanner:'+JSON.stringify([actor('p3a'),'2'])));
  signatureList=signatureList.replace(/<table\s+id="tblBlocos"[\s\S]*?<\/table>/,'<table id="tblBlocos"><caption>Lista (0 registros)</caption><tr><th>Número</th></tr></table>');
  w.eval(read('signature-monitor.js'));result=await w.seiSignatureScanner.scan(actor('p3a'),'2',new AbortController().signal);assert.equal(result.blocks,0);assert.equal(result.processes,1);assert.ok(result.observations.some(o=>o.signature?.signer.login==='chefe'));
  assert.throws(()=>D.address(base+'?acao=documento_assinar&infra_unidade_atual=120000124',undefined,['rel_bloco_protocolo_listar']),/inválido/);
 }finally{w.close();}
});

test('rodapé mostra documento e assinante sem exigir registro de um bloco aberto, e permite visto local',async()=>{
 const dom=new JSDOM('<a id="lnkInfraUnidade">SEPM/P3</a>',{url:base+'?acao=procedimento_controlar&infra_unidade_atual=1',runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;
 let events=[{id:1,process:'10',document:'11',number:'555',signatureBlock:'99',signer:{login:'chefe',name:'Nome do Chefe'},signedAt:Date.now()}];
 const listeners=[];
 w.seiBlockMonitor={context:()=>actor('p3a')};w.seiSignatureScanner={};w.seiWorkScope={block:'2'};w.seiOrganizerSettings=()=>({mount(){},reset(){},dispose(){}});
 w.chrome={runtime:{onMessage:{addListener:fn=>listeners.push(fn)},sendMessage:async msg=>{
  if(msg.type==='signature:ack')events=[];
  return {data:msg.type.startsWith('signature:')?{events}:{records:[],sound:true}};
 }}};
 try{
  w.eval(read('monitor.js'));await new Promise(r=>setTimeout(r,90));const root=w.document.querySelector('#sei-organizador-alertas').shadowRoot;
  assert.match(root.textContent,/1 documento assinado/);assert.match(root.textContent,/Documento 555/);assert.match(root.textContent,/Nome do Chefe \(chefe\)/);
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Marcar assinaturas como vistas').click();await new Promise(r=>setTimeout(r,90));assert.doesNotMatch(root.textContent,/Documento 555/);
 }finally{w.close();}
});
