/* relatorio-real.js: relatório completo com dados reais da API, no mesmo layout do /relatorio-demo/.
   Privacidade: posição arredondada em 3 casas (cerca de 100 m), ICCID e IMSI mascarados, nenhum custo. */
(function (root) {
  var TZ = 'America/Sao_Paulo';
  var BLOQ = /^(lat|lon|iccid|imsi|info|counters|failReasons)$|custo|cost|price|preco|tarif|margem/i;
  function tms(r) { return Date.parse(r.ts || r.rx); }
  function arred(v) { return v == null || isNaN(+v) ? null : Math.round(+v * 1000) / 1000; }
  function filtrar(recs, de, ate) { return (recs || []).filter(function (r) { var t = tms(r); return !isNaN(t) && t >= de && t <= ate; }).sort(function (a, b) { return tms(a) - tms(b); }); }
  function rede(r) { var n = String(r.txNet || r.net || '').toLowerCase(); return n === 'ntn' || n === 'sat' || n === 'satelite' ? 'ntn' : 'catm'; }
  function hora(t) { return +new Date(t).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }) % 24; }
  function diaSem(t) { return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Date(t).toLocaleString('en-US', { weekday: 'short', timeZone: TZ })); }
  function dmy(t) { return new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: TZ }); }
  function hm(t) { return new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ }).replace(':', 'h'); }
  function dataHora(t) { return new Date(t).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  function km(a, b) { var R = 6371, r = Math.PI / 180, dl = (b[0] - a[0]) * r, dn = (b[1] - a[1]) * r; var x = Math.sin(dl / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
  function mediana(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function fmtBytes(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : b >= 1024 ? (b / 1024).toFixed(1).replace('.', ',') + ' KB' : b + ' B'; }
  function dur(s) { return s >= 3600 ? Math.floor(s / 3600) + 'h' + String(Math.round(s % 3600 / 60)).padStart(2, '0') : Math.max(1, Math.round(s / 60)) + ' min'; }
  function mascara(k, v) { if (v == null) return ''; if (/^(iccid|imsi)$/i.test(k)) { v = String(v); return v.length > 4 ? '****' + v.slice(-4) : '****'; } return typeof v === 'object' ? JSON.stringify(v) : String(v); }

  /* Cálculo puro de tudo o que o relatório mostra. */
  function calcular(recs, fonte) {
    var tel = recs.filter(function (r) { return r.type === 'telemetry'; });
    var al = recs.filter(function (r) { return r.type === 'alarm'; });
    var ev = recs.filter(function (r) { return r.type === 'event'; });
    var bytes = recs.reduce(function (s, r) { return s + (+r.bytes || 0); }, 0);
    var ntn = recs.filter(function (r) { return rede(r) === 'ntn'; }).length;
    var litros = recs.reduce(function (s, r) { return s + (+r.deltaL > 0 ? +r.deltaL : 0); }, 0);
    var pts = recs.filter(function (r) { return r.lat != null && r.lon != null && !isNaN(+r.lat) && +r.lat !== 0; }).map(function (r) { return { t: tms(r), p: [arred(r.lat), arred(r.lon)], al: r.type === 'alarm' }; });
    var dist = 0; for (var i = 1; i < pts.length; i++) { var d = km(pts[i - 1].p, pts[i].p); if (d < 200) dist += d; }
    var trocas = 0; for (var j = 1; j < recs.length; j++) if (rede(recs[j]) !== rede(recs[j - 1])) trocas++;
    var c0 = null, c1 = null; tel.forEach(function (r) { if (r.counters) { if (!c0) c0 = r.counters; c1 = r.counters; } });
    var ok = c1 && c0 ? Math.max(0, (c1.ok || 0) - (c0.ok || 0)) : null, fail = c1 && c0 ? Math.max(0, (c1.fail || 0) - (c0.fail || 0)) : null;
    if (c1 && c0 && (c1.ok < c0.ok)) { ok = c1.ok; fail = c1.fail; }
    var peso = function (r) { return fonte === 'meter' ? (+r.deltaL > 0 ? +r.deltaL : 0) : (+r.bytes || 0); };
    var porHora = new Array(24).fill(0), porDia = new Array(7).fill(0), porData = {};
    recs.forEach(function (r) { var t = tms(r), v = peso(r); porHora[hora(t)] += v; porDia[diaSem(t)] += v; var k = dmy(t); porData[k] = (porData[k] || 0) + v; });
    // Paradas: áreas de ~100 m com permanência
    var paradas = {}, ult = null;
    pts.forEach(function (x) { var k = x.p.join(','); if (ult && ult.k === k) paradas[k].s += (x.t - ult.t) / 1000; else paradas[k] = paradas[k] || { p: x.p, s: 0, de: x.t }; paradas[k].ate = x.t; ult = { k: k, t: x.t }; });
    var lp = Object.keys(paradas).map(function (k) { return paradas[k]; }).filter(function (p) { return p.s >= 300; }).sort(function (a, b) { return b.s - a.s; }).slice(0, 5);
    var horas = {}; recs.forEach(function (r) { var k = Math.floor(tms(r) / 3600000); horas[k] = horas[k] || { n: 0, al: 0 }; horas[k].n++; if (r.type === 'alarm') horas[k].al++; });
    return { n: recs.length, tel: tel, al: al, ev: ev, bytes: bytes, ntn: ntn, catm: recs.length - ntn, litros: litros, pts: pts, dist: dist, trocas: trocas, ok: ok, fail: fail,
      rsrp: tel.map(function (r) { return r.rsrp; }).filter(function (v) { return v != null; }), mv: tel.map(function (r) { return r.mv; }).filter(function (v) { return v != null; }),
      porHora: porHora, porDia: porDia, porData: porData, paradas: lp, horas: horas, rsrpMed: mediana(tel.map(function (r) { return r.rsrp; }).filter(function (v) { return v != null; })) };
  }
  var COLS = ['ts', 'rx', 'dv', 'type', 'txNet', 'transport', 'bytes', 'rsrp', 'snr', 'band', 'plmn', 'event', 'value', 'totalL', 'deltaL', 'temp', 'mv', 'seq', 'late', 'latA', 'lonA'];
  var ROT = { ts: 'hora (BRT)', rx: 'chegada (BRT)', dv: 'dispositivo', type: 'tipo', txNet: 'rede', latA: 'lat (~100 m)', lonA: 'lon (~100 m)' };
  function linhas(recs) { return recs.map(function (r) { var o = {}; COLS.forEach(function (c) { o[c] = c === 'latA' ? arred(r.lat) : c === 'lonA' ? arred(r.lon) : (c === 'ts' || c === 'rx') && r[c] ? dataHora(Date.parse(r[c])) : BLOQ.test(c) ? null : mascara(c, r[c]); }); return o; }); }
  function csv(recs) { var cel = function (x) { x = x == null ? '' : String(x); return /[;"\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; }; return '\ufeff' + [COLS.map(function (c) { return cel(ROT[c] || c); }).join(';')].concat(linhas(recs).map(function (o) { return COLS.map(function (c) { return cel(o[c]); }).join(';'); })).join('\r\n'); }
  var api = { calcular: calcular, filtrar: filtrar, arred: arred, csv: csv, linhas: linhas, COLS: COLS };
  root.RelReal = api;
  if (typeof document === 'undefined') return;

  var $ = function (id) { return document.getElementById(id); };
  var I = function (n, c) { return '<svg class="ico' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"></use></svg>'; };
  var VERDE = 'var(--cor-ok)', VERM = 'var(--cor-alerta)', AZUL = 'var(--cor-info)', CINZA = 'var(--cor-neutro)';
  var API = (/(netlify\.app|pages\.dev)$/i.test(location.hostname) ? '' : 'https://thingy91x-x-dashboard.netlify.app') + '/.netlify/functions/ntn-lab';
  var NOMES = { meter: 'Utilities (medidor)', tracker: 'Rastreador', consumo: 'Consumo (todos os dispositivos)' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function num(v, d) { return (+v).toLocaleString('pt-BR', { maximumFractionDigits: d || 0 }); }
  function barras(vals, cor, rot, unid) {
    var w = 480, h = 120, L = 36, B = 20, max = Math.max.apply(null, vals.concat([0])), bw = (w - L) / vals.length;
    var g = '<svg class="graf" viewBox="0 0 ' + w + ' ' + h + '" role="img"><line x1="' + L + '" y1="' + (h - B) + '" x2="' + w + '" y2="' + (h - B) + '" stroke="var(--borda)"/>' +
      '<text x="' + (L - 4) + '" y="10" text-anchor="end">' + (max ? num(max, 1) : 0) + '</text><text x="' + (L - 4) + '" y="' + (h - B) + '" text-anchor="end">0</text>' +
      '<text x="2" y="' + (h / 2) + '" transform="rotate(-90 8 ' + (h / 2) + ')">' + unid + '</text>';
    vals.forEach(function (v, i) { var bh = max ? v / max * (h - B - 12) : 0; g += '<rect x="' + (L + i * bw + 1) + '" y="' + (h - B - bh) + '" width="' + Math.max(1, bw - 2) + '" height="' + bh + '" rx="2" fill="' + cor + '"><title>' + rot[i] + ': ' + num(v, 1) + ' ' + unid + '</title></rect>'; if (rot.length <= 8 || i % 3 === 0) g += '<text x="' + (L + i * bw + bw / 2) + '" y="' + (h - 5) + '" text-anchor="middle">' + rot[i] + '</text>'; });
    return g + '</svg>';
  }
  function linha(vals, cor, unid) {
    if (vals.length < 2) return '<div class="vazio">Sem dados suficientes no período.</div>';
    var w = 300, h = 60, L = 34, max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), r = (max - min) || 1;
    var pts = vals.map(function (v, i) { return (L + i * (w - L) / (vals.length - 1)).toFixed(1) + ',' + (h - 4 - (v - min) / r * (h - 10)).toFixed(1); }).join(' ');
    return '<svg class="graf" viewBox="0 0 ' + w + ' ' + h + '"><text x="' + (L - 4) + '" y="10" text-anchor="end">' + max + '</text><text x="' + (L - 4) + '" y="' + (h - 2) + '" text-anchor="end">' + min + '</text><polyline points="' + pts + '" fill="none" stroke="' + cor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg><div class="leg"><span>' + unid + '</span></div>';
  }
  var dados = { recs: [], fonte: 'meter', de: 0, ate: 0 }, mapa = null;
  function periodo() {
    var p = $('per').value, ate = Date.now(), de = ate - (+p || 1) * 86400000;
    if (p === 'x' && $('de').value && $('ate').value) { de = Date.parse($('de').value + 'T00:00:00-03:00'); ate = Date.parse($('ate').value + 'T23:59:59-03:00'); }
    return [de, ate];
  }
  function buscar(q, dias) { return fetch(API + '?' + q + '=1&days=' + dias + '&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { return Array.isArray(j.records) ? j.records : []; }); }
  function carregar() {
    var f = $('fonte').value, pr = periodo(), dias = Math.min(62, Math.ceil((Date.now() - pr[0]) / 86400000) + 1);
    $('sub').textContent = 'Carregando dados reais da API';
    var ps = f === 'consumo' ? [buscar('pro', dias), buscar('meter', dias)] : [buscar(f === 'meter' ? 'meter' : 'pro', dias)];
    Promise.all(ps).then(function (ls) { dados = { recs: filtrar([].concat.apply([], ls), pr[0], pr[1]), fonte: f, de: pr[0], ate: pr[1] }; render(); })
      .catch(function () { $('sub').textContent = 'Não foi possível ler a API agora.'; });
  }
  function render() {
    var d = calcular(dados.recs, dados.fonte), f = dados.fonte, per = dataHora(dados.de) + ' a ' + dataHora(dados.ate);
    $('tit').textContent = 'Relatório completo: ' + NOMES[f]; $('capaTit').textContent = 'Relatório completo: ' + NOMES[f];
    $('sub').textContent = per + ' (BRT) · ' + d.n + ' registros reais'; $('capaPer').textContent = 'Período: ' + per + ' (BRT) · gerado em ' + dataHora(Date.now());
    document.title = 'Relatório ' + NOMES[f] + ' | IoT Cat-M + NTN Tecnologia';
    $('fResumo').textContent = d.n ? 'Números do período escolhido, direto da API.' : 'Nenhum registro no período escolhido.';
    var K = [['grafico', num(d.n), 'mensagens', ''], ['rede', fmtBytes(d.bytes), 'dados enviados', '']];
    if (f !== 'tracker') K.push(['medicao', num(d.litros, 1) + ' L', 'consumo medido', '']);
    if (f !== 'meter') K.push(['rota', num(d.dist, 1) + ' km', 'percorridos (aprox.)', '']);
    K.push(['ok', d.ok == null ? 'sem dado' : num(d.ok), 'envios com sucesso', 'ok'], ['sinal', d.rsrpMed == null ? 'sem dado' : d.rsrpMed + ' dBm', 'RSRP mediano', ''], ['alerta', num(d.al.length), 'alertas', d.al.length ? 'alerta' : '']);
    $('kpis').innerHTML = K.map(function (k) { return '<div class="kpi ' + k[3] + '">' + I(k[0]) + '<div><b>' + k[1] + '</b><span>' + k[2] + '</span></div></div>'; }).join('');
    var ultimo = d.n ? dados.recs[d.n - 1] : null;
    var CAPS = [
      ['local', 'Posição no mapa', 'Trilha com posição arredondada em cerca de 100 m.', '', I('camadas', 'c-info') + ' <b>' + d.pts.length + '</b> posições no período'],
      ['permanencia', 'Paradas e permanência', 'Áreas onde o dispositivo ficou parado.', '', I('parada', 'c-info') + ' <b>' + d.paradas.length + '</b> paradas de 5 min ou mais'],
      ['calendario', 'Padrões por dia', 'Volume por dia da semana.', '', '<b>' + Object.keys(d.porData).length + '</b> dias com dados'],
      ['satelite', 'Cat-M e satélite NTN', 'Rede usada em cada envio.', '', '<b>' + d.catm + '</b> Cat-M · <b>' + d.ntn + '</b> NTN · <b>' + d.trocas + '</b> trocas'],
      ['desvio', 'Alertas', 'Eventos de alarme recebidos da placa.', d.al.length ? 'alerta' : 'ok', I(d.al.length ? 'alerta' : 'ok', d.al.length ? 'c-alerta' : 'c-ok') + ' <b>' + d.al.length + '</b> no período'],
      ['saude', 'Saúde do dispositivo', 'Tensão e temperatura da última leitura.', 'ok', I('bateria', 'c-ok') + ' <b>' + (ultimo && ultimo.mv ? ultimo.mv + ' mV' : 'sem dado') + '</b> ' + (ultimo && ultimo.temp != null ? ultimo.temp + ' °C' : '')],
      ['baixar', 'Exportação CSV e PDF', 'Planilha completa e este relatório.', '', I('csv', 'c-info') + ' CSV ' + I('pdf', 'c-info') + ' PDF']
    ];
    $('caps').innerHTML = CAPS.map(function (c) { return '<div class="cap ' + c[3] + '"><h3>' + I(c[0]) + c[1] + '</h3><p>' + c[2] + '</p><div class="ex">' + c[4] + '</div></div>'; }).join('');
    // Mapa real
    if (mapa) { mapa.remove(); mapa = null; }
    if (d.pts.length && window.L) {
      mapa = L.map('mapa', { zoomControl: false, attributionControl: true, preferCanvas: true });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 17, attribution: '© OpenStreetMap' }).addTo(mapa);
      var ll = d.pts.map(function (x) { return x.p; });
      L.polyline(ll, { color: '#00b894', weight: 4 }).addTo(mapa);
      d.pts.filter(function (x) { return x.al; }).forEach(function (x) { L.circleMarker(x.p, { radius: 6, color: '#d63031', fillOpacity: .9 }).addTo(mapa); });
      L.circleMarker(ll[ll.length - 1], { radius: 7, color: '#fff', weight: 3, fillColor: '#0984e3', fillOpacity: 1 }).addTo(mapa);
      mapa.fitBounds(L.latLngBounds(ll).pad(0.2), { maxZoom: 15 });
      $('fMapa').textContent = 'Trilha em verde, alertas em vermelho, última posição em azul; posição arredondada em cerca de 100 m.';
    } else $('mapa').innerHTML = '<div class="vazio">Sem posição no período.</div>';
    $('paradas').innerHTML = d.paradas.length ? d.paradas.map(function (p, i) { return '<div class="parada">' + I(i ? 'local' : 'casa') + '<div><b>Área ' + (i + 1) + '</b><small>' + dmy(p.de) + ' ' + hm(p.de) + ' a ' + hm(p.ate) + '</small></div><div class="dur"><b>' + dur(p.s) + '</b><small>permanência</small></div></div>'; }).join('') : '<div class="vazio">Nenhuma parada de 5 min ou mais.</div>';
    // Linha do tempo
    var h0 = Math.floor(dados.de / 3600000), h1 = Math.floor(dados.ate / 3600000), fx = '';
    for (var h = h0; h <= h1; h++) { var x = d.horas[h]; fx += '<div title="' + dataHora(h * 3600000) + '" style="flex:1;background:' + (!x ? CINZA : x.al ? VERM : VERDE) + ';opacity:' + (x ? 1 : .35) + '"></div>'; }
    $('faixa').innerHTML = fx;
    var tl = [], prev = null;
    dados.recs.forEach(function (r) {
      var n = rede(r), t = tms(r);
      if (prev && n !== prev) tl.push([t, n === 'ntn' ? 'satelite' : 'rede', 'c-info', 'Troca para ' + (n === 'ntn' ? 'satélite NTN' : 'Cat-M'), r.transport || '']);
      if (r.type === 'alarm') tl.push([t, 'alerta', 'c-alerta', 'Alerta ' + (r.event || ''), r.value != null ? 'valor ' + r.value : '']);
      else if (r.type === 'event') tl.push([t, 'info', 'c-neutro', 'Evento ' + (r.event || ''), r.value != null ? 'valor ' + r.value : '']);
      prev = n;
    });
    var tlv = tl.slice(-40).reverse();
    $('tl').innerHTML = tlv.length ? tlv.map(function (x) { return '<li><span class="h">' + hm(x[0]) + '</span>' + I(x[1], x[2]) + '<span>' + esc(x[3]) + ' <span class="m">' + esc(x[4]) + '</span></span><span class="m">' + dmy(x[0]) + '</span></li>'; }).join('') : '<li><span class="m">Nenhum evento no período.</span></li>';
    var unid = f === 'meter' ? 'L' : 'KB', conv = f === 'meter' ? function (v) { return v; } : function (v) { return v / 1024; };
    $('fHora').textContent = (f === 'meter' ? 'Consumo de água' : 'Dados enviados') + ' somado por hora do dia (BRT).';
    $('porHora').innerHTML = barras(d.porHora.map(conv), AZUL, d.porHora.map(function (_, i) { return i + 'h'; }), unid);
    $('fDia').textContent = (f === 'meter' ? 'Consumo' : 'Dados') + ' por dia da semana no período.';
    $('porDia').innerHTML = barras(d.porDia.map(conv), VERDE, ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'], unid);
    $('fAl').textContent = d.al.length ? d.al.length + ' alertas reais no período, os mais recentes primeiro.' : 'Nenhum alerta no período.';
    $('alertas').innerHTML = d.al.slice(-12).reverse().map(function (r) { return '<div class="alerta-item">' + I('alerta') + '<div><b>' + dmy(tms(r)) + ' ' + hm(tms(r)) + ' ' + esc(r.event || 'alerta') + '</b><br><small>valor ' + esc(r.value) + (r.totalL != null ? ' · total ' + r.totalL + ' L' : '') + '</small></div></div>'; }).join('') || '<div class="vazio">Sem alertas.</div>';
    $('saude').innerHTML = '<div class="spark">' + I('sinal', 'c-info') + '<b>' + (d.rsrpMed == null ? '' : d.rsrpMed + ' dBm') + '</b></div>' + linha(d.rsrp, AZUL, 'RSRP (dBm)') + '<div class="spark" style="margin-top:10px">' + I('bateria', 'c-ok') + '<b>' + (d.mv.length ? d.mv[d.mv.length - 1] + ' mV' : '') + '</b></div>' + linha(d.mv, VERDE, 'Tensão (mV)');
    var taxa = d.ok != null && d.ok + d.fail ? Math.round(d.ok / (d.ok + d.fail) * 100) + '%' : 'sem dado';
    $('rede').innerHTML = [['rede', num(d.catm), 'envios Cat-M', ''], ['satelite', num(d.ntn), 'envios NTN', ''], ['atualizar', num(d.trocas), 'trocas de rede', ''], ['lidos', taxa, 'sucesso de envio', 'ok'], ['offline', d.fail == null ? 'sem dado' : num(d.fail), 'falhas de envio', d.fail ? 'alerta' : '']]
      .map(function (k) { return '<div class="kpi ' + k[3] + '">' + I(k[0]) + '<div><b>' + k[1] + '</b><span>' + k[2] + '</span></div></div>'; }).join('');
    var dias = Object.keys(d.porData);
    $('redeGraf').innerHTML = dias.length ? '<h2 style="margin-top:12px">Consumo por dia</h2>' + barras(dias.map(function (k) { return conv(d.porData[k]); }), AZUL, dias, unid) : '';
    // Anexo paginado
    var ls = linhas(dados.recs), P = 35, pg = '', cols = COLS.filter(function (c) { return c !== 'rx'; });
    for (var i = 0; i < ls.length; i += P) {
      pg += '<div class="pg"><small>Página ' + (i / P + 1) + ' de ' + Math.ceil(ls.length / P) + '</small><table><thead><tr>' + cols.map(function (c) { return '<th>' + (ROT[c] || c) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        ls.slice(i, i + P).map(function (o) { return '<tr>' + cols.map(function (c) { return '<td>' + esc(o[c]) + '</td>'; }).join('') + '</tr>'; }).join('') + '</tbody></table></div>';
    }
    $('anexo').innerHTML = pg || '<div class="vazio">Sem registros.</div>';
    $('fAnexo').textContent = ls.length + ' registros; na tela aparece a primeira página e o PDF traz todas.';
  }
  function baixar(nome, txt) { var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = nome; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000); }
  function iniciar() {
    var q = new URLSearchParams(location.search);
    if (NOMES[q.get('fonte')]) $('fonte').value = q.get('fonte');
    if (q.get('dias') && $('per').querySelector('option[value="' + q.get('dias') + '"]')) $('per').value = q.get('dias');
    $('fonte').onchange = carregar; $('per').onchange = function () { $('perX').hidden = $('per').value !== 'x'; if ($('per').value !== 'x') carregar(); };
    $('de').onchange = $('ate').onchange = function () { if ($('de').value && $('ate').value) carregar(); };
    $('csv').onclick = function () { baixar('relatorio-' + dados.fonte + '-' + new Date().toISOString().slice(0, 10) + '.csv', csv(dados.recs)); };
    $('pdf').onclick = function () { if (mapa) mapa.invalidateSize(); setTimeout(function () { window.print(); }, 300); };
    carregar();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
