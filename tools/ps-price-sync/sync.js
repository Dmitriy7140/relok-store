'use strict';
/* ═══════════════════════════════════════════════════════════════
   ГЛАВНЫЙ СЦЕНАРИЙ — синхронизация цен PS Store (TR) → Google Sheets.

   Шаги:
     1. Получаем все игры из магазина (storeGames).
     2. Для каждой ищем товар в официальном PS Store (psStore).
     3. Подбираем нужное издание (matcher) и берём цену в TRY.
     4. Формируем строку результата со статусом.
     5. Делаем upsert в Google Sheets (sheets) — без дублей,
        рубли не трогаем, новые игры добавляются.

   Запуск:
     node --env-file=.env tools/ps-price-sync/sync.js
   Повторный запуск обновит только TRY-цены и статусы.
   ═══════════════════════════════════════════════════════════════ */

const log = require('./logger');
const { getStoreGames } = require('./storeGames');
const { searchGames } = require('./psStore');
const { pickBest } = require('./matcher');
const { formatTry } = require('./priceFormat');
const { SheetsClient } = require('./sheets');
const config = require('./config');

// Возможные статусы строки.
const STATUS = {
  OK: 'OK',
  NEED_CHECK: 'Требуется проверка',        // не найдено автоматически
  NO_PRICE: 'Цена недоступна',             // найдено, но нет цены / товар недоступен
  FREE: 'Бесплатно',
  ERROR: 'Ошибка запроса',                 // сбой сети/парсинга
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Обрабатывает одну игру: поиск → подбор → цена.
 * Никогда не бросает исключение — при сбое возвращает статус «Ошибка».
 * @param {import('./storeGames').StoreGame} game
 */
async function processGame(game) {
  const base = {
    id: game.id,
    name: game.name,
    edition: game.edition,
    priceRub: game.priceRub,
    psName: '',
    priceTryStr: '',
    url: '',
    updatedAt: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };

  try {
    // Ищем по «чистому» названию (издание учтём при подборе).
    const candidates = await searchGames(game.name);

    if (!candidates.length) {
      log.warn(`[${game.id}] «${game.name}» — ничего не найдено`);
      return { ...base, status: STATUS.NEED_CHECK };
    }

    const { match, score } = pickBest(game, candidates);

    if (!match) {
      log.warn(`[${game.id}] «${game.name}» — совпадение слабое (score=${score.toFixed(2)})`);
      return { ...base, status: STATUS.NEED_CHECK };
    }

    base.psName = match.name;
    base.url = match.url || '';

    // Разбираем цену/доступность.
    if (match.free) {
      return { ...base, priceTryStr: 'Ücretsiz', status: STATUS.FREE };
    }
    if (match.unavailable || !match.priceStr) {
      log.warn(`[${game.id}] «${game.name}» → «${match.name}» — цена недоступна`);
      return { ...base, status: STATUS.NO_PRICE };
    }

    // Цена — в исходном формате сайта («2.999,00 TL»).
    // На всякий случай нормализуем через formatTry, если формат нестандартный.
    const priceTryStr =
      /TL/i.test(match.priceStr) ? match.priceStr : formatTry(match.priceNum);

    log.info(`[${game.id}] «${game.name}» → «${match.name}» = ${priceTryStr} (score=${score.toFixed(2)})`);
    return { ...base, priceTryStr, status: STATUS.OK };
  } catch (err) {
    log.error(`[${game.id}] «${game.name}» — сбой: ${err.message}`);
    return { ...base, status: STATUS.ERROR };
  }
}

async function main() {
  const startedAt = Date.now();
  log.info('═══ Старт синхронизации PS Store (TR) → Google Sheets ═══');

  // 1. Список игр магазина.
  const games = getStoreGames();
  if (!games.length) {
    log.error('Список игр пуст — нечего синхронизировать.');
    process.exit(1);
  }

  // 2–4. Обрабатываем последовательно (вежливый rate-limit к сайту Sony).
  const results = [];
  const stats = {};
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    log.debug(`(${i + 1}/${games.length}) обрабатывается «${g.name}»`);
    const r = await processGame(g);
    results.push(r);
    stats[r.status] = (stats[r.status] || 0) + 1;
    await sleep(config.psStore.throttleMs);
  }

  // 5. Пишем в Google Sheets (upsert).
  log.info('Запись в Google Sheets…');
  const client = new SheetsClient();
  await client.init();
  const { updated, added } = await client.upsert(results);

  const secs = ((Date.now() - startedAt) / 1000).toFixed(0);
  log.info('─── Итоги ───');
  log.info(`Всего игр: ${results.length}`);
  Object.entries(stats).forEach(([k, v]) => log.info(`  ${k}: ${v}`));
  log.info(`Строк обновлено: ${updated}, добавлено: ${added}`);
  log.info(`Таблица: ${client.url}`);
  log.info(`Готово за ${secs} c. Лог: ${log.logFile}`);
}

// Запуск только при прямом вызове (не при require).
if (require.main === module) {
  main().catch((err) => {
    log.error('Критическая ошибка:', err.stack || err.message);
    process.exit(1);
  });
}

module.exports = { processGame, STATUS };
