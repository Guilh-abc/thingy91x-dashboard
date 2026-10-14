/* Connect Utilities v1 — so dados reais do medidor (ntn-lab ?meter=1). Sem simulacao. */
(function () {
  const onNetlify = /netlify\.app$/.test(location.hostname);
  const API = (onNetlify ? '' : 'https://thingy91x-x-dashboard.netlify.app') + '/.netlify/functions/ntn-lab?meter=1&days=62';
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dmy = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const ago = (t) => { const s = Math.round((Date.now() - Date.parse(t)) / 1000); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; };
  const m3 = (L) => (L / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  const netOf = (r) => r.txNet || (r.transport === 'udp' ? 'ntn' : 'catm');
  const SAT = { '90198': 'Skylo' };
  const tag = (n, r) => { if (n !== 'ntn') return '<span class="tag catm">Cat-M</span>'; const op = (r && (r.satOp || SAT[r.plmn])) || null;
    return `<span class="tag ntn">Satélite · ${op ? op + (r.plmn ? ' (' + r.plmn + ')' : '') : 'Skylo'}</span>${op ? '' : ' <small class="muted">(inferido)</small>'}`; };
  const AL = { leak: ['💧', 'Vazamento', 'Fluxo contínuo detectado ou alarme de vazamento acionado.'], tamper: ['🔓', 'Violação', 'Tentativa de violação do medidor.'], anom: ['📈', 'Consumo anômalo', 'Consumo por hora acima do limite configurado.'], lowbat: ['🔋', 'Bateria baixa', 'Tensão abaixo do limite.'] };
  const empty = (t) => `<div class="empty-st">${t}</div>`;
  let recs = [], agg = 'h', map, mk;
  $('tariff').value = localStorage.getItem('cu.tariff') || '';
  $('tariff').addEventListener('input', () => { localStorage.setItem('cu.tariff', $('tariff').value); render(); });
  document.querySelectorAll('#aggSeg button').forEach((b) => b.addEventListener('click', () => { agg = b.dataset.a; document.querySelectorAll('#aggSeg button').forEach((x) => x.classList.toggle('on', x === b)); render(); }));

  function dial(L) {
    const s = L == null ? '-----.---' : (L / 1000).toFixed(3).padStart(9, '0');
    $('dial').innerHTML = [...s].map((c, i) => c === '.' ? '<span class="dot">,</span>' : `<span class="${i > s.indexOf('.') ? 'dec' : ''}">${c}</span>`).join('');
  }
  function buckets(rd) {
    const key = (t) => { const d = new Date(t); return agg === 'h' ? d.toISOString().slice(0, 13) : agg === 'd' ? d.toLocaleDateString('sv-SE') : d.toLocaleDateString('sv-SE').slice(0, 7); };
    const m = new Map();
    for (let i = 1; i < rd.length; i++) { const d = rd[i].totalL - rd[i - 1].totalL; if (d < 0) continue; const k = key(rd[i].ts); m.set(k, (m.get(k) || 0) + d); }
    const arr = [...m.entries()].sort();
    return agg === 'h' ? arr.slice(-48) : agg === 'd' ? arr.slice(-31) : arr.slice(-12);
  }
  function chart(rd) {
    const b = buckets(rd);
    if (!b.length) return empty(rd.length ? 'Precisa de pelo menos 2 leituras para calcular o consumo.' : 'Aguardando a primeira leitura do medidor.');
    const W = 640, H = 220, L = 40, B = 26, mx = Math.max(...b.map((x) => x[1]), 10), bw = (W - L - 8) / b.length;
    let g = '';
    for (let k = 0; k <= 4; k++) { const v = (mx * k) / 4, y = H - B - (v / mx) * (H - B - 10); g += `<line x1="${L}" x2="${W}" y1="${y}" y2="${y}" stroke="#ffffff10"/><text x="${L - 5}" y="${y + 4}" font-size="10" fill="#8e9ab5" text-anchor="end">${Math.round(v)}</text>`; }
    b.forEach(([k, v], i) => { const h = (v / mx) * (H - B - 10), x = L + i * bw + 2;
      g += `<rect x="${x}" y="${H - B - h}" width="${Math.max(2, bw - 4)}" height="${h}" rx="3" fill="url(#ug)"><title>${k}: ${v} L</title></rect>`;
      if (b.length <= 16 || i % Math.ceil(b.length / 12) === 0) g += `<text x="${x + bw / 2 - 2}" y="${H - 8}" font-size="9.5" fill="#8e9ab5" text-anchor="middle">${agg === 'h' ? k.slice(11) + 'h' : agg === 'd' ? k.slice(8) + '/' + k.slice(5, 7) : k.slice(5) + '/' + k.slice(2, 4)}</text>`; });
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%"><defs><linearGradient id="ug" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3d8bff"/><stop offset="1" stop-color="#a45cff"/></linearGradient></defs>${g}<text x="${L}" y="9" font-size="10" fill="#8e9ab5">litros</text></svg>`;
  }
  function render() {
    const rs = [...recs].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const rd = rs.filter((r) => r.type === 'telemetry' && r.totalL != null);
    const al = rs.filter((r) => r.type === 'alarm');
    const last = rd[rd.length - 1], any = rs[rs.length - 1];
    $('waitBanner').hidden = rs.length > 0;
    const st1 = [...rs].reverse().find((r) => r.type === 'event' && r.event === 'stest');
    const tOn = st1 && st1.value === 1;
    $('testPill').hidden = !tOn; if (tOn) $('testPill').textContent = 'Modo teste satélite ativo desde ' + dmy(st1.ts) + ' · leitura a cada 2 min';
    if (rs.length && !rd.length) { $('waitBanner').hidden = false; $('waitBanner').textContent = 'A placa já se comunicou, mas ainda não enviou nenhuma leitura de consumo.'; }
    dial(last ? last.totalL : null);
    $('mLiters').textContent = last ? last.totalL.toLocaleString('pt-BR') + ' L' : 'aguardando primeira leitura';
    $('mAge').textContent = last ? 'leitura há ' + ago(last.rx || last.ts) : '';
    $('mSince').textContent = rd.length ? rd.length + ' leitura(s) desde ' + dmy(rd[0].ts) : '';
    const tel = [...rs].reverse().find((r) => r.type === 'telemetry');
    const st = [['Última comunicação', any ? 'há ' + ago(any.rx || any.ts) : '—'], ['Rede', tel ? tag(netOf(tel), tel) : '—'], ['Sinal', tel?.rsrp != null ? tel.rsrp + ' dBm' : '—'],
      ['Operadora (PLMN)', tel?.plmn || '—'], ['Bateria', tel?.mv != null ? (tel.mv / 1000).toFixed(2) + ' V' : '—'], ['Alertas ativos (24 h)', al.filter((a) => Date.now() - Date.parse(a.ts) < 86400000).length || (rs.length ? '0' : '—')]];
    $('statGrid').innerHTML = st.map(([k, v]) => `<div><small class="muted">${k}</small><b>${v}</b></div>`).join('');
    $('chart').innerHTML = chart(rd);
    $('alCount').textContent = al.length ? al.length : '';
    $('alerts').innerHTML = al.length ? al.slice(-30).reverse().map((a) => { const d = AL[a.event] || ['⚠️', a.event, '']; return `<div class="al"><i>${d[0]}</i><div><b>${esc(d[1])}</b> <span class="muted">${dmy(a.ts)} · ${tag(netOf(a))}</span><br><small class="muted">${esc(d[2])}${a.totalL != null ? ' Total ' + m3(a.totalL) + ' m³.' : ''}</small></div></div>`; }).join('')
      : empty('Nenhum alerta recebido. Os alertas monitorados são: vazamento, consumo anômalo, violação e bateria baixa.');
    const pos = [...rs].reverse().find((r) => r.lat != null && r.lon != null);
    if (!map) { map = L.map('map', { zoomControl: true }).setView([-15.8, -47.9], 3); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18, attribution: '© OpenStreetMap' }).addTo(map); }
    if (pos) { const ll = [pos.lat, pos.lon]; if (!mk) { mk = L.marker(ll, { icon: L.divIcon({ className: '', iconSize: [28, 28], iconAnchor: [14, 14], html: '<div style="width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#3d8bff,#a45cff);border:2px solid #fff;display:grid;place-items:center">💧</div>' }) }).addTo(map); map.setView(ll, 16); } else mk.setLatLng(ll);
      $('posInfo').textContent = 'posição ' + (pos.posSrc || '') + ' (arredondada ~100 m)'; }
    else $('posInfo').textContent = 'aguardando posição (GNSS fixa uma vez na instalação)';
    const sim = [...rs].reverse().find((r) => r.type === 'event' && r.event === 'sim');
    const reg = [...rs].reverse().find((r) => r.type === 'event' && (r.event === 'reg' || r.event === 'lost'));
    $('simState').innerHTML = sim ? `<span class="muted">${dmy(sim.ts)}</span>` : '';
    $('simGrid').innerHTML = rs.length ? [['SIM', sim ? esc((/ic\*?(\S+)/.exec(sim.info || '') || [])[1] ? '…' + /ic\*?(\S+)/.exec(sim.info)[1] : '—') : '—'], ['PIN', sim ? esc((/pin (\S+)/.exec(sim.info || '') || [])[1] || '—') : '—'], ['Registro', reg ? (reg.event === 'reg' ? 'registrado' : 'perdeu registro') + ' · ' + dmy(reg.ts) : '—'],
      ['Tecnologia', tel?.act === 7 ? 'LTE-M' : tel?.act === 14 ? 'NB-IoT NTN' : tel?.act ?? '—'], ['Banda', tel?.band || '—'], ['SNR', tel?.snr != null ? tel.snr + ' dB' : '—']].map(([k, v]) => `<div><small class="muted">${k}</small><br><b>${v}</b></div>`).join('')
      : empty('Sem dados do SIM ainda. A placa reporta SIM, registro e sinal assim que se conectar.');
    const t = parseFloat($('tariff').value);
    const months = new Map(); rd.forEach((r) => { const k = new Date(r.ts).toLocaleDateString('sv-SE').slice(0, 7); const m = months.get(k) || { a: r.totalL, b: r.totalL, n: 0 }; m.b = r.totalL; m.n++; months.set(k, m); });
    $('billBody').innerHTML = months.size ? [...months.entries()].reverse().map(([k, m]) => { const c = Math.max(0, m.b - m.a); return `<tr><td>${k.slice(5)}/${k.slice(0, 4)}</td><td class="mono">${m3(m.a)} m³</td><td class="mono">${m3(m.b)} m³</td><td>${m3(c)} m³</td><td>${Number.isFinite(t) ? (c / 1000 * t).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : 'informe a tarifa'}</td><td>${m.n}</td></tr>`; }).join('')
      : '<tr><td colspan="6" class="muted">Aguardando a primeira leitura do medidor.</td></tr>';
    $('rdCount').textContent = rs.length ? rs.length + ' registro(s)' : '';
    $('rdBody').innerHTML = rs.length ? rs.slice(-500).reverse().map((r) => `<tr><td class="mono">${dmy(r.ts)}</td><td>${r.seq ?? '—'}</td><td>${r.type === 'telemetry' ? 'leitura' : r.type === 'alarm' ? 'alarme ' + esc((AL[r.event] || [, r.event])[1]) : 'evento ' + esc(r.event || r.type)}</td><td>${tag(netOf(r), r)}${r.tm ? ' <span class="chip ntn">teste</span>' : ''}${r.transport === 'udp' ? ' <small class="muted">UDP</small>' : ''}</td><td class="mono">${r.totalL != null ? m3(r.totalL) + ' m³' : '—'}</td><td>${r.deltaL != null ? r.deltaL + ' L' : '—'}</td><td>${r.rsrp != null ? r.rsrp + ' dBm' : '—'}</td><td>${r.late > 0 ? 'atrasada ' + r.late + ' s' : 'tempo real'}</td></tr>`).join('')
      : '<tr><td colspan="8" class="muted">Aguardando a primeira leitura do medidor.</td></tr>';
    if (window.drawSatLive) window.drawSatLive(rs);
    $('foot').textContent = 'Connect Utilities · dados reais do medidor m1 · atualiza a cada 30 s · posição pública arredondada (~100 m)';
  }
  async function load() { try { const r = await fetch(API + '&t=' + Date.now(), { cache: 'no-store' }); const j = await r.json(); if (j && Array.isArray(j.records)) recs = j.records; } catch (e) { console.warn('utilities: falha ao carregar', e); } render(); }
  load(); setInterval(load, 30000);
})();
