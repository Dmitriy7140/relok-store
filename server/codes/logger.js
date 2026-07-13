'use strict';
/* ═══════════════════════════════════════════════════════════════
   Лёгкий логгер для сервисов выдачи кодов.

   Пишет в консоль (цветно) и, если задан CODES_LOG_DIR, дублирует
   в файл codes-YYYY-MM-DD.log. Полностью самодостаточен — не тянет
   зависимостей, поэтому безопасно требовать из любого сервиса.

   Уровни: debug < info < warn < error. Порог — CODES_LOG_LEVEL
   (по умолчанию info).
   ═══════════════════════════════════════════════════════════════ */

const fs = require('node:fs');
const path = require('node:path');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[String(process.env.CODES_LOG_LEVEL || 'info').toLowerCase()] ?? LEVELS.info;

const COLORS = {
  debug: '\x1b[90m',
  info: '\x1b[36m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
};

// Файловый вывод включается только если задан каталог логов.
let stream = null;
const logDir = process.env.CODES_LOG_DIR;
if (logDir) {
  try {
    fs.mkdirSync(logDir, { recursive: true });
    const logFile = path.join(logDir, `codes-${new Date().toISOString().slice(0, 10)}.log`);
    stream = fs.createWriteStream(logFile, { flags: 'a' });
  } catch {
    stream = null; // не смогли открыть файл — работаем только в консоль
  }
}

function write(level, ...args) {
  if (LEVELS[level] < threshold) return;

  const ts = new Date().toISOString();
  const text = args
    .map((a) => (a instanceof Error ? a.stack || a.message : typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  const line = `${ts} [${level.toUpperCase()}] ${text}`;

  if (stream) stream.write(line + '\n');
  const c = COLORS[level] || '';
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${c}${line}${COLORS.reset}\n`);
}

module.exports = {
  debug: (...a) => write('debug', ...a),
  info: (...a) => write('info', ...a),
  warn: (...a) => write('warn', ...a),
  error: (...a) => write('error', ...a),
};
