/* entrar.js: após o login do Cloudflare Access, consulta /api/me e leva cada papel ao seu destino.
   O papel vem do servidor; esta página só redireciona, não concede acesso. */
(function () {
  function destino(me) {
    if (me && me.role === 'admin') return '../app/?bemvindo=1';
    if (me && me.role === 'leitor') return '../app/';
    if (me && me.role === 'viewer') return '../relatorio-demo/';
    return null;
  }
  if (typeof module !== 'undefined') { module.exports = { destino: destino }; return; }
  function falha(t) {
    document.getElementById('titulo').textContent = 'Não foi possível entrar';
    document.getElementById('msg').innerHTML = t + ' <a href="../">Voltar ao início</a>';
    var g = document.querySelector('.giro'); if (g) g.remove();
  }
  fetch('../api/me', { credentials: 'same-origin', cache: 'no-store' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      var d = destino(me);
      if (d) location.replace(d); else falha('Seu e-mail ainda não tem um papel liberado. Peça acesso ao administrador.');
    })
    .catch(function () { falha('Falha de conexão. Tente de novo em instantes.'); });
})();
