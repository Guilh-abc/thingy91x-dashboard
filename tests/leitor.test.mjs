// leitor.test.mjs: papel Leitor. Servidor nega export e escrita (403); interface esconde exportações.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { negar, onRequest } from '../functions/_middleware.js';
const raiz = new URL('../', import.meta.url).pathname, ler = (p) => readFileSync(raiz + p, 'utf8');
const U = (p) => new URL('https://ntn-plataforma.pages.dev' + p);

// regra pura
assert.equal(negar('leitor', 'GET', U('/.netlify/functions/ntn-lab?pro=1&days=1'), true), null);
assert.equal(negar('leitor', 'GET', U('/.netlify/functions/nrfcloud/devices/x'), true), null);
for (const p of ['/.netlify/functions/ntn-lab?pro=1&export=csv', '/api/ntn-lab/export', '/.netlify/functions/nrfcloud/devices/x?format=csv', '/api/alerts?relatorio=1'])
  assert.equal(negar('leitor', 'GET', U(p), true), 'leitor não exporta', p);
for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal(negar('leitor', m, U('/.netlify/functions/alerts'), true), 'leitor só lê');
assert.equal(negar('leitor', 'GET', U('/app/relatorio/'), false), 'somente admin');
assert.equal(negar('leitor', 'GET', U('/admin/acessos/'), false), 'somente admin');
assert.equal(negar('leitor', 'GET', U('/ntn/'), false), null);
assert.ok(negar('viewer', 'GET', U('/.netlify/functions/ntn-lab?pro=1'), true));
assert.equal(negar('admin', 'POST', U('/api/ntn-lab/export?csv=1'), true), null);

// ponta a ponta: JWT RS256 assinado por chave de teste, papel leitor vindo do KV
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'k1' };
const b64 = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
const h = b64({ alg: 'RS256', kid: 'k1' }), p = b64({ email: 'leitor@exemplo.com', aud: ['aud1'], iss: 'https://time.exemplo', exp: Date.now() / 1000 + 600 });
const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(h + '.' + p))).toString('base64url');
const env = { TEAM_DOMAIN: 'time.exemplo', ACCESS_AUDS: 'aud1', NTN_ROLES: { get: async (k) => (k === 'role:leitor@exemplo.com' ? 'leitor' : null) } };
let proxied = 0;
globalThis.fetch = async (u) => { if (String(u).includes('/cdn-cgi/access/certs')) return new Response(JSON.stringify({ keys: [jwk] })); proxied++; return new Response('{"records":[]}', { status: 200 }); };
const chamar = (path, method = 'GET') => onRequest({ request: new Request('https://ntn-plataforma.pages.dev' + path, { method, headers: { 'Cf-Access-Jwt-Assertion': h + '.' + p + '.' + sig } }), env, next: async () => new Response('estatico') });
assert.equal((await chamar('/.netlify/functions/ntn-lab?pro=1&export=csv')).status, 403);
assert.equal((await chamar('/api/ntn-lab?pro=1&format=csv')).status, 403);
assert.equal((await chamar('/.netlify/functions/alerts', 'POST')).status, 403);
assert.equal((await chamar('/app/relatorio/')).status, 403);
assert.equal(proxied, 0, 'nada negado chega à origem');
assert.equal((await chamar('/.netlify/functions/ntn-lab?pro=1&days=1')).status, 200);
assert.equal(proxied, 1);

// interface
const sh = ler('shell.js'), g = {}; new Function('globalThis', sh)(g);
assert.deepEqual(g.Shell.itensPara('leitor').map((i) => i.id), ['app', 'rastreador', 'utilities', 'consumo']);
assert.match(ler('entrar/entrar.js'), /'leitor'\) return '\.\.\/app\/'/);
const css = ler('shell.css');
for (const id of ['#btnExport', '#rootPdf', '#btnCsvU', '#btnPdfC', '#exportCsv', 'a[href*="app/relatorio"]', 'a[href*="admin/acessos"]']) assert.ok(css.includes(id), id);
assert.match(ler('roles.js'), /window\.print = function \(\) \{\}/);
assert.ok(ler('admin/acessos/index.html').includes('value="leitor"'));
assert.ok(ler('index.html').includes('<h3>Leitor</h3>'));
assert.ok((ler('functions/api/users/[[id]].js').match(/PAPEIS/g) || []).length >= 3);
console.log('ok  - leitor: 403 em export e escrita, interface sem exportação');
