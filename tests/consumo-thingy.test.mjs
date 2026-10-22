import assert from 'node:assert'; import { readFileSync } from 'node:fs';
const raiz = new URL('../', import.meta.url).pathname, ler = (f) => readFileSync(raiz + f, 'utf8');
const ctx = {}; new Function('root', ler('thingy-dados.js').replace(/\}\)\(typeof window[^)]*\);?\s*$/, '})(root);'))(ctx);
const T = ctx.ThingyDados; assert.ok(T && T.envios, 'envios exportado');
// Dados de exemplo: 1 GNSS + posição GNSS duplicada (deduplica) + 1 Wi-Fi.
const t0 = Date.parse('2026-10-20T12:00:00Z');
const e = T.envios([{ message: { appId: 'GNSS', ts: t0, data: {} } }], [{ recordedAt: new Date(t0 + 30000).toISOString(), serviceType: 'GNSS' }, { recordedAt: new Date(t0 + 9e5).toISOString(), serviceType: 'WIFI' }]);
assert.equal(e.length, 2); assert.equal(e[1].b, 74);
const tot = e.reduce((s, x) => s + x.b, 0), m = T.medidor([{ message: { appId: 'GNSS', ts: t0, data: {} } }], t0 + 1e6, [{ recordedAt: new Date(t0 + 30000).toISOString(), serviceType: 'GNSS' }, { recordedAt: new Date(t0 + 9e5).toISOString(), serviceType: 'WIFI' }]);
assert.equal(m.hoje, tot, 'envios e medidor batem');
const c = ler('consumo/consumo.js'), h = ler('consumo/index.html');
assert.ok(/value="thingy"/.test(h) && /id="estNota"/.test(h));
assert.ok(/Thingy:91X \(chip Telekom Cat-M\)/.test(c) && /sem chave/.test(c) && /não se aplica/.test(c));
assert.ok(/controllerchange/.test(ler('pwa.js')) && /ntn-v56/.test(ler('service-worker.js')));
console.log('consumo-thingy ok');
for (const p of ['utilities/index.html', 'ntn/index.html', 'consumo/index.html', 'rastreador/thingy91x/index.html', 'admin/acessos/index.html', 'ntn/firmware.html'])
  assert.ok(!/relatorio-demo\//.test(ler(p).replace(/relatorio-demo\/relatorio\.css/g, '')), 'sem link para demo: ' + p);
assert.ok(!/#9b4dff/i.test(ler('ntn/pro.css') + ler('utilities/utilities.css')), 'sem roxo');
const u = ler('utilities/utilities.js'), uh = ler('utilities/index.html');
assert.ok(/id="dlgAjuda"/.test(uh) && /showModal/.test(u) && !/docs\/connect-como-funciona/.test(uh), 'ajuda em modal');
assert.ok(!/#a45cff|#7a6cff/i.test(u + uh), 'sem roxo em utilities');
assert.ok(/textoPos/.test(u) && /SKIP_WAITING/.test(ler('service-worker.js')));
