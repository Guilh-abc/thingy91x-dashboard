/* apresentacao.js: Modo Apresentação único para os três painéis (RF-05).
   Script clássico: window.Apresentacao. Um botão (#btnApresentacao) liga tela cheia e layout compacto;
   Esc ou novo clique desliga. ?modo=apresentacao ativa ao carregar.
   F2: ?rot=N troca de painel a cada N s (0 = desligado) na ordem ntn, utilities, consumo. */
(function () {
  'use strict';
  var qs = new URLSearchParams(location.search), opts = {}, ativo = false, inited = false, rotTimer = null;
  var ORDEM = ['ntn', 'utilities', 'consumo'];
  var rot = Math.max(0, parseInt(qs.get('rot') || '0', 10) || 0);
  function proximo(pathname) {
    var m = /\/(ntn|utilities|consumo)\/(index\.html)?$/.exec(pathname || '');
    if (!m) return null;
    return '../' + ORDEM[(ORDEM.indexOf(m[1]) + 1) % ORDEM.length] + '/';
  }
  function rotacionar() { var p = proximo(location.pathname); if (p) location.href = p + '?modo=apresentacao&rot=' + rot; }
  function startRot() { if (rot > 0 && !rotTimer) rotTimer = setInterval(rotacionar, rot * 1000); }
  function stopRot() { clearInterval(rotTimer); rotTimer = null; }
  function btn() { return document.getElementById('btnApresentacao'); }
  function resize() { setTimeout(function () { window.dispatchEvent(new Event('resize')); }, 200); }
  function on(fromUrl) {
    if (ativo) return; ativo = true;
    document.body.classList.add('apresentacao', 'present');
    var b = btn(); if (b) { b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); }
    if (!fromUrl && document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(function () { /* sem permissão: segue só com o layout */ });
    try { if (opts.onStart) opts.onStart(); } catch (e) { console.warn('apresentacao', e); }
    startRot(); resize();
  }
  function off() {
    if (!ativo) return; ativo = false;
    document.body.classList.remove('apresentacao', 'present');
    var b = btn(); if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); }
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    stopRot();
    try { if (opts.onStop) opts.onStop(); } catch (e) { console.warn('apresentacao', e); }
    resize();
  }
  function init(o) {
    opts = o || {}; if (inited) return; inited = true;
    var b = btn(); if (b) b.onclick = function () { ativo ? off() : on(false); };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && ativo) off(); });
    var wasFull = false;
    document.addEventListener('fullscreenchange', function () { if (document.fullscreenElement) wasFull = true; else if (wasFull) { wasFull = false; off(); } });
    if (qs.get('modo') === 'apresentacao') on(true);
  }
  window.Apresentacao = { init: init, on: on, off: off, proximo: proximo, get ativo() { return ativo; } };
})();
