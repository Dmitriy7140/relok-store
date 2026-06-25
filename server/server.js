'use strict';
/* ═══════════════════════════════════════════════════════════════
   Релок v2 — premium backend.
   node:http + node:sqlite. REST API + статика.
   ═══════════════════════════════════════════════════════════════ */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { all, get, run } = require('./db');

const PORT = process.env.PORT || 3000;
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'relok-admin';
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
    inStock: !!r.in_stock, popularity: r.popularity,
    isNew: !!r.is_new, isSale: !!r.is_sale, isPreorder: !!r.is_preorder,
    isFeatured: !!r.is_featured, position: r.position, hidden: !!r.hidden,
    meta, createdAt: r.created_at,
  };
}
function shapeCategory(r) {
  return {
    id: r.id, slug: r.slug, title: r.title, icon: r.icon,
    type: r.type, position: r.position, hidden: !!r.hidden,
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
      const pos = get('SELECT COALESCE(MAX(position),-1)+1 AS p FROM products').p;
      const info = run(`INSERT INTO products
        (type,category_id,name,description,emoji,image,platform,edition,price,old_price,
         in_stock,popularity,is_new,is_sale,is_preorder,is_featured,position,meta)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [b.type||'game', b.categoryId||null, String(b.name).trim(), b.description||'',
         b.emoji||'🎮', b.image||'', b.platform||'', b.edition||'',
         Math.round(+b.price||0), b.oldPrice ? Math.round(+b.oldPrice) : null,
         intBool(b.inStock??true), +b.popularity||0,
         intBool(b.isNew), intBool(b.isSale||(b.oldPrice&&+b.oldPrice>+b.price)),
         intBool(b.isPreorder), intBool(b.isFeatured), pos, JSON.stringify(b.meta||{})]);
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
      const rows = all(`SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id=c.id AND p.hidden=0) AS count
                        FROM categories c ${isAdmin ? '' : 'WHERE c.hidden=0'} ORDER BY position,id`);
      return ok(res, rows.map(r => ({ ...shapeCategory(r), count: r.count })));
    }
    if (method === 'POST') {
      if (!needAdmin()) return;
      let b; try { b = await readBody(req); } catch (e) { return bad(res, e.message); }
      if (!b.title || !String(b.title).trim()) return bad(res, 'Укажите название категории');
      const slug = (b.slug||b.title).toString().toLowerCase().replace(/[^a-zа-я0-9]+/gi,'-').replace(/^-|-$/g,'')||'cat-'+Date.now();
      if (get('SELECT id FROM categories WHERE slug=?', [slug])) return bad(res, 'Категория с таким адресом уже существует');
      const pos = get('SELECT COALESCE(MAX(position),-1)+1 AS p FROM categories').p;
      const info = run('INSERT INTO categories (slug,title,icon,type,position,description) VALUES (?,?,?,?,?,?)',
        [slug, String(b.title).trim(), b.icon||'📦', b.type||'game', pos, b.description||'']);
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
  log.info(`Релок v2 запущен`);
  log.info(`Витрина:       http://localhost:${PORT}/`);
  log.info(`Админ-панель:  http://localhost:${PORT}/admin  (токен: ${ADMIN_TOKEN})`);
});
