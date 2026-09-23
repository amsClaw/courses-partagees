# SPEC — Courses partagées

## Résultat attendu (une phrase)
Une page web mobile, accessible par un code de liste dans l'URL (ex. `/l/ab12cd`), où
plusieurs personnes ajoutent, cochent et suppriment des articles d'une même liste de
courses stockée côté serveur (SQLite), sans compte ni mot de passe, chacun voyant les
changements des autres se propager en quelques secondes.

## Exigences

1. **Stack imposée : Node.js 22 + Express, stockage SQLite (`better-sqlite3`).**
   Pas de framework front, pas de bundler, pas de service tiers.
   Critère observable : `package.json` liste `express` et `better-sqlite3` comme seules
   dépendances de production ; aucun `webpack`/`vite`/`react`/etc. dans `dependencies`.

2. **Accès par code de liste court dans l'URL, sans compte.**
   Une liste est identifiée par un code court (ex. `ab12cd`), accessible via `GET /l/:code`.
   Qui a le lien a la liste. Aucun champ email/mot de passe n'existe dans l'app.
   Critère observable : aucune route `/login`, `/register` ou `/signup` n'existe ; le DOM ne
   contient aucun champ `type="password"` ni `type="email"`.

3. **Création d'une nouvelle liste sans saisie.**
   Visiter `/` crée une nouvelle liste vide (nouveau code généré côté serveur) et redirige
   vers `/l/:code`. Aucune information personnelle n'est demandée.
   Critère observable : requête `GET /` renvoie une redirection (302/303) vers une URL
   `/l/<code>` avec un code jamais vu auparavant en base.

4. **Ajout, cochage, suppression d'articles, partagés en temps quasi-réel.**
   Depuis `/l/:code`, un utilisateur ajoute un article (texte libre), le coche/décoche
   (fait/à faire), et le supprime. Ces actions sont persistées en SQLite immédiatement.
   Critère observable : un `POST /api/lists/:code/items` suivi d'un `GET /api/lists/:code`
   (ou équivalent) depuis une session HTTP différente renvoie l'article ajouté, sans
   partager d'état en mémoire process (redémarrer le serveur ne doit pas faire perdre les
   articles).

5. **Synchronisation entre appareils sans WebSocket ni appel réseau sortant.**
   Le client interroge le serveur par polling à intervalle de 2 à 5 secondes (ou SSE), le
   serveur restant l'unique source de vérité. Le développement et les tests tournent hors
   ligne (aucune dépendance à une API tierce).
   Critère observable : le code source client ne contient ni `new WebSocket(`, ni URL
   `http(s)://` externe appelée par le JS livré ; un `setInterval`/`setTimeout` de polling
   entre 2000 et 5000 ms (ou un `EventSource`) est présent dans le JS client.

6. **Contrat de démarrage et de test.**
   `npm start` démarre le serveur sur le port `8080` par défaut, surchargeable par la
   variable d'environnement `PORT`. `GET /health` répond 200. `npm test` collecte au moins
   un test réel dès l'histoire 1, avec zéro test collecté = échec.
   Critère observable : `PORT=9191 npm start` puis `curl -s -o /dev/null -w '%{http_code}'
   http://localhost:9191/health` renvoie `200` ; `npm test` termine avec un code de sortie
   0 et un compteur de tests > 0 affiché dans la sortie.

7. **Mobile-first, une seule vue principale, cibles tactiles ≥ 44 px.**
   La page `/l/:code` est utilisable sur un écran de téléphone dans un magasin : gros
   boutons, pas de superposition, pas de scroll horizontal.
   Critère observable : sur viewport 375×667, tous les boutons interactifs (case à cocher,
   supprimer, ajouter) ont une zone cliquable ≥ 44×44 px (CSS `min-height`/`min-width` ou
   mesure DOM), et aucun élément ne dépasse la largeur de l'écran (`scrollWidth <=
   clientWidth` sur `body`).

8. **Déployable tel quel sur le VPS OVH existant (nginx + pm2).**
   Le port d'écoute (`PORT`) et le chemin du fichier SQLite (`DB_PATH`) sont fournis par
   variables d'environnement ; aucun chemin absolu local codé en dur.
   Critère observable : `grep` du code source ne trouve aucun chemin absolu de type
   `/Users/...` ou `/home/...` ; démarrer avec `DB_PATH=/tmp/test.db PORT=8080 npm start`
   crée effectivement le fichier `/tmp/test.db`.

9. **Isolation stricte entre listes.**
   Deux codes différents désignent deux listes totalement indépendantes ; aucun article
   d'une liste n'apparaît dans une autre.
   Critère observable : créer deux listes, ajouter un article distinct dans chacune, vérifier
   par `GET /api/lists/:code` que chaque liste ne renvoie que son propre article.

## Hors périmètre
- Comptes utilisateurs, authentification, mots de passe.
- Notifications push, paiement, recettes/menus.
- Historique des courses passées, statistiques, export.
- Multi-langue (l'app est en français uniquement).
- Application native (l'app est une page web responsive).
- Déploiement effectif sur le VPS (l'usine ne déploie pas — livrable = code prêt à déployer).
- Suppression automatique / expiration des listes anciennes.

## Hypothèses non prouvées

- **H1 (format du code).** Par défaut : code de 6 caractères alphanumériques minuscules,
  sans caractères ambigus (`0/o`, `1/l/i` exclus), généré aléatoirement côté serveur, avec
  vérification d'unicité en base avant insertion.
- **H2 (page d'accueil).** Par défaut : `/` ne montre aucun écran de saisie — elle crée
  systématiquement une liste neuve et redirige. Un utilisateur qui veut rejoindre une liste
  existante doit avoir reçu le lien `/l/:code` (pas de champ « entrer un code » sur `/`).
- **H3 (tri des articles).** Par défaut : les articles s'affichent dans l'ordre d'ajout
  (les plus récents en bas), sans tri alphabétique ni par catégorie, et sans distinction
  visuelle forte entre cochés/non cochés autre que l'état de la case.
- **H4 (bouton « vider les cochés »).** Par défaut : **absent** de ce périmètre. La
  suppression reste article par article. Un bouton de nettoyage groupé serait une
  amélioration future, pas un blocant pour livrer une liste partagée fonctionnelle.
- **H5 (durée de vie des listes).** Par défaut : aucune expiration ni purge automatique ;
  une liste et son contenu restent en base tant que le fichier SQLite existe. Pas de limite
  de nombre d'articles ou de listes imposée pour ce pilote.
- **H6 (fréquence de polling).** Par défaut : 3 secondes, choisie comme compromis entre
  fraîcheur perçue et charge serveur (Ams n'a pas fixé de valeur précise dans la fourchette
  2-5 s imposée).

## Scénarios holdout (recette indépendante du dev)

**Holdout 1 — Partage réel entre deux appareils (pas de fusion manuelle).**
Ouvrir `/l/:code` d'une liste existante dans deux clients HTTP distincts (deux onglets ou
deux requêtes `curl`/scripts séparés simulant deux téléphones). Depuis le client A : ajouter
un article, le cocher, puis le supprimer, avec quelques secondes d'attente entre chaque
action (le temps d'un cycle de polling). Vérifier que le client B, en interrogeant
`GET /api/lists/:code` (ou en laissant tourner son polling), voit l'article apparaître, se
cocher, puis disparaître — sans jamais recharger manuellement une « fusion » et sans aucun
appel WebSocket dans le réseau capturé.

**Holdout 2 — Isolation des listes + redémarrage serveur (persistance réelle).**
Créer deux listes distinctes (deux codes différents) via `GET /` deux fois. Ajouter un
article différent dans chacune. Arrêter puis relancer le process serveur (`npm start`).
Vérifier que : (a) chaque liste ne contient toujours que son propre article après relance
(isolation + persistance SQLite, pas de perte en mémoire) ; (b) `GET /health` répond 200
juste après le redémarrage ; (c) démarrer avec `PORT=9191 DB_PATH=/tmp/holdout.db npm start`
fonctionne sans modification de code et sert la même app sur le nouveau port, en écrivant
dans le fichier SQLite indiqué.

**Holdout 3 — Utilisabilité mobile sous contrainte.**
Sur un viewport 375×667 (iPhone SE), depuis `/l/:code` contenant déjà 5 articles dont 2
cochés : vérifier qu'on peut ajouter un 6e article, cocher un article existant, et en
supprimer un autre, chaque action en un seul tap sur une zone ≥ 44×44 px, sans qu'aucun
élément ne dépasse la largeur de l'écran ni ne se superpose à un autre pendant ces trois
actions.
