import { createHash, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { availableTimes, config, services } from './config.js';
import { SlotTakenError, store } from './store.js';
import { startTelegram, telegramOnline } from './telegram.js';

const publicDir = join(process.cwd(), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const digest = value => createHash('sha256').update(String(value)).digest();
const authorized = req => Boolean(config.adminKey) && timingSafeEqual(digest(req.headers['x-admin-key'] || ''), digest(config.adminKey));

// Only these fields come from the client; price and service name are taken from the catalogue.
function bookingInput(raw) {
  const service = services.find(s => s.id === raw.serviceId);
  const text = value => String(value ?? '').trim().slice(0, 100);
  const input = { name: text(raw.name), phone: text(raw.phone), date: text(raw.date), time: text(raw.time) };
  if (!service || !input.name || !input.phone || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^\d{2}:\d{2}$/.test(input.time)) return null;
  return { ...input, serviceId: service.id, serviceName: service.name, price: service.price, source: 'web-admin' };
}

async function body(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) { size += chunk.length; if (size > 10_000) throw new SyntaxError('Body too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, telegram: telegramOnline() });
    if (url.pathname === '/api/login' && req.method === 'POST') return json(res, authorized(req) ? 200 : 401, { ok: authorized(req) });
    if (url.pathname === '/api/services') return json(res, 200, services);
    if (url.pathname === '/api/times') return json(res, 200, availableTimes);
    if (url.pathname === '/api/bookings') {
      if (!authorized(req)) return json(res, 401, { error: 'unauthorized' });
      if (req.method === 'GET') return json(res, 200, await store.list());
      if (req.method === 'POST') {
        const input = bookingInput(await body(req));
        return input ? json(res, 201, await store.create(input)) : json(res, 400, { error: 'bad_request' });
      }
    }
    if (url.pathname.startsWith('/api/bookings/') && req.method === 'PATCH') {
      if (!authorized(req)) return json(res, 401, { error: 'unauthorized' });
      const updated = await store.updateStatus(url.pathname.split('/')[3], (await body(req)).status);
      return json(res, updated ? 200 : 404, updated || { error: 'not_found' });
    }
    const requested = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
    const path = normalize(join(publicDir, requested));
    if (!path.startsWith(publicDir)) return json(res, 403, { error: 'forbidden' });
    const content = await readFile(path);
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' }); res.end(content);
  } catch (error) {
    if (error instanceof SlotTakenError) return json(res, 409, { error: 'slot_taken' });
    if (error.code === 'ENOENT') return json(res, 404, { error: 'not_found' });
    if (error instanceof SyntaxError || error.message === 'Unsupported booking status') return json(res, 400, { error: 'bad_request' });
    console.error(error); json(res, 500, { error: 'server_error' });
  }
});

server.listen(config.port, () => console.log(`Веб-панель: http://localhost:${config.port}`));
if (!config.adminKey) console.warn('ADMIN_KEY не задан — API веб-панели закрыт.');
startTelegram().catch(error => { console.error(error); process.exitCode = 1; });

