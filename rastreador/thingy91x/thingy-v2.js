/* thingy-v2.js: página Thingy:91X mobile-first. Só dados reais (nRF Cloud via proxy); sem dado vira "sem dado". */
(function (root) {
  var TZ = 'America/Sao_Paulo', MOV = 3; // km/h acima disso = em movimento
  var OPER = { '72402': 'TIM', '72403': 'TIM', '72404': 'TIM', '72405': 'Claro', '72406': 'Vivo', '72410': 'Vivo', '72411': 'Vivo', '72423': 'Vivo', '26201': 'Telekom' };
  var FONTE = { GNSS: 'GNSS', WIFI: 'Wi-Fi', MCELL: 'células', SCELL: 'célula', AGNSS: 'GNSS' };
  function hora(t) { return new Date(t).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  function ha(s) { s = Math.max(0, Math.round(s)); return s < 60 ? 'agora' : s < 3600 ? 'há ' + Math.round(s / 60) + ' min' : s < 172800 ? 'há ' + Math.round(s / 3600) + ' h' : 'há ' + Math.round(s / 86400) + ' dias'; }
  function tLoc(x) { return Date.parse(x.recordedAt || x.insertedAt); }
  function num(v) { v = parseFloat(v); return isFinite(v) ? v : null; }
  /* Puro: resumo a partir das posições (qualquer ordem), shadow do aparelho e últimas leituras de sinal. */
  function resumo(locs, dev, rsrp, agora) {
    agora = agora || Date.now();
    var ls = (locs || []).filter(function (x) { return num(x.lat) != null && num(x.lon) != null && !isNaN(tLoc(x)); }).sort(function (a, b) { return tLoc(a) - tLoc(b); });
    var u = ls[ls.length - 1] || null, r = { pos: null, alertas: [] };
    if (u) {
      var idade = (agora - tLoc(u)) / 1000, spd = num((u.meta || {}).spd);
      r.pos = { lat: num(u.lat), lon: num(u.lon), t: tLoc(u), idade: idade, kmh: spd == null ? null : Math.round(spd * 3.6 * 10) / 10,
        fonte: FONTE[u.serviceType] || u.serviceType || 'sem dado', prec: num(u.uncertainty) };
      r.pos.mov = r.pos.kmh == null ? null : r.pos.kmh > MOV;
      r.estado = idade < 900 ? 'online' : idade < 3600 ? 'atrasado' : 'parado';
    } else r.estado = 'sem dado';
    r.trilha = ls.filter(function (x) { return agora - tLoc(x) <= 864e5; }).map(function (x) { return [num(x.lat), num(x.lon)]; });
    var rep = ((dev || {}).state || {}).reported || {}, meta = ((((dev || {}).state || {}).metadata || {}).reported || {}).device || {};
    var di = (rep.device || {}).deviceInfo || {}, ni = (rep.device || {}).networkInfo || {};
    var bmv = num(di.batteryVoltage), bts = num(((meta.deviceInfo || {}).batteryVoltage || {}).timestamp);
    r.bat = bmv == null ? null : { v: bmv / 1000, t: bts ? bts * 1000 : null, velho: !bts || agora - bts * 1000 > 864e5 };
    var s = (rsrp || []).map(function (m) { var g = m.message || {}; return { v: num(g.data), t: g.ts ? +g.ts : Date.parse(m.receivedAt) }; })
      .filter(function (x) { return x.v != null && !isNaN(x.t); }).sort(function (a, b) { return b.t - a.t; })[0];
    r.sinal = s ? { v: s.v, t: s.t, velho: agora - s.t > 864e5 } : null;
    r.det = { fw: di.appVersion || ((dev || {}).firmware || {}).app && dev.firmware.app.version || null, modem: di.modemFirmware || null, hw: di.hwVer || null,
      rede: ni.networkMode || null, banda: ni.currentBand || null, oper: ni.mccmnc ? (OPER[String(ni.mccmnc)] || 'MCC/MNC') + ' (' + String(ni.mccmnc).replace(/^(\d{3})/, '$1 ') + ')' : null,
      id: (dev || {}).id ? '****' + String(dev.id).slice(-4) : null, intervalo: num(((rep.config || {}).sample_interval)) };
    // alertas reais: só o que os dados sustentam
    if (r.estado === 'parado') r.alertas.push({ c: 'alerta', t: 'Sem posição ' + ha(r.pos.idade) + ' (última ' + hora(r.pos.t) + ').' });
    else if (r.estado === 'atrasado') r.alertas.push({ c: 'info', t: 'Última posição ' + ha(r.pos.idade) + '; acima do intervalo normal.' });
    else if (r.estado === 'sem dado') r.alertas.push({ c: 'alerta', t: 'Nenhuma posição recebida.' });
    if (r.bat && !r.bat.velho && r.bat.v < 3.5) r.alertas.push({ c: 'alerta', t: 'Bateria baixa: ' + r.bat.v.toFixed(2).replace('.', ',') + ' V.' });
    if (r.sinal && !r.sinal.velho && r.sinal.v < -110) r.alertas.push({ c: 'alerta', t: 'Sinal fraco: ' + r.sinal.v + ' dBm.' });
    if (!r.alertas.length) r.alertas.push({ c: 'ok', t: 'Nenhum alerta agora.' });
    return r;
  }

  function km(a, b) { var R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r;
    var h = Math.sin(dl / 2) * Math.sin(dl / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) * Math.sin(dn / 2); return 2 * R * Math.asin(Math.sqrt(h)); }
  function diaBR(t) { return new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ }); }
  /* Puro: histórico dos últimos `dias` dias a partir das posições reais. Viagem = sequência de pontos sem intervalo > 20 min
     que soma ao menos 0,5 km. Lacuna = mais de 1 h sem posição. */
  function historico(locs, dias, agora) {
    agora = agora || Date.now(); dias = dias || 7;
    var ini = agora - dias * 864e5, GAP = 20 * 6e4;
    var ls = (locs || []).filter(function (x) { return num(x.lat) != null && num(x.lon) != null && tLoc(x) >= ini && tLoc(x) <= agora; })
      .map(function (x) { return { t: tLoc(x), p: [num(x.lat), num(x.lon)], u: num(x.uncertainty) }; }).sort(function (a, b) { return a.t - b.t; });
    var vs = [], cur = null, lac = [], kmDia = {}, ptsDia = {};
    for (var d = 0; d < dias; d++) { var k = diaBR(agora - (dias - 1 - d) * 864e5); kmDia[k] = 0; ptsDia[k] = 0; }
    ls.forEach(function (x, i) {
      var k = diaBR(x.t); if (k in ptsDia) ptsDia[k]++;
      var a = ls[i - 1];
      if (a && x.t - a.t > 36e5) lac.push({ de: a.t, ate: x.t });
      if (!a || x.t - a.t > GAP) { if (cur) vs.push(cur); cur = { de: x.t, ate: x.t, km: 0, n: 1 }; return; }
      var dk = km(a.p, x.p), lim = Math.max(0.05, ((a.u || 0) + (x.u || 0)) / 1000);
      if (dk > lim) { cur.km += dk; if (k in kmDia) kmDia[k] += dk; }
      cur.ate = x.t; cur.n++;
    });
    if (cur) vs.push(cur);
    vs = vs.filter(function (v) { return v.km >= 0.5; }).reverse();
    var tot = vs.reduce(function (s, v) { return s + v.km; }, 0);
    return { viagens: vs, km: Math.round(tot * 10) / 10, pontos: ls.length, lacunas: lac.reverse(),
      dias: Object.keys(kmDia).map(function (k) { return { d: k, km: Math.round(kmDia[k] * 10) / 10, n: ptsDia[k] }; }), lista: ls };
  }
  /* Puro: CSV das posições, coordenadas com 3 casas (sem posição exata em exportação). */
  function csv(ls) {
    return 'data_hora_brt;latitude;longitude;precisao_m\n' + ls.map(function (x) { return new Date(x.t).toLocaleString('pt-BR', { timeZone: TZ }) + ';' + x.p[0].toFixed(3) + ';' + x.p[1].toFixed(3) + ';' + (x.u == null ? '' : Math.round(x.u)); }).join('\n');
  }
  root.ThingyV2 = { resumo: resumo, ha: ha, historico: historico, csv: csv };
  if (typeof document === 'undefined') return;

  var $ = function (id) { return document.getElementById(id); }, mapa, linha, pino, circ, ult;
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function dl(el, pares) { el.innerHTML = pares.map(function (p) { return '<div><dt>' + esc(p[0]) + '</dt><dd' + (p[2] ? ' class="' + p[2] + '"' : '') + '>' + esc(p[1] == null || p[1] === '' ? 'sem dado' : p[1]) + '</dd></div>'; }).join(''); }
  function get(p) {
    var T = root.ThingyDados, c = T.cab(); if (!c) return Promise.reject(new Error('sem chave'));
    return fetch(T.BASE + '/.netlify/functions/nrfcloud/' + p.replace('DEV', encodeURIComponent(c.dev)), { headers: c.hd, cache: 'no-store' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function pinta(r) {
    var p = r.pos, cor = { online: 'ok', atrasado: 'info', parado: 'alerta' }[r.estado] || 'neutro';
    var txt = { online: 'Online', atrasado: 'Atrasado', parado: 'Sem envio', 'sem dado': 'sem dado' }[r.estado];
    $('st').innerHTML = '<i class="pt ' + cor + '"></i><span>' + esc(txt) + (p ? ' · ' + esc(hora(p.t)) + ' BRT' : '') + '</span>';
    dl($('agora'), [['Situação', txt], ['Última posição', p ? ha(p.idade) : null], ['Velocidade', p && p.kmh != null ? p.kmh.toFixed(1).replace('.', ',') + ' km/h' : null],
      ['Movimento', p && p.mov != null ? (p.mov ? 'em movimento' : 'parado') : null], ['Fonte', p ? p.fonte : null, 'tg-fonte']]);
    if (r.bat) { $('bat').textContent = r.bat.v.toFixed(2).replace('.', ',') + ' V'; $('batS').textContent = (r.bat.velho ? 'leitura antiga, ' : 'lido em ') + (r.bat.t ? hora(r.bat.t) + ' BRT' : 'data sem dado'); }
    else { $('bat').textContent = 'sem dado'; $('batS').textContent = ''; }
    if (r.sinal) { $('sin').textContent = r.sinal.v + ' dBm'; $('sinS').textContent = (r.sinal.velho ? 'leitura antiga, ' : 'lido em ') + hora(r.sinal.t) + ' BRT'; }
    else { $('sin').textContent = 'sem dado'; $('sinS').textContent = ''; }
    $('alertas').innerHTML = r.alertas.map(function (a) { return '<li class="' + a.c + '">' + esc(a.t) + '</li>'; }).join('');
    var d = r.det;
    dl($('det'), [['ID', d.id], ['Firmware', d.fw], ['Modem', d.modem], ['Hardware', d.hw], ['Rede', d.rede ? d.rede + (d.banda ? ', banda ' + d.banda : '') : null], ['Operadora', d.oper],
      ['Intervalo de envio', d.intervalo ? Math.round(d.intervalo / 60) + ' min' : null], ['Coordenadas', p ? p.lat.toFixed(3) + ', ' + p.lon.toFixed(3) : null], ['Precisão', p && p.prec != null ? '± ' + Math.round(p.prec) + ' m' : null]]);
    if (!root.L) return;
    if (!mapa) { mapa = L.map('map', { zoomControl: true }).setView([-23.55, -46.63], 11); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(mapa); }
    if (linha) linha.remove(); if (pino) pino.remove(); if (circ) circ.remove();
    linha = L.polyline(r.trilha, { color: '#0b5cff', weight: 3, opacity: .7 });
    if ($('trilha').getAttribute('aria-pressed') === 'true' && r.trilha.length > 1) linha.addTo(mapa);
    if (p) { pino = L.circleMarker([p.lat, p.lon], { radius: 8, color: '#fff', weight: 2, fillColor: '#0b5cff', fillOpacity: 1 }).addTo(mapa);
      if (p.prec) circ = L.circle([p.lat, p.lon], { radius: p.prec, color: '#0b5cff', weight: 1, fillOpacity: .08 }).addTo(mapa);
      if (!ult) mapa.setView([p.lat, p.lon], 16); }
    ult = r;
  }
  function locs() { // até 200 posições, mais recentes primeiro (limite da API: 100 por página)
    var q = 'location/history?deviceId=DEV&pageSort=desc&pageLimit=100';
    return get(q).then(function (j) { return j.pageNextToken ? get(q + '&pageNextToken=' + encodeURIComponent(j.pageNextToken)).then(function (k) { return { items: j.items.concat(k.items || []) }; }, function () { return j; }) : j; });
  }

  var hist = null, perDias = 7;
  function dur(ms) { var m = Math.round(ms / 6e4); return m < 60 ? m + ' min' : Math.floor(m / 60) + ' h ' + (m % 60) + ' min'; }
  function n1(v) { return v.toFixed(1).replace('.', ','); }
  function barras(el, dados, campo, un) {
    var mx = Math.max.apply(null, dados.map(function (x) { return x[campo]; }).concat([0])), W = 100 / dados.length;
    var topo = mx > 0 ? mx * 1.15 : 1;
    el.innerHTML = '<svg viewBox="0 0 100 60" preserveAspectRatio="none" role="img" aria-label="' + esc(un) + ' por dia">' + dados.map(function (x, i) {
      var h = x[campo] / topo * 52; return '<rect x="' + (i * W + W * .15) + '" y="' + (56 - h) + '" width="' + (W * .7) + '" height="' + h + '" rx="1"><title>' + esc(x.d.slice(8) + '/' + x.d.slice(5, 7) + ': ' + (campo === 'km' ? n1(x.km) : x.n) + ' ' + un) + '</title></rect>'; }).join('') +
      '</svg><div class="tg-eixo">' + dados.map(function (x) { return '<span>' + x.d.slice(8) + '/' + x.d.slice(5, 7) + '</span>'; }).join('') + '</div>';
  }
  function pintaHist() {
    if (!hist) return;
    var h = hist;
    dl($('hRes'), [['Distância', n1(h.km) + ' km'], ['Viagens', String(h.viagens.length)], ['Posições recebidas', String(h.pontos)], ['Período', 'últimos ' + perDias + ' dias']]);
    $('viagens').innerHTML = h.viagens.length ? h.viagens.slice(0, 30).map(function (v) {
      return '<li><b>' + esc(hora(v.de)) + '</b><span>' + esc(n1(v.km)) + ' km · ' + esc(dur(v.ate - v.de)) + '</span></li>'; }).join('') : '<li class="neutro">Nenhuma viagem no período.</li>';
    barras($('gKm'), h.dias, 'km', 'km'); barras($('gPts'), h.dias, 'n', 'posições');
    $('lacunas').innerHTML = h.lacunas.length ? h.lacunas.slice(0, 15).map(function (l) {
      return '<li class="info">Sem posição por ' + esc(dur(l.ate - l.de)) + ' (' + esc(hora(l.de)) + ' até ' + esc(hora(l.ate)) + ')</li>'; }).join('') : '<li class="ok">Sem interrupções acima de 1 h no período.</li>';
  }
  function carregaHist() {
    var T = root.ThingyDados; if (!T || !T.tudo) return;
    $('hRes').innerHTML = '<div><dt>Histórico</dt><dd>carregando...</dd></div>';
    T.tudo(perDias).then(function (r) { hist = historico(r.locs, perDias); pintaHist(); }, function () { $('hRes').innerHTML = '<div><dt>Histórico</dt><dd>sem dado (nuvem indisponível)</dd></div>'; });
  }
  function podeExp() { var R = root.Papeis || root.Roles || root.NTNRoles; return !R || !R.podeExportar || R.podeExportar(); }
  function carrega() {
    var f = function (pr) { return pr.catch(function () { return null; }); };
    Promise.all([f(locs()), f(get('devices/DEV')), f(get('messages?deviceId=DEV&appId=RSRP&pageSort=desc&pageLimit=5'))])
      .then(function (x) {
        if (!x[0] && !x[1]) { $('st').innerHTML = '<i class="pt neutro"></i><span>sem dado (nuvem indisponível)</span>'; return; }
        pinta(resumo((x[0] || {}).items, x[1], (x[2] || {}).items));
      });
  }
  document.addEventListener('DOMContentLoaded', function () {
    $('centralizar').onclick = function () { if (mapa && ult && ult.pos) mapa.setView([ult.pos.lat, ult.pos.lon], 16); };
    $('trilha').onclick = function () { var on = this.getAttribute('aria-pressed') !== 'true'; this.setAttribute('aria-pressed', on); if (ult) pinta(ult); };
    carrega(); setInterval(carrega, 60000); carregaHist();
    $('per').onchange = function () { perDias = +this.value; carregaHist(); };
    $('btnCsv').onclick = function () { if (!podeExp() || !hist) return; var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob(['\ufeff' + csv(hist.lista)], { type: 'text/csv;charset=utf-8' })); a.download = 'thingy91x-posicoes-' + perDias + 'd.csv'; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); };
    $('btnPdf').onclick = function () { if (!podeExp()) return; document.querySelector('.tg-det').open = true; if (mapa) mapa.invalidateSize(); setTimeout(function () { window.print(); }, 300); };
  });
})(typeof window !== 'undefined' ? window : globalThis);
