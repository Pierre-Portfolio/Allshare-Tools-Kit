// Agrégation des mesures et construction du rapport (Excel, CSV).
// Fonctions pures : aucune dépendance aux API Chrome (testables avec Node).
//
// Présentation : UNE LIGNE PAR APPLICATION, UNE COLONNE PAR PAGE (adapté à
// 100–200 applications quasi identiques d'une vingtaine de pages chacune).

import { matchApp, pageKey, comparePages } from './urls.js';
import { NETWORKS, NETWORK_LABELS, STATS, KIND_LABELS, TRIGGER_LABELS, fmtDate } from './format.js';
import { colName } from './xlsx.js';

const cellKey = (appId, page, network) => `${appId}\u0000${page}\u0000${network}`;

export const MISSING_TEXT = 'N/A';
export const TIMEOUT_TEXT = 'TIMEOUT';

/** Tri « naturel » des noms (Client 2 avant Client 10). */
export const compareNames = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });

/** Clé de page d'une mesure, recalculée avec les réglages et URL de base actuels. */
export function measurePage(measure, app, settings) {
  const match = matchApp(measure.url, [app], settings);
  if (match) {
    try {
      return pageKey(measure.url, match.basePath, settings);
    } catch {
      /* URL invalide : on garde la clé enregistrée */
    }
  }
  return measure.page || '/';
}

/**
 * Liste ordonnée des pages (colonnes) : d'abord celles réglées par l'utilisateur
 * (ordre, libellé, masquée), puis les pages découvertes dans les mesures.
 */
export function resolvePages(discovered, pagesConfig = []) {
  const list = [];
  const seen = new Set();
  for (const p of pagesConfig || []) {
    if (!p || !p.key || seen.has(p.key)) continue;
    seen.add(p.key);
    list.push({ key: p.key, label: String(p.label || '').trim() || p.key, hidden: !!p.hidden, configured: true });
  }
  for (const key of [...discovered].sort(comparePages)) {
    if (seen.has(key)) continue;
    seen.add(key);
    list.push({ key, label: key, hidden: false, configured: false });
  }
  return list;
}

/**
 * Regroupe les mesures par application / page / réseau.
 * model.apps   : applications triées par nom (lignes)
 * model.pages  : pages visibles [{ key, label }] (colonnes)
 * Une page mesurée dans au moins une application apparaît pour toutes : là où
 * elle manque, la case est rouge.
 */
export function buildModel(measures, apps, settings, pagesConfig = []) {
  const appById = new Map(apps.map((a) => [a.id, a]));
  const discovered = new Set();
  const pageCounts = new Map();
  const cells = new Map();
  const rows = [];
  for (const m of measures) {
    const app = appById.get(m.appId);
    if (!app) continue;
    const page = measurePage(m, app, settings);
    discovered.add(page);
    pageCounts.set(page, (pageCounts.get(page) || 0) + 1);
    rows.push({ ...m, page, appName: app.name });
    const key = cellKey(app.id, page, m.network);
    let c = cells.get(key);
    if (!c) cells.set(key, (c = { durations: [], timeouts: 0, last: null }));
    if (m.timeout) {
      c.timeouts++;
    } else {
      c.durations.push(m.duration);
      if (!c.last || m.ts >= c.last.ts) c.last = m;
    }
  }
  const allPages = resolvePages(discovered, pagesConfig);
  return {
    apps: [...apps].sort((a, b) => compareNames(a.name, b.name)),
    pages: allPages.filter((p) => !p.hidden),
    allPages,
    pageCounts,
    cells,
    rows,
  };
}

function compute(c, stat) {
  const d = [...c.durations].sort((a, b) => a - b);
  let v;
  switch (stat) {
    case 'median': {
      const mid = Math.floor(d.length / 2);
      v = d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2;
      break;
    }
    case 'min':
      v = d[0];
      break;
    case 'max':
      v = d[d.length - 1];
      break;
    case 'last':
      v = c.last.duration;
      break;
    default:
      v = d.reduce((s, x) => s + x, 0) / d.length;
  }
  return Math.round(v);
}

/**
 * Valeur d'une case.
 * status : 'ok' | 'missing' (aucune mesure -> rouge) | 'timeout' (que des timeouts -> gris)
 */
export function cellStat(model, appId, page, network, stat) {
  const c = model.cells.get(cellKey(appId, page, network));
  if (!c) return { status: 'missing', value: null, count: 0, timeouts: 0 };
  if (!c.durations.length) return { status: 'timeout', value: null, count: 0, timeouts: c.timeouts };
  let min = Infinity;
  let max = -Infinity;
  for (const d of c.durations) {
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return { status: 'ok', value: compute(c, stat), count: c.durations.length, timeouts: c.timeouts, min, max };
}

/** Écart WiFi − Ethernet d'une page (positif : le WiFi est plus lent). */
export function diffStat(model, appId, page, stat) {
  const w = cellStat(model, appId, page, 'wifi', stat);
  const e = cellStat(model, appId, page, 'ethernet', stat);
  if (w.status === 'ok' && e.status === 'ok') {
    return { status: 'ok', value: w.value - e.value, pct: e.value > 0 ? (w.value - e.value) / e.value : null, w, e };
  }
  return { status: w.status === 'missing' || e.status === 'missing' ? 'missing' : 'timeout', value: null, w, e };
}

/** Cases mesurées (au moins une mesure, même en timeout) sur le total attendu. */
export function coverage(model, appId, networks = NETWORKS.map((n) => n.id)) {
  let done = 0;
  for (const p of model.pages) for (const n of networks) if (model.cells.has(cellKey(appId, p.key, n))) done++;
  return { done, total: model.pages.length * networks.length };
}

/** Pages visibles pas encore mesurées pour une application et un réseau. */
export function missingPages(model, appId, network) {
  return model.pages.filter((p) => !model.cells.has(cellKey(appId, p.key, network)));
}

// ---------------------------------------------------------------- Excel

function xlsxCell(cs) {
  if (cs.status === 'ok') return { v: cs.value, s: 'num' };
  if (cs.status === 'timeout') return { v: TIMEOUT_TEXT, s: 'timeout' };
  return { v: MISSING_TEXT, s: 'missing' };
}

const LEGEND =
  'Rouge = aucune mesure (page inexistante ou non mesurée) · Gris = uniquement des timeouts · ' +
  'Couleur des valeurs : du plus rapide (blanc) au plus lent (orange), page par page';

// Échelle « rapide → lent » : blanc, crème (médiane), orange.
const HEAT = {
  stops: [{ type: 'min' }, { type: 'percentile', val: 50 }, { type: 'max' }],
  colors: ['FFFFFFFF', 'FFFFF3D6', 'FFF4B183'],
};
// Échelle divergente pour les écarts : bleu (WiFi plus rapide), blanc (0), orange (WiFi plus lent).
const DIVERGING = {
  stops: [{ type: 'min' }, { type: 'num', val: 0 }, { type: 'max' }],
  colors: ['FF9BC2E6', 'FFFFFFFF', 'FFF4B183'],
};

const pageWidth = (label, min = 10) => Math.max(min, Math.min(26, label.length + 2));
const nameWidth = (apps) => Math.max(18, Math.min(40, ...apps.map((a) => a.name.length + 2)));

function coverageCell(model, appId, networks) {
  const { done, total } = coverage(model, appId, networks);
  return { v: total ? done / total : 0, s: 'pct' };
}

/** Feuille « un réseau » : une ligne par appli, une colonne par page. */
function networkSheet(model, stat, network, subtitle) {
  const { apps, pages } = model;
  const first = 5; // première ligne de données
  const last = Math.max(first, first + apps.length - 1);
  const rows = [
    [{ v: `Temps de réponse — ${NETWORK_LABELS[network]} (ms)`, s: 'title' }],
    [{ v: subtitle, s: 'muted' }],
    [{ v: LEGEND, s: 'muted' }],
    [
      { v: 'Application', s: 'headerLeft' },
      { v: 'Couverture', s: 'header' },
      ...pages.map((p) => ({ v: p.label, s: 'header' })),
    ],
    ...apps.map((app) => [
      { v: app.name, s: 'textBold' },
      coverageCell(model, app.id, [network]),
      ...pages.map((p) => xlsxCell(cellStat(model, app.id, p.key, network, stat))),
    ]),
  ];
  return {
    name: NETWORK_LABELS[network],
    rows,
    cols: [nameWidth(apps), 11, ...pages.map((p) => pageWidth(p.label))],
    heights: { 4: 32 },
    freeze: { rows: 4, cols: 2 },
    autoFilter: `A4:${colName(pages.length + 1)}${last}`,
    scales: pages.map((_, i) => ({ ref: `${colName(i + 2)}${first}:${colName(i + 2)}${last}`, ...HEAT })),
  };
}

/** Feuilles Excel : Comparatif, WiFi, Ethernet, Écart, Pages, Mesures. */
export function buildSheets(model, stat, generatedAt = new Date()) {
  const statLabel = STATS[stat] || STATS.avg;
  const subtitle =
    `Statistique : ${statLabel} · millisecondes entre le clic et l'affichage complet · ` +
    `${model.apps.length} application(s), ${model.pages.length} page(s) · généré le ${fmtDate(generatedAt)}`;
  const { apps, pages } = model;
  const sheets = [];

  // -- Comparatif : une ligne par appli, deux colonnes (WiFi | Ethernet) par page
  const first = 6;
  const last = Math.max(first, first + apps.length - 1);
  const pageHead = [
    { v: '', s: 'headerLeft' },
    { v: '', s: 'header' },
  ];
  const netHead = [
    { v: 'Application', s: 'headerLeft' },
    { v: 'Couverture', s: 'header' },
  ];
  const merges = [];
  const scales = [];
  pages.forEach((p, i) => {
    const c = 2 + i * 2;
    pageHead.push({ v: p.label, s: 'header' }, { v: '', s: 'header' });
    netHead.push(...NETWORKS.map((n) => ({ v: n.label, s: 'header' })));
    merges.push(`${colName(c)}4:${colName(c + 1)}4`);
    // une échelle par page (WiFi et Ethernet ensemble : couleurs comparables)
    scales.push({ ref: `${colName(c)}${first}:${colName(c + 1)}${last}`, ...HEAT });
  });
  sheets.push({
    name: 'Comparatif',
    rows: [
      [{ v: 'Insigth — Temps de réponse par application et par page (ms)', s: 'title' }],
      [{ v: subtitle, s: 'muted' }],
      [{ v: LEGEND, s: 'muted' }],
      pageHead,
      netHead,
      ...apps.map((app) => [
        { v: app.name, s: 'textBold' },
        coverageCell(model, app.id),
        ...pages.flatMap((p) => NETWORKS.map((n) => xlsxCell(cellStat(model, app.id, p.key, n.id, stat)))),
      ]),
    ],
    cols: [
      nameWidth(apps),
      11,
      ...pages.flatMap((p) => [pageWidth(p.label, 9) / 2 + 4, pageWidth(p.label, 9) / 2 + 4]),
    ],
    heights: { 4: 32 },
    merges,
    freeze: { rows: 5, cols: 2 },
    autoFilter: `A5:${colName(1 + pages.length * 2)}${last}`,
    scales,
  });

  // -- Un tableau par réseau (une colonne par page : plus lisible)
  for (const n of NETWORKS) sheets.push(networkSheet(model, stat, n.id, subtitle));

  // -- Écart WiFi − Ethernet
  sheets.push({
    name: 'Écart WiFi-Ethernet',
    rows: [
      [{ v: 'Écart WiFi − Ethernet (ms) : positif = le WiFi est plus lent', s: 'title' }],
      [{ v: subtitle, s: 'muted' }],
      [
        {
          v: 'Rouge = mesure WiFi ou Ethernet manquante · Bleu = WiFi plus rapide · Orange = WiFi plus lent',
          s: 'muted',
        },
      ],
      [{ v: 'Application', s: 'headerLeft' }, ...pages.map((p) => ({ v: p.label, s: 'header' }))],
      ...apps.map((app) => [
        { v: app.name, s: 'textBold' },
        ...pages.map((p) => {
          const d = diffStat(model, app.id, p.key, stat);
          return d.status === 'ok' ? { v: d.value, s: 'num' } : xlsxCell(d);
        }),
      ]),
    ],
    cols: [nameWidth(apps), ...pages.map((p) => pageWidth(p.label))],
    heights: { 4: 32 },
    freeze: { rows: 4, cols: 1 },
    autoFilter: `A4:${colName(pages.length)}${Math.max(5, 4 + apps.length)}`,
    scales: pages.length ? [{ ref: `B5:${colName(pages.length)}${Math.max(5, 4 + apps.length)}`, ...DIVERGING }] : [],
  });

  // -- Pages : correspondance libellé / chemin et vue d'ensemble
  const median = (values) => {
    if (!values.length) return '';
    const d = [...values].sort((a, b) => a - b);
    const mid = Math.floor(d.length / 2);
    return Math.round(d.length % 2 ? d[mid] : (d[mid - 1] + d[mid]) / 2);
  };
  sheets.push({
    name: 'Pages',
    rows: [
      [
        'Ordre',
        'Libellé',
        'Chemin (relatif à l’URL de base)',
        'Applis mesurées WiFi',
        'Applis mesurées Ethernet',
        'Médiane WiFi (ms)',
        'Médiane Ethernet (ms)',
      ].map((v) => ({ v, s: 'headerLeft' })),
      ...pages.map((p, i) => {
        const per = NETWORKS.map((n) =>
          apps.map((a) => cellStat(model, a.id, p.key, n.id, stat)).filter((c) => c.status === 'ok'),
        );
        return [
          { v: i + 1, s: 'num' },
          { v: p.label, s: 'textBold' },
          { v: p.key, s: 'text' },
          ...per.map((list) => ({ v: list.length, s: 'num' })),
          ...per.map((list) => ({ v: median(list.map((c) => c.value)), s: 'num' })),
        ];
      }),
    ],
    cols: [7, 28, 34, 12, 12, 13, 13],
    heights: { 1: 32 },
    freeze: { rows: 1 },
  });

  // -- Mesures brutes
  const raw = [
    ['Date', 'Application', 'Page', 'Réseau', 'Durée (ms)', 'Type', 'Déclencheur', 'Timeout', 'URL'].map((v) => ({
      v,
      s: 'headerLeft',
    })),
    ...model.rows.map((m) => [
      { v: fmtDate(m.ts), s: 'text' },
      { v: m.appName, s: 'text' },
      { v: m.page, s: 'text' },
      { v: NETWORK_LABELS[m.network] || m.network, s: 'text' },
      { v: m.duration, s: 'num' },
      { v: KIND_LABELS[m.kind] || m.kind, s: 'text' },
      { v: TRIGGER_LABELS[m.trigger] || m.trigger, s: 'text' },
      { v: m.timeout ? 'Oui' : 'Non', s: 'text' },
      { v: m.url, s: 'text' },
    ]),
  ];
  sheets.push({
    name: 'Mesures',
    rows: raw,
    cols: [20, 24, 26, 10, 11, 24, 24, 9, 60],
    freeze: { rows: 1 },
    autoFilter: `A1:I${raw.length}`,
  });

  return sheets;
}

/** CSV du comparatif (séparateur « ; » pour Excel en français) : une ligne par application. */
export function buildCsv(model, stat) {
  const q = (v) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Application', ...model.pages.flatMap((p) => NETWORKS.map((n) => `${p.label} - ${n.label} (ms)`))];
  const lines = [header.map(q).join(';')];
  for (const app of model.apps) {
    const values = model.pages.flatMap((p) =>
      NETWORKS.map((n) => {
        const cs = cellStat(model, app.id, p.key, n.id, stat);
        return cs.status === 'ok' ? cs.value : cs.status === 'timeout' ? TIMEOUT_TEXT : MISSING_TEXT;
      }),
    );
    lines.push([app.name, ...values].map(q).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
