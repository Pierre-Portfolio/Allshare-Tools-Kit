import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildModel, cellStat, buildSheets, buildCsv } from '../../extension/lib/report.js';

const settings = { ignoreQuery: true, replaceIds: true, caseInsensitive: true };
const apps = [
  { id: 'a', name: 'Appli 1', baseUrls: ['https://srv/appli1/'] },
  { id: 'b', name: 'Appli 2', baseUrls: ['https://srv/appli2/'] },
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

test('buildModel fait l’union des pages de toutes les applications', () => {
  const model = buildModel(measures, apps, settings);
  assert.deepEqual(model.pages, ['/clients', '/clients/:id', '/factures']);
  assert.equal(model.rows.length, 6);
});

test('cellStat : statistiques, case manquante et timeout', () => {
  const model = buildModel(measures, apps, settings);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'avg').value, 200);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'median').value, 200);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'min').value, 100);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'max').value, 300);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'last').value, 300);
  assert.equal(cellStat(model, 'a', '/clients', 'wifi', 'avg').count, 2);
  assert.equal(cellStat(model, 'b', '/clients', 'ethernet', 'avg').status, 'missing');
  assert.equal(cellStat(model, 'a', '/factures', 'wifi', 'avg').status, 'missing');
  assert.equal(cellStat(model, 'b', '/factures', 'ethernet', 'avg').status, 'timeout');
});

test('buildSheets : comparatif avec cases rouges, une feuille par appli, mesures brutes', () => {
  const model = buildModel(measures, apps, settings);
  const sheets = buildSheets(model, 'avg', new Date(2026, 9, 5, 12, 0, 0));
  assert.deepEqual(
    sheets.map((s) => s.name),
    ['Comparatif', 'Appli 1', 'Appli 2', 'Mesures'],
  );
  const cmp = sheets[0];
  assert.deepEqual(cmp.merges, ['A4:A5', 'B4:C4', 'D4:E4']);
  const row = cmp.rows[5]; // /clients
  assert.equal(row[0].v, '/clients');
  assert.deepEqual(
    row.slice(1).map((c) => c.s),
    ['num', 'num', 'num', 'missing'],
  );
  assert.deepEqual(
    row.slice(1).map((c) => c.v),
    [200, 80, 500, 'N/A'],
  );
  const factures = cmp.rows[7];
  assert.deepEqual(
    factures.slice(1).map((c) => c.s),
    ['missing', 'missing', 'missing', 'timeout'],
  );
  const app1 = sheets[1];
  const clients = app1.rows[4];
  assert.equal(clients[3].v, 120); // écart WiFi − Ethernet
  assert.equal(clients[4].v, 1.5); // +150 %
  assert.equal(sheets[3].rows.length, 7); // en-tête + 6 mesures
});

test('buildCsv : séparateur point-virgule et BOM', () => {
  const csv = buildCsv(buildModel(measures, apps, settings), 'avg');
  const lines = csv.replace('﻿', '').trim().split('\r\n');
  assert.equal(
    lines[0],
    'Page;Appli 1 - WiFi (ms);Appli 1 - Ethernet (ms);Appli 2 - WiFi (ms);Appli 2 - Ethernet (ms)',
  );
  assert.equal(lines[1], '/clients;200;80;500;N/A');
  assert.equal(lines[3], '/factures;N/A;N/A;N/A;TIMEOUT');
});
