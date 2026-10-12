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

test('stores a variant-free definition name regardless of feed order',()=>{
  const cards=[
    {id:'plain',riftboundId:'tst-001',name:'X',set:'TST',num:1,type:'Unit'},
    {id:'alt',riftboundId:'tst-002',name:'X (Alternate Art)',set:'TST',num:2,type:'Unit'}
  ];
  for(const orderedCards of [cards,[...cards].reverse()]){
    withDatabase(db=>{
      syncCatalog(db,{cards:orderedCards});
      assert.equal(db.prepare('SELECT card_name FROM card_definitions WHERE definition_key=?').get('x').card_name,'X');
      assert.equal(db.prepare('SELECT card_name FROM card_printings WHERE printing_id=?').get('tst-002').card_name,'X (Alternate Art)');
    });
  }
});

test('disambiguates duplicate printing IDs using the trailing variant label',()=>withDatabase(db=>{
  const cards=[
    {id:'plain-source',riftboundId:'opp-017-024',name:'Annie, Dark Child',set:'OPP',num:24,type:'Champion'},
    {id:'metal-source',riftboundId:'opp-017-024',name:'Annie, Dark Child (Metal)',set:'OPP',num:24,type:'Champion'}
  ];
  syncCatalog(db,{cards});
  assert.deepEqual(db.prepare('SELECT printing_id,card_name FROM card_printings ORDER BY printing_id').all(),[
    {printing_id:'opp-017-024',card_name:'Annie, Dark Child'},
    {printing_id:'opp-017-024-metal',card_name:'Annie, Dark Child (Metal)'}
  ]);
  assert.equal(db.prepare('SELECT card_name FROM card_definitions WHERE definition_key=?').get('annie, dark child').card_name,'Annie, Dark Child');
}));

test('only trailing parentheticals are treated as variants',()=>{
  const token=mapCard({name:'Recruit (271) // Buff',set:'TST'});
  assert.equal(token.definition_key,'recruit (271) // buff');
  assert.equal(token.definition_name,'Recruit (271) // Buff');
  assert.equal(token.variant_label,null);
});

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