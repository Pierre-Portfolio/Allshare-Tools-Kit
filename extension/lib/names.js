// Noms d'applications et de pages saisis dans le formulaire : normalisation,
// suggestions (application de l'onglet, page suivante).

import { matchApp } from './urls.js';

/** Espaces superflus supprimés : « Client  A » -> « Client A ». */
export const normName = (s) =>
  String(s || '')
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ');

/** Clé de comparaison : sans tenir compte de la casse ni des espaces. */
export const nameKey = (s) => normName(s).toLowerCase();

/** Tri « naturel » : Client 2 avant Client 10. */
export const compareNames = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true, sensitivity: 'base' });

/** Reprend l'orthographe d'un nom déjà connu (évite « client a » à côté de « Client A »). */
export function canonical(name, known) {
  const key = nameKey(name);
  return known.find((n) => nameKey(n) === key) || normName(name);
}

function pathSegments(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return { origin: u.origin.toLowerCase(), segs: u.pathname.toLowerCase().split('/').filter(Boolean) };
  } catch {
    return null;
  }
}

/**
 * Application probable pour l'onglet courant :
 *  1. une URL déclarée dans le référentiel (Réglages > Applications) ;
 *  2. sinon, la mesure la plus récente faite sur le même site (même origine et
 *     plus long début de chemin commun : srv/clientA/… ≠ srv/clientB/…).
 */
export function suggestApp(url, apps, measures) {
  const declared = matchApp(
    url,
    apps.filter((a) => a.baseUrls && a.baseUrls.length),
  );
  if (declared) return declared.app.name;

  const here = pathSegments(url);
  if (!here) return null;
  let best = null;
  let bestScore = -1;
  const sameOrigin = new Set();
  for (let i = measures.length - 1; i >= 0; i--) {
    const m = measures[i];
    const there = pathSegments(m.startUrl || m.url);
    if (!there || there.origin !== here.origin) continue;
    sameOrigin.add(nameKey(m.app));
    let score = 0;
    while (score < here.segs.length && score < there.segs.length && here.segs[score] === there.segs[score]) score++;
    if (score > bestScore) {
      bestScore = score;
      best = m.app;
    }
  }
  if (!best) return null;
  // Plusieurs applis sur le même hôte sans chemin commun : on ne devine pas.
  return bestScore > 0 || sameOrigin.size === 1 ? best : null;
}

/**
 * Page suivante à mesurer : la première page de la liste, après la page
 * courante, qui n'a pas encore de mesure pour cette application et ce réseau.
 * @param {string[]} pages   pages dans l'ordre du référentiel
 * @param {Set<string>} done clés (nameKey) des pages déjà mesurées
 */
export function nextPage(pages, current, done) {
  if (!pages.length) return '';
  const start = pages.findIndex((p) => nameKey(p) === nameKey(current));
  for (let i = 1; i <= pages.length; i++) {
    const p = pages[(start + i + pages.length) % pages.length];
    if (!done.has(nameKey(p)) && nameKey(p) !== nameKey(current)) return p;
  }
  return '';
}
