const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BUILDINGS, CATEGORIES,
  getBuilding, buildingForMapIndex, getBuildingsByCategory,
  buildingSize, buildingEntranceRel, sizeChain, placeBuilding,
  // Задача 000056 (стадия красных тестов): вместо константы ALL_PASSABLE —
  // функции passableTiles()/denseTiles() (имена из единой таблицы
  // map.js, ленивое разрешение). Тесты ниже падают, пока их нет.
  passableTiles, denseTiles,
} = require('../src/buildings.js');
const {
  BUILDING_TYPES, buildingCount, buildingNames,
  // Задача 000056: единая таблица террейнов (ещё не реализована — красные).
  TERRAIN_DATA,
} = require('../src/map.js');

const DIR = path.join(__dirname, '..', 'assets', 'buildings');
const vm = require('node:vm');

// «Браузерный» путь UMD: исполняем файл в чистом контексте без module/exports
// (паттерн tests/map.test.js / tests/global-settings.test.js).
function loadInSandbox(file, sandbox) {
  const code = fs.readFileSync(__dirname + '/../src/' + file, 'utf8');
  vm.runInNewContext(code, sandbox);
}

// Имена террейнов (единая таблица map.js, задача 000056) — для
// grep-теста «нет литералов вне GENERATED».
const TERRAIN_TABLE_NAMES = [
  'глубокая вода', 'вода', 'песок', 'трава', 'лес', 'холмы', 'горы', 'болото',
];

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
  // Задача 000056: проходимость — из единой таблицы map.js (passableTiles()),
  // а не из собственной копии ALL_PASSABLE в buildings.js.
  const tiles = new Set(passableTiles());
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
  assert.equal(buildingCount(), 13);
  const seen = new Set();
  for (let i = 0; i < buildingCount(); i++) {
    const b = buildingForMapIndex(i);
    assert.ok(b !== null, `индекс ${i} не отображается`);
    assert.ok(seen.add(b.id), `дубль здания id=${b.id} на индексах`);
    assert.equal(b.особые_параметры.map_index, i, 'map_index согласован');
  }
  assert.equal(buildingForMapIndex(-1), null);
  assert.equal(buildingForMapIndex(13), null);
});

test('buildingForMapIndex: картовые индексы соответствуют buildingNames()', () => {
  // Имя картового индекса = каталожное поле название_карты (source of
  // truth, задача 000055). Старая версия проверяла ТОЛЬКО [0..8,10]
  // через lowercase/includes и пропускала дрейф 9/11/12.
  const names = buildingNames();
  for (let i = 0; i < 13; i++) {
    const b = buildingForMapIndex(i);
    assert.equal(
      names[i], b.особые_параметры.название_карты,
      `${i}: «${names[i]}» ≠ «${b.особые_параметры.название_карты}»`,
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
    assert.deepEqual([...b.допустимые_тайлы].sort(), [...passableTiles()].sort(), b.название);
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

test('placeBuilding: validateSize — отклоняет размер, берёт следующий в цепочке', () => {
  // Все тайлы свободны, но 3x3 «недопустим» (в src/map.js — вход
  // замурован) → цепочка 3x3 → 1x1; вход 1x1 — сам якорь.
  const b = { размер: { ширина: 3, высота: 3 }, вход: [1, 2] };
  const p = placeBuilding(b, 0, 0, () => true,
    (x, y, w, h) => !(w === 3 && h === 3));
  assert.equal(p.w, 1);
  assert.equal(p.h, 1);
  assert.deepEqual(p.entrance, [0, 0]);
  // Без validateSize — старое поведение: полный размер.
  const q = placeBuilding(b, 0, 0, () => true);
  assert.equal(q.w, 3);
  assert.equal(q.h, 3);
  // validateSize отклоняет все размеры — постройки нет.
  assert.equal(placeBuilding(b, 0, 0, () => true, () => false), null);
  // validateSize видит прямоугольник и вход кандидата (для уменьшенного
  // размера — зажатый вход).
  const seen = [];
  placeBuilding(b, 10, 20, () => true,
    (x, y, w, h, entrance) => { seen.push({ x, y, w, h, entrance }); return true; });
  assert.deepEqual(seen, [{ x: 10, y: 20, w: 3, h: 3, entrance: [11, 22] }]);
  // Чистота с validateSize: один и тот же вызов — тот же результат.
  const vs = (x, y, w, h) => w <= 2;
  assert.deepEqual(
    placeBuilding({ размер: { ширина: 3, высота: 3 }, вход: [1, 2] }, 3, 4, () => true, vs),
    placeBuilding({ размер: { ширина: 3, высота: 3 }, вход: [1, 2] }, 3, 4, () => true, vs));
});

// --- Задача 000055: buildings.js генерируется из assets/buildings,
// имена «картовых» индексов — из каталога (поле название_карты) ---

const { spawnSync } = require('node:child_process');
const {
  buildingNameUi,
} = require('../src/map.js');

test('название_карты: все 13 «картовых» записей каталога имеют поле (непустая строка)', () => {
  for (let i = 0; i < 13; i++) {
    const b = buildingForMapIndex(i);
    const name = b && b.особые_параметры && b.особые_параметры.название_карты;
    assert.equal(typeof name, 'string', `map_index ${i}: нет поля название_карты`);
    assert.notEqual(name.trim(), '', `map_index ${i}: название_карты — пустая строка`);
  }
});

test('имена «картовых» индексов: buildingNames() == название_карты для ВСЕХ 13 индексов (0..12)', () => {
  // Расширение старого теста [0..8,10], который пропускал 9/11/12 и
  // маскировал дрейф: теперь сверка ТОЧНАЯ (данные = данные, без
  // lowercase/includes) и по всем 13 индексам.
  assert.equal(typeof buildingNames, 'function', 'map.js: нет функции buildingNames()');
  const names = buildingNames();
  assert.equal(names.length, 13, '13 имён — по одному на map_index');
  for (let i = 0; i < 13; i++) {
    const b = buildingForMapIndex(i);
    assert.equal(
      names[i], b.особые_параметры.название_карты,
      `индекс ${i}: «${names[i]}» ≠ «${b.особые_параметры.название_карты}» (каталог — source of truth)`);
  }
});

test('общие (обобщённые) картовые имена зафиксированы: idx 9 «вход в пещеру», 11 «таверна», 12 «дом NPC»', () => {
  // Тайл входа (idx 9) → dungeon.js выбирает ЛЮБОЙ из 5 типов
  // подземелья; idx 11/12 — общие для нескольких записей каталога
  // (таверна, 6 домов). Эти имена НЕ каталожные — решение задачи.
  assert.equal(typeof buildingNameUi, 'function', 'map.js: нет функции buildingNameUi()');
  assert.equal(buildingNameUi(9), 'вход в пещеру');
  assert.equal(buildingNameUi(11), 'таверна');
  assert.equal(buildingNameUi(12), 'дом NPC');
});

test('конвенция регистра UI: buildingNameUi — только первая буква в нижнем регистре', () => {
  // Данные каталога — в каталожном регистре («Оружейная»); UI-вывод —
  // первая буква нижняя, остальное как в данных.
  assert.equal(buildingNameUi(0), 'оружейная');
  assert.equal(buildingNameUi(3), 'магазин магии');
  // idx 8: каталог «Храм солнца» (находка 000055: в map.js было «храм»).
  assert.equal(buildingNameUi(8), 'храм солнца');
  assert.equal(buildingNameUi(10), 'рунический камень');
  // «Дом NPC» → «дом NPC»: не whole-string lowercase.
  assert.equal(buildingNameUi(12), 'дом NPC');
  // Неизвестный индекс — пустая строка.
  assert.equal(buildingNameUi(13), '');
  assert.equal(buildingNameUi(-1), '');
});

test('src/buildings.js: шапка GENERATED и маркеры блока данных', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'buildings.js'), 'utf8');
  assert.ok(
    src.includes('GENERATED — не править руками, синхронизируется из assets/buildings (scripts/sync-buildings-data.js)'),
    'в шапке нет пометки «GENERATED — не править руками»');
  assert.ok(
    src.includes('// BEGIN GENERATED (scripts/sync-buildings-data.js)'),
    'нет BEGIN-маркера генерируемого блока данных');
  assert.ok(src.includes('// END GENERATED'), 'нет END-маркера генерируемого блока данных');
});

// --- Задача 000056: единая таблица террейнов — потребители без копий ---
//
// T (литералы имён), ALL_PASSABLE, DENSE в buildings.js — СОБСТВЕННЫЕ
// копии данных map.js. Решение: имена/проходимость/плотность — из единой
// таблицы TERRAIN_DATA (src/map.js) ЛЕНИВО (buildings.js может грузиться
// и без map.js — vm-тесты; в node — циклический require map↔buildings,
// разрешение — в момент вызова, паттерн 000055: пустой вывод не кэшируется).
// Стадия красных тестов: функции/таблица ещё отсутствуют — тесты падают.

test('src/buildings.js: вне блока GENERATED НЕТ литералов имён террейнов', () => {
  // В GENERATED-блоке имена («песок», «трава», …) лежат НАДОБНО — это
  // данные каталога (допустимые_тайлы из JSON, source of truth).
  // Поэтому grep только вне маркеров BEGIN/END GENERATED: собственная
  // копия имён (литеральный объект T) обязана исчезнуть.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'buildings.js'), 'utf8');
  const m = src.match(/\/\/ BEGIN GENERATED[\s\S]*\/\/ END GENERATED/);
  assert.ok(m, 'нет блока BEGIN/END GENERATED');
  const outside = src.replace(m[0], '');
  for (const name of TERRAIN_TABLE_NAMES) {
    assert.ok(!outside.includes("'" + name + "'"),
      `литерал '${name}' вне GENERATED (своя копия имён в buildings.js)`);
    assert.ok(!outside.includes('"' + name + '"'),
      `литерал "${name}" вне GENERATED (своя копия имён в buildings.js)`);
  }
});

test('passableTiles()/denseTiles(): имена passable/dense-записей таблицы, порядок по id', () => {
  assert.equal(typeof passableTiles, 'function', 'buildings.js: нет passableTiles()');
  assert.equal(typeof denseTiles, 'function', 'buildings.js: нет denseTiles()');
  assert.ok(TERRAIN_DATA && typeof TERRAIN_DATA === 'object',
    'map.js: нет TERRAIN_DATA');
  const ids = Object.keys(TERRAIN_DATA).map(Number).sort((a, b) => a - b);
  assert.deepEqual(passableTiles(),
    ids.filter((id) => TERRAIN_DATA[id].passable)
       .map((id) => TERRAIN_DATA[id].name), 'passableTiles() — из таблицы, по id');
  assert.deepEqual(denseTiles(),
    ids.filter((id) => TERRAIN_DATA[id].dense)
       .map((id) => TERRAIN_DATA[id].name), 'denseTiles() — из таблицы, по id');
});

test('сквозная связь: допустимые_тайлы ВСЕХ 50 записей ⊆ passableTiles() (против таблицы map.js)', () => {
  // Замещает проверку по локальной копии: связь «каталог ↔ проходымость»
  // теперь против ЕДИНОЙ таблицы (map.js), а не против литералов
  // buildings.js — дрейф любой из сторон ловится здесь.
  assert.equal(typeof passableTiles, 'function', 'buildings.js: нет passableTiles()');
  const allowed = new Set(passableTiles());
  for (const b of BUILDINGS) {
    for (const t of b.допустимые_тайлы) {
      assert.ok(allowed.has(t),
        `${b.id} ${b.название}: тайл «${t}» не в passableTiles() таблицы map.js`);
    }
  }
});

test('schema.json: enum «допустимые_тайлы» ≡ множеству passable-имён единой таблицы', () => {
  // Четвёртая копия имён (enum схемы) закрывается связью с таблицей:
  // enum не расползается в свою третью/четвёртую правду.
  assert.ok(TERRAIN_DATA && typeof TERRAIN_DATA === 'object',
    'map.js: нет TERRAIN_DATA');
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  const enumNames = schema.properties['допустимые_тайлы'].items.enum;
  const passableNames = Object.keys(TERRAIN_DATA).map(Number)
    .sort((a, b) => a - b)
    .filter((id) => TERRAIN_DATA[id].passable)
    .map((id) => TERRAIN_DATA[id].name);
  assert.deepEqual(enumNames.slice().sort(), passableNames.slice().sort(),
    'enum «допустимые_тайлы» ≠ passable-именам таблицы');
});

test('vm: buildings.js БЕЗ map.js грузится, passableTiles() === [] грациозно; после perlin+map — значения таблицы', () => {
  // buildings.js обязан оставаться автономным для vm-тестов: без
  // таблицы — ПУСТОЙ вывод (без собственных фолбэк-литералов — их
  // отсутствие закрепляет grep-тест выше), после загрузки perlin+map
  // — имена из единой таблицы.
  const sandbox = {};
  loadInSandbox('buildings.js', sandbox);
  assert.equal(typeof sandbox.Game.passableTiles, 'function',
    'passableTiles в browser-режиме');
  // Разные realm'ы: массив из vm-песочницы ≠ [] внешнего realm в
  // deepStrictEqual (разные Array.prototype) — JSON-нормализация
  // (паттерн tests/map.test.js, следующая проверка ниже та же).
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.Game.passableTiles())),
    [], 'без map.js — грациозно []');
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  // Разные realm'ы: JSON-нормализация.
  assert.deepEqual(
    JSON.parse(JSON.stringify(sandbox.Game.passableTiles())),
    JSON.parse(JSON.stringify(passableTiles())),
    'после perlin+map — значения единой таблицы');
});

test('sync-buildings-data.js: существует, exit 0, идемпотентен (повторный запуск — byte-identical)', () => {
  const ROOT = path.join(__dirname, '..');
  const script = path.join(ROOT, 'scripts', 'sync-buildings-data.js');
  assert.ok(fs.existsSync(script), 'scripts/sync-buildings-data.js не существует');
  const outFile = path.join(ROOT, 'src', 'buildings.js');
  const before = fs.readFileSync(outFile);
  const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0,
    'скрипт завершился с ошибкой: ' + (res.stderr || res.stdout));
  assert.deepEqual(fs.readFileSync(outFile), before,
    'повторный запуск скрипта изменил src/buildings.js (не идемпотентно)');
});

test('package.json: npm-скрипт sync:buildings (интерфейс единый с sync-npc/skills)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync:buildings'], 'node scripts/sync-buildings-data.js');
});

// --- Задача 000060: единый источник ассортимента магазинов —
// `особые_параметры.виды` каталога (assets/buildings). ---
//
// Дизайн: у 5 «картовых» записей-магазинов (map_index 0,1,2,3,11)
// функциональное поле `виды` = массив id из ITEM_KINDS — источник
// истины shopKindsFor (src/items.js). Проза `ассортимент` остаётся
// описательной, кодом не читается. Торговля (сток/seed/цены makeShop)
// не меняется — множества видов совпадают с текущей таблицей кода.
// ВАЖНО: пятый магазин — ТАВЕРНА, запись 000044 (id 44, map_index 11,
// категория «прочее», прозы `ассортимент` у неё нет); map_index 4 —
// Арена (id 7, школа_навыков), НЕ магазин — `виды` у неё быть не должно.

const { ITEM_KINDS } = require('../src/items.js');
const KIND_IDS = Object.values(ITEM_KINDS); // weapon/armor/potion/food/reagent/skill_book

// Дизайн-таблица: map_index → виды ассортимента (≡ текущей таблице
// shopKindsFor в items.js — торговля byte-идентична).
const SHOP_KINDS_BY_MAP_INDEX = {
  0: ['weapon'],               // Оружейная (id 1)
  1: ['armor'],                // Бронник (id 2)
  2: ['potion', 'food'],       // Аптекарь (id 3)
  3: ['reagent', 'skill_book'], // Магазин магии (id 4)
  11: ['food', 'potion'],      // Таверна (id 44, map_index 11)
};
const SHOP_IDS = [1, 2, 3, 4, 44];

test('каталог: 5 «картовых» магазинов имеют валидные особых_параметры.виды (000060)', () => {
  for (const [mi, kinds] of Object.entries(SHOP_KINDS_BY_MAP_INDEX)) {
    const idx = Number(mi);
    const b = buildingForMapIndex(idx);
    assert.ok(b, `нет записи с map_index ${idx}`);
    const виды = b.особые_параметры && b.особые_параметры.виды;
    assert.ok(Array.isArray(виды) && виды.length > 0,
      `${b.id} ${b.название}: нет особых_параметры.виды (источник ассортимента)`);
    for (const k of виды) {
      assert.ok(KIND_IDS.includes(k),
        `${b.id} ${b.название}: вид «${k}» не входит в ITEM_KINDS`);
    }
    assert.deepEqual(виды, kinds,
      `${b.id} ${b.название}: виды ${JSON.stringify(виды)} ≠ дизайн ${JSON.stringify(kinds)}`);
  }
});

test('каталог: поле «виды» есть ровно у 5 записей — у «картовых» магазинов (000060)', () => {
  const withKinds = BUILDINGS.filter(
    (b) => b.особые_параметры && Array.isArray(b.особые_параметры.виды));
  assert.equal(withKinds.length, 5,
    'виды у записей: ' + withKinds.map((b) => b.id).join(', '));
  assert.deepEqual(withKinds.map((b) => b.id).sort((a, b) => a - b), SHOP_IDS,
    '«виды» — только у 5 «картовых» магазинов (id 1,2,3,4,44)');
  // Арена (map_index 4) — школа_навыков, НЕ магазин: с «видами»
  // makeShop(ARENA) перестала бы быть null (торговля меняется).
  const arena = buildingForMapIndex(4);
  assert.equal(arena.особые_параметры.виды, undefined,
    'Арена (map_index 4) не должна иметь «виды»');
});

test('каталог: не-магазины без «виды» (000060): Лавка странника, Универсам, дома NPC', () => {
  // Лавка странника (id 5) — нет map_index, её товары — NPC-торговля;
  // Универсам (id 6) — в коде = богатство 3 ЛЮБОГО магазина;
  // Дом целителя (id 26), Дом торговца (id 28) — дома NPC.
  // Их проза «ассортимент» несовместима с ITEM_KINDS — «виды» не вводятся.
  for (const id of [5, 6, 26, 28]) {
    const b = getBuilding(id);
    assert.ok(b, 'нет записи ' + id);
    assert.equal(
      b.особые_параметры && b.особые_параметры.виды, undefined,
      `${b.id} ${b.название}: нет «виды» (не «картовый» магазин)`);
  }
});

test('каталог: проза «ассортимент» 4 магазинов сохранена (описательная, кодом не читается) (000060)', () => {
  const prose = {
    1: ['мечи', 'луки', 'посохи', 'щиты'],
    2: ['доспехи', 'кольчуги', 'плащи'],
    3: ['зелья', 'еда', 'травы'],
    4: ['реагенты', 'свитки заклинаний', 'фокусы'],
  };
  for (const [id, words] of Object.entries(prose)) {
    const b = getBuilding(Number(id));
    assert.deepEqual(b.ассортимент, words,
      `${b.id} ${b.название}: проза «ассортимент» сохранена`);
  }
});
