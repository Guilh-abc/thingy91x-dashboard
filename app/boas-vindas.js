/* boas-vindas.js: tela de primeiro acesso do admin em /app/. Guarda só uma marca de "já visto"
   no localStorage (nenhuma chave ou dado). Não altera o pareamento: o botão abre o modal existente. */
(function () {
  var MARCA = 'ntn.onboarding.visto';
  function deveMostrar(busca, visto) { return /(^|[?&])bemvindo=1/.test(busca || '') && !visto; }
  if (typeof module !== 'undefined') { module.exports = { deveMostrar: deveMostrar, MARCA: MARCA }; return; }
  var visto = null; try { visto = localStorage.getItem(MARCA); } catch (e) {}
  if (!deveMostrar(location.search, visto)) return;
  var css = '.bv-fundo{position:fixed;inset:0;background:rgba(8,14,32,.7);display:grid;place-items:center;z-index:9999;padding:16px}' +
    '.bv{background:var(--fundo-card,#fff);color:var(--texto,#111);border-radius:18px;max-width:480px;width:100%;padding:26px;box-shadow:0 30px 60px rgba(0,0,0,.4)}' +
    '.bv h2{margin:0 0 6px}.bv ol{padding-left:20px;margin:14px 0 20px}.bv li{margin:8px 0}.bv .acoes{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var f = document.createElement('div'); f.className = 'bv-fundo';
  f.innerHTML = '<div class="bv" role="dialog" aria-modal="true" aria-labelledby="bvT">' +
    '<h2 id="bvT">Boas-vindas à IoT Cat-M + NTN</h2><p>Três passos para ver seus dados reais:</p><ol>' +
    '<li><b>Cadastre a chave do nRF Cloud</b> em Configurações (ícone de engrenagem). Ela fica só neste navegador.</li>' +
    '<li><b>Confira o rastreador</b> em Rastreador: posição, trilha e alertas.</li>' +
    '<li><b>Convide pessoas</b> em Admin, Acessos, como admin ou viewer.</li></ol>' +
    '<div class="acoes"><button type="button" class="btn" id="bvDepois">Depois</button>' +
    '<button type="button" class="btn btn-primary" id="bvChave">Cadastrar chave agora</button></div></div>';
  function fechar() { try { localStorage.setItem(MARCA, '1'); } catch (e) {} f.remove(); history.replaceState(null, '', location.pathname); }
  document.addEventListener('DOMContentLoaded', function () {
    document.body.appendChild(f);
    document.getElementById('bvDepois').onclick = fechar;
    document.getElementById('bvChave').onclick = function () { fechar(); var b = document.getElementById('configBtn'); if (b) b.click(); };
    document.getElementById('bvChave').focus();
  });
})();
