'use strict';
/* ═══════════════════════════════════════════════════════════════
   МОДУЛЬ 4 — Работа с Google Sheets.

   Возможности:
     • авторизация через сервисный аккаунт (Service Account);
     • автосоздание таблицы при первом запуске (ID кэшируется);
     • upsert по колонке ID: существующие строки ОБНОВЛЯЮТСЯ,
       новые — ДОБАВЛЯЮТСЯ, дубликаты не создаются;
     • при обновлении цена в рублях (столбец F) НЕ перезаписывается —
       меняются только TRY-цена, статус, офиц. название, ссылка, дата.

   Требуется пакет googleapis:  npm install googleapis
   ═══════════════════════════════════════════════════════════════ */

const fs = require('node:fs');
const { google } = require('googleapis');
const config = require('./config');
const log = require('./logger');

// Порядок и заголовки столбцов. ID — служебный ключ для upsert.
const HEADER = [
  'ID',                            // A — ключ (id товара из магазина)
  'Название игры',                 // B — название в магазине
  'Издание',                       // C — издание
  'Название в PS Store',           // D — офиц. название с сайта
  'Цена в турецких лирах (TRY)',   // E — «2.999,00 TL»
  'Цена в рублях (мой магазин)',   // F — не меняется при обновлении
  'Статус',                        // G
  'Ссылка PS Store',               // H
  'Обновлено',                     // I
];

// Индексы столбцов (0-based) для точечных обновлений.
const COL = { ID: 0, NAME: 1, EDITION: 2, PS_NAME: 3, TRY: 4, RUB: 5, STATUS: 6, URL: 7, UPDATED: 8 };
const LAST_COL_LETTER = 'I';

class SheetsClient {
  constructor() {
    this.sheets = null;
    this.drive = null;
    this.spreadsheetId = null;
    this.sheetId = null; // числовой gid листа
  }

  /* ── Авторизация ─────────────────────────────────────────── */
  async init() {
    if (!fs.existsSync(config.sheets.credentialsPath)) {
      throw new Error(
        `Не найден ключ сервисного аккаунта: ${config.sheets.credentialsPath}\n` +
        'Скачайте JSON-ключ в Google Cloud Console и укажите путь в GOOGLE_APPLICATION_CREDENTIALS.'
      );
    }

    const auth = new google.auth.GoogleAuth({
      keyFile: config.sheets.credentialsPath,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });
    const client = await auth.getClient();
    this.sheets = google.sheets({ version: 'v4', auth: client });
    this.drive = google.drive({ version: 'v3', auth: client });

    await this.resolveSpreadsheet();
    await this.ensureSheetAndHeader();
  }

  /* ── Определяем/создаём книгу ────────────────────────────── */
  async resolveSpreadsheet() {
    // 1) Явно заданный ID из окружения.
    let id = config.sheets.spreadsheetId;
    // 2) Кэш от прошлого запуска.
    if (!id && fs.existsSync(config.sheets.idCacheFile)) {
      id = fs.readFileSync(config.sheets.idCacheFile, 'utf8').trim();
    }

    if (id) {
      this.spreadsheetId = id;
      log.info(`Используется таблица: ${id}`);
      return;
    }

    // 3) Создаём новую таблицу.
    const created = await this.sheets.spreadsheets.create({
      requestBody: {
        properties: { title: 'Игры магазина — цены PS Store (TR)' },
        sheets: [{ properties: { title: config.sheets.sheetTitle } }],
      },
    });
    this.spreadsheetId = created.data.spreadsheetId;
    fs.writeFileSync(config.sheets.idCacheFile, this.spreadsheetId, 'utf8');
    log.info(`Создана новая таблица: ${this.spreadsheetId}`);
    log.info(`URL: https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`);

    // Даём доступ вашему личному Google-аккаунту, иначе таблица будет
    // видна только сервисному аккаунту.
    if (config.sheets.shareWithEmail) {
      try {
        await this.drive.permissions.create({
          fileId: this.spreadsheetId,
          requestBody: { type: 'user', role: 'writer', emailAddress: config.sheets.shareWithEmail },
          sendNotificationEmail: false,
        });
        log.info(`Доступ выдан: ${config.sheets.shareWithEmail}`);
      } catch (err) {
        log.warn(`Не удалось выдать доступ ${config.sheets.shareWithEmail}: ${err.message}`);
      }
    }
  }

  /* ── Гарантируем наличие листа и строки-заголовка ────────── */
  async ensureSheetAndHeader() {
    const meta = await this.sheets.spreadsheets.get({ spreadsheetId: this.spreadsheetId });
    let sheet = meta.data.sheets.find(
      (s) => s.properties.title === config.sheets.sheetTitle
    );

    // Если листа нет — создаём.
    if (!sheet) {
      const res = await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: {
          requests: [{ addSheet: { properties: { title: config.sheets.sheetTitle } } }],
        },
      });
      this.sheetId = res.data.replies[0].addSheet.properties.sheetId;
    } else {
      this.sheetId = sheet.properties.sheetId;
    }

    // Проверяем/пишем заголовок.
    const firstRow = await this.getValues(`A1:${LAST_COL_LETTER}1`);
    if (!firstRow.length || firstRow[0][COL.ID] !== 'ID') {
      await this.setValues(`A1:${LAST_COL_LETTER}1`, [HEADER]);
      await this.formatHeader();
      log.info('Записана строка-заголовок');
    }
  }

  /* ── Чтение существующих строк (для upsert) ──────────────── */
  async readExisting() {
    const rows = await this.getValues(`A2:${LAST_COL_LETTER}`);
    const byId = new Map();
    rows.forEach((row, i) => {
      const id = row[COL.ID];
      if (id === undefined || id === '') return;
      byId.set(String(id), {
        rowNumber: i + 2, // фактический номер строки в таблице
        rub: row[COL.RUB] ?? '', // сохранённая цена в рублях — не трогаем
      });
    });
    log.info(`В таблице уже есть строк: ${byId.size}`);
    return byId;
  }

  /* ── Основной upsert ─────────────────────────────────────── */
  /**
   * @param {Array<Object>} results — результаты синхронизации (см. sync.js)
   * @returns {{updated:number, added:number}}
   */
  async upsert(results) {
    const existing = await this.readExisting();

    const updates = []; // точечные обновления существующих строк
    const appends = []; // новые строки

    for (const r of results) {
      const key = String(r.id);
      const found = existing.get(key);

      if (found) {
        // ОБНОВЛЯЕМ только TRY / офиц.название / статус / ссылку / дату.
        // Рубли (столбец F) НЕ трогаем — берём значение из таблицы.
        const rowNum = found.rowNumber;
        updates.push({
          range: `D${rowNum}:E${rowNum}`,
          values: [[r.psName, r.priceTryStr]],
        });
        updates.push({
          range: `G${rowNum}:I${rowNum}`,
          values: [[r.status, r.url, r.updatedAt]],
        });
      } else {
        // ДОБАВЛЯЕМ новую строку целиком (рубли берём из магазина).
        appends.push([
          r.id, r.name, r.edition, r.psName,
          r.priceTryStr, r.priceRub, r.status, r.url, r.updatedAt,
        ]);
      }
    }

    // Пакетное обновление существующих.
    if (updates.length) {
      await this.sheets.spreadsheets.values.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        requestBody: { valueInputOption: 'USER_ENTERED', data: updates },
      });
    }

    // Добавление новых строк.
    if (appends.length) {
      await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `A2:${LAST_COL_LETTER}`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: { values: appends },
      });
    }

    const updated = new Set(updates.map((u) => u.range.match(/\d+/)[0])).size;
    return { updated, added: appends.length };
  }

  /* ── Вспомогательное: чтение/запись значений ─────────────── */
  async getValues(range) {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `'${config.sheets.sheetTitle}'!${range}`,
    });
    return res.data.values || [];
  }

  async setValues(range, values) {
    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `'${config.sheets.sheetTitle}'!${range}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
  }

  /* ── Форматирование заголовка (жирный + закреп) ──────────── */
  async formatHeader() {
    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: { sheetId: this.sheetId, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  textFormat: { bold: true },
                  backgroundColor: { red: 0.12, green: 0.14, blue: 0.2 },
                },
              },
              fields: 'userEnteredFormat(textFormat,backgroundColor)',
            },
          },
          {
            updateSheetProperties: {
              properties: { sheetId: this.sheetId, gridProperties: { frozenRowCount: 1 } },
              fields: 'gridProperties.frozenRowCount',
            },
          },
        ],
      },
    });
  }

  get url() {
    return `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}`;
  }
}

module.exports = { SheetsClient };
