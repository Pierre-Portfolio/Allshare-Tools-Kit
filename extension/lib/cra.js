// CRA : aide à la saisie du compte rendu d'activité.
//
// chrome.storage.local
//   craSettings  automatismes de la page de saisie du C.R.A (content/cra.js) :
//                { autoSave, autoHighlight }
//                (autoSave : clic sur « Save » quand on quitte une ligne modifiée de la grille)
//                (autoHighlight : case de l'étoile jaune, le surlignage de la grille, décochée en arrivant sur la page)
//   craPages     pages allshare-scenario.fr ouvertes aujourd'hui (remis à zéro chaque jour), tenu par background.js :
//                { day: 'AAAA-MM-JJ', at, pages: { [clé]: { url, title, ms } }, open: [clé…] }
//                (at : dernière mise à jour ; open : pages ouvertes dans un onglet à cet instant, qui gagnent
//                 le temps écoulé depuis at ; clé : voir pageKey)
// Capsules ouvertes dans la journée : capsules[].opens (réouvertures, voir lib/capsule.js) et date de sauvegarde ;
// temps d'ouverture : capsules[].spans (de la sauvegarde ou d'une réouverture à la fermeture de ses fenêtres).

import { normName } from './names.js';

/** Début des adresses de la page de saisie du C.R.A (Oracle APEX). */
export const CRA_PAGE = 'https://dsb-cra.allshare-scenario.fr/apex/r/allshare_wks/xaas/saisie-cra?';

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

// ---------------------------------------------------------------- Pages allshare-scenario.fr

/** Page du domaine allshare-scenario.fr (ou d'un sous-domaine) ? */
export function isSitePage(url) {
  try {
    const host = new URL(url).hostname;
    return host === SITE || host.endsWith(`.${SITE}`);
  } catch {
    return false;
  }
}

/**
 * Clé d'une page : son adresse sans ancre ni numéro de session APEX (paramètres session, cs, clear ;
 * 3e valeur de f?p=), pour qu'une même page ne soit pas comptée à part à chaque connexion.
 */
export function pageKey(url) {
  const u = new URL(url);
  u.hash = '';
  for (const name of ['session', 'cs', 'clear']) u.searchParams.delete(name);
  const p = u.searchParams.get('p');
  if (p && p.split(':').length > 2) u.searchParams.set('p', p.replace(/^([^:]*:[^:]*:)[^:]*/, '$1'));
  return u.href;
}

/**
 * Relevé à `now` : les pages ouvertes depuis le dernier relevé gagnent le temps écoulé (MAX_GAP au plus) ;
 * un nouveau jour repart de zéro (seul le temps depuis minuit compte). Fonction pure.
 */
export function advancePages(state, now) {
  const day = isoDay(now);
  if (!state) return { day, at: now, pages: {}, open: [] };
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
 * Relevé à `now` d'après les onglets ouverts : les pages allshare-scenario.fr affichées (titre et adresse
 * à jour) comptent à partir de maintenant, les autres s'arrêtent. Fonction pure.
 * @param {{url: string, title: string}[]} tabs  tous les onglets de Chrome
 */
export function trackPages(state, tabs, now) {
  const next = advancePages(state, now);
  const pages = { ...next.pages };
  const open = [];
  for (const t of tabs) {
    if (!isSitePage(t.url)) continue;
    const key = pageKey(t.url);
    if (!open.includes(key)) open.push(key);
    const page = pages[key];
    pages[key] = { url: t.url, title: normName(t.title) || (page && page.title) || '', ms: page ? page.ms : 0 };
  }
  return { ...next, pages, open };
}

/**
 * Pages du jour pour le panneau, la plus longtemps ouverte en tête. Fonction pure.
 * @returns {{key, url, title, ms, live: boolean}[]} live : ouverte dans un onglet en ce moment
 */
export function pagesToday(state, now = Date.now()) {
  const { pages, open } = advancePages(state, now);
  return Object.entries(pages)
    .map(([key, page]) => ({ key, ...page, live: open.includes(key) }))
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

export async function saveCraSettings(patch) {
  const craSettings = { ...(await getCraSettings()), ...patch };
  await chrome.storage.local.set({ craSettings });
  return craSettings;
}
