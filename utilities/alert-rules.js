/* alert-rules.js: regras de alerta do medidor (Utilities), com média móvel e desvio percentual.
   Script clássico: expõe window.AlertRules e module.exports (testável no Node com vm).
   Só usa leituras reais da API (ntn-lab ?meter=1). Nada é simulado.
   Se a API já trouxer r.rolling[metrica] (calculado no backend), esse valor é usado;
   senão o mesmo cálculo é feito aqui, a partir das mesmas leituras. */
(function (root) {
  'use strict';

  /* Métricas acompanhadas. higherIsBetter define a cor da seta:
     consumo acima da média é ruim (seta vermelha); sinal acima da média é bom (seta verde). */
  var METRICS = {
    deltaL: { label: 'Consumo', unit: 'L', higherIsBetter: false },
    rsrp: { label: 'Sinal RSRP', unit: 'dBm', higherIsBetter: true },
    snr: { label: 'SNR', unit: 'dB', higherIsBetter: true }
  };
  var MOVING_AVERAGE_WINDOW = 24;          // últimas 24 leituras
  var RULE_A_ABOVE_AVERAGE_PCT = 20;       // A: consumo mais de 20% acima da média
  var RULE_B_BELOW_AVERAGE_PCT = 30;       // B: consumo mais de 30% abaixo da média
  var RULE_C_CONSECUTIVE_ABOVE = 5;        // C: 5 leituras seguidas acima da média
  var RULE_D_NIGHT_FACTOR = 1.5;           // D: noturno acima de 1,5x a média noturna
  var RULE_D_NIGHT_START_HOUR = 22, RULE_D_NIGHT_END_HOUR = 6; // 22h às 6h BRT
  var RULE_E_STALE_FACTOR = 2;             // E: sem leitura há mais de 2x o intervalo esperado
  var HISTORY_MAX_AGE_DAYS = 30;           // histórico de notificações: apaga após 30 dias
  var MIN = 60000, DAY = 86400000;

  var RULES = {
    A: { color: 'red', label: 'Consumo acima da média' },
    B: { color: 'yellow', label: 'Queda de consumo' },
    C: { color: 'orange', label: 'Tendência de alta' },
    D: { color: 'purple', label: 'Consumo noturno atípico' },
    E: { color: 'grey', label: 'Sem leituras' }
  };

  function timeOf(r) { return Date.parse(r.ts || r.rx); }
  function isNumber(v) { return typeof v === 'number' && isFinite(v); }
  function roundOne(v) { return Math.round(v * 10) / 10; }
  /* Hora em BRT (UTC-3 fixo, sem horário de verão no Brasil desde 2019). */
  function hourBRT(ms) { return new Date(ms - 3 * 3600000).getUTCHours(); }
  function isNightBRT(ms) { var h = hourBRT(ms); return h >= RULE_D_NIGHT_START_HOUR || h < RULE_D_NIGHT_END_HOUR; }

  /* Média das leituras anteriores (até 24) e desvio percentual do valor atual.
     devPct é null quando a média é zero (não dá para calcular porcentagem sem inventar). */
  function rollingStat(previousValues, currentValue) {
    var window = previousValues.slice(-MOVING_AVERAGE_WINDOW);
    if (!window.length || !isNumber(currentValue)) return null;
    var sum = 0; window.forEach(function (v) { sum += v; });
    var mean = sum / window.length;
    var devPct = mean !== 0 ? roundOne(((currentValue - mean) / Math.abs(mean)) * 100) : null;
    return { mean: roundOne(mean), n: window.length, devPct: devPct };
  }

  /* Leituras de telemetria do medidor, ordenadas, cada uma com rolling[metrica]. */
  function annotate(records) {
    var readings = (records || []).filter(function (r) { return r && r.type === 'telemetry' && !isNaN(timeOf(r)); })
      .sort(function (a, b) { return timeOf(a) - timeOf(b); });
    var previousByMetric = {}; Object.keys(METRICS).forEach(function (m) { previousByMetric[m] = []; });
    return readings.map(function (r) {
      var out = {}; for (var k in r) out[k] = r[k];
      var fromBackend = r.rolling || {}, rolling = {};
      Object.keys(METRICS).forEach(function (metric) {
        var value = r[metric];
        rolling[metric] = fromBackend[metric] || rollingStat(previousByMetric[metric], value);
        if (isNumber(value)) previousByMetric[metric].push(value);
      });
      out.rolling = rolling;
      return out;
    });
  }

  function averageText(stat) { return stat.n >= MOVING_AVERAGE_WINDOW ? 'das últimas 24 leituras' : 'de ' + stat.n + ' leitura' + (stat.n === 1 ? '' : 's') + ' (ainda não há 24)'; }

  /* Regras A a D aplicadas a cada leitura de consumo (deltaL). Retorna lista de disparos. */
  function evaluateReadings(annotated) {
    var fired = [], consecutiveAbove = 0, nightValues = [];
    annotated.forEach(function (r) {
      var value = r.deltaL, stat = r.rolling && r.rolling.deltaL, t = timeOf(r);
      var base = { metric: 'deltaL', at: t, seq: r.seq, value: value };
      if (!isNumber(value)) return;
      if (stat && stat.mean > 0 && stat.devPct != null) {
        // A: consumo acima de 20% da média móvel -> badge vermelho
        if (stat.devPct > RULE_A_ABOVE_AVERAGE_PCT) fired.push(assign(base, { rule: 'A', threshold: roundOne(stat.mean * 1.2), mean: stat.mean, n: stat.n,
          message: 'Consumo ' + Math.round(stat.devPct) + '% acima da média ' + averageText(stat) }));
        // B: queda acima de 30% abaixo da média -> badge amarelo
        if (stat.devPct < -RULE_B_BELOW_AVERAGE_PCT) fired.push(assign(base, { rule: 'B', threshold: roundOne(stat.mean * 0.7), mean: stat.mean, n: stat.n,
          message: 'Possível falha de sensor ou equipamento desligado (consumo ' + Math.round(-stat.devPct) + '% abaixo da média ' + averageText(stat) + ')' }));
      }
      // C: 5 leituras consecutivas acima da média -> alerta de tendência (dispara na 5ª, não repete até zerar)
      var above = stat && stat.mean > 0 && value > stat.mean;
      consecutiveAbove = above ? consecutiveAbove + 1 : 0;
      if (consecutiveAbove === RULE_C_CONSECUTIVE_ABOVE) fired.push(assign(base, { rule: 'C', threshold: stat.mean, mean: stat.mean, n: stat.n,
        message: 'Tendência de alta: ' + RULE_C_CONSECUTIVE_ABOVE + ' leituras seguidas acima da média ' + averageText(stat) }));
      // D: leitura noturna (22h às 6h BRT) acima de 1,5x a média das leituras noturnas anteriores
      if (isNightBRT(t)) {
        var night = rollingStat(nightValues, value);
        if (night && night.mean > 0 && value > night.mean * RULE_D_NIGHT_FACTOR) fired.push(assign(base, { rule: 'D', threshold: roundOne(night.mean * RULE_D_NIGHT_FACTOR), mean: night.mean, n: night.n,
          message: 'Consumo noturno atípico: ' + value + ' L, acima de 1,5x a média noturna de ' + night.n + ' leitura' + (night.n === 1 ? '' : 's') + ' (' + night.mean + ' L)' }));
        nightValues.push(value);
      }
    });
    return fired;
  }
  function assign(a, b) { var o = {}, k; for (k in a) o[k] = a[k]; for (k in b) o[k] = b[k]; return o; }

  /* Intervalo esperado entre leituras: mediana dos intervalos reais (mínimo 3 intervalos). */
  function expectedIntervalMs(annotated) {
    var gaps = [];
    for (var i = 1; i < annotated.length; i++) { var g = timeOf(annotated[i]) - timeOf(annotated[i - 1]); if (g > 0) gaps.push(g); }
    if (gaps.length < 3) return null;
    gaps = gaps.slice(-20).sort(function (a, b) { return a - b; });
    return gaps[gaps.length >> 1];
  }

  /* E: sem leitura nova há mais de 2x o intervalo esperado -> badge cinza.
     Convive com o indicador de saúde (health-badge.js), que marca "parado" só em 3x ou 24 h:
     E avisa antes, o indicador de saúde continua sendo a fonte do estado online/parado. */
  function evaluateStale(annotated, now) {
    var last = annotated[annotated.length - 1], iv = expectedIntervalMs(annotated);
    if (!last || !iv) return null;
    var age = now - timeOf(last);
    if (age <= RULE_E_STALE_FACTOR * iv) return null;
    var minutes = Math.round(age / MIN);
    return { rule: 'E', metric: 'leituras', at: timeOf(last), seq: last.seq, value: minutes, threshold: Math.round((RULE_E_STALE_FACTOR * iv) / MIN),
      message: 'Sem leituras há ' + minutes + ' minutos (esperado a cada ~' + Math.max(1, Math.round(iv / MIN)) + ' min)' };
  }

  /* Tudo de uma vez: leituras anotadas, disparos históricos e alertas ativos (última leitura + E). */
  function compute(records, now) {
    now = now == null ? Date.now() : now;
    var annotated = annotate(records).filter(function (r) { return timeOf(r) <= now; });
    var fired = evaluateReadings(annotated), stale = evaluateStale(annotated, now);
    var last = annotated[annotated.length - 1];
    var active = fired.filter(function (a) { return last && a.at === timeOf(last); });
    if (stale) { active.push(stale); fired.push(stale); }
    return { readings: annotated, fired: fired, active: active, last: last || null };
  }

  /* ---------- Histórico de notificações ----------
     Persistência: o backend ntn-lab ainda não guarda notificações (ver relatório), então o histórico
     fica no localStorage deste navegador (chave cu.alertHistory). Chave única por regra+métrica+registro,
     para não duplicar o mesmo disparo a cada atualização. Entradas com mais de 30 dias são removidas. */
  var HISTORY_STORAGE_KEY = 'cu.alertHistory';
  function historyKey(a) { return a.rule + '|' + a.metric + '|' + (a.seq != null ? a.seq : a.at); }
  function mergeHistory(history, fired, now) {
    now = now == null ? Date.now() : now;
    var byKey = {}, out = [];
    (history || []).forEach(function (h) { if (now - h.at <= HISTORY_MAX_AGE_DAYS * DAY && !byKey[h.key]) { byKey[h.key] = h; out.push(h); } });
    (fired || []).forEach(function (a) {
      var key = historyKey(a);
      if (byKey[key] || now - a.at > HISTORY_MAX_AGE_DAYS * DAY) return;
      var entry = { key: key, at: a.at, rule: a.rule, metric: a.metric, value: a.value, threshold: a.threshold, message: a.message, read: false };
      byKey[key] = entry; out.push(entry);
    });
    return out.sort(function (x, y) { return y.at - x.at; });
  }
  function unreadCount(history) { return (history || []).filter(function (h) { return !h.read; }).length; }
  function markAllRead(history) { return (history || []).map(function (h) { return assign(h, { read: true }); }); }
  function toggleRead(history, key) { return (history || []).map(function (h) { return h.key === key ? assign(h, { read: !h.read }) : h; }); }
  function filterHistory(history, metric, rule) { return (history || []).filter(function (h) { return (!metric || metric === 'all' || h.metric === metric) && (!rule || rule === 'all' || h.rule === rule); }); }
  function loadHistory() { try { return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY) || '[]'); } catch (e) { return []; } }
  function saveHistory(h) { try { localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(h)); } catch (e) {} }

  var api = { METRICS: METRICS, RULES: RULES, MOVING_AVERAGE_WINDOW: MOVING_AVERAGE_WINDOW, rollingStat: rollingStat, annotate: annotate, evaluateReadings: evaluateReadings,
    evaluateStale: evaluateStale, expectedIntervalMs: expectedIntervalMs, compute: compute, isNightBRT: isNightBRT,
    historyKey: historyKey, mergeHistory: mergeHistory, unreadCount: unreadCount, markAllRead: markAllRead, toggleRead: toggleRead, filterHistory: filterHistory,
    loadHistory: loadHistory, saveHistory: saveHistory, HISTORY_STORAGE_KEY: HISTORY_STORAGE_KEY };
  root.AlertRules = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
