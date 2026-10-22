/* roles.js: camada de papéis no front (viewer e admin).
   IMPORTANTE: isto só ajusta a interface. A segurança de verdade fica no servidor (GET /api/me e rotas /api/users),
   que ainda será implementado. Nada aqui guarda senha ou segredo.
   Contrato em docs/papeis-api.md.
   Regra de transição: se /api/me não existir ou falhar, vale o modo legado (o comportamento atual, em que a chave
   no próprio navegador define o acesso de admin). Nenhuma tela muda nesse caso. */
(function () {
  var ESTADO = { origem: 'carregando', papel: null, usuario: null };
  var base = (function () { var s = document.currentScript && document.currentScript.src; return s ? s.replace(/roles\.js.*$/, '') : '/'; })();

  function aplicar() {
    var real = document.documentElement.hasAttribute('data-pagina-real');
    if (ESTADO.origem === 'servidor' && ESTADO.papel === 'viewer' && real) {
      var d = document.createElement('div');
      d.id = 'acessoRestrito'; d.setAttribute('role', 'alert');
      d.style.cssText = 'position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:var(--fundo,#f5f6fa);color:var(--texto,#2d3436);text-align:center;padding:24px';
      d.innerHTML = '<div><h1 style="margin:0 0 8px">Acesso restrito</h1><p>Seu perfil é de visualização. Os dados reais e as exportações ficam com o administrador.</p>' +
        '<p><a class="btn btn-primary" href="' + base + 'relatorio-demo/">Ver o relatório de demonstração</a></p></div>';
      document.body.appendChild(d);
    }
    if (ESTADO.origem === 'servidor' && ESTADO.papel === 'admin') {
      document.querySelectorAll('[data-so-admin]').forEach(function (e) { e.hidden = false; });
    }
    document.dispatchEvent(new CustomEvent('papel-pronto', { detail: ESTADO }));
  }

  function carregar() {
    return fetch(base + 'api/me', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('sem endpoint');
        var tipo = r.headers.get('content-type') || '';
        if (tipo.indexOf('application/json') < 0) throw new Error('resposta não JSON');
        return r.json();
      })
      .then(function (j) {
        if (j && (j.role === 'admin' || j.role === 'viewer')) { ESTADO.origem = 'servidor'; ESTADO.papel = j.role; ESTADO.usuario = j.email || null; }
        else ESTADO.origem = 'legado';
      })
      .catch(function () { ESTADO.origem = 'legado'; })
      .then(function () { if (document.body) aplicar(); else document.addEventListener('DOMContentLoaded', aplicar); return ESTADO; });
  }

  window.Roles = {
    estado: function () { return ESTADO; },
    // No modo legado a decisão continua com a página (chave no navegador), exatamente como hoje.
    podeExportar: function () { return ESTADO.origem !== 'servidor' || ESTADO.papel === 'admin'; },
    ehAdmin: function () { return ESTADO.origem === 'servidor' && ESTADO.papel === 'admin'; },
    pronto: carregar()
  };
})();
