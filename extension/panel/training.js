// Training (panneau latéral) : les trois modules avec leur progression, le bouton « Reprendre »
// et la liste des notions. Les cours s'ouvrent dans un onglet (training/training.html).
import { MODULES, getProgress, moduleStats, overallStats, openTraining, TRAINING_KEY } from '../lib/training.js';

const $ = (id) => document.getElementById(id);
const ACCENT = { rh: 'rh', olap: 'olap', apex: 'apex' };

function el(tag, { dataset, ...props } = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}

const track = (pct) => el('span', { className: 't-track' }, el('i', { style: `width:${pct}%` }));

function moduleCard(m, progress, openIds) {
  const s = moduleStats(m, progress);
  const resumeIdx = s.resume ? m.notions.indexOf(s.resume) + 1 : 0;
  return el(
    'li',
    { className: `t-module ${ACCENT[m.id] || ''}` },
    el(
      'button',
      { type: 'button', className: 't-open', dataset: { module: m.id }, title: `Ouvrir le module ${m.label}` },
      el('span', { className: 't-badge', textContent: m.id === 'rh' ? 'RH' : m.label }),
      el(
        'span',
        { className: 't-text' },
        el('strong', { textContent: m.label }),
        el('small', { textContent: m.tagline }),
      ),
      el('span', { className: 'chev', textContent: '›', ariaHidden: 'true' }),
    ),
    el(
      'div',
      { className: 't-stats' },
      track(s.pct),
      el('span', {
        className: 't-count',
        textContent: `${s.done}/${s.total} exercices · ${s.pct} %`,
      }),
    ),
    el(
      'p',
      { className: 't-sub' },
      `${s.complete}/${m.notions.length} notions terminées`,
      s.exam.done ? ` · examen ${s.exam.ok}/${s.exam.total}` : '',
    ),
    s.resume
      ? el('button', {
          type: 'button',
          className: 'primary t-resume',
          textContent: s.started ? `Reprendre : ${resumeIdx}. ${s.resume.short}` : 'Commencer le module',
          dataset: { module: m.id, anchor: s.started ? s.resume.id : '' },
        })
      : el('button', {
          type: 'button',
          className: 't-resume',
          textContent: `✓ Module terminé · examen ${s.exam.ok}/${s.exam.total}`,
          dataset: { module: m.id, anchor: 'examen' },
        }),
    el(
      'details',
      { className: 't-notions', open: openIds.has(m.id), dataset: { details: m.id } },
      el('summary', { textContent: `${m.notions.length} notions` }),
      el(
        'ol',
        {},
        ...s.notions.map((ns, i) =>
          el(
            'li',
            {},
            el(
              'button',
              { type: 'button', dataset: { module: m.id, anchor: ns.notion.id } },
              el('span', { className: `t-num${ns.complete ? ' done' : ''}`, textContent: ns.complete ? '✓' : i + 1 }),
              el('span', { className: 't-name', textContent: ns.notion.short }),
              el('span', { className: 'muted', textContent: ns.done ? `${ns.done}/${ns.total}` : '' }),
            ),
          ),
        ),
      ),
    ),
  );
}

async function load() {
  const progress = await getProgress();
  const all = overallStats(progress);
  $('overallText').textContent = `${all.done} / ${all.total} exercices · ${all.pct} %`;
  $('overallBar').style.width = `${all.pct}%`;
  const openIds = new Set([...document.querySelectorAll('.t-notions[open]')].map((d) => d.dataset.details));
  $('modules').replaceChildren(...MODULES.map((m) => moduleCard(m, progress, openIds)));
  $('openPage').onclick = () => {
    const last = progress.last;
    openTraining(last ? last.module : MODULES[0].id, last ? last.anchor : '');
  };
}

$('modules').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-module]');
  if (b) openTraining(b.dataset.module, b.dataset.anchor || '');
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[TRAINING_KEY]) load();
});

load();
