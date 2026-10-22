// node tests/ntn-lab-rolling.test.mjs: média móvel do medidor no backend (ntn-lab)
import { rollingStat, withRolling } from '../netlify/functions/ntn-lab.js';
let f = 0; const ok = (l, c) => { console.log((c ? '  OK  ' : 'FALHA ') + l); if (!c) f++; };
ok('rollingStat +20%', rollingStat([10, 10], 12).devPct === 20);
const recs = withRolling([{ type: 'event' }, { type: 'telemetry', deltaL: 10, rsrp: -80 }, { type: 'telemetry', deltaL: 15, rsrp: -88 }]);
ok('evento sem rolling', recs[0].rolling === undefined);
ok('primeira leitura sem média', recs[1].rolling.deltaL === null);
ok('segunda leitura +50% consumo, -10% rsrp', recs[2].rolling.deltaL.devPct === 50 && recs[2].rolling.rsrp.devPct === -10);
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
