// URL de base des applications (facultatives) : elles servent à pré-remplir le
// nom de l'application d'après l'onglet ouvert.

/** Analyse une URL de base saisie par l'utilisateur. Renvoie null si invalide. */
export function parseBase(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const path = u.pathname.replace(/\/+$/, '');
  return { origin: u.origin, hostname: u.hostname, protocol: u.protocol, path };
}

/**
 * Application dont une URL de base correspond à l'URL donnée (la plus longue
 * l'emporte). Comparaison du chemin sans tenir compte de la casse.
 * @returns {{app: object, basePath: string} | null}
 */
export function matchApp(url, apps) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const path = u.pathname.toLowerCase();
  let best = null;
  for (const app of apps || []) {
    for (const raw of app.baseUrls || []) {
      const b = parseBase(raw);
      if (!b || b.origin !== u.origin) continue;
      const bp = b.path.toLowerCase();
      if (bp === '' || path === bp || path.startsWith(bp + '/')) {
        if (!best || b.path.length > best.basePath.length) best = { app, basePath: b.path };
      }
    }
  }
  return best;
}

/**
 * Fin d'URL : dernier segment du chemin + paramètres.
 * Ex. https://srv/apex/f?p=103:21:1234 -> « f?p=103:21:1234 » (Oracle APEX).
 */
export function urlEnd(url) {
  try {
    const u = new URL(url);
    const segs = u.pathname.split('/');
    let last = segs.pop();
    if (!last && segs.length > 1) last = `${segs.pop()}/`;
    return (last || '/') + u.search + u.hash;
  } catch {
    return '';
  }
}
