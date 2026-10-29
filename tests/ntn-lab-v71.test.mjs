// v71: since=, dedup pós-boot e ingest local. Roda o handler real com um store em memória (sem @netlify/blobs).
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync(new URL('../netlify/functions/ntn-lab.js', import.meta.url), 'utf8')
  .replace(/import \{ getStore \} from '@netlify\/blobs';/, "const __m = globalThis.__mem; const getStore = () => ({ get: async (k) => (__m.has(k) ? JSON.parse(__m.get(k)) : null), setJSON: async (k, v) => { __m.set(k, JSON.stringify(v)); } });");
const dir = mkdtempSync(join(tmpdir(), 'ntnlab-')), f = join(dir, 'ntn-lab.mjs'); writeFileSync(f, src);
globalThis.__mem = new Map();
const L = await import(f), h = L.default;
const TOK = 'x'.repeat(32); process.env.NTN_LAB_WRITE_TOKEN = TOK; process.env.METER_DEVICE_TOKEN = 'm'.repeat(32);
const post = (q, body, tok) => h(new Request('https://x/.netlify/functions/ntn-lab?' + q, { method: 'POST', headers: { Authorization: 'Bearer ' + tok }, body: JSON.stringify(body) }));
const get = async (q) => (await h(new Request('https://x/.netlify/functions/ntn-lab?' + q))).json();

// dedup pós-boot (unidade)
const a = { seq: 1455, type: 'telemetry', up: 900, ts: '2026-10-29T19:01:00Z' };
assert.equal(L.isDup([a], { ...a }), true, 'reenvio idêntico é duplicata');
assert.equal(L.isDup([a], { ...a, up: 12, ts: '2026-10-29T19:05:00Z' }), false, 'mesmo seq após reboot (uptime novo) não é duplicata');
assert.equal(L.isDup([{ seq: 7, type: 'event', ts: '2026-10-29T19:00:00Z' }], { seq: 7, type: 'event', ts: '2026-10-29T19:00:30Z' }), true, 'sem uptime: ts próximo é duplicata');
assert.equal(L.isDup([{ seq: 7, type: 'event', ts: '2026-10-29T19:00:00Z' }], { seq: 7, type: 'event', ts: '2026-10-29T19:10:00Z' }), false, 'sem uptime: ts distante não é');
// dedup pós-boot (handler)
const MT = 'm'.repeat(32);
assert.equal((await post('ingest=1', { t: 'm', dv: 'm1', s: 1459, u: 800, n: 'c', r: -96 }, MT)).status, 200);
await post('ingest=1', { t: 'm', dv: 'm1', s: 1459, u: 800, n: 'c', r: -96 }, MT); // reenvio idêntico
await post('ingest=1', { t: 'm', dv: 'm1', s: 1459, u: 15, n: 'c', r: -96 }, MT); // pós-boot
let j = await get('meter=1&days=1');
assert.equal(j.records.filter((r) => r.seq === 1459).length, 2, 'pós-boot gravado, reenvio idêntico não');

// since=
const corte = j.records.at(-1).rx;
await new Promise((r) => setTimeout(r, 5));
await post('ingest=1', { t: 'm', dv: 'm1', s: 1460, u: 25, n: 'c', r: -95 }, MT);
j = await get('meter=1&days=62&since=' + encodeURIComponent(corte));
assert.deepEqual(j.records.map((r) => r.seq), [1460], 'since traz só o que chegou depois');
assert.equal((await get('meter=1&days=62&since=lixo')).records.length, 3, 'since inválido = carga completa');
assert.deepEqual(L.sinceFilter([{ rx: '2026-01-01T00:00:01Z' }, { rx: '2026-01-01T00:00:03Z' }], '2026-01-01T00:00:02Z').length, 1);

// ingest local
assert.equal((await post('local=1', { fonte: 'usb', linha: 'APP|1234|SIG|rsrp=-118 dBm nivel=MEDIO' }, 'errado'.repeat(5))).status, 401, 'sem token = 401');
let r = await post('local=1', { fonte: 'usb', dv: 'm1', linha: 'APP|1234|STATE|BUSCA' }, TOK);
assert.equal(r.status, 200); const rx1 = (await r.json()).rx; assert.ok(rx1);
assert.equal((await post('local=1', { fonte: 'usb', linha: 'APP|11234|SIG|rsrp=-118 dBm nivel=MEDIO' }, TOK)).status, 200);
assert.equal((await post('local=1', { fonte: 'usb', linha: 'APP|21234|SIG|rsrp=NA nivel=NA' }, TOK)).status, 200);
assert.equal((await post('local=1', { fonte: 'usb', estado: 'CATM' }, TOK)).status, 200, 'campos soltos');
assert.equal((await post('local=1', { linha: 'APP|1|STATE|XPTO' }, TOK)).status, 400, 'estado inválido');
assert.equal((await post('local=1', { linha: 'qualquer coisa' }, TOK)).status, 400);
const loc = (await get('meter=1&days=1')).records.filter((x) => x.type === 'local');
assert.equal(loc.length, 4);
assert.deepEqual([loc[0].estado, loc[0].fonte, loc[0].up, loc[0].rx], ['BUSCA', 'usb', 1234, rx1]);
assert.deepEqual([loc[1].rsrp, loc[1].nivel], [-118, 'MEDIO']);
assert.deepEqual([loc[2].rsrp, loc[2].nivel], [null, 'NA']);
assert.equal(loc[3].estado, 'CATM');
assert.equal(globalThis.__mem.get('meter/' + rx1.slice(0, 10)).includes('"local"'), false, 'locais fora da lista do medidor');
// v73: token do medidor também grava local=1, com dv forçado m1
{
  const MTK = 'm'.repeat(32), loc = () => [...globalThis.__mem].filter(([k]) => k.startsWith('local/')).flatMap(([, v]) => JSON.parse(v));
  const n0 = loc().length;
  assert.equal((await post('local=1', { fonte: 'usb', dv: 'm9', linha: 'APP|31234|STATE|BUSCA' }, MTK)).status, 200, 'token do medidor aceito');
  const ult = loc().at(-1); assert.equal(loc().length, n0 + 1); assert.equal(ult.dv, 'm1', 'dv forçado m1');
  assert.equal((await post('local=1', { fonte: 'usb', linha: 'APP|1|STATE|BUSCA' }, 'd'.repeat(32))).status, 401, 'outro token = 401');
  const sem = await h(new Request('https://x/.netlify/functions/ntn-lab?local=1', { method: 'POST', body: '{}' }));
  assert.equal(sem.status, 401, 'sem Authorization = 401');
}
console.log('ntn-lab v71 OK');
