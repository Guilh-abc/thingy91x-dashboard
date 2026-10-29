/**
 * nRF9151 NTN Lab (v35) — armazena/serve o resumo sanitizado dos testes Cat-M / NTN.
 * GET  /.netlify/functions/ntn-lab   -> { ok, data, storedAt }   (público; dados já sanitizados no Mac)
 * POST /.netlify/functions/ntn-lab   -> grava (Authorization: Bearer $NTN_LAB_WRITE_TOKEN)
 * POST /.netlify/functions/ntn-lab?ping=1 -> mensagem de teste da placa (Bearer $NTN_LAB_DEVICE_TOKEN, <=256 B)
 * v36 POST ?ingest=1 -> telemetria/eventos da placa (app v2.0, Bearer $NTN_LAB_DEVICE_TOKEN, <=256 B) em Blobs por dia
 * v36 GET  ?pro=1[&days=N]  -> historico publico sanitizado (posicao arredondada ~100 m) para o Painel Pro
 * Defesa em profundidade: rejeita payload > 256 KB e mascara qualquer sequência de 15+ dígitos (ICCID/IMSI/IMEI).
 */
import { getStore } from '@netlify/blobs';
import { timingSafeEqual, createHash } from 'node:crypto';

const MAX_BYTES = 256 * 1024;
const KEY = 'latest';
const PINGS = 'pings';
const MAX_PINGS = 60;
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Cache-Control': 'no-store',
};
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' } });

function tokenOk(header, envName = 'NTN_LAB_WRITE_TOKEN') {
  const want = process.env[envName] || '';
  const got = String(header || '').replace(/^Bearer\s+/i, '');
  if (!want || want.length < 24 || !got) return false;
  const a = createHash('sha256').update(want).digest();
  const b = createHash('sha256').update(got).digest();
  return timingSafeEqual(a, b);
}
function scrub(text) {
  return text.replace(/\d{15,22}/g, (m) => m.slice(0, 5) + '*'.repeat(m.length - 9) + m.slice(-4));
}

const DAY_MAX = 5000;
const dayKey = (iso) => 'pro/' + iso.slice(0, 10);
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v, n = 16) => (typeof v === 'string' ? v.slice(0, n) : null);
const r3 = (v) => (num(v) != null && v !== 0 ? Math.round(v * 1000) / 1000 : null);
/** Normaliza uma mensagem compacta da placa (app v2.0). Exportado para testes. */
export function normalizeIngest(m, rawLen, rxIso, trHint) {
  if (!m || typeof m !== 'object') return null;
  const type = m.t === 'e' ? 'event' : m.t === 'm' ? 'telemetry' : m.t === 'g' ? 'satsum' : m.t === 'd' ? 'satdet' : m.t === 'a' ? 'alarm' : null;
  if (!type) return null;
  const late = Math.max(0, num(m.l) || 0);
  const k = Array.isArray(m.k) ? m.k.map((x) => num(x) ?? 0) : null;
  const rec = {
    type, rx: rxIso, ts: new Date(Date.parse(rxIso) - late * 1000).toISOString(), late, bytes: rawLen,
    seq: num(m.s), up: num(m.u), net: m.n === 'n' ? 'ntn' : m.n === 'c' ? 'catm' : null,
    lat: num(m.la), lon: num(m.lo), acc: num(m.ac), posSrc: ({ g: 'gnss', s: 'salva', i: 'injetada', c: 'celula' })[m.ps] || null,
    gnssAge: num(m.gf), gnssSats: num(m.gv), cell: str(m.cl, 32),
    prevRttMs: num(m.pr) != null && m.pr >= 0 ? m.pr : null,
    transport: m.tr === 'u' || trHint === 'udp' ? 'udp' : 'https',
    txNet: m.tx === 'n' ? 'ntn' : m.tx === 'c' ? 'catm' : null,
    satOp: str(m.op, 16) || null, satTac: str(m.tc, 12) || null, satCell: str(m.ci, 12) || null, regSecs: num(m.rt),
  };
  if (rec.lat === 0 && rec.lon === 0) { rec.lat = null; rec.lon = null; }
  if (type === 'telemetry') Object.assign(rec, {
    plmn: str(m.p, 8), act: num(m.a), band: str(m.b, 6) || null, rsrp: num(m.r) === 999 ? null : num(m.r), snr: num(m.q) === 999 ? null : num(m.q),
    ce: num(m.c) != null && m.c >= 0 ? m.c : null, mv: num(m.v) != null && m.v >= 0 ? m.v : null, temp: num(m.T) === -99 ? null : num(m.T), regFor: num(m.rg),
    totalL: num(m.L), deltaL: num(m.dL), tm: m.tm === 1 ? 1 : undefined,
    counters: k ? { tries: k[0], ok: k[1], fail: k[2], switches: k[3] } : null,
    failReasons: Array.isArray(m.f) ? { wait: num(m.f[0]) ?? 0, dns: num(m.f[1]) ?? 0, timeout: num(m.f[2]) ?? 0, other: num(m.f[3]) ?? 0 } : null,
  });
  else if (type === 'alarm') Object.assign(rec, { event: str(m.e, 12), value: num(m.x), totalL: num(m.L) });
  else if (type === 'satsum') { const tr3 = (x) => (Array.isArray(x) ? x.slice(0, 3).map((v) => (num(v) === 999 ? null : num(v))) : [null, null, null]);
    const [rmin, rmax, ravg] = tr3(m.rm), [qmin, qmax, qavg] = tr3(m.qm);
    Object.assign(rec, { sess: num(m.id), samples: num(m.k), rsrpMin: rmin, rsrpMax: rmax, rsrpAvg: ravg, snrMin: qmin, snrMax: qmax, snrAvg: qavg,
      regPct: num(m.rp), tReg: num(m.tr) != null && m.tr >= 0 ? m.tr : null, dur: num(m.d), rej: num(m.rj) != null && m.rj >= 0 ? m.rj : null, probe: m.sp === 1, plmn: str(m.p, 8), satOp: str(m.op, 16) || null, why: ({ c: 'back_catm', l: 'sat_lost', t: '20min', n: 'nova' })[m.w] || null }); }
  else if (type === 'satdet') { const v = String(m.v || '').slice(0, 400).split(';').map((x) => x.split(',').map(Number)).filter((a) => a.length === 4 && a.every(Number.isFinite))
      .map(([t, r, q, st]) => ({ t, rsrp: r === 999 ? null : r, snr: q === 127 ? null : q, st }));
    Object.assign(rec, { sess: num(m.id), off: num(m.o), pts: v }); }
  else Object.assign(rec, { event: str(m.e, 12), value: num(m.x), info: str(m.i, 40), pressTotal: num(m.bc), firstAgoS: num(m.fa), ntnBytes: num(m.nb), ntnMsgs: num(m.nm), ...(m.p ? { plmn: str(m.p, 8), act: num(m.a) } : {}), ...(num(m.r) != null ? { rsrp: m.r === 999 ? null : num(m.r), snr: m.q === 999 ? null : num(m.q) } : {}) });
  return rec;
}
/** v71: duplicata = mesmo seq+tipo E mesmo boot. O boot é identificado pelo uptime (up): após reboot o uptime
    reinicia e a placa reenvia seq antigos, que são dados novos e não podem ser descartados. Sem uptime, compara o ts
    (reenvio idêntico tem o mesmo ts, tolerância de 2 min pelo atraso declarado). Exportado para testes. */
export function isDup(list, rec) {
  if (rec.seq == null) return false;
  return list.some((x) => x.seq === rec.seq && x.type === rec.type && (x.dv || null) === (rec.dv || null) &&
    (rec.up != null && x.up != null ? x.up === rec.up : Math.abs(Date.parse(x.ts) - Date.parse(rec.ts)) < 120000));
}
/** v71: filtro incremental ?since=<ISO>: só registros recebidos (rx) depois de since. Exportado para testes. */
export function sinceFilter(records, since) {
  const t = Date.parse(since || '');
  if (!Number.isFinite(t)) return records;
  return records.filter((r) => Date.parse(r.rx || r.ts) > t);
}
/** v71: leitura local (leitor serial do Mac, fonte=usb). Aceita a linha crua do firmware 1.7 ou campos.
    Retorna o registro com rx do servidor, ou null se inválido. Exportado para testes. */
export const LOCAL_ESTADOS = ['CATM', 'SINCRONIA', 'BUSCA', 'REGISTRADO', 'ENVIO', 'FALHA'];
export function normalizeLocal(m, rxIso) {
  if (!m || typeof m !== 'object') return null;
  let estado = null, rsrp, nivel = null, up = num(m.up);
  const linha = typeof m.linha === 'string' ? m.linha.trim().slice(0, 120) : '';
  if (linha) {
    const p = linha.split('|');
    if (p[0] !== 'APP' || p.length < 4) return null;
    if (up == null && /^\d+$/.test(p[1])) up = +p[1];
    if (p[2] === 'STATE') estado = String(p[3]).trim().toUpperCase();
    else if (p[2] === 'SIG') {
      const r = /rsrp=(-?\d+|NA)/i.exec(p[3]), n = /nivel=([A-Z]+)/i.exec(p[3]);
      if (!r) return null;
      rsrp = /NA/i.test(r[1]) ? null : +r[1]; nivel = n ? n[1].toUpperCase() : null;
    } else return null;
  } else {
    if (m.estado != null) estado = String(m.estado).toUpperCase();
    if ('rsrp' in m) rsrp = m.rsrp === 'NA' || m.rsrp === null ? null : num(m.rsrp);
    if (m.nivel != null) nivel = String(m.nivel).toUpperCase();
  }
  if (estado != null && !LOCAL_ESTADOS.includes(estado)) return null;
  if (nivel != null && !['FRACO', 'MEDIO', 'FORTE', 'NA'].includes(nivel)) return null;
  if (rsrp !== undefined && rsrp !== null && (rsrp > -40 || rsrp < -160)) return null;
  if (estado == null && rsrp === undefined) return null;
  const rec = { type: 'local', fonte: 'usb', rx: rxIso, ts: rxIso, up };
  if (estado) rec.estado = estado;
  if (rsrp !== undefined) { rec.rsrp = rsrp; rec.nivel = rsrp === null ? 'NA' : nivel === 'NA' ? null : nivel; }
  if (typeof m.dv === 'string' && /^m[0-9a-z]{1,7}$/.test(m.dv)) rec.dv = m.dv;
  return rec;
}
const LOCAL_MAX = 2000, LOCAL_JANELA_MS = 2 * 3600000;

/* ---------- v72: comando "Migrar para satélite" (sat-cmd) ----------
   Usuário logado no Pages (Cloudflare Access) cria o comando; o _middleware.js do Pages valida a sessão e repassa
   com X-NTN-Proxy (segredo compartilhado NTN_PROXY_TOKEN), X-NTN-User e X-NTN-Role. O token da placa NÃO serve aqui.
   Ciclo: pendente -> entregue (na resposta de um ingest Cat-M) -> recebido (cmd_rx x:1) ou recusado (cmd_rx x:0, final).
   pendente sem entrega por 10 min -> expirado. Cancelar só enquanto pendente. */
/** fw 1.9: mensagens do medidor podem vir sem dv. Único ponto do mapeamento token do medidor -> dv.
    Só vale para METER_DEVICE_TOKEN; o token do rastreador nunca ganha dv de medidor por omissão. */
export const METER_DV_PADRAO = 'm1';
export function meterDevDe(dv, tokenMedidor) {
  if (typeof dv === 'string' && /^m[0-9a-z]{1,7}$/.test(dv)) return dv;
  return tokenMedidor ? METER_DV_PADRAO : null;
}
export const CMD_TTL_MS = 10 * 60000;
const CMD_KEY = 'cmd/atual', CMD_HIST = 'cmd/hist';
export const CMD_FINAIS = ['cancelado', 'expirado', 'recebido', 'recusado', 'sem_resposta', 'cancelado_offline', 'encerrado_catm', 'encerrado_reboot'];

/* ---------- v75: placa sem comunicação (nuvem ou USB local) ----------
   Preguiçoso e idempotente, avaliado nas leituras ?meter=1 e ?cmd=1 (como o sem_resposta).
   Limiar: 5 min em busca/teste satélite; 2,5x o intervalo mediano de telemetria (padrão 2 min) em Cat-M.
   Confirmado o offline: grava um evento de servidor {type:'event',event:'off_end',srv:1,info:'encerrada: offline'}
   que fecha a sessão de busca, e o comando pendente/entregue vira 'cancelado_offline' (final, libera novo). */
export const OFF_BUSCA_MS = 5 * 60000, OFF_IV_PADRAO_MS = 2 * 60000;
const tRx = (r) => Date.parse(r.rx || r.ts) || 0;
/** Timeout de 20 min do fw 2.1: {t:'e',s,u,n:'n'|'c',e:'fail',x:1200,i:'ntn timeout'} (x em segundos; aceita ntn_timeout e satsum w:'t'). */
export const TIMEOUT_RE = /ntn[ _]timeout/i;
export function ehTimeoutNtn(r) { return !!r && ((r.type === 'event' && r.event === 'fail' && TIMEOUT_RE.test(r.info || '')) || (r.type === 'satsum' && r.why === '20min')); }
export function emBuscaSrv(recs) {
  const rs = recs.slice().sort((a, b) => tRx(a) - tRx(b));
  for (let i = rs.length - 1; i >= 0; i--) {
    const r = rs[i], e = r.event, st = String(r.estado || '').toUpperCase();
    if (r.srv) { if (e === 'off_end') return false; continue; }
    if (ehTimeoutNtn(r)) return false;
    if (r.type === 'local') { if (['BUSCA', 'SINCRONIA', 'REGISTRADO', 'ENVIO'].includes(st)) return true; if (st === 'CATM') return false; continue; }
    if (r.type === 'telemetry') { if (r.net === 'ntn' || r.txNet === 'ntn' || r.transport === 'udp') return true; if (r.net === 'catm') return false; continue; }
    if (['sat_start', 'sat_search', 'sat_reg', 'wait'].includes(e) || ((e === 'stest' || e === 'sw') && r.value === 1)) return true;
    if (e === 'back_catm' || e === 'boot' || ((e === 'stest' || e === 'sw') && r.value === 0)) return false;
  }
  return false;
}
/** Avaliação pura. recs = registros do medidor (nuvem) + locais (USB). Ignora registros de servidor (srv). */
export function offlineAvalia(recs, now = Date.now()) {
  const dev = (recs || []).filter((r) => !r.srv && tRx(r));
  if (!dev.length) return { offline: false, lastRx: null };
  const lastRx = Math.max(...dev.map(tRx)), busca = emBuscaSrv(recs); // off_end (srv) fecha a busca
  const tel = dev.filter((r) => r.type === 'telemetry').map(tRx).sort((a, b) => a - b), ivs = [];
  for (let i = 1; i < tel.length; i++) { const d = tel[i] - tel[i - 1]; if (d > 30000 && d < 30 * 60000) ivs.push(d); }
  ivs.sort((a, b) => a - b);
  const iv = ivs.length ? ivs[ivs.length >> 1] : OFF_IV_PADRAO_MS, limMs = busca ? OFF_BUSCA_MS : Math.round(2.5 * iv);
  return { offline: now - lastRx > limMs, lastRx, busca, limMs, offEm: lastRx + limMs };
}
/* v75: comando recebido (cmd_rx x:1) encerra, preguiçoso e idempotente:
   boot novo (event boot ou uptime menor que o do cmd_rx) => 'encerrado_reboot';
   STATE CATM no USB, timeout ntn, back_catm => 'encerrado_catm';
   prova de migração = STATE BUSCA/SINCRONIA no USB ou sat_start/stest depois do cmd_rx. Telemetria Cat-M encerra só
   se vier mais de 2 min depois da prova (a fila do fw sai pelo Cat-M logo após o cmd_rx), ou mais de 5 min depois do cmd_rx sem prova. */
export const FIM_POS_MIGRACAO_MS = 2 * 60000, FIM_SEM_PROVA_MS = 5 * 60000;
export function fimRecebido(c, recs) {
  if (!c || c.status !== 'recebido' || !c.recebidoEm) return null;
  const t0 = Date.parse(c.recebidoEm), all = (recs || []).filter((r) => !r.srv).sort((a, b) => tRx(a) - tRx(b));
  const rx = all.find((r) => r.type === 'event' && r.event === 'cmd_rx' && r.info === c.cid);
  const up0 = c.recebidoUp != null ? c.recebidoUp : rx && rx.up != null ? rx.up : null;
  let mig = null;
  for (const r of all) {
    const t = tRx(r); if (!(t > t0) || r === rx) continue;
    const em = new Date(t).toISOString(), st = String(r.estado || '').toUpperCase(), loc = r.type === 'local';
    if (!loc && (r.event === 'boot' || (up0 != null && r.up != null && r.up < up0))) return { ...c, status: 'encerrado_reboot', encerradoEm: em, motivo: 'placa reiniciou depois do comando' };
    if (loc && st === 'CATM') return { ...c, status: 'encerrado_catm', encerradoEm: em, motivo: 'placa voltou ao Cat-M (USB)' };
    if (ehTimeoutNtn(r) || r.event === 'back_catm') return { ...c, status: 'encerrado_catm', encerradoEm: em, motivo: ehTimeoutNtn(r) ? 'sem registro em 20 min' : 'placa voltou ao Cat-M' };
    if (mig == null && ((loc && (st === 'BUSCA' || st === 'SINCRONIA')) || r.event === 'sat_start' || (r.event === 'stest' && r.value === 1))) { mig = t; continue; }
    if (!loc && r.type === 'telemetry' && r.net === 'catm' && (mig != null ? t - mig > FIM_POS_MIGRACAO_MS : t - t0 > FIM_SEM_PROVA_MS)) return { ...c, status: 'encerrado_catm', encerradoEm: em, motivo: mig != null ? 'envio Cat-M depois da migração' : 'envio Cat-M sem prova de migração' };
  }
  return null;
}
async function registrosRecentes(store, now) {
  const out = [];
  for (const d of new Set([new Date(now).toISOString().slice(0, 10), new Date(now - 86400000).toISOString().slice(0, 10)])) {
    const m = await store.get('meter/' + d, { type: 'json' }).catch(() => null); if (Array.isArray(m)) out.push(...m);
    const l = await store.get('local/' + d, { type: 'json' }).catch(() => null); if (Array.isArray(l)) out.push(...l);
  }
  return out;
}
/** Aplica o offline: fecha a sessão de busca (uma vez) e cancela o comando ativo. Idempotente. */
export async function offlineLazy(store, now = Date.now()) {
  const recs = await registrosRecentes(store, now), a = offlineAvalia(recs, now);
  const c0 = cmdVivo(await store.get(CMD_KEY, { type: 'json' }).catch(() => null), now), fim = fimRecebido(c0, recs);
  if (fim) { await cmdSalva(store, fim); a.cmdEncerrado = fim.status; }
  if (!a.offline) return a;
  const em = new Date(a.offEm).toISOString();
  if (a.busca && !recs.some((r) => r.srv && r.event === 'off_end' && tRx(r) >= a.lastRx)) {
    const key = 'meter/' + new Date(now).toISOString().slice(0, 10), list = (await store.get(key, { type: 'json' }).catch(() => null)) || [];
    list.push({ type: 'event', event: 'off_end', srv: 1, dv: METER_DV_PADRAO, info: 'encerrada: offline', ts: em, rx: em, ultimoDado: new Date(a.lastRx).toISOString() });
    await store.setJSON(key, list); a.sessaoEncerrada = true;
  }
  const c = cmdVivo(await store.get(CMD_KEY, { type: 'json' }).catch(() => null), now);
  if (c && (c.status === 'pendente' || c.status === 'entregue')) { await cmdSalva(store, { ...c, status: 'cancelado_offline', canceladoEm: em, motivo: 'placa sem comunicação' }); a.cmdCancelado = c.cid; }
  return a;
}
export function proxyUser(req) {
  if (!tokenOk(req.headers.get('x-ntn-proxy'), 'NTN_PROXY_TOKEN')) return null;
  const email = String(req.headers.get('x-ntn-user') || '').toLowerCase().slice(0, 120), role = String(req.headers.get('x-ntn-role') || '');
  return email ? { email, role } : null;
}
/** Status efetivo (expira na leitura, sem cron). */
export function cmdVivo(c, now = Date.now()) {
  if (!c) return null;
  if (c.status === 'pendente' && now > Date.parse(c.expira)) return { ...c, status: 'expirado', expiradoEm: c.expira };
  // entregue sem cmd_rx em 10 min -> final 'sem_resposta' (libera novo comando)
  if (c.status === 'entregue' && now > Date.parse(c.entregueEm) + CMD_TTL_MS) return { ...c, status: 'sem_resposta', semRespostaEm: new Date(Date.parse(c.entregueEm) + CMD_TTL_MS).toISOString() };
  return c;
}
/** fw 1.9: resposta do ingest com comando é exatamente {"ok":1,"cmd":"sat","cid":"<id>"} (sem espaços). */
export function cmdNaResposta(c) { return { cmd: c.cmd, cid: c.cid }; }
export function respostaIngest(extra) { return extra ? '{"ok":1,"cmd":' + JSON.stringify(String(extra.cmd)) + ',"cid":' + JSON.stringify(String(extra.cid)) + '}' : '{"ok":1}'; }
async function cmdSalva(store, c) {
  await store.setJSON(CMD_KEY, c);
  if (CMD_FINAIS.includes(c.status)) {
    const h = (await store.get(CMD_HIST, { type: 'json' }).catch(() => null)) || [];
    if (!h.some((x) => x.cid === c.cid && x.status === c.status)) { h.push(c); await store.setJSON(CMD_HIST, h.slice(-20)); }
  }
}
async function cmdRota(req, store, url) {
  const u = proxyUser(req);
  if (!u) return json(401, { ok: false, error: 'sem sessão' });
  if (req.method === 'GET') await offlineLazy(store).catch(() => null); // v75
  let c = cmdVivo(await store.get(CMD_KEY, { type: 'json' }).catch(() => null));
  if (req.method === 'GET') return json(200, { ok: true, cmd: c, serverTime: new Date().toISOString() });
  if (u.role !== 'admin') return json(403, { ok: false, error: 'somente admin' });
  let b; try { b = JSON.parse((await req.text()).slice(0, 1024) || '{}'); } catch { return json(400, { ok: false, error: 'invalid json' }); }
  const now = new Date();
  if (b.acao === 'criar') {
    if (b.cmd !== 'sat') return json(400, { ok: false, error: 'cmd inválido' });
    if (c && (c.status === 'pendente' || c.status === 'entregue')) return json(409, { ok: false, error: 'já existe comando ' + c.status, cmd: c });
    const dv = typeof b.dv === 'string' && /^m[0-9a-z]{1,7}$/.test(b.dv) ? b.dv : null;
    c = { cid: createHash('sha256').update(now.toISOString() + Math.random()).digest('hex').slice(0, 8), cmd: 'sat', dv, criado: now.toISOString(),
      expira: new Date(now.getTime() + CMD_TTL_MS).toISOString(), status: 'pendente', por: u.email };
    await cmdSalva(store, c);
    return json(201, { ok: true, cmd: c });
  }
  if (b.acao === 'cancelar') {
    if (!c || c.cid !== b.cid) return json(404, { ok: false, error: 'comando não encontrado' });
    if (c.status !== 'pendente') return json(409, { ok: false, error: 'não dá para cancelar: ' + c.status, cmd: c });
    c = { ...c, status: 'cancelado', canceladoEm: now.toISOString(), canceladoPor: u.email };
    await cmdSalva(store, c);
    return json(200, { ok: true, cmd: c });
  }
  return json(400, { ok: false, error: 'acao inválida' });
}
/** No ingest: cmd_rx marca recebido; ingest Cat-M (HTTPS) do medidor entrega o pendente uma única vez. Retorna o extra da resposta. */
async function cmdNoIngest(store, rec) {
  let c = cmdVivo(await store.get(CMD_KEY, { type: 'json' }).catch(() => null));
  if (!c) return null;
  if (c.status === 'expirado' || c.status === 'sem_resposta') { await cmdSalva(store, c); return null; }
  if (c.status === 'cancelado_offline') return null;
  // fw 1.9: {t:'e',n:'c',e:'cmd_rx',x:1|0,i:cid}. x:1 recebido (vai migrar); x:0 recusado (final, nunca reentrega).
  if (rec.type === 'event' && rec.event === 'cmd_rx' && rec.info === c.cid && (c.status === 'entregue' || c.status === 'pendente')) {
    const base = { ...c, entregueEm: c.entregueEm || rec.rx };
    await cmdSalva(store, rec.value === 0 ? { ...base, status: 'recusado', recusadoEm: rec.rx } : { ...base, status: 'recebido', recebidoEm: rec.rx, ...(rec.up != null ? { recebidoUp: rec.up } : {}) });
    return null;
  }
  if (c.status === 'recebido') { const prev = await registrosRecentes(store, Date.now()), fim = fimRecebido(c, prev.some((r) => r === rec || (r.rx === rec.rx && r.seq === rec.seq && r.type === rec.type)) ? prev : prev.concat(rec)); if (fim) await cmdSalva(store, fim); return null; } // v75
  const alvoOk = !c.dv || c.dv === rec.dv;
  if (c.status === 'pendente' && alvoOk && rec.dv && rec.net === 'catm' && rec.transport !== 'udp') {
    await cmdSalva(store, { ...c, status: 'entregue', entregueEm: rec.rx, entregueSeq: rec.seq });
    return cmdNaResposta(c);
  }
  return null;
}

/** v37: "cl":"72410,C423,0C5F2C16" (PLMN,TAC hex,ECI hex) -> objeto lte do nRF Cloud ground fix. */
export function parseCell(cl, rsrp) {
  const m = /^(\d{3})(\d{2,3}),([0-9A-Fa-f]{1,8}),([0-9A-Fa-f]{1,8})$/.exec(String(cl || ''));
  if (!m) return null;
  const o = { mcc: +m[1], mnc: +m[2], tac: parseInt(m[3], 16), eci: parseInt(m[4], 16) };
  if (typeof rsrp === 'number' && rsrp < 0 && rsrp > -160) o.rsrp = rsrp;
  return o;
}
async function cellFix(store, lte) {
  const key = 'cell/' + [lte.mcc, lte.mnc, lte.tac, lte.eci].join('-');
  const hit = await store.get(key, { type: 'json' }).catch(() => null);
  if (hit && (hit.lat != null ? Date.now() - hit.at < 30 * 86400000 : !/HTTP 40[13]|sem token/.test(hit.err || '') && Date.now() - hit.at < 3600000)) return hit;
  const clean = (v) => String(v || '').trim().replace(/^["']|["']$/g, '').replace(/^Bearer\s+/i, '').trim();
  const toks = [...new Set([process.env.NRF_LOCATION_TOKEN, process.env.NRF_TEAM_READ_TOKEN, process.env.NRF_TEAM_WRITE_TOKEN].map(clean).filter(Boolean))];
  let out = { lat: null, lon: null, acc: null, at: Date.now(), err: 'sem token' }, authErr = false;
  for (const [i, tok] of toks.entries()) {
    try {
      const r = await fetch('https://api.nrfcloud.com/v1/location/ground-fix', { method: 'POST', headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json' }, body: JSON.stringify({ lte: [lte] }), signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && typeof j.lat === 'number') { out = { lat: j.lat, lon: j.lon, acc: Math.round(j.uncertainty ?? 0) || null, at: Date.now(), via: j.fulfilledWith || 'SCELL' }; authErr = false; break; }
      authErr = r.status === 401 || r.status === 403;
      out.err = 'nRF Cloud HTTP ' + r.status + (j.message ? ': ' + String(j.message).slice(0, 50) : '') + ` [tok${i} len ${tok.length}${/^[0-9a-f]+$/i.test(tok) ? ' hex' : tok.split('.').length === 3 ? ' jwt' : ' outro'}]`;
    } catch (e) { out.err = 'nRF Cloud: ' + String(e && e.message || e).slice(0, 60); }
  }
  // fallback gratuito sem chave: BeaconDB (API compativel com Mozilla Location Service)
  if (out.lat == null) {
    try {
      const r = await fetch('https://api.beacondb.net/v1/geolocate', { method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': 'ntn-lab/1.0 (thingy91x-dashboard)' }, body: JSON.stringify({ considerIp: false, cellTowers: [{ radioType: 'lte', mobileCountryCode: lte.mcc, mobileNetworkCode: lte.mnc, locationAreaCode: lte.tac, cellId: lte.eci, ...(lte.rsrp ? { signalStrength: lte.rsrp } : {}) }] }), signal: AbortSignal.timeout(8000) });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.location) { out = { lat: j.location.lat, lon: j.location.lng, acc: Math.round(j.accuracy || 0) || null, at: Date.now(), via: 'beacondb', nrfErr: out.err }; authErr = false; }
      else out.err = (out.err ? out.err + ' | ' : '') + 'BeaconDB ' + r.status + (r.status === 404 ? ' celula desconhecida' : '');
    } catch (e) { out.err = (out.err || '') + ' | BeaconDB: ' + String(e && e.message || e).slice(0, 40); }
  }
  if (out.lat == null && (authErr || out.err === 'sem token') && !/BeaconDB 404/.test(out.err)) return out;
  await store.setJSON(key, out).catch(() => {});
  return out;
}
/** Versao publica: posicao arredondada (~100 m). */
export function publicView(rec) { return { ...rec, lat: r3(rec.lat), lon: r3(rec.lon) }; }


/* Média móvel do medidor (Utilities): para cada leitura, média das 24 leituras anteriores por métrica
   e desvio percentual do valor atual. Campo novo e opcional "rolling" (compatível para trás).
   devPct é null quando a média é zero (não há porcentagem real a calcular). Exportado para testes. */
export const ROLLING_METRICS = ['deltaL', 'rsrp', 'snr'];
export const ROLLING_WINDOW = 24;
export function rollingStat(previousValues, currentValue) {
  const window = previousValues.slice(-ROLLING_WINDOW);
  if (!window.length || num(currentValue) == null) return null;
  const mean = window.reduce((a, b) => a + b, 0) / window.length;
  return { mean: Math.round(mean * 10) / 10, n: window.length, devPct: mean !== 0 ? Math.round(((currentValue - mean) / Math.abs(mean)) * 1000) / 10 : null };
}
/** Anota rolling em cada telemetria (em ordem) que ainda não tem; preserva o que já foi gravado. */
export function withRolling(records) {
  const prev = Object.fromEntries(ROLLING_METRICS.map((m) => [m, []]));
  return records.map((r) => {
    if (!r || r.type !== 'telemetry') return r;
    const rolling = {};
    for (const m of ROLLING_METRICS) { rolling[m] = (r.rolling && r.rolling[m]) || rollingStat(prev[m], r[m]); if (num(r[m]) != null) prev[m].push(r[m]); }
    return { ...r, rolling };
  });
}


/* Rastreador: distância (m), velocidade (km/h) e tempo parado (min) entre posições medidas, calculados
   com a coordenada exata (antes de arredondar para ~100 m), mais a média móvel de 24 posições e o desvio %.
   Campo novo e opcional "move"; não expõe coordenada além do que publicView já mostra. Exportado para testes. */
const MOVE_METRICS = ['distM', 'speedKmh', 'stoppedMin'];
function haversineM(a, b) {
  const R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function withMovement(records) {
  let prev = null, stoppedSince = null; const hist = Object.fromEntries(MOVE_METRICS.map((m) => [m, []]));
  return records.map((r) => {
    if (!r || r.type !== 'telemetry' || num(r.lat) == null || num(r.lon) == null || r.posSrc === 'salva') return r;
    const t = Date.parse(r.ts); if (!prev) { prev = r; return r; }
    const dt = (t - Date.parse(prev.ts)) / 1000, distM = Math.round(haversineM(prev, r));
    if (distM < 50) { if (stoppedSince == null) stoppedSince = Date.parse(prev.ts); } else stoppedSince = null;
    const move = { distM, speedKmh: dt > 0 ? Math.round((distM / dt) * 36) / 10 : null, stoppedMin: stoppedSince == null ? 0 : Math.round((t - stoppedSince) / 60000), rolling: {} };
    for (const m of MOVE_METRICS) { move.rolling[m] = rollingStat(hist[m], move[m]); if (num(move[m]) != null) hist[m].push(move[m]); }
    prev = r; return { ...r, move };
  });
}

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  const store = getStore({ name: 'ntn-lab', consistency: 'strong' });
  const url = new URL(req.url);
  if (req.method === 'GET' && url.searchParams.get('meter')) {
    // Connect Utilities: leituras/alarmes do medidor (device separado, campo dv)
    await offlineLazy(store).catch(() => null); // v75: placa sem comunicação fecha a busca e cancela o comando
    const since = url.searchParams.get('since'), sinceT = Date.parse(since || '');
    let days = Math.min(62, Math.max(1, parseInt(url.searchParams.get('days') || '31', 10) || 31));
    // v71: incremental, lê só os dias desde since (ts pode ser até 1 dia antes do rx por atraso declarado)
    if (Number.isFinite(sinceT)) days = Math.min(62, Math.max(1, Math.ceil((Date.now() - sinceT) / 86400000) + 1));
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const list = await store.get('meter/' + new Date(Date.now() - i * 86400000).toISOString().slice(0, 10), { type: 'json' }).catch(() => null);
      if (Array.isArray(list)) out.push(...list.map(publicView));
    }
    // rolling: média móvel das 24 leituras anteriores e desvio % (campo opcional, calculado se ainda não gravado)
    // v71: leituras locais (USB do Mac) das últimas 2 h, guardadas à parte para não ocupar a lista do medidor
    for (const d of new Set([new Date().toISOString().slice(0, 10), new Date(Date.now() - LOCAL_JANELA_MS).toISOString().slice(0, 10)])) {
      const loc = await store.get('local/' + d, { type: 'json' }).catch(() => null);
      if (Array.isArray(loc)) out.push(...loc.filter((r) => Date.now() - Date.parse(r.rx) < LOCAL_JANELA_MS));
    }
    out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const records = sinceFilter(withRolling(out), since);
    // ?metric=deltaL|rsrp|snr: série histórica da métrica (valor, média, desvio) para o gráfico de linha
    const metric = url.searchParams.get('metric');
    const series = ROLLING_METRICS.includes(metric) ? records.filter((r) => r.type === 'telemetry' && num(r[metric]) != null).map((r) => ({ ts: r.ts, seq: r.seq, value: r[metric], ...(r.rolling[metric] || {}) })) : undefined;
    return json(200, { ok: true, schema: 'connect-meter/1', serverTime: new Date().toISOString(), records, ...(series ? { metric, series } : {}) });
  }
  if (req.method === 'GET' && url.searchParams.get('pro')) {
    const days = Math.min(14, Math.max(1, parseInt(url.searchParams.get('days') || '2', 10) || 2));
    const out = [];
    for (let i = days - 1; i >= 0; i--) {
      const list = await store.get(dayKey(new Date(Date.now() - i * 86400000).toISOString()), { type: 'json' }).catch(() => null);
      if (Array.isArray(list)) out.push(...list);
    }
    // move: deslocamento entre posições com média móvel (calculado com coordenada exata, depois arredonda)
    out.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const records = withMovement(out).map(publicView);
    return json(200, { ok: true, schema: 'ntn-pro/1', serverTime: new Date().toISOString(), records });
  }
  if (url.searchParams.get('cmd')) return cmdRota(req, store, url); // v72: comando sat (usuário logado via proxy do Pages)
  if (req.method === 'POST' && url.searchParams.get('local')) {
    // v71: ingest local do leitor serial do Mac (fonte=usb). Mesmo token de escrita do Mac (NTN_LAB_WRITE_TOKEN).
    // v73: aceita também o token do medidor (METER_DEVICE_TOKEN), e nesse caso força dv do medidor.
    if (!process.env.NTN_LAB_WRITE_TOKEN && !process.env.METER_DEVICE_TOKEN) return json(503, { ok: false, error: 'write token not configured' });
    const authL = req.headers.get('authorization'), okW = tokenOk(authL), okM = !okW && tokenOk(authL, 'METER_DEVICE_TOKEN');
    if (!okW && !okM) return json(401, { ok: false, error: 'unauthorized' });
    const raw = await req.text();
    if (raw.length > 512) return json(413, { ok: false, error: 'payload > 512 B' });
    let m; try { m = JSON.parse(scrub(raw)); } catch { return json(400, { ok: false, error: 'invalid json' }); }
    const rx = new Date().toISOString();
    const rec = normalizeLocal(m, rx);
    if (!rec) return json(400, { ok: false, error: 'bad message' });
    if (okM) rec.dv = METER_DV_PADRAO;
    const key = 'local/' + rx.slice(0, 10);
    const list = (await store.get(key, { type: 'json' }).catch(() => null)) || [];
    list.push(rec); await store.setJSON(key, list.slice(-LOCAL_MAX));
    return json(200, { ok: true, rx });
  }
  if (req.method === 'POST' && url.searchParams.get('ingest')) {
    // v36: telemetria/eventos da placa (app v2.0). Resposta minima (poucos bytes no satelite).
    const auth = req.headers.get('authorization');
    const okTrk = tokenOk(auth, 'NTN_LAB_DEVICE_TOKEN'), okMeter = tokenOk(auth, 'METER_DEVICE_TOKEN');
    if (!okTrk && !okMeter) return json(401, { ok: false, error: 'unauthorized' });
    const raw = await req.text();
    if (raw.length > 256) return json(413, { ok: false, error: 'payload > 256 B' });
    let m; try { m = JSON.parse(scrub(raw)); } catch { return json(400, { ok: false, error: 'invalid json' }); }
    const meterDev = meterDevDe(m.dv, okMeter && !okTrk); // fw 1.9: sem dv + token do medidor -> dv do token
    // medidor: token proprio; via relay UDP (HMAC do relay) chega com o token do relay
    if (meterDev ? !(okMeter || (okTrk && url.searchParams.get('tr') === 'udp')) : !okTrk) return json(401, { ok: false, error: 'unauthorized' });
    const rx = new Date().toISOString();
    const rec = normalizeIngest(m, raw.length, rx, url.searchParams.get('tr'));
    if (!rec) return json(400, { ok: false, error: 'bad message' });
    // v37: sem fix GNSS recente -> posicao pela celula servidora (nRF Cloud ground fix, cache por celula)
    if (rec.cell && rec.posSrc !== 'gnss' && rec.net === 'catm') {
      const lte = parseCell(rec.cell, rec.rsrp);
      if (lte) {
        const f = await cellFix(store, lte);
        if (f.lat != null) Object.assign(rec, { lat: f.lat, lon: f.lon, acc: f.acc, posSrc: 'celula', posVia: f.via || null });
        else Object.assign(rec, { lat: null, lon: null, acc: null, posSrc: 'celula sem posicao', posErr: f.err });
      }
    }
    if (meterDev) rec.dv = meterDev;
    const key = meterDev ? 'meter/' + rec.ts.slice(0, 10) : dayKey(rec.ts);
    const list = (await store.get(key, { type: 'json' }).catch(() => null)) || [];
    const dup = isDup(list, rec); // v71: inclui o boot (uptime) na chave
    // medidor: grava a média móvel e o desvio % junto da leitura (usa o dia anterior se faltar histórico)
    if (meterDev && rec.type === 'telemetry' && !dup) {
      let history = list.filter((x) => x.type === 'telemetry');
      if (history.length < ROLLING_WINDOW) { const y = await store.get('meter/' + new Date(Date.parse(rec.ts) - 86400000).toISOString().slice(0, 10), { type: 'json' }).catch(() => null);
        if (Array.isArray(y)) history = [...y.filter((x) => x.type === 'telemetry'), ...history]; }
      rec.rolling = withRolling([...history.slice(-ROLLING_WINDOW), rec]).pop().rolling;
    }
    if (!dup) { list.push(rec); await store.setJSON(key, list.slice(-DAY_MAX)); }
    const extra = await cmdNoIngest(store, rec); // v72: comando pendente vai na resposta (poucos bytes)
    const corpo = respostaIngest(extra); // corpo de tamanho fixo: Content-Length explícito, sem chunked
    return new Response(corpo, { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(corpo)), 'Connection': 'close' } });
  }
  if (req.method === 'GET') {
    const rec = await store.get(KEY, { type: 'json' }).catch(() => null);
    const pings = await store.get(PINGS, { type: 'json' }).catch(() => null);
    return json(200, { ok: true, data: rec ? rec.data : null, storedAt: rec ? rec.storedAt : null, pings: pings || [] });
  }
  if (req.method === 'POST' && url.searchParams.get('ping')) {
    // v35: mensagem de teste enviada direto pela placa (Botao 3), <=256 B, token proprio do dispositivo
    if (!process.env.NTN_LAB_DEVICE_TOKEN) return json(503, { ok: false, error: 'device token not configured' });
    if (!tokenOk(req.headers.get('authorization'), 'NTN_LAB_DEVICE_TOKEN')) return json(401, { ok: false, error: 'unauthorized' });
    const raw = await req.text();
    if (raw.length > 256) return json(413, { ok: false, error: 'payload > 256 B' });
    let m; try { m = JSON.parse(scrub(raw)); } catch { return json(400, { ok: false, error: 'invalid json' }); }
    const pick = (k, t) => (typeof m[k] === t ? m[k] : null);
    const rx = new Date().toISOString();
    const rec = { rx, bytes: raw.length, seq: pick('s', 'number'), up: pick('up', 'number'), net: pick('n', 'string'), plmn: pick('p', 'string'), act: pick('a', 'number'),
      rsrp: pick('r', 'number'), mv: pick('v', 'number'), prevRttMs: pick('pr', 'number'),
      lat: typeof m.la === 'number' && m.la ? Math.round(m.la * 1000) / 1000 : null, lon: typeof m.lo === 'number' && m.lo ? Math.round(m.lo * 1000) / 1000 : null };
    const list = (await store.get(PINGS, { type: 'json' }).catch(() => null)) || [];
    list.push(rec); await store.setJSON(PINGS, list.slice(-MAX_PINGS));
    return json(200, { ok: true, rx, seq: rec.seq });
  }
  if (req.method === 'POST') {
    // v73: aceita também o token do medidor (METER_DEVICE_TOKEN), e nesse caso força dv do medidor.
    if (!process.env.NTN_LAB_WRITE_TOKEN && !process.env.METER_DEVICE_TOKEN) return json(503, { ok: false, error: 'write token not configured' });
    const authL = req.headers.get('authorization'), okW = tokenOk(authL), okM = !okW && tokenOk(authL, 'METER_DEVICE_TOKEN');
    if (!okW && !okM) return json(401, { ok: false, error: 'unauthorized' });
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return json(413, { ok: false, error: 'payload too large' });
    let data;
    try { data = JSON.parse(scrub(raw)); } catch { return json(400, { ok: false, error: 'invalid json' }); }
    if (!data || data.schema !== 'ntn-lab/1') return json(400, { ok: false, error: 'bad schema' });
    const storedAt = new Date().toISOString();
    await store.setJSON(KEY, { data, storedAt });
    return json(200, { ok: true, storedAt });
  }
  return json(405, { ok: false, error: 'method not allowed' });
};
