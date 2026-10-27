import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const helper=runInNewContext(readFileSync(new URL('../extension/monitor-sign.js',import.meta.url),'utf8')+';seiSignAlerts');
const items=[{id:'100',number:'SEI-100'},{id:'200',number:'SEI-200'}];
const snapshot=(version,statuses,history=[])=>({version,statuses,history:Math.max(0,...history.map(h=>h.version))<version?[{id:version,version,action:{type:'assign'}},...history]:history});
const event=(id,process='100',previousStatus='none')=>({id,version:id,action:{type:'status',status:'sign',previousStatus,processIds:[process]}});
const plain=x=>JSON.parse(JSON.stringify(x));

test('assinatura inicia sem som e alerta só nova mudança para chefe elegível',()=>{
 const record={};assert.equal(helper.update(record,snapshot(1,{'100':'sign'},[event(1)]),items,true).length,0);
 assert.equal(helper.update(record,snapshot(2,{'100':'sign','200':'sign'},[event(2,'200'),event(1)]),items,false).length,0);
 assert.equal(record.signPending.length,0);
 assert.equal(helper.update(record,snapshot(2,{'100':'sign','200':'sign'},[event(2,'200'),event(1)]),items,true).length,0);
 helper.update(record,snapshot(3,{'100':'sign','200':'urgent'},[event(2,'200'),event(1)]),items,true);
 assert.deepEqual(plain(helper.update(record,snapshot(4,{'100':'sign','200':'sign'},[event(4,'200'),event(2,'200'),event(1)]),items,true)),[items[1]]);
 assert.equal(helper.update(record,snapshot(4,{'100':'sign','200':'sign'},[event(4,'200'),event(2,'200'),event(1)]),items,true).length,0);
});

test('assinatura considera histórico entre consultas, não repete status idêntico e remove pendência resolvida',()=>{
 const record={};helper.update(record,snapshot(1,{'100':'sign'},[event(1)]),items,true);
 assert.equal(helper.update(record,snapshot(2,{'100':'sign'},[event(2,'100','sign'),event(1)]),items,true).length,0);
 assert.equal(helper.update(record,snapshot(4,{'100':'sign'},[event(4),event(2,'100','sign'),event(1)]),items,true).length,1);
 assert.equal(record.signPending.length,1);
 helper.update(record,snapshot(5,{'100':'archive'},[event(4)]),items,true);assert.equal(record.signPending.length,0);
 assert.equal(helper.update(record,snapshot(6,{'200':'sign'},[]),items,true).length,1);
 helper.update(record,snapshot(6,{'200':'sign'},[]),items,false);assert.equal(record.signPending.length,0);
});

test('histórico concorrente ou resposta antiga não altera referência de assinatura',()=>{
 const record={};helper.update(record,snapshot(4,{}),items,true);const previous=JSON.stringify(record);
 assert.throws(()=>helper.update(record,snapshot(4,{'100':'sign'},[event(5)]),items,true),/mudaram/);
 assert.throws(()=>helper.update(record,snapshot(3,{'100':'sign'},[]),items,true),/desatualizada/);
 assert.equal(JSON.stringify(record),previous);
});

test('inserção de processo com status Assinar antigo não é tratada como mudança de status',()=>{
 const record={};helper.update(record,snapshot(1,{'100':'sign'},[event(1)]),[items[0]],true);
 assert.equal(helper.update(record,snapshot(1,{'100':'sign','200':'sign'},[event(1)]),items,true).length,0);
});

test('lote Assinar alerta apenas processos que mudaram de status',()=>{
 const record={};helper.update(record,snapshot(1,{'100':'sign'}),items,true);
 const batch={id:2,version:2,action:{type:'status',status:'sign',processIds:['100','200'],previousStatuses:{'100':'sign','200':'urgent'}}};
 assert.deepEqual(plain(helper.update(record,snapshot(2,{'100':'sign','200':'sign'},[batch]),items,true)),[items[1]]);
});
