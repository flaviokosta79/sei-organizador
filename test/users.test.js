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

function modal(storage=saved()){
 const f=fixture({storage}),w=f.w,calls=[];
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

test('sem catálogo capturado, a busca orienta a abrir a tela de atribuição e a digitação manual continua',async()=>{
 const f=modal({});try{
  await tick();assert.match(f.root.querySelector('.chief-search').textContent,/Abra uma vez a tela Atribuir Processo do SEI para ativar a busca/);
  f.search('danilo');assert.equal(f.root.querySelector('[role=option]'),null);
  assert.match(f.root.querySelector('.chief-search').textContent,/ainda não foi lida neste navegador/);assert.doesNotMatch(f.root.querySelector('.chief-search').textContent,/Nenhum usuário encontrado/);
  assert.ok(f.root.querySelector('textarea'));
 }finally{f.close();}
});
