const assert = require('node:assert/strict');
const test = require('node:test');

const { ALPHABET, CODE_LENGTH, generateListCode } = require('../src/lists');

test('generateListCode respecte la longueur et l\'alphabet réduit (1000 tirages)', () => {
  const interdits = ['0', 'o', '1', 'l', 'i'];
  const codes = [];
  for (let index = 0; index < 1000; index += 1) {
    const code = generateListCode();
    assert.equal(code.length, CODE_LENGTH, `longueur invalide pour ${code}`);
    for (const caractere of code) {
      assert.ok(
        !interdits.includes(caractere),
        `caractère ambigu ${caractere} dans ${code}`,
      );
      assert.ok(
        ALPHABET.includes(caractere),
        `caractère hors alphabet ${caractere} dans ${code}`,
      );
    }
    codes.push(code);
  }
  // Garde-fou anti-code constant, sans dépendre d'une garantie d'unicité aléatoire.
  assert.ok(new Set(codes).size > 900, 'les codes générés doivent varier');
});
