// Capsule : sauvegarde des onglets de la fenêtre Chrome en cours, puis réouverture.
//
// chrome.storage.local
//   capsules  sessions sauvegardées, la plus récente en premier :
//             [{ id, ts, title, client, comment, tabs: [{ url, title, win, pinned }] }]
//             (client : facultatif, nom d'un client d'Insigth ou saisi librement)
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

/** Clients proposés : ceux d'Insigth (référentiel et mesures), sans doublon, triés. */
export function clientNames(apps, measures) {
  const names = new Map();
  for (const name of [...apps.map((a) => a.name), ...measures.map((m) => m.app)]) {
    const n = normName(name);
    if (n && !names.has(nameKey(n))) names.set(nameKey(n), n);
  }
  return [...names.values()].sort(compareNames);
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
