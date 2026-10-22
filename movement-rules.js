/* movement-rules.js: regras de alerta de deslocamento (Rastreador ntn/ e painel da raiz).
   Script clássico: window.MovementRules(config) e module.exports. Reutiliza window.AlertRules
   (utilities/alert-rules.js) para média móvel, histórico e lido/não lido.
   Métricas derivadas só de posições reais: distância entre posições (m), velocidade (km/h)
   e tempo parado (min). Alertas e CSV nunca levam coordenadas, só distâncias e velocidades. */
(function (root) {
  'use strict';
  function create(Base, options) {
    options = options || {};
    var DEVICE_WORD = options.deviceWord || 'GPS';
    var METRICS = {
      distM: { label: 'Distância entre posições', unit: 'm', higherIsBetter: false },
      speedKmh: { label: 'Velocidade', unit: 'km/h', higherIsBetter: false },
      stoppedMin: { label: 'Tempo parado', unit: 'min', higherIsBetter: true }
    };
    var RULES = {
      A: { color: 'red', label: 'Deslocamento acima da média' },
      B: { color: 'yellow', label: 'Queda de deslocamento em movimento' },
      C: { color: 'orange', label: 'Tendência fora do padrão' },
      D: { color: 'red', label: 'Movimento noturno atípico' },
      E: { color: 'grey', label: 'Sem posições' }
    };
    var ABOVE_PCT = 20, BELOW_PCT = 30, CONSECUTIVE = 5, NIGHT_FACTOR = 1.5, STALE_FACTOR = 2;
    var STOP_RADIUS_M = 50; // abaixo de 50 m entre posições o aparelho é considerado parado
    var MIN = 60000, timeOf = Base.timeOf, r1 = Base.roundOne, assign = Base.assign;
    var getTime = options.timeOf || timeOf;

    function haversineM(a, b) {
      var R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
      var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.asin(Math.sqrt(h));
    }
    /* Posições reais em ordem, com distância, velocidade e tempo parado desde a posição anterior.
       Se a API já trouxer r.move (calculado no backend com coordenada exata), ele tem prioridade. */
    function positions(records) {
      var pts = (records || []).filter(function (r) { return r && typeof r.lat === 'number' && typeof r.lon === 'number' && !isNaN(getTime(r)) && (options.accept ? options.accept(r) : true); })
        .sort(function (a, b) { return getTime(a) - getTime(b); });
      var out = [], prev = null, stoppedSince = null;
      pts.forEach(function (r) {
        var o = { seq: r.seq, ts: new Date(getTime(r)).toISOString(), lat: r.lat, lon: r.lon, rolling: {} };
        if (r.move) { o.distM = r.move.distM; o.speedKmh = r.move.speedKmh; o.stoppedMin = r.move.stoppedMin; if (r.move.rolling) o.backendRolling = r.move.rolling; }
        else if (prev) {
          var dt = (getTime(r) - getTime(prev)) / 1000;
          o.distM = Math.round(haversineM(prev, r));
          o.speedKmh = dt > 0 ? r1((o.distM / dt) * 3.6) : null;
          if (o.distM < STOP_RADIUS_M) { if (stoppedSince == null) stoppedSince = getTime(prev); } else stoppedSince = null;
          o.stoppedMin = stoppedSince == null ? 0 : Math.round((getTime(r) - stoppedSince) / MIN);
        }
        prev = r; if (o.distM != null || out.length === 0) out.push(o);
      });
      return out.filter(function (o) { return o.distM != null; });
    }
    function annotate(records) {
      var prevVals = { distM: [], speedKmh: [], stoppedMin: [] };
      return positions(records).map(function (o) {
        Object.keys(METRICS).forEach(function (m) {
          o.rolling[m] = (o.backendRolling && o.backendRolling[m]) || Base.rollingStat(prevVals[m], o[m]);
          if (typeof o[m] === 'number') prevVals[m].push(o[m]);
        });
        return o;
      });
    }
    function fmtDur(min) { if (min < 60) return min + ' min'; var d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60); return d ? d + (d === 1 ? ' dia' : ' dias') + (h ? ' e ' + h + ' h' : '') : h + ' h' + (min % 60 ? ' ' + (min % 60) + ' min' : ''); }
    function nTxt(n) { return n >= 24 ? 'das últimas 24 posições' : 'de ' + n + (n === 1 ? ' posição' : ' posições'); }

    /* A, B, C, D sobre distância e velocidade. */
    function evaluateReadings(list) {
      var fired = [], streak = { distM: 0, speedKmh: 0 }, nightDist = [], prevRule = { distM: {}, speedKmh: {} };
      var prevO = null, prevD = { on: false, night: null };
      list.forEach(function (o) {
        var t = Date.parse(o.ts);
        /* v3: parado (deslocamento abaixo de 50 m) é estado normal: B e C não disparam. B só quando estava em
           movimento e continua se movendo bem abaixo da média (queda real), nunca numa parada. */
        var moving = typeof o.distM === 'number' && o.distM >= STOP_RADIUS_M, wasMoving = !!(prevO && typeof prevO.distM === 'number' && prevO.distM >= STOP_RADIUS_M);
        prevO = o;
        ['distM', 'speedKmh'].forEach(function (m) {
          var s = o.rolling[m], v = o[m], label = METRICS[m].label.toLowerCase(), base = { metric: m, at: t, seq: o.seq, value: v };
          if (typeof v !== 'number' || !s || !(s.mean > 0) || s.devPct == null) { streak[m] = 0; prevRule[m] = {}; return; }
          // A e B: ativos enquanto durar; no histórico só o início da sequência (ver onlyStreakStarts)
          var isA = s.devPct > ABOVE_PCT && moving, isB = s.devPct < -BELOW_PCT && moving && wasMoving;
          base.streakStartA = !prevRule[m].A; base.streakStartB = !prevRule[m].B; prevRule[m] = { A: isA, B: isB };
          // A: distância ou velocidade mais de 20% acima da média móvel -> vermelho
          if (isA) fired.push(assign(base, { rule: 'A', threshold: r1(s.mean * 1.2), message: METRICS[m].label + ' ' + Math.round(s.devPct) + '% acima da média ' + nTxt(s.n) }));
          // B: mais de 30% abaixo da média -> amarelo
          if (isB) fired.push(assign(base, { rule: 'B', threshold: r1(s.mean * 0.7), message: (options.dropMessage || 'Possível falha de GPS ou equipamento desligado') + ' (' + label + ' ' + Math.round(-s.devPct) + '% abaixo da média ' + nTxt(s.n) + ')' }));
          // C: 5 leituras seguidas fora do padrão (desvio além de ±20%) -> tendência
          streak[m] = moving && Math.abs(s.devPct) > ABOVE_PCT ? streak[m] + 1 : 0;
          if (streak[m] === CONSECUTIVE) fired.push(assign(base, { rule: 'C', threshold: ABOVE_PCT, message: 'Tendência: ' + CONSECUTIVE + ' leituras seguidas de ' + label + ' fora do padrão (mais de 20% de desvio)' }));
        });
        // D: entre 22h e 6h BRT, deslocamento acima de 1,5x a média noturna
        if (Base.isNightBRT(t) && typeof o.distM === 'number') {
          var n = Base.rollingStat(nightDist, o.distM);
          var isD = !!(n && n.mean > 0 && o.distM > n.mean * NIGHT_FACTOR), nightId = new Date(t - 9 * 3600000).toISOString().slice(0, 10); // noite BRT (22h a 6h) como um dia só
          var startD = isD && !(prevD.on && prevD.night === nightId); prevD = { on: isD, night: nightId };
          if (isD) fired.push({ streakStartD: startD, rule: 'D', metric: 'distM', at: t, seq: o.seq, value: o.distM, threshold: r1(n.mean * NIGHT_FACTOR),
            message: 'Movimento noturno atípico: ' + o.distM + ' m, acima de 1,5x a média noturna ' + nTxt(n.n) + ' (' + n.mean + ' m)' });
          nightDist.push(o.distM);
        }
      });
      return fired;
    }
    function compute(records, now) {
      now = now == null ? Date.now() : now;
      var list = annotate(records).filter(function (o) { return Date.parse(o.ts) <= now; });
      var all = evaluateReadings(list), last = list[list.length - 1], fired = Base.onlyStreakStarts(all).filter(function (a) { return a.rule !== 'D' || a.streakStartD !== false; });
      var active = all.filter(function (a) { return last && a.at === Date.parse(last.ts); });
      // E: sem posição nova há mais de 2x o intervalo esperado (o indicador de saúde segue marcando "parado" em 3x)
      var iv = Base.expectedIntervalMs(list.map(function (o) { return { ts: o.ts }; }));
      if (last && iv && now - Date.parse(last.ts) > STALE_FACTOR * iv) {
        var minutes = Math.round((now - Date.parse(last.ts)) / MIN);
        var e = { rule: 'E', metric: 'posicoes', at: Date.parse(last.ts), seq: last.seq, value: minutes, threshold: Math.round((STALE_FACTOR * iv) / MIN),
          message: 'Sem posições há ' + fmtDur(minutes) + ', verificar conexão' };
        active.push(e); fired.push(e);
      }
      /* Para o painel (setas): a última posição expõe distM/speedKmh/stoppedMin como "métricas". Sem lat/lon nos alertas. */
      if (last) { last = assign(last, {}); delete last.lat; delete last.lon; }
      return { readings: list.map(function (o) { var c = assign(o, {}); delete c.lat; delete c.lon; return c; }), fired: fired, active: active, last: last || null };
    }
    var engine = {}; for (var k in Base) engine[k] = Base[k];
    engine.METRICS = METRICS; engine.RULES = RULES; engine.compute = compute; engine.annotate = annotate; engine.haversineM = haversineM; engine.DEVICE_WORD = DEVICE_WORD; engine.fmtDur = fmtDur;
    return engine;
  }
  root.MovementRules = { create: create };
  if (typeof module !== 'undefined' && module.exports) module.exports = { create: create };
})(typeof window !== 'undefined' ? window : globalThis);
