// Libellés et formats d'affichage partagés.

export const NETWORKS = [
  { id: 'ethernet', label: 'Ethernet' },
  { id: 'wifi', label: 'WiFi' },
];

export const NETWORK_LABELS = { ethernet: 'Ethernet', wifi: 'WiFi' };

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
const fixed = (digits) =>
  new Intl.NumberFormat('fr-FR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
const SECONDS = { 2: fixed(2), 3: fixed(3) };

/** Unité d'affichage des durées (Réglages et tableau de bord) : secondes par défaut. */
export const UNITS = { s: 'Secondes', ms: 'Millisecondes' };
export const unitOf = (settings) => (settings && settings.unit === 'ms' ? 'ms' : 's');

/** Durée sans unité : « 1,23 » en secondes (2 décimales, 3 pour le détail), « 1 234 » en ms. */
export function fmtNum(ms, unit = 's', digits = 2) {
  return unit === 'ms' ? nf.format(ms) : (SECONDS[digits] || SECONDS[2]).format(ms / 1000);
}

/** Durée avec son unité : « 1,23 s » ou « 1 234 ms ». */
export function fmtDuration(ms, unit = 's', digits = 2) {
  return `${fmtNum(ms, unit, digits)} ${unit === 'ms' ? 'ms' : 's'}`;
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
 * Compteur de l'accueil sous Insight : « 3 clients et 10 pages sauvegardés »,
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
