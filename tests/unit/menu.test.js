import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MENU, PAGE_NAMES, HOME, LABEL_MAX, fitLabel, pageChoices } from '../../extension/lib/menu.js';
import { nameKey } from '../../extension/lib/names.js';

const menuOf = (name) => MENU.filter((m) => m.pages.includes(name)).map((m) => m.title);
const pagesOf = (title) => MENU.find((m) => m.title === title).pages;

test('menus : réunis sans doublon, dans l’ordre d’affichage', () => {
  assert.deepEqual(
    MENU.map((m) => m.title),
    [
      'NAO',
      'Fiche Salarié',
      'Listes Collaborateurs',
      'Listes des employés',
      'RH Suivi Effectifs',
      'Index F/H',
      'Publier',
      'KPI RH',
      'Index Égalité FH',
      'Masse Salariale',
      'Administration',
      'Hyp. Budgétaires',
      'Reporting Social',
    ],
  );
  assert.equal(PAGE_NAMES.length, 1 + 104);
  assert.equal(PAGE_NAMES[0], HOME);
  assert.equal(new Set(PAGE_NAMES.map(nameKey)).size, PAGE_NAMES.length, 'aucune page en double');
  assert.ok(
    MENU.every((m) => m.pages.length),
    'aucun menu vide',
  );
  assert.ok(!PAGE_NAMES.some((p) => p.endsWith('...')), 'libellés coupés complétés');
  assert.deepEqual(pagesOf('Fiche Salarié'), ['Fiche Salarié', 'Détail Paye par Salarié']);
});

test('menus : une page vue sous plusieurs menus est rangée dans le plus fréquent', () => {
  assert.deepEqual(menuOf('Absentéisme'), ['KPI RH'], 'KPI RH 3 fois, RH Suivi Effectifs 1 fois');
  assert.deepEqual(menuOf('Analyse des Salaires'), ['RH Suivi Effectifs']);
  assert.deepEqual(menuOf('Livre de Paye'), ['Masse Salariale']);
  assert.deepEqual(menuOf('Tree-View'), ['Listes des employés']);
  assert.deepEqual(menuOf('Fiche Salarié'), ['Fiche Salarié']);
  assert.ok(!MENU.some((m) => m.title === 'Collaborateurs'), 'toutes ses pages sont plus fréquentes ailleurs');
  // Variantes d'orthographe réunies
  assert.equal(MENU.filter((m) => /^hyp\. budg/i.test(m.title)).length, 1);
  assert.ok(PAGE_NAMES.includes('Liste par Rubrique') && !PAGE_NAMES.includes('Liste par Rubriques'));
});

test('menus : une page vue dans une seule application, juste en dessous de celle qui la précède', () => {
  const listes = pagesOf('Listes des employés');
  assert.deepEqual(listes.slice(0, 8), [
    'Tree-View',
    'Liste Mensuelle des Salariés',
    'Liste Annuelle des Salariés',
    'Liste des entrées',
    'Liste des sorties',
    'Liste par Rubrique',
    'Pointage des Salariés',
    'Pivot - Liste Mensuelle',
  ]);
  assert.deepEqual(pagesOf('KPI RH'), [
    'Turnover',
    'Absentéisme',
    'Effectifs Mensuels',
    'Suivi des effectifs',
    'Pyramide',
    'Publier',
  ]);
  const hyp = pagesOf('Hyp. Budgétaires');
  assert.equal(hyp[hyp.indexOf('Contrôles Effectifs') + 1], 'Contrôles des Changements');
  assert.equal(pagesOf('Masse Salariale').at(-1), 'Livre de Paye');
});

test('pages proposées : un groupe par menu, puis les pages spécifiques du client', () => {
  const measures = [
    { app: 'Client A', page: 'Planning', specific: true },
    { app: 'client a', page: 'Écran maison', specific: true },
    { app: 'Client A', page: 'planning', specific: true }, // même page
    { app: 'Client A', page: 'Turnover', specific: true }, // déjà dans les menus
    { app: 'Client A', page: 'Autre page' }, // non spécifique
    { app: 'Client B', page: 'Page de B', specific: true },
  ];
  const c = pageChoices({ client: 'Client A', measures });
  assert.deepEqual(
    c.groups.map((g) => g.label),
    [...MENU.map((m) => m.title), 'Spécifiques à ce client'],
  );
  assert.deepEqual(
    c.groups.at(-1).pages.map((p) => p.name),
    ['Écran maison', 'Planning'],
  );
  assert.deepEqual(c.order, [...PAGE_NAMES, 'Écran maison', 'Planning'], 'accueil puis menus dans l’ordre');
  assert.deepEqual(
    pageChoices({ measures }).groups.map((g) => g.label),
    MENU.map((m) => m.title),
    'sans client : les menus seuls',
  );
});

test('libellés courts : la liste déroulante ne déborde pas du panneau', () => {
  assert.equal(fitLabel('Liste Mensuelle'), 'Liste Mensuelle');
  const labels = PAGE_NAMES.map(fitLabel);
  assert.deepEqual(
    labels.filter((l) => l.length > LABEL_MAX),
    [],
  );
  assert.equal(new Set(labels).size, labels.length, 'deux pages, deux libellés distincts');
  assert.equal(fitLabel('Ecart Budgétaire - Coûts par OD et par Rubriques'), 'Ecart Budgétaire… par Rubriques');
  assert.equal(fitLabel('Ecart Budgétaire - Coûts par OD et par comptes'), 'Ecart Budgétaire… et par comptes');
  const fitted = fitLabel('Une page saisie librement avec un nom vraiment très long');
  assert.equal(fitted.length, LABEL_MAX);
  assert.equal(fitted, 'Une page saisie libreme… très long');
  assert.equal(fitLabel('x'.repeat(50)), `${'x'.repeat(LABEL_MAX - 1)}…`, 'un seul mot : coupé à la fin');
});
