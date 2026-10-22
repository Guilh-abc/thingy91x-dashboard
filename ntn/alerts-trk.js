/* alerts-trk.js: inteligência do Rastreador (ntn/). Liga movement-rules.js ao painel compartilhado
   (utilities/alerts-panel.js) com a chave de histórico e o nome de CSV do Rastreador. */
(function () {
  'use strict';
  if (!window.AlertRules || !window.MovementRules || !window.AlertsPanel) return;
  var engine = window.MovementRules.create(window.AlertRules, {
    // só posições medidas (GNSS ou célula); "salva" repete a última posição e não indica movimento
    accept: function (r) { return r.type === 'telemetry' && r.posSrc !== 'salva'; }
  });
  window.TrackerAlerts = {
    engine: engine,
    render: function (records) {
      window.AlertsPanel.configure({ engine: engine, labels: { distM: 'Distância entre posições', speedKmh: 'Velocidade', stoppedMin: 'Tempo parado', posicoes: 'Posições' },
        storageKey: 'ntn.alertHistory', csvPrefix: 'rastreador-alertas', defaultMetric: 'speedKmh', unitWord: 'posição', emptyText: 'Ainda não há posições suficientes da placa do rastreador para calcular médias.',
        rulesHelp: 'Regras: A distância ou velocidade mais de 20% acima da média; B mais de 30% abaixo (possível falha de GPS ou equipamento desligado); C 5 leituras seguidas com desvio acima de 20%; D entre 22h e 6h, deslocamento acima de 1,5x a média noturna; E sem posição nova há mais de 2x o intervalo esperado.' });
      window.AlertsPanel.mount('intelCard');
      return window.AlertsPanel.render(records);
    }
  };
})();
