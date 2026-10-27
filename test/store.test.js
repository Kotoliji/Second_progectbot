import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = await mkdtemp(join(tmpdir(), 'muse-store-'));
process.env.DATA_FILE = join(dir, 'bookings.json');
const { store, freeTimes, isSlotFree, SlotTakenError } = await import('../src/store.js');

test.after(() => rm(dir, { recursive: true, force: true }));

const booking = (overrides = {}) => ({ name: 'Anna', phone: '+44 7700 900000', date: '2030-01-10', time: '10:00', serviceId: 'event', ...overrides });

test('create assigns id, status and timestamp that input cannot override', async () => {
  const created = await store.create({ ...booking({ date: '2030-01-01' }), id: 'forged', status: 'confirmed' });
  assert.notEqual(created.id, 'forged');
  assert.equal(created.status, 'new');
  assert.ok(Date.parse(created.createdAt));
  assert.deepEqual((await store.list()).find(x => x.id === created.id), created);
});

test('updateStatus changes status and rejects unknown values', async () => {
  const created = await store.create(booking({ date: '2030-01-02' }));
  const updated = await store.updateStatus(created.id, 'confirmed');
  assert.equal(updated.status, 'confirmed');
  assert.ok(updated.updatedAt);
  assert.equal(await store.updateStatus('missing', 'confirmed'), null);
  assert.throws(() => store.updateStatus(created.id, 'hacked'), /Unsupported booking status/);
});

test('overlapping bookings are rejected using service duration', async () => {
  await store.create(booking({ date: '2030-01-03', time: '10:00', serviceId: 'bride' })); // 10:00–13:00
  await assert.rejects(store.create(booking({ date: '2030-01-03', time: '12:30' })), SlotTakenError);
  const after = await store.create(booking({ date: '2030-01-03', time: '15:00' }));
  assert.equal(after.time, '15:00');
});

test('cancelled bookings free their slot', async () => {
  const created = await store.create(booking({ date: '2030-01-04' }));
  await store.updateStatus(created.id, 'cancelled');
  await store.create(booking({ date: '2030-01-04' }));
});

test('concurrent creates for the same slot keep only one booking', async () => {
  const results = await Promise.allSettled([1, 2, 3].map(() => store.create(booking({ date: '2030-01-05' }))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal((await store.list()).filter(x => x.date === '2030-01-05').length, 1);
});

test('freeTimes respects the duration of the requested service', () => {
  const items = [{ date: '2030-02-01', time: '12:30', serviceId: 'event', status: 'new' }]; // 12:30–14:00
  assert.deepEqual(freeTimes(items, '2030-02-01', 'event'), ['10:00', '15:00', '17:30']);
  // A 3-hour bride slot at 10:00 would run into the 12:30 booking.
  assert.deepEqual(freeTimes(items, '2030-02-01', 'bride'), ['15:00', '17:30']);
  assert.ok(isSlotFree(items, { date: '2030-02-02', time: '12:30', serviceId: 'event' }));
});
