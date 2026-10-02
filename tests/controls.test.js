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
  TOUCH_ACTIONS, TOUCH_DEADZONE,
  touchMoveKeyForAction, isTouchDevice, chooseControlsScheme,
  layoutTouchControls, touchActionAt,
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

// ---------------------------------------------------------------------------
// Тач-вариант контролов (задача 000018)
// ---------------------------------------------------------------------------

test('touch: набор действий и мёртвая зона', () => {
  assert.deepEqual(TOUCH_ACTIONS,
    ['up', 'down', 'left', 'right', 'interact']);
  assert.ok(TOUCH_DEADZONE > 0 && TOUCH_DEADZONE < 0.5);
});

test('touch: isTouchDevice — по снимку окружения, мусор → false', () => {
  // Каждый сигнал по отдельности.
  assert.equal(isTouchDevice({ maxTouchPoints: 5 }), true);
  assert.equal(isTouchDevice({ touchEvents: true }), true);
  assert.equal(isTouchDevice({ coarsePointer: true }), true);
  // Нет сигнала — нет тача.
  assert.equal(isTouchDevice({ maxTouchPoints: 0 }), false);
  assert.equal(isTouchDevice({}), false);
  assert.equal(isTouchDevice(null), false);
  assert.equal(isTouchDevice(undefined), false);
  assert.equal(isTouchDevice(42), false);
  // Мусорные значения не считаем тачем.
  assert.equal(isTouchDevice({ maxTouchPoints: '5' }), false);
  assert.equal(isTouchDevice({ maxTouchPoints: -1 }), false);
  assert.equal(isTouchDevice({ maxTouchPoints: NaN }), false);
  assert.equal(isTouchDevice({ touchEvents: 'true' }), false);
});

test('touch: chooseControlsScheme — детект + явное переопределение', () => {
  const touchEnv = { maxTouchPoints: 5 };
  const deskEnv = { maxTouchPoints: 0, touchEvents: false };
  assert.equal(chooseControlsScheme(touchEnv, null), 'touch');
  assert.equal(chooseControlsScheme(deskEnv, null), 'keyboard');
  assert.equal(chooseControlsScheme(touchEnv, undefined), 'touch');
  // Явный выбор переопределяет детект.
  assert.equal(chooseControlsScheme(deskEnv, 'touch'), 'touch');
  assert.equal(chooseControlsScheme(touchEnv, 'keyboard'), 'keyboard');
  // Невалидное переопределение игнорируется.
  assert.equal(chooseControlsScheme(touchEnv, 'joy'), 'touch');
  assert.equal(chooseControlsScheme(deskEnv, 'TOUCH'), 'keyboard');
  assert.equal(chooseControlsScheme(deskEnv, ''), 'keyboard');
});

test('touch: layoutTouchControls — D-pad слева-внизу, кнопка справа-внизу', () => {
  const L = layoutTouchControls(800, 600);
  // S = min(220, max(96, 0.4*600)=240, 768, 568) = 220.
  assert.deepEqual(L.dpad, { x: 16, y: 364, w: 220, h: 220 });
  // B = min(96, max(56, 110), 768, 568) = 96.
  assert.deepEqual(L.action, { x: 688, y: 488, w: 96, h: 96 });
  // Держимся в вьюпорте.
  assert.ok(L.dpad.x >= 0 && L.dpad.x + L.dpad.w <= 800);
  assert.ok(L.dpad.y >= 0 && L.dpad.y + L.dpad.h <= 600);
  assert.ok(L.action.x >= 0 && L.action.x + L.action.w <= 800);
  assert.ok(L.action.y >= 0 && L.action.y + L.action.h <= 600);
  // Не пересекаются на типичном экране.
  const overlapX = Math.max(L.dpad.x, L.action.x) <
    Math.min(L.dpad.x + L.dpad.w, L.action.x + L.action.w);
  const overlapY = Math.max(L.dpad.y, L.action.y) <
    Math.min(L.dpad.y + L.dpad.h, L.action.y + L.action.h);
  assert.equal(overlapX && overlapY, false);
});

test('touch: layoutTouchControls — bottomInset поднимает только кнопку', () => {
  const base = layoutTouchControls(800, 600);
  const lifted = layoutTouchControls(800, 600, { bottomInset: 48 });
  // D-pad не сдвинулся.
  assert.deepEqual(lifted.dpad, base.dpad);
  // Кнопка выше на 48 px, размер тот же.
  assert.equal(lifted.action.y, base.action.y - 48);
  assert.equal(lifted.action.w, base.action.w);
  // Отрицательный/мусорный inset → как без него.
  assert.deepEqual(
    layoutTouchControls(800, 600, { bottomInset: -10 }).action, base.action);
  assert.deepEqual(
    layoutTouchControls(800, 600, { bottomInset: NaN }).action, base.action);
});

test('touch: layoutTouchControls — узкий экран и невалидные размеры', () => {
  // Узкий экран: влезает, не переполняется.
  const L = layoutTouchControls(100, 120);
  assert.ok(L.dpad.x >= 0 && L.dpad.x + L.dpad.w <= 100);
  assert.ok(L.dpad.y >= 0 && L.dpad.y + L.dpad.h <= 120);
  assert.ok(L.action.x >= 0 && L.action.x + L.action.w <= 100);
  assert.ok(L.action.y >= 0 && L.action.y + L.action.h <= 120);
  // Невалидные размеры → нулевые прямоугольники.
  for (const [w, h] of [[0, 600], [-5, 600], [NaN, 600], [800, 0]]) {
    const bad = layoutTouchControls(w, h);
    assert.equal(bad.dpad.w, 0);
    assert.equal(bad.action.w, 0);
  }
});

test('touch: touchActionAt — направления D-pad, мёртвая зона, кнопка', () => {
  const L = layoutTouchControls(800, 600);
  const cx = L.dpad.x + L.dpad.w / 2; // 126
  const cy = L.dpad.y + L.dpad.h / 2; // 474
  // Лучи.
  assert.equal(touchActionAt(cx, cy - 70, L), 'up');
  assert.equal(touchActionAt(cx, cy + 70, L), 'down');
  assert.equal(touchActionAt(cx - 70, cy, L), 'left');
  assert.equal(touchActionAt(cx + 70, cy, L), 'right');
  // Мёртвая зона в центре — null.
  assert.equal(touchActionAt(cx, cy, L), null);
  assert.equal(touchActionAt(cx + 10, cy + 10, L), null);
  // Диагонали 45° — выигрывает горизонталь.
  assert.equal(touchActionAt(cx + 50, cy - 50, L), 'right');
  assert.equal(touchActionAt(cx + 50, cy + 50, L), 'right');
  assert.equal(touchActionAt(cx - 50, cy - 50, L), 'left');
  assert.equal(touchActionAt(cx - 50, cy + 50, L), 'left');
  // Снаружи D-pad — null.
  assert.equal(touchActionAt(cx, cy - 200, L), null);
  assert.equal(touchActionAt(-10, cy, L), null);
  // Кнопка действия.
  const ax = L.action.x + L.action.w / 2;
  const ay = L.action.y + L.action.h / 2;
  assert.equal(touchActionAt(ax, ay, L), 'interact');
  assert.equal(touchActionAt(L.action.x + 2, L.action.y + 2, L), 'interact');
  // Между контролами — null.
  assert.equal(touchActionAt(400, 550, L), null);
  // Мусорные координаты — null.
  assert.equal(touchActionAt(NaN, 0, L), null);
  assert.equal(touchActionAt(0, null, L), null);
});

test('touch: touchMoveKeyForAction и deltaForMoveKey понимают touch:<dir>', () => {
  for (const dir of DIRS) {
    const key = touchMoveKeyForAction(dir);
    assert.equal(key, 'touch:' + dir);
    assert.deepEqual(deltaForMoveKey(key), DIR_DELTA[dir]);
  }
  // 'interact' и неизвестные — не направление.
  assert.equal(touchMoveKeyForAction('interact'), null);
  assert.equal(touchMoveKeyForAction('jump'), null);
  assert.equal(touchMoveKeyForAction(null), null);
  assert.equal(touchMoveKeyForAction(''), null);
  assert.equal(deltaForMoveKey('touch:interact'), null);
  assert.equal(deltaForMoveKey('touch:jump'), null);
});

// ---------------------------------------------------------------------------
// Кнопка инвентаря [I] в раскладке и хит-тесте (задача 000123)
// ---------------------------------------------------------------------------

test('touch: layoutTouchControls — inventory: над action, тот же размер, зазор ≥ 8 (000123)', () => {
  const L = layoutTouchControls(800, 600);
  // Третий прямоугольник — inventory (новая кнопка [I]).
  assert.ok(L.inventory, 'в раскладке есть прямоугольник inventory');
  // Эталон 800×600: та же колонка и размер, что action, над ним (зазор 12 px).
  assert.deepEqual(L.inventory, { x: 688, y: 380, w: 96, h: 96 });
  assert.equal(L.inventory.w, L.action.w);
  assert.equal(L.inventory.h, L.action.h);
  assert.equal(L.inventory.x, L.action.x);
  // Строго ВЫШЕ action: зазор ≥ 8 (и > 0 — пересечений нет).
  const gap = L.action.y - (L.inventory.y + L.inventory.h);
  assert.ok(gap >= 8, 'зазор между кнопками ≥ 8');
  // Не пересекается с D-pad на типичном экране (паттерн существующего теста).
  const overlapX = Math.max(L.dpad.x, L.inventory.x) <
    Math.min(L.dpad.x + L.dpad.w, L.inventory.x + L.inventory.w);
  const overlapY = Math.max(L.dpad.y, L.inventory.y) <
    Math.min(L.dpad.y + L.dpad.h, L.inventory.y + L.inventory.h);
  assert.equal(overlapX && overlapY, false);
  // Пара в вьюпорте.
  assert.ok(L.inventory.y >= 0 && L.inventory.y + L.inventory.h <= 600);
  assert.ok(L.action.y >= 0 && L.action.y + L.action.h <= 600);
  // bottomInset=48: пара поднимается, action — на своё прежнее место (регрессия).
  const lifted = layoutTouchControls(800, 600, { bottomInset: 48 });
  assert.equal(lifted.action.y, L.action.y - 48);
  assert.ok(lifted.inventory.y >= 0);
  assert.ok(lifted.inventory.y + lifted.inventory.h <= 600);
  assert.ok(lifted.action.y - (lifted.inventory.y + lifted.inventory.h) >= 8);
});

test('touch: layoutTouchControls — пара на низком/узком вьюпорте, невалидные → нули (000123)', () => {
  // Низкий вьюпорт: пара (2×B + зазор) влезает — B может быть < 56.
  const low = layoutTouchControls(800, 140);
  assert.ok(low.inventory.y >= 0 && low.inventory.y + low.inventory.h <= 140);
  assert.ok(low.action.y + low.action.h <= 140);
  assert.ok(low.action.y - (low.inventory.y + low.inventory.h) >= 8);
  assert.equal(low.inventory.w, low.action.w);
  assert.equal(low.inventory.h, low.action.h);
  // Узкий вьюпорт: обе кнопки в пределах 100×120.
  const narrow = layoutTouchControls(100, 120);
  assert.ok(narrow.inventory.x >= 0 && narrow.inventory.x + narrow.inventory.w <= 100);
  assert.ok(narrow.inventory.y >= 0 && narrow.inventory.y + narrow.inventory.h <= 120);
  assert.ok(narrow.action.x >= 0 && narrow.action.x + narrow.action.w <= 100);
  assert.ok(narrow.action.y >= 0 && narrow.action.y + narrow.action.h <= 120);
  assert.ok(narrow.action.y - (narrow.inventory.y + narrow.inventory.h) >= 8);
  // Невалидные размеры → ВСЕ ТРИ прямоугольника нулевые.
  for (const [w, h] of [[0, 600], [-5, 600], [NaN, 600], [800, 0]]) {
    const bad = layoutTouchControls(w, h);
    assert.equal(bad.dpad.w, 0);
    assert.equal(bad.action.w, 0);
    assert.equal(bad.inventory.w, 0);
    assert.equal(bad.inventory.h, 0);
  }
  // Гигантский bottomInset — пара не влезает → B = 0 (D-pad от inset не зависит).
  const over = layoutTouchControls(800, 600, { bottomInset: 1e6 });
  assert.equal(over.action.w, 0);
  assert.equal(over.action.h, 0);
  assert.equal(over.inventory.w, 0);
  assert.equal(over.inventory.h, 0);
});

test('touch: touchActionAt — точка в inventory → inventory, без регрессий (000123)', () => {
  const L = layoutTouchControls(800, 600);
  // Центр и угол inventory (координаты — из раскладки, устойчиво к зазору).
  const icx = L.inventory.x + L.inventory.w / 2;
  const icy = L.inventory.y + L.inventory.h / 2;
  assert.equal(touchActionAt(icx, icy, L), 'inventory');
  assert.equal(touchActionAt(L.inventory.x + 2, L.inventory.y + 2, L), 'inventory');
  // Точка в зазоре между кнопками (зазор ≥ 8, +4 — внутри) — null.
  assert.equal(touchActionAt(icx, L.inventory.y + L.inventory.h + 4, L), null);
  // Кнопка действия — 'interact' (не сменилась на 'inventory').
  const acx = L.action.x + L.action.w / 2;
  const acy = L.action.y + L.action.h / 2;
  assert.equal(touchActionAt(acx, acy, L), 'interact');
  // D-pad — компактные регрессии (полное покрытие — в существующем тесте).
  const dcx = L.dpad.x + L.dpad.w / 2;
  const dcy = L.dpad.y + L.dpad.h / 2;
  assert.equal(touchActionAt(dcx, dcy - 70, L), 'up');
  assert.equal(touchActionAt(dcx, dcy + 70, L), 'down');
  // Мёртвая зона и мусорные координаты — null.
  assert.equal(touchActionAt(dcx, dcy, L), null);
  assert.equal(touchActionAt(NaN, 0, L), null);
  assert.equal(touchActionAt(0, null, L), null);
});

test('touch: TOUCH_ACTIONS — inventory; touch:inventory не направление (000123)', () => {
  assert.ok(TOUCH_ACTIONS.includes('inventory'),
    "TOUCH_ACTIONS содержит 'inventory'");
  // Не направление: виртуальная «клавиша» и дельта — null (регрессионные
  // гарды — уже так на master, запираем контрактом).
  assert.equal(deltaForMoveKey('touch:inventory'), null);
  assert.equal(touchMoveKeyForAction('inventory'), null);
});
