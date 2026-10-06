// Наёмные NPC на едином листе персонажа (задача 000143, родитель
// 000139; данные найма — 000141; модель листа — 000140).
//
// КРАСНЫЕ тесты (TDD): падают на ТЕКУЩЕМ (неизменённом) коде, потому
// что функциональности ТЗ ещё нет:
//   * hire создаёт 5-полевую запись {npcId, level, xp, loyalty,
//     hiredDay} — `sheet` НЕТ (CS-1);
//   * applyCombatXp — ручная лупа e.xp/e.level по G.xpForNext —
//     Sheet.addXp НЕ вызывается: очки 2/уровень не накапливаются
//     (CS-2);
//   * deserializeRoster — backfill старого формата НЕТ: 5-полевая
//     запись возвращается «как есть», без sheet (CS-3);
//   * allyDataForEntry — в данных НЕТ maxHP/damage: makeAlly идёт
//     по формульной ветке, явный урон не существует — мораль на него
//     не действует (CS-4);
//   * serializeRoster — проекция 5 полей (level/xp top-level, sheet
//     отброшен), не 4-полевая форма {npcId, sheet, loyalty, hiredDay}
//     (CS-5);
//   * sanitizeMercSheet НЕТ: битые sheet в записи НЕ отбрасываются,
//     поля не чистятся (CS-6);
//   * load-time guard sheet.js в companions.js НЕТ (CS-7).
//
// Контракты (источник истины — станция Проектирование, 2026-10-06):
//   * memory/000143-merc-sheet.md — форма записи 6/4 ключей (§2.1/2.2),
//     backfill (§2.5), sanitizeMercSheet (§2.6), applyCombatXp через
//     addXp (§2.7), allyDataForEntry/mercModifier/makeAlly (§2.8),
//     зафиксированные L1-значения (§2.9), красные тесты (§2.10);
//   * memory/000141-merc-initial-lists.md — контракт слияния:
//     createSheet('merc', {primary: найм.базовые_характеристики,
//     skills: найм.начальные_навыки (уровни, skillXp = 0),
//     spells: найм.spells}); БЕЗ ревалидации requires;
//   * memory/000140-sheet-model.md — S-1..S-5: createSheet/addXp
//     (2 очка/уровень ВСЕМ kinds, пороги xpForNext 50/141/260 при
//     xpMult 1), derived + ctx.modifier (S-4: полный объект).
//
// Механика: node (прямые require: src/companions.js, src/sheet.js,
// src/combat.js — makeAlly, src/npc-data.js). НОВОГО модуля НЕ
// создаётся → vm-цепочка для ядра не нужна (браузерный realm уже
// покрывает BROWSER_CHAIN в tests/companions.test.js, где sheet.js
// на месте); CS-7 — минимальный vm БЕЗ sheet.js (guard).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const S = require('../src/sheet.js');
const { makeAlly } = require('../src/combat.js');
const { NPCS } = require('../src/npc-data.js');
const { createCharacter } = require('../src/player.js');
const C = require('../src/companions.js');

const NPC_VOLK = NPCS.find((n) => n.id === 'merc_volk');
const NPC_BALDOR = NPCS.find((n) => n.id === 'merc_baldor');
assert.ok(NPC_VOLK && NPC_VOLK.найм && NPC_BALDOR && NPC_BALDOR.найм,
  'каталог (000141): merc_volk/merc_baldor с найм-данными и новыми полями');

// --- Хелперы ---

// Персонаж-наёмщик: Харизма 15 → шанс отказа 0% (30% − 2%×15),
// золото — параметр.
const hero = (charisma, gold) => {
  const c = createCharacter();
  c.primary.charisma = charisma;
  c.gold = gold;
  return c;
};

// Канонический merc-лист по контракту слияния 000141: createSheet
// ('merc', {primary, spells, npcId}) + ЯВНЫЕ уровни вторичных из
// найм.начальные_навыки (БЕЗ ревалидации requires — heavy/swordsman,
// archer/accuracy — осознанная несогласованность, решение A).
// level/xp — тестовый параметр (fresh-лист — 1/0).
function mercSheet(npc, { level = 1, xp = 0 } = {}) {
  const s = S.createSheet('merc', {
    primary: npc.найм.базовые_характеристики,
    spells: npc.найм.spells,
    npcId: npc.id,
  });
  for (const [id, lv] of Object.entries(npc.найм.начальные_навыки || {})) {
    if (Number.isInteger(lv) && lv >= 1) s.secondary[id] = lv;
  }
  s.level = level;
  s.xp = xp;
  s.totalXp = xp; // инвариант totalXp ≥ xp (000140)
  return s;
}

// RUNTIME-запись отряда НОВОЙ формы (000143 §2.1): ровно 6 ключей
// {npcId, sheet, level, xp, loyalty, hiredDay}; зеркала level/xp =
// sheet.level/sheet.xp.
function entryWithSheet(npc, { level = 1, xp = 0, loyalty = 50, day = 1 } = {}) {
  return {
    npcId: npc.id,
    sheet: mercSheet(npc, { level, xp }),
    level,
    xp,
    loyalty,
    hiredDay: day,
  };
}

// Сериализация ТИХАЯ (0 console.warn — warn печатает main.js по
// dropped, 000085) — пин «тихая» (CS-6).
function quiet(fn) {
  const orig = console.warn;
  let n = 0;
  console.warn = () => { n += 1; };
  try {
    return { res: fn(), n };
  } finally {
    console.warn = orig;
  }
}

// =====================================================================
// CS-1: найм → запись 6 ключей; sheet kind 'merc' из каталога найма.
// =====================================================================

test('000143 CS-1: найм → запись ровно {npcId, sheet, level, xp, loyalty, hiredDay}; sheet kind merc — primary/secondary/spells каталога (000141)', () => {
  const r = C.createRoster();
  const res = C.hire(r, NPC_VOLK, hero(15, 100), 2);
  assert.equal(res.ok, true, 'найм (Харизма 15 → отказ 0%)');
  // C3 (000139): форма записи — 6 ключей; level/xp — ПЛОСКИЕ ЗЕРКАЛА
  // sheet (считатели без правок), sheet — канонический лист.
  assert.deepEqual(Object.keys(res.entry).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
    '000139 C3: ровно 6 ключей (sheet + зеркала level/xp)');
  assert.equal(res.entry.level, 1, 'зеркало level = sheet.level');
  assert.equal(res.entry.xp, 0, 'зеркало xp = sheet.xp');
  // Найм/лояльность/день — БЕЗ ИЗМЕНЕНИЙ (000079): 50 + Харизма,
  // hiredDay = день найма.
  assert.equal(res.entry.loyalty, 65, '50 + Харизма 15 (1:1)');
  assert.equal(res.entry.hiredDay, 2);
  assert.equal(r[0], res.entry, 'entry — та же ссылка, что в roster');

  const sh = res.entry.sheet;
  assert.ok(sh && typeof sh === 'object', 'sheet — создаётся при найме');
  assert.deepEqual(Object.keys(sh).sort(), [
    'kind', 'level', 'npcId', 'points', 'primary', 'secondary',
    'skillXp', 'spells', 'totalXp', 'xp',
  ], 'канонический merc-лист — 10 ключей (createSheet, 000140)');
  assert.equal(sh.kind, 'merc');
  assert.equal(sh.npcId, 'merc_volk', 'носитель — npcId');
  assert.equal(sh.level, 1, 'fresh-лист: уровень 1');
  assert.equal(sh.xp, 0);
  assert.equal(sh.totalXp, 0);
  assert.equal(sh.points, 0, 'очков ещё нет (2/уровень — 000139 C1)');
  // primary — найм.базовые_характеристики ПОКЛЮЧЕВО (каталог 000141
  // гарантирует 6 целых ≥ 1: Вольк str3/dex1/con2/int1/wis1/cha1).
  assert.deepEqual(sh.primary, NPC_VOLK.найм.базовые_характеристики);
  // secondary — найм.начальные_навыки (ЯВНЫЕ уровни, без ревалидации
  // requires); skillXp — пуст (уровни — не практика).
  assert.deepEqual(sh.secondary, NPC_VOLK.найм.начальные_навыки);
  assert.deepEqual(sh.skillXp, {});
  // spells — найм.spells (Вольк — []).
  assert.deepEqual(sh.spells, NPC_VOLK.найм.spells);
});

// =====================================================================
// CS-2: боевой опыт через Sheet.addXp — очки 2/уровень, пороги
//       50/141/260, зеркала, события как в 000082.
// =====================================================================

test('000143 CS-2: applyCombatXp — через sheet.addXp: 50 → level 2, points 2; +91 — копится (< 141); +50 → level 3, points 4; зеркала и events как 000082', () => {
  const r = C.createRoster();
  assert.equal(C.hire(r, NPC_VOLK, hero(15, 100), 2).ok, true);

  // 50 = xpForNext(1) при xpMult 1 (scholar 0): ровно уровень 2.
  let res = C.applyCombatXp(r, [{ id: 'merc_volk', xp: 50 }]);
  assert.deepEqual(res, {
    applied: 1,
    levelUps: 1,
    events: [{ type: 'level_up', npcId: 'merc_volk', level: 2 }],
  }, 'возврат {applied, levelUps, events} — формат 000082');
  assert.equal(r[0].sheet.level, 2);
  assert.equal(r[0].sheet.xp, 0, '50 − 50 = 0');
  assert.equal(r[0].sheet.totalXp, 50);
  assert.equal(r[0].sheet.points, 2, 'очки 2/уровень (000139 C1) — тратит 000145');
  assert.equal(r[0].level, 2, 'зеркало level синхронизировано');
  assert.equal(r[0].xp, 0, 'зеркало xp синхронизировано');

  // +91: 91 < 141 (xpForNext(2)) — уровня нет, очки не растут.
  res = C.applyCombatXp(r, [{ id: 'merc_volk', xp: 91 }]);
  assert.deepEqual(res, { applied: 1, levelUps: 0, events: [] });
  assert.equal(r[0].sheet.level, 2);
  assert.equal(r[0].sheet.xp, 91, 'остаток копится между боями');
  assert.equal(r[0].sheet.points, 2, 'без уровня — без очков');

  // +50: 91 + 50 = 141 = xpForNext(2) — уровень 3, xp 0, points 4.
  res = C.applyCombatXp(r, [{ id: 'merc_volk', xp: 50 }]);
  assert.deepEqual(res, {
    applied: 1,
    levelUps: 1,
    events: [{ type: 'level_up', npcId: 'merc_volk', level: 3 }],
  });
  assert.equal(r[0].sheet.level, 3);
  assert.equal(r[0].sheet.xp, 0);
  assert.equal(r[0].sheet.points, 4);
  assert.equal(r[0].level, 3);
  assert.equal(r[0].xp, 0);
});

// =====================================================================
// CS-3: backfill СТАРОГО сейва (000085) — ФИКСИРОВАННЫЙ JSON старого
//       формата; level/xp переносятся, характеристики — начальные
//       каталога, points = 0, totalXp = xp.
// =====================================================================

// Фиксированный JSON СТАРОГО формата (форма зафиксирована 000079/000085):
// {npcId, level, xp, loyalty, hiredDay}. JSON-копия — защита от
// мутации литерала тестами.
const OLD_SAVE_VOLK = [
  { npcId: 'merc_volk', level: 5, xp: 30, loyalty: 77, hiredDay: 3 },
];

test('000143 CS-3: backfill — старый формат (фиксированный JSON) → sheet (level/xp переносятся, статы — каталог, points 0); dropped пусто', () => {
  const res = C.deserializeRoster(
    NPCS, JSON.parse(JSON.stringify(OLD_SAVE_VOLK)));
  assert.deepEqual(res.dropped, [],
    'старый формат — ВАЛИДНЫЙ вход (C3: «старый сейв грузится»)');
  assert.equal(res.roster.length, 1);
  const e = res.roster[0];
  assert.deepEqual(Object.keys(e).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
    'post-backfill — runtime-форма 6 ключей');
  const sh = e.sheet;
  assert.ok(sh && typeof sh === 'object', 'backfill создаёт sheet');
  assert.equal(sh.kind, 'merc');
  assert.equal(sh.npcId, 'merc_volk');
  assert.equal(sh.level, 5, 'level — перенесён из старой записи');
  assert.equal(sh.xp, 30, 'xp — перенесён из старой записи');
  assert.equal(sh.totalXp, 30, 'totalXp = xp (инвариант totalXp ≥ xp; 0 — нет: было бы totalXp < xp)');
  assert.equal(sh.points, 0, 'в старом формате очки не копились');
  // Характеристики/навыки/заклинания — НАЧАЛЬНЫЕ каталога (в старом
  // формате их не хранили).
  assert.deepEqual(sh.primary, NPC_VOLK.найм.базовые_характеристики);
  assert.deepEqual(sh.secondary, NPC_VOLK.найм.начальные_навыки);
  assert.deepEqual(sh.spells, NPC_VOLK.найм.spells);
  assert.deepEqual(sh.skillXp, {});
  // Зеркала из sheet; loyalty/hiredDay — как были (clamp/floor —
  // существующие правила 000085: 77/3 — валидные).
  assert.equal(e.level, 5);
  assert.equal(e.xp, 30);
  assert.equal(e.loyalty, 77);
  assert.equal(e.hiredDay, 3);
});

// =====================================================================
// CS-4: боевые статы из sheet — allyDataForEntry даёт data.maxHP/
//       data.damage (derived + merc-модификатор с role-множителями);
//       makeAlly — явные значения (формула НЕ применена); мораль ×
//       явный урон (maxHP — не трогает).
//       Зафиксированные L1-значения — memory/000143-merc-sheet.md §2.9.
// =====================================================================

test('000143 CS-4: makeAlly из sheet — volk L1: maxHP 33 / damage 3; baldor L10: maxHP 95 (мораль не действует), damage 11 → makeAlly(…1.05) → 12 (мораль × явный урон)', () => {
  // Вольк L1 (melee ×1.0): base maxHP = round((20 + con2·5)) = 30;
  // ×hp 1.1 = 33. damage = max(1, round((2 + 0.7·1)·1.2·1)) = 3.
  const e = entryWithSheet(NPC_VOLK, { level: 1, xp: 0, loyalty: 65, day: 2 });
  const d = C.allyDataForEntry(e, NPC_VOLK);
  assert.ok(d, 'данные есть');
  assert.equal(d.id, 'merc_volk', 'id — npcId (маппинг allyXp, 000082)');
  assert.equal(d.name, 'Вольк');
  assert.equal(d.role, 'melee', 'роль — из каталога найма');
  assert.equal(d.level, 1, 'уровень — из записи (зеркало = sheet.level)');
  assert.equal(d.maxHP, 33, 'maxHP — sheet.derived + merc-модификатор (roleMult/hp)');
  assert.equal(d.damage, 3, 'damage — из sheet (левель-формула + кнопка dmg каталога)');
  assert.equal(d.armor, undefined, 'у Волька найм.armor нет (только у Бальдора — 3)');
  assert.deepEqual(d.skills, ['swordsman'], 'skills — id-список из sheet.secondary');
  assert.deepEqual(d.spells, []);
  assert.equal(d.kind, 'merc', 'маркер наёмника (фильтр доли 50%, 000082)');

  // makeAlly: явные maxHP/damage — формульная ветка НЕ применена
  // (крюки data.maxHP/data.damage, 000139 §6.5); armor — формула
  // (data.armor + floor(level/10)) БЕЗ ИЗМЕНЕНИЙ.
  const u1 = makeAlly(d, 0, 1.0);
  assert.equal(u1.maxHP, 33, 'явное maxHP — в обход формулы (8+4·ур)·hp·роль');
  assert.equal(u1.damage, 3, 'явный damage, мораль 1.0');
  assert.equal(u1.armor, 0, 'armor — формула (undefined + floor(1/10))');

  // Бальдор L10 (shield ×1.8, heavy 2 → +10%): base maxHP = 35 →
  // 35·1.5·1.8 = 94.5 → 95 (maxHP НЕ зависит от уровня — модель
  // 000140, рост — через очки 000145). damage = round((2 + 0.7·10)
  // ·1.1·1.1) = round(10.89) = 11.
  const eb = entryWithSheet(NPC_BALDOR, { level: 10, xp: 0 });
  const db = C.allyDataForEntry(eb, NPC_BALDOR);
  assert.equal(db.maxHP, 95, 'shield: role-множитель 1.8 в maxHP (в модификаторе — ОБЯЗАТЕЛЕН)');
  assert.equal(db.damage, 11);
  assert.equal(db.armor, 3, 'найм.armor передаётся (щит)');
  const u2 = makeAlly(db, 0, 1.05);
  assert.equal(u2.maxHP, 95, 'мораль на maxHP НЕ действует (было/остаётся)');
  assert.equal(u2.damage, 12,
    'мораль × ЯВНЫЙ урон: round(11·1.05) = 12 — инвариант «урон ВСЕХ союзников» (000080/000112 D6, пин CB-4)');
});

// =====================================================================
// CS-5: сейв round-trip — serializeRoster: ровно 4 поля
//       {npcId, sheet, loyalty, hiredDay}; deserialize(serialize) ===
//       runtime-запись (новая форма — неподвижная).
// =====================================================================

test('000143 CS-5: round-trip — найм → +50 xp → serialize: ровно {npcId, sheet, loyalty, hiredDay} → deserialize → deepEqual runtime-записи', () => {
  const r = C.createRoster();
  assert.equal(C.hire(r, NPC_VOLK, hero(15, 100), 2).ok, true);
  assert.equal(C.applyCombatXp(r, [{ id: 'merc_volk', xp: 50 }]).levelUps, 1);
  const before = JSON.parse(JSON.stringify(r));

  const snap = C.serializeRoster(r);
  assert.equal(snap.length, 1);
  assert.deepEqual(Object.keys(snap[0]).sort(),
    ['hiredDay', 'loyalty', 'npcId', 'sheet'],
    'форма сейва — ровно 4 поля (000139 C3; level/xp — внутри sheet)');
  assert.deepEqual(snap[0], {
    npcId: before[0].npcId,
    sheet: before[0].sheet,
    loyalty: before[0].loyalty,
    hiredDay: before[0].hiredDay,
  }, 'снапшот = проекция (sheet — копия)');

  const back = C.deserializeRoster(NPCS, snap);
  assert.deepEqual(back.dropped, [], 'новая форма — валидная, ничего не drop\'ится');
  assert.deepEqual(back.roster, before,
    'round-trip: runtime-запись после сейва/восстановления — идентична');
});

// =====================================================================
// CS-6: sanitizeMercSheet — ядро (→ null → drop): kind/npcId/primary/
//       level; полевая чистка (запись ЖИВА): secondary/totalXp/points;
//       тихая (0 console.warn — warn печатает main.js по dropped).
// =====================================================================

test('000143 CS-6: sanitize — битый sheet → drop (kind ≠ merc / npcId ≠ / primary не полон / level 0); чистка (чужой id и отрицательный secondary, totalXp −1 → xp, points −3 → 0) — запись жива; тихая', () => {
  // Базовая ВАЛИДНАЯ запись новой формы (Вольк L3, xp 40).
  const valid = entryWithSheet(NPC_VOLK, { level: 3, xp: 40, loyalty: 77, day: 5 });
  // top-level поля — ВЕРНЫ (изолируем именно sheet): drop обязан
  // прийти из sanitizeMercSheet, не из старых числовых проверок.
  const raw = (sh) => [{
    npcId: 'merc_volk', sheet: sh, level: 3, xp: 40, loyalty: 77, hiredDay: 5,
  }];

  // Ядро sanitize → null → запись в dropped (сброс ЗАПИСИ, не починка
  // значения — 000085; fallback на плоские поля НЕТ — ТЗ «invalid → reset»).
  const broken = [
    ['kind ≠ merc', Object.assign({}, valid.sheet, { kind: 'hero' })],
    ['sheet.npcId ≠ entry.npcId', Object.assign({}, valid.sheet, { npcId: 'merc_ashka' })],
    ['primary не полон', (() => {
      const s = Object.assign({}, valid.sheet,
        { primary: Object.assign({}, valid.sheet.primary) });
      delete s.primary.strength;
      return s;
    })()],
    ['sheet.level = 0', Object.assign({}, valid.sheet, { level: 0 })],
  ];
  for (const [name, sh] of broken) {
    const res = C.deserializeRoster(NPCS, raw(sh));
    assert.equal(res.roster.length, 0, name + ': запись отброшена');
    assert.deepEqual(res.dropped, ['merc_volk'],
      name + ': dropped = строка npcId (канал warn — main.js)');
  }

  // Полевая чистка (НЕ null — прецедент sanitizeSavedHero): запись
  // ЖИВА, битые пары/значения отфильтрованы/сброшены.
  const dirty = Object.assign({}, valid.sheet, {
    secondary: { swordsman: -2, ghost_skill: 7 }, // отрицательный + чужой id
    totalXp: -1,  // < 0 → fallback sheet.xp (инвариант totalXp ≥ 0)
    points: -3,   // < 0 → 0
  });
  const q = quiet(() => C.deserializeRoster(NPCS, raw(dirty)));
  assert.equal(q.res.roster.length, 1, 'запись после чистки — жива');
  assert.deepEqual(q.res.dropped, []);
  const s = q.res.roster[0].sheet;
  assert.deepEqual(s.secondary, {},
    'secondary: чужой id И отрицательный уровень отфильтрованы (id нужны UI 000145)');
  assert.equal(s.totalXp, 40, 'totalXp < 0 → fallback xp');
  assert.equal(s.points, 0, 'points < 0 → 0');
  assert.equal(q.n, 0, 'deserializeRoster ТИХАЯ (warn печатает main.js)');
});

// =====================================================================
// CS-7: браузерный guard — без sheet.js понятная ошибка (guard стоит
//       ПОСЛЕ guard player.js: в песочнице player-стаб ЕСТЬ, поэтому
//       срабатывает именно sheet). Существующий тест «без player.js»
//       (companions.test.js) остаётся зелёным — guard player.js
//       срабатывает РАНЬШЕ.
// =====================================================================

test('000143 CS-7: браузер — без sheet.js → понятная ошибка (guard: имена companions.js И sheet.js)', () => {
  const sandbox = { console, Game: {} };
  vm.createContext(sandbox);
  // Реальные global-settings/perlin (guards 000079 проходят); npc.js/
  // player.js — стабы (тот же паттерн, что в тесте «без player.js»,
  // companions.test.js L925): xpForNext-стаб → guard player.js
  // ПРОХОДИТ, следующий по порядку — guard sheet.js (000143).
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'global-settings.js'), 'utf8'),
    sandbox, { filename: 'global-settings.js' });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'perlin.js'), 'utf8'),
    sandbox, { filename: 'perlin.js' });
  sandbox.Game.hireCandidates = () => [];
  sandbox.Game.skillLevel = () => 0;
  sandbox.Game.xpForNext = (l) => Math.round(50 * Math.pow(l, 1.5));
  assert.throws(
    () => vm.runInContext(
      fs.readFileSync(path.join(__dirname, '..', 'src', 'companions.js'), 'utf8'),
      sandbox, { filename: 'companions.js' }),
    // Кросс-realm: ошибка СОЗДАНА в VM — `e instanceof Error` (хост)
    // ложна. Проверяем свойства (паттерн companions.test.js L939-948).
    (e) => e && typeof e.message === 'string'
      && /companions\.js/.test(e.message)
      && /sheet\.js/.test(e.message),
    'guard: «companions.js: … sheet.js …» (имена обоих файлов)');
});
