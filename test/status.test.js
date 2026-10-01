import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../server/store.js';
import '../extension/history.js';
test('status persistente independente, allowlist, conflitos, histórico e desfazer antigo',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-status-')),path=join(dir,'db.sqlite');let s=createStore(path);
 try{const actor={login:'teste'};let r=s.mutate('1','2',0,actor,{type:'create',name:'Pasta'});const tabId=r.tabs[0].id;
 const db=new DatabaseSync(path);db.prepare('UPDATE blocks SET state=?').run(JSON.stringify({tabs:r.tabs,assignments:{}}));const first=db.prepare('SELECT id,before FROM history LIMIT 1').get();const before=JSON.parse(first.before);delete before.statuses;db.prepare('UPDATE history SET before=? WHERE id=?').run(JSON.stringify(before),first.id);db.close();assert.deepEqual(s.read('1','2').statuses,{});
 r=s.mutate('1','2',1,actor,{type:'status',status:'urgent',processIds:['10'],processNumbers:{10:'SEI-123456/123456/2026'}});assert.equal(r.statuses[10],'urgent');assert.throws(()=>s.mutate('1','2',1,actor,{type:'status',status:'follow',processIds:['10']}),e=>e.status===409);
 assert.throws(()=>s.mutate('1','2',2,actor,{type:'status',status:'automatic',processIds:['10']}));
 r=s.mutate('1','2',2,actor,{type:'assign',tabId,processIds:['10']});assert.equal(r.statuses[10],'urgent');
 r=s.mutate('1','2',3,actor,{type:'status',status:'none',processIds:['10']});assert.equal(r.statuses[10],undefined);assert.match(seiHistoryText(s.history('1','2')[0]),/Urgente → Sem status/);
 r=s.mutate('1','2',4,actor,{type:'undo'});assert.equal(r.statuses[10],'urgent');s.close();s=createStore(path);assert.equal(s.read('1','2').statuses[10],'urgent');assert.deepEqual(s.read('1','3').statuses,{});
 s.mutate('1','4',0,actor,{type:'create',name:'Antiga'});const legacy=new DatabaseSync(path);legacy.prepare('UPDATE history SET before=? WHERE block=?').run(JSON.stringify({tabs:[],assignments:{}}),'4');legacy.close();assert.deepEqual(s.mutate('1','4',1,actor,{type:'undo'}).statuses,{});
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
