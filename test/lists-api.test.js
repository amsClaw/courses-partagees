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

test('GET /l/:code sert la page mobile et 404 si la liste est inconnue', async () => {
  const { code } = await creerListe();
  const page = await fetch(`${baseUrl}/l/${code}`);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /id="ajout"/);

  const inconnue = await fetch(`${baseUrl}/l/zzzzzz`);
  assert.equal(inconnue.status, 404);
  assert.match(await inconnue.text(), /Liste inconnue/);
});

test('GET /health reste disponible', async () => {
  const reponse = await fetch(`${baseUrl}/health`);
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { status: 'ok' });
});

test('ajoute des articles trimés et isole les listes', async () => {
  const listeA = await creerListe();
  const listeB = await creerListe();

  const ajoutA = await fetch(`${baseUrl}/api/lists/${listeA.code}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '  pommes  ' }),
  });
  const ajoutB = await fetch(`${baseUrl}/api/lists/${listeB.code}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'pain' }),
  });

  assert.equal(ajoutA.status, 201);
  assert.equal(ajoutB.status, 201);
  const articleA = await ajoutA.json();
  const articleB = await ajoutB.json();
  assert.equal(articleA.text, 'pommes');
  assert.ok(articleA.id);
  assert.notEqual(articleA.id, articleB.id);

  const contenuA = await (await fetch(`${baseUrl}/api/lists/${listeA.code}`)).json();
  const contenuB = await (await fetch(`${baseUrl}/api/lists/${listeB.code}`)).json();
  assert.deepEqual(contenuA.items.map(({ text }) => text), ['pommes']);
  assert.deepEqual(contenuB.items.map(({ text }) => text), ['pain']);
});

test('rejette un texte vide et protège la suppression entre listes', async () => {
  const listeA = await creerListe();
  const listeB = await creerListe();
  const ajout = await fetch(`${baseUrl}/api/lists/${listeA.code}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: '  ' }),
  });
  assert.equal(ajout.status, 400);

  const article = await (await fetch(`${baseUrl}/api/lists/${listeA.code}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: 'lait' }),
  })).json();
  const suppressionCroisee = await fetch(
    `${baseUrl}/api/lists/${listeB.code}/items/${article.id}`,
    { method: 'DELETE' },
  );
  assert.equal(suppressionCroisee.status, 404);
  const contenuA = await (await fetch(`${baseUrl}/api/lists/${listeA.code}`)).json();
  assert.deepEqual(contenuA.items.map(({ text }) => text), ['lait']);

  const suppression = await fetch(`${baseUrl}/api/lists/${listeA.code}/items/${article.id}`, {
    method: 'DELETE',
  });
  assert.equal(suppression.status, 204);
  assert.deepEqual(
    (await (await fetch(`${baseUrl}/api/lists/${listeA.code}`)).json()).items,
    [],
  );
});
