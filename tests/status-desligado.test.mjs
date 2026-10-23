import assert from 'node:assert/strict';
import fs from 'node:fs';
await import('../status-desligado.js');
const SD = globalThis.StatusDesligado;
const now = Date.parse('2026-10-22T16:00:00Z'), m = 60000;
let r = SD.avaliar(now - 4 * m, now); assert.equal(r.desligado, false); assert.equal(r.min, 4);
r = SD.avaliar(now - 6 * m, now); assert.equal(r.desligado, true); assert.equal(SD.texto(r.min), 'última mensagem há 6 min');
r = SD.avaliar(now - 22 * m, now); assert.equal(r.desligado, true); assert.equal(SD.texto(r.min), 'última mensagem há 22 min');
assert.equal(SD.avaliar(null, now).desligado, false);
assert.match(SD.ICO, /m2 2 20 20/);
// regra aplicada antes da busca no hero do Rastreador e no hero do Utilities
const hero = fs.readFileSync(new URL('../ntn/hero.js', import.meta.url), 'utf8');
assert.ok(hero.indexOf("k: 'desligado'") < hero.indexOf('var bs = busca('));
assert.match(hero, /setInterval\([^]*30000/);
const hu = fs.readFileSync(new URL('../utilities/hero-u.js', import.meta.url), 'utf8');
assert.match(hu, /dl\.desligado \? 'desligado'/);
assert.match(fs.readFileSync(new URL('../icons.js', import.meta.url), 'utf8'), /id="i-desligado"/);
console.log('status-desligado: ok');
// v69: busca/modo satélite NTN => tolerância de 15 min
{
  const iso = (x) => new Date(x).toISOString();
  r = SD.avaliar(now - 6 * m, now, true); assert.equal(r.desligado, false); assert.equal(r.buscando, true);
  r = SD.avaliar(now - 14 * m, now, true); assert.equal(r.desligado, false);
  r = SD.avaliar(now - 16 * m, now, true); assert.equal(r.desligado, true);
  const base = [{ type: 'event', event: 'boot', ts: iso(now - 12 * m) }, { type: 'telemetry', net: 'catm', ts: iso(now - 10 * m) }];
  assert.equal(SD.emBusca(base, now), false);
  const sat = base.concat([{ type: 'event', event: 'stest', value: 1, ts: iso(now - 8 * m) }, { type: 'event', event: 'sat_start', value: 2, ts: iso(now - 8 * m) }]);
  assert.equal(SD.emBusca(sat, now), true);
  assert.equal(SD.emBusca(sat.concat([{ type: 'event', event: 'back_catm', ts: iso(now - 2 * m) }]), now), false);
  assert.equal(SD.emBusca(sat.concat([{ type: 'telemetry', net: 'catm', ts: iso(now - 2 * m) }]), now), false);
  console.log('status-desligado v69 busca 15 min: ok');
}
