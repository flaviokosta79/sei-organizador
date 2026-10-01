globalThis.seiStatusLabels={none:'Sem status',attention:'Atenção',follow:'Acompanhar',urgent:'Urgente',archive:'Para arquivar'};
globalThis.seiResolveHistory=(items,state)=>items.map((h,index)=>{
 const action={...h.action};
 if(!action.tabName&&action.type==='create')action.tabName=action.name;
 if(!action.tabName&&action.tabId&&items[0]?.version===state.version){
   const newer=items.slice(0,index);
   // Current labels are historical only when no later operation could change them.
   if(!newer.some(x=>x.action.type==='undo'||(['rename','delete'].includes(x.action.type)&&x.action.tabId===action.tabId)))
     action.tabName=state.tabs.find(t=>t.id===action.tabId)?.name;
 }
 return {...h,action};
});
globalThis.seiHistoryText=(h,numbers={})=>{
 const a=h.action||{},folder=a.tabName||'Aba desconhecida';
 const processes=(a.processIds||[]).map(id=>a.processNumbers?.[id]||numbers[id]||`Identificador interno ${id}`).join(', ');
 const descriptions={create:`criou a pasta ${folder}`,rename:`renomeou a pasta ${folder} para ${a.newTabName||a.name||'Nome desconhecido'}`,delete:`excluiu a pasta ${folder}`,assign:`atribuiu processo(s) ${processes} na pasta ${folder}`,unassign:`retirou processo(s) ${processes} da pasta ${folder}`,undo:'desfez a última alteração'};
 descriptions.status=`alterou status do processo ${processes}: ${seiStatusLabels[a.previousStatus]||'Status desconhecido'} → ${seiStatusLabels[a.status]||'Status desconhecido'}`;
 return `${new Date(h.time).toLocaleString('pt-BR')} · ${h.actor?.login||'Usuário não identificado'} · ${descriptions[a.type]||'Alteração desconhecida'}`;
};
