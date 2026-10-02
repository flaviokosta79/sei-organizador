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
