'use strict';
/* ═══════════════════════════════════════════════════════════════
   СЕРВИС ПОИСКА СТОИМОСТИ ТОВАРА В ЛИРАХ (TRY)

   Именно цена в лирах — основа для подбора кодов пополнения.

   Порядок источников (первый успешный побеждает):
     1. Google Sheets (наша таблица цен) — по названию товара.
        Кэшируется на несколько минут, чтобы не дёргать API на
        каждый заказ.
     2. Поле price_try в локальной БД (по id, затем по названию).

   Такой fallback гарантирует работу даже если Google не настроен
   или таблица временно недоступна.
   ═══════════════════════════════════════════════════════════════ */

const { get } = require('../db');
const log = require('./logger');

const SHEET_TTL_MS = Number(process.env.TRY_SHEET_TTL_MS ?? 5 * 60 * 1000);

let _sheetCache = { at: 0, map: null };

/** Нормализация названия для сопоставления. */
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[™®©]/g, ' ')
    .replace(/[:\-–—_,.!?'’"()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** «2.999,00 TL» → 2999 (турецкий формат). */
function parseTry(str) {
  if (str == null) return null;
  if (typeof str === 'number') return str;
  const cleaned = String(str).replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  const n = Number(cleaned.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/* ── Источник 1: Google Sheets ───────────────────────────────── */

/**
 * Загружает карту { нормализованное_название → цена_TRY } из Google Sheets.
 * Возвращает null, если Google не настроен или произошла ошибка.
 */
async function loadSheetMap() {
  const now = Date.now();
  if (_sheetCache.map && now - _sheetCache.at < SHEET_TTL_MS) return _sheetCache.map;

  const sheetId = process.env.GOOGLE_SHEET_ID;
  const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const tab = process.env.GOOGLE_SHEET_TAB || 'Цены PS Store TR';
  if (!sheetId || !credPath) return null; // Google не настроен — молча уходим в fallback

  try {
    // googleapis подключаем лениво: если пакет не установлен — работает fallback.
    const { google } = require('googleapis');
    const auth = new google.auth.GoogleAuth({
      keyFile: credPath,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });
    const sheets = google.sheets({ version: 'v4', auth: await auth.getClient() });
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: `'${tab}'!A2:F`,
    });
    const rows = res.data.values || [];
    const map = new Map();
    // Колонки: B(1)=Название, E(4)=Цена TRY  (см. tools/ps-price-sync/sheets.js)
    for (const r of rows) {
      const name = norm(r[1]);
      const tryNum = parseTry(r[4]);
      if (name && tryNum) map.set(name, tryNum);
    }
    _sheetCache = { at: now, map };
    log.info(`Google Sheets: загружено цен ${map.size}`);
    return map;
  } catch (err) {
    log.warn('Google Sheets недоступен, fallback на БД:', err.message);
    return null;
  }
}

/* ── Источник 2: локальная БД ────────────────────────────────── */

function dbTryByProductId(productId) {
  if (!productId) return null;
  const r = get('SELECT price_try FROM products WHERE id=?', [productId]);
  return r && r.price_try ? Number(r.price_try) : null;
}

function dbTryByName(name) {
  if (!name) return null;
  const r = get('SELECT price_try FROM products WHERE name=? COLLATE NOCASE', [name]);
  return r && r.price_try ? Number(r.price_try) : null;
}

/* ── Публичный метод ─────────────────────────────────────────── */

/**
 * Возвращает стоимость товара в лирах или null, если определить нельзя.
 * @param {{productId?:number, productName?:string, priceTry?:number}} order
 * @returns {Promise<number|null>}
 */
async function getTryPrice(order) {
  // 0. Если в заказе уже зафиксирована цена в лирах — используем её.
  if (order.priceTry && order.priceTry > 0) return Number(order.priceTry);

  const name = order.productName || '';

  // 1. Google Sheets по названию.
  const sheetMap = await loadSheetMap();
  if (sheetMap) {
    const hit = sheetMap.get(norm(name));
    if (hit) return hit;
  }

  // 2. Локальная БД: по id, затем по названию.
  return dbTryByProductId(order.productId) ?? dbTryByName(name);
}

module.exports = { getTryPrice, parseTry, _norm: norm };
