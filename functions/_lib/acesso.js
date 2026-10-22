// acesso.js: valida o JWT do Cloudflare Access e resolve o papel (admin, leitor ou viewer).
// Variáveis do Pages: TEAM_DOMAIN (ex. ntn-plataforma.cloudflareaccess.com), ACCESS_AUDS (AUDs separados por vírgula),
// ADMIN_EMAIL (fallback do primeiro admin), ADMINS_GROUP_ID, LEITORES_GROUP_ID, VIEWERS_GROUP_ID, ACCOUNT_ID.
// Segredo (nunca no repo): CF_API_TOKEN. KV: NTN_ROLES.
export const PAPEIS = ['admin', 'leitor', 'viewer'];
let certsCache = { at: 0, keys: [] };

function b64url(s) {
  s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '=';
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}

async function chaves(team) {
  if (Date.now() - certsCache.at < 3600e3 && certsCache.keys.length) return certsCache.keys;
  const r = await fetch(`https://${team}/cdn-cgi/access/certs`);
  const j = await r.json();
  certsCache = { at: Date.now(), keys: j.keys || [] };
  return certsCache.keys;
}

export async function validarJwt(request, env) {
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return null;
  const [h, p, s] = token.split('.');
  if (!h || !p || !s) return null;
  const head = JSON.parse(new TextDecoder().decode(b64url(h)));
  const jwk = (await chaves(env.TEAM_DOMAIN)).find((k) => k.kid === head.kid);
  if (!jwk || head.alg !== 'RS256') return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) return null;
  const c = JSON.parse(new TextDecoder().decode(b64url(p)));
  const auds = String(env.ACCESS_AUDS || '').split(',').map((x) => x.trim()).filter(Boolean);
  const aud = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!aud.some((a) => auds.includes(a))) return null;
  if (c.iss !== `https://${env.TEAM_DOMAIN}`) return null;
  if (c.exp && c.exp * 1000 < Date.now()) return null;
  return c;
}

export async function papelDe(email, env) {
  email = String(email || '').toLowerCase();
  const kv = env.NTN_ROLES ? await env.NTN_ROLES.get('role:' + email) : null;
  if (PAPEIS.includes(kv)) return kv;
  if (env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.toLowerCase()) return 'admin';
  // Fallback: grupo do Access (consulta pela API)
  try {
    const g = await grupo(env, env.ADMINS_GROUP_ID);
    if (emailsDo(g).includes(email)) return 'admin';
    if (env.LEITORES_GROUP_ID && emailsDo(await grupo(env, env.LEITORES_GROUP_ID)).includes(email)) return 'leitor';
  } catch (e) { /* segue */ }
  return 'viewer';
}

export async function sessao(request, env) {
  const c = await validarJwt(request, env);
  if (!c || !c.email) return null;
  return { email: c.email.toLowerCase(), role: await papelDe(c.email, env) };
}

export function json(obj, status = 200) {
  return new Response(obj === null ? null : JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
}

// ---------- Access Groups via API ----------
async function cfApi(env, method, path, body) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/${path}`, {
    method, headers: { Authorization: `Bearer ${env.CF_API_TOKEN}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json();
  if (!j.success) throw new Error('Cloudflare API: ' + JSON.stringify(j.errors));
  return j.result;
}
export const PLACEHOLDER = 'viewer-placeholder@invalid.example';
export async function grupo(env, id) { return cfApi(env, 'GET', `access/groups/${id}`); }
export function emailsDo(g) { return (g.include || []).map((r) => r.email && r.email.email).filter(Boolean).map((e) => e.toLowerCase()); }
export async function definirEmails(env, id, emails) {
  const g = await grupo(env, id);
  const lista = [...new Set(emails)];
  if (!lista.length) lista.push(PLACEHOLDER); // o Access exige ao menos uma regra
  return cfApi(env, 'PUT', `access/groups/${id}`, { name: g.name, include: lista.map((e) => ({ email: { email: e } })) });
}
