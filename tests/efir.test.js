// Задача 000081: Эфир — постоянный союзник (src/efir.js) — КРАСНЫЕ тесты (TDD).
//
// Падают, пока src/efir.js не существует (модуль ещё не создан):
//   * R1 — модуль грузится (node require + браузерная ветка БЕЗ Game),
//     экспорты ровно 13 (11 функций + данные EFIR_SKILLS/
//     EFIR_SPELL_UNLOCKS, 000111; serializeEfir/deserializeEfir —
//     000085), НОЛЬ require( в источнике (чистота 000053/000038);
//   * R2 — createEfir(): {level:1, xp:0, skillXp:{}, skills:{},
//     spells:[spark,mend]} (форма сейва 000085→000115; HP/MP в
//     состоянии НЕТ), независимые объекты; attrs — 3 собственных;
//     старт [spark, mend] — данные МОДУЛЯ, свежая копия на вызов;
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
//
// --- Задача 000111: собственные атрибуты, пул навыков, книга
// заклинаний (ТЗ — tasks/pending/000111.md; контракты стадии
// Проектирование — memory/000111-efir-growth.md). КРАСНЫЕ тесты T1–T9:
// падают, пока в src/efir.js НЕТ новых экспортов/данных/полей состояния
// (осмысленная краснота — «функциональности нет», не синтаксис):
//   * T1 — таблица атрибутов efirStats(level): точные значения
//     L1/L2/L3/L5 (3+floor((ур−1)/2); maxHP 10+2·Тел; maxMP 5+Инт+Мудр),
//     свежая копия, согласованность efirAllyData().attrs;
//   * T2 — детерминизм: одинаковый уровень → одинаковая таблица/книга/
//     потолок; разные пути xp до L8 → тот же результат;
//   * T3 — книга: старт [spark, mend] (поле state + боевые данные),
//     таблица открытий L4/L5/L8/L30, монотонность, АВТОМАТИЧЕСКИЙ
//     append при levelUp (без дублей), append-only;
//   * T4 — ссылочная целостность: пул РОВНО {firelord, icelord,
//     perception, precog} ⊆ assets/skills (зеркало primary/requires),
//     книга ⊆ assets/spells; каталога assets/efir/ НЕТ (данные модуля,
//     000053);
//   * T5 — потолок = основной атрибут НАВЫКА * 2 по ЕГО атрибутам
//     (efirSkillCap); overflow банка за потолком ХРАНИТСЯ и
//     конвертируется при росте потолка;
//   * T6 — requires-цепочки каталога (icelord ← firelord 5, precog ←
//     perception 5): до гейта банк ЦЕЛИКОМ, после — полная конвертация;
//   * T7 — идемпотентность переучёта (×2 — без изменений),
//     нормализация битых значений, уровень > cap → cap, null → [];
//   * T8 — levelUp-интеграция: ОДИН вызов addEfirXp через пороги —
//     уровень + книга + переучёт (пороги 50/141/260/400 — регрессия R3);
//   * T9 — боевая проекция: лечение от СОБСТВЕННЫХ attrs (L1: mend +7;
//     L20: greater_heal +35), u.attrs = 3×12; явных maxHP/damage в
//     данных makeAlly НЕТ (D2: формульный путь до 000112).
// Р1–R6 (000081) — БЕЗ ПРАВОК в красной фазе (технические правки
// R1/R2 — вместе с GREEN-коммитом, вводящим экспорты/форму).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const EFIR_PATH = path.join(ROOT, 'src', 'efir.js');
const P = require('../src/player.js');
const { makeAlly, createCombat } = require('../src/combat.js');

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

// Каталог навыков (целостность пула Эфира, паттерн
// tests/combat.test.js:251): id + мета (primary/requires) для
// сверки зеркала данных модуля с каталогом (T4).
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const SKILL_FILES = () => fs.readdirSync(SKILLS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f));
const SKILL_IDS = new Set(SKILL_FILES()
  .map((f) => JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id));
const SKILL_META = (() => {
  const m = new Map();
  for (const f of SKILL_FILES()) {
    const j = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    m.set(j.id, j);
  }
  return m;
})();

// --- Задача 000115: полные КАТАЛОГИ-ЗАПИСИ (id-валидация в
// deserializeEfir по каталогам-параметрам, D2): массивы записей каталога
// (объекты со строковым .id — не только id-набор). Зеркала assets:
// skills — 37 записей, spells — 16 записей.
const SKILL_CATALOG = SKILL_FILES()
  .map((f) => JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')));
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const SPELL_FILES = () => fs.readdirSync(SPELLS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f));
const SPELL_CATALOG = SPELL_FILES()
  .map((f) => JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')));

test('000081 R1: efir.js грузится (node + браузерная ветка без Game); экспорты ровно 13 (11 функций + 2 данных); в источнике НЕТ require(', () => {
  const E = loadEfir();
  assert.deepEqual(
    Object.keys(E).sort(),
    ['EFIR_SKILLS', 'EFIR_SPELL_UNLOCKS', 'addEfirXp', 'createEfir',
     'deserializeEfir', 'efirAllyData', 'efirSkillCap', 'efirSkillXpForNext',
     'efirSpellsByLevel', 'efirStats', 'levelUp', 'reprocessEfirSkills',
     'serializeEfir'],
    'экспорты — ровно 13: 11 функций + 2 данных (000085: ' +
    'serializeEfir/deserializeEfir; 000111: EFIR_SKILLS, EFIR_SPELL_UNLOCKS)');
  const FUNCS = ['createEfir', 'addEfirXp', 'levelUp', 'efirAllyData',
    'efirStats', 'efirSpellsByLevel', 'reprocessEfirSkills',
    'efirSkillXpForNext', 'efirSkillCap', 'deserializeEfir', 'serializeEfir'];
  for (const k of FUNCS) {
    assert.equal(typeof E[k], 'function', 'экспорт ' + k);
  }
  assert.ok(Array.isArray(E.EFIR_SKILLS), 'EFIR_SKILLS — массив данных');
  assert.ok(Array.isArray(E.EFIR_SPELL_UNLOCKS),
    'EFIR_SPELL_UNLOCKS — массив данных');
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
  for (const k of FUNCS) {
    assert.equal(typeof GE[k], 'function', 'Game.efir.' + k);
  }
  assert.ok(Array.isArray(GE.EFIR_SKILLS), 'Game.efir.EFIR_SKILLS');
  assert.ok(Array.isArray(GE.EFIR_SPELL_UNLOCKS),
    'Game.efir.EFIR_SPELL_UNLOCKS');
  assert.equal(errors.length, 0,
    '0 console.error при загрузке: ' + errors.join('; '));
  // Чистота (000053/000038): НОЛЬ require( во всём файле.
  assert.ok(!/require\(/.test(readEfirSource()),
    'в src/efir.js НОЛЬ require( — чистый UMD (прецедент 000053/000038)');
});

test('000081 R2: createEfir() — {level:1, xp:0, skillXp:{}, skills:{}, spells:[spark,mend]} (ровно 5 полей); независимые объекты; старт [spark, mend] — данные модуля, копия на вызов, id ∈ assets/spells', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const s = E.createEfir();
    assert.deepEqual(
      Object.keys(s).sort(),
      ['level', 'skillXp', 'skills', 'spells', 'xp'],
      'состояние — ровно {level, xp, skillXp, skills, spells} ' +
      '(форма сейва 000085→000115; HP/MP НЕТ)');
    assert.equal(s.level, 1);
    assert.equal(s.xp, 0);
    assert.deepEqual(s.skillXp, {}, 'skillXp — пустой банк на старте');
    assert.deepEqual(s.skills, {});
    assert.deepEqual(s.spells, ['spark', 'mend'],
      'spells — стартовая книга [spark, mend] (ТЗ 000111)');
    // Два вызова — независимые объекты (пул изолирован в модуле).
    const s2 = E.createEfir();
    assert.notEqual(s, s2, 'вызовы независимы');
    assert.notEqual(s.skills, s2.skills, 'skills — независимы');
    assert.notEqual(s.skillXp, s2.skillXp, 'skillXp — независимы');
    assert.notEqual(s.spells, s2.spells, 'spells — независимы');
    // Данные makeAlly (контракт 000081 §3, 000111 D2/D3): id/kind/
    // name/role/level/attrs/skills; attrs — 3 СОБСТВЕННЫХ атрибута
    // (таблица, L1: 3/3/3); явных maxHP/damage НЕТ (формульный путь
    // — мораль; явные боевые статы — 000112).
    const d1 = E.efirAllyData(s);
    assert.equal(d1.id, 'efir', 'id — "efir"');
    assert.equal(d1.kind, 'efir', "kind — строго 'efir' (не 'ether')");
    assert.equal(d1.name, 'Эфир');
    assert.equal(d1.role, 'support');
    assert.equal(d1.level, 1);
    assert.deepEqual(d1.attrs,
      { intelligence: 3, wisdom: 3, constitution: 3 },
      'attrs — 3 собственных атрибута (L1: таблица 3 + floor((1−1)/2))');
    assert.deepEqual(d1.skills, []);
    // Стартовая книга (ТЗ 000111: старт [spark, mend] — «скромный
    // пул: огонь/исцеление» 000081): данные МОДУЛЯ; СВЕЖАЯ КОПИЯ на
    // каждый вызов (мутация данных боя не ломает модуль).
    const d2 = E.efirAllyData(s);
    assert.deepEqual(d1.spells, ['spark', 'mend'],
      'стартовая книга: spark (огонь) / mend (исцеление)');
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
    // levelUp: while-цикл по порогам xpForNext, БЕЗ нового xp —
    // обрабатывает xp, накопленный в деградационном окне (R6) и при
    // нормализации сейва (000085/000115): нет xp — нет уровня.
    // L1: 50 — порог; L2: 141 — порог.
    s.xp = 50; // xp без уровня (деградация / нормализация)
    assert.equal(E.levelUp(s), 1, 'levelUp: 50 ≥ 50 → 1 уровень');
    assert.equal(s.level, 2);
    assert.equal(s.xp, 0, 'xp списан по порогу');
    s.xp = 141;
    assert.equal(E.levelUp(s), 1, 'levelUp повторно: 141 ≥ 141 → 1 уровень');
    assert.equal(s.level, 3);
    assert.equal(s.xp, 0, 'xp списан по порогу (L2)');
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

// --- Задача 000111: собственные атрибуты, пул навыков, книга
// заклинаний — КРАСНЫЕ тесты (T1–T9) ---
//
// Контракты (станция Проектирование): memory/000111-efir-growth.md —
// форма состояния {level, xp, skillXp, skills, spells} (5 полей),
// API — 11 экспортов, переучёт — инкрементальный с текущего уровня
// (идемпотентно; банк за потолком хранится; requires → 0 + банк
// целиком; зависимый порядок EFIR_SKILLS). Краснота осмысленная:
// в src/efir.js НЕТ функций/данных/поля — TypeError «is not a
// function» / отсутствие символа, НЕ синтаксис.

test('000111 T1: таблица атрибутов по уровням — точные значения L1/L2/L3/L5; свежая копия; согласованность attrs в efirAllyData', () => {
  const E = loadEfir();
  // Формула (ТЗ/SPEC «Дух Эфира»): Инт = Мудр = Тел =
  // 3 + floor((уровень−1)/2); maxHP = 10 + 2·Тел; maxMP = 5 + Инт + Мудр.
  assert.deepEqual(E.efirStats(1),
    { intelligence: 3, wisdom: 3, constitution: 3, maxHP: 16, maxMP: 11 },
    'L1: 3/3/3, maxHP 16, maxMP 11');
  assert.deepEqual(E.efirStats(2),
    { intelligence: 3, wisdom: 3, constitution: 3, maxHP: 16, maxMP: 11 },
    'L2: без изменений (floor((2−1)/2) = 0)');
  assert.deepEqual(E.efirStats(3),
    { intelligence: 4, wisdom: 4, constitution: 4, maxHP: 18, maxMP: 13 },
    'L3: 4/4/4, maxHP 18, maxMP 13');
  assert.deepEqual(E.efirStats(5),
    { intelligence: 5, wisdom: 5, constitution: 5, maxHP: 20, maxMP: 15 },
    'L5: 5/5/5, maxHP 20, maxMP 15');
  // Чистая функция — свежий объект на каждый вызов (мутация таблицы
  // не ломает модуль).
  const a = E.efirStats(5);
  const b = E.efirStats(5);
  assert.notEqual(a, b, 'свежая копия на каждый вызов');
  // Согласованность: attrs в данных боя — та же таблица (D3).
  const s = E.createEfir();
  s.level = 5;
  assert.deepEqual(E.efirAllyData(s).attrs,
    { intelligence: 5, wisdom: 5, constitution: 5 },
    'efirAllyData().attrs — 3 собственных атрибута по таблице');
});

test('000111 T2: детерминизм — одинаковый уровень → одинаковая таблица/книга/потолок; разные пути xp до L8 → тот же результат', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // Чистые функции: повторные вызовы идентичны.
    assert.deepEqual(E.efirStats(12), E.efirStats(12),
      'efirStats(12) — детерминировано');
    assert.deepEqual(E.efirSpellsByLevel(15), E.efirSpellsByLevel(15),
      'efirSpellsByLevel(15) — детерминировано');
    // Один уровень РАЗНЫМИ путями xp: порог за порогом vs один большой
    // addEfirXp. Пороги — xpForNext (src/player.js), формула в тесте
    // (без хардкода суммы, паттерн R4).
    const thresholds = [1, 2, 3, 4, 5, 6, 7].map((lv) => P.xpForNext(lv));
    const sA = E.createEfir();
    for (const xp of thresholds) E.addEfirXp(sA, xp);
    const sB = E.createEfir();
    E.addEfirXp(sB, thresholds.reduce((sum, xp) => sum + xp, 0));
    assert.equal(sA.level, 8, 'путь A: порог за порогом → L8');
    assert.equal(sB.level, 8, 'путь B: один большой xp → L8');
    assert.equal(sA.xp, 0);
    assert.equal(sB.xp, 0);
    assert.deepEqual(E.efirAllyData(sA).attrs, E.efirAllyData(sB).attrs,
      'один уровень → одинаковые атрибуты');
    assert.deepEqual(sA.spells, sB.spells, 'один уровень → одинаковая книга');
    for (const id of ['firelord', 'icelord', 'perception', 'precog']) {
      assert.equal(E.efirSkillCap(sA, id), E.efirSkillCap(sB, id),
        'один уровень → одинаковый потолок: ' + id);
    }
  });
});

test('000111 T3: книга заклинаний — старт [spark, mend], таблица открытий L4/L5/L8/L30, монотонность; авто-append при levelUp (без дублей); append-only', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // Старт — ПОЛЕ СОСТОЯНИЯ (append-only данные) и боевые данные.
    const s0 = E.createEfir();
    assert.deepEqual(s0.spells, ['spark', 'mend'],
      'стартовая книга в состоянии: [spark, mend]');
    const d1 = E.efirAllyData(s0);
    const d2 = E.efirAllyData(s0);
    assert.deepEqual(d1.spells, ['spark', 'mend'], 'книга L1 в данных боя');
    assert.notEqual(d1.spells, d2.spells, 'spells — свежая копия на вызов');
    // Таблица открытий (ТЗ: 5 light_heal, 8 frost_bolt, 10 fireball,
    // 12 magic_shield, 15 vine, 20 greater_heal, 25 ward, 30
    // nature_blessing): L4 — открытий нет, L5/L8 — первые, L30 — все.
    assert.deepEqual(E.efirSpellsByLevel(4), ['spark', 'mend'], 'L4: без открытий');
    assert.deepEqual(E.efirSpellsByLevel(5),
      ['spark', 'mend', 'light_heal'], 'L5: + light_heal');
    assert.deepEqual(E.efirSpellsByLevel(8),
      ['spark', 'mend', 'light_heal', 'frost_bolt'], 'L8: + frost_bolt');
    assert.deepEqual(E.efirSpellsByLevel(30),
      ['spark', 'mend', 'light_heal', 'frost_bolt', 'fireball',
       'magic_shield', 'vine', 'greater_heal', 'ward', 'nature_blessing'],
      'L30: все 10 в порядке таблицы (5/8/10/12/15/20/25/30)');
    // Монотонность: L4 ⊆ L5 ⊆ L8 (заклинания не удаляются).
    const l4 = E.efirSpellsByLevel(4);
    const l5 = E.efirSpellsByLevel(5);
    const l8 = E.efirSpellsByLevel(8);
    for (const id of l4) assert.ok(l5.includes(id), 'L4 ⊆ L5: ' + id);
    for (const id of l5) assert.ok(l8.includes(id), 'L5 ⊆ L8: ' + id);
    // levelUp — АВТОМАТИЧЕСКИЙ append: L1 → L8 (пороги player.js),
    // книга состояния = таблица L8.
    const s = E.createEfir();
    E.addEfirXp(s, [1, 2, 3, 4, 5, 6, 7]
      .reduce((sum, lv) => sum + P.xpForNext(lv), 0));
    assert.equal(s.level, 8, 'L1 → L8');
    assert.deepEqual(s.spells, E.efirSpellsByLevel(8),
      'книга обновилась автоматически при level up');
    assert.deepEqual(s.spells, ['spark', 'mend', 'light_heal', 'frost_bolt'],
      'книга L8 — точный состав');
    // Повторный levelUp (без xp) — без дублей.
    E.levelUp(s);
    assert.deepEqual(s.spells, ['spark', 'mend', 'light_heal', 'frost_bolt'],
      'повторный levelUp — дублей нет');
    // append-only: ручное понижение уровня НЕ откатывает книгу.
    s.level = 4;
    E.levelUp(s);
    assert.deepEqual(s.spells, ['spark', 'mend', 'light_heal', 'frost_bolt'],
      'append-only: книга не откатывается при понижении уровня');
  });
});

test('000111 T4: ссылочная целостность — пул ⊆ assets/skills (зеркало primary/requires), книга ⊆ assets/spells; каталога assets/efir/ НЕТ', () => {
  const E = loadEfir();
  // Пул — ДАННЫЕ МОДУЛЯ (000053: данные в модуле, целостность — тестом).
  assert.ok(Array.isArray(E.EFIR_SKILLS),
    'EFIR_SKILLS — массив данных пула (данные модуля)');
  assert.deepEqual(E.EFIR_SKILLS.map((d) => d.id).sort(),
    ['firelord', 'icelord', 'perception', 'precog'],
    'пул ровно {firelord, icelord, perception, precog}');
  for (const def of E.EFIR_SKILLS) {
    assert.ok(SKILL_IDS.has(def.id),
      def.id + ' — в каталоге assets/skills (целостность 000053)');
    const meta = SKILL_META.get(def.id);
    assert.ok(meta, def.id + ' — мета каталога найдена');
    assert.equal(def.primary, meta.primary,
      def.id + ': primary == каталогу (зеркало)');
    if (def.requires == null) {
      assert.ok(!('requires' in meta),
        def.id + ': requires null ↔ поле отсутствует в каталоге');
    } else {
      assert.deepEqual(def.requires, meta.requires,
        def.id + ': requires == каталогу (зеркало)');
    }
  }
  // Вся книга (старт + таблица открытий) — в каталоге заклинаний.
  assert.ok(Array.isArray(E.EFIR_SPELL_UNLOCKS),
    'EFIR_SPELL_UNLOCKS — массив таблицы открытий (данные модуля)');
  const bookIds = ['spark', 'mend']
    .concat(E.EFIR_SPELL_UNLOCKS.map(([, id]) => id));
  assert.equal(new Set(bookIds).size, bookIds.length, 'дублей в книге нет');
  for (const id of bookIds) {
    assert.ok(SPELL_IDS.has(id),
      'заклинание ' + id + ' — в каталоге assets/spells (целостность 000053)');
  }
  // Каталог assets/efir/ НЕ существует (данные — данные модуля, 000053).
  assert.equal(fs.existsSync(path.join(ROOT, 'assets', 'efir')), false,
    'каталог assets/efir/ НЕ существует (данные — в модуле)');
});

test('000111 T5: потолок = основной атрибут НАВЫКА * 2 по ЕГО атрибутам; overflow банка за потолком хранится и конвертируется при росте потолка', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const capAt = (level, id) => {
      const s = E.createEfir();
      s.level = level;
      return E.efirSkillCap(s, id);
    };
    // Паттерн practiceCap (src/player.js:341) по ЕГО атрибутам:
    // firelord/icelord — Интеллект*2, perception/precog — Мудрость*2
    // (у Эфира значения атрибутов равны).
    assert.equal(capAt(1, 'firelord'), 6, 'L1 firelord: 3×2 = 6');
    assert.equal(capAt(3, 'firelord'), 8, 'L3 firelord: 4×2 = 8');
    assert.equal(capAt(5, 'firelord'), 10, 'L5 firelord: 5×2 = 10');
    for (const id of ['icelord', 'perception', 'precog']) {
      assert.equal(capAt(1, id), 6, 'L1 ' + id);
      assert.equal(capAt(3, id), 8, 'L3 ' + id);
      assert.equal(capAt(5, id), 10, 'L5 ' + id);
    }
    // id вне пула → 0 (паттерн practiceCap); state не объект → L1.
    assert.equal(E.efirSkillCap(E.createEfir(), 'not_a_skill'), 0,
      'id вне пула → 0');
    assert.equal(E.efirSkillCap(null, 'firelord'), 6,
      'state не объект → уровень 1 (6)');
    // Overflow: банк за потолком ХРАНИТСЯ (не бросается, в отличие от
    // _gainSkillXp игрока) и конвертируется при росте потолка.
    const s = E.createEfir();
    s.skillXp = { firelord: 999 };
    E.reprocessEfirSkills(s);
    assert.equal(s.skills.firelord, 6, 'L1: потолок 6');
    assert.equal(s.skillXp.firelord, 684,
      'overflow в банке: 999 − (15+30+45+60+75+90) = 684');
    // L3: потолок 8 — банк конвертируется дальше.
    s.xp = P.xpForNext(1) + P.xpForNext(2);
    assert.equal(E.levelUp(s), 2, 'L1 → L3');
    assert.equal(s.skills.firelord, 8,
      'L3: потолок 8 (999 − (315+105+120) = 459)');
    assert.equal(s.skillXp.firelord, 459, 'банк: 999 − 540 = 459');
  });
});

test('000111 T6: requires-цепочки (icelord ← firelord 5, precog ← perception 5): до гейта банк ЦЕЛИКОМ, после — полная конвертация', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // Пока firelord < 5: icelord НЕ растёт, банк — ЦЕЛИКОМ (ничего не
    // списано: уровень 0).
    const s = E.createEfir();
    s.skillXp = { icelord: 90 };
    E.reprocessEfirSkills(s);
    assert.equal(s.skills.icelord, 0, 'requires не выполнен — уровень 0');
    assert.equal(s.skillXp.icelord, 90, 'банк ЦЕЛИКОМ (90)');
    // firelord = 5 (225 = 15+30+45+60+75, банк 0) — ЦЕЛИКОМ конвертирован
    // накопленный банк icelord (15+30+45 = 90 → уровень 3).
    s.skillXp.firelord = 225;
    E.reprocessEfirSkills(s);
    assert.equal(s.skills.firelord, 5, 'firelord: 225 → уровень 5');
    assert.equal(s.skillXp.firelord, 0, 'firelord: банк 0');
    assert.equal(s.skills.icelord, 3,
      'icelord: банк 90 → уровень 3 (requires выполнен)');
    assert.equal(s.skillXp.icelord, 0, 'icelord: банк 0 (90 списан)');
    // Зеркально: precog ← perception 5.
    const s2 = E.createEfir();
    s2.skillXp = { precog: 90 };
    E.reprocessEfirSkills(s2);
    assert.equal(s2.skills.precog, 0, 'precog: requires не выполнен');
    assert.equal(s2.skillXp.precog, 90, 'precog: банк ЦЕЛИКОМ');
    s2.skillXp.perception = 225;
    E.reprocessEfirSkills(s2);
    assert.equal(s2.skills.perception, 5, 'perception: 225 → уровень 5');
    assert.equal(s2.skillXp.perception, 0, 'perception: банк 0');
    assert.equal(s2.skills.precog, 3, 'precog: банк 90 → уровень 3');
    assert.equal(s2.skillXp.precog, 0, 'precog: банк 0');
  });
});

test('000111 T7: переучёт — идемпотентность (×2 — без изменений), нормализация битых значений, уровень > cap → cap, null → []', () => {
  const E = loadEfir();
  // Идемпотентность: второй прогон ничего не меняет (неподвижная точка:
  // либо уровень = cap, либо банк < need(уровень)).
  const s = E.createEfir();
  s.skillXp = { firelord: 400, icelord: 90, perception: 77, precog: 5 };
  E.reprocessEfirSkills(s);
  const snap = JSON.parse(JSON.stringify({ skillXp: s.skillXp, skills: s.skills }));
  assert.deepEqual(E.reprocessEfirSkills(s), [],
    'второй прогон — изменений нет (возврат [])');
  assert.deepEqual({ skillXp: s.skillXp, skills: s.skills }, snap,
    'состояние идентично после второго переучёта');
  // Нормализация: банк не-число/отрицательный/NaN → 0; уровень не-число
  // → 0 (все id пула выводятся переучётом).
  const s2 = E.createEfir();
  s2.skillXp = { firelord: 'x', icelord: -1, perception: NaN };
  s2.skills = { firelord: 'z' };
  E.reprocessEfirSkills(s2);
  assert.deepEqual(s2.skillXp,
    { firelord: 0, icelord: 0, perception: 0, precog: 0 },
    'банк: не-число/−1/NaN → 0');
  assert.deepEqual(s2.skills,
    { firelord: 0, icelord: 0, perception: 0, precog: 0 },
    'уровни: не-число → 0');
  // Битый кэш за потолком — притёрт к cap (L1: 6).
  const s3 = E.createEfir();
  s3.skills = { firelord: 99 };
  E.reprocessEfirSkills(s3);
  assert.equal(s3.skills.firelord, 6, '99 > cap 6 → притёрт к 6');
  // null → [] без исключений.
  assert.deepEqual(E.reprocessEfirSkills(null), [], 'null → []');
});

test('000111 T8: levelUp-интеграция — один вызов: уровень + книга + переучёт (рост потолка); пороги 50/141/260/400 — регрессия R3', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const s = E.createEfir();
    // Банк заранее выше потолка L1 (6): overflow конвертируется при
    // росте потолка В ТОМ ЖЕ вызове.
    s.skillXp = { firelord: 999 };
    // Один «бой» — 4 уровня (пороги xpForNext 50/141/260/400 — те же,
    // что R3: регрессия механики xp БЕЗ ИЗМЕНЕНИЙ).
    const n = E.addEfirXp(s, 50 + 141 + 260 + 400);
    assert.equal(n, 4, '4 уровня (пороги R3)');
    assert.equal(s.level, 5, 'L1 → L5');
    assert.equal(s.xp, 0, 'остаток 0');
    // Книга — автоматически (L5: + light_heal).
    assert.deepEqual(s.spells, ['spark', 'mend', 'light_heal'],
      'книга авто-appended при level up (L5: light_heal)');
    // Переучёт — потолок вырос с 6 до 10: 999 − 825 (стоимость
    // уровней 1..10) = 174, уровень 10.
    assert.equal(s.skills.firelord, 10, 'firelord: потолок L5 = 10');
    assert.equal(s.skillXp.firelord, 174, 'overflow хранится в банке');
  });
});

test('000111 T9: боевая проекция — лечение от собственных attrs (L1: mend +7; L20: greater_heal +35), u.attrs 3×12; явных maxHP/damage в данных НЕТ', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const C = require('../src/combat.js');
    // Ленивый каталог (000045): в node-тесте spells.js не грузился —
    // ставим явно (паттерн tests/combat.test.js), после — восстанавливаем.
    const saveCatalog = C.combatInternals.allySpells;
    C.combatInternals.allySpells = require('../src/spells-data.js').SPELLS_BY_ID;
    try {
      const scenario = (state) => {
        const p = P.createCharacter();
        p.primary.constitution = 50;
        p.hp = 1; // раненый игрок — цель лечения (пул [игрок, союзники])
        const c = createCombat({
          player: p,
          allies: [E.efirAllyData(state)],
          mobs: ['wolf'], mobLevel: 2, seed: 5,
        });
        c.obstacles.clear();
        const w = c.units.find((x) => x.id === 'm0');
        w.x = 0; w.y = 0; // далеко — раунд не дотянется
        c._rng = () => 0.99; // (страховка) все атаки промах
        c.endTurn(); // игрок (не действует) → Эфир (support) → волк
        return c;
      };
      // L1: mend (степень 1, мудрость 3):
      // round((4 + 0.5·3 + 1)·1) = 7 — attrs в формуле allyHeal (000080).
      const c1 = scenario(E.createEfir());
      assert.ok(c1.log.includes('Эфир лечит Флогистон (+7).'),
        'L1: лог «Эфир лечит … (+7)» (attrs.wisdom в формуле): '
        + c1.log.join(' | '));
      // L20: greater_heal (степень 2, мудрость 12):
      // round((4 + 0.5·12 + 20)·1.15) = 35 — сильнейшая степень книги.
      const s2 = E.createEfir();
      while (s2.level < 20) {
        s2.xp = P.xpForNext(s2.level);
        E.levelUp(s2);
      }
      assert.equal(s2.level, 20, 'поднято до L20 (без хардкода суммы)');
      const c2 = scenario(s2);
      assert.ok(c2.log.includes('Эфир лечит Флогистон (+35).'),
        'L20: лог «Эфир лечит … (+35)» (greater_heal, степень 2): '
        + c2.log.join(' | '));
      const u = c2.units.find((x) => x.id === 'efir');
      assert.deepEqual(u.attrs,
        { intelligence: 12, wisdom: 12, constitution: 12 },
        'u.attrs — 3 собственных атрибута (L20: 3 + floor(19/2) = 12)');
      // Явных maxHP/damage в данных makeAlly НЕТ (D2: формульный путь
      // до 000112; регрессия смысла R7).
      const d = E.efirAllyData(s2);
      assert.ok(!('maxHP' in d),
        'явного maxHP в данных НЕТ (формульный путь)');
      assert.ok(!('damage' in d),
        'явного damage в данных НЕТ (формульный путь)');
    } finally {
      C.combatInternals.allySpells = saveCatalog;
    }
  });
});

// --- Задача 000115: сейв Эфира — финальная форма (аудит 000085 +
// пробелы ТЗ) ---
// КРАСНЫЙ: id-валидация по каталогам-параметрам + ОБЯЗАТЕЛЬНЫЙ
// reprocessEfirSkills ВНУТРИ deserializeEfir (канон 000111 §9 /
// efir.js:335–336) — функция существует, поведения НЕТ (AssertionError,
// не Syntax/ReferenceError). Контракт: memory/000115-efir-save-final.md
// (D2/D3). R1/R2 — без правок (новых экспортов НЕТ, require/ НЕТ).

test('000115: deserializeEfir — id-валидация по каталогам-параметрам (чужой id → null; валидные → 5 полей, ПЛОТНЫЕ 4 id пула) + ОБЯЗАТЕЛЬНЫЙ reprocess; тихая; Game НЕ нужен', () => {
  const E = loadEfir();
  // Каталоги — полные зеркала assets (записи, не только id-набор).
  assert.equal(SKILL_CATALOG.length, 37,
    'каталог skills: 37 записей (6 primary + 31 secondary)');
  assert.equal(SPELL_CATALOG.length, 16, 'каталог spells: 16 записей');

  // Чужой id (вне ЛЮБОГО каталога) → null — сброс ЗАПИСИ (000029).
  const base = { level: 1, xp: 0, skillXp: {}, skills: {}, spells: ['spark', 'mend'] };
  for (const [label, raw] of [
    ['skillXp', { ...base, skillXp: { nope: 1 } }],
    ['skills', { ...base, skills: { nope: 1 } }],
    ['spells', { ...base, spells: ['spark', 'nope'] }],
  ]) {
    assert.equal(
      E.deserializeEfir(raw, SKILL_CATALOG, SPELL_CATALOG), null,
      'чужой id → null (сброс ЗАПИСИ): ' + label);
  }

  // Каталогически-валидные id → состояние ровно 5 полей; ОБЯЗАТЕЛЬНЫЙ
  // reprocess материализует ВСЕ 4 id пула (выход — ПЛОТНЫЙ).
  const res = E.deserializeEfir({
    level: 2, xp: 5,
    skillXp: { firelord: 2.5 }, skills: { firelord: 1 },
    spells: ['spark', 'mend'],
  }, SKILL_CATALOG, SPELL_CATALOG);
  assert.ok(res !== null, 'каталогически-валидные id — приняты');
  assert.deepEqual(Object.keys(res).sort(),
    ['level', 'skillXp', 'skills', 'spells', 'xp'], 'ровно 5 полей');
  assert.deepEqual(res.skillXp,
    { firelord: 2.5, icelord: 0, perception: 0, precog: 0 },
    'skillXp — ВСЕ 4 id пула (reprocess, плотный выход)');
  assert.deepEqual(res.skills,
    { firelord: 1, icelord: 0, perception: 0, precog: 0 },
    'skills — ВСЕ 4 id пула (reprocess, плотный выход)');
  assert.deepEqual(res.spells, ['spark', 'mend'], 'spells — как в сейве');

  // Идемпотентность: round-trip на post-reprocess форме — идентично.
  assert.deepEqual(
    E.deserializeEfir(E.serializeEfir(res), SKILL_CATALOG, SPELL_CATALOG), res,
    'round-trip идентично на post-reprocess форме (идемпотентность)');

  // Тихая (warn печатает main.js) + serde ЧИСТЫЙ: Game НЕ нужен
  // (каталог — параметр; require/ и fs в модуле НЕТ — пин R1).
  const orig = console.warn;
  let n = 0;
  console.warn = () => { n += 1; };
  try {
    E.deserializeEfir({ ...base, skillXp: { nope: 1 } }, SKILL_CATALOG, SPELL_CATALOG);
  } finally {
    console.warn = orig;
  }
  assert.equal(n, 0, 'тихая: 0 console.warn');
});
