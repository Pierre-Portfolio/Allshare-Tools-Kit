import { test } from 'node:test';
import assert from 'node:assert/strict';
import { savedText } from '../../extension/lib/format.js';

test('compteur Insigth de l’accueil : clients et pages sauvegardés, accords', () => {
  assert.equal(savedText(3, 10), '3 clients et 10 pages sauvegardés');
  assert.equal(savedText(1, 1), '1 client et 1 page sauvegardés');
  assert.equal(savedText(2, 0), '2 clients sauvegardés');
  assert.equal(savedText(1, 0), '1 client sauvegardé');
  assert.equal(savedText(0, 10), '10 pages sauvegardées');
  assert.equal(savedText(0, 1), '1 page sauvegardée');
  assert.equal(savedText(1500, 20), '1 500 clients et 20 pages sauvegardés');
  assert.equal(savedText(0, 0), '');
});
