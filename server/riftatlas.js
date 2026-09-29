import {normalizeDefinition} from './catalog.js';
import {assertDeckUpdate,summarizeDeck} from './deck-rules.js';

const SECTIONS=new Map([
  ['legend','Legend'],
  ['champion','Champion'],
  ['maindeck','MainDeck'],
  ['battlefields','Battlefields'],
  ['runes','Runes'],
  ['sideboard','Sideboard']
]);

export function parseRiftatlas(text){
  const entries=[];
  const errors=[];
  let section=null;
  for(const [index,rawLine] of String(text||'').split(/\r?\n/).entries()){
    const line=rawLine.trim();
    if(!line||line.startsWith('```'))continue;
    const header=line.match(/^([^:]+):$/);
    if(header){
      const key=header[1].replace(/[\s_-]/g,'').toLowerCase();
      section=SECTIONS.get(key)||null;
      if(!section)errors.push(`Line ${index+1}: unsupported section "${header[1]}".`);
      continue;
    }
    const card=line.match(/^(\d+)\s+(.+?)\s*$/);
    if(!section){errors.push(`Line ${index+1}: expected a section heading before "${line}".`);continue}
    if(!card){errors.push(`Line ${index+1}: expected "quantity card name".`);continue}
    const quantity=Number(card[1]);
    if(!Number.isSafeInteger(quantity)||quantity<1){errors.push(`Line ${index+1}: quantity must be a positive integer.`);continue}
    entries.push({section,card_name:card[2],quantity,zone:section==='Sideboard'?'sideboard':'main'});
  }
  return {entries,errors};
}

export function resolveRiftatlas(db,text){
  const parsed=parseRiftatlas(text);
  const lookup=db.prepare(`SELECT d.definition_key,d.card_name,d.type_line,
      (SELECT p.printing_id FROM card_printings p WHERE p.definition_key=d.definition_key AND p.is_active=1
       ORDER BY p.set_code,p.collector_num,p.printing_id LIMIT 1) printing_id
    FROM card_definitions d WHERE d.definition_key=?`);
  const missing=[];
  const grouped=new Map();
  for(const entry of parsed.entries){
    const {definition_key}=normalizeDefinition(entry.card_name);
    const card=lookup.get(definition_key);
    if(!card?.printing_id){missing.push({section:entry.section,card_name:entry.card_name,quantity:entry.quantity});continue}
    const key=`${card.definition_key}\0${entry.zone}`;
    const existing=grouped.get(key);
    if(existing)existing.quantity+=entry.quantity;
    else grouped.set(key,{...card,quantity:entry.quantity,zone:entry.zone,sections:[entry.section]});
  }
  return {cards:[...grouped.values()],missing,errors:parsed.errors};
}

export function previewRiftatlasImport(db,containerId,text){
  const container=db.prepare('SELECT container_id,name,type FROM containers WHERE container_id=?').get(containerId);
  if(!container)throw new Error('Container not found.');
  if(container.type!=='premade')throw new Error('Riftatlas imports are supported for premade containers.');
  const result=resolveRiftatlas(db,text);
  const deckRules=summarizeDeck(result.cards.map(card=>({...card,current_quantity:card.quantity})));
  return {...result,container,deck_rules:deckRules,ready:result.errors.length===0&&result.missing.length===0&&deckRules.violations.length===0};
}

export function importRiftatlasDeck(db,containerId,text){
  const preview=previewRiftatlasImport(db,containerId,text);
  if(preview.errors.length||preview.missing.length||preview.deck_rules.violations.length){
    const reasons=[...preview.errors,...preview.missing.map(card=>`Card not found: ${card.quantity} ${card.card_name} (${card.section}).`),...preview.deck_rules.violations];
    throw new Error(reasons.join(' '));
  }
  const changes=preview.cards.map(card=>({printing_id:card.printing_id,finish:'normal',zone:card.zone,quantity:card.quantity,mode:'add'}));
  const save=db.transaction(()=>{
    db.prepare('DELETE FROM inventory WHERE container_id=?').run(containerId);
    assertDeckUpdate(db,containerId,changes);
    const insertCard=db.prepare(`INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity)
      VALUES(?,?,?, ?,?)`);
    for(const card of preview.cards)insertCard.run(containerId,card.printing_id,'normal',card.zone,card.quantity);
    db.prepare('DELETE FROM premade_blueprints WHERE container_id=?').run(containerId);
    const insertRequirement=db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)');
    for(const card of preview.cards){
      if(card.zone==='main')insertRequirement.run(containerId,card.definition_key,card.quantity);
    }
    db.prepare('UPDATE containers SET deck_locked_at=? WHERE container_id=?').run(new Date().toISOString(),containerId);
  });
  save();
  return {imported:preview.cards.length,deck_locked_at:db.prepare('SELECT deck_locked_at FROM containers WHERE container_id=?').get(containerId).deck_locked_at};
}