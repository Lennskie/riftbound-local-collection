import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

export function openDb(filename){
  const resolved=path.resolve(filename);
  fs.mkdirSync(path.dirname(resolved),{recursive:true});
  const db=new Database(resolved);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE IF NOT EXISTS card_definitions (
      definition_key TEXT PRIMARY KEY, card_name TEXT NOT NULL, type_line TEXT
    );
    CREATE TABLE IF NOT EXISTS card_printings (
      printing_id TEXT PRIMARY KEY, definition_key TEXT NOT NULL, rifthunt_id TEXT,
      tcgplayer_id TEXT, card_name TEXT NOT NULL, variant_label TEXT, set_code TEXT NOT NULL,
      set_label TEXT, collector_num INTEGER NOT NULL, rarity TEXT,
      alternate_art INTEGER NOT NULL DEFAULT 0, overnumbered INTEGER NOT NULL DEFAULT 0,
      signature INTEGER NOT NULL DEFAULT 0, is_foil INTEGER NOT NULL DEFAULT 0,
      image_url TEXT, is_active INTEGER NOT NULL DEFAULT 1,
      synced_at TEXT NOT NULL, FOREIGN KEY (definition_key) REFERENCES card_definitions(definition_key)
    );
    CREATE INDEX IF NOT EXISTS idx_printings_definition ON card_printings(definition_key);
    CREATE INDEX IF NOT EXISTS idx_printings_name ON card_printings(card_name);
    CREATE TABLE IF NOT EXISTS containers (
      container_id TEXT PRIMARY KEY, name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('premade','custom','bulk')), description TEXT,
      deck_locked_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS inventory (
      container_id TEXT NOT NULL, printing_id TEXT NOT NULL,
      finish TEXT NOT NULL DEFAULT 'normal' CHECK(finish IN ('normal','foil')),
      zone TEXT NOT NULL DEFAULT 'main' CHECK(zone IN ('main','sideboard')),
      current_quantity INTEGER NOT NULL CHECK(current_quantity >= 0),
      PRIMARY KEY(container_id,printing_id,finish,zone),
      FOREIGN KEY(container_id) REFERENCES containers(container_id) ON DELETE CASCADE,
      FOREIGN KEY(printing_id) REFERENCES card_printings(printing_id) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS premade_blueprints (
      container_id TEXT NOT NULL, definition_key TEXT NOT NULL, required_quantity INTEGER NOT NULL CHECK(required_quantity > 0),
      PRIMARY KEY(container_id,definition_key),
      FOREIGN KEY(container_id) REFERENCES containers(container_id) ON DELETE CASCADE,
      FOREIGN KEY(definition_key) REFERENCES card_definitions(definition_key) ON DELETE RESTRICT
    );
    CREATE TABLE IF NOT EXISTS catalog_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  const inventoryColumns=db.prepare('PRAGMA table_info(inventory)').all();
  if(!inventoryColumns.some(column=>column.name==='zone')){
    db.exec(`
      ALTER TABLE inventory RENAME TO inventory_legacy;
      CREATE TABLE inventory (
        container_id TEXT NOT NULL, printing_id TEXT NOT NULL,
        finish TEXT NOT NULL DEFAULT 'normal' CHECK(finish IN ('normal','foil')),
        zone TEXT NOT NULL DEFAULT 'main' CHECK(zone IN ('main','sideboard')),
        current_quantity INTEGER NOT NULL CHECK(current_quantity >= 0),
        PRIMARY KEY(container_id,printing_id,finish,zone),
        FOREIGN KEY(container_id) REFERENCES containers(container_id) ON DELETE CASCADE,
        FOREIGN KEY(printing_id) REFERENCES card_printings(printing_id) ON DELETE RESTRICT
      );
      INSERT INTO inventory(container_id,printing_id,finish,zone,current_quantity)
        SELECT container_id,printing_id,finish,'main',current_quantity FROM inventory_legacy;
      DROP TABLE inventory_legacy;
    `);
  }
  const containerColumns=db.prepare('PRAGMA table_info(containers)').all();
  if(!containerColumns.some(column=>column.name==='deck_locked_at')){
    db.exec('ALTER TABLE containers ADD COLUMN deck_locked_at TEXT');
  }
  const printingColumns=db.prepare('PRAGMA table_info(card_printings)').all();
  if(!printingColumns.some(column=>column.name==='is_foil')){
    db.exec('ALTER TABLE card_printings ADD COLUMN is_foil INTEGER NOT NULL DEFAULT 0');
  }
  return db;
}
