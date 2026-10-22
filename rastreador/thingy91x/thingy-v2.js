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
  root.ThingyV2 = { resumo: resumo, ha: ha };
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
      ['Intervalo de envio', d.intervalo ? Math.round(d.intervalo / 60) + ' min' : null], ['Coordenadas', p ? p.lat.toFixed(4) + ', ' + p.lon.toFixed(4) : null], ['Precisão', p && p.prec != null ? '± ' + Math.round(p.prec) + ' m' : null]]);
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
    carrega(); setInterval(carrega, 60000);
  });
})(typeof window !== 'undefined' ? window : globalThis);
