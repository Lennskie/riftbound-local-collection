const LIMITS={main:40,runes:12,legends:1,battlefields:3,sideboard:10,copies:3};

function cardType(typeLine=''){
  const type=String(typeLine).toLowerCase();
  if(type.includes('rune'))return 'rune';
  if(type.includes('legend'))return 'legend';
  if(type.includes('battlefield'))return 'battlefield';
  return 'card';
}

export function summarizeDeck(cards){
  const summary={main:0,runes:0,legends:0,battlefields:0,sideboard:0};
  const violations=[];
  const definitions=new Map();
  for(const card of cards){
    const quantity=Number(card.current_quantity??card.quantity??0);
    if(quantity<=0)continue;
    const type=cardType(card.type_line);
    const identity=definitions.get(card.definition_key)||{name:card.card_name,quantity:0,type};
    identity.quantity+=quantity;
    definitions.set(card.definition_key,identity);
    if(type==='rune')summary.runes+=quantity;
    else if(type==='legend')summary.legends+=quantity;
    else if(type==='battlefield')summary.battlefields+=quantity;
    else if(card.zone==='sideboard')summary.sideboard+=quantity;
    else summary.main+=quantity;
    if(type!=='card'&&card.zone==='sideboard'){
      violations.push(`${card.card_name} (${type}) must be in the main deck zone.`);
    }
  }
  for(const card of definitions.values()){
    const cap=card.type==='legend'?LIMITS.legends:card.type==='rune'?6:LIMITS.copies;
    if(card.quantity>cap)violations.push(`${card.name}: ${card.quantity} copies exceeds the ${cap}-copy limit across printings and finishes.`);
  }
  if(summary.main>LIMITS.main)violations.push(`Main deck has ${summary.main} cards; maximum is ${LIMITS.main}.`);
  if(summary.runes>LIMITS.runes)violations.push(`Rune pool has ${summary.runes} runes; maximum is ${LIMITS.runes}.`);
  if(summary.legends>LIMITS.legends)violations.push(`Deck has ${summary.legends} legends; maximum is ${LIMITS.legends}.`);
  if(summary.battlefields>LIMITS.battlefields)violations.push(`Deck has ${summary.battlefields} battlefields; maximum is ${LIMITS.battlefields}.`);
  if(summary.sideboard>LIMITS.sideboard)violations.push(`Sideboard has ${summary.sideboard} cards; maximum is ${LIMITS.sideboard}.`);
  return {summary,violations};
}

export function deckCards(db,containerId){
  return db.prepare(`SELECT i.printing_id,i.finish,i.zone,i.current_quantity,p.definition_key,p.card_name,d.type_line
    FROM inventory i JOIN card_printings p ON p.printing_id=i.printing_id
    JOIN card_definitions d ON d.definition_key=p.definition_key
    WHERE i.container_id=?`).all(containerId);
}

export function assertDeckUpdate(db,containerId,changes){
  const container=db.prepare('SELECT type FROM containers WHERE container_id=?').get(containerId);
  if(!container)throw new Error('Container not found');
  if(container.type==='bulk')return;
  const rows=deckCards(db,containerId);
  const byKey=new Map(rows.map(card=>[`${card.printing_id}\0${card.finish}\0${card.zone}`,card]));
  const groupedChanges=new Map();
  for(const change of changes){
    const finish=change.finish||'normal';
    const zone=change.zone||'main';
    if(!['normal','foil'].includes(finish))throw new Error('Finish must be normal or foil.');
    if(!['main','sideboard'].includes(zone))throw new Error('Zone must be main or sideboard.');
    if(!Number.isInteger(change.quantity)||change.quantity<0)throw new Error('Quantity must be a non-negative integer.');
    const key=`${change.printing_id}\0${finish}\0${zone}`;
    const grouped=groupedChanges.get(key)||{...change,finish,zone,quantity:0};
    grouped.quantity=change.mode==='set'?change.quantity:grouped.quantity+change.quantity;
    grouped.mode=change.mode;
    groupedChanges.set(key,grouped);
  }
  for(const [key,change] of groupedChanges){
    const current=byKey.get(key);
    const printing=db.prepare(`SELECT p.definition_key,p.card_name,d.type_line FROM card_printings p
      JOIN card_definitions d ON d.definition_key=p.definition_key WHERE p.printing_id=?`).get(change.printing_id);
    if(!printing)throw new Error(`Unknown printing: ${change.printing_id}`);
    const quantity=change.mode==='set'?change.quantity:(current?.current_quantity||0)+change.quantity;
    byKey.set(key,{...printing,printing_id:change.printing_id,finish:change.finish||'normal',zone:change.zone||'main',current_quantity:quantity});
  }
  const result=summarizeDeck([...byKey.values()]);
  if(result.violations.length)throw new Error(`Deck limit exceeded: ${result.violations.join(' ')}`);
}