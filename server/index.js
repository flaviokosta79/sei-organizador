import http from 'node:http';
import {createStore} from './store.js';
import {createAuth} from './auth.js';
const unit=process.env.SEI_UNIT_ID;
if(!unit||!/^\d+$/.test(unit))throw new Error('Configure SEI_UNIT_ID com a unidade autorizada');
const host=process.env.HOST||'127.0.0.1';
const authorized=createAuth({file:process.env.SEI_API_TOKEN_HASHES_FILE,host,publicAccess:process.env.SEI_ALLOW_PUBLIC_ACCESS==='true'});
const store=createStore(process.env.DATA_FILE||'./data/organizador.sqlite');
// Buffers are joined before decoding, so multibyte characters split across chunks stay intact.
async function readJson(req,limit){
  if(!req.headers['content-type']?.startsWith('application/json'))return {status:415,error:'Use JSON'};
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>limit)return {status:413,error:'Requisição grande demais'};chunks.push(chunk);}
  return {data:JSON.parse(Buffer.concat(chunks,size).toString('utf8'))};
}
const server=http.createServer(async(req,res)=>{
  const started=performance.now();
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
  const send=(status,data)=>{const body=JSON.stringify(data);res.setHeader('Server-Timing',`app;dur=${(performance.now()-started).toFixed(2)}`);res.writeHead(status);res.end(body);};
  if(req.url==='/healthz'&&req.method==='GET')return send(200,{ok:true});
  if(!authorized(req.headers.authorization)){res.setHeader('WWW-Authenticate','Bearer');return send(401,{error:'Token de acesso ausente ou inválido'});}
  try{
    const url=new URL(req.url,'http://localhost');
    const receipts=url.pathname.match(/^\/v1\/units\/(\d+)\/secretariat\/receipts$/);
    if(receipts){
      if(receipts[1]!==unit)return send(403,{error:'Unidade não permitida'});
      if(req.method==='GET')return send(200,store.receipts.read(unit));
      if(req.method!=='POST')return send(405,{error:'Método inválido'});
      const body=await readJson(req,2097152);if(body.status)return send(body.status,{error:body.error});
      return send(200,store.receipts.snapshot(unit,body.data));
    }
    const signatures=url.pathname.match(/^\/v1\/units\/(\d+)\/blocks\/(\d{1,30})\/signatures\/(sync|observe)$/);
    if(signatures){
      if(signatures[1]!==unit)return send(403,{error:'Unidade não permitida'});
      if(req.method!=='POST')return send(405,{error:'Método inválido'});
      const body=await readJson(req,262144);if(body.status)return send(body.status,{error:body.error});
      return send(200,store.signatures[signatures[3]](unit,signatures[2],body.data));
    }
    const editing=url.pathname.match(/^\/v1\/units\/(\d+)\/(?:editing\/query|processes\/(\d{1,30})\/editing)$/);
    if(editing){
      if(editing[1]!==unit)return send(403,{error:'Unidade não permitida'});
      if(req.method!=='POST')return send(405,{error:'Método inválido'});
      const body=await readJson(req,65536);if(body.status)return send(body.status,{error:body.error});
      const data=body.data;return send(200,editing[2]?store.editing.update(unit,editing[2],data):store.editing.query(unit,data.processIds,data.block));
    }
    const openedBatch=url.pathname.match(/^\/v1\/units\/(\d+)\/processes\/opened$/);
    if(openedBatch){
      if(openedBatch[1]!==unit)return send(403,{error:'Unidade não permitida'});
      if(req.method!=='POST')return send(405,{error:'Método inválido'});
      const body=await readJson(req,131072);if(body.status)return send(body.status,{error:body.error});
      const data=body.data;
      const a=data.actor||{};const actor={login:typeof a.login==='string'?a.login.slice(0,100):'',org:typeof a.org==='string'?a.org.slice(0,80):'',verified:false};
      return send(200,store.alerts.openedMany(unit,data.processes,actor,data.block));
    }
    const shared=url.pathname.match(/^\/v1\/units\/(\d+)\/(?:blocks\/(\d{1,30})\/alerts|processes\/(\d{1,30})\/opened)$/);
    if(shared){
      if(shared[1]!==unit)return send(403,{error:'Unidade não permitida'});
      if(req.method==='GET'&&shared[2])return send(200,store.alerts.read(unit,shared[2]));
      if(req.method!=='POST')return send(405,{error:'Método inválido'});
      const body=await readJson(req,524288);if(body.status)return send(body.status,{error:body.error});
      const data=body.data;
      const a=data.actor||{};const actor={login:typeof a.login==='string'?a.login.slice(0,100):'',org:typeof a.org==='string'?a.org.slice(0,80):'',verified:false};
      if(shared[2])store.admit(unit,shared[2]);
      return send(200,shared[2]?store.alerts.snapshot(unit,shared[2],data):store.alerts.opened(unit,shared[3],actor,data.block));
    }
    const match=url.pathname.match(/^\/v1\/units\/(\d+)\/blocks\/(\d{1,30})(\/history)?$/);
    if(!match)return send(404,{error:'Rota inexistente'});if(match[1]!==unit)return send(403,{error:'Unidade não permitida'});
    if(req.method==='GET')return send(200,match[3]?store.history(match[1],match[2]):store.read(match[1],match[2]));
    if(req.method!=='POST'||match[3])return send(405,{error:'Método inválido'});
    const body=await readJson(req,65536);if(body.status)return send(body.status,{error:body.error});
    const data=body.data;if(!Number.isSafeInteger(data.version)||data.version<0)throw new Error('Versão inválida');
    const a=data.actor||{};const actor={name:typeof a.name==='string'?a.name.slice(0,150):'Usuário não identificado',login:typeof a.login==='string'?a.login.slice(0,100):'',org:typeof a.org==='string'?a.org.slice(0,80):'',verified:false};
    const action=data.action||{};const clean={type:action.type};for(const k of ['tabId','name','processIds','processNumbers','status','historyId'])if(action[k]!==undefined)clean[k]=action[k];
    store.admit(unit,match[2]);
    return send(200,store.mutate(match[1],match[2],data.version,actor,clean));
  }catch(e){
    // Database failures are server faults: log them and do not blame the request data.
    if(typeof e?.code==='string'&&e.code.startsWith('ERR_SQLITE')){console.error(req.method,req.url,e);return send(500,{error:'Falha interna ao gravar os dados. Tente novamente.'});}
    // Only errors raised with a status carry a message meant for the user; others stay generic.
    send(e.status||400,{error:e.status&&e.message?e.message:'Não foi possível aplicar a alteração. Verifique os dados.'});
  }
});
// Retention runs at startup and then once a day; a failure is logged and retried on the next run.
const maintain=()=>{try{const {removed}=store.maintain();if(removed)console.log('Retenção: registros antigos removidos',removed);}catch(e){console.error('Retenção falhou',e);}};
maintain();setInterval(maintain,86400000).unref();
server.requestTimeout=15000;server.keepAliveTimeout=95000;server.headersTimeout=96000;server.listen(Number(process.env.PORT||8787),host,()=>console.log('SEI Organizador iniciado'));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{server.close(()=>{store.close();process.exit(0);});server.closeIdleConnections();});
