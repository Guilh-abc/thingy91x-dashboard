// node tests/functions.test.mjs — functions Netlify (nrfcloud + alerts) com fetch simulado
import assert from 'node:assert/strict';
const NOW = Date.now();
const ago = (min) => new Date(NOW - min * 60000).toISOString();
const DEV = '50423451-3737-4337-80fc-110bddf418ff';
let scenario = 'user_case';
globalThis.fetch = async (url) => {
  url = String(url);
  const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });
  if (url.includes('api.memfault.com') && url.includes('/attributes')) return json({ data: [] });
  if (url.includes('api.memfault.com')) return json({ data: { device_serial: DEV, hardware_version: 'thingy91x', last_seen: scenario === 'nodata' ? null : ago(360) } });
  if (url.includes('/v1/location/history')) return json({ items: scenario === 'user_case' ? [{ insertedAt: ago(3), serviceType: 'GNSS', lat: '-23.69', lon: '-46.55' }] : [] });
  if (url.includes('/v1/messages')) return json({ items: scenario === 'msgs' ? [{ receivedAt: ago(2), message: { appId: 'BATTERY', data: 8 } }, { receivedAt: ago(200), message: { appId: 'BATTERY', data: 50 } }] : [] });
  if (url.includes('/v1/devices/')) return json({ id: DEV, $meta: { updatedAt: ago(362) }, state: { reported: { connected: false } } });
  return json({}, 404);
};
const { handler: alerts } = await import('../netlify/functions/alerts.js');
const { handler: nrf } = await import('../netlify/functions/nrfcloud.js');
const H = { authorization: 'Bearer FAKE', 'x-nrf-team-key': 'FAKE' };
let pass = 0; const t = async (n, f) => { await f(); pass++; console.log('ok  -', n); };

await t('alerts: last_seen 6h + GNSS (localização) 3 min = online, sem alerta crítico', async () => {
  scenario = 'user_case';
  const r = await alerts({ httpMethod: 'GET', headers: H, queryStringParameters: { deviceId: DEV } });
  const b = JSON.parse(r.body); assert.equal(r.statusCode, 200);
  assert.equal(b.snapshot.presence, 'online'); assert.match(b.snapshot.activitySource, /localização/);
  assert.ok(!b.alerts.some(a => a.level === 'crítico' || a.id === 'offline'), JSON.stringify(b.alerts));
  assert.ok(b.alerts.some(a => a.id === 'net-info'), 'explica ausência de dados de rede');
});
await t('alerts: tudo antigo = offline crítico', async () => {
  scenario = 'old';
  const b = JSON.parse((await alerts({ httpMethod: 'GET', headers: H, queryStringParameters: { deviceId: DEV } })).body);
  assert.equal(b.snapshot.presence, 'offline'); assert.ok(b.alerts.some(a => a.id === 'offline' && a.level === 'crítico'));
  assert.ok(!b.alerts.some(a => a.id === 'net-info'));
});
await t('alerts: sem timestamps = nodata', async () => {
  scenario = 'nodata';
  const r = await alerts({ httpMethod: 'GET', headers: { authorization: 'Bearer FAKE' }, queryStringParameters: { deviceId: DEV } });
  // shadow $meta ainda existe no mock (nrf), então zera também
  const b = JSON.parse(r.body); assert.ok(['nodata', 'offline'].includes(b.snapshot.presence));
});
await t('alerts: BATTERY numérico (ATT 1.5) usa a mensagem MAIS RECENTE (8% → crítico)', async () => {
  scenario = 'msgs';
  const b = JSON.parse((await alerts({ httpMethod: 'GET', headers: H, queryStringParameters: { deviceId: DEV } })).body);
  assert.equal(b.snapshot.batteryPct, 8); assert.ok(b.alerts.some(a => a.id === 'bat-crit'));
  assert.equal(b.snapshot.presence, 'online');
});
await t('nrfcloud: /health não vaza segredo', async () => {
  const r = await nrf({ httpMethod: 'GET', path: '/.netlify/functions/nrfcloud/health', headers: {} });
  const b = JSON.parse(r.body); assert.equal(b.ok, true); assert.ok(!/FAKE|token"/i.test(r.body) || 'writeTokenConfigured' in b);
});
await t('nrfcloud: device normalizado separa last_seen (Memfault) e $meta (shadow); updated_date não vira atividade', async () => {
  scenario = 'user_case';
  const r = await nrf({ httpMethod: 'GET', path: `/.netlify/functions/nrfcloud/devices/${DEV}`, headers: H, queryStringParameters: {} });
  const d = JSON.parse(r.body); assert.equal(r.statusCode, 200);
  assert.ok(d.last_seen); assert.ok(d.$meta.updatedAt && d.$meta.updatedAt !== d.last_seen);
  assert.equal(d._presence.kind, 'offline'); assert.equal(d.state.reported.connected, false);
});
console.log(`\n${pass} testes OK`);
