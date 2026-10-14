/* v44: indicador de status grande (hero), modo Apresentação e seções recolhíveis. Aditivo: só lê os registros já carregados. */
(function () {
  'use strict';
  var P = window.NtnPro, qs = new URLSearchParams(location.search);
  var LS_COL = 'ntnHeroCollapsed'; // chave nova, não altera as existentes
  var t = function (r) { return Date.parse(r.ts || r.rx); };
  var ST = {
    catm: { cls: 'catm', ico: '📶', txt: 'CONECTADO VIA CELULAR (LTE-M)', sub: 'Rede terrestre Cat-M · Deutsche Telekom IoT' },
    ntn: { cls: 'ntn', ico: '🛰', txt: 'CONECTADO VIA SATÉLITE SKYLO (NTN)', sub: 'Rede não terrestre NB-IoT NTN · Skylo' },
    search: { cls: 'search', ico: '🔎', txt: 'BUSCANDO SATÉLITE', sub: 'Placa em modo NTN, ainda sem registro ou aguardando dados do satélite' },
    off: { cls: 'off', ico: '⛔', txt: 'SEM CONEXÃO / NTN DESCONECTADO', sub: 'Sem dados recentes ou rede perdida' },
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
  function fmtT(iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'n/d'; }
  window.drawHero = function (all, now, src) {
    var el = document.getElementById('hero'); if (!el) return;
    var r = state(all, now, src), k = qs.get('estado') && ST[qs.get('estado')] ? qs.get('estado') : r.k, d = ST[k], s = r.s;
    el.className = 'hero ' + d.cls;
    el.innerHTML = '<div class="hero-ico">' + d.ico + '</div><div class="hero-main"><div class="hero-txt">' + d.txt + '</div><div class="hero-sub">' + d.sub + (src === 'replay' ? ' · REPLAY' : '') + (qs.get('estado') ? ' · ESTADO FORÇADO PARA TESTE' : '') + '</div></div>' +
      '<div class="hero-meta"><div><small>No estado atual</small><b>' + (s && s.sinceSec != null ? P.fmtDur(s.sinceSec) : 'n/d') + '</b></div><div><small>Último dado</small><b>' + (s ? fmtT(s.lastRx) : 'n/d') + '</b><span>' + (s ? 'há ' + P.fmtDur(s.ageSec) : '') + '</span></div></div>';
  };
  // modo Apresentação
  function setPres(on) { document.body.classList.toggle('apresentacao', on); var b = document.getElementById('btnPres2'); if (b) b.classList.toggle('on', on); setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 100); }
  var btn = document.getElementById('btnPres2');
  if (btn) btn.onclick = function () { setPres(!document.body.classList.contains('apresentacao')); };
  if (qs.get('modo') === 'apresentacao') setPres(true);
  // seções recolhíveis (fechadas por padrão)
  var saved = {}; try { saved = JSON.parse(localStorage.getItem(LS_COL) || '{}'); } catch (e) {}
  document.querySelectorAll('main.grid > section.card').forEach(function (c, i) {
    if (c.classList.contains('map-card')) return;
    var h = c.querySelector('.card-h'); if (!h) return;
    var id = c.id || ('sec' + i); c.classList.add('colap'); if (saved[id] !== false) c.classList.add('fechada');
    var tg = document.createElement('button'); tg.className = 'colap-btn'; tg.type = 'button'; tg.textContent = 'detalhes'; h.appendChild(tg);
    tg.onclick = function () { c.classList.toggle('fechada'); saved[id] = c.classList.contains('fechada'); localStorage.setItem(LS_COL, JSON.stringify(saved)); window.dispatchEvent(new Event('resize')); };
  });
})();
