// v72: comando "Migrar para satélite". Handler real com store em memória (sem @netlify/blobs).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync(new URL('../netlify/functions/ntn-lab.js', import.meta.url), 'utf8')
  .replace(/import \{ getStore \} from '@netlify\/blobs';/, "const __m = globalThis.__mem2; const getStore = () => ({ get: async (k) => (__m.has(k) ? JSON.parse(__m.get(k)) : null), setJSON: async (k, v) => { __m.set(k, JSON.stringify(v)); } });");
const f = join(mkdtempSync(join(tmpdir(), 'satcmd-')), 'ntn-lab.mjs'); writeFileSync(f, src);
globalThis.__mem2 = new Map();
const L = await import(f), h = L.default;
const PX = 'p'.repeat(32), MT = 'm'.repeat(32), DT = 'd'.repeat(32);
Object.assign(process.env, { NTN_PROXY_TOKEN: PX, METER_DEVICE_TOKEN: MT, NTN_LAB_DEVICE_TOKEN: DT });
const U = (role = 'admin', tok = PX) => ({ 'x-ntn-proxy': 'Bearer ' + tok, 'x-ntn-user': 'gui@ex.com', 'x-ntn-role': role });
const cmd = async (method, body, hd = U()) => { const r = await h(new Request('https://x/.netlify/functions/ntn-lab?cmd=1', { method, headers: hd, body: body ? JSON.stringify(body) : undefined })); return { st: r.status, j: await r.json() }; };
const ingest = async (m, tok = MT) => { const r = await h(new Request('https://x/.netlify/functions/ntn-lab?ingest=1', { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: JSON.stringify(m) })); return r.json(); };

// auth negada
assert.equal((await cmd('GET', null, {})).st, 401, 'sem proxy');
assert.equal((await cmd('GET', null, U('admin', 'x'.repeat(32)))).st, 401, 'segredo do proxy errado');
assert.equal((await cmd('POST', { acao: 'criar', cmd: 'sat' }, { Authorization: 'Bearer ' + MT })).st, 401, 'token da placa não serve');
assert.equal((await cmd('POST', { acao: 'criar', cmd: 'sat' }, U('leitor'))).st, 403, 'leitor não cria');
assert.equal((await cmd('GET', null, U('leitor'))).st, 200, 'leitor consulta');

// criar
let r = await cmd('POST', { acao: 'criar', cmd: 'sat' });
assert.equal(r.st, 201); const c1 = r.j.cmd;
assert.equal(c1.status, 'pendente'); assert.match(c1.cid, /^[0-9a-f]{8}$/);
assert.equal(Date.parse(c1.expira) - Date.parse(c1.criado), 600000);
assert.equal((await cmd('POST', { acao: 'criar', cmd: 'sat' })).st, 409, 'um ativo por vez');

// entrega única: satélite não entrega; Cat-M entrega uma vez
assert.equal((await ingest({ t: 'm', dv: 'm1', s: 1, u: 10, n: 'n' })).cmd, undefined, 'ingest via satélite não entrega');
let j = await ingest({ t: 'm', dv: 'm1', s: 2, u: 20, n: 'c', r: -96 });
assert.deepEqual(j, { ok: 1, cmd: 'sat', cid: c1.cid });
assert.equal((await ingest({ t: 'm', dv: 'm1', s: 3, u: 30, n: 'c' })).cmd, undefined, 'não entrega duas vezes');
assert.equal((await cmd('GET')).j.cmd.status, 'entregue');
assert.equal((await cmd('POST', { acao: 'cancelar', cid: c1.cid })).st, 409, 'entregue não cancela');

// cmd_rx
await ingest({ t: 'e', dv: 'm1', s: 4, u: 40, e: 'cmd_rx', i: 'outro' });
assert.equal((await cmd('GET')).j.cmd.status, 'entregue', 'cid errado não marca');
await ingest({ t: 'e', dv: 'm1', s: 5, u: 50, e: 'cmd_rx', i: c1.cid });
const rcv = (await cmd('GET')).j.cmd; assert.equal(rcv.status, 'recebido'); assert.ok(rcv.recebidoEm);

// cancelar
const c2 = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
assert.equal((await cmd('POST', { acao: 'cancelar', cid: 'zzzz' })).st, 404);
r = await cmd('POST', { acao: 'cancelar', cid: c2.cid });
assert.equal(r.st, 200); assert.equal(r.j.cmd.status, 'cancelado');
assert.equal((await ingest({ t: 'm', dv: 'm1', s: 6, u: 60, n: 'c' })).cmd, undefined, 'cancelado não entrega');

// expiração
const c3 = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
globalThis.__mem2.set('cmd/atual', JSON.stringify({ ...c3, expira: new Date(Date.now() - 1000).toISOString() }));
assert.equal((await ingest({ t: 'm', dv: 'm1', s: 7, u: 70, n: 'c' })).cmd, undefined, 'expirado não entrega');
assert.equal((await cmd('GET')).j.cmd.status, 'expirado');
assert.equal((await cmd('POST', { acao: 'criar', cmd: 'sat' })).st, 201, 'depois de expirado pode criar outro');

// formato isolado
assert.deepEqual(L.cmdNaResposta({ cmd: 'sat', cid: 'ab12cd34', status: 'pendente' }), { cmd: 'sat', cid: 'ab12cd34' });

// linha do tempo (front, puro)
await import('../utilities/sat-cmd.js'); const S = globalThis.SatCmdU;
const t0 = Date.parse('2026-10-29T19:00:00Z'), iso = (m) => new Date(t0 + m * 60000).toISOString();
const base = { cid: 'a', cmd: 'sat', criado: iso(0), expira: iso(10) };
assert.equal(S.etapas({ ...base, status: 'pendente' }, [], t0 + 60000).idx, 0);
assert.equal(S.etapas({ ...base, status: 'pendente' }, [], t0 + 11 * 60000).fim, 'expirado');
assert.equal(S.etapas({ ...base, status: 'cancelado' }, [], t0).fim, 'cancelado');
assert.equal(S.etapas({ ...base, status: 'entregue', entregueEm: iso(1) }, [], t0).idx, 1);
const rec = { ...base, status: 'recebido', entregueEm: iso(1), recebidoEm: iso(2) };
assert.equal(S.etapas(rec, [{ type: 'local', estado: 'BUSCA', rx: iso(1.5) }], t0).idx, 2, 'antes do recebido não conta');
assert.equal(S.etapas(rec, [{ type: 'local', estado: 'BUSCA', rx: iso(3) }], t0).idx, 3);
assert.equal(S.etapas(rec, [{ type: 'local', estado: 'BUSCA', rx: iso(3) }, { type: 'local', rsrp: -118, nivel: 'MEDIO', rx: iso(4) }], t0).idx, 4);
assert.equal(S.etapas(rec, [{ type: 'event', event: 'sat_reg', rx: iso(9) }], t0).idx, 5);
console.log('sat-cmd OK');
