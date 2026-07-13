'use strict';
/* ═══════════════════════════════════════════════════════════════
   СЕРВИС УПРАВЛЕНИЯ СКЛАДОМ КОДОВ

   Хранилище: таблица topup_codes. Отвечает за:
     • добавление кодов (по одному / массово);
     • удаление свободных кодов;
     • подсчёт остатков по номиналам и статусам;
     • поиск / фильтрацию (для админки);
     • АТОМАРНОЕ резервирование и продажу кодов под заказ.

   Атомарность: все операции выдачи выполняются внутри db.tx()
   (BEGIN/COMMIT). Node + node:sqlite синхронны, поэтому вся
   транзакция проходит без переключений — двойная выдача одного
   кода при одновременных покупках исключена.
   ═══════════════════════════════════════════════════════════════ */

const { all, get, run, tx } = require('../db');
const { DENOMINATIONS, isValidDenom } = require('./denominations');

/* ── Остатки ─────────────────────────────────────────────────── */

/** Остатки СВОБОДНЫХ кодов по каждому номиналу: { 250: 41, 500: 15, ... } */
function getAvailableCounts() {
  const rows = all(
    "SELECT denom, COUNT(*) AS c FROM topup_codes WHERE status='available' GROUP BY denom"
  );
  const map = {};
  DENOMINATIONS.forEach((d) => (map[d] = 0));
  rows.forEach((r) => { map[r.denom] = r.c; });
  return map;
}

/** Полная сводка для админки: по номиналам — available / reserved / sold. */
function getStockSummary() {
  const rows = all(
    `SELECT denom, status, COUNT(*) AS c
       FROM topup_codes GROUP BY denom, status`
  );
  const map = {};
  DENOMINATIONS.forEach((d) => (map[d] = { available: 0, reserved: 0, sold: 0, total: 0 }));
  rows.forEach((r) => {
    if (!map[r.denom]) map[r.denom] = { available: 0, reserved: 0, sold: 0, total: 0 };
    map[r.denom][r.status] = r.c;
    map[r.denom].total += r.c;
  });
  return map;
}

/* ── Добавление ──────────────────────────────────────────────── */

/**
 * Массовое добавление кодов одного номинала.
 * Дубликаты (по UNIQUE code) молча пропускаются.
 * @param {number} denom
 * @param {string[]} codes
 * @returns {{added:number, duplicates:number, invalid:number}}
 */
function addCodes(denom, codes) {
  denom = Number(denom);
  if (!isValidDenom(denom)) throw new Error(`Недопустимый номинал: ${denom}`);

  const list = (Array.isArray(codes) ? codes : String(codes).split(/\r?\n/))
    .map((c) => String(c).trim())
    .filter(Boolean);

  let added = 0, duplicates = 0;
  tx(() => {
    const stmt = 'INSERT OR IGNORE INTO topup_codes (denom, code, status) VALUES (?,?,\'available\')';
    for (const code of list) {
      const res = run(stmt, [denom, code]);
      if (res.changes > 0) added++; else duplicates++;
    }
  });
  return { added, duplicates, invalid: 0 };
}

/**
 * Массовая загрузка разных номиналов из строк формата «denom;code» или «denom,code».
 * @param {string} text
 */
function bulkAddFromText(text) {
  const lines = String(text).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const byDenom = {};
  let invalid = 0;
  for (const line of lines) {
    const m = line.split(/[;,\t]/).map((x) => x.trim());
    const denom = Number(m[0]);
    const code = m[1];
    if (!isValidDenom(denom) || !code) { invalid++; continue; }
    (byDenom[denom] = byDenom[denom] || []).push(code);
  }
  let added = 0, duplicates = 0;
  for (const [denom, codes] of Object.entries(byDenom)) {
    const r = addCodes(Number(denom), codes);
    added += r.added; duplicates += r.duplicates;
  }
  return { added, duplicates, invalid };
}

/* ── Удаление / поиск ────────────────────────────────────────── */

/** Удаляет код, только если он ещё не выдан (available). */
function deleteCode(id) {
  const res = run(
    "DELETE FROM topup_codes WHERE id=? AND status='available'",
    [Number(id)]
  );
  return res.changes > 0;
}

/**
 * Список кодов с фильтрами (для админки).
 * @param {{denom?:number, status?:string, q?:string, limit?:number, offset?:number}} f
 */
function listCodes(f = {}) {
  const where = [];
  const params = [];
  if (f.denom && isValidDenom(+f.denom)) { where.push('denom=?'); params.push(+f.denom); }
  if (f.status && ['available', 'reserved', 'sold'].includes(f.status)) {
    where.push('status=?'); params.push(f.status);
  }
  if (f.q) { where.push('(code LIKE ? OR order_id LIKE ?)'); params.push(`%${f.q}%`, `%${f.q}%`); }
  const clause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const limit = Math.min(Number(f.limit) || 100, 500);
  const offset = Number(f.offset) || 0;

  const items = all(
    `SELECT id, denom, code, status, order_id, user_id, uploaded_at, reserved_at, sold_at
       FROM topup_codes ${clause}
      ORDER BY denom ASC, id DESC
      LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  const total = get(`SELECT COUNT(*) AS c FROM topup_codes ${clause}`, params).c;
  return { items, total, limit, offset };
}

/* ── АТОМАРНАЯ выдача под заказ ───────────────────────────────── */

/**
 * Резервирует и продаёт коды под заказ атомарно.
 *
 * @param {string} orderId
 * @param {string} userId
 * @param {Array<{denom:number, qty:number}>} items  разбивка из combination.js
 * @returns {{ok:boolean, codes?:Array<{denom:number, code:string}>, reason?:string}}
 */
function issueCodes(orderId, userId, items) {
  return tx(() => {
    const issued = [];
    for (const { denom, qty } of items) {
      // Берём ровно qty свободных кодов этого номинала (детерминированно — по id).
      const rows = all(
        "SELECT id, code FROM topup_codes WHERE denom=? AND status='available' ORDER BY id ASC LIMIT ?",
        [denom, qty]
      );
      if (rows.length < qty) {
        // Кто-то успел забрать — откатываем всю транзакцию.
        throw Object.assign(new Error('STOCK_RACE'), { code: 'STOCK_RACE', denom });
      }
      for (const row of rows) {
        // reserved → сразу sold в рамках одной транзакции (оплата подтверждена).
        run(
          `UPDATE topup_codes
              SET status='sold', order_id=?, user_id=?,
                  reserved_at=datetime('now'), sold_at=datetime('now')
            WHERE id=? AND status='available'`,
          [orderId, userId, row.id]
        );
        issued.push({ denom, code: row.code });
      }
    }
    return { ok: true, codes: issued };
  });
}

/** Освобождает коды заказа обратно в склад (например, при отмене/возврате). */
function releaseOrderCodes(orderId) {
  const res = run(
    `UPDATE topup_codes
        SET status='available', order_id='', user_id='', reserved_at=NULL, sold_at=NULL
      WHERE order_id=? AND status IN ('reserved','sold')`,
    [orderId]
  );
  return res.changes;
}

module.exports = {
  getAvailableCounts,
  getStockSummary,
  addCodes,
  bulkAddFromText,
  deleteCode,
  listCodes,
  issueCodes,
  releaseOrderCodes,
};
