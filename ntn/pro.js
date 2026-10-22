/* nRF9151 NTN Pro (v37) — UI. Lógica em pro-core.js (window.NtnPro). */
(() => {
  const PANEL_VERSION = '2.4'; // versão do painel NTN Pro; atualizar a cada release
  const P = window.NtnPro;
  const onNetlify = /(netlify\.app|pages\.dev)$/i.test(location.hostname) || /^(localhost|127\.)/.test(location.hostname);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const hhmm = (iso) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—');
  const dmy = (iso) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');
  const SAT = { '90198': 'Skylo' }; // v45: extensivel (Sateliot etc.)
  const satName = (r) => { const p = r && r.net === 'ntn' && r.plmn ? r.plmn : null; const op = (r && r.satOp) || (p && SAT[p]);
    return op ? { t: op + ' (' + (p || Object.keys(SAT).find((k) => SAT[k] === op) || '?') + ')', inf: false } : { t: 'Skylo (90198)', inf: true }; };
  const netTag = (n, r) => { if (!n) return '—'; if (n !== 'ntn') return '<span class="tag catm">Cat-M</span>';
    if (!r) return '<span class="tag ntn">Satélite</span>'; const s = satName(r);
    return `<span class="tag ntn">Satélite · ${s.t}</span>${s.inf ? ' <small class="muted">(inferido)</small>' : ''}`; };
  window.ntnSatName = satName;
  const LS = 'ntnpro.filters';
  const st = Object.assign({ src: 'live', period: '24h', net: 'all', pos: 'all', sw: false }, JSON.parse(localStorage.getItem(LS) || '{}'));
  const params = new URLSearchParams(location.search);
  if (params.get('replay') === '1') st.src = 'replay';
  let live = [], replay = null, rpCursor = null, rpTimer = null, lastLoad = null, fitted = false;

  // ---------- mapa ----------
  const map = L.map('map', { zoomControl: true, attributionControl: true }).setView([-23.55, -46.70], 11);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap', className: 'tiles' }).addTo(map);
  const layer = L.layerGroup().addTo(map);
  window.ntnMap = map; // v49: usado por insights.js
  // D2: "ver no mapa" da linha do tempo de comutações
  document.addEventListener('sw:focusMap', (e) => { const d = e.detail || {}; if (isFinite(d.lat) && isFinite(d.lon)) { map.setView([d.lat, d.lon], 16); document.getElementById('map').scrollIntoView({ behavior: 'smooth', block: 'center' }); } });

  function recs() {
    if (st.src === 'replay') { const all = replay ? replay.records : []; return rpCursor == null ? all : all.filter((r) => Date.parse(r.ts) <= rpCursor); }
    return live;
  }
  function nowRef() { return st.src === 'replay' ? (rpCursor ?? (replay ? Date.parse(replay.records[replay.records.length - 1].ts) + 60000 : Date.now())) : Date.now(); }
  function view() {
    const f = { period: st.src === 'replay' ? 'all' : st.period, net: st.net, pos: st.pos, switchesOnly: st.sw };
    return P.filterRecords(recs(), f, nowRef());
  }

  function popup(r) {
    const rows = [['Horário', dmy(r.ts)], ['Rede', r.net === 'ntn' ? 'Satélite NTN (Skylo)' : 'Cat-M (celular)']];
    if (r.type === 'event') rows.push(['Evento', (P.EVENT_PT[r.event] || r.event) + (r.info ? ' — ' + r.info : '')]);
    if (r.plmn) rows.push(['Operadora (PLMN)', r.plmn + (r.band ? ' · banda ' + r.band : '') + (r.act != null ? ' · AcT ' + r.act : '')]);
    if (r.rsrp != null) rows.push(['Sinal', r.rsrp + ' dBm' + (r.snr != null ? ' · SNR ' + r.snr + ' dB' : '') + (r.ce != null ? ' · CE ' + r.ce : '')]);
    if (r.rttMs != null) rows.push(['Latência (medida)', P.fmtMs(r.rttMs)]);
    if (r.prevRttMs != null) rows.push(['Latência msg anterior', P.fmtMs(r.prevRttMs)]);
    if (r.bytes) rows.push(['Bytes', r.bytes + ' B (payload)']);
    rows.push(['Transporte', r.transport === 'udp' ? 'UDP (relay Fly.io)' : 'HTTPS']);
    rows.push(['Entrega', r.late > 0 ? `atrasada ${P.fmtDur(r.late)} (fila)` : 'em tempo real']);
    if (r.posSrc) rows.push(['Posição', (({ gnss: 'GNSS', celula: 'Célula (nRF Cloud)', salva: 'Salva (última conhecida)', injetada: 'Injetada no modem (NTN)' })[r.posSrc] || r.posSrc) + (r.acc != null ? ' · ±' + r.acc + ' m' : '')]);
    if (r.gnssAge != null) rows.push(['GPS', (r.gnssAge < 0 ? 'sem fix desde o boot' : 'fix há ' + P.fmtDur(r.gnssAge)) + (r.gnssSats != null ? ' · ' + r.gnssSats + ' sats' : '')]);
    if (r.mv != null) rows.push(['Tensão / temp.', r.mv + ' mV' + (r.temp != null ? ' · ' + r.temp + ' °C' : '')]);
    if (r.replay) rows.push(['Fonte', 'REPLAY (log real)']);
    return '<table>' + rows.map(([k, v]) => `<tr><td class="muted">${esc(k)}</td><td><b>${esc(v)}</b></td></tr>`).join('') + '</table>';
  }
  function drawMap(rs) {
    layer.clearLayers();
    const pts = P.mapPoints(rs, st.pos === 'salva');
    const isCell = (p) => p.rec.posSrc === 'celula' || p.rec.posSrc === 'salva';
    const gps = pts.filter((p) => !isCell(p));
    for (const s of P.segments(gps)) L.polyline(s.pts, { color: P.NET[s.net]?.color || '#888', weight: 4, opacity: 0.85 }).addTo(layer);
    // v44: celula/salva agrupadas por coordenada num marcador de antena (sem jitter, fora da trilha)
    const groups = new Map();
    pts.filter(isCell).forEach((p) => { const k = p.lat.toFixed(5) + ',' + p.lon.toFixed(5); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
    for (const g of groups.values()) {
      const f = g[0], l = g[g.length - 1], r = l.rec, c = P.NET[l.net]?.color || '#888';
      const acc = Math.max(...g.map((p) => p.rec.acc || 0));
      if (r.posSrc === 'celula' && acc) L.circle([f.lat, f.lon], { radius: Math.min(acc, 5000), color: c, weight: 1, opacity: 0.6, dashArray: '6 6', fillColor: c, fillOpacity: 0.06, interactive: false }).addTo(layer);
      const srcs = [...new Set(g.map((p) => p.rec.posSrc))].join('/');
      const html = `<div style="position:relative;width:26px;height:26px;border-radius:50%;background:${c};border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:14px;opacity:${r.posSrc === 'salva' ? 0.6 : 1}">📡${g.length > 1 ? `<b style="position:absolute;top:-8px;right:-10px;background:#111;color:#fff;border:1px solid #fff;border-radius:9px;font:600 10px sans-serif;padding:1px 4px">${g.length}</b>` : ''}</div>`;
      const pop = `<b>Posição por ${esc(srcs)} (antena)</b><br>${g.length} leitura(s)<br>de ${dmy(f.rec.ts)}<br>até ${dmy(r.ts)}${acc ? '<br>precisão ±' + acc + ' m' : ''}<br>${f.lat.toFixed(4)}, ${f.lon.toFixed(4)}<hr>Última:<br>` + popup(r);
      L.marker([f.lat, f.lon], { icon: L.divIcon({ className: '', html, iconSize: [26, 26], iconAnchor: [13, 13] }) }).bindPopup(pop).addTo(layer);
    }
    gps.forEach((p) => {
      const r = p.rec, c = P.NET[p.net]?.color || '#888', ev = r.type === 'event';
      const ll = [p.lat, p.lon];
      const src = r.posSrc;
      const sty = src === 'injetada' ? { color: '#ffd54a', weight: 2.5 } : {};
      const m = ev && ['sw', 'reg', 'fail'].includes(r.event)
        ? L.marker(ll, { icon: L.divIcon({ className: '', html: `<div style="width:14px;height:14px;background:${c};border:2px solid #fff;border-radius:3px;transform:rotate(45deg)"></div>`, iconSize: [14, 14] }) })
        : L.circleMarker(ll, { radius: ev ? 3.5 : 4.5, color: r.late > 0 ? '#ff8a8a' : '#fff', dashArray: r.late > 0 ? '3' : null, weight: r.late > 0 ? 2.5 : 1.5, fillColor: c, fillOpacity: 0.95, ...sty });
      m.bindPopup(popup(r)).addTo(layer);
    });
    if (pts.length) {
      const lp = pts[pts.length - 1], lr = lp.rec, lc = P.NET[lr.deliveredNet || lp.net]?.color || '#888';
      const lbl = 'Agora · ' + hhmm(lr.ts) + (lr.posSrc ? ' · ' + lr.posSrc + (lr.acc ? ' ±' + lr.acc + ' m' : '') : '');
      L.marker([lp.lat, lp.lon], { zIndexOffset: 10000, icon: L.divIcon({ className: '', iconSize: [22, 22], iconAnchor: [11, 11],
        html: `<div class="nowpin" style="--c:${lc}"><span></span><b>${esc(lbl)}</b></div>` }) }).bindPopup(popup(lr)).addTo(layer);
      if (!fitted || st.src === 'replay') { map.setView([lp.lat, lp.lon], lr.acc > 1500 ? 14 : 16); fitted = true; }
    }
  }

  function drawLive(all) {
    const s = P.liveStatus(all, nowRef());
    const dot = $('lvDot'); dot.className = 'dot ' + (s ? (s.stale && st.src !== 'replay' ? 'stale' : s.net) : '');
    if (!s) { $('lvNet').textContent = 'sem dados'; ['lvSince', 'lvSig', 'lvOp', 'lvAge', 'lvRx', 'lvDev', 'lvCnt', 'lvGps', 'lvGpsD'].forEach((k) => ($(k).textContent = '')); return; }
    $('lvNet').textContent = s.net === 'ntn' ? 'Satélite NTN (Skylo)' : 'Cat-M (LTE-M)';
    $('lvSince').textContent = s.sinceSec != null ? 'há ' + P.fmtDur(s.sinceSec) : '';
    $('lvSig').textContent = s.rsrp != null ? s.rsrp + ' dBm' : '—';
    $('lvOp').textContent = [s.plmn && 'PLMN ' + s.plmn, s.band && 'banda ' + s.band, s.snr != null && 'SNR ' + s.snr + ' dB'].filter(Boolean).join(' · ');
    $('lvAge').textContent = 'há ' + P.fmtDur(s.ageSec);
    $('lvRx').textContent = dmy(s.lastRx) + (s.stale && st.src !== 'replay' ? ' · sem novidades' : '');
    $('lvDev').textContent = s.mv != null ? (s.mv / 1000).toFixed(2) + ' V' + (s.temp != null ? ' · ' + s.temp + ' °C' : '') : '—';
    const g = P.gpsStatus(all, nowRef());
    const noPos = /salva|sem posicao/.test(g.src || '');
    $('lvGps').textContent = noPos ? 'sem posição no momento' : g.age == null ? 'sem fix' : 'fix há ' + P.fmtDur(g.age);
    $('lvGps').style.color = noPos ? '#ff8a8a' : '';
    $('lvGpsD').textContent = [g.sats != null && g.sats + ' sats', g.src && 'posição: ' + g.src, g.acc != null && '±' + g.acc + ' m'].filter(Boolean).join(' · ');
    const fr = s.failReasons;
    $('lvCnt').textContent = (s.counters ? `envios ${s.counters.tries} · ok ${s.counters.ok} · falhas ${s.counters.fail} · comutações ${s.counters.switches}` : '') + (fr ? ` | motivos: aguardando dados ${fr.wait} · DNS ${fr.dns} · timeout ${fr.timeout} · outros ${fr.other}` : '');
    if (s.waiting) $('lvSince').textContent = 'aguardando dados do satélite' + ($('lvSince').textContent ? ' · ' + $('lvSince').textContent : '');
  }
  function pctS(x) { return x == null ? '—' : (x * 100).toFixed(x >= 0.995 ? 0 : 1) + '%'; }
  function drawKpis(rs) {
    const k = P.kpis(rs, nowRef()), c = k.net.catm, n = k.net.ntn;
    const card = (t, main, split) => `<div class="kpi"><small>${t}</small><b>${main}</b>${split ? `<div class="split">${split}</div>` : ''}</div>`;
    $('kpis').innerHTML = [
      card('Taxa de entrega', pctS(k.delivery), `<span class="c">Cat-M ${pctS(c.delivery)}</span><span class="n">Sat ${pctS(n.delivery)}</span>`),
      card('Latência média', `<span class="c">${P.fmtMs(c.rttAvg)}</span> / <span class="n">${P.fmtMs(n.rttAvg)}</span>`, `p95: <span class="c">${P.fmtMs(c.rttP95)}</span> · <span class="n">${P.fmtMs(n.rttP95)}</span>`),
      card('Tempo médio registro NTN', P.fmtDur(k.ntnRegAvg), `${k.ntnRegCount} registro(s) · ${k.ntnRegFails} falha(s)`),
      card('Bytes por mensagem', c.bytesAvg || n.bytesAvg ? Math.round(((c.bytesAvg || 0) * c.received + (n.bytesAvg || 0) * n.received) / ((c.bytesAvg ? c.received : 0) + (n.bytesAvg ? n.received : 0) || 1)) + ' B' : '—', 'payload ≤ 256 B (limite Skylo)'),
      card('Mensagens atrasadas', String(k.late), 'reenviadas pela fila'),
      card('Disponibilidade', pctS(k.availability), `${k.switches} comutação(ões) · ${k.total} registros`),
    ].join('');
  }
  function drawSwitches(rs) {
    // D2: lista pelo componente compartilhado (RF-03); contagem segue P.switches
    const sw = P.switches(rs);
    $('swCount').textContent = sw.length + ' comutação(ões)';
    if (window.SwitchTimeline) window.SwitchTimeline.render('swList', window.SwitchTimeline.build(rs));
    // faixa proporcional ao tempo em cada rede
    const all = P.sortRecs(rs); if (all.length < 2) { $('swBar').innerHTML = ''; return; }
    const t0 = Date.parse(all[0].ts), t1 = Math.max(Date.parse(all[all.length - 1].ts), t0 + 1);
    let html = '', prev = all[0];
    for (let i = 1; i <= all.length; i++) {
      const r = all[i];
      if (!r || r.net !== prev.net) { const end = r ? Date.parse(r.ts) : t1; html += `<div title="${prev.net} ${hhmm(prev.ts)}" style="width:${((end - Date.parse(prev.ts)) / (t1 - t0)) * 100}%;background:${P.NET[prev.net]?.color || '#555'}"></div>`; prev = r; }
    }
    $('swBar').innerHTML = html;
  }
  function drawTable(rs) {
    // latencia propria de cada msg = 'pr' informado na msg seguinte (mesma sessao)
    const srt = P.sortRecs(rs).filter((r) => r.seq != null).sort((x, y) => x.seq - y.seq), own = new Map();
    for (let i = 0; i + 1 < srt.length; i++) if (srt[i + 1].prevRttMs != null && srt[i + 1].seq - srt[i].seq <= 3) own.set(srt[i], srt[i + 1].prevRttMs);
    const rows = rs.slice(-300).reverse();
    $('msgCount').textContent = rs.length + ' registros';
    $('msgBody').innerHTML = rows.map((r) => {
      const det = r.type === 'event' ? (P.EVENT_PT[r.event] || r.event) + (r.info ? ' — ' + r.info : '') + (r.event === 'reg' || r.event === 'fix' ? ' (' + P.fmtDur(r.value) + ')' : '') : 'Telemetria' + (r.plmn ? ' · ' + r.plmn : '');
      const lat = r.rttMs != null ? P.fmtMs(r.rttMs) : own.has(r) ? P.fmtMs(own.get(r)) : '—';
      return `<tr><td class="mono">${hhmm(r.ts)}</td><td>${r.seq ?? '—'}</td><td>${netTag(r.deliveredNet || r.net, r)}${r.transport === 'udp' ? ' <span class="tag late" style="background:#1f6f43">UDP</span>' : ''}</td><td>${r.type === 'event' ? 'evento' : 'telemetria'}</td><td>${esc(det)}</td><td>${r.rsrp != null ? r.rsrp + ' dBm' : '—'}</td><td>${r.bytes ?? '—'}</td><td>${lat}</td><td>${r.late > 0 ? `<span class="tag late">atrasada ${P.fmtDur(r.late)}</span>` : 'tempo real'}</td></tr>`;
    }).join('');
  }
  const lg = { net: 'all', tr: 'all', late: false, q: '' };
  let lgRows = [];
  function lgDesc(r) { return r.type === 'event' ? (P.EVENT_PT[r.event] || r.event) + (r.info ? ' — ' + r.info : '') + (r.value != null && ['reg', 'fix', 'wdog'].includes(r.event) ? ' (' + P.fmtDur(r.value) + ')' : '') : 'Telemetria' + [r.plmn && ' · ' + r.plmn, r.rsrp != null && ' · ' + r.rsrp + ' dBm', r.posSrc && ' · pos ' + r.posSrc].filter(Boolean).join(''); }
  function drawLog(all) {
    const srt = all.filter((r) => r.seq != null).slice().sort((x, y) => x.seq - y.seq), own = new Map();
    for (let i = 0; i + 1 < srt.length; i++) if (srt[i + 1].prevRttMs != null && srt[i + 1].seq - srt[i].seq <= 3) own.set(srt[i], srt[i + 1].prevRttMs);
    const q = lg.q.toLowerCase();
    lgRows = P.sortRecs(all).filter((r) => (lg.net === 'all' || r.deliveredNet === lg.net) && (lg.tr === 'all' || (r.transport || 'https') === lg.tr) && (!lg.late || r.late > 0) && (!q || (lgDesc(r) + ' ' + r.seq).toLowerCase().includes(q)))
      .map((r) => ({ r, lat: r.rttMs ?? own.get(r) ?? null })).reverse();
    $('lgCount').textContent = lgRows.length + ' registros · ' + lgRows.filter((x) => x.r.deliveredNet === 'ntn').length + ' via satélite';
    $('lgBody').innerHTML = lgRows.slice(0, 1500).map(({ r, lat }) => `<tr${r.deliveredNet === 'ntn' ? ' style="background:rgba(155,77,255,.16)"' : ''}><td class="mono">${dmy(r.ts)}</td><td class="mono">${dmy(r.rx || r.ts)}</td><td>${r.seq ?? '—'}</td><td>${netTag(r.net)}</td><td>${netTag(r.deliveredNet, r)}</td><td>${(r.transport || 'https').toUpperCase()}</td><td>${r.type === 'event' ? 'evento' : 'telemetria'}</td><td>${esc(lgDesc(r))}</td><td>${r.bytes ?? '—'}</td><td>${lat != null ? P.fmtMs(lat) : '—'}</td><td>${r.late > 0 ? '<span class="tag late">' + P.fmtDur(r.late) + '</span>' : 'tempo real'}</td></tr>`).join('');
  }
  function render() {
    if (window.HealthBadge) { HealthBadge.init('healthBadge', {}); HealthBadge.update(live); } // RF-02
    const rs = view();
    const all = st.src === 'replay' ? recs() : live;
    $('replayBanner').hidden = st.src !== 'replay';
    document.querySelectorAll('#srcSeg button').forEach((b) => b.classList.toggle('on', b.dataset.src === st.src));
    document.querySelectorAll('#fNet button').forEach((b) => b.classList.toggle('on', b.dataset.net === st.net));
    document.querySelectorAll('#fPos button').forEach((b) => b.classList.toggle('on', b.dataset.pos === st.pos));
    $('fPeriod').value = st.period; $('fPeriod').disabled = st.src === 'replay'; $('fSw').checked = st.sw;
    P.annotateDelivery(all); drawLog(all); if (window.drawSim) window.drawSim(all); if (window.drawSatSig) window.drawSatSig(all); if (window.Pointing && st.src === 'live') window.Pointing.render('ptBox', all);
    drawLive(all); if (window.drawHero) window.drawHero(all, nowRef(), st.src); if (window.drawTrajeto) try { window.drawTrajeto(all, nowRef(), map); } catch (e) { console.warn('trajeto', e); } if (window.drawInsights) try { window.drawInsights(all, nowRef(), st.src, map); } catch (e) { console.warn('insights', e); } if (window.TrackerAlerts) try { window.TrackerAlerts.render(all); } catch (e) { console.warn('inteligência', e); } if (window.AlertsUI) try { window.AlertsUI.render('alertVeic', all, nowRef()); } catch (e) { console.warn('alertas', e); } drawKpis(rs); drawSwitches(st.sw ? all : rs); drawMap(rs); drawTable(rs);
    const empty = $('empty');
    empty.hidden = rs.length > 0;
    if (!rs.length) empty.innerHTML = st.src === 'live' ? 'Nenhum dado da placa neste período. Verifique se a placa está ligada (app NTN Pro v2.1) ou use <b>Replay da demonstração</b>.' : 'Sem dados de replay.';
    $('foot').textContent = st.src === 'replay' ? 'REPLAY: ' + (replay?.source || '') : 'atualizado ' + (lastLoad ? hhmm(lastLoad) : '—') + ' · atualiza a cada 15 s';
  }
  function save() { localStorage.setItem(LS, JSON.stringify({ period: st.period, net: st.net, pos: st.pos, sw: st.sw })); }

  async function loadLive() {
    try {
      // B2: busca via nucleo comum (api-core.js)
      live = await window.ApiCore.fetchTracker(14); lastLoad = new Date().toISOString();
    } catch (e) { console.warn('ntn-pro: falha ao carregar', e); }
    if (st.src === 'live') render();
  }
  async function loadReplay() {
    if (replay) return replay;
    const r = await fetch('replay.json?v=43', { cache: 'no-store' }); replay = await r.json();
    $('replayTitle').textContent = replay.title; return replay;
  }
  function stopReplay() { clearInterval(rpTimer); rpTimer = null; $('rpPlay').textContent = '▶ Reproduzir'; }
  function playReplay() {
    if (rpTimer) { stopReplay(); return; }
    const rs = replay.records, t0 = Date.parse(rs[0].ts) - 5000, t1 = Date.parse(rs[rs.length - 1].ts) + 5000;
    if (rpCursor == null || rpCursor >= t1) rpCursor = t0;
    $('rpPlay').textContent = '❚❚ Pausar';
    rpTimer = setInterval(() => {
      rpCursor += +$('rpSpeed').value * 250;
      $('rpClock').textContent = new Date(rpCursor).toLocaleTimeString('pt-BR');
      if (rpCursor >= t1) { rpCursor = null; stopReplay(); }
      render();
    }, 250);
  }

  // ---------- export ----------
  // G2: colunas do CSV do Rastreador (sem custo; lat/lon saem arredondadas pelo api-core)
  const CSV_COLS = ['ts', 'rx', 'type', 'net', 'seq', 'event', 'value', 'info', 'plmn', 'act', 'band', 'rsrp', 'snr', 'ce', 'mv', 'temp', 'regFor', 'lat', 'lon', 'acc', 'posSrc', 'gnssAge', 'gnssSats', 'deliveredNet', 'deliveredHow', 'transport', 'bytes', 'late', 'prevRttMs', 'rttMs'];
  const CSV_LABELS = { ts: 'criada (BRT)', rx: 'chegada (BRT)', type: 'tipo', net: 'rede', event: 'evento', value: 'valor', info: 'descrição', act: 'tecnologia', band: 'banda', ce: 'nível CE', mv: 'bateria (mV)', temp: 'temperatura (°C)', regFor: 'tempo de registro', lat: 'lat (aprox.)', lon: 'lon (aprox.)', acc: 'precisão (m)', posSrc: 'fonte da posição', gnssAge: 'idade GNSS (s)', gnssSats: 'satélites GNSS', deliveredNet: 'rede de entrega', deliveredHow: 'fonte da rede de entrega', transport: 'transporte', late: 'atraso (s)', prevRttMs: 'RTT anterior (ms)', rttMs: 'RTT (ms)' };
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  function doExport(kind) {
    const rs = view(), stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
    const tag = st.src === 'replay' ? 'replay' : 'live';
    const A = window.ApiCore;
    if (kind === 'csv') download(`ntn-pro-${tag}-${stamp}.csv`, A.toCSV(P.sortRecs(rs), CSV_COLS, CSV_LABELS), 'text/csv;charset=utf-8'); // G2: via api-core
    if (kind === 'json') download(`ntn-pro-${tag}-${stamp}.json`, JSON.stringify({ schema: 'ntn-pro/1', source: tag, exportedAt: new Date().toISOString(), kpis: P.kpis(rs, nowRef()), switches: P.switches(rs), records: rs }, null, 1), 'application/json');
    if (kind === 'print') { // G2: relatório via api-core (KPIs da tela + sinal satélite)
      const per = st.src === 'replay' ? 'Replay do teste gravado' : ($('fPeriod').selectedOptions[0] || {}).textContent;
      A.printReport('Rastreador NTN: relatório de conectividade', A.kpisFromDom('#kpis'), '#satChart svg, #satChart canvas', { period: per + ' · ' + rs.length + ' mensagens', version: (document.querySelector('.foot, footer') || {}).textContent || '' });
    }
  }

  // ---------- eventos de UI ----------
  document.querySelectorAll('#srcSeg button').forEach((b) => b.onclick = async () => { st.src = b.dataset.src; stopReplay(); rpCursor = null; fitted = false; if (st.src === 'replay') await loadReplay(); render(); });
  document.querySelectorAll('#fNet button').forEach((b) => b.onclick = () => { st.net = b.dataset.net; save(); render(); });
  document.querySelectorAll('#fPos button').forEach((b) => b.onclick = () => { st.pos = b.dataset.pos; save(); render(); });
  [['lgNet', 'net'], ['lgTr', 'tr']].forEach(([id, k]) => document.querySelectorAll('#' + id + ' button').forEach((b) => b.onclick = () => { lg[k] = b.dataset.v; document.querySelectorAll('#' + id + ' button').forEach((x) => x.classList.toggle('on', x === b)); render(); }));
  $('lgLate').onchange = (e) => { lg.late = e.target.checked; render(); };
  $('lgQ').oninput = (e) => { lg.q = e.target.value; render(); };
  $('lgCsv').onclick = () => { // G2: CSV do log completo via api-core (BOM, ';', BRT)
    const rows = lgRows.map(({ r, lat }) => ({ ts: r.ts, rx: r.rx, seq: r.seq, net: r.net, deliveredNet: r.deliveredNet, deliveredHow: r.deliveredHow, transport: r.transport || 'https', type: r.type, desc: lgDesc(r), bytes: r.bytes, latMs: lat, late: r.late }));
    const cols = ['ts', 'rx', 'seq', 'net', 'deliveredNet', 'deliveredHow', 'transport', 'type', 'desc', 'bytes', 'latMs', 'late'];
    const lab = { ts: 'criada (BRT)', rx: 'chegada (BRT)', net: 'rede_criacao', deliveredNet: 'rede_entrega', deliveredHow: 'rede_entrega_fonte', transport: 'transporte', type: 'tipo', desc: 'descricao', latMs: 'latencia_ms', late: 'atraso_s' };
    download('ntn-log-completo-' + new Date().toISOString().slice(0, 16).replace(/[:T]/g, '') + '.csv', window.ApiCore.toCSV(rows, cols, lab), 'text/csv;charset=utf-8');
  };
  $('fPeriod').onchange = (e) => { st.period = e.target.value; save(); fitted = false; render(); };
  $('fSw').onchange = (e) => { st.sw = e.target.checked; save(); render(); };
  $('rpPlay').onclick = playReplay;
  $('btnExport').onclick = () => ($('exportMenu').hidden = !$('exportMenu').hidden);
  $('exportMenu').onclick = (e) => { const k = e.target.dataset.x; if (k) { $('exportMenu').hidden = true; doExport(k); } };

  // ---------- exportar log (CSV ; com BOM + JSON), respeita filtros/periodo da vista ----------
  if ($('btnExportLog')) $('btnExportLog').onclick = () => {
    const rs = view();
    const pref = ['ts', 'rx', 'type', 'event', 'seq', 'net', 'txNet', 'transport', 'lat', 'lon', 'acc', 'posSrc', 'gnssAge', 'gnssSats', 'prevRttMs', 'late', 'bytes', 'satOp', 'satTac', 'satCell', 'regSecs', 'rsrp', 'snr', 'plmn'];
    const keys = new Set(); rs.forEach((r) => Object.keys(r || {}).forEach((k) => keys.add(k)));
    const cols = [...pref.filter((k) => keys.has(k)), ...[...keys].filter((k) => !pref.includes(k)).sort()];
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '');
    download(`ntn-log-${stamp}.csv`, window.ApiCore.toCSV(rs, cols.filter((k) => !['iccid', 'imsi', 'cell', 'satCell'].includes(k)), { ts: 'hora_local_sp', rx: 'chegada_local_sp' }), 'text/csv;charset=utf-8'); // G2: privacidade via api-core
    setTimeout(() => download(`ntn-log-${stamp}.json`, JSON.stringify({ schema: 'ntn-log/1', exportedAt: new Date().toISOString(), filtros: { periodo: st.period, rede: st.net, pos: st.pos }, total: rs.length, records: rs }, null, 1), 'application/json'), 400);
  };
  // F1: botão único de Modo Apresentação (tela cheia + layout compacto); ao ativar inicia o replay real de 14/10
  if (window.Apresentacao) window.Apresentacao.init({ onStart: async () => {
    stopReplay(); st.src = 'replay'; rpCursor = null; fitted = false;
    try { await loadReplay(); render(); playReplay(); } catch (e) { console.warn('replay', e); }
  } });
  if (params.get('present') === '1' && window.Apresentacao) window.Apresentacao.on(true);

  (async () => {
    if (st.src === 'replay') await loadReplay();
    await loadLive();
    render();
    // A2: versão do painel (constante PANEL_VERSION) e firmware da aplicação (campo 'app'
    // da telemetria, enviado pelo firmware). Se o campo ainda não existe nos dados, exibe
    // "sem dados" — nunca um valor inventado. O modem (mfw_nrf9151-ntn_1.0.1) já está
    // fixo no rodapé e vem do evento boot.info; não duplicar aqui.
    const appRec = [...live].reverse().find((r) => r.app);
    const appVer = appRec ? (/^v/i.test(appRec.app) ? appRec.app : 'v' + appRec.app) : 'sem dados';
    const pv = $('footPanelVer'); if (pv) pv.textContent = 'v' + PANEL_VERSION;
    const av = $('footAppVer');   if (av) av.textContent = appVer;
    // A3: Poll 15 s intencional: permite que a troca de rede (Cat-M para NTN e volta)
    // apareça rapidamente na demo ao vivo. Utilities usa 30 s (suficiente para o medidor).
    // Consumo usa 45 s (dados historicos, sem urgencia de tempo real).
    setInterval(loadLive, 15000);
  })();
  window.__ntnPro = { st, render, get live() { return live; } };
})();
