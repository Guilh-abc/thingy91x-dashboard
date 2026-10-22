(function () {
  var D = null, filtro = 'todos', editando = null, mapa = null, camada = null, cerca = null;
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  function api(m, p, b) { return fetch('/api/alarmes' + (p || ''), { method: m, headers: { 'Content-Type': 'application/json' }, body: b ? JSON.stringify(b) : undefined }).then(function (r) { return r.json().then(function (j) { j._s = r.status; return j; }); }); }
  function aviso(t, erro) { $('avisos').innerHTML = t ? '<div class="card aviso' + (erro ? ' erro' : '') + '">' + esc(t) + '</div>' : ''; }
  function carregar() {
    api('GET').then(function (d) {
      if (d._s !== 200) return aviso('Sem acesso aos alarmes.', true);
      D = d; $('topo').hidden = !d.podeEditar;
      var faltas = []; if (!d.email) faltas.push('envio de e-mail (RESEND_API_KEY)'); if (!d.cron) faltas.push('avaliação automática (ALARMES_CRON_TOKEN)');
      aviso(faltas.length ? 'Configuração pendente no servidor: ' + faltas.join(' e ') + '. As regras já podem ser criadas.' : '');
      var ch = [['todos', 'Todos']].concat(Object.keys(d.sistemas).map(function (k) { return [k, d.sistemas[k].nome]; }));
      $('filtros').innerHTML = ch.map(function (c) { return '<button class="chip" data-f="' + c[0] + '" aria-pressed="' + (filtro === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('');
      lista();
    });
  }
  function descr(r) {
    var g = D.gatilhos[r.gatilho];
    if (r.cerca) return g.nome + ': ' + (r.cerca.tipo === 'circulo' ? 'círculo de ' + r.cerca.raio + ' m' : 'polígono de ' + r.cerca.pontos.length + ' pontos');
    return g.nome + (g.unidade ? ' ' + r.limite + ' ' + g.unidade : '');
  }
  function lista() {
    var rs = D.regras.filter(function (r) { return filtro === 'todos' || r.sistema === filtro; });
    $('lista').innerHTML = rs.length ? rs.map(function (r) {
      var st = !r.ativo ? ['n', 'Desativado'] : r.estado === 'disparado' ? ['disparado', 'Disparado'] : r.estado === 'ok' ? ['ok', 'Normal'] : r.estado === 'sem fonte' ? ['n', 'Sem fonte de dados'] : ['info', 'Aguardando avaliação'];
      return '<div class="card reg"><div><b>' + esc(r.nome) + '<span class="st ' + st[0] + '">' + st[1] + '</span></b><span class="meta">' + esc(D.sistemas[r.sistema].nome) + ' · ' + esc(descr(r)) + '</span></div>' +
        (D.podeEditar ? '<div class="acoes" style="margin:0"><button class="btn" data-ed="' + r.id + '"><svg class="ico"><use href="#i-chave"></use></svg>Editar</button><button class="btn ' + (r.ativo ? '' : 'ok') + '" data-at="' + r.id + '"><svg class="ico"><use href="#i-' + (r.ativo ? 'pausa' : 'play') + '"></use></svg>' + (r.ativo ? 'Desativar' : 'Ativar') + '</button><button class="btn rem" data-rm="' + r.id + '"><svg class="ico"><use href="#i-limpar"></use></svg>Excluir</button></div>' : '') + '</div>';
    }).join('') : '<div class="card meta">Nenhum alarme cadastrado' + (filtro === 'todos' ? '' : ' para este sistema') + '.</div>';
  }
  function abrirForm(r) {
    editando = r || null; cerca = r && r.cerca ? JSON.parse(JSON.stringify(r.cerca)) : null;
    var sis = Object.keys(D.sistemas);
    $('form').hidden = false;
    $('form').innerHTML = '<form id="f"><div class="grid"><div><label>Nome</label><input id="fNome" maxlength="80" required value="' + esc(r ? r.nome : '') + '"></div>' +
      '<div><label>Sistema</label><select id="fSis">' + sis.map(function (k) { return '<option value="' + k + '"' + (r && r.sistema === k ? ' selected' : '') + '>' + esc(D.sistemas[k].nome) + '</option>'; }).join('') + '</select></div>' +
      '<div><label>Gatilho</label><select id="fGat"></select></div><div id="cLim"><label>Limite <span id="fUn"></span></label><input id="fLim" type="number" step="any" value="' + (r && r.limite != null ? r.limite : '') + '"></div></div>' +
      '<div id="cCerca" hidden><label>Cerca: clique no mapa para o centro (círculo) ou adicione pontos (polígono)</label><div class="grid"><div><select id="fTipo"><option value="circulo">Círculo</option><option value="poligono">Polígono</option></select></div><div><input id="fRaio" type="number" min="20" placeholder="Raio em metros" value="' + (cerca && cerca.raio || 300) + '"></div><div><button type="button" class="btn" id="fLimpar"><svg class="ico"><use href="#i-desvio"></use></svg>Limpar cerca</button></div></div><div id="mapa"></div></div>' +
      '<div class="acoes"><button class="btn pri" type="submit"><svg class="ico"><use href="#i-ok"></use></svg>Salvar</button><button class="btn" type="button" id="fCancel"><svg class="ico"><use href="#i-parada"></use></svg>Cancelar</button></div></form>';
    $('fSis').onchange = gats; gats(r && r.gatilho);
    $('fCancel').onclick = function () { $('form').hidden = true; };
    $('f').onsubmit = salvar;
    $('form').scrollIntoView({ behavior: 'smooth' });
  }
  function gats(sel) {
    var g = D.sistemas[$('fSis').value].gatilhos;
    $('fGat').innerHTML = g.map(function (k) { return '<option value="' + k + '"' + (sel === k ? ' selected' : '') + '>' + esc(D.gatilhos[k].nome) + '</option>'; }).join('');
    $('fGat').onchange = function () { tipo(); }; tipo();
  }
  function tipo() {
    var g = $('fGat').value, u = D.gatilhos[g].unidade, ec = g.indexOf('cerca_') === 0;
    $('cLim').hidden = ec || !u; $('fUn').textContent = u ? '(' + u + ')' : ''; $('cCerca').hidden = !ec;
    if (ec) setTimeout(desenharMapa, 0);
  }
  function desenharMapa() {
    if (!window.L) return;
    if (!mapa) {
      mapa = L.map('mapa').setView([-15.8, -47.9], 4);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(mapa);
      mapa.on('click', function (e) {
        var t = $('fTipo').value, p = { lat: +e.latlng.lat.toFixed(5), lon: +e.latlng.lng.toFixed(5) };
        if (t === 'circulo') cerca = { tipo: 'circulo', lat: p.lat, lon: p.lon, raio: +$('fRaio').value || 300 };
        else { if (!cerca || cerca.tipo !== 'poligono') cerca = { tipo: 'poligono', pontos: [] }; cerca.pontos.push(p); }
        pintar();
      });
      $('fRaio').oninput = function () { if (cerca && cerca.tipo === 'circulo') { cerca.raio = +this.value; pintar(); } };
      $('fLimpar').onclick = function () { cerca = null; pintar(); };
    }
    mapa.invalidateSize(); if (cerca) $('fTipo').value = cerca.tipo; pintar(true);
  }
  function pintar(ajustar) {
    if (camada) mapa.removeLayer(camada); camada = null;
    if (!cerca) return;
    var est = { color: '#2563eb' };
    camada = cerca.tipo === 'circulo' ? L.circle([cerca.lat, cerca.lon], Object.assign({ radius: cerca.raio }, est)) : L.polygon(cerca.pontos.map(function (p) { return [p.lat, p.lon]; }), est);
    camada.addTo(mapa); if (ajustar) mapa.fitBounds(camada.getBounds());
  }
  function salvar(e) {
    e.preventDefault();
    var g = $('fGat').value, b = { nome: $('fNome').value.trim(), sistema: $('fSis').value, gatilho: g };
    if (g.indexOf('cerca_') === 0) { if (!cerca) return aviso('Defina a cerca no mapa.', true); b.cerca = Object.assign({ nome: b.nome }, cerca); b.limite = null; }
    else { b.cerca = null; b.limite = D.gatilhos[g].unidade ? Number($('fLim').value) : null; }
    api(editando ? 'PUT' : 'POST', editando ? '/' + editando.id : '', b).then(function (r) {
      if (r.error) return aviso(r.error, true);
      $('form').hidden = true; carregar();
    });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t || !D) return;
    if (t.dataset.f) { filtro = t.dataset.f; carregar(); }
    var r = D.regras.find(function (x) { return x.id === (t.dataset.ed || t.dataset.at || t.dataset.rm); });
    if (t.dataset.ed) abrirForm(r);
    if (t.dataset.at) api('PUT', '/' + r.id, { ativo: !r.ativo }).then(carregar);
    if (t.dataset.rm && confirm('Excluir o alarme "' + r.nome + '"?')) api('DELETE', '/' + r.id).then(carregar);
    if (t.id === 'novo') abrirForm(null);
    if (t.id === 'teste') api('POST', '/teste').then(function (j) { aviso(j.ok ? 'E-mail de teste enviado (id ' + j.id + ').' : j.falta ? 'Falta configurar ' + j.falta + ' no servidor.' : 'Falha no envio: ' + (j.erro || j._s), !j.ok); });
    if (t.id === 'avaliar') api('POST', '/rodar').then(function (j) { aviso('Avaliados ' + (j.avaliadas || 0) + ' alarmes, ' + ((j.disparos || []).length) + ' disparo(s).'); carregar(); });
  });
  carregar();
})();
