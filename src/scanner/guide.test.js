import assert from 'node:assert/strict';
import test from 'node:test';
import {getGuideGeometry,mapScreenRectToVideoRect} from './guide.js';

test('guide frames fit portrait and landscape cards with title bands inside the card',()=>{
  const portrait=getGuideGeometry(400,700,'portrait');
  const landscape=getGuideGeometry(400,700,'landscape');
  assert.ok(portrait.frame.width/portrait.frame.height<1);
  assert.ok(landscape.frame.width/landscape.frame.height>1);
  assert.ok(portrait.titleBand.y>portrait.frame.y+portrait.frame.height*0.45);
  assert.ok(portrait.titleBand.y<portrait.frame.y+portrait.frame.height*0.55);
  assert.ok(portrait.titleBand.x>=portrait.frame.x);
  assert.ok(portrait.titleBand.x+portrait.titleBand.width<=portrait.frame.x+portrait.frame.width);
});

test('screen crop mapping accounts for object-fit cover cropping',()=>{
  const mapped=mapScreenRectToVideoRect(
    {x:100,y:300,width:200,height:40},
    400,800,1920,1080
  );
  assert.ok(mapped);
  assert.ok(mapped.x>0);
  assert.ok(mapped.y>400);
  assert.ok(mapped.width<300);
});
