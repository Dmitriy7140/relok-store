'use strict';
/* ═══════════════════════════════════════════════════════════════
   Бонусная экономика: баланс, начисления/списания, кейс, выдача.
   Все операции, меняющие баланс или запасы ключей — атомарные (tx).
   ═══════════════════════════════════════════════════════════════ */
const { all, get, run, tx } = require('./db');

const log = {
  info: (...a) => console.log(new Date().toISOString(), '[BONUS]', ...a),
  err:  (...a) => console.error(new Date().toISOString(), '[BONUS ERR]', ...a),
};

const ACCRUAL_RATE = 0.30; // 30% от суммы заказа

/* ── Пользователи ───────────────────────────────────────────── */
function upsertUser(u) {
  if (!u || !u.id) return null;
  run(`INSERT INTO users (id, username, first_name, last_name, photo_url)
       VALUES (?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET
         username=excluded.username, first_name=excluded.first_name,
         last_name=excluded.last_name, photo_url=excluded.photo_url,
         updated_at=datetime('now')`,
    [u.id, u.username || '', u.firstName || '', u.lastName || '', u.photoUrl || '']);
  return getUser(u.id);
}
function getUser(id)    { return get('SELECT * FROM users WHERE id=?', [String(id)]); }
function getBalance(id) { const r = getUser(id); return r ? r.balance : 0; }

/* Применяет изменение баланса + запись в леджер. ВЫЗЫВАТЬ ВНУТРИ tx(). */
function _apply(userId, amount, type, ref, note) {
  // Гарантируем существование пользователя
  run(`INSERT INTO users (id) VALUES (?) ON CONFLICT(id) DO NOTHING`, [String(userId)]);
  run(`UPDATE users SET balance = balance + ?, updated_at=datetime('now') WHERE id=?`,
    [amount, String(userId)]);
  run(`INSERT INTO bonus_tx (user_id, amount, type, ref, note) VALUES (?,?,?,?,?)`,
    [String(userId), amount, type, ref || '', note || '']);
}

function credit(userId, amount, type, ref, note) {
  if (amount <= 0) return getBalance(userId);
  return tx(() => { _apply(userId, amount, type, ref, note); return getBalance(userId); });
}

function listTx(userId, limit = 50) {
  return all('SELECT * FROM bonus_tx WHERE user_id=? ORDER BY id DESC LIMIT ?',
    [String(userId), Math.min(+limit || 50, 200)]);
}

/* ── Начисление за оплаченный заказ (идемпотентно) ──────────── */
function accrueForOrder(order) {
  if (!order || !order.userId) return 0;
  if (order.bonusEarned && order.bonusEarned > 0) return order.bonusEarned; // уже начислено
  const earn = Math.floor((+order.amount || 0) * ACCRUAL_RATE);
  if (earn <= 0) return 0;
  tx(() => {
    // повторная проверка внутри транзакции
    const fresh = get('SELECT bonus_earned FROM orders WHERE id=?', [order.id]);
    if (fresh && fresh.bonus_earned > 0) return;
    _apply(order.userId, earn, 'earn', order.id, 'Начисление за заказ');
    run('UPDATE orders SET bonus_earned=? WHERE id=?', [earn, order.id]);
  });
  log.info('Accrued', earn, 'to', order.userId, 'for', order.id);
  return earn;
}

/* ── Кейс (рулетка) ─────────────────────────────────────────── */
function getActiveCase() {
  return get('SELECT * FROM cases ORDER BY id LIMIT 1');
}
function listPrizes(caseId, onlyEnabled = false) {
  return all(`SELECT * FROM case_prizes WHERE case_id=? ${onlyEnabled ? 'AND enabled=1' : ''} ORDER BY position,id`,
    [caseId]);
}

function _pickWeighted(prizes) {
  const total = prizes.reduce((s, p) => s + Math.max(0, p.weight), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const p of prizes) { r -= Math.max(0, p.weight); if (r < 0) return p; }
  return prizes[prizes.length - 1];
}

/** Открыть кейс. Возвращает { prize, balance, key? } или бросает ошибку. */
function openCase(userId, caseId) {
  return tx(() => {
    const cs = caseId ? get('SELECT * FROM cases WHERE id=?', [+caseId]) : getActiveCase();
    if (!cs) throw new Error('Кейс не найден');
    if (!cs.enabled) throw new Error('Кейс временно недоступен');

    const prizes = listPrizes(cs.id, true).filter(p => p.weight > 0);
    if (!prizes.length) throw new Error('В кейсе нет призов');

    const bal = getBalance(userId);
    if (bal < cs.cost) throw new Error('Недостаточно бонусов');

    _apply(userId, -cs.cost, 'spend_case', String(cs.id), 'Открытие кейса');

    const prize = _pickWeighted(prizes);
    let key = null;

    if (prize.type === 'bonus' && prize.value > 0) {
      _apply(userId, prize.value, 'prize', String(cs.id), 'Приз: ' + prize.name);
    } else if (prize.type === 'product' && prize.value) {
      // Попытка выдать ключ бонусного товара, если он на авто-выдаче
      const bp = get('SELECT * FROM bonus_products WHERE id=?', [prize.value]);
      if (bp && bp.auto_deliver) {
        const k = get('SELECT * FROM key_stock WHERE product_id=? AND used=0 ORDER BY id LIMIT 1', [bp.id]);
        if (k) {
          run(`UPDATE key_stock SET used=1, used_by=?, used_at=datetime('now') WHERE id=?`, [String(userId), k.id]);
          run(`INSERT INTO key_delivery (user_id, product_id, key_id, key_value, cost) VALUES (?,?,?,?,0)`,
            [String(userId), bp.id, k.id, k.key_value]);
          key = k.key_value;
        }
      }
    }

    run(`INSERT INTO case_openings (user_id, case_id, prize_id, prize_name, cost) VALUES (?,?,?,?,?)`,
      [String(userId), cs.id, prize.id, prize.name, cs.cost]);

    return { prize: { id: prize.id, name: prize.name, emoji: prize.emoji, image: prize.image, type: prize.type, value: prize.value }, key, balance: getBalance(userId) };
  });
}

/* ── Покупка бонусного товара ───────────────────────────────── */
function buyBonusProduct(userId, productId) {
  return tx(() => {
    const p = get('SELECT * FROM bonus_products WHERE id=? AND hidden=0', [+productId]);
    if (!p) throw new Error('Товар не найден');

    const bal = getBalance(userId);
    if (bal < p.cost) throw new Error('Недостаточно бонусов');

    let key = null;
    if (p.auto_deliver) {
      const k = get('SELECT * FROM key_stock WHERE product_id=? AND used=0 ORDER BY id LIMIT 1', [p.id]);
      if (!k) throw new Error('Товар временно недоступен (нет ключей)');
      run(`UPDATE key_stock SET used=1, used_by=?, used_at=datetime('now') WHERE id=?`, [String(userId), k.id]);
      _apply(userId, -p.cost, 'spend_shop', String(p.id), 'Покупка: ' + p.name);
      run(`INSERT INTO key_delivery (user_id, product_id, key_id, key_value, cost) VALUES (?,?,?,?,?)`,
        [String(userId), p.id, k.id, k.key_value, p.cost]);
      key = k.key_value;
    } else {
      if (p.quantity <= 0) throw new Error('Товар закончился');
      run('UPDATE bonus_products SET quantity = quantity - 1 WHERE id=?', [p.id]);
      _apply(userId, -p.cost, 'spend_shop', String(p.id), 'Покупка: ' + p.name);
    }
    log.info('Bonus purchase', p.id, 'by', userId, key ? '(key issued)' : '');
    return { key, balance: getBalance(userId), product: { id: p.id, name: p.name } };
  });
}

/* ── Запасы ключей (админ) ──────────────────────────────────── */
function availableKeys(productId) {
  return get('SELECT COUNT(*) AS c FROM key_stock WHERE product_id=? AND used=0', [+productId]).c;
}
function addKeys(productId, keys) {
  const list = (Array.isArray(keys) ? keys : String(keys || '').split(/\r?\n/))
    .map(s => String(s).trim()).filter(Boolean);
  tx(() => list.forEach(k => run('INSERT INTO key_stock (product_id, key_value) VALUES (?,?)', [+productId, k])));
  return list.length;
}

module.exports = {
  ACCRUAL_RATE,
  upsertUser, getUser, getBalance, credit, listTx,
  accrueForOrder,
  getActiveCase, listPrizes, openCase,
  buyBonusProduct,
  availableKeys, addKeys,
};
