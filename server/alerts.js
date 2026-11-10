// Shared entry generations are independent of manual status/history versions.
export function createAlerts(db,{onSnapshot=()=>{}}={}) {
  db.exec('CREATE TABLE IF NOT EXISTS alert_blocks (unit TEXT, block TEXT, version INTEGER, observed INTEGER, entries TEXT, PRIMARY KEY(unit,block)); CREATE TABLE IF NOT EXISTS process_views (unit TEXT, process TEXT, opened INTEGER, actor TEXT, PRIMARY KEY(unit,process));');
  db.exec('CREATE TABLE IF NOT EXISTS process_block_views (unit TEXT, block TEXT, process TEXT, opened INTEGER, actor TEXT, PRIMARY KEY(unit,block,process));');
  const q={
    read:db.prepare('SELECT * FROM alert_blocks WHERE unit=? AND block=?'),
    save:db.prepare('INSERT INTO alert_blocks VALUES(?,?,?,?,?) ON CONFLICT(unit,block) DO UPDATE SET version=excluded.version,observed=excluded.observed,entries=excluded.entries'),
    blockView:db.prepare('SELECT opened FROM process_block_views WHERE unit=? AND block=? AND process=?'),
    unitView:db.prepare('SELECT opened FROM process_views WHERE unit=? AND process=?'),
    openUnit:db.prepare('INSERT INTO process_views VALUES(?,?,?,?) ON CONFLICT(unit,process) DO UPDATE SET opened=excluded.opened,actor=excluded.actor'),
    openBlock:db.prepare('INSERT INTO process_block_views VALUES(?,?,?,?,?) ON CONFLICT(unit,block,process) DO UPDATE SET opened=excluded.opened,actor=excluded.actor'),
    blocks:db.prepare('SELECT block FROM alert_blocks WHERE unit=?'),
  };
  const read=(unit,block)=>{const row=q.read.get(unit,block);return row?{version:row.version,observed:row.observed,entries:JSON.parse(row.entries)}:{version:0,observed:0,entries:null};};
  const save=(unit,block,state)=>q.save.run(unit,block,state.version,state.observed,JSON.stringify(state.entries));
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){rollback(db);throw e;}};
  function snapshot(unit,block,{version,ids,pendingIds=[]}) {
    if(!Number.isSafeInteger(version)||version<0||!Array.isArray(ids)||ids.length>10000||!ids.every(validId)||!Array.isArray(pendingIds)||pendingIds.length>10000)throw Error('Lista inválida');
    const present=new Set(ids);
    if(present.size!==ids.length||!pendingIds.every(id=>validId(id)&&present.has(id)))throw Error('Lista inválida');
    return transaction(()=>{
      const old=read(unit,block);if(old.version!==version)throw Object.assign(Error('Consulta substituída; tente no próximo ciclo.'),{status:409});
      onSnapshot(unit,block,ids);
      const entries={};const initial=new Set(pendingIds);
      for(const id of ids){
        if(old.entries?.[id]){
          entries[id]=old.entries[id];
          // A silent first baseline is not an acknowledgement by a colleague.
          if(entries[id].baseline&&initial.has(id)){entries[id].seen=false;entries[id].baseline=false;}
        }
        else {
          const viewed=q.blockView.get(unit,block,id)||q.unitView.get(unit,id);
          entries[id]={token:crypto.randomUUID(),seen:old.entries===null?!initial.has(id):false,baseline:old.entries===null&&!initial.has(id)};
          // Opening before the next complete poll must also acknowledge the detected entry.
          if(viewed&&viewed.opened>=old.observed){entries[id].seen=true;entries[id].baseline=false;}
        }
      }
      const next={version:old.version+1,observed:Date.now(),entries};save(unit,block,next);return next;
    });
  }
  // Several processes (e.g. "mark block as seen") are recorded in one transaction, reading each block once.
  function openedMany(unit,processes,actor,block) {
    if(!Array.isArray(processes)||!processes.length||processes.length>1000||!processes.every(validId)||new Set(processes).size!==processes.length)throw Error('Processos inválidos');
    if(block!==undefined&&!validId(block))throw Error('Bloco inválido');
    return transaction(()=>{
      const now=Date.now(),who=JSON.stringify(actor);
      for(const process of processes){
        if(block===undefined)q.openUnit.run(unit,process,now,who);
        else q.openBlock.run(unit,block,process,now,who);
      }
      // A block-scoped opening only touches that block; avoid parsing every other block's entries.
      const targets=block===undefined?q.blocks.all(unit).map(r=>r.block):[block];
      for(const target of targets){
        const state=read(unit,target);let changed=false;
        for(const process of processes){
          const entry=state.entries?.[process];
          if(entry&&(!entry.seen||entry.baseline)){entry.seen=true;entry.baseline=false;changed=true;}
        }
        if(changed){state.version++;save(unit,target,state);}
      }
      return {ok:true};
    });
  }
  function opened(unit,process,actor,block) {
    if(!validId(process))throw Error('Processo inválido');
    return openedMany(unit,[process],actor,block);
  }
  return {read,snapshot,opened,openedMany};
}
const validId=id=>typeof id==='string'&&/^\d{1,30}$/.test(id);
// Errors such as SQLITE_FULL end the transaction by themselves: a failing ROLLBACK must not hide the cause.
function rollback(db){try{db.exec('ROLLBACK');}catch{}}
