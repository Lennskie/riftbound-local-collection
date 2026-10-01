export function normalizeDefinition(name=''){
  const match=name.match(/\s*\(([^()]*)\)\s*$/);
  const variant=match ? match[1].trim() : null;
  const base=(match ? name.slice(0,match.index) : name).trim();
  return {definition_key:base.toLowerCase().replace(/\s+/g,' '),variant_label:variant};
}

function bool(v){return v===true||v===1||v==='1';}
function first(...xs){return xs.find(v=>v!==undefined&&v!==null&&v!=='');}

export function mapCard(raw){
  const name=String(first(raw.name,raw.card_name,raw.cleanName,'')).trim();
  const {definition_key,variant_label}=normalizeDefinition(name);
  const setCode=String(first(raw.set_code,raw.set,raw.setCode,'')).trim();
  const setLabel=String(first(raw.set_name,raw.setName,raw.setLabel,setCode)).trim();
  const collector=Number(first(raw.collector_number,raw.collectorNum,raw.num,0));
  const printing=String(first(raw.code,raw.riftboundId,raw.printing_id,raw.id,'')).toLowerCase();
  const typeLine=first(raw.type_line,raw.typeLine,raw.card_type,raw.type);
  return {
    printing_id:printing, definition_key, rifthunt_id:first(raw.id,raw.rifthunt_id,raw.riftboundId)||null,
    tcgplayer_id:first(raw.tcgplayer_id,raw.tcgId)||null, card_name:name, variant_label,
    type_line:typeLine==null?null:String(typeLine).trim()||null,
    set_code:setCode, set_label:setLabel, collector_num:Number.isFinite(collector)?collector:0,
    rarity:first(raw.rarity,raw.rarety)||null, alternate_art:bool(first(raw.is_alternate_art,raw.alt))?1:0,
    overnumbered:bool(first(raw.is_overnumbered,raw.over))?1:0, signature:bool(first(raw.is_signature,raw.sig))?1:0,
    image_url:first(raw.image_url,raw.art_url,raw.imgUrl,raw.img)||null
  };
}

export function extractCards(payload){
  if(Array.isArray(payload)) return payload;
  if(Array.isArray(payload.cards)) return payload.cards;
  if(Array.isArray(payload.data)) return payload.data;
  throw new Error('Catalog response does not contain a card array');
}

export async function fetchCatalog(baseUrl){
  const base=baseUrl.replace(/\/$/,'');
  const pathname=new URL(base).pathname.replace(/\/$/,'');
  const urls=/\/(?:bulk\/cards|cards\/bulk)$/.test(pathname)
    ? [base]
    : [`${base}/cards/bulk`,`${base}/#bulk`];
  let last;
  for(const url of urls){
    try{
      const res=await fetch(url,{headers:{accept:'application/json'},redirect:'follow'});
      if(!res.ok){last=new Error(`${res.status} ${res.statusText}`);continue;}
      return await res.json();
    }catch(e){last=e;}
  }
  throw last||new Error('Catalog request failed');
}

export function syncCatalog(db,payload){
  const rawCards=extractCards(payload);
  const cards=rawCards.map(mapCard).filter(c=>c.printing_id&&c.definition_key&&c.set_code);
  const now=new Date().toISOString();
  const tx=db.transaction(()=>{
    const upDef=db.prepare(`INSERT INTO card_definitions(definition_key,card_name,type_line) VALUES(?,?,?) ON CONFLICT(definition_key) DO UPDATE SET card_name=excluded.card_name,type_line=COALESCE(excluded.type_line,card_definitions.type_line)`);
    const upPrint=db.prepare(`INSERT INTO card_printings(printing_id,definition_key,rifthunt_id,tcgplayer_id,card_name,variant_label,set_code,set_label,collector_num,rarity,alternate_art,overnumbered,signature,image_url,is_active,synced_at) VALUES(@printing_id,@definition_key,@rifthunt_id,@tcgplayer_id,@card_name,@variant_label,@set_code,@set_label,@collector_num,@rarity,@alternate_art,@overnumbered,@signature,@image_url,1,@synced_at) ON CONFLICT(printing_id) DO UPDATE SET definition_key=excluded.definition_key,rifthunt_id=excluded.rifthunt_id,tcgplayer_id=excluded.tcgplayer_id,card_name=excluded.card_name,variant_label=excluded.variant_label,set_code=excluded.set_code,set_label=excluded.set_label,collector_num=excluded.collector_num,rarity=excluded.rarity,alternate_art=excluded.alternate_art,overnumbered=excluded.overnumbered,signature=excluded.signature,image_url=excluded.image_url,is_active=1,synced_at=excluded.synced_at`);
    const deactivate=db.prepare(`UPDATE card_printings SET is_active=0 WHERE printing_id NOT IN (${cards.length?cards.map(()=>'?').join(','):"''"})`);
    for(const c of cards){upDef.run(c.definition_key,c.card_name,c.type_line);upPrint.run({...c,synced_at:now});}
    if(cards.length) deactivate.run(...cards.map(c=>c.printing_id));
    db.prepare(`INSERT INTO catalog_meta(key,value) VALUES('last_sync',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(now);
    db.prepare(`INSERT INTO catalog_meta(key,value) VALUES('last_count',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(String(cards.length));
    db.prepare(`INSERT INTO catalog_meta(key,value) VALUES('last_error','') ON CONFLICT(key) DO UPDATE SET value=''`).run();
    return cards.length;
  });
  return tx();
}
