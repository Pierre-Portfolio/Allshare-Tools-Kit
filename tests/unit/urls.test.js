import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchApp, parseBase, urlEnd } from '../../extension/lib/urls.js';

const apps = [
  { id: 'a', name: 'Appli 1', baseUrls: ['https://srv.example.com/appli1/'] },
  { id: 'b', name: 'Appli 2', baseUrls: ['https://srv.example.com/Appli2', 'http://localhost:8080/'] },
  { id: 'c', name: 'Racine', baseUrls: ['https://srv.example.com/'] },
];

test('parseBase refuse les URL non http(s)', () => {
  assert.equal(parseBase('ftp://x'), null);
  assert.equal(parseBase('pas une url'), null);
  assert.equal(parseBase('https://x.fr/a/b/').path, '/a/b');
});

test("matchApp choisit l'URL de base la plus longue, sans tenir compte de la casse du chemin", () => {
  assert.equal(matchApp('https://srv.example.com/appli1/clients', apps).app.id, 'a');
  assert.equal(matchApp('https://srv.example.com/APPLI2/clients', apps).app.id, 'b');
  assert.equal(matchApp('https://srv.example.com/autre', apps).app.id, 'c');
  assert.equal(matchApp('https://srv.example.com/appli1.aspx', apps).app.id, 'c');
  assert.equal(matchApp('http://localhost:8080/x', apps).app.id, 'b');
  assert.equal(matchApp('http://localhost:9090/x', apps), null, 'le port compte');
  assert.equal(matchApp('https://ailleurs.fr/', apps), null);
});

test('urlEnd : dernier segment + paramètres', () => {
  assert.equal(urlEnd('https://dsb.fr/apex/f?p=103:21:2020327542118:::'), 'f?p=103:21:2020327542118:::');
  assert.equal(urlEnd('https://srv/app/clients/'), 'clients/');
  assert.equal(urlEnd('https://srv/'), '/');
  assert.equal(urlEnd('https://srv/a/b#/route'), 'b#/route');
  assert.equal(urlEnd('pas une url'), '');
});
