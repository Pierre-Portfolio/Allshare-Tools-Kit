// Tableau de bord : export en une ligne, grille clients × pages, mesures.
import { saveSettings, deleteMeasures, deleteClient, deletePage, editLine, isMeasureKey } from '../lib/storage.js';
import {
  rate,
  diffStat,
  coverage,
  lineLabel,
  lineKey,
  legendText,
  isSpecific,
  startUrlFor,
  cellRows,
  MISSING_TEXT,
} from '../lib/report.js';
import { loadModel, exportData } from '../lib/export.js';
import { nameKey, normName, canonical, compareNames } from '../lib/names.js';
import { NETWORKS, NETWORK_LABELS, STATS, UNITS, unitOf, fmtNum, fmtDuration, fmtDate } from '../lib/format.js';

const $ = (id) => document.getElementById(id);
const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0, signDisplay: 'exceptZero' });
const pct = new Intl.NumberFormat('fr-FR', { style: 'percent', maximumFractionDigits: 0 });
const xf = (r) => r.toLocaleString('fr-FR', { maximumFractionDigits: 1 });
const VIEWS = ['both', 'ethernet', 'wifi', 'diff'];
const RAW_PAGE = 100;

const state = {
  model: null,
  settings: null,
  measures: [],
  apps: [],
  tab: null, // onglet du tableau de bord (fenêtre où ouvrir une relance)
  stat: 'median',
  unit: 's',
  view: 'both',
  query: '',
  incomplete: false,
  anomaliesOnly: false,
  sort: { key: 'name', dir: 1 },
  rawLimit: RAW_PAGE,
  detail: null,
  editing: null, // ligne en cours de modification
  redo: null, // case à relancer
};

const dur = (ms) => fmtDuration(ms, state.unit);

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const norm = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

function toast(text) {
  const t = $('toast');
  t.textContent = text;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2500);
}

// ---------------------------------------------------------------- Export

const EXPORT_HELP = {
  all: 'Excel : feuilles Ethernet + WiFi, Ethernet, WiFi, Écart, Référence par page, Pages spécifiques et Mesures. CSV : une ligne par mesure.',
  page: 'Une ligne par client (SID, version) : Ethernet, WiFi, écart et comparaison à la médiane. CSV : les mesures de la page.',
  client:
    'Une feuille par SID / version du client : chaque page comparée à la médiane des clients. CSV : les mesures du client.',
  detail:
    'Une ligne par mesure de la page : redirection, DNS, connexion, attente serveur, téléchargement, DOM, load, après load, requête la plus lente, + feuille Requêtes.',
};

function renderExport() {
  const { model, settings } = state;
  const type = settings.exportType || 'all';
  $('exType').value = type;
  $('exPageFld').hidden = type !== 'page' && type !== 'detail';
  $('exClientFld').hidden = type !== 'client';
  const fill = (select, values) => {
    const keep = select.value;
    select.replaceChildren(
      ...values.map((v) => Object.assign(document.createElement('option'), { value: v, textContent: v })),
    );
    if (values.includes(keep)) select.value = keep;
  };
  fill(
    $('exPage'),
    model.allPages.map((p) => p.name),
  );
  fill($('exClient'), model.clients);
  for (const b of $('exFormat').querySelectorAll('[data-format]')) {
    b.setAttribute('aria-checked', String(b.dataset.format === (settings.exportFormat || 'xlsx')));
  }
  $('exFullUrl').checked = !!settings.exportFullUrl;
  $('exUrlEnd').checked = !!settings.exportUrlEnd;
  const opts = [settings.exportFullUrl && 'URL complète', settings.exportUrlEnd && "fin d'URL"].filter(Boolean);
  $('exHelp').textContent =
    EXPORT_HELP[type] +
    (opts.length ? ` Colonnes ajoutées aux mesures : ${opts.join(', ')}.` : '') +
    (type === 'detail' ? ' Le détail est enregistré avec chaque nouvelle mesure.' : '');
  $('exGo').disabled = !model.rows.length;
}

async function runExport(req = {}) {
  const s = state.settings;
  const full = {
    type: s.exportType || 'all',
    page: $('exPage').value,
    client: $('exClient').value,
    format: s.exportFormat || 'xlsx',
    fullUrl: !!s.exportFullUrl,
    urlEnd: !!s.exportUrlEnd,
    stat: state.stat,
    ...req,
  };
  if ((full.type === 'page' || full.type === 'detail') && !full.page) return toast('Choisissez une page');
  if (full.type === 'client' && !full.client) return toast('Choisissez un client');
  try {
    await exportData(full);
    toast('Export téléchargé');
  } catch (e) {
    toast(`Export impossible : ${e.message}`);
  }
}

async function setSetting(patch) {
  state.settings = { ...state.settings, ...patch };
  renderExport();
  await saveSettings(patch);
}

// ---------------------------------------------------------------- Grille

const viewNetworks = (view) => (view === 'wifi' || view === 'ethernet' ? [view] : NETWORKS.map((n) => n.id));

function columns(model, view) {
  if (view === 'both') {
    return model.pages.flatMap((p) =>
      NETWORKS.map((n, i) => ({ id: `${p.name}\n${n.id}`, page: p, net: n.id, grp: i === 0 })),
    );
  }
  return model.pages.map((p) => ({ id: `${p.name}\n${view}`, page: p, net: view, grp: true }));
}

function valueOf(model, line, col) {
  if (col.net !== 'diff') return rate(model, line, col.page.name, col.net, state.stat, state.settings);
  const d = diffStat(model, line, col.page.name, state.stat);
  const level = d.status === 'ok' && d.pct !== null && Math.abs(d.pct) * 100 >= state.settings.gapPct ? 'warn' : null;
  return { ...d, level };
}

const RANK = { ok: 0, timeout: 1, missing: 2 };

function sortLines(lines, cols, grid, model) {
  const { key, dir } = state.sort;
  const byName = (a, b) =>
    compareNames(a.client, b.client) || compareNames(a.sid, b.sid) || compareNames(a.version, b.version);
  if (key === 'coverage') {
    const nets = viewNetworks(state.view);
    const ratio = (l) => {
      const c = coverage(model, l.key, nets);
      return c.total ? c.done / c.total : 0;
    };
    return lines.sort((a, b) => dir * (ratio(a) - ratio(b)) || byName(a, b));
  }
  const idx = cols.findIndex((c) => c.id === key);
  if (idx < 0) return lines.sort((a, b) => (key === 'name' ? dir : 1) * byName(a, b));
  return lines.sort((a, b) => {
    const va = grid.get(a.key)[idx];
    const vb = grid.get(b.key)[idx];
    if (va.status !== vb.status) return RANK[va.status] - RANK[vb.status];
    if (va.status === 'ok') return dir * (va.value - vb.value) || byName(a, b);
    return byName(a, b);
  });
}

const sortAttr = (key) =>
  state.sort.key === key ? ` aria-sort="${state.sort.dir > 0 ? 'ascending' : 'descending'}"` : '';

/** Case relançable au double-clic (vues par réseau, pas l'écart). */
const redoAttrs = (line, page, net) =>
  ` data-redo="${esc(line)}" data-redo-page="${esc(page)}" data-redo-net="${esc(net)}"`;
const redoHint = (status) => (status === 'missing' ? ' · double-clic : mesurer' : ' · double-clic : relancer');

function cellHtml(line, col, v) {
  const cls = `v${col.grp ? ' grp' : ''}`;
  const where = `${lineLabel(line)} · ${col.page.name}`;
  const redo = col.net === 'diff' ? '' : redoAttrs(line.key, col.page.name, col.net);
  const hint = col.net === 'diff' ? '' : redoHint(v.status);
  if (v.status === 'missing') {
    return `<td class="${cls}"${redo} title="${esc(where)} : aucune mesure${hint}"><span class="pill missing">${MISSING_TEXT}</span></td>`;
  }
  if (v.status === 'timeout') {
    return `<td class="${cls}"${redo} title="${esc(where)} : uniquement des timeouts${hint}"><span class="pill timeout">T/O</span></td>`;
  }
  let text;
  let title;
  if (col.net === 'diff') {
    text = v.pct === null ? `${v.value > 0 ? '+' : ''}${fmtNum(v.value, state.unit)}` : pf.format(v.pct);
    title = `${where} : Ethernet ${dur(v.e.value)} · WiFi ${dur(v.w.value)}`;
  } else {
    text = fmtNum(v.value, state.unit);
    const vs = v.ratio !== null ? ` · ${xf(v.ratio)} × la médiane des clients (${dur(v.ref.median)})` : '';
    title = `${where} · ${NETWORK_LABELS[col.net]} : ${dur(v.value)} — ${v.count} mesure(s), min ${dur(v.min)}, max ${dur(v.max)}${vs}`;
  }
  const spec = isSpecific(state.model, line.key, col.page.name);
  if (spec) title += ' · page spécifique pour ce client';
  const inner = (spec ? SPEC_MARK : '') + (v.level ? `<span class="pill ${v.level}">${text}</span>` : text);
  return `<td class="${cls}"${redo} title="${esc(title + hint)}">${inner}</td>`;
}

const SPEC_MARK = '<span class="spec" aria-label="page spécifique">◆</span>';

function renderMatrix() {
  const { model } = state;
  const box = $('matrix');
  if (!model.lines.length || !model.pages.length) {
    box.innerHTML =
      '<div class="empty">Aucune mesure pour le moment : lancez une mesure depuis le panneau Insight.</div>';
    return { shown: 0, anomalies: 0 };
  }
  const cols = columns(model, state.view);
  const grid = new Map(model.lines.map((l) => [l.key, cols.map((c) => valueOf(model, l.key, c))]));
  let anomalies = 0;
  for (const values of grid.values()) for (const v of values) if (v.level) anomalies++;

  const q = norm(state.query.trim());
  const nets = viewNetworks(state.view);
  let lines = model.lines.filter((l) => !q || norm(lineLabel(l)).includes(q));
  if (state.incomplete) {
    lines = lines.filter((l) => {
      const c = coverage(model, l.key, nets);
      return c.done < c.total;
    });
  }
  if (state.anomaliesOnly) lines = lines.filter((l) => grid.get(l.key).some((v) => v.level));
  lines = sortLines(lines, cols, grid, model);

  const pageTh = (p, attrs, cls) =>
    `<th class="page grp${cls}"${attrs} title="${esc(p.name)}">${esc(p.name)} ` +
    `<button type="button" class="dots" data-page-menu="${esc(p.name)}" aria-label="Actions sur la page ${esc(p.name)}">⋯</button></th>`;
  let head;
  if (state.view === 'both') {
    head =
      '<tr class="h1">' +
      `<th class="c-client sortable" rowspan="2" data-sort="name"${sortAttr('name')}>Client</th>` +
      `<th class="c-cov sortable" rowspan="2" data-sort="coverage"${sortAttr('coverage')}>Couverture</th>` +
      model.pages.map((p) => pageTh(p, ' colspan="2"', '')).join('') +
      '</tr><tr class="h2">' +
      cols
        .map(
          (c) =>
            `<th class="sortable${c.grp ? ' grp' : ''}" data-sort="${esc(c.id)}"${sortAttr(c.id)} title="Trier par ${esc(c.page.name)} · ${NETWORK_LABELS[c.net]}">${c.net === 'wifi' ? 'WiFi' : 'Eth.'}</th>`,
        )
        .join('') +
      '</tr>';
  } else {
    head =
      '<tr class="h1">' +
      `<th class="c-client sortable" data-sort="name"${sortAttr('name')}>Client</th>` +
      `<th class="c-cov sortable" data-sort="coverage"${sortAttr('coverage')}>Couverture</th>` +
      cols.map((c) => pageTh(c.page, ` data-sort="${esc(c.id)}"${sortAttr(c.id)}`, ' sortable')).join('') +
      '</tr>';
  }
  const body = lines
    .map((l) => {
      const c = coverage(model, l.key, nets);
      const ratio = c.total ? c.done / c.total : 0;
      const values = grid.get(l.key);
      const sub = [l.sid && `SID ${l.sid}`, l.version && `v. ${l.version}`].filter(Boolean).join(' · ');
      return (
        '<tr>' +
        '<th class="c-client" scope="row"><div class="client"><div class="names">' +
        `<button type="button" class="name" data-line="${esc(l.key)}" title="Voir le détail">${esc(l.client)}</button>` +
        (sub ? `<span class="sub">${esc(sub)}</span>` : '') +
        `</div><button type="button" class="dots" data-line-menu="${esc(l.key)}" aria-label="Actions sur ${esc(lineLabel(l))}">⋯</button></div></th>` +
        `<td class="c-cov"><div class="cov${c.done === c.total ? ' full' : ''}" title="${c.done} case(s) mesurée(s) sur ${c.total}">` +
        `<span>${c.done}/${c.total}</span><span class="track"><i style="width:${Math.round(ratio * 100)}%"></i></span></div></td>` +
        cols.map((col, i) => cellHtml(l, col, values[i])).join('') +
        '</tr>'
      );
    })
    .join('');
  box.innerHTML = lines.length
    ? `<table class="matrix"><thead>${head}</thead><tbody>${body}</tbody></table>`
    : '<div class="empty">Aucun client ne correspond aux filtres.</div>';
  return { shown: lines.length, anomalies };
}

function renderSummary({ shown, anomalies }) {
  const { model, measures } = state;
  const total = model.lines.length * model.pages.length;
  const done = (net) => model.lines.reduce((sum, l) => sum + coverage(model, l.key, [net]).done, 0);
  const cov = (net) => (total ? pct.format(done(net) / total) : '—');
  const ethernet = measures.filter((m) => m.network === 'ethernet').length;
  const sep = '<span class="sep">·</span>';
  $('summary').innerHTML =
    `<b>${nf.format(model.clients.length)}</b> client(s)` +
    (model.lines.length !== model.clients.length ? ` (${nf.format(model.lines.length)} lignes SID / version)` : '') +
    (shown !== model.lines.length ? `, ${nf.format(shown)} affichée(s)` : '') +
    `${sep}<b>${nf.format(model.pages.length)}</b> page(s)` +
    `${sep}<b>${nf.format(measures.length)}</b> mesure(s) — Ethernet ${nf.format(ethernet)}, WiFi ${nf.format(measures.length - ethernet)}` +
    `${sep}couverture Ethernet <b>${cov('ethernet')}</b>, WiFi <b>${cov('wifi')}</b>` +
    `${sep}<b class="${anomalies ? 'warn' : ''}">${nf.format(anomalies)}</b> anomalie(s)`;
}

function renderLegend() {
  const s = state.settings;
  const fr = (n) => String(n).replace('.', ',');
  $('legend').innerHTML =
    (state.view === 'diff'
      ? `<span><span class="pill warn">±${s.gapPct} %</span> écart WiFi / Ethernet important</span>`
      : `<span><span class="pill warn">lent</span> ≥ ${fr(s.warnRatio)} × la médiane des clients</span>` +
        `<span><span class="pill crit">très lent</span> ≥ ${fr(s.critRatio)} ×</span>`) +
    `<span><span class="pill missing">${MISSING_TEXT}</span> pas de mesure</span>` +
    '<span><span class="pill timeout">T/O</span> timeout</span>' +
    `<span>${SPEC_MARK} page spécifique</span>` +
    `<span>${STATS[state.stat]} en ${UNITS[state.unit].toLowerCase()} · clic sur un en-tête pour trier · double-clic sur une case pour relancer la mesure</span>`;
  $('legend').title = legendText(s);
}

// ---------------------------------------------------------------- Mesures

function measuresTable(rows, withClient = true) {
  const head =
    '<tr><th>Date</th>' +
    (withClient ? '<th>Client</th><th>SID</th><th>Version</th>' : '') +
    '<th>Page</th><th>Réseau</th><th class="n">Durée</th><th></th></tr>';
  const body = rows
    .map(
      (m) =>
        `<tr title="${esc(m.url)}">` +
        `<td class="muted">${fmtDate(m.ts)}</td>` +
        (withClient
          ? `<td>${esc(m.app)}</td><td class="muted">${esc(m.sid)}</td><td class="muted">${esc(m.version)}</td>`
          : '') +
        `<td>${esc(m.page)}${m.specific ? ' <span class="tag">spécifique</span>' : ''}</td>` +
        `<td class="muted">${NETWORK_LABELS[m.network] || esc(m.network)}</td>` +
        (m.timeout
          ? `<td class="n"><span class="pill timeout" title="Timeout : exclue des calculs">≥ ${dur(m.duration)}</span></td>`
          : `<td class="n">${dur(m.duration)}</td>`) +
        `<td class="n"><button type="button" class="del" data-del="${esc(m.id)}" title="Supprimer cette mesure" aria-label="Supprimer cette mesure">✕</button></td>` +
        '</tr>',
    )
    .join('');
  return `<table class="list"><thead>${head}</thead><tbody>${body}</tbody></table>`;
}

function renderRaw() {
  const q = norm(state.query.trim());
  const net = $('filterNet').value;
  const rows = state.model.rows
    .filter(
      (m) =>
        (!net || m.network === net) &&
        (!q || norm(lineLabel({ client: m.app, sid: m.sid, version: m.version })).includes(q)),
    )
    .reverse();
  $('rawCount').textContent = `${nf.format(rows.length)} mesure(s)`;
  $('raw').innerHTML = rows.length ? measuresTable(rows.slice(0, state.rawLimit)) : '';
  const more = $('more');
  more.hidden = rows.length <= state.rawLimit;
  more.textContent = `Afficher plus (${nf.format(rows.length - state.rawLimit)} restante(s))`;
}

// ---------------------------------------------------------------- Détail d'une ligne client

function renderDetail() {
  const dlg = $('detail');
  const { model, settings } = state;
  const line = model.lines.find((l) => l.key === state.detail);
  if (!line) {
    if (dlg.open) dlg.close();
    return;
  }
  const cov = (n) => coverage(model, line.key, [n]);
  const cell = (r, page, net) => {
    const redo = redoAttrs(line.key, page, net);
    const hint = redoHint(r.status).replace(' · ', '');
    if (r.status === 'missing') {
      return `<td class="n"${redo} title="${hint}"><span class="pill missing">${MISSING_TEXT}</span></td>`;
    }
    if (r.status === 'timeout')
      return `<td class="n"${redo} title="${hint}"><span class="pill timeout">T/O</span></td>`;
    const vs = r.ratio !== null ? `<span class="vs">${xf(r.ratio)}×</span>` : '';
    const v = fmtNum(r.value, state.unit);
    return `<td class="n"${redo} title="${r.count} mesure(s) · min ${dur(r.min)} · max ${dur(r.max)} · ${hint}">${r.level ? `<span class="pill ${r.level}">${v}</span>` : v}${vs}</td>`;
  };
  const rows = model.pages
    .map((p) => {
      const e = rate(model, line.key, p.name, 'ethernet', state.stat, settings);
      const w = rate(model, line.key, p.name, 'wifi', state.stat, settings);
      const d = diffStat(model, line.key, p.name, state.stat);
      const gap =
        d.status === 'ok' && d.pct !== null
          ? `<td class="n">${Math.abs(d.pct) * 100 >= settings.gapPct ? `<span class="pill warn">${pf.format(d.pct)}</span>` : pf.format(d.pct)}</td>`
          : '<td></td>';
      const spec = isSpecific(model, line.key, p.name) ? ' <span class="tag">spécifique</span>' : '';
      return `<tr><td>${esc(p.name)}${spec}</td>${cell(e, p.name, 'ethernet')}${cell(w, p.name, 'wifi')}${gap}<td class="n muted">${e.count} / ${w.count}</td></tr>`;
    })
    .join('');
  const measures = model.rows.filter((m) => m.line === line.key).reverse();
  dlg.innerHTML =
    '<div class="dlg-head"><div>' +
    `<h2 id="detailTitle">${esc(lineLabel(line))}</h2>` +
    `<p>Couverture : Ethernet ${cov('ethernet').done}/${cov('ethernet').total} · WiFi ${cov('wifi').done}/${cov('wifi').total} · ${measures.length} mesure(s)</p>` +
    '</div>' +
    `<button type="button" data-edit-line="${esc(line.key)}">Modifier</button>` +
    `<button type="button" class="primary" data-export-client="${esc(line.client)}">Exporter le client</button>` +
    '<button type="button" data-close>Fermer</button></div>' +
    '<div class="dlg-body">' +
    `<div><h3>Pages — ${STATS[state.stat].toLowerCase()} en ${UNITS[state.unit].toLowerCase()} (« 1,8× » = 1,8 fois la médiane des clients) · double-clic sur une valeur pour relancer</h3>` +
    '<table class="list"><thead><tr><th>Page</th><th class="n">Ethernet</th><th class="n">WiFi</th><th class="n">Écart</th><th class="n">Mesures (E / W)</th></tr></thead>' +
    `<tbody>${rows}</tbody></table></div>` +
    `<div><h3>Mesures</h3>${measures.length ? measuresTable(measures.slice(0, 200), false) : '<p class="muted">Aucune mesure.</p>'}</div>` +
    '</div>';
}

// ---------------------------------------------------------------- Menus « ⋯ » (client / page)

function openMenu(anchor, items) {
  const menu = $('menu');
  menu.replaceChildren(
    ...items.map((it) => {
      if (it === '-') return document.createElement('hr');
      if (it.title) return Object.assign(document.createElement('div'), { className: 'title', textContent: it.title });
      const b = Object.assign(document.createElement('button'), {
        type: 'button',
        textContent: it.label,
        className: it.danger ? 'danger' : '',
      });
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => {
        closeMenu();
        it.run();
      });
      return b;
    }),
  );
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  const w = menu.offsetWidth;
  const h = menu.offsetHeight;
  menu.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left))}px`;
  menu.style.top = `${r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
  anchor.setAttribute('aria-expanded', 'true');
  menu.anchor = anchor;
  menu.querySelector('button')?.focus();
}

function closeMenu() {
  const menu = $('menu');
  if (menu.hidden) return;
  menu.hidden = true;
  if (menu.anchor) menu.anchor.removeAttribute('aria-expanded');
}

async function confirmDelete(question, action, done) {
  if (!confirm(question)) return;
  const n = await action();
  toast(done.replace('{n}', nf.format(n)));
}

function lineMenu(anchor, key) {
  const line = state.model.lines.find((l) => l.key === key);
  if (!line) return;
  const lineCount = state.model.lineCounts.get(key) || 0;
  const clientLines = state.model.lines.filter((l) => l.client === line.client);
  const clientCount = clientLines.reduce((s, l) => s + (state.model.lineCounts.get(l.key) || 0), 0);
  const items = [
    { title: lineLabel(line) },
    { label: 'Voir le détail', run: () => openDetail(key) },
    { label: 'Modifier (client, SID, version)…', run: () => openEdit(key) },
    {
      label: 'Exporter ce client (Excel)',
      run: () => runExport({ type: 'client', client: line.client, format: 'xlsx' }),
    },
    '-',
  ];
  if (clientLines.length > 1) {
    items.push({
      label: `Supprimer cette ligne SID / version (${lineCount} mesure(s))`,
      danger: true,
      run: () =>
        confirmDelete(
          `Supprimer les ${lineCount} mesure(s) de « ${lineLabel(line)} » ?`,
          () => deleteClient(line.client, line),
          '{n} mesure(s) supprimée(s)',
        ),
    });
  }
  items.push({
    label: `Supprimer le client (${clientCount} mesure(s))`,
    danger: true,
    run: () =>
      confirmDelete(
        `Supprimer le client « ${line.client} » et ses ${clientCount} mesure(s) (toutes versions) ?`,
        () => deleteClient(line.client),
        'Client supprimé ({n} mesure(s))',
      ),
  });
  openMenu(anchor, items);
}

function pageMenu(anchor, page) {
  const count = state.model.pageCounts.get(nameKey(page)) || 0;
  openMenu(anchor, [
    { title: page },
    { label: 'Exporter cette page (Excel)', run: () => runExport({ type: 'page', page, format: 'xlsx' }) },
    { label: 'Détail des temps de cette page (Excel)', run: () => runExport({ type: 'detail', page, format: 'xlsx' }) },
    '-',
    {
      label: `Supprimer la page (${count} mesure(s))`,
      danger: true,
      run: () =>
        confirmDelete(
          `Supprimer la page « ${page} » et ses ${count} mesure(s), pour tous les clients ?`,
          () => deletePage(page),
          'Page supprimée ({n} mesure(s))',
        ),
    },
  ]);
}

function openDetail(key) {
  state.detail = key;
  renderDetail();
  $('detail').showModal();
}

// ---------------------------------------------------------------- Modifier une ligne (client, SID, version)

function openEdit(key) {
  const line = state.model.lines.find((l) => l.key === key);
  if (!line) return;
  state.editing = line;
  const count = state.model.lineCounts.get(key) || 0;
  const values = (field) => [...new Set(state.model.lines.map((l) => l[field]).filter(Boolean))].sort(compareNames);
  const options = (id, list) =>
    $(id).replaceChildren(...list.map((v) => Object.assign(document.createElement('option'), { value: v })));
  options('editClients', state.model.clients);
  options('editSids', values('sid'));
  options('editVersions', values('version'));
  $('editInfo').textContent = `${lineLabel(line)} · ${count} mesure(s)`;
  $('editClient').value = line.client;
  $('editSid').value = line.sid;
  $('editVersion').value = line.version;
  // Ligne du référentiel jamais mesurée : SID et version n'existent qu'avec des mesures.
  $('editSid').disabled = !count;
  $('editVersion').disabled = !count;
  $('editError').textContent = '';
  renderEditNote();
  $('edit').showModal();
  $('editClient').focus();
  $('editClient').select();
}

/** Ce que l'enregistrement va faire : mise à jour, regroupement avec une ligne existante, renommage. */
function renderEditNote() {
  const line = state.editing;
  if (!line) return;
  const count = state.model.lineCounts.get(line.key) || 0;
  const client = canonical($('editClient').value, state.model.clients);
  const key = lineKey(client, $('editSid').value, $('editVersion').value);
  const other = state.model.lines.find((l) => l.key === key && l.key !== line.key);
  const notes = [];
  if (!count) {
    notes.push('Aucune mesure sur cette ligne : seul le nom du client est modifié.');
  } else if (other) {
    notes.push(`« ${lineLabel(other)} » existe déjà : les ${count} mesure(s) y seront regroupées.`);
  } else {
    notes.push(`Les ${count} mesure(s) de cette ligne seront mises à jour.`);
  }
  if (nameKey(client) !== nameKey(line.client)) {
    const others = state.model.lines.filter((l) => l.client === line.client && l.key !== line.key).length;
    const exists = state.model.clients.some((c) => nameKey(c) === nameKey(client));
    notes.push(
      others
        ? `Les ${others} autre(s) ligne(s) de « ${line.client} » ne changent pas.`
        : exists
          ? `Le client « ${line.client} » est regroupé avec « ${client} » (référentiel compris).`
          : `Le client « ${line.client} » est renommé en « ${normName(client)} » (référentiel compris).`,
    );
  }
  $('editNote').textContent = notes.join(' ');
}

async function saveEdit() {
  const line = state.editing;
  if (!line) return;
  const next = { client: $('editClient').value, sid: $('editSid').value, version: $('editVersion').value };
  if (!normName(next.client)) {
    $('editError').textContent = 'Indiquez le client.';
    return $('editClient').focus();
  }
  $('editSave').disabled = true;
  try {
    const plan = await editLine(line, $('editSid').disabled ? { ...next, sid: line.sid, version: line.version } : next);
    $('edit').close();
    const label = lineLabel(plan.line);
    if (state.detail === line.key) state.detail = lineKey(plan.line.client, plan.line.sid, plan.line.version);
    toast(plan.merged ? `Mesures regroupées dans « ${label} »` : `Ligne modifiée : ${label}`);
  } catch (e) {
    $('editError').textContent = e.message;
  } finally {
    $('editSave').disabled = false;
  }
}

// ---------------------------------------------------------------- Relancer une mesure (double-clic sur une case)

function openRedo(key, page, network) {
  const { model, settings } = state;
  const line = model.lines.find((l) => l.key === key);
  if (!line || !NETWORK_LABELS[network]) return;
  const v = rate(model, key, page, network, state.stat, settings);
  const url = startUrlFor(model, key, page, network, state.apps);
  const ids = cellRows(model, key, page, network).map((m) => m.id);
  state.redo = {
    app: line.client,
    sid: line.sid,
    version: line.version,
    page,
    network,
    specific: isSpecific(model, key, page),
    url,
    ids,
  };
  const net = NETWORK_LABELS[network];
  $('redoTitle').textContent = ids.length ? 'Relancer cette mesure ?' : 'Mesurer cette page ?';
  $('redoWhat').textContent = `${lineLabel(line)} › ${page} · ${net}`;
  $('redoValue').textContent =
    v.status === 'ok'
      ? `${STATS[state.stat]} actuelle : ${dur(v.value)} (${v.count} mesure(s))`
      : v.status === 'timeout'
        ? `Uniquement des timeouts (${v.timeouts} mesure(s))`
        : 'Pas encore de mesure.';
  $('redoHow').textContent = url
    ? `La page de départ s'ouvre dans un nouvel onglet et l'enregistrement est lancé : il ne reste qu'à cliquer sur « ${page} » dans l'application.`
    : "Aucune page connue pour ce client : ouvrez l'application, puis lancez la mesure depuis le panneau Insight.";
  $('redoUrl').textContent = url;
  $('redoReplaceBox').hidden = !ids.length;
  $('redoReplace').checked = true;
  $('redoReplaceText').textContent =
    ids.length > 1
      ? `Remplacer les ${ids.length} mesures actuelles (supprimées quand la nouvelle est enregistrée)`
      : 'Remplacer la mesure actuelle (supprimée quand la nouvelle est enregistrée)';
  $('redoNet').textContent = `Mesure en ${net} : vérifiez que le poste est bien en ${net}.`;
  $('redoGo').textContent = ids.length ? 'Oui, relancer' : 'Oui, mesurer';
  $('redoGo').disabled = !url;
  $('redo').showModal();
  $('redoGo').focus();
}

async function runRedo() {
  const r = state.redo;
  if (!r || !r.url) return;
  // Le panneau latéral ne s'ouvre qu'en réponse directe au clic : avant tout await.
  try {
    if (chrome.sidePanel && chrome.sidePanel.open && state.tab) {
      chrome.sidePanel.open({ windowId: state.tab.windowId }).catch(() => {});
    }
  } catch {
    /* panneau latéral indisponible : la mesure est armée quand même */
  }
  $('redo').close();
  const res = await chrome.runtime
    .sendMessage({
      type: 'remeasure',
      app: r.app,
      sid: r.sid,
      version: r.version,
      page: r.page,
      specific: r.specific,
      network: r.network,
      url: r.url,
      replace: $('redoReplace').checked ? r.ids : [],
      windowId: state.tab ? state.tab.windowId : undefined,
      openerTabId: state.tab ? state.tab.id : undefined,
    })
    .catch((e) => ({ ok: false, error: e.message }));
  if (!res || !res.ok) toast((res && res.error) || 'Impossible de relancer la mesure.');
}

// ---------------------------------------------------------------- Rendu global

function renderAll() {
  if (!state.model) return;
  for (const b of $('views').querySelectorAll('[data-view]')) {
    b.setAttribute('aria-checked', String(b.dataset.view === state.view));
  }
  for (const b of $('units').querySelectorAll('[data-unit]')) {
    b.setAttribute('aria-checked', String(b.dataset.unit === state.unit));
  }
  renderExport();
  renderLegend();
  renderSummary(renderMatrix());
  renderRaw();
  if (state.detail && $('detail').open) renderDetail();
}

async function load() {
  const { model, settings, measures, apps } = await loadModel();
  Object.assign(state, { model, settings, measures, apps });
  state.stat = STATS[settings.stat] ? settings.stat : 'median';
  state.unit = unitOf(settings);
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
$('units').addEventListener('click', (e) => {
  const b = e.target.closest('[data-unit]');
  if (!b || b.dataset.unit === state.unit) return;
  state.unit = b.dataset.unit;
  state.settings = { ...state.settings, unit: state.unit };
  renderAll();
  saveSettings({ unit: state.unit });
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

$('exType').addEventListener('change', (e) => setSetting({ exportType: e.target.value }));
$('exFormat').addEventListener('click', (e) => {
  const b = e.target.closest('[data-format]');
  if (b) setSetting({ exportFormat: b.dataset.format });
});
$('exFullUrl').addEventListener('change', (e) => setSetting({ exportFullUrl: e.target.checked }));
$('exUrlEnd').addEventListener('change', (e) => setSetting({ exportUrlEnd: e.target.checked }));
$('exGo').addEventListener('click', () => runExport());

$('matrix').addEventListener('click', (e) => {
  const lm = e.target.closest('[data-line-menu]');
  if (lm) return lineMenu(lm, lm.dataset.lineMenu);
  const pm = e.target.closest('[data-page-menu]');
  if (pm) {
    e.stopPropagation();
    return pageMenu(pm, pm.dataset.pageMenu);
  }
  const th = e.target.closest('th[data-sort]');
  if (th) {
    const key = th.dataset.sort;
    state.sort = { key, dir: state.sort.key === key ? -state.sort.dir : 1 };
    renderSummary(renderMatrix());
    return;
  }
  const name = e.target.closest('[data-line]');
  if (name) openDetail(name.dataset.line);
});

// Double-clic sur une case : relancer (ou faire) la mesure ; pas de sélection du texte.
function onRedoDblClick(e) {
  const td = e.target.closest('td[data-redo]');
  if (td) openRedo(td.dataset.redo, td.dataset.redoPage, td.dataset.redoNet);
}
function noSelectOnDblClick(e) {
  if (e.detail > 1 && e.target.closest('td[data-redo]')) e.preventDefault();
}
for (const box of [$('matrix'), $('detail')]) {
  box.addEventListener('dblclick', onRedoDblClick);
  box.addEventListener('mousedown', noSelectOnDblClick);
}

async function onDelete(e) {
  const del = e.target.closest('[data-del]');
  if (!del) return;
  await deleteMeasures([del.dataset.del]);
  toast('Mesure supprimée');
}
$('raw').addEventListener('click', onDelete);
$('detail').addEventListener('click', (e) => {
  if (e.target.closest('[data-close]') || e.target === $('detail')) $('detail').close();
  else if (e.target.closest('[data-edit-line]')) openEdit(e.target.closest('[data-edit-line]').dataset.editLine);
  else if (e.target.closest('[data-export-client]')) {
    runExport({
      type: 'client',
      client: e.target.closest('[data-export-client]').dataset.exportClient,
      format: 'xlsx',
    });
  } else onDelete(e);
});

$('editForm').addEventListener('submit', (e) => {
  e.preventDefault();
  saveEdit();
});
for (const id of ['editClient', 'editSid', 'editVersion']) $(id).addEventListener('input', renderEditNote);
$('edit').addEventListener('close', () => (state.editing = null));
$('redoGo').addEventListener('click', runRedo);
for (const dlg of [$('edit'), $('redo')]) {
  dlg.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]') || e.target === dlg) dlg.close();
  });
}

document.addEventListener('click', (e) => {
  if (!$('menu').hidden && !e.target.closest('#menu') && !e.target.closest('.dots')) closeMenu();
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && closeMenu());
window.addEventListener('scroll', closeMenu, true);

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.apps || changes.pages || changes.settings || Object.keys(changes).some(isMeasureKey)) scheduleLoad();
});

chrome.tabs.getCurrent().then(
  (tab) => (state.tab = tab || null),
  () => {},
);
load();
