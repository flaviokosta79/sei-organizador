// Shared entry generations are independent of manual status/history versions.
export function createAlerts(db,{onSnapshot=()=>{}}={}) {
  db.exec('CREATE TABLE IF NOT EXISTS alert_blocks (unit TEXT, block TEXT, version INTEGER, observed INTEGER, entries TEXT, PRIMARY KEY(unit,block)); CREATE TABLE IF NOT EXISTS process_views (unit TEXT, process TEXT, opened INTEGER, actor TEXT, PRIMARY KEY(unit,process));');
  db.exec('CREATE TABLE IF NOT EXISTS process_block_views (unit TEXT, block TEXT, process TEXT, opened INTEGER, actor TEXT, PRIMARY KEY(unit,block,process));');
  const read=(unit,block)=>{const row=db.prepare('SELECT * FROM alert_blocks WHERE unit=? AND block=?').get(unit,block);return row?{version:row.version,observed:row.observed,entries:JSON.parse(row.entries)}:{version:0,observed:0,entries:null};};
  const save=(unit,block,state)=>db.prepare('INSERT INTO alert_blocks VALUES(?,?,?,?,?) ON CONFLICT(unit,block) DO UPDATE SET version=excluded.version,observed=excluded.observed,entries=excluded.entries').run(unit,block,state.version,state.observed,JSON.stringify(state.entries));
  const transaction=fn=>{db.exec('BEGIN IMMEDIATE');try{const result=fn();db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}};
  function snapshot(unit,block,{version,ids,pendingIds=[]}) {
    if(!Number.isSafeInteger(version)||version<0||!Array.isArray(ids)||ids.length>10000||!ids.every(validId)||new Set(ids).size!==ids.length||!Array.isArray(pendingIds)||pendingIds.length>10000||!pendingIds.every(id=>validId(id)&&ids.includes(id)))throw Error('Lista inválida');
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
          const viewed=db.prepare('SELECT opened FROM process_block_views WHERE unit=? AND block=? AND process=?').get(unit,block,id)||db.prepare('SELECT opened FROM process_views WHERE unit=? AND process=?').get(unit,id);
          entries[id]={token:crypto.randomUUID(),seen:old.entries===null?!initial.has(id):false,baseline:old.entries===null&&!initial.has(id)};
          // Opening before the next complete poll must also acknowledge the detected entry.
          if(viewed&&viewed.opened>=old.observed){entries[id].seen=true;entries[id].baseline=false;}
        }
      }
      const next={version:old.version+1,observed:Date.now(),entries};save(unit,block,next);return next;
    });
  }
  function opened(unit,process,actor,block) {
    if(!validId(process))throw Error('Processo inválido');
    if(block!==undefined&&!validId(block))throw Error('Bloco inválido');
    return transaction(()=>{
      if(block===undefined)db.prepare('INSERT INTO process_views VALUES(?,?,?,?) ON CONFLICT(unit,process) DO UPDATE SET opened=excluded.opened,actor=excluded.actor').run(unit,process,Date.now(),JSON.stringify(actor));
      else db.prepare('INSERT INTO process_block_views VALUES(?,?,?,?,?) ON CONFLICT(unit,block,process) DO UPDATE SET opened=excluded.opened,actor=excluded.actor').run(unit,block,process,Date.now(),JSON.stringify(actor));
      for(const row of db.prepare('SELECT block FROM alert_blocks WHERE unit=?').all(unit)){
        if(block!==undefined&&row.block!==block)continue;
        const state=read(unit,row.block);if(state.entries[process]&&(!state.entries[process].seen||state.entries[process].baseline)){state.entries[process].seen=true;state.entries[process].baseline=false;state.version++;save(unit,row.block,state);}
      }
      return {ok:true};
    });
  }
  return {read,snapshot,opened};
}
const validId=id=>typeof id==='string'&&/^\d{1,30}$/.test(id);
