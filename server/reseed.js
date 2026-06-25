#!/usr/bin/env node
/**
 * Logovo PlayStation — принудительный сброс и пересев базы данных.
 * Запуск: node server/reseed.js
 *
 * ⚠️  УДАЛЯЕТ ВСЕ ТОВАРЫ И КАТЕГОРИИ и заполняет заново.
 *    Заказы и медиафайлы НЕ трогаются.
 */
'use strict';
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH  = path.join(DATA_DIR, 'logovo.sqlite');

if (!fs.existsSync(DB_PATH)) {
  console.log('БД не найдена — запустите сервер для создания: node server/server.js');
  process.exit(0);
}

const db = new DatabaseSync(DB_PATH);
console.log('Очищаем товары и категории...');
db.exec('DELETE FROM products; DELETE FROM categories; DELETE FROM settings;');
db.close();

console.log('Запускаем seed...');
// Re-require db.js which will run seed()
require('./db.js');
console.log('✅  Готово! Запустите сервер: node server/server.js');
