import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const fixtureNow=Date.now();
const data=(()=>{const w=new JSDOM('',{runScripts:'outside-only'}).window;w.Date=class extends w.Date{constructor(...args){super(...(args.length?args:[fixtureNow]));}static now(){return fixtureNow;}};w.eval(read('document-data.js'));return w.seiDocumentData;})();
const base='https://sei.rj.gov.br/sei/';
const plain=v=>JSON.parse(JSON.stringify(v));
const tree=`<div id="divArvore">Árvore nativa</div><div id="divConsultarAndamento"><a href="#" onclick="consultarAndamento('controlador.php?acao=procedimento_consultar_historico&id_procedimento=900&infra_unidade_atual=1&infra_hash=x');">Consultar Andamento</a></div><div id="divRelacionados"></div><script>
Nos[0] = new infraArvoreNo("PROCESSO","900",null,"#","ifrVisualizacao","SEI-350024/000001/2026","Tipo fictício","svg/p.svg",true,true,"n",null,"n","SEI-350024/000001/2026");
Nos[1] = new infraArvoreNo("DOCUMENTO","901","900","#","ifrConteudoVisualizacao","CI fictícia 7 (555)","CI \\"fictícia\\"","i","i","i",true,true,"n",null,"n","555");
Nos[2] = new infraArvoreNo("DOCUMENTO","902","900","#","ifrConteudoVisualizacao","Despacho 666","Despacho 666","i","i","i",true,false,null,null,"n","666");
NosAcoes[0] = new infraArvoreAcao("UNIDADE_GERADORA","UG901","901","#",null,"Unidade Teste",null,true,"SEPM/5°CPA");
NosAcoes[1] = new infraArvoreAcao("ASSINATURA","A901","901","#","ifrVisualizacao","Assinado por:\\nPessoa Um\\nCoronel\\nSEPM/5°CPA\\nPessoa Dois\\nMajor\\nSEPM/5°CPA","svg/a.svg",true);
NosAcoes[2] = new infraArvoreAcao("UNIDADE_GERADORA","UG902","902","#",null,"Outra",null,true,"SEPM/9° BPM");
</script>`;
const hrow=(time,unit,user,text,open=false)=>`<tr class="${open?'andamentoAberto':'andamentoConcluido'}"><td>${time}</td><td><a title="Nome ${unit}">${unit}</a></td><td><a title="Nome ${user}">${user}</a></td><td>${text}</td></tr>`;
const stamp=d=>d.toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).replace(',','');
const historyRows=[
 hrow(stamp(new Date(fixtureNow-10*60000)),'SEPM/3°CPA','r.rs','Processo recebido na unidade',true),
 hrow(stamp(new Date(fixtureNow-8*86400000)),'SEPM/24° BPM','c.c','Processo atribuído para c.c',true),
 hrow('19/10/2026 15:10','SEPM/5ºCPA','danilo','Documento 555 (CI fictícia 7) retirado do bloco 14'),
 hrow('19/10/2026 15:09','SEPM/24° BPM','m.sdo','Processo remetido pela unidade <a>SEPM/5°CPA</a>'),
 hrow('19/10/2026 15:09','SEPM/3°CPA','m.sdo','Processo remetido pela unidade <a>SEPM/5°CPA</a>'),
 hrow('19/10/2026 15:06','SEPM/EMG','m.sdo','Processo remetido pela unidade <a>SEPM/5°CPA</a>'),
 hrow('19/10/2026 15:05','SEPM/9° BPM','x','Processo inserido no bloco 77'),
 hrow('19/10/2026 15:03','SEPM/5°CPA','d.f','Assinado Documento 555 (CI fictícia 7) por d.f'),
 hrow('19/10/2026 14:58','SEPM/5°CPA','danilo','Documento 555 (CI fictícia 7) inserido no bloco 14'),
 hrow('19/10/2026 14:50','SEPM/5°CPA','danilo','Documento 5550 (Outro) inserido no bloco 15'),
 hrow('19/10/2026 14:47','SEPM/5°CPA','m.sdo','Gerado documento restrito 555 (CI fictícia 7)'),
 hrow('19/10/2026 11:36','SEPM/5°CPA','s.gsm','Processo inserido no bloco 1343'),
];
const historyPage=(rows,toggle)=>`<form id="frmProcedimentoHistorico" action="controlador.php?acao=procedimento_consultar_historico&id_procedimento=900&infra_hash=y"><a id="ancTipoHistorico" onclick="verHistorico('${toggle==='completo'?'C':'R'}');">Ver histórico ${toggle}</a><table id="tblHistorico"><caption>Lista de Andamentos (${rows.length} registros):</caption><tr><th>Data/Hora</th><th>Unidade</th><th>Usuário</th><th>Descrição</th></tr>${rows.join('')}</table><input type="hidden" name="hdnTipoHistorico" value="P"><input type="hidden" name="hdnInfraHashCriterios" value="abc"></form>`;
const blockList=(rows)=>`<table id="tblBlocos"><caption>Lista de Blocos (${rows.length} registros):</caption><tr><th></th><th>Número</th><th>Estado</th><th>Disponibilização</th><th>Descrição</th></tr>${rows.map(([id,desc])=>`<tr><td></td><td><a href="controlador.php?acao=rel_bloco_protocolo_listar&id_bloco=${id}&infra_hash=z">${id}</a></td><td>Gerado</td><td></td><td>${desc}</td></tr>`).join('')}</table>`;
const footer='<table><tr><td><p>Documento assinado eletronicamente por <b>Pessoa Um</b>, <b>Coronel</b>, em 19/10/2026, às 15:03, conforme horário oficial de Brasília, com fundamento</p></td></tr></table>';

test('árvore lê literais sem executar, unidade geradora e signatários',()=>{
 const t=data.parseTree(new JSDOM(tree).window.document.scripts[0].textContent);
 assert.deepEqual({...t.process},{id:'900',number:'SEI-350024/000001/2026',type:'Tipo fictício'});
 const doc=t.document('901');assert.equal(doc.protocol,'555');assert.equal(doc.unit,'SEPM/5°CPA');assert.deepEqual([...doc.signers],['Pessoa Um (Coronel)','Pessoa Dois (Major)']);
 assert.equal(t.document('902').unit,'SEPM/9° BPM');assert.deepEqual([...t.document('902').signers],[]);assert.equal(t.document('999'),null);
 assert.deepEqual(data.calls('new infraArvoreNo("a\\u00e9",x.y, broken','infraArvoreNo').length,0);
});
test('rodapé com vários signatários e minuta sem assinatura',()=>{
 const s=data.parseSignatures(new JSDOM(footer+footer.replace('Pessoa Um','Pessoa Dois').replace('Coronel','Major').replace('15:03','16:20')).window.document.body.textContent);
 assert.deepEqual(plain(s.map(x=>[x.name,x.role,x.time.getHours(),x.time.getMinutes()])),[['Pessoa Um','Coronel',15,3],['Pessoa Dois','Major',16,20]]);
 assert.deepEqual([...data.parseSignatures('<p>Minuta sem assinatura</p>')],[]);
});
test('andamento: último envio em lote, aberto, blocos atuais e só eventos da unidade',()=>{
 const page=data.parseHistory(new JSDOM(historyPage(historyRows,'resumido')).window.document);
 assert.equal(page.rows.length,historyRows.length);assert.equal(page.complete,true);assert.equal(page.partial,false);
 const s=data.summarize(page.rows,'555','SEPM/5ºCPA');
 assert.equal(s.generatedUnit,'SEPM/5°CPA');assert.equal(s.signed[0].user,'d.f');
 assert.deepEqual(plain(s.lastSend.destinations.map(d=>d.unit)),['SEPM/24° BPM','SEPM/3°CPA']);assert.equal(s.lastSend.user,'m.sdo');assert.equal(s.lastSend.name,'Nome m.sdo');assert.equal(s.lastSend.afterDocument,true);
 assert.deepEqual(plain(s.open.map(o=>[o.unit,o.own])),[['SEPM/3°CPA',false],['SEPM/24° BPM',false]]);
 assert.deepEqual(plain(s.documentBlocks),[]);assert.deepEqual(plain(s.processBlocks.map(b=>b.id)),['1343']);
 const before=data.summarize(page.rows.slice(3),'555','SEPM/5°CPA');assert.deepEqual(plain(before.documentBlocks.map(b=>b.id)),['14']);
 const late=data.summarize(page.rows.filter(r=>!/remetido/.test(r.text)),'555','SEPM/5°CPA');assert.equal(late.lastSend,null);
 const old=data.summarize([...page.rows,{...page.rows[3],time:new Date(2026,9,1)}].filter((r,i)=>i!==3&&i!==4&&i!==5),'555','SEPM/5°CPA');assert.equal(old.lastSend.afterDocument,false);
 const toggle=data.parseHistory(new JSDOM(historyPage(historyRows.slice(0,2),'completo')).window.document);assert.equal(toggle.complete,false);assert.equal(toggle.completeValue,'C');
});
test('chegada usa a última remessa destinada à unidade e separa remetente de recebedor',()=>{
 const rows=[
  hrow('25/10/2026 11:00','SEPM/5ºCPA','recebedor','Processo recebido na unidade'),
  hrow('24/10/2026 09:00','SEPM/5°CPA','antigo','Processo remetido pela unidade SEPM/ANTIGA'),
  hrow('25/10/2026 10:00','sepm/5ºcpa','remetente','Processo remetido pela unidade SEPM/ORIGEM'),
  hrow('26/10/2026 12:00','SEPM/OUTRA','colega','Processo remetido pela unidade SEPM/5°CPA'),
 ];
 const parsed=data.parseHistory(new JSDOM(historyPage(rows,'resumido')).window.document);
 const arrival=data.summarize(parsed.rows,null,'SEPM/5°CPA').lastArrival;
 assert.equal(arrival.origin,'SEPM/ORIGEM');assert.equal(arrival.user,'remetente');assert.equal(arrival.name,'Nome remetente');
 assert.equal(stamp(arrival.sentAt),'25/10/2026 10:00');assert.equal(stamp(arrival.receivedAt),'25/10/2026 11:00');
 const next=data.parseHistory(new JSDOM(historyPage([...rows,hrow('27/10/2026 08:00','SEPM/5°CPA','novo','Processo remetido pela unidade SEPM/NOVA')],'resumido')).window.document);
 const latest=data.summarize(next.rows,null,'SEPM/5°CPA').lastArrival;
 assert.equal(latest.user,'novo');assert.equal(latest.receivedAt,null);
 const onlyReceipt=data.summarize(parsed.rows.slice(0,1),null,'SEPM/5°CPA').lastArrival;
 assert.equal(onlyReceipt.user,'');assert.equal(onlyReceipt.origin,null);assert.equal(onlyReceipt.sentAt,null);
 assert.equal(data.summarize(parsed.rows.slice(3),null,'SEPM/5°CPA').lastArrival,null);
});

test('card mostra chegada no resumo e documento, sem atribuir o envio ao recebedor',async()=>{
 const rows=[hrow('25/10/2026 11:00','SEPM/5°CPA','recebedor','Processo recebido na unidade'),hrow('25/10/2026 10:00','SEPM/5°CPA','remetente','Processo remetido pela unidade SEPM/ORIGEM')];
 for(const action of ['procedimento_visualizar','documento_visualizar']){
  const f=frame({action,rows});try{await f.done;
   const entry=[...f.badge().querySelectorAll('li')].find(li=>li.querySelector('b')?.textContent==='Chegada à unidade');
   assert.ok(entry);assert.match(entry.textContent,/Recebido em 25\/10\/2026, 11:00/);assert.match(entry.textContent,/Envio à unidade em 25\/10\/2026, 10:00/);
   assert.match(entry.textContent,/De SEPM\/ORIGEM/);assert.match(entry.textContent,/Enviado por Nome remetente \(remetente\)/);assert.doesNotMatch(entry.textContent,/recebedor/);
  }finally{f.leave();}
 }
});

test('chegada informa remetente ausente, recebimento ausente e histórico incompleto',async()=>{
 for(const [rows,partial,expected] of [
  [[hrow('25/10/2026 11:00','SEPM/5°CPA','recebedor','Processo recebido na unidade')],false,/Remetente não encontrado/],
  [[hrow('25/10/2026 10:00','SEPM/5°CPA','remetente','Processo remetido pela unidade SEPM/ORIGEM')],true,/Recebimento não encontrado/],
  [[],false,/Nenhuma entrada encontrada/],
 ]){
  let html=historyPage(rows,'resumido');if(partial)html=html.replace('(1 registros)','(50 registros)');
  const f=frame({action:'procedimento_visualizar',historyHTML:html});try{await f.done;
   const entry=[...f.badge().querySelectorAll('li')].find(li=>li.querySelector('b')?.textContent==='Chegada à unidade');
   assert.match(entry.textContent,expected);if(partial)assert.match(entry.textContent,/Histórico incompleto/);
  }finally{f.leave();}
 }
});

test('inclusão em bloco usa a última entrada após retirada, por bloco e unidade',()=>{
 const rows=[
  hrow('26/10/2026 10:00','SEPM/5ºCPA','novo','Processo inserido no bloco 1343'),
  hrow('24/10/2026 08:00','SEPM/5°CPA','antigo','Processo inserido no bloco 1343'),
  hrow('27/10/2026 12:00','SEPM/OUTRA','externo','Processo inserido no bloco 1343'),
  hrow('25/10/2026 09:00','SEPM/5°CPA','retirou','Processo retirado do bloco 1343'),
  hrow('25/10/2026 09:30','SEPM/5°CPA','segundo','Processo inserido no bloco 2000'),
  hrow('26/10/2026 09:00','SEPM/5°CPA','retirou','Processo retirado do bloco 2000'),
  hrow('24/10/2026 11:00','SEPM/5°CPA','terceiro','Processo inserido no bloco 3000'),
  hrow('27/10/2026 13:00','SEPM/5°CPA','documento','Documento 555 inserido no bloco 1343'),
 ];
 const parsed=data.parseHistory(new JSDOM(historyPage(rows,'resumido')).window.document);
 const blocks=data.summarize(parsed.rows,'555','SEPM/5°CPA').processBlocks;
 assert.deepEqual(plain(blocks.map(b=>b.id)),['3000','1343']);
 const latest=blocks.find(b=>b.id==='1343');assert.equal(stamp(latest.since),'26/10/2026 10:00');assert.equal(latest.user,'novo');assert.equal(latest.name,'Nome novo');
 assert.equal(blocks.find(b=>b.id==='3000').user,'terceiro');
});

test('card mostra inclusão no bloco com data e autor, preservada após sincronização',async()=>{
 for(const action of ['procedimento_visualizar','documento_visualizar']){
  const f=frame({action});try{await f.done;
   const entry=()=>[...f.badge().querySelectorAll('li')].find(li=>li.querySelector('b')?.textContent==='Bloco interno');
   assert.match(entry().textContent,/Incluído no bloco em 19\/10\/2026, 11:36/);assert.match(entry().textContent,/Incluído por Nome s.gsm \(s.gsm\)/);
   f.tick();await settle();assert.match(entry().textContent,/Incluído no bloco em 19\/10\/2026, 11:36/);assert.match(entry().textContent,/Incluído por Nome s.gsm \(s.gsm\)/);
   assert.equal(entry().querySelectorAll('.organizer').length,1);
  }finally{f.leave();}
 }
 const html=historyPage([hrow('25/10/2026 10:00','SEPM/5°CPA','incluiu','Processo inserido no bloco 1343')],'resumido').replace('(1 registros)','(50 registros)');
 const partial=frame({action:'procedimento_visualizar',historyHTML:html});try{await partial.done;assert.match(partial.badge().textContent,/Última inclusão encontrada; histórico incompleto/);}finally{partial.leave();}
});

test('card prioriza controles e distingue chegada, atividade e alertas de outras unidades',async()=>{
 const rows=[hrow('25/10/2026 11:00','SEPM/5°CPA','recebeu','Processo recebido na unidade',true),hrow('25/10/2026 10:00','SEPM/5°CPA','enviou','Processo remetido pela unidade SEPM/ORIGEM'),...historyRows];
 const f=frame({action:'procedimento_visualizar',rows});try{await f.done;const root=f.badge(),list=root.querySelector('ul');
  const items=[...list.children];assert.ok(items.indexOf(list.querySelector('.block-section'))<items.indexOf(list.querySelector('.activity-section')));
  assert.equal(list.lastElementChild.className,'type-section');assert.equal(root.querySelector('.type-section details').open,false);
  const steps=root.querySelectorAll('.arrival-section .timeline');assert.equal(steps.length,2);assert.match(steps[0].textContent,/Envio à unidade/);assert.match(steps[1].textContent,/Recebido em.*Acesso que registrou/);
  assert.match(root.textContent,/Tempo desde a última movimentação nesta unidade, não desde a chegada/);
  assert.match(root.querySelector('.idle').textContent,/Alerta de outra unidade/);
  assert.match(root.querySelector('.organizer label').textContent,/Status manual/);
 }finally{f.leave();}
});

test('card preserva resumo fora do bloco escolhido sem expor classificações de outros blocos',async()=>{
 const blocked=frame({action:'procedimento_visualizar',scope:{ready:Promise.resolve(),block:'999',allows:id=>id==='999'}});
 await blocked.done;assert.ok(blocked.badge());assert.match(blocked.badge().textContent,/Última movimentação/);assert.match(blocked.badge().textContent,/Nenhuma inclusão no bloco 999 encontrada/);assert.equal(blocked.badge().querySelector('.organizer'),null);assert.equal(blocked.messages.length,0);blocked.leave();
 const allowed=frame({action:'procedimento_visualizar',scope:{ready:Promise.resolve(),block:'1343',allows:id=>id==='1343'}});
 try{await allowed.done;assert.ok(allowed.badge());assert.ok(allowed.messages.every(m=>m.block==='1343'));}finally{allowed.leave();}
});

test('card permanece visível sem bloco escolhido e quando o histórico parcial não confirma inclusão',async()=>{
 const scope={ready:Promise.resolve(),block:null,allows:()=>false};const fresh=frame({action:'procedimento_visualizar',scope});
 try{await fresh.done;assert.ok(fresh.badge());assert.match(fresh.badge().textContent,/Escolha um bloco de trabalho nas opções/);assert.equal(fresh.messages.length,0);}finally{fresh.leave();}
 const html=historyPage([hrow('25/10/2026 10:00','SEPM/5°CPA','teste','Processo recebido na unidade')],'resumido').replace('(1 registros)','(50 registros)');
 const partial=frame({action:'procedimento_visualizar',historyHTML:html,scope:{ready:Promise.resolve(),block:'1343',allows:id=>id==='1343'}});
 try{await partial.done;assert.ok(partial.badge());assert.match(partial.badge().textContent,/Não foi possível confirmar a inclusão no bloco 1343: histórico incompleto/);assert.equal(partial.messages.length,0);}finally{partial.leave();}
});

test('tempo parado por faixa e lista de blocos',()=>{
 const now=new Date(2026,9,19,12,0);
 assert.deepEqual({...data.age(new Date(2026,9,19,11,15),now)},{text:'45 min',level:'ok'});
 assert.deepEqual({...data.age(new Date(2026,9,19,7,0),now)},{text:'5 h',level:'ok'});
 assert.deepEqual({...data.age(new Date(2026,9,18,11,0),now)},{text:'1 dia',level:'ok'});
 assert.deepEqual({...data.age(new Date(2026,9,16,12,0),now)},{text:'3 dias',level:'warn'});
 assert.deepEqual({...data.age(new Date(2026,9,12,12,0),now)},{text:'7 dias',level:'alert'});
 const list=data.parseBlockList(new JSDOM(blockList([['1343','Restituições']])).window.document);
 assert.equal(list.partial,false);assert.deepEqual({...list.blocks.get('1343')},{id:'1343',description:'Restituições',state:'Gerado',available:''});
 assert.equal(data.parseBlockList(new JSDOM('<p>login</p>').window.document),null);
});

function frame({autoLoad=true,scope,action='documento_visualizar',processId='900',documentId='901',unitParam='1',org='SEPM',historyToggle='completo',historyStatus=200,historyHTML=null,historyFetcher=null,apiHandler=null,organizer,rows=historyRows,body=footer,signatureList=[],gate=null,treeDom=new JSDOM(tree,{url:`${base}controlador.php?acao=procedimento_visualizar&id_procedimento=900`}),store=new Map()}={}){
 const docDom=new JSDOM(action==='procedimento_visualizar'?treeDom.serialize():`<title>SEI/ERJ - 555 - CI</title><p class="Texto">Conteúdo nativo</p>${body}`,{pretendToBeVisual:true,url:`${base}controlador.php?acao=${action}&${action==='documento_visualizar'?`id_documento=${documentId}`:`id_procedimento=${processId}`}&infra_unidade_atual=${unitParam}&infra_hash=d`});
 if(action==='procedimento_visualizar')treeDom=docDom;
 const topDom=new JSDOM(`<a id="lnkUsuarioSistema" title="Pessoa Teste (teste/${org})"></a><a id="lnkInfraUnidade">SEPM/5°CPA</a><a href="controlador.php?acao=bloco_interno_listar&infra_hash=i">Internos</a><a href="controlador.php?acao=bloco_assinatura_listar&infra_hash=a">Assinatura</a><iframe id="ifrArvore"></iframe>`,{url:`${base}controlador.php?acao=procedimento_trabalhar&id_procedimento=900`});
 const topDoc=topDom.window.document,getById=topDoc.getElementById.bind(topDoc);topDoc.getElementById=id=>id==='ifrArvore'?{contentDocument:treeDom.window.document}:getById(id);
 const requests=[],messages=[];let state=organizer||{version:3,tabs:[{id:'t1',name:'Restituições'},{id:'t2',name:'Pessoal'}],assignments:{'900':['t1']},statuses:{'900':'attention'}};
 const page=html=>new Response(Buffer.from(html,'latin1'),{headers:{'content-type':'text/html; charset=iso-8859-1'}});
 const fetch=async(url,init={})=>{requests.push({url:url.toString(),init});const u=new URL(url);const acao=u.searchParams.get('acao');
  if(acao==='procedimento_consultar_historico'){if(historyFetcher)return historyFetcher(url,init);if(gate)await gate;}if(acao==='procedimento_consultar_historico')return historyStatus!==200?new Response('erro',{status:historyStatus}):page(historyHTML??(init.method==='POST'?historyPage(rows,'resumido'):historyPage(rows.slice(0,1),historyToggle)));
  if(acao==='bloco_interno_listar')return page(blockList([['1343','Restituições SEPM']]));
  if(acao==='bloco_assinatura_listar')return page(blockList(signatureList));
  return new Response('',{status:404});};
 const chrome={runtime:{sendMessage:async msg=>{messages.push(msg);if(apiHandler)return apiHandler(msg);if(msg.body){state={...state,version:state.version+1,statuses:{'900':msg.body.action.status||'attention'}};}return {data:state};}}};
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 const timers=new Map();let timerId=0;
 const listeners={};const fakeWindow={addEventListener:(type,fn)=>{listeners[type]=fn;}};fakeWindow.top={document:topDoc};
 const context={window:fakeWindow,document:docDom.window.document,location:docDom.window.location,URL,URLSearchParams,AbortSignal,AbortController,TextDecoder,Response,DOMParser:docDom.window.DOMParser,fetch,chrome,sessionStorage:storage,localStorage:storage,setTimeout,console,
  setInterval:(fn,ms)=>{const id=++timerId;timers.set(id,{fn,ms});return id;},clearInterval:id=>timers.delete(id),
  SEI_ORGANIZADOR_CONFIG:{serviceUrl:'https://ext.5cpa.com.br',unitId:'1',org:'SEPM'},seiDocumentData:data};
 if(scope)context.seiWorkScope=scope;
 runInNewContext(read('history.js'),context);
 runInNewContext(read('history-pages.js'),context);
 const initial=runInNewContext(read('document.js'),context);
 const done=initial.then(async()=>{
  const load=treeDom.window.document.querySelector('#sei-organizador-documento')?.shadowRoot.querySelector('.load-history');
  if(autoLoad && load)await load.onclick();
 });
 return {done,publish:page=>context.seiFullHistory.write(processId,{login:'teste',org},page,topDoc),doc:docDom.window.document,tree:treeDom.window.document,treeDom,store,requests,messages,timers,tick:()=>{for(const {fn} of timers.values())fn();},leave:()=>listeners.pagehide?.(),badge:()=>treeDom.window.document.querySelector('#sei-organizador-documento')?.shadowRoot};
}
const settle=()=>new Promise(r=>setTimeout(r,30));
test('badge mostra assinatura, último envio, tempo parado e bloco interno com organizador',async()=>{
 const f=frame();await f.done;await settle();const root=f.badge();assert.ok(root);
 assert.equal(f.tree.querySelector('#divConsultarAndamento').nextElementSibling.id,'sei-organizador-documento');assert.equal(f.tree.querySelector('#divArvore').textContent,'Árvore nativa');
 assert.equal(f.doc.querySelector('#sei-organizador-documento'),null);assert.equal(f.doc.querySelector('p.Texto').textContent,'Conteúdo nativo');
 const text=root.textContent;assert.match(root.querySelector('h2').textContent,/^SEI OrganizadorCI fictícia 7 \(555\)$/);
 assert.match(text,/Pessoa Um \(Coronel\) · 19\/10\/2026/);
 assert.match(text,/Último envio: 19\/10\/2026.*15:09 · 2 destinos→ SEPM\/24° BPM→ SEPM\/3°CPApor Nome m\.sdo \(m\.sdo\)/);
 const units=root.querySelector('details.open-units');assert.ok(units);assert.equal(units.open,false);
 assert.match(units.querySelector('summary').textContent,/Aberto em 2 unidades · maior tempo parado: 8 dias/);
 assert.match(units.querySelector('.open-units-list').textContent,/SEPM\/3°CPAhá 10 minSEPM\/24° BPMhá 8 dias/);assert.equal(root.querySelectorAll('.unit').length,2);
 assert.equal(root.querySelector('.idle').closest('details'),null);units.open=true;
 assert.equal(root.querySelectorAll('.age[data-level="alert"]').length,1);
 assert.match(text,/Bloco internonº 1343 · “Restituições SEPM” · Gerado/);assert.match(text,/Assunto: Restituições/);
 const select=root.querySelector('select');assert.equal(select.value,'attention');
 const post=f.requests.find(r=>r.init.method==='POST');assert.ok(post);assert.match(post.init.body.toString(),/hdnTipoHistorico=C/);assert.match(post.init.body.toString(),/hdnInfraHashCriterios=abc/);
 for(const r of f.requests){assert.ok(r.url.startsWith(base+'controlador.php?'));assert.equal(r.init.credentials,'same-origin');}
 assert.equal(f.requests.some(r=>/bloco_assinatura_listar/.test(r.url)),false);
 assert.deepEqual(plain(f.messages.map(m=>[m.type,m.unit,m.block,m.body??null])),[['api','1','1343',null]]);
 f.tick();await settle();assert.equal(units.open,true);
 select.value='urgent';select.dispatchEvent(new f.doc.defaultView.Event('change'));await settle();
 const sent=f.messages.at(-1);assert.equal(sent.block,'1343');assert.deepEqual(plain(sent.body.actor),{name:'Pessoa Teste',login:'teste',org:'SEPM'});
 assert.deepEqual(plain(sent.body.action),{type:'status',status:'urgent',processIds:['900'],processNumbers:{'900':'SEI-350024/000001/2026'}});assert.equal(sent.body.version,3);
 assert.match(f.badge().textContent,/Alteração salva\./);assert.equal(f.badge().querySelector('select').value,'urgent');
});
test('badge não aparece para outra unidade atual ou outro órgão',async()=>{
 for(const options of [{unitParam:'2'},{org:'OUTRO'}]){const f=frame(options);await f.done;await settle();assert.equal(f.badge(),undefined);assert.equal(f.requests.length,0);assert.equal(f.messages.length,0);}
});
test('ocultar fica lembrado e andamento indisponível mostra erro sem quebrar o documento',async()=>{
 const f=frame({historyToggle:'resumido'});await f.done;await settle();const root=f.badge();
 assert.equal(f.requests.filter(r=>r.init.method==='POST').length,0);
 const toggle=root.querySelector('.toggle');assert.equal(toggle.getAttribute('aria-expanded'),'true');toggle.click();assert.equal(root.querySelector('ul').hidden,true);assert.equal(toggle.textContent,'Mostrar');
 const again=frame({store:f.store});await again.done;await settle();assert.equal(again.badge().querySelector('ul').hidden,true);
 const fresh=frame();await fresh.done;await settle();assert.equal(fresh.badge().querySelector('ul').hidden,false);
 const failed=frame({historyStatus:500});await failed.done;await settle();assert.match(failed.badge().textContent,/AndamentoNão foi possível consultar: SEI respondeu HTTP 500/);assert.match(failed.badge().textContent,/Pessoa Um \(Coronel\)/);assert.equal(failed.doc.querySelector('p.Texto').textContent,'Conteúdo nativo');assert.equal(failed.messages.length,0);
});
test('card fica abaixo de Consultar Andamento, é trocado pelo documento aberto e sai com ele',async()=>{
 const f=frame();await f.done;await settle();assert.equal(f.tree.querySelectorAll('#sei-organizador-documento').length,1);
 const other=frame({documentId:'902',treeDom:f.treeDom});await other.done;await settle();assert.equal(f.tree.querySelector('#sei-organizador-documento').dataset.mode,'process');assert.match(other.badge().textContent,/Última movimentação/);
 const again=frame({treeDom:f.treeDom});await again.done;await settle();assert.equal(f.tree.querySelectorAll('#sei-organizador-documento').length,1);
 again.leave();assert.equal(f.tree.querySelector('#sei-organizador-documento'),null);assert.ok(f.tree.querySelector('#divConsultarAndamento a'));
 const missing=frame({treeDom:new JSDOM(tree.replace('id="divConsultarAndamento"','id="outro"'),{url:base+'controlador.php'})});await missing.done;await settle();assert.equal(missing.badge(),undefined);assert.equal(missing.requests.length,0);
});
test('documento sem assinatura em bloco mostra aguardando assinatura na própria linha',async()=>{
 const unsignedTree=tree.replace(/NosAcoes\[1\][^\n]*\n/,'');
 const rows=historyRows.filter(r=>!/retirado do bloco 14|Assinado Documento/.test(r));
 const f=frame({body:'<p>Minuta</p>',rows,signatureList:[['14','COMANDANTE 5º CPA']],treeDom:new JSDOM(unsignedTree,{url:base+'controlador.php?acao=procedimento_visualizar'})});await f.done;await settle();
 const text=f.badge().textContent;assert.match(text,/Assinatura✎ Aguardando assinatura · bloco nº 14 \(COMANDANTE 5º CPA\)/);assert.doesNotMatch(text,/Não assinado|Bloco de assinatura/);
 const signed=frame({rows,signatureList:[['14','COMANDANTE 5º CPA']]});await signed.done;await settle();assert.match(signed.badge().textContent,/Pessoa Um \(Coronel\) · 19\/10\/2026.*No bloco nº 14 \(COMANDANTE 5º CPA\)/);
 assert.equal(signed.badge().querySelector('.organizer select').closest('label').textContent.startsWith('Status manual'),true);
});

const pendingTree=tree.replace('</script>',`Nos[3] = new infraArvoreNo("DOCUMENTO","903","900","#","ifrConteudoVisualizacao","Despacho 777","Despacho 777","svg/documento_interno.svg?25","i","i",true,false,null,null,"n","777");
Nos[4] = new infraArvoreNo("DOCUMENTO","904","900","#","ifrConteudoVisualizacao","Anexo (888)","Anexo (888)","svg/documento_pdf.svg?25","i","i",true,false,null,null,"n","888");
Nos[5] = new infraArvoreNo("DOCUMENTO","905","900","#","ifrConteudoVisualizacao","Despacho 999","Despacho 999","svg/documento_interno.svg?25","i","i",true,false,null,null,"n","999");
NosAcoes[3] = new infraArvoreAcao("UNIDADE_GERADORA","UG903","903","#",null,"Unidade Teste",null,true,"SEPM/5°CPA");
NosAcoes[4] = new infraArvoreAcao("UNIDADE_GERADORA","UG904","904","#",null,"Unidade Teste",null,true,"SEPM/5°CPA");
NosAcoes[5] = new infraArvoreAcao("UNIDADE_GERADORA","UG905","905","#",null,"Unidade Teste",null,true,"SEPM/5°CPA");
NosAcoes[6] = new infraArvoreAcao("ASSINATURA","A905","905","#","ifrVisualizacao","Assinado por:","svg/a.svg",true);
</script>`);
const treeOf=source=>new JSDOM(source,{url:`${base}controlador.php?acao=procedimento_visualizar&id_procedimento=900`});
test('pendências: só documentos internos da unidade sem nenhuma assinatura',()=>{
 const t=data.parseTree(new JSDOM(pendingTree).window.document.scripts[0].textContent);
 assert.deepEqual(plain(t.pending('SEPM/5ºCPA')),[{id:'903',protocol:'777',title:'Despacho 777'}]);
 assert.deepEqual(plain(t.pending('SEPM/9° BPM')),[]);
});
test('card mostra pendências em qualquer documento do processo',async()=>{
 const other=frame({documentId:'902',treeDom:treeOf(pendingTree)});await other.done;await settle();const root=other.badge();
 assert.match(root.querySelector('h2').textContent,/Processo SEI-350024\/000001\/2026/);
 assert.match(root.textContent,/Pendências antes de enviar⚠ Despacho 777 sem assinatura/);
 assert.match(root.textContent,/Última movimentação/);assert.doesNotMatch(root.textContent,/Assinatura✔|Assinatura✎/);
 assert.ok(other.requests.length>0);assert.ok(other.messages.length>0);
 const own=frame({treeDom:treeOf(pendingTree)});await own.done;await settle();const items=own.badge().querySelectorAll('li');
 assert.match(items[0].textContent,/^Pendências antes de enviar⚠ Despacho 777 sem assinatura$/);assert.match(items[1].textContent,/^Assinatura✔ Pessoa Um/);
});

function sendFrame({protocols='900',processId='900',source=pendingTree,answer=false}={}){
 const dom=new JSDOM(`<form id="frmAtividadeListar"><div id="divInfraBarraComandosSuperior" class="infraBarraComandos"><button type="submit" id="sbmEnviar">Enviar</button></div><div id="divProcedimentos">Processos</div><input type="hidden" id="hdnIdProtocolos" value="${protocols}"></form>`,{url:`${base}controlador.php?acao=procedimento_enviar&acao_origem=arvore_visualizar&id_procedimento=${processId}&arvore=1&infra_unidade_atual=1`});
 const topDom=new JSDOM(`<a id="lnkUsuarioSistema" title="Pessoa Teste (teste/SEPM)"></a><a id="lnkInfraUnidade">SEPM/5°CPA</a>`,{url:`${base}controlador.php?acao=procedimento_trabalhar`});
 const treeDom=treeOf(source),topDoc=topDom.window.document;const getById=topDoc.getElementById.bind(topDoc);topDoc.getElementById=id=>id==='ifrArvore'?{contentDocument:treeDom.window.document}:getById(id);
 const listeners=[],questions=[];const fakeWindow={top:{document:topDoc},addEventListener:(type,fn,capture)=>{listeners.push({type,fn,capture});dom.window.addEventListener(type,fn,capture);}};
 const context={window:fakeWindow,document:dom.window.document,location:dom.window.location,URL,setTimeout,console,confirm:q=>{questions.push(q);return answer;},SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'},seiDocumentData:data};
 const done=runInNewContext(read('send.js'),context);
 const dispatch=(type,target)=>{const e={target,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const l of listeners)if(l.type===type)l.fn(e);return e;};
 const click=target=>dispatch('click',target);
 const submit=()=>dispatch('submit',dom.window.document.querySelector('form'));
 return {done,doc:dom.window.document,listeners,questions,click,submit,banner:()=>dom.window.document.querySelector('#sei-organizador-envio')?.shadowRoot,set answer(v){answer=v;}};
}
test('enviar processo: aviso acima da lista e confirmação antes do envio nativo',async()=>{
 const f=sendFrame();await f.done;const banner=f.banner();assert.ok(banner);
 assert.equal(f.doc.querySelector('#divProcedimentos').previousElementSibling.id,'sei-organizador-envio');
 assert.match(banner.textContent,/Documento de SEPM\/5°CPA sem assinatura neste processo:Despacho 777/);assert.doesNotMatch(banner.textContent,/Anexo|999/);
 assert.equal(f.listeners.length,2);assert.ok(f.listeners.every(l=>l.capture===true));
 const other=f.click(f.doc.querySelector('#divProcedimentos'));assert.equal(f.questions.length,0);assert.equal(other.prevented,false);
 const cancel=f.click(f.doc.querySelector('#sbmEnviar'));assert.equal(f.questions.length,1);assert.match(f.questions[0],/• Despacho 777/);assert.equal(cancel.prevented,true);assert.equal(cancel.stopped,true);
 f.answer=true;const ok=f.click(f.doc.querySelector('#sbmEnviar'));assert.equal(ok.prevented,false);assert.equal(f.questions.length,2);
 const again=f.click(f.doc.querySelector('#sbmEnviar'));assert.equal(again.prevented,false);assert.equal(f.questions.length,2);
});
test('enviar processo sem pendência, em lote ou com árvore de outro processo não interfere',async()=>{
 for(const options of [{source:tree},{protocols:'900,901'},{processId:'901',protocols:'901'}]){const f=sendFrame(options);await f.done;assert.equal(f.banner(),undefined);assert.equal(f.listeners.length,0);}
});
test('alerta de tempo parado no topo do card, visível mesmo oculto',async()=>{
 const f=frame();await f.done;await settle();const root=f.badge(),alert=root.querySelector('.idle');
 assert.equal(alert.textContent,'⏱ Parado há 8 dias em SEPM/24° BPMAlerta de outra unidade; não indica atraso na sua unidade.');assert.equal(alert.dataset.level,'alert');assert.equal(root.querySelector('section').dataset.idle,'alert');
 assert.equal(alert.nextElementSibling.tagName,'UL');root.querySelector('.toggle').click();assert.equal(root.querySelector('ul').hidden,true);assert.equal(alert.hidden,false);
 const days=n=>stamp(new Date(fixtureNow-n*86400000));
 const rows=[hrow(days(4),'SEPM/5°CPA','a','Processo recebido na unidade',true),hrow(days(3.5),'SEPM/EMG','b','Processo recebido na unidade',true),hrow(days(1),'SEPM/3°CPA','c','Processo recebido na unidade',true),...historyRows.slice(2)];
 const warn=frame({rows});await warn.done;await settle();const w=warn.badge().querySelector('.idle');
 assert.equal(w.dataset.level,'warn');assert.match(w.textContent,/^⏱ Parado há 4 dias nesta unidadee mais 1 unidade parada há 3 dias ou maisTempo desde a última movimentação na sua unidade\.$/);assert.match(w.title,/SEPM\/EMG: desde/);
 const fresh=frame({rows:[hrow(days(0.1),'SEPM/3°CPA','c','Processo recebido na unidade',true),...historyRows.slice(2)]});await fresh.done;await settle();
 assert.equal(fresh.badge().querySelector('.idle'),null);assert.equal(fresh.badge().querySelector('section').dataset.idle,undefined);
 assert.match(fresh.badge().querySelector('.open-units > summary').textContent,/^Aberto em 1 unidade · maior tempo parado:/);
 assert.equal(fresh.badge().querySelector('.open-units').querySelectorAll('.unit').length,1);
});
test('documento aberto não se repete nas pendências, que seguem listando os demais',async()=>{
 const open=frame({documentId:'903',body:'<p>Minuta</p>',treeDom:treeOf(pendingTree)});await open.done;await settle();
 assert.doesNotMatch(open.badge().textContent,/Pendências/);assert.match(open.badge().textContent,/Assinatura✎ Não assinado/);
 const twoPending=pendingTree.replace('NosAcoes[6]','NosAcoes[7]').replace('"A905"','"A999"').replace('"A999","905"','"A999","999"');
 const f=frame({documentId:'905',treeDom:treeOf(twoPending)});await f.done;await settle();
 assert.match(f.badge().textContent,/Pendências antes de enviar⚠ Despacho 777 sem assinatura/);assert.doesNotMatch(f.badge().textContent,/Despacho 999 sem assinatura/);
});
test('animação de carregamento enquanto o andamento não chega, removida ao concluir ou falhar',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const f=frame({gate});await settle();const root=f.badge(),section=root.querySelector('section');
 assert.equal(section.getAttribute('aria-busy'),'true');assert.equal(root.querySelector('header').nextElementSibling.className,'progress');
 assert.equal(root.querySelectorAll('.skeleton').length,3);assert.match(root.textContent,/AndamentoCarregando…/);
 assert.match(root.querySelector('style').textContent,/prefers-reduced-motion: reduce/);
 release();await f.done;await settle();
 assert.equal(section.hasAttribute('aria-busy'),false);assert.equal(root.querySelector('.progress'),null);assert.equal(root.querySelectorAll('.skeleton').length,0);assert.match(root.textContent,/Último envio/);
 const failed=frame({historyStatus:500});await failed.done;await settle();
 assert.equal(failed.badge().querySelector('.progress'),null);assert.equal(failed.badge().querySelector('section').hasAttribute('aria-busy'),false);assert.match(failed.badge().textContent,/Não foi possível consultar/);
});

test('histórico inválido, vazio ou parcial não declara processo concluído',async()=>{
 assert.throws(()=>data.parseHistory(new JSDOM('<form>Login do SEI</form>').window.document),/Andamento não reconhecido/);
 const login=frame({historyHTML:'<form>Login do SEI</form>'});await login.done;
 assert.match(login.badge().textContent,/Não foi possível consultar: Andamento não reconhecido/);
 assert.doesNotMatch(login.badge().textContent,/concluído|ainda não enviado/);
 const rows=[hrow('19/10/2026 10:00','SEPM/5°CPA','teste','Gerado documento 555')];
 for(const html of [historyPage([],'resumido'),historyPage(rows,'resumido').replace('(1 registros)','(20 registros)'),historyPage(rows,'completo')]){
  const f=frame({historyHTML:html});await f.done;
  assert.match(f.badge().textContent,/Não foi possível confirmar as unidades abertas/);
  assert.doesNotMatch(f.badge().textContent,/concluído|ainda não enviado/);
 }
 const complete=frame({historyHTML:historyPage(rows,'resumido')});await complete.done;
 assert.match(complete.badge().textContent,/Processo sem unidade aberta \(concluído\)/);
});

test('card sincroniza colegas, ignora página oculta e encerra consultas ao sair ou ser substituído',async()=>{
 let state={version:3,tabs:[{id:'t1',name:'Pessoal'}],assignments:{},statuses:{'900':'attention'}};
 const f=frame({apiHandler:async()=>({data:state})});await f.done;
 assert.equal([...f.timers.values()][0].ms,10000);
 state={...state,version:4,assignments:{'900':['t1']},statuses:{'900':'urgent'}};
 Object.defineProperty(f.doc,'hidden',{configurable:true,value:true});
 f.tick();await settle();assert.equal(f.messages.length,1);
 Object.defineProperty(f.doc,'hidden',{configurable:true,value:false});
 f.tick();await settle();assert.equal(f.badge().querySelector('select').value,'urgent');
 assert.match(f.badge().textContent,/Assunto: Pessoal/);
 f.leave();f.tick();await settle();assert.equal(f.timers.size,0);assert.equal(f.messages.length,2);
 const old=frame();await old.done;
 const replacement=frame({treeDom:old.treeDom});await replacement.done;
 old.tick();await settle();assert.equal(old.timers.size,0);assert.equal(old.messages.length,1);
 assert.ok(replacement.badge());replacement.leave();
});

test('card bloqueia dados antigos após falha de gravação e recuperação, e reconecta',async()=>{
 const state={version:3,tabs:[{id:'t1',name:'Pessoal'}],assignments:{},statuses:{'900':'attention'}};
 let offline=false;
 const f=frame({apiHandler:async()=>{if(offline)throw new Error('Serviço indisponível');return {data:state};}});await f.done;
 offline=true;const select=f.badge().querySelector('select');select.value='urgent';
 select.dispatchEvent(new f.doc.defaultView.Event('change'));await settle();
 assert.match(f.badge().textContent,/Sem sincronização:.*Dados da última consulta/);
 assert.ok([...f.badge().querySelectorAll('select,input')].every(c=>c.disabled));
 assert.equal(f.badge().querySelector('select').value,'attention');
 const count=f.messages.length;f.badge().querySelector('select').dispatchEvent(new f.doc.defaultView.Event('change'));await settle();
 assert.equal(f.messages.length,count);
 offline=false;f.tick();await settle();assert.equal(f.badge().querySelector('select').disabled,false);
 assert.doesNotMatch(f.badge().textContent,/Sem sincronização/);
 offline=true;f.tick();await settle();
 assert.match(f.badge().textContent,/Sem sincronização/);assert.equal(f.badge().querySelector('select').disabled,true);
 offline=false;f.tick();await settle();assert.equal(f.badge().querySelector('select').disabled,false);f.leave();
});

test('card recupera falha inicial e não sobrepõe gravação com consulta periódica',async()=>{
 const state={version:3,tabs:[],assignments:{},statuses:{'900':'attention'}};
 let offline=true,release;
 const f=frame({apiHandler:async msg=>{if(offline)return {error:'Sem serviço'};if(msg.body){await new Promise(r=>release=r);return {data:{...state,version:4,statuses:{'900':'urgent'}}};}return {data:state};}});await f.done;
 assert.match(f.badge().textContent,/Organizador indisponível/);
 offline=false;f.tick();await settle();assert.equal(f.badge().querySelector('select').disabled,false);
 const select=f.badge().querySelector('select');select.value='urgent';select.dispatchEvent(new f.doc.defaultView.Event('change'));
 await settle();const count=f.messages.length;f.tick();await settle();assert.equal(f.messages.length,count);
 release();await settle();assert.equal(f.badge().querySelector('select').value,'urgent');f.leave();
});

test('envio direto pelo formulário exige confirmação e clique seguido de submit pergunta uma vez',async()=>{
 const f=sendFrame();await f.done;
 const form=f.doc.querySelector('form');
 let native=0;form.addEventListener('submit',()=>native++);
 form.requestSubmit(f.doc.querySelector('#sbmEnviar'));
 assert.equal(f.questions.length,1);assert.equal(native,0);
 assert.equal(f.submit().prevented,true);assert.equal(f.questions.length,2);
 f.answer=true;assert.equal(f.submit().prevented,false);assert.equal(f.questions.length,3);
 assert.equal(f.submit().prevented,false);assert.equal(f.questions.length,3);
 const click=sendFrame({answer:true});await click.done;
 click.click(click.doc.querySelector('#sbmEnviar'));assert.equal(click.submit().prevented,false);
 assert.equal(click.questions.length,1);
});

test('processo mostra resumo imediato na árvore sem selecionar documento',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const f=frame({action:'procedimento_visualizar',treeDom:treeOf(pendingTree),gate});await settle();
 assert.ok(f.badge());assert.equal(f.tree.querySelector('#sei-organizador-documento').dataset.mode,'process');
 assert.match(f.badge().querySelector('h2').textContent,/Processo SEI-350024\/000001\/2026/);
 assert.match(f.badge().textContent,/Tipo do processoTipo fictício/);assert.match(f.badge().textContent,/Pendências antes de enviar⚠ Despacho 777 sem assinatura/);
 assert.equal(f.badge().querySelector('section').getAttribute('aria-busy'),'true');assert.doesNotMatch(f.badge().textContent,/Assinatura✔|Assinatura✎/);
 release();await f.done;
 assert.match(f.badge().textContent,/Última movimentação.*SEPM\/5ºCPA.*retirado do bloco 14/);
 assert.match(f.badge().textContent,/Último envio/);assert.match(f.badge().textContent,/Assunto: Restituições/);
 assert.match(f.badge().textContent,/Parado há 8 dias/);assert.doesNotMatch(f.badge().textContent,/Anterior a este documento|Pessoa Um \(Coronel\)/);
 assert.equal(f.badge().querySelector('section').getAttribute('aria-label'),'Resumo do processo no SEI Organizador');f.leave();
});

test('selecionar documento mantém um card e voltar restaura o resumo com sincronização',async()=>{
 const process=frame({action:'procedimento_visualizar'});await process.done;
 const doc=frame({treeDom:process.treeDom});await doc.done;
 assert.equal(process.timers.size,0);assert.equal(doc.tree.querySelectorAll('#sei-organizador-documento').length,1);
 assert.equal(doc.tree.querySelector('#sei-organizador-documento').dataset.mode,'document');assert.match(doc.badge().textContent,/Pessoa Um \(Coronel\)/);
 doc.leave();await settle();
 assert.equal(process.tree.querySelectorAll('#sei-organizador-documento').length,1);assert.equal(process.tree.querySelector('#sei-organizador-documento').dataset.mode,'process');
 assert.match(process.badge().textContent,/Última movimentação/);assert.doesNotMatch(process.badge().textContent,/Assinatura✔|Assinatura✎/);
 assert.equal(process.timers.size,1);assert.equal(doc.timers.size,0);process.leave();
});

test('resumo atrasado e saída de documento antigo não substituem o documento selecionado',async()=>{
 let release;const gate=new Promise(r=>release=r);
 const process=frame({action:'procedimento_visualizar',treeDom:treeOf(pendingTree),gate});await settle();
 const first=frame({treeDom:process.treeDom});await first.done;
 release();await process.done;assert.equal(process.timers.size,0);
 assert.equal(first.tree.querySelector('#sei-organizador-documento').dataset.mode,'document');
 const second=frame({documentId:'903',treeDom:process.treeDom,body:'Minuta'});await second.done;
 first.leave();await settle();assert.match(second.badge().querySelector('h2').textContent,/SEI Organizador/);
 assert.equal(second.tree.querySelectorAll('#sei-organizador-documento').length,1);assert.equal(second.tree.querySelector('#sei-organizador-documento').dataset.mode,'document');
 assert.match(second.badge().textContent,/Assinatura✎ Não assinado/);second.leave();await settle();process.leave();
});

test('visão da raiz também mostra resumo; unidade, órgão e processo da árvore são conferidos',async()=>{
 const root=frame({action:'arvore_visualizar'});await root.done;assert.match(root.badge().textContent,/Última movimentação/);assert.doesNotMatch(root.badge().textContent,/Assinatura✔|Assinatura✎/);root.leave();
 for(const options of [{unitParam:'2'},{org:'OUTRO'},{processId:'999'}]){
  const f=frame({action:'procedimento_visualizar',...options});await f.done;assert.equal(f.badge(),undefined);assert.equal(f.requests.length,0);assert.equal(f.messages.length,0);
 }
});

test('resumo não associa assinaturas ou blocos de documento sem documento selecionado',()=>{
 const page=data.parseHistory(new JSDOM(historyPage(historyRows,'resumido')).window.document);
 const summary=data.summarize(page.rows,null,'SEPM/5°CPA');
 assert.equal(summary.generatedUnit,null);assert.equal(summary.generatedAt,null);assert.deepEqual([...summary.signed],[]);assert.deepEqual([...summary.documentBlocks],[]);
 assert.deepEqual(plain(summary.processBlocks.map(b=>b.id)),['1343']);assert.ok(summary.lastSend);assert.equal(summary.open.length,2);
});

test('resumo mantém pendências quando andamento falha e não conclui processo com histórico parcial',async()=>{
 const failed=frame({action:'procedimento_visualizar',treeDom:treeOf(pendingTree),historyStatus:500});await failed.done;
 assert.match(failed.badge().textContent,/Tipo do processoTipo fictício/);assert.match(failed.badge().textContent,/Despacho 777 sem assinatura/);assert.match(failed.badge().textContent,/Não foi possível consultar/);
 assert.equal(failed.badge().querySelector('.progress'),null);assert.equal(failed.messages.length,0);failed.leave();
 const partial=frame({action:'procedimento_visualizar',historyHTML:historyPage([historyRows.at(-1)],'resumido').replace('(1 registros)','(50 registros)')});await partial.done;
 assert.match(partial.badge().textContent,/Não foi possível confirmar as unidades abertas/);assert.match(partial.badge().textContent,/Andamento com várias páginas/);assert.doesNotMatch(partial.badge().textContent,/concluído|Assinatura✎/);partial.leave();
});

test('última movimentação prioriza unidade e alterna para processo sem novas consultas',async()=>{
 // Este cenário compara datas fixas; as duas linhas relativas a fixtureNow
 // pertencem aos testes de tempo parado e podem ser mais recentes que elas.
 const rows=[hrow('24/10/2026 09:10','sepm/5ºcpa','usuario.local','Processo recebido na própria unidade',true),...historyRows.slice(2),hrow('24/10/2026 12:00','SEPM/ASCOM','colega','Processo atribuído fora da unidade',true)];
 const f=frame({action:'procedimento_visualizar',rows});await f.done;
 const scope=f.badge().querySelector('[aria-label="Escopo da última movimentação"]');
 const content=()=>f.badge().querySelector('.activity-heading').nextElementSibling.textContent;
 assert.equal(scope.value,'unit');assert.match(content(),/09:10.*sepm\/5ºcpa.*Processo recebido na própria unidade.*usuario.local/);assert.doesNotMatch(content(),/ASCOM|fora da unidade/);
 const requests=f.requests.length;scope.value='process';scope.dispatchEvent(new f.doc.defaultView.Event('change'));
 assert.match(content(),/12:00.*SEPM\/ASCOM.*Processo atribuído fora da unidade.*colega/);assert.equal(f.requests.length,requests);
 f.tick();await settle();assert.equal(scope.value,'process');
 const again=frame({action:'procedimento_visualizar',rows,store:f.store});await again.done;
 assert.equal(again.badge().querySelector('[aria-label="Escopo da última movimentação"]').value,'process');
 assert.match(again.badge().querySelector('.activity-heading').nextElementSibling.textContent,/SEPM\/ASCOM/);f.leave();again.leave();
});

test('sem movimentação local no histórico parcial não apresenta a de outra unidade como local',async()=>{
 const html=historyPage([hrow('24/10/2026 12:00','SEPM/ASCOM','colega','Processo atribuído em outra unidade',true)],'resumido').replace('(1 registros)','(50 registros)');
 const f=frame({action:'procedimento_visualizar',historyHTML:html});await f.done;
 const scope=f.badge().querySelector('[aria-label="Escopo da última movimentação"]'),content=f.badge().querySelector('.activity-heading').nextElementSibling;
 assert.equal(scope.value,'unit');assert.match(content.textContent,/Nenhuma movimentação de SEPM\/5°CPA encontrada nos registros carregados/);assert.doesNotMatch(content.textContent,/colega|ASCOM/);
 scope.value='process';scope.dispatchEvent(new f.doc.defaultView.Event('change'));assert.match(content.textContent,/SEPM\/ASCOM.*outra unidade/);
 assert.match(f.badge().textContent,/Andamento com várias páginas/);f.leave();
});

test('resumo determina eventos por data sem alterar a ordem nativa',()=>{
 const page=data.parseHistory(new JSDOM(historyPage([...historyRows].reverse(),'resumido')).window.document);const original=page.rows.map(r=>r.text);
 const result=data.summarize(page.rows,'555','SEPM/5°CPA');assert.equal(result.lastSend.time.getMinutes(),9);assert.equal(result.documentBlocks.length,0);assert.deepEqual(page.rows.map(r=>r.text),original);
});

test('pendência abre o documento pelo link nativo e último envio inicia recolhido',async()=>{
 const dom=new JSDOM(tree.replace('"Outra",null,true,"SEPM/9° BPM"','"Outra",null,true,"SEPM/5°CPA"').replace('"Despacho 666","Despacho 666","i"','"Despacho 666","Despacho 666","documento_interno.svg"')+'<a id="native-doc" href="controlador.php?acao=documento_visualizar&id_documento=902" target="ifrConteudoVisualizacao">Despacho</a>',{url:base+'controlador.php?acao=procedimento_visualizar&id_procedimento=900'});
 const f=frame({treeDom:dom});await f.done;let clicked=0;f.tree.querySelector('#native-doc').addEventListener('click',e=>{e.preventDefault();clicked++;});const link=f.badge().querySelector('a.pending');assert.ok(link);link.click();assert.equal(clicked,1);assert.equal(f.badge().querySelector('details.last-send').open,false);f.leave();
});

test('histórico incompleto não afirma ausência de blocos',async()=>{
 const html=historyPage([hrow('24/10/2026 10:00','SEPM/5°CPA','teste','Processo recebido na unidade')],'resumido').replace('(1 registros)','(129 registros - 1 a 100)');
 const f=frame({historyHTML:html});await f.done;assert.match(f.badge().textContent,/Blocos não confirmados: histórico incompleto/);assert.doesNotMatch(f.badge().textContent,/Fora de blocos/);f.leave();
});

test('card consulta página restante e recebe a leitura completa publicada pela tabela',async()=>{
 const native=page=>`<form id="frmProcedimentoHistorico" action="controlador.php?acao=procedimento_consultar_historico&id_procedimento=900&infra_unidade_atual=1"><a id="ancTipoHistorico">Ver histórico resumido</a><input name="hdnInfraPaginaAtual" value="${page}"><table id="tblHistorico"><caption>Lista (2 registros - ${page+1} a ${page+1})</caption>${page===0?hrow('24/10/2026 10:00','SEPM/5°CPA','teste','Processo recebido na unidade'):hrow('24/10/2026 09:00','SEPM/5°CPA','teste','Processo inserido no bloco 1343')}</table></form>`;
 const f=frame({action:'procedimento_visualizar',historyFetcher:async(url,init)=>new Response(native(Number(init.body?.get('hdnInfraPaginaAtual')||0)),{headers:{'content-type':'text/html; charset=utf-8'}})});
 await f.done;assert.match(f.badge().textContent,/Restituições SEPM/);assert.doesNotMatch(f.badge().textContent,/histórico incompleto|Fora de blocos/);assert.equal(f.requests.filter(r=>r.init.method==='POST').length,1);
 const updated=data.parseHistory(new JSDOM(historyPage([hrow('24/10/2026 12:00','SEPM/5°CPA','teste','Processo atribuído para chefe')],'resumido')).window.document);f.publish(updated);await settle();await settle();assert.match(f.badge().textContent,/Processo atribuído para chefe/);assert.match(f.badge().textContent,/Fora de blocos/);f.leave();
});

test('sair do documento cancela o andamento pendente e não inicia consultas restantes',async()=>{
 let signal,aborted=false;
 const f=frame({historyFetcher:async(url,init)=>new Promise((resolve,reject)=>{
  signal=init.signal;
  signal.addEventListener('abort',()=>{aborted=true;reject(signal.reason);},{once:true});
 })});
 try{
  await settle();assert.ok(signal);assert.equal(signal.aborted,false);
  f.leave();await f.done;
  assert.equal(aborted,true);assert.equal(signal.aborted,true);
  assert.equal(f.requests.length,1);assert.equal(f.badge(),undefined);assert.equal(f.timers.size,0);
 }finally{f.leave();}
});

test('selecionar documento não consulta o SEI até solicitar andamento',async()=>{
 const f=frame({autoLoad:false});try{
  await f.done;await settle();assert.equal(f.requests.length,0);assert.ok(f.badge());
  const load=f.badge().querySelector('.load-history');assert.ok(load);
  await load.onclick();assert.ok(f.requests.length>0);assert.match(f.badge().textContent,/Bloco interno/);
 }finally{f.leave();}
});
