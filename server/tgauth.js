'use strict';
/* ═══════════════════════════════════════════════════════════════
   Валидация Telegram WebApp initData (серверная, HMAC-SHA256).

   Это критично для безопасности бонусной экономики: клиент НЕ может
   быть доверенным источником user.id, иначе любой сможет начислить
   себе бонусы. Сервер проверяет подпись initData токеном бота.

   Алгоритм (Telegram docs):
     secret_key = HMAC_SHA256(key="WebAppData", data=bot_token)
     hash       = HMAC_SHA256(key=secret_key,  data=data_check_string)
     где data_check_string — все поля initData (кроме hash),
     отсортированные по ключу и склеенные как "k=v" через \n.
   ═══════════════════════════════════════════════════════════════ */
const crypto = require('node:crypto');
const tg = require('./telegram');

const MAX_AGE_SEC = 24 * 60 * 60; // initData действителен 24 часа

/**
 * Проверяет initData и возвращает объект пользователя { id, username, ... }
 * или null, если подпись неверна / токен не задан / данные просрочены.
 */
function verifyInitData(initData) {
  const token = tg.getToken && tg.getToken();
  if (!token || !initData || typeof initData !== 'string') return null;

  let params;
  try { params = new URLSearchParams(initData); } catch { return null; }

  const hash = params.get('hash');
  if (!hash) return null;

  const pairs = [];
  for (const [k, v] of params.entries()) {
    if (k === 'hash') continue;
    pairs.push(`${k}=${v}`);
  }
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secret = crypto.createHmac('sha256', 'WebAppData').update(token).digest();
  const calc   = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

  // Сравнение с защитой от тайминг-атак
  const a = Buffer.from(calc, 'hex');
  const b = Buffer.from(hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  // Проверка свежести
  const authDate = +params.get('auth_date');
  if (authDate && (Date.now() / 1000 - authDate) > MAX_AGE_SEC) return null;

  let user;
  try { user = JSON.parse(params.get('user') || 'null'); } catch { user = null; }
  if (!user || !user.id) return null;

  return {
    id: String(user.id),
    username: user.username || '',
    firstName: user.first_name || '',
    lastName: user.last_name || '',
    photoUrl: user.photo_url || '',
  };
}

module.exports = { verifyInitData, isConfigured: () => !!(tg.getToken && tg.getToken()) };
