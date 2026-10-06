// Téléchargement des exports depuis les pages de l'extension.

import { getConfig, getMeasures } from './storage.js';
import { buildModel, buildGlobalSheets, buildPageSheets, buildAppSheets } from './report.js';
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

function save(sheets, name, date) {
  downloadBlob(
    buildXlsx(sheets, date),
    `insigth-${name}-${fileStamp(date)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

/** Export n°1 : toutes les applications × toutes les pages. */
export async function exportAll(stat) {
  const { model, settings } = await loadModel();
  const now = new Date();
  save(buildGlobalSheets(model, stat || settings.stat, settings, now), 'tout', now);
}

/** Export n°2 : une page, tous les clients. */
export async function exportPage(page, stat) {
  const { model, settings } = await loadModel();
  const now = new Date();
  save(buildPageSheets(model, page, stat || settings.stat, settings, now), `page-${slug(page)}`, now);
}

/** Export n°3 : un client, toutes les pages. */
export async function exportApp(app, stat) {
  const { model, settings } = await loadModel();
  const now = new Date();
  save(buildAppSheets(model, app, stat || settings.stat, settings, now), `client-${slug(app)}`, now);
}
