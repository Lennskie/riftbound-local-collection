import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {openDb} from './db.js';
import {listCards} from './cards.js';

test('catalog card search matches definition keys',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'cards-test-'));
  const db=openDb(path.join(directory,'test.db'));
  try{
    db.prepare('INSERT INTO card_definitions(definition_key,card_name,type_line) VALUES(?,?,?)')
      .run('baron nashor','Baron Nashor','Unit');
    db.prepare('INSERT INTO card_printings(printing_id,definition_key,card_name,set_code,collector_num,synced_at) VALUES(?,?,?,?,?,?)')
      .run('baron-printing','baron nashor','Baron Nashor (Alternate Art)','UNL',147,'test');
    const result=listCards(db,{q:'baron nashor'});
    assert.deepEqual(result.cards.map(card=>card.printing_id),['baron-printing']);
  }finally{
    db.close();fs.rmSync(directory,{recursive:true,force:true});
  }
});