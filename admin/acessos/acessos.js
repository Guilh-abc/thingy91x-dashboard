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
  var PAPEIS = [['admin', 'Admin'], ['leitor', 'Leitor'], ['viewer', 'Viewer']];
  function listar() {
    api('GET', 'users').then(function (j) {
      $('lista').innerHTML = (j.users || []).map(function (u) {
        var sel = '<select data-papel="' + esc(u.id) + '" aria-label="Papel de ' + esc(u.email) + '" style="padding:6px;border-radius:8px;border:1px solid var(--borda)">' +
          PAPEIS.map(function (p) { return '<option value="' + p[0] + '"' + (p[0] === u.role ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select>';
        return '<tr><td>' + esc(u.email) + '</td><td>' + sel + '</td><td style="text-align:right">' +
          '<button class="btn btn-danger btn-sm" data-rem="' + esc(u.id) + '">Remover</button></td></tr>';
      }).join('');
    }).catch(function (e) { $('situacao').textContent = 'Não foi possível listar usuários (' + e.message + ').'; });
  }
  $('lista').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    if (b.dataset.rem && confirm('Remover este usuário?')) api('DELETE', 'users/' + encodeURIComponent(b.dataset.rem)).then(listar);
  });
  $('lista').addEventListener('change', function (ev) {
    var s = ev.target.closest('select[data-papel]'); if (!s) return;
    api('PATCH', 'users/' + encodeURIComponent(s.dataset.papel), { role: s.value }).then(listar).catch(function (e) { alert('Não foi possível alterar: ' + e.message); listar(); });
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
