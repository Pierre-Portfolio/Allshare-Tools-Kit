// Stockage de l'extension.
//
// chrome.storage.local (permanent)
//   apps      référentiel des applications [{ id, name, baseUrls: [] }]
//             (URL facultatives : servent à pré-remplir le nom d'après l'onglet)
//   pages     référentiel ordonné des pages [{ id, name, hidden }] = colonnes des exports
//   settings  réglages (voir DEFAULT_SETTINGS)
//   draft     dernières valeurs du formulaire { app, page }
//   m_<id>    une mesure par clé :
//             { id, ts, app, page, network, duration, timeout, kind, trigger, url, startUrl }
// chrome.storage.session (jusqu'à la fermeture du navigateur)
//   session   mesure en cours (voir background.js)

import { normName, nameKey, canonical } from './names.js';

export const DEFAULT_SETTINGS = {
  network: 'wifi', // réseau des prochaines mesures : 'wifi' | 'ethernet'
  quietMs: 1000, // calme (ni requête ni modification de la page) qui marque l'affichage complet
  maxWaitMs: 120000, // au-delà, la mesure est enregistrée en « timeout »
  showOverlay: true, // indicateur en bas à droite de la page mesurée
  ignoreSelectors: '', // zones qui bougent en permanence (horloge, carrousel…)
  stat: 'median', // statistique des exports : avg | median | min | max | last
  reportView: 'both', // vue de l'aperçu : both | wifi | ethernet | diff
  // Anomalies (couleurs des exports) : comparaison à la médiane des autres clients pour la même page
  warnRatio: 1.5, // jaune à partir de 1,5 × la médiane
  critRatio: 2, // orange à partir de 2 × la médiane
  warnMs: 0, // seuils absolus facultatifs (0 = désactivé)
  critMs: 0,
  gapPct: 50, // écart WiFi / Ethernet signalé à partir de 50 %
};

const MEASURE_PREFIX = 'm_';

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

export async function saveSettings(patch) {
  const { settings } = await getConfig();
  const next = { ...settings, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export async function saveDraft(patch) {
  const { draft } = await getConfig();
  await chrome.storage.local.set({ draft: { ...draft, ...patch } });
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
export async function ensureInCatalog(appName, pageName) {
  const { apps, pages } = await getConfig();
  const patch = {};
  if (appName && !apps.some((a) => nameKey(a.name) === nameKey(appName))) {
    patch.apps = [...apps, { id: newId(), name: normName(appName), baseUrls: [] }];
  }
  if (pageName && !pages.some((p) => nameKey(p.name) === nameKey(pageName))) {
    patch.pages = [...pages, { id: newId(), name: normName(pageName), hidden: false }];
  }
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

/**
 * Renomme une application ou une page partout (référentiel + mesures).
 * Si le nouveau nom existe déjà, les deux sont fusionnés.
 */
export async function renameEverywhere(kind, oldName, newName) {
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

// ---------------------------------------------------------------- Sauvegarde / fusion

export async function exportBackup() {
  const { apps, pages } = await getConfig();
  return {
    format: 'insigth-backup',
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
  if (!data || data.format !== 'insigth-backup' || !Array.isArray(data.measures)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Insigth.");
  }
  let incoming = { apps: data.apps || [], pages: data.pages || [], measures: data.measures };
  if (data.version === 1) incoming = { ...incoming, ...convertV1(incoming.apps, incoming.pages, incoming.measures) };

  const { apps, pages } = await getConfig();
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

  const existing = new Set((await getMeasures()).map((m) => m.id));
  const toSet = {};
  let added = 0;
  for (const m of incoming.measures) {
    if (!m || !m.id || existing.has(m.id) || typeof m.duration !== 'number' || !m.app || !m.page) continue;
    for (const [list, name] of [
      [appNames, m.app],
      [pageNames, m.page],
    ]) {
      if (!list.some((n) => nameKey(n) === nameKey(name))) list.push(normName(name));
    }
    toSet[MEASURE_PREFIX + m.id] = { ...m, app: canonical(m.app, appNames), page: canonical(m.page, pageNames) };
    existing.add(m.id);
    added++;
  }
  for (const n of appNames)
    if (!nextApps.some((a) => a.name === n)) nextApps.push({ id: newId(), name: n, baseUrls: [] });
  for (const n of pageNames)
    if (!nextPages.some((p) => p.name === n)) nextPages.push({ id: newId(), name: n, hidden: false });
  await chrome.storage.local.set({ apps: nextApps, pages: nextPages, ...toSet });
  return { added, skipped: incoming.measures.length - added };
}
