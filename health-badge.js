/* health-badge.js: saude ao vivo de cada aparelho (RF-02). Script classico, expoe window.HealthBadge. */
(function (root) {
  var HARD = { catm: 300, ntn: 900 };
  function netOf(r) { var n = String(r.txNet || r.net || '').toLowerCase(); return n === 'ntn' || n === 'sat' || n === 'satelite' ? 'ntn' : 'catm'; }
  function tms(r) { return Date.parse(r.rx || r.ts); }
  function median(a) { var s = a.slice().sort(function (x, y) { return x - y; }); var m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  function hhmm(ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }); }
  function ago(s) { if (s < 90) return 'há ' + s + ' s'; if (s < 5400) return 'há ' + Math.round(s / 60) + ' min'; if (s < 172800) return 'há ' + Math.round(s / 3600) + ' h'; return 'há ' + Math.round(s / 86400) + ' d'; }

  /* Calculo puro (testavel no Node) */
  function compute(records, now, hardOverride) {
    now = now || Date.now();
    var rs = (records || []).filter(function (r) { return !isNaN(tms(r)); }).sort(function (a, b) { return tms(a) - tms(b); });
    if (!rs.length) return { state: 'parado', ageSec: null, net: null, rsrp: null, lastRx: null, ivMedian: null };
    var last = rs[rs.length - 1], net = netOf(last), hard = hardOverride || HARD[net];
    var tel = rs.filter(function (r) { return r.type === 'telemetry'; }); if (tel.length < 3) tel = rs;
    tel = tel.slice(-20); var gaps = [];
    for (var i = 1; i < tel.length; i++) { var g = (Date.parse(tel[i].ts || tel[i].rx) - Date.parse(tel[i - 1].ts || tel[i - 1].rx)) / 1000; if (g > 0) gaps.push(g); }
    var iv = gaps.length >= 3 ? median(gaps) : hard;
    var lastRx = tms(last), ageSec = Math.max(0, Math.round((now - lastRx) / 1000));
    var lastTel = rs.slice().reverse().find(function (r) { return r.type === 'telemetry' && r.rsrp != null; });
    var state = (ageSec >= hard || ageSec >= 3 * iv) ? 'parado' : (ageSec >= 1.5 * iv ? 'atrasado' : 'online');
    return { state: state, ageSec: ageSec, net: net, rsrp: lastTel ? lastTel.rsrp : null, lastRx: lastRx, ivMedian: iv };
  }

  var el = null, opts = {}, dismissedAt = null, lastSeen = null;
  function init(containerId, options) { el = document.getElementById(containerId); opts = options || {}; }
  function update(records) {
    if (!el) return;
    var h = compute(records, Date.now(), opts.hardLimitSec);
    var netTxt = h.net === 'ntn' ? 'Satélite' : (h.net ? 'Cat-M' : 'sem dados');
    var rsrp = h.rsrp != null ? ' · ' + h.rsrp + ' dBm' : '';
    var age = h.ageSec == null ? 'sem dados' : ago(h.ageSec);
    if (h.lastRx !== lastSeen) { dismissedAt = null; lastSeen = h.lastRx; }
    var html = '<div class="hb hb--' + h.state + '" title="' + h.state + '"><span class="hb-dot"></span><span class="hb-net">' + netTxt + rsrp + '</span><span class="hb-age">' + age + '</span></div>';
    if (h.state === 'parado' && h.lastRx && dismissedAt === null)
      html += '<div class="hb-banner" role="alert">Sem dados desde ' + hhmm(h.lastRx) + ' (' + age + '), último dado via ' + netTxt + '. <button class="hb-dismiss" type="button">Dispensar</button></div>';
    el.innerHTML = html;
    var b = el.querySelector('.hb-dismiss'); if (b) b.onclick = function () { dismissedAt = Date.now(); update(records); };
  }
  var api = { init: init, update: update, compute: compute };
  root.HealthBadge = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
