import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BACKUP_FORMAT,
  buildBackup,
  readBackup,
  backupCounts,
  describeCounts,
  mergeBackup,
  toBase64,
  fromBase64,
} from '../../extension/lib/backup.js';
import { MAX_FILES } from '../../extension/lib/prisme-files.js';

const measure = (id, app, page, network = 'ethernet', duration = 1200) => ({
  id,
  ts: 1000,
  app,
  sid: 'PRD',
  version: '5.3',
  page,
  network,
  duration,
  timeout: false,
});
const file = (id, ts, hash = id) => ({ id, name: `${id}.csv`, size: 10, ts, hash, summary: {} });

/** Données d'un poste : Insight, Capsule, Prisme, Training, réglages et une clé d'une version future. */
const sample = () => ({
  apps: [{ id: 'a1', name: 'Client A', baseUrls: ['https://a.fr/'] }],
  pages: [{ id: 'p1', name: 'Dashboard', hidden: false }],
  m_1: measure('1', 'Client A', 'Dashboard'),
  m_2: measure('2', 'Client A', 'Dashboard', 'wifi'),
  settings: { network: 'wifi', unit: 'ms' },
  draft: { app: 'Client A', sid: 'PRD' },
  capsules: [
    { id: 'c1', ts: 50, title: 'Recette', client: 'Client A', comment: '', tabs: [{ url: 'https://a.fr/', win: 0 }] },
  ],
  prismeFiles: [file('f1', 30)],
  prismeSettings: { expected: 'utf8' },
  training: { qcm: { 'rh-1-e1': { pick: 2 } }, open: {}, last: { module: 'rh', anchor: 'rh-1', ts: 10 } },
  futur: { x: 1 },
});
const contents = { f1: 'YWJj' };

test('base64 : tous les octets, au-delà d’un bloc de 32 Ko', () => {
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => (i * 7) % 256);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  assert.equal(toBase64(new TextEncoder().encode('abc')), 'YWJj');
});

test('readBackup : fichier reconnu, autres sauvegardes refusées', () => {
  const backup = buildBackup(sample(), { ...contents, bad: 3 }, { 'training.theme': 'dark' }, '3.8.0', new Date(0));
  assert.equal(backup.format, BACKUP_FORMAT);
  assert.equal(backup.appVersion, '3.8.0');
  assert.equal(backup.exportedAt, '1970-01-01T00:00:00.000Z');
  const read = readBackup(JSON.parse(JSON.stringify(backup)));
  assert.deepEqual(read.storage, sample());
  assert.deepEqual(read.prismeContents, contents, 'contenu non textuel ignoré');
  assert.deepEqual(read.localStorage, { 'training.theme': 'dark' });
  for (const other of [
    null,
    [],
    { format: 'insight-backup', version: 2, measures: [] },
    { format: 'allshare-training', progress: {} },
    { format: BACKUP_FORMAT },
    { format: BACKUP_FORMAT, storage: [] },
  ]) {
    assert.throws(() => readBackup(other), /pas une sauvegarde Allshare Tools Kit/);
  }
});

test('backupCounts et describeCounts : contenu du fichier', () => {
  const counts = backupCounts(sample(), contents);
  assert.deepEqual(counts, { measures: 2, capsules: 1, files: 1, answers: 1 });
  assert.equal(describeCounts(counts), '2 mesures Insight, 1 session Capsule, 1 fichier Prisme, 1 réponse Training');
  assert.equal(describeCounts({ measures: 1500 }), '1 500 mesures Insight');
  assert.equal(describeCounts({}), '');
  assert.deepEqual(backupCounts({}), { measures: 0, capsules: 0, files: 0, answers: 0 });
});

test('mergeBackup : nouvelle installation, tout est restauré', () => {
  const plan = mergeBackup({}, sample(), contents);
  const s = plan.set;
  assert.deepEqual(s.m_1, sample().m_1);
  assert.deepEqual(s.m_2, sample().m_2);
  const noId = (list) => list.map(({ id, ...rest }) => rest); // identifiants recréés, sans importance
  assert.deepEqual(noId(s.apps), noId(sample().apps));
  assert.deepEqual(noId(s.pages), noId(sample().pages));
  assert.deepEqual(s.capsules, sample().capsules);
  assert.deepEqual(s.prismeFiles, sample().prismeFiles);
  assert.deepEqual(s.training, sample().training);
  assert.deepEqual(s.settings, sample().settings);
  assert.deepEqual(s.draft, sample().draft);
  assert.deepEqual(s.prismeSettings, sample().prismeSettings);
  assert.deepEqual(s.futur, { x: 1 }, 'clé inconnue reprise');
  assert.deepEqual(plan.putFiles, ['f1']);
  assert.deepEqual(plan.dropFiles, []);
  assert.deepEqual(plan.added, { measures: 2, capsules: 1, files: 1, answers: 1 });
});

test('mergeBackup : sur un autre poste, rien n’est effacé ni doublé', () => {
  const local = {
    apps: [{ id: 'z', name: 'client a', baseUrls: ['https://a2.fr/'] }],
    pages: [{ id: 'q', name: 'Factures', hidden: true }],
    m_1: measure('1', 'client a', 'Dashboard'), // déjà présente (même identifiant)
    m_9: measure('9', 'client a', 'Factures'),
    settings: { network: 'ethernet', quietMs: 2000 },
    capsules: [
      { id: 'c8', ts: 10, title: 'Placée en tête', tabs: [] }, // ordre choisi par glisser-déposer
      { id: 'c9', ts: 90, title: 'Locale', tabs: [] },
    ],
    prismeFiles: [{ ...file('g1', 20, 'f1'), name: 'f1.csv' }], // même fichier que f1, autre identifiant
    training: { qcm: { 'rh-1-e1': { pick: 0 }, 'olap-1-e1': { pick: 1 } }, open: {}, last: null },
    futur: { x: 2 },
  };
  const plan = mergeBackup(local, sample(), contents);
  const s = plan.set;
  assert.deepEqual(
    Object.keys(s).filter((k) => k.startsWith('m_')),
    ['m_2'],
    'seule la mesure absente',
  );
  assert.equal(s.m_2.app, 'client a', 'nom du client du poste');
  assert.deepEqual(s.apps, [{ id: 'z', name: 'client a', baseUrls: ['https://a2.fr/', 'https://a.fr/'] }]);
  assert.deepEqual(
    s.pages.map((p) => [p.name, p.hidden]),
    [
      ['Factures', true],
      ['Dashboard', false],
    ],
  );
  assert.deepEqual(s.settings, { network: 'wifi', unit: 'ms', quietMs: 2000 }, 'réglages du fichier');
  assert.deepEqual(
    s.capsules.map((c) => c.id),
    ['c8', 'c9', 'c1'],
    'sessions du poste dans leur ordre, puis celles du fichier',
  );
  assert.ok(!('prismeFiles' in s), 'fichier déjà présent');
  assert.deepEqual(s.training.qcm, { 'rh-1-e1': { pick: 0 }, 'olap-1-e1': { pick: 1 } }, 'réponse locale gardée');
  assert.deepEqual(s.training.last, sample().training.last);
  assert.ok(!('futur' in s), 'clé inconnue du poste conservée');
  assert.deepEqual(plan.added, { measures: 1, capsules: 1, files: 0, answers: 0 });

  // Réimporter le même fichier : plus rien de nouveau
  const after = { ...local, ...s };
  assert.deepEqual(mergeBackup(after, sample(), contents).added, { measures: 0, capsules: 0, files: 0, answers: 0 });
});

test('mergeBackup : fichiers Prisme, les plus récents gardés, fichier sans contenu ignoré', () => {
  const local = { prismeFiles: Array.from({ length: MAX_FILES }, (_, i) => file(`l${i}`, 100 - i * 10)) };
  const incoming = { prismeFiles: [file('new', 95), file('old', 1), file('vide', 99)] };
  const plan = mergeBackup(local, incoming, { new: 'YQ==', old: 'Yg==' });
  assert.equal(plan.set.prismeFiles.length, MAX_FILES);
  assert.deepEqual(
    plan.set.prismeFiles.slice(0, 2).map((f) => f.id),
    ['l0', 'new'],
  );
  assert.deepEqual(plan.putFiles, ['new'], 'le plus ancien n’entre pas');
  assert.deepEqual(plan.dropFiles, [`l${MAX_FILES - 1}`], 'le plus ancien du poste est oublié');
  assert.equal(plan.added.files, 1);
});
