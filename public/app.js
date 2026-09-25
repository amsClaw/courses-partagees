const code = window.location.pathname.split('/').filter(Boolean).pop();
const articles = document.querySelector('#articles');
const form = document.querySelector('#ajout');
const input = document.querySelector('#article');
const message = document.querySelector('#message');

function afficher(liste) {
  articles.replaceChildren(...liste.items.map((item) => {
    const element = document.createElement('li');
    element.textContent = item.text;
    return element;
  }));
}

async function charger() {
  const response = await fetch(`/api/lists/${encodeURIComponent(code)}`);
  if (!response.ok) throw new Error('Impossible de charger la liste');
  afficher(await response.json());
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  const response = await fetch(`/api/lists/${encodeURIComponent(code)}/items`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) {
    message.textContent = 'Ajout impossible.';
    return;
  }
  input.value = '';
  message.textContent = 'Article ajouté.';
  await charger();
});

charger().catch(() => { message.textContent = 'Impossible de charger la liste.'; });