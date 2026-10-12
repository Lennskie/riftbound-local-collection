import assert from 'node:assert/strict';
import test from 'node:test';
import {addInventoryCard} from './inventory.js';

test('inventory helper posts the selected printing and inventory fields to the bulk endpoint',async()=>{
  const originalFetch=globalThis.fetch;
  let request;
  globalThis.fetch=async(url,options)=>{
    request={url,options};
    return {ok:true,json:async()=>({added:1})};
  };
  try{
    const result=await addInventoryCard('container/id',{
      printing_id:'print-1',quantity:2,finish:'foil',zone:'sideboard'
    });
    assert.deepEqual(result,{added:1});
    assert.equal(request.url,'/api/containers/container%2Fid/inventory/bulk');
    assert.equal(request.options.method,'POST');
    assert.equal(request.options.cache,'no-store');
    assert.equal(request.options.headers['Content-Type'],'application/json');
    assert.deepEqual(JSON.parse(request.options.body),{cards:[{
      printing_id:'print-1',quantity:2,finish:'foil',zone:'sideboard'
    }]});
  }finally{
    globalThis.fetch=originalFetch;
  }
});

test('inventory helper surfaces server validation errors',async()=>{
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({
    ok:false,status:400,json:async()=>({error:'Deck limit exceeded'})
  });
  try{
    await assert.rejects(addInventoryCard('container',{printing_id:'print-1',quantity:1,finish:'normal',zone:'main'}),/Deck limit exceeded/);
  }finally{
    globalThis.fetch=originalFetch;
  }
});
