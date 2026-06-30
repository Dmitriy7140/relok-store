'use strict';
/* ═══════════════════════════════════════════════════════════════
   Logovo · Админ — заказы (CRM), бонусные товары, кейс, видеоотзывы.
   Дополняет admin.js (использует те же helpers: el, esc, fmt, toast,
   toastLoad, openMediaPicker, compressAndUpload, closeDrawer).
   ═══════════════════════════════════════════════════════════════ */

const fmtB = (n) => Number(n || 0).toLocaleString('ru-RU');
const dt = (s) => {
  if (!s) return '—';
  const d = new Date(/\dT\d|Z|\+/.test(s) ? s : s.replace(' ', 'T') + 'Z');
  if (isNaN(d)) return esc(String(s));
  return d.toLocaleDateString('ru-RU') + ' ' + d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
};

const ORDER_STATUS = {
  pending:   ['Ожидает оплаты', 'rgba(255,176,32,.14)', 'var(--amber)'],
  paid:      ['Оплачен',        'rgba(48,209,88,.14)',  'var(--green)'],
  activated: ['Выдан',          'var(--blue-d)',        'var(--blue)'],
  cancelled: ['Отменён',        'rgba(255,69,58,.14)',  'var(--red)'],
  refunded:  ['Возврат',        'rgba(255,69,58,.14)',  'var(--red)'],
};
const PAY_METHOD = { yookassa: 'ЮKassa', '': 'Не указан', manual: 'Вручную' };

/* ════════════ ЗАКАЗЫ (CRM) ════════════════════════════════════ */
const O = { items: [], q: '', status: '', sort: 'date_desc', page: 1, pages: 1 };

async function renderOrders() {
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Заказы</h1><div class="sub">CRM · история, статусы, выдача</div></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="exportOrdersCSV()">⬇️ Экспорт CSV</button>
    </div>
    <div class="bar">
      <input class="inp" style="max-width:260px;height:42px" placeholder="Поиск: ID, ник, PSN, e-mail…"
        value="${esc(O.q)}" oninput="O.q=this.value;renderOrdersList()">
      <select class="inp" style="max-width:180px;height:42px" onchange="O.status=this.value;reloadOrders()">
        <option value="">Все статусы</option>
        ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${O.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}
      </select>
      <select class="inp" style="max-width:200px;height:42px" onchange="O.sort=this.value;renderOrdersList()">
        <option value="date_desc">Сначала новые</option>
        <option value="date_asc">Сначала старые</option>
        <option value="amount_desc">Сумма ↓</option>
        <option value="amount_asc">Сумма ↑</option>
      </select>
    </div>
    <div class="panel" id="ordersList"><div class="empty-mini"><div class="ic">⏳</div><p>Загрузка…</p></div></div>`;
  await reloadOrders();
}

async function reloadOrders() {
  try {
    const r = await API.listOrders({ status: O.status, limit: 200, page: 1 });
    O.items = r.items || [];
    O.pages = r.pages || 1;
    if (el('cnt-orders')) el('cnt-orders').textContent = r.total ?? O.items.length;
    renderOrdersList();
  } catch (e) {
    const h = el('ordersList');
    if (h) h.innerHTML = `<div class="empty-mini"><div class="ic">⚠️</div><p>Ошибка загрузки</p><small>${esc(e.message)}</small></div>`;
  }
}

function filteredOrders() {
  let items = O.items.slice();
  const q = O.q.trim().toLowerCase();
  if (q) items = items.filter(o =>
    String(o.id).toLowerCase().includes(q) ||
    (o.nickname || '').toLowerCase().includes(q) ||
    (o.psnId || '').toLowerCase().includes(q) ||
    (o.email || '').toLowerCase().includes(q) ||
    (o.telegram || '').toLowerCase().includes(q) ||
    (o.productName || '').toLowerCase().includes(q));
  const cmp = {
    date_desc: (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    date_asc:  (a, b) => new Date(a.createdAt) - new Date(b.createdAt),
    amount_desc: (a, b) => b.amount - a.amount,
    amount_asc:  (a, b) => a.amount - b.amount,
  }[O.sort] || (() => 0);
  return items.sort(cmp);
}

function renderOrdersList() {
  const host = el('ordersList'); if (!host) return;
  const items = filteredOrders();
  if (!items.length) { host.innerHTML = emptyMini('🧾', 'Заказов нет', O.q ? 'Измените запрос' : 'Заказы появятся после оформления'); return; }
  host.innerHTML = items.map(orderRow).join('');
}

function statusBadge(st) {
  const s = ORDER_STATUS[st] || [st, 'var(--bg3)', 'var(--t3)'];
  return `<span class="tag" style="background:${s[1]};color:${s[2]}">${s[0]}</span>`;
}

function orderRow(o) {
  return `<div class="prow" data-id="${esc(o.id)}">
    <div class="p-main">
      <div class="p-name">#${esc(o.id)} ${statusBadge(o.status)}</div>
      <div class="p-meta">${dt(o.createdAt)} · ${esc(o.productName || '—')} · ${esc(o.nickname || o.psnId || '—')}</div>
    </div>
    <div class="p-price">${fmt(o.amount)}
      ${o.bonusEarned ? `<div class="p-price-old" style="color:var(--green);text-decoration:none">+${fmtB(o.bonusEarned)} Б</div>` : ''}
    </div>
    <div class="p-acts">
      <button class="iconbtn" title="Подробнее" onclick="openOrder('${esc(o.id)}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/></svg>
      </button>
      <button class="iconbtn danger" title="Удалить" onclick="delOrder('${esc(o.id)}')">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
      </button>
    </div>
  </div>`;
}

function openOrder(id) {
  const o = O.items.find(x => String(x.id) === String(id)); if (!o) return;
  const m = o.meta || {};
  const info = [
    ['PSN ID', o.psnId], ['Никнейм', o.nickname], ['Telegram', o.telegram],
    ['E-mail', o.email], ['Комментарий', o.comment],
  ].filter(([, v]) => v);
  const deliv = (m.platform || m.deliveryKey || m.key) ? [
    ['Платформа', m.platform], ['Ключ выдачи', m.deliveryKey || m.key],
  ].filter(([, v]) => v) : [];
  const hist = (o.statusHistory || []).map(h =>
    `<div class="p-meta" style="padding:3px 0">${dt(h.at)} → ${statusBadge(h.status)} ${h.by ? `<span style="color:var(--t4)">(${esc(h.by)})</span>` : ''}</div>`).join('') || '<div class="p-meta">Нет записей</div>';

  el('drawerPanel').innerHTML = `
    <div class="drawer-head">
      <button class="iconbtn" onclick="closeDrawer()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      <h2>Заказ #${esc(o.id)}</h2>
    </div>
    <div class="drawer-body">
      <div class="drawer-sec">Статус</div>
      <div class="field">
        <select class="inp" id="oStatus">
          ${Object.entries(ORDER_STATUS).map(([k, v]) => `<option value="${k}" ${o.status === k ? 'selected' : ''}>${v[0]}</option>`).join('')}
        </select>
      </div>
      <button class="btn btn-blue btn-sm" onclick="saveOrderStatus('${esc(o.id)}')">Обновить статус</button>

      <div class="drawer-sec">Сумма и бонусы</div>
      <div class="grid3">
        <div class="field"><label>Сумма</label><div class="inp" style="height:42px;display:flex;align-items:center;font-weight:700">${fmt(o.amount)}</div></div>
        <div class="field"><label>Начислено</label><div class="inp" style="height:42px;display:flex;align-items:center;color:var(--green)">+${fmtB(o.bonusEarned)} Б</div></div>
        <div class="field"><label>Списано</label><div class="inp" style="height:42px;display:flex;align-items:center">${fmtB(o.bonusSpent)} Б</div></div>
      </div>
      <div class="field"><label>Способ оплаты</label><div class="inp" style="height:42px;display:flex;align-items:center">${PAY_METHOD[o.payMethod] || esc(o.payMethod || 'Не указан')}</div></div>

      <div class="drawer-sec">Товар</div>
      <div class="field"><div class="inp" style="height:auto;min-height:42px;display:flex;align-items:center">${esc(o.productName || '—')}</div></div>

      <div class="drawer-sec">Информация клиента</div>
      ${info.length ? info.map(([l, v]) => `<div class="field"><label>${l}</label><div class="inp" style="height:42px;display:flex;align-items:center">${esc(v)}</div></div>`).join('') : '<div class="p-meta">Не заполнено</div>'}

      ${deliv.length ? `<div class="drawer-sec">Информация для выдачи</div>
      ${deliv.map(([l, v]) => `<div class="field"><label>${l}</label><div class="inp" style="height:42px;display:flex;align-items:center">${esc(v)}</div></div>`).join('')}` : ''}

      <div class="drawer-sec">История статусов</div>
      ${hist}

      <div class="drawer-sec">Даты</div>
      <div class="p-meta">Создан: ${dt(o.createdAt)}</div>
      <div class="p-meta">Оплачен: ${dt(o.paidAt)}</div>
      <div class="p-meta">Обновлён: ${dt(o.updatedAt)}</div>
    </div>
    <div class="drawer-foot">
      <button class="btn btn-ghost" onclick="closeDrawer()">Закрыть</button>
      <button class="btn btn-red" onclick="delOrder('${esc(o.id)}')">Удалить</button>
    </div>`;
  el('drawer').classList.add('on');
  document.body.style.overflow = 'hidden';
}

async function saveOrderStatus(id) {
  const st = gval('oStatus');
  toastLoad('Сохраняем…');
  try {
    const upd = await API.patchOrderAdmin(id, { status: st });
    const i = O.items.findIndex(x => String(x.id) === String(id));
    if (i >= 0) O.items[i] = upd;
    closeDrawer(); renderOrdersList();
    toast('Статус обновлён');
  } catch (e) { toast(e.message, 'err'); }
}

async function delOrder(id) {
  if (!confirm(`Удалить заказ #${id}? Действие необратимо.`)) return;
  toastLoad('Удаляем…');
  try {
    await API.deleteOrder(id);
    O.items = O.items.filter(x => String(x.id) !== String(id));
    closeDrawer(); renderOrdersList(); toast('Заказ удалён');
  } catch (e) { toast(e.message, 'err'); }
}

function exportOrdersCSV() {
  const items = filteredOrders();
  if (!items.length) { toast('Нет данных для экспорта', 'err'); return; }
  const cols = ['ID', 'Дата', 'Товар', 'Сумма', 'Статус', 'Способ оплаты', 'Клиент', 'PSN', 'Telegram', 'Email', 'Начислено', 'Списано'];
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = items.map(o => [
    o.id, dt(o.createdAt), o.productName, o.amount,
    (ORDER_STATUS[o.status] || [o.status])[0], PAY_METHOD[o.payMethod] || o.payMethod,
    o.nickname, o.psnId, o.telegram, o.email, o.bonusEarned, o.bonusSpent,
  ].map(cell).join(','));
  const csv = '﻿' + cols.map(cell).join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `orders_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
  toast('Экспортировано: ' + items.length);
}

/* ════════════ БОНУСНЫЕ ТОВАРЫ ═════════════════════════════════ */
const BP = { items: [] };

async function renderBonusAdmin() {
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Бонусные товары</h1><div class="sub">Каталог за бонусы · авто-выдача ключей</div></div>
      <div class="spacer"></div>
      <button class="btn btn-blue btn-sm" onclick="openBonusEditor(null)">+ Добавить</button>
    </div>
    <div class="panel" id="bplist"><div class="empty-mini"><div class="ic">⏳</div><p>Загрузка…</p></div></div>`;
  try {
    BP.items = await API.adminBonusProducts();
    if (el('cnt-bonus')) el('cnt-bonus').textContent = BP.items.length;
    renderBonusList();
  } catch (e) {
    el('bplist').innerHTML = `<div class="empty-mini"><div class="ic">⚠️</div><p>Ошибка</p><small>${esc(e.message)}</small></div>`;
  }
}

function renderBonusList() {
  const host = el('bplist'); if (!host) return;
  if (!BP.items.length) { host.innerHTML = emptyMini('🎁', 'Бонусных товаров нет', 'Добавьте первый товар'); return; }
  host.innerHTML = BP.items.map(p => `
    <div class="prow" data-id="${p.id}">
      <div class="p-cover">${p.image ? `<img src="${esc(p.image)}" onerror="this.style.display='none'">` : (p.emoji || '🎁')}</div>
      <div class="p-main">
        <div class="p-name">${esc(p.name)}
          ${p.autoDeliver ? '<span class="tag tag-new">авто-ключ</span>' : ''}
          ${p.hidden ? '<span class="tag tag-hidden">скрыт</span>' : ''}
        </div>
        <div class="p-meta">${esc(p.category || '—')} · в наличии: ${p.available ?? p.quantity}</div>
      </div>
      <div class="p-price">${fmtB(p.cost)} Б</div>
      <div class="p-acts">
        ${p.autoDeliver ? `<button class="iconbtn" title="Запасы ключей" onclick="openKeys(${p.id})">🔑</button>` : ''}
        <button class="iconbtn" title="Редактировать" onclick="openBonusEditor(${p.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
        </button>
        <button class="iconbtn danger" title="Удалить" onclick="delBonusProduct(${p.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    </div>`).join('');
}

function openBonusEditor(id) {
  const p = id ? structuredClone(BP.items.find(x => x.id === id))
               : { name: '', description: '', emoji: '🎁', image: '', category: '', cost: 0, quantity: 0, autoDeliver: false, hidden: false };
  el('drawerPanel').innerHTML = `
    <div class="drawer-head">
      <button class="iconbtn" onclick="closeDrawer()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      <h2>${id ? 'Редактировать' : 'Новый бонусный товар'}</h2>
    </div>
    <div class="drawer-body">
      <div class="field">
        <label>Изображение</label>
        <div class="img-pick">
          <div class="img-prev" id="bImgPrev" onclick="pickBonusImage()">${p.image ? `<img src="${esc(p.image)}">` : (p.emoji || '🎁')}</div>
          <div class="img-actions">
            <button class="btn btn-ghost btn-sm" onclick="pickBonusImage()">📂 Из медиатеки</button>
            <button class="btn btn-ghost btn-sm" onclick="uploadBonusImage()">⬆️ Загрузить</button>
          </div>
        </div>
        <input class="inp" id="bImage" value="${esc(p.image || '')}" placeholder="URL изображения">
      </div>
      <div class="grid2">
        <div class="field"><label>Эмодзи</label><input class="inp" id="bEmoji" value="${esc(p.emoji || '🎁')}"></div>
        <div class="field"><label>Категория</label><input class="inp" id="bCategory" value="${esc(p.category || '')}" placeholder="Игры, Подписки…"></div>
      </div>
      <div class="field"><label>Название *</label><input class="inp" id="bName" value="${esc(p.name || '')}"></div>
      <div class="field"><label>Описание</label><textarea class="inp" id="bDesc">${esc(p.description || '')}</textarea></div>
      <div class="grid2">
        <div class="field"><label>Цена (бонусы) *</label><input class="inp" type="number" min="0" id="bCost" value="${p.cost || 0}"></div>
        <div class="field"><label>Количество (без авто-выдачи)</label><input class="inp" type="number" min="0" id="bQuantity" value="${p.quantity || 0}"></div>
      </div>
      <div class="drawer-sec">Выдача</div>
      <div class="toggles">
        ${tgl('bAuto', 'Автоматическая выдача ключей', !!p.autoDeliver)}
        ${tgl('bHidden', 'Скрыть товар', !!p.hidden)}
      </div>
      <div class="p-meta">При авто-выдаче количество = число свободных ключей в разделе «Запасы».</div>
    </div>
    <div class="drawer-foot">
      <button class="btn btn-ghost" onclick="closeDrawer()">Отмена</button>
      <button class="btn btn-blue" style="flex:1" onclick="saveBonusProduct(${p.id || 0})">${id ? 'Сохранить' : 'Создать'}</button>
    </div>`;
  el('drawer').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function pickBonusImage() { openMediaPicker(url => { if (el('bImage')) el('bImage').value = url; const pv = el('bImgPrev'); if (pv) pv.innerHTML = `<img src="${url}">`; }); }
function uploadBonusImage() {
  el('fileInput').removeAttribute('multiple');
  el('fileInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    toastLoad('Загружаем…');
    try { const url = await compressAndUpload(f); if (el('bImage')) el('bImage').value = url; const pv = el('bImgPrev'); if (pv) pv.innerHTML = `<img src="${url}">`; toast('Загружено'); }
    catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };
  el('fileInput').click();
}

async function saveBonusProduct(id) {
  const name = gval('bName').trim();
  if (!name) { toast('Укажите название', 'err'); return; }
  const body = {
    name, description: gval('bDesc'), emoji: gval('bEmoji') || '🎁',
    image: gval('bImage'), category: gval('bCategory'),
    cost: Math.max(0, +gval('bCost') || 0), quantity: Math.max(0, +gval('bQuantity') || 0),
    autoDeliver: gbool('bAuto'), hidden: gbool('bHidden'),
  };
  toastLoad('Сохраняем…');
  try {
    if (id) await API.updateBonusProduct(id, body);
    else await API.createBonusProduct(body);
    closeDrawer(); await renderBonusAdmin(); toast(id ? 'Сохранено' : 'Создано');
  } catch (e) { toast(e.message, 'err'); }
}

async function delBonusProduct(id) {
  const p = BP.items.find(x => x.id === id);
  if (!confirm(`Удалить «${p ? p.name : id}»? Ключи также удалятся.`)) return;
  toastLoad('Удаляем…');
  try { await API.deleteBonusProduct(id); await renderBonusAdmin(); toast('Удалено'); }
  catch (e) { toast(e.message, 'err'); }
}

/* ── Запасы ключей ── */
async function openKeys(pid) {
  const p = BP.items.find(x => x.id === pid);
  el('drawerPanel').innerHTML = `
    <div class="drawer-head">
      <button class="iconbtn" onclick="closeDrawer()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      <h2>Запасы ключей</h2>
    </div>
    <div class="drawer-body" id="keysBody">
      <div class="p-meta">${esc(p ? p.name : '')}</div>
      <div class="drawer-sec">Добавить ключи</div>
      <div class="field">
        <label>Каждый ключ с новой строки</label>
        <textarea class="inp" id="keysInput" style="min-height:120px" placeholder="XXXX-XXXX-XXXX&#10;YYYY-YYYY-YYYY"></textarea>
      </div>
      <button class="btn btn-blue btn-sm" onclick="addKeysToStock(${pid})">Загрузить ключи</button>
      <div class="drawer-sec">Список ключей</div>
      <div id="keysList"><div class="p-meta">Загрузка…</div></div>
    </div>`;
  el('drawer').classList.add('on');
  document.body.style.overflow = 'hidden';
  await loadKeys(pid);
}

async function loadKeys(pid) {
  try {
    const r = await API.listKeys(pid);
    const host = el('keysList'); if (!host) return;
    host.innerHTML = `<div class="p-meta" style="margin-bottom:8px">Всего: ${r.total} · свободно: <b style="color:var(--green)">${r.available}</b></div>` +
      (r.keys.length ? r.keys.map(k => `
        <div class="prow" style="padding:8px 0">
          <div class="p-main"><div class="p-name" style="font-family:monospace;font-size:12px">${esc(k.key_value)}</div>
            <div class="p-meta">${k.used ? `Выдан ${dt(k.used_at)} · ${esc(k.used_by || '')}` : 'Свободен'}</div></div>
          ${k.used ? '<span class="tag tag-hidden">использован</span>'
            : `<button class="iconbtn danger" onclick="delKey(${k.id},${pid})"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="2.4" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>`}
        </div>`).join('') : '<div class="p-meta">Ключей нет</div>');
  } catch (e) { const h = el('keysList'); if (h) h.innerHTML = `<div class="p-meta">Ошибка: ${esc(e.message)}</div>`; }
}

async function addKeysToStock(pid) {
  const raw = gval('keysInput').trim();
  if (!raw) { toast('Введите ключи', 'err'); return; }
  toastLoad('Загружаем…');
  try {
    const r = await API.addKeys(pid, raw);
    el('keysInput').value = '';
    await loadKeys(pid);
    const i = BP.items.findIndex(x => x.id === pid);
    if (i >= 0) BP.items[i].available = r.available;
    renderBonusList();
    toast(`Добавлено ключей: ${r.added}`);
  } catch (e) { toast(e.message, 'err'); }
}

async function delKey(keyId, pid) {
  toastLoad('Удаляем…');
  try { await API.deleteKey(keyId); await loadKeys(pid); toast('Ключ удалён'); }
  catch (e) { toast(e.message, 'err'); }
}

/* ════════════ КЕЙС (РУЛЕТКА) ══════════════════════════════════ */
const CASE = { case: null, prizes: [] };
const PRIZE_TYPE = { bonus: 'Бонусы', product: 'Бонусный товар', nothing: 'Пусто' };

async function renderCaseAdmin() {
  el('view').innerHTML = `<div class="head"><div class="head-txt"><h1>Кейс (рулетка)</h1><div class="sub">Настройка призов и вероятностей</div></div></div>
    <div id="caseView"><div class="empty-mini"><div class="ic">⏳</div><p>Загрузка…</p></div></div>`;
  try {
    const r = await API.adminCase();
    CASE.case = r.case; CASE.prizes = r.prizes || [];
    if (!CASE.case) { el('caseView').innerHTML = emptyMini('🎰', 'Кейс не найден', 'Перезапустите сервер для инициализации'); return; }
    renderCaseView();
  } catch (e) { el('caseView').innerHTML = `<div class="empty-mini"><div class="ic">⚠️</div><p>Ошибка</p><small>${esc(e.message)}</small></div>`; }
}

function renderCaseView() {
  const c = CASE.case;
  const totalW = CASE.prizes.filter(p => p.enabled).reduce((s, p) => s + Math.max(0, p.weight), 0) || 1;
  el('caseView').innerHTML = `
    <div class="settings-card">
      <h3>⚙️ Параметры кейса</h3>
      <div class="grid2">
        <div class="field"><label>Название</label><input class="inp" id="cName" value="${esc(c.name)}"></div>
        <div class="field"><label>Стоимость открытия (бонусы)</label><input class="inp" type="number" min="0" id="cCost" value="${c.cost}"></div>
      </div>
      <div class="toggles">${tgl('cEnabled', 'Кейс активен', !!c.enabled)}</div>
      <button class="btn btn-blue btn-sm" onclick="saveCase()">Сохранить параметры</button>
    </div>
    <div class="panel">
      <div class="panel-hdr"><h2>Призы</h2>
        <button class="btn btn-blue btn-xs" style="margin-left:auto" onclick="openPrizeEditor(null)">+ Приз</button>
      </div>
      ${CASE.prizes.length ? CASE.prizes.map(p => prizeRow(p, totalW)).join('') : emptyMini('🎁', 'Призов нет', 'Добавьте первый приз')}
    </div>`;
}

function prizeRow(p, totalW) {
  const chance = p.enabled ? ((Math.max(0, p.weight) / totalW) * 100).toFixed(1) + '%' : '—';
  return `<div class="prow" data-id="${p.id}">
    <div class="p-cover">${p.image ? `<img src="${esc(p.image)}" onerror="this.style.display='none'">` : (p.emoji || '🎁')}</div>
    <div class="p-main">
      <div class="p-name">${esc(p.name)} ${p.enabled ? '' : '<span class="tag tag-hidden">выкл</span>'}
        <span class="tag" style="background:var(--bg3);color:var(--t3)">${PRIZE_TYPE[p.type] || p.type}</span></div>
      <div class="p-meta">Вес: ${p.weight} · шанс ${chance}${p.type === 'bonus' ? ` · +${fmtB(p.value)} Б` : ''}</div>
    </div>
    <div class="p-acts">
      <button class="iconbtn" title="Вкл/выкл" onclick="togglePrize(${p.id})">${p.enabled ? '✅' : '⬜'}</button>
      <button class="iconbtn" title="Редактировать" onclick="openPrizeEditor(${p.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="iconbtn danger" title="Удалить" onclick="delPrize(${p.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
      </button>
    </div>
  </div>`;
}

async function saveCase() {
  toastLoad('Сохраняем…');
  try {
    const r = await API.updateCase({ name: gval('cName'), cost: Math.max(0, +gval('cCost') || 0), enabled: gbool('cEnabled') });
    CASE.case = r.case; toast('Сохранено');
  } catch (e) { toast(e.message, 'err'); }
}

function openPrizeEditor(id) {
  const p = id ? structuredClone(CASE.prizes.find(x => x.id === id))
               : { name: '', emoji: '🎁', image: '', type: 'bonus', value: 0, weight: 10, enabled: true };
  const bpOpts = BP.items.map(b => `<option value="${b.id}" ${p.value === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('');
  el('drawerPanel').innerHTML = `
    <div class="drawer-head">
      <button class="iconbtn" onclick="closeDrawer()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button>
      <h2>${id ? 'Редактировать приз' : 'Новый приз'}</h2>
    </div>
    <div class="drawer-body">
      <div class="field">
        <label>Изображение</label>
        <div class="img-pick">
          <div class="img-prev" id="zImgPrev" onclick="pickPrizeImage()">${p.image ? `<img src="${esc(p.image)}">` : (p.emoji || '🎁')}</div>
          <div class="img-actions">
            <button class="btn btn-ghost btn-sm" onclick="pickPrizeImage()">📂 Из медиатеки</button>
            <button class="btn btn-ghost btn-sm" onclick="uploadPrizeImage()">⬆️ Загрузить</button>
          </div>
        </div>
        <input class="inp" id="zImage" value="${esc(p.image || '')}" placeholder="URL изображения">
      </div>
      <div class="grid2">
        <div class="field"><label>Эмодзи</label><input class="inp" id="zEmoji" value="${esc(p.emoji || '🎁')}"></div>
        <div class="field"><label>Тип</label>
          <select class="inp" id="zType" onchange="prizeTypeChange(this.value)">
            ${Object.entries(PRIZE_TYPE).map(([k, v]) => `<option value="${k}" ${p.type === k ? 'selected' : ''}>${v}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field"><label>Название *</label><input class="inp" id="zName" value="${esc(p.name || '')}"></div>
      <div class="field" id="zValueBonus" style="${p.type === 'bonus' ? '' : 'display:none'}">
        <label>Сумма бонусов</label><input class="inp" type="number" min="0" id="zValue" value="${p.type === 'bonus' ? (p.value || 0) : 0}">
      </div>
      <div class="field" id="zValueProduct" style="${p.type === 'product' ? '' : 'display:none'}">
        <label>Бонусный товар</label><select class="inp" id="zProduct">${bpOpts || '<option value="">— нет товаров —</option>'}</select>
      </div>
      <div class="field"><label>Вес (вероятность)</label><input class="inp" type="number" min="0" id="zWeight" value="${p.weight || 10}"></div>
      <div class="toggles">${tgl('zEnabled', 'Приз активен', p.enabled !== false)}</div>
    </div>
    <div class="drawer-foot">
      <button class="btn btn-ghost" onclick="closeDrawer()">Отмена</button>
      <button class="btn btn-blue" style="flex:1" onclick="savePrize(${p.id || 0})">${id ? 'Сохранить' : 'Создать'}</button>
    </div>`;
  el('drawer').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function prizeTypeChange(t) {
  el('zValueBonus').style.display = t === 'bonus' ? '' : 'none';
  el('zValueProduct').style.display = t === 'product' ? '' : 'none';
}
function pickPrizeImage() { openMediaPicker(url => { if (el('zImage')) el('zImage').value = url; const pv = el('zImgPrev'); if (pv) pv.innerHTML = `<img src="${url}">`; }); }
function uploadPrizeImage() {
  el('fileInput').removeAttribute('multiple');
  el('fileInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    toastLoad('Загружаем…');
    try { const url = await compressAndUpload(f); if (el('zImage')) el('zImage').value = url; const pv = el('zImgPrev'); if (pv) pv.innerHTML = `<img src="${url}">`; toast('Загружено'); }
    catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };
  el('fileInput').click();
}

async function savePrize(id) {
  const name = gval('zName').trim();
  if (!name) { toast('Укажите название', 'err'); return; }
  const type = gval('zType');
  let value = 0;
  if (type === 'bonus') value = Math.max(0, +gval('zValue') || 0);
  else if (type === 'product') value = +gval('zProduct') || 0;
  const body = { name, emoji: gval('zEmoji') || '🎁', image: gval('zImage'), type, value, weight: Math.max(0, +gval('zWeight') || 0), enabled: gbool('zEnabled') };
  toastLoad('Сохраняем…');
  try {
    if (id) await API.updatePrize(id, body);
    else await API.createPrize(body);
    closeDrawer(); await renderCaseAdmin(); toast(id ? 'Сохранено' : 'Приз создан');
  } catch (e) { toast(e.message, 'err'); }
}

async function togglePrize(id) {
  const p = CASE.prizes.find(x => x.id === id); if (!p) return;
  try { await API.patchPrize(id, { enabled: !p.enabled }); await renderCaseAdmin(); }
  catch (e) { toast(e.message, 'err'); }
}
async function delPrize(id) {
  const p = CASE.prizes.find(x => x.id === id);
  if (!confirm(`Удалить приз «${p ? p.name : id}»?`)) return;
  try { await API.deletePrize(id); await renderCaseAdmin(); toast('Удалено'); }
  catch (e) { toast(e.message, 'err'); }
}

/* ════════════ ВИДЕООТЗЫВЫ ═════════════════════════════════════ */
const VID = { items: [] };

async function renderVideosAdmin() {
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Видеоотзывы</h1><div class="sub">Вертикальные видео на странице «Гарантии»</div></div>
      <div class="spacer"></div>
      <button class="btn btn-blue btn-sm" onclick="uploadVideo()">⬆️ Загрузить видео</button>
    </div>
    <div class="bar"><div class="bar-hint">Перетащите ⠿ для изменения порядка</div></div>
    <div class="panel" id="vidList"><div class="empty-mini"><div class="ic">⏳</div><p>Загрузка…</p></div></div>
    <input type="file" id="videoInput" accept="video/*" style="display:none">`;
  try {
    VID.items = await API.adminVideos();
    if (el('cnt-videos')) el('cnt-videos').textContent = VID.items.length;
    renderVidList();
  } catch (e) { el('vidList').innerHTML = `<div class="empty-mini"><div class="ic">⚠️</div><p>Ошибка</p><small>${esc(e.message)}</small></div>`; }
}

function renderVidList() {
  const host = el('vidList'); if (!host) return;
  if (!VID.items.length) { host.innerHTML = emptyMini('🎬', 'Видео нет', 'Загрузите первое видеоотзыв'); return; }
  host.innerHTML = VID.items.map(v => `
    <div class="prow" data-id="${v.id}" draggable="true">
      <span class="drag-h">⠿</span>
      <div class="p-cover" style="width:48px;height:64px;border-radius:8px;overflow:hidden;background:#000">
        ${v.url ? `<video src="${esc(v.url)}" style="width:100%;height:100%;object-fit:cover" muted></video>` : '🎬'}
      </div>
      <div class="p-main">
        <input class="inp" style="height:36px;max-width:280px" value="${esc(v.title || '')}" placeholder="Заголовок…"
          onchange="renameVideo(${v.id}, this.value)">
        <div class="p-meta">${v.hidden ? 'Скрыто' : 'Опубликовано'}</div>
      </div>
      <div class="p-acts">
        <button class="iconbtn" title="Вкл/выкл" onclick="toggleVideo(${v.id})">${v.hidden ? '⬜' : '✅'}</button>
        <button class="iconbtn danger" title="Удалить" onclick="delVideo(${v.id})">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
        </button>
      </div>
    </div>`).join('');
  enableVidDrag(host);
}

function enableVidDrag(host) {
  let dragEl = null;
  host.querySelectorAll('.prow[draggable]').forEach(row => {
    row.addEventListener('dragstart', () => { dragEl = row; row.classList.add('dragging'); });
    row.addEventListener('dragend', async () => {
      row.classList.remove('dragging');
      host.querySelectorAll('.prow').forEach(r => r.classList.remove('drag-over'));
      const ids = [...host.querySelectorAll('.prow')].map(r => +r.dataset.id);
      try { await API.reorderVideos(ids); toast('Порядок сохранён'); } catch { toast('Ошибка', 'err'); }
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const after = e.clientY - row.getBoundingClientRect().top > row.offsetHeight / 2;
      host.querySelectorAll('.prow').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
      if (dragEl && dragEl !== row) host.insertBefore(dragEl, after ? row.nextSibling : row);
    });
  });
}

function uploadVideo() {
  const inp = el('videoInput'); if (!inp) return;
  inp.onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (f.size > 15e6) { toast('Видео слишком большое (макс ~15 МБ)', 'err'); e.target.value = ''; return; }
    toastLoad('Загружаем видео…');
    try {
      const data = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
      await API.createVideo({ data, mime: f.type, filename: f.name, title: '' });
      await renderVideosAdmin(); toast('Видео загружено');
    } catch (err) { toast(err.message, 'err'); }
    e.target.value = '';
  };
  inp.click();
}

async function renameVideo(id, title) {
  try { await API.patchVideo(id, { title }); } catch (e) { toast(e.message, 'err'); }
}
async function toggleVideo(id) {
  const v = VID.items.find(x => x.id === id); if (!v) return;
  try { await API.patchVideo(id, { hidden: !v.hidden }); await renderVideosAdmin(); }
  catch (e) { toast(e.message, 'err'); }
}
async function delVideo(id) {
  if (!confirm('Удалить видео?')) return;
  try { await API.deleteVideo(id); await renderVideosAdmin(); toast('Удалено'); }
  catch (e) { toast(e.message, 'err'); }
}

Object.assign(window, {
  renderOrders, reloadOrders, renderOrdersList, openOrder, saveOrderStatus, delOrder, exportOrdersCSV,
  renderBonusAdmin, openBonusEditor, pickBonusImage, uploadBonusImage, saveBonusProduct, delBonusProduct,
  openKeys, addKeysToStock, delKey,
  renderCaseAdmin, saveCase, openPrizeEditor, prizeTypeChange, pickPrizeImage, uploadPrizeImage, savePrize, togglePrize, delPrize,
  renderVideosAdmin, uploadVideo, renameVideo, toggleVideo, delVideo,
  O, BP, CASE, VID,
});
