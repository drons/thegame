// Боевые клавиши (задача 000048): таблица COMBAT_KEYS, resolveCombatKey,
// describeCombatKeys — единый источник биндингов боя (src/combat-keys.js).
//
// Что ловят тесты:
//  * кириллические e.code в таблице — мёртвый код (задача 000028:
//    кириллических e.code не существует, 'KeyЦ'/'KeyЫ'/'KeyФ'/'KeyВ'
//    никогда не приходят в событии);
//  * каждое действие — минимум одна клавиша; одна клавиша — одно
//    назначение (две клавиши могут давать ОДНО действие — дубли);
//  * движение в бою = движение в мире: строки движения — из
//    Controls.CODE_DIRS × Controls.DIR_DELTA (8 физических клавиш);
//  * resolveCombatKey: невозможно действие — С причиной (fail-safe
//    без canDo: действие не выполняется молча); result — 'none'
//    (закрытие оверлея — логика UI, вне таблицы);
//  * source-регрессия: в UI-модулях не осталось кириллических code.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  COMBAT_KEYS, resolveCombatKey, describeCombatKeys, keyLabel,
} = require('../src/combat-keys.js');
const Controls = require('../src/controls.js');

const ROOT = path.join(__dirname, '..');
const ACTIONS = ['attack', 'fire', 'heal', 'block',
  'quickItem', 'invItem', 'flee', 'endTurn'];
const DEAD_CODES = ['KeyЦ', 'KeyЫ', 'KeyФ', 'KeyВ'];

// ---------------------------------------------------------------------------
// Таблица
// ---------------------------------------------------------------------------

test('таблица: все ключи — канонические e.code (кириллицы нет)', () => {
  assert.ok(Object.keys(COMBAT_KEYS).length > 0);
  for (const code of Object.keys(COMBAT_KEYS)) {
    // Канонические e.code: стрелки, Key<латиница>, Space.
    assert.match(code, /^Arrow(Up|Down|Left|Right)$|^Key[A-Z]$|^Space$/);
    assert.doesNotMatch(code, /[А-Яа-яЁё]/, code + ' — не канонический code');
  }
  for (const dead of DEAD_CODES) {
    assert.equal(COMBAT_KEYS[dead], undefined, 'мёртвая запись ' + dead);
  }
});

test('таблица: каждое действие — минимум одна клавиша, запись валидна', () => {
  const byAction = {};
  for (const [code, entry] of Object.entries(COMBAT_KEYS)) {
    if (entry.type === 'move') {
      // Шаг: единичный вектор в координатах мира.
      assert.ok(Number.isInteger(entry.dx) && Number.isInteger(entry.dy)
        && Math.abs(entry.dx) + Math.abs(entry.dy) === 1, code);
      assert.equal(entry.action, undefined, code + ' — move не действие');
    } else {
      assert.equal(entry.type, 'action');
      assert.ok(ACTIONS.includes(entry.action),
        'неизвестное действие ' + entry.action + ' (клавиша ' + code + ')');
      byAction[entry.action] = byAction[entry.action] || [];
      byAction[entry.action].push(code);
    }
  }
  for (const a of ACTIONS) {
    assert.ok(byAction[a] && byAction[a].length >= 1,
      'у действия «' + a + '» нет ни одной клавиши');
  }
  // Одна клавиша — ровно одна запись (JS-мапа: два назначения одной
  // клавиши структурно невозможны; проверено выше построчно).
});

test('движение: записи = Controls.CODE_DIRS × Controls.DIR_DELTA (8 клавиш)', () => {
  let fromControls = 0;
  for (const [code, dir] of Object.entries(Controls.CODE_DIRS)) {
    const d = Controls.DIR_DELTA[dir];
    assert.deepEqual(COMBAT_KEYS[code],
      { type: 'move', dx: d[0], dy: d[1] }, code);
    fromControls++;
  }
  const allMoves = Object.entries(COMBAT_KEYS)
    .filter(([, e]) => e.type === 'move');
  assert.equal(allMoves.length, fromControls,
    'движ. записи — ТОЛЬКО из controls.js, без собственных дублей');
  assert.equal(allMoves.length, 8, '8 физических клавиш (стрелки + WASD)');
});

test('движение: KeyW/KeyA/KeyS/KeyD и стрелки — 4 направления', () => {
  const st = { phase: 'player' };
  assert.deepEqual(resolveCombatKey('KeyW', st), { kind: 'move', dx: 0, dy: -1 });
  assert.deepEqual(resolveCombatKey('KeyA', st), { kind: 'move', dx: -1, dy: 0 });
  assert.deepEqual(resolveCombatKey('KeyS', st), { kind: 'move', dx: 0, dy: 1 });
  assert.deepEqual(resolveCombatKey('KeyD', st), { kind: 'move', dx: 1, dy: 0 });
  assert.deepEqual(resolveCombatKey('ArrowUp', st), { kind: 'move', dx: 0, dy: -1 });
  assert.deepEqual(resolveCombatKey('ArrowDown', st), { kind: 'move', dx: 0, dy: 1 });
  assert.deepEqual(resolveCombatKey('ArrowLeft', st), { kind: 'move', dx: -1, dy: 0 });
  assert.deepEqual(resolveCombatKey('ArrowRight', st), { kind: 'move', dx: 1, dy: 0 });
});

test('KeyA — влево и KeyD — вправо (решение 000048: как в мире)', () => {
  // До 000048 KeyA в бою перехватывался как «Удар» — физический Ф
  // на русской раскладке не двигал влево.
  assert.deepEqual(COMBAT_KEYS.KeyA, { type: 'move', dx: -1, dy: 0 });
  assert.deepEqual(COMBAT_KEYS.KeyD, { type: 'move', dx: 1, dy: 0 });
});

test('дубли: KeyK — то же действие, что KeyJ; KeyU — то же, что KeyT', () => {
  assert.equal(COMBAT_KEYS.KeyJ.action, 'attack');
  assert.equal(COMBAT_KEYS.KeyK.action, 'attack');
  assert.equal(COMBAT_KEYS.KeyK.action, COMBAT_KEYS.KeyJ.action);
  assert.equal(COMBAT_KEYS.KeyT.action, 'invItem');
  assert.equal(COMBAT_KEYS.KeyU.action, 'invItem');
  assert.equal(COMBAT_KEYS.KeyU.action, COMBAT_KEYS.KeyT.action);
});

test('primary: ровно одна первичная клавиша у действия с дублями', () => {
  const primaryCount = {};
  for (const [code, entry] of Object.entries(COMBAT_KEYS)) {
    if (entry.type !== 'action') continue;
    if (entry.primary) {
      primaryCount[entry.action] = (primaryCount[entry.action] || 0) + 1;
    }
  }
  assert.equal(primaryCount.attack, 1, 'attack: ровно одна primary');
  assert.equal(primaryCount.invItem, 1, 'invItem: ровно одна primary');
  for (const a of ['fire', 'heal', 'block', 'quickItem', 'flee', 'endTurn']) {
    assert.equal(primaryCount[a], undefined,
      a + ': одиночная клавиша без флага primary');
  }
  assert.equal(COMBAT_KEYS.KeyJ.primary, true, 'KeyJ — первичный «Удар»');
  assert.equal(COMBAT_KEYS.KeyT.primary, true, 'KeyT — первичный «Предмет»');
  assert.equal(COMBAT_KEYS.KeyK.primary, undefined);
  assert.equal(COMBAT_KEYS.KeyU.primary, undefined);
});

test('keyLabel: KeyJ → J; Space/ArrowUp — без изменений', () => {
  assert.equal(keyLabel('KeyJ'), 'J');
  assert.equal(keyLabel('KeyA'), 'A');
  assert.equal(keyLabel('Space'), 'Space');
  assert.equal(keyLabel('ArrowUp'), 'ArrowUp');
});

// ---------------------------------------------------------------------------
// resolveCombatKey
// ---------------------------------------------------------------------------

test('resolveCombatKey: неизвестный code — none', () => {
  const st = { phase: 'player' };
  assert.deepEqual(resolveCombatKey('KeyZ', st), { kind: 'none' });
  assert.deepEqual(resolveCombatKey('Digit1', st), { kind: 'none' });
  assert.deepEqual(resolveCombatKey('Escape', st), { kind: 'none' });
  assert.deepEqual(resolveCombatKey('Enter', st), { kind: 'none' });
  assert.deepEqual(resolveCombatKey(undefined, st), { kind: 'none' });
});

test('resolveCombatKey: KeyJ — action attack (после переноса с KeyA)', () => {
  assert.deepEqual(
    resolveCombatKey('KeyJ', { phase: 'player', canDo: { ok: true } }),
    { kind: 'action', action: 'attack' });
  // Дубль даёт то же действие.
  assert.deepEqual(
    resolveCombatKey('KeyK', { phase: 'player', canDo: { ok: true } }),
    { kind: 'action', action: 'attack' });
});

test('resolveCombatKey: фаза не игрока — действие с причиной', () => {
  // canDoAction возвращает reason дословно (задача 000037) — UI пишет
  // его в c.log, действие не выполняется.
  assert.deepEqual(
    resolveCombatKey('KeyJ',
      { phase: 'mob', canDo: { ok: false, reason: 'не ваш ход' } }),
    { kind: 'action', action: 'attack', reason: 'не ваш ход' });
  assert.deepEqual(
    resolveCombatKey('KeyQ',
      { phase: 'player',
        canDo: { ok: false, reason: 'не хватает маны (3)' } }),
    { kind: 'action', action: 'fire', reason: 'не хватает маны (3)' });
  // ok:false без reason — запасная формулировка.
  assert.deepEqual(
    resolveCombatKey('KeyQ', { phase: 'player', canDo: { ok: false } }),
    { kind: 'action', action: 'fire', reason: 'сейчас нельзя' });
});

test('resolveCombatKey: canDo отсутствует — fail-safe, не молча', () => {
  // Теми же формулировками, что checkTurn в ядре: 'over' —
  // «бой закончен», не-'player' — «не ваш ход».
  assert.deepEqual(resolveCombatKey('KeyJ', { phase: 'mob' }),
    { kind: 'action', action: 'attack', reason: 'не ваш ход' });
  assert.deepEqual(resolveCombatKey('KeyJ', { phase: 'over' }),
    { kind: 'action', action: 'attack', reason: 'бой закончен' });
  // Фаза игрока, но canDo не передан — «сейчас нельзя» (действие
  // НЕ выполняется: UI видит reason и пишет его в журнал).
  assert.deepEqual(resolveCombatKey('KeyJ', { phase: 'player' }),
    { kind: 'action', action: 'attack', reason: 'сейчас нельзя' });
  // Состояние не передано вовсе — тоже не молча.
  assert.deepEqual(resolveCombatKey('KeyJ', null),
    { kind: 'action', action: 'attack', reason: 'не ваш ход' });
});

test('resolveCombatKey: result — none (закрытие — логика UI)', () => {
  const over = { phase: 'over', result: { outcome: 'victory', xp: 0, gold: 0 } };
  // Space (конец хода), KeyJ (удар) и KeyA (шаг) после боя — вне игры:
  // оверлей закрывается Escape/Space/Enter — в UI, ДО таблицы.
  assert.deepEqual(resolveCombatKey('Space', over), { kind: 'none' });
  assert.deepEqual(resolveCombatKey('KeyJ', over), { kind: 'none' });
  assert.deepEqual(resolveCombatKey('KeyA', over), { kind: 'none' });
});

test('resolveCombatKey: движение при фазе mobа — всё равно move', () => {
  // Отклонение позиции-зависимо: playerMove сам проверит фазу/блок/
  // шаги/стену и вернёт reason — UI пишет его в журнал (000048).
  assert.deepEqual(resolveCombatKey('KeyA', { phase: 'mob' }),
    { kind: 'move', dx: -1, dy: 0 });
});

// ---------------------------------------------------------------------------
// describeCombatKeys
// ---------------------------------------------------------------------------

test('describeCombatKeys: 8 строк в порядке кнопок', () => {
  const items = describeCombatKeys();
  assert.equal(items.length, 8, 'ровно 8 действий');
  assert.deepEqual(items, [
    { action: 'attack', label: 'Удар',
      primaryKey: 'KeyJ', keys: ['KeyJ', 'KeyK'] },
    { action: 'fire', label: 'Огонь',
      primaryKey: 'KeyQ', keys: ['KeyQ'] },
    { action: 'heal', label: 'Исцел.',
      primaryKey: 'KeyR', keys: ['KeyR'] },
    { action: 'block', label: 'Блок',
      primaryKey: 'KeyB', keys: ['KeyB'] },
    { action: 'quickItem', label: 'Быстрый предмет',
      primaryKey: 'KeyE', keys: ['KeyE'] },
    { action: 'invItem', label: 'Предмет',
      primaryKey: 'KeyT', keys: ['KeyT', 'KeyU'] },
    { action: 'flee', label: 'Побег',
      primaryKey: 'KeyF', keys: ['KeyF'] },
    { action: 'endTurn', label: 'Конец хода',
      primaryKey: 'Space', keys: ['Space'] },
  ]);
});

test('describeCombatKeys: подписи кнопок — имя + клавиша в скобках', () => {
  // Бывший хардкод combat-ui.js: 'Удар [A]' → теперь 'Удар [J]'
  // («Удар» перенесён с KeyA на KeyJ, задача 000048); остальные — те же.
  const labels = describeCombatKeys()
    .map((i) => i.label + ' [' + keyLabel(i.primaryKey) + ']');
  assert.deepEqual(labels, [
    'Удар [J]', 'Огонь [Q]', 'Исцел. [R]', 'Блок [B]',
    'Быстрый предмет [E]', 'Предмет [T]', 'Побег [F]', 'Конец хода [Space]',
  ]);
});

// ---------------------------------------------------------------------------
// Source-регрессия (паттерн tests/index-order.test.js — чтение источников)
// ---------------------------------------------------------------------------

for (const f of ['src/combat-ui.js', 'src/dungeon-ui.js']) {
  test('source-регрессия: в ' + f + ' нет кириллических e.code', () => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const dead of DEAD_CODES) {
      assert.ok(!src.includes(dead),
        f + ': мёртвая запись ' + dead + ' (задача 000048)');
    }
  });
}

test('source-регрессия: main.js — ранний return по бою ДО обработки moveKey', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const kd = src.indexOf("window.addEventListener('keydown'");
  assert.notEqual(kd, -1, 'keydown в main.js не найден');
  const earlyReturn = src.indexOf(
    'if (G.combatUI && G.combatUI.isActive()) return;', kd);
  const moveKeyHandle = src.indexOf('const k = moveKey(e);', kd);
  assert.ok(earlyReturn > kd, 'ранний return по combatUI.isActive() не найден');
  assert.ok(moveKeyHandle > kd, 'обработка moveKey не найдена');
  assert.ok(earlyReturn < moveKeyHandle,
    'в бою мир не должен получать клавиши движения (задача 000048)');
});
