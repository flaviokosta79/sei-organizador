import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const read=file=>readFileSync(new URL('../extension/'+file,import.meta.url),'utf8');
// Fictitious people in the format of the native assignment selector ("login - Nome").
const people=[['ana.t','Ana Teste da Silva'],['bruno.e','BRUNO EXEMPLO'],['danilo','Danilo Exemplo Pinheiro'],['goncalo.t','Fulano Gonçalo do Teste'],['zeca','Zeca Modelo']].map(([login,name])=>({login,name}));
const native='<select id="selAtribuicao"><option value="null" selected>&nbsp;</option>'+people.map((p,i)=>`<option value="${1000+i}">${p.login} - ${p.name}</option>`).join('')+'</select>';
const saved=()=>({seiUnitUsers:{unit,org:'SEPM',users:structuredClone(people)}});
const unit='120000124',identity={unit,org:'SEPM',login:'pessoa.t'};
const plain=value=>JSON.parse(JSON.stringify(value));
const tick=()=>new Promise(resolve=>setTimeout(resolve,90));
function fixture({action='procedimento_controlar',unitId=unit,org='SEPM',html='',storage={}}={}){
 const dom=new JSDOM('<a id="lnkUsuarioSistema" title="Pessoa (pessoa.t/'+org+')"></a>'+html,{url:`https://sei.rj.gov.br/sei/controlador.php?acao=${action}&infra_unidade_atual=${unitId}`,runScripts:'outside-only'}),w=dom.window;
 let gets=0,sets=0;
 w.SEI_ORGANIZADOR_CONFIG={unitId:unit,org:'SEPM'};
 w.chrome={storage:{local:{get:async key=>{gets++;return {[key]:structuredClone(storage[key])};},set:async values=>{sets++;Object.assign(storage,structuredClone(values));}}}};
 w.fetch=()=>{throw Error('Sugestões não devem fazer requisições');};
 w.eval(read('users.js'));
 return {w,storage,close:()=>w.close(),get gets(){return gets;},get sets(){return sets;}};
}

test('seletor de atribuição fornece nomes/logins e ignora opção vazia; sem captura, o catálogo começa vazio',async()=>{
 const f=fixture({html:native});try{
  const users=f.w.seiUnitUsers.parse(f.w.document);
  assert.deepEqual(plain(users),people);
  assert.equal(f.sets,0);assert.deepEqual(plain(await f.w.seiUnitUsers.list(identity)),[],'nenhuma lista vem embutida na extensão');
  assert.equal(f.w.SEI_ORGANIZADOR_USERS,undefined);assert.equal(read('manifest.json').includes('users-data'),false);
  assert.deepEqual(plain(await f.w.seiUnitUsers.list({...identity,unit:'outra'})),[]);
 }finally{f.close();}
});

test('atribuição atualiza catálogo local sem alterar seleção e outra unidade/órgão não contamina o catálogo',async()=>{
 const f=fixture({action:'procedimento_atribuicao_listar',html:native});try{
  await tick();assert.equal(f.storage.seiUnitUsers.users.length,5);
  const select=f.w.document.querySelector('#selAtribuicao');assert.equal(select.value,'null');
  const option=f.w.document.createElement('option');option.value='999';option.textContent='novo.usuario - Usuário Novo';select.append(option);
  await tick();assert.equal((await f.w.seiUnitUsers.list(identity)).length,6);assert.equal(select.value,'null');
  const before=structuredClone(f.storage);
  for(const values of [{unitId:'2'},{org:'OUTRO'}]){
   const other=fixture({action:'procedimento_atribuicao_listar',html:native,storage:f.storage,...values});
   try{await tick();assert.equal(other.sets,0);assert.deepEqual(f.storage,before);}finally{other.close();}
  }
 }finally{f.close();}
});

test('página comum não inicia observador de usuários nem acessa armazenamento em segundo plano',async()=>{
 const f=fixture();try{
  await tick();for(let i=0;i<10;i++)f.w.document.body.append(f.w.document.createElement('div'));
  await tick();assert.equal(f.gets,0);assert.equal(f.sets,0);
  const cached={unit,org:'SEPM',users:[{login:'atual',name:'Cadastro Atual'}]};f.storage.seiUnitUsers=cached;
  assert.deepEqual(plain(await f.w.seiUnitUsers.list(identity)),cached.users);
  f.storage.seiUnitUsers={...cached,users:[{login:'inválido',name:'Não aceitar'}]};
  assert.deepEqual(plain(await f.w.seiUnitUsers.list(identity)),[]);
 }finally{f.close();}
});

function modal(storage=saved(),html=''){
 const f=fixture({storage,html}),w=f.w,calls=[];
 const view={sound:true,chiefLogins:[],chiefEligible:false,records:[]};
 w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));
 const settings=w.seiOrganizerSettings({getIdentity:()=>identity,getView:()=>view,onView:()=>{},call:async(type,extra)=>{
  calls.push({type,...plain(extra)});if(type==='monitor:chiefs')view.chiefLogins=plain(extra.logins);return view;
 }});
 settings.mount();w.document.querySelector('#sei-organizador-settings-button').click();
 const root=w.document.querySelector('#sei-organizador-configuracoes').shadowRoot;
 return {...f,w,root,calls,search:text=>{const input=root.querySelector('#so-chief-search');input.value=text;input.dispatchEvent(new w.Event('input'));return input;}};
}

test('busca por nome sem acentos adiciona só login e não duplica chefe ao salvar',async()=>{
 const f=modal();try{
  await tick();f.search('goncalo');let option=f.root.querySelector('[role=option]');
  assert.match(option.textContent,/Fulano Gonçalo.*goncalo.t/);option.click();
  f.search('danilo');f.root.querySelector('[role=option]').click();
  f.search('DANILO');f.root.querySelector('[role=option]').click();
  assert.equal(f.root.querySelector('textarea').value,'goncalo.t\ndanilo');
  [...f.root.querySelectorAll('button')].find(b=>b.textContent==='Salvar chefes').click();await tick();
  assert.deepEqual(f.calls,[{type:'monitor:chiefs',logins:['goncalo.t','danilo']}]);
  assert.equal(f.root.querySelector('textarea').value,'goncalo.t\ndanilo');
 }finally{f.close();}
});

test('sugestões aceitam teclado e Escape fecha sugestões antes do modal',async()=>{
 const f=modal();try{
  await tick();let input=f.search('danilo');
  const key=key=>input.dispatchEvent(new f.w.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  key('Escape');assert.equal(f.root.querySelector('[role=listbox]').hidden,true);assert.equal(f.root.querySelector('dialog').open,true);
  input=f.search('danilo');key('ArrowDown');assert.ok(input.getAttribute('aria-activedescendant'));key('Enter');
  assert.equal(f.root.querySelector('textarea').value,'danilo');assert.equal(f.root.querySelector('dialog').open,true);
  input=f.search('nenhum-usuario-encontrado');assert.equal(f.root.querySelector('[role=listbox]').hidden,true);
  assert.match(f.root.querySelector('.chief-search').textContent,/Nenhum usuário encontrado/);
  key('Escape');assert.equal(f.root.querySelector('dialog').open,false);
 }finally{f.close();}
});

test('sem catálogo e sem endereço da tela de atribuição, a busca explica e a digitação manual continua',async()=>{
 const f=modal({});try{
  await tick();assert.match(f.root.querySelector('.chief-search').textContent,/Na primeira busca, a lista de usuários é lida no SEI/);
  f.search('danilo');await tick();assert.equal(f.root.querySelector('[role=option]'),null);
  assert.match(f.root.querySelector('.chief-search').textContent,/Não foi possível obter a lista de usuários no SEI. Abra uma vez a tela Atribuir Processo/);
  assert.ok(f.root.querySelector('textarea'));
 }finally{f.close();}
});

const sei='https://sei.rj.gov.br/sei/controlador.php';
const assignUrl=sei+'?acao=procedimento_atribuicao_cadastrar&acao_origem=procedimento_controlar&infra_unidade_atual='+unit+'&infra_hash=abc';
const controlUrl=sei+'?acao=procedimento_controlar&reset=1&infra_unidade_atual='+unit+'&infra_hash=def';
const assignLink=`<a href="#" onclick="return acaoControleProcessos('controlador.php?acao=procedimento_atribuicao_cadastrar&amp;acao_origem=procedimento_controlar&amp;infra_unidade_atual=${unit}&amp;infra_hash=abc')">Atribuição</a>`;
const page=body=>new Response('<html><body>'+body+'</body></html>',{headers:{'content-type':'text/html; charset=utf-8'}});
function searching(html,answers){
 const f=modal({},html),asked=[];
 Object.assign(f.w,{TextDecoder,fetch:async url=>{asked.push(String(url));const body=answers[String(url)];if(body===undefined)throw new TypeError('Failed to fetch');return page(body);}});
 return {...f,asked};
}

test('primeira busca lê a lista na tela Atribuir Processo, uma vez, e guarda só no navegador',async()=>{
 const f=searching(assignLink,{[assignUrl]:native});try{
  await tick();assert.equal(f.asked.length,0,'abrir as configurações não consulta o SEI');
  f.search('danilo');assert.match(f.root.querySelector('.chief-search').textContent,/Buscando a lista de usuários no SEI/);
  await tick();assert.deepEqual(f.asked,[assignUrl]);
  assert.match(f.root.querySelector('[role=option]').textContent,/Danilo Exemplo Pinheiro — danilo/);
  assert.equal(f.storage.seiUnitUsers.users.length,5);assert.equal(f.storage.seiUnitUsers.unit,unit);
  f.search('ana');f.search('zeca');await tick();assert.equal(f.asked.length,1,'não repete a leitura');
 }finally{f.close();}
});

test('sem o link na tela atual, a busca passa pelo Controle de Processos do menu: duas leituras no total',async()=>{
 const menu=`<a id="linkMenu8" href="controlador.php?acao=procedimento_controlar&amp;reset=1&amp;infra_unidade_atual=${unit}&amp;infra_hash=def">Controle de Processos</a>`;
 const f=searching(menu,{[controlUrl]:assignLink,[assignUrl]:native});try{
  await tick();f.search('zeca');await tick();
  assert.deepEqual(f.asked,[controlUrl,assignUrl]);assert.match(f.root.querySelector('[role=option]').textContent,/Zeca Modelo/);
 }finally{f.close();}
});

test('tela de atribuição sem o seletor, falha de rede e endereço de outra unidade não inventam usuários',async()=>{
 for(const [html,answers,requests] of [
  [assignLink,{[assignUrl]:'<p>Nenhum processo selecionado.</p>'},1],
  [assignLink,{},1],
  [assignLink.replace('infra_unidade_atual='+unit,'infra_unidade_atual=999'),{},0],
  [`<a href="https://evil.test/sei/controlador.php?acao=procedimento_atribuicao_cadastrar&amp;infra_unidade_atual=${unit}">x</a>`,{},0],
 ]){
  const f=searching(html,answers);try{
   await tick();f.search('danilo');await tick();
   assert.equal(f.asked.length,requests);assert.equal(f.root.querySelector('[role=option]'),null);assert.equal(f.storage.seiUnitUsers,undefined);
   assert.match(f.root.querySelector('.chief-search').textContent,/Não foi possível obter a lista de usuários no SEI/);
   f.search('ana');await tick();assert.equal(f.asked.length,requests,'uma tentativa por abertura das configurações');
  }finally{f.close();}
 }
});

test('tela Atribuir Processo (procedimento_atribuicao_cadastrar) também alimenta o catálogo',async()=>{
 const f=fixture({action:'procedimento_atribuicao_cadastrar',html:native});try{
  await tick();assert.equal(f.storage.seiUnitUsers.users.length,5);assert.equal((await f.w.seiUnitUsers.list(identity)).length,5);
 }finally{f.close();}
 const other=fixture({action:'procedimento_atribuir_outra_coisa',html:native});try{await tick();assert.equal(other.sets,0);}finally{other.close();}
});
