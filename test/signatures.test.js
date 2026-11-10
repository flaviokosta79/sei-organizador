import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,rmSync,existsSync} from 'node:fs';
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

// Real SEI pages hold personal data and are kept only on the author's machine (not in the repository).
const sample=new URL('../referencias/amostras/andamento.html',import.meta.url);
test('amostra real identifica inclusão, assinatura e nome do assinante mesmo após retirada',{skip:!existsSync(sample)&&'amostra local ausente'},()=>{
 const {dom,w,D}=reader('120000124');
 try{
  const html=new TextDecoder('windows-1252').decode(readFileSync(new URL('../referencias/amostras/andamento.html',import.meta.url)));
  const doc=new w.DOMParser().parseFromString(html,'text/html');
  const result=D.observations(doc,'150184527',new Set(['14350','2653']),'SEPM/5°CPA');
  const event=result.find(o=>o.number==='144413782'&&o.signature);assert.ok(event);assert.match(event.signature.signer.login,/^[a-z]+\.[a-z]+$/);assert.match(event.signature.signer.name,/^\S+( \S+){3,}$/);assert.notEqual(event.signature.signer.name.toLowerCase(),event.signature.signer.login);assert.equal(event.signatureBlock,'14350');
  // Without the signature block list the real history gives the same result: "Processo inserido no bloco 1343" is ignored.
  const open=D.observations(doc,'150184527',null,'SEPM/5°CPA');
  assert.deepEqual(JSON.parse(JSON.stringify(open)),JSON.parse(JSON.stringify(result)));assert.ok(!open.some(o=>o.signatureBlock==='1343'));
 }finally{dom.window.close();}
});

function browser(store,{local={},session={}}={}){
 const listeners=[],notices=[],sounds=[];let offline=false,offset=0;
 // The shared answer is reused for 20 s: later() moves this browser's clock past that window.
 const Clock=class extends Date{static now(){return Date.now()+offset;}};
 const area=data=>({get:async key=>({[key]:structuredClone(data[key])}),set:async value=>Object.assign(data,structuredClone(value))});
 const chrome={runtime:{getURL:p=>'chrome-extension://test/'+p,onMessage:{addListener:fn=>listeners.push(fn)},openOptionsPage:async()=>{}},storage:{local:area(local),session:area(session)},notifications:{create:async(id,data)=>notices.push({id,data}),clear:async()=>{},onClicked:{addListener:()=>{}}}};
 const context={chrome,URL,AbortSignal,Date:Clock,SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM',serviceUrl:'https://ext.5cpa.com.br'},seiWorkScopeStore:{requireBlock:async(identity,block)=>{if(block!=='2')throw Error('Bloco não escolhido');}},seiPlayAlertSound:async id=>sounds.push(id),fetch:async(url,options)=>{if(offline)throw Error('Offline');const m=new URL(url).pathname.match(/blocks\/(\d+)\/signatures\/(sync|observe)$/);try{return {ok:true,json:async()=>store.signatures[m[2]]('1',m[1],JSON.parse(options.body))};}catch(e){return {ok:false,status:e.status||400};}}};
 runInNewContext(read('service-client.js')+';'+read('signature-background.js'),context);
 const call=async(type,extra={},sender={tab:{url:base,id:1},frameId:0})=>{const result=await new Promise(resolve=>listeners[0]({type,identity:actor('p3a'),block:'2',...extra},sender,resolve));if(result.error)throw Error(result.error);return result.data;};
 return {call,local,session,notices,sounds,later(ms=21000){offset+=ms;},set offline(v){offline=v;}};
}

test('dois navegadores recebem som e alerta uma vez, vistos são individuais e offline não perde cursor',async()=>{
 const store=createStore(':memory:');const a=browser(store),b=browser(store);
 try{
  await a.call('signature:sync',{poll:true});await b.call('signature:sync');
  await a.call('signature:observe',{observations:[observation()]});
  // The browser that observed sees it at once (its write cleared the cache); the other one within 20 s.
  const av=await a.call('signature:sync');assert.equal((await b.call('signature:sync')).events.length,0);b.later();const bv=await b.call('signature:sync');assert.equal(av.events.length,1);assert.equal(bv.events.length,1);assert.equal(a.sounds[0],'assinar');assert.equal(b.sounds[0],'assinar');assert.match(b.notices[0].data.message,/555 assinado por Nome do Chefe \(chefe\)/);
  await a.call('signature:sync');assert.equal(a.sounds.length,1);
  await b.call('signature:ack');a.later();assert.equal((await a.call('signature:sync')).events.length,1);assert.equal((await b.call('signature:sync')).events.length,0);
  const restarted=browser(store,{local:a.local,session:a.session});await restarted.call('signature:sync');assert.equal(restarted.sounds.length,0);
  b.later();b.offline=true;assert.match((await b.call('signature:sync')).error,/Offline/);await a.call('signature:observe',{observations:[observation({document:'12'})]});b.offline=false;assert.equal((await b.call('signature:sync')).events.length,1);assert.equal(b.sounds.length,2);
  await assert.rejects(a.call('signature:sync',{block:'3'}),/não escolhido/);await assert.rejects(a.call('signature:sync',{}, {tab:{url:'https://evil.test'},frameId:0}),/Origem/);
 }finally{store.close();}
});

test('scanner lê só andamentos já abertos, sem a lista de blocos de assinatura, e preserva acompanhamento ao navegar',async()=>{
 const {w,D}=reader('120000124');
 const calls=[];
 w.document.body.innerHTML='<a id="lnkInfraUnidade">SEPM/P3</a><a href="?acao=bloco_assinatura_listar&infra_unidade_atual=120000124">Assinatura</a>';
 const process='147797799';
 w.fetch=async(url,options={})=>{
  const u=new URL(url),action=u.searchParams.get('acao');calls.push({action,body:options.body});
  if(action!=='procedimento_consultar_historico')throw Error(action);
  return new Response(history([['10:03',signing],['10:01',insertion.replaceAll('99','1420987')]]),{headers:{'content-type':'text/html; charset=utf-8'}});
 };
 try{
  const frame=w.document.createElement('iframe');frame.id='ifrArvore';w.document.body.append(frame);frame.contentDocument.body.innerHTML=`<a onclick="consultar('${base}?acao=procedimento_consultar_historico&id_procedimento=${process}&infra_unidade_atual=120000124')">Andamento</a>`;
  w.eval(read('signature-monitor.js'));let result=await w.seiSignatureScanner.scan(actor('p3a'),'2',new AbortController().signal);
  assert.equal(result.error,'');assert.equal(result.processes,1);
  const found=result.observations.find(o=>o.signature?.signer.login==='chefe');assert.ok(found);assert.equal(found.signatureBlock,'1420987');
  // Only the history is read: no signature block list, no block or process page.
  assert.deepEqual([...new Set(calls.map(c=>c.action))],['procedimento_consultar_historico']);
  const key='seiSignatureScanner:'+JSON.stringify([actor('p3a'),'2']);assert.ok(w.sessionStorage.getItem(key));
  // Another page of the same tab (no tree) keeps following the process saved in the session.
  frame.remove();w.eval(read('signature-monitor.js'));result=await w.seiSignatureScanner.scan(actor('p3a'),'2',new AbortController().signal);
  assert.equal(result.processes,1);assert.ok(result.observations.some(o=>o.signature?.signer.login==='chefe'));
  assert.ok(!calls.some(c=>c.action==='bloco_assinatura_listar'));
  assert.throws(()=>D.address(base+'?acao=documento_assinar&infra_unidade_atual=120000124',undefined,['rel_bloco_protocolo_listar']),/inválido/);
 }finally{w.close();}
});

test('sem lista de blocos, inclusão de processo em bloco interno não vira acompanhamento de assinatura',()=>{
 const {w,D}=reader('1');
 try{
  const processInsertion='Processo inserido no bloco <a href="?id_bloco=1343">1343</a>';
  const doc=new w.DOMParser().parseFromString(history([['10:03',signing],['10:01',processInsertion]]),'text/html');
  assert.equal(D.observations(doc,'10',null,'SEPM/P3').length,0);
  const withDocument=new w.DOMParser().parseFromString(history([['10:03',signing],['10:01',insertion]]),'text/html');
  const result=D.observations(withDocument,'10',null,'SEPM/P3');assert.ok(result.some(o=>o.signature&&o.signatureBlock==='99'));
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
  assert.match(root.textContent,/1 documento assinado/);assert.match(root.textContent,/Documento 555/);
  const link=root.querySelector('li strong a');assert.equal(link.textContent,'Documento 555');assert.equal(link.href,'https://sei.rj.gov.br/sei/controlador.php?acao=procedimento_trabalhar&id_procedimento=10&id_documento=11');assert.equal(link.target,'_blank');assert.match(root.textContent,/Nome do Chefe \(chefe\)/);
  [...root.querySelectorAll('button')].find(b=>b.textContent==='Marcar assinaturas como vistas').click();await new Promise(r=>setTimeout(r,90));assert.doesNotMatch(root.textContent,/Documento 555/);
 }finally{w.close();}
});


test('tela do processo registra o andamento na sessão do navegador e só endereços válidos são aceitos',async()=>{
 const store=createStore(':memory:');const a=browser(store);
 try{
  const url=p=>`${base}?acao=procedimento_consultar_historico&id_procedimento=${p}&infra_unidade_atual=1&infra_hash=x`;
  await a.call('signature:remember',{process:'10',url:url('10')});await a.call('signature:remember',{process:'11',url:url('11')});await a.call('signature:remember',{process:'10',url:url('10')});
  assert.deepEqual((await a.call('signature:processes')).processes.map(([p])=>p),['10','11']);
  await assert.rejects(a.call('signature:remember',{process:'12',url:url('13')}),/inválido/);
  await assert.rejects(a.call('signature:remember',{process:'12',url:url('12').replace('infra_unidade_atual=1','infra_unidade_atual=2')}),/inválido/);
  await assert.rejects(a.call('signature:remember',{process:'12',url:'https://evil.test/sei/controlador.php?acao=procedimento_consultar_historico&id_procedimento=12&infra_unidade_atual=1'}),/inválido/);
  await assert.rejects(a.call('signature:remember',{process:'12',url:url('12'),block:'3'}),/não escolhido/);
  // Session only: nothing goes to local storage or to the shared service.
  assert.ok(a.session.seiSignatureProcesses);assert.equal(JSON.stringify(a.local).includes('infra_hash'),false);
 }finally{store.close();}
});

test('aba de lista lê andamentos registrados por outra aba e a tela do processo só registra, sem ler o SEI',async()=>{
 const {w}=reader('120000124');
 const process='147797799',historyUrl=`${base}?acao=procedimento_consultar_historico&id_procedimento=${process}&infra_unidade_atual=120000124`;
 const sent=[],calls=[];
 w.chrome={runtime:{sendMessage:async msg=>{sent.push(msg);return msg.type==='signature:processes'?{data:{processes:[[process,historyUrl]]}}:{data:{ok:true}};}}};
 w.fetch=async url=>{calls.push(new URL(url).searchParams.get('acao'));return new Response(history([['10:03',signing],['10:01',insertion.replaceAll('99','1420987')]]),{headers:{'content-type':'text/html; charset=utf-8'}});};
 try{
  w.document.body.innerHTML='<a id="lnkInfraUnidade">SEPM/P3</a>';
  w.eval(read('signature-monitor.js'));
  const result=await w.seiSignatureScanner.scan(actor('p3a'),'2',new AbortController().signal);
  assert.equal(result.processes,1);assert.ok(result.observations.some(o=>o.signature?.signer.login==='chefe'));assert.deepEqual(calls,['procedimento_consultar_historico']);
  // Process page: the tree's history link is recorded, and no SEI page is fetched.
  calls.length=0;sent.length=0;
  const frame=w.document.createElement('iframe');frame.id='ifrArvore';w.document.body.append(frame);
  frame.contentDocument.body.innerHTML=`<a onclick="consultar('${base}?acao=procedimento_consultar_historico&id_procedimento=555&infra_unidade_atual=120000124')">Andamento</a>`;
  w.seiSignatureScanner.collect(actor('p3a'),'2');await new Promise(r=>setTimeout(r,20));
  const remembered=sent.find(m=>m.type==='signature:remember');assert.ok(remembered);assert.equal(remembered.process,'555');assert.equal(remembered.block,'2');assert.match(remembered.url,/procedimento_consultar_historico/);
  assert.equal(calls.length,0);
  w.seiSignatureScanner.collect(actor('p3a'),'2');await new Promise(r=>setTimeout(r,20));assert.equal(sent.filter(m=>m.type==='signature:remember').length,1);
 }finally{w.close();}
});

test('scanner lê primeiro processos com documento aguardando assinatura e os abertos há pouco, sem abandonar o rodízio',async()=>{
 const {w}=reader('120000124');
 const url=p=>`${base}?acao=procedimento_consultar_historico&id_procedimento=${p}&infra_unidade_atual=120000124`;
 const all=Array.from({length:12},(_,i)=>String(i+1));
 let waiting=['9','10','11'],recent=['12','1'];const sent=[],fetched=[];
 w.chrome={runtime:{sendMessage:async msg=>{sent.push(msg);return msg.type==='signature:processes'?{data:{processes:all.map(p=>[p,url(p)]),waiting,recent}}:{data:{ok:true}};}}};
 w.fetch=async value=>{
  const p=new URL(value).searchParams.get('id_procedimento');fetched.push(p);
  if(p==='11')throw Error('SEI fora do ar');
  return new Response(history(p==='9'?[['10:01',insertion]]:[['10:03',signing],['10:01',insertion]]),{headers:{'content-type':'text/html; charset=utf-8'}});
 };
 try{
  w.document.body.innerHTML='<a id="lnkInfraUnidade">SEPM/P3</a>';w.eval(read('signature-monitor.js'));
  const scan=()=>w.seiSignatureScanner.scan(actor('p3a'),'2',new AbortController().signal);
  let result=await scan();
  assert.deepEqual(fetched,['9','10','12','1','2'],'dois aguardando, um recente e dois do rodízio');
  let report=sent.find(m=>m.type==='signature:waiting');assert.deepEqual([...report.read],['9','10','12','1','2']);assert.deepEqual([...report.waiting],['9']);
  assert.equal(result.error,'');assert.equal(result.observations.filter(o=>o.signature).length,4);
  // Next round: the worker moved what was read to the end of the queue; a failing history does not hold it.
  waiting=['11','9'];fetched.length=0;sent.length=0;result=await scan();
  assert.deepEqual(fetched,['11','9','1','3','4']);assert.match(result.error,/Acompanhamento parcial/);
  report=sent.find(m=>m.type==='signature:waiting');assert.deepEqual([...report.read],['11','9','1','3','4']);assert.deepEqual([...report.waiting],['11','9']);
  // Nothing waiting or recent: five from the general rotation, as before.
  waiting=[];recent=[];fetched.length=0;await scan();assert.deepEqual(fetched,['5','6','7','8','9']);
 }finally{w.close();}
});

test('fila de processos aguardando assinatura é da sessão do navegador, por usuário e bloco',async()=>{
 const store=createStore(':memory:');const a=browser(store);
 try{
  const url=p=>`${base}?acao=procedimento_consultar_historico&id_procedimento=${p}&infra_unidade_atual=1&infra_hash=x`;
  await a.call('signature:remember',{process:'10',url:url('10')});
  let view=await a.call('signature:processes');assert.deepEqual([...view.waiting],[]);assert.deepEqual([...view.recent],['10'],'aberto há menos de 30 minutos');
  await a.call('signature:waiting',{read:['10','11','12'],waiting:['10','12']});
  assert.deepEqual([...(await a.call('signature:processes')).waiting],['10','12']);
  // Read again: 10 is still waiting and goes to the end; 12 was signed and leaves.
  await a.call('signature:waiting',{read:['10'],waiting:['10']});await a.call('signature:waiting',{read:['12'],waiting:[]});
  assert.deepEqual([...(await a.call('signature:processes')).waiting],['10']);
  await a.call('signature:waiting',{read:['13'],waiting:['13']});await a.call('signature:waiting',{read:['10'],waiting:['10']});
  assert.deepEqual([...(await a.call('signature:processes')).waiting],['13','10']);
  await assert.rejects(a.call('signature:waiting',{read:['10'],waiting:['11']}),/inválida/);
  await assert.rejects(a.call('signature:waiting',{read:['x'],waiting:[]}),/inválida/);
  await assert.rejects(a.call('signature:waiting',{read:['10'],waiting:[],block:'3'}),/não escolhido/);
  a.session.seiSignatureProcesses[Object.keys(a.session.seiSignatureProcesses)[0]][0][2]=Date.now()-1900000;
  assert.deepEqual([...(await a.call('signature:processes')).recent],[]);
  assert.equal(JSON.stringify(a.local).includes('seiSignatureWaiting'),false);assert.ok(a.session.seiSignatureWaiting);
 }finally{store.close();}
});

test('assinatura com mais de 3 dias não avisa nem fica no painel; a de até 3 dias avisa',async()=>{
 const store=createStore(':memory:');const a=browser(store),b=browser(store),c=browser(store);
 try{
  for(const x of [a,b,c])await x.call('signature:sync');
  await a.call('signature:observe',{observations:[observation()]});
  // B only reads the shared events 4 days later: too old to be news.
  b.later(4*86400000);let view=await b.call('signature:sync');
  assert.equal(view.events.length,0);assert.equal(b.sounds.length,0);assert.equal(b.notices.length,0);
  // The cursor moved on: the old event does not come back on later syncs.
  b.later();view=await b.call('signature:sync');assert.equal(view.events.length,0);assert.equal(b.sounds.length,0);
  // C reads 2 days later: still within the window.
  c.later(2*86400000);view=await c.call('signature:sync');assert.equal(view.events.length,1);assert.equal(c.sounds.length,1);
  // An event already in the panel leaves it once it is older than 3 days.
  c.later(2*86400000);view=await c.call('signature:sync');assert.equal(view.events.length,0);assert.equal(c.sounds.length,1);
 }finally{store.close();}
});
