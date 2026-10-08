import assert from 'node:assert/strict';
import test from 'node:test';
import {bestMatch,buildMatcher,MIN_MATCH_SCORE,normalizeForMatch} from './match.js';

const definitions=[
  {definition_key:'dr mundo expert',card_name:'Dr. Mundo, Expert'},
  {definition_key:'get excited',card_name:'Get Excited!'},
  {definition_key:'kaisa survivor',card_name:"Kai'Sa, Survivor"},
  {definition_key:'teemo',card_name:'Teemo'},
  {definition_key:'fury rune',card_name:'Fury Rune'},
  {definition_key:'rune',card_name:'Rune'}
];
const matcher=buildMatcher(definitions);

test('normalizes punctuation and repeated whitespace',()=>{
  assert.equal(normalizeForMatch("  Kai'Sa,\n  Survivor! "),'kaisa survivor');
});

test('matches exact card names and names with dropped punctuation',()=>{
  assert.equal(bestMatch(matcher,'Dr Mundo Expert')?.definition_key,'dr mundo expert');
  assert.equal(bestMatch(matcher,'GET EXCITED')?.definition_key,'get excited');
  assert.equal(bestMatch(matcher,'KaiSa Survivor')?.definition_key,'kaisa survivor');
});

test('matches a title line with an OCR subtitle',()=>{
  assert.equal(bestMatch(matcher,'TEEMO\nSTRATEGIST')?.definition_key,'teemo');
});

test('accepts a single-character OCR error above the configured threshold',()=>{
  const result=bestMatch(matcher,'Teem0');
  assert.equal(result?.definition_key,'teemo');
  assert.ok(result.score>=MIN_MATCH_SCORE);
});

test('rejects unrelated OCR text',()=>{
  assert.equal(bestMatch(matcher,'zzqv 9381 nonsense'),null);
});

test('distinguishes a rune name from the longer name sharing its suffix',()=>{
  assert.equal(bestMatch(matcher,'Fury Rune')?.definition_key,'fury rune');
  assert.equal(bestMatch(matcher,'Rune')?.definition_key,'rune');
});
