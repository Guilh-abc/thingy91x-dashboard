/* Connect Utilities v2 (operador) — só dados reais do medidor (ntn-lab ?meter=1). Sem simulação. */
(function () {
  const onNetlify = /netlify\.app$/.test(location.hostname);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dmy = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const hm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const agoS = (ms) => { const s = Math.round(ms / 1000); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; };
  const ago = (t) => agoS(Date.now() - Date.parse(t));
  const m3 = (L) => (L / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const nf = (n) => Number(n).toLocaleString('pt-BR');
  const T = (r) => Date.parse(r.ts), RX = (r) => Date.parse(r.rx || r.ts);
  const netOf = (r) => r.txNet || (r.transport === 'udp' ? 'ntn' : 'catm');
  const isSat = (r) => netOf(r) === 'ntn' && (!r.plmn || r.plmn === '90198');
  const OPS = { '72410': 'Vivo', '72405': 'Claro', '72402': 'TIM', '72403': 'TIM', '72404': 'TIM', '72406': 'Vivo', '72411': 'Vivo', '72423': 'Vivo', '90198': 'Skylo' };
  const tag = (r) => isSat(r) ? '<span class="tag ntn">Satélite · Skylo (90198)</span>' : '<span class="tag catm">Cat-M</span>';
  const AL = { leak: ['💧', 'Vazamento', 'Fluxo contínuo ou alarme de vazamento.'], tamper: ['🔓', 'Violação', 'Tentativa de violação do medidor.'], anom: ['📈', 'Consumo anômalo', 'Consumo por hora acima do limite.'], lowbat: ['🔋', 'Bateria baixa', 'Tensão abaixo do limite.'] };
  const empty = (t) => `<div class="empty-st">${t}</div>`;
  let recs = [], agg = 'i', map, mk, fT = 'all', fN = 'all';
  $('tariff').value = localStorage.getItem('cu.tariff') || '';
  $('tariff').addEventListener('input', () => { localStorage.setItem('cu.tariff', $('tariff').value); render(); });
  const segBind = (id, fn) => document.querySelectorAll('#' + id + ' button').forEach((b) => b.addEventListener('click', () => { fn(b); document.querySelectorAll('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
  segBind('aggSeg', (b) => (agg = b.dataset.a)); segBind('fType', (b) => (fT = b.dataset.f)); segBind('fNet', (b) => (fN = b.dataset.n));
  $('fTxt').addEventListener('input', () => renderTable());

  /* m1.4b (commit af5638d): satélite só com PLMN Skylo 90198. Corrige registros de 14/10 11:13:58-11:18:59 (PT) rotulados ntn em célula terrestre (TAC C54F, Vivo 72410). */
  const BAD0 = Date.parse('2026-10-14T14:13:58Z'), BAD1 = Date.parse('2026-10-14T14:18:59Z');
  const r3 = (v) => (v == null ? v : Math.round(v * 1000) / 1000);
  function sanitizeNet(list) {
    return list.map((r0) => {
      const r = { ...r0 }, t = RX(r);
      r.lat = r3(r.lat); r.lon = r3(r.lon); // ~100 m
      if (r.info) r.info = String(r.info).replace(/-?\d+\.\d{4,}/g, (m) => (+m).toFixed(3));
      const isN = r.net === 'ntn' || r.txNet === 'ntn' || r.transport === 'udp' || ['sat_reg', 'sat_search', 'sat_lost'].includes(r.event) || r.type === 'satsum' || r.type === 'satdet';
      const terr = (r.plmn && r.plmn !== '90198') || /^c54f$/i.test(r.satTac || r.tac || '') || (t >= BAD0 && t <= BAD1);
      if (isN && terr) { r.fakeNtn = true; if (r.net === 'ntn') r.net = 'catm'; if (r.txNet === 'ntn' || (r.transport === 'udp' && !r.txNet)) r.txNet = 'catm'; delete r.satOp;
        if (r.event === 'sat_reg') { r.event = 'reg'; r.info = 'Cat-M (corrigido)'; }
        if (r.event === 'reg' && /NTN/.test(r.info || '')) r.info = 'Cat-M (corrigido)'; }
      return r;
    }).filter((r) => !(r.fakeNtn && (r.type === 'satsum' || r.type === 'satdet')));
  }
  const simParse = (s) => { const i = s.info || ''; return { ic: (/ic\*?(\d+)/.exec(i) || [])[1], im: (/im(\d+)\*?(\d+)/.exec(i) || []).slice(1).join('…'), pin: (/pin (\S+)/.exec(i) || [])[1] }; };
  function median(a) { if (!a.length) return null; a = [...a].sort((x, y) => x - y); return a[a.length >> 1]; }
  function sigQ(rsrp) { return rsrp == null ? null : rsrp >= -95 ? ['Bom', '#2fd27a', 'ok'] : rsrp >= -110 ? ['Regular', '#ffb020', 'warn'] : ['Fraco', '#ff5470', 'bad']; }
  function gauge(rsrp) {
    const v = rsrp == null ? null : Math.max(-140, Math.min(-44, rsrp)), f = v == null ? 0 : (v + 140) / 96, a = Math.PI * (1 - f);
    const arc = (a0, a1, c) => { const p = (a) => [42 + 34 * Math.cos(a), 42 - 34 * Math.sin(a)]; const [x0, y0] = p(a0), [x1, y1] = p(a1); return `<path d="M${x0} ${y0}A34 34 0 0 1 ${x1} ${y1}" stroke="${c}" stroke-width="8" fill="none"/>`; };
    const fa = (d) => Math.PI * (1 - (d + 140) / 96);
    return `<svg class="gauge" viewBox="0 0 84 48">${arc(Math.PI, fa(-110), '#ff547066')}${arc(fa(-110), fa(-95), '#ffb02066')}${arc(fa(-95), 0, '#2fd27a66')}${v == null ? '' : `<line x1="42" y1="42" x2="${42 + 30 * Math.cos(a)}" y2="${42 - 30 * Math.sin(a)}" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/><circle cx="42" cy="42" r="4" fill="#fff"/>`}</svg>`;
  }
  /* sessões de satélite: sat_start (m1.4+) ou sw=1 (anteriores) */
  function sessions(rs) {
    const out = []; let cur = null;
    const close = (t, why) => { if (cur) { cur.end = t; cur.why = why; out.push(cur); cur = null; } };
    for (const r of rs) {
      const e = r.type === 'event' ? r.event : null, t = T(r);
      if (e === 'boot') close(t, 'reinício');
      if (e === 'sat_start' || (e === 'sw' && r.value === 1 && !cur)) { if (cur && e === 'sat_start') close(t, 'novo teste'); if (!cur) cur = { start: t, ev: [], src: e }; }
      if (!cur) continue;
      cur.ev.push(r); cur.last = t;
      if (e === 'back_catm' || (e === 'sw' && r.value === 0)) close(t, e === 'back_catm' ? 'voltou ao Cat-M' : 'voltou ao Cat-M (' + (r.info || '') + ')');
    }
    if (cur) { cur.open = true; out.push(cur); }
    return out.map((s) => { const f = (e) => s.ev.find((r) => r.event === e); s.gnss = f('gnss_ok') || f('gnss_fail') || s.ev.find((r) => r.event === 'fix'); s.search = f('sat_search'); s.reg = s.ev.find((r) => r.event === 'sat_reg' && !r.fakeNtn); s.lost = f('sat_lost');
      s.tx = s.ev.filter((r) => r.type === 'telemetry' && isSat(r)).length; s.fail = s.ev.find((r) => r.event === 'fail'); return s; });
  }
  function kpi(cls, label, big, sub, extra) { return `<div class="kpi ${cls}"><small>${label}</small><div class="row"><div style="min-width:0;flex:1"><div class="big">${big}</div><div class="sub">${sub}</div></div>${extra || ''}</div></div>`; }
  function sumDelta(rd, t0) { let s = 0, n = 0; for (let i = 1; i < rd.length; i++) if (T(rd[i]) >= t0) { const d = rd[i].totalL - rd[i - 1].totalL; if (d >= 0) { s += d; n++; } } return { s, n }; }

  function render() {
    if (window.HealthBadge) { HealthBadge.init('healthBadge', { hardLimitSec: 86400 }); HealthBadge.update(recs); } // RF-02
    const rs = [...recs].sort((a, b) => T(a) - T(b));
    const rd = rs.filter((r) => r.type === 'telemetry' && r.totalL != null);
    const tel = rs.filter((r) => r.type === 'telemetry');
    const al = rs.filter((r) => r.type === 'alarm');
    const last = rd[rd.length - 1], lastAny = [...rs].sort((a, b) => RX(a) - RX(b)).pop(), lt = tel[tel.length - 1];
    $('waitBanner').hidden = rs.length > 0;
    if (rs.length && !rd.length) { $('waitBanner').hidden = false; $('waitBanner').textContent = 'A placa já se comunicou, mas ainda não enviou nenhuma leitura de consumo.'; }
    const ivs = []; for (let i = 1; i < tel.length; i++) { const d = (T(tel[i]) - T(tel[i - 1])) / 60000; if (d > 0.5 && d < 30) ivs.push(d); }
    const ivMin = median(ivs);
    const ses = sessions(rs), sCur = ses.length && ses[ses.length - 1].open ? ses[ses.length - 1] : null;
    /* v7: evidência real tem prioridade sobre a flag de teste. Sessão aberta (sat_start/stest) mas última telemetria é Cat-M depois do início e de qualquer evidência de satélite => está no Cat-M. */
    const lastSatEv = sCur ? [...sCur.ev].reverse().find((r) => ['sat_search', 'sat_reg', 'sat_lost'].includes(r.event) || (r.type === 'telemetry' && isSat(r))) : null;
    const catmNow = !!(sCur && lt && !isSat(lt) && T(lt) > Math.max(sCur.start, lastSatEv ? T(lastSatEv) : 0));
    const sNet = catmNow ? null : sCur;
    const st1 = [...rs].reverse().find((r) => r.type === 'event' && r.event === 'stest');
    const tOn = !!sCur || (st1 && st1.value === 1 && !ses.some((s) => s.start >= T(st1) && !s.open));
    $('testPill').hidden = !tOn; if (tOn) $('testPill').textContent = 'Modo teste satélite ativo';

    /* KPIs */
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const today = sumDelta(rd, dayStart.getTime()), hour = sumDelta(rd, Date.now() - 3600000);
    const K = [];
    K.push(kpi('', 'Total acumulado', last ? nf(last.totalL) + '<u>L</u>' : '—', last ? m3(last.totalL) + ' m³ · leitura ' + hm(T(last)) : 'aguardando primeira leitura'));
    K.push(kpi('', 'Consumo hoje', rd.length ? nf(today.s) + '<u>L</u>' : '—', rd.length ? `última hora: <b>${nf(hour.s)} L</b>${hour.n ? '' : ' (sem leituras na última hora)'}` : 'aguardando primeira leitura'));
    let netBig = '—', netSub = 'aguardando primeira leitura', netCls = 'off';
    if (sNet) { netCls = 'ntn'; netBig = sCur.reg ? 'Satélite Skylo' : 'Buscando Skylo'; netSub = (sCur.reg ? 'registrado na rede 90198' : `teste desde ${hm(sCur.start)} · sem registro em 90198`) + (lastAny && Date.now() - RX(lastAny) > 1800000 ? ` · último estado conhecido, sem notícias há ${ago(lastAny.rx || lastAny.ts)}` : ''); }
    else if (lt) { const sat = isSat(lt); netCls = sat ? 'ntn' : 'catm'; netBig = sat ? 'Satélite Skylo' : 'Cat-M'; netSub = sat ? 'PLMN 90198' : `${OPS[lt.plmn] || 'operadora'} (${esc(lt.plmn || '—')}) · LTE-M banda ${esc(lt.band || '—')}${catmNow ? ' · modo teste NTN ligado, sem registro no satélite' : ''}`; }
    /* v8: offline quando o último dado passa de 2,5x o intervalo medido (mínimo 5 min no Cat-M; 15 min em satélite, como no ntn/) */
    const offLimMs = (sNet ? 30 : Math.max(5, (ivMin || 2) * 2.5)) * 60000, offNow = !!lastAny && Date.now() - RX(lastAny) > offLimMs;
    const lastNetTxt = netBig;
    if (offNow) { netCls = 'bad'; netSub = 'sem comunicação · última rede conhecida: ' + netBig + ' · ' + netSub; netBig = 'Sem comunicação'; }
    K.push(kpi(netCls, 'Rede atual', netBig, netSub));
    const q = sigQ(lt?.rsrp);
    K.push(kpi(q ? q[2] : 'off', 'Qualidade do sinal', lt?.rsrp != null ? `${lt.rsrp}<u>dBm</u>` : '—', lt?.rsrp != null ? `<b style="color:${q[1]}">${q[0]}</b> · SNR ${lt.snr ?? '—'} dB${sNet ? ' · na última leitura Cat-M' : ''}` : 'sem medição ainda', gauge(lt?.rsrp)));
    const onlineMs = (sNet ? 30 : Math.max(5, (ivMin || 2) * 2.5)) * 60000, age = lastAny ? Date.now() - RX(lastAny) : null, on = age != null && age < onlineMs;
    K.push(kpi(lastAny ? (on ? 'ok' : sNet && age < 1800000 ? 'ntn' : 'bad') : 'off', 'Último envio', lastAny ? 'há ' + agoS(age) : '—', lastAny ? `<span style="color:${on ? '#2fd27a' : sNet && age < 1800000 ? '#c79bff' : '#ff5470'}"><span class="dot"></span>${on ? 'Online' : sNet && age < 1800000 ? 'Buscando satélite' : 'Offline'}</span> · ${dmy(RX(lastAny))}` : 'aguardando primeira leitura'));
    const sim = [...rs].reverse().find((r) => r.event === 'sim'), sp = sim ? simParse(sim) : null;
    const simOk = sp && sp.pin === 'READY';
    K.push(kpi(sim ? (simOk ? 'ok' : 'bad') : 'off', 'SIM', sim ? (simOk ? 'Pronto' : 'Erro') : '—', sim ? `ICCID •••• ${esc(sp.ic || '—')} · PIN ${esc(sp.pin || '—')} · ${ago(sim.ts)}` : 'sem dados do SIM ainda'));
    const d24 = rs.filter((r) => RX(r) > Date.now() - 86400000 && r.seq != null), seqs = d24.map((r) => r.seq);
    const exp = seqs.length ? Math.max(...seqs) - Math.min(...seqs) + 1 : 0, rate = exp ? Math.min(100, Math.round((new Set(seqs).size / exp) * 100)) : null;
    const c = lt?.counters;
    const devRate = c && c.tries ? Math.round((c.ok / c.tries) * 100) : null, R = devRate ?? rate;
    K.push(kpi(R == null ? 'off' : R >= 95 ? 'ok' : R >= 80 ? 'warn' : 'bad', 'Sucesso de envio', R == null ? '—' : R + '<u>%</u>', R == null ? 'aguardando envios' : `${devRate != null ? `placa: ${c.ok}/${c.tries} ok desde o boot · ` : ''}servidor recebeu ${new Set(seqs).size} de ${exp} seq (24 h)`));
    const lastSes = ses[ses.length - 1];
    K.push(kpi(tOn ? 'ntn' : 'off', 'Modo teste satélite', tOn ? 'Ligado' : 'Desligado', tOn ? `desde ${hm(sCur ? sCur.start : T(st1))} · leitura a cada 2 min ao registrar` : lastSes ? `última tentativa ${dmy(lastSes.start)} · ${lastSes.reg ? 'registrou' : 'sem registro'}` : 'B4 por 3 s para iniciar'));
    $('kpis').innerHTML = K.join('');
    if (window.drawHeroU) { let runStart = null; for (let i = tel.length - 1; i >= 0 && !isSat(tel[i]); i--) runStart = T(tel[i]);
      const chg = [...rs].reverse().find((r) => r.type === 'event' && ['boot', 'back_catm', 'sw', 'lost', 'reg'].includes(r.event)); if (runStart != null && chg && T(chg) > runStart) runStart = T(chg);
      const key = !rs.length ? 'nodata' : offNow || (!on && !(sNet && age < 1800000)) ? 'off' : sNet ? (sNet.reg ? 'ntn' : 'search') : 'catm';
      window.drawHeroU({ key, lastNet: lastNetTxt, busca: key === 'search' ? { t0: sNet.start, iniTxt: 'teste satélite (botão 4)', sync: sNet.gnss || sNet.search ? 1 : null, reg: sNet.reg ? 1 : null,
        sinal: (() => { const x = [...sNet.ev].reverse().find((r) => (r.plmn === '90198' || r.type === 'satsum' || r.type === 'satdet' || /^sat_/.test(r.event || '')) && (r.rsrp != null || r.rsrpAvg != null)); return x ? { rsrp: x.rsrp ?? x.rsrpAvg, snr: x.snr ?? x.snrAvg, at: T(x) } : null; })(),
        refs: ses.filter((x) => x.reg).map((x) => T(x.reg) - x.start), rej: sNet.ev.filter((r) => r.rej != null).map((r) => r.rej) } : null, since: key === 'ntn' ? T(sNet.reg) : key === 'search' ? sNet.start : key === 'catm' ? runStart : null, lastRx: lastAny ? RX(lastAny) : null,
        note: key === 'catm' && tOn ? 'modo teste NTN ligado, sem registro no satélite' : key === 'catm' && lt ? `${OPS[lt.plmn] || 'operadora'} (${lt.plmn || 'n/d'}) · banda ${lt.band || 'n/d'} · ${lt.rsrp ?? 'n/d'} dBm` : '' }); }

    $('cChart').innerHTML = consumo(rd);
    $('sChart').innerHTML = sinal(rs, tel);
    $('nChart').innerHTML = redes(rs);
    $('tl').innerHTML = timeline(ses);
    /* identidade */
    const boot = [...rs].reverse().find((r) => r.event === 'boot');
    $('idCard').innerHTML = rs.length ? [['Modelo', 'nRF9151 DK (PCA10201)'], ['Firmware do modem', boot ? esc(boot.info) : '—'], ['Firmware da aplicação', 'medidor m1 <small class="muted">(versão não enviada)</small>'],
      ['ICCID', sp?.ic ? '•••• •••• ' + esc(sp.ic) : '—'], ['IMSI', sp?.im ? esc(sp.im.replace(/^(\d{5}).*…/, '$1 ••• ')) : '—'], ['APN', '<small class="muted">não reportado pela placa</small>'],
      ['Intervalo de envio', ivMin ? '~' + Math.round(ivMin) + ' min (medido)' : '—'], ['Alimentação', lt?.mv != null ? (lt.mv / 1000).toFixed(2) + ' V' + (lt.temp != null ? ' · ' + lt.temp + ' °C' : '') : '—'],
      ['Último boot', boot ? dmy(T(boot)) : '—']].map(([k, v]) => `<div><span class="muted">${k}</span><b>${v}</b></div>`).join('') : empty('Aguardando a primeira comunicação da placa.');
    $('alCount').textContent = al.length || '';
    $('alerts').innerHTML = al.length ? al.slice(-20).reverse().map((a) => { const d = AL[a.event] || ['⚠️', a.event, '']; return `<div class="al"><i>${d[0]}</i><div><b>${esc(d[1])}</b> <span class="muted">${dmy(a.ts)}</span><br><small class="muted">${esc(d[2])}</small></div></div>`; }).join('')
      : empty('Nenhum alerta. Monitorados: vazamento, consumo anômalo, violação e bateria baixa.');
    /* mapa */
    const pos = [...rs].reverse().find((r) => r.lat != null && r.lon != null && r.posSrc === 'gnss') || [...rs].reverse().find((r) => r.lat != null && r.lon != null);
    if (!map && window.L) { map = L.map('map', { zoomControl: false, attributionControl: true }).setView([-15.8, -47.9], 3); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map); }
    if (pos && map) { const ll = [pos.lat, pos.lon]; if (!mk) { mk = L.circleMarker(ll, { radius: 9, color: '#fff', weight: 2, fillColor: '#7a6cff', fillOpacity: 1 }).addTo(map); L.circle(ll, { radius: 100, color: '#7a6cff', weight: 1, fillOpacity: 0.1 }).addTo(map); map.setView(ll, 15); } else mk.setLatLng(ll);
      $('posInfo').textContent = `${pos.lat.toFixed(3)}, ${pos.lon.toFixed(3)} · ~100 m`; }
    else $('posInfo').textContent = 'aguardando posição GNSS';
    /* sim histórico */
    const sims = rs.filter((r) => r.event === 'sim');
    $('simGrid').innerHTML = '';
    $('simBody').innerHTML = sims.length ? sims.slice(-60).reverse().map((s) => { const p = simParse(s); return `<tr><td class="mono">${dmy(s.ts)}</td><td class="mono">${p.ic ? '…' + esc(p.ic) : '—'}</td><td class="mono">${esc(p.im || '—')}</td><td>${esc(p.pin || '—')}</td><td>${s.value ?? '—'}</td></tr>`; }).join('') : '<tr><td colspan="5" class="muted">Sem eventos de SIM ainda.</td></tr>';
    /* faturamento */
    const t = parseFloat($('tariff').value), months = new Map();
    rd.forEach((r) => { const k = new Date(r.ts).toLocaleDateString('sv-SE').slice(0, 7); const m = months.get(k) || { a: r.totalL, b: r.totalL, n: 0 }; m.b = r.totalL; m.n++; months.set(k, m); });
    $('billBody').innerHTML = months.size ? [...months.entries()].reverse().map(([k, m]) => { const cc = Math.max(0, m.b - m.a); return `<tr><td>${k.slice(5)}/${k.slice(0, 4)}</td><td class="mono">${m3(m.a)} m³</td><td class="mono">${m3(m.b)} m³</td><td>${m3(cc)} m³</td><td>${Number.isFinite(t) ? (cc / 1000 * t).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'informe a tarifa'}</td><td>${m.n}</td></tr>`; }).join('') : '<tr><td colspan="6" class="muted">Aguardando a primeira leitura do medidor.</td></tr>';
    /* amostras SAT */
    const sr = rs.filter((r) => r.type === 'satsum' || r.type === 'satdet');
    $('satRaw').innerHTML = sr.length ? '<div class="table-wrap" style="max-height:300px"><table class="tbl"><thead><tr><th>Hora</th><th>Tipo</th><th>Sessão</th><th>Resumo</th></tr></thead><tbody>' + sr.reverse().map((r) => `<tr><td class="mono">${dmy(r.ts)}</td><td>${r.type}</td><td>${esc(r.sess ?? '—')}</td><td>${r.type === 'satsum' ? `${r.samples ?? 0} amostras · RSRP ${r.rsrpMin ?? '—'}…${r.rsrpMax ?? '—'} dBm · ${r.regPct ?? 0}% registrado · ${r.dur ?? '—'} s` : `${(r.pts || []).length} pontos`}</td></tr>`).join('') + '</tbody></table></div>' : empty('Nenhuma amostra SAT recebida ainda.');
    renderTable();
    if (window.drawSatLive) window.drawSatLive(rs);
    if (window.Pointing) { window.Pointing.render('ptBox', rs); if (pos) { const sat = window.Pointing.SATS[0], lk = window.Pointing.look(pos.lat, pos.lon, sat.lon), dc = window.Pointing.decl(pos.lat, pos.lon); $('ptSum').textContent = `· ${((lk.az - dc + 360) % 360).toFixed(0)}° na bússola, ${lk.el.toFixed(0)}° de elevação (${sat.name.split(' (')[0]})`; } }
    $('foot').textContent = 'Connect · IoT Cat-M e Satélite NTN · Utilities · dados reais do medidor m1 · atualiza a cada 30 s · ICCID/IMSI mascarados · posição arredondada (~100 m)';
  }
  function renderTable() {
    const rs = [...recs].sort((a, b) => T(b) - T(a)), q = ($('fTxt').value || '').toLowerCase();
    const f = rs.filter((r) => (fT === 'all' || r.type === fT || (fT === 'event' && /^sat/.test(r.type))) && (fN === 'all' || (fN === 'ntn') === isSat(r)) && (!q || JSON.stringify(r).toLowerCase().includes(q)));
    $('rdCount').textContent = rs.length ? `· ${f.length} de ${rs.length}` : '';
    $('rdBody').innerHTML = f.length ? f.slice(0, 500).map((r) => `<tr><td class="mono">${dmy(r.ts)}</td><td>${r.seq ?? '—'}</td><td>${r.type === 'telemetry' ? 'leitura' : r.type === 'alarm' ? 'alarme' : esc(r.event || r.type)}</td><td>${tag(r)}</td><td class="mono">${r.totalL != null ? nf(r.totalL) + ' L' : '—'}</td><td>${r.deltaL != null ? r.deltaL + ' L' : '—'}</td><td>${r.rsrp != null ? r.rsrp + ' dBm' : '—'}</td><td class="muted">${esc(r.event === 'sim' ? '' : r.info ?? '')}</td><td>${r.late > 0 ? r.late + ' s' : 'tempo real'}</td></tr>`).join('')
      : `<tr><td colspan="9" class="muted">${rs.length ? 'Nenhum registro com esse filtro.' : 'Aguardando a primeira leitura do medidor.'}</td></tr>`;
  }
  const W = 720;
  function axisX(t0, t1, x, H, B) { let g = ''; const n = 6; for (let i = 0; i <= n; i++) { const t = t0 + ((t1 - t0) * i) / n; g += `<text x="${x(t)}" y="${H - 6}" font-size="10" fill="#8e9ab5" text-anchor="${i === 0 ? 'start' : i === n ? 'end' : 'middle'}">${t1 - t0 > 2 * 86400000 ? dmy(t).slice(0, 5) : hm(t)}</text>`; } return g; }
  function consumo(rd) {
    if (rd.length < 2) return empty(rd.length ? 'Precisa de pelo menos 2 leituras para calcular o consumo.' : 'Aguardando primeira leitura.');
    let b = [];
    if (agg === 'i') { for (let i = 1; i < rd.length; i++) { const d = rd[i].totalL - rd[i - 1].totalL; b.push({ t: T(rd[i]), v: Math.max(0, d), tot: rd[i].totalL, k: hm(T(rd[i])) }); } b = b.slice(-60); }
    else { const m = new Map(); for (let i = 1; i < rd.length; i++) { const d = new Date(T(rd[i])); const k = agg === 'h' ? d.toLocaleDateString('sv-SE') + ' ' + String(d.getHours()).padStart(2, '0') : d.toLocaleDateString('sv-SE'); const o = m.get(k) || { v: 0, tot: 0, t: T(rd[i]) }; o.v += Math.max(0, rd[i].totalL - rd[i - 1].totalL); o.tot = rd[i].totalL; m.set(k, o); }
      b = [...m.entries()].map(([k, o]) => ({ ...o, k: agg === 'h' ? k.slice(11) + 'h' : k.slice(8) + '/' + k.slice(5, 7) })).slice(agg === 'h' ? -48 : -31); }
    const H = 230, L = 44, R = 50, B = 22, mx = Math.max(10, ...b.map((x) => x.v)), t0 = Math.min(...b.map((x) => x.tot)), t1 = Math.max(...b.map((x) => x.tot), t0 + 10), bw = (W - L - R) / b.length;
    const y = (v) => H - B - (v / mx) * (H - B - 12), y2 = (v) => H - B - ((v - t0) / (t1 - t0)) * (H - B - 12);
    let g = ''; for (let k = 0; k <= 4; k++) { const v = (mx * k) / 4, tv = t0 + ((t1 - t0) * k) / 4; g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="#ffffff10"/><text x="${L - 5}" y="${y(v) + 4}" font-size="10" fill="#8e9ab5" text-anchor="end">${Math.round(v)}</text><text x="${W - R + 5}" y="${y(v) + 4}" font-size="10" fill="#2fd27a">${nf(Math.round(tv))}</text>`; }
    b.forEach((o, i) => { const h = Math.max(o.v ? 2 : 0, H - B - y(o.v)), x = L + i * bw; g += `<rect x="${x + 1}" y="${H - B - h}" width="${Math.max(2, bw - 2)}" height="${h}" rx="2" fill="url(#ug)"><title>${o.k}: ${o.v} L · total ${nf(o.tot)} L</title></rect>`;
      if (i % Math.ceil(b.length / 10) === 0) g += `<text x="${x + bw / 2}" y="${H - 6}" font-size="10" fill="#8e9ab5" text-anchor="middle">${o.k}</text>`; });
    g += `<path d="${b.map((o, i) => (i ? 'L' : 'M') + (L + i * bw + bw / 2).toFixed(1) + ' ' + y2(o.tot).toFixed(1)).join('')}" fill="none" stroke="#2fd27a" stroke-width="2.2"/>`;
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%"><defs><linearGradient id="ug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d8bff"/><stop offset="1" stop-color="#a45cff"/></linearGradient></defs>${g}<text x="${L}" y="9" font-size="10" fill="#8e9ab5">L no intervalo</text><text x="${W - R + 5}" y="9" font-size="10" fill="#2fd27a">total L</text></svg>`;
  }
  function sinal(rs, tel) {
    const pts = tel.filter((r) => r.rsrp != null).map((r) => ({ t: T(r), v: r.rsrp, s: r.snr, n: isSat(r) }));
    rs.filter((r) => r.event === 'sat_reg' && r.rsrp != null).forEach((r) => pts.push({ t: T(r), v: r.rsrp, s: r.snr, n: true }));
    rs.filter((r) => r.type === 'satdet').forEach((d) => { const s = rs.find((x) => x.type === 'satsum' && x.sess === d.sess); const b = s ? T(s) - (s.dur || 0) * 1000 : T(d); (d.pts || []).forEach((p) => p.rsrp != null && pts.push({ t: b + p.t * 1000, v: p.rsrp, s: p.snr, n: true })); });
    if (!pts.length) return empty('Sem medições de sinal ainda.');
    pts.sort((a, b) => a.t - b.t);
    const H = 210, L = 40, B = 22, t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 60000), lo = Math.min(-130, ...pts.map((p) => p.v)), hi = Math.max(-60, ...pts.map((p) => p.v));
    const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - 10), y = (v) => 10 + (1 - (v - lo) / (hi - lo)) * (H - B - 10);
    let g = `<rect x="${L}" y="${y(hi)}" width="${W - L - 10}" height="${y(-95) - y(hi)}" fill="#2fd27a0d"/>`;
    for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) g += `<line x1="${L}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#ffffff10"/><text x="${L - 4}" y="${y(v) + 3}" font-size="10" fill="#8e9ab5" text-anchor="end">${v}</text>`;
    const line = (arr, c) => { let d = '', p = null; arr.forEach((q) => { d += (p && q.t - p.t < 15 * 60000 ? 'L' : 'M') + x(q.t).toFixed(1) + ' ' + y(q.v).toFixed(1); p = q; }); return `<path d="${d}" fill="none" stroke="${c}" stroke-width="1.8" opacity=".8"/>`; };
    g += line(pts.filter((p) => !p.n), '#2f7cf6') + line(pts.filter((p) => p.n), '#9b4dff');
    pts.forEach((p) => (g += `<circle cx="${x(p.t)}" cy="${y(p.v)}" r="3" fill="${p.n ? '#9b4dff' : '#2f7cf6'}"><title>${dmy(p.t)} · ${p.n ? 'Satélite' : 'Cat-M'} · RSRP ${p.v} dBm · SNR ${p.s ?? '—'} dB</title></circle>`));
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${g}${axisX(t0, t1, x, H, B)}</svg>`;
  }
  function redes(rs) {
    const sent = rs.filter((r) => r.type !== 'satdet'); if (!sent.length) return empty('Aguardando envios.');
    const g = { catm: sent.filter((r) => !isSat(r)), ntn: sent.filter(isSat) }, tot = sent.length;
    const lat = (a) => median(a.map((r) => r.prevRttMs).filter((v) => v != null)), late = (a) => median(a.map((r) => r.late).filter((v) => v != null));
    const bar = (k, nm, c) => `<div class="nbar"><div class="lbl"><span>${nm}</span><b>${g[k].length} (${Math.round((g[k].length / tot) * 100)}%)</b></div><div class="trk"><i style="width:${(g[k].length / tot) * 100}%;background:${c}"></i></div></div>`;
    const lc = lat(g.catm), ln = lat(g.ntn);
    return bar('catm', 'Cat-M', '#2f7cf6') + bar('ntn', 'Satélite Skylo', '#9b4dff') +
      `<div class="nstat"><div><small class="muted">Latência Cat-M (mediana)</small><b>${lc != null ? (lc / 1000).toFixed(1) + ' s' : '—'}</b><small class="muted">atraso fila ${late(g.catm) ?? '—'} s</small></div><div><small class="muted">Latência satélite</small><b>${ln != null ? (ln / 1000).toFixed(1) + ' s' : '—'}</b><small class="muted">${g.ntn.length ? 'atraso fila ' + (late(g.ntn) ?? '—') + ' s' : 'nenhum envio via satélite ainda'}</small></div></div>
      <small class="muted">Latência = tempo de ida e volta do envio anterior, medido pela placa.</small>`;
  }
  function timeline(ses) {
    if (!ses.length) return empty('Nenhuma tentativa de satélite ainda. Segure o Botão 4 por 3 s para iniciar o teste.');
    return ses.slice(-8).reverse().map((s) => {
      const end = s.open ? Math.max(s.last, Date.now()) : s.end, span = Math.max(end - s.start, 60000), p = (t) => ((t - s.start) / span) * 100;
      const segs = []; const g = s.gnss ? T(s.gnss) : null, se = s.search ? T(s.search) : g, rg = s.reg ? T(s.reg) : null, ls = s.lost ? T(s.lost) : null;
      segs.push([s.start, g || se || s.last, '#3d8bff', 'GNSS']);
      if (se) segs.push([se, rg || ls || (s.open ? s.last : end), '#ffb020', 'buscando Skylo']);
      if (rg) segs.push([rg, ls || (s.open ? s.last : end), '#2fd27a', 'registrado 90198']);
      if (s.open) segs.push([s.last, end, 'repeating-linear-gradient(90deg,#ffffff22 0 6px,transparent 6px 12px)', 'sem notícias da placa (fila até registrar)']);
      const bars = segs.filter(([a, b]) => b > a).map(([a, b, c, t]) => `<i title="${t}: ${hm(a)}–${hm(b)}" style="position:absolute;left:${p(a)}%;width:${Math.max(0.8, p(b) - p(a))}%;top:0;bottom:0;background:${c};border-radius:4px"></i>`).join('');
      const res = s.reg ? `<b style="color:#2fd27a">registrou</b> em ${s.reg.value ?? '—'} s${s.reg.rsrp != null ? ' · ' + s.reg.rsrp + ' dBm' : ''}${s.tx ? ' · ' + s.tx + ' leitura(s) via satélite' : ''}` : s.fail ? `<b style="color:#ff5470">falhou</b> (${esc(s.fail.info || '')})` : s.open ? '<b style="color:#ffb020">em andamento</b> · sem registro ainda' : '<b style="color:#ff5470">sem registro</b>';
      return `<div class="tlrow"><div><b>${dmy(s.start)}</b><br><small class="muted">${agoS(end - s.start)}${s.open ? '' : ' · ' + esc(s.why || '')}</small></div><div><div style="position:relative;height:16px;background:var(--card2);border-radius:5px">${bars}</div><small class="muted">${s.gnss ? 'GNSS ' + (s.gnss.event === 'gnss_fail' || s.gnss.value < 0 ? 'sem fix' : 'ok em ' + s.gnss.value + ' s') + ' · ' : ''}${res}${s.lost ? ' · <span style="color:#ff5470">perdeu o sinal</span>' : ''}</small></div></div>`;
    }).join('') + '<div class="legend"><span><i style="background:#3d8bff"></i>GNSS</span><span><i style="background:#ffb020"></i>buscando</span><span><i style="background:#2fd27a"></i>registrado</span><span><i style="background:#ffffff33"></i>sem notícias</span></div>';
  }
  async function load() { try { recs = sanitizeNet(await window.ApiCore.fetchMeter(62)); /* B3: via api-core.js */ } catch (e) { console.warn('utilities: falha ao carregar', e); } render(); }
  // A3: Poll 30 s: suficiente para o medidor.
  // Rastreador usa 15 s (troca de rede precisa aparecer rapido na demo).
  // Consumo usa 45 s (dados historicos, sem urgencia de tempo real).
  load(); setInterval(load, 30000); setInterval(render, 15000); // v8: reavalia offline sem dado novo
})();
