const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { after, before, test } = require('node:test');

// La base doit être configurée AVANT de charger src/db.js (chemin lu au chargement).
const repertoire = fs.mkdtempSync(path.join(os.tmpdir(), 'courses-partagees-ui-'));
process.env.DB_PATH = path.join(repertoire, 'test.sqlite');

const db = require('../src/db');
const app = require('../src/server');

const racine = path.join(__dirname, '..');
const sourceApp = fs.readFileSync(path.join(racine, 'public', 'app.js'), 'utf8');
const sourceCss = fs.readFileSync(path.join(racine, 'public', 'styles.css'), 'utf8');
const sourceHtml = fs.readFileSync(path.join(racine, 'public', 'index.html'), 'utf8');

// ---------------------------------------------------------------------------
// Mini-DOM : suffisant pour exécuter public/app.js tel qu'il est servi, et
// piloter ses écouteurs (submit, change, click) sans navigateur.
// ---------------------------------------------------------------------------

const MOTIF_SELECTEUR = /(^[a-z]+)|(\.[A-Za-z0-9_-]+)|(#[A-Za-z0-9_-]+)|(\[[^\]]+\])/gi;

function correspond(element, selecteur) {
  const parties = selecteur.match(MOTIF_SELECTEUR) || [];
  if (parties.length === 0) return false;
  return parties.every((partie) => {
    if (partie.startsWith('.')) return element.classList.contains(partie.slice(1));
    if (partie.startsWith('#')) return element.getAttribute('id') === partie.slice(1);
    if (partie.startsWith('[')) {
      const analyse = partie.slice(1, -1).match(/^([^=\]]+)(?:="([^"]*)")?$/);
      if (!analyse) return false;
      const [, nom, valeur] = analyse;
      const reel = element.getAttribute(nom);
      if (reel === null || reel === undefined) return false;
      return valeur === undefined || reel === valeur;
    }
    return element.tagName === partie.toUpperCase();
  });
}

class Element {
  constructor(tag) {
    Object.assign(this, {
      tagName: String(tag).toUpperCase(),
      enfants: [],
      parent: null,
      attributs: {},
      ecouteurs: new Map(),
      classes: new Set(),
      dataset: {},
      texte: '',
      value: '',
      checked: false,
      disabled: false,
    });
  }

  get textContent() { return this.texte; }
  set textContent(valeur) { this.texte = String(valeur); this.enfants = []; }

  get classList() {
    const classes = this.classes;
    return {
      add: (...noms) => noms.forEach((nom) => classes.add(nom)),
      remove: (...noms) => noms.forEach((nom) => classes.delete(nom)),
      contains: (nom) => classes.has(nom),
      toggle: (nom, force) => {
        const actif = force === undefined ? !classes.has(nom) : Boolean(force);
        if (actif) classes.add(nom);
        else classes.delete(nom);
        return actif;
      },
    };
  }

  get className() { return [...this.classes].join(' '); }
  set className(valeur) { this.classes = new Set(String(valeur).split(/\s+/).filter(Boolean)); }

  get type() { return this.attributs.type; }
  set type(valeur) { this.attributs.type = String(valeur); }

  setAttribute(nom, valeur) { this.attributs[nom] = String(valeur); }
  getAttribute(nom) { return Object.hasOwn(this.attributs, nom) ? this.attributs[nom] : null; }

  append(...noeuds) {
    noeuds.forEach((noeud) => { noeud.parent = this; this.enfants.push(noeud); });
  }

  replaceChildren(...noeuds) {
    this.enfants.forEach((enfant) => { enfant.parent = null; });
    this.texte = '';
    this.enfants = [];
    this.append(...noeuds);
  }

  remove() {
    if (!this.parent) return;
    this.parent.enfants = this.parent.enfants.filter((enfant) => enfant !== this);
    this.parent = null;
  }

  addEventListener(type, ecouteur) {
    if (!this.ecouteurs.has(type)) this.ecouteurs.set(type, []);
    this.ecouteurs.get(type).push(ecouteur);
  }

  /** Déclenche un événement et renvoie la promesse des écouteurs (comme un vrai tap). */
  dispatch(type) {
    const evenement = {
      type,
      cible: this,
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    const retours = (this.ecouteurs.get(type) || []).map((ecouteur) => ecouteur(evenement));
    return Promise.all(retours);
  }

  tapCase(checked) {
    this.checked = checked;
    return this.dispatch('change');
  }

  querySelector(selecteur) { return this.querySelectorAll(selecteur)[0] || null; }

  querySelectorAll(selecteur) {
    const trouves = [];
    const parcourir = (noeud) => {
      for (const enfant of noeud.enfants) {
        if (correspond(enfant, selecteur)) trouves.push(enfant);
        parcourir(enfant);
      }
    };
    parcourir(this);
    return trouves;
  }
}

function creerPage() {
  const racine = new Element('body');
  const liste = new Element('ul');
  liste.setAttribute('id', 'articles');
  const form = new Element('form');
  form.setAttribute('id', 'ajout');
  const champ = new Element('input');
  champ.setAttribute('id', 'article');
  const message = new Element('p');
  message.setAttribute('id', 'message');
  form.append(champ);
  racine.append(liste, form, message);
  const document = {
    createElement: (tag) => new Element(tag),
    querySelector: (selecteur) => racine.querySelector(selecteur),
    querySelectorAll: (selecteur) => racine.querySelectorAll(selecteur),
  };
  return { racine, document, liste, form, champ, message };
}

// ---------------------------------------------------------------------------
// Serveur réel : le client (public/app.js) est exécuté contre l'API HTTP réelle.
// ---------------------------------------------------------------------------

let serveur;
let baseUrl;
let appels;

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

function fetchInstrumente(url, options) {
  const absolue = String(url).startsWith('http') ? String(url) : `${baseUrl}${url}`;
  appels.push({
    url: absolue,
    method: (options && options.method) || 'GET',
    body: options && options.body ? JSON.parse(options.body) : null,
  });
  return fetch(absolue, options);
}

/** Monte la page et exécute le vrai public/app.js avec le vrai serveur en face. */
function ouvrirPage(code) {
  appels = [];
  const page = creerPage();
  const intervalles = [];
  const sandbox = vm.createContext({
    document: page.document,
    fetch: fetchInstrumente,
    window: { location: { pathname: `/l/${code}` } },
    setInterval: (fonction, delai) => {
      intervalles.push({ fonction, delai });
      return intervalles.length;
    },
    console,
  });
  vm.runInContext(sourceApp, sandbox, { filename: 'public/app.js' });
  return {
    ...page,
    lignes: () => page.liste.querySelectorAll('li'),
    getListes: () => appels.filter((appel) => appel.method === 'GET' && appel.url === `${baseUrl}/api/lists/${code}`),
    parMethode: (methode) => appels.filter((appel) => appel.method === methode),
    intervalles,
  };
}

async function attendre(predicat, description, delai = 2000) {
  const fin = Date.now() + delai;
  while (Date.now() < fin) {
    if (predicat()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`délai dépassé : ${description}`);
}

async function creerListe() {
  const reponse = await fetch(`${baseUrl}/`, { redirect: 'manual' });
  return reponse.headers.get('location').slice('/l/'.length);
}

async function ajouterViaApi(code, text) {
  const reponse = await fetch(`${baseUrl}/api/lists/${code}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  assert.equal(reponse.status, 201);
  return reponse.json();
}

function etatEnBase(id) {
  return db.prepare('SELECT checked FROM items WHERE id = ?').get(id)?.checked;
}

function existeEnBase(id) {
  return db.prepare('SELECT COUNT(*) AS total FROM items WHERE id = ?').get(id).total === 1;
}

// ---------------------------------------------------------------------------
// Le contrat CSS et HTML sur lequel l'UI mobile s'appuie.
// ---------------------------------------------------------------------------

function declarations(selecteur) {
  const regles = sourceCss.match(/[^{}]+\{[^{}]*\}/g) || [];
  return regles
    .filter((regle) => {
      const selecteurs = regle.slice(0, regle.indexOf('{')).split(',').map((s) => s.trim());
      return selecteurs.includes(selecteur);
    })
    .map((regle) => regle.slice(regle.indexOf('{') + 1, regle.lastIndexOf('}')))
    .join(';');
}

function propriete(bloc, nom) {
  const trouve = new RegExp(`(?:^|;)\\s*${nom}\\s*:\\s*([^;]+)`).exec(bloc);
  return trouve ? trouve[1].trim() : null;
}

function pixels(valeur) {
  const trouve = /^(\d+)px$/.exec(String(valeur));
  return trouve ? Number(trouve[1]) : null;
}

test('le contrat HTML/CSS de l\'UI mobile : ancrages, cibles 44x44 px, texte coché barré', () => {
  for (const ancrage of ['id="articles"', 'id="ajout"', 'id="article"', 'id="message"']) {
    assert.ok(sourceHtml.includes(ancrage), `index.html doit contenir ${ancrage}`);
  }
  assert.match(sourceHtml, /src="\/app\.js"/);
  assert.match(sourceHtml, /href="\/styles\.css"/);

  const cible = [
    ['.article-checkbox', 'width', 'width de la case'],
    ['.article-checkbox', 'height', 'height de la case'],
    ['.article-supprimer', 'min-width', 'min-width du bouton Supprimer'],
    ['.article-supprimer', 'min-height', 'min-height du bouton Supprimer'],
    ['button', 'min-width', 'min-width des boutons'],
    ['button', 'min-height', 'min-height des boutons'],
  ];
  for (const [selecteur, nom, description] of cible) {
    const valeur = pixels(propriete(declarations(selecteur), nom));
    assert.ok(valeur >= 44, `${description} : ${valeur}px (>= 44px attendu)`);
  }

  const texteCoche = declarations('.article-coche .article-texte');
  assert.equal(propriete(texteCoche, 'text-decoration'), 'line-through');
  assert.ok(propriete(texteCoche, 'color'), 'le texte coché doit aussi être atténué');
});

test('le client programme un polling local de 3 secondes sans WebSocket ni URL externe', async () => {
  assert.doesNotMatch(sourceApp, /new\s+WebSocket\s*\(/);
  assert.doesNotMatch(sourceApp, /https?:\/\//);

  const code = await creerListe();
  const page = ouvrirPage(code);
  await attendre(() => page.getListes().length === 1, 'la liste doit être chargée');
  assert.deepEqual(page.intervalles.map(({ delai }) => delai), [3000]);

  page.champ.value = 'en cours de frappe';
  await page.intervalles[0].fonction();
  assert.equal(page.champ.value, 'en cours de frappe');
  assert.equal(page.form.querySelector('#article'), page.champ, 'le champ conserve son nœud DOM');
});

// ---------------------------------------------------------------------------
// Comportement du client, sur l'API réelle.
// ---------------------------------------------------------------------------

test('la liste chargée affiche, pour chaque article, une case à cocher et un bouton Supprimer', async () => {
  const code = await creerListe();
  await ajouterViaApi(code, 'pain');
  await ajouterViaApi(code, 'lait');

  const page = ouvrirPage(code);
  await attendre(() => page.lignes().length === 2, 'les deux articles doivent s\'afficher');

  for (const ligne of page.lignes()) {
    assert.equal(ligne.querySelectorAll('input[type="checkbox"]').length, 1, 'une case par article');
    assert.equal(ligne.querySelector('input[type="checkbox"]').type, 'checkbox');
    const bouton = ligne.querySelector('button');
    assert.equal(bouton.textContent, 'Supprimer');
    assert.equal(bouton.type, 'button', 'le bouton ne doit pas soumettre le formulaire');
  }

  assert.deepEqual(
    page.lignes().map((ligne) => ligne.querySelector('.article-texte').textContent),
    ['pain', 'lait'],
  );
  assert.equal(page.getListes().length, 1, 'la liste n\'est chargée qu\'une fois');
});

test('cocher puis décocher un article en un tap : PATCH checked, état visuel local, aucun rechargement', async () => {
  const code = await creerListe();
  const article = await ajouterViaApi(code, 'pain');

  const page = ouvrirPage(code);
  await attendre(() => page.lignes().length === 1, 'l\'article doit s\'afficher');
  const avant = page.getListes().length;
  const ligne = page.lignes()[0];
  const coche = ligne.querySelector('input[type="checkbox"]');
  assert.equal(coche.checked, false);

  await coche.tapCase(true); // un seul tap
  await attendre(() => etatEnBase(article.id) === 1, 'le cochage doit atteindre le serveur');

  assert.equal(coche.checked, true);
  assert.equal(ligne.classList.contains('article-coche'), true, 'l\'article coché change d\'état visuel');
  assert.equal(page.message.textContent, 'Article coché.');

  const patchs = page.parMethode('PATCH');
  assert.equal(patchs.length, 1, 'un seul tap = un seul PATCH');
  assert.equal(patchs[0].url, `${baseUrl}/api/lists/${code}/items/${article.id}`);
  assert.deepEqual(patchs[0].body, { checked: true });

  await coche.tapCase(false); // un seul tap
  await attendre(() => etatEnBase(article.id) === 0, 'le décochage doit atteindre le serveur');

  assert.equal(coche.checked, false);
  assert.equal(ligne.classList.contains('article-coche'), false);
  assert.deepEqual(page.parMethode('PATCH')[1].body, { checked: false });
  assert.equal(page.getListes().length, avant, 'aucun rechargement de la liste');
});

test('un refus du serveur ne touche pas l\'affichage : case restaurée, ligne conservée, message affiché', async () => {
  // PATCH refusé : l'article a disparu côté serveur avant le tap (autre appareil plus rapide).
  const code = await creerListe();
  const article = await ajouterViaApi(code, 'pain');
  const page = ouvrirPage(code);
  await attendre(() => page.lignes().length === 1, 'l\'article doit s\'afficher');
  const avant = page.getListes().length;
  const ligne = page.lignes()[0];
  const coche = ligne.querySelector('input[type="checkbox"]');
  assert.equal((await fetch(`${baseUrl}/api/lists/${code}/items/${article.id}`, { method: 'DELETE' })).status, 204);

  await coche.tapCase(true);
  await attendre(() => page.message.textContent === 'Mise à jour impossible.', 'le message d\'erreur doit s\'afficher');
  assert.equal(coche.checked, false, 'la case doit revenir à son état précédent');
  assert.equal(ligne.classList.contains('article-coche'), false);
  assert.equal(page.lignes().length, 1, 'l\'article reste affiché');
  assert.equal(page.getListes().length, avant, 'aucun rechargement de la liste');

  // DELETE refusé (404 sur un article déjà supprimé ailleurs).
  const codeSuppression = await creerListe();
  const autre = await ajouterViaApi(codeSuppression, 'lait');
  const pageSuppression = ouvrirPage(codeSuppression);
  await attendre(() => pageSuppression.lignes().length === 1, 'l\'article doit s\'afficher');
  const ligneSuppression = pageSuppression.lignes()[0];
  const bouton = ligneSuppression.querySelector('button');
  assert.equal((await fetch(`${baseUrl}/api/lists/${codeSuppression}/items/${autre.id}`, { method: 'DELETE' })).status, 204);

  await bouton.dispatch('click');
  await attendre(() => pageSuppression.message.textContent === 'Suppression impossible.', 'le message d\'échec doit s\'afficher');
  assert.equal(pageSuppression.lignes().length, 1, 'la ligne ne doit pas disparaître sur un échec');
  assert.equal(bouton.disabled, false, 'le bouton doit redevenir actif');
});

test('supprimer un article en un tap : DELETE, la ligne disparaît du DOM, aucun rechargement', async () => {
  const code = await creerListe();
  const premier = await ajouterViaApi(code, 'pain');
  const second = await ajouterViaApi(code, 'lait');

  const page = ouvrirPage(code);
  await attendre(() => page.lignes().length === 2, 'les deux articles doivent s\'afficher');
  const avant = page.getListes().length;
  const cible = page.lignes()[1];

  await cible.querySelector('button').dispatch('click'); // un seul tap
  await attendre(() => !existeEnBase(second.id), 'la suppression doit atteindre le serveur');

  assert.equal(page.lignes().length, 1);
  assert.deepEqual(
    page.lignes().map((ligne) => ligne.querySelector('.article-texte').textContent),
    ['pain'],
  );
  assert.ok(existeEnBase(premier.id), 'l\'autre article ne doit pas être touché');
  assert.equal(page.message.textContent, 'Article supprimé.');

  const suppressions = page.parMethode('DELETE');
  assert.equal(suppressions.length, 1, 'un seul tap = un seul DELETE');
  assert.equal(suppressions[0].url, `${baseUrl}/api/lists/${code}/items/${second.id}`);
  assert.equal(page.getListes().length, avant, 'aucun rechargement de la liste');
});

test('ajouter un article en un tap : POST, la ligne apparaît, le champ est vidé, aucun rechargement', async () => {
  const code = await creerListe();

  const page = ouvrirPage(code);
  await attendre(() => page.getListes().length === 1, 'la liste doit être chargée');
  const avant = page.getListes().length;

  page.champ.value = '  pommes  ';
  await page.form.dispatch('submit'); // un seul tap sur « Ajouter »
  await attendre(() => page.lignes().length === 1, 'l\'article ajouté doit s\'afficher');

  assert.equal(page.lignes()[0].querySelector('.article-texte').textContent, 'pommes');
  assert.equal(page.champ.value, '');
  assert.equal(page.message.textContent, 'Article ajouté.');
  assert.equal(page.lignes()[0].querySelectorAll('input[type="checkbox"]').length, 1);
  assert.equal(page.lignes()[0].querySelector('button').textContent, 'Supprimer');

  const ajouts = page.parMethode('POST');
  assert.equal(ajouts.length, 1);
  assert.equal(ajouts[0].url, `${baseUrl}/api/lists/${code}/items`);
  assert.deepEqual(ajouts[0].body, { text: 'pommes' });
  assert.equal(page.getListes().length, avant, 'aucun rechargement de la liste');
});

test('cycle ajouter → cocher → supprimer : trois taps, un seul chargement de liste', async () => {
  const code = await creerListe();
  await ajouterViaApi(code, 'beurre');
  await ajouterViaApi(code, 'pain');

  const page = ouvrirPage(code);
  await attendre(() => page.lignes().length === 2, 'les articles initiaux doivent s\'afficher');

  // 1. Ajouter (un tap)
  page.champ.value = 'confiture';
  await page.form.dispatch('submit');
  await attendre(() => page.lignes().length === 3, 'le nouvel article doit s\'afficher');

  // 2. Cocher un article existant (un tap)
  const aCocher = page.lignes()[0];
  await aCocher.querySelector('input[type="checkbox"]').tapCase(true);
  await attendre(
    () => db.prepare('SELECT checked FROM items WHERE list_code = ? AND text = ?').get(code, 'beurre')?.checked === 1,
    'le cochage doit atteindre le serveur',
  );
  assert.equal(aCocher.classList.contains('article-coche'), true, 'l\'article coché doit changer d\'état');

  // 3. Supprimer un autre article (un tap)
  const aSupprimer = page.lignes()[1];
  await aSupprimer.querySelector('button').dispatch('click');
  await attendre(() => page.lignes().length === 2, 'l\'article supprimé doit disparaître');

  assert.equal(page.lignes()[0].querySelector('.article-texte').textContent, 'beurre');
  assert.equal(page.lignes()[0].classList.contains('article-coche'), true);
  assert.equal(page.lignes()[1].querySelector('.article-texte').textContent, 'confiture');
  assert.deepEqual(
    db.prepare('SELECT text, checked FROM items WHERE list_code = ? ORDER BY id').all(code),
    [{ text: 'beurre', checked: 1 }, { text: 'confiture', checked: 0 }],
  );

  assert.equal(page.getListes().length, 1, 'les trois actions ne rechargent jamais la liste');
  assert.deepEqual(
    page.parMethode('POST').length + page.parMethode('PATCH').length + page.parMethode('DELETE').length,
    3,
    'trois actions = trois appels API',
  );
});
