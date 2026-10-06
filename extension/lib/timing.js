// Détail d'une mesure (équivalent du tableau « Load timings ») : étapes du
// chargement à partir des repères enregistrés par le script de mesure.
//
// detail = {
//   kind: 'load' | 'spa',
//   marks: { navStart, redirectStart, redirectEnd, dnsStart, dnsEnd, connectStart, connectEnd,
//            requestStart, responseStart, responseEnd, domInteractive, dclStart, dclEnd,
//            domComplete, loadStart, loadEnd, end }   // ms depuis le clic
//   requests: [{ url, type, start, duration }],      // appels fetch/XHR (les plus lents)
//   requestCount,
// }

const span = (a, b) => (Number.isFinite(a) && Number.isFinite(b) && b >= a ? [a, b] : null);

/** Étapes affichables : [{ id, label, start, duration, end, sub }] (ms depuis le clic). */
export function phases(detail) {
  if (!detail || !detail.marks) return [];
  const m = detail.marks;
  const out = [];
  const push = (id, label, s, sub = false) => {
    if (!s) return;
    const [a, b] = s.map(Math.round);
    out.push({ id, label, start: a, duration: b - a, end: b, sub });
  };
  if (detail.kind === 'load') {
    if (m.navStart > 0) push('clickToNav', 'Clic → navigation', span(0, m.navStart));
    push('redirect', 'Redirection', span(m.redirectStart, m.redirectEnd));
    push('dns', 'DNS', span(m.dnsStart, m.dnsEnd));
    push('connect', 'Connexion', span(m.connectStart, m.connectEnd));
    push('request', 'Requête (attente serveur)', span(m.requestStart, m.responseStart));
    push('response', 'Réponse (téléchargement)', span(m.responseStart, m.responseEnd));
    push('dom', 'DOM', span(m.responseEnd, m.domComplete));
    push('interactive', 'Interactive', span(m.domInteractive, m.domInteractive), true);
    push('contentLoaded', 'Content loaded', span(m.dclStart, m.dclEnd), true);
    push('load', 'Évènement load', span(m.loadStart, m.loadEnd));
    push('afterLoad', 'Après load (AJAX, affichage)', span(m.loadEnd, m.end));
  } else {
    const reqs = detail.requests || [];
    if (reqs.length) {
      const first = Math.min(...reqs.map((r) => r.start));
      const last = Math.max(...reqs.map((r) => r.start + r.duration));
      if (first > 0) push('beforeAjax', 'Avant les requêtes', span(0, first));
      push('ajax', 'Requêtes (AJAX)', span(first, last));
      push('render', 'Affichage', span(last, m.end));
    } else {
      push('render', 'Affichage', span(0, m.end));
    }
  }
  push('total', 'Total', span(0, m.end));
  return out;
}

/** Colonnes fixes pour les exports du détail. */
export const DETAIL_COLUMNS = [
  ['clickToNav', 'Clic → navigation'],
  ['redirect', 'Redirection'],
  ['dns', 'DNS'],
  ['connect', 'Connexion'],
  ['request', 'Attente serveur'],
  ['response', 'Téléchargement'],
  ['dom', 'DOM'],
  ['load', 'Évènement load'],
  ['afterLoad', 'Après load'],
  ['ajax', 'Requêtes AJAX (SPA)'],
];

/** Durées par étape (ms) + requête la plus lente, pour une ligne d'export. */
export function detailSummary(detail) {
  const byId = Object.fromEntries(phases(detail).map((p) => [p.id, p.duration]));
  const reqs = (detail && detail.requests) || [];
  const slowest = reqs.reduce((a, r) => (!a || r.duration > a.duration ? r : a), null);
  return {
    durations: DETAIL_COLUMNS.map(([id]) => (id in byId ? byId[id] : null)),
    requestCount: detail ? detail.requestCount || reqs.length : null,
    slowest,
  };
}
