/* acessos.js: tela de administração de usuários. Só chama a API do servidor (docs/papeis-api.md);
   quem decide se a ação é permitida é o servidor, nunca esta página. */
(function () {
  var base = '../../api/';
  var $ = function (id) { return document.getElementById(id); };
  function api(metodo, caminho, corpo) {
    return fetch(base + caminho, { method: metodo, credentials: 'include', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: corpo ? JSON.stringify(corpo) : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.status === 204 ? null : r.json(); });
  }
  function esc(t) { return String(t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function listar() {
    api('GET', 'users').then(function (j) {
      $('lista').innerHTML = (j.users || []).map(function (u) {
        var badge = u.role === 'admin' ? 'badge-info' : 'badge-neutro';
        return '<tr><td>' + esc(u.email) + '</td><td><span class="badge ' + badge + '">' + esc(u.role) + '</span></td><td style="text-align:right">' +
          (u.role !== 'admin' ? '<button class="btn btn-sm" data-admin="' + esc(u.id) + '">Conceder admin</button> ' : '') +
          '<button class="btn btn-danger btn-sm" data-rem="' + esc(u.id) + '">Remover</button></td></tr>';
      }).join('');
    }).catch(function (e) { $('situacao').textContent = 'Não foi possível listar usuários (' + e.message + ').'; });
  }
  $('lista').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.rem && confirm('Remover este usuário?')) api('DELETE', 'users/' + encodeURIComponent(b.dataset.rem)).then(listar);
    if (b.dataset.admin) api('PATCH', 'users/' + encodeURIComponent(b.dataset.admin), { role: 'admin' }).then(listar);
  });
  $('novo').addEventListener('submit', function (ev) {
    ev.preventDefault();
    api('POST', 'users', { email: $('email').value.trim(), role: $('papel').value }).then(function () { $('email').value = ''; listar(); })
      .catch(function (e) { alert('Não foi possível criar: ' + e.message); });
  });
  Roles.pronto.then(function (st) {
    if (st.origem !== 'servidor') { $('situacao').textContent = 'O servidor de sessão (GET /api/me) ainda não está publicado. Esta tela passa a funcionar quando ele existir.'; return; }
    if (st.papel !== 'admin') { $('situacao').textContent = 'Somente administradores.'; return; }
    $('situacao').textContent = 'Sessão de admin: ' + (st.usuario || '') + '.'; $('painel').hidden = false; listar();
  });
})();
