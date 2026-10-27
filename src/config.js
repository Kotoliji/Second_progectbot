export const config = {
  token: process.env.BOT_TOKEN || '',
  adminIds: new Set((process.env.ADMIN_IDS || '').split(',').map(x => x.trim()).filter(Boolean)),
  // No default: without ADMIN_KEY the web API stays locked.
  adminKey: process.env.ADMIN_KEY || '',
  timeZone: process.env.TZ_NAME || 'Europe/London',
  port: Number(process.env.PORT || 3000),
  publicUrl: process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 3000}`
};

export function isAdmin(user) {
  return config.adminIds.has(String(user?.id || ''));
}

export const services = [
  { id: 'event', name: 'Макияж для события', duration: 90, price: 85 },
  { id: 'shoot', name: 'Макияж для съёмки', duration: 120, price: 120 },
  { id: 'bride', name: 'Свадебный образ', duration: 180, price: 240 },
  { id: 'lesson', name: 'Урок макияжа', duration: 120, price: 110 }
];

// YYYY-MM-DD in the studio's time zone, not UTC.
export const localDate = (date = new Date()) => date.toLocaleDateString('en-CA', { timeZone: config.timeZone });

export const availableTimes = ['10:00', '12:30', '15:00', '17:30'];
