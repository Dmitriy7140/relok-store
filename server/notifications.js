'use strict';
/* ══════════════════════════════════════════════════════════════
   Logovo PlayStation — Сервис уведомлений (STUB)

   Статусы заказа:
     pending   — создан, ожидает оплаты
     paid      — оплачен, требует активации
     activated — товар активирован и доставлен
     cancelled — отменён
     refunded  — возврат средств

   Структура уведомления при оплате:
     • Никнейм клиента
     • Telegram клиента
     • Оформленный товар
     • Стоимость заказа
     • PSN ID
     • Время оплаты
     • Номер заказа

   Для подключения Telegram-бота:
     1. npm install node-telegram-bot-api
     2. Раскомментировать блок TELEGRAM BOT ниже
     3. Задать BOT_TOKEN и NOTIFY_CHAT_ID в переменных окружения
   ══════════════════════════════════════════════════════════════ */

const https = require('node:https');

const log = {
  info: (...a) => console.log(new Date().toISOString(), '[NOTIFY]', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), '[NOTIFY WARN]', ...a),
  err:  (...a) => console.error(new Date().toISOString(), '[NOTIFY ERR]', ...a),
};

/* ══ TELEGRAM BOT ════════════════════════════════════════════
   Отправка через Bot API на штатном node:https (без npm).
   Нужны переменные окружения BOT_TOKEN и NOTIFY_CHAT_ID.
   Если они не заданы — пишем в консоль (как раньше). */
function sendTelegram(message) {
  const token  = process.env.BOT_TOKEN;
  const chatId = process.env.NOTIFY_CHAT_ID;

  if (!token || !chatId) {
    if (!token)  log.warn('BOT_TOKEN не задан');
    if (!chatId) log.warn('NOTIFY_CHAT_ID не задан');
    log.info('[STUB] Telegram:\n' + message);
    return Promise.resolve(false);
  }

  const payload = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });

  return new Promise((resolve) => {
    const reqObj = https.request(
      {
        hostname: 'api.telegram.org',
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) { resolve(true); }
          else { log.err('Telegram sendMessage', res.statusCode, raw.slice(0, 300)); resolve(false); }
        });
      }
    );
    reqObj.on('error', (e) => { log.err('Telegram error:', e.message); resolve(false); });
    reqObj.setTimeout(15000, () => reqObj.destroy(new Error('Таймаут запроса к Telegram')));
    reqObj.write(payload);
    reqObj.end();
  });
}

/* ══ Форматировщики сообщений ════════════════════════════════ */
// Экранируем данные клиента для parse_mode: HTML (иначе < > & ломают отправку)
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

/** Новый заказ (pending) */
function formatNewOrder(order) {
  const date = new Date(order.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const meta = order.meta || {};
  return [
    `🛒 <b>Новый заказ</b>  <code>#${esc(order.id)}</code>`,
    '',
    order.email      ? `📧 <b>Email:</b>           ${esc(order.email)}`      : '',
    meta.accLogin    ? `👤 <b>Аккаунт:</b>         ${esc(meta.accLogin)}`    : '',
    meta.accPass     ? `🔐 <b>Пароль акк.:</b>     ${esc(meta.accPass)}`     : '',
    '',
    `📦 <b>Товар:</b>  ${esc(order.productName)}`,
    `💰 <b>Сумма:</b>  ${order.amount} ₽`,
    order.comment ? `💬 <b>Комментарий:</b>  ${esc(order.comment)}` : '',
    '',
    `🕐 <b>Создан:</b>  ${date}`,
    `🔄 <b>Статус:</b>  ожидает оплаты`,
  ].filter(Boolean).join('\n');
}

/** Заказ оплачен — основное уведомление для обработки */
function formatPaidOrder(order) {
  const paidAt = new Date(order.paidAt || Date.now()).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const meta = order.meta || {};
  return [
    `✅ <b>ОПЛАЧЕНО</b>  <code>#${esc(order.id)}</code>`,
    '',
    order.email      ? `📧 <b>Email:</b>           ${esc(order.email)}`      : '',
    meta.accLogin    ? `👤 <b>Аккаунт:</b>         ${esc(meta.accLogin)}`    : '',
    meta.accPass     ? `🔐 <b>Пароль акк.:</b>     ${esc(meta.accPass)}`     : '',
    '',
    `📦 <b>Товар:</b>  ${esc(order.productName)}`,
    `💰 <b>Сумма:</b>  ${order.amount} ₽`,
    '',
    `🕐 <b>Оплачен:</b>  ${paidAt}`,
    '',
    `⚡️ <b>Требуется активация!</b>`,
  ].filter(Boolean).join('\n');
}

/** Заказ активирован */
function formatActivatedOrder(order) {
  return [
    `🎉 <b>Активировано</b>  <code>#${esc(order.id)}</code>`,
    `📛 ${esc(order.nickname)}  |  ✈️ ${esc(order.telegram || '—')}`,
    `📦 ${esc(order.productName)}  —  ${order.amount} ₽`,
  ].join('\n');
}

/** Заказ отменён */
function formatCancelledOrder(order) {
  return [
    `❌ <b>Отменён</b>  <code>#${esc(order.id)}</code>`,
    `📛 ${esc(order.nickname)}  |  🎮 ${esc(order.psnId)}`,
    `📦 ${esc(order.productName)}  —  ${order.amount} ₽`,
  ].join('\n');
}

/* ══ Публичные методы ════════════════════════════════════════ */

async function notifyNewOrder(order) {
  try {
    await sendTelegram(formatNewOrder(order));
    log.info('New order notified:', order.id);
    return true;
  } catch (err) {
    log.err('notifyNewOrder failed:', err.message);
    return false;
  }
}

async function notifyOrderPaid(order) {
  try {
    await sendTelegram(formatPaidOrder(order));
    log.info('Paid order notified:', order.id);
    return true;
  } catch (err) {
    log.err('notifyOrderPaid failed:', err.message);
    return false;
  }
}

async function notifyOrderActivated(order) {
  try {
    await sendTelegram(formatActivatedOrder(order));
    log.info('Activated order notified:', order.id);
    return true;
  } catch (err) {
    log.err('notifyOrderActivated failed:', err.message);
    return false;
  }
}

async function notifyOrderCancelled(order) {
  try {
    await sendTelegram(formatCancelledOrder(order));
    log.info('Cancelled order notified:', order.id);
    return true;
  } catch (err) {
    log.err('notifyOrderCancelled failed:', err.message);
    return false;
  }
}

/**
 * Формирует объект уведомления для будущей интеграции.
 * Используется как стандартная модель данных для TG-бота.
 */
function buildOrderPayload(order) {
  return {
    orderId:     order.id,
    nickname:    order.nickname,
    telegram:    order.telegram,
    email:       order.email,
    productName: order.productName,
    amount:      order.amount,
    psnId:       order.psnId,
    paidAt:      order.paidAt,
    status:      order.status,
  };
}

module.exports = {
  notifyNewOrder,
  notifyOrderPaid,
  notifyOrderActivated,
  notifyOrderCancelled,
  buildOrderPayload,
};
