# Alarmes: carregamento e estados

Arquivo: `alarmes/alarmes.js` (branch `redesign-v2`, não publicado).

## Como funciona

- Antes: sem backend, `r.json()` quebrava e a página ficava em branco.
- Agora: carregando, sem conexão, serviço indisponível, sem acesso (401/403), erro com código, e lista vazia com orientação.

## Pontos para o Kiro

- KIRO: Sugira estado de "salvando" e de sucesso ao criar, editar e testar e-mail.
- KIRO: Sugira o que mostrar quando o servidor está sem RESEND_API_KEY ou ALARMES_CRON_TOKEN além do aviso atual.

## Código atual

```js
  function api(m, p, b) { return fetch('/api/alarmes' + (p || ''), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(function (r) { return r.json().then(function (j) { j._s = r.status; return j; }, function () { return { _s: r.status === 200 ? 502 : r.status, _semJson: true }; }); }, function () { return { _s: 0, _offline: true }; }); }
  /* v2: estados carregando, sem servidor e erro, em vez de travar em branco */
  function estado(tipo, titulo, txt, btn) { $('lista').innerHTML = '<div class="card vazio ' + tipo + '" role="status"><b>' + esc(titulo) + '</b><p>' + esc(txt) + '</p>' + (btn ? '<button class="btn" id="tentar">Tentar de novo</button>' : '') + '</div>'; var t = $('tentar'); if (t) t.onclick = carregar; }
  function aviso(t, erro) { $('avisos').innerHTML = t ? '<div class="card aviso' + (erro ? ' erro' : '') + '">' + esc(t) + '</div>' : ''; }
  function carregar() {
    estado('carregando', 'Carregando alarmes', 'Buscando as regras no servidor.');
    api('GET').then(function (d) {
      if (d._offline) return estado('erro', 'Sem conexão', 'Não foi possível falar com o servidor. Confira a internet.', true);
      if (d._semJson) return estado('erro', 'Serviço de alarmes indisponível', 'O servidor de alarmes não respondeu. Em teste local isso é esperado; no site publicado, tente de novo em instantes.', true);
      if (d._s === 401 || d._s === 403) return estado('erro', 'Sem acesso aos alarmes', 'Sua conta não tem permissão. Peça acesso a um admin.');
      if (d._s !== 200) return estado('erro', 'Erro ao carregar', 'O servidor respondeu com erro ' + d._s + '.', true);
      D = d; $('topo').hidden = !d.podeEditar;
      var faltas = []; if (!d.email) faltas.push('envio de e-mail (RESEND_API_KEY)'); if (!d.cron) faltas.push('avaliação automática (ALARMES_CRON_TOKEN)');
      aviso(faltas.length ? 'Configuração pendente no servidor: ' + faltas.join(' e ') + '. As regras já podem ser criadas.' : '');
      var ch = [['todos', 'Todos']].concat(Object.keys(d.sistemas).map(function (k) { return [k, d.sistemas[k].nome]; }));
      $('filtros').innerHTML = ch.map(function (c) { return '<button class="chip" data-f="' + c[0] + '" aria-pressed="' + (filtro === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('');
      lista();
    });
  }
  function descr(
```

byGui
