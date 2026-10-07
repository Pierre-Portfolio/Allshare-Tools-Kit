import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayBounds,
  isoDay,
  openedOn,
  openTime,
  fmtOpenTime,
  craCountText,
  isSitePage,
  pageKey,
  advancePages,
  trackPages,
  pagesToday,
  MAX_GAP,
} from '../../extension/lib/cra.js';

const at = (h, m, day = 7) => new Date(2026, 9, day, h, m).getTime(); // octobre 2026, heure locale

test('jour : de minuit à minuit, heure locale', () => {
  assert.deepEqual(dayBounds(at(15, 30)), [new Date(2026, 9, 7).getTime(), new Date(2026, 9, 8).getTime()]);
});

test('capsules du jour : rouvertes ou sauvegardées ce jour-là, dans l’ordre de la première ouverture', () => {
  const caps = [
    { id: 'a', ts: at(9, 0, 1), opens: [at(14, 30), at(8, 5, 6), at(10, 15)] },
    { id: 'b', ts: at(9, 40), opens: [at(16, 0)] }, // sauvegardée aujourd'hui
    { id: 'c', ts: at(9, 0, 2), opens: [at(23, 59, 6)] }, // hier soir seulement
    { id: 'd', ts: at(9, 0, 2) }, // jamais rouverte
  ];
  const day = openedOn(caps, at(12, 0));
  assert.deepEqual(
    day.map((x) => x.capsule.id),
    ['b', 'a'],
  );
  assert.deepEqual(day[0].events, [
    { ts: at(9, 40), saved: true },
    { ts: at(16, 0), saved: false },
  ]);
  assert.deepEqual(
    day[1].events.map((e) => e.ts),
    [at(10, 15), at(14, 30)],
  );
  assert.deepEqual(
    openedOn(caps, at(12, 0, 6)).map((x) => x.capsule.id),
    ['a', 'c'],
    'la veille',
  );
});

test('temps d’ouverture dans la journée : périodes mises bout à bout, celle en cours jusqu’à maintenant', () => {
  const [from, to] = [at(0, 0), at(0, 0, 8)];
  const min = (n) => n * 60000;
  const spans = [
    { from: at(9, 0), to: at(9, 30) },
    { from: at(9, 15), to: at(10, 0) }, // rouverte alors qu'elle l'était déjà
    { from: at(23, 0, 6), to: at(0, 20) }, // depuis la veille
  ];
  assert.deepEqual(openTime(spans, from, to), { ms: min(80), start: from });
  assert.deepEqual(openTime([{ from: at(14, 0), wins: [1] }], from, to, at(14, 25)), { ms: min(25), start: at(14, 0) });
  assert.deepEqual(openTime([{ from: at(14, 0), wins: [1] }], from, to, at(9, 0, 8)).ms, min(600), 'jusqu’à minuit');
  assert.deepEqual(openTime(undefined, from, to), { ms: 0, start: Infinity });
  assert.equal(fmtOpenTime(30000), '< 1 min');
  assert.equal(fmtOpenTime(min(25)), '25 min');
  assert.equal(fmtOpenTime(min(65)), '1 h 05');
  assert.equal(fmtOpenTime(min(600)), '10 h 00');
});

test('capsules du jour : temps d’ouverture, en cours, restée ouverte depuis la veille', () => {
  const caps = [
    { id: 'a', ts: at(9, 0), spans: [{ from: at(9, 0), to: at(9, 45) }] },
    { id: 'b', ts: at(9, 0, 1), opens: [at(17, 0, 6)], spans: [{ from: at(17, 0, 6), wins: [4] }] },
    { id: 'c', ts: at(10, 0) }, // avant le suivi des temps d'ouverture
  ];
  const day = openedOn(caps, at(12, 0), at(11, 0));
  assert.deepEqual(
    day.map((x) => [x.capsule.id, x.open / 60000, x.live]),
    [
      ['b', 11 * 60, true],
      ['a', 45, false],
      ['c', 0, false],
    ],
  );
  assert.deepEqual(day[0].events, [], 'aucune ouverture ce jour-là');
  assert.deepEqual(
    openedOn(caps, at(12, 0, 6), at(11, 0)).map((x) => [x.capsule.id, x.open / 60000, x.live]),
    [['b', 7 * 60, false]],
    'la veille : jusqu’à minuit, plus en cours',
  );
});

test('compteur de l’accueil', () => {
  const caps = [{ id: 'a', ts: at(9, 0, 1), opens: [at(10, 0)] }];
  assert.equal(craCountText(caps, at(18, 0)), "1 capsule ouverte aujourd'hui");
  assert.equal(craCountText([...caps, { id: 'b', ts: at(11, 0) }], at(18, 0)), "2 capsules ouvertes aujourd'hui");
  assert.equal(craCountText(caps, at(18, 0, 8)), '');
});

test('pages allshare-scenario.fr : domaine et sous-domaines, clé sans numéro de session APEX', () => {
  assert.ok(isSitePage('https://dsb-cra.allshare-scenario.fr/apex/r/x?session=1'));
  assert.ok(isSitePage('https://allshare-scenario.fr/'));
  assert.ok(!isSitePage('https://www.google.fr/search?q=allshare-scenario.fr'), 'cité dans l’adresse seulement');
  assert.ok(!isSitePage('https://allshare-scenario.fr.example.com/') && !isSitePage('chrome://newtab/'));
  assert.equal(
    pageKey('https://dsb-cra.allshare-scenario.fr/apex/r/allshare_wks/xaas/saisie-cra?session=4242#x'),
    'https://dsb-cra.allshare-scenario.fr/apex/r/allshare_wks/xaas/saisie-cra',
  );
  assert.equal(
    pageKey('https://a.allshare-scenario.fr/apex/r/w/app/ticket?p10_id=7&session=1&cs=abc&clear=10'),
    'https://a.allshare-scenario.fr/apex/r/w/app/ticket?p10_id=7',
    'valeurs de la page gardées',
  );
  assert.equal(
    pageKey('https://a.allshare-scenario.fr/apex/f?p=100:10:123456::NO::P10_ID:7'),
    pageKey('https://a.allshare-scenario.fr/apex/f?p=100:10:999::NO::P10_ID:7'),
    'ancienne adresse f?p= : session ignorée',
  );
  assert.notEqual(
    pageKey('https://a.allshare-scenario.fr/apex/f?p=100:10:1::NO::P10_ID:7'),
    pageKey('https://a.allshare-scenario.fr/apex/f?p=100:10:1::NO::P10_ID:8'),
  );
});

test('pages du jour : temps gagné par les pages ouvertes, remis à zéro chaque jour', () => {
  const min = (n) => n * 60000;
  const cra = 'https://dsb-cra.allshare-scenario.fr/apex/r/w/x/saisie-cra';
  const tickets = 'https://t.allshare-scenario.fr/tickets';
  const tabs = [
    { url: `${cra}?session=1`, title: 'Saisie' },
    { url: `${cra}?session=2`, title: '' }, // même page, deux onglets : comptée une fois
    { url: 'https://www.google.fr/', title: 'Google' },
  ];
  let s = trackPages(undefined, tabs, at(9, 0));
  assert.deepEqual(s, {
    day: '2026-10-07',
    at: at(9, 0),
    pages: { [cra]: { url: `${cra}?session=2`, title: 'Saisie', ms: 0 } },
    open: [cra],
  });
  s = trackPages(s, [...tabs, { url: tickets, title: 'Tickets' }], at(9, 1));
  s = trackPages(s, [{ url: tickets, title: 'Tickets' }], at(9, 2)); // saisie fermée
  s = advancePages(s, at(9, 3));
  assert.deepEqual(
    Object.values(s.pages).map((p) => [p.title, p.ms]),
    [
      ['Saisie', min(2)],
      ['Tickets', min(2)],
    ],
  );
  assert.equal(advancePages(s, at(10, 3)).pages[tickets].ms, min(2) + MAX_GAP, 'veille : 3 min au plus');
  assert.deepEqual(
    pagesToday(s, at(9, 4)).map((p) => [p.title, p.ms / 60000, p.live]),
    [
      ['Tickets', 3, true],
      ['Saisie', 2, false],
    ],
    'la plus longtemps ouverte en tête, en cours jusqu’à maintenant',
  );
  // Après minuit : seul le temps depuis minuit compte, les pages fermées disparaissent
  const late = advancePages(trackPages(s, [{ url: tickets, title: 'Tickets' }], at(23, 59)), at(0, 1, 8));
  assert.equal(late.day, isoDay(at(0, 1, 8)));
  assert.deepEqual(late.pages, { [tickets]: { url: tickets, title: 'Tickets', ms: min(1) } });
  assert.deepEqual(pagesToday({ ...s, open: [] }, at(9, 0, 8)), [], 'le lendemain : rien');
  assert.deepEqual(pagesToday(undefined), []);
});
