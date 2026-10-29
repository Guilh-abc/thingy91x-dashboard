// fw 1.9: cmd_rx {t:'e',s,u,n:'c',e:'cmd_rx',x:1|0,i:cid} sem dv; x:0 = recusado (final). Resposta do ingest compacta.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync(new URL('../netlify/functions/ntn-lab.js', import.meta.url), 'utf8')
  .replace(/import \{ getStore \} from '@netlify\/blobs';/, "const __m = globalThis.__mem3; const getStore = () => ({ get: async (k) => (__m.has(k) ? JSON.parse(__m.get(k)) : null), setJSON: async (k, v) => { __m.set(k, JSON.stringify(v)); } });");
const f = join(mkdtempSync(join(tmpdir(), 'satcmd19-')), 'ntn-lab.mjs'); writeFileSync(f, src);
globalThis.__mem3 = new Map();
const L = await import(f), h = L.default;
const PX = 'p'.repeat(32), MT = 'm'.repeat(32);
Object.assign(process.env, { NTN_PROXY_TOKEN: PX, METER_DEVICE_TOKEN: MT });
const U = { 'x-ntn-proxy': 'Bearer ' + PX, 'x-ntn-user': 'gui@ex.com', 'x-ntn-role': 'admin' };
const cmd = async (method, body) => { const r = await h(new Request('https://x/.netlify/functions/ntn-lab?cmd=1', { method, headers: U, body: body ? JSON.stringify(body) : undefined })); return { st: r.status, j: await r.json() }; };
const ingestRaw = async (m) => { const r = await h(new Request('https://x/.netlify/functions/ntn-lab?ingest=1', { method: 'POST', headers: { Authorization: 'Bearer ' + MT }, body: JSON.stringify(m) })); return { st: r.status, txt: await r.text() }; };
let s = 1; const up = () => s * 10;

// resposta exata, sem espaços
const c1 = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
let r = await ingestRaw({ t: 'm', dv: 'm1', s: s++, u: up(), n: 'c' });
assert.equal(r.st, 200); assert.equal(r.txt, '{"ok":1,"cmd":"sat","cid":"' + c1.cid + '"}');
assert.equal((await ingestRaw({ t: 'm', dv: 'm1', s: s++, u: up(), n: 'c' })).txt, '{"ok":1}');
assert.equal(L.respostaIngest({ cmd: 'sat', cid: 'ab12cd34', extra: 1 }), '{"ok":1,"cmd":"sat","cid":"ab12cd34"}');

// x:1 -> recebido (dv como chega hoje no envelope do medidor)
await ingestRaw({ t: 'e', dv: 'm1', s: s++, u: up(), n: 'c', e: 'cmd_rx', x: 1, i: c1.cid });
assert.equal((await cmd('GET')).j.cmd.status, 'recebido');

// x:0 -> recusado, final, nunca reentrega, x:1 tardio não muda
const c2 = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
assert.equal((await ingestRaw({ t: 'm', dv: 'm1', s: s++, u: up(), n: 'c' })).txt, '{"ok":1,"cmd":"sat","cid":"' + c2.cid + '"}');
await ingestRaw({ t: 'e', dv: 'm1', s: s++, u: up(), n: 'c', e: 'cmd_rx', x: 0, i: c2.cid });
let g = (await cmd('GET')).j.cmd; assert.equal(g.status, 'recusado'); assert.ok(g.recusadoEm);
for (let k = 0; k < 3; k++) assert.equal((await ingestRaw({ t: 'm', dv: 'm1', s: s++, u: up(), n: 'c' })).txt, '{"ok":1}', 'recusado não reentrega');
await ingestRaw({ t: 'e', dv: 'm1', s: s++, u: up(), n: 'c', e: 'cmd_rx', x: 1, i: c2.cid });
assert.equal((await cmd('GET')).j.cmd.status, 'recusado', 'x:1 tardio não reabre');
assert.equal((await cmd('POST', { acao: 'cancelar', cid: c2.cid })).st, 409, 'recusado não cancela');
assert.ok(JSON.parse(globalThis.__mem3.get('cmd/hist')).some((x) => x.cid === c2.cid && x.status === 'recusado'), 'vai pro histórico');
const c3 = (await cmd('POST', { acao: 'criar', cmd: 'sat' }));
assert.equal(c3.st, 201, 'novo comando depois de recusado'); assert.notEqual(c3.j.cmd.cid, c2.cid);

// front
await import('../utilities/sat-cmd.js'); const S = globalThis.SatCmdU;
const e = S.etapas({ ...g, status: 'recusado' }, [{ type: 'local', estado: 'BUSCA', rx: new Date(Date.now() + 60000).toISOString() }]);
assert.equal(e.fim, 'recusado'); assert.equal(e.idx, 1); assert.ok(e.t.recusado);
const fe = readFileSync(new URL('../utilities/sat-cmd.js', import.meta.url), 'utf8');
assert.ok(fe.includes("recusado: 'Recusado' + at(e.t.recusado)")); // v76: rótulo curto
for (const t of ["sem_resposta: 'Sem resposta'", "cancelado: 'Cancelado'", "encerrado_catm: 'Encerrado' + at(cmd.encerradoEm)", "encerrado_reboot: 'Encerrado'", "cancelado_offline: 'Cancelado'"]) assert.ok(fe.includes(t), t);
assert.ok(!/Você já pode|continua no Cat-M|placa recusou/.test(fe), 'sem frases longas');
assert.ok(!/\u2014/.test(fe), 'sem travessão');
console.log('sat-cmd fw1.9 OK');

// fw 1.9: sem dv, assume o medidor pelo token
{
  const DT = 'd'.repeat(32); process.env.NTN_LAB_DEVICE_TOKEN = DT;
  const post = async (m, tok) => { const r = await h(new Request('https://x/.netlify/functions/ntn-lab?ingest=1', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: JSON.stringify(m) })); return { st: r.status, txt: await r.text() }; };
  assert.equal(L.meterDevDe(undefined, true), 'm1'); assert.equal(L.meterDevDe('m7', true), 'm7'); assert.equal(L.meterDevDe(undefined, false), null); assert.equal(L.meterDevDe('xx', false), null);
  const meterRecs = () => [...globalThis.__mem3].filter(([k]) => k.startsWith('meter/')).flatMap(([, v]) => JSON.parse(v));
  const trkRecs = () => [...globalThis.__mem3].filter(([k]) => /^\d{4}-|^day|^pro\//.test(k) || (!k.startsWith('meter/') && !k.startsWith('cmd/') && !k.startsWith('local/'))).flatMap(([, v]) => { const j = JSON.parse(v); return Array.isArray(j) ? j : []; });
  // recebido sem dv
  const a = (await cmd('GET')).j.cmd; // c3 pendente
  assert.equal((await post({ t: 'm', s: 900, u: 9000, n: 'c' }, MT)).txt, '{"ok":1,"cmd":"sat","cid":"' + a.cid + '"}', 'telemetria sem dv entrega');
  assert.equal((await post({ t: 'e', s: 901, u: 9010, n: 'c', e: 'cmd_rx', x: 1, i: a.cid }, MT)).st, 200);
  assert.equal((await cmd('GET')).j.cmd.status, 'recebido');
  assert.ok(meterRecs().some((x) => x.seq === 900 && x.dv === 'm1' && x.type === 'telemetry'), 'telemetria sem dv vira m1');
  // recusado sem dv
  const b = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
  await post({ t: 'm', s: 902, u: 9020, n: 'c' }, MT);
  await post({ t: 'e', s: 903, u: 9030, n: 'c', e: 'cmd_rx', x: 0, i: b.cid }, MT);
  assert.equal((await cmd('GET')).j.cmd.status, 'recusado');
  // token inválido
  assert.equal((await post({ t: 'e', s: 904, u: 9040, n: 'c', e: 'cmd_rx', x: 1, i: b.cid }, 'z'.repeat(32))).st, 401);
  // rastreador: sem dv continua rastreador; com dv de medidor é negado
  const n0 = meterRecs().length;
  assert.equal((await post({ t: 'm', s: 905, u: 9050, n: 'c' }, DT)).st, 200);
  assert.equal(meterRecs().length, n0, 'rastreador sem dv não vira medidor');
  assert.ok(trkRecs().some((x) => x.seq === 905 && !x.dv), 'rastreador gravado no store dele');
  assert.equal((await post({ t: 'm', dv: 'm1', s: 906, u: 9060, n: 'c' }, DT)).st, 401, 'rastreador não manda dv de medidor');
  console.log('sat-cmd fw1.9 dv-por-token OK');
}

// sem_resposta: entregue sem cmd_rx por 10 min
{
  const post = async (m) => { const r = await h(new Request('https://x/.netlify/functions/ntn-lab?ingest=1', { method: 'POST', headers: { Authorization: 'Bearer ' + MT }, body: JSON.stringify(m) })); return r; };
  const c = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
  const r1 = await post({ t: 'm', s: 950, u: 9500, n: 'c' });
  const t1 = await r1.text(); assert.equal(t1, '{"ok":1,"cmd":"sat","cid":"' + c.cid + '"}');
  assert.equal(r1.headers.get('content-length'), String(Buffer.byteLength(t1))); assert.equal(r1.headers.get('connection'), 'close');
  assert.equal((await cmd('POST', { acao: 'criar', cmd: 'sat' })).st, 409, 'entregue recente ainda trava');
  const atual = JSON.parse(globalThis.__mem3.get('cmd/atual'));
  globalThis.__mem3.set('cmd/atual', JSON.stringify({ ...atual, entregueEm: new Date(Date.now() - 11 * 60000).toISOString() }));
  const g = (await cmd('GET')).j.cmd; assert.equal(g.status, 'sem_resposta'); assert.ok(g.semRespostaEm);
  const r2 = await post({ t: 'm', s: 951, u: 9510, n: 'c' }); assert.equal(await r2.text(), '{"ok":1}', 'sem reentrega');
  assert.equal(r2.headers.get('content-length'), '8');
  assert.ok(JSON.parse(globalThis.__mem3.get('cmd/hist')).some((x) => x.cid === c.cid && x.status === 'sem_resposta'), 'histórico');
  assert.equal((await cmd('POST', { acao: 'criar', cmd: 'sat' })).st, 201, 'libera novo comando');
  const S = globalThis.SatCmdU, e = S.etapas({ cid: 'z', cmd: 'sat', criado: new Date(0).toISOString(), expira: new Date(600000).toISOString(), status: 'entregue', entregueEm: new Date(1000).toISOString() }, [], 12 * 60000);
  assert.equal(e.fim, 'sem_resposta');
  console.log('sat-cmd sem_resposta OK');
}
