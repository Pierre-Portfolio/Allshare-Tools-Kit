// Insight — script de mesure (monde isolé de l'extension).
//
// Injecté uniquement pendant une mesure lancée depuis le panneau :
//  * mode « armed » : la page est affichée, on attend le clic de l'utilisateur.
//    Si le clic change l'URL sans recharger la page (SPA), la mesure se fait ici ;
//    s'il charge une nouvelle page, c'est la nouvelle page qui mesure.
//  * mode « load »  : nouvelle page chargée après le clic : départ = l'instant
//    du clic (sinon le début de la navigation, ex. URL saisie).
//
// Fin = AFFICHAGE COMPLET : évènement load passé, aucune requête fetch/XHR en
// cours et page stable pendant « quietMs ». La fin retenue est l'instant de la
// DERNIÈRE activité (modification du DOM ou réponse réseau) : le délai d'attente
// du calme n'est pas compté.
(() => {
  if (window.__insightContent) return;
  window.__insightContent = true;
  const injected = !!window.__insightInjected; // injecté dans une page déjà affichée
  window.__insightInjected = false;
  const fresh = !injected && document.readyState === 'loading';

  const now = () => performance.now();
  const ATTRIBUTES = ['class', 'style', 'hidden', 'src', 'open', 'disabled'];
  const DIRECT_NAV_MS = 1000; // écart max. entre la sortie de la page cliquée et le début de la navigation suivante

  let settings = null; // réglages, reçus du service worker
  let label = '';
  let active = false; // session de mesure confirmée par le service worker
  let pending = 0; // requêtes fetch/XHR en cours
  let loaded = !fresh; // évènement load terminé
  let navigating = false; // la page est en train d'être quittée
  let current = null; // mesure en cours
  let timer = 0;
  let ignoreSelector = '';
  let overlayHost = null;
  let overlayBox = null;
  let hideTimer = 0;
  let queued = null;

  // ---------- Chargement de cette page (mesuré seulement si le service worker le confirme)
  const navEntry = performance.getEntriesByType('navigation')[0];
  const navType = navEntry ? navEntry.type : 'navigate';
  if (fresh && navType !== 'back_forward' && !document.prerendering) {
    current = {
      kind: 'load',
      trigger: navType === 'reload' ? 'reload' : 'navigate',
      start: 0, // = performance.timeOrigin (début de la navigation)
      lastActivity: 0,
      href: location.href,
      announced: false,
    };
  }

  function activity(t) {
    if (current && t > current.lastActivity) current.lastActivity = t;
  }

  // ---------- Observation de l'activité
  const isOwnRecord = (r) =>
    overlayHost !== null &&
    r.type === 'childList' &&
    r.addedNodes.length + r.removedNodes.length > 0 &&
    [...r.addedNodes, ...r.removedNodes].every((n) => n === overlayHost);

  const isIgnored = (node) => {
    if (!ignoreSelector) return false;
    const el = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    return !!(el && el.closest(ignoreSelector));
  };

  const observer = new MutationObserver((records) => {
    if (!current) return;
    const t = now();
    for (const r of records) {
      if (isOwnRecord(r) || isIgnored(r.target)) continue;
      activity(t);
      return;
    }
  });
  observer.observe(document, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRIBUTES,
  });

  const onNetStart = () => {
    pending++;
  };
  const onNetEnd = () => {
    pending = Math.max(0, pending - 1);
    activity(now());
  };
  document.addEventListener('insight:net-start', onNetStart);
  document.addEventListener('insight:net-end', onNetEnd);
  document.dispatchEvent(new Event('insight:watch')); // script de page déjà là (mesure relancée dans cette page)

  // Ressources terminées pendant la mesure ; les appels fetch/XHR sont gardés pour le détail.
  const NET_TYPES = new Set(['fetch', 'xmlhttprequest']);
  const netEntries = [];
  let resourceObserver = null;
  try {
    resourceObserver = new PerformanceObserver((list) => {
      const t = now();
      for (const e of list.getEntries()) {
        if (NET_TYPES.has(e.initiatorType) && netEntries.length < 1000) {
          netEntries.push({ url: e.name, type: e.initiatorType, startTime: e.startTime, duration: e.duration });
        }
        if (current && e.responseEnd > current.start) activity(Math.min(e.responseEnd, t));
      }
    });
    resourceObserver.observe({ type: 'resource', buffered: true });
  } catch {
    resourceObserver = null;
  }

  /** Détail (type « Load timings ») : repères en ms depuis le clic + appels fetch/XHR. */
  function buildDetail(m) {
    const rel = (t) => Math.round(t - m.start);
    const marks = { end: rel(m.lastActivity) };
    const n = m.kind === 'load' ? performance.getEntriesByType('navigation')[0] : null;
    if (n) {
      Object.assign(marks, {
        navStart: rel(0),
        redirectStart: rel(n.redirectStart),
        redirectEnd: rel(n.redirectEnd),
        dnsStart: rel(n.domainLookupStart),
        dnsEnd: rel(n.domainLookupEnd),
        connectStart: rel(n.connectStart),
        connectEnd: rel(n.connectEnd),
        requestStart: rel(n.requestStart),
        responseStart: rel(n.responseStart),
        responseEnd: rel(n.responseEnd),
        domInteractive: rel(n.domInteractive),
        dclStart: rel(n.domContentLoadedEventStart),
        dclEnd: rel(n.domContentLoadedEventEnd),
        domComplete: rel(n.domComplete),
        loadStart: rel(n.loadEventStart),
        loadEnd: rel(n.loadEventEnd),
      });
    }
    const requests = netEntries
      .filter((e) => e.startTime >= m.start - 1 && e.startTime <= m.lastActivity)
      .map((e) => ({
        url: e.url.slice(0, 400),
        type: e.type === 'xmlhttprequest' ? 'XHR' : 'fetch',
        start: rel(e.startTime),
        duration: Math.round(e.duration),
      }));
    const slowest = [...requests].sort((a, b) => b.duration - a.duration).slice(0, 15);
    return {
      kind: n ? 'load' : 'spa',
      marks,
      requests: slowest.sort((a, b) => a.start - b.start),
      requestCount: requests.length,
    };
  }

  const onLoad = () =>
    setTimeout(() => {
      loaded = true;
      activity(now());
    }, 0);
  if (!loaded) window.addEventListener('load', onLoad, { once: true });

  // Début de la sortie de la page cliquée (avant l'envoi de la requête) : le chrono tourne.
  const onLeave = () => {
    navigating = true;
    if (active) send({ type: 'left', t: performance.timeOrigin + now() });
  };
  const onPageHide = () => {
    navigating = true;
  };
  window.addEventListener('beforeunload', onLeave);
  window.addEventListener('pagehide', onPageHide);

  // ---------- Clics (et touche Entrée) de l'utilisateur
  function onUserAction(e) {
    if (!e.isTrusted || !active || !settings) return;
    if (e.type === 'keydown' && (e.key !== 'Enter' || e.repeat || e.isComposing)) return;
    navigating = false;
    send({ type: 'click', t: performance.timeOrigin + e.timeStamp, url: location.href });
    start({
      kind: 'spa',
      trigger: 'click',
      start: e.timeStamp,
      lastActivity: e.timeStamp,
      href: location.href,
      announced: false,
    });
  }
  window.addEventListener('click', onUserAction, true);
  window.addEventListener('keydown', onUserAction, true);

  // ---------- Cycle de vie d'une mesure
  function start(m) {
    if (current && current.announced) showArmed(); // clic avant la fin : la mesure précédente est abandonnée
    current = m;
    ensureTimer();
  }

  function ensureTimer() {
    if (!timer) timer = setInterval(tick, 100);
  }

  function announce(m) {
    m.announced = true;
    send({ type: 'measuring', startEpoch: performance.timeOrigin + m.start });
    showOverlay('pending', `⏱ Mesure en cours… · ${label}`);
  }

  function tick() {
    const m = current;
    if (!m) {
      clearInterval(timer);
      timer = 0;
      return;
    }
    if (!settings || !active) return;
    const t = now();
    if (m.kind === 'spa' && !m.announced && location.href !== m.href) announce(m);
    const ready = m.kind === 'spa' || loaded;
    if (ready && pending === 0 && t - m.lastActivity >= settings.quietMs) finish(m, false);
    else if (t - m.start >= settings.maxWaitMs) finish(m, true);
  }

  function finish(m, timedOut) {
    current = null;
    if (navigating) return; // la page est quittée : c'est la suivante qui mesure
    if (m.kind === 'spa' && location.href === m.href) {
      // Clic sans changement de page (menu, champ…) : on reste en attente.
      send({ type: 'idle' });
      showArmed();
      return;
    }
    const duration = Math.max(0, Math.round(m.lastActivity - m.start));
    send({
      type: 'result',
      url: location.href,
      duration,
      kind: m.kind,
      trigger: m.trigger,
      timeout: timedOut,
      startEpoch: performance.timeOrigin + m.start,
      detail: buildDetail(m),
    }).then((res) => {
      if (!res || !res.ok) return;
      const value =
        settings && settings.unit === 'ms'
          ? `${new Intl.NumberFormat('fr-FR').format(duration)} ms`
          : `${(duration / 1000).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`;
      if (timedOut) showOverlay('warn', `⚠ ${res.label} — activité continue, arrêt à ${value}`);
      else showOverlay('ok', `✓ ${res.label} — ${value}`);
      teardown(true);
    });
  }

  // ---------- Communication avec le service worker
  function send(message) {
    try {
      return chrome.runtime.sendMessage(message).catch(() => null);
    } catch {
      teardown(); // extension rechargée : ce script est orphelin
      return Promise.resolve(null);
    }
  }

  function applySettings(next) {
    settings = next;
    ignoreSelector = '';
    const sel = String(next.ignoreSelectors || '').trim();
    if (sel) {
      try {
        document.createDocumentFragment().querySelector(sel);
        ignoreSelector = sel;
      } catch {
        /* sélecteur invalide : ignoré */
      }
    }
  }

  function onMessage(msg, _sender, sendResponse) {
    if (msg && msg.type === 'session-end') teardown();
    if (msg && msg.type === 'label') {
      label = msg.label;
      if (!current || !current.announced) showArmed();
    }
    sendResponse(true);
  }
  chrome.runtime.onMessage.addListener(onMessage);

  function teardown(keepOverlay = false) {
    active = false;
    observer.disconnect();
    if (resourceObserver) resourceObserver.disconnect();
    document.removeEventListener('insight:net-start', onNetStart);
    document.removeEventListener('insight:net-end', onNetEnd);
    document.dispatchEvent(new Event('insight:stop')); // plus de mesure ici : le script de page ne fait plus rien
    window.removeEventListener('click', onUserAction, true);
    window.removeEventListener('keydown', onUserAction, true);
    window.removeEventListener('beforeunload', onLeave);
    window.removeEventListener('pagehide', onPageHide);
    try {
      chrome.runtime.onMessage.removeListener(onMessage);
    } catch {
      /* contexte invalidé */
    }
    clearInterval(timer);
    timer = 0;
    current = null;
    window.__insightContent = false; // une nouvelle mesure pourra réinjecter le script
    if (!keepOverlay) hideOverlay();
  }

  if (current) ensureTimer();

  send({ type: 'hello', url: location.href, fresh }).then((res) => {
    if (!res || !res.mode) {
      teardown(); // aucune mesure en cours pour cet onglet
      return;
    }
    applySettings(res.settings);
    label = res.label;
    active = true;
    if (res.mode === 'load' && current && current.kind === 'load') {
      if (res.click) {
        // Clic fait sur la page précédente, juste avant le début de cette navigation.
        const rel = res.click.t - performance.timeOrigin;
        const direct = res.click.leftAt == null || performance.timeOrigin - res.click.leftAt <= DIRECT_NAV_MS;
        if (direct && rel <= 50 && -rel <= settings.maxWaitMs) {
          current.start = Math.min(rel, 0);
          current.trigger = 'click';
        }
      }
      announce(current);
      return;
    }
    if (current && current.kind === 'load') current = null; // page de départ : son chargement n'est pas mesuré
    showArmed();
  });

  // ---------- Indicateur en bas à droite (Shadow DOM fermé, ignoré par la mesure)
  function showArmed() {
    showOverlay('armed', `● Prêt — cliquez sur le lien à mesurer · ${label}`);
  }

  function showOverlay(tone, text) {
    if (!settings || !settings.showOverlay) return;
    if (document.readyState === 'loading' || !document.documentElement) {
      if (!queued)
        document.addEventListener('DOMContentLoaded', () => queued && showOverlay(...queued), { once: true });
      queued = [tone, text];
      return;
    }
    queued = null;
    if (!overlayHost || !overlayHost.isConnected) {
      overlayHost = document.createElement('insight-indicator');
      overlayHost.style.cssText =
        'all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;pointer-events:none;';
      const root = overlayHost.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>
        .box{font:12.5px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
          background:#1f2937;border-left:4px solid #60a5fa;border-radius:6px;padding:7px 11px;
          box-shadow:0 2px 12px rgba(0,0,0,.3);max-width:460px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .box[data-tone=armed]{border-left-color:#f59e0b}
        .box[data-tone=ok]{border-left-color:#34d399}
        .box[data-tone=warn]{border-left-color:#f87171}
        .box[hidden]{display:none}
      </style><div class="box" hidden></div>`;
      overlayBox = root.querySelector('.box');
      document.documentElement.appendChild(overlayHost);
    }
    overlayBox.textContent = text;
    overlayBox.dataset.tone = tone;
    overlayBox.hidden = false;
    clearTimeout(hideTimer);
    if (tone === 'ok' || tone === 'warn') hideTimer = setTimeout(hideOverlay, 6000);
  }

  function hideOverlay() {
    queued = null;
    clearTimeout(hideTimer);
    if (overlayBox) overlayBox.hidden = true;
  }
})();
