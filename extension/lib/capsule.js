// Capsule : sauvegarde des onglets de la fenêtre Chrome en cours, puis réouverture.
//
// chrome.storage.local
//   capsules  sessions sauvegardées, dans l'ordre d'affichage (une nouvelle session arrive en tête,
//             l'ordre se change ensuite par glisser-déposer) :
//             [{ id, ts, title, client, comment, done, opens, spans, tabs: [{ url, title, win, pinned }] }]
//             (client : facultatif, nom d'un client d'Insight ou saisi librement)
//             (done : session cochée, plus active : barrée dans la liste, rangée après les sessions actives)
//             (opens : instants des réouvertures, les MAX_OPENS dernières : capsules du jour dans CRA)
//             (spans : périodes d'ouverture [{ from, to, wins }], de la sauvegarde ou d'une réouverture jusqu'à
//              la fermeture de ses fenêtres Chrome ; tant que la période dure, pas de `to` et `wins` liste les
//              fenêtres encore ouvertes ; temps d'ouverture affiché dans CRA, fin notée par background.js)
//             (win : numéro de la fenêtre d'origine, pour rouvrir fenêtre par fenêtre)
//   capsuleAlive  dernier instant où Chrome tournait avec une capsule (ou un client allshare-scenario.fr) ouvert,
//                 relevé chaque minute : fin des périodes restées ouvertes quand Chrome a été quitté

import { newId, withLock } from './storage.js';
import { normName, nameKey, compareNames } from './names.js';

export const MAX_OPENS = 100;

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

/** Texte comparé sans accents ni majuscules. */
const fold = (s) =>
  String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

/**
 * Recherche : sessions dont le titre, le client, le commentaire ou une page (titre, adresse) contiennent
 * tous les mots cherchés, sans tenir compte des accents ni des majuscules. Fonction pure.
 */
export function searchCapsules(capsules, query) {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return capsules;
  return capsules.filter((c) => {
    const text = fold([c.title, c.client, c.comment, ...c.tabs.flatMap((t) => [t.title, t.url])].join('\n'));
    return words.every((w) => text.includes(w));
  });
}

/**
 * Session cochée (plus active) ou décochée : la case est notée et la session se range juste après la
 * dernière session active ; les sessions actives restent ainsi au-dessus des autres. Cochée alors
 * qu'aucune autre n'est active, elle ne bouge pas. Fonction pure.
 */
export function placeDone(capsules, id, done) {
  const moved = capsules.find((c) => c.id === id);
  if (!moved) return capsules;
  const updated = { ...moved, done };
  const rest = capsules.filter((c) => c.id !== id);
  const at = rest.findLastIndex((c) => !c.done) + 1;
  if (done && !at) return capsules.map((c) => (c === moved ? updated : c));
  rest.splice(at, 0, updated);
  return rest;
}

/**
 * Fin des périodes d'ouverture qui n'ont plus de fenêtre : `isOpen(windowId)` dit si une fenêtre
 * est encore ouverte ; une période terminée l'est à `ts` (jamais avant son début). Fonction pure.
 * @returns {object[]|null} nouvelle liste, ou null si rien ne change
 */
export function closeSpans(capsules, isOpen, ts) {
  let changed = false;
  const next = capsules.map((c) => {
    let mine = false;
    const spans = (c.spans || []).map((s) => {
      const wins = (s.wins || []).filter(isOpen);
      if (s.to || (wins.length && wins.length === s.wins.length)) return s; // sans fenêtre : terminée
      mine = true;
      return wins.length ? { ...s, wins } : { from: s.from, to: Math.max(s.from, ts) };
    });
    changed ||= mine;
    return mine ? { ...c, spans } : c;
  });
  return changed ? next : null;
}

/** Une capsule au moins est-elle ouverte en ce moment ? */
export const anyOpen = (capsules) => capsules.some((c) => (c.spans || []).some((s) => !s.to));

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

/**
 * Enregistre des onglets (par défaut ceux ouverts) sous un titre ; client et commentaire facultatifs.
 * La capsule est ouverte dans cette fenêtre jusqu'à sa fermeture (temps d'ouverture dans CRA).
 */
export async function saveCapsule({ title, client, comment, tabs }) {
  const ts = Date.now();
  const win = await chrome.windows.getCurrent();
  const capsule = {
    id: newId(),
    ts,
    title: normName(title),
    client: normName(client),
    comment: String(comment || '').trim(),
    spans: [{ from: ts, wins: [win.id] }],
    tabs: tabs || (await currentTabs()),
  };
  await withLock('capsules', async () => chrome.storage.local.set({ capsules: [capsule, ...(await getCapsules())] }));
  return capsule;
}

/** Modifie une session : { title } (renommée) ou { tabs } (page retirée ou ajoutée). */
export function updateCapsule(id, patch) {
  return withLock('capsules', async () => {
    const capsules = (await getCapsules()).map((c) => (c.id === id ? { ...c, ...patch } : c));
    await chrome.storage.local.set({ capsules });
  });
}

/** Session cochée (plus active) ou décochée : rangée juste après la dernière session active. */
export function setDone(id, done) {
  return withLock('capsules', async () =>
    chrome.storage.local.set({ capsules: placeDone(await getCapsules(), id, done) }),
  );
}

/** Glisser-déposer : place la session `id` avant (ou après) la session `targetId`. */
export function moveCapsule(id, targetId, after = false) {
  return withLock('capsules', async () =>
    chrome.storage.local.set({ capsules: reorder(await getCapsules(), id, targetId, after) }),
  );
}

export function deleteCapsule(id) {
  return withLock('capsules', async () =>
    chrome.storage.local.set({ capsules: (await getCapsules()).filter((c) => c.id !== id) }),
  );
}

/**
 * Rouvre les onglets d'une session : une nouvelle fenêtre par fenêtre d'origine.
 * @returns {Promise<number>} nombre d'onglets rouverts (une adresse refusée par Chrome est sautée)
 */
export async function reopenCapsule(capsule) {
  let opened = 0;
  const wins = [];
  for (const group of byWindow(capsule.tabs)) {
    let windowId = null;
    for (const t of group) {
      try {
        if (windowId === null) {
          const w = await chrome.windows.create({ url: t.url, focused: true });
          windowId = w.id;
          wins.push(w.id);
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
  if (opened) await recordOpen(capsule.id, wins);
  return opened;
}

/**
 * Note une réouverture de la session (liste des capsules du jour dans CRA) : elle est ouverte
 * jusqu'à la fermeture des fenêtres `wins`.
 */
export function recordOpen(id, wins, ts = Date.now()) {
  return withLock('capsules', async () =>
    chrome.storage.local.set({
      capsules: (await getCapsules()).map((c) =>
        c.id === id
          ? {
              ...c,
              opens: [...(c.opens || []), ts].slice(-MAX_OPENS),
              spans: [...(c.spans || []), { from: ts, wins }].slice(-MAX_OPENS),
            }
          : c,
      ),
    }),
  );
}

/** Fenêtres fermées (ou perdues au redémarrage de Chrome) : fin des périodes d'ouverture concernées. */
export function closeOpenSpans(isOpen, ts = Date.now()) {
  return withLock('capsules', async () => {
    const capsules = closeSpans(await getCapsules(), isOpen, ts);
    if (capsules) await chrome.storage.local.set({ capsules });
  });
}
