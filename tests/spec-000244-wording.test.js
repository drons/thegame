// Задача 000244 (SPEC-синхронизация внебойных механик волн 000235.07–.12
// + накопленный docs-долг; docs-only; протокол 000218/D11 — wording-пины
// В ТОМ ЖЕ коммите) — RED-тесты. Код игры, CHANGELOG и существующие тесты
// НЕ меняются на красной стадии: правки 5 spec-файлов + ре-пин
// SPEC_FILE_LINES (tests/spec-split.test.js) + tasks-переезд — зелёная
// стадия.
//
// ТЗ (tasks/pending/000244.md): дописать SPEC по ФИНАЛЬНЫМ внебоевым
// механикам (сверка с кодом на HEAD, не по ТЗ-таблицам волн):
//   T1. spells «Каст вне боя» — flame_step (000235.07; лендинг —
//       000239-финал): телепорт ≤ 10 клеток в направление последнего
//       движения; отказы город/«нет направления движения»/«некуда
//       шагнуть»; пост-лендинг подземелье — dungeonPostMove (событие:
//       тайл-бой/сундук) → addStep → startDungeonCombat/
//       applyDungeonChest по событию → saveNow, мир — addStep →
//       зональный скан → enterLocation (если бой не начался) → saveNow;
//       мана — ПОСЛЕ cb (отказ cb — каст не состоялся: мана НЕ
//       списана, перемещения нет); display-имя — канон каталога
//       «Пламенный шаг»; луч НЕ учитывает frost_walk (факт).
//   T2. spells — firelight: floor радиуса видимости подземелья —
//       параметры.radius БЕЗ ДЕФОЛТА (невалидное/отсутствующее → 0;
//       отличие от radius-helper'ов), 1 день; no-op на базовой
//       видимости (VISION_BASE_RADIUS = 5) — tasks/pending/
//       000235.07.01.md.
//   T3. spells — hearthfire: restoreDay ×1.1 (дневной реген), 1 день,
//       OR с camp/prayer/wild_growth — без стекания; граница
//       expiresDay >= day («утро эффекта»).
//   T4. spells — frost_walk: hero-level проходимость WATER/DEEP_WATER
//       (heroPassable), мир, 1 день; TERRAIN_DATA статична; сейв-гард
//       «остаюсь на спавне».
//   T5. spells — cold_breath: собственный буллет — сужение радиуса
//       триггера: eff = Math.max(1, info.radius − 1) (5-й аргумент
//       findZoneCombat), non-trigger и dist 0 — не трогает, legacy без
//       5-го аргумента — бит-в-бит (сейчас — только кросс-ссылка в
//       буллете dark_presence).
//   T6. spells — frozen_stillness: зональное ПОДАВЛЕНИЕ, причина
//       «замерзание» — 3-я в порядке проверки zoneSuppressedReason,
//       радиус — frozenStillnessRadius, ТАЙЛ-БОЙ сохраняется.
//   T7. spells — shadow_step («третий внебоевой» волны 000235.09): тот
//       же resolveTeleportStep; мир — ТОЛЬКО t.passable; ПОСТ-ЛЕНДИНГА
//       НЕТ — телепорт бесплатен по игровому времени (pre-existing;
//       000239 D1 — shadow_step НЕ синхронизирован).
//   T8. spells — Волна Исцеление (000235.10): prayer (restoreDay ×1.1),
//       divine_protection (currentBuffMods, incomingMult 0.85),
//       holy_light (5-я причина «свет обители» + visionRadiusFloor max),
//       miracle (мгновенное; отказы дословно; flash «Чудо: партия
//       вернулась.»; механика — spec/companions.md «Воскрешение»,
//       000268 — кросс-ссылка, не дубль).
//   T9. spells «Зональное подавление» — список причин
//       zoneSuppressedReason — ПЯТЬ причин в порядке проверки в коде:
//       «невидимость», «круг защиты», «замерзание», «покров ночи»,
//       «свет обители» (5-я — holy_light, 000235.10; сейчас в SPEC — 4).
//   T10. world-map — hero-level проходимость: heroPassable(t, day) —
//       t.passable ИЛИ (frost_walk активен И terrain ∈ {WATER,
//       DEEP_WATER}); TERRAIN_DATA и потребители статичны; подземелья —
//       нет; смена дня — spec/game-time.md.
//   T11. game-time «При смене дня» — инвариант конца дня: герой на
//       heroPassable-тайле, иначе — relocateToNearestPassable (спираль
//       r = 1..200, без группы, фолбэк findSpawn) + flash-строка
//       дословно (byte-пин — tests/spellbook-oc-e2e.test.js).
//   T12. mobs «Состав групп» — сужение радиуса триггера внебоевым
//       эффектом (000235.08 cold_breath, 000235.09 dark_presence):
//       5-й аргумент findZoneCombat (aggroReduceRadius), eff =
//       Math.max(1, info.radius − 1) при Чебышёве ≤ радиуса эффекта;
//       два источника — max (−1, не −2); dist 0 и non-trigger — не
//       трогает; legacy — бит-в-бит; HUD-окружность — тем же eff.
//   T13. craft «Виды крафта» — ряд «Зачарование», ячейка «Постройки»:
//       фактический union каталога (126 рецептов, assets/craft) =
//       {Охотничья усадьба, Башня мага, Дом кузнеца} (Обелиск — НЕ
//       входит; он — в union рунописи, ряд «Рунопись» не трогается —
//       neg-пин ROW-SCOPED).
//
// Контракт: memory/000244-ooc-spec-sync.md (§3 — карта изменений, §4 —
// коды-анкоры, §5 — пин-план, §8 — решения). План тестов: a3-tests.md.
// Протоколы: 000218/D11 (wording-пины В ТОМ ЖЕ коммите; нормализация
// белых ОБЯЗАТЕЛЬНА — SPEC переносит строки ~64-70 кол.; needle —
// positive-фразы нового текста; self-scan ОБЯЗАТЕЛЕН), 000159 §5.1
// (SPEC_FILE_LINES — пересчёт ОТ ФАКТА тем же счётчиком specLines,
// зелёная стадия, В ТОМ ЖЕ коммите). Символы — канон 000235.06: «»
// U+201C/201D, «·» U+00B7, «−» U+2212, «–» U+2013; T11 — «—» U+2014
// (flash-строка дословно).
//
// Срезы: OC = h2(spells.md, «Каст вне боя») (H2 L150); WM = весь
// world-map.md (файл без H2 — только H1); GT = весь game-time.md (без
// H2); MG = h2(mobs.md, «Состав групп»); CR = h2(craft.md, «Виды
// крафта»). readFileSync каждого правимого файла ОДИН РАЗ. Хелперы
// esc/h2/norm — 1:1 из tests/spec-000235.04.01-wording.test.js.
//
// Краснота ОСМЫСЛЕННАЯ: все 5 файлов существуют и читаются, секции на
// месте — падения ERR_ASSERTION «фраза не найдена»; T13 — neg-пин
// «старая фраза на месте» (ряд «Зачарование» содержит «Обелиск»).
// SELF-SCAN (эта стадия, все срезы на HEAD): ВСЕ 63 positive-needle
// отсутствуют в текущих срезах — ни одного «зелёного с рождения».
// Столкновения, ИСКЛЮЧЁННЫЕ из needle'ов (УЖЕ в срезах): OC — 'prayer'
// (L244 «OR с camp/prayer»), 'restoreDay'/'×1.1' (L244 wild_growth),
// 'cold_breath' без имени / 'coldBreathRadius' / 'aggroReduceRadius' /
// 'НЕ −2' / 'eff = max(1, radius−1)' (L227-231, блок .09 — другая
// форма, чем 'Math.max(1, info.radius'), и другой срез, чем T12),
// '«замерзание»' (L234), 'no-op' (L252), '{days: 1, radius: 5}' (L219),
// 'три внебоевых' (L241), 'четыре внебоевых' (L185); MG — 'окружность'
// (L112), 'Чебышёв' (L109); CR — 'Обелиск' ×2 (L10+L11 → row-scoped);
// WM — 'TERRAIN_DATA' (L10). Umbrella .09 «два внебоевых заклинания»
// (L214) НЕ переписывается (контракт §8.4) — T7 пины на новом
// shadow_step-буллете.
//
// expectedRedCount = 13 (T1–T13). Красная стадия (тест закоммичен,
// spec НЕ правлен): npm test — 3432 базовых + 13 новых = 3445, ровно 13
// «not ok» — ВСЕ в этом файле; остальные 3432 — зелёные.
//
// Ограничения, закреплённые для ЗЕЛЁНОЙ правки (иначе зелёные пины
// уйдут в красный): НОВЫХ H2/H3 НЕ СОЗДАВАТЬ (SPEC_SECTIONS nH2=66/
// nH3=41, spec-split R2); не создавать/удалять файлы spec/ (R1: ровно
// 23); корневой SPEC.md — не трогать (R3: 31 строка, TOC); корень
// «кулдаун» в spells.md — ровно 1 (S3-счёт-равенство 000235); «(v1)» в
// spec/*.md — 0 (spec-combat-wording:151). Файл НЕ содержит линейной
// цитаты «SPEC» + «453» (из частей; SPEC-453-GONE сканит tests/+src/).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// 000159: SPEC.md разбит на spec/*.md — пины читают подфайлы напрямую.
// 000244: затронуты 5 файлов — каждый readFileSync ОДИН РАЗ (паттерн
// 000235.06/000230.03.01).
const SPELLS = fs.readFileSync(path.join(ROOT, 'spec', 'spells.md'), 'utf8');
const WMAP = fs.readFileSync(path.join(ROOT, 'spec', 'world-map.md'), 'utf8');
const GTIME = fs.readFileSync(path.join(ROOT, 'spec', 'game-time.md'), 'utf8');
const MOBS = fs.readFileSync(path.join(ROOT, 'spec', 'mobs.md'), 'utf8');
const CRAFT = fs.readFileSync(path.join(ROOT, 'spec', 'craft.md'), 'utf8');

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Срез H2-подраздела «## <name>» внутри текста (до следующего '\n## ').
function h2(sec, name) {
  const m = sec.match(new RegExp('^## ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: подраздел «' + name + '» не найден');
  const i = m.index;
  const j = sec.indexOf('\n## ', i + 1);
  return sec.slice(i, j === -1 ? sec.length : j);
}

// Нормализация белых: фразы, сломавшиеся переносом, встают в строку.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

// positive-needle в срезе (нормализованном): падение — ERR_ASSERTION
// «фраза не найдена» (файл и секция существуют — осмысленная краснота,
// правок SPEC ещё нет).
function phrase(slice, label, needle, why) {
  assert.ok(
    norm(slice).includes(needle),
    label + ': фраза не найдена: «' + needle + '» — ' + why);
}

// Срезы: OC — фиксированный H2 spells; WM/GT — весь файл (без H2);
// MG/CR — H2-срезы mobs/craft.
const OC = () => h2(SPELLS, 'Каст вне боя');
const WM = () => WMAP;
const GT = () => GTIME;
const MG = () => h2(MOBS, 'Состав групп');
const CR = () => h2(CRAFT, 'Виды крафта');

test('SPEC 000244 T1: spells.md «Каст вне боя» — flame_step (волна 000235.07; лендинг — 000239-финал): телепорт ≤ 10 клеток в направление последнего движения; отказы «в городе телепорт недоступен»/«нет направления движения»/«некуда шагнуть»; пост-лендинг — подземелье (dungeonPostMove-событие тайл-бой/сундук → addStep → startDungeonCombat/applyDungeonChest → saveNow), мир (addStep → зональный скан → enterLocation, если бой не начался → saveNow); мана — ПОСЛЕ cb (отказ cb — каст не состоялся: мана НЕ списана, перемещения нет); display-имя «Пламенный шаг» (канон каталога); луч НЕ учитывает frost_walk', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'flame_step',
    'буллет flame_step (волна 000235.07) не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'flame_step («Пламенный шаг»',
    'display-имя — канон каталога assets/spells/000042.json «Пламенный ' +
      'шаг» (ревью 000244: SPEC ↔ каталог) не зафиксировано');
  phrase(oc, '«Каст вне боя»', '≤ 10 клеток',
    'телепорт — ≤ 10 клеток по лучу (k = 1..10, src/main.js ' +
      'resolveTeleportStep) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'направление последнего движения',
    'направление = последнее движение (|dx|+|dy| = 1; мир — prevPos, ' +
      'подземелье — dungeonState.prevX/prevY) не зафиксировано');
  phrase(oc, '«Каст вне боя»', '«в городе телепорт недоступен»',
    'отказ в городе (dungeonState.kind === \'city\'), дословно, не ' +
      'зафиксирован');
  phrase(oc, '«Каст вне боя»', '«нет направления движения»',
    'отказ «нет направления движения» (движения не было / диагональ), ' +
      'дословно, не зафиксирован');
  phrase(oc, '«Каст вне боя»', '«некуда шагнуть»',
    'отказ «некуда шагнуть» (landing 0), дословно, не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'dungeonPostMove',
    'пост-лендинг подземелья (000239): locations.dungeonPostMove ' +
      '(тайл-бой startDungeonCombat / сундук applyDungeonChest) не ' +
      'зафиксирован');
  phrase(oc, '«Каст вне боя»', 'saveNow',
    'saveNow после лендинга (мир и подземелье) не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'frost_walk',
    'луч НЕ учитывает frost_walk (вода — стена; луч — passable-функции, ' +
      'не heroPassable; pre-existing, memory/000239) не зафиксировано');
});

test('SPEC 000244 T2: spells.md «Каст вне боя» — firelight (000235.07): floor радиуса видимости подземелья — parameters.radius БЕЗ ДЕФОЛТА (невалидное/отсутствующее → 0), 1 день; no-op на базовой видимости (VISION_BASE_RADIUS = 5) — tasks/pending/000235.07.01.md', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'firelight',
    'буллет firelight не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'firelight («Свет пламени»',
    'display-имя — канон каталога assets/spells/000040.json «Свет ' +
      'пламени» (ревью 000244: SPEC ↔ каталог) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'visionRadiusFloor',
    'floor радиуса видимости — функция visionRadiusFloor ' +
      '(src/dungeon-ui.js) не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'ДЕФОЛТА НЕТ',
    'parameters.radius БЕЗ ДЕФОЛТА (typeof number && r ≥ 1 → floorR, ' +
      'иначе 0; НЕ integer-check, НЕ 1..5→5 — отличие от radius-' +
      'helper\'ов) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'VISION_BASE_RADIUS',
    'no-op на базовой видимости (visionMult ≥ 1 → radiusFor ≥ 5 = ' +
      'VISION_BASE_RADIUS) не зафиксировано');
  phrase(oc, '«Каст вне боя»', '000235.07.01',
    'tracked-задача 000235.07.01 (no-op на базовой видимости) не ' +
      'упомянута (прецедент path_of_vines, .12)');
});

test('SPEC 000244 T3: spells.md «Каст вне боя» — hearthfire (000235.07): лагерь → restoreDay ×1.1 (+10% к дневному регену), 1 день; OR с camp/prayer/wild_growth — без стекания; граница expiresDay >= day («утро эффекта»); radius каталога — no-op', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'hearthfire',
    'буллет hearthfire не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'hearthfire («Очаговый огонь»',
    'display-имя — канон каталога assets/spells/000041.json «Очаговый ' +
      'огонь» (ревью 000244: SPEC ↔ каталог) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'isHeroCamped',
    'isHeroCamped (src/spells.js; expiresDay >= day — «утро эффекта» ' +
      'живёт) не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'camp/prayer/wild_growth',
    'restoreDay ×1.1 (main.js onDay) — OR с camp/prayer/wild_growth ' +
      'БЕЗ стекания не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'expiresDay >= day',
    'граница >= day (onDay restoreDay считается ДО expireOutOfCombat' +
      'Effects — «утро эффекта») не зафиксирована');
});

test('SPEC 000244 T4: spells.md «Каст вне боя» — frost_walk (000235.08): hero-level проходимость обоих водных тайла (WATER/DEEP_WATER), мир, 1 день; TERRAIN_DATA статична (heroPassable vs статичный passable); сейв-гард «остаюсь на спавне»; кросс-ссылка на spec/game-time.md (onDay-перенос)', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'frost_walk',
    'буллет frost_walk не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'heroPassable',
    'hero-level проходимость — heroPassable (src/main.js) не ' +
      'зафиксирована');
  phrase(oc, '«Каст вне боя»', 'WATER',
    'frost_walk открывает тайл WATER (expiresDay > day) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'DEEP_WATER',
    'frost_walk открывает тайл DEEP_WATER не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'TERRAIN_DATA',
    'статичный passable TERRAIN_DATA НЕ меняется (деградация без ' +
      'G.Spells — passable-only) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'остаюсь на спавне',
    'сейв-гард «Сейв: позиция непроходима — остаюсь на спавне.» ' +
      '(console.warn, герой на спавне) не зафиксирован');
});

test('SPEC 000244 T5: spells.md «Каст вне боя» — cold_breath (000235.08): СОВЕСТВЕННЫЙ буллет — сужение радиуса триггера триггерящих групп: eff = Math.max(1, info.radius − 1) (5-й аргумент findZoneCombat, Чебышёв ≤ радиуса эффекта вокруг героя, мин. 1); non-trigger и dist 0 — не трогает; legacy без 5-го аргумента — бит-в-бит; HUD-окружность тем же eff', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'cold_breath («Дыхание мороза»',
    'собственный буллет cold_breath («Дыхание мороза») не зафиксирован ' +
      '(сейчас — только кросс-ссылка в буллете dark_presence)');
  phrase(oc, '«Каст вне боя»', 'Math.max(1, info.radius',
    'формула сужения eff = Math.max(1, info.radius − 1) (5-й аргумент ' +
      'findZoneCombat, src/combat.js) не зафиксирована (в буллете ' +
      'dark_presence — другая форма «eff = max(1, radius−1)»);');
  phrase(oc, '«Каст вне боя»', 'бит-в-бит',
    'вызов findZoneCombat без 5-го аргумента (legacy) — бит-в-бит не ' +
      'зафиксировано');
});

test('SPEC 000244 T6: spells.md «Каст вне боя» — frozen_stillness (000235.08): зональное ПОДАВЛЕНИЕ — причина «замерзание» (3-я в порядке проверки zoneSuppressedReason); радиус — frozenStillnessRadius; ТАЙЛ-БОЙ сохраняется; 1 день', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'frozen_stillness',
    'буллет frozen_stillness не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'frozen_stillness («Замершая неподвижность»',
    'display-имя — канон каталога assets/spells/000067.json «Замершая ' +
      'неподвижность» (ревью 000244: SPEC ↔ каталог) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'frozenStillnessRadius',
    'радиус — helper frozenStillnessRadius (src/spells.js) не ' +
      'зафиксирован');
  phrase(oc, '«Каст вне боя»', '3-я в порядке проверки',
    'причина «замерзание» — 3-я в порядке проверки ' +
      'zoneSuppressedReason (невидимость → круг защиты → замерзание) не ' +
      'зафиксирована');
});

test('SPEC 000244 T7: spells.md «Каст вне боя» — shadow_step (000235.09): «третий внебоевой» волны Тень (umbrella .09 — зональная пара, не переписывается): тот же resolveTeleportStep (≤ 10 клеток); мир — лендинг ТОЛЬКО t.passable (БЕЗ building/entrance/mob-group исключений); ПОСТ-ЛЕНДИНГА НЕТ — телепорт бесплатен по игровому времени (pre-existing; 000239 D1 — НЕ синхронизирован)', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'shadow_step',
    'буллет shadow_step не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'третий внебоевой',
    '«третий внебоевой» заклинание волны 000235.09 (зональная пара — ' +
      'отдельный блок) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 't.passable',
    'мир-лендинг — ТОЛЬКО t.passable (shadowStepPassable; БЕЗ ' +
      'building/entrance/mob-group исключений — легче flame_step) не ' +
      'зафиксировано');
  phrase(oc, '«Каст вне боя»', 'ПОСТ-ЛЕНДИНГА',
    'ПОСТ-ЛЕНДИНГА НЕТ (ни addStep, ни зональный скан, ни ' +
      'enterLocation, ни saveNow, ни dungeonPostMove) не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'бесплатен по игровому времени',
    'телепорт бесплатен по игровому времени (pre-existing непоследо- ' +
      'вательность; 000239 D1 — shadow_step НЕ трогать и НЕ ' +
      'синхронизировать) не зафиксировано');
});

test('SPEC 000244 T8: spells.md «Каст вне боя» — Волна Исцеление (000235.10): prayer («Молитва» — restoreDay ×1.1, 1 день); divine_protection (currentBuffMods: incomingMult 0.85, все точки создания боя); holy_light (5-я причина «свет обители» + visionRadiusFloor max с firelight); miracle (мгновенное; отказы «нет погибших»/«отряд полон»/«недоступно»; flash «Чудо: партия вернулась.»; механика — spec/companions.md «Воскрешение», 000268)', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»', 'Волна Исцеление',
    'буллет-блок «Волна Исцеление (000235.10)» не зафиксирован');
  phrase(oc, '«Каст вне боя»', '«Молитва»',
    'prayer («Молитва»): restoreDay ×1.1 (та же onDay-ветка, что ' +
      'hearthfire), 1 день — не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'divine_protection',
    'буллет divine_protection не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'currentBuffMods',
    'divine_protection — currentBuffMods (все точки создания боя дня: ' +
      'мир/подземелье/отладочный) не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'incomingMult',
    ' incomingMult 0.85 (−15% получаемого урона) не зафиксирован');
  phrase(oc, '«Каст вне боя»', '0.85',
    'значение 0.85 не зафиксировано');
  phrase(oc, '«Каст вне боя»', 'holy_light',
    'буллет holy_light не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'miracle',
    'буллет miracle (кросс-ссылка на spec/companions.md «Воскрешение» — ' +
      'не дубль механики) не зафиксирован');
  phrase(oc, '«Каст вне боя»', 'spec/companions.md',
    'кросс-ссылка на spec/companions.md (000268) не зафиксирована');
  phrase(oc, '«Каст вне боя»', '«Воскрешение»',
    'секция «Воскрешение» (H2, 000268) не упомянута');
  phrase(oc, '«Каст вне боя»', '«нет погибших»',
    'отказ «нет погибших» (дословно; pre-validation ВСЕХ до применения) ' +
      'не зафиксирован');
  phrase(oc, '«Каст вне боя»', '«отряд полон»',
    'отказ «отряд полон» (roster + dead > max_companions, дефолт 3), ' +
      'дословно, не зафиксирован');
  phrase(oc, '«Каст вне боя»', '«Чудо: партия вернулась.»',
    'flash «Чудо: партия вернулась.» (дословно) не зафиксирован');
});

test('SPEC 000244 T9: spells.md «Каст вне боя» — зональное подавление: список причин zoneSuppressedReason — ПЯТЬ причин В ПОРЯДКЕ ПРОВЕРКИ В КОДЕ: «невидимость», «круг защиты», «замерзание», «покров ночи», «свет обители» (5-я — holy_light, 000235.10; сейчас в SPEC — 4)', () => {
  const oc = OC();
  phrase(oc, '«Каст вне боя»',
    'порядок проверки: «невидимость», «круг защиты», «замерзание», ' +
      '«покров ночи», «свет обители»',
    '5-я причина «свет обители» (holy_light, 000235.10; порядок ' +
      'проверки — src/main.js zoneSuppressedReason) не зафиксирована; ' +
      'фраза ломана переносом — только через norm()');
});

test('SPEC 000244 T10: world-map.md — hero-level проходимость: heroPassable(t, day) — t.passable ИЛИ (frost_walk активен, expiresDay > day, И terrain ∈ {WATER, DEEP_WATER}); TERRAIN_DATA и потребители (passableTiles/denseTiles, TILE_BASE, TILE_COLORS) — статичны; подземелья не затрагивает; при смене дня — spec/game-time.md', () => {
  const wm = WM();
  phrase(wm, 'spec/world-map.md', 'heroPassable',
    'hero-level проходимость — heroPassable(t, day) (src/main.js) не ' +
      'зафиксирована');
  phrase(wm, 'spec/world-map.md', 'frost_walk',
    'frost_walk (1 день, 000235.08) открывает водные тайлы не ' +
      'зафиксировано');
  phrase(wm, 'spec/world-map.md', 'WATER',
    'тайл WATER (статичный passable: false) не зафиксирован');
  phrase(wm, 'spec/world-map.md', 'DEEP_WATER',
    'тайл DEEP_WATER (статичный passable: false) не зафиксирован');
});

test('SPEC 000244 T11: game-time.md «При смене дня» — инвариант конца дня (frost_walk, 000235.08): ПОСЛЕ истечения внебоевых эффектов, если герой на тайле, где heroPassable(t, новый день) = false, — перенос на ближайший проходимый тайл БЕЗ группы (relocateToNearestPassable, спираль r = 1..200, фолбэк findSpawn) + flash-строка дословно; это ПЕРЕНОС, не телепорт-спавн', () => {
  const gt = GT();
  phrase(gt, 'spec/game-time.md', 'Инвариант конца дня',
    'инвариант конца дня не зафиксирован');
  phrase(gt, 'spec/game-time.md', 'heroPassable',
    'проверка heroPassable(текущий тайл, новый день) в конце смены дня ' +
      'не зафиксирована');
  phrase(gt, 'spec/game-time.md', 'relocateToNearestPassable',
    'перенос — relocateToNearestPassable (ближайший проходимый тайл ' +
      'БЕЗ группы: статичный passable && !hasMobGroup, moveHero; ' +
      'фолбэк findSpawn) не зафиксирован');
  phrase(gt, 'spec/game-time.md', 'r = 1..200',
    'спираль по Чебышёву r = 1..200 не зафиксирована');
  phrase(gt, 'spec/game-time.md',
    '«Позиция непроходима — перенос на ближайший проходимый тайл.»',
    'flash-строка (дословно, «—» U+2014; byte-пин — ' +
      'tests/spellbook-oc-e2e.test.js) не зафиксирована');
});

test('SPEC 000244 T12: mobs.md «Состав групп» — сужение радиуса триггера внебоевым эффектом (000235.08 cold_breath, 000235.09 dark_presence): 5-й аргумент findZoneCombat (aggroReduceRadius) — для триггерящей группы в Чебышёве ≤ радиуса эффекта от героя: eff = Math.max(1, info.radius − 1); два источника — max (−1, не −2); dist 0 и non-trigger — не трогает; legacy — бит-в-бит; HUD-окружность — тем же eff', () => {
  const mg = MG();
  phrase(mg, '«Состав групп»', 'aggroReduceRadius',
    '5-й аргумент findZoneCombat (aggroReduceRadius) не зафиксирован');
  phrase(mg, '«Состав групп»', 'Math.max(1, info.radius − 1)',
    'формула eff = Math.max(1, info.radius − 1) (U+2212; канон из кода ' +
      'src/combat.js findZoneCombat) не зафиксирована');
  phrase(mg, '«Состав групп»', '−1, не −2',
    'два источника (cold_breath + dark_presence) — max, не сумма (−1, ' +
      'не −2) не зафиксировано');
  phrase(mg, '«Состав групп»', 'бит-в-бит',
    'вызов без 5-го аргумента — бит-в-бит (legacy) не зафиксировано');
});

test('SPEC 000244 T13: craft.md «Виды крафта» — ряд «Зачарование», ячейка «Постройки»: фактический union каталога (126 рецептов, assets/craft) = «Охотничья усадьба, Башня мага, Дом кузнеца»; «Обелиск» из ряда «Зачарование» убран (row-scoped neg-пин; ряд «Рунопись» с «Обелиск» — НЕ задевается)', () => {
  const cr = CR();
  const row = cr.split('\n').find((l) => l.startsWith('| Зачарование'));
  assert.ok(row, '«Виды крафта»: ряд «Зачарование» не найден');
  assert.ok(
    !row.includes('Обелиск'),
    '«Виды крафта»: старая фраза на месте — «Обелиск» в ряду ' +
      '«Зачарование» (факт на HEAD: Обелиск НЕ входит в union ' +
      'зачарования — он в union рунописи; пин row-scoped — ряд «Рунопись» ' +
      'не задевается)');
  phrase(cr, '«Виды крафта»', 'Охотничья усадьба, Башня мага, Дом кузнеца',
    'ячейка «Постройки» ряда «Зачарование» — фактический union ' +
      'каталога (126 рецептов, assets/craft: 000012/000018/000025) не ' +
      'зафиксирована');
});
