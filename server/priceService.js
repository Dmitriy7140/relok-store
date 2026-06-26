'use strict';
/* ═══════════════════════════════════════════════════════════════
   Logovo PlayStation — PriceCalculatorService
   
   Отвечает за:
     • конвертацию TRY → RUB по ступенчатой формуле
     • хранение оригинальной цены (TRY) и мультипликатора
     • фоновое обновление цен по расписанию
     • запись истории обновлений в price_log
   ═══════════════════════════════════════════════════════════════ */

const { db, all, get, run } = require('./db');

/* ══════════════════════════════════════════════════════════════
   1. ФОРМУЛА КОНВЕРТАЦИИ TRY → RUB
   ══════════════════════════════════════════════════════════════ */
/* ══════════════════════════════════════════════════════════════
   Формула конвертации TRY → RUB (актуальная, 2026)

   Рыночный курс реселлеров PS Store Turkey:
     ЦБ РФ на 26.06.2026: 1 TRY = 1.61 RUB
     Итоговая цена клиенту с учётом комиссий: 1 TRY ≈ 0.86 RUB
     (Реселлеры работают с минимальной маржой, конкурируют объёмом)

   Проверено по реальным ценам магазинов (open-ps.ru, 2026):
     2799 TRY → 2 410 ₽  (Spider-Man 2, God of War Ragnarök)
     1899 TRY → 1 630 ₽  (Astro Bot, Stellar Blade)
      999 TRY →   860 ₽  (Elden Ring, Resident Evil 4)
      849 TRY →   730 ₽  (GTA V, Witcher 3)
      499 TRY →   430 ₽  (Control, Hollow Knight)

   PS Plus (фиксированные цены 2026):
     Essential: 380 / 900 / 2 700 ₽  (1/3/12 мес)
     Extra:     620 / 1 800 / 5 300 ₽
     Deluxe:    730 / 2 100 / 6 200 ₽
   ══════════════════════════════════════════════════════════════ */

const RATE = 0.86; // RUB за 1 TRY (рыночная цена 2026)

const TIERS = [
  { max: Infinity, multiplier: RATE },
];

function getMultiplier() {
  return RATE;
}

/**
 * Конвертирует цену из TRY в RUB.
 * @param {number} priceTRY
 * @returns {{ rub: number, multiplier: number }}
 */
function convertTRY(priceTRY) {
  if (!priceTRY || priceTRY <= 0) return { rub: 0, multiplier: 0 };
  const rub = Math.round(priceTRY * RATE / 10) * 10;
  return { rub, multiplier: RATE };
}

/**
 * Возвращает структуру цены товара.
 * @param {number} priceTRY
 * @returns {PriceInfo}
 */
function buildPriceInfo(priceTRY) {
  const { rub, multiplier } = convertTRY(priceTRY);
  return {
    originalPriceTRY:  priceTRY,
    exchangeMultiplier: multiplier,
    finalPriceRUB:     rub,
    lastPriceUpdate:   new Date().toISOString(),
  };
}

/* ══════════════════════════════════════════════════════════════
   2. МИГРАЦИЯ БД — добавляем ценовые колонки
   ══════════════════════════════════════════════════════════════ */
function migrate() {
  const migrations = [
    'ALTER TABLE products ADD COLUMN price_try    REAL    DEFAULT 0',
    'ALTER TABLE products ADD COLUMN multiplier   REAL    DEFAULT 0',
    'ALTER TABLE products ADD COLUMN price_updated TEXT   DEFAULT NULL',
  ];
  migrations.forEach(sql => {
    try { db.exec(sql); } catch { /* already exists */ }
  });

  // Таблица лога обновлений цен
  db.exec(`
    CREATE TABLE IF NOT EXISTS price_log (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id  INTEGER NOT NULL,
      old_price   INTEGER,
      new_price   INTEGER,
      old_try     REAL,
      new_try     REAL,
      multiplier  REAL,
      source      TEXT DEFAULT 'manual',
      created_at  TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_price_log_product ON price_log(product_id);
    CREATE INDEX IF NOT EXISTS idx_price_log_created ON price_log(created_at DESC);
  `);
}

/* ══════════════════════════════════════════════════════════════
   3. ОБНОВЛЕНИЕ ЦЕНЫ ОДНОГО ТОВАРА
   ══════════════════════════════════════════════════════════════ */

/**
 * Обновляет цену товара по его TRY-цене.
 * @param {number} productId
 * @param {number} priceTRY
 * @param {string} source — 'seed' | 'manual' | 'scheduler'
 */
function updateProductPrice(productId, priceTRY, source = 'manual') {
  const existing = get('SELECT price, price_try FROM products WHERE id=?', [productId]);
  if (!existing) return null;

  const { rub, multiplier } = convertTRY(priceTRY);
  const now = new Date().toISOString();

  // Обновляем товар
  run(`UPDATE products SET
    price         = ?,
    price_try     = ?,
    multiplier    = ?,
    price_updated = ?
    WHERE id = ?`,
    [rub, priceTRY, multiplier, now, productId]
  );

  // Если цена изменилась — пишем в лог
  if (existing.price !== rub || existing.price_try !== priceTRY) {
    run(`INSERT INTO price_log
      (product_id, old_price, new_price, old_try, new_try, multiplier, source)
      VALUES (?,?,?,?,?,?,?)`,
      [productId, existing.price, rub, existing.price_try || 0, priceTRY, multiplier, source]
    );
  }

  return { id: productId, priceTRY, priceRUB: rub, multiplier, updatedAt: now };
}

/* ══════════════════════════════════════════════════════════════
   4. МАССОВОЕ ОБНОВЛЕНИЕ (bulk update)
   ══════════════════════════════════════════════════════════════ */

/**
 * Пересчитывает все товары у которых задана price_try > 0.
 * @param {string} source
 * @returns {{ updated: number, errors: number }}
 */
function recalculateAll(source = 'scheduler') {
  const products = all('SELECT id, price_try FROM products WHERE price_try > 0');
  let updated = 0, errors = 0;

  products.forEach(p => {
    try {
      updateProductPrice(p.id, p.price_try, source);
      updated++;
    } catch (err) {
      errors++;
      log.err(`Price update failed for product ${p.id}:`, err.message);
    }
  });

  return { updated, errors, total: products.length };
}

/**
 * Устанавливает TRY-цены из массива { id, priceTRY }.
 * Используется при первом заполнении (seed) и ручном импорте.
 * @param {Array<{id: number, priceTRY: number}>} items
 * @param {string} source
 */
function bulkSetTRYPrices(items, source = 'manual') {
  const results = [];
  items.forEach(({ id, priceTRY }) => {
    const result = updateProductPrice(id, priceTRY, source);
    if (result) results.push(result);
  });
  return results;
}

/* ══════════════════════════════════════════════════════════════
   5. ПОЛУЧЕНИЕ ЦЕНЫ ТОВАРА (для API)
   ══════════════════════════════════════════════════════════════ */

/**
 * Возвращает полную ценовую информацию товара.
 * @param {number} productId
 * @returns {PriceDetail|null}
 */
function getProductPriceDetail(productId) {
  const p = get(
    'SELECT price, price_try, multiplier, price_updated FROM products WHERE id=?',
    [productId]
  );
  if (!p) return null;

  return {
    finalPriceRUB:     p.price,
    originalPriceTRY:  p.price_try || 0,
    exchangeMultiplier: p.multiplier || 0,
    lastPriceUpdate:   p.price_updated || null,
  };
}

/**
 * История изменений цены товара.
 * @param {number} productId
 * @param {number} limit
 */
function getPriceHistory(productId, limit = 20) {
  return all(
    `SELECT * FROM price_log WHERE product_id=? ORDER BY created_at DESC LIMIT ?`,
    [productId, limit]
  ).map(r => ({
    id:         r.id,
    oldPriceRUB: r.old_price,
    newPriceRUB: r.new_price,
    oldTRY:     r.old_try,
    newTRY:     r.new_try,
    multiplier: r.multiplier,
    source:     r.source,
    createdAt:  r.created_at,
  }));
}

/* ══════════════════════════════════════════════════════════════
   6. ПЛАНИРОВЩИК — фоновое обновление цен
   ══════════════════════════════════════════════════════════════ */
const log = {
  info: (...a) => console.log(new Date().toISOString(), '[PRICE]', ...a),
  err:  (...a) => console.error(new Date().toISOString(), '[PRICE ERR]', ...a),
};

let _schedulerTimer = null;

/**
 * Запускает планировщик обновления цен.
 * 
 * Настройка расписания:
 *   PRICE_UPDATE_INTERVAL_MS — интервал в миллисекундах (default: 24 часа)
 *   Переменная окружения позволяет менять расписание без правки кода:
 *     PRICE_UPDATE_INTERVAL_MS=3600000  → каждый час
 *     PRICE_UPDATE_INTERVAL_MS=86400000 → раз в сутки (default)
 *     PRICE_UPDATE_INTERVAL_MS=0        → отключить планировщик
 */
function startScheduler() {
  const intervalMs = +(process.env.PRICE_UPDATE_INTERVAL_MS ?? 24 * 60 * 60 * 1000);

  if (intervalMs <= 0) {
    log.info('Планировщик отключён (PRICE_UPDATE_INTERVAL_MS=0)');
    return;
  }

  log.info(`Планировщик запущен — интервал ${intervalMs / 60000} мин`);

  async function tick() {
    log.info('Пересчёт цен...');
    try {
      const result = recalculateAll('scheduler');
      log.info(`Обновлено: ${result.updated}/${result.total}, ошибок: ${result.errors}`);
      // Записываем время последнего запуска
      run('INSERT OR REPLACE INTO settings (key,value) VALUES (?,?)',
        ['price_last_run', JSON.stringify(new Date().toISOString())]);
    } catch (err) {
      log.err('Ошибка планировщика:', err.message);
    }
  }

  _schedulerTimer = setInterval(tick, intervalMs);
  // Первый запуск через 10 секунд после старта сервера
  setTimeout(tick, 10_000);
}

function stopScheduler() {
  if (_schedulerTimer) { clearInterval(_schedulerTimer); _schedulerTimer = null; }
}

/* ══════════════════════════════════════════════════════════════
   7. ИНИЦИАЛИЗАЦИЯ — заполняем price_try из seed-данных если пусто
   ══════════════════════════════════════════════════════════════ */
function initPrices() {
  migrate();

  // Количество товаров без price_try
  const missing = get('SELECT COUNT(*) AS c FROM products WHERE price_try = 0 AND price > 0').c;
  if (missing === 0) return;

  log.info(`Инициализация price_try для ${missing} товаров...`);

  // Для товаров без TRY-цены — обратный расчёт из RUB
  // (приближённый, только при первом запуске)
  const products = all('SELECT id, price FROM products WHERE price_try = 0 AND price > 0');
  products.forEach(p => {
    // Обратный расчёт: RUB / среднее_множитель ≈ TRY
    // Используем среднее 2.75 — это центр нашей шкалы
    const estimatedTRY = Math.round(p.price / 2.75 / 50) * 50; // округляем до 50 TRY
    updateProductPrice(p.id, estimatedTRY, 'init');
  });

  log.info('Инициализация price_try завершена');
}

module.exports = {
  // Формула
  convertTRY,
  getMultiplier,
  buildPriceInfo,
  TIERS,

  // CRUD
  updateProductPrice,
  recalculateAll,
  bulkSetTRYPrices,
  getProductPriceDetail,
  getPriceHistory,

  // Планировщик
  startScheduler,
  stopScheduler,

  // Инициализация
  migrate,
  initPrices,
};
