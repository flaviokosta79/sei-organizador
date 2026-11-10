import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const read=name=>readFileSync(new URL('../extension/'+name,import.meta.url),'utf8');
const releases='https://github.com/flaviokosta79/sei-organizador/releases/tag/';

function worker({installed='0.22.4',answer,manifest={},config=read('config.js')}={}){
 let listener,offset=0;const requests=[],local={};
 const Clock=class extends Date{static now(){return Date.now()+offset;}};
 const chrome={runtime:{getManifest:()=>({version:installed,...manifest}),onMessage:{addListener:fn=>listener=fn}},storage:{local:{get:async key=>({[key]:local[key]&&structuredClone(local[key])}),set:async value=>Object.assign(local,structuredClone(value))}}};
 const context={chrome,URL,AbortSignal,Date:Clock,fetch:async(url,options)=>{requests.push({url,options});return answer();}};
 runInNewContext(config+';'+read('update-check.js'),context);
 const ask=(url='https://sei.rj.gov.br/sei/controlador.php?acao=procedimento_controlar',frameId=0)=>new Promise(r=>listener({type:'update:status'},{tab:{url},frameId},r));
 return {ask,requests,local,later(ms){offset+=ms;}};
}
const ok=(tag,url=releases+tag)=>()=>({ok:true,json:async()=>({tag_name:tag,html_url:url})});

test('aviso aparece só para versão mais nova e a consulta ao GitHub não leva dados do usuário',async()=>{
 const w=worker({answer:ok('v0.22.10')});
 const r=(await w.ask()).data;assert.equal(r.available,true);assert.equal(r.latest,'0.22.10');assert.equal(r.current,'0.22.4');assert.equal(r.url,releases+'v0.22.10');
 const req=w.requests[0];assert.equal(req.url,'https://api.github.com/repos/flaviokosta79/sei-organizador/releases/latest');assert.equal(req.options.credentials,'omit');assert.equal(req.options.referrerPolicy,'no-referrer');assert.equal(req.options.body,undefined);
 for(const [tag,installed] of [['v0.22.4','0.22.4'],['v0.22.3','0.22.4'],['v0.9.9','0.22.4']]){const same=worker({installed,answer:ok(tag)});const v=(await same.ask()).data;assert.equal(v.available,false);assert.equal(v.url,null);}
 const minor=worker({installed:'0.22.9',answer:ok('v0.23.0')});assert.equal((await minor.ask()).data.available,true);
});

test('consulta é reaproveitada por 6 h, falha tenta de novo em 1 h e mantém a última versão conhecida',async()=>{
 let fail=false;const w=worker({answer:()=>fail?{ok:false,status:403,json:async()=>({})}:ok('v0.23.0')()});
 await w.ask();await w.ask();assert.equal(w.requests.length,1);
 w.later(5*3600e3);await w.ask();assert.equal(w.requests.length,1);
 w.later(3600e3+1);fail=true;const kept=(await w.ask()).data;assert.equal(w.requests.length,2);assert.equal(kept.latest,'0.23.0');assert.equal(kept.available,true);
 w.later(30*60e3);await w.ask();assert.equal(w.requests.length,2);
 w.later(31*60e3);fail=false;await w.ask();assert.equal(w.requests.length,3);
});

test('release com endereço ou versão inválidos é ignorada e só telas do SEI podem perguntar',async()=>{
 const evil=worker({answer:ok('v9.9.9','https://evil.test/release')});assert.equal((await evil.ask()).data.available,false);
 const bad=worker({answer:ok('latest')});assert.equal((await bad.ask()).data.available,false);
 const w=worker({answer:ok('v0.23.0')});
 assert.match((await w.ask('https://evil.test/')).error,/Origem/);assert.match((await w.ask(undefined,3)).error,/Origem/);assert.equal(w.requests.length,0);
});

test('manifesto autoriza só a API do GitHub além do SEI e do serviço; o rodapé mostra o aviso',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 assert.deepEqual(manifest.host_permissions,['https://sei.rj.gov.br/*','https://ext.5cpa.com.br/*','https://api.github.com/*']);
 assert.match(read('background.js'),/importScripts\('update-check\.js'\)/);
 const monitor=read('monitor.js');assert.match(monitor,/Nova versão \$\{upgrade\.latest\}/);assert.match(monitor,/sei-organizador e siga o LEIA-ME/);
});

test('instalada pela Chrome Web Store, a extensão não consulta o GitHub nem mostra aviso de versão',async()=>{
 // The store adds update_url to the manifest; the store package also ships config.js without the feed.
 const store=worker({answer:ok('v9.9.9'),manifest:{update_url:'https://clients2.google.com/service/update2/crx'}});
 let r=(await store.ask()).data;assert.equal(r.available,false);assert.equal(r.url,null);assert.equal(r.current,'0.22.4');assert.equal(store.requests.length,0);
 const noFeed=worker({answer:ok('v9.9.9'),config:read('config.js').replace(/^.*(?:updateFeed|releasesPage).*$/gm,'')});
 r=(await noFeed.ask()).data;assert.equal(r.available,false);assert.equal(noFeed.requests.length,0);
});

test('manifesto traz os ícones exigidos pela loja e os arquivos existem',()=>{
 const manifest=JSON.parse(read('manifest.json'));
 for(const size of ['16','32','48','128']){const png=readFileSync(new URL('../extension/'+manifest.icons[size],import.meta.url));assert.equal(png.subarray(1,4).toString(),'PNG');assert.equal(png.readUInt32BE(16),Number(size));assert.equal(png.readUInt32BE(20),Number(size));}
});
