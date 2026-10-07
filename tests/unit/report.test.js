import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModel,
  lineKey,
  lineLabel,
  cellStat,
  diffStat,
  pageRef,
  anomaly,
  rate,
  coverage,
  missingPages,
  buildGlobalSheets,
  buildPageSheets,
  buildClientSheets,
  buildDetailSheets,
  measuresCsv,
  detailCsv,
  scopeRows,
  isSpecific,
  startUrlFor,
  cellRows,
  csvText,
} from '../../extension/lib/report.js';
import { DEFAULT_SETTINGS } from '../../extension/lib/storage.js';

const settings = { ...DEFAULT_SETTINGS };
let n = 0;
const m = (app, sid, version, page, network, duration, extra = {}) => ({
  id: String(++n),
  ts: 1000 + n,
  app,
  sid,
  version,
  page,
  network,
  duration,
  kind: 'load',
  trigger: 'click',
  timeout: false,
  url: `https://srv/${app.replace(/ /g, '')}/apex/f?p=103:${n}`,
  startUrl: `https://srv/${app.replace(/ /g, '')}/`,
  ...extra,
});

const measures = [
  m('Client 2', 'PRD', '5.3', 'Clients', 'wifi', 100),
  m('Client 2', 'PRD', '5.3', 'Clients', 'wifi', 300),
  m('client 2', 'prd', '5.3', 'Fiche client', 'wifi', 200), // casse différente : même ligne
  m('Client 2', 'PRD', '5.3', 'Clients', 'ethernet', 80),
  m('Client 2', 'PRD', '5.4', 'Clients', 'wifi', 150), // nouvelle version : nouvelle ligne
  m('Client 10', '', '', 'Clients', 'wifi', 500),
  m('Client 10', '', '', 'Factures', 'ethernet', 900, { timeout: true }),
  m('Client 3', 'REC', '', 'Clients', 'wifi', 210),
  m('Client 4', 'PRD', '5.3', 'Clients', 'wifi', 190),
];
const catalogPages = [
  { name: 'Factures', hidden: false },
  { name: 'Clients', hidden: false },
  { name: 'Masquée', hidden: true },
];
const L2 = lineKey('Client 2', 'PRD', '5.3');
const L10 = lineKey('Client 10');

test('buildModel : une ligne par client · SID · version', () => {
  const model = buildModel(measures, [{ name: 'Client 1', baseUrls: [] }], catalogPages);
  assert.deepEqual(model.lines.map(lineLabel), [
    'Client 1',
    'Client 2 · PRD · 5.3',
    'Client 2 · PRD · 5.4',
    'Client 3 · REC',
    'Client 4 · PRD · 5.3',
    'Client 10',
  ]);
  assert.deepEqual(model.clients, ['Client 1', 'Client 2', 'Client 3', 'Client 4', 'Client 10']);
  assert.deepEqual(
    model.pages.map((p) => p.name),
    ['Factures', 'Clients', 'Fiche client'],
  );
  assert.equal(model.lineCounts.get(L2), 4);
  assert.equal(model.rows[0].urlEnd, 'f?p=103:1', "fin d'URL calculée");
});

test('statistiques, écart, référence et anomalies', () => {
  const model = buildModel(measures, [], catalogPages);
  assert.equal(cellStat(model, L2, 'Clients', 'wifi', 'avg').value, 200);
  assert.equal(cellStat(model, L2, 'Clients', 'wifi', 'last').value, 300);
  assert.equal(cellStat(model, L10, 'Clients', 'ethernet', 'avg').status, 'missing');
  assert.equal(cellStat(model, L10, 'Factures', 'ethernet', 'avg').status, 'timeout');
  const d = diffStat(model, L2, 'Clients', 'avg');
  assert.equal(d.value, 120);
  assert.equal(d.pct, 1.5);
  // Clients en WiFi (moyenne) : 200, 150, 500, 210, 190 -> médiane 200
  const ref = pageRef(model, 'Clients', 'wifi', 'avg');
  assert.deepEqual(ref, { median: 200, count: 5, min: 150, max: 500 });
  assert.equal(anomaly(299, ref, settings), null);
  assert.equal(anomaly(300, ref, settings), 'warn');
  assert.equal(anomaly(400, ref, settings), 'crit');
  assert.equal(anomaly(250, ref, { ...settings, warnMs: 240 }), 'warn', 'seuil absolu');
  assert.equal(anomaly(900, { median: 100, count: 2 }, settings), null, 'pas assez de lignes');
  assert.equal(rate(model, L10, 'Clients', 'wifi', 'avg', settings).level, 'crit');
});

test('couverture et pages restantes par ligne', () => {
  const model = buildModel(measures, [], catalogPages);
  assert.deepEqual(coverage(model, L2), { done: 3, total: 6 });
  assert.deepEqual(
    missingPages(model, L2, 'ethernet').map((p) => p.name),
    ['Factures', 'Fiche client'],
  );
});

test('export « tout » : colonnes Client, SID, Version puis pages', () => {
  const model = buildModel(measures, [], catalogPages);
  const sheets = buildGlobalSheets(model, 'avg', settings, new Date(2026, 9, 5), { urlEnd: true });
  assert.deepEqual(
    sheets.map((s) => s.name),
    [
      'Ethernet + WiFi',
      'Ethernet',
      'WiFi',
      'Écart WiFi-Ethernet',
      'Référence par page',
      'Pages spécifiques',
      'Mesures',
    ],
  );
  const main = sheets[0];
  assert.deepEqual(main.merges, ['E4:F4', 'G4:H4', 'I4:J4']);
  assert.deepEqual(
    main.rows[4].slice(0, 6).map((c) => c.v),
    ['Client', 'SID', 'Version', 'Couverture', 'Ethernet', 'WiFi'],
  );
  const row10 = main.rows.find((r) => r[0] && r[0].v === 'Client 10');
  assert.deepEqual(
    row10.slice(4, 8).map((c) => c.s),
    ['timeout', 'missing', 'missing', 'crit'],
  );
  const raw = sheets[6];
  assert.equal(raw.rows[0].at(-1).v, "Fin d'URL");
  assert.equal(raw.rows.length, measures.length + 1);
});

test('export « une page » : une ligne par client · SID · version', () => {
  const model = buildModel(measures, [], catalogPages);
  const [sheet, raw] = buildPageSheets(model, 'clients', 'avg', settings, new Date(), { fullUrl: true });
  assert.equal(sheet.name, 'Clients');
  const row = sheet.rows.find((r) => r[0] && r[0].v === 'Client 2' && r[2].v === '5.3');
  assert.deepEqual(
    row.slice(1, 6).map((c) => c.v),
    ['PRD', '5.3', 'Non', 80, 200], // Ethernet puis WiFi
  );
  const median = sheet.rows.find((r) => r[0] && r[0].v === 'Médiane (tous clients)');
  assert.equal(median[5].v, 200); // médiane WiFi, sous la colonne WiFi
  assert.deepEqual(
    raw.rows[0].slice(-2).map((c) => c.v),
    ['URL complète', 'Page de départ'],
  );
});

test('export « un client » : une feuille par SID / version', () => {
  const model = buildModel(measures, [], catalogPages);
  const sheets = buildClientSheets(model, 'CLIENT 2', 'avg', settings);
  assert.deepEqual(
    sheets.map((s) => s.name),
    ['PRD · 5.3', 'PRD · 5.4', 'Mesures'],
  );
  assert.deepEqual(
    sheets[0].rows.slice(4).map((r) => r[0].v),
    ['Factures', 'Clients', 'Fiche client'],
  );
  assert.equal(sheets[2].rows.length, 6); // en-tête + 5 mesures du client
});

test('export « détail des temps » et CSV', () => {
  const detail = {
    kind: 'load',
    marks: {
      navStart: 20,
      redirectStart: 20,
      redirectEnd: 20,
      dnsStart: 25,
      dnsEnd: 25,
      connectStart: 25,
      connectEnd: 25,
      requestStart: 30,
      responseStart: 330,
      responseEnd: 340,
      domInteractive: 400,
      dclStart: 410,
      dclEnd: 420,
      domComplete: 500,
      loadStart: 500,
      loadEnd: 510,
      end: 900,
    },
    requests: [{ url: 'https://srv/api/data?x=1', type: 'fetch', start: 520, duration: 350 }],
    requestCount: 1,
  };
  const list = [...measures, m('Client 5', 'PRD', '5.3', 'Clients', 'ethernet', 900, { detail })];
  const model = buildModel(list, [], catalogPages);
  const [sheet, reqs] = buildDetailSheets(model, 'Clients', new Date());
  const head = sheet.rows[2].map((c) => c.v);
  assert.ok(head.includes('Attente serveur (ms)'));
  const row = sheet.rows.find((r) => r[1] && r[1].v === 'Client 5');
  assert.equal(row[head.indexOf('Attente serveur (ms)')].v, 300);
  assert.equal(row[head.indexOf('Après load (ms)')].v, 390);
  assert.equal(row[head.indexOf('Requête la plus lente (ms)')].v, 350);
  assert.equal(reqs.rows.length, 2);

  const csv = measuresCsv(scopeRows(model, { type: 'client', client: 'client 5' }), { fullUrl: true, urlEnd: true });
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(lines.length, 2);
  assert.match(
    lines[0],
    /^Date;Client;SID;Version;Page;Page spécifique;Réseau;Durée \(ms\);.*;Fin d'URL;URL complète;Page de départ$/,
  );
  assert.match(lines[1], /;Client 5;PRD;5\.3;Clients;Non;Ethernet;900;/);
  const dcsv = detailCsv(model, 'Clients').split('\r\n');
  assert.match(dcsv[0], /Attente serveur \(ms\)/);
  assert.equal(scopeRows(model, { type: 'page', page: 'Fiche client' }).length, 1);
});

test('page spécifique : drapeau par ligne client, colonnes et feuille dédiée', () => {
  const list = [
    ...measures,
    m('Client 6', 'PRD', '5.3', 'Portail maison', 'wifi', 700, { specific: true }),
    m('Client 6', 'PRD', '5.3', 'Clients', 'wifi', 210),
  ];
  const model = buildModel(list, [], catalogPages);
  const l6 = lineKey('Client 6', 'PRD', '5.3');
  assert.equal(isSpecific(model, l6, 'portail maison'), true);
  assert.equal(isSpecific(model, l6, 'Clients'), false);
  assert.equal(isSpecific(model, L2, 'Portail maison'), false);

  const global = buildGlobalSheets(model, 'avg', settings);
  const spec = global.find((s) => s.name === 'Pages spécifiques');
  assert.deepEqual(
    spec.rows.slice(1).map((r) => r.map((c) => c.v)),
    [['Client 6', 'PRD', '5.3', 'Portail maison', 1]],
  );
  const ref = global.find((s) => s.name === 'Référence par page');
  assert.equal(ref.rows.find((r) => r[0].v === 'Portail maison')[5].v, 1);

  const [page] = buildPageSheets(model, 'Portail maison', 'avg', settings);
  const rowsByClient = Object.fromEntries(
    page.rows
      .slice(4)
      .filter((r) => r[0])
      .map((r) => [r[0].v, r[3].v]),
  );
  assert.equal(rowsByClient['Client 6'], 'Oui');
  assert.equal(rowsByClient['Client 3'], '', 'pas mesurée : vide');

  const [client] = buildClientSheets(model, 'Client 6', 'avg', settings);
  const byPage = Object.fromEntries(client.rows.slice(4).map((r) => [r[0].v, r[1].v]));
  assert.deepEqual(byPage, { Factures: '', Clients: 'Non', 'Fiche client': '', 'Portail maison': 'Oui' });

  const csv = measuresCsv(scopeRows(model, { type: 'client', client: 'Client 6' }));
  assert.match(csv, /;Portail maison;Oui;WiFi;700;/);
});

test('exports en secondes : valeurs exactes, styles « sec », en-têtes et CSV à virgule', () => {
  const model = buildModel(measures, [], catalogPages);
  const options = { unit: 's' };
  const [main, , , , ref, , raw] = buildGlobalSheets(model, 'avg', settings, new Date(), options);
  assert.match(main.rows[0][0].v, /\(s\)$/);
  assert.match(main.rows[1][0].v, /secondes entre le clic/);
  const row2 = main.rows.find((r) => r[0] && r[0].v === 'Client 2' && r[2].v === '5.3');
  assert.deepEqual(
    row2.slice(6, 8).map((c) => [c.v, c.s]),
    [
      [0.08, 'sec'], // Clients · Ethernet : 80 ms
      [0.2, 'sec'], // Clients · WiFi : 200 ms
    ],
  );
  const row10 = main.rows.find((r) => r[0] && r[0].v === 'Client 10');
  assert.deepEqual(row10[7], { v: 0.5, s: 'secCrit' }, 'anomalie conservée');
  assert.equal(ref.rows[0][2].v, 'Médiane Ethernet (s)');
  assert.equal(raw.rows[0][7].v, 'Durée (s)');
  assert.equal(raw.rows[1][7].v, 0.1);

  const [page] = buildPageSheets(model, 'Clients', 'avg', settings, new Date(), options);
  const median = page.rows.find((r) => r[0] && r[0].v === 'Médiane (tous clients)');
  assert.deepEqual(median[5], { v: 0.2, s: 'sec' });
  const count = page.rows.find((r) => r[0] && r[0].v === 'Lignes mesurées');
  assert.deepEqual(count[5], { v: 5, s: 'num' }, 'les nombres de lignes restent des entiers');

  const csv = measuresCsv(scopeRows(model, { type: 'client', client: 'Client 10' }), options);
  assert.match(csv, /;Durée \(s\);/);
  assert.match(csv, /;Clients;Non;WiFi;0,5;/);
  assert.match(csv, /;Factures;Non;Ethernet;0,9;Oui;/);
});

test('relance d’une case : page de départ et mesures de la case', () => {
  const list = [
    m('Client 7', 'PRD', '1', 'Clients', 'wifi', 100, { startUrl: 'https://srv/c7/accueil' }),
    m('Client 7', 'PRD', '1', 'Clients', 'wifi', 120, { startUrl: 'https://srv/c7/menu' }),
    m('Client 7', 'PRD', '1', 'Factures', 'ethernet', 300, { startUrl: 'https://srv/c7/factures-depart' }),
    m('Client 7', 'REC', '1', 'Fiche', 'wifi', 300, { startUrl: 'https://srv/c7rec/' }),
  ];
  const catalog = [
    { name: 'Client 7', baseUrls: ['https://srv/c7/'] },
    { name: 'Client 8', baseUrls: ['https://srv/c8/'] },
  ];
  const model = buildModel(list, catalog, catalogPages);
  const l7 = lineKey('Client 7', 'PRD', '1');
  assert.equal(startUrlFor(model, l7, 'Clients', 'wifi'), 'https://srv/c7/menu', 'dernière mesure de la case');
  assert.equal(startUrlFor(model, l7, 'clients', 'ethernet'), 'https://srv/c7/menu', 'même page, autre réseau');
  assert.equal(startUrlFor(model, l7, 'Fiche', 'wifi'), 'https://srv/c7rec/', 'même page, autre ligne du client');
  assert.equal(
    startUrlFor(model, l7, 'Masquée', 'wifi'),
    'https://srv/c7/factures-depart',
    'page jamais mesurée : dernière page de départ de la ligne',
  );
  assert.equal(startUrlFor(model, lineKey('Client 7', 'PRD', '2'), 'Clients', 'wifi'), '', 'ligne inconnue');
  assert.equal(startUrlFor(model, lineKey('Client 8'), 'Clients', 'wifi', catalog), 'https://srv/c8/');
  assert.equal(startUrlFor(model, lineKey('Client 8'), 'Clients', 'wifi'), '');
  assert.deepEqual(
    cellRows(model, l7, 'Clients', 'wifi').map((x) => x.duration),
    [100, 120],
  );
  assert.equal(cellRows(model, l7, 'Clients', 'ethernet').length, 0);
});

test('CSV : un texte qu’Excel prendrait pour une formule est précédé d’une apostrophe', () => {
  for (const [v, out] of [
    ['=SOMME(A1)', "'=SOMME(A1)"],
    ['+33 1 23', "'+33 1 23"],
    ['-Client', "'-Client"],
    ['@cmd', "'@cmd"],
    ['Client A', 'Client A'],
    ['2026-10-07 09:00:00', '2026-10-07 09:00:00'],
  ]) {
    assert.equal(csvText(v), out);
  }
  const csv = measuresCsv([{ id: '1', ts: 0, app: '=HYPERLINK("x")', page: 'P', network: 'wifi', duration: -1 }]);
  assert.match(csv, /;"'=HYPERLINK\(""x""\)";/, 'client neutralisé');
  assert.match(csv, /;-1;/, 'nombre négatif inchangé');
});
