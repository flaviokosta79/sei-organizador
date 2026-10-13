import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {createStore} from '../server/store.js';
import {undoPlan} from '../server/undo.js';

// Reference: the original algorithm, applied to full before/after snapshots.
const key=parts=>JSON.stringify(parts);
function fullChanges(before,after){
 const result=new Map(),oldTabs=new Map(before.tabs.map(t=>[t.id,t])),newTabs=new Map(after.tabs.map(t=>[t.id,t]));
 for(const id of new Set([...oldTabs.keys(),...newTabs.keys()])){const a=oldTabs.get(id),b=newTabs.get(id);if(!a||!b)result.set(key(['tab',id]),{before:a,after:b,index:before.tabs.findIndex(t=>t.id===id)});else if(a.name!==b.name)result.set(key(['name',id]),{before:a.name,after:b.name});}
 for(const p of new Set([...Object.keys(before.assignments),...Object.keys(after.assignments)])){const a=new Set(before.assignments[p]||[]),b=new Set(after.assignments[p]||[]);for(const id of new Set([...a,...b]))if(a.has(id)!==b.has(id))result.set(key(['assignment',id,p]),{before:a.has(id),after:b.has(id)});}
 for(const p of new Set([...Object.keys(before.statuses||{}),...Object.keys(after.statuses||{})])){const a=before.statuses?.[p]||'none',b=after.statuses?.[p]||'none';if(a!==b)result.set(key(['status',p]),{before:a,after:b});}
 return result;
}
function referencePlan(record,later){
 if(JSON.parse(record.action).type==='undo')return {reason:'undo'};
 const patch=fullChanges(JSON.parse(record.before),JSON.parse(record.after));if(!patch.size)return {reason:'empty'};
 for(const h of later){const action=JSON.parse(h.action);if(action.type==='undo'&&action.historyId===record.id)return {reason:'done'};
  for(const changed of fullChanges(JSON.parse(h.before),JSON.parse(h.after)).keys()){const [kind,id]=JSON.parse(changed);for(const original of patch.keys()){const [ok,oid]=JSON.parse(original);if(changed===original||(id===oid&&kind!=='status'&&ok!=='status'&&(kind==='tab'||ok==='tab')))return {reason:'dependency'};}}}
 return {patch};
}
const reasons={'Este registro já é uma operação de desfazer.':'undo','Esta operação não alterou os dados.':'empty','Esta alteração já foi desfeita.':'done'};
const codes=new Set(['undo','empty','done','dependency']);
const summary=plan=>plan.reason?(codes.has(plan.reason)?plan.reason:reasons[plan.reason]||'dependency'):JSON.stringify([...plan.patch].sort());

test('snapshots compactos mantêm o mesmo plano de desfazer que snapshots completos',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-compact-'));const path=join(dir,'db.sqlite');const s=createStore(path);
 let seed=7;const random=n=>{seed=(seed*1103515245+12345)%2147483648;return Math.floor(seed/2147483648*n);};
 const actors=[{login:'a',org:'SEPM'},{login:'b',org:'SEPM'},{login:'c',org:'SEPM'}],states=new Map([[0,s.read('1','2')]]);
 try{
  for(let step=0;step<250;step++){
   const state=s.read('1','2'),tabs=state.tabs,tab=tabs.length?tabs[random(tabs.length)].id:'x',ids=Array.from({length:1+random(3)},()=>String(1+random(12)));
   const options=[{type:'create',name:'T'+step},{type:'rename',tabId:tab,name:'R'+step},{type:'delete',tabId:tab},{type:'assign',tabId:tab,processIds:ids},{type:'assign',tabId:tab,processIds:ids},{type:'unassign',tabId:tab,processIds:ids},{type:'status',processIds:[ids[0]],status:['none','attention','follow','urgent','archive'][random(5)]},{type:'undo',historyId:1+random(step+1)}];
   const action=tabs.length<2&&random(2)?options[0]:options[random(options.length)];
   try{const next=s.mutate('1','2',state.version,actors[random(3)],action);states.set(next.version,next);}catch{}
  }
  const db=new DatabaseSync(path);const rows=db.prepare('SELECT * FROM history ORDER BY id').all();db.close();
  assert.ok(rows.length>150);assert.ok(rows.some(r=>JSON.parse(r.action).type==='undo'));
  const strip=({version,...rest})=>({statuses:{},...rest});
  const full=rows.map(r=>({...r,before:JSON.stringify(strip(states.get(r.version-1))),after:JSON.stringify(strip(states.get(r.version)))}));
  let undoable=0;
  for(let i=0;i<rows.length;i++){
   const expected=summary(referencePlan(full[i],full.slice(i+1)));
   assert.equal(summary(undoPlan(rows[i],rows.slice(i+1))),expected,`registro ${rows[i].id}`);
   // Databases keep legacy full rows next to new compact rows.
   const mixed=rows.slice(i+1).map((r,j)=>j%2?full[i+1+j]:r);
   assert.equal(summary(undoPlan(i%2?full[i]:rows[i],mixed)),expected,`registro misto ${rows[i].id}`);
   if(expected.startsWith('['))undoable++;
  }
  assert.ok(undoable>5);
  const last=rows.at(-1);assert.ok(last.after.length<=JSON.stringify(strip(s.read('1','2'))).length);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});

test('histórico guarda somente os processos alterados e o bloco guarda o estado completo',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-compact-'));const path=join(dir,'db.sqlite');const s=createStore(path);const actor={login:'a',org:'SEPM'};
 try{
  let r=s.mutate('1','2',0,actor,{type:'create',name:'A'});const tab=r.tabs[0].id;
  const ids=Array.from({length:1000},(_,i)=>String(i+1));r=s.mutate('1','2',r.version,actor,{type:'assign',tabId:tab,processIds:ids});
  r=s.mutate('1','2',r.version,actor,{type:'status',processIds:['5'],status:'urgent'});
  const db=new DatabaseSync(path);const row=db.prepare('SELECT before,after FROM history ORDER BY id DESC LIMIT 1').get();db.close();
  assert.deepEqual(JSON.parse(row.before),{tabs:[{id:tab,name:'A'}],assignments:{},statuses:{}});
  assert.deepEqual(JSON.parse(row.after),{tabs:[{id:tab,name:'A'}],assignments:{},statuses:{5:'urgent'}});
  assert.equal(Object.keys(s.read('1','2').assignments).length,1000);
  r=s.mutate('1','2',r.version,actor,{type:'undo',historyId:s.history('1','2')[0].id});assert.deepEqual(r.statuses,{});assert.equal(Object.keys(r.assignments).length,1000);
 }finally{s.close();rmSync(dir,{recursive:true,force:true});}
});
