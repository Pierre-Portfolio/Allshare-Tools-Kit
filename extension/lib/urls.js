// Rattachement d'une URL à une application et calcul de la « clé de page ».
//
// Une application est définie par une ou plusieurs URL de base
// (ex. https://appli1.monsite.fr/ ou https://serveur/appli1/). La clé de page
// est le chemin relatif à cette URL de base : c'est elle qui permet d'aligner
// « la même page » entre plusieurs applications quasi identiques.

// Segment considéré comme un identifiant : nombre, UUID ou long hexadécimal.
const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|(?=[0-9a-f]*\d)[0-9a-f]{16,})$/i;

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

/** Motifs d'injection Chrome (match patterns) pour une URL de base. */
export function matchPatternsFor(raw) {
  const b = parseBase(raw);
  // Sans port : Chrome fait alors correspondre tous les ports de l'hôte.
  return b ? [`${b.protocol}//${b.hostname}/*`] : [];
}

/**
 * Trouve l'application (et l'URL de base) correspondant à une URL.
 * En cas de chevauchement, l'URL de base la plus longue l'emporte.
 * @returns {{app: object, basePath: string} | null}
 */
export function matchApp(url, apps, settings = {}) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const ci = settings.caseInsensitive !== false;
  const path = ci ? u.pathname.toLowerCase() : u.pathname;
  let best = null;
  for (const app of apps || []) {
    for (const raw of app.baseUrls || []) {
      const b = parseBase(raw);
      if (!b || b.origin !== u.origin) continue;
      const bp = ci ? b.path.toLowerCase() : b.path;
      if (bp === '' || path === bp || path.startsWith(bp + '/')) {
        if (!best || b.path.length > best.basePath.length) best = { app, basePath: b.path };
      }
    }
  }
  return best;
}

function normalizePath(path, settings) {
  const segments = path.split('/').map((s) => {
    let d = s;
    try {
      d = decodeURIComponent(s);
    } catch {
      /* segment laissé tel quel */
    }
    return settings.replaceIds !== false && ID_SEGMENT.test(d) ? ':id' : d;
  });
  let out = segments.join('/');
  if (out.length > 1) out = out.replace(/\/+$/, '');
  return out || '/';
}

/**
 * Clé de page d'une URL, relative au chemin de base de l'application.
 * Ex. https://srv/appli1/Clients/42?tab=2 (base /appli1) -> "/clients/:id"
 * Les routes « hash » des SPA (#/... ou #!/...) sont conservées.
 */
export function pageKey(url, basePath = '', settings = {}) {
  const u = new URL(url);
  let rest = u.pathname.slice(basePath.length);
  if (!rest.startsWith('/')) rest = '/' + rest;
  let key = normalizePath(rest, settings);

  const hash = u.hash.match(/^#!?(\/[^?]*)(\?.*)?$/);
  if (hash) {
    key += '#' + normalizePath(hash[1], settings);
    if (settings.ignoreQuery === false && hash[2]) key += hash[2];
  }
  if (settings.ignoreQuery === false && u.search) key += u.search;
  return settings.caseInsensitive !== false ? key.toLowerCase() : key;
}

/** Tri des pages : la racine d'abord, puis ordre alphabétique naturel. */
export function comparePages(a, b) {
  if (a === b) return 0;
  if (a === '/') return -1;
  if (b === '/') return 1;
  return a.localeCompare(b, 'fr', { numeric: true, sensitivity: 'base' });
}
