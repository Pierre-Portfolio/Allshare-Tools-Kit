import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normName, nameKey, canonical, suggestApp, nextPage } from '../../extension/lib/names.js';

test('normalisation et orthographe canonique', () => {
  assert.equal(normName('  Client   A '), 'Client A');
  assert.equal(nameKey('Client  A'), nameKey('client a'));
  assert.equal(canonical('client  a', ['Client A', 'Client B']), 'Client A');
  assert.equal(canonical('Client C', ['Client A']), 'Client C');
});

test('suggestApp : URL du référentiel, puis mesures du même site', () => {
  const apps = [
    { name: 'Client A', baseUrls: ['https://srv/clientA/'] },
    { name: 'Client Z', baseUrls: [] },
  ];
  const measures = [
    { app: 'Client B', startUrl: 'https://srv/clientB/accueil' },
    { app: 'Client C', startUrl: 'https://clientc.fr/accueil' },
    { app: 'Client D', startUrl: 'https://partage.fr/x' },
    { app: 'Client E', startUrl: 'https://partage.fr/y' },
  ];
  assert.equal(suggestApp('https://srv/clientA/factures', apps, measures), 'Client A');
  assert.equal(suggestApp('https://srv/clientB/factures/3', apps, measures), 'Client B');
  assert.equal(suggestApp('https://clientc.fr/factures', apps, measures), 'Client C', 'seule appli sur cet hôte');
  assert.equal(suggestApp('https://partage.fr/z', apps, measures), null, 'ambigu : pas de suggestion');
  assert.equal(suggestApp('https://inconnu.fr/', apps, measures), null);
  assert.equal(suggestApp('chrome://newtab', apps, measures), null);
});

test('nextPage : page suivante non mesurée, dans l’ordre du référentiel', () => {
  const pages = ['Accueil', 'Clients', 'Fiche client', 'Factures'];
  const done = new Set(['accueil', 'clients', 'factures']);
  assert.equal(nextPage(pages, 'Clients', done), 'Fiche client');
  assert.equal(nextPage(pages, 'Fiche client', new Set(['fiche client'])), 'Factures');
  assert.equal(nextPage(pages, 'Factures', new Set(['factures'])), 'Accueil', 'repart du début');
  assert.equal(nextPage(pages, 'Inconnue', new Set()), 'Accueil');
  assert.equal(nextPage(pages, 'Accueil', new Set(pages.map((p) => p.toLowerCase()))), '');
  assert.equal(nextPage([], 'x', new Set()), '');
});
