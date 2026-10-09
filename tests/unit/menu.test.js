import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PAGES,
  PAGE_NAMES,
  HOME,
  VERSIONS,
  APPS_TOTAL,
  LABEL_MAX,
  fitLabel,
  compareVersions,
  sameVersion,
  analysedVersion,
  pageChoices,
} from '../../extension/lib/menu.js';
import { nameKey } from '../../extension/lib/names.js';

const page = (name) => PAGES.find((p) => p.name === name);
const names = (choices) => choices.groups.flatMap((g) => g.pages.map((p) => p.name));

test('analyse des menus : 3 versions, 2 applications chacune, occurrences sur 6', () => {
  assert.deepEqual(VERSIONS, ['3.19.10', '3.24.01', '3.28.00']);
  assert.equal(APPS_TOTAL, 6);
  assert.equal(PAGES.length, 119);
  assert.equal(PAGES.filter((p) => p.total >= 2).length, 50, 'pages vues dans au moins 2 applications sur 6');
  assert.deepEqual(page('Masse Salariale Croisée'), {
    name: 'Masse Salariale Croisée',
    kinds: ['sous-menu'],
    counts: [2, 2, 2],
    total: 6,
  });
  assert.equal(page('KPI RH').total, 3);
  assert.equal(new Set(PAGE_NAMES.map(nameKey)).size, PAGE_NAMES.length, 'noms uniques');
  assert.equal(PAGE_NAMES[0], HOME);
});

test('analyse des menus : menu et sous-menu du même nom réunis, libellés coupés complétés', () => {
  assert.deepEqual(page('Fiche Salarié').kinds, ['menu', 'sous-menu']);
  assert.deepEqual(page('Fiche Salarié').counts, [2, 2, 2], 'sous-menu dans les 6 applications');
  assert.deepEqual(page('Publier').counts, [0, 1, 1]);
  assert.deepEqual(page('Saisie des enveloppes par rubrique').counts, [1, 2, 1], 'avec « … par rub... »');
  assert.ok(!PAGES.some((p) => p.name.endsWith('...')), 'aucun libellé coupé');
});

test('versions : comparaison et version analysée retenue', () => {
  assert.equal(compareVersions('3.28', '3.28.00'), 0);
  assert.equal(compareVersions('3.24.01', '3.28.00'), -1);
  assert.equal(compareVersions('3.30', '3.28.00'), 1);
  assert.equal(compareVersions('3.9', '3.19.10'), -1, 'numéro par numéro, pas en texte');
  assert.ok(sameVersion('v3.28', '3.28.00'));
  assert.ok(!sameVersion('3.28.01', '3.28.00'));
  assert.ok(!sameVersion('', ''));
  assert.ok(sameVersion('Prod', 'PROD'), 'version sans numéro : même texte');
  assert.equal(analysedVersion(''), null);
  assert.deepEqual(analysedVersion('3.24.1'), { ref: '3.24.01', why: 'exact' });
  assert.deepEqual(analysedVersion('3.26'), { ref: '3.24.01', why: 'before' }, 'dernière analysée avant elle');
  assert.deepEqual(analysedVersion('5.3'), { ref: '3.28.00', why: 'before' });
  assert.deepEqual(analysedVersion('3.10'), { ref: '3.19.10', why: 'oldest' });
  assert.deepEqual(analysedVersion('PROD'), { ref: '3.28.00', why: 'latest' });
});

test('pages proposées : celles de la version, par nombre d’applications sur 6, rares comprises', () => {
  const c = pageChoices({ version: '3.28.00' });
  assert.deepEqual(
    c.groups.map((g) => [g.label, g.pages.length]),
    [
      ['6/6 applications · communes', 9],
      ['5/6 applications', 6],
      ['4/6 applications', 7],
      ['3/6 applications', 7],
      ['2/6 applications', 4],
      ['1/6 application · rares', 6],
    ],
  );
  assert.equal(c.order[0], HOME, 'page d’accueil tout en haut');
  assert.equal(c.order.length, 1 + 39);
  const totals = c.groups.flatMap((g) => g.pages.map((p) => page(p.name).total));
  assert.deepEqual(
    totals,
    [...totals].sort((a, b) => b - a),
    'triées par occurrences',
  );
  const all = names(c);
  assert.ok(all.includes('Collaborateurs') && all.includes('Pyramide') && all.includes('BDESE'));
  assert.ok(!all.includes('Pyramide des Ages') && !all.includes('NAO'), 'absentes de la 3.28.00');
  // Dans un groupe : présentes dans les 2 applications de la version d'abord
  const four = c.groups[2].pages.map((p) => p.name);
  assert.deepEqual(four.slice(-3), [
    'MS par Organisation',
    'Saisie des enveloppes par rubrique',
    'Saisie des enveloppes par service',
  ]);
  const masse = c.groups[0].pages.find((p) => p.name === 'Masse Salariale');
  assert.equal(masse.label, 'Masse Salariale (menu)');
  assert.equal(masse.title, 'Menu · 6 applications sur 6 · 2/2 en 3.28.00');

  const old = names(pageChoices({ version: '3.19.10' }));
  assert.ok(old.includes('Pyramide des Ages') && old.includes('NAO') && !old.includes('Collaborateurs'));
  assert.equal(old.length, 51);
  assert.equal(names(pageChoices({ version: '3.24.01' })).length, 97);
});

test('pages proposées : sans version, rien que l’accueil', () => {
  const c = pageChoices({ version: '  ' });
  assert.equal(c.analysed, null);
  assert.deepEqual(c.groups, []);
  assert.deepEqual(c.order, [HOME]);
  assert.ok(c.available('Pyramide des Ages'), 'sans version, aucune page écartée');
});

test('pages proposées : nouvelle version, menus de la précédente et pages mesurées dessus', () => {
  const measures = [
    { app: 'Client A', version: '3.30', page: 'Nouvelle page' },
    { app: 'Client B', version: '3.30.0', page: 'Nouvelle page' },
    { app: 'Client B', version: '3.30', page: 'Pyramide des Ages' }, // de l'analyse, absente de la 3.28.00
    { app: 'Client B', version: '3.30', page: 'Masse Salariale Croisée' }, // déjà proposée
    { app: 'Client C', version: '3.30', page: 'Autre page' },
    { app: 'Client C', version: '3.30', page: 'Écran maison', specific: true },
    { app: 'Client A', version: '3.28.00', page: 'Page de la 3.28' },
    { app: 'Client A', version: '3.24.01', page: 'Planning', specific: true },
    { app: 'Client A', version: '3.30', page: HOME },
  ];
  const c = pageChoices({ version: '3.30', client: 'client a', measures });
  assert.deepEqual(c.analysed, { ref: '3.28.00', why: 'before' });
  assert.equal(c.measured, 3);
  const [measured, specific] = c.groups.slice(-2);
  assert.equal(measured.label, 'Mesurées en 3.30 · hors analyse');
  assert.deepEqual(
    measured.pages.map((p) => [p.name, p.title]),
    [
      ['Nouvelle page', 'Mesurée chez 2 clients en 3.30'],
      ['Autre page', 'Mesurée chez 1 client en 3.30'],
      ['Pyramide des Ages', 'Mesurée chez 1 client en 3.30'],
    ],
    'les plus mesurées d’abord ; pages spécifiques et autres versions écartées',
  );
  assert.equal(specific.label, 'Spécifiques à ce client');
  assert.deepEqual(
    specific.pages.map((p) => p.name),
    ['Planning'],
  );
  assert.equal(new Set(c.order.map(nameKey)).size, c.order.length, 'aucune page en double');
  // Pages existant dans la version : de l'analyse absentes de la 3.28.00 écartées, sauf mesurées dessus
  assert.ok(c.available('Masse Salariale Croisée'));
  assert.ok(c.available('Pyramide des Ages'));
  assert.ok(!c.available('Pyramide des Anciennetés'));
  assert.ok(c.available('Page inconnue de l’analyse'));
});

test('libellés courts : la liste déroulante ne déborde pas du panneau', () => {
  assert.equal(fitLabel('Liste Mensuelle'), 'Liste Mensuelle');
  const labels = PAGES.map((p) => fitLabel(p.name));
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
