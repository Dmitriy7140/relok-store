'use strict';
/* ═══════════════════════════════════════════════════════════════
   Logovo PlayStation — backend.
   node:http + node:sqlite. REST API + статика.
   ═══════════════════════════════════════════════════════════════ */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { all, get, run, generateOrderId, shapeOrder } = require('./db');
const notify = require('./notifications');
const price  = require('./priceService');
const pay    = require('./payment');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'logovo-admin';
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

/* ── Логирование ─────────────────────────────────────────────── */
const log = {
  info: (...a) => console.log(new Date().toISOString(), '[INFO]', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), '[WARN]', ...a),
  err:  (...a) => console.error(new Date().toISOString(), '[ERR]', ...a),
};

/* ── Утилиты ─────────────────────────────────────────────────── */
const json = (res, code, body) => {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(body));
};
const ok  = (res, body) => json(res, 200, body);
const bad = (res, msg, code = 400) => json(res, code, { error: msg });

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 16e6) { req.destroy(); reject(new Error('Payload too large')); } });
    req.on('end', () => { if (!raw) return resolve({}); try { resolve(JSON.parse(raw)); } catch { reject(new Error('Некорректный JSON')); } });
    req.on('error', reject);
  });
}

/* ── Регионы (каждый — отдельный магазин) ────────────────────── */
const REGIONS = ['tr', 'in'];
const normRegion = (r) => REGIONS.includes(r) ? r : 'tr';

/* ── Форматирование данных ───────────────────────────────────── */
function shapeProduct(r) {
  if (!r) return r;
  let meta = {};
  try { meta = JSON.parse(r.meta || '{}'); } catch {}
  const sale = r.old_price && r.old_price > r.price
    ? Math.round((1 - r.price / r.old_price) * 100) : 0;
  return {
    id: r.id, type: r.type, categoryId: r.category_id,
    name: r.name, description: r.description, emoji: r.emoji, image: r.image,
    platform: r.platform, edition: r.edition,
    price: r.price, oldPrice: r.old_price || null, sale,
    // Ценовые поля PriceCalculatorService
    originalPriceTRY:  r.price_try     || 0,
    exchangeMultiplier: r.multiplier   || 0,
    lastPriceUpdate:   r.price_updated || null,
    inStock: !!r.in_stock, popularity: r.popularity,
    isNew: !!r.is_new, isSale: !!r.is_sale, isPreorder: !!r.is_preorder,
    isFeatured: !!r.is_featured, position: r.position, hidden: !!r.hidden,
    region: r.region || 'tr',
    meta, createdAt: r.created_at,
  };
}
function shapeCategory(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, icon: r.icon,
    type: r.type, position: r.position, hidden: !!r.hidden,
    region: r.region || 'tr',
    description: r.description || '',
  };
}

/* ── Валидация ───────────────────────────────────────────────── */
function validateProduct(b, partial = false) {
  const e = [];
  if (!partial || b.name !== undefined)
    if (!b.name || !String(b.name).trim()) e.push('Укажите название товара');
  if (!partial || b.price !== undefined) {
    const p = Number(b.price);
    if (!Number.isFinite(p) || p < 0) e.push('Цена должна быть числом ≥ 0');
  }
  if (b.oldPrice != null && b.oldPrice !== '') {
    const op = Number(b.oldPrice);
    if (!Number.isFinite(op) || op < 0) e.push('Старая цена должна быть числом ≥ 0');
  }
  if (b.type && !['game', 'sub', 'code'].includes(b.type)) e.push('Неизвестный тип товара');
  return e;
}

const intBool = v => (v === true || v === 1 || v === '1') ? 1 : 0;

/* Пометить заказ оплаченным (идемпотентно) + уведомления */
function markOrderPaid(id, paymentId) {
  const row = get('SELECT * FROM orders WHERE id=?', [id]);
  if (!row) return null;
  if (row.status === 'paid') return shapeOrder(row); // уже оплачен — ничего не делаем
  let meta = {}; try { meta = JSON.parse(row.meta || '{}'); } catch {}
  if (paymentId) meta.paymentId = paymentId;
  run(`UPDATE orders SET status='paid', paid_at=datetime('now'), updated_at=datetime('now'), meta=? WHERE id=?`,
    [JSON.stringify(meta), id]);
  const updated = shapeOrder(get('SELECT * FROM orders WHERE id=?', [id]));
  log.info('Order PAID:', id, '—', updated.amount + '₽', paymentId ? `(yk:${paymentId})` : '');
  notify.notifyOrderPaid(updated).catch(() => {});
  return updated;
}

/* Проверить один заказ в ЮKassa и обновить статус (для поллинга и /status).
   Возвращает свежий shapeOrder. */
async function syncOrderPayment(order) {
  if (!order || order.status !== 'pending' || !pay.isConfigured()) return order;
  const paymentId = order.meta && order.meta.paymentId;
  if (!paymentId) return order;
  try {
    const p = await pay.getPayment(paymentId);
    if (p.status === 'succeeded' && p.paid) {
      return markOrderPaid(order.id, paymentId) || order;
    }
    if (p.status === 'canceled') {
      run("UPDATE orders SET status='cancelled', updated_at=datetime('now') WHERE id=?", [order.id]);
      const upd = shapeOrder(get('SELECT * FROM orders WHERE id=?', [order.id]));
      log.info('Order CANCELED (yk):', order.id);
      notify.notifyOrderCancelled(upd).catch(() => {});
      return upd;
    }
  } catch (e) {
    log.err('Sync payment error', paymentId, e.message);
  }
  return order;
}

/* Фоновый поллинг: подтверждаем оплату без вебхука.
   Опрашиваем "висящие" заказы за последние сутки. */
let _polling = false;
async function pollPendingPayments() {
  if (_polling || !pay.isConfigured()) return;
  _polling = true;
  try {
    const rows = all("SELECT * FROM orders WHERE status='pending' AND created_at >= datetime('now','-1 day')");
    for (const row of rows) {
      const order = shapeOrder(row);
      if (order.meta && order.meta.paymentId) await syncOrderPayment(order);
    }
  } catch (e) {
    log.err('pollPendingPayments:', e.message);
  } finally {
    _polling = false;
  }
}

/* Базовый URL приложения (для return_url ЮKassa) */
function baseUrl(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}`;
}

/* ── API ─────────────────────────────────────────────────────── */
async function api(req, res, url) {
  const seg = url.pathname.split('/').filter(Boolean);
  const method = req.method;
  const isAdmin = req.headers['x-admin-token'] === ADMIN_TOKEN;
  const needAdmin = () => {
    if (!isAdmin) { json(res, 401, { error: 'Требуется авторизация администратора' }); return false; }
    return true;
  };

  /* ── /api/products ── */
  if (seg[1] === 'products' && seg.length === 2) {
    if (method === 'GET') {
      const q = url.searchParams;
      const where = [], params = [];
      where.push('region = ?'); params.push(normRegion(q.get('region')));
      if (!isAdmin) where.push('hidden = 0');
      if (q.get('type')) { where.push('type = ?'); params.push(q.get('type')); }
      if (q.get('category')) { where.push('category_id = ?'); params.push(+q.get('category')); }
      const flag = q.get('flag');
      if (flag === 'new')      where.push('is_new = 1');
      if (flag === 'sale')     where.push('is_sale = 1');
      if (flag === 'preorder') where.push('is_preorder = 1');
      if (flag === 'featured') where.push('is_featured = 1');
      if (flag === 'instock')  where.push('in_stock = 1');
      const search = (q.get('q') || '').trim();
      if (search) { where.push('(name LIKE ? OR description LIKE ? OR platform LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
      const sort = q.get('sort') || 'position';
      const order = ({
        price_asc: 'price ASC', price_desc: 'price DESC',
        popular: 'popularity DESC', new: 'created_at DESC, id DESC',
        name: 'name ASC', position: 'position ASC, id ASC',
        sale: 'is_sale DESC, popularity DESC',
      })[sort] || 'position ASC, id ASC';
      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';
      const total = get(`SELECT COUNT(*) AS c FROM products ${whereSql}`, params).c;
      const limit = Math.min(+q.get('limit') || 100, 200);
      const page = Math.max(+q.get('page') || 1, 1);
      const offset = (page - 1) * limit;
      const rows = all(
        `SELECT * FROM products ${whereSql} ORDER BY ${order} LIMIT ? OFFSET ?`,
        [...params, limit, offset]);
      return ok(res, {
        items: rows.map(shapeProduct),
        page, limit, total, pages: Math.max(1, Math.ceil(total / limit)),
      });
    }
    if (method === 'POST') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (err) { return bad(res, err.message); }
      const errs = validateProduct(b);
      if (errs.length) return bad(res, errs.join('. '));
      const region = normRegion(b.region);
      const pos = get('SELECT COALESCE(MAX(position),-1)+1 AS p FROM products WHERE region=?', [region]).p;
      const info = run(`INSERT INTO products
        (type,category_id,name,description,emoji,image,platform,edition,price,old_price,
         in_stock,popularity,is_new,is_sale,is_preorder,is_featured,position,meta,region)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [b.type||'game', b.categoryId||null, String(b.name).trim(), b.description||'',
         b.emoji||'🎮', b.image||'', b.platform||'', b.edition||'',
         Math.round(+b.price||0), b.oldPrice ? Math.round(+b.oldPrice) : null,
         intBool(b.inStock??true), +b.popularity||0,
         intBool(b.isNew), intBool(b.isSale||(b.oldPrice&&+b.oldPrice>+b.price)),
         intBool(b.isPreorder), intBool(b.isFeatured), pos, JSON.stringify(b.meta||{}), region]);
      log.info('Product created:', info.lastInsertRowid);
      return ok(res, shapeProduct(get('SELECT * FROM products WHERE id=?', [info.lastInsertRowid])));
    }
  }

  /* ── /api/products/:id ── */
  if (seg[1] === 'products' && seg.length === 3) {
    if (seg[2] === 'reorder' && method === 'POST') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      const ids = Array.isArray(b.ids) ? b.ids : [];
      ids.forEach((id, i) => run('UPDATE products SET position=? WHERE id=?', [i, +id]));
      return ok(res, { ok: true });
    }
    const id = +seg[2];
    const row = get('SELECT * FROM products WHERE id=?', [id]);
    if (!row) return bad(res, 'Товар не найден', 404);
    if (method === 'GET') return ok(res, shapeProduct(row));
    if (method === 'PUT' || method === 'PATCH') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      const errs = validateProduct(b, true);
      if (errs.length) return bad(res, errs.join('. '));
      const map = { type:'type', name:'name', description:'description', emoji:'emoji',
        image:'image', platform:'platform', edition:'edition', categoryId:'category_id',
        popularity:'popularity', position:'position' };
      const sets = [], params = [];
      for (const [k, col] of Object.entries(map))
        if (b[k] !== undefined) { sets.push(`${col}=?`); params.push(b[k]); }
      if (b.name !== undefined) { const ni = sets.findIndex(s=>s.startsWith('name=')); if(ni>=0) params[ni]=String(b.name).trim(); }
      if (b.price !== undefined) { sets.push('price=?'); params.push(Math.round(+b.price)); }
      if (b.oldPrice !== undefined) { sets.push('old_price=?'); params.push(b.oldPrice ? Math.round(+b.oldPrice) : null); }
      for (const [k, col] of Object.entries({ inStock:'in_stock', isNew:'is_new', isSale:'is_sale', isPreorder:'is_preorder', isFeatured:'is_featured', hidden:'hidden' }))
        if (b[k] !== undefined) { sets.push(`${col}=?`); params.push(intBool(b[k])); }
      if (b.meta !== undefined) { sets.push('meta=?'); params.push(JSON.stringify(b.meta)); }
      if (!sets.length) return bad(res, 'Нет данных для обновления');
      params.push(id);
      run(`UPDATE products SET ${sets.join(',')} WHERE id=?`, params);
      return ok(res, shapeProduct(get('SELECT * FROM products WHERE id=?', [id])));
    }
    if (method === 'DELETE') {
      if (!needAdmin()) return;
      run('DELETE FROM products WHERE id=?', [id]);
      log.info('Product deleted:', id);
      return ok(res, { ok: true });
    }
  }

  /* ── /api/categories ── */
  if (seg[1] === 'categories' && seg.length === 2) {
    if (method === 'GET') {
      const region = normRegion(url.searchParams.get('region'));
      const visSql = isAdmin ? 'WHERE c.region=?' : 'WHERE c.region=? AND c.hidden=0';
      const rows = all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.hidden=0) AS count
                        FROM categories c ${visSql} ORDER BY position,id`, [region]);
      return ok(res, rows.map(r => ({ ...shapeCategory(r), count: r.count })));
    }
    if (method === 'POST') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      if (!b.title || !String(b.title).trim()) return bad(res, 'Укажите название категории');
      const region = normRegion(b.region);
      const base = (b.slug||b.title).toString().toLowerCase().replace(/[^a-zа-я0-9]+/gi,'-').replace(/^-|-$/g,'')||'cat-'+Date.now();
      // slug уникален глобально — добавляем суффикс региона, чтобы регионы не конфликтовали
      const slug = region === 'tr' ? base : `${base}-${region}`;
      if (get('SELECT id FROM categories WHERE slug=?', [slug])) return bad(res, 'Категория с таким адресом уже существует');
      const pos = get('SELECT COALESCE(MAX(position),-1)+1 AS p FROM categories WHERE region=?', [region]).p;
      const info = run('INSERT INTO categories (slug,title,icon,type,position,description,region) VALUES (?,?,?,?,?,?,?)',
        [slug, String(b.title).trim(), b.icon||'📦', b.type||'game', pos, b.description||'', region]);
      return ok(res, shapeCategory(get('SELECT * FROM categories WHERE id=?', [info.lastInsertRowid])));
    }
  }
  if (seg[1] === 'categories' && seg.length === 3) {
    if (seg[2] === 'reorder' && method === 'POST') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      (b.ids||[]).forEach((id, i) => run('UPDATE categories SET position=? WHERE id=?', [i, +id]));
      return ok(res, { ok: true });
    }
    const id = +seg[2];
    const row = get('SELECT * FROM categories WHERE id=?', [id]);
    if (!row) return bad(res, 'Категория не найдена', 404);
    if (method === 'GET') return ok(res, shapeCategory(row));
    if (method === 'PUT' || method === 'PATCH') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      const sets = [], params = [];
      for (const [k, col] of Object.entries({ title:'title', icon:'icon', type:'type', description:'description' }))
        if (b[k] !== undefined) { sets.push(`${col}=?`); params.push(b[k]); }
      if (b.hidden !== undefined) { sets.push('hidden=?'); params.push(intBool(b.hidden)); }
      if (!sets.length) return bad(res, 'Нет данных для обновления');
      params.push(id);
      run(`UPDATE categories SET ${sets.join(',')} WHERE id=?`, params);
      return ok(res, shapeCategory(get('SELECT * FROM categories WHERE id=?', [id])));
    }
    if (method === 'DELETE') {
      if (!needAdmin()) return;
      run('DELETE FROM categories WHERE id=?', [id]);
      return ok(res, { ok: true });
    }
  }

  /* ── /api/media ── */
  if (seg[1] === 'media' && seg.length === 2 && method === 'POST') {
    if (!needAdmin()) return;
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    if (!b.data || !b.mime) return bad(res, 'Передайте файл (data + mime)');
    if (!/^image\//.test(b.mime)) return bad(res, 'Допускаются только изображения');
    const data = String(b.data).split(',').pop();
    if (data.length > 8e6) return bad(res, 'Изображение слишком большое (макс ~6 МБ)');
    const info = run('INSERT INTO media (filename,mime,data) VALUES (?,?,?)',
      [b.filename||'image', b.mime, data]);
    log.info('Media uploaded:', info.lastInsertRowid, b.mime);
    return ok(res, { id: info.lastInsertRowid, url: `/api/media/${info.lastInsertRowid}` });
  }
  if (seg[1] === 'media' && seg.length === 2 && method === 'GET') {
    if (!needAdmin()) return;
    const rows = all('SELECT id, filename, mime, created_at, LENGTH(data) AS size FROM media ORDER BY id DESC');
    return ok(res, rows.map(r => ({ id: r.id, filename: r.filename, mime: r.mime, createdAt: r.created_at, size: r.size, url: `/api/media/${r.id}` })));
  }
  if (seg[1] === 'media' && seg.length === 3) {
    const id = +seg[2];
    if (method === 'GET') {
      const m = get('SELECT * FROM media WHERE id=?', [id]);
      if (!m) return bad(res, 'Файл не найден', 404);
      const buf = Buffer.from(m.data, 'base64');
      res.writeHead(200, { 'Content-Type': m.mime, 'Cache-Control': 'public, max-age=31536000', 'Content-Length': buf.length });
      return res.end(buf);
    }
    if (method === 'DELETE') {
      if (!needAdmin()) return;
      run('DELETE FROM media WHERE id=?', [id]);
      return ok(res, { ok: true });
    }
  }

  /* ── /api/settings ── */
  if (seg[1] === 'settings') {
    if (method === 'GET') {
      const out = {};
      all('SELECT * FROM settings').forEach(r => { try { out[r.key] = JSON.parse(r.value); } catch { out[r.key] = r.value; } });
      return ok(res, out);
    }
    if (method === 'PUT') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      for (const [k, v] of Object.entries(b))
        run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)', [k, JSON.stringify(v)]);
      return ok(res, { ok: true });
    }
  }

  /* ── /api/auth ── */
  if (seg[1] === 'auth' && method === 'POST') {
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    if (b.token === ADMIN_TOKEN) return ok(res, { ok: true, role: 'admin' });
    log.warn('Failed auth attempt');
    return json(res, 401, { error: 'Неверный токен' });
  }

  /* ── /api/stats ── */
  if (seg[1] === 'stats' && method === 'GET') {
    if (!needAdmin()) return;
    const products = get('SELECT COUNT(*) AS c FROM products').c;
    const hidden   = get('SELECT COUNT(*) AS c FROM products WHERE hidden=1').c;
    const inStock  = get('SELECT COUNT(*) AS c FROM products WHERE in_stock=1 AND hidden=0').c;
    const onSale   = get('SELECT COUNT(*) AS c FROM products WHERE is_sale=1 AND hidden=0').c;
    const cats     = get('SELECT COUNT(*) AS c FROM categories').c;
    const media    = get('SELECT COUNT(*) AS c FROM media').c;
    const byType   = all('SELECT type, COUNT(*) AS c FROM products GROUP BY type');
    return ok(res, { products, hidden, inStock, onSale, cats, media, byType });
  }

  /* ══════════════════════════════════════════════════════════════
     /api/orders — создание, просмотр, смена статуса
     ══════════════════════════════════════════════════════════════ */

  /* Создать заказ (публичный).
     Персональные данные клиента (Telegram, аккаунт, и т.д.) собираются ПОСЛЕ оплаты
     через POST /orders/:id/info — поэтому на этом шаге обязательны только товар и сумма. */
  if (seg[1] === 'orders' && seg.length === 2 && method === 'POST') {
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }

    const errs = [];
    if (!b.productName || !String(b.productName).trim()) errs.push('Укажите товар');
    if (b.amount == null || isNaN(+b.amount) || +b.amount < 0) errs.push('Некорректная сумма');
    if (errs.length) return bad(res, errs.join('. '));

    const id = generateOrderId();
    run(`INSERT INTO orders
      (id, psn_id, nickname, telegram, email, product_name, product_id, amount, comment, status, meta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        b.psnId       ? String(b.psnId).trim()       : '',
        b.nickname    ? String(b.nickname).trim()    : '',
        b.telegram    ? String(b.telegram).trim()    : '',
        b.email       ? String(b.email).trim()       : '',
        String(b.productName).trim(),
        b.productId ? +b.productId : null,
        Math.round(+b.amount || 0),
        b.comment     ? String(b.comment).trim()     : '',
        'pending',
        JSON.stringify(b.meta || {}),
      ]
    );

    const order = shapeOrder(get('SELECT * FROM orders WHERE id=?', [id]));
    log.info('Order created (pending, данные клиента позже):', id, '—', order.productName, order.amount + '₽');
    // Уведомление НЕ шлём здесь: персональные данные ещё не собраны (см. /orders/:id/info)
    return ok(res, order);
  }

  /* Данные клиента для выполнения заказа (публично, по ID заказа — после оплаты) */
  if (seg[1] === 'orders' && seg.length === 4 && seg[3] === 'info' && method === 'POST') {
    const id = seg[2];
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    const row = get('SELECT * FROM orders WHERE id=?', [id]);
    if (!row) return bad(res, 'Заказ не найден', 404);

    const errs = [];
    if (!b.telegram || !String(b.telegram).trim()) errs.push('Укажите Telegram для связи');
    if (!b.accLogin || !String(b.accLogin).trim()) errs.push('Укажите данные аккаунта');
    if (errs.length) return bad(res, errs.join('. '));

    let meta = {}; try { meta = JSON.parse(row.meta || '{}'); } catch {}
    if (b.meta && typeof b.meta === 'object') meta = { ...meta, ...b.meta };
    meta.accLogin = String(b.accLogin).trim();
    if (b.accPass != null) meta.accPass = String(b.accPass).trim();

    let telegram = String(b.telegram).trim();
    if (telegram && !telegram.startsWith('@') && !/^https?:/i.test(telegram)) telegram = '@' + telegram;
    const email    = b.email   != null ? String(b.email).trim()   : (row.email || '');
    if (email) meta.email = email;
    const comment  = b.comment != null ? String(b.comment).trim() : (row.comment || '');
    const psnId    = String(b.accLogin).trim();
    const nickname = (b.nickname && String(b.nickname).trim())
      || telegram.replace(/^@/, '')
      || (email ? email.split('@')[0] : 'client');

    run(`UPDATE orders SET psn_id=?, nickname=?, telegram=?, email=?, comment=?, meta=?, updated_at=datetime('now') WHERE id=?`,
      [psnId, nickname, telegram, email, comment, JSON.stringify(meta), id]);

    const updated = shapeOrder(get('SELECT * FROM orders WHERE id=?', [id]));
    log.info('Order info received:', id, '— Telegram:', telegram);
    // Полное уведомление администратору: оплата + данные для выполнения
    notify.notifyOrderData(updated).catch(() => {});
    return ok(res, updated);
  }

  /* Список заказов (только админ) */
  if (seg[1] === 'orders' && seg.length === 2 && method === 'GET') {
    if (!needAdmin()) return;
    const q       = url.searchParams;
    const status  = q.get('status');
    const where   = status ? 'WHERE status=?' : '';
    const params  = status ? [status] : [];
    const limit   = Math.min(+q.get('limit') || 50, 200);
    const page    = Math.max(+q.get('page') || 1, 1);
    const offset  = (page - 1) * limit;
    const total   = get(`SELECT COUNT(*) AS c FROM orders ${where}`, params).c;
    const rows    = all(
      `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return ok(res, { items: rows.map(shapeOrder), total, page, pages: Math.ceil(total / limit) });
  }

  /* Один заказ по ID */
  if (seg[1] === 'orders' && seg.length === 3) {
    const id  = seg[2];
    const row = get('SELECT * FROM orders WHERE id=?', [id]);
    if (!row) return bad(res, 'Заказ не найден', 404);

    /* GET — просмотр */
    if (method === 'GET') return ok(res, shapeOrder(row));

    /* PATCH — смена статуса (только для оплаты — доступна публично по ID заказа,
               остальные статусы — только для админа) */
    if (method === 'PATCH') {
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      const allowed = ['pending', 'paid', 'activated', 'cancelled', 'refunded'];

      if (!b.status || !allowed.includes(b.status))
        return bad(res, 'Допустимые статусы: ' + allowed.join(', '));

      // Переход в paid доступен публично (платёжная система вызывает по ID),
      // остальные смены — только для админа
      if (b.status !== 'paid' && !isAdmin)
        return json(res, 401, { error: 'Требуется авторизация' });

      const sets = ['status=?', 'updated_at=datetime(\'now\')'];
      const params = [b.status];

      if (b.status === 'paid') {
        sets.push('paid_at=datetime(\'now\')');
      }

      run(`UPDATE orders SET ${sets.join(',')} WHERE id=?`, [...params, id]);

      const updated = shapeOrder(get('SELECT * FROM orders WHERE id=?', [id]));
      log.info('Order status:', id, '→', b.status);

      // Уведомления по статусу
      if (b.status === 'paid')      notify.notifyOrderPaid(updated).catch(() => {});
      if (b.status === 'activated') notify.notifyOrderActivated(updated).catch(() => {});
      if (b.status === 'cancelled') notify.notifyOrderCancelled(updated).catch(() => {});

      return ok(res, updated);
    }

    /* DELETE — только для админа */
    if (method === 'DELETE') {
      if (!needAdmin()) return;
      run('DELETE FROM orders WHERE id=?', [id]);
      log.info('Order deleted:', id);
      return ok(res, { ok: true });
    }
  }

  /* Статистика заказов (для дашборда) */
  if (seg[1] === 'orders' && seg[2] === 'stats' && method === 'GET') {
    if (!needAdmin()) return;
    const total   = get('SELECT COUNT(*) AS c FROM orders').c;
    const pending = get('SELECT COUNT(*) AS c FROM orders WHERE status=\'pending\'').c;
    const paid    = get('SELECT COUNT(*) AS c FROM orders WHERE status=\'paid\'').c;
    const revenue = get('SELECT COALESCE(SUM(amount),0) AS s FROM orders WHERE status=\'paid\'').s;
    return ok(res, { total, pending, paid, revenue });
  }

  /* ══════════════════════════════════════════════════════════════
     /api/prices — PriceCalculatorService API
     ══════════════════════════════════════════════════════════════ */

  /* GET /api/prices/formula — возвращает текущую формулу конвертации */
  if (seg[1] === 'prices' && seg[2] === 'formula' && method === 'GET') {
    return ok(res, {
      tiers: price.TIERS,
      examples: [
        { try: 450,  rub: price.convertTRY(450).rub,  multiplier: price.convertTRY(450).multiplier },
        { try: 750,  rub: price.convertTRY(750).rub,  multiplier: price.convertTRY(750).multiplier },
        { try: 1200, rub: price.convertTRY(1200).rub, multiplier: price.convertTRY(1200).multiplier },
        { try: 2000, rub: price.convertTRY(2000).rub, multiplier: price.convertTRY(2000).multiplier },
        { try: 3000, rub: price.convertTRY(3000).rub, multiplier: price.convertTRY(3000).multiplier },
      ],
    });
  }

  /* POST /api/prices/convert — конвертировать произвольную сумму */
  if (seg[1] === 'prices' && seg[2] === 'convert' && method === 'POST') {
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    const priceTRY = +b.priceTRY;
    if (!priceTRY || priceTRY < 0) return bad(res, 'Укажите priceTRY > 0');
    return ok(res, price.buildPriceInfo(priceTRY));
  }

  /* POST /api/prices/update/:id — обновить цену одного товара (admin) */
  if (seg[1] === 'prices' && seg[2] === 'update' && seg[3] && method === 'POST') {
    if (!needAdmin()) return;
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    const productId = +seg[3];
    const priceTRY  = +b.priceTRY;
    if (!priceTRY || priceTRY <= 0) return bad(res, 'Укажите priceTRY > 0');
    const result = price.updateProductPrice(productId, priceTRY, 'manual');
    if (!result) return bad(res, 'Товар не найден', 404);
    log.info('Price updated:', productId, priceTRY + ' TRY →', result.priceRUB + ' ₽');
    return ok(res, result);
  }

  /* POST /api/prices/bulk — массовое обновление цен (admin) */
  if (seg[1] === 'prices' && seg[2] === 'bulk' && method === 'POST') {
    if (!needAdmin()) return;
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    // b.items = [{ id, priceTRY }, ...]
    if (!Array.isArray(b.items) || !b.items.length) return bad(res, 'Передайте items: [{id, priceTRY}]');
    const results = price.bulkSetTRYPrices(b.items, 'manual');
    log.info('Bulk price update:', results.length, 'товаров');
    return ok(res, { updated: results.length, items: results });
  }

  /* POST /api/prices/recalculate — пересчитать все цены (admin) */
  if (seg[1] === 'prices' && seg[2] === 'recalculate' && method === 'POST') {
    if (!needAdmin()) return;
    log.info('Manual recalculation triggered');
    const result = price.recalculateAll('manual');
    return ok(res, result);
  }

  /* GET /api/prices/:id — детали цены одного товара */
  if (seg[1] === 'prices' && seg[2] && seg[2] !== 'formula' && !seg[3] && method === 'GET') {
    const detail = price.getProductPriceDetail(+seg[2]);
    if (!detail) return bad(res, 'Товар не найден', 404);
    return ok(res, detail);
  }

  /* GET /api/prices/:id/history — история изменений цены */
  if (seg[1] === 'prices' && seg[3] === 'history' && method === 'GET') {
    if (!needAdmin()) return;
    const limit = Math.min(+(new URL(req.url, 'http://x').searchParams.get('limit')) || 20, 100);
    const history = price.getPriceHistory(+seg[2], limit);
    return ok(res, history);
  }

  /* ══════════════════════════════════════════════════════════════
     /api/pay — ЮKassa: создание платежа, статус, вебхук
     ══════════════════════════════════════════════════════════════ */

  /* Создать платёж по существующему заказу (публично — по ID заказа) */
  if (seg[1] === 'pay' && seg[2] === 'create' && method === 'POST') {
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    if (!pay.isConfigured()) return bad(res, 'Платёжная система не настроена', 503);
    const orderId = String(b.orderId || '').trim();
    if (!orderId) return bad(res, 'Укажите orderId');
    const order = shapeOrder(get('SELECT * FROM orders WHERE id=?', [orderId]));
    if (!order) return bad(res, 'Заказ не найден', 404);
    if (order.status === 'paid') return bad(res, 'Заказ уже оплачен');
    if (!(order.amount > 0)) return bad(res, 'Сумма заказа должна быть больше 0');

    // Возврат пользователя на экран оплаты заказа
    const returnUrl = `${baseUrl(req)}/#/pay/${order.id}`;
    try {
      const p = await pay.createPayment(order, returnUrl);
      // Сохраняем paymentId в meta заказа
      const meta = order.meta || {}; meta.paymentId = p.id;
      run('UPDATE orders SET meta=?, updated_at=datetime(\'now\') WHERE id=?', [JSON.stringify(meta), order.id]);
      log.info('Payment created:', p.id, 'для заказа', order.id, order.amount + '₽');
      return ok(res, { confirmationUrl: p.confirmationUrl, paymentId: p.id, status: p.status });
    } catch (e) {
      log.err('ЮKassa create error:', e.message);
      return bad(res, 'Не удалось создать платёж: ' + e.message, 502);
    }
  }

  /* Статус оплаты заказа (публично, для опроса после возврата) */
  if (seg[1] === 'pay' && seg[2] === 'status' && seg[3] && method === 'GET') {
    let order = shapeOrder(get('SELECT * FROM orders WHERE id=?', [seg[3]]));
    if (!order) return bad(res, 'Заказ не найден', 404);
    // Живая проверка в ЮKassa, если заказ ещё не оплачен
    order = await syncOrderPayment(order);
    return ok(res, { id: order.id, status: order.status, amount: order.amount, paidAt: order.paidAt });
  }

  /* Вебхук ЮKassa (payment.succeeded / canceled).
     Тело не доверяем — перепроверяем платёж через API по его id. */
  if (seg[1] === 'pay' && seg[2] === 'webhook' && method === 'POST') {
    let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
    const event = b && b.event;
    const obj   = (b && b.object) || {};
    const paymentId = obj.id;
    log.info('YK webhook:', event, paymentId);
    if (!paymentId) return ok(res, { ok: true }); // отвечаем 200, чтобы ЮKassa не ретраила вечно
    try {
      const p = await pay.getPayment(paymentId);
      const orderId = p.metadata && p.metadata.orderId;
      if (p.status === 'succeeded' && p.paid && orderId) {
        markOrderPaid(orderId, paymentId);
      }
    } catch (e) {
      log.err('YK webhook verify error:', e.message);
    }
    return ok(res, { ok: true });
  }

  return bad(res, 'Маршрут не найден', 404);
}

/* ── Статика ─────────────────────────────────────────────────── */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2',
};

function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  if (p === '/admin') p = '/admin.html';
  if (p === '/images' || p === '/image-tool') p = '/image-tool.html';
  const file = path.normalize(path.join(PUBLIC_DIR, p));
  if (!file.startsWith(PUBLIC_DIR)) return bad(res, 'Forbidden', 403);
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
    const ext = path.extname(file);
    const ct  = MIME[ext] || 'application/octet-stream';
    const cc  = ext === '.html' ? 'no-cache' : 'public, max-age=86400';
    res.writeHead(200, { 'Content-Type': ct, 'Cache-Control': cc, 'X-Frame-Options': 'SAMEORIGIN' });
    res.end(data);
  });
}

/* ── Сервер ──────────────────────────────────────────────────── */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Token');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  try {
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    return serveStatic(req, res, url);
  } catch (err) {
    log.err(err);
    json(res, 500, { error: 'Внутренняя ошибка сервера' });
  }
});

server.listen(PORT, () => {
  log.info(`Logovo PlayStation запущен`);
  log.info(`Витрина:       http://localhost:${PORT}/`);
  log.info(`Админ-панель:  http://localhost:${PORT}/admin  (токен: ${ADMIN_TOKEN})`);

  // Ценовой сервис: только миграция схемы (колонки price_*, таблица price_log).
  // Авто-отслеживание/пересчёт цен ОТКЛЮЧЕНО — цены задаются вручную и не меняются автоматически.
  try {
    price.migrate();
  } catch (err) {
    log.err('Price migrate error:', err.message);
  }

  // Поллинг оплат ЮKassa (альтернатива вебхуку)
  if (pay.isConfigured()) {
    const ms = Math.max(5000, +process.env.PAYMENT_POLL_INTERVAL_MS || 20000);
    const t = setInterval(() => { pollPendingPayments(); }, ms);
    t.unref?.();
    log.info(`Поллинг оплат ЮKassa: каждые ${ms} мс`);
  } else {
    log.warn('ЮKassa не настроена — поллинг оплат отключён');
  }

  // Запускаем Telegram-бота уведомлений (рассылка по /start-подписчикам)
  try {
    require('./telegram').start();
  } catch (err) {
    log.err('Telegram bot init error:', err.message);
  }
});
