/* Клиент REST API. Если сервер недоступен (например, открыт через file://),
   автоматически переключается на демо-данные из seed.js (только чтение). */
window.API = (function () {
  const ONLINE = location.protocol === 'http:' || location.protocol === 'https:';
  const BASE = ONLINE ? `${location.origin}/api` : null;
  let offline = !ONLINE;

  // ── Регион (каждый регион — отдельный магазин) ──
  const REGIONS = ['tr', 'in'];
  let region = (() => {
    const r = localStorage.getItem('logovo_region');
    return REGIONS.includes(r) ? r : 'tr';
  })();

  // ── Telegram WebApp initData (для серверной валидации личности) ──
  function tgInitData() {
    try {
      const d = window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData;
      if (d && typeof d === 'string') return d;
    } catch {}
    // Фолбэк для отладки вне Telegram: можно положить в localStorage вручную
    return localStorage.getItem('logovo_tg_initdata') || '';
  }

  function headers(extra) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const t = localStorage.getItem('logovo_admin_token');
    if (t) h['X-Admin-Token'] = t;
    const tg = tgInitData();
    if (tg) h['X-Telegram-Init-Data'] = tg;
    return h;
  }

  async function req(method, path, body) {
    if (offline) throw new Error('offline');
    const res = await fetch(BASE + path, {
      method, headers: headers(), body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Ошибка ${res.status}`);
    return data;
  }

  const qs = (o) => {
    const u = new URLSearchParams();
    Object.entries(o || {}).forEach(([k, v]) => { if (v !== '' && v != null) u.set(k, v); });
    const s = u.toString();
    return s ? '?' + s : '';
  };

  function markOffline() {
    const pill = document.getElementById('offlinePill');
    if (pill) pill.style.display = 'block';
  }

  return {
    isOffline: () => offline,
    setOffline: (v) => { offline = v; },

    // ── Регион ──
    getRegion: () => region,
    regions: () => REGIONS.slice(),
    setRegion: (r) => {
      region = REGIONS.includes(r) ? r : 'tr';
      localStorage.setItem('logovo_region', region);
      return region;
    },

    // ── Products / Categories / Settings ──────────────────────
    async products(params) {
      const p = { region, ...(params || {}) };
      // Витрина = только админка: показываем ТОЛЬКО товары из БД.
      // Офлайн-подмену из seed.js не используем, чтобы в магазине не появлялись
      // «фантомные» товары, которых нет в админ-панели.
      try { return await req('GET', '/products' + qs(p)); }
      catch (e) {
        offline = true; markOffline();
        const limit = +(p.limit || p.pageSize || 24) || 24;
        return { items: [], total: 0, page: +(p.page || 1) || 1, limit, pages: 0 };
      }
    },
    async product(id) {
      // Витрина = только админка: карточка товара только из БД.
      try { return await req('GET', '/products/' + id); }
      catch (e) { offline = true; markOffline(); return null; }
    },
    async categories() {
      try { return await req('GET', '/categories' + qs({ region })); }
      catch (e) {
        offline = true; markOffline();
        if (region !== 'tr') return []; // демо-данные есть только для Турции
        return SEED.categories.map(c => ({ ...c, count: SEED.products.filter(p => p.categoryId === c.id).length }));
      }
    },
    async settings() {
      try { return await req('GET', '/settings'); }
      catch (e) { offline = true; markOffline(); return SEED.settings; }
    },

    // ── Admin write (требуют сервер + токен) ──────────────────
    createProduct:    (b)     => req('POST',   '/products', { region, ...b }),
    updateProduct:    (id, b) => req('PUT',    '/products/' + id, b),
    patchProduct:     (id, b) => req('PATCH',  '/products/' + id, b),
    deleteProduct:    (id)    => req('DELETE', '/products/' + id),
    reorderProducts:  (ids)   => req('POST',   '/products/reorder', { ids }),
    createCategory:   (b)     => req('POST',   '/categories', { region, ...b }),
    updateCategory:   (id, b) => req('PUT',    '/categories/' + id, b),
    deleteCategory:   (id)    => req('DELETE', '/categories/' + id),
    reorderCategories:(ids)   => req('POST',   '/categories/reorder', { ids }),
    uploadMedia:      (b)     => req('POST',   '/media', b),
    deleteMedia:      (id)    => req('DELETE', '/media/' + id),
    listMedia:        ()      => req('GET',    '/media'),
    saveSettings:     (b)     => req('PUT',    '/settings', b),
    auth:             (token) => req('POST',   '/auth', { token }),

    // ── Orders ── (bug2 fix: перенесено внутрь IIFE, req доступен)
    createOrder:      (b)     => req('POST',   '/orders', b),
    submitOrderInfo:  (id, b) => req('POST',   '/orders/' + id + '/info', b),
    getOrder:         (id)    => req('GET',    '/orders/' + id),
    payOrder:         (id)    => req('PATCH',  '/orders/' + id, { status: 'paid' }),
    cancelOrder:      (id)    => req('PATCH',  '/orders/' + id, { status: 'cancelled' }),
    listOrders:       (p)     => req('GET',    '/orders' + qs(p)),
    deleteOrder:      (id)    => req('DELETE', '/orders/' + id),
    orderStats:       ()      => req('GET',    '/orders/stats'),
    patchOrderAdmin:  (id, b) => req('PATCH',  '/orders/' + id, b),

    // ── Оплата (ЮKassa) ──
    createPayment:    (orderId, receiptEmail) => req('POST', '/pay/create', { orderId, receiptEmail }),
    payStatus:        (orderId) => req('GET',  '/pay/status/' + orderId),

    // ── Prices ── (bug2 fix: перенесено внутрь IIFE, req доступен)
    priceFormula:     ()           => req('GET',  '/prices/formula'),
    priceConvert:     (priceTRY)   => req('POST', '/prices/convert', { priceTRY }),
    priceDetail:      (id)         => req('GET',  `/prices/${id}`),
    priceHistory:     (id)         => req('GET',  `/prices/${id}/history`),
    priceUpdate:      (id, priceTRY) => req('POST', `/prices/update/${id}`, { priceTRY }),
    priceBulk:        (items)      => req('POST', '/prices/bulk', { items }),
    priceRecalculate: ()           => req('POST', '/prices/recalculate', {}),

    // ── Бонусная система (пользователь) ──
    me:               ()           => req('GET',  '/me'),
    bonusCase:        ()           => req('GET',  '/bonus/case'),
    openCase:         ()           => req('POST', '/bonus/case/open', {}),
    bonusProducts:    ()           => req('GET',  '/bonus/products'),
    buyBonusProduct:  (id)         => req('POST', '/bonus/products/' + id + '/buy', {}),
    bonusTx:          (p)          => req('GET',  '/bonus/tx' + qs(p)),
    bonusOrders:      ()           => req('GET',  '/bonus/orders'),
    videos:           ()           => req('GET',  '/videos'),
    textReviews:      ()           => req('GET',  '/text-reviews'),

    // ── Бонусная система (админ) ──
    adminBonusProducts:   ()       => req('GET',    '/admin/bonus-products'),
    createBonusProduct:   (b)      => req('POST',   '/admin/bonus-products', b),
    updateBonusProduct:   (id, b)  => req('PUT',    '/admin/bonus-products/' + id, b),
    patchBonusProduct:    (id, b)  => req('PATCH',  '/admin/bonus-products/' + id, b),
    deleteBonusProduct:   (id)     => req('DELETE', '/admin/bonus-products/' + id),
    listKeys:             (id)     => req('GET',    '/admin/bonus-products/' + id + '/keys'),
    addKeys:              (id, keys)=> req('POST',  '/admin/bonus-products/' + id + '/keys', { keys }),
    deleteKey:            (id)     => req('DELETE', '/admin/keys/' + id),
    adminCase:            ()       => req('GET',    '/admin/case'),
    updateCase:           (b)      => req('PUT',    '/admin/case', b),
    createPrize:          (b)      => req('POST',   '/admin/case/prizes', b),
    updatePrize:          (id, b)  => req('PUT',    '/admin/case/prizes/' + id, b),
    patchPrize:           (id, b)  => req('PATCH',  '/admin/case/prizes/' + id, b),
    deletePrize:          (id)     => req('DELETE', '/admin/case/prizes/' + id),
    adminVideos:          ()       => req('GET',    '/admin/videos'),
    createVideo:          (b)      => req('POST',   '/admin/videos', b),
    reorderVideos:        (ids)    => req('POST',   '/admin/videos/reorder', { ids }),
    patchVideo:           (id, b)  => req('PATCH',  '/admin/videos/' + id, b),
    deleteVideo:          (id)     => req('DELETE', '/admin/videos/' + id),

    // ── Коды пополнения (админ) ──
    topupSummary:     ()          => req('GET',    '/codes/summary'),
    topupList:        (p)         => req('GET',    '/codes' + qs(p)),
    topupAdd:         (denom, codes) => req('POST', '/codes', { denom, codes }),
    topupBulk:        (text)      => req('POST',    '/codes/bulk', { text }),
    topupDelete:      (id)        => req('DELETE',  '/codes/' + id),
    topupManual:      ()          => req('GET',     '/codes/manual'),

    // ── Текстовые отзывы (админ) ──
    adminTextReviews:     ()       => req('GET',    '/admin/text-reviews'),
    createTextReview:     (b)      => req('POST',   '/admin/text-reviews', b),
    reorderTextReviews:   (ids)    => req('POST',   '/admin/text-reviews/reorder', { ids }),
    patchTextReview:      (id, b)  => req('PATCH',  '/admin/text-reviews/' + id, b),
    deleteTextReview:     (id)     => req('DELETE', '/admin/text-reviews/' + id),
  };
})();
