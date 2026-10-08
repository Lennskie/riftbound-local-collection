import {createHash} from 'node:crypto';

const snapshots=new WeakMap();

export function buildScannerIndex(db){
  const definitions=db.prepare(`SELECT DISTINCT d.definition_key,d.card_name,d.type_line
    FROM card_definitions d
    JOIN card_printings p ON p.definition_key=d.definition_key
    WHERE p.is_active=1
    ORDER BY d.definition_key`).all();
  const printings=db.prepare(`SELECT printing_id,definition_key,set_code,collector_num,rarity,variant_label,
      alternate_art,overnumbered,signature,image_url
    FROM card_printings
    WHERE is_active=1
    ORDER BY set_code,collector_num,printing_id`).all();
  return {definitions,printings};
}

export function getScannerVersion(db){
  const stored=db.prepare("SELECT value FROM catalog_meta WHERE key='scanner_version'").get()?.value;
  if(stored==null) return 0;
  const version=Number(stored);
  if(!Number.isSafeInteger(version)||version<0) throw new Error('Stored scanner catalog version is invalid');
  return version;
}

export function refreshScannerVersion(db){
  const index=buildScannerIndex(db);
  const serialized=JSON.stringify(index);
  const hash=createHash('sha1').update(serialized).digest('hex');
  const currentHash=db.prepare("SELECT value FROM catalog_meta WHERE key='scanner_hash'").get()?.value||null;
  const currentVersion=getScannerVersion(db);
  if(hash===currentHash) return currentVersion;

  const version=currentVersion+1;
  if(!Number.isSafeInteger(version)) throw new Error('Scanner catalog version is not a safe integer');
  const update=db.transaction(()=>{
    db.prepare(`INSERT INTO catalog_meta(key,value) VALUES('scanner_hash',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(hash);
    db.prepare(`INSERT INTO catalog_meta(key,value) VALUES('scanner_version',?)
      ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(version));
  });
  update();
  snapshots.delete(db);
  return version;
}

export function getScannerSnapshot(db){
  let version=getScannerVersion(db);
  if(!version) version=refreshScannerVersion(db);
  const cached=snapshots.get(db);
  if(cached?.version===version) return cached;
  const body=JSON.stringify({version,...buildScannerIndex(db)});
  const snapshot={version,body};
  snapshots.set(db,snapshot);
  return snapshot;
}

export function registerScannerRoutes(app,db){
  app.get('/api/scanner/version',(_req,res)=>res.json({version:getScannerVersion(db)}));
  app.get('/api/scanner/index',(_req,res)=>{
    const {body}=getScannerSnapshot(db);
    res.type('application/json').send(body);
  });
}
