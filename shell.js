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
    { id: 'acessos', rotulo: 'Acessos', href: 'admin/acessos/', ico: 'admin', papeis: ['admin'] }
  ];
  /* Subpáginas: mantêm o item pai ativo e entram como 3º nível da trilha. */
  var SUB = { ntn: { pai: 'rastreador', rotulo: 'Rastreador NTN' }, thingy91x: { pai: 'rastreador', rotulo: 'Thingy:91X' } };
  function ativo(pagina) { return SUB[pagina] ? SUB[pagina].pai : pagina; }
  /* Puro: itens visíveis para o papel. Sem papel conhecido (modo legado) mostra os de admin. */
  function itensPara(papel) { var p = papel || 'admin'; return ITENS.filter(function (i) { return i.papeis.indexOf(p) >= 0; }); }
  function inicioPara(papel) { return papel === 'viewer' ? 'relatorio-demo/' : 'app/'; }
  function trilha(pagina, papel) {
    var sub = SUB[pagina], atual = ITENS.filter(function (i) { return i.id === ativo(pagina); })[0];
    var ini = { rotulo: 'Início', href: inicioPara(papel) };
    if (sub && atual) return [ini, { rotulo: atual.rotulo, href: atual.href }, { rotulo: sub.rotulo }];
    if (!atual || atual.href === ini.href) return [{ rotulo: atual ? atual.rotulo : 'Início' }];
    return [ini, { rotulo: atual.rotulo }];
  }
  var api = { ITENS: ITENS, itensPara: itensPara, inicioPara: inicioPara, trilha: trilha, ativo: ativo };
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
      '<svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true"><rect width="32" height="32" rx="9" fill="#0984e3"/><circle cx="16" cy="16" r="3.2" fill="#fff"/><path d="M9.5 16a6.5 6.5 0 0 1 13 0M6 16a10 10 0 0 1 20 0" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".9"/></svg>' +
      '<span class="sh-mt"><span><i class="sh-i">I</i>oT <b>Cat-M + NTN</b></span><small>Tecnologia</small></span></a>' +
      '<button class="sh-burger" type="button" aria-expanded="false" aria-controls="sh-nav" aria-label="Menu">' + ico('menu') + '</button>' +
      '<nav id="sh-nav" class="sh-nav" aria-label="Sistemas">' +
      itens.map(function (i) { return '<a href="' + base + i.href + '"' + (i.id === ativo(pagina) ? ' aria-current="' + (SUB[pagina] ? 'true' : 'page') + '"' : '') + '>' + ico(i.ico) + i.rotulo + '</a>'; }).join('') +
      '<div class="sh-user"><button type="button" class="sh-ubtn" aria-expanded="false" aria-haspopup="true">' + ico('viewer') + '<span>' + esc(estado.email ? estado.email.split('@')[0] : 'Conta') + '</span></button>' +
      '<div class="sh-umenu" hidden><b>' + esc(estado.email || 'Sessão do navegador') + '</b><small>Papel: ' + ({ viewer: 'Viewer', admin: 'Admin', leitor: 'Leitor' }[estado.papel] || 'não identificado') + '</small>' +
      '<a class="btn btn-sm" href="/cdn-cgi/access/logout">' + ico('sair') + 'Sair</a></div></div></nav></div>' +
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
