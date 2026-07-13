'use strict';
/* ═══════════════════════════════════════════════════════════════
   Логгер: пишет и в консоль (цветно), и в файл logs/sync-YYYY-MM-DD.log.
   Уровни: debug < info < warn < error.
   ═══════════════════════════════════════════════════════════════ */

const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.log.level] ?? LEVELS.info;

// Гарантируем наличие каталога логов.
fs.mkdirSync(config.log.dir, { recursive: true });

const logFile = path.join(
  config.log.dir,
  `sync-${new Date().toISOString().slice(0, 10)}.log`
);
const stream = fs.createWriteStream(logFile, { flags: 'a' });

// ANSI-цвета для консоли.
const COLORS = {
  debug: '\x1b[90m', // серый
  info: '\x1b[36m',  // голубой
  warn: '\x1b[33m',  // жёлтый
  error: '\x1b[31m', // красный
  reset: '\x1b[0m',
};

/**
 * Базовая функция логирования.
 * @param {'debug'|'info'|'warn'|'error'} level
 * @param {...any} args
 */
function write(level, ...args) {
  if (LEVELS[level] < threshold) return;

  const ts = new Date().toISOString();
  const text = args
    .map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a)))
    .join(' ');
  const line = `${ts} [${level.toUpperCase()}] ${text}`;

  // В файл — без цвета.
  stream.write(line + '\n');
  // В консоль — с цветом.
  const c = COLORS[level] || '';
  const out = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  out.write(`${c}${line}${COLORS.reset}\n`);
}

module.exports = {
  debug: (...a) => write('debug', ...a),
  info: (...a) => write('info', ...a),
  warn: (...a) => write('warn', ...a),
  error: (...a) => write('error', ...a),
  logFile,
};
