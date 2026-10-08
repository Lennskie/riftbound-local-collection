import assert from 'node:assert/strict';
import test from 'node:test';
import {CaptureGate,DETECT_CONFIG,cardPresence,evaluateFrame,frameDifference,sharpness} from './detect.js';

function cardFrame(width=100,height=100){
  const pixels=new Uint8Array(width*height).fill(220);
  for(let y=3;y<height-3;y++){
    pixels[y*width+4]=20;
    pixels[y*width+width-5]=20;
  }
  for(let x=3;x<width-3;x++){
    pixels[4*width+x]=20;
    pixels[(height-5)*width+x]=20;
  }
  for(let y=49;y<65;y++){
    for(let x=7;x<93;x++) pixels[y*width+x]=(Math.floor((x-7)/3)%2)?30:230;
  }
  return pixels;
}

test('sharpness separates sharp detail from a blurred flat title band',()=>{
  const sharpPixels=new Uint8Array(20*20);
  for(let y=0;y<20;y++) for(let x=0;x<20;x++) sharpPixels[y*20+x]=(x%2)?255:0;
  const blurredPixels=new Uint8Array(20*20).fill(128);
  assert.ok(sharpness(sharpPixels,20,20)>sharpness(blurredPixels,20,20));
});

test('frame difference distinguishes a steady frame from a moving one',()=>{
  const previous=new Uint8Array(100).fill(50);
  assert.equal(frameDifference(previous,new Uint8Array(previous)),0);
  assert.equal(frameDifference(previous,new Uint8Array(100).fill(70)),20);
});

test('card presence requires card edges and title-band contrast',()=>{
  const card=cardFrame();
  assert.equal(cardPresence(card,100,100),true);
  assert.equal(cardPresence(new Uint8Array(10000).fill(120),100,100),false);
  const borderOnly=new Uint8Array(10000).fill(220);
  for(let index=0;index<100;index++){
    borderOnly[4*100+index]=20;
    borderOnly[95*100+index]=20;
    borderOnly[index*100+4]=20;
    borderOnly[index*100+95]=20;
  }
  assert.equal(cardPresence(borderOnly,100,100),false);
});

test('frame evaluation reports presence, focus and stability independently',()=>{
  const first=cardFrame();
  const steady=evaluateFrame(first,100,100,first);
  assert.equal(steady.present,true);
  assert.equal(steady.sharp,true);
  assert.equal(steady.steady,true);
  const moved=new Uint8Array(first).fill(0);
  assert.equal(evaluateFrame(moved,100,100,first).steady,false);
  assert.equal(DETECT_CONFIG.requiredFrames,4);
});

test('automatic capture requires consecutive good frames and motion before rearming',()=>{
  const gate=new CaptureGate(3);
  const good={present:true,sharp:true,steady:true,difference:0};
  assert.equal(gate.update(good),false);
  assert.equal(gate.update({...good,sharp:false}),false);
  assert.equal(gate.update(good),false);
  assert.equal(gate.update(good),false);
  assert.equal(gate.update(good),true);
  assert.equal(gate.update({...good,difference:Infinity}),false);
  gate.update(good);
  assert.equal(gate.update({present:false,sharp:false,steady:false,difference:0}),false);
  assert.equal(gate.update(good),false);
  assert.equal(gate.update(good),false);
  assert.equal(gate.update(good),true);
  assert.equal(gate.manualCapture(),true);
});
