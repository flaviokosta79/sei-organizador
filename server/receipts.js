// Unit arrivals are independent of internal-block snapshots and their classification cleanup.
export function createReceipts(db) {
  db.exec('CREATE TABLE IF NOT EXISTS secretariat_receipts (unit TEXT PRIMARY KEY, version INTEGER NOT NULL, observed INTEGER NOT NULL, pending TEXT NOT NULL)');
  function read(unit) {
    const row=db.prepare('SELECT * FROM secretariat_receipts WHERE unit=?').get(unit);
    return row?{version:row.version,observed:row.observed,initialized:true,pending:JSON.parse(row.pending)}:{version:0,observed:0,initialized:false,pending:[]};
  }
  function snapshot(unit,data) {
    if(data?.block!=='1396'||data.actor?.org!=='SEPM'||typeof data.actor?.login!=='string'||!data.actor.login.trim()||data.actor.login.length>100)throw Object.assign(Error('Usuário da Secretaria inválido.'),{status:403});
    if(data.complete!==true||!Number.isSafeInteger(data.version)||data.version<0||!Array.isArray(data.items)||data.items.length>10000||!data.items.every(p=>p&&typeof p.id==='string'&&/^\d{1,30}$/.test(p.id)&&typeof p.number==='string'&&p.number.trim().length>0&&p.number.length<=100&&typeof p.pending==='boolean')||new Set(data.items.map(p=>p.id)).size!==data.items.length)throw Error('Lista completa de recebidos inválida.');
    db.exec('BEGIN IMMEDIATE');
    try {
      const old=read(unit);
      if(old.version!==data.version)throw Object.assign(Error('Consulta de recebidos substituída; aguarde a próxima leitura.'),{status:409});
      const previous=new Map(old.pending.map(p=>[p.id,p])),now=Date.now();
      const pending=data.items.filter(p=>p.pending).map(p=>({id:p.id,number:p.number,token:previous.get(p.id)?.token||crypto.randomUUID(),baseline:previous.get(p.id)?.baseline??!old.initialized}));
      db.prepare('INSERT INTO secretariat_receipts VALUES(?,?,?,?) ON CONFLICT(unit) DO UPDATE SET version=excluded.version,observed=excluded.observed,pending=excluded.pending').run(unit,old.version+1,now,JSON.stringify(pending));
      db.exec('COMMIT');
      return {version:old.version+1,observed:now,initialized:true,pending};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  return {read,snapshot};
}
