// Insigth — service worker.
//
//  * injecte les scripts de mesure uniquement sur les hôtes des applications configurées ;
//  * mémorise le dernier clic de chaque onglet (pour mesurer un chargement de
//    page complet depuis le clic fait sur la page précédente) ;
//  * enregistre les mesures en y associant l'application, la page et le réseau ;
//  * affiche le réseau courant (WiFi / ETH) sur l'icône de l'extension.

import { getConfig, addMeasure, newId } from './lib/storage.js';
import { matchApp, pageKey, matchPatternsFor } from './lib/urls.js';

const SCRIPT_IDS = { hook: 'insigth-page-hook', content: 'insigth-content' };
const clicks = new Map(); // tabId -> { t, leftAt } (aussi copié dans storage.session)

// ---------- Injection des scripts sur les applications configurées

let syncChain = Promise.resolve();
function syncContentScripts() {
  syncChain = syncChain
    .then(registerScripts)
    .catch((e) => console.error('[Insigth] enregistrement des scripts impossible', e));
  return syncChain;
}

async function registerScripts() {
  const { apps } = await getConfig();
  const matches = [...new Set(apps.flatMap((a) => (a.baseUrls || []).flatMap(matchPatternsFor)))];
  const ids = Object.values(SCRIPT_IDS);
  const existing = await chrome.scripting.getRegisteredContentScripts({ ids });
  if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: existing.map((s) => s.id) });
  if (!matches.length) return;
  await chrome.scripting.registerContentScripts([
    {
      id: SCRIPT_IDS.content,
      js: ['content/content.js'],
      matches,
      runAt: 'document_start',
      allFrames: false,
      persistAcrossSessions: true,
    },
    {
      id: SCRIPT_IDS.hook,
      js: ['content/page-hook.js'],
      matches,
      runAt: 'document_start',
      allFrames: false,
      world: 'MAIN',
      persistAcrossSessions: true,
    },
  ]);
}

// ---------- Badge : réseau courant

async function updateBadge() {
  const { settings } = await getConfig();
  const wifi = settings.network !== 'ethernet';
  const text = !settings.recording ? 'OFF' : wifi ? 'WiFi' : 'ETH';
  const color = !settings.recording ? '#6b7280' : wifi ? '#1d4ed8' : '#15803d';
  await chrome.action.setBadgeText({ text });
  await chrome.action.setBadgeBackgroundColor({ color });
  if (chrome.action.setBadgeTextColor) await chrome.action.setBadgeTextColor({ color: '#ffffff' });
  await chrome.action.setTitle({
    title: `Insigth — réseau : ${wifi ? 'WiFi' : 'Ethernet'}${settings.recording ? '' : ' (enregistrement en pause)'}`,
  });
}

// ---------- Clics en attente (un par onglet)

const clickKey = (tabId) => `click_${tabId}`;

function rememberClick(tabId, click) {
  clicks.set(tabId, click);
  chrome.storage.session.set({ [clickKey(tabId)]: click }).catch(() => {});
}

function forgetClick(tabId) {
  clicks.delete(tabId);
  chrome.storage.session.remove(clickKey(tabId)).catch(() => {});
}

// La page d'où vient le clic est quittée : on note l'instant (voir content.js).
async function markLeft(tabId, t) {
  let click = clicks.get(tabId);
  if (!click) click = (await chrome.storage.session.get(clickKey(tabId)))[clickKey(tabId)];
  if (click && click.leftAt == null) rememberClick(tabId, { ...click, leftAt: t });
}

async function takeClick(tabId) {
  let click = clicks.get(tabId);
  if (!click) click = (await chrome.storage.session.get(clickKey(tabId)))[clickKey(tabId)];
  forgetClick(tabId);
  return click || null;
}

// ---------- Messages des scripts de mesure

async function handleInit(msg, tabId) {
  const click = tabId != null ? await takeClick(tabId) : null;
  const { apps, settings } = await getConfig();
  const match = matchApp(msg.url, apps, settings);
  return { app: match ? { id: match.app.id, name: match.app.name } : null, settings, click };
}

const KINDS = ['load', 'spa'];
const TRIGGERS = ['click', 'navigate', 'reload'];

async function handleMeasure(msg, tabId) {
  if (tabId != null && msg.kind === 'spa') forgetClick(tabId);
  const { apps, settings } = await getConfig();
  const match = settings.recording ? matchApp(msg.url, apps, settings) : null;
  if (!match) return { ok: false };
  const measure = {
    id: newId(),
    ts: Math.round(Number(msg.startEpoch) || Date.now()),
    appId: match.app.id,
    url: String(msg.url),
    page: pageKey(msg.url, match.basePath, settings),
    network: settings.network === 'ethernet' ? 'ethernet' : 'wifi',
    duration: Math.max(0, Math.round(Number(msg.duration) || 0)),
    kind: KINDS.includes(msg.kind) ? msg.kind : 'load',
    trigger: TRIGGERS.includes(msg.trigger) ? msg.trigger : 'navigate',
    timeout: !!msg.timeout,
  };
  await addMeasure(measure);
  return { ok: true, page: measure.page, appName: match.app.name, network: measure.network };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab ? sender.tab.id : null;
  switch (msg && msg.type) {
    case 'click':
      if (tabId != null && Number.isFinite(msg.t)) rememberClick(tabId, { t: msg.t });
      return false;
    case 'left':
      if (tabId != null && Number.isFinite(msg.t)) markLeft(tabId, msg.t);
      return false;
    case 'clearClick':
      if (tabId != null) forgetClick(tabId);
      return false;
    case 'init':
      handleInit(msg, tabId).then(sendResponse, () => sendResponse(null));
      return true;
    case 'measure':
      handleMeasure(msg, tabId).then(sendResponse, () => sendResponse({ ok: false }));
      return true;
    default:
      return false;
  }
});

chrome.tabs.onRemoved.addListener((tabId) => forgetClick(tabId));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.apps) syncContentScripts();
  if (changes.settings) updateBadge();
});

chrome.runtime.onInstalled.addListener((details) => {
  syncContentScripts();
  updateBadge();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.runtime.onStartup.addListener(() => {
  syncContentScripts();
  updateBadge();
});
