const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
require('./db');
const { TEXTE_MAX, addItem, createList, getList, removeItem, setItemChecked } = require('./lists');

const app = express();
const port = process.env.PORT || 8080;

app.disable('x-powered-by');
app.use(express.json());

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/styles.css', (_req, res) => {
  res.type('css').send(fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css')));
});

app.get('/app.js', (_req, res) => {
  res.type('js').send(fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js')));
});

// Crée une liste neuve et redirige vers sa page (SPEC §3, H2).
app.get('/', (_req, res) => {
  const code = createList();
  res.redirect(302, `/l/${code}`);
});

app.get('/api/lists/:code', (req, res) => {
  const list = getList(req.params.code);
  if (!list) {
    res.status(404).json({ error: 'liste inconnue' });
    return;
  }
  res.json(list);
});

app.get('/l/:code', (req, res) => {
  if (!getList(req.params.code)) {
    res.status(404).send('Liste inconnue');
    return;
  }
  res.type('html').send(fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html')));
});

app.post('/api/lists/:code/items', (req, res) => {
  if (typeof req.body?.text !== 'string' || req.body.text.trim() === '') {
    res.status(400).json({ error: 'le texte est obligatoire' });
    return;
  }
  const text = req.body.text.trim();
  if (text.length > TEXTE_MAX) {
    res.status(400).json({ error: `le texte dépasse ${TEXTE_MAX} caractères` });
    return;
  }
  const item = addItem(req.params.code, text);
  if (!item) {
    res.status(404).json({ error: 'liste inconnue' });
    return;
  }
  res.status(201).json(item);
});

app.delete('/api/lists/:code/items/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1 || !removeItem(req.params.code, id)) {
    res.status(404).json({ error: 'article inconnu' });
    return;
  }
  res.status(204).end();
});

app.patch('/api/lists/:code/items/:id', (req, res) => {
  if (typeof req.body?.checked !== 'boolean') {
    res.status(400).json({ error: 'checked doit être un booléen' });
    return;
  }
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    res.status(404).json({ error: 'article inconnu' });
    return;
  }
  const item = setItemChecked(req.params.code, id, req.body.checked);
  if (!item) {
    res.status(404).json({ error: 'article inconnu' });
    return;
  }
  res.json(item);
});

app.use((err, _req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  res.type('json');
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({ error: 'requête invalide' });
    return;
  }
  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'requête trop volumineuse' });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'erreur interne' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
  });
}

module.exports = app;
