const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const Database = require('better-sqlite3');

function withDatabase(check, seed) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'courses-partagees-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const previousPath = process.env.DB_PATH;
  const modulePath = require.resolve('../src/db');
  let databaseModule;
  process.env.DB_PATH = databasePath;

  try {
    if (seed) {
      const legacyDatabase = new Database(databasePath);
      try {
        seed(legacyDatabase);
      } finally {
        legacyDatabase.close();
      }
    }
    delete require.cache[modulePath];
    databaseModule = require('../src/db');
    check(databaseModule);
  } finally {
    if (databaseModule) databaseModule.close();
    delete require.cache[modulePath];
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('initialise les tables SQLite requises', () => {
  withDatabase((databaseModule) => {
    const tables = databaseModule.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('lists', 'items') ORDER BY name",
    ).all().map((row) => row.name);
    assert.deepEqual(tables, ['items', 'lists']);
    assert.deepEqual(
      databaseModule.prepare('PRAGMA table_info(items)').all().map((column) => column.name),
      ['id', 'list_code', 'text', 'checked', 'created_at'],
    );
  });
});

test('la lecture des articles utilise idx_items_list sans parcourir ni trier toute la table', () => {
  withDatabase((database) => {
    // Même sélection et même ordre que selectItems dans src/lists.js.
    const plan = database.prepare(
      'EXPLAIN QUERY PLAN SELECT id, text, checked FROM items WHERE list_code = ? ORDER BY created_at, id',
    ).all('abc234').map((row) => row.detail).join(' | ');
    assert.match(plan, /USING INDEX idx_items_list\b/);
    assert.doesNotMatch(plan, /SCAN items\b/);
    assert.doesNotMatch(plan, /USE TEMP B-TREE/);
    assert.deepEqual(
      database.prepare('PRAGMA index_info(idx_items_list)').all().map((column) => column.name),
      ['list_code', 'created_at', 'id'],
    );
  });
});

test('ajoute l’index à une base existante sans modifier ses listes ni ses articles', () => {
  const lists = [{ code: 'abc234', created_at: 100 }, { code: 'def567', created_at: 200 }];
  const items = [
    { id: 1, list_code: 'abc234', text: 'Café', checked: 1, created_at: 300 },
    { id: 2, list_code: 'def567', text: 'Lait', checked: 0, created_at: 400 },
  ];
  withDatabase((database) => {
    assert.deepEqual(database.prepare('SELECT * FROM lists ORDER BY code').all(), lists);
    assert.deepEqual(database.prepare('SELECT * FROM items ORDER BY id').all(), items);
    assert.ok(database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_items_list'",
    ).get());
  }, (database) => {
    // Schéma antérieur à l'index, créé et fermé avant le démarrage de src/db.js.
    database.exec(`
      CREATE TABLE lists (code TEXT PRIMARY KEY, created_at INTEGER);
      CREATE TABLE items (
        id INTEGER PRIMARY KEY, list_code TEXT, text TEXT,
        checked INTEGER DEFAULT 0, created_at INTEGER
      );
    `);
    for (const list of lists) {
      database.prepare('INSERT INTO lists (code, created_at) VALUES (@code, @created_at)').run(list);
    }
    for (const item of items) {
      database.prepare(
        'INSERT INTO items (id, list_code, text, checked, created_at) VALUES (@id, @list_code, @text, @checked, @created_at)',
      ).run(item);
    }
  });
});
