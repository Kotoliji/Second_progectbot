import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

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

export const store = {
  list: read,
  create(input) {
    return mutate(items => {
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

