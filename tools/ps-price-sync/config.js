'use strict';
/* ═══════════════════════════════════════════════════════════════
   Конфигурация синхронизатора цен PS Store → Google Sheets.

   Все настройки читаются из переменных окружения (файл .env),
   чтобы секреты (ключ сервисного аккаунта Google) не попадали в код.
   ═══════════════════════════════════════════════════════════════ */

const path = require('node:path');

const config = {
  /* ── Официальный PlayStation Store (Турция) ────────────────── */
  psStore: {
    // Локаль турецкого стора. Источник цен — ТОЛЬКО этот домен.
    locale: 'en-tr',
    baseUrl: 'https://store.playstation.com',
    // Сколько результатов поиска разбирать при подборе издания.
    searchLimit: 24,
    // Повторные попытки сетевых запросов.
    retries: Number(process.env.PS_RETRIES ?? 3),
    retryDelayMs: Number(process.env.PS_RETRY_DELAY_MS ?? 1500),
    requestTimeoutMs: Number(process.env.PS_TIMEOUT_MS ?? 30000),
    // Пауза между играми, чтобы не долбить сайт (вежливый rate-limit).
    throttleMs: Number(process.env.PS_THROTTLE_MS ?? 800),
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/125.0 Safari/537.36',
  },

  /* ── Google Sheets ─────────────────────────────────────────── */
  sheets: {
    // Путь к JSON-ключу сервисного аккаунта Google (Service Account).
    credentialsPath:
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      path.join(__dirname, 'google-credentials.json'),
    // ID существующей таблицы. Если пусто — будет создана новая
    // и её ID сохранится в .sheet-id (см. sheets.js).
    spreadsheetId: process.env.GOOGLE_SHEET_ID || '',
    // Имя листа внутри книги.
    sheetTitle: process.env.GOOGLE_SHEET_TAB || 'Цены PS Store TR',
    // e-mail, которому дать доступ к новой таблице (ваш личный аккаунт).
    shareWithEmail: process.env.GOOGLE_SHARE_EMAIL || '',
    // Файл, куда кэшируется ID созданной таблицы.
    idCacheFile: path.join(__dirname, '.sheet-id'),
  },

  /* ── Подбор совпадений ─────────────────────────────────────── */
  matching: {
    // Минимальный score (0..1) для автосопоставления. Ниже — «Требуется проверка».
    minScore: Number(process.env.MATCH_MIN_SCORE ?? 0.55),
  },

  /* ── Логирование ───────────────────────────────────────────── */
  log: {
    dir: path.join(__dirname, 'logs'),
    level: process.env.LOG_LEVEL || 'info', // debug | info | warn | error
  },
};

module.exports = config;
