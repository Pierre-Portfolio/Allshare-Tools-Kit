// Insight — script injecté dans le contexte de la page (monde « MAIN »).
//
// Il enveloppe fetch() et XMLHttpRequest pour signaler le début et la fin de
// chaque requête au script de mesure (content.js) via deux évènements DOM :
// « insight:net-start » et « insight:net-end ». Le comportement de la page
// n'est pas modifié.
(() => {
  if (window.__insightPageHook) return;
  Object.defineProperty(window, '__insightPageHook', { value: true });

  const emit = (type) => document.dispatchEvent(new Event(type));

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
      promise.then(
        () => emit('insight:net-end'),
        () => emit('insight:net-end'),
      );
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
