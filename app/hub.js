/* hub.js: cartões grandes do Início com status ao vivo de cada sistema. Só leitura, mesma API dos painéis. */
(function () {
  var API = (/(netlify\.app|pages\.dev)$/i.test(location.hostname) ? '' : 'https://thingy91x-x-dashboard.netlify.app') + '/.netlify/functions/ntn-lab';
  var ROT = { online: ['ok', 'Online'], atrasado: ['info', 'Atrasado'], parado: ['alerta', 'Desligado'] };
  function marcar(id, estado, txt) {
    var el = document.querySelector('[data-hub="' + id + '"] .hub-st'); if (!el) return;
    el.className = 'hub-st st-' + estado; el.textContent = txt;
  }
  function idade(s) { return s == null ? '' : s < 90 ? ' · há ' + s + ' s' : s < 5400 ? ' · há ' + Math.round(s / 60) + ' min' : ' · há ' + Math.round(s / 3600) + ' h'; }
  function status(id, q) {
    fetch(API + '?' + q + '=1&days=1&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      var h = window.HealthBadge ? window.HealthBadge.compute(j.records || [], Date.now()) : null;
      if (!h || !h.lastRx) return marcar(id, 'neutro', 'Sem dados hoje');
      var r = ROT[h.state] || ['neutro', h.state]; marcar(id, r[0], r[1] + idade(h.ageSec));
    }).catch(function () { marcar(id, 'neutro', 'Sem conexão'); });
  }
  function iniciar() { status('ntn', 'pro'); status('utilities', 'meter'); setTimeout(iniciar, 60000); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
