// Тесты маппинга клавиш→направление (задача 000028, src/controls.js).
// Ключевой регрессионный сценарий: таблица по e.code не может содержать
// «кириллические code» — e.code не зависит от раскладки, и значения
// вроде «KeyЦ» никогда не приходят от браузера (раньше они были в
// main.js мёртвыми/перепутанными связками).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  DIRS, DIR_DELTA, CODE_DIRS, KEY_DIRS,
  moveKeyForEvent, deltaForMoveKey, deltaForEvent,
} = require('../src/controls.js');

test('DELTA: y растёт вниз (мировые координаты)', () => {
  assert.deepEqual(DIR_DELTA.up, [0, -1]);
  assert.deepEqual(DIR_DELTA.down, [0, 1]);
  assert.deepEqual(DIR_DELTA.left, [-1, 0]);
  assert.deepEqual(DIR_DELTA.right, [1, 0]);
  assert.deepEqual(DIRS, ['up', 'down', 'left', 'right']);
});

test('стрелки (e.code) → направления', () => {
  assert.equal(moveKeyForEvent({ code: 'ArrowUp' }), 'ArrowUp');
  assert.equal(moveKeyForEvent({ code: 'ArrowDown' }), 'ArrowDown');
  assert.equal(moveKeyForEvent({ code: 'ArrowLeft' }), 'ArrowLeft');
  assert.equal(moveKeyForEvent({ code: 'ArrowRight' }), 'ArrowRight');
  assert.deepEqual(deltaForEvent({ code: 'ArrowUp' }), [0, -1]);
  assert.deepEqual(deltaForEvent({ code: 'ArrowDown' }), [0, 1]);
  assert.deepEqual(deltaForEvent({ code: 'ArrowLeft' }), [-1, 0]);
  assert.deepEqual(deltaForEvent({ code: 'ArrowRight' }), [1, 0]);
});

test('WASD по физической клавише (e.code) → направления', () => {
  assert.deepEqual(deltaForEvent({ code: 'KeyW' }), [0, -1]);
  assert.deepEqual(deltaForEvent({ code: 'KeyA' }), [-1, 0]);
  assert.deepEqual(deltaForEvent({ code: 'KeyS' }), [0, 1]);
  assert.deepEqual(deltaForEvent({ code: 'KeyD' }), [1, 0]);
});

test('регистр e.key не важен (русские символы, фолбэк по символу)', () => {
  // code не несёт информации (виртуальная клавиатура) — срабатывает key.
  assert.deepEqual(deltaForEvent({ code: 'Unidentified', key: 'ц' }), [0, -1]);
  assert.deepEqual(deltaForEvent({ code: 'Unidentified', key: 'ф' }), [-1, 0]);
  assert.deepEqual(deltaForEvent({ code: 'Unidentified', key: 'ы' }), [0, 1]);
  assert.deepEqual(deltaForEvent({ code: 'Unidentified', key: 'в' }), [1, 0]);
  // Заглавные (Shift удержан) — те же направления.
  assert.deepEqual(deltaForEvent({ code: 'Unidentified', key: 'Ц' }), [0, -1]);
  assert.deepEqual(deltaForEvent({ code: 'Unidentified', key: 'В' }), [1, 0]);
});

test('e.code приоритетнее e.key (физическая клавиша — авторитет)', () => {
  // Физическая W в русской раскладке: code KeyW, key «ц» — оба «вверх»,
  // но id берётся из code.
  assert.equal(moveKeyForEvent({ code: 'KeyW', key: 'ц' }), 'KeyW');
  assert.deepEqual(deltaForEvent({ code: 'KeyW', key: 'ц' }), [0, -1]);
});

test('регрессия: «кириллические code» не существуют и не маппятся', () => {
  // Браузер НИКОГДА не отдаст такие e.code (code не зависит от раскладки)
  // — раньше эти значения стояли в таблице main.js и были мёртвыми.
  for (const dead of ['KeyЦ', 'KeyФ', 'KeyЫ', 'KeyВ',
    'keyц', 'ArrowUp ', 'arrowup']) {
    assert.equal(CODE_DIRS[dead], undefined, dead);
    assert.equal(deltaForEvent({ code: dead }), null, dead);
  }
});

test('не-перемещающие клавиши → null', () => {
  for (const e of [
    { code: 'KeyE' }, { code: 'KeyI' }, { code: 'KeyQ' },
    { code: 'ShiftLeft' }, { code: 'Space' }, { code: 'Enter' },
    { code: 'Escape' }, { key: 'e' }, { key: ' ' }, {}, null, undefined,
  ]) {
    assert.equal(moveKeyForEvent(e), null, JSON.stringify(e));
    assert.equal(deltaForEvent(e), null, JSON.stringify(e));
  }
});

test('deltaForMoveKey: по id из moveKeyForEvent и по чужому', () => {
  assert.deepEqual(deltaForMoveKey('ArrowUp'), [0, -1]);
  assert.deepEqual(deltaForMoveKey('KeyW'), [0, -1]);
  assert.deepEqual(deltaForMoveKey('ц'), [0, -1]); // id из key-фолбэка
  assert.deepEqual(deltaForMoveKey('в'), [1, 0]);
  assert.equal(deltaForMoveKey('KeyE'), null);
  assert.equal(deltaForMoveKey(''), null);
  assert.equal(deltaForMoveKey(null), null);
});

test('согласованность таблиц: все значения — валидные направления', () => {
  for (const [code, dir] of Object.entries(CODE_DIRS)) {
    assert.ok(DIR_DELTA[dir], code);
    // code — только канонические: стрелки или Key<латиница>.
    assert.match(code, /^Arrow(Up|Down|Left|Right)$|^Key[A-Z]$/);
  }
  for (const [key, dir] of Object.entries(KEY_DIRS)) {
    assert.ok(DIR_DELTA[dir], key);
    // key — только символы раскладки (одна буква, нижний регистр).
    assert.match(key, /^[a-zа-яё]$/);
  }
});

test('keydown/keyup дают одинаковый id при смене регистра (Shift)', () => {
  // Shift+«Ц»: keydown — 'Ц', после отпускания Shift keyup — 'ц'.
  assert.equal(moveKeyForEvent({ code: 'Unidentified', key: 'Ц' }),
    moveKeyForEvent({ code: 'Unidentified', key: 'ц' }));
});
