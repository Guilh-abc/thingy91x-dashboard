/* status-desligado.js: regra única de "Desligado".
   Sem nenhuma mensagem da placa há mais de 5 min => Desligado (cinza, ícone power-off),
   sobrepondo estados antigos. Exceção (v69): se o último estado da placa é busca/modo satélite NTN
   (teste forçado pelo botão 4), a tolerância é 15 min ("Buscando satélite") antes de Desligado. */
(function (root) {
  'use strict';
  var LIM_MS = 5 * 60000, LIM_BUSCA_MS = 15 * 60000;
  function avaliar(lastMs, now, busca) {
    if (lastMs == null || !isFinite(lastMs)) return { desligado: false, min: null };
    var age = (now == null ? Date.now() : now) - lastMs, lim = busca ? LIM_BUSCA_MS : LIM_MS;
    return { desligado: age > lim, buscando: !!busca && age > LIM_MS && age <= lim, min: Math.max(0, Math.floor(age / 60000)), ageMs: age, limMs: lim };
  }
  /* Último estado declarado pela placa é busca/modo satélite? (sat_start, stest on, sw=1, sat_search, sat_reg, wait)
     Volta ao Cat-M (back_catm, sw=0, stest off) ou telemetria Cat-M depois encerram. */
  function emBusca(recs, now) {
    var tm = function (r) { return Date.parse(r.rx || r.ts) || 0; }, n = now == null ? Date.now() : now;
    var rs = (recs || []).filter(function (r) { return tm(r) <= n; }).sort(function (a, b) { return tm(a) - tm(b); });
    for (var i = rs.length - 1; i >= 0; i--) {
      var r = rs[i], e = r.event;
      if (r.type === 'telemetry') { if (r.net === 'ntn' || r.txNet === 'ntn' || r.transport === 'udp') return true; if (r.net === 'catm') return false; continue; }
      if (e === 'sat_start' || e === 'sat_search' || e === 'sat_reg' || e === 'wait' || (e === 'stest' && r.value === 1) || (e === 'sw' && r.value === 1)) return true;
      if (e === 'back_catm' || e === 'boot' || (e === 'sw' && r.value === 0) || (e === 'stest' && r.value === 0)) return false;
    }
    return false;
  }
  /* v70.1: volta ao Cat-M decidida pelo HORÁRIO DE RECEBIMENTO (rx), nunca por seq nem pelo ts da placa
     (após reboot a placa reenvia seq antigos). Qualquer dado Cat-M recebido depois do início do teste,
     e sem evidência de satélite recebida depois dele, encerra o modo satélite. */
  function voltouCatm(recs, inicioRx) {
    var tm = function (r) { return Date.parse(r.rx || r.ts) || 0; }, ult = null, ultT = -1;
    (recs || []).forEach(function (r) {
      var t = tm(r); if (!(t > inicioRx)) return;
      var st = String(r.estado || r.state || '').toUpperCase(), e = r.event;
      var catm = st === 'CATM' || r.n === 'c' || e === 'back_catm' || (r.type === 'telemetry' && (r.net === 'catm' || (r.net == null && r.n == null && r.plmn && r.plmn !== '90198')));
      var sat = !catm && (r.n === 'n' || ['BUSCA', 'SINCRONIA', 'REGISTRADO', 'ENVIO'].indexOf(st) >= 0 || e === 'sat_start' || e === 'sat_search' || e === 'sat_reg' || (r.type === 'telemetry' && (r.net === 'ntn' || r.plmn === '90198')));
      if ((catm || sat) && t >= ultT) { ultT = t; ult = catm ? 'catm' : 'sat'; }
    });
    return ult === 'catm';
  }
  function texto(min) { var d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60); return 'última mensagem há ' + (min < 60 ? min + ' min' : d ? d + (d === 1 ? ' dia' : ' dias') + (h ? ' e ' + h + ' h' : '') : h + ' h ' + String(min % 60).padStart(2, '0') + ' min'); }
  var ICO = '<svg class="ico" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18.36 6.64A9 9 0 0 1 20.77 15"/><path d="M6.16 6.16a9 9 0 1 0 12.68 12.68"/><path d="M12 2v4"/><path d="m2 2 20 20"/></svg>';
  var api = { LIM_MS: LIM_MS, LIM_BUSCA_MS: LIM_BUSCA_MS, avaliar: avaliar, emBusca: emBusca, voltouCatm: voltouCatm, texto: texto, ICO: ICO };
  if (typeof document !== 'undefined' && !document.getElementById('st-desligado-css')) {
    var st = document.createElement('style'); st.id = 'st-desligado-css';
    st.textContent = '.hero.desligado{background:var(--neutro,#5b6470);animation:none}.hero.desligado .hero-ico svg{width:1em;height:1em}';
    document.head.appendChild(st);
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.StatusDesligado = api;
})(typeof window !== 'undefined' ? window : globalThis);
