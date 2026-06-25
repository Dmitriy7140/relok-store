'use strict';
/* ═══════════════════════════════════════════════════════════════
   Релок v2 — слой данных (SQLite через node:sqlite).
   ═══════════════════════════════════════════════════════════════ */
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'relok.sqlite');

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA cache_size = -8000;');

/* ── Схема ───────────────────────────────────────────────────── */
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

CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_cat  ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_pos  ON products(position);
`);

/* ── Миграции ────────────────────────────────────────────────── */
try { db.exec('ALTER TABLE categories ADD COLUMN description TEXT DEFAULT ""'); } catch {}

/* ── Helpers ─────────────────────────────────────────────────── */
function all(sql, params = []) { return db.prepare(sql).all(...params); }
function get(sql, params = []) { return db.prepare(sql).get(...params); }
function run(sql, params = []) { return db.prepare(sql).run(...params); }

/* ── Seed ────────────────────────────────────────────────────── */
function seed() {
  const count = get('SELECT COUNT(*) AS c FROM products').c;
  if (count > 0) return;

  const cats = [
    { slug: 'games',   title: 'Игры',             icon: '🎮', type: 'game', description: 'Лучшие игры для PlayStation 4 и PlayStation 5' },
    { slug: 'subs',    title: 'Подписки',          icon: '💎', type: 'sub',  description: 'PS Plus, EA Play, Xbox Game Pass' },
    { slug: 'codes',   title: 'Коды пополнения',   icon: '💳', type: 'code', description: 'Пополнение кошельков PSN, Steam, Xbox' },
  ];
  cats.forEach((c, i) =>
    run('INSERT INTO categories (slug,title,icon,type,position,description) VALUES (?,?,?,?,?,?)',
        [c.slug, c.title, c.icon, c.type, i, c.description]));

  const catId = {};
  all('SELECT id,slug FROM categories').forEach(c => catId[c.slug] = c.id);

  const P = (o) => {
    run(`INSERT INTO products
      (type,category_id,name,description,emoji,platform,edition,price,old_price,
       in_stock,popularity,is_new,is_sale,is_preorder,is_featured,position,meta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [o.type, o.category_id, o.name, o.description, o.emoji||'🎮',
       o.platform||'', o.edition||'', o.price, o.old_price??null,
       o.in_stock??1, o.popularity??0, o.is_new??0, o.is_sale??0,
       o.is_preorder??0, o.is_featured??0, o.position??0,
       o.meta ? JSON.stringify(o.meta) : '{}']);
  };

  [
    { name: 'EA Sports FC 26', emoji: '⚽', platform: 'PS4/PS5', edition: 'Standard', price: 5995, popularity: 98, is_featured: 1,
      description: 'Новое поколение футбольного симулятора. Технология HyperMotionV, 30+ лицензированных лиг и LiveSeasons.',
      meta: { size: '45 ГБ', players: '1-22', rating: '3+' } },
    { name: 'It Takes Two', emoji: '🤝', platform: 'PS4/PS5', edition: 'Standard', price: 1995, old_price: 3995, is_sale: 1, popularity: 90,
      description: 'Кооперативная игра года. Кода и Мэй спасают отношения в невероятных приключениях.',
      meta: { size: '50 ГБ', players: '2 игрока', rating: '12+' } },
    { name: 'Red Dead Redemption 2', emoji: '🤠', platform: 'PS4', edition: 'Standard', price: 2695, old_price: 4995, is_sale: 1, popularity: 95,
      description: 'Эпический вестерн от Rockstar. Дикий Запад в огромном открытом мире.',
      meta: { size: '107 ГБ', players: '1 игрок', rating: '18+' } },
    { name: 'GTA V', emoji: '🌆', platform: 'PS4/PS5', edition: 'Premium', price: 1495, old_price: 2995, is_sale: 1, popularity: 99,
      description: 'Самая продаваемая игра всех времён. Лос-Сантос, три героя, огромный онлайн.',
      meta: { size: '100 ГБ', players: '1-30', rating: '18+' } },
    { name: 'Gothic 1 Remake', emoji: '⚔️', platform: 'PS5', edition: 'Standard', price: 7735, is_new: 1, popularity: 65,
      description: 'Полное переосмысление культовой RPG 2001 года в современной графике.',
      meta: { size: '35 ГБ', players: '1 игрок', rating: '16+' } },
    { name: 'Monster Hunter Wilds', emoji: '🐉', platform: 'PS5', edition: 'Standard', price: 6495, is_preorder: 1, popularity: 75,
      description: 'Живая экосистема, монстры, реагирующие на погоду. Охота эволюционирует.',
      meta: { size: '65 ГБ', players: '1-4', rating: '16+' } },
    { name: 'A Way Out', emoji: '🚗', platform: 'PS4', edition: 'Standard', price: 1295, old_price: 2595, is_sale: 1, popularity: 80,
      description: 'Кооперативный побег из тюрьмы — только вместе.',
      meta: { size: '23 ГБ', players: '2 игрока', rating: '18+' } },
    { name: 'EA Sports UFC 6', emoji: '🥊', platform: 'PS5', edition: 'Standard', price: 11995, is_new: 1, is_featured: 1, popularity: 70,
      description: 'Новое поколение UFC — реалистичные удары, актуальный ростер бойцов.',
      meta: { size: '55 ГБ', players: '1-2', rating: '16+' } },
    { name: 'AC Black Flag Resynced', emoji: '🏴‍☠️', platform: 'PS5', edition: 'Standard', price: 7735, is_preorder: 1, popularity: 60,
      description: 'Возвращение легенды. Эдвард Кенуэй и пиратские моря.',
      meta: { size: '70 ГБ', players: '1 игрок', rating: '18+' } },
    { name: 'Hazelight Bundle', emoji: '🌟', platform: 'PS4/PS5', edition: 'It Takes Two + A Way Out', price: 2495, old_price: 5990, is_new: 1, is_sale: 1, popularity: 72,
      description: 'Два лучших кооперативных приключения в одном бандле от Josef Fares.',
      meta: { size: '73 ГБ', players: '2 игрока', rating: '12+' } },
  ].forEach((g, i) => P({ ...g, type: 'game', category_id: catId.games, position: i, in_stock: g.is_preorder ? 0 : 1 }));

  [
    { name: 'PS Plus Essential', emoji: '🟦', platform: 'PlayStation', edition: 'Essential', price: 1200, popularity: 88, is_featured: 1,
      description: 'Базовая подписка PlayStation Plus — онлайн-игры и ежемесячные подарки.',
      meta: { periods: { 1: 1200, 3: 2990, 12: 8990 }, features: ['Онлайн-мультиплеер', '2 игры в месяц бесплатно', 'Скидки магазина PlayStation', 'Облачное хранилище 100 ГБ'] } },
    { name: 'PS Plus Extra', emoji: '🟧', platform: 'PlayStation', edition: 'Extra', price: 1800, popularity: 85,
      description: 'Всё из Essential + каталог 400+ игр PS4 и PS5.',
      meta: { periods: { 1: 1800, 3: 4490, 12: 13490 }, features: ['Всё из PS Plus Essential', 'Каталог 400+ игр PS4/PS5', 'Новые игры каждый месяц', 'Эксклюзивные скидки Extra'] } },
    { name: 'PS Plus Deluxe', emoji: '⬛', platform: 'PlayStation', edition: 'Deluxe', price: 2130, popularity: 82,
      description: 'Максимальный уровень — каталог, классика и облачный стриминг.',
      meta: { periods: { 1: 2130, 3: 5290, 12: 15990 }, features: ['Всё из PS Plus Extra', 'Классика PS1/PS2/PS3/PSP', 'Облачный стриминг игр', 'Пробные версии новых игр'] } },
    { name: 'EA Play — 1 месяц', emoji: '🟪', platform: 'EA', edition: '1 месяц', price: 655, popularity: 70,
      description: 'Доступ к библиотеке EA на 1 месяц.',
      meta: { periods: { 1: 655 }, features: ['100+ игр EA', 'Скидки 10% в EA Shop', 'Пробные версии новинок'] } },
    { name: 'EA Play — 12 месяцев', emoji: '🟪', platform: 'EA', edition: '12 месяцев', price: 4495, popularity: 68,
      description: 'Лучшая цена — EA Play на весь год.',
      meta: { periods: { 12: 4495 }, features: ['Всё из EA Play', 'Экономия 43% vs помесячной', 'Приоритетный доступ к бетам'] } },
    { name: 'Xbox Game Pass Ultimate', emoji: '🟩', platform: 'Xbox', edition: 'Ultimate', price: 890, popularity: 78, is_new: 1,
      description: 'Сотни игр, EA Play, облачный гейминг и Xbox Live Gold.',
      meta: { periods: { 1: 890 }, features: ['300+ игр для Xbox', 'EA Play включён', 'Cloud Gaming', 'Xbox Live Gold'] } },
  ].forEach((s, i) => P({ ...s, type: 'sub', category_id: catId.subs, position: i, in_stock: 1 }));

  [
    { name: 'PSN Пополнение 1000 ₺', emoji: '💳', platform: 'PSN Турция', edition: 'Номинал 1000 ₺', price: 2790, popularity: 86, is_featured: 1,
      description: 'Код пополнения кошелька PlayStation Network (регион Турция) на 1000 турецких лир.' },
    { name: 'PSN Пополнение 500 ₺',  emoji: '💳', platform: 'PSN Турция', edition: 'Номинал 500 ₺',  price: 1450, popularity: 80,
      description: 'Код пополнения кошелька PSN Турция на 500 лир.' },
    { name: 'PSN Пополнение 250 ₺',  emoji: '💳', platform: 'PSN Турция', edition: 'Номинал 250 ₺',  price: 790,  popularity: 74,
      description: 'Код пополнения кошелька PSN Турция на 250 лир.' },
    { name: 'PSN Пополнение 100 ₺',  emoji: '💳', platform: 'PSN Турция', edition: 'Номинал 100 ₺',  price: 350,  popularity: 66, is_new: 1,
      description: 'Код пополнения кошелька PSN Турция на 100 лир.' },
    { name: 'Steam Кошелёк 1000 ₽',  emoji: '🎟️', platform: 'Steam', edition: 'Номинал 1000 ₽', price: 1090, old_price: 1190, is_sale: 1, popularity: 72,
      description: 'Пополнение кошелька Steam на 1000 рублей.' },
    { name: 'Steam Кошелёк 500 ₽',   emoji: '🎟️', platform: 'Steam', edition: 'Номинал 500 ₽',  price: 560, popularity: 64,
      description: 'Пополнение кошелька Steam на 500 рублей.' },
  ].forEach((c, i) => P({ ...c, type: 'code', category_id: catId.codes, position: i, in_stock: 1 }));

  run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
    ['store', JSON.stringify({ name: 'Релок', tagline: 'PlayStation Турция', currency: '₽', announcement: '' })]);
}
seed();

module.exports = { db, all, get, run };
