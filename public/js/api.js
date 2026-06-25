/* Клиент REST API. Если сервер недоступен (например, открыт через file://),
   автоматически переключается на демо-данные из seed.js (только чтение). */
window.API = (function () {
  const ONLINE = location.protocol === 'http:' || location.protocol === 'https:';
  const BASE = ONLINE ? `${location.origin}/api` : null;
  let offline = !ONLINE;

  function headers(extra) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const t = localStorage.getItem('relok_admin_token');
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

  return {
    isOffline: () => offline,
    setOffline: (v) => { offline = v; },

    async products(params) {
      try { return await req('GET', '/products' + qs(params)); }
      catch (e) { offline = true; markOffline(); return window.queryLocal(params || {}); }
    },
    async product(id) {
      try { return await req('GET', '/products/' + id); }
      catch (e) { offline = true; markOffline(); return SEED.products.find(p => p.id === +id); }
    },
    async categories() {
      try { return await req('GET', '/categories'); }
      catch (e) { offline = true; markOffline(); return SEED.categories.map(c => ({ ...c, count: SEED.products.filter(p => p.categoryId === c.id).length })); }
    },
    async settings() {
      try { return await req('GET', '/settings'); }
      catch (e) { offline = true; markOffline(); return SEED.settings; }
    },
    // admin write operations (требуют сервер)
    createProduct: (b) => req('POST', '/products', b),
    updateProduct: (id, b) => req('PUT', '/products/' + id, b),
    patchProduct: (id, b) => req('PATCH', '/products/' + id, b),
    deleteProduct: (id) => req('DELETE', '/products/' + id),
    reorderProducts: (ids) => req('POST', '/products/reorder', { ids }),
    createCategory: (b) => req('POST', '/categories', b),
    updateCategory: (id, b) => req('PUT', '/categories/' + id, b),
    deleteCategory: (id) => req('DELETE', '/categories/' + id),
    reorderCategories: (ids) => req('POST', '/categories/reorder', { ids }),
    uploadMedia: (b) => req('POST', '/media', b),
    deleteMedia: (id) => req('DELETE', '/media/' + id),
    listMedia: () => req('GET', '/media'),
    saveSettings: (b) => req('PUT', '/settings', b),
    auth: (token) => req('POST', '/auth', { token }),
  };

  function markOffline() {
    const pill = document.getElementById('offlinePill');
    if (pill) pill.style.display = 'block';
  }
})();

// ── Orders API ────────────────────────────────────────────────
Object.assign(window.API, {
  createOrder:  (b) => req('POST', '/orders', b),
  getOrder:     (id) => req('GET', '/orders/' + id),
  payOrder:     (id) => req('PATCH', '/orders/' + id, { status: 'paid' }),
  cancelOrder:  (id) => req('PATCH', '/orders/' + id, { status: 'cancelled' }),
  listOrders:   (params) => req('GET', '/orders' + qs(params)),
  deleteOrder:  (id) => req('DELETE', '/orders/' + id),
  orderStats:   () => req('GET', '/orders/stats'),
  patchOrderAdmin: (id, b) => req('PATCH', '/orders/' + id, b),
});
