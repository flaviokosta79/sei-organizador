import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
import {createAuth} from '../server/auth.js';

test('acesso na rede exige configuração; tokens individuais podem ser revogados',()=>{
 assert.throws(()=>createAuth({host:'0.0.0.0'}));
 const publicAuth=createAuth({host:'0.0.0.0',publicAccess:true});assert.equal(publicAuth(undefined),true);
 const dir=mkdtempSync(join(tmpdir(),'sei-auth-'));
 const path=join(dir,'hashes');const a=randomBytes(32).toString('base64url'),b=randomBytes(32).toString('base64url');
 const hash=t=>createHash('sha256').update(t).digest('hex');
 try{
  writeFileSync(path,`${hash(a)}\n${hash(b)}\n`);
  let auth=createAuth({file:path,host:'0.0.0.0'});
  assert.equal(auth(`Bearer ${a}`),true);assert.equal(auth(`Bearer ${b}`),true);
  assert.equal(auth(undefined),false);assert.equal(auth('Bearer inválido'),false);
  writeFileSync(path,hash(b));auth=createAuth({file:path,host:'0.0.0.0'});
  assert.equal(auth(`Bearer ${a}`),false);assert.equal(auth(`Bearer ${b}`),true);
  writeFileSync(path,'');assert.throws(()=>createAuth({file:path}));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
