import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {JSDOM} from 'jsdom';

const code=readFileSync(new URL('../extension/document-data.js',import.meta.url),'utf8');
const reader=()=>{const context={};runInNewContext(code,context);return context.seiDocumentData;};
const call=(name,args)=>`new ${name}(${args.map(value=>JSON.stringify(value)).join(',')});\n`;
const node=(id,type='DOCUMENTO')=>call('infraArvoreNo',[type,id,'1','#','ifrConteudoVisualizacao','Doc '+id,'Tipo','documento_interno.svg',true,true,'n',null,'n',null,'n',id]);

test('árvore grande preserva autoria, assinaturas e todas as pendências com consultas por documento',()=>{
 const D=reader();let source=node('1','PROCESSO');
 for(let index=0;index<1000;index++){
  const id=String(index+2);source+=node(id);
  source+=call('infraArvoreAcao',['UNIDADE_GERADORA','UG'+id,id,'#',null,'Unidade',null,true,index%2?'SEPM/OUTRA':'SEPM/5°CPA']);
  if(index%4===0)source+=call('infraArvoreAcao',['ASSINATURA','A'+id,id,'#',null,'Assinado por:\nPessoa\nCargo\nSEPM/5°CPA']);
 }
 const tree=D.parseTree(source),pending=tree.pending('SEPM/5ºCPA');assert.equal(pending.length,250);
 for(const document of pending){const info=tree.document(document.id);assert.equal(info.unit,'SEPM/5°CPA');assert.equal(info.signers.length,0);}
 assert.deepEqual([...tree.document('2').signers],['Pessoa (Cargo)']);assert.equal(tree.document('inexistente'),null);
 assert.equal(tree.pending('SEPM/OUTRA').length,500);
});

test('árvore é reutilizada entre contextos de documento e invalidada quando o script nativo muda',async()=>{
 const dom=new JSDOM('<iframe id="ifrArvore"></iframe>');try{
  const treeDoc=dom.window.document.querySelector('iframe').contentDocument;
  treeDoc.defaultView.seiDocumentData=reader();
  const anchor=treeDoc.createElement('a');anchor.setAttribute('onclick',"consultarAndamento('controlador.php?acao=procedimento_consultar_historico&id_procedimento=1');");treeDoc.body.append(anchor);
  const script=treeDoc.createElement('script');script.type='text/plain';script.textContent=node('1','PROCESSO')+node('2');treeDoc.body.append(script);
  const first=await reader().loadTree(dom.window.document);const second=await reader().loadTree(dom.window.document);
  assert.equal(first.tree,second.tree);
  treeDoc.body.append(treeDoc.createElement('div'));assert.equal((await reader().loadTree(dom.window.document)).tree,first.tree);
  script.textContent+=node('3');const updated=await reader().loadTree(dom.window.document);
  assert.notEqual(updated.tree,first.tree);assert.ok(updated.tree.document('3'));assert.equal(first.tree.document('3'),null);
 }finally{dom.window.close();}
});
