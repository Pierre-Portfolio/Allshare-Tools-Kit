// Prisme : fichiers récents et réglages, partagés entre le panneau et le tableau de bord.
//
// chrome.storage.local
//   prismeFiles     fichiers récents, le plus récent en premier :
//                   [{ id, name, size, ts, hash, summary: { encoding, delim, rows, cols, counts } }]
//   prismeSettings  { expected: 'ansi' | 'utf8', crlf: true, view: 'details' | 'raw' | 'excel' | 'text' }
// IndexedDB « prisme », magasin « files » : contenu de chaque fichier { id, bytes }
//   (hors de chrome.storage.local : les mesures d'Insight y sont relues en entier à chaque affichage)

import { newId, withLock } from './storage.js';
import { analyze, fingerprint, fmtSize, summarize } from './prisme.js';
import { downloadBlob } from './dom.js';
import { showExtensionPage } from './tabs.js';

export const MAX_FILES = 10;
/** Au-delà, l'analyse se fait dans un Web Worker : la page reste utilisable pendant ce temps. */
export const WORKER_MIN = 512 * 1024;
/** Au-delà, l'ouverture est confirmée : analyse longue, et le fichier est gardé dans les fichiers récents. */
export const LARGE_FILE = 20 * 1024 * 1024;
export const DEFAULT_PRISME_SETTINGS = { expected: 'ansi', crlf: true, view: 'details' };

// ---------------------------------------------------------------- Analyse

let worker = null;
let lastJob = 0;
const jobs = new Map();

function analysisWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./prisme-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = ({ data }) => {
    const job = jobs.get(data.id);
    jobs.delete(data.id);
    if (job) data.error ? job.reject(new Error(data.error)) : job.resolve(data.res);
  };
  worker.onerror = (e) => {
    for (const job of jobs.values()) job.reject(new Error(e.message || 'Analyse impossible'));
    jobs.clear();
    worker = null;
  };
  return worker;
}

/**
 * Analyse d'un fichier (voir analyze) : dans un Web Worker au-delà de WORKER_MIN, directement sinon
 * (ou si le Worker échoue). @returns {Promise<object>} résultat de analyze
 */
export function analyzeFile(bytes, options) {
  if (bytes.length < WORKER_MIN || typeof Worker !== 'function') return Promise.resolve(analyze(bytes, options));
  return new Promise((resolve, reject) => {
    const id = ++lastJob;
    jobs.set(id, { resolve, reject });
    analysisWorker().postMessage({ id, bytes, options });
  }).catch(() => analyze(bytes, options));
}

/** Gros fichier : l'utilisateur confirme l'ouverture. */
export const confirmLarge = (bytes, name) =>
  bytes.length <= LARGE_FILE ||
  confirm(`« ${name} » pèse ${fmtSize(bytes.length)} : son analyse peut prendre un moment. L'ouvrir quand même ?`);

// ---------------------------------------------------------------- Réglages

export async function getPrismeSettings() {
  const { prismeSettings } = await chrome.storage.local.get('prismeSettings');
  return { ...DEFAULT_PRISME_SETTINGS, ...prismeSettings };
}

export function savePrismeSettings(patch) {
  return withLock('prismeSettings', async () => {
    const next = { ...(await getPrismeSettings()), ...patch };
    await chrome.storage.local.set({ prismeSettings: next });
    return next;
  });
}

// ---------------------------------------------------------------- Contenu (IndexedDB)

let dbPromise = null;

function db() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('prisme', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('files', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(mode, fn) {
  const store = (await db()).transaction('files', mode).objectStore('files');
  return new Promise((resolve, reject) => {
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Octets d'un fichier récent (null s'il n'existe plus). */
export async function getFileBytes(id) {
  const row = await tx('readonly', (s) => s.get(id));
  return row ? new Uint8Array(row.bytes) : null;
}

/** Enregistre ou oublie les octets d'un fichier (sauvegarde complète d'Allshare Tools Kit). */
export const putFileBytes = (id, bytes) => tx('readwrite', (s) => s.put({ id, bytes }));
export const deleteFileBytes = (id) => tx('readwrite', (s) => s.delete(id));

// ---------------------------------------------------------------- Fichiers récents

export async function getFiles() {
  return (await chrome.storage.local.get('prismeFiles')).prismeFiles || [];
}

/**
 * Ajoute un fichier analysé en tête des fichiers récents (un fichier identique déjà ouvert
 * remonte simplement en tête). Au-delà de MAX_FILES, les plus anciens sont oubliés.
 * @returns {Promise<object>} l'entrée enregistrée
 */
export function addFile(name, bytes, res) {
  return withLock('prismeFiles', () => addFileUnlocked(name, bytes, res));
}

async function addFileUnlocked(name, bytes, res) {
  const files = await getFiles();
  const hash = fingerprint(bytes);
  const same = files.find((f) => f.hash === hash && f.name === name && f.size === bytes.length);
  const entry = {
    id: same ? same.id : newId(),
    name,
    size: bytes.length,
    ts: Date.now(),
    hash,
    summary: summarize(res),
  };
  if (!same) await tx('readwrite', (s) => s.put({ id: entry.id, bytes }));
  const kept = [entry, ...files.filter((f) => f.id !== entry.id)];
  for (const old of kept.splice(MAX_FILES)) await tx('readwrite', (s) => s.delete(old.id));
  await chrome.storage.local.set({ prismeFiles: kept });
  return entry;
}

/** Remet un fichier en tête (fichier en cours), avec son résumé recalculé si fourni. */
export function touchFile(id, res) {
  return withLock('prismeFiles', async () => {
    const files = await getFiles();
    const f = files.find((x) => x.id === id);
    if (!f) return null;
    const entry = { ...f, ts: Date.now(), ...(res ? { summary: summarize(res) } : {}) };
    await chrome.storage.local.set({ prismeFiles: [entry, ...files.filter((x) => x.id !== id)] });
    return entry;
  });
}

/** Met à jour le résumé d'un fichier sans changer l'ordre (ex. encodage attendu modifié). */
export function updateSummary(id, res) {
  return withLock('prismeFiles', async () => {
    const files = await getFiles();
    if (!files.some((f) => f.id === id)) return;
    await chrome.storage.local.set({
      prismeFiles: files.map((f) => (f.id === id ? { ...f, summary: summarize(res) } : f)),
    });
  });
}

export function deleteFile(id) {
  return withLock('prismeFiles', async () => {
    await tx('readwrite', (s) => s.delete(id));
    await chrome.storage.local.set({ prismeFiles: (await getFiles()).filter((f) => f.id !== id) });
  });
}

// ---------------------------------------------------------------- Navigateur

/** Lit un fichier choisi ou déposé. */
export const readFile = async (file) => new Uint8Array(await file.arrayBuffer());

/** Télécharge des octets sous un nom de fichier. */
export const download = (bytes, name, type = 'text/csv') => downloadBlob(bytes, name, type);

/**
 * Ouvre le tableau de bord sur un fichier (et, au besoin, sur une anomalie) : réutilise l'onglet
 * du tableau de bord s'il est déjà ouvert, sinon en ouvre un nouveau.
 */
export function openDashboard(id, issue) {
  const base = chrome.runtime.getURL('prisme/prisme.html');
  const params = new URLSearchParams();
  if (id) params.set('id', id);
  if (issue) params.set('issue', issue);
  return showExtensionPage(base, params.size ? `${base}?${params}` : base);
}
