/* v7: indicador de status (hero), modo Apresentação e cards recolhíveis no Utilities. Aditivo; só lê o que utilities.js já calculou. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), LS_COL = 'cuHeroCollapsed';
  var ST = {
    catm: ['catm', '📶', 'Conectado via celular (LTE-M)', 'Rede terrestre Cat-M'],
    ntn: ['ntn', '🛰', 'Conectado via satélite Skylo (NTN)', 'Registrado na rede Skylo 90198'],
    search: ['search', '🔎', 'Buscando satélite Skylo', 'Placa saiu do Cat-M para o teste NTN e ainda não registrou. Em busca ela pode não enviar nada até registrar'],
    off: ['off', '⛔', 'Sem conexão, NTN desconectado', 'Sem envios recentes da placa'],
    desligado: ['desligado', '', 'Desligado', 'Sem nenhuma mensagem da placa há mais de 5 min'],
    nodata: ['off', '⛔', 'Sem dados da placa', 'Nenhum registro recebido']
  };
  function dur(ms) { if (ms == null || ms < 0) return 'n/d'; var s = Math.round(ms / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' min'; }
  function hm(ms) { return ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'n/d'; }
  var ultimo = null;
  setInterval(function () { if (ultimo) window.drawHeroU(ultimo); }, 30000); // timer local da regra Desligado
  window.drawHeroU = function (o) {
    var el = document.getElementById('hero'); if (!el) return; ultimo = o;
    var now = Date.now(), dl = window.StatusDesligado && o.key !== 'nodata' ? (function () { var a = window.StatusDesligado.semComunicacao(o.lastRx, now, !!o.buscaSat, null); if (o.offLimMs) a = { offline: now - o.lastRx > o.offLimMs, limMs: o.offLimMs, min: Math.max(0, Math.floor((now - o.lastRx) / 60000)) }; return { desligado: !!o.lastRx && a.offline, limMs: a.limMs, min: a.min }; })() : { desligado: false }; /* v75: limiar da Utilities (5 min em busca, 2,5x intervalo em Cat-M) */
    var k = qs.get('estado') && ST[qs.get('estado')] ? qs.get('estado') : dl.desligado ? 'desligado' : o.key, d = ST[k];
    if (k === 'desligado' && dl.desligado) d = ['desligado', window.StatusDesligado.ICO, 'Desligada / sem comunicação', 'Último dado às ' + window.StatusDesligado.horaCurta(o.lastRx) + ' · nenhum envio da placa (nuvem ou USB) há mais de ' + Math.round(dl.limMs / 60000) + ' min · ' + window.StatusDesligado.texto(dl.min) + (o.lastNet ? ' · última rede conhecida: ' + o.lastNet : '')];
    if (k === 'off' && o.lastRx && !qs.get('estado')) d = ['off', '⛔', 'Offline: sem dados da placa há ' + dur(now - o.lastRx), 'Último dado ' + hm(o.lastRx) + (o.lastNet ? ' · última rede conhecida: ' + o.lastNet : '')];
    el.hidden = false; el.className = 'hero ' + d[0];
    var BU = window.BuscaCardU || window.BuscaUI; // v13: cartão único no Utilities; BuscaUI fica de reserva
    if (window.BuscaCardU && d[0] === 'search') { el.classList.add('bc-hero'); d = d.slice(); d[2] = 'Buscando satélite Skylo'; d[3] = 'Placa em teste NTN, ainda sem registro'; }
    if (window.BuscaCardU && d[0] === 'ntn' && o.ultRsrp && o.ultRsrp.rsrp != null) { d = d.slice(); d[3] += ' · último sinal enviado pela placa: ' + window.BuscaCardU.chipNivel(o.ultRsrp.rsrp) + (o.ultRsrp.at ? ' às ' + new Date(o.ultRsrp.at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''); }
    if (BU) BU.render(document.getElementById('heroBusca'), d[0] === 'search' ? Object.assign({ lastRx: o.lastRx }, o.busca || { t0: o.since || now }) : null);
    el.innerHTML = '<div class="hero-ico">' + d[1] + '</div><div class="hero-main"><div class="hero-txt">' + d[2] + '</div><div class="hero-sub">' + d[3] + (o.note ? ' · ' + o.note : '') + (qs.get('estado') ? ' · estado forçado para teste' : '') + '</div></div>' +
      '<div class="hero-meta"><div><small>No estado atual</small><b>' + (o.since ? dur(now - o.since) : 'n/d') + '</b></div><div><small>Último dado</small><b>' + hm(o.lastRx) + '</b><span>' + (o.lastRx ? 'há ' + dur(now - o.lastRx) : '') + '</span></div></div>';
  };
  // F3: botão único de Modo Apresentação compartilhado (../apresentacao.js)
  if (window.Apresentacao) window.Apresentacao.init();
  var saved = {}; try { saved = JSON.parse(localStorage.getItem(LS_COL) || '{}'); } catch (e) {}
  document.querySelectorAll('main.u2 > section.card').forEach(function (c, i) {
    if (c.querySelector('#map') || c.querySelector('#cChart')) return; // mapa e consumo sempre abertos
    var h = c.querySelector('.card-h'); if (!h) return;
    var id = c.id || ('u' + i); c.classList.add('colap'); if (saved[id] !== false) c.classList.add('fechada');
    var tg = document.createElement('button'); tg.className = 'colap-btn'; tg.type = 'button'; tg.textContent = 'detalhes'; h.appendChild(tg);
    tg.onclick = function () { c.classList.toggle('fechada'); saved[id] = c.classList.contains('fechada'); localStorage.setItem(LS_COL, JSON.stringify(saved)); window.dispatchEvent(new Event('resize')); };
  });
})();
