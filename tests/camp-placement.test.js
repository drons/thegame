// Задача 000131: «Лагерь на карте: размещение и появление» —
// СТАДИЯ КРАСНЫХ ТЕСТОВ (node, мир без DOM).
//
// Контракт — memory/000131-camp-placement.md (станция проектирования,
// 2026-10-03). Лагерь (каталог 000047, механика 000095) ДО задачи НЕ
// генерировался на карте — 000131 добавляет АДДИТИВНЫЙ детерминированный
// канал в anchorAt (src/map.js), паттерн городского (000103):
//   * срабатывает ТОЛЬКО где слотовый якорь НЕ генерируется
//     (fb(511.1) ≤ 0.33 + 0.14·rarity) — города первичны
//     (fb > 0.45 + 0.10·rarity; пересечение порогов невозможно);
//   * по СОБСТВЕННОМУ смещению features-шума: fc(733.7) >
//     SETTINGS.camp_channel.fbm + camp_channel.rarity·rarity
//     (по умолчанию 0.45/0.10 — редкость как у города);
//   * запись через существующий пайплайн placeBuilding
//     (buildingId-якорь): каталог 000047 без «размер» → 1×1,
//     вход = якорь, wealth — формула 222.9/444.1;
//   * СВОЕЙ СИД-КОНСТАНТЫ НЕТ (тип не выбирается — всегда 47);
//   * деградация: нет global-settings / camp_channel / каталога 47 →
//     канал выключен → мир ПОБАЙТОВО как до задачи.
//
// Красные (падают до реализации, падают ОСМЫСЛЕННО — нет buildingId 47
// в мире / нет SETTINGS.camp_channel / нет campSprite):
//   CP-1 лагеря существуют (±200): 1×1, вход = якорь, вход NONE,
//       passable, !hasMobGroup (мобы подавлены cover), без перекрытий;
//   CP-2 инвариант формулы канала (±100, реальный map.png) ДВЕ стороны;
//   CP-3 детерминизм: 2×createMap — один набор лагерей; повторный
//       tileAt — тот же;
//   CP-4 золотые пины: nearest (−18,−12) — steps 30 < steps_per_day,
//       (8,22) wealth 2; 11 лагерей в BFS-70 (e2e-семантика);
//       0 лагерей в Чебышёв-радиусе 12 от спавна (кадр спавна цел);
//   CP-5 аддитивность: vm без global-settings — 0 лагерей; на лагерных
//       тайлах до-задачный мир ПУСТ (inBuilding false); слотовой hash
//       инвариант на нелагерных якорях.
//
// Мир детерминирован: generateSeedPixels ≡ assets/map.png ПОБАЙТОВО
// (контракт §5, зонд) — node-мир (decodePng) и e2e-мир (vm, map.png
// onerror → seed-пиксели) — ОДИН И ТОТ ЖЕ. BFS-семантика — 1:1
// findNearest tests/city-screen.test.js (цель ПРОВЕРЯЕТСЯ ДО
// исключения NONE/CAVE-входов из промежуточных узлов — лагерь =
// NONE-вход, иначе он не найден бы).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const {
  createMap,
  BUILDING_TYPES, buildingCount,
  GLOBAL_SEED, hash2, TERRAIN_DATA,
} = require('../src/map.js');
const { getBuilding } = require('../src/buildings.js');
const { SETTINGS } = require('../src/global-settings.js');
const { createPerlin2D } = require('../src/perlin.js');
const { decodePng } = require('./png.js');

// --- Константы канала (контракт §2) ---
const CAMP_ID = 47;
const FS = 0.618; // FEATURE_SCALE (src/map.js)
const SLOT_FBM = 0.33, SLOT_RARITY = 0.14; // слотовый порог anchorAt
const CAMP_OFFSET = 733.7; // CAMP_FEATURE_OFFSET (своё смещение fc)
// Тот же «features»-шум, что в anchorAt: GLOBAL_SEED ^ 0x85ebca6b.
const CAMP_FEATURES = createPerlin2D(GLOBAL_SEED ^ 0x85ebca6b);

// «Браузерный» путь UMD: исполняем файл в чистом контексте без
// module/exports (паттерн loadInSandbox tests/map.test.js).
function loadInSandbox(file, sandbox) {
  const code = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8');
  vm.runInNewContext(code, sandbox);
}

// Реальный мир: assets/map.png (≡ generateSeedPixels побайтово).
function realWorld() {
  const { width, height, data } = decodePng('assets/map.png');
  return createMap({ width, height, data });
}

// Лагерный тайл: hasBuilding && buildingId === 47 ( building = NONE,
// как у города — запись опознаётся по buildingId).
function isCamp(t) {
  return !!(t && t.hasBuilding && t.buildingId === CAMP_ID);
}

// Лагерное УСЛОВИЕ канала (контракт §6) в тайле: проходимый террейн
// + слотового якоря НЕТ (fb ≤ 0.33+0.14·r) + собственный порог
// (fc(733.7) > fbm + rarity·r). Порог — из SETTINGS.camp_channel;
// до его появления (красный) — проектные значения 0.45/0.10
// (существование ключа в SETTINGS фиксирует CP-11 в
// tests/global-settings.test.js).
function campCondition(map, x, y) {
  const cc = SETTINGS.camp_channel
    || { fbm: 0.45, rarity: 0.10 };
  const t = map.tileAt(x, y);
  if (!t.passable) return false;
  const a = map.pixelAt(x, y)[3];
  const rarity = 1 - a / 255;
  const fb = CAMP_FEATURES.fbm(x * FS + 511.1, y * FS + 511.1, 3);
  if (fb > SLOT_FBM + SLOT_RARITY * rarity) return false; // слотовый/город
  const fc = CAMP_FEATURES.fbm(x * FS + CAMP_OFFSET,
    y * FS + CAMP_OFFSET, 3);
  return fc > cc.fbm + cc.rarity * rarity;
}

// Сканирование лагерных групп ±R (якорь → {anchor, tiles}).
function scanCampGroups(map, R) {
  const groups = new Map();
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) {
      const t = map.tileAt(x, y);
      if (!isCamp(t)) continue;
      const key = t.buildingAnchor[0] + ',' + t.buildingAnchor[1];
      if (!groups.has(key)) {
        groups.set(key, {
          anchor: t.buildingAnchor.slice(), tiles: new Set(),
        });
      }
      groups.get(key).tiles.add(x + ',' + y);
    }
  }
  return groups;
}

// BFS до ближайшего лагеря — 1:1 findNearest (city-screen.test.js
// L365–407): промежуточные узлы passable && !hasMobGroup (моб =
// startCombat — мир остановится), входы CAVE/NONE — НЕ промежуточные
// (авто-вход ломает протокол); ЦЕЛЬ проверяется ДО исключения.
function findNearestCamp(map, start, radius = 600) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  let frontier = [start];
  const prev = new Map();
  for (let depth = 0; depth < radius && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = map.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (isCamp(t)) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { target: { x: nx, y: ny }, t, steps, depth };
        }
        if (t.hasBuilding
            && (t.building === BUILDING_TYPES.CAVE_ENTRANCE
                || t.building === BUILDING_TYPES.NONE)) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// ВСЕ лагеря в пределах radius шагов (e2e-семантика; steps = длина
// пути, цель НЕ продолжается как промежуточный узел).
function bfsCamps(map, start, radius) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  let frontier = [start];
  const found = [];
  for (let depth = 0; depth <= radius && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = map.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        visited.add(k);
        if (isCamp(t)) {
          found.push({ x: nx, y: ny, steps: depth + 1 });
          continue; // лагерь — НЕ промежуточный узел (NONE-вход)
        }
        if (t.hasBuilding
            && (t.building === BUILDING_TYPES.CAVE_ENTRANCE
                || t.building === BUILDING_TYPES.NONE)) continue;
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return found;
}

// --- Золотые пины (контракт §5, зонд 2026-10-03) ---
//
// Ближайший лагерь (−18,−12): terrain 3 (трава), wealth 1;
// второй ближайший (8,22): terrain 3, wealth 2; оба 30 шагов.
// BFS-70 (e2e-семантика) — ровно 11 лагерей: (x, y) → steps.
const CAMP_GOLDEN_TILE_A = {
  x: -18, y: -12, terrain: 3, passable: true,
  hasBuilding: true, building: -1, buildingWealth: 1,
  hasMobGroup: false, mobGroup: -1,
  inBuilding: true, isEntrance: true,
  buildingAnchor: [-18, -12], buildingId: 47,
};
const CAMP_GOLDEN_REC_A = {
  anchor: [-18, -12], type: -1, x: -18, y: -12, w: 1, h: 1,
  entrance: [-18, -12], wealth: 1, buildingId: 47,
};
const CAMP_GOLDEN_TILE_B = {
  x: 8, y: 22, terrain: 3, passable: true,
  hasBuilding: true, building: -1, buildingWealth: 2,
  hasMobGroup: false, mobGroup: -1,
  inBuilding: true, isEntrance: true,
  buildingAnchor: [8, 22], buildingId: 47,
};
const CAMP_GOLDEN_REC_B = {
  anchor: [8, 22], type: -1, x: 8, y: 22, w: 1, h: 1,
  entrance: [8, 22], wealth: 2, buildingId: 47,
};
const BFS70_GOLDEN = [
  [-18, -12, 30], [8, 22, 30], [11, 21, 32],
  [-36, 8, 44], [-36, -12, 48], [13, -36, 49],
  [5, -47, 52], [47, 16, 63], [42, -23, 65],
  [16, -50, 66], [34, 34, 68],
];

// ====================================================================
// CP-1: лагеря существуют в мире; запись 1×1, вход = якорь;
//       вход NONE (building), hasBuilding/passable/inBuilding/
//       isEntrance; мобы подавлены (hasMobGroup false — лагерь =
//       cover); одиночные, без перекрытий с другими постройками.
// ====================================================================
test('CP-1: лагеря в мире (000131) — buildingId 47, 1×1, вход = якорь, без перекрытий (±200)', () => {
  const map = realWorld();
  const b47 = getBuilding(CAMP_ID);
  assert.ok(b47 && b47.id === CAMP_ID,
    'каталог: запись лагеря 000047 (механика 000095)');
  const groups = scanCampGroups(map, 200);
  assert.ok(groups.size >= 1,
    'сценарий: в ±200 есть хотя бы один лагерь '
    + '(красный: канал размещения не реализован — buildingId 47 '
    + 'в мире нет)');
  for (const g of groups.values()) {
    const [ax, ay] = g.anchor;
    const rec = map.buildingAt(ax, ay);
    assert.ok(rec, `(${ax},${ay}): лагерный якорь без записи`);
    assert.equal(rec.buildingId, CAMP_ID,
      `(${ax},${ay}): buildingId — id лагеря (47)`);
    assert.equal(rec.type, BUILDING_TYPES.NONE,
      `(${ax},${ay}): type — NONE (лагерь не слот, не пещера)`);
    assert.equal(rec.w, 1, `(${ax},${ay}): лагерь 1×1 — ширина`);
    assert.equal(rec.h, 1, `(${ax},${ay}): лагерь 1×1 — высота`);
    assert.deepEqual(rec.anchor, [ax, ay], 'якорь = позиция');
    assert.equal(rec.x, ax, 'x = якорь (placeBuilding 1×1)');
    assert.equal(rec.y, ay, 'y = якорь (placeBuilding 1×1)');
    assert.deepEqual(rec.entrance, [ax, ay],
      `(${ax},${ay}): вход = якорь (дефолт buildingEntranceRel)`);
    assert.ok(rec.wealth >= 0 && rec.wealth <= 3,
      `(${ax},${ay}): wealth в [0..3]`);
    // Тайл входа: полная запись (моб-группы подавлены: hasMobGroup =
    // passable && !cover && … — лагерь = cover).
    const t = map.tileAt(ax, ay);
    assert.equal(t.hasBuilding, true, 'вход: hasBuilding');
    assert.equal(t.building, BUILDING_TYPES.NONE, 'вход: building NONE');
    assert.equal(t.passable, true, 'вход: проходим (игрок встанет)');
    assert.equal(t.inBuilding, true, 'вход: в footprint');
    assert.equal(t.isEntrance, true, 'вход: isEntrance');
    assert.equal(t.hasMobGroup, false,
      'вход: мобильная группа подавлена (лагерь = cover)');
    assert.deepEqual(t.buildingAnchor, [ax, ay],
      'вход: buildingAnchor = свой якорь (без перекрытия footprint'
      + ' другой постройки — чужой footprint записал бы свой якорь)');
    // Вход не замурован: проходимый сосед (invariant 000026).
    const free =
      map.tileAt(ax + 1, ay).passable ||
      map.tileAt(ax - 1, ay).passable ||
      map.tileAt(ax, ay + 1).passable ||
      map.tileAt(ax, ay - 1).passable;
    assert.ok(free, `(${ax},${ay}): вход лагеря замурован`);
    // 1×1: footprint = ровно тайл якоря.
    assert.equal(g.tiles.size, 1,
      `(${ax},${ay}): footprint лагеря — 1 тайл`);
  }
});

// ====================================================================
// CP-2: инвариант формулы канала (±100, реальный map.png), ДВЕ
// стороны: (а) размещённый лагерь ⇒ условие; (б) условие ⇒ лагерь
// своего id (не слотовый фолбэк, не город — порогами гарантировано).
// «Рождается только из своего шума (733.7)» и «каждое условие даёт
// лагерь» (зонд: 42 виртуальных = 42 размещённых, 0 отвергнуто
// placeBuilding).
// ====================================================================
test('CP-2: формула канала — лагерный якорь ⇔ passable && fb(511.1) ≤ 0.33+0.14·r && fc(733.7) > порог (±100)', () => {
  const map = realWorld();
  const R = 100;
  let placed = 0, virtual = 0;
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) {
      const cond = campCondition(map, x, y);
      const rec = map.buildingAt(x, y);
      const camp = !!(rec && rec.buildingId === CAMP_ID);
      if (camp) {
        placed++;
        assert.ok(cond,
          `(${x},${y}): размещённый лагерь НЕ удовлетворяет формулу `
          + 'канала (рожден не из своего шума/порога)');
      }
      if (cond) {
        virtual++;
        assert.ok(rec,
          `(${x},${y}): тайл с лагерным условием — якорь пуст `
          + '(красный: канал не реализован, условие не даёт лагерь)');
        assert.equal(rec.buildingId, CAMP_ID,
          `(${x},${y}): якорь с лагерным условием — слотовый `
          + `фолбэк/город (buildingId ${rec.buildingId})`);
      }
    }
  }
  assert.ok(placed >= 1,
    'сценарий: в ±100 есть лагерный якорь '
    + '(красный: buildingId 47 в мире нет)');
  assert.ok(virtual >= 1, 'сценарий: лагерное условие срабатывает');
  assert.equal(placed, virtual,
    `в ±100 размещено ${placed} ≠ виртуальных ${virtual} `
    + '(пересечение/отказ placeBuilding)');
});

// ====================================================================
// CP-3: детерминизм — два createMap (тот же map.png) дают ОДИН набор
// лагерей: якорь → та же запись; повторный tileAt — тот же тайл.
// ====================================================================
test('CP-3: детерминизм лагерей — 2×createMap: один набор, повторный tileAt тот же (±200)', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const map = createMap({ width, height, data });
  const map2 = createMap({ width, height, data });
  const groups = scanCampGroups(map, 200);
  assert.ok(groups.size >= 1,
    'сценарий: в ±200 есть лагерь (красный: канал не реализован)');
  const groups2 = scanCampGroups(map2, 200);
  const keys1 = [...groups.keys()].sort();
  const keys2 = [...groups2.keys()].sort();
  assert.deepEqual(keys2, keys1,
    'второй createMap — тот же набор лагерных якорей');
  for (const [key, g] of groups) {
    const [ax, ay] = g.anchor;
    assert.ok(groups2.has(key), `якорь (${ax},${ay}) утерян`);
    const r1 = map.buildingAt(ax, ay);
    const r2 = map2.buildingAt(ax, ay);
    assert.deepEqual(r2, r1,
      `(${ax},${ay}): другой createMap — другая запись лагеря`);
    for (const tileKey of g.tiles) {
      const [tx, ty] = tileKey.split(',').map(Number);
      const t1 = map.tileAt(tx, ty);
      assert.deepEqual(map2.tileAt(tx, ty), t1,
        `(${tx},${ty}): другой createMap — другой тайл`);
      assert.deepEqual(map.tileAt(tx, ty), t1,
        `(${tx},${ty}): повторный tileAt — не идентичен`);
    }
  }
});

// ====================================================================
// CP-4: золотые пины мира (контракт §5): полные записи
// (−18,−12)/(8,22); nearest — (−18,−12) за 30 шагов < steps_per_day
// (live-чтение, НЕ хардкод 40); 11 лагерей в BFS-70; 0 лагерей в
// Чебышёв-радиусе 12 от спавна (спавн-кадр main-visuals не меняется).
// ====================================================================
test('CP-4: золотые пины — nearest (−18,−12) за 30 шагов, (8,22) wealth 2, 11 лагерей в BFS-70, 0 в радиусе 12 от спавна', () => {
  const map = realWorld();
  // Полные записи ближайших лагерей (контракт §5).
  assert.deepEqual(map.tileAt(-18, -12), CAMP_GOLDEN_TILE_A,
    'golden: tileAt(−18,−12) — полная запись ближайшего лагеря');
  assert.deepEqual(map.buildingAt(-18, -12), CAMP_GOLDEN_REC_A,
    'golden: buildingAt(−18,−12) — запись (1×1, wealth 1)');
  assert.deepEqual(map.tileAt(8, 22), CAMP_GOLDEN_TILE_B,
    'golden: tileAt(8,22) — второй ближайший (wealth 2)');
  assert.deepEqual(map.buildingAt(8, 22), CAMP_GOLDEN_REC_B,
    'golden: buildingAt(8,22) — запись (1×1, wealth 2)');
  // Ближайший лагерь пешком (e2e-семантика findNearest): (−18,−12),
  // 30 шагов; steps.length — НЕ findNearest.depth (= steps−1).
  const found = findNearestCamp(map, { x: 0, y: 0 });
  assert.ok(found,
    'сценарий: от спавна пешком достижим лагерь (радиус 600)');
  assert.deepEqual(found.target, { x: -18, y: -12 },
    'nearest лагерь — (−18,−12) (golden)');
  assert.equal(found.steps.length, 30,
    'до (−18,−12) — 30 шагов (golden, e2e-семантика)');
  const perDay = SETTINGS.steps_per_day;
  assert.ok(perDay > 0 && typeof perDay === 'number',
    'SETTINGS.steps_per_day — число > 0 (live-чтение)');
  assert.ok(found.steps.length < perDay,
    `30 шагов < steps_per_day (${perDay}) — день НЕ сдвинется `
    + 'в e2e-сценарии (запас)');
  // Полный список лагерей в пределах 70 шагов (e2e-семантика) —
  // ровно 11 (контракт §5).
  const list = bfsCamps(map, { x: 0, y: 0 }, 70)
    .map((c) => [c.x, c.y, c.steps])
    .sort((a, b) => (a[2] - b[2]) || (a[0] - b[0]) || (a[1] - b[1]));
  assert.deepEqual(list, BFS70_GOLDEN,
    'BFS-70: ровно 11 лагерей в golden-координатах и глубинах');
  // Спавн-кадр: лагерей в Чебышёв-радиусе 12 от (0,0) НЕТ (кадр
  // спавна main-visuals побайтово как до задачи — зонд §5).
  let near = 0;
  for (let x = -12; x <= 12; x++) {
    for (let y = -12; y <= 12; y++) {
      if (isCamp(map.tileAt(x, y))) near++;
    }
  }
  assert.equal(near, 0,
    `лагерей в Чебышёв-радиусе 12 от спавна: ${near} (ожидалось 0)`);
});

// ====================================================================
// CP-5: аддитивность и деградация. (а) vm без global-settings.js
// (perlin+map+buildings) — каналов НЕТ: ни city, ни camp (мир
// побайтово до-задачный). (б) На лагерных тайлах реального мира
// до-задачный мир ПУСТ (inBuilding false — лагерь аддитивен, слотовых
// якорей там нет). (в) Слотовой hash (hash2 % buildingCount)
// инвариантен на нелагерных якорях (лагеря НЕ забирают слотовые
// якоря — 819 пин-тайлов не сдвинулись, зонд).
// ====================================================================
test('CP-5: аддитивность — vm без global-settings: 0 лагерей; на лагерных тайлах до-задачный мир пуст; слотовой hash инвариант (±150)', () => {
  const { width, height, data } = decodePng('assets/map.png');
  const map = createMap({ width, height, data });
  // (а) Деградация: песочница без global-settings — каналы
  // (город/лагерь) выключены: ни одной buildingId 47 (и ни city
  // 51..54).
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  loadInSandbox('buildings.js', sandbox);
  const preMap = sandbox.Game.createMap({ width, height, data });
  let preCamps = 0, preAnchors = 0;
  for (let x = -150; x < 150; x++) {
    for (let y = -150; y < 150; y++) {
      const t = preMap.tileAt(x, y);
      if (t.buildingId === CAMP_ID) preCamps++;
      if (!t.inBuilding) continue;
      const [ax, ay] = t.buildingAnchor;
      const rec = preMap.buildingAt(ax, ay);
      assert.ok(rec.buildingId !== CAMP_ID,
        `(${ax},${ay}): лагерь (47) БЕЗ global-settings`);
      assert.ok(rec.buildingId == null ||
          (rec.buildingId >= 1 && rec.buildingId <= 50),
        `(${ax},${ay}): city-запись (51..54) без global-settings`);
      assert.equal(rec.type,
        sandbox.Game.hash2(ax, ay, sandbox.Game.GLOBAL_SEED)
        % sandbox.Game.buildingCount(),
        `(${ax},${ay}): слотовой hash в деградации изменился`);
      preAnchors++;
    }
  }
  assert.equal(preCamps, 0,
    'vm без global-settings: лагеря не генерируются (деградация)');
  assert.ok(preAnchors > 0, 'мир песочницы не пуст');
  // (б) На лагерных тайлах реального мира до-задачный мир ПУСТ:
  // inBuilding false (лагерный канал срабатывает ТОЛЬКО где
  // слотового якоря нет — fb ≤ 0.33+0.14·r).
  const camps = scanCampGroups(map, 150);
  assert.ok(camps.size >= 1,
    'сценарий: в ±150 есть лагерь (красный: канал не реализован)');
  for (const g of camps.values()) {
    const [ax, ay] = g.anchor;
    const t = preMap.tileAt(ax, ay);
    assert.equal(t.inBuilding, false,
      `(${ax},${ay}): в до-задачном мире на лагерном тайле НЕ ПУСТО `
      + '(аддитивность нарушена — слотовый якорь зажат)');
    assert.equal(t.hasBuilding, false,
      `(${ax},${ay}): до-задачный мир: hasBuilding на лагерном тайле`);
  }
  // (в) Слотовой hash инвариант в реальном мире на НОНЛАГЕРНЫХ
  // якорях (слагерных и городских исключены — у них type NONE).
  const seen = new Set();
  let checked = 0;
  for (let x = -150; x < 150; x++) {
    for (let y = -150; y < 150; y++) {
      const t = map.tileAt(x, y);
      if (!t.inBuilding) continue;
      const key = t.buildingAnchor[0] + ',' + t.buildingAnchor[1];
      if (seen.has(key)) continue;
      seen.add(key);
      const rec = map.buildingAt(t.buildingAnchor[0], t.buildingAnchor[1]);
      if (rec.buildingId == CAMP_ID) continue; // лагерь — свой канал
      if (rec.buildingId >= 51 && rec.buildingId <= 54) continue; // город
      assert.equal(rec.type, hash2(t.buildingAnchor[0], t.buildingAnchor[1],
        GLOBAL_SEED) % buildingCount(),
        `(${key}): слотовой hash ИЗМЕНИЛСЯ (лагеря забирают якоря)`);
      checked++;
    }
  }
  assert.ok(checked > 0, 'нелагерные якоря есть');
});
