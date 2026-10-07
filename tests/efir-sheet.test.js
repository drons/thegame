// Задача 000144: Эфир на едином листе персонажа (follow-up 000139,
// P1, волна B) — КРАСНЫЕ тесты (TDD-станция).
//
// База: master c627b38 (000140 смержен — Game.Sheet в src/sheet.js).
// Падают, пока src/efir.js не переехал на лист (контракт
// memory/000144-efir-sheet.md): состояние Эфира = Game.Sheet (kind
// 'efir', 10 ключей: kind, level, xp, totalXp, points, primary,
// secondary, skillXp, skills, spells — npcId нет), XP/уровни/очки
// 2-за-уровень — через API Sheet (обёртки addEfirXp/levelUp),
// статки боя — derived-модификатор от primary (не от уровня),
// serde — sheet-лейаут + backfill старого 5-полевого формата.
//
// Краснота ОСМЫСЛЕННАЯ («функциональности нет»), не синтаксическая:
// модули существуют и грузятся, каталоги читаются; падение —
// AssertionError на отсутствии нового поведения:
//   * ES-1 — createEfir() → стартовый sheet (10 ключей; Int=Wis=Con=3,
//     остальные 1; начальный список {firelord:1, icelord:0,
//     perception:1, precog:0}) — сейчас: 5-полевой объект;
//   * ES-2 — XP → level → points = 2/уровень (addEfirXp — обёртка,
//     сигнатура не меняется) + totalXp; мусор — без мутаций; «голый»
//     объект без primary — деградация (xp копится, уровень не растёт)
//     — сейчас: полей points/totalXp нет, голый объект левелится;
//   * ES-3 — очки тратятся Game.Sheet на ЛИСТ ЭФИРА: raiseSkill на
//     начальных навыках (firelord) и на навыках ВНЕ пула (дерево
//     каталога 31: swordsman); requires-гейт (icelord ← firelord 5);
//     каскад reprocessSkillXp — сейчас: sheet не существует;
//   * ES-4 — боевые статки из primary (derived-модификатор, баланс
//     SPEC L801-812: L1 16/11); УРОВЕНЬ атрибуты больше НЕ растит
//     (рост — очками) — сейчас: таблица efirStats(level): L3 → 18/13;
//   * ES-5 — авто-разблокировки EFIR_SPELL_UNLOCKS (9 шт., 5/8/10/12/
//     15/20/22/25/30) накладываются на лист (append-only, без дублей),
//     сосуществование с очками — сейчас: на состоянии нет sheet-
//     лейаута/полей;
//   * ES-6 — serde: serializeEfir → sheet-лейаут (ровно 10 ключей);
//     deserializeEfir — старое 5-полевое JSON → BACKFILL в sheet
//     (primary по старт-формуле, кэш skills → secondary как есть,
//     points/totalXp 0, reprocess); INVALID обоих форматов → null;
//     serialize «голого» (без primary) → null — сейчас: serde —
//     5-полевой лейаут.
//
// e2e (vm-песочница, полная цепочка index.html) — tests/save.test.js
// ES-7: seed старого формата → boot → runtime-sheet → сейв
// (sheet-лейаут, version 1); INVALID-seed → warn + fresh sheet.
//
// Контракты: memory/000144-efir-sheet.md (создан на этой стадии),
// memory/000140-sheet-model.md (S-1..S-5: derived + ctx.modifier —
// ПОЛНЫЙ объект), memory/000139-skill-unification.md §4 C3 (сейв —
// осознанный пере-пин, комментарий «000139» — в коммите GREEN).
// ТЗ: tasks/pending/000144.md. Хелперы — по паттернам
// tests/efir.test.js (loadEfir/withGame/каталоги) и
// tests/sheet.test.js (прямой require sheet.js — node-ветка).
//
// Фирменное, что тесты НЕ трогают (зелёные без правок — инвариант
// TЗ): tests/efir.test.js (Вдох Эфира BR-1, практика PR-*, 100% XP
// R3-R5), tests/ui-efir.test.js (вкладка), tests/combat-ui.test.js
// (e2e 000081), tests/squad-panel.test.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const EFIR_PATH = path.join(ROOT, 'src', 'efir.js');
const P = require('../src/player.js');
// node-ветка sheet.js — прямые require (как tests/sheet.test.js):
// Game в node-тестах НЕ нужен.
const Sheet = require('../src/sheet.js');
const { createCombat } = require('../src/combat.js');

// --- Загрузка модуля (паттерн tests/efir.test.js) ---

function loadEfir() {
  try {
    return require(EFIR_PATH);
  } catch (e) {
    assert.fail('src/efir.js не существует или не грузится ' +
      '(задача 000081): ' + e.message);
  }
}

// ЛЕНИВЫЙ Game (прецедент tests/locations.test.js): efir.js читает
// globalThis.Game в момент ВЫЗОВА (lazyGame); в node-тесте Game.Sheet
// даём через тот же механизм (в браузере тег sheet.js вешает его сам).
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

// Game с порогом xp (исторически) + листом (000140/000144).
const gameWithXp = () => ({ xpForNext: P.xpForNext, Sheet });

// Каталоги — полные зеркала assets (id-валидация serde, 000115):
// skills — 37 записей (6 primary + 31 secondary), spells — 16.
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const SKILL_FILES = () => fs.readdirSync(SKILLS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f));
const SKILL_CATALOG = SKILL_FILES()
  .map((f) => JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')));
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const SPELL_FILES = () => fs.readdirSync(SPELLS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f));
const SPELL_CATALOG = SPELL_FILES()
  .map((f) => JSON.parse(fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')));

// Sheet-лейаут Эфира (10 ключей, без npcId — контракт 000144):
// отсортирован (пины — Object.keys().sort()).
const SHEET_KEYS = ['kind', 'level', 'points', 'primary', 'secondary',
  'skillXp', 'skills', 'spells', 'totalXp', 'xp'];
// Старт-формула (решение аудита; SPEC «Дух Эфира» — тройка 3,
// остальные 1): эквивалентно старой таблице a = 3 при L1.
const START_PRIMARY = { strength: 1, dexterity: 1, constitution: 3,
  intelligence: 3, wisdom: 3, charisma: 1 };
// Начальный список (решение Q-1): firelord/perception — 1 (подарок),
// icelord/precog — 0 (requires-инвариант единого дерева).
const INIT_LIST = { firelord: 1, icelord: 0, perception: 1, precog: 0 };

// Сильный игрок для боевой сцены (много HP — сам не умирает).
function hero() {
  const p = P.createCharacter();
  p.primary.constitution = 50;
  return p;
}

test('000144 ES-1: createEfir() — стартовый sheet kind "efir" (ровно 10 ключей): Int/Wis/Con = 3, остальные 1; начальный список {firelord:1, icelord:0, perception:1, precog:0}; spells [spark, mend]; skillXp чист', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const s = E.createEfir();
    assert.deepEqual(Object.keys(s).sort(), SHEET_KEYS,
      'состояние — sheet (10 ключей, без npcId; 000139: единый лист)');
    assert.equal(s.kind, 'efir', "kind — 'efir'");
    assert.equal(s.level, 1);
    assert.equal(s.xp, 0);
    assert.equal(s.totalXp, 0);
    assert.equal(s.points, 0, 'свободных очков нет (первый уровень)');
    assert.deepEqual(s.primary, START_PRIMARY,
      'primary: Int/Wis/Con = 3 (старая таблица a=3 при L1), ' +
      'остальные 1 (решение аудита)');
    assert.deepEqual(s.secondary, INIT_LIST,
      'secondary — НАЧАЛЬНЫЙ СПИСОК (уровни 1 по ТЗ; icelord/precog 0 — ' +
      'requires-инвариант: firelord/perception < 5)');
    assert.deepEqual(s.skills, INIT_LIST,
      'skills — зеркало начального списка (данные вкладки 000116)');
    assert.notEqual(s.secondary, s.skills,
      'зеркало — отдельный объект (НЕ live-алиас secondary)');
    assert.deepEqual(s.skillXp, {}, 'skillXp — пустой банк на старте');
    assert.deepEqual(s.spells, ['spark', 'mend'],
      'spells — стартовая книга [spark, mend] (ТЗ 000111 — без изменений)');
    // Вызовы независимы (пул/книга изолированы).
    const s2 = E.createEfir();
    assert.notEqual(s, s2, 'вызовы независимы');
    assert.notEqual(s.primary, s2.primary, 'primary — независимы');
    assert.notEqual(s.secondary, s2.secondary, 'secondary — независимы');
    assert.notEqual(s.skills, s2.skills, 'skills — независимы');
    assert.notEqual(s.skillXp, s2.skillXp, 'skillXp — независимы');
    assert.notEqual(s.spells, s2.spells, 'spells — независимы');
  });
});

test('000144 ES-2: XP → level → points = 2/уровень (addEfirXp — обёртка, сигнатура не меняется) + totalXp; мусор — без мутаций; «голый» объект (без primary) — деградация: xp копится, уровень не растёт, 0 исключений, console.error', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const s = E.createEfir();
    // +50 → L2: 2 очка, totalXp 50 (возврат — count уровней, как R3).
    assert.equal(E.addEfirXp(s, 50), 1, '+50 → 1 уровень (count)');
    assert.equal(s.level, 2);
    assert.equal(s.xp, 0, 'остаток 0');
    assert.equal(s.points, 2, '2 очка за уровень (SPEC/ТЗ 000139)');
    assert.equal(s.totalXp, 50,
      'totalXp — накопленный xp (xpMult = 1: scholar у Эфира нет)');
    // +141 (xpForNext(2)) → L3: 4 очка.
    assert.equal(E.addEfirXp(s, 141), 1, '+141 → 1 уровень');
    assert.equal(s.level, 3);
    assert.equal(s.xp, 0);
    assert.equal(s.points, 4, '4 очка (2×2)');
    assert.equal(s.totalXp, 191, 'totalXp копится');
    // Мусорный ввод → 0, state НЕ мутирован (оба мира — поля листа).
    for (const bad of [0, -5, NaN, undefined, 'мусор']) {
      assert.equal(E.addEfirXp(s, bad), 0, 'amount ' + String(bad) + ' → 0');
    }
    assert.equal(s.level, 3);
    assert.equal(s.xp, 0);
    assert.equal(s.points, 4, 'points не мутирован');
    assert.equal(s.totalXp, 191, 'totalXp не мутирован');
    assert.equal(E.addEfirXp(null, 50), 0, 'state null → 0');
    // «Голый» 5-полевой объект (без primary) — легальный вход, НЕ crash:
    // деградационный путь (лист не распознан): xp накапливается,
    // уровень НЕ растёт, console.error — видимая деградация.
    const bare = { level: 1, xp: 0, skillXp: {}, skills: {},
      spells: ['spark', 'mend'] };
    const errors = [];
    const realError = console.error;
    console.error = (m) => errors.push(String(m));
    let n;
    try {
      assert.doesNotThrow(
        () => { n = E.addEfirXp(bare, 60); },
        'исключений 0 (игра не падает)');
    } finally {
      console.error = realError;
    }
    assert.equal(n, 0, 'деградация: уровень не растёт');
    assert.equal(bare.xp, 60, 'xp копится');
    assert.equal(bare.level, 1, 'уровень не растёт (нет primary → нет листа)');
    assert.ok(errors.length >= 1,
      'console.error записан (видимая деградация, паттерн 000053)');
  });
});

test('000144 ES-3: очки тратятся Game.Sheet на лист Эфира — raiseSkill на начальных навыках (firelord) и на навыках ВНЕ пула (дерево каталога 31: swordsman); requires-гейт (icelord ← firelord 5, precog ← perception 5); каскад reprocessSkillXp при росте primary', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    const s = E.createEfir();
    // 2 уровня (пороги 50/141) — 4 очка.
    assert.equal(E.addEfirXp(s, 50 + 141), 2, '2 уровня');
    assert.equal(s.level, 3);
    assert.equal(s.points, 4, '4 очка (2/уровень)');
    // Начальный навык (из начального списка): очко → L2.
    assert.equal(Sheet.canRaise(s, 'firelord').ok, true,
      'firelord — начальный, поднять можно');
    const r = Sheet.raiseSkill(s, 'firelord');
    assert.equal(r.ok, true, 'raiseSkill firelord — ok');
    assert.equal(r.level, 2, 'firelord 1 → 2');
    assert.equal(s.secondary.firelord, 2);
    assert.equal(s.points, 3, 'очко списано');
    // requires-гейт единого дерева: icelord ← firelord 5 (имеем 2),
    // precog ← perception 5 (имеем 1).
    assert.equal(Sheet.canRaise(s, 'icelord').ok, false,
      'icelord — требует firelord 5 (гейт дерева)');
    assert.equal(Sheet.canRaise(s, 'precog').ok, false,
      'precog — требует perception 5 (гейт дерева)');
    // Навык ВНЕ пула Эфира — полное дерево 31 доступно очками
    // (ТЗ: «полное дерево 31 навыка — доступно очками»): swordsman —
    // primary strength ≥ 1, requires нет.
    const r2 = Sheet.raiseSkill(s, 'swordsman');
    assert.equal(r2.ok, true, 'swordsman — ок (дерево каталога)');
    assert.equal(r2.level, 1, 'swordsman → L1');
    assert.equal(s.secondary.swordsman, 1);
    assert.equal(s.points, 2, 'второе очко списано');
    // Каскад (SH-3, дословно для листа): застрявший банк вторичного
    // конвертируется при росте потолка (wisdom 3 → 4: cap 6 → 8).
    const s2 = E.createEfir();
    assert.equal(E.addEfirXp(s2, 50), 1, '1 уровень — 2 очка');
    s2.skillXp.perception = 60; // банк (perception — начальный, L1)
    const r3 = Sheet.raiseSkill(s2, 'wisdom');
    assert.equal(r3.ok, true, 'raiseSkill wisdom — ok');
    assert.equal(r3.level, 4, 'wisdom 3 → 4');
    assert.deepEqual(r3.skillLevels, ['perception'],
      'каскад reprocessSkillXp в возврате (потолок 6 → 8)');
    // 60: 30 (1→2) → 30; 45 (2→3) не достигается.
    assert.equal(s2.secondary.perception, 2, 'каскад: perception 1 → 2');
    assert.equal(s2.skillXp.perception, 30, 'каскад: банк 60 → 30');
    assert.equal(s2.points, 1, 'очко списано на wisdom');
  });
});

test('000144 ES-4: боевые статки — из primary (derived-модификатор, баланс SPEC L801-812: L1 maxHP 16 / maxMP 11); УРОВЕНЬ атрибуты не растит (рост — очками: raiseSkill primary)', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // Профиль боя (паттерн EF-2: buildEfirUnit — только числа).
    const profile = (state) => {
      const p = hero();
      const c = createCombat({
        player: p, allies: [E.efirAllyData(state)],
        mobs: ['wolf'], mobLevel: 2, seed: 5,
      });
      c.obstacles.clear();
      return E.buildEfirUnit(state, c);
    };
    // L1 — инвариант баланса (табличным числам 000111 T1):
    // maxHP = 10 + 2·Con(3) = 16; maxMP = 5 + Int(3) + Wis(3) = 11.
    const s1 = E.createEfir();
    const u1 = profile(s1);
    assert.equal(u1.maxHP, 16, 'L1: maxHP = 10 + 2·3 = 16');
    assert.equal(u1.hp, 16, 'hp = maxHP (100% на старте боя)');
    assert.equal(u1.mp, 11, 'L1: maxMP = 5 + 3 + 3 = 11 (своя мана)');
    assert.deepEqual(u1.attrs,
      { intelligence: 3, wisdom: 3, constitution: 3 },
      'attrs — 3 собственных атрибута из primary (L1)');
    // УРОВЕНЬ атрибуты больше НЕ растит (000139: рост — очками).
    assert.equal(E.addEfirXp(s1, 50 + 141), 2, 'L1 → L3 (без хардкода)');
    assert.equal(s1.level, 3);
    const u3 = profile(s1);
    assert.equal(u3.maxHP, 16,
      'L3 (очки НЕ потрачены): атрибуты не выросли от уровня');
    assert.equal(u3.mp, 11, 'L3: мана не выросла от уровня');
    assert.deepEqual(u3.attrs,
      { intelligence: 3, wisdom: 3, constitution: 3 },
      'attrs L3 (без очков) = primary (3/3/3)');
    // ОЧКИ растят атрибуты: L3 — 4 очка.
    assert.equal(s1.points, 4, 'L3: 4 очка (2×2)');
    assert.equal(Sheet.raiseSkill(s1, 'wisdom').ok, true, 'wisdom +1');
    assert.equal(Sheet.raiseSkill(s1, 'constitution').ok, true, 'con +1');
    assert.equal(s1.points, 2, '2 очка потрачены');
    const u4 = profile(s1);
    assert.equal(u4.maxHP, 18, 'Con 4 → maxHP = 10 + 2·4 = 18');
    assert.equal(u4.mp, 12, 'Wis 4 → maxMP = 5 + 3 + 4 = 12');
    assert.deepEqual(u4.attrs,
      { intelligence: 3, wisdom: 4, constitution: 4 },
      'attrs — из primary (очки)');
    // «Касание духа» — от wisdom: round((2 + 0.5·4)·1) = 4.
    assert.equal(u4.damage, 4, 'Касание = max(1, round((2 + 0.5·4)·1)) = 4');
  });
});

test('000144 ES-5: авто-разблокировки EFIR_SPELL_UNLOCKS (9 шт., 5/8/10/12/15/20/22/25/30) накладываются на лист: append-only, без дублей; сосуществование с очками (2/уровень); данные таблицы не меняются', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // Данные — без изменений (фирменное, ТЗ: «СОХРАНЕНЫ»): 9 строк,
    // канонический порядок порогов.
    assert.deepEqual(E.EFIR_SPELL_UNLOCKS, [
      [5, 'light_heal'], [8, 'frost_bolt'], [10, 'fireball'],
      [12, 'magic_shield'], [15, 'vine'], [20, 'greater_heal'],
      [22, 'resurrect'], [25, 'ward'], [30, 'nature_blessing'],
    ], 'EFIR_SPELL_UNLOCKS — данные без изменений (9 шт.)');
    const s = E.createEfir();
    const toLevel = (lv) => {
      while (s.level < lv) {
        s.xp = P.xpForNext(s.level);
        E.levelUp(s);
      }
    };
    toLevel(5);
    assert.deepEqual(Object.keys(s).sort(), SHEET_KEYS,
      'состояние на любом уровне — sheet (10 ключей)');
    assert.equal(s.level, 5, 'L1 → L5 (levelUp-цикл, без хардкода сумм)');
    assert.equal(s.points, 8, 'L5: 4 уровня × 2 очка (сосуществование)');
    assert.deepEqual(s.spells, ['spark', 'mend', 'light_heal'],
      'L5: авто-разблокировка light_heal (порог 5)');
    toLevel(8);
    assert.deepEqual(s.spells,
      ['spark', 'mend', 'light_heal', 'frost_bolt'], 'L8: + frost_bolt');
    toLevel(12);
    assert.deepEqual(s.spells,
      ['spark', 'mend', 'light_heal', 'frost_bolt', 'fireball',
       'magic_shield'], 'L12: + fireball, magic_shield');
    toLevel(30);
    assert.deepEqual(s.spells,
      ['spark', 'mend', 'light_heal', 'frost_bolt', 'fireball',
       'magic_shield', 'vine', 'greater_heal', 'resurrect', 'ward',
       'nature_blessing'],
      'L30: все 11 (старт 2 + 9 разблокировок) в каноническом порядке');
    assert.equal(new Set(s.spells).size, s.spells.length,
      'append-only: дублей в книге нет');
    assert.equal(s.points, 58, 'L30: 29 уровней × 2 очка (механики вместе)');
  });
});

test('000144 ES-6: serde — serializeEfir → sheet-лейаут (ровно 10 ключей, без npcId); deserializeEfir — старое 5-полевое JSON (фикс) → BACKFILL в sheet (primary — старт, кэш skills → secondary как есть, points/totalXp = 0, ОБЯЗАТЕЛЬНЫЙ reprocess); INVALID (оба формата) → null; serialize «голого» (без primary) → null', () => {
  const E = loadEfir();
  // Фиксированное JSON СТАРОГО формата (000115-лейаут 5 полей):
  // банк 999 за потолком L1 (cap 6), кэш firelord 3, L5-книга.
  const OLD = {
    level: 5, xp: 20,
    skillXp: { firelord: 999 },
    skills: { firelord: 3 },
    spells: ['spark', 'mend', 'light_heal'],
  };
  // Backfill (решение D-H): level/xp/skillXp/spells — 1:1; primary —
  // старт-формула (cap = Int 3×2 = 6); secondary — кэш КАК ЕСТЬ
  // (reprocess: 3 → 6, банк 999 − (60+75+90) = 774); points/totalXp 0.
  const s = E.deserializeEfir(OLD, SKILL_CATALOG, SPELL_CATALOG);
  assert.ok(s !== null, 'старый 5-полевой лейаут — принят (backfill)');
  assert.deepEqual(Object.keys(s).sort(), SHEET_KEYS,
    'выход — sheet-лейаут (10 ключей, без npcId)');
  assert.equal(s.kind, 'efir');
  assert.equal(s.level, 5, 'level — перенесён 1:1');
  assert.equal(s.xp, 20, 'xp — перенесён 1:1');
  assert.equal(s.totalXp, 0, 'totalXp — истории нет → 0 (ТЗ-аналог)');
  assert.equal(s.points, 0, 'points = 0 (ТЗ)');
  assert.deepEqual(s.primary, START_PRIMARY, 'primary — старт-формула');
  assert.deepEqual(s.secondary,
    { firelord: 6, icelord: 0, perception: 0, precog: 0 },
    'secondary: кэш как есть + reprocess (cap 6; плотный 4 id)');
  assert.deepEqual(s.skills,
    { firelord: 6, icelord: 0, perception: 0, precog: 0 },
    'skills — зеркало (плотный 4 id)');
  assert.deepEqual(s.skillXp,
    { firelord: 774, icelord: 0, perception: 0, precog: 0 },
    'skillXp: 999 − 225 (уровни 4/5/6) = 774 (плотный 4 id)');
  assert.deepEqual(s.spells, ['spark', 'mend', 'light_heal'],
    'spells — сохранены');
  // serializeEfir — sheet-лейаут (ровно 10 ключей; копия по значениям).
  const snap = E.serializeEfir(s);
  assert.ok(snap !== null, 'serializeEfir(sheet) — не null');
  assert.deepEqual(Object.keys(snap).sort(), SHEET_KEYS,
    'serialize — ровно 10 ключей (C3: раздел сейва = sheet-лейаут)');
  assert.deepEqual(snap, s, 'снимок — идентичен по значениям');
  // Round-trip на sheet-форме — идентично (неподвижная точка
  // reprocess: firelord уже = cap 6 → while (level < cap) не крутится,
  // банк 774 (за потолком — overflow) не списывается).
  assert.deepEqual(E.deserializeEfir(snap, SKILL_CATALOG, SPELL_CATALOG), s,
    'round-trip идентично (идемпотентность)');
  // Отсутствующий ключ primary → 1 (не null — решение R-11: подделка
  // primary 1e15 → while-зависание reprocess невозможна).
  const sMissing = E.deserializeEfir({ ...snap, primary: {} },
    SKILL_CATALOG, SPELL_CATALOG);
  assert.ok(sMissing !== null, 'пустой primary — принят (ключи → 1)');
  assert.deepEqual(sMissing.primary,
    { strength: 1, dexterity: 1, constitution: 1, intelligence: 1,
      wisdom: 1, charisma: 1 },
    'отсутствующий ключ primary → 1');
  // INVALID — СТАРЫЙ формат (000115-правила действуют и на backfill).
  assert.equal(E.deserializeEfir({ ...OLD, skills: { nope: 1 } },
    SKILL_CATALOG, SPELL_CATALOG), null, 'старый формат: чужой id → null');
  assert.equal(E.deserializeEfir({
    level: 2000000, xp: 0, skillXp: {}, skills: {}, spells: ['spark'],
  }, SKILL_CATALOG, SPELL_CATALOG), null,
    'старый формат: level > 1e6 → null (D5-граница)');
  // INVALID — НОВЫЙ формат (sheet-лейаут с мусором).
  for (const [label, raw] of [
    ['kind "x"', { ...snap, kind: 'x' }],
    ['level "x"', { ...snap, level: 'x' }],
    ['xp −1', { ...snap, xp: -1 }],
    ['points −1', { ...snap, points: -1 }],
    ['primary: "x"', { ...snap, primary: { intelligence: 'x' } }],
    ['primary: 1e15', { ...snap, primary: { intelligence: 1e15 } }],
    ['secondary: чужой id', { ...snap, secondary: { nope: 1 } }],
    ['spells: чужой id', { ...snap, spells: ['spark', 'nope'] }],
  ]) {
    assert.equal(E.deserializeEfir(raw, SKILL_CATALOG, SPELL_CATALOG), null,
      'новый формат: ' + label + ' → null');
  }
  // serializeEfir — «голый» 5-полевой объект (нет primary) → null
  // (решение D-F: backfill-пути в serialize НЕТ — после 000144
  // runtime-эфир ВСЕГДА лист).
  assert.equal(E.serializeEfir(OLD), null,
    'serialize: не-лист (нет primary) → null');
  assert.equal(E.serializeEfir(42), null, 'serialize: не plain → null');
  assert.equal(E.serializeEfir(null), null, 'serialize: null → null');
});

// --- Правки по итогам ревью (000144) ---

test('000144 RF-1: 3-полевой legacy-сейв (до 000111, без spells) — боевой XP БЕЗ левелапа восстанавливает книгу до таблицы уровня (appendSpells безусловно — поведение master 000111)', () => {
  withGame(gameWithXp(), () => {
    const E = loadEfir();
    // Лейаут, закреплённый пином 000085 (до 000111): поля spells
    // нет → backfill spells = EFIR_SPELL_START [spark, mend]
    // (НЕ из уровня, 000115).
    const s = E.deserializeEfir(
      { level: 10, xp: 0, skillXp: {}, skills: {} },
      SKILL_CATALOG, SPELL_CATALOG);
    assert.ok(s, '3-полевой legacy-лейаут — принят (backfill)');
    assert.equal(s.level, 10, 'level — перенесён 1:1');
    assert.deepEqual(s.spells, ['spark', 'mend'],
      'backfill: spells нет → старт [spark, mend]');
    // Боевой XP ниже порога (xpForNext(10) = 1581): n = 0.
    // master 000111: levelUp БЕЗУСЛОВНО (даже при n = 0) дополнял
    // книгу до таблицы уровня на каждом addEfirXp — книга
    // восстанавливается при ПЕРВОМ боевом XP, а не на следующем
    // левелапе (ревью 000144: регрессия «if (n > 0)»).
    const n = E.addEfirXp(s, 16);
    assert.equal(n, 0, '16 < xpForNext(10) — уровень не растёт');
    assert.equal(s.level, 10, 'уровень не мутирован');
    assert.deepEqual(s.spells, E.efirSpellsByLevel(10),
      'n = 0 — книга восстановлена до таблицы L10 (master 000111)');
    assert.deepEqual(s.spells,
      ['spark', 'mend', 'light_heal', 'frost_bolt', 'fireball'],
      'L10: старт + пороги 5/8/10');
    // Повторный XP — дублей нет (append-only, идемпотентность).
    E.addEfirXp(s, 100);
    assert.deepEqual(s.spells,
      ['spark', 'mend', 'light_heal', 'frost_bolt', 'fireball'],
      'повторный XP — дублей в книге нет');
  });
});
