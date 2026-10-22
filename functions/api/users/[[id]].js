// /api/users e /api/users/:email (só admin). Grava no KV NTN_ROLES e no Access Group correspondente.
import { sessao, json, grupo, emailsDo, definirEmails, PLACEHOLDER } from '../../_lib/acesso.js';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function sincronizar(env, email, role) {
  for (const [id, papel] of [[env.ADMINS_GROUP_ID, 'admin'], [env.VIEWERS_GROUP_ID, 'viewer']]) {
    const atual = emailsDo(await grupo(env, id)).filter((e) => e !== PLACEHOLDER && e !== email);
    if (role === papel) atual.push(email);
    await definirEmails(env, id, atual);
  }
}

export async function onRequest({ request, env, params }) {
  const s = await sessao(request, env);
  if (!s) return json({ error: 'sem sessão' }, 401);
  if (s.role !== 'admin') return json({ error: 'somente admin' }, 403);
  const id = params.id ? decodeURIComponent([].concat(params.id).join('/')).toLowerCase() : null;
  const m = request.method;

  if (m === 'GET' && !id) {
    const out = []; let cursor;
    do {
      const l = await env.NTN_ROLES.list({ prefix: 'role:', cursor });
      for (const k of l.keys) out.push({ id: k.name.slice(5), email: k.name.slice(5), role: await env.NTN_ROLES.get(k.name) });
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
    return json({ users: out });
  }
  if (m === 'POST' && !id) {
    const b = await request.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL.test(email) || !['admin', 'viewer'].includes(b.role)) return json({ error: 'dado inválido' }, 422);
    if (await env.NTN_ROLES.get('role:' + email)) return json({ error: 'já existe' }, 409);
    await sincronizar(env, email, b.role);
    await env.NTN_ROLES.put('role:' + email, b.role);
    return json({ id: email, email, role: b.role }, 201);
  }
  if (m === 'PATCH' && id) {
    const b = await request.json().catch(() => ({}));
    if (!['admin', 'viewer'].includes(b.role)) return json({ error: 'dado inválido' }, 422);
    await sincronizar(env, id, b.role);
    await env.NTN_ROLES.put('role:' + id, b.role);
    return json({ id, email: id, role: b.role });
  }
  if (m === 'DELETE' && id) {
    if (id === s.email) return json({ error: 'não é possível remover a si mesmo' }, 422);
    await sincronizar(env, id, null);
    await env.NTN_ROLES.delete('role:' + id);
    return json(null, 204);
  }
  return json({ error: 'método não suportado' }, 405);
}
