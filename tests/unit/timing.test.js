import { test } from 'node:test';
import assert from 'node:assert/strict';
import { phases, detailSummary, DETAIL_COLUMNS } from '../../extension/lib/timing.js';

const load = {
  kind: 'load',
  marks: {
    navStart: 12,
    redirectStart: 12,
    redirectEnd: 12,
    dnsStart: 15,
    dnsEnd: 40,
    connectStart: 40,
    connectEnd: 80,
    requestStart: 81,
    responseStart: 600,
    responseEnd: 650,
    domInteractive: 900,
    dclStart: 905,
    dclEnd: 920,
    domComplete: 1100,
    loadStart: 1100,
    loadEnd: 1110,
    end: 1700,
  },
  requests: [
    { url: 'https://srv/api/a', type: 'fetch', start: 1150, duration: 450 },
    { url: 'https://srv/api/b', type: 'XHR', start: 1160, duration: 120 },
  ],
  requestCount: 2,
};

test('phases : chargement complet, depuis le clic', () => {
  const p = Object.fromEntries(phases(load).map((x) => [x.id, x]));
  assert.deepEqual(p.clickToNav, {
    id: 'clickToNav',
    label: 'Clic → navigation',
    start: 0,
    duration: 12,
    end: 12,
    sub: false,
  });
  assert.equal(p.request.duration, 519); // attente serveur
  assert.equal(p.response.duration, 50);
  assert.equal(p.dom.start, 650);
  assert.equal(p.dom.end, 1100);
  assert.equal(p.interactive.sub, true);
  assert.equal(p.afterLoad.duration, 590);
  assert.equal(p.total.end, 1700);
});

test('phases : navigation SPA (requêtes puis affichage)', () => {
  const p = phases({ kind: 'spa', marks: { end: 800 }, requests: [{ url: 'x', start: 5, duration: 400 }] });
  assert.deepEqual(
    p.map((x) => [x.id, x.start, x.duration]),
    [
      ['beforeAjax', 0, 5],
      ['ajax', 5, 400],
      ['render', 405, 395],
      ['total', 0, 800],
    ],
  );
  assert.deepEqual(phases(null), []);
});

test('detailSummary : colonnes fixes et requête la plus lente', () => {
  const s = detailSummary(load);
  assert.equal(s.durations.length, DETAIL_COLUMNS.length);
  assert.equal(s.durations[DETAIL_COLUMNS.findIndex(([id]) => id === 'request')], 519);
  assert.equal(s.durations[DETAIL_COLUMNS.findIndex(([id]) => id === 'ajax')], null);
  assert.equal(s.slowest.url, 'https://srv/api/a');
  assert.equal(s.requestCount, 2);
  assert.deepEqual(
    detailSummary(undefined).durations,
    DETAIL_COLUMNS.map(() => null),
  );
});
