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
