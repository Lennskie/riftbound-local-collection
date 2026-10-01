import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {openDb} from './db.js';
import {mapCard,syncCatalog} from './catalog.js';

const providerCards=[
  {id:'api-rune',riftboundId:'ogn-007-298',name:'Fury Rune',num:7,type:'Rune',set:'OGN',is_foil:true},
  {id:'api-legend',riftboundId:'ogn-021-024',name:'Lux, Lady of Luminosity (Starter)',num:21,type:'Legend',set:'OGS'},
  {id:'api-battlefield',riftboundId:'ogn-275-298',name:'Altar to Unity',num:275,type:'Battlefield',set:'OGN'}
];

function withDatabase(run){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'catalog-test-'));
  const db=openDb(path.join(directory,'test.db'));
  try{return run(db)}finally{db.close();fs.rmSync(directory,{recursive:true,force:true})}
}

test('maps the provider type field and explicit type-line aliases',()=>{
  assert.deepEqual(providerCards.map(card=>mapCard(card).type_line),['Rune','Legend','Battlefield']);
  assert.equal(mapCard({...providerCards[0],type_line:'Rune — Basic'}).type_line,'Rune — Basic');
  assert.equal(mapCard({name:'Unknown',set:'TST'}).type_line,null);
});

test('maps foil metadata and stores it on the printing',()=>withDatabase(db=>{
  assert.equal(mapCard({...providerCards[0],is_foil:true}).is_foil,1);
  assert.equal(mapCard({...providerCards[0],is_foil:false,foil:true}).is_foil,0);
  syncCatalog(db,{cards:providerCards});
  assert.equal(db.prepare('SELECT is_foil FROM card_printings WHERE printing_id=?').get('ogn-007-298').is_foil,1);
}));

test('sync stores definition types and deactivates removed printings',()=>withDatabase(db=>{
  assert.equal(syncCatalog(db,{cards:providerCards}),3);
  assert.deepEqual(db.prepare('SELECT definition_key,type_line FROM card_definitions ORDER BY definition_key').all(),[
    {definition_key:'altar to unity',type_line:'Battlefield'},
    {definition_key:'fury rune',type_line:'Rune'},
    {definition_key:'lux, lady of luminosity',type_line:'Legend'}
  ]);
  assert.equal(db.prepare('SELECT is_active FROM card_printings WHERE printing_id=?').get('ogn-007-298').is_active,1);
  assert.equal(syncCatalog(db,{cards:[providerCards[0]]}),1);
  assert.equal(db.prepare('SELECT is_active FROM card_printings WHERE printing_id=?').get('ogn-275-298').is_active,0);
  assert.equal(db.prepare("SELECT value FROM catalog_meta WHERE key='last_count'").get().value,'1');
}));