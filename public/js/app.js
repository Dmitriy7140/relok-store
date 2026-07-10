'use strict';
/* ═══════════════════════════════════════════════════════════════
   Logovo PlayStation — SPA
   Роуты: / · /subs · /games · /wish · /cart · /profile
   ═══════════════════════════════════════════════════════════════ */

const CUR = '₽';
const fmt = n => Number(n).toLocaleString('ru-RU') + '\u202f' + CUR;
const $ = s => document.querySelector(s);
const el = id => document.getElementById(id);
const esc = s => String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ── State ─────────────────────────────────────────────────── */
let cart     = JSON.parse(localStorage.getItem('logovo_cart') || '[]');
let wishlist = JSON.parse(localStorage.getItem('logovo_wish') || '[]');
const saveCart = () => localStorage.setItem('logovo_cart', JSON.stringify(cart));
const saveWish = () => localStorage.setItem('logovo_wish', JSON.stringify(wishlist));

/* ── Theme ─────────────────────────────────────────────────── */
function applyTheme(t) {
  document.documentElement.setAttribute('data-theme', t);
  localStorage.setItem('logovo_theme', t);
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ── Toast ─────────────────────────────────────────────────── */
let toastTimer;
function toast(msg, type = 'ok') {
  const t = el('toast'), txt = el('tMsg');
  if (!t) return;
  t.className = 'toast' + (type === 'err' ? ' err' : '');
  txt.textContent = msg;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  try { if (window.Telegram?.WebApp?.HapticFeedback) Telegram.WebApp.HapticFeedback.impactOccurred(type==='err'?'medium':'light'); } catch {}
}

/* ── Helpers ───────────────────────────────────────────────── */
function plural(n, a, b, c) {
  n = Math.abs(n) % 100;
  if (n >= 11 && n <= 19) return c;
  const r = n % 10;
  if (r === 1) return a;
  if (r >= 2 && r <= 4) return b;
  return c;
}
function discPct(price, old) {
  if (!old || old <= price) return 0;
  return Math.round((1 - price / old) * 100);
}

/* ── Badges ────────────────────────────────────────────────── */
function updateBadges() {
  const cn = cart.length;
  ['cartBadge','cartBadge2'].forEach(id => {
    const b = el(id); if (!b) return;
    b.textContent = cn;
    b.style.display = cn ? 'flex' : 'none';
  });
}

/* ── CTA mouse ripple ──────────────────────────────────────── */
function ctaRipple(e, btn) {
  const r = btn.getBoundingClientRect();
  btn.style.setProperty('--mx', ((e.clientX - r.left) / r.width * 100) + '%');
  btn.style.setProperty('--my', ((e.clientY - r.top)  / r.height * 100) + '%');
}

/* ── Particles ─────────────────────────────────────────────── */
function spawnParticles() {
  const wrap = el('particles');
  if (!wrap) return;
  for (let i = 0; i < 22; i++) {
    const p = document.createElement('div');
    p.className = 'p';
    const dur  = 10 + Math.random() * 14;
    const del  = Math.random() * dur;
    const x    = Math.random() * 100;
    const dx   = (Math.random() - .5) * 120;
    const size = 1 + Math.random() * 2.5;
    p.style.cssText = `left:${x}%;--dur:${dur}s;--del:${-del}s;--dx:${dx}px;width:${size}px;height:${size}px;opacity:${.3+Math.random()*.5}`;
    wrap.appendChild(p);
  }
}

/* ══════════════════════════════════════════════════════════════
   SUBSCRIPTIONS SCREEN
   ══════════════════════════════════════════════════════════════ */
const PERIOD_LABELS = { 1: '1 месяц', 3: '3 месяца', 12: '12 месяцев' };

// Выбранный период для каждой карты: subId → months
const subPeriodSel = {};

async function loadSubs() {
  const grid = el('subGrid');
  if (!grid) return;

  // Skeleton
  grid.innerHTML = Array(3).fill(`
    <div class="sk-gcard">
      <div class="sk-cover sk" style="height:160px"></div>
      <div class="sk-body"><div class="sk" style="height:14px;width:60%;border-radius:6px"></div>
      <div class="sk" style="height:20px;border-radius:6px"></div>
      <div class="sk" style="height:40px;border-radius:6px"></div></div>
    </div>`).join('');

  try {
    const data = await API.products({ type: 'sub', sort: 'popular', limit: 50 });
    const subs = data.items || [];
    if (!subs.length) {
      grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">💎</div><div class="empty-h">Скоро появятся</div><div class="empty-p">Подписки добавляются в ближайшее время</div></div>`;
      return;
    }
    subs.forEach(s => { if (!subPeriodSel[s.id]) subPeriodSel[s.id] = 1; });
    grid.innerHTML = subs.map(s => subCard(s)).join('');
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="empty-ico">⚠️</div><div class="empty-h">Ошибка загрузки</div><div class="empty-p">Не удалось загрузить подписки</div><button class="empty-btn" onclick="loadSubs()">Повторить</button></div>`;
  }
}

function subCard(s) {
  const periods   = s.meta?.periods   || {};
  const tier      = s.meta?.tier      || 'essential';
  const features  = s.meta?.features  || [];
  const hasPeriods = Object.keys(periods).length > 0;
  const sel        = subPeriodSel[s.id] || 1;
  const price      = hasPeriods ? (periods[sel] ?? s.price) : s.price;
  const isFeat     = s.isFeatured;

  const tierIcons  = { essential: '◎', extra: '◈', deluxe: '◆' };
  const tierLabel  = { essential: 'Essential', extra: 'Extra', deluxe: 'Deluxe' }[tier] || tier;
  const coverCls   = `sub-cover sub-cover-${tier}`;
  const markCls    = `sub-tier-mark tm-${tier}`;
  const dotCls     = `sub-feat-dot feat-dot-${tier}`;

  return `
    <div class="sub-card${isFeat ? ' featured' : ''}" data-tier="${tier}" id="sc-${s.id}">
      <div class="${coverCls}">
        <div class="${markCls}">PS Plus ${tierLabel}</div>
        ${isFeat ? '<div class="sub-popular-badge">Популярный</div>' : ''}
        <span class="sub-cover-icon">${tierIcons[tier] || '◎'}</span>
        <div class="sub-cover-name">PlayStation Plus<br>${tierLabel}</div>
      </div>
      <div class="sub-body">
        ${s.description ? `<div class="sub-desc">${esc(s.description)}</div>` : ''}
        ${features.length ? `
          <div class="sub-features">
            ${features.map(f => `
              <div class="sub-feat">
                <div class="${dotCls}"></div>
                ${esc(f)}
              </div>`).join('')}
          </div>` : ''}
        <div class="sub-divider"></div>
        ${hasPeriods ? `
          <div class="sub-periods">
            ${Object.entries(periods).map(([mo, pr]) => `
              <div class="period-row${sel == mo ? ' on' : ''}" onclick="selectSubPeriod(${s.id}, ${mo})">
                <span class="period-label">${PERIOD_LABELS[mo] || mo + ' мес.'}</span>
                <span class="period-price">${fmt(pr)}</span>
              </div>`).join('')}
          </div>` : ''}
        <button class="sub-buy${s.inStock ? '' : ' disabled'}" onclick="addSubToCart(${s.id})"
          ${!s.inStock ? 'disabled' : ''}>
          ${s.inStock ? `Оформить — ${fmt(price)}` : 'Нет в наличии'}
        </button>
      </div>
    </div>`;
}

function selectSubPeriod(subId, months) {
  subPeriodSel[subId] = months;
  // Re-render only that card
  API.product(subId).then(s => {
    const cell = el('sc-' + subId);
    if (cell) cell.outerHTML = subCard(s);
  }).catch(() => {});
}

function addSubToCart(subId) {
  const s = (window.SEED?.products || []).find(p => p.id === subId) || { id: subId, name: 'Подписка', price: 0, emoji: '💎' };
  const period = subPeriodSel[subId] || 1;

  // Добавляем в корзину с выбранным периодом
  const already = cart.some(i => i.id === subId && i.period === period);
  if (already) {
    go('#/cart');
    return;
  }
  cart.push({ id: subId, period });
  saveCart(); updateBadges();

  const PERIOD_L = { 1: '1 месяц', 3: '3 месяца', 12: '12 месяцев' };
  toast(`${s.name} (${PERIOD_L[period] || period + ' мес.'}) добавлена в корзину`);
}

/* ══════════════════════════════════════════════════════════════
   GAMES SCREEN
   ══════════════════════════════════════════════════════════════ */
let gamesState = { q: '', sort: 'popular', page: 1, cat: '' };
let gamesSearchTimer;

async function loadGames() {
  const grid   = el('gamesGrid');
  const pager  = el('gamesPager');
  const cntEl  = el('gamesCnt');
  if (!grid) return;

  gamesState.sort = el('gamesSort')?.value || 'popular';
  gamesState.page = gamesState.page || 1;

  // Skeleton
  grid.innerHTML = Array(8).fill(`
    <div class="sk-gcard">
      <div class="sk-cover sk" style="height:110px"></div>
      <div class="sk-body"><div class="sk" style="height:10px;width:50%;border-radius:4px"></div>
      <div class="sk" style="height:14px;border-radius:5px"></div>
      <div class="sk" style="height:14px;width:70%;border-radius:5px"></div>
      <div class="sk" style="height:32px;border-radius:8px;margin-top:6px"></div></div>
    </div>`).join('');

  try {
    const params = { type: 'game', sort: gamesState.sort, page: gamesState.page, limit: 20 };
    if (gamesState.q) params.q = gamesState.q;
    if (gamesState.cat) params.category = gamesState.cat;

    const data = await API.products(params);
    const items = data.items || [];
    const total = data.total || 0;

    if (cntEl) cntEl.textContent = `${total.toLocaleString('ru-RU')} ${plural(total,'игра','игры','игр')}`;

    if (!items.length) {
      grid.innerHTML = `<div class="empty"><div class="empty-ico">🎮</div><div class="empty-h">Ничего не найдено</div>
        <div class="empty-p">Попробуйте другой запрос или уберите фильтры</div>
        <button class="empty-btn" onclick="resetGames()">Сбросить</button></div>`;
      if (pager) pager.innerHTML = '';
      return;
    }

    grid.innerHTML = items.map(gameCard).join('');
    renderGamesPager(data.page, data.pages);
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-h">Ошибка</div>
      <button class="empty-btn" onclick="loadGames()">Повторить</button></div>`;
  }
}

function gameCard(p) {
  const disc = discPct(p.price, p.oldPrice);

  // Один бейдж — приоритет: SALE > PRE > NEW
  let badge = '';
  let badgeLabel = '';
  if ((p.isSale || p.oldPrice) && disc >= 5) { badge = 'gb-sale'; badgeLabel = `−${disc}%`; }
  else if (p.isPreorder)                     { badge = 'gb-pre';  badgeLabel = 'Предзаказ'; }
  else if (p.isNew)                          { badge = 'gb-new';  badgeLabel = 'Новинка'; }

  // Обложка или эмодзи-плейсхолдер
  const cover = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="gcard-emoji-wrap"><span>${esc(p.emoji || '🎮')}</span></div>`;

  return `
    <div class="gcard" onclick="openProduct(${p.id})">
      <div class="gcard-art">
        ${cover}
        ${badge ? `<div class="gcard-badge ${badge}">${badgeLabel}</div>` : ''}
      </div>
      <div class="gcard-body">
        <div class="gcard-platform">${esc(p.platform || 'PlayStation')}</div>
        <div class="gcard-name">${esc(p.name)}</div>
        <div class="gcard-prices">
          <span class="gcard-price">${p.price === 0 ? 'Бесплатно' : fmt(p.price)}</span>
          ${p.oldPrice && disc >= 5 ? `<span class="gcard-old">${fmt(p.oldPrice)}</span>` : ''}
        </div>
        ${p.originalPriceTRY > 0 ? `<div class="gcard-try">₺ ${p.originalPriceTRY.toLocaleString('ru')}</div>` : ''}
      </div>
      <div class="gcard-footer">
        <button class="gcard-buy${!p.inStock ? ' oos' : ''}"
          onclick="event.stopPropagation();quickAdd(${p.id},this)"
          ${!p.inStock ? 'disabled' : ''}>
          ${!p.inStock ? 'Нет в наличии' : '+ В корзину'}
        </button>
      </div>
    </div>`;
}

function renderGamesPager(page, pages) {
  const pager = el('gamesPager');
  if (!pager || pages <= 1) { if (pager) pager.innerHTML = ''; return; }
  let html = '';
  const range = [];
  for (let i = 1; i <= pages; i++) {
    if (i===1||i===pages||Math.abs(i-page)<=1) range.push(i);
    else if (range[range.length-1]!=='…') range.push('…');
  }
  range.forEach(r => {
    if (r==='…') { html += `<button class="pg" disabled>…</button>`; }
    else { html += `<button class="pg${r===page?' on':''}" onclick="gamesGoPage(${r})">${r}</button>`; }
  });
  pager.innerHTML = html;
}

function gamesGoPage(n) {
  gamesState.page = n;
  window.scrollTo({ top: 0, behavior: 'smooth' });
  loadGames();
}
function resetGames() {
  gamesState = { q:'', sort:'popular', page:1, cat:'' };
  el('gamesSearch').value = '';
  el('gamesSort').value = 'popular';
  /* reset chips */
  document.querySelectorAll('#gamesChips .cat-chip').forEach(c => c.classList.remove('on'));
  document.querySelector('#gamesChips .cat-chip')?.classList.add('on');
  loadGames();
}
function onGamesSearch() {
  clearTimeout(gamesSearchTimer);
  gamesSearchTimer = setTimeout(() => {
    gamesState.q = el('gamesSearch')?.value || '';
    gamesState.page = 1;
    loadGames();
  }, 380);
}

async function loadGamesChips() {
  const wrap = el('gamesChips');
  if (!wrap) return;
  try {
    const cats = await API.categories();
    const gameCats = (cats||[]).filter(c => !c.hidden && (c.type==='game'||c.slug==='games'));
    const chips = [{ id:'', title:'Все' }, ...gameCats];
    wrap.innerHTML = chips.map(c =>
      `<div class="cat-chip${c.id===''?' on':''}" onclick="setGamesCat('${c.id}')" data-cat="${c.id}">${esc(c.title)}</div>`
    ).join('');
  } catch {}
}

function setGamesCat(catId) {
  gamesState.cat = catId;
  gamesState.page = 1;
  document.querySelectorAll('#gamesChips .cat-chip').forEach(c =>
    c.classList.toggle('on', c.dataset.cat === catId));
  loadGames();
}

/* ══════════════════════════════════════════════════════════════
   CODES SCREEN — коды пополнения / промокоды магазина
   ══════════════════════════════════════════════════════════════ */
async function loadCodes() {
  const host = el('codesContent');
  const cntEl = el('codesCnt');
  if (!host) return;

  // Skeleton
  host.innerHTML = `<div class="games-grid">${Array(4).fill(`
    <div class="sk-gcard">
      <div class="sk-cover sk" style="height:110px"></div>
      <div class="sk-body"><div class="sk" style="height:10px;width:50%;border-radius:4px"></div>
      <div class="sk" style="height:14px;border-radius:5px"></div>
      <div class="sk" style="height:32px;border-radius:8px;margin-top:6px"></div></div>
    </div>`).join('')}</div>`;

  try {
    const [prodData, cats] = await Promise.all([
      API.products({ type: 'code', sort: 'popular', limit: 200 }),
      API.categories().catch(() => []),
    ]);
    const items = prodData.items || [];
    if (cntEl) cntEl.textContent = `${items.length.toLocaleString('ru-RU')} ${plural(items.length,'код','кода','кодов')}`;

    if (!items.length) {
      host.innerHTML = `<div class="empty"><div class="empty-ico">💳</div><div class="empty-h">Пока нет кодов</div>
        <div class="empty-p">Коды пополнения появятся здесь</div></div>`;
      return;
    }

    // Группируем по категориям, если они заданы (сохраняем структуру магазина)
    const catTitle = {};
    (cats || []).forEach(c => { catTitle[c.id] = c.title; });
    const groups = new Map();
    items.forEach(p => {
      const key = p.categoryId != null && catTitle[p.categoryId] ? p.categoryId : '__other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    });

    // Один общий заголовок не нужен, если категория единственная
    const multi = groups.size > 1;
    let html = '';
    for (const [key, list] of groups) {
      if (multi) {
        const title = key === '__other' ? 'Прочее' : catTitle[key];
        html += `<div class="catalog-meta" style="margin-top:var(--sp3)"><span class="catalog-count">${esc(title)}</span></div>`;
      }
      html += `<div class="games-grid">${list.map(gameCard).join('')}</div>`;
    }
    host.innerHTML = html;
  } catch (e) {
    console.error(e);
    host.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><div class="empty-h">Ошибка</div>
      <button class="empty-btn" onclick="loadCodes()">Повторить</button></div>`;
  }
}

/* ══════════════════════════════════════════════════════════════
   PRODUCT MODAL
   ══════════════════════════════════════════════════════════════ */
let modalProduct = null;
let modalPeriod  = 1;

async function openProduct(id) {
  const modal = el('pModal');
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  // Reset
  el('pmHero').innerHTML = '<div style="font-size:56px">⏳</div>';
  el('pmTitle').textContent = ''; el('pmEdition').textContent = '';
  el('pmSeg').innerHTML = ''; el('pmPrice').textContent = '';
  el('pmOld').textContent = ''; el('pmDisc').innerHTML = '';
  el('pmStock').innerHTML = ''; el('pmFeatWrap').innerHTML = '';
  el('pmDesc').textContent = '';
  el('pmSpecWrap').innerHTML = '';
  el('pmBuy').textContent = 'В корзину';

  // Back + Wish buttons
  const existBack = modal.querySelector('.modal-back');
  if (!existBack) {
    const bb = document.createElement('button');
    bb.className = 'modal-back';
    bb.setAttribute('aria-label','Назад');
    bb.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>';
    bb.onclick = closeModal;
    el('pmHero').appendChild(bb);
  }
  const existWish = modal.querySelector('.modal-wish');
  if (!existWish) {
    const wb = document.createElement('button');
    wb.id = 'pmWishBtn'; wb.className = 'modal-wish'; wb.setAttribute('aria-label','Избранное');
    wb.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    wb.onclick = () => toggleWish(id);
    el('pmHero').appendChild(wb);
  }

  try {
    const p = await API.product(id);
    _pCache[id] = p;               // синхронизируем цену корзины с карточкой товара
    modalProduct = p; modalPeriod = 1;
    renderModal(p);
  } catch (e) {
    el('pmTitle').textContent = 'Ошибка загрузки';
  }
}

function renderModal(p) {
  let heroHTML = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">`
    : `<div class="modal-art-emoji">${esc(p.emoji||'🎮')}</div>`;
  heroHTML += '<div class="modal-art-fade"></div>';
  heroHTML += `<button class="modal-close" onclick="closeModal()">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
  </button>`;
  const inWish = wishlist.includes(p.id);
  heroHTML += `<button id="pmWishBtn" class="modal-wish-btn${inWish?' active':''}" onclick="toggleWish(${p.id})">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="${inWish?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
  </button>`;
  el('pmHero').innerHTML = heroHTML;

  el('pmPlat').textContent = p.platform || '';
  el('pmTitle').textContent = p.name;
  el('pmEdition').textContent = (p.edition && p.edition !== 'Standard') ? p.edition : '';

  const periods = p.meta?.periods || {};
  if (p.type === 'sub' && Object.keys(periods).length > 0) {
    const LABELS = { 1:'1 месяц', 3:'3 месяца', 12:'12 месяцев' };
    el('pmSeg').innerHTML = Object.entries(periods).map(([mo]) =>
      `<button class="period-btn${+mo===modalPeriod?' on':''}" onclick="setPeriod(${mo})">${LABELS[mo]||mo+' мес.'}</button>`
    ).join('');
  } else { el('pmSeg').innerHTML = ''; }

  updateModalPrice(p);

  const stk = el('pmStock');
  if (p.inStock) {
    stk.className = 'modal-stock in-stock';
    stk.innerHTML = '<div class="stock-dot"></div> В наличии';
  } else {
    stk.className = 'modal-stock out-stock';
    stk.innerHTML = '<div class="stock-dot" style="background:var(--tx4)"></div> Нет в наличии';
  }
  el('pmBuy').disabled = !p.inStock;

  const meta = p.meta || {};
  const feats = meta.features || [];
  el('pmFeatWrap').innerHTML = feats.length
    ? `<div class="modal-section">Включено</div><div class="modal-features">${feats.map(f =>
        `<div class="modal-feat"><div class="mf-dot"></div><div class="mf-text">${esc(f)}</div></div>`).join('')}</div>`
    : '';

  if (p.description) { el('pmDesc').textContent = p.description; el('pmDesc').style.display='block'; }
  else { el('pmDesc').style.display='none'; }

  // Бонусный инфо-блок (только для платных товаров)
  const bonusEl = el('pmBonusInfo');
  if (bonusEl) {
    bonusEl.innerHTML = (p.price > 0)
      ? '<div class="bonus-note"><div class="bonus-note-ico">🎁</div>' +
        '<div class="bonus-note-txt">За покупку данного товара вы получите ' +
        '<b>30% от стоимости</b> в виде бонусов. Их можно потратить в разделе ' +
        '«Бонусы» на открытие кейса или приобретение бонусных товаров.</div></div>'
      : '';
  }

  // Способ получения товара — единый блок для всех игр и подписок
  const delivEl = el('pmDeliv');
  if (delivEl) {
    delivEl.innerHTML =
      '<div class="modal-section">Способ получения товара</div>' +
      '<div class="modal-about">После успешной оплаты вы выбираете платформу, ' +
      'после чего автоматически переходите в чат с нашим менеджером. ' +
      'Менеджер выполнит вход в аккаунт и произведет покупку выбранной игры или подписки.</div>';
  }

  const specMap = [['size','Размер'],['rating','Возраст'],['lang','Язык'],['players','Игроки'],['release','Релиз']];
  const specRows = specMap.filter(([k]) => meta[k]).map(([k,l]) =>
    `<div class="spec-row"><span class="spec-key">${l}</span><span class="spec-val">${esc(meta[k])}</span></div>`).join('');
  el('pmSpecWrap').innerHTML = specRows
    ? `<div class="modal-section">Характеристики</div><div class="modal-specs">${specRows}</div>` : '';
}

function updateModalPrice(p) {
  const periods = p.meta?.periods || {};
  const price = (p.type === 'sub' && Object.keys(periods).length > 0)
    ? (periods[modalPeriod] ?? p.price) : p.price;

  el('pmPrice').textContent = price === 0 ? 'Бесплатно' : fmt(price);
  if (p.oldPrice && p.oldPrice > price) {
    el('pmOld').textContent = fmt(p.oldPrice);
    const d = discPct(price, p.oldPrice);
    el('pmDisc').innerHTML = d ? `<div class="modal-disc">−${d}%</div>` : '';
  } else {
    el('pmOld').textContent = '';
    el('pmDisc').innerHTML = '';
  }
  el('pmBuy').textContent = price > 0 ? `Оформить — ${fmt(price)}` : 'Оформить';

  // TRY price meta
  const metaEl = el('pmPriceMeta');
  if (metaEl) {
    const parts = [];
    if (p.originalPriceTRY > 0) {
      parts.push(`<span class="pm-try">₺ ${p.originalPriceTRY.toLocaleString('ru')} TRY × ${p.exchangeMultiplier}</span>`);
    }
    if (p.lastPriceUpdate) {
      const d = new Date(p.lastPriceUpdate);
      parts.push(`<span class="pm-updated">Обновлено ${d.toLocaleDateString('ru-RU')}</span>`);
    }
    metaEl.innerHTML = parts.join('');
  }
}

function setPeriod(mo) {
  modalPeriod = +mo;
  document.querySelectorAll('#pmSeg .seg-btn').forEach(b =>
    b.classList.toggle('on', +b.textContent.trim().startsWith(mo)?true:false));
  document.querySelectorAll('#pmSeg .seg-btn').forEach((b,_,arr) => {
    const labels={1:'1 месяц',3:'3 месяца',12:'12 месяцев'};
    b.classList.toggle('on', b.textContent.trim()===labels[mo]);
  });
  if (modalProduct) updateModalPrice(modalProduct);
}

function closeModal() {
  el('pModal')?.classList.remove('open');
  document.body.style.overflow = '';
}

function toggleWish(id) {
  const idx = wishlist.indexOf(id);
  if (idx >= 0) { wishlist.splice(idx,1); toast('Убрано из избранного'); }
  else { wishlist.push(id); toast('Добавлено в избранное ♡'); }
  saveWish(); updateBadges();
  const btn = el('pmWishBtn');
  if (btn) {
    const inWish = wishlist.includes(id);
    btn.classList.toggle('active', inWish);
    btn.querySelector('svg')?.setAttribute('fill', inWish ? 'currentColor' : 'none');
  }
}

function buyFromModal() {
  if (!modalProduct) return;
  const p = modalProduct;
  const period = p.type === 'sub' ? modalPeriod : null;

  // Добавляем в корзину
  const already = cart.some(i => i.id === p.id && i.period === period);
  if (already) {
    closeModal();
    go('#/cart');
    return;
  }
  cart.push({ id: p.id, ...(period ? { period } : {}) });
  saveCart(); updateBadges();
  closeModal();
  toast('Добавлено в корзину');
}

function quickAdd(id, btn) {
  // Добавляем в корзину (форма открывается только при нажатии "Оформить заказ")
  const already = cart.some(i => i.id === id);
  if (already) {
    go('#/cart');
    return;
  }
  cart.push({ id });
  saveCart(); updateBadges();
  toast('Добавлено в корзину');
  if (btn) {
    btn.textContent = '✓ В корзине';
    btn.classList.add('added');
    setTimeout(() => {
      btn.textContent = '+ В корзину';
      btn.classList.remove('added');
    }, 1800);
  }
}

/* ══════════════════════════════════════════════════════════════
   WISH + CART SCREENS
   ══════════════════════════════════════════════════════════════ */
/* ── Product cache (server-backed, falls back to seed) ──────── */
const _pCache = {};

async function productInfo(id) {
  if (_pCache[id]) return _pCache[id];
  // Сначала берём АКТУАЛЬНЫЕ данные с сервера (цена из БД, как в карточке товара).
  // Раньше здесь первым читался офлайн-снапшот SEED со старыми ценами — из-за этого
  // в корзине цена отличалась от цены в карточке. Теперь SEED — только офлайн-фолбэк.
  try {
    const p = await API.product(id);
    if (p) { _pCache[id] = p; return p; }
  } catch {}
  // Офлайн-фолбэк — снапшот витрины (может содержать устаревшие цены)
  const fromSeed = (window.SEED?.products || []).find(p => p.id === id);
  if (fromSeed) return fromSeed;
  return { id, name: 'Товар #' + id, price: 0, emoji: '📦', platform: '', meta: {} };
}

function productInfoSync(id) {
  // Synchronous — from cache or seed only
  if (_pCache[id]) return _pCache[id];
  const fromSeed = (window.SEED?.products || []).find(p => p.id === id);
  if (fromSeed) return fromSeed;
  return { id, name: 'Товар #' + id, price: 0, emoji: '📦', platform: '', meta: {} };
}

function renderWish() {
  const host = el('wishContent');
  if (!host) return;
  if (!wishlist.length) {
    host.innerHTML = `<div class="empty"><div class="empty-ico">♡</div><div class="empty-h">Избранное пусто</div><div class="empty-p">Добавляйте товары с помощью значка сердца</div></div>`;
    return;
  }
  host.innerHTML = wishlist.map(id => {
    const p = productInfo(id);
    return `<div class="litem">
      <div class="li-cov" onclick="openProduct(${id})">${p.image?`<img src="${esc(p.image)}" alt="">`:(p.emoji||'📦')}</div>
      <div class="li-inf" onclick="openProduct(${id})">
        <div class="li-name">${esc(p.name)}</div>
        <div class="li-meta">${esc(p.platform||p.type||'')}</div>
        <div class="li-price">${fmt(p.price)}</div>
      </div>
      <div class="rb rb-add" onclick="wishToCart(${id})" title="В корзину">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      </div>
      <div class="rb rb-del" onclick="removeWish(${id})" title="Убрать">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </div>
    </div>`;
  }).join('');
}

function removeWish(id) {
  wishlist = wishlist.filter(i=>i!==id);
  saveWish(); updateBadges(); renderWish();
  toast('Убрано из избранного');
}
function wishToCart(id) {
  if (!cart.some(i=>i.id===id)) { cart.push({id}); saveCart(); updateBadges(); }
  toast('Добавлено в корзину 🛒');
}

async function renderCart() {
  const host = el('cartContent');
  if (!host) return;
  if (!cart.length) {
    host.innerHTML = `<div class="empty-state">
      <div class="empty-icon">🛒</div>
      <div class="empty-h">Корзина пуста</div>
      <div class="empty-p">Добавьте игры или подписки из каталога</div>
      <button class="empty-btn" onclick="go('#/games')">Перейти в каталог</button>
    </div>`;
    return;
  }
  host.innerHTML = `<div style="color:var(--tx4);font-size:12px;padding:12px 0">Загрузка…</div>`;

  const products = await Promise.all(cart.map(ci => productInfo(ci.id)));
  const PERIOD_L = {1:'1 месяц',3:'3 месяца',12:'12 месяцев'};

  let total = 0, saved = 0;
  const items = cart.map((ci, i) => {
    const p = products[i] || { id: ci.id, name: 'Товар #'+ci.id, price: 0, emoji:'📦', platform:'', meta:{} };
    const periods = p.meta?.periods || {};
    const price = (ci.period && periods[ci.period]) ? periods[ci.period] : (p.price || 0);
    if (p.oldPrice && p.oldPrice > price) saved += (p.oldPrice - price);
    total += price;
    const meta = ci.period ? (PERIOD_L[ci.period] || ci.period + ' мес.') : (p.platform || p.edition || '');
    return { p, price, meta };
  });

  host.innerHTML = `
    <div class="cart-block">
      ${items.map(({ p, price, meta }, i) => `
        <div class="cart-item">
          <div class="cart-art" onclick="openProduct(${p.id})">
            ${p.image ? `<img src="${esc(p.image)}" alt="">` : (p.emoji || '📦')}
          </div>
          <div class="cart-info" onclick="openProduct(${p.id})">
            <div class="cart-name">${esc(p.name || 'Товар #' + p.id)}</div>
            ${meta ? `<div class="cart-meta">${esc(meta)}</div>` : ''}
            <span class="cart-price">${price > 0 ? fmt(price) : 'Бесплатно'}</span>
            ${p.oldPrice && p.oldPrice > price ? `<span class="cart-old">${fmt(p.oldPrice)}</span>` : ''}
          </div>
          <button class="cart-remove" onclick="event.stopPropagation();removeCart(${i})" title="Удалить">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" pointer-events="none"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </div>`).join('')}
      <div class="cart-summary">
        <div class="sum-row"><span>Товаров</span><b>${cart.length}</b></div>
        ${saved > 0 ? `<div class="sum-row"><span>Экономия</span><b style="color:var(--green)">−${fmt(saved)}</b></div>` : ''}
        <div class="sum-total">
          <span class="sum-total-label">Итого</span>
          <span class="sum-total-value">${fmt(total)}</span>
        </div>
        <button class="btn-full" onclick="checkout()">Оформить заказ</button>
      </div>
    </div>`;
}

function removeCart(index) {
  index = +index;
  if (!Number.isInteger(index) || index < 0 || index >= cart.length) return;
  cart.splice(index, 1);
  saveCart(); updateBadges(); renderCart();
}

/* ══════════════════════════════════════════════════════════════
   CHECKOUT FORM — сбор данных клиента перед оплатой
   ══════════════════════════════════════════════════════════════ */

// Текущий товар в процессе оформления
let _checkoutItem = null;
// Заказ и колбэк завершения для табло сбора данных (после оплаты / для бесплатных)
let _infoOrder  = null;
let _infoOnDone = null;

/**
 * Старт оформления: создаём заказ БЕЗ персональных данных и ведём к оплате.
 * Данные клиента (Telegram, аккаунт и т.д.) собираются ПОСЛЕ оплаты — см. infoFormHtml.
 * @param {object} item — { name, price, emoji, platform, type, productId?, period?, _fromCart? }
 */
async function startOrder(item) {
  _checkoutItem = item;
  const amount = Math.round(item.price || 0);
  const orderData = {
    productName: item.name || '',
    productId:   item.productId || null,
    amount,
    meta: {
      period:   item.period   || null,
      platform: item.platform || '',
      type:     item.type     || 'game',
    },
  };

  let order;
  try {
    if (!API.isOffline()) {
      order = await API.createOrder(orderData);
    } else {
      order = { id: 'LOCAL-' + Date.now(), ...orderData, status: 'pending', createdAt: new Date().toISOString() };
    }
  } catch (err) {
    console.error('Order error:', err);
    toast('Ошибка создания заказа: ' + err.message, 'err');
    return;
  }

  if (item._fromCart) { cart = []; saveCart(); updateBadges(); }

  if (!API.isOffline() && amount > 0) {
    // Платный заказ — на экран оплаты. Табло с данными покажем после успешной оплаты.
    go('#/pay/' + order.id);
  } else {
    // Бесплатно или офлайн — оплаты нет, сразу собираем данные клиента.
    openInfoSheet(order);
  }
}

// Совместимость со старыми вызовами (корзина / кнопка GTA6 и т.п.)
function openCheckout(item)       { startOrder(item); }
function openCheckoutDirect(item) { startOrder(item); }

function closeCheckout(e) {
  if (e && e.target !== el('checkoutOverlay')) return;
  _forceCloseCheckout();
}
function _forceCloseCheckout() {
  el('checkoutOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

/* ── Табло сбора данных клиента (после оплаты или для бесплатных заказов) ── */

// Уже ли заполнены данные для выполнения заказа
function _orderHasInfo(order) {
  return !!(order && order.telegram && (order.psnId || order.meta?.accLogin));
}

// HTML табло запроса данных. Telegram-ник подставляется автоматически (Telegram WebApp).
function infoFormHtml(order) {
  const tgUser   = window.Telegram?.WebApp?.initDataUnsafe?.user;
  const tgHandle = tgUser?.username ? '@' + tgUser.username : '';
  return `
    <div class="sheet-title">Оплачено ✅ Заполните данные</div>
    <div class="sheet-sub">Эта информация нужна, чтобы выполнить ваш заказ</div>
    <div class="order-id-badge" style="margin:10px 0 18px">${esc(order.id)}</div>

    <form id="infoForm" onsubmit="return false">

      <div class="form-group" id="if-telegram">
        <label class="form-label">Telegram для связи<span class="req">*</span></label>
        <input class="form-input" id="if-tg" type="text"
               placeholder="@username" value="${esc(tgHandle)}" autocomplete="off">
        <div class="form-err">Укажите ваш Telegram для связи</div>
      </div>

      <div class="form-group" id="if-accLogin">
        <label class="form-label">Данные об аккаунте PlayStation<span class="req">*</span></label>
        <input class="form-input" id="if-acc" type="text"
               placeholder="Логин / почта аккаунта PSN" autocomplete="off">
        <div class="form-err">Укажите данные аккаунта</div>
      </div>

      <div class="form-group" id="if-accPass">
        <label class="form-label">Пароль от аккаунта<span class="req">*</span></label>
        <input class="form-input" id="if-pass" type="password"
               placeholder="Пароль от PlayStation аккаунта" autocomplete="off">
        <div class="form-err">Укажите пароль от аккаунта</div>
      </div>

      <div class="form-group">
        <label class="form-label">Email <span style="color:var(--t4)">(необязательно)</span></label>
        <input class="form-input" id="if-email" type="email"
               placeholder="your@email.com" autocomplete="email">
      </div>

      <div class="form-group">
        <label class="form-label">Комментарий</label>
        <textarea class="form-textarea" id="if-comment"
                  placeholder="Пожелания или уточнения…"></textarea>
      </div>

      <button class="submit-btn" id="infoSubmitBtn" onclick="sendOrderInfo()">
        <div class="submit-spin"></div>
        <span class="submit-text">Отправить данные</span>
      </button>
    </form>`;
}

// Открыть табло как нижний лист (для бесплатных/офлайн заказов — без экрана оплаты)
function openInfoSheet(order) {
  const overlay = el('checkoutOverlay');
  const host = el('checkoutContent');
  if (!overlay || !host) return;
  _infoOrder  = order;
  _infoOnDone = (o) => renderInfoSuccess(host, o);
  host.innerHTML = infoFormHtml(order);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

// Отправка данных клиента на сервер
async function sendOrderInfo() {
  const order = _infoOrder;
  if (!order) return;

  let valid = true;
  const check = (inputId, ffId, validator) => {
    const val = el(inputId)?.value?.trim() || '';
    const okv = val && (!validator || validator(val));
    el(ffId)?.classList.toggle('has-err', !okv);
    if (!okv) valid = false;
    return val;
  };
  const telegram = check('if-tg',  'if-telegram', v => /^@?[A-Za-z0-9_]{3,}$/.test(v) || /^https?:\/\//i.test(v));
  const accLogin = check('if-acc', 'if-accLogin');
  const accPass  = check('if-pass','if-accPass');
  const email    = el('if-email')?.value?.trim()   || '';
  const comment  = el('if-comment')?.value?.trim() || '';
  if (!valid) { toast('Заполните обязательные поля', 'err'); return; }

  const btn = el('infoSubmitBtn');
  btn?.classList.add('loading'); if (btn) btn.disabled = true;

  const data = { telegram, accLogin, accPass, email, comment, meta: { accLogin, accPass } };

  // Дублируем в Telegram WebApp (если открыто внутри бота)
  try {
    if (window.Telegram?.WebApp?.sendData) {
      Telegram.WebApp.sendData(JSON.stringify({ type: 'order_info', orderId: order.id, telegram, accLogin }));
    }
  } catch {}

  try {
    let updated = order;
    if (!API.isOffline()) updated = await API.submitOrderInfo(order.id, data);
    (_infoOnDone || (() => {}))(updated);
  } catch (e) {
    btn?.classList.remove('loading'); if (btn) btn.disabled = false;
    toast('Не удалось отправить данные: ' + e.message, 'err');
  }
}

function renderInfoSuccess(host, order) {
  renderMessengerHandoff(host, order, 'sheet');
}

/* ══════════════════════════════════════════════════════════════
   ПЕРЕДАЧА ДАННЫХ МЕНЕДЖЕРУ ЧЕРЕЗ МЕССЕНДЖЕР (prefill готового текста)
   Текст формируется автоматически из полей заказа и подставляется
   в чат мессенджера. Ссылки берутся из настроек админ-панели.
   ══════════════════════════════════════════════════════════════ */
let _appSettings = null;        // кэш публичных настроек
let _msgrUrls = {};             // готовые ссылки с подставленным текстом
let _lastOrderMessage = '';     // последний сформированный текст (для копирования)

async function loadAppSettings(force) {
  if (_appSettings && !force) return _appSettings;
  try { _appSettings = await API.settings(); }
  catch { _appSettings = (window.SEED && window.SEED.settings) || {}; }
  return _appSettings || {};
}

// Собираем готовое сообщение из всех данных заказа.
function buildOrderMessage(o) {
  const m = o.meta || {};
  const lines = [
    'Здравствуйте!',
    '',
    'Я оформил заказ.',
    '',
    'Номер заказа: #' + o.id,
    'Товар: ' + (o.productName || '—'),
  ];
  if (o.amount) lines.push('Сумма: ' + fmt(o.amount));
  lines.push('', 'Данные для выполнения:');
  if (o.telegram) lines.push('Telegram: ' + o.telegram);
  const login = m.accLogin || o.psnId;
  if (login) lines.push('Логин / аккаунт: ' + login);
  if (m.accPass) lines.push('Пароль: ' + m.accPass);
  if (o.email || m.email) lines.push('Email: ' + (o.email || m.email));
  if (m.platform) lines.push('Платформа: ' + m.platform);
  if (o.comment) lines.push('', 'Комментарий: ' + o.comment);
  lines.push('', 'Спасибо!');
  return lines.join('\n');
}

// Подставляем закодированный текст в ссылку чата (поддержка t.me / wa.me / max и ?text=).
function msgrWithText(url, text) {
  if (!url) return '';
  const enc = encodeURIComponent(text);
  if (/[?&]text=$/.test(url)) return url + enc;   // ...?text=  → дописываем текст
  if (/[?&]text=/.test(url))  return url;          // текст уже задан вручную
  return url + (url.includes('?') ? '&' : '?') + 'text=' + enc;
}

const _MSGR_DEFS = [
  ['tg', 'Telegram', 'msgr-tg',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.78 18.65l.28-4.23 7.68-6.92c.34-.31-.07-.46-.52-.19L7.74 13.3 3.64 12c-.88-.25-.89-.86.2-1.3l15.97-6.16c.73-.27 1.43.18 1.15 1.3l-2.72 12.81c-.19.91-.74 1.13-1.5.71L12.6 16.3l-1.99 1.93c-.23.23-.42.42-.83.42z"/></svg>'],
  ['max', 'MAX', 'msgr-max', ''],
  ['wa', 'WhatsApp', 'msgr-wa',
    '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.05 4.91A9.82 9.82 0 0 0 12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.73 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01zm-2.49 8.98c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.04-.38-1.99-1.22-.74-.65-1.23-1.46-1.38-1.71-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.42h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.17 1.76 2.7 4.27 3.78.6.26 1.06.41 1.42.53.6.19 1.14.16 1.57.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29z"/></svg>'],
];

// Рендер финального экрана с кнопками мессенджеров (ctx: 'sheet' | 'pay').
async function renderMessengerHandoff(host, order, ctx) {
  if (!host) return;
  const text = buildOrderMessage(order);
  _lastOrderMessage = text;

  const cfg = (await loadAppSettings()).messengers || {};
  _msgrUrls = {
    tg:  msgrWithText(cfg.tg,  text),
    max: msgrWithText(cfg.max, text),
    wa:  msgrWithText(cfg.wa,  text),
  };

  const btns = _MSGR_DEFS
    .filter(d => _msgrUrls[d[0]])
    .map(([k, label, cls, svg]) =>
      `<button class="msgr-btn ${cls}" onclick="openMessenger('${k}')">${svg}<span>${esc(label)}</span></button>`)
    .join('');

  const homeAction = ctx === 'sheet' ? "_forceCloseCheckout();go('#/')" : "go('#/')";

  host.innerHTML = `
    <div class="order-success msgr-handoff">
      <div class="order-success-ico">✅</div>
      <div class="order-success-ttl">Заказ оформлен</div>
      <div class="order-success-sub">
        Заказ <b>#${esc(order.id)}</b> принят в работу.<br>
        Отправьте данные менеджеру — сообщение уже готово.
      </div>
      ${btns
        ? `<div class="msgr-hint">Выберите мессенджер. Если текст не появится в чате — нажмите «Скопировать сообщение».</div>
           <div class="msgr-btns">${btns}</div>`
        : `<div class="msgr-hint">Скопируйте сообщение и отправьте его менеджеру удобным способом.</div>`}
      <button class="msgr-copy" onclick="copyOrderMessage(this)">Скопировать сообщение</button>
      <button class="submit-btn msgr-home" style="margin-top:14px" onclick="${homeAction}"><span>На главную</span></button>
    </div>`;
}

function openMessenger(key) {
  const url = _msgrUrls[key];
  if (!url) return;
  // Подстраховка: всегда кладём текст в буфер (на случай, если prefill не сработает).
  try { _copyMsgrText(_lastOrderMessage); } catch {}
  const tg = window.Telegram && window.Telegram.WebApp;
  if (key === 'tg' && tg && tg.openTelegramLink) tg.openTelegramLink(url);
  else if (tg && tg.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
  if (key === 'max') toast('Текст скопирован — вставьте в чат МАХ');
}

function copyOrderMessage(btn) {
  _copyMsgrText(_lastOrderMessage);
  if (btn) {
    const t = btn.textContent;
    btn.textContent = 'Скопировано ✓';
    setTimeout(() => { btn.textContent = t; }, 1800);
  }
}

function _copyMsgrText(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).catch(() => fallbackCopy(text));
  } else { fallbackCopy(text); }
}

/* ── Checkout из корзины ─────────────────────────────────────── */
async function checkout() {
  if (!cart.length) { toast('Корзина пуста', 'err'); return; }

  // Загружаем все товары корзины асинхронно
  const products = await Promise.all(cart.map(ci => productInfo(ci.id)));
  const PERIOD_L = {1:'1 мес.',3:'3 мес.',12:'12 мес.'};

  const items = cart.map((ci, i) => {
    const p = products[i] || { id: ci.id, name: 'Товар #'+ci.id, price: 0, emoji:'🛒', platform:'', meta:{} };
    const periods = p.meta?.periods || {};
    const price = (ci.period && periods[ci.period]) ? periods[ci.period] : (p.price || 0);
    return { ...p, price, period: ci.period || null };
  });

  const total = items.reduce((s, i) => s + i.price, 0);
  const names = items.map(i => i.name + (i.period ? ` (${PERIOD_L[i.period]||i.period+' мес.'})` : '')).join(', ');

  openCheckout({
    name:      names,
    price:     total,
    emoji:     items[0]?.emoji || '🛒',
    platform:  items.map(i => i.platform).filter(Boolean).join(', '),
    type:      'mixed',
    _fromCart: true,
    productId: items.length === 1 ? items[0].id : null,
  });
}

function clearData() {
  cart = []; wishlist = [];
  saveCart(); saveWish(); updateBadges();
  toast('Данные очищены');
}

/* ══════════════════════════════════════════════════════════════
   ОПЛАТА (ЮKassa)
   Экран #/pay/<orderId>
   ══════════════════════════════════════════════════════════════ */
let _payOrderId = null;
let _payPoll = null;

function _stopPayPoll() { if (_payPoll) { clearInterval(_payPoll); _payPoll = null; } }

async function renderPay(orderId) {
  _stopPayPoll();
  _payOrderId = orderId;
  const host = el('payContent');
  if (!host) return;

  if (!orderId) { _payError('Заказ не указан'); return; }

  if (API.isOffline()) {
    _payError('Оплата недоступна в офлайн-режиме. Запустите сервер.');
    return;
  }

  host.innerHTML = `<div class="pay-state"><div class="pay-spin-lg"></div>
    <div class="pay-state-sub">Загружаем заказ…</div></div>`;

  let order;
  try { order = await API.getOrder(orderId); }
  catch (e) { _payError('Заказ не найден или недоступен'); return; }

  if (order.status === 'paid')      { _paySuccess(order); return; }
  if (order.status === 'cancelled' || order.status === 'refunded') {
    _payError('Заказ отменён. Оформите новый.'); return;
  }

  host.innerHTML = `
    <div class="pay-back" onclick="go('#/')">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
      На главную
    </div>
    <div class="pay-card">
      <div class="pay-tag">Оплата заказа</div>
      <div class="pay-title">${esc(order.productName || 'Заказ')}</div>
      <div class="pay-row"><span class="pay-row-k">Номер заказа</span><span class="pay-id">${esc(order.id)}</span></div>
      ${order.email ? `<div class="pay-row"><span class="pay-row-k">Email</span><span class="pay-row-v">${esc(order.email)}</span></div>` : ''}
      <div class="pay-total">
        <span class="pay-total-k">К оплате</span>
        <span class="pay-total-v">${fmt(order.amount)}</span>
      </div>
    </div>
    <button class="pay-btn" id="payBtn" onclick="startPayment()">
      <div class="spin"></div>
      <span class="pay-btn-text">Оплатить ${fmt(order.amount)}</span>
    </button>
    <div class="pay-secure">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      Безопасная оплата через ЮKassa
    </div>`;

  // Если пользователь вернулся со страницы оплаты — фоном проверяем статус
  _startPayPoll();
}

const _EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Клик «Оплатить» — сначала спрашиваем email для чека (модалка поверх всего)
function startPayment() {
  if (!_payOrderId) return;
  openPayEmailModal();
}

function openPayEmailModal() {
  if (el('payEmailModal')) return;
  if (!el('payEmailStyles')) {
    const st = document.createElement('style');
    st.id = 'payEmailStyles';
    st.textContent = `
      .pem-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(4,2,12,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
      .pem-card{width:100%;max-width:360px;background:var(--s2,#17141f);border:1px solid rgba(255,255,255,.09);border-radius:18px;padding:22px 20px;box-shadow:0 24px 60px rgba(0,0,0,.55);animation:pemIn .18s ease}
      @keyframes pemIn{from{opacity:0;transform:translateY(8px) scale(.98)}to{opacity:1;transform:none}}
      .pem-ttl{font-size:17px;font-weight:700;color:#fff;margin-bottom:6px}
      .pem-sub{font-size:13px;color:rgba(255,255,255,.5);line-height:1.5;margin-bottom:16px}
      .pem-input{width:100%;height:46px;padding:0 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:15px;outline:none;box-sizing:border-box}
      .pem-input:focus{border-color:#6366f1}
      .pem-input.err{border-color:#ff453a}
      .pem-err{display:none;color:#ff453a;font-size:12px;margin-top:7px}
      .pem-btn{width:100%;height:48px;border:none;border-radius:12px;font-size:15px;font-weight:600;cursor:pointer;margin-top:12px}
      .pem-btn.primary{background:#6366f1;color:#fff}
      .pem-btn.primary:active{opacity:.9}
      .pem-btn.ghost{background:transparent;color:rgba(255,255,255,.55)}`;
    document.head.appendChild(st);
  }
  const wrap = document.createElement('div');
  wrap.id = 'payEmailModal';
  wrap.className = 'pem-overlay';
  // фон не кликабельный (нет обработчика закрытия по клику вне карточки)
  wrap.innerHTML = `
    <div class="pem-card" role="dialog" aria-modal="true">
      <div class="pem-ttl">Email для чека</div>
      <div class="pem-sub">Введите email для чека, можно пропустить.</div>
      <input id="payEmailInput" class="pem-input" type="email" inputmode="email" placeholder="email@domain.com" autocomplete="email">
      <div class="pem-err" id="payEmailErr">Введите корректный email (email@domain.com)</div>
      <button class="pem-btn primary" onclick="confirmPayEmail()">Оплатить</button>
      <button class="pem-btn ghost" onclick="skipPayEmail()">Без чека на почту</button>
    </div>`;
  document.body.appendChild(wrap);
  const inp = el('payEmailInput');
  setTimeout(() => inp?.focus(), 50);
  inp?.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmPayEmail(); });
}

function _closePayEmailModal() { el('payEmailModal')?.remove(); }

function confirmPayEmail() {
  const val = (el('payEmailInput')?.value || '').trim();
  if (!_EMAIL_RE.test(val)) {
    const err = el('payEmailErr'); if (err) err.style.display = 'block';
    el('payEmailInput')?.classList.add('err');
    return;
  }
  _closePayEmailModal();
  _doPayment(val);
}

function skipPayEmail() {
  _closePayEmailModal();
  _doPayment('');   // без email → чек уйдёт на почту магазина
}

async function _doPayment(receiptEmail) {
  if (!_payOrderId) return;
  const btn = el('payBtn');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  try {
    const { confirmationUrl } = await API.createPayment(_payOrderId, receiptEmail);
    if (!confirmationUrl) throw new Error('Платёжная система не вернула ссылку');
    _startPayPoll();
    // Открываем страницу оплаты ЮKassa
    if (window.Telegram?.WebApp?.openLink) {
      Telegram.WebApp.openLink(confirmationUrl);
    } else {
      window.location.href = confirmationUrl;
    }
  } catch (e) {
    if (btn) { btn.classList.remove('loading'); btn.disabled = false; }
    toast('Ошибка оплаты: ' + e.message, 'err');
  }
}

function _startPayPoll() {
  _stopPayPoll();
  let tries = 0;
  _payPoll = setInterval(async () => {
    tries++;
    if (tries > 60 || !_payOrderId) { _stopPayPoll(); return; }
    try {
      const s = await API.payStatus(_payOrderId);
      if (s.status === 'paid') {
        _stopPayPoll();
        _paySuccess(s);
        cart = []; saveCart(); updateBadges();
      }
    } catch {}
  }, 3000);
}

async function _paySuccess(order) {
  _stopPayPoll();
  cart = []; saveCart(); updateBadges();

  // Подтягиваем полный заказ (с meta), чтобы понять, заполнены ли данные клиента
  let full = order;
  try { if (!API.isOffline()) full = await API.getOrder(order.id); } catch {}

  // Данные уже заполнены — показываем финальный экран
  if (_orderHasInfo(full)) { _payFinalSuccess(full); return; }

  // Иначе — сразу показываем табло сбора данных прямо на экране оплаты
  const host = el('payContent');
  if (!host) return;
  _infoOrder  = full;
  _infoOnDone = (o) => _payFinalSuccess(o);
  host.innerHTML = `<div class="pay-info">${infoFormHtml(full)}</div>`;
}

function _payFinalSuccess(order) {
  const host = el('payContent');
  if (!host) return;
  renderMessengerHandoff(host, order, 'pay');
}

function _payError(msg) {
  _stopPayPoll();
  const host = el('payContent');
  if (!host) return;
  host.innerHTML = `
    <div class="pay-state">
      <div class="pay-state-ico">⚠️</div>
      <div class="pay-state-ttl">Не удалось открыть оплату</div>
      <div class="pay-state-sub">${esc(msg)}</div>
      <button class="pay-btn" onclick="go('#/')"><span class="pay-btn-text">На главную</span></button>
    </div>`;
}

/* ══════════════════════════════════════════════════════════════
   ROUTING
   ══════════════════════════════════════════════════════════════ */
function go(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

function setNav(name) {
  document.querySelectorAll('.bnav-item').forEach(n =>
    n.classList.toggle('active', n.dataset.nav === name));
}

function showScreen(id, nav) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const s = el('screen-' + id);
  if (s) {
    s.classList.add('active');
    if (id !== 'home') s.scrollTop = 0;
  }
  setNav(nav || id);
  document.body.classList.toggle('not-home', id !== 'home');
}

function route() {
  if (el('pModal')?.classList.contains('open')) { closeModal(); return; }
  const h = location.hash || '#/';
  const parts = h.replace(/^#\//, '').split('/');
  const root = parts[0] || '';

  if (root !== 'pay') _stopPayPoll();

  if (root === 'gta6') {
    showScreen('gta6', 'gta6');
  } else if (root === 'pay') {
    showScreen('pay', 'cart');
    renderPay(parts[1]);
  } else if (root === 'subs') {
    showScreen('subs', 'subs');
    loadSubs();
  } else if (root === 'games') {
    showScreen('games', 'games');
    loadGamesChips();
    loadGames();
  } else if (root === 'codes') {
    showScreen('codes', 'codes');
    loadCodes();
  } else if (root === 'wish') {
    showScreen('wish', 'wish');
    renderWish();
  } else if (root === 'cart') {
    showScreen('cart', 'cart');
    renderCart();
  } else if (root === 'bonus') {
    showScreen('bonus', 'profile');
    renderBonus();
  } else if (root === 'profile') {
    showScreen('profile', 'profile');
    renderProfileOrders();
  } else if (root === 'guarantees') {
    showScreen('guarantees', null);
    renderGuarantees();
  } else if (root === 'reviews') {
    showScreen('reviews', null);
    renderReviews();
  } else {
    showScreen('home', 'home');
  }
}

/* ══════════════════════════════════════════════════════════════
   PROFILE — история покупок
   ══════════════════════════════════════════════════════════════ */
const ORD_STATUS_LABEL = { new:'Новый', pending:'Ожидает оплаты', paid:'Оплачен', processing:'В обработке', done:'Выполнен', delivered:'Выдан', cancelled:'Отменён', refunded:'Возврат' };
const ORD_STATUS_CLASS = { paid:'paid', done:'paid', delivered:'paid', pending:'pending', new:'pending', processing:'pending', cancelled:'cancelled', refunded:'cancelled' };
const PAY_LABEL = { card:'Карта', sbp:'СБП', crypto:'Криптовалюта', balance:'Бонусы', cash:'Наличные', '':'—' };

function ordDateTime(iso) {
  if (!iso) return { d:'—', t:'' };
  const dt = new Date(iso.replace(' ', 'T') + (iso.includes('Z') ? '' : 'Z'));
  if (isNaN(dt)) return { d: iso, t:'' };
  return {
    d: dt.toLocaleDateString('ru-RU', { day:'2-digit', month:'2-digit', year:'numeric' }),
    t: dt.toLocaleTimeString('ru-RU', { hour:'2-digit', minute:'2-digit' }),
  };
}

async function renderProfileOrders() {
  const box = el('profOrders');
  if (!box) return;
  let orders = [];
  try { orders = await API.bonusOrders(); } catch { orders = []; }
  if (!Array.isArray(orders) || !orders.length) {
    box.innerHTML = '<div class="empty-state" style="padding:24px 0"><div class="empty-icon">🧾</div><div class="empty-h">Пока нет покупок</div><div class="empty-p">Здесь появится история ваших заказов.</div></div>';
    return;
  }
  box.innerHTML = orders.map(o => {
    const { d, t } = ordDateTime(o.createdAt);
    const sc = ORD_STATUS_CLASS[o.status] || 'neutral';
    const sl = ORD_STATUS_LABEL[o.status] || o.status || '—';
    const pay = PAY_LABEL[o.payMethod] != null ? PAY_LABEL[o.payMethod] : (o.payMethod || '—');
    const bonus = o.bonusEarned > 0 ? `<span class="ord-bonus">+${fmtBonus(o.bonusEarned)} бонусов</span>` : '';
    const repeat = o.productId ? `<button class="ord-repeat" onclick="repeatOrder('${esc(String(o.productId))}', this)">Повторить заказ</button>` : '';
    return `<div class="ord-card">
      <div class="ord-top">
        <div>
          <div class="ord-name">${esc(o.productName || 'Заказ')}</div>
          <div class="ord-meta">${d} · ${t} · №${esc(String(o.id))}</div>
        </div>
        <div class="ord-amt">${fmtBonus(o.amount)} ₽</div>
      </div>
      <div class="ord-row2">
        <span class="ord-badge ${sc}">${esc(sl)}</span>
        <span class="ord-pay">${esc(pay)}</span>
        ${bonus}
        ${repeat}
      </div>
    </div>`;
  }).join('');
}

async function repeatOrder(productId, btn) {
  const id = isNaN(+productId) ? productId : +productId;
  if (cart.some(i => i.id === id)) { go('#/cart'); return; }
  cart.push({ id });
  saveCart(); updateBadges();
  toast('Добавлено в корзину');
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ В корзине';
    setTimeout(() => { btn.textContent = orig; }, 1600);
  }
}

/* ══════════════════════════════════════════════════════════════
   ГАРАНТИИ — видеоотзывы
   ══════════════════════════════════════════════════════════════ */
async function renderGuarantees() {
  const sec = el('grtVidsSec'); const box = el('grtVids');
  if (!box) return;
  let vids = [];
  try { vids = await API.videos(); } catch { vids = []; }
  vids = (vids || []).filter(v => v.url);
  if (!vids.length) { if (sec) sec.style.display = 'none'; return; }
  if (sec) sec.style.display = '';
  box.innerHTML = vids.map(v => `
    <div class="grt-vid">
      <video src="${esc(v.url)}" preload="metadata" playsinline webkit-playsinline ${v.title ? `aria-label="${esc(v.title)}"` : ''}></video>
      <div class="grt-play" onclick="playGrtVideo(this)">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
      </div>
    </div>`).join('');
}

function playGrtVideo(overlay) {
  const vid = overlay.previousElementSibling;
  if (!vid) return;
  // pause any other playing videos
  document.querySelectorAll('#grtVids video').forEach(v => { if (v !== vid) { v.pause(); } });
  vid.setAttribute('controls', '');
  overlay.style.display = 'none';
  vid.play().catch(() => {});
  vid.onpause = () => { if (vid.currentTime === 0 || vid.ended) overlay.style.display = 'flex'; };
  vid.onended = () => { overlay.style.display = 'flex'; vid.currentTime = 0; };
}

/* ══════════════════════════════════════════════════════════════
   ОТЗЫВЫ — reels (видео) + текстовые отзывы
   ══════════════════════════════════════════════════════════════ */
const MUTE_ON  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>';
const MUTE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>';
let _reelObserver = null;

async function renderReviews() {
  // 1) Reels — видеоотзывы
  const reels = el('reelsBox');
  if (reels) {
    let vids = [];
    try { vids = await API.videos(); } catch { vids = []; }
    vids = (vids || []).filter(v => v.url);
    if (!vids.length) {
      reels.innerHTML = '<div class="reels-empty">Видеоотзывы скоро появятся</div>';
    } else {
      reels.innerHTML = vids.map(v => `
        <div class="reel paused">
          <video src="${esc(v.url)}" muted loop playsinline webkit-playsinline preload="metadata"></video>
          <div class="reel-tap" onclick="toggleReel(this)"></div>
          <div class="reel-play"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></div>
          <button class="reel-mute" onclick="toggleReelMute(this,event)">${MUTE_ON}</button>
          ${v.title ? `<div class="reel-cap">${esc(v.title)}</div>` : ''}
        </div>`).join('');
      setupReelAutoplay(reels);
    }
  }
  // 2) Текстовые отзывы
  const list = el('trevList');
  if (list) {
    let revs = [];
    try { revs = await API.textReviews(); } catch { revs = []; }
    if (!revs || !revs.length) {
      list.innerHTML = '<div class="reels-empty">Отзывов пока нет</div>';
    } else {
      list.innerHTML = revs.map(r => {
        const rating = Math.min(5, Math.max(1, r.rating || 5));
        const stars = '★'.repeat(rating) + '☆'.repeat(5 - rating);
        const name = (r.author || 'Покупатель').trim();
        const initial = name.charAt(0).toUpperCase() || '🙂';
        return `<div class="trev-card">
          <div class="trev-top">
            <div class="trev-ava">${esc(initial)}</div>
            <div>
              <div class="trev-name">${esc(name)}</div>
              <div class="trev-stars">${stars}</div>
            </div>
          </div>
          <div class="trev-text">${esc(r.text || '')}</div>
        </div>`;
      }).join('');
    }
  }
}

function setupReelAutoplay(box) {
  if (_reelObserver) { _reelObserver.disconnect(); _reelObserver = null; }
  if (!('IntersectionObserver' in window)) return;
  _reelObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      const reel = entry.target;
      const vid = reel.querySelector('video');
      if (!vid) return;
      if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
        vid.play().then(() => reel.classList.remove('paused')).catch(() => {});
      } else {
        vid.pause();
      }
    });
  }, { threshold: [0, 0.6, 1] });
  box.querySelectorAll('.reel').forEach(r => _reelObserver.observe(r));
}

function toggleReel(tap) {
  const reel = tap.closest('.reel'); if (!reel) return;
  const vid = reel.querySelector('video'); if (!vid) return;
  if (vid.paused) { vid.play().then(() => reel.classList.remove('paused')).catch(() => {}); }
  else { vid.pause(); reel.classList.add('paused'); }
}

function toggleReelMute(btn, e) {
  if (e) e.stopPropagation();
  const reel = btn.closest('.reel'); if (!reel) return;
  const vid = reel.querySelector('video'); if (!vid) return;
  vid.muted = !vid.muted;
  btn.innerHTML = vid.muted ? MUTE_ON : MUTE_OFF;
  if (vid.paused) { vid.play().then(() => reel.classList.remove('paused')).catch(() => {}); }
}

window.addEventListener('hashchange', route);
window.addEventListener('popstate', () => {
  if (el('pModal')?.classList.contains('open')) closeModal();
});

/* ══════════════════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════════════════ */
async function init() {
  const saved = localStorage.getItem('logovo_theme');
  const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  applyTheme(saved || sys);

  if (window.Telegram?.WebApp) {
    try { Telegram.WebApp.ready(); Telegram.WebApp.expand(); } catch {}
    const u = Telegram.WebApp.initDataUnsafe?.user;
    if (u) {
      const name = [u.first_name, u.last_name].filter(Boolean).join(' ') || 'Пользователь';
      if (el('profName'))   el('profName').textContent   = name;
      if (el('profHandle')) el('profHandle').textContent = u.username ? '@'+u.username : 'ID: '+u.id;
      if (el('profAva'))    el('profAva').textContent    = (u.first_name||'U')[0].toUpperCase();
    }
  }

  updateBadges();
  route();
}

init();

// Открыть товар «Подписка Deluxe» (кнопка на главной).
// Ищем подписку с tier='deluxe' и открываем её карточку.
async function openDeluxe() {
  try {
    const data = await API.products({ type: 'sub', limit: 50 });
    const subs = data.items || [];
    const deluxe = subs.find(s => (s.meta?.tier === 'deluxe'))
                || subs.find(s => /deluxe/i.test(s.name || ''));
    if (deluxe) { openProduct(deluxe.id); return; }
  } catch (e) { /* offline / ошибка — просто откроем раздел подписок */ }
  go('#/subs');
}

/* ── Смена региона (каждый регион — отдельный магазин) ── */
const REGION_INFO = {
  tr: { flag: '🇹🇷', name: 'Турция' },
  in: { flag: '🇮🇳', name: 'Индия'  },
};

function initRegionUI() {
  const cur = (window.API && API.getRegion) ? API.getRegion() : 'tr';
  const info = REGION_INFO[cur] || REGION_INFO.tr;
  const fl = el('regionFlag'), nm = el('regionName');
  if (fl) fl.textContent = info.flag;
  if (nm) nm.textContent = info.name;
  document.querySelectorAll('.region-opt').forEach(o =>
    o.classList.toggle('active', o.dataset.region === cur));
}

function toggleRegionMenu(e) {
  if (e) e.stopPropagation();
  const w = el('regionWrap');
  if (w) w.classList.toggle('open');
}

function selectRegion(r) {
  const w = el('regionWrap');
  if (w) w.classList.remove('open');
  if (!window.API || !API.setRegion) return;
  if (API.getRegion() === r) return;
  API.setRegion(r);
  // Перезагружаем, чтобы все разделы (игры, подписки, категории) подтянули магазин региона
  location.reload();
}

// Закрытие меню региона по клику вне его
document.addEventListener('click', (e) => {
  const w = el('regionWrap');
  if (w && w.classList.contains('open') && !w.contains(e.target)) w.classList.remove('open');
});

// Инициализация лейбла региона при загрузке
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRegionUI);
} else { initRegionUI(); }

/* ══════════════════════════════════════════════════════════════
   БОНУСНАЯ СИСТЕМА (страница «Бонусы»)
   ══════════════════════════════════════════════════════════════ */
const fmtBonus = (n) => Number(n || 0).toLocaleString('ru-RU');
let _bonusState = { balance: 0, case: null, products: [], spinning: false };

async function renderBonus() {
  const wrap = el('bonusContent');
  if (!wrap) return;
  wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🎁</div><div class="empty-h">Загрузка…</div></div>`;

  let me = { balance: 0 }, cs = null, prizes = [], prods = [];
  try {
    const [meR, caseR, prodR] = await Promise.allSettled([
      API.me(), API.bonusCase(), API.bonusProducts(),
    ]);
    if (meR.status === 'fulfilled')   me = meR.value || me;
    if (caseR.status === 'fulfilled') {
      const cv = caseR.value || {};
      cs = cv.case || null;
      prizes = cv.prizes || [];
    }
    if (prodR.status === 'fulfilled') prods = (prodR.value && prodR.value.items) || prodR.value || [];
  } catch (e) {
    wrap.innerHTML = `<div class="empty-state"><div class="empty-icon">🎁</div>
      <div class="empty-h">Бонусы недоступны</div>
      <div class="empty-p">Откройте магазин через Telegram, чтобы пользоваться бонусами.</div></div>`;
    return;
  }

  _bonusState.balance = me.balance || 0;
  _bonusState.case = cs ? { ...cs, prizes } : null;
  _bonusState.products = prods;

  const caseCost = cs ? cs.cost : 3000;
  const canOpen = cs && cs.enabled && _bonusState.balance >= caseCost;

  const caseArt = cs && cs.image
    ? `<img src="${esc(cs.image)}" alt="${esc(cs.name||'Кейс')}">`
    : `<div class="case-art-emoji">🎁</div>`;

  const shopCards = prods.length ? prods.map(bonusCardHTML).join('')
    : `<div style="grid-column:1/-1;text-align:center;color:var(--tx4);font-size:13px;padding:24px">Бонусных товаров пока нет.</div>`;

  wrap.innerHTML = `
    <div class="bonus-balance">
      <div class="bonus-balance-lbl">Ваш баланс</div>
      <div class="bonus-balance-val" id="bonusBalanceVal">${fmtBonus(_bonusState.balance)}<span>бонусов</span></div>
      <div class="bonus-balance-hint">Бонусы начисляются 30% от суммы каждой покупки</div>
    </div>

    ${cs ? `
    <div class="bonus-sec-title">Бонусный кейс (рулетка)</div>
    <div class="case-card">
      <div class="case-art">${caseArt}</div>
      <div class="case-body">
        <div class="case-name">${esc(cs.name || 'Бонусный кейс')}</div>
        <div class="case-desc">Испытай удачу! Внутри — бонусы и ценные товары. Стоимость открытия: <b>${fmtBonus(caseCost)}</b> бонусов.</div>
        <div class="roulette" id="rouletteBox" style="display:none">
          <div class="roulette-pointer"></div>
          <div class="roulette-track" id="rouletteTrack"></div>
        </div>
        <button class="case-open-btn" id="caseOpenBtn" onclick="openCaseRoulette()" ${canOpen ? '' : 'disabled'}>
          ${cs.enabled ? (canOpen ? `Открыть за ${fmtBonus(caseCost)} бонусов` : 'Недостаточно бонусов') : 'Кейс временно недоступен'}
        </button>
      </div>
    </div>` : ''}

    <div class="bonus-sec-title">Бонусные товары</div>
    <div class="bonus-grid">${shopCards}</div>
  `;
}

function bonusCardHTML(p) {
  const art = p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}">`
                      : `<div class="bcard-art-emoji">${esc(p.emoji || '🎁')}</div>`;
  const affordable = _bonusState.balance >= p.cost;
  const out = (!p.autoDeliver && p.quantity <= 0);
  return `
    <div class="bcard">
      <div class="bcard-art">${art}<div class="bcard-cost">${fmtBonus(p.cost)} Б</div></div>
      <div class="bcard-body">
        ${p.category ? `<div class="bcard-cat">${esc(p.category)}</div>` : ''}
        <div class="bcard-name">${esc(p.name)}</div>
      </div>
      <button class="bcard-buy" onclick="buyBonusItem(${p.id},this)" ${(!affordable||out)?'disabled':''}>
        ${out ? 'Нет в наличии' : (affordable ? 'Купить' : 'Не хватает')}
      </button>
    </div>`;
}

async function openCaseRoulette() {
  if (_bonusState.spinning) return;
  const cs = _bonusState.case;
  if (!cs) return;
  const btn = el('caseOpenBtn');
  const box = el('rouletteBox');
  const track = el('rouletteTrack');
  if (!box || !track) return;

  _bonusState.spinning = true;
  if (btn) { btn.disabled = true; btn.textContent = 'Открываем…'; }

  let result;
  try { result = await API.openCase(); }
  catch (e) {
    _bonusState.spinning = false;
    if (btn) { btn.disabled = false; }
    toast(e.message || 'Не удалось открыть кейс');
    renderBonus();
    return;
  }

  // Призы для ленты (для визуала). Используем призы кейса если есть, иначе сам результат.
  const pool = (cs.prizes && cs.prizes.length ? cs.prizes : [result.prize]).filter(Boolean);
  const cell = (pz) => `<div class="roulette-cell">
      ${pz.image ? `<img src="${esc(pz.image)}">` : `<div class="rc-emoji">${esc(pz.emoji||'🎁')}</div>`}
      <div class="rc-name">${esc(pz.name||'')}</div></div>`;

  // Строим длинную ленту из случайных призов, в позиции-победителе ставим выпавший приз
  const CELL_W = 118; // 110 + 4+4 margin
  const total = 48;
  const winIndex = 42;
  let cells = [];
  for (let i = 0; i < total; i++) {
    if (i === winIndex) cells.push(result.prize);
    else cells.push(pool[Math.floor(Math.random() * pool.length)] || result.prize);
  }
  track.innerHTML = cells.map(cell).join('');
  box.style.display = 'block';
  track.style.transition = 'none';
  track.style.transform = 'translateX(0)';

  // центрируем выпавшую ячейку под указателем
  const boxW = box.clientWidth;
  const target = winIndex * CELL_W - (boxW / 2) + (110 / 2) + 4;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      track.style.transition = 'transform 4.2s cubic-bezier(.12,.62,.15,1)';
      track.style.transform = `translateX(-${target}px)`;
    });
  });

  setTimeout(() => {
    _bonusState.spinning = false;
    _bonusState.balance = result.balance;
    const bv = el('bonusBalanceVal');
    if (bv) bv.innerHTML = `${fmtBonus(result.balance)}<span>бонусов</span>`;

    const pz = result.prize;
    if (result.key) {
      showKeyModal(result.key, pz.name, '🎉 Поздравляем!');
    } else if (pz.type === 'bonus') {
      toast(`🎉 Выигрыш: +${fmtBonus(pz.value)} бонусов!`);
    } else if (pz.type === 'nothing') {
      toast('В этот раз не повезло. Попробуйте ещё!');
    } else {
      toast(`🎉 Приз: ${pz.name}`);
    }
    // обновим страницу через секунду, чтобы показать новый баланс/наличие
    setTimeout(renderBonus, 1400);
  }, 4500);
}

async function buyBonusItem(id, btnEl) {
  if (btnEl) { btnEl.disabled = true; btnEl.textContent = '…'; }
  try {
    const r = await API.buyBonusProduct(id);
    _bonusState.balance = r.balance;
    const bv = el('bonusBalanceVal');
    if (bv) bv.innerHTML = `${fmtBonus(r.balance)}<span>бонусов</span>`;
    if (r.key) showKeyModal(r.key, r.product && r.product.name, '✅ Покупка совершена');
    else toast('✅ Покупка совершена! Менеджер свяжется с вами для выдачи.');
    renderBonus();
  } catch (e) {
    toast(e.message || 'Не удалось купить');
    if (btnEl) { btnEl.disabled = false; btnEl.textContent = 'Купить'; }
  }
}

/* ── Модалка выдачи ключа ── */
function showKeyModal(key, title, heading) {
  const back = el('keyModalBack');
  if (!back) return;
  if (heading) el('keyModalTitle').textContent = heading;
  el('keyModalValue').textContent = key;
  el('keyModalSub').textContent = title
    ? `${title} — ваш ключ ниже. Сохраните его, он также доступен в истории покупок.`
    : 'Сохраните ключ — он также доступен в истории покупок.';
  const cb = el('keyCopyBtn'); if (cb) cb.textContent = 'Скопировать';
  back.classList.add('show');
}
function closeKeyModal() { const b = el('keyModalBack'); if (b) b.classList.remove('show'); }
function copyKeyValue(btn) {
  const v = el('keyModalValue').textContent || '';
  const done = () => { if (btn) { btn.textContent = 'Скопировано ✓'; setTimeout(() => btn.textContent = 'Скопировать', 1800); } };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(v).then(done).catch(() => { fallbackCopy(v); done(); });
  } else { fallbackCopy(v); done(); }
}
function fallbackCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {}
}

// Globals for inline handlers
Object.assign(window, {
  renderBonus, openCaseRoulette, buyBonusItem,
  showKeyModal, closeKeyModal, copyKeyValue,
  go, toggleTheme, ctaRipple, openDeluxe,
  toggleRegionMenu, selectRegion, initRegionUI,
  openProduct, closeModal, buyFromModal, quickAdd, toggleWish, setPeriod,
  loadSubs, selectSubPeriod, addSubToCart,
  loadGames, onGamesSearch, gamesGoPage, resetGames, setGamesCat,
  loadCodes,
  renderWish, removeWish, wishToCart,
  renderCart, removeCart, checkout,
  openCheckout, openCheckoutDirect, closeCheckout, _forceCloseCheckout,
  startOrder, sendOrderInfo, clearData,
  startPayment, confirmPayEmail, skipPayEmail,
  renderProfileOrders, repeatOrder, renderGuarantees, playGrtVideo,
  openMessenger, copyOrderMessage,
  renderReviews, toggleReel, toggleReelMute,
});
