const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { after, before, test } = require('node:test');

// La base doit être configurée AVANT de charger src/db.js (chemin lu au chargement).
const repertoire = fs.mkdtempSync(path.join(os.tmpdir(), 'courses-partagees-check-'));
process.env.DB_PATH = path.join(repertoire, 'test.sqlite');

const db = require('../src/db');
const app = require('../src/server');

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
  return reponse.headers.get('location').slice('/l/'.length);
}

async function ajouterArticle(code, text) {
  const reponse = await fetch(`${baseUrl}/api/lists/${code}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  assert.equal(reponse.status, 201);
  return reponse.json();
}

function cocher(code, id, corps, entetes = { 'content-type': 'application/json' }) {
  return fetch(`${baseUrl}/api/lists/${code}/items/${id}`, {
    method: 'PATCH',
    headers: entetes,
    body: typeof corps === 'string' ? corps : JSON.stringify(corps),
  });
}

async function lireListe(code) {
  const reponse = await fetch(`${baseUrl}/api/lists/${code}`);
  assert.equal(reponse.status, 200);
  return reponse.json();
}

function etatEnBase(id) {
  return db.prepare('SELECT checked FROM items WHERE id = ?').get(id)?.checked;
}

test('coche puis décoche un article : l\'état est lu par GET /api/lists/:code', async () => {
  const code = await creerListe();
  const article = await ajouterArticle(code, 'pain');

  const coche = await cocher(code, article.id, { checked: true });
  assert.equal(coche.status, 200);
  assert.deepEqual(await coche.json(), { id: article.id, text: 'pain', checked: true });

  const apresCochage = await lireListe(code);
  assert.deepEqual(apresCochage.items, [{ id: article.id, text: 'pain', checked: true }]);
  assert.equal(etatEnBase(article.id), 1, 'l\'état doit être persisté en base');

  const decoche = await cocher(code, article.id, { checked: false });
  assert.equal(decoche.status, 200);
  assert.deepEqual(await decoche.json(), { id: article.id, text: 'pain', checked: false });

  const apresDecochage = await lireListe(code);
  assert.deepEqual(apresDecochage.items, [{ id: article.id, text: 'pain', checked: false }]);
  assert.equal(etatEnBase(article.id), 0);
});

test('le nouveau champ checked est un booléen strict, y compris pour un article neuf', async () => {
  const code = await creerListe();
  await ajouterArticle(code, 'oeufs');

  const contenu = await lireListe(code);
  assert.equal(typeof contenu.items[0].checked, 'boolean');
  assert.equal(contenu.items[0].checked, false);
});

test('recocher est idempotent et ne duplique ni ne réordonne les articles', async () => {
  const code = await creerListe();
  const premier = await ajouterArticle(code, 'un');
  const second = await ajouterArticle(code, 'deux');

  assert.equal((await cocher(code, second.id, { checked: true })).status, 200);
  const rappel = await cocher(code, second.id, { checked: true });
  assert.equal(rappel.status, 200);
  assert.deepEqual(await rappel.json(), { id: second.id, text: 'deux', checked: true });

  const contenu = await lireListe(code);
  assert.deepEqual(
    contenu.items,
    [
      { id: premier.id, text: 'un', checked: false },
      { id: second.id, text: 'deux', checked: true },
    ],
    'cocher un article ne doit ni le déplacer ni toucher aux autres',
  );
});

test('PATCH renvoie 404 si l\'article n\'appartient pas à cette liste', async () => {
  const listeA = await creerListe();
  const listeB = await creerListe();
  const articleA = await ajouterArticle(listeA, 'lait');

  const croise = await cocher(listeB, articleA.id, { checked: true });
  assert.equal(croise.status, 404);
  assert.equal(etatEnBase(articleA.id), 0, 'l\'article d\'une autre liste doit rester intact');

  const inconnu = await cocher(listeA, 999999, { checked: true });
  assert.equal(inconnu.status, 404);

  const listeInconnue = await cocher('zzzzzz', articleA.id, { checked: true });
  assert.equal(listeInconnue.status, 404);

  assert.deepEqual(await lireListe(listeA), {
    code: listeA,
    items: [{ id: articleA.id, text: 'lait', checked: false }],
  });
});

test('PATCH renvoie 404 pour un id non entier ou négatif', async () => {
  const code = await creerListe();
  const article = await ajouterArticle(code, 'beurre');

  for (const identifiant of ['abc', '1.5', '0', '-1', '']) {
    const reponse = await cocher(code, identifiant, { checked: true });
    assert.equal(reponse.status, 404, `id ${JSON.stringify(identifiant)} attendu en 404`);
  }
  assert.equal(etatEnBase(article.id), 0);
});

test('PATCH renvoie 400 sans modifier l\'état si checked n\'est pas un booléen', async () => {
  const code = await creerListe();
  const article = await ajouterArticle(code, 'café');
  await cocher(code, article.id, { checked: true });

  const corpsInvalides = ['{}', '{"checked": "true"}', '{"checked": 1}', '{"checked": null}'];
  for (const corps of corpsInvalides) {
    const reponse = await cocher(code, article.id, corps);
    assert.equal(reponse.status, 400, `corps ${corps} attendu en 400`);
    assert.equal(typeof (await reponse.json()).error, 'string');
  }

  const sansCorps = await fetch(`${baseUrl}/api/lists/${code}/items/${article.id}`, {
    method: 'PATCH',
  });
  assert.equal(sansCorps.status, 400);

  assert.deepEqual((await lireListe(code)).items, [
    { id: article.id, text: 'café', checked: true },
  ]);
});
