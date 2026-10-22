// /api/alarmes: GET (admin/leitor) lista; POST cria, PUT /:id edita (inclui ativar/desativar), DELETE /:id exclui (só admin).
// POST /api/alarmes/teste (admin): e-mail de teste. POST /api/alarmes/avaliar: cron (header X-Cron-Token) ou admin.
import { sessao, json } from '../../_lib/acesso.js';
import { CHAVE, SISTEMAS, GATILHOS, validar, avaliar, emailHtml, enviar, brt, distM } from '../../_lib/alarmes.js';

const NRF = 'https://api.nrfcloud.com/v1', DEV = '50423451-3737-4337-80fc-110bddf418ff';
const ler = async (env) => JSON.parse((await env.NTN_ROLES.get(CHAVE)) || '[]');
const gravar = (env, l) => env.NTN_ROLES.put(CHAVE, JSON.stringify(l));
const REPETIR_MS = 6 * 3600e3; // anti-repetição: reenvia só se continuar disparado após 6 h

async function leituraThingy(env) {
  if (!env.NRF_CLOUD_API_KEY) return null;
  const h = { Authorization: `Bearer ${env.NRF_CLOUD_API_KEY}` };
  const r = await fetch(`${NRF}/location/history?deviceId=${DEV}&pageLimit=2&pageSort=desc`, { headers: h });
  if (!r.ok) return null;
  const it = ((await r.json()).items || []);
  const a = it[0]; if (!a) return null;
  const d = { ts: Date.parse(a.insertedAt), lat: Number(a.lat), lon: Number(a.lon) };
  const b = it[1];
  if (b) { const dt = (d.ts - Date.parse(b.insertedAt)) / 3600e3; if (dt > 0 && dt < 1) { d.vel_kmh = distM(d, { lat: +b.lat, lon: +b.lon }) / 1000 / dt; } }
  return d;
}
// Fontes no servidor: Thingy:91X (nRF Cloud) e ntn-lab público (Netlify): NTN (?pro=1), medidor (?meter=1). Posição já arredondada ~100 m.
const LAB = 'https://thingy91x-x-dashboard.netlify.app/.netlify/functions/ntn-lab';
const recs = async (q) => { const r = await fetch(`${LAB}?${q}`); return r.ok ? ((await r.json()).records || []) : null; };
const tsDe = (x) => Date.parse(x.ts || x.rx);
export function derivar(pro, meter, agora = Date.now()) {
  const out = {};
  if (pro) {
    const p = pro.filter((x) => x.lat != null && x.lon != null).sort((a, b) => tsDe(a) - tsDe(b));
    const u = p[p.length - 1], v = p[p.length - 2];
    if (u) { out.ntn = { ts: tsDe(u), lat: +u.lat, lon: +u.lon }; if (v) { const h = (tsDe(u) - tsDe(v)) / 3600e3; if (h > 0 && h < 1) out.ntn.vel_kmh = distM(out.ntn, { lat: +v.lat, lon: +v.lon }) / 1000 / h; } }
    else if (pro.length) out.ntn = { ts: Math.max(...pro.map(tsDe)) };
  }
  if (meter) {
    const dia = meter.filter((x) => agora - tsDe(x) < 864e5);
    out.utilities = { ts: meter.length ? Math.max(...meter.map(tsDe)) : null, anomalo: dia.some((x) => x.event === 'anom') };
  }
  if (pro && meter) {
    const dia = [...pro, ...meter].filter((x) => agora - tsDe(x) < 864e5);
    out.consumo = { valor: +(dia.reduce((s, x) => s + (x.bytes || 0), 0) / 1048576).toFixed(3), anomalo: dia.some((x) => x.event === 'anom') };
  }
  return out;
}
async function fontes(env) {
  const [t, pro, meter] = await Promise.all([leituraThingy(env).catch(() => null), recs('pro=1&days=30').catch(() => null), recs('meter=1').catch(() => null)]);
  return { thingy91x: t, ...derivar(pro, meter) };
}

async function rodar(env) {
  const regras = await ler(env), f = await fontes(env), agora = Date.now(), itens = [];
  for (const r of regras) {
    if (!r.ativo) continue;
    const res = avaliar(r, f[r.sistema], agora);
    r.ultimoValor = res ? res.valor : null; r.ultimaAvaliacao = agora; r.estado = res ? (res.disparou ? 'disparado' : 'ok') : 'sem fonte';
    if (res && res.disparou) {
      if (!r.notificadoEm || agora - r.notificadoEm > REPETIR_MS) { itens.push({ r, sistema: SISTEMAS[r.sistema].nome, regra: r.nome, quando: brt(agora), valor: res.valor }); r.ultimoDisparo = { em: agora, valor: res.valor }; }
      r.disparadoEm = r.disparadoEm || agora;
    } else if (res) { r.disparadoEm = null; r.notificadoEm = null; }
  }
  let envio = null;
  if (itens.length) { envio = await enviar(env, `Alarme: ${itens.map((i) => i.regra).join(', ')}`, emailHtml(itens, false)); if (envio.ok) itens.forEach((i) => { i.r.notificadoEm = agora; }); }
  await gravar(env, regras);
  return { avaliadas: regras.filter((r) => r.ativo).length, disparos: itens.map((i) => ({ id: i.r.id, regra: i.regra, valor: i.valor })), envio: envio && { ok: envio.ok, falta: envio.falta, id: envio.id, status: envio.status } };
}

export { rodar };
export async function onRequest({ request, env, params }) {
  const id = (params.id || [])[0];
  // /avaliar fica fora do Access (bypass): só aceita o cron com X-Cron-Token.
  if (id === 'avaliar') {
    const t = request.headers.get('X-Cron-Token') || '';
    if (request.method !== 'POST' || !env.ALARMES_CRON_TOKEN || t.length !== env.ALARMES_CRON_TOKEN.length || t !== env.ALARMES_CRON_TOKEN) return json({ error: 'não autorizado' }, 401);
    return json(await rodar(env));
  }
  const s = await sessao(request, env);
  if (!s) return json({ error: 'sem sessão' }, 401);
  if (!['admin', 'leitor'].includes(s.role)) return json({ error: 'sem permissão' }, 403);
  if (request.method === 'GET') return json({ regras: await ler(env), sistemas: SISTEMAS, gatilhos: GATILHOS, podeEditar: s.role === 'admin', email: !!env.RESEND_API_KEY, cron: !!env.ALARMES_CRON_TOKEN });
  if (s.role !== 'admin') return json({ error: 'somente admin' }, 403);
  if (id === 'rodar' && request.method === 'POST') return json(await rodar(env));
  if (id === 'teste' && request.method === 'POST') {
    const q = brt(Date.now());
    const ex = [
      { sistema: SISTEMAS.thingy91x.nome, regra: 'Saída da cerca Casa', quando: q, valor: 'fora da cerca "Casa", cerca de 1,2 km da borda' },
      { sistema: SISTEMAS.thingy91x.nome, regra: 'Sem posição', quando: q, valor: '95 min sem dado (limite 60 min)' },
      { sistema: SISTEMAS.ntn.nome, regra: 'Saída da cerca Base', quando: q, valor: 'fora da cerca "Base", cerca de 350 m da borda' },
      { sistema: SISTEMAS.ntn.nome, regra: 'Velocidade', quando: q, valor: '112 km/h (limite 100 km/h)' },
      { sistema: SISTEMAS.utilities.nome, regra: 'Consumo anômalo', quando: q, valor: 'Consumo anômalo detectado' },
      { sistema: SISTEMAS.consumo.nome, regra: 'Dados acima', quando: q, valor: '12 MB/dia (limite 10)' }
    ];
    const r = await enviar(env, '[TESTE] Alarme IoT Cat-M + NTN', emailHtml(ex, true));
    return json(r, r.ok ? 200 : r.falta ? 503 : 502);
  }
  const lista = await ler(env);
  const b = request.method === 'DELETE' ? {} : await request.json().catch(() => ({}));
  if (request.method === 'POST' && !id) {
    const r = { id: crypto.randomUUID().slice(0, 8), nome: b.nome, sistema: b.sistema, gatilho: b.gatilho, limite: b.limite == null ? null : Number(b.limite), cerca: b.cerca || null, ativo: b.ativo !== false, criadoPor: s.email, criadoEm: Date.now() };
    const e = validar(r); if (e) return json({ error: e }, 422);
    lista.push(r); await gravar(env, lista); return json(r, 201);
  }
  const i = lista.findIndex((r) => r.id === id);
  if (i < 0) return json({ error: 'não encontrado' }, 404);
  if (request.method === 'DELETE') { lista.splice(i, 1); await gravar(env, lista); return json({ ok: true }); }
  if (request.method === 'PUT') {
    const r = { ...lista[i] };
    for (const k of ['nome', 'sistema', 'gatilho', 'limite', 'cerca', 'ativo']) if (k in b) r[k] = k === 'limite' && b[k] != null ? Number(b[k]) : b[k];
    const e = validar(r); if (e) return json({ error: e }, 422);
    lista[i] = r; await gravar(env, lista); return json(r);
  }
  return json({ error: 'método não suportado' }, 405);
}
