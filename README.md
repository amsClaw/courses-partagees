# Courses partagées

Une liste de courses commune à plusieurs téléphones : chacun ajoute, coche et supprime,
tout le monde voit la même liste.

## Lancer le projet

Depuis la racine du projet :

```bash
npm install
npm test
npm start
```

Le serveur écoute sur le port `8080` par défaut. Le port peut être changé avec `PORT`,
et le fichier SQLite avec `DB_PATH` :

```bash
PORT=9191 DB_PATH=/tmp/courses-partagees.db npm start
```

## Utiliser une liste

### 1. Créer une liste

Ouvrez l'adresse de l'application. Une liste vide est créée automatiquement et l'écran
principal s'affiche. Le lien contient un code court unique, par exemple `/l/ab12cd`.

### 2. Partager la liste

Copiez le lien dans la barre d'adresse et envoyez-le aux personnes concernées. Toute
personne qui possède ce lien peut ouvrir la même liste sur son téléphone ou ordinateur ;
aucun compte n'est nécessaire.

### 3. Ajouter un article

Sur l'écran « Ma liste de courses », écrivez l'article dans « Ajouter un article », puis
appuyez sur « Ajouter ». L'article apparaît immédiatement dans la liste.

### 4. Cocher ou supprimer un article

Touchez la case à gauche d'un article pour le marquer comme acheté, puis touchez-la à
nouveau pour le décocher. Pour retirer définitivement un article, utilisez son bouton
« Supprimer ».

### 5. Voir les changements des autres appareils

La liste est relue automatiquement toutes les 3 secondes. Si une autre personne ajoute,
coche ou supprime un article, son changement apparaît sans recharger la page. Le champ
de saisie n'est pas recréé pendant cette vérification : le texte en cours de frappe et
son focus sont conservés.

## Choix techniques et conformité à la SPEC

Le code de liste est un identifiant alphanumérique court de 6 caractères minuscules, selon
l'hypothèse H1 de `SPEC.md`. Le client utilise un polling `GET` local toutes les 3 secondes,
selon H6, plutôt qu'un WebSocket ou un service externe. La base SQLite côté serveur reste
la source de vérité ; voir `SPEC.md` pour les critères observables et les scénarios holdout.

## Preuve Holdout 1 — deux clients distincts

Scénario rejoué avec deux clients HTTP indépendants (deux processus `fetch`, chacun avec sa
propre séquence d'actions) :

```text
Client A crée une liste et Client B ouvre le même lien.
A ajoute « pommes » ; après 3,1 s, B relit la liste : « pommes » est présent.
A coche « pommes » ; après 3,1 s, B relit la liste : l'article est coché.
A supprime « pommes » ; après 3,1 s, B relit la liste : l'article a disparu.
Résultat : les trois états observés par B correspondent aux actions de A, sans rechargement
manuel de la page et sans WebSocket.
```

Sortie observée lors de la relecture avec le serveur local et deux séquences HTTP séparées
(attente de 3,1 secondes entre chaque action) :

```text
{"apresAjout":[["pommes",false]],"apresCochage":[["pommes",true]],"apresSuppression":[]}
```

Les actions sont persistées par l'API SQLite et le polling du navigateur suit exactement
la même lecture `GET /api/lists/:code` que celle utilisée par le client B.

## Vérifications

Le test automatisé utilise `node --test` et collecte les tests du dossier `test/`.
La vérification des chemins absolus locaux est vide :

```text
$ grep -r "/Users/\|/home/" src/
(aucune sortie)
```
