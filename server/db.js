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

/* ── Helpers ────────────────────────────────────────────────── */
function all(sql, params = []) { return db.prepare(sql).all(...params); }
function get(sql, params = []) { return db.prepare(sql).get(...params); }
function run(sql, params = []) { return db.prepare(sql).run(...params); }

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
    telegram: r.telegram || '', productName: r.product_name,
    productId: r.product_id || null, amount: r.amount,
    comment: r.comment || '', status: r.status,
    notified: !!r.notified, meta,
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
function tryToRub(try_) {
  let rate;
  if      (try_ <= 500)  rate = 3.3;
  else if (try_ <= 1000) rate = 2.9;
  else if (try_ <= 1500) rate = 2.75;
  else if (try_ <= 2500) rate = 2.4;
  else                   rate = 2.3;
  return Math.round(try_ * rate / 10) * 10; // round to 10 ₽
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
    run(`INSERT INTO products
      (type,category_id,name,description,emoji,image,platform,edition,
       price,old_price,in_stock,popularity,is_new,is_sale,is_preorder,is_featured,position,meta)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [o.type||'game', o.catId||null, o.name, o.desc||'', o.emoji||'🎮', o.img||'',
       o.platform||'PS4/PS5', o.edition||'Standard',
       o.price||0, o.oldPrice||null, b(o.inStock??true), o.pop||0,
       b(o.isNew), b(o.isSale), b(o.isPre), b(o.isFeat),
       pos++, JSON.stringify(o.meta||{})]);
  };

  /* ════════════════════════════════════════════════════════════
     НОВИНКИ  (2024–2025)
     ════════════════════════════════════════════════════════════ */
  [
    {
      name:'GTA VI', desc:'Вице-Сити возвращается. Люсия и Джейсон — новые иконы Rockstar. Открытый мир, который переопределяет индустрию.',
      emoji:'🏖️', platform:'PS5', edition:'Standard', price:tryToRub(2799), pop:99,
      isNew:true, isFeat:true, isPre:true, inStock:true, img:'',
      meta:{ size:'150+ ГБ', rating:'18+', lang:'RU субтитры ожидаются', release:'2026' }
    },
    {
      name:'Ghost of Yōtei', desc:'Следующая глава от Sucker Punch. Эдзо Каваками — женщина-самурай в Хоккайдо 1603 года. Новые механики боя и невероятный открытый мир.',
      emoji:'⛩️', platform:'PS5', edition:'Standard', price:tryToRub(2799), pop:92,
      isNew:true, isFeat:true, isPre:true, inStock:true, img:'',
      meta:{ size:'80+ ГБ', rating:'18+', lang:'RU субтитры', release:'2025' }
    },
    {
      name:'Death Stranding 2: On the Beach', desc:'Сэм Бридж снова в пути. Кодзима расширяет мифологию и механики. Новые персонажи, новые связи и абсолютно безумная история.',
      emoji:'🌊', platform:'PS5', edition:'Standard', price:tryToRub(2499), pop:88,
      isNew:true, isFeat:true, inStock:true, img:'',
      meta:{ size:'90 ГБ', rating:'18+', lang:'RU субтитры' }
    },
    {
      name:'Assassin\'s Creed Shadows', desc:'Феодальная Япония глазами двух героев: синоби Наоэ и самурай Ясукэ. Динамическая смена сезонов и переработанный стелс.',
      emoji:'🗡️', platform:'PS4/PS5', edition:'Standard', price:tryToRub(2100), pop:82,
      isNew:true, inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'18+', lang:'RU субтитры' }
    },
    {
      name:'Kingdom Come: Deliverance II', desc:'Средневековая Чехия, никаких суперспособностей — только история, сталь и реализм. Продолжение культовой RPG от Warhorse Studios.',
      emoji:'⚔️', platform:'PS5', edition:'Standard', price:tryToRub(2099), pop:84,
      isNew:true, inStock:true, img:'',
      meta:{ size:'70 ГБ', rating:'18+', lang:'RU субтитры' }
    },
    {
      name:'Monster Hunter Wilds', desc:'Живая экосистема, где монстры охотятся и конкурируют друг с другом. Динамическая погода меняет тактику охоты. Лучший Monster Hunter в истории серии.',
      emoji:'🐉', platform:'PS5', edition:'Standard', price:tryToRub(2799), pop:91,
      isNew:true, inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'16+', lang:'RU субтитры', players:'1-4' }
    },
    {
      name:'Astro Bot', desc:'Лучшая игра 2024 по версии TGA. Астро спасает планету PlayStation — 80 уровней чистого веселья для всей семьи. Эксклюзив PS5.',
      emoji:'🤖', platform:'PS5', edition:'Standard', price:tryToRub(1899), pop:95,
      isNew:true, isFeat:true, inStock:true, img:'',
      meta:{ size:'12 ГБ', rating:'3+', lang:'RU субтитры' }
    },
    {
      name:'Stellar Blade', desc:'Ева сражается с Нейтивами на руинах будущей Земли. Боёвка в стиле Sekiro с элементами Nier: Automata. Эксклюзив PS5 с ошеломительной картинкой.',
      emoji:'💫', platform:'PS5', edition:'Standard', price:tryToRub(1899), pop:86,
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
      emoji:'🏖️', platform:'PS5', edition:'Standard', price:tryToRub(2799), pop:99,
      isFeat:true, isPre:true, inStock:true, img:'',
      meta:{ size:'150+ ГБ', rating:'18+', release:'2026' }
    },
    {
      name:'Ghost of Yōtei', desc:'Предзаказ эксклюзива Sony. Открытый мир Хоккайдо ждёт. Бонус предзаказа — набор предметов Хаяте.',
      emoji:'⛩️', platform:'PS5', edition:'Standard', price:tryToRub(2799), pop:90,
      isPre:true, inStock:true, img:'',
      meta:{ size:'80+ ГБ', rating:'18+', release:'2025' }
    },
    {
      name:'Mafia: The Old Country', desc:'Сицилия 1900 года. Корни организованной преступности. Новая история от 2K Games в новом историческом сеттинге.',
      emoji:'🎩', platform:'PS5', edition:'Standard', price:tryToRub(2499), pop:78,
      isPre:true, inStock:true, img:'',
      meta:{ size:'60+ ГБ', rating:'18+', release:'2025' }
    },
    {
      name:'Borderlands 4', desc:'Лут-шутер с лучшим юмором в жанре возвращается. Новые Убийцы, новые планеты и миллиарды стволов.',
      emoji:'🔫', platform:'PS4/PS5', edition:'Standard', price:tryToRub(2799), pop:75,
      isPre:true, inStock:true, img:'',
      meta:{ size:'70+ ГБ', rating:'18+', release:'2025', players:'1-4' }
    },
    {
      name:'Doom: The Dark Ages', desc:'Палач Рока в Тёмных веках. Новая боевая система, новый арсенал, новое безумие. Предзаказ уже открыт.',
      emoji:'💀', platform:'PS5', edition:'Standard', price:tryToRub(2799), pop:83,
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
      emoji:'⚡', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1399), pop:98,
      isFeat:true, inStock:true, img:'',
      meta:{ size:'84 ГБ', rating:'18+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Marvel\'s Spider-Man 2', desc:'Питер Паркер и Майлз Моралес против Венома и Крейвена. Открытый Нью-Йорк, паутина-крылья и 30 часов сюжета. Эксклюзив PS5.',
      emoji:'🕷️', platform:'PS5', edition:'Standard', price:tryToRub(1899), pop:97,
      isFeat:true, inStock:true, img:'',
      meta:{ size:'52 ГБ', rating:'16+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Elden Ring', desc:'Майяtзаки + Мартин = лучший open-world от FromSoftware. DLC Shadow of the Erdtree уже доступно. GOTY по версии большинства изданий 2022 года.',
      emoji:'🌑', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1199), pop:96,
      inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'16+', lang:'Нет RU', players:'1 / онлайн' }
    },
    {
      name:'Elden Ring: Shadow of the Erdtree Edition', desc:'Базовая игра + масштабное DLC с новым регионом, боссами и снаряжением. Лучшая точка входа во Вселенную Elden Ring.',
      emoji:'🌑', platform:'PS4/PS5', edition:'Shadow of the Erdtree', price:tryToRub(1699), pop:94,
      inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'16+', lang:'Нет RU' }
    },
    {
      name:'Red Dead Redemption 2', desc:'Эпический вестерн от Rockstar. Артур Морган в умирающей эпохе Дикого Запада. 60 часов сюжета, который не отпускает.',
      emoji:'🤠', platform:'PS4', edition:'Standard', price:tryToRub(849), pop:95,
      inStock:true, img:'',
      meta:{ size:'107 ГБ', rating:'18+', lang:'RU озвучка', players:'1 / онлайн' }
    },
    {
      name:'The Last of Us Part I', desc:'Ремастер с нуля на PS5. Джоэл и Элли в постапокалипсисе. Если не играл — это обязательно. Если играл — снова обязательно.',
      emoji:'🍄', platform:'PS5', edition:'Standard', price:tryToRub(1099), pop:93,
      inStock:true, img:'',
      meta:{ size:'80 ГБ', rating:'18+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Cyberpunk 2077: Ultimate Edition', desc:'После патча 2.0 и DLC Phantom Liberty — это другая игра. Найт-Сити, Ви, Джонни Сильверхенд и Идрис Эльба в одном паке.',
      emoji:'🌆', platform:'PS5', edition:'Ultimate Edition', price:tryToRub(1299), pop:91,
      inStock:true, img:'',
      meta:{ size:'75 ГБ', rating:'18+', lang:'RU озвучка', players:'1' }
    },
    {
      name:'EA Sports FC 26', desc:'30+ лицензированных лиг, технология HyperMotionV и режим Ultimate Team. Самый реалистичный футбол на консолях.',
      emoji:'⚽', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1599), pop:89,
      inStock:true, img:'',
      meta:{ size:'45 ГБ', rating:'3+', lang:'RU интерфейс', players:'1-22' }
    },
    {
      name:'Black Myth: Wukong', desc:'Китайская мифология, снаряжение миллиона видов и боссы, которые тебя убьют. Первая AAA от китайской студии. Шедевр.',
      emoji:'🐒', platform:'PS5', edition:'Standard', price:tryToRub(1899), pop:92,
      inStock:true, img:'',
      meta:{ size:'130 ГБ', rating:'16+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'It Takes Two', desc:'Кооператив, за который дали GOTY 2021. Кода и Мэй спасают брак через безумные миры — прыжки, стрельба, гонки. Нужен второй игрок.',
      emoji:'🤝', platform:'PS4/PS5', edition:'Standard', price:tryToRub(849), pop:90,
      inStock:true, img:'',
      meta:{ size:'50 ГБ', rating:'12+', lang:'RU субтитры', players:'2 (кооп)' }
    },
    {
      name:'Baldur\'s Gate 3', desc:'Лучшая RPG нашего времени по версии TGA 2023. Forgotten Realms, D&D, 800+ часов контента, 17 000 концовок — выбор за тобой.',
      emoji:'🎲', platform:'PS5', edition:'Standard', price:tryToRub(1299), pop:96,
      inStock:true, img:'',
      meta:{ size:'150 ГБ', rating:'18+', lang:'Нет RU', players:'1-4' }
    },
    {
      name:'Resident Evil 4 Remake', desc:'Леон Кеннеди, Испания и культисты. Культовый хоррор переделан с нуля. Лучший ремейк в серии и один из лучших шутеров последних лет.',
      emoji:'🧟', platform:'PS4/PS5', edition:'Standard', price:tryToRub(999), pop:88,
      inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'18+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Gran Turismo 7', desc:'450+ автомобилей, 37 трасс, режим Карьера на 40+ часов. Самый серьёзный гоночный симулятор на консолях с поддержкой PSVR2.',
      emoji:'🏎️', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1099), pop:85,
      inStock:true, img:'',
      meta:{ size:'90 ГБ', rating:'3+', lang:'RU интерфейс', players:'1-20' }
    },
    {
      name:'Hogwarts Legacy', desc:'Открытый мир волшебства в XIX веке. Хогвартс, магические существа и тёмные секреты. 40 часов в любимой вселенной Гарри Поттера.',
      emoji:'🪄', platform:'PS4/PS5', edition:'Standard', price:tryToRub(999), pop:87,
      inStock:true, img:'',
      meta:{ size:'65 ГБ', rating:'12+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Horizon Forbidden West: Complete Edition', desc:'Элой и красная чума в Западном побережье. Complete Edition с DLC Burning Shores. Самые красивые пейзажи на PS5.',
      emoji:'🏹', platform:'PS4/PS5', edition:'Complete Edition', price:tryToRub(1099), pop:86,
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
      emoji:'💀', platform:'PS5', edition:'Standard', price:tryToRub(999), pop:82,
      inStock:true, img:'',
      meta:{ size:'66 ГБ', rating:'16+', lang:'RU субтитры', players:'1 / онлайн' }
    },
    {
      name:'Marvel\'s Spider-Man: Miles Morales', desc:'Майлз Моралес и его уникальные способности. Рождество в Гарлеме, суперсила электричества и мощная история о семье.',
      emoji:'🕷️', platform:'PS4/PS5', edition:'Standard', price:tryToRub(1099), pop:91,
      inStock:true, img:'',
      meta:{ size:'39 ГБ', rating:'12+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Ghost of Tsushima: Director\'s Cut', desc:'Самурайская поэзия в открытом мире. Дзин Сакай против монгольского нашествия. Director\'s Cut включает остров Ики и онлайн-режим.',
      emoji:'🌸', platform:'PS4/PS5', edition:"Director's Cut", price:tryToRub(1199), pop:93,
      inStock:true, img:'',
      meta:{ size:'50 ГБ', rating:'18+', lang:'RU субтитры', players:'1 / 2-8' }
    },
    {
      name:'Returnal', desc:'Роглайк-шутер в третьем лице. Селен застряла в петле времени на враждебной планете. Самый трудный и самый захватывающий эксклюзив PS5.',
      emoji:'🔄', platform:'PS5', edition:'Standard', price:tryToRub(999), pop:80,
      inStock:true, img:'',
      meta:{ size:'30 ГБ', rating:'18+', lang:'RU субтитры', players:'1 / 2' }
    },
    {
      name:'Ratchet & Clank: Rift Apart', desc:'Кинематографичный платформер, который показывает возможности PS5. SSD телепортирует через измерения мгновенно. Семейный хит.',
      emoji:'🔧', platform:'PS5', edition:'Standard', price:tryToRub(999), pop:85,
      inStock:true, img:'',
      meta:{ size:'42 ГБ', rating:'7+', lang:'RU субтитры', players:'1' }
    },
    {
      name:'Bloodborne', desc:'Культовый экшен From Software в викторианском готическом городе Ярнам. Один из лучших эксклюзивов PlayStation всех времён.',
      emoji:'🌙', platform:'PS4', edition:'Standard', price:tryToRub(699), pop:90,
      inStock:true, img:'',
      meta:{ size:'36 ГБ', rating:'18+', lang:'Нет RU', players:'1 / онлайн' }
    },
    {
      name:'Horizon Zero Dawn: Complete Edition', desc:'Алой против машин в постапокалиптическом мире. Классика, с которой нужно начинать знакомство с серией. Включает DLC Frozen Wilds.',
      emoji:'🦕', platform:'PS4', edition:'Complete Edition', price:tryToRub(699), pop:87,
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
      price:tryToRub(209), oldPrice:tryToRub(699), pop:99, isSale:true, isFeat:true, inStock:true, img:'',
      meta:{ size:'100 ГБ', rating:'18+', lang:'RU озвучка', players:'1-30', discount:'70%' }
    },
    {
      name:'The Witcher 3: Complete Edition', desc:'Геральт из Ривии и весь дополнительный контент. Hearts of Stone + Blood and Wine включены. Скидка 75% — купи пока дают.',
      emoji:'🐺', platform:'PS4/PS5', edition:'Complete Edition',
      price:tryToRub(259), oldPrice:tryToRub(1099), pop:96, isSale:true, inStock:true, img:'',
      meta:{ size:'50 ГБ', rating:'18+', lang:'RU озвучка', discount:'75%' }
    },
    {
      name:'A Way Out', desc:'Побег из тюрьмы вдвоём — лучший кооп на диване. Режим Friend Pass позволяет играть со вторым игроком бесплатно. Скидка 60%.',
      emoji:'🚗', platform:'PS4', edition:'Standard',
      price:tryToRub(349), oldPrice:tryToRub(899), pop:82, isSale:true, inStock:true, img:'',
      meta:{ size:'23 ГБ', rating:'18+', lang:'RU субтитры', players:'2 (кооп)', discount:'60%' }
    },
    {
      name:'Sekiro: Shadows Die Twice GOTY', desc:'Синоби против самураев. Самая сложная игра From Software с лучшей системой парирования. GOTY включает все дополнения.',
      emoji:'🥷', platform:'PS4', edition:'GOTY Edition',
      price:tryToRub(549), oldPrice:tryToRub(1499), pop:89, isSale:true, inStock:true, img:'',
      meta:{ size:'15 ГБ', rating:'18+', lang:'Нет RU', discount:'60%' }
    },
    {
      name:'Mortal Kombat 1', desc:'Перезапуск серии с нуля. Лю Кан создал новую вселенную. Камео-бойцы, новые камерные режимы и зрелищные фаталити.',
      emoji:'🩸', platform:'PS4/PS5', edition:'Standard',
      price:tryToRub(799), oldPrice:tryToRub(1999), pop:84, isSale:true, inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'18+', lang:'RU субтитры', discount:'60%' }
    },
    {
      name:'Dying Light 2: Ultimate Edition', desc:'Паркур, зомби и моральные выборы, которые меняют мир. Ultimate Edition с сезонным пропуском. Скидка 65% — это почти подарок.',
      emoji:'🧟', platform:'PS4/PS5', edition:'Ultimate Edition',
      price:tryToRub(699), oldPrice:tryToRub(1999), pop:80, isSale:true, inStock:true, img:'',
      meta:{ size:'60 ГБ', rating:'18+', lang:'RU озвучка', players:'1-4', discount:'65%' }
    },
    {
      name:'EA Sports FC 25', desc:'Предыдущее издание FC по суперцене. Если не хочешь тратиться на 26-ю — тут тот же футбол с аналогичными лигами. Скидка 50%.',
      emoji:'⚽', platform:'PS4/PS5', edition:'Standard',
      price:tryToRub(699), oldPrice:tryToRub(1399), pop:78, isSale:true, inStock:true, img:'',
      meta:{ size:'43 ГБ', rating:'3+', lang:'RU интерфейс', discount:'50%' }
    },
    {
      name:'Battlefield 2042', desc:'Фан-шутер с огромными картами и режимом Portal. Всё ещё живёт и дышит. По такой цене — грех не попробовать.',
      emoji:'💣', platform:'PS4/PS5', edition:'Standard',
      price:tryToRub(199), oldPrice:tryToRub(899), pop:72, isSale:true, inStock:true, img:'',
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

module.exports = { db, all, get, run, generateOrderId, shapeOrder };
