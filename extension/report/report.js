// Rapport : une ligne par application, une colonne par page.
import { saveSettings, deleteMeasures, isMeasureKey } from '../lib/storage.js';
import { cellStat, diffStat, coverage, compareNames, MISSING_TEXT } from '../lib/report.js';
import { loadModel, exportXlsx, exportCsv } from '../lib/export.js';
import { NETWORKS, NETWORK_LABELS, STATS, KIND_LABELS, TRIGGER_LABELS, fmtMs, fmtDate } from '../lib/format.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const VIEWS = ['both', 'wifi', 'ethernet', 'diff'];
const RAW_PAGE = 100;

const state = {
  model: null,
  stat: 'avg',
  view: 'both',
  query: '',
  incomplete: false,
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

// ---------------------------------------------------------------- Colonnes et valeurs

const viewNetworks = (view) => (view === 'wifi' || view === 'ethernet' ? [view] : ['wifi', 'ethernet']);

function columns(model, view) {
  if (view === 'both') {
    return model.pages.flatMap((p) =>
      NETWORKS.map((n, i) => ({ id: `${p.key}\n${n.id}`, page: p, net: n.id, sep: i === 0 })),
    );
  }
  return model.pages.map((p) => ({ id: `${p.key}\n${view}`, page: p, net: view, sep: false }));
}

function valueOf(model, appId, col) {
  return col.net === 'diff'
    ? diffStat(model, appId, col.page.key, state.stat)
    : cellStat(model, appId, col.page.key, col.net, state.stat);
}

/** Échelle de couleur par page : du plus rapide (transparent) au plus lent (ambre). */
function pageScales(model, cols, grid) {
  const byPage = new Map();
  cols.forEach((c, i) => {
    if (!byPage.has(c.page.key)) byPage.set(c.page.key, []);
    for (const values of grid.values()) if (values[i].status === 'ok') byPage.get(c.page.key).push(values[i].value);
  });
  const scales = new Map();
  for (const [key, values] of byPage) {
    if (!values.length) continue;
    const d = values.sort((a, b) => a - b);
    scales.set(key, {
      min: d[0],
      med: d[Math.floor((d.length - 1) / 2)],
      max: d[d.length - 1],
      abs: Math.max(Math.abs(d[0]), Math.abs(d[d.length - 1])),
    });
  }
  return scales;
}

// Teinte légère jusqu'à la médiane, puis de plus en plus marquée : les pages lentes ressortent.
function heat(value, s) {
  if (!s || s.max === s.min) return 'transparent';
  const alpha =
    value <= s.med
      ? s.med === s.min
        ? 0
        : (0.1 * (value - s.min)) / (s.med - s.min)
      : 0.1 + (0.55 * (value - s.med)) / (s.max - s.med);
  return `rgba(245, 158, 11, ${alpha.toFixed(3)})`;
}

function diverging(value, s) {
  if (!s || !s.abs || !value) return 'transparent';
  const a = (0.55 * Math.abs(value)) / s.abs;
  return value > 0 ? `rgba(245, 158, 11, ${a.toFixed(3)})` : `rgba(59, 130, 246, ${a.toFixed(3)})`;
}

// ---------------------------------------------------------------- Synthèse

function renderKpis(model, measures, shown) {
  const total = model.apps.length * model.pages.length;
  const done = (net) => model.apps.reduce((sum, a) => sum + coverage(model, a.id, [net]).done, 0);
  const cov = (net) => (total ? done(net) / total : 0);
  const covSub = (net) => `${nf.format(done(net))} / ${nf.format(total)} cases`;
  const wifi = measures.filter((m) => m.network === 'wifi').length;
  const tile = (label, value, sub = '', bar = null) =>
    `<div class="kpi"><div class="label">${label}</div><div class="value">${value}</div>` +
    (sub ? `<div class="sub">${sub}</div>` : '') +
    (bar !== null ? `<div class="bar-track"><i style="width:${Math.round(bar * 100)}%"></i></div>` : '') +
    '</div>';
  $('kpis').innerHTML =
    tile(
      'Applications',
      nf.format(model.apps.length),
      shown === model.apps.length ? '' : `${nf.format(shown)} affichée(s)`,
    ) +
    tile(
      'Pages',
      nf.format(model.pages.length),
      model.allPages.length > model.pages.length ? `${model.allPages.length - model.pages.length} masquée(s)` : '',
    ) +
    tile(
      'Mesures',
      nf.format(measures.length),
      `WiFi ${nf.format(wifi)} · Ethernet ${nf.format(measures.length - wifi)}`,
    ) +
    tile('Couverture WiFi', pf.format(cov('wifi')), covSub('wifi'), cov('wifi')) +
    tile('Couverture Ethernet', pf.format(cov('ethernet')), covSub('ethernet'), cov('ethernet'));
}

function renderLegend() {
  const color =
    state.view === 'diff'
      ? '<span class="legend">WiFi plus rapide <span class="gradient diverging"></span> WiFi plus lent</span>'
      : '<span class="legend">Rapide <span class="gradient heat"></span> lent (comparé page par page)</span>';
  $('legend').innerHTML =
    `<span class="legend"><span class="swatch missing"></span> ${MISSING_TEXT} : aucune mesure</span>` +
    '<span class="legend"><span class="swatch timeout"></span> T/O : uniquement des timeouts</span>' +
    color +
    `<span>${STATS[state.stat]} en ms, du clic à l'affichage complet</span>`;
}

// ---------------------------------------------------------------- Matrice

function filteredApps(model) {
  const q = norm(state.query.trim());
  let apps = model.apps.filter(
    (a) => !q || norm(a.name).includes(q) || (a.baseUrls || []).some((u) => norm(u).includes(q)),
  );
  if (state.incomplete) {
    const nets = viewNetworks(state.view);
    apps = apps.filter((a) => {
      const c = coverage(model, a.id, nets);
      return c.done < c.total;
    });
  }
  return apps;
}

const RANK = { ok: 0, timeout: 1, missing: 2 };

function sortApps(apps, cols, grid, model) {
  const { key, dir } = state.sort;
  const byName = (a, b) => compareNames(a.name, b.name);
  if (key === 'coverage') {
    const nets = viewNetworks(state.view);
    const ratio = (a) => {
      const c = coverage(model, a.id, nets);
      return c.total ? c.done / c.total : 0;
    };
    return apps.sort((a, b) => dir * (ratio(a) - ratio(b)) || byName(a, b));
  }
  const idx = cols.findIndex((c) => c.id === key);
  if (idx < 0) return apps.sort((a, b) => (key === 'name' ? dir : 1) * byName(a, b));
  return apps.sort((a, b) => {
    const va = grid.get(a.id)[idx];
    const vb = grid.get(b.id)[idx];
    if (va.status !== vb.status) return RANK[va.status] - RANK[vb.status]; // valeurs, puis timeouts, puis manquantes
    if (va.status === 'ok') return dir * (va.value - vb.value) || byName(a, b);
    return byName(a, b);
  });
}

function sortAttr(key) {
  if (state.sort.key !== key) return '';
  return ` aria-sort="${state.sort.dir > 0 ? 'ascending' : 'descending'}"`;
}

function cellHtml(app, col, cs, scale) {
  const where = `${app.name} · ${col.page.label}`;
  if (cs.status === 'missing')
    return `<td class="missing${col.sep ? ' sep' : ''}" title="${esc(where)} : aucune mesure">${MISSING_TEXT}</td>`;
  if (cs.status === 'timeout') {
    return `<td class="timeout${col.sep ? ' sep' : ''}" title="${esc(where)} : uniquement des mesures en timeout">T/O</td>`;
  }
  let text;
  let title;
  let bg;
  if (col.net === 'diff') {
    text = `${cs.value > 0 ? '+' : ''}${nf.format(cs.value)}`;
    title = `${where} : WiFi ${fmtMs(cs.w.value)} · Ethernet ${fmtMs(cs.e.value)}${cs.pct !== null ? ` (${cs.value > 0 ? '+' : ''}${pf.format(cs.pct)})` : ''}`;
    bg = diverging(cs.value, scale);
  } else {
    text = nf.format(cs.value);
    title =
      `${where} · ${NETWORK_LABELS[col.net]} : ${fmtMs(cs.value)} — ${cs.count} mesure(s), ` +
      `min ${fmtMs(cs.min)}, max ${fmtMs(cs.max)}${cs.timeouts ? `, ${cs.timeouts} timeout(s) exclu(s)` : ''}`;
    bg = heat(cs.value, scale);
  }
  return `<td class="v${col.sep ? ' sep' : ''}" style="background:${bg}" title="${esc(title)}">${text}</td>`;
}

function renderMatrix() {
  const model = state.model;
  const box = $('matrix');
  if (!model.apps.length) {
    box.innerHTML =
      '<div class="empty muted">Aucune application configurée. <a href="../options/options.html">Ajouter des applications</a></div>';
    return 0;
  }
  if (!model.pages.length) {
    box.innerHTML = '<div class="empty muted">Aucune mesure pour le moment : naviguez dans vos applications.</div>';
    return 0;
  }
  const cols = columns(model, state.view);
  const grid = new Map(model.apps.map((a) => [a.id, cols.map((c) => valueOf(model, a.id, c))]));
  const scales = pageScales(model, cols, grid);
  const apps = sortApps(filteredApps(model), cols, grid, model);
  const nets = viewNetworks(state.view);

  let head;
  if (state.view === 'both') {
    head =
      '<tr class="h1">' +
      `<th class="c-app sortable" rowspan="2" data-sort="name"${sortAttr('name')}>Application</th>` +
      `<th class="c-cov sortable" rowspan="2" data-sort="coverage"${sortAttr('coverage')}>Couverture</th>` +
      model.pages.map((p) => `<th class="page sep" colspan="2" title="${esc(p.key)}">${esc(p.label)}</th>`).join('') +
      '</tr><tr class="h2">' +
      cols
        .map(
          (c) =>
            `<th class="sortable${c.sep ? ' sep' : ''}" data-sort="${esc(c.id)}"${sortAttr(c.id)} title="Trier par ${esc(c.page.label)} · ${NETWORK_LABELS[c.net]}">${c.net === 'wifi' ? 'WiFi' : 'Eth.'}</th>`,
        )
        .join('') +
      '</tr>';
  } else {
    head =
      '<tr class="h1">' +
      `<th class="c-app sortable" data-sort="name"${sortAttr('name')}>Application</th>` +
      `<th class="c-cov sortable" data-sort="coverage"${sortAttr('coverage')}>Couverture</th>` +
      cols
        .map(
          (c) =>
            `<th class="page sortable" data-sort="${esc(c.id)}"${sortAttr(c.id)} title="${esc(c.page.key)} — cliquer pour trier">${esc(c.page.label)}</th>`,
        )
        .join('') +
      '</tr>';
  }

  const body = apps
    .map((app) => {
      const c = coverage(model, app.id, nets);
      const ratio = c.total ? c.done / c.total : 0;
      const values = grid.get(app.id);
      return (
        '<tr>' +
        `<th class="c-app" scope="row"><button class="app-link" data-app="${esc(app.id)}" title="${esc((app.baseUrls || []).join('\n'))}">${esc(app.name)}</button></th>` +
        `<td class="c-cov"><div class="cov${c.done === c.total ? ' full' : ''}" title="${c.done} case(s) mesurée(s) sur ${c.total}">` +
        `<span>${c.done}/${c.total}</span><span class="track"><i style="width:${Math.round(ratio * 100)}%"></i></span></div></td>` +
        cols.map((col, i) => cellHtml(app, col, values[i], scales.get(col.page.key))).join('') +
        '</tr>'
      );
    })
    .join('');

  box.innerHTML = apps.length
    ? `<table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table>`
    : '<div class="empty muted">Aucune application ne correspond au filtre.</div>';
  return apps.length;
}

// ---------------------------------------------------------------- Dernières mesures

function rawTable(rows, withApp = true) {
  const head =
    '<tr>' +
    ['Date', withApp ? 'Application' : null, 'Page', 'Réseau', 'Durée', 'Type', 'Déclencheur', 'URL', '']
      .filter((t) => t !== null)
      .map((t, i) => `<th class="${t === 'Durée' ? '' : 'left'}" data-i="${i}">${t}</th>`)
      .join('') +
    '</tr>';
  const body = rows
    .map(
      (m) =>
        '<tr>' +
        `<td class="left">${fmtDate(m.ts)}</td>` +
        (withApp ? `<td class="left">${esc(m.appName)}</td>` : '') +
        `<td class="left page">${esc(m.page)}</td>` +
        `<td class="left">${NETWORK_LABELS[m.network] || esc(m.network)}</td>` +
        (m.timeout
          ? `<td class="timeout" title="Timeout : exclue des statistiques">≥ ${fmtMs(m.duration)}</td>`
          : `<td class="num">${fmtMs(m.duration)}</td>`) +
        `<td class="left">${KIND_LABELS[m.kind] || esc(m.kind)}</td>` +
        `<td class="left">${TRIGGER_LABELS[m.trigger] || esc(m.trigger)}</td>` +
        `<td class="left url" title="${esc(m.url)}">${esc(m.url)}</td>` +
        `<td><button class="del" data-del="${esc(m.id)}" title="Supprimer cette mesure">✕</button></td>` +
        '</tr>',
    )
    .join('');
  return `<div class="table-wrap"><table class="grid"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function renderRaw() {
  const model = state.model;
  const q = norm(state.query.trim());
  const net = $('filterNet').value;
  const rows = model.rows
    .filter((m) => (!net || m.network === net) && (!q || norm(m.appName).includes(q) || norm(m.url).includes(q)))
    .reverse();
  $('rawCount').textContent = `${nf.format(rows.length)} mesure(s)`;
  $('raw').innerHTML = rows.length ? rawTable(rows.slice(0, state.rawLimit)) : '';
  const more = $('more');
  more.hidden = rows.length <= state.rawLimit;
  more.textContent = `Afficher plus (${nf.format(rows.length - state.rawLimit)} restante(s))`;
}

// ---------------------------------------------------------------- Détail d'une application

function renderDetail() {
  const dlg = $('detail');
  const model = state.model;
  const app = model.apps.find((a) => a.id === state.detail);
  if (!app) {
    if (dlg.open) dlg.close();
    return;
  }
  const covW = coverage(model, app.id, ['wifi']);
  const covE = coverage(model, app.id, ['ethernet']);
  const cell = (cs) =>
    cs.status === 'ok'
      ? `<td class="num" title="${cs.count} mesure(s) · min ${fmtMs(cs.min)} · max ${fmtMs(cs.max)}">${nf.format(cs.value)}</td>`
      : cs.status === 'timeout'
        ? '<td class="timeout">T/O</td>'
        : `<td class="missing">${MISSING_TEXT}</td>`;
  const pageRows = model.pages
    .map((p) => {
      const w = cellStat(model, app.id, p.key, 'wifi', state.stat);
      const e = cellStat(model, app.id, p.key, 'ethernet', state.stat);
      const d = diffStat(model, app.id, p.key, state.stat);
      const diff =
        d.status === 'ok'
          ? `<td class="num ${d.value > 0 ? 'diff-pos' : d.value < 0 ? 'diff-neg' : ''}">${d.value > 0 ? '+' : ''}${nf.format(d.value)}${d.pct !== null ? ` (${d.value > 0 ? '+' : ''}${pf.format(d.pct)})` : ''}</td>`
          : '<td></td>';
      return (
        `<tr><td class="left"><strong>${esc(p.label)}</strong>${p.label !== p.key ? ` <span class="muted mono">${esc(p.key)}</span>` : ''}</td>` +
        `${cell(w)}${cell(e)}${diff}<td class="num muted">${w.count} / ${e.count}</td></tr>`
      );
    })
    .join('');
  const measures = model.rows.filter((m) => m.appId === app.id).reverse();
  dlg.innerHTML =
    '<div class="dlg-head"><div>' +
    `<h2 id="detailTitle">${esc(app.name)}</h2>` +
    `<div class="urls muted mono">${(app.baseUrls || []).map(esc).join(' · ')}</div>` +
    `<div class="muted">Couverture : WiFi ${covW.done}/${covW.total} · Ethernet ${covE.done}/${covE.total} · ${measures.length} mesure(s)</div>` +
    '</div><button type="button" data-close>Fermer</button></div>' +
    '<div class="dlg-body">' +
    `<div><h3>Pages (${STATS[state.stat].toLowerCase()}, ms)</h3><div class="table-wrap"><table class="grid">` +
    '<thead><tr><th class="left">Page</th><th>WiFi</th><th>Ethernet</th><th>Écart WiFi − Eth.</th><th>Nb mesures (W / E)</th></tr></thead>' +
    `<tbody>${pageRows}</tbody></table></div></div>` +
    `<div><h3>Mesures</h3>${measures.length ? rawTable(measures.slice(0, 200), false) : '<p class="muted">Aucune mesure.</p>'}</div>` +
    (measures.length
      ? `<div><button type="button" class="danger" data-clear-app="${esc(app.id)}">Supprimer les ${measures.length} mesure(s) de cette application</button></div>`
      : '') +
    '</div>';
}

// ---------------------------------------------------------------- Rendu global

function renderViews() {
  for (const b of $('views').querySelectorAll('[data-view]'))
    b.setAttribute('aria-checked', String(b.dataset.view === state.view));
}

function renderAll() {
  if (!state.model) return;
  renderViews();
  renderLegend();
  const shown = renderMatrix();
  renderKpis(state.model, state.measures, shown);
  renderRaw();
  if (state.detail && $('detail').open) renderDetail();
}

async function load() {
  const { model, settings, measures } = await loadModel();
  state.model = model;
  state.measures = measures;
  state.stat = STATS[settings.stat] ? settings.stat : 'avg';
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
$('filterNet').addEventListener('change', () => {
  state.rawLimit = RAW_PAGE;
  renderRaw();
});
$('more').addEventListener('click', () => {
  state.rawLimit += RAW_PAGE;
  renderRaw();
});
$('xlsx').addEventListener('click', () => exportXlsx(state.stat));
$('csv').addEventListener('click', () => exportCsv(state.stat));

$('matrix').addEventListener('click', (e) => {
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
    const ids = state.model.rows.filter((m) => m.appId === clear.dataset.clearApp).map((m) => m.id);
    if (ids.length && confirm(`Supprimer définitivement ces ${ids.length} mesure(s) ?`)) {
      await deleteMeasures(ids);
      toast('Mesures supprimées');
    }
  }
}
$('raw').addEventListener('click', onDelete);
$('detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target === $('detail')) $('detail').close();
  else onDelete(e);
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.apps || changes.pages || Object.keys(changes).some(isMeasureKey)) scheduleLoad();
  else if (changes.settings) {
    const s = changes.settings.newValue || {};
    // réglages modifiant l'identification des pages : on recalcule tout
    const prev = changes.settings.oldValue || {};
    if (['ignoreQuery', 'replaceIds', 'caseInsensitive'].some((k) => s[k] !== prev[k])) scheduleLoad();
  }
});

load();
