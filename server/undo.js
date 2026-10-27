const key=parts=>JSON.stringify(parts);
const normalized=value=>typeof value==='string'?value.trim().toLowerCase():'';
export function sameActor(a,b){return !!normalized(a?.login)&&normalized(a?.login)===normalized(b?.login)&&normalized(a?.org)===normalized(b?.org);}
function changes(before,after){
  const result=new Map();
  const oldTabs=new Map(before.tabs.map(t=>[t.id,t])),newTabs=new Map(after.tabs.map(t=>[t.id,t]));
  for(const id of new Set([...oldTabs.keys(),...newTabs.keys()])){
    const a=oldTabs.get(id),b=newTabs.get(id);
    if(!a||!b)result.set(key(['tab',id]),{before:a,after:b,index:before.tabs.findIndex(t=>t.id===id)});
    else if(a.name!==b.name)result.set(key(['name',id]),{before:a.name,after:b.name});
  }
  for(const process of new Set([...Object.keys(before.assignments),...Object.keys(after.assignments)])){
    const a=new Set(before.assignments[process]||[]),b=new Set(after.assignments[process]||[]);
    for(const id of new Set([...a,...b]))if(a.has(id)!==b.has(id))result.set(key(['assignment',id,process]),{before:a.has(id),after:b.has(id)});
  }
  for(const process of new Set([...Object.keys(before.statuses||{}),...Object.keys(after.statuses||{})])){
    const a=before.statuses?.[process]||'none',b=after.statuses?.[process]||'none';
    if(a!==b)result.set(key(['status',process]),{before:a,after:b});
  }
  return result;
}
// History rows are reused across many plans, so parse and diff each row only once.
const cache=new WeakMap();
function analyze(record){
  let info=cache.get(record);
  if(!info){info={action:JSON.parse(record.action),changes:changes(JSON.parse(record.before),JSON.parse(record.after))};cache.set(record,info);}
  return info;
}
export function undoPlan(record,later){
  const {action,changes:patch}=analyze(record);
  if(action.type==='undo')return {reason:'Este registro já é uma operação de desfazer.'};
  if(action.type==='departed')return {reason:'Limpeza automática de processo retirado do bloco; não pode ser desfeita.'};
  if(!patch.size)return {reason:'Esta operação não alterou os dados.'};
  // Same key always conflicts; a tab conflicts with any non-status change that references it.
  const byTab=new Map();
  for(const original of patch.keys()){const [kind,id]=JSON.parse(original);if(kind==='status')continue;const entry=byTab.get(id)||{tab:false};entry.tab||=kind==='tab';byTab.set(id,entry);}
  for(const h of later){
    const {action:laterAction,changes:laterChanges}=analyze(h);
    if(laterAction.type==='undo'&&laterAction.historyId===record.id)return {reason:'Esta alteração já foi desfeita.'};
    for(const changed of laterChanges.keys()){
      const [kind,id]=JSON.parse(changed),related=kind==='status'?null:byTab.get(id);
      if(patch.has(changed)||(related&&(kind==='tab'||related.tab)))
        return {reason:'Uma alteração posterior depende destes dados. Ela será preservada; este registro não pode ser desfeito.'};
    }
  }
  return {patch};
}
// Keeps full tab lists (order is needed to restore a tab) but only the processes this operation touched.
export function snapshots(before,after){
  const assignments=[...new Set([...Object.keys(before.assignments),...Object.keys(after.assignments)])].filter(id=>{const a=new Set(before.assignments[id]||[]),b=new Set(after.assignments[id]||[]);return a.size!==b.size||[...a].some(t=>!b.has(t));});
  const statuses=[...new Set([...Object.keys(before.statuses||{}),...Object.keys(after.statuses||{})])].filter(id=>(before.statuses?.[id]||'none')!==(after.statuses?.[id]||'none'));
  const pick=(source={},keys)=>Object.fromEntries(keys.filter(k=>source[k]!==undefined).map(k=>[k,source[k]]));
  const compact=state=>({tabs:state.tabs,assignments:pick(state.assignments,assignments),statuses:pick(state.statuses,statuses)});
  return {before:compact(before),after:compact(after)};
}
export function applyUndo(next,patch){
  for(const [encoded,value] of patch){
    const [kind,id,process]=JSON.parse(encoded);
    if(kind==='tab'){
      next.tabs=next.tabs.filter(t=>t.id!==id);
      if(value.before)next.tabs.splice(Math.max(0,Math.min(value.index,next.tabs.length)),0,value.before);
    }else if(kind==='name')next.tabs.find(t=>t.id===id).name=value.before;
    else if(kind==='assignment'){
      const links=new Set(next.assignments[process]||[]);value.before?links.add(id):links.delete(id);
      if(links.size)next.assignments[process]=[...links];else delete next.assignments[process];
    }else if(kind==='status'){if(value.before==='none')delete next.statuses[id];else next.statuses[id]=value.before;}
  }
  if(next.tabs.length>100)throw Object.assign(new Error('Não é possível restaurar a pasta: limite de abas atingido.'),{status:409});
}
