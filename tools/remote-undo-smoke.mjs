import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
const unit=process.env.SEI_UNIT_ID,path=`http://127.0.0.1:8787/v1/units/${unit}/blocks/0`;
const initial=await(await fetch(path)).json();assert.equal(initial.version,0,'Preservar bloco técnico já ocupado');
const alice={name:'Validação técnica A',login:'validacao-undo-a',org:'SEPM'},bob={login:'validacao-undo-b',org:'SEPM'};
let version=0;
async function post(actor,action,expected=200){const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,actor,action})});assert.equal(response.status,expected);const data=await response.json();if(expected===200)version=data.version;return data;}
try{
 const created=await post(alice,{type:'create',name:'Validação técnica de desfazer'}),tab=created.tabs[0].id;
 await post(alice,{type:'status',processIds:['100'],status:'urgent'});const chosen=(await(await fetch(path+'/history')).json())[0];
 await post(bob,{type:'assign',tabId:tab,processIds:['100']});
 await post(bob,{type:'undo',historyId:chosen.id},403);
 const undone=await post(alice,{type:'undo',historyId:chosen.id});assert.deepEqual(undone.statuses,{});assert.deepEqual(undone.assignments['100'],[tab]);
 await post(alice,{type:'undo',historyId:chosen.id},409);
 await post(alice,{type:'status',processIds:['100'],status:'urgent'});const conflict=(await(await fetch(path+'/history')).json())[0];
 await post(bob,{type:'status',processIds:['100'],status:'follow'});await post(alice,{type:'undo',historyId:conflict.id},409);
 assert.equal((await(await fetch(path)).json()).statuses['100'],'follow');
 console.log('API implantada: desfazer próprio, preservação de colega, rejeição de outro autor, repetição e conflito: OK');
}finally{
 const db=new DatabaseSync(process.env.DATA_FILE);db.exec('BEGIN IMMEDIATE');
 try{db.prepare('DELETE FROM history WHERE unit=? AND block=?').run(unit,'0');db.prepare('DELETE FROM blocks WHERE unit=? AND block=?').run(unit,'0');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
 console.log('Somente registros sintéticos do bloco técnico removidos');
}
