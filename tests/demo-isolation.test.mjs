// demo-isolation.test.mjs: garante que /relatorio-demo/ é 100% estática e isolada dos dados reais.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('../relatorio-demo/index.html', import.meta.url), 'utf8');
const js = readFileSync(new URL('../relatorio-demo/relatorio.js', import.meta.url), 'utf8');
const icons = readFileSync(new URL('../icons.js', import.meta.url), 'utf8');
const tudo = html + '\n' + js + '\n' + icons;

// 1) Só carrega os scripts locais permitidos
const scripts = [...html.matchAll(/<script[^>]*src="([^"]+)"/g)].map((m) => m[1].split('?')[0]);
assert.deepEqual(scripts.sort(), ['../icons.js', '../shell.js', 'relatorio.js'].sort(), 'scripts inesperados: ' + scripts);
for (const proibido of ['api-core', 'ntn-lab', 'nrfcloud', 'nrf_api_key', 'roles.js', 'pwa.js', 'app.js', 'proxy.js']) {
  assert.ok(!tudo.includes(proibido), 'referência proibida: ' + proibido);
}

// 2) Nenhuma chamada de rede
for (const re of [/\bfetch\s*\(/, /XMLHttpRequest/, /WebSocket/, /EventSource/, /sendBeacon/, /\bimport\s*\(/]) {
  assert.ok(!re.test(js) && !re.test(icons), 'chamada de rede encontrada: ' + re);
}
assert.ok(!/https?:\/\//.test(js), 'URL externa no JS da demo');

// 3) Nenhuma leitura de chaves ou armazenamento
for (const re of [/localStorage/, /sessionStorage/, /indexedDB/, /document\.cookie/]) {
  assert.ok(!re.test(js) && !re.test(icons), 'acesso a armazenamento: ' + re);
}

// 4) Nenhum export ativo
for (const re of [/\.download\s*=/, /createObjectURL/, /new Blob/, /window\.print/, /text\/csv/]) {
  assert.ok(!re.test(js), 'export ativo: ' + re);
}
const botoes = [...html.matchAll(/<button[^>]*>[\s\S]*?<\/button>/g)].map((m) => m[0]);
const exp = botoes.filter((b) => /Exportar|CSV|PDF/.test(b));
assert.ok(exp.length >= 1, 'esperava botões de export desabilitados visíveis');
for (const b of exp) {
  assert.ok(/\sdisabled/.test(b) && b.includes('Disponível na versão completa') && b.includes('#i-cadeado'), 'botão de export ativo: ' + b);
}

// 5) Aviso de dados de exemplo visível e sem travessões
assert.ok(html.includes('Dados de exemplo'));
assert.ok(!/[\u2013\u2014]/.test(tudo), 'travessão encontrado');
console.log('demo-isolation: ok');
assert.doesNotMatch(readFileSync(new URL('../shell.js', import.meta.url), 'utf8'), /netlify|nrfcloud|ntn-lab/, 'shell.js sem chamadas de dados');
