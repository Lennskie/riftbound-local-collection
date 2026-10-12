import assert from 'node:assert/strict';
import test from 'node:test';
import {adaptiveBrightThreshold,adaptiveDarkThreshold,buildOcrVariants,percentileThreshold} from './ocr.js';

test('percentile threshold keeps only the brightest pixels as black text',()=>{
  const gray=new Uint8Array(100).fill(150);
  for(let index=0;index<10;index++) gray[index]=255;
  const output=percentileThreshold(gray,0.9);
  assert.equal(output.slice(0,10).every(value=>value===0),true);
  assert.equal(output.slice(10).every(value=>value===255),true);
});

test('adaptive threshold finds white lettering on a mid-tone banner but ignores the banner itself',()=>{
  const width=40,height=20;
  const gray=new Uint8Array(width*height).fill(150);
  for(let y=8;y<12;y++) for(let x=10;x<30;x++) gray[y*width+x]=250;
  const output=adaptiveBrightThreshold(gray,width,height,6,25);
  assert.equal(output[9*width+20],0);
  assert.equal(output[2*width+2],255);
  assert.equal(output[17*width+35],255);
});

test('adaptive dark threshold finds dark lettering on a light banner',()=>{
  const width=40,height=20;
  const gray=new Uint8Array(width*height).fill(200);
  for(let y=8;y<12;y++) for(let x=10;x<30;x++) gray[y*width+x]=30;
  const output=adaptiveDarkThreshold(gray,width,height,6,25);
  assert.equal(output[9*width+20],0);
  assert.equal(output[2*width+2],255);
});

test('portrait OCR uses two variants while landscape keeps all four',()=>{
  const source={};
  assert.equal(buildOcrVariants(source).length,2);
  assert.equal(buildOcrVariants(source,'landscape').length,4);
});
