const $ = (s) => document.querySelector(s);
// Booking fields come from Telegram users, so everything is escaped before it reaches innerHTML.
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const statusLabels = { new: 'Новая', confirmed: 'Подтверждена', cancelled: 'Отменена' };
let key = sessionStorage.getItem('muse-key') || '',
  bookings = [],
  services = [];
const api = async (path, options = {}) => {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-admin-key': key, ...options.headers },
  });
  if (response.status === 401) throw new Error('unauthorized');
  return response.json();
};
async function login() {
  await api('/api/login', { method: 'POST' });
  sessionStorage.setItem('muse-key', key);
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await load();
}
$('#loginForm').onsubmit = async (e) => {
  e.preventDefault();
  key = $('#key').value;
  try {
    await login();
  } catch {
    $('#loginError').textContent = 'Неверный ключ администратора.';
  }
};
$('#logout').onclick = () => {
  sessionStorage.clear();
  location.reload();
};
$('#today').textContent = new Date().toLocaleDateString('ru-RU', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
async function load() {
  [bookings, services] = await Promise.all([api('/api/bookings'), api('/api/services')]);
  $('#serviceSelect').innerHTML = services
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} · £${esc(s.price)}</option>`)
    .join('');
  render();
}
function render() {
  const filter = $('#filter').value,
    visible = filter === 'all' ? bookings : bookings.filter((x) => x.status === filter);
  $('#newCount').textContent = bookings.filter((x) => x.status === 'new').length;
  $('#allCount').textContent = bookings.length;
  $('#revenue').textContent =
    '£' + bookings.filter((x) => x.status !== 'cancelled').reduce((n, x) => n + Number(x.price || 0), 0);
  $('#empty').style.display = visible.length ? 'none' : 'block';
  $('#rows').innerHTML = visible
    .slice()
    .reverse()
    .map(
      (x) => `<tr>
        <td><b>${esc(x.date)}</b><br>${esc(x.time)}</td>
        <td class="client"><b>${esc(x.name)}</b><small>${esc(x.phone)}</small></td>
        <td>${esc(x.serviceName)}</td>
        <td>£${esc(x.price)}</td>
        <td><span class="badge ${esc(x.status)}">${esc(statusLabels[x.status] || x.status)}</span></td>
        <td class="actions">
          ${x.status === 'new' ? `<button data-id="${esc(x.id)}" data-status="confirmed" title="Подтвердить">✓</button>` : ''}
          ${x.status !== 'cancelled' ? `<button data-id="${esc(x.id)}" data-status="cancelled" title="Отменить">×</button>` : ''}
        </td>
      </tr>`,
    )
    .join('');
  document
    .querySelectorAll('[data-status]')
    .forEach((b) => (b.onclick = () => status(b.dataset.id, b.dataset.status)));
}
async function status(id, value) {
  const updated = await api(`/api/bookings/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: value }),
  });
  bookings = bookings.map((x) => (x.id === id ? updated : x));
  render();
}
$('#filter').onchange = render;
$('#add').onclick = () => $('#bookingDialog').showModal();
$('.close').onclick = () => $('#bookingDialog').close();
$('#bookingForm').onsubmit = async (e) => {
  e.preventDefault();
  const values = Object.fromEntries(new FormData(e.target));
  const service = services.find((s) => s.id === values.serviceId);
  const created = await api('/api/bookings', {
    method: 'POST',
    body: JSON.stringify({
      ...values,
      serviceName: service.name,
      price: service.price,
      status: 'new',
      source: 'web-admin',
    }),
  });
  bookings.push(created);
  render();
  e.target.reset();
  $('#bookingDialog').close();
};
const date = $('input[name=date]');
date.min = new Date().toISOString().slice(0, 10);
date.value = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
if (key) login().catch(() => sessionStorage.clear());
