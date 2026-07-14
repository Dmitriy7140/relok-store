'use strict';
/* ═══════════════════════════════════════════════════════════════
   Выбор платёжного провайдера через переменную окружения.

     PAYMENT_PROVIDER=robokassa  → server/robokassa.js  (поллинг OpStateExt)
     PAYMENT_PROVIDER=yookassa   → server/payment.js    (ЮKassa, вебхук+поллинг)

   По умолчанию — robokassa. Оба модуля дают одинаковый интерфейс:
     createPayment(order, returnUrl, receiptEmail)
       → { id, confirmationUrl, status }
     getPayment(idOrInvId)
       → { status:'succeeded'|'canceled'|'pending', paid, ... }
     isConfigured() → boolean

   Благодаря совместимому интерфейсу вся машинерия оплаты в server.js
   (syncOrderPayment / pollPendingPayments) работает без изменений.
   ═══════════════════════════════════════════════════════════════ */

const PROVIDER = (process.env.PAYMENT_PROVIDER || 'robokassa').toLowerCase();

let impl;
if (PROVIDER === 'yookassa' || PROVIDER === 'yoomoney' || PROVIDER === 'yk') {
  impl = require('./payment');
} else {
  impl = require('./robokassa');
}

module.exports = Object.assign({}, impl, { PROVIDER });
