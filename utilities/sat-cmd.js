/* sat-cmd.js (v72): botão "Migrar para satélite", confirmação e linha do tempo do comando.
   Backend: GET/POST <API>?cmd=1 (sessão do Pages; só admin cria/cancela). Etapas após "recebido" vêm dos dados já existentes
   (eventos sat_*, STATE da placa, telemetria de satélite) com horário de recebimento (rx) depois do recebido. */
(function (root) {
  'use strict';
  var ETAPAS = [['pendente', 'Pendente'], ['entregue', 'Entregue à placa'], ['recebido', 'Recebido pela placa'], ['busca', 'Buscando satélite'], ['sinal', 'Sinal medido'], ['reg', 'Registrado']];
  var RX = function (r) { return Date.parse(r.rx || r.ts) || 0; };
  /** Puro (testável): índice da etapa atual e horários. recs = registros do medidor + locais. */
  function etapas(c, recs, now) {
    if (!c) return null;
    now = now == null ? Date.now() : now;
    var st = c.status === 'pendente' && now > Date.parse(c.expira) ? 'expirado' : c.status, t = { pendente: Date.parse(c.criado) };
    if (c.entregueEm) t.entregue = Date.parse(c.entregueEm);
    if (c.recebidoEm) t.recebido = Date.parse(c.recebidoEm);
    if (c.recusadoEm) t.recusado = Date.parse(c.recusadoEm);
    if (st === 'expirado' || st === 'cancelado' || st === 'recusado') return { fim: st, idx: st === 'recusado' ? 1 : c.entregueEm ? 1 : 0, t: t, status: st };
    var idx = st === 'recebido' ? 2 : st === 'entregue' ? 1 : 0;
    if (t.recebido) (recs || []).filter(function (r) { return RX(r) > t.recebido; }).sort(function (a, b) { return RX(a) - RX(b); }).forEach(function (r) {
      var e = String(r.estado || r.state || '').toUpperCase(), ev = r.event, sat = r.net === 'ntn' || r.plmn === '90198' || r.type === 'satsum' || r.type === 'satdet' || /^sat_/.test(ev || '');
      if (!t.busca && (e === 'BUSCA' || e === 'SINCRONIA' || ev === 'sat_start' || ev === 'sat_search')) t.busca = RX(r);
      if (!t.sinal && r.rsrp != null && (r.type === 'local' || sat)) t.sinal = RX(r);
      if (!t.sinal && r.rsrpAvg != null) t.sinal = RX(r);
      if (!t.reg && (e === 'REGISTRADO' || e === 'ENVIO' || (ev === 'sat_reg' && !r.fakeNtn) || (r.type === 'telemetry' && r.net === 'ntn'))) t.reg = RX(r);
    });
    if (t.reg) { t.busca = t.busca || t.reg; t.sinal = t.sinal || null; idx = 5; } else if (t.sinal) { t.busca = t.busca || t.sinal; idx = 4; } else if (t.busca) idx = 3;
    return { fim: null, idx: idx, t: t, status: st };
  }
  var api = { etapas: etapas, ETAPAS: ETAPAS };
  if (typeof document === 'undefined') { root.SatCmdU = api; return; }

  var el, cmd = null, recs0 = [], msg = '', ocupado = false, url = function () { return (root.ApiCore ? root.ApiCore.API : '/.netlify/functions/ntn-lab') + '?cmd=1'; };
  var hm = function (ms) { return new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  var esc = function (x) { return String(x == null ? '' : x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  async function chama(metodo, corpo) {
    var r = await fetch(url() + '&t=' + Date.now(), { method: metodo, cache: 'no-store', headers: corpo ? { 'Content-Type': 'application/json' } : {}, body: corpo ? JSON.stringify(corpo) : undefined });
    var j = {}; try { j = await r.json(); } catch (e) {}
    return { st: r.status, j: j };
  }
  async function consulta() {
    try { var x = await chama('GET'); if (x.st === 200) { cmd = x.j.cmd || null; msg = ''; } else msg = x.st === 401 ? 'Entre na plataforma para usar comandos.' : 'Comandos indisponíveis agora (' + x.st + ').'; }
    catch (e) { msg = 'Sem conexão com o serviço de comandos.'; }
    desenha();
  }
  async function acao(corpo) {
    ocupado = true; desenha();
    try { var x = await chama('POST', corpo); if (x.j && x.j.cmd) cmd = x.j.cmd; msg = x.st < 300 ? '' : x.st === 403 ? 'Só administradores podem enviar comandos.' : (x.j && x.j.error) || ('Erro ' + x.st); }
    catch (e) { msg = 'Sem conexão. Tente de novo.'; }
    ocupado = false; desenha();
  }
  function dialogo() {
    var d = document.getElementById('scDlg');
    if (!d) {
      d = document.createElement('dialog'); d.id = 'scDlg'; d.className = 'sc-dlg'; d.setAttribute('aria-labelledby', 'scDlgT'); d.setAttribute('aria-describedby', 'scDlgD');
      d.innerHTML = '<h2 id="scDlgT">Migrar para satélite?</h2><p id="scDlgD">A placa recebe o comando no próximo envio pelo Cat-M e começa a buscar o satélite Skylo. A busca pode levar vários minutos e, enquanto isso, a placa pode não enviar dados. Se a placa não pegar o comando em 10 minutos, ele expira.</p><div class="sc-acoes"><button type="button" class="btn" value="nao">Voltar</button><button type="button" class="btn primary" value="sim">Migrar para satélite</button></div>';
      document.body.appendChild(d);
      d.querySelectorAll('button').forEach(function (b) { b.onclick = function () { d.close(b.value); }; });
    }
    d.onclose = function () { if (d.returnValue === 'sim') acao({ acao: 'criar', cmd: 'sat' }); var b = document.getElementById('scBtn'); if (b) b.focus(); };
    d.returnValue = ''; d.showModal(); d.querySelector('button[value="nao"]').focus();
  }
  function desenha() {
    if (!el) return;
    var e = etapas(cmd, recs0), ativo = e && !e.fim && e.idx < 5, h = '<div class="sc-topo"><div><h2 class="sc-tit">Comando de rede</h2><p class="sc-mut">Pede à placa para sair do Cat-M e testar o satélite.</p></div>';
    h += ativo ? (e.status === 'pendente' ? '<button type="button" class="btn" id="scCancel"' + (ocupado ? ' disabled' : '') + '>Cancelar comando</button>' : '')
      : '<button type="button" class="btn primary" id="scBtn"' + (ocupado ? ' disabled aria-busy="true"' : '') + '>' + (ocupado ? 'Enviando…' : 'Migrar para satélite') + '</button>';
    h += '</div>';
    if (e) {
      h += '<ol class="sc-linha" aria-label="Andamento do comando">' + ETAPAS.map(function (s, i) {
        var feito = i <= e.idx && !(e.fim && i > e.idx), atual = i === e.idx && !e.fim, tm = e.t[s[0]];
        return '<li class="' + (feito ? 'ok' : '') + (atual ? ' atual' : '') + '"' + (atual ? ' aria-current="step"' : '') + '><span>' + s[1] + '</span>' + (tm && feito ? '<small>' + hm(tm) + '</small>' : '') + '</li>';
      }).join('') + '</ol>';
      if (e.fim) h += '<p class="sc-fim" role="status">' + (e.fim === 'recusado' ? 'Recusado' + (e.t.recusado ? ' às ' + hm(e.t.recusado) : '') + ': placa recusou: já em teste, fora do Cat-M ou ocupada. O comando não será repetido.' : e.fim === 'expirado' ? 'Expirado: a placa não pegou o comando em 10 minutos. Ela continua no Cat-M.' : 'Cancelado' + (cmd.canceladoPor ? ' por ' + esc(cmd.canceladoPor) : '') + '. A placa continua no Cat-M.') + '</p>';
      else if (e.status === 'pendente') h += '<p class="sc-mut" role="status">Aguardando o próximo envio da placa pelo Cat-M. Expira às ' + hm(Date.parse(cmd.expira)) + '.</p>';
    }
    if (msg) h += '<p class="sc-erro" role="alert">' + esc(msg) + '</p>';
    el.innerHTML = h; el.hidden = false;
    var b = document.getElementById('scBtn'); if (b) b.onclick = dialogo;
    var c = document.getElementById('scCancel'); if (c) c.onclick = function () { acao({ acao: 'cancelar', cid: cmd.cid }); };
  }
  api.monta = function (alvo) { el = alvo; consulta(); };
  api.atualiza = function (recs) { recs0 = recs || []; consulta(); };
  api.ativo = function () { var e = etapas(cmd, recs0); return !!(e && !e.fim && e.idx < 5); };
  root.SatCmdU = api;
})(typeof window !== 'undefined' ? window : globalThis);
