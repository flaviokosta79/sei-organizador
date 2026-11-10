import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {randomBytes,createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import net from 'node:net';
import '../extension/history.js';
test('API HTTP: saúde, unidade restrita, criação e conflito',async()=>{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const dir=mkdtempSync(join(tmpdir(),'sei-http-'));const token=randomBytes(32).toString('base64url');const hashesFile=join(dir,'hashes');writeFileSync(hashesFile,createHash('sha256').update(token).digest('hex'));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,HOST:'127.0.0.1',SEI_API_TOKEN_HASHES_FILE:hashesFile,SEI_UNIT_ID:'1',PORT:String(port),DATA_FILE:join(dir,'db.sqlite')},stdio:['ignore','pipe','pipe']});
 const apiFetch=(url,options={})=>fetch(url,{...options,headers:{...options.headers,Authorization:`Bearer ${token}`}});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Serviço não iniciou')),15000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Serviço encerrou'));});});
 const base=`http://127.0.0.1:${port}`;const health=await fetch(base+'/healthz');assert.equal(health.status,200);assert.match(health.headers.get('server-timing'),/^app;dur=\d+\.\d{2}$/);
 assert.equal((await fetch(base+'/v1/units/1/blocks/2')).status,401);
 assert.equal((await fetch(base+'/v1/units/1/blocks/2',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 assert.equal((await fetch(base+'/v1/units/1/blocks/2',{headers:{Authorization:`Bearer ${randomBytes(32).toString('base64url')}`}})).status,401);
 assert.equal((await apiFetch(base+'/v1/units/9/blocks/2')).status,403);
 const post=()=>apiFetch(base+'/v1/units/1/blocks/2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:0,actor:{name:'Teste'},action:{type:'create',name:'Assunto'}})});
 const created=await post();assert.equal(created.status,200);const state=await created.json();assert.equal((await post()).status,409);
 const tabId=state.tabs[0].id;
 const operate=async(version,action)=>{const response=await apiFetch(base+'/v1/units/1/blocks/2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,actor:{login:'teste'},action})});assert.equal(response.status,200);};
 await operate(1,{type:'assign',tabId,processIds:['10'],processNumbers:{10:'SEI-123456/123456/2026'}});
 await operate(2,{type:'rename',tabId,name:'Nova'});
 await operate(3,{type:'unassign',tabId,processIds:['10']});
 await operate(4,{type:'delete',tabId});
 const h=await (await apiFetch(base+'/v1/units/1/blocks/2/history')).json();assert.equal(h[0].actor.verified,false);
 assert.match(seiHistoryText(h[3]),/na pasta Assunto/);assert.match(seiHistoryText(h[3]),/SEI-123456\/123456\/2026/);assert.match(seiHistoryText(h[1]),/da pasta Nova/);assert.equal(h[2].action.tabName,'Assunto');
 await operate(5,{type:'status',status:'attention',processIds:['10'],processNumbers:{10:'SEI-123456/123456/2026'}});
 const updated=await(await apiFetch(base+'/v1/units/1/blocks/2')).json();assert.equal(updated.statuses[10],'attention');
 const history=await(await apiFetch(base+'/v1/units/1/blocks/2/history')).json();assert.match(seiHistoryText(history[0]),/Sem status → Atenção/);
 const rejected=await apiFetch(base+'/v1/units/1/blocks/2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:6,actor:{login:'outro'},action:{type:'undo',historyId:history[0].id}})});
 assert.equal(rejected.status,403);assert.equal((await(await apiFetch(base+'/v1/units/1/blocks/2')).json()).version,6);
 await operate(6,{type:'undo',historyId:history[0].id});assert.deepEqual((await(await apiFetch(base+'/v1/units/1/blocks/2')).json()).statuses,{});
 const shared=base+'/v1/units/1/blocks/2/alerts';
 const sharedPost=body=>apiFetch(shared,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await fetch(shared)).status,401);
 assert.equal((await apiFetch(base+'/v1/units/2/blocks/2/alerts')).status,403);
 assert.equal((await apiFetch(base+'/v1/units/2/processes/10/opened',{method:'POST'})).status,403);
 assert.equal((await(await apiFetch(shared)).json()).entries,null);
 assert.equal((await sharedPost({version:0,ids:['10'],pendingIds:['10']})).status,200);
 assert.equal((await sharedPost({version:0,ids:[]})).status,409);
 assert.equal((await sharedPost({version:1,ids:['x']})).status,400);
 const open=await apiFetch(base+'/v1/units/1/processes/10/opened',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({actor:{login:'colega'}})});assert.equal(open.status,200);
 assert.equal((await(await apiFetch(shared)).json()).entries['10'].seen,true);
 assert.equal((await(await apiFetch(base+'/v1/units/1/blocks/2')).json()).version,7);
 const editing=base+'/v1/units/1/processes/10/editing';
 const editor={session:'11111111-1111-4111-8111-111111111111',document:'11',number:'555',actor:{name:'Colega',login:'colega',org:'SEPM'},activityAgeMs:1000};
 const editingPost=body=>apiFetch(editing,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 const query=()=>apiFetch(base+'/v1/units/1/editing/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({processIds:['10']})});
 assert.equal((await fetch(editing)).status,401);assert.equal((await apiFetch(base+'/v1/units/2/processes/10/editing',{method:'POST'})).status,403);
 assert.equal((await editingPost({...editor,activityAgeMs:-1})).status,400);assert.equal((await editingPost(editor)).status,200);
 let editors=await(await query()).json();assert.equal(editors.entries.length,1);assert.equal(editors.entries[0].actor.login,'colega');assert.equal(editors.entries[0].number,'555');
 assert.equal((await editingPost({...editor,stop:true})).status,200);editors=await(await query()).json();assert.equal(editors.entries.length,0);
 const signatureBase=base+'/v1/units/1/blocks/2/signatures/';
 const signaturePost=(action,data)=>apiFetch(signatureBase+action,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await fetch(signatureBase+'sync')).status,401);assert.equal((await apiFetch(base+'/v1/units/2/blocks/2/signatures/sync',{method:'POST'})).status,403);assert.equal((await apiFetch(signatureBase+'sync')).status,405);
 const signatureActor={login:'teste',org:'SEPM'};assert.equal((await signaturePost('sync',{actor:signatureActor,after:null})).status,200);
 assert.equal((await signaturePost('sync',{actor:signatureActor,after:-1})).status,400);
 const observations=[{process:'10',document:'11',number:'555',signatureBlock:'99',includedAt:Date.now()-60000,includedBy:{login:'teste',name:'Pessoa'},signature:{time:Date.now(),signer:{login:'chefe',name:'Nome do Chefe'}}}];
 const observed=await signaturePost('observe',{actor:signatureActor,observations});assert.equal(observed.status,200);assert.equal((await observed.json()).accepted,1);
 const signatures=await(await signaturePost('sync',{actor:signatureActor,after:0})).json();assert.equal(signatures.events[0].signer.name,'Nome do Chefe');assert.equal(signatures.events[0].document,'11');
 const receiptUrl=base+'/v1/units/1/secretariat/receipts';
 const receiptPost=data=>apiFetch(receiptUrl,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 assert.equal((await fetch(receiptUrl)).status,401);assert.equal((await apiFetch(base+'/v1/units/2/secretariat/receipts')).status,403);assert.equal((await apiFetch(receiptUrl,{method:'DELETE'})).status,405);
 assert.equal((await(await apiFetch(receiptUrl)).json()).initialized,false);
 assert.equal((await receiptPost({block:'1343',actor:signatureActor,version:0,complete:true,items:[]})).status,403);
 assert.equal((await receiptPost({block:'1396',actor:signatureActor,version:0,complete:false,items:[]})).status,400);
 const receiptBody={block:'1396',actor:signatureActor,version:0,complete:true,items:[{id:'10',number:'SEI-350024/000010/2026',pending:true}]};
 const firstReceipt=await receiptPost(receiptBody);assert.equal(firstReceipt.status,200);const receiptState=await firstReceipt.json();assert.equal(receiptState.pending[0].baseline,true);
 assert.equal((await receiptPost(receiptBody)).status,409);
 assert.equal((await receiptPost({...receiptBody,version:receiptState.version,items:[{...receiptBody.items[0],pending:false}]})).status,200);
 assert.equal((await(await apiFetch(receiptUrl)).json()).pending.length,0);
 }finally{const done=new Promise(r=>child.once('exit',r));child.kill();await done;rmSync(dir,{recursive:true,force:true});}
});
test('API HTTP: caractere acentuado dividido entre pacotes do corpo é preservado',async()=>{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const dir=mkdtempSync(join(tmpdir(),'sei-http-'));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,HOST:'127.0.0.1',SEI_UNIT_ID:'1',PORT:String(port),DATA_FILE:join(dir,'db.sqlite')},stdio:['ignore','pipe','pipe']});
 try{await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Serviço não iniciou')),15000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Serviço encerrou'));});});
 const payload=Buffer.from(JSON.stringify({version:0,actor:{name:'Teste'},action:{type:'create',name:'Ação'}}));
 const cut=payload.indexOf(Buffer.from('ç'))+1;// splits the two UTF-8 bytes of "ç"
 const {request}=await import('node:http');
 const state=await new Promise((resolve,reject)=>{
  const req=request({host:'127.0.0.1',port,path:'/v1/units/1/blocks/2',method:'POST',headers:{'Content-Type':'application/json','Content-Length':payload.length}},res=>{let text='';res.setEncoding('utf8');res.on('data',c=>text+=c);res.on('end',()=>resolve(JSON.parse(text)));});
  req.on('error',reject);req.write(payload.subarray(0,cut));setTimeout(()=>req.end(payload.subarray(cut)),100);
 });
 assert.equal(state.tabs[0].name,'Ação');
 const batch=(unit,body)=>fetch(`http://127.0.0.1:${port}/v1/units/${unit}/processes/opened`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await batch('1',{processes:['10','20'],block:'2',actor:{login:'a',org:'SEPM'}})).status,200);
 assert.equal((await batch('9',{processes:['10']})).status,403);
 assert.equal((await batch('1',{processes:[]})).status,400);
 }finally{const done=new Promise(r=>child.once('exit',r));child.kill();await done;rmSync(dir,{recursive:true,force:true});}
});

test('API pública (modo de produção): limites, JSON inválido, mensagens úteis e cabeçalhos',async()=>{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const dir=mkdtempSync(join(tmpdir(),'sei-public-'));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,HOST:'127.0.0.1',SEI_ALLOW_PUBLIC_ACCESS:'true',SEI_API_TOKEN_HASHES_FILE:'',SEI_UNIT_ID:'1',PORT:String(port),DATA_FILE:join(dir,'db.sqlite')},stdio:['ignore','pipe','pipe']});
 try{
  await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Serviço não iniciou')),15000);child.stdout.once('data',()=>{clearTimeout(timer);resolve();});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Serviço encerrou'));});});
  const base=`http://127.0.0.1:${port}/v1/units/1`;
  const post=(path,body,type='application/json')=>fetch(base+path,{method:'POST',headers:{'Content-Type':type},body:typeof body==='string'?body:JSON.stringify(body)});
  const read=await fetch(base+'/blocks/2');assert.equal(read.status,200);assert.equal(read.headers.get('x-content-type-options'),'nosniff');
  assert.equal((await post('/blocks/2','{"version":',)).status,400,'JSON malformado');
  assert.equal((await post('/blocks/2','x','text/plain')).status,415);
  assert.equal((await post('/blocks/2',{version:0,actor:{},action:{type:'create',name:'x'.repeat(70000)}})).status,413);
  assert.equal((await fetch(base+'/blocks/'+'9'.repeat(31))).status,404,'id de bloco longo demais');
  const tooLong=await post('/blocks/2',{version:0,actor:{login:'a'},action:{type:'create',name:'x'.repeat(81)}});
  assert.equal(tooLong.status,400);assert.match((await tooLong.json()).error,/1 a 80 caracteres/);
  const unknown=await post('/blocks/2',{version:0,actor:{login:'a'},action:{type:'rename',tabId:'nada',name:'Novo'}});
  assert.match((await unknown.json()).error,/não existe mais/);
  const generic=await post('/blocks/2',{version:0,actor:{login:'a'},action:{type:'inexistente'}});
  assert.equal((await generic.json()).error,'Não foi possível aplicar a alteração. Verifique os dados.');
  // Without a configured contact the privacy policy is not published.
  assert.equal((await fetch(`http://127.0.0.1:${port}/privacidade`)).status,404);
 }finally{const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;rmSync(dir,{recursive:true,force:true});}
});

test('API pública: banco no teto de tamanho responde 507 nas gravações e continua lendo',async()=>{
 const probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
 const dir=mkdtempSync(join(tmpdir(),'sei-full-'));
 const child=spawn(process.execPath,['server/index.js'],{env:{...process.env,HOST:'127.0.0.1',SEI_ALLOW_PUBLIC_ACCESS:'true',SEI_API_TOKEN_HASHES_FILE:'',SEI_UNIT_ID:'1',SEI_MAX_DB_MB:'1',SEI_PRIVACY_CONTACT:'Fulano <contato@exemplo.test>',PORT:String(port),DATA_FILE:join(dir,'db.sqlite')},stdio:['ignore','pipe','pipe']});
 try{
  const started=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Serviço não iniciou')),15000);child.stdout.once('data',data=>{clearTimeout(timer);resolve(String(data));});child.once('exit',()=>{clearTimeout(timer);reject(new Error('Serviço encerrou'));});});
  assert.match(started,/banco com \d+\.\d MB de 1 MB/);
  const base=`http://127.0.0.1:${port}/v1/units/1`;
  const post=(path,body)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const created=await post('/blocks/2',{version:0,actor:{login:'a',org:'SEPM'},action:{type:'create',name:'Assunto'}});assert.equal(created.status,200);
  let n=0,full;
  for(let r=0;r<100&&!full;r++){const response=await post('/processes/opened',{actor:{login:'x',org:'SEPM'},block:'9',processes:Array.from({length:1000},()=>String(++n))});if(response.status!==200)full=response;}
  assert.equal(full?.status,507);assert.match((await full.json()).error,/Armazenamento do serviço cheio/);
  const state=await(await fetch(base+'/blocks/2')).json();assert.equal(state.tabs[0].name,'Assunto');
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status,200);
  // Privacy policy page: HTML, with the configured contact escaped and no placeholder left.
  const policy=await fetch(`http://127.0.0.1:${port}/privacidade`);assert.equal(policy.status,200);assert.match(policy.headers.get('content-type'),/^text\/html/);
  const html=await policy.text();assert.match(html,/Política de privacidade do SEI Organizador/);assert.match(html,/Fulano &#60;contato@exemplo\.test&#62;/);assert.doesNotMatch(html,/\{\{/);
 }finally{const exited=new Promise(r=>child.once('exit',r));child.kill();await exited;rmSync(dir,{recursive:true,force:true});}
});
