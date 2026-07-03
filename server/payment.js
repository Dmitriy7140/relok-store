'use strict';
/* ═══════════════════════════════════════════════════════════════
   ЮKassa — платёжный клиент на встроенном node:https (без npm).

   Документация: https://yookassa.ru/developers/api
   • Создание платежа:  POST /v3/payments  (Basic auth shopId:secretKey)
   • Проверка платежа:  GET  /v3/payments/{id}
   • Авторизация:       Authorization: Basic base64(shopId:secretKey)
   • Идемпотентность:   заголовок Idempotence-Key на запись
   ═══════════════════════════════════════════════════════════════ */
const https = require('node:https');
const crypto = require('node:crypto');

/* ── Креды: приоритет у переменных окружения, иначе payment-config.js ── */
function loadCreds() {
  let cfg = {};
  try { cfg = require('./payment-config'); } catch { /* файла может не быть на проде */ }
  const SHOP_ID    = process.env.YOOKASSA_SHOP_ID    || cfg.SHOP_ID    || '';
  const SECRET_KEY = process.env.YOOKASSA_SECRET_KEY || cfg.SECRET_KEY || '';
  return { SHOP_ID, SECRET_KEY };
}

const { SHOP_ID, SECRET_KEY } = loadCreds();
const CONFIGURED = Boolean(SHOP_ID && SECRET_KEY);

function authHeader() {
  return 'Basic ' + Buffer.from(`${SHOP_ID}:${SECRET_KEY}`).toString('base64');
}

/* ── Низкоуровневый запрос к API ЮKassa ── */
function request(method, path, body, idempotenceKey) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const headers = {
      'Authorization': authHeader(),
      'Content-Type': 'application/json',
    };
    if (payload) headers['Content-Length'] = Buffer.byteLength(payload);
    if (idempotenceKey) headers['Idempotence-Key'] = idempotenceKey;

    const reqObj = https.request(
      { hostname: 'api.yookassa.ru', port: 443, path: '/v3' + path, method, headers },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch { /* не JSON */ }
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(data);
          else reject(new Error(data.description || `ЮKassa ${res.statusCode}`));
        });
      }
    );
    reqObj.on('error', reject);
    reqObj.setTimeout(15000, () => reqObj.destroy(new Error('Таймаут запроса к ЮKassa')));
    if (payload) reqObj.write(payload);
    reqObj.end();
  });
}

/* ── Создать платёж ──────────────────────────────────────────────
   order     — заказ из БД (shapeOrder)
   returnUrl — куда вернуть пользователя после оплаты
   Возвращает { id, status, confirmationUrl, raw } */
async function createPayment(order, returnUrl) {
  if (!CONFIGURED) throw new Error('ЮKassa не настроена (нет SHOP_ID / SECRET_KEY)');
  const value = (Math.round(Number(order.amount) || 0)).toFixed(2); // "1234.00"

  // Фискальный чек (54-ФЗ). Email — из заказа (поле Email клиента).
  const email = String(order.email || '').trim();
  if (!email) throw new Error('Не указан email клиента для чека');
  const receipt = {
    customer: { email },
    items: [{
      description: String(order.productName || 'Цифровой информационный материал').slice(0, 128),
      quantity: '1.00',
      amount: { value, currency: 'RUB' },
      vat_code: 1,               // 1 = без НДС
      payment_subject: 'service',
      payment_mode: 'full_prepayment',
    }],
  };

  const payload = {
    amount: { value, currency: 'RUB' },
    capture: true,
    confirmation: { type: 'redirect', return_url: returnUrl },
    description: `Заказ ${order.id} · ${String(order.productName || '').slice(0, 100)}`,
    receipt,
    metadata: { orderId: order.id, source: 'ps_store' },
  };

  const data = await request('POST', '/payments', payload, crypto.randomUUID());
  return {
    id: data.id,
    status: data.status,
    confirmationUrl: data.confirmation && data.confirmation.confirmation_url,
    raw: data,
  };
}

/* ── Получить платёж по id (для верификации вебхука) ── */
async function getPayment(paymentId) {
  if (!CONFIGURED) throw new Error('ЮKassa не настроена');
  return request('GET', '/payments/' + encodeURIComponent(paymentId));
}

module.exports = { createPayment, getPayment, isConfigured: () => CONFIGURED, SHOP_ID };
