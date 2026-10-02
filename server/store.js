import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import {sameActor,undoPlan,applyUndo} from './undo.js';
export function createStore(path) {
  mkdirSync(dirname(path), {recursive:true});
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS blocks (unit TEXT, block TEXT, version INTEGER, state TEXT, PRIMARY KEY(unit,block)); CREATE TABLE IF NOT EXISTS history (id INTEGER PRIMARY KEY, unit TEXT, block TEXT, time TEXT, actor TEXT, action TEXT, before TEXT, after TEXT, version INTEGER);');
  const read=(unit,block)=>{const r=db.prepare('SELECT * FROM blocks WHERE unit=? AND block=?').get(unit,block);return r?{version:r.version,statuses:{},...JSON.parse(r.state)}:{version:0,tabs:[],assignments:{},statuses:{}};};
  function mutate(unit,block,version,actor,action) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const old=read(unit,block); if(old.version!==version) throw Object.assign(new Error('Estado atualizado por outro colega. Recarregue e tente novamente.'),{status:409});
      const next=structuredClone(old); delete next.version;
      const tab=next.tabs.find(t=>t.id===action.tabId);
      switch(action.type) {
        case 'create': if(next.tabs.length>=100) throw new Error('Limite de abas atingido'); next.tabs.push({id:crypto.randomUUID(),name:validName(action.name)}); break;
        case 'rename': if(!tab) throw new Error('Aba inexistente'); tab.name=validName(action.name); break;
        case 'delete': if(!tab) throw new Error('Aba inexistente'); next.tabs=next.tabs.filter(t=>t.id!==tab.id); for(const id of Object.keys(next.assignments)){next.assignments[id]=next.assignments[id].filter(t=>t!==tab.id);if(!next.assignments[id].length) delete next.assignments[id];} break;
        case 'assign': case 'unassign':
          if(!tab||!Array.isArray(action.processIds)||action.processIds.length>1000||!action.processIds.every(id=>typeof id==='string'&&/^\d{1,30}$/.test(id))) throw new Error('Seleção inválida');
          for(const id of action.processIds){const a=new Set(next.assignments[id]||[]);action.type==='assign'?a.add(tab.id):a.delete(tab.id);if(a.size)next.assignments[id]=[...a];else delete next.assignments[id];} break;
        case 'status':
          if(!Array.isArray(action.processIds)||action.processIds.length!==1||typeof action.processIds[0]!=='string'||!/^\d{1,30}$/.test(action.processIds[0])||!['none','attention','follow','urgent','archive'].includes(action.status))throw new Error('Status inválido');
          if(action.status==='none')delete next.statuses[action.processIds[0]];else next.statuses[action.processIds[0]]=action.status;break;
        case 'undo': {
          if(!Number.isSafeInteger(action.historyId))throw Object.assign(new Error('Selecione uma alteração no histórico.'),{status:400});
          const h=db.prepare('SELECT * FROM history WHERE unit=? AND block=? AND id=?').get(unit,block,action.historyId);
          if(!h) throw new Error('Sem alteração para desfazer');
          if(!sameActor(actor,JSON.parse(h.actor)))throw Object.assign(new Error('Você só pode desfazer alterações feitas pelo seu próprio usuário.'),{status:403});
          const plan=undoPlan(h,db.prepare('SELECT * FROM history WHERE unit=? AND block=? AND id>? ORDER BY id').all(unit,block,h.id));
          if(plan.reason)throw Object.assign(new Error(plan.reason),{status:409});
          applyUndo(next,plan.patch);action={...action,targetAction:JSON.parse(h.action)};break;
        }
        default: throw new Error('Operação inválida');
      }
      const recorded={...action};
      if(action.type==='status')recorded.previousStatus=old.statuses[action.processIds[0]]||'none';
      if(tab) recorded.tabName=old.tabs.find(t=>t.id===action.tabId).name;
      if(action.type==='create')recorded.tabName=next.tabs.at(-1).name;
      if(action.type==='rename')recorded.newTabName=next.tabs.find(t=>t.id===action.tabId).name;
      if(action.processIds){recorded.processNumbers={};for(const id of action.processIds){const n=action.processNumbers?.[id];if(typeof n==='string'&&/^(?:SEI-)?\d{1,12}[./-]\d{1,12}\/\d{4}$/.test(n))recorded.processNumbers[id]=n;}}
      const v=old.version+1;const before=JSON.stringify({tabs:old.tabs,assignments:old.assignments,statuses:old.statuses});const after=JSON.stringify(next);
      db.prepare('INSERT INTO blocks VALUES(?,?,?,?) ON CONFLICT(unit,block) DO UPDATE SET version=excluded.version,state=excluded.state').run(unit,block,v,after);
      db.prepare('INSERT INTO history(unit,block,time,actor,action,before,after,version) VALUES(?,?,?,?,?,?,?,?)').run(unit,block,new Date().toISOString(),JSON.stringify(actor),JSON.stringify(recorded),before,after,v);
      db.exec('COMMIT'); return {version:v,...next};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  return {read,mutate,history:(u,b)=>{const items=db.prepare('SELECT id,time,actor,action,before,after,version FROM history WHERE unit=? AND block=? ORDER BY id DESC LIMIT 100').all(u,b);return items.map((r,index)=>{const action=JSON.parse(r.action);const before=JSON.parse(r.before),after=JSON.parse(r.after);action.tabName??=before.tabs.find(t=>t.id===action.tabId)?.name||(action.type==='create'?after.tabs.at(-1)?.name:undefined);if(action.type==='rename')action.newTabName??=after.tabs.find(t=>t.id===action.tabId)?.name;const plan=undoPlan(r,items.slice(0,index));return {id:r.id,time:r.time,actor:JSON.parse(r.actor),action,version:r.version,undoable:!plan.reason,undoReason:plan.reason};});},close:()=>db.close()};
}
function validName(n){if(typeof n!=='string'||!n.trim()||n.trim().length>80)throw new Error('Nome deve conter 1 a 80 caracteres');return n.trim();}
