// Allshare Tools Kit — service worker : mesures Insight, badge de l'icône, raccourci clavier,
// temps d'ouverture des capsules (fin notée à la fermeture de leurs fenêtres, voir lib/capsule.js)
// et des clients allshare-scenario.fr du jour (craPages, voir lib/cra.js).
//
// Une mesure se déroule ainsi (état « session » dans chrome.storage.session) :
//   armed      le formulaire a été validé : les scripts de mesure sont injectés
//              dans l'onglet, on attend le clic de l'utilisateur ;
//   measuring  un clic a changé l'URL (ou une nouvelle page se charge) : chrono en cours ;
//   done       page complètement affichée : la mesure est enregistrée ;
//   rearming   « Relancer » : retour à la page de départ avant de réarmer (ou, depuis le
//              tableau de bord, ouverture de la page de départ dans un nouvel onglet).
// Les scripts ne sont injectés que pendant une mesure, dans l'onglet concerné.

import {
  getConfig,
  getSession,
  setSession,
  addMeasure,
  deleteMeasures,
  ensureInCatalog,
  saveSettings,
  newId,
  migrateV1,
  migrateDetails,
  migrateNetworkDefault,
  syncCatalog,
  ACTIVE_STATES as ACTIVE,
} from './lib/storage.js';
import { canonical, normName } from './lib/names.js';
import { getCapsules, closeOpenSpans, anyOpen } from './lib/capsule.js';
import { trackPages, clientHost } from './lib/cra.js';
import { urlEnd } from './lib/urls.js';
import { NETWORK_LABELS } from './lib/format.js';

const SCRIPT_IDS = { content: 'insight-content', hook: 'insight-page-hook' };
const OLD_SCRIPT_IDS = ['insigth-content', 'insigth-page-hook']; // avant le renommage en Insight

const label = (s) =>
  `${[s.app, s.sid, s.version].filter(Boolean).join(' · ')} › ${s.page}${s.specific ? ' (spécifique)' : ''} · ${
    NETWORK_LABELS[s.network] || s.network
  }`;

// ---------------------------------------------------------------- Session (mises à jour sérialisées)

let chain = Promise.resolve();
/** fn(session) renvoie la nouvelle session, null pour l'effacer, undefined pour ne rien changer. */
function updateSession(fn) {
  const run = chain.then(async () => {
    const current = await getSession();
    const next = await fn(current);
    if (next !== undefined) await setSession(next);
    return next === undefined ? current : next;
  });
  chain = run.catch(() => {});
  return run;
}

// ---------------------------------------------------------------- Scripts de mesure

async function registerScripts() {
  const ids = Object.values(SCRIPT_IDS);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [...ids, ...OLD_SCRIPT_IDS] });
  if (existing.length === ids.length && existing.every((s) => ids.includes(s.id))) return;
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  const common = { matches: ['<all_urls>'], runAt: 'document_start', allFrames: false, persistAcrossSessions: false };
  await chrome.scripting.registerContentScripts([
    { id: SCRIPT_IDS.content, js: ['content/content.js'], ...common },
    { id: SCRIPT_IDS.hook, js: ['content/page-hook.js'], world: 'MAIN', ...common },
  ]);
}

async function unregisterScripts() {
  const existing = await chrome.scripting.getRegisteredContentScripts({
    ids: [...Object.values(SCRIPT_IDS), ...OLD_SCRIPT_IDS],
  });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
}

/** Injection dans la page déjà affichée (celle où l'utilisateur va cliquer). */
async function injectInto(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/page-hook.js'], world: 'MAIN' });
  await chrome.scripting.executeScript({
    target: { tabId },
    func: () => {
      window.__insightInjected = true; // page déjà chargée : pas de mesure de son chargement
    },
  });
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content/content.js'] });
}

async function notifyTab(tabId, message) {
  try {
    await chrome.tabs.sendMessage(tabId, message);
  } catch {
    /* aucun script dans l'onglet */
  }
}

// ---------------------------------------------------------------- Badge de l'icône

async function updateBadge() {
  const [{ settings }, s] = await Promise.all([getConfig(), getSession()]);
  let text = settings.network === 'ethernet' ? 'ETH' : 'WiFi';
  let color = settings.network === 'ethernet' ? '#15803d' : '#1d4ed8';
  if (s && (s.state === 'armed' || s.state === 'rearming')) {
    text = 'PRÊT';
    color = '#d97706';
  } else if (s && s.state === 'measuring') {
    text = '…';
    color = '#d97706';
  }
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
}

// ---------------------------------------------------------------- Actions du panneau

async function arm({ tabId, app, sid, version, page, specific, network }) {
  app = normName(app);
  page = normName(page);
  if (!app) return { ok: false, error: 'Indiquez le client.' };
  if (!normName(version)) return { ok: false, error: "Indiquez la version de l'application." };
  if (!page) return { ok: false, error: 'Indiquez le nom de la page.' };
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab || !/^https?:/i.test(tab.url || '')) {
    return { ok: false, error: "Ouvrez d'abord l'application (page http ou https) dans l'onglet actif." };
  }
  const { apps, pages } = await getConfig();
  app = canonical(
    app,
    apps.map((a) => a.name),
  );
  page = canonical(
    page,
    pages.map((p) => p.name),
  );
  const settings = network ? await saveSettings({ network }) : (await getConfig()).settings;

  const previous = await getSession();
  if (previous && ACTIVE.includes(previous.state)) await notifyTab(previous.tabId, { type: 'session-end' });
  const session = {
    id: newId(),
    tabId,
    app,
    sid: normName(sid),
    version: normName(version),
    page,
    specific: !!specific,
    network: settings.network,
    state: 'armed',
    armedAt: Date.now(),
    armUrl: tab.url,
    click: null,
    leftAt: null,
    startEpoch: null,
    result: null,
  };
  await updateSession(() => session);
  try {
    await registerScripts();
    await injectInto(tabId);
  } catch (e) {
    await updateSession(() => null);
    await unregisterScripts();
    updateBadge();
    return { ok: false, error: `Impossible de mesurer cet onglet : ${e.message}` };
  }
  updateBadge();
  return { ok: true, session };
}

async function stop() {
  const s = await getSession();
  if (s && ACTIVE.includes(s.state)) await notifyTab(s.tabId, { type: 'session-end' });
  await updateSession(() => null);
  await unregisterScripts();
  updateBadge();
  return { ok: true };
}

/** Attend que l'onglet ait rechargé la page de départ, puis arme (si le script n'y est pas déjà). */
function rearmWhenLoaded(tabId, sessionId) {
  let started = false;
  let done = false;
  const finish = async () => {
    if (done) return;
    done = true;
    chrome.tabs.onUpdated.removeListener(onUpdated);
    const s = await getSession();
    if (!s || s.id !== sessionId || s.state !== 'rearming') return; // déjà armé par la nouvelle page
    try {
      await injectInto(tabId);
    } catch {
      /* onglet inaccessible */
    }
  };
  const onUpdated = (id, info) => {
    if (id !== tabId) return;
    if (info.status === 'loading') started = true;
    if (info.status === 'complete' && started) finish();
  };
  chrome.tabs.onUpdated.addListener(onUpdated);
  // Changement d'ancre seulement (#/route d'une SPA) : pas de rechargement.
  setTimeout(() => !started && finish(), 1500);
  setTimeout(finish, 60000);
}

async function relaunch({ network }) {
  const s = await getSession();
  if (!s) return { ok: false, error: 'Aucune mesure à relancer.' };
  const tab = await chrome.tabs.get(s.tabId).catch(() => null);
  if (!tab) return { ok: false, error: "L'onglet de la mesure a été fermé." };
  const settings = network ? await saveSettings({ network }) : (await getConfig()).settings;
  const target = (s.click && s.click.url) || s.armUrl;
  if (ACTIVE.includes(s.state)) await notifyTab(s.tabId, { type: 'session-end' });
  const next = {
    ...s,
    id: newId(),
    network: settings.network,
    state: 'rearming',
    armedAt: Date.now(),
    armUrl: target,
    click: null,
    leftAt: null,
    startEpoch: null,
    result: null,
  };
  await updateSession(() => next);
  await registerScripts();
  rearmWhenLoaded(s.tabId, next.id);
  await chrome.tabs.update(s.tabId, { url: target });
  updateBadge();
  return { ok: true, session: next };
}

/**
 * Tableau de bord (double-clic sur une case) : ouvre la page de départ dans un nouvel onglet et y
 * arme la mesure. replace : mesures de la case supprimées quand la nouvelle est enregistrée.
 */
async function remeasure({ app, sid, version, page, specific, network, url, replace, windowId, openerTabId }) {
  app = normName(app);
  page = normName(page);
  if (!app || !page) return { ok: false, error: 'Client ou page manquant.' };
  if (!/^https?:\/\//i.test(url || '')) return { ok: false, error: 'Aucune page de départ connue pour cette mesure.' };
  const settings = network ? await saveSettings({ network }) : (await getConfig()).settings;
  const previous = await getSession();
  if (previous && ACTIVE.includes(previous.state)) await notifyTab(previous.tabId, { type: 'session-end' });
  // Onglet vide d'abord : la session doit connaître l'onglet avant que la page ne se charge.
  const tab = await chrome.tabs.create({
    url: 'about:blank',
    active: true,
    ...(Number.isInteger(windowId) ? { windowId } : {}),
    ...(Number.isInteger(openerTabId) ? { openerTabId } : {}),
  });
  const ids = Array.isArray(replace) ? replace.filter((id) => typeof id === 'string') : [];
  const session = {
    id: newId(),
    tabId: tab.id,
    app,
    sid: normName(sid),
    version: normName(version),
    page,
    specific: !!specific,
    network: settings.network,
    state: 'rearming',
    armedAt: Date.now(),
    armUrl: url,
    replace: ids.length ? { ids, network: settings.network } : null,
    click: null,
    leftAt: null,
    startEpoch: null,
    result: null,
  };
  await updateSession(() => session);
  await registerScripts();
  rearmWhenLoaded(tab.id, session.id);
  await chrome.tabs.update(tab.id, { url });
  updateBadge();
  return { ok: true, session };
}

// ---------------------------------------------------------------- Messages des scripts de mesure

async function hello(msg, tabId) {
  const s = await getSession();
  if (!s || s.tabId !== tabId || !ACTIVE.includes(s.state)) return null;
  const { settings } = await getConfig();
  const base = { settings, label: label(s) };
  if (s.state === 'rearming' || !msg.fresh) {
    // Page de départ (rechargée ou déjà affichée) : on attend le clic.
    if (s.state === 'rearming')
      await updateSession((cur) => (cur && cur.id === s.id ? { ...cur, state: 'armed' } : undefined));
    updateBadge();
    return { ...base, mode: 'armed' };
  }
  // Nouvelle page dans l'onglet armé : on mesure son chargement.
  return { ...base, mode: 'load', click: s.click ? { t: s.click.t, leftAt: s.leftAt } : null };
}

/** Détail des temps reçu de la page : on ne garde que des nombres et des URL bornées. */
function sanitizeDetail(d) {
  if (!d || typeof d !== 'object' || !d.marks) return null;
  const marks = {};
  for (const [k, v] of Object.entries(d.marks)) if (Number.isFinite(v)) marks[k] = Math.round(v);
  const requests = (Array.isArray(d.requests) ? d.requests : []).slice(0, 15).map((r) => ({
    url: String(r.url || '').slice(0, 400),
    type: String(r.type || '').slice(0, 10),
    start: Math.round(Number(r.start) || 0),
    duration: Math.round(Number(r.duration) || 0),
  }));
  return {
    kind: d.kind === 'load' ? 'load' : 'spa',
    marks,
    requests,
    requestCount: Number.isFinite(d.requestCount) ? d.requestCount : requests.length,
  };
}

async function saveResult(msg, tabId) {
  const s = await getSession();
  if (!s || s.tabId !== tabId || !ACTIVE.includes(s.state)) return { ok: false };
  const measure = {
    id: newId(),
    ts: Math.round(Number(msg.startEpoch) || Date.now()),
    app: s.app,
    sid: s.sid || '',
    version: s.version || '',
    page: s.page,
    specific: !!s.specific,
    network: s.network,
    duration: Math.max(0, Math.round(Number(msg.duration) || 0)),
    timeout: !!msg.timeout,
    kind: msg.kind === 'spa' ? 'spa' : 'load',
    trigger: ['click', 'navigate', 'reload'].includes(msg.trigger) ? msg.trigger : 'navigate',
    url: String(msg.url || ''),
    urlEnd: urlEnd(String(msg.url || '')),
    startUrl: (s.click && s.click.url) || s.armUrl,
    detail: sanitizeDetail(msg.detail),
  };
  await addMeasure(measure);
  await ensureInCatalog(s.app, s.page);
  // Relance depuis le tableau de bord : les anciennes mesures de la case sont remplacées
  // (pas si le réseau a été changé entre-temps : la nouvelle mesure est dans une autre case).
  const replaced = s.replace && s.replace.network === measure.network ? s.replace.ids : [];
  if (replaced.length) await deleteMeasures(replaced);
  await updateSession((cur) =>
    cur && cur.id === s.id
      ? {
          ...cur,
          replace: null,
          state: 'done',
          finishedAt: Date.now(),
          result: { measureId: measure.id, duration: measure.duration, timeout: measure.timeout, url: measure.url },
        }
      : undefined,
  );
  await unregisterScripts();
  updateBadge();
  return { ok: true, label: label(s), duration: measure.duration };
}

function onTabMessage(msg, tabId) {
  switch (msg.type) {
    case 'hello':
      return hello(msg, tabId);
    case 'click':
      return updateSession((s) =>
        s && s.tabId === tabId && ACTIVE.includes(s.state) && Number.isFinite(msg.t)
          ? { ...s, click: { t: msg.t, url: String(msg.url || '') }, leftAt: null }
          : undefined,
      );
    case 'idle': // clic sans changement de page : on reste armé
      return updateSession((s) =>
        s && s.tabId === tabId && ACTIVE.includes(s.state)
          ? { ...s, state: 'armed', click: null, startEpoch: null }
          : undefined,
      ).then(updateBadge);
    case 'left': // la page cliquée est quittée : le chrono tourne
      return updateSession((s) =>
        s && s.tabId === tabId && s.click && !s.leftAt && ACTIVE.includes(s.state)
          ? { ...s, state: 'measuring', leftAt: msg.t, startEpoch: s.click.t }
          : undefined,
      ).then(updateBadge);
    case 'measuring':
      return updateSession((s) =>
        s && s.tabId === tabId && ACTIVE.includes(s.state)
          ? { ...s, state: 'measuring', startEpoch: msg.startEpoch }
          : undefined,
      ).then(updateBadge);
    case 'result':
      return saveResult(msg, tabId);
    default:
      return Promise.resolve(null);
  }
}

function onPanelMessage(msg) {
  switch (msg.type) {
    case 'arm':
      return arm(msg);
    case 'cancel':
    case 'finish':
      return stop();
    case 'relaunch':
      return relaunch(msg);
    case 'remeasure':
      return remeasure(msg);
    default:
      return Promise.resolve(null);
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || !msg.type) return false;
  // Pages de l'extension (panneau, même ouvert dans un onglet) ou script de mesure dans une page web.
  const fromExtension = !sender.tab || (sender.url || '').startsWith(chrome.runtime.getURL(''));
  const run = fromExtension ? onPanelMessage(msg) : onTabMessage(msg, sender.tab.id);
  run.then(
    (r) => sendResponse(r === undefined ? null : r),
    (e) => sendResponse({ ok: false, error: e && e.message }),
  );
  return true;
});

// ---------------------------------------------------------------- Évènements du navigateur

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await getSession();
  if (s && s.tabId === tabId) await stop();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const network = changes.settings.newValue && changes.settings.newValue.network;
  updateBadge();
  if (!network) return;
  // Réseau changé pendant une mesure armée : la mesure suit le nouveau réseau.
  updateSession((s) => (s && ACTIVE.includes(s.state) && s.network !== network ? { ...s, network } : undefined)).then(
    (s) => s && ACTIVE.includes(s.state) && notifyTab(s.tabId, { type: 'label', label: label(s) }),
  );
});

// ---------------------------------------------------------------- Capsule : temps d'ouverture

const TICK_ALARM = 'tick'; // relevé chaque minute (capsules et clients allshare-scenario.fr ouverts)

// Mises à jour des capsules sérialisées : deux fenêtres fermées ensemble ne s'écrasent pas
let capsuleChain = Promise.resolve();
function closeCapsuleSpans(isOpen, ts) {
  capsuleChain = capsuleChain
    .then(async () => closeOpenSpans(isOpen, typeof ts === 'function' ? await ts() : ts))
    .catch((e) => console.error('[Capsule] fermeture', e));
  return capsuleChain;
}

/** Fin d'une période restée ouverte sans que sa fenêtre soit vue se fermer : dernier relevé de Chrome. */
const lastAlive = async () => (await chrome.storage.local.get('capsuleAlive')).capsuleAlive || 0;

chrome.windows.onRemoved.addListener((windowId) => closeCapsuleSpans((w) => w !== windowId, Date.now()));

// ---------------------------------------------------------------- CRA : clients allshare-scenario.fr du jour

// Relevés sérialisés (lecture puis écriture de craPages) ; `restart` : les onglets d'avant n'existent plus
let pagesChain = Promise.resolve();
// Onglets affichant un client du domaine au dernier relevé : seuls leurs changements (et l'arrivée d'un
// onglet sur un client) déclenchent un relevé. Vide au réveil du service worker : le relevé de chaque
// minute le reconstitue.
let siteTabs = new Set();
function updatePages(restart = false) {
  pagesChain = pagesChain
    .then(async () => {
      const { craPages } = await chrome.storage.local.get('craPages');
      const before = restart && craPages ? { ...craPages, open: [] } : craPages;
      const tabs = await chrome.tabs.query({});
      siteTabs = new Set(tabs.filter((t) => clientHost(t.url)).map((t) => t.id));
      const next = trackPages(before, tabs, Date.now());
      if (!(craPages && craPages.open.length) && !next.open.length) return; // aucune page suivie
      await chrome.storage.local.set({ craPages: next });
    })
    .catch((e) => console.error('[CRA] pages', e));
  return pagesChain;
}

// Les autres onglets (titres qui changent sans cesse : messagerie, visio…) ne provoquent aucune écriture.
chrome.tabs.onUpdated.addListener((tabId, info, tab) => {
  if (!info.url && !info.title) return;
  if (siteTabs.has(tabId) || clientHost(info.url || (tab && tab.url))) updatePages();
});
chrome.tabs.onRemoved.addListener((tabId) => siteTabs.has(tabId) && updatePages());
chrome.tabs.onReplaced.addListener(() => updatePages()); // rare (page préchargée) : relevé complet

// ---------------------------------------------------------------- Relevé chaque minute

// Tant qu'une capsule ou un client allshare-scenario.fr est ouvert : temps des clients mis à jour, et
// dernier instant où Chrome tournait (si Chrome est quitté, les capsules ouvertes se terminent là)
async function syncTickAlarm() {
  const [capsules, { craPages }] = await Promise.all([getCapsules(), chrome.storage.local.get('craPages')]);
  const open = anyOpen(capsules) || !!(craPages && craPages.open.length);
  if (!open) await chrome.alarms.clear(TICK_ALARM);
  else if (!(await chrome.alarms.get(TICK_ALARM))) await chrome.alarms.create(TICK_ALARM, { periodInMinutes: 1 });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== TICK_ALARM) return;
  chrome.storage.local.set({ capsuleAlive: Date.now() });
  updatePages();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.capsules || changes.craPages)) syncTickAlarm();
});

// Raccourci clavier : lance la mesure avec les valeurs du formulaire.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'arm-measure') return;
  // Le panneau latéral ne s'ouvre qu'en réponse directe au raccourci : avant tout await. Il affiche
  // Insight (mesure prête, ou formulaire et son erreur s'il est incomplet).
  if (tab && chrome.sidePanel && chrome.sidePanel.open) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
  armFromShortcut(tab).catch((e) => console.error('[Insight] raccourci', e));
});

async function armFromShortcut(tab) {
  const target = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
  if (!target) return;
  const { draft } = await getConfig();
  const res = await arm({
    tabId: target.id,
    app: draft.app,
    sid: draft.sid,
    version: draft.version,
    page: draft.page,
    specific: draft.specific,
  });
  // Formulaire incomplet : le panneau ouvert sur l'accueil passe directement sur Insight
  if (!res.ok) await chrome.storage.session.set({ panelTool: { tool: 'insight', at: Date.now() } });
}

async function boot() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  await setSession(null);
  await unregisterScripts();
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await migrateDetails().catch((e) => console.error('[Insight] détail des temps', e));
  await migrateV1().catch((e) => console.error('[Insight] migration', e));
  await syncCatalog().catch((e) => console.error('[Insight] référentiel', e));
  if (details && details.reason === 'update') {
    await migrateNetworkDefault(details.previousVersion).catch((e) => console.error('[Insight] réseau', e));
  }
  // Extension rechargée : les fenêtres fermées entre-temps n'ont pas été vues
  const windows = new Set((await chrome.windows.getAll()).map((w) => w.id));
  await closeCapsuleSpans((w) => windows.has(w), lastAlive);
  await updatePages();
  await chrome.alarms.clearAll(); // relevé d'une version précédente
  await syncTickAlarm();
  await boot();
});
chrome.runtime.onStartup.addListener(async () => {
  // Chrome redémarré : les fenêtres et onglets de la dernière fois n'existent plus
  await closeCapsuleSpans(() => false, lastAlive);
  await updatePages(true);
  await syncTickAlarm();
  await boot();
});
