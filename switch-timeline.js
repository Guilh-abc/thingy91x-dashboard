/* switch-timeline.js: linha do tempo de comutações compartilhada (RF-03).
   Script clássico: expõe window.SwitchTimeline e module.exports (testes Node).
   Lê só registros reais; campo ausente aparece como "sem dados". */
(function (root) {
  'use strict';
  var T = function (r) { return Date.parse(r.ts || r.rx); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function fmtDur(s) {
    if (s == null || isNaN(s)) return 'sem dados';
    s = Math.round(s); if (s < 60) return s + ' s';
    var m = Math.floor(s / 60), r = s % 60; if (m < 60) return m + ' min' + (r ? ' ' + r + ' s' : '');
    return Math.floor(m / 60) + ' h ' + (m % 60) + ' min';
  }
  function hms(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' }); }
  function dm(ms) { return new Date(ms).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' }); }
  var NAME = { catm: 'Cat-M', ntn: 'Satélite' };

  /* Monta as comutações a partir dos eventos.
     Rastreador: sw(value 1/0) seguido de fix, reg ou fail.
     Medidor: sat_start ou sw, seguido de gnss_ok/gnss_fail/fix, sat_reg ou reg, fail. */
  function build(records) {
    var rs = (records || []).filter(function (r) { return r && !isNaN(T(r)); }).sort(function (a, b) { return T(a) - T(b); });
    var out = [], cur = null;
    function push() { if (cur) out.push(cur); cur = null; }
    for (var i = 0; i < rs.length; i++) {
      var r = rs[i], e = r.type === 'event' ? r.event : null, t = T(r);
      if (e === 'sw' && (r.info === 'boot' || r.info === 'reinicio')) continue;
      var startTo = null;
      if (e === 'sat_start') startTo = 'ntn';
      else if (e === 'sw') startTo = r.value === 1 ? 'ntn' : 'catm';
      if (startTo) {
        // sw logo depois de sat_start faz parte da mesma tentativa
        if (cur && e === 'sw' && cur.to === startTo && cur.src === 'sat_start' && t - cur.atMs < 120000) continue;
        push();
        cur = { at: r.ts || r.rx, atMs: t, src: e, to: startTo, from: startTo === 'ntn' ? 'catm' : 'ntn', why: r.info || '', ok: null, regSec: null, regAt: null, rsrp: null, snr: null, gnss: null, fixSec: null, failWhy: null, lat: null, lon: null, replay: !!r.replay };
        if (r.lat != null && r.lon != null) { cur.lat = r.lat; cur.lon = r.lon; }
        continue;
      }
      if (!cur) continue;
      if (e === 'boot') { if (cur.ok === null) cur.end = 'reinício'; push(); continue; }
      if ((e === 'back_catm' || e === 'sat_lost') && cur.to === 'ntn') { if (cur.ok === null) { cur.ok = false; cur.failWhy = e === 'sat_lost' ? 'perdeu o satélite' : 'voltou ao Cat-M'; } push(); continue; }
      if (cur.lat == null && r.lat != null && r.lon != null) { cur.lat = r.lat; cur.lon = r.lon; }
      if (cur.gnss == null) {
        if (e === 'fix') { cur.fixSec = r.value; cur.gnss = r.value != null && r.value >= 0 ? 'fix' : 'sem fix'; }
        else if (e === 'gnss_ok') { cur.gnss = 'fix'; cur.fixSec = r.value != null ? r.value : null; }
        else if (e === 'gnss_fail') cur.gnss = 'sem fix';
      }
      if (cur.ok === null && (e === 'reg' || e === 'sat_reg') && !r.fakeNtn && (cur.to === 'ntn' ? (e === 'sat_reg' || r.net === 'ntn') : r.net !== 'ntn')) {
        cur.ok = true; cur.regSec = r.regSecs != null ? r.regSecs : r.value; cur.regAt = r.ts || r.rx;
        cur.rsrp = r.rsrp != null ? r.rsrp : null; cur.snr = r.snr != null ? r.snr : null;
        if (cur.rsrp == null || cur.snr == null) {
          // registro mais próximo (2 min) na rede de destino com sinal medido
          var best = null, bd = 120001;
          for (var j = 0; j < rs.length; j++) { var q = rs[j], d = Math.abs(T(q) - t); if (d < bd && q.net === cur.to && (q.rsrp != null || q.snr != null)) { best = q; bd = d; } }
          if (best) { if (cur.rsrp == null) cur.rsrp = best.rsrp != null ? best.rsrp : null; if (cur.snr == null) cur.snr = best.snr != null ? best.snr : null; }
        }
      } else if (cur.ok === null && e === 'fail') { cur.ok = false; cur.failWhy = r.info || ''; }
    }
    push();
    return out;
  }

  function item(s, last) {
    var arrow = NAME[s.from] + ' → <b>' + NAME[s.to] + '</b>';
    var g = s.gnss === 'fix' ? 'GPS: fix ativo' + (s.fixSec != null ? ' (' + fmtDur(s.fixSec) + ')' : '') : s.gnss === 'sem fix' ? 'GPS: sem fix' : 'GPS: sem dados';
    var sig = ' · RSRP ' + (s.rsrp != null ? s.rsrp + ' dBm' : 'sem dados') + ' · SNR ' + (s.snr != null ? s.snr + ' dB' : 'sem dados');
    var res = s.ok === true ? '<div class="sw-result sw-result--ok">registrou em ' + fmtDur(s.regSec) + sig + '</div>'
      : s.ok === false ? '<div class="sw-result sw-result--fail">não registrou' + (s.failWhy ? ' (' + esc(s.failWhy) + ')' : '') + '</div>'
      : last ? '<div class="sw-result sw-result--pend">aguardando registro</div>' : '<div class="sw-result sw-result--pend">sem registro reportado</div>';
    var btn = s.lat != null && s.lon != null ? '<button type="button" class="sw-map-btn" data-lat="' + s.lat + '" data-lon="' + s.lon + '" data-ts="' + esc(s.at) + '">ver no mapa</button>' : '<span class="sw-map-btn sw-map-btn--off">sem posição</span>';
    return '<li class="sw-item sw-item--' + s.to + '"><div class="sw-time">' + hms(s.atMs) + '<small>' + dm(s.atMs) + '</small></div><div class="sw-body"><div class="sw-arrow">' + arrow + '</div>' + (s.why ? '<div class="sw-why">' + esc(s.why) + '</div>' : '') + (s.to === 'ntn' ? '<div class="sw-gnss">' + g + '</div>' : '') + res + '</div>' + btn + '</li>';
  }

  /* Renderiza no elemento (id ou nó). opts: { max, onlyTo, empty } */
  function render(el, items, opts) {
    opts = opts || {}; if (typeof el === 'string') el = typeof document !== 'undefined' ? document.getElementById(el) : null;
    var list = (items || []).filter(function (s) { return !opts.onlyTo || s.to === opts.onlyTo; }).slice().reverse();
    if (opts.max) list = list.slice(0, opts.max);
    var html = list.length ? list.map(function (s, i) { return item(s, i === 0 && !opts.noPending); }).join('') : '<li class="muted">' + esc(opts.empty || 'Nenhuma comutação no período.') + '</li>';
    if (!el) return html;
    el.innerHTML = html;
    if (!el.__swBound) {
      el.__swBound = true;
      el.addEventListener('click', function (ev) {
        var b = ev.target.closest ? ev.target.closest('button.sw-map-btn') : null; if (!b) return;
        document.dispatchEvent(new CustomEvent('sw:focusMap', { detail: { lat: +b.dataset.lat, lon: +b.dataset.lon, ts: b.dataset.ts } }));
      });
    }
    return html;
  }

  var api = { build: build, render: render, fmtDur: fmtDur };
  if (typeof window !== 'undefined') window.SwitchTimeline = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this);
