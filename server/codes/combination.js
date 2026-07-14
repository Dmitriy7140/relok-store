'use strict';
/* ═══════════════════════════════════════════════════════════════
   СЕРВИС ПОДБОРА ОПТИМАЛЬНОЙ КОМБИНАЦИИ КОДОВ

   Задача: подобрать набор кодов пополнения, сумма которых ПОКРЫВАЕТ
   стоимость заказа в лирах, максимально близко «вверх».

   Критерии (в порядке приоритета):
     1. сумма кодов ≥ стоимость заказа  (обязательное условие);
     2. минимальная переплата (sum − target);
     3. при равной переплате — меньшее количество кодов;
     4. при равенстве — меньший расход РЕДКИХ номиналов
        (номинал тем «дороже» тратить, чем меньше его на складе).

   Это НЕ жадный алгоритм. Используется ограниченный рюкзак
   (bounded knapsack) через динамическое программирование по сумме
   с восстановлением ответа. Учитываются реальные остатки склада.

   Доказательство границы перебора:
     Пусть S* — минимальная достижимая сумма ≥ target, а c — самый
     крупный код в оптимальном наборе. Если убрать c, оставшаяся
     сумма < target (иначе набор не минимален), значит S* < target + c
     ≤ target + MAX_DENOM. Поэтому перебор сумм до target + MAX_DENOM
     гарантированно содержит оптимум.
   ═══════════════════════════════════════════════════════════════ */

const { DENOMINATIONS, MAX_DENOM } = require('./denominations');

/**
 * @typedef {Object} ComboResult
 * @property {boolean} ok           найдена ли комбинация
 * @property {number}  sum          суммарный номинал выданных кодов
 * @property {number}  overpay      переплата (sum − target)
 * @property {number}  count        количество кодов
 * @property {Array<{denom:number, qty:number}>} items  разбивка по номиналам
 * @property {string} [reason]      причина, если ok=false
 */

/**
 * Подбирает оптимальную комбинацию кодов.
 *
 * @param {number} target   стоимость заказа в TRY (число > 0)
 * @param {Object<number,number>} stock  остатки: { номинал: количество }
 * @returns {ComboResult}
 */
function findBestCombination(target, stock) {
  target = Math.ceil(Number(target) || 0);
  if (target <= 0) {
    return { ok: false, reason: 'INVALID_TARGET', sum: 0, overpay: 0, count: 0, items: [] };
  }

  // Оставляем только допустимые номиналы с положительным остатком.
  const denoms = DENOMINATIONS.filter((d) => (stock[d] || 0) > 0);
  const counts = denoms.map((d) => stock[d]);

  // Совокупная стоимость всего склада — если её не хватает, комбинации нет.
  const totalValue = denoms.reduce((s, d, i) => s + d * counts[i], 0);
  if (totalValue < target) {
    return { ok: false, reason: 'INSUFFICIENT_STOCK', sum: 0, overpay: 0, count: 0, items: [] };
  }

  // «Вес редкости» номинала: чем меньше остаток, тем дороже его тратить.
  const rarityWeight = {};
  denoms.forEach((d, i) => { rarityWeight[d] = 1 / counts[i]; });

  // Верхняя граница перебора сумм (см. доказательство выше).
  const CAP = target + MAX_DENOM;

  // dpPrev[s] — лучший способ (по количеству, затем редкости) набрать РОВНО s
  // из уже рассмотренных номиналов. null — сумма недостижима.
  let dpPrev = new Array(CAP + 1).fill(null);
  dpPrev[0] = { count: 0, rarity: 0 };

  // Послойное восстановление: layers[i][s] = сколько кодов номинала denoms[i]
  // использовано при оптимальном наборе суммы s на слое i.
  const layers = [];

  for (let i = 0; i < denoms.length; i++) {
    const d = denoms[i];
    const nMax = counts[i];
    const w = rarityWeight[d];
    const dpCur = new Array(CAP + 1).fill(null);
    const chosenK = new Array(CAP + 1).fill(0);

    for (let s = 0; s <= CAP; s++) {
      let best = null;      // { count, rarity }
      let bestK = 0;
      // Пробуем взять k копий номинала d (0..nMax), не превышая сумму s.
      for (let k = 0; k <= nMax && k * d <= s; k++) {
        const base = dpPrev[s - k * d];
        if (!base) continue;
        const cand = { count: base.count + k, rarity: base.rarity + k * w };
        if (isBetterAtSum(cand, best)) { best = cand; bestK = k; }
      }
      dpCur[s] = best;
      chosenK[s] = bestK;
    }

    layers.push(chosenK);
    dpPrev = dpCur;
  }

  // Выбираем итоговую сумму: минимальная переплата → количество → редкость.
  let bestSum = -1;
  let bestState = null;
  for (let s = target; s <= CAP; s++) {
    const st = dpPrev[s];
    if (!st) continue;
    if (bestSum === -1 || isBetterFinal(s - target, st, bestSum - target, bestState)) {
      bestSum = s;
      bestState = st;
    }
  }

  if (bestSum === -1) {
    // Теоретически недостижимо (totalValue ≥ target проверен), но на всякий случай.
    return { ok: false, reason: 'NO_COMBINATION', sum: 0, overpay: 0, count: 0, items: [] };
  }

  // Восстанавливаем разбивку по номиналам, идя по слоям в обратном порядке.
  const qtyByDenom = {};
  let s = bestSum;
  for (let i = denoms.length - 1; i >= 0; i--) {
    const k = layers[i][s];
    if (k > 0) qtyByDenom[denoms[i]] = k;
    s -= k * denoms[i];
  }

  const items = Object.keys(qtyByDenom)
    .map(Number)
    .sort((a, b) => b - a)
    .map((denom) => ({ denom, qty: qtyByDenom[denom] }));

  return {
    ok: true,
    sum: bestSum,
    overpay: bestSum - target,
    count: bestState.count,
    items,
  };
}

/** Сравнение двух наборов для ОДНОЙ и той же суммы: меньше кодов, затем меньше редкости. */
function isBetterAtSum(cand, best) {
  if (!best) return true;
  if (cand.count !== best.count) return cand.count < best.count;
  return cand.rarity < best.rarity - 1e-12;
}

/** Итоговое сравнение: переплата → количество → редкость. */
function isBetterFinal(overpayA, stateA, overpayB, stateB) {
  if (overpayA !== overpayB) return overpayA < overpayB;
  if (stateA.count !== stateB.count) return stateA.count < stateB.count;
  return stateA.rarity < stateB.rarity - 1e-12;
}

module.exports = { findBestCombination };
