import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeText,
  parseLog,
  lastConnections,
  sortUsers,
  searchUsers,
  daysSince,
  agoText,
  inactivity,
  fmtWhen,
  summaryText,
  notesText,
  lastConnectionCountText,
  usersCsv,
  usersSheets,
} from '../../extension/lib/last-connection.js';
import { buildXlsx } from '../../extension/lib/xlsx.js';

const at = (y, m, d, h = 0, mi = 0, s = 0) => new Date(y, m - 1, d, h, mi, s).getTime(); // heure locale

// Journal dans l'ordre chronologique, comme ceux de l'application : dates JJ/MM/AAAA, quelques postes
// en MM/JJ/AAAA, une date AAAA-MM-JJ, champs vides en fin de ligne, suppressions (7e champ)
const LOG = [
  '13/04/2026;12:13:59;SRV_BATCH;DBA;RW;244',
  '15/04/2026;14:15:35;SRV_BATCH;DBA;DELETE;6779;SRV_BATCH',
  '04/19/2026;16:54:55;ANNE.DURAND;GRP_CG_002;RO;',
  '20/04/2026;09:27:22;LEO.MARTIN;GRP_CG_028;MULTI;1456',
  '04/05/2026;17:49:38;LEO.MARTIN;GRP_CG_028;RO;', // 4 mai : LEO.MARTIN écrit JJ/MM (20/04)
  '05/04/2026;22:17:29;ANNE.DURAND;GRP_CG_002;RO;', // 4 mai : ANNE.DURAND écrit MM/JJ (04/19)
  '05/05/2026;01:00:20;SRV_BATCH;DBA;RW;',
  '06/05/2026;14:09:45;LEO.MARTIN;GRP_CG_028;RW;2303',
  '05/06/2026;14:29:54;ZOE.PETIT;GRP_CG_012;RO;', // 6 mai : aucune autre date de ZOE.PETIT, lue d'après la ligne d'avant
  '06/05/2026;14:50:38;SRV_BATCH;DBA;RO;',
  '06/24/2026;14:45:01;anne.durand;GRP_CG_017;RO;', // même utilisateur, en minuscules, autre groupe
  '07/06/2026;16:37:58;ANNE.DURAND;GRP_CG_002;RO;', // 6 juillet : ANNE.DURAND écrit MM/JJ
  '2026-07-07;11:42:05;LEO.MARTIN;GRP_CG_028;RO;',
].join('\n');

test('decodeText : UTF-8, ANSI (Windows-1252) ou UTF-16 avec BOM', () => {
  const utf8 = new TextEncoder().encode('Zoé;Hélène');
  assert.equal(decodeText(utf8), 'Zoé;Hélène');
  assert.equal(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x41])), 'A', 'BOM UTF-8 retiré');
  assert.equal(decodeText(new Uint8Array([0x5a, 0x6f, 0xe9])), 'Zoé', 'ANSI');
  assert.equal(decodeText(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0xe9, 0x00])), 'Aé', 'UTF-16 LE');
  assert.equal(decodeText(new Uint8Array([0xfe, 0xff, 0x00, 0x41])), 'A', 'UTF-16 BE');
});

test('parseLog : dates JJ/MM/AAAA, MM/JJ/AAAA et AAAA-MM-JJ dans le même journal', () => {
  const { entries, ignored } = parseLog(LOG);
  assert.deepEqual(ignored, []);
  assert.equal(entries.length, 13);
  const ts = entries.map((e) => e.ts);
  assert.deepEqual(
    ts,
    [...ts].sort((a, b) => a - b),
    'journal chronologique : toutes les dates lues dans le bon sens',
  );
  const byLine = (n) => entries.find((e) => e.line === n);
  assert.equal(byLine(3).ts, at(2026, 4, 19, 16, 54, 55), '04/19/2026 : seule lecture possible');
  assert.equal(byLine(5).ts, at(2026, 5, 4, 17, 49, 38), 'LEO.MARTIN : JJ/MM');
  assert.equal(byLine(6).ts, at(2026, 5, 4, 22, 17, 29), 'ANNE.DURAND : MM/JJ');
  assert.equal(byLine(9).ts, at(2026, 5, 6, 14, 29, 54), 'ZOE.PETIT : la lecture la plus proche de la ligne d’avant');
  assert.equal(byLine(12).ts, at(2026, 7, 6, 16, 37, 58));
  assert.equal(byLine(13).ts, at(2026, 7, 7, 11, 42, 5), 'AAAA-MM-JJ');
  assert.deepEqual(
    entries.filter((e) => e.us).map((e) => e.line),
    [3, 6, 9, 11, 12],
    'dates lues au format MM/JJ/AAAA',
  );
  assert.deepEqual(byLine(2), {
    line: 2,
    user: 'SRV_BATCH',
    key: 'SRV_BATCH',
    group: 'DBA',
    access: 'DELETE',
    ts: at(2026, 4, 15, 14, 15, 35),
    us: false,
  });
});

test('parseLog : en tête du journal, une date ambiguë se lit d’après la ligne suivante', () => {
  const { entries } = parseLog('03/04/2026;09:00:00;A;G;RO;\n03/15/2026;10:00:00;B;G;RO;');
  assert.equal(entries[0].ts, at(2026, 3, 4, 9), '4 mars plutôt que 3 avril : le plus proche du 15 mars');
  assert.equal(parseLog('03/04/2026;09:00:00;A;G;RO;').entries[0].ts, at(2026, 4, 3, 9), 'seule : JJ/MM');
  assert.equal(parseLog('03/03/2026;09:00:00;A;G;RO;').entries[0].us, false, 'jour = mois : pas de doute');
});

test('parseLog : en-tête, lignes vides, lignes non reconnues, séparateurs, fins de ligne', () => {
  const text = [
    '\uFEFFDate;Heure;Utilisateur;Groupe;Accès',
    '',
    '13/04/2026;12:13;A;G;RO', // sans les secondes
    'texte libre',
    '31/02/2026;10:00:00;B;G;RO', // 31 février
    '13/04/2026;25:00:00;B;G;RO', // 25 h
    '13/04/2026;10:00:00;;G;RO', // sans utilisateur
    '13/13/2026;10:00:00;B;G;RO', // aucune lecture possible
    '14/04/2026\t08:00:00\tC\tG2\tRW', // copié depuis Excel : tabulations
    ' 15.04.2026 , 08:30:00 , D , G3 ',
  ].join('\r\n');
  const { entries, ignored } = parseLog(text);
  assert.deepEqual(ignored, [4, 5, 6, 7, 8], 'en-tête non signalé');
  assert.deepEqual(
    entries.map((e) => [e.line, e.user, e.group, e.ts]),
    [
      [3, 'A', 'G', at(2026, 4, 13, 12, 13)],
      [9, 'C', 'G2', at(2026, 4, 14, 8)],
      [10, 'D', 'G3', at(2026, 4, 15, 8, 30)],
    ],
  );
  assert.deepEqual(parseLog('').entries, []);
  assert.deepEqual(parseLog(undefined).ignored, []);
});

test('lastConnections : une ligne par utilisateur, sans tenir compte des majuscules', () => {
  const r = lastConnections(LOG);
  assert.deepEqual(
    r.users.map((u) => [u.user, u.group, u.access, u.last, u.first, u.count]),
    [
      ['LEO.MARTIN', 'GRP_CG_028', 'RO', at(2026, 7, 7, 11, 42, 5), at(2026, 4, 20, 9, 27, 22), 4],
      ['ANNE.DURAND', 'GRP_CG_002', 'RO', at(2026, 7, 6, 16, 37, 58), at(2026, 4, 19, 16, 54, 55), 4],
      ['SRV_BATCH', 'DBA', 'RO', at(2026, 5, 6, 14, 50, 38), at(2026, 4, 13, 12, 13, 59), 4],
      ['ZOE.PETIT', 'GRP_CG_012', 'RO', at(2026, 5, 6, 14, 29, 54), at(2026, 5, 6, 14, 29, 54), 1],
    ],
    'la plus récente en tête ; nom, groupe et accès de la dernière ligne',
  );
  assert.equal(r.lines, 13);
  assert.equal(r.usDates, 5);
  assert.equal(r.from, at(2026, 4, 13, 12, 13, 59));
  assert.equal(r.to, at(2026, 7, 7, 11, 42, 5));
  assert.equal(summaryText(r), '4 utilisateurs · 13 connexions · du 13/04/2026 au 07/07/2026');
  assert.deepEqual(notesText(r), ['5 dates lues au format MM/JJ/AAAA']);
  const minuscule = lastConnections('24/06/2026;14:45:01;anne.durand;G;RO;\n23/06/2026;10:00:00;ANNE.DURAND;G;RO;');
  assert.deepEqual(
    minuscule.users.map((u) => [u.user, u.count]),
    [['anne.durand', 2]],
    'écrit comme dans sa dernière ligne',
  );
});

test('lastConnections : lignes ignorées (10 numéros au plus), journal vide', () => {
  const lines = ['13/04/2026;12:00:00;A;G;RO', ...Array.from({ length: 12 }, (_, i) => `ligne ${i}`)];
  const r = lastConnections(lines.join('\n'));
  assert.equal(r.ignoredCount, 12);
  assert.deepEqual(r.ignored, [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(notesText(r), ['12 lignes ignorées (format non reconnu) : 2, 3, 4, 5, 6, 7, 8, 9, 10, 11…']);
  assert.equal(
    summaryText(lastConnections('13/04/2026;12:00:00;A;G;RO')),
    '1 utilisateur · 1 connexion · le 13/04/2026',
  );
  const empty = lastConnections('');
  assert.deepEqual([empty.users, empty.from, empty.to, notesText(empty)], [[], null, null, []]);
});

test('sortUsers et searchUsers : tri par colonne, recherche sans accents ni majuscules', () => {
  const users = lastConnections(LOG).users;
  const names = (list) => list.map((u) => u.user);
  assert.deepEqual(names(sortUsers(users, 'user')), ['ANNE.DURAND', 'LEO.MARTIN', 'SRV_BATCH', 'ZOE.PETIT']);
  assert.deepEqual(names(sortUsers(users, 'last', 1)), ['ZOE.PETIT', 'SRV_BATCH', 'ANNE.DURAND', 'LEO.MARTIN']);
  assert.deepEqual(names(sortUsers(users, 'count')), ['ANNE.DURAND', 'LEO.MARTIN', 'SRV_BATCH', 'ZOE.PETIT']);
  assert.deepEqual(names(sortUsers(users, 'group', -1)), ['LEO.MARTIN', 'ZOE.PETIT', 'ANNE.DURAND', 'SRV_BATCH']);
  assert.deepEqual(names(searchUsers(users, 'grp_cg_0')), ['LEO.MARTIN', 'ANNE.DURAND', 'ZOE.PETIT']);
  assert.deepEqual(names(searchUsers(users, '  zoé  012 ')), ['ZOE.PETIT']);
  assert.equal(searchUsers(users, '   '), users);
});

test('inactivité : jours calendaires depuis la dernière connexion', () => {
  const now = at(2026, 10, 12, 9, 0);
  assert.equal(daysSince(at(2026, 10, 12, 0, 5), now), 0);
  assert.equal(daysSince(at(2026, 10, 11, 23, 59), now), 1);
  assert.equal(daysSince(at(2026, 3, 29, 12), at(2026, 3, 30, 12)), 1, 'passage à l’heure d’été');
  assert.equal(daysSince(at(2026, 10, 13), now), 0, 'date à venir');
  assert.deepEqual([0, 1, 45].map(agoText), ["aujourd'hui", 'hier', '45 j']);
  assert.deepEqual([29, 30, 89, 90].map(inactivity), ['', 'warn', 'warn', 'crit']);
  assert.equal(fmtWhen(at(2026, 4, 5, 7, 3, 9)), '05/04/2026 07:03');
  assert.equal(fmtWhen(at(2026, 4, 5, 7, 3, 9), true), '05/04/2026 07:03:09');
});

test('compteur de l’accueil', () => {
  assert.equal(lastConnectionCountText(null), '');
  assert.equal(lastConnectionCountText({ result: lastConnections(LOG) }), '4 utilisateurs dans le dernier tableau');
  assert.equal(
    lastConnectionCountText({ result: lastConnections('13/04/2026;12:00:00;A;G;RO') }),
    '1 utilisateur dans le dernier tableau',
  );
});

test('usersCsv : point-virgule, UTF-8 avec BOM, une ligne par utilisateur dans l’ordre donné', () => {
  const r = lastConnections(LOG);
  const csv = usersCsv(sortUsers(r.users, 'user'), at(2026, 7, 8, 12));
  assert.ok(csv.startsWith('\uFEFF'));
  const lines = csv.slice(1).trimEnd().split('\r\n');
  assert.equal(
    lines[0],
    'Utilisateur;Groupe;Dernière connexion;Inactif depuis (jours);Dernier accès;Connexions;Première connexion',
  );
  assert.equal(lines[1], 'ANNE.DURAND;GRP_CG_002;2026-07-06 16:37:58;2;RO;4;2026-04-19 16:54:55');
  assert.equal(lines.length, 5);
  const odd = lastConnections('13/04/2026;12:00:00;=CMD;G"1;RO').users;
  assert.match(usersCsv(odd, at(2026, 4, 13)), /\r\n'=CMD;"G""1";2026-04-13 12:00:00;0;RO;1;/, 'formule et guillemets');
});

test('usersSheets : feuille Excel avec en-tête figé, filtres et cases d’inactivité colorées', () => {
  const r = lastConnections(LOG);
  const [sheet] = usersSheets(r.users, r, 'connexions.txt', at(2026, 10, 12, 9));
  assert.equal(sheet.name, 'Dernières connexions');
  assert.match(
    sheet.rows[1][0].v,
    /^connexions\.txt · 4 utilisateurs · 13 connexions · du 13\/04\/2026 au 07\/07\/2026 ·/,
  );
  assert.deepEqual(
    sheet.rows[3].map((c) => c.v),
    [
      'Utilisateur',
      'Groupe',
      'Dernière connexion',
      'Inactif depuis (jours)',
      'Dernier accès',
      'Connexions',
      'Première connexion',
    ],
  );
  assert.deepEqual(
    sheet.rows.slice(4).map((row) => [row[0].v, row[3].v, row[3].s]),
    [
      ['LEO.MARTIN', 97, 'crit'],
      ['ANNE.DURAND', 98, 'crit'],
      ['SRV_BATCH', 159, 'crit'],
      ['ZOE.PETIT', 159, 'crit'],
    ],
  );
  assert.equal(usersSheets(r.users, r, 'x', at(2026, 7, 20))[0].rows[4][3].s, 'num', 'moins de 30 jours');
  assert.equal(usersSheets(r.users, r, 'x', at(2026, 8, 10))[0].rows[4][3].s, 'warn', '30 jours ou plus');
  assert.deepEqual(sheet.freeze, { rows: 4, cols: 1 });
  assert.equal(sheet.autoFilter, 'A4:G8');
  const bytes = buildXlsx(usersSheets([], lastConnections(''), 'vide', at(2026, 10, 12)));
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK', 'classeur valide, même vide');
});
