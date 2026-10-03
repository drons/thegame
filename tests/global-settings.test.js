const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
// 000098: расширенное деструктурирование — новые ЧИСТЫЕ экспорты
// (META/DEFAULTS/clampValue/resetKey/resetAll); в RED-фазе = undefined
// (без throw — обращения только в телах тестов секции 000098 внизу).
const { SETTINGS, META, DEFAULTS, clampValue, resetKey, resetAll } =
  require('../src/global-settings.js');
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
  // Ре-пин пометка 000103: добавился ключ city_channel (параметры
  // городского канала src/map.js). Ре-пин 000079: добавились ключи
  // спутников (max_companions, companion_loyalty, companion_refusal).
  // Ре-пин 000082: добавился companion_xp_share (доля боевого опыта
  // выживших спутников, SPEC «Спутники» → «Опыт и уровни»).
  // Ре-пин 000109: добавился city_respawn_days (дней до
  // ПЕРЕГЕНЕРАЦИИ стока лавок города при входе, SPEC «Города и
  // деревни» → «Состояние, сейв, респаун»).
  // Точка конфликта с параллельным 000050 (combat_obstacle_*): при
  // ребейзе — union обоих наборов.
  assert.deepEqual(Object.keys(SETTINGS).sort(), [
    'city_channel', 'city_respawn_days', 'combat_difficulties',
    'combat_difficulty', 'combat_obstacle_max_frac',
    'combat_obstacle_min_frac',
    'companion_loyalty', 'companion_refusal', 'companion_xp_share',
    'dungeon_memory_days',
    'level_delta_max', 'max_companions', 'move_interval_ms',
    'points_per_level', 'respawn_days', 'steps_per_day',
  ]);
  for (const k of ['steps_per_day', 'respawn_days', 'dungeon_memory_days',
      'level_delta_max', 'points_per_level', 'move_interval_ms']) {
    assert.equal(typeof SETTINGS[k], 'number');
  }
  // Препятствия поля боя (задача 000050): доли клеток поля.
  assert.equal(typeof SETTINGS.combat_obstacle_min_frac, 'number');
  assert.equal(typeof SETTINGS.combat_obstacle_max_frac, 'number');
  assert.ok(SETTINGS.combat_obstacle_min_frac >= 0
    && SETTINGS.combat_obstacle_max_frac >= 0, 'доли неотрицательны');
  assert.ok(SETTINGS.combat_obstacle_min_frac <= SETTINGS.combat_obstacle_max_frac,
    'min_frac <= max_frac');
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
  // Препятствия поля боя (задача 000050): доля клеток, которую
  // занимают непроходимые клетки (мин/макс для броска).
  assert.equal(SETTINGS.combat_obstacle_min_frac, 0.10);
  assert.equal(SETTINGS.combat_obstacle_max_frac, 0.20);
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

// Задача 000079 (стадия красных тестов): параметры спутников
// (src/companions.js). SPEC.md «Спутники»: отряд до 3, старт лояльности
// 50 + Харизма, +2 за оплату, −20 за неоплату, пороги ухода 20/40 и
// 50% посередине; шанс отказа 30% − 2%/ур. Харизма − 5%/ур. Артист.
// Доли (не проценты) — как combat_difficulties. companion_xp_share
// НЕ здесь — добавляет 000082.
test('SETTINGS: ключи спутников (000079) — лимит, лояльность, отказ', () => {
  assert.equal(typeof SETTINGS.max_companions, 'number',
    'max_companions — число');
  assert.ok(Number.isInteger(SETTINGS.max_companions) &&
    SETTINGS.max_companions > 0, 'max_companions — целое > 0');
  assert.equal(SETTINGS.max_companions, 3, 'SPEC «Спутники»: отряд до 3');

  const loy = SETTINGS.companion_loyalty;
  assert.ok(loy && typeof loy === 'object' && !Array.isArray(loy),
    'companion_loyalty — объект параметров лояльности');
  assert.equal(loy.start, 50, 'старт лояльности 50');
  assert.equal(loy.paid, 2, '+2 за оплату');
  assert.equal(loy.unpaid, 20, '−20 за неоплату');
  assert.equal(loy.quit_low, 20, 'порог «уйдёт верно»');
  assert.equal(loy.quit_high, 40, 'порог «50%»');
  assert.equal(loy.quit_chance_mid, 0.5, '50% в полосе 21…40');
  // Здравый смысл (формулы ядра опираются на порядок величин)
  assert.ok(loy.start >= 0 && loy.start <= 100, 'старт в диапазоне 0…100');
  assert.ok(0 < loy.quit_low && loy.quit_low < loy.quit_high &&
    loy.quit_high < 100, '0 < quit_low < quit_high < 100');
  assert.ok(loy.paid > 0, 'оплата растит лояльность');
  assert.ok(loy.unpaid > 0, 'неоплата снижает лояльность');
  assert.ok(0 < loy.quit_chance_mid && loy.quit_chance_mid < 1,
    'шанс ухода в (0, 1)');

  const ref = SETTINGS.companion_refusal;
  assert.ok(ref && typeof ref === 'object' && !Array.isArray(ref),
    'companion_refusal — объект параметров отказа');
  assert.equal(ref.base, 0.30, 'база отказа 30%');
  assert.equal(ref.charisma_per_level, 0.02, '−2% за уровень Харизмы');
  assert.equal(ref.artist_per_level, 0.05, '−5% за уровень Артиста');
  assert.ok(ref.base >= 0 && ref.base <= 1, 'база-доля в [0, 1]');
  assert.ok(ref.charisma_per_level > 0 && ref.artist_per_level > 0,
    'доли за уровень положительны');
});

test('SETTINGS: companion_xp_share (000082) — доля боевого опыта выживших спутников', () => {
  // SPEC.md «Спутники» → «Опыт и уровни»: «каждый выживший спутник —
  // долю companion_xp_share (по умолчанию 50%)». Доля (не процент) —
  // как combat_difficulties.
  assert.equal(typeof SETTINGS.companion_xp_share, 'number',
    'companion_xp_share — число');
  assert.ok(SETTINGS.companion_xp_share >= 0
    && SETTINGS.companion_xp_share <= 1, 'доля в диапазоне [0, 1]');
  assert.equal(SETTINGS.companion_xp_share, 0.5, 'по умолчанию — 50%');
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

test('единый источник: доли препятствий в SETTINGS управляют генерацией (000050)', (t) => {
  // createCombat читает settings.SETTINGS live (паттерн level_delta_max)
  // — перезагрузка модуля не нужна.
  const C = require('../src/combat.js');
  const min0 = SETTINGS.combat_obstacle_min_frac;
  const max0 = SETTINGS.combat_obstacle_max_frac;
  t.after(() => {
    SETTINGS.combat_obstacle_min_frac = min0;
    SETTINGS.combat_obstacle_max_frac = max0;
  });
  // min = max = 0 → препятствий нет вообще (бросков нет — поток RNG
  // совпадает с боем без генерации, критично для снэпшот-тестов).
  SETTINGS.combat_obstacle_min_frac = 0;
  SETTINGS.combat_obstacle_max_frac = 0;
  const c0 = C.createCombat({
    player: P.createCharacter(), groupType: 3, seed: 1,
  });
  assert.ok(c0.obstacles instanceof Set, 'c.obstacles — Set «x,y»');
  assert.equal(c0.obstacles.size, 0, 'доли 0/0 → препятствий нет');

  // min = max > 0 → число ≤ round(frac × area) (бросок вырождается).
  SETTINGS.combat_obstacle_min_frac = 0.2;
  SETTINGS.combat_obstacle_max_frac = 0.2;
  const c1 = C.createCombat({
    player: P.createCharacter(), groupType: 3, seed: 1,
  });
  const area = c1.width * c1.height; // 7×7 = 49
  assert.ok(c1.obstacles.size > 0, 'доли 0.2/0.2 → препятствия есть');
  assert.ok(c1.obstacles.size <= Math.round(0.2 * area),
    'число не больше round(frac × area)');
});

// =====================================================================
// 000098 — Вкладка «Игровые настройки»: ядро META/DEFAULTS/clamp/reset
// =====================================================================
//
// ТЗ (tasks/pending/000098.md): НОВЫЕ ЧИСТЫЕ экспорты
// src/global-settings.js — META (таблица метаданных на ВСЕ ключи
// SETTINGS), DEFAULTS (frozen глубокий клон значений при загрузке),
// clampValue (валидация/кламп по dot-path, чистая), resetKey/resetAll
// (сброс к DEFAULTS, ссылка на SETTINGS НЕ меняется). Форма вкладки —
// src/ui-tab-settings.js (зона 000098, контракт 000130) — тестируется
// в tests/ui-panel.test.js (U1–U5). Контракты:
// memory/000098-game-settings-tab.md (ядро) +
// memory/000098-settings-tab.md (вкладка, session-only).
//
// RED (падают до реализации ядра, зелёные после):
//   * S1: META — ВСЕ ключи SETTINGS 1:1 + форма записи;
//   * S2: META — типы/границы корректны (int min; move_interval_ms
//     min 60 + sync с motion.js; enum = ключи combat_difficulties;
//     вложенные hp/damage float > 0; доли [0,1]; level_delta_max min 0);
//   * S3: DEFAULTS — frozen глубокий клон, НЕЗАВИСИМ от SETTINGS;
//   * S4: clampValue — мусор → отказ, вне диапазона → ближайшее
//     допустимое; positive ≤ 0 → отказ; dot-path; чистая;
//   * S5: resetKey/resetAll — значения из DEFAULTS, вложенные целиком,
//     ссылка на SETTINGS не меняется;
//   * S6: SETTINGS — живой объект (мутация видна без re-require);
//     DEFAULTS — независим (ФИКСАТОР: live-чтение ядра — 000099);
//   * S7: браузерный UMD-путь несёт те же экспорты (не смешивая Game).
//
// GREEN без изменений: все 14 тестов выше (первый deepEqual — 15 ключей;
// «единый источник»-тесты; структурный main.js).
//
// Мутации SETTINGS — с t.after-restore (объект общий на процесс;
// паттерн файла).

test('000098 RED: S1 — META покрывает ВСЕ ключи SETTINGS 1:1 + форма записи', () => {
  assert.ok(META && typeof META === 'object',
    'META — экспорт таблицы метаданных (ОТДЕЛЬНЫЙ объект от SETTINGS)');
  assert.deepEqual(Object.keys(META).sort(), Object.keys(SETTINGS).sort(),
    'ключи META = ключи SETTINGS 1:1 (динамика: будущие ключи — ' +
    'с обновлением META и ре-пином первого deepEqual-теста)');
  for (const [k, rec] of Object.entries(META)) {
    assert.ok(rec && typeof rec === 'object' && !Array.isArray(rec),
      k + ': запись — объект');
    assert.equal(typeof rec.label, 'string', k + ': label — строка (рус.)');
    assert.ok(rec.label.length > 0, k + ': label не пуст');
    assert.ok(['int', 'float', 'enum', 'nested'].includes(rec.type),
      k + ': type из домена int|float|enum|nested, есть «' +
      rec.type + '»');
    if (rec.min !== undefined) {
      assert.equal(typeof rec.min, 'number', k + ': min — число');
    }
    if (rec.max !== undefined) {
      assert.equal(typeof rec.max, 'number', k + ': max — число');
    }
    if (rec.options !== undefined) {
      assert.ok(Array.isArray(rec.options) ||
        typeof rec.options === 'string',
        k + ': options — статический массив или имя ключа SETTINGS ' +
        '(live-источник)');
    }
  }
});

test('000098 RED: S2 — META: типы и границы корректны (int/float/enum; вложенные)', () => {
  assert.ok(META && typeof META === 'object', 'META — экспорт');
  for (const k of ['steps_per_day', 'respawn_days', 'dungeon_memory_days',
      'level_delta_max', 'points_per_level', 'move_interval_ms']) {
    assert.equal(META[k].type, 'int', k + ': type int');
  }
  assert.equal(META.steps_per_day.min, 1,
    'steps_per_day min 1 (≤ 0 — БЕСКОНЕЧНЫЙ цикл while в day.js:54)');
  for (const k of ['respawn_days', 'dungeon_memory_days', 'points_per_level']) {
    assert.equal(META[k].min, 1, k + ': min 1');
  }
  assert.equal(META.level_delta_max.min, 0,
    'level_delta_max min 0 (0 — ВАЛИДНО: тест «±0» в этом файле; ' +
    'отклонение от формулы ТЗ «int ≥ 1» зафиксировано)');
  // move_interval_ms: [60, разумный максимум]. 60 = MIN_MOVE_INTERVAL_MS
  // (src/motion.js) — ниже «съедает» навык «Ловкий шаг» (memory/000063).
  assert.equal(META.move_interval_ms.min, 60,
    'move_interval_ms min 60 = MIN_MOVE_INTERVAL_MS');
  assert.equal(typeof META.move_interval_ms.max, 'number',
    'move_interval_ms max — число');
  assert.ok(Number.isFinite(META.move_interval_ms.max)
    && META.move_interval_ms.max > META.move_interval_ms.min,
    'move_interval_ms max — конечное > min');
  assert.ok(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'motion.js'), 'utf8')
      .includes('MIN_MOVE_INTERVAL_MS = 60'),
    'sync: src/motion.js содержит «MIN_MOVE_INTERVAL_MS = 60»');
  // Сложность — enum, options = LIVE-ключи combat_difficulties.
  assert.equal(META.combat_difficulty.type, 'enum',
    'combat_difficulty — enum');
  assert.equal(META.combat_difficulty.options, 'combat_difficulties',
    'combat_difficulty.options — имя ключа SETTINGS (live-источник)');
  assert.deepEqual(Object.keys(SETTINGS.combat_difficulties),
    ['easy', 'medium', 'hard'],
    'live-ключи combat_difficulties — easy/medium/hard');
  // Вложенные: на КАЖДУЮ сложность hp/damage — float > 0.
  const cd = META.combat_difficulties;
  assert.equal(cd.type, 'nested', 'combat_difficulties — nested');
  assert.ok(cd.subkeys && typeof cd.subkeys === 'object',
    'combat_difficulties.subkeys — объект');
  for (const d of ['easy', 'medium', 'hard']) {
    const dd = cd.subkeys[d];
    assert.ok(dd && dd.subkeys && typeof dd.subkeys === 'object',
      'сложность ' + d + ' — вложенная запись со subkeys');
    for (const f of ['hp', 'damage']) {
      const leaf = dd.subkeys[f];
      assert.ok(leaf, d + '.' + f + ' — запись есть');
      assert.equal(leaf.type, 'float', d + '.' + f + ' — float');
      assert.equal(leaf.positive, true,
        d + '.' + f + ' — positive (строго > 0: 0×HP ломает бой)');
    }
  }
  // Доли [0,1]: generic min=1 СЛОМАЛ бы доли — явные записи (000082).
  assert.equal(META.companion_xp_share.min, 0,
    'companion_xp_share min 0 (доля [0,1]; 0 — «не получают»)');
  for (const k of ['combat_obstacle_min_frac', 'combat_obstacle_max_frac']) {
    assert.equal(META[k].min, 0, k + ': min 0');
    assert.equal(META[k].max, 1, k + ': max 1 (доля)');
  }
});

test('000098 RED: S3 — DEFAULTS: frozen глубокий клон, НЕЗАВИСИМ от SETTINGS', (t) => {
  assert.ok(DEFAULTS && typeof DEFAULTS === 'object',
    'DEFAULTS — экспорт значений по умолчанию');
  // JSON-roundtrip (кросс-realm deepStrictEqual невозможен — паттерн
  // файла, тест «браузер: вешает Game.GlobalSettings»).
  assert.deepEqual(JSON.parse(JSON.stringify(DEFAULTS)),
    JSON.parse(JSON.stringify(SETTINGS)),
    'DEFAULTS = значения SETTINGS в момент загрузки модуля');
  assert.ok(Object.isFrozen(DEFAULTS), 'DEFAULTS — frozen');
  assert.ok(Object.isFrozen(DEFAULTS.combat_difficulties),
    'глубокий freeze: combat_difficulties');
  assert.ok(Object.isFrozen(DEFAULTS.combat_difficulties.easy),
    'глубокий freeze: combat_difficulties.easy');
  assert.ok(Object.isFrozen(DEFAULTS.city_channel),
    'глубокий freeze: city_channel');
  assert.ok(Object.isFrozen(DEFAULTS.companion_loyalty),
    'глубокий freeze: companion_loyalty');
  assert.ok(DEFAULTS.combat_difficulties !== SETTINGS.combat_difficulties,
    'глубина клона: вложенные объекты НЕ по ссылке');
  // Мутация SETTINGS → DEFAULTS не трогает (направление закрыто).
  const v = SETTINGS.steps_per_day;
  SETTINGS.steps_per_day = 99;
  t.after(() => { SETTINGS.steps_per_day = v; });
  assert.equal(DEFAULTS.steps_per_day, 40,
    'DEFAULTS не видит мутацию SETTINGS');
});

test('000098 RED: S4 — clampValue: мусор → отказ, вне диапазона → ближайшее, positive → отказ; чистая', () => {
  assert.equal(typeof clampValue, 'function', 'clampValue — экспорт');
  const before = JSON.stringify(SETTINGS);
  // int: 0/−5 → min 1; дробное → Math.round; clamped — признак заметки.
  const r1 = clampValue('steps_per_day', 0);
  assert.equal(r1.ok, true, '0 → принято (кламп в допустимое)');
  assert.equal(r1.value, 1, 'steps_per_day 0 → 1 (min)');
  assert.equal(r1.clamped, true, '0 — вне диапазона: clamped true');
  const r2 = clampValue('steps_per_day', -5);
  assert.equal(r2.ok, true, '−5 → принято (кламп)');
  assert.equal(r2.value, 1, 'steps_per_day −5 → 1');
  const r3 = clampValue('steps_per_day', 40.6);
  assert.equal(r3.ok, true);
  assert.equal(r3.value, 41, 'дробное 40.6 → 41 (int: Math.round)');
  assert.equal(r3.clamped, true,
    '40.6 ≠ 41: clamped true (округление — корректировка, заметка в UI)');
  // Дробное В ГРАНИЦЕ: 0.5 → round → 1 = min. Заметка ОБЯЗАНА быть
  // (clamped — значение изменилось): раньше clamped считался по
  // УЖЕ скруглённому значению (1 < 1 → false) — 0.5 → 1 проходило
  // БЕЗ заметки, тогда как '-0' → 1 — С заметкой (ревью 000098).
  const r10 = clampValue('steps_per_day', '0.5');
  assert.equal(r10.ok, true, '0.5 → принято (round в min)');
  assert.equal(r10.value, 1, '0.5 → 1 (int: round → min)');
  assert.equal(r10.clamped, true,
    '0.5 ≠ 1: clamped true (нарушение границы, заметка в UI)');
  // Мусор — value НЕ принимается (restore в UI) + reason.
  for (const junk of ['abc', '', NaN, Infinity, -Infinity]) {
    const r = clampValue('steps_per_day', junk);
    assert.equal(r.ok, false,
      'мусор ' + String(junk) + ' — отказ (value не принимается)');
    assert.equal(typeof r.reason, 'string',
      'мусор ' + String(junk) + ' — reason (заметка в UI)');
  }
  // move_interval_ms: [60, max].
  const r4 = clampValue('move_interval_ms', 10);
  assert.equal(r4.ok, true, '10 → принято (кламп)');
  assert.equal(r4.value, 60, 'move_interval_ms 10 → 60 (min)');
  const r5 = clampValue('move_interval_ms', 1e9);
  assert.equal(r5.ok, true, '1e9 → принято (кламп в max)');
  assert.equal(r5.value, META.move_interval_ms.max,
    'move_interval_ms 1e9 → max из META');
  assert.equal(r5.clamped, true, '1e9 — clamped true');
  // enum — только live-значения.
  const r6 = clampValue('combat_difficulty', 'hard');
  assert.equal(r6.ok, true, 'enum «hard» — ок');
  assert.equal(r6.value, 'hard');
  const r7 = clampValue('combat_difficulty', 'x');
  assert.equal(r7.ok, false, 'enum «x» — отказ');
  assert.equal(typeof r7.reason, 'string', 'enum «x» — reason');
  // Вложенные (dot-path): множители боя — float > 0: 0/−1 → ОТКАЗ
  // (у (0,∞) «ближайшего допустимого» нет).
  const hp = 'combat_difficulties.easy.hp';
  assert.equal(clampValue(hp, 0).ok, false,
    hp + ' = 0 — ОТКАЗ (positive: 0×HP = поломка боя)');
  assert.equal(clampValue(hp, -1).ok, false,
    hp + ' = −1 — ОТКАЗ (positive)');
  const r8 = clampValue(hp, 0.7);
  assert.equal(r8.ok, true, hp + ' = 0.7 — ок');
  assert.equal(r8.value, 0.7, hp + ' = 0.7 (float — без round)');
  assert.equal(r8.clamped, false, '0.7 — в допустимом: clamped false');
  assert.equal(clampValue(hp, 'abc').ok, false,
    hp + ' = «abc» — отказ (мусор во вложенном)');
  // Доли [0,1]: 5 → 1 (max).
  const r9 = clampValue('city_channel.fbm', 5);
  assert.equal(r9.ok, true, 'city_channel.fbm = 5 — принято (кламп)');
  assert.equal(r9.value, 1, 'city_channel.fbm 5 → 1 (max)');
  assert.equal(r9.clamped, true, 'fbm 5 — clamped true');
  assert.equal(JSON.stringify(SETTINGS), before,
    'clampValue — чистая: мутаций SETTINGS нет');
});

test('000098 RED: S5 — resetKey/resetAll: DEFAULTS, вложенные целиком, ссылка на SETTINGS не меняется', (t) => {
  assert.equal(typeof resetKey, 'function', 'resetKey — экспорт');
  assert.equal(typeof resetAll, 'function', 'resetAll — экспорт');
  const s0 = SETTINGS;
  t.after(() => { resetAll(); });
  // per-ключ: плоский.
  SETTINGS.steps_per_day = 9;
  resetKey('steps_per_day');
  assert.equal(SETTINGS.steps_per_day, 40,
    'resetKey(steps_per_day) → значение из DEFAULTS');
  // per-ключ: лист dot-path.
  SETTINGS.combat_difficulties.easy.hp = 0.9;
  resetKey('combat_difficulties.easy.hp');
  assert.equal(SETTINGS.combat_difficulties.easy.hp, 0.3,
    'resetKey(combat_difficulties.easy.hp) → 0.3 (dot-path)');
  // per-ключ: вложенный объект — ЦЕЛИКОМ (и клон, не ссылка).
  SETTINGS.combat_difficulties.hard.damage = 0.99;
  resetKey('combat_difficulties');
  assert.deepEqual(SETTINGS.combat_difficulties,
    JSON.parse(JSON.stringify(DEFAULTS.combat_difficulties)),
    'resetKey(combat_difficulties) — объект целиком = DEFAULTS');
  assert.ok(SETTINGS.combat_difficulties !== DEFAULTS.combat_difficulties,
    'вложенный — клон (DEFAULTS остаётся frozen)');
  // «Сбросить всё»: Object.assign-семантика, ссылка не меняется.
  SETTINGS.steps_per_day = 7;
  SETTINGS.combat_difficulties.medium.hp = 0.77;
  SETTINGS.companion_xp_share = 0.1;
  resetAll();
  assert.deepEqual(JSON.parse(JSON.stringify(SETTINGS)),
    JSON.parse(JSON.stringify(DEFAULTS)),
    'resetAll() → SETTINGS = DEFAULTS (JSON, вложенные целиком)');
  assert.equal(SETTINGS, s0, 'ссылка на SETTINGS НЕ меняется');
});

test('000098: S6 — SETTINGS: живой объект (мутация видна без re-require); DEFAULTS: независим (фиксатор: live-чтение ядра — 000099)', (t) => {
  const again = require('../src/global-settings.js');
  assert.equal(again.SETTINGS, SETTINGS,
    'SETTINGS — тот же объект при повторном require (без re-require)');
  assert.ok(DEFAULTS && typeof DEFAULTS === 'object', 'DEFAULTS — экспорт');
  assert.equal(again.DEFAULTS, DEFAULTS,
    'DEFAULTS — тот же объект при повторном require');
  const v = SETTINGS.points_per_level;
  const d0 = DEFAULTS.points_per_level;
  SETTINGS.points_per_level = 5;
  t.after(() => { SETTINGS.points_per_level = v; });
  assert.equal(again.SETTINGS.points_per_level, 5,
    'мутация SETTINGS видна без re-require (живой объект)');
  assert.equal(DEFAULTS.points_per_level, d0,
    'DEFAULTS не видит мутацию SETTINGS (независим)');
  // ФИКСАТОР: live-чтение SETTINGS ядром (day/player/dungeon/motion)
  // В МОМЕНТ ВЫЗОВА — НЕ ЭТОЙ задачей (000099): до неё ядро читает
  // снапшоты при загрузке — форма меняет значения, которые ядро видит
  // только после перезагрузки (формулировка ТЗ; live НЕ обещать).
});

test('000098 RED: S7 — браузерный UMD-путь несёт те же экспорты (Game не смешан)', () => {
  const sandbox = { Game: { Marker: 1 } };
  loadInSandbox('global-settings.js', sandbox);
  assert.equal(sandbox.Game.Marker, 1, 'Game не перезаписан');
  const gs = sandbox.Game.GlobalSettings;
  assert.ok(gs && typeof gs === 'object', 'Game.GlobalSettings — объект');
  for (const m of ['SETTINGS', 'META', 'DEFAULTS', 'clampValue',
      'resetKey', 'resetAll']) {
    assert.ok(gs[m] !== undefined,
      'браузерный экспорт несёт ' + m + ' (node = браузерная ветка)');
  }
  assert.equal(typeof gs.clampValue, 'function',
    'браузерный clampValue — функция');
  assert.equal(typeof gs.resetKey, 'function',
    'браузерный resetKey — функция');
  assert.equal(typeof gs.resetAll, 'function',
    'браузерный resetAll — функция');
});

test('000098: S8 — новый ключ SETTINGS БЕЗ записи в META: generic-фолбэк (тип по typeof, min = 1 для чисел), НЕ падает (ревью)', (t) => {
  // ТЗ «Что сделать» п.1: «ключ без записи в таблице → generic-запись
  // (тип по typeof SETTINGS[k], min = 1 для чисел) — новый ключ НЕ
  // падает». Ветка реализована (metaFor/genericMeta) но не была
  // закреплена тестом (ревью 000098). Временные ключи — с t.after-
  // restore (объект SETTINGS общий на процесс — паттерн файла).
  for (const k of ['tmp_future_float', 'tmp_future_int', 'tmp_future_str']) {
    assert.ok(!(k in SETTINGS), k + ' — отсутствует на старте');
  }
  SETTINGS.tmp_future_float = 2.5;
  SETTINGS.tmp_future_int = 7;
  SETTINGS.tmp_future_str = 'a';
  t.after(() => {
    delete SETTINGS.tmp_future_float;
    delete SETTINGS.tmp_future_int;
    delete SETTINGS.tmp_future_str;
  });
  // Число (не целое) → generic float, min 1.
  assert.doesNotThrow(() => clampValue('tmp_future_float', 3),
    'новый ключ — clampValue не бросает');
  assert.equal(clampValue('tmp_future_float', 3).value, 3,
    '3 в допустимом (min 1) — без изменений');
  const rf = clampValue('tmp_future_float', 0.5);
  assert.equal(rf.ok, true, 'generic float — не бросает');
  assert.equal(rf.value, 1, 'generic float min 1: 0.5 → 1');
  assert.equal(rf.clamped, true, '0.5 ≠ 1: clamped true (заметка)');
  // Число (целое) → generic int, min 1.
  const ri = clampValue('tmp_future_int', 0);
  assert.equal(ri.ok, true, 'generic int — не бросает');
  assert.equal(ri.value, 1, 'generic int min 1: 0 → 1');
  assert.equal(ri.clamped, true, '0 ≠ 1: clamped true (заметка)');
  // Строка → generic enum из [текущее значение].
  assert.equal(clampValue('tmp_future_str', 'a').ok, true,
    'enum [текущее]: текущее значение — ок');
  const rs = clampValue('tmp_future_str', 'z');
  assert.equal(rs.ok, false, 'enum [текущее]: чужое — отказ (не падает)');
  assert.equal(typeof rs.reason, 'string', 'отказ — с reason (заметка)');
});

// =====================================================================
// 000099 — Настройки применяются НА ЛЕТУ: ядро читает SETTINGS в
// момент ВЫЗОВА, а не снапшоты при загрузке модуля
// =====================================================================
//
// ТЗ (tasks/pending/000099.md): изменение значения во вкладке
// «Игровые настройки» (000098) действует БЕЗ перезагрузки: ядро
// читает Game.GlobalSettings.SETTINGS.* в момент ВЫЗОВА. Механизм —
// объект SETTINGS живёт, ссылка не меняется (000098: форма пишет в
// place, setByPath) → чтение `.SETTINGS.<ключ>` в теле функции видит
// мутацию БЕЗ re-require, в node (require) и в браузере (UMD/vm).
// Контракты: memory/000099-live-settings.md (точки, guard'ы, решения)
// + memory/000099-settings-live.md (само live-паттерн:
// opts > SETTINGS (live) > DEFAULTS > снапшот).
//
// Паттерн тестов: vm-песочница (loadInSandbox), мутация
// sandbox.Game.GlobalSettings.SETTINGS ПОСЛЕ загрузки БЕЗ re-require
// (тот же объект, что удерживает модуль; vm realm изолирован от
// node-SETTINGS → t.after-restore НЕ нужен, в отличие от node-тестов
// файла). Мутация ДО загрузки — ТОЛЬКО в guard-тестах R6/R7
// (двухэтапная схема: снапшот ≠ DEFAULTS — иначе тест не
// дискриминирует: fallback при битом значении = значение по
// умолчанию, однотактная «дефолт → 0» была бы зелёной и ДО
// реализации). Публичные оверрайды (opts/respawnDays/memoryDays)
// намеренно НЕ передаются — тесты попадают в live-значение
// по умолчанию; приоритет opts > SETTINGS (паттерн 000020) не
// переворачивается.
//
// RED (падают до реализации «снапшот → live», зелёные после):
//   * R1: live day.js createClock/addStep — steps_per_day в момент
//     вызова (getter и ТЕЛО addStep на СУЩЕСТВУЮЩИХ часах: main.js
//     создаёт часы один раз при старте);
//   * R2: live day.js dueForRespawn — respawn_days;
//   * R3: live player.js addXp — points_per_level (одна значимость
//     на вызов: начисление и возврат);
//   * R4: live dungeon.js generateDungeonContents — level_delta_max
//     (ABYSS-босс: level = player.level + delta, детерминирован —
//     без «удачи» RNG; ВСЕ мобы и босс);
//   * R5: live dungeon.js contentValid — dungeon_memory_days;
//   * R6: guard day.js — битые steps_per_day/respawn_days (0/0) →
//     DEFAULTS 40/3, НЕ while-зависание в addStep (критичный
//     hazard: guard ДО цикла);
//   * R7: guard player/dungeon — битые 0/−1/0 → DEFAULTS 2/3/3
//     (level_delta_max: guard ≥ 0 — 0 ВАЛИДНО, «±0»);
//   * R8: структурный main.js — const MOVE_INTERVAL_MS и все
//     call-sites убраны (\b: подстрока в MIN_MOVE_INTERVAL_MS не
//     считается), stepIntervalMs читает move_interval_ms ПРЯМО В
//     ТЕЛЕ (каждый кадр); fallback 140 — только при отсутствии
//     global-settings.js (guard 000063 без изменений).
//   * R9 (ревью): guard — SETTINGS = null/undefined ЦЕЛИКОМ (объект
//     заменён в рантайме, devtools) → хелперы НЕ бросают TypeError,
//     DEFAULTS — как при битом значении (main.js в той же задаче
//     уже null-safe: gs && … → 140; ядро приведено в соответствие —
//     ТЗ п.3 «подделанный/битый SETTINGS не роняет и не зависает»).
//
// GREEN без изменений: ВСЕ существующие тесты файла (re-require
// «единый источник», структурный main.js 281–298, S1–S8) +
// tests/day|player|dungeon|motion|combat. Кросс-realm массивы —
// JSON-roundtrip (разные Array.prototype, паттерн файла L97–99).

test('000099 RED: R1 — live: day.js createClock/addStep читают steps_per_day в момент вызова (vm, без re-require)', () => {
  const sandbox = {};
  loadInSandbox('global-settings.js', sandbox);
  loadInSandbox('day.js', sandbox);
  const c0 = sandbox.Game.createClock();
  assert.equal(c0.stepsPerDay, 40, 'sanity: дефолт 40');
  sandbox.Game.GlobalSettings.SETTINGS.steps_per_day = 7;
  const c = sandbox.Game.createClock();
  assert.equal(c.stepsPerDay, 7, 'live stepsPerDay (getter)');
  c.addStep(6);
  assert.equal(c.day, 1, '6 < 7 — день 1');
  c.addStep(1);
  assert.equal(c.day, 2, 'порог 7 — день 2');
  // live в ТЕЛЕ addStep: мутация ПОСЛЕ createClock меняет порог на
  // СУЩЕСТВУЮЩИХ часах (main.js создаёт createClock() один раз при
  // старте — только per-call даёт «без перезагрузки»).
  sandbox.Game.GlobalSettings.SETTINGS.steps_per_day = 5;
  c.addStep(5);
  assert.equal(c.day, 3, 'порог 5 по новому значению — день 3');
});

test('000099 RED: R2 — live: day.js dueForRespawn читает respawn_days в момент вызова (vm)', () => {
  const sandbox = {};
  loadInSandbox('global-settings.js', sandbox);
  loadInSandbox('day.js', sandbox);
  sandbox.Game.GlobalSettings.SETTINGS.respawn_days = 1;
  // Кросс-realm: массив из vm-песочницы НЕ deepStrictEqual хостовому
  // (разные Array.prototype) — JSON-roundtrip (паттерн файла L97–99).
  const due1 = sandbox.Game.dueForRespawn(new Map([['1,1', 5]]), 6);
  assert.deepEqual(JSON.parse(JSON.stringify(due1)), ['1,1'],
    'день+1 (6−5=1 ≥ 1) — уже пора');
  const due2 = sandbox.Game.dueForRespawn(new Map([['1,1', 5]]), 5);
  assert.deepEqual(JSON.parse(JSON.stringify(due2)), [],
    'тот же день (0 < 1) — ещё нет');
});

test('000099 RED: R3 — live: player.js addXp читает points_per_level в момент вызова (vm)', () => {
  const sandbox = {};
  loadInSandbox('global-settings.js', sandbox);
  loadInSandbox('skills-data.js', sandbox);
  loadInSandbox('player.js', sandbox);
  const c = sandbox.Game.createCharacter();
  sandbox.Game.GlobalSettings.SETTINGS.points_per_level = 5;
  const r = sandbox.Game.addXp(c, sandbox.Game.xpForNext(1));
  assert.equal(r.levelsGained, 1, 'ровно 1 уровень');
  assert.equal(r.pointsGained, 5, 'pointsGained live');
  assert.equal(c.points, 5, 'c.points live (старт 0)');
});

test('000099 RED: R4 — live: dungeon.js generateDungeonContents читает level_delta_max в момент вызова (vm, ABYSS-босс)', () => {
  const sandbox = {};
  for (const f of ['global-settings.js', 'perlin.js', 'mapseed.js',
      'map.js', 'dungeons-data.js', 'dungeon.js']) {
    loadInSandbox(f, sandbox);
  }
  // createDungeon(37, −12, тёмный альфа, HILL) → детерминированно
  // ABYSS (босс есть) — наблюдатель delta: уровень босса =
  // player.level + delta точно (без RNG), мобы — ±delta.
  const d = sandbox.Game.createDungeon(37, -12,
    sandbox.Game.syntheticPixels(8, 8, 128, 128, 128, 10),
    sandbox.Game.TERRAIN.HILL);
  assert.equal(d.type, sandbox.Game.DUNGEON_TYPES.ABYSS,
    'ABYSS (босс есть)');
  sandbox.Game.GlobalSettings.SETTINGS.level_delta_max = 0;
  const contents = sandbox.Game.generateDungeonContents(
    d, { totalXp: 12345, level: 15 });
  const boss = contents.mobs.find((m) => m.boss);
  assert.ok(boss, 'босс есть (ABYSS)');
  for (const m of contents.mobs) {
    assert.equal(m.level, 15,
      'моб ' + m.id + ' = 15 при delta 0 (получено ' + m.level + ')');
  }
});

test('000099 RED: R5 — live: dungeon.js contentValid читает dungeon_memory_days в момент вызова (vm)', () => {
  const sandbox = {};
  for (const f of ['global-settings.js', 'perlin.js', 'mapseed.js',
      'map.js', 'dungeons-data.js', 'dungeon.js']) {
    loadInSandbox(f, sandbox);
  }
  sandbox.Game.GlobalSettings.SETTINGS.dungeon_memory_days = 9;
  assert.equal(sandbox.Game.contentValid(1, 10), true,
    '10 ≤ 1+9 — живо (live 9)');
  assert.equal(sandbox.Game.contentValid(1, 4), true, '4 ≤ 10 — живо');
  assert.equal(sandbox.Game.contentValid(1, 11), false,
    '11 > 1+9 — протухло');
});

test('000099 RED: R6 — guard: битые steps_per_day/respawn_days → DEFAULTS (40/3), НЕ while-зависание (vm, двухэтапно)', () => {
  // ДВУХЭТАПНО: мутация ДО загрузки day.js (снапшот 7/1 ≠ DEFAULTS —
  // иначе тест не дискриминирует: fallback при битом значении равен
  // дефолту, однотактная «дефолт → 0» была бы зелёной и до
  // реализации), затем битые 0/0 ПОСЛЕ загрузки.
  const sandbox = {};
  loadInSandbox('global-settings.js', sandbox);
  sandbox.Game.GlobalSettings.SETTINGS.steps_per_day = 7;
  sandbox.Game.GlobalSettings.SETTINGS.respawn_days = 1;
  loadInSandbox('day.js', sandbox);
  sandbox.Game.GlobalSettings.SETTINGS.steps_per_day = 0;
  sandbox.Game.GlobalSettings.SETTINGS.respawn_days = 0;
  const c = sandbox.Game.createClock();
  // guard ДО while-цикла: 0 → DEFAULTS 40, НЕ зависание addStep.
  assert.equal(c.stepsPerDay, 40,
    'битое 0 → DEFAULTS 40 (не 7 — снапшот, не 0)');
  c.addStep(41);
  assert.equal(c.day, 2, 'порог 40: день 2');
  assert.equal(c.steps, 1, 'остаток 1');
  const due0 = sandbox.Game.dueForRespawn(new Map([['1,1', 5]]), 6);
  assert.deepEqual(JSON.parse(JSON.stringify(due0)), [],
    'respawn 0 → DEFAULTS 3: 6−5=1 < 3 — ещё нет');
});

test('000099 RED: R7 — guard: битые points_per_level/level_delta_max/dungeon_memory_days → DEFAULTS (2/3/3) (vm, двухэтапно)', () => {
  // ДВУХЭТАПНО (см. R6): снапшот 5/5/9 при загрузке ≠ DEFAULTS.
  const sandbox = {};
  loadInSandbox('global-settings.js', sandbox);
  sandbox.Game.GlobalSettings.SETTINGS.points_per_level = 5;
  sandbox.Game.GlobalSettings.SETTINGS.level_delta_max = 5;
  sandbox.Game.GlobalSettings.SETTINGS.dungeon_memory_days = 9;
  for (const f of ['perlin.js', 'mapseed.js', 'map.js', 'skills-data.js',
      'dungeons-data.js', 'player.js', 'dungeon.js']) {
    loadInSandbox(f, sandbox);
  }
  sandbox.Game.GlobalSettings.SETTINGS.points_per_level = 0;
  sandbox.Game.GlobalSettings.SETTINGS.level_delta_max = -1;
  sandbox.Game.GlobalSettings.SETTINGS.dungeon_memory_days = 0;
  const hero = sandbox.Game.createCharacter();
  const r = sandbox.Game.addXp(hero, sandbox.Game.xpForNext(1));
  assert.equal(r.levelsGained, 1, 'уровень начисляется');
  assert.equal(r.pointsGained, 2,
    'points 0 → DEFAULTS 2 (не 5 — снапшот, не 0)');
  const d = sandbox.Game.createDungeon(37, -12,
    sandbox.Game.syntheticPixels(8, 8, 128, 128, 128, 10),
    sandbox.Game.TERRAIN.HILL);
  const contents = sandbox.Game.generateDungeonContents(
    d, { totalXp: 999, level: 15 });
  const boss = contents.mobs.find((m) => m.boss);
  assert.ok(boss, 'босс есть (ABYSS)');
  assert.equal(boss.level, 18,
    'босс 15+3 (DEFAULTS; −1 невалиден — guard ≥ 0), не 15+5 (получено '
      + boss.level + ')');
  assert.equal(sandbox.Game.contentValid(1, 5), false,
    'memory 0 → DEFAULTS 3: 5 > 1+3 — протухло (не 1+9 — снапшот)');
});

test('000099 RED: R8 — структурный: main.js stepIntervalMs читает move_interval_ms live в теле; const MOVE_INTERVAL_MS убран; fallback 140 в теле', () => {
  const text = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  // \b — граница слова: «MIN_MOVE_INTERVAL_MS» (комментарии main.js,
  // G.MIN_MOVE_INTERVAL_MS из motion.js) НЕ считается — перед «M»
  // стоит «_» (символ слова). Пиним именно const и его call-sites
  // (L59–61, 72/74, 241, 1049, 1618).
  assert.ok(!/\bMOVE_INTERVAL_MS\b/.test(text),
    'const MOVE_INTERVAL_MS и все его использования убраны');
  const iFn = text.indexOf('function stepIntervalMs');
  assert.notEqual(iFn, -1, 'stepIntervalMs на месте');
  // Тело функции (до её закрывающей «  }»): live-чтение ключа из
  // SETTINGS + guard/fallback 140 (деградация без global-settings.js,
  // 000063) — каждый кадр, а не closure-const при загрузке.
  const iEnd = text.indexOf('\n  }', iFn);
  const body = text.slice(iFn, iEnd);
  assert.ok(body.includes('move_interval_ms'),
    'live-чтение move_interval_ms в теле stepIntervalMs');
  assert.ok(body.includes('140'),
    'fallback 140 в теле stepIntervalMs');
});

test('000099 RED: R9 — guard: SETTINGS = null/undefined ЦЕЛИКОМ (объект заменён в рантайме) → хелперы не бросают, DEFAULTS (vm, ревью)', () => {
  // Ревью (minor): все 5 live-хелперов читали
  // settings.SETTINGS.<ключ> без guard'а самого объекта; замена
  // ЦЕЛИКОГО объекта (devtools: Game.GlobalSettings.SETTINGS = null)
  // → TypeError в цикле rAF → игра зависает. main.js (ta же задача)
  // уже null-safe (gs && … → 140) — несогласованность закрыта.
  const sandbox = {};
  for (const f of ['global-settings.js', 'perlin.js', 'mapseed.js',
      'map.js', 'skills-data.js', 'dungeons-data.js', 'day.js',
      'player.js', 'dungeon.js']) {
    loadInSandbox(f, sandbox);
  }
  sandbox.Game.GlobalSettings.SETTINGS = null;
  // day.js: getter + ТЕЛО addStep (НЕ while-зависание) + dueForRespawn.
  const c = sandbox.Game.createClock();
  assert.equal(c.stepsPerDay, 40, 'null → DEFAULTS 40 (не TypeError)');
  c.addStep(41);
  assert.equal(c.day, 2, 'порог 40: день 2');
  assert.equal(c.steps, 1, 'остаток 1');
  const due0 = sandbox.Game.dueForRespawn(new Map([['1,1', 5]]), 6);
  assert.deepEqual(JSON.parse(JSON.stringify(due0)), [],
    'respawn → DEFAULTS 3: 6−5=1 < 3 — ещё нет');
  // player.js: addXp не бросает, очки → DEFAULTS.
  const hero = sandbox.Game.createCharacter();
  const r = sandbox.Game.addXp(hero, sandbox.Game.xpForNext(1));
  assert.equal(r.levelsGained, 1, 'уровень начисляется');
  assert.equal(r.pointsGained, 2, 'points → DEFAULTS 2');
  // dungeon.js: contentValid + ABYSS-босс (delta → DEFAULTS 3).
  assert.equal(sandbox.Game.contentValid(1, 4), true,
    'memory → DEFAULTS 3: 4 ≤ 1+3 — живо');
  assert.equal(sandbox.Game.contentValid(1, 5), false,
    '5 > 1+3 — протухло');
  const d = sandbox.Game.createDungeon(37, -12,
    sandbox.Game.syntheticPixels(8, 8, 128, 128, 128, 10),
    sandbox.Game.TERRAIN.HILL);
  const contents = sandbox.Game.generateDungeonContents(
    d, { totalXp: 12345, level: 15 });
  const boss = contents.mobs.find((m) => m.boss);
  assert.ok(boss, 'босс есть (ABYSS)');
  assert.equal(boss.level, 18,
    'босс 15+3 (DEFAULTS; объект null — не 15+15, не TypeError)');
  // undefined — та же ветка guard'а.
  sandbox.Game.GlobalSettings.SETTINGS = undefined;
  assert.equal(sandbox.Game.createClock().stepsPerDay, 40,
    'undefined → DEFAULTS 40');
});

// --- Задача 000109: сейв и респаун состояния города ---

test('000109 R4: новый ключ city_respawn_days — в SETTINGS (int, «несколько игровых дней») и в META (type int, min ≥ 1)', () => {
  // ТЗ «Что сделать» п.3: респаун города при входе —
  // `day − lastVisitDay >= city_respawn_days` → перегенерация стока.
  // Параметр — в глобальные настройки (симметрия: respawn_days=3,
  // dungeon_memory_days=3).
  assert.equal(typeof SETTINGS.city_respawn_days, 'number',
    'SETTINGS: city_respawn_days присутствует');
  assert.ok(Number.isInteger(SETTINGS.city_respawn_days),
    'city_respawn_days — целое (дни)');
  assert.ok(SETTINGS.city_respawn_days >= 2
    && SETTINGS.city_respawn_days <= 7,
    'city_respawn_days — «несколько игровых дней» (2..7, дефолт 3)');
  const m = META.city_respawn_days;
  assert.ok(m, 'META: запись city_respawn_days (META 1:1 с SETTINGS)');
  assert.equal(m.type, 'int', 'META: type — int');
  assert.equal(typeof m.label, 'string', 'META: label — строка');
  assert.ok(m.label.length > 0, 'META: label непустой');
  assert.ok(Number.isFinite(m.min) && m.min >= 1,
    'META: min ≥ 1 (дни — положительные целые)');
});
