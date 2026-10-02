import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createStore} from '../server/store.js';
const alice={login:'alice',org:'SEPM'},bob={login:'bob',org:'SEPM'};
function fixture(fn){const dir=mkdtempSync(join(tmpdir(),'sei-undo-'));const s=createStore(join(dir,'db.sqlite'));let version=0;const act=(actor,action)=>{const result=s.mutate('1','2',version,actor,action);version=result.version;return result;};try{fn(s,act);}finally{s.close();rmSync(dir,{recursive:true,force:true});}}
test('desfazer próprio seletivo preserva colega no mesmo processo e bloqueia identidade, repetição e corrida',()=>fixture((s,act)=>{
 const tab=act(alice,{type:'create',name:'Pasta'}).tabs[0].id;
 act(alice,{type:'status',processIds:['10'],status:'urgent'});const chosen=s.history('1','2')[0];
 act(bob,{type:'assign',tabId:tab,processIds:['10']});
 assert.throws(()=>act(bob,{type:'undo',historyId:chosen.id}),e=>e.status===403);
 assert.throws(()=>act({login:'',org:'SEPM'},{type:'undo',historyId:chosen.id}),e=>e.status===403);
 assert.throws(()=>act({login:'alice',org:'OTHER'},{type:'undo',historyId:chosen.id}),e=>e.status===403);
 const state=act(alice,{type:'undo',historyId:chosen.id});assert.deepEqual(state.statuses,{});assert.deepEqual(state.assignments[10],[tab]);
 assert.equal(s.history('1','2').find(h=>h.id===chosen.id).undoable,false);
 assert.throws(()=>act(alice,{type:'undo',historyId:chosen.id}),e=>e.status===409);
 assert.throws(()=>act(alice,{type:'undo',historyId:s.history('1','2')[0].id}),e=>e.status===409);
 assert.throws(()=>s.mutate('1','2',state.version-1,alice,{type:'undo',historyId:chosen.id}),e=>e.status===409);
}));
test('alteração posterior no mesmo campo bloqueia inclusive quando volta ao valor anterior',()=>fixture((s,act)=>{
 act(alice,{type:'status',processIds:['10'],status:'urgent'});const chosen=s.history('1','2')[0];
 act(bob,{type:'status',processIds:['10'],status:'follow'});act(bob,{type:'status',processIds:['10'],status:'urgent'});
 assert.equal(s.history('1','2').find(h=>h.id===chosen.id).undoable,false);
 assert.throws(()=>act(alice,{type:'undo',historyId:chosen.id}),e=>e.status===409);assert.equal(s.read('1','2').statuses[10],'urgent');
}));
test('vínculos independentes, renomeação e restauração de pasta preservam alterações posteriores',()=>fixture((s,act)=>{
 const a=act(alice,{type:'create',name:'A'}).tabs[0].id,b=act(bob,{type:'create',name:'B'}).tabs[1].id;
 act(alice,{type:'assign',tabId:a,processIds:['10']});const assignment=s.history('1','2')[0];
 act(bob,{type:'assign',tabId:b,processIds:['10']});act(alice,{type:'undo',historyId:assignment.id});assert.deepEqual(s.read('1','2').assignments[10],[b]);
 act(alice,{type:'rename',tabId:a,name:'Nova'});const rename=s.history('1','2')[0];act(bob,{type:'status',processIds:['10'],status:'follow'});act(alice,{type:'undo',historyId:rename.id});assert.equal(s.read('1','2').tabs[0].name,'A');
 act(alice,{type:'assign',tabId:a,processIds:['10']});act(alice,{type:'delete',tabId:a});const deletion=s.history('1','2')[0];act(bob,{type:'status',processIds:['10'],status:'urgent'});act(alice,{type:'undo',historyId:deletion.id});const state=s.read('1','2');assert.ok(state.assignments[10].includes(a)&&state.assignments[10].includes(b));assert.equal(state.statuses[10],'urgent');
}));
test('desfazer criação bloqueia dependências posteriores e operações em lote são atômicas',()=>fixture((s,act)=>{
 const tab=act(alice,{type:'create',name:'A'}).tabs[0].id,creation=s.history('1','2')[0];act(bob,{type:'assign',tabId:tab,processIds:['10']});
 assert.throws(()=>act(alice,{type:'undo',historyId:creation.id}),e=>e.status===409);
 act(alice,{type:'assign',tabId:tab,processIds:['20','30']});const batch=s.history('1','2')[0];act(bob,{type:'unassign',tabId:tab,processIds:['30']});
 assert.throws(()=>act(alice,{type:'undo',historyId:batch.id}),e=>e.status===409);assert.deepEqual(s.read('1','2').assignments[20],[tab]);
}));
