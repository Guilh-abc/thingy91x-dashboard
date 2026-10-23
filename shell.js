/* shell.js: navegação comum das páginas internas (barra com marca, item ativo, trilha, menu do usuário,
   menu mobile, prefetch e transição suave). Só interface: a segurança fica no Access e no /api/me.
   Uso: <script src="../shell.js" data-pagina="ntn"></script> */
(function (root) {
  var ITENS = [
    { id: 'app', rotulo: 'Início', href: 'app/', ico: 'casa', papeis: ['admin', 'leitor'] },
    { id: 'rastreador', rotulo: 'Rastreador', href: 'rastreador/', ico: 'local', papeis: ['admin', 'leitor'] },
    { id: 'utilities', rotulo: 'Utilities', href: 'utilities/', ico: 'medicao', papeis: ['admin', 'leitor'] },
    { id: 'consumo', rotulo: 'Consumo', href: 'consumo/', ico: 'grafico', papeis: ['admin', 'leitor'] },
    { id: 'relatorio-demo', rotulo: 'Relatório (demo)', href: 'relatorio-demo/', ico: 'pdf', papeis: ['viewer'] },
    { id: 'relatorio', rotulo: 'Relatório completo', href: 'app/relatorio/', ico: 'apresentacao', papeis: ['admin'] },
  ];
  /* Páginas fora da barra (abertas pelo menu do e-mail): entram só na trilha. */
  var EXTRAS = [
    { id: 'alarmes', rotulo: 'Regras de alarme', href: 'alarmes/' },
    { id: 'acessos', rotulo: 'Gerenciar acessos', href: 'admin/acessos/' }
  ];
  /* Subpáginas: mantêm o item pai ativo e entram como 3º nível da trilha. */
  var SUB = { ntn: { pai: 'rastreador', rotulo: 'Rastreador NTN' }, thingy91x: { pai: 'rastreador', rotulo: 'Thingy:91X' } };
  function ativo(pagina) { return SUB[pagina] ? SUB[pagina].pai : pagina; }
  /* Puro: itens visíveis para o papel. Sem papel conhecido (modo legado) mostra os de admin. */
  function itensPara(papel) { var p = papel || 'admin'; return ITENS.filter(function (i) { return i.papeis.indexOf(p) >= 0; }); }
  function inicioPara(papel) { return papel === 'viewer' ? 'relatorio-demo/' : 'app/'; }
  function trilha(pagina, papel) {
    var sub = SUB[pagina], atual = ITENS.concat(EXTRAS).filter(function (i) { return i.id === ativo(pagina); })[0];
    var ini = { rotulo: 'Início', href: inicioPara(papel) };
    if (sub && atual) return [ini, { rotulo: atual.rotulo, href: atual.href }, { rotulo: sub.rotulo }];
    if (!atual || atual.href === ini.href) return [{ rotulo: atual ? atual.rotulo : 'Início' }];
    return [ini, { rotulo: atual.rotulo }];
  }
  var api = { ITENS: ITENS, EXTRAS: EXTRAS, itensPara: itensPara, inicioPara: inicioPara, trilha: trilha, ativo: ativo };
  root.Shell = api;
  if (typeof document === 'undefined') return;

  var sc = document.currentScript;
  var base = sc ? sc.src.replace(/shell\.js.*$/, '') : '/';
  var pagina = (sc && sc.dataset.pagina) || '';
  var estado = { papel: null, email: null };
  function ico(n) { return '<svg class="ico" aria-hidden="true"><use href="#i-' + n + '"></use></svg>'; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function montar() {
    var velho = document.getElementById('shell'); if (velho) velho.remove();
    var itens = itensPara(estado.papel), tr = trilha(pagina, estado.papel);
    var h = '<div class="sh-barra"><a class="sh-marca" href="' + base + inicioPara(estado.papel) + '" aria-label="IoT Cat-M + NTN Tecnologia, início">' +
      '<img class="sh-logo" src="' + base + 'assets/logo-iot-hub-128.png?v=1" width="36" height="36" alt="" aria-hidden="true">' +
      '<span class="sh-mt"><span><i class="sh-i">I</i>oT <b>Cat-M + NTN</b></span><small>Tecnologia</small></span></a>' +
      '<a class="sh-site" href="' + base + '?site=1" title="Abrir a página pública sem sair da sessão">' + ico('globo') + '<span>Ver site</span></a>' +
      '<button class="sh-burger" type="button" aria-expanded="false" aria-controls="sh-nav" aria-label="Menu">' + ico('menu') + '</button>' +
      '<nav id="sh-nav" class="sh-nav" aria-label="Sistemas">' +
      itens.map(function (i) { return '<a href="' + base + i.href + '"' + (i.id === ativo(pagina) ? ' aria-current="' + (SUB[pagina] ? 'true' : 'page') + '"' : '') + '>' + ico(i.ico) + i.rotulo + '</a>'; }).join('') +
      '<div class="sh-user"><button type="button" class="sh-ubtn" aria-expanded="false" aria-haspopup="true">' + ico('viewer') + '<span>' + esc(estado.email ? estado.email.split('@')[0] : 'Conta') + '</span></button>' +
      '<div class="sh-umenu" role="menu" hidden><div class="sh-uid"><b>' + esc(estado.email || 'Sessão do navegador') + '</b><span class="sh-papel">' + ({ viewer: 'Viewer', admin: 'Admin', leitor: 'Leitor' }[estado.papel] || 'Papel não identificado') + '</span></div>' +
      (estado.papel === 'admin' ? '<a role="menuitem" href="' + base + 'admin/acessos/"' + (pagina === 'acessos' ? ' aria-current="page"' : '') + '>' + ico('cadeado') + 'Gerenciar acessos</a><a role="menuitem" href="' + base + 'alarmes/"' + (pagina === 'alarmes' ? ' aria-current="page"' : '') + '>' + ico('sino') + 'Regras de alarme</a>' : '') +
      '<a role="menuitem" href="' + base + '?site=1">' + ico('globo') + 'Ver site</a>' +
      '<a role="menuitem" class="sh-sair" href="/cdn-cgi/access/logout">' + ico('sair') + 'Sair</a></div></div></nav></div>' +
      '<ol class="sh-trilha" aria-label="Você está em">' + tr.map(function (t, k) {
        return '<li>' + (t.href ? '<a href="' + base + t.href + '">' + t.rotulo + '</a>' : '<span aria-current="page">' + t.rotulo + '</span>') + (k < tr.length - 1 ? ico('seta') : '') + '</li>';
      }).join('') + '</ol>';
    var el = document.createElement('header'); el.id = 'shell'; el.className = 'sh'; el.innerHTML = h;
    document.body.insertBefore(el, document.body.firstChild);
    var nav = el.querySelector('.sh-nav'), bur = el.querySelector('.sh-burger');
    bur.onclick = function () { var a = nav.classList.toggle('aberto'); bur.setAttribute('aria-expanded', a); el.classList.toggle('sh-aberto', a); };
    nav.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a[href]')) { nav.classList.remove('aberto'); el.classList.remove('sh-aberto'); bur.setAttribute('aria-expanded', 'false'); } });
    var ub = el.querySelector('.sh-ubtn'), um = el.querySelector('.sh-umenu');
    ub.onclick = function (e) { e.stopPropagation(); um.hidden = !um.hidden; ub.setAttribute('aria-expanded', !um.hidden); };
    document.addEventListener('click', function () { um.hidden = true; ub.setAttribute('aria-expanded', 'false'); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { um.hidden = true; nav.classList.remove('aberto'); } });
    prefetch(el);
  }
  var feitos = {};
  function pre(href) { if (feitos[href] || href.indexOf('/cdn-cgi/') >= 0) return; feitos[href] = 1; var l = document.createElement('link'); l.rel = 'prefetch'; l.href = href; document.head.appendChild(l); }
  function prefetch(el) {
    el.addEventListener('pointerover', function (e) { var a = e.target.closest && e.target.closest('a[href]'); if (a) pre(a.href); });
    (root.requestIdleCallback || function (f) { setTimeout(f, 1200); })(function () { el.querySelectorAll('.sh-nav a[href]').forEach(function (a) { pre(a.href); }); });
  }
  /* Fallback de transição: navegadores sem View Transitions recebem um fade curto. */
  if (!document.startViewTransition) document.documentElement.classList.add('sh-fade');
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a[href]');
    if (!a || document.startViewTransition || a.target || e.ctrlKey || e.metaKey || a.origin !== location.origin || a.hash && a.pathname === location.pathname) return;
    e.preventDefault(); document.documentElement.classList.add('sh-saindo'); setTimeout(function () { location.href = a.href; }, 120);
  });
  root.addEventListener('pageshow', function () { document.documentElement.classList.remove('sh-saindo'); });
  function iniciar() {
    montar();
    fetch(base + 'api/me', { credentials: 'include', cache: 'no-store', headers: { Accept: 'application/json' } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (j) { estado.papel = j.role || j.papel || null; estado.email = j.email || null; if (estado.papel) document.documentElement.setAttribute('data-papel', estado.papel); montar(); document.dispatchEvent(new CustomEvent('shell-pronto', { detail: estado })); })
      .catch(function () {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})(typeof window !== 'undefined' ? window : globalThis);
