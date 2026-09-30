// node tests/presence.test.mjs — lógica única de presença (v32)
import assert from 'node:assert/strict';
import '../presence-core.js';
const PC = globalThis.PresenceCore;
const NOW = Date.parse('2026-09-30T11:15:00Z'); // 08:15 BRT
const ago = (min) => new Date(NOW - min * 60000).toISOString();
let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log('ok  -', name); };

// 1. caso real do usuário: last_seen 6h, trilha GNSS da nuvem há 3 min
t('last_seen antigo + location history recente = Online (fonte posição)', () => {
  const p = PC.resolve({ now: NOW, lastSeen: ago(360), shadowMeta: ago(362),
    locations: [{ insertedAt: ago(3), serviceType: 'GNSS' }, { insertedAt: ago(10), serviceType: 'GNSS' }] });
  assert.equal(p.kind, 'online'); assert.equal(p.isOnline, true);
  assert.match(p.activitySource, /localização.*GNSS/); assert.equal(Math.round(p.ageMs / 60000), 3);
  assert.equal(PC.formatSendAge(p), 'último envio há 3 min');
  assert.equal(p.connectedBool, true);
});
t('last_seen antigo + mensagem GNSS recente = Online', () => {
  const p = PC.resolve({ now: NOW, lastSeen: ago(360), messages: [{ receivedAt: ago(4), message: { appId: 'GNSS' } }, { receivedAt: ago(400), message: { appId: 'BATTERY' } }] });
  assert.equal(p.kind, 'online'); assert.match(p.activitySource, /posição \(GNSS\)/);
});
t('mensagem BATTERY (qualquer tipo) recente = Online', () => {
  const p = PC.resolve({ now: NOW, lastSeen: ago(360), messages: [{ receivedAt: ago(2), message: { appId: 'BATTERY' } }] });
  assert.equal(p.kind, 'online'); assert.match(p.activitySource, /BATTERY/);
});
t('tudo antigo = Offline', () => {
  const p = PC.resolve({ now: NOW, lastSeen: ago(360), shadowMeta: ago(361), messages: [{ receivedAt: ago(300), message: { appId: 'TEMP' } }], locations: [{ insertedAt: ago(1500) }] });
  assert.equal(p.kind, 'offline'); assert.equal(p.isOffline, true); assert.equal(p.connectedBool, false);
  assert.equal(Math.round(p.ageMs / 60000), 300);
});
t('sem timestamps = Sem dados', () => {
  const p = PC.resolve({ now: NOW }); assert.equal(p.kind, 'nodata'); assert.equal(p.hasData, false); assert.equal(p.connectedBool, null);
  const q = PC.resolve({ now: NOW, lastSeen: null, messages: [{ message: { appId: 'X' } }], locations: [{}] }); assert.equal(q.kind, 'nodata');
});
t('em espera (15–60 min)', () => {
  assert.equal(PC.resolve({ now: NOW, lastSeen: ago(30) }).kind, 'sleeping');
  assert.equal(PC.resolve({ now: NOW, lastSeen: ago(10) }).kind, 'online');
  assert.equal(PC.resolve({ now: NOW, lastSeen: ago(61) }).kind, 'offline');
});
t('intervalo 10 min alarga a janela online (25 min)', () => {
  assert.equal(PC.resolve({ now: NOW, lastSeen: ago(20), intervalSec: 600 }).kind, 'online');
  assert.equal(PC.resolve({ now: NOW, lastSeen: ago(20) }).kind, 'sleeping');
});
t('connected=true velho (3h) NÃO vence o silêncio; recente vence', () => {
  assert.equal(PC.resolve({ now: NOW, cloudConnected: true, lastSeen: ago(180) }).kind, 'offline');
  assert.equal(PC.resolve({ now: NOW, cloudConnected: true, lastSeen: ago(30) }).kind, 'online');
  assert.equal(PC.resolve({ now: NOW, cloudConnected: true }).kind, 'online');
  assert.equal(PC.resolve({ now: NOW, cloudConnected: false, lastSeen: ago(200) }).kind, 'offline');
});
t('timestamp no futuro distante é ignorado; pequeno skew vira agora', () => {
  assert.equal(PC.resolve({ now: NOW, lastSeen: ago(400), locations: [{ insertedAt: new Date(NOW + 3600e3).toISOString() }] }).kind, 'offline');
  const p = PC.resolve({ now: NOW, locations: [{ insertedAt: new Date(NOW + 60e3).toISOString() }] });
  assert.equal(p.kind, 'online'); assert.equal(p.ageMs, 0);
});
t('segundos unix e ms aceitos', () => {
  assert.equal(PC.toTsMs(1790000000), 1790000000000); assert.equal(PC.toTsMs(1790000000000), 1790000000000);
  assert.equal(PC.toTsMs('lixo'), null);
});
t('ts do dispositivo só é usado se não houver receivedAt', () => {
  assert.equal(PC.msgRecvMs({ receivedAt: ago(2), message: { ts: NOW - 9e9 } }), NOW - 2 * 60000);
  assert.equal(PC.msgRecvMs({ message: { ts: NOW - 60000 } }), NOW - 60000);
});
t('poll/serial/cache não são entradas da API (ignorados)', () => {
  const p = PC.resolve({ now: NOW, lastSeen: ago(360), pollAt: NOW, serialAt: NOW, trailPts: [{ at: ago(1) }], cacheAt: NOW });
  assert.equal(p.kind, 'offline');
});
t('describe lista a fonte', () => {
  const p = PC.resolve({ now: NOW, lastSeen: ago(360), locations: [{ insertedAt: ago(3), serviceType: 'gnss' }] });
  const d = PC.describe(p, (ms) => new Date(ms - 3 * 3600e3).toISOString().slice(11, 19));
  assert.match(d, /Atividade mais recente: histórico de localização na nuvem \(GNSS\)/); assert.match(d, /last_seen/);
});
console.log(`\n${pass} testes OK`);
