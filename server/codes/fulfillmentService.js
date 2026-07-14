'use strict';
/* ═══════════════════════════════════════════════════════════════
   СЕРВИС ВЫДАЧИ КОДОВ ПОПОЛНЕНИЯ ПОД ОПЛАЧЕННЫЙ ЗАКАЗ

   Оркестратор, связывающий воедино:
     • tryPriceService   — определяет стоимость заказа в лирах (TRY);
     • inventoryService  — остатки склада и атомарная выдача кодов;
     • combination       — оптимальный набор номиналов под сумму.

   Логика fulfill(order):
     0. Идемпотентность: если заказ уже доставлен (fulfillment='delivered')
        или уже помечен на ручную обработку — ничего не делаем.
     1. Определяем цену в лирах. Нет цены → ручная обработка.
     2. Смотрим остатки и подбираем комбинацию кодов.
        Не хватает склада / нет комбинации → ручная обработка.
     3. Атомарно выдаём коды (issueCodes в транзакции). Если кто-то
        успел разобрать склад (STOCK_RACE) → ручная обработка.
     4. Записываем в заказ: price_try, codes_json, codes_sum,
        fulfillment='delivered', delivered_at.

   Ошибки внутри выдачи никогда не «роняют» процесс оплаты —
   в худшем случае заказ уходит в ручную обработку.
   ═══════════════════════════════════════════════════════════════ */

const { get, run } = require('../db');
const log = require('./logger');
const { getTryPrice } = require('./tryPriceService');
const { getAvailableCounts, issueCodes } = require('./inventoryService');
const { findBestCombination } = require('./combination');

/** Помечает заказ на ручную обработку с указанием причины. */
function markManual(orderId, reason, priceTry) {
  run(
    `UPDATE orders
        SET fulfillment='manual',
            price_try=COALESCE(NULLIF(?,0), price_try),
            updated_at=datetime('now')
      WHERE id=?`,
    [Number(priceTry) || 0, orderId]
  );
  log.warn(`Заказ ${orderId} → ручная обработка (${reason})`);
  return { ok: false, fulfillment: 'manual', reason };
}

/**
 * Выдаёт коды под оплаченный заказ.
 * @param {object} order  результат shapeOrder (уже оплаченный)
 * @returns {Promise<{ok:boolean, fulfillment:string, codes?:Array, sum?:number, reason?:string}>}
 */
async function fulfill(order) {
  if (!order || !order.id) return { ok: false, fulfillment: '', reason: 'NO_ORDER' };

  // 0. Идемпотентность — не выдаём повторно.
  if (order.fulfillment === 'delivered') {
    return { ok: true, fulfillment: 'delivered', codes: order.codes, sum: order.codesSum, reason: 'ALREADY_DELIVERED' };
  }
  if (order.fulfillment === 'manual') {
    return { ok: false, fulfillment: 'manual', reason: 'ALREADY_MANUAL' };
  }

  // 1. Стоимость в лирах.
  let priceTry;
  try {
    priceTry = await getTryPrice({
      productId: order.productId,
      productName: order.productName,
      priceTry: order.priceTry,
    });
  } catch (err) {
    log.error(`getTryPrice упал для заказа ${order.id}:`, err);
    return markManual(order.id, 'PRICE_ERROR', 0);
  }
  if (!priceTry || priceTry <= 0) {
    return markManual(order.id, 'NO_TRY_PRICE', 0);
  }

  // 2. Подбор комбинации по реальным остаткам.
  const stock = getAvailableCounts();
  const combo = findBestCombination(priceTry, stock);
  if (!combo.ok) {
    return markManual(order.id, combo.reason || 'NO_COMBINATION', priceTry);
  }

  // 3. Атомарная выдача.
  let issued;
  try {
    issued = issueCodes(order.id, order.userId || '', combo.items);
  } catch (err) {
    // STOCK_RACE или иная ошибка транзакции — уводим в ручную обработку.
    return markManual(order.id, err.code || 'ISSUE_ERROR', priceTry);
  }
  if (!issued || !issued.ok) {
    return markManual(order.id, 'ISSUE_FAILED', priceTry);
  }

  // 4. Фиксируем результат в заказе.
  const codesJson = JSON.stringify(issued.codes);
  run(
    `UPDATE orders
        SET price_try=?, codes_json=?, codes_sum=?,
            fulfillment='delivered', delivered_at=datetime('now'),
            updated_at=datetime('now')
      WHERE id=?`,
    [priceTry, codesJson, combo.sum, order.id]
  );
  log.info(
    `Заказ ${order.id}: выдано ${issued.codes.length} код(ов) на ${combo.sum} TRY ` +
    `(цена ${priceTry}, переплата ${combo.overpay})`
  );

  return { ok: true, fulfillment: 'delivered', codes: issued.codes, sum: combo.sum };
}

module.exports = { fulfill };
