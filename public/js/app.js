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
  const t = el('toast'), ico = el('tIco'), txt = el('tMsg');
  if (!t) return;
  const ok  = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M20 6 9 17l-5-5"/></svg>';
  const err = '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>';
  t.className = 'toast' + (type === 'err' ? ' err' : '');
  ico.innerHTML = type === 'err' ? err : ok;
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
  const wn = wishlist.length, cn = cart.length;
  ['wishBadge','wishBadge2'].forEach(id => {
    const b = el(id); if (!b) return;
    b.textContent = wn;
    b.style.display = wn ? 'flex' : 'none';
  });
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
  const sel   = subPeriodSel[s.id] || 1;
  const price = hasPeriods ? (periods[sel] ?? s.price) : s.price;
  const isFeat = s.isFeatured;

  // Tier-based gradients
  const bgByTier = {
    essential: 'linear-gradient(135deg,#1c1c2e 0%,#2a2a44 100%)',
    extra:     'linear-gradient(135deg,#001a4d 0%,#003380 50%,#0055cc 100%)',
    deluxe:    'linear-gradient(135deg,#2a1800 0%,#5a3200 50%,#8a5200 100%)',
  };
  const bg = bgByTier[tier] || bgByTier.essential;

  // Tier badge labels
  const tierLabel = { essential:'Essential', extra:'Extra', deluxe:'Deluxe' }[tier] || tier;
  const tierEmoji = { essential:'🔘', extra:'💠', deluxe:'👑' }[tier] || '💎';
  const featBadge = { essential:'Базовый', extra:'Популярный ⭐', deluxe:'Максимальный' }[tier] || '';

  return `
    <div class="sub-card${isFeat?' featured':''}" data-tier="${tier}" id="sc-${s.id}">
      <div class="sub-cover" style="background:${bg}">
        ${s.image ? `<img src="${esc(s.image)}" alt="" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : ''}
        <div class="sub-cover-grad"></div>
        <div style="font-size:52px;position:relative;z-index:1;filter:drop-shadow(0 4px 16px rgba(0,0,0,.5))">${tierEmoji}</div>
        ${isFeat ? `<div class="sub-feat-badge">${featBadge}</div>` : ''}
      </div>
      <div class="sub-body">
        <div class="sub-tier">PS Plus ${tierLabel}</div>
        <div class="sub-name">${esc(s.name)}</div>
        ${s.description ? `<div class="sub-desc">${esc(s.description)}</div>` : ''}
        ${features.length ? `<div class="sub-features">${features.map(f=>`<div class="sub-feat">${esc(f)}</div>`).join('')}</div>` : ''}
        ${hasPeriods ? `
          <div class="sub-periods">
            ${Object.entries(periods).map(([mo,pr]) => `
              <div class="period-row${sel==mo?' on':''}" onclick="selectSubPeriod(${s.id},${mo})">
                <span class="period-label">${PERIOD_LABELS[mo]||mo+' мес.'}</span>
                <span class="period-price">${fmt(pr)}</span>
              </div>`).join('')}
          </div>` : ''}
        <button class="sub-buy-btn${s.inStock?'':' disabled'}" onclick="addSubToCart(${s.id})"
          ${!s.inStock ? 'disabled' : ''}>
          ${s.inStock ? '🛒 Оформить — ' + fmt(price) : 'Нет в наличии'}
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
  // Получаем данные товара из seed
  const s = (window.SEED?.products || []).find(p => p.id === subId) || { id: subId, name: 'Подписка', price: 0, emoji: '💎' };
  const period  = subPeriodSel[subId] || 1;
  const periods = s.meta?.periods || {};
  const price   = periods[period] ?? s.price ?? 0;
  const PERIOD_L = { 1: '1 месяц', 3: '3 месяца', 12: '12 месяцев' };

  openCheckout({
    name:      s.name + ' — ' + (PERIOD_L[period] || period + ' мес.'),
    price,
    emoji:     s.emoji || '💎',
    platform:  s.platform || 'PlayStation',
    type:      'sub',
    productId: subId,
    period,
  });
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
  const disc  = discPct(p.price, p.oldPrice);
  const badge = p.isNew     ? '<div class="gbadge b-new">NEW</div>'
    : p.isSale || p.oldPrice ? '<div class="gbadge b-sale">SALE</div>'
    : p.isPreorder           ? '<div class="gbadge b-pre">PRE</div>'
    : '';
  const cover = p.image
    ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="gcard-cover-inner">${esc(p.emoji||'🎮')}</div>`;

  return `
    <div class="gcard" onclick="openProduct(${p.id})">
      <div class="gcard-cover">
        ${cover}
        ${badge}
        ${disc>=5 ? `<div class="gdisc">−${disc}%</div>` : ''}
      </div>
      <div class="gcard-body">
        <div class="gcard-plat">${esc(p.platform||'PlayStation')}</div>
        <div class="gcard-name">${esc(p.name)}</div>
        ${p.description ? `<div class="gcard-desc">${esc(p.description)}</div>` : ''}
        <div class="gcard-prices">
          <div class="gcard-price">${p.price === 0 ? 'Бесплатно' : fmt(p.price)}</div>
          ${p.oldPrice ? `<div class="gcard-old">${fmt(p.oldPrice)}</div>` : ''}
        </div>
        <button class="gcard-add${!p.inStock?' oos':''}"
          onclick="event.stopPropagation();quickAdd(${p.id},this)"
          ${!p.inStock?'disabled':''}>
          ${!p.inStock ? 'Нет в наличии' : '🛒 Купить'}
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
    if (r==='…') { html += `<button class="pg-btn" disabled>…</button>`; }
    else { html += `<button class="pg-btn${r===page?' on':''}" onclick="gamesGoPage(${r})">${r}</button>`; }
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
  // reset chips
  document.querySelectorAll('#gamesChips .chip').forEach(c => c.classList.remove('on'));
  document.querySelector('#gamesChips .chip')?.classList.add('on');
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
    wrap.innerHTML = chips.map(c=>`
      <div class="chip${c.id===''?' on':''}" onclick="setGamesCat('${c.id}')" data-cat="${c.id}">
        ${esc(c.title)}
      </div>`).join('');
  } catch {}
}

function setGamesCat(catId) {
  gamesState.cat = catId;
  gamesState.page = 1;
  document.querySelectorAll('#gamesChips .chip').forEach(c => c.classList.toggle('on', c.dataset.cat===catId));
  loadGames();
}

/* Pager button CSS (added dynamically to avoid duplication) */
(function(){
  const s = document.createElement('style');
  s.textContent=`.pg-btn{min-width:36px;height:36px;border-radius:9px;background:var(--bg2);border:1.5px solid var(--div2);font-size:13px;font-weight:700;cursor:pointer;transition:all .18s;color:var(--t2)}.pg-btn.on{background:var(--blue3);border-color:var(--blue3);color:#fff}.pg-btn:disabled{opacity:.35;cursor:default}.pg-btn:not(.on):not(:disabled):hover{border-color:var(--blue3);color:var(--blue3)}`;
  document.head.appendChild(s);
})();

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
  el('pmDescSec').style.display = 'none'; el('pmDesc').textContent = '';
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
  // Hero image
  let heroHTML = '';
  if (p.image) heroHTML = `<img src="${esc(p.image)}" alt="${esc(p.name)}">`;
  else heroHTML = `<div style="font-size:80px;line-height:1;filter:drop-shadow(0 8px 24px rgba(0,0,0,.5))">${esc(p.emoji||'🎮')}</div>`;
  heroHTML += '<div class="modal-hero-grad"></div>';
  // Re-add back/wish buttons
  heroHTML += `<button class="modal-back" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg></button>`;
  const inWish = wishlist.includes(p.id);
  heroHTML += `<button id="pmWishBtn" class="modal-wish${inWish?' active':''}" onclick="toggleWish(${p.id})"><svg width="16" height="16" viewBox="0 0 24 24" fill="${inWish?'currentColor':'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg></button>`;
  el('pmHero').innerHTML = heroHTML;

  el('pmPlat').textContent = p.platform || '';
  el('pmTitle').textContent = p.name;
  el('pmEdition').textContent = p.edition || '';

  // Periods (for subs)
  const periods = p.meta?.periods || {};
  if (p.type === 'sub' && Object.keys(periods).length > 0) {
    const LABELS = { 1:'1 месяц', 3:'3 месяца', 12:'12 месяцев' };
    el('pmSeg').innerHTML = Object.entries(periods).map(([mo])=>`
      <button class="seg-btn${+mo===modalPeriod?' on':''}" onclick="setPeriod(${mo})">${LABELS[mo]||mo+' мес.'}</button>
    `).join('');
  } else {
    el('pmSeg').innerHTML = '';
  }

  updateModalPrice(p);

  // Stock
  const stk = el('pmStock');
  if (p.inStock) {
    stk.className = 'stock-line in-stock';
    stk.innerHTML = '<span class="dot"></span> В наличии';
  } else {
    stk.className = 'stock-line no-stock';
    stk.innerHTML = '<span class="dot"></span> Нет в наличии';
  }
  el('pmBuy').disabled = !p.inStock;

  // Features
  const feats = p.meta?.features || [];
  el('pmFeatWrap').innerHTML = feats.length ? `
    <div class="modal-sec">Что входит</div>
    ${feats.map(f=>`<div class="feat"><div class="feat-d"></div><span>${esc(f)}</span></div>`).join('')}` : '';

  // Description
  if (p.description) {
    el('pmDescSec').style.display = 'block';
    el('pmDesc').textContent = p.description;
  } else {
    el('pmDescSec').style.display = 'none';
  }

  // Specs
  const meta = p.meta || {};
  const specKeys = { size:'Размер', players:'Игроки', rating:'Рейтинг' };
  const specs = Object.entries(specKeys).filter(([k]) => meta[k]);
  el('pmSpecWrap').innerHTML = specs.length ? `
    <div class="modal-sec">Характеристики</div>
    ${specs.map(([k,l])=>`<div class="spec"><span class="spec-l">${l}</span><span class="spec-v">${esc(meta[k])}</span></div>`).join('')}` : '';
}

function updateModalPrice(p) {
  const periods = p.meta?.periods || {};
  const price = (p.type==='sub' && Object.keys(periods).length > 0)
    ? (periods[modalPeriod] ?? p.price)
    : p.price;

  el('pmPrice').textContent = fmt(price);
  if (p.oldPrice && p.oldPrice > price) {
    el('pmOld').textContent = fmt(p.oldPrice);
    const d = discPct(price, p.oldPrice);
    el('pmDisc').innerHTML = d ? `<div class="pb-disc">−${d}%</div>` : '';
  } else {
    el('pmOld').textContent = '';
    el('pmDisc').innerHTML = '';
  }
  el('pmBuy').textContent = `В корзину — ${fmt(price)}`;
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
  const periods = p.meta?.periods || {};
  const price = (p.type === 'sub' && Object.keys(periods).length > 0)
    ? (periods[modalPeriod] ?? p.price) : p.price;
  const PERIOD_L = { 1: '1 месяц', 3: '3 месяца', 12: '12 месяцев' };
  const nameFull = (p.type === 'sub' && modalPeriod)
    ? p.name + ' — ' + (PERIOD_L[modalPeriod] || modalPeriod + ' мес.') : p.name;
  closeModal();
  openCheckout({ name: nameFull, price, emoji: p.emoji || '🎮', platform: p.platform || '', type: p.type || 'game', productId: p.id, period: p.type === 'sub' ? modalPeriod : null });
}

function quickAdd(id, btn) {
  // Находим товар и открываем форму оформления
  const p = productInfo(id);
  openCheckout({ name: p.name, price: p.price, emoji: p.emoji || '🎮', platform: p.platform || '', type: p.type || 'game', productId: id });
}

/* ══════════════════════════════════════════════════════════════
   WISH + CART SCREENS
   ══════════════════════════════════════════════════════════════ */
function productInfo(id) {
  return SEED.products.find(p => p.id === id) || { id, name: 'Товар #'+id, price: 0, emoji:'📦' };
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

function renderCart() {
  const host = el('cartContent');
  if (!host) return;
  if (!cart.length) {
    host.innerHTML = `<div class="empty"><div class="empty-ico">🛒</div><div class="empty-h">Корзина пуста</div><div class="empty-p">Добавьте товары из каталога</div><button class="empty-btn" onclick="go('#/games')">Перейти в каталог</button></div>`;
    return;
  }

  let total = 0, saved = 0;
  const items = cart.map(ci => {
    const p = productInfo(ci.id);
    const periods = p.meta?.periods||{};
    const price = (ci.period && periods[ci.period]) ? periods[ci.period] : p.price;
    const old = p.oldPrice;
    if (old && old > price) saved += (old - price);
    total += price;
    const PERIOD_L = {1:'1 месяц',3:'3 месяца',12:'12 месяцев'};
    const meta = ci.period ? PERIOD_L[ci.period]||'' : (p.platform||'');
    return `<div class="litem">
      <div class="li-cov" onclick="openProduct(${p.id})">${p.image?`<img src="${esc(p.image)}" alt="">`:(p.emoji||'📦')}</div>
      <div class="li-inf" onclick="openProduct(${p.id})">
        <div class="li-name">${esc(p.name)}</div>
        <div class="li-meta">${esc(meta)}</div>
        <span class="li-price">${fmt(price)}</span>
        ${old&&old>price?`<span class="li-old">${fmt(old)}</span>`:''}
      </div>
      <div class="rb rb-del" onclick="removeCart(${p.id},${ci.period||'undefined'})" title="Удалить">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </div>
    </div>`;
  });

  host.innerHTML = `
    <div>${items.join('')}</div>
    <div class="summary">
      <div class="sum-row"><span>Товаров</span><span>${cart.length}</span></div>
      ${saved>0?`<div class="sum-div"></div><div class="sum-row"><span>Скидка</span><span style="color:var(--green)">−${fmt(saved)}</span></div>`:''}
      <div class="sum-div"></div>
      <div class="sum-total"><span>Итого</span><span>${fmt(total)}</span></div>
      ${saved>0?`<div class="sum-saved">🎉 Вы экономите ${fmt(saved)}</div>`:''}
      <button class="btn-primary" onclick="checkout()">Оформить заказ →</button>
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
    <div class="sheet-sub">Заполните данные — мы доставим товар и свяжемся с вами.</div>

    <div class="order-item-preview">
      <div class="oip-ico">${esc(item.emoji || '🎮')}</div>
      <div>
        <div class="oip-name">${esc(item.name)}</div>
        <div class="oip-price">${fmt(price)}</div>
      </div>
    </div>

    <div class="form-notice">
      🔒 Мы никогда не запрашиваем пароли, коды подтверждения или резервные коды аккаунта.
    </div>

    <form id="orderForm" onsubmit="return false">

      <div class="form-field" id="ff-nickname">
        <label>Ваш никнейм<span class="req">*</span></label>
        <input class="form-inp" id="of-nickname" type="text"
               placeholder="Как к вам обращаться?" autocomplete="nickname">
        <div class="form-err-msg">Укажите никнейм</div>
      </div>

      <div class="form-field" id="ff-telegram">
        <label>Telegram<span class="req">*</span></label>
        <input class="form-inp" id="of-telegram" type="text"
               placeholder="@username" autocomplete="off">
        <div class="form-hint">Ваш @username в Telegram для связи</div>
        <div class="form-err-msg">Укажите Telegram username</div>
      </div>

      <div class="form-field" id="ff-psnId">
        <label>PSN ID<span class="req">*</span></label>
        <input class="form-inp" id="of-psnId" type="text"
               placeholder="Ваш PSN ID (публичное имя аккаунта)" autocomplete="off">
        <div class="form-hint">Публичное имя вашего PlayStation аккаунта — не пароль</div>
        <div class="form-err-msg">Укажите PSN ID</div>
      </div>

      <div class="form-field" id="ff-product">
        <label>Выбранный товар<span class="req">*</span></label>
        <input class="form-inp" id="of-product" type="text"
               value="${esc(item.name)}" placeholder="Название товара">
        <div class="form-hint">Уже заполнено — уточните период если нужно</div>
        <div class="form-err-msg">Укажите товар</div>
      </div>

      <div class="form-field" id="ff-comment">
        <label>Комментарий
          <span style="color:var(--t4);font-size:10px;letter-spacing:0;text-transform:none;font-weight:500">(необязательно)</span>
        </label>
        <textarea class="form-inp" id="of-comment" rows="2"
                  placeholder="Любые пожелания или уточнения…" style="resize:none"></textarea>
      </div>

      <button class="submit-btn" id="orderSubmitBtn" onclick="submitOrder()">
        <div class="spin"></div>
        <span>Оформить заказ — ${fmt(price)}</span>
      </button>
    </form>
  `;
}

async function submitOrder() {
  if (!_checkoutItem) return;

  // Валидация обязательных полей
  let valid = true;
  function check(id, fieldId) {
    const val = el(id)?.value?.trim();
    const ff  = el(fieldId);
    if (!val) { ff?.classList.add('has-err'); valid = false; }
    else ff?.classList.remove('has-err');
    return val;
  }

  const nickname    = check('of-nickname',  'ff-nickname');
  const telegram    = check('of-telegram',  'ff-telegram');
  const psnId       = check('of-psnId',     'ff-psnId');
  const productName = check('of-product',   'ff-product');
  const comment     = el('of-comment')?.value?.trim() || '';

  if (!valid) { toast('Заполните обязательные поля', 'err'); return; }

  const btn = el('orderSubmitBtn');
  btn.classList.add('loading'); btn.disabled = true;

  const orderData = {
    psnId,
    nickname,
    telegram,
    productName,
    productId: _checkoutItem.productId || null,
    amount:    Math.round(_checkoutItem.price || 0),
    comment,
    meta: {
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

    // Показываем экран успеха
    renderOrderSuccess(order, _checkoutItem);

    // Очищаем корзину (если заказ из корзины)
    if (_checkoutItem._fromCart) {
      cart = []; saveCart(); updateBadges();
    }

    // Отправляем данные в Telegram WebApp (для уведомления бота)
    try {
      if (window.Telegram?.WebApp?.sendData) {
        Telegram.WebApp.sendData(JSON.stringify({
          type:    'order',
          orderId: order.id,
          psnId,
          nickname,
          product: productName,
          amount:  orderData.amount,
        }));
      }
    } catch {}

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

/* ── Обновим checkout из корзины ──────────────────────────────── */
function checkout() {
  if (!cart.length) { toast('Корзина пуста', 'err'); return; }

  // Берём первый товар из корзины для оформления
  // (или создаём сводный заказ)
  const items = cart.map(ci => {
    const p = productInfo(ci.id);
    const periods = p.meta?.periods || {};
    const price = (ci.period && periods[ci.period]) ? periods[ci.period] : p.price;
    return { ...p, price, period: ci.period || null };
  });

  const total = items.reduce((s, i) => s + i.price, 0);
  const names = items.map(i => i.name + (i.period ? ` (${i.period} мес.)` : '')).join(', ');

  openCheckout({
    name:       names,
    price:      total,
    emoji:      items[0]?.emoji || '🛒',
    platform:   items.map(i => i.platform).filter(Boolean).join(', '),
    type:       'mixed',
    _fromCart:  true,
    productId:  items.length === 1 ? items[0].id : null,
  });
}

function clearData() {
  cart = []; wishlist = [];
  saveCart(); saveWish(); updateBadges();
  toast('Данные очищены');
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
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
  });
  // Show target screen
  const s = el('screen-' + id);
  if (s) {
    s.classList.add('active');
    // Reset this screen's own scroll to top instantly
    s.scrollTop = 0;
  }
  setNav(nav || id);
  document.body.classList.toggle('not-home', id !== 'home');
}

function route() {
  if (el('pModal')?.classList.contains('open')) { closeModal(); return; }
  const h = location.hash || '#/';
  const parts = h.replace(/^#\//, '').split('/');
  const root = parts[0] || '';

  if (root === 'gta6') {
    showScreen('gta6', 'gta6');
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
});
