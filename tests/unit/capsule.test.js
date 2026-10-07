import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isSavable,
  snapshot,
  byWindow,
  describeTabs,
  host,
  clientNames,
  filterCapsules,
  searchCapsules,
  placeDone,
  closeSpans,
  anyOpen,
  reorder,
  toUrl,
  addTab,
} from '../../extension/lib/capsule.js';

const tab = (url, title = '', pinned = false) => ({ url, title, pinned });

test('snapshot : pages web de chaque fenêtre, pages internes et navigation privée ignorées', () => {
  const tabs = snapshot([
    {
      tabs: [
        tab('https://a.fr/x', '  Page   A ', true),
        tab('chrome://newtab/', 'Nouvel onglet'),
        tab('chrome-extension://abc/panel.html'),
        { pendingUrl: 'http://b.fr/', title: '' }, // onglet en cours de chargement, sans titre
      ],
    },
    { incognito: true, tabs: [tab('https://prive.fr/')] },
    { tabs: [tab('chrome://settings/')] }, // fenêtre sans page web : pas de numéro
    { tabs: [tab('file:///C:/rapport.html', 'Rapport')] },
  ]);
  assert.deepEqual(tabs, [
    { url: 'https://a.fr/x', title: 'Page A', pinned: true, win: 0 },
    { url: 'http://b.fr/', title: 'http://b.fr/', pinned: false, win: 0 },
    { url: 'file:///C:/rapport.html', title: 'Rapport', pinned: false, win: 1 },
  ]);
});

test('regroupement par fenêtre et résumé', () => {
  const tabs = [
    { url: 'https://a.fr/', win: 0 },
    { url: 'https://b.fr/', win: 1 },
    { url: 'https://c.fr/', win: 0 },
  ];
  assert.deepEqual(
    byWindow(tabs).map((g) => g.map((t) => t.url)),
    [['https://a.fr/', 'https://c.fr/'], ['https://b.fr/']],
  );
  assert.equal(describeTabs(tabs), '3 onglets · 2 fenêtres');
  assert.equal(describeTabs(tabs.slice(0, 1)), '1 onglet');
});

test('clients proposés : référentiel et mesures, sans doublon, triés', () => {
  const apps = [{ name: 'Client 10' }, { name: 'Client 2' }];
  const measures = [{ app: 'client  2' }, { app: 'Client A' }, { app: '' }];
  assert.deepEqual(clientNames(apps, measures), ['Client 2', 'Client 10', 'Client A']);
});

test('adresses : rouvrables et domaine affiché', () => {
  assert.ok(isSavable('https://a.fr') && isSavable('HTTP://a.fr') && isSavable('file:///x'));
  assert.ok(!isSavable('chrome://newtab/') && !isSavable('about:blank') && !isSavable(undefined));
  assert.equal(host('https://srv.exemple.fr:8443/app/f?p=1'), 'srv.exemple.fr:8443');
  assert.equal(host('file:///C:/x.html'), 'fichier local');
});

test('filtre : toutes, actives (non cochées) ou inactives (cochées)', () => {
  const caps = [{ id: 'a' }, { id: 'b', done: true }, { id: 'c', done: false }];
  const ids = (list) => list.map((c) => c.id);
  assert.deepEqual(ids(filterCapsules(caps, 'all')), ['a', 'b', 'c']);
  assert.deepEqual(ids(filterCapsules(caps, 'active')), ['a', 'c']);
  assert.deepEqual(ids(filterCapsules(caps, 'inactive')), ['b']);
});

test('recherche : titre, client, commentaire ou page, tous les mots, sans accents ni majuscules', () => {
  const caps = [
    { id: 'a', title: 'Ticket #4366 Stallergenes', client: '', comment: '', tabs: [] },
    { id: 'b', title: 'Habilitation', client: 'Allianz', comment: 'Nouvel alternant', tabs: [] },
    { id: 'c', title: 'Recette', client: 'CA Immo', comment: '', tabs: [tab('https://app.hubspot.com/x', 'Aide')] },
  ];
  const ids = (q) => searchCapsules(caps, q).map((c) => c.id);
  assert.deepEqual(ids(''), ['a', 'b', 'c'], 'recherche vide : toutes');
  assert.deepEqual(ids('  stallergènes '), ['a'], 'accents et majuscules ignorés');
  assert.deepEqual(ids('allianz alternant'), ['b'], 'client et commentaire');
  assert.deepEqual(ids('hubspot'), ['c'], 'adresse d’une page');
  assert.deepEqual(ids('immo aide'), ['c'], 'client et titre d’une page');
  assert.deepEqual(ids('allianz hubspot'), [], 'tous les mots');
});

test('session cochée : rangée juste après la dernière session active ; décochée : remonte avec les actives', () => {
  const caps = [{ id: 'a' }, { id: 'b' }, { id: 'c', done: false }, { id: 'x', done: true }, { id: 'y', done: true }];
  const ids = (list) => list.map((c) => c.id + (c.done ? '*' : '')).join(' ');
  assert.equal(ids(placeDone(caps, 'a', true)), 'b c a* x* y*', 'sous la dernière active, au-dessus des inactives');
  assert.equal(ids(placeDone(caps, 'c', true)), 'a b c* x* y*', 'déjà sous la dernière active');
  assert.equal(ids(placeDone(caps, 'y', false)), 'a b c y x*', 'décochée : à la suite des actives');
  assert.equal(
    ids(placeDone([{ id: 'x', done: true }, { id: 'a' }], 'a', true)),
    'x* a*',
    'aucune autre active : sur place',
  );
  assert.equal(
    ids(
      placeDone(
        [
          { id: 'x', done: true },
          { id: 'y', done: true },
        ],
        'y',
        false,
      ),
    ),
    'y x*',
    'seule active : en tête',
  );
  assert.equal(placeDone(caps, 'z', true), caps, 'session introuvable');
  assert.equal(ids(caps), 'a b c x* y*', 'liste d’origine intacte');
});

test('temps d’ouverture : fin des périodes quand leurs fenêtres se ferment', () => {
  const caps = [
    {
      id: 'a',
      spans: [
        { from: 10, to: 20 },
        { from: 30, wins: [1, 2] },
      ],
    },
    { id: 'b', spans: [{ from: 40, wins: [3] }] },
    { id: 'c' },
  ];
  assert.ok(anyOpen(caps));
  const one = closeSpans(caps, (w) => w !== 1, 50);
  assert.deepEqual(one[0].spans[1], { from: 30, wins: [2] }, 'encore une fenêtre ouverte');
  assert.equal(one[1], caps[1], 'autre capsule inchangée');
  const two = closeSpans(one, (w) => w !== 2, 60);
  assert.deepEqual(
    two[0].spans,
    [
      { from: 10, to: 20 },
      { from: 30, to: 60 },
    ],
    'dernière fenêtre fermée',
  );
  assert.equal(
    closeSpans(two, (w) => w !== 9, 70),
    null,
    'fenêtre sans capsule : rien ne change',
  );
  const restart = closeSpans(two, () => false, 35);
  assert.deepEqual(restart[1].spans, [{ from: 40, to: 40 }], 'Chrome redémarré : jamais avant le début');
  assert.ok(!anyOpen(restart));
  assert.deepEqual(
    closeSpans([{ id: 'd', spans: [{ from: 5 }] }], () => true, 9)[0].spans,
    [{ from: 5, to: 9 }],
    'sans fenêtre',
  );
  assert.deepEqual(caps[0].spans[1].wins, [1, 2], 'liste d’origine intacte');
});

test('glisser-déposer : session placée avant ou après une autre', () => {
  const caps = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
  const ids = (list) => list.map((c) => c.id).join('');
  assert.equal(ids(reorder(caps, 'd', 'a')), 'dabc', 'au-dessus de la première');
  assert.equal(ids(reorder(caps, 'a', 'd', true)), 'bcda', 'en dessous de la dernière');
  assert.equal(ids(reorder(caps, 'a', 'c')), 'bacd', 'vers le bas, au-dessus de c');
  assert.equal(ids(reorder(caps, 'd', 'b', true)), 'abdc', 'vers le haut, en dessous de b');
  assert.equal(reorder(caps, 'b', 'b'), caps, 'sur elle-même');
  assert.equal(reorder(caps, 'x', 'a'), caps, 'session introuvable');
  assert.equal(ids(caps), 'abcd', 'liste d’origine intacte');
});

test('adresse saisie pour ajouter une page', () => {
  assert.equal(toUrl('  exemple.fr/page?x=1 '), 'https://exemple.fr/page?x=1', 'https:// ajouté');
  assert.equal(toUrl('localhost:8080/app'), 'https://localhost:8080/app');
  assert.equal(toUrl('http://srv/app'), 'http://srv/app');
  assert.equal(toUrl('file:///C:/rapport.html'), 'file:///C:/rapport.html');
  assert.equal(toUrl('chrome://settings/'), '', 'page interne de Chrome');
  assert.equal(toUrl('javascript:alert(1)'), '', 'adresse invalide');
  assert.equal(toUrl('   '), '');
});

test('page ajoutée en fin de session, dans sa dernière fenêtre, sans doublon', () => {
  const tabs = [
    { url: 'https://a.fr/', title: 'A', pinned: true, win: 0 },
    { url: 'https://b.fr/', title: 'B', pinned: false, win: 1 },
  ];
  assert.deepEqual(addTab(tabs, { url: 'https://c.fr/', title: '  Page   C ' }).slice(2), [
    { url: 'https://c.fr/', title: 'Page C', pinned: false, win: 1 },
  ]);
  assert.deepEqual(addTab(tabs, { url: 'https://d.fr/' })[2].title, 'https://d.fr/', 'sans titre : l’adresse');
  assert.equal(addTab(tabs, { url: 'https://a.fr/', title: 'A bis' }), null, 'déjà dans la session');
  assert.deepEqual(addTab([], { url: 'https://a.fr/', title: 'A', pinned: true }), [
    { url: 'https://a.fr/', title: 'A', pinned: true, win: 0 },
  ]);
  assert.equal(tabs.length, 2, 'liste d’origine intacte');
});
