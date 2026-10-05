// Задача 000133: спец-модуль src/building-effect-runes.js —
// юнит-тесты ДЕГРАДАЦИОННЫХ веток (правка по итогам ревью
// 2026-10-06: «гарды 000053 в коде, но юнит-тестами не покрыты»):
//   * register() без Game.buildingActions.registerSpecial —
//     console.error + БЕЗ регистрации, БЕЗ исключения (игра не
//     падает, 000053 — паттерн всех спец-модулей, прецедент
//     A60 для building-effect-48.js);
//   * handle() без Game.Spells.learn — console.error +
//     { ok: false, message: 'заклинания недоступны' }, hero НЕ
//     мутирован (learn не вызывается).
// Положительный путь покрыт: R1–R4 (apply-уровень, включая
// деградацию apply — R4(d)) и R5/R6 (e2e, полная цепочка
// index.html: модуль на месте, регистрация и learn сработали) —
// tests/building-effects.test.js.
'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const R = require('../src/building-effect-runes.js');

test('RUNES-U1. 000133: register() без buildingActions/registerSpecial — console.error, без исключения, specials не заполнен (000053)', () => {
  // UMD node: { handle, register } — форма зафиксирована шапкой
  // модуля; тест регистрирует явно (в браузере — саморегистрация).
  assert.equal(typeof R, 'object', 'UMD node: объект-модуль');
  assert.equal(typeof R.handle, 'function', 'handle — функция');
  assert.equal(typeof R.register, 'function', 'register — функция');

  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  const registered = [];
  let threw = null;
  try {
    // (a) G без buildingActions — гард: console.error, без
    //     регистрации.
    R.register({});
    // (b) buildingActions без registerSpecial — тот же гард.
    R.register({ buildingActions: {} });
    assert.equal(registered.length, 0,
      'specials не заполнен (регистрация — только по правильному G)');
    // (c) Положительный контроль: ОДИН хендлер на ОБА id, камень
    //     (40_spell) первым — порядок register в модуле.
    R.register({
      buildingActions: {
        registerSpecial: (id, h) => { registered.push([id, h]); },
      },
    });
  } catch (e) {
    threw = e;
  } finally {
    console.error = origErr;
  }
  assert.equal(threw, null, 'исключение нет — игра не падает');
  assert.equal(errs.length, 2,
    'console.error — ровно по каждому деградационному G: ' +
    JSON.stringify(errs));
  assert.ok(errs.every((m) => /buildingActions/.test(m)),
    'текст ошибки — про Game.buildingActions');
  assert.equal(registered.length, 2,
    'после правильного G — ровно две регистрации');
  assert.deepEqual(registered.map((p) => p[0]), ['40_spell', '42_spell'],
    'оба id: камень (40_spell) первым');
  assert.equal(registered[0][1], registered[1][1],
    'один хендлер на оба id (пул — из каталога)');
});

test('RUNES-U2. 000133: handle() без Game.Spells — console.error + «заклинания недоступны», hero не мутирован (000053)', () => {
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  const hero = { spells: [] };
  let res;
  try {
    // r — «успех» apply (ок:true, success, spellId), но Game без
    // Spells (битый порядок загрузки): гард обязан сработать ДО
    // learn.
    res = R.handle({
      hero,
      r: { ok: true, success: true, spellId: 'fireball' },
      world: { game: {} },
    });
  } finally {
    console.error = origErr;
  }
  assert.deepEqual(res, { ok: false, message: 'заклинания недоступны' },
    'деградация по контракту; факт: ' + JSON.stringify(res));
  assert.deepEqual(hero, { spells: [] },
    'hero не мутирован (learn не вызван)');
  assert.equal(errs.length, 1, 'console.error — ровно один');
  assert.ok(/Game\.Spells/.test(errs[0]),
    'текст ошибки — про Game.Spells');
});
