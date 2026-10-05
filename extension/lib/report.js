// Agrégation des mesures et construction du rapport (tableaux, Excel, CSV).
// Fonctions pures : aucune dépendance aux API Chrome (testables avec Node).

import { matchApp, pageKey, comparePages } from './urls.js';
import { NETWORKS, NETWORK_LABELS, STATS, KIND_LABELS, TRIGGER_LABELS, fmtDate } from './format.js';
import { colName } from './xlsx.js';

const cellKey = (appId, page, network) => `${appId}\u0000${page}\u0000${network}`;

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
 * Regroupe les mesures par application / page / réseau.
 * Les pages sont l'union des pages vues dans TOUTES les applications : une page
 * mesurée dans l'appli A mais pas dans l'appli B apparaît en rouge pour B.
 */
export function buildModel(measures, apps, settings) {
  const appById = new Map(apps.map((a) => [a.id, a]));
  const pages = new Set();
  const cells = new Map();
  const rows = [];
  for (const m of measures) {
    const app = appById.get(m.appId);
    if (!app) continue;
    const page = measurePage(m, app, settings);
    pages.add(page);
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
  return { apps, pages: [...pages].sort(comparePages), cells, rows };
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
 * Valeur d'une case du rapport.
 * status : 'ok' | 'missing' (aucune mesure -> rouge) | 'timeout' (que des timeouts -> orange)
 */
export function cellStat(model, appId, page, network, stat) {
  const c = model.cells.get(cellKey(appId, page, network));
  if (!c) return { status: 'missing', value: null, count: 0, timeouts: 0 };
  if (!c.durations.length) return { status: 'timeout', value: null, count: 0, timeouts: c.timeouts };
  const sorted = [...c.durations].sort((a, b) => a - b);
  return {
    status: 'ok',
    value: compute(c, stat),
    count: c.durations.length,
    timeouts: c.timeouts,
    min: sorted[0],
    max: sorted[sorted.length - 1],
  };
}

export const MISSING_TEXT = 'N/A';
export const TIMEOUT_TEXT = 'TIMEOUT';

function xlsxCell(cs) {
  if (cs.status === 'ok') return { v: cs.value, s: 'num' };
  if (cs.status === 'timeout') return { v: TIMEOUT_TEXT, s: 'timeout' };
  return { v: MISSING_TEXT, s: 'missing' };
}

const LEGEND =
  'Rouge = aucune mesure (page inexistante ou non mesurée sur ce réseau) · Orange = uniquement des mesures en timeout';

/** Feuilles Excel : Comparatif, une feuille par application, Mesures (brutes). */
export function buildSheets(model, stat, generatedAt = new Date()) {
  const statLabel = STATS[stat] || STATS.avg;
  const subtitle = `Statistique : ${statLabel} · temps en millisecondes entre le clic et l'affichage complet · généré le ${fmtDate(generatedAt)}`;
  const { apps, pages } = model;
  const sheets = [];

  // -- Comparatif : une ligne par page, deux colonnes (WiFi / Ethernet) par application
  const head1 = [{ v: 'Page', s: 'headerLeft' }];
  const head2 = [{ v: '', s: 'headerLeft' }];
  const merges = ['A4:A5'];
  apps.forEach((app, i) => {
    head1.push({ v: app.name, s: 'header' }, { v: '', s: 'header' });
    head2.push(...NETWORKS.map((n) => ({ v: n.label, s: 'header' })));
    const c = 1 + i * 2;
    merges.push(`${colName(c)}4:${colName(c + 1)}4`);
  });
  const compareRows = [
    [{ v: 'Insigth — Comparatif des temps de réponse par page', s: 'title' }],
    [{ v: subtitle, s: 'muted' }],
    [{ v: LEGEND, s: 'muted' }],
    head1,
    head2,
    ...pages.map((page) => [
      { v: page, s: 'text' },
      ...apps.flatMap((app) => NETWORKS.map((n) => xlsxCell(cellStat(model, app.id, page, n.id, stat)))),
    ]),
  ];
  if (!pages.length) compareRows.push([{ v: 'Aucune mesure enregistrée', s: 'muted' }]);
  sheets.push({
    name: 'Comparatif',
    rows: compareRows,
    cols: [Math.min(60, Math.max(18, ...pages.map((p) => p.length + 2))), ...apps.flatMap(() => [14, 14])],
    merges: apps.length ? merges : [],
    freeze: { rows: 5, cols: 1 },
  });

  // -- Une feuille par application
  for (const app of apps) {
    const rows = [
      [{ v: app.name, s: 'title' }],
      [{ v: `URL de base : ${(app.baseUrls || []).join(' · ')}`, s: 'muted' }],
      [{ v: `${subtitle}. ${LEGEND}`, s: 'muted' }],
      [
        { v: 'Page', s: 'headerLeft' },
        { v: 'WiFi (ms)', s: 'header' },
        { v: 'Ethernet (ms)', s: 'header' },
        { v: 'Écart WiFi − Ethernet (ms)', s: 'header' },
        { v: 'Écart (%)', s: 'header' },
        { v: 'Nb mesures WiFi', s: 'header' },
        { v: 'Nb mesures Ethernet', s: 'header' },
      ],
    ];
    for (const page of pages) {
      const wifi = cellStat(model, app.id, page, 'wifi', stat);
      const eth = cellStat(model, app.id, page, 'ethernet', stat);
      const both = wifi.status === 'ok' && eth.status === 'ok';
      rows.push([
        { v: page, s: 'text' },
        xlsxCell(wifi),
        xlsxCell(eth),
        both ? { v: wifi.value - eth.value, s: 'num' } : { v: '', s: 'text' },
        both && eth.value > 0 ? { v: (wifi.value - eth.value) / eth.value, s: 'pct' } : { v: '', s: 'text' },
        { v: wifi.count, s: 'num' },
        { v: eth.count, s: 'num' },
      ]);
    }
    sheets.push({
      name: app.name,
      rows,
      cols: [Math.min(60, Math.max(18, ...pages.map((p) => p.length + 2))), 13, 13, 16, 11, 12, 12],
      freeze: { rows: 4, cols: 1 },
    });
  }

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
    cols: [20, 18, 30, 10, 11, 24, 24, 9, 60],
    freeze: { rows: 1 },
    autoFilter: `A1:I${raw.length}`,
  });

  return sheets;
}

/** CSV du comparatif (séparateur « ; » pour Excel en français). */
export function buildCsv(model, stat) {
  const q = (v) => {
    const s = String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = ['Page', ...model.apps.flatMap((a) => NETWORKS.map((n) => `${a.name} - ${n.label} (ms)`))];
  const lines = [header.map(q).join(';')];
  for (const page of model.pages) {
    const values = model.apps.flatMap((a) =>
      NETWORKS.map((n) => {
        const cs = cellStat(model, a.id, page, n.id, stat);
        return cs.status === 'ok' ? cs.value : cs.status === 'timeout' ? TIMEOUT_TEXT : MISSING_TEXT;
      }),
    );
    lines.push([page, ...values].map(q).join(';'));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
