/* Thingy:91X Dashboard v32 — presence-core.js
 * ÚNICA fonte de verdade de presença (Online / Em espera / Offline / Sem dados).
 * Carregado como <script> no navegador (window.PresenceCore) e importado (efeito colateral)
 * pelas functions Netlify e pelo proxy local (globalThis.PresenceCore). Sem dependências.
 *
 * Regra: evidência = o timestamp MAIS RECENTE entre
 *   - last_seen do Memfault            - shadow $meta (nRF Cloud)
 *   - qualquer mensagem da NUVEM (ListMessages: GNSS, BATTERY, TEMP, DEVICE, ...)
 *   - qualquer ponto de localização da NUVEM (location/history: GNSS, GROUND_FIX/WIFI/MCELL/SCELL...)
 * NÃO conta: hora do poll, USB serial do Mac, cache/localStorage, trilha local.
 */
(function (root) {
  'use strict';
  var PRESENCE = {
    MIN_ONLINE_MS: 15 * 60 * 1000,
    INTERVAL_FACTOR: 2.5,
    SLEEPING_MAX_MS: 60 * 60 * 1000,
    FUTURE_SKEW_MS: 5 * 60 * 1000, // relógio adiantado até 5 min vira "agora"; além disso é ignorado
  };

  function toTsMs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' && isFinite(v)) return v < 1e12 ? v * 1000 : v;
    var t = new Date(v).getTime();
    return isFinite(t) ? t : null;
  }

  function onlineWindowMs(intervalSec, cfg) {
    var c = cfg || PRESENCE;
    var fromIv = intervalSec != null ? c.INTERVAL_FACTOR * intervalSec * 1000 : 0;
    return Math.max(c.MIN_ONLINE_MS, fromIv);
  }

  var POSITION_APPS = /^(GNSS|GPS|GROUND_FIX|LOCATION|LOC|PVT|CELL_POS)$/i;
  function msgAppId(m) {
    return String((m && ((m.message && m.message.appId) || m.appId || m.app_id || m.app)) || '').toUpperCase();
  }
  function msgRecvMs(m) {
    if (!m) return null;
    var t = toTsMs(m.receivedAt || m.received_at || m.insertedAt || m.inserted_at);
    if (t != null) return t;
    return toTsMs(m.timestamp || m.ts || (m.message && m.message.ts));
  }
  function locRecvMs(l) {
    if (!l) return null;
    return toTsMs(l.recvAt || l.insertedAt || l.inserted_at || l.receivedAt || l.at || l.timestamp || l.ts);
  }

  /** Coleta evidência. Retorna { best:{ms,src,kind}|null, sources:[{ms,src,kind}] (mais recente por fonte) }. */
  function collectEvidence(o) {
    o = o || {};
    var now = o.now != null ? o.now : Date.now();
    var byKey = {};
    function push(v, src, kind) {
      var t = toTsMs(v);
      if (t == null) return;
      if (t > now + PRESENCE.FUTURE_SKEW_MS) return; // futuro demais: relógio errado, ignora
      if (t > now) t = now;
      var cur = byKey[src];
      if (!cur || t > cur.ms) byKey[src] = { ms: t, src: src, kind: kind };
    }
    push(o.lastSeen, 'last_seen (Memfault)', 'last_seen');
    push(o.shadowMeta, 'shadow $meta (nRF Cloud)', 'shadow');
    var msgs = Array.isArray(o.messages) ? o.messages : (Array.isArray(o.msgs) ? o.msgs : []);
    for (var i = 0; i < msgs.length; i++) {
      var app = msgAppId(msgs[i]) || 'MSG';
      var isPos = POSITION_APPS.test(app);
      push(msgRecvMs(msgs[i]), isPos ? 'mensagem de posição (' + app + ') na nuvem' : 'mensagem ' + app + ' na nuvem', isPos ? 'position' : 'message');
    }
    var locs = Array.isArray(o.locations) ? o.locations : (Array.isArray(o.locs) ? o.locs : []);
    for (var j = 0; j < locs.length; j++) {
      var st = locs[j] && (locs[j].serviceType || locs[j].service || locs[j].src);
      push(locRecvMs(locs[j]), 'histórico de localização na nuvem' + (st ? ' (' + String(st).toUpperCase() + ')' : ''), 'position');
    }
    var extra = Array.isArray(o.extra) ? o.extra : [];
    for (var k = 0; k < extra.length; k++) push(extra[k].at, extra[k].src || 'nuvem', extra[k].kind || 'message');
    var sources = Object.keys(byKey).map(function (s) { return byKey[s]; }).sort(function (a, b) { return b.ms - a.ms; });
    return { best: sources.length ? sources[0] : null, sources: sources };
  }

  /** Resolve presença. o = { ...evidência (collectEvidence), cloudConnected, intervalSec, now } */
  function resolve(o) {
    o = o || {};
    var now = o.now != null ? o.now : Date.now();
    var ev = collectEvidence(Object.assign({}, o, { now: now }));
    var best = ev.best;
    var activityMs = best ? best.ms : null;
    var age = activityMs != null ? now - activityMs : null;
    var intervalSec = o.intervalSec != null ? o.intervalSec : null;
    var win = onlineWindowMs(intervalSec);
    var sleepMax = Math.max(PRESENCE.SLEEPING_MAX_MS, win);
    var cloudBonus = o.cloudConnected === true || o.connected === true;
    var staleBonus = cloudBonus && age != null && age > sleepMax; // connected=true velho não vence o silêncio
    var base = {
      activitySource: best ? best.src : null,
      activityKind: best ? best.kind : null,
      evidence: ev.sources.slice(0, 6),
      ageMs: age,
      activityAt: activityMs != null ? new Date(activityMs).toISOString() : null,
      onlineWindowMs: win,
      offlineThresholdMs: sleepMax,
      intervalSec: intervalSec,
      cloudConnected: (cloudBonus && !staleBonus) ? true : ((o.cloudConnected === false || o.connected === false) ? false : null),
    };
    function mk(kind, label, shortLabel, flags, css, strip, connectedBool) {
      return Object.assign({}, base, { kind: kind, label: label, shortLabel: shortLabel }, flags,
        { cssClass: css, stripKind: strip, connectedBool: connectedBool });
    }
    var ON = mk.bind(null, 'online', 'Online (transmitindo)', 'Online', { isOnline: true, isSleeping: false, isOffline: false, hasData: true }, 'estado-online', 'ok', true);
    if (cloudBonus && !staleBonus) return ON();
    if (activityMs == null) {
      return mk('nodata', 'Sem dados', 'Sem dados', { isOnline: false, isSleeping: false, isOffline: false, hasData: false }, 'estado-sem-dados', 'muted', null);
    }
    if (age <= win) return ON();
    if (age <= sleepMax) {
      return mk('sleeping', 'Em espera', 'Em espera', { isOnline: false, isSleeping: true, isOffline: false, hasData: true }, 'estado-espera', 'warn', null);
    }
    return mk('offline', 'Offline', 'Offline', { isOnline: false, isSleeping: false, isOffline: true, hasData: true }, 'estado-offline', 'err', false);
  }

  function formatAge(ms) {
    if (ms == null || !isFinite(ms)) return '';
    if (ms < 0) ms = 0;
    if (ms < 60000) return 'há ' + Math.max(1, Math.round(ms / 1000)) + 's';
    if (ms < 3600000) return 'há ' + Math.round(ms / 60000) + ' min';
    if (ms < 86400000) return 'há ' + Math.round(ms / 3600000) + 'h';
    return 'há ' + Math.round(ms / 86400000) + 'd';
  }
  function formatSendAge(p) { // "último envio há 3 min"
    if (!p || p.ageMs == null) return '';
    return 'último envio ' + formatAge(p.ageMs);
  }
  /** Texto do tooltip: de onde veio a atividade + demais fontes. */
  function describe(p, fmtTime) {
    if (!p || !p.activitySource) return 'Sem evidência de atividade na nuvem (last_seen, mensagens, localização, shadow).';
    var f = typeof fmtTime === 'function' ? fmtTime : function (ms) { return new Date(ms).toISOString(); };
    var lines = ['Atividade mais recente: ' + p.activitySource + ' — ' + f(Date.parse(p.activityAt)) + ' (' + formatAge(p.ageMs) + ')'];
    var others = (p.evidence || []).slice(1, 4).map(function (e) { return e.src + ' ' + f(e.ms); });
    if (others.length) lines.push('Outras fontes: ' + others.join(' · '));
    lines.push('Não contam: hora do poll, USB serial do Mac, cache local.');
    return lines.join('\n');
  }

  root.PresenceCore = {
    VERSION: 32,
    PRESENCE: PRESENCE,
    toTsMs: toTsMs,
    onlineWindowMs: onlineWindowMs,
    msgAppId: msgAppId,
    msgRecvMs: msgRecvMs,
    locRecvMs: locRecvMs,
    collectEvidence: collectEvidence,
    resolve: resolve,
    formatAge: formatAge,
    formatSendAge: formatSendAge,
    describe: describe,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
