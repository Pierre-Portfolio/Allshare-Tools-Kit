import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dayBounds, openedOn, craCountText } from '../../extension/lib/cra.js';

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

test('compteur de l’accueil', () => {
  const caps = [{ id: 'a', ts: at(9, 0, 1), opens: [at(10, 0)] }];
  assert.equal(craCountText(caps, at(18, 0)), "1 capsule ouverte aujourd'hui");
  assert.equal(craCountText([...caps, { id: 'b', ts: at(11, 0) }], at(18, 0)), "2 capsules ouvertes aujourd'hui");
  assert.equal(craCountText(caps, at(18, 0, 8)), '');
});
