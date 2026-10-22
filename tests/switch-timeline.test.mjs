// node tests/switch-timeline.test.mjs (fixture: ntn/replay.json, dados reais)
import vm from 'vm'; import fs from 'fs'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const dir = dirname(fileURLToPath(import.meta.url)); const ctx = { window: {}, Date, Math, console, String, isNaN };
vm.runInNewContext(fs.readFileSync(join(dir, '../switch-timeline.js'), 'utf8'), ctx);
const { build, render, fmtDur } = ctx.window.SwitchTimeline; let f = 0;
const ok = (l, c, x = '') => { console.log((c ? '  OK  ' : 'FALHA ') + l + (c ? '' : ' ' + x)); if (!c) f++; };
const rp = JSON.parse(fs.readFileSync(join(dir, '../ntn/replay.json'), 'utf8')).records;
const sw = build(rp);
ok('replay tem 2 comutações', sw.length === 2, sw.length);
ok('1a: Cat-M para Satélite', sw[0].from === 'catm' && sw[0].to === 'ntn');
ok('1a: registrou em 748 s', sw[0].ok === true && sw[0].regSec === 748, sw[0].regSec);
ok('1a: GNSS com fix em 104 s', sw[0].gnss === 'fix' && sw[0].fixSec === 104);
ok('1a: RSRP -133 da telemetria NTN 5 s após o reg, SNR sem dados', sw[0].rsrp === -133 && sw[0].snr === null, sw[0].rsrp);
ok('1a: posição da comutação', sw[0].lat === -23.545 && sw[0].lon === -46.781);
ok('2a: Satélite para Cat-M em 2 s', sw[1].to === 'catm' && sw[1].regSec === 2);
const html = render(null, sw);
ok('render tem ver no mapa', html.includes('ver no mapa') && html.includes('data-lat="-23.545"'));
ok('render: RSRP -133 dBm e SNR sem dados', html.includes('RSRP -133 dBm') && html.includes('SNR sem dados'));
ok('render sem travessão', !html.includes('\u2014'));
// medidor: sat_start + sw + gnss_ok + sat_reg com rsrp/snr
const m = build([
  { type: 'event', event: 'sat_start', ts: '2026-10-15T03:00:00Z', lat: -23.5, lon: -46.7 },
  { type: 'event', event: 'sw', value: 1, ts: '2026-10-15T03:00:05Z' },
  { type: 'event', event: 'gnss_ok', value: 30, ts: '2026-10-15T03:00:40Z' },
  { type: 'event', event: 'sat_reg', value: 472, regSecs: 472, rsrp: -118, snr: 2, net: 'ntn', ts: '2026-10-15T03:08:00Z' },
  { type: 'event', event: 'sw', value: 1, ts: '2026-10-15T04:00:00Z' },
  { type: 'event', event: 'fail', info: 'timeout', ts: '2026-10-15T04:10:00Z' }]);
ok('medidor: sat_start e sw viram 1 tentativa', m.length === 2, m.length);
ok('medidor: rsrp/snr do sat_reg', m[0].rsrp === -118 && m[0].snr === 2 && m[0].regSec === 472);
ok('medidor: falha = não registrou', m[1].ok === false && render(null, [m[1]]).includes('não registrou'));
const m2 = build([
  { type: 'event', event: 'sat_start', ts: '2026-10-15T02:55:47Z' },
  { type: 'event', event: 'reg', value: 184, net: 'catm', ts: '2026-10-15T02:56:07Z' },
  { type: 'event', event: 'sat_reg', value: 86, regSecs: 86, rsrp: -120, net: 'ntn', ts: '2026-10-15T02:57:48Z' },
  { type: 'event', event: 'boot', ts: '2026-10-15T03:10:00Z' },
  { type: 'event', event: 'sat_start', ts: '2026-10-15T03:28:00Z' },
  { type: 'event', event: 'reg', value: 6, net: 'catm', ts: '2026-10-21T17:34:00Z' }]);
ok('medidor: ignora reg Cat-M e usa sat_reg', m2[0].regSec === 86 && m2[0].rsrp === -120, m2[0].regSec);
ok('medidor: reg Cat-M dias depois não conta', m2[1].ok === null, m2[1].ok);
ok('vazio', render(null, []).includes('Nenhuma comutação'));
ok('fmtDur', fmtDur(748) === '12 min 28 s' && fmtDur(null) === 'sem dados');
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
