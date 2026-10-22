// _middleware.js: proxy das APIs reais (ntn-lab, nrfcloud, alerts) e regras de papel no servidor.
// admin: tudo. leitor: só GET/HEAD de leitura, sem export/CSV/relatório e sem /admin ou /app/relatorio. viewer: nada real.
// As páginas no Pages chamam /.netlify/functions/* (mesmo caminho do Netlify) ou /api/<função>/*.
import { sessao, json } from './_lib/acesso.js';

const ORIGEM = 'https://thingy91x-x-dashboard.netlify.app';
const FUNCOES = ['ntn-lab', 'nrfcloud', 'alerts'];
const SO_ADMIN = /^\/(admin|app\/relatorio)(\/|$)/;
const EXPORTA = /(export|csv|download|relatorio|report|pdf|print)/i;

export function destino(url) {
  let m = url.pathname.match(/^\/\.netlify\/functions\/([^/]+)(\/.*)?$/);
  if (!m) m = url.pathname.match(/^\/api\/([^/]+)(\/.*)?$/);
  if (!m || !FUNCOES.includes(m[1])) return null;
  return `${ORIGEM}/.netlify/functions/${m[1]}${m[2] || ''}${url.search}`;
}

/* Puro: decide se o papel pode fazer esta requisição. Retorna null (ok) ou o motivo do 403. */
export function negar(papel, metodo, url, proxy) {
  if (papel === 'admin') return null;
  if (SO_ADMIN.test(url.pathname)) return 'somente admin';
  if (!proxy) return null;
  if (papel !== 'leitor') return 'somente admin ou leitor';
  if (!['GET', 'HEAD'].includes(metodo)) return 'leitor só lê';
  if (EXPORTA.test(url.pathname + url.search)) return 'leitor não exporta';
  return null;
}

export async function onRequest(ctx) {
  const { request, env } = ctx;
  const url = new URL(request.url);
  const alvo = destino(url);
  if (!alvo && !SO_ADMIN.test(url.pathname)) return ctx.next();
  const s = await sessao(request, env);
  if (!s) return alvo ? json({ error: 'sem sessão' }, 401) : ctx.next(); // estáticos: o Access já barrou antes
  const motivo = negar(s.role, request.method, url, !!alvo);
  if (motivo) return json({ error: motivo }, 403);
  if (!alvo) return ctx.next();
  const h = new Headers(request.headers);
  for (const k of ['cookie', 'cf-access-jwt-assertion', 'cf-access-authenticated-user-email', 'host']) h.delete(k);
  const r = await fetch(alvo, { method: request.method, headers: h, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
  const out = new Response(r.body, r);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}
