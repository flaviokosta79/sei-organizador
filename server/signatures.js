// Observations come from the user's SEI session, just like the other shared metadata.
export function createSignatures(db) {
  db.exec(`BEGIN; CREATE TABLE IF NOT EXISTS signature_members (unit TEXT, org TEXT, login TEXT, block TEXT, PRIMARY KEY(unit,org,login));
    CREATE TABLE IF NOT EXISTS signature_groups (unit TEXT, block TEXT, started INTEGER, PRIMARY KEY(unit,block));
    CREATE TABLE IF NOT EXISTS signature_watches (unit TEXT, process TEXT, document TEXT, signature_block TEXT, block TEXT, included_by TEXT, included_at INTEGER, PRIMARY KEY(unit,process,document,signature_block,included_at));
    CREATE TABLE IF NOT EXISTS signature_events (id INTEGER PRIMARY KEY, unit TEXT, block TEXT, process TEXT, document TEXT, number TEXT, signature_block TEXT, included_by TEXT, signer TEXT, signed_at INTEGER, UNIQUE(unit,block,process,document,signer,signed_at));
    CREATE INDEX IF NOT EXISTS signature_event_group ON signature_events(unit,block,id);
    CREATE UNIQUE INDEX IF NOT EXISTS signature_event_once ON signature_events(unit,block,process,document,json_extract(signer,'$.login'),signed_at); COMMIT;`);
  const actor = (a) => {
    if (!a || typeof a.login !== 'string' || !a.login.trim() || a.login.length > 100 || typeof a.org !== 'string' || !a.org || a.org.length > 80) throw Error('Usuário inválido');
    return {login:a.login.trim().toLowerCase(),org:a.org};
  };
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { db.exec('ROLLBACK'); throw e; }
  };
  function sync(unit, block, data) {
    const user=actor(data.actor);
    if (!id(block) || !(data.after === null || Number.isSafeInteger(data.after) && data.after >= 0)) throw Error('Consulta inválida');
    return transaction(() => {
      db.prepare('INSERT OR IGNORE INTO signature_groups VALUES(?,?,?)').run(unit,block,Math.floor(Date.now()/60000)*60000);
      db.prepare('INSERT INTO signature_members VALUES(?,?,?,?) ON CONFLICT(unit,org,login) DO UPDATE SET block=excluded.block').run(unit,user.org,user.login,block);
      const latest=db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM signature_events WHERE unit=? AND block=?').get(unit,block).id;
      const rows=data.after===null?[]:db.prepare('SELECT * FROM signature_events WHERE unit=? AND block=? AND id>? ORDER BY id LIMIT 100').all(unit,block,data.after);
      return {cursor:rows.length?rows.at(-1).id:latest,members:db.prepare('SELECT login FROM signature_members WHERE unit=? AND org=? AND block=?').all(unit,user.org,block).map(r=>r.login),events:rows.map(r=>({id:r.id,process:r.process,document:r.document,number:r.number,signatureBlock:r.signature_block,includedBy:JSON.parse(r.included_by),signer:JSON.parse(r.signer),signedAt:r.signed_at}))};
    });
  }
  function observe(unit, block, data) {
    const user=actor(data.actor), items=data.observations;
    if (!id(block) || !Array.isArray(items) || items.length>200) throw Error('Observações inválidas');
    const time=t=>Number.isSafeInteger(t)&&t>0&&t<=Date.now()+60000;
    const person=p=>p&&typeof p.login==='string'&&!!p.login.trim()&&p.login.length<=100&&typeof p.name==='string'&&p.name.length<=150;
    for(const o of items) if(!id(o.process)||!id(o.document)||!id(o.signatureBlock)||typeof o.number!=='string'||o.number.length>100||!person(o.includedBy)||!time(o.includedAt)||(o.signature&&(!person(o.signature.signer)||!time(o.signature.time)||o.signature.time<o.includedAt))) throw Error('Observação inválida');
    return transaction(()=>{
      const member=db.prepare('SELECT block FROM signature_members WHERE unit=? AND org=? AND login=?').get(unit,user.org,user.login);
      if(member?.block!==block) throw Object.assign(Error('Bloco de trabalho mudou; atualize a consulta.'),{status:409});
      let accepted=0;
      for(const o of items){
        const watch=db.prepare('SELECT * FROM signature_watches WHERE unit=? AND process=? AND document=? AND signature_block=? AND included_at=?').get(unit,o.process,o.document,o.signatureBlock,o.includedAt);
        const origin=db.prepare('SELECT block FROM signature_members WHERE unit=? AND org=? AND login=?').get(unit,user.org,o.includedBy.login.trim().toLowerCase());
        // Once observed, the originating group survives later changes to the includer's preference.
        const group=watch?.block || origin?.block;
        if(!group)continue;
        const includedBy=JSON.stringify({name:o.includedBy.name,login:o.includedBy.login.trim().toLowerCase()});
        db.prepare('INSERT OR IGNORE INTO signature_watches VALUES(?,?,?,?,?,?,?)').run(unit,o.process,o.document,o.signatureBlock,group,includedBy,o.includedAt);
        if(!o.signature)continue;
        const started=db.prepare('SELECT started FROM signature_groups WHERE unit=? AND block=?').get(unit,group)?.started;
        if(!started || o.signature.time<started)continue;
        const signer=JSON.stringify({name:o.signature.signer.name,login:o.signature.signer.login.trim().toLowerCase()});
        accepted+=db.prepare('INSERT OR IGNORE INTO signature_events(unit,block,process,document,number,signature_block,included_by,signer,signed_at) VALUES(?,?,?,?,?,?,?,?,?)').run(unit,group,o.process,o.document,o.number,o.signatureBlock,includedBy,signer,o.signature.time).changes;
      }
      return {accepted};
    });
  }
  return {sync,observe};
}
const id=v=>typeof v==='string'&&/^\d{1,30}$/.test(v);
