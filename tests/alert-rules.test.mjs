// node tests/alert-rules.test.mjs: regras A a E, média móvel e histórico de alertas do Utilities
import vm from 'vm'; import fs from 'fs'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const dir = dirname(fileURLToPath(import.meta.url)); const ctx = { window: {}, Date, Math, console, String, isNaN, isFinite, JSON };
vm.runInNewContext(fs.readFileSync(join(dir, '../utilities/alert-rules.js'), 'utf8'), ctx);
const R = ctx.window.AlertRules; let f = 0;
const ok = (l, c, x = '') => { console.log((c ? '  OK  ' : 'FALHA ') + l + (c ? '' : ' ' + x)); if (!c) f++; };
const t0 = Date.parse('2026-10-22T15:00:00Z'); // 12:00 BRT
const rd = (i, deltaL, extra = {}) => ({ type: 'telemetry', seq: i, ts: new Date(t0 + i * 120000).toISOString(), deltaL, rsrp: -80, snr: 8, ...extra });
const serie = (vals) => vals.map((v, i) => rd(i, v));
// média móvel
let s = R.rollingStat([10, 10, 10], 12); ok('média de 3 leituras e desvio +20%', s.mean === 10 && s.n === 3 && s.devPct === 20, JSON.stringify(s));
s = R.rollingStat(Array(30).fill(5), 5); ok('janela limitada a 24', s.n === 24);
ok('média zero: desvio null, nunca inventado', R.rollingStat([0, 0], 3).devPct === null);
// A
let last = (vals, now) => R.compute(serie(vals), now ?? t0 + vals.length * 120000);
let r = last([10, 10, 10, 10, 13]); ok('A: 30% acima dispara vermelho', r.active.some((a) => a.rule === 'A' && /Consumo 30% acima da média de 4 leituras/.test(a.message)), JSON.stringify(r.active));
r = last([10, 10, 10, 10, 11.5]); ok('A: 15% acima não dispara', !r.active.some((a) => a.rule === 'A'));
r = last(Array(24).fill(10).concat([13])); ok('A: com 24 leituras diz "das últimas 24 leituras"', r.active.some((a) => /das últimas 24 leituras/.test(a.message)));
// B
r = last([10, 10, 10, 10, 6]); ok('B: 40% abaixo dispara amarelo', r.active.some((a) => a.rule === 'B' && /Possível falha de sensor ou equipamento desligado/.test(a.message)));
r = last([10, 10, 10, 10, 8]); ok('B: 20% abaixo não dispara', !r.active.some((a) => a.rule === 'B'));
// C
r = last([10, 10, 11, 12, 13, 14, 15]); ok('C: 5 seguidas acima da média dispara tendência', r.fired.filter((a) => a.rule === 'C').length === 1, JSON.stringify(r.fired.map((a) => a.rule)));
r = last([10, 10, 11, 12, 5, 13, 14]); ok('C: sequência quebrada não dispara', !r.fired.some((a) => a.rule === 'C'));
// D: 01:00 BRT = 04:00Z
const nt = (day, v) => ({ type: 'telemetry', seq: 100 + day, ts: new Date(Date.parse('2026-10-15T04:00:00Z') + day * 86400000).toISOString(), deltaL: v });
r = R.compute([nt(0, 2), nt(1, 2), nt(2, 2), nt(3, 4)], Date.parse('2026-10-18T04:01:00Z'));
ok('D: noturno 2x a média noturna dispara', r.fired.some((a) => a.rule === 'D' && /Consumo noturno atípico/.test(a.message)), JSON.stringify(r.fired));
r = R.compute([nt(0, 2), nt(1, 2), nt(2, 2), nt(3, 2.5)], Date.parse('2026-10-18T04:01:00Z')); ok('D: 1,25x não dispara', !r.fired.some((a) => a.rule === 'D'));
ok('D: 14h BRT não é noturno', !R.isNightBRT(Date.parse('2026-10-22T17:00:00Z')) && R.isNightBRT(Date.parse('2026-10-22T01:30:00Z')));
// E
const sv = serie([1, 1, 1, 1, 1]); const lastT = Date.parse(sv[4].ts);
r = R.compute(sv, lastT + 5 * 60000); ok('E: 5 min com intervalo 2 min dispara cinza', r.active.some((a) => a.rule === 'E' && a.message.startsWith('Sem leituras há 5 minutos')), JSON.stringify(r.active));
r = R.compute(sv, lastT + 3 * 60000); ok('E: 3 min não dispara', !r.active.some((a) => a.rule === 'E'));
// backend rolling preferido
r = R.compute([rd(0, 10), rd(1, 50, { rolling: { deltaL: { mean: 50, n: 24, devPct: 0 } } })], t0 + 240000); ok('usa rolling do backend quando existe', !r.active.some((a) => a.rule === 'A'));
// histórico
const fired = last([10, 10, 10, 10, 13]).fired; const now = t0 + 600000;
let h = R.mergeHistory([], fired, now); h = R.mergeHistory(h, fired, now); ok('histórico sem duplicar a cada poll', h.length === fired.length && R.unreadCount(h) === fired.length);
h = R.markAllRead(h); ok('marcar todos como lidos', R.unreadCount(h) === 0);
h = R.toggleRead(h, h[0].key); ok('alternar lido/não lido', R.unreadCount(h) === 1);
ok('filtro por regra', R.filterHistory(h, 'all', 'A').every((e) => e.rule === 'A') && R.filterHistory(h, 'all', 'Z').length === 0);
h = R.mergeHistory([{ key: 'A|deltaL|1', at: now - 31 * 86400000, rule: 'A', metric: 'deltaL', read: false }], [], now); ok('entrada com mais de 30 dias sai', h.length === 0);
ok('sem travessão nas mensagens', !fs.readFileSync(join(dir, '../utilities/alert-rules.js'), 'utf8').includes('\u2014'));
r = last([10, 10, 10, 10, 6, 6, 6]); ok('B: ativo na última leitura, mas no histórico só 1 vez por sequência', r.active.some((a) => a.rule === 'B') && r.fired.filter((a) => a.rule === 'B').length === 1, JSON.stringify(r.fired.map((a) => a.rule)));
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
