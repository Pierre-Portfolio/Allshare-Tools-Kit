// Téléchargement des exports depuis les pages de l'extension (popup, rapport, réglages).

import { getConfig, getMeasures } from './storage.js';
import { buildModel, buildSheets, buildCsv } from './report.js';
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
  const { apps, settings, pages } = await getConfig();
  const measures = await getMeasures();
  return { model: buildModel(measures, apps, settings, pages), settings, measures, apps, pages };
}

export async function exportXlsx(stat) {
  const { model, settings } = await loadModel();
  const now = new Date();
  const bytes = buildXlsx(buildSheets(model, stat || settings.stat, now), now);
  downloadBlob(
    bytes,
    `insigth-temps-reponse-${fileStamp(now)}.xlsx`,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

export async function exportCsv(stat) {
  const { model, settings } = await loadModel();
  downloadBlob(
    buildCsv(model, stat || settings.stat),
    `insigth-comparatif-${fileStamp()}.csv`,
    'text/csv;charset=utf-8',
  );
}
