import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=f=>readFileSync(new URL('../extension/'+f,import.meta.url),'utf8');

function storage(initial={}){
 const map=new Map(Object.entries(initial));
 return {map,get length(){return map.size;},key:i=>[...map.keys()][i]??null,getItem:k=>map.has(k)?map.get(k):null,setItem:(k,v)=>map.set(k,String(v)),removeItem:k=>map.delete(k)};
}
function load(sessionStorage){
 let now=1_000_000;
 const context={sessionStorage,Date:class extends Date{static now(){return now;}},SEI_ORGANIZADOR_CONFIG:{unitId:'1'},JSON};
 runInNewContext(read('history-pages.js'),context);
 return {H:context.seiFullHistory,advance:ms=>now+=ms};
}
const actor={org:'SEPM',login:'teste'};
const page=n=>({complete:true,partial:false,rows:[{time:new Date(0).toISOString(),text:'x'.repeat(n)}]});
const histories=s=>[...s.map.keys()].filter(k=>k.startsWith('seiOrganizador:fullHistory:v1:'));

test('andamentos guardados na sessão vencem em 60 s, ficam no máximo 3 e não acumulam versões antigas',()=>{
 const legacy='seiOrganizador:fullHistory:v1:1:SEPM:teste:7';
 const s=storage({[legacy]:JSON.stringify({time:0,page:page(10)}),'outro:sei':'preservado'});
 const {H,advance}=load(s);
 H.write('10',actor,page(10));
 assert.deepEqual(histories(s),[H.key('10',actor)],'entrada de versão anterior removida');
 assert.equal(s.getItem('outro:sei'),'preservado','dados do próprio SEI intocados');
 for(const id of ['11','12','13']){advance(1000);H.write(id,actor,page(10));}
 assert.equal(histories(s).length,3);assert.equal(H.read('10',actor),null);assert.ok(H.read('13',actor));
 advance(61000);H.write('14',actor,page(10));
 assert.deepEqual(histories(s),[H.key('14',actor)],'vencidos removidos');
 H.write('14',actor,page(20));assert.equal(histories(s).length,1,'regravar o mesmo processo não duplica');
 assert.equal(H.read('14',actor).rows[0].text.length,20);
});
