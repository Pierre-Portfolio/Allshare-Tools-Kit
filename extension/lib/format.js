// Libellés et formats d'affichage partagés.

export const NETWORKS = [
  { id: 'wifi', label: 'WiFi' },
  { id: 'ethernet', label: 'Ethernet' },
];

export const NETWORK_LABELS = { wifi: 'WiFi', ethernet: 'Ethernet' };

export const STATS = {
  avg: 'Moyenne',
  median: 'Médiane',
  min: 'Minimum',
  max: 'Maximum',
  last: 'Dernière mesure',
};

export const KIND_LABELS = {
  load: 'Chargement complet',
  spa: 'Navigation interne (SPA)',
};

export const TRIGGER_LABELS = {
  click: 'Clic',
  navigate: 'Navigation (URL, favori…)',
  reload: 'Rechargement (F5)',
};

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });

export function fmtMs(ms) {
  return `${nf.format(ms)} ms`;
}

const pad = (n) => String(n).padStart(2, '0');

/** Date locale « AAAA-MM-JJ HH:MM:SS » (triable, lisible dans Excel). */
export function fmtDate(ts) {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

/** Horodatage pour les noms de fichiers : « 20261005-2155 ». */
export function fileStamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

/**
 * Compteur de l'accueil sous Insigth : « 3 clients et 10 pages sauvegardés »,
 * « 1 page sauvegardée », chaîne vide s'il n'y a rien.
 */
export function savedText(clients, pages) {
  const parts = [];
  if (clients) parts.push(`${nf.format(clients)} client${clients > 1 ? 's' : ''}`);
  if (pages) parts.push(`${nf.format(pages)} page${pages > 1 ? 's' : ''}`);
  if (!parts.length) return '';
  const plural = clients + pages > 1 ? 's' : '';
  const feminine = clients ? '' : 'e'; // accord au masculin dès qu'il y a un client
  return `${parts.join(' et ')} sauvegardé${feminine}${plural}`;
}
