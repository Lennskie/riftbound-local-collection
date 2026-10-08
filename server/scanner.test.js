import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import express from 'express';
import test from 'node:test';
import {openDb} from './db.js';
import {syncCatalog} from './catalog.js';
import {buildScannerIndex,getScannerSnapshot,getScannerVersion,refreshScannerVersion,registerScannerRoutes} from './scanner.js';

async function withDatabase(run){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'scanner-test-'));
  const db=openDb(path.join(directory,'test.db'));
  try{return await run(db)}finally{db.close();fs.rmSync(directory,{recursive:true,force:true})}
}

function addPrinting(db,{key,name,id,set='TST',number=1,active=1,image='image'}){
  db.prepare('INSERT INTO card_definitions(definition_key,card_name,type_line) VALUES(?,?,?)')
    .run(key,name,'Unit');
  db.prepare(`INSERT INTO card_printings(printing_id,definition_key,card_name,set_code,collector_num,
    image_url,is_active,synced_at) VALUES(?,?,?,?,?,?,?,'test')`)
    .run(id,key,name,set,number,image,active);
}

test('scanner index includes only active printings and their definitions in stable order',()=>withDatabase(db=>{
  addPrinting(db,{key:'zeta',name:'Zeta',id:'zeta-b',set:'ZZZ',number:2});
  addPrinting(db,{key:'alpha',name:'Alpha',id:'alpha-b',set:'AAA',number:2});
  addPrinting(db,{key:'inactive',name:'Inactive',id:'inactive-b',active:0});
  const index=buildScannerIndex(db);
  assert.deepEqual(index.definitions.map(row=>row.definition_key),['alpha','zeta']);
  assert.deepEqual(index.printings.map(row=>row.printing_id),['alpha-b','zeta-b']);
  assert.deepEqual(buildScannerIndex(db),index);
}));

test('scanner version changes only when serialized scanner content changes',()=>withDatabase(db=>{
  const cards=[
    {id:'unit-id',riftboundId:'tst-001',name:'Unit',set:'TST',num:1,type:'Unit',image_url:'one'},
    {id:'variant-id',riftboundId:'tst-002',name:'Unit (Alt)',set:'TST',num:2,type:'Unit',image_url:'two'}
  ];
  syncCatalog(db,{cards});
  const first=getScannerVersion(db);
  syncCatalog(db,{cards});
  assert.equal(getScannerVersion(db),first);
  syncCatalog(db,{cards:[{...cards[0],image_url:'updated'},cards[1]]});
  assert.equal(getScannerVersion(db),first+1);
  syncCatalog(db,{cards:[{...cards[0],image_url:'updated'},cards[1],
    {id:'third-id',riftboundId:'tst-003',name:'Third',set:'TST',num:3,type:'Unit'}]});
  assert.equal(getScannerVersion(db),first+2);
}));

test('snapshot lazily initializes legacy scanner metadata and serializes its version',()=>withDatabase(db=>{
  addPrinting(db,{key:'unit',name:'Unit',id:'unit-b'});
  const snapshot=getScannerSnapshot(db);
  assert.equal(snapshot.version,1);
  assert.equal(JSON.parse(snapshot.body).version,1);
  assert.equal(getScannerSnapshot(db),snapshot);
  assert.equal(refreshScannerVersion(db),1);
}));

test('scanner endpoints return compact index and version without building the index for version checks',async()=>withDatabase(async db=>{
  syncCatalog(db,{cards:[{id:'unit-id',riftboundId:'tst-001',name:'Unit',set:'TST',num:1,type:'Unit'}]});
  const app=express();
  registerScannerRoutes(app,db);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    const base=`http://127.0.0.1:${server.address().port}`;
    db.exec('DROP TABLE card_printings');
    const versionResponse=await fetch(`${base}/api/scanner/version`);
    assert.deepEqual(await versionResponse.json(),{version:1});
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}));

test('scanner index route includes its own version and shipped printing fields',async()=>withDatabase(async db=>{
  syncCatalog(db,{cards:[{id:'unit-id',riftboundId:'tst-001',name:'Unit',set:'TST',num:1,type:'Unit',image_url:'image'}]});
  const app=express();
  registerScannerRoutes(app,db);
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  try{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api/scanner/index`);
    const body=await response.json();
    assert.equal(body.version,1);
    assert.deepEqual(body.definitions,[{definition_key:'unit',card_name:'Unit',type_line:'Unit'}]);
    assert.deepEqual(body.printings,[{
      printing_id:'tst-001',definition_key:'unit',set_code:'TST',collector_num:1,rarity:null,
      variant_label:null,alternate_art:0,overnumbered:0,signature:0,image_url:'image'
    }]);
  }finally{
    await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
  }
}));
