import { saveSettings, deleteMeasures, isMeasureKey } from '../lib/storage.js';
import { cellStat, MISSING_TEXT, TIMEOUT_TEXT } from '../lib/report.js';
import { loadModel, exportXlsx, exportCsv } from '../lib/export.js';
import { NETWORKS, NETWORK_LABELS, STATS, KIND_LABELS, TRIGGER_LABELS, fmtMs, fmtDate } from '../lib/format.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
let stat = 'avg';
let lastModel = null;

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((c) => c !== null && c !== undefined));
  return node;
}

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

function valueCell(cs) {
  if (cs.status === 'missing')
    return el('td', { className: 'missing', textContent: MISSING_TEXT, title: 'Aucune mesure' });
  if (cs.status === 'timeout') {
    return el('td', { className: 'timeout', textContent: TIMEOUT_TEXT, title: `${cs.timeouts} mesure(s) en timeout` });
  }
  const extra = cs.timeouts ? ` · ${cs.timeouts} timeout(s) exclu(s)` : '';
  return el('td', {
    className: 'num',
    textContent: nf.format(cs.value),
    title: `${cs.count} mesure(s) · min ${fmtMs(cs.min)} · max ${fmtMs(cs.max)}${extra}`,
  });
}

function table(head, rows) {
  return el(
    'div',
    { className: 'table-wrap' },
    el('table', { className: 'grid' }, el('thead', {}, ...head), el('tbody', {}, ...rows)),
  );
}

function renderCompare(model) {
  const box = $('compare');
  box.replaceChildren();
  if (!model.apps.length) {
    box.append(
      el(
        'div',
        { className: 'card empty muted' },
        'Aucune application configurée. ',
        el('a', { href: '../options/options.html', textContent: 'Ajouter une application' }),
      ),
    );
    return;
  }
  if (!model.pages.length) {
    box.append(
      el('div', {
        className: 'card empty muted',
        textContent: 'Aucune mesure pour le moment : naviguez dans vos applications.',
      }),
    );
    return;
  }
  const head = [
    el(
      'tr',
      {},
      el('th', { className: 'left', rowSpan: 2, textContent: 'Page' }),
      ...model.apps.map((a) => el('th', { colSpan: 2, textContent: a.name })),
    ),
    el('tr', {}, ...model.apps.flatMap(() => NETWORKS.map((n) => el('th', { textContent: n.label })))),
  ];
  const rows = model.pages.map((page) =>
    el(
      'tr',
      {},
      el('td', { className: 'left page', textContent: page }),
      ...model.apps.flatMap((a) => NETWORKS.map((n) => valueCell(cellStat(model, a.id, page, n.id, stat)))),
    ),
  );
  box.append(table(head, rows));
}

function renderPerApp(model) {
  const box = $('perApp');
  box.replaceChildren();
  if (!model.pages.length) return;
  for (const app of model.apps) {
    const head = [
      el(
        'tr',
        {},
        el('th', { className: 'left', textContent: 'Page' }),
        el('th', { textContent: 'WiFi' }),
        el('th', { textContent: 'Ethernet' }),
        el('th', { textContent: 'Écart WiFi − Eth.' }),
        el('th', { textContent: 'Nb (WiFi / Eth.)' }),
      ),
    ];
    const rows = model.pages.map((page) => {
      const wifi = cellStat(model, app.id, page, 'wifi', stat);
      const eth = cellStat(model, app.id, page, 'ethernet', stat);
      let diff = el('td', {});
      if (wifi.status === 'ok' && eth.status === 'ok') {
        const d = wifi.value - eth.value;
        const pct = eth.value > 0 ? ` (${d > 0 ? '+' : ''}${Math.round((d / eth.value) * 100)} %)` : '';
        diff = el('td', {
          className: `num ${d > 0 ? 'diff-pos' : d < 0 ? 'diff-neg' : ''}`,
          textContent: `${d > 0 ? '+' : ''}${nf.format(d)}${pct}`,
        });
      }
      return el(
        'tr',
        {},
        el('td', { className: 'left page', textContent: page }),
        valueCell(wifi),
        valueCell(eth),
        diff,
        el('td', { className: 'num muted', textContent: `${wifi.count} / ${eth.count}` }),
      );
    });
    box.append(
      el(
        'div',
        { className: 'card' },
        el('h3', { textContent: app.name }),
        el('p', { className: 'base muted', textContent: (app.baseUrls || []).join(' · ') }),
        table(head, rows),
      ),
    );
  }
}

function renderFilters(model) {
  const select = $('filterApp');
  const keep = select.value;
  select.replaceChildren(
    el('option', { value: '', textContent: 'Toutes les applications' }),
    ...model.apps.map((a) => el('option', { value: a.id, textContent: a.name })),
  );
  select.value = model.apps.some((a) => a.id === keep) ? keep : '';
}

function renderRaw(model) {
  const box = $('raw');
  box.replaceChildren();
  const appId = $('filterApp').value;
  const net = $('filterNet').value;
  const rows = model.rows.filter((m) => (!appId || m.appId === appId) && (!net || m.network === net)).reverse();
  $('rawCount').textContent = `${rows.length} mesure(s)`;
  if (!rows.length) return;
  const head = [
    el(
      'tr',
      {},
      ...['Date', 'Application', 'Page', 'Réseau', 'Durée', 'Type', 'Déclencheur', 'URL', ''].map((t, i) =>
        el('th', { className: i === 4 ? '' : 'left', textContent: t }),
      ),
    ),
  ];
  const body = rows.map((m) =>
    el(
      'tr',
      {},
      el('td', { className: 'left', textContent: fmtDate(m.ts) }),
      el('td', { className: 'left', textContent: m.appName }),
      el('td', { className: 'left page', textContent: m.page }),
      el('td', { className: 'left', textContent: NETWORK_LABELS[m.network] || m.network }),
      m.timeout
        ? el('td', {
            className: 'timeout',
            textContent: `≥ ${fmtMs(m.duration)}`,
            title: 'Timeout : exclue des statistiques',
          })
        : el('td', { className: 'num', textContent: fmtMs(m.duration) }),
      el('td', { className: 'left', textContent: KIND_LABELS[m.kind] || m.kind }),
      el('td', { className: 'left', textContent: TRIGGER_LABELS[m.trigger] || m.trigger }),
      el('td', { className: 'left url', title: m.url, textContent: m.url }),
      el(
        'td',
        {},
        el('button', {
          className: 'del',
          title: 'Supprimer cette mesure',
          textContent: '✕',
          onclick: async () => {
            await deleteMeasures([m.id]);
            toast('Mesure supprimée');
          },
        }),
      ),
    ),
  );
  box.append(table(head, body));
}

function renderSummary(model, measures) {
  const wifi = measures.filter((m) => m.network === 'wifi').length;
  $('summary').textContent =
    `${model.apps.length} application(s) · ${model.pages.length} page(s) · ${model.rows.length} mesure(s) ` +
    `(WiFi ${wifi} · Ethernet ${measures.length - wifi}) · statistique : ${STATS[stat].toLowerCase()}`;
}

async function render() {
  const { model, settings, measures } = await loadModel();
  stat = STATS[settings.stat] ? settings.stat : 'avg';
  $('stat').value = stat;
  lastModel = model;
  renderSummary(model, measures);
  renderCompare(model);
  renderPerApp(model);
  renderFilters(model);
  renderRaw(model);
}

let pendingRender = 0;
function scheduleRender() {
  clearTimeout(pendingRender);
  pendingRender = setTimeout(render, 150);
}

$('stat').append(...Object.entries(STATS).map(([value, label]) => el('option', { value, textContent: label })));
$('stat').addEventListener('change', (e) => saveSettings({ stat: e.target.value }));
$('xlsx').addEventListener('click', () => exportXlsx(stat));
$('csv').addEventListener('click', () => exportCsv(stat));
$('filterApp').addEventListener('change', () => lastModel && renderRaw(lastModel));
$('filterNet').addEventListener('change', () => lastModel && renderRaw(lastModel));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.settings || changes.apps || Object.keys(changes).some(isMeasureKey)) scheduleRender();
});

render();
