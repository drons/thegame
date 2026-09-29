const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SETTINGS } = require('../src/global-settings.js');
const P = require('../src/player.js');

// Перезагрузка модуля (обновляет значения, захваченные при загрузке,
// не трогая кэш global-settings.js — общий объект SETTINGS сохраняется).
function reload(p) {
  const abs = require.resolve(p);
  delete require.cache[abs];
  return require(abs);
}

// «Браузерный» путь UMD: исполняем файл в чистом контексте без module/exports.
function loadInSandbox(file, sandbox) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  vm.runInNewContext(code, sandbox || {});
}

test('модуль: CommonJS-экспорт { SETTINGS } — все настраиваемые параметры', () => {
  assert.equal(typeof SETTINGS, 'object');
  assert.deepEqual(Object.keys(SETTINGS).sort(), [
    'combat_difficulties', 'combat_difficulty', 'dungeon_memory_days',
    'level_delta_max', 'move_interval_ms', 'points_per_level',
    'respawn_days', 'steps_per_day',
  ]);
  for (const k of ['steps_per_day', 'respawn_days', 'dungeon_memory_days',
      'level_delta_max', 'points_per_level', 'move_interval_ms']) {
    assert.equal(typeof SETTINGS[k], 'number');
  }
  // Сложность боя (задача 000027): текущая сложность + таблица множителей.
  assert.equal(typeof SETTINGS.combat_difficulty, 'string');
  assert.equal(SETTINGS.combat_difficulty, 'medium');
  for (const [name, d] of Object.entries(SETTINGS.combat_difficulties)) {
    assert.equal(typeof d.hp, 'number', `${name}.hp`);
    assert.equal(typeof d.damage, 'number', `${name}.damage`);
    assert.ok(d.hp > 0 && d.damage > 0, `${name}: множители положительны`);
  }
});

test('значения по умолчанию совпадают со SPEC.md', () => {
  assert.equal(SETTINGS.steps_per_day, 40);      // «Игровое время»
  assert.equal(SETTINGS.respawn_days, 3);        // «Мобы»
  assert.equal(SETTINGS.dungeon_memory_days, 3); // «Мобы»
  assert.equal(SETTINGS.level_delta_max, 3);     // «Мобы»
  assert.equal(SETTINGS.points_per_level, 2);    // «Навыки»
});

test('значения по умолчанию: move_interval_ms (задача 000063)', () => {
  // Задача 000063: базовая СКОРОСТЬ передвижения по глобальной карте —
  // в глобальные настройки и уменьшена в три раза (движение стало
  // «очень быстрым» после 000033). Скорость = 1/интервал шага, значит
  // интервал умножается на 3: 140 мс → 140 * 3 = 420 мс. НЕ 140 / 3 —
  // это УСКОРИЛО бы в 3 раза (и уперлось бы в MIN_MOVE_INTERVAL_MS=60,
  // убивая «Ловкий шаг»).
  // В SPEC.md базовая скорость не закреплена числом (только Ловкость →
  // «Скорость перемещения по карте», строки 325/367) — дефолт задаёт
  // задача 000063 (прецедент: combat_difficulty, задача 000027).
  assert.ok(SETTINGS.move_interval_ms > 0, 'положительный интервал шага');
  assert.equal(SETTINGS.move_interval_ms, 140 * 3,
    'ровно в 3 раза МЕДЛЕННЕЕ старого 140 мс (интервал ×3 = 420 мс)');
});

test('браузер: вешает Game.GlobalSettings на root, не ломая Game', () => {
  const sandbox = { Game: { Marker: 1 } };
  loadInSandbox('global-settings.js', sandbox);
  assert.equal(sandbox.Game.Marker, 1);
  assert.ok(sandbox.Game.GlobalSettings);
  // JSON-конвертация: объект из другого realm не сравнить deepStrictEqual.
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.Game.GlobalSettings.SETTINGS)), SETTINGS);
});

test('браузер: зависимые модули без global-settings.js — понятная ошибка', () => {
  for (const [file, msg] of [
    ['day.js', 'day.js: не найдены глобальные настройки'],
    ['dungeon.js', 'dungeon.js: не найдены глобальные настройки'],
    ['combat.js', 'combat.js: не найдены глобальные настройки'],
  ]) {
    const sandbox = {};
    assert.throws(() => loadInSandbox(file, sandbox), msg);
  }
});

test('единый источник: day.js читает steps_per_day и respawn_days', (t) => {
  const D1 = reload('../src/day.js');
  assert.equal(D1.STEPS_PER_DAY, SETTINGS.steps_per_day);
  assert.equal(D1.RESPAWN_DAYS, SETTINGS.respawn_days);

  SETTINGS.steps_per_day = 7;
  SETTINGS.respawn_days = 1;
  t.after(() => { SETTINGS.steps_per_day = 40; SETTINGS.respawn_days = 3; });

  const D2 = reload('../src/day.js');
  assert.equal(D2.STEPS_PER_DAY, 7);
  assert.equal(D2.RESPAWN_DAYS, 1);
  const c = D2.createClock();
  assert.equal(c.stepsPerDay, 7);
  c.addStep(6);
  assert.equal(c.day, 1);
  c.addStep(1); // порог 7 → день 2
  assert.equal(c.day, 2);
  // респаун: при respawn_days = 1 группа возвращается на следующий день
  assert.deepEqual(D2.dueForRespawn(new Map([['1,1', 5]]), 6), ['1,1']);
  assert.deepEqual(D2.dueForRespawn(new Map([['1,1', 5]]), 5), []);
});

test('единый источник: player.js читает points_per_level', (t) => {
  const P1 = reload('../src/player.js');
  assert.equal(P1.POINTS_PER_LEVEL, SETTINGS.points_per_level);

  SETTINGS.points_per_level = 5;
  t.after(() => { SETTINGS.points_per_level = 2; });

  const P2 = reload('../src/player.js');
  assert.equal(P2.POINTS_PER_LEVEL, 5);
  const c = P2.createCharacter();
  const r = P2.addXp(c, P2.xpForNext(1)); // ровно 1 уровень вверх
  assert.equal(r.levelsGained, 1);
  assert.equal(r.pointsGained, 5);
});

test('единый источник: dungeon.js читает dungeon_memory_days и level_delta_max', (t) => {
  const G1 = reload('../src/dungeon.js');
  assert.equal(G1.DUNGEON_MEMORY_DAYS, SETTINGS.dungeon_memory_days);
  assert.equal(G1.LEVEL_DELTA_MAX, SETTINGS.level_delta_max);

  SETTINGS.dungeon_memory_days = 9;
  SETTINGS.level_delta_max = 1;
  t.after(() => { SETTINGS.dungeon_memory_days = 3; SETTINGS.level_delta_max = 3; });

  const G2 = reload('../src/dungeon.js');
  assert.equal(G2.DUNGEON_MEMORY_DAYS, 9);
  assert.equal(G2.LEVEL_DELTA_MAX, 1);
});

test('единый источник: разброс уровня мобов в combat.js = level_delta_max', (t) => {
  const C = reload('../src/combat.js');
  const makeHero = (level) => { const c = P.createCharacter(); c.level = level; return c; };

  // По умолчанию (level_delta_max = 3) мобы в пределах персонажа ± 3.
  let c = C.createCombat({ player: makeHero(20), groupType: 0, seed: 1 });
  for (const u of c.units) {
    assert.ok(Math.abs(u.level - 20) <= 3, `моб ${u.mobId} в ±3 от уровня 20`);
  }

  // Явный opts.levelDeltaMax переопределяет настройку.
  c = C.createCombat({ player: makeHero(20), groupType: 0, seed: 1, levelDeltaMax: 0 });
  for (const u of c.units) assert.equal(u.level, 20);

  // Настройка level_delta_max = 0 → все мобы точно уровня персонажа.
  SETTINGS.level_delta_max = 0;
  t.after(() => { SETTINGS.level_delta_max = 3; });
  const C2 = reload('../src/combat.js');
  c = C2.createCombat({ player: makeHero(15), groupType: 3, seed: 42 });
  for (const u of c.units) assert.equal(u.level, 15);
});

// Задача 000103 (стадия красных тестов): параметры городского канала
// размещения (src/map.js). SPEC.md («Города и деревни» → «Размещение»)
// предписывает «параметры — global-settings»: порог редкости города
// (fbm/rarity) и доли частоты типов (хутор част, столица редка).
// Тест падает, пока SETTINGS.city_channel не добавлен.
test('SETTINGS.city_channel (000103): порог редкости и доли частоты типов городов', () => {
  const cc = SETTINGS.city_channel;
  assert.ok(cc && typeof cc === 'object' && !Array.isArray(cc),
    'SETTINGS.city_channel — объект (параметры городского канала)');
  // Порог: город РЕЖЕ обычной постройки — свой порог по тому же
  // fbm/rarity, что у слотового якоря (0.33 + 0.14·rarity).
  assert.equal(typeof cc.fbm, 'number', 'fbm — число');
  assert.ok(cc.fbm >= 0 && cc.fbm <= 1, 'fbm-порог в [0,1]');
  assert.equal(typeof cc.rarity, 'number', 'rarity — число');
  assert.ok(cc.rarity >= 0 && cc.rarity <= 1, 'rarity-порог в [0,1]');
  // Доли частоты типов: пары [id, share] РОВНО для 4 типов «город»
  // каталога (000102: 51 Хутор, 52 Деревня, 53 Город, 54 Столица),
  // по возрастанию id (порядок кумулятивного выбора типа).
  assert.ok(Array.isArray(cc.type_shares), 'type_shares — массив пар');
  assert.deepEqual(cc.type_shares.map((p) => p[0]), [51, 52, 53, 54],
    'доли — ровно для 4 типов «город», по возрастанию id');
  let sum = 0;
  for (const pair of cc.type_shares) {
    assert.ok(Array.isArray(pair) && pair.length === 2, 'пара [id, share]');
    assert.equal(typeof pair[1], 'number', 'share — число');
    assert.ok(pair[1] >= 0 && pair[1] <= 1, 'share в [0,1]');
    sum += pair[1];
  }
  assert.ok(Math.abs(sum - 1) < 1e-9, `Σshare = 1 (сумма ${sum})`);
  // «Город реже»: городское условие срабатывает ТОЛЬКО где сработал бы
  // слотовый — порог города НЕ НИЖЕ порога слота (0.33 + 0.14·r) при
  // ВСЕХ rarity ∈ [0,1] (property-проверка по сетке r). Иначе города
  // рождались бы «из ничего» на тайлах без якоря.
  for (let i = 0; i <= 20; i++) {
    const r = i / 20;
    assert.ok(cc.fbm + cc.rarity * r >= 0.33 + 0.14 * r,
      `при rarity=${r}: порог города (${(cc.fbm + cc.rarity * r).toFixed(3)}) ` +
      `ниже порога слота (${(0.33 + 0.14 * r).toFixed(3)})`);
  }
});

test('единый источник: main.js читает move_interval_ms (структурный)', () => {
  // main.js — DOM/WebGL-клей, в node не грузится (устоявшийся паттерн
  // проекта, см. tests/map.test.js «структурный»): фиксируем текст.
  // Константа MOVE_INTERVAL_MS должна читаться из Game.GlobalSettings
  // (единый источник, паттерн 000020); старый хардкод
  // «const MOVE_INTERVAL_MS = 140;» исчезает. Число 140 в main.js при
  // этом ДОПУСТИМО как fallback в guard'е (деградация без
  // global-settings.js — старое поведение, паттерн 000033 с
  // G.createMover), поэтому ищем именно старое объявление константы.
  const text = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.ok(text.includes('GlobalSettings'),
    'main.js читает Game.GlobalSettings');
  assert.ok(text.includes('move_interval_ms'),
    'ключ move_interval_ms присутствует в main.js');
  assert.ok(!text.includes('const MOVE_INTERVAL_MS = 140'),
    'старый хардкод «const MOVE_INTERVAL_MS = 140» удалён');
});
