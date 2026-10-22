/* api-core.js — Nucleo comum de API da Plataforma NTN 2.0 (RF-01).
   Script classico no navegador (window.ApiCore) e CommonJS (require) nos testes Node.
   Sem dependencias externas; sem acesso ao DOM. */

// Resolucao da URL base: vazia apenas no Netlify (netlify.app).
// Localhost, GitHub Pages e qualquer outro host usam a URL completa.
const BASE_URL = (typeof location !== 'undefined' && /netlify\.app$/i.test(location.hostname))
  ? ''
  : 'https://thingy91x-x-dashboard.netlify.app';

const API = BASE_URL + '/.netlify/functions/ntn-lab';

// ---------- fetch ----------

/**
 * Busca registros do Rastreador.
 * @param {number} days - janela em dias (padrao 7)
 * @returns {Promise<object[]>}
 */
async function fetchTracker(days = 7) {
  const r = await fetch(API + '?pro=1&days=' + days + '&t=' + Date.now(), { cache: 'no-store' });
  const j = await r.json();
  return Array.isArray(j.records) ? j.records : [];
}

/**
 * Busca registros do Medidor (Utilities).
 * @param {number} days - janela em dias (padrao 62)
 * @returns {Promise<object[]>}
 */
async function fetchMeter(days = 62) {
  const r = await fetch(API + '?meter=1&days=' + days + '&t=' + Date.now(), { cache: 'no-store' });
  const j = await r.json();
  return Array.isArray(j.records) ? j.records : [];
}

// ---------- dedup ----------

/**
 * Remove registros duplicados e ordena por ts.
 * Chave: rx|seq|type|dv — mesmo criterio usado em consumo.js.
 * Em colisao, mantém o registro com mais campos preenchidos.
 * @param {object[]} records
 * @returns {object[]}
 */
function dedup(records) {
  const m = new Map();
  for (const r of records) {
    const key = (r.rx || r.ts || '') + '|' + (r.seq ?? '') + '|' + (r.type || '') + '|' + (r.dv || '');
    const existing = m.get(key);
    if (!existing || Object.keys(r).length > Object.keys(existing).length) {
      m.set(key, r);
    }
  }
  return [...m.values()].sort((a, b) => {
    const ta = Date.parse(a.ts || a.rx || '');
    const tb = Date.parse(b.ts || b.rx || '');
    return ta - tb || (a.seq ?? 0) - (b.seq ?? 0);
  });
}

// ---------- formatacao ----------

/**
 * Formata segundos em texto legivel (pt-BR).
 * Ex.: fmtDur(90) -> "1 min 30 s"
 * @param {number|null} s
 * @returns {string}
 */
function fmtDur(s) {
  if (s == null || !isFinite(s)) return 'sem dados';
  s = Math.round(s);
  if (s < 60) return s + ' s';
  if (s < 3600) return Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s';
  return Math.floor(s / 3600) + ' h ' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ' min';
}

/**
 * Formata bytes em texto legivel (pt-BR).
 * Ex.: fmtBytes(2048) -> "2,0 KB"
 * @param {number|null} b
 * @returns {string}
 */
function fmtBytes(b) {
  if (b == null) return 'sem dados';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' KB';
  return (b / 1048576).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' MB';
}

/**
 * Retorna "ha X s/min/h" a partir de uma string ISO.
 * @param {string} isoString
 * @returns {string}
 */
function ago(isoString) {
  if (!isoString) return 'sem dados';
  const s = Math.round((Date.now() - Date.parse(isoString)) / 1000);
  if (s < 0) return 'agora';
  if (s < 90) return 'há ' + s + ' s';
  if (s < 5400) return 'há ' + Math.round(s / 60) + ' min';
  if (s < 172800) return 'há ' + Math.round(s / 3600) + ' h';
  return 'há ' + Math.round(s / 86400) + ' d';
}

// ---------- exportacao ----------

// Navegador sem bundler: expoe via window.ApiCore
if (typeof window !== 'undefined') {
  window.ApiCore = { BASE_URL, API, fetchTracker, fetchMeter, dedup, fmtDur, fmtBytes, ago };
}

// CommonJS (Node.js nos testes)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { BASE_URL, API, fetchTracker, fetchMeter, dedup, fmtDur, fmtBytes, ago };
}
