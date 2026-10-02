import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

export function createAuth({file,host='127.0.0.1',publicAccess=false}={}) {
  if(publicAccess)return ()=>true;
  if(!file) {
    if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('Configure SEI_API_TOKEN_HASHES_FILE antes de disponibilizar o serviço na rede');
    return ()=>true;
  }
  const hashes=readFileSync(file,'utf8').trim().split(/\s+/);
  if(!hashes.length||!hashes.every(h=>/^[a-f0-9]{64}$/.test(h)))throw new Error('Arquivo de hashes de acesso inválido');
  const allowed=new Set(hashes);
  return header=>{
    const match=typeof header==='string'&&header.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/);
    return !!match&&allowed.has(createHash('sha256').update(match[1]).digest('hex'));
  };
}
