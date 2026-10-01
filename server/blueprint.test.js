import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {openDb} from './db.js';
import {replaceBlueprint} from './blueprints.js';

function withDatabase(run){
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'blueprint-test-'));
  const db=openDb(path.join(directory,'test.db'));
  db.prepare('INSERT INTO card_definitions(definition_key,card_name,type_line) VALUES(?,?,?)').run('known card','Known Card','Unit');
  db.prepare('INSERT INTO card_definitions(definition_key,card_name,type_line) VALUES(?,?,?)').run('other card','Other Card','Spell');
  db.prepare('INSERT INTO containers(container_id,name,type) VALUES(?,?,?)').run('deck','Test Deck','premade');
  db.prepare('INSERT INTO containers(container_id,name,type) VALUES(?,?,?)').run('bulk','Bulk','bulk');
  db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)').run('deck','known card',3);
  try{return run(db)}finally{db.close();fs.rmSync(directory,{recursive:true,force:true})}
}

test('rejects a missing container',()=>withDatabase(db=>{
  assert.throws(()=>replaceBlueprint(db,'missing',[{definition_key:'known card',required_quantity:1}]),error=>error.status===404);
}));

test('rejects an unknown definition without replacing the current blueprint',()=>withDatabase(db=>{
  assert.throws(()=>replaceBlueprint(db,'deck',[{definition_key:'missing card',required_quantity:1}]),/Unknown definition/);
  assert.deepEqual(db.prepare('SELECT definition_key,required_quantity FROM premade_blueprints WHERE container_id=?').all('deck'),[
    {definition_key:'known card',required_quantity:3}
  ]);
}));

test('rejects invalid quantities without replacing the current blueprint',()=>withDatabase(db=>{
  for(const required_quantity of [0,-1,1.5]){
    assert.throws(()=>replaceBlueprint(db,'deck',[{definition_key:'other card',required_quantity}]),/positive integer/);
  }
  assert.deepEqual(db.prepare('SELECT definition_key,required_quantity FROM premade_blueprints WHERE container_id=?').all('deck'),[
    {definition_key:'known card',required_quantity:3}
  ]);
}));

test('replaces an existing blueprint when all requirements are valid',()=>withDatabase(db=>{
  assert.deepEqual(replaceBlueprint(db,'deck',[
    {definition_key:'known card',required_quantity:2},
    {definition_key:'other card',required_quantity:1}
  ]),{ok:true});
  assert.deepEqual(db.prepare('SELECT definition_key,required_quantity FROM premade_blueprints WHERE container_id=? ORDER BY definition_key').all('deck'),[
    {definition_key:'known card',required_quantity:2},
    {definition_key:'other card',required_quantity:1}
  ]);
}));

test('rejects bulk containers',()=>withDatabase(db=>{
  assert.throws(()=>replaceBlueprint(db,'bulk',[]),/premade or custom/);
}));