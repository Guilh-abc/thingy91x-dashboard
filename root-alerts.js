/* root-alerts.js: inteligência do painel da raiz (placa Thingy:91 X com SIM local Telekom Cat-M, no carro).
   Métricas reais disponíveis na nuvem para essa placa: trilha de posições (nRF Cloud location/history)
   e mensagens dos sensores (appId: GNSS, BATTERY, TEMP, DEVICE...). Não existe "presença de dispositivos"
   na rede (estilo Fing) nos dados da nuvem, então:
   - A, B, C, D e E usam o deslocamento entre posições (movement-rules.js), como no Rastreador;
   - F (adaptação do "dispositivo novo ou sumiço"): tipo de mensagem (sensor) novo ou que parou de chegar.
   Lê lastTrail e lastMessages do app.js sem alterá-los (não mexe no pareamento nem na chave nRF Cloud).
   api-core.js tem nomes globais iguais aos do app.js (TZ, escHtml), por isso é carregado num escopo isolado. */
(function () {
  'use strict';
  var HISTORY_KEY = 'root.alertHistory', SENSOR_GONE_FACTOR = 3, DAY = 86400000;

  function loadApiCoreIsolated() {
    if (window.ApiCore) return Promise.resolve(window.ApiCore);
    return fetch('../api-core.js?v=3').then(function (r) { return r.text(); }).then(function (src) {
      var box = {}; new Function('window', 'module', 'location', src)(box, undefined, window.location); // escopo próprio, sem colidir com app.js
      return box.ApiCore;
    });
  }
  function trailRecords() {
    var trail = typeof lastTrail !== 'undefined' && Array.isArray(lastTrail) ? lastTrail : [];
    return trail.map(function (t) { return { type: 'telemetry', ts: t.at || t.recordedAt || t.insertedAt, lat: Number(t.lat), lon: Number(t.lon), src: t.serviceType || t._src || t.src }; })
      .filter(function (r) { return isFinite(r.lat) && isFinite(r.lon) && !isNaN(Date.parse(r.ts)); });
  }
  function messageRecords() { return typeof lastMessages !== 'undefined' && Array.isArray(lastMessages) ? lastMessages : []; }

  /* F: compara os tipos de mensagem das últimas 24 h com os 7 dias anteriores.
     Novo = apareceu agora e não existia antes. Sumiu = chegava antes e não chega há mais de 3x o intervalo típico dele. */
  function sensorChanges(messages, now) {
    var byType = {};
    messages.forEach(function (m) { var id = m.message && m.message.appId, t = Date.parse(m.receivedAt); if (!id || isNaN(t)) return; (byType[id] = byType[id] || []).push(t); });
    var out = [];
    Object.keys(byType).forEach(function (id) {
      var ts = byType[id].sort(function (a, b) { return a - b; }), first = ts[0], last = ts[ts.length - 1];
      if (now - first < DAY && ts.length && messages.some(function (m) { return now - Date.parse(m.receivedAt) > DAY; }))
        out.push({ rule: 'F', metric: 'sensores', at: first, seq: id, value: id, threshold: 'novo', message: 'Sensor novo: mensagens "' + id + '" começaram a chegar' });
      if (ts.length >= 3 && false) {
        var gaps = []; for (var i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]); gaps.sort(function (a, b) { return a - b; });
        var typical = gaps[gaps.length >> 1];
        if (typical > 0 && now - last > SENSOR_GONE_FACTOR * typical && now - last < 30 * DAY)
          out.push({ rule: 'F', metric: 'sensores', at: last, seq: id + '-sumiu', value: id, threshold: Math.round((SENSOR_GONE_FACTOR * typical) / 60000) + ' min',
            message: 'Sensor sumiu: "' + id + '" não chega há ' + Math.round((now - last) / 60000) + ' minutos (normal a cada ~' + Math.max(1, Math.round(typical / 60000)) + ' min)' });
      }
    });
    /* v2: sensores que pararam viram UM alerta só, com data e duração em dias/horas; chave estável (não reabre). */
    var gone = [];
    Object.keys(byType).forEach(function (id) {
      var ts = byType[id], last = ts[ts.length - 1]; if (ts.length < 3) return;
      var gaps = []; for (var i = 1; i < ts.length; i++) gaps.push(ts[i] - ts[i - 1]); gaps.sort(function (a, b) { return a - b; });
      var typical = gaps[gaps.length >> 1];
      if (typical > 0 && now - last > SENSOR_GONE_FACTOR * typical && now - last < 30 * DAY) gone.push({ id: id, last: last });
    });
    if (gone.length) {
      var since = Math.max.apply(null, gone.map(function (g) { return g.last; })), ids = gone.map(function (g) { return g.id; }).sort();
      var dia = new Date(since).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
      var dur = base.fmtDur(Math.round((now - since) / 60000));
      out.push({ rule: 'F', metric: 'sensores', at: since, seq: 'sumiu|' + ids.join(',') + '|' + dia, value: ids.join(', '), threshold: 'há ' + dur,
        message: 'Telemetria (' + ids.join(', ') + ') sem dados desde ' + dia + ', há ' + dur });
    }
    return out;
  }

  var base = window.MovementRules.create(window.AlertRules, { dropMessage: 'Possível interferência ou chip sem cobertura' });
  var engine = {}; for (var k in base) engine[k] = base[k];
  engine.RULES = {}; for (var r in base.RULES) engine.RULES[r] = base.RULES[r];
  engine.RULES.F = { color: 'grey', label: 'Sensor novo ou que sumiu' };
  engine.compute = function (records, now) {
    now = now == null ? Date.now() : now;
    var res = base.compute(records, now), changes = sensorChanges(messageRecords(), now);
    res.fired = res.fired.concat(changes); res.active = res.active.concat(changes.filter(function (c) { return now - c.at < DAY || /sumiu/.test(String(c.seq)); }));
    return res;
  };

  /* Exportar CSV dos dados (trilha + mensagens), padrão api-core: BOM, ';', coordenadas arredondadas, sem ICCID/IMSI. */
  function scrubIds(s) { return String(s).replace(/\d{15,22}/g, function (m) { return '••••' + m.slice(-4); }); }
  function exportDataCsv(api) {
    var rows = trailRecords().map(function (r) { return { ts: r.ts, tipo: 'posição', lat: r.lat, lon: r.lon, fonte: r.src || '', dado: '' }; })
      .concat(messageRecords().map(function (m) { return { ts: m.receivedAt, tipo: 'mensagem', lat: null, lon: null, fonte: (m.message && m.message.appId) || '', dado: scrubIds(JSON.stringify((m.message && m.message.data) != null ? m.message.data : '')).slice(0, 200) }; }))
      .sort(function (a, b) { return Date.parse(a.ts) - Date.parse(b.ts); });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([api.toCSV(rows, ['ts', 'tipo', 'lat', 'lon', 'fonte', 'dado'], { ts: 'data e hora (BRT)', tipo: 'tipo', lat: 'lat (~1 km)', lon: 'lon (~1 km)', fonte: 'fonte', dado: 'dado' })], { type: 'text/csv;charset=utf-8' }));
    a.download = 'cat-m-dados-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '') + '.csv'; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
  }
  function exportPdf(api) {
    var res = engine.compute(trailRecords(), Date.now()), last = res.last;
    var kpis = [['Posições na trilha', String(trailRecords().length)], ['Mensagens', String(messageRecords().length)]];
    if (last) { kpis.push(['Velocidade (última)', last.speedKmh != null ? last.speedKmh + ' km/h' : 'sem valor']); kpis.push(['Distância (última)', last.distM + ' m']); }
    kpis.push(['Alertas ativos', String(res.active.length)]);
    api.printReport('Painel Cat-M Telekom: relatório', kpis, '#metricChart svg', { period: 'gerado em ' + new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) + ' BRT', version: 'Connect NTN · placa Cat-M Telekom' });
  }

  /* v2: histórico recalculado com as regras novas (limpa entradas ruidosas antigas uma vez). */
  try { if (localStorage.getItem(HISTORY_KEY + '.schema') !== '2') { localStorage.removeItem(HISTORY_KEY); localStorage.setItem(HISTORY_KEY + '.schema', '2'); } } catch (e) {}
  var apiPromise = loadApiCoreIsolated().then(function (api) { window.RootApiCore = api; return api; }).catch(function () { return null; });
  function render() {
    apiPromise.then(function (api) {
      window.AlertsPanel.configure({ engine: engine, labels: { distM: 'Distância entre posições', speedKmh: 'Velocidade', stoppedMin: 'Tempo parado', posicoes: 'Posições', sensores: 'Sensores' },
        storageKey: HISTORY_KEY, csvPrefix: 'fing-alertas', defaultMetric: 'speedKmh', unitWord: 'posição', emptyText: 'Ainda não há posições da trilha carregadas (abra a trilha ou aguarde o pareamento com o nRF Cloud).',
        rulesHelp: 'Regras: A distância ou velocidade mais de 20% acima da média; B mais de 30% abaixo estando em movimento (possível interferência ou chip sem cobertura); C 5 leituras seguidas em movimento com desvio acima de 20%; parado não gera B nem C; D entre 22h e 6h, deslocamento acima de 1,5x a média noturna; E sem posição nova há mais de 2x o intervalo esperado; F sensor novo ou que parou de enviar.' });
      if (api && !window.ApiCore) window.ApiCore = { toCSV: api.toCSV }; // o "Exportar agora" do histórico usa ApiCore.toCSV
      window.AlertsPanel.mount('intelCard');
      var head = document.querySelector('#intelCard .card-h');
      if (head && !document.getElementById('rootCsv') && api) {
        head.insertAdjacentHTML('beforeend', '<span><button id="rootCsv" class="btn btn-ghost btn-sm" title="Trilha e mensagens em CSV, sem coordenada exata nem ICCID/IMSI">⇩ Exportar CSV</button> <button id="rootPdf" class="btn btn-ghost btn-sm">⎙ Relatório PDF</button></span>');
        document.getElementById('rootCsv').onclick = function () { exportDataCsv(api); };
        document.getElementById('rootPdf').onclick = function () { location.href = 'app/relatorio/?fonte=thingy91x&dias=30'; };
      }
      window.AlertsPanel.render(trailRecords());
    });
  }
  window.RootAlerts = { render: render, sensorChanges: sensorChanges, engine: engine };
  setTimeout(render, 4000); setInterval(render, 30000);
})();
