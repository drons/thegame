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

// Задача 000207: сырые JSON несут ссылки
// .стройка.исходники[].предмет «assets/items/NNNNNN.json», зеркало
// src/buildings.js — в id-форме (sync резолвит ссылки в id).
// Задача 000211.07: «особые_параметры.тренирует» — ссылки
// «assets/skills/NNNNNN.json» (зеркало — тоже id-форма).
// Mirror-тесты whole-record: резолв ссылок в id ПЕРЕД deepEqual
// (контракт memory/000207-buildings-refs-items.md, D7;
// memory/000211.07-buildings-sprites-trains-refs.md §4.2 T2).
// НЕ-ссылка (имя — данные не миграированы) — throw: краснота
// осмысленная, терпимый no-op отклонён (серийный паттерн 000211.08).
const ITEM_REF_RE = /^assets\/items\/\d{6}\.json$/;
const SKILL_REF_RE = /^assets\/skills\/\d{6}\.json$/;
const { resolveRef } = require('../scripts/lib/json-ref.js');
function resolveRefs(record) {
  const out = JSON.parse(JSON.stringify(record));
  const op = out.особые_параметры;
  const s = op && op.стройка;
  if (s && Array.isArray(s.исходники)) {
    for (const e of s.исходники) {
      if (e && typeof e.предмет === 'string' && ITEM_REF_RE.test(e.предмет)) {
        const t = JSON.parse(fs.readFileSync(
          path.join(__dirname, '..', e.предмет), 'utf8'));
        if (!t || typeof t.id !== 'string' || t.id === '') {
          throw new Error('resolveRefs: «' + e.предмет + '» без id');
        }
        e.предмет = t.id;
      }
    }
  }
  const tr = op && op.тренирует;
  if (tr && Array.isArray(tr)) {
    for (let i = 0; i < tr.length; i++) {
      const v = tr[i];
      if (typeof v !== 'string' || !SKILL_REF_RE.test(v)) {
        throw new Error('resolveRefs: «тренирует» — «' + v +
          '» не ссылка (формат "assets/skills/NNNNNN.json")');
      }
      const r = resolveRef(path.join(__dirname, '..'), v);
      if (!r.ok) {
        throw new Error('resolveRefs: «тренирует» — «' + v +
          '» не резолвится (' + r.reason + ')');
      }
      tr[i] = r.id;
    }
  }
  return out;
}

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

// spec/buildings.md: 6 магазинов, 18 школ навыков, 6 домов NPC,
// 5 входов в пещеры, 4 храма, 4 магических знака, 7 прочих = 50 типов
// + 4 города (000102) = 54 типов.
const EXPECTED_COUNTS = {
  магазин: 6,
  школа_навыков: 18,
  дом_npc: 6,
  пещера: 5,
  храм: 4,
  магический_знак: 4,
  город: 4,
  прочее: 7,
};

test('каталог: 54 типа, id = 1..54 без дублей, порядок = id', () => {
  assert.equal(BUILDINGS.length, 54);
  const ids = BUILDINGS.map((b) => b.id);
  assert.equal(new Set(ids).size, 54, 'id уникальны');
  for (let i = 0; i < BUILDINGS.length; i++) {
    assert.equal(BUILDINGS[i].id, i + 1, 'id = позиция в каталоге + 1');
  }
});

test('каталог: категории — 6/18/6/5/4/4/4/7, все категории из CATEGORIES', () => {
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

test('файлы assets/buildings: ровно 000001..000054.json, содержимое = JS-фолбэк', () => {
  const files = fs.readdirSync(DIR).filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 54, 'ровно 54 файла типа');
  for (let i = 0; i < 54; i++) {
    const num = String(i + 1).padStart(6, '0');
    assert.equal(files[i], num + '.json', `файл ${files[i]} вместо ${num}.json`);
    const fromFile = JSON.parse(fs.readFileSync(path.join(DIR, files[i]), 'utf8'));
    assert.equal(fromFile.id, i + 1, 'id = номер файла');
    assert.deepEqual(resolveRefs(fromFile), BUILDINGS[i],
      `${num}.json совпадает с JS-фолбэком (ссылки — в id-форме)`);
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
  assert.equal(getBuilding(55), null, 'вне каталога (1..54) — null');
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
  assert.equal(withSize.length, 10,
    'именно 10 построек имеют поле «размер» (6 + 4 города, 000102)');
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
  assert.equal(sz.properties['ширина'].maximum, 7, '000102: до 7x7');
  assert.equal(sz.properties['высота'].minimum, 1);
  assert.equal(sz.properties['высота'].maximum, 7, '000102: до 7x7');
  const en = schema.properties['вход'];
  assert.ok(en, 'schema: нет свойства «вход»');
  assert.equal(en.type, 'array');
  assert.equal(en.minItems, 2);
  assert.equal(en.maxItems, 2);
  assert.equal(en.items.minimum, 0);
  assert.equal(en.items.maximum, 6, '000102: координаты на footprint до 7x7');
  // Каталог укладывается в ограничения схемы (проверка без ajv).
  for (const b of BUILDINGS) {
    if (b.размер) {
      assert.ok(Number.isInteger(b.размер.ширина) && b.размер.ширина >= 1 && b.размер.ширина <= 7, b.название);
      assert.ok(Number.isInteger(b.размер.высота) && b.размер.высота >= 1 && b.размер.высота <= 7, b.название);
      assert.deepEqual(Object.keys(b.размер).sort(), ['высота', 'ширина'],
        `${b.название}: только ширина/высота (additionalProperties=false)`);
    }
    if (b.вход) {
      assert.equal(b.вход.length, 2, b.название);
      for (const v of b.вход) {
        assert.ok(Number.isInteger(v) && v >= 0 && v <= 6, b.название);
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

test('сквозная связь: допустимые_тайлы ВСЕХ записей ⊆ passableTiles() (против таблицы map.js)', () => {
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
    assert.deepEqual(resolveRefs(fromFile), BUILDINGS[i],
      `${num}.json совпадает с JS-каталогом (ссылки — в id-форме)`);
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

// --- Задача 000073: размещение подтипов — особые_параметры.размещение ---
//
// 10 «некартовых» записям каталога (37/38/39 храм, 41/42/43 маг.
// знаки, 45/46/48/49 прочее) — поле особых_параметры.размещение
// { слот, доля } — source of truth генерации подтипов слотов 8..12
// (src/map.js: subtypeFor по hash2(x, y, SUBTYPE_SEED_CONST); доля
// базовой записи слота = остаток 100 − Σдоля — поле У НЕЁ НЕТ).
// Таблица зафиксирована задачей 000073 (подзадача 000064).
// Зеркало src/buildings.js ≡ JSON — покрывает существующий тест
// «файлы assets/buildings … содержимое = JS-фолбэк» после
// регенерации scripts/sync-buildings-data.js (write-atomic).
//
// СТАДИЯ КРАСНЫХ ТЕСТОВ: поле ещё нет в JSON — тесты падают.

const SUBTYPE_PLACEMENT_0073 = {
  8: { 37: 10, 38: 10, 39: 10 },  // храмы: луна/гора/заброшенный
  9: { 48: 20 },                  // развалины (базовая 31 — 80)
  10: { 41: 15, 42: 15, 43: 15 }, // телепорт/обелиск/маг. круг
  11: { 45: 15, 49: 25 },         // колодец/фонтан (базовая 44 — 60)
  12: { 46: 30 },                 // смотровая башня (базовая 25 — 70)
};
const BASE_SLOT_IDS_0073 = { 8: 36, 9: 31, 10: 40, 11: 44, 12: 25 };

test('каталог 000073: ровно 10 записей-подтипов с особые_параметры.размещение; таблица = ТЗ (слот → {id: доля})', () => {
  const withPlacement = BUILDINGS.filter(
    (b) => b.особые_параметры && b.особые_параметры.размещение);
  assert.equal(withPlacement.length, 10,
    'ровно 10 записей-подтипов (получено: ' +
    (withPlacement.map((b) => b.id).join(', ') || 'нет') + ')');
  const seen = {};
  for (const b of withPlacement) {
    const r = b.особые_параметры.размещение;
    const slot = r.слот;
    assert.ok(Number.isInteger(slot) && slot >= 8 && slot <= 12,
      `${b.id} ${b.название}: слот ${slot} — подтипы только слоты 8..12`);
    assert.ok(Number.isInteger(r.доля) && r.доля >= 1 && r.доля <= 100,
      `${b.id} ${b.название}: доля — целое 1..100 (получено ${r.доля})`);
    (seen[slot] = seen[slot] || {})[b.id] = r.доля;
  }
  assert.deepEqual(Object.keys(seen).map(Number).sort((a, b) => a - b),
    [8, 9, 10, 11, 12], 'подтипы — ровно в слотах 8..12');
  for (const [slot, rows] of Object.entries(SUBTYPE_PLACEMENT_0073)) {
    assert.deepEqual(seen[Number(slot)], rows,
      `слот ${slot}: таблица размещения подтипов (id → доля)`);
  }
  // Подтипы — НЕ новые слоты: map_index у них нет (13 слотов не
  // меняются, BUILDING_COUNT = 13).
  for (const b of withPlacement) {
    assert.equal(b.особые_параметры.map_index, undefined,
      `${b.id} ${b.название}: подтип — без map_index (слоты не меняются)`);
  }
});

test('каталог 000073: сумма долей подтипов слота < 100 (остаток базовой > 0); 5 базовых записей — БЕЗ размещения', () => {
  for (const [slot, rows] of Object.entries(SUBTYPE_PLACEMENT_0073)) {
    const sum = Object.values(rows).reduce((s, v) => s + v, 0);
    assert.ok(sum < 100,
      `слот ${slot}: сумма долей подтипов = ${sum} — остаток базовой обязан быть > 0`);
  }
  for (const [slot, baseId] of Object.entries(BASE_SLOT_IDS_0073)) {
    const b = buildingForMapIndex(Number(slot));
    assert.equal(b && b.id, baseId, `слот ${slot}: базовая запись — id ${baseId}`);
    assert.ok(!(b.особые_параметры.размещение),
      `${b.id} ${b.название}: у базовой нет размещения (доля = остаток 100 − Σдоля)`);
  }
});

// --- Задача 000148.03: строительство в городе — ядро ---
//
// особые_параметры.стройка = {золото: int>0} — ДАННЫЕ каталога
// (принцип 000053): ровно у 21 buildable-типа набора D3 (map_index
// ИЛИ размещение.слот, МИНУС исключения, выраженные ОТСУТСТВИЕМ поля
// .стройка: 31-35 пещеры — dungeon-система, 41 телепорт-круг — пары
// на карте мира, 47 лагерь — мировая механика, 50 мост — резерв
// 000064, 51-54 города — само-вложение). Строгай контур: у остальных
// 33 записей поля «стройка» НЕТ. Зеркало src/buildings.js ≡ JSON —
// существующие тесты «файлы assets/buildings … = JS-фолбэк» (:94) и
// sync-тест (:498) покрывают byte-идентичность (один коммит).
// КРАСНЫЕ: поле отсутствует во всех JSON/зеркале.

const D3_IDS_03 = [1, 2, 3, 4, 7, 8, 10, 11, 25, 36, 37, 38, 39, 40,
  42, 43, 44, 45, 46, 48, 49];

test('каталог 000148.03: особые_параметры.стройка = {золото: int>0} ровно у 21 buildable-типа (набор D3); у остальных 33 — нет', () => {
  const withBuild = BUILDINGS.filter(
    (b) => b.особые_параметры && b.особые_параметры.стройка);
  assert.deepEqual(
    withBuild.map((b) => b.id).sort((a, b) => a - b),
    D3_IDS_03.slice().sort((a, b) => a - b),
    'RED: ровно 21 запись с .стройка (набор D3); получено: '
    + (withBuild.map((b) => b.id).join(', ') || 'НЕТ'));
  for (const b of withBuild) {
    const g = b.особые_параметры.стройка.золото;
    assert.ok(Number.isInteger(g) && g > 0,
      `${b.id} ${b.название}: .стройка.золото — целое > 0 (получено ${JSON.stringify(g)})`);
  }
  for (const b of BUILDINGS) {
    if (D3_IDS_03.includes(b.id)) continue;
    assert.equal(b.особые_параметры.стройка, undefined,
      `${b.id} ${b.название}: вне набора D3 — поля «стройка» НЕТ (строгий контур)`);
  }
});

// --- Задача 000148.04: строительство — цена — ингредиенты (красные) ---
//
// Контракт: memory/000148.04-city-building-reagents.md §2 (таблица D5)
// + §8 (тест-план). Красная причина (осмысленная, не синтаксис): поле
// особые_параметры.стройка.исходники ОТСУТСТВУЕТ во всех 21 JSON и в
// GENERATED-зеркале src/buildings.js (undefined) — функциональность
// задачи не реализована. Byte-идентичность JSON → зеркало закрывают
// СУЩЕСТВУЮЩИЕ гейты (:94 «файлы assets/buildings … = JS-фолбэк»,
// :498 sync-идемпотентность, sync-all.test.js) — новых тестов не
// нужно (R18 контракта).
// Исходники — ТОЛЬКО 13 reagent 000044 (ТЗ: «из них и только из них»;
// пул ⊆ assets/items, kind reagent). Членство — hard-константа, НЕ
// kind: в мастере kind=reagent уже 36+ (000157.02/000158.02 — регион
// НЕ ТРОГАТЬ). Формат записи — как assets/craft/000001.json:
// { "предмет": "<id>", "количество": N }.

const REAGENTS_000044 = [
  'sulfur', 'moonstone', 'phoenix_feather', 'iron_ore', 'copper_ore',
  'wood_log', 'stone_chunk', 'hide', 'coal', 'herb_healing',
  'herb_mana', 'herb_bitter', 'stone_chisel',
];

test('000148.04 R13: каталог: особые_параметры.стройка.исходники — непустой массив записей {предмет: непустая строка, количество: int>0} ровно у 21 buildable-типа (набор D3); у остальных 33 — .стройка НЕТ (строгий контур)', () => {
  const withSrc = [];
  for (const b of BUILDINGS) {
    const pp = b.особые_параметры;
    const s = pp && pp.стройка;
    const arr = s && s.исходники;
    if (!Array.isArray(arr) || arr.length === 0) continue;
    withSrc.push(b);
    const seen = new Set();
    for (const e of arr) {
      assert.ok(e && typeof e === 'object' && !Array.isArray(e),
        `${b.id} ${b.название}: запись .исходники — объект: `
        + JSON.stringify(e));
      assert.equal(typeof e.предмет, 'string',
        `${b.id}: предмет — строка (получено ${JSON.stringify(e.предмет)})`);
      assert.notEqual(e.предмет.trim(), '',
        `${b.id}: предмет — непустая строка`);
      assert.ok(Number.isInteger(e.количество) && e.количество > 0,
        `${b.id}: количество — int > 0 (получено ${JSON.stringify(e.количество)})`);
      // Ревью 000148.04: УНИКАЛЬНОСТЬ предмета внутри .исходники
      // ОДНОГО здания — дубли ломают атомарность списания
      // (hasItem/removeItem по позициям); код агрегирует (buildCost),
      // данные дублей НЕ допускает.
      assert.ok(!seen.has(e.предмет),
        `${b.id} ${b.название}: дублирующая позиция предмета «${e.предмет}» в .стройка.исходники — один предмет = одна запись`);
      seen.add(e.предмет);
    }
  }
  assert.deepEqual(withSrc.map((b) => b.id).sort((a, b) => a - b),
    D3_IDS_03.slice().sort((a, b) => a - b),
    'RED: ровно 21 запись с непустым .стройка.исходники (набор D3); '
    + 'получено: ' + (withSrc.map((b) => b.id).join(', ') || 'НЕТ'));
  // Строгий контур: у остальных 33 записей поля «стройка» НЕТ
  // (дубль .03 :931 — исходники существуют только у buildable).
  for (const b of BUILDINGS) {
    if (D3_IDS_03.includes(b.id)) continue;
    assert.equal(b.особые_параметры.стройка, undefined,
      `${b.id} ${b.название}: вне набора D3 — поля «стройка» НЕТ (строгий контур)`);
  }
});

test('000148.04 R14: ссылочная целостность: каждый предмет .стройка.исходники ∈ пулу 13 reagent 000044 (⊆ assets/items, kind reagent) — паттерн tests/assets-schemas.test.js', () => {
  const ITEMS_DIR = path.join(__dirname, '..', 'assets', 'items');
  const byId = {};
  for (const f of fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))) {
    const j = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    byId[j.id] = j;
  }
  // Самопроверка пула: 13 id (000044) ∈ assets/items, kind reagent.
  for (const id of REAGENTS_000044) {
    assert.ok(byId[id], 'пул 13 (000044): ' + id + ' ∈ assets/items');
    assert.equal(byId[id].kind, 'reagent',
      'пул 13 (000044): ' + id + ' — kind reagent');
  }
  let n = 0;
  for (const b of BUILDINGS) {
    const s = b.особые_параметры && b.особые_параметры.стройка;
    const arr = s && s.исходники;
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      n += 1;
      assert.ok(REAGENTS_000044.includes(e.предмет),
        `${b.id} ${b.название}: предмет «${e.предмет}» ∉ пулу 13 `
        + 'reagent (ТЗ: «из них и только из них»)');
      assert.ok(byId[e.предмет],
        `${b.id} ${b.название}: предмет «${e.предмет}» ∈ assets/items`);
      assert.equal(byId[e.предмет].kind, 'reagent',
        `${b.id} ${b.название}: предмет «${e.предмет}» — kind reagent`);
    }
  }
  assert.ok(n > 0,
    'RED: минимум одна позиция .стройка.исходники (сейчас поля нет)');
});

// --- Задача 000207: buildings: ресурсы постройки → buildings/*.json со
// ссылками на items, js запекать из ссылок (рефакторинг без смены
// поведения) ---
//
// Контракт: memory/000207-buildings-refs-items.md (D1–D12) +
// memory/000211-spec-coverage-audit.md §2 (формат ссылки ЗАФИКСИРОВАН):
// значение особые_параметры.стройка.исходники[].предмет — строка-путь
// от корня "assets/items/NNNNNN.json", id файла-цели = прежнему значению
// (голый id); зеркало src/buildings.js остаётся в id-форме — резолюция
// ссылок ТОЛЬКО в scripts/sync-buildings-data.js (fail-closed);
// schema.json закрепляет паттерн строгой под-схемой «стройка».
// Тесты читают СЫРЫЙ JSON (DIR); зеркало — require в шапке файла.
// КРАСНЫЕ (функциональность ещё не существует): ссылки в JSON — голые
// id (0/22 под паттерн), файлы-цели не резолвятся (missing-file), в
// скрипте нет резолюции (печатает ссылки как есть — 21 строка
// "assets/items/" в блоке), под-схема «стройка» в схеме отсутствует
// (схема свободная — голый id даёт 0 ошибок).

const { validateData } = require('./json-schema.js');
const BEG_000207 = '// BEGIN GENERATED (scripts/sync-buildings-data.js)';
const END_000207 = '// END GENERATED';
const SYNC_HEADER_000207 =
  'GENERATED — не править руками, синхронизируется из assets/buildings '
  + '(scripts/sync-buildings-data.js)';

// Пин-таблица 000207: здание → [id предмета (прежнее значение),
// количество, файл-цель в assets/items]. 22 позиции, 21 здание D3
// (memory/000207-buildings-refs-items.md §0 — проверено 1:1).
const REF_PIN_000207 = {
  1: [['wood_log', 2, '000035']],
  2: [['hide', 2, '000037']],
  3: [['herb_healing', 2, '000039']],
  4: [['sulfur', 2, '000022']],
  7: [['hide', 8, '000037']],
  8: [['iron_ore', 2, '000033'], ['coal', 2, '000038']],
  10: [['hide', 2, '000037']],
  11: [['wood_log', 2, '000035']],
  25: [['wood_log', 3, '000035']],
  36: [['sulfur', 10, '000022']],
  37: [['herb_mana', 2, '000040']],
  38: [['herb_bitter', 2, '000041']],
  39: [['herb_bitter', 1, '000041']],
  40: [['moonstone', 2, '000023']],
  42: [['moonstone', 3, '000023']],
  43: [['moonstone', 2, '000023']],
  44: [['wood_log', 2, '000035']],
  45: [['stone_chunk', 2, '000036']],
  46: [['stone_chunk', 3, '000036']],
  48: [['stone_chunk', 1, '000036']],
  49: [['stone_chunk', 2, '000036']],
};
const REF_PIN_IDS_000207 = Object.keys(REF_PIN_000207).map(Number);
const R4_NO_BUILD_000207 = [5, 31];

function readBuildingRaw_000207(n) {
  const f = String(n).padStart(6, '0') + '.json';
  return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
}

test('000207 R1: assets/buildings: .стройка.исходники[].предмет — ссылка на файл items (паттерн ^assets/items/\\d{6}\\.json$); ровно 21 здание D3, 22 позиции; вне D3 — .стройка НЕТ (строгий контур)', () => {
  const files = fs.readdirSync(DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 54, 'каталог: ровно 54 файла 0000NN.json');
  const raw = {};
  for (const f of files) {
    raw[parseInt(f, 10)] = JSON.parse(
      fs.readFileSync(path.join(DIR, f), 'utf8'));
  }
  const withBuild = [];
  let pos = 0;
  for (const n of Object.keys(raw).map(Number).sort((a, b) => a - b)) {
    const j = raw[n];
    const s = j.особые_параметры && j.особые_параметры.стройка;
    if (!s || !Array.isArray(s.исходники) || s.исходники.length === 0) continue;
    withBuild.push(n);
    for (const e of s.исходники) {
      pos += 1;
      assert.ok(ITEM_REF_RE.test(e.предмет),
        `${n} ${j.название}: предмет «${e.предмет}» — ссылка на файл items `
        + '(формат "assets/items/NNNNNN.json") ещё не существует (получен голый id)');
    }
  }
  assert.deepEqual(withBuild.slice().sort((a, b) => a - b),
    D3_IDS_03.slice().sort((a, b) => a - b),
    'ровно 21 здание с .стройка.исходники (набор D3); получено: '
    + (withBuild.join(', ') || 'НЕТ'));
  assert.equal(pos, 22,
    'позиций .стройка.исходники = 22 (получено ' + pos + ')');
  for (const n of Object.keys(raw).map(Number).sort((a, b) => a - b)) {
    if (D3_IDS_03.includes(n)) continue;
    const j = raw[n];
    assert.equal(j.особые_параметры.стройка, undefined,
      `${n} ${j.название}: вне набора D3 — поля «стройка» НЕТ (строгий контур)`);
  }
});

test('000207 R2: assets/buildings: целостность ссылок: каждая .стройка.исходники[].предмет резолвится — файл-цель assets/items существует, парсится, id (непустая строка) = ПРЕЖНЕМУ значению (пин-таблица), kind === "reagent", id ∈ пулу 13 reagent 000044; количество = пину', () => {
  let pos = 0;
  for (const bid of Object.keys(REF_PIN_000207)) {
    const n = Number(bid);
    const j = readBuildingRaw_000207(n);
    const rows = REF_PIN_000207[n];
    const s = j.особые_параметры && j.особые_параметры.стройка;
    assert.ok(s && Array.isArray(s.исходники)
      && s.исходники.length === rows.length,
      `${n} ${j.название}: .стройка.исходники — массив из ${rows.length} `
      + `(получено ${s && s.исходники ? s.исходники.length : 'НЕТ'})`);
    for (let i = 0; i < rows.length; i++) {
      const [itemId, kol, itemsFile] = rows[i];
      const e = s.исходники[i];
      pos += 1;
      assert.equal(e.количество, kol,
        `${n} ${j.название}: позиция ${i} — количество ${kol} (получено ${JSON.stringify(e.количество)})`);
      const ref = e.предмет;
      const target = path.join(__dirname, '..', ref);
      assert.ok(fs.existsSync(target),
        `${n} ${j.название}: ссылка «${ref}» — файл-цель отсутствует `
        + `(путь от корня) — ссылки ещё не существуют (0/22 резолвится)`);
      assert.equal(ref, 'assets/items/' + itemsFile + '.json',
        `${n} ${j.название}: позиция ${i} — ссылка «assets/items/${itemsFile}.json» (пин-таблица 000207; получено «${ref}»)`);
      const tj = JSON.parse(fs.readFileSync(target, 'utf8'));
      assert.ok(tj && typeof tj.id === 'string' && tj.id !== '',
        `${n}: файл-цель «${ref}» — id: непустая строка (получено ${JSON.stringify(tj && tj.id)})`);
      assert.equal(tj.id, itemId,
        `${n} ${j.название}: id цели «${tj.id}» ≠ прежнему значению «${itemId}» (пин-таблица 000207)`);
      assert.equal(tj.kind, 'reagent',
        `${n}: цель «${tj.id}» — kind reagent (получено ${JSON.stringify(tj.kind)})`);
      assert.ok(REAGENTS_000044.includes(tj.id),
        `${n}: id цели «${tj.id}» ∈ пулу 13 reagent 000044`);
    }
  }
  assert.equal(pos, 22,
    'позиций .стройка.исходники = 22 (получено ' + pos + ')');
});

test('000207 R3: запекание из ссылок: зеркало src/buildings.js — id-форма: для всех 22 позиций зеркальный .предмет === id файла-цели ссылки из JSON; в GENERATED-блоке НЕТ строк "assets/items/" (ссылки живут ТОЛЬКО в JSON)', () => {
  let pos = 0;
  for (const bid of Object.keys(REF_PIN_000207)) {
    const n = Number(bid);
    const j = readBuildingRaw_000207(n);
    const rows = REF_PIN_000207[n];
    const s = j.особые_параметры && j.особые_параметры.стройка;
    const mb = getBuilding(n);
    const ms = mb.особые_параметры && mb.особые_параметры.стройка;
    assert.ok(ms && Array.isArray(ms.исходники)
      && ms.исходники.length === rows.length,
      `${n}: зеркало — .стройка.исходники из ${rows.length} позиций`);
    for (let i = 0; i < rows.length; i++) {
      const [itemId] = rows[i];
      const ref = s.исходники[i].предмет;
      pos += 1;
      const target = path.join(__dirname, '..', ref);
      assert.ok(fs.existsSync(target),
        `${n} ${j.название}: ссылка «${ref}» — файл-цель отсутствует `
        + '(резолв ссылки невозможен: 0/22)');
      const tid = JSON.parse(fs.readFileSync(target, 'utf8')).id;
      assert.equal(ms.исходники[i].предмет, tid,
        `${n} ${j.название}: зеркальный .предмет «${ms.исходники[i].предмет}» ≠ id цели «${tid}» (зеркало = РЕЗОЛВ JSON)`);
      assert.equal(ms.исходники[i].предмет, itemId,
        `${n} ${j.название}: зеркальный .предмет «${ms.исходники[i].предмет}» ≠ прежнему значению «${itemId}» (byte-identical зеркало)`);
    }
  }
  assert.equal(pos, 22,
    'позиций .стройка.исходники = 22 (получено ' + pos + ')');
  const src = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'buildings.js'), 'utf8');
  const bIdx = src.indexOf(BEG_000207);
  const eIdx = src.indexOf(END_000207);
  assert.ok(bIdx !== -1 && eIdx > bIdx,
    'src/buildings.js: маркеры GENERATED на месте');
  const block = src.slice(bIdx, eIdx);
  assert.ok(!block.includes('assets/items/'),
    'GENERATED-блок: НЕТ строк "assets/items/" (в зеркале — id-форма; ссылки — только в JSON)');
});

test('000207 R4: sync-buildings-data.js резолвит ссылки в id при запекании (функциональный: tmp-копия каталога со ссылочными JSON → перегенерированный блок в id-форме, без путей "assets/items/" и "assets/skills/"); битая ссылка items (файл-цель отсутствует) → exit ≠ 0; битая skills-ссылка → exit ≠ 0; голое имя в «тренирует» (дрейф) → exit ≠ 0 (fail-closed; 000211.07: skills-ссылки — 1:1 items)', () => {
  const os = require('node:os');
  const ROOT = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '000207-r4-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'assets', 'buildings'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'assets', 'items'),
      path.join(tmp, 'assets', 'items'), { recursive: true });
    fs.cpSync(path.join(ROOT, 'assets', 'skills'),
      path.join(tmp, 'assets', 'skills'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-buildings-data.js'),
      path.join(tmp, 'scripts', 'sync-buildings-data.js'));
    for (const lf of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', lf),
        path.join(tmp, 'scripts', 'lib', lf));
    }
    // Фикстура — ПОСТ-миграционная форма данных (ссылки): items —
    // по пину 000207, skills — по пину 000211.07 (позиционно,
    // конвертер idempotent: ссылка — как есть) + пара записей
    // без .стройки (контур); файлы-цели — копии assets/items +
    // assets/skills.
    for (const n of REF_PIN_IDS_000207.concat(R4_NO_BUILD_000207)) {
      const f = String(n).padStart(6, '0') + '.json';
      const j = readBuildingRaw_000207(n);
      const s = j.особые_параметры && j.особые_параметры.стройка;
      if (s) {
        const rows = REF_PIN_000207[n];
        s.исходники.forEach((e, i) => {
          e.предмет = 'assets/items/' + rows[i][2] + '.json';
        });
      }
      if (TRAINS_PIN_000211_07[n]) {
        convertTrainsRefs_000211_07(j);
      }
      fs.writeFileSync(path.join(tmp, 'assets', 'buildings', f),
        JSON.stringify(j, null, 2));
    }
    fs.writeFileSync(path.join(tmp, 'src', 'buildings.js'),
      '// ' + SYNC_HEADER_000207 + '\n'
      + BEG_000207 + '\n' + END_000207 + '\n');
    const script = path.join(tmp, 'scripts', 'sync-buildings-data.js');
    const res = spawnSync(process.execPath, [script],
      { cwd: tmp, encoding: 'utf8' });
    assert.equal(res.status, 0,
      'прогон 1 (все ссылки резолвятся): exit 0 (получено ' + res.status + '): '
      + (res.stderr || res.stdout));
    const out = fs.readFileSync(path.join(tmp, 'src', 'buildings.js'), 'utf8');
    const bIdx = out.indexOf(BEG_000207);
    const eIdx = out.indexOf(END_000207);
    assert.ok(bIdx !== -1 && eIdx > bIdx,
      'прогон 1: маркеры GENERATED на месте');
    const block = out.slice(bIdx, eIdx);
    assert.ok(!block.includes('assets/items/'),
      'прогон 1: перегенерированный блок — id-форма (НЕТ строк "assets/items/" — ссылки резолвятся при запекании; сейчас скрипт печатает ссылки как есть)');
    assert.ok(!block.includes('assets/skills/'),
      'прогон 1: перегенерированный блок — id-форма (НЕТ строк "assets/skills/" — skills-ссылки резолвятся при запекании, 000211.07)');
    for (const bid of Object.keys(REF_PIN_000207)) {
      for (const [itemId] of REF_PIN_000207[Number(bid)]) {
        assert.ok(block.includes('предмет: "' + itemId + '"'),
          'прогон 1: блок содержит запечённый id «' + itemId
          + '» (здание ' + bid + ')');
      }
    }
    for (const bid of [7, 8, 10, 11]) {
      const ids = TRAINS_PIN_000211_07[bid].map((r) => r[1]);
      assert.ok(block.includes(
        'тренирует: [' + ids.map((x) => '"' + x + '"').join(', ') + ']'),
        'прогон 1: блок содержит «тренирует» школы ' + bid
        + ' в id-форме: [' + ids.join(', ') + '] (пин 000211.07)');
    }
    for (const bid of [7, 8, 10, 11]) {
      assert.ok(block.includes(
        'спрайт: "' + SPRITE_PIN_000211_07[bid] + '"'),
        'прогон 1: «спрайт» здания ' + bid
        + ' — as-is в блоке (поле-данные, не ссылка): '
        + SPRITE_PIN_000211_07[bid]);
    }
    const p1 = path.join(tmp, 'assets', 'buildings', '000001.json');
    const j1 = JSON.parse(fs.readFileSync(p1, 'utf8'));
    j1.особые_параметры.стройка.исходники[0].предмет = 'assets/items/999999.json';
    fs.writeFileSync(p1, JSON.stringify(j1, null, 2));
    const res2 = spawnSync(process.execPath, [script],
      { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(res2.status, 0,
      'прогон 2 (битая ссылка items, файл-цель отсутствует): обязателен exit ≠ 0 (fail-closed); получен exit 0 — ссылка запекнулась бы молча');
    const p7 = path.join(tmp, 'assets', 'buildings', '000007.json');
    const j7 = JSON.parse(fs.readFileSync(p7, 'utf8'));
    j7.особые_параметры.тренирует[0] = 'assets/skills/999999.json';
    fs.writeFileSync(p7, JSON.stringify(j7, null, 2));
    const res3 = spawnSync(process.execPath, [script],
      { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(res3.status, 0,
      'прогон 3 (битая skills-ссылка, файл-цель отсутствует): обязателен exit ≠ 0 (fail-closed, 000211.07); получен exit 0 — ссылка запекнулась бы молча');
    const j7b = JSON.parse(fs.readFileSync(p7, 'utf8'));
    j7b.особые_параметры.тренирует[0] = 'мечник';
    fs.writeFileSync(p7, JSON.stringify(j7b, null, 2));
    const res4 = spawnSync(process.execPath, [script],
      { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(res4.status, 0,
      'прогон 4 (голое имя в «тренирует» — дрейф): обязателен exit ≠ 0 (fail-closed); получен exit 0 — имя запекнулось бы как данные');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000207 R5: schema.json закрепляет ссылочный контур: под-схема особые_параметры.стройка — строгая (D2: предмет — pattern ^assets/items/\\d{6}\\.json$); отрицательный контроль: запись с ГОЛЫМ id предмета — ≥1 ошибка, со ссылкой — 0; особые_параметры остаётся свободным; все 54 файла каталога валидны', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  const rec = readBuildingRaw_000207(1);
  const bare = JSON.parse(JSON.stringify(rec));
  bare.особые_параметры.стройка.исходники[0].предмет = 'wood_log';
  const errBare = validateData(schema, bare, '000001.json');
  assert.ok(errBare.length >= 1,
    'запись с голым id предмета — ошибка схемы обязательна (получено 0 ошибок — «особые_параметры» свободный объект, под-схема «стройка» не закреплена)');
  assert.ok(errBare.some((e) => e.includes('assets/items')),
    'ошибка — на pattern предмета (получено: ' + errBare.join(' | ') + ')');
  const oschema = schema.properties && schema.properties['особые_параметры'];
  const sub = oschema && oschema.properties && oschema.properties['стройка'];
  assert.ok(sub,
    'schema.json: под-схема особых_параметры.properties.стройка отсутствует');
  assert.deepEqual(sub, {
    type: 'object',
    additionalProperties: false,
    required: ['золото', 'исходники'],
    properties: {
      золото: { type: 'integer', minimum: 1 },
      исходники: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['предмет', 'количество'],
          properties: {
            предмет: { type: 'string', pattern: '^assets/items/\\d{6}\\.json$' },
            количество: { type: 'integer', minimum: 1 },
          },
        },
      },
    },
  }, 'под-схема «стройка» — строгий контур (D2: предмет — ссылка на файл items)');
  assert.notEqual(oschema.additionalProperties, false,
    'особые_параметры остаётся СВОБОДНЫМ объектом (без additionalProperties:false)');
  const refd = JSON.parse(JSON.stringify(rec));
  refd.особые_параметры.стройка.исходники[0].предмет = 'assets/items/000035.json';
  assert.deepEqual(validateData(schema, refd, '000001.json'), [],
    'запись со ссылкой на файл items — валидна');
  for (const f of fs.readdirSync(DIR)
    .filter((x) => /^\d{6}\.json$/.test(x)).sort()) {
    const errs = validateData(
      schema, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), f);
    assert.deepEqual(errs, [], f + ': ошибки схемы: ' + errs.join(' | '));
  }
});

// --- Задача 000211.07: buildings: 18 спрайтов — svg-ссылки + «тренирует»
// (имена!) → ссылки на навыки (рефакторинг без смены поведения) ---
//
// Контракт: memory/000211.07-buildings-sprites-trains-refs.md: 18 записей
// (13 slot-представителей — id ВЫВОДИТСЯ из данных (map_index есть ровно
// у 13 записей) + лагерь 47 + города 51-54) получают топ-level «спрайт»
// (svg-путь = СТАРОМУ литералу в src/sprites.js, byte-идентично — ноль
// визуальных изменений); 18 школ (id 7-24) —
// «особые_параметры.тренирует» — имена на русском → ссылки
// «assets/skills/NNNNNN.json» (34 позиции, 30 уникальных целей; id
// цели = прежнему имени); schema.json — закрепление обоих свойств;
// sync — resolveSkillRef (fail-closed, 1:1 resolveItemRef); зеркало —
// id-форма (регенерация).
// КРАСНЫЕ (осмысленно, функциональность ещё не существует): «спрайт»
// в JSON отсутствует (0/18), «тренирует» — имена (0/34 под паттерн),
// свойства схемы отсутствуют, sync не резолвит skills и не
// fail-closed по ним (печатает ссылки как есть).

const SKILL_REF_RE_000211_07 = /^assets\/skills\/\d{6}\.json$/;

// Пин «спрайт» (18): id каталожной записи → СТАРОМУ литералу
// (memory §2.1.1 — ЗАКРЫТАЯ таблица в тесте, не из src/sprites.js).
const SPRITE_PIN_000211_07 = {
  1: 'assets/sprites/buildings/weapons_shop.svg',
  2: 'assets/sprites/buildings/armor_shop.svg',
  3: 'assets/sprites/buildings/apothecary.svg',
  4: 'assets/sprites/buildings/magic_shop.svg',
  7: 'assets/sprites/buildings/arena.svg',
  8: 'assets/sprites/buildings/blacksmith.svg',
  10: 'assets/sprites/buildings/archery_range.svg',
  11: 'assets/sprites/buildings/academy.svg',
  25: 'assets/sprites/buildings/npc_house.svg',
  31: 'assets/sprites/buildings/cave_entrance.svg',
  36: 'assets/sprites/buildings/temple.svg',
  40: 'assets/sprites/buildings/rune_stone.svg',
  44: 'assets/sprites/buildings/tavern.svg',
  47: 'assets/sprites/buildings/camp.svg',
  51: 'assets/sprites/cities/city_51.svg',
  52: 'assets/sprites/cities/city_52.svg',
  53: 'assets/sprites/cities/city_53.svg',
  54: 'assets/sprites/cities/city_54.svg',
};
const SLOT_REP_IDS_000211_07 =
  [1, 2, 3, 4, 7, 8, 10, 11, 25, 31, 36, 40, 44];
const SPRITE_RECORD_IDS_000211_07 =
  [...SLOT_REP_IDS_000211_07, 47, 51, 52, 53, 54];

// Пин «тренирует» (18 школ, 34 позиции): школа →
// [имя ДО, id цели, файл-цель в assets/skills]. Позиционный пин:
// порядок и дубли массива — 1:1 (детерминизм расстановки/обучения);
// 16 школ × 2 + 2 школы (9, 15) × 1 = 34.
const TRAINS_PIN_000211_07 = {
  7: [['мечник', 'swordsman', '000007'],
      ['тяжёлое оружие', 'heavy', '000008']],
  8: [['кузнечная рука', 'forge', '000010'],
      ['крепкая спина', 'back', '000011']],
  9: [['каменные кулаки', 'fists', '000009']],
  10: [['меткость', 'accuracy', '000012'],
       ['стрелок', 'archer', '000015']],
  11: [['акробатика', 'acro', '000016'],
       ['ловкий шаг', 'step', '000014']],
  12: [['тать', 'thief', '000017'],
       ['кошачий глаз', 'catseye', '000013']],
  13: [['железная кожа', 'hide', '000018'],
       ['выносливость', 'endurance', '000019']],
  14: [['голем', 'golem', '000020'],
       ['несокрушимость', 'unkill', '000022']],
  15: [['глубокий вдох', 'breath', '000021']],
  16: [['учёный', 'scholar', '000026'],
       ['рунопись', 'runes', '000027']],
  17: [['алхимик', 'alchemy', '000025'],
       ['повелитель огня', 'firelord', '000023']],
  18: [['повелитель огня', 'firelord', '000023'],
       ['повелитель льда', 'icelord', '000024']],
  19: [['медитация', 'meditation', '000029'],
       ['зоркость', 'perception', '000028']],
  20: [['старейшина', 'elder', '000032'],
       ['ясновидение', 'precog', '000030']],
  21: [['медитация', 'meditation', '000029'],
       ['сердце природы', 'nature', '000031']],
  22: [['оратор', 'orator', '000034'],
       ['артист', 'artist', '000036']],
  23: [['артист', 'artist', '000036'],
       ['оратор', 'orator', '000034']],
  24: [['предводитель', 'leader', '000035'],
       ['торговец', 'merchant', '000033']],
};
const SCHOOL_IDS_000211_07 = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
  18, 19, 20, 21, 22, 23, 24];

// Idempotent-конвертер имя → ссылка для tmp-фикстур (R4/T3):
// значение уже ссылка — как есть; имя — ссылка по пину.
function convertTrainsRefs_000211_07(record) {
  const tr = record.особые_параметры
    && record.особые_параметры.тренирует;
  if (!tr || !Array.isArray(tr)) return;
  for (let i = 0; i < tr.length; i++) {
    if (typeof tr[i] === 'string' && SKILL_REF_RE_000211_07.test(tr[i])) {
      continue;
    }
    let ref = null;
    for (const n of Object.keys(TRAINS_PIN_000211_07)) {
      for (const [nm, , file] of TRAINS_PIN_000211_07[n]) {
        if (nm === tr[i]) ref = 'assets/skills/' + file + '.json';
      }
    }
    if (ref === null) {
      throw new Error('convertTrainsRefs_000211_07: имя «'
        + tr[i] + '» нет в пине 000211.07');
    }
    tr[i] = ref;
  }
}

test('000211.07 R1: "спрайт" — ровно 18 из 54 записей (13 slot-представителей — id из данных (map_index) + лагерь 47 + города 51-54); значение = ЗАКРЫТОМУ старому литералу (byte-идентично); файл svg существует; у остальных 36 — нет (строгий контур)', () => {
  const raw = {};
  for (const f of fs.readdirSync(DIR)
    .filter((x) => /^\d{6}\.json$/.test(x)).sort()) {
    raw[parseInt(f, 10)] = JSON.parse(
      fs.readFileSync(path.join(DIR, f), 'utf8'));
  }
  assert.equal(Object.keys(raw).length, 54, 'каталог: 54 файла');
  const slotIds = Object.keys(raw).map(Number).filter((n) => {
    const p = raw[n].особые_параметры;
    return p && Number.isInteger(p.map_index);
  }).sort((a, b) => a - b);
  assert.deepEqual(slotIds,
    SLOT_REP_IDS_000211_07.slice().sort((a, b) => a - b),
    'slot-представители — ИЗ ДАННЫХ (map_index есть ровно у 13 записей): '
    + slotIds.join(', '));
  const expected = SPRITE_RECORD_IDS_000211_07.slice().sort((a, b) => a - b);
  const withSprite = Object.keys(raw).map(Number)
    .filter((n) => raw[n].спрайт !== undefined)
    .sort((a, b) => a - b);
  assert.deepEqual(withSprite, expected,
    '«спрайт» ровно у 18 записей (получено: '
    + (withSprite.join(', ') || 'НЕТ') + ')');
  for (const n of expected) {
    assert.equal(raw[n].спрайт, SPRITE_PIN_000211_07[n],
      `${n} ${raw[n].название}: «спрайт» «${raw[n].спрайт}» ≠ старому `
      + `литералу «${SPRITE_PIN_000211_07[n]}» (byte-идентично)`);
    assert.ok(fs.existsSync(path.join(__dirname, '..', raw[n].спрайт)),
      `${n}: файл svg «${raw[n].спрайт}» существует`);
  }
  for (const n of Object.keys(raw).map(Number).sort((a, b) => a - b)) {
    if (expected.includes(n)) continue;
    assert.equal(raw[n].спрайт, undefined,
      `${n} ${raw[n].название}: «спрайт» — строгий контур 18 `
      + `(получено ${JSON.stringify(raw[n].спрайт)})`);
  }
});

test('000211.07 R2: "тренирует" — 18 школ (id 7-24, строгий контур: у остальных 36 — НЕТ); ВСЕ 34 позиции — ссылки "assets/skills/NNNNNN.json" (резолвятся), id цели = ЗАКРЫТОМУ пину (позиционно), name файла-цели (lower) = имени ДО (кросс-чек против skills-каталога); отрицательный контроль: «мечника» — не имя каталога', () => {
  const pinNames = new Set();
  const pinIds = new Set();
  for (const rows of Object.values(TRAINS_PIN_000211_07)) {
    for (const [name, id] of rows) {
      pinNames.add(name);
      pinIds.add(id);
    }
  }
  assert.equal(pinNames.size, 30, 'пин: 30 уникальных имён ДО');
  assert.equal(pinIds.size, 30, 'пин: 30 уникальных целей (id)');
  assert.ok(!pinNames.has('мечника'),
    'отрицательный контроль: «мечника» — не имя каталога '
    + '(name→id нет)');
  let pos = 0;
  for (const n of SCHOOL_IDS_000211_07) {
    const j = readBuildingRaw_000207(n);
    const rows = TRAINS_PIN_000211_07[n];
    const tr = j.особые_параметры && j.особые_параметры.тренирует;
    assert.ok(Array.isArray(tr) && tr.length === rows.length,
      `${n} ${j.название}: «тренирует» — массив из ${rows.length} `
      + `(получено ${Array.isArray(tr) ? tr.length : 'НЕТ'})`);
    for (let i = 0; i < rows.length; i++) {
      const [name, id, file] = rows[i];
      const v = tr[i];
      pos += 1;
      assert.equal(typeof v, 'string',
        `${n} ${j.название}: позиция ${i} — строка `
        + `(получено ${JSON.stringify(v)})`);
      assert.ok(SKILL_REF_RE_000211_07.test(v),
        `${n} ${j.название}: позиция ${i} «${v}» — ссылка на файл `
        + 'skills (формат "assets/skills/NNNNNN.json"); получено имя '
        + '— данные не миграированы');
      assert.equal(v, 'assets/skills/' + file + '.json',
        `${n} ${j.название}: позиция ${i} — ссылка `
        + `«assets/skills/${file}.json» (позиционный пин; получено «${v}»)`);
      const r = resolveRef(path.join(__dirname, '..'), v);
      assert.ok(r.ok,
        `${n}: ссылка «${v}» не резолвится (reason: ${r.reason})`);
      assert.equal(typeof r.id, 'string',
        `${n}: id цели «${v}» — строка`);
      assert.notEqual(r.id, '', `${n}: id цели «${v}» — непустая`);
      assert.equal(r.id, id,
        `${n} ${j.название}: id цели «${r.id}» ≠ прежнему имени `
        + `«${name}» → «${id}» (пин §2.1.2)`);
      const tj = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', v), 'utf8'));
      assert.equal(String(tj.name).toLowerCase(), name,
        `${n}: name файла-цели «${tj.name}» ≠ имени ДО «${name}» `
        + '(кросс-чек против skills-каталога — задачей не меняется)');
    }
  }
  assert.equal(pos, 34,
    'позиций «тренирует» = 34 (16 школ × 2 + 2 школы × 1; '
    + 'получено ' + pos + ')');
  const raw = {};
  for (const f of fs.readdirSync(DIR)
    .filter((x) => /^\d{6}\.json$/.test(x)).sort()) {
    raw[parseInt(f, 10)] = JSON.parse(
      fs.readFileSync(path.join(DIR, f), 'utf8'));
  }
  for (const n of Object.keys(raw).map(Number).sort((a, b) => a - b)) {
    if (SCHOOL_IDS_000211_07.includes(n)) continue;
    assert.equal(raw[n].особые_параметры.тренирует, undefined,
      `${n} ${raw[n].название}: «тренирует» — строгий контур `
      + '(только школы id 7-24)');
  }
});

test('000211.07 R3: schema.json — форма новых свойств: топ-level «спрайт» (svg-паттерн) + «особые_параметры.тренирует» (массив ссылочного паттерна); required — без изменений («спрайт»/«тренирует» — НЕ required: контур 36 записей без «спрайт» остаётся валидным); top-level additionalProperties: false; «особые_параметры» — СВОБОДНЫЙ; отрицательный контроль: запись школы с ИМЕНЕМ в «тренирует» → ≥1 ошибка (pattern), со ссылкой → 0; ВСЕ 54 файлов валидны', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  assert.deepEqual(schema.properties['спрайт'], {
    type: 'string',
    pattern: '^assets/sprites/(buildings|cities)/[\\w]+\\.svg$',
  }, 'schema.json: топ-level свойство «спрайт» — точная форма '
    + '(svg-паттерн, memory §2.2.1)');
  const op = schema.properties['особые_параметры'];
  assert.deepEqual(op.properties['тренирует'], {
    type: 'array',
    minItems: 1,
    items: { type: 'string', pattern: '^assets/skills/\\d{6}\\.json$' },
  }, 'schema.json: «особые_параметры.properties.тренирует» — точная '
    + 'форма (ссылочный паттерн, memory §2.2.2)');
  assert.equal(schema.required[0], 'id',
    'required[0] = «id» — не смещён (негативный контроль '
    + 'assets-schemas цел)');
  assert.ok(!schema.required.includes('спрайт'),
    '«спрайт» — НЕ в required (36 записей без поля остаются '
    + 'валидными)');
  assert.equal(schema.additionalProperties, false,
    'top-level additionalProperties: false (расширение в том же '
    + 'коммите)');
  assert.notEqual(op.additionalProperties, false,
    '«особые_параметры» остаётся СВОБОДНЫМ объектом');
  const rec = readBuildingRaw_000207(24);
  const bad = JSON.parse(JSON.stringify(rec));
  bad.особые_параметры.тренирует = ['мечник'];
  const errBad = validateData(schema, bad, '000024.json');
  assert.ok(errBad.length >= 1,
    'запись с ИМЕНЕМ «мечник» в «тренирует» — ошибка схемы '
    + 'обязательна (получено 0 ошибок — паттерн не закреплён)');
  assert.ok(errBad.some((e) => e.includes('assets/skills')),
    'ошибка — на ссылочном паттерне «тренирует» (получено: '
    + errBad.join(' | ') + ')');
  const good = JSON.parse(JSON.stringify(rec));
  good.особые_параметры.тренирует = ['assets/skills/000035.json'];
  assert.deepEqual(validateData(schema, good, '000024.json'), [],
    'запись со ссылкой на файл skills — валидна');
  for (const f of fs.readdirSync(DIR)
    .filter((x) => /^\d{6}\.json$/.test(x)).sort()) {
    const errs = validateData(
      schema, JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')), f);
    assert.deepEqual(errs, [], f + ': ошибки схемы: ' + errs.join(' | '));
  }
});

test('000211.07 R4: sync-buildings-data.js — "тренирует"-ссылки → id при запекании (функциональный: tmp-репо: школы 7/8/10/11 со skills-ссылками + «спрайт» (закрытые пути) + 5/31 без .стройки (контур); assets/skills — цели ссылок): прогон 1 — exit 0, блок — id-форма (byte = пину), «спрайт» — as-is, НЕТ "assets/skills/"; прогон 2 — битая skills-ссылка (файл-цель отсутствует) → exit ≠ 0; прогон 3 — голое ИМЯ (дрейф) → exit ≠ 0 (fail-closed, 1:1 resolveItemRef)', () => {
  const os = require('node:os');
  const ROOT0 = path.join(__dirname, '..');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), '000211.07-r4-'));
  try {
    fs.mkdirSync(path.join(tmp, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'assets', 'buildings'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'src'), { recursive: true });
    fs.cpSync(path.join(ROOT0, 'assets', 'items'),
      path.join(tmp, 'assets', 'items'), { recursive: true });
    fs.cpSync(path.join(ROOT0, 'assets', 'skills'),
      path.join(tmp, 'assets', 'skills'), { recursive: true });
    fs.copyFileSync(path.join(ROOT0, 'scripts', 'sync-buildings-data.js'),
      path.join(tmp, 'scripts', 'sync-buildings-data.js'));
    for (const lf of fs.readdirSync(path.join(ROOT0, 'scripts', 'lib'))) {
      fs.copyFileSync(path.join(ROOT0, 'scripts', 'lib', lf),
        path.join(tmp, 'scripts', 'lib', lf));
    }
    const FIXTURE_IDS_000211_07 = [7, 8, 10, 11, 5, 31];
    for (const n of FIXTURE_IDS_000211_07) {
      const f = String(n).padStart(6, '0') + '.json';
      const j = readBuildingRaw_000207(n);
      const s = j.особые_параметры && j.особые_параметры.стройка;
      if (s) {
        const rows = REF_PIN_000207[n];
        s.исходники.forEach((e, i) => {
          e.предмет = 'assets/items/' + rows[i][2] + '.json';
        });
      }
      if (TRAINS_PIN_000211_07[n]) {
        convertTrainsRefs_000211_07(j);
      }
      if ([7, 8, 10, 11].includes(n)) {
        j.спрайт = SPRITE_PIN_000211_07[n];
      }
      fs.writeFileSync(path.join(tmp, 'assets', 'buildings', f),
        JSON.stringify(j, null, 2));
    }
    fs.writeFileSync(path.join(tmp, 'src', 'buildings.js'),
      '// ' + SYNC_HEADER_000207 + '\n'
      + BEG_000207 + '\n' + END_000207 + '\n');
    const script = path.join(tmp, 'scripts', 'sync-buildings-data.js');
    const res = spawnSync(process.execPath, [script],
      { cwd: tmp, encoding: 'utf8' });
    assert.equal(res.status, 0,
      'прогон 1 (все ссылки резолвятся): exit 0 (получено '
      + res.status + '): ' + (res.stderr || res.stdout));
    const out = fs.readFileSync(path.join(tmp, 'src', 'buildings.js'), 'utf8');
    const bIdx = out.indexOf(BEG_000207);
    const eIdx = out.indexOf(END_000207);
    assert.ok(bIdx !== -1 && eIdx > bIdx,
      'прогон 1: маркеры GENERATED на месте');
    const block = out.slice(bIdx, eIdx);
    assert.ok(!block.includes('assets/skills/'),
      'прогон 1: перегенерированный блок — id-форма (НЕТ строк '
      + '"assets/skills/" — skills-ссылки резолвятся при запекании; '
      + 'сейчас скрипт печатает ссылки как есть)');
    for (const bid of [7, 8, 10, 11]) {
      const ids = TRAINS_PIN_000211_07[bid].map((r) => r[1]);
      assert.ok(block.includes(
        'тренирует: [' + ids.map((x) => '"' + x + '"').join(', ') + ']'),
        'прогон 1: блок содержит «тренирует: [...]» школы ' + bid
        + ' в id-форме (пин 000211.07)');
      assert.ok(block.includes(
        'спрайт: "' + SPRITE_PIN_000211_07[bid] + '"'),
        'прогон 1: «спрайт» школы ' + bid
        + ' — as-is в блоке (поле-данные, не ссылка): '
        + SPRITE_PIN_000211_07[bid]);
    }
    const p7 = path.join(tmp, 'assets', 'buildings', '000007.json');
    const j7 = JSON.parse(fs.readFileSync(p7, 'utf8'));
    j7.особые_параметры.тренирует[0] = 'assets/skills/999999.json';
    fs.writeFileSync(p7, JSON.stringify(j7, null, 2));
    const res2 = spawnSync(process.execPath, [script],
      { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(res2.status, 0,
      'прогон 2 (битая skills-ссылка, файл-цель отсутствует): '
      + 'обязателен exit ≠ 0 (fail-closed); получен exit 0 — '
      + 'ссылка запекнулась бы молча');
    const j7b = JSON.parse(fs.readFileSync(p7, 'utf8'));
    j7b.особые_параметры.тренирует[0] = 'мечник';
    fs.writeFileSync(p7, JSON.stringify(j7b, null, 2));
    const res3 = spawnSync(process.execPath, [script],
      { cwd: tmp, encoding: 'utf8' });
    assert.notEqual(res3.status, 0,
      'прогон 3 (голое ИМЯ в «тренирует» — дрейф): обязателен '
      + 'exit ≠ 0 (fail-closed); получен exit 0 — имя '
      + 'запекнулось бы как данные');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
