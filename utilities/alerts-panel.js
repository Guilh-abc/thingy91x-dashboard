/* alerts-panel.js: interface das regras de alerta (alert-rules.js) no Utilities.
   - setas verde/vermelha com desvio % ao lado de cada métrica (#metricDeltas)
   - badges dos alertas ativos A a E (#ruleBadges)
   - gráfico de linha por métrica com média móvel e pontos de alerta (#metricChart)
   - painel "Histórico de Alertas" com filtros, lido/não lido e "Exportar agora" (CSV)
   Script clássico: window.AlertsPanel. Só dados reais vindos da API. */
(function () {
  'use strict';
  var R = window.AlertRules;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var dateTimeBRT = function (ms) { return new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
  var nf = function (n) { return Number(n).toLocaleString('pt-BR'); };
  var selectedChartMetric = 'deltaL', historyMetricFilter = 'all', historyRuleFilter = 'all', lastResult = null;
  var METRIC_LABELS = { deltaL: 'Consumo', rsrp: 'Sinal RSRP', snr: 'SNR', leituras: 'Leituras' };

  /* Seta: sobe ou desce conforme o desvio; cor conforme a métrica (consumo alto = vermelho, sinal alto = verde). */
  function arrowHtml(metric, stat) {
    var info = R.METRICS[metric];
    if (!stat) return '<span class="md-flat">sem média ainda</span>';
    var nTxt = stat.n >= R.MOVING_AVERAGE_WINDOW ? 'média de 24 leituras' : 'média de ' + stat.n + ' leitura' + (stat.n === 1 ? '' : 's');
    if (stat.devPct == null) return '<span class="md-flat">média ' + nf(stat.mean) + ' ' + info.unit + ' · desvio indefinido (média zero) · ' + nTxt + '</span>';
    var up = stat.devPct > 0, flat = stat.devPct === 0, good = flat ? null : (up === info.higherIsBetter);
    var cls = flat ? 'md-flat' : good ? 'md-good' : 'md-bad';
    return '<span class="' + cls + '">' + (flat ? '→' : up ? '▲' : '▼') + ' ' + (up ? '+' : '') + nf(stat.devPct) + '%</span> <small class="muted">vs ' + nTxt + ' (' + nf(stat.mean) + ' ' + info.unit + ')</small>';
  }
  function renderDeltas(res) {
    var el = $('metricDeltas'); if (!el) return;
    if (!res.last) { el.innerHTML = '<div class="muted">Aguardando leituras do medidor.</div>'; return; }
    el.innerHTML = Object.keys(R.METRICS).map(function (m) {
      var v = res.last[m];
      return '<div class="md-row"><span class="muted">' + R.METRICS[m].label + '</span><b>' + (v == null ? 'sem valor' : nf(v) + ' ' + R.METRICS[m].unit) + '</b> ' + (v == null ? '' : arrowHtml(m, res.last.rolling[m])) + '</div>';
    }).join('');
  }
  function renderBadges(res) {
    var el = $('ruleBadges'); if (!el) return;
    el.innerHTML = res.active.length ? res.active.map(function (a) { return '<div class="rb rb--' + R.RULES[a.rule].color + '" title="Regra ' + a.rule + '">' + esc(a.message) + '</div>'; }).join('')
      : '<div class="muted">Nenhum alerta de média ativo na última leitura.</div>';
  }

  /* Gráfico de linha: valor (azul), média móvel (tracejado) e pontos de alerta (cor da regra). */
  var RULE_COLORS = { red: '#ff5470', yellow: '#ffd23f', orange: '#ff9a3c', purple: '#c79bff', grey: '#9aa4b8' };
  function renderChart(res) {
    var el = $('metricChart'); if (!el) return;
    var m = selectedChartMetric, pts = res.readings.filter(function (r) { return typeof r[m] === 'number'; }).slice(-200);
    if (pts.length < 2) { el.innerHTML = '<div class="empty-st">Precisa de pelo menos 2 leituras com ' + METRIC_LABELS[m] + '.</div>'; return; }
    var W = 720, H = 220, L = 44, B = 22, t = function (r) { return Date.parse(r.ts || r.rx); };
    var vals = []; pts.forEach(function (r) { vals.push(r[m]); if (r.rolling[m]) vals.push(r.rolling[m].mean); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals); if (hi === lo) { hi += 1; lo -= 1; }
    var t0 = t(pts[0]), t1 = Math.max(t(pts[pts.length - 1]), t0 + 60000);
    var x = function (ms) { return L + ((ms - t0) / (t1 - t0)) * (W - L - 10); }, y = function (v) { return 10 + (1 - (v - lo) / (hi - lo)) * (H - B - 10); };
    var g = '';
    for (var k = 0; k <= 4; k++) { var v = lo + ((hi - lo) * k) / 4; g += '<line x1="' + L + '" x2="' + (W - 10) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#ffffff10"/><text x="' + (L - 4) + '" y="' + (y(v) + 3) + '" font-size="10" fill="#8e9ab5" text-anchor="end">' + nf(Math.round(v * 10) / 10) + '</text>'; }
    g += '<path d="' + pts.map(function (r, i) { return (i ? 'L' : 'M') + x(t(r)).toFixed(1) + ' ' + y(r[m]).toFixed(1); }).join('') + '" fill="none" stroke="#3d8bff" stroke-width="2"/>';
    var mp = pts.filter(function (r) { return r.rolling[m]; });
    if (mp.length > 1) g += '<path d="' + mp.map(function (r, i) { return (i ? 'L' : 'M') + x(t(r)).toFixed(1) + ' ' + y(r.rolling[m].mean).toFixed(1); }).join('') + '" fill="none" stroke="#2fd27a" stroke-width="1.5" stroke-dasharray="5 4"/>';
    res.fired.filter(function (a) { return a.metric === m && a.at >= t0; }).forEach(function (a) {
      var r = pts.find(function (p) { return t(p) === a.at; }); if (!r) return;
      g += '<circle cx="' + x(a.at) + '" cy="' + y(r[m]) + '" r="5" fill="' + RULE_COLORS[R.RULES[a.rule].color] + '" stroke="#fff" stroke-width="1"><title>' + esc(dateTimeBRT(a.at) + ' BRT · Regra ' + a.rule + ' · ' + a.message) + '</title></circle>';
    });
    g += '<text x="' + L + '" y="' + (H - 6) + '" font-size="10" fill="#8e9ab5">' + esc(dateTimeBRT(t0)) + '</text><text x="' + (W - 10) + '" y="' + (H - 6) + '" font-size="10" fill="#8e9ab5" text-anchor="end">' + esc(dateTimeBRT(t1)) + '</text>';
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%">' + g + '</svg>';
  }

  /* Histórico de Alertas (localStorage, ver alert-rules.js). */
  function renderHistory() {
    var h = R.loadHistory(), list = R.filterHistory(h, historyMetricFilter, historyRuleFilter), unread = R.unreadCount(h);
    if ($('ahUnread')) $('ahUnread').textContent = unread ? unread + ' não lido' + (unread === 1 ? '' : 's') : '';
    var el = $('ahList'); if (!el) return;
    el.innerHTML = list.length ? list.map(function (e) {
      return '<tr class="' + (e.read ? 'ah-read' : 'ah-unread') + '"><td class="mono">' + esc(dateTimeBRT(e.at)) + '</td><td>' + esc(METRIC_LABELS[e.metric] || e.metric) + '</td><td><span class="rb rb--' + R.RULES[e.rule].color + ' rb--sm">' + e.rule + '</span> ' + esc(R.RULES[e.rule].label) + '</td><td class="mono">' + esc(e.value) + '</td><td class="mono">' + esc(e.threshold) + '</td><td>' + esc(e.message) + '</td><td><button class="btn btn-sm" data-key="' + esc(e.key) + '">' + (e.read ? 'Marcar não lido' : 'Marcar lido') + '</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="muted">' + (h.length ? 'Nenhum alerta com esse filtro.' : 'Nenhum alerta disparado nos últimos 30 dias.') + '</td></tr>';
    el.querySelectorAll('button[data-key]').forEach(function (b) { b.onclick = function () { R.saveHistory(R.toggleRead(R.loadHistory(), b.dataset.key)); renderHistory(); }; });
  }
  var CSV_COLUMNS = ['quando', 'metrica', 'regra', 'valor', 'limiar', 'mensagem', 'lido'];
  var CSV_LABELS = { quando: 'data e hora (BRT)', metrica: 'métrica', regra: 'regra', valor: 'valor lido', limiar: 'limiar', mensagem: 'mensagem', lido: 'lido' };
  /* Exportar agora: CSV com o histórico completo (sem filtro), gerado na hora e baixado normalmente. */
  function exportHistoryNow() {
    var rows = R.loadHistory().map(function (e) { return { quando: dateTimeBRT(e.at), metrica: METRIC_LABELS[e.metric] || e.metric, regra: e.rule + ' ' + R.RULES[e.rule].label, valor: e.value, limiar: e.threshold, mensagem: e.message, lido: e.read ? 'sim' : 'não' }; });
    var now = new Date(Date.now() - 3 * 3600000), name = 'utilities-alertas-' + now.getUTCFullYear() + '-' + String(now.getUTCMonth() + 1).padStart(2, '0') + '.csv';
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([window.ApiCore.toCSV(rows, CSV_COLUMNS, CSV_LABELS)], { type: 'text/csv;charset=utf-8' }));
    a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function bindOnce() {
    if (bindOnce.done) return; bindOnce.done = true;
    var seg = function (id, fn) { document.querySelectorAll('#' + id + ' button').forEach(function (b) { b.addEventListener('click', function () { fn(b); document.querySelectorAll('#' + id + ' button').forEach(function (x) { x.classList.toggle('on', x === b); }); if (lastResult) renderChart(lastResult); renderHistory(); }); }); };
    seg('mcSeg', function (b) { selectedChartMetric = b.dataset.m; });
    if ($('ahMetric')) $('ahMetric').onchange = function () { historyMetricFilter = this.value; renderHistory(); };
    if ($('ahRule')) $('ahRule').onchange = function () { historyRuleFilter = this.value; renderHistory(); };
    if ($('ahAllRead')) $('ahAllRead').onclick = function () { R.saveHistory(R.markAllRead(R.loadHistory())); renderHistory(); };
    if ($('ahExport')) $('ahExport').onclick = exportHistoryNow;
  }
  function render(records) {
    if (!R) return null;
    bindOnce();
    var res = R.compute(records, Date.now()); lastResult = res;
    R.saveHistory(R.mergeHistory(R.loadHistory(), res.fired, Date.now())); // sem duplicar: chave regra+métrica+registro
    renderDeltas(res); renderBadges(res); renderChart(res); renderHistory();
    return res;
  }
  window.AlertsPanel = { render: render, exportHistoryNow: exportHistoryNow };
})();
