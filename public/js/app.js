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
  // Try seed first (instant)
  const fromSeed = (window.SEED?.products || []).find(p => p.id === id);
  if (fromSeed) { _pCache[id] = fromSeed; return fromSeed; }
  // Fetch from server
  try {
    const p = await API.product(id);
    if (p) { _pCache[id] = p; return p; }
  } catch {}
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
          <button class="cart-remove" onclick="removeCart(${p.id},'${cart[i].period||''}')" title="Удалить">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
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

function removeCart(id, period) {
  cart = cart.filter(i => !(i.id===id && (period===undefined||i.period===period)));
  saveCart(); updateBadges(); renderCart();
}

/* ══════════════════════════════════════════════════════════════
   CHECKOUT FORM — сбор данных клиента перед оплатой
   ══════════════════════════════════════════════════════════════ */

// Данные текущего заказа, открытого в форме
let _checkoutItem = null;

/**
 * Открыть форму оформления для конкретного товара.
 * @param {object} item — { name, price, emoji, platform, type, productId?, period? }
 */
function openCheckout(item) {
  _checkoutItem = item;
  const overlay = el('checkoutOverlay');
  if (!overlay) return;
  renderCheckoutForm(item);
  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

/** Открыть форму напрямую (без корзины), например для GTA6 */
function openCheckoutDirect(item) {
  openCheckout(item);
}

function closeCheckout(e) {
  if (e && e.target !== el('checkoutOverlay')) return;
  _forceCloseCheckout();
}
function _forceCloseCheckout() {
  el('checkoutOverlay')?.classList.remove('open');
  document.body.style.overflow = '';
}

function renderCheckoutForm(item) {
  const host = el('checkoutContent');
  if (!host) return;
  const price = item.price || 0;
  host.innerHTML = `
    <div class="sheet-title">Оформление заказа</div>
    <div class="sheet-sub">Заполните данные для получения товара</div>

    <div class="order-preview">
      <div class="order-preview-ico">${esc(item.emoji || '🎮')}</div>
      <div>
        <div class="order-preview-name">${esc(item.name)}</div>
        <div class="order-preview-price">${price > 0 ? fmt(price) : 'Бесплатно'}</div>
      </div>
    </div>

    <form id="orderForm" onsubmit="return false">

      <div class="form-group" id="ff-email">
        <label class="form-label">Email<span class="req">*</span></label>
        <input class="form-input" id="of-email" type="email"
               placeholder="your@email.com" autocomplete="email">
        <div class="form-err">Укажите корректный email</div>
      </div>

      <div class="form-group" id="ff-accLogin">
        <label class="form-label">Данные об аккаунте<span class="req">*</span></label>
        <input class="form-input" id="of-accLogin" type="text"
               placeholder="Логин или другая информация об аккаунте" autocomplete="username">
        <div class="form-err">Укажите данные аккаунта</div>
      </div>

      <div class="form-group" id="ff-accPass">
        <label class="form-label">Пароль от аккаунта<span class="req">*</span></label>
        <input class="form-input" id="of-accPass" type="password"
               placeholder="Пароль от PlayStation аккаунта" autocomplete="current-password">
        <div class="form-err">Укажите пароль от аккаунта</div>
      </div>

      <div class="form-group">
        <label class="form-label">Комментарий</label>
        <textarea class="form-textarea" id="of-comment"
                  placeholder="Пожелания или уточнения…"></textarea>
      </div>

      <button class="submit-btn" id="orderSubmitBtn" onclick="submitOrder()">
        <div class="submit-spin"></div>
        <span class="submit-text">${price > 0 ? `Оформить — ${fmt(price)}` : 'Оформить'}</span>
      </button>
    </form>`;
}

async function submitOrder() {
  if (!_checkoutItem) return;

  // Валидация обязательных полей
  let valid = true;
  function check(id, fieldId, validator) {
    const val = el(id)?.value?.trim();
    const ff  = el(fieldId);
    const ok  = val && (!validator || validator(val));
    if (!ok) { ff?.classList.add('has-err'); valid = false; }
    else ff?.classList.remove('has-err');
    return val;
  }

  const email     = check('of-email',     'ff-email',     v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v));
  const accLogin  = check('of-accLogin',  'ff-accLogin');
  const accPass   = check('of-accPass',   'ff-accPass');
  const comment   = el('of-comment')?.value?.trim() || '';

  if (!valid) { toast('Заполните обязательные поля', 'err'); return; }

  const btn = el('orderSubmitBtn');
  btn.classList.add('loading'); btn.disabled = true;

  // Для совместимости с сервером используем поля psnId/nickname/telegram
  // accLogin → psnId (данные аккаунта), email → email, nickname из email
  const orderData = {
    psnId:       accLogin,
    nickname:    email.split('@')[0],   // минимальный идентификатор
    telegram:    '',                     // определяется Telegram автоматически
    email,
    productName: _checkoutItem.name || '',
    productId:   _checkoutItem.productId || null,
    amount:      Math.round(_checkoutItem.price || 0),
    comment,
    meta: {
      email,
      accLogin,     // данные аккаунта
      accPass,      // пароль от аккаунта
      period:   _checkoutItem.period   || null,
      platform: _checkoutItem.platform || '',
      type:     _checkoutItem.type     || 'game',
    },
  };

  try {
    let order;

    if (!API.isOffline()) {
      // Онлайн — сохраняем в БД
      order = await API.createOrder(orderData);
    } else {
      // Офлайн — генерируем локальный ID
      order = {
        id: 'LOCAL-' + Date.now(),
        ...orderData,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
    }

    // Отправляем данные в Telegram WebApp (для уведомления бота)
    try {
      if (window.Telegram?.WebApp?.sendData) {
        Telegram.WebApp.sendData(JSON.stringify({
          type:    'order',
          orderId: order.id,
          email,
          accLogin,
          product: orderData.productName,
          amount:  orderData.amount,
        }));
      }
    } catch {}

    const paidFlow = !API.isOffline() && orderData.amount > 0;

    if (paidFlow) {
      // Платный заказ — ведём на экран оплаты ЮKassa
      _forceCloseCheckout();
      go('#/pay/' + order.id);
    } else {
      // Бесплатный товар или офлайн — показываем экран успеха
      renderOrderSuccess(order, _checkoutItem);
      if (_checkoutItem._fromCart) { cart = []; saveCart(); updateBadges(); }
    }

  } catch (err) {
    console.error('Order error:', err);
    toast('Ошибка создания заказа: ' + err.message, 'err');
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

function renderOrderSuccess(order, item) {
  const host = el('checkoutContent');
  if (!host) return;
  host.innerHTML = `
    <div class="order-success">
      <div class="order-success-ico">✅</div>
      <div class="order-success-ttl">Заказ оформлен!</div>
      <div class="order-success-sub">
        Мы получили ваш заказ и свяжемся с вами<br>для завершения оплаты.
      </div>
      <div class="order-id-badge">${esc(order.id)}</div>
      <div class="order-success-sub" style="font-size:12px;color:var(--t4);margin-bottom:20px">
        Сохраните ID заказа для отслеживания
      </div>
      <button class="submit-btn" onclick="_forceCloseCheckout();go('#/')">
        <span>На главную</span>
      </button>
    </div>
  `;
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

async function startPayment() {
  if (!_payOrderId) return;
  const btn = el('payBtn');
  if (btn) { btn.classList.add('loading'); btn.disabled = true; }
  try {
    const { confirmationUrl } = await API.createPayment(_payOrderId);
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

function _paySuccess(order) {
  _stopPayPoll();
  const host = el('payContent');
  if (!host) return;
  host.innerHTML = `
    <div class="pay-state">
      <div class="pay-state-ico">✅</div>
      <div class="pay-state-ttl">Оплата прошла успешно</div>
      <div class="pay-state-sub">Заказ <b>${esc(order.id)}</b> оплачен.<br>Мы свяжемся с вами для выдачи товара.</div>
      <button class="pay-btn" onclick="go('#/')"><span class="pay-btn-text">На главную</span></button>
    </div>`;
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
  } else if (root === 'wish') {
    showScreen('wish', 'wish');
    renderWish();
  } else if (root === 'cart') {
    showScreen('cart', 'cart');
    renderCart();
  } else if (root === 'profile') {
    showScreen('profile', 'profile');
  } else {
    showScreen('home', 'home');
  }
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

// Globals for inline handlers
Object.assign(window, {
  go, toggleTheme, ctaRipple,
  openProduct, closeModal, buyFromModal, quickAdd, toggleWish, setPeriod,
  loadSubs, selectSubPeriod, addSubToCart,
  loadGames, onGamesSearch, gamesGoPage, resetGames, setGamesCat,
  renderWish, removeWish, wishToCart,
  renderCart, removeCart, checkout,
  openCheckout, openCheckoutDirect, closeCheckout, _forceCloseCheckout,
  submitOrder, clearData,
  startPayment,
});
