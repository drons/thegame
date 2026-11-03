// Школа NPC: лимит 10 обучений за уровень персонажа + очки обучения
// (задача 000298) — КРАСНЫЕ тесты (ядро, node).
// Код игры (src/npc.js, src/sheet.js, src/player.js,
// src/building-actions.js, src/ui-tab-skills.js) НЕ меняется на
// красной стадии: поле бюджета trainPoints в лейауте героя, ветка
// лимита в canSchoolTrain, декремент в schoolTrain, плоский сброс в
// ДВУХ точках level-up (addXp + зеркало grantXpRaw), строка
// sanitizeSavedHero, панель [I] — зелёная стадия (конвенция lane
// 000296/000297: красные закоммичены, реализация — тем же коммитом).
//
// Контракт: memory/000298-npc-school-level-limit.md (D1–D9, §5 L1–L5):
//   L1. fresh-герой: trainPoints = 10; 10 × schoolTrain(swordsman) —
//       цены 20/30/60/110/180/270/380/510/660/830 (Σ 3050), после
//       i-го — 10−i (пошагово); 11-е — {ok:false, reason:'нет очков
//       обучения на этом уровне'}; can/execute — тот же reason
//       дословно; ПОРЯДОК причин: бюджет ДО золота (c2: trainPoints 0
//       И gold 0 → причина = бюджет, не «мало золота»); отказ 11-го
//       не трогает gold/points/secondary.
//   L2. Счётчик учебным ДЕЙСТВИЯМ, не навыкам (swordsman ×5 + heavy
//       ×5 → 0); персонаж БЕЗ поля (delete) — обучение ok:true, поле
//       остаётся undefined (НЕ NaN), canSchoolTrain ok:true
//       (typeof-guard).
//   L3. Ап-левел — ПЛОСКИЙ сброс в 10 в ДВУХ точках: (a) addXp —
//       10 (0) → level 2 → 10, 11-е ok (swordsman 11); (b)
//       мульти-джамп +3 уровня → 10 (ПЛОСКО, не 35); (c) ЗЕРКАЛО
//       grantXpRaw (рунический камень 000074, полный пайплайн
//       onBuildingAction: два «золотых» дня × 25 XP (stoneXp при
//       Рунописи 5) = xpForNext(1) → level 2 → trainPoints 10).
//   L4. sanitizeSavedHero: legacy-сейв (поля нет) → 10; валидные
//       0/7/10 — как есть; подделка 14/−1/'3'/1.5/null → 10; ядро
//       clean (level/xp/gold/hp/mp/points/primary/secondary/skillXp)
//       — без изменений.
//   L5. Инварианты: 10-й успех — deepEqual {ok:true, level:10,
//       price:830} (НИКАКИХ доп. полей в результате); 11-й отказ —
//       gold/points/навык/хук не изменились; craftReprocessHook
//       (000046) — 10 вызовов на 10 успехов (регрессия «школа
//       поднимает потолок крафта»).
//
// Краснота ОСМЫСЛЕННАЯ (все модули грузятся; падение — ассерты на
// отсутствующем поле/поведении, не SyntaxError):
//   L1 — h.trainPoints undefined (поля нет в лейауте); 11-е —
//       ok:true (лимиты нет); порядок причин — «мало золота»;
//   L2 — trainPoints undefined после первого обучения;
//   L3 — сброса нет (0 / 5 после ап-левела — trainPoints не трогается);
//   L4 — clean.trainPoints undefined (поле не в выходе sanitize);
//   L5 — 11-е — успех, gold изменился.
// Новых src/-файлов и script-тегов на RED-стадии НЕТ.
//
// expectedRedCount (файл) = 5 (L1, L2, L3, L4, L5).
// Файл НЕ содержит литерала «SPEC» + «453» (скан-тест SPEC-453-GONE
// в tests/spec-split.test.js читает tests/; needle — из частей).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/player.js');
const S = require('../src/sheet.js');
const N = require('../src/npc.js');

// Фикстура школы — ДУБЛЬ 1:1 trainNpc из tests/npc.test.js
// (конвенция дублирования фикстур/стабов).
const trainNpc = {
  id: 't',
  имя: 'Каркаш',
  роль: 'наставник',
  постройки: [7],
  диалог: [
    { id: 'open', текст: 'Тренировка — или просто смотри?', действие: 'обучение' },
    { id: 'char', текст: 'Слух для решительных', действие: 'подсказка', требования: { харизма: 3 } },
    { id: 'orator', текст: 'Слух для красноречивых', действие: 'подсказка', требования: { навык: { id: 'orator', уровень: 2 } } },
    { id: 'check', текст: 'Слух для знатоков', действие: 'подсказка', требования: { проверка: 3 } },
  ],
  обучение: {
    навыки: ['swordsman', 'heavy', 'archer', 'accuracy'],
    цена_за_уровень: 25,
    цена_переноса_за_уровень: 40,
  },
};

// 10 шагов swordsman 0→10: 20 + 10·L² (L = 0..9), Σ = 3050.
const TEN_PRICES = [20, 30, 60, 110, 180, 270, 380, 510, 660, 830];
const TEN_SUM = TEN_PRICES.reduce((a, b) => a + b, 0);

test('000298 L1: 11-е обучение на том же уровне — заблокировано (бюджет 10; reason «нет очков обучения на этом уровне»; порядок причин: бюджет до золота)', () => {
  const c = P.createCharacter();
  c.gold = 1000000;
  assert.equal(c.trainPoints, 10,
    'fresh-герой: trainPoints = 10 (полный бюджет уровня)');
  for (let i = 0; i < 10; i++) {
    const r = N.schoolTrain(trainNpc, c, 'swordsman');
    assert.equal(r.ok, true, 'обучение #' + (i + 1) + ' — ok');
    assert.equal(r.price, TEN_PRICES[i],
      'цена шага L=' + i + ' — ' + TEN_PRICES[i]);
    assert.equal(c.trainPoints, 10 - (i + 1),
      'после #' + (i + 1) + ' — остаток ' + (10 - (i + 1)));
  }
  assert.equal(c.gold, 1000000 - TEN_SUM,
    'золото −' + TEN_SUM + ' (сумма 10 шагов 20 + 10·L²)');
  assert.equal(c.points, 0, 'свободные очки НЕ тратятся');
  const r11 = N.schoolTrain(trainNpc, c, 'swordsman');
  assert.deepEqual(r11,
    { ok: false, reason: 'нет очков обучения на этом уровне' },
    '11-е на том же уровне — заблокировано: ' + JSON.stringify(r11));
  assert.deepEqual(N.canSchoolTrain(trainNpc, c, 'swordsman'),
    { ok: false, reason: 'нет очков обучения на этом уровне' },
    'can/execute — тот же reason дословно (одно ядро)');
  assert.equal(c.gold, 1000000 - TEN_SUM, 'отказ — золото не тратится');
  assert.equal(c.secondary.swordsman, 10, 'отказ — навык не поднимается');

  // Порядок причин: бюджет ДО золота (двойная нехватка — видна
  // причина бюджета, не «мало золота»).
  const c2 = P.createCharacter();
  c2.trainPoints = 0;
  c2.gold = 0;
  assert.deepEqual(N.canSchoolTrain(trainNpc, c2, 'swordsman'),
    { ok: false, reason: 'нет очков обучения на этом уровне' },
    'trainPoints 0 И gold 0 — причина = бюджет (порядок проверок)');
});

test('000298 L2: счётчик учебным действиям (не навыкам): смешанные 10 → 0; персонаж без поля — typeof-guard (ok, без NaN)', () => {
  const c = P.createCharacter();
  c.gold = 1000000;
  // Swordsman ×5 (heavy требует swordsman 5 — порядок важен).
  // Бюджет 10 (D3): после i-го (0-based) — 10 − (i+1) (пошагово,
  // как L1; зелёная стадия: в красном варианте здесь было 5 − i).
  for (let i = 0; i < 5; i++) {
    assert.equal(N.schoolTrain(trainNpc, c, 'swordsman').ok, true);
    assert.equal(c.trainPoints, 10 - (i + 1),
      'swordsman #' + (i + 1) + ' — остаток ' + (10 - (i + 1)));
  }
  for (let i = 0; i < 5; i++) {
    assert.equal(N.schoolTrain(trainNpc, c, 'heavy').ok, true);
    assert.equal(c.trainPoints, 5 - (i + 1),
      'heavy #' + (i + 1) + ' — остаток ' + (5 - (i + 1)));
  }
  assert.equal(c.secondary.swordsman, 5, 'swordsman 5');
  assert.equal(c.secondary.heavy, 5, 'heavy 5');
  assert.equal(c.trainPoints, 0,
    'лимит — на ДЕЙСТВИЯ (10), а не per-skill: смешанные 10 → 0');
  assert.equal(N.canSchoolTrain(trainNpc, c, 'swordsman').ok, false,
    'на исчерпанном бюджете — отказ');

  // Персонаж БЕЗ поля (синтетический лист): typeof-guard — обучение
  // проходит, поле не рождается (undefined, НЕ NaN).
  const g = P.createCharacter();
  g.gold = 1000000;
  delete g.trainPoints;
  const r = N.schoolTrain(trainNpc, g, 'swordsman');
  assert.equal(r.ok, true, 'без поля — обучение ok:true');
  assert.equal(r.level, 1, 'без поля — +1 уровень навыка');
  assert.equal(g.trainPoints, undefined,
    'без поля — поле остаётся undefined (guard, не NaN)');
  assert.equal(N.canSchoolTrain(trainNpc, g, 'swordsman').ok, true,
    'без поля — can ok:true (typeof-guard)');
});

test('000298 L3: ап-левел — плоский сброс в 10: (a) addXp; (b) мульти-джамп — 10, не 10×N; (c) зеркало grantXpRaw (рунический камень, полный пайплайн onBuildingAction)', () => {
  // (a) Основной путь: 10 обучений (0) → addXp → level 2 → 10.
  const c = P.createCharacter();
  c.gold = 1000000;
  for (let i = 0; i < 10; i++) {
    assert.equal(N.schoolTrain(trainNpc, c, 'swordsman').ok, true);
  }
  assert.equal(c.trainPoints, 0, 'до ап-левела — остаток 0');
  const res = P.addXp(c, P.xpForNext(1));
  assert.equal(res.levelsGained, 1, 'addXp(xpForNext(1)) — 1 уровень');
  assert.equal(c.level, 2, 'level 1→2');
  assert.equal(c.trainPoints, 10,
    'ап-левел (addXp) — ПЛОСКИЙ сброс в 10 (остаток не переносится)');
  const r11 = N.schoolTrain(trainNpc, c, 'swordsman');
  assert.equal(r11.ok, true, '11-е на НОВОМ уровне — снова доступно');
  assert.equal(r11.level, 11, 'swordsman 11');
  assert.equal(c.trainPoints, 9, 'после 11-го — 9 (новый бюджет)');

  // (b) Мульти-джамп: +3 уровня за один addXp → 10 (ПЛОСКО).
  const m = P.createCharacter();
  m.trainPoints = 5;
  const jumped = P.addXp(
    m, P.xpForNext(1) + P.xpForNext(2) + P.xpForNext(3));
  assert.equal(jumped.levelsGained, 3, 'мульти-джамп — 3 уровня');
  assert.equal(m.level, 4, 'level 1→4');
  assert.equal(m.trainPoints, 10,
    'мульти-джамп — плоский сброс в 10 (НЕ 10×3 и не 5+10)');

  // (c) ЗЕРКАЛО grantXpRaw (src/building-actions.js, 000074: рунический
  // камень; ЕДИНСТВЕННЫЙ вызов — grantXpRaw(deps.hero, r.xp)): полный
  // пайплайн onBuildingAction. Два «золотых» дня успеха тест находит
  // САМ по детерминированному роллу (seed STNR, tile (5,7)) — стабильно.
  const BA = require('../src/building-actions.js');
  const BE = require('../src/building-effects.js');
  const B = require('../src/buildings.js');
  const PL = require('../src/perlin.js');
  const hero = S.createSheet('hero');
  hero.secondary.runes = 5; // Рунопись 5 → шанс 0.5, stoneXp = 25
  hero.trainPoints = 5;
  hero.gold = 100;
  const eff = B.getBuilding(40).особые_параметры.эффект;
  const goldDays = [];
  for (let d = 1; d <= 60 && goldDays.length < 2; d++) {
    if (BE.deterministicRoll(5, 7, d, 0x53544e52 /* STNR */, PL.hash2)
        < BE.stoneChance(eff, 5)) {
      goldDays.push(d);
    }
  }
  assert.equal(goldDays.length, 2,
    'два «золотых» дня успеха найдены (шанс 0.5, детерминизм): '
    + goldDays);
  // deps-бандл (паттерн A66 tests/building-effects.test.js); game —
  // тот же объект, что и globalThis.Game (main.js: game: G — снапшот;
  // applyRuneStone читает hash2/derived/skillLevel лениво из Game).
  const game = {
    xpForNext: P.xpForNext,
    POINTS_PER_LEVEL: 1,
    TRAIN_POINTS_PER_LEVEL: S.TRAIN_POINTS_PER_LEVEL,
    derived: P.derived,
    skillLevel: P.skillLevel,
    hash2: PL.hash2,
    buildingEffects: BE,
    npcUI: { open: () => {} },
  };
  const clock = { day: goldDays[0] };
  const deps = {
    game,
    clock,
    hero,
    player: { x: 5, y: 7 },
    prevPos: { x: 5, y: 7 },
    getMap: () => null,
    mover: null,
    npcs: [],
    questBook: {},
    npcShopFor: () => ({}),
    collectSaveData: () => ({ day: clock.day }),
    saveNow: () => {},
    flash: () => {},
    buildingOncePerDay: new Map(),
    buffs: [],
    teleports: new Map(),
    buildingQuests: new Map(),
    playerRender: () => {},
    moveHero: () => {},
    startCombat: () => {},
  };
  BA.init(deps);
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = game;
  try {
    const b40 = B.getBuilding(40);
    const t40 = { x: 5, y: 7, hasBuilding: true, building: 40,
      buildingId: 40 };
    for (const d of goldDays) {
      clock.day = d;
      BA.onBuildingAction(
        { id: '40', имя: 'Расшифровать', доступен: true }, t40, b40, null);
    }
    assert.equal(hero.totalXp, 50,
      'два прикосновения × 25 XP (stoneXp: round((10+2·5)·1.25))');
    assert.equal(hero.level, 2,
      '50 XP = xpForNext(1) — level 1→2 (grantXpRaw)');
    assert.equal(hero.points, 1,
      'POINTS_PER_LEVEL 1 за уровень (зеркало addXp)');
    assert.equal(hero.trainPoints, 10,
      'ЗЕРКАЛО grantXpRaw — плоский сброс в 10 (точка, которую '
      + 'пропускает правка только addXp)');
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
});

test('000298 L4: sanitizeSavedHero — legacy (поля нет) → 10; валидные 0/7/10 — как есть; подделка (14/−1/\'3\'/1.5/null) → 10; ядро clean — без изменений', () => {
  function base() {
    return {
      name: 'Флогистон',
      level: 5, xp: 120, totalXp: 900, gold: 340, hp: 37, mp: 8, points: 2,
      primary: {
        strength: 3, dexterity: 2, constitution: 2,
        intelligence: 2, wisdom: 1, charisma: 1,
      },
      secondary: { endurance: 3, meditation: 1 },
      skillXp: { endurance: 40 },
      alive: false,
    };
  }
  const legacy = P.sanitizeSavedHero(base());
  assert.ok(legacy, 'legacy-сейв восстанавливается');
  assert.equal(legacy.trainPoints, 10,
    'legacy-сейв (поля нет) — 10 (полный бюджет честного старта '
    + 'уровня, дружелюбно)');
  for (const v of [0, 7, 10]) {
    const s = base();
    s.trainPoints = v;
    assert.equal(P.sanitizeSavedHero(s).trainPoints, v,
      'валидное ' + v + ' (0..10) — сохраняется как есть');
  }
  for (const v of [14, -1, '3', 1.5, null]) {
    const s = base();
    s.trainPoints = v;
    assert.equal(P.sanitizeSavedHero(s).trainPoints, 10,
      'подделка ' + JSON.stringify(v) + ' — безопасное 10');
  }
  // Ядро clean — без изменений (новое поле — неломное дополнение).
  const clean = P.sanitizeSavedHero(base());
  assert.equal(clean.level, 5, 'level без изменений');
  assert.equal(clean.xp, 120, 'xp без изменений');
  assert.equal(clean.totalXp, 900, 'totalXp без изменений');
  assert.equal(clean.gold, 340, 'gold без изменений');
  assert.equal(clean.hp, 37, 'hp без изменений');
  assert.equal(clean.mp, 8, 'mp без изменений');
  assert.equal(clean.points, 2, 'points без изменений');
  assert.deepEqual(clean.primary, base().primary, 'primary без изменений');
  assert.deepEqual(clean.secondary, { endurance: 3, meditation: 1 },
    'secondary без изменений');
  assert.deepEqual(clean.skillXp, { endurance: 40 },
    'skillXp без изменений');
  assert.equal(clean.alive, true, 'alive принудительно true');
  assert.equal(clean.name, 'Флогистон', 'name без изменений');
});

test('000298 L5: инварианты — 10-й успех: форма {ok,level,price} БЕЗ доп. полей; 11-й отказ: gold/points/навык/хук не изменились; craftReprocessHook — 10 вызовов (000046)', () => {
  const calls = [];
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = {
    Craft: { reprocessCraftXp: (ch, id) => { calls.push(id); } },
  };
  try {
    const c = P.createCharacter();
    c.gold = 1000000;
    for (let i = 0; i < 9; i++) {
      assert.equal(N.schoolTrain(trainNpc, c, 'swordsman').ok, true);
    }
    const r10 = N.schoolTrain(trainNpc, c, 'swordsman');
    assert.deepEqual(r10, { ok: true, level: 10, price: 830 },
      '10-й успех — ТОЧНАЯ форма {ok, level, price}, без доп. полей: '
      + JSON.stringify(r10));
    assert.equal(calls.length, 10,
      'craftReprocessHook — 10 вызовов на 10 успехов (регрессия 000046)');
    const goldBefore = c.gold;
    const r11 = N.schoolTrain(trainNpc, c, 'swordsman');
    assert.equal(r11.ok, false, '11-е — отказ (бюджет исчерпан)');
    assert.equal(c.gold, goldBefore, 'отказ — золото не тратится');
    assert.equal(c.points, 0, 'отказ — свободные очки не тратятся');
    assert.equal(c.secondary.swordsman, 10, 'отказ — навык не поднимается');
    assert.equal(calls.length, 10, 'отказ — хук крафта не вызывается');
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
});
