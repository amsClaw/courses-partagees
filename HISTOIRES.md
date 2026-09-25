# HISTOIRES — Courses partagées

Découpage en 7 histoires, 1 à 4h chacune, à river dans l'ordre. Plafonds à respecter par
histoire (≤500 lignes/fichier, ≤1500 lignes total projet, ≤20 fichiers).

## Histoire 1 — Squelette du dépôt, base SQLite, et harnais de test
**Titre :** Initialiser le projet Express + SQLite avec `npm start`/`/health` et `npm test`
réel.
**Critères d'acceptation :**
- `package.json` avec `express` et `better-sqlite3` en dépendances, script `test` utilisant
  Node natif (`node --test`) ou une lib ultra-légère (justifier en 1 ligne dans le README).
- `src/db.js` initialise la base SQLite au chemin `process.env.DB_PATH || './data/db.sqlite'`
  et crée les tables `lists(code TEXT PRIMARY KEY, created_at INTEGER)` et
  `items(id INTEGER PRIMARY KEY, list_code TEXT, text TEXT, checked INTEGER DEFAULT 0,
  created_at INTEGER)` si elles n'existent pas.
- `src/server.js` démarre Express sur `process.env.PORT || 8080` et expose `GET /health` →
  200 `{"status":"ok"}`.
- `test/db.test.js` : au moins 1 test réel qui initialise la base sur un fichier temporaire
  et vérifie que les tables existent (ex. `PRAGMA table_info`).
- `npm test` s'exécute en CLI et rapporte au moins 1 test passant, zéro échec.
- `PORT=9191 npm start` puis requête sur `/health` répond 200 sur le port 9191.
**Ne touche pas :** routes de listes/articles, UI, dépôt GitHub distant (le push est fait
mais sans logique métier encore).
**Résultat visible :** sortie terminal de `npm test` avec un test vert, et `curl` sur
`/health` renvoyant 200.

## Histoire 2 — Création et lecture d'une liste par code (API)
**Titre :** Générer un code de liste unique et exposer la création/lecture via API.
**Critères d'acceptation :**
- `src/lists.js` expose une fonction `generateListCode()` : 6 caractères alphanumériques
  minuscules, excluant `0`, `o`, `1`, `l`, `i` (alphabet réduit, cf. SPEC H1).
- `GET /` crée une nouvelle liste (code unique vérifié en base) et redirige (302/303) vers
  `/l/:code`.
- `GET /api/lists/:code` renvoie `{code, items: []}` en JSON pour un code existant, et 404
  pour un code inconnu.
- Test unitaire : `generateListCode()` appelée 1000 fois ne produit aucun caractère interdit
  et respecte la longueur 6.
- Test d'intégration : deux appels successifs à `GET /` renvoient deux codes différents (pas
  de collision sur un petit échantillon), et `GET /api/lists/:code` sur un code inexistant
  renvoie bien 404.
**Ne touche pas :** ajout/suppression d'articles, UI, polling.
**Résultat visible :** `npm test` toujours vert avec les nouveaux tests ; `curl -i
localhost:8080/` montre l'en-tête `Location: /l/<code>`.

## Histoire 3 — Ajout et suppression d'articles (API)
**Titre :** Permettre d'ajouter et de supprimer des articles d'une liste via API.
**Critères d'acceptation :**
- `POST /api/lists/:code/items` avec `{"text": "..."}` insère un article (texte non vide,
  trim appliqué, rejet 400 si vide après trim) et renvoie l'article créé avec son `id`.
- `DELETE /api/lists/:code/items/:id` supprime l'article s'il appartient à `:code` ; renvoie
  404 si l'article n'existe pas ou appartient à une autre liste (isolation, cf. SPEC §9).
- `GET /api/lists/:code` renvoie désormais les articles dans l'ordre d'ajout (`created_at`
  croissant, cf. SPEC H3).
- Test : ajouter un article dans la liste A, un autre dans la liste B, vérifier qu'aucun
  n'apparaît dans l'autre liste (isolation).
- Test : tenter de supprimer l'article de la liste A via l'URL de la liste B → 404, l'article
  reste présent dans A.
**Ne touche pas :** cochage, UI, polling.
**Résultat visible :** tests verts couvrant l'ajout, la suppression, et l'isolation entre
deux listes.

## Histoire 4 — Cochage/décochage d'un article (API)
**Titre :** Permettre de marquer un article comme fait/à faire.
**Critères d'acceptation :**
- `PATCH /api/lists/:code/items/:id` avec `{"checked": true|false}` met à jour l'état ; 404
  si l'article n'existe pas dans cette liste.
- `GET /api/lists/:code` renvoie l'état `checked` (booléen) pour chaque article.
- Test : créer un article, le cocher, vérifier via `GET` que `checked: true` ; le décocher,
  vérifier `checked: false`.
- Test de régression : les tests des histoires 2-3 restent verts.
**Ne touche pas :** UI, polling, suppression groupée (hors périmètre, cf. SPEC H4).
**Résultat visible :** tests verts sur le cycle cocher/décocher, `npm test` sans régression.

## Histoire 5 — Page mobile `/l/:code` : affichage et ajout d'articles
**Titre :** Construire la vue principale mobile-first qui affiche et permet d'ajouter des
articles.
**Critères d'acceptation :**
- `GET /l/:code` sert une page HTML statique (pas de moteur de template lourd — fichier
  HTML servi par Express, JS vanilla) qui appelle `GET /api/lists/:code` au chargement et
  affiche les articles.
- Un champ texte + bouton « Ajouter » en haut ou en bas de la page (accessible sans scroll)
  permet de `POST` un nouvel article ; le champ se vide après ajout.
- CSS mobile-first minimal (pas de framework), boutons et cases à cocher avec
  `min-height`/`min-width` ≥ 44px.
- Sur viewport 375×667 : pas de scroll horizontal (`document.body.scrollWidth <=
  document.body.clientWidth`), pas de superposition visible avec 5 articles affichés.
- `GET /l/:code` sur un code inexistant renvoie 404 (pas de page blanche silencieuse).
**Ne touche pas :** cochage/suppression côté UI (histoire 6), polling multi-appareils
(histoire 7), logique API déjà figée aux histoires 2-4.
**Résultat visible :** capture d'écran de la page sur 375×667 montrant la liste et le champ
d'ajout, sans scroll horizontal.

## Histoire 6 — Cochage et suppression depuis l'UI mobile
**Titre :** Rendre chaque article cochable et supprimable directement depuis la page.
**Critères d'acceptation :**
- Chaque article affiche une case à cocher (tape = `PATCH checked`) et un bouton
  « Supprimer » (tape = `DELETE`), tous deux ≥ 44×44 px de zone cliquable.
- Un article coché change visuellement d'état (ex. texte barré/atténué) sans rechargement de
  page complet.
- Après suppression, l'article disparaît de la liste affichée sans rechargement complet.
- Vérification manuelle sur 375×667 : cocher un article, en supprimer un autre, ajouter un
  nouveau — trois actions en un seul tap chacune, aucun chevauchement d'éléments pendant ces
  actions (cf. SPEC Holdout 3).
**Ne touche pas :** synchronisation entre plusieurs appareils (histoire 7 — cette histoire
ne fait qu'appeler l'API depuis le même onglet).
**Résultat visible :** capture d'écran avant/après un cycle ajouter → cocher → supprimer sur
375×667.

## Histoire 7 — Synchronisation multi-appareils par polling + preuve de conformité
**Titre :** Ajouter le polling client (2-5 s) pour propager les changements entre appareils,
et documenter la conformité à la SPEC.
**Critères d'acceptation :**
- Le JS client relance `GET /api/lists/:code` toutes les 3 secondes (`setInterval`, cf. SPEC
  H6) et met à jour le DOM sans perdre le focus du champ de saisie en cours de frappe.
- Aucun `new WebSocket(` ni URL externe `http(s)://` dans le JS livré (vérifiable par
  lecture du code).
- `README.md` : comment lancer (`npm install`, `npm test`, `npm start`, variables `PORT` et
  `DB_PATH`), choix techniques (format du code liste, fréquence de polling) avec renvoi à
  `SPEC.md`.
- `README.md` : un **guide d'utilisation** écrit pour l'utilisateur final (pas pour un
  développeur) — comment créer une liste, la partager (le code/lien), ajouter/cocher/
  supprimer un article, et ce que fait le rafraîchissement automatique entre appareils.
  Écran par écran, pas une liste de routes API (règle d'usine, `docs/contrats/CARTE.md`,
  « La dernière histoire d'un produit »).
- Preuve écrite dans le README (ou script `test/holdout-manual.md`) du déroulé du Holdout 1
  de la SPEC : deux clients distincts, actions de A, délai d'observation, résultat constaté
  côté B.
- Confirmation que `grep -r "/Users/\|/home/"` sur `src/` ne renvoie rien (aucun chemin
  absolu local, cf. SPEC §8).
**Ne touche pas :** logique de calcul/API déjà figée (histoires 1-4), design visuel au-delà
du nécessaire (histoires 5-6).
**Résultat visible :** README à jour + trace du scénario Holdout 1 rejouée manuellement, et
sortie de la commande `grep` de vérification des chemins absolus (vide).
