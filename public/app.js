const $ = (s) => document.querySelector(s);
// Booking fields come from Telegram users, so everything is escaped before it reaches innerHTML.
const esc = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const statusLabels = { new: 'Новая', confirmed: 'Подтверждена', completed: 'Завершена', cancelled: 'Отменена' };
const localDate = (date) => date.toLocaleDateString('en-CA');

let key = sessionStorage.getItem('muse-key') || '';
let bookings = [];
let services = [];

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { 'content-type': 'application/json', 'x-admin-key': key, ...options.headers },
  });
  if (response.status === 401) throw new Error('unauthorized');
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'request_failed');
  return body;
}

async function login() {
  await api('/api/login', { method: 'POST' });
  sessionStorage.setItem('muse-key', key);
  $('#login').classList.add('hidden');
  $('#app').classList.remove('hidden');
  await load();
}

async function load() {
  let times;
  [bookings, services, times] = await Promise.all([api('/api/bookings'), api('/api/services'), api('/api/times')]);
  $('#serviceSelect').innerHTML = services
    .map((s) => `<option value="${esc(s.id)}">${esc(s.name)} · £${esc(s.price)}</option>`)
    .join('');
  $('#timeSelect').innerHTML = times.map((t) => `<option>${esc(t)}</option>`).join('');
  render();
  refreshBotStatus();
}

async function refreshBotStatus() {
  const { telegram } = await api('/api/health').catch(() => ({ telegram: false }));
  $('#botStatus').textContent = telegram ? '● Online' : '● Offline';
  $('#botStatus').classList.toggle('offline', !telegram);
}

function render() {
  const filter = $('#filter').value;
  const visible = filter === 'all' ? bookings : bookings.filter((x) => x.status === filter);
  const revenue = bookings.filter((x) => x.status !== 'cancelled').reduce((n, x) => n + Number(x.price || 0), 0);
  $('#newCount').textContent = bookings.filter((x) => x.status === 'new').length;
  $('#allCount').textContent = bookings.length;
  $('#revenue').textContent = '£' + revenue;
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
          ${x.status === 'confirmed' ? `<button data-id="${esc(x.id)}" data-status="completed" title="Завершить">★</button>` : ''}
          ${['new', 'confirmed'].includes(x.status) ? `<button data-id="${esc(x.id)}" data-status="cancelled" title="Отменить">×</button>` : ''}
        </td>
      </tr>`,
    )
    .join('');
  document.querySelectorAll('[data-status]').forEach((b) => (b.onclick = () => setStatus(b.dataset.id, b.dataset.status)));
}

async function setStatus(id, status) {
  const updated = await api(`/api/bookings/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  bookings = bookings.map((x) => (x.id === id ? updated : x));
  render();
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

$('#filter').onchange = render;
$('#add').onclick = () => $('#bookingDialog').showModal();
$('.close').onclick = () => $('#bookingDialog').close();

$('#bookingForm').onsubmit = async (e) => {
  e.preventDefault();
  $('#bookingError').textContent = '';
  try {
    const created = await api('/api/bookings', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(e.target))),
    });
    bookings.push(created);
    render();
    e.target.reset();
    $('#bookingDialog').close();
  } catch (error) {
    $('#bookingError').textContent =
      error.message === 'slot_taken' ? 'Это время уже занято.' : 'Не удалось создать запись.';
  }
};

$('#today').textContent = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const dateInput = $('input[name=date]');
dateInput.min = localDate(new Date());
dateInput.value = localDate(new Date(Date.now() + 86400000));

if (key) login().catch(() => sessionStorage.clear());
