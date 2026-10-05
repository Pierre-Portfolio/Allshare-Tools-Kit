// Insigth — script de mesure (monde isolé de l'extension).
//
// Mesure le temps entre le CLIC et l'AFFICHAGE COMPLET de la page :
//
//  * Chargement complet (nouvelle page HTML) : le clic est mémorisé par le
//    service worker juste avant que l'ancienne page ne soit quittée ; la
//    nouvelle page le récupère et sert de point de départ. Sans clic (F5, URL
//    saisie), le départ est le début de la navigation.
//  * Navigation interne d'une SPA (Angular, React…) : départ au clic, mesure
//    conservée seulement si l'URL a changé.
//
// La page est considérée comme complètement affichée quand l'évènement load
// est passé, qu'aucune requête fetch/XHR n'est en cours et que le DOM n'a plus
// bougé pendant « quietMs ». La fin retenue est l'instant de la DERNIÈRE
// activité (dernière modification du DOM ou dernière réponse réseau) : le
// délai d'attente du calme n'est pas compté.
(() => {
  if (window.__insigthContent) return;
  window.__insigthContent = true;

  const now = () => performance.now();
  const ATTRIBUTES = ['class', 'style', 'hidden', 'src', 'open', 'disabled'];
  const DIRECT_NAV_MS = 1000; // écart max. entre la sortie de la page cliquée et le début de la navigation suivante

  let settings = null; // réglages, chargés de façon asynchrone
  let active = true; // false : enregistrement en pause
  let pending = 0; // requêtes fetch/XHR en cours
  let loaded = false; // évènement load terminé
  let navigating = false; // la page est en train d'être quittée
  let current = null; // mesure en cours
  let timer = 0;
  let ignoreSelector = '';
  let overlayHost = null; // indicateur affiché sur la page
  let overlayBox = null;
  let hideTimer = 0;
  let queued = null;

  // ---------- Mesure du chargement de cette page
  const navEntry = performance.getEntriesByType('navigation')[0];
  const navType = navEntry ? navEntry.type : 'navigate';
  if (navType !== 'back_forward' && !document.prerendering) {
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
  document.addEventListener('insigth:net-start', onNetStart);
  document.addEventListener('insigth:net-end', onNetEnd);

  // Ressources (images, CSS, scripts…) terminées pendant la mesure.
  let resourceObserver = null;
  try {
    resourceObserver = new PerformanceObserver((list) => {
      if (!current) return;
      const t = now();
      for (const e of list.getEntries()) if (e.responseEnd > current.start) activity(Math.min(e.responseEnd, t));
    });
    resourceObserver.observe({ type: 'resource', buffered: false });
  } catch {
    resourceObserver = null;
  }

  const onLoad = () =>
    setTimeout(() => {
      loaded = true;
      activity(now());
    }, 0);
  window.addEventListener('load', onLoad, { once: true });

  // Début de la sortie de la page (avant l'envoi de la requête de navigation).
  // Un clic mémorisé ne vaut que pour la navigation qui démarre à cet instant, pas
  // pour une page atteinte plus tard après un détour (page SSO, autre site…).
  const onLeave = () => {
    navigating = true;
    send({ type: 'left', t: performance.timeOrigin + now() });
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
    // Mémorisé côté service worker : si ce clic provoque le chargement d'une
    // nouvelle page, celle-ci partira de cet instant.
    send({ type: 'click', t: performance.timeOrigin + e.timeStamp });
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
    if (current) drop(current); // nouveau clic avant la fin : la mesure précédente n'a pas de sens
    current = m;
    ensureTimer();
  }

  function drop(m) {
    if (current === m) current = null;
    if (m.announced) hideOverlay();
  }

  function ensureTimer() {
    if (!timer) timer = setInterval(tick, 100);
  }

  function tick() {
    const m = current;
    if (!m) {
      clearInterval(timer);
      timer = 0;
      return;
    }
    if (!settings) return; // réglages pas encore reçus
    const t = now();
    if (m.kind === 'spa' && !m.announced && location.href !== m.href) {
      m.announced = true;
      showOverlay('pending', 'Insigth · mesure en cours…');
    }
    const ready = m.kind === 'spa' || loaded;
    if (ready && pending === 0 && t - m.lastActivity >= settings.quietMs) finish(m, false);
    else if (t - m.start >= settings.maxWaitMs) finish(m, true);
  }

  function finish(m, timedOut) {
    current = null;
    if (navigating) return; // la page est quittée : c'est la suivante qui mesurera
    if (m.kind === 'spa' && location.href === m.href) {
      // Clic sans changement de page (menu, case à cocher…) : rien à mesurer.
      send({ type: 'clearClick' });
      if (m.announced) hideOverlay();
      return;
    }
    const duration = Math.max(0, Math.round(m.lastActivity - m.start));
    send({
      type: 'measure',
      url: location.href,
      duration,
      kind: m.kind,
      trigger: m.trigger,
      timeout: timedOut,
      startEpoch: performance.timeOrigin + m.start,
    }).then((res) => {
      if (!res || !res.ok) {
        if (m.announced) hideOverlay();
        return;
      }
      const net = res.network === 'ethernet' ? 'Ethernet' : 'WiFi';
      const value = `${new Intl.NumberFormat('fr-FR').format(duration)} ms`;
      if (timedOut) showOverlay('warn', `⚠ ${res.page} · activité continue, arrêt à ${value} (${net})`);
      else showOverlay('ok', `✓ ${res.appName} · ${res.page} — ${value} (${net})`);
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
    active = !!next.recording;
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
    if (!active && current) drop(current);
  }

  function teardown() {
    observer.disconnect();
    if (resourceObserver) resourceObserver.disconnect();
    document.removeEventListener('insigth:net-start', onNetStart);
    document.removeEventListener('insigth:net-end', onNetEnd);
    window.removeEventListener('click', onUserAction, true);
    window.removeEventListener('keydown', onUserAction, true);
    window.removeEventListener('beforeunload', onLeave);
    window.removeEventListener('pagehide', onPageHide);
    clearInterval(timer);
    timer = 0;
    current = null;
    hideOverlay();
  }

  if (current) ensureTimer();

  send({ type: 'init', url: location.href }).then((res) => {
    if (!res || !res.app) {
      teardown(); // page hors des applications suivies
      return;
    }
    applySettings(res.settings);
    if (!active || !current || current.kind !== 'load') return;
    if (res.click) {
      // Clic fait sur la page précédente, juste avant le début de cette navigation.
      const rel = res.click.t - performance.timeOrigin;
      const direct = res.click.leftAt == null || performance.timeOrigin - res.click.leftAt <= DIRECT_NAV_MS;
      if (direct && rel <= 50 && -rel <= settings.maxWaitMs) {
        current.start = Math.min(rel, 0);
        current.trigger = 'click';
      }
    }
    current.announced = true;
    showOverlay('pending', 'Insigth · mesure du chargement…');
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings && settings && changes.settings.newValue) {
      applySettings({ ...settings, ...changes.settings.newValue });
    }
  });

  // ---------- Indicateur discret en bas à droite (Shadow DOM fermé)
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
      overlayHost = document.createElement('insigth-indicator');
      overlayHost.style.cssText =
        'all:initial;position:fixed;right:12px;bottom:12px;z-index:2147483647;pointer-events:none;';
      const root = overlayHost.attachShadow({ mode: 'closed' });
      root.innerHTML = `<style>
        .box{font:12px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#fff;
          background:#1f2937;border-left:4px solid #60a5fa;border-radius:6px;padding:6px 10px;
          box-shadow:0 2px 10px rgba(0,0,0,.25);max-width:420px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .box[data-tone=ok]{border-left-color:#34d399}
        .box[data-tone=warn]{border-left-color:#fbbf24}
        .box[hidden]{display:none}
      </style><div class="box" hidden></div>`;
      overlayBox = root.querySelector('.box');
      document.documentElement.appendChild(overlayHost);
    }
    overlayBox.textContent = text;
    overlayBox.dataset.tone = tone;
    overlayBox.hidden = false;
    clearTimeout(hideTimer);
    if (tone !== 'pending') hideTimer = setTimeout(hideOverlay, 5000);
  }

  function hideOverlay() {
    queued = null;
    clearTimeout(hideTimer);
    if (overlayBox) overlayBox.hidden = true;
  }
})();
