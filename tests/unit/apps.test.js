import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAppList, mergeApps, appsToCsv, urlConflicts, defaultName } from '../../extension/lib/apps.js';

test('parseAppList : copier-coller Excel, CSV, URL seule, en-tête, erreurs', () => {
  const text = [
    'Nom\tURL',
    'Client A\thttps://clienta.fr/',
    'Client B;https://srv/clientB/ | https://srv2/clientB/',
    'https://srv/clientC/',
    '# commentaire',
    '',
    'Client D,https://srv/clientD/',
    'Client E;pas une url',
    'Client F;https://exemple.fr/ ftp://x',
    '"Client G";"https://srv/g/"',
  ].join('\n');
  const { entries, errors } = parseAppList(text);
  assert.deepEqual(entries, [
    { name: 'Client A', urls: ['https://clienta.fr/'] },
    { name: 'Client B', urls: ['https://srv/clientB/', 'https://srv2/clientB/'] },
    { name: 'srv/clientC', urls: ['https://srv/clientC/'] },
    { name: 'Client D', urls: ['https://srv/clientD/'] },
    { name: 'Client G', urls: ['https://srv/g/'] },
  ]);
  assert.deepEqual(
    errors.map((e) => e.line),
    [8, 9],
  );
});

test('mergeApps : ajoute les nouvelles, complète les existantes (même nom)', () => {
  const existing = [{ id: 'x', name: 'Client A', baseUrls: ['https://clienta.fr/'] }];
  const { apps, added, updated } = mergeApps(existing, [
    { name: 'client a', urls: ['https://clienta.fr/', 'https://clienta2.fr/'] },
    { name: 'Client B', urls: ['https://srv/b/'] },
  ]);
  assert.equal(added, 1);
  assert.equal(updated, 1);
  assert.deepEqual(apps[0].baseUrls, ['https://clienta.fr/', 'https://clienta2.fr/']);
  assert.equal(apps[1].name, 'Client B');
  assert.ok(apps[1].id);
  assert.deepEqual(existing[0].baseUrls, ['https://clienta.fr/'], "l'original n'est pas modifié");
});

test('appsToCsv est réimportable', () => {
  const apps = [
    { id: '1', name: 'A;B', baseUrls: ['https://a/', 'https://b/'] },
    { id: '2', name: 'C', baseUrls: ['https://c/'] },
  ];
  const { entries, errors } = parseAppList(appsToCsv(apps).replace('﻿', ''));
  assert.equal(errors.length, 0);
  assert.deepEqual(entries, [
    { name: 'A B', urls: ['https://a/', 'https://b/'] },
    { name: 'C', urls: ['https://c/'] },
  ]);
});

test('urlConflicts et defaultName', () => {
  const conflicts = urlConflicts([
    { id: '1', name: 'A', baseUrls: ['https://srv/x/'] },
    { id: '2', name: 'B', baseUrls: ['https://SRV/x'] },
    { id: '3', name: 'C', baseUrls: ['https://srv/y/'] },
  ]);
  assert.deepEqual(conflicts.get('1'), ['B']);
  assert.deepEqual(conflicts.get('2'), ['A']);
  assert.equal(conflicts.has('3'), false);
  assert.equal(defaultName('https://serveur.local/client1/'), 'serveur.local/client1');
});
