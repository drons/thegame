// 000161 (родитель 000156): dead_mercs — запись {npcId, sheet, loyalty,
// hiredDay} вместо голого npcId — фундамент воскрешения погибших
// наёмников (контракт D1, memory/000156-resurrection-design.md
// §3.D1/§5/§9.5; форма записи — serializeRoster, 000143; контракт
// задачи — memory/000161-dead-mercs-record.md).
//
// КРАСНЫЕ тесты (TDD): падают, пока src/companions.js не вырос:
//   DM-1..DM-5 — экспортов НЕТ (C.serializeDeadRecord /
//     C.reviveEntryFromRecord — undefined: «нет модульного символа»,
//     не синтаксис);
//   DM-6 — поведение: candidatesForTavern «new Set(deadMercs)» держит
//     ОБЪЕКТЫ — record.npcId ≠ элементу Set → «dead.has(n.id)» false →
//     мёртвый наёмник В кандидатах (повторный найм после гибели —
//     должен быть невозможен, D1).
//
// Формы (контракт D1 / 000143):
//   * RUNTIME-запись отряда — ровно 6 ключей {npcId, sheet, level, xp,
//     loyalty, hiredDay}: sheet — единый лист наёмника (kind 'merc',
//     000140), level/xp — ПЛОСКИЕ ЗЕРКАЛА sheet.level/sheet.xp;
//   * запись погибшего (live deadMercs + форма сейва dead_mercs) —
//     ровно 4 поля {npcId, sheet, loyalty, hiredDay} (level/xp —
//     ВНУТРИ sheet, зеркала не сейвятся) — форма serializeRoster;
//   * reviveEntryFromRecord(npcs, raw) — ЕДИНАЯ точка нормализации
//     «запись о погибшем → runtime-запись отряда»:
//       * string (legacy, данные утрачены) — BACKFILL: НОВЫЙ лист из
//         каталога найма (createMercSheet: level 1/xp 0/totalXp 0/
//         points 0, primary/secondary/spells — найм-каталог 000141),
//         loyalty 50, hiredDay 0 (тихий сброс, 000029 — задокументи-
//         ровано: SPEC «Спутники → Сейв»);
//       * record — sanitize (sanitizeMercSheet: битое ЯДРО → null,
//         чистка полей — запись живёт) + скаляры (loyalty — finite →
//         clamp 0..100 без округления; hiredDay — finite ≥ 0 → floor,
//         0 — легитимный sentinel backfill-записи, гейт ≥ 1 из
//         deserializeRoster НЕ переносится);
//       * подделка (битое ядро sheet / нет sheet / битые loyalty·
//         hiredDay) / призрак (npcId не в каталоге) / мусор → null —
//         сброс ЗАПИСИ, не починка значения (000085/000143); тихая
//         (0 console) — warn печатает main.js по bad-списку;
//   * serializeDeadRecord(entry) — ЧИСТАЯ проекция ровно 4 полей
//     (reuse serializeRoster), sheet — СВЕЖАЯ глубокая копия; entry
//     без sheet / мусор → null (тихий skip).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { NPCS } = require('../src/npc-data.js');
const S = require('../src/sheet.js');
const C = require('../src/companions.js');

// --- Хелперы ---

// NPC каталога по id (с найм-данными — инвариант 000141: все 6
// наёмников полные).
function npcById(id) {
  const n = NPCS.find((x) => x && x.id === id);
  assert.ok(n && n.найм && typeof n.найм === 'object',
    'каталог: npc ' + id + ' с найм-данными (000141)');
  return n;
}

// Канонический merc-лист из каталога найма (000141/000143) —
// независимая копия createMercSheet (как mercSheet в
// tests/companions.test.js): level/xp — параметры (totalXp = xp —
// инвариант 000140).
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
  s.totalXp = xp;
  return s;
}

// RUNTIME-запись отряда — ровно 6 ключей (000143 §2.1): sheet +
// плоские зеркала level/xp.
function entryWithSheet(npcId,
    { level = 1, xp = 0, loyalty = 50, hiredDay = 1 } = {}) {
  const npc = npcById(npcId);
  return {
    npcId, sheet: mercSheet(npc, { level, xp }),
    level, xp, loyalty, hiredDay,
  };
}

// Запись погибшего — ровно 4 поля (форма сейва / live deadMercs,
// 000143/000161): чистая проекция runtime-записи.
function deadRecord(npcId, sheet, loyalty, hiredDay) {
  return { npcId, sheet, loyalty, hiredDay };
}

// Счётчик тишины: функции ДОЛЖНЫ быть тихими (0 console) — warn
// печатает main.js по bad-списку (D1, паттерн 000085).
function quiet(fn) {
  const ow = console.warn, oe = console.error;
  let n = 0;
  console.warn = () => { n += 1; };
  console.error = () => { n += 1; };
  try {
    const res = fn();
    return { res, n };
  } finally {
    console.warn = ow;
    console.error = oe;
  }
}

// --- DM-1: serializeDeadRecord ---

test('000161 DM-1: serializeDeadRecord — ровно 4 поля {npcId, sheet, loyalty, hiredDay}; fresh-copy; без sheet/мусор → null; тихая', () => {
  assert.equal(typeof C.serializeDeadRecord, 'function',
    'экспорт serializeDeadRecord (000161, D1) — отсутствует (красное)');
  const e = entryWithSheet('merc_volk',
    { level: 2, xp: 30, loyalty: 77, hiredDay: 3 });
  const q = quiet(() => C.serializeDeadRecord(e));
  assert.equal(q.n, 0, 'тихая (0 console)');
  const rec = q.res;
  assert.ok(rec && typeof rec === 'object' && !Array.isArray(rec),
    'валидная runtime-запись — запись');
  assert.deepEqual(Object.keys(rec).sort(),
    ['hiredDay', 'loyalty', 'npcId', 'sheet'],
    'ровно 4 поля (форма serializeRoster, 000143 — зеркала НЕ сейвятся)');
  assert.equal(rec.npcId, 'merc_volk');
  assert.equal(rec.loyalty, 77, 'loyalty — как в записи');
  assert.equal(rec.hiredDay, 3, 'hiredDay — как в записи');
  assert.deepEqual(rec.sheet, e.sheet, 'sheet — лист записи');
  assert.notEqual(rec.sheet, e.sheet, 'sheet — СВЕЖАЯ копия (не ссылка)');
  // fresh-copy-пин (T1/CS-5): мутация input — снапшот не меняется.
  const before = JSON.stringify(rec);
  e.sheet.xp = 999;
  e.sheet.primary.strength = 99;
  e.sheet.spells.push('teleport');
  e.loyalty = 1;
  assert.equal(JSON.stringify(rec), before,
    'мутация entry (sheet/loyalty) — снапшот не изменился (fresh-copy)');
  // Без sheet (инвариант-нарушение, в игре недостижимо) → null.
  assert.equal(C.serializeDeadRecord({ npcId: 'merc_volk', level: 2,
    xp: 30, loyalty: 77, hiredDay: 3 }), null, 'без sheet → null');
  // Мусор → null (тихий skip, паттерн serializeRoster).
  for (const junk of [null, 42, 'merc_volk', [1], { level: 1, xp: 0 },
    { npcId: 42, sheet: e.sheet },
    { npcId: 'merc_volk', sheet: null }]) {
    assert.equal(C.serializeDeadRecord(junk), null,
      'мусор → null: ' + JSON.stringify(junk));
  }
});

// --- DM-2: reviveEntryFromRecord (record) ---

test('000161 DM-2: reviveEntryFromRecord (record) — runtime-запись 6 ключей: sanitize + зеркала level/xp; loyalty clamp; hiredDay floor (0 → 0)', () => {
  assert.equal(typeof C.reviveEntryFromRecord, 'function',
    'экспорт reviveEntryFromRecord (000161, D1) — отсутствует (красное)');
  const npc = npcById('merc_volk');
  // Валидный record с «грязными» ПОЛЯМИ (чистка sanitizeMercSheet —
  // запись живёт, 000143 §2.6): чужой id навыка, totalXp < xp,
  // дробные points.
  const sh = mercSheet(npc, { level: 3, xp: 20 });
  sh.secondary['нет_такого_навыка'] = 5;
  sh.totalXp = -1; // битый totalXp → xp (инвариант totalXp ≥ xp)
  sh.points = 2.5; // дробные points → 0
  const q = quiet(() => C.reviveEntryFromRecord(NPCS,
    { npcId: 'merc_volk', sheet: sh, loyalty: 77.5, hiredDay: 2.7 }));
  assert.equal(q.n, 0, 'тихая (0 console)');
  const e = q.res;
  assert.ok(e && typeof e === 'object' && !Array.isArray(e),
    'валидный record — runtime-запись');
  assert.deepEqual(Object.keys(e).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
    'ровно 6 ключей (RUNTIME-форма, 000143 §2.1)');
  assert.equal(e.npcId, 'merc_volk');
  // Зеркала — из sheet (4-я легитимная точка их происхождения,
  // 000143 §2.1: hire/applyCombatXp/deserializeRoster/+ revive).
  assert.equal(e.level, e.sheet.level, 'зеркало level = sheet.level');
  assert.equal(e.xp, e.sheet.xp, 'зеркало xp = sheet.xp');
  assert.equal(e.level, 3, 'level из листа (не выдуман)');
  assert.equal(e.xp, 20, 'xp из листа (не выдуман)');
  assert.equal(e.loyalty, 77.5,
    'loyalty 77.5 валиден (без округления, прецедент deserializeRoster)');
  assert.equal(e.hiredDay, 2, 'hiredDay floor: 2.7 → 2');
  // Чистка полей: запись ЖИВЁТ (не сброс).
  assert.notEqual(e.sheet, sh, 'sheet — свежий объект (не input)');
  assert.ok(!('нет_такого_навыка' in e.sheet.secondary),
    'чужой id навыка — отфильтрован (каталог)');
  assert.equal(e.sheet.totalXp, 20, 'totalXp −1 → xp (totalXp ≥ xp)');
  assert.equal(e.sheet.points, 0, 'points дробное → 0');
  assert.deepEqual(e.sheet.primary, npc.найм.базовые_характеристики,
    'ядро primary — как есть (каталог)');
  // loyalty clamp 0..100 (без округления).
  for (const [raw, want] of [[150, 100], [-5, 0], [50, 50]]) {
    const e2 = C.reviveEntryFromRecord(NPCS, {
      npcId: 'merc_volk', sheet: mercSheet(npc), loyalty: raw,
      hiredDay: 1 });
    assert.ok(e2, 'loyalty ' + raw + ' — запись жива');
    assert.equal(e2.loyalty, want, 'loyalty ' + raw + ' → ' + want);
  }
  // hiredDay 0 — легитимный sentinel backfill-записи (гейт ≥ 1 из
  // deserializeRoster НЕ переносится — §2.4: иначе каждый restore
  // отбрасывал бы backfilled-запись — тихая потеря).
  const e0 = C.reviveEntryFromRecord(NPCS, {
    npcId: 'merc_volk', sheet: mercSheet(npc), loyalty: 50, hiredDay: 0 });
  assert.ok(e0, 'hiredDay 0 — запись валидна (не «битая»)');
  assert.equal(e0.hiredDay, 0, 'hiredDay 0 → 0');
});

// --- DM-3: backfill string → record (тихий сброс, 000029) ---

test('000161 DM-3: backfill — голый npcId (старый формат) → запись: НОВЫЙ лист из каталога найма (L1/xp0/totalXp0/points0), loyalty 50, hiredDay 0, зеркала 1/0', () => {
  assert.equal(typeof C.reviveEntryFromRecord, 'function',
    'экспорт reviveEntryFromRecord (000161, D1) — отсутствует (красное)');
  const npc = npcById('merc_volk');
  const q = quiet(() => C.reviveEntryFromRecord(NPCS, 'merc_volk'));
  assert.equal(q.n, 0, 'тихая (0 console)');
  const e = q.res;
  assert.ok(e && typeof e === 'object',
    'строка — ЛЕГИТИМНЫЙ старый формат (не подделка) — запись');
  assert.deepEqual(Object.keys(e).sort(),
    ['hiredDay', 'level', 'loyalty', 'npcId', 'sheet', 'xp'],
    'ровно 6 ключей (runtime-форма)');
  assert.equal(e.npcId, 'merc_volk');
  assert.equal(e.loyalty, 50,
    'backfill: loyalty 50 (базовая лояльность найма, задокументировано)');
  assert.equal(e.hiredDay, 0,
    'backfill: hiredDay 0 («день неизвестен», задокументировано)');
  assert.equal(e.level, 1, 'зеркало level 1');
  assert.equal(e.xp, 0, 'зеркало xp 0');
  // Лист — НОВЫЙ из каталога найма (000141): данные (уровень/опыт)
  // утрачены до появления воскрешения — тихий сброс (000029).
  assert.equal(e.sheet.kind, 'merc');
  assert.equal(e.sheet.npcId, 'merc_volk');
  assert.equal(e.sheet.level, 1, 'sheet.level 1 (новый лист)');
  assert.equal(e.sheet.xp, 0, 'sheet.xp 0 (новый лист)');
  assert.equal(e.sheet.totalXp, 0, 'sheet.totalXp 0');
  assert.equal(e.sheet.points, 0, 'sheet.points 0');
  assert.deepEqual(e.sheet.primary, npc.найм.базовые_характеристики,
    'primary — из каталога найма (000141)');
  const wantSecondary = {};
  for (const [id, lv] of Object.entries(npc.найм.начальные_навыки || {})) {
    if (Number.isInteger(lv) && lv >= 1) wantSecondary[id] = lv;
  }
  assert.deepEqual(e.sheet.secondary, wantSecondary,
    'secondary — начальные_навыки каталога');
  assert.deepEqual(e.sheet.spells, npc.найм.spells, 'spells — каталог');
  assert.deepEqual(e.sheet.skillXp, {}, 'skillXp — пуст (новый лист)');
  // Детерминизм: backfill — каталог + константы, ноль новых RNG.
  const e2 = C.reviveEntryFromRecord(NPCS, 'merc_volk');
  assert.deepEqual(e2, e, 'повторный backfill — идентичен (детерминизм)');
});

// --- DM-4: подделка/мусор → null (тихий сброс ЗАПИСИ) ---

test('000161 DM-4: подделанный record / призрак / мусор → null (тихий сброс записи, НЕ починка значения, 000085/000143)', () => {
  assert.equal(typeof C.reviveEntryFromRecord, 'function',
    'экспорт reviveEntryFromRecord (000161, D1) — отсутствует (красное)');
  const npc = npcById('merc_volk');
  const sh = () => mercSheet(npc);
  const rec = (over) =>
    Object.assign({ npcId: 'merc_volk', sheet: sh(), loyalty: 50,
      hiredDay: 1 }, over);
  const forged = [
    // Битое ЯДРО sheet (sanitizeMercSheet → null) — запись УБИРАЕТСЯ.
    ['sheet kind ≠ merc', rec({ sheet: Object.assign(sh(), { kind: 'hero' }) })],
    ['sheet.npcId ≠ record.npcId', rec({ sheet: Object.assign(sh(), { npcId: 'merc_ashka' }) })],
    ['sheet без npcId', rec({ sheet: Object.assign(sh(), { npcId: null }) })],
    ['sheet level 0', rec({ sheet: Object.assign(sh(), { level: 0 }) })],
    ['sheet level 2.5 (не int)', rec({ sheet: Object.assign(sh(), { level: 2.5 }) })],
    ['sheet xp −1', rec({ sheet: Object.assign(sh(), { xp: -1 }) })],
    ['sheet primary неполное', rec({ sheet: (() => { const s = sh(); delete s.primary.charisma; return s; })() })],
    ['sheet primary < 1', rec({ sheet: Object.assign(sh(), { primary: Object.assign({}, sh().primary, { strength: 0 }) }) })],
    ['sheet null', rec({ sheet: null })],
    ['sheet отсутствует', { npcId: 'merc_volk', loyalty: 50, hiredDay: 1 }],
    ['sheet массив', rec({ sheet: [1] })],
    ['sheet не-объект', rec({ sheet: 42 })],
    // Битые скаляры (000085: невалидные → запись в dropped, не чиним).
    ['loyalty NaN', rec({ loyalty: NaN })],
    ["loyalty 'x'", rec({ loyalty: 'x' })],
    ['loyalty null', rec({ loyalty: null })],
    ['hiredDay NaN', rec({ hiredDay: NaN })],
    ['hiredDay −1', rec({ hiredDay: -1 })],
    ['hiredDay null', rec({ hiredDay: null })],
    // Призрак (npcId не в каталоге — критерий найм-объекта, 000085).
    ['ghost string', 'ghost_merc'],
    ['ghost record', { npcId: 'ghost_merc', sheet: sh(), loyalty: 50, hiredDay: 1 }],
  ];
  for (const [label, raw] of forged) {
    const q = quiet(() => C.reviveEntryFromRecord(NPCS, raw));
    assert.equal(q.n, 0, label + ': тихая (0 console)');
    assert.equal(q.res, null, label + ' → null (сброс ЗАПИСИ)');
  }
  // Мусор (не string, не объект со строкой npcId) — тихий skip, как
  // не-строка в restore (000085).
  for (const junk of [null, 42, 'junk', [1], { npcId: 42 },
    { sheet: sh() }, { npcId: null }]) {
    assert.equal(C.reviveEntryFromRecord(NPCS, junk), null,
      'мусор → null: ' + JSON.stringify(junk));
  }
});

// --- DM-5: round-trip (D1: запись несёт всё для воскрешения) ---

test('000161 DM-5: round-trip entry → record → entry — без потерь (D1: запись несёт ВСЁ для воскрешения: уровень/опыт/лояльность/день)', () => {
  assert.equal(typeof C.serializeDeadRecord, 'function',
    'экспорт serializeDeadRecord (000161, D1) — отсутствует (красное)');
  assert.equal(typeof C.reviveEntryFromRecord, 'function',
    'экспорт reviveEntryFromRecord (000161, D1) — отсутствует (красное)');
  const e = entryWithSheet('merc_ashka',
    { level: 2, xp: 45, loyalty: 66, hiredDay: 9 });
  e.sheet.points = 1; // потраченное очко — тоже переживает round-trip
  const rec = C.serializeDeadRecord(e);
  assert.ok(rec, 'валидный entry — запись');
  assert.deepEqual(Object.keys(rec).sort(),
    ['hiredDay', 'loyalty', 'npcId', 'sheet'],
    'record — ровно 4 поля');
  const back = C.reviveEntryFromRecord(NPCS, rec);
  assert.deepEqual(back, e,
    'round-trip БЕЗ ПОТЕРЬ: level/xp — внутри sheet, loyalty/hiredDay — скаляры (D1)');
});

// --- DM-6: candidatesForTavern — адаптер двух форматов ---

test('000161 DM-6: candidatesForTavern — deadMercs ЗАПИСЯМИ (record.npcId); legacy-строки работают; повторный найм после гибели — НЕЛЬЗЯ', () => {
  const rena = npcById('merc_rena');
  const baldor = npcById('merc_baldor');
  const volk = npcById('merc_volk');
  const recRena = deadRecord('merc_rena', mercSheet(rena), 77, 3);
  const recBaldor = deadRecord('merc_baldor', mercSheet(baldor), 50, 0);
  // (a) ЗАПИСЬ — отфильтрована (record.npcId в dead_mercs — D1).
  assert.deepEqual(C.candidatesForTavern(NPCS, [], [recRena]).map((n) => n.id),
    ['merc_volk', 'merc_ashka', 'merc_baldor', 'merc_mira', 'merc_torga'],
    'запись merc_rena — НЕ кандидат (D1: мёртв — не возвращается в таверну)');
  // (b) legacy-строка — по-прежнему работает (пины G2/U3 — без правок).
  assert.deepEqual(C.candidatesForTavern(NPCS, [], ['merc_rena']).map((n) => n.id),
    ['merc_volk', 'merc_ashka', 'merc_baldor', 'merc_mira', 'merc_torga'],
    'legacy-строка merc_rena — НЕ кандидат (адаптер двух форматов)');
  // (c) Смешанный формат (record + legacy-строка) — оба отфильтрованы.
  assert.deepEqual(C.candidatesForTavern(NPCS, [],
    [recRena, 'merc_baldor']).map((n) => n.id),
    ['merc_volk', 'merc_ashka', 'merc_mira', 'merc_torga'],
    'микс форматов: запись rena + строка baldor — оба отфильтрованы');
  // (d) Мусор в deadMercs — не падает, никого не отфильтровывает.
  assert.deepEqual(C.candidatesForTavern(NPCS, [],
    [42, null, 'junk_ghost', { loyalty: 50 }, recRena]).map((n) => n.id),
    ['merc_volk', 'merc_ashka', 'merc_baldor', 'merc_mira', 'merc_torga'],
    'мусор (число/null/не-строка-призрак/объект без npcId) — тихий skip');
  // (e) Фильтр roster — НЕЗАВИСИМ от deadMercs (2 разных фильтра).
  assert.deepEqual(C.candidatesForTavern(NPCS,
    [entryWithSheet('merc_volk', { level: 1, xp: 0, loyalty: 50, hiredDay: 1 })],
    [recRena]).map((n) => n.id),
    ['merc_ashka', 'merc_baldor', 'merc_mira', 'merc_torga'],
    'нанятый volk (roster) + мёртвый rena (запись) — оба отфильтрованы');
  // (f) ПИН ТЗ: повторный найм ПОСЛЕ ГИБЕЛИ — НЕЛЬЗЯ (D1): запись о
  // гибели — окончательна, возврат только воскрешением (000162).
  assert.equal(C.candidatesForTavern(NPCS, [], [recRena])
    .some((n) => n.id === 'merc_rena'), false,
    'повторный найм после гибели — НЕЛЬЗЯ (record.npcId в dead_mercs)');
  assert.equal(C.candidatesForTavern(NPCS, [], [recBaldor])
    .some((n) => n.id === 'merc_baldor'), false,
    'backfill-запись (hiredDay 0) — тоже окончательна');
  // Порядок каталога у выживших кандидатов — сохранён.
  assert.deepEqual(C.candidatesForTavern(NPCS, [], [recRena, recBaldor])
    .map((n) => n.id),
    ['merc_volk', 'merc_ashka', 'merc_mira', 'merc_torga'],
    'остальные — в порядке каталога');
});
