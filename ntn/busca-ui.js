/* v47: painel de busca de satélite compartilhado (ntn/, connect.html, utilities/). Só exibe evidência real recebida. */
(function () {
  'use strict';
  var EMM = { 2: 'IMSI desconhecido na rede', 3: 'UE ilegal (SIM rejeitado)', 6: 'equipamento ilegal', 7: 'serviço EPS não permitido no SIM', 11: 'PLMN não permitida (SIM sem perfil Skylo)', 12: 'área de rastreamento não permitida', 13: 'roaming não permitido nesta área', 14: 'EPS não permitido nesta PLMN', 15: 'sem células adequadas nesta área', 17: 'falha de rede', 22: 'congestionamento' };
  function dur(ms) { var s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + ' s' : s < 3600 ? Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s' : Math.floor(s / 3600) + ' h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ' min'; }
  function medidor(sinal) {
    if (!sinal || sinal.rsrp == null) return '<div class="bm-sig nd"><div class="bm-bar"><i style="width:0"></i></div><b>sinal não reportado pela placa</b><small>Durante a busca a placa ainda não enviou medição do satélite</small></div>';
    var f = Math.max(0, Math.min(1, (sinal.rsrp + 140) / 50)), c = sinal.rsrp >= -110 ? '#2fd27a' : sinal.rsrp >= -125 ? '#ffb020' : '#ff5470';
    return '<div class="bm-sig"><div class="bm-bar"><i style="width:' + Math.round(f * 100) + '%;background:' + c + '"></i></div><b>' + sinal.rsrp + ' dBm' + (sinal.snr != null ? ' · SNR ' + sinal.snr + ' dB' : '') + '</b><small>última medição do satélite recebida' + (sinal.at ? ' às ' + new Date(sinal.at).toLocaleTimeString('pt-BR') : '') + '</small></div>';
  }
  window.BuscaUI = {
    /* o: { t0, iniTxt, sinal:{rsrp,snr,at}, sync, reg, refs:[ms], rej:[] } */
    render: function (el, o) {
      if (!el) return;
      if (!o) { el.hidden = true; return; }
      var now = Date.now(), etapa = o.reg ? 3 : o.sync ? 2 : 1;
      var et = ['Busca', 'Sincronia', 'Registro', 'Envio'].map(function (n, i) { return '<span class="hb-et' + (i + 1 < etapa ? ' feito' : i + 1 === etapa ? ' atual' : '') + '">' + (i + 1) + '. ' + n + '</span>'; }).join('<i class="hb-seta">›</i>');
      var refs = (o.refs || []).filter(function (x) { return x > 0; });
      var refTxt = refs.length ? refs.slice(-3).map(function (x) { return dur(x); }).join(', ') : 'nenhum registro no satélite medido no histórico carregado';
      var rej = (o.rej || []).map(function (c) { return /^\d+$/.test(String(c)) ? 'causa ' + c + ': ' + (EMM[c] || 'código não mapeado') : String(c); });
      el.hidden = false;
      el.innerHTML = '<div class="bm-banner">🛰 BUSCANDO SATÉLITE SKYLO</div>' +
        '<div class="hb-row"><div class="hb-crono"><small>Buscando há</small><b>' + dur(now - o.t0) + '</b><span>desde ' + new Date(o.t0).toLocaleTimeString('pt-BR') + (o.iniTxt ? ' · ' + o.iniTxt : '') + '</span></div>' +
        '<div style="flex:1;min-width:240px"><small>Sinal do satélite</small>' + medidor(o.sinal) + '</div>' +
        '<div><small>Tempo de registro já observado (dados reais)</small><b style="font-size:14px">' + refTxt + '</b></div></div>' +
        '<div class="hb-ets">' + et + '</div>' +
        '<p class="hb-nota">Em busca no satélite a placa normalmente não consegue enviar nada até registrar. Ficar sem dados novos aqui é esperado; o painel só fica vermelho após 30 min sem nenhum sinal de vida.</p>' +
        (rej.length ? '<p class="hb-rej"><b>Rejeição reportada pela placa:</b> ' + rej.join(' · ') + '</p>' : '') +
        '<div class="hb-cols"><div class="hb-led"><b>LED na placa</b><ul>' +
        '<li><span class="led l2 rap"></span><b>LED2 piscando rápido</b>: buscando satélite (estado atual)</li>' +
        '<li><span class="led l2 len"></span><b>LED2 piscando devagar</b>: registrado no satélite</li>' +
        '<li><span class="led l4 on"></span><b>LED4 aceso</b>: modo teste satélite; piscada curta = sonda</li>' +
        '<li><span class="led l1 rap"></span><b>LED1 piscando</b>: buscando Cat-M; aceso = registrado no Cat-M</li>' +
        '<li><span class="led all rap"></span><b>Todos piscando</b>: erro</li></ul><small>Fonte: docs/connect-como-funciona.md</small></div>' +
        '<details class="hb-ts" open><summary><b>Troubleshooting</b></summary><ul>' +
        ['Céu aberto, com visada para o norte (satélite geoestacionário)', 'Antena voltada para cima', 'Longe de metal: sem teto metálico nem vidro com película metalizada acima', 'Veículo em movimento pode atrasar; se possível, pare em local aberto', 'Aguardar o registro sem reiniciar a placa (pode levar vários minutos; use a referência acima)', 'SIM Deutsche Telekom ativo com perfil NTN', 'Para iniciar ou repetir: segurar o botão 4 por 3 s', 'Bandas NTN habilitadas no modem (23, 255, 256)'].map(function (x) { return '<li><label><input type="checkbox"> ' + x + '</label></li>'; }).join('') + '</ul></details></div>';
    }
  };
})();
