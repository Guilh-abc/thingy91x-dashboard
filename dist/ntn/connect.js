(function(){
'use strict';
var POS=[-23.5505,-46.6333]; // posição ilustrativa (simulação)
var map=L.map('map',{zoomControl:false}).setView(POS,13);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,attribution:'© OpenStreetMap'}).addTo(map);
var mk=L.circleMarker(POS,{radius:9,color:'#fff',fillColor:'#2f7cf6',fillOpacity:1}).addTo(map).bindTooltip('Veículo (posição simulada)');
var lte=document.getElementById('tLte'),badge=document.getElementById('badge'),log=document.getElementById('log'),msgs=document.getElementById('msgs');
var LIMIT=256,MIN_GAP=30000,lastSat=0;
function sat(){return lte.checked;}
function upd(){badge.textContent=sat()?'via satélite (NTN Skylo)':'via celular (LTE-M)';badge.className='badge '+(sat()?'sat':'cell');mk.setStyle({fillColor:sat()?'#9b4dff':'#2f7cf6'});}
lte.addEventListener('change',function(){upd();central(sat()?'Cobertura celular perdida. Conexão mantida via satélite.':'Cobertura celular restabelecida (LTE-M).');});
function central(t){var li=document.createElement('li');li.textContent=hh()+' Central: '+t;msgs.insertBefore(li,msgs.firstChild);}
function hh(){return new Date().toLocaleTimeString('pt-BR');}
function pos(){return {lat:+(POS[0]+(Math.random()-.5)*.01).toFixed(5),lon:+(POS[1]+(Math.random()-.5)*.01).toFixed(5)};}
var EV={
 panic:{n:'Pânico / assistência',p:function(){return {t:'PANIC',k:'assist'};},r:'Pedido de assistência recebido. Ajuda a caminho.'},
 sup:{n:'Suporte',p:function(){return {t:'SUP',k:'guincho'};},r:'Pedido de suporte recebido. Retornaremos em breve.'},
 crash:{n:'Colisão automática',p:function(){return {t:'CRASH',g:+(4+Math.random()*4).toFixed(1)};},r:'Possível colisão detectada. Central acionada automaticamente.'},
 tamper:{n:'Reboque / violação (12 V cortado)',p:function(){return {t:'TAMPER',v12:0,bkp:1};},r:'Alerta de violação: alimentação cortada. Monitorando posição.'},
 geoOut:{n:'Saída de cerca virtual',p:function(){return {t:'GEO_OUT',r:geoR};},r:'Alerta: veículo saiu da cerca virtual. Monitorando posição.'},
 geoIn:{n:'Reentrada na cerca virtual',p:function(){return {t:'GEO_IN',r:geoR};},r:'Veículo retornou à cerca virtual.'},
 cabin:{n:'Cabine quente',p:function(){return {t:'CABIN',c:+(45+Math.random()*8).toFixed(1),ign:0};},r:'Cabine quente com veículo desligado. Verifique ocupantes.'}
};
function send(k,qq){
 var e=EV[k],o=e.p(),q=qq||pos();o.lat=q.lat;o.lon=q.lon;o.ts=Math.floor(Date.now()/1000);
 var bytes=new TextEncoder().encode(JSON.stringify(o)).length,s=sat(),now=Date.now();
 mk.setLatLng([q.lat,q.lon]);
 var st,cls='ok',lat;
 if(s&&bytes>LIMIT){st='Excede 256 B';cls='err';}
 else if(s&&now-lastSat<MIN_GAP){st='Na fila (intervalo NTN > 30 s)';cls='err';}
 else st='Entregue';
 lat=s?(4+Math.random()*6):(0.3+Math.random()*0.7);
 if(s&&cls==='ok')lastSat=now;
 var tr=document.createElement('tr');
 tr.innerHTML='<td>'+hh()+'</td><td>'+e.n+'</td><td>'+(s?'Satélite NTN':'LTE-M')+'</td><td>'+bytes+' / '+LIMIT+' B</td><td>'+lat.toFixed(1)+' s (simulada)</td><td class="'+cls+'">'+st+'</td>';
 log.insertBefore(tr,log.firstChild);
 if(k==='geoOut'||k==='geoIn')flash(k==='geoOut');
 if(cls==='ok')setTimeout(function(){central(e.r);},Math.min(lat*300,2500));
}
document.querySelectorAll('[data-ev]').forEach(function(b){b.addEventListener('click',function(){var k=b.dataset.ev;if(k==='panic'&&!sat()){lte.checked=true;upd();}send(k);});});
document.getElementById('bPanic').addEventListener('click',function(){send('panic');});
document.getElementById('bSup').addEventListener('click',function(){send('sup');});
var CAT=[
['Pânico e assistência','Botão físico + tela','Evento com posição e tipo de pedido; central confirma na tela','20 a 40 B','Sim'],
['Suporte (guincho, dúvida, retorno)','Tela','Código do pedido + posição; resposta curta da central','20 a 60 B','Sim'],
['Rastreamento e cerca virtual','GNSS','Posição periódica; alerta ao sair da área','15 a 25 B','Sim, intervalo maior que 30 s'],
['Detecção de colisão','Acelerômetro/IMU','Pico de aceleração gera alerta automático com posição','30 a 50 B','Sim'],
['Capotamento','IMU','Orientação anormal persistente gera alerta','20 a 30 B','Sim'],
['Reboque / movimento suspeito','Acelerômetro + GNSS + 12 V','Movimento com ignição desligada (inferida pelo 12 V)','20 a 30 B','Sim'],
['Corte de energia / violação','ADC 12 V + bateria backup + reed switch','Queda do 12 V ou abertura dispara alerta final com posição','15 a 25 B','Sim'],
['Criança/pet em cabine quente','Temp/umidade','Temperatura acima do limiar com ignição desligada','20 a 30 B','Sim'],
['Estilo de condução (chofer, frota)','IMU + GNSS','Frenagens, acelerações e curvas bruscas; resumo diário','30 a 80 B','Sim (resumo); detalhe via LTE-M'],
['Quilometragem e uso por GNSS','GNSS','Distância e horas de uso pela trajetória','20 a 40 B','Sim'],
['Mensagens curtas da central','Tela','Texto curto de status ou orientação','até cerca de 200 B','Sim, no limite; downlink a confirmar']];
document.getElementById('cat').innerHTML=CAT.map(function(r){return '<tr>'+r.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>';}).join('');

// ===== Cerca virtual (simulação) =====
var geoR=800,fence=L.circle(POS,{radius:geoR,color:'#E20074',weight:2,fillOpacity:.08,dashArray:'6 4'}).addTo(map).bindTooltip('Cerca virtual (simulação)');
var rIn=document.getElementById('geoR'),bTrip=document.getElementById('bTrip'),alertBox=document.getElementById('geoAlert'),panelAlert=document.getElementById('geoPanel');
rIn.addEventListener('change',function(){var v=parseInt(rIn.value,10);if(v>=100&&v<=5000){geoR=v;fence.setRadius(v);}});
function beep(){try{var c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();o.frequency.value=880;o.connect(g);g.connect(c.destination);g.gain.value=.15;o.start();o.stop(c.currentTime+.35);}catch(e){}}
function flash(out){var t=out?'⚠ SAÍDA DE CERCA VIRTUAL (simulação)':'✓ Veículo dentro da cerca (simulação)';[alertBox,panelAlert].forEach(function(el){el.textContent=t;el.className='geo-alert '+(out?'out':'in');el.hidden=false;setTimeout(function(){el.hidden=true;},6000);});if(out)beep();}
var timer=null;
function route(){var pts=[],i;for(i=0;i<=30;i++)pts.push([POS[0]+i*0.0006,POS[1]+i*0.0007]);for(i=29;i>=0;i--)pts.push([POS[0]+i*0.0006,POS[1]+i*0.0007+0.0012]);return pts;}
var trail=null;
bTrip.addEventListener('click',function(){
 if(timer){clearInterval(timer);timer=null;bTrip.textContent='Iniciar trajeto';return;}
 var pts=route(),i=0,inside=true;bTrip.textContent='Parar trajeto';
 if(trail)map.removeLayer(trail);trail=L.polyline([],{color:'#ffd54a',weight:3,dashArray:'4 4'}).addTo(map);
 map.fitBounds(L.latLngBounds(pts).pad(.2));
 timer=setInterval(function(){
  if(i>=pts.length){clearInterval(timer);timer=null;bTrip.textContent='Iniciar trajeto';return;}
  var p=pts[i++];mk.setLatLng(p);trail.addLatLng(p);
  var d=map.distance(p,POS),now=d<=geoR;
  if(inside&&!now)send('geoOut',{lat:+p[0].toFixed(5),lon:+p[1].toFixed(5)});
  if(!inside&&now)send('geoIn',{lat:+p[0].toFixed(5),lon:+p[1].toFixed(5)});
  inside=now;
 },700);
});
central('Módulo conectado. Serviços de assistência ativos.');upd();
})();
