// Sauvegarde complète d'Allshare Tools Kit (accueil « Quels outils ? ») : un fichier JSON avec toutes
// les données de l'extension, pour les garder avant de supprimer ou de mettre à jour l'extension,
// ou pour les passer sur un autre poste.
//
// Fichier « allshare-tools-kit » :
//   storage         tout chrome.storage.local : mesures (et leur détail des temps), référentiels et réglages d'Insight, sessions
//                   de Capsule, fichiers récents et réglages de Prisme, progression de Training, réglages de CRA
//                   (les clés ajoutées par une version future sont reprises telles quelles)
//   prismeContents  contenu des fichiers récents de Prisme (IndexedDB), en base64 : { [id]: '…' }
//   localStorage    préférences de l'extension rangées dans le navigateur (thème de Training)
//
// L'import fusionne : rien n'est effacé sur le poste, une donnée déjà présente est ignorée
// (réimporter le même fichier ne crée pas de doublon) et les réglages du fichier sont repris.

import { DETAIL_PREFIX, DEFAULT_SETTINGS, mergeInsight, measureItems, isMeasureKey, isDetailKey } from './storage.js';
import { mergeProgress, normalize } from './training.js';
import { MAX_FILES, DEFAULT_PRISME_SETTINGS, getFileBytes, putFileBytes, deleteFileBytes } from './prisme-files.js';
import { closeSpans, isSavable } from './capsule.js';
import { DEFAULT_CRA } from './cra.js';

export const BACKUP_FORMAT = 'allshare-tools-kit';

/** Réglages : les valeurs du fichier remplacent celles du poste, une à une. */
const SETTINGS_KEYS = ['settings', 'prismeSettings', 'craSettings', 'draft'];
/** Données fusionnées une à une (les autres clés ne sont reprises que si le poste ne les a pas). */
const MERGED_KEYS = ['apps', 'pages', 'capsules', 'prismeFiles', 'training', ...SETTINGS_KEYS];
/** Propres au poste qui a fait la sauvegarde : jamais reprises. */
const LOCAL_KEYS = ['capsuleAlive'];
/** Valeurs par défaut des réglages : une valeur du fichier d'un autre type est ignorée. */
const SETTINGS_DEFAULTS = {
  settings: DEFAULT_SETTINGS,
  prismeSettings: DEFAULT_PRISME_SETTINGS,
  craSettings: DEFAULT_CRA,
  draft: { app: '', sid: '', version: '', page: '', specific: false },
};

const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const list = (v) => (Array.isArray(v) ? v : []);
const measuresOf = (storage) =>
  Object.keys(storage)
    .filter(isMeasureKey)
    .map((k) => storage[k]);
const answersOf = (training) => {
  const p = normalize(training);
  return Object.keys(p.qcm).length + Object.keys(p.open).length;
};

/** Réglages du fichier dont le type est celui attendu (les clés d'une version future sont reprises). */
function validSettings(values, defaults) {
  return Object.fromEntries(
    Object.entries(values).filter(([key, v]) => {
      if (!(key in defaults)) return true;
      const type = typeof defaults[key];
      return typeof v === type && (type !== 'number' || Number.isFinite(v));
    }),
  );
}

/**
 * Sessions Capsule d'une sauvegarde : seules les adresses rouvrables sont gardées, et une période
 * d'ouverture encore en cours ne continue que si sa fenêtre est ouverte sur ce poste (sinon elle se
 * termine à la date de la sauvegarde) : les fenêtres d'un autre poste ne se fermeront jamais ici.
 */
function importedCapsules(capsules, isOpen, closedAt) {
  const clean = capsules.map((c) => ({
    ...c,
    tabs: c.tabs.filter((t) => t && typeof t.url === 'string' && isSavable(t.url)),
  }));
  return closeSpans(clean, isOpen, closedAt) || clean;
}

// ---------------------------------------------------------------- Base64

export function toBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function fromBase64(text) {
  const bin = atob(text);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// ---------------------------------------------------------------- Fichier

/**
 * Contenu du fichier de sauvegarde.
 * @param {object} storage          chrome.storage.local en entier
 * @param {object} prismeContents   { [id du fichier Prisme]: base64 }
 * @param {object} local            localStorage de l'extension { clé: valeur }
 */
export function buildBackup(storage, prismeContents = {}, local = {}, appVersion = '', date = new Date()) {
  return {
    format: BACKUP_FORMAT,
    version: 1,
    appVersion,
    exportedAt: date.toISOString(),
    storage,
    prismeContents,
    localStorage: local,
  };
}

/** Lit un fichier de sauvegarde ; lève une erreur si ce n'en est pas un. */
export function readBackup(data) {
  if (!isObject(data) || data.format !== BACKUP_FORMAT || !isObject(data.storage)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Allshare Tools Kit.");
  }
  const strings = (o) =>
    isObject(o) ? Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'string')) : {};
  return {
    storage: data.storage,
    prismeContents: strings(data.prismeContents),
    localStorage: strings(data.localStorage),
    exportedAt: data.exportedAt || '',
  };
}

/** Ce que contient une sauvegarde (ou ce qu'un import a ajouté). */
export function backupCounts(storage, prismeContents = {}) {
  return {
    measures: measuresOf(storage).length,
    capsules: list(storage.capsules).length,
    files: list(storage.prismeFiles).filter((f) => f && prismeContents[f.id]).length,
    answers: answersOf(storage.training),
  };
}

const nf = new Intl.NumberFormat('fr-FR');
const count = (n, one, many) => `${nf.format(n)} ${n > 1 ? many : one}`;

/** « 120 mesures, 3 sessions Capsule, 1 fichier Prisme, 5 réponses Training » (vide s'il n'y a rien). */
export function describeCounts({ measures = 0, capsules = 0, files = 0, answers = 0 }) {
  const parts = [];
  if (measures) parts.push(count(measures, 'mesure Insight', 'mesures Insight'));
  if (capsules) parts.push(count(capsules, 'session Capsule', 'sessions Capsule'));
  if (files) parts.push(count(files, 'fichier Prisme', 'fichiers Prisme'));
  if (answers) parts.push(count(answers, 'réponse Training', 'réponses Training'));
  return parts.join(', ');
}

// ---------------------------------------------------------------- Fusion

/**
 * Fusion d'une sauvegarde avec les données du poste. Fonction pure.
 *  - Insight : clients et pages reconnus par leur nom, mesures par identifiant (voir mergeInsight) ;
 *  - Capsule : sessions ajoutées si absentes (identifiant), après celles du poste, dans l'ordre du fichier
 *    (l'ordre choisi par glisser-déposer est gardé) ;
 *  - Prisme : fichiers ajoutés si absents (identifiant ou même contenu), les MAX_FILES plus récents gardés ;
 *  - Training : réponses ajoutées, une réponse du poste est conservée (voir mergeProgress) ;
 *  - réglages (Insight, Prisme, CRA, formulaire) : ceux du fichier ;
 *  - autres clés : reprises si le poste ne les a pas.
 * @param {object} local     chrome.storage.local du poste
 * @param {object} incoming  storage de la sauvegarde
 * @param {object} prismeContents  contenus des fichiers Prisme de la sauvegarde (un fichier sans contenu est ignoré)
 * @param {{isOpen?: (windowId: number) => boolean, closedAt?: number}} windows
 *          fenêtres ouvertes sur ce poste, et date de la sauvegarde (fin des périodes d'ouverture d'un autre poste)
 * @returns {{set: object, putFiles: string[], dropFiles: string[], added: object}}
 *          clés à écrire, fichiers Prisme à écrire puis à oublier, nombre d'éléments ajoutés
 */
export function mergeBackup(
  local,
  incoming,
  prismeContents = {},
  { isOpen = () => false, closedAt = Date.now() } = {},
) {
  const set = {};

  const insight = mergeInsight(
    { apps: list(local.apps), pages: list(local.pages), measures: measuresOf(local) },
    { apps: list(incoming.apps), pages: list(incoming.pages), measures: measuresOf(incoming) },
  );
  set.apps = insight.apps;
  set.pages = insight.pages;
  // Détail des temps : clé d_ de la sauvegarde, ou dans la mesure (sauvegardes d'avant la version 3.13)
  Object.assign(
    set,
    measureItems(insight.measures.map((m) => ({ ...m, detail: m.detail || incoming[DETAIL_PREFIX + m.id] }))),
  );

  const localCaps = list(local.capsules);
  const capIds = new Set(localCaps.map((c) => c && c.id));
  const newCaps = list(incoming.capsules).filter((c) => c && c.id && !capIds.has(c.id) && Array.isArray(c.tabs));
  if (newCaps.length) set.capsules = [...localCaps, ...importedCapsules(newCaps, isOpen, closedAt)];

  const localFiles = list(local.prismeFiles);
  const known = (f) =>
    localFiles.some((l) => l.id === f.id || (l.hash === f.hash && l.name === f.name && l.size === f.size));
  const newFiles = list(incoming.prismeFiles).filter((f) => f && f.id && prismeContents[f.id] && !known(f));
  let putFiles = [];
  let dropFiles = [];
  if (newFiles.length) {
    const all = [...localFiles, ...newFiles].sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const kept = all.slice(0, MAX_FILES);
    set.prismeFiles = kept;
    putFiles = newFiles.filter((f) => kept.includes(f)).map((f) => f.id);
    dropFiles = all
      .slice(MAX_FILES)
      .filter((f) => localFiles.includes(f))
      .map((f) => f.id);
  }

  let answers = 0;
  if (incoming.training) {
    set.training = mergeProgress(local.training, incoming.training);
    answers = answersOf(set.training) - answersOf(local.training);
  }

  for (const key of SETTINGS_KEYS) {
    if (isObject(incoming[key])) {
      set[key] = {
        ...(isObject(local[key]) ? local[key] : {}),
        ...validSettings(incoming[key], SETTINGS_DEFAULTS[key]),
      };
    }
  }

  for (const [key, value] of Object.entries(incoming)) {
    if (MERGED_KEYS.includes(key) || LOCAL_KEYS.includes(key) || key in local) continue;
    if (isMeasureKey(key) || isDetailKey(key)) continue; // mesures : voir plus haut
    // Pages allshare-scenario.fr du jour : temps repris, mais aucun onglet de l'autre poste n'est ouvert ici
    set[key] = key === 'craPages' && isObject(value) ? { ...value, open: [] } : value;
  }

  return {
    set,
    putFiles,
    dropFiles,
    added: { measures: insight.measures.length, capsules: newCaps.length, files: putFiles.length, answers },
  };
}

// ---------------------------------------------------------------- Navigateur

function readLocalStorage() {
  const out = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      out[key] = localStorage.getItem(key);
    }
  } catch {
    /* stockage du navigateur indisponible : seules les préférences sont perdues */
  }
  return out;
}

/** Sauvegarde complète du poste. @returns {Promise<{backup: object, counts: object}>} */
export async function exportAll(date = new Date()) {
  const storage = await chrome.storage.local.get(null);
  const prismeContents = {};
  for (const f of list(storage.prismeFiles)) {
    const bytes = await getFileBytes(f.id).catch(() => null);
    if (bytes) prismeContents[f.id] = toBase64(bytes);
  }
  const backup = buildBackup(storage, prismeContents, readLocalStorage(), chrome.runtime.getManifest().version, date);
  return { backup, counts: backupCounts(storage, prismeContents) };
}

/** Importe une sauvegarde complète par fusion. @returns {Promise<object>} éléments ajoutés */
export async function importAll(data) {
  const backup = readBackup(data);
  const local = await chrome.storage.local.get(null);
  const windows = new Set((await chrome.windows.getAll()).map((w) => w.id));
  const exportedAt = Date.parse(backup.exportedAt);
  const plan = mergeBackup(local, backup.storage, backup.prismeContents, {
    isOpen: (id) => windows.has(id),
    closedAt: Number.isFinite(exportedAt) ? Math.min(exportedAt, Date.now()) : Date.now(),
  });
  // Contenus d'abord : un fichier récent de Prisme a toujours ses octets
  for (const id of plan.putFiles) await putFileBytes(id, fromBase64(backup.prismeContents[id]));
  await chrome.storage.local.set(plan.set);
  for (const id of plan.dropFiles) await deleteFileBytes(id).catch(() => {});
  for (const [key, value] of Object.entries(backup.localStorage)) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* préférence non reprise */
    }
  }
  return plan.added;
}
