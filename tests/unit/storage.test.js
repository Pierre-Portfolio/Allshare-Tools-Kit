import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertV1, isOlderVersion, planLineEdit, DEFAULT_SETTINGS } from '../../extension/lib/storage.js';

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

test('planLineEdit : client, SID et version d’une ligne', () => {
  const apps = [
    { id: 'a', name: 'Ca-Immo', baseUrls: ['https://ca/'] },
    { id: 'b', name: 'Demo Pierre', baseUrls: [] },
  ];
  const mk = (id, app, sid, version) => ({
    id,
    app,
    sid,
    version,
    page: 'Dashboard',
    network: 'ethernet',
    duration: 1,
  });
  const measures = [
    mk('1', 'Ca-Immo', 'Broude', '3.2'),
    mk('2', 'ca-immo', 'broude', '3.2'),
    mk('3', 'Demo Pierre', 'Broude', '3.2.6'),
    mk('4', 'Demo Pierre', 'PRD', '3.2.6'),
  ];
  const line = { client: 'Ca-Immo', sid: 'Broude', version: '3.2' };

  // Version seulement : les 2 mesures de la ligne changent, le référentiel non
  let plan = planLineEdit(apps, measures, line, { client: 'Ca-Immo', sid: 'Broude', version: ' 3.3 ' });
  assert.deepEqual(plan.line, { client: 'Ca-Immo', sid: 'Broude', version: '3.3' });
  assert.deepEqual(
    plan.measures.map((m) => [m.id, m.app, m.sid, m.version]),
    [
      ['1', 'Ca-Immo', 'Broude', '3.3'],
      ['2', 'Ca-Immo', 'Broude', '3.3'],
    ],
  );
  assert.equal(plan.apps, apps);
  assert.equal(plan.count, 2);
  assert.equal(plan.merged, false);

  // Nouveau nom, sans autre ligne : le client est renommé dans le référentiel (URL conservées)
  plan = planLineEdit(apps, measures, line, { client: 'CA Immobilier', sid: 'Broude', version: '3.2' });
  assert.deepEqual(
    plan.apps.map((a) => [a.id, a.name, a.baseUrls]),
    [
      ['a', 'CA Immobilier', ['https://ca/']],
      ['b', 'Demo Pierre', []],
    ],
  );
  assert.ok(plan.measures.every((m) => m.app === 'CA Immobilier'));

  // Casse corrigée : toutes les mesures du client suivent
  plan = planLineEdit(apps, measures, line, { client: 'CA-IMMO', sid: 'Broude', version: '3.2' });
  assert.equal(plan.apps[0].name, 'CA-IMMO');
  assert.deepEqual(
    plan.measures.map((m) => m.app),
    ['CA-IMMO', 'CA-IMMO'],
  );

  // Vers une ligne existante d’un client qui garde d’autres lignes : regroupement, orthographe reprise
  plan = planLineEdit(apps, measures, line, { client: 'demo pierre', sid: 'PRD', version: '3.2.6' });
  assert.equal(plan.merged, true);
  assert.deepEqual(plan.line, { client: 'Demo Pierre', sid: 'PRD', version: '3.2.6' });
  assert.deepEqual(
    plan.apps.map((a) => a.name),
    ['Demo Pierre'],
    'Ca-Immo n’a plus de mesure : fusionné dans Demo Pierre',
  );
  assert.deepEqual(plan.apps[0].baseUrls, ['https://ca/']);

  // Une ligne parmi plusieurs vers un nouveau client : l’ancien reste, le nouveau est ajouté
  plan = planLineEdit(apps, measures, { client: 'Demo Pierre', sid: 'PRD', version: '3.2.6' }, { client: 'Demo 2' });
  assert.deepEqual(
    plan.apps.map((a) => a.name),
    ['Ca-Immo', 'Demo Pierre', 'Demo 2'],
  );
  assert.deepEqual(
    plan.measures.map((m) => [m.id, m.app, m.sid, m.version]),
    [['4', 'Demo 2', '', '']],
  );

  assert.throws(() => planLineEdit(apps, measures, line, { client: '  ' }), /client/);
});
