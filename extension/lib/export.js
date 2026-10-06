// Téléchargement des exports depuis les pages de l'extension.

import { getConfig, getMeasures } from './storage.js';
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
import { buildXlsx } from './xlsx.js';
import { fileStamp } from './format.js';

export function downloadBlob(data, filename, type) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

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

/**
 * Export à la demande.
 * @param {{type: 'all'|'page'|'client'|'detail', page?: string, client?: string,
 *          format: 'xlsx'|'csv', fullUrl?: boolean, urlEnd?: boolean, stat?: string}} req
 */
export async function exportData(req) {
  const { model, settings } = await loadModel();
  const stat = req.stat || settings.stat;
  const options = { fullUrl: !!req.fullUrl, urlEnd: !!req.urlEnd };
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
    downloadBlob(csv, `insigth-${name}-${fileStamp(now)}.csv`, 'text/csv;charset=utf-8');
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
    buildXlsx(sheets, now),
    `insigth-${name}-${fileStamp(now)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}
