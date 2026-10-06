import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, MENU_PAGES, MENU_TOP, LABEL_MAX, fitLabel } from '../../extension/lib/menu.js';
import { nameKey } from '../../extension/lib/names.js';

test('menu : rubriques et pages dans l’ordre', () => {
  assert.deepEqual(
    MENU.map((r) => r.title),
    [
      'Dashboard',
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
    [0, 2, 6, 6, 10, 8, 3, 0, 0, 8],
  );
  assert.equal(MENU_PAGES.length, 46);
  assert.equal(MENU_PAGES[0], 'Dashboard', 'tout en haut de la liste');
  assert.deepEqual(
    MENU_TOP.map((r) => r.title),
    ['Dashboard'],
  );
  assert.equal(MENU_PAGES.at(-1), 'Ecriture Budgétaire');
});

test('menu : liens directs et sous-rubrique', () => {
  assert.ok(MENU_PAGES.includes('Absentéisme') && MENU_PAGES.includes('Publisher'), 'liens directs = pages');
  const finance = MENU.find((r) => r.title === 'Finance').pages;
  const abc = finance.find((p) => p.name === 'Coûts directs av Répart.');
  assert.equal(abc.label, 'ABC › Coûts directs av Répart.');
  assert.equal(abc.title, 'Méthode ABC - Synthèse › Coûts directs av Répart.', 'nom complet en info-bulle');
  assert.ok(!MENU_PAGES.includes('Méthode ABC - Synthèse'), 'la sous-rubrique n’est pas une page');
});

test('menu : noms de pages uniques', () => {
  assert.equal(new Set(MENU_PAGES.map(nameKey)).size, MENU_PAGES.length);
});

test('menu : libellés courts, la liste déroulante ne déborde pas du panneau', () => {
  const labels = MENU.flatMap((r) => [r.title, ...(r.pages || []).map((p) => p.label)]);
  const long = labels.filter((l) => l.length > LABEL_MAX);
  assert.deepEqual(long, [], `libellés de plus de ${LABEL_MAX} caractères`);
  assert.equal(fitLabel('Liste Mensuelle'), 'Liste Mensuelle');
  const fitted = fitLabel('Une page saisie librement avec un nom vraiment très long');
  assert.equal(fitted.length, LABEL_MAX);
  assert.equal(fitted, 'Une page saisie librement avec un…');
});
