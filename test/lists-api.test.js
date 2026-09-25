const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

// La base doit être configurée AVANT de charger src/db.js (chemin lu au chargement).
const repertoire = fs.mkdtempSync(path.join(os.tmpdir(), 'courses-partagees-api-'));
process.env.DB_PATH = path.join(repertoire, 'test.sqlite');

const db = require('../src/db');
const app = require('../src/server');
const { ALPHABET, CODE_LENGTH } = require('../src/lists');

const motifCode = new RegExp(`^/l/[${ALPHABET}]{${CODE_LENGTH}}$`);

let serveur;
let baseUrl;

before(async () => {
  serveur = app.listen(0);
  await new Promise((resolve) => serveur.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${serveur.address().port}`;
});

after(async () => {
  await new Promise((resolve) => serveur.close(resolve));
  db.close();
  fs.rmSync(repertoire, { recursive: true, force: true });
});

async function creerListe() {
  const reponse = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  const emplacement = reponse.headers.get('location');
  assert.ok(reponse.status === 302 || reponse.status === 303, `statut ${reponse.status}`);
  assert.match(emplacement, motifCode, `en-tête Location inattendu : ${emplacement}`);
  return { statut: reponse.status, code: emplacement.slice('/l/'.length) };
}

test('GET / crée une liste, la persiste, et redirige vers /l/:code', async () => {
  const { code } = await creerListe();
  const enBase = db.prepare('SELECT code FROM lists WHERE code = ?').get(code);
  assert.deepEqual(enBase, { code });

  const reponse = await fetch(`${baseUrl}/api/lists/${code}`);
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { code, items: [] });
});

test('deux appels successifs à GET / créent deux listes distinctes', async () => {
  const premiere = await creerListe();
  const seconde = await creerListe();
  assert.notEqual(premiere.code, seconde.code);

  const total = db.prepare('SELECT COUNT(*) AS total FROM lists').get().total;
  const connues = db
    .prepare('SELECT COUNT(*) AS total FROM lists WHERE code IN (?, ?)')
    .get(premiere.code, seconde.code).total;
  assert.equal(connues, 2, 'les deux codes doivent exister en base');
  assert.ok(total >= 2, 'les listes créées doivent persister');
});

test('GET /api/lists/:code renvoie 404 pour un code inconnu', async () => {
  const reponse = await fetch(`${baseUrl}/api/lists/zzzzzz`);
  assert.equal(reponse.status, 404);
  const corps = await reponse.json();
  assert.equal(typeof corps.error, 'string');
});

test('GET /health reste disponible', async () => {
  const reponse = await fetch(`${baseUrl}/health`);
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { status: 'ok' });
});
