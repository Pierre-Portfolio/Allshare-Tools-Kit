// Accueil du panneau latéral : « Quels outils ? » (Capsule, Insigth, Prisme).
// Affiché à chaque ouverture du panneau, sauf pendant une mesure Insigth en cours.
import { getCapsules } from '../lib/capsule.js';
import { getFiles } from '../lib/prisme-files.js';
import { getConfig, getMeasures } from '../lib/storage.js';
import { buildModel } from '../lib/report.js';
import { savedText } from '../lib/format.js';

const ACTIVE = ['armed', 'measuring', 'rearming'];
const chosen = new URLSearchParams(location.search).has('choose'); // retour volontaire depuis un outil
const isActive = (s) => !!(s && ACTIVE.includes(s.state));

async function init() {
  const { session, panelTool } = await chrome.storage.session.get(['session', 'panelTool']);
  if (panelTool) {
    // Panneau ouvert par le raccourci clavier d'Insigth (formulaire incomplet)
    await chrome.storage.session.remove('panelTool');
    return location.replace('panel.html');
  }
  if (!chosen && isActive(session)) return location.replace('panel.html');
  const [capsules, { apps, pages }, measures, files] = await Promise.all([
    getCapsules(),
    getConfig(),
    getMeasures(),
    getFiles(),
  ]);
  const n = capsules.length;
  document.getElementById('capsuleCount').textContent = n
    ? `${n} session${n > 1 ? 's' : ''} sauvegardée${n > 1 ? 's' : ''}`
    : '';
  // Clients et pages d'Insigth : référentiel (Réglages) et mesures, sans doublon
  const model = buildModel(measures, apps, pages);
  document.getElementById('insigthCount').textContent = savedText(model.clients.length, model.allPages.length);
  const f = files.length;
  document.getElementById('prismeCount').textContent = f
    ? `${f} fichier${f > 1 ? 's' : ''} récent${f > 1 ? 's' : ''}`
    : '';
}

// Mesure lancée au raccourci clavier pendant que l'accueil est affiché : on passe sur Insigth.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'session' && changes.session && !isActive(changes.session.oldValue)) {
    if (isActive(changes.session.newValue)) location.replace('panel.html');
  }
});

init();
