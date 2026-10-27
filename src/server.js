import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { config, services } from './config.js';
import { store } from './store.js';
import { startTelegram } from './telegram.js';

const publicDir = join(process.cwd(), 'public');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
const json = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const authorized = req => req.headers['x-admin-key'] === config.adminKey;

async function body(req) {
  const chunks = []; for await (const chunk of req) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname === '/api/health') return json(res, 200, { ok: true, telegram: Boolean(config.token) });
    if (url.pathname === '/api/login' && req.method === 'POST') return json(res, authorized(req) ? 200 : 401, { ok: authorized(req) });
    if (url.pathname === '/api/services') return json(res, 200, services);
    if (url.pathname === '/api/bookings') {
      if (!authorized(req)) return json(res, 401, { error: 'unauthorized' });
      if (req.method === 'GET') return json(res, 200, await store.list());
      if (req.method === 'POST') return json(res, 201, await store.create(await body(req)));
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
    if (error.code === 'ENOENT') return json(res, 404, { error: 'not_found' });
    if (error instanceof SyntaxError || error.message === 'Unsupported booking status') return json(res, 400, { error: 'bad_request' });
    console.error(error); json(res, 500, { error: 'server_error' });
  }
});

server.listen(config.port, () => console.log(`Веб-панель: http://localhost:${config.port}`));
startTelegram().catch(error => { console.error(error); process.exitCode = 1; });

