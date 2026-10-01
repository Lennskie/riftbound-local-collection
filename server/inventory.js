import {assertDeckUpdate} from './deck-rules.js';

const FINISHES=['normal','foil'];
const ZONES=['main','sideboard'];

export function setInventoryQuantity(db,containerId,{printing_id,finish='normal',zone='main',quantity}){
  const save=db.transaction(()=>{
    assertDeckUpdate(db,containerId,[{printing_id,finish,zone,quantity,mode:'set'}]);
    if(quantity===0){
      db.prepare('DELETE FROM inventory WHERE container_id=? AND printing_id=? AND finish=? AND zone=?').run(containerId,printing_id,finish,zone);
      return;
    }
    db.prepare(`INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity) VALUES(?,?,?,?,?)
      ON CONFLICT(container_id,printing_id,finish,zone) DO UPDATE SET current_quantity=excluded.current_quantity`)
      .run(containerId,printing_id,finish,zone,quantity);
  });
  save();
}

export function deleteInventoryEntry(db,containerId,{printing_id,finish='normal',zone='main'}){
  if(!printing_id||!FINISHES.includes(finish)||!ZONES.includes(zone))throw new Error('printing_id, valid finish, and valid zone are required');
  return db.prepare('DELETE FROM inventory WHERE container_id=? AND printing_id=? AND finish=? AND zone=?')
    .run(containerId,printing_id,finish,zone).changes;
}

export function addInventoryBulk(db,containerId,cards){
  if(!Array.isArray(cards))throw new Error('cards must be an array');
  const changes=cards.map(card=>({
    printing_id:card?.printing_id,
    finish:card?.finish||'normal',
    zone:card?.zone||'main',
    quantity:Number(card?.quantity??1),
    mode:'add'
  }));
  if(changes.some(change=>!change.printing_id||!Number.isInteger(change.quantity)||change.quantity<=0)){
    throw new Error('printing_id and positive integer quantities are required');
  }
  const add=db.transaction(()=>{
    assertDeckUpdate(db,containerId,changes);
    const insert=db.prepare(`INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity) VALUES(?,?,?,?,?)
      ON CONFLICT(container_id,printing_id,finish,zone) DO UPDATE SET current_quantity=current_quantity+excluded.current_quantity`);
    for(const change of changes)insert.run(containerId,change.printing_id,change.finish,change.zone,change.quantity);
  });
  add();
  return changes.length;
}

export function transferInventory(db,{from_container_id,to_container_id,printing_id,finish='normal',quantity,from_zone,to_zone,zone='main'}){
  const fromZone=from_zone||zone;
  const toZone=to_zone||zone;
  if(!from_container_id||!to_container_id||from_container_id===to_container_id||!printing_id||
    !Number.isInteger(quantity)||quantity<=0||!FINISHES.includes(finish)||
    !ZONES.includes(fromZone)||!ZONES.includes(toZone))throw new Error('Invalid transfer');

  const move=db.transaction(()=>{
    assertDeckUpdate(db,to_container_id,[{printing_id,finish,zone:toZone,quantity,mode:'add'}]);
    const source=db.prepare('SELECT current_quantity FROM inventory WHERE container_id=? AND printing_id=? AND finish=? AND zone=?')
      .get(from_container_id,printing_id,finish,fromZone);
    if(!source||source.current_quantity<quantity)throw new Error('Not enough inventory in source container');
    db.prepare('UPDATE inventory SET current_quantity=current_quantity-? WHERE container_id=? AND printing_id=? AND finish=? AND zone=?')
      .run(quantity,from_container_id,printing_id,finish,fromZone);
    db.prepare(`INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity) VALUES(?,?,?,?,?)
      ON CONFLICT(container_id,printing_id,finish,zone) DO UPDATE SET current_quantity=current_quantity+excluded.current_quantity`)
      .run(to_container_id,printing_id,finish,toZone,quantity);
  });
  move();
}