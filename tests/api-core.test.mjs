// tests/api-core.test.mjs — testes unitarios de api-core.js (RF-01, B1)
// Execucao: node tests/api-core.test.mjs

import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);
const __dir = dirname(fileURLToPath(import.meta.url));

// Carrega via CJS (o modulo exporta module.exports para Node)
// Carrega como script classico (igual ao navegador) num contexto isolado
import vm from 'vm';
import fs from 'fs';
const ctx = { window: {}, Date, Math, JSON, console, String, Number, isFinite, isNaN };
vm.runInNewContext(fs.readFileSync(join(__dir, '../api-core.js'), 'utf8'), ctx);
const { dedup, fmtDur, fmtBytes, ago } = ctx.window.ApiCore;

let passed = 0, failed = 0;
function ok(label, cond, extra = '') {
  if (cond) { console.log('  OK  ' + label); passed++; }
  else       { console.error('FALHA ' + label + (extra ? ' — ' + extra : '')); failed++; }
}

// ---- dedup ----
console.log('\n=== dedup ===');
{
  const recs = [
    { rx: '2026-10-14T10:00:00Z', ts: '2026-10-14T10:00:00Z', seq: 1, type: 'telemetry', bytes: 100 },
    { rx: '2026-10-14T10:00:00Z', ts: '2026-10-14T10:00:00Z', seq: 1, type: 'telemetry', bytes: 100 }, // duplicata exata
    { rx: '2026-10-14T10:01:00Z', ts: '2026-10-14T10:01:00Z', seq: 2, type: 'telemetry', bytes: 200 },
  ];
  const d = dedup(recs);
  ok('remove duplicata exata', d.length === 2, 'got ' + d.length);
  ok('ordena por ts', Date.parse(d[0].ts) <= Date.parse(d[1].ts));
}
{
  const recs = [
    { rx: '2026-10-14T10:02:00Z', ts: '2026-10-14T10:02:00Z', seq: 3, type: 'event' },
    { rx: '2026-10-14T10:00:00Z', ts: '2026-10-14T10:00:00Z', seq: 1, type: 'telemetry' },
  ];
  const d = dedup(recs);
  ok('ordena dois registros diferentes', d[0].seq === 1 && d[1].seq === 3);
}
{
  const d = dedup([]);
  ok('array vazio retorna vazio', d.length === 0);
}
{
  // Mantém registro com mais campos em colisão
  const recs = [
    { rx: '2026-10-14T10:00:00Z', seq: 1, type: 'telemetry' },
    { rx: '2026-10-14T10:00:00Z', seq: 1, type: 'telemetry', rsrp: -95, snr: 3 },
  ];
  const d = dedup(recs);
  ok('mantém registro mais completo em colisão', d.length === 1 && d[0].rsrp === -95);
}

// ---- fmtDur ----
console.log('\n=== fmtDur ===');
ok('null retorna sem dados',   fmtDur(null)  === 'sem dados');
ok('0 s',                      fmtDur(0)     === '0 s');
ok('59 s',                     fmtDur(59)    === '59 s');
ok('60 s = 1 min 00 s',        fmtDur(60)    === '1 min 00 s');
ok('90 s = 1 min 30 s',        fmtDur(90)    === '1 min 30 s');
ok('3600 s = 1 h 00 min',      fmtDur(3600)  === '1 h 00 min');
ok('3661 s = 1 h 01 min',      fmtDur(3661)  === '1 h 01 min');
ok('arredonda para inteiro',    fmtDur(90.7)  === '1 min 31 s', fmtDur(90.7));

// ---- fmtBytes ----
console.log('\n=== fmtBytes ===');
ok('null retorna sem dados',    fmtBytes(null)    === 'sem dados');
ok('0 B',                       fmtBytes(0)       === '0 B');
ok('512 B',                     fmtBytes(512)     === '512 B');
ok('1023 B',                    fmtBytes(1023)    === '1.023 B' || fmtBytes(1023) === '1023 B', fmtBytes(1023));
ok('1024 = 1,0 KB',             fmtBytes(1024).includes('KB'));
ok('1048576 = 1,00 MB',         fmtBytes(1048576).includes('MB'));

// ---- ago ----
console.log('\n=== ago ===');
ok('null retorna sem dados',  ago(null)    === 'sem dados');
ok('string vazia sem dados',  ago('')      === 'sem dados');
{
  const agora = new Date(Date.now() - 30000).toISOString(); // 30 s atras
  ok('30 s atras',  ago(agora).startsWith('há ') && ago(agora).includes('s'), ago(agora));
}
{
  const h1 = new Date(Date.now() - 3 * 60000).toISOString(); // 3 min
  ok('3 min atras', ago(h1).includes('min'), ago(h1));
}
{
  const h2 = new Date(Date.now() - 2 * 3600000).toISOString(); // 2 h
  ok('2 h atras',   ago(h2).includes('h'), ago(h2));
}

// ---- toCSV / reportHTML (G1, RF-06) ----
console.log('\n=== toCSV ===');
{
  const { toCSV, reportHTML } = ctx.window.ApiCore;
  const csv = toCSV([
    { ts: '2026-10-22T12:00:00Z', totalL: 12.5, info: 'a;b "x"', lat: -23.561234, lon: -46.655678, iccid: '8955000000001234567', custo: 9 },
  ], ['ts', 'totalL', 'info', 'lat', 'lon', 'iccid', 'custo'], { ts: 'Data (BRT)', totalL: 'Total (L)' });
  const lines = csv.split('\r\n');
  ok('BOM no início', csv.charCodeAt(0) === 0xfeff);
  ok('cabeçalho com ; e rótulos', lines[0] === '\ufeffData (BRT);Total (L);info;lat;lon;iccid', lines[0]);
  ok('data em BRT', lines[1].startsWith('22/10/2026, 09:00:00') || lines[1].startsWith('22/10/2026 09:00:00'), lines[1]);
  ok('decimal com vírgula', lines[1].includes(';12,5;'));
  ok('aspas e ; escapados', lines[1].includes('"a;b ""x"""'));
  ok('coordenada arredondada', lines[1].includes(';-23,56;-46,66;') && !csv.includes('561234'));
  ok('ICCID mascarado', lines[1].endsWith('•••• 4567') && !csv.includes('8955000000001234567'));
  ok('coluna de custo descartada', !/custo/.test(csv) && lines[0].split(';').length === 6 && !lines[1].endsWith(';9'));
  ok('lista vazia gera só cabeçalho', toCSV([], ['ts']).split('\r\n').length === 1);
  const h = reportHTML('Relatório', [['Total', '10 L'], ['Custo estimado', 'R$ 5'], ['Fatura', 'R$ 2']], { period: 'Últimas 24 h', now: Date.parse('2026-10-22T12:00:00Z'), version: 'painel v1' });
  ok('relatório com período e data BRT', h.includes('Últimas 24 h') && h.includes('22/10/2026') && h.includes('horário de Brasília'));
  ok('relatório sem custo', !/Custo|R\$/.test(h) && h.includes('10 L'));
  ok('relatório escapa HTML', reportHTML('<b>x</b>', []).includes('&lt;b&gt;'));
  ok('sem travessão', !/\u2014/.test(csv + h));
}

// ---- resultado ----
console.log('\n' + (failed === 0 ? 'TODOS OK' : 'FALHAS: ' + failed) + ': ' + passed + ' passaram, ' + failed + ' falharam');
if (failed > 0) process.exit(1);
