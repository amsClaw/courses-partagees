const express = require('express');
require('./db');
const { createList, getList } = require('./lists');

const app = express();
const port = process.env.PORT || 8080;

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
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

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
  });
}

module.exports = app;
