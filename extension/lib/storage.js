// Stockage de l'extension.
//
// chrome.storage.local (permanent)
//   apps      référentiel des clients [{ id, name, baseUrls: [] }]
//             (URL facultatives : servent à pré-remplir le client d'après l'onglet)
//   pages     référentiel ordonné des pages [{ id, name, hidden }] = colonnes des exports
//   settings  réglages (voir DEFAULT_SETTINGS)
//   draft     dernières valeurs du formulaire { app, sid, version, page, specific }
//   m_<id>    une mesure par clé :
//             { id, ts, app (= client), sid, version, page, specific (page spécifique ?),
//               network, duration, timeout,
//               kind, trigger, url, urlEnd, startUrl, detail }
// chrome.storage.session (jusqu'à la fermeture du navigateur)
//   session   mesure en cours (voir background.js)

import { normName, nameKey, canonical } from './names.js';

export const DEFAULT_SETTINGS = {
  network: 'ethernet', // réseau des prochaines mesures : 'ethernet' | 'wifi'
  quietMs: 1000, // calme (ni requête ni modification de la page) qui marque l'affichage complet
  maxWaitMs: 120000, // au-delà, la mesure est enregistrée en « timeout »
  showOverlay: true, // indicateur en bas à droite de la page mesurée
  ignoreSelectors: '', // zones qui bougent en permanence (horloge, carrousel…)
  stat: 'median', // statistique des exports : avg | median | min | max | last
  reportView: 'both', // vue de l'aperçu : both | ethernet | wifi | diff
  unit: 's', // unité des durées affichées et exportées : 's' (secondes) | 'ms'
  // Anomalies (couleurs des exports) : comparaison à la médiane des autres clients pour la même page
  warnRatio: 1.5, // jaune à partir de 1,5 × la médiane
  critRatio: 2, // orange à partir de 2 × la médiane
  warnMs: 0, // seuils absolus facultatifs (0 = désactivé)
  critMs: 0,
  gapPct: 50, // écart WiFi / Ethernet signalé à partir de 50 %
  // Dernier export choisi
  exportType: 'all', // all | page | client | detail
  exportFormat: 'xlsx', // xlsx | csv
  exportFullUrl: false, // ajouter l'URL complète (enregistrée avec chaque mesure)
  exportUrlEnd: false, // ajouter la fin d'URL
};

export const MEASURE_PREFIX = 'm_';

/**
 * Lecture, modification puis écriture d'une clé de chrome.storage.local : les pages de l'extension et le
 * service worker passent l'un après l'autre (verrou partagé), sans effacer l'écriture de l'autre.
 * Sans Web Locks (tests Node), fn est simplement appelée.
 */
export function withLock(name, fn) {
  const locks = globalThis.navigator && globalThis.navigator.locks;
  return locks ? locks.request(`allshare:${name}`, fn) : fn();
}

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getConfig() {
  const {
    apps = [],
    pages = [],
    settings = {},
    draft = {},
  } = await chrome.storage.local.get(['apps', 'pages', 'settings', 'draft']);
  return { apps, pages, draft, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

/** « 3.5.2 » est antérieure à « 3.6.0 » ? (versions numériques à points) */
export function isOlderVersion(version, than) {
  const a = String(version || '0')
    .split('.')
    .map(Number);
  const b = String(than).split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] || 0) - (b[i] || 0);
    if (d) return d < 0;
  }
  return false;
}

/**
 * Version 3.6 : Ethernet devient le réseau par défaut. Les réglages enregistrés avant contiennent
 * « wifi » (l'ancienne valeur par défaut) : on bascule une seule fois sur Ethernet à la mise à jour.
 */
export async function migrateNetworkDefault(previousVersion) {
  if (!isOlderVersion(previousVersion, '3.6.0')) return false;
  const { settings } = await chrome.storage.local.get('settings');
  if (!settings || settings.network !== 'wifi') return false;
  await chrome.storage.local.set({ settings: { ...settings, network: 'ethernet' } });
  return true;
}

export function saveSettings(patch) {
  return withLock('settings', async () => {
    const { settings } = await getConfig();
    const next = { ...settings, ...patch };
    await chrome.storage.local.set({ settings: next });
    return next;
  });
}

export function saveDraft(patch) {
  return withLock('draft', async () => {
    const { draft } = await getConfig();
    await chrome.storage.local.set({ draft: { ...draft, ...patch } });
  });
}

export const saveApps = (apps) => chrome.storage.local.set({ apps });
export const savePages = (pages) => chrome.storage.local.set({ pages });

export async function getMeasures() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith(MEASURE_PREFIX))
    .map((k) => all[k])
    .sort((a, b) => a.ts - b.ts);
}

export const addMeasure = (m) => chrome.storage.local.set({ [MEASURE_PREFIX + m.id]: m });
export const putMeasures = (list) =>
  chrome.storage.local.set(Object.fromEntries(list.map((m) => [MEASURE_PREFIX + m.id, m])));
export const deleteMeasures = (ids) => chrome.storage.local.remove(ids.map((id) => MEASURE_PREFIX + id));
export const isMeasureKey = (key) => key.startsWith(MEASURE_PREFIX);

// ---------------------------------------------------------------- Mesure en cours

export async function getSession() {
  return (await chrome.storage.session.get('session')).session || null;
}

export function setSession(session) {
  return session ? chrome.storage.session.set({ session }) : chrome.storage.session.remove('session');
}

// ---------------------------------------------------------------- Référentiel

/** Ajoute l'application et la page au référentiel si elles n'y sont pas encore. */
export function ensureInCatalog(appName, pageName) {
  return withLock('catalog', async () => {
    const { apps, pages } = await getConfig();
    const patch = {};
    if (appName && !apps.some((a) => nameKey(a.name) === nameKey(appName))) {
      patch.apps = [...apps, { id: newId(), name: normName(appName), baseUrls: [] }];
    }
    if (pageName && !pages.some((p) => nameKey(p.name) === nameKey(pageName))) {
      patch.pages = [...pages, { id: newId(), name: normName(pageName), hidden: false }];
    }
    if (Object.keys(patch).length) await chrome.storage.local.set(patch);
  });
}

/**
 * Renomme une application ou une page partout (référentiel + mesures).
 * Si le nouveau nom existe déjà, les deux sont fusionnés.
 */
export function renameEverywhere(kind, oldName, newName) {
  return withLock('catalog', () => renameUnlocked(kind, oldName, newName));
}

async function renameUnlocked(kind, oldName, newName) {
  const field = kind === 'app' ? 'app' : 'page';
  const listKey = kind === 'app' ? 'apps' : 'pages';
  const name = normName(newName);
  if (!name || (nameKey(oldName) === nameKey(name) && oldName === name)) return;
  const config = await getConfig();
  const list = config[listKey];
  const existing = list.find((x) => nameKey(x.name) === nameKey(name) && nameKey(x.name) !== nameKey(oldName));
  let next;
  if (existing) {
    const old = list.find((x) => nameKey(x.name) === nameKey(oldName));
    if (old && kind === 'app') {
      for (const u of old.baseUrls || []) if (!existing.baseUrls.includes(u)) existing.baseUrls.push(u);
    }
    next = list.filter((x) => nameKey(x.name) !== nameKey(oldName));
  } else {
    next = list.map((x) => (nameKey(x.name) === nameKey(oldName) ? { ...x, name } : x));
  }
  const target = existing ? existing.name : name;
  const measures = (await getMeasures()).filter((m) => nameKey(m[field]) === nameKey(oldName));
  await chrome.storage.local.set({ [listKey]: next });
  if (measures.length) await putMeasures(measures.map((m) => ({ ...m, [field]: target })));
}

/**
 * Modification d'une ligne client · SID · version (tableau de bord). Fonction pure.
 *  - les mesures de la ligne prennent le nouveau client, SID et version (regroupées avec la ligne
 *    qui a déjà ces valeurs, s'il y en a une) ;
 *  - casse ou espaces du client corrigés : le client est renommé partout ;
 *  - autre client, sans autre ligne pour l'ancien : son entrée du référentiel est renommée
 *    (URL conservées), ou fusionnée avec le client existant de ce nom ;
 *  - autre client, l'ancien garde d'autres lignes : le nouveau est ajouté au référentiel.
 * @param {{client: string, sid: string, version: string}} line  ligne actuelle
 * @param {{client: string, sid?: string, version?: string}} next nouvelles valeurs
 * @returns {{apps: object[], measures: object[], line: object, count: number, merged: boolean}}
 *          référentiel complet, mesures modifiées, ligne obtenue, nombre de mesures de la ligne
 */
export function planLineEdit(apps, measures, line, next) {
  const same = (a, b) => nameKey(a) === nameKey(b);
  const inLine = (m) => same(m.app, line.client) && same(m.sid, line.sid) && same(m.version, line.version);
  if (!normName(next.client)) throw new Error('Indiquez le client.');
  const known = [...apps.map((a) => a.name), ...measures.map((m) => m.app)];
  const client = same(next.client, line.client) ? normName(next.client) : canonical(next.client, known);
  const target = { client, sid: normName(next.sid), version: normName(next.version) };
  const respelled = same(client, line.client) && client !== line.client;
  const mine = measures.filter(inLine);
  const merged = measures.some(
    (m) => !inLine(m) && same(m.app, client) && same(m.sid, target.sid) && same(m.version, target.version),
  );
  const changed = [];
  for (const m of measures) {
    if (inLine(m)) {
      if (m.app !== client || (m.sid || '') !== target.sid || (m.version || '') !== target.version) {
        changed.push({ ...m, app: client, sid: target.sid, version: target.version });
      }
    } else if (respelled && same(m.app, client) && m.app !== client) {
      changed.push({ ...m, app: client });
    }
  }
  const others = measures.some((m) => same(m.app, line.client) && !inLine(m));
  let nextApps = apps;
  if (respelled) {
    nextApps = apps.map((a) => (same(a.name, client) ? { ...a, name: client } : a));
  } else if (!same(client, line.client)) {
    const old = apps.find((a) => same(a.name, line.client));
    const existing = apps.find((a) => same(a.name, client));
    if (others || !old) {
      if (!existing) nextApps = [...apps, { id: newId(), name: client, baseUrls: [] }];
    } else if (existing) {
      const urls = [...(existing.baseUrls || [])];
      for (const u of old.baseUrls || []) if (!urls.includes(u)) urls.push(u);
      nextApps = apps.filter((a) => a !== old).map((a) => (a === existing ? { ...a, baseUrls: urls } : a));
    } else {
      nextApps = apps.map((a) => (a === old ? { ...a, name: client } : a));
    }
  }
  return { apps: nextApps, measures: changed, line: target, count: mine.length, merged };
}

/** Applique planLineEdit ; le brouillon du panneau suit s'il était sur cette ligne. */
export function editLine(line, next) {
  return withLock('catalog', () => withLock('draft', () => editLineUnlocked(line, next)));
}

async function editLineUnlocked(line, next) {
  const { apps, draft } = await getConfig();
  const plan = planLineEdit(apps, await getMeasures(), line, next);
  const same = (a, b) => nameKey(a) === nameKey(b);
  const patch = { apps: plan.apps };
  if (same(draft.app, line.client) && same(draft.sid, line.sid) && same(draft.version, line.version)) {
    patch.draft = { ...draft, app: plan.line.client, sid: plan.line.sid, version: plan.line.version };
  }
  await chrome.storage.local.set(patch);
  if (plan.measures.length) await putMeasures(plan.measures);
  return plan;
}

/**
 * Supprime un client : toutes ses mesures et son entrée du référentiel.
 * Avec { sid, version } : seulement la ligne client · SID · version (le client reste).
 * @returns {Promise<number>} nombre de mesures supprimées
 */
export async function deleteClient(client, line = null) {
  const same = (a, b) => nameKey(a) === nameKey(b);
  const ids = (await getMeasures())
    .filter((m) => same(m.app, client) && (!line || (same(m.sid, line.sid) && same(m.version, line.version))))
    .map((m) => m.id);
  if (ids.length) await deleteMeasures(ids);
  if (!line) {
    await withLock('catalog', async () => {
      const { apps } = await getConfig();
      await saveApps(apps.filter((a) => !same(a.name, client)));
    });
  }
  return ids.length;
}

/** Supprime une page : toutes ses mesures (tous clients) et son entrée du référentiel. */
export async function deletePage(page) {
  const ids = (await getMeasures()).filter((m) => nameKey(m.page) === nameKey(page)).map((m) => m.id);
  if (ids.length) await deleteMeasures(ids);
  await withLock('catalog', async () => {
    const { pages } = await getConfig();
    await savePages(pages.filter((p) => nameKey(p.name) !== nameKey(page)));
  });
  return ids.length;
}

// ---------------------------------------------------------------- Sauvegarde / fusion

export async function exportBackup() {
  const { apps, pages } = await getConfig();
  return {
    format: 'insight-backup',
    version: 2,
    exportedAt: new Date().toISOString(),
    apps,
    pages,
    measures: await getMeasures(),
  };
}

/** Convertit les données de la version 1 (applis repérées par URL, pages par chemin). */
export function convertV1(apps, pages, measures) {
  const names = new Map(apps.map((a) => [a.id, a.name]));
  const labels = new Map(pages.filter((p) => p.key).map((p) => [p.key, normName(p.label) || p.key]));
  return {
    pages: pages.map((p) => ('key' in p ? { id: newId(), name: labels.get(p.key), hidden: !!p.hidden } : p)),
    measures: measures
      .filter((m) => m.app || names.has(m.appId))
      .map((m) => {
        if (m.app) return m;
        const { appId, ...rest } = m;
        return { ...rest, app: names.get(appId), page: labels.get(m.page) || m.page, startUrl: m.url };
      }),
  };
}

/** Migration au démarrage si des mesures de la version 1 sont présentes. */
export async function migrateV1() {
  const { apps, pages } = await getConfig();
  const measures = await getMeasures();
  const old = measures.filter((m) => !m.app);
  if (!old.length && !pages.some((p) => 'key' in p)) return 0;
  const converted = convertV1(apps, pages, measures);
  const dropped = old.filter((m) => !converted.measures.some((c) => c.id === m.id)).map((m) => m.id);
  await chrome.storage.local.set({ pages: converted.pages });
  await putMeasures(converted.measures);
  if (dropped.length) await deleteMeasures(dropped);
  return old.length;
}

export async function importBackup(data) {
  // « insigth-backup » : sauvegardes faites avant le renommage en Insight
  if (!data || !['insight-backup', 'insigth-backup'].includes(data.format) || !Array.isArray(data.measures)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Insight.");
  }
  let incoming = { apps: data.apps || [], pages: data.pages || [], measures: data.measures };
  if (data.version === 1) incoming = { ...incoming, ...convertV1(incoming.apps, incoming.pages, incoming.measures) };

  return withLock('catalog', async () => {
    const { apps, pages } = await getConfig();
    const merged = mergeInsight({ apps, pages, measures: await getMeasures() }, incoming);
    await chrome.storage.local.set({
      apps: merged.apps,
      pages: merged.pages,
      ...Object.fromEntries(merged.measures.map((m) => [MEASURE_PREFIX + m.id, m])),
    });
    return { added: merged.measures.length, skipped: incoming.measures.length - merged.measures.length };
  });
}

/**
 * Fusionne les clients, pages et mesures d'une sauvegarde avec ceux du poste. Fonction pure.
 * Clients et pages reconnus par leur nom (URL des clients réunies), mesures par leur identifiant :
 * une mesure déjà présente ou invalide est ignorée, les autres prennent les noms du poste.
 * @returns {{apps: object[], pages: object[], measures: object[]}} référentiels complets, mesures ajoutées
 */
export function mergeInsight({ apps, pages, measures }, incoming) {
  const nextApps = apps.map((a) => ({ ...a, baseUrls: [...(a.baseUrls || [])] }));
  for (const a of incoming.apps) {
    if (!a || !a.name) continue;
    let local = nextApps.find((x) => nameKey(x.name) === nameKey(a.name));
    if (!local) nextApps.push((local = { id: newId(), name: normName(a.name), baseUrls: [] }));
    for (const u of a.baseUrls || []) if (!local.baseUrls.includes(u)) local.baseUrls.push(u);
  }
  const nextPages = [...pages];
  for (const p of incoming.pages) {
    if (p && p.name && !nextPages.some((x) => nameKey(x.name) === nameKey(p.name))) {
      nextPages.push({ id: newId(), name: normName(p.name), hidden: !!p.hidden });
    }
  }
  const appNames = nextApps.map((a) => a.name);
  const pageNames = nextPages.map((p) => p.name);

  const existing = new Set(measures.map((m) => m.id));
  const added = [];
  for (const m of incoming.measures) {
    if (!m || !m.id || existing.has(m.id) || typeof m.duration !== 'number' || !m.app || !m.page) continue;
    for (const [list, name] of [
      [appNames, m.app],
      [pageNames, m.page],
    ]) {
      if (!list.some((n) => nameKey(n) === nameKey(name))) list.push(normName(name));
    }
    added.push({ ...m, app: canonical(m.app, appNames), page: canonical(m.page, pageNames) });
    existing.add(m.id);
  }
  for (const n of appNames)
    if (!nextApps.some((a) => a.name === n)) nextApps.push({ id: newId(), name: n, baseUrls: [] });
  for (const n of pageNames)
    if (!nextPages.some((p) => p.name === n)) nextPages.push({ id: newId(), name: n, hidden: false });
  return { apps: nextApps, pages: nextPages, measures: added };
}
