// Agrégation des mesures, anomalies et contenu des exports (Excel et CSV).
// Fonctions pures : aucune dépendance aux API Chrome (testables avec Node).
//
// Une LIGNE = Client + SID + Version (deux versions d'un même client sont deux
// lignes, comparables côte à côte). Une COLONNE = une page.

import { NETWORKS, NETWORK_LABELS, STATS, KIND_LABELS, TRIGGER_LABELS, fmtDate } from './format.js';
import { colName } from './xlsx.js';
import { normName, nameKey, compareNames } from './names.js';
import { urlEnd } from './urls.js';
import { DETAIL_COLUMNS, detailSummary } from './timing.js';

export const MISSING_TEXT = 'N/A';
export const TIMEOUT_TEXT = 'TIMEOUT';
/** En dessous de ce nombre de lignes mesurées, la comparaison à la médiane n'a pas de sens. */
export const MIN_APPS_FOR_RATIO = 3;

export const lineKey = (client, sid = '', version = '') => [client, sid, version].map(nameKey).join('\u0001');
const cellKey = (line, page, network) => `${line}\u0000${nameKey(page)}\u0000${network}`;

/** « Client A · PRD · 5.3 » */
export const lineLabel = (l) => [l.client, l.sid, l.version].filter(Boolean).join(' · ');

function median(sorted) {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Regroupe les mesures par ligne (client · SID · version) / page / réseau.
 *  lines : triées par client, SID, version
 *  pages : pages visibles dans l'ordre du référentiel, puis pages mesurées hors référentiel
 */
export function buildModel(measures, catalogClients = [], catalogPages = []) {
  const clients = new Map();
  const pages = new Map();
  const lines = new Map();
  const addClient = (name) => {
    const k = nameKey(name);
    if (k && !clients.has(k)) clients.set(k, normName(name));
    return clients.get(k);
  };
  const addPage = (name, hidden = false, order = Infinity) => {
    const k = nameKey(name);
    if (k && !pages.has(k)) pages.set(k, { name: normName(name), hidden, order });
    return pages.get(k);
  };
  for (const c of catalogClients) if (c && c.name) addClient(c.name);
  catalogPages.forEach((p, i) => p && p.name && addPage(p.name, !!p.hidden, i));

  const cells = new Map();
  const rows = [];
  const pageCounts = new Map();
  const lineCounts = new Map();
  const specifics = new Set(); // ligne + page déclarée « page spécifique »
  for (const m of measures) {
    if (!m || !m.app || !m.page) continue;
    const client = addClient(m.app);
    const page = addPage(m.page).name;
    const sid = normName(m.sid);
    const version = normName(m.version);
    const key = lineKey(client, sid, version);
    if (!lines.has(key)) lines.set(key, { key, client, sid, version });
    rows.push({
      ...m,
      app: client,
      sid,
      version,
      page,
      specific: !!m.specific,
      line: key,
      urlEnd: m.urlEnd || urlEnd(m.url),
    });
    if (m.specific) specifics.add(`${key}\u0000${nameKey(page)}`);
    pageCounts.set(nameKey(page), (pageCounts.get(nameKey(page)) || 0) + 1);
    lineCounts.set(key, (lineCounts.get(key) || 0) + 1);
    const ck = cellKey(key, page, m.network);
    let c = cells.get(ck);
    if (!c) cells.set(ck, (c = { durations: [], timeouts: 0, last: null, lastTs: 0 }));
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
  // Client du référentiel jamais mesuré : une ligne vide (toute rouge dans les exports).
  for (const client of clients.values()) {
    if (![...lines.values()].some((l) => l.client === client)) {
      const key = lineKey(client);
      lines.set(key, { key, client, sid: '', version: '' });
    }
  }
  const sortedLines = [...lines.values()].sort(
    (a, b) => compareNames(a.client, b.client) || compareNames(a.sid, b.sid) || compareNames(a.version, b.version),
  );
  const allPages = [...pages.values()].sort((a, b) => a.order - b.order || compareNames(a.name, b.name));
  return {
    lines: sortedLines,
    clients: [...clients.values()].sort(compareNames),
    pages: allPages.filter((p) => !p.hidden),
    allPages,
    cells,
    rows,
    pageCounts,
    lineCounts,
    specifics,
    refs: new Map(), // médianes par page (cache)
    stats: new Map(), // valeurs par case et statistique (cache)
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

/** Valeur d'une case : status 'ok' | 'missing' (rouge) | 'timeout' (gris). */
export function cellStat(model, line, page, network, stat) {
  const key = `${cellKey(line, page, network)}\u0000${stat}`;
  if (!model.stats.has(key)) model.stats.set(key, computeCell(model.cells.get(cellKey(line, page, network)), stat));
  return model.stats.get(key);
}

function computeCell(c, stat) {
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

/** Écart WiFi / Ethernet (positif : le WiFi est plus lent). */
export function diffStat(model, line, page, stat) {
  const w = cellStat(model, line, page, 'wifi', stat);
  const e = cellStat(model, line, page, 'ethernet', stat);
  if (w.status === 'ok' && e.status === 'ok') {
    return { status: 'ok', value: w.value - e.value, pct: e.value > 0 ? (w.value - e.value) / e.value : null, w, e };
  }
  return { status: w.status === 'missing' || e.status === 'missing' ? 'missing' : 'timeout', value: null, w, e };
}

/** Référence d'une page sur un réseau : médiane de toutes les lignes mesurées. */
export function pageRef(model, page, network, stat) {
  const key = `${stat}\u0000${nameKey(page)}\u0000${network}`;
  if (!model.refs.has(key)) {
    const values = model.lines
      .map((l) => cellStat(model, l.key, page, network, stat))
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

/** Niveau d'anomalie : 'crit' (orange), 'warn' (jaune) ou null. */
export function anomaly(value, ref, settings) {
  const ratio = ref && ref.count >= MIN_APPS_FOR_RATIO && ref.median > 0 ? value / ref.median : null;
  const over = (r, ms) => (ratio !== null && r > 0 && ratio >= r) || (ms > 0 && value >= ms);
  if (over(settings.critRatio, settings.critMs)) return 'crit';
  if (over(settings.warnRatio, settings.warnMs)) return 'warn';
  return null;
}

/** Valeur + anomalie d'une case. */
export function rate(model, line, page, network, stat, settings) {
  const cs = cellStat(model, line, page, network, stat);
  const ref = pageRef(model, page, network, stat);
  const level = cs.status === 'ok' ? anomaly(cs.value, ref, settings) : null;
  const ratio =
    cs.status === 'ok' && ref && ref.count >= MIN_APPS_FOR_RATIO && ref.median > 0 ? cs.value / ref.median : null;
  return { ...cs, ref, level, ratio };
}

/** Cases mesurées (au moins une mesure, même en timeout) sur le total attendu. */
export function coverage(model, line, networks = NETWORKS.map((n) => n.id)) {
  let done = 0;
  for (const p of model.pages) for (const n of networks) if (model.cells.has(cellKey(line, p.name, n))) done++;
  return { done, total: model.pages.length * networks.length };
}

/** Pages visibles pas encore mesurées pour une ligne et un réseau. */
export function missingPages(model, line, network) {
  return model.pages.filter((p) => !model.cells.has(cellKey(line, p.name, network)));
}

// ---------------------------------------------------------------- Excel : briques

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

const width = (texts, min = 10, max = 40) => Math.max(min, Math.min(max, ...texts.map((t) => String(t).length + 2)));
const headWidth = (label, min = 10) => Math.max(min, Math.min(26, label.length + 2));
const header = (texts) => texts.map((v, i) => ({ v, s: i === 0 ? 'headerLeft' : 'header' }));
const lineCells = (l) => [
  { v: l.client, s: 'textBold' },
  { v: l.sid, s: 'text' },
  { v: l.version, s: 'text' },
];

function subtitle(model, stat, date) {
  return (
    `Statistique : ${STATS[stat] || STATS.avg} · millisecondes entre le clic et l'affichage complet · ` +
    `${model.lines.length} ligne(s) client, ${model.pages.length} page(s) · généré le ${fmtDate(date)}`
  );
}

/** Page déclarée « spécifique » pour cette ligne client (au moins une mesure cochée). */
export function isSpecific(model, line, page) {
  return model.specifics.has(`${line}\u0000${nameKey(page)}`);
}

const yesNo = (b) => (b ? 'Oui' : 'Non');

/** Colonnes communes des mesures (Excel et CSV). */
const MEASURE_COLUMNS = [
  ['Date', (m) => fmtDate(m.ts), 20],
  ['Client', (m) => m.app, 24],
  ['SID', (m) => m.sid || '', 10],
  ['Version', (m) => m.version || '', 10],
  ['Page', (m) => m.page, 24],
  ['Page spécifique', (m) => yesNo(m.specific), 11],
  ['Réseau', (m) => NETWORK_LABELS[m.network] || m.network, 10],
  ['Durée (ms)', (m) => m.duration, 11, 'num'],
  ['Timeout', (m) => yesNo(m.timeout), 9],
  ['Type', (m) => KIND_LABELS[m.kind] || m.kind || '', 24],
  ['Déclencheur', (m) => TRIGGER_LABELS[m.trigger] || m.trigger || '', 22],
];

/** Colonnes d'URL ajoutées sur demande. */
function urlColumns({ fullUrl = false, urlEnd: withEnd = false } = {}) {
  const cols = [];
  if (withEnd) cols.push(["Fin d'URL", (m) => m.urlEnd || urlEnd(m.url), 40]);
  if (fullUrl) cols.push(['URL complète', (m) => m.url || '', 60], ['Page de départ', (m) => m.startUrl || '', 50]);
  return cols;
}

/** Colonnes des mesures brutes, URL en option. */
function measureColumns(options = {}) {
  return [...MEASURE_COLUMNS, ...urlColumns(options)];
}

/** Feuille des mesures brutes (filtrable). */
export function rawSheet(rows, options = {}, name = 'Mesures') {
  const cols = measureColumns(options);
  const data = [
    cols.map(([v]) => ({ v, s: 'headerLeft' })),
    ...rows.map((m) => cols.map(([, get, , style]) => ({ v: get(m), s: style || 'text' }))),
  ];
  return {
    name,
    rows: data,
    cols: cols.map((c) => c[2]),
    freeze: { rows: 1 },
    autoFilter: `A1:${colName(cols.length - 1)}${data.length}`,
  };
}

// ---------------------------------------------------------------- Export 1 : tout

function networkSheet(model, stat, settings, network, sub) {
  const { lines, pages } = model;
  const last = Math.max(5, 4 + lines.length);
  return {
    name: NETWORK_LABELS[network],
    rows: [
      [{ v: `Temps de réponse — ${NETWORK_LABELS[network]} (ms)`, s: 'title' }],
      [{ v: sub, s: 'muted' }],
      [{ v: legendText(settings), s: 'muted' }],
      header(['Client', 'SID', 'Version', 'Couverture', ...pages.map((p) => p.name)]),
      ...lines.map((l) => {
        const cov = coverage(model, l.key, [network]);
        return [
          ...lineCells(l),
          { v: cov.total ? cov.done / cov.total : 0, s: 'pct' },
          ...pages.map((p) => valueCell(rate(model, l.key, p.name, network, stat, settings))),
        ];
      }),
    ],
    cols: [
      width(
        lines.map((l) => l.client),
        16,
      ),
      10,
      10,
      11,
      ...pages.map((p) => headWidth(p.name)),
    ],
    heights: { 4: 32 },
    freeze: { rows: 4, cols: 3 },
    autoFilter: `A4:${colName(pages.length + 3)}${last}`,
  };
}

export function buildGlobalSheets(model, stat, settings, date = new Date(), options = {}) {
  const { lines, pages } = model;
  const sub = subtitle(model, stat, date);
  const first = 6;
  const last = Math.max(first, first + lines.length - 1);
  const pageHead = [
    { v: '', s: 'headerLeft' },
    { v: '', s: 'header' },
    { v: '', s: 'header' },
    { v: '', s: 'header' },
  ];
  const netHead = header(['Client', 'SID', 'Version', 'Couverture']);
  const merges = [];
  pages.forEach((p, i) => {
    const c = 4 + i * 2;
    pageHead.push({ v: p.name, s: 'header' }, { v: '', s: 'header' });
    netHead.push(...NETWORKS.map((n) => ({ v: n.label, s: 'header' })));
    merges.push(`${colName(c)}4:${colName(c + 1)}4`);
  });
  return [
    {
      name: 'WiFi + Ethernet',
      rows: [
        [{ v: 'Insight — Temps de réponse par client et par page (ms)', s: 'title' }],
        [{ v: sub, s: 'muted' }],
        [{ v: legendText(settings), s: 'muted' }],
        pageHead,
        netHead,
        ...lines.map((l) => {
          const cov = coverage(model, l.key);
          return [
            ...lineCells(l),
            { v: cov.total ? cov.done / cov.total : 0, s: 'pct' },
            ...pages.flatMap((p) => NETWORKS.map((n) => valueCell(rate(model, l.key, p.name, n.id, stat, settings)))),
          ];
        }),
      ],
      cols: [
        width(
          lines.map((l) => l.client),
          16,
        ),
        10,
        10,
        11,
        ...pages.flatMap((p) => {
          const w = Math.max(9, headWidth(p.name, 9) / 2 + 3);
          return [w, w];
        }),
      ],
      heights: { 4: 32 },
      merges,
      freeze: { rows: 5, cols: 3 },
      autoFilter: `A5:${colName(3 + pages.length * 2)}${last}`,
    },
    ...NETWORKS.map((n) => networkSheet(model, stat, settings, n.id, sub)),
    {
      name: 'Écart WiFi-Ethernet',
      rows: [
        [{ v: 'Écart WiFi / Ethernet : + 30 % = le WiFi est 30 % plus lent', s: 'title' }],
        [{ v: sub, s: 'muted' }],
        [
          {
            v: `Jaune = écart d'au moins ${settings.gapPct} % · Rouge = mesure WiFi ou Ethernet manquante`,
            s: 'muted',
          },
        ],
        header(['Client', 'SID', 'Version', ...pages.map((p) => p.name)]),
        ...lines.map((l) => [
          ...lineCells(l),
          ...pages.map((p) => gapCell(diffStat(model, l.key, p.name, stat), settings)),
        ]),
      ],
      cols: [
        width(
          lines.map((l) => l.client),
          16,
        ),
        10,
        10,
        ...pages.map((p) => headWidth(p.name)),
      ],
      heights: { 4: 32 },
      freeze: { rows: 4, cols: 3 },
      autoFilter: `A4:${colName(pages.length + 2)}${Math.max(5, 4 + lines.length)}`,
    },
    {
      name: 'Référence par page',
      rows: [
        header([
          'Page',
          'Lignes mesurées WiFi',
          'Médiane WiFi (ms)',
          'Lignes mesurées Ethernet',
          'Médiane Ethernet (ms)',
          'Spécifique pour (lignes client)',
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
            { v: lines.filter((l) => isSpecific(model, l.key, p.name)).length, s: 'num' },
          ];
        }),
      ],
      cols: [30, 14, 14, 14, 14, 16],
      heights: { 1: 32 },
      freeze: { rows: 1 },
    },
    specificSheet(model),
    rawSheet(model.rows, options),
  ];
}

/** Liste des pages déclarées spécifiques : client · SID · version · page. */
function specificSheet(model) {
  const rows = [];
  for (const l of model.lines) {
    for (const p of model.allPages) {
      if (!isSpecific(model, l.key, p.name)) continue;
      const count = model.rows.filter((m) => m.line === l.key && nameKey(m.page) === nameKey(p.name)).length;
      rows.push([...lineCells(l), { v: p.name, s: 'text' }, { v: count, s: 'num' }]);
    }
  }
  return {
    name: 'Pages spécifiques',
    rows: [
      header(['Client', 'SID', 'Version', 'Page spécifique', 'Nb mesures']),
      ...(rows.length ? rows : [[{ v: 'Aucune page déclarée spécifique', s: 'muted' }]]),
    ],
    cols: [24, 10, 10, 30, 12],
    freeze: { rows: 1 },
    autoFilter: rows.length ? `A1:E${rows.length + 1}` : undefined,
  };
}

// ---------------------------------------------------------------- Export 2 : une page, tous les clients

const findPage = (model, name) =>
  (model.allPages.find((p) => nameKey(p.name) === nameKey(name)) || { name: normName(name) }).name;

export function buildPageSheets(model, pageName, stat, settings, date = new Date(), options = {}) {
  const page = findPage(model, pageName);
  const { lines } = model;
  const rows = [
    [{ v: `Page « ${page} » — tous les clients`, s: 'title' }],
    [{ v: subtitle(model, stat, date), s: 'muted' }],
    [{ v: legendText(settings), s: 'muted' }],
    header([
      'Client',
      'SID',
      'Version',
      'Page spécifique',
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
  for (const l of lines) {
    const w = rate(model, l.key, page, 'wifi', stat, settings);
    const e = rate(model, l.key, page, 'ethernet', stat, settings);
    const lastTs = Math.max(w.lastTs || 0, e.lastTs || 0);
    const measured = w.status !== 'missing' || e.status !== 'missing';
    rows.push([
      ...lineCells(l),
      { v: measured ? yesNo(isSpecific(model, l.key, page)) : '', s: 'text' },
      valueCell(w),
      valueCell(e),
      gapCell(diffStat(model, l.key, page, stat), settings),
      vsMedianCell(w, settings),
      vsMedianCell(e, settings),
      { v: w.count, s: 'num' },
      { v: e.count, s: 'num' },
      { v: lastTs ? fmtDate(lastTs) : '', s: 'text' },
    ]);
  }
  const lastRow = rows.length;
  const refs = NETWORKS.map((n) => pageRef(model, page, n.id, stat));
  const pad = [
    { v: '', s: 'headerLeft' },
    { v: '', s: 'headerLeft' },
    { v: '', s: 'headerLeft' },
  ];
  rows.push(
    [],
    ...[
      ['Médiane (tous clients)', 'median'],
      ['Minimum', 'min'],
      ['Maximum', 'max'],
      ['Lignes mesurées', 'count'],
    ].map(([label, k]) => [
      { v: label, s: 'headerLeft' },
      ...pad,
      ...refs.map((r) => ({ v: r ? r[k] : '', s: 'num' })),
    ]),
  );
  return [
    {
      name: page,
      rows,
      cols: [
        width(
          lines.map((l) => l.client),
          18,
        ),
        10,
        10,
        11,
        12,
        13,
        14,
        14,
        16,
        13,
        15,
        19,
      ],
      heights: { 4: 32 },
      freeze: { rows: 4, cols: 3 },
      autoFilter: `A4:L${Math.max(5, lastRow)}`,
    },
    rawSheet(
      model.rows.filter((m) => nameKey(m.page) === nameKey(page)),
      options,
    ),
  ];
}

// ---------------------------------------------------------------- Export 3 : un client, toutes les pages

/** Une feuille par ligne du client (SID / version), puis ses mesures. */
export function buildClientSheets(model, clientName, stat, settings, date = new Date(), options = {}) {
  const lines = model.lines.filter((l) => nameKey(l.client) === nameKey(clientName));
  const sheets = lines.map((l) => {
    const rows = [
      [{ v: `${lineLabel(l)} — toutes les pages`, s: 'title' }],
      [{ v: subtitle(model, stat, date), s: 'muted' }],
      [{ v: legendText(settings), s: 'muted' }],
      header([
        'Page',
        'Page spécifique',
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
      const w = rate(model, l.key, p.name, 'wifi', stat, settings);
      const e = rate(model, l.key, p.name, 'ethernet', stat, settings);
      const measured = w.status !== 'missing' || e.status !== 'missing';
      rows.push([
        { v: p.name, s: 'textBold' },
        { v: measured ? yesNo(isSpecific(model, l.key, p.name)) : '', s: 'text' },
        valueCell(w),
        valueCell(e),
        gapCell(diffStat(model, l.key, p.name, stat), settings),
        { v: w.ref ? w.ref.median : '', s: 'num' },
        vsMedianCell(w, settings),
        { v: e.ref ? e.ref.median : '', s: 'num' },
        vsMedianCell(e, settings),
        { v: w.count, s: 'num' },
        { v: e.count, s: 'num' },
      ]);
    }
    return {
      name: [l.sid, l.version].filter(Boolean).join(' · ') || l.client,
      rows,
      cols: [
        width(
          model.pages.map((p) => p.name),
          18,
        ),
        11,
        12,
        13,
        14,
        16,
        14,
        18,
        16,
        13,
        15,
      ],
      heights: { 4: 32 },
      freeze: { rows: 4, cols: 1 },
      autoFilter: `A4:K${Math.max(5, rows.length)}`,
    };
  });
  const keys = new Set(lines.map((l) => l.key));
  return [
    ...sheets,
    rawSheet(
      model.rows.filter((m) => keys.has(m.line)),
      options,
    ),
  ];
}

// ---------------------------------------------------------------- Export 4 : détail des temps d'une page

function detailColumns(options) {
  return [
    ...MEASURE_COLUMNS.slice(0, MEASURE_COLUMNS.findIndex(([h]) => h === 'Durée (ms)') + 1), // Date … Durée
    ...DETAIL_COLUMNS.map(([, label], i) => [`${label} (ms)`, (m) => m._sum.durations[i] ?? '', 12, 'num']),
    ['Nb requêtes', (m) => m._sum.requestCount ?? '', 11, 'num'],
    ['Requête la plus lente (ms)', (m) => (m._sum.slowest ? Math.round(m._sum.slowest.duration) : ''), 14, 'num'],
    ['URL requête la plus lente', (m) => (m._sum.slowest ? m._sum.slowest.url : ''), 50],
    ...urlColumns(options), // URL en option
  ];
}

export function buildDetailSheets(model, pageName, date = new Date(), options = {}) {
  const page = findPage(model, pageName);
  const measures = model.rows
    .filter((m) => nameKey(m.page) === nameKey(page))
    .map((m) => ({ ...m, _sum: detailSummary(m.detail) }));
  const cols = detailColumns(options);
  const data = [
    [{ v: `Détail des temps — page « ${page} »`, s: 'title' }],
    [
      {
        v: `Une ligne par mesure · étapes en ms (attente serveur = temps de réponse du serveur, requêtes SQL comprises) · généré le ${fmtDate(date)}`,
        s: 'muted',
      },
    ],
    cols.map(([v]) => ({ v, s: 'header' })),
    ...measures.map((m) => cols.map(([, get, , style]) => ({ v: get(m), s: style || 'text' }))),
  ];
  const requests = [
    header(['Date', 'Client', 'SID', 'Version', 'Réseau', 'Début (ms après le clic)', 'Durée (ms)', 'Type', 'URL']),
    ...measures.flatMap((m) =>
      ((m.detail && m.detail.requests) || []).map((r) => [
        { v: fmtDate(m.ts), s: 'text' },
        { v: m.app, s: 'text' },
        { v: m.sid, s: 'text' },
        { v: m.version, s: 'text' },
        { v: NETWORK_LABELS[m.network], s: 'text' },
        { v: Math.round(r.start), s: 'num' },
        { v: Math.round(r.duration), s: 'num' },
        { v: r.type || '', s: 'text' },
        { v: r.url, s: 'text' },
      ]),
    ),
  ];
  return [
    {
      name: `Détail ${page}`,
      rows: data,
      cols: cols.map((c) => c[2]),
      heights: { 3: 45 },
      freeze: { rows: 3, cols: 2 },
      autoFilter: `A3:${colName(cols.length - 1)}${Math.max(4, data.length)}`,
    },
    {
      name: 'Requêtes',
      rows: requests,
      cols: [20, 24, 10, 10, 10, 14, 11, 14, 70],
      freeze: { rows: 1 },
      autoFilter: `A1:I${Math.max(2, requests.length)}`,
    },
  ];
}

// ---------------------------------------------------------------- CSV (une ligne par mesure)

function toCsv(cols, rows) {
  const q = (v) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return (
    '﻿' +
    [cols.map(([h]) => q(h)).join(';'), ...rows.map((m) => cols.map(([, get]) => q(get(m))).join(';'))].join('\r\n') +
    '\r\n'
  );
}

/** Mesures du périmètre choisi, une par ligne ; URL complète / fin d'URL en option. */
export function measuresCsv(rows, options = {}) {
  return toCsv(measureColumns(options), rows);
}

/** Détail des temps (une ligne par mesure) d'une page. */
export function detailCsv(model, pageName, options = {}) {
  const page = findPage(model, pageName);
  const rows = model.rows
    .filter((m) => nameKey(m.page) === nameKey(page))
    .map((m) => ({ ...m, _sum: detailSummary(m.detail) }));
  return toCsv(detailColumns(options), rows);
}

/** Mesures couvertes par un type d'export. */
export function scopeRows(model, { type, page, client }) {
  if (type === 'page' || type === 'detail') return model.rows.filter((m) => nameKey(m.page) === nameKey(page));
  if (type === 'client') return model.rows.filter((m) => nameKey(m.app) === nameKey(client));
  return model.rows;
}
