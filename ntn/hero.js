/* v44: indicador de status grande (hero), modo Apresentação e seções recolhíveis. Aditivo: só lê os registros já carregados. */
(function () {
  'use strict';
  var P = window.NtnPro, qs = new URLSearchParams(location.search);
  var LS_COL = 'ntnHeroCollapsed'; // chave nova, não altera as existentes
  var t = function (r) { return Date.parse(r.ts || r.rx); };
  var ST = {
    catm: { cls: 'catm', ico: '📶', txt: 'CONECTADO VIA CELULAR (LTE-M)', sub: 'Rede terrestre Cat-M · Deutsche Telekom IoT' },
    ntn: { cls: 'ntn', ico: '🛰', txt: 'CONECTADO VIA SATÉLITE SKYLO (NTN)', sub: 'Rede não terrestre NB-IoT NTN · Skylo' },
    search: { cls: 'search', ico: '🔎', txt: 'BUSCANDO SATÉLITE SKYLO', sub: 'Placa em modo NTN, ainda sem registro ou aguardando dados do satélite' },
    off: { cls: 'off', ico: '⛔', txt: 'SEM CONEXÃO / NTN DESCONECTADO', sub: 'Sem dados recentes ou rede perdida' },
    noresp: { cls: 'off', ico: '⛔', txt: 'SEM RESPOSTA DA PLACA', sub: 'Busca de satélite iniciada há mais de 30 min sem nenhum sinal de vida' },
    nodata: { cls: 'off', ico: '⛔', txt: 'SEM DADOS DA PLACA', sub: 'Nenhum registro recebido no período' }
  };
  /* Mapeamento (somente campos reais):
     - sem registros => nodata
     - liveStatus.stale (último dado há mais de 5 min em Cat-M ou 15 min em NTN, só no modo ao vivo) => off
     - último evento de rede (lost/fail/reg/sw/wait) ou telemetria: se for 'lost' ou 'fail' => off
     - liveStatus.waiting (evento 'wait') ou último 'sw' para NTN (value 1) sem 'reg'/telemetria depois => search
     - liveStatus.net === 'ntn' => ntn ; 'catm' => catm */
  function state(all, now, src) {
    var s = P.liveStatus(all, now);
    if (!s) return { k: 'nodata', s: null };
    var bs = busca(all, now); // v46: busca NTN declarada pela placa tem prioridade sobre 'dado velho'
    if (bs && bs.ativa) return { k: 'search', s: s, b: bs };
    if (bs && bs.expirou) return { k: 'noresp', s: s, b: bs };
    if (s.stale && src !== 'replay') return { k: 'off', s: s };
    var rs = P.sortRecs(all).filter(function (r) { return t(r) <= now && (r.type === 'telemetry' || (r.type === 'event' && /^(lost|fail|reg|sw|wait)$/.test(r.event))); });
    var last = rs[rs.length - 1];
    if (last && last.type === 'event' && (last.event === 'lost' || last.event === 'fail')) return { k: 'off', s: s };
    // v45: evidência real primeiro. Telemetria Cat-M depois do 'wait' anula o estado de busca.
    var lastWait = null; for (var i = rs.length - 1; i >= 0; i--) { if (rs[i].type === 'event' && /^(wait|reg|sw)$/.test(rs[i].event)) { lastWait = rs[i]; break; } }
    var catmAfter = last && last.type === 'telemetry' && last.net === 'catm' && lastWait && t(last) > t(lastWait);
    if ((s.waiting && !catmAfter) || (last && last.type === 'event' && last.event === 'sw' && last.value === 1)) return { k: 'search', s: s };
    return { k: s.net === 'ntn' ? 'ntn' : 'catm', s: s };
  }

  /* v46: início de busca NTN = evento probe 'inicio', sw value 1, sat_start ou stest value 1.
     Termina com: reg NTN, telemetria via NTN, probe 'fim', sw value 0, back_catm, boot ou telemetria Cat-M posterior.
     Em busca a placa normalmente não consegue enviar nada até registrar; por isso não vira vermelho por falta de dado antes de 30 min. */
  var LIM_BUSCA = 30 * 60000;
  function isStart(r) { return r.type === 'event' && ((r.event === 'probe' && /inicio/.test(r.info || '')) || (r.event === 'sw' && r.value === 1) || r.event === 'sat_start' || (r.event === 'stest' && r.value === 1)); }
  function busca(all, now) {
    var rs = P.sortRecs(all).filter(function (r) { return t(r) <= now; }), i, st = null;
    for (i = rs.length - 1; i >= 0; i--) if (isStart(rs[i])) { st = i; break; }
    if (st == null) return null;
    var ini = rs[st], ev = rs.slice(st), b = { ini: ini, t0: t(ini), sinal: null, sync: null, reg: null, traf: null, rej: [] };
    for (i = st; i < rs.length; i++) if (isStart(rs[i])) { b.t0 = Math.min(b.t0, t(rs[i])); } else break;
    for (i = 1; i < ev.length; i++) {
      var r = ev[i];
      if (isStart(r)) continue;
      if (r.type === 'event' && ((r.event === 'probe' && /fim/.test(r.info || '')) || (r.event === 'sw' && r.value === 0) || r.event === 'back_catm' || r.event === 'boot')) return { fim: true };
      if (r.type === 'telemetry' && r.net === 'catm' && !(r.plmn === '90198')) return { fim: true };
      if ((r.net === 'ntn' || r.plmn === '90198' || r.type === 'satsum' || r.type === 'satdet') && (r.rsrp != null || r.rsrpAvg != null)) b.sinal = { rsrp: r.rsrp != null ? r.rsrp : r.rsrpAvg, snr: r.snr != null ? r.snr : r.snrAvg, at: t(r) };
      if (r.type === 'event' && (r.event === 'fix' || r.event === 'gnss_ok' || r.event === 'wait' || r.event === 'sat_search')) b.sync = b.sync || t(r);
      if (r.type === 'event' && (r.event === 'sat_reg' || (r.event === 'reg' && (r.net === 'ntn' || /NTN|Skylo/.test(r.info || ''))))) b.reg = b.reg || t(r);
      if (r.type === 'telemetry' && r.net === 'ntn') b.traf = b.traf || t(r);
      if (r.rej != null) b.rej.push(r.rej);
      if (r.type === 'event' && r.event === 'fail') b.rej.push(r.info || 'falha');
    }
    if (b.traf || b.reg) return null; // registrou: estado normal (ntn) assume
    // v48: posição usada na busca (GPS interno precisa de fix antes do attach NTN)
    var antes = rs.slice(0, st + 1).reverse(), tel = antes.find(function (r) { return r.type === 'telemetry'; }) || null;
    var cel = antes.find(function (r) { return r.type === 'telemetry' && /^celula/.test(r.posSrc || '') && r.lat != null; }) || null;
    var src = ini.posSrc || (tel && tel.posSrc) || null, km = null;
    if (ini.lat != null && cel && src !== 'celula') { var R = 6371, rad = Math.PI / 180, dLa = (cel.lat - ini.lat) * rad, dLo = (cel.lon - ini.lon) * rad, a = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(ini.lat * rad) * Math.cos(cel.lat * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2); km = 2 * R * Math.asin(Math.sqrt(a)); }
    var age = tel && tel.gnssAge != null ? tel.gnssAge : null;
    b.gps = { src: src, age: age, km: km, ok: /^(gnss|injetada|agnss)/.test(src || '') || (age != null && age >= 0 && age < 600) };
    // v48: fim previsto da sonda (início + duração + 5 min de margem)
    if (ini.event === 'probe' && ini.value > 0) { b.fimPrev = b.t0 + (ini.value + 5) * 60000; b.semRetorno = now > b.fimPrev; }
    var lastAny = Math.max.apply(null, rs.map(function (r) { return Date.parse(r.rx || r.ts); }));
    b.lastAny = lastAny; b.ativa = now - Math.max(lastAny, b.t0) < LIM_BUSCA; b.expirou = !b.ativa;
    return b;
  }
  var EMM = { 2: 'IMSI desconhecido na rede', 3: 'UE ilegal (SIM rejeitado)', 6: 'equipamento ilegal', 7: 'serviço EPS não permitido no SIM', 11: 'PLMN não permitida (SIM sem perfil Skylo)', 12: 'área de rastreamento não permitida', 13: 'roaming não permitido nesta área', 14: 'EPS não permitido nesta PLMN', 15: 'sem células adequadas nesta área', 17: 'falha de rede', 22: 'congestionamento' };
  function refsNtn(recs) { var rs = P.sortRecs(recs), out = [], t0 = null; rs.forEach(function (r) { if (isStart(r)) { if (t0 == null) t0 = t(r); } else if (t0 != null && r.type === 'event' && (r.event === 'sat_reg' || (r.event === 'reg' && (r.net === 'ntn' || /NTN|Skylo/.test(r.info || ''))))) { out.push({ regSec: (t(r) - t0) / 1000, at: r.ts }); t0 = null; } else if (t0 != null && r.type === 'event' && (r.event === 'boot' || (r.event === 'sw' && r.value === 0) || r.event === 'back_catm')) t0 = null; }); return out; }
  window.HeroBusca = { busca: function (all, now) { return busca(all, now); }, refs: function (a) { return (REF || []).concat(refsNtn(a)); } };
  var REF = null;
  fetch('replay.json?v=43', { cache: 'force-cache' }).then(function (r) { return r.json(); }).then(function (j) { REF = refsNtn(j.records); }).catch(function () {});
  function painelBusca(b, all, now) {
    var el = document.getElementById('heroBusca'); if (!el) return;
    if (!b) { el.hidden = true; return; }
    if (window.BuscaUI) { window.BuscaUI.render(el, { t0: b.t0, iniTxt: ({ probe: 'sonda NTN iniciada', sw: 'comutação para satélite', sat_start: 'teste satélite iniciado', stest: 'modo teste ligado' }[b.ini.event] || b.ini.event) + (b.ini.event === 'probe' && b.ini.value ? ', ' + b.ini.value + ' min' : ''), sinal: b.sinal, sync: b.sync, reg: b.reg, refs: (REF || []).concat(refsNtn(all)).map(function (x) { return x.regSec * 1000; }), rej: b.rej, gps: b.gps, fimPrev: b.fimPrev, semRetorno: b.semRetorno }); return; }
    var min = Math.floor((now - b.t0) / 60000), etapa = b.reg ? 3 : b.sync ? 2 : 1;
    var et = ['Buscar', 'Sincronizar', 'Registrar', 'Trafegar'].map(function (n, i) { return '<span class="hb-et' + (i + 1 < etapa ? ' feito' : i + 1 === etapa ? ' atual' : '') + '">' + (i + 1) + '. ' + n + '</span>'; }).join('');
    var refs = (REF || []).concat(refsNtn(all));
    var refTxt = refs.length ? refs.map(function (x) { return P.fmtDur(x.regSec) + ' (' + new Date(x.at).toLocaleDateString('pt-BR') + ')'; }).slice(-3).join(', ') : 'nenhum registro NTN medido no histórico carregado';
    var rej = b.rej.map(function (c) { return /^\d+$/.test(String(c)) ? 'causa ' + c + ': ' + (EMM[c] || 'código não mapeado') : String(c); });
    el.hidden = false;
    el.innerHTML = '<div class="hb-row"><div><small>Buscando há</small><b>' + min + ' min</b><span>desde ' + new Date(b.t0).toLocaleTimeString('pt-BR') + ' (' + ({ probe: 'sonda NTN iniciada', sw: 'comutação para satélite', sat_start: 'teste satélite iniciado', stest: 'modo teste ligado' }[b.ini.event] || b.ini.event) + (b.ini.event === 'probe' && b.ini.value ? ', ' + b.ini.value + ' min' : '') + ')</span></div>' +
      '<div><small>Sinal do satélite</small><b>' + (b.sinal ? b.sinal.rsrp + ' dBm' + (b.sinal.snr != null ? ' · SNR ' + b.sinal.snr + ' dB' : '') : 'sinal ainda não reportado') + '</b></div>' +
      '<div><small>Tempo de registro já observado (dados reais)</small><b style="font-size:14px">' + refTxt + '</b></div></div>' +
      '<div class="hb-ets">' + et + '</div>' +
      '<p class="hb-nota">Em busca NTN a placa normalmente não consegue enviar nada até registrar no satélite. Sem dados novos aqui é esperado; o painel só fica vermelho após 30 min sem nenhum sinal de vida.</p>' +
      (rej.length ? '<p class="hb-rej"><b>Rejeição reportada pela placa:</b> ' + rej.join(' · ') + '</p>' : '') +
      '<details class="hb-ts" open><summary><b>Troubleshooting</b></summary><ul>' +
      ['Céu aberto com visada para o norte (satélite geoestacionário)', 'Sem teto metálico nem vidro com película térmica/metalizada acima da antena', 'Placa e antena perto do vidro ou do teto, antena voltada para cima', 'Veículo em movimento pode atrasar o registro; se possível, pare em local aberto', 'Aguardar o registro sem reiniciar a placa', 'Botão 4 acionado e LED indicando modo satélite', 'SIM Deutsche Telekom ativo com perfil NTN', 'Bandas NTN habilitadas no modem (23, 255, 256)'].map(function (x) { return '<li><label><input type="checkbox"> ' + x + '</label></li>'; }).join('') + '</ul></details>';
  }
  function fmtT(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'n/d'; }
  window.drawHero = function (all, now, src) {
    var ate = Date.parse(qs.get('ate') || ''); if (ate) { all = all.filter(function (r) { return t(r) <= ate; }); now = ate; } // v48: vista histórica dos dados reais (?ate=ISO)
    var el = document.getElementById('hero'); if (!el) return;
    var r = state(all, now, src), k = qs.get('estado') && ST[qs.get('estado')] ? qs.get('estado') : r.k, d = ST[k], s = r.s;
    el.className = 'hero ' + d.cls;
    painelBusca((k === 'search' || k === 'noresp') && r.b && r.b.t0 ? r.b : null, all, now);
    el.innerHTML = '<div class="hero-ico">' + d.ico + '</div><div class="hero-main"><div class="hero-txt">' + d.txt + '</div><div class="hero-sub">' + d.sub + (src === 'replay' ? ' · REPLAY' : '') + (qs.get('estado') ? ' · ESTADO FORÇADO PARA TESTE' : '') + (ate ? ' · VISTA HISTÓRICA DOS DADOS REAIS EM ' + new Date(ate).toLocaleString('pt-BR') : '') + '</div></div>' +
      '<div class="hero-meta"><div><small>No estado atual</small><b>' + (r.b && r.b.t0 ? P.fmtDur((now - r.b.t0) / 1000) : s && s.sinceSec != null ? P.fmtDur(s.sinceSec) : 'n/d') + '</b></div><div><small>Último dado</small><b>' + (s ? fmtT(s.lastRx) : 'n/d') + '</b><span>' + (s ? 'há ' + P.fmtDur(s.ageSec) : '') + '</span></div></div>';
  };
  // F1: modo Apresentação agora em ../apresentacao.js (botão único btnApresentacao)
  // seções recolhíveis (fechadas por padrão)
  var saved = {}; try { saved = JSON.parse(localStorage.getItem(LS_COL) || '{}'); } catch (e) {}
  document.querySelectorAll('main.grid > section.card').forEach(function (c, i) {
    if (c.classList.contains('map-card') || c.hasAttribute('data-aberto')) return;
    var h = c.querySelector('.card-h'); if (!h) return;
    var id = c.id || ('sec' + i); c.classList.add('colap'); if (saved[id] !== false) c.classList.add('fechada');
    var tg = document.createElement('button'); tg.className = 'colap-btn'; tg.type = 'button'; tg.textContent = 'detalhes'; h.appendChild(tg);
    tg.onclick = function () { c.classList.toggle('fechada'); saved[id] = c.classList.contains('fechada'); localStorage.setItem(LS_COL, JSON.stringify(saved)); window.dispatchEvent(new Event('resize')); };
  });
})();
