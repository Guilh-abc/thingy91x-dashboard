// landing.test.mjs: página pública na raiz, painel real em /app/, /entrar redireciona por papel.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const raiz = new URL('..', import.meta.url).pathname;
const ler = (p) => readFileSync(raiz + p, 'utf8');
const carregar = (p) => { const module = { exports: {} }; vm.runInNewContext(ler(p), { module }); return module.exports; };

const landing = ler('index.html');
assert.match(landing, /IoT <b>Cat-M \+ NTN<\/b>/);
assert.doesNotMatch(landing, /BMW|Telecom/i);
assert.match(landing, /Dados de exemplo/);
assert.match(landing, /entre com sua conta Google ou receba um código por e-mail/);
assert.match(landing, /href="entrar\/"/);
assert.doesNotMatch(landing, /<script[^>]+src="(?!icons\.js)/, 'landing só carrega icons.js');
assert.doesNotMatch(landing, /api\/|netlify|nrfcloud/i, 'landing sem chamadas de dados');
assert.doesNotMatch(landing + ler('landing.css'), /[\u2013\u2014]/);

const app = ler('app/index.html');
assert.ok(existsSync(raiz + 'app/index.html'));
for (const m of app.matchAll(/(?:src|href)="([^"#]+)"/g)) {
  const v = m[1];
  if (/^(https?:|mailto:|\.\/|\.\.\/|boas-vindas\.js|hub\.js)/.test(v)) continue;
  assert.fail('caminho relativo sem ../ em app/index.html: ' + v);
}
for (const p of ['ntn/index.html', 'utilities/index.html', 'consumo/index.html', 'relatorio-demo/index.html'])
  assert.match(ler(p), /href="\.\.\/app\/"[^>]*>Início do sistema/, p);

const { destino } = carregar('entrar/entrar.js');
assert.equal(destino({ role: 'admin' }), '../app/?bemvindo=1');
assert.equal(destino({ role: 'viewer' }), '../relatorio-demo/');
assert.equal(destino(null), null);
const { deveMostrar } = carregar('app/boas-vindas.js');
assert.equal(deveMostrar('?bemvindo=1', null), true);
assert.equal(deveMostrar('?bemvindo=1', '1'), false);
assert.equal(deveMostrar('', null), false);
console.log('landing ok');
