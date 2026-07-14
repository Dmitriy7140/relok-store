'use strict';
/* ═══════════════════════════════════════════════════════════════
   МОДУЛЬ — Подбор нужного товара среди кандидатов PS Store.

   Задача: из списка Product'ов, найденных по названию, выбрать
   тот, что соответствует конкретной строке магазина, учитывая
   ИЗДАНИЕ (Standard / Deluxe / Ultimate / GOTY …).

   Алгоритм:
     1. Нормализуем названия (регистр, пунктуация, ™/®, издания).
     2. Считаем схожесть по пересечению токенов (0..1).
     3. Добавляем бонус/штраф за совпадение издания.
     4. Лучший кандидат со score ≥ minScore считается найденным,
        иначе строка получит статус «Требуется проверка».
   ═══════════════════════════════════════════════════════════════ */

const config = require('./config');

// Ключевые слова изданий и их синонимы на сайте PS Store.
const EDITION_KEYWORDS = {
  standard: ['standard'],
  deluxe: ['deluxe', 'digital deluxe'],
  ultimate: ['ultimate'],
  gold: ['gold'],
  premium: ['premium'],
  complete: ['complete'],
  goty: ['goty', 'game of the year'],
  directorscut: ["director's cut", 'directors cut', 'director’s cut'],
};

/** Приводит строку к сравнимому виду. */
function normalize(str) {
  return (str || '')
    .toLowerCase()
    .replace(/[™®©]/g, ' ')
    .replace(/[:\-–—_,.!?'’"()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Определяет «класс» издания по произвольному тексту. */
function detectEdition(text) {
  const n = normalize(text);
  for (const [cls, words] of Object.entries(EDITION_KEYWORDS)) {
    if (words.some((w) => n.includes(normalize(w)))) return cls;
  }
  return 'standard'; // по умолчанию — базовое издание
}

/** Убирает из названия слова изданий, чтобы сравнивать «чистые» имена. */
function stripEditionWords(text) {
  let n = normalize(text);
  const allWords = Object.values(EDITION_KEYWORDS).flat().concat(['edition', 'digital']);
  for (const w of allWords) n = n.replace(normalize(w), ' ');
  return n.replace(/\s+/g, ' ').trim();
}

/** Схожесть по токенам (пересечение / объединение — индекс Жаккара). */
function tokenSimilarity(a, b) {
  const sa = new Set(a.split(' ').filter(Boolean));
  const sb = new Set(b.split(' ').filter(Boolean));
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  const union = sa.size + sb.size - inter;
  return inter / union;
}

/**
 * Оценивает пару (игра магазина ↔ кандидат PS Store) числом 0..1.
 * @param {{name:string, edition:string}} game
 * @param {{name:string}} candidate
 */
function scorePair(game, candidate) {
  const gameBase = stripEditionWords(game.name);
  const candBase = stripEditionWords(candidate.name);

  // Базовая схожесть имён без учёта издания.
  let score = tokenSimilarity(gameBase, candBase);

  // Полное вхождение более короткого имени в более длинное — сильный сигнал.
  if (gameBase && candBase && (candBase.includes(gameBase) || gameBase.includes(candBase))) {
    score = Math.max(score, 0.8);
  }

  // Учитываем издание.
  const wantEdition = detectEdition(game.edition || game.name);
  const gotEdition = detectEdition(candidate.name);
  if (wantEdition === gotEdition) {
    score += 0.15; // нужное издание — бонус
  } else {
    score -= 0.2; // чужое издание — штраф
  }

  return Math.max(0, Math.min(1, score));
}

/**
 * Выбирает лучший товар из кандидатов.
 * @param {{name:string, edition:string}} game
 * @param {Array} candidates  результаты psStore.searchGames()
 * @returns {{ match: object|null, score: number }}
 */
function pickBest(game, candidates) {
  let best = null;
  let bestScore = 0;

  for (const c of candidates) {
    const s = scorePair(game, c);
    if (s > bestScore) {
      bestScore = s;
      best = c;
    }
  }

  const ok = best && bestScore >= config.matching.minScore;
  return { match: ok ? best : null, score: bestScore };
}

module.exports = { pickBest, scorePair, normalize, detectEdition };
