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

  function headers(extra) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const t = localStorage.getItem('logovo_admin_token');
    if (t) h['X-Admin-Token'] = t;
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
      try { return await req('GET', '/products' + qs(p)); }
      catch (e) { offline = true; markOffline(); return window.queryLocal(p); }
    },
    async product(id) {
      try { return await req('GET', '/products/' + id); }
      catch (e) { offline = true; markOffline(); return SEED.products.find(p => p.id === +id); }
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
    createPayment:    (orderId) => req('POST', '/pay/create', { orderId }),
    payStatus:        (orderId) => req('GET',  '/pay/status/' + orderId),

    // ── Prices ── (bug2 fix: перенесено внутрь IIFE, req доступен)
    priceFormula:     ()           => req('GET',  '/prices/formula'),
    priceConvert:     (priceTRY)   => req('POST', '/prices/convert', { priceTRY }),
    priceDetail:      (id)         => req('GET',  `/prices/${id}`),
    priceHistory:     (id)         => req('GET',  `/prices/${id}/history`),
    priceUpdate:      (id, priceTRY) => req('POST', `/prices/update/${id}`, { priceTRY }),
    priceBulk:        (items)      => req('POST', '/prices/bulk', { items }),
    priceRecalculate: ()           => req('POST', '/prices/recalculate', {}),
  };
})();
