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

// Порядок <script src="…"> в index.html.
const scripts = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
const pos = (f) => scripts.indexOf(f);

test('index.html: нужные модули подключены', () => {
  for (const f of [
    'src/global-settings.js', 'src/day.js', 'src/player.js',
    'src/items.js', 'src/controls.js', 'src/combat-keys.js',
    'src/ui.js', 'src/sprites.js', 'src/combat-ui.js', 'src/save.js',
    'src/main.js',
  ]) {
    assert.notEqual(pos(f), -1, f + ' не подключён в index.html');
  }
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
