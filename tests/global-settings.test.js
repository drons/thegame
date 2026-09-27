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
    'level_delta_max', 'points_per_level', 'respawn_days', 'steps_per_day',
  ]);
  for (const k of ['steps_per_day', 'respawn_days', 'dungeon_memory_days',
      'level_delta_max', 'points_per_level']) {
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
