// _middleware.js: proxy das APIs reais (ntn-lab, nrfcloud, alerts) só para admin.
// As páginas no Pages chamam /.netlify/functions/* (mesmo caminho do Netlify) ou /api/<função>/*.
import { sessao, json } from './_lib/acesso.js';

const ORIGEM = 'https://thingy91x-x-dashboard.netlify.app';
const FUNCOES = ['ntn-lab', 'nrfcloud', 'alerts'];

export function destino(url) {
  let m = url.pathname.match(/^\/\.netlify\/functions\/([^/]+)(\/.*)?$/);
  if (!m) m = url.pathname.match(/^\/api\/([^/]+)(\/.*)?$/);
  if (!m || !FUNCOES.includes(m[1])) return null;
  return `${ORIGEM}/.netlify/functions/${m[1]}${m[2] || ''}${url.search}`;
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const alvo = destino(url);
  if (!alvo) return ctx.next();
  const s = await sessao(request, env);
  if (!s) return json({ error: 'sem sessão' }, 401);
  if (s.role !== 'admin') return json({ error: 'somente admin' }, 403);
  const h = new Headers(request.headers);
  for (const k of ['cookie', 'cf-access-jwt-assertion', 'cf-access-authenticated-user-email', 'host']) h.delete(k);
  const r = await fetch(alvo, { method: request.method, headers: h, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
  const out = new Response(r.body, r);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}
