import assert from 'node:assert/strict';
let input='';for await(const chunk of process.stdin)input+=chunk;
const {token,mode}=JSON.parse(input);
const unit=process.env.SEI_UNIT_ID;
const publicMode=process.env.SEI_ALLOW_PUBLIC_ACCESS==='true';
const path=`http://127.0.0.1:8787/v1/units/${unit}/blocks/0`;
const api=(url,options={})=>fetch(url,{...options,headers:{...options.headers,...(publicMode?{}:{Authorization:`Bearer ${token}`})}});
if(mode==='write'){
 assert.equal((await fetch('http://127.0.0.1:8787/healthz')).status,200);
 assert.equal((await fetch(path)).status,publicMode?200:401);
 assert.equal((await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,publicMode?400:401);
 assert.equal((await fetch(path,{headers:{Authorization:`Bearer ${'x'.repeat(43)}`}})).status,publicMode?200:401);
 assert.equal((await api(`http://127.0.0.1:8787/v1/units/${BigInt(unit)+1n}/blocks/0`)).status,403);
 assert.equal((await(await api(path)).json()).version,0,'Bloco de teste deve estar vazio; preservar dados existentes');
 const created=await api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:0,actor:{login:'validacao-tecnica'},action:{type:'create',name:'Teste técnico de persistência'}})});
 assert.equal(created.status,200);assert.equal((await created.json()).version,1);
 console.log(publicMode?'Saude, acesso/gravacao sem token, dados validados e unidade restrita: OK':'Saude, rejeicao sem token/errado, unidade restrita e gravacao autorizada: OK');
}else if(mode==='read'){
 const state=await(await api(path)).json();assert.equal(state.version,1);assert.equal(state.tabs[0].name,'Teste técnico de persistência');
 console.log('Persistencia apos recriar tarefa Swarm: OK');
}else if(mode==='cleanup'){
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(process.env.DATA_FILE);
 db.exec('BEGIN IMMEDIATE');
 try{db.prepare('DELETE FROM history WHERE unit=? AND block=?').run(unit,'0');db.prepare('DELETE FROM blocks WHERE unit=? AND block=?').run(unit,'0');db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}finally{db.close();}
 console.log('Dados tecnicos do bloco 0 removidos; blocos reais preservados');
}else{throw new Error('Modo inválido');}
