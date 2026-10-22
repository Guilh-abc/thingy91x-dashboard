/* v47: status real do rastreador nesta página (somente leitura do mesmo endpoint do NTN Pro). */
(function () {
  'use strict';
  var onNetlify = /(netlify\.app|pages\.dev)$/.test(location.hostname);
  var API = (onNetlify ? '' : 'https://thingy91x-x-dashboard.netlify.app') + '/.netlify/functions/ntn-lab?pro=1&days=2';
  var recs = [];
  function draw() { if (window.drawHero) window.drawHero(recs, Date.now(), 'live'); if (window.drawTrajeto) try { window.drawTrajeto(recs, Date.now(), null); } catch (e) {} if (window.drawInsights) try { window.drawInsights(recs, Date.now(), 'live', null); } catch (e) {} }
  function load() { fetch(API + '&t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) { if (j && Array.isArray(j.records)) recs = j.records; draw(); }).catch(function () { draw(); }); }
  load(); setInterval(load, 15000); setInterval(draw, 5000);
})();
