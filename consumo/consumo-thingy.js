/* consumo-thingy.js: seção do Thingy:91X no /consumo/ (dados estimados pelo tamanho das mensagens). */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  function fb(b) { return b == null ? 'sem dado' : b >= 1048576 ? (b / 1048576).toFixed(2).replace('.', ',') + ' MB' : b >= 1024 ? (b / 1024).toFixed(1).replace('.', ',') + ' KB' : Math.round(b) + ' B'; }
  var NOME = { BATTERY: 'Bateria', TEMP: 'Temperatura', HUMID: 'Umidade', AIR_PRESS: 'Pressão do ar', GNSS: 'Mensagem GNSS', LOC_GNSS: 'Posição GNSS', LOC_WIFI: 'Posição Wi-Fi', LOC_MCELL: 'Posição por células', LOC_SCELL: 'Posição por célula', RSRP: 'Sinal', AIR_QUAL: 'Qualidade do ar' };
  function iniciar() {
    var T = window.ThingyDados; if (!T) return;
    T.tudo(30).then(function (r) {
      var d = r.d, ms = r.msgs.concat(r.locs);
      $('thCards').innerHTML = [['Hoje', fb(d.hoje)], ['7 dias', fb(d.d7)], ['30 dias', fb(d.d30)], ['Média diária', fb(d.media)], ['Projeção do mês', fb(d.proj)], ['Envios em 30 dias', d.tipos.reduce(function (s, t) { return s + t.n; }, 0).toLocaleString('pt-BR')]]
        .map(function (c) { return '<div class="card">' + c[0] + '<b>' + c[1] + '</b></div>'; }).join('');
      var mx = Math.max.apply(null, d.porDia.map(function (x) { return x.b; }).concat([1]));
      $('thDias').innerHTML = d.porDia.length ? d.porDia.map(function (x) { return '<div class="thb" title="' + x.d.split('-').reverse().join('/') + ': ' + fb(x.b) + '"><i style="height:' + Math.max(2, x.b / mx * 100) + '%"></i><small>' + x.d.slice(8) + '</small></div>'; }).join('') : '<p class="muted">sem dado</p>';
      $('thTipos').innerHTML = d.tipos.map(function (t) { return '<tr><td>' + (NOME[t.tipo] || t.tipo) + '</td><td>' + t.n.toLocaleString('pt-BR') + '</td><td>' + fb(t.b) + '</td></tr>'; }).join('') || '<tr><td colspan="3">sem dado</td></tr>';
      $('thSt').textContent = r.msgs.length + ' mensagens e ' + r.locs.length + ' posições reais lidas do nRF Cloud; bytes estimados.';
    }).catch(function (e) { $('thSt').innerHTML = e && e.message === 'sem chave' ? 'Sem chave do nRF Cloud neste navegador. <a class="btn btn-outline btn-sm" href="../rastreador/thingy91x/?config=1">Cadastrar chave</a>' : 'Não foi possível ler o nRF Cloud agora.'; $('thCards').innerHTML = ''; });
    T.iccid().then(function (i) { $('thChip').textContent = 'Chip Telekom, só Cat-M · ICCID ' + (i || 'sem dado'); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar); else iniciar();
})();
