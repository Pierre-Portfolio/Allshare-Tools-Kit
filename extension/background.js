// Allshare Tools Kit — service worker : mesures Insight, badge de l'icône, raccourci clavier.
//
// Une mesure se déroule ainsi (état « session » dans chrome.storage.session) :
//   armed      le formulaire a été validé : les scripts de mesure sont injectés
//              dans l'onglet, on attend le clic de l'utilisateur ;
//   measuring  un clic a changé l'URL (ou une nouvelle page se charge) : chrono en cours ;
//   done       page complètement affichée : la mesure est enregistrée ;
//   rearming   « Relancer » : retour à la page de départ avant de réarmer.
// Les scripts ne sont injectés que pendant une mesure, dans l'onglet concerné.

import {
  getConfig,
  getSession,
  setSession,
  addMeasure,
  ensureInCatalog,
  saveSettings,
  newId,
  migrateV1,
  migrateNetworkDefault,
} from './lib/storage.js';
import { canonical, normName } from './lib/names.js';
import { urlEnd } from './lib/urls.js';
import { NETWORK_LABELS } from './lib/format.js';

const SCRIPT_IDS = { content: 'insight-content', hook: 'insight-page-hook' };
const OLD_SCRIPT_IDS = ['insigth-content', 'insigth-page-hook']; // avant le renommage en Insight
const ACTIVE = ['armed', 'measuring', 'rearming'];

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
  await updateSession((cur) =>
    cur && cur.id === s.id
      ? {
          ...cur,
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

// Raccourci clavier : lance la mesure avec les valeurs du formulaire.
chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== 'arm-measure') return;
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
  if (!res.ok && chrome.sidePanel && chrome.sidePanel.open) {
    chrome.storage.session.set({ panelTool: 'insight' }); // ouvrir directement Insight, pas l'accueil
    chrome.sidePanel.open({ windowId: target.windowId }).catch(() => {});
  }
});

async function boot() {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
  await setSession(null);
  await unregisterScripts();
  await updateBadge();
}

chrome.runtime.onInstalled.addListener(async (details) => {
  await migrateV1().catch((e) => console.error('[Insight] migration', e));
  if (details && details.reason === 'update') {
    await migrateNetworkDefault(details.previousVersion).catch((e) => console.error('[Insight] réseau', e));
  }
  await boot();
});
chrome.runtime.onStartup.addListener(boot);
