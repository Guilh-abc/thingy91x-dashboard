/* v49: Trajeto em andamento entre âncoras Casa e Trabalho. Âncoras só no localStorage deste navegador ('ntnAncorasV1'); nunca no código. */
(function () {
  'use strict';
  var K = 'ntnAncorasV1', qs = new URLSearchParams(location.search);
  var A = {}; try { A = JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) {}
  function ll(s) { var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(s || ''); return m ? { lat: +m[1], lon: +m[2] } : null; }
  var mud = false; ['casa', 'trab'].forEach(function (k) { var p = ll(qs.get(k)); if (p) { A[k] = p; mud = true; qs.delete(k); } });
  if (qs.get('desde')) { A.desde = qs.get('desde'); qs.delete('desde'); mud = true; }
  if (mud) { localStorage.setItem(K, JSON.stringify(A)); var q = qs.toString(); history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); }
  var DESDE = Date.parse(A.desde || '2026-10-14T17:40:00-03:00'), RAIO = 300;
  function dist(a, b) { var R = 6371000, k = Math.PI / 180, dLa = (b.lat - a.lat) * k, dLo = (b.lon - a.lon) * k, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  var t = function (r) { return Date.parse(r.ts || r.rx); };
  var gps = function (r) { return r.posSrc === 'gnss' || (r.acc != null && r.acc < 200 && !/^celula|^salva/.test(r.posSrc || '')); };
  function km(m) { return (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km'; }
  function dur(ms) { var m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; }
  function hm(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  var lay = null;
  window.drawTrajeto = function (all, now, map) {
    var el = document.getElementById('trajCard'); if (!el) return;
    map = map || window.ntnMap;
    var cfg = '<details class="tj-cfg"><summary>⚙ Locais de referência</summary>' +
      ['casa', 'trab'].map(function (k) { var n = k === 'casa' ? 'Casa' : 'Trabalho'; return '<div class="tj-f"><b>' + n + ':</b> ' + (A[k] ? 'definido (salvo só neste navegador)' : 'não definido') + ' <input id="tjq_' + k + '" placeholder="endereço de ' + n + '"> <button data-k="' + k + '" class="btn sm tj-b">Buscar</button><div id="tjr_' + k + '" class="tj-r"></div></div>'; }).join('') +
      '<small class="muted">Geocoding pelo OpenStreetMap Nominatim, direto do navegador. Nada é enviado ao servidor do painel.</small></details>';
    if (!A.casa || !A.trab) { el.innerHTML = '<div class="card-h"><h2>Trajeto em andamento</h2></div><div class="tr-info">Defina Casa e Trabalho para acompanhar o trajeto.</div>' + cfg; bind(); return; }
    var rs = all.filter(function (r) { return r.lat != null && r.lon != null && t(r) >= DESDE && t(r) <= now && !/sem posicao/.test(r.posSrc || ''); }).sort(function (a, b) { return t(a) - t(b); });
    var g = rs.filter(gps), last = rs[rs.length - 1], lastG = g[g.length - 1];
    var perc = 0; for (var i = 1; i < g.length; i++) { var d = dist(g[i - 1], g[i]); if (d < 5000) perc += d; }
    var tot = dist(A.trab, A.casa), atual = lastG && (!last || t(lastG) >= t(last) - 120000) ? lastG : last;
    var falta = atual ? dist(atual, A.casa) : null, chegou = falta != null && falta < RAIO && atual === lastG;
    var saiu = null; for (i = 0; i < g.length; i++) if (dist(g[i], A.trab) > RAIO) { saiu = t(g[i]); break; }
    var t0 = saiu || DESDE, dec = now - t0;
    var vel = null; if (g.length > 1 && now - t(lastG) < 600000) { var a = g[g.length - 2]; vel = dist(a, lastG) / Math.max(1, (t(lastG) - t(a)) / 1000) * 3.6; }
    var feito = perc || (atual ? Math.max(0, tot - falta) : 0), vm = dec > 60000 ? feito / (dec / 1000) * 3.6 : null;
    var eta = !chegou && falta != null && vm && vm > 5 ? now + falta / (vm / 3.6) * 1000 : null;
    var q = !atual ? 'sem posição' : atual === lastG ? 'GPS' : 'célula (' + (atual.acc ? '±' + km(atual.acc) : 'imprecisa') + ')';
    el.innerHTML = '<div class="card-h"><h2>' + (chegou ? '🏠 Chegou em Casa' : '🚗 Trajeto em andamento: Trabalho → Casa') + '</h2><small class="muted">desde ' + hm(DESDE) + ' · atualiza a cada posição</small></div>' +
      '<div class="tj-bar"><i style="width:' + Math.round(Math.min(1, falta != null ? 1 - falta / tot : 0) * 100) + '%"></i></div>' +
      '<div class="tr-row"><div><small>Percorrido</small><b>' + km(feito) + '</b><span>' + (perc ? 'soma dos trechos com GPS' : 'aproximado, em linha reta') + '</span></div><div><small>Falta (linha reta)</small><b>' + (falta != null ? km(falta) : 'n/d') + '</b></div><div><small>Tempo decorrido</small><b>' + dur(dec) + '</b><span>' + (saiu ? 'saiu do Trabalho às ' + hm(saiu) : 'contando desde ' + hm(DESDE)) + '</span></div><div><small>ETA (estimativa)</small><b>' + (chegou ? 'chegou' : eta ? hm(eta) : 'n/d') + '</b><span>' + (eta ? 'pela velocidade média do trajeto' : 'precisa de mais posições') + '</span></div><div><small>Velocidade</small><b>' + (vel != null ? vel.toFixed(0) + ' km/h' : 'indisponível: sem GPS') + '</b></div><div><small>Qualidade da posição</small><b>' + q + '</b><span>' + (last ? 'última ' + hm(t(last)) : '') + '</span></div></div>' + cfg;
    bind();
    if (map && window.L) { if (!lay) lay = L.layerGroup().addTo(map); lay.clearLayers();
      [['casa', '🏠 Casa'], ['trab', '🏢 Trabalho']].forEach(function (x) { L.circle([A[x[0]].lat, A[x[0]].lon], { radius: RAIO, color: '#E20074', weight: 2, fillOpacity: 0.1 }).addTo(lay); L.marker([A[x[0]].lat, A[x[0]].lon], { icon: L.divIcon({ className: 'tj-pin', html: x[1], iconSize: [90, 22] }) }).addTo(lay); });
      if (g.length > 1) L.polyline(g.map(function (p) { return [p.lat, p.lon]; }), { color: '#E20074', weight: 5 }).addTo(lay);
      rs.filter(function (r) { return !gps(r); }).forEach(function (r) { L.circleMarker([r.lat, r.lon], { radius: 4, color: '#E20074', weight: 1, fillOpacity: 0.3, dashArray: '2 2' }).bindTooltip('célula ' + hm(t(r))).addTo(lay); });
      if (atual) L.circleMarker([atual.lat, atual.lon], { radius: 10, color: '#fff', weight: 3, fillColor: '#E20074', fillOpacity: 1 }).bindTooltip('agora (' + q + ')').addTo(lay); }
  };
  function bind() {
    document.querySelectorAll('.tj-b').forEach(function (b) { b.onclick = function () { var k = b.dataset.k, v = document.getElementById('tjq_' + k).value, out = document.getElementById('tjr_' + k); if (!v) return; out.textContent = 'buscando...';
      fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=br&limit=5&q=' + encodeURIComponent(v)).then(function (r) { return r.json(); }).then(function (j) {
        out.innerHTML = j.length ? j.map(function (x, i) { return '<button class="btn sm tj-pick" data-k="' + k + '" data-la="' + x.lat + '" data-lo="' + x.lon + '">' + String(x.display_name).slice(0, 90).replace(/</g, '') + '</button>'; }).join('') : 'nenhum resultado';
        out.querySelectorAll('.tj-pick').forEach(function (p) { p.onclick = function () { A[p.dataset.k] = { lat: +p.dataset.la, lon: +p.dataset.lo }; localStorage.setItem(K, JSON.stringify(A)); out.textContent = 'salvo neste navegador; confira no mapa'; if (window.ntnMap) window.ntnMap.setView([A[p.dataset.k].lat, A[p.dataset.k].lon], 15); }; });
      }).catch(function () { out.textContent = 'falha no geocoding'; }); }; });
  }
})();
