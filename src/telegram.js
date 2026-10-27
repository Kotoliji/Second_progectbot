import { availableTimes, config, isAdmin, services } from './config.js';
import { store } from './store.js';

const sessions = new Map();
let offset = 0;

const keyboard = rows => ({ inline_keyboard: rows });
const serviceButtons = () => services.map(s => [{ text: `${s.name} · £${s.price}`, callback_data: `service:${s.id}` }]);
const mainMenu = keyboard([
  [{ text: '✨ Записаться', callback_data: 'book' }],
  [{ text: '💄 Услуги и цены', callback_data: 'services' }, { text: '📅 Мои записи', callback_data: 'mine' }],
  [{ text: '📍 Контакты', callback_data: 'contacts' }]
]);

async function api(method, body = {}) {
  const response = await fetch(`https://api.telegram.org/bot${config.token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.description || `Telegram ${method} failed`);
  return result.result;
}

const send = (chatId, text, reply_markup) => api('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', reply_markup });
const edit = (chatId, messageId, text, reply_markup) => api('editMessageText', { chat_id: chatId, message_id: messageId, text, parse_mode: 'HTML', reply_markup });

function dates() {
  return Array.from({ length: 7 }, (_, i) => {
    const date = new Date(Date.now() + (i + 1) * 86400000);
    return { value: date.toISOString().slice(0, 10), label: date.toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short' }) };
  });
}

async function showAdmin(chatId) {
  const items = await store.list();
  const fresh = items.filter(x => x.status === 'new').length;
  const revenue = items.filter(x => x.status !== 'cancelled').reduce((sum, x) => sum + Number(x.price || 0), 0);
  const rows = [
    [{ text: `🆕 Новые заявки (${fresh})`, callback_data: 'admin:list:new' }],
    [{ text: '📋 Все записи', callback_data: 'admin:list:all' }]
  ];
  if (/^https:\/\//i.test(config.publicUrl)) rows.push([{ text: '🌐 Открыть веб-панель', url: config.publicUrl }]);
  await send(chatId, `<b>MUSE · Админка</b>\n\nНовых заявок: <b>${fresh}</b>\nВсего записей: <b>${items.length}</b>\nПлановая выручка: <b>£${revenue}</b>`, keyboard(rows));
}

async function showAdminList(chatId, filter) {
  const all = await store.list();
  const items = (filter === 'new' ? all.filter(x => x.status === 'new') : all).slice(-8).reverse();
  if (!items.length) return send(chatId, 'Заявок пока нет.', keyboard([[{ text: '← Админка', callback_data: 'admin:home' }]]));
  for (const item of items) {
    await send(chatId, `<b>${item.date} · ${item.time}</b>\n${item.name} · ${item.phone}\n${item.serviceName} · £${item.price}\nСтатус: <b>${item.status}</b>`, keyboard([
      [{ text: '✅ Подтвердить', callback_data: `status:${item.id}:confirmed` }, { text: '❌ Отменить', callback_data: `status:${item.id}:cancelled` }]
    ]));
  }
}

async function handleMessage(message) {
  const chatId = message.chat.id;
  if (message.text === '/admin') {
    if (!isAdmin(message.from)) return send(chatId, 'У вас нет доступа к админке.');
    return showAdmin(chatId);
  }
  if (message.text === '/start') return send(chatId, `<b>MUSE Makeup Studio</b>\n\nПомогу выбрать услугу и свободное время. Запись займёт меньше минуты.`, mainMenu);
  const session = sessions.get(chatId);
  if (session?.step === 'name') {
    session.name = message.text?.trim(); session.step = 'phone';
    return send(chatId, 'Отправьте номер телефона сообщением, например <b>+44 7700 000000</b>.');
  }
  if (session?.step === 'phone') {
    session.phone = message.contact?.phone_number || message.text?.trim();
    const service = services.find(s => s.id === session.serviceId);
    const booking = await store.create({ telegramUserId: String(message.from.id), chatId, name: session.name, phone: session.phone, date: session.date, time: session.time, serviceId: service.id, serviceName: service.name, price: service.price });
    sessions.delete(chatId);
    await send(chatId, `Готово, <b>${booking.name}</b>!\n\n${service.name}\n${booking.date} в ${booking.time}\nСтоимость: £${service.price}\n\nЗаявка отправлена мастеру. После подтверждения вы получите сообщение.`, mainMenu);
    for (const adminId of config.adminIds) await send(adminId, `🆕 <b>Новая заявка</b>\n${booking.name} · ${booking.phone}\n${service.name}\n${booking.date} в ${booking.time}`, keyboard([[{ text: '✅ Подтвердить', callback_data: `status:${booking.id}:confirmed` }]]));
  }
}

async function handleCallback(query) {
  const chatId = query.message.chat.id, messageId = query.message.message_id, data = query.data;
  await api('answerCallbackQuery', { callback_query_id: query.id });
  if (data === 'book') return edit(chatId, messageId, '<b>Выберите услугу</b>', keyboard(serviceButtons()));
  if (data === 'services') return edit(chatId, messageId, `<b>Услуги MUSE</b>\n\n${services.map(s => `${s.name} — <b>£${s.price}</b>`).join('\n')}`, keyboard([[{ text: 'Записаться', callback_data: 'book' }], [{ text: '← Меню', callback_data: 'home' }]]));
  if (data === 'home') return edit(chatId, messageId, '<b>MUSE Makeup Studio</b>\n\nЧем могу помочь?', mainMenu);
  if (data === 'contacts') return edit(chatId, messageId, '<b>Контакты</b>\nLondon · выезд и студия\nInstagram: @muse.makeup\nТелефон: +44 7700 000000', keyboard([[{ text: '← Меню', callback_data: 'home' }]]));
  if (data === 'mine') {
    const items = (await store.list()).filter(x => x.telegramUserId === String(query.from.id));
    const text = items.length ? items.slice(-5).map(x => `${x.date} ${x.time} · ${x.serviceName}\nСтатус: <b>${x.status}</b>`).join('\n\n') : 'У вас пока нет записей.';
    return edit(chatId, messageId, `<b>Мои записи</b>\n\n${text}`, keyboard([[{ text: '← Меню', callback_data: 'home' }]]));
  }
  if (data.startsWith('service:')) {
    sessions.set(chatId, { serviceId: data.split(':')[1], step: 'date' });
    return edit(chatId, messageId, '<b>Выберите дату</b>', keyboard(dates().map(d => [{ text: d.label, callback_data: `date:${d.value}` }])));
  }
  if (data.startsWith('date:')) {
    const session = sessions.get(chatId); if (!session) return send(chatId, 'Начните запись заново: /start');
    session.date = data.slice(5); session.step = 'time';
    const busy = (await store.list()).filter(x => x.date === session.date && !['cancelled'].includes(x.status)).map(x => x.time);
    const free = availableTimes.filter(t => !busy.includes(t));
    return edit(chatId, messageId, '<b>Выберите свободное время</b>', keyboard(free.map(t => [{ text: t, callback_data: `time:${t}` }])));
  }
  if (data.startsWith('time:')) {
    const session = sessions.get(chatId); if (!session) return send(chatId, 'Начните запись заново: /start');
    session.time = data.slice(5); session.step = 'name';
    return edit(chatId, messageId, '<b>Как вас зовут?</b>\n\nНапишите имя одним сообщением.');
  }
  // callback_data is client-controlled, so every admin action checks the sender.
  if ((data.startsWith('admin:') || data.startsWith('status:')) && !isAdmin(query.from)) return;
  if (data === 'admin:home') return showAdmin(chatId);
  if (data.startsWith('admin:list:')) return showAdminList(chatId, data.split(':')[2]);
  if (data.startsWith('status:')) {
    const [, id, status] = data.split(':');
    const booking = await store.updateStatus(id, status);
    if (!booking) return send(chatId, 'Запись не найдена.');
    await edit(chatId, messageId, `${status === 'confirmed' ? '✅' : '❌'} <b>${booking.name}</b>\n${booking.date} в ${booking.time}\nСтатус: <b>${status}</b>`);
    if (booking.chatId) await send(booking.chatId, status === 'confirmed' ? `✅ Запись на ${booking.date} в ${booking.time} подтверждена.` : `Запись на ${booking.date} в ${booking.time} отменена. Свяжитесь с мастером, если нужно подобрать другое время.`, mainMenu);
  }
}

export async function startTelegram() {
  if (!config.token) { console.log('BOT_TOKEN не задан — Telegram polling отключён, веб-панель работает.'); return; }
  await api('setMyCommands', { commands: [{ command: 'start', description: 'Открыть меню' }, { command: 'admin', description: 'Панель администратора' }] });
  console.log('Telegram-бот запущен.');
  while (true) {
    try {
      const updates = await api('getUpdates', { offset, timeout: 25, allowed_updates: ['message', 'callback_query'] });
      for (const update of updates) {
        offset = update.update_id + 1;
        if (update.message) await handleMessage(update.message);
        if (update.callback_query) await handleCallback(update.callback_query);
      }
    } catch (error) { console.error('Telegram:', error.message); await new Promise(r => setTimeout(r, 2000)); }
  }
}

