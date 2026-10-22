/* v49: trânsito, Botão 2 via satélite e Rotina e rotas. Aditivo: só lê os registros já carregados; salva apenas dados DERIVADOS em localStorage ('ntnRotinaV1'). */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), SIM = qs.get('sim') === '1';
  var CFG = { lentoKmh: +(qs.get('lento') || 8), minLentoMin: +(qs.get('minlento') || 5), movKmh: 15, estacMin: 15, gapMin: 10, clusterM: 300, stayMin: 10 };
  var t = function (r) { return Date.parse(r.ts || r.rx); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function dist(a, b) { var R = 6371000, k = Math.PI / 180, dLa = (b.lat - a.lat) * k, dLo = (b.lon - a.lon) * k, x = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a.lat * k) * Math.cos(b.lat * k) * Math.sin(dLo / 2) * Math.sin(dLo / 2); return 2 * R * Math.asin(Math.sqrt(x)); }
  function hm(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); }
  function dmy(ms) { return new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function dur(ms) { var m = Math.round(ms / 60000); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; }
  /* ponto bom = GNSS, ou precisão informada abaixo de 200 m (célula e posição salva nunca) */
  function bom(r) { if (r.lat == null || r.lon == null) return false; var s = r.posSrc || ''; if (s === 'gnss') return true; if (/^celula|^salva/.test(s)) return false; return r.acc != null && r.acc < 200; }
  function pontos(all) { var seen = {}; return all.filter(bom).map(function (r) { return { t: t(r), lat: r.lat, lon: r.lon, spd: r.speed != null ? r.speed : r.spd != null ? r.spd : null, r: r }; }).sort(function (a, b) { return a.t - b.t; }).filter(function (p) { var k = p.t; if (seen[k]) return false; seen[k] = 1; return true; }); }

  /* ---------- 1. Trânsito ---------- */
  function transito(ps, now) {
    var ev = [], mov = false, run = null, lastMovT = null;
    function fecha(endT, p) {
      if (!run) return; var d = endT - run.t0;
      if (d >= CFG.minLentoMin * 60000) { var avg = run.dist / Math.max(1, (endT - run.t0) / 1000) * 3.6; var parado = (run.maxD < 50 || avg < 1.5) && d > CFG.estacMin * 60000;
        ev.push({ tipo: parado ? 'estacionado' : 'transito', t0: run.t0, t1: endT, avg: avg, lat: run.p.lat, lon: run.p.lon }); }
      run = null;
    }
    for (var i = 1; i < ps.length; i++) {
      var a = ps[i - 1], b = ps[i], dt = (b.t - a.t) / 1000; if (dt <= 0) continue;
      if (dt > CFG.gapMin * 60) { fecha(a.t); mov = false; continue; }
      var v = b.spd != null ? b.spd : dist(a, b) / dt * 3.6;
      if (v >= CFG.movKmh && dist(a, b) >= 100) { fecha(a.t); mov = true; lastMovT = b.t; }
      else if (v < CFG.lentoKmh && mov) { if (!run) run = { t0: a.t, dist: 0, p: a, maxD: 0 }; run.dist += dist(a, b); run.maxD = Math.max(run.maxD, dist(run.p, b)); run.p2 = b; }
      else if (v < CFG.lentoKmh && !mov) { /* sem movimento prévio: não é trânsito */ }
    }
    var atual = null, last = ps[ps.length - 1];
    if (run && last && now - last.t < CFG.gapMin * 60000) { var d = last.t - run.t0, avg = run.dist / Math.max(1, d / 1000) * 3.6;
      if (d >= CFG.minLentoMin * 60000) atual = { tipo: (run.maxD < 50 || avg < 1.5) && d > CFG.estacMin * 60000 ? 'estacionado' : 'transito', t0: run.t0, t1: last.t, avg: avg, lat: last.lat, lon: last.lon }; }
    else fecha(last ? last.t : now);
    var velAtual = null;
    if (last && now - last.t < CFG.gapMin * 60000 && ps.length > 1) { var p0 = ps[ps.length - 2]; velAtual = last.spd != null ? last.spd : dist(p0, last) / Math.max(1, (last.t - p0.t) / 1000) * 3.6; }
    return { ev: ev, atual: atual, velAtual: velAtual, semGps: !last || now - last.t > CFG.gapMin * 60000 };
  }
  function drawTransito(tr, all) {
    var el = document.getElementById('trCard'); if (!el) return;
    var a = tr.atual, h = '';
    if (a && a.tipo === 'transito') h = '<div class="tr-alert">🚦 VOCÊ ESTÁ PARADO NO TRÂNSITO</div><div class="tr-row"><div><small>Há</small><b>' + dur(a.t1 - a.t0) + '</b></div><div><small>Velocidade média</small><b>' + a.avg.toFixed(1) + ' km/h</b></div><div><small>Posição</small><b>' + a.lat.toFixed(4) + ', ' + a.lon.toFixed(4) + '</b><span>sem endereço (geocoding não disponível)</span></div><div><small>Desde</small><b>' + hm(a.t0) + '</b></div></div>';
    else if (a && a.tipo === 'estacionado') h = '<div class="tr-info">🅿 Estacionado há ' + dur(a.t1 - a.t0) + ' (desde ' + hm(a.t0) + ')</div>';
    else if (tr.semGps) h = '<div class="tr-info">Velocidade indisponível: sem GPS. Posições por célula (1 a 5 km de erro) não servem para medir velocidade.</div>';
    else h = '<div class="tr-info">Em movimento normal' + (tr.velAtual != null ? ' · ' + tr.velAtual.toFixed(0) + ' km/h' : '') + '</div>';
    var hist = tr.ev.slice(-6).reverse().map(function (e) { return '<li>' + (e.tipo === 'transito' ? '🚦 Trânsito' : '🅿 Estacionado') + ' · ' + dmy(e.t0) + ' · ' + dur(e.t1 - e.t0) + ' · ' + e.avg.toFixed(1) + ' km/h</li>'; }).join('');
    el.innerHTML = '<div class="card-h"><h2>Trânsito</h2><small class="muted">alerta se abaixo de ' + CFG.lentoKmh + ' km/h por ' + CFG.minLentoMin + ' min após movimento; só GPS (precisão &lt; 200 m)</small></div>' + h + (hist ? '<b style="font-size:13px">Histórico</b><ul class="tr-hist">' + hist + '</ul>' : '<small class="muted">Sem eventos de trânsito no período com GPS.</small>');
  }

  /* ---------- 2. Botão 2 via satélite ---------- */
  function b2(all) {
    return all.filter(function (r) { return r.type === 'event' && r.event === 'b2'; }).sort(function (a, b) { return t(a) - t(b); }).map(function (r) {
      var i = r.info || '', g = function (k) { var m = new RegExp('(?:^|[\\s,;])' + k + '[=:]?(-?\\d+)').exec(i); return m ? +m[1] : null; };
      return { t: t(r), win: r.value != null ? r.value : g('n'), total: r.pressTotal != null ? r.pressTotal : g('bt'), fa: r.firstAgoS != null ? r.firstAgoS : g('fa'), nb: r.ntnBytes != null ? r.ntnBytes : g('nb'), nm: r.ntnMsgs != null ? r.ntnMsgs : g('nm'), net: r.net, tx: r.txNet || r.deliveredNet, bytes: r.bytes, sim: !!r.sim };
    });
  }
  function drawB2(list) {
    var el = document.getElementById('b2Card'); if (!el) return;
    var nn = function (x) { return x == null ? 'n/d' : x; }, rede = function (x) { return x === 'ntn' ? 'Satélite' : x === 'catm' ? 'Cat-M' : 'n/d'; };
    var l = list[list.length - 1];
    el.innerHTML = '<div class="card-h"><h2>Botão 2 via satélite</h2><span class="pill">' + list.length + ' evento(s)</span></div>' + (!l ? '<small class="muted">Nenhum evento do botão 2 recebido ainda.</small>' :
      '<div class="tr-row"><div><small>Apertos na janela</small><b>' + nn(l.win) + '</b></div><div><small>Total de apertos</small><b>' + nn(l.total) + '</b></div><div><small>Rede criação / envio</small><b>' + rede(l.net) + ' / ' + rede(l.tx) + '</b></div><div><small>Bytes desta mensagem</small><b>' + nn(l.bytes) + '</b></div><div><small>Consumo NTN acumulado</small><b>' + nn(l.nb) + ' B · ' + nn(l.nm) + ' msg</b></div></div>' +
      '<div class="table-wrap" style="max-height:200px"><table class="tbl"><thead><tr><th>Hora</th><th>Janela</th><th>Total</th><th>1º aperto há</th><th>Criação</th><th>Envio</th><th>Bytes</th><th>NTN acumulado</th></tr></thead><tbody>' +
      list.slice().reverse().map(function (x) { return '<tr><td class="mono">' + dmy(x.t) + (x.sim ? ' <span class="tag">SIMULAÇÃO</span>' : '') + '</td><td>' + nn(x.win) + '</td><td>' + nn(x.total) + '</td><td>' + (x.fa != null ? x.fa + ' s' : 'n/d') + '</td><td>' + rede(x.net) + '</td><td>' + rede(x.tx) + '</td><td>' + nn(x.bytes) + '</td><td>' + nn(x.nb) + ' B / ' + nn(x.nm) + ' msg</td></tr>'; }).join('') + '</tbody></table></div>');
  }

  /* ---------- 3. Rotina e rotas ---------- */
  function rotina(ps, all, now) {
    var stays = [], i = 0;
    while (i < ps.length) { var j = i; while (j + 1 < ps.length && dist(ps[i], ps[j + 1]) < CFG.clusterM) j++;
      if (ps[j].t - ps[i].t >= CFG.stayMin * 60000) { var la = 0, lo = 0; for (var k = i; k <= j; k++) { la += ps[k].lat; lo += ps[k].lon; } stays.push({ t0: ps[i].t, t1: ps[j].t, lat: la / (j - i + 1), lon: lo / (j - i + 1) }); i = j + 1; } else i++; }
    var cl = [];
    stays.forEach(function (s) { var c = cl.find(function (c) { return dist(c, s) < CFG.clusterM; }); if (!c) { c = { lat: s.lat, lon: s.lon, n: 0, ms: 0, noite: 0, util: 0 }; cl.push(c); } c.n++; c.ms += s.t1 - s.t0; var h = new Date(s.t0).getHours(), wd = new Date(s.t0).getDay(); if (h >= 20 || h < 7) c.noite++; if (wd > 0 && wd < 6 && h >= 8 && h < 18) c.util++; s.c = c; });
    cl.sort(function (a, b) { return b.ms - a.ms; });
    cl.forEach(function (c, k) { c.nome = c.noite >= 2 && c.noite >= c.n / 2 ? 'provável casa' : c.util >= 2 && c.util >= c.n / 2 ? 'provável trabalho' : 'Local ' + String.fromCharCode(65 + k); });
    var trips = []; for (var s = 1; s < stays.length; s++) if (stays[s].c !== stays[s - 1].c) trips.push({ o: stays[s - 1].c, d: stays[s].c, t0: stays[s - 1].t1, t1: stays[s].t0, pts: ps.filter(function (p) { return p.t > stays[s - 1].t1 && p.t < stays[s].t0; }) });
    // estado atual
    var last = ps[ps.length - 1], prev = ps[ps.length - 2], movendo = false, origem = null, prev1 = null, desvios = [];
    if (last && prev && now - last.t < CFG.gapMin * 60000) movendo = dist(prev, last) / Math.max(1, (last.t - prev.t) / 1000) * 3.6 >= CFG.movKmh;
    var ultStay = stays[stays.length - 1];
    if (movendo && ultStay) { origem = ultStay.c; var hNow = new Date(now).getHours(), fds = [0, 6].indexOf(new Date(now).getDay()) >= 0;
      var cand = trips.filter(function (x) { return x.o === origem; }), score = {};
      cand.forEach(function (x) { var hx = new Date(x.t0).getHours(), fx = [0, 6].indexOf(new Date(x.t0).getDay()) >= 0; var w = (fx === fds ? 1 : 0.3) * (Math.abs(hx - hNow) <= 2 ? 1 : 0.3); var k = cl.indexOf(x.d); score[k] = score[k] || { w: 0, durs: [], pts: [] }; score[k].w += w; score[k].durs.push(x.t1 - x.t0); score[k].pts = score[k].pts.concat(x.pts); });
      var tot = 0, best = null; Object.keys(score).forEach(function (k) { tot += score[k].w; if (!best || score[k].w > score[best].w) best = k; });
      if (best != null) { var sc = score[best], dd = sc.durs.sort(function (a, b) { return a - b; }), med = dd[dd.length >> 1];
        prev1 = { dest: cl[best], conf: sc.w / tot, n: dd.length, eta: ultStay.t1 + med };
        if (sc.pts.length >= 5) { var md = Math.min.apply(null, sc.pts.map(function (p) { return dist(p, last); })); if (md > 1000) desvios.push('Trajeto fora do corredor habitual (' + (md / 1000).toFixed(1) + ' km do caminho conhecido)'); } }
      if (!cand.some(function (x) { return Math.abs(new Date(x.t0).getHours() - hNow) <= 2; }) && cand.length) desvios.push('Horário atípico de saída de ' + origem.nome);
    }
    if (ultStay && last && last.t - ultStay.t1 < CFG.gapMin * 60000 && !movendo && ultStay.c.n === 1 && cl.length > 1) desvios.push('Parada fora de local conhecido desde ' + hm(ultStay.t0));
    return { stays: stays, cl: cl, trips: trips, prev: prev1, desvios: desvios };
  }
  function drawRotina(ro, tr, all, ps, now) {
    var el = document.getElementById('rtCard'); if (!el) return;
    var dias = {}; ps.forEach(function (p) { dias[new Date(p.t).toDateString()] = 1; }); var nd = Object.keys(dias).length;
    var suf = nd >= 7 && ps.length >= 200 && ro.cl.length >= 2;
    var nivel = '<div class="rt-nivel ' + (suf ? 'ok' : 'aprend') + '"><b>Nível de aprendizado:</b> ' + nd + ' dia(s) com GPS · ' + ps.length + ' pontos com GPS (de ' + all.filter(function (r) { return r.lat != null; }).length + ' posições; célula e salvas descartadas) · ' + ro.cl.length + ' local(is) · ' + ro.trips.length + ' trajeto(s)' + (suf ? '' : '<br>APRENDENDO, PRECISA DE MAIS DADOS: ao menos 7 dias e 200 pontos com GPS e 2 locais frequentes') + '</div>';
    var locais = ro.cl.map(function (c) { return '<li><b>' + esc(c.nome) + '</b> · ' + c.n + ' parada(s) · ' + dur(c.ms) + ' no total · ' + c.lat.toFixed(3) + ', ' + c.lon.toFixed(3) + '</li>'; }).join('');
    var rotas = {}; ro.trips.forEach(function (x) { var k = x.o.nome + ' → ' + x.d.nome; rotas[k] = rotas[k] || []; rotas[k].push(x); });
    var rl = Object.keys(rotas).map(function (k) { var a = rotas[k], dd = a.map(function (x) { return x.t1 - x.t0; }).sort(function (p, q) { return p - q; }), hs = a.map(function (x) { return new Date(x.t0).getHours(); }).sort(function (p, q) { return p - q; }); return '<li><b>' + esc(k) + '</b> · ' + a.length + 'x · duração típica ' + dur(dd[dd.length >> 1]) + ' · saída típica ' + String(hs[hs.length >> 1]).padStart(2, '0') + 'h</li>'; }).join('');
    var pv = ro.prev ? '<div class="rt-prev">🧭 Destino provável: <b>' + esc(ro.prev.dest.nome) + '</b> · confiança ' + Math.round(ro.prev.conf * 100) + '% (' + ro.prev.n + ' viagem(ns) parecida(s)) · ETA típico ' + hm(ro.prev.eta) + '</div>' : '<div class="muted" style="font-size:13px">Previsão de destino aparece quando o veículo está em movimento com GPS e já há trajetos aprendidos a partir do local de origem.</div>';
    var dv = ro.desvios.map(function (d) { return '<div class="tr-alert" style="font-size:18px">⚠ ' + esc(d) + '</div>'; }).join('');
    // insights
    var td = ro.trips.map(function (x) { return x.t1 - x.t0; }), mTrip = td.length ? td.reduce(function (a, b) { return a + b; }, 0) / td.length : null;
    var trMs = tr.ev.concat(tr.atual ? [tr.atual] : []).filter(function (e) { return e.tipo === 'transito'; }).reduce(function (a, e) { return a + e.t1 - e.t0; }, 0), movMs = td.reduce(function (a, b) { return a + b; }, 0);
    var ins = '<div class="tr-row"><div><small>Tempo médio de deslocamento</small><b>' + (mTrip ? dur(mTrip) : 'n/d') + '</b></div><div><small>% do tempo de deslocamento em trânsito</small><b>' + (movMs ? Math.min(100, Math.round(trMs / movMs * 100)) + '%' : 'n/d') + '</b></div><div><small>Paradas por dia</small><b>' + (nd ? (ro.stays.length / nd).toFixed(1) : 'n/d') + '</b></div></div>';
    // aprendizado sem lacunas
    var rs = all.filter(function (r) { return r.lat != null; }), cat = rs.filter(function (r) { return (r.txNet || r.deliveredNet || r.net) === 'catm'; }).length, ntn = rs.filter(function (r) { return (r.txNet || r.deliveredNet || r.net) === 'ntn'; }).length, bl = rs.filter(function (r) { return r.late > 0; }).length;
    var cov = {}; all.forEach(function (r) { var d = new Date(t(r)), k = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }); cov[k] = cov[k] || {}; cov[k][d.getHours()] = 1; });
    var covH = Object.keys(cov).map(function (k) { var n = Object.keys(cov[k]).length; return '<span class="rt-dia"><b>' + k + '</b> ' + n + '/24 h<i style="width:' + Math.round(n / 24 * 100) + '%"></i></span>'; }).join('');
    el.innerHTML = '<div class="card-h"><h2>Rotina e rotas</h2>' + (SIM ? '<span class="tag" style="background:#1f6fe5;color:#fff">SIMULAÇÃO</span>' : '<small class="muted">aprendido do histórico real, só posições com GPS</small>') + '</div>' + nivel + dv + pv +
      '<div class="rt-cols"><div><b>Locais frequentes</b><ul class="tr-hist">' + (locais || '<li class="muted">nenhum ainda</li>') + '</ul></div><div><b>Trajetos recorrentes</b><ul class="tr-hist">' + (rl || '<li class="muted">nenhum ainda</li>') + '</ul></div></div>' +
      '<b>Insights agregados</b>' + ins + '<b>Aprendizado sem lacunas</b><div class="tr-row"><div><small>Posições via Cat-M</small><b>' + cat + '</b></div><div><small>via satélite NTN</small><b>' + ntn + '</b></div><div><small>de backlog (chegaram atrasadas)</small><b>' + bl + '</b></div></div><div class="rt-cov">' + covH + '</div>';
    if (!SIM) try { localStorage.setItem('ntnRotinaV1', JSON.stringify({ at: now, locais: ro.cl.map(function (c) { return { nome: c.nome, lat: +c.lat.toFixed(4), lon: +c.lon.toFixed(4), n: c.n }; }) })); } catch (e) {}
  }

  /* ---------- SIMULAÇÃO (só com ?sim=1) ---------- */
  function simRecs(now) {
    var out = [], casa = { lat: -23.600, lon: -46.660 }, trab = { lat: -23.480, lon: -46.600 }, d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    function rota(a, b, t0, min, lento) { for (var m = 0; m <= min; m++) { var f = m / min; var dt = t0 + m * 60000; if (lento && m > min / 2 && m < min / 2 + 8) f = (min / 2) / min + (m - min / 2) * 0.0015; out.push({ type: 'telemetry', ts: new Date(dt).toISOString(), net: 'catm', txNet: 'catm', posSrc: 'gnss', lat: a.lat + (b.lat - a.lat) * Math.min(1, f), lon: a.lon + (b.lon - a.lon) * Math.min(1, f), sim: true }); } }
    function fica(p, t0, min) { for (var m = 0; m <= min; m += 10) out.push({ type: 'telemetry', ts: new Date(t0 + m * 60000).toISOString(), net: m % 30 ? 'catm' : 'ntn', txNet: m % 30 ? 'catm' : 'ntn', posSrc: 'gnss', lat: p.lat + 0.0002, lon: p.lon, late: m % 50 ? 0 : 40, sim: true }); }
    for (var d = 8; d >= 1; d--) { var b = d0.getTime() - d * 86400000; fica(casa, b + 6 * 3600000, 120); rota(casa, trab, b + 8 * 3600000 + 5 * 60000, 35); fica(trab, b + 8 * 3600000 + 45 * 60000, 520); rota(trab, casa, b + 17 * 3600000 + 30 * 60000, 40); fica(casa, b + 18 * 3600000 + 15 * 60000, 200); }
    var tNow = now - 22 * 60000; fica(casa, tNow - 180 * 60000, 170); rota(casa, trab, tNow - 5 * 60000, 40, true);
    out = out.filter(function (r) { return t(r) <= now; });
    out.push({ type: 'event', event: 'b2', ts: new Date(now - 20 * 60000).toISOString(), value: 2, info: 'n2 bt7 fa35 nb412 nm6', net: 'catm', txNet: 'ntn', bytes: 58, sim: true });
    out.push({ type: 'event', event: 'b2', ts: new Date(now - 5 * 60000).toISOString(), value: 1, pressTotal: 8, firstAgoS: 12, ntnBytes: 470, ntnMsgs: 7, net: 'ntn', txNet: 'ntn', bytes: 58, sim: true });
    return out;
  }

  var lay = null;
  window.drawInsights = function (all, now, src, map) {
    var rs = SIM ? simRecs(now) : all, ps = pontos(rs), tr = transito(ps, now);
    if (SIM) { var bn = document.getElementById('simBanner2'); if (bn) bn.hidden = false; }
    drawTransito(tr, rs); drawB2(b2(rs));
    var ro = rotina(ps, rs, now); drawRotina(ro, tr, rs, ps, now);
    // mapa: camada própria
    map = map || window.ntnMap; if (map && window.L) { if (!lay) lay = L.layerGroup().addTo(map); lay.clearLayers();
      ro.cl.forEach(function (c) { L.circle([c.lat, c.lon], { radius: CFG.clusterM, color: '#ffd54a', weight: 2, fillOpacity: 0.08 }).bindTooltip(c.nome + (SIM ? ' (SIMULAÇÃO)' : '')).addTo(lay); });
      tr.ev.concat(tr.atual ? [tr.atual] : []).forEach(function (e) { L.circleMarker([e.lat, e.lon], { radius: 8, color: '#fff', weight: 2, fillColor: e.tipo === 'transito' ? '#ff7a00' : '#888', fillOpacity: 1 }).bindTooltip((e.tipo === 'transito' ? 'Trânsito ' : 'Estacionado ') + dmy(e.t0) + ' · ' + dur(e.t1 - e.t0) + (SIM ? ' (SIMULAÇÃO)' : '')).addTo(lay); });
      if (SIM && ps.length) { L.polyline(ps.map(function (p) { return [p.lat, p.lon]; }), { color: '#ffd54a', weight: 2, dashArray: '4 4' }).addTo(lay); } }
    return { tr: tr, ro: ro };
  };
  window.NtnInsights = { pontos: pontos, transito: transito, rotina: rotina, b2: b2, simRecs: simRecs, CFG: CFG };
})();
