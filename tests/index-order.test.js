// Регрессия порядка загрузки скриптов в index.html (задача 000018).
//
// Буг, который ловит этот файл: scripts в index.html стояли в порядке
// ui.js → controls.js, а IIFE в ui.js, собирающая Game.touchControls,
// начиналась с guard `if (!G.layoutTouchControls || !G.touchActionAt)
// return;` — в момент выполнения ui.js этих функций ещё не было (они
// живут в controls.js). Result: Game.touchControls === undefined всегда,
// D-pad и кнопка «E» не создавались НИКОГДА, на чистом тачскрине у
// игрока не было управления, а node-тесты ядра controls.js были зелёные
// (DOM-клей не покрывался).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const uiCode = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');
const controlsCode = fs.readFileSync(path.join(ROOT, 'src', 'controls.js'), 'utf8');
const combatKeysCode = fs.readFileSync(
  path.join(ROOT, 'src', 'combat-keys.js'), 'utf8');
// motion.js (задача 000033) в стадии красных тестов ещё не создан —
// читаем лениво, чтобы остальные тесты этого файла продолжали работать.
const motionPath = path.join(ROOT, 'src', 'motion.js');
const motionCode = fs.existsSync(motionPath)
  ? fs.readFileSync(motionPath, 'utf8') : null;

// Порядок <script src="…"> в index.html.
const scripts = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
const pos = (f) => scripts.indexOf(f);

test('index.html: нужные модули подключены', () => {
  for (const f of [
    'src/global-settings.js', 'src/day.js', 'src/player.js',
    'src/items.js', 'src/controls.js', 'src/combat-keys.js',
    'src/ui.js', 'src/sprites.js', 'src/combat-ui.js', 'src/save.js',
    'src/dungeon.js', 'src/dungeon-ui.js',
    'src/motion.js',
    'src/main.js',
  ]) {
    assert.notEqual(pos(f), -1, f + ' не подключён в index.html');
  }
});

test('index.html: controls.js ДО dungeon-ui.js (иначе Game.deltaForEvent не виден)', () => {
  // dungeon-ui.js снимает Game один раз при загрузке
  // (const G = globalThis.Game) и передаёт нажатия в
  // Game.deltaForEvent (controls.js, задача 000043). Битый порядок не
  // падаёт при загрузке, а ломает управление подземельем тихо —
  // поэтому порядок закреплён здесь, а guard с console.error ловит
  // остаток (tests/dungeon-ui.test.js). Паттерн пары
  // controls.js → combat-keys.js (задача 000048).
  assert.ok(
    pos('src/controls.js') < pos('src/dungeon-ui.js'),
    'src/controls.js должен быть раньше src/dungeon-ui.js (задача 000043)');
});

test('index.html: controls.js ДО ui.js (иначе Game.touchControls не создаётся)', () => {
  assert.ok(
    pos('src/controls.js') < pos('src/ui.js'),
    'src/controls.js должен быть ПОСЛЕДОВАТЕЛЬНО раньше src/ui.js: ' +
      'ui.js при загрузке собирает Game.touchControls из ' +
      'Game.layoutTouchControls/Game.touchActionAt (задача 000018)');
});

test('index.html: controls.js ДО combat-keys.js, combat-keys.js ДО combat-ui.js', () => {
  // combat-keys.js при ЗАГРУЗКЕ строит строки движения таблицы боя из
  // Game.CODE_DIRS/Game.DIR_DELTA (controls.js) — иначе console.error
  // и Game.CombatKeys не создаётся.
  assert.ok(
    pos('src/controls.js') < pos('src/combat-keys.js'),
    'src/controls.js должен быть раньше src/combat-keys.js (задача 000048)');
  // combat-ui.js при ЗАГРУЗКЕ читает Game.CombatKeys (guard с
  // console.error) и из него — keydown/кнопки.
  assert.ok(
    pos('src/combat-keys.js') < pos('src/combat-ui.js'),
    'src/combat-keys.js должен быть раньше src/combat-ui.js (задача 000048)');
});

test('index.html: sprites.js ДО combat-ui.js (иначе Game.hpBarColor не виден)', () => {
  // Буг (ревью 000038): каждый UMD-модуль ЗАМЕНЯЕТ объект Game —
  // root.Game = Object.assign({}, root.Game, factory(...)), — а
  // combat-ui.js снимает его один раз при загрузке
  // (const G = globalThis.Game). Функция из скрипта, загружающегося
  // ПОЗЖЕ (sprites.js давал Game.hpBarColor), через захваченный G
  // недоступна НИКОГДА — ленивый вызов в render() не спасает.
  // Результат: полоса HP героя всегда рисовалась фолбэком
  // '#6fdc6f', пороговые цвета (жёлтый/красный) не срабатывали.
  assert.ok(
    pos('src/sprites.js') < pos('src/combat-ui.js'),
    'src/sprites.js должен быть раньше src/combat-ui.js (задача 000038)');
});

test('index.html: ui.js и controls.js ДО main.js', () => {
  // main.js использует Game.playerUI/npcUI/touchControls (ui.js) и
  // Game.chooseControlsScheme/moveKeyForEvent/deltaForMoveKey (controls.js).
  assert.ok(pos('src/ui.js') < pos('src/main.js'));
  assert.ok(pos('src/controls.js') < pos('src/main.js'));
  // save.js — тоже до main.js (механизм сохранения).
  assert.ok(pos('src/save.js') < pos('src/main.js'));
});

test('index.html: motion.js ДО main.js (main.js снимает Game один раз)', () => {
  // main.js — IIFE: const G = globalThis.Game при ЗАГРУЗКЕ. motion.js
  // обязан дать Game.createMover/CAM_TAU_MS/MIN_MOVE_INTERVAL_MS ДО
  // main.js, иначе ловушка UMD (задачи 000018/000038): захваченный G
  // не увидит функции скриптов, загруженных позже.
  assert.notEqual(pos('src/motion.js'), -1,
    'src/motion.js не подключён в index.html (задача 000033)');
  assert.ok(pos('src/motion.js') < pos('src/main.js'),
    'src/motion.js должен быть раньше src/main.js (задача 000033)');
});

// Симуляция загрузки в node: скрипты игры — обычные <script> (не модули),
// каждый собирает globalThis/Game. ui.js при ЗАГРУЗКЕ DOM не трогает
// (контролы собираются в init()), поэтому его безопасно выполнить в node.

test('порядок controls.js → ui.js: Game.touchControls существует', () => {
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(controlsCode, sandbox, { filename: 'controls.js' });
  assert.ok(sandbox.Game.layoutTouchControls,
    'controls.js должен дать Game.layoutTouchControls');
  vm.runInContext(uiCode, sandbox, { filename: 'ui.js' });
  const tc = sandbox.Game.touchControls;
  assert.ok(tc, 'Game.touchControls должен существовать после ' +
    'controls.js + ui.js (в правильном порядке)');
  for (const m of ['init', 'show', 'hide', 'isActive', 'releaseAll']) {
    assert.equal(typeof tc[m], 'function', 'touchControls.' + m);
  }
});

test('порядок ui.js → controls.js (старый битый): touchControls нет, но ошибка видна', () => {
  // Воспроизведение исходного бага: ui.js раньше controls.js → guard
  // срабатывает. Теперь он не молча возвращает, а пишет console.error
  // (регрессия: «мёртвые контролы» должны быть заметны).
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(m) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(uiCode, sandbox, { filename: 'ui.js' });
  assert.equal(sandbox.Game.touchControls, undefined,
    'без controls.js контролы не собираются');
  assert.ok(errors.length > 0, 'guard обязан оставить след в консоли');
});

test('порядок controls.js → combat-keys.js: Game.CombatKeys существует', () => {
  // Таблица боя (задача 000048) при загрузке берёт строки движения
  // из Game.CODE_DIRS/Game.DIR_DELTA — в правильном порядке модуль
  // собирается без ошибок.
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(controlsCode, sandbox, { filename: 'controls.js' });
  vm.runInContext(combatKeysCode, sandbox, { filename: 'combat-keys.js' });
  const ck = sandbox.Game.CombatKeys;
  assert.ok(ck, 'Game.CombatKeys должен существовать после ' +
    'controls.js + combat-keys.js (в правильном порядке)');
  assert.ok(ck.COMBAT_KEYS, 'COMBAT_KEYS — таблица биндингов');
  assert.equal(typeof ck.resolveCombatKey, 'function', 'resolveCombatKey');
  assert.equal(typeof ck.describeCombatKeys, 'function', 'describeCombatKeys');
  // Движ. строки действительно из controls.js: KeyA — влево, как в мире.
  // (по полям, а не deepEqual: объекты из vm-контекста — чужой realm)
  assert.equal(ck.COMBAT_KEYS.KeyA.type, 'move');
  assert.equal(ck.COMBAT_KEYS.KeyA.dx, -1);
  assert.equal(ck.COMBAT_KEYS.KeyA.dy, 0);
});

test('порядок combat-keys.js → controls.js (битый): CombatKeys нет, ошибка видна', () => {
  // combat-keys.js раньше controls.js: Game.CODE_DIRS отсутствует →
  // guard пишет console.error (паттерн ui.js), CombatKeys не создаётся.
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(m) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(combatKeysCode, sandbox, { filename: 'combat-keys.js' });
  assert.equal(sandbox.Game.CombatKeys, undefined,
    'без controls.js таблица боя не строится');
  assert.ok(errors.length > 0, 'guard обязан оставить след в консоли');
});

test('motion.js (браузерная ветка UMD): даёт Game.createMover и константы', () => {
  // motion.js — чистый модуль без зависимостей (задача 000033): в
  // браузере обязан заменить root.Game, добавив ядро плавного движения,
  // — иначе main.js (IIFE, снимает Game при загрузке) не найдёт его.
  assert.ok(motionCode !== null,
    'src/motion.js должен существовать (задача 000033)');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(motionCode, sandbox, { filename: 'motion.js' });
  for (const name of ['clamp01', 'lerp', 'lerpPos', 'easeInOut',
    'stepProgress', 'cameraStep', 'moveIntervalMs', 'createMover']) {
    assert.equal(typeof sandbox.Game[name], 'function', 'Game.' + name);
  }
  assert.ok(Number.isFinite(sandbox.Game.CAM_TAU_MS) &&
    sandbox.Game.CAM_TAU_MS > 0, 'Game.CAM_TAU_MS — положительное число');
  assert.ok(Number.isFinite(sandbox.Game.MIN_MOVE_INTERVAL_MS) &&
    sandbox.Game.MIN_MOVE_INTERVAL_MS > 0, 'Game.MIN_MOVE_INTERVAL_MS > 0');
});

// --- Задача 000045: модули заклинаний ---
//
// spells.js при ЗАГРУЗКЕ снимает боевые internals (combat.js) и каталог
// (spells-data.js) с объекта Game; combat-ui.js/dungeon-ui.js/main.js
// снимают const G = globalThis.Game один раз при загрузке (UMD-ловушка,
// задача 000038) — поэтому: combat.js < spells-data.js < spells.js <
// combat-ui.js < main.js, и spells.js — после player.js (skillPractice).

const CORE_SCRIPTS = [
  'src/global-settings.js', 'src/perlin.js', 'src/mapseed.js',
  'src/skills-data.js', 'src/items-data.js', 'src/npc-data.js',
  'src/map.js', 'src/player.js', 'src/day.js', 'src/items.js',
  'src/buildings.js', 'src/npc.js',
];

test('index.html: spells-data.js и spells.js подключены в правильном порядке', () => {
  assert.notEqual(pos('src/spells-data.js'), -1, 'spells-data.js не подключён');
  assert.notEqual(pos('src/spells.js'), -1, 'spells.js не подключён');
  // Ядро: player.js (P) и combat.js (internals) — раньше spells.js.
  assert.ok(pos('src/player.js') < pos('src/spells.js'),
    'src/player.js должен быть раньше src/spells.js (задача 000045)');
  assert.ok(pos('src/combat.js') < pos('src/spells-data.js'),
    'src/combat.js должен быть раньше src/spells-data.js (задача 000045)');
  // Модули идут парой, данные раньше ядра.
  assert.ok(pos('src/spells-data.js') < pos('src/spells.js'),
    'src/spells-data.js должен быть раньше src/spells.js (задача 000045)');
  // UMD-ловушка: combat-ui.js и main.js снимают Game при загрузке —
  // spells.js должен быть РАНЕЕ них (иначе Game.Spells через их G
  // недоступна никогда).
  assert.ok(pos('src/spells.js') < pos('src/combat-ui.js'),
    'src/spells.js должен быть раньше src/combat-ui.js (задача 000045)');
  assert.ok(pos('src/spells.js') < pos('src/main.js'),
    'src/spells.js должен быть раньше src/main.js (задача 000045)');
});

test('порядок core → spells-data.js → spells.js: Game.Spells существует и кастует', () => {
  // Полный «браузерный» путь: ядро из index.html (до combat.js включительно)
  // + spells-data.js + spells.js. castSpell обязан работать в чужом realm —
  // иначе UMD-проводка (internals из Game) собрана неверно.
  const files = CORE_SCRIPTS.concat(
    'src/combat.js', 'src/spells-data.js', 'src/spells.js');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const Sp = sandbox.Game.Spells;
  assert.ok(Sp, 'Game.Spells должен существовать после правильного порядка');
  for (const k of ['SPELLS', 'SPELLS_BY_ID', 'getSpell', 'schoolRank',
    'bookOf', 'canLearn', 'learn', 'highestKnown', 'activeSpells',
    'castSpell', 'canCastSpell', 'sanitizeSpellBook']) {
    assert.ok(Sp[k] !== undefined, 'Game.Spells.' + k);
  }
  // Работоспособность в браузерном realm.
  const p = sandbox.Game.createCharacter();
  p.spells = ['spark'];
  p.primary.intelligence = 10;
  const c = sandbox.Game.createCombat(
    { player: p, mobs: ['wolf'], mobLevel: 1, seed: 5 });
  const w = c.units[0];
  w.x = c.px; w.y = c.py - 1;
  const r = Sp.castSpell(c, 'spark', w.id);
  assert.equal(r.ok, true,
    'castSpell работает в браузерном realm: ' + (r.reason || 'ok'));
});

test('порядок битый: spells.js без combat.js → Game.Spells нет, guard в консоли', () => {
  // spells.js раньше combat.js (или без него): боевые internals в Game
  // отсутствуют → guard пишет console.error (паттерн 000038), модуль не
  // создаётся — «мёртвая магия» должна быть заметна.
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(m) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  const files = CORE_SCRIPTS.concat('src/spells-data.js', 'src/spells.js');
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  assert.equal(sandbox.Game.Spells, undefined,
    'без combat.js Spells не создаётся');
  assert.ok(errors.length > 0, 'guard обязан оставить след в консоли');
});
