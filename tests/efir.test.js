// Задача 000081: Эфир — постоянный союзник (src/efir.js) — КРАСНЫЕ тесты (TDD).
//
// Падают, пока src/efir.js не существует (модуль ещё не создан):
//   * R1 — модуль грузится (node require + браузерная ветка БЕЗ Game),
//     экспорты ровно {createEfir, addEfirXp, levelUp, efirAllyData},
//     НОЛЬ require( в источнике (чистота 000053/000038);
//   * R2 — createEfir(): {level:1, xp:0, skills:{}} (форма сейва 000085;
//     HP/MP в состоянии НЕТ), независимые объекты; скромный пул
//     [spark, mend] — данные МОДУЛЯ, свежая копия на вызов;
//     id ∈ assets/spells (целостность 000053);
//   * R3 — addEfirXp: порог xpForNext (src/player.js: round(50·ур^1.5)),
//     while-цикл (несколько уровней за один бой), остаток копится;
//     невалидные amount — 0 без мутаций; state null — 0;
//   * R4 — levelUp + рост статов по уровню (формульный путь makeAlly:
//     явных maxHP/damage в данных НЕТ — маркер морали действует только
//     через формулу);
//   * R5 — 100% боевого опыта в пул (companion_xp_share НЕ применяется —
//     тот механизм для наёмников, 000082);
//   * R6 — деградация: Game.xpForNext нет на момент вызова → console.error,
//     xp копится, уровень НЕ растёт, исключений 0 (игра не падает).
//
// Контракты: memory/000081-efir.md (решения стадии Проектирование),
// memory/000081-efir-ally.md (стабильный контракт для 000084–000087
// и 000111–000119). ТЗ — tasks/pending/000081.md.
//
// Файл НОВЫЙ — хелперы с осмысленным assert.fail допустимы (каската
// старых тестов нет; паттерн loadLocations, tests/locations.test.js).
// xpForNext (src/player.js) задаётся тестом на globalThis.Game — модуль
// читает его ЛЕНИВО в момент ВЫЗОВА (rootRef, прецеденты 000127/000053);
// снапшота Game при загрузке НЕТ (000038), throw на загрузке — НЕТ.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const EFIR_PATH = path.join(ROOT, 'src', 'efir.js');
const P = require('../src/player.js');
const { makeAlly } = require('../src/combat.js');

// --- Загрузка модуля (красная фаза: файла src/efir.js нет) ---

function loadEfir() {
  try {
    return require(EFIR_PATH);
  } catch (e) {
    assert.fail('src/efir.js не существует или не грузится ' +
      '(задача 000081): ' + e.message);
  }
}

function readEfirSource() {
  try {
    return fs.readFileSync(EFIR_PATH, 'utf8');
  } catch (e) {
    assert.fail('src/efir.js не существует (задача 000081): ' + e.message);
  }
}

// ЛЕНИВЫЙ Game (прецедент tests/locations.test.js): модуль читает
// globalThis.Game в момент ВЫЗОВА — на время вызова подменяем.
function withGame(fake, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = fake;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

// Game с xpForNext (src/player.js) — порог уровня Эфира.
const gameWithXp = () => ({ xpForNext: P.xpForNext });

// Каталог заклинаний (целостность id, прецедент 000053).
const SPELL_IDS = (() => {
  const dir = path.join(ROOT, 'assets', 'spells');
  return new Set(fs.readdirSync(dir)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).id));
})();

test('000081 R1: efir.js грузится (node + браузерная ветка без Game); экспорты ровно 4; в источнике НЕТ require(', () => {
  const E = loadEfir();
  assert.deepEqual(
    Object.keys(E).sort(),
    ['addEfirXp', 'createEfir', 'efirAllyData', 'levelUp'],
    'экспорты — ровно {createEfir, addEfirXp, levelUp, efirAllyData}');
  for (const k of Object.keys(E)) {
    assert.equal(typeof E[k], 'function', 'экспорт ' + k);
  }
  // Браузерная ветка БЕЗ Game: root.Game.efir (UMD: root.Game =
  // Object.assign({}, G0, { efir: factory() })); 0 console.error,
  // 0 исключений (чистая загрузка — без DOM и без зависимостей).
  const errors = [];
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
  };
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(
    readEfirSource(), sandbox, { filename: 'efir.js' }),
    'браузерная ветка без Game — без исключений');
  const GE = sandbox.Game && sandbox.Game.efir;
  assert.ok(GE, 'браузерная ветка: root.Game.efir создан');
  for (const k of ['createEfir', 'addEfirXp', 'levelUp', 'efirAllyData']) {
    assert.equal(typeof GE[k], 'function', 'Game.efir.' + k);
  }
  assert.equal(errors.length, 0,
    '0 console.error при загрузке: ' + errors.join('; '));
  // Чистота (000053/000038): НОЛЬ require( во всём файле.
  assert.ok(!/require\(/.test(readEfirSource()),
    'в src/efir.js НОЛЬ require( — чистый UMD (прецедент 000053/000038)');
});

test('000081 R2: createEfir() — {level:1, xp:0, skills:{}} (ровно 3 поля); независимые объекты; скромный пул [spark, mend] — данные модуля, копия на вызов, id ∈ assets/spells', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const s = E.createEfir();
    assert.deepEqual(Object.keys(s).sort(), ['level', 'skills', 'xp'],
      'состояние — ровно {level, xp, skills} (форма сейва 000085; HP/MP НЕТ)');
    assert.equal(s.level, 1);
    assert.equal(s.xp, 0);
    assert.deepEqual(s.skills, {});
    // Два вызова — независимые объекты (пул изолирован в модуле).
    const s2 = E.createEfir();
    assert.notEqual(s, s2, 'вызовы независимы');
    assert.notEqual(s.skills, s2.skills, 'skills — независимы');
    // Данные makeAlly (контракт 000081 §3): id/kind/name/role/level/
    // attrs/skills; явных maxHP/damage НЕТ (формульный путь — мораль).
    const d1 = E.efirAllyData(s);
    assert.equal(d1.id, 'efir', 'id — "efir"');
    assert.equal(d1.kind, 'efir', "kind — строго 'efir' (не 'ether')");
    assert.equal(d1.name, 'Эфир');
    assert.equal(d1.role, 'support');
    assert.equal(d1.level, 1);
    assert.deepEqual(d1.attrs, {});
    assert.deepEqual(d1.skills, []);
    // Скромный пул (ТЗ: «огонь/исцеление»): данные МОДУЛЯ; СВЕЖАЯ
    // КОПИЯ на каждый вызов (мутация данных боя не ломает модуль).
    const d2 = E.efirAllyData(s);
    assert.deepEqual(d1.spells, ['spark', 'mend'],
      'скромный пул: spark (огонь) / mend (исцеление)');
    assert.deepEqual(d2.spells, ['spark', 'mend']);
    assert.notEqual(d1.spells, d2.spells, 'spells — свежая копия на вызов');
    for (const id of d1.spells) {
      assert.ok(SPELL_IDS.has(id),
        'заклинание ' + id + ' — в каталоге assets/spells (целостность 000053)');
    }
  });
});

test('000081 R3: addEfirXp — порог xpForNext (50/141/260), while-цикл (2 уровня за один бой), остаток копится; невалидные — 0 без мутаций', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // +50 → L2/xp0 (xpForNext(1) = round(50·1^1.5) = 50).
    const s = E.createEfir();
    assert.equal(E.addEfirXp(s, 50), 1, '+50 → 1 уровень');
    assert.equal(s.level, 2);
    assert.equal(s.xp, 0, 'остаток 0');
    // +49 → L1/xp49 (порога нет).
    const s2 = E.createEfir();
    assert.equal(E.addEfirXp(s2, 49), 0, '+49 → 0 уровней');
    assert.equal(s2.level, 1);
    assert.equal(s2.xp, 49);
    // +300 → L3/xp109: 50 + 141 = 191 (ДВА порога, while), остаток 109.
    const s3 = E.createEfir();
    assert.equal(E.addEfirXp(s3, 300), 2, '+300 → 2 уровня (while-цикл)');
    assert.equal(s3.level, 3);
    assert.equal(s3.xp, 109, 'остаток копится');
    // Невалидные amount: 0/−5/NaN/undefined/строка → 0, state не мутирован.
    const s4 = E.createEfir();
    for (const bad of [0, -5, NaN, undefined, 'мусор']) {
      assert.equal(E.addEfirXp(s4, bad), 0, 'amount ' + String(bad) + ' → 0');
    }
    assert.equal(s4.level, 1);
    assert.equal(s4.xp, 0, 'state не мутирован');
    // state null → 0 (без исключений).
    assert.equal(E.addEfirXp(null, 50), 0, 'state null → 0');
  });
});

test('000081 R4: levelUp + рост статов по уровню (формулы makeAlly: L1 8/3/0, L3 14/4/0, L5 20/6/0); явных maxHP/damage в данных НЕТ', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // Формульный путь: makeAlly(efirAllyData(state), 0, 1) — support ×0.7.
    // Формулы — В ТЕСТЕ (те же, что makeAlly в combat.js): не хардкод.
    const stat = (state) => {
      const u = makeAlly(E.efirAllyData(state), 0, 1);
      const lv = u.level;
      const expect = [
        Math.max(1, Math.round((8 + 4 * lv) * 1 * 0.7)), // support ×0.7
        Math.max(1, Math.round((2 + 0.7 * lv) * 1 * 1)), // мораль ×1
        0 + Math.floor(lv / 10),
      ];
      assert.deepEqual([u.maxHP, u.damage, u.armor], expect,
        'L' + lv + ': maxHP/damage/armor = формулы makeAlly');
      return u;
    };
    const s = E.createEfir();
    // Явных статов НЕТ — маркер морали действует только через формулу
    // (решение 000081; явные приходят с 000111).
    const d = E.efirAllyData(s);
    assert.ok(!('maxHP' in d), 'явного maxHP в данных НЕТ (формульный путь)');
    assert.ok(!('damage' in d), 'явного damage в данных НЕТ (формульный путь)');
    const u1 = stat(s);
    assert.equal(u1.level, 1);
    assert.equal(u1.maxHP, 8, 'L1: maxHP = round(12·0.7) = 8');
    assert.equal(u1.damage, 3, 'L1: damage = round(2.7) = 3');
    assert.equal(u1.armor, 0, 'L1: armor = 0 + floor(1/10) = 0');
    // levelUp: по уровню, БЕЗ нового xp (L1→L2→L3).
    assert.equal(E.levelUp(s), 1, 'levelUp → 1 уровень');
    assert.equal(s.level, 2);
    assert.equal(s.xp, 0, 'xp не меняется');
    assert.equal(E.levelUp(s), 1, 'levelUp повторно');
    assert.equal(s.level, 3);
    const u3 = stat(s);
    assert.equal(u3.maxHP, 14, 'L3: maxHP = round(20·0.7) = 14');
    assert.equal(u3.damage, 4, 'L3: damage = round(4.1) = 4');
    assert.equal(u3.armor, 0, 'L3: armor = 0');
    // L5 через addEfirXp: 260 + 400 = 660 (два порога L3→L5).
    assert.equal(E.addEfirXp(s, 260 + 400), 2, 'L3→L5 (260+400)');
    assert.equal(s.level, 5);
    assert.equal(s.xp, 0);
    const u5 = stat(s);
    assert.equal(u5.maxHP, 20, 'L5: maxHP = round(28·0.7) = 20');
    assert.equal(u5.damage, 6, 'L5: damage = round(5.5) = 6');
    assert.equal(u5.armor, 0, 'L5: armor = 0 + floor(5/10) = 0');
    // levelUp без запаса xp → 0 (уровень не «в воздух»).
    const s2 = E.createEfir();
    assert.equal(E.levelUp(s2), 0, 'без xp — 0 уровней');
    assert.equal(s2.level, 1);
  });
});

test('000081 R5: 100% боевого опыта — в пул (companion_xp_share НЕ применяется: доля — для наёмников, 000082)', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const s = E.createEfir();
    // 16 — xp волка L2 = 8 + 4×2: ТОЧНО то число, что уходит игроку
    // (100% ДО бонуса «Учёный»). Эфиру — то же число, БЕЗ доли.
    const n = E.addEfirXp(s, 16);
    assert.equal(n, 0, '16 < 50 (xpForNext(1)) — уровень не растёт');
    assert.equal(s.xp, 16,
      '100% xp в пул (НЕ round(16×0.5)=8 — companion_xp_share не к Эфиру)');
    assert.equal(s.level, 1);
  });
});

test('000081 R6: деградация — Game.xpForNext нет на момент вызова → console.error, xp копится, уровень не растёт, исключений 0', () => {
  const E = loadEfir();
  const s = E.createEfir();
  const errors = [];
  const realError = console.error;
  console.error = (m) => errors.push(String(m));
  try {
    withGame({}, () => { // Game существует, НО xpForNext нет
      let n;
      assert.doesNotThrow(() => { n = E.addEfirXp(s, 60); },
        'исключений 0 (игра не падает)');
      assert.equal(n, 0, 'уровень не растёт (порог недоступен)');
    });
  } finally {
    console.error = realError;
  }
  assert.equal(s.xp, 60,
    'xp копится (уровень догонит, когда xpForNext станет доступен)');
  assert.equal(s.level, 1, 'уровень не растёт');
  assert.ok(errors.length > 0, 'console.error записан (видимая деградация)');
});
