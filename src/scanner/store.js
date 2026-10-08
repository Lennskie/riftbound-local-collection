import {normalizeForMatch} from './match.js';

const DATABASE_NAME='riftbound-scanner';
const STORE_NAME='catalog';
const RECORD_KEY='scannerIndex';

function openDatabase(indexedDB){
  return new Promise((resolve,reject)=>{
    const request=indexedDB.open(DATABASE_NAME,1);
    request.onupgradeneeded=()=>{
      if(!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
    };
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>reject(request.error||new Error('Could not open the scanner catalogue cache'));
  });
}

function readCachedIndex(db){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE_NAME,'readonly');
    let index=null;
    transaction.oncomplete=()=>resolve(index);
    transaction.onerror=()=>reject(transaction.error||new Error('Could not read the scanner catalogue cache'));
    transaction.onabort=()=>reject(transaction.error||new Error('Reading the scanner catalogue cache was aborted'));
    const request=transaction.objectStore(STORE_NAME).get(RECORD_KEY);
    request.onsuccess=()=>{index=request.result||null};
    request.onerror=()=>reject(request.error||new Error('Could not read the scanner catalogue cache'));
  });
}

function replaceCachedIndex(db,index){
  return new Promise((resolve,reject)=>{
    const transaction=db.transaction(STORE_NAME,'readwrite');
    transaction.oncomplete=resolve;
    transaction.onerror=()=>reject(transaction.error||new Error('Could not save the scanner catalogue cache'));
    transaction.onabort=()=>reject(transaction.error||new Error('Saving the scanner catalogue cache was aborted'));
    transaction.objectStore(STORE_NAME).put(index,RECORD_KEY);
  });
}

async function fetchJson(fetchImpl,url){
  const response=await fetchImpl(url,{cache:'no-store'});
  if(!response.ok) throw new Error(`Scanner catalogue request failed: HTTP ${response.status}`);
  return response.json();
}

function validateVersion(payload){
  if(!Number.isSafeInteger(payload?.version)||payload.version<0) throw new Error('Scanner catalogue version response is invalid');
  return payload.version;
}

function validateIndex(payload){
  if(!Number.isSafeInteger(payload?.version)||payload.version<0||
    !Array.isArray(payload.definitions)||!Array.isArray(payload.printings)){
    throw new Error('Scanner catalogue index response is invalid');
  }
  return {version:payload.version,definitions:payload.definitions,printings:payload.printings};
}

function buildLookups(index,source){
  const printingsByDefinition=new Map();
  for(const printing of index.printings){
    const printings=printingsByDefinition.get(printing.definition_key)||[];
    printings.push(printing);
    printingsByDefinition.set(printing.definition_key,printings);
  }
  const normalizedDefinitions=index.definitions.map(definition=>({
    ...definition,
    normalized_name:normalizeForMatch(definition.card_name)
  }));
  return {...index,printingsByDefinition,normalizedDefinitions,source};
}

export async function loadScannerCatalog({
  fetchImpl=globalThis.fetch,
  indexedDBImpl=globalThis.indexedDB
}={}){
  if(!indexedDBImpl) throw new Error('IndexedDB is unavailable; the scanner catalogue cannot be cached');
  const db=await openDatabase(indexedDBImpl);
  try{
    const cached=await readCachedIndex(db);
    let versionPayload;
    try{
      versionPayload=await fetchJson(fetchImpl,'/api/scanner/version');
    }catch(error){
      if(cached) return buildLookups(cached,'cache');
      throw new Error(`Scanner catalogue is unavailable: ${error.message}`,{cause:error});
    }
    const currentVersion=validateVersion(versionPayload);
    if(cached?.version===currentVersion) return buildLookups(cached,'cache');

    let indexPayload;
    try{
      indexPayload=await fetchJson(fetchImpl,'/api/scanner/index');
    }catch(error){
      if(cached) return buildLookups(cached,'cache');
      throw new Error(`Scanner catalogue is unavailable: ${error.message}`,{cause:error});
    }
    const downloaded=validateIndex(indexPayload);
    await replaceCachedIndex(db,downloaded);
    return buildLookups(downloaded,'network');
  }finally{
    db.close();
  }
}
