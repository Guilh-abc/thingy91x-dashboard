// node tests/movement-rules.test.mjs: regras A a E do Rastreador e da raiz (deslocamento), F da raiz e privacidade
import vm from 'vm'; import fs from 'fs'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const dir = dirname(fileURLToPath(import.meta.url)); const ctx = { window: {}, Date, Math, console, String, isNaN, isFinite, JSON, Number };
vm.runInNewContext(fs.readFileSync(join(dir, '../utilities/alert-rules.js'), 'utf8'), ctx);
vm.runInNewContext(fs.readFileSync(join(dir, '../movement-rules.js'), 'utf8'), ctx);
const E = ctx.window.MovementRules.create(ctx.window.AlertRules, {}); let f = 0;
const ok = (l, c, x = '') => { console.log((c ? '  OK  ' : 'FALHA ') + l + (c ? '' : ' ' + x)); if (!c) f++; };
const t0 = Date.parse('2026-10-14T15:00:00Z'), M = 0.0009; // ~100 m de latitude
const pos = (stepsM) => { let lat = -23.5; return [{ type: 'telemetry', seq: 0, ts: new Date(t0).toISOString(), lat, lon: -46.6 }].concat(stepsM.map((m, i) => { lat += (m / 100) * M; return { type: 'telemetry', seq: i + 1, ts: new Date(t0 + (i + 1) * 60000).toISOString(), lat, lon: -46.6 }; })); };
const run = (steps, nowAdd = 0) => { const rs = pos(steps); return E.compute(rs, Date.parse(rs[rs.length - 1].ts) + nowAdd); };
let r = run([100, 100, 100, 100, 150]); ok('A: velocidade/distância 50% acima dispara vermelho', r.active.some((a) => a.rule === 'A' && a.metric === 'distM'), JSON.stringify(r.active));
r = run([100, 100, 100, 100, 110]); ok('A: 10% acima não dispara', !r.active.some((a) => a.rule === 'A'));
r = run([100, 100, 100, 100, 60]); ok('B: 40% abaixo dispara "Possível falha de GPS ou equipamento desligado"', r.active.some((a) => a.rule === 'B' && /Possível falha de GPS ou equipamento desligado/.test(a.message)));
r = run([100, 100, 200, 300, 400, 600, 900]); ok('C: 5 seguidas fora do padrão dispara tendência', r.fired.some((a) => a.rule === 'C'), JSON.stringify(r.fired.map((a) => a.rule + a.metric)));
r = run([100, 100, 100, 100], 10 * 60000); ok('E: 10 min com intervalo 1 min dispara "Sem posições há 10 min, verificar conexão"', r.active.some((a) => a.rule === 'E' && a.message === 'Sem posições há 10 min, verificar conexão'), JSON.stringify(r.active));
r = run([100, 100, 100, 100], 60000); ok('E: dentro do intervalo não dispara', !r.active.some((a) => a.rule === 'E'));
// D noturno: 02:00 BRT = 05:00Z em dias seguidos
const n = (d, latOff) => ({ type: 'telemetry', seq: 50 + d, ts: new Date(Date.parse('2026-10-10T05:00:00Z') + d * 3600000 * 0.1).toISOString(), lat: -23.5 + latOff, lon: -46.6 });
r = E.compute([n(0, 0), n(1, M), n(2, 2 * M), n(3, 3 * M), n(4, 6 * M)], Date.parse('2026-10-10T05:30:00Z'));
ok('D: movimento noturno 3x a média noturna dispara', r.fired.some((a) => a.rule === 'D' && /Movimento noturno atípico/.test(a.message)), JSON.stringify(r.fired));
ok('privacidade: sem lat/lon nas leituras e alertas', !JSON.stringify(r.readings).includes('"lat"') && !JSON.stringify(r.fired).includes('-23.'));
r = E.compute([], Date.now()); ok('sem dados: nada dispara', r.fired.length === 0 && r.last === null);
const B = ctx.window.MovementRules.create(ctx.window.AlertRules, { dropMessage: 'Possível interferência ou chip sem cobertura' });
const rs = pos([100, 100, 100, 100, 60]); r = B.compute(rs, Date.parse(rs[rs.length - 1].ts));
ok('raiz B: "Possível interferência ou chip sem cobertura"', r.active.some((a) => a.rule === 'B' && /Possível interferência ou chip sem cobertura/.test(a.message)));
// F (raiz): sensores novos e que sumiram
const ctx2 = { window: { AlertRules: ctx.window.AlertRules, MovementRules: ctx.window.MovementRules, AlertsPanel: {}, location: {} }, Date, Math, console, String, isNaN, isFinite, JSON, Number, setTimeout: () => 0, setInterval: () => 0, fetch: () => Promise.reject(new Error('x')) };
vm.runInNewContext(fs.readFileSync(join(dir, '../root-alerts.js'), 'utf8'), ctx2);
const now = Date.parse('2026-10-22T15:00:00Z'), msg = (id, hAgo) => ({ receivedAt: new Date(now - hAgo * 3600000).toISOString(), message: { appId: id } });
const ch = ctx2.window.RootAlerts.sensorChanges([msg('BATTERY', 48), msg('BATTERY', 47), msg('BATTERY', 46), msg('BATTERY', 45), msg('TEMP', 2)], now);
ok('F: sensor novo detectado', ch.some((c) => c.value === 'TEMP' && /Sensor novo/.test(c.message)), JSON.stringify(ch));
ok('F: sensor que sumiu detectado (alerta único)', ch.some((c) => c.value === 'BATTERY' && /^Telemetria \(BATTERY\) sem dados desde 20\/10, há 1 dia e 21 h$/.test(c.message)), JSON.stringify(ch));
const ch2 = ctx2.window.RootAlerts.sensorChanges(['HUMID', 'AIR_PRESS', 'TEMP', 'BATTERY'].flatMap((id) => [400, 399, 398, 396].map((h) => msg(id, h))), now);
const gone = ch2.filter((c) => /Telemetria/.test(c.message));
ok('F: 4 sensores parados viram UM alerta, sem minutos', gone.length === 1 && /AIR_PRESS, BATTERY, HUMID, TEMP/.test(gone[0].message) && /há 16 dias e 12 h/.test(gone[0].message) && !/minutos/.test(gone[0].message), JSON.stringify(gone));
const ch3 = ctx2.window.RootAlerts.sensorChanges(['HUMID', 'AIR_PRESS', 'TEMP', 'BATTERY'].flatMap((id) => [400, 399, 398, 396].map((h) => msg(id, h))), now + 3600000);
ok('F: mesma chave depois (não reabre)', ch3.filter((c) => /Telemetria/.test(c.message))[0].seq === gone[0].seq);
r = run([100, 100, 100, 100, 100, 10, 5, 0, 3, 0, 2, 0]); ok('parado: queda para menos de 50 m não dispara B nem C', !r.fired.some((a) => a.rule === 'B' || a.rule === 'C'), JSON.stringify(r.fired.map((a) => a.rule)));
r = run([0, 2, 0, 1, 0, 3, 0, 0, 1, 0]); ok('carro parado o tempo todo: sem alertas A a C', !r.fired.some((a) => /[ABC]/.test(a.rule)), JSON.stringify(r.fired.map((a) => a.rule)));
for (const file of ['movement-rules.js', 'root-alerts.js', 'utilities/alerts-panel.js', 'ntn/alerts-trk.js']) ok('sem travessão em ' + file, !fs.readFileSync(join(dir, '..', file), 'utf8').includes('\u2014'));
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
