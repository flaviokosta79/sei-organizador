import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../server/store.js';

const actor={login:'teste',org:'SEPM'};
const status=(s,block,process,value)=>s.mutate('1',block,s.read('1',block).version,actor,{type:'status',status:value,processIds:[process]});

test('histórico reutilizado mantém dados isolados do chamador e invalida conflitos de desfazer',()=>{
 const s=createStore(':memory:');try{
  status(s,'2','10','urgent');const first=s.history('1','2');
  assert.deepEqual(s.history('1','2'),first);
  const modified=s.history('1','2');modified[0].actor.login='alterado';modified[0].action.processIds.push('99');modified.pop();
  assert.deepEqual(s.history('1','2'),first);
  status(s,'3','10','sign');assert.deepEqual(s.history('1','2'),first);
  status(s,'2','10','archive');const next=s.history('1','2');
  assert.equal(next.length,2);assert.equal(next[1].undoable,false);assert.equal(next[0].undoable,true);
  s.mutate('1','2',s.read('1','2').version,actor,{type:'undo',historyId:next[0].id});
  assert.equal(s.history('1','2')[1].undoable,false);
 }finally{s.close();}
});

test('histórico detecta alterações por outra conexão mesmo sem mudança do último ID',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-cache-')),path=join(dir,'db.sqlite');const s=createStore(path);const other=new DatabaseSync(path);
 try{
  status(s,'2','10','urgent');const before=s.history('1','2');assert.deepEqual(s.history('1','2'),before);
  other.prepare('UPDATE history SET actor=? WHERE id=?').run(JSON.stringify({login:'outro',org:'SEPM'}),before[0].id);
  assert.equal(s.history('1','2')[0].actor.login,'outro');
  other.prepare('DELETE FROM history WHERE id=?').run(before[0].id);assert.deepEqual(s.history('1','2'),[]);
 }finally{other.close();s.close();rmSync(dir,{recursive:true,force:true});}
});

test('falha de gravação não publica dados parciais no histórico reutilizado',()=>{
 const s=createStore(':memory:');try{
  status(s,'2','10','urgent');const before=s.history('1','2');
  assert.throws(()=>s.mutate('1','2',0,actor,{type:'create',name:'Inválida'}));
  assert.deepEqual(s.history('1','2'),before);
  status(s,'2','20','sign');assert.equal(s.history('1','2').length,2);assert.equal(s.history('1','2')[1].undoable,true);
 }finally{s.close();}
});
