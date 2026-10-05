import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchApp, pageKey, matchPatternsFor, parseBase } from '../../extension/lib/urls.js';

const apps = [
  { id: 'a', name: 'Appli 1', baseUrls: ['https://srv.example.com/appli1/'] },
  { id: 'b', name: 'Appli 2', baseUrls: ['https://srv.example.com/Appli2', 'http://localhost:8080/'] },
  { id: 'c', name: 'Racine', baseUrls: ['https://srv.example.com/'] },
];
const defaults = { ignoreQuery: true, replaceIds: true, caseInsensitive: true };

test('parseBase refuse les URL non http(s)', () => {
  assert.equal(parseBase('ftp://x'), null);
  assert.equal(parseBase('pas une url'), null);
  assert.deepEqual(parseBase('https://x.fr/a/b/').path, '/a/b');
});

test('matchPatternsFor produit un motif par hôte, sans port', () => {
  assert.deepEqual(matchPatternsFor('http://localhost:8080/app/'), ['http://localhost/*']);
  assert.deepEqual(matchPatternsFor('https://srv.example.com/appli1/'), ['https://srv.example.com/*']);
  assert.deepEqual(matchPatternsFor('javascript:alert(1)'), []);
});

test("matchApp choisit l'URL de base la plus longue", () => {
  assert.equal(matchApp('https://srv.example.com/appli1/clients', apps, defaults).app.id, 'a');
  assert.equal(matchApp('https://srv.example.com/APPLI2/clients', apps, defaults).app.id, 'b');
  assert.equal(matchApp('https://srv.example.com/autre', apps, defaults).app.id, 'c');
  assert.equal(matchApp('https://srv.example.com/appli1.aspx', apps, defaults).app.id, 'c');
  assert.equal(matchApp('http://localhost:8080/x', apps, defaults).app.id, 'b');
  assert.equal(matchApp('http://localhost:9090/x', apps, defaults), null, 'le port compte');
  assert.equal(matchApp('https://ailleurs.fr/', apps, defaults), null);
});

test('matchApp respecte la casse si demandé', () => {
  const m = matchApp('https://srv.example.com/APPLI2/x', apps, { caseInsensitive: false });
  assert.equal(m.app.id, 'c');
});

test('pageKey aligne les pages de deux applications', () => {
  const k1 = pageKey('https://srv.example.com/appli1/Clients/42?tri=nom', '/appli1', defaults);
  const k2 = pageKey('https://srv.example.com/Appli2/clients/1234/', '/Appli2', defaults);
  assert.equal(k1, '/clients/:id');
  assert.equal(k2, '/clients/:id');
  assert.equal(pageKey('https://srv.example.com/appli1/', '/appli1', defaults), '/');
  assert.equal(pageKey('https://srv.example.com/appli1', '/appli1', defaults), '/');
});

test('pageKey gère les UUID, les routes hash et les options', () => {
  assert.equal(
    pageKey('https://x.fr/dossier/3f2b8c1e-1234-4abc-9def-0123456789ab/edit', '', defaults),
    '/dossier/:id/edit',
  );
  assert.equal(pageKey('https://x.fr/index.html#/Factures/12?x=1', '', defaults), '/index.html#/factures/:id');
  assert.equal(pageKey('https://x.fr/#!/home', '', defaults), '/#/home');
  assert.equal(pageKey('https://x.fr/#ancre', '', defaults), '/', "une ancre simple n'est pas une route");
  assert.equal(
    pageKey('https://x.fr/Clients/42?b=2', '', { ignoreQuery: false, replaceIds: false, caseInsensitive: false }),
    '/Clients/42?b=2',
  );
  assert.equal(pageKey('https://x.fr/caf%C3%A9', '', defaults), '/café');
});
