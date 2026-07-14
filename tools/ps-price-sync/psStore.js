'use strict';
/* ═══════════════════════════════════════════════════════════════
   МОДУЛЬ 2 + 3 — Поиск игры в официальном PlayStation Store (TR)
                   и извлечение цены.

   ВАЖНО: единственный источник данных — официальный домен
   store.playstation.com (локаль en-tr). Никаких сторонних сайтов.

   Как это работает надёжно без браузера:
     Страница поиска
       https://store.playstation.com/en-tr/search/<термин>
     отдаётся сервером уже с внедрённым состоянием Apollo
     (window.__APOLLO_STATE__ = { … }). В нём лежат объекты
     __typename:"Product" c полями name и price.basePrice
     («2.999,00 TL») — ровно в том виде, как показывает сайт.

     Это server-side-render официального стора, поэтому данные
     стабильны и не требуют Playwright / приватного GraphQL-хэша.
     Если Sony когда-нибудь уберёт SSR — см. README (fallback
     на Playwright описан там).
   ═══════════════════════════════════════════════════════════════ */

const config = require('./config');
const log = require('./logger');
const { parseTryToNumber, isFree } = require('./priceFormat');

/**
 * @typedef {Object} PsProduct
 * @property {string}      name       официальное название из PS Store
 * @property {string|null} priceStr   цена как на сайте («2.999,00 TL») или null
 * @property {number|null} priceNum   числовое значение цены
 * @property {boolean}     free        бесплатно
 * @property {boolean}     unavailable нет цены / недоступен
 * @property {string|null} url        ссылка на страницу товара
 */

/* ──────────────────────────────────────────────────────────────
   Сетевой запрос с таймаутом и повторными попытками.
   ────────────────────────────────────────────────────────────── */
async function fetchWithRetry(url) {
  const { retries, retryDelayMs, requestTimeoutMs, userAgent } = config.psStore;

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-TR,en;q=0.9,tr;q=0.8',
        },
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      log.warn(`Запрос не удался (попытка ${attempt}/${retries}): ${err.message} → ${url}`);
      if (attempt < retries) await sleep(retryDelayMs * attempt);
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ──────────────────────────────────────────────────────────────
   Извлечение объекта Apollo State из HTML методом
   балансировки фигурных скобок (учитывая строки и экранирование).
   ────────────────────────────────────────────────────────────── */
function extractApolloState(html) {
  // Ищем как window.__APOLLO_STATE__ = {…}, так и "apolloState":{…}.
  const markers = ['window.__APOLLO_STATE__', '__APOLLO_STATE__', 'apolloState'];
  let start = -1;
  for (const m of markers) {
    const idx = html.indexOf(m);
    if (idx !== -1) {
      start = html.indexOf('{', idx);
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === '\\') esc = true;
      else if (ch === '"') inStr = false;
    } else if (ch === '"') inStr = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const jsonStr = html.slice(start, i + 1);
        try {
          return JSON.parse(jsonStr);
        } catch (err) {
          log.error('Не удалось распарсить Apollo State:', err.message);
          return null;
        }
      }
    }
  }
  return null;
}

/* ──────────────────────────────────────────────────────────────
   Достаём цену из Product-записи (price может быть ссылкой __ref).
   ────────────────────────────────────────────────────────────── */
function resolvePrice(product, state) {
  let price = product.price;
  if (price && typeof price === 'object' && price.__ref) {
    price = state[price.__ref];
  }
  if (!price || typeof price !== 'object') return { priceStr: null };

  // Показываем ту цену, что видит покупатель: скидочная, если она есть,
  // иначе базовая. Обе — в исходном формате сайта («2.999,00 TL»).
  const priceStr =
    price.discountedPrice || price.basePrice || null;
  return { priceStr };
}

/* ──────────────────────────────────────────────────────────────
   Публичный метод: поиск игры по названию.
   Возвращает список найденных Product'ов (кандидатов на сопоставление).
   ────────────────────────────────────────────────────────────── */
async function searchGames(term) {
  const { baseUrl, locale } = config.psStore;
  const url = `${baseUrl}/${locale}/search/${encodeURIComponent(term)}`;

  const html = await fetchWithRetry(url);
  const state = extractApolloState(html);
  if (!state) {
    log.warn(`Apollo State не найден для запроса «${term}»`);
    return [];
  }

  /** @type {PsProduct[]} */
  const products = [];
  for (const [key, value] of Object.entries(state)) {
    if (!value || value.__typename !== 'Product') continue;

    const { priceStr } = resolvePrice(value, state);
    const free = isFree(priceStr);
    const priceNum = free ? 0 : parseTryToNumber(priceStr);
    const unavailable = !free && (priceStr === null || priceNum === null);

    products.push({
      name: (value.name || '').trim(),
      priceStr: free ? 'Ücretsiz' : priceStr,
      priceNum,
      free,
      unavailable,
      url: buildProductUrl(value, key, baseUrl, locale),
    });
  }

  log.debug(`Поиск «${term}» → кандидатов: ${products.length}`);
  return products;
}

/**
 * Собирает ссылку на страницу товара, если в записи есть id/npId.
 */
function buildProductUrl(product, key, baseUrl, locale) {
  const id = product.id || (key.includes(':') ? key.split(':')[1] : null);
  if (!id) return null;
  return `${baseUrl}/${locale}/product/${id}`;
}

module.exports = { searchGames, fetchWithRetry, extractApolloState };
