export const config = {
  token: process.env.BOT_TOKEN || '',
  adminIds: new Set((process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean)),
  adminUsernames: new Set((process.env.ADMIN_USERNAMES || '').split(',').map(x => x.trim().replace(/^@/, '').toLowerCase()).filter(Boolean)),
  adminKey: process.env.ADMIN_KEY || 'muse-demo',
  port: Number(process.env.PORT || 3000),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
};

export function isAdmin(user) {
  const idMatch = config.adminIds.has(String(user?.id || ''));
  const usernameMatch = user?.username && config.adminUsernames.has(user.username.toLowerCase());
  return Boolean(idMatch || usernameMatch);
}

export const services = [
  { id: 'event', name: 'Макияж для события', duration: 90, price: 85 },
  { id: 'shoot', name: 'Макияж для съёмки', duration: 120, price: 120 },
  { id: 'bride', name: 'Свадебный образ', duration: 180, price: 240 },
  { id: 'lesson', name: 'Урок макияжа', duration: 120, price: 110 }
];

export const availableTimes = ['10:00', '12:30', '15:00', '17:30'];

