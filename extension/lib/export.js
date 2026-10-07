// Téléchargement des exports depuis les pages de l'extension.

import { getConfig, getMeasures, getDetails } from './storage.js';
import {
  buildModel,
  buildGlobalSheets,
  buildPageSheets,
  buildClientSheets,
  buildDetailSheets,
  measuresCsv,
  detailCsv,
  scopeRows,
} from './report.js';
import { buildXlsxCompressed } from './xlsx.js';
import { fileStamp, unitOf } from './format.js';
import { downloadBlob } from './dom.js';

export async function loadModel() {
  const { apps, pages, settings, draft } = await getConfig();
  const measures = await getMeasures();
  return { model: buildModel(measures, apps, pages), settings, measures, apps, pages, draft };
}

const slug = (s) =>
  String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'export';

/** Modèle dont les mesures de `rows` ont leur détail des temps (rangé à part, lu seulement ici). */
async function withDetails(model, rows) {
  const details = await getDetails(rows.map((m) => m.id));
  return { ...model, rows: model.rows.map((m) => (details[m.id] ? { ...m, detail: details[m.id] } : m)) };
}

/**
 * Export à la demande.
 * @param {{type: 'all'|'page'|'client'|'detail', page?: string, client?: string,
 *          format: 'xlsx'|'csv', fullUrl?: boolean, urlEnd?: boolean, stat?: string,
 *          unit?: 's'|'ms'}} req  unité des durées : celle des réglages par défaut
 * @param {{model: object, settings: object}} [loaded]  modèle déjà chargé (tableau de bord) : pas relu
 */
export async function exportData(req, loaded = null) {
  const { model: base, settings } = loaded || (await loadModel());
  const model = req.type === 'detail' ? await withDetails(base, scopeRows(base, req)) : base;
  const stat = req.stat || settings.stat;
  const options = { fullUrl: !!req.fullUrl, urlEnd: !!req.urlEnd, unit: req.unit || unitOf(settings) };
  const now = new Date();
  const name =
    req.type === 'page'
      ? `page-${slug(req.page)}`
      : req.type === 'client'
        ? `client-${slug(req.client)}`
        : req.type === 'detail'
          ? `detail-${slug(req.page)}`
          : 'tout';

  if (req.format === 'csv') {
    const csv =
      req.type === 'detail' ? detailCsv(model, req.page, options) : measuresCsv(scopeRows(model, req), options);
    downloadBlob(csv, `insight-${name}-${fileStamp(now)}.csv`, 'text/csv;charset=utf-8');
    return;
  }
  const sheets =
    req.type === 'page'
      ? buildPageSheets(model, req.page, stat, settings, now, options)
      : req.type === 'client'
        ? buildClientSheets(model, req.client, stat, settings, now, options)
        : req.type === 'detail'
          ? buildDetailSheets(model, req.page, now, options)
          : buildGlobalSheets(model, stat, settings, now, options);
  downloadBlob(
    await buildXlsxCompressed(sheets, now),
    `insight-${name}-${fileStamp(now)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
