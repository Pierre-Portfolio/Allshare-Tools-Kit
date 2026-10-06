import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModel,
  cellStat,
  diffStat,
  pageRef,
  anomaly,
  rate,
  coverage,
  missingPages,
  buildGlobalSheets,
  buildPageSheets,
  buildAppSheets,
} from '../../extension/lib/report.js';
import { DEFAULT_SETTINGS } from '../../extension/lib/storage.js';

const settings = { ...DEFAULT_SETTINGS };
let n = 0;
const m = (app, page, network, duration, extra = {}) => ({
  id: String(++n),
  ts: 1000 + n,
  app,
  page,
  network,
  duration,
  kind: 'load',
  trigger: 'click',
  timeout: false,
  url: `https://srv/${app}/${page}`,
  startUrl: `https://srv/${app}/`,
  ...extra,
});

const measures = [
  m('Client 2', 'Clients', 'wifi', 100),
  m('Client 2', 'Clients', 'wifi', 300),
  m('client 2', 'Fiche client', 'wifi', 200), // casse différente : même appli
  m('Client 2', 'Clients', 'ethernet', 80),
  m('Client 10', 'Clients', 'wifi', 500),
  m('Client 10', 'Factures', 'ethernet', 900, { timeout: true }),
  m('Client 3', 'Clients', 'wifi', 210),
  m('Client 4', 'Clients', 'wifi', 190),
];
const catalogPages = [
  { name: 'Factures', hidden: false },
  { name: 'Clients', hidden: false },
  { name: 'Masquée', hidden: true },
];

test('buildModel : applis triées (lignes), pages du référentiel puis pages mesurées (colonnes)', () => {
  const model = buildModel(measures, [{ name: 'Client 1', baseUrls: [] }], catalogPages);
  assert.deepEqual(
    model.apps.map((a) => a.name),
    ['Client 1', 'Client 2', 'Client 3', 'Client 4', 'Client 10'],
  );
  assert.deepEqual(
    model.pages.map((p) => p.name),
    ['Factures', 'Clients', 'Fiche client'],
  );
  assert.equal(model.allPages.length, 4);
  assert.equal(model.appCounts.get('client 2'), 4);
});

test('statistiques, écart, référence et anomalies', () => {
  const model = buildModel(measures, [], catalogPages);
  assert.equal(cellStat(model, 'Client 2', 'Clients', 'wifi', 'avg').value, 200);
  assert.equal(cellStat(model, 'Client 2', 'Clients', 'wifi', 'last').value, 300);
  assert.equal(cellStat(model, 'Client 10', 'Clients', 'ethernet', 'avg').status, 'missing');
  assert.equal(cellStat(model, 'Client 10', 'Factures', 'ethernet', 'avg').status, 'timeout');
  const d = diffStat(model, 'Client 2', 'Clients', 'avg');
  assert.equal(d.value, 120);
  assert.equal(d.pct, 1.5);

  // Clients en WiFi (moyenne) : 200, 500, 210, 190 -> médiane 205
  const ref = pageRef(model, 'Clients', 'wifi', 'avg');
  assert.deepEqual(ref, { median: 205, count: 4, min: 190, max: 500 });
  assert.equal(anomaly(200, ref, settings), null);
  assert.equal(anomaly(320, ref, settings), 'warn'); // ≥ 1,5 ×
  assert.equal(anomaly(500, ref, settings), 'crit'); // ≥ 2 ×
  assert.equal(anomaly(250, ref, { ...settings, warnMs: 240 }), 'warn', 'seuil absolu');
  assert.equal(anomaly(900, { median: 100, count: 2 }, settings), null, 'pas assez de clients pour comparer');
  assert.equal(rate(model, 'Client 10', 'Clients', 'wifi', 'avg', settings).level, 'crit');
});

test('couverture et pages restantes', () => {
  const model = buildModel(measures, [], catalogPages);
  assert.deepEqual(coverage(model, 'Client 2'), { done: 3, total: 6 });
  assert.deepEqual(
    missingPages(model, 'Client 2', 'ethernet').map((p) => p.name),
    ['Factures', 'Fiche client'],
  );
});

test('export 1 — tout : une ligne par appli, deux colonnes par page, couleurs', () => {
  const model = buildModel(measures, [], catalogPages);
  const sheets = buildGlobalSheets(model, 'avg', settings, new Date(2026, 9, 5));
  assert.deepEqual(
    sheets.map((s) => s.name),
    ['WiFi + Ethernet', 'WiFi', 'Ethernet', 'Écart WiFi-Ethernet', 'Référence par page', 'Mesures'],
  );
  const main = sheets[0];
  assert.deepEqual(main.merges, ['C4:D4', 'E4:F4', 'G4:H4']);
  const row10 = main.rows.find((r) => r[0] && r[0].v === 'Client 10');
  // Factures : WiFi absent, Ethernet timeout ; Clients : WiFi 500 (orange), Ethernet absent
  assert.deepEqual(
    row10.slice(2, 6).map((c) => c.s),
    ['missing', 'timeout', 'crit', 'missing'],
  );
  assert.equal(main.autoFilter, 'A5:H9');
  const wifi = sheets[1];
  assert.deepEqual(
    wifi.rows[3].map((c) => c.v),
    ['Application', 'Couverture', 'Factures', 'Clients', 'Fiche client'],
  );
  const gap = sheets[3].rows.find((r) => r[0] && r[0].v === 'Client 2');
  assert.deepEqual(gap[2], { v: 1.5, s: 'pctWarn' }); // +150 % ≥ 50 %
  assert.equal(sheets[5].rows.length, measures.length + 1);
});

test('export 2 — une page, tous les clients', () => {
  const model = buildModel(measures, [], catalogPages);
  const [sheet, raw] = buildPageSheets(model, 'clients', 'avg', settings);
  assert.equal(sheet.name, 'Clients');
  assert.match(sheet.rows[0][0].v, /Page « Clients »/);
  const byApp = Object.fromEntries(sheet.rows.slice(4, 8).map((r) => [r[0].v, r]));
  assert.deepEqual([byApp['Client 10'][1].v, byApp['Client 10'][1].s], [500, 'crit']);
  assert.deepEqual([byApp['Client 2'][2].v, byApp['Client 2'][2].s], [80, 'num']);
  assert.equal(byApp['Client 10'][2].v, 'N/A');
  assert.ok(Math.abs(byApp['Client 10'][4].v - (500 / 205 - 1)) < 1e-9, 'vs médiane');
  const medianRow = sheet.rows.find((r) => r[0] && r[0].v === 'Médiane (tous clients)');
  assert.equal(medianRow[1].v, 205);
  assert.equal(raw.rows.length, 7); // en-tête + 6 mesures de la page Clients
});

test('export 3 — un client, toutes les pages', () => {
  const model = buildModel(measures, [], catalogPages);
  const [sheet, raw] = buildAppSheets(model, 'CLIENT 10', 'avg', settings);
  assert.equal(sheet.name, 'Client 10');
  assert.deepEqual(
    sheet.rows.slice(4).map((r) => r[0].v),
    ['Factures', 'Clients', 'Fiche client'],
  );
  const clients = sheet.rows[5];
  assert.deepEqual([clients[1].v, clients[1].s], [500, 'crit']);
  assert.equal(clients[4].v, 205); // médiane des clients en WiFi
  assert.equal(raw.rows.length, 3);
});
