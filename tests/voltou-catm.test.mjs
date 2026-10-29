import assert from 'node:assert/strict';
await import('../status-desligado.js');
const SD = globalThis.StatusDesligado;
const ini = Date.parse('2026-10-29T19:00:00Z'); // teste iniciado 16:00 BRT
const rx = (m) => new Date(ini + m * 60000).toISOString();
// 1) Cat-M recebido após o início encerra (STATE|CATM e telemetria n:'c'/net catm)
const base = [{ type: 'event', event: 'sat_start', ts: rx(0), rx: rx(0) }, { type: 'event', event: 'sat_search', ts: rx(1), rx: rx(1) }];
assert.equal(SD.voltouCatm(base, ini - 1), false, 'só busca: segue satélite');
assert.equal(SD.voltouCatm([...base, { estado: 'CATM', rx: rx(4) }], ini), true, 'STATE|CATM encerra');
assert.equal(SD.voltouCatm([...base, { type: 'telemetry', n: 'c', r: -96, rx: rx(5) }], ini), true, "n:'c' encerra");
assert.equal(SD.voltouCatm([...base, { type: 'telemetry', net: 'catm', rx: rx(6) }], ini), true, 'net catm encerra');
// Cat-M antes do início não encerra
assert.equal(SD.voltouCatm([{ type: 'telemetry', net: 'catm', rx: rx(-3) }, ...base], ini), false, 'Cat-M anterior não conta');
// 2) seq repetido após reboot (ts antigo da placa, rx novo) não bloqueia
const rep = [1455, 1456, 1457, 1458, 1459].map((seq, i) => ({ type: 'telemetry', net: 'catm', seq, ts: rx(-30 + i), rx: rx(5 + i * 0.1) }));
assert.equal(SD.voltouCatm([...base, { type: 'telemetry', net: 'catm', seq: 1459, ts: rx(-25), rx: rx(-25) }, ...rep], ini), true, 'seq repetido decide pelo rx');
// satélite recebido depois do Cat-M volta a valer
assert.equal(SD.voltouCatm([...base, { estado: 'CATM', rx: rx(4) }, { type: 'event', event: 'sat_search', rx: rx(7) }], ini), false, 'satélite mais novo vence');
console.log('voltou-catm OK');
