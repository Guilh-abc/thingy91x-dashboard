// _middleware.js: proxy das APIs reais (ntn-lab, nrfcloud, alerts) e regras de papel no servidor.
// admin: tudo. leitor: só GET/HEAD de leitura, sem export/CSV/relatório e sem /admin ou /app/relatorio. viewer: nada real.
// As páginas no Pages chamam /.netlify/functions/* (mesmo caminho do Netlify) ou /api/<função>/*.
import { sessao, json } from './_lib/acesso.js';

const ORIGEM = 'https://thingy91x-x-dashboard.netlify.app';
const FUNCOES = ['ntn-lab', 'nrfcloud', 'alerts'];
const SO_ADMIN = /^\/(admin|app\/relatorio)(\/|$)/;
const NRF_API = 'https://api.nrfcloud.com/v1';
const NRF_DEV = '50423451-3737-4337-80fc-110bddf418ff';
const EXPORTA = /(export|csv|download|relatorio|report|pdf|print)/i;

export function destino(url) {
  let m = url.pathname.match(/^\/\.netlify\/functions\/([^/]+)(\/.*)?$/);
  if (!m) m = url.pathname.match(/^\/api\/([^/]+)(\/.*)?$/);
  if (!m || !FUNCOES.includes(m[1])) return null;
  return `${ORIGEM}/.netlify/functions/${m[1]}${m[2] || ''}${url.search}`;
}

/* nRF Cloud com a chave do servidor (secret NRF_CLOUD_API_KEY). Só GET e só leituras do device permitido.
   Retorna { u, lista } ou null (rota fora da allowlist). A chave nunca vai ao navegador. */
export function rotaNrf(url) {
  let m = url.pathname.match(/^\/(?:\.netlify\/functions|api)\/nrfcloud(\/.*)?$/);
  if (!m) return null;
  const p = (m[1] || '/').replace(/\/+$/, '') || '/', q = url.searchParams;
  if (p === '/devices') return { u: `${NRF_API}/devices/${NRF_DEV}`, lista: true };
  if (p === '/devices/' + NRF_DEV) return { u: `${NRF_API}/devices/${NRF_DEV}` };
  if ((p === '/messages' || p === '/location/history') && q.get('deviceId') === NRF_DEV) {
    const s = new URLSearchParams();
    for (const k of ['deviceId', 'pageLimit', 'pageNextToken', 'start', 'end', 'pageSort', 'appId', 'inclusiveStart']) if (q.has(k)) s.set(k, q.get(k));
    return { u: `${NRF_API}${p}?${s}` };
  }
  return null;
}

async function nrf(request, env, url) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'nRF Cloud: só leitura' }, 405);
  const r = rotaNrf(url);
  if (!r) return json({ error: 'rota do nRF Cloud não permitida' }, 403);
  const k = String(env.NRF_CLOUD_API_KEY || '').trim();
  if (!k) return json({ error: 'chave do nRF Cloud não configurada no servidor' }, 503);
  const up = await fetch(r.u, { headers: { Authorization: 'Bearer ' + k, Accept: 'application/json' } });
  if (!up.ok) return json({ error: 'nRF Cloud respondeu ' + up.status }, up.status === 401 || up.status === 403 ? 502 : up.status);
  let body = await up.text();
  if (r.lista) body = JSON.stringify({ items: [JSON.parse(body)], total: 1 });
  return new Response(body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
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
  if (/\/nrfcloud(\/|$)/.test(url.pathname)) return nrf(request, env, url);
  const h = new Headers(request.headers);
  for (const k of ['cookie', 'cf-access-jwt-assertion', 'cf-access-authenticated-user-email', 'host']) h.delete(k);
  const r = await fetch(alvo, { method: request.method, headers: h, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body, redirect: 'manual' });
  const out = new Response(r.body, r);
  out.headers.set('Cache-Control', 'no-store');
  return out;
}
