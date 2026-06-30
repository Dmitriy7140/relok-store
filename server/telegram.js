'use strict';
/* ═══════════════════════════════════════════════════════════════
   Telegram-бот уведомлений о заказах — на встроенном node:https
   (без npm-зависимостей).

   Логика:
     • Любой, кто напишет боту /start — подписывается на рассылку.
       Его chat_id сохраняется в таблицу tg_subscribers.
     • При создании заказа (перед оплатой) всем подписчикам
       приходит уведомление с данными клиента (см. notifications.js).
     • /stop — отписаться.

   Токен бота (приоритет): переменная окружения TELEGRAM_BOT_TOKEN,
   иначе файл ./tg-config.js (gitignored):
       module.exports = { BOT_TOKEN: '123456:ABC...' };

   Получение обновлений — long polling (getUpdates), не требует
   публичного домена и вебхука. Запускается из server.js: tg.start().
   ═══════════════════════════════════════════════════════════════ */
const https = require('node:https');
const { run, all, get } = require('./db');

/* ── Токен ─────────────────────────────────────────────────────── */
function loadToken() {
  let cfg = {};
  try { cfg = require('./tg-config'); } catch { /* файла может не быть */ }
  return process.env.TELEGRAM_BOT_TOKEN || cfg.BOT_TOKEN || '';
}
const BOT_TOKEN = loadToken();
const CONFIGURED = Boolean(BOT_TOKEN);

const log = {
  info: (...a) => console.log(new Date().toISOString(), '[TG]', ...a),
  warn: (...a) => console.warn(new Date().toISOString(), '[TG WARN]', ...a),
  err:  (...a) => console.error(new Date().toISOString(), '[TG ERR]', ...a),
};

/* ── Хранилище подписчиков ─────────────────────────────────────── */
function ensureTable() {
  run(`CREATE TABLE IF NOT EXISTS tg_subscribers (
    chat_id    TEXT PRIMARY KEY,
    username   TEXT DEFAULT '',
    first_name TEXT DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
}

function addSubscriber(chatId, username, firstName) {
  run(`INSERT INTO tg_subscribers (chat_id, username, first_name, created_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET username = excluded.username,
                                          first_name = excluded.first_name`,
    [String(chatId), username || '', firstName || '', Date.now()]);
}

function removeSubscriber(chatId) {
  run('DELETE FROM tg_subscribers WHERE chat_id = ?', [String(chatId)]);
}

function listSubscribers() {
  try { return all('SELECT chat_id FROM tg_subscribers').map(r => r.chat_id); }
  catch { return []; }
}

/* ── Низкоуровневый вызов Bot API ──────────────────────────────── */
function api(method, params) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(params || {});
    const req = https.request(
      {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${BOT_TOKEN}/${method}`,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      },
      (res) => {
        let raw = '';
        res.on('data', (c) => { raw += c; });
        res.on('end', () => {
          let data = {};
          try { data = raw ? JSON.parse(raw) : {}; } catch {}
          if (data.ok) resolve(data.result);
          else reject(Object.assign(new Error(data.description || `TG ${res.statusCode}`), { code: data.error_code }));
        });
      }
    );
    req.on('error', reject);
    req.setTimeout(70000, () => req.destroy(new Error('Telegram timeout')));
    req.write(payload);
    req.end();
  });
}

/* ── Отправка сообщения одному чату ────────────────────────────── */
async function sendMessage(chatId, text) {
  return api('sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

/* ── Рассылка всем подписчикам ─────────────────────────────────── */
async function broadcast(text) {
  if (!CONFIGURED) { log.warn('BOT_TOKEN не задан — рассылка пропущена'); return false; }
  const subs = listSubscribers();
  if (!subs.length) { log.warn('Нет подписчиков — некому слать. Откройте бота и нажмите /start'); return false; }
  let ok = 0;
  for (const chatId of subs) {
    try { await sendMessage(chatId, text); ok++; }
    catch (e) {
      // 403 (бот заблокирован) / 400 (chat not found) — чистим из подписки
      if (e.code === 403 || e.code === 400) { removeSubscriber(chatId); log.warn('Удалён недоступный подписчик:', chatId); }
      else log.err('sendMessage failed:', chatId, e.message);
    }
  }
  log.info(`Рассылка отправлена: ${ok}/${subs.length}`);
  return ok > 0;
}

/* ── Обработка входящих апдейтов ───────────────────────────────── */
function handleUpdate(u) {
  const msg = u.message || u.edited_message;
  if (!msg || !msg.chat) return;
  const chatId = msg.chat.id;
  const text = (msg.text || '').trim();
  const from = msg.from || {};

  if (/^\/start\b/.test(text)) {
    addSubscriber(chatId, from.username, from.first_name);
    log.info('Новый подписчик:', chatId, from.username ? '@' + from.username : '');
    sendMessage(chatId,
      '✅ <b>Вы подписаны на уведомления о заказах</b>\n\n' +
      'Теперь все новые заказы магазина будут приходить сюда.\n' +
      'Чтобы отписаться — отправьте /stop'
    ).catch((e) => log.err('welcome failed:', e.message));
  } else if (/^\/stop\b/.test(text)) {
    removeSubscriber(chatId);
    log.info('Отписался:', chatId);
    sendMessage(chatId, '🔕 Вы отписались от уведомлений. /start — чтобы подписаться снова.')
      .catch(() => {});
  } else if (/^\/status\b/.test(text)) {
    const n = listSubscribers().length;
    sendMessage(chatId, `📊 Подписчиков: <b>${n}</b>`).catch(() => {});
  }
}

/* ── Long polling ──────────────────────────────────────────────── */
let _offset = 0;
let _polling = false;

async function poll() {
  while (_polling) {
    try {
      const updates = await api('getUpdates', { offset: _offset, timeout: 50 });
      for (const u of updates) {
        _offset = u.update_id + 1;
        try { handleUpdate(u); } catch (e) { log.err('handleUpdate:', e.message); }
      }
    } catch (e) {
      log.err('getUpdates:', e.message);
      await new Promise(r => setTimeout(r, 3000)); // пауза перед повтором
    }
  }
}

/* ── Запуск ────────────────────────────────────────────────────── */
async function start() {
  ensureTable();
  if (!CONFIGURED) {
    log.warn('BOT_TOKEN не задан — бот не запущен (рассылка в STUB-режиме).');
    return false;
  }
  try {
    const me = await api('getMe', {});
    log.info(`Бот запущен: @${me.username}. Подписчиков: ${listSubscribers().length}`);
  } catch (e) {
    log.err('getMe failed (проверьте токен):', e.message);
    return false;
  }
  _polling = true;
  poll();
  return true;
}

function stop() { _polling = false; }

module.exports = {
  start, stop, broadcast, sendMessage,
  isConfigured: () => CONFIGURED,
  getToken: () => BOT_TOKEN,
  listSubscribers,
};
