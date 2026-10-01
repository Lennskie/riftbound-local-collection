import assert from 'node:assert/strict';
import test from 'node:test';
import {summarizeDeck} from './deck-rules.js';

test('classifies runes, legends, and battlefields separately from the main deck',()=>{
  const mainCards=[];
  for(let index=0;index<12;index++)mainCards.push({definition_key:`unit-${index}`,card_name:`Unit ${index}`,type_line:'Unit',zone:'main',quantity:3});
  for(let index=12;index<16;index++)mainCards.push({definition_key:`unit-${index}`,card_name:`Unit ${index}`,type_line:'Unit',zone:'main',quantity:1});
  const result=summarizeDeck([
    {definition_key:'fury rune',card_name:'Fury Rune',type_line:'Rune',zone:'main',quantity:6},
    {definition_key:'calm rune',card_name:'Calm Rune',type_line:'Rune',zone:'main',quantity:6},
    {definition_key:'legend',card_name:'Lux',type_line:'Legend',zone:'main',quantity:1},
    {definition_key:'battlefield',card_name:'Arena',type_line:'Battlefield',zone:'main',quantity:3},
    ...mainCards
  ]);
  assert.deepEqual(result.summary,{main:40,runes:12,legends:1,battlefields:3,sideboard:0});
  assert.deepEqual(result.violations,[]);
});

test('enforces copy and sideboard limits across printings and finishes',()=>{
  const result=summarizeDeck([
    {definition_key:'unit',card_name:'Unit',type_line:'Unit',zone:'main',quantity:2,finish:'normal'},
    {definition_key:'unit',card_name:'Unit',type_line:'Unit',zone:'sideboard',quantity:2,finish:'foil'},
    {definition_key:'spells',card_name:'Spell',type_line:'Spell',zone:'sideboard',quantity:11}
  ]);
  assert.equal(result.summary.sideboard,13);
  assert.ok(result.violations.some(message=>message.includes('4 copies exceeds the 3-copy limit')));
  assert.ok(result.violations.some(message=>message.includes('Sideboard has 13 cards')));
});