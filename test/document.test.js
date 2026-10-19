import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const data=(()=>{const w=new JSDOM('',{runScripts:'outside-only'}).window;w.eval(read('document-data.js'));return w.seiDocumentData;})();
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
 hrow(stamp(new Date(Date.now()-10*60000)),'SEPM/3°CPA','r.rs','Processo recebido na unidade',true),
 hrow(stamp(new Date(Date.now()-8*86400000)),'SEPM/24° BPM','c.c','Processo atribuído para c.c',true),
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
 assert.deepEqual({...t.process},{id:'900',number:'SEI-350024/000001/2026'});
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

function frame({documentId='901',unitParam='1',org='SEPM',historyToggle='completo',historyStatus=200,organizer,rows=historyRows,body=footer,signatureList=[],treeDom=new JSDOM(tree,{url:`${base}controlador.php?acao=procedimento_visualizar&id_procedimento=900`}),store=new Map()}={}){
 const docDom=new JSDOM(`<title>SEI/ERJ - 555 - CI</title><p class="Texto">Conteúdo nativo</p>${body}`,{url:`${base}controlador.php?acao=documento_visualizar&id_documento=${documentId}&infra_unidade_atual=${unitParam}&infra_hash=d`});
 const topDom=new JSDOM(`<a id="lnkUsuarioSistema" title="Pessoa Teste (teste/${org})"></a><a id="lnkInfraUnidade">SEPM/5°CPA</a><a href="controlador.php?acao=bloco_interno_listar&infra_hash=i">Internos</a><a href="controlador.php?acao=bloco_assinatura_listar&infra_hash=a">Assinatura</a><iframe id="ifrArvore"></iframe>`,{url:`${base}controlador.php?acao=procedimento_trabalhar&id_procedimento=900`});
 const topDoc=topDom.window.document,getById=topDoc.getElementById.bind(topDoc);topDoc.getElementById=id=>id==='ifrArvore'?{contentDocument:treeDom.window.document}:getById(id);
 const requests=[],messages=[];let state=organizer||{version:3,tabs:[{id:'t1',name:'Restituições'},{id:'t2',name:'Pessoal'}],assignments:{'900':['t1']},statuses:{'900':'attention'}};
 const page=html=>new Response(Buffer.from(html,'latin1'),{headers:{'content-type':'text/html; charset=iso-8859-1'}});
 const fetch=async(url,init={})=>{requests.push({url:url.toString(),init});const u=new URL(url);const acao=u.searchParams.get('acao');
  if(acao==='procedimento_consultar_historico')return historyStatus!==200?new Response('erro',{status:historyStatus}):page(init.method==='POST'?historyPage(rows,'resumido'):historyPage(rows.slice(0,1),historyToggle));
  if(acao==='bloco_interno_listar')return page(blockList([['1343','Restituições SEPM']]));
  if(acao==='bloco_assinatura_listar')return page(blockList(signatureList));
  return new Response('',{status:404});};
 const chrome={runtime:{sendMessage:async msg=>{messages.push(msg);if(msg.body){state={...state,version:state.version+1,statuses:{'900':msg.body.action.status||'attention'}};}return {data:state};}}};
 const storage={getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,String(v))};
 const listeners={};const fakeWindow={addEventListener:(type,fn)=>{listeners[type]=fn;}};fakeWindow.top={document:topDoc};
 const context={window:fakeWindow,document:docDom.window.document,location:docDom.window.location,URL,URLSearchParams,AbortSignal,TextDecoder,Response,DOMParser:docDom.window.DOMParser,fetch,chrome,sessionStorage:storage,localStorage:storage,setTimeout,console,
  SEI_ORGANIZADOR_CONFIG:{serviceUrl:'https://ext.5cpa.com.br',unitId:'1',org:'SEPM'},seiDocumentData:data};
 runInNewContext(read('history.js'),context);
 const done=runInNewContext(read('document.js'),context);
 return {done,doc:docDom.window.document,tree:treeDom.window.document,treeDom,store,requests,messages,leave:()=>listeners.pagehide?.(),badge:()=>treeDom.window.document.querySelector('#sei-organizador-documento')?.shadowRoot};
}
const settle=()=>new Promise(r=>setTimeout(r,30));
test('badge mostra assinatura, último envio, tempo parado e bloco interno com organizador',async()=>{
 const f=frame();await f.done;await settle();const root=f.badge();assert.ok(root);
 assert.equal(f.tree.querySelector('#divConsultarAndamento').nextElementSibling.id,'sei-organizador-documento');assert.equal(f.tree.querySelector('#divArvore').textContent,'Árvore nativa');
 assert.equal(f.doc.querySelector('#sei-organizador-documento'),null);assert.equal(f.doc.querySelector('p.Texto').textContent,'Conteúdo nativo');
 const text=root.textContent;assert.match(root.querySelector('h2').textContent,/^SEI OrganizadorCI fictícia 7 \(555\)$/);
 assert.match(text,/Pessoa Um \(Coronel\) · 19\/10\/2026/);
 assert.match(text,/Último envio19\/10\/2026.*15:09→ SEPM\/24° BPM→ SEPM\/3°CPApor Nome m\.sdo \(m\.sdo\)/);
 assert.match(text,/Aberto emSEPM\/3°CPAhá 10 minSEPM\/24° BPMhá 8 dias/);assert.equal(root.querySelectorAll('.unit').length,2);
 assert.equal(root.querySelectorAll('.age[data-level="alert"]').length,1);
 assert.match(text,/Bloco internonº 1343 · “Restituições SEPM” · Gerado/);assert.match(text,/Assunto: Restituições/);
 const select=root.querySelector('select');assert.equal(select.value,'attention');
 const post=f.requests.find(r=>r.init.method==='POST');assert.ok(post);assert.match(post.init.body.toString(),/hdnTipoHistorico=C/);assert.match(post.init.body.toString(),/hdnInfraHashCriterios=abc/);
 for(const r of f.requests){assert.ok(r.url.startsWith(base+'controlador.php?'));assert.equal(r.init.credentials,'same-origin');}
 assert.equal(f.requests.some(r=>/bloco_assinatura_listar/.test(r.url)),false);
 assert.deepEqual(plain(f.messages.map(m=>[m.type,m.unit,m.block,m.body??null])),[['api','1','1343',null]]);
 select.value='urgent';select.dispatchEvent(new f.doc.defaultView.Event('change'));await settle();
 const sent=f.messages.at(-1);assert.equal(sent.block,'1343');assert.deepEqual(plain(sent.body.actor),{name:'Pessoa Teste',login:'teste',org:'SEPM'});
 assert.deepEqual(plain(sent.body.action),{type:'status',status:'urgent',processIds:['900'],processNumbers:{'900':'SEI-350024/000001/2026'}});assert.equal(sent.body.version,3);
 assert.match(f.badge().textContent,/Alteração salva\./);assert.equal(f.badge().querySelector('select').value,'urgent');
});
test('badge não aparece para documento de outra unidade, outra unidade atual ou outro órgão',async()=>{
 for(const options of [{documentId:'902'},{unitParam:'2'},{org:'OUTRO'}]){const f=frame(options);await f.done;await settle();assert.equal(f.badge(),undefined);assert.equal(f.requests.length,0);assert.equal(f.messages.length,0);}
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
 const other=frame({documentId:'902',treeDom:f.treeDom});await other.done;await settle();assert.equal(f.tree.querySelector('#sei-organizador-documento'),null);assert.equal(other.requests.length,0);
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
 assert.equal(signed.badge().querySelector('.organizer select').parentElement.className,'organizer');
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
 assert.equal(root.querySelectorAll('li').length,1);assert.match(root.textContent,/Pendências antes de enviar⚠ Despacho 777 sem assinatura/);
 assert.equal(other.requests.length,0);assert.equal(other.messages.length,0);
 const own=frame({treeDom:treeOf(pendingTree)});await own.done;await settle();const items=own.badge().querySelectorAll('li');
 assert.match(items[0].textContent,/^Pendências antes de enviar⚠ Despacho 777 sem assinatura$/);assert.match(items[1].textContent,/^Assinatura✔ Pessoa Um/);
});

function sendFrame({protocols='900',processId='900',source=pendingTree,answer=false}={}){
 const dom=new JSDOM(`<form id="frmAtividadeListar"><div id="divInfraBarraComandosSuperior" class="infraBarraComandos"><button type="submit" id="sbmEnviar">Enviar</button></div><div id="divProcedimentos">Processos</div><input type="hidden" id="hdnIdProtocolos" value="${protocols}"></form>`,{url:`${base}controlador.php?acao=procedimento_enviar&acao_origem=arvore_visualizar&id_procedimento=${processId}&arvore=1&infra_unidade_atual=1`});
 const topDom=new JSDOM(`<a id="lnkUsuarioSistema" title="Pessoa Teste (teste/SEPM)"></a><a id="lnkInfraUnidade">SEPM/5°CPA</a>`,{url:`${base}controlador.php?acao=procedimento_trabalhar`});
 const treeDom=treeOf(source),topDoc=topDom.window.document;const getById=topDoc.getElementById.bind(topDoc);topDoc.getElementById=id=>id==='ifrArvore'?{contentDocument:treeDom.window.document}:getById(id);
 const listeners=[],questions=[];const fakeWindow={top:{document:topDoc},addEventListener:(type,fn,capture)=>listeners.push({type,fn,capture})};
 const context={window:fakeWindow,document:dom.window.document,location:dom.window.location,URL,setTimeout,console,confirm:q=>{questions.push(q);return answer;},SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'},seiDocumentData:data};
 const done=runInNewContext(read('send.js'),context);
 const click=target=>{const e={target,prevented:false,stopped:false,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};for(const l of listeners)if(l.type==='click')l.fn(e);return e;};
 return {done,doc:dom.window.document,listeners,questions,click,banner:()=>dom.window.document.querySelector('#sei-organizador-envio')?.shadowRoot,set answer(v){answer=v;}};
}
test('enviar processo: aviso acima da lista e confirmação antes do envio nativo',async()=>{
 const f=sendFrame();await f.done;const banner=f.banner();assert.ok(banner);
 assert.equal(f.doc.querySelector('#divProcedimentos').previousElementSibling.id,'sei-organizador-envio');
 assert.match(banner.textContent,/Documento de SEPM\/5°CPA sem assinatura neste processo:Despacho 777/);assert.doesNotMatch(banner.textContent,/Anexo|999/);
 assert.equal(f.listeners.length,1);assert.equal(f.listeners[0].capture,true);
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
 assert.equal(alert.textContent,'⏱ Parado há 8 dias em SEPM/24° BPM');assert.equal(alert.dataset.level,'alert');assert.equal(root.querySelector('section').dataset.idle,'alert');
 assert.equal(alert.nextElementSibling.tagName,'UL');root.querySelector('.toggle').click();assert.equal(root.querySelector('ul').hidden,true);assert.equal(alert.hidden,false);
 const days=n=>stamp(new Date(Date.now()-n*86400000));
 const rows=[hrow(days(4),'SEPM/5°CPA','a','Processo recebido na unidade',true),hrow(days(3.5),'SEPM/EMG','b','Processo recebido na unidade',true),hrow(days(1),'SEPM/3°CPA','c','Processo recebido na unidade',true),...historyRows.slice(2)];
 const warn=frame({rows});await warn.done;await settle();const w=warn.badge().querySelector('.idle');
 assert.equal(w.dataset.level,'warn');assert.match(w.textContent,/^⏱ Parado há 4 dias nesta unidadee mais 1 unidade parada há 3 dias ou mais$/);assert.match(w.title,/SEPM\/EMG: desde/);
 const fresh=frame({rows:[hrow(days(0.1),'SEPM/3°CPA','c','Processo recebido na unidade',true),...historyRows.slice(2)]});await fresh.done;await settle();
 assert.equal(fresh.badge().querySelector('.idle'),null);assert.equal(fresh.badge().querySelector('section').dataset.idle,undefined);
});
