'use strict';
/* ═══════════════════════════════════════════════════════════════
   Logovo v2 — Панель управления
   Полный CRUD: товары, категории, медиа, настройки.
   ═══════════════════════════════════════════════════════════════ */

const $ = s => document.querySelector(s);
const el = id => document.getElementById(id);
const esc = s => String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt = n => Number(n).toLocaleString('ru-RU') + ' ₽';

/* ── Тема ───────────────────────────────────────────────────── */
function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); localStorage.setItem('relok_theme', t); }
function toggleTheme() { applyTheme(document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark'); }
applyTheme(localStorage.getItem('relok_theme') || 'dark');

/* ── Toast ──────────────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = 'ok') {
  const t = el('toast'), ico = el('tIco'), txt = el('tTxt'); if (!t) return;
  const check = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const x     = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  t.className = 'toast' + (type==='err'?' err':'');
  ico.innerHTML = type==='err' ? x : check;
  txt.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
function toastLoad(msg) {
  const t = el('toast'), ico = el('tIco'), txt = el('tTxt'); if (!t) return;
  t.className = 'toast show';
  ico.innerHTML = '<div class="spinner"></div>';
  txt.textContent = msg;
  clearTimeout(toastTimer);
}

/* ── Состояние ──────────────────────────────────────────────── */
const S = { products: [], categories: [], media: [], tab: 'dash', filter: '', editing: null, settings: {} };

/* ── Авторизация ────────────────────────────────────────────── */
async function doLogin() {
  const token = el('tokenInput').value.trim() || 'logovo-admin';
  toastLoad('Проверка токена…');
  try {
    await API.auth(token);
    localStorage.setItem('logovo_admin_token', token);
    el('login').style.display = 'none';
    el('shell').classList.add('on');
    await loadAll();
    tab('dash');
  } catch (e) {
    toast(e.message==='offline' ? 'Сервер недоступен. Запустите node server/server.js' : 'Неверный токен', 'err');
  }
}
function logout() { localStorage.removeItem('logovo_admin_token'); location.reload(); }

async function loadAll() {
  try {
    const [prods, cats, stg] = await Promise.all([
      API.products({ limit: 500, sort: 'position' }),
      API.categories(),
      API.settings().catch(() => ({})),
    ]);
    S.products = prods.items || [];
    S.categories = cats || [];
    S.settings = stg || {};
    updateCounts();
  } catch (e) { toast('Ошибка загрузки', 'err'); }
}

function updateCounts() {
  el('cnt-products').textContent   = S.products.filter(p=>p.type==='game').length;
  el('cnt-subs').textContent       = S.products.filter(p=>p.type==='sub').length;
  el('cnt-codes').textContent      = S.products.filter(p=>p.type==='code').length;
  el('cnt-categories').textContent = S.categories.length;
}

/* ── Navigation ─────────────────────────────────────────────── */
function tab(name) {
  S.tab = name; S.filter = '';
  document.querySelectorAll('[data-tab]').forEach(n => n.classList.toggle('on', n.dataset.tab===name));
  const r = {
    dash: renderDash, products: () => renderProducts('game'),
    subs: () => renderProducts('sub'), codes: () => renderProducts('code'),
    categories: renderCategories, media: renderMedia, settings: renderSettings,
  };
  (r[name] || renderDash)();
  window.scrollTo(0,0);
}

/* ════════════ DASHBOARD ════════════════════════════════════════ */
function renderDash() {
  const p = S.products;
  const games  = p.filter(x=>x.type==='game').length;
  const subs   = p.filter(x=>x.type==='sub').length;
  const codes  = p.filter(x=>x.type==='code').length;
  const hidden = p.filter(x=>x.hidden).length;
  const onSale = p.filter(x=>x.isSale||x.oldPrice).length;
  const noStock= p.filter(x=>!x.inStock&&!x.hidden).length;
  const recent = [...p].sort((a,b)=>b.id-a.id).slice(0,8);

  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Дашборд</h1><div class="sub">Обзор магазина · Logovo</div></div>
      <div class="spacer"></div>
      <button class="btn btn-blue btn-sm" onclick="openEditor(null,'game')">+ Добавить товар</button>
    </div>
    <div class="stats">
      ${stat('🎮',games,'Игр')}
      ${stat('💎',subs,'Подписок')}
      ${stat('💳',codes,'Кодов')}
      ${stat('🗂️',S.categories.length,'Категорий')}
      ${stat('🏷️',onSale,'Со скидкой')}
      ${stat('🙈',hidden,'Скрыто')}
      ${stat('❌',noStock,'Нет в наличии','trend-dn')}
      ${stat('🖼️',S.media.length,'Медиафайлов')}
    </div>
    <div class="analytics-row">
      <div class="a-card">
        <div class="a-card-lbl">Игры / Подписки / Коды</div>
        <div class="a-card-val">${games} / ${subs} / ${codes}</div>
        <div class="a-card-sub">Распределение по типам</div>
      </div>
      <div class="a-card">
        <div class="a-card-lbl">Видимые товары</div>
        <div class="a-card-val">${p.length - hidden} <small style="font-size:14px;color:var(--t3)">из ${p.length}</small></div>
        <div class="a-card-sub">Скрыто: ${hidden}</div>
      </div>
      <div class="a-card">
        <div class="a-card-lbl">Средняя цена</div>
        <div class="a-card-val" style="font-size:16px">${p.length ? fmt(Math.round(p.reduce((s,x)=>s+x.price,0)/p.length)) : '—'}</div>
        <div class="a-card-sub">По всем товарам</div>
      </div>
    </div>
    <div class="panel">
      <div class="panel-hdr">
        <h2>Недавно добавленные</h2>
        <div class="btn btn-ghost btn-xs" style="margin-left:auto" onclick="tab('products')">Все товары →</div>
      </div>
      ${recent.length ? recent.map(rowHTML).join('') : emptyMini('📦','Товаров пока нет','Добавьте первый товар')}
    </div>`;
}
const stat = (ico, num, lbl, cls='') =>
  `<div class="stat"><div class="stat-ic">${ico}</div>
   <div class="stat-num ${cls}">${num}</div><div class="stat-lbl">${lbl}</div></div>`;

/* ════════════ PRODUCTS / SUBS / CODES ═════════════════════════ */
const TYPE_TITLE = {
  game:  ['Игры',           'PlayStation 4 и PlayStation 5'],
  sub:   ['Подписки',       'PS Plus, EA Play, Xbox Game Pass'],
  code:  ['Коды пополнения','Кошельки PSN, Steam, Xbox'],
};

function renderProducts(type) {
  const [title, sub] = TYPE_TITLE[type];
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>${title}</h1><div class="sub">${sub}</div></div>
      <div class="spacer"></div>
      <button class="btn btn-blue btn-sm" onclick="openEditor(null,'${type}')">+ Добавить</button>
    </div>
    <div class="bar">
      <input class="inp" style="max-width:280px;height:42px" placeholder="Поиск по названию…" oninput="S.filter=this.value;renderList('${type}')">
      <div class="bar-hint">Перетащите ⠿ для изменения порядка</div>
    </div>
    <div class="panel" id="plist"></div>`;
  renderList(type);
}

function renderList(type) {
  let items = S.products.filter(p => p.type===type);
  const q = (S.filter||'').trim().toLowerCase();
  if (q) items = items.filter(p => p.name.toLowerCase().includes(q) || (p.platform||'').toLowerCase().includes(q));
  items.sort((a,b) => a.position-b.position || a.id-b.id);
  const host = el('plist'); if (!host) return;
  host.innerHTML = items.length
    ? items.map(rowHTML).join('')
    : emptyMini('🔍', q ? 'Ничего не найдено' : 'Пока пусто', q ? 'Измените запрос' : 'Добавьте первый товар');
  if (!q) enableDrag(host, type);
}

function tags(p) {
  let t = '';
  if (p.hidden)    t += '<span class="tag tag-hidden">скрыт</span>';
  if (p.isFeatured)t += '<span class="tag tag-feat">hero</span>';
  if (p.isNew)     t += '<span class="tag tag-new">new</span>';
  if (p.isSale||p.oldPrice) t += '<span class="tag tag-sale">sale</span>';
  if (p.isPreorder)t += '<span class="tag tag-pre">pre</span>';
  if (!p.inStock)  t += '<span class="tag" style="background:rgba(255,69,58,.14);color:var(--red)">нет</span>';
  return t;
}

function rowHTML(p) {
  const cov = p.image
    ? `<img src="${p.image}" onerror="this.style.display='none'">`
    : (p.emoji||'🎮');
  return `<div class="prow" data-id="${p.id}" ${S.tab!=='dash'&&!S.filter?'draggable="true"':''}>
    <span class="drag-h" style="${S.tab==='dash'?'visibility:hidden':''}">⠿</span>
    <div class="p-cover">${cov}</div>
    <div class="p-main">
      <div class="p-name">${esc(p.name)} ${tags(p)}</div>
      <div class="p-meta">${esc([p.platform,p.edition].filter(Boolean).join(' · ')||'—')}</div>
    </div>
    <div class="p-price">
      ${fmt(p.price)}
      ${p.oldPrice?`<div class="p-price-old">${fmt(p.oldPrice)}</div>`:''}
    </div>
    <div class="p-acts">
      <button class="iconbtn" title="${p.hidden?'Показать':'Скрыть'}" onclick="toggleHidden(${p.id})">
        ${p.hidden
          ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
          : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'}
      </button>
      <button class="iconbtn" title="Редактировать" onclick="openEditor(${p.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="iconbtn danger" title="Удалить" onclick="delProduct(${p.id})">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
      </button>
    </div>
  </div>`;
}

function emptyMini(ic, msg, sub='') {
  return `<div class="empty-mini"><div class="ic">${ic}</div><p>${msg}</p>${sub?`<small>${sub}</small>`:''}</div>`;
}

/* ── Drag & Drop ────────────────────────────────────────────── */
function enableDrag(host, type) {
  let dragEl = null;
  host.querySelectorAll('.prow[draggable]').forEach(row => {
    row.addEventListener('dragstart', () => { dragEl = row; row.classList.add('dragging'); });
    row.addEventListener('dragend', async () => {
      row.classList.remove('dragging');
      host.querySelectorAll('.prow').forEach(r => r.classList.remove('drag-over'));
      const ids = [...host.querySelectorAll('.prow')].map(r => +r.dataset.id);
      try { await API.reorderProducts(ids); reflectOrder(ids); toast('Порядок сохранён'); }
      catch { toast('Ошибка сохранения порядка', 'err'); }
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const after = e.clientY - row.getBoundingClientRect().top > row.offsetHeight/2;
      host.querySelectorAll('.prow').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
      if (dragEl && dragEl !== row) host.insertBefore(dragEl, after ? row.nextSibling : row);
    });
  });
}
function reflectOrder(ids) {
  ids.forEach((id, i) => { const p = S.products.find(x=>x.id===id); if (p) p.position = i; });
}

async function toggleHidden(id) {
  const p = S.products.find(x=>x.id===id); if (!p) return;
  try {
    const upd = await API.patchProduct(id, { hidden: !p.hidden });
    Object.assign(p, upd);
    renderList(p.type); updateCounts();
    toast(p.hidden ? 'Товар скрыт' : 'Товар показан');
  } catch (e) { toast(e.message, 'err'); }
}

async function delProduct(id) {
  const p = S.products.find(x=>x.id===id); if (!p) return;
  if (!confirm(`Удалить «${p.name}»? Действие необратимо.`)) return;
  toastLoad('Удаляем…');
  try {
    await API.deleteProduct(id);
    S.products = S.products.filter(x=>x.id!==id);
    renderList(p.type); updateCounts(); toast('Удалено');
  } catch (e) { toast(e.message, 'err'); }
}

/* ════════════ EDITOR ═══════════════════════════════════════════ */
function defaultCat(type) {
  const c = S.categories.find(c => c.type===type || c.slug===type+'s');
  return c?.id || null;
}

function openEditor(id, presetType) {
  const p = id
    ? structuredClone(S.products.find(x=>x.id===id))
    : { type: presetType||'game', name:'', description:'', emoji:'🎮', image:'',
        platform:'', edition:'', price:0, oldPrice:null, inStock:true,
        popularity:0, isNew:false, isSale:false, isPreorder:false,
        isFeatured:false, hidden:false, categoryId:defaultCat(presetType), meta:{} };
  S.editing = p;
  el('drawerPanel').innerHTML = buildEditor(p, !!id);
  el('drawer').classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeDrawer() {
  el('drawer').classList.remove('on');
  document.body.style.overflow = '';
  S.editing = null;
}

function buildEditor(p, isEdit) {
  const type = p.type || 'game';
  const meta = p.meta || {};
  const periods = meta.periods || {};
  const features = meta.features || [];
  const periodRows = Object.entries(periods).map(([m, price]) =>
    `<div class="period-row" id="pr-${m}">
       <div class="inp" style="display:flex;align-items:center;height:42px;font-weight:700">${m} мес.</div>
       <input class="inp" type="number" value="${price}" min="0" placeholder="Цена" id="period-price-${m}">
       <button class="chip-x" onclick="removePeriod(${m})">×</button>
     </div>`).join('');
  const featRows = features.map((f, i) =>
    `<div class="feat-row">
       <input class="inp" value="${esc(f)}" placeholder="Преимущество…" id="feat-${i}">
       <div class="chip-x" onclick="this.parentElement.remove()">×</div>
     </div>`).join('');
  const catOpts = S.categories
    .map(c => `<option value="${c.id}" ${p.categoryId===c.id?'selected':''}>${c.title}</option>`)
    .join('');

  return `
  <div class="drawer-head">
    <button class="iconbtn" onclick="closeDrawer()">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
    </button>
    <h2>${isEdit ? 'Редактировать' : 'Добавить ' + ({game:'игру',sub:'подписку',code:'код'}[type]||'товар')}</h2>
  </div>
  <div class="drawer-body">

    <div class="drawer-sec">Основное</div>
    <div class="field">
      <label>Изображение</label>
      <div class="img-pick">
        <div class="img-prev" id="imgPrev" onclick="pickImage()" title="Выбрать изображение">
          ${p.image ? `<img src="${p.image}" id="imgPreview">` : (p.emoji||'🎮')}
        </div>
        <div class="img-actions">
          <button class="btn btn-ghost btn-sm" onclick="pickImage()">📂 Из медиатеки</button>
          <button class="btn btn-ghost btn-sm" onclick="uploadImageFile()">⬆️ Загрузить файл</button>
          ${p.image ? `<button class="btn btn-sm" style="background:rgba(255,69,58,.1);color:var(--red)" onclick="clearImage()">🗑 Убрать фото</button>` : ''}
        </div>
      </div>
      <input class="inp" id="fImage" value="${esc(p.image||'')}" placeholder="URL изображения или /api/media/…" oninput="previewImg(this.value)">
    </div>
    <div class="grid2">
      <div class="field">
        <label>Эмодзи</label>
        <input class="inp" id="fEmoji" value="${esc(p.emoji||'🎮')}" placeholder="🎮">
      </div>
      <div class="field">
        <label>Тип</label>
        <select class="inp" id="fType">
          <option value="game" ${type==='game'?'selected':''}>🎮 Игра</option>
          <option value="sub"  ${type==='sub'?'selected':''}>💎 Подписка</option>
          <option value="code" ${type==='code'?'selected':''}>💳 Код</option>
        </select>
      </div>
    </div>
    <div class="field">
      <label>Название *</label>
      <input class="inp" id="fName" value="${esc(p.name||'')}" placeholder="Название товара" required>
    </div>
    <div class="field">
      <label>Описание</label>
      <textarea class="inp" id="fDesc" placeholder="Краткое описание…">${esc(p.description||'')}</textarea>
    </div>
    <div class="grid2">
      <div class="field">
        <label>Платформа</label>
        <input class="inp" id="fPlatform" value="${esc(p.platform||'')}" placeholder="PS4/PS5">
      </div>
      <div class="field">
        <label>Издание</label>
        <input class="inp" id="fEdition" value="${esc(p.edition||'')}" placeholder="Standard">
      </div>
    </div>
    <div class="field">
      <label>Категория</label>
      <select class="inp" id="fCategory">
        <option value="">— без категории —</option>
        ${catOpts}
      </select>
    </div>

    <div class="drawer-sec">Цены и наличие</div>
    <div class="grid2">
      <div class="field">
        <label>Цена (₽) *</label>
        <input class="inp" id="fPrice" type="number" min="0" value="${p.price||0}" placeholder="0">
      </div>
      <div class="field">
        <label>Старая цена (₽)</label>
        <input class="inp" id="fOldPrice" type="number" min="0" value="${p.oldPrice||''}" placeholder="Без скидки">
      </div>
    </div>
    <div class="field">
      <label>Популярность (0-100)</label>
      <input class="inp" id="fPopularity" type="number" min="0" max="100" value="${p.popularity||0}">
    </div>

    <div class="drawer-sec">Статусы</div>
    <div class="toggles">
      ${tgl('fInStock','В наличии', p.inStock!==false)}
      ${tgl('fIsNew','Новинка', !!p.isNew)}
      ${tgl('fIsSale','Акция', !!p.isSale)}
      ${tgl('fIsPreorder','Предзаказ', !!p.isPreorder)}
      ${tgl('fIsFeatured','В Hero-карусели', !!p.isFeatured)}
      ${tgl('fHidden','Скрыть товар', !!p.hidden)}
    </div>

    ${type==='game' ? gameFields(meta) : ''}
    ${type==='sub' ? `
    <div class="drawer-sec">Тарифы по периодам</div>
    <div id="periodsWrap">${periodRows}</div>
    <div class="add-line" onclick="addPeriod()">+ Добавить период</div>

    <div class="drawer-sec">Преимущества</div>
    <div id="featsWrap">${featRows}</div>
    <div class="add-line" onclick="addFeature()">+ Добавить преимущество</div>
    ` : ''}
    ${type==='code' ? `
    <div class="drawer-sec">Код пополнения</div>
    <div class="field">
      <label>Сервис / Платформа</label>
      <input class="inp" id="fCodePlatform" value="${esc(meta.codePlatform||p.platform||'')}" placeholder="PSN, Steam, Xbox…">
    </div>
    <div class="field">
      <label>Номинал</label>
      <input class="inp" id="fCodeValue" value="${esc(meta.codeValue||p.edition||'')}" placeholder="1000 ₺">
    </div>
    ` : ''}
  </div>
  <div class="drawer-foot">
    <button class="btn btn-ghost" onclick="closeDrawer()">Отмена</button>
    <button class="btn btn-blue" style="flex:1" onclick="saveProduct(${p.id||0})">${isEdit ? 'Сохранить изменения' : 'Создать товар'}</button>
  </div>`;
}

function gameFields(meta) {
  return `
    <div class="drawer-sec">Характеристики игры</div>
    <div class="grid3">
      <div class="field"><label>Размер</label><input class="inp" id="fSize" value="${esc(meta.size||'')}" placeholder="45 ГБ"></div>
      <div class="field"><label>Игроки</label><input class="inp" id="fPlayers" value="${esc(meta.players||'')}" placeholder="1-4"></div>
      <div class="field"><label>Рейтинг</label><input class="inp" id="fRating" value="${esc(meta.rating||'')}" placeholder="18+"></div>
    </div>`;
}

function tgl(id, label, val) {
  return `<div class="tgl" onclick="this.querySelector('.sw').classList.toggle('on');document.getElementById('${id}').checked=!document.getElementById('${id}').checked">
    <input type="checkbox" id="${id}" ${val?'checked':''} style="display:none">
    <span>${label}</span>
    <div class="sw ${val?'on':''}"></div>
  </div>`;
}

const gbool = id => el(id)?.checked ?? false;
const gval  = id => el(id)?.value ?? '';

function addPeriod() {
  const m = prompt('Период в месяцах (1, 3, 6, 12…):');
  if (!m || isNaN(+m)) return;
  const host = el('periodsWrap'); if (!host) return;
  host.insertAdjacentHTML('beforeend', `
    <div class="period-row" id="pr-${m}">
      <div class="inp" style="display:flex;align-items:center;height:42px;font-weight:700">${m} мес.</div>
      <input class="inp" type="number" min="0" placeholder="Цена ₽" id="period-price-${m}">
      <button class="chip-x" onclick="removePeriod(${m})">×</button>
    </div>`);
}
function removePeriod(m) { el('pr-'+m)?.remove(); }
function addFeature() {
  const host = el('featsWrap'); if (!host) return;
  const i = host.querySelectorAll('.feat-row').length;
  host.insertAdjacentHTML('beforeend', `
    <div class="feat-row">
      <input class="inp" placeholder="Преимущество…" id="feat-${i}">
      <div class="chip-x" onclick="this.parentElement.remove()">×</div>
    </div>`);
  host.lastElementChild?.querySelector('input')?.focus();
}

function previewImg(url) {
  const prev = el('imgPrev');
  if (!prev) return;
  if (url) {
    const img = prev.querySelector('img') || document.createElement('img');
    img.id = 'imgPreview';
    img.src = url;
    img.onerror = () => { prev.innerHTML = S.editing?.emoji || '🎮'; };
    if (!prev.querySelector('img')) prev.innerHTML = '';
    if (!prev.contains(img)) prev.appendChild(img);
  } else {
    prev.innerHTML = S.editing?.emoji || '🎮';
  }
}
function clearImage() {
  if (el('fImage')) el('fImage').value = '';
  if (el('imgPrev')) el('imgPrev').innerHTML = S.editing?.emoji || '🎮';
}
function pickImage() {
  openMediaPicker(url => {
    if (el('fImage')) { el('fImage').value = url; previewImg(url); }
  });
}
function uploadImageFile() {
  el('fileInput').removeAttribute('multiple');
  el('fileInput').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    toastLoad('Загружаем изображение…');
    try {
      const url = await compressAndUpload(file);
      if (el('fImage')) { el('fImage').value = url; previewImg(url); }
      toast('Изображение загружено');
    } catch (err) { toast('Ошибка загрузки: ' + err.message, 'err'); }
    e.target.value = '';
  };
  el('fileInput').click();
}

async function saveProduct(id) {
  const name = gval('fName').trim();
  if (!name) { toast('Укажите название', 'err'); el('fName')?.focus(); return; }
  const price = Math.round(+gval('fPrice') || 0);
  const oldPrice = gval('fOldPrice') ? Math.round(+gval('fOldPrice')) : null;
  const type  = gval('fType') || S.editing?.type || 'game';
  let meta = {};

  if (type === 'game') {
    meta = { size: gval('fSize'), players: gval('fPlayers'), rating: gval('fRating') };
  }
  if (type === 'sub') {
    const periods = {};
    document.querySelectorAll('[id^="period-price-"]').forEach(inp => {
      const m = +inp.id.replace('period-price-','');
      if (m > 0) periods[m] = Math.round(+inp.value || 0);
    });
    const features = [];
    document.querySelectorAll('[id^="feat-"]').forEach(inp => {
      if (inp.value.trim()) features.push(inp.value.trim());
    });
    meta = { periods, features };
  }
  if (type === 'code') {
    meta = { codePlatform: gval('fCodePlatform'), codeValue: gval('fCodeValue') };
  }

  const body = {
    name, description: gval('fDesc'), emoji: gval('fEmoji')||'🎮',
    image: gval('fImage'), type, platform: gval('fPlatform'),
    edition: gval('fEdition'), price, oldPrice,
    categoryId: +gval('fCategory') || null, popularity: +gval('fPopularity') || 0,
    inStock: gbool('fInStock'), isNew: gbool('fIsNew'), isSale: gbool('fIsSale'),
    isPreorder: gbool('fIsPreorder'), isFeatured: gbool('fIsFeatured'),
    hidden: gbool('fHidden'), meta,
  };

  toastLoad(id ? 'Сохраняем…' : 'Создаём…');
  try {
    let updated;
    if (id) { updated = await API.updateProduct(id, body); Object.assign(S.products.find(x=>x.id===id), updated); }
    else { updated = await API.createProduct(body); S.products.push(updated); }
    updateCounts();
    closeDrawer();
    const t = S.tab;
    if (['products','subs','codes'].includes(t)) renderList({products:'game',subs:'sub',codes:'code'}[t]);
    else if (t==='dash') renderDash();
    toast(id ? 'Товар обновлён' : 'Товар создан');
  } catch (e) { toast(e.message, 'err'); }
}

/* ════════════ CATEGORIES ══════════════════════════════════════ */
function renderCategories() {
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Категории</h1><div class="sub">Разделы каталога</div></div>
      <div class="spacer"></div>
      <button class="btn btn-blue btn-sm" onclick="openCatEditor(null)">+ Добавить</button>
    </div>
    <div class="panel" id="catlist"></div>`;
  renderCatList();
}

function renderCatList() {
  const host = el('catlist'); if (!host) return;
  const cats = [...S.categories].sort((a,b) => a.position-b.position || a.id-b.id);
  host.innerHTML = cats.length
    ? cats.map(c => `<div class="prow" data-id="${c.id}" draggable="true">
        <span class="drag-h">⠿</span>
        <div class="p-cover" style="font-size:24px">${c.icon||'📦'}</div>
        <div class="p-main">
          <div class="p-name">${esc(c.title)} ${c.hidden?'<span class="tag tag-hidden">скрыта</span>':''}
            <span class="tag" style="background:var(--bg3);color:var(--t3)">${c.type||'game'}</span>
          </div>
          <div class="p-meta">${esc(c.description||c.slug)} · ${c.count||0} товаров</div>
        </div>
        <div class="p-acts">
          <button class="iconbtn" title="${c.hidden?'Показать':'Скрыть'}" onclick="toggleCatHidden(${c.id})">
            ${c.hidden
              ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
              : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'}
          </button>
          <button class="iconbtn" title="Редактировать" onclick="openCatEditor(${c.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
          </button>
          <button class="iconbtn danger" title="Удалить" onclick="delCat(${c.id})">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--red)" stroke-width="1.8" stroke-linecap="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
          </button>
        </div>
      </div>`).join('')
    : emptyMini('🗂️','Категорий пока нет','Создайте первую категорию');
  enableCatDrag(host);
}

function enableCatDrag(host) {
  let dragEl = null;
  host.querySelectorAll('.prow[draggable]').forEach(row => {
    row.addEventListener('dragstart', () => { dragEl = row; row.classList.add('dragging'); });
    row.addEventListener('dragend', async () => {
      row.classList.remove('dragging');
      const ids = [...host.querySelectorAll('.prow')].map(r => +r.dataset.id);
      try { await API.reorderCategories(ids); ids.forEach((id,i) => { const c=S.categories.find(x=>x.id===id); if(c) c.position=i; }); toast('Порядок сохранён'); }
      catch { toast('Ошибка', 'err'); }
    });
    row.addEventListener('dragover', e => {
      e.preventDefault();
      const after = e.clientY - row.getBoundingClientRect().top > row.offsetHeight/2;
      host.querySelectorAll('.prow').forEach(r => r.classList.remove('drag-over'));
      row.classList.add('drag-over');
      if (dragEl && dragEl !== row) host.insertBefore(dragEl, after ? row.nextSibling : row);
    });
  });
}

function openCatEditor(id) {
  const c = id ? S.categories.find(x=>x.id===id) : { title:'', icon:'📦', type:'game', description:'' };
  el('drawerPanel').innerHTML = `
    <div class="drawer-head">
      <button class="iconbtn" onclick="closeDrawer()">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <h2>${id ? 'Редактировать категорию' : 'Новая категория'}</h2>
    </div>
    <div class="drawer-body">
      <div class="grid2">
        <div class="field"><label>Иконка</label><input class="inp" id="cIcon" value="${esc(c.icon||'📦')}" placeholder="📦"></div>
        <div class="field"><label>Тип</label>
          <select class="inp" id="cType">
            <option value="game" ${c.type==='game'?'selected':''}>🎮 Игры</option>
            <option value="sub"  ${c.type==='sub'?'selected':''}>💎 Подписки</option>
            <option value="code" ${c.type==='code'?'selected':''}>💳 Коды</option>
            <option value="mixed"${c.type==='mixed'?'selected':''}>🛍️ Смешанная</option>
          </select>
        </div>
      </div>
      <div class="field"><label>Название *</label><input class="inp" id="cTitle" value="${esc(c.title||'')}" placeholder="Название категории" required></div>
      <div class="field"><label>Описание</label><textarea class="inp" id="cDesc" placeholder="Краткое описание раздела…">${esc(c.description||'')}</textarea></div>
      ${id ? `
      <div class="drawer-sec">Видимость</div>
      <div class="toggles">${tgl('cHidden','Скрыть категорию', !!c.hidden)}</div>` : ''}
    </div>
    <div class="drawer-foot">
      <button class="btn btn-ghost" onclick="closeDrawer()">Отмена</button>
      <button class="btn btn-blue" style="flex:1" onclick="saveCat(${c.id||0})">${id ? 'Сохранить' : 'Создать'}</button>
    </div>`;
  el('drawer').classList.add('on');
  document.body.style.overflow = 'hidden';
}

async function saveCat(id) {
  const title = gval('cTitle').trim();
  if (!title) { toast('Укажите название', 'err'); el('cTitle')?.focus(); return; }
  const body = { title, icon: gval('cIcon')||'📦', type: gval('cType')||'game', description: gval('cDesc') };
  if (id) body.hidden = gbool('cHidden');
  toastLoad('Сохраняем…');
  try {
    if (id) { const upd = await API.updateCategory(id, body); Object.assign(S.categories.find(x=>x.id===id), upd); }
    else { const c = await API.createCategory(body); S.categories.push(c); }
    updateCounts(); closeDrawer(); renderCatList(); toast(id ? 'Обновлено' : 'Категория создана');
  } catch (e) { toast(e.message, 'err'); }
}

async function toggleCatHidden(id) {
  const c = S.categories.find(x=>x.id===id); if (!c) return;
  try {
    const upd = await API.updateCategory(id, { hidden: !c.hidden });
    Object.assign(c, upd); renderCatList();
    toast(c.hidden ? 'Скрыта' : 'Показана');
  } catch (e) { toast(e.message, 'err'); }
}

async function delCat(id) {
  const c = S.categories.find(x=>x.id===id); if (!c) return;
  if (!confirm(`Удалить категорию «${c.title}»? Товары останутся.`)) return;
  toastLoad('Удаляем…');
  try {
    await API.deleteCategory(id);
    S.categories = S.categories.filter(x=>x.id!==id);
    updateCounts(); renderCatList(); toast('Удалено');
  } catch (e) { toast(e.message, 'err'); }
}

/* ════════════ MEDIA ════════════════════════════════════════════ */
let mediaPicker = null;

async function renderMedia() {
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Медиатека</h1><div class="sub">Изображения товаров</div></div>
      <div class="spacer"></div>
      <button class="btn btn-blue btn-sm" onclick="triggerUpload()">⬆️ Загрузить</button>
    </div>
    <div class="dropzone" id="dropzone" onclick="triggerUpload()">
      <div class="dropzone-ico">🖼️</div>
      <p>Перетащите изображения или нажмите для выбора</p>
      <small>JPEG, PNG, WebP · До 6 МБ · Автоматическое сжатие</small>
    </div>
    <div class="media-grid" id="mediaGrid"><div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--t3)">Загружаем…</div></div>`;
  setupDropzone();
  await loadMedia();
}

async function loadMedia() {
  try {
    const media = await API.listMedia();
    S.media = media || [];
    renderMediaGrid();
  } catch { el('mediaGrid').innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:20px;color:var(--t3)">Ошибка загрузки</div>'; }
}

function renderMediaGrid() {
  const grid = el('mediaGrid'); if (!grid) return;
  if (!S.media.length) {
    grid.innerHTML = `<div style="grid-column:1/-1">${emptyMini('🖼️','Медиатека пуста','Загрузите первые изображения')}</div>`;
    return;
  }
  grid.innerHTML = S.media.map(m => `
    <div class="media-cell" onclick="mediaCellClick(${m.id}, '${m.url}')">
      <img src="${m.url}" alt="${esc(m.filename)}" loading="lazy" decoding="async">
      <div class="mc-info">${esc(m.filename)}</div>
      <div class="mc-del" onclick="event.stopPropagation();delMedia(${m.id})" title="Удалить">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </div>
    </div>`).join('');
}

function mediaCellClick(id, url) {
  if (mediaPicker) { mediaPicker(url); closePicker(); }
}
function openMediaPicker(cb) {
  mediaPicker = cb;
  tab('media');
  toast('Выберите изображение из медиатеки');
}
function closePicker() { mediaPicker = null; }

function triggerUpload() {
  el('fileInput').setAttribute('multiple', '');
  el('fileInput').onchange = async (e) => {
    const files = [...e.target.files]; if (!files.length) return;
    toastLoad(`Загружаем ${files.length} ${files.length===1?'файл':'файлов'}…`);
    let ok = 0;
    for (const f of files) {
      try { await compressAndUpload(f); ok++; } catch {}
    }
    e.target.value = '';
    await loadMedia();
    toast(`Загружено: ${ok} из ${files.length}`);
  };
  el('fileInput').click();
}

function setupDropzone() {
  const dz = el('dropzone'); if (!dz) return;
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('over'));
  dz.addEventListener('drop', async e => {
    e.preventDefault(); dz.classList.remove('over');
    const files = [...e.dataTransfer.files].filter(f => f.type.startsWith('image/'));
    if (!files.length) return;
    toastLoad(`Загружаем ${files.length} файлов…`);
    let ok = 0;
    for (const f of files) { try { await compressAndUpload(f); ok++; } catch {} }
    await loadMedia();
    toast(`Загружено: ${ok} из ${files.length}`);
  });
}

async function compressAndUpload(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async e => {
      const img = new Image();
      img.onload = async () => {
        try {
          const canvas = document.createElement('canvas');
          const MAX = 900;
          let w = img.width, h = img.height;
          if (w > h && w > MAX) { h = Math.round(h*MAX/w); w = MAX; }
          else if (h > MAX) { w = Math.round(w*MAX/h); h = MAX; }
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          const data = canvas.toDataURL('image/jpeg', 0.82);
          const result = await API.uploadMedia({ data, mime: 'image/jpeg', filename: file.name });
          resolve(result.url);
        } catch (err) { reject(err); }
      };
      img.onerror = () => reject(new Error('Не удалось прочитать изображение'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Ошибка чтения файла'));
    reader.readAsDataURL(file);
  });
}

async function delMedia(id) {
  if (!confirm('Удалить изображение?')) return;
  try {
    await API.deleteMedia(id);
    S.media = S.media.filter(m => m.id !== id);
    renderMediaGrid(); toast('Удалено');
  } catch (e) { toast(e.message, 'err'); }
}

/* ════════════ SETTINGS ═════════════════════════════════════════ */
function renderSettings() {
  const cfg = S.settings?.store || {};
  el('view').innerHTML = `
    <div class="head">
      <div class="head-txt"><h1>Настройки</h1><div class="sub">Параметры магазина</div></div>
    </div>
    <div class="settings-card">
      <h3>🏪 Магазин</h3>
      <div class="grid2">
        <div class="field"><label>Название магазина</label><input class="inp" id="sName" value="${esc(cfg.name||'Logovo')}" placeholder="Logovo"></div>
        <div class="field"><label>Подзаголовок</label><input class="inp" id="sTagline" value="${esc(cfg.tagline||'PlayStation Турция')}" placeholder="PlayStation Турция"></div>
      </div>
      <div class="field"><label>Строка объявления (пусто = скрыта)</label>
        <input class="inp" id="sAnn" value="${esc(cfg.announcement||'')}" placeholder="🔥 Скидки до 50% на все игры!">
      </div>
      <button class="btn btn-blue btn-sm" style="margin-top:6px" onclick="saveSettings()">Сохранить</button>
    </div>
    <div class="settings-card">
      <h3>🔑 Безопасность</h3>
      <p style="font-size:13px;color:var(--t3);margin-bottom:14px">Токен задаётся переменной окружения <code>ADMIN_TOKEN</code> при запуске сервера.<br>Текущий токен сохранён в браузере.</p>
      <div class="field"><label>Токен в браузере</label>
        <input class="inp" type="password" value="${localStorage.getItem('logovo_admin_token')||''}" readonly>
      </div>
      <button class="btn btn-red btn-sm" onclick="logout()">Выйти из системы</button>
    </div>`;
}

async function saveSettings() {
  const store = {
    name: gval('sName') || 'Logovo',
    tagline: gval('sTagline') || 'PlayStation Турция',
    announcement: gval('sAnn'),
  };
  toastLoad('Сохраняем…');
  try {
    await API.saveSettings({ store });
    S.settings.store = store;
    toast('Настройки сохранены');
  } catch (e) { toast(e.message, 'err'); }
}

/* ════════════ INIT ════════════════════════════════════════════ */
async function init() {
  const saved = localStorage.getItem('relok_theme');
  applyTheme(saved || 'dark');
  const token = localStorage.getItem('logovo_admin_token');
  if (token) {
    toastLoad('Проверяем сессию…');
    try {
      await API.auth(token);
      el('login').style.display = 'none';
      el('shell').classList.add('on');
      await loadAll();
      tab('dash');
    } catch {
      localStorage.removeItem('logovo_admin_token');
    }
  }
}
init();

Object.assign(window, {
  doLogin, logout, tab, openEditor, closeDrawer, saveProduct, addPeriod, removePeriod,
  addFeature, previewImg, clearImage, pickImage, uploadImageFile,
  toggleHidden, delProduct, openCatEditor, saveCat, toggleCatHidden, delCat,
  renderMedia, triggerUpload, delMedia, saveSettings, toggleTheme,
});
