// /api/alertas/visto: reconhecimento do alerta crítico do hub. GET lê; POST { ts } grava se for mais novo.
// Admin e leitor podem marcar (única escrita liberada ao leitor); viewer não. Guarda só e-mail, horário e o ts do alerta.
import { sessao, json } from '../../_lib/acesso.js';

const CHAVE = 'alerta:visto';
export async function onRequest({ request, env }) {
  const s = await sessao(request, env);
  if (!s) return json({ error: 'sem sessão' }, 401);
  if (!['admin', 'leitor'].includes(s.role)) return json({ error: 'somente admin ou leitor' }, 403);
  const atual = JSON.parse((await env.NTN_ROLES.get(CHAVE)) || 'null');
  if (request.method === 'GET') return json(atual || {});
  if (request.method !== 'POST') return json({ error: 'método não suportado' }, 405);
  const b = await request.json().catch(() => ({}));
  const ts = Number(b.ts);
  if (!Number.isFinite(ts) || ts <= 0 || ts > Date.now() + 60000) return json({ error: 'dado inválido' }, 422);
  if (atual && atual.ts >= ts) return json(atual);
  const novo = { ts, por: s.email, em: Date.now() };
  await env.NTN_ROLES.put(CHAVE, JSON.stringify(novo));
  return json(novo);
}
