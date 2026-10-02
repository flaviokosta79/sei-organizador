import https from 'node:https';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';

const config=JSON.parse(readFileSync(process.argv[2],'utf8'));
const url=new URL(config.serviceUrl);const address=process.argv[3];
const publicMode=process.argv[4]==='public';
const request=(path,headers={},method='GET',body)=>new Promise((resolve,reject)=>{
 const req=https.request({hostname:url.hostname,port:443,path,method,headers,
  ...(address?{lookup:(_name,opts,done)=>opts.all?done(null,[{address,family:4}]):done(null,address,4)}:{}),
  timeout:15000},res=>{let body='';res.on('data',c=>body+=c);res.on('end',()=>resolve({status:res.statusCode,body,certExpiry:res.socket?.getPeerCertificate()?.valid_to}));});
 req.on('timeout',()=>req.destroy(new Error('HTTPS timeout')));req.on('error',reject);req.end(body);
});
const health=await request('/healthz');assert.equal(health.status,200);assert.equal(JSON.parse(health.body).ok,true);
const path=`/v1/units/${config.unitId}/blocks/0`;
assert.equal((await request(path)).status,publicMode?200:401);
assert.equal((await request(path,{Authorization:`Bearer ${'x'.repeat(43)}`})).status,publicMode?200:401);
const authorized=await request(path,publicMode?{}:{Authorization:`Bearer ${config.apiToken}`});assert.equal(authorized.status,200);
assert.equal(JSON.parse(authorized.body).version,0,'Dados tecnicos do bloco 0 devem ter sido removidos');
assert.equal((await request(path,{'Content-Type':'application/json'},'POST','{}')).status,publicMode?400:401);
assert.equal((await request(path,{'Content-Type':'application/json',...(publicMode?{}:{Authorization:`Bearer ${config.apiToken}`})},'POST','{"version":-1}')).status,400);
console.log(publicMode?'HTTPS com certificado confiavel e acesso sem token: OK; saude/GET 200; dados invalidos rejeitados 400':'HTTPS com certificado confiavel: OK; saude 200; sem token/errado 401; GET autorizado 200; POST autorizado alcanca validacao 400');
if(address)console.log('Teste com resolucao explicita do IP; DNS do cliente ainda precisa ser confirmado');
