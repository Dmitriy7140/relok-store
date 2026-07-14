'use strict';
/* ═══════════════════════════════════════════════════════════════
   Админ-раздел «Коды пополнения» (PSN Turkey top-up).

   Возможности:
     • сводка остатков по номиналам (available / reserved / sold);
     • ручное добавление кодов одного номинала;
     • массовая загрузка «denom;code» построчно;
     • список кодов с фильтрами (номинал / статус / поиск) и удалением
       свободных кодов;
     • список заказов, требующих ручной обработки.

   Работает поверх глобальных API / toast / esc / el из admin.js.
   ═══════════════════════════════════════════════════════════════ */

const TOPUP_DENOMS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000];
const TU = { list: [], summary: {}, available: {}, manual: [], denom: '', status: '', q: '', total: 0 };

async function renderTopupAdmin() {
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Коды пополнения</h1>
        <div class="sub">Склад кодов PSN Turkey · автоматическая выдача после оплаты</div></div>
      <div class="spacer"></div>
      <button class="btn btn-ghost btn-sm" onclick="renderTopupAdmin()">🔄 Обновить</button>
    </div>

    <div class="stats" id="topupStock">
      <div class="empty-mini" style="grid-column:1/-1"><div class="ic">⏳</div><p>Загрузка остатков…</p></div>
    </div>

    <div class="grid2" style="align-items:start">
      <div class="settings-card">
        <h3>Добавить коды одного номинала</h3>
        <div class="field">
          <label>Номинал (TRY)</label>
          <select class="inp" id="tuDenom">
            ${TOPUP_DENOMS.map(d => `<option value="${d}">${d} TRY</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label>Коды (по одному в строке)</label>
          <textarea class="inp" id="tuCodes" placeholder="XXXX-XXXX-XXXX&#10;YYYY-YYYY-YYYY"></textarea>
        </div>
        <button class="btn btn-blue full" onclick="topupAddSingle()">Добавить</button>
      </div>

      <div class="settings-card">
        <h3>Массовая загрузка</h3>
        <div class="field">
          <label>Формат: <code>номинал;код</code> (или запятая) построчно</label>
          <textarea class="inp" id="tuBulk" style="min-height:132px"
            placeholder="1000;AAAA-BBBB-CCCC&#10;500;DDDD-EEEE-FFFF&#10;250,GGGG-HHHH-IIII"></textarea>
        </div>
        <button class="btn btn-blue full" onclick="topupBulk()">Загрузить пакетом</button>
      </div>
    </div>

    <div id="topupManualWrap" style="margin-top:20px"></div>

    <div class="bar" style="margin-top:20px">
      <select class="inp" style="max-width:170px;height:42px" id="tuFilterDenom" onchange="TU.denom=this.value;reloadTopupList()">
        <option value="">Все номиналы</option>
        ${TOPUP_DENOMS.map(d => `<option value="${d}">${d} TRY</option>`).join('')}
      </select>
      <select class="inp" style="max-width:170px;height:42px" id="tuFilterStatus" onchange="TU.status=this.value;reloadTopupList()">
        <option value="">Все статусы</option>
        <option value="available">Свободные</option>
        <option value="reserved">Зарезервированы</option>
        <option value="sold">Проданы</option>
      </select>
      <input class="inp" style="max-width:240px;height:42px" placeholder="Поиск: код или № заказа…"
        value="${esc(TU.q)}" oninput="TU.q=this.value;debouncedTopupList()">
    </div>
    <div class="panel" id="topupList"><div class="empty-mini"><div class="ic">⏳</div><p>Загрузка…</p></div></div>`;

  await Promise.all([reloadTopupStock(), reloadTopupList(), reloadTopupManual()]);
}

/* ── Остатки ─────────────────────────────────────────────────── */
async function reloadTopupStock() {
  const host = el('topupStock'); if (!host) return;
  try {
    const r = await API.topupSummary();
    TU.summary = r.summary || {};
    TU.available = r.available || {};
    let totalAvail = 0;
    const cells = TOPUP_DENOMS.map(d => {
      const s = TU.summary[d] || { available: 0, reserved: 0, sold: 0 };
      totalAvail += s.available || 0;
      const low = (s.available || 0) === 0;
      return `<div class="stat" style="${low ? 'border-color:rgba(255,69,58,.4)' : ''}">
        <div class="stat-num" style="${low ? 'color:var(--red)' : ''}">${s.available || 0}</div>
        <div class="stat-lbl">${d} TRY</div>
        <div class="stat-lbl" style="color:var(--t4)">рез. ${s.reserved || 0} · прод. ${s.sold || 0}</div>
      </div>`;
    }).join('');
    host.innerHTML = cells;
    if (el('cnt-topup')) el('cnt-topup').textContent = totalAvail;
  } catch (e) {
    host.innerHTML = `<div class="empty-mini" style="grid-column:1/-1"><div class="ic">⚠️</div><p>Ошибка</p><small>${esc(e.message)}</small></div>`;
  }
}

/* ── Список кодов ────────────────────────────────────────────── */
let _tuTimer;
function debouncedTopupList() { clearTimeout(_tuTimer); _tuTimer = setTimeout(reloadTopupList, 300); }

async function reloadTopupList() {
  const host = el('topupList'); if (!host) return;
  try {
    const r = await API.topupList({ denom: TU.denom, status: TU.status, q: TU.q, limit: 200 });
    TU.list = r.items || [];
    TU.total = r.total || 0;
    if (!TU.list.length) {
      host.innerHTML = `<div class="empty-mini"><div class="ic">💳</div><p>Кодов нет</p><small>Добавьте коды выше</small></div>`;
      return;
    }
    host.innerHTML =
      `<div class="panel-hdr"><h2>Коды</h2><div class="spacer" style="flex:1"></div>
        <span class="bar-hint">Показано ${TU.list.length} из ${TU.total}</span></div>` +
      TU.list.map(topupRow).join('');
  } catch (e) {
    host.innerHTML = `<div class="empty-mini"><div class="ic">⚠️</div><p>Ошибка загрузки</p><small>${esc(e.message)}</small></div>`;
  }
}

const TU_STATUS = {
  available: ['Свободен', 'rgba(48,209,88,.12)', 'var(--green)'],
  reserved:  ['Резерв',   'rgba(255,176,32,.12)', 'var(--amber)'],
  sold:      ['Продан',   'rgba(46,125,255,.14)', 'var(--blue)'],
};

function topupRow(c) {
  const s = TU_STATUS[c.status] || [c.status, 'var(--bg3)', 'var(--t3)'];
  const canDelete = c.status === 'available';
  return `<div class="prow">
    <div class="p-cover" style="font-size:13px;font-weight:800">${c.denom}</div>
    <div class="p-main">
      <div class="p-name" style="font-family:monospace">${esc(c.code)}
        <span class="tag" style="background:${s[1]};color:${s[2]}">${s[0]}</span></div>
      <div class="p-meta">${c.order_id ? '№ ' + esc(c.order_id) + ' · ' : ''}добавлен ${esc((c.uploaded_at || '').slice(0, 16))}</div>
    </div>
    <div class="p-acts">
      ${canDelete
        ? `<button class="iconbtn danger" title="Удалить" onclick="topupDelete(${c.id})">🗑️</button>`
        : `<button class="iconbtn" disabled style="opacity:.35;cursor:not-allowed" title="Выданный код удалить нельзя">🔒</button>`}
    </div>
  </div>`;
}

/* ── Заказы на ручную обработку ──────────────────────────────── */
async function reloadTopupManual() {
  const host = el('topupManualWrap'); if (!host) return;
  try {
    const r = await API.topupManual();
    TU.manual = r.items || [];
    if (!TU.manual.length) { host.innerHTML = ''; return; }
    host.innerHTML = `<div class="panel" style="border-color:rgba(255,69,58,.3)">
      <div class="panel-hdr"><h2>⚠️ Требуют ручной обработки</h2>
        <div class="spacer" style="flex:1"></div>
        <span class="bar-hint">${TU.manual.length}</span></div>
      ${TU.manual.map(o => `<div class="prow">
        <div class="p-main">
          <div class="p-name">${esc(o.productName || '—')} <span class="tag tag-sale">manual</span></div>
          <div class="p-meta">№ ${esc(o.id)} · ${o.amount} ₽ · ${o.priceTry ? o.priceTry + ' TRY' : 'цена TRY неизвестна'} · ${esc(o.telegram || o.userId || '')}</div>
        </div>
      </div>`).join('')}
    </div>`;
  } catch (e) {
    host.innerHTML = '';
  }
}

/* ── Действия ────────────────────────────────────────────────── */
async function topupAddSingle() {
  const denom = Number(el('tuDenom').value);
  const codes = el('tuCodes').value.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  if (!codes.length) { toast('Введите хотя бы один код', 'err'); return; }
  toastLoad('Добавление…');
  try {
    const r = await API.topupAdd(denom, codes);
    toast(`Добавлено ${r.added}, дубликатов ${r.duplicates}`);
    el('tuCodes').value = '';
    await Promise.all([reloadTopupStock(), reloadTopupList()]);
  } catch (e) { toast(e.message, 'err'); }
}

async function topupBulk() {
  const text = el('tuBulk').value.trim();
  if (!text) { toast('Пустой список', 'err'); return; }
  toastLoad('Загрузка…');
  try {
    const r = await API.topupBulk(text);
    toast(`Добавлено ${r.added}, дубл. ${r.duplicates}, ошибок ${r.invalid}`);
    el('tuBulk').value = '';
    await Promise.all([reloadTopupStock(), reloadTopupList()]);
  } catch (e) { toast(e.message, 'err'); }
}

async function topupDelete(id) {
  if (!confirm('Удалить этот код со склада?')) return;
  try {
    await API.topupDelete(id);
    toast('Код удалён');
    await Promise.all([reloadTopupStock(), reloadTopupList()]);
  } catch (e) { toast(e.message, 'err'); }
}

// Экспорт в глобальную область (admin.js вызывает renderTopupAdmin из tab()).
Object.assign(window, {
  renderTopupAdmin, reloadTopupStock, reloadTopupList, reloadTopupManual,
  debouncedTopupList, topupAddSingle, topupBulk, topupDelete,
});
