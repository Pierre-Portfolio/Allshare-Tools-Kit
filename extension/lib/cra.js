// CRA : aide à la saisie du compte rendu d'activité.
//
// chrome.storage.local
//   craSettings  automatismes de la page de saisie du C.R.A (content/cra.js) :
//                { autoSave, autoHighlight }
//                (autoSave : clic sur « Save » quand on quitte une ligne modifiée de la grille)
//                (autoHighlight : case de l'étoile jaune, le surlignage de la grille, décochée en arrivant sur la page)
//   craPages     clients allshare-scenario.fr ouverts aujourd'hui (remis à zéro chaque jour), tenu par background.js :
//                { day: 'AAAA-MM-JJ', at, pages: { [sous-domaine]: { url, title, ms } }, open: [sous-domaine…] }
//                (une entrée par sous-domaine client, voir clientHost ; url, title : dernière page vue ;
//                 at : dernière mise à jour ; open : clients ouverts dans un onglet à cet instant, qui gagnent
//                 le temps écoulé depuis at)
// Capsules ouvertes dans la journée : capsules[].opens (réouvertures, voir lib/capsule.js) et date de sauvegarde ;
// temps d'ouverture : capsules[].spans (de la sauvegarde ou d'une réouverture à la fermeture de ses fenêtres).

import { normName } from './names.js';
import { withLock } from './storage.js';

/**
 * Page de saisie du C.R.A (Oracle APEX), avec ou sans paramètres. Mêmes valeurs dans manifest.json
 * (content_scripts) et content/cra.js, qui ne peut pas importer ce module (vérifié par les tests).
 */
export const CRA_ORIGIN = 'https://dsb-cra.allshare-scenario.fr';
export const CRA_PATH = '/apex/r/allshare_wks/xaas/saisie-cra';

/** Adresse de la page de saisie du C.R.A ? */
export function isCraPage(url) {
  try {
    const u = new URL(url);
    return u.origin === CRA_ORIGIN && u.pathname.replace(/\/+$/, '') === CRA_PATH;
  } catch {
    return false;
  }
}

export const DEFAULT_CRA = { autoSave: false, autoHighlight: false };

/** Domaine des pages dont le temps d'ouverture est compté (sous-domaines compris). */
export const SITE = 'allshare-scenario.fr';
/** Au-delà, l'ordinateur était en veille : le relevé de background.js passe chaque minute. */
export const MAX_GAP = 3 * 60000;

/** « 2026-10-07 » : jour de `date`, heure locale. */
export function isoDay(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Début et fin (exclue) du jour de `date`, heure locale. */
export function dayBounds(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  d.setDate(d.getDate() + 1);
  return [start, d.getTime()];
}

/**
 * Temps passé ouvert entre `from` et `to` : périodes d'ouverture mises bout à bout (une capsule rouverte
 * alors qu'elle l'est déjà ne compte pas double), celle en cours jusqu'à `now`. Fonction pure.
 * @returns {{ms: number, start: number}} durée, et début de la première période dans l'intervalle (Infinity sinon)
 */
export function openTime(spans, from, to, now = Date.now()) {
  const parts = (spans || [])
    .map((s) => [Math.max(s.from, from), Math.min(s.to || now, to)])
    .filter(([a, b]) => b > a)
    .sort((x, y) => x[0] - y[0]);
  let ms = 0;
  let end = -Infinity;
  for (const [a, b] of parts) {
    if (b <= end) continue;
    ms += b - Math.max(a, end);
    end = b;
  }
  return { ms, start: parts.length ? parts[0][0] : Infinity };
}

/** Temps d'ouverture : « < 1 min », « 25 min », « 1 h 05 ». */
export function fmtOpenTime(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) return '< 1 min';
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}

/**
 * Capsules ouvertes le jour de `date` : rouvertes ou sauvegardées ce jour-là, ou restées ouvertes
 * depuis la veille. Fonction pure.
 * @returns {{capsule: object, events: {ts: number, saved: boolean}[], open: number, live: boolean}[]}
 *   dans l'ordre de la première ouverture ; open : temps d'ouverture dans la journée (ms),
 *   live : encore ouverte en ce moment (jour en cours seulement)
 */
export function openedOn(capsules, date, now = Date.now()) {
  const [from, to] = dayBounds(date);
  const inDay = (ts) => ts >= from && ts < to;
  return capsules
    .map((capsule) => {
      const events = [
        ...(inDay(capsule.ts) ? [{ ts: capsule.ts, saved: true }] : []),
        ...(capsule.opens || []).filter(inDay).map((ts) => ({ ts, saved: false })),
      ].sort((a, b) => a.ts - b.ts);
      const { ms, start } = openTime(capsule.spans, from, to, now);
      const live = inDay(now) && (capsule.spans || []).some((s) => !s.to);
      return { capsule, events, open: ms, live, start: Math.min(events.length ? events[0].ts : Infinity, start) };
    })
    .filter((x) => x.events.length || x.open > 0)
    .sort((a, b) => a.start - b.start)
    .map(({ start, ...x }) => x);
}

// ---------------------------------------------------------------- Clients allshare-scenario.fr

/** Sous-domaines du domaine qui ne sont pas des clients : la saisie du C.R.A, le site lui-même. */
const NOT_CLIENTS = [new URL(CRA_ORIGIN).hostname, `www.${SITE}`];

/**
 * Sous-domaine client d'une adresse (« dsb-generali.allshare-scenario.fr »), chaîne vide sinon : hors
 * du domaine, domaine seul, ou sous-domaine qui n'est pas un client (dsb-cra : saisie du C.R.A).
 */
export function clientHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith(`.${SITE}`) && !NOT_CLIENTS.includes(host) ? host : '';
  } catch {
    return '';
  }
}

/** « dsb-generali » : nom du client affiché, son sous-domaine sans le domaine. */
export const clientName = (host) => host.slice(0, -SITE.length - 1);

/**
 * Relevé d'avant la version 3.15 (une entrée par page, clé = adresse) : regroupé par client, temps des
 * pages additionnés (sans dépasser le temps écoulé depuis minuit), pages non clientes écartées.
 */
function byClient(state) {
  if (Object.keys(state.pages).every((key) => !key.includes('/'))) return state;
  const pages = {};
  const longest = {};
  for (const page of Object.values(state.pages)) {
    const host = clientHost(page.url);
    if (!host) continue;
    const ms = Math.min((pages[host] ? pages[host].ms : 0) + page.ms, state.at - dayBounds(state.at)[0]);
    if (!longest[host] || page.ms > longest[host].ms) longest[host] = page;
    pages[host] = { url: longest[host].url, title: longest[host].title, ms };
  }
  const open = [...new Set(state.open.map(clientHost).filter(Boolean))];
  return { ...state, pages, open };
}

/**
 * Relevé à `now` : les clients ouverts depuis le dernier relevé gagnent le temps écoulé (MAX_GAP au plus) ;
 * un nouveau jour repart de zéro (seul le temps depuis minuit compte). Fonction pure.
 */
export function advancePages(saved, now) {
  const day = isoDay(now);
  if (!saved) return { day, at: now, pages: {}, open: [] };
  const state = byClient(saved);
  const sameDay = state.day === day;
  const since = sameDay ? state.at : Math.max(state.at, dayBounds(now)[0]);
  const gained = Math.max(0, Math.min(now - since, MAX_GAP));
  const pages = sameDay ? { ...state.pages } : {};
  for (const key of state.open) {
    const page = pages[key] || state.pages[key];
    if (page) pages[key] = { ...page, ms: (sameDay ? page.ms : 0) + gained };
  }
  return { day, at: now, pages, open: state.open };
}

/**
 * Relevé à `now` d'après les onglets ouverts : les clients allshare-scenario.fr affichés comptent à partir
 * de maintenant (une fois, même ouverts dans plusieurs onglets), les autres s'arrêtent ; un client garde
 * l'adresse et le titre de la dernière page vue (onglet actif d'abord). Fonction pure.
 * @param {{url: string, title: string, active?: boolean}[]} tabs  tous les onglets de Chrome
 */
export function trackPages(state, tabs, now) {
  const next = advancePages(state, now);
  const pages = { ...next.pages };
  const open = [];
  for (const t of [...tabs].sort((a, b) => !!b.active - !!a.active)) {
    const host = clientHost(t.url);
    if (!host || open.includes(host)) continue;
    open.push(host);
    const page = pages[host];
    pages[host] = { url: t.url, title: normName(t.title) || (page && page.title) || '', ms: page ? page.ms : 0 };
  }
  return { ...next, pages, open };
}

/**
 * Clients du jour pour le panneau, le plus longtemps ouvert en tête. Fonction pure.
 * @returns {{key, name, url, title, ms, live: boolean}[]} key : sous-domaine, name : clientName,
 *   live : ouvert dans un onglet en ce moment
 */
export function pagesToday(state, now = Date.now()) {
  const { pages, open } = advancePages(state, now);
  return Object.entries(pages)
    .map(([key, page]) => ({ key, name: clientName(key), ...page, live: open.includes(key) }))
    .sort((a, b) => b.ms - a.ms);
}

/** « 2 capsules ouvertes aujourd'hui » (vide s'il n'y en a pas), pour l'accueil. */
export function craCountText(capsules, now = Date.now()) {
  const n = openedOn(capsules, now).length;
  return n ? `${n} capsule${n > 1 ? 's' : ''} ouverte${n > 1 ? 's' : ''} aujourd'hui` : '';
}

// ---------------------------------------------------------------- Navigateur

export async function getCraSettings() {
  return { ...DEFAULT_CRA, ...(await chrome.storage.local.get('craSettings')).craSettings };
}

export function saveCraSettings(patch) {
  return withLock('craSettings', async () => {
    const craSettings = { ...(await getCraSettings()), ...patch };
    await chrome.storage.local.set({ craSettings });
    return craSettings;
  });
}
