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

/* ══ TELEGRAM BOT (рассылка всем подписчикам бота) ══
   Подписчики добавляются командой /start в самом боте (см. telegram.js).
   Рассылка идёт всем /start-подписчикам; данные клиента в форматтерах
   ниже экранируются через esc() для безопасной отправки parse_mode: HTML.
   Если токен не задан — мягкий STUB-режим (только лог в консоль). */
const tg = require('./telegram');

async function sendTelegram(message) {
  if (tg.isConfigured()) {
    const sent = await tg.broadcast(message);
    if (!sent) log.warn('Рассылка не доставлена (нет подписчиков или ошибка).');
    return sent;
  }
  // STUB — логируем в консоль (бот не настроен)
  log.info('[STUB] Telegram:\n' + message);
  return true;
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

/** Данные клиента получены после оплаты — всё для выполнения заказа */
function formatOrderData(order) {
  const meta = order.meta || {};
  const acc  = order.psnId || meta.accLogin || '';
  return [
    `📋 <b>ДАННЫЕ ДЛЯ ВЫПОЛНЕНИЯ</b>  <code>#${esc(order.id)}</code>`,
    '',
    `📦 <b>Товар:</b>  ${esc(order.productName)}`,
    `💰 <b>Сумма:</b>  ${order.amount} ₽`,
    order.status === 'paid' ? '✅ <b>Оплачен</b>' : `🔄 <b>Статус:</b> ${esc(order.status)}`,
    '',
    `✈️ <b>Telegram:</b>      ${esc(order.telegram || '—')}`,
    acc           ? `👤 <b>Аккаунт:</b>       ${esc(acc)}`        : '',
    meta.accPass  ? `🔐 <b>Пароль акк.:</b>   ${esc(meta.accPass)}` : '',
    order.email   ? `📧 <b>Email:</b>         ${esc(order.email)}` : '',
    order.comment ? `💬 <b>Комментарий:</b>   ${esc(order.comment)}` : '',
    '',
    `⚡️ <b>Можно выполнять заказ</b>`,
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

async function notifyOrderData(order) {
  try {
    await sendTelegram(formatOrderData(order));
    log.info('Order data notified:', order.id);
    return true;
  } catch (err) {
    log.err('notifyOrderData failed:', err.message);
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
  notifyOrderData,
  notifyOrderActivated,
  notifyOrderCancelled,
  buildOrderPayload,
};
