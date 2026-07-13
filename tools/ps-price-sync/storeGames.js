'use strict';
/* ═══════════════════════════════════════════════════════════════
   МОДУЛЬ 1 — Получение списка игр из моего магазина.

   Источник — та же SQLite-база, что использует сам магазин
   (server/data/logovo.sqlite). Читаем её через штатный слой
   данных проекта (server/db.js), чтобы гарантировать идентичный
   доступ и не дублировать логику подключения.

   Возвращаем только товары type='game'. Цена в рублях (price)
   берётся как есть и НЕ пересчитывается.
   ═══════════════════════════════════════════════════════════════ */

const path = require('node:path');
const log = require('./logger');

// Слой данных магазина (SQLite). Требует Node >= 22.5 (node:sqlite),
// как и весь проект relok-store.
const { all } = require(path.join(__dirname, '..', '..', 'server', 'db'));

/**
 * @typedef {Object} StoreGame
 * @property {number} id        уникальный ID товара (ключ для upsert)
 * @property {string} name      название в магазине
 * @property {string} edition   издание (Standard / Deluxe / Ultimate…)
 * @property {string} platform  платформа (PS5 / PS4/PS5…)
 * @property {number} priceRub  цена в рублях (не менять!)
 * @property {number} priceTry  ранее сохранённая TRY-цена (справочно)
 */

/**
 * Возвращает все игры магазина.
 * @param {{ includeHidden?: boolean }} [opts]
 * @returns {StoreGame[]}
 */
function getStoreGames(opts = {}) {
  const includeHidden = opts.includeHidden ?? true;

  const rows = all(
    `SELECT id, name, edition, platform, price, price_try
       FROM products
      WHERE type = 'game'
        ${includeHidden ? '' : 'AND hidden = 0'}
      ORDER BY id ASC`
  );

  const games = rows.map((r) => ({
    id: r.id,
    name: (r.name || '').trim(),
    edition: (r.edition || '').trim(),
    platform: (r.platform || '').trim(),
    priceRub: r.price || 0,
    priceTry: r.price_try || 0,
  }));

  log.info(`Из магазина получено игр: ${games.length}`);
  return games;
}

module.exports = { getStoreGames };
