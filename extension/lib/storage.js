// Accès au stockage local de l'extension (chrome.storage.local).
//
//  - "apps"      : [{ id, name, baseUrls: [string] }]
//  - "settings"  : réglages (voir DEFAULT_SETTINGS)
//  - "pages"     : colonnes du rapport [{ key, label, hidden }] dans l'ordre voulu
//  - "m_<id>"    : une mesure par clé (évite les conflits d'écriture entre onglets)

export const DEFAULT_SETTINGS = {
  network: 'wifi', // réseau associé aux nouvelles mesures : 'wifi' | 'ethernet'
  recording: true, // enregistrement actif
  quietMs: 1000, // durée de calme (ni requête ni modification du DOM) qui marque la fin de l'affichage
  maxWaitMs: 120000, // au-delà, la mesure est enregistrée en « timeout »
  ignoreQuery: true, // ignorer les paramètres ?a=b pour identifier une page
  replaceIds: true, // /clients/42 -> /clients/:id
  caseInsensitive: true, // /Clients et /clients sont la même page
  showOverlay: true, // petit indicateur de mesure en bas à droite de la page
  ignoreSelectors: '', // sélecteurs CSS dont les modifications sont ignorées (horloge, carrousel…)
  stat: 'avg', // statistique affichée dans le rapport / l'export
  reportView: 'both', // vue du rapport : 'both' | 'wifi' | 'ethernet' | 'diff'
};

const MEASURE_PREFIX = 'm_';

export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export async function getConfig() {
  const { apps = [], settings = {}, pages = [] } = await chrome.storage.local.get(['apps', 'settings', 'pages']);
  return { apps, pages, settings: { ...DEFAULT_SETTINGS, ...settings } };
}

export async function saveSettings(patch) {
  const { settings } = await getConfig();
  const next = { ...settings, ...patch };
  await chrome.storage.local.set({ settings: next });
  return next;
}

export function saveApps(apps) {
  return chrome.storage.local.set({ apps });
}

export function savePages(pages) {
  return chrome.storage.local.set({ pages });
}

export async function getMeasures() {
  const all = await chrome.storage.local.get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith(MEASURE_PREFIX))
    .map((k) => all[k])
    .sort((a, b) => a.ts - b.ts);
}

export function addMeasure(measure) {
  return chrome.storage.local.set({ [MEASURE_PREFIX + measure.id]: measure });
}

export function deleteMeasures(ids) {
  return chrome.storage.local.remove(ids.map((id) => MEASURE_PREFIX + id));
}

export function isMeasureKey(key) {
  return key.startsWith(MEASURE_PREFIX);
}

// ---- Sauvegarde / fusion (ex. mesures WiFi faites sur un PC portable,
// mesures Ethernet sur un PC fixe).

export async function exportBackup() {
  const { apps, pages } = await getConfig();
  return {
    format: 'insigth-backup',
    version: 1,
    exportedAt: new Date().toISOString(),
    apps,
    pages,
    measures: await getMeasures(),
  };
}

export async function importBackup(data) {
  if (!data || data.format !== 'insigth-backup' || !Array.isArray(data.measures)) {
    throw new Error("Ce fichier n'est pas une sauvegarde Insigth.");
  }
  const { apps, pages } = await getConfig();
  const nextPages = [...pages];
  for (const p of Array.isArray(data.pages) ? data.pages : []) {
    if (p && p.key && !nextPages.some((x) => x.key === p.key)) nextPages.push(p);
  }
  const nextApps = apps.map((a) => ({ ...a, baseUrls: [...(a.baseUrls || [])] }));
  const idMap = new Map();
  for (const a of Array.isArray(data.apps) ? data.apps : []) {
    if (!a || !a.name) continue;
    const name = String(a.name).trim().toLowerCase();
    let local = nextApps.find((x) => x.id === a.id) || nextApps.find((x) => x.name.trim().toLowerCase() === name);
    if (!local) {
      local = { id: a.id || newId(), name: String(a.name), baseUrls: [] };
      nextApps.push(local);
    }
    for (const u of a.baseUrls || []) if (!local.baseUrls.includes(u)) local.baseUrls.push(u);
    idMap.set(a.id, local.id);
  }

  const existing = new Set((await getMeasures()).map((m) => m.id));
  const toSet = {};
  let added = 0;
  for (const m of data.measures) {
    if (!m || !m.id || existing.has(m.id) || typeof m.duration !== 'number' || !m.url) continue;
    toSet[MEASURE_PREFIX + m.id] = { ...m, appId: idMap.get(m.appId) || m.appId };
    existing.add(m.id);
    added++;
  }
  await chrome.storage.local.set({ apps: nextApps, pages: nextPages, ...toSet });
  return { added, skipped: data.measures.length - added };
}
