/* v1: cartão único de busca de satélite só no Utilities (substitui o painel azul do BuscaUI aqui; ntn/ e connect.html seguem com BuscaUI).
   Inclui: nível de sinal (faixas RSRP), ponte opcional Web Serial para sinal ao vivo com a placa no USB do Mac. Só leitura. */
(function () {
  'use strict';
  /* Constantes fáceis de mudar. Registro pode levar muitos minutos: nada de alarme precoce. */
  var CFG = window.BuscaCardCfg || { sugestaoMin: 10, alertaMin: 30, serialFrescoS: 30 };
  if (CFG.macFrescoS == null) CFG.macFrescoS = 45; // v71: leitura do leitor serial do Mac (SIG a cada 10 s + polling 5 s)
  var LIM_MIN = CFG.sugestaoMin;
  /* Máquina de estados da UI (firmware 1.7: APP|<uptime>|STATE|<X>) */
  var ESTADOS = {
    BUSCA:      { t: 'Buscando satélite', cor: 'azul', led: ['l2 rap', 'LED2 piscando rápido'], passo: 'Aguarde sem reiniciar. É normal não chegar nenhum dado até o registro.' },
    SINCRONIA:  { t: 'Sincronizando com o satélite', cor: 'azul', led: ['l2 rap', 'LED2 piscando rápido'], passo: 'Satélite encontrado, ajustando tempo e frequência. Mantenha a antena parada.' },
    REGISTRADO: { t: 'Registrado no satélite', cor: 'verde', led: ['l2 len', 'LED2 piscando devagar'], passo: 'Registrado. A primeira leitura pelo satélite deve chegar em instantes.' },
    ENVIO:      { t: 'Enviando pelo satélite', cor: 'verde', led: ['l2 len', 'LED2 piscando devagar'], passo: 'Enviando dados. Nada a fazer.' },
    FALHA:      { t: 'Falha no registro', cor: 'vermelho', led: ['all rap', 'Todos os LEDs piscando'], passo: 'Confira o checklist abaixo e repita o teste segurando o botão 4 por 3 s.' },
    CATM:       { t: 'De volta ao Cat-M', cor: 'cinza', led: ['l1 on', 'LED1 aceso'], passo: 'A placa voltou à rede celular. Para testar de novo, segure o botão 4 por 3 s.' }
  };
  function normEstado(x) { x = String(x || '').toUpperCase().normalize('NFD').replace(/[^A-Z_]/g, ''); var al = { SEARCH: 'BUSCA', SYNC: 'SINCRONIA', REG: 'REGISTRADO', REGISTERED: 'REGISTRADO', SEND: 'ENVIO', TX: 'ENVIO', FAIL: 'FALHA', ERRO: 'FALHA', ERROR: 'FALHA', CAT_M: 'CATM', LTE: 'CATM' }; x = al[x] || x; return ESTADOS[x] ? x : null; }
  function idade(at) { return at ? 'há ' + dur(Date.now() - at) : ''; }
  function dur(ms) { var s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s' : Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' min'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  /* Faixas pedidas: fraco < -120 dBm; médio -120 a -110; forte > -110 */
  function nivel(rsrp, daPlaca) {
    if (daPlaca && typeof NIV !== 'undefined') { for (var k in NIV) if (NIV[k].k === daPlaca) return NIV[k]; }
    if (rsrp == null || isNaN(rsrp)) return null;
    return rsrp > -110 ? { k: 'forte', t: 'Forte', b: 3 } : rsrp >= -120 ? { k: 'medio', t: 'Médio', b: 2 } : { k: 'fraco', t: 'Fraco', b: 1 };
  }
  function barras(n) { var b = n ? n.b : 0; return '<span class="bc-bars ' + (n ? n.k : 'nd') + '" aria-hidden="true"><i' + (b >= 1 ? ' class="on"' : '') + '></i><i' + (b >= 2 ? ' class="on"' : '') + '></i><i' + (b >= 3 ? ' class="on"' : '') + '></i></span>'; }
  function chipNivel(rsrp, extra) { var n = nivel(rsrp); return n ? '<span class="bc-nivel ' + n.k + '">' + barras(n) + '<b>' + n.t + '</b> ' + rsrp + ' dBm' + (extra || '') + '</span>' : ''; }

  /* ---------- Ponte serial (Web Serial API, Chrome/Edge no Mac). Nada é enviado à nuvem. ----------
     Linha esperada do firmware (a cada ~10 s durante a busca), qualquer uma destas formas:
       NTN_RSRP rsrp=-114 snr=2 t=123      (formato sugerido)
       +CESQ / %XMONITOR / "rsrp: -114" também são aceitos pelo regex genérico abaixo. */
  var serial = { estado: 'off', rsrp: null, snr: null, at: 0, port: null, reader: null, erro: '', placa: null, placaAt: 0 };
  var RE = [/NTN_RSRP\s+rsrp=(-?\d+)(?:\s+snr=(-?\d+))?/i, /\brsrp[\s:=]+(-?\d{2,3})(?:\D+snr[\s:=]+(-?\d+))?/i];
  /* Firmware 1.7 (formato final, já na placa):
       APP|<ms>|STATE|<CATM|SINCRONIA|BUSCA|REGISTRADO|ENVIO|FALHA>   a cada transição (<ms> = uptime)
       APP|<ms>|SIG|rsrp=<n> dBm nivel=<FRACO|MEDIO|FORTE>            a cada 10 s, só em BUSCA
       APP|<ms>|SIG|rsrp=NA nivel=NA                                   sem leitura
     Retorna {estado?, rsrp?, nivel?, semLeitura?, up?} ou null. Formatos antigos (NTN_RSRP, rsrp: -114) seguem aceitos. */
  var NIV = { FRACO: { k: 'fraco', t: 'Fraco', b: 1 }, MEDIO: { k: 'medio', t: 'Médio', b: 2 }, FORTE: { k: 'forte', t: 'Forte', b: 3 } };
  function parseLinha(l) {
    l = String(l || '').trim(); if (!l) return null;
    var up = /^APP\|(\d+)\|/.exec(l), m = /(?:^|\|)STATE\|([A-Za-z_\-]+)/i.exec(l) || /\bSTATE[\s:=]+([A-Za-z_\-]+)/i.exec(l);
    if (m) { var e = normEstado(m[1]); return e ? { estado: e, up: up ? +up[1] : null } : null; }
    var sg = /(?:^|\|)SIG\|(.*)$/i.exec(l);
    if (sg) {
      var rr = /rsrp=(-?\d+|NA)/i.exec(sg[1]), nn = /nivel=([A-Za-z]+)/i.exec(sg[1]);
      if (!rr || /^NA$/i.test(rr[1])) return { semLeitura: true, rsrp: null, nivel: null, up: up ? +up[1] : null };
      var r = +rr[1]; if (r > -40 || r < -160) return null;
      var nv = nn && NIV[nn[1].toUpperCase().normalize('NFD').replace(/[^A-Z]/g, '')] || null;
      return { rsrp: r, nivel: nv ? nv.k : null, snr: null, up: up ? +up[1] : null };
    }
    for (var i = 0; i < RE.length; i++) { var mm = RE[i].exec(l.replace(/\|/g, ' ')); if (mm) { var r2 = +mm[1]; if (r2 <= -40 && r2 >= -160) { var sn = /snr[\s:=]+(-?\d+)/i.exec(l); return { rsrp: r2, snr: sn ? +sn[1] : (mm[2] != null ? +mm[2] : null) }; } break; } }
    return null;
  }
  /* Nuvem: formato não mudou. Campos r (RSRP dBm) e n ('n' satélite, 'c' Cat-M). Não há estado: deduzimos pela rede.
     Ainda aceita r.rsrp / r.estado caso um dia venham. */
  function parseNuvem(r) {
    if (!r) return null;
    var rs = r.r != null ? +r.r : r.rsrp != null ? +r.rsrp : null; if (rs != null && isNaN(rs)) rs = null;
    var e = normEstado(r.estado || r.state || r.st) || (r.n === 'n' ? 'REGISTRADO' : r.n === 'c' ? 'CATM' : null);
    if (!e && rs == null) return null;
    return { estado: e, rede: r.n === 'n' ? 'satelite' : r.n === 'c' ? 'catm' : null, rsrp: rs, snr: r.snr != null ? +r.snr : r.s != null ? +r.s : null, at: r.at || (r.ts ? Date.parse(r.ts) : null) };
  }
  var ouvintes = [];
  function avisa() { ouvintes.forEach(function (f) { try { f(serial); } catch (e) {} }); }
  async function conectar() {
    if (!('serial' in navigator)) { serial.estado = 'sem-api'; avisa(); return; }
    try {
      var port = await navigator.serial.requestPort(); // usuário escolhe /dev/cu.usbmodem0010520926491
      await port.open({ baudRate: 115200 });
      serial.port = port; serial.estado = 'ligado'; serial.erro = ''; avisa();
      var dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable).catch(function () {});
      var reader = dec.readable.getReader(), buf = ''; serial.reader = reader;
      while (true) {
        var r = await reader.read(); if (r.done) break;
        buf += r.value; var ls = buf.split(/\r?\n/); buf = ls.pop();
        ls.forEach(function (l) { var p = parseLinha(l); if (p) { if (p.estado) { serial.placa = p.estado; serial.placaAt = Date.now(); } if (p.rsrp != null) { serial.rsrp = p.rsrp; serial.snr = p.snr; serial.nivelPlaca = p.nivel || null; serial.semLeitura = false; serial.at = Date.now(); } else if (p.semLeitura) { serial.semLeitura = true; serial.rsrp = null; serial.at = Date.now(); } avisa(); } });
      }
    } catch (e) { serial.estado = serial.port ? 'erro' : 'off'; serial.erro = e && e.message || ''; avisa(); }
  }
  async function desligar() { try { if (serial.reader) await serial.reader.cancel(); if (serial.port) await serial.port.close(); } catch (e) {} serial = { estado: 'off', rsrp: null, snr: null, at: 0, port: null, reader: null, erro: '', placa: null, placaAt: 0 }; avisa(); }

  function medidor(n, rsrp, extra, cls) {
    return '<div class="bc-medidor ' + (n ? n.k : 'nd') + (cls ? ' ' + cls : '') + '">' + barras(n) + '<div><b>' + (n ? n.t : 'Sem leitura') + '</b>' + (rsrp != null ? '<span class="bc-dbm">' + rsrp + ' dBm</span>' : '') + (extra ? '<span class="bc-mut">' + extra + '</span>' : '') + '</div></div>';
  }
  /* v71: leitor serial do Mac publica na nuvem (fonte=usb, rx do servidor). Só aparece se a Web Serial direta não estiver ao vivo. */
  function blocoMac(m) {
    var fresco = m && m.rsrp !== undefined && Date.now() - m.at < CFG.macFrescoS * 1000;
    if (!fresco) return '';
    var n = m.rsrp != null ? nivel(m.rsrp, m.nivel) : null;
    return '<div class="bc-sinal" aria-live="polite"><small>Sinal ao vivo</small>' + medidor(n, m.rsrp, (m.rsrp == null ? 'placa sem medida agora (NA), ' : '') + 'via USB do Mac, ' + idade(m.at)) + '</div>';
  }
  function blocoSerial(mac) {
    var s = serial, fresco = Date.now() - s.at < CFG.serialFrescoS * 1000, n = fresco && s.rsrp != null ? nivel(s.rsrp, s.nivelPlaca) : null, corpo;
    if (s.estado === 'sem-api') corpo = '<p class="bc-mut">Este navegador não lê a porta USB. Use Chrome ou Edge no Mac.</p>';
    else if (s.estado !== 'ligado' && blocoMac(mac)) return blocoMac(mac);
    else if (s.estado !== 'ligado') corpo = '<p class="bc-mut">Com a placa no USB do Mac, veja o sinal enquanto ela busca.</p><button type="button" class="btn btn-sm" data-bc="serial">Ler sinal pelo USB</button>';
    else if (!n) corpo = medidor(null, null, fresco && s.semLeitura ? 'placa sem medida agora (NA) ' + idade(s.at) : 'porta aberta, aguardando a placa') + '<button type="button" class="bc-link" data-bc="serial-off">Desconectar</button>';
    else corpo = medidor(n, s.rsrp, 'ao vivo pelo USB, ' + idade(s.at) + (s.snr != null ? ' · SNR ' + s.snr + ' dB' : '')) + '<button type="button" class="bc-link" data-bc="serial-off">Desconectar</button>';
    return '<div class="bc-sinal" aria-live="polite"><small>Sinal ao vivo</small>' + corpo + '</div>';
  }
  var LED = { busca: ['l2 rap', 'LED2 piscando rápido: buscando satélite'], reg: ['l2 len', 'LED2 piscando devagar: registrado no satélite'] };
  var CHECK = [
    ['Céu aberto', 'Visada livre para o norte, satélite geoestacionário'],
    ['Antena para cima', 'Na vertical, sem nada por cima'],
    ['SIM com perfil NTN', 'SIM Deutsche Telekom ativo com perfil NTN'],
    ['GNSS com posição', 'Fix obtido antes da sonda; medidor fixo precisa só uma vez'],
    ['Longe de metal', 'Sem parede, telhado ou caixa metálica por perto'],
    ['Não reiniciar', 'O registro pode levar vários minutos'],
    ['Repetir o teste', 'Segurar o botão 4 por 3 s'],
    ['Bandas NTN no modem', '23, 255 e 256 habilitadas']
  ];
  var el0 = null, o0 = null, tick = null;
  function render(el, o) {
    if (!el) return; el0 = el; o0 = o;
    if (!o) { el.hidden = true; if (tick) { clearInterval(tick); tick = null; } return; }
    if (!tick) tick = setInterval(function () { if (el0 && o0) render(el0, o0); }, 1000);
    var now = Date.now(), ms = now - o.t0;
    /* Estado: o evento mais recente vence (serial x nuvem). Sem nada novo, vale o estado derivado pela plataforma. */
    var cand = [{ e: o.reg ? 'REGISTRADO' : o.sync ? 'SINCRONIA' : 'BUSCA', at: o.lastRx || o.t0, src: 'plataforma' }];
    var nv = parseNuvem(o.nuvem); if (nv && nv.estado) cand.push({ e: nv.estado, at: nv.at || 0, src: 'nuvem' });
    if (serial.placa) cand.push({ e: serial.placa, at: serial.placaAt, src: 'USB' });
    if (o.usbMac && o.usbMac.estado && ESTADOS[o.usbMac.estado]) cand.push({ e: o.usbMac.estado, at: o.usbMac.estadoAt, src: 'USB do Mac' });
    var est = cand.reduce(function (a, b) { return b.at >= a.at ? b : a; }), E = ESTADOS[est.e], buscando = est.e === 'BUSCA' || est.e === 'SINCRONIA';
    var sug = buscando && ms > LIM_MIN * 60000, alerta = buscando && ms > CFG.alertaMin * 60000, longo = alerta;
    var passo = o.semRetorno ? 'A placa não voltou ao Cat-M depois da sonda. Reinicie a placa.'
      : alerta ? 'Sem registro há mais de ' + CFG.alertaMin + ' min. Reposicione a antena e confira o checklist.'
      : E.passo + (sug ? ' Se quiser, ajuste a antena: céu aberto, virada para cima e longe de metal.' : '');
    var refs = (o.refs || []).filter(function (x) { return x > 0; }), ref = refs.length ? 'Registros anteriores levaram ' + refs.slice(-3).map(dur).join(', ') : '';
    var sinalN = nv && nv.rsrp != null && (!o.sinal || (nv.at || 0) >= (o.sinal.at || 0)) ? nv : o.sinal;
    var nuvem = sinalN && sinalN.rsrp != null ? '<div class="bc-sinal"><small>Última medida da nuvem</small>' + medidor(nivel(sinalN.rsrp), sinalN.rsrp, idade(sinalN.at)) + '</div>' : '';
    var rej = (o.rej || []).length ? '<p class="bc-alerta">Rejeição reportada pela placa: ' + o.rej.map(esc).join(', ') + '</p>' : '';
    var gps = o.gps && !o.gps.ok ? '<p class="bc-alerta">Sem posição GPS válida. Sem fix o modem não sincroniza com o satélite.</p>' : '';
    var foco = document.activeElement && el.contains(document.activeElement) ? document.activeElement.getAttribute('data-bc') : null;
    /* v2: o título fica só no cartão; o hero de busca some para não repetir */
    var hb = document.getElementById('hero'); if (hb && hb.classList.contains('bc-hero')) hb.hidden = true;
    var FLUXO = ['BUSCA', 'SINCRONIA', 'REGISTRADO', 'ENVIO'], iA = FLUXO.indexOf(est.e);
    var trilha = '<ol class="bc-trilha" aria-label="Etapas do registro">' + FLUXO.map(function (f, i) { var c = iA < 0 ? '' : i < iA ? 'feito' : i === iA ? 'agora' : ''; return '<li class="' + c + '"' + (c === 'agora' ? ' aria-current="step"' : '') + '><i></i>' + ESTADOS[f].t.replace(' pelo satélite', '').replace(' no satélite', '').replace(' com o satélite', '').replace(' satélite', '') + '</li>'; }).join('') + '</ol>';
    var pct = Math.min(100, ms / (CFG.alertaMin * 60000) * 100), marca = LIM_MIN / CFG.alertaMin * 100;
    var barra = buscando ? '<div class="bc-prog" role="img" aria-label="' + Math.round(ms / 60000) + ' de ' + CFG.alertaMin + ' minutos"><span style="width:' + pct.toFixed(1) + '%"></span><em style="left:' + marca + '%" title="' + LIM_MIN + ' min: sugestão"></em></div><div class="bc-prog-l"><span>0</span><span style="left:' + marca + '%">' + LIM_MIN + ' min · ajuste opcional</span><span>' + CFG.alertaMin + ' min · alerta</span></div>' : '';
    el.hidden = false; el.className = 'hbusca bc ' + E.cor + (alerta ? ' longo' : sug ? ' sug' : '');
    el.innerHTML =
      '<div class="bc-card" role="group" aria-label="Estado do satélite">' +
        '<header class="bc-topo"><span class="bc-est ' + E.cor + '"><i></i>' + E.t + '</span><span class="bc-fonte">' + (est.src === 'plataforma' ? 'pela nuvem' : 'pelo ' + est.src) + ' · ' + idade(est.at) + '</span></header>' +
        trilha +
        '<div class="bc-corpo">' +
          '<div class="bc-crono"><small>' + (buscando ? 'Tempo de busca' : 'Desde o início do teste') + '</small><b class="bc-tempo" role="timer">' + dur(ms) + '</b><span class="bc-mut">início às ' + new Date(o.t0).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (ref ? ' · ' + ref.toLowerCase().replace('registros anteriores levaram', 'antes levou') : '') + '</span>' + barra + '</div>' +
          '<div class="bc-sinais">' + blocoSerial(o.usbMac) + nuvem + '</div>' +
        '</div>' +
        '<div class="bc-passo"><span class="bc-passo-i" aria-hidden="true">→</span><p><b>Próximo passo.</b> ' + passo + '</p></div>' +
        '<p class="bc-led"><span class="led ' + E.led[0] + '"></span>' + E.led[1] + '</p>' +
      '</div>' + rej + gps +
      '<details class="bc-ts"><summary>Checklist para registrar <span class="bc-mut">' + Object.keys(render.chk || {}).filter(function (k) { return render.chk[k]; }).length + ' de ' + CHECK.length + '</span></summary><ul class="bc-check">' +
        CHECK.map(function (c, i) { return '<li' + (i < 3 ? ' class="prio"' : '') + '><label><input type="checkbox"><span><b>' + c[0] + '</b><small>' + c[1] + '</small></span></label></li>'; }).join('') +
      '</ul></details>';
    var det = el.querySelector('.bc-ts'); if (det) { det.open = !!render.tsAberto; det.ontoggle = function () { render.tsAberto = det.open; }; }
    var chk = render.chk || (render.chk = {}); el.querySelectorAll('.bc-check input').forEach(function (b, i) { b.checked = !!chk[i]; b.onchange = function () { chk[i] = b.checked; render(el0, o0); }; });
    el.querySelectorAll('[data-bc]').forEach(function (b) { b.onclick = b.getAttribute('data-bc') === 'serial' ? conectar : desligar; });
    if (foco) { var f = el.querySelector('[data-bc="' + foco + '"]'); if (f) f.focus(); }
  }
  render.tsAberto = window.matchMedia && window.matchMedia('(min-width: 900px)').matches;
  ouvintes.push(function () { if (el0 && o0) render(el0, o0); });
  window.BuscaCardU = { render: render, nivel: nivel, chipNivel: chipNivel, parseLinha: parseLinha, parseNuvem: parseNuvem, ESTADOS: ESTADOS, CFG: CFG, _serial: function (s) { if (s) { Object.assign(serial, s); avisa(); } return serial; } };
})();
