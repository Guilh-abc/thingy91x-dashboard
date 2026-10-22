/* pwa.js: PWA comum aos três painéis (RF-07). Script clássico: window.Pwa e module.exports.
   H2: registro do service worker. */
(function (root) {
  function swUrl(loc) {
    // No GitHub Pages o site fica em /thingy91x-dashboard/; no localhost, na raiz servida.
    const base = /\/thingy91x-dashboard\//.test(loc.pathname) ? '/thingy91x-dashboard/' : '/';
    return { url: base + 'service-worker.js?v=36', scope: base };
  }
  function register() {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const s = swUrl(location);
    navigator.serviceWorker.register(s.url, { scope: s.scope }).catch((e) => console.warn('pwa: service worker não registrado', e));
  }
  const Pwa = { swUrl, register };
  if (typeof window !== 'undefined') { window.Pwa = Pwa; if (typeof document !== 'undefined') register(); }
  if (typeof module !== 'undefined' && module.exports) module.exports = Pwa;
})(typeof window !== 'undefined' ? window : globalThis);
