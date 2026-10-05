import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildModel,
  cellStat,
  diffStat,
  coverage,
  missingPages,
  resolvePages,
  buildSheets,
  buildCsv,
} from '../../extension/lib/report.js';

const settings = { ignoreQuery: true, replaceIds: true, caseInsensitive: true };
const apps = [
  { id: 'b', name: 'Client 10', baseUrls: ['https://srv/appli2/'] },
  { id: 'a', name: 'Client 2', baseUrls: ['https://srv/appli1/'] },
];
let n = 0;
const m = (appId, path, network, duration, extra = {}) => ({
  id: String(++n),
  ts: 1000 + n,
  appId,
  url: `https://srv/${appId === 'a' ? 'appli1' : 'appli2'}${path}`,
  page: path,
  network,
  duration,
  kind: 'load',
  trigger: 'click',
  timeout: false,
  ...extra,
});

const measures = [
  m('a', '/clients', 'wifi', 100),
  m('a', '/clients', 'wifi', 300),
  m('a', '/clients/7', 'wifi', 200),
  m('a', '/clients', 'ethernet', 80),
  m('b', '/clients', 'wifi', 500),
  m('b', '/factures', 'ethernet', 900, { timeout: true }),
  m('z', '/orphelin', 'wifi', 1), // application supprimée : ignorée
];

test('buildModel : applis triées par nom (lignes), union des pages (colonnes)', () => {
  const model = buildModel(measures, apps, settings);
  assert.deepEqual(
    model.apps.map((a) => a.name),
    ['Client 2', 'Client 10'],
  );
  assert.deepEqual(
    model.pages.map((p) => p.key),
    ['/clients', '/clients/:id', '/factures'],
  );
  assert.equal(model.rows.length, 6);
  assert.equal(model.pageCounts.get('/clients'), 4);
});

test('resolvePages : ordre, libellés et pages masquées ou attendues', () => {
  const pages = resolvePages(new Set(['/b', '/a', '/c']), [
    { key: '/c', label: 'Page C' },
    { key: '/a', hidden: true },
    { key: '/attendue', label: '' },
  ]);
  assert.deepEqual(
    pages.map((p) => [p.key, p.label, p.hidden]),
    [
      ['/c', 'Page C', false],
      ['/a', '/a', true],
      ['/attendue', '/attendue', false],
      ['/b', '/b', false],
    ],
  );
  const model = buildModel(measures, apps, settings, [
    { key: '/factures', label: 'Factures' },
    { key: '/clients/:id', hidden: true },
  ]);
  assert.deepEqual(
    model.pages.map((p) => p.label),
    ['Factures', '/clients'],
  );
});

test('cellStat, diffStat, coverage, missingPages', () => {
  const model = buildModel(measures, apps, settings);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'avg').value, 200);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'median').value, 200);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'min').value, 100);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'max').value, 300);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'last').value, 300);
  assert.equal(cellStat(model, 'b', '/clients', 'ethernet', 'avg').status, 'missing');
  assert.equal(cellStat(model, 'b', '/factures', 'ethernet', 'avg').status, 'timeout');
  const d = diffStat(model, 'a', '/clients', 'avg');
  assert.equal(d.value, 120);
  assert.equal(d.pct, 1.5);
  assert.equal(diffStat(model, 'b', '/clients', 'avg').status, 'missing');
  assert.deepEqual(coverage(model, 'a'), { done: 3, total: 6 });
  assert.deepEqual(coverage(model, 'b', ['ethernet']), { done: 1, total: 3 });
  assert.deepEqual(
    missingPages(model, 'a', 'ethernet').map((p) => p.key),
    ['/clients/:id', '/factures'],
  );
});

test('buildSheets : une ligne par appli, une colonne par page, cases rouges', () => {
  const model = buildModel(measures, apps, settings);
  const sheets = buildSheets(model, 'avg', new Date(2026, 9, 5, 12, 0, 0));
  assert.deepEqual(
    sheets.map((s) => s.name),
    ['Comparatif', 'WiFi', 'Ethernet', 'Écart WiFi-Ethernet', 'Pages', 'Mesures'],
  );

  const cmp = sheets[0];
  assert.deepEqual(cmp.merges, ['C4:D4', 'E4:F4', 'G4:H4']);
  assert.deepEqual(
    cmp.rows[3].filter((c) => c.v).map((c) => c.v),
    ['/clients', '/clients/:id', '/factures'],
  );
  assert.deepEqual(
    cmp.rows[4].map((c) => c.v),
    ['Application', 'Couverture', 'WiFi', 'Ethernet', 'WiFi', 'Ethernet', 'WiFi', 'Ethernet'],
  );
  const client2 = cmp.rows[5];
  assert.equal(client2[0].v, 'Client 2');
  assert.equal(client2[1].v, 0.5); // couverture 3/6
  assert.deepEqual(
    client2.slice(2).map((c) => c.v),
    [200, 80, 200, 'N/A', 'N/A', 'N/A'],
  );
  assert.deepEqual(
    client2.slice(2).map((c) => c.s),
    ['num', 'num', 'num', 'missing', 'missing', 'missing'],
  );
  const client10 = cmp.rows[6];
  assert.deepEqual(
    client10.slice(2).map((c) => c.s),
    ['num', 'missing', 'missing', 'missing', 'missing', 'timeout'],
  );
  assert.deepEqual(cmp.freeze, { rows: 5, cols: 2 });
  assert.equal(cmp.autoFilter, 'A5:H7');
  assert.deepEqual(
    cmp.scales.map((s) => s.ref),
    ['C6:D7', 'E6:F7', 'G6:H7'],
  );

  const wifi = sheets[1];
  assert.deepEqual(
    wifi.rows[3].map((c) => c.v),
    ['Application', 'Couverture', '/clients', '/clients/:id', '/factures'],
  );
  assert.deepEqual(
    wifi.rows[4].slice(2).map((c) => c.v),
    [200, 200, 'N/A'],
  );
  assert.equal(wifi.autoFilter, 'A4:E6');

  const diff = sheets[3];
  assert.deepEqual(
    diff.rows[4].slice(1).map((c) => c.v),
    [120, 'N/A', 'N/A'],
  );
  assert.equal(sheets[5].rows.length, 7); // en-tête + 6 mesures
});

test('buildCsv : une ligne par application', () => {
  const csv = buildCsv(buildModel(measures, apps, settings), 'avg');
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(
    lines[0],
    'Application;/clients - WiFi (ms);/clients - Ethernet (ms);/clients/:id - WiFi (ms);/clients/:id - Ethernet (ms);/factures - WiFi (ms);/factures - Ethernet (ms)',
  );
  assert.equal(lines[1], 'Client 2;200;80;200;N/A;N/A;N/A');
  assert.equal(lines[2], 'Client 10;500;N/A;N/A;N/A;N/A;TIMEOUT');
});
