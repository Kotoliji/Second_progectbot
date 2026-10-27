import { config } from './config.js';
import { server } from './http.js';
import { startTelegram } from './telegram.js';

server.listen(config.port, () => console.log(`Веб-панель: http://localhost:${config.port}`));
if (!config.adminKey) console.warn('ADMIN_KEY не задан — API веб-панели закрыт.');
startTelegram().catch(error => { console.error(error); process.exitCode = 1; });
