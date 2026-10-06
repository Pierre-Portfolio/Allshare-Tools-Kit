import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODULES,
  moduleById,
  exoId,
  examId,
  notionStats,
  moduleStats,
  overallStats,
  trainingCountText,
  resetModule,
  mergeProgress,
  normalize,
  optionOrder,
  progressBackup,
  readProgressBackup,
  emptyProgress,
} from '../../extension/lib/training.js';
import { H, highlight } from '../../extension/training/content/helpers.js';

test('Training : trois modules dans l’ordre Métier RH, OLAP, APEX', () => {
  assert.deepEqual(
    MODULES.map((m) => m.id),
    ['rh', 'olap', 'apex'],
  );
  assert.deepEqual(
    MODULES.map((m) => m.label),
    ['Métier RH', 'OLAP', 'APEX'],
  );
  assert.equal(moduleById('apex').title, 'Oracle APEX');
  assert.equal(moduleById('inconnu'), null);
});

test('contenu : 8 notions par module, 5 exercices (3 QCM + 2 questions ouvertes) chacune', () => {
  const ids = new Set();
  for (const m of MODULES) {
    assert.equal(m.notions.length, 8, m.id);
    m.notions.forEach((n, i) => {
      assert.equal(n.id, `${m.id}-${i + 1}`, 'identifiants de notion dans l’ordre');
      assert.ok(!ids.has(n.id), `identifiant unique : ${n.id}`);
      ids.add(n.id);
      for (const field of ['short', 'title', 'level', 'duration', 'intro', 'content']) {
        assert.ok(n[field], `${n.id}.${field}`);
      }
      assert.ok(n.objectives.length >= 3 && n.keypoints.length >= 3, n.id);
      const qcm = n.exercises.filter((e) => e.type === 'qcm');
      const open = n.exercises.filter((e) => e.type === 'open');
      assert.equal(qcm.length, 3, `${n.id} : 3 QCM`);
      assert.equal(open.length, 2, `${n.id} : 2 questions ouvertes`);
      for (const e of qcm) {
        assert.ok(e.options.length >= 3, `${n.id} : au moins 3 options`);
        assert.ok(Number.isInteger(e.answer) && e.answer >= 0 && e.answer < e.options.length, `${n.id} : réponse`);
        assert.equal(new Set(e.options).size, e.options.length, `${n.id} : options distinctes`);
        assert.ok(e.explain, `${n.id} : explication`);
      }
      for (const e of open) assert.ok(e.answer && e.criteria.length >= 3, `${n.id} : correction et critères`);
    });
    assert.ok(m.exam.length >= 10, `${m.id} : examen`);
    for (const q of m.exam) assert.ok(q.answer >= 0 && q.answer < q.options.length && q.explain, `${m.id} : examen`);
    assert.ok(m.glossary.length >= 20 && m.resources.length >= 4 && m.memo, `${m.id} : annexes`);
    for (const r of m.resources) assert.match(r.url, /^https:\/\//);
  }
});

test('contenu : pas d’identifiant HTML en double sur une même page, pas de script ni de gestionnaire en ligne', () => {
  for (const m of MODULES) {
    const html = m.notions.map((n) => n.content).join('') + m.memo;
    const seen = new Set();
    for (const [, id] of html.matchAll(/\sid="([^"]+)"/g)) {
      assert.ok(!seen.has(id), `${m.id} : id="${id}" en double`);
      seen.add(id);
    }
    // Politique de sécurité des extensions : aucun script en ligne
    assert.doesNotMatch(html, /<script|\son[a-z]+=/i, m.id);
  }
});

test('contenu : les deux modules issus de la formation OLAP & APEX ne parlent plus de « partie 1 / 2 »', () => {
  for (const id of ['olap', 'apex']) {
    const m = moduleById(id);
    const text = JSON.stringify(m);
    assert.doesNotMatch(text, /partie [12]\b/i, id);
    assert.doesNotMatch(text, /\[(OLAP|APEX)( \+ OLAP)?\]/, `${id} : plus de préfixe de partie dans l’examen`);
  }
});

test('helpers : blocs de code colorés et échappés', () => {
  const html = H.code('sql', "\n    SELECT a FROM t WHERE x = '<b>' -- note\n  ");
  assert.match(html, /<span class="lang">SQL<\/span>/);
  assert.match(html, /<span class="tok-kw">SELECT<\/span>/);
  assert.match(html, /&lt;b&gt;/);
  assert.match(html, /<span class="tok-com">-- note<\/span>/);
  assert.equal(highlight('a < b', 'text'), 'a &lt; b');
  assert.match(H.tbl(['A', '#B'], [['x', '1']]), /<td class="n">1<\/td>/);
});

const rh = moduleById('rh');
const n1 = rh.notions[0];

test('progression : notion, module, total', () => {
  const p = emptyProgress();
  p.qcm[exoId(n1, 0)] = { pick: n1.exercises[0].answer }; // juste
  p.qcm[exoId(n1, 1)] = { pick: (n1.exercises[1].answer + 1) % n1.exercises[1].options.length }; // faux
  p.qcm[exoId(n1, 2)] = { pick: null }; // correction consultée
  p.open[exoId(n1, 3)] = { text: 'ma réponse' }; // saisie seule : pas encore faite
  p.open[exoId(n1, 4)] = { shown: true };
  const s = notionStats(n1, p);
  assert.deepEqual([s.qcmOk, s.qcmDone, s.openDone, s.done, s.total, s.complete], [1, 3, 1, 4, 5, false]);
  p.open[exoId(n1, 3)].self = 'mid';
  assert.equal(notionStats(n1, p).complete, true);
  const ms = moduleStats(rh, p);
  assert.equal(ms.done, 5);
  assert.equal(ms.total, 40);
  assert.equal(ms.pct, 13);
  assert.equal(ms.complete, 1);
  assert.equal(ms.resume.id, 'rh-2', 'reprendre à la première notion non terminée');
  assert.deepEqual(overallStats(p), { done: 5, total: 120, pct: 4 });
  assert.equal(trainingCountText(p), '5 exercices faits · 4 %');
  assert.equal(trainingCountText(emptyProgress()), '');
});

test('progression : « Reprendre » sur la dernière notion lue si elle n’est pas terminée', () => {
  const p = emptyProgress();
  p.last = { module: 'rh', anchor: 'rh-4', ts: 1 };
  assert.equal(moduleStats(rh, p).resume.id, 'rh-4');
  assert.equal(moduleStats(rh, p).started, true);
  assert.equal(moduleStats(moduleById('olap'), p).started, false, 'autre module : pas commencé');
});

test('examen : score et identifiants', () => {
  const p = emptyProgress();
  rh.exam.forEach((q, i) => {
    p.qcm[examId(rh, i)] = { pick: i < 7 ? q.answer : (q.answer + 1) % q.options.length };
  });
  const s = moduleStats(rh, p);
  assert.deepEqual(s.exam, { done: 10, ok: 7, total: 10 });
  assert.equal(s.done, 0, 'l’examen n’entre pas dans les exercices des notions');
  assert.equal(examId(rh, 0), 'rh-exam-1');
});

test('réinitialiser un module ne touche pas aux autres', () => {
  const p = {
    qcm: { 'rh-1-e1': { pick: 1 }, 'rh-exam-2': { pick: 0 }, 'olap-1-e1': { pick: 2 } },
    open: { 'rh-1-e4': { text: 'x' }, 'apex-2-e5': { shown: true } },
    last: { module: 'rh', anchor: 'rh-3', ts: 5 },
  };
  const r = resetModule(p, 'rh');
  assert.deepEqual(Object.keys(r.qcm), ['olap-1-e1']);
  assert.deepEqual(Object.keys(r.open), ['apex-2-e5']);
  assert.equal(r.last, null);
  assert.deepEqual(resetModule(p, 'olap').last, p.last);
});

test('fusion et sauvegarde de la progression', () => {
  const local = {
    qcm: { a: { pick: 1 } },
    open: { b: { text: 'local' } },
    last: { module: 'rh', anchor: 'rh-1', ts: 10 },
  };
  const incoming = {
    qcm: { a: { pick: 3 }, c: { pick: 0 } },
    open: { b: { text: 'distant' }, d: { shown: true } },
    last: { module: 'olap', anchor: 'olap-2', ts: 20 },
  };
  const m = mergeProgress(local, incoming);
  assert.deepEqual(m.qcm, { a: { pick: 1 }, c: { pick: 0 } }, 'réponse locale conservée');
  assert.equal(m.open.b.text, 'local');
  assert.ok(m.open.d.shown);
  assert.equal(m.last.anchor, 'olap-2', 'dernière lecture la plus récente');
  const backup = progressBackup(local, new Date('2026-10-06T10:00:00Z'));
  assert.equal(backup.format, 'allshare-training');
  assert.equal(backup.exportedAt, '2026-10-06T10:00:00.000Z');
  assert.deepEqual(readProgressBackup(JSON.parse(JSON.stringify(backup))), normalize(local));
  assert.throws(() => readProgressBackup({ format: 'insight-backup', measures: [] }), /pas une sauvegarde/);
  assert.deepEqual(normalize(undefined), emptyProgress());
});

test('QCM : options mélangées, toujours dans le même ordre pour un exercice', () => {
  const o = optionOrder('olap-3-e1', 4);
  assert.deepEqual([...o].sort(), [0, 1, 2, 3]);
  assert.deepEqual(optionOrder('olap-3-e1', 4), o, 'ordre stable');
  // La bonne réponse ne doit plus être presque toujours au même endroit
  const positions = [0, 0, 0, 0];
  for (const m of MODULES) {
    const all = [
      ...m.notions.flatMap((n) => n.exercises.map((e, i) => [exoId(n, i), e]).filter(([, e]) => e.type === 'qcm')),
      ...m.exam.map((q, i) => [examId(m, i), q]),
    ];
    for (const [id, e] of all) {
      if (e.options.length === 4) positions[optionOrder(id, 4).indexOf(e.answer)]++;
    }
  }
  const total = positions.reduce((a, b) => a + b, 0);
  for (const n of positions) assert.ok(n / total > 0.12 && n / total < 0.4, `répartition ${positions}`);
});
