import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {openDb} from './db.js';
import {importRiftatlasDeck,previewRiftatlasImport} from './riftatlas.js';
import {normalizeDefinition} from './catalog.js';

const decklist=`Legend:
1 Lux, Lady of Luminosity

Champion:
1 Lux, Crownguard

MainDeck:
3 Back to Back
3 Blast of Power
3 Daring Poro
2 Eager Apprentice
3 Falling Comet
2 Final Spark
3 Lecturing Yordle
1 Lux, Crownguard
2 Lux, Illuminated
2 Mega-Mech
3 Ravenbloom Student
3 Singularity
3 Stupefy
3 Vanguard Attendant
3 Vanguard Sergeant

Battlefields:
1 Abandoned Hall
1 Ravenbloom Conservatory
1 Startipped Peak

Runes:
6 Mind Rune
6 Order Rune

Sideboard:
`;

function makeDatabase(){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'riftatlas-test-'));
  const db=openDb(path.join(directory,'test.db'));
  const names=[
    ['Lux, Lady of Luminosity (Metal)','Legend'],['Lux, Crownguard','Unit'],
    ['Back to Back','Spell'],['Blast of Power','Spell'],['Daring Poro','Unit'],
    ['Eager Apprentice','Unit'],['Falling Comet','Spell'],['Final Spark','Spell'],
    ['Lecturing Yordle','Unit'],['Lux, Illuminated','Unit'],['Mega-Mech','Unit'],
    ['Ravenbloom Student','Unit'],['Singularity','Spell'],['Stupefy','Spell'],
    ['Vanguard Attendant','Unit'],['Vanguard Sergeant','Unit'],['Abandoned Hall','Battlefield'],
    ['Ravenbloom Conservatory','Battlefield'],['Startipped Peak','Battlefield'],
    ['Mind Rune','Rune'],['Order Rune','Rune']
  ];
  const insertDefinition=db.prepare('INSERT INTO card_definitions(definition_key,card_name,type_line) VALUES(?,?,?)');
  const insertPrinting=db.prepare('INSERT INTO card_printings(printing_id,definition_key,card_name,set_code,collector_num,synced_at) VALUES(?,?,?,?,?,?)');
  const insertContainer=db.prepare('INSERT INTO containers(container_id,name,type) VALUES(?,?,?)');
  for(const [index,[name,type]] of names.entries()){
    const {definition_key}=normalizeDefinition(name);
    insertDefinition.run(definition_key,name,type);
    insertPrinting.run(`printing-${index}`,definition_key,name,'TST',index,'test');
  }
  insertContainer.run('premade','Lux','premade');
  insertContainer.run('bulk','Bulk','bulk');
  return {db,directory};
}

test('previews and imports the supplied Riftatlas list as a locked premade deck',()=>{
  const {db,directory}=makeDatabase();
  try{
    db.prepare('INSERT INTO containers(container_id,name,type,deck_locked_at) VALUES(?,?,?,?)').run('other-deck','Lux','premade','existing-lock');
    db.prepare('INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity) VALUES(?,?,?,?,?)').run('other-deck','printing-2','foil','main',2);
    db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)').run('other-deck','back to back',2);
    const preview=previewRiftatlasImport(db,'premade',decklist);
    assert.equal(preview.ready,true,JSON.stringify(preview));
    assert.deepEqual(preview.deck_rules.summary,{main:40,runes:12,legends:1,battlefields:3,sideboard:0});
    assert.equal(preview.cards.find(card=>card.card_name==='Lux, Crownguard').quantity,2);
    assert.equal(preview.cards.find(card=>card.card_name.startsWith('Lux, Lady of Luminosity')).quantity,1);
    const imported=importRiftatlasDeck(db,'premade',decklist);
    assert.equal(imported.imported,21);
    assert.ok(imported.deck_locked_at);
    assert.equal(db.prepare('SELECT COUNT(*) count FROM premade_blueprints WHERE container_id=?').get('premade').count,21);
    assert.deepEqual(db.prepare('SELECT printing_id,finish,zone,current_quantity FROM inventory WHERE container_id=?').all('other-deck'),[
      {printing_id:'printing-2',finish:'foil',zone:'main',current_quantity:2}
    ]);
    assert.deepEqual(db.prepare('SELECT definition_key,required_quantity FROM premade_blueprints WHERE container_id=?').all('other-deck'),[
      {definition_key:'back to back',required_quantity:2}
    ]);
    assert.equal(db.prepare('SELECT deck_locked_at FROM containers WHERE container_id=?').get('other-deck').deck_locked_at,'existing-lock');
  }finally{
    db.close();fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('rejects unresolved cards without changing the existing deck',()=>{
  const {db,directory}=makeDatabase();
  try{
    const insert=db.prepare('INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity) VALUES(?,?,?,?,?)');
    insert.run('premade','printing-1','normal','main',1);
    const invalid=decklist.replace('3 Back to Back','3 Card Not In Catalog');
    assert.equal(previewRiftatlasImport(db,'premade',invalid).ready,false);
    assert.throws(()=>importRiftatlasDeck(db,'premade',invalid),/Card not found/);
    assert.equal(db.prepare('SELECT SUM(current_quantity) quantity FROM inventory WHERE container_id=?').get('premade').quantity,1);
  }finally{
    db.close();fs.rmSync(directory,{recursive:true,force:true});
  }
});

test('locked-list shortfalls only compare against the requested container blueprint',()=>{
  const {db,directory}=makeDatabase();
  try{
    db.prepare('INSERT INTO containers(container_id,name,type,deck_locked_at) VALUES(?,?,?,?)').run('other-deck','Vex','premade','locked');
    db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)').run('premade','back to back',3);
    db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)').run('other-deck','eager apprentice',2);
    db.prepare('INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity) VALUES(?,?,?,?,?)').run('premade','printing-2','normal','main',3);
    db.prepare('INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity) VALUES(?,?,?,?,?)').run('other-deck','printing-5','normal','main',2);
    const findShortfalls=db.prepare(`SELECT b.definition_key,d.card_name,b.required_quantity,
      COALESCE(SUM(CASE WHEN i.container_id=? AND i.zone='main' THEN i.current_quantity ELSE 0 END),0) current_quantity,
      MAX(0,b.required_quantity-COALESCE(SUM(CASE WHEN i.container_id=? AND i.zone='main' THEN i.current_quantity ELSE 0 END),0)) shortfall
      FROM premade_blueprints b JOIN card_definitions d ON d.definition_key=b.definition_key
      LEFT JOIN inventory i ON i.printing_id IN (SELECT printing_id FROM card_printings WHERE definition_key=b.definition_key)
      WHERE b.container_id=? GROUP BY b.definition_key,d.card_name,b.required_quantity HAVING shortfall>0`);
    assert.deepEqual(findShortfalls.all('premade','premade','premade'),[]);
    assert.deepEqual(findShortfalls.all('other-deck','other-deck','other-deck'),[]);
  }finally{
    db.close();fs.rmSync(directory,{recursive:true,force:true});
  }
});