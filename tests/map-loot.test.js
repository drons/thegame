// Задача 000158.03 — Глобальная карта: единая функция контента тайла
// (пусто/лут/моб/здание). ТЗ: tasks/pending/000158.03.md; дизайн и
// контракты: memory/000158.03-world-loot-core.md (код §3, D1-D13).
//
// КРАСНЫЕ ТЕСТЫ (TDD): поле `loot` в tileAt, функции инстанса
// lootAt/nearMountain и сид LOOT_SEED в src/map.js ЕЩЁ НЕТ — ML1-ML8
// падают ПО СМЫСЛУ (отсутствует поле/функция/экспорт; лут = 0 на всём
// окне), ML7b — зелёный гард «старые 13 полей byte-в-те же» с 1-го
// запуска (логика каналов 1:1 — ТЗ п.2).
//
// Мир — реальный assets/map.png (seed 0xf10c7a26); окно
// детерминировано: 240×240 вокруг origin (x, y ∈ [−120, 120)) — база
// ТЗ. ОДИН проход tileAt на 57600 тайлов (полные объекты) — модульный
// ленивый синглтон getProbe(), общий для ML1-ML6.
//
// Составы каталога — зеркала пинов 000158.02 (tests/items.test.js
// NUGGETS_00015802 + таблица §2.1: 14 самородков terrains ['песок'] +
// 14 reagent 000063-000076); «item ∈ каталогу» — живой scan ITEMS
// (анти-дрейф).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createMap, TERRAIN, TERRAIN_NAMES,
} = require('../src/map.js');
const { ITEMS } = require('../src/items-data.js');
const { decodePng } = require('./png.js');
const fs = require('node:fs');
const vm = require('node:vm');

// «Браузерный» путь UMD: исполняем файл в чистом контексте без
// module/exports (паттерн tests/global-settings.test.js).
function loadInSandbox(file, sandbox) {
  const code = fs.readFileSync(__dirname + '/../src/' + file, 'utf8');
  vm.runInNewContext(code, sandbox);
}

// Окно детерминировано: 240×240 вокруг origin (ТЗ).
const R = 120;

// --- Составы каталога лута (зеркала 000158.02) ---
// 14 самородков (terrains ['песок'], near_mountains: true).
const NUGGET_LOOT = new Set([
  'moonstone', 'iron_ore', 'copper_ore', 'silver_ore', 'gold_ore',
  'mithril_ore', 'quartz', 'obsidian', 'phosphorite', 'ruby',
  'sapphire', 'emerald', 'amethyst', 'diamond',
]);
// 13 лесных reagent (terrains ⊇ 'лес'); грибы ⊆ лес (SPEC/000158.02).
const FOREST_REAGENTS = new Set([
  'berry_red', 'berry_blue', 'berry_wild', 'herb_sun', 'herb_wind',
  'root_moon', 'root_ember', 'fruit_apple', 'fruit_plum', 'fruit_quince',
  'mushroom_grey', 'mushroom_glow', 'mushroom_ink',
]);
const MUSHROOM_LOOT = new Set(
  ['mushroom_grey', 'mushroom_glow', 'mushroom_ink']);
// Живой анти-дрейф: id ВСЕХ предметов каталога с полем loot (сейчас 28:
// 14 самородков + 14 reagent).
const LOOT_ITEM_IDS = new Set(
  ITEMS.filter((it) => it && it.loot && typeof it.loot === 'object')
       .map((it) => it.id));

// --- ОДИН проход tileAt на 240×240 (ленивый синглтон) ---
let _probe = null;
function getProbe() {
  if (_probe) return _probe;
  const { width, height, data } = decodePng('assets/map.png');
  const map = createMap({ width, height, data });
  const tiles = new Map();
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) tiles.set(x + ',' + y, map.tileAt(x, y));
  }
  _probe = { map, tiles };
  return _probe;
}

// «Пустой» тайл — локация, где лут спрашивается (ТЗ п.1): проходимый
// (террейнная проходимость) && вне footprint постройки && без mob-
// группы. Для тайлов без cover возвращаемая t.passable = террейнная.
function isEmpty(t) {
  return t.passable && !t.inBuilding && !t.hasMobGroup;
}

// Старые 13 полей тайла (до 000158.03) — регресс-гард «каналы 1:1».
const OLD_TILE_FIELDS = [
  'x', 'y', 'terrain', 'passable', 'hasBuilding', 'building',
  'buildingWealth', 'hasMobGroup', 'mobGroup', 'inBuilding',
  'isEntrance', 'buildingAnchor', 'buildingId',
];
function oldFields(t) {
  const o = {};
  for (const f of OLD_TILE_FIELDS) o[f] = t[f];
  return o;
}

test('000158.03 ML1: поле loot в tileAt — null | {item: id} на ВСЁМ 240×240; id ∈ каталогу (28 loot-предметов)', () => {
  assert.equal(LOOT_ITEM_IDS.size, 28,
    'каталог: 28 предметов с полем loot (14 самородков + 14 reagent)');
  const { tiles } = getProbe();
  let checked = 0;
  for (const t of tiles.values()) {
    assert.ok('loot' in t,
      `(${t.x},${t.y}): в tileAt нет поля loot `
      + '(краснота: поле не реализовано — src/map.js)');
    const L = t.loot;
    assert.ok(L === null || (typeof L === 'object' && L !== null
      && typeof L.item === 'string'),
      `(${t.x},${t.y}): loot — null | {item: string}, факт ${JSON.stringify(L)}`);
    if (L) {
      assert.ok(LOOT_ITEM_IDS.has(L.item),
        `(${t.x},${t.y}): item ${L.item} — не из каталога loot-предметов`);
    }
    checked++;
  }
  assert.equal(checked, 240 * 240, 'окно 240×240 целиком');
});

test('000158.03 ML2: взаимоисключение (0 нарушений на 240×240): постройка/моб/непроходимый → loot=null; lootAt — self-contained (вода/гора/постройка/моб → null) и ≡ tileAt.loot на всём окне', () => {
  const { map, tiles } = getProbe();
  assert.equal(typeof map.lootAt, 'function',
    'map.js: нет функции инстанса lootAt(x, y) (краснота: не реализовано)');
  let violations = 0, firstBad = null, coverCk = 0, mobCk = 0, impassableCk = 0;
  for (const t of tiles.values()) {
    if (t.inBuilding) coverCk++;
    if (t.hasMobGroup) mobCk++;
    if (!t.passable) impassableCk++;
    if ((t.inBuilding || t.hasMobGroup || !t.passable) && t.loot !== null) {
      violations++;
      if (!firstBad) firstBad = `(${t.x},${t.y}) loot=${JSON.stringify(t.loot)}`;
    }
    // Паритет (ревью 000158.03, D5): lootAt ≡ tileAt.loot на ВСЁМ
    // окне — системный гард против дрейфа дублированной формулы
    // mob-канала (tileAt hasMobGroup vs lootAt-чтение, memory §9.1):
    // правка порога/офсета в одной из копий формулы → красный здесь.
    assert.deepEqual(map.lootAt(t.x, t.y), t.loot,
      `(${t.x},${t.y}): lootAt ≠ tileAt.loot (дрейф формулы mob-канала, D5)`);
  }
  // Зонд окна: все три класса исключений присутствуют (иначе ассерт
  // «0 нарушений» тривиален).
  assert.ok(coverCk > 0, 'в окне есть тайлы построек (зонд)');
  assert.ok(mobCk > 0, 'в окне есть mob-группы (зонд)');
  assert.ok(impassableCk > 0, 'в окне есть непроходимые тайлы (зонд)');
  assert.equal(violations, 0,
    `нарушение взаимоисключения (${violations}): loot на тайле `
    + `постройки/моба/воды-горы (приоритет: строительство > моб > `
    + `лут > пусто); первый: ${firstBad}`);
  // lootAt — САМОДОСТАТОЧНАЯ (свои guard'ы): точки-представители.
  assert.equal(map.lootAt(-120, -64), null, 'вода (−120,−64): lootAt → null');
  assert.equal(map.lootAt(-119, 26), null, 'горы (−119,26): lootAt → null');
  assert.equal(map.lootAt(-119, -104), null,
    'вход постройки (−119,−104): lootAt → null (любой тайл footprint, вкл. вход)');
  assert.equal(map.lootAt(-120, -113), null,
    'тайл mob-группы (−120,−113): lootAt → null (моб приоритетнее)');
});

test('000158.03 ML3: распределение — трава: первые 2000 ПУСТЫХ травяных (детерм. скан x→y) — доля с лутом ≈ 0.32 (Σf трав, 000158.02 §2.1) ±0.05', () => {
  // Σf 8 травяных кандидатов: 0.04+0.1 (berry_wild — дефолт)+0.03+0.03
  // +0.03+0.03+0.04+0.02 = 0.32. Теор. 1−Π(1−f) ≈ 0.2804 — в диапазоне.
  const { tiles } = getProbe();
  const GRASS_SUM_FREQ = 0.32;
  let n = 0, withLoot = 0;
  for (let x = -R; x < R && n < 2000; x++) {
    for (let y = -R; y < R && n < 2000; y++) {
      const t = tiles.get(x + ',' + y);
      if (t.terrain !== TERRAIN.GRASS || !isEmpty(t)) continue;
      n++;
      if (t.loot && typeof t.loot === 'object') withLoot++;
    }
  }
  assert.equal(n, 2000, 'в окне ≥2000 пустых травяных тайлов (зонд)');
  const obs = withLoot / n;
  assert.ok(Math.abs(obs - GRASS_SUM_FREQ) <= 0.05,
    `трава: доля с лутом ${obs.toFixed(4)} ≠ 0.32 ±0.05 `
    + '(Σ frequency травяных reagent, 000158.02 §2.1; паттерн 000021)');
});

test('000158.03 ML4: распределение — лес: состав (13 лесных reagent; самородки ТОЛЬКО если nearMountain), ≥1 mushroom_*', () => {
  const { map, tiles } = getProbe();
  assert.equal(typeof map.nearMountain, 'function',
    'map.js: нет функции инстанса nearMountain(x, y) (краснота: не реализовано)');
  let n = 0, withLoot = 0, mushrooms = 0, bad = 0, firstBad = null;
  for (const t of tiles.values()) {
    if (t.terrain !== TERRAIN.FOREST || !isEmpty(t)) continue;
    n++;
    const L = t.loot;
    if (!L || typeof L !== 'object') continue;
    withLoot++;
    if (MUSHROOM_LOOT.has(L.item)) mushrooms++;
    const ok = FOREST_REAGENTS.has(L.item)
      || (NUGGET_LOOT.has(L.item) && map.nearMountain(t.x, t.y));
    if (!ok) {
      if (!firstBad) firstBad = `(${t.x},${t.y}) ${L.item} nm=${map.nearMountain(t.x, t.y)}`;
      bad++;
    }
  }
  assert.ok(n > 500, 'в окне ≥500 пустых лесных тайлов (зонд)');
  assert.equal(bad, 0,
    `лоут леса: нарушен состав (${bad}: 13 лесных reagent + самородки `
    + `только рядом с горой; класс→terrain — SPEC/000158.02); `
    + `первый: ${firstBad}`);
  assert.ok(withLoot >= 1,
    'в окне ≥1 лесной тайл с лутом (краснота: лута ещё нет)');
  assert.ok(mushrooms >= 1,
    'в окне ≥1 mushroom_* (грибы ⊆ лес, 000158.02)');
});

test('000158.03 ML5: распределение — песок: лут ТОЛЬКО руда/самоцветы (14 nugget); ∃ песчаный тайл с лутом', () => {
  const { tiles } = getProbe();
  let n = 0, withLoot = 0, bad = 0, firstBad = null;
  for (const t of tiles.values()) {
    if (t.terrain !== TERRAIN.SAND || !isEmpty(t)) continue;
    n++;
    const L = t.loot;
    if (!L || typeof L !== 'object') continue;
    withLoot++;
    if (!NUGGET_LOOT.has(L.item)) {
      if (!firstBad) firstBad = `(${t.x},${t.y}) ${L.item}`;
      bad++;
    }
  }
  assert.ok(n > 1000, 'в окне ≥1000 пустых песчаных тайлов (зонд)');
  assert.equal(bad, 0,
    `лоут песка: только самородки (${bad}: у 14 reagent «песок» в `
    + `terrains НЕТ, 000158.02 §2.1 — анти-перекрёст); `
    + `первый: ${firstBad}`);
  assert.ok(withLoot >= 1,
    'в окне ≥1 песчаный тайл с лутом (краснота: лута ещё нет)');
});

test('000158.03 ML6: nearMountain — холм у горы несёт nugget (запущенные координаты); вода — никогда', () => {
  const { map, tiles } = getProbe();
  assert.equal(typeof map.nearMountain, 'function',
    'map.js: нет функции инстанса nearMountain(x, y) (краснота: не реализовано)');
  // Запущенный тайл (детерм. проба реального map.png, окно ±120, скан
  // x→y; в окне 316 таких тайлов): холмы, проходимый, без постройки/
  // моба, гора в 8-окрестности (ортогональная (1,0)) — лут только
  // самородки (у холмов нет природных кандидатов).
  const t = map.tileAt(-120, 26);
  assert.equal(t.terrain, TERRAIN.HILL, '(−120,26): террейн — холмы');
  assert.equal(t.passable, true, '(−120,26): проходимый');
  assert.equal(t.inBuilding, false, '(−120,26): вне постройки');
  assert.equal(t.hasMobGroup, false, '(−120,26): без mob-группы');
  assert.equal(map.nearMountain(-120, 26), true,
    '(−120,26): гора (−119,26) в 8-окрестности → nearMountain true');
  assert.ok(t.loot && typeof t.loot === 'object',
    '(−120,26): лут — самородок (краснота: поля loot нет)');
  assert.ok(NUGGET_LOOT.has(t.loot.item),
    `(−120,26): item ${t.loot && t.loot.item} — у гор только самородки`);
  // lootAt — self-contained: совпадает с полем tileAt.
  assert.deepEqual(map.lootAt(-120, 26), t.loot,
    'lootAt(−120,26) — само-поле tileAt');
  // Вода — никогда (структурно: passable-гейт; дополнение ML2).
  let water = 0, waterBad = 0, firstWater = null;
  for (const t2 of tiles.values()) {
    if (t2.terrain !== TERRAIN.WATER && t2.terrain !== TERRAIN.DEEP_WATER) continue;
    water++;
    if (t2.loot !== null) {
      if (!firstWater) firstWater = `(${t2.x},${t2.y}) ${JSON.stringify(t2.loot)}`;
      waterBad++;
    }
  }
  assert.ok(water > 1000, 'в окне ≥1000 водных тайлов (зонд)');
  assert.equal(waterBad, 0,
    `вода/глубокая вода — НИКОГДА не несёт лут (${waterBad}); `
    + `первый: ${firstWater}`);
  assert.equal(map.lootAt(-120, -64), null, 'lootAt(вода) → null');
});

test('000158.03 ML7: детерминизм — два createMap (те же пиксели) → loot идентичен на 240×240; в окне ≥1 лут-тайл', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const m1 = createMap({ width, height, data });
  const m2 = createMap({ width, height, data });
  let lootTiles = 0, diff = 0, firstDiff = null;
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) {
      const a = m1.tileAt(x, y);
      const b = m2.tileAt(x, y);
      const la = a.loot && typeof a.loot === 'object' ? a.loot : null;
      const lb = b.loot && typeof b.loot === 'object' ? b.loot : null;
      if (la) lootTiles++;
      if (JSON.stringify(la) !== JSON.stringify(lb)) {
        if (!firstDiff) firstDiff = `(${x},${y}) ${JSON.stringify(la)} ≠ ${JSON.stringify(lb)}`;
        diff++;
      }
    }
  }
  assert.ok(lootTiles >= 1,
    'в окне ≥1 лут-тайл (краснота: лута нет — идентичность была бы тривиальна)');
  assert.equal(diff, 0,
    `два createMap с теми же пикселями — РАЗНЫЙ лут (${diff}; ТЗ п.3: `
    + `только hash2/fbm/terrain, без RNG-состояния); первый: ${firstDiff}`);
});

// ML7b — гард «старые 13 полей не пересчитываются» (ТЗ п.2: логика
// каналов 1:1, старые golden-значения неизменны). ЗЕЛЁНЫЙ с 1-го
// запуска: литералы — зеркало GOLDEN_TILES (tests/map.test.js) МИНУС
// поле loot (его ре-пин — RED там, GREEN — по фактам D11).
// ВНИМАНИЕ (ревью 000158.03): GOLDEN_OLD_48 — РУЧНОЕ зеркало
// GOLDEN_TILES (tests/map.test.js) — ОБНОВЛЯТЬ В ПАРЕ: любое ре-пин
// старых 13 полей в GOLDEN_TILES должно синхронно попасть и сюда
// (иначе ML7b — ложный красный; при обратном забывании гард
// «каналы 1:1» слепнет).
const GOLDEN_OLD_48 = {
  '-119,-104': { x: -119, y: -104, terrain: 2, passable: true, hasBuilding: true, building: -1, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-119,-104], buildingId: 51 },
  '-119,-19': { x: -119, y: -19, terrain: 3, passable: true, hasBuilding: true, building: 2, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-119,-19], buildingId: null },
  '-118,-114': { x: -118, y: -114, terrain: 3, passable: true, hasBuilding: true, building: 1, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118,-114], buildingId: null },
  '-118,-25': { x: -118, y: -25, terrain: 3, passable: true, hasBuilding: true, building: 1, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118,-25], buildingId: null },
  '-118,11': { x: -118, y: 11, terrain: 5, passable: true, hasBuilding: true, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-119,9], buildingId: 36 },
  '-118,33': { x: -118, y: 33, terrain: 3, passable: true, hasBuilding: true, building: -1, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118,33], buildingId: 51 },
  '-117,-88': { x: -117, y: -88, terrain: 3, passable: true, hasBuilding: true, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-118,-90], buildingId: null },
  '-117,111': { x: -117, y: 111, terrain: 3, passable: true, hasBuilding: true, building: -1, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-117,111], buildingId: 51 },
  '-116,-100': { x: -116, y: -100, terrain: 2, passable: true, hasBuilding: true, building: 11, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-116,-100], buildingId: 45 },
  '-114,-119': { x: -114, y: -119, terrain: 2, passable: false, hasBuilding: false, building: -1, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-114,-119], buildingId: 52 },
  '-114,-35': { x: -114, y: -35, terrain: 3, passable: true, hasBuilding: true, building: 1, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-114,-35], buildingId: null },
  '-114,18': { x: -114, y: 18, terrain: 5, passable: true, hasBuilding: true, building: 11, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-114,18], buildingId: 44 },
  '-119,9': { x: -119, y: 9, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119,9], buildingId: 36 },
  '-119,10': { x: -119, y: 10, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119,9], buildingId: 36 },
  '-119,11': { x: -119, y: 11, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119,9], buildingId: 36 },
  '-118,-90': { x: -118, y: -90, terrain: 3, passable: false, hasBuilding: false, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-118,-90], buildingId: null },
  '-118,-89': { x: -118, y: -89, terrain: 3, passable: false, hasBuilding: false, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-118,-90], buildingId: null },
  '-118,-88': { x: -118, y: -88, terrain: 3, passable: false, hasBuilding: false, building: 4, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-118,-90], buildingId: null },
  '-118,9': { x: -118, y: 9, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119,9], buildingId: 36 },
  '-118,10': { x: -118, y: 10, terrain: 5, passable: false, hasBuilding: false, building: 8, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-119,9], buildingId: 36 },
  '-252,87': { x: -252, y: 87, terrain: 3, passable: true, hasBuilding: true, building: 9, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-252,87], buildingId: 48 },
  '-255,-252': { x: -255, y: -252, terrain: 5, passable: true, hasBuilding: true, building: 10, buildingWealth: 1, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-255,-252], buildingId: 42 },
  '-227,104': { x: -227, y: 104, terrain: 3, passable: true, hasBuilding: true, building: 10, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-227,104], buildingId: 41 },
  '-236,-69': { x: -236, y: -69, terrain: 5, passable: true, hasBuilding: true, building: 10, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-236,-69], buildingId: 43 },
  '-253,144': { x: -253, y: 144, terrain: 3, passable: true, hasBuilding: true, building: 11, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-253,144], buildingId: 45 },
  '-250,49': { x: -250, y: 49, terrain: 3, passable: true, hasBuilding: true, building: 11, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-250,49], buildingId: 49 },
  '-255,137': { x: -255, y: 137, terrain: 3, passable: true, hasBuilding: true, building: 12, buildingWealth: 3, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: true, buildingAnchor: [-255,137], buildingId: 46 },
  '-255,11': { x: -255, y: 11, terrain: 3, passable: false, hasBuilding: false, building: 8, buildingWealth: 2, hasMobGroup: false, mobGroup: -1, inBuilding: true, isEntrance: false, buildingAnchor: [-255,11], buildingId: 37 },
  '-120,-113': { x: -120, y: -113, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 0, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-120,-88': { x: -120, y: -88, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 0, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-120,-78': { x: -120, y: -78, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 2, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-120,108': { x: -120, y: 108, terrain: 2, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 0, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-119,-81': { x: -119, y: -81, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 6, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-119,-21': { x: -119, y: -21, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: true, mobGroup: 2, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-120,-64': { x: -120, y: -64, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-120,-63': { x: -120, y: -63, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-120,-62': { x: -120, y: -62, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-120,-61': { x: -120, y: -61, terrain: 1, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-119,26': { x: -119, y: 26, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-119,27': { x: -119, y: 27, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-118,26': { x: -118, y: 26, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-118,27': { x: -118, y: 27, terrain: 6, passable: false, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-59,0': { x: -59, y: 0, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-58,-1': { x: -58, y: -1, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-58,0': { x: -58, y: 0, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-58,1': { x: -58, y: 1, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-57,-2': { x: -57, y: -2, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
  '-57,-1': { x: -57, y: -1, terrain: 3, passable: true, hasBuilding: false, building: -1, buildingWealth: 0, hasMobGroup: false, mobGroup: -1, inBuilding: false, isEntrance: false, buildingAnchor: null, buildingId: null },
};

test('000158.03 ML7b: гард — старые 13 полей 48 golden-тайлов неизменны (≡ GOLDEN_TILES минус loot)', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const map = createMap({ width, height, data });
  let ck = 0;
  for (const key of Object.keys(GOLDEN_OLD_48)) {
    const [x, y] = key.split(',').map(Number);
    assert.deepEqual(oldFields(map.tileAt(x, y)), GOLDEN_OLD_48[key],
      `(${key}): старые 13 полей изменены (логика каналов 1:1 — ТЗ п.2)`);
    ck++;
  }
  assert.equal(ck, 48, '48 golden-тайлов (зеркало GOLDEN_TILES)');
});

test('000158.03 ML8: деградация — vm БЕЗ items-data: loot=null на ВСЕХ тайлах (±30), старые 13 полей vm ≡ node; ленивое подхвачение — после items-data.js новый createMap: ≥1 лут (±120)', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const nMap = createMap({ width, height, data });
  // Цепь БЕЗ items-data (паттерн 000058/000073); global-settings И
  // buildings — чтобы город/лагерь-каналы были АКТИВНЫ в песочнице, и
  // parity «старых 13 полей» против node была честной.
  const sandbox = {};
  loadInSandbox('global-settings.js', sandbox);
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  loadInSandbox('buildings.js', sandbox);
  const bMap = sandbox.Game.createMap({ width, height, data });
  // (1) Каталог не загружен → loot = null на ВСЕХ тайлах (окно ±30).
  for (let x = -30; x < 31; x++) {
    for (let y = -30; y < 31; y++) {
      const t = bMap.tileAt(x, y);
      assert.ok('loot' in t,
        `vm (${x},${y}): в tileAt нет поля loot (краснота: поле не реализовано)`);
      assert.equal(t.loot, null,
        `vm (${x},${y}): без items-data loot обязан быть null (тихая деградация)`);
    }
  }
  // (2) СТАРЫЕ 13 полей — vm ≡ node (JSON-нормализация realm'ов).
  for (let x = -30; x < 31; x++) {
    for (let y = -30; y < 31; y++) {
      const a = oldFields(bMap.tileAt(x, y));
      const b = oldFields(nMap.tileAt(x, y));
      assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)),
        `vm/node (${x},${y}): старые 13 полей различаются`);
    }
  }
  // (3) ЛЕНИВОЕ подхвачение: items-data.js грузится ПОЗЖЕ в тот же
  // sandbox → НОВЫЙ createMap даёт лут (пустой вывод lootCandidates не
  // кэшируется — 000055).
  loadInSandbox('items-data.js', sandbox);
  const bMap2 = sandbox.Game.createMap({ width, height, data });
  let found = 0;
  for (let x = -R; x < R && found < 1; x++) {
    for (let y = -R; y < R && found < 1; y++) {
      const t = bMap2.tileAt(x, y);
      if (t.loot && typeof t.loot === 'object') found++;
    }
  }
  assert.ok(found >= 1,
    'vm после items-data.js: в окне ±120 ≥1 лут-тайл '
    + '(краснота: ленивое подхвачение каталога не реализовано)');
});
