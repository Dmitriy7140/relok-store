'use strict';
/* Простые проверки алгоритма подбора (без тест-фреймворка).
   Запуск:  node server/codes/combination.test.js  */

const { findBestCombination } = require('./combination');

let passed = 0, failed = 0;
function eq(name, got, exp) {
  const g = JSON.stringify(got), e = JSON.stringify(exp);
  if (g === e) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name, '\n      got:', g, '\n      exp:', e); }
}
function ok(name, cond) {
  if (cond) { passed++; console.log('  ✓', name); }
  else { failed++; console.error('  ✗', name); }
}

// Большой склад — «условно бесконечный».
const big = {};
[250, 500, 750, 1000, 1500, 2000, 2500, 3000, 4000, 5000].forEach((d) => (big[d] = 100));

console.log('Подбор комбинации:');

// 1. Пример из ТЗ: 3449 → минимальная переплата даёт 3500.
{
  const r = findBestCombination(3449, big);
  ok('3449 → сумма 3500 (переплата 51)', r.ok && r.sum === 3500 && r.overpay === 51);
  // 3500 при минимуме кодов: 3000+500 или 2500+1000 или 2000+1500 = 2 кода.
  ok('3449 → ровно 2 кода', r.count === 2);
}

// 2. Точное совпадение номинала — 1 код, переплата 0.
{
  const r = findBestCombination(1000, big);
  ok('1000 → 1 код, переплата 0', r.ok && r.sum === 1000 && r.count === 1 && r.overpay === 0);
}

// 3. Ровно на номинал 250.
{
  const r = findBestCombination(250, big);
  eq('250 → [250×1]', r.items, [{ denom: 250, qty: 1 }]);
}

// 4. Учёт остатков: нет 3000, поэтому 3449 берём из имеющихся.
{
  const stock = { 3000: 0, 2500: 4, 1000: 3, 500: 2 };
  const r = findBestCombination(3449, stock);
  ok('3449 без 3000 → сумма ≥ 3449', r.ok && r.sum >= 3449);
  ok('3449 без 3000 → не использует 3000', !r.items.some((i) => i.denom === 3000));
  // Оптимум: 2500+1000 = 3500 (2 кода).
  ok('3449 без 3000 → 3500, 2 кода', r.sum === 3500 && r.count === 2);
}

// 5. Недостаточно подходящих номиналов: 619, склад только 1000/2000/5000.
{
  const stock = { 1000: 5, 2000: 5, 5000: 5 };
  const r = findBestCombination(619, stock);
  // Комбинация существует (1000 ≥ 619), но переплата велика — это НОРМАЛЬНО:
  // «недостаточно» = когда суммарного склада не хватает. Здесь хватает.
  ok('619 (только крупные) → 1000, 1 код', r.ok && r.sum === 1000 && r.count === 1);
}

// 6. Реальная нехватка склада: target больше суммы всего склада.
{
  const stock = { 250: 1, 500: 1 }; // всего 750
  const r = findBestCombination(1000, stock);
  ok('target 1000 > склад 750 → ok=false', !r.ok && r.reason === 'INSUFFICIENT_STOCK');
}

// 7. Тай-брейк по количеству: 2000 одним кодом лучше, чем 1000+1000.
{
  const stock = { 2000: 1, 1000: 5 };
  const r = findBestCombination(2000, stock);
  eq('2000 → один код 2000', r.items, [{ denom: 2000, qty: 1 }]);
}

// 8. Тай-брейк по редкости: при равной сумме/кол-ве беречь дефицитный номинал.
{
  // target 3000. Варианты по 1 коду: 3000(остаток 1, редкий) — но это ровно.
  // Возьмём случай, где две пары дают 3000 двумя кодами:
  // 1500+1500 (остаток 1500 = 10) vs 1000+2000 (2000 = 1, редкий).
  // Уберём одиночный 3000, чтобы решение было из 2 кодов.
  const stock = { 3000: 0, 1500: 10, 2000: 1, 1000: 10 };
  const r = findBestCombination(3000, stock);
  ok('3000 (редкость) → сумма 3000, 2 кода', r.sum === 3000 && r.count === 2);
  ok('3000 (редкость) → бережёт дефицитный 2000', !r.items.some((i) => i.denom === 2000));
}

// 9. Пустой склад.
{
  const r = findBestCombination(500, {});
  ok('пустой склад → ok=false', !r.ok);
}

console.log(`\nИтог: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
