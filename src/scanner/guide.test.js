import assert from 'node:assert/strict';
import test from 'node:test';
import {getGuideGeometry,GUIDE_CONFIG,mapScreenRectToVideoRect} from './guide.js';

test('guide frames fit both card modes with the OCR bands inside their frames',()=>{
  const modes=[
    {name:'portrait',expectedRatio:'portrait',bands:2},
    {name:'landscape',expectedRatio:'landscape',bands:1}
  ];
  for(const {name,expectedRatio,bands} of modes){
    const {frame,titleBand,ocrBands}=getGuideGeometry(400,700,name);
    const ratio=frame.width/frame.height;
    assert.equal(ratio<1?'portrait':'landscape',expectedRatio,name);
    assert.equal(ocrBands.length,bands,name);
    for(const band of [titleBand,...ocrBands]){
      assert.ok(band.x>=frame.x,name);
      assert.ok(band.y>=frame.y,name);
      assert.ok(band.x+band.width<=frame.x+frame.width+1e-9,name);
      assert.ok(band.y+band.height<=frame.y+frame.height+1e-9,name);
    }
  }
  const portrait=getGuideGeometry(400,700,'portrait');
  const battlefield=getGuideGeometry(400,700,'landscape');
  const [unitBand,legendBand]=portrait.ocrBands;
  assert.ok(unitBand.y>portrait.frame.y+portrait.frame.height*0.45);
  assert.ok(unitBand.y<portrait.frame.y+portrait.frame.height*0.55);
  assert.ok(legendBand.y>portrait.frame.y+portrait.frame.height*0.65);
  assert.ok(battlefield.titleBand.y>battlefield.frame.y+battlefield.frame.height*0.5);
  assert.ok(battlefield.titleBand.y<battlefield.frame.y+battlefield.frame.height*0.65);
});

test('the highlighted title band covers every OCR band',()=>{
  const {titleBand,ocrBands}=getGuideGeometry(400,700,'portrait');
  for(const band of ocrBands){
    assert.ok(titleBand.y<=band.y+1e-9);
    assert.ok(titleBand.y+titleBand.height>=band.y+band.height-1e-9);
  }
});

test('there is no separate legend mode: an unknown mode falls back to the Cards layout',()=>{
  assert.equal(GUIDE_CONFIG.legend,undefined);
  assert.deepEqual(getGuideGeometry(400,700,'legend'),getGuideGeometry(400,700,'portrait'));
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
