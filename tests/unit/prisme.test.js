import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze,
  decode,
  decodeAnsi,
  detectDelimiter,
  parseCSV,
  classify,
  encodeAnsi,
  convert,
  convertedName,
  excelValue,
  excelRecords,
  binaryKind,
  demoBytes,
  colLetter,
  fmtSize,
  locLabel,
  filterRows,
  sortedGroups,
  summarize,
  verdict,
  encodingStatus,
  fingerprint,
} from '../../extension/lib/prisme.js';

const ansi = (s) => encodeAnsi(s).bytes;
const utf8 = (s) => new TextEncoder().encode(s);
const codes = (res) => sortedGroups(res).map((g) => g.code);
const CLEAN = 'Code;Libellé;Montant\r\nA1;Café;12,50\r\nA2;Thé;8,90\r\nA3;Pain;1,20\r\n';

test('Windows-1252 : plage 0x80–0x9F (€, ’, Œ…) dans les deux sens', () => {
  assert.equal(decodeAnsi(new Uint8Array([0x80, 0x92, 0x8c, 0x9f, 0x81, 0xe9])), '€’ŒŸ\u0081é');
  assert.deepEqual([...encodeAnsi('€’ŒŸé✓').bytes], [0x80, 0x92, 0x8c, 0x9f, 0xe9, 0x3f]);
  assert.equal(encodeAnsi('€’ŒŸé✓').lost, 1);
});

test('encodage : ASCII, ANSI, UTF-8 avec ou sans BOM, mixte, UTF-16', () => {
  assert.equal(decode(utf8('a;b\r\n1;2\r\n')).enc, 'ascii');
  assert.equal(decode(ansi('é;è\r\n')).enc, 'windows-1252');
  assert.equal(decode(utf8('é;è\r\n')).enc, 'utf-8');
  const bom = decode(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8('é;b\r\n')]));
  assert.equal(bom.label, 'UTF-8 avec BOM');
  assert.equal(bom.text, 'é;b\r\n');
  const mixed = decode(new Uint8Array([...ansi('é;1\r\n'), ...utf8('è;2\r\n'), ...ansi('à;3')]));
  assert.equal(mixed.enc, 'mixed');
  assert.equal(mixed.text, 'é;1\r\nè;2\r\nà;3', 'chaque ligne lue dans son encodage');
  const u16 = new Uint8Array([
    0xff,
    0xfe,
    ...new Uint8Array(new Uint16Array([...'a;é\r\n'].map((c) => c.charCodeAt(0))).buffer),
  ]);
  assert.deepEqual([decode(u16).enc, decode(u16).text], ['utf-16le', 'a;é\r\n']);
  assert.equal(decode(ansi('é'), 'utf-8').forced, true);
});

test('séparateur : celui de l’en-tête le plus stable', () => {
  assert.equal(detectDelimiter('a;b;c\n1;2;3\n4;5;6').d, ';');
  assert.equal(detectDelimiter('a,b,c\n1,2,3\n"x;y",5,6').d, ',');
  assert.equal(detectDelimiter('a\tb\n1\t2').d, '\t');
  assert.equal(detectDelimiter('a|b|c\n1|2|3').d, '|');
});

test('lecture CSV : guillemets, valeurs multi-lignes, positions d’origine', () => {
  const recs = parseCSV('a;"b ""c"""\r\n"x\r\ny";2\r\nz";3', ';');
  assert.deepEqual(
    recs.map((r) => r.fields.map((f) => f.v)),
    [
      ['a', 'b "c"'],
      ['x\r\ny', '2'],
      ['z"', '3'],
    ],
  );
  assert.deepEqual([recs[1].line, recs[1].lineEnd], [2, 3]);
  assert.equal(recs[2].issues[0].code, 'stray-quote');
  assert.equal(parseCSV('a;"b', ';')[0].issues[0].code, 'unclosed-quote');
  assert.equal(parseCSV('"a"b;c', ';')[0].issues[0].code, 'quote-garbage');
});

test('typage des valeurs', () => {
  assert.equal(classify('12,50').sub, 'comma');
  assert.equal(classify('12.50').sub, 'point');
  assert.equal(classify('1 250,00').sub, 'grouped');
  assert.equal(classify('1,23E+11').sub, 'sci');
  assert.equal(classify('31/12/2024').fam, 'date');
  assert.equal(classify('2024-01-09').sub, 'AAAA-MM-JJ');
  assert.equal(classify('Café').fam, 'text');
  assert.equal(classify('  ').fam, 'empty');
});

test('fichier propre : aucune erreur ni alerte', () => {
  const res = analyze(ansi(CLEAN));
  assert.equal(verdict(res), 'ok');
  assert.deepEqual(codes(res), ['enc-ansi-ok']);
  assert.deepEqual(summarize(res), {
    encoding: 'ANSI (Windows-1252)',
    delim: ';',
    rows: 3,
    cols: 3,
    counts: { error: 0, warning: 0, info: 1 },
  });
  assert.equal(encodingStatus(res).cls, 'ok');
  // Le même fichier attendu en UTF-8 : l'encodage n'est plus conforme
  const utf = analyze(ansi(CLEAN), { expected: 'utf8' });
  assert.deepEqual([verdict(utf), codes(utf)], ['warning', ['enc-ansi']]);
});

test('exemple avec erreurs : tous les contrôles attendus', () => {
  const res = analyze(demoBytes());
  assert.equal(res.dec.enc, 'mixed');
  for (const code of [
    'enc-mixed',
    'eol-mixed',
    'header-trailing',
    'trailing-delim',
    'too-many-cols',
    'too-few-cols',
    'empty-line',
    'dup-row',
    'only-delims',
    'mojibake',
    'question-mark',
    'nbsp',
    'ws-edge',
    'stray-quote',
    'invalid-date',
    'mixed-date',
    'mixed-decimal',
    'type-mismatch',
    'sci',
    'formula',
  ]) {
    assert.ok(codes(res).includes(code), code);
  }
  assert.ok(!codes(res).includes('c1-control'), '0x89 de la ligne UTF-8 lu « ‰ » en Windows-1252, pas U+0089');
  assert.equal(res.recs[5].fields[1].v, 'Éclair café', 'ligne UTF-8 lue en UTF-8, sans accents cassés');
  assert.deepEqual(res.counts, { error: 7, warning: 15, info: 7 });
  assert.equal(verdict(res), 'error');
  // Emplacements lisibles et ligne d'origine des doublons
  const dup = res.groups.get('dup-row').locs[0];
  assert.equal(locLabel(res, dup), 'L18');
  assert.equal(res.recs[dup.r].dupOf, 7);
  assert.equal(locLabel(res, res.groups.get('invalid-date').locs[0]), 'L5 · Date opération');
  assert.equal(locLabel(res, res.groups.get('header-trailing').locs[0]), 'En-tête · +1', 'colonne hors en-tête');
  // Filtres de la grille
  assert.equal(filterRows(res).length, res.recs.length - 1);
  assert.deepEqual(
    filterRows(res, { search: 'brioche' }).map((r) => res.recs[r].line),
    [7, 18],
  );
  assert.ok(filterRows(res, { onlyIssues: true }).every((r) => res.rowIss.has(r)));
});

test('conversion ANSI / UTF-8 et fins de ligne', () => {
  const res = analyze(utf8('Nom;Prix\nCafé;2€\nThé ✓;3\n'));
  const a = convert(res, 'ansi');
  assert.equal(a.lost, 1, '✓ non convertible');
  assert.equal(decodeAnsi(a.bytes), 'Nom;Prix\r\nCafé;2€\r\nThé ?;3\r\n');
  const u = convert(res, 'utf8', false);
  assert.deepEqual([...u.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
  assert.equal(new TextDecoder().decode(u.bytes.slice(3)), 'Nom;Prix\nCafé;2€\nThé ✓;3\n');
  assert.equal(convertedName('mouvements.csv', a.suffix), 'mouvements_ANSI.csv');
  // Fichier mixte (ligne UTF-8 dans un fichier ANSI) : la conversion répare la ligne UTF-8
  const mixed = analyze(new Uint8Array([...ansi('Nom;Ville\r\nThé;Besançon\r\n'), ...utf8('Éclair;Orléans\r\n')]));
  assert.equal(decodeAnsi(convert(mixed, 'ansi').bytes), 'Nom;Ville\r\nThé;Besançon\r\nÉclair;Orléans\r\n');
  assert.equal(convertedName('export', u.suffix), 'export_UTF8.csv');
});

test('visuel d’Excel : nombres, dates, notation scientifique, lecture ANSI sans BOM', () => {
  assert.deepEqual(excelValue('12,50'), { v: '12,5', n: true });
  assert.deepEqual(excelValue('123456789012'), { v: '1,23457E+11', n: true });
  assert.deepEqual(excelValue('2024-01-09'), { v: '09/01/2024', n: true, date: true });
  assert.deepEqual(excelValue('3/1/24'), { v: '03/01/2024', n: true, date: true });
  assert.deepEqual(excelValue('31/02/2024'), { v: '31/02/2024', n: false });
  assert.deepEqual(excelValue('12.50'), { v: '12.50', n: false });
  const bytes = utf8('Nom,Ville\nCafé,Paris\n');
  const { recs, notes } = excelRecords(bytes, analyze(bytes));
  assert.equal(recs[1].fields[0].v, 'CafÃ©,Paris', 'UTF-8 sans BOM lu en ANSI, découpe sur « ; » seulement');
  assert.equal(notes.length, 2);
});

test('fichiers refusés et formats', () => {
  assert.equal(binaryKind(new Uint8Array([0x50, 0x4b, 3, 4]), 'a.xlsx'), 'un classeur Excel (.xlsx)');
  assert.equal(binaryKind(new Uint8Array([0x25, 0x50, 0x44, 0x46]), 'a.csv'), 'un PDF');
  assert.equal(binaryKind(utf8('a;b'), 'a.xls'), 'un classeur (.xls)');
  assert.equal(binaryKind(utf8('a;b'), 'a.csv'), null);
  assert.deepEqual([0, 25, 26, 701].map(colLetter), ['A', 'Z', 'AA', 'ZZ']);
  assert.deepEqual([512, 1536, 3 * 1048576].map(fmtSize), ['512 o', '1,5 Ko', '3,00 Mo']);
  assert.equal(fingerprint(utf8('abc')), fingerprint(utf8('abc')));
  assert.notEqual(fingerprint(utf8('abc')), fingerprint(utf8('abd')));
});
