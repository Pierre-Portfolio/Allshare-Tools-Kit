// CRA : aide à la saisie du compte rendu d'activité.
//
// chrome.storage.local
//   craSettings  automatismes de la page de saisie du C.R.A (content/cra.js) :
//                { autoSave, autoHighlight }
//                (autoSave : clic sur « Save » quand on quitte une ligne modifiée de la grille)
//                (autoHighlight : case de l'étoile jaune, le surlignage de la grille, décochée en arrivant sur la page)
// Capsules ouvertes dans la journée : capsules[].opens (réouvertures, voir lib/capsule.js) et date de sauvegarde ;
// temps d'ouverture : capsules[].spans (de la sauvegarde ou d'une réouverture à la fermeture de ses fenêtres).

/** Début des adresses de la page de saisie du C.R.A (Oracle APEX). */
export const CRA_PAGE = 'https://dsb-cra.allshare-scenario.fr/apex/r/allshare_wks/xaas/saisie-cra?';

export const DEFAULT_CRA = { autoSave: false, autoHighlight: false };

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
