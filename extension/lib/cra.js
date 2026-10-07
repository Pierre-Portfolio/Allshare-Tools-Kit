// CRA : aide à la saisie du compte rendu d'activité.
//
// chrome.storage.local
//   craSettings  automatismes de la page de saisie du C.R.A (content/cra.js) :
//                { autoSave, autoHighlight }
//                (autoSave : clic sur « Save » quand on quitte une ligne modifiée de la grille)
//                (autoHighlight : case de l'étoile jaune cochée en arrivant sur la page)
// Capsules ouvertes dans la journée : capsules[].opens (réouvertures, voir lib/capsule.js) et date de sauvegarde.

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
 * Capsules ouvertes le jour de `date` : rouvertes, ou sauvegardées ce jour-là.
 * Fonction pure.
 * @returns {{capsule: object, events: {ts: number, saved: boolean}[]}[]} dans l'ordre de la première ouverture
 */
export function openedOn(capsules, date) {
  const [from, to] = dayBounds(date);
  const inDay = (ts) => ts >= from && ts < to;
  return capsules
    .map((capsule) => ({
      capsule,
      events: [
        ...(inDay(capsule.ts) ? [{ ts: capsule.ts, saved: true }] : []),
        ...(capsule.opens || []).filter(inDay).map((ts) => ({ ts, saved: false })),
      ].sort((a, b) => a.ts - b.ts),
    }))
    .filter((x) => x.events.length)
    .sort((a, b) => a.events[0].ts - b.events[0].ts);
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
