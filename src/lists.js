const crypto = require('node:crypto');
const db = require('./db');

// Alphabet réduit (SPEC H1) : minuscules + chiffres, sans caractères ambigus.
// Exclus : 0 et o, 1 et l et i.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 6;
const MAX_TENTATIVES = 10;

const insertList = db.prepare('INSERT INTO lists (code, created_at) VALUES (?, ?)');
const selectList = db.prepare('SELECT code, created_at FROM lists WHERE code = ?');
const selectItems = db.prepare(
  'SELECT id, text, checked FROM items WHERE list_code = ? ORDER BY created_at, id',
);
const insertItem = db.prepare(
  'INSERT INTO items (list_code, text, created_at) VALUES (?, ?, ?)',
);
const deleteItem = db.prepare('DELETE FROM items WHERE list_code = ? AND id = ?');
const updateItemChecked = db.prepare(
  'UPDATE items SET checked = ? WHERE list_code = ? AND id = ?',
);
const selectItem = db.prepare(
  'SELECT id, text, checked FROM items WHERE list_code = ? AND id = ?',
);

/** Génère un code de liste de 6 caractères (SPEC H1), sans garantie d'unicité. */
function generateListCode() {
  let code = '';
  for (let index = 0; index < CODE_LENGTH; index += 1) {
    code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  }
  return code;
}

/** Crée une liste avec un code unique vérifié en base, renvoie le code retenu. */
function createList() {
  for (let tentative = 0; tentative < MAX_TENTATIVES; tentative += 1) {
    const code = generateListCode();
    if (selectList.get(code)) continue;
    try {
      insertList.run(code, Date.now());
      return code;
    } catch (error) {
      // Collision concurrente sur la clé primaire : on retente un autre code.
      if (error.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw error;
    }
  }
  throw new Error(`code de liste introuvable après ${MAX_TENTATIVES} tentatives`);
}

/** Renvoie `{code, items}` pour un code connu, `null` sinon. */
function getList(code) {
  const list = selectList.get(code);
  if (!list) return null;
  return {
    code: list.code,
    items: selectItems.all(list.code).map((item) => ({
      id: item.id,
      text: item.text,
      checked: Boolean(item.checked),
    })),
  };
}

/** Ajoute un article à une liste connue et renvoie l'article créé. */
function addItem(code, text) {
  if (!selectList.get(code)) return null;
  const result = insertItem.run(code, text.trim(), Date.now());
  return { id: Number(result.lastInsertRowid), text: text.trim(), checked: false };
}

/** Supprime un article uniquement s'il appartient à la liste indiquée. */
function removeItem(code, id) {
  return deleteItem.run(code, id).changes > 0;
}

/**
 * Coche (`true`) ou décoche (`false`) un article de la liste indiquée et renvoie
 * l'article à jour ; `null` si l'article n'appartient pas à cette liste.
 * Idempotent : réappliquer la même valeur renvoie le même article (SPEC H4).
 */
function setItemChecked(code, id, checked) {
  updateItemChecked.run(checked ? 1 : 0, code, id);
  const item = selectItem.get(code, id);
  if (!item) return null;
  return { id: item.id, text: item.text, checked: Boolean(item.checked) };
}

module.exports = {
  ALPHABET,
  CODE_LENGTH,
  generateListCode,
  createList,
  getList,
  addItem,
  removeItem,
  setItemChecked,
};
