// node tests/alerts-ui.test.mjs
import vm from 'vm'; import fs from 'fs'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const dir = dirname(fileURLToPath(import.meta.url)); const ctx = { window: {}, Date, Math, console, String, isNaN, JSON };
vm.runInNewContext(fs.readFileSync(join(dir, '../ntn/alerts-ui.js'), 'utf8'), ctx);
const { compute, html } = ctx.window.AlertsUI; let f = 0;
const ok = (l, c, x = '') => { console.log((c ? '  OK  ' : 'FALHA ') + l + (c ? '' : ' ' + x)); if (!c) f++; };
const now = Date.parse('2026-10-22T13:00:00Z'), C = { minMin: 15, minMsgs: 3, maxM: 50 };
const tel = (minAgo, lat, lon, extra = {}) => Object.assign({ type: 'telemetry', ts: new Date(now - minAgo * 60000).toISOString(), lat, lon, posSrc: 'gnss', bytes: 200, net: 'catm' }, extra);
// parado 20 min, 5 mensagens
let a = compute([20, 15, 10, 5, 1].map((m) => tel(m, -23.5470, -46.7790)), now, C, true);
ok('parado 20 min com 5 msgs dispara', a.on && a.msgs === 5 && a.bytes === 1000, JSON.stringify(a));
ok('texto do alerta', html(a).includes('Veículo parado há 20 min') && html(a).includes('1000 B') && !html(a).includes('\u2014'), html(a));
a = compute([20, 15, 10, 5, 1].map((m, i) => tel(m, -23.5470 + i * 0.002, -46.7790)), now, C, true);
ok('em movimento não dispara', !a.on && a.reason === 'em movimento', a.reason);
a = compute([20, 1].map((m) => tel(m, -23.547, -46.779)), now, C, true);
ok('só 2 mensagens não dispara', !a.on && a.reason === 'poucas mensagens', a.reason);
a = compute([20, 15, 10, 5, 1].map((m) => tel(m, -23.547, -46.779, { posSrc: 'celula' })), now, C, true);
ok('posição por célula não serve', !a.on && a.reason === 'sem GPS');
a = compute([20, 15, 10, 5, 1].map((m) => tel(m, -23.547, -46.779)), now, C, false);
ok('aparelho fora do ar não dispara', !a.on);
a = compute([], now, C, null); ok('sem dados não dispara', !a.on && html(a) === '');
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
