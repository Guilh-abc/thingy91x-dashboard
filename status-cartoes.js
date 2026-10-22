/* status-cartoes.js: status ao vivo nos cartões [data-hub] (hub e seleção de rastreador). Só leitura.
   ntn e utilities: API ntn-lab. thingy91x: nRF Cloud com a chave salva neste navegador (nunca enviada a outro lugar).
   Fallback: "Sem dados" em cinza se a leitura falhar ou demorar. */
(function (root) {
  var ROT = { online: ['ok', 'Online'], atrasado: ['info', 'Atrasado'], parado: ['alerta', 'Desligado'] };
  function idade(s) { return s == null ? '' : s < 90 ? ' · há ' + s + ' s' : s < 5400 ? ' · há ' + Math.round(s / 60) + ' min' : s < 172800 ? ' · há ' + Math.round(s / 3600) + ' h' : ' · há ' + Math.round(s / 86400) + ' d'; }
  function porIdade(s) { return s == null ? null : s < 900 ? 'online' : s < 3600 ? 'atrasado' : 'parado'; }
  /* Puro: maior data ISO encontrada num objeto (para o shadow do nRF Cloud). */
  function ultimaData(o, agora) {
    var m = 0, txt = JSON.stringify(o || {}), re = /"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)"/g, x;
    while ((x = re.exec(txt))) { var t = Date.parse(x[1]); if (t > m && t <= (agora || Date.now()) + 60000) m = t; }
    return m || null;
  }
  root.StatusCartoes = { porIdade: porIdade, ultimaData: ultimaData };
  if (typeof document === 'undefined') return;
  var H = location.hostname, PROXY = /(netlify\.app|pages\.dev)$/i.test(H);
  var API = (PROXY ? '' : 'https://thingy91x-x-dashboard.netlify.app') + '/.netlify/functions/ntn-lab';
  var NRF = (PROXY ? '' : 'https://thingy91x-x-dashboard.netlify.app') + '/.netlify/functions/nrfcloud';
  function marcar(id, cls, txt) { document.querySelectorAll('[data-hub="' + id + '"] .hub-st').forEach(function (el) { el.className = 'hub-st st-' + cls; el.textContent = txt; }); }
  function semDados(id) { marcar(id, 'neutro', 'Sem dados'); }
  function comTempo(p, ms) { return Promise.race([p, new Promise(function (_, r) { setTimeout(function () { r(new Error('tempo')); }, ms); })]); }
  function pelaApi(id, q) {
    comTempo(fetch(API + '?' + q + '=1&days=2&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }), 12000).then(function (j) {
      var h = root.HealthBadge && root.HealthBadge.compute(j.records || [], Date.now());
      if (!h || !h.lastRx) return semDados(id);
      var r = ROT[h.state] || ['neutro', 'Sem dados']; marcar(id, r[0], r[1] + idade(h.ageSec));
    }).catch(function () { semDados(id); });
  }
  function thingy(id) {
    var ls = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    var key = ls('nrf_api_key'), dev = ls('nrf_device_id'), mail = ls('nrf_user_email');
    if (!key || !dev) return marcar(id, 'neutro', 'Sem chave');
    var hd = { Authorization: mail ? 'Basic ' + btoa(unescape(encodeURIComponent(mail + ':' + key))) : 'Bearer ' + key, 'X-User-Api-Key': key,
      'X-Memfault-Org': ls('nrf_org_slug') || 'telekom', 'X-Memfault-Project': ls('nrf_project_slug') || 'nrf-project' };
    if (mail) hd['X-User-Email'] = mail; if (ls('nrf_team_api_key')) hd['X-Nrf-Team-Key'] = ls('nrf_team_api_key');
    comTempo(fetch(NRF + '/devices/' + encodeURIComponent(dev), { headers: hd, cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }), 12000).then(function (d) {
      var t = ultimaData(d), s = t ? Math.round((Date.now() - t) / 1000) : null, e = porIdade(s);
      if (!e) return semDados(id); var r = ROT[e]; marcar(id, r[0], r[1] + idade(s));
    }).catch(function () { semDados(id); });
  }
  function ciclo() {
    var tem = function (id) { return document.querySelector('[data-hub="' + id + '"]'); };
    if (tem('ntn')) pelaApi('ntn', 'pro');
    if (tem('utilities')) pelaApi('utilities', 'meter');
    if (tem('thingy91x')) thingy('thingy91x');
    setTimeout(ciclo, 60000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ciclo); else ciclo();
})(typeof window !== 'undefined' ? window : globalThis);
