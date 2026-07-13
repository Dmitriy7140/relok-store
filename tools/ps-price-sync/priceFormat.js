'use strict';
/* ═══════════════════════════════════════════════════════════════
   Работа с форматом турецких цен.

   PlayStation Store TR отображает цены как «2.999,00 TL»:
     • точка  — разделитель тысяч;
     • запятая — десятичный разделитель;
     • суффикс — « TL».

   Мы храним цену РОВНО в том виде, как её отдаёт сайт (строкой),
   а числовое значение вычисляем отдельно — для сортировки/расчётов.
   ═══════════════════════════════════════════════════════════════ */

/**
 * Превращает строку цены PS Store («2.999,00 TL») в число (2999.0).
 * @param {string} priceStr
 * @returns {number|null} число или null, если распарсить нельзя
 */
function parseTryToNumber(priceStr) {
  if (!priceStr || typeof priceStr !== 'string') return null;
  // Оставляем только цифры, точки и запятые.
  const cleaned = priceStr.replace(/[^\d.,]/g, '');
  if (!cleaned) return null;
  // Турецкий формат: точки убираем (тысячи), запятую → точка (дробь).
  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}

/**
 * Форматирует число обратно в турецкий вид «2.999,00 TL».
 * Используется как запасной вариант, если сайт вернул только число.
 * @param {number} num
 * @returns {string}
 */
function formatTry(num) {
  if (!Number.isFinite(num)) return '';
  const formatted = new Intl.NumberFormat('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${formatted} TL`;
}

/**
 * Является ли цена «бесплатной».
 * @param {string} priceStr
 */
function isFree(priceStr) {
  if (!priceStr) return false;
  const s = priceStr.trim().toLowerCase();
  return s === 'free' || s === 'ücretsiz' || s === '0,00 tl';
}

module.exports = { parseTryToNumber, formatTry, isFree };
