import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.js';

test('vistos compartilhados: referência silenciosa, abertura global, reinclusão e concorrência',(t)=>{
 t.mock.timers.enable({apis:['Date'],now:1800000000000});
 const store=createStore(':memory:');const a=store.alerts;
 try{
  let state=a.snapshot('1','2',{version:0,ids:['10']});assert.equal(state.entries['10'].seen,true);
  state=a.snapshot('1','2',{version:state.version,ids:['10','20']});assert.equal(state.entries['20'].seen,false);
  const token=state.entries['20'].token;
  a.snapshot('1','3',{version:0,ids:['20'],pendingIds:['20']});
  assert.equal(a.read('1','3').entries['20'].seen,false);
  a.opened('1','20',{login:'colega',org:'SEPM'});
  assert.equal(a.read('1','2').entries['20'].seen,true);assert.equal(a.read('1','3').entries['20'].seen,true);
  assert.throws(()=>a.snapshot('1','2',{version:state.version,ids:[]}),e=>e.status===409);
  state=a.read('1','2');state=a.snapshot('1','2',{version:state.version,ids:['10']});
  // Ensure the earlier opening predates the next observed absence.
  t.mock.timers.tick(10);
  state=a.snapshot('1','2',{version:state.version,ids:['10']});
  state=a.snapshot('1','2',{version:state.version,ids:['10','20']});assert.equal(state.entries['20'].seen,false);assert.notEqual(state.entries['20'].token,token);
  assert.deepEqual(store.read('1','2'),{version:0,tabs:[],assignments:{},statuses:{}});assert.equal(store.history('1','2').length,0);
 }finally{store.close();}
});

test('abertura antes da próxima consulta é preservada e dados inválidos não alteram o estado',()=>{
 const store=createStore(':memory:');try{const a=store.alerts;
  let state=a.snapshot('1','2',{version:0,ids:['10']});a.opened('1','20',{login:'colega'});
  state=a.snapshot('1','2',{version:state.version,ids:['10','20']});assert.equal(state.entries['20'].seen,true);
  for(const ids of [['1','1'],['x'],[1]])assert.throws(()=>a.snapshot('1','2',{version:state.version,ids}));
  assert.throws(()=>a.snapshot('1','2',{version:state.version,ids:['1'],pendingIds:['2']}));
  assert.throws(()=>a.opened('1','x',{}));assert.deepEqual(a.read('1','2'),state);
  assert.equal(a.read('2','2').entries,null);
 }finally{store.close();}
});

test('avisos locais migram mesmo após referência silenciosa de outro navegador, sem ressuscitar vistos',()=>{
 const store=createStore(':memory:');try{const a=store.alerts;
  let state=a.snapshot('1','2',{version:0,ids:['10']});assert.equal(state.entries['10'].seen,true);
  state=a.snapshot('1','2',{version:state.version,ids:['10'],pendingIds:['10']});assert.equal(state.entries['10'].seen,false);
  a.opened('1','10',{login:'colega'});state=a.read('1','2');
  state=a.snapshot('1','2',{version:state.version,ids:['10'],pendingIds:['10']});assert.equal(state.entries['10'].seen,true);
 }finally{store.close();}
});

test('reconhecimento e novas tabelas persistem sem alterar dados existentes',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-alerts-'));let store=createStore(join(dir,'db.sqlite'));
 try{store.mutate('1','2',0,{login:'pessoa'},{type:'status',status:'sign',processIds:['10']});
  store.alerts.snapshot('1','2',{version:0,ids:['10'],pendingIds:['10']});store.alerts.opened('1','10',{login:'colega'});store.close();
  store=createStore(join(dir,'db.sqlite'));assert.equal(store.alerts.read('1','2').entries['10'].seen,true);assert.equal(store.read('1','2').statuses['10'],'sign');assert.equal(store.history('1','2').length,1);
 }finally{store.close();rmSync(dir,{recursive:true,force:true});}
});
