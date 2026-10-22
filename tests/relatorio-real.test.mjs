import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const raiz = new URL('../', import.meta.url).pathname;
const ctx = {}; new Function('globalThis', readFileSync(raiz + 'app/relatorio/relatorio-real.js', 'utf8').replace(/typeof window !== 'undefined' \? window : globalThis/, 'globalThis'))(ctx);
const R = ctx.RelReal;
assert.equal(R.arred(-23.5612345), -23.561);
const t0 = Date.parse('2026-10-22T12:00:00Z');
const recs = [
  { type: 'telemetry', ts: new Date(t0).toISOString(), bytes: 200, txNet: 'catm', rsrp: -80, mv: 5200, deltaL: 2, lat: -23.5612345, lon: -46.6512345, iccid: '8955000000001234', counters: { ok: 10, fail: 1 } },
  { type: 'alarm', ts: new Date(t0 + 600000).toISOString(), bytes: 80, txNet: 'ntn', event: 'leak', value: 0, lat: -23.5612, lon: -46.6512 },
  { type: 'telemetry', ts: new Date(t0 + 1200000).toISOString(), bytes: 210, txNet: 'catm', rsrp: -90, mv: 5100, deltaL: 3, counters: { ok: 14, fail: 1 } }
];
const d = R.calcular(R.filtrar(recs, t0 - 1, t0 + 3600000), 'meter');
assert.equal(d.n, 3); assert.equal(d.al.length, 1); assert.equal(d.ntn, 1); assert.equal(d.trocas, 2);
assert.equal(d.litros, 5); assert.equal(d.ok, 4); assert.equal(d.fail, 0); assert.equal(d.rsrpMed, -85);
assert.equal(d.porHora.reduce((a, b) => a + b, 0), 5);
const csv = R.csv(recs);
assert.doesNotMatch(csv, /-23\.5612345|8955000000001234|counters/);
assert.match(csv, /lat \(~100 m\)/); assert.match(csv, /-23\.561/);
const html = readFileSync(raiz + 'app/relatorio/index.html', 'utf8');
const demo = readFileSync(raiz + 'relatorio-demo/index.html', 'utf8');
for (const h of ['Resumo do', 'O que o módulo', 'Paradas e locais', 'Linha do tempo', 'Padrões por hora', 'Padrões por dia', 'Alertas', 'Sinal e bateria']) { assert.ok(html.includes(h), h); assert.ok(demo.includes(h), 'demo ' + h); }
assert.match(html, /relatorio-demo\/relatorio\.css/);
assert.doesNotMatch(html, /Dados de exemplo/);
assert.doesNotMatch(html + readFileSync(raiz + 'app/relatorio/relatorio-real.js', 'utf8'), /[\u2013\u2014]|BMW|Telecom/i);
console.log('ok  - relatório real: cálculo, privacidade, CSV e mesmas seções do demo');
