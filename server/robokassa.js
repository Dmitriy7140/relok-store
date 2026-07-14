'use strict';
/* ═══════════════════════════════════════════════════════════════
   Robokassa — платёжный клиент на встроенном node:https (без npm).

   В отличие от ЮKassa у Robokassa НЕТ серверного «создать платёж»:
   платёж — это редирект пользователя на форму с подписью (Пароль#1),
   а статус узнаём ПОЛЛИНГОМ через веб-сервис OpStateExt (Пароль#2).
   Вебхук (ResultURL) здесь НЕ используется — сознательно, ради простоты.

   Интерфейс совместим с payment.js (ЮKassa):
     • createPayment(order)  → { id: InvId, confirmationUrl, status:'pending' }
     • getPayment(invId)     → { status:'succeeded'|'canceled'|'pending', paid }
     • isConfigured()

   Подпись создания:
     hash(MerchantLogin:OutSum:InvId[:Receipt(сырой JSON)]:Пароль#1[:Shp_* по алфавиту])
   Подпись OpState:
     hash(MerchantLogin:InvId:Пароль#2)
   Алгоритм хеша (md5/sha256/…) должен совпадать с настройкой в ЛК Robokassa.

   Документация: https://docs.robokassa.ru/
   ═══════════════════════════════════════════════════════════════ */
const https  = require('node:https');
const crypto = require('node:crypto');
const { allocRobokassaInvId } = require('./db');

/* ── Конфигурация: приоритет env, иначе payment-config.js ── */
function loadCfg() {
  let cfg = {};
  try { cfg = require('./payment-config'); } catch { /* файла может не быть на проде */ }
  return {
    LOGIN:      process.env.ROBOKASSA_MERCHANT_LOGIN || cfg.ROBOKASSA_MERCHANT_LOGIN || '',
    PASSWORD1:  process.env.ROBOKASSA_PASSWORD1      || cfg.ROBOKASSA_PASSWORD1      || '',
    PASSWORD2:  process.env.ROBOKASSA_PASSWORD2      || cfg.ROBOKASSA_PASSWORD2      || '',
    ALGO:      (process.env.ROBOKASSA_HASH_ALGO      || cfg.ROBOKASSA_HASH_ALGO      || 'md5').toLowerCase(),
    IS_TEST:    /^(1|true|yes)$/i.test(String(process.env.ROBOKASSA_IS_TEST ?? cfg.ROBOKASSA_IS_TEST ?? '')),
    CULTURE:    process.env.ROBOKASSA_CULTURE        || cfg.ROBOKASSA_CULTURE        || 'ru',
    PAY_URL:    process.env.ROBOKASSA_PAYMENT_URL    || cfg.ROBOKASSA_PAYMENT_URL    || 'https://auth.robokassa.ru/Merchant/Index.aspx',
    // Фискализация (54-ФЗ). Включается, только если в ЛК настроена фискализация.
    FISCAL:     /^(1|true|yes)$/i.test(String(process.env.ROBOKASSA_FISCAL ?? cfg.ROBOKASSA_FISCAL ?? '')),
    SNO:            process.env.ROBOKASSA_SNO            || cfg.ROBOKASSA_SNO            || '',
    TAX:            process.env.ROBOKASSA_TAX            || cfg.ROBOKASSA_TAX            || 'none',
    PAYMENT_METHOD: process.env.ROBOKASSA_PAYMENT_METHOD || cfg.ROBOKASSA_PAYMENT_METHOD || 'full_payment',
    PAYMENT_OBJECT: process.env.ROBOKASSA_PAYMENT_OBJECT || cfg.ROBOKASSA_PAYMENT_OBJECT || 'service',
    EMAIL:          process.env.ROBOKASSA_EMAIL          || cfg.ROBOKASSA_EMAIL          || '',
  };
}

const C = loadCfg();
const CONFIGURED = Boolean(C.LOGIN && C.PASSWORD1 && C.PASSWORD2);

const _ALGOS = { md5: 'md5', sha1: 'sha1', sha256: 'sha256', sha384: 'sha384', sha512: 'sha512' };

/** Хеш строки подписи выбранным алгоритмом (hex, нижний регистр). */
function hashSignature(data) {
  const algo = _ALGOS[C.ALGO] || 'md5';
  return crypto.createHash(algo).update(data, 'utf8').digest('hex');
}

/** OutSum строкой с двумя знаками — одно значение идёт и в подпись, и в URL. */
function formatSum(amountRub) {
  return (Math.round(Number(amountRub) || 0)).toFixed(2);
}

/**
 * Фискальный чек (54-ФЗ) для Receipt — компактный JSON (separators без пробелов),
 * чтобы одна и та же строка шла в подпись и в URL без неоднозначности url-encode.
 */
function buildReceipt(order) {
  const item = {
    name: String(order.productName || 'Цифровой информационный материал').slice(0, 128),
    quantity: 1,
    sum: Number(formatSum(order.amount)),
    payment_method: C.PAYMENT_METHOD,
    payment_object: C.PAYMENT_OBJECT,
    tax: C.TAX,
  };
  const receipt = C.SNO ? { sno: C.SNO, items: [item] } : { items: [item] };
  return JSON.stringify(receipt);
}

/**
 * Создаёт платёж: выделяет числовой InvId и строит ссылку на форму Robokassa.
 * Сетевого запроса нет. Интерфейс совместим с payment.js.
 * @returns {Promise<{id:number, confirmationUrl:string, status:string}>}
 */
async function createPayment(order /*, returnUrl, receiptEmail — Success/Fail URL берутся из ЛК */) {
  if (!CONFIGURED) throw new Error('Robokassa не настроена (нет логина / паролей)');

  // Числовой InvId ↔ строковый order.id (Robokassa требует целое число).
  const invId  = allocRobokassaInvId(order.id, formatSum(order.amount));
  const outSum = formatSum(order.amount);

  // Пользовательский параметр для трассировки (вернётся в ResultURL, войдёт в подпись).
  const shp = { Shp_order: String(order.id) };
  const shpSuffix = Object.keys(shp).sort().map((k) => `:${k}=${shp[k]}`).join('');

  // Receipt при фискализации: в ПОДПИСЬ идёт сырой JSON, в URL — он же url-encoded.
  let receiptJson = '';
  let receiptEnc  = '';
  if (C.FISCAL) {
    receiptJson = buildReceipt(order);
    receiptEnc  = encodeURIComponent(receiptJson);
  }

  // hash(MerchantLogin:OutSum:InvId[:Receipt]:Пароль#1[:Shp_*])
  const parts = [C.LOGIN, outSum, String(invId)];
  if (receiptJson) parts.push(receiptJson);
  parts.push(C.PASSWORD1);
  const signature = hashSignature(parts.join(':') + shpSuffix);

  const params = {
    MerchantLogin: C.LOGIN,
    OutSum: outSum,
    InvId: String(invId),
    Description: `Заказ ${order.id}`.slice(0, 100),
    SignatureValue: signature,
    Culture: C.CULTURE,
    Encoding: 'utf-8',
    ...shp,
  };
  if (C.IS_TEST) params.IsTest = '1';
  if (C.EMAIL)   params.Email  = C.EMAIL;

  let query = Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
    .join('&');
  if (receiptEnc) query += `&Receipt=${receiptEnc}`; // уже percent-encoded, повторно не кодируем

  return {
    id: invId,
    confirmationUrl: `${C.PAY_URL}?${query}`,
    status: 'pending',
  };
}

/* ── Поллинг статуса через OpStateExt ──────────────────────────── */
const OPSTATE_URL =
  'https://auth.robokassa.ru/Merchant/WebService/Service.asmx/OpStateExt';

function httpGet(url) {
  return new Promise((resolve, reject) => {
    const reqObj = https.get(url, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => resolve(raw));
    });
    reqObj.on('error', reject);
    reqObj.setTimeout(15000, () => reqObj.destroy(new Error('Таймаут запроса к Robokassa')));
  });
}

/** Достаёт <Code> из именованного блока (<Result>/<State>) XML-ответа. */
function extractCode(xml, block) {
  const m = new RegExp(`<${block}\\b[^>]*>[\\s\\S]*?<Code>(\\d+)</Code>`, 'i').exec(xml);
  return m ? Number(m[1]) : null;
}

/**
 * Проверяет статус счёта поллингом. Возвращает объект в форме, совместимой
 * с ЮKassa-веткой syncOrderPayment: { status, paid }.
 *
 * Коды State Robokassa: 100 — оплачено; 10 — отменён; 5/50/80 — в процессе.
 * Result/Code != 0 (например, счёт ещё не создан, т.к. клиент не начал оплату) → pending.
 */
async function getPayment(invId) {
  if (!CONFIGURED) throw new Error('Robokassa не настроена');
  const signature = hashSignature(`${C.LOGIN}:${invId}:${C.PASSWORD2}`);
  const url =
    `${OPSTATE_URL}?MerchantLogin=${encodeURIComponent(C.LOGIN)}` +
    `&InvoiceID=${encodeURIComponent(String(invId))}` +
    `&Signature=${encodeURIComponent(signature)}`;

  const xml = await httpGet(url);
  const resultCode = extractCode(xml, 'Result');
  if (resultCode !== 0) {
    // Счёт ещё не существует / не оплачивался — это норма до первой оплаты.
    return { status: 'pending', paid: false, stateCode: null, resultCode };
  }
  const stateCode = extractCode(xml, 'State');
  if (stateCode === 100) return { status: 'succeeded', paid: true,  stateCode };
  if (stateCode === 10)  return { status: 'canceled',  paid: false, stateCode };
  return { status: 'pending', paid: false, stateCode };
}

module.exports = {
  createPayment,
  getPayment,
  isConfigured: () => CONFIGURED,
  // экспортируем для возможного ResultURL-эндпоинта в будущем
  hashSignature,
  formatSum,
};
