/* relatorio.js: demonstração do módulo de relatório do Fing. TODOS OS DADOS SÃO FICTÍCIOS (cidade inventada Vila Aurora). */
(function () {
  var I = function (n, c) { return '<svg class="ico' + (c ? ' ' + c : '') + '" aria-hidden="true"><use href="#i-' + n + '"></use></svg>'; };
  var $ = function (id) { return document.getElementById(id); };

  var KPIS = [
    ['rota', '48 km', 'percorridos', ''], ['carro', '1h52', 'dirigindo', ''], ['parada', '6', 'paradas', ''],
    ['velocidade', '62 km/h', 'velocidade máxima', ''], ['local', '4', 'locais visitados', 'ok'], ['alerta', '2', 'alertas', 'alerta']
  ];
  $('kpis').innerHTML = KPIS.map(function (k) {
    return '<div class="kpi ' + k[3] + '">' + I(k[0]) + '<div><b>' + k[1] + '</b><span>' + k[2] + '</span></div></div>';
  }).join('');

  function barras(vals, cor, w, h) {
    var max = Math.max.apply(null, vals), bw = w / vals.length;
    return '<svg class="graf" viewBox="0 0 ' + w + ' ' + h + '">' + vals.map(function (v, i) {
      var bh = max ? (v / max) * (h - 4) : 0;
      return '<rect x="' + (i * bw + 1) + '" y="' + (h - bh) + '" width="' + (bw - 2) + '" height="' + bh + '" rx="2" fill="' + cor + '"/>';
    }).join('') + '</svg>';
  }
  function linha(vals, cor, w, h) {
    var max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), r = (max - min) || 1;
    var pts = vals.map(function (v, i) { return (i * w / (vals.length - 1)).toFixed(1) + ',' + (h - 3 - (v - min) / r * (h - 6)).toFixed(1); }).join(' ');
    return '<svg class="graf" viewBox="0 0 ' + w + ' ' + h + '" style="max-width:' + w + 'px"><polyline points="' + pts + '" fill="none" stroke="' + cor + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  var VERDE = 'var(--cor-ok)', VERM = 'var(--cor-alerta)', AZUL = 'var(--cor-info)', CINZA = 'var(--cor-neutro)';

  var CAPS = [
    ['camadas', 'Cruzamento de geoposição com local', 'Identifica onde o veículo esteve e que tipo de lugar é.', '', I('local', 'c-info') + ' -23,9 / -45,1 (fictício) ' + I('trabalho', 'c-ok') + ' <b>Trabalho</b>'],
    ['casa', 'Rotas habituais casa e trabalho', 'Aprende o horário típico de saída e a duração do trajeto.', 'ok', I('relogio', 'c-ok') + ' Saída típica <b>07h50</b> · <b>25 min</b>'],
    ['viagem', 'Viagens longas detectadas', 'Separa viagens fora da rotina pela distância e duração.', '', I('rota', 'c-info') + ' Vila Aurora a Serra Azul · <b>180 km</b>'],
    ['permanencia', 'Paradas e permanência', 'Mostra quanto tempo ficou em cada lugar.', '', I('academia', 'c-info') + ' Academia <b>55 min</b>'],
    ['calendario', 'Horários típicos por dia da semana', 'Compara cada dia com o padrão daquele dia.', '', '<div style="flex:1">' + barras([9, 8, 9, 7, 8, 3, 1], AZUL, 140, 28) + '</div> seg a dom'],
    ['desvio', 'Desvios de rota e horário', 'Marca em vermelho o que sai do padrão.', 'alerta', I('alerta', 'c-alerta') + ' Rota diferente às <b>15h10</b> · +6 km'],
    ['sinal', 'Alertas de sinal e sem posição', 'Avisa quando o sinal cai ou a posição para de chegar.', 'alerta', I('offline', 'c-alerta') + ' Sem posição por <b>12 min</b>'],
    ['saude', 'Bateria e saúde do dispositivo', 'Acompanha bateria, temperatura e reinícios.', 'ok', I('bateria', 'c-ok') + ' <b>87%</b> <div style="flex:1">' + linha([92, 91, 90, 90, 89, 88, 87], VERDE, 120, 24) + '</div>'],
    ['baixar', 'Exportação CSV e PDF', 'Gera planilha e relatório pronto para enviar.', '', I('csv', 'c-info') + ' CSV ' + I('pdf', 'c-info') + ' PDF']
  ];
  $('caps').innerHTML = CAPS.map(function (c) {
    return '<div class="cap ' + c[3] + '"><h3>' + I(c[0]) + c[1] + '</h3><p>' + c[2] + '</p><div class="ex">' + c[4] + '</div></div>';
  }).join('');

  // Mapa fictício em SVG: ruas genéricas, sem coordenadas reais
  var L = { casa: [60, 220], trabalho: [420, 70], academia: [300, 200], posto: [200, 120], cliente: [470, 230] };
  var pin = function (k, ic, nome) {
    var p = L[k];
    return '<g class="pino" data-k="' + k + '" transform="translate(' + (p[0] - 12) + ',' + (p[1] - 12) + ')"><circle cx="12" cy="12" r="15" fill="var(--fundo-card)" stroke="var(--borda)"/>' +
      '<use href="#i-' + ic + '" width="24" height="24" style="color:var(--cor-info)" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<text x="' + p[0] + '" y="' + (p[1] + 30) + '" text-anchor="middle" font-size="12" fill="var(--texto)">' + nome + '</text>';
  };
  $('mapa').innerHTML = '<svg class="graf" viewBox="0 0 520 280" role="img" aria-label="Mapa fictício de Vila Aurora">' +
    '<rect width="520" height="280" rx="12" fill="var(--cor-neutro-fundo)"/>' +
    '<g stroke="var(--borda)" stroke-width="10" stroke-linecap="round"><path d="M20 220H500M60 40V260M200 30V260M420 30V260M20 70H500M20 150H500"/></g>' +
    '<path d="M60 220V150H200V70H420" fill="none" stroke="var(--cor-ok)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<path d="M420 70V150H300V200H470V230" fill="none" stroke="var(--cor-alerta)" stroke-width="5" stroke-dasharray="10 6" stroke-linecap="round" stroke-linejoin="round"/>' +
    pin('casa', 'casa', 'Casa') + pin('trabalho', 'trabalho', 'Trabalho') + pin('academia', 'academia', 'Academia') + pin('posto', 'posto', 'Posto') + pin('cliente', 'cliente', 'Cliente') +
    '<circle id="veic" r="8" fill="var(--cor-info)" stroke="#fff" stroke-width="3" cx="60" cy="220"/>' +
    '<text x="16" y="270" font-size="11" fill="var(--texto-suave)">Vila Aurora (mapa fictício)</text></svg>';

  var PARADAS = [
    ['trabalho', 'Trabalho', '08h15 às 12h00', '3h45'], ['posto', 'Posto', '12h10 às 12h20', '10 min'],
    ['cliente', 'Cliente', '15h35 às 16h30', '55 min'], ['academia', 'Academia', '18h10 às 19h05', '55 min'], ['casa', 'Casa', 'a partir de 19h30', 'noite']
  ];
  $('paradas').innerHTML = PARADAS.map(function (p) {
    return '<div class="parada">' + I(p[0]) + '<div><b>' + p[1] + '</b><small>' + p[2] + '</small></div><div class="dur"><b>' + p[3] + '</b><small>permanência</small></div></div>';
  }).join('');

  // Linha do tempo: [hora, ícone, cor, o que fez, como fez, duração, peso na faixa]
  var TL = [
    ['07h50', 'casa', 'c-neutro', 'Saiu de Casa', 'início do dia', '', 0],
    ['07h50', 'dirigindo', 'c-ok', 'Dirigindo para o Trabalho', 'rota normal, média 38 km/h', '25 min', 25],
    ['08h15', 'trabalho', 'c-info', 'Parado no Trabalho', 'motor desligado', '3h45', 225],
    ['12h00', 'dirigindo', 'c-ok', 'Dirigindo para o Posto', 'média 30 km/h', '10 min', 10],
    ['12h10', 'posto', 'c-info', 'Parado no Posto', 'abastecimento', '10 min', 10],
    ['12h20', 'trabalho', 'c-info', 'De volta ao Trabalho', 'parado', '2h50', 170],
    ['15h10', 'desvio', 'c-alerta', 'Desvio de rota', 'caminho fora do padrão, máx 62 km/h', '25 min', 25],
    ['15h35', 'cliente', 'c-info', 'Parado no Cliente', 'visita', '55 min', 55],
    ['18h10', 'academia', 'c-info', 'Parado na Academia', 'após 1h40 entre trajeto e espera', '55 min', 55],
    ['19h05', 'dirigindo', 'c-ok', 'Dirigindo para Casa', 'rota normal, média 35 km/h', '25 min', 25],
    ['19h30', 'casa', 'c-neutro', 'Chegou em Casa', 'fim do dia', '', 0]
  ];
  var corFaixa = { 'c-ok': VERDE, 'c-info': AZUL, 'c-alerta': VERM, 'c-neutro': CINZA };
  $('faixa').innerHTML = TL.filter(function (t) { return t[6]; }).map(function (t) {
    return '<div title="' + t[0] + ' ' + t[3] + '" style="flex:' + t[6] + ';background:' + corFaixa[t[2]] + '"></div>';
  }).join('');
  $('tl').innerHTML = TL.map(function (t) {
    return '<li><span class="h">' + t[0] + '</span>' + I(t[1], t[2]) + '<span>' + t[3] + ' <span class="m">' + t[4] + '</span></span><span class="m">' + t[5] + '</span></li>';
  }).join('');

  var hora = [0, 0, 0, 0, 0, 0, 1, 6, 9, 2, 1, 2, 5, 3, 1, 4, 3, 2, 6, 7, 2, 1, 0, 0];
  $('porHora').innerHTML = barras(hora, AZUL, 480, 90) + '<div class="frase" style="display:flex;justify-content:space-between"><span>' + I('relogio') + ' 0h</span><span>12h</span><span>23h</span></div>';
  var dias = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'], v = [9, 8, 9, 7, 8, 3, 1];
  $('porDia').innerHTML = barras(v, VERDE, 480, 90) + '<div class="frase" style="display:flex;justify-content:space-between">' + dias.map(function (d) { return '<span>' + d + '</span>'; }).join('') + '</div>';

  $('alertas').innerHTML =
    '<div class="alerta-item">' + I('desvio') + '<div><b>15h10 Desvio de rota</b><br><small>+6 km fora do caminho habitual</small></div></div>' +
    '<div class="alerta-item">' + I('offline') + '<div><b>16h40 Sem posição</b><br><small>12 min sem sinal de GPS</small></div></div>';

  var rsrp = [-92, -95, -90, -98, -104, -101, -96, -93, -91, -94, -97, -92];
  var bat = [98, 97, 96, 95, 94, 93, 92, 91, 90, 89, 88, 87];
  $('saude').innerHTML =
    '<div class="spark">' + I('sinal', 'c-info') + '<b>-94 dBm</b>' + linha(rsrp, AZUL, 260, 36) + '</div>' +
    '<div class="spark">' + I('bateria', 'c-ok') + '<b>87%</b>' + linha(bat, VERDE, 260, 36) + '</div>';


  // Reprodução do dia (fictício): quadros-chave [minuto desde 07h50, x, y]
  var Q = [[0,60,220],[8,60,150],[16,200,150],[25,200,70],[25,420,70],[250,420,70],[255,200,70],[260,200,120],[270,200,120],[275,200,70],[280,420,70],
    [440,420,70],[450,420,150],[458,300,150],[465,300,200],[472,470,200],[475,470,230],[530,470,230],[540,300,230],[555,300,200],[620,300,200],[630,200,200],[640,60,220],[690,60,220]];
  // corrige o trecho Trabalho: o primeiro quadro de chegada vem do eixo 200,70 para 420,70
  Q[3] = [18,200,70]; Q[4] = [25,420,70];
  var PAR_MIN = { trabalho: 25, posto: 260, cliente: 475, academia: 555, casa: 640 };
  function pos(m) {
    for (var i = 1; i < Q.length; i++) if (m <= Q[i][0]) {
      var a = Q[i - 1], b = Q[i], t = b[0] === a[0] ? 1 : (m - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
    return [Q[Q.length - 1][1], Q[Q.length - 1][2]];
  }
  function hhmm(m) { var t = 7 * 60 + 50 + Math.round(m); return String(Math.floor(t / 60)).padStart(2, '0') + 'h' + String(t % 60).padStart(2, '0'); }
  var rel = $('rel'), veic = $('veic'), tocando = null;
  function marcar(k) {
    document.querySelectorAll('.pino,.parada').forEach(function (e) { e.classList.toggle('sel', e.dataset.k === k); });
  }
  function ir(m) {
    m = Math.max(0, Math.min(690, m)); rel.value = m;
    var p = pos(m); veic.setAttribute('cx', p[0]); veic.setAttribute('cy', p[1]);
    $('relHora').textContent = hhmm(m);
    var aqui = null; for (var k in PAR_MIN) { var p2 = L[k]; if (Math.abs(p2[0] - p[0]) < 4 && Math.abs(p2[1] - p[1]) < 4) aqui = k; }
    if (aqui) marcar(aqui);
  }
  function parar() { clearInterval(tocando); tocando = null; $('play').querySelector('use').setAttribute('href', '#i-play'); $('play').querySelector('span').textContent = 'Reproduzir'; }
  $('play').addEventListener('click', function () {
    if (tocando) return parar();
    if (+rel.value >= 690) ir(0);
    $('play').querySelector('use').setAttribute('href', '#i-pausa'); $('play').querySelector('span').textContent = 'Pausar';
    tocando = setInterval(function () { var m = +rel.value + 3; ir(m); if (m >= 690) parar(); }, 40);
  });
  rel.addEventListener('input', function () { ir(+rel.value); });
  function irParada(k) { parar(); ir(PAR_MIN[k]); marcar(k); var p = PARADAS.filter(function (x) { return x[0] === k; })[0]; if (p) $('relInfo').textContent = p[1] + ': ' + p[2] + ', permanência ' + p[3] + '.'; }
  document.querySelectorAll('.pino').forEach(function (g) { g.addEventListener('click', function () { irParada(g.dataset.k); }); });
  document.querySelectorAll('.parada').forEach(function (d, i) { d.dataset.k = PARADAS[i][0]; d.addEventListener('click', function () { irParada(d.dataset.k); }); });
  document.querySelectorAll('#tl li').forEach(function (li, i) {
    li.addEventListener('click', function () { var h = TL[i][0].split('h'); parar(); ir(+h[0] * 60 + +h[1] - (7 * 60 + 50)); });
  });
  ir(0);
})();
