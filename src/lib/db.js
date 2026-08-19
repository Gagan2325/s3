const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || './data/metastore.db';

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS buckets (
    name TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    owner TEXT
  );

  CREATE TABLE IF NOT EXISTS objects (
    bucket TEXT NOT NULL,
    key TEXT NOT NULL,
    size INTEGER NOT NULL,
    content_type TEXT,
    etag TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY (bucket, key),
    FOREIGN KEY (bucket) REFERENCES buckets(name) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_objects_bucket ON objects(bucket);
`);

module.exports = db;
