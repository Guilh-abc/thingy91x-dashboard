/* alerts-ui.js: alerta "veículo parado, dados sendo consumidos" do Rastreador (RF-04.1).
   Script clássico: window.AlertsUI e module.exports. Só usa registros reais.
   Limiar em localStorage('ntn.alertVeicParado'), padrão { minMin: 15, minMsgs: 3 }. */
(function () {
  'use strict';
  var KEY = 'ntn.alertVeicParado', DEF = { minMin: 15, minMsgs: 3, maxM: 50 };
  var T = function (r) { return Date.parse(r.ts || r.rx); };
  function dist(a, b) { var R = 6371000, k = Math.PI / 180, dLa = (b.lat - a.lat) * k, dLo = (b.lon - a.lon) * k, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  /* ponto bom: GNSS ou precisão < 200 m (célula e posição salva não servem para medir movimento) */
  function bom(r) { if (r.lat == null || r.lon == null) return false; var s = r.posSrc || ''; if (s === 'gnss') return true; if (/^celula|^salva|^injetada/.test(s)) return false; return r.acc != null && r.acc < 200; }
  function cfg() { var c = {}; try { c = JSON.parse((typeof localStorage !== 'undefined' && localStorage.getItem(KEY)) || '{}') || {}; } catch (e) { c = {}; } return { minMin: +c.minMin || DEF.minMin, minMsgs: +c.minMsgs || DEF.minMsgs, maxM: DEF.maxM }; }

  /* online: true/false vindo de RF-02 (HealthBadge); null = não verificar */
  function compute(records, now, c, online) {
    c = c || cfg(); now = now == null ? Date.now() : now;
    var rs = (records || []).filter(function (r) { return r && !isNaN(T(r)) && T(r) <= now; }).sort(function (a, b) { return T(a) - T(b); });
    var res = { on: false, reason: '', since: null, min: null, msgs: 0, bytes: null, cfg: c };
    if (online === false) { res.reason = 'aparelho fora do ar'; return res; }
    var pts = rs.filter(bom);
    if (!pts.length) { res.reason = 'sem GPS'; return res; }
    var last = pts[pts.length - 1];
    if (now - T(last) > c.minMin * 60000) { res.reason = 'sem GPS recente'; return res; }
    // volta no tempo enquanto os pontos ficam a menos de maxM do último
    var since = T(last);
    for (var i = pts.length - 1; i >= 0; i--) { if (dist(pts[i], last) >= c.maxM) break; since = T(pts[i]); }
    var span = now - since;
    if (span < c.minMin * 60000) { res.reason = 'em movimento'; return res; }
    var tel = rs.filter(function (r) { return r.type === 'telemetry' && T(r) >= since; });
    var b = 0, hasB = false; tel.forEach(function (r) { if (typeof r.bytes === 'number') { b += r.bytes; hasB = true; } });
    res.since = since; res.min = Math.round(span / 60000); res.msgs = tel.length; res.bytes = hasB ? b : null;
    if (tel.length < c.minMsgs) { res.reason = 'poucas mensagens'; return res; }
    res.on = true; return res;
  }
  function fb(b) { if (b == null) return 'sem dados'; if (b < 1024) return b + ' B'; return (b / 1024).toFixed(1) + ' KB'; }
  function fmtMin(m) { return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
  function html(a) {
    if (!a || !a.on) return '';
    return '<div class="al al--warn">🚗 Veículo parado há ' + fmtMin(a.min) + ': ' + fb(a.bytes) + ' enviados em ' + a.msgs + ' mensagens</div>';
  }
  function render(id, records, now) {
    var el = typeof document !== 'undefined' && document.getElementById(id); if (!el) return null;
    var online = null;
    if (typeof window !== 'undefined' && window.HealthBadge && window.HealthBadge.compute) online = window.HealthBadge.compute(records, now).state === 'online';
    var a = compute(records, now, cfg(), online); el.innerHTML = html(a); return a;
  }
  var api = { compute: compute, html: html, render: render, cfg: cfg, KEY: KEY };
  if (typeof window !== 'undefined') window.AlertsUI = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
