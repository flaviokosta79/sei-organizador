import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../server/store.js';
import '../extension/history.js';
test('API antiga sem rótulos: fallback somente quando nome atual é compatível',()=>{
 const assign={version:2,time:'2026-10-01T12:00:00Z',actor:{login:'teste'},action:{type:'assign',tabId:'a',processIds:['10']}};
 const create={version:1,action:{type:'create',name:'Teste'}};
 const state={version:2,tabs:[{id:'a',name:'Teste'}]};
 const resolved=seiResolveHistory([assign,create],state);assert.equal(resolved[0].action.tabName,'Teste');assert.equal(resolved[1].action.tabName,'Teste');
 assert.match(seiHistoryText(resolved[0]),/teste · atribuiu processo\(s\) Identificador interno 10 na pasta Teste/);
 const rename={version:3,action:{type:'rename',tabId:'a',name:'Outra'}};
 assert.equal(seiResolveHistory([rename,assign],{version:3,tabs:[{id:'a',name:'Outra'}]})[1].action.tabName,undefined);
 assert.equal(seiResolveHistory([assign],{version:9,tabs:[{id:'a',name:'Outra'}]})[0].action.tabName,undefined);
});
test('histórico conserva nomes, múltiplos números e recupera operações antigas',()=>{
 const s=createStore(':memory:');const actor={name:'Nome completo privado',login:'usuario'};
 try{let r=s.mutate('1','2',0,actor,{type:'create',name:'Teste'});const tabId=r.tabs[0].id;
 s.mutate('1','2',1,actor,{type:'assign',tabId,processIds:['10','20'],processNumbers:{10:'SEI-123456/123456/2026',20:'SEI-123456/654321/2026'}});
 s.mutate('1','2',2,actor,{type:'rename',tabId,name:'Outra'});
 s.mutate('1','2',3,actor,{type:'unassign',tabId,processIds:['10','20']});
 s.mutate('1','2',4,actor,{type:'delete',tabId});
 const h=s.history('1','2');assert.equal(h[3].action.tabName,'Teste');assert.equal(h[2].action.tabName,'Teste');assert.equal(h[2].action.newTabName,'Outra');assert.equal(h[1].action.tabName,'Outra');
 const text=seiHistoryText(h[3]);assert.match(text,/usuario · atribuiu processo\(s\) SEI-123456\/123456\/2026, SEI-123456\/654321\/2026/);assert.ok(!text.includes(actor.name));assert.ok(!text.includes('unidade'));
 const old={time:h[0].time,actor,action:{type:'unassign',tabName:'Antiga',processIds:['10','20']}};
 assert.match(seiHistoryText(old,{'10':'SEI-123456/123456/2026'}),/retirou processo\(s\) SEI-123456\/123456\/2026, Identificador interno 20 da pasta Antiga/);
 assert.match(seiHistoryText({...old,actor:{name:'Nome'}}),/Usuário não identificado/);
 }finally{s.close();}
});
test('snapshots recuperam rótulo de registros sem tabName',()=>{
 const dir=mkdtempSync(join(tmpdir(),'sei-history-'));const path=join(dir,'db.sqlite');const s=createStore(path);try{const r=s.mutate('1','2',0,{}, {type:'create',name:'Original'});s.mutate('1','2',1,{}, {type:'assign',tabId:r.tabs[0].id,processIds:['10']});const db=new DatabaseSync(path);const record=db.prepare('SELECT id,action FROM history ORDER BY id DESC LIMIT 1').get();const action=JSON.parse(record.action);delete action.tabName;db.prepare('UPDATE history SET action=? WHERE id=?').run(JSON.stringify(action),record.id);db.close();assert.equal(s.history('1','2')[0].action.tabName,'Original');}finally{s.close();rmSync(dir,{recursive:true,force:true});}
});


