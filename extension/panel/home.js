// Accueil du panneau latéral d'Allshare Tools Kit : « Quels outils ? » (Training, Capsule, Insight, Prisme).
// Affiché à chaque ouverture du panneau, sauf pendant une mesure Insight en cours.
import { getCapsules } from '../lib/capsule.js';
import { getFiles } from '../lib/prisme-files.js';
import { getConfig, getMeasures } from '../lib/storage.js';
import { buildModel } from '../lib/report.js';
import { savedText } from '../lib/format.js';
import { getProgress, trainingCountText } from '../lib/training.js';

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

// Mesure lancée au raccourci clavier pendant que l'accueil est affiché : on passe sur Insight.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.session && !isActive(changes.session.oldValue)) {
    if (isActive(changes.session.newValue)) location.replace('panel.html');
  }
});

init();
