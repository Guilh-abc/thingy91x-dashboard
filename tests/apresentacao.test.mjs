// node tests/apresentacao.test.mjs
import vm from 'vm'; import fs from 'fs'; import { fileURLToPath } from 'url'; import { dirname, join } from 'path';
const dir = dirname(fileURLToPath(import.meta.url));
const ctx = { window: {}, location: { search: '?modo=apresentacao&rot=5', pathname: '/ntn/' }, URLSearchParams, console, setTimeout, setInterval, clearInterval, Math, parseInt };
vm.runInNewContext(fs.readFileSync(join(dir, '../apresentacao.js'), 'utf8'), ctx);
const { proximo } = ctx.window.Apresentacao; let f = 0;
const ok = (l, c, x = '') => { console.log((c ? '  OK  ' : 'FALHA ') + l + (c ? '' : ' ' + x)); if (!c) f++; };
ok('ntn para utilities', proximo('/ntn/') === '../utilities/');
ok('utilities para consumo', proximo('/thingy91x-dashboard/utilities/index.html') === '../consumo/');
ok('consumo volta para ntn', proximo('/consumo/') === '../ntn/');
ok('outra página não rotaciona', proximo('/ntn/connect.html') === null);
console.log(f ? 'FALHAS: ' + f : 'TODOS OK'); if (f) process.exit(1);
