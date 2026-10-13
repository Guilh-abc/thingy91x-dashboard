/* v43: cartao Conectividade & SIM */
(function () {
  const STAT = { 0: 'Não registrado, sem procurar (rádio parado ou SIM ausente)', 1: 'Registrado na rede local', 2: 'Procurando rede…', 3: 'Registro NEGADO pela rede', 4: 'Sem cobertura / estado desconhecido', 5: 'Registrado em roaming', 90: 'Falha no SIM (não lido / ausente)' };
  const EMM = { 2: 'IMSI desconhecido no HLR — SIM não ativado/provisionado. Pedir à Telekom para ativar o SIM.', 3: 'Equipamento ilegal — SIM bloqueado ou IMEI barrado. Pedir à Telekom para checar bloqueio.', 6: 'Equipamento ilegal (IMEI). Checar com a operadora.', 7: 'Serviço LTE/EPS não permitido no plano. Pedir habilitação de LTE-M/EPS.', 8: 'EPS e não-EPS não permitidos. Checar plano.', 11: 'Operadora (PLMN) não permitida — sem acordo de roaming. Pedir roaming no Brasil (Vivo/Claro/TIM).', 12: 'Área (TA) não permitida.', 13: 'Roaming não permitido nesta área. Pedir habilitação de roaming no Brasil.', 14: 'EPS não permitido nesta operadora. Pedir LTE-M na rede visitada.', 15: 'Nenhuma célula adequada nesta área (tecnologia/banda).', 22: 'Congestionamento — tentar mais tarde.' };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const t = (s) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const KEEP = ['sim', 'reg', 'lost', 'rej', 'apn', 'rst', 'boot', 'wdog', 'fail'];
  function desc(e) {
    if (e.event === 'sim') { const pin = /pin (\S+)/.exec(e.info || '')?.[1]; return (STAT[e.value] || 'CEREG ' + e.value) + (pin && pin !== 'READY' ? ' · SIM pede ' + pin + ' (PIN/PUK)' : ''); }
    if (e.event === 'rej') return 'Rejeitado, causa ' + e.value + ': ' + (EMM[e.value] || 'ver 3GPP TS 24.301');
    if (e.event === 'reg') return 'Registrou ' + (e.info || '');
    if (e.event === 'lost') return 'Perdeu registro ' + (e.info || '');
    if (e.event === 'apn') return 'APN alterado: ' + (e.info || '');
    return (e.event) + ' ' + (e.info || '');
  }
  window.drawSim = function (all) {
    if (!$('simCard')) return;
    const evs = all.filter((r) => r.type === 'event' && KEEP.includes(r.event));
    const seen = new Set(); const h = evs.filter((e) => { const k = e.seq + e.event + e.ts + e.info; if (seen.has(k)) return false; seen.add(k); return true; });
    const last = [...h].reverse().find((e) => e.event === 'sim');
    const tel = [...all].reverse().find((r) => r.plmn || r.rsrp != null);
    const lastRej = [...h].reverse().find((e) => e.event === 'rej');
    const info = last?.info || '';
    const g = (re) => re.exec(info)?.[1] || '—';
    const ok = last && (last.value === 1 || last.value === 5);
    $('simState').innerHTML = last ? `<b style="color:${ok ? '#3ddc84' : '#ff6b6b'}">${esc(STAT[last.value] || 'CEREG ' + last.value)}</b> <span class="muted">(${t(last.ts)})</span>` : 'Sem relatório de SIM ainda (requer app v2.4).';
    $('simGrid').innerHTML = [['ICCID', '…' + g(/ic\*?(\S+)/)], ['IMSI', g(/im(\S+)/)], ['PIN (CPIN)', g(/pin (\S+)/)], ['%XSIM', g(/xs (\S+)/)], ['Operadora (PLMN)', tel?.plmn || '—'], ['Tecnologia', tel?.act === 7 ? 'LTE-M' : tel?.act === 9 ? 'NB-IoT' : tel?.act ?? '—'], ['Banda', tel?.band || '—'], ['RSRP', tel?.rsrp != null ? tel.rsrp + ' dBm' : '—'], ['Rede', tel?.net || '—'], ['Rede satélite', (() => { const rr = [...all].reverse(); const k = rr.find((r) => r.satOp || (r.net === 'ntn' && r.plmn)); if (k && window.ntnSatName) return 'Satélite · ' + window.ntnSatName(k).t + (k.regSecs != null ? ' · registro ' + k.regSecs + ' s' : '') + (k.satTac ? ' · TAC ' + k.satTac : '') + (k.satCell ? ' · cel ' + k.satCell : ''); return rr.some((r) => r.deliveredNet === 'ntn') ? 'Satélite · Skylo (90198) (inferido)' : 'sem uso de satélite ainda'; })()], ['Última rejeição', lastRej ? 'causa ' + lastRej.value + ' (' + t(lastRej.ts) + ')' : 'nenhuma']]
      .map(([k, v]) => `<div><span class="muted">${k}</span><br><b class="mono">${esc(v)}</b></div>`).join('');
    $('simHint').innerHTML = lastRej && !ok ? esc(EMM[lastRej.value] || '') : ok ? 'SIM ativo e registrado. APN/IP: veja o log serial (linhas SIM/SIMJ).' : last?.value === 90 ? 'SIM não lido: verificar encaixe/contatos do SIM.' : '';
    $('simHist').innerHTML = h.slice(-40).reverse().map((e) => `<tr><td class="mono">${t(e.ts)}</td><td>${esc(e.event)}</td><td>${esc(desc(e))}</td></tr>`).join('') || '<tr><td colspan=3 class="muted">sem eventos</td></tr>';
  };
})();
