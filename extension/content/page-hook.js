// Insight — script injecté dans le contexte de la page (monde « MAIN »).
//
// Il enveloppe fetch() et XMLHttpRequest pour signaler le début et la fin de
// chaque requête au script de mesure (content.js) via deux évènements DOM :
// « insight:net-start » et « insight:net-end ». Le comportement de la page
// n'est pas modifié.
//
// Une requête fetch se termine quand son corps est entièrement reçu (la promesse de fetch
// se résout dès les en-têtes), comme XMLHttpRequest avec « loadend ».
// Hors mesure, le script ne fait rien : content.js envoie « insight:stop » quand aucune mesure
// ne concerne l'onglet (ou qu'elle est finie) et « insight:watch » quand une mesure reprend.
(() => {
  if (window.__insightPageHook) return;
  Object.defineProperty(window, '__insightPageHook', { value: true });

  let watching = true;
  document.addEventListener('insight:stop', () => {
    watching = false;
  });
  document.addEventListener('insight:watch', () => {
    watching = true;
  });

  const emit = (type) => watching && document.dispatchEvent(new Event(type));

  /** Fin de la requête : corps lu jusqu'au bout sur une copie (flux d'évènements : dès les en-têtes). */
  function endWithBody(response) {
    const type = (response.headers && response.headers.get('content-type')) || '';
    let reader = null;
    try {
      if (watching && response.body && !response.bodyUsed && !/event-stream/i.test(type)) {
        reader = response.clone().body.getReader();
      }
    } catch {
      reader = null;
    }
    if (!reader) return emit('insight:net-end');
    const end = () => emit('insight:net-end');
    const pump = () => reader.read().then(({ done }) => (done ? end() : pump()), end);
    pump();
  }

  const nativeFetch = window.fetch;
  if (typeof nativeFetch === 'function') {
    window.fetch = function fetch(...args) {
      emit('insight:net-start');
      let promise;
      try {
        promise = nativeFetch.apply(window, args);
      } catch (e) {
        emit('insight:net-end');
        throw e;
      }
      promise.then(endWithBody, () => emit('insight:net-end'));
      return promise;
    };
  }

  const proto = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (proto && typeof proto.send === 'function') {
    const nativeSend = proto.send;
    proto.send = function send(...args) {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        this.removeEventListener('loadend', finish);
        emit('insight:net-end');
      };
      this.addEventListener('loadend', finish);
      emit('insight:net-start');
      try {
        const result = nativeSend.apply(this, args);
        if (this.readyState === 4) finish(); // requête synchrone
        return result;
      } catch (e) {
        finish();
        throw e;
      }
    };
  }
})();
