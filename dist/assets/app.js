import { mountHeroPower } from './hero-power.js';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const storageKey = 'catz-visit-plan-v1';
const money = value => new Intl.NumberFormat('ru-RU').format(value) + ' ₽';
mountHeroPower($('#hero'), $('#power-control'));

const menuButton = $('#menu-button');
const navigation = $('#navigation');
function closeMenu() { navigation.classList.remove('is-open'); menuButton.setAttribute('aria-expanded', 'false'); menuButton.setAttribute('aria-label', 'Открыть меню'); }
menuButton.addEventListener('click', () => {
  const open = !navigation.classList.contains('is-open');
  navigation.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Закрыть меню' : 'Открыть меню');
});
$$('a', navigation).forEach(link => link.addEventListener('click', closeMenu));
document.addEventListener('click', event => { if (!$('#header').contains(event.target)) closeMenu(); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
matchMedia('(min-width:981px)').addEventListener('change', event => { if (event.matches) closeMenu(); });

const dialogs = $$('dialog');
function syncDialogState() { document.body.classList.toggle('dialog-open', dialogs.some(d => d.open)); }
function showDialog(dialog) { closeMenu(); if (!dialog.open) dialog.showModal(); syncDialogState(); }
dialogs.forEach(dialog => {
  dialog.addEventListener('close', syncDialogState);
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
});
$$('[data-close]').forEach(button => button.addEventListener('click', () => $('#' + button.dataset.close).close()));

// Source prices and capacities are kept in the rendered tariff cards.
const zones = new Map($$('.tariff').map(card => [card.dataset.id, {
  id: card.dataset.id, name: card.dataset.name, price: Number(card.dataset.price),
  type: card.dataset.type, max: Number(card.dataset.max)
}]));
const planner = $('#planner');
const form = $('#plan-form');
const savedState = $('#saved-state');
const zoneField = $('#plan-zone');
const dateField = $('#plan-date');
const timeField = $('#plan-time');
const hoursField = $('#plan-hours');
const countField = $('#plan-count');
const errorField = $('#plan-error');
const allowedHours = [1, 2, 3, 4, 5, 6, 8, 12];
const dateString = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
function setDateBounds() { dateField.min = dateString(new Date()); }
function defaultTime() {
  const date = new Date(Date.now() + 60 * 60 * 1000);
  date.setMinutes(Math.ceil(date.getMinutes() / 30) * 30, 0, 0);
  dateField.value = dateString(date);
  timeField.value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}
function updateCount(preferred = Number(countField.value) || 1) {
  const zone = zones.get(zoneField.value);
  $('#count-label').textContent = zone.type === 'pc' ? 'Количество мест' : 'Количество гостей';
  countField.replaceChildren(...Array.from({ length: zone.max }, (_, index) => {
    const option = document.createElement('option'); option.value = index + 1;
    option.textContent = `${index + 1} ${zone.type === 'pc' ? plural(index + 1, ['место', 'места', 'мест']) : plural(index + 1, ['человек', 'человека', 'человек'])}`;
    return option;
  }));
  countField.value = Math.min(Math.max(preferred, 1), zone.max);
  updateTotal();
}
function plural(number, forms) { const mod = number % 100; return forms[mod > 10 && mod < 20 ? 2 : number % 10 === 1 ? 0 : number % 10 >= 2 && number % 10 <= 4 ? 1 : 2]; }
function calculate(zone, hours, count) { return zone.price * hours * (zone.type === 'pc' ? count : 1); }
function updateTotal() {
  const zone = zones.get(zoneField.value); const hours = Number(hoursField.value); const count = Number(countField.value) || 1;
  $('#plan-total').textContent = 'от ' + money(calculate(zone, hours, count));
  $('#plan-formula').textContent = `${money(zone.price)}/ч × ${hours} ${plural(hours, ['час', 'часа', 'часов'])}` + (zone.type === 'pc' ? ` × ${count} ${plural(count, ['место', 'места', 'мест'])}` : ' · за всю зону');
  errorField.hidden = true;
}
function isValidPlan(plan) {
  if (!plan || plan.version !== 1 || !zones.has(plan.zone)) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(plan.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(plan.time)) return false;
  const date = new Date(`${plan.date}T${plan.time}`);
  if (!Number.isFinite(date.getTime()) || dateString(date) !== plan.date) return false;
  return allowedHours.includes(plan.hours) && Number.isInteger(plan.count) && plan.count >= 1 && plan.count <= zones.get(plan.zone).max;
}
let savedPlan = null;
try { const plan = JSON.parse(localStorage.getItem(storageKey)); if (isValidPlan(plan)) savedPlan = plan; } catch { /* Storage may be unavailable or contain invalid data. */ }
function refreshSavedDot() { $('#saved-dot').hidden = !savedPlan; }
refreshSavedDot();
function openPlanner(id = 'comfort', useSaved = false) {
  setDateBounds(); errorField.hidden = true;
  form.hidden = false; savedState.hidden = true;
  if (useSaved && savedPlan) {
    zoneField.value = savedPlan.zone; dateField.value = savedPlan.date; timeField.value = savedPlan.time;
    hoursField.value = savedPlan.hours; updateCount(savedPlan.count);
    if (new Date(`${savedPlan.date}T${savedPlan.time}`).getTime() <= Date.now()) defaultTime();
  } else {
    zoneField.value = zones.has(id) ? id : 'comfort'; hoursField.value = '2'; defaultTime(); updateCount(1);
  }
  showDialog(planner);
}
$$('[data-plan]').forEach(button => button.addEventListener('click', () => openPlanner(button.dataset.plan)));
$('#saved-button').addEventListener('click', () => {
  if (savedPlan) { showSavedPlan(); showDialog(planner); }
  else openPlanner();
});
zoneField.addEventListener('change', () => updateCount());
[hoursField, countField].forEach(field => field.addEventListener('change', updateTotal));
[dateField, timeField].forEach(field => field.addEventListener('input', () => { errorField.hidden = true; }));

function readPlan() {
  if (!form.reportValidity()) return null;
  const plan = { version: 1, zone: zoneField.value, date: dateField.value, time: timeField.value, hours: Number(hoursField.value), count: Number(countField.value) };
  if (!isValidPlan(plan)) { errorField.textContent = 'Проверь дату, время и параметры визита.'; errorField.hidden = false; return null; }
  if (new Date(`${plan.date}T${plan.time}`).getTime() <= Date.now()) { errorField.textContent = 'Выбери время в будущем.'; errorField.hidden = false; return null; }
  return plan;
}
function describePlan(plan) {
  const zone = zones.get(plan.zone);
  const when = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${plan.date}T${plan.time}`));
  return `${zone.type === 'pc' ? 'PC' : 'PS5'} · ${zone.name}\n${when}, ${plan.time}\n${plan.hours} ${plural(plan.hours, ['час', 'часа', 'часов'])} · ${plan.count} ${zone.type === 'pc' ? plural(plan.count, ['место', 'места', 'мест']) : plural(plan.count, ['гость', 'гостя', 'гостей'])}\nОриентировочно от ${money(calculate(zone, plan.hours, plan.count))}`;
}
function showSavedPlan() {
  form.hidden = true; savedState.hidden = false;
  $('#saved-summary').textContent = describePlan(savedPlan);
  $('#saved-summary').style.whiteSpace = 'pre-line';
}
form.addEventListener('submit', event => {
  event.preventDefault(); const plan = readPlan(); if (!plan) return;
  try { localStorage.setItem(storageKey, JSON.stringify(plan)); }
  catch { errorField.textContent = 'Браузер не разрешает сохранение. Разреши хранение данных для этого сайта или добавь план в календарь.'; errorField.hidden = false; return; }
  savedPlan = plan; refreshSavedDot(); showSavedPlan(); $('#edit-plan').focus();
});
$('#edit-plan').addEventListener('click', () => { openPlanner(savedPlan.zone, true); zoneField.focus(); });
$('#delete-plan').addEventListener('click', () => {
  try { localStorage.removeItem(storageKey); }
  catch { showToast('Не удалось удалить план: браузер заблокировал хранение данных.'); return; }
  savedPlan = null; refreshSavedDot(); planner.close(); showToast('План визита удалён');
});

function exportCalendar(plan) {
  const start = new Date(`${plan.date}T${plan.time}`);
  const finish = new Date(start.getTime() + plan.hours * 3600000);
  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const escapeICS = value => value.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//CATZ//Visit Planner//RU','CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
    `UID:${crypto.randomUUID()}@catz-plan`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(finish)}`,
    `SUMMARY:${escapeICS('План визита C.A.T.Z. · ' + zones.get(plan.zone).name)}`,
    `DESCRIPTION:${escapeICS(describePlan(plan) + '\nЭто личный план визита. Место не забронировано; наличие мест и цену нужно уточнить у клуба.')}`,
    'STATUS:TENTATIVE','END:VEVENT','END:VCALENDAR'];
  // Fold at a UTF-8 byte boundary according to RFC 5545 (75 octets per line).
  const encoder = new TextEncoder();
  const fold = line => {
    const chunks = []; let current = ''; let length = 0;
    for (const char of line) { const bytes = encoder.encode(char).length; if (length + bytes > 75) { chunks.push(current); current = ' '; length = 1; } current += char; length += bytes; }
    chunks.push(current); return chunks.join('\r\n');
  };
  const blob = new Blob([lines.map(fold).join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = `catz-plan-${plan.date}.ics`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000); showToast('Файл календаря подготовлен');
}
$('#calendar-button').addEventListener('click', () => { const plan = readPlan(); if (plan) exportCalendar(plan); });
$('#saved-calendar').addEventListener('click', () => { if (savedPlan) exportCalendar(savedPlan); });

const lightbox = $('#lightbox');
const galleryItems = $$('[data-gallery]').map(button => ({ src: $('img', button).getAttribute('src'), alt: $('img', button).alt, title: $('strong', button).textContent }));
let activeImage = 0;
function showImage(index) {
  activeImage = (index + galleryItems.length) % galleryItems.length;
  const item = galleryItems[activeImage]; $('#lightbox-image').src = item.src; $('#lightbox-image').alt = item.alt;
  $('#lightbox-caption').textContent = item.title; $('#lightbox-count').textContent = `${activeImage + 1} / ${galleryItems.length}`;
}
$$('[data-gallery]').forEach(button => button.addEventListener('click', () => { showImage(Number(button.dataset.gallery)); showDialog(lightbox); }));
$('#gallery-prev').addEventListener('click', () => showImage(activeImage - 1));
$('#gallery-next').addEventListener('click', () => showImage(activeImage + 1));
lightbox.addEventListener('keydown', event => {
  if (event.key === 'ArrowLeft') { event.preventDefault(); showImage(activeImage - 1); }
  if (event.key === 'ArrowRight') { event.preventDefault(); showImage(activeImage + 1); }
});
$$('.faq details').forEach(detail => detail.addEventListener('toggle', () => {
  if (detail.open) $$('.faq details').forEach(other => { if (other !== detail) other.open = false; });
}));
let toastTimer;
function showToast(message) { const toast = $('#toast'); clearTimeout(toastTimer); toast.textContent = message; toast.classList.add('visible'); toastTimer = setTimeout(() => toast.classList.remove('visible'), 3500); }

// Local vendor files, one lifecycle owner. Core content is visible if loading fails.
let effects;
import('../site-effects/runtime.js').then(({ mountEffects }) => { effects = mountEffects(document); }).catch(error => console.warn('Не удалось запустить эффекты:', error.message));
window.addEventListener('pagehide', () => { effects?.destroy(); });
window.addEventListener('pageshow', event => {
  if (event.persisted) { import('../site-effects/runtime.js').then(({ mountEffects }) => { effects = mountEffects(document); }).catch(() => {}); }
});
