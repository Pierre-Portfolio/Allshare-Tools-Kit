import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertV1, isOlderVersion, DEFAULT_SETTINGS } from '../../extension/lib/storage.js';

test('convertV1 : mesures de la version 1 (appli par URL, page par chemin) -> noms', () => {
  const apps = [{ id: 'x1', name: 'Client A', baseUrls: ['https://a.fr/'] }];
  const pages = [
    { key: '/clients/:id', label: 'Fiche client', hidden: false },
    { key: '/admin', label: '', hidden: true },
  ];
  const measures = [
    { id: '1', appId: 'x1', page: '/clients/:id', url: 'https://a.fr/clients/3', network: 'wifi', duration: 10 },
    { id: '2', appId: 'x1', page: '/factures', url: 'https://a.fr/factures', network: 'wifi', duration: 20 },
    { id: '3', appId: 'supprimée', page: '/', url: 'https://b.fr/', network: 'wifi', duration: 30 },
    { id: '4', app: 'Client B', page: 'Accueil', network: 'ethernet', duration: 40 },
  ];
  const out = convertV1(apps, pages, measures);
  assert.deepEqual(
    out.pages.map((p) => [p.name, p.hidden]),
    [
      ['Fiche client', false],
      ['/admin', true],
    ],
  );
  assert.deepEqual(
    out.measures.map((m) => [m.id, m.app, m.page, 'appId' in m]),
    [
      ['1', 'Client A', 'Fiche client', false],
      ['2', 'Client A', '/factures', false],
      ['4', 'Client B', 'Accueil', false],
    ],
  );
  assert.equal(out.measures[0].startUrl, 'https://a.fr/clients/3');
});

test('isOlderVersion : comparaison de versions à points', () => {
  assert.equal(isOlderVersion('3.5.2', '3.6.0'), true);
  assert.equal(isOlderVersion('3.6.0', '3.6.0'), false);
  assert.equal(isOlderVersion('3.10.0', '3.6.0'), false);
  assert.equal(isOlderVersion('3.6', '3.6.1'), true);
  assert.equal(isOlderVersion(undefined, '3.6.0'), true);
});

test('réseau par défaut : Ethernet', () => {
  assert.equal(DEFAULT_SETTINGS.network, 'ethernet');
});
