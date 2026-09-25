const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || './data/db.sqlite';
const parent = path.dirname(dbPath);
if (parent !== '.') fs.mkdirSync(parent, { recursive: true });

const db = new Database(dbPath);
db.exec(`
  CREATE TABLE IF NOT EXISTS lists (
    code TEXT PRIMARY KEY,
    created_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY,
    list_code TEXT,
    text TEXT,
    checked INTEGER DEFAULT 0,
    created_at INTEGER
  );
`);

module.exports = db;
