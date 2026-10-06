// Agrégation des mesures, détection des anomalies et construction des exports.
// Fonctions pures : aucune dépendance aux API Chrome (testables avec Node).
//
// Une mesure est identifiée par les noms saisis dans le formulaire
// (application, page) et le réseau. Présentation : une ligne par application,
// une colonne par page.

import { NETWORKS, NETWORK_LABELS, STATS, KIND_LABELS, TRIGGER_LABELS, fmtDate } from './format.js';
import { colName } from './xlsx.js';
import { normName, nameKey, compareNames } from './names.js';

export const MISSING_TEXT = 'N/A';
export const TIMEOUT_TEXT = 'TIMEOUT';
/** En dessous de ce nombre de clients mesurés, la comparaison à la médiane n'a pas de sens. */
export const MIN_APPS_FOR_RATIO = 3;

const cellKey = (app, page, network) => `${nameKey(app)}\u0000${nameKey(page)}\u0000${network}`;

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Regroupe les mesures par application / page / réseau.
 *  apps  : référentiel ∪ applications mesurées, triées par nom (lignes)
 *  pages : pages visibles dans l'ordre du référentiel, puis pages mesurées hors référentiel (colonnes)
 */
export function buildModel(measures, catalogApps = [], catalogPages = []) {
  const apps = new Map();
  const pages = new Map();
  const addApp = (name, baseUrls = []) => {
    const k = nameKey(name);
    if (k && !apps.has(k)) apps.set(k, { name: normName(name), baseUrls });
  };
  const addPage = (name, hidden = false, order = Infinity) => {
    const k = nameKey(name);
    if (k && !pages.has(k)) pages.set(k, { name: normName(name), hidden, order });
  };
  for (const a of catalogApps) if (a && a.name) addApp(a.name, a.baseUrls || []);
  catalogPages.forEach((p, i) => p && p.name && addPage(p.name, !!p.hidden, i));

  const cells = new Map();
  const rows = [];
  const pageCounts = new Map();
  const appCounts = new Map();
  for (const m of measures) {
    if (!m || !m.app || !m.page) continue;
    addApp(m.app);
    addPage(m.page);
    const app = apps.get(nameKey(m.app)).name;
    const page = pages.get(nameKey(m.page)).name;
    rows.push({ ...m, app, page });
    pageCounts.set(nameKey(page), (pageCounts.get(nameKey(page)) || 0) + 1);
    appCounts.set(nameKey(app), (appCounts.get(nameKey(app)) || 0) + 1);
    const key = cellKey(app, page, m.network);
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { durations: [], timeouts: 0, last: null, lastTs: 0 }));
    if (m.timeout) {
      c.timeouts++;
    } else {
      c.durations.push(m.duration);
      if (m.ts >= c.lastTs) {
        c.last = m.duration;
        c.lastTs = m.ts;
      }
    }
  }
  const allPages = [...pages.values()].sort((a, b) => a.order - b.order || compareNames(a.name, b.name));
  return {
    apps: [...apps.values()].sort((a, b) => compareNames(a.name, b.name)),
    pages: allPages.filter((p) => !p.hidden),
    allPages,
    cells,
    rows,
    pageCounts,
    appCounts,
    refs: new Map(),
  };
}

function compute(c, stat) {
  const d = [...c.durations].sort((a, b) => a - b);
  let v;
  if (stat === 'median') v = median(d);
  else if (stat === 'min') v = d[0];
  else if (stat === 'max') v = d[d.length - 1];
  else if (stat === 'last') v = c.last;
  else v = d.reduce((s, x) => s + x, 0) / d.length;
  return Math.round(v);
}

/**
 * Valeur d'une case.
 * status : 'ok' | 'missing' (aucune mesure -> rouge) | 'timeout' (que des timeouts -> gris)
 */
export function cellStat(model, app, page, network, stat) {
  const c = model.cells.get(cellKey(app, page, network));
  if (!c) return { status: 'missing', value: null, count: 0, timeouts: 0 };
  if (!c.durations.length) return { status: 'timeout', value: null, count: 0, timeouts: c.timeouts, lastTs: c.lastTs };
  return {
    status: 'ok',
    value: compute(c, stat),
    count: c.durations.length,
    timeouts: c.timeouts,
    min: Math.min(...c.durations),
    max: Math.max(...c.durations),
    lastTs: c.lastTs,
  };
}

/** Écart WiFi / Ethernet d'une page (positif : le WiFi est plus lent). */
export function diffStat(model, app, page, stat) {
  const w = cellStat(model, app, page, 'wifi', stat);
  const e = cellStat(model, app, page, 'ethernet', stat);
  if (w.status === 'ok' && e.status === 'ok') {
    return { status: 'ok', value: w.value - e.value, pct: e.value > 0 ? (w.value - e.value) / e.value : null, w, e };
  }
  return { status: w.status === 'missing' || e.status === 'missing' ? 'missing' : 'timeout', value: null, w, e };
}

/** Référence d'une page sur un réseau : médiane des valeurs de tous les clients mesurés. */
export function pageRef(model, page, network, stat) {
  const key = `${stat}\u0000${nameKey(page)}\u0000${network}`;
  if (!model.refs.has(key)) {
    const values = model.apps
      .map((a) => cellStat(model, a.name, page, network, stat))
      .filter((c) => c.status === 'ok')
      .map((c) => c.value)
      .sort((a, b) => a - b);
    model.refs.set(
      key,
      values.length
        ? { median: Math.round(median(values)), count: values.length, min: values[0], max: values[values.length - 1] }
        : null,
    );
  }
  return model.refs.get(key);
}

/**
 * Niveau d'anomalie d'une valeur : 'crit' (orange), 'warn' (jaune) ou null.
 * Relatif : rapport à la médiane des clients (si au moins MIN_APPS_FOR_RATIO clients mesurés).
 * Absolu : seuils en ms facultatifs.
 */
export function anomaly(value, ref, settings) {
  const ratio = ref && ref.count >= MIN_APPS_FOR_RATIO && ref.median > 0 ? value / ref.median : null;
  const over = (r, ms) => (ratio !== null && r > 0 && ratio >= r) || (ms > 0 && value >= ms);
  if (over(settings.critRatio, settings.critMs)) return 'crit';
  if (over(settings.warnRatio, settings.warnMs)) return 'warn';
  return null;
}

/** Valeur + anomalie d'une case. */
export function rate(model, app, page, network, stat, settings) {
  const cs = cellStat(model, app, page, network, stat);
  const ref = pageRef(model, page, network, stat);
  const level = cs.status === 'ok' ? anomaly(cs.value, ref, settings) : null;
  const ratio =
    cs.status === 'ok' && ref && ref.count >= MIN_APPS_FOR_RATIO && ref.median > 0 ? cs.value / ref.median : null;
  return { ...cs, ref, level, ratio };
}

/** Cases mesurées (au moins une mesure, même en timeout) sur le total attendu. */
export function coverage(model, app, networks = NETWORKS.map((n) => n.id)) {
  let done = 0;
  for (const p of model.pages) for (const n of networks) if (model.cells.has(cellKey(app, p.name, n))) done++;
  return { done, total: model.pages.length * networks.length };
}

/** Pages visibles pas encore mesurées pour une application et un réseau. */
export function missingPages(model, app, network) {
  return model.pages.filter((p) => !model.cells.has(cellKey(app, p.name, network)));
}

// ---------------------------------------------------------------- Excel

const fr = (n) => String(n).replace('.', ',');

export function legendText(settings) {
  const abs = (ms) => (ms > 0 ? ` ou ≥ ${fr(ms / 1000)} s` : '');
  return (
    `Jaune = lent (≥ ${fr(settings.warnRatio)} × la médiane des clients pour cette page${abs(settings.warnMs)}) · ` +
    `Orange = très lent (≥ ${fr(settings.critRatio)} ×${abs(settings.critMs)}) · ` +
    'Rouge = pas de mesure · Gris = uniquement des timeouts'
  );
}

function valueCell(r) {
  if (r.status === 'ok') return { v: r.value, s: r.level || 'num' };
  if (r.status === 'timeout') return { v: TIMEOUT_TEXT, s: 'timeout' };
  return { v: MISSING_TEXT, s: 'missing' };
}

function gapCell(d, settings) {
  if (d.status !== 'ok' || d.pct === null) return d.status === 'ok' ? { v: '', s: 'text' } : valueCell(d);
  return { v: d.pct, s: Math.abs(d.pct) * 100 >= settings.gapPct ? 'pctWarn' : 'pct' };
}

/** « vs médiane » : +80 % = 1,8 × la médiane des clients. */
function vsMedianCell(r, settings) {
  if (r.ratio === null) return { v: '', s: 'text' };
  return { v: r.ratio - 1, s: r.ratio >= settings.warnRatio ? 'pctWarn' : 'pct' };
}

const nameWidth = (names) => Math.max(18, Math.min(40, ...names.map((n) => n.length + 2)));
const headWidth = (label, min = 10) => Math.max(min, Math.min(26, label.length + 2));

function header(texts, firstLeft = true) {
  return texts.map((v, i) => ({ v, s: i === 0 && firstLeft ? 'headerLeft' : 'header' }));
}

function subtitle(model, stat, date) {
  return (
    `Statistique : ${STATS[stat] || STATS.avg} · millisecondes entre le clic et l'affichage complet · ` +
    `${model.apps.length} application(s), ${model.pages.length} page(s) · généré le ${fmtDate(date)}`
  );
}

/** Feuille des mesures brutes (filtrable). */
export function rawSheet(rows, name = 'Mesures') {
  const data = [
    header([
      'Date',
      'Application',
      'Page',
      'Réseau',
      'Durée (ms)',
      'Timeout',
      'Type',
      'Déclencheur',
      'Page de départ',
      'URL mesurée',
    ]).map((c) => ({ ...c, s: 'headerLeft' })),
    ...rows.map((m) => [
      { v: fmtDate(m.ts), s: 'text' },
      { v: m.app, s: 'text' },
      { v: m.page, s: 'text' },
      { v: NETWORK_LABELS[m.network] || m.network, s: 'text' },
      { v: m.duration, s: 'num' },
      { v: m.timeout ? 'Oui' : 'Non', s: 'text' },
      { v: KIND_LABELS[m.kind] || m.kind || '', s: 'text' },
      { v: TRIGGER_LABELS[m.trigger] || m.trigger || '', s: 'text' },
      { v: m.startUrl || '', s: 'text' },
      { v: m.url || '', s: 'text' },
    ]),
  ];
  return {
    name,
    rows: data,
    cols: [20, 24, 24, 10, 11, 9, 24, 22, 45, 45],
    freeze: { rows: 1 },
    autoFilter: `A1:J${data.length}`,
  };
}

function networkSheet(model, stat, settings, network, sub) {
  const { apps, pages } = model;
  const last = Math.max(5, 4 + apps.length);
  return {
    name: NETWORK_LABELS[network],
    rows: [
      [{ v: `Temps de réponse — ${NETWORK_LABELS[network]} (ms)`, s: 'title' }],
      [{ v: sub, s: 'muted' }],
      [{ v: legendText(settings), s: 'muted' }],
      header(['Application', 'Couverture', ...pages.map((p) => p.name)]),
      ...apps.map((app) => {
        const cov = coverage(model, app.name, [network]);
        return [
          { v: app.name, s: 'textBold' },
          { v: cov.total ? cov.done / cov.total : 0, s: 'pct' },
          ...pages.map((p) => valueCell(rate(model, app.name, p.name, network, stat, settings))),
        ];
      }),
    ],
    cols: [nameWidth(apps.map((a) => a.name)), 11, ...pages.map((p) => headWidth(p.name))],
    heights: { 4: 32 },
    freeze: { rows: 4, cols: 2 },
    autoFilter: `A4:${colName(pages.length + 1)}${last}`,
  };
}

/** Export n°1 : toutes les applications × toutes les pages. */
export function buildGlobalSheets(model, stat, settings, date = new Date()) {
  const { apps, pages } = model;
  const sub = subtitle(model, stat, date);
  const first = 6;
  const last = Math.max(first, first + apps.length - 1);

  const pageHead = [
    { v: '', s: 'headerLeft' },
    { v: '', s: 'header' },
  ];
  const netHead = header(['Application', 'Couverture']);
  const merges = [];
  pages.forEach((p, i) => {
    const c = 2 + i * 2;
    pageHead.push({ v: p.name, s: 'header' }, { v: '', s: 'header' });
    netHead.push(...NETWORKS.map((n) => ({ v: n.label, s: 'header' })));
    merges.push(`${colName(c)}4:${colName(c + 1)}4`);
  });

  const sheets = [
    {
      name: 'WiFi + Ethernet',
      rows: [
        [{ v: 'Insigth — Temps de réponse par application et par page (ms)', s: 'title' }],
        [{ v: sub, s: 'muted' }],
        [{ v: legendText(settings), s: 'muted' }],
        pageHead,
        netHead,
        ...apps.map((app) => {
          const cov = coverage(model, app.name);
          return [
            { v: app.name, s: 'textBold' },
            { v: cov.total ? cov.done / cov.total : 0, s: 'pct' },
            ...pages.flatMap((p) =>
              NETWORKS.map((n) => valueCell(rate(model, app.name, p.name, n.id, stat, settings))),
            ),
          ];
        }),
      ],
      cols: [
        nameWidth(apps.map((a) => a.name)),
        11,
        ...pages.flatMap((p) => {
          const w = Math.max(9, headWidth(p.name, 9) / 2 + 3);
          return [w, w];
        }),
      ],
      heights: { 4: 32 },
      merges,
      freeze: { rows: 5, cols: 2 },
      autoFilter: `A5:${colName(1 + pages.length * 2)}${last}`,
    },
    ...NETWORKS.map((n) => networkSheet(model, stat, settings, n.id, sub)),
  ];

  // Écart WiFi / Ethernet en %
  sheets.push({
    name: 'Écart WiFi-Ethernet',
    rows: [
      [{ v: 'Écart WiFi / Ethernet : + 30 % = le WiFi est 30 % plus lent', s: 'title' }],
      [{ v: sub, s: 'muted' }],
      [{ v: `Jaune = écart d'au moins ${settings.gapPct} % · Rouge = mesure WiFi ou Ethernet manquante`, s: 'muted' }],
      header(['Application', ...pages.map((p) => p.name)]),
      ...apps.map((app) => [
        { v: app.name, s: 'textBold' },
        ...pages.map((p) => gapCell(diffStat(model, app.name, p.name, stat), settings)),
      ]),
    ],
    cols: [nameWidth(apps.map((a) => a.name)), ...pages.map((p) => headWidth(p.name))],
    heights: { 4: 32 },
    freeze: { rows: 4, cols: 1 },
    autoFilter: `A4:${colName(pages.length)}${Math.max(5, 4 + apps.length)}`,
  });

  // Référence utilisée pour les couleurs
  sheets.push({
    name: 'Référence par page',
    rows: [
      header([
        'Page',
        'Clients mesurés WiFi',
        'Médiane WiFi (ms)',
        'Clients mesurés Ethernet',
        'Médiane Ethernet (ms)',
      ]),
      ...pages.map((p) => {
        const w = pageRef(model, p.name, 'wifi', stat);
        const e = pageRef(model, p.name, 'ethernet', stat);
        return [
          { v: p.name, s: 'textBold' },
          { v: w ? w.count : 0, s: 'num' },
          { v: w ? w.median : '', s: 'num' },
          { v: e ? e.count : 0, s: 'num' },
          { v: e ? e.median : '', s: 'num' },
        ];
      }),
    ],
    cols: [30, 14, 14, 14, 14],
    heights: { 1: 32 },
    freeze: { rows: 1 },
  });

  sheets.push(rawSheet(model.rows));
  return sheets;
}

/** Export n°2 : une page, tous les clients. */
export function buildPageSheets(model, pageName, stat, settings, date = new Date()) {
  const page = (model.allPages.find((p) => nameKey(p.name) === nameKey(pageName)) || { name: normName(pageName) }).name;
  const apps = model.apps;
  const rows = [
    [{ v: `Page « ${page} » — tous les clients`, s: 'title' }],
    [{ v: subtitle(model, stat, date), s: 'muted' }],
    [{ v: legendText(settings), s: 'muted' }],
    header([
      'Application',
      'WiFi (ms)',
      'Ethernet (ms)',
      'Écart WiFi / Eth.',
      'WiFi vs médiane',
      'Ethernet vs médiane',
      'Nb mesures WiFi',
      'Nb mesures Ethernet',
      'Dernière mesure',
    ]),
  ];
  for (const app of apps) {
    const w = rate(model, app.name, page, 'wifi', stat, settings);
    const e = rate(model, app.name, page, 'ethernet', stat, settings);
    const lastTs = Math.max(w.lastTs || 0, e.lastTs || 0);
    rows.push([
      { v: app.name, s: 'textBold' },
      valueCell(w),
      valueCell(e),
      gapCell(diffStat(model, app.name, page, stat), settings),
      vsMedianCell(w, settings),
      vsMedianCell(e, settings),
      { v: w.count, s: 'num' },
      { v: e.count, s: 'num' },
      { v: lastTs ? fmtDate(lastTs) : '', s: 'text' },
    ]);
  }
  const lastRow = rows.length;
  const refs = NETWORKS.map((n) => pageRef(model, page, n.id, stat));
  rows.push(
    [],
    ...[
      ['Médiane (tous clients)', 'median'],
      ['Minimum', 'min'],
      ['Maximum', 'max'],
    ].map(([label, k]) => [{ v: label, s: 'headerLeft' }, ...refs.map((r) => ({ v: r ? r[k] : '', s: 'num' }))]),
    [{ v: 'Clients mesurés', s: 'headerLeft' }, ...refs.map((r) => ({ v: r ? r.count : 0, s: 'num' }))],
  );
  return [
    {
      name: page,
      rows,
      cols: [nameWidth(apps.map((a) => a.name)), 12, 13, 14, 14, 16, 13, 15, 19],
      heights: { 4: 32 },
      freeze: { rows: 4, cols: 1 },
      autoFilter: `A4:I${Math.max(5, lastRow)}`,
    },
    rawSheet(model.rows.filter((m) => nameKey(m.page) === nameKey(page))),
  ];
}

/** Export n°3 : un client, toutes ses pages. */
export function buildAppSheets(model, appName, stat, settings, date = new Date()) {
  const app = (model.apps.find((a) => nameKey(a.name) === nameKey(appName)) || { name: normName(appName) }).name;
  const rows = [
    [{ v: `${app} — toutes les pages`, s: 'title' }],
    [{ v: subtitle(model, stat, date), s: 'muted' }],
    [{ v: legendText(settings), s: 'muted' }],
    header([
      'Page',
      'WiFi (ms)',
      'Ethernet (ms)',
      'Écart WiFi / Eth.',
      'Médiane clients WiFi (ms)',
      'WiFi vs médiane',
      'Médiane clients Ethernet (ms)',
      'Ethernet vs médiane',
      'Nb mesures WiFi',
      'Nb mesures Ethernet',
    ]),
  ];
  for (const p of model.pages) {
    const w = rate(model, app, p.name, 'wifi', stat, settings);
    const e = rate(model, app, p.name, 'ethernet', stat, settings);
    rows.push([
      { v: p.name, s: 'textBold' },
      valueCell(w),
      valueCell(e),
      gapCell(diffStat(model, app, p.name, stat), settings),
      { v: w.ref ? w.ref.median : '', s: 'num' },
      vsMedianCell(w, settings),
      { v: e.ref ? e.ref.median : '', s: 'num' },
      vsMedianCell(e, settings),
      { v: w.count, s: 'num' },
      { v: e.count, s: 'num' },
    ]);
  }
  return [
    {
      name: app,
      rows,
      cols: [nameWidth(model.pages.map((p) => p.name)), 12, 13, 14, 16, 14, 18, 16, 13, 15],
      heights: { 4: 32 },
      freeze: { rows: 4, cols: 1 },
      autoFilter: `A4:J${Math.max(5, rows.length)}`,
    },
    rawSheet(model.rows.filter((m) => nameKey(m.app) === nameKey(app))),
  ];
}
