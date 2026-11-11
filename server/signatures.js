// Observations come from the user's SEI session, just like the other shared metadata.
export function createSignatures(db) {
  db.exec(`BEGIN; CREATE TABLE IF NOT EXISTS signature_members (unit TEXT, org TEXT, login TEXT, block TEXT, PRIMARY KEY(unit,org,login));
    CREATE TABLE IF NOT EXISTS signature_groups (unit TEXT, block TEXT, started INTEGER, PRIMARY KEY(unit,block));
    CREATE TABLE IF NOT EXISTS signature_watches (unit TEXT, process TEXT, document TEXT, signature_block TEXT, block TEXT, included_by TEXT, included_at INTEGER, PRIMARY KEY(unit,process,document,signature_block,included_at));
    CREATE TABLE IF NOT EXISTS signature_events (id INTEGER PRIMARY KEY, unit TEXT, block TEXT, process TEXT, document TEXT, number TEXT, signature_block TEXT, included_by TEXT, signer TEXT, signed_at INTEGER, UNIQUE(unit,block,process,document,signer,signed_at));
    CREATE INDEX IF NOT EXISTS signature_event_group ON signature_events(unit,block,id);
    CREATE UNIQUE INDEX IF NOT EXISTS signature_event_once ON signature_events(unit,block,process,document,json_extract(signer,'$.login'),signed_at);
    CREATE TABLE IF NOT EXISTS signature_acks (unit TEXT, block TEXT, acked INTEGER, PRIMARY KEY(unit,block)); COMMIT;`);
  const q={
    group:db.prepare('INSERT OR IGNORE INTO signature_groups VALUES(?,?,?)'),
    member:db.prepare('INSERT INTO signature_members VALUES(?,?,?,?) ON CONFLICT(unit,org,login) DO UPDATE SET block=excluded.block WHERE block IS NOT excluded.block'),
    latest:db.prepare('SELECT COALESCE(MAX(id),0) AS id FROM signature_events WHERE unit=? AND block=?'),
    events:db.prepare('SELECT * FROM signature_events WHERE unit=? AND block=? AND id>? ORDER BY id LIMIT 100'),
    members:db.prepare('SELECT login FROM signature_members WHERE unit=? AND org=? AND block=?'),
    memberBlock:db.prepare('SELECT block FROM signature_members WHERE unit=? AND org=? AND login=?'),
    watch:db.prepare('SELECT * FROM signature_watches WHERE unit=? AND process=? AND document=? AND signature_block=? AND included_at=?'),
    addWatch:db.prepare('INSERT OR IGNORE INTO signature_watches VALUES(?,?,?,?,?,?,?)'),
    started:db.prepare('SELECT started FROM signature_groups WHERE unit=? AND block=?'),
    acked:db.prepare('SELECT acked FROM signature_acks WHERE unit=? AND block=?'),
    ack:db.prepare('INSERT INTO signature_acks VALUES(?,?,?) ON CONFLICT(unit,block) DO UPDATE SET acked=excluded.acked WHERE excluded.acked>acked'),
    addEvent:db.prepare('INSERT OR IGNORE INTO signature_events(unit,block,process,document,number,signature_block,included_by,signer,signed_at) VALUES(?,?,?,?,?,?,?,?,?)'),
  };
  const actor = (a) => {
    if (!a || typeof a.login !== 'string' || !a.login.trim() || a.login.length > 100 || typeof a.org !== 'string' || !a.org || a.org.length > 80) throw Error('Usuário inválido');
    return {login:a.login.trim().toLowerCase(),org:a.org};
  };
  const transaction = (fn) => {
    db.exec('BEGIN IMMEDIATE');
    try { const result=fn(); db.exec('COMMIT'); return result; } catch(e) { rollback(db); throw e; }
  };
  function sync(unit, block, data) {
    const user=actor(data.actor);
    if (!id(block) || !(data.after === null || Number.isSafeInteger(data.after) && data.after >= 0)) throw Error('Consulta inválida');
    return transaction(() => {
      q.group.run(unit,block,Math.floor(Date.now()/60000)*60000);
      q.member.run(unit,user.org,user.login,block);
      const latest=q.latest.get(unit,block).id;
      const rows=data.after===null?[]:q.events.all(unit,block,data.after);
      // acked: the group's alerts up to this event were marked as seen by one of its members.
      return {cursor:rows.length?rows.at(-1).id:latest,acked:q.acked.get(unit,block)?.acked||0,members:q.members.all(unit,user.org,block).map(r=>r.login),events:rows.map(r=>({id:r.id,process:r.process,document:r.document,number:r.number,signatureBlock:r.signature_block,includedBy:JSON.parse(r.included_by),signer:JSON.parse(r.signer),signedAt:r.signed_at}))};
    });
  }
  function observe(unit, block, data) {
    const user=actor(data.actor), items=data.observations;
    if (!id(block) || !Array.isArray(items) || items.length>200) throw Error('Observações inválidas');
    const time=t=>Number.isSafeInteger(t)&&t>0&&t<=Date.now()+60000;
    const person=p=>p&&typeof p.login==='string'&&!!p.login.trim()&&p.login.length<=100&&typeof p.name==='string'&&p.name.length<=150;
    for(const o of items) if(!id(o.process)||!id(o.document)||!id(o.signatureBlock)||typeof o.number!=='string'||o.number.length>100||!person(o.includedBy)||!time(o.includedAt)||(o.signature&&(!person(o.signature.signer)||!time(o.signature.time)||o.signature.time<o.includedAt))) throw Error('Observação inválida');
    return transaction(()=>{
      const member=q.memberBlock.get(unit,user.org,user.login);
      if(member?.block!==block) throw Object.assign(Error('Bloco de trabalho mudou; atualize a consulta.'),{status:409});
      let accepted=0;
      for(const o of items){
        const watch=q.watch.get(unit,o.process,o.document,o.signatureBlock,o.includedAt);
        const origin=q.memberBlock.get(unit,user.org,o.includedBy.login.trim().toLowerCase());
        // Once observed, the originating group survives later changes to the includer's preference.
        const group=watch?.block || origin?.block;
        if(!group)continue;
        const includedBy=JSON.stringify({name:o.includedBy.name,login:o.includedBy.login.trim().toLowerCase()});
        q.addWatch.run(unit,o.process,o.document,o.signatureBlock,group,includedBy,o.includedAt);
        if(!o.signature)continue;
        const started=q.started.get(unit,group)?.started;
        if(!started || o.signature.time<started)continue;
        const signer=JSON.stringify({name:o.signature.signer.name,login:o.signature.signer.login.trim().toLowerCase()});
        accepted+=q.addEvent.run(unit,group,o.process,o.document,o.number,o.signatureBlock,includedBy,signer,o.signature.time).changes;
      }
      return {accepted};
    });
  }
  // Marking as seen is shared: it clears the alerts for every member of the group.
  function ack(unit, block, data) {
    const user=actor(data.actor);
    if (!id(block) || !Number.isSafeInteger(data.upTo) || data.upTo < 0) throw Error('Visto inválido');
    return transaction(() => {
      if(q.memberBlock.get(unit,user.org,user.login)?.block!==block) throw Object.assign(Error('Bloco de trabalho mudou; atualize a consulta.'),{status:409});
      q.ack.run(unit,block,Math.min(data.upTo,q.latest.get(unit,block).id));
      return {acked:q.acked.get(unit,block)?.acked||0};
    });
  }
  return {sync,observe,ack};
}
const id=v=>typeof v==='string'&&/^\d{1,30}$/.test(v);
// Errors such as SQLITE_FULL end the transaction by themselves: a failing ROLLBACK must not hide the cause.
function rollback(db){try{db.exec('ROLLBACK');}catch{}}
