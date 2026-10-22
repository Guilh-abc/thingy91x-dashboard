/* pwa.js: PWA comum aos três painéis (RF-07). Script clássico: window.Pwa e module.exports.
   H2: registro do service worker. H3: banner de dados salvos quando offline. */
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
  // H3: "DD/MM HH:MM" no horário de Brasília
  function fmtCachedAt(iso) {
    const t = Date.parse(iso); if (isNaN(t)) return '';
    const p = {}; new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date(t)).forEach((x) => { p[x.type] = x.value; });
    return p.day + '/' + p.month + ' ' + p.hour + ':' + p.minute;
  }
  function bannerText(iso) { const f = fmtCachedAt(iso); return f ? 'Sem conexão: mostrando dados salvos de ' + f + ' (BRT)' : ''; }
  function banner(create) {
    if (typeof document === 'undefined') return null;
    let el = document.getElementById('pwaOffline');
    if (!el && create) {
      el = document.createElement('div'); el.id = 'pwaOffline'; el.setAttribute('role', 'status'); el.hidden = true;
      el.style.cssText = 'position:sticky;top:0;z-index:9999;background:#b45309;color:#fff;font:600 14px/1.4 Inter,system-ui,sans-serif;padding:8px 14px;text-align:center';
      document.body.insertBefore(el, document.body.firstChild);
    }
    return el;
  }
  function showOffline(iso) { const t = bannerText(iso); const el = banner(!!t); if (!el) return; el.textContent = t; el.hidden = !t; }
  function hideOffline() { const el = banner(false); if (el) el.hidden = true; }
  // Chamado pelo api-core.js e pelo consumo.js com o JSON da API.
  function noteData(j) { if (j && j.__cachedAt) showOffline(j.__cachedAt); else hideOffline(); return j; }
  if (typeof window !== 'undefined' && window.addEventListener) window.addEventListener('online', hideOffline);
  const Pwa = { swUrl, register, fmtCachedAt, bannerText, showOffline, hideOffline, noteData };
  if (typeof window !== 'undefined') { window.Pwa = Pwa; if (typeof document !== 'undefined') register(); }
  if (typeof module !== 'undefined' && module.exports) module.exports = Pwa;
})(typeof window !== 'undefined' ? window : globalThis);
