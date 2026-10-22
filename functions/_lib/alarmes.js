// Alarmes: catálogo de gatilhos por sistema, avaliação, anti-repetição e e-mail resumido (Resend).
// Segredos esperados (Pages): RESEND_API_KEY, ALARMES_CRON_TOKEN; opcional ALARMES_FROM. Nada disso fica no repo.
export const DESTINO = 'guilhermeromionetto@gmail.com';
export const CHAVE = 'alarmes:regras';
export const SISTEMAS = {
  thingy91x: { nome: 'Thingy:91X (Fink)', gatilhos: ['sem_posicao', 'cerca_saida', 'cerca_entrada', 'velocidade', 'bateria'] },
  ntn: { nome: 'Rastreador NTN (nRF9151)', gatilhos: ['sem_posicao', 'cerca_saida', 'cerca_entrada', 'velocidade'] },
  utilities: { nome: 'Utilities (medidor NTN)', gatilhos: ['sem_leitura', 'consumo_acima', 'consumo_anomalo'] },
  consumo: { nome: 'Consumo de dados', gatilhos: ['dados_acima', 'consumo_anomalo'] }
};
export const GATILHOS = {
  sem_posicao: { nome: 'Sem posição há mais de', unidade: 'min' },
  sem_leitura: { nome: 'Sem leitura há mais de', unidade: 'min' },
  velocidade: { nome: 'Velocidade acima de', unidade: 'km/h' },
  bateria: { nome: 'Bateria abaixo de', unidade: 'V' },
  consumo_acima: { nome: 'Consumo acima de', unidade: 'm³/dia' },
  dados_acima: { nome: 'Dados acima de', unidade: 'MB/dia' },
  consumo_anomalo: { nome: 'Consumo anômalo', unidade: '' },
  cerca_saida: { nome: 'Saída da cerca', unidade: '' },
  cerca_entrada: { nome: 'Entrada na cerca', unidade: '' }
};
export function validar(r) {
  const s = SISTEMAS[r.sistema];
  if (!s || !s.gatilhos.includes(r.gatilho)) return 'sistema ou gatilho inválido';
  if (!r.nome || String(r.nome).length > 80) return 'nome obrigatório (até 80)';
  const cerca = r.gatilho.startsWith('cerca_');
  if (cerca) {
    const c = r.cerca || {};
    if (c.tipo === 'circulo') { if (![c.lat, c.lon, c.raio].every(Number.isFinite) || c.raio < 20) return 'cerca: centro e raio (mín. 20 m)'; }
    else if (c.tipo === 'poligono') { if (!Array.isArray(c.pontos) || c.pontos.length < 3) return 'cerca: polígono com 3 pontos ou mais'; }
    else return 'cerca: tipo inválido';
  } else if (GATILHOS[r.gatilho].unidade && !Number.isFinite(Number(r.limite))) return 'limite numérico obrigatório';
  return null;
}
export function distM(a, b) {
  const R = 6371000, t = Math.PI / 180, dl = (b.lat - a.lat) * t, dn = (b.lon - a.lon) * t;
  const h = Math.sin(dl / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dn / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function dentroPoli(p, pts) {
  let d = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i], b = pts[j];
    if ((a.lat > p.lat) !== (b.lat > p.lat) && p.lon < ((b.lon - a.lon) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lon) d = !d;
  }
  return d;
}
// Distância aproximada até a borda (m). Positivo = fora.
export function foraDaCerca(p, c) {
  if (c.tipo === 'circulo') return distM(p, c) - c.raio;
  const dentro = dentroPoli(p, c.pontos);
  const min = Math.min(...c.pontos.map((q) => distM(p, q)));
  return dentro ? -min : min;
}
export const aprox = (m) => (m >= 1000 ? `cerca de ${(m / 1000).toFixed(m >= 1e5 ? 0 : 1).replace('.', ',')} km` : `cerca de ${Math.max(10, Math.round(m / 10) * 10)} m`);
export const brt = (ms) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) + ' (BRT)';
// Avalia uma regra contra uma leitura { ts, lat, lon, vel_kmh, bateria_v, valor, anomalo }. Retorna { disparou, valor } ou null se sem dado.
export function avaliar(r, d, agora = Date.now()) {
  if (!d) return null;
  const L = Number(r.limite);
  switch (r.gatilho) {
    case 'sem_posicao': case 'sem_leitura': { if (!d.ts) return null; const min = Math.round((agora - d.ts) / 60000); return { disparou: min > L, valor: `${min} min sem dado (limite ${L} min)` }; }
    case 'velocidade': return d.vel_kmh == null ? null : { disparou: d.vel_kmh > L, valor: `${Math.round(d.vel_kmh)} km/h (limite ${L} km/h)` };
    case 'bateria': return d.bateria_v == null ? null : { disparou: d.bateria_v < L, valor: `${d.bateria_v.toFixed(2).replace('.', ',')} V (limite ${L} V)` };
    case 'consumo_acima': case 'dados_acima': return d.valor == null ? null : { disparou: d.valor > L, valor: `${d.valor} ${GATILHOS[r.gatilho].unidade} (limite ${L})` };
    case 'consumo_anomalo': return d.anomalo == null ? null : { disparou: !!d.anomalo, valor: 'Consumo anômalo detectado' };
    case 'cerca_saida': case 'cerca_entrada': {
      if (d.lat == null) return null;
      const m = foraDaCerca(d, r.cerca), fora = m > 0;
      return { disparou: r.gatilho === 'cerca_saida' ? fora : !fora, valor: fora ? `fora da cerca "${r.cerca.nome || r.nome}", ${aprox(m)} da borda` : `dentro da cerca "${r.cerca.nome || r.nome}"` };
    }
  }
  return null;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// itens: [{ sistema, regra, quando, valor }]
export function emailHtml(itens, teste) {
  const linhas = itens.map((i) => `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb"><b style="color:#b91c1c">${esc(i.regra)}</b><br><span style="color:#6b7280">${esc(i.sistema)}</span><br><a href="${BASE}${PAINEL[chaveSis(i.sistema)] || '/app/'}" style="color:#1d4ed8">Abrir painel</a></td><td style="padding:10px;border-bottom:1px solid #e5e7eb">${esc(i.quando)}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb">${esc(i.valor)}</td></tr>`).join('');
  return `<div style="font-family:Arial,sans-serif;max-width:640px;color:#111827">${teste ? '<p style="background:#dbeafe;color:#1e40af;padding:8px 12px;border-radius:6px"><b>TESTE</b>: e-mail de validação do formato. Os valores abaixo são dados de exemplo.</p>' : ''}<h2 style="margin:8px 0">IoT Cat-M + NTN: alarme disparado</h2><table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="background:#f3f4f6;text-align:left"><th style="padding:10px">O que disparou</th><th style="padding:10px">Quando</th><th style="padding:10px">Valor</th></tr>${linhas}</table><p style="color:#6b7280;font-size:12px">Relatório em PDF anexo. Gerencie em https://ntn-plataforma.pages.dev/alarmes/</p></div>`;
}
export async function enviar(env, assunto, html, anexos) {
  if (!env.RESEND_API_KEY) return { ok: false, falta: 'RESEND_API_KEY' };
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.ALARMES_FROM || 'IoT Cat-M + NTN <onboarding@resend.dev>', to: [DESTINO], subject: assunto, html, ...(anexos ? { attachments: anexos } : {}) })
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, id: j.id || null, erro: r.ok ? null : j.message || 'falha' };
}

export const BASE = 'https://ntn-plataforma.pages.dev';
export const PAINEL = { thingy91x: '/rastreador/thingy91x/', ntn: '/ntn/', utilities: '/utilities/', consumo: '/consumo/' };
const chaveSis = (nome) => Object.keys(SISTEMAS).find((k) => SISTEMAS[k].nome === nome);
// PDF mínimo (A4, Helvetica WinAnsi), sem dependências. linhas: [{ t, tam, cor:[r,g,b] }]
export function pdfBase64(linhas) {
  const pe = (s) => String(s).replace(/[^\x20-\xff]/g, ' ').replace(/[\\()]/g, (c) => '\\' + c);
  let y = 800, ops = '';
  for (const l of linhas) {
    const tam = l.tam || 11; if (l.esp) y -= l.esp;
    const c = l.cor || [0.07, 0.09, 0.15];
    ops += `BT /F1 ${tam} Tf ${c.join(' ')} rg 50 ${y} Td (${pe(l.t)}) Tj ET\n`;
    y -= tam + 6; if (y < 50) break;
  }
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${ops.length} >>\nstream\n${ops}endstream`, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'];
  let pdf = '%PDF-1.4\n', off = [];
  objs.forEach((o, i) => { off.push(pdf.length); pdf += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const x = pdf.length;
  pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${x}\n%%EOF`;
  let bin = ''; for (let i = 0; i < pdf.length; i++) bin += String.fromCharCode(pdf.charCodeAt(i) & 255);
  return btoa(bin);
}
export function relatorioPdf(itens, teste, agora = Date.now()) {
  const L = [{ t: 'IoT Cat-M + NTN', tam: 20, cor: [0.11, 0.31, 0.85] }, { t: 'Tecnologia  |  Relatório de alarme', tam: 11, cor: [0.42, 0.45, 0.5] }, { t: 'Gerado em ' + brt(agora), tam: 10, cor: [0.42, 0.45, 0.5] }];
  if (teste) L.push({ t: 'TESTE: Dados de exemplo', tam: 13, cor: [0.11, 0.31, 0.85], esp: 8 });
  const porSis = {};
  itens.forEach((i) => { (porSis[i.sistema] = porSis[i.sistema] || []).push(i); });
  for (const s of Object.keys(porSis)) {
    L.push({ t: s, tam: 14, esp: 12 });
    for (const i of porSis[s]) { L.push({ t: 'Alarme: ' + i.regra, cor: [0.73, 0.11, 0.11] }); L.push({ t: 'Quando: ' + i.quando }); L.push({ t: 'Valor: ' + i.valor }); if (i.resumo) i.resumo.forEach((r) => L.push({ t: r, tam: 10, cor: [0.42, 0.45, 0.5] })); }
    L.push({ t: 'Painel: ' + BASE + (PAINEL[chaveSis(s)] || '/app/'), tam: 10, cor: [0.11, 0.31, 0.85] });
  }
  L.push({ t: 'Sem coordenadas exatas, identificadores completos ou custos neste relatório.', tam: 9, cor: [0.42, 0.45, 0.5], esp: 14 });
  return pdfBase64(L);
}
