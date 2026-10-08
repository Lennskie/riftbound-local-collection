import assert from 'node:assert/strict';
import test from 'node:test';
import {zoneForCard} from './zone.js';

test('runes, legends, battlefields and bulk inventory always use main',()=>{
  for(const typeLine of ['Rune','Legend','Battlefield']){
    assert.equal(zoneForCard(typeLine,'sideboard','custom'),'main');
  }
  assert.equal(zoneForCard('Unit','sideboard','bulk'),'main');
});

test('ordinary deck cards honor the requested zone',()=>{
  assert.equal(zoneForCard('Champion Unit','sideboard','custom'),'sideboard');
  assert.equal(zoneForCard('Champion Unit','invalid','premade'),'main');
});
