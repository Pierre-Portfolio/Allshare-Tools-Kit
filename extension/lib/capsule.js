// Capsule : sauvegarde des onglets de la fenêtre Chrome en cours, puis réouverture.
//
// chrome.storage.local
//   capsules  sessions sauvegardées, dans l'ordre d'affichage (une nouvelle session arrive en tête,
//             l'ordre se change ensuite par glisser-déposer) :
//             [{ id, ts, title, client, comment, done, tabs: [{ url, title, win, pinned }] }]
//             (client : facultatif, nom d'un client d'Insight ou saisi librement)
//             (done : session cochée, plus active : barrée dans la liste)
//             (win : numéro de la fenêtre d'origine, pour rouvrir fenêtre par fenêtre)

import { newId } from './storage.js';
import { normName, nameKey, compareNames } from './names.js';

/** Adresses que Chrome sait rouvrir (les pages internes chrome://, extensions… sont ignorées). */
export const isSavable = (url) => /^(https?|file):/i.test(String(url || ''));

/**
 * Onglets à sauvegarder, fenêtre par fenêtre (fenêtres de navigation privée exclues).
 * @param {chrome.windows.Window[]} windows  fenêtres avec leurs onglets (populate: true)
 */
export function snapshot(windows) {
  const tabs = [];
  let win = 0;
  for (const w of windows) {
    if (w.incognito) continue;
    const kept = (w.tabs || [])
      .map((t) => ({ url: t.url || t.pendingUrl, title: normName(t.title), pinned: !!t.pinned }))
      .filter((t) => isSavable(t.url));
    if (!kept.length) continue;
    for (const t of kept) tabs.push({ ...t, title: t.title || t.url, win });
    win++;
  }
  return tabs;
}

/** Onglets regroupés par fenêtre d'origine, dans l'ordre. */
export function byWindow(tabs) {
  const groups = new Map();
  for (const t of tabs) {
    if (!groups.has(t.win)) groups.set(t.win, []);
    groups.get(t.win).push(t);
  }
  return [...groups.values()];
}

/** « 12 onglets · 2 fenêtres ». */
export function describeTabs(tabs) {
  const n = tabs.length;
  const w = byWindow(tabs).length;
  return `${n} onglet${n > 1 ? 's' : ''}${w > 1 ? ` · ${w} fenêtres` : ''}`;
}

/** Clients proposés : ceux d'Insight (référentiel et mesures), sans doublon, triés. */
export function clientNames(apps, measures) {
  const names = new Map();
  for (const name of [...apps.map((a) => a.name), ...measures.map((m) => m.app)]) {
    const n = normName(name);
    if (n && !names.has(nameKey(n))) names.set(nameKey(n), n);
  }
  return [...names.values()].sort(compareNames);
}

/**
 * Adresse saisie pour ajouter une page : « exemple.fr/x » devient « https://exemple.fr/x ».
 * @returns {string} adresse complète, ou '' si elle ne peut pas être rouverte (chrome://, invalide…)
 */
export function toUrl(text) {
  const s = String(text || '').trim();
  if (!s) return '';
  try {
    const url = new URL(/^[a-z][\w+.-]*:\/\//i.test(s) ? s : `https://${s}`).href;
    return isSavable(url) ? url : '';
  } catch {
    return '';
  }
}

/**
 * Ajoute une page en fin de session, dans sa dernière fenêtre. Fonction pure.
 * @returns {object[]|null} nouveaux onglets, ou null si la page y est déjà
 */
export function addTab(tabs, { url, title, pinned }) {
  if (tabs.some((t) => t.url === url)) return null;
  const win = tabs.length ? tabs[tabs.length - 1].win : 0;
  return [...tabs, { url, title: normName(title) || url, pinned: !!pinned, win }];
}

/** Sessions affichées pour un filtre : 'all' (toutes), 'active' (non cochées) ou 'inactive' (cochées). */
export function filterCapsules(capsules, filter) {
  if (filter === 'active') return capsules.filter((c) => !c.done);
  if (filter === 'inactive') return capsules.filter((c) => c.done);
  return capsules;
}

/**
 * Déplace une session juste avant (ou après) une autre. Fonction pure.
 * @returns {object[]} nouvelle liste (la même si l'une des deux sessions est introuvable)
 */
export function reorder(capsules, id, targetId, after = false) {
  const moved = capsules.find((c) => c.id === id);
  if (!moved || id === targetId) return capsules;
  const rest = capsules.filter((c) => c.id !== id);
  const at = rest.findIndex((c) => c.id === targetId);
  if (at < 0) return capsules;
  rest.splice(after ? at + 1 : at, 0, moved);
  return rest;
}

/** Nom de domaine affiché sous le titre d'un onglet. */
export function host(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'file:' ? 'fichier local' : u.host;
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------- Navigateur

/** Onglet affiché dans la fenêtre du panneau, ou null s'il ne peut pas être sauvegardé (page interne…). */
export async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = t && (t.url || t.pendingUrl);
  return isSavable(url) ? { url, title: t.title, pinned: !!t.pinned } : null;
}

/** Onglets de la fenêtre où le panneau est ouvert (les autres fenêtres ne sont pas sauvegardées). */
export async function currentTabs() {
  return snapshot([await chrome.windows.getCurrent({ populate: true })]);
}

export async function getCapsules() {
  return (await chrome.storage.local.get('capsules')).capsules || [];
}

/** Enregistre des onglets (par défaut ceux ouverts) sous un titre ; client et commentaire facultatifs. */
export async function saveCapsule({ title, client, comment, tabs }) {
  const capsule = {
    id: newId(),
    ts: Date.now(),
    title: normName(title),
    client: normName(client),
    comment: String(comment || '').trim(),
    tabs: tabs || (await currentTabs()),
  };
  await chrome.storage.local.set({ capsules: [capsule, ...(await getCapsules())] });
  return capsule;
}

/** Modifie une session : { done } (cochée, plus active) ou { tabs } (page retirée ou ajoutée). */
export async function updateCapsule(id, patch) {
  const capsules = (await getCapsules()).map((c) => (c.id === id ? { ...c, ...patch } : c));
  await chrome.storage.local.set({ capsules });
}

/** Glisser-déposer : place la session `id` avant (ou après) la session `targetId`. */
export async function moveCapsule(id, targetId, after = false) {
  await chrome.storage.local.set({ capsules: reorder(await getCapsules(), id, targetId, after) });
}

export async function deleteCapsule(id) {
  await chrome.storage.local.set({ capsules: (await getCapsules()).filter((c) => c.id !== id) });
}

/**
 * Rouvre les onglets d'une session : une nouvelle fenêtre par fenêtre d'origine.
 * @returns {Promise<number>} nombre d'onglets rouverts (une adresse refusée par Chrome est sautée)
 */
export async function reopenCapsule(capsule) {
  let opened = 0;
  for (const group of byWindow(capsule.tabs)) {
    let windowId = null;
    for (const t of group) {
      try {
        if (windowId === null) {
          const w = await chrome.windows.create({ url: t.url, focused: true });
          windowId = w.id;
          if (t.pinned && w.tabs && w.tabs[0]) await chrome.tabs.update(w.tabs[0].id, { pinned: true });
        } else {
          await chrome.tabs.create({ windowId, url: t.url, pinned: t.pinned, active: false });
        }
        opened++;
      } catch {
        /* adresse refusée (ex. fichier local sans autorisation) */
      }
    }
  }
  return opened;
}
