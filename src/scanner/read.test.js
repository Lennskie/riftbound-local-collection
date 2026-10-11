import assert from 'node:assert/strict';
import test from 'node:test';
import {buildMatcher} from './match.js';
import {readCard} from './read.js';

const matcher=buildMatcher([
  {definition_key:'miss fortune bounty hunter',card_name:'Miss Fortune, Bounty Hunter',type_line:'Legend'},
  {definition_key:'volibear imposing',card_name:'Volibear, Imposing',type_line:'Unit'},
  {definition_key:'volibear furious',card_name:'Volibear, Furious',type_line:'Unit'},
  {definition_key:'teemo',card_name:'Teemo',type_line:'Unit'}
]);
const reads=texts=>texts.map(text=>async()=>text);

test('stops at the first confident match without running later attempts',async()=>{
  let calls=0;
  const counted=[async()=>{calls++;return 'TEEMO'},async()=>{calls++;return 'x'}];
  const result=await readCard(matcher,[counted]);
  assert.equal(result.definition_key,'teemo');
  assert.equal(calls,1);
});

test('falls through to a later image preparation when the first one reads garbage',async()=>{
  const result=await readCard(matcher,[reads(['CHAMPION UNIT VOLIBEAR FRELJORD','CHAMPION UNIT VOLIBEAR FRELJORD Ve IMPOSING'])]);
  assert.equal(result.definition_key,'volibear imposing');
});

test('reads the legend band when the unit band only contains artwork',async()=>{
  const result=await readCard(matcher,[reads(['ee a','i']),reads(['f8 ET MISS FORTUNE e Bounty Hunter'])]);
  assert.equal(result.definition_key,'miss fortune bounty hunter');
});

test('combines the text of several preparations of the same band',async()=>{
  const result=await readCard(matcher,[reads(['MISS FORTUNE','LEGEND'])]);
  assert.equal(result.definition_key,'miss fortune bounty hunter');
});

test('returns null when nothing can be read',async()=>{
  assert.equal(await readCard(matcher,[reads(['zzqv','9381']),reads(['qqq'])]),null);
});

test('keeps the best weak match when no band is confident',async()=>{
  const result=await readCard(matcher,[reads(['Teem0'])]);
  assert.equal(result.definition_key,'teemo');
  assert.equal(result.confident,false);
});
