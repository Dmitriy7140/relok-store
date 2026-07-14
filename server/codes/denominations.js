'use strict';
/* ═══════════════════════════════════════════════════════════════
   Доступные номиналы кодов пополнения PlayStation Turkey.
   Система работает ТОЛЬКО с этими значениями (TRY).
   Других номиналов не существует.
   ═══════════════════════════════════════════════════════════════ */

const DENOMINATIONS = [250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000];

const DENOM_SET = new Set(DENOMINATIONS);
const MAX_DENOM = Math.max(...DENOMINATIONS);

/** Проверяет, что номинал допустим. */
function isValidDenom(n) {
  return DENOM_SET.has(Number(n));
}

module.exports = { DENOMINATIONS, DENOM_SET, MAX_DENOM, isValidDenom };
