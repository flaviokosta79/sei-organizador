import {randomBytes,createHash} from 'node:crypto';
import {writeFileSync,appendFileSync,mkdirSync} from 'node:fs';
import {resolve,dirname} from 'node:path';

const [tokenOutput,hashesOutput]=process.argv.slice(2);
if(!tokenOutput||!hashesOutput)throw new Error('Uso: node tools/create-api-token.mjs CAMINHO_TOKEN CAMINHO_HASHES');
const tokenPath=resolve(tokenOutput),hashesPath=resolve(hashesOutput);
if(tokenPath===hashesPath)throw new Error('Use arquivos diferentes para token e hashes');
const token=randomBytes(32).toString('base64url');
mkdirSync(dirname(tokenPath),{recursive:true});mkdirSync(dirname(hashesPath),{recursive:true});
writeFileSync(tokenPath,token+'\n',{flag:'wx',mode:0o600});
appendFileSync(hashesPath,createHash('sha256').update(token).digest('hex')+'\n',{mode:0o600});
console.log('Token individual salvo; hash acrescentado. Nenhum valor foi exibido.');
