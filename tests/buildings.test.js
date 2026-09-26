const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BUILDINGS, CATEGORIES, ALL_PASSABLE,
  getBuilding, buildingForMapIndex, getBuildingsByCategory,
  buildingSize, buildingEntranceRel, sizeChain, placeBuilding,
} = require('../src/buildings.js');
const {
  BUILDING_TYPES, BUILDING_COUNT, BUILDING_NAMES,
} = require('../src/map.js');

const DIR = path.join(__dirname, '..', 'assets', 'buildings');

// SPEC.md «Постройки»: 6 магазинов, 18 школ навыков, 6 домов NPC,
// 5 входов в пещеры, 4 храма, 4 магических знака, 7 прочих = 50 типов.
const EXPECTED_COUNTS = {
  магазин: 6,
  школа_навыков: 18,
  дом_npc: 6,
  пещера: 5,
  храм: 4,
  магический_знак: 4,
  прочее: 7,
};

test('каталог: 50 типов, id = 1..50 без дублей, порядок = id', () => {
  assert.equal(BUILDINGS.length, 50);
  const ids = BUILDINGS.map((b) => b.id);
  assert.equal(new Set(ids).size, 50, 'id уникальны');
  for (let i = 0; i < BUILDINGS.length; i++) {
    assert.equal(BUILDINGS[i].id, i + 1, 'id = позиция в каталоге + 1');
  }
});

test('каталог: категории — 6/18/6/5/4/4/7, все категории из CATEGORIES', () => {
  for (const cat of Object.keys(EXPECTED_COUNTS)) {
    assert.equal(getBuildingsByCategory(cat).length, EXPECTED_COUNTS[cat], cat);
  }
  const seen = new Set();
  for (const b of BUILDINGS) {
    assert.ok(CATEGORIES.includes(b.категория), b.название + ': ' + b.категория);
    seen.add(b.категория);
  }
  assert.deepEqual([...seen].sort(), [...Object.keys(EXPECTED_COUNTS)].sort());
});

test('каталог: обязательные поля, допустимые_тайлы ⊆ проходимых тайлов', () => {
  const tiles = new Set(ALL_PASSABLE);
  const REQUIRED = ['id', 'название', 'категория', 'функция', 'типичный_npc', 'допустимые_тайлы', 'особые_параметры'];
  for (const b of BUILDINGS) {
    for (const key of REQUIRED) {
      assert.ok(key in b, `${b.id} ${b.название}: нет поля «${key}»`);
    }
    assert.equal(typeof b.название, 'string');
    assert.notEqual(b.название.trim(), '');
    assert.equal(typeof b.функция, 'string');
    assert.notEqual(b.функция.trim(), '');
    assert.ok(b.типичный_npc === null || (typeof b.типичный_npc === 'string' && b.типичный_npc.trim() !== ''));
    assert.ok(Array.isArray(b.допустимые_тайлы), `${b.id}: допустимые_тайлы — массив`);
    assert.ok(b.допустимые_тайлы.length > 0, `${b.id}: допустимые_тайлы не пуст`);
    for (const t of b.допустимые_тайлы) {
      assert.ok(tiles.has(t), `${b.id} ${b.название}: тайл «${t}» не проходим`);
    }
    assert.ok(b.особые_параметры !== null && typeof b.особые_параметры === 'object');
  }
});

test('файлы assets/buildings: ровно 000001..000050.json, содержимое = JS-фолбэк', () => {
  const files = fs.readdirSync(DIR).filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 50, 'ровно 50 файлов типа');
  for (let i = 0; i < 50; i++) {
    const num = String(i + 1).padStart(6, '0');
    assert.equal(files[i], num + '.json', `файл ${files[i]} вместо ${num}.json`);
    const fromFile = JSON.parse(fs.readFileSync(path.join(DIR, files[i]), 'utf8'));
    assert.equal(fromFile.id, i + 1, 'id = номер файла');
    assert.deepEqual(fromFile, BUILDINGS[i], `${num}.json совпадает с JS-фолбэком`);
  }
  // schema.json на месте и разбирается.
  const schema = JSON.parse(fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  assert.equal(schema.type, 'object');
  assert.ok(schema.properties && schema.required);
});

test('getBuilding: id → объект из каталога, вне диапазона — null', () => {
  assert.equal(getBuilding(1), BUILDINGS[0]);
  assert.equal(getBuilding(50), BUILDINGS[49]);
  assert.equal(getBuilding(25).название, 'Дом кузнеца');
  assert.equal(getBuilding(0), null);
  assert.equal(getBuilding(51), null);
  assert.equal(getBuilding(12345), null);
});

test('buildingForMapIndex: 13 индексов генерации → 13 различных зданий каталога', () => {
  assert.equal(BUILDING_COUNT, 13);
  const seen = new Set();
  for (let i = 0; i < BUILDING_COUNT; i++) {
    const b = buildingForMapIndex(i);
    assert.ok(b !== null, `индекс ${i} не отображается`);
    assert.ok(seen.add(b.id), `дубль здания id=${b.id} на индексах`);
    assert.equal(b.особые_параметры.map_index, i, 'map_index согласован');
  }
  assert.equal(buildingForMapIndex(-1), null);
  assert.equal(buildingForMapIndex(13), null);
});

test('buildingForMapIndex: картовые индексы соответствуют BUILDING_NAMES', () => {
  // Индексы, где картовое имя (src/map.js) — имя типа из SPEC.md.
  for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10]) {
    const b = buildingForMapIndex(i);
    assert.ok(
      b.название.toLowerCase().includes(BUILDING_NAMES[i].toLowerCase()),
      `${i}: «${b.название}» не совпадает с «${BUILDING_NAMES[i]}»`,
    );
  }
  assert.equal(buildingForMapIndex(BUILDING_TYPES.TEMPLE).категория, 'храм');
  assert.equal(buildingForMapIndex(BUILDING_TYPES.CAVE_ENTRANCE).категория, 'пещера');
  assert.equal(buildingForMapIndex(BUILDING_TYPES.NPC_HOUSE).категория, 'дом_npc');
  assert.equal(buildingForMapIndex(BUILDING_TYPES.TAVERN).категория, 'прочее');
});

test('«малые» постройки (таверна, колодец, башня, фонтан) — на любом проходимом тайле', () => {
  const smallIds = [44, 45, 46, 49];
  for (const id of smallIds) {
    const b = getBuilding(id);
    assert.ok(b.особые_параметры.малая === true, b.название + ': малая=true');
    assert.deepEqual([...b.допустимые_тайлы].sort(), [...ALL_PASSABLE].sort(), b.название);
  }
});

test('особые параметры: школы тренируют навыки, пещеры — уровень, универсам — богатство 3', () => {
  const schools = getBuildingsByCategory('школа_навыков');
  for (const s of schools) {
    assert.ok(Array.isArray(s.особые_параметры.тренирует), s.название);
    assert.ok(s.особые_параметры.тренирует.length > 0, s.название);
  }
  for (const c of getBuildingsByCategory('пещера')) {
    assert.equal(typeof c.особые_параметры.уровень, 'string', c.название);
    assert.ok(Array.isArray(c.особые_параметры.содержимое), c.название);
  }
  assert.equal(getBuilding(6).особые_параметры.мин_богатство, 3);
});

// --- Задача 000026: размеры построек и размещение ---

test('размер/вход в каталоге: крупные — 3x3, башня — 2x2, камень — явный 1x1', () => {
  const big = [7, 19, 24, 36]; // Арена, Монастырь, Ратуша, Храм солнца
  for (const id of big) {
    const b = getBuilding(id);
    assert.deepEqual(b.размер, { ширина: 3, высота: 3 }, b.название);
    assert.deepEqual(b.вход, [1, 2], b.название);
  }
  assert.deepEqual(getBuilding(18).размер, { ширина: 2, высота: 2 }, 'Башня мага');
  assert.deepEqual(getBuilding(18).вход, [1, 1], 'Башня мага');
  assert.deepEqual(getBuilding(40).размер, { ширина: 1, высота: 1 }, 'Рунический камень');
  assert.deepEqual(getBuilding(40).вход, [0, 0], 'Рунический камень');
  // Остальные 44 постройки — без поля (по умолчанию 1x1).
  const withSize = BUILDINGS.filter((b) => b.размер);
  assert.equal(withSize.length, 6, 'именно 6 построек имеют поле «размер»');
  for (const b of BUILDINGS) {
    if (!b.размер) continue;
    const { width, height } = buildingSize(b);
    const [dx, dy] = buildingEntranceRel(b);
    assert.ok(dx >= 0 && dx < width, `${b.название}: вход вне ширины`);
    assert.ok(dy >= 0 && dy < height, `${b.название}: вход вне высоты`);
  }
});

test('schema.json: поля «размер» и «вход» описаны и согласованы с каталогом', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  const sz = schema.properties['размер'];
  assert.ok(sz, 'schema: нет свойства «размер»');
  assert.equal(sz.type, 'object');
  assert.equal(sz.additionalProperties, false);
  assert.deepEqual([...sz.required].sort(), ['высота', 'ширина']);
  assert.equal(sz.properties['ширина'].minimum, 1);
  assert.equal(sz.properties['ширина'].maximum, 5);
  assert.equal(sz.properties['высота'].minimum, 1);
  assert.equal(sz.properties['высота'].maximum, 4);
  const en = schema.properties['вход'];
  assert.ok(en, 'schema: нет свойства «вход»');
  assert.equal(en.type, 'array');
  assert.equal(en.minItems, 2);
  assert.equal(en.maxItems, 2);
  assert.equal(en.items.minimum, 0);
  assert.equal(en.items.maximum, 4);
  // Каталог укладывается в ограничения схемы (проверка без ajv).
  for (const b of BUILDINGS) {
    if (b.размер) {
      assert.ok(Number.isInteger(b.размер.ширина) && b.размер.ширина >= 1 && b.размер.ширина <= 5, b.название);
      assert.ok(Number.isInteger(b.размер.высота) && b.размер.высота >= 1 && b.размер.высота <= 4, b.название);
      assert.deepEqual(Object.keys(b.размер).sort(), ['высота', 'ширина'],
        `${b.название}: только ширина/высота (additionalProperties=false)`);
    }
    if (b.вход) {
      assert.equal(b.вход.length, 2, b.название);
      for (const v of b.вход) {
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 4, b.название);
      }
    }
  }
});

test('buildingSize/buildingEntranceRel: по умолчанию 1x1 с входом [0,0]', () => {
  assert.deepEqual(buildingSize({ id: 1 }), { width: 1, height: 1 });
  assert.deepEqual(buildingEntranceRel({ id: 1 }), [0, 0]);
  assert.deepEqual(buildingSize(null), { width: 1, height: 1 });
  assert.deepEqual(buildingEntranceRel(null), [0, 0]);
  assert.deepEqual(buildingSize({ размер: { ширина: 3, высота: 3 } }), { width: 3, height: 3 });
  assert.deepEqual(buildingEntranceRel({ размер: { ширина: 3, высота: 3 }, вход: [1, 2] }), [1, 2]);
});

test('buildingEntranceRel: координаты входа зажаты в размер', () => {
  // Вход за границей (например, после уменьшения) не вылезает за тайлы.
  assert.deepEqual(buildingEntranceRel({ размер: { ширина: 3, высота: 3 }, вход: [9, 9] }), [2, 2]);
  assert.deepEqual(buildingEntranceRel({ размер: { ширина: 2, высота: 2 }, вход: [-1, 5] }), [0, 1]);
  assert.deepEqual(buildingEntranceRel({ вход: [1, 1] }), [0, 0], 'без размера — 1x1');
});

test('sizeChain: цепочка уменьшения 5x4 → 3x3 → 1x1', () => {
  assert.deepEqual(sizeChain(5, 4), [[5, 4], [3, 3], [1, 1]]);
  assert.deepEqual(sizeChain(4, 4), [[4, 4], [3, 3], [1, 1]]);
  assert.deepEqual(sizeChain(5, 1), [[5, 1], [3, 1], [1, 1]]);
  assert.deepEqual(sizeChain(1, 4), [[1, 4], [1, 3], [1, 1]]);
  assert.deepEqual(sizeChain(3, 3), [[3, 3], [1, 1]]);
  assert.deepEqual(sizeChain(2, 2), [[2, 2], [1, 1]]);
  assert.deepEqual(sizeChain(2, 1), [[2, 1], [1, 1]]);
  assert.deepEqual(sizeChain(1, 1), [[1, 1]]);
});

test('placeBuilding: свободное место — полный размер и вход из описания', () => {
  const b = { размер: { ширина: 3, высота: 3 }, вход: [1, 2] };
  const p = placeBuilding(b, 10, 20, () => true);
  assert.equal(p.x, 10);
  assert.equal(p.y, 20);
  assert.equal(p.w, 3);
  assert.equal(p.h, 3);
  assert.deepEqual(p.entrance, [11, 22]);
  assert.equal(p.tiles.length, 9);
  assert.deepEqual(p.tiles[0], [10, 20]);
  assert.deepEqual(p.tiles[8], [12, 22]);
  // Тайлы — ровно прямоугольник, без дублей.
  const seen = new Set(p.tiles.map(([x, y]) => x + ',' + y));
  assert.equal(seen.size, 9);
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      assert.ok(seen.has((10 + dx) + ',' + (20 + dy)), `нет тайла (${10 + dx},${20 + dy})`);
    }
  }
});

test('placeBuilding: непоместилось — уменьшение по цепочке, вход пересчитан', () => {
  // 5x4, но 4-й ряд занят → [3,3] влезает; вход [2,3] зажат до [2,2].
  const b = { размер: { ширина: 5, высота: 4 }, вход: [2, 3] };
  const p = placeBuilding(b, 0, 0, (tx, ty) => ty !== 3);
  assert.equal(p.w, 3);
  assert.equal(p.h, 3);
  assert.deepEqual(p.entrance, [2, 2]);
  // 4x3 и 3x3 не влезает (тайл (1,0) занят), а якорь (0,0) свободен → 1x1.
  const b2 = { размер: { ширина: 4, высота: 3 }, вход: [1, 2] };
  const p2 = placeBuilding(b2, 0, 0, (tx, ty) => !(tx === 1 && ty === 0));
  assert.equal(p2.w, 1);
  assert.equal(p2.h, 1);
  assert.deepEqual(p2.entrance, [0, 0], 'вход 1x1 — сам тайл');
});

test('placeBuilding: якорь занят — null; 1x1 влезает всегда (кроме занятого)', () => {
  assert.equal(placeBuilding({}, 0, 0, () => false), null);
  assert.equal(placeBuilding({ размер: { ширина: 3, высота: 3 } }, 0, 0, () => false), null);
  const p = placeBuilding({}, 5, 6, () => true);
  assert.deepEqual(p, { x: 5, y: 6, w: 1, h: 1, tiles: [[5, 6]], entrance: [5, 6] });
  // Чистота: один и тот же вызов — тот же результат.
  const isFree = (tx, ty) => tx % 2 === 0;
  assert.deepEqual(
    placeBuilding({ размер: { ширина: 3, высота: 2 } }, 1, 1, isFree),
    placeBuilding({ размер: { ширина: 3, высота: 2 } }, 1, 1, isFree));
});
