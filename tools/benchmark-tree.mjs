import fs from 'node:fs';
import {runInNewContext} from 'node:vm';
import {performance} from 'node:perf_hooks';

// Synthetic data only. Run against the current reader or an older local source file.
const source=process.argv[2]||'extension/document-data.js';
const context={};runInNewContext(fs.readFileSync(source,'utf8'),context);
const result=[];
for(const count of [500,3000,7000]){
 let input='new infraArvoreNo("PROCESSO","1",null,"#","ifrVisualizacao","SEI-1/1/2026","Tipo","svg/p.svg");\n';
 for(let i=2;i<count+2;i++)input+=`new infraArvoreNo("DOCUMENTO","${i}","1","#","ifrConteudoVisualizacao","Doc ${i}","Doc","documento_interno.svg",true,true,"n",null,"n","${i}");\nnew infraArvoreAcao("UNIDADE_GERADORA","UG${i}","${i}","#",null,"Unidade",null,true,"SEPM/5°CPA");\n`;
 const start=performance.now(),tree=context.seiDocumentData.parseTree(input),parsed=performance.now();
 const pending=tree.pending('SEPM/5°CPA');for(const p of pending)tree.document(p.id);
 result.push({documents:count,parseMs:parsed-start,lookupMs:performance.now()-parsed,totalMs:performance.now()-start});
}
console.log(JSON.stringify(result,null,2));
