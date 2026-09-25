const code = window.location.pathname.split('/').filter(Boolean).pop();
const articles = document.querySelector('#articles');
const form = document.querySelector('#ajout');
const input = document.querySelector('#article');
const message = document.querySelector('#message');

const urlListe = `/api/lists/${encodeURIComponent(code)}`;

/** Reflète l'état coché dans le DOM, sans recharger la liste (histoire 6). */
function appliquerEtat(ligne, coche, checked) {
  coche.checked = checked;
  ligne.classList.toggle('article-coche', checked);
}

/**
 * Construit la ligne d'un article : une case à cocher (tape = PATCH checked) et un
 * bouton « Supprimer » (tape = DELETE), tous deux sur une zone de 44x44 px minimum
 * (voir public/styles.css).
 */
function creerArticle(item) {
  const ligne = document.createElement('li');
  ligne.className = 'article';
  ligne.dataset.id = String(item.id);

  const etiquette = document.createElement('label');
  etiquette.className = 'article-case';

  const coche = document.createElement('input');
  coche.type = 'checkbox';
  coche.className = 'article-checkbox';
  coche.setAttribute('aria-label', `Cocher ${item.text}`);

  const texte = document.createElement('span');
  texte.className = 'article-texte';
  texte.textContent = item.text;

  etiquette.append(coche, texte);

  const supprimer = document.createElement('button');
  supprimer.type = 'button';
  supprimer.className = 'article-supprimer';
  supprimer.textContent = 'Supprimer';
  supprimer.setAttribute('aria-label', `Supprimer ${item.text}`);

  appliquerEtat(ligne, coche, Boolean(item.checked));

  coche.addEventListener('change', () => basculerArticle(ligne, coche, item.id));
  supprimer.addEventListener('click', () => supprimerArticle(ligne, supprimer, item.id));

  ligne.append(etiquette, supprimer);
  return ligne;
}

/** Un tap sur la case : PATCH de l'article, puis mise à jour locale (aucun rechargement). */
async function basculerArticle(ligne, coche, id) {
  const voulu = coche.checked;
  try {
    const reponse = await fetch(`${urlListe}/items/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ checked: voulu }),
    });
    if (!reponse.ok) throw new Error(`PATCH ${reponse.status}`);
    const article = await reponse.json();
    appliquerEtat(ligne, coche, Boolean(article.checked));
    message.textContent = article.checked ? 'Article coché.' : 'Article décoché.';
  } catch {
    // Le serveur reste la source de vérité : on annule le geste local.
    appliquerEtat(ligne, coche, !voulu);
    message.textContent = 'Mise à jour impossible.';
  }
}

/** Un tap sur « Supprimer » : DELETE, puis retrait de la ligne (aucun rechargement). */
async function supprimerArticle(ligne, bouton, id) {
  bouton.disabled = true;
  try {
    const reponse = await fetch(`${urlListe}/items/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    if (!reponse.ok) throw new Error(`DELETE ${reponse.status}`);
    ligne.remove();
    message.textContent = 'Article supprimé.';
  } catch {
    bouton.disabled = false;
    message.textContent = 'Suppression impossible.';
  }
}

async function charger() {
  const reponse = await fetch(urlListe);
  if (!reponse.ok) throw new Error(`GET ${reponse.status}`);
  const liste = await reponse.json();
  articles.replaceChildren(...liste.items.map((item) => creerArticle(item)));
}

// Le serveur reste la source de vérité entre deux appareils (SPEC §5, H6).
// Seul le conteneur des articles est remplacé : le champ de saisie n'est donc
// jamais recréé et conserve naturellement sa valeur et son focus pendant la frappe.
async function rafraichir() {
  try {
    await charger();
  } catch {
    // Une panne réseau transitoire ne doit pas effacer l'affichage courant.
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  try {
    const reponse = await fetch(`${urlListe}/items`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!reponse.ok) throw new Error(`POST ${reponse.status}`);
    const article = await reponse.json();
    input.value = '';
    articles.append(creerArticle(article));
    message.textContent = 'Article ajouté.';
  } catch {
    message.textContent = 'Ajout impossible.';
  }
});

charger().catch(() => {
  message.textContent = 'Impossible de charger la liste.';
});

setInterval(rafraichir, 3000);
