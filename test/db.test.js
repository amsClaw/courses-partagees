const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('initialise les tables SQLite requises', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'courses-partagees-'));
  const databasePath = path.join(directory, 'test.sqlite');
  const previousPath = process.env.DB_PATH;
  process.env.DB_PATH = databasePath;

  try {
    const databaseModule = require('../src/db');
    const tables = databaseModule.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('lists', 'items') ORDER BY name",
    ).all().map((row) => row.name);
    assert.deepEqual(tables, ['items', 'lists']);
    assert.deepEqual(
      databaseModule.prepare('PRAGMA table_info(items)').all().map((column) => column.name),
      ['id', 'list_code', 'text', 'checked', 'created_at'],
    );
    databaseModule.close();
  } finally {
    if (previousPath === undefined) delete process.env.DB_PATH;
    else process.env.DB_PATH = previousPath;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
