import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { availableTimes, services } from './config.js';

const file = resolve('data/bookings.json');
let queue = Promise.resolve();

async function read() {
  try { return JSON.parse(await readFile(file, 'utf8')); }
  catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function write(items) {
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  await writeFile(temp, JSON.stringify(items, null, 2));
  await rename(temp, file);
}

function mutate(action) {
  const result = queue.then(async () => {
    const items = await read();
    const value = await action(items);
    await write(items);
    return value;
  });
  queue = result.catch(() => {});
  return result;
}

const minutes = time => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
const duration = serviceId => services.find(s => s.id === serviceId)?.duration || 0;

// Two bookings clash when their [start, start + service duration) intervals overlap.
export function isSlotFree(items, { date, time, serviceId }) {
  const start = minutes(time), end = start + duration(serviceId);
  return !items.some(x => x.date === date && x.status !== 'cancelled'
    && minutes(x.time) < end && start < minutes(x.time) + duration(x.serviceId));
}

export function freeTimes(items, date, serviceId) {
  return availableTimes.filter(time => isSlotFree(items, { date, time, serviceId }));
}

export class SlotTakenError extends Error {}

export const store = {
  list: read,
  create(input) {
    return mutate(items => {
      if (!isSlotFree(items, input)) throw new SlotTakenError('Slot is already taken');
      const booking = { ...input, id: randomUUID(), status: 'new', createdAt: new Date().toISOString() };
      items.push(booking);
      return booking;
    });
  },
  updateStatus(id, status) {
    if (!['new', 'confirmed', 'cancelled', 'completed'].includes(status)) {
      throw new Error('Unsupported booking status');
    }
    return mutate(items => {
      const booking = items.find(item => item.id === id);
      if (!booking) return null;
      booking.status = status;
      booking.updatedAt = new Date().toISOString();
      return booking;
    });
  }
};

