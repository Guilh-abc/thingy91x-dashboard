import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const raiz = new URL('../', import.meta.url).pathname;
const ctx = {}; new Function('globalThis', readFileSync(raiz + 'shell.js', 'utf8').replace(/typeof window !== 'undefined' \? window : globalThis/, 'globalThis'))(ctx);
const S = ctx.Shell;
assert.deepEqual(S.itensPara('viewer').map((i) => i.id), ['relatorio-demo']);
assert.ok(S.itensPara('admin').some((i) => i.id === 'acessos'));
assert.equal(S.inicioPara('viewer'), 'relatorio-demo/');
assert.equal(S.inicioPara('admin'), 'app/');
assert.deepEqual(S.trilha('ntn', 'admin'), [{ rotulo: 'Início', href: 'app/' }, { rotulo: 'Rastreador' }]);
assert.deepEqual(S.trilha('app', 'admin'), [{ rotulo: 'Início' }]);
const src = readFileSync(raiz + 'shell.js', 'utf8') + readFileSync(raiz + 'shell.css', 'utf8');
assert.match(src, /cdn-cgi\/access\/logout/);
assert.match(src, /IoT <b>Cat-M \+ NTN<\/b>/);
assert.doesNotMatch(src, /[\u2013\u2014]|BMW|Telecom/i);
for (const p of ['app/index.html', 'ntn/index.html', 'utilities/index.html', 'consumo/index.html', 'admin/acessos/index.html', 'relatorio-demo/index.html']) {
  const h = readFileSync(raiz + p, 'utf8');
  assert.match(h, /shell\.js\?v=\d+" data-pagina="/, p);
  assert.doesNotMatch(h, /wordmark">Connect/, p);
}
for (const a of ['hero-veicular', 'medidor', 'dashboard', 'placa']) assert.ok(readFileSync(raiz + 'assets/' + a + '.webp').length < 120000, a);
console.log('ok  - shell: navegação comum, papéis, trilha, marca e imagens');
