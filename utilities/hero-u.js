/* v7: indicador de status (hero), modo Apresentação e cards recolhíveis no Utilities. Aditivo; só lê o que utilities.js já calculou. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), LS_COL = 'cuHeroCollapsed';
  var ST = {
    catm: ['catm', '📶', 'CONECTADO VIA CELULAR (LTE-M)', 'Rede terrestre Cat-M'],
    ntn: ['ntn', '🛰', 'CONECTADO VIA SATÉLITE SKYLO (NTN)', 'Registrado na rede Skylo 90198'],
    search: ['search', '🔎', 'BUSCANDO SATÉLITE SKYLO', 'Placa saiu do Cat-M para o teste NTN e ainda não registrou. Em busca ela pode não enviar nada até registrar'],
    off: ['off', '⛔', 'SEM CONEXÃO / NTN DESCONECTADO', 'Sem envios recentes da placa'],
    nodata: ['off', '⛔', 'SEM DADOS DA PLACA', 'Nenhum registro recebido']
  };
  function dur(ms) { if (ms == null || ms < 0) return 'n/d'; var s = Math.round(ms / 1000); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min' : Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' min'; }
  function hm(ms) { return ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'n/d'; }
  window.drawHeroU = function (o) {
    var el = document.getElementById('hero'); if (!el) return;
    var k = qs.get('estado') && ST[qs.get('estado')] ? qs.get('estado') : o.key, d = ST[k], now = Date.now();
    if (k === 'off' && o.lastRx && !qs.get('estado')) d = ['off', '⛔', 'OFFLINE: SEM DADOS DA PLACA HÁ ' + dur(now - o.lastRx).toUpperCase(), 'Último dado ' + hm(o.lastRx) + (o.lastNet ? ' · última rede conhecida: ' + o.lastNet : '')];
    el.className = 'hero ' + d[0];
    if (window.BuscaUI) window.BuscaUI.render(document.getElementById('heroBusca'), d[0] === 'search' ? (o.busca || { t0: o.since || now }) : null);
    el.innerHTML = '<div class="hero-ico">' + d[1] + '</div><div class="hero-main"><div class="hero-txt">' + d[2] + '</div><div class="hero-sub">' + d[3] + (o.note ? ' · ' + o.note : '') + (qs.get('estado') ? ' · ESTADO FORÇADO PARA TESTE' : '') + '</div></div>' +
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
