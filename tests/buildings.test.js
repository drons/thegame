const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BUILDINGS, CATEGORIES, ALL_PASSABLE,
  getBuilding, buildingForMapIndex, getBuildingsByCategory,
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
