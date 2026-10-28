import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';

const read=file=>readFileSync(new URL('../extension/'+file,import.meta.url),'utf8');
const wait=()=>new Promise(resolve=>setTimeout(resolve,20));
function fixture(){
 const dom=new JSDOM('<a id="lnkUsuarioSistema">Usuário</a>',{url:'https://sei.rj.gov.br/sei/controlador.php',runScripts:'outside-only'}),w=dom.window;
 const identity={unit:'1',org:'SEPM',login:'pessoa'},calls=[];
 let fail=false,updates=0;
 const catalog=[{id:'2',name:'Pessoal'},{id:'1396',name:'Secretaria'}];
 w.seiWorkScope={block:'2',catalog,refreshCatalog:async()=>{updates++;return {block:w.seiWorkScope.block,catalog:[...catalog,{id:'3',name:'Expediente'}]};}};
 w.chrome={runtime:{sendMessage:()=>{throw Error('Não deve abrir opções externas');}}};
 w.eval(read('monitor-sounds.js'));w.eval(read('monitor-settings.js'));
 const view={sound:true,chiefLogins:[],chiefEligible:false,records:[]};
 const settings=w.seiOrganizerSettings({getIdentity:()=>identity,getView:()=>view,onView:()=>{},call:async(type,extra)=>{
  calls.push({type,...extra});if(fail)throw Error('Falha ao salvar bloco');
  assert.equal(type,'scope:set');w.seiWorkScope.block=extra.block;return {block:extra.block,catalog};
 }});
 settings.mount();w.document.querySelector('#sei-organizador-settings-button').click();
 const root=w.document.querySelector('#sei-organizador-configuracoes').shadowRoot;
 return {w,root,calls,close:()=>w.close(),get updates(){return updates;},set fail(v){fail=v;},button:text=>[...root.querySelectorAll('button')].find(b=>b.textContent===text)};
}

test('modal escolhe e salva bloco e atualiza catálogo sem sair do SEI nem perder rascunho de chefes',async()=>{
 const f=fixture();try{
  assert.equal(f.updates,0);const select=f.root.querySelector('select');
  assert.deepEqual([...select.options].map(o=>o.textContent),['2 · Pessoal','1396 · Secretaria']);
  const chiefs=f.root.querySelector('textarea');chiefs.value='chefe.teste';chiefs.dispatchEvent(new f.w.Event('input'));
  select.value='1396';select.dispatchEvent(new f.w.Event('change'));
  f.button('Salvar bloco de trabalho').click();await wait();
  assert.deepEqual(f.calls,[{type:'scope:set',block:'1396'}]);assert.equal(f.root.querySelector('dialog').open,true);
  assert.equal(f.root.querySelector('select').value,'1396');assert.equal(f.root.querySelector('textarea').value,'chefe.teste');
  assert.match(f.root.querySelector('[role=status]').textContent,/salvo/);
  f.button('Atualizar lista do SEI').click();await wait();
  assert.equal(f.updates,1);assert.equal(f.root.querySelector('select').options.length,3);
  assert.equal(f.root.querySelector('select').value,'1396');assert.equal(f.root.querySelector('textarea').value,'chefe.teste');
 }finally{f.close();}
});

test('falha ao salvar bloco mantém seleção no modal e permite repetir sem abrir outra página',async()=>{
 const f=fixture();try{
  f.fail=true;const select=f.root.querySelector('select');select.value='1396';select.dispatchEvent(new f.w.Event('change'));
  f.button('Salvar bloco de trabalho').click();await wait();
  assert.equal(select.value,'1396');assert.equal(select.disabled,false);assert.equal(f.root.querySelector('dialog').open,true);
  assert.match(f.root.querySelector('[role=status]').textContent,/Falha ao salvar/);
  f.fail=false;f.button('Salvar bloco de trabalho').click();await wait();
  assert.equal(f.root.querySelector('select').value,'1396');assert.match(f.root.querySelector('[role=status]').textContent,/salvo/);
 }finally{f.close();}
});
