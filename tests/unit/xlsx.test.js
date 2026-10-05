import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildXlsx, colName } from '../../extension/lib/xlsx.js';

test('colName', () => {
  assert.equal(colName(0), 'A');
  assert.equal(colName(25), 'Z');
  assert.equal(colName(26), 'AA');
  assert.equal(colName(701), 'ZZ');
  assert.equal(colName(702), 'AAA');
});

test('buildXlsx produit une archive ZIP valide', () => {
  const bytes = buildXlsx([
    {
      name: 'Comparatif',
      rows: [
        [
          { v: 'Page', s: 'header' },
          { v: 'N/A', s: 'missing' },
        ],
        ['/a & <b>', 12],
      ],
    },
    { name: 'Nom/trop:long*avec?des[caractères]interdits', rows: [] },
    { name: 'comparatif', rows: [] },
  ]);
  assert.equal(String.fromCharCode(bytes[0], bytes[1]), 'PK');
  const dir = mkdtempSync(join(tmpdir(), 'insigth-'));
  const file = join(dir, 't.xlsx');
  writeFileSync(file, bytes);
  let listing;
  try {
    listing = execFileSync('python3', [
      '-c',
      `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);assert z.testzip() is None;print(z.read('xl/workbook.xml').decode())`,
      file,
    ]).toString();
  } catch (e) {
    if (e.code === 'ENOENT') return; // python absent : vérification sautée
    throw e;
  }
  assert.match(listing, /name="Comparatif"/);
  assert.match(listing, /name="comparatif \(2\)"/);
  assert.match(listing, /name="Nom trop long avec des caractèr"/);
});
