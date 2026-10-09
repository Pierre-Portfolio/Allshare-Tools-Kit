import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dayBounds,
  isoDay,
  openedOn,
  openTime,
  fmtOpenTime,
  craCountText,
  clientHost,
  clientName,
  advancePages,
  trackPages,
  pagesToday,
  MAX_GAP,
  isCraPage,
  CRA_ORIGIN,
  CRA_PATH,
} from '../../extension/lib/cra.js';
import { readFileSync } from 'node:fs';

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

test('clients allshare-scenario.fr : un par sous-domaine, saisie du C.R.A écartée', () => {
  assert.equal(
    clientHost('https://dsb-generali.allshare-scenario.fr/apex/f?p=100:1:42'),
    'dsb-generali.allshare-scenario.fr',
  );
  assert.equal(clientHost('https://DSB-Natixis.allshare-scenario.fr/'), 'dsb-natixis.allshare-scenario.fr');
  assert.equal(clientHost(`${CRA_ORIGIN}${CRA_PATH}?session=1`), '', 'dsb-cra : pas un client');
  assert.equal(clientHost('https://allshare-scenario.fr/') + clientHost('https://www.allshare-scenario.fr/'), '');
  assert.equal(clientHost('https://www.google.fr/search?q=allshare-scenario.fr'), '', 'cité dans l’adresse seulement');
  assert.equal(clientHost('https://allshare-scenario.fr.example.com/') + clientHost('chrome://newtab/'), '');
  assert.equal(clientHost('pas une adresse'), '');
  assert.equal(clientName('dsb-generali.allshare-scenario.fr'), 'dsb-generali');
});

test('clients du jour : temps gagné par les clients ouverts, remis à zéro chaque jour', () => {
  const min = (n) => n * 60000;
  const generali = 'dsb-generali.allshare-scenario.fr';
  const natixis = 'dsb-natixis.allshare-scenario.fr';
  const g = (page) => `https://${generali}/apex/f?p=100:${page}:4242`;
  const tickets = `https://${natixis}/tickets`;
  const tabs = [
    { url: g(1), title: 'Accueil' },
    { url: g(2), title: 'Fiche Salarié', active: true }, // même client, deux onglets : compté une fois
    { url: `${CRA_ORIGIN}${CRA_PATH}?session=1`, title: 'Saisie du C.R.A.' },
    { url: 'https://www.google.fr/', title: 'Google' },
  ];
  let s = trackPages(undefined, tabs, at(9, 0));
  assert.deepEqual(s, {
    day: '2026-10-07',
    at: at(9, 0),
    pages: { [generali]: { url: g(2), title: 'Fiche Salarié', ms: 0 } },
    open: [generali],
  });
  s = trackPages(s, [...tabs, { url: tickets, title: 'Tickets' }], at(9, 1));
  s = trackPages(
    s,
    [
      { url: g(3), title: 'Livre de Paye' },
      { url: tickets, title: 'Tickets' },
    ],
    at(9, 2),
  );
  s = trackPages(s, [{ url: tickets, title: 'Tickets' }], at(9, 3)); // generali fermé
  s = advancePages(s, at(9, 4));
  assert.deepEqual(
    Object.entries(s.pages).map(([host, p]) => [host, p.title, p.ms]),
    [
      [generali, 'Livre de Paye', min(3)],
      [natixis, 'Tickets', min(3)],
    ],
    'dernière page vue, temps sans double compte',
  );
  assert.equal(advancePages(s, at(10, 4)).pages[natixis].ms, min(3) + MAX_GAP, 'veille : 3 min au plus');
  assert.deepEqual(
    pagesToday(s, at(9, 5)).map((p) => [p.name, p.ms / 60000, p.live]),
    [
      ['dsb-natixis', 4, true],
      ['dsb-generali', 3, false],
    ],
    'le plus longtemps ouvert en tête, en cours jusqu’à maintenant',
  );
  // Après minuit : seul le temps depuis minuit compte, les clients fermés disparaissent
  const late = advancePages(trackPages(s, [{ url: tickets, title: 'Tickets' }], at(23, 59)), at(0, 1, 8));
  assert.equal(late.day, isoDay(at(0, 1, 8)));
  assert.deepEqual(late.pages, { [natixis]: { url: tickets, title: 'Tickets', ms: min(1) } });
  assert.deepEqual(pagesToday({ ...s, open: [] }, at(9, 0, 8)), [], 'le lendemain : rien');
  assert.deepEqual(pagesToday(undefined), []);
});

test('clients du jour : relevé d’avant 3.15 (une entrée par page) regroupé par client', () => {
  const min = (n) => n * 60000;
  const page = (url, title, ms) => ({ url, title, ms });
  const generali = 'https://dsb-generali.allshare-scenario.fr/apex/f';
  const old = {
    day: '2026-10-07',
    at: at(0, 30),
    pages: {
      [`${generali}?p=1`]: page(`${generali}?p=1:1:9`, 'Saisie des enveloppes', min(20)),
      [`${generali}?p=2`]: page(`${generali}?p=2:1:9`, 'Fiche Salarié', min(3)),
      [`${generali}?p=3`]: page(`${generali}?p=3:1:9`, 'Accueil', min(25)), // plafonné à 30 min depuis minuit
      [`${CRA_ORIGIN}/apex/f`]: page(`${CRA_ORIGIN}/apex/f`, 'Espace Salariés - XAAS', min(30)),
    },
    open: [`${generali}?p=2`, `${CRA_ORIGIN}/apex/f`],
  };
  assert.deepEqual(advancePages(old, at(0, 30)), {
    day: '2026-10-07',
    at: at(0, 30),
    pages: { 'dsb-generali.allshare-scenario.fr': page(`${generali}?p=3:1:9`, 'Accueil', min(30)) },
    open: ['dsb-generali.allshare-scenario.fr'],
  });
  assert.equal(pagesToday(old, at(0, 31))[0].ms, min(31));
});

test('page de saisie du C.R.A : avec ou sans paramètres, même adresse dans le manifest et le script', () => {
  assert.ok(isCraPage(`${CRA_ORIGIN}${CRA_PATH}?session=4242`));
  assert.ok(isCraPage(`${CRA_ORIGIN}${CRA_PATH}`), 'sans paramètres');
  assert.ok(!isCraPage(`${CRA_ORIGIN}${CRA_PATH}-bis?session=1`) && !isCraPage(`${CRA_ORIGIN}/apex/r/x/autre-page`));
  assert.ok(!isCraPage('https://autre.allshare-scenario.fr' + CRA_PATH) && !isCraPage('pas une adresse'));
  const root = new URL('../../extension/', import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('manifest.json', root), 'utf8'));
  assert.deepEqual(manifest.content_scripts[0].matches, [`${CRA_ORIGIN}${CRA_PATH}*`]);
  const script = readFileSync(new URL('content/cra.js', root), 'utf8');
  assert.ok(script.includes(`'${CRA_ORIGIN}'`) && script.includes(`'${CRA_PATH}'`), 'content/cra.js à jour');
});
