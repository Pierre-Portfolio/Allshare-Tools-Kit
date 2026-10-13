// Analyse de la donnée (panneau latéral) : sous-menu de l'accueil qui réunit Prisme et Last connection Users,
// avec le compteur de chacun.
import { getFiles, prismeCountText } from '../lib/prisme-files.js';
import { getLastConnection, lastConnectionCountText } from '../lib/last-connection.js';

async function renderCounts() {
  const [files, lastConnection] = await Promise.all([getFiles(), getLastConnection()]);
  document.getElementById('prismeCount').textContent = prismeCountText(files);
  document.getElementById('lastConnectionCount').textContent = lastConnectionCountText(lastConnection);
}

renderCounts();
