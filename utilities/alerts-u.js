/* alerts-u.js: alerta "possível vazamento" do medidor (RF-04.2).
   Script clássico: window.AlertsU e module.exports. Usa só totalL, deltaL e alarm reais.
   A: alarme leak da placa nos últimos 90 min.
   B: todas as leituras dos últimos 60 min com deltaL > 0 (mínimo 3 leituras cobrindo 45 min).
   C: mais de 500 L/h calculado de totalL (leituras com 60 min a 2 h de distância). */
(function () {
  'use strict';
  var T = function (r) { return Date.parse(r.ts || r.rx); };
  var MIN = 60000;
  function compute(records, now) {
    now = now == null ? Date.now() : now;
    var rs = (records || []).filter(function (r) { return r && !isNaN(T(r)) && T(r) <= now; }).sort(function (a, b) { return T(a) - T(b); });
    var rd = rs.filter(function (r) { return r.type === 'telemetry' && typeof r.totalL === 'number'; });
    var last = rd[rd.length - 1];
    function vol(from) { if (!last) return null; var b = null; for (var i = rd.length - 1; i >= 0; i--) { if (T(rd[i]) <= from) { b = rd[i]; break; } } return b ? Math.max(0, last.totalL - b.totalL) : null; }
    // A
    var al = rs.filter(function (r) { return r.type === 'alarm' && r.event === 'leak' && now - T(r) <= 90 * MIN; }).pop();
    if (al) return { on: true, rule: 'A', since: T(al), litros: vol(T(al)), min: last && T(last) > T(al) ? Math.round((T(last) - T(al)) / MIN) : null };
    // B
    var w = rd.filter(function (r) { return now - T(r) <= 60 * MIN && typeof r.deltaL === 'number'; });
    if (w.length >= 3 && T(w[w.length - 1]) - T(w[0]) >= 45 * MIN && w.every(function (r) { return r.deltaL > 0; })) {
      var s = 0; w.forEach(function (r) { s += r.deltaL; });
      return { on: true, rule: 'B', since: T(w[0]), litros: s, min: Math.round((T(w[w.length - 1]) - T(w[0])) / MIN) };
    }
    // C
    if (last && now - T(last) <= 60 * MIN) {
      for (var i = rd.length - 2; i >= 0; i--) {
        var dt = T(last) - T(rd[i]);
        if (dt >= 60 * MIN) {
          if (dt <= 120 * MIN) { var d = last.totalL - rd[i].totalL, lh = d / (dt / 3600000); if (lh > 500) return { on: true, rule: 'C', since: T(rd[i]), litros: d, min: Math.round(dt / MIN), lh: Math.round(lh) }; }
          break;
        }
      }
    }
    return { on: false };
  }
  function hm(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }); }
  function html(a) {
    if (!a || !a.on) return '';
    var v = a.litros != null ? '+' + Math.round(a.litros).toLocaleString('pt-BR') + ' L' : 'volume sem dados';
    var m = a.min != null ? ' em ' + a.min + ' min' : '';
    var why = a.rule === 'A' ? 'alarme de vazamento enviado pela placa' : a.rule === 'B' ? 'consumo contínuo em todas as leituras da última hora' : 'consumo acima de 500 L/h (' + a.lh + ' L/h)';
    return '<div class="al al--danger">💧 Possível vazamento: ' + v + m + ' (desde ' + hm(a.since) + ' BRT)<br><small>' + why + '</small></div>';
  }
  /* Faixa vermelha fixa no topo: some com "OK, já vi" e só volta com um alarme novo (chave = hora do alarme). */
  var ACK = 'ntn.leakAck';
  function banner(a) {
    if (typeof document === 'undefined') return;
    var b = document.getElementById('leakBanner');
    var ack = null; try { ack = localStorage.getItem(ACK); } catch (e) {}
    if (!a || !a.on || String(a.since) === ack) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('div'); b.id = 'leakBanner'; b.setAttribute('role', 'alert'); document.body.prepend(b); }
    var v = a.litros != null ? ', +' + Math.round(a.litros).toLocaleString('pt-BR') + ' L' : '';
    b.innerHTML = '<span>💧 ALARME: possível vazamento desde ' + hm(a.since) + ' BRT' + v + '</span><button type="button">OK, já vi</button>';
    b.querySelector('button').onclick = function () { try { localStorage.setItem(ACK, String(a.since)); } catch (e) {} b.remove(); };
  }
  function render(id, records, now) { var a = compute(records, now); banner(a); var el = typeof document !== 'undefined' && document.getElementById(id); if (el) el.innerHTML = html(a); return a; }
  var api = { compute: compute, html: html, render: render };
  if (typeof window !== 'undefined') window.AlertsU = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
