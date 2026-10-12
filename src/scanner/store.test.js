import assert from 'node:assert/strict';
import test from 'node:test';
import {loadScannerCatalog} from './store.js';

function memoryIndexedDB(){
  const records=new Map();
  const stores=new Set();
  let writes=0;
  return {
    get writes(){return writes},
    open(){
      const request={};
      queueMicrotask(()=>{
        const database={
          objectStoreNames:{contains:name=>stores.has(name)},
          createObjectStore:name=>stores.add(name),
          transaction(_name){
            const transaction={};
            transaction.objectStore=()=>({
              get(key){
                const result={};
                queueMicrotask(()=>{
                  result.result=records.get(key);
                  result.onsuccess?.();
                  transaction.oncomplete?.();
                });
                return result;
              },
              put(value,key){
                writes++;
                queueMicrotask(()=>{
                  records.set(key,structuredClone(value));
                  transaction.oncomplete?.();
                });
              }
            });
            return transaction;
          },
          close(){}
        };
        request.result=database;
        if(!stores.has('catalog')) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };
}

const index=(version,name='Unit')=>({
  version,
  definitions:[{definition_key:name.toLowerCase(),card_name:name,type_line:'Unit'}],
  printings:[{printing_id:`${name}-1`,definition_key:name.toLowerCase()}]
});
const response=body=>({ok:true,json:async()=>body});

test('downloads a changed index and stores the version in its response atomically',async()=>{
  const indexedDBImpl=memoryIndexedDB();
  const calls=[];
  const result=await loadScannerCatalog({
    indexedDBImpl,
    fetchImpl:async(url,options)=>{calls.push({url,options});return response(url.endsWith('/version')?{version:2}:index(3))}
  });
  assert.equal(result.version,3);
  assert.equal(result.source,'network');
  assert.equal(result.printingsByDefinition.get('unit').length,1);
  assert.equal(result.normalizedDefinitions[0].normalized_name,'unit');
  assert.equal(indexedDBImpl.writes,1);
  assert.deepEqual(calls.map(call=>call.url),['/api/scanner/version','/api/scanner/index']);
  assert.ok(calls.every(call=>call.options.cache==='no-store'));
});

test('same version avoids index download and all IndexedDB writes',async()=>{
  const indexedDBImpl=memoryIndexedDB();
  await loadScannerCatalog({indexedDBImpl,fetchImpl:async url=>response(url.endsWith('/version')?{version:4}:index(5))});
  const calls=[];
  const cached=await loadScannerCatalog({
    indexedDBImpl,
    fetchImpl:async url=>{calls.push(url);return response({version:5})}
  });
  assert.equal(cached.version,5);
  assert.equal(cached.source,'cache');
  assert.deepEqual(calls,['/api/scanner/version']);
  assert.equal(indexedDBImpl.writes,1);
});

test('cached catalogue remains available when the server cannot be reached',async()=>{
  const indexedDBImpl=memoryIndexedDB();
  await loadScannerCatalog({indexedDBImpl,fetchImpl:async url=>response(url.endsWith('/version')?{version:1}:index(1))});
  const cached=await loadScannerCatalog({indexedDBImpl,fetchImpl:async()=>{throw new Error('offline')}});
  assert.equal(cached.version,1);
  assert.equal(cached.source,'cache');
  assert.equal(indexedDBImpl.writes,1);
});

test('unavailable server and empty cache reports an explicit error',async()=>{
  await assert.rejects(
    loadScannerCatalog({indexedDBImpl:memoryIndexedDB(),fetchImpl:async()=>{throw new Error('offline')}}),
    /Scanner catalogue is unavailable: offline/
  );
});
