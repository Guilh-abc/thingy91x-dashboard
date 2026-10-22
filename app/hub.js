/* hub.js: Início do sistema. Só leitura e só dados reais; o que faltar aparece como "sem dado".
   Fontes: ntn-lab (Rastreador NTN e medidor Utilities), nRF Cloud com a chave deste navegador (Thingy:91X), /api/users (admin). */
(function (root) {
  var TZ = 'America/Sao_Paulo', H1 = 3600000;
  function tms(r) { return Date.parse(r.rx || r.ts); }
  function rede(r) { var n = String(r.txNet || r.net || '').toLowerCase(); return n === 'ntn' || n === 'sat' || n === 'satelite' ? 'ntn' : 'catm'; }
  function diaBRT(t) { return new Date(t).toLocaleDateString('pt-BR', { timeZone: TZ }); }
  function horaBRT(t) { return +new Date(t).toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: TZ }) % 24; }
  function rel(t, agora) { if (t == null) return 'sem dado'; var s = Math.max(0, Math.round((agora - t) / 1000)); return s < 90 ? 'há ' + s + ' s' : s < 5400 ? 'há ' + Math.round(s / 60) + ' min' : s < 172800 ? 'há ' + Math.round(s / 3600) + ' h' : 'há ' + Math.round(s / 86400) + ' d'; }
  function porIdade(s) { return s == null ? null : s < 900 ? 'online' : s < 3600 ? 'atrasado' : 'desligado'; }
  function qualidade(rsrp) { return rsrp == null ? null : rsrp >= -90 ? 'bom' : rsrp >= -105 ? 'regular' : 'fraco'; }
  var EV = { leak: 'vazamento', boot: 'Ligou', sw: 'Troca de rede', reg: 'Registro na rede', sim: 'Leitura do SIM', fsel: 'Seleção de rede', stest: 'Autoteste', sat_start: 'Início no satélite' };
  /* Estado de um aparelho a partir dos registros da API (último envio e intervalo típico). */
  function estadoApi(recs, agora) {
    var rs = (recs || []).filter(function (r) { return !isNaN(tms(r)); }).sort(function (a, b) { return tms(a) - tms(b); });
    if (!rs.length) return { estado: 'sem dado', ultimo: null };
    var u = tms(rs[rs.length - 1]), e = root.HealthBadge ? root.HealthBadge.compute(rs, agora).state : porIdade((agora - u) / 1000);
    return { estado: e === 'parado' ? 'desligado' : e, ultimo: u };
  }
  /* Cálculo puro do hub. th = { ultimo, spd, semChave }. */
  function resumo(ntn, meter, th, agora) {
    agora = agora || Date.now(); ntn = ntn || []; meter = meter || []; th = th || {};
    var tEst = th.semChave ? 'sem chave' : th.ultimo ? porIdade((agora - th.ultimo) / 1000) : 'sem dado';
    var disp = [
      { id: 'thingy91x', nome: 'Thingy:91X', estado: tEst, ultimo: th.ultimo || null, mov: th.ultimo && agora - th.ultimo < 900000 && th.spd != null ? (th.spd > 5 ? 'em movimento' : 'parado') : null },
      Object.assign({ id: 'ntn', nome: 'Rastreador NTN' }, estadoApi(ntn, agora)),
      Object.assign({ id: 'utilities', nome: 'Medidor Utilities' }, estadoApi(meter, agora))
    ];
    var todos = ntn.map(function (r) { return Object.assign({ _o: 'Rastreador NTN' }, r); }).concat(meter.map(function (r) { return Object.assign({ _o: 'Medidor Utilities' }, r); }))
      .filter(function (r) { return !isNaN(tms(r)); }).sort(function (a, b) { return tms(a) - tms(b); });
    var hoje = diaBRT(agora), hj = todos.filter(function (r) { return diaBRT(tms(r)) === hoje; });
    var porHora = new Array(horaBRT(agora) + 1).fill(0), catm = 0, sat = 0;
    hj.forEach(function (r) { var b = +r.bytes || 0; porHora[horaBRT(tms(r))] += b; if (rede(r) === 'ntn') sat += b; else catm += b; });
    if (th.bytesHoje) { catm += th.bytesHoje; }
    var al = todos.filter(function (r) { return r.type === 'alarm' && agora - tms(r) <= 24 * H1; });
    var ultAl = al.length ? tms(al[al.length - 1]) : null;
    var sev = !al.length ? null : agora - ultAl <= H1 ? 'crítica' : 'alta';
    var tel = todos.filter(function (r) { return r.rsrp != null; }), rsrp = tel.length ? tel[tel.length - 1].rsrp : null;
    var ult = Math.max.apply(null, [0].concat(disp.map(function (d) { return d.ultimo || 0; }))) || null;
    // Utilities: leitura atual e tendência (litros nas últimas 24 h contra as 24 h anteriores)
    var mt = meter.filter(function (r) { return r.totalL != null; }).sort(function (a, b) { return tms(a) - tms(b); });
    var soma = function (de, ate) { return meter.reduce(function (s, r) { var t = tms(r); return s + (t > de && t <= ate && +r.deltaL > 0 ? +r.deltaL : 0); }, 0); };
    var l24 = soma(agora - 24 * H1, agora), l48 = soma(agora - 48 * H1, agora - 24 * H1);
    // Consumo de dados hoje por chip e tecnologia
    var chips = {}; hj.forEach(function (r) { var k = r._o + ' · ' + (rede(r) === 'ntn' ? 'NTN' : 'Cat-M'); chips[k] = (chips[k] || 0) + (+r.bytes || 0); });
    /* Matriz solução x tecnologia (hoje e 7 dias); as 3 soluções sempre aparecem, mesmo com 0 B. */
    var SOL = [['Thingy:91X', ['catm']], ['Rastreador NTN', ['catm', 'ntn']], ['Medidor Utilities', ['catm', 'ntn']]];
    var mat = { hoje: {}, d7: {} }; SOL.forEach(function (x) { mat.hoje[x[0]] = { catm: 0, ntn: 0, n: 0 }; mat.d7[x[0]] = { catm: 0, ntn: 0, n: 0 }; });
    todos.forEach(function (r) { var t = tms(r), b = +r.bytes || 0, k = rede(r); if (agora - t <= 7 * 24 * H1) { mat.d7[r._o][k] += b; mat.d7[r._o].n++; } if (diaBRT(t) === hoje) { mat.hoje[r._o][k] += b; mat.hoje[r._o].n++; } });
    if (th.bytesHoje != null) { mat.hoje['Thingy:91X'].catm = th.bytesHoje; mat.hoje['Thingy:91X'].n = th.bytesHoje ? 1 : 0; }
    if (th.bytes7 != null) { mat.d7['Thingy:91X'].catm = th.bytes7; mat.d7['Thingy:91X'].n = th.bytes7 ? 1 : 0; }
    if (th.semChave || th.bytesHoje == null) mat.hoje['Thingy:91X'].semDado = mat.d7['Thingy:91X'].semDado = true;
    var tot = function (m) { var o = { catm: 0, ntn: 0 }; Object.keys(m).forEach(function (k) { o.catm += m[k].catm; o.ntn += m[k].ntn; }); return o; };
    var sinal = function (lista) { var x = lista.filter(function (r) { return r.rsrp != null; }).pop(); return x ? x.rsrp : null; };
    var sis = disp.map(function (x) { var rs = x.id === 'ntn' ? ntn : x.id === 'utilities' ? meter : []; var r = sinal(rs); return { nome: x.nome, ultimo: x.ultimo, rsrp: r, qual: qualidade(r) }; });
    // Feed de eventos
    var feed = todos.filter(function (r) { return r.type === 'alarm' || r.type === 'event'; }).map(function (r) {
      var ev = EV[r.event] || r.event || 'evento';
      return r.type === 'alarm' ? { t: tms(r), tipo: 'alerta', txt: 'Alerta de ' + ev, de: r._o }
        : { t: tms(r), tipo: r.event === 'sw' || r.event === 'fsel' ? 'rede' : r.event === 'boot' ? 'online' : 'evento', txt: ev, de: r._o };
    });
    todos.filter(function (r) { return r.type === 'telemetry'; }).slice(-3).forEach(function (r) { feed.push({ t: tms(r), tipo: 'envio', txt: 'Envio ' + (rede(r) === 'ntn' ? 'NTN' : 'Cat-M') + (r.bytes ? ' de ' + r.bytes + ' B' : ''), de: r._o }); });
    disp.forEach(function (d) { if (d.estado === 'desligado' && d.ultimo) feed.push({ t: d.ultimo, tipo: 'desligado', txt: 'Último envio antes de ficar sem sinal', de: d.nome }); });
    feed.sort(function (a, b) { return b.t - a.t; });
    var np = ntn.filter(function (r) { return r.lat != null && r.lon != null; }).pop();
    var pos = th.pos || (np ? [+np.lat, +np.lon] : null); if (pos) pos = pos.map(function (v) { return Math.round(v * 1000) / 1000; });
    var alPor = {}; al.forEach(function (r) { alPor[r._o] = (alPor[r._o] || 0) + 1; });
    return { sol: SOL, mat: mat, totHoje: tot(mat.hoje), tot7: tot(mat.d7), sis: sis, alPor: alPor, pos: pos, posDe: th.pos ? 'Thingy:91X' : np ? 'Rastreador NTN' : null, disp: disp, online: disp.filter(function (d) { return d.estado === 'online'; }).length, total: disp.length,
      bytesHoje: catm + sat, catm: catm, ntn: sat, porHora: porHora, al: al.length, sev: sev, ultAl: ultAl, ultAlTxt: al.length ? 'Alerta de ' + (EV[al[al.length - 1].event] || al[al.length - 1].event) + ' no ' + al[al.length - 1]._o : null,
      ultimo: ult, rsrp: rsrp, qual: qualidade(rsrp), leitura: mt.length ? mt[mt.length - 1].totalL : null, l24: l24, l48: l48,
      alConsumo: meter.filter(function (r) { return r.type === 'alarm' && agora - tms(r) <= 24 * H1; }).length,
      chips: Object.keys(chips).map(function (k) { return { k: k, b: chips[k] }; }).sort(function (a, b) { return b.b - a.b; }), feed: feed.slice(0, 10) };
  }
  /* Tile OSM e posição do ponto dentro dele (mini mapa leve, sem biblioteca). */
  function tile(pos, z) { var n = Math.pow(2, z), x = (pos[1] + 180) / 360 * n, la = pos[0] * Math.PI / 180, y = (1 - Math.log(Math.tan(la) + 1 / Math.cos(la)) / Math.PI) / 2 * n;
    return { z: z, x: Math.floor(x), y: Math.floor(y), px: (x % 1) * 100, py: (y % 1) * 100 }; }
  root.HubCalc = { tile: tile, resumo: resumo, rel: rel, qualidade: qualidade, porIdade: porIdade };
  if (typeof document === 'undefined') return;

  var PROXY = /(netlify\.app|pages\.dev)$/i.test(location.hostname), BASE = PROXY ? '' : 'https://thingy91x-x-dashboard.netlify.app';
  var API = BASE + '/.netlify/functions/ntn-lab', NRF = BASE + '/.netlify/functions/nrfcloud';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function bytes(b) { return b >= 1048576 ? (b / 1048576).toFixed(1).replace('.', ',') + ' MB' : b >= 1024 ? (b / 1024).toFixed(1).replace('.', ',') + ' KB' : b + ' B'; }
  function n(v) { return Number(v).toLocaleString('pt-BR'); }
  function tempo(p, ms) { return Promise.race([p, new Promise(function (_, r) { setTimeout(function () { r(new Error('tempo')); }, ms); })]); }
  function api(q) { return tempo(fetch(API + '?' + q + '=1&days=8&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }), 15000).then(function (j) { return j.records || []; }).catch(function () { return null; }); }
  function thingy() {
    var ls = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    var key = ls('nrf_api_key'), mail = ls('nrf_user_email'), dev = ls('nrf_device_id') || '50423451-3737-4337-80fc-110bddf418ff';
    if (!key) return Promise.resolve({ semChave: true });
    var hd = { Authorization: mail ? 'Basic ' + btoa(unescape(encodeURIComponent(mail + ':' + key))) : 'Bearer ' + key, 'X-User-Api-Key': key,
      'X-Memfault-Org': ls('nrf_org_slug') || 'telekom', 'X-Memfault-Project': ls('nrf_project_slug') || 'nrf-project' };
    if (mail) hd['X-User-Email'] = mail; if (ls('nrf_team_api_key')) hd['X-Nrf-Team-Key'] = ls('nrf_team_api_key');
    var j = function (u) { return tempo(fetch(NRF + u, { headers: hd, cache: 'no-store' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }), 15000).catch(function () { return null; }); };
    var td = root.ThingyDados ? root.ThingyDados.mensagens(7).then(function (ms) { return root.ThingyDados.medidor(ms, Date.now()); }).catch(function () { return null; }) : Promise.resolve(null);
    return Promise.all([j('/devices/' + encodeURIComponent(dev)), j('/location/history?deviceId=' + encodeURIComponent(dev) + '&pageLimit=1&pageSort=desc')]).then(function (r) {
      var lp = r[1] && r[1].items && r[1].items[0], tl = lp ? Date.parse(lp.recordedAt || lp.insertedAt) : null;
      var ts = root.StatusCartoes && r[0] ? root.StatusCartoes.ultimaData(r[0]) : null;
      return td.then(function (bh) { return { bytesHoje: bh ? bh.hoje : null, bytes7: bh ? bh.d7 : null, pos: lp ? [+lp.lat, +lp.lon] : null, ultimo: Math.max(ts || 0, tl || 0) || null, spd: lp && lp.meta && lp.meta.spd != null ? lp.meta.spd * 3.6 : null }; });
    });
  }
  var COR = { online: 'ok', atrasado: 'info', desligado: 'alerta', 'sem dado': 'neutro', 'sem chave': 'neutro' };
  var ROT = { online: 'Online', atrasado: 'Atrasado', desligado: 'Desligado', 'sem dado': 'Sem dado', 'sem chave': 'Sem chave' };
  function pill(est) { return '<span class="hub-st st-' + COR[est] + '">' + ROT[est] + '</span>'; }
  function spark(v) {
    var m = Math.max.apply(null, v.concat([1])), w = 120, h = 28, k = v.length > 1 ? w / (v.length - 1) : w;
    return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" role="img" aria-label="Bytes por hora hoje"><polyline fill="none" stroke="var(--cor-info)" stroke-width="2" points="' + v.map(function (x, i) { return (i * k).toFixed(1) + ',' + (h - 2 - x / m * (h - 4)).toFixed(1); }).join(' ') + '"/></svg>';
  }
  function render(d, agora) {
    var crit = d.sev === 'crítica';
    $('banner').hidden = !crit;
    if (crit) $('bannerTxt').textContent = d.ultAlTxt + ' ' + HubCalc.rel(d.ultAl, agora) + '.';
    var g = d.online === d.total ? ['ok', 'Tudo online'] : d.disp.every(function (x) { return x.ultimo == null; }) ? ['neutro', 'Sem dado'] : ['alerta', (d.total - d.online) + ' precisam de atenção'];
    $('kDisp').innerHTML = '<b>' + d.online + '/' + d.total + '</b><span class="hub-st st-' + g[0] + '">' + g[1] + '</span>';
    $('kDispS').textContent = d.disp.map(function (x) { return x.nome + ': ' + ROT[x.estado]; }).join(' · ');
    $('kDados').innerHTML = '<b>' + (d.bytesHoje ? bytes(d.bytesHoje) : 'sem dado') + '</b>' + (d.bytesHoje ? spark(d.porHora) : '');
    $('kDadosS').textContent = 'Cat-M ' + bytes(d.totHoje.catm) + ' · NTN ' + bytes(d.totHoje.ntn) + ' (3 soluções)';
    $('kDados').parentNode.parentNode.title = 'Hoje por solução: ' + d.sol.map(function (x) { var m = d.mat.hoje[x[0]]; return x[0] + ' ' + (m.semDado ? 'sem dado' : x[1].map(function (k) { return (k === 'ntn' ? 'NTN ' : 'Cat-M ') + bytes(m[k]); }).join(' + ')); }).join('; ') + '. Thingy:91X estimado pelo tamanho das mensagens.';
    $('kAl').innerHTML = '<b>' + d.al + '</b><span class="hub-st st-' + (d.al ? 'alerta' : 'ok') + '">' + (d.sev ? 'Severidade ' + d.sev : 'Nenhum') + '</span>';
    $('kAlS').textContent = d.al ? Object.keys(d.alPor).map(function (k) { return k + ': ' + d.alPor[k]; }).join(' · ') + ' · último ' + HubCalc.rel(d.ultAl, agora) : 'Nenhum sistema com alarme em 24 h';
    var rec = d.sis.reduce(function (a, x) { return x.ultimo && (!a || x.ultimo > a.ultimo) ? x : a; }, null);
    $('kUlt').innerHTML = '<b>' + (rec ? HubCalc.rel(rec.ultimo, agora) : 'sem dado') + '</b>' + (rec ? '<span class="hub-st st-info">' + esc(rec.nome) + '</span>' : '');
    $('kUltS').innerHTML = '<ul class="sis">' + d.sis.map(function (x) { return '<li' + (x === rec ? ' class="rec"' : '') + '><span>' + esc(x.nome) + '</span><span>' + HubCalc.rel(x.ultimo, agora) + '</span><span class="hub-st st-' + (x.qual === 'bom' ? 'ok' : x.qual === 'fraco' ? 'alerta' : x.qual ? 'info' : 'neutro') + '" title="' + (x.rsrp == null ? 'RSRP sem dado' : 'RSRP ' + x.rsrp + ' dBm') + '">' + (x.qual ? 'Sinal ' + x.qual + ' ' + x.rsrp + ' dBm' : 'Sinal sem dado') + '</span></li>'; }).join('') + '</ul>';
    var th = d.disp[0], nt = d.disp[1], mt = d.disp[2];
    $('cRast').innerHTML = [th, nt].map(function (x) { return '<li><span>' + x.nome + '</span>' + pill(x.estado) + '<small>' + (x.estado === 'sem chave' ? 'cadastre a chave do nRF Cloud' : (x.mov || (x.ultimo ? 'último envio ' + HubCalc.rel(x.ultimo, agora) : 'sem dado'))) + '</small></li>'; }).join('');
    var mm = $('miniMapa');
    if (d.pos) { var t = tile(d.pos, 14); var gr = ''; for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) gr += '<img loading="lazy" alt="" src="https://tile.openstreetmap.org/' + t.z + '/' + (t.x + dx) + '/' + (t.y + dy) + '.png">';
      mm.innerHTML = '<div class="tiles" role="img" aria-label="Mapa da última posição aproximada" style="left:calc(50% - ' + (256 + t.px * 2.56).toFixed(0) + 'px);top:' + (65 - 256 - t.py * 2.56).toFixed(0) + 'px">' + gr + '</div><span class="pino"></span><small class="osm">© OpenStreetMap · ' + esc(d.posDe) + ', posição aprox. 100 m</small>'; mm.classList.add('mapa'); }
    else mm.innerHTML = '<img loading="lazy" alt="" src="../assets/placa.webp"><small class="osm">Sem posição recente</small>';
    $('ctaChave').hidden = th.estado !== 'sem chave';
    var tend = !d.l24 && !d.l48 ? 'sem dado' : d.l24 > d.l48 ? 'subindo' : d.l24 < d.l48 ? 'caindo' : 'estável';
    $('cUt').innerHTML = '<li><span>Leitura atual</span><b>' + (d.leitura == null ? 'sem dado' : n(d.leitura) + ' L') + '</b></li><li><span>Últimas 24 h</span><b>' + n(d.l24) + ' L</b><small>tendência ' + tend + ' (24 h anteriores: ' + n(d.l48) + ' L)</small></li><li><span>Alertas de consumo</span><span class="hub-st st-' + (d.alConsumo ? 'alerta' : 'ok') + '">' + d.alConsumo + ' em 24 h</span></li><li><span>Medidor</span>' + pill(mt.estado) + '</li>';
    consumo(d);
    var u = null; try { u = JSON.parse(localStorage.getItem('ntn.relatorio.ultimo') || 'null'); } catch (e) {}
    $('cRel').innerHTML = '<li><span>Último gerado</span><b>' + (u ? esc(u.nome) + ' ' + HubCalc.rel(u.ts, agora) : 'sem dado') + '</b></li>';
    $('feed').innerHTML = d.feed.length ? d.feed.map(function (e) { return '<li class="ev ev-' + e.tipo + '"><i aria-hidden="true"></i><span><b>' + esc(e.txt) + '</b><small>' + esc(e.de) + '</small></span><time datetime="' + new Date(e.t).toISOString() + '" title="' + new Date(e.t).toLocaleString('pt-BR', { timeZone: TZ }) + ' (BRT)">' + HubCalc.rel(e.t, agora) + '</time></li>'; }).join('') : '<li class="ev ev-evento"><i></i><span><b>Sem eventos recentes</b></span></li>';
    document.querySelectorAll('.sk').forEach(function (x) { x.classList.remove('sk'); });
  }
  var ULT = null, PER = 'hoje';
  function consumo(d) {
    ULT = d || ULT; if (!ULT) return; d = ULT; var m = d.mat[PER], t = PER === 'hoje' ? d.totHoje : d.tot7;
    var mx = Math.max.apply(null, d.sol.map(function (x) { return m[x[0]].catm + m[x[0]].ntn; }).concat([1]));
    $('cConsTot').innerHTML = '<span><i class="lg catm"></i>Cat-M <b>' + bytes(t.catm) + '</b></span><span><i class="lg ntn"></i>NTN <b>' + bytes(t.ntn) + '</b></span>';
    $('cCons').innerHTML = d.sol.map(function (x) {
      var v = m[x[0]], tt = v.catm + v.ntn, so = x[1].length === 1 ? ' (só Cat-M)' : '';
      var val = v.semDado ? 'sem dado' : tt ? bytes(tt) : '0 B · sem envio ' + (PER === 'hoje' ? 'hoje' : 'em 7 dias');
      return '<li class="pilha" title="' + esc(x[0]) + ': Cat-M ' + bytes(v.catm) + (x[1].length > 1 ? ', NTN ' + bytes(v.ntn) : '') + (x[0] === 'Thingy:91X' ? ' (estimado pelo tamanho das mensagens)' : '') + '"><span>' + esc(x[0]) + '<small>' + so + '</small></span><b>' + val + '</b>' +
        '<div class="trilho"><i class="catm" style="width:' + (v.catm / mx * 100) + '%"></i><i class="ntn" style="width:' + (v.ntn / mx * 100) + '%"></i></div></li>';
    }).join('');
  }
  function acessos() {
    if (!root.Roles || !root.Roles.ehAdmin()) { $('cAc').innerHTML = '<li><span>Contagem por papel</span><b>sem dado</b></li>'; return; }
    tempo(fetch('/api/users', { cache: 'no-store', credentials: 'same-origin' }).then(function (r) { if (!r.ok) throw 0; return r.json(); }), 12000).then(function (j) {
      var c = { admin: 0, leitor: 0, viewer: 0 }; (j.users || []).forEach(function (u) { if (c[u.role] != null) c[u.role]++; });
      $('cAc').innerHTML = [['admin', 'Admins'], ['leitor', 'Leitores'], ['viewer', 'Viewers']].map(function (p) { return '<li><span>' + p[1] + '</span><b>' + c[p[0]] + '</b></li>'; }).join('');
    }).catch(function () { $('cAc').innerHTML = '<li><span>Contagem por papel</span><b>sem dado</b></li>'; });
  }
  function ciclo() {
    Promise.all([api('pro'), api('meter'), thingy()]).then(function (r) { var agora = Date.now(); render(resumo(r[0], r[1], r[2], agora), agora); });
    setTimeout(ciclo, 60000);
  }
  function iniciar() {
    document.querySelectorAll('[data-per]').forEach(function (b) { b.onclick = function () { PER = b.getAttribute('data-per'); document.querySelectorAll('[data-per]').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); }); consumo(); }; }); ciclo(); if (root.Roles && root.Roles.ehAdmin()) acessos(); document.addEventListener('papel-pronto', acessos); if (!$('cAc').innerHTML) acessos(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
