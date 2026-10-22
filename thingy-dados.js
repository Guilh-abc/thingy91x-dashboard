/* thingy-dados.js: medidor de dados do Thingy:91X (chip Telekom, só Cat-M) a partir das mensagens reais do nRF Cloud.
   Bytes estimados pelo tamanho do payload de cada mensagem; não é a fatura da operadora. Sem custo. ICCID sempre mascarado. */
(function (root) {
  var TZ = 'America/Sao_Paulo', D = 86400000;
  function dia(t) { return new Date(t).toLocaleDateString('sv-SE', { timeZone: TZ }); }
  function tm(m) { var g = m.message || {}; return g.ts ? +g.ts : Date.parse(m.receivedAt); }
  function tam(m) { var s = JSON.stringify(m.message || {}); return typeof TextEncoder !== 'undefined' ? new TextEncoder().encode(s).length : s.length; }
  function mascara(v) { v = String(v || ''); return v.length > 4 ? '****' + v.slice(-4) : null; }
  /* Puro: totais de hoje, 7 e 30 dias, por dia, média diária, projeção do mês e mensagens por tipo. */
  function medidor(msgs, agora) {
    agora = agora || Date.now(); var hoje = dia(agora), porDia = {}, tipos = {}, t7 = 0, t30 = 0, th = 0, mes = 0, m0 = hoje.slice(0, 7);
    (msgs || []).forEach(function (m) {
      var t = tm(m); if (isNaN(t) || t > agora + 60000) return; var b = tam(m), d = dia(t), a = (m.message || {}).appId || 'outro';
      if (agora - t <= 30 * D) { t30 += b; porDia[d] = (porDia[d] || 0) + b; tipos[a] = tipos[a] || { n: 0, b: 0 }; tipos[a].n++; tipos[a].b += b; }
      if (agora - t <= 7 * D) t7 += b; if (d === hoje) th += b; if (d.slice(0, 7) === m0) mes += b;
    });
    var dias = Object.keys(porDia).sort(), media = dias.length ? t30 / dias.length : null;
    var hj = new Date(new Date(agora).toLocaleString('en-US', { timeZone: TZ })), diasMes = new Date(hj.getFullYear(), hj.getMonth() + 1, 0).getDate();
    var proj = media == null ? null : mes + media * (diasMes - hj.getDate());
    return { hoje: th, d7: t7, d30: t30, mes: mes, media: media, proj: proj, porDia: dias.map(function (k) { return { d: k, b: porDia[k] }; }),
      tipos: Object.keys(tipos).map(function (k) { return { tipo: k, n: tipos[k].n, b: tipos[k].b }; }).sort(function (a, b) { return b.n - a.n; }) };
  }
  function cab() {
    var ls = function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } };
    var key = ls('nrf_api_key'), mail = ls('nrf_user_email'); if (!key) return null;
    var hd = { Authorization: mail ? 'Basic ' + btoa(unescape(encodeURIComponent(mail + ':' + key))) : 'Bearer ' + key, 'X-User-Api-Key': key,
      'X-Memfault-Org': ls('nrf_org_slug') || 'telekom', 'X-Memfault-Project': ls('nrf_project_slug') || 'nrf-project' };
    if (mail) hd['X-User-Email'] = mail; if (ls('nrf_team_api_key')) hd['X-Nrf-Team-Key'] = ls('nrf_team_api_key');
    return { hd: hd, dev: ls('nrf_device_id') || '50423451-3737-4337-80fc-110bddf418ff' };
  }
  var BASE = typeof location !== 'undefined' && !/(netlify\.app|pages\.dev)$/i.test(location.hostname) ? 'https://thingy91x-x-dashboard.netlify.app' : '';
  /* Mensagens dos últimos `dias` (paginado, 100 por página). Rejeita com 'sem chave' se não houver chave neste navegador. */
  function mensagens(dias, agora) {
    var c = cab(); if (!c) return Promise.reject(new Error('sem chave'));
    agora = agora || Date.now(); var out = [];
    function pag(tok) {
      var q = new URLSearchParams({ deviceId: c.dev, pageLimit: 100, start: new Date(agora - dias * D).toISOString(), end: new Date(agora).toISOString() });
      if (tok) q.set('pageNextToken', tok);
      return fetch(BASE + '/.netlify/functions/nrfcloud/messages?' + q, { headers: c.hd, cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (j) { var it = j.items || []; out = out.concat(it); return j.pageNextToken && it.length && out.length < 20000 ? pag(j.pageNextToken) : out; });
    }
    return pag(null);
  }
  function iccid() {
    var c = cab(); if (!c) return Promise.resolve(null);
    return fetch(BASE + '/.netlify/functions/nrfcloud/devices/' + encodeURIComponent(c.dev), { headers: c.hd, cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { var m = JSON.stringify(d || {}).match(/"iccid"\s*:\s*"(\d{10,22})/i); return m ? mascara(m[1]) : null; }).catch(function () { return null; });
  }
  root.ThingyDados = { medidor: medidor, mensagens: mensagens, iccid: iccid, mascara: mascara, tam: tam };
})(typeof window !== 'undefined' ? window : globalThis);
