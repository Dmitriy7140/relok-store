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

const log = {
  info: (...a) => console.log(new Date().toISOString(), '[NOTIFY]', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), '[NOTIFY WARN]', ...a),
  err:  (...a) => console.error(new Date().toISOString(), '[NOTIFY ERR]', ...a),
};

/* ══ TELEGRAM BOT (stub — раскомментировать после установки) ══ */
async function sendTelegram(message) {
  /*
  // ── Подключение реального бота ────────────────────────────────
  const TelegramBot = require('node-telegram-bot-api');
  const bot    = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
  const chatId = process.env.NOTIFY_CHAT_ID;

  if (!process.env.BOT_TOKEN) { log.warn('BOT_TOKEN не задан'); return false; }
  if (!chatId)                 { log.warn('NOTIFY_CHAT_ID не задан'); return false; }

  await bot.sendMessage(chatId, message, {
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
  return true;
  // ─────────────────────────────────────────────────────────────
  */

  // STUB — логируем в консоль
  log.info('[STUB] Telegram:\n' + message);
  return true;
}

/* ══ Форматировщики сообщений ════════════════════════════════ */

/** Новый заказ (pending) */
function formatNewOrder(order) {
  const date = new Date(order.createdAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  const meta = order.meta || {};
  return [
    `🛒 <b>Новый заказ</b>  <code>#${order.id}</code>`,
    '',
    order.email      ? `📧 <b>Email:</b>           ${order.email}`      : '',
    meta.accLogin    ? `👤 <b>Аккаунт:</b>         ${meta.accLogin}`    : '',
    meta.accPass     ? `🔐 <b>Пароль акк.:</b>     ${meta.accPass}`     : '',
    '',
    `📦 <b>Товар:</b>  ${order.productName}`,
    `💰 <b>Сумма:</b>  ${order.amount} ₽`,
    order.comment ? `💬 <b>Комментарий:</b>  ${order.comment}` : '',
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
    `✅ <b>ОПЛАЧЕНО</b>  <code>#${order.id}</code>`,
    '',
    order.email      ? `📧 <b>Email:</b>           ${order.email}`      : '',
    meta.accLogin    ? `👤 <b>Аккаунт:</b>         ${meta.accLogin}`    : '',
    meta.accPass     ? `🔐 <b>Пароль акк.:</b>     ${meta.accPass}`     : '',
    '',
    `📦 <b>Товар:</b>  ${order.productName}`,
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
    `🎉 <b>Активировано</b>  <code>#${order.id}</code>`,
    `📛 ${order.nickname}  |  ✈️ ${order.telegram || '—'}`,
    `📦 ${order.productName}  —  ${order.amount} ₽`,
  ].join('\n');
}

/** Заказ отменён */
function formatCancelledOrder(order) {
  return [
    `❌ <b>Отменён</b>  <code>#${order.id}</code>`,
    `📛 ${order.nickname}  |  🎮 ${order.psnId}`,
    `📦 ${order.productName}  —  ${order.amount} ₽`,
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
