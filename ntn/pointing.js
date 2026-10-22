/* Connect: cartao "Apontamento do satelite" (Skylo GEO). Usa a ultima posicao enviada pela placa. */
(function () {
  // Candidatos (Skylo no Brasil usa a frota L-band da Viasat/Inmarsat, banda 255). Mais provavel: I-4 F3 (AMER).
  const SATS = [
    { id: 'i4f3', name: 'Inmarsat-4 F3 (AMER)', lon: -97.65, prob: 'mais provável' },
    { id: 'i3f5', name: 'Inmarsat-3 F5 (AOR)', lon: -54.0, prob: 'alternativa' },
    { id: 'alpha', name: 'Alphasat (EMEA)', lon: 25.0, prob: 'improvável no Brasil' },
  ];
  // Declinacao magnetica aproximada (WMM, 2025-2026), graus (+E / -W); interpolacao por distancia inversa. Precisao ~±2°.
  const DECL = [[-23.55, -46.63, -21.9], [-22.9, -43.2, -23.5], [-15.8, -47.9, -22.0], [-30.0, -51.2, -17.0], [-3.1, -60.0, -15.5], [-8.05, -34.9, -22.8], [-1.45, -48.5, -21.0],
    [-15.6, -56.1, -17.0], [-25.4, -49.3, -19.5], [-12.97, -38.5, -23.5], [-3.7, -38.5, -22.5], [4.6, -74.1, -8.0], [-33.4, -70.6, 0.5], [-34.6, -58.4, -9.6], [-12.0, -77.0, -3.0], [-16.5, -68.1, -10.5], [-25.3, -57.6, -14.5]];
  function decl(lat, lon) {
    let ws = 0, s = 0;
    for (const [a, b, d] of DECL) { const dd = (a - lat) ** 2 + ((b - lon) * Math.cos(lat * Math.PI / 180)) ** 2; if (dd < 1e-6) return d; const w = 1 / dd; ws += w; s += w * d; }
    return s / ws;
  }
  function look(lat, lon, slon) {
    const R = 6378.137, Rs = 42164.0, toR = Math.PI / 180;
    const phi = lat * toR, dl = (slon - lon) * toR;
    const cosg = Math.cos(phi) * Math.cos(dl);
    const el = Math.atan((cosg - R / Rs) / Math.sqrt(1 - cosg * cosg)) / toR;
    let az = Math.atan2(Math.sin(dl), -Math.sin(phi) * Math.cos(dl)) / toR; // de norte verdadeiro, horario
    az = (az + 360) % 360;
    // atan2(sin dl, -sin phi cos dl) da o azimute a partir do norte; no hemisferio sul -sin(phi)>0
    return { az, el };
  }
  const card = (k) => ['N', 'NNE', 'NE', 'ENE', 'L', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'][Math.round(k / 22.5) % 16];
  const ago = (t) => { const s = Math.round((Date.now() - Date.parse(t)) / 1000); return s < 90 ? s + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : s < 172800 ? Math.round(s / 3600) + ' h' : Math.round(s / 86400) + ' d'; };
  const st = {};
  function compass(az, el, heading) {
    const rot = heading == null ? 0 : -heading;
    let g = `<g transform="rotate(${rot} 100 100)"><circle cx="100" cy="100" r="88" fill="#0d1322" stroke="#26304a" stroke-width="2"/>`;
    for (let a = 0; a < 360; a += 15) { const r1 = a % 90 ? 80 : 74, x1 = 100 + r1 * Math.sin(a * Math.PI / 180), y1 = 100 - r1 * Math.cos(a * Math.PI / 180), x2 = 100 + 88 * Math.sin(a * Math.PI / 180), y2 = 100 - 88 * Math.cos(a * Math.PI / 180); g += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#3b4a70" stroke-width="${a % 90 ? 1 : 2}"/>`; }
    [['N', 0], ['L', 90], ['S', 180], ['O', 270]].forEach(([t, a]) => { g += `<text x="${100 + 64 * Math.sin(a * Math.PI / 180)}" y="${104 - 64 * Math.cos(a * Math.PI / 180)}" text-anchor="middle" font-size="13" font-weight="700" fill="${t === 'N' ? '#ff5470' : '#8e9ab5'}">${t}</text>`; });
    const rr = 80 * (1 - Math.max(0, el) / 90) + 8, sx = 100 + rr * Math.sin(az * Math.PI / 180), sy = 100 - rr * Math.cos(az * Math.PI / 180);
    g += `<line x1="100" y1="100" x2="${sx}" y2="${sy}" stroke="url(#pg)" stroke-width="4" stroke-linecap="round"/><circle cx="${sx}" cy="${sy}" r="9" fill="#a45cff" stroke="#fff" stroke-width="2"/><text x="${sx}" y="${sy + 3.5}" text-anchor="middle" font-size="9">🛰</text></g>`;
    if (heading != null) g += '<path d="M100 6 l7 14 h-14z" fill="#fff"/>';
    return `<svg viewBox="0 0 200 200" style="width:100%;max-width:230px"><defs><linearGradient id="pg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3d8bff"/><stop offset="1" stop-color="#a45cff"/></linearGradient></defs><circle cx="100" cy="100" r="3" fill="#fff"/>${g}</svg>`;
  }
  function render(id, recs) {
    const el = document.getElementById(id); if (!el) return;
    const s = st[id] || (st[id] = { sat: 'i4f3', heading: null });
    const rs = [...(recs || [])].sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const p = [...rs].reverse().find((r) => r.lat != null && r.lon != null && r.posSrc === 'gnss') || [...rs].reverse().find((r) => r.lat != null && r.lon != null);
    if (!p) { el.innerHTML = '<div class="empty-st">Aguardando uma posição enviada pela placa (fix GNSS) para calcular o apontamento.</div>'; return; }
    const sat = SATS.find((x) => x.id === s.sat) || SATS[0];
    const { az, el: elev } = look(p.lat, p.lon, sat.lon), d = decl(p.lat, p.lon), azm = (az - d + 360) % 360;
    const rel = s.heading != null ? ((az - s.heading + 540) % 360) - 180 : null;
    el.innerHTML = `<div class="pt-wrap"><div class="pt-c">${compass(az, elev, s.heading)}</div><div class="pt-i">
      <div class="seg pt-sats">${SATS.map((x) => `<button data-s="${x.id}" class="${x.id === sat.id ? 'on' : ''}" title="${x.lon}°">${x.name.split(' (')[0]}</button>`).join('')}</div>
      <div class="pt-kv"><div><small class="muted">Satélite</small><b>${sat.name}</b><span class="muted">${Math.abs(sat.lon)}° ${sat.lon < 0 ? 'O' : 'L'} · ${sat.prob}</span></div>
      <div><small class="muted">Azimute verdadeiro</small><b>${az.toFixed(1)}° ${card(az)}</b></div>
      <div><small class="muted">Azimute magnético</small><b>${azm.toFixed(1)}°</b><span class="muted">declinação ${d.toFixed(1)}° (aprox. ±2°)</span></div>
      <div><small class="muted">Elevação</small><b style="color:${elev < 10 ? '#ff5470' : elev < 25 ? '#ff8a8a' : '#2fd27a'}">${elev.toFixed(1)}°</b><span class="muted">${elev < 0 ? 'abaixo do horizonte' : elev < 15 ? 'baixa, precisa de horizonte livre' : 'acima do horizonte'}</span></div>
      <div><small class="muted">Posição usada</small><b class="mono">${p.lat.toFixed(3)}, ${p.lon.toFixed(3)}</b><span class="muted">${esc(p.posSrc || '')} · há ${ago(p.rx || p.ts)} (arredondada ~100 m)</span></div></div>
      <div class="pt-tip">Aponte a face da antena para <b>${card(azm)} magnético (${azm.toFixed(0)}° na bússola)</b>, inclinada ${elev.toFixed(0)}° acima do horizonte. Evite prédios, paredes, árvores ou telhados nessa direção.</div>
      <div class="pt-dev"><button class="btn sm" data-dev="1">${s.heading == null ? '🧭 Usar a bússola do celular' : '🧭 Bússola do celular ativa'}</button>
      <span class="muted">${rel == null ? 'opcional, no celular: gira a bússola conforme você vira o aparelho' : Math.abs(rel) < 5 ? '✅ alinhado com o satélite' : 'vire ' + Math.abs(rel).toFixed(0) + '° para a ' + (rel > 0 ? 'direita' : 'esquerda')}</span></div></div></div>`;
    el.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => { s.sat = b.dataset.s; render(id, recs); }));
    const dev = el.querySelector('[data-dev]');
    dev.addEventListener('click', async () => {
      try { if (typeof DeviceOrientationEvent !== 'undefined' && DeviceOrientationEvent.requestPermission) { const r = await DeviceOrientationEvent.requestPermission(); if (r !== 'granted') return; } } catch (e) { return; }
      if (s.listening) return; s.listening = true; let lastT = 0;
      const h = (e) => { let hd = e.webkitCompassHeading != null ? e.webkitCompassHeading : e.absolute && e.alpha != null ? (360 - e.alpha) % 360 : null; if (hd == null) return;
        s.heading = (hd + d + 360) % 360; /* bussola magnetica -> verdadeiro */ if (Date.now() - lastT > 250) { lastT = Date.now(); render(id, recs); } };
      window.addEventListener('deviceorientationabsolute', h); window.addEventListener('deviceorientation', h);
    });
  }
  const esc = (x) => String(x ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  window.Pointing = { render, look, decl, SATS };
  const css = document.createElement('style');
  css.textContent = '.pt-wrap{display:grid;grid-template-columns:240px 1fr;gap:16px;align-items:center}.pt-kv{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:10px 0}.pt-kv>div{display:flex;flex-direction:column;background:var(--card2);border:1px solid var(--line);border-radius:12px;padding:8px 12px}.pt-kv b{font-size:17px}.pt-tip{padding:10px 12px;border-radius:10px;background:#ff8a8a14;border:1px solid #ff8a8a55;color:#ffd27a}.pt-dev{display:flex;gap:10px;align-items:center;margin-top:10px;flex-wrap:wrap}.pt-sats button{font-size:12px}@media(max-width:800px){.pt-wrap{grid-template-columns:1fr}}';
  document.head.appendChild(css);
})();
