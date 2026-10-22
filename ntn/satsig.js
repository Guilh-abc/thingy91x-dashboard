/* v47: Sinal satélite — sessões NTN (resumo 't:g' + detalhe 't:d') */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dmy = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const dur = (s) => (s == null ? '—' : s < 90 ? s + ' s' : Math.round(s / 60) + ' min');
  const band = (st) => (st === 1 || st === 5 ? 'reg' : st === 2 ? 'busca' : 'perdido');
  const BC = { reg: '#2fd27a', busca: '#ff8a8a', perdido: '#ff5470' };
  let sel = null;
  function sessions(all) {
    const m = new Map();
    for (const r of all) {
      if ((r.type !== 'satsum' && r.type !== 'satdet') || r.sess == null) continue;
      const s = m.get(r.sess) || { id: r.sess, sum: null, pts: new Map() };
      if (r.type === 'satsum') { if (!s.sum || (r.dur ?? 0) >= (s.sum.dur ?? 0)) s.sum = r; }
      else for (const p of r.pts || []) s.pts.set(p.t, p);
      m.set(r.sess, s);
    }
    return [...m.values()].map((s) => ({ ...s, pts: [...s.pts.values()].sort((a, b) => a.t - b.t), t0: s.sum ? Date.parse(s.sum.ts) - (s.sum.dur || 0) * 1000 : null }))
      .sort((a, b) => (b.t0 || 0) - (a.t0 || 0));
  }
  function chart(s) {
    const W = 900, H = 230, L = 44, R = 40, T = 12, B = 34, pts = s.pts;
    if (!pts.length) return '<div class="muted" style="padding:20px">Sem detalhe desta sessão (o lote chega via Cat-M ao final).</div>';
    const tmax = Math.max(pts[pts.length - 1].t, s.sum?.dur || 0, 60);
    const x = (t) => L + (t / tmax) * (W - L - R);
    const rv = pts.map((p) => p.rsrp).filter((v) => v != null), qv = pts.map((p) => p.snr).filter((v) => v != null);
    const rlo = Math.min(-140, ...rv), rhi = Math.max(-90, ...rv), qlo = Math.min(-10, ...qv), qhi = Math.max(15, ...qv);
    const yr = (v) => T + (1 - (v - rlo) / (rhi - rlo)) * (H - T - B), yq = (v) => T + (1 - (v - qlo) / (qhi - qlo)) * (H - T - B);
    let g = '';
    pts.forEach((p, i) => { const x1 = x(p.t), x2 = i + 1 < pts.length ? x(pts[i + 1].t) : x(Math.min(p.t + 30, tmax));
      g += `<rect x="${x1}" y="${H - B + 6}" width="${Math.max(1, x2 - x1)}" height="10" fill="${BC[band(p.st)]}"><title>${dur(p.t)} · CEREG ${p.st}</title></rect>`; });
    for (let v = Math.ceil(rlo / 10) * 10; v <= rhi; v += 10) g += `<line x1="${L}" x2="${W - R}" y1="${yr(v)}" y2="${yr(v)}" stroke="#ffffff12"/><text x="${L - 6}" y="${yr(v) + 4}" text-anchor="end" font-size="10" fill="#8e9ab5">${v}</text>`;
    const path = (k, y) => { let d = '', pen = false; pts.forEach((p) => { if (p[k] == null) { pen = false; return; } d += (pen ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p[k]).toFixed(1); pen = true; }); return d; };
    g += `<path d="${path('rsrp', yr)}" fill="none" stroke="#a45cff" stroke-width="2.2"/><path d="${path('snr', yq)}" fill="none" stroke="#3d8bff" stroke-width="1.6" stroke-dasharray="4 3"/>`;
    pts.forEach((p) => { if (p.rsrp != null) g += `<circle cx="${x(p.t)}" cy="${yr(p.rsrp)}" r="2.6" fill="#a45cff"><title>${dur(p.t)}: RSRP ${p.rsrp} dBm · SNR ${p.snr ?? '—'} dB · CEREG ${p.st}</title></circle>`; });
    if (s.sum?.tReg != null) g += `<line x1="${x(s.sum.tReg)}" x2="${x(s.sum.tReg)}" y1="${T}" y2="${H - B}" stroke="#2fd27a" stroke-dasharray="3 3"/><text x="${x(s.sum.tReg) + 4}" y="${T + 10}" font-size="10" fill="#2fd27a">registrou ${dur(s.sum.tReg)}</text>`;
    for (let k = 0; k <= 4; k++) { const t = (tmax * k) / 4; g += `<text x="${x(t)}" y="${H - 2}" text-anchor="middle" font-size="10" fill="#8e9ab5">${dur(Math.round(t))}</text>`; }
    for (let v = Math.ceil(qlo / 5) * 5; v <= qhi; v += 5) g += `<text x="${W - R + 6}" y="${yq(v) + 4}" font-size="10" fill="#3d8bff">${v}</text>`;
    return `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto">${g}</svg>`;
  }
  window.drawSatSig = function (all) {
    if (!$('satCard')) return;
    const ss = sessions(all);
    $('satCount').textContent = ss.length ? ss.length + ' sessão(ões)' : '';
    if (!ss.length) { $('satChart').innerHTML = '<div class="muted" style="padding:16px">Nenhuma sessão de sinal satélite ainda. Use a sonda: <code>python3 app_cmd.py probe 20</code> ou segure o botão 4 por 3 s, em céu aberto.</div>'; $('satBody').innerHTML = ''; return; }
    if (sel == null || !ss.find((s) => s.id === sel)) sel = ss[0].id;
    const cur = ss.find((s) => s.id === sel);
    $('satChart').innerHTML = chart(cur);
    $('satBody').innerHTML = ss.map((s) => { const u = s.sum || {};
      const f = (a, b, c) => (a == null ? '—' : `${a} / ${c ?? '—'} / ${b ?? '—'}`);
      return `<tr data-s="${s.id}" style="cursor:pointer${s.id === sel ? ';background:rgba(164,92,255,.16)' : ''}"><td class="mono">${s.t0 ? dmy(s.t0) : '—'}</td><td>${u.probe ? '<span class="chip ntn">sonda</span>' : 'NTN'}</td><td>${esc(u.satOp ? u.satOp + ' (' + u.plmn + ')' : u.plmn || '—')}</td><td>${dur(u.dur)}</td><td>${u.samples ?? s.pts.length}</td><td class="mono">${f(u.rsrpMin, u.rsrpMax, u.rsrpAvg)}</td><td class="mono">${f(u.snrMin, u.snrMax, u.snrAvg)}</td><td>${u.regPct != null ? u.regPct + '%' : '—'}</td><td>${u.tReg != null ? dur(u.tReg) : 'não registrou'}</td><td>${u.rej != null ? 'causa ' + u.rej : '—'}</td></tr>`; }).join('');
    $('satBody').querySelectorAll('tr').forEach((tr) => tr.addEventListener('click', () => { sel = +tr.dataset.s; window.drawSatSig(all); }));
  };
})();
