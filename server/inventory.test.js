import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {openDb} from './db.js';
import {addInventoryBulk,deleteInventoryEntry,setInventoryQuantity,transferInventory} from './inventory.js';

function withDatabase(run){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'inventory-test-'));
  const db=openDb(path.join(directory,'test.db'));
  const insertDefinition=db.prepare('INSERT INTO card_definitions(definition_key,card_name,type_line) VALUES(?,?,?)');
  const insertPrinting=db.prepare('INSERT INTO card_printings(printing_id,definition_key,card_name,set_code,collector_num,synced_at) VALUES(?,?,?,?,?,?)');
  const insertContainer=db.prepare('INSERT INTO containers(container_id,name,type) VALUES(?,?,?)');
  insertDefinition.run('unit','Test Unit','Unit');
  insertDefinition.run('spell','Test Spell','Spell');
  insertPrinting.run('unit-a','unit','Test Unit','TST',1,'test');
  insertPrinting.run('unit-b','unit','Test Unit','TST',2,'test');
  insertPrinting.run('spell-a','spell','Test Spell','TST',3,'test');
  insertContainer.run('bulk','Bulk','bulk');
  insertContainer.run('deck','Deck','custom');
  try{return run(db)}finally{db.close();fs.rmSync(directory,{recursive:true,force:true})}
}

test('quantity updates keep normal, foil, main, and sideboard entries distinct',()=>withDatabase(db=>{
  setInventoryQuantity(db,'bulk',{printing_id:'unit-a',quantity:2});
  setInventoryQuantity(db,'bulk',{printing_id:'unit-a',finish:'foil',zone:'sideboard',quantity:1});
  setInventoryQuantity(db,'bulk',{printing_id:'unit-a',quantity:3});
  assert.deepEqual(db.prepare('SELECT finish,zone,current_quantity FROM inventory WHERE container_id=? ORDER BY finish').all('bulk'),[
    {finish:'foil',zone:'sideboard',current_quantity:1},
    {finish:'normal',zone:'main',current_quantity:3}
  ]);
  setInventoryQuantity(db,'bulk',{printing_id:'unit-a',finish:'foil',zone:'sideboard',quantity:0});
  assert.deepEqual(db.prepare('SELECT finish,zone,current_quantity FROM inventory').all(),[
    {finish:'normal',zone:'main',current_quantity:3}
  ]);
}));

test('deletion removes only the selected finish and zone',()=>withDatabase(db=>{
  setInventoryQuantity(db,'bulk',{printing_id:'spell-a',quantity:2});
  setInventoryQuantity(db,'bulk',{printing_id:'spell-a',finish:'foil',zone:'sideboard',quantity:1});
  assert.equal(deleteInventoryEntry(db,'bulk',{printing_id:'spell-a',finish:'foil',zone:'sideboard'}),1);
  assert.equal(deleteInventoryEntry(db,'bulk',{printing_id:'spell-a',finish:'foil',zone:'sideboard'}),0);
  assert.deepEqual(db.prepare('SELECT finish,zone,current_quantity FROM inventory').all(),[
    {finish:'normal',zone:'main',current_quantity:2}
  ]);
}));

test('bulk additions preserve sideboard/foil rows and roll back a deck-limit violation',()=>withDatabase(db=>{
  assert.equal(addInventoryBulk(db,'deck',[
    {printing_id:'unit-a',quantity:2},
    {printing_id:'unit-b',quantity:1,finish:'foil'},
    {printing_id:'spell-a',quantity:1,finish:'normal',zone:'sideboard'},
    {printing_id:'spell-a',quantity:1,finish:'foil',zone:'sideboard'}
  ]),4);
  assert.throws(()=>addInventoryBulk(db,'deck',[
    {printing_id:'unit-a',quantity:1,zone:'sideboard'},
    {printing_id:'spell-a',quantity:1}
  ]),/Deck limit exceeded/);
  assert.equal(db.prepare('SELECT SUM(current_quantity) quantity FROM inventory WHERE printing_id=?').get('unit-a').quantity,2);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM inventory WHERE printing_id=?').get('spell-a').count,2);
  assert.deepEqual(db.prepare('SELECT finish,zone,current_quantity FROM inventory WHERE printing_id=? ORDER BY finish').all('spell-a'),[
    {finish:'foil',zone:'sideboard',current_quantity:1},
    {finish:'normal',zone:'sideboard',current_quantity:1}
  ]);
}));

test('transfers preserve finish and zones and roll back both sides on destination limits',()=>withDatabase(db=>{
  setInventoryQuantity(db,'bulk',{printing_id:'unit-a',finish:'foil',zone:'sideboard',quantity:2});
  transferInventory(db,{from_container_id:'bulk',to_container_id:'deck',printing_id:'unit-a',finish:'foil',quantity:1,from_zone:'sideboard',to_zone:'main'});
  assert.equal(db.prepare('SELECT current_quantity FROM inventory WHERE container_id=? AND finish=? AND zone=?').get('bulk','foil','sideboard').current_quantity,1);
  assert.equal(db.prepare('SELECT current_quantity FROM inventory WHERE container_id=? AND finish=? AND zone=?').get('deck','foil','main').current_quantity,1);

  setInventoryQuantity(db,'deck',{printing_id:'unit-a',quantity:2});
  setInventoryQuantity(db,'bulk',{printing_id:'unit-b',quantity:2});
  assert.throws(()=>transferInventory(db,{from_container_id:'bulk',to_container_id:'deck',printing_id:'unit-b',quantity:1}),/Deck limit exceeded/);
  assert.equal(db.prepare('SELECT current_quantity FROM inventory WHERE container_id=? AND printing_id=?').get('bulk','unit-b').current_quantity,2);
  assert.equal(db.prepare('SELECT COUNT(*) count FROM inventory WHERE container_id=? AND printing_id=?').get('deck','unit-b').count,0);
}));