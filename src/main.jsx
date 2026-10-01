import React, {useEffect, useState} from 'react';
import QRCode from 'qrcode';
import {createRoot} from 'react-dom/client';
import './index.css';

const api = async (path, options={}) => {
  const r = await fetch(path, {headers:{'Content-Type':'application/json', ...(options.headers||{})}, ...options});
  const data = await r.json().catch(()=>({}));
  if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
  return data;
};

function App(){
  const boxMatch=window.location.pathname.match(/^\/box\/([^/]+)\/?$/);
  if(boxMatch) return <BoxPage id={boxMatch[1]}/>;
  const [tab,setTab]=useState('dashboard');
  const [containers,setContainers]=useState([]);
  const [catalog,setCatalog]=useState({status:'empty'});
  const [error,setError]=useState('');
  const refresh=async()=>{try{setError(''); const [c,s]=await Promise.all([api('/api/containers'),api('/api/catalog/status')]); setContainers(c.containers);setCatalog(s);}catch(e){setError(e.message)}};
  useEffect(()=>{refresh()},[]);
  const tabs=[['dashboard','Dashboard'],['cards','Cards'],['search','Location Search'],['containers','Containers'],['scan','QR Scanner']];
  return <div className="min-h-screen">
    <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/95 backdrop-blur"><div className="mx-auto max-w-7xl px-4 py-4 flex items-center gap-4"><div><div className="text-xl font-bold">Riftbound</div><div className="text-xs text-slate-400">Local Collection Manager</div></div><nav className="ml-auto flex flex-wrap gap-1">{tabs.map(([id,label])=><button key={id} onClick={()=>setTab(id)} className={`px-3 py-2 rounded-lg text-sm ${tab===id?'bg-indigo-500 text-white':'text-slate-300 hover:bg-slate-800'}`}>{label}</button>)}</nav></div></header>
    {error&&<div className="mx-auto max-w-7xl px-4 pt-4"><div className="rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200">{error}</div></div>}
    <main className="mx-auto max-w-7xl p-4">{tab==='dashboard'&&<Dashboard containers={containers} catalog={catalog} refresh={refresh}/>} {tab==='cards'&&<Cards containers={containers}/>} {tab==='search'&&<LocationSearch/>} {tab==='containers'&&<Containers containers={containers} refresh={refresh}/>} {tab==='scan'&&<Scanner/>}</main>
  </div>
}


function BoxPage({id}){
  const [data,setData]=useState(null);
  const [locations,setLocations]=useState([]);
  const [err,setErr]=useState('');
  const [busy,setBusy]=useState(false);
  const [moveTarget,setMoveTarget]=useState(id);
  const [moveZone,setMoveZone]=useState('sideboard');
  const [notice,setNotice]=useState('');
  const [riftatlasText,setRiftatlasText]=useState('');
  const [riftatlasPreview,setRiftatlasPreview]=useState(null);
  const [baseUrl,setBaseUrl]=useState(window.location.origin);
  const load=async()=>{
    try{const [next,all]=await Promise.all([api(`/api/containers/${id}`),api('/api/containers')]);setData(next);setLocations(all.containers);setErr('');return true}
    catch(e){setErr(e.message);return false}
  };
  useEffect(()=>{api('/api/config').then(x=>x.base_url&&setBaseUrl(x.base_url)).catch(()=>{})},[]);
  useEffect(()=>{load()},[]);
  const label=async()=>{if(!data)return;const url=`${baseUrl.replace(/\/$/,'')}/box/${id}`;const canvas=document.createElement('canvas');await QRCode.toCanvas(canvas,url,{width:600,margin:2});const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=`${data.container.name}-qr.png`;a.click()};
  const addCard=async(printing_id,quantity,finish,zone)=>{
    setBusy(true);
    try{
      await api(`/api/containers/${id}/inventory/bulk`,{method:'POST',body:JSON.stringify({cards:[{printing_id,quantity,finish,zone}]})});
      await load();
      return true;
    }catch(e){setErr(e.message);return false}finally{setBusy(false)}
  };
  const changeQuantity=async(card,quantity)=>{
    setBusy(true);
    try{
      await api(`/api/containers/${id}/inventory`,{method:'PUT',body:JSON.stringify({printing_id:card.printing_id,finish:card.finish,zone:card.zone,quantity})});
      await load();
    }catch(e){setErr(e.message)}finally{setBusy(false)}
  };
  const removeCard=async card=>{
    setBusy(true);
    try{
      await api(`/api/containers/${id}/inventory?printing_id=${encodeURIComponent(card.printing_id)}&finish=${encodeURIComponent(card.finish)}&zone=${encodeURIComponent(card.zone)}`,{method:'DELETE'});
      await load();
    }catch(e){setErr(e.message)}finally{setBusy(false)}
  };
  const lockDeck=async()=>{
    setBusy(true);setNotice('');
    try{const result=await api(`/api/containers/${id}/lock`,{method:'POST'});await load();setNotice(`Deck list locked with ${result.requirements} card definitions.`)}
    catch(e){setErr(e.message)}finally{setBusy(false)}
  };
  const previewImport=async()=>{
    setBusy(true);setErr('');setNotice('');setRiftatlasPreview(null);
    try{setRiftatlasPreview(await api(`/api/containers/${id}/riftatlas/preview`,{method:'POST',body:JSON.stringify({text:riftatlasText})}))}
    catch(e){setErr(e.message)}finally{setBusy(false)}
  };
  const importDeck=async()=>{
    if(!riftatlasPreview?.ready)return;
    if(!window.confirm('Replace this container inventory with the pasted Riftatlas deck and lock its main-deck list?'))return;
    setBusy(true);setErr('');setNotice('');
    try{const result=await api(`/api/containers/${id}/riftatlas/import`,{method:'POST',body:JSON.stringify({text:riftatlasText})});await load();setNotice(`Imported ${result.imported} card definitions and locked the premade deck.`);setRiftatlasPreview(null);setRiftatlasText('')}
    catch(e){setErr(e.message)}finally{setBusy(false)}
  };
  const transfer=async({from,to,printing_id,finish,from_zone='main',to_zone='main',quantity})=>{
    setBusy(true);setErr('');
    try{await api('/api/transfer',{method:'POST',body:JSON.stringify({from_container_id:from,to_container_id:to,printing_id,finish,from_zone,to_zone,quantity})});await load();return true}
    catch(e){setErr(e.message);return false}finally{setBusy(false)}
  };
  const restoreSource=async(source,shortfall)=>{
    const quantity=Math.min(source.quantity,shortfall.shortfall);
    if(await transfer({from:source.container_id,to:id,printing_id:source.printing_id,finish:source.finish,from_zone:source.zone,to_zone:'main',quantity}))setNotice(`Moved ${quantity} × ${shortfall.card_name} from ${source.container_name}.`);
  };
  const moveCard=async card=>{
    if(!moveTarget)return setErr('Choose a destination container first.');
    const quantity=1;
    const destination=locations.find(container=>container.container_id===moveTarget);
    const toZone=moveTarget===id?(card.zone==='main'?'sideboard':'main'):(destination?.type==='bulk'?'main':moveZone);
    if(await transfer({from:id,to:moveTarget,printing_id:card.printing_id,finish:card.finish,from_zone:card.zone,to_zone:toZone,quantity}))setNotice(`Moved ${quantity} × ${card.card_name} to ${destination?.name||'container'}${destination?.type==='bulk'?'':` (${toZone==='main'?'main deck':'sideboard'})`}.`);
  };
  if(!data)return <main className="mx-auto max-w-6xl space-y-4 p-6">{err&&<div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200"><span>{err}</span><button aria-label="Dismiss error" onClick={()=>setErr('')} className="text-red-200 hover:text-white">×</button></div>}<div>{err?<button onClick={load} className="rounded-lg bg-slate-800 px-3 py-2">Retry</button>:'Loading…'}</div></main>;
  return <main className="mx-auto max-w-6xl p-4 flex flex-col space-y-6">
    {err&&<div role="alert" className="flex items-start justify-between gap-4 rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200"><span>{err}</span><button aria-label="Dismiss error" onClick={()=>setErr('')} className="text-red-200 hover:text-white">×</button></div>}
    {notice&&<div role="status" className="flex items-start justify-between gap-4 rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-200"><span>{notice}</span><button aria-label="Dismiss message" onClick={()=>setNotice('')} className="text-emerald-200 hover:text-white">×</button></div>}
    <div className="flex flex-wrap items-center gap-3"><a className="text-indigo-300" href="/">← Home</a><div className="ml-auto flex gap-2"><button onClick={label} className="rounded-lg bg-indigo-500 px-4 py-2">Generate 2&quot; QR label</button><button onClick={()=>window.print()} className="rounded-lg bg-slate-800 px-4 py-2">Print</button></div></div>
    <section className="glass rounded-2xl p-5"><h1 className="text-3xl font-bold">{data.container.name}</h1><p className="text-slate-400">{data.container.type} · {data.container.description||'No description'}</p></section>
    {data.container.type==='premade'&&<section className="glass order-7 rounded-xl p-4 space-y-3">
      <h2 className="mb-3 font-semibold">Import Riftatlas decklist</h2>
      <p className="mt-1 text-sm text-slate-400">Paste the complete Riftatlas text export. Preview checks card names and limits before replacing this container and locking its main deck.</p>
      <textarea rows="14" className="w-full rounded-lg border border-slate-700 bg-slate-900 p-3 font-mono text-sm" placeholder={'Legend:\n1 Lux, Lady of Luminosity\n\nChampion:\n1 Lux, Crownguard\n\nMainDeck:\n3 Back to Back\n\nBattlefields:\n1 Abandoned Hall\n\nRunes:\n6 Mind Rune\n\nSideboard:'} value={riftatlasText} onChange={e=>{setRiftatlasText(e.target.value);setRiftatlasPreview(null)}}/><div className="flex flex-wrap gap-3"><button disabled={busy||!riftatlasText.trim()} onClick={previewImport} className="rounded-lg bg-slate-700 px-4 py-2 font-medium disabled:opacity-50">Preview list</button>{riftatlasPreview?.ready&&<button disabled={busy} onClick={importDeck} className="rounded-lg bg-indigo-500 px-4 py-2 font-medium disabled:opacity-50">Replace contents and import</button>}</div>{riftatlasPreview&&<div className="space-y-2 rounded-lg border border-slate-700 p-3" aria-live="polite"><div className={riftatlasPreview.ready?'text-emerald-300':'text-amber-300'}>{riftatlasPreview.ready?`Ready: ${riftatlasPreview.cards.length} card definitions matched.`:'Import needs attention.'}</div>{riftatlasPreview.deck_rules&&<div className="text-sm text-slate-300">Main {riftatlasPreview.deck_rules.summary.main}/40 · Runes {riftatlasPreview.deck_rules.summary.runes}/12 · Legends {riftatlasPreview.deck_rules.summary.legends}/1 · Battlefields {riftatlasPreview.deck_rules.summary.battlefields}/3 · Sideboard {riftatlasPreview.deck_rules.summary.sideboard}/10</div>}{riftatlasPreview.deck_rules.warnings.map(message=><div key={message} className="text-sm text-amber-200">{message}</div>)}{riftatlasPreview.missing.length>0&&<div className="text-sm text-amber-200">Not found in catalog: {riftatlasPreview.missing.map(card=>card.card_name).join(', ')}</div>}{riftatlasPreview.errors.map(message=><div key={message} className="text-sm text-red-300">{message}</div>)}{riftatlasPreview.deck_rules.violations.map(message=><div key={message} className="text-sm text-red-300">{message}</div>)}</div>}</section>}
    {data.deck_rules&&<section className="glass order-5 rounded-xl p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-semibold">Locked deck list</h2><p className="mt-1 text-sm text-slate-400">{data.container.deck_locked_at?`Locked ${new Date(data.container.deck_locked_at).toLocaleString()}. Scanning this QR shows missing cards and their current locations.`:'Lock the current main deck as its expected list. Sideboard cards are not included.'}</p></div><button disabled={busy||data.inventory.filter(card=>card.zone==='main'&&card.current_quantity>0).length===0} onClick={lockDeck} className="rounded-lg bg-indigo-500 px-4 py-2 font-medium disabled:opacity-50">{data.container.deck_locked_at?'Update locked list':'Lock current deck'}</button></div></section>}
    {data.deck_rules&&<section className="glass order-2 rounded-xl p-4"><h2 className="mb-3 font-semibold">Deck limits</h2>{data.deck_rules.warnings.length>0&&<div role="status" className="mb-3 rounded-lg border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">Review deck size: {data.deck_rules.warnings.join(' ')}</div>}<div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5"><DeckCount label="Main deck" count={data.deck_rules.summary.main} limit={40}/><DeckCount label="Runes" count={data.deck_rules.summary.runes} limit={12}/><DeckCount label="Legends" count={data.deck_rules.summary.legends} limit={1}/><DeckCount label="Battlefields" count={data.deck_rules.summary.battlefields} limit={3}/><DeckCount label="Sideboard" count={data.deck_rules.summary.sideboard} limit={10}/></div>{data.deck_rules.violations.length>0&&<ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-red-300">{data.deck_rules.violations.map(rule=><li key={rule}>{rule}</li>)}</ul>}</section>}
    {data.deck_rules&&<section className="glass order-3 rounded-xl p-4"><h2 className="font-semibold">Move cards</h2><p className="mt-1 text-sm text-slate-400">Choose a destination, then use the button beside the card.</p><div className="mt-3 flex flex-wrap items-end gap-3"><label className="min-w-52 flex-1 text-sm text-slate-400">Destination container<select aria-label="Move destination" className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" value={moveTarget} onChange={e=>setMoveTarget(e.target.value)}><option value="">Choose destination</option>{locations.map(location=><option key={location.container_id} value={location.container_id}>{location.name} ({location.type})</option>)}</select></label>{moveTarget===id?<p className="text-sm text-slate-400">Within this deck, cards move to the other zone.</p>:locations.find(location=>location.container_id===moveTarget)?.type==='bulk'?<p className="text-sm text-slate-400">Destination zone: Cards</p>:<label className="text-sm text-slate-400">Destination zone<select aria-label="Move destination zone" className="mt-1 block rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white" value={moveZone} onChange={e=>setMoveZone(e.target.value)}><option value="main">Main deck</option><option value="sideboard">Sideboard</option></select></label>}</div></section>}
    {(data.container.type==='bulk'?['main']:['main','sideboard']).map(zone=>{const cards=data.inventory.filter(card=>card.zone===zone&&card.current_quantity>0).sort((a,b)=>{if(zone==='main'){const rank=type=>{const value=String(type||'').toLowerCase();return value.includes('legend')?0:value.includes('rune')?2:value.includes('battlefield')?3:1};const difference=rank(a.type_line)-rank(b.type_line);if(difference)return difference}return a.card_name.localeCompare(b.card_name)});const destination=locations.find(container=>container.container_id===moveTarget);const zoneName=destination?.type==='bulk'?'Cards':moveTarget===id?(zone==='main'?'Sideboard':'Main deck'):moveZone==='main'?'Main deck':'Sideboard';const moveLabel=moveTarget===id?`Move 1 to ${zoneName}`:`Move 1 to ${destination?.name||'destination'} · ${zoneName}`;return <section key={zone} className="order-4"><h2 className="mb-3 font-semibold">{zone==='main'?(data.container.type==='bulk'?'Cards':'Main deck'):'Sideboard'} <span className="text-sm font-normal text-slate-500">({cards.reduce((total,card)=>total+card.current_quantity,0)} cards)</span></h2><div className="space-y-2">{cards.map(x=><div key={`${x.printing_id}-${x.finish}-${x.zone}`} className="glass rounded-xl p-3 flex flex-wrap items-center gap-3"><img src={x.image_url} className="h-20 w-14 object-cover rounded"/><div className="min-w-0 flex-1"><div className="font-medium">{x.card_name}</div><div className="text-xs text-slate-500">{x.printing_id} · {x.finish} · {x.current_quantity} copies</div></div>{data.deck_rules&&<button disabled={busy||!moveTarget} onClick={()=>moveCard(x)} className="rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium disabled:opacity-50">{moveLabel}</button>}<div className="flex gap-2"><button disabled={busy} onClick={()=>changeQuantity(x,x.current_quantity-1)} className="rounded-lg bg-slate-800 px-3 py-2 text-sm disabled:opacity-50">Remove 1</button><button disabled={busy} onClick={()=>removeCard(x)} className="rounded-lg border border-red-900 px-3 py-2 text-sm text-red-200 hover:bg-red-950/60 disabled:opacity-50">Remove all</button></div></div>)}{!cards.length&&<div className="text-slate-500">No cards in this {data.container.type==='bulk'?'container':zone==='main'?'deck':'sideboard'}.</div>}</div></section>})}
    {data.container.deck_locked_at&&<section className="order-1 space-y-3"><div><h2 className="font-semibold">Missing from locked list</h2><p className="text-sm text-slate-400">Available copies elsewhere are listed below. Move them here to restore the deck.</p></div>{data.shortfalls?.length>0?data.shortfalls.map(item=><div key={item.definition_key} className="glass rounded-xl p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-medium">{item.card_name}</div><div className="text-sm text-amber-300">Missing {item.shortfall} of {item.required_quantity}</div></div></div>{item.sources.length>0?<div className="mt-3 space-y-2">{item.sources.map(source=>{const quantity=Math.min(source.quantity,item.shortfall);return <div key={`${source.container_id}-${source.printing_id}-${source.finish}-${source.zone}`} className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-800 p-2"><div className="min-w-0 flex-1 text-sm"><span className="font-medium">{source.container_name}</span><span className="text-slate-500"> · {source.quantity} available · {source.finish}{source.zone==='sideboard'?' · sideboard':''} · {source.set_code} #{source.collector_num}</span></div><button disabled={busy} onClick={()=>restoreSource(source,item)} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium disabled:opacity-50">Move {quantity} to deck</button></div>})}</div>:<p className="mt-3 text-sm text-slate-500">No matching copies are currently stored in another container.</p>}</div>):<div className="rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-200">The locked main deck is complete.</div>}</section>}
  </main>;
}

function DeckCount({label,count,limit}){return <div><div className="text-slate-400">{label}</div><div className={count>limit?'text-red-300':'font-medium'}>{count} / {limit}</div></div>}

function CardSearch({onAdd,disabled=false,deckType='custom'}){
  const [query,setQuery]=useState('');
  const [rows,setRows]=useState([]);
  const [quantity,setQuantity]=useState(1);
  const [finish,setFinish]=useState('normal');
  const [zone,setZone]=useState('main');
  const [adding,setAdding]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    if(query.trim().length<2){setRows([]);return}
    const timer=setTimeout(()=>api(`/api/cards?q=${encodeURIComponent(query)}&limit=20`).then(d=>setRows(d.cards||[])).catch(e=>setMessage(e.message)),250);
    return()=>clearTimeout(timer);
  },[query]);
  const submit=async card=>{
    setAdding(card.printing_id);setMessage('');
    const type=String(card.type_line||'').toLowerCase();
    const cardZone=type.includes('rune')||type.includes('legend')||type.includes('battlefield')?'main':zone;
    const ok=await onAdd(card.printing_id,quantity,finish,cardZone);
    setMessage(ok?`Added ${quantity} × ${card.card_name}.`:'Could not add card.');
    setAdding('');
  };
  return <div className="space-y-3">
    <input className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" placeholder="Search card name…" value={query} onChange={e=>setQuery(e.target.value)}/>
    <div className="grid gap-3 sm:grid-cols-[140px_160px_180px]">
      <label className="text-sm text-slate-400">Quantity<input type="number" min="1" step="1" className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" value={quantity} onChange={e=>setQuantity(Math.max(1,Number(e.target.value)||1))}/></label>
      <label className="text-sm text-slate-400">Finish<select className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" value={finish} onChange={e=>setFinish(e.target.value)}><option value="normal">Normal</option><option value="foil">Foil</option></select></label>
      {deckType!=='bulk'&&<label className="text-sm text-slate-400">Zone<select className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" value={zone} onChange={e=>setZone(e.target.value)}><option value="main">Main deck</option><option value="sideboard">Sideboard</option></select></label>}
    </div>
    {message&&<div className="text-sm text-slate-300" role="status">{message}</div>}
    {rows.length>0&&<div className="max-h-96 space-y-2 overflow-y-auto">{rows.map(card=><div key={card.printing_id} className="flex items-center gap-3 rounded-lg border border-slate-800 p-2"><img src={card.image_url||''} alt="" className="h-16 w-12 rounded object-cover"/><div className="min-w-0 flex-1"><div className="truncate text-sm font-medium">{card.card_name}</div><div className="text-xs text-slate-500">{card.set_code} #{card.collector_num} · {card.printing_id}</div></div><button disabled={disabled||adding===card.printing_id} onClick={()=>submit(card)} className="rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium disabled:opacity-50">{adding===card.printing_id?'Adding…':'Add'}</button></div>)}</div>}
    {query.trim().length>=2&&!rows.length&&!message&&<div className="text-sm text-slate-500">No matching cards.</div>}
  </div>;
}

function LocationSearch(){
  const [query,setQuery]=useState('');
  const [results,setResults]=useState([]);
  const [error,setError]=useState('');
  const [selection,setSelection]=useState(null);
  useEffect(()=>{
    if(query.trim().length<2){setResults([]);setSelection(null);return}
    const timer=setTimeout(()=>api(`/api/search?q=${encodeURIComponent(query)}`).then(r=>{const owned=(r.results||[]).filter(row=>row.container_id && Number(row.current_quantity ?? 0)>0);setResults(owned);setSelection(null);}).catch(e=>setError(e.message)),250);
    return()=>clearTimeout(timer);
  },[query]);
  const groups=Object.values(results.reduce((acc,row)=>{
    const key=row.printing_id||`${row.card_name}-${row.set_code}-${row.collector_num}`;
    if(!acc[key]){
      acc[key]={
        key,
        card_name:row.card_name,
        set_code:row.set_code,
        collector_num:row.collector_num,
        printing_id:row.printing_id,
        image_url:row.image_url,
        owned_quantity:0,
        containers:[]
      };
    }
    acc[key].owned_quantity+=Number(row.current_quantity)||0;
    const existing=acc[key].containers.find(c=>c.id===row.container_id);
    if(!existing){acc[key].containers.push({id:row.container_id,name:row.container_name,type:row.container_type});}
    return acc;
  },{}));
  return <section className="max-w-5xl space-y-5"><h1 className="text-3xl font-bold">Location-aware card search</h1><p className="text-slate-400">Search by card name or definition key to find which containers currently hold matching copies.</p><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search card name or definition key…" className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-3" />{error&&<div className="rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200">{error}</div>}{query.trim().length>=2&&groups.length===0&&!error&&<div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 text-sm text-slate-400">No owned matches found for “{query}”.</div>}{groups.length>0&&<div className="space-y-3">{groups.map(item=><button key={item.key} type="button" onClick={()=>{if(item.containers.length===1){window.location.assign(`/box/${item.containers[0].id}`);return;}setSelection({card_name:item.card_name,containers:item.containers});}} className="glass block w-full rounded-xl p-3 text-left"><div className="flex items-center gap-3"><img src={item.image_url||''} alt={item.card_name} className="h-20 w-14 rounded object-cover"/><div className="min-w-0 flex-1"><div className="font-medium">{item.card_name}</div><div className="text-xs text-slate-500">{item.set_code} #{item.collector_num} · {item.printing_id}</div></div></div><div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-300"><span className="rounded-full bg-slate-800 px-2.5 py-1">{item.owned_quantity} {item.owned_quantity===1?'copy':'copies'} owned</span><span className="rounded-full bg-slate-800 px-2.5 py-1">{item.containers.length} storage location{item.containers.length===1?'':'s'}</span>{item.containers.map(container=><span key={`${item.key}-${container.id}`} className="rounded-full bg-slate-800 px-2.5 py-1">{container.name}</span>)}</div></button>)}</div>}{selection&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4"><div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-semibold">Choose a storage box</h2><p className="mt-2 text-sm text-slate-400">{selection.card_name} is stored in multiple containers.</p><div className="mt-4 space-y-2">{selection.containers.map(container=><button key={container.id} type="button" onClick={()=>{window.location.assign(`/box/${container.id}`);}} className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-left hover:border-indigo-500">{container.name} <span className="text-slate-400">({container.type})</span></button>)}</div><button type="button" onClick={()=>setSelection(null)} className="mt-4 rounded-lg bg-slate-700 px-3 py-2 text-sm">Cancel</button></div></div>}</section>;
}

function Dashboard({containers,catalog,refresh}){const [syncing,setSyncing]=useState(false); const sync=async()=>{setSyncing(true);try{await api('/api/catalog/sync',{method:'POST'});await refresh()}finally{setSyncing(false)}}; return <div className="space-y-6"><section><h1 className="text-3xl font-bold">Collection dashboard</h1><p className="mt-1 text-slate-400">Everything stays on this machine. Catalog artwork remains remote.</p></section><div className="grid gap-4 md:grid-cols-3"><Stat title="Containers" value={containers.length}/><Stat title="Catalog" value={catalog.status}/><Stat title="Last sync" value={catalog.last_sync||'Never'}/></div><section className="glass rounded-2xl p-5"><div className="flex items-center justify-between gap-4"><div><h2 className="font-semibold">Catalog synchronization</h2><p className="text-sm text-slate-400 mt-1">Rifthunt bulk data is fetched into the local SQLite catalog.</p></div><button disabled={syncing} onClick={sync} className="rounded-lg bg-indigo-500 px-4 py-2 font-medium disabled:opacity-50">{syncing?'Syncing…':'Sync now'}</button></div></section><section><h2 className="mb-3 font-semibold">Your boxes and decks</h2><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{containers.map(c=><ContainerCard key={c.container_id} c={c}/>)}{!containers.length&&<div className="text-sm text-slate-500">No containers yet. Create a bulk box, premade deck, or custom deck.</div>}</div></section></div>}
function Stat({title,value}){return <div className="glass rounded-2xl p-5"><div className="text-sm text-slate-400">{title}</div><div className="mt-2 text-2xl font-bold">{value}</div></div>}
function ContainerCard({c}){return <a href={`/box/${c.container_id}`} className="glass rounded-xl p-4 hover:border-indigo-500/50 block"><div className="flex items-center gap-3">{c.type!=='bulk'&&c.legend_image_url&&<img src={c.legend_image_url} alt={c.legend_name?`${c.legend_name}, deck legend`:'Deck legend'} title={c.legend_name||'Deck legend'} loading="lazy" className="h-24 w-16 shrink-0 rounded object-cover"/>}<div className="min-w-0"><div className="font-semibold">{c.name}</div><div className="mt-1 text-xs uppercase tracking-wide text-slate-500">{c.type}</div><div className="mt-3 text-sm text-slate-300">{c.total_cards} cards</div></div></div></a>}

function Cards({containers}){
  const [q,setQ]=useState('');
  const [setCode,setSetCode]=useState('');
  const [rows,setRows]=useState([]);
  const [sets,setSets]=useState([]);
  const [container,setContainer]=useState('');
  const [finish,setFinish]=useState('normal');
  const [zone,setZone]=useState('main');
  const [quantity,setQuantity]=useState(1);
  const [adding,setAdding]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{api('/api/cards?limit=1').then(d=>setSets(d.sets||[])).catch(()=>{})},[]);
  useEffect(()=>{const t=setTimeout(()=>api(`/api/cards?q=${encodeURIComponent(q)}&set=${encodeURIComponent(setCode)}&limit=60`).then(d=>setRows(d.cards)).catch(()=>{}),250);return()=>clearTimeout(t)},[q,setCode]);
  const add=async card=>{
    if(!container)return;
    setAdding(card.printing_id);setMessage('');
    try{
      const type=String(card.type_line||'').toLowerCase();
      const cardZone=type.includes('rune')||type.includes('legend')||type.includes('battlefield')?'main':(containers.find(c=>c.container_id===container)?.type==='bulk'?'main':zone);
      await api(`/api/containers/${container}/inventory/bulk`,{method:'POST',body:JSON.stringify({cards:[{printing_id:card.printing_id,quantity,finish,zone:cardZone}]})});
      setMessage(`Added ${quantity} × ${card.card_name} to ${containers.find(c=>c.container_id===container)?.name||'container'}.`);
    }catch(e){setMessage(e.message)}finally{setAdding('')}
  };
  return <section>
    <h1 className="text-3xl font-bold">Card catalog</h1>
    <div className="my-5 grid gap-3 md:grid-cols-[1fr_220px]"><input className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-3" placeholder="Search card or definition…" value={q} onChange={e=>setQ(e.target.value)}/><select className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-3" value={setCode} onChange={e=>setSetCode(e.target.value)}><option value="">All sets</option>{sets.map(s=><option key={s.set_code} value={s.set_code}>{s.set_code} — {s.set_label}</option>)}</select></div>
    <div className="mb-5 flex flex-wrap items-end gap-3 rounded-xl border border-slate-800 p-3">
      <label className="min-w-52 flex-1 text-sm text-slate-400">Add to container<select className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" value={container} onChange={e=>setContainer(e.target.value)}><option value="">Choose a container</option>{containers.map(c=><option key={c.container_id} value={c.container_id}>{c.name} ({c.type})</option>)}</select></label>
      <label className="text-sm text-slate-400">Quantity<input type="number" min="1" step="1" className="mt-1 w-24 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" value={quantity} onChange={e=>setQuantity(Math.max(1,Number(e.target.value)||1))}/></label>
      <label className="text-sm text-slate-400">Finish<select className="mt-1 w-32 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" value={finish} onChange={e=>setFinish(e.target.value)}><option value="normal">Normal</option><option value="foil">Foil</option></select></label>
      {containers.find(c=>c.container_id===container)?.type!=='bulk'&&<label className="text-sm text-slate-400">Zone<select className="mt-1 w-36 rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white" value={zone} onChange={e=>setZone(e.target.value)}><option value="main">Main deck</option><option value="sideboard">Sideboard</option></select></label>}
      {message&&<div className="basis-full text-sm text-slate-300" role="status">{message}</div>}
    </div>
    <div className="card-grid">{rows.map(r=><article key={r.printing_id} className="glass rounded-xl p-2"><img className="card-art" src={r.image_url||''} alt={r.card_name}/><div className="p-2"><div className="font-medium text-sm">{r.card_name}</div><div className="text-xs text-slate-500">{r.set_code} #{r.collector_num} · {r.rarity||'—'}</div><button disabled={!container||adding===r.printing_id} onClick={()=>add(r)} className="mt-2 w-full rounded-lg bg-indigo-500 px-3 py-2 text-sm font-medium disabled:opacity-40">{adding===r.printing_id?'Adding…':'Add to container'}</button></div></article>)}</div>
  </section>;
}

function Containers({containers,refresh}){
  const [form,setForm]=useState({name:'',type:'bulk',description:''});
  const [error,setError]=useState('');
  const [busy,setBusy]=useState('');
  const [editId,setEditId]=useState('');
  const [editForm,setEditForm]=useState({name:'',description:''});
  const create=async e=>{e.preventDefault();setError('');try{await api('/api/containers',{method:'POST',body:JSON.stringify(form)});setForm({name:'',type:'bulk',description:''});await refresh()}catch(e){setError(e.message)}};
  const beginEdit=container=>{setEditId(container.container_id);setEditForm({name:container.name,description:container.description||''});setError('');};
  const saveEdit=async()=>{if(!editId)return;setError('');try{await api(`/api/containers/${editId}`,{method:'PUT',body:JSON.stringify({name:editForm.name,description:editForm.description})});setEditId('');setEditForm({name:'',description:''});await refresh()}catch(e){setError(e.message)}};
  const cancelEdit=()=>{setEditId('');setEditForm({name:'',description:''});};
  const remove=async container=>{
    if(!window.confirm(`Delete “${container.name}”? This permanently removes the container and all ${container.total_cards} cards currently tracked in it.`))return;
    setBusy(container.container_id);setError('');
    try{await api(`/api/containers/${container.container_id}?force=true`,{method:'DELETE'});await refresh()}
    catch(e){setError(e.message)}finally{setBusy('')}
  };
  return <section className="space-y-6"><h1 className="text-3xl font-bold">Containers</h1>{error&&<div role="alert" className="rounded-lg border border-red-900 bg-red-950/60 p-3 text-sm text-red-200">{error}</div>}<form onSubmit={create} className="glass rounded-2xl p-5 grid gap-3 md:grid-cols-4"><input required className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" placeholder="Name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/><select className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="bulk">Bulk</option><option value="custom">Custom deck</option><option value="premade">Premade deck</option></select><input className="rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" placeholder="Description" value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/><button className="rounded-lg bg-indigo-500 px-4 py-2">Create</button></form><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{containers.map(c=><div key={c.container_id} className="space-y-2">{editId===c.container_id?<div className="glass rounded-xl p-4 space-y-3"><input value={editForm.name} onChange={e=>setEditForm({...editForm,name:e.target.value})} className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" placeholder="Name"/><input value={editForm.description} onChange={e=>setEditForm({...editForm,description:e.target.value})} className="w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2" placeholder="Description"/><div className="flex gap-2"><button onClick={saveEdit} className="flex-1 rounded-lg bg-indigo-500 px-3 py-2 text-sm">Save</button><button onClick={cancelEdit} className="flex-1 rounded-lg border border-slate-700 px-3 py-2 text-sm">Cancel</button></div></div>:<ContainerCard c={c}/>}<div className="flex gap-2">{editId!==c.container_id&&<button onClick={()=>beginEdit(c)} className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-sm">Edit</button>}<button disabled={busy===c.container_id} onClick={()=>remove(c)} className="flex-1 rounded-lg border border-red-900 px-3 py-2 text-sm text-red-200 hover:bg-red-950/60 disabled:opacity-50">{busy===c.container_id?'Deleting…':'Delete container'}</button></div></div>)}</div></section>;
}

function Scanner(){
  const [secure,setSecure]=useState(window.isSecureContext);
  const [message,setMessage]=useState('');
  useEffect(()=>{
    let scanner;
    let active=true;
    import('html5-qrcode').then(({Html5Qrcode})=>{
      if(!secure||!active)return;
      scanner=new Html5Qrcode('qr-reader');
      scanner.start({facingMode:'environment'},{fps:10,qrbox:{width:240,height:240}},decoded=>{
        let target;
        try{target=new URL(decoded,window.location.origin)}catch{setMessage('This QR code is not a valid container link.');return}
        const match=target.pathname.match(/^\/box\/([a-zA-Z0-9_-]+)\/?$/);
        if(!match){setMessage('QR recognised, but it is not a Riftbound container link.');return}
        window.location.assign(`${window.location.origin}/box/${encodeURIComponent(match[1])}`);
      },()=>{}).catch(e=>{if(active)setMessage(`Camera unavailable: ${e.message}`)});
    });
    return()=>{active=false;scanner?.stop().catch(()=>{})};
  },[secure]);
  return <section className="max-w-xl space-y-5"><h1 className="text-3xl font-bold">QR scanner</h1>{!secure?<div className="rounded-xl border border-amber-800 bg-amber-950/50 p-4 text-sm text-amber-200">Camera scanning and PWA installation require a secure browser context. Because this app intentionally supports plain HTTP on a home LAN, use your phone’s native camera to scan the sticker URL, or access the app through HTTPS when available.</div>:<div id="qr-reader" className="overflow-hidden rounded-xl bg-black min-h-64"/>}{message&&<div className="rounded-lg bg-slate-900 p-3 text-sm break-all" role="status">{message}</div>}</section>;
}

createRoot(document.getElementById('root')).render(<App/>);
