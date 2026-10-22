import { sessao, json } from '../_lib/acesso.js';
export async function onRequestGet({ request, env }) {
  const s = await sessao(request, env);
  return s ? json(s) : json({ error: 'sem sessão' }, 401);
}
