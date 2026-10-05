// Задача 000135 (красная стадия): зоны групп 3×3/5×5 — чистое ядро.
//
// Контракт: memory/000135-mob-group-zones.md §1/§2 (решения D1/D9),
// карточка — memory/000135-group-zones.md. ТЗ — tasks/pending/000135.md
// (раздел «Тесты»: детерминизм — чистая функция позиций+состава).
//
// Ядро — ЭКСПОРТЫ src/combat.js (решение D3):
//   * groupZoneInfo(groupType) → { radius: 1|2, triggers: boolean }
//     размер/триггер зоны — по aggro ПЕРВОГО МОБА (mobs[0]) рецепта
//     (решение D1: агрессивные/территориальные — 5×5 + триггер,
//     нейтральные/трусливые — 3×3 без триггера; нет данных —
//     консервативно {1, false}).
//   * findZoneCombat(px, py, groupTiles, defeatedAt)
//     → { x, y, mobGroup } | null — ЧИСТАЯ функция (позиции + состав +
//     defeatedAt), без rng, без Game/map в момент вызова:
//     1) группа на тайле игрока (dist 0, ЛЮБОЙ класс, !defeatedAt) —
//        приоритет (текущее поведение бит-в-бит);
//     2) иначе триггерящая группа dist ≤ radius (Чебышёв), !defeatedAt
//        — ближайшая, tie-break (dist, x, y) лексикографически (D9);
//     3) иначе null.
//
// RED: экспортов ещё нет — падения осмысленные (typeof !== function),
// не синтаксические.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/combat.js');
const { createMap } = require('../src/map.js');
const { generateSeedPixels } = require('../src/mapseed.js');

// Чебышёв-дистанция (для подписей ассертов).
function cheb(x1, y1, x2, y2) {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}

// Синтетический hasMobGroup-тайл (формат map.tileAt): моб группы —
// тип (0..6) или null (не-group тайл — гард findZoneCombat).
function tile(x, y, mobGroup) {
  return { x, y, passable: true, terrain: 3,
    hasMobGroup: mobGroup != null, mobGroup };
}

// --- Z1. Размер/триггер зоны: детерминирован по составу (первый моб) ---

test('Z1. groupZoneInfo — 5×5+триггер (aggressive/territorial mobs[0]), 3×3 без триггера (neutral/timid), мусор → {1,false} (задача 000135)', () => {
  assert.equal(typeof C.groupZoneInfo, 'function',
    'экспорт combat.js: groupZoneInfo (задача 000135)');
  // Таблица по ВСЕМ 7 группам каталога (правило D1 — mobs[0]):
  // 0 orc_camp — orc_warrior (aggressive); 1 orc_raid — orc_rider
  // (aggressive); 2 skeleton_den — skeleton (neutral); 3 wolf_pack —
  // wolf (neutral); 4 spider_nest — spider (territorial);
  // 5 elemental_circle — fire_elemental (aggressive);
  // 6 abyss_spirit — abomination (aggressive).
  const T = [
    [0, { radius: 2, triggers: true }],
    [1, { radius: 2, triggers: true }],
    [2, { radius: 1, triggers: false }],
    [3, { radius: 1, triggers: false }],
    [4, { radius: 2, triggers: true }],
    [5, { radius: 2, triggers: true }],
    [6, { radius: 2, triggers: true }],
  ];
  for (const [id, want] of T) {
    assert.deepEqual(C.groupZoneInfo(id), want, 'группа ' + id);
  }
  // Нет данных (recipe/моб/aggro) — консервативно {1, false}:
  // бой только на тайле, как до 000135.
  for (const junk of [7, 99, -1, null, undefined, 'x']) {
    assert.deepEqual(C.groupZoneInfo(junk),
      { radius: 1, triggers: false }, 'мусор: ' + String(junk));
  }
  // Детерминизм: повторный вызов — идентичен (без rng).
  assert.deepEqual(C.groupZoneInfo(4), C.groupZoneInfo(4),
    'повторный вызов — тот же результат (без rng)');
});

// --- Z2. Триггер: чистая функция позиций ---

test('Z2. findZoneCombat — таблица кейсов: 5×5-зона, 3×3 без триггера, defeatedAt, приоритет тайла, мульти-зона (задача 000135)', () => {
  assert.equal(typeof C.findZoneCombat, 'function',
    'экспорт combat.js: findZoneCombat (задача 000135)');
  const F = C.findZoneCombat;
  const spider = tile(10, 10, 4);   // territorial — 5×5, триггер
  const neutral = tile(10, 10, 2);  // neutral — 3×3, без триггера

  // Агрессивная/территориальная: внутри 5×5 (Чебышёв ≤ 2) → бой,
  // якорь — ТАЙЛ ГРУППЫ (не позиция игрока).
  for (const [px, py] of [[9, 10], [10, 8], [8, 8], [12, 12], [10, 12]]) {
    assert.deepEqual(F(px, py, [spider], new Map()),
      { x: 10, y: 10, mobGroup: 4 },
      `триггер: (${px},${py}) d=${cheb(px, py, 10, 10)} → зона-бой`);
  }
  // На границе (Чебышёв 3) → НЕ-бой.
  for (const [px, py] of [[7, 10], [10, 7], [13, 13], [7, 13]]) {
    assert.equal(F(px, py, [spider], new Map()), null,
      `граница: (${px},${py}) d=3 → без боя`);
  }
  // Нейтральная: в 3×3-зоне (1 клетка) ВНЕ тайла → НЕ-бой
  // (текущее поведение — бит-в-бит).
  assert.equal(F(9, 10, [neutral], new Map()), null,
    'нейтральная: в 3×3 без триггера — без боя');
  // На ТАЙЛЕ (любой класс) → бой (текущее поведение — бит-в-бит).
  assert.deepEqual(F(10, 10, [neutral], new Map()),
    { x: 10, y: 10, mobGroup: 2 }, 'нейтральная: на тайле — бой');
  assert.deepEqual(F(10, 10, [spider], new Map()),
    { x: 10, y: 10, mobGroup: 4 }, 'агрессивная: на тайле — бой');
  // defeatedAt (ключ = ТАЙЛ ГРУППЫ, формат 'x,y'): зона И тайл
  // не триггерят (общий guard, ТЗ).
  const df = new Map([['10,10', 3]]);
  assert.equal(F(9, 10, [spider], df), null,
    'defeatedAt — зона не триггерит');
  assert.equal(F(10, 10, [spider], df), null,
    'defeatedAt — тайл не триггерит');
  // Тайл игрока ПРИБОРИТЕТЕН над зоной чужой группы: стоя на своём
  // тайле герой дерётся со СВОЕЙ группой (текущее поведение).
  assert.deepEqual(F(5, 5,
    [tile(5, 5, 2), tile(7, 5, 4)], new Map()),
    { x: 5, y: 5, mobGroup: 2 },
    'свой тайл — своя группа (не чужая 5×5-зона)');
  // Мульти-зона (D9): ближайшая по Чебышёву; при равенстве —
  // tie-break (x, y) лексикографически (детерминизм).
  assert.deepEqual(F(0, 0, [tile(1, 1, 4), tile(2, 1, 4)], new Map()),
    { x: 1, y: 1, mobGroup: 4 }, 'ближняя d=1 бьёт дальнюю d=2');
  assert.deepEqual(F(0, 0,
    [tile(2, 1, 4), tile(1, 2, 0)], new Map()),
    { x: 1, y: 2, mobGroup: 0 },
    'равные d=2 → tie-break (x,y): (1,2) < (2,1)');
  // Null-safe: defeatedAt — null (не крах); не-group тайлы в списке
  // пропусаются; пустой список — null.
  assert.deepEqual(F(9, 10, [spider, tile(9, 10, null)], null),
    { x: 10, y: 10, mobGroup: 4 },
    'defeatedAt=null + чужой тайл в списке — без краха');
  assert.equal(F(9, 10, [tile(9, 10, null)], new Map()), null,
    'не-group тайлы в списке — пропускаются');
  assert.equal(F(0, 0, [], new Map()), null, 'пустой список — null');
});

// --- Z2p. Чистота: аргументы не мутируются, rng нет ---

test('Z2p. findZoneCombat — чистота: повтор идентичен, аргументы не мутируются (задача 000135)', () => {
  assert.equal(typeof C.findZoneCombat, 'function',
    'экспорт combat.js: findZoneCombat (задача 000135)');
  const tiles = [tile(10, 10, 4), tile(12, 12, 0)];
  const df = new Map([['12,12', 5]]);
  const snapTiles = tiles.map((t) => Object.assign({}, t));
  const snapDf = new Map(df);
  const r1 = C.findZoneCombat(9, 9, tiles, df);
  const r2 = C.findZoneCombat(9, 9, tiles, df);
  assert.deepEqual(r1, r2, 'два вызова с теми же аргументами — идентично');
  assert.deepEqual(tiles, snapTiles, 'groupTiles не мутируются');
  assert.deepEqual(df, snapDf, 'defeatedAt не мутируется');
});

// --- Z2св. Фолбэк-мир: спавн (0,0) вне зон триггерящих бой ---
//
// Регресс-пин спавна (решение D2/D7, e2e Z7 — vm-дубль): в
// детерминированном фолбэке (generateSeedPixels) у спавна (1,0) —
// skeleton_den (neutral, 3×3 без триггера), (2,3) — spider_nest
// (5×5, Чебышёв 3). Если правило зоны сломается (ANY-агрессия,
// сдвиг радиусов) — спавн оказывается в зоне → бой при старте →
// здесь null превратится в объект.

test('Z2св. фолбэк-мир: findZoneCombat(спавн 0,0) → null (регресс-пин, задача 000135)', () => {
  assert.equal(typeof C.findZoneCombat, 'function',
    'экспорт combat.js: findZoneCombat (задача 000135)');
  const m = createMap(generateSeedPixels());
  assert.ok(!m.tileAt(0, 0).hasMobGroup, 'сценарий: спавн (0,0) без группы');
  assert.equal(m.tileAt(1, 0).mobGroup, 2,
    'сценарий: логово скелетов (1,0) — neutral 3×3');
  assert.equal(m.tileAt(2, 3).mobGroup, 4,
    'сценарий: паучье гнездо (2,3) — 5×5 (Чебышёв 3 от спавна)');
  // Окно скана — Чебышёв ≤ 2 (максимум радиуса) — как собирает вызывающий.
  const tiles = [];
  for (let dx = -2; dx <= 2; dx++) {
    for (let dy = -2; dy <= 2; dy++) {
      const t = m.tileAt(dx, dy);
      if (t.hasMobGroup) {
        tiles.push({ x: dx, y: dy, hasMobGroup: true, mobGroup: t.mobGroup });
      }
    }
  }
  assert.equal(C.findZoneCombat(0, 0, tiles, new Map()), null,
    'спавн (0,0) — зона-боя НЕТ (нейтральная 3×3, не на тайле)');
});
