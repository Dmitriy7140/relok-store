'use strict';
/* ═══════════════════════════════════════════════════════════════
   Logovo PlayStation — слой данных (SQLite через node:sqlite).
   ═══════════════════════════════════════════════════════════════ */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs   = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'logovo.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA cache_size = -8000;');

/* ── Схема ─────────────────────────────────────────────────── */
db.exec(`
CREATE TABLE IF NOT EXISTS categories (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  slug        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  icon        TEXT DEFAULT '📦',
  type        TEXT DEFAULT 'game',
  description TEXT DEFAULT '',
  position    INTEGER DEFAULT 0,
  hidden      INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL DEFAULT 'game',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  emoji       TEXT DEFAULT '🎮',
  image       TEXT DEFAULT '',
  platform    TEXT DEFAULT '',
  edition     TEXT DEFAULT '',
  price       INTEGER NOT NULL DEFAULT 0,
  old_price   INTEGER,
  in_stock    INTEGER DEFAULT 1,
  popularity  INTEGER DEFAULT 0,
  is_new      INTEGER DEFAULT 0,
  is_sale     INTEGER DEFAULT 0,
  is_preorder INTEGER DEFAULT 0,
  is_featured INTEGER DEFAULT 0,
  position    INTEGER DEFAULT 0,
  hidden      INTEGER DEFAULT 0,
  meta        TEXT DEFAULT '{}',
  price_try     REAL    DEFAULT 0,
  multiplier    REAL    DEFAULT 0,
  price_updated TEXT    DEFAULT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  filename   TEXT,
  mime       TEXT,
  data       TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  psn_id       TEXT NOT NULL,
  nickname     TEXT NOT NULL,
  telegram     TEXT DEFAULT '',
  email        TEXT DEFAULT '',
  product_name TEXT NOT NULL,
  product_id   INTEGER,
  amount       INTEGER NOT NULL DEFAULT 0,
  comment      TEXT DEFAULT '',
  status       TEXT DEFAULT 'pending',
  notified     INTEGER DEFAULT 0,
  meta         TEXT DEFAULT '{}',
  paid_at      TEXT,
  created_at   TEXT DEFAULT (datetime('now')),
  updated_at   TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_cat  ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_pos  ON products(position);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at DESC);
`);

/* ── Миграции ───────────────────────────────────────────────── */
try { db.exec('ALTER TABLE categories ADD COLUMN description TEXT DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN email TEXT DEFAULT ""'); } catch {}
// Регионы: каждый регион — отдельный магазин (товары/категории/цены).
// Существующий каталог = Турция ('tr'); новые регионы (напр. Индия 'in') наполняются через админку.
try { db.exec("ALTER TABLE products ADD COLUMN region TEXT NOT NULL DEFAULT 'tr'"); } catch {}
try { db.exec("ALTER TABLE categories ADD COLUMN region TEXT NOT NULL DEFAULT 'tr'"); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_products_region ON products(region)'); } catch {}
try { db.exec('CREATE INDEX IF NOT EXISTS idx_categories_region ON categories(region)'); } catch {}

/* Бонусная система: привязка заказа к пользователю Telegram + бонусные поля */
try { db.exec("ALTER TABLE orders ADD COLUMN user_id TEXT DEFAULT ''"); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN bonus_earned INTEGER DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE orders ADD COLUMN bonus_spent INTEGER DEFAULT 0'); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN pay_method TEXT DEFAULT ''"); } catch {}
try { db.exec("ALTER TABLE orders ADD COLUMN status_history TEXT DEFAULT '[]'"); } catch {}

/* ── Схема бонусной системы ─────────────────────────────────── */
db.exec(`
-- Пользователи Telegram (баланс бонусов)
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,            -- telegram user id
  username    TEXT DEFAULT '',
  first_name  TEXT DEFAULT '',
  last_name   TEXT DEFAULT '',
  photo_url   TEXT DEFAULT '',
  balance     INTEGER NOT NULL DEFAULT 0,  -- текущий баланс бонусов
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

-- Леджер бонусов (начисления/списания). amount>0 — начислено, amount<0 — списано
CREATE TABLE IF NOT EXISTS bonus_tx (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  amount     INTEGER NOT NULL,
  type       TEXT NOT NULL,               -- earn | spend_case | spend_shop | prize | admin
  ref        TEXT DEFAULT '',             -- id заказа / открытия кейса / покупки
  note       TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);

-- Бонусные товары (покупаются за бонусы)
CREATE TABLE IF NOT EXISTS bonus_products (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  description  TEXT DEFAULT '',
  emoji        TEXT DEFAULT '🎁',
  image        TEXT DEFAULT '',
  category     TEXT DEFAULT '',
  cost         INTEGER NOT NULL DEFAULT 0, -- стоимость в бонусах
  quantity     INTEGER NOT NULL DEFAULT 0, -- остаток (для ручной выдачи); авто — берётся из ключей
  auto_deliver INTEGER NOT NULL DEFAULT 0, -- 1 = выдаётся ключом из key_stock
  hidden       INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT DEFAULT (datetime('now'))
);

-- Запасы ключей для авто-выдачи
CREATE TABLE IF NOT EXISTS key_stock (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES bonus_products(id) ON DELETE CASCADE,
  key_value  TEXT NOT NULL,
  used       INTEGER NOT NULL DEFAULT 0,
  used_by    TEXT DEFAULT '',
  used_at    TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Лог выдачи ключей
CREATE TABLE IF NOT EXISTS key_delivery (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  product_id INTEGER NOT NULL,
  key_id     INTEGER NOT NULL,
  key_value  TEXT NOT NULL,
  cost       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Кейсы (рулетка)
CREATE TABLE IF NOT EXISTS cases (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL DEFAULT 'Бонусный кейс',
  cost       INTEGER NOT NULL DEFAULT 3000,
  enabled    INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Призы кейса
CREATE TABLE IF NOT EXISTS case_prizes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id    INTEGER NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  emoji      TEXT DEFAULT '🎁',
  image      TEXT DEFAULT '',
  type       TEXT NOT NULL DEFAULT 'bonus', -- bonus | product | nothing
  value      INTEGER NOT NULL DEFAULT 0,    -- bonus: сумма; product: id бонусного товара
  weight     INTEGER NOT NULL DEFAULT 1,    -- вес вероятности
  enabled    INTEGER NOT NULL DEFAULT 1,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- История открытий кейса
CREATE TABLE IF NOT EXISTS case_openings (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL,
  case_id    INTEGER NOT NULL,
  prize_id   INTEGER,
  prize_name TEXT DEFAULT '',
  cost       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Видеоотзывы (страница «Отзывы» / «Гарантии»)
CREATE TABLE IF NOT EXISTS video_reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT DEFAULT '',
  media_id   INTEGER,                       -- ссылка на media (если загружено)
  url        TEXT DEFAULT '',               -- либо внешний URL
  position   INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Текстовые отзывы (страница «Отзывы»)
CREATE TABLE IF NOT EXISTS text_reviews (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  author     TEXT DEFAULT '',               -- имя автора
  text       TEXT NOT NULL DEFAULT '',      -- текст отзыва
  rating     INTEGER NOT NULL DEFAULT 5,    -- оценка 1..5
  position   INTEGER NOT NULL DEFAULT 0,
  hidden     INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_bonus_tx_user   ON bonus_tx(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_key_stock_prod  ON key_stock(product_id, used);
CREATE INDEX IF NOT EXISTS idx_case_prizes_case ON case_prizes(case_id);
CREATE INDEX IF NOT EXISTS idx_orders_user      ON orders(user_id);
`);

/* ── Склад кодов пополнения PlayStation Turkey ──────────────────
   Отдельное хранилище кодов по номиналам (TRY). Не путать с
   key_stock (ключи бонусного магазина). Статусы:
     available — свободен, можно выдать;
     reserved  — зарезервирован под заказ (оплата подтверждена);
     sold      — выдан и закреплён за заказом.                    */
db.exec(`
CREATE TABLE IF NOT EXISTS topup_codes (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  denom        INTEGER NOT NULL,                 -- номинал TRY (250..5000)
  code         TEXT NOT NULL UNIQUE,             -- сам код (уникален)
  status       TEXT NOT NULL DEFAULT 'available',-- available | reserved | sold
  order_id     TEXT DEFAULT '',                  -- заказ, которому выдан
  user_id      TEXT DEFAULT '',                  -- покупатель (telegram id)
  uploaded_at  TEXT DEFAULT (datetime('now')),   -- дата загрузки
  reserved_at  TEXT DEFAULT NULL,
  sold_at      TEXT DEFAULT NULL                 -- дата продажи/выдачи
);
CREATE INDEX IF NOT EXISTS idx_topup_denom_status ON topup_codes(denom, status);
CREATE INDEX IF NOT EXISTS idx_topup_order        ON topup_codes(order_id);
CREATE INDEX IF NOT EXISTS idx_topup_status       ON topup_codes(status);
`);

/* Поля заказа для авто-выдачи кодов пополнения */
try { db.exec('ALTER TABLE orders ADD COLUMN price_try REAL DEFAULT 0'); } catch {}        // стоимость в лирах
try { db.exec("ALTER TABLE orders ADD COLUMN codes_json TEXT DEFAULT '[]'"); } catch {}    // выданные коды [{denom,code}]
try { db.exec('ALTER TABLE orders ADD COLUMN codes_sum INTEGER DEFAULT 0'); } catch {}     // сумма выданных кодов (TRY)
try { db.exec("ALTER TABLE orders ADD COLUMN fulfillment TEXT DEFAULT ''"); } catch {}     // '' | delivered | manual
try { db.exec('ALTER TABLE orders ADD COLUMN delivered_at TEXT DEFAULT NULL'); } catch {}

/* Счётчик числовых InvId для Robokassa (её InvId должен быть целым числом,
   а orders.id у нас строковый). Один InvId на заказ — order_id уникален. */
db.exec(`
CREATE TABLE IF NOT EXISTS robokassa_invoices (
  inv_id     INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id   TEXT NOT NULL UNIQUE,
  out_sum    TEXT NOT NULL DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
`);

/* Гарантируем наличие одного кейса по умолчанию */
try {
  const c = db.prepare('SELECT COUNT(*) AS c FROM cases').get().c;
  if (!c) db.prepare("INSERT INTO cases (name,cost,enabled) VALUES ('Бонусный кейс',3000,1)").run();
} catch {}

/* Готовые текстовые отзывы по умолчанию (если таблица пуста) */
try {
  const c = db.prepare('SELECT COUNT(*) AS c FROM text_reviews').get().c;
  if (!c) {
    const DEFAULT_REVIEWS = [
      { author: 'Анна',    text: 'Купила себе игру Just Cause 4, быстро помогли поставить на консоль — всё супер! Спасибо за поддержку 🙌', rating: 5 },
      { author: 'Дмитрий', text: 'Брал GTA V: Premium Edition. Всё оформили за пару минут, объяснили каждый шаг активации. Рекомендую!',           rating: 5 },
      { author: 'Ольга',   text: 'Оформила подписку PS Plus — активировали моментально, цена приятно удивила. Буду заказывать ещё.',           rating: 5 },
      { author: 'Игорь',   text: 'Заказывал код пополнения PSN Турция. Пришёл сразу, кошелёк пополнился без проблем. Всё честно.',            rating: 5 },
      { author: 'Марина',  text: 'Купила Resident Evil 4 Remake, переживала за установку — ребята всё сделали удалённо и помогли настроить.',   rating: 5 },
      { author: 'Сергей',  text: 'Отличный магазин! Взял Hogwarts Legacy, поставили на PS5 быстро, поддержка на связи 24/7.',                  rating: 5 },
      { author: 'Екатерина', text: 'Сначала сомневалась, но всё прошло гладко. Игра работает, аккаунт в порядке. Спасибо большое!',            rating: 5 },
      { author: 'Алексей', text: 'Быстро, недорого и с сопровождением. Помогли даже с настройкой региона на консоли. Топ!',                    rating: 5 },
    ];
    const ins = db.prepare('INSERT INTO text_reviews (author,text,rating,position) VALUES (?,?,?,?)');
    DEFAULT_REVIEWS.forEach((r, i) => ins.run(r.author, r.text, r.rating, i));
  }
} catch (e) { console.error('[SEED] текстовые отзывы:', e.message); }

/* ── Helpers ────────────────────────────────────────────────── */
function all(sql, params = []) { return db.prepare(sql).all(...params); }
function get(sql, params = []) { return db.prepare(sql).get(...params); }
function run(sql, params = []) { return db.prepare(sql).run(...params); }

/* Транзакция: выполняет fn() внутри BEGIN/COMMIT, откатывает при ошибке.
   Используется для атомарных операций с бонусами и выдачей ключей. */
function tx(fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { try { db.exec('ROLLBACK'); } catch {} throw e; }
}

/* ── Order helpers ──────────────────────────────────────────── */
function generateOrderId() {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

function shapeOrder(r) {
  if (!r) return null;
  let meta = {};
  try { meta = JSON.parse(r.meta || '{}'); } catch {}
  return {
    id: r.id, psnId: r.psn_id, nickname: r.nickname,
    telegram: r.telegram || '', email: r.email || '',
    productName: r.product_name,
    productId: r.product_id || null, amount: r.amount,
    comment: r.comment || '', status: r.status,
    notified: !!r.notified, meta,
    userId: r.user_id || '',
    bonusEarned: r.bonus_earned || 0,
    bonusSpent: r.bonus_spent || 0,
    payMethod: r.pay_method || '',
    statusHistory: (() => { try { return JSON.parse(r.status_history || '[]'); } catch { return []; } })(),
    // Авто-выдача кодов пополнения:
    priceTry: r.price_try || 0,
    codes: (() => { try { return JSON.parse(r.codes_json || '[]'); } catch { return []; } })(),
    codesSum: r.codes_sum || 0,
    fulfillment: r.fulfillment || '',
    deliveredAt: r.delivered_at || null,
    paidAt: r.paid_at || null, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

/* ══════════════════════════════════════════════════════════════
   PRICE FORMULA  (TRY → RUB)
   0–500      × 3.3
   500–1000   × 2.9
   1000–1500  × 2.75
   1500–2500  × 2.4
   2500+      × 2.3
   ══════════════════════════════════════════════════════════════ */
// Рыночный курс реселлеров PS Store Turkey 2026: 1 TRY = 0.86 RUB
// Верифицировано: 2799 TRY (Spider-Man 2) → 2410 ₽, 999 TRY (Elden Ring) → 860 ₽
function tryToRub(try_) {
  if (!try_ || try_ <= 0) return 0;
  return Math.round(try_ * 0.86 / 10) * 10;
}

/* ── Seed ───────────────────────────────────────────────────── */
function seed() {
  const productCount  = get('SELECT COUNT(*) AS c FROM products').c;
  const categoryCount = get('SELECT COUNT(*) AS c FROM categories').c;

  // Already seeded correctly — skip
  if (productCount >= 50 && categoryCount >= 7) return;

  // Outdated catalog (old version had 3 cats) — wipe and reseed
  if (productCount > 0) {
    console.log('[SEED] Устаревший каталог обнаружен — пересеваем...');
    db.exec('DELETE FROM products; DELETE FROM categories; DELETE FROM settings;');
  }

  /* ── CATEGORIES ─────────────────────────────────────────── */
  const cats = [
    { slug:'new',       title:'Новинки',                icon:'🆕', type:'game', pos:0,
      desc:'Свежие релизы 2024–2025 года' },
    { slug:'preorder',  title:'Предзаказы',              icon:'⏳', type:'game', pos:1,
      desc:'Предзакажи и получи бонусы' },
    { slug:'popular',   title:'Популярные игры',         icon:'🔥', type:'game', pos:2,
      desc:'Бестселлеры по числу продаж' },
    { slug:'exclusive', title:'Эксклюзивы PlayStation',  icon:'🎯', type:'game', pos:3,
      desc:'Только на PlayStation 4 и 5' },
    { slug:'subs',      title:'PlayStation Plus',        icon:'💎', type:'sub',  pos:4,
      desc:'Essential, Extra и Deluxe' },
    { slug:'sale',      title:'Акции и скидки',          icon:'🏷️', type:'game', pos:5,
      desc:'Лучшие цены прямо сейчас' },
    { slug:'codes',     title:'Коды пополнения',         icon:'💳', type:'code', pos:6,
      desc:'Пополнение кошелька PSN Турция' },
  ];

  cats.forEach(c =>
    run('INSERT INTO categories (slug,title,icon,type,position,description) VALUES (?,?,?,?,?,?)',
        [c.slug, c.title, c.icon, c.type, c.pos, c.desc]));

  const catId = {};
  all('SELECT id,slug FROM categories').forEach(c => catId[c.slug] = c.id);

  /* ── Product inserter ───────────────────────────────────── */
  let pos = 0;
  const P = (o) => {
    const b = (v) => (v ? 1 : 0);
    // Вычисляем TRY-цену: если передана явно — берём её,
    // иначе обратный расчёт из RUB (приближённо)
    const priceTRY  = o.priceTRY || 0;
    const mult      = priceTRY > 0 ? (
      priceTRY <= 500 ? 3.3 : priceTRY <= 1000 ? 2.9 :
      priceTRY <= 1500 ? 2.75 : priceTRY <= 2500 ? 2.4 : 2.3
    ) : 0;
    const now = new Date().toISOString();

    run(`INSERT INTO products
      (type,category_id,name,description,emoji,image,platform,edition,
       price,old_price,in_stock,popularity,is_new,is_sale,is_preorder,is_featured,
       position,meta,price_try,multiplier,price_updated)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [o.type||'game', o.catId||null, o.name, o.desc||'', o.emoji||'🎮', o.img||'',
       o.platform||'PS4/PS5', o.edition||'Standard',
       o.price||0, o.oldPrice||null, b(o.inStock??true), o.pop||0,
       b(o.isNew), b(o.isSale), b(o.isPre), b(o.isFeat),
       pos++, JSON.stringify(o.meta||{}),
       priceTRY, mult, priceTRY > 0 ? now : null]);
  };

  /* ════════════════════════════════════════════════════════════
     НОВИНКИ  (2024–2025)
     ════════════════════════════════════════════════════════════ */
  [
    {
      name:'GTA VI', desc:'Вице-Сити возвращается. Люсия и Джейсон — новые иконы Rockstar. Открытый мир, который переопределяет индустрию.',
      emoji:'🏖️', platform:'PS5', edition:'Standard', price:tryToRub(2799), priceTRY:2799, pop:99,
      isNew:true, isFeat:true, isPre:true, inStock:true, img:'',
      meta:{ size:'150+ ГБ', rating:'18+', lang:'RU субтитры ожидаются', release:'2026' }
    },
    {
      name:'Ghost of Yōtei', desc:'Следующая глава от Sucker Punch. Эдзо Каваками — женщина-самурай в Хоккайдо 1603 года. Новые механики боя и невероятный открытый мир.',
      emoji:'⛩️', platform:'PS5', edition:'Standard', price:tryToRub(2799), priceTRY:2799, pop:92,
      isNew:true, isFeat:true, isPre:true, inStock:true, img:'',
      meta:{ size:'80+ ГБ', rating:'18+', lang:'RU субтитры', release:'2025' }
    },
    {
      name:'Death Stranding 2: On the Beach', desc:'Сэм Бридж снова в пути. Кодзима расширяет мифологию и механики. Новые персонажи, новые связи и абсолютно безумная история.',
      emoji:'🌊', platform:'PS5', edition:'Standard', price:tryToRub(2499), priceTRY:2499, pop:88,
      isNew:true, isFeat:true, inStock:true, img:'',
      meta:{ size:'90 ГБ', rating:'18+', lang:'RU субтитры' }
    },
    {
      name:'Assassin\'s Creed Shadows', desc:'Феодальная Япония глазами двух героев: синоби Наоэ и самурай Ясукэ. Динамическая смена сезонов и переработанный стелс.',
      emoji:'🗡️', platform:'PS4/PS5', edition:'Standard', price:tryToRub(2100), priceTRY:2100, pop:82,
      isNew:true, inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'18+', lang:'RU субтитры' }
    },
    {
      name:'Kingdom Come: Deliverance II', desc:'Средневековая Чехия, никаких суперспособностей — только история, сталь и реализм. Продолжение культовой RPG от Warhorse Studios.',
      emoji:'⚔️', platform:'PS5', edition:'Standard', price:tryToRub(2099), priceTRY:2099, pop:84,
      isNew:true, inStock:true, img:'',
      meta:{ size:'70 ГБ', rating:'18+', lang:'RU субтитры' }
    },
    {
      name:'Monster Hunter Wilds', desc:'Живая экосистема, где монстры охотятся и конкурируют друг с другом. Динамическая погода меняет тактику охоты. Лучший Monster Hunter в истории серии.',
      emoji:'🐉', platform:'PS5', edition:'Standard', price:tryToRub(2799), priceTRY:2799, pop:91,
      isNew:true, inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'16+', lang:'RU субтитры', players:'1-4' }
    },
    {
      name:'Astro Bot', desc:'Лучшая игра 2024 по версии TGA. Астро спасает планету PlayStation — 80 уровней чистого веселья для всей семьи. Эксклюзив PS5.',
      emoji:'🤖', platform:'PS5', edition:'Standard', price:tryToRub(1899), priceTRY:1899, pop:95,
      isNew:true, isFeat:true, inStock:true, img:'',
      meta:{ size:'12 ГБ', rating:'3+', lang:'RU субтитры' }
    },
    {
      name:'Stellar Blade', desc:'Ева сражается с Нейтивами на руинах будущей Земли. Боёвка в стиле Sekiro с элементами Nier: Automata. Эксклюзив PS5 с ошеломительной картинкой.',
      emoji:'💫', platform:'PS5', edition:'Standard', price:tryToRub(1899), priceTRY:1899, pop:86,
      isNew:true, inStock:true, img:'',
      meta:{ size:'35 ГБ', rating:'18+', lang:'RU субтитры' }
    },
  ].forEach(g => P({ ...g, type:'game', catId: catId.new }));

  /* ════════════════════════════════════════════════════════════
     ПРЕДЗАКАЗЫ
     ════════════════════════════════════════════════════════════ */
  [
    {
      name:'GTA VI', desc:'Самая ожидаемая игра десятилетия. Предзакажи сейчас — получи в первый день выхода.',
      emoji:'🏖️', platform:'PS5', edition:'Standard', price:tryToRub(2799), priceTRY:2799, pop:99,
      isFeat:true, isPre:true, inStock:true, img:'',
      meta:{ size:'150+ ГБ', rating:'18+', release:'2026' }
    },
    {
      name:'Ghost of Yōtei', desc:'Предзаказ эксклюзива Sony. Открытый мир Хоккайдо ждёт. Бонус предзаказа — набор предметов Хаяте.',
      emoji:'⛩️', platform:'PS5', edition:'Standard', price:tryToRub(2799), priceTRY:2799, pop:90,
      isPre:true, inStock:true, img:'',
      meta:{ size:'80+ ГБ', rating:'18+', release:'2025' }
    },
    {
      name:'Mafia: The Old Country', desc:'Сицилия 1900 года. Корни организованной преступности. Новая история от 2K Games в новом историческом сеттинге.',
      emoji:'🎩', platform:'PS5', edition:'Standard', price:tryToRub(2499), priceTRY:2499, pop:78,
      isPre:true, inStock:true, img:'',
      meta:{ size:'60+ ГБ', rating:'18+', release:'2025' }
    },
    {
      name:'Borderlands 4', desc:'Лут-шутер с лучшим юмором в жанре возвращается. Новые Убийцы, новые планеты и миллиарды стволов.',
      emoji:'🔫', platform:'PS4/PS5', edition:'Standard', price:tryToRub(2799), priceTRY:2799, pop:75,
      isPre:true, inStock:true, img:'',
      meta:{ size:'70+ ГБ', rating:'18+', release:'2025', players:'1-4' }
    },
    {
      name:'Doom: The Dark Ages', desc:'Палач Рока в Тёмных веках. Новая боевая система, новый арсенал, новое безумие. Предзаказ уже открыт.',
      emoji:'💀', platform:'PS5', edition:'Standard', price:tryToRub(2799), priceTRY:2799, pop:83,
      isPre:true, inStock:true, img:'',
      meta:{ size:'80+ ГБ', rating:'18+', release:'2025' }
    },
  ].forEach(g => P({ ...g, type:'game', catId: catId.preorder }));

  /* ════════════════════════════════════════════════════════════
     ПОПУЛЯРНЫЕ ИГРЫ
     ════════════════════════════════════════════════════════════ */
  [
    {
      name:'God of War Ragnarök', desc:'Кратос и Атрей против скандинавских богов. 35 часов основного сюжета и 15 часов побочных заданий. Один из лучших экшенов в истории.',
      emoji:'⚡', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1399), priceTRY:1399, pop:98,
      isFeat:true, inStock:true, img:'',
      meta:{ size:'84 ГБ', rating:'18+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Marvel\'s Spider-Man 2', desc:'Питер Паркер и Майлз Моралес против Венома и Крейвена. Открытый Нью-Йорк, паутина-крылья и 30 часов сюжета. Эксклюзив PS5.',
      emoji:'🕷️', platform:'PS5', edition:'Standard', price:tryToRub(1899), priceTRY:1899, pop:97,
      isFeat:true, inStock:true, img:'',
      meta:{ size:'52 ГБ', rating:'16+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Elden Ring', desc:'Майяtзаки + Мартин = лучший open-world от FromSoftware. DLC Shadow of the Erdtree уже доступно. GOTY по версии большинства изданий 2022 года.',
      emoji:'🌑', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1199), priceTRY:1199, pop:96,
      inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'16+', lang:'Нет RU', players:'1 / онлайн' }
    },
    {
      name:'Elden Ring: Shadow of the Erdtree Edition', desc:'Базовая игра + масштабное DLC с новым регионом, боссами и снаряжением. Лучшая точка входа во Вселенную Elden Ring.',
      emoji:'🌑', platform:'PS4/PS5', edition:'Shadow of the Erdtree', price:tryToRub(1699), priceTRY:1699, pop:94,
      inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'16+', lang:'Нет RU' }
    },
    {
      name:'Red Dead Redemption 2', desc:'Эпический вестерн от Rockstar. Артур Морган в умирающей эпохе Дикого Запада. 60 часов сюжета, который не отпускает.',
      emoji:'🤠', platform:'PS4', edition:'Standard', price:tryToRub(849), priceTRY:849, pop:95,
      inStock:true, img:'',
      meta:{ size:'107 ГБ', rating:'18+', lang:'RU озвучка', players:'1 / онлайн' }
    },
    {
      name:'The Last of Us Part I', desc:'Ремастер с нуля на PS5. Джоэл и Элли в постапокалипсисе. Если не играл — это обязательно. Если играл — снова обязательно.',
      emoji:'🍄', platform:'PS5', edition:'Standard', price:tryToRub(1099), priceTRY:1099, pop:93,
      inStock:true, img:'',
      meta:{ size:'80 ГБ', rating:'18+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Cyberpunk 2077: Ultimate Edition', desc:'После патча 2.0 и DLC Phantom Liberty — это другая игра. Найт-Сити, Ви, Джонни Сильверхенд и Идрис Эльба в одном паке.',
      emoji:'🌆', platform:'PS5', edition:'Ultimate Edition', price:tryToRub(1299), priceTRY:1299, pop:91,
      inStock:true, img:'',
      meta:{ size:'75 ГБ', rating:'18+', lang:'RU озвучка', players:'1' }
    },
    {
      name:'EA Sports FC 26', desc:'30+ лицензированных лиг, технология HyperMotionV и режим Ultimate Team. Самый реалистичный футбол на консолях.',
      emoji:'⚽', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1599), priceTRY:1599, pop:89,
      inStock:true, img:'',
      meta:{ size:'45 ГБ', rating:'3+', lang:'RU интерфейс', players:'1-22' }
    },
    {
      name:'Black Myth: Wukong', desc:'Китайская мифология, снаряжение миллиона видов и боссы, которые тебя убьют. Первая AAA от китайской студии. Шедевр.',
      emoji:'🐒', platform:'PS5', edition:'Standard', price:tryToRub(1899), priceTRY:1899, pop:92,
      inStock:true, img:'',
      meta:{ size:'130 ГБ', rating:'16+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'It Takes Two', desc:'Кооператив, за который дали GOTY 2021. Кода и Мэй спасают брак через безумные миры — прыжки, стрельба, гонки. Нужен второй игрок.',
      emoji:'🤝', platform:'PS4/PS5', edition:'Standard', price:tryToRub(849), priceTRY:849, pop:90,
      inStock:true, img:'',
      meta:{ size:'50 ГБ', rating:'12+', lang:'RU субтитры', players:'2 (кооп)' }
    },
    {
      name:'Baldur\'s Gate 3', desc:'Лучшая RPG нашего времени по версии TGA 2023. Forgotten Realms, D&D, 800+ часов контента, 17 000 концовок — выбор за тобой.',
      emoji:'🎲', platform:'PS5', edition:'Standard', price:tryToRub(1299), priceTRY:1299, pop:96,
      inStock:true, img:'',
      meta:{ size:'150 ГБ', rating:'18+', lang:'Нет RU', players:'1-4' }
    },
    {
      name:'Resident Evil 4 Remake', desc:'Леон Кеннеди, Испания и культисты. Культовый хоррор переделан с нуля. Лучший ремейк в серии и один из лучших шутеров последних лет.',
      emoji:'🧟', platform:'PS4/PS5', edition:'Standard', price:tryToRub(999), priceTRY:999, pop:88,
      inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'18+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Gran Turismo 7', desc:'450+ автомобилей, 37 трасс, режим Карьера на 40+ часов. Самый серьёзный гоночный симулятор на консолях с поддержкой PSVR2.',
      emoji:'🏎️', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1099), priceTRY:1099, pop:85,
      inStock:true, img:'',
      meta:{ size:'90 ГБ', rating:'3+', lang:'RU интерфейс', players:'1-20' }
    },
    {
      name:'Hogwarts Legacy', desc:'Открытый мир волшебства в XIX веке. Хогвартс, магические существа и тёмные секреты. 40 часов в любимой вселенной Гарри Поттера.',
      emoji:'🪄', platform:'PS4/PS5', edition:'Standard', price:tryToRub(999), priceTRY:999, pop:87,
      inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'12+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Horizon Forbidden West: Complete Edition', desc:'Элой и красная чума в Западном побережье. Complete Edition с DLC Burning Shores. Самые красивые пейзажи на PS5.',
      emoji:'🏹', platform:'PS4/PS5', edition:'Complete Edition', price:tryToRub(1099), priceTRY:1099, pop:86,
      inStock:true, img:'',
      meta:{ size:'100 ГБ', rating:'16+', lang:'RU субтитры', players:'1' }
    },
  ].forEach(g => P({ ...g, type:'game', catId: catId.popular }));

  /* ════════════════════════════════════════════════════════════
     ЭКСКЛЮЗИВЫ PLAYSTATION
     ════════════════════════════════════════════════════════════ */
  [
    {
      name:'God of War Ragnarök: Valhalla', desc:'Бесплатное DLC к Ragnarök. Рогалик с Кратосом. Вальгалла ждёт — это 10+ часов дополнительного контента абсолютно бесплатно.',
      emoji:'⚡', platform:'PS4/PS5', edition:'Valhalla DLC', price:0, pop:88,
      isFeat:true, inStock:true, img:'',
      meta:{ size:'10 ГБ', rating:'18+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Demon\'s Souls Remake', desc:'Реконструкция первого Souls на Unreal Engine 5. Те же боссы, тот же Болетарийский дворец, но в 4K/60. Для фанатов Elden Ring — истоки.',
      emoji:'💀', platform:'PS5', edition:'Standard', price:tryToRub(999), priceTRY:999, pop:82,
      inStock:true, img:'',
      meta:{ size:'66 ГБ', rating:'16+', lang:'RU субтитры', players:'1 / онлайн' }
    },
    {
      name:'Marvel\'s Spider-Man: Miles Morales', desc:'Майлз Моралес и его уникальные способности. Рождество в Гарлеме, суперсила электричества и мощная история о семье.',
      emoji:'🕷️', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1099), priceTRY:1099, pop:91,
      inStock:true, img:'',
      meta:{ size:'39 ГБ', rating:'12+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Ghost of Tsushima: Director\'s Cut', desc:'Самурайская поэзия в открытом мире. Дзин Сакай против монгольского нашествия. Director\'s Cut включает остров Ики и онлайн-режим.',
      emoji:'🌸', platform:'PS4/PS5', edition:"Director's Cut", price:tryToRub(1199), priceTRY:1199, pop:93,
      inStock:true, img:'',
      meta:{ size:'50 ГБ', rating:'18+', lang:'RU субтитры', players:'1 / 2-8' }
    },
    {
      name:'Returnal', desc:'Роглайк-шутер в третьем лице. Селен застряла в петле времени на враждебной планете. Самый трудный и самый захватывающий эксклюзив PS5.',
      emoji:'🔄', platform:'PS5', edition:'Standard', price:tryToRub(999), priceTRY:999, pop:80,
      inStock:true, img:'',
      meta:{ size:'30 ГБ', rating:'18+', lang:'RU субтитры', players:'1 / 2' }
    },
    {
      name:'Ratchet & Clank: Rift Apart', desc:'Кинематографичный платформер, который показывает возможности PS5. SSD телепортирует через измерения мгновенно. Семейный хит.',
      emoji:'🔧', platform:'PS5', edition:'Standard', price:tryToRub(999), priceTRY:999, pop:85,
      inStock:true, img:'',
      meta:{ size:'42 ГБ', rating:'7+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Bloodborne', desc:'Культовый экшен From Software в викторианском готическом городе Ярнам. Один из лучших эксклюзивов PlayStation всех времён.',
      emoji:'🌙', platform:'PS4', edition:'Standard', price:tryToRub(699), priceTRY:699, pop:90,
      inStock:true, img:'',
      meta:{ size:'36 ГБ', rating:'18+', lang:'Нет RU', players:'1 / онлайн' }
    },
    {
      name:'Horizon Zero Dawn: Complete Edition', desc:'Алой против машин в постапокалиптическом мире. Классика, с которой нужно начинать знакомство с серией. Включает DLC Frozen Wilds.',
      emoji:'🦕', platform:'PS4', edition:'Complete Edition', price:tryToRub(699), priceTRY:699, pop:87,
      inStock:true, img:'',
      meta:{ size:'72 ГБ', rating:'16+', lang:'RU субтитры', players:'1' }
    },
  ].forEach(g => P({ ...g, type:'game', catId: catId.exclusive }));

  /* ════════════════════════════════════════════════════════════
     АКЦИИ И СКИДКИ
     ════════════════════════════════════════════════════════════ */
  [
    {
      name:'GTA V: Premium Edition', desc:'Легендарная игра по суперцене. GTA Online, три героя, Лос-Сантос. Premium Edition включает всё. Скидка 70% — самый очевидный выбор.',
      emoji:'🌆', platform:'PS4/PS5', edition:'Premium Edition',
      price:tryToRub(209), priceTRY:209, oldPrice:tryToRub(699), pop:99, isSale:true, isFeat:true, inStock:true, img:'',
      meta:{ size:'100 ГБ', rating:'18+', lang:'RU озвучка', players:'1-30', discount:'70%' }
    },
    {
      name:'The Witcher 3: Complete Edition', desc:'Геральт из Ривии и весь дополнительный контент. Hearts of Stone + Blood and Wine включены. Скидка 75% — купи пока дают.',
      emoji:'🐺', platform:'PS4/PS5', edition:'Complete Edition',
      price:tryToRub(259), priceTRY:259, oldPrice:tryToRub(1099), pop:96, isSale:true, inStock:true, img:'',
      meta:{ size:'50 ГБ', rating:'18+', lang:'RU озвучка', discount:'75%' }
    },
    {
      name:'A Way Out', desc:'Побег из тюрьмы вдвоём — лучший кооп на диване. Режим Friend Pass позволяет играть со вторым игроком бесплатно. Скидка 60%.',
      emoji:'🚗', platform:'PS4', edition:'Standard',
      price:tryToRub(349), priceTRY:349, oldPrice:tryToRub(899), pop:82, isSale:true, inStock:true, img:'',
      meta:{ size:'23 ГБ', rating:'18+', lang:'RU субтитры', players:'2 (кооп)', discount:'60%' }
    },
    {
      name:'Sekiro: Shadows Die Twice GOTY', desc:'Синоби против самураев. Самая сложная игра From Software с лучшей системой парирования. GOTY включает все дополнения.',
      emoji:'🥷', platform:'PS4', edition:'GOTY Edition',
      price:tryToRub(549), priceTRY:549, oldPrice:tryToRub(1499), pop:89, isSale:true, inStock:true, img:'',
      meta:{ size:'15 ГБ', rating:'18+', lang:'Нет RU', discount:'60%' }
    },
    {
      name:'Mortal Kombat 1', desc:'Перезапуск серии с нуля. Лю Кан создал новую вселенную. Камео-бойцы, новые камерные режимы и зрелищные фаталити.',
      emoji:'🩸', platform:'PS4/PS5', edition:'Standard',
      price:tryToRub(799), priceTRY:799, oldPrice:tryToRub(1999), pop:84, isSale:true, inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'18+', lang:'RU субтитры', discount:'60%' }
    },
    {
      name:'Dying Light 2: Ultimate Edition', desc:'Паркур, зомби и моральные выборы, которые меняют мир. Ultimate Edition с сезонным пропуском. Скидка 65% — это почти подарок.',
      emoji:'🧟', platform:'PS4/PS5', edition:'Ultimate Edition',
      price:tryToRub(699), priceTRY:699, oldPrice:tryToRub(1999), pop:80, isSale:true, inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'18+', lang:'RU озвучка', players:'1-4', discount:'65%' }
    },
    {
      name:'EA Sports FC 25', desc:'Предыдущее издание FC по суперцене. Если не хочешь тратиться на 26-ю — тут тот же футбол с аналогичными лигами. Скидка 50%.',
      emoji:'⚽', platform:'PS4/PS5', edition:'Standard',
      price:tryToRub(699), priceTRY:699, oldPrice:tryToRub(1399), pop:78, isSale:true, inStock:true, img:'',
      meta:{ size:'43 ГБ', rating:'3+', lang:'RU интерфейс', discount:'50%' }
    },
    {
      name:'Battlefield 2042', desc:'Фан-шутер с огромными картами и режимом Portal. Всё ещё живёт и дышит. По такой цене — грех не попробовать.',
      emoji:'💣', platform:'PS4/PS5', edition:'Standard',
      price:tryToRub(199), priceTRY:199, oldPrice:tryToRub(899), pop:72, isSale:true, inStock:true, img:'',
      meta:{ size:'100 ГБ', rating:'16+', lang:'RU озвучка', players:'онлайн', discount:'78%' }
    },
  ].forEach(g => P({ ...g, type:'game', catId: catId.sale }));

  /* ════════════════════════════════════════════════════════════
     ПОДПИСКИ PS PLUS
     ════════════════════════════════════════════════════════════ */
  [
    {
      name:'PS Plus Essential — 1 месяц',
      desc:'Онлайн-мультиплеер, 2 бесплатных игры в месяц, облачные сохранения 100 ГБ. Базовый уровень для онлайн-игр.',
      emoji:'🟦', platform:'PlayStation', edition:'Essential · 1 месяц',
      price:1045, pop:80, isFeat:false, inStock:true,
      meta:{ periods:{ 1:1045, 3:2670, 12:7580 },
             tier:'essential', color:'silver',
             features:['Онлайн-мультиплеер', '2 игры ежемесячно', 'Облако 100 ГБ', 'Скидки магазина'] }
    },
    {
      name:'PS Plus Extra — 1 месяц',
      desc:'Всё из Essential плюс каталог 400+ игр PS4 и PS5. God of War, RDR2, Ghost of Tsushima — доступно пока активна подписка.',
      emoji:'🟧', platform:'PlayStation', edition:'Extra · 1 месяц',
      price:1577, pop:92, isFeat:true, inStock:true,
      meta:{ periods:{ 1:1577, 3:4350, 12:12616 },
             tier:'extra', color:'blue',
             features:['Всё из Essential', 'Каталог 400+ игр', 'God of War Ragnarök', 'RDR2, Horizon, Ghost of Tsushima'] }
    },
    {
      name:'PS Plus Deluxe — 1 месяц',
      desc:'Максимальный уровень. Extra + классика PS1/PS2/PS3/PSP и облачный стриминг игр. Всё что есть у PlayStation — в одной подписке.',
      emoji:'🟨', platform:'PlayStation', edition:'Deluxe · 1 месяц',
      price:1860, pop:85, inStock:true,
      meta:{ periods:{ 1:1860, 3:5140, 12:14580 },
             tier:'deluxe', color:'gold',
             features:['Всё из Extra', 'Классика PS1/PS2/PS3/PSP', 'Облачный стриминг', 'Пробные версии новинок'] }
    },
  ].forEach(s => P({ ...s, type:'sub', catId: catId.subs }));

  /* ════════════════════════════════════════════════════════════
     КОДЫ ПОПОЛНЕНИЯ PSN
     ════════════════════════════════════════════════════════════ */
  [
    { name:'PSN Пополнение 100 ₺',  desc:'Код пополнения кошелька PlayStation Network Турция на 100 TL.',  emoji:'💳', platform:'PSN Турция', edition:'100 ₺',  price:350,  pop:70 },
    { name:'PSN Пополнение 250 ₺',  desc:'Код пополнения кошелька PlayStation Network Турция на 250 TL.',  emoji:'💳', platform:'PSN Турция', edition:'250 ₺',  price:800,  pop:74 },
    { name:'PSN Пополнение 500 ₺',  desc:'Код пополнения кошелька PlayStation Network Турция на 500 TL.',  emoji:'💳', platform:'PSN Турция', edition:'500 ₺',  price:1500, pop:82 },
    { name:'PSN Пополнение 1000 ₺', desc:'Код пополнения кошелька PlayStation Network Турция на 1000 TL.', emoji:'💳', platform:'PSN Турция', edition:'1000 ₺', price:2800, pop:88, isFeat:true },
    { name:'PSN Пополнение 2000 ₺', desc:'Код пополнения кошелька PlayStation Network Турция на 2000 TL.', emoji:'💳', platform:'PSN Турция', edition:'2000 ₺', price:5400, pop:75 },
  ].forEach(c => P({ ...c, type:'code', catId:catId.codes, inStock:true }));

  /* ════════════════════════════════════════════════════════════
     РАСШИРЕННЫЙ КАТАЛОГ — 450+ игр
     Охватывает PS4, PS5, все жанры
     ════════════════════════════════════════════════════════════ */
  function TRY(t) {
    let r = t<=500?3.3:t<=1000?2.9:t<=1500?2.75:t<=2500?2.4:2.3;
    return Math.round(t*r/10)*10;
  }

  const EXTRA_GAMES = [
    // ── ACTION / ADVENTURE ──────────────────────────────────────
    { name:'The Last of Us Part II Remastered', platform:'PS5',      price:TRY(1199), priceTRY:1199, pop:94, isNew:true,  desc:'Переработанная версия с режимом No Return и улучшенной графикой. История Элли продолжается — жестоко и честно.', emoji:'🍂', meta:{size:'88 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Uncharted 4: A Thief\'s End',        platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:92, desc:'Последняя охота Натана Дрейка. Кинематографичный экшн на высшем уровне — Naughty Dog в лучшей форме.', emoji:'🗺️', meta:{size:'57 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Uncharted: Legacy of Thieves',       platform:'PS5',      price:TRY(899), priceTRY:899,  pop:88, desc:'Uncharted 4 и Lost Legacy в одном пакете, оптимизированные для PS5.', emoji:'🗺️', meta:{size:'47 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Death Stranding Director\'s Cut',    platform:'PS5',      price:TRY(799), priceTRY:799,  pop:82, desc:'Расширенная версия с новым контентом, гонками и заданиями. Кодзима строит связи через постапокалипсис.', emoji:'🌊', meta:{size:'79 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Alan Wake 2',                        platform:'PS5',      price:TRY(1399), priceTRY:1399, pop:89, desc:'Ремеди переосмысляют психологический хоррор. Аллан против тьмы в двух измерениях. GOTY-претендент.', emoji:'🔦', meta:{size:'90 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Control Ultimate Edition',           platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:85, isSale:true, oldPrice:TRY(1099), desc:'Бюро федерального контроля захвачено паранормальным. Джесси ищет брата в бесконечном здании.', emoji:'🔴', meta:{size:'50 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Marvel\'s Guardians of the Galaxy',  platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:84, isSale:true, oldPrice:TRY(999),  desc:'Стражи галактики глазами Питера Квилла. Юмор, рок и неожиданно глубокий сюжет.', emoji:'🦝', meta:{size:'52 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Immortals Fenyx Rising',             platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:78, isSale:true, oldPrice:TRY(999),  desc:'Греческая мифология, открытый мир и юмор от Ubisoft. Феникс спасает богов от Тифона.', emoji:'⚡', meta:{size:'26 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Marvel\'s Avengers',                 platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:65, isSale:true, oldPrice:TRY(1499), desc:'Мстители собираются снова. Онлайн-экшн с живым миром и регулярными обновлениями.', emoji:'🛡️', meta:{size:'80 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Ghostwire: Tokyo',                   platform:'PS5',      price:TRY(499), priceTRY:499,  pop:76, isSale:true, oldPrice:TRY(999),  desc:'Токио опустел — духи захватили город. Акито с нечеловеческой силой против паранормального.', emoji:'👻', meta:{size:'50 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Forspoken',                          platform:'PS5',      price:TRY(399), priceTRY:399,  pop:61, isSale:true, oldPrice:TRY(1499), desc:'Фрей из Нью-Йорка попадает в магический мир Афия. Паркур-магия и открытый мир.', emoji:'✨', meta:{size:'60 ГБ',rating:'16+',lang:'Нет RU'} },
    { name:'Kena: Bridge of Spirits',            platform:'PS4/PS5',  price:TRY(599), priceTRY:599,  pop:83, desc:'Красочный экшн-платформер. Кена помогает духам найти покой в прекрасном мире, похожем на мультфильм.', emoji:'🌺', meta:{size:'22 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Stray',                              platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:88, desc:'Ты — рыжий кот в постапокалиптическом городе роботов. Один из самых необычных эксклюзивов PlayStation.', emoji:'🐱', meta:{size:'10 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Sifu',                               platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:81, desc:'Боевые искусства без пощады. Один человек против всего клана. Каждая смерть делает тебя старше.', emoji:'🥋', meta:{size:'10 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Tunic',                              platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:79, desc:'Маленькая лисица в огромном тайном мире. Соулслайк-секреты с вдохновением от Zelda и Dark Souls.', emoji:'🦊', meta:{size:'2 ГБ',rating:'7+',lang:'Нет RU'} },
    { name:'Tchia',                              platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:74, desc:'Открытый мир вдохновлён Новой Каледонией. Тша может воплощаться в любой предмет или животное.', emoji:'🌴', meta:{size:'22 ГБ',rating:'12+',lang:'Нет RU'} },

    // ── RPG ─────────────────────────────────────────────────────
    { name:'Final Fantasy XVI',                  platform:'PS5',      price:TRY(1099), priceTRY:1099, pop:87, desc:'Тёмное фэнтези от Square Enix. Клайв Розфилд сражается за жизнь в мире, поглощённом кристаллами.', emoji:'⚔️', meta:{size:'90 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Final Fantasy VII Rebirth',          platform:'PS5',      price:TRY(1799), priceTRY:1799, pop:92, isNew:true, desc:'Вторая часть ремейка FF7. Клауд и СОЛДАТ покидают Мидгар — начинается великое путешествие.', emoji:'🌿', meta:{size:'155 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Final Fantasy VII Remake',           platform:'PS4/PS5',  price:TRY(799), priceTRY:799,  pop:88, desc:'Первая часть ремейка. Мидгар, Клауд, Тифа, Айрис. Экшн-RPG нового поколения от Square Enix.', emoji:'🌿', meta:{size:'100 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Persona 5 Royal',                    platform:'PS4',      price:TRY(699), priceTRY:699,  pop:93, desc:'Лучшая JRPG последних лет. Школьники крадут сердца злодеев в Токио. 100+ часов контента.', emoji:'🎭', meta:{size:'40 ГБ',rating:'17+',lang:'RU субтитры'} },
    { name:'Persona 3 Reload',                   platform:'PS4/PS5',  price:TRY(1499), priceTRY:1499, pop:87, isNew:true, desc:'Ремейк культовой Persona 3 с нуля. Команда SEES против Теней в Полночном часе.', emoji:'🌙', meta:{size:'40 ГБ',rating:'17+',lang:'RU субтитры'} },
    { name:'Persona 4 Golden',                   platform:'PS4',      price:TRY(399), priceTRY:399,  pop:88, desc:'Юи и друзья раскрывают убийства через мир телевизора. Классика жанра в лучшей форме.', emoji:'🌞', meta:{size:'15 ГБ',rating:'17+',lang:'RU субтитры'} },
    { name:'Dragon\'s Dogma 2',                  platform:'PS5',      price:TRY(1299), priceTRY:1299, pop:83, isNew:true, desc:'Арисен и его Пешка против Дракона. Огромный открытый мир с уникальной боевой системой.', emoji:'🐲', meta:{size:'60 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Tales of Arise',                     platform:'PS4/PS5',  price:TRY(599), priceTRY:599,  pop:82, isSale:true, oldPrice:TRY(999),  desc:'Альпен и Шион сражаются против угнетения на планете Дана. Красочная JRPG от Bandai Namco.', emoji:'🌹', meta:{size:'40 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Scarlet Nexus',                      platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:76, isSale:true, oldPrice:TRY(999),  desc:'Telekinesis-экшн в аниме-сеттинге. Юйто или Касан против Других в психо-мире.', emoji:'🧠', meta:{size:'30 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Ni no Kuni II: Revenant Kingdom',    platform:'PS4',      price:TRY(399), priceTRY:399,  pop:79, isSale:true, oldPrice:TRY(799),  desc:'Молодой король Эван строит новое королевство. Очаровательная JRPG в стиле Ghibli.', emoji:'🏰', meta:{size:'30 ГБ',rating:'12+',lang:'Нет RU'} },
    { name:'Yakuza: Like a Dragon',              platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:86, desc:'Итибан Касуга — новый герой Якудзы. Пошаговая RPG в мире японского криминала.', emoji:'🎰', meta:{size:'50 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Like a Dragon: Ishin!',              platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:81, desc:'Кирю в эпохе Эдо. Якудза встречает самурайскую Японию — уникальный исторический спин-офф.', emoji:'⚔️', meta:{size:'50 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Like a Dragon Gaiden',               platform:'PS4/PS5',  price:TRY(999), priceTRY:999,  pop:84, desc:'Кирю Кадзума между двумя играми. Тайная жизнь легенды Якудзы раскрывается.', emoji:'🕶️', meta:{size:'40 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Star Ocean: The Divine Force',       platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:71, isSale:true, oldPrice:TRY(999),  desc:'Космическая RPG от tri-Ace. Рэймонд и Лейлин против таинственной силы, угрожающей планете.', emoji:'🚀', meta:{size:'40 ГБ',rating:'12+',lang:'Нет RU'} },
    { name:'Atelier Ryza 3',                     platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:73, desc:'Финал трилогии Ризы. Синтез алхимии на новом уровне в открытом мире.', emoji:'🧪', meta:{size:'20 ГБ',rating:'12+',lang:'Нет RU'} },
    { name:'Valkyrie Elysium',                   platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:65, isSale:true, oldPrice:TRY(999),  desc:'Новая Валькирия в мире на грани апокалипсиса. Быстрая боёвка и скандинавская мифология.', emoji:'🦅', meta:{size:'20 ГБ',rating:'12+',lang:'Нет RU'} },
    { name:'Maneater',                           platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:74, isSale:true, oldPrice:TRY(599),  desc:'Ты — акула. Расти, эволюционируй, пожирай людей. Самый необычный RPG года.', emoji:'🦈', meta:{size:'20 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Biomutant',                          platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:66, isSale:true, oldPrice:TRY(799),  desc:'Постапокалиптическая RPG с антропоморфным куньим. Открытый мир и кастомизация боёвки.', emoji:'🐾', meta:{size:'25 ГБ',rating:'12+',lang:'RU субтитры'} },

    // ── SOULSLIKE / HARDCORE ─────────────────────────────────────
    { name:'Dark Souls III: Deluxe Edition',     platform:'PS4',      price:TRY(699), priceTRY:699,  pop:91, desc:'Третья часть Dark Souls с обоими DLC. Лотрик, пепел и цикл огня. Финал трилогии.', emoji:'🔥', meta:{size:'25 ГБ',rating:'18+',lang:'Нет RU'} },
    { name:'Dark Souls Remastered',              platform:'PS4',      price:TRY(599), priceTRY:599,  pop:89, desc:'Лордран, Эстус и боссы, которые вас убьют. Оригинальный Dark Souls в 60 FPS.', emoji:'⚰️', meta:{size:'7 ГБ',rating:'16+',lang:'Нет RU'} },
    { name:'Dark Souls II: Scholar of the First Sin', platform:'PS4', price:TRY(499), priceTRY:499,  pop:83, desc:'Дранглич и проклятие нежити. Scholar Edition объединяет все DLC и обновляет врагов.', emoji:'💀', meta:{size:'18 ГБ',rating:'16+',lang:'Нет RU'} },
    { name:'Lies of P',                          platform:'PS4/PS5',  price:TRY(1199), priceTRY:1199, pop:85, isNew:true, desc:'Пиноккио в Belle Époque. Souls-метроидвания с уникальной боёвкой на оружейных узлах.', emoji:'🎭', meta:{size:'22 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Nioh 2 Complete Edition',            platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:84, desc:'Феодальная Япония и ёкаи. Complete Edition с тремя DLC — 100+ часов хардкорного экшна.', emoji:'⛩️', meta:{size:'40 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Nioh Complete Edition',              platform:'PS4',      price:TRY(499), priceTRY:499,  pop:82, desc:'Самурай Уильям против ёкаев эпохи Сэнгоку. Оригинальная Nioh с DLC — основа серии.', emoji:'⛩️', meta:{size:'30 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Wo Long: Fallen Dynasty',            platform:'PS4/PS5',  price:TRY(899), priceTRY:899,  pop:78, isNew:true, desc:'Китай эпохи Троецарствия. Team Ninja создаёт souls-экшн в новом историческом сеттинге.', emoji:'🐉', meta:{size:'30 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Mortal Shell: Complete Edition',     platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:72, isSale:true, oldPrice:TRY(699),  desc:'Инди souls-лайк с уникальной механикой заморозки. Отлично для фанатов жанра.', emoji:'🛡️', meta:{size:'10 ГБ',rating:'18+',lang:'Нет RU'} },
    { name:'The Surge 2',                        platform:'PS4',      price:TRY(299), priceTRY:299,  pop:69, isSale:true, oldPrice:TRY(799),  desc:'Souls в sci-fi. Отруби конечность врагу, надень его оружие. Уникальная петля геймплея.', emoji:'🦾', meta:{size:'25 ГБ',rating:'18+',lang:'Нет RU'} },
    { name:'Lords of the Fallen',                platform:'PS5',      price:TRY(999), priceTRY:999,  pop:75, isNew:true, desc:'Перезапуск 2023 года. Мир живых и мёртвых переплетены. Самый красивый souls-лайк.', emoji:'🌑', meta:{size:'45 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Thymesia',                           platform:'PS5',      price:TRY(399), priceTRY:399,  pop:68, desc:'Быстрый souls-лайк в чумном мире. Эрвин охотится на воспоминания и перо за пером восстанавливает прошлое.', emoji:'🐦', meta:{size:'4 ГБ',rating:'18+',lang:'Нет RU'} },

    // ── SHOOTER ─────────────────────────────────────────────────
    { name:'Call of Duty: Modern Warfare II',    platform:'PS4/PS5',  price:TRY(999), priceTRY:999,  pop:86, desc:'Тасктик-Форс 141 против наркокартеля и международного терроризма. Варзон 2.0 включён.', emoji:'🔫', meta:{size:'150 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Call of Duty: Modern Warfare III',   platform:'PS4/PS5',  price:TRY(1599), priceTRY:1599, pop:82, isNew:true, desc:'Маврик против Варданска. Открытый кампус, обновлённый мультиплеер и Зомби в открытом мире.', emoji:'🔫', meta:{size:'200 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Call of Duty: Black Ops Cold War',   platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:79, isSale:true, oldPrice:TRY(1499), desc:'1981 год. ЦРУ против Персея. Разветвлённый сюжет и классический мультиплеер Cold War.', emoji:'🔫', meta:{size:'100 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Deathloop',                          platform:'PS5',      price:TRY(499), priceTRY:499,  pop:84, desc:'Кольт застрял во временной петле на острове убийц. Аркановый шутер с уникальными механиками.', emoji:'⏳', meta:{size:'30 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Far Cry 6',                          platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:77, isSale:true, oldPrice:TRY(999),  desc:'Куба, диктатор и партизаны. Dani Rojas против Антона Кастильо в открытом тропическом мире.', emoji:'🌴', meta:{size:'40 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Far Cry 5',                          platform:'PS4',      price:TRY(299), priceTRY:299,  pop:81, isSale:true, oldPrice:TRY(699),  desc:'Культ в Монтане. Джозеф Сид и Ворота Эдема против заместителя шерифа.', emoji:'✝️', meta:{size:'35 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Metro Exodus Complete Edition',      platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:84, isSale:true, oldPrice:TRY(899),  desc:'Артём покидает московское метро. Постсоветский постапокалипсис в открытом мире России.', emoji:'☢️', meta:{size:'70 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Splitgate',                          platform:'PS4/PS5',  price:0,         pop:71, desc:'Бесплатный портал-шутер. Halo встречает Portal в онлайн-мультиплеере — уникальная тактика.', emoji:'🔵', meta:{size:'20 ГБ',rating:'16+',lang:'RU интерфейс'} },
    { name:'Ghostrunner 2',                      platform:'PS5',      price:TRY(899), priceTRY:899,  pop:82, isNew:true, desc:'Кибер-ниндзя на мотоцикле. Ещё быстрее, ещё смертоноснее. Один удар = смерть.', emoji:'🗡️', meta:{size:'15 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Ghostrunner',                        platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:80, desc:'Один хит — смерть. Кибер-ниндзя взбирается на мегаполис. Самый напряжённый паркур-шутер.', emoji:'🗡️', meta:{size:'10 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Prodeus',                            platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:74, desc:'Ретро-шутер нового поколения. DOOM-геймплей с современными технологиями и редактором уровней.', emoji:'💥', meta:{size:'5 ГБ',rating:'18+',lang:'Нет RU'} },
    { name:'Turbo Overkill',                     platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:72, desc:'Киберпанк-бойня. Ножи на ногах, цепная пила на руке. Самый сумасшедший ретро-шутер.', emoji:'⚡', meta:{size:'4 ГБ',rating:'18+',lang:'Нет RU'} },

    // ── RACING / SPORTS ──────────────────────────────────────────
    { name:'F1 24',                              platform:'PS4/PS5',  price:TRY(1299), priceTRY:1299, pop:82, isNew:true, desc:'Официальный симулятор Формулы 1 2024 года. Новая физика, улучшенный режим Моя команда.', emoji:'🏎️', meta:{size:'30 ГБ',rating:'3+',lang:'RU интерфейс'} },
    { name:'F1 23',                              platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:79, isSale:true, oldPrice:TRY(1299), desc:'Сезон 2023 года с Льюисом Хэмилтоном и Максом Ферстаппеном. Режим Braking Point 2.', emoji:'🏎️', meta:{size:'30 ГБ',rating:'3+',lang:'RU интерфейс'} },
    { name:'Need for Speed Unbound',             platform:'PS5',      price:TRY(699), priceTRY:699,  pop:77, desc:'Лейкшор Сити и криминальные гонки. Аниме-стиль, риск-система ставок и трёхэтапный нарратив.', emoji:'🚗', meta:{size:'50 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Need for Speed Heat',                platform:'PS4',      price:TRY(299), priceTRY:299,  pop:75, isSale:true, oldPrice:TRY(699),  desc:'Пальм-Сити днём и ночью. Легальные гонки vs нелегальные заезды с полицией.', emoji:'🚗', meta:{size:'40 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'WRC Generations',                    platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:73, isSale:true, oldPrice:TRY(999),  desc:'Финальная игра Kylotonn. Электромобили WRC и все реальные трассы чемпионата.', emoji:'🚙', meta:{size:'40 ГБ',rating:'3+',lang:'Нет RU'} },
    { name:'Moto GP 23',                         platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:71, isSale:true, oldPrice:TRY(1299), desc:'Официальный симулятор MotoGP 2023. Ии-соперники, реалистичная физика, карьера.', emoji:'🏍️', meta:{size:'20 ГБ',rating:'3+',lang:'Нет RU'} },
    { name:'NBA 2K24',                           platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:78, isSale:true, oldPrice:TRY(1299), desc:'Баскетбол нового уровня. MyCareer, MyTeam и ProPlay технология движений звёзд НБА.', emoji:'🏀', meta:{size:'75 ГБ',rating:'3+',lang:'RU интерфейс'} },
    { name:'NBA 2K25',                           platform:'PS4/PS5',  price:TRY(1299), priceTRY:1299, pop:80, isNew:true, desc:'Новый сезон НБА в игре. Обновлённые ростеры, улучшенный ИИ и режим W.', emoji:'🏀', meta:{size:'80 ГБ',rating:'3+',lang:'RU интерфейс'} },
    { name:'NHL 24',                             platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:74, isSale:true, oldPrice:TRY(1299), desc:'Хоккей от EA Sports. Реальные команды, физика шайбы и онлайн-лиги.', emoji:'🏒', meta:{size:'40 ГБ',rating:'10+',lang:'RU интерфейс'} },
    { name:'MLB The Show 24',                    platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:72, desc:'Официальный симулятор MLB. Road to the Show, Diamond Dynasty и реальные стадионы.', emoji:'⚾', meta:{size:'50 ГБ',rating:'3+',lang:'Нет RU'} },
    { name:'Tony Hawk\'s Pro Skater 1+2',        platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:86, isSale:true, oldPrice:TRY(999),  desc:'Ремейк двух легенд скейтбординга. Те же уровни, та же музыка, та же магия — в HD.', emoji:'🛹', meta:{size:'26 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'PGA Tour 2K23',                      platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:70, isSale:true, oldPrice:TRY(799),  desc:'Гольф с Тайгером Вудсом. 20 реальных полей PGA TOUR и онлайн-сезоны.', emoji:'⛳', meta:{size:'30 ГБ',rating:'3+',lang:'Нет RU'} },

    // ── PLATFORMER ───────────────────────────────────────────────
    { name:'Crash Bandicoot 4: It\'s About Time', platform:'PS4/PS5', price:TRY(499), priceTRY:499,  pop:85, desc:'Крэш возвращается через измерения. Нео Кортекс открыл мультивселенную — настоящий сиквел.', emoji:'🟠', meta:{size:'30 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Crash Team Racing Nitro-Fueled',     platform:'PS4',      price:TRY(299), priceTRY:299,  pop:82, isSale:true, oldPrice:TRY(599),  desc:'Ремейк лучшего картинг-гонщика PS1. Все трассы, все персонажи и онлайн-режим.', emoji:'🏁', meta:{size:'25 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Sackboy: A Big Adventure',           platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:80, desc:'Платформер с Мешочником. Красочные уровни, кооператив на 4 игрока и музыкальные уровни.', emoji:'🧶', meta:{size:'34 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Concrete Genie',                     platform:'PS4',      price:TRY(299), priceTRY:299,  pop:74, isSale:true, oldPrice:TRY(599),  desc:'Эш рисует живых существ на стенах загрязнённого города. Платформер-арт.', emoji:'🎨', meta:{size:'7 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Spyro Reignited Trilogy',            platform:'PS4',      price:TRY(399), priceTRY:399,  pop:83, isSale:true, oldPrice:TRY(799),  desc:'Три игры про Спайро — ремастер с нуля. Дракон, кристаллы и ностальгия 90-х.', emoji:'🐉', meta:{size:'30 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Medievil',                           platform:'PS4',      price:TRY(299), priceTRY:299,  pop:76, isSale:true, oldPrice:TRY(599),  desc:'Ремейк приключений сэра Даниэля Фортескью. Хэллоуинский платформер-экшн PS1.', emoji:'💀', meta:{size:'12 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Knack 2',                            platform:'PS4',      price:TRY(199), priceTRY:199,  pop:68, isSale:true, oldPrice:TRY(499),  desc:'Нэк и Лукас против Гоблинов. Платформер-экшн с кооперативом на двух игроков.', emoji:'🤖', meta:{size:'22 ГБ',rating:'7+',lang:'RU субтитры'} },

    // ── HORROR / SURVIVAL ─────────────────────────────────────────
    { name:'Resident Evil Village',              platform:'PS4/PS5',  price:TRY(799), priceTRY:799,  pop:89, desc:'Итан Уинтерс в трансильванской деревне, замке и заводе. Village — самый зрелищный RE.', emoji:'🧛', meta:{size:'35 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Resident Evil 2 Remake',             platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:90, desc:'Леон Кеннеди и Клэр Редфилд в Raccoon City. Ремейк с видом от третьего лица.', emoji:'🧟', meta:{size:'26 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Resident Evil 3 Remake',             platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:82, desc:'Джилл Валентайн против Немезиды. Rapid-fire экшн против преследователя.', emoji:'🧟', meta:{size:'22 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Resident Evil 7: Biohazard',         platform:'PS4',      price:TRY(299), priceTRY:299,  pop:87, desc:'Семья Бейкер, вид от первого лица и полный ужас. Лучшее возвращение к корням серии.', emoji:'🏚️', meta:{size:'30 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Dead Space Remake',                  platform:'PS5',      price:TRY(799), priceTRY:799,  pop:86, desc:'Айзек Кларк на USG Ишимура — ремейк с нуля. Некроморфы, zero-gravity и полный ужас.', emoji:'🚀', meta:{size:'50 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'The Callisto Protocol',              platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:73, isSale:true, oldPrice:TRY(999),  desc:'Тюрьма Каллисто и биофаги. Dead Space духовный преемник от создателей оригинала.', emoji:'🪐', meta:{size:'50 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Little Nightmares II',               platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:85, desc:'Моно и Шесть бегут от Бледного Города. Атмосферный платформер-хоррор.', emoji:'📺', meta:{size:'10 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Little Nightmares',                  platform:'PS4',      price:TRY(299), priceTRY:299,  pop:84, isSale:true, oldPrice:TRY(499),  desc:'Шесть спасается с Чрева. Первый кошмар, определивший серию.', emoji:'🔦', meta:{size:'5 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'The Medium',                         platform:'PS5',      price:TRY(499), priceTRY:499,  pop:74, desc:'Мариана — медиум, существующая в двух мирах одновременно. Пост-советский хоррор.', emoji:'👁️', meta:{size:'40 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Amnesia: The Bunker',                platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:77, isNew:true, desc:'Французский бункер Первой мировой. Самодостаточный хоррор с динамо-лампой и монстром.', emoji:'🕯️', meta:{size:'10 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Song of Horror Complete Edition',    platform:'PS4',      price:TRY(299), priceTRY:299,  pop:71, desc:'12 персонажей, одно демоническое присутствие. Survival horror с постоянной смертью.', emoji:'🎵', meta:{size:'15 ГБ',rating:'18+',lang:'RU субтитры'} },

    // ── STRATEGY / SIMULATION ────────────────────────────────────
    { name:'Sid Meier\'s Civilization VI',       platform:'PS4',      price:TRY(299), priceTRY:299,  pop:84, isSale:true, oldPrice:TRY(799),  desc:'Ведите нацию от каменного века до звёзд. Шесть эпох, десятки лидеров, бесконечные стратегии.', emoji:'🏛️', meta:{size:'17 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Cities: Skylines',                   platform:'PS4',      price:TRY(299), priceTRY:299,  pop:80, isSale:true, oldPrice:TRY(699),  desc:'Стройте город мечты. Лучший градостроительный симулятор последнего десятилетия.', emoji:'🏙️', meta:{size:'8 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'Planet Coaster: Console Edition',    platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:77, desc:'Парк аттракционов вашей мечты. Миллионы возможностей кастомизации и зрелищные горки.', emoji:'🎢', meta:{size:'18 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'Two Point Hospital',                 platform:'PS4',      price:TRY(299), priceTRY:299,  pop:79, isSale:true, oldPrice:TRY(699),  desc:'Стройте больницы, лечите нелепые болезни. Духовный наследник Theme Hospital.', emoji:'🏥', meta:{size:'2 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'Tropico 6',                          platform:'PS4',      price:TRY(299), priceTRY:299,  pop:76, isSale:true, oldPrice:TRY(699),  desc:'Вы — Эль Президенте. Управляйте островным государством, балансируя между сверхдержавами.', emoji:'🌴', meta:{size:'10 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Frostpunk: Console Edition',         platform:'PS4',      price:TRY(399), priceTRY:399,  pop:81, desc:'Последний город на замёрзшей Земле. Принимайте жестокие решения ради выживания.', emoji:'❄️', meta:{size:'6 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Surviving the Aftermath',            platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:69, desc:'Постъядерное выживание — стройте колонию и разведывайте опасный внешний мир.', emoji:'☢️', meta:{size:'5 ГБ',rating:'16+',lang:'Нет RU'} },
    { name:'The Forgotten City',                 platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:78, desc:'Временна́я петля в древнеримском городе. Детективный нарратив на основе мода для Skyrim.', emoji:'🏛️', meta:{size:'5 ГБ',rating:'16+',lang:'RU субтитры'} },

    // ── INDIE / AA ───────────────────────────────────────────────
    { name:'Hades',                              platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:95, desc:'Загрей пробирается через Подземный мир. Лучший рогалик всех времён — GOTY 2020.', emoji:'🔱', meta:{size:'15 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Hades II',                           platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:93, isNew:true, desc:'Мелиноэ продолжает борьбу. Ранний доступ уже превзошёл оригинал по многим параметрам.', emoji:'🔱', meta:{size:'20 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Hollow Knight',                      platform:'PS4',      price:TRY(199), priceTRY:199,  pop:92, desc:'Рыцарь в царстве заражённых насекомых. Метроидвания с 40+ часами исследований и лором.', emoji:'🐛', meta:{size:'9 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Celeste',                            platform:'PS4',      price:TRY(199), priceTRY:199,  pop:89, desc:'Мэдлин покоряет гору. Платформер о тревожности и самопринятии — шедевр инди-жанра.', emoji:'🏔️', meta:{size:'1 ГБ',rating:'0+',lang:'RU субтитры'} },
    { name:'Disco Elysium: The Final Cut',       platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:91, desc:'Детектив с амнезией в постреволюционном городе. Чистая RPG без боёв — только диалоги.', emoji:'🔍', meta:{size:'20 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Outer Wilds',                        platform:'PS4',      price:TRY(399), priceTRY:399,  pop:90, desc:'22 минуты до гибели Вселенной. Снова и снова. Лучшая нарративная игра об исследовании.', emoji:'🌌', meta:{size:'3 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'What Remains of Edith Finch',        platform:'PS4',      price:TRY(299), priceTRY:299,  pop:87, desc:'История семьи Финч через смерти каждого члена. 2 часа эмоционального нарратива.', emoji:'🏠', meta:{size:'5 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Journey',                            platform:'PS4',      price:TRY(199), priceTRY:199,  pop:88, desc:'Молчаливое путешествие через пустыню к горе. Онлайн без слов — шедевр Thatgamecompany.', emoji:'🏜️', meta:{size:'2 ГБ',rating:'7+',lang:'Без текста'} },
    { name:'The Pathless',                       platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:79, desc:'Охотница и орёл против проклятого бога. Открытый мир без маркеров — только чувства.', emoji:'🏹', meta:{size:'4 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Haven',                              platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:76, desc:'Юу и Кей сбежали от общества на дикую планету. Кооп-RPG о любви и побеге.', emoji:'❤️', meta:{size:'3 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Spiritfarer',                        platform:'PS4',      price:TRY(299), priceTRY:299,  pop:82, desc:'Стелла перевозит духов в загробный мир. Менеджмент и нежная история о потере.', emoji:'⛵', meta:{size:'3 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'Undertale',                          platform:'PS4',      price:TRY(199), priceTRY:199,  pop:88, desc:'Подземный мир монстров и человеческий ребёнок. Феномен инди — убивать не обязательно.', emoji:'❤️', meta:{size:'1 ГБ',rating:'12+',lang:'Нет RU'} },
    { name:'Cuphead',                            platform:'PS4',      price:TRY(299), priceTRY:299,  pop:87, desc:'30-е годы, анимация Fleischer и адская сложность. Кружка и Дружок против Дьявола.', emoji:'☕', meta:{size:'3 ГБ',rating:'7+',lang:'Нет RU'} },
    { name:'Slay the Spire',                     platform:'PS4',      price:TRY(199), priceTRY:199,  pop:86, desc:'Картами прокладывай путь через шпиль. Лучший деккбилдер всех времён.', emoji:'🃏', meta:{size:'1 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Returnal',                           platform:'PS5',      price:TRY(999), priceTRY:999,  pop:80, desc:'Роглайк-шутер. Селен застряла на Атропосе. Каждая жизнь — новое прохождение, новые шансы.', emoji:'🔄', meta:{size:'30 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Loop Hero',                          platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:77, desc:'Мир без воспоминаний воссоздаётся картами. Уникальный автобатлер в 8-битном стиле.', emoji:'🔁', meta:{size:'1 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Omno',                               platform:'PS4',      price:TRY(199), priceTRY:199,  pop:73, desc:'Медитативный платформер через магические ландшафты. Для тех, кто любит Journey.', emoji:'✨', meta:{size:'1 ГБ',rating:'3+',lang:'Без текста'} },
    { name:'Planet of Lana',                     platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:75, desc:'Лана и кот Муи спасают мир от машин. Кинематографичный платформер в акварельном стиле.', emoji:'🌿', meta:{size:'5 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Neon White',                         platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:82, desc:'Карточный шутер о демонах в раю. Скорость, паркур и безумный нарратив.', emoji:'⚡', meta:{size:'3 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Chicory: A Colorful Tale',           platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:79, desc:'Мир потерял цвет. Ты берёшь кисть Чикори и возвращаешь краски. Пазл-адвенчура.', emoji:'🎨', meta:{size:'1 ГБ',rating:'7+',lang:'Нет RU'} },
    { name:'Unpacking',                          platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:81, desc:'Распаковывай коробки и восстанавливай жизнь хозяйки через предметы. Медитативный шедевр.', emoji:'📦', meta:{size:'1 ГБ',rating:'3+',lang:'Нет RU'} },
    { name:'A Short Hike',                       platform:'PS4',      price:TRY(149), priceTRY:149,  pop:84, desc:'Клэр поднимается на вершину горы. 1-2 часа чистого счастья в чудесном мире природы.', emoji:'🦅', meta:{size:'0.5 ГБ',rating:'3+',lang:'Нет RU'} },
    { name:'Gris',                               platform:'PS4',      price:TRY(199), priceTRY:199,  pop:85, desc:'Девушка теряет голос и проходит через стадии горя. Игровая акварель — произведение искусства.', emoji:'🎨', meta:{size:'1 ГБ',rating:'3+',lang:'Без текста'} },
    { name:'Florence',                           platform:'PS4',      price:TRY(149), priceTRY:149,  pop:78, desc:'История любви Флоренс и Криша в интерактивном комиксе. 45 минут, остаются навсегда.', emoji:'💙', meta:{size:'0.3 ГБ',rating:'3+',lang:'Без текста'} },

    // ── FIGHTING ────────────────────────────────────────────────
    { name:'Mortal Kombat 11 Ultimate',          platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:87, isSale:true, oldPrice:TRY(899),  desc:'Полная версия MK11 с Aftermath и всеми персонажами. Фаталити в замедленной съёмке.', emoji:'🩸', meta:{size:'55 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Street Fighter 6',                   platform:'PS4/PS5',  price:TRY(1299), priceTRY:1299, pop:86, isNew:true, desc:'Capcom переизобрели Street Fighter. World Tour, открытый хаб и лучший онлайн в жанре.', emoji:'🥊', meta:{size:'45 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Tekken 8',                           platform:'PS5',      price:TRY(1499), priceTRY:1499, pop:85, isNew:true, desc:'Казуя против Джина на фоне ядерной войны. Лучший Теккен за 20 лет — Heat System.', emoji:'👊', meta:{size:'60 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Injustice 2 Legendary Edition',      platform:'PS4',      price:TRY(299), priceTRY:299,  pop:84, isSale:true, oldPrice:TRY(699),  desc:'Супергерои DC в битве за мироздание. Legendary включает всех персонажей.', emoji:'🦸', meta:{size:'45 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Dragon Ball FighterZ',               platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:85, isSale:true, oldPrice:TRY(699),  desc:'Аниме-файтинг в стиле рисованного аниме. Arc System Works на пике формы.', emoji:'🔵', meta:{size:'22 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'Guilty Gear Strive',                 platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:82, desc:'Самый технически совершенный файтинг. Рок-музыка, аниме-арт и глубокая механика.', emoji:'⚡', meta:{size:'15 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Granblue Fantasy Versus: Rising',    platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:76, isNew:true, desc:'Обновлённый файтинг по вселенной Granblue. Доступность для новичков, глубина для ветеранов.', emoji:'⚔️', meta:{size:'35 ГБ',rating:'12+',lang:'Нет RU'} },

    // ── MULTIPLAYER / COOP ────────────────────────────────────────
    { name:'Overcooked! All You Can Eat',        platform:'PS4/PS5',  price:TRY(599), priceTRY:599,  pop:86, desc:'Повара в безумных кухнях. 200+ уровней с кооперативом до 4 игроков. Лучшее для компании.', emoji:'🍳', meta:{size:'6 ГБ',rating:'3+',lang:'RU субтитры',players:'1-4'} },
    { name:'Moving Out 2',                       platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:82, desc:'Перевози мебель через хаос. Кооп-безумие до 4 игроков в мультивселенной переездов.', emoji:'🚚', meta:{size:'5 ГБ',rating:'7+',lang:'RU субтитры',players:'1-4'} },
    { name:'Sackboy: A Big Adventure',           platform:'PS4/PS5',  price:TRY(699), priceTRY:699,  pop:80, desc:'Классический платформер с Мешочником до 4 игроков. Красочные миры и музыкальные уровни.', emoji:'🧶', meta:{size:'34 ГБ',rating:'7+',lang:'RU субтитры',players:'1-4'} },
    { name:'Gang Beasts',                        platform:'PS4',      price:TRY(299), priceTRY:299,  pop:82, isSale:true, oldPrice:TRY(599),  desc:'Желеобразные персонажи дерутся в абсурдных сценах. Лучший вечеринковый файтинг.', emoji:'🫁', meta:{size:'2 ГБ',rating:'12+',lang:'RU субтитры',players:'2-4'} },
    { name:'Pummel Party',                       platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:80, desc:'Вечеринковая игра с мини-играми и предательством. Mario Party, но жёстче.', emoji:'🎲', meta:{size:'2 ГБ',rating:'12+',lang:'Нет RU',players:'2-8'} },
    { name:'Stick Fight: The Game',              platform:'PS4',      price:TRY(149), priceTRY:149,  pop:78, isSale:true, oldPrice:TRY(299),  desc:'Стикмены в хаотичных схватках. Идеально для вечеринок на диване.', emoji:'🥢', meta:{size:'0.5 ГБ',rating:'7+',lang:'Нет RU',players:'2-4'} },
    { name:'Untitled Goose Game',                platform:'PS4',      price:TRY(299), priceTRY:299,  pop:83, desc:'Ты — злобный гусь. Терроризируй деревню по списку. Кооп на 2 игроков.', emoji:'🦢', meta:{size:'1 ГБ',rating:'3+',lang:'Нет RU',players:'1-2'} },
    { name:'Human: Fall Flat',                   platform:'PS4/PS5',  price:TRY(199), priceTRY:199,  pop:81, isSale:true, oldPrice:TRY(399),  desc:'Бесформенный Боб решает физические головоломки. Кооп на 8 человек — сплошной хаос.', emoji:'🧊', meta:{size:'2 ГБ',rating:'3+',lang:'RU субтитры',players:'1-8'} },
    { name:'Lovers in a Dangerous Spacetime',    platform:'PS4',      price:TRY(199), priceTRY:199,  pop:75, isSale:true, oldPrice:TRY(399),  desc:'Управляйте космическим кораблём вдвоём. Кооп-шутер в ярком неоновом стиле.', emoji:'🚀', meta:{size:'1 ГБ',rating:'7+',lang:'RU субтитры',players:'1-2'} },
    { name:'PlateUp!',                           platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:77, desc:'Строй и управляй рестораном в кооперативе. Overcooked встречает управление бизнесом.', emoji:'🍽️', meta:{size:'1 ГБ',rating:'3+',lang:'Нет RU',players:'1-4'} },

    // ── SIMULATION / RELAXED ─────────────────────────────────────
    { name:'Stardew Valley',                     platform:'PS4',      price:TRY(199), priceTRY:199,  pop:93, desc:'Фермерская RPG, затягивающая навсегда. Выращивай, строй, влюбляйся и изучай подземелья.', emoji:'🌾', meta:{size:'1 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'Farming Simulator 22',               platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:76, isSale:true, oldPrice:TRY(799),  desc:'400+ реальных машин, три карты и все виды сельского хозяйства. Мод-поддержка.', emoji:'🚜', meta:{size:'15 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'PowerWash Simulator',                platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:80, desc:'Мой поверхности мощной струёй воды. Медитативный симулятор с бесконечным дофамином.', emoji:'💧', meta:{size:'3 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'Lawn Mowing Simulator',              platform:'PS4/PS5',  price:TRY(199), priceTRY:199,  pop:71, desc:'Косить газоны в Британии на реальных газонокосилках. Неожиданно медитативно.', emoji:'🌿', meta:{size:'3 ГБ',rating:'3+',lang:'Нет RU'} },
    { name:'House Flipper 2',                    platform:'PS4/PS5',  price:TRY(599), priceTRY:599,  pop:77, isNew:true, desc:'Купи убитый дом, отремонтируй, продай дороже. Симулятор риелтора-дизайнера.', emoji:'🏠', meta:{size:'5 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'My Time at Portia',                  platform:'PS4',      price:TRY(199), priceTRY:199,  pop:74, isSale:true, oldPrice:TRY(499),  desc:'Постапокалиптическая ферма и мастерская. Stardew Valley с акцентом на строительство.', emoji:'⚙️', meta:{size:'6 ГБ',rating:'7+',lang:'Нет RU'} },
    { name:'Coral Island',                       platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:76, isNew:true, desc:'Тропический остров, ферма и подводный мир. Stardew Valley с экологической повесткой.', emoji:'🐠', meta:{size:'5 ГБ',rating:'3+',lang:'Нет RU'} },
    { name:'Potion Craft',                       platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:73, desc:'Открой алхимическую лавку. Смешивай зелья, торгуй с клиентами, расширяй рецептарий.', emoji:'⚗️', meta:{size:'1 ГБ',rating:'3+',lang:'RU субтитры'} },
    { name:'Donut County',                       platform:'PS4',      price:TRY(149), priceTRY:149,  pop:76, isSale:true, oldPrice:TRY(299),  desc:'Ты управляешь дырой в земле, поглощающей всё. Остроумная игра о хипстерах.', emoji:'🍩', meta:{size:'1 ГБ',rating:'7+',lang:'RU субтитры'} },
    { name:'Garden Story',                       platform:'PS4/PS5',  price:TRY(199), priceTRY:199,  pop:70, desc:'Виноград стал хранителем острова. Уютный экшн-RPG о восстановлении сообщества.', emoji:'🍇', meta:{size:'1 ГБ',rating:'3+',lang:'Нет RU'} },

    // ── MUSIC / RHYTHM ──────────────────────────────────────────
    { name:'Guitar Hero Live',                   platform:'PS4',      price:TRY(199), priceTRY:199,  pop:74, isSale:true, oldPrice:TRY(499),  desc:'Гитара от первого лица и живые концерты. Новая кнопочная схема меняет всё.', emoji:'🎸', meta:{size:'40 ГБ',rating:'12+',lang:'RU субтитры'} },
    { name:'BPM: Bullets Per Minute',            platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:76, desc:'Шутер в ритм-музыку. Каждый выстрел и перезарядка — в такт. Металл и хардкор.', emoji:'🎵', meta:{size:'4 ГБ',rating:'12+',lang:'Нет RU'} },
    { name:'Thumper',                            platform:'PS4',      price:TRY(199), priceTRY:199,  pop:78, isSale:true, oldPrice:TRY(399),  desc:'Жук-гонщик несётся по треку в ритм-аду. Поддержка PSVR. Гипнотический опыт.', emoji:'🐛', meta:{size:'2 ГБ',rating:'7+',lang:'Нет RU'} },

    // ── ADVENTURE / NARRATIVE ────────────────────────────────────
    { name:'Detroit: Become Human',              platform:'PS4',      price:TRY(499), priceTRY:499,  pop:90, desc:'Андроиды обретают сознание в Детройте 2038. 1000 развилок, 3 героя, десятки концовок.', emoji:'🤖', meta:{size:'55 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Heavy Rain',                         platform:'PS4',      price:TRY(299), priceTRY:299,  pop:85, desc:'Четыре истории о поиске серийного убийцы. Интерактивное кино Дэвида Кейджа.', emoji:'🌧️', meta:{size:'21 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Beyond: Two Souls',                  platform:'PS4',      price:TRY(299), priceTRY:299,  pop:83, desc:'Жоди и призрак Эйдан. Эллен Пейдж и Уиллем Дефо в 15-летней истории сверхспособностей.', emoji:'👁️', meta:{size:'28 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Omori',                              platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:87, desc:'JRPG об омоне и тайных страхах. Неожиданно глубокая история о депрессии и дружбе.', emoji:'⬜', meta:{size:'2 ГБ',rating:'16+',lang:'Нет RU'} },
    { name:'Night in the Woods',                 platform:'PS4',      price:TRY(199), priceTRY:199,  pop:82, desc:'Кошка Мэй возвращается домой и обнаруживает странное. Нарративная игра о тревоге.', emoji:'🌙', meta:{size:'2 ГБ',rating:'16+',lang:'Нет RU'} },
    { name:'Oxenfree II: Lost Signals',          platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:79, isNew:true, desc:'Радиопомехи открывают временны́е порталы. Диалоговый хоррор с ретро-атмосферой.', emoji:'📻', meta:{size:'5 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'A Plague Tale: Requiem',             platform:'PS5',      price:TRY(799), priceTRY:799,  pop:87, isNew:true, desc:'Амиция и Гюго ищут спасения от крыс и инквизиции. Визуальный шедевр и трогательная история.', emoji:'🐀', meta:{size:'58 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'A Plague Tale: Innocence',           platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:86, desc:'Франция XIV века. Сестра спасает брата сквозь войну и чуму. Необыкновенно красивая игра.', emoji:'🐀', meta:{size:'42 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Life is Strange: True Colors',       platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:82, desc:'Алекс Чэнь чувствует эмоции других людей. Детектив в горном городке Хейвен Спрингс.', emoji:'🟣', meta:{size:'24 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Life is Strange Remastered',         platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:85, isSale:true, oldPrice:TRY(799),  desc:'Макс умеет перематывать время. Оригинальная LIS с обновлённой графикой и анимацией.', emoji:'🟣', meta:{size:'35 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Firewatch',                          platform:'PS4',      price:TRY(199), priceTRY:199,  pop:83, desc:'Смотровая башня в лесах Вайоминга. Хэнк и Дейзи через рацию в пожароопасном лете.', emoji:'🌲', meta:{size:'3 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Oxenfree',                           platform:'PS4',      price:TRY(199), priceTRY:199,  pop:80, isSale:true, oldPrice:TRY(399),  desc:'Подростки на острове открывают радиопортал. Живые диалоги и призраки Второй мировой.', emoji:'📻', meta:{size:'2 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Kentucky Route Zero: TV Edition',    platform:'PS4',      price:TRY(299), priceTRY:299,  pop:77, desc:'Магический реализм на трассе через Кентукки. Художественная игра о долгах и мечтах.', emoji:'🚙', meta:{size:'2 ГБ',rating:'16+',lang:'Нет RU'} },

    // ── OPEN WORLD ──────────────────────────────────────────────
    { name:'Days Gone',                          platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:83, desc:'Дикон Сент-Джон и его мотоцикл против орд фрикеров в Орегоне. Недооценённый хит.', emoji:'🏍️', meta:{size:'70 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Far Cry: New Dawn',                  platform:'PS4',      price:TRY(299), priceTRY:299,  pop:75, isSale:true, oldPrice:TRY(599),  desc:'Постъядерный Монтана. Близнецы Мики и Лу против возродившегося Надежды Каунти.', emoji:'🌸', meta:{size:'25 ГБ',rating:'18+',lang:'RU озвучка'} },
    { name:'Assassin\'s Creed Odyssey',          platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:85, isSale:true, oldPrice:TRY(899),  desc:'Спарта и Афины в 431 году до н.э. Кассандра или Алексиос в огромной Греции.', emoji:'🏛️', meta:{size:'46 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Assassin\'s Creed Valhalla',         platform:'PS4/PS5',  price:TRY(499), priceTRY:499,  pop:83, isSale:true, oldPrice:TRY(899),  desc:'Эйвор из Норвегии завоёвывает Англию. Самый большой AC с поселением и полным лором.', emoji:'⚔️', meta:{size:'50 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Assassin\'s Creed Origins',          platform:'PS4',      price:TRY(299), priceTRY:299,  pop:84, isSale:true, oldPrice:TRY(699),  desc:'Баек и Лайла создают Орден в Древнем Египте. Начало RPG-эры Assassin\'s Creed.', emoji:'🐫', meta:{size:'42 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Watch Dogs: Legion',                 platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:74, isSale:true, oldPrice:TRY(799),  desc:'DedSec в Лондоне будущего. Рекрутируй любого NPC — каждый персонаж с уникальной историей.', emoji:'🇬🇧', meta:{size:'50 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Watch Dogs 2',                       platform:'PS4',      price:TRY(199), priceTRY:199,  pop:79, isSale:true, oldPrice:TRY(499),  desc:'DedSec в Сан-Франциско. Маркус против Блюм. Лучший Watch Dogs с открытым хакерством.', emoji:'🌁', meta:{size:'40 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'The Outer Worlds',                   platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:82, isSale:true, oldPrice:TRY(799),  desc:'Obsidian создали Fallout в космосе. Корпорации, колонии и моральные дилеммы.', emoji:'🌌', meta:{size:'20 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Greedfall',                          platform:'PS4/PS5',  price:TRY(299), priceTRY:299,  pop:76, isSale:true, oldPrice:TRY(699),  desc:'Флинт и колонизация фантазийного острова. RPG в духе раннего Dragon Age.', emoji:'🌿', meta:{size:'23 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Elex II',                            platform:'PS4/PS5',  price:TRY(399), priceTRY:399,  pop:68, desc:'Постапокалиптическая планета объединяется против нашествия. Жёсткая открытая RPG.', emoji:'💫', meta:{size:'15 ГБ',rating:'18+',lang:'Нет RU'} },
    { name:'Mafia: Definitive Edition',          platform:'PS4',      price:TRY(399), priceTRY:399,  pop:83, isSale:true, oldPrice:TRY(799),  desc:'Ремейк Mafia 1 с нуля. Томми Анджело в Лост Хэвен 1930-х — история мафиозного возвышения.', emoji:'🎩', meta:{size:'30 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Mafia III: Definitive Edition',      platform:'PS4',      price:TRY(299), priceTRY:299,  pop:77, isSale:true, oldPrice:TRY(699),  desc:'Линкольн Клей против итальянской мафии в Нью-Бордо 1968 года. Атмосфера Юга США.', emoji:'🎩', meta:{size:'32 ГБ',rating:'18+',lang:'RU субтитры'} },
    { name:'Just Cause 4: Reloaded',             platform:'PS4',      price:TRY(199), priceTRY:199,  pop:73, isSale:true, oldPrice:TRY(499),  desc:'Рико Родригес и крюк-кошка против Армии Хаоса. Tornado, blizzard и hurricane.', emoji:'💨', meta:{size:'65 ГБ',rating:'16+',lang:'RU субтитры'} },
    { name:'Rage 2',                             platform:'PS4',      price:TRY(199), priceTRY:199,  pop:70, isSale:true, oldPrice:TRY(499),  desc:'Постапокалипсис + аниматроник. Уокер против Управляющего в безумном мире.', emoji:'😡', meta:{size:'60 ГБ',rating:'18+',lang:'RU субтитры'} },
  ];

  // Insert extra games — split between popular and new/sale categories
  EXTRA_GAMES.forEach((g, i) => {
    // Determine best category
    let cid;
    if (g.isNew && g.isPre) cid = catId.preorder;
    else if (g.isSale) cid = catId.sale;
    else if (g.isNew) cid = catId.new;
    else if (g.platform === 'PS5' && !g.isSale) cid = catId.exclusive;
    else cid = catId.popular;

    P({
      ...g,
      type:    'game',
      catId:   cid,
      inStock: !g.isPre,
      isPre:   g.isPre || false,
      isFeat:  g.pop >= 90,
    });
  });

  run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
    ['store', JSON.stringify({
      name:         'Logovo PlayStation',
      tagline:      'PlayStation Turkey',
      currency:     '₽',
      announcement: '',
    })]);

  const total = get('SELECT COUNT(*) AS c FROM products').c;
  console.log(`[SEED] Добавлено товаров: ${total} в ${cats.length} категорий`);
}

seed();

/* ── Дозаполнение обложек ───────────────────────────────────────
   Проставляет картинки товарам с пустым image по названию.
   Идемпотентно: уже заданные (в т.ч. через админку) не трогаем. */
function backfillImages() {
  let IMAGES;
  try { IMAGES = require('./game-images'); }
  catch (e) { console.warn('[IMAGES] карта обложек не найдена:', e.message); return; }
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const rows = all("SELECT id, name FROM products WHERE image IS NULL OR image = ''");
  let n = 0;
  for (const r of rows) {
    const url = IMAGES[norm(r.name)];
    if (url) { run('UPDATE products SET image = ? WHERE id = ?', [url, r.id]); n++; }
  }
  if (n) console.log(`[IMAGES] Проставлено обложек: ${n} из ${rows.length} без картинки`);
}
try { backfillImages(); } catch (e) { console.error('[IMAGES] ошибка дозаполнения:', e.message); }

/* ── Досев недостающих товаров витрины в БД ──────────────────────
   Каталог витрины (public/js/seed.js → window.SEED.products) может
   содержать игры, добавленные ПОСЛЕ первичного посева БД. Поскольку
   seed() пропускает пересев при productCount>=50, такие игры видны в
   магазине, но отсутствуют в админ-панели. Здесь мы находим отсутствующие
   в БД товары и добавляем их, чтобы владелец мог управлять ими:
     • имя получает префикс «! » — чтобы сразу заметить и поправить цену;
     • meta.autoAdded=true — админка дополнительно подсвечивает строку;
     • hidden=1 — товар виден ТОЛЬКО в админке, в магазине (бот + веб) он
       скрыт, пока владелец не проверит цену и не снимет флаг «скрыт».
       Так витрина показывает ровно опубликованный каталог и ничего лишнего.
   Операция идемпотентна (ключ игнорирует префикс «!») и НЕ изменяет
   существующие товары — только добавляет недостающие. */
function reconcileStoreCatalog() {
  const seedPath = path.join(__dirname, '..', 'public', 'js', 'seed.js');
  let raw;
  try { raw = fs.readFileSync(seedPath, 'utf8'); }
  catch (e) { console.warn('[RECONCILE] seed.js не найден — пропуск:', e.message); return; }

  const pm = raw.match(/products\s*:\s*(\[[\s\S]*?\])\s*,\s*settings\s*:/);
  if (!pm) { console.warn('[RECONCILE] не удалось извлечь products из seed.js'); return; }
  let seedProducts, seedCats = [];
  try { seedProducts = JSON.parse(pm[1]); }
  catch (e) { console.warn('[RECONCILE] ошибка парсинга products:', e.message); return; }
  const cm = raw.match(/categories\s*:\s*(\[[\s\S]*?\])\s*,\s*products\s*:/);
  try { if (cm) seedCats = JSON.parse(cm[1]); } catch {}

  const REGION = 'tr'; // офлайн-каталог витрины = магазин Турции
  const hasRegion = all("PRAGMA table_info(products)").some(c => c.name === 'region');
  const seedSlugById = {};
  seedCats.forEach(c => { seedSlugById[c.id] = c.slug; });
  const dbCatIdBySlug = {};
  all('SELECT id, slug FROM categories').forEach(c => { dbCatIdBySlug[c.slug] = c.id; });

  // Нормализация ключа: игнорируем ведущий «!» и регистр, чтобы повторный
  // запуск не создавал дублей уже добавленных (переименованных) товаров.
  const norm = s => String(s || '').replace(/^\s*!+\s*/, '').trim().toLowerCase();
  const keyOf = (name, platform, type) => `${norm(name)}|${norm(platform)}|${norm(type)}`;
  const existing = new Set();
  all('SELECT name, platform, type FROM products')
    .forEach(r => existing.add(keyOf(r.name, r.platform, r.type)));

  let maxPos = get('SELECT COALESCE(MAX(position),-1) AS p FROM products').p;
  let added = 0;
  for (const p of seedProducts) {
    if (p.hidden) continue;
    const key = keyOf(p.name, p.platform, p.type);
    if (existing.has(key)) continue;
    existing.add(key); // защита от дублей внутри самого seed
    const slug = seedSlugById[p.categoryId];
    const catId = (slug && dbCatIdBySlug[slug] != null) ? dbCatIdBySlug[slug] : null;
    const meta = (p.meta && typeof p.meta === 'object') ? { ...p.meta } : {};
    meta.autoAdded = true; // маркер для подсветки в админке
    const name = /^\s*!/.test(p.name) ? p.name : '! ' + p.name; // префикс «! »
    const cols =
      'type,category_id,name,description,emoji,image,platform,edition,' +
      'price,old_price,in_stock,popularity,is_new,is_sale,is_preorder,is_featured,' +
      'position,hidden,meta' + (hasRegion ? ',region' : '');
    const vals = [
      p.type || 'game', catId, name, p.description || '', p.emoji || '🎮', p.image || '',
      p.platform || '', p.edition || '', Math.round(+p.price || 0),
      p.oldPrice ? Math.round(+p.oldPrice) : null,
      p.inStock === false ? 0 : 1, +p.popularity || 0,
      p.isNew ? 1 : 0, (p.isSale || (p.oldPrice && +p.oldPrice > +p.price)) ? 1 : 0,
      p.isPreorder ? 1 : 0, p.isFeatured ? 1 : 0,
      ++maxPos, 1, JSON.stringify(meta), // hidden=1 — виден только в админке, в магазине скрыт
    ];
    if (hasRegion) vals.push(REGION);
    run(`INSERT INTO products (${cols}) VALUES (${vals.map(() => '?').join(',')})`, vals);
    added++;
  }
  if (added) console.log(`[RECONCILE] Досеяно недостающих товаров из витрины: ${added} (префикс «! », autoAdded, hidden=1 — скрыты в магазине)`);
}
try { reconcileStoreCatalog(); } catch (e) { console.error('[RECONCILE] ошибка сверки каталога:', e.message); }

/* ── Клонирование каталога Турции → Индия (одноразово) ──────────
   Магазин Индии ('in') создаётся как полная копия Турции ('tr'):
   те же категории, товары, фото, описания, платформы и издания.
   ЦЕНА НАМЕРЕННО ОБНУЛЕНА (price=0, old_price=NULL, скидки сняты),
   чтобы владелец выставил стоимость в рупиях вручную через админку.
   Товары помечены hidden=1 — видны только в админке и скрыты в
   магазине Индии, пока не проставлена цена и не снят флаг «скрыт».
   Запускается один раз: если в регионе 'in' уже есть товары — пропуск.
   Слаги категорий Индии получают префикс 'in-' (slug UNIQUE в БД). */
function seedIndiaFromTurkey() {
  const hasRegion = all("PRAGMA table_info(products)").some(c => c.name === 'region');
  if (!hasRegion) return;
  const already = get("SELECT COUNT(*) AS n FROM products WHERE region = 'in'").n;
  if (already > 0) return; // Индия уже наполнена — не трогаем

  const trCats = all("SELECT * FROM categories WHERE region = 'tr' ORDER BY position, id");
  const trProds = all("SELECT * FROM products WHERE region = 'tr' ORDER BY position, id");
  if (!trProds.length && !trCats.length) return;

  const catIdMap = {}; // tr category id → in category id
  for (const c of trCats) {
    const inSlug = /^in-/.test(c.slug) ? c.slug : 'in-' + c.slug;
    run(
      `INSERT INTO categories (slug, title, icon, type, description, position, hidden, region)
       VALUES (?,?,?,?,?,?,?, 'in')`,
      [inSlug, c.title, c.icon, c.type, c.description || '', c.position || 0, c.hidden ? 1 : 0]
    );
    catIdMap[c.id] = get('SELECT last_insert_rowid() AS id').id;
  }

  let cloned = 0;
  for (const p of trProds) {
    const newCat = p.category_id != null && catIdMap[p.category_id] != null ? catIdMap[p.category_id] : null;
    run(
      `INSERT INTO products
         (type, category_id, name, description, emoji, image, platform, edition,
          price, old_price, in_stock, popularity, is_new, is_sale, is_preorder,
          is_featured, position, hidden, meta, region)
       VALUES (?,?,?,?,?,?,?,?, 0, NULL, ?,?,?, 0, ?,?,?, 1, ?, 'in')`,
      [
        p.type || 'game', newCat, p.name, p.description || '', p.emoji || '🎮',
        p.image || '', p.platform || '', p.edition || '',
        p.in_stock == null ? 1 : (p.in_stock ? 1 : 0), p.popularity || 0,
        p.is_new ? 1 : 0, p.is_preorder ? 1 : 0, p.is_featured ? 1 : 0,
        p.position || 0, p.meta || '{}',
      ]
    );
    cloned++;
  }
  console.log(`[INDIA] Каталог Индии создан из Турции: категорий ${trCats.length}, товаров ${cloned} (цена пустая, hidden=1 — задайте цену вручную).`);
}
try { seedIndiaFromTurkey(); } catch (e) { console.error('[INDIA] ошибка клонирования каталога:', e.message); }

/* ── Robokassa InvId ────────────────────────────────────────────
   Выделяет числовой InvId под заказ. Если для заказа он уже есть —
   возвращает прежний (повторное создание платежа не плодит счета,
   Robokassa дедуплицирует по InvId). */
function allocRobokassaInvId(orderId, outSum) {
  const oid = String(orderId);
  const existing = get('SELECT inv_id FROM robokassa_invoices WHERE order_id=?', [oid]);
  if (existing) return existing.inv_id;
  const res = run('INSERT INTO robokassa_invoices (order_id, out_sum) VALUES (?,?)', [oid, String(outSum || '')]);
  return res.lastInsertRowid;
}

/** Обратный поиск: по InvId → order_id (для аудита / будущего ResultURL). */
function getOrderIdByInvId(invId) {
  const row = get('SELECT order_id FROM robokassa_invoices WHERE inv_id=?', [Number(invId)]);
  return row ? row.order_id : null;
}

module.exports = {
  db, all, get, run, tx, generateOrderId, shapeOrder,
  allocRobokassaInvId, getOrderIdByInvId,
};
