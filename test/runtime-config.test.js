const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('package.json'));

test('Node 22 et le contrôle strict npm sont configurés ensemble', () => {
  assert.equal(manifest.engines.node, '>=22 <23');
  assert.equal(read('.nvmrc').trim(), '22');
  assert.equal(read('.npmrc').trim(), 'engine-strict=true');
});

test('les deux dépendances directes sont figées aux versions exactes retenues', () => {
  assert.deepEqual(manifest.dependencies, {
    'better-sqlite3': '11.10.0',
    express: '5.2.1',
  });
});

test('la section de lancement annonce Node 22 avant npm install', () => {
  const section = read('README.md').split('## Lancer le projet')[1].split('\n## ')[0];
  assert.match(section, /Node 22 requis/);
  assert.ok(section.indexOf('Node 22 requis') < section.indexOf('npm install'));
});
