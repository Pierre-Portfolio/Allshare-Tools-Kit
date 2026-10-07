// Accueil du panneau latéral d'Allshare Tools Kit : « Quels outils ? » (Capsule, Insight, Prisme, Training).
// Affiché à chaque ouverture du panneau, sauf pendant une mesure Insight en cours.
// En bas : « Mes données », export et import de toutes les données de l'extension (lib/backup.js).
import { getCapsules } from '../lib/capsule.js';
import { getFiles } from '../lib/prisme-files.js';
import { getConfig, getMeasures } from '../lib/storage.js';
import { buildModel } from '../lib/report.js';
import { savedText, fileStamp } from '../lib/format.js';
import { getProgress, trainingCountText } from '../lib/training.js';
import { exportAll, importAll, describeCounts } from '../lib/backup.js';
import { downloadBlob } from '../lib/export.js';

const ACTIVE = ['armed', 'measuring', 'rearming'];
const chosen = new URLSearchParams(location.search).has('choose'); // retour volontaire depuis un outil
const isActive = (s) => !!(s && ACTIVE.includes(s.state));

async function init() {
  const { session, panelTool } = await chrome.storage.session.get(['session', 'panelTool']);
  if (panelTool) {
    // Panneau ouvert par le raccourci clavier d'Insight (formulaire incomplet)
    await chrome.storage.session.remove('panelTool');
    return location.replace('panel.html');
  }
  if (!chosen && isActive(session)) return location.replace('panel.html');
  await renderCounts();
}

async function renderCounts() {
  const [capsules, { apps, pages }, measures, files, progress] = await Promise.all([
    getCapsules(),
    getConfig(),
    getMeasures(),
    getFiles(),
    getProgress(),
  ]);
  document.getElementById('trainingCount').textContent = trainingCountText(progress);
  const n = capsules.length;
  document.getElementById('capsuleCount').textContent = n
    ? `${n} session${n > 1 ? 's' : ''} sauvegardée${n > 1 ? 's' : ''}`
    : '';
  // Clients et pages d'Insight : référentiel (Réglages) et mesures, sans doublon
  const model = buildModel(measures, apps, pages);
  document.getElementById('insightCount').textContent = savedText(model.clients.length, model.allPages.length);
  const f = files.length;
  document.getElementById('prismeCount').textContent = f
    ? `${f} fichier${f > 1 ? 's' : ''} récent${f > 1 ? 's' : ''}`
    : '';
}

// ---------------------------------------------------------------- Mes données

function status(text, error = false) {
  const s = document.getElementById('dataStatus');
  s.textContent = text;
  s.classList.toggle('error', error);
}

document.getElementById('exportAll').addEventListener('click', async () => {
  try {
    const { backup, counts } = await exportAll();
    downloadBlob(JSON.stringify(backup), `allshare-tools-kit-donnees-${fileStamp()}.json`, 'application/json');
    const what = describeCounts(counts);
    status(
      what ? `Fichier téléchargé : ${what} et les réglages.` : 'Fichier téléchargé : les réglages (aucune donnée).',
    );
  } catch (err) {
    status(err.message || 'Export impossible.', true);
  }
});

const importFile = document.getElementById('importAllFile');
document.getElementById('importAll').addEventListener('click', () => importFile.click());
importFile.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const what = describeCounts(await importAll(JSON.parse(await file.text())));
    status(what ? `Données importées : ${what}.` : 'Rien de nouveau : ces données sont déjà sur ce poste.');
    await renderCounts();
  } catch (err) {
    status(
      err instanceof SyntaxError ? "Ce fichier n'est pas un JSON valide." : err.message || 'Import impossible.',
      true,
    );
  }
});

// Mesure lancée au raccourci clavier pendant que l'accueil est affiché : on passe sur Insight.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.session && !isActive(changes.session.oldValue)) {
    if (isActive(changes.session.newValue)) location.replace('panel.html');
  }
});

init();
