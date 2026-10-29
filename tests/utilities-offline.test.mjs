// v75: Utilities offline (nuvem ou USB), cancelado_offline, encerrado_catm/reboot, timeout 20 min do fw 2.1.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const src = readFileSync(new URL('../netlify/functions/ntn-lab.js', import.meta.url), 'utf8')
  .replace(/import \{ getStore \} from '@netlify\/blobs';/, "const __m = globalThis.__mem9; const getStore = () => ({ get: async (k) => (__m.has(k) ? JSON.parse(__m.get(k)) : null), setJSON: async (k, v) => { __m.set(k, JSON.stringify(v)); } });");
const f = join(mkdtempSync(join(tmpdir(), 'uoff-')), 'ntn-lab.mjs'); writeFileSync(f, src);
const M = globalThis.__mem9 = new Map();
const L = await import(f), h = L.default;
await import('../status-desligado.js'); await import('../utilities/sat-cmd.js');
const SD = globalThis.StatusDesligado, SC = globalThis.SatCmdU;
const PX = 'p'.repeat(32), MT = 'm'.repeat(32);
Object.assign(process.env, { NTN_PROXY_TOKEN: PX, METER_DEVICE_TOKEN: MT });
const U = { 'x-ntn-proxy': 'Bearer ' + PX, 'x-ntn-user': 'gui@ex.com', 'x-ntn-role': 'admin' };
const cmd = async (method, body) => { const r = await h(new Request('https://x/.netlify/functions/ntn-lab?cmd=1', { method, headers: U, body: body ? JSON.stringify(body) : undefined })); return { st: r.status, j: await r.json() }; };
const meter = async () => (await h(new Request('https://x/.netlify/functions/ntn-lab?meter=1&days=2'))).json();
const now = Date.now(), m = 60000, iso = (x) => new Date(x).toISOString(), day = 'meter/' + iso(now).slice(0, 10), lday = 'local/' + iso(now).slice(0, 10);
const reset = () => M.clear();
const put = (k, v) => M.set(k, JSON.stringify(v));
const get = (k) => (M.has(k) ? JSON.parse(M.get(k)) : null);
const tel = (ago, net = 'catm', up) => ({ type: 'telemetry', dv: 'm1', net, rx: iso(now - ago), ts: iso(now - ago), seq: Math.round(ago), up });
const ev = (ago, event, extra = {}) => ({ type: 'event', dv: 'm1', event, rx: iso(now - ago), ts: iso(now - ago), ...extra });
const loc = (ago, estado) => ({ type: 'local', fonte: 'usb', estado, rx: iso(now - ago), ts: iso(now - ago) });

// 1) USB em busca: STATE BUSCA recente mantém em busca e conta como último dado
{
  const recs = [tel(20 * m), ev(18 * m, 'sat_start'), loc(2 * m, 'BUSCA')];
  const a = L.offlineAvalia(recs, now); assert.equal(a.busca, true); assert.equal(a.offline, false); assert.equal(a.limMs, 5 * m);
  assert.equal(SD.semComunicacao(now - 2 * m, now, true).offline, false);
  assert.equal(SD.emBusca([tel(20 * m), ev(18 * m, 'sat_start')], now), true);
}
// 2) offline em busca: 6 min sem nada => offline, sessão encerrada uma vez, comando cancelado
{
  reset(); put(day, [tel(30 * m), ev(20 * m, 'sat_start')]); put(lday, [loc(6 * m, 'BUSCA')]);
  const a = L.offlineAvalia(get(day).concat(get(lday)), now); assert.equal(a.offline, true); assert.equal(a.busca, true);
  assert.equal(SD.semComunicacao(now - 6 * m, now, true).offline, true);
  assert.equal(SD.TXT_OFF, 'Desligada / sem comunicação');
  const c = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd; assert.ok(c);
  // GET ?cmd=1 é a leitura preguiçosa
  let g = (await cmd('GET')).j.cmd; assert.equal(g.status, 'cancelado_offline'); assert.ok(g.canceladoEm);
  assert.ok(get('cmd/hist').some((x) => x.cid === c.cid && x.status === 'cancelado_offline'), 'histórico');
  const fins = get(day).filter((r) => r.event === 'off_end'); assert.equal(fins.length, 1); assert.equal(fins[0].info, 'encerrada: offline'); assert.equal(fins[0].srv, 1);
  // 3) idempotência: novas leituras não duplicam nem mexem
  await meter(); await cmd('GET'); await meter();
  assert.equal(get(day).filter((r) => r.event === 'off_end').length, 1);
  assert.equal(get('cmd/hist').filter((x) => x.cid === c.cid).length, 1);
  // evento de servidor não conta como dado da placa
  const a2 = L.offlineAvalia(get(day).concat(get(lday)), now); assert.equal(a2.lastRx, now - 6 * m); assert.equal(a2.busca, false);
  // libera novo comando
  assert.equal((await cmd('POST', { acao: 'criar', cmd: 'sat' })).st, 201);
  // tela: sessão encerrada não está mais em busca
  assert.equal(SD.emBusca(get(day), now), false);
}
// 4) offline em Cat-M: 2,5x o intervalo (2 min => 5 min)
{
  const ok = [tel(8 * m), tel(6 * m), tel(4 * m)], off = [tel(10 * m), tel(8 * m), tel(6 * m)];
  assert.equal(L.offlineAvalia(ok, now).offline, false); assert.equal(L.offlineAvalia(ok, now).limMs, 5 * m);
  assert.equal(L.offlineAvalia(off, now).offline, true); assert.equal(L.offlineAvalia(off, now).busca, false);
  assert.equal(SD.semComunicacao(now - 4 * m, now, false, 2 * m).offline, false);
  assert.equal(SD.semComunicacao(now - 6 * m, now, false, 2 * m).offline, true);
  assert.equal(SD.semComunicacao(now - 9 * m, now, false, 4 * m).offline, false, 'intervalo de 4 min => 10 min');
  reset(); put(day, off);
  const c = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
  await meter();
  assert.equal(get('cmd/atual').status, 'cancelado_offline', 'cancela também em Cat-M'); assert.equal(get('cmd/atual').cid, c.cid);
  assert.equal(get(day).filter((r) => r.event === 'off_end').length, 0, 'sem sessão de busca, nada a encerrar');
}
// 5) nuvem normal: nada muda
{
  reset(); const base = [tel(5 * m), tel(3 * m), tel(1 * m)]; put(day, base);
  const c = (await cmd('POST', { acao: 'criar', cmd: 'sat' })).j.cmd;
  await meter(); await cmd('GET');
  assert.equal(get('cmd/atual').status, 'pendente'); assert.deepEqual(get(day), JSON.parse(JSON.stringify(base))); assert.equal(get('cmd/atual').cid, c.cid);
}
// 6) timeout 20 min do fw 2.1: {t:'e',e:'fail',i:'ntn_timeout'}
{
  const r = L.parse ? null : null; void r;
  const t = ev(1 * m, 'fail', { info: 'ntn_timeout' });
  assert.equal(L.ehTimeoutNtn(t), true); assert.equal(SD.ehTimeoutNtn(t), true);
  assert.equal(SD.ehTimeoutNtn({ type: 'satsum', why: '20min' }), true);
  assert.equal(SD.ehTimeoutNtn(ev(1 * m, 'fail', { info: 'timeout' })), false, 'falha de envio comum não é o timeout');
  const recs = [tel(30 * m), ev(25 * m, 'sat_start'), ev(24 * m, 'sat_search'), t];
  assert.equal(SD.emBusca(recs, now), false); assert.equal(L.emBuscaSrv(recs), false);
  assert.equal(SD.voltouCatm(recs, now - 25 * m), true);
  assert.equal(SD.TXT_TIMEOUT, 'Sem registro em 20 min, voltou ao Cat-M');
  // o ingest real grava event 'fail' com info 'ntn_timeout'
  reset();
  await h(new Request('https://x/.netlify/functions/ntn-lab?ingest=1', { method: 'POST', headers: { Authorization: 'Bearer ' + MT }, body: JSON.stringify({ t: 'e', s: 9, u: 99, n: 'c', e: 'fail', i: 'ntn_timeout', x: 20 }) }));
  const g = get(day).pop(); assert.equal(g.event, 'fail'); assert.equal(g.info, 'ntn_timeout'); assert.equal(L.ehTimeoutNtn(g), true);
  const u = readFileSync(new URL('../utilities/utilities.js', import.meta.url), 'utf8');
  assert.match(u, /close\(t, 'Sem registro em 20 min, voltou ao Cat-M'\)/); assert.match(u, /close\(t, 'encerrada: offline'\)/);
}
// 7) recebido encerrado: reboot, STATE CATM, Cat-M sem busca; caso real ff99e7fc
{
  const c = { cid: 'ff99e7fc', cmd: 'sat', status: 'recebido', recebidoEm: iso(now - 15 * m) };
  const rx = ev(15 * m, 'cmd_rx', { info: 'ff99e7fc', value: 1, up: 5000 });
  assert.equal(L.fimRecebido(c, [rx, ev(2 * m, 'boot', { up: 5 })]).status, 'encerrado_reboot');
  assert.equal(L.fimRecebido(c, [rx, tel(2 * m, 'catm', 20)]).status, 'encerrado_reboot', 'uptime menor');
  assert.equal(L.fimRecebido(c, [rx, loc(3 * m, 'CATM')]).status, 'encerrado_catm');
  assert.equal(L.fimRecebido(c, [rx, tel(3 * m, 'catm', 6000)]).status, 'encerrado_catm');
  assert.equal(L.fimRecebido(c, [rx, ev(14 * m, 'sat_start', { up: 5100 }), tel(3 * m, 'catm', 6000)]), null, 'Cat-M com busca aberta não encerra');
  assert.equal(L.fimRecebido(c, [rx, tel(14.5 * m, 'catm', 5010)]), null, 'carência de 90 s');
  assert.equal(L.fimRecebido({ ...c, status: 'recusado' }, [rx, ev(2 * m, 'boot')]), null);
  // pelo handler: ingest depois do recebido encerra; idempotente
  reset(); put(day, [rx]); put('cmd/atual', c);
  await h(new Request('https://x/.netlify/functions/ntn-lab?ingest=1', { method: 'POST', headers: { Authorization: 'Bearer ' + MT }, body: JSON.stringify({ t: 'm', s: 1600, u: 15, n: 'c' }) }));
  assert.equal(get('cmd/atual').status, 'encerrado_reboot');
  await cmd('GET'); await meter();
  assert.equal(get('cmd/hist').filter((x) => x.cid === 'ff99e7fc').length, 1);
  // pela leitura preguiçosa (dados já gravados antes do deploy)
  reset(); put(day, [rx, ev(4 * m, 'boot', { up: 3 }), tel(3 * m, 'catm', 20)]); put('cmd/atual', c);
  assert.equal((await cmd('GET')).j.cmd.status, 'encerrado_reboot');
  // tela
  const e = SC.etapas({ ...c, status: 'encerrado_reboot', criado: iso(now - 16 * m) }, [], now); assert.equal(e.fim, 'encerrado_reboot');
  const e2 = SC.etapas({ ...c, status: 'cancelado_offline', criado: iso(now - 16 * m) }, [], now); assert.equal(e2.fim, 'cancelado_offline');
}
// sem travessão nos textos novos
for (const p of ['../status-desligado.js', '../utilities/sat-cmd.js', '../utilities/hero-u.js']) assert.ok(!/—/.test(readFileSync(new URL(p, import.meta.url), 'utf8').split('\n').filter((l) => /v75|offline|encerrad|20 min/.test(l)).join('\n')), p);
console.log('utilities-offline: ok');
