// pages-functions.test.mjs: rotas do proxy admin e recusa sem JWT do Access.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const { destino, onRequest } = await import('../functions/_middleware.js');
const { sessao } = await import('../functions/_lib/acesso.js');
const u = (p) => new URL('https://ntn-plataforma.pages.dev' + p);
assert.equal(destino(u('/.netlify/functions/ntn-lab?days=2')), 'https://thingy91x-x-dashboard.netlify.app/.netlify/functions/ntn-lab?days=2');
assert.equal(destino(u('/api/nrfcloud/v1/devices')), 'https://thingy91x-x-dashboard.netlify.app/.netlify/functions/nrfcloud/v1/devices');
assert.equal(destino(u('/api/me')), null);
assert.equal(destino(u('/api/users')), null);
assert.equal(destino(u('/ntn/')), null);
const env = { TEAM_DOMAIN: 'x.cloudflareaccess.com', ACCESS_AUDS: 'a' };
assert.equal(await sessao(new Request('https://h/api/me'), env), null);
assert.equal(await sessao(new Request('https://h/api/me', { headers: { 'Cf-Access-Jwt-Assertion': 'a.b' } }), env), null);
const r = await onRequest({ request: new Request('https://h/.netlify/functions/ntn-lab'), env, next: () => new Response('estatico') });
assert.equal(r.status, 401);
for (const f of ['functions/_lib/acesso.js', 'functions/_middleware.js', 'functions/api/me.js', 'functions/api/users/[[id]].js', 'scripts/deploy-pages.sh']) {
  const s = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  assert.ok(!/Bearer [A-Za-z0-9_-]{20,}/.test(s), 'token literal em ' + f);
  assert.ok(!/[\u2013\u2014]/.test(s), 'travessão em ' + f);
}
console.log('pages-functions: ok');
