import 'dotenv/config';
import {openDb} from '../db.js';
import {fetchCatalog,syncCatalog} from '../catalog.js';
const db=openDb(process.env.DATABASE_PATH||'data/riftbound.db');
try{const payload=await fetchCatalog(process.env.CATALOG_API_URL||'https://api.rifthunt.com/bulk/cards');console.log(`Synced ${syncCatalog(db,payload)} cards.`)}catch(e){console.error(e);process.exitCode=1}finally{db.close()}
