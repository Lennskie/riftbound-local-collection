import 'dotenv/config';
import express from 'express';
import { createServer as createHttpsServer } from 'node:https';
import path from 'node:path';
import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openDb} from './db.js';
import {listCards} from './cards.js';
import {fetchCatalog,syncCatalog} from './catalog.js';
import {summarizeDeck} from './deck-rules.js';
import {importRiftatlasDeck,previewRiftatlasImport} from './riftatlas.js';
import {addInventoryBulk,deleteInventoryEntry,setInventoryQuantity,transferInventory} from './inventory.js';

const PORT=Number(process.env.PORT||8080), HOST=process.env.HOST||'0.0.0.0';
const db=openDb(process.env.DATABASE_PATH||'data/riftbound.db');
const app=express(); app.use(express.json({limit:'20mb'}));
const meta=k=>db.prepare('SELECT value FROM catalog_meta WHERE key=?').get(k)?.value||null;
const setMeta=(k,v)=>db.prepare(`INSERT INTO catalog_meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(k,String(v??''));
let syncState=meta('last_sync')?'idle':'empty'; let syncPromise=null;
async function doSync(){if(syncPromise)return syncPromise; syncState='syncing'; syncPromise=(async()=>{try{const payload=await fetchCatalog(process.env.CATALOG_API_URL||'https://api.rifthunt.com/bulk/cards');const count=syncCatalog(db,payload);syncState='idle';return count}catch(e){syncState='error';setMeta('last_error',`${new Date().toISOString()} ${e.stack||e.message}`);throw e}finally{syncPromise=null}})();return syncPromise}

app.get('/api/config',(req,res)=>res.json({base_url:process.env.BASE_URL||null}));
app.get('/api/catalog/status',(req,res)=>res.json({status:syncState,last_sync:meta('last_sync'),last_count:Number(meta('last_count')||0),last_error:meta('last_error')}));
app.post('/api/catalog/sync',(req,res)=>{doSync().then(count=>res.status(202).json({status:'syncing',count})).catch(e=>res.status(502).json({error:e.message}))});
app.get('/api/cards',(req,res)=>{const q=String(req.query.q||'').trim(),set=String(req.query.set||'').trim(),limit=Math.min(200,Math.max(1,Number(req.query.limit||60))),offset=Math.max(0,Number(req.query.offset||0));res.json(listCards(db,{q,set,limit,offset}))});
app.get('/api/search',(req,res)=>{const q=String(req.query.q||'').trim();if(!q)return res.json({results:[]});const rows=db.prepare(`SELECT p.printing_id,p.card_name,p.variant_label,p.set_code,p.set_label,p.collector_num,p.image_url,i.container_id,i.finish,i.zone,i.current_quantity,c.name container_name,c.type container_type FROM card_printings p JOIN inventory i ON i.printing_id=p.printing_id JOIN containers c ON c.container_id=i.container_id WHERE p.is_active=1 AND i.current_quantity>0 AND c.container_id IS NOT NULL AND (p.card_name LIKE '%'||?||'%' OR p.definition_key LIKE '%'||?||'%') ORDER BY p.card_name,p.set_code,p.collector_num LIMIT 100`).all(q,q);res.json({results:rows})});
app.get('/api/containers',(req,res)=>{const containers=db.prepare(`SELECT c.*,COALESCE(SUM(i.current_quantity),0) total_cards,(SELECT p.image_url FROM inventory legend_inventory JOIN card_printings p ON p.printing_id=legend_inventory.printing_id JOIN card_definitions d ON d.definition_key=p.definition_key WHERE legend_inventory.container_id=c.container_id AND legend_inventory.zone='main' AND legend_inventory.current_quantity>0 AND LOWER(d.type_line) LIKE '%legend%' ORDER BY p.card_name LIMIT 1) legend_image_url,(SELECT p.card_name FROM inventory legend_inventory JOIN card_printings p ON p.printing_id=legend_inventory.printing_id JOIN card_definitions d ON d.definition_key=p.definition_key WHERE legend_inventory.container_id=c.container_id AND legend_inventory.zone='main' AND legend_inventory.current_quantity>0 AND LOWER(d.type_line) LIKE '%legend%' ORDER BY p.card_name LIMIT 1) legend_name FROM containers c LEFT JOIN inventory i ON i.container_id=c.container_id GROUP BY c.container_id ORDER BY c.name`).all();res.json({containers})});
app.post('/api/containers',(req,res)=>{const {name,type,description=''}=req.body||{};if(!name||!['premade','custom','bulk'].includes(type))return res.status(400).json({error:'name and valid type are required'});const id=randomUUID();db.prepare('INSERT INTO containers(container_id,name,type,description) VALUES(?,?,?,?)').run(id,name,type,description);res.status(201).json({container_id:id})});
app.get('/api/containers/:id',(req,res)=>{const c=db.prepare('SELECT * FROM containers WHERE container_id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Container not found'});const inventory=db.prepare(`SELECT i.*,p.card_name,p.definition_key,p.set_code,p.set_label,p.collector_num,p.image_url,p.rarity,p.variant_label,d.type_line FROM inventory i JOIN card_printings p ON p.printing_id=i.printing_id JOIN card_definitions d ON d.definition_key=p.definition_key WHERE i.container_id=? ORDER BY i.zone,p.card_name,p.set_code,p.collector_num,i.finish`).all(req.params.id);let shortfalls=[];if(c.deck_locked_at){shortfalls=db.prepare(`SELECT b.definition_key,d.card_name,b.required_quantity,COALESCE(SUM(CASE WHEN i.container_id=? AND i.zone='main' THEN i.current_quantity ELSE 0 END),0) current_quantity,MAX(0,b.required_quantity-COALESCE(SUM(CASE WHEN i.container_id=? AND i.zone='main' THEN i.current_quantity ELSE 0 END),0)) shortfall FROM premade_blueprints b JOIN card_definitions d ON d.definition_key=b.definition_key LEFT JOIN inventory i ON i.printing_id IN (SELECT printing_id FROM card_printings WHERE definition_key=b.definition_key) WHERE b.container_id=? GROUP BY b.definition_key,d.card_name,b.required_quantity HAVING shortfall>0`).all(req.params.id,req.params.id,req.params.id);for(const card of shortfalls){card.sources=db.prepare(`SELECT i.container_id,c.name container_name,i.printing_id,i.finish,i.zone,i.current_quantity quantity,p.set_code,p.collector_num,p.image_url FROM inventory i JOIN containers c ON c.container_id=i.container_id JOIN card_printings p ON p.printing_id=i.printing_id WHERE p.definition_key=? AND i.container_id<>? AND i.current_quantity>0 ORDER BY c.name,p.set_code,p.collector_num,i.finish`).all(card.definition_key,req.params.id)}}res.json({container:c,inventory,shortfalls,deck_rules:c.type==='bulk'?null:summarizeDeck(inventory)})});
app.post('/api/containers/:id/lock',(req,res)=>{const container=db.prepare("SELECT * FROM containers WHERE container_id=? AND type IN ('custom','premade')").get(req.params.id);if(!container)return res.status(404).json({error:'Only custom and premade decks can be locked.'});const requirements=db.prepare(`SELECT p.definition_key,SUM(i.current_quantity) required_quantity FROM inventory i JOIN card_printings p ON p.printing_id=i.printing_id WHERE i.container_id=? AND i.zone='main' AND i.current_quantity>0 GROUP BY p.definition_key`).all(req.params.id);if(!requirements.length)return res.status(400).json({error:'Add cards to the main deck before locking it.'});const save=db.transaction(()=>{db.prepare('DELETE FROM premade_blueprints WHERE container_id=?').run(req.params.id);const insert=db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)');for(const row of requirements)insert.run(req.params.id,row.definition_key,row.required_quantity);db.prepare('UPDATE containers SET deck_locked_at=? WHERE container_id=?').run(new Date().toISOString(),req.params.id)});save();res.json({locked:true,deck_locked_at:db.prepare('SELECT deck_locked_at FROM containers WHERE container_id=?').get(req.params.id).deck_locked_at,requirements:requirements.length})});
app.post('/api/containers/:id/riftatlas/preview',(req,res)=>{try{res.json(previewRiftatlasImport(db,req.params.id,req.body?.text||''))}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/containers/:id/riftatlas/import',(req,res)=>{try{res.json(importRiftatlasDeck(db,req.params.id,req.body?.text||''))}catch(e){res.status(400).json({error:e.message})}});
app.put('/api/containers/:id',(req,res)=>{const c=db.prepare('SELECT * FROM containers WHERE container_id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Container not found'});const {name,description}=req.body||{};db.prepare('UPDATE containers SET name=COALESCE(?,name),description=COALESCE(?,description) WHERE container_id=?').run(name,description,req.params.id);res.json({ok:true})});
app.delete('/api/containers/:id',(req,res)=>{const c=db.prepare('SELECT * FROM containers WHERE container_id=?').get(req.params.id);if(!c)return res.status(404).json({error:'Container not found'});const count=db.prepare('SELECT COALESCE(SUM(current_quantity),0) n FROM inventory WHERE container_id=?').get(req.params.id).n;if(count>0&&req.query.force!=='true')return res.status(409).json({error:'Container is not empty; use ?force=true to delete it'});db.prepare('DELETE FROM containers WHERE container_id=?').run(req.params.id);res.status(204).end()});
app.put('/api/containers/:id/inventory',(req,res)=>{try{setInventoryQuantity(db,req.params.id,req.body||{});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.delete('/api/containers/:id/inventory',(req,res)=>{try{if(!deleteInventoryEntry(db,req.params.id,req.query))return res.status(404).json({error:'Inventory entry not found'});res.status(204).end()}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/containers/:id/inventory/bulk',(req,res)=>{try{const added=addInventoryBulk(db,req.params.id,req.body?.cards);res.json({added})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/transfer',(req,res)=>{try{transferInventory(db,req.body||{});res.json({ok:true})}catch(e){res.status(400).json({error:e.message})}});
app.post('/api/blueprints/:container_id',(req,res)=>{
	const rows=req.body?.requirements;
	if(!Array.isArray(rows))return res.status(400).json({error:'requirements must be an array'});
	const container=db.prepare('SELECT type FROM containers WHERE container_id=?').get(req.params.container_id);
	if(!container)return res.status(404).json({error:'Container not found'});
	if(!['premade','custom'].includes(container.type))return res.status(400).json({error:'Blueprints require a premade or custom deck container'});
	const findDefinition=db.prepare('SELECT 1 FROM card_definitions WHERE definition_key=?');
	for(const row of rows){
		if(!row||typeof row.definition_key!=='string'||!row.definition_key.trim())return res.status(400).json({error:'definition_key is required'});
		if(!Number.isInteger(row.required_quantity)||row.required_quantity<=0)return res.status(400).json({error:'required_quantity must be a positive integer'});
		if(!findDefinition.get(row.definition_key))return res.status(400).json({error:`Unknown definition: ${row.definition_key}`});
	}
	try{
		const replace=db.transaction(()=>{
			db.prepare('DELETE FROM premade_blueprints WHERE container_id=?').run(req.params.container_id);
			const insert=db.prepare('INSERT INTO premade_blueprints(container_id,definition_key,required_quantity) VALUES(?,?,?)');
			for(const row of rows)insert.run(req.params.container_id,row.definition_key,row.required_quantity);
		});
		replace();res.json({ok:true});
	}catch(e){res.status(400).json({error:e.message})}
});

const dist=path.resolve('dist'); if(fs.existsSync(dist)){app.use(express.static(dist));app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')))}
const keyPath=process.env.HTTPS_KEY_PATH, certPath=process.env.HTTPS_CERT_PATH;
if(Boolean(keyPath)!==Boolean(certPath)) throw new Error('Set both HTTPS_KEY_PATH and HTTPS_CERT_PATH to enable HTTPS.');
const protocol=keyPath?'https':'http';
const server=keyPath?createHttpsServer({key:fs.readFileSync(keyPath),cert:fs.readFileSync(certPath)},app):app;
server.listen(PORT,HOST,()=>{console.log(`Riftbound manager listening on ${protocol}://${HOST}:${PORT}`);if(String(process.env.CATALOG_SYNC_ON_BOOT||'true').toLowerCase()==='true'){const age=meta('last_sync')?((Date.now()-Date.parse(meta('last_sync')))/36e5):Infinity;if(age>=Number(process.env.CATALOG_MAX_AGE_HOURS||24)){doSync().catch(e=>console.error('Catalog boot sync failed:',e.message));}}});
