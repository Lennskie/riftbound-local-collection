import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {bestMatch,buildMatcher} from './match.js';
import {loadScannerCatalog} from './store.js';
import {createOcrWorker} from './ocr.js';
import {addInventoryCard} from './inventory.js';
import {zoneForCard} from './zone.js';
import CameraCapture from './CameraCapture.jsx';

function validContainer(container){
  return Boolean(container?.container_id&&container.name&&['bulk','custom','premade'].includes(container.type));
}

function clampQuantity(value){
  return Math.max(1,Math.floor(Number(value)||1));
}

export default function CardScanner({
  container,
  initialQuantity=1,
  initialZone='main',
  onDone
}){
  const isValidContainer=validContainer(container);
  const [catalog,setCatalog]=useState(null);
  const [catalogError,setCatalogError]=useState('');
  const [catalogLoad,setCatalogLoad]=useState(0);
  const [ocrWorker,setOcrWorker]=useState(null);
  const [ocrLoad,setOcrLoad]=useState(0);
  const [ocrProgress,setOcrProgress]=useState('');
  const [ocrError,setOcrError]=useState('');
  const [current,setCurrent]=useState(null);
  const [mode,setMode]=useState('portrait');
  const [finish,setFinish]=useState('normal');
  const [quantity,setQuantity]=useState(()=>clampQuantity(initialQuantity));
  const [zone,setZone]=useState(initialZone==='sideboard'?'sideboard':'main');
  const [sessionCount,setSessionCount]=useState(0);
  const [resetKey,setResetKey]=useState(0);
  const [notice,setNotice]=useState('');
  const [actionError,setActionError]=useState('');
  const [saving,setSaving]=useState(false);
  const workerRef=useRef(null);
  const touchStartRef=useRef(null);
  const matcher=useMemo(()=>catalog?buildMatcher(catalog.definitions):null,[catalog]);

  useEffect(()=>{
    if(!isValidContainer) return undefined;
    let active=true;
    setCatalog(null);
    setCatalogError('');
    loadScannerCatalog().then(value=>{
      if(active) setCatalog(value);
    }).catch(error=>{
      if(active) setCatalogError(error.message);
    });
    return()=>{active=false};
  },[isValidContainer,catalogLoad]);

  useEffect(()=>{
    if(!isValidContainer||!catalog) return undefined;
    let active=true;
    let worker=null;
    setOcrWorker(null);
    setOcrError('');
    createOcrWorker(message=>{
      if(active&&message.status) setOcrProgress(`${message.status}${message.progress>0?` ${Math.round(message.progress*100)}%`:''}`);
    }).then(created=>{
      worker=created;
      if(active){
        workerRef.current=created;
        setOcrWorker(created);
      }else{
        void created.terminate().catch(error=>console.error('Failed to terminate OCR worker:',error));
      }
    }).catch(error=>{
      if(active) setOcrError(`OCR could not be started: ${error.message}`);
    });
    return()=>{
      active=false;
      workerRef.current=null;
      if(worker) void worker.terminate().catch(error=>console.error('Failed to terminate OCR worker:',error));
    };
  },[isValidContainer,catalog,ocrLoad]);

  useEffect(()=>{
    const closeOnEscape=event=>{
      if(event.key==='Escape') onDone?.();
    };
    window.addEventListener('keydown',closeOnEscape);
    return()=>window.removeEventListener('keydown',closeOnEscape);
  },[onDone]);

  const handleCapture=useCallback(async canvas=>{
    if(!catalog||!matcher||!workerRef.current) throw new Error('The scanner is still initializing');
    setActionError('');
    setNotice('');
    const text=await workerRef.current.recognize(canvas);
    const result=bestMatch(matcher,text);
    const definition=result&&catalog.definitions.find(item=>item.definition_key===result.definition_key);
    const printings=result&&catalog.printingsByDefinition.get(result.definition_key);
    if(!result||!definition||!printings?.length){
      setNotice("Couldn't read that card. Adjust it and try again.");
      setResetKey(key=>key+1);
      return;
    }
    setCurrent({definition,printings,printingIndex:0});
  },[catalog,matcher]);

  const retry=()=>{
    setCurrent(null);
    setActionError('');
    setNotice('');
    setResetKey(key=>key+1);
  };

  const addCurrent=async()=>{
    if(!current||saving) return;
    setSaving(true);
    setActionError('');
    const selectedPrinting=current.printings[current.printingIndex||0];
    const selectedZone=zoneForCard(current.definition.type_line,zone,container.type);
    try{
      await addInventoryCard(container.container_id,{
        printing_id:selectedPrinting.printing_id,
        quantity,
        finish,
        zone:selectedZone
      });
      setSessionCount(count=>count+quantity);
      setNotice(`Added ${quantity} × ${current.definition.card_name}.`);
      setQuantity(1);
      setCurrent(null);
      setResetKey(key=>key+1);
    }catch(error){
      setActionError(error.message);
    }finally{
      setSaving(false);
    }
  };

  const selectPrinting=index=>{
    if(!current?.printings.length) return;
    const length=current.printings.length;
    setCurrent(value=>({...value,printingIndex:(index+length)%length}));
  };

  useEffect(()=>{
    if(!current?.printings?.length||typeof Image==='undefined') return;
    const index=current.printingIndex||0;
    for(const offset of [-1,1]){
      const printing=current.printings[(index+offset+current.printings.length)%current.printings.length];
      if(printing?.image_url){
        const image=new Image();
        image.src=printing.image_url;
      }
    }
  },[current]);

  if(!isValidContainer){
    return <div role="alert" className="fixed inset-0 z-50 flex items-center justify-center bg-black p-5 text-white">A valid container must be selected before scanning.</div>;
  }

  const selectedPrinting=current?.printings[current.printingIndex||0];
  const singlePrinting=current?.printings.length===1;
  const forcedMain=current&&zoneForCard(current.definition.type_line,'sideboard',container.type)==='main';

  return <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-black text-white" style={{backgroundColor:'#07111a'}}>
    <header className="z-20 flex min-h-14 items-center justify-between gap-3 border-b border-slate-700 px-3 py-2" style={{backgroundColor:'#0b1720'}}>
      <button type="button" onClick={()=>onDone?.()} className="min-h-11 px-3 font-semibold">Done</button>
      <div className="min-w-0 flex-1 text-center">
        <div className="truncate font-semibold">{container.name}</div>
        <div className="text-xs text-slate-300">Added this session: {sessionCount}</div>
      </div>
      <span aria-hidden="true" className="w-14"/>
    </header>

    {catalogError?<div className="m-4 space-y-3 rounded-lg border border-red-700 bg-red-950/60 p-4" role="alert">
      <p>Catalogue unavailable: {catalogError}</p>
      <button type="button" onClick={()=>setCatalogLoad(value=>value+1)} className="min-h-11 rounded-lg bg-indigo-500 px-4">Try again</button>
    </div>:null}
    {ocrError&&<div className="m-4 space-y-3 rounded-lg border border-red-700 bg-red-950/60 p-4" role="alert">
      <p>{ocrError}</p>
      <button type="button" onClick={()=>{
        setOcrError('');
        if(ocrWorker) setResetKey(key=>key+1);
        else setOcrLoad(value=>value+1);
      }} className="min-h-11 rounded-lg bg-indigo-500 px-4">{ocrWorker?'Return to camera':'Retry OCR setup'}</button>
    </div>}
    {!catalog&&!catalogError&&<div className="m-4 text-center text-sm text-slate-200" role="status">Loading the local scanner catalogue…</div>}
    {!current&&catalog&&!ocrWorker&&!ocrError&&<div className="m-4 text-center text-sm text-slate-200" role="status">{ocrProgress||'Preparing on-device OCR…'}</div>}

    <div className="relative flex min-h-0 flex-1 flex-col">
      {catalog&&ocrWorker&&<CameraCapture
        enabled={isValidContainer}
        mode={mode}
        onModeChange={setMode}
        onCapture={handleCapture}
        onCaptureError={error=>{setOcrError(`Could not read the card: ${error.message}`);setResetKey(key=>key+1)}}
        resetKey={resetKey}
        paused={Boolean(current)||saving||Boolean(catalogError)||Boolean(ocrError)}
      />}

      {notice&&!current&&<div className="z-10 px-4 py-2 text-center text-sm text-amber-100" role="status">{notice}</div>}

      {current&&selectedPrinting&&<div className="absolute inset-0 z-10 flex flex-col overflow-y-auto" style={{backgroundColor:'rgba(4,10,15,.97)'}}>
        <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-4 pb-3 pt-3">
          <h1 className="mb-3 text-center text-2xl font-bold">{current.definition.card_name}</h1>
          <div className="flex min-h-0 flex-1 items-center justify-center gap-2">
            {!singlePrinting&&<button type="button" onClick={()=>selectPrinting((current.printingIndex||0)-1)} aria-label="Previous printing" className="min-h-11 px-3 text-2xl">‹</button>}
            <div className="flex min-h-0 flex-1 justify-center">
              {selectedPrinting.image_url
                ?<img src={selectedPrinting.image_url} alt={`${current.definition.card_name} printing artwork`} className="max-h-[38vh] max-w-full object-contain"/>
                :<div className="flex aspect-[744/1039] max-h-[38vh] items-center justify-center border border-slate-600 px-6 text-sm text-slate-300">Artwork unavailable</div>}
            </div>
            {!singlePrinting&&<button type="button" onClick={()=>selectPrinting((current.printingIndex||0)+1)} aria-label="Next printing" className="min-h-11 px-3 text-2xl">›</button>}
          </div>
          <div
            className="mt-2 text-center"
            onTouchStart={event=>{touchStartRef.current=event.changedTouches[0]?.clientX??null}}
            onTouchEnd={event=>{
              const start=touchStartRef.current;
              const end=event.changedTouches[0]?.clientX;
              touchStartRef.current=null;
              if(start!=null&&end!=null&&Math.abs(start-end)>45) selectPrinting((current.printingIndex||0)+(end<start?1:-1));
            }}
          >
            <div className="font-medium">{selectedPrinting.set_code} · #{selectedPrinting.collector_num}</div>
            <div className="text-sm text-slate-200">{[selectedPrinting.rarity,selectedPrinting.variant_label].filter(Boolean).join(' · ')||'Standard printing'}</div>
            <div className="text-xs text-slate-400">{selectedPrinting.printing_id}</div>
          </div>
          {!singlePrinting&&<div className="my-2 flex justify-center gap-2" aria-label={`Printing ${current.printingIndex+1} of ${current.printings.length}`}>
            {current.printings.map((printing,index)=><button key={printing.printing_id} type="button" onClick={()=>selectPrinting(index)} aria-label={`Show printing ${index+1}`} aria-current={index===current.printingIndex?'true':undefined} className={`h-3 w-3 border border-slate-300 ${index===current.printingIndex?'bg-white':'bg-transparent'}`}/>)}
          </div>}
          {actionError&&<div role="alert" className="my-2 rounded-lg border border-red-700 bg-red-950/60 p-3 text-sm">{actionError}</div>}
          <div className="mt-2 grid gap-3">
            <fieldset className="flex items-center justify-center gap-2">
              <legend className="sr-only">Finish</legend>
              {['normal','foil'].map(value=><button key={value} type="button" aria-pressed={finish===value} onClick={()=>setFinish(value)} className={`min-h-11 flex-1 border px-4 capitalize ${finish===value?'border-indigo-300 bg-indigo-600':'border-slate-600'}`}>{value}</button>)}
            </fieldset>
            <label className="flex items-center justify-center gap-3 text-sm">
              <span>Quantity</span>
              <button type="button" aria-label="Decrease quantity" onClick={()=>setQuantity(value=>Math.max(1,value-1))} className="min-h-11 min-w-11 border border-slate-600">−</button>
              <input type="number" min="1" step="1" value={quantity} onChange={event=>setQuantity(clampQuantity(event.target.value))} aria-label="Quantity to add" className="h-11 w-16 bg-white px-2 text-center text-black"/>
              <button type="button" aria-label="Increase quantity" onClick={()=>setQuantity(value=>value+1)} className="min-h-11 min-w-11 border border-slate-600">+</button>
            </label>
            {container.type!=='bulk'&&<label className="flex items-center justify-center gap-3 text-sm">
              <span>Zone</span>
              <select value={forcedMain?'main':zone} disabled={forcedMain} onChange={event=>setZone(event.target.value)} className="min-h-11 border border-slate-600 bg-white px-3 text-black">
                <option value="main">Main deck</option><option value="sideboard">Sideboard</option>
              </select>
              {forcedMain&&<span className="text-xs text-slate-300">Always main</span>}
            </label>}
          </div>
          <div className="sticky bottom-0 mt-auto flex gap-3 py-3" style={{backgroundColor:'rgba(4,10,15,.97)'}}>
            <button type="button" onClick={retry} className="min-h-12 flex-1 border border-slate-400 font-semibold">RETRY</button>
            <button type="button" disabled={saving} onClick={addCurrent} className="min-h-12 flex-1 bg-indigo-500 font-semibold disabled:opacity-50">{saving?'Adding…':'ADD'}</button>
          </div>
        </div>
      </div>}
    </div>
  </div>;
}
