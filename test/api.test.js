import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'muse-api-'));
process.env.DATA_FILE = join(dir, 'bookings.json');
process.env.ADMIN_KEY = 'test-key';
const { server } = await import('../src/http.js');

await new Promise(resolve => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;
test.after(async () => {
  server.close();
  await rm(dir, { recursive: true, force: true });
});

const request = (path, { key = 'test-key', ...options } = {}) =>
  fetch(base + path, { ...options, headers: { 'content-type': 'application/json', 'x-admin-key': key } });
const post = (body, key) => request('/api/bookings', { method: 'POST', body: JSON.stringify(body), key });
const valid = { name: 'Anna', phone: '+44 7700 900000', date: '2030-03-01', time: '10:00', serviceId: 'shoot' };

test('booking endpoints require the admin key', async () => {
  assert.equal((await request('/api/bookings', { key: 'wrong' })).status, 401);
  assert.equal((await post(valid, '')).status, 401);
  assert.equal((await request('/api/login', { method: 'POST', key: 'wrong' })).status, 401);
  assert.equal((await request('/api/login', { method: 'POST' })).status, 200);
});

test('POST takes price and status from the server, not the client', async () => {
  const res = await post({ ...valid, price: 1, status: 'confirmed', id: 'forged', serviceName: 'Free' });
  assert.equal(res.status, 201);
  const created = await res.json();
  assert.equal(created.price, 120);
  assert.equal(created.serviceName, 'Макияж для съёмки');
  assert.equal(created.status, 'new');
  assert.notEqual(created.id, 'forged');
});

test('POST validates required fields and service id', async () => {
  assert.equal((await post({ ...valid, name: '' })).status, 400);
  assert.equal((await post({ ...valid, serviceId: 'unknown' })).status, 400);
  assert.equal((await post({ ...valid, date: 'tomorrow' })).status, 400);
  assert.equal((await request('/api/bookings', { method: 'POST', body: '{broken' })).status, 400);
});

test('a taken slot returns 409', async () => {
  const slot = { ...valid, date: '2030-03-02' };
  assert.equal((await post(slot)).status, 201);
  const res = await post(slot);
  assert.equal(res.status, 409);
  assert.deepEqual(await res.json(), { error: 'slot_taken' });
});

test('PATCH updates status and rejects unknown statuses', async () => {
  const created = await (await post({ ...valid, date: '2030-03-03' })).json();
  const patch = status => request(`/api/bookings/${created.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  assert.equal((await (await patch('confirmed')).json()).status, 'confirmed');
  assert.equal((await patch('hacked')).status, 400);
  assert.equal((await request('/api/bookings/missing', { method: 'PATCH', body: '{"status":"confirmed"}' })).status, 404);
});

test('static files are served and path traversal is blocked', async () => {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(index.headers.get('content-type'), /text\/html/);
  assert.notEqual((await fetch(`${base}/..%2fpackage.json`)).status, 200);
  assert.notEqual((await fetch(`${base}/%2e%2e/src/config.js`)).status, 200);
});

test('health reports the Telegram bot as offline without a token', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true, telegram: false });
});
