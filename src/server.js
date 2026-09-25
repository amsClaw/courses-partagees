const express = require('express');
require('./db');

const app = express();
const port = process.env.PORT || 8080;

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`Serveur démarré sur le port ${port}`);
  });
}

module.exports = app;
