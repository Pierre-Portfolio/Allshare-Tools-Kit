import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, MENU_PAGES } from '../../extension/lib/menu.js';
import { nameKey } from '../../extension/lib/names.js';

test('menu : rubriques et pages dans l’ordre', () => {
  assert.deepEqual(
    MENU.map((r) => r.title),
    [
      'Fiche Salarié',
      'Listes Collaborateurs',
      'RH Suivi Effectifs',
      'Masse Salariale',
      'Hyp. Budgétaires',
      'Index Egalité HF',
      'Absentéisme',
      'Publisher',
      'Finance',
    ],
  );
  assert.deepEqual(
    MENU.map((r) => (r.pages ? r.pages.length : 0)),
    [2, 6, 6, 10, 8, 3, 0, 0, 8],
  );
  assert.equal(MENU_PAGES.length, 45);
  assert.equal(MENU_PAGES[0], 'Fiche Salarié');
  assert.equal(MENU_PAGES.at(-1), 'Ecriture Budgétaire');
});

test('menu : liens directs et sous-rubrique', () => {
  assert.ok(MENU_PAGES.includes('Absentéisme') && MENU_PAGES.includes('Publisher'), 'liens directs = pages');
  const finance = MENU.find((r) => r.title === 'Finance').pages;
  const abc = finance.find((p) => p.name === 'Coûts directs av Répart.');
  assert.equal(abc.label, 'Méthode ABC - Synthèse › Coûts directs av Répart.');
  assert.ok(!MENU_PAGES.includes('Méthode ABC - Synthèse'), 'la sous-rubrique n’est pas une page');
});

test('menu : noms de pages uniques', () => {
  assert.equal(new Set(MENU_PAGES.map(nameKey)).size, MENU_PAGES.length);
});
