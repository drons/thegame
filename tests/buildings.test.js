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

// --- Задача 000102: каталог городов — 4 типа (хутор 1x1 … столица 7x7) ---
//
// Слой данных: 4 постройки категории «город» (id 51..54), расширение
// schema.json (ширина/высота до 7, координаты входа до 6, «город» в
// enum «категория»), флаг особые_параметры.не_сжимать —
// sizeChain/placeBuilding пробуют ТОЛЬКО полный размер, не влезла →
// null (город не сжимается до 3x3/1x1).
// Стадия красных тестов: тесты ниже падают до реализации.
// Подпроверки регрессии (без флага) закрепляют старое поведение
// остальных построек (цепочка 3x3 → 1x1 сохраняется).

const CITY_EXPECTED = {
  51: { name: 'Хутор', width: 1, height: 1 },
  52: { name: 'Деревня', width: 2, height: 2 },
  53: { name: 'Город', width: 5, height: 5 },
  54: { name: 'Столица', width: 7, height: 7 },
};
const CITY_IDS = Object.keys(CITY_EXPECTED).map(Number);

function cityRecord(id) {
  const b = getBuilding(id);
  assert.ok(b, `getBuilding(${id}) — запись отсутствует`);
  return b;
}

test('schema.json (000102): enum «категория» содержит «город», максимумы 7x7, вход до 6', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  const enumCats = schema.properties['категория'].enum;
  for (const cat of Object.keys(EXPECTED_COUNTS)) {
    assert.ok(enumCats.includes(cat), `enum «категория»: нет «${cat}»`);
  }
  assert.ok(enumCats.includes('город'), 'enum «категория»: нет «город»');
  const sz = schema.properties['размер'];
  assert.equal(sz.properties['ширина'].maximum, 7,
    'размер.ширина maximum = 7');
  assert.equal(sz.properties['высота'].maximum, 7,
    'размер.высота maximum = 7');
  assert.equal(schema.properties['вход'].items.maximum, 6,
    'вход items maximum = 6');
});

test('CATEGORIES (000102): содержит «город»', () => {
  assert.ok(CATEGORIES.includes('город'), 'CATEGORIES: нет «город»');
});

test('каталог (000102): 54 типа, id = 1..54 без дублей, 4 из них — города', () => {
  assert.equal(BUILDINGS.length, 54, 'в каталоге 54 типа');
  assert.equal(new Set(BUILDINGS.map((b) => b.id)).size, 54,
    'id уникальны');
  for (let i = 0; i < BUILDINGS.length; i++) {
    assert.equal(BUILDINGS[i].id, i + 1, 'id = позиция в каталоге + 1');
  }
  assert.equal(getBuildingsByCategory('город').length, 4, 'ровно 4 города');
});

test('города (000102): категория, размер, название_карты, проходимые тайлы', () => {
  const passable = passableTiles();
  for (const id of CITY_IDS) {
    const b = cityRecord(id);
    const exp = CITY_EXPECTED[id];
    assert.equal(b.категория, 'город', `${id}: категория`);
    const { width, height } = buildingSize(b);
    assert.equal(width, exp.width, `${id} ${exp.name}: ширина`);
    assert.equal(height, exp.height, `${id} ${exp.name}: высота`);
    assert.ok(b.размер && typeof b.размер === 'object',
      `${id} ${exp.name}: явное поле «размер»`);
    assert.equal(b.особые_параметры.название_карты, exp.name,
      `${id} ${exp.name}: название_карты`);
    assert.deepEqual(
      [...b.допустимые_тайлы].sort(), [...passable].sort(),
      `${id} ${exp.name}: допустимые_тайлы — все проходимые (без воды)`);
  }
});

test('города (000102): вход явный и на периметре footprint (000026: снаружи — свободный сосед)', () => {
  for (const id of CITY_IDS) {
    const b = cityRecord(id);
    const exp = CITY_EXPECTED[id];
    assert.ok(Array.isArray(b.вход) && b.вход.length === 2,
      `${id} ${exp.name}: явное поле «вход»`);
    const { width, height } = buildingSize(b);
    const [dx, dy] = buildingEntranceRel(b);
    assert.ok(dx >= 0 && dx < width && dy >= 0 && dy < height,
      `${id}: вход (${dx},${dy}) внутри footprint ${width}x${height}`);
    const onPerimeter =
      dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1;
    assert.ok(onPerimeter,
      `${id} ${exp.name}: вход (${dx},${dy}) не на периметре ` +
      `${width}x${height} — нет свободного соседа снаружи (000026)`);
  }
});

test('города (000102): без map_index — 13 «картовых» слотов не меняются', () => {
  for (const id of CITY_IDS) {
    const b = cityRecord(id);
    assert.equal(typeof b.особые_параметры.map_index, 'undefined',
      `${id}: город не слот — без map_index`);
  }
  assert.equal(buildingCount(), 13, 'buildingCount() = 13');
  for (let i = 0; i < 13; i++) {
    assert.ok(buildingForMapIndex(i) !== null,
      `map_index ${i} по-прежнему отображается`);
  }
  assert.equal(buildingForMapIndex(13), null);
});

test('города (000102): особые_параметры.не_сжимать — строго true', () => {
  for (const id of CITY_IDS) {
    const b = cityRecord(id);
    assert.equal(b.особые_параметры.не_сжимать, true,
      `${id}: особые_параметры.не_сжимать === true`);
  }
});

test('города (000102): мин_постройки и доли_типов (читает 000106)', () => {
  for (const id of CITY_IDS) {
    const b = cityRecord(id);
    const p = b.особые_параметры;
    assert.ok(Number.isInteger(p.мин_постройки) && p.мин_постройки >= 0,
      `${id}: мин_постройки — целое ≥ 0 (получено ${p.мин_постройки})`);
    if (id === 51) {
      // Хутор 1x1: внутренности НЕТ (периметр = весь footprint) —
      // минимум обязан быть 0, иначе 000106 получит невыполнимое
      // требование.
      assert.equal(p.мин_постройки, 0,
        'хутор 1x1: нет внутренностей → мин_постройки = 0');
    }
    const shares = p.доли_типов;
    assert.ok(shares && typeof shares === 'object' &&
      !Array.isArray(shares), `${id}: доли_типов — объект`);
    assert.ok(Object.keys(shares).length > 0, `${id}: доли_типов не пуст`);
    assert.ok('44' in shares,
      `${id}: доли_типов — таверна (id 44) присутствует во всех 4 типах`);
    for (const [k, v] of Object.entries(shares)) {
      assert.ok(typeof v === 'number' && v >= 0 && v <= 1,
        `${id}: доля ${k} — число 0..1 (получено ${v})`);
      const inner = getBuilding(Number(k));
      assert.ok(inner !== null,
        `${id}: ключ ${k} — в каталоге нет постройки с таким id`);
      assert.notEqual(inner.категория, 'город',
        `${id}: ключ ${k} — внутренний тип — НЕ город, а постройка каталога`);
    }
  }
});

test('sizeChain (000102): с флагом — один полный размер; без — старая цепочка (регрессия)', () => {
  assert.deepEqual(sizeChain(7, 7, true), [[7, 7]]);
  assert.deepEqual(sizeChain(5, 5, true), [[5, 5]]);
  assert.deepEqual(sizeChain(5, 4, true), [[5, 4]]);
  // Регрессия: без флага остальные постройки цепочку не теряют.
  assert.deepEqual(sizeChain(7, 7), [[7, 7], [3, 3], [1, 1]]);
  assert.deepEqual(sizeChain(3, 3), [[3, 3], [1, 1]]);
});

test('placeBuilding (000102): столица 7x7 — целиком или null, сжатия нет', () => {
  const cap = cityRecord(54);
  // Полностью свободное поле — размещается целиком.
  const p = placeBuilding(cap, 10, 20, () => true);
  assert.ok(p, 'столица на свободном поле — размещается');
  assert.equal(p.w, 7, 'ширина 7 (не 3, не 1)');
  assert.equal(p.h, 7, 'высота 7 (не 3, не 1)');
  assert.equal(p.tiles.length, 49, '49 тайлов');
  const [erx, ery] = buildingEntranceRel(cap);
  assert.deepEqual(p.entrance, [10 + erx, 20 + ery],
    'вход = якорь + вход из записи');
  // Занят ЛЮБОЙ тайл 7x7-прямоугольника (включая крайний (6,6)) —
  // null: не 3x3, не 1x1, сжатия нет.
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const q = placeBuilding(cap, 10, 20,
        (tx, ty) => !(tx === 10 + dx && ty === 20 + dy));
      assert.equal(q, null, `занят тайл (${dx},${dy}) → null`);
    }
  }
  // validateSize отклоняет полный размер — null (менее крупных
  // размеров в цепочке нет).
  assert.equal(placeBuilding(cap, 0, 0, () => true, () => false), null,
    'validateSize false → null (сжатия нет)');
});

test('placeBuilding (000102): город 5x5 в полосе 5x4 — null (3x3 влезло бы, но сжатия нет)', () => {
  const city = cityRecord(53);
  // Свободны ряды 0..3, ряд 4 занят: 5x5 целиком не влезает,
  // а 3x3 влезает — город не сжимается.
  const p = placeBuilding(city, 0, 0, (tx, ty) => ty < 4);
  assert.equal(p, null, '5x5 целиком не влезает → null');
});

test('placeBuilding (000102): флаг берётся строго === true — иначе старая цепочка (регрессия)', () => {
  // Свободны ряды 0..2: 3x3 влезает, 7x7 — нет.
  const tight = (tx, ty) => ty < 3;
  const plain = { размер: { ширина: 7, высота: 7 }, вход: [3, 6] };
  const p1 = placeBuilding(plain, 0, 0, tight);
  assert.equal(p1.w, 3, 'без флага: 7x7 сжимается до 3x3');
  assert.equal(p1.h, 3);
  const off = {
    размер: { ширина: 7, высота: 7 }, вход: [3, 6],
    особые_параметры: { не_сжимать: false },
  };
  const p2 = placeBuilding(off, 0, 0, tight);
  assert.equal(p2.w, 3, 'не_сжимать=false: 7x7 сжимается до 3x3');
  assert.equal(p2.h, 3);
  const on = {
    размер: { ширина: 7, высота: 7 }, вход: [3, 6],
    особые_параметры: { не_сжимать: true },
  };
  assert.equal(placeBuilding(on, 0, 0, tight), null,
    'не_сжимать=true: не влез → null (3x3 не строится)');
});

test('зеркало (000102): файлы 000001..000054.json, содержимое = JS-каталог', () => {
  const files = fs.readdirSync(DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 54, 'ровно 54 файла типа');
  for (let i = 0; i < 54; i++) {
    const num = String(i + 1).padStart(6, '0');
    assert.equal(files[i], num + '.json',
      `файл ${files[i]} вместо ${num}.json`);
    const fromFile = JSON.parse(
      fs.readFileSync(path.join(DIR, files[i]), 'utf8'));
    assert.equal(fromFile.id, i + 1, 'id = номер файла');
    assert.deepEqual(fromFile, BUILDINGS[i],
      `${num}.json совпадает с JS-каталогом`);
  }
});

test('sync-buildings-data.js (000102): CATEGORY_TITLES знает «город» → «Города»', () => {
  const ROOT = path.join(__dirname, '..');
  const script = fs.readFileSync(
    path.join(ROOT, 'scripts', 'sync-buildings-data.js'), 'utf8');
  assert.ok(/город:\s*'Города'/.test(script),
    'CATEGORY_TITLES: нет «город: \'Города\'» — заголовок секции ' +
    'в зеркале будет сырым ключом «город»');
});

test('buildings.js (000102): шапочный комментарий и JSDoc согласованы с размером каталога', () => {
  // Согласованность (зелёный теперь: 50/50; после реализации
  // краснеет, если «Каталог: 54 типа» и JSDoc «1..54» не обновить).
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'buildings.js'), 'utf8');
  assert.ok(src.includes(`Каталог: ${BUILDINGS.length} типов`),
    'шапка: «Каталог: N типов» — N = размер каталога');
  assert.ok(src.includes(`1..${BUILDINGS.length}`),
    'JSDoc getBuilding: «1..N» — N = размер каталога');
});
