import assert from 'node:assert/strict';
import test from 'node:test';
import {getGuideGeometry,mapScreenRectToVideoRect} from './guide.js';

test('guide frames fit all card modes with title bands inside their frames',()=>{
  const modes=[
    {name:'portrait',expectedRatio:'portrait'},
    {name:'legend',expectedRatio:'portrait'},
    {name:'landscape',expectedRatio:'landscape'}
  ];
  for(const {name,expectedRatio} of modes){
    const {frame,titleBand}=getGuideGeometry(400,700,name);
    const ratio=frame.width/frame.height;
    assert.equal(ratio<1?'portrait':'landscape',expectedRatio,name);
    assert.ok(titleBand.x>=frame.x,name);
    assert.ok(titleBand.y>=frame.y,name);
    assert.ok(titleBand.x+titleBand.width<=frame.x+frame.width,name);
    assert.ok(titleBand.y+titleBand.height<=frame.y+frame.height,name);
  }
  const portrait=getGuideGeometry(400,700,'portrait');
  const legend=getGuideGeometry(400,700,'legend');
  const battlefield=getGuideGeometry(400,700,'landscape');
  assert.ok(portrait.titleBand.y>portrait.frame.y+portrait.frame.height*0.45);
  assert.ok(portrait.titleBand.y<portrait.frame.y+portrait.frame.height*0.55);
  assert.ok(legend.titleBand.y>legend.frame.y+legend.frame.height*0.65);
  assert.ok(battlefield.titleBand.y>battlefield.frame.y+battlefield.frame.height*0.5);
  assert.ok(battlefield.titleBand.y<battlefield.frame.y+battlefield.frame.height*0.65);
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
