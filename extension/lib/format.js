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
