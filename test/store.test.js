import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.js';
test('classificação, conflitos, isolamento, histórico, desfazer e persistência',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-org-'));const path=join(dir,'db.sqlite');let s=createStore(path);const actor={name:'Teste',login:'teste',verified:false};
 try{let r=s.mutate('1','2',0,actor,{type:'create',name:'Assunto'});const tabId=r.tabs[0].id;
 r=s.mutate('1','2',1,actor,{type:'assign',tabId,processIds:['100','200']});assert.deepEqual(r.assignments['100'],[tabId]);
 assert.throws(()=>s.mutate('1','2',1,actor,{type:'rename',tabId,name:'Conflito'}),e=>e.status===409);assert.equal(s.read('1','3').version,0);
 r=s.mutate('1','2',2,actor,{type:'delete',tabId});assert.deepEqual(r.assignments,{});
 const latest=s.history('1','2')[0];assert.throws(()=>s.mutate('1','2',3,actor,{type:'undo',historyId:latest.id-1}),e=>e.status===409);assert.equal(s.read('1','2').version,3);
 r=s.mutate('1','2',3,actor,{type:'undo',historyId:latest.id});assert.equal(r.tabs.length,1);assert.deepEqual(r.assignments['200'],[tabId]);assert.equal(s.history('1','2').length,4);
 assert.throws(()=>s.mutate('1','2',4,actor,{type:'assign',tabId,processIds:['bad']}));assert.equal(s.read('1','2').version,4);
 s.close();s=createStore(path);assert.equal(s.read('1','2').version,4);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('retenção mantém as 300 alterações mais recentes por bloco e 60 dias de aberturas e assinaturas',()=>{
 const s=createStore(':memory:');const actor={name:'Teste',login:'teste',org:'SEPM',verified:false};
 try{
  let version=0;for(let i=0;i<305;i++)version=s.mutate('1','2',version,actor,{type:'status',status:i%2?'urgent':'none',processIds:['10']}).version;
  s.mutate('1','3',0,actor,{type:'status',status:'sign',processIds:['20']});
  const day=86400000,now=Date.now();
  s.alerts.opened('1','30',{login:'a',org:'SEPM'});s.alerts.opened('1','31',{login:'a',org:'SEPM'},'2');
  const sig=s.signatures;const member={login:'smoke',org:'SEPM'};sig.sync('1','2',{actor:member,after:null});
  const observed={process:'10',document:'11',number:'555',signatureBlock:'99',includedAt:now-60000,includedBy:{login:'smoke',name:'Smoke'},signature:{time:now,signer:{login:'chefe',name:'Chefe'}}};
  assert.equal(sig.observe('1','2',{actor:member,observations:[observed,{...observed,document:'12'}]}).accepted,2);
  const newest=sig.sync('1','2',{actor:member,after:null}).cursor;
  const before=s.history('1','2');
  assert.deepEqual(s.maintain(now+day),{removed:5},'só o excedente do bloco 2; dados recentes preservados');
  assert.equal(s.history('1','3').length,1);assert.deepEqual(s.history('1','2').map(h=>h.id),before.map(h=>h.id),'tela de histórico inalterada');
  assert.equal(s.read('1','2').version,305,'estado atual não muda');
  const removed=s.maintain(now+61*day).removed;assert.equal(removed,5,'2 aberturas, 1 assinatura e 2 acompanhamentos antigos');
  // The newest event stays, so SQLite never hands its id out again to a new signature.
  assert.deepEqual(sig.sync('1','2',{actor:member,after:0}).events.map(e=>e.id),[newest]);
  assert.equal(s.maintain(now+61*day).removed,0,'idempotente');
  sig.observe('1','2',{actor:member,observations:[{...observed,document:'13'}]});
  const next=sig.sync('1','2',{actor:member,after:newest});assert.equal(next.events.length,1);assert.ok(next.events[0].id>newest);
 }finally{s.close();}
});

test('abertura em lote marca vários processos vistos numa única gravação por bloco',()=>{
 const s=createStore(':memory:');const a=s.alerts;const actor={login:'a',org:'SEPM'};
 try{
  let r=a.snapshot('1','2',{version:0,ids:['10']});r=a.snapshot('1','2',{version:r.version,ids:['10','20','30']});
  const version=a.read('1','2').version;
  a.openedMany('1',['20','30'],actor,'2');
  const state=a.read('1','2');assert.equal(state.version,version+1);assert.equal(state.entries['20'].seen,true);assert.equal(state.entries['30'].seen,true);
  for(const bad of [[],['x'],['20','20'],Array.from({length:1001},(_,i)=>String(i))])assert.throws(()=>a.openedMany('1',bad,actor,'2'),/Processos inválidos/);
 }finally{s.close();}
});

test('unidade guarda estado de no máximo N blocos; blocos já conhecidos continuam aceitos',()=>{
 const s=createStore(':memory:');const actor={login:'a',org:'SEPM'};
 try{
  for(const block of ['1','2'])s.mutate('1',block,0,actor,{type:'create',name:'A'});
  s.alerts.snapshot('1','3',{version:0,ids:[]});
  assert.throws(()=>s.admit('1','4',3),e=>e.status===409&&/Limite de 3 blocos/.test(e.message));
  for(const block of ['1','2','3'])s.admit('1',block,3);
  s.admit('2','4',3);
 }finally{s.close();}
});
