const validId=value=>typeof value==='string'&&/^\d{1,30}$/.test(value);
const validSession=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export function createEditing(db) {
  db.exec('CREATE TABLE IF NOT EXISTS editing_presence (unit TEXT, session TEXT, process TEXT, document TEXT, number TEXT, actor TEXT, updated INTEGER, activity INTEGER, expires INTEGER, PRIMARY KEY(unit,session)); CREATE INDEX IF NOT EXISTS editing_process ON editing_presence(unit,process,expires); CREATE INDEX IF NOT EXISTS editing_expiry ON editing_presence(expires);');
  db.exec('CREATE TABLE IF NOT EXISTS editing_scopes (unit TEXT, session TEXT, block TEXT, PRIMARY KEY(unit,session)); CREATE INDEX IF NOT EXISTS editing_scope_block ON editing_scopes(unit,block);');
  const prune=()=>{db.prepare('DELETE FROM editing_presence WHERE expires<=?').run(Date.now());db.exec('DELETE FROM editing_scopes WHERE NOT EXISTS (SELECT 1 FROM editing_presence p WHERE p.unit=editing_scopes.unit AND p.session=editing_scopes.session)');};
  function update(unit,process,data) {
    const {session,document,number='',actor,activityAgeMs=null,stop=false,block=''}=data;
    if(block!==''&&!validId(block))throw Error('Bloco inválido');
    if(!validId(process)||!validId(document)||!validSession(session)||typeof stop!=='boolean'||typeof number!=='string'||(number!==''&&!validId(number))||!actor||typeof actor.login!=='string'||!actor.login.trim()||actor.login.length>100||typeof actor.org!=='string'||!actor.org||actor.org.length>80||typeof actor.name!=='string'||actor.name.length>150||(activityAgeMs!==null&&(!Number.isSafeInteger(activityAgeMs)||activityAgeMs<0||activityAgeMs>60000)))throw Error('Presença inválida');
    prune();
    if(stop){const removed=db.prepare('DELETE FROM editing_presence WHERE unit=? AND session=? AND process=? AND document=?').run(unit,session,process,document);if(removed.changes)db.prepare('DELETE FROM editing_scopes WHERE unit=? AND session=?').run(unit,session);return {ok:true};}
    const now=Date.now();
    if(!db.prepare('SELECT 1 FROM editing_presence WHERE unit=? AND session=?').get(unit,session)&&db.prepare('SELECT count(*) AS n FROM editing_presence WHERE unit=?').get(unit).n>=1000)throw Object.assign(Error('Limite de editores ativos atingido'),{status:429});
    const clean={login:actor.login.trim().toLowerCase(),name:actor.name,org:actor.org,verified:false};
    db.prepare('INSERT INTO editing_presence VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(unit,session) DO UPDATE SET process=excluded.process,document=excluded.document,number=excluded.number,actor=excluded.actor,updated=excluded.updated,activity=excluded.activity,expires=excluded.expires').run(unit,session,process,document,number,JSON.stringify(clean),now,activityAgeMs===null?null:now-activityAgeMs,now+90000);
    db.prepare('INSERT INTO editing_scopes VALUES(?,?,?) ON CONFLICT(unit,session) DO UPDATE SET block=excluded.block').run(unit,session,block);
    return {ok:true,expiresAt:now+90000};
  }
  function query(unit,processIds,block) {
    if(block!==undefined&&!validId(block))throw Error('Bloco inválido');
    if(!Array.isArray(processIds)||!processIds.length||processIds.length>1000||!processIds.every(validId)||new Set(processIds).size!==processIds.length)throw Error('Processos inválidos');
    prune();const now=Date.now();
    const rows=db.prepare(`SELECT p.process,p.document,p.number,p.actor,p.updated,p.activity,p.expires FROM editing_presence p LEFT JOIN editing_scopes s ON p.unit=s.unit AND p.session=s.session WHERE p.unit=? AND p.process IN (${processIds.map(()=>'?').join(',')}) AND p.expires>? ${block===undefined?'':'AND s.block=?'} ORDER BY p.updated DESC`).all(unit,...processIds,now,...(block===undefined?[]:[block]));
    // Several windows of the same person/document are one visible presence.
    const merged=new Map();
    for(const row of rows){const actor=JSON.parse(row.actor),key=JSON.stringify([row.process,row.document,actor.org,actor.login]);const old=merged.get(key);
      if(old){old.expiresAt=Math.max(old.expiresAt,row.expires);if(row.activity!==null)old.activityAt=Math.max(old.activityAt??0,row.activity);}
      else merged.set(key,{process:row.process,document:row.document,number:row.number,actor,updatedAt:row.updated,activityAt:row.activity,expiresAt:row.expires});
    }
    return {serverTime:now,entries:[...merged.values()]};
  }
  return {update,query};
}
