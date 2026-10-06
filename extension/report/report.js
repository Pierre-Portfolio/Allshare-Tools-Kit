// Exports (3 types) et aperçu : une ligne par application, une colonne par page.
import { saveSettings, deleteMeasures, isMeasureKey } from '../lib/storage.js';
import { rate, diffStat, coverage, legendText, MISSING_TEXT } from '../lib/report.js';
import { loadModel, exportAll, exportPage, exportApp } from '../lib/export.js';
import { nameKey, compareNames } from '../lib/names.js';
import { NETWORKS, NETWORK_LABELS, STATS, KIND_LABELS, TRIGGER_LABELS, fmtMs, fmtDate } from '../lib/format.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const xf = (r) => r.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const VIEWS = ['both', 'wifi', 'ethernet', 'diff'];
const RAW_PAGE = 100;

const state = {
  model: null,
  settings: null,
  measures: [],
  stat: 'median',
  view: 'both',
  query: '',
  incomplete: false,
  anomaliesOnly: false,
  sort: { key: 'name', dir: 1 },
  rawLimit: RAW_PAGE,
  detail: null,
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const norm = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------------------------------------------------------------- Exports

function renderExports() {
  const { model } = state;
  $('exAllInfo').textContent =
    `${nf.format(model.apps.length)} application(s) × ${nf.format(model.pages.length)} page(s) · ${nf.format(model.rows.length)} mesure(s)`;
  const sel = $('exPageSel');
  const keep = sel.value;
  sel.replaceChildren(
    ...model.pages.map((p) => Object.assign(document.createElement('option'), { value: p.name, textContent: p.name })),
  );
  if (model.pages.some((p) => p.name === keep)) sel.value = keep;
  $('appNames').replaceChildren(
    ...model.apps.map((a) => Object.assign(document.createElement('option'), { value: a.name })),
  );
  $('exAll').disabled = !model.rows.length;
  $('exPage').disabled = !model.pages.length;
  $('legend').innerHTML =
    '<span class="legend"><span class="swatch warn"></span> Jaune : lent</span>' +
    '<span class="legend"><span class="swatch crit"></span> Orange : très lent</span>' +
    `<span class="legend"><span class="swatch missing"></span> Rouge (${MISSING_TEXT}) : pas de mesure</span>` +
    '<span class="legend"><span class="swatch timeout"></span> Gris (T/O) : timeout</span>' +
    `<span class="legend-text">${esc(legendText(state.settings))}</span>`;
}

async function runExport(fn, ...args) {
  try {
    await fn(...args, state.stat);
    toast('Excel téléchargé');
  } catch (e) {
    toast(`Export impossible : ${e.message}`);
  }
}

// ---------------------------------------------------------------- Aperçu : colonnes, valeurs

const viewNetworks = (view) => (view === 'wifi' || view === 'ethernet' ? [view] : ['wifi', 'ethernet']);

function columns(model, view) {
  if (view === 'both') {
    return model.pages.flatMap((p) =>
      NETWORKS.map((n, i) => ({ id: `${p.name}\n${n.id}`, page: p, net: n.id, sep: i === 0 })),
    );
  }
  return model.pages.map((p) => ({ id: `${p.name}\n${view}`, page: p, net: view, sep: false }));
}

function valueOf(model, app, col) {
  if (col.net !== 'diff') return rate(model, app, col.page.name, col.net, state.stat, state.settings);
  const d = diffStat(model, app, col.page.name, state.stat);
  const level = d.status === 'ok' && d.pct !== null && Math.abs(d.pct) * 100 >= state.settings.gapPct ? 'warn' : null;
  return { ...d, level };
}

function renderKpis(model, measures, shown, anomalies) {
  const total = model.apps.length * model.pages.length;
  const done = (net) => model.apps.reduce((sum, a) => sum + coverage(model, a.name, [net]).done, 0);
  const cov = (net) => (total ? done(net) / total : 0);
  const wifi = measures.filter((m) => m.network === 'wifi').length;
  const tile = (label, value, sub = '', bar = null) =>
    `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>` +
    (sub ? `<div class="sub">${sub}</div>` : '') +
    (bar !== null ? `<div class="bar-track"><i style="width:${Math.round(bar * 100)}%"></i></div>` : '') +
    '</div>';
  const pctf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
  $('kpis').innerHTML =
    tile(
      'Applications',
      nf.format(model.apps.length),
      shown === model.apps.length ? '' : `${nf.format(shown)} affichée(s)`,
    ) +
    tile('Pages', nf.format(model.pages.length)) +
    tile('Mesures', nf.format(measures.length), `WiFi ${nf.format(wifi)} · Eth. ${nf.format(measures.length - wifi)}`) +
    tile('Anomalies', nf.format(anomalies), 'cases jaunes ou orange') +
    tile('Couverture WiFi', pctf.format(cov('wifi')), `${nf.format(done('wifi'))} / ${nf.format(total)}`, cov('wifi')) +
    tile(
      'Couverture Ethernet',
      pctf.format(cov('ethernet')),
      `${nf.format(done('ethernet'))} / ${nf.format(total)}`,
      cov('ethernet'),
    );
}

const RANK = { ok: 0, timeout: 1, missing: 2 };

function sortApps(apps, cols, grid, model) {
  const { key, dir } = state.sort;
  const byName = (a, b) => compareNames(a.name, b.name);
  if (key === 'coverage') {
    const nets = viewNetworks(state.view);
    const ratio = (a) => {
      const c = coverage(model, a.name, nets);
      return c.total ? c.done / c.total : 0;
    };
    return apps.sort((a, b) => dir * (ratio(a) - ratio(b)) || byName(a, b));
  }
  const idx = cols.findIndex((c) => c.id === key);
  if (idx < 0) return apps.sort((a, b) => (key === 'name' ? dir : 1) * byName(a, b));
  return apps.sort((a, b) => {
    const va = grid.get(a.name)[idx];
    const vb = grid.get(b.name)[idx];
    if (va.status !== vb.status) return RANK[va.status] - RANK[vb.status];
    if (va.status === 'ok') return dir * (va.value - vb.value) || byName(a, b);
    return byName(a, b);
  });
}

const sortAttr = (key) =>
  state.sort.key === key ? ` aria-sort="${state.sort.dir > 0 ? 'ascending' : 'descending'}"` : '';

function cellHtml(app, col, v) {
  const where = `${app.name} · ${col.page.name}`;
  const sep = col.sep ? ' sep' : '';
  if (v.status === 'missing')
    return `<td class="missing${sep}" title="${esc(where)} : aucune mesure">${MISSING_TEXT}</td>`;
  if (v.status === 'timeout')
    return `<td class="timeout${sep}" title="${esc(where)} : uniquement des timeouts">T/O</td>`;
  const cls = `v${sep}${v.level ? ` ${v.level}` : ''}`;
  if (col.net === 'diff') {
    const text = v.pct === null ? `${v.value > 0 ? '+' : ''}${nf.format(v.value)}` : pf.format(v.pct);
    return `<td class="${cls}" title="${esc(`${where} : WiFi ${fmtMs(v.w.value)} · Ethernet ${fmtMs(v.e.value)}`)}">${text}</td>`;
  }
  const vs =
    v.ratio !== null ? ` · ${xf(v.ratio)} × la médiane des ${v.ref.count} clients (${fmtMs(v.ref.median)})` : '';
  const title = `${where} · ${NETWORK_LABELS[col.net]} : ${fmtMs(v.value)} — ${v.count} mesure(s), min ${fmtMs(v.min)}, max ${fmtMs(v.max)}${vs}`;
  return `<td class="${cls}" title="${esc(title)}">${nf.format(v.value)}</td>`;
}

function renderMatrix() {
  const { model } = state;
  const box = $('matrix');
  if (!model.apps.length || !model.pages.length) {
    box.innerHTML =
      '<div class="empty muted">Aucune mesure pour le moment : lancez une mesure depuis le panneau Insigth.</div>';
    return { shown: 0, anomalies: 0 };
  }
  const cols = columns(model, state.view);
  const grid = new Map(model.apps.map((a) => [a.name, cols.map((c) => valueOf(model, a.name, c))]));
  let anomalies = 0;
  for (const values of grid.values()) for (const v of values) if (v.level) anomalies++;

  const q = norm(state.query.trim());
  const nets = viewNetworks(state.view);
  let apps = model.apps.filter((a) => !q || norm(a.name).includes(q));
  if (state.incomplete) {
    apps = apps.filter((a) => {
      const c = coverage(model, a.name, nets);
      return c.done < c.total;
    });
  }
  if (state.anomaliesOnly) apps = apps.filter((a) => grid.get(a.name).some((v) => v.level));
  apps = sortApps(apps, cols, grid, model);

  const pageTh = (p, attrs, cls) =>
    `<th class="page${cls}"${attrs} title="${esc(p.name)}"><span class="page-name">${esc(p.name)}</span>` +
    `<button type="button" class="exp" data-export-page="${esc(p.name)}" title="Exporter cette page (tous les clients)">⤓</button></th>`;
  let head;
  if (state.view === 'both') {
    head =
      '<tr class="h1">' +
      `<th class="c-app sortable" rowspan="2" data-sort="name"${sortAttr('name')}>Application</th>` +
      `<th class="c-cov sortable" rowspan="2" data-sort="coverage"${sortAttr('coverage')}>Couverture</th>` +
      model.pages.map((p) => pageTh(p, ' colspan="2"', ' sep')).join('') +
      '</tr><tr class="h2">' +
      cols
        .map(
          (c) =>
            `<th class="sortable${c.sep ? ' sep' : ''}" data-sort="${esc(c.id)}"${sortAttr(c.id)} title="Trier par ${esc(c.page.name)} · ${NETWORK_LABELS[c.net]}">${c.net === 'wifi' ? 'WiFi' : 'Eth.'}</th>`,
        )
        .join('') +
      '</tr>';
  } else {
    head =
      '<tr class="h1">' +
      `<th class="c-app sortable" data-sort="name"${sortAttr('name')}>Application</th>` +
      `<th class="c-cov sortable" data-sort="coverage"${sortAttr('coverage')}>Couverture</th>` +
      cols.map((c) => pageTh(c.page, ` data-sort="${esc(c.id)}"${sortAttr(c.id)}`, ' sortable')).join('') +
      '</tr>';
  }
  const body = apps
    .map((app) => {
      const c = coverage(model, app.name, nets);
      const ratio = c.total ? c.done / c.total : 0;
      const values = grid.get(app.name);
      return (
        '<tr>' +
        `<th class="c-app" scope="row"><button type="button" class="app-link" data-app="${esc(app.name)}">${esc(app.name)}</button></th>` +
        `<td class="c-cov"><div class="cov${c.done === c.total ? ' full' : ''}" title="${c.done} case(s) mesurée(s) sur ${c.total}">` +
        `<span>${c.done}/${c.total}</span><span class="track"><i style="width:${Math.round(ratio * 100)}%"></i></span></div></td>` +
        cols.map((col, i) => cellHtml(app, col, values[i])).join('') +
        '</tr>'
      );
    })
    .join('');
  box.innerHTML = apps.length
    ? `<table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table>`
    : '<div class="empty muted">Aucune application ne correspond aux filtres.</div>';
  return { shown: apps.length, anomalies };
}

// ---------------------------------------------------------------- Dernières mesures

function rawTable(rows, withApp = true) {
  const heads = [
    'Date',
    withApp ? 'Application' : null,
    'Page',
    'Réseau',
    'Durée',
    'Type',
    'Déclencheur',
    'URL mesurée',
    '',
  ].filter((t) => t !== null);
  const head = `<tr>${heads.map((t) => `<th class="${t === 'Durée' ? '' : 'left'}">${t}</th>`).join('')}</tr>`;
  const body = rows
    .map(
      (m) =>
        '<tr>' +
        `<td class="left">${fmtDate(m.ts)}</td>` +
        (withApp ? `<td class="left">${esc(m.app)}</td>` : '') +
        `<td class="left">${esc(m.page)}</td>` +
        `<td class="left">${NETWORK_LABELS[m.network] || esc(m.network)}</td>` +
        (m.timeout
          ? `<td class="timeout" title="Timeout : exclue des statistiques">≥ ${fmtMs(m.duration)}</td>`
          : `<td class="num">${fmtMs(m.duration)}</td>`) +
        `<td class="left">${KIND_LABELS[m.kind] || esc(m.kind || '')}</td>` +
        `<td class="left">${TRIGGER_LABELS[m.trigger] || esc(m.trigger || '')}</td>` +
        `<td class="left url" title="${esc(m.url || '')}">${esc(m.url || '')}</td>` +
        `<td><button type="button" class="del" data-del="${esc(m.id)}" title="Supprimer cette mesure">✕</button></td>` +
        '</tr>',
    )
    .join('');
  return `<div class="table-wrap"><table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderRaw() {
  const q = norm(state.query.trim());
  const net = $('filterNet').value;
  const rows = state.model.rows.filter((m) => (!net || m.network === net) && (!q || norm(m.app).includes(q))).reverse();
  $('rawCount').textContent = `${nf.format(rows.length)} mesure(s)`;
  $('raw').innerHTML = rows.length ? rawTable(rows.slice(0, state.rawLimit)) : '';
  const more = $('more');
  more.hidden = rows.length <= state.rawLimit;
  more.textContent = `Afficher plus (${nf.format(rows.length - state.rawLimit)} restante(s))`;
}

// ---------------------------------------------------------------- Détail d'une application

function renderDetail() {
  const dlg = $('detail');
  const { model, settings } = state;
  const app = model.apps.find((a) => nameKey(a.name) === nameKey(state.detail));
  if (!app) {
    if (dlg.open) dlg.close();
    return;
  }
  const cov = (n) => coverage(model, app.name, [n]);
  const cell = (r) => {
    if (r.status === 'missing') return `<td class="missing">${MISSING_TEXT}</td>`;
    if (r.status === 'timeout') return '<td class="timeout">T/O</td>';
    const vs = r.ratio !== null ? `<span class="vs">${xf(r.ratio)}×</span>` : '';
    return `<td class="num${r.level ? ` ${r.level}` : ''}" title="${r.count} mesure(s) · min ${fmtMs(r.min)} · max ${fmtMs(r.max)}">${nf.format(r.value)}${vs}</td>`;
  };
  const rows = model.pages
    .map((p) => {
      const w = rate(model, app.name, p.name, 'wifi', state.stat, settings);
      const e = rate(model, app.name, p.name, 'ethernet', state.stat, settings);
      const d = diffStat(model, app.name, p.name, state.stat);
      const gap =
        d.status === 'ok' && d.pct !== null
          ? `<td class="num${Math.abs(d.pct) * 100 >= settings.gapPct ? ' warn' : ''}">${pf.format(d.pct)}</td>`
          : '<td></td>';
      return `<tr><td class="left"><strong>${esc(p.name)}</strong></td>${cell(w)}${cell(e)}${gap}<td class="num muted">${w.count} / ${e.count}</td></tr>`;
    })
    .join('');
  const measures = model.rows.filter((m) => nameKey(m.app) === nameKey(app.name)).reverse();
  dlg.innerHTML =
    '<div class="dlg-head"><div>' +
    `<h2 id="detailTitle">${esc(app.name)}</h2>` +
    `<div class="muted">Couverture : WiFi ${cov('wifi').done}/${cov('wifi').total} · Ethernet ${cov('ethernet').done}/${cov('ethernet').total} · ${measures.length} mesure(s)</div>` +
    '</div>' +
    `<button type="button" class="primary" data-export-app="${esc(app.name)}">Exporter ce client</button>` +
    '<button type="button" data-close>Fermer</button></div>' +
    '<div class="dlg-body">' +
    `<div><h3>Pages (${STATS[state.stat].toLowerCase()}, ms ; « 1,8× » = 1,8 fois la médiane des clients)</h3>` +
    '<div class="table-wrap"><table class="grid"><thead><tr><th class="left">Page</th><th>WiFi</th><th>Ethernet</th><th>Écart WiFi / Eth.</th><th>Nb mesures (W / E)</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div></div>` +
    `<div><h3>Mesures</h3>${measures.length ? rawTable(measures.slice(0, 200), false) : '<p class="muted">Aucune mesure.</p>'}</div>` +
    (measures.length
      ? `<div><button type="button" class="danger" data-clear-app="${esc(app.name)}">Supprimer les ${measures.length} mesure(s) de ce client</button></div>`
      : '') +
    '</div>';
}

// ---------------------------------------------------------------- Rendu global

function renderAll() {
  if (!state.model) return;
  for (const b of $('views').querySelectorAll('[data-view]'))
    b.setAttribute('aria-checked', String(b.dataset.view === state.view));
  renderExports();
  const { shown, anomalies } = renderMatrix();
  renderKpis(state.model, state.measures, shown, anomalies);
  renderRaw();
  if (state.detail && $('detail').open) renderDetail();
}

async function load() {
  const { model, settings, measures } = await loadModel();
  state.model = model;
  state.settings = settings;
  state.measures = measures;
  state.stat = STATS[settings.stat] ? settings.stat : 'median';
  state.view = VIEWS.includes(settings.reportView) ? settings.reportView : 'both';
  $('stat').value = state.stat;
  renderAll();
}

let pendingLoad = 0;
function scheduleLoad() {
  clearTimeout(pendingLoad);
  pendingLoad = setTimeout(load, 200);
}

// ---------------------------------------------------------------- Évènements

$('stat').append(
  ...Object.entries(STATS).map(([value, label]) =>
    Object.assign(document.createElement('option'), { value, textContent: label }),
  ),
);
$('stat').addEventListener('change', (e) => {
  state.stat = e.target.value;
  state.model.refs.clear();
  renderAll();
  saveSettings({ stat: state.stat });
});
$('views').addEventListener('click', (e) => {
  const b = e.target.closest('[data-view]');
  if (!b || b.dataset.view === state.view) return;
  state.view = b.dataset.view;
  renderAll();
  saveSettings({ reportView: state.view });
});
$('search').addEventListener('input', (e) => {
  state.query = e.target.value;
  state.rawLimit = RAW_PAGE;
  clearTimeout(state.searchTimer);
  state.searchTimer = setTimeout(renderAll, 120);
});
$('incomplete').addEventListener('change', (e) => {
  state.incomplete = e.target.checked;
  renderAll();
});
$('anomalies').addEventListener('change', (e) => {
  state.anomaliesOnly = e.target.checked;
  renderAll();
});
$('filterNet').addEventListener('change', () => {
  state.rawLimit = RAW_PAGE;
  renderRaw();
});
$('more').addEventListener('click', () => {
  state.rawLimit += RAW_PAGE;
  renderRaw();
});
$('exAll').addEventListener('click', () => runExport(exportAll));
$('exPage').addEventListener('click', () => $('exPageSel').value && runExport(exportPage, $('exPageSel').value));
$('exApp').addEventListener('click', () => {
  const name = $('exAppSel').value.trim();
  const app = state.model.apps.find((a) => nameKey(a.name) === nameKey(name));
  if (!app) {
    toast(name ? `Client inconnu : ${name}` : 'Choisissez un client');
    $('exAppSel').focus();
    return;
  }
  runExport(exportApp, app.name);
});

$('matrix').addEventListener('click', (e) => {
  const exp = e.target.closest('[data-export-page]');
  if (exp) {
    runExport(exportPage, exp.dataset.exportPage);
    return;
  }
  const th = e.target.closest('th[data-sort]');
  if (th) {
    const key = th.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
    renderMatrix();
    return;
  }
  const link = e.target.closest('[data-app]');
  if (link) {
    state.detail = link.dataset.app;
    renderDetail();
    $('detail').showModal();
  }
});

async function onDelete(e) {
  const del = e.target.closest('[data-del]');
  if (del) {
    await deleteMeasures([del.dataset.del]);
    toast('Mesure supprimée');
    return;
  }
  const clear = e.target.closest('[data-clear-app]');
  if (clear) {
    const ids = state.model.rows.filter((m) => nameKey(m.app) === nameKey(clear.dataset.clearApp)).map((m) => m.id);
    if (ids.length && confirm(`Supprimer définitivement ces ${ids.length} mesure(s) ?`)) {
      await deleteMeasures(ids);
      toast('Mesures supprimées');
    }
  }
}
$('raw').addEventListener('click', onDelete);
$('detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target === $('detail')) $('detail').close();
  else if (e.target.closest('[data-export-app]'))
    runExport(exportApp, e.target.closest('[data-export-app]').dataset.exportApp);
  else onDelete(e);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.apps || changes.pages || changes.settings || Object.keys(changes).some(isMeasureKey)) scheduleLoad();
});

load();
