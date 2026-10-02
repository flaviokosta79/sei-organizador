import http from 'node:http';
import {createStore} from './store.js';
import {createAuth} from './auth.js';
const unit=process.env.SEI_UNIT_ID;
if(!unit||!/^\d+$/.test(unit))throw new Error('Configure SEI_UNIT_ID com a unidade autorizada');
const host=process.env.HOST||'127.0.0.1';
const authorized=createAuth({file:process.env.SEI_API_TOKEN_HASHES_FILE,host,publicAccess:process.env.SEI_ALLOW_PUBLIC_ACCESS==='true'});
const store=createStore(process.env.DATA_FILE||'./data/organizador.sqlite');
const server=http.createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
  const send=(status,data)=>{res.writeHead(status);res.end(JSON.stringify(data));};
  if(req.url==='/healthz'&&req.method==='GET')return send(200,{ok:true});
  if(!authorized(req.headers.authorization)){res.setHeader('WWW-Authenticate','Bearer');return send(401,{error:'Token de acesso ausente ou inválido'});}
  try{
    const url=new URL(req.url,'http://localhost');const match=url.pathname.match(/^\/v1\/units\/(\d+)\/blocks\/(\d+)(\/history)?$/);
    if(!match)return send(404,{error:'Rota inexistente'});if(match[1]!==unit)return send(403,{error:'Unidade não permitida'});
    if(req.method==='GET')return send(200,match[3]?store.history(match[1],match[2]):store.read(match[1],match[2]));
    if(req.method!=='POST'||match[3])return send(405,{error:'Método inválido'});
    if(!req.headers['content-type']?.startsWith('application/json'))return send(415,{error:'Use JSON'});
    let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536)return send(413,{error:'Requisição grande demais'});}
    const data=JSON.parse(body);if(!Number.isSafeInteger(data.version)||data.version<0)throw new Error('Versão inválida');
    const a=data.actor||{};const actor={name:typeof a.name==='string'?a.name.slice(0,150):'Usuário não identificado',login:typeof a.login==='string'?a.login.slice(0,100):'',org:typeof a.org==='string'?a.org.slice(0,80):'',verified:false};
    const action=data.action||{};const clean={type:action.type};for(const k of ['tabId','name','processIds','processNumbers','status','historyId'])if(action[k]!==undefined)clean[k]=action[k];
    return send(200,store.mutate(match[1],match[2],data.version,actor,clean));
  }catch(e){send(e.status||400,{error:[403,409].includes(e.status)?e.message:'Não foi possível aplicar a alteração. Verifique os dados.'});}
});
server.requestTimeout=15000;server.listen(Number(process.env.PORT||8787),host,()=>console.log('SEI Organizador iniciado'));
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>server.close(()=>{store.close();process.exit(0);}));


