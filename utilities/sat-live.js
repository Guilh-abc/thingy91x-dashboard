/* Connect Utilities: cartao "Satelite ao vivo" (so dados reais do medidor) */
(function () {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const dmy = (t) => new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dur = (s) => (s == null ? '—' : s < 90 ? Math.round(s) + ' s' : s < 5400 ? Math.round(s / 60) + ' min' : (s / 3600).toFixed(1) + ' h');
  const SAT = { '90198': 'Skylo' };
  const STEPS = ['GNSS posição', 'Buscando Skylo', 'Registrado', 'Enviando', 'Voltou ao Cat-M'];
  const T = (r) => Date.parse(r.ts);
  window.drawSatLive = function (recs) {
    recs = (recs || []).filter((r) => !r.fakeNtn && !(r.net === 'ntn' && r.plmn && r.plmn !== '90198'));
    if (!$('slCard')) return;
    const rs = [...recs].sort((a, b) => T(a) - T(b));
    const ev = (r, e) => r.type === 'event' && r.event === e;
    const sws = rs.filter((r) => ev(r, 'sw'));
    const lastSw = sws[sws.length - 1];
    const ntnStart = [...sws].reverse().find((r) => r.value === 1);
    const after = (t) => rs.filter((r) => T(r) >= t);
    let step = -1, note = '';
    const V14 = ['sat_start', 'gnss_ok', 'gnss_fail', 'sat_search', 'sat_reg', 'sat_lost', 'back_catm'];
    const ses = [...rs].reverse().find((r) => ev(r, 'sat_start'));
    let v14 = false;
    if (ses) { v14 = true;
      const seg = after(T(ses)), f = (e) => [...seg].reverse().find((r) => ev(r, e));
      const g = f('gnss_ok') || f('gnss_fail'), se = f('sat_search'), rg = f('sat_reg'), ls = f('sat_lost'), bk = f('back_catm');
      const tx = seg.filter((r) => r.type === 'telemetry' && r.net === 'ntn');
      const ago = (r) => Math.round((Date.now() - Date.parse(r.rx || r.ts)) / 60000) + ' min';
      if (bk) { step = 4; note = `Voltou ao Cat-M (${esc(bk.info || '')}) — registrado ${bk.value >= 0 ? bk.value + '%' : '—'} do tempo em satélite.`; }
      else if (ls && (!rg || T(ls) > T(rg))) { step = 1; note = 'Perdeu o registro no Skylo e está procurando de novo (o aviso chegou quando houve conexão).'; }
      else if (rg) { step = tx.length && T(tx[tx.length - 1]) > T(rg) ? 3 : 2; note = `Registrado no Skylo em ${dur(rg.value)}${rg.rsrp != null ? ` · RSRP ${rg.rsrp} dBm · SNR ${rg.snr ?? '—'} dB` : ''}. ${tx.length ? 'Leituras chegando pelo satélite (última há ' + ago(tx[tx.length - 1]) + ').' : 'Aguardando a primeira leitura pelo satélite.'}`; }
      else if (se) { step = 1; note = `GNSS ${g && g.event === 'gnss_ok' ? 'ok (' + esc(g.info || '') + ', ' + dur(g.value) + ')' : 'sem fix — usando posição salva'}; buscando Skylo desde ${dmy(se.rx || se.ts)} (há ${ago(se)}). Nada chega até registrar.`; }
      else if (g) { step = 0; note = g.event === 'gnss_ok' ? 'GNSS ok, ligando o rádio satélite.' : 'GNSS sem fix.'; }
      else { step = 0; note = `Teste satélite iniciado em ${dmy(ses.rx || ses.ts)}: buscando posição GNSS (até 5 min).`; }
    }
    const last = rs[rs.length - 1];
    if (v14) {} else if (!ntnStart) { note = rs.length ? 'O medidor ainda não entrou em modo satélite (nenhum evento de troca para NTN recebido).' : 'Aguardando os primeiros dados do medidor.'; }
    else {
      const seg = after(T(ntnStart));
      const back = seg.find((r) => ev(r, 'sw') && r.value === 0);
      const reg = seg.find((r) => ev(r, 'reg') && /NTN/.test(r.info || '') && (!back || T(r) < T(back)));
      const tx = seg.filter((r) => r.net === 'ntn' && r.type === 'telemetry' && (!back || T(r) < T(back)));
      if (back) step = 4; else if (tx.length && Date.now() - Date.parse(tx[tx.length - 1].rx || tx[tx.length - 1].ts) < 5 * 60000) step = 3; else if (reg) step = 2; else step = 1;
      if (step === 1) note = 'Em NTN e ainda sem registro: a placa está no fix GNSS ou procurando o satélite Skylo. Ela não transmite nada até registrar, então o painel só sabe que entrou em NTN; as duas etapas não são distinguíveis pelos dados atuais.';
    }
    const ntnPending = last && last.net !== 'ntn' && !(lastSw && lastSw.value === 1) && (Date.now() - Date.parse(last.rx || last.ts) > 5 * 60000);
    if (ntnPending && !v14) note = `Sem notícias desde ${dmy(last.rx || last.ts)}. Se o medidor entrou no modo teste satélite (B4 3 s), os eventos ficam na fila da placa até registrar no Skylo ou voltar ao Cat-M.`;
    $('slSteps').innerHTML = STEPS.map((s, i) => `<div class="sl-step ${i < step || (step === 4 && i === 4) ? 'done' : i === step ? 'cur' : ''}${step === 1 && i === 0 ? ' cur' : ''}"><span>${i + 1}</span>${s}</div>`).join('');
    $('slNote').innerHTML = note;
    const ntnTel = rs.filter((r) => r.type === 'telemetry' && r.net === 'ntn');
    const lt = ntnTel[ntnTel.length - 1];
    const regs = rs.filter((r) => (ev(r, 'reg') && /NTN/.test(r.info || '')) || (ev(r, 'lost') && r.net === 'ntn') || ev(r, 'sw') || ev(r, 'stest') || (r.type === 'event' && V14.includes(r.event)) || r.type === 'satsum');
    const lastReg = [...regs].reverse().find((r) => r.event === 'reg');
    const sr = [...rs].reverse().find((r) => ev(r, 'sat_reg'));
    const op = lt ? lt.satOp || SAT[lt.plmn] || null : null;
    const kv = [['Operadora', !lt && sr ? `${sr.satOp || 'Skylo'} (${sr.plmn || '90198'})` : lt ? (op ? `${op} (${lt.plmn})` : lt.plmn || '—') : 'Skylo (90198) — ainda sem registro deste medidor'],
      ['RSRP', lt?.rsrp != null ? lt.rsrp + ' dBm' : sr?.rsrp != null ? sr.rsrp + ' dBm (no registro)' : '—'], ['SNR', lt?.snr != null ? lt.snr + ' dB' : sr?.snr != null ? sr.snr + ' dB (no registro)' : '—'],
      ['TAC / célula', !(lt && (lt.satTac || lt.satCell)) && sr ? `${sr.satTac || '—'} / ${sr.satCell || '—'}` : lt && (lt.satTac || lt.satCell) ? `${lt.satTac || '—'} / ${lt.satCell || '—'}` : '—'],
      ['Tempo até registrar', sr ? dur(sr.value) : lastReg ? dur(lastReg.value) : lt?.regSecs != null ? dur(lt.regSecs) : '—'],
      ['Última leitura via satélite', lt ? `${dmy(lt.ts)} · total ${lt.totalL != null ? (lt.totalL / 1000).toFixed(3).replace('.', ',') + ' m³' : '—'}` : 'nenhuma ainda']];
    $('slGrid').innerHTML = kv.map(([k, v]) => `<div><small class="muted">${k}</small><br><b>${esc(v)}</b></div>`).join('');
    // mini grafico: RSRP/SNR das leituras NTN + detalhe do lote (t:d), quando existir
    const pts = ntnTel.filter((r) => r.rsrp != null).map((r) => ({ t: T(r), r: r.rsrp, q: r.snr }));
    rs.filter((r) => r.type === 'satdet').forEach((d) => { const s = rs.find((x) => x.type === 'satsum' && x.sess === d.sess); const t0 = s ? T(s) - (s.dur || 0) * 1000 : T(d);
      (d.pts || []).forEach((p) => { if (p.rsrp != null) pts.push({ t: t0 + p.t * 1000, r: p.rsrp, q: p.snr }); }); });
    rs.filter((r) => ev(r, 'sat_reg') && r.rsrp != null).forEach((r) => pts.push({ t: T(r), r: r.rsrp, q: r.snr }));
    pts.sort((a, b) => a.t - b.t);
    if (!pts.length) $('slChart').innerHTML = '<div class="empty-st">Sem medições de sinal do satélite ainda. Aparecem quando o medidor registrar no Skylo (leituras a cada 2 min) ou no lote enviado ao voltar ao Cat-M.</div>';
    else { const W = 640, H = 150, L = 36, B = 20, t0 = pts[0].t, t1 = Math.max(pts[pts.length - 1].t, t0 + 60000);
      const lo = Math.min(-140, ...pts.map((p) => p.r)), hi = Math.max(-90, ...pts.map((p) => p.r));
      const x = (t) => L + ((t - t0) / (t1 - t0)) * (W - L - 8), y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (H - B - 8);
      let g = ''; for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) g += `<line x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}" stroke="#ffffff10"/><text x="${L - 4}" y="${y(v) + 3}" font-size="9" fill="#8e9ab5" text-anchor="end">${v}</text>`;
      g += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + x(p.t).toFixed(1) + ' ' + y(p.r).toFixed(1)).join('')}" fill="none" stroke="#3d8bff" stroke-width="2"/>`;
      pts.forEach((p) => (g += `<circle cx="${x(p.t)}" cy="${y(p.r)}" r="2.5" fill="#3d8bff"><title>${dmy(p.t)} RSRP ${p.r} dBm SNR ${p.q ?? '—'} dB</title></circle>`));
      g += `<text x="${L}" y="${H - 4}" font-size="9" fill="#8e9ab5">${dmy(t0)}</text><text x="${W - 8}" y="${H - 4}" font-size="9" fill="#8e9ab5" text-anchor="end">${dmy(t1)}</text>`;
      $('slChart').innerHTML = `<svg viewBox="0 0 ${W} ${H}" style="width:100%">${g}</svg>`; }
    const L14 = { sat_start: () => 'teste satélite iniciado (Cat-M)', gnss_ok: (r) => 'GNSS ok em ' + dur(r.value) + ' · ' + esc(r.info || ''), gnss_fail: (r) => '<span style="color:#ffb547">GNSS sem fix</span> · ' + esc(r.info || ''),
      sat_search: () => 'buscando Skylo', sat_reg: (r) => `<span style="color:#2fd27a">registrou no Skylo</span> em ${dur(r.value)}${r.rsrp != null ? ' · ' + r.rsrp + ' dBm / ' + (r.snr ?? '—') + ' dB' : ''}${r.satTac ? ' · TAC ' + esc(r.satTac) : ''}`,
      sat_lost: (r) => '<span style="color:#ff5470">perdeu o Skylo</span>' + (r.value >= 0 ? ` (${r.value}% registrado)` : ''), back_catm: (r) => 'voltou ao Cat-M' + (r.value >= 0 ? ` · ${r.value}% registrado` : '') };
    const lbl = (r) => r.type === 'satsum' ? `resumo${r.why ? ' (' + r.why + ')' : ''}: ${r.samples ?? 0} amostras, RSRP ${r.rsrpMin ?? '—'}…${r.rsrpMax ?? '—'} (méd ${r.rsrpAvg ?? '—'}) dBm, ${r.regPct ?? 0}% registrado` : L14[r.event] ? L14[r.event](r) : r.event === 'reg'  ? `<span style="color:#2fd27a">registrou no satélite</span> em ${dur(r.value)}` : r.event === 'lost' ? '<span style="color:#ff5470">perdeu o satélite</span>' : r.event === 'stest' ? (r.value ? 'modo teste satélite LIGADO' : 'modo teste satélite DESLIGADO') : r.value === 1 ? 'entrou em NTN (' + esc(r.info || '') + ')' : 'voltou ao Cat-M (' + esc(r.info || '') + ')';
    $('slHist').innerHTML = regs.length ? regs.slice(-30).reverse().map((r) => `<tr><td class="mono">${dmy(r.ts)}</td><td>${lbl(r)}</td></tr>`).join('') : '<tr><td colspan="2" class="muted">Nenhuma troca de rede ou registro no satélite recebido ainda.</td></tr>';
  };
})();
