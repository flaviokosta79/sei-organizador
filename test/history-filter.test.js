import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const row=(id,unit,text,hidden=false)=>`<tr id="r${id}" class="andamentoAberto" ${hidden?'hidden':''}><td>24/10/2026 10:00</td><td>${unit}</td><td>usuario</td><td>${text} <a href="#detalhe">Detalhe</a></td></tr>`;
// Keep the event suffix identical to the real SEI (only whitespace after the origin unit).
const rows=[
 row(1,'SEPM/3°CPA','Processo remetido pela unidade <a>sepm/5ºcpa</a>'),
 row(2,'SEPM/5°CPA','Processo remetido pela unidade <a>SEPM/3°CPA</a>'),
 row(3,'SEPM/5°CPA','Processo recebido na unidade'),
 row(4,'SEPM/3°CPA','Processo recebido na unidade'),
 row(5,'SEPM/5°CPA','Processo atribuído para colega'),
 row(6,'SEPM/ASCOM','Gerado documento 123'),
 row(7,'SEPM/5°CPA','Processo recebido na unidade',true),
].map(text=>text.replace('<a href="#detalhe">Detalhe</a>','')).join('');
const table=(content,total=50)=>`<table id="tblHistorico"><caption>Lista de Andamentos (${total} registros)</caption><tr><th>Data</th><th>Unidade</th><th>Usuário</th><th>Descrição</th></tr>${content}</table>`;
function fixture({unit='1',org='SEPM',action='procedimento_consultar_historico',store=new Map(),content=rows,total=50,caption=null,paging=false,fetcher=async()=>{throw Error('Consulta inesperada');}}={}){
 const dom=new JSDOM(`<form id="frmProcedimentoHistorico" ${paging?'action="controlador.php?acao=procedimento_consultar_historico&id_procedimento=900&infra_unidade_atual=1&infra_hash=ficticio"':''}>${paging?'<input name="hdnInfraPaginaAtual" value="0"><input name="hdnInfraItensSelecionados" value="original"><div id="divInfraAreaPaginacaoSuperior">Paginação nativa</div>':''}${table(content,total)}<button id="native" type="button">Nativo</button></form>`,{url:`https://sei.rj.gov.br/sei/controlador.php?acao=${action}&id_procedimento=900&infra_unidade_atual=${unit}`});
 if(caption)dom.window.document.querySelector('caption').textContent=caption;
 const top=new JSDOM(`<a id="lnkUsuarioSistema" title="Pessoa (teste/${org})"></a><a id="lnkInfraUnidade">SEPM/5°CPA</a>`);
 const listeners={},win={top:{document:top.window.document},addEventListener:(name,fn)=>listeners[name]=fn};
 const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
 const context={fetch:fetcher,AbortController,AbortSignal,URLSearchParams,TextDecoder,DOMParser:dom.window.DOMParser,window:win,document:dom.window.document,location:dom.window.location,URL,MutationObserver:dom.window.MutationObserver,queueMicrotask,localStorage:storage,SEI_ORGANIZADOR_CONFIG:{unitId:'1',org:'SEPM'}};
 runInNewContext(read('document-data.js')+';'+read('history-pages.js')+';'+read('history-filter.js'),context);
 const doc=dom.window.document;
 return {dom,doc,store,listeners,context,root:()=>doc.querySelector('#sei-organizador-filtro-andamento')?.shadowRoot,
 visible:()=>[...doc.querySelectorAll('#tblHistorico tr[id]')].filter(r=>!r.classList.contains('so-history-filtered')&&!r.hidden).map(r=>r.id),
 close:()=>{listeners.pagehide?.();dom.window.close();top.window.close();}};
}
const settle=()=>new Promise(r=>setTimeout(r,20));

test('filtra envios de origem própria mesmo registrados no destino e recebimentos da unidade',async()=>{
 const f=fixture();try{await settle();
 assert.deepEqual(f.visible(),['r1','r2','r3']);assert.equal(f.dom.window.getComputedStyle(f.doc.querySelector('#r4')).display,'none');assert.match(f.root().textContent,/3 de 3 registros correspondentes · 7 de 50 registros carregados/);assert.match(f.root().textContent,/Há outras páginas/);
 assert.equal(f.doc.querySelector('#r1').classList.contains('andamentoAberto'),true);
 const [unit,type]=f.root().querySelectorAll('select');type.value='all';type.dispatchEvent(new f.dom.window.Event('change'));assert.deepEqual(f.visible(),['r1','r2','r3','r5']);
 unit.value='all';type.value='transport';unit.dispatchEvent(new f.dom.window.Event('change'));assert.deepEqual(f.visible(),['r1','r2','r3','r4']);
 const native=f.doc.querySelector('#native');let clicks=0;native.addEventListener('click',()=>clicks++);native.click();assert.equal(clicks,1);
 f.root().querySelector('button').click();assert.deepEqual(f.visible(),['r1','r2','r3','r4','r5','r6']);assert.equal(f.doc.querySelector('#r7').hidden,true);assert.equal(f.doc.querySelectorAll('.so-history-filtered').length,0);
 }finally{f.close();}
});

test('escolha persistida e leitura do andamento continua contendo todas as linhas filtradas',async()=>{
 const f=fixture();let g;try{
 const parsed=f.context.seiDocumentData.parseHistory(f.doc);assert.equal(parsed.rows.length,7);
 f.root().querySelector('button').click();g=fixture({store:f.store});assert.deepEqual(g.visible(),['r1','r2','r3','r4','r5','r6']);
 assert.deepEqual([...g.root().querySelectorAll('select')].map(s=>s.value),['all','all','native']);
 }finally{f.close();g?.close();}
});

test('recupera tabela e barra sem duplicar; sair restaura classes e preserva ocultação nativa',async()=>{
 const f=fixture();try{
 const original=f.doc.querySelector('#r4');assert.equal(original.classList.contains('so-history-filtered'),true);
 f.doc.querySelector('#tblHistorico').outerHTML=table(row(8,'SEPM/5°CPA','Processo recebido na unidade'));await settle();
 assert.equal(original.classList.contains('so-history-filtered'),false);assert.deepEqual(f.visible(),['r8']);assert.equal(f.doc.querySelectorAll('#sei-organizador-filtro-andamento').length,1);
 f.doc.querySelector('#sei-organizador-filtro-andamento').remove();await settle();assert.ok(f.root());assert.equal(f.doc.querySelectorAll('#sei-organizador-filtro-andamento').length,1);
 f.listeners.pagehide();await settle();assert.equal(f.root(),undefined);assert.equal(f.doc.querySelectorAll('.so-history-filtered').length,0);
 f.listeners.pageshow();await settle();assert.ok(f.root());
 f.dom.window.history.pushState({},'','?acao=procedimento_trabalhar&infra_unidade_atual=1');f.listeners.popstate();await settle();
 assert.equal(f.root(),undefined);assert.equal(f.doc.querySelectorAll('.so-history-filtered').length,0);
 }finally{f.close();}
});

test('não filtra outra unidade, órgão, nem telas que não sejam o andamento',()=>{
 for(const options of [{unit:'2'},{org:'OUTRO'},{action:'documento_visualizar'}]){
 const f=fixture(options);try{assert.equal(f.root(),undefined);assert.equal(f.doc.querySelectorAll('.so-history-filtered').length,0);}finally{f.close();}
 }
});

const manyRows=(start,end)=>Array.from({length:end-start},(_,i)=>row(start+i,'SEPM/5°CPA','Processo recebido na unidade')).join('');
const nativePage=(page,total=70)=>{
 const content=Array.from({length:Math.min(10,total-page*10)},(_,i)=>{const id=page*10+i+1;return row(id,id%2?'SEPM/3°CPA':'SEPM/5°CPA','Processo recebido na unidade');}).join('');
 return `<form id="frmProcedimentoHistorico" action="controlador.php?acao=procedimento_consultar_historico&id_procedimento=900&infra_unidade_atual=1&infra_hash=ficticio"><input name="hdnInfraPaginaAtual" value="${page}">${table(content,total)}</form>`;
};
const reply=text=>new Response(text,{headers:{'content-type':'text/html; charset=utf-8'}});

test('divide os resultados filtrados em páginas de 30 e preserva os registros para leitura',async()=>{
 const f=fixture({content:manyRows(1,66),total:65});try{await settle();
 assert.equal(f.visible().length,30);assert.match(f.root().textContent,/Página 1 de 3 · 30 registros por página/);
 f.root().querySelector('[aria-label="Próxima página do andamento filtrado"]').click();assert.equal(f.visible().length,30);assert.equal(f.visible()[0],'r31');
 f.root().querySelector('[aria-label="Próxima página do andamento filtrado"]').click();assert.equal(f.visible().length,5);assert.equal(f.visible()[0],'r61');
 assert.equal(f.root().querySelector('[aria-label="Próxima página do andamento filtrado"]').disabled,true);
 assert.equal(f.context.seiDocumentData.parseHistory(f.doc).rows.length,65);
 f.root().querySelector('button').click();assert.match(f.root().textContent,/Página 1 de 3/);assert.equal(f.visible()[0],'r1');
 }finally{f.close();}
});

test('consulta páginas nativas para completar 30 resultados da própria unidade sem alterar formulário',async()=>{
 const calls=[];const initial=new JSDOM(nativePage(0)).window.document.querySelector('tbody').innerHTML;
 const f=fixture({content:initial,total:70,paging:true,fetcher:async(url,init)=>{calls.push({url:String(url),init});return reply(nativePage(Number(init.body.get('hdnInfraPaginaAtual'))));}});
 try{for(let i=0;i<20&&f.doc.querySelectorAll('#tblHistorico tr[id]').length<70;i++)await settle();
 assert.equal(f.visible().length,30);assert.match(f.root().textContent,/30 de 35 registros correspondentes · 70 de 70 registros carregados/);
 assert.match(f.root().textContent,/Página 1 de 2/);assert.equal(calls.length,6);
 for(const call of calls){assert.equal(call.init.method,'POST');assert.equal(call.init.credentials,'same-origin');assert.equal(call.init.body.get('hdnInfraItensSelecionados'),'');assert.match(call.url,/acao=procedimento_consultar_historico/);}
 assert.equal(f.doc.querySelector('[name="hdnInfraPaginaAtual"]').value,'0');assert.equal(f.doc.querySelector('[name="hdnInfraItensSelecionados"]').value,'original');
 assert.equal(f.doc.querySelector('#divInfraAreaPaginacaoSuperior').classList.contains('so-history-native-pagination'),true);
 f.root().querySelector('[aria-label="Próxima página do andamento filtrado"]').click();assert.equal(f.visible().length,5);
 f.listeners.pagehide();await settle();assert.equal(f.doc.querySelectorAll('#tblHistorico tr[id]').length,10);assert.equal(f.doc.querySelectorAll('.so-history-filtered,.so-history-native-pagination').length,0);
 }finally{f.close();}
});

test('falha ao carregar outra página mantém dados e paginação nativos sem importar leitura incompleta',async()=>{
 const initial=new JSDOM(nativePage(0)).window.document.querySelector('tbody').innerHTML;
 const f=fixture({content:initial,total:70,paging:true,fetcher:async()=>reply('<form>Login</form>')});
 try{await settle();assert.equal(f.doc.querySelectorAll('#tblHistorico tr[id]').length,10);assert.match(f.root().textContent,/Leitura incompleta: Andamento não reconhecido/);
 assert.equal(f.doc.querySelector('#divInfraAreaPaginacaoSuperior').classList.contains('so-history-native-pagination'),false);
 assert.equal(f.doc.querySelector('[name="hdnInfraPaginaAtual"]').value,'0');
 }finally{f.close();}
});

test('lê os 129 registros quando o SEI anuncia 129 registros - 1 a 100 e só então confirma leitura completa',async()=>{
 let release;const gate=new Promise(r=>release=r),calls=[];
 const native=(page)=>{
  const start=page===0?1:101,end=page===0?101:130;
  const content=Array.from({length:end-start},(_,i)=>{const id=start+i;return row(id,id<=9||id>100?'SEPM/5°CPA':'SEPM/3°CPA','Processo recebido na unidade');}).join('');
  return `<form id="frmProcedimentoHistorico" action="controlador.php?acao=procedimento_consultar_historico&id_procedimento=900&infra_unidade_atual=1&infra_hash=ficticio"><input name="hdnInfraPaginaAtual" value="${page}">${table(content,129).replace('(129 registros)',`(129 registros - ${start} a ${end-1})`)}</form>`;
 };
 const initial=new JSDOM(native(0)).window.document.querySelector('tbody').innerHTML;
 const f=fixture({content:initial,total:129,caption:'Lista de Andamentos (129 registros - 1 a 100):',paging:true,fetcher:async(url,init)=>{calls.push(init.body.get('hdnInfraPaginaAtual'));await gate;return reply(native(1));}});
 try{await settle();assert.match(f.root().textContent,/100 de 129 registros carregados/);assert.doesNotMatch(f.root().textContent,/Leitura completa/);
 release();for(let i=0;i<20&&f.doc.querySelectorAll('#tblHistorico tr[id]').length<129;i++)await settle();
 assert.deepEqual(calls,['1']);assert.equal(f.visible().length,30);assert.match(f.root().textContent,/30 de 38 registros correspondentes · 129 de 129 registros carregados/);assert.match(f.root().textContent,/Leitura completa/);
 assert.equal(f.context.seiDocumentData.parseHistory(f.doc).partial,false);assert.doesNotMatch(f.doc.querySelector('caption').textContent,/1 a 100/);
 f.root().querySelector('[aria-label="Próxima página do andamento filtrado"]').click();assert.equal(f.visible().length,8);
 f.listeners.pagehide();await settle();assert.equal(f.doc.querySelectorAll('#tblHistorico tr[id]').length,100);assert.match(f.doc.querySelector('caption').textContent,/129 registros - 1 a 100/);
 }finally{release();f.close();}
});

test('interpreta contagens com faixa, milhares e singular e não afirma leitura completa sem total reconhecido',async()=>{
 const f=fixture({caption:'Lista de Andamentos sem contagem',paging:true});try{await settle();
 assert.doesNotMatch(f.root().textContent,/Leitura completa/);assert.match(f.root().textContent,/Quantidade total não confirmada/);
 const D=f.context.seiDocumentData;
 for(const [caption,total] of [['Lista (1 registro)',1],['Lista (129 registros - 101 a 129)',129],['Lista (1.234 registros – 1 a 100)',1234],['Lista (129 registros)',129]]){
  const doc=new JSDOM(`<table id="tblHistorico"><caption>${caption}</caption></table>`).window.document;
  assert.equal(D.recordCount(doc.querySelector('table')),total);
 }
 assert.equal(D.parseHistory(f.doc).partial,true);
 }finally{f.close();}
});

test('ordena por data real com desempate estável e restaura a ordem nativa ao sair',async()=>{
 const content=[row(1,'SEPM/5°CPA','Processo recebido na unidade').replace('10:00','09:00'),row(2,'SEPM/5°CPA','Processo recebido na unidade').replace('10:00','11:00'),row(3,'SEPM/5°CPA','Processo recebido na unidade').replace('10:00','11:00')].join('');
 const f=fixture({content,total:3});try{await settle();const order=f.root().querySelectorAll('select')[2];order.value='recent';order.dispatchEvent(new f.dom.window.Event('change'));await settle();assert.deepEqual(f.visible(),['r2','r3','r1']);
 order.value='native';order.dispatchEvent(new f.dom.window.Event('change'));await settle();assert.deepEqual(f.visible(),['r1','r2','r3']);order.value='recent';order.dispatchEvent(new f.dom.window.Event('change'));await settle();f.listeners.pagehide();assert.deepEqual([...f.doc.querySelectorAll('tr[id]')].map(r=>r.id),['r1','r2','r3']);
 }finally{f.close();}
});
