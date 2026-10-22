// node tests/health-badge.test.mjs
import vm from 'vm'; import fs from 'fs'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const dir = dirname(fileURLToPath(import.meta.url)); const ctx = { window: {}, Date, Math, console, String, isNaN };
vm.runInNewContext(fs.readFileSync(join(dir, '../health-badge.js'), 'utf8'), ctx);
const { compute } = ctx.window.HealthBadge; let f = 0;
const ok = (l, c, x = '') => { console.log((c ? '  OK  ' : 'FALHA ') + l + (c ? '' : ' ' + x)); if (!c) f++; };
const now = Date.parse('2026-10-22T13:00:00Z');
const serie = (lastAgoS, iv, net = 'catm') => Array.from({ length: 10 }, (_, i) => { const t = new Date(now - lastAgoS * 1000 - (9 - i) * iv * 1000).toISOString(); return { type: 'telemetry', ts: t, rx: t, net, rsrp: -95 }; });
let h = compute(serie(30, 60), now); ok('online (30 s, intervalo 60 s)', h.state === 'online', h.state);
ok('rsrp da ultima leitura', h.rsrp === -95); ok('mediana 60 s', h.ivMedian === 60, h.ivMedian);
h = compute(serie(120, 60), now); ok('atrasado (120 s, intervalo 60 s)', h.state === 'atrasado', h.state);
h = compute(serie(200, 60), now); ok('parado (200 s, intervalo 60 s)', h.state === 'parado', h.state);
h = compute(serie(320, 600), now); ok('parado por hard-limit Cat-M 300 s', h.state === 'parado', h.state);
h = compute(serie(320, 600, 'ntn'), now); ok('NTN 320 s com intervalo 600 s fica online', h.state === 'online' && h.net === 'ntn', h.state);
h = compute([], now); ok('sem registros = parado', h.state === 'parado' && h.ageSec === null);
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
