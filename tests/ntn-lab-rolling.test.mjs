// node tests/ntn-lab-rolling.test.mjs: média móvel do medidor no backend (ntn-lab)
import { rollingStat, withRolling } from '../netlify/functions/ntn-lab.js';
let f = 0; const ok = (l, c) => { console.log((c ? '  OK  ' : 'FALHA ') + l); if (!c) f++; };
ok('rollingStat +20%', rollingStat([10, 10], 12).devPct === 20);
const recs = withRolling([{ type: 'event' }, { type: 'telemetry', deltaL: 10, rsrp: -80 }, { type: 'telemetry', deltaL: 15, rsrp: -88 }]);
ok('evento sem rolling', recs[0].rolling === undefined);
ok('primeira leitura sem média', recs[1].rolling.deltaL === null);
ok('segunda leitura +50% consumo, -10% rsrp', recs[2].rolling.deltaL.devPct === 50 && recs[2].rolling.rsrp.devPct === -10);
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
import { withMovement } from '../netlify/functions/ntn-lab.js';
{ let g = 0; const ok2 = (l, c) => { console.log((c ? '  OK  ' : 'FALHA ') + l); if (!c) g++; };
  const t = (i, lat) => ({ type: 'telemetry', ts: new Date(Date.parse('2026-10-14T15:00:00Z') + i * 60000).toISOString(), lat, lon: -46.6, posSrc: 'gnss' });
  const m = withMovement([t(0, -23.5), t(1, -23.4991), t(2, -23.4982), { ...t(3, -23.4982), posSrc: 'salva' }]);
  ok2('rastreador: distância ~100 m e velocidade ~6 km/h', Math.abs(m[1].move.distM - 100) < 3 && Math.abs(m[1].move.speedKmh - 6) < 0.3);
  ok2('rastreador: média móvel na 2ª posição', m[2].move.rolling.distM.n === 1);
  ok2('rastreador: posição salva ignorada', m[3].move === undefined);
  if (g) process.exit(1); }
