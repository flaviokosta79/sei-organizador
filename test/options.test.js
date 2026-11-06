import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');
const settle=()=>new Promise(r=>setTimeout(r,20));
const identity={unit:'1',org:'SEPM',login:'pessoa',name:'Pessoa Teste'};

function page({tabs=[{id:1,active:false,lastAccessed:1},{id:2,active:true,lastAccessed:2},{id:3,active:false,lastAccessed:3}],answers={},profile={}}={}){
 const html=read('options.html').replace('<script src="options.js"></script>','');
 const dom=new JSDOM(html,{runScripts:'outside-only'}),w=dom.window,asked=[],calls=[];
 const profiles=[{id:'1:SEPM:pessoa',identity,block:'9',catalog:[{id:'2',name:'Restituições'},{id:'3',name:'Pessoal'}],lastUsed:1,...profile}];
 w.chrome={runtime:{sendMessage:async msg=>{calls.push(msg);if(msg.type==='scope:options')return {data:{profiles:structuredClone(profiles)}};if(msg.type==='scope:set'){profiles[0].block=msg.block;return {data:{ok:true}};}return {error:'?'};}},
  tabs:{query:async()=>tabs,sendMessage:async(id,msg)=>{asked.push(id);assert.equal(msg.type,'scope:catalog-request');const a=answers[id]??{ok:true};if(a instanceof Error)throw a;return a;}}};
 w.eval(read('options.js'));
 return {dom,w,d:w.document,asked,calls};
}

test('opções pedem a lista a uma aba só, a ativa primeiro, e passam à seguinte se ela falhar',async()=>{
 let p=page();try{await settle();assert.deepEqual(p.asked,[2]);}finally{p.dom.window.close();}
 p=page({answers:{2:new Error('Aba recarregando'),3:{error:'Sessão expirada'}}});
 try{await settle();assert.deepEqual(p.asked,[2,3,1],'ativa, depois a mais recente');}finally{p.dom.window.close();}
});

test('bloco salvo fora do catálogo não deixa salvar vazio: começa pelo primeiro bloco listado',async()=>{
 const p=page();try{await settle();
  const block=p.d.querySelector('#block'),save=p.d.querySelector('#save');
  assert.equal(block.value,'2');assert.equal(save.disabled,false);
  save.click();await settle();
  const set=p.calls.find(c=>c.type==='scope:set');assert.equal(set.block,'2');assert.match(p.d.querySelector('#status').textContent,/Bloco 2 salvo/);
 }finally{p.dom.window.close();}
 const empty=page({profile:{catalog:[]}});
 try{await settle();assert.equal(empty.d.querySelector('#save').disabled,true);}finally{empty.dom.window.close();}
});
