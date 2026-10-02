import {execFileSync} from 'node:child_process';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const image=process.argv[2]||'sei-organizador:kmv2-validation';
const publicMode=process.argv[3]==='public';
const suffix=randomBytes(6).toString('hex');const name=`sei-smoke-${suffix}`,volume=`sei-smoke-data-${suffix}`;
const dir=mkdtempSync(join(tmpdir(),'sei-container-smoke-'));const hashes=join(dir,'hashes');
const token=randomBytes(32).toString('base64url');writeFileSync(hashes,createHash('sha256').update(token).digest('hex'));
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:60000}).trim();
let exists=false,volumeExists=false;
try{
 docker('volume','create',volume);volumeExists=true;
 const access=publicMode?['-e','SEI_ALLOW_PUBLIC_ACCESS=true']:['--mount',`type=bind,src=${hashes},dst=/run/secrets/hashes,readonly`,'-e','SEI_API_TOKEN_HASHES_FILE=/run/secrets/hashes'];
 const start=()=>{docker('run','-d','--name',name,'--cpus','0.5','--memory','512m','-p','127.0.0.1::8787','--mount',`type=volume,src=${volume},dst=/data`,'-e','SEI_UNIT_ID=1',...access,image);exists=true;return `http://${docker('port',name,'8787/tcp').split('\n')[0]}`;};
 const wait=async base=>{for(let i=0;i<60;i++){try{if((await fetch(base+'/healthz')).ok)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('Container nao iniciou');};
 let base=start();await wait(base);
 const api=(path,options={})=>fetch(base+path,{...options,headers:{...options.headers,...(publicMode?{}:{Authorization:`Bearer ${token}`})}});
 const path='/v1/units/1/blocks/2';
 assert.equal((await fetch(base+path)).status,publicMode?200:401);
 assert.equal((await fetch(base+path,{headers:{Authorization:`Bearer ${'x'.repeat(43)}`}})).status,publicMode?200:401);
 assert.equal((await api('/v1/units/9/blocks/2')).status,403);
 const response=await api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version:0,actor:{login:'smoke'},action:{type:'create',name:'Persistencia'}})});
 assert.equal(response.status,200);assert.equal((await response.json()).version,1);
 assert.equal(docker('exec',name,'id','-u'),'1000');
 const files=docker('exec',name,'ls','-A','/app').split(/\s+/);assert.deepEqual(files.sort(),['package.json','server']);
 console.log(`Saude, ${publicMode?'acesso sem token':'autenticacao'}, unidade, gravacao e usuario nao root: OK`);
 console.log('Medicao pontual apos smoke, sem carga real:',docker('stats','--no-stream','--format','{{.CPUPerc}} CPU; {{.MemUsage}} memoria',name));
 docker('stop','-t','10',name);docker('rm',name);exists=false;
 base=start();await wait(base);const state=await(await api(path)).json();assert.equal(state.version,1);assert.equal(state.tabs[0].name,'Persistencia');
 console.log('Persistencia apos recriar container com mesmo volume: OK');
}finally{
 if(exists)docker('rm','-f',name);
 if(volumeExists)docker('volume','rm',volume);
 rmSync(dir,{recursive:true,force:true});
}
