const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TERRAIN, TERRAIN_NAMES,
  // Задача 000056 (стадия красных тестов): единая таблица террейнов ещё
  // не реализована — тесты TILE_BASE/TILE_FRAMES/visuals-схемы ниже
  // падают, пока её нет в map.js.
  TERRAIN_DATA,
  buildingCount, BUILDING_TYPES,
  MOB_GROUP_TYPES, mobGroupCount,
  createMap, syntheticPixels,
} = require('../src/map.js');
const S = require('../src/sprites.js');

const VDIR = path.join(__dirname, '..', 'assets', 'visuals');
const VSPR = path.join(__dirname, '..', 'assets', 'sprites', 'visuals');

const ROOT = path.join(__dirname, '..');
const TERRAIN_LIST = Object.values(TERRAIN);

const tick = (n = 4) => new Promise((resolve) => {
  let left = n;
  const step = () => { if (--left <= 0) resolve(); else setImmediate(step); };
  setImmediate(step);
});

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

// --- Тайлы ---

test('tileFrames: у каждого террейна есть текстура, файлы существуют', () => {
  for (const t of TERRAIN_LIST) {
    const frames = S.tileFrames(t);
    assert.ok(frames.length >= 1, `нет кадров для террейна ${t} (${TERRAIN_NAMES[t]})`);
    for (const p of frames) assert.ok(exists(p), `нет файла: ${p}`);
  }
});

test('вода анимирована 2–4 кадрами, остальные террейны — статичны', () => {
  assert.ok(S.tileFrames(TERRAIN.WATER).length >= 2 && S.tileFrames(TERRAIN.WATER).length <= 4);
  assert.ok(S.tileFrames(TERRAIN.DEEP_WATER).length >= 2 && S.tileFrames(TERRAIN.DEEP_WATER).length <= 4);
  for (const t of [
    TERRAIN.SAND, TERRAIN.GRASS, TERRAIN.FOREST,
    TERRAIN.HILL, TERRAIN.MOUNTAIN, TERRAIN.SWAMP,
  ]) {
    assert.equal(S.tileFrames(t).length, 1, `террейн ${t} должен быть статичным`);
  }
});

test('TILE_BASE: базовые цвета для всех террейнов, формат #rrggbb', () => {
  for (const t of TERRAIN_LIST) {
    assert.match(S.TILE_BASE[t], /^#[0-9a-f]{6}$/i, `нет базового цвета для террейна ${t}`);
  }
});

// --- Задача 000056: единая таблица террейнов (src/map.js) ---
//
// TILE_BASE — собственная копия hex-цветов. Решение: цвета — из единой
// таблицы TERRAIN_DATA (поле base), потребители без собственных литералов.
// Стадия красных тестов: TERRAIN_DATA ещё не экспортируется — тесты падают.

test('TILE_BASE ≡ base единой таблицы (потребитель ≡ таблица, все 8 террейнов)', () => {
  assert.ok(TERRAIN_DATA && typeof TERRAIN_DATA === 'object',
    'map.js: нет TERRAIN_DATA');
  for (const t of TERRAIN_LIST) {
    assert.equal(S.TILE_BASE[t], TERRAIN_DATA[t].base,
      `TILE_BASE[${t}] (${TERRAIN_NAMES[t]}) ≠ base таблицы`);
  }
});

test('TILE_FRAMES: ключи ≡ id таблицы (ровно 8, без лишних); файлы assets/tiles ≡ объединению путей', () => {
  // Прямое направление (террейн → файлы существуют) закрывает тест выше
  // («у каждого террейна есть текстура»); обратное — сиротских файлов
  // assets/tiles нет: на диске ровно то, что перечислено в TILE_FRAMES.
  assert.ok(TERRAIN_DATA && typeof TERRAIN_DATA === 'object',
    'map.js: нет TERRAIN_DATA');
  assert.deepEqual(
    Object.keys(S.TILE_FRAMES).map(Number).sort((a, b) => a - b),
    Object.keys(TERRAIN_DATA).map(Number).sort((a, b) => a - b),
    'ключи TILE_FRAMES ≠ id единой таблицы');
  const listed = Object.values(S.TILE_FRAMES).flat().sort();
  const onDisk = fs.readdirSync(path.join(__dirname, '..', 'assets', 'tiles'))
    .filter((f) => f.endsWith('.svg'))
    .map((f) => 'assets/tiles/' + f)
    .sort();
  assert.deepEqual(onDisk, listed, 'сиротские/отсутствующие файлы assets/tiles');
});

// --- Флогистон ---

test('Флогистон: анимации walk/attack/cast — не менее 2 кадров, файлы существуют', () => {
  for (const action of ['walk', 'attack', 'cast']) {
    const frames = S.phlogistonFrames(action);
    assert.ok(frames.length >= 2, `анимация ${action} должна состоять из >= 2 кадров`);
    for (const p of frames) assert.ok(exists(p), `нет файла: ${p}`);
  }
  assert.ok(S.phlogistonFrames('idle').length >= 1);
  assert.deepEqual(S.phlogistonFrames('нет-такого-действия'), []);
});

// --- Мобы ---

test('мобы: каждая группа — базовый тип, кадры есть, файлы существуют', () => {
  const BASIC = new Set(['orc', 'skeleton', 'wolf', 'spider', 'elemental', 'abyss']);
  for (const g of Object.values(MOB_GROUP_TYPES)) {
    if (g === MOB_GROUP_TYPES.NONE) continue;
    assert.ok(g >= 0 && g < mobGroupCount());
    const kind = S.mobKind(g);
    assert.ok(BASIC.has(kind), `у группы ${g} нет базового типа: ${kind}`);
    const frames = S.mobFrames(g);
    assert.ok(frames.length >= 2, `у группы ${g} мало кадров: ${frames.length}`);
    for (const p of frames) assert.ok(exists(p), `нет файла: ${p}`);
  }
  assert.equal(S.mobKind(MOB_GROUP_TYPES.NONE), null);
  assert.equal(S.mobKind(999), null);
  assert.deepEqual(S.mobFrames(MOB_GROUP_TYPES.NONE), []);
});

// --- Постройки ---

test('постройки: у каждого типа есть иконка, файлы существуют', () => {
  for (let b = 0; b < buildingCount(); b++) {
    const p = S.buildingSprite(b);
    assert.ok(p, `нет иконки для постройки ${b}`);
    assert.ok(exists(p), `нет файла: ${p}`);
  }
  assert.equal(S.buildingSprite(BUILDING_TYPES.NONE), null);
  assert.equal(S.buildingSprite(999), null);
});

// --- Детерминизм выбора (не зависит от загрузки) ---

test('выбор спрайтов детерминирован и не зависит от факта загрузки', () => {
  const snapshot = {
    tiles: TERRAIN_LIST.map((t) => S.tileFrames(t)),
    phlog: Object.keys(S.PHLOGISTON_ACTIONS).map((a) => S.phlogistonFrames(a)),
    mobs: Object.values(MOB_GROUP_TYPES).map((g) => S.mobFrames(g)),
    buildings: Array.from({ length: buildingCount() }, (_, b) => S.buildingSprite(b)),
  };
  // «Загружаем» всё — все ассеты падают (file:// без сети).
  const loader = S.createSpriteLoader(() => Promise.resolve(null));
  for (const p of S.allAssetPaths()) loader.queue(p);
  assert.equal(loader.readyCount(), 0);
  // Повторный выбор — тот же самый, несмотря на провал загрузки.
  const again = {
    tiles: TERRAIN_LIST.map((t) => S.tileFrames(t)),
    phlog: Object.keys(S.PHLOGISTON_ACTIONS).map((a) => S.phlogistonFrames(a)),
    mobs: Object.values(MOB_GROUP_TYPES).map((g) => S.mobFrames(g)),
    buildings: Array.from({ length: buildingCount() }, (_, b) => S.buildingSprite(b)),
  };
  assert.deepEqual(again, snapshot);
});

test('frameIndex: чистая функция (время, координаты, число кадров)', () => {
  for (let i = 0; i < 100; i++) {
    const n = 1 + Math.floor(Math.random() * 4);
    const tx = Math.floor(Math.random() * 400) - 200;
    const ty = Math.floor(Math.random() * 400) - 200;
    const now = Math.floor(Math.random() * 2e6);
    const a = S.frameIndex(now, tx, ty, n);
    assert.equal(a, S.frameIndex(now, tx, ty, n), 'повторный вызов даёт другой кадр');
    assert.ok(a >= 0 && a < n, `кадр ${a} вне [0;${n})`);
  }
});

test('frameIndex: фаза зависит от координат, соседи не синхронизированы', () => {
  const phases = new Set();
  for (let tx = 0; tx < 8; tx++) phases.add(S.frameIndex(0, tx, 0, 4));
  assert.ok(phases.size >= 2, 'все соседние тайлы в одной фазе — вода «плита»');
  assert.equal(S.frameIndex(123456, -7, 3, 4), S.frameIndex(123456, -7, 3, 4));
  assert.equal(S.frameIndex(0, 5, 5, 1), 0, 'один кадр → всегда 0');
});

test('waterFrame — синоним waterTileFrame; frameIndex для кадров воды — та же фаза', () => {
  const n = S.tileFrames(TERRAIN.WATER).length;
  for (let i = 0; i < 20; i++) {
    const tx = Math.floor(Math.random() * 100) - 50;
    const ty = Math.floor(Math.random() * 100) - 50;
    const now = Math.floor(Math.random() * 1e6);
    assert.equal(S.waterFrame(now, tx, ty, n), S.waterTileFrame(now, tx, ty, n));
    assert.equal(S.frameIndex(now, tx, ty, n), S.waterTileFrame(now, tx, ty, n),
      'frameIndex для текстуры воды должен идти через фазу волны');
  }
  assert.equal(S.waterTileFrame(0, 3, 3, 1), 0, 'один кадр → всегда 0');
  assert.equal(S.waterTileFrame(0, 3, 3, 0), 0, 'ноль кадров → 0');
});

// --- Волна на воде: синхронизация на стыках тайлов (задача 000025) ---

test('wavePhase: чистая функция (время, мировые координаты), фаза ∈ [0;1)', () => {
  for (let i = 0; i < 200; i++) {
    const now = Math.floor(Math.random() * 1e7);
    const wx = Math.floor(Math.random() * 800) - 400 + Math.random();
    const wy = Math.floor(Math.random() * 800) - 400 + Math.random();
    const a = S.wavePhase(now, wx, wy);
    assert.equal(a, S.wavePhase(now, wx, wy), 'повторный вызов даёт другую фазу');
    assert.ok(a >= 0 && a < 1, `фаза ${a} вне [0;1)`);
  }
});

test('wavePhase: периодична по времени с периодом WAVE_PERIOD_MS', () => {
  for (let i = 0; i < 20; i++) {
    const now = Math.floor(Math.random() * 1e6);
    const wx = Math.floor(Math.random() * 200) - 100 + Math.random();
    const wy = Math.floor(Math.random() * 200) - 100 + Math.random();
    assert.equal(S.wavePhase(now, wx, wy), S.wavePhase(now + S.WAVE_PERIOD_MS, wx, wy));
    assert.equal(S.wavePhase(now, wx, wy), S.wavePhase(now + 5 * S.WAVE_PERIOD_MS, wx, wy));
  }
});

test('вода: фаза точки стыка — одна для обоих соседних тайлов', () => {
  // Точка (tx + 1, wy) — граница тайлов (tx, ty) и (tx + 1, ty):
  // правый край левого тайла и левый край правого. У неё одна фаза —
  // общая для обоих тайлов. Фаза линейна по мировым координатам
  // (p = 0.5·wx + 0.5·wy − t), поэтому фаза точки стыка — середина
  // (mod 1) фаз симметричных точек, взятых изнутри каждого из двух
  // тайлов: волна на стыке принадлежит обоим тайлам сразу.
  for (let i = 0; i < 100; i++) {
    const tx = Math.floor(Math.random() * 400) - 200;
    const ty = Math.floor(Math.random() * 400) - 200;
    const now = Math.floor(Math.random() * 1e7);
    const wy = ty + Math.random();
    const wx = tx + 1;                 // мировая точка стыка
    const d = 0.25;                    // смещение внутрь каждого тайла
    const pSeam = S.wavePhase(now, wx, wy);
    const pLeft = S.wavePhase(now, wx - d, wy);   // точка из левого тайла
    const pRight = S.wavePhase(now, wx + d, wy);  // точка из правого тайла
    const step = (((pRight - pLeft) % 1) + 1) % 1;
    const mid = (pLeft + step / 2) % 1;
    const diff = (((pSeam - mid) % 1) + 1) % 1;
    assert.ok(Math.min(diff, 1 - diff) < 1e-9,
      `фаза точки стыка ${pSeam} не совпадает с общей фазой тайлов (${mid})`);
  }
});

test('вода: фаза непрерывна на стыке — переход через границу не даёт скачка', () => {
  // Старая схема (фаза от целочисленного номера тайла) прыгала на
  // каждом стыке; фаза от мировой точки меняется плавно,
  // в том числе при пересечении границы тайлов.
  for (let i = 0; i < 100; i++) {
    const tx = Math.floor(Math.random() * 400) - 200;
    const ty = Math.floor(Math.random() * 400) - 200;
    const now = Math.floor(Math.random() * 1e7);
    const wy = ty + Math.random();
    const wx = tx + 1;
    const eps = 1e-6;
    const pL = S.wavePhase(now, wx - eps, wy);
    const pR = S.wavePhase(now, wx + eps, wy);
    const d = Math.abs(pL - pR);
    assert.ok(Math.min(d, 1 - d) < 1e-3,
      `скачок фазы на стыке ${d} (тайлы ${tx},${ty} / ${tx + 1},${ty})`);
  }
});

test('вода: на стыке соседних тайлов волна не рвётся', () => {
  // Период волны в текстуре — 16px, сдвиг кадра — 8px.
  // Горизонтальный стык: сдвиг волны на правом крае левого тайла и
  // левом крае правого должен совпадать по модулю периода.
  const STEP = 8, PERIOD = 16;
  const n = S.tileFrames(TERRAIN.WATER).length;
  for (let i = 0; i < 100; i++) {
    const tx = Math.floor(Math.random() * 400) - 200;
    const ty = Math.floor(Math.random() * 400) - 200;
    const now = Math.floor(Math.random() * 1e7);
    const fA = S.waterTileFrame(now, tx, ty, n);
    const fR = S.waterTileFrame(now, tx + 1, ty, n); // сосед по X
    const fD = S.waterTileFrame(now, tx, ty + 1, n); // сосед по Y
    const dShift = (((fR - fA) * STEP) % PERIOD + PERIOD) % PERIOD;
    assert.equal(dShift, 0,
      `разрыв волны на стыке: разность сдвигов ${(fR - fA) * STEP}px (кадры ${fA} → ${fR})`);
    // Свойство фазы: разность кадров соседей (в обе стороны) чётная —
    // соседи «в фазе» или со сдвигом ровно на целый период волны.
    assert.equal(((fR - fA) % 2 + 2) % 2, 0, 'нечётная разность кадров у соседей по X');
    assert.equal(((fD - fA) % 2 + 2) % 2, 0, 'нечётная разность кадров у соседей по Y');
  }
});

test('вода: в каждый момент эффективный сдвиг волны одинаков на всей карте', () => {
  // Следствие чётной разности кадров: по модулю периода волны все
  // водяные тайлы показывают один и тот же сдвиг — море без швов.
  const STEP = 8, PERIOD = 16;
  const n = S.tileFrames(TERRAIN.WATER).length;
  for (let i = 0; i < 20; i++) {
    const now = Math.floor(Math.random() * 1e7);
    let shift = null;
    for (let tx = -10; tx < 10; tx++) {
      for (let ty = -10; ty < 10; ty++) {
        const s = (S.waterTileFrame(now, tx, ty, n) * STEP) % PERIOD;
        if (shift === null) shift = s;
        assert.equal(s, shift, `сдвиг ${s} != ${shift} на тайле (${tx},${ty})`);
      }
    }
  }
});

// --- Загрузчик (Dependency Injection) ---

test('createSpriteLoader: успех, провал, идемпотентная queue', async () => {
  const fail = new Set(['bad.svg']);
  const loader = S.createSpriteLoader(
    (p) => Promise.resolve(fail.has(p) ? null : { path: p }));
  const e1 = loader.queue('a.svg');
  const e2 = loader.queue('a.svg');
  assert.equal(e1, e2, 'повторный queue возвращает тот же entry');
  loader.queue('bad.svg');
  await tick();
  assert.equal(loader.isReady('a.svg'), true);
  assert.deepEqual(loader.image('a.svg'), { path: 'a.svg' });
  assert.equal(loader.isReady('bad.svg'), false, 'провал загрузки → не ready');
  assert.equal(loader.image('bad.svg'), null, 'провал загрузки → null (фолбэк)');
  assert.equal(loader.readyCount(), 1);
  assert.equal(loader.totalCount(), 2);
  assert.equal(loader.isReady('not-queued.svg'), false);
});

test('createSpriteLoader: отклонённый Promise не роняет игру', async () => {
  const loader = S.createSpriteLoader(() => Promise.reject(new Error('нет сети')));
  loader.queue('x.svg');
  await tick();
  assert.equal(loader.isReady('x.svg'), false);
  assert.equal(loader.image('x.svg'), null);
});

// --- Интеграция: полный набор ассетов ---

test('allAssetPaths: без дублей, все файлы существуют в assets/', () => {
  const paths = S.allAssetPaths();
  assert.ok(paths.length >= 40, `мало ассетов: ${paths.length}`);
  const set = new Set(paths);
  assert.equal(set.size, paths.length, 'дубли в списке ассетов');
  for (const p of paths) assert.ok(exists(p), `нет файла: ${p}`);
});

test('критерий: ассеты не влияют на генерацию мира (детерминизм сохранён)', () => {
  const px = syntheticPixels(8, 8, 10, 200, 30, 255);
  const m1 = createMap(px);
  const sample = [];
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * 400) - 200;
    const y = Math.floor(Math.random() * 400) - 200;
    sample.push(m1.tileAt(x, y));
  }
  // «Загружаем» (с провалом) все ассеты — мир не должен измениться.
  const loader = S.createSpriteLoader(() => Promise.resolve(null));
  for (const p of S.allAssetPaths()) loader.queue(p);
  const m2 = createMap(px);
  for (const t of sample) {
    const live = m2.tileAt(t.x, t.y);
    assert.deepEqual(live, t);
  }
  assert.ok(loader.readyCount() === 0, 'проверка не должна оставлять «загруженные» ассеты в мире');
});

// --- Декорации тайлов (задача 000021) ---

test('visuals: 13 элементов, id = номер файла, нет дублей id и спрайтов', () => {
  assert.equal(S.VISUALS.length, 13);
  const ids = new Set(), sprites = new Set();
  for (let i = 0; i < S.VISUALS.length; i++) {
    const v = S.VISUALS[i];
    assert.equal(v.id, i + 1, 'id = позиция в каталоге + 1');
    assert.ok(ids.add(v.id), `дубль id=${v.id}`);
    assert.ok(sprites.add(v.спрайт), `дубль спрайта ${v.спрайт}`);
  }
});

test('visuals: каждый террейн (кроме глубокой воды) имеет хотя бы один элемент', () => {
  const covered = new Set();
  for (const v of S.VISUALS) for (const t of v.террейны) covered.add(t);
  for (const t of Object.values(TERRAIN)) {
    if (t === TERRAIN.DEEP_WATER) continue; // глубокая вода — без декораций (по дизайну)
    assert.ok(covered.has(TERRAIN_NAMES[t]), `нет элементов для «${TERRAIN_NAMES[t]}»`);
  }
});

test('visuals: файлы JSON совпадают с JS-каталогом и проходят схему', () => {
  const files = fs.readdirSync(VDIR).filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, S.VISUALS.length, 'число файлов = каталог');
  const schema = JSON.parse(fs.readFileSync(path.join(VDIR, 'schema.json'), 'utf8'));
  for (let i = 0; i < files.length; i++) {
    const num = String(i + 1).padStart(6, '0');
    assert.equal(files[i], num + '.json', `файл ${files[i]} вместо ${num}.json`);
    const fromFile = JSON.parse(fs.readFileSync(path.join(VDIR, files[i]), 'utf8'));
    assert.equal(fromFile.id, i + 1, 'id = номер файла');
    assert.deepEqual(fromFile, S.VISUALS[i], `${num}.json совпадает с JS-каталогом`);
    // Мини-валидация по schema.json (без внешних зависимостей).
    assertVisualAgainstSchema(fromFile, schema, num);
  }
});

test('visuals (000056): enum «террейны» схемы ≡ ВСЕМ именам единой таблицы; террейны 13 файлов ⊆ имён таблицы', () => {
  // Пятая копия имён террейнов (enum assets/visuals/schema.json — все 8,
  // включая горы/воду/глубокая вода) связывается с ЕДИНОЙ таблицей.
  // Только тесты: схема, данные и VISUALS (территория 000059) не меняются.
  assert.ok(TERRAIN_DATA && typeof TERRAIN_DATA === 'object',
    'map.js: нет TERRAIN_DATA');
  const allNames = new Set(
    Object.keys(TERRAIN_DATA).map(Number).map((id) => TERRAIN_DATA[id].name));
  const schema = JSON.parse(fs.readFileSync(path.join(VDIR, 'schema.json'), 'utf8'));
  const enumNames = schema.properties['террейны'].items.enum;
  assert.deepEqual(enumNames.slice().sort(), [...allNames].sort(),
    'enum «террейны» ≠ именам единой таблицы');
  const files = fs.readdirSync(VDIR).filter((f) => /^\d{6}\.json$/.test(f)).sort();
  for (const f of files) {
    const v = JSON.parse(fs.readFileSync(path.join(VDIR, f), 'utf8'));
    for (const t of v.террейны) {
      assert.ok(allNames.has(t), `${f}: террейн «${t}» отсутствует в единой таблице`);
    }
  }
});

// Проверка объекта против JSON-схемы (подмножество, нужное visuals).
function assertVisualAgainstSchema(v, schema, label) {
  assert.equal(schema.type, 'object', label + ': schema.type');
  for (const req of schema.required) assert.ok(req in v, `${label}: нет «${req}»`);
  if (schema.additionalProperties === false) {
    for (const k of Object.keys(v)) {
      assert.ok(schema.properties[k], `${label}: лишнее поле «${k}»`);
    }
  }
  const p = schema.properties;
  assert.ok(Number.isInteger(v.id) && v.id >= p.id.minimum && v.id <= p.id.maximum, label + ': id');
  assert.ok(typeof v.название === 'string' && new RegExp(p.название.pattern).test(v.название), label + ': название');
  assert.ok(Array.isArray(v.террейны) && v.террейны.length >= p.террейны.minItems, label + ': террейны');
  for (const t of v.террейны) assert.ok(p.террейны.items.enum.includes(t), `${label}: террейн «${t}»`);
  assert.ok(new RegExp(p.спрайт.pattern).test(v.спрайт), label + ': спрайт-путь');
  assert.ok(typeof v.частота === 'number' && v.частота >= p.частота.minimum && v.частота <= p.частота.maximum, label + ': частота');
  assert.ok(typeof v.размер === 'number' && v.размер >= p.размер.minimum && v.размер <= p.размер.maximum, label + ': размер');
}

test('visuals: спрайт-файлы существуют и лежат в assets/sprites/visuals', () => {
  for (const v of S.VISUALS) {
    const rel = path.basename(v.спрайт);
    assert.ok(exists(v.спрайт), `нет файла: ${v.спрайт}`);
    assert.ok(fs.existsSync(path.join(VSPR, rel)), `${rel} не в assets/sprites/visuals`);
  }
});

test('tileVisuals: чистая функция, элементы валидны и с потолком', () => {
  const byId = new Map(S.VISUALS.map((v) => [v.id, v]));
  for (let i = 0; i < 300; i++) {
    const tx = Math.floor(Math.random() * 400) - 200;
    const ty = Math.floor(Math.random() * 400) - 200;
    const terrain = TERRAIN_LIST[Math.floor(Math.random() * TERRAIN_LIST.length)];
    const a = S.tileVisuals(tx, ty, terrain);
    assert.deepEqual(a, S.tileVisuals(tx, ty, terrain), 'повторный вызов даёт другой набор');
    assert.ok(a.length <= S.MAX_VISUALS_PER_TILE, `больше потолка: ${a.length}`);
    const seen = new Set();
    for (const e of a) {
      const v = byId.get(e.id);
      assert.ok(v, `неизвестный элемент id=${e.id}`);
      assert.equal(e.sprite, v.спрайт, 'спрайт не из каталога');
      assert.ok(v.террейны.includes(TERRAIN_NAMES[terrain]), 'элемент не для этого террейна');
      assert.ok(e.x >= 0.08 && e.x <= 0.92, `x=${e.x} вне тайла`);
      assert.ok(e.y >= 0.08 && e.y <= 0.92, `y=${e.y} вне тайла`);
      assert.equal(e.size, v.размер, 'размер не из каталога');
      assert.ok(seen.add(e.id), `дубль элемента id=${e.id} на тайле`);
    }
  }
});

test('tileVisuals: частота элемента id=1 близка к заявленной', () => {
  const byId = new Map(S.VISUALS.map((v) => [v.id, v]));
  const N = 4000;
  let hits = 0;
  for (let i = 0; i < N; i++) {
    // Трава: элемент id=1 первый в каталоге — потолок его не режет.
    const set = S.tileVisuals(Math.floor(Math.random() * 100000) - 50000,
      Math.floor(Math.random() * 100000) - 50000, TERRAIN.GRASS);
    if (set.some((e) => e.id === 1)) hits++;
  }
  const f1 = hits / N;
  assert.ok(Math.abs(f1 - byId.get(1).частота) < 0.05,
    `частота id=1 ≈ ${f1.toFixed(3)}, ждали ~${byId.get(1).частота}`);
});

test('tileVisuals: разные тайлы дают разные наборы (не «штамп»)', () => {
  const sigs = new Set();
  for (let i = 0; i < 200; i++) {
    const tx = Math.floor(Math.random() * 2000) - 1000;
    const ty = Math.floor(Math.random() * 2000) - 1000;
    sigs.add(JSON.stringify(S.tileVisuals(tx, ty, TERRAIN.GRASS)));
  }
  assert.ok(sigs.size >= 50, `слишком мало вариантов декораций: ${sigs.size}`);
});

test('критерий: декорации не влияют на генерацию мира', () => {
  const m1 = createMap();
  const sample = [];
  for (let i = 0; i < 200; i++) {
    const x = Math.floor(Math.random() * 400) - 200;
    const y = Math.floor(Math.random() * 400) - 200;
    sample.push(m1.tileAt(x, y));
  }
  // «Загружаем» (с провалом) все ассеты, включая декорации.
  const loader = S.createSpriteLoader(() => Promise.resolve(null));
  for (const p of S.allAssetPaths()) loader.queue(p);
  const m2 = createMap();
  for (const t of sample) {
    assert.deepEqual(m2.tileAt(t.x, t.y), t, 'мир изменился после запроса декораций');
  }
});

// --- Цвет полосы HP (задача 000038) ---
//
// Зафиксированное решение по границам: frac >= 0.5 → зелёный,
// frac >= 0.2 → жёлтый, иначе красный — границы «включены сверху»
// (ровно 0.5 — зелёный, ровно 0.2 — жёлтый). Литералы 0.5/0.2 в
// тесте и в пороге функции — те же двойки IEEE-754, сравнение
// стабильно (напр. 8/40 даёт ровно двойку литерала 0.2).
// Цвета — из палитры игры: #6fdc6f (мобы), #e0b13c (swarm),
// #d9483b (melee).

test('hpBarColor: пороги и зафиксированные границы (000038)', () => {
  assert.equal(S.hpBarColor(1), '#6fdc6f');
  assert.equal(S.hpBarColor(0.6), '#6fdc6f');
  assert.equal(S.hpBarColor(0.5), '#6fdc6f', 'ровно 0.5 — зелёный (граница включена)');
  assert.equal(S.hpBarColor(0.4), '#e0b13c');
  assert.equal(S.hpBarColor(0.21), '#e0b13c');
  assert.equal(S.hpBarColor(0.2), '#e0b13c', 'ровно 0.2 — жёлтый (граница включена)');
  assert.equal(S.hpBarColor(0.19), '#d9483b');
  assert.equal(S.hpBarColor(0), '#d9483b');
});

test('hpBarColor: frac вне [0,1] — clamp, NaN/Infinity не ломают', () => {
  assert.equal(S.hpBarColor(1.5), '#6fdc6f', '> 1 — clamp к 1');
  assert.equal(S.hpBarColor(-0.3), '#d9483b', '< 0 — clamp к 0');
  assert.equal(S.hpBarColor(NaN), '#d9483b', 'NaN — красный (frac 0), без исключений');
  assert.equal(S.hpBarColor(Infinity), '#6fdc6f', '+Infinity — clamp к 1');
  assert.equal(S.hpBarColor(-Infinity), '#d9483b', '-Infinity — clamp к 0');
});

// --- Фоны поля боя (задача 000049) ---
//
// Состав 11 файлов: assets/combat/bg/{sand,grass,forest,hill,swamp,
// cave,crypt,ruins,drowned,abyss,plain}.svg. Пропускаемые террейны
// перечислены ЯВНО: map.js НЕ экспортирует PASSABLE (в exports:
// TERRAIN, TERRAIN_NAMES, BUILDING_*, MOB_GROUP_*, ZOOM_*, createMap,
// syntheticPixels, visibleTileRange, createTileCache, hash2) —
// сверить с PASSABLE в src/map.js при изменении.
const BG_DIR = 'assets/combat/bg/';
const PASSABLE_TERRAINS = [
  TERRAIN.SAND, TERRAIN.GRASS, TERRAIN.FOREST, TERRAIN.HILL, TERRAIN.SWAMP,
];
const BG_TERRAIN_FILES = ['sand', 'grass', 'forest', 'hill', 'swamp'];
const BG_DUNGEON_FILES = ['cave', 'crypt', 'ruins', 'drowned', 'abyss'];
const ALL_BG_FILES = [...BG_TERRAIN_FILES, ...BG_DUNGEON_FILES, 'plain'];

test('combatBackground: каждый проходимый террейн — свой файл', () => {
  for (const [t, name] of PASSABLE_TERRAINS.map((t, i) => [t, BG_TERRAIN_FILES[i]])) {
    assert.equal(S.combatBackground({ terrain: t }),
      BG_DIR + name + '.svg', `террейн ${t} (${TERRAIN_NAMES[t]})`);
  }
});

test('combatBackground: каждый DUNGEON_TYPES — свой файл, зеркало в синхроне', () => {
  const D = require('../src/dungeon.js');
  assert.ok(D.DUNGEON_TYPES, 'dungeon.js экспортирует DUNGEON_TYPES');
  assert.equal(Object.keys(D.DUNGEON_TYPES).length, 5, '5 типов подземелий');
  for (const [name, val] of Object.entries(D.DUNGEON_TYPES)) {
    assert.ok(val >= 0 && val < 5, `${name} = ${val} вне [0;5)`);
    assert.equal(S.combatBackground({ dungeon: val }),
      BG_DIR + BG_DUNGEON_FILES[val] + '.svg', `подземелье ${name} (${val})`);
  }
  // COMBAT_BG_DUNGEON — ЛИТЕРАЛЬНОЕ зеркало DUNGEON_TYPES (sprites.js
  // не зависит от dungeon.js — см. комментарий в sprites.js): ключи —
  // те же 5 чисел, значения — ожидаемые имена файлов.
  assert.deepEqual(
    Object.keys(S.COMBAT_BG_DUNGEON).map(Number).sort((a, b) => a - b),
    Object.values(D.DUNGEON_TYPES).slice().sort((a, b) => a - b),
    'ключи зеркала ≠ значения DUNGEON_TYPES');
  for (const [name, val] of Object.entries(D.DUNGEON_TYPES)) {
    assert.equal(S.COMBAT_BG_DUNGEON[val], BG_DUNGEON_FILES[val],
      `зеркало рассинхронизировано: ${name}`);
  }
});

test('combatBackground: неизвестный/пустой/непроходимый — plain.svg, чистота', () => {
  const plain = BG_DIR + 'plain.svg';
  for (const bg of [
    {}, null, undefined,
    { terrain: 99 }, { dungeon: 99 }, { terrain: -1 },
    // Вода/глубокая вода/горы — непроходимы, боя там нет (дизайн) →
    // осознанный фолбэк plain.svg.
    { terrain: TERRAIN.WATER },
    { terrain: TERRAIN.DEEP_WATER },
    { terrain: TERRAIN.MOUNTAIN },
    { foo: 1 },
  ]) {
    assert.equal(S.combatBackground(bg), plain,
      `фолбэк для ${JSON.stringify(bg)}`);
  }
  // Чистая функция: повторный вызов — тот же результат.
  assert.equal(S.combatBackground({ terrain: TERRAIN.GRASS }),
    S.combatBackground({ terrain: TERRAIN.GRASS }));
  // terrain приоритетнее dungeon, если заданы оба (зафиксированное
  // поведение — main.js передаёт либо то, либо другое).
  assert.equal(S.combatBackground({ terrain: TERRAIN.SAND, dungeon: 4 }),
    BG_DIR + 'sand.svg');
});

test('combatBackground: allAssetPaths содержит все 11 путей, файлы существуют', () => {
  const paths = S.allAssetPaths();
  for (const name of ALL_BG_FILES) {
    const p = BG_DIR + name + '.svg';
    assert.ok(paths.includes(p), `нет пути в allAssetPaths: ${p}`);
    assert.ok(exists(p), `нет файла: ${p}`);
  }
});

test('gen-combat-bg: генератор детерминирован, состав = 11 ожидаемых ключей', () => {
  const { BACKGROUNDS, buildCombatBackground } =
    require('../scripts/gen-combat-bg.js');
  assert.deepEqual(BACKGROUNDS.map((b) => b.key).sort(),
    [...ALL_BG_FILES].sort(), 'состав генератора ≠ 11 фонов');
  for (const bg of BACKGROUNDS) {
    // Повторный build — byte-identical (сид фиксирован, порядок стабилен).
    assert.equal(buildCombatBackground(bg), buildCombatBackground(bg),
      `генерация ${bg.key} недетерминирована`);
    assert.ok(buildCombatBackground(bg).includes('viewBox="0 0 336 336"'),
      `${bg.key}: viewBox 336×336 (7×7×48 px)`);
  }
});

// --- Боевые мобы: базовый спрайт-вид (задача 000047) ---
//
// mobSpriteKind — чистая функция: mobId из MOB_TYPES (combat.js) →
// базовый вид MOB_FRAMES ('orc'|'skeleton'|'wolf'|'spider'|
// 'elemental'|'abyss') или null. Таблица — литерал в sprites.js
// (зависимости на combat.js нет — нет цикла), равноценность с
// фактическими id MOB_TYPES закрепляется здесь (тест импортирует
// combat.js напрямую в node).

const C = require('../src/combat.js');

test('mobSpriteKind: все id MOB_TYPES (36) → только валидные виды MOB_FRAMES', () => {
  const ids = Object.keys(C.MOB_TYPES);
  assert.equal(ids.length, 36, 'MOB_TYPES — ровно 36 мобов');
  const kinds = Object.keys(S.MOB_FRAMES);
  assert.equal(kinds.length, 6, 'базовых видов — 6');
  for (const id of ids) {
    const k = S.mobSpriteKind(id);
    assert.ok(kinds.includes(k), `${id} → невалидный вид: ${k}`);
    for (const p of S.MOB_FRAMES[k]) {
      assert.ok(exists(p), `${id}: нет файла кадра ${p}`);
    }
  }
  // В таблице нет «лишних» видов (все значения ∈ ключей MOB_FRAMES).
  for (const k of Object.values(S.MOB_SPRITE_KINDS)) {
    assert.ok(kinds.includes(k), `в таблице неизвестный вид: ${k}`);
  }
});

test('mobSpriteKind: точечные проверки по семействам (8+7+5+5+8+3 = 36)', () => {
  const expect = {
    orc: ['orc_grunt', 'orc_warrior', 'orc_archer', 'orc_shaman',
          'orc_rider', 'orc_mad', 'orc_captain', 'orc_chief'],
    skeleton: ['skeleton', 'skeleton_archer', 'crawling_bones', 'giant_larva',
               'vampire', 'rot', 'bone_coloss'],
    wolf: ['wolf', 'wolf_pack', 'boar', 'cave_bear', 'troll'],
    spider: ['spider', 'ant', 'ant_queen', 'scorpion', 'centipede'],
    elemental: ['fire_elemental', 'water_elemental', 'wind_elemental',
                'earth_elemental', 'imp', 'salamander', 'fairy', 'stone_golem'],
    abyss: ['lower_demon', 'succubus', 'abomination'],
  };
  const total = [];
  for (const [kind, ids] of Object.entries(expect)) {
    for (const id of ids) {
      assert.equal(S.mobSpriteKind(id), kind, `${id} → ${kind}`);
      total.push(id);
    }
  }
  assert.equal(total.length, 36, 'таблица покрывает все 36 id');
  // Покрытие совпадает с MOB_TYPES 1:1 (ни пропусков, ни лишнего).
  assert.deepEqual(total.slice().sort(), Object.keys(C.MOB_TYPES).sort(),
    'таблица ≠ составу MOB_TYPES');
});

test('mobSpriteKind: неизвестный id → null, чистота', () => {
  for (const id of ['no_such_mob', '', null, undefined, 999, 'WOLF', 'orc_chief ']) {
    assert.equal(S.mobSpriteKind(id), null, `unknown: ${String(id)}`);
  }
  // Чистая функция: повторный вызов — тот же результат.
  for (const id of ['wolf', 'bone_coloss', 'abomination']) {
    assert.equal(S.mobSpriteKind(id), S.mobSpriteKind(id),
      `чистота: ${id}`);
  }
});

// --- Рендер декораций (задача 000039) ---
//
// Задача 000021 подготовила данные и чистое ядро (tileVisuals, каталог,
// спрайты — покрыто выше); 000039 подключает рендер в drawSprites
// (src/main.js). Поведение рендера закреплено vm-тестом
// tests/main-visuals.test.js (вся цепочка index.html в песочнице);
// здесь — порог зума и чистая геометрия элемента в node.

test('VISUALS_MIN_ZOOM = 24 (000039): порог отрисовки декораций', () => {
  // ТЗ: «при тормозах ограничить отрисовку декораций зумом (не рисовать
  // при zoom < 24)». Порог — именованная константа с фиксированным
  // значением: main.js НЕ рисует слой декораций ниже него (при малом
  // зуме видимых тайлов explode, и по-тайловый проход дорог).
  assert.equal(S.VISUALS_MIN_ZOOM, 24);
});

test('visualDrawRect: центр (sx + e.x*zoom, sy + e.y*zoom), сторона e.size*zoom (000039)', () => {
  // Чистая геометрия элемента декорации для drawImage: e.x/e.y — ЦЕНТР
  // элемента (доли тайла [0.08; 0.92]), НЕ левый верхний угол, поэтому
  // прямоугольник drawImage начинается в (центр − s/2, центр − s/2)
  // (без −s/2 сдвиг до ~10 px при ZOOM_START = 80, max размер 0.26 —
  // элементы вылезали бы за тайл). sx/sy — левый верхний угол тайла
  // на экране (toX/toY в drawSprites), s = e.size * zoom.
  const e = { id: 1, sprite: 'x.svg', x: 0.3, y: 0.7, size: 0.2 };
  const r = S.visualDrawRect(e, 100, 200, 80);
  assert.equal(r.size, 0.2 * 80, 'сторона = e.size * zoom');
  assert.equal(r.x, 100 + 0.3 * 80 - 0.2 * 80 / 2,
    'x = sx + e.x*zoom − s/2 (центрирование)');
  assert.equal(r.y, 200 + 0.7 * 80 - 0.2 * 80 / 2,
    'y = sy + e.y*zoom − s/2 (центрирование)');
  // Центр тайла (0.5, 0.5): элемент ровно по центру тайла.
  const c = S.visualDrawRect({ x: 0.5, y: 0.5, size: 0.4 }, 0, 0, 50);
  assert.equal(c.size, 20, 'сторона 0.4*50');
  assert.equal(c.x, 0 + 0.5 * 50 - 20 / 2, 'x — по центру тайла');
  assert.equal(c.y, 0 + 0.5 * 50 - 20 / 2, 'y — по центру тайла');
});

// --- Задача 000058: зеркало фонов боя заземлено на каталог assets/dungeons ---
//
// COMBAT_BG_DUNGEON остаётся литеральным зеркалом (sprites.js НЕ тянет
// dungeon.js и не грузит data-модули — vm-песочница combat-ui, 000049),
// но source of truth становится каталог: порядок файлов 000001..000005
// (id 0..4) обязан совпадать с порядком bg-файлов — перенумерация
// каталога сдвинет фоны боя.
test('COMBAT_BG_DUNGEON ≡ каталог assets/dungeons: порядок файлов ↔ id ↔ bg-файлы', () => {
  const DDIR = path.join(ROOT, 'assets', 'dungeons');
  const files = fs.readdirSync(DDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
  assert.deepEqual(files, [
    '000001.json', '000002.json', '000003.json', '000004.json', '000005.json',
  ], 'в каталоге ровно 5 файлов подряд');
  // Порядок slug-файлов фонов боя — по id (000049).
  const slugs = ['cave', 'crypt', 'ruins', 'drowned', 'abyss'];
  const ids = [];
  files.forEach((f, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(DDIR, f), 'utf8'));
    assert.equal(data.id, i, `${f}: id ≠ порядковому номеру файла (0..4)`);
    ids.push(data.id);
    assert.equal(S.COMBAT_BG_DUNGEON[data.id], slugs[i],
      `зеркало рассинхронизировано с каталогом: ${f} ↔ ${slugs[i]}.svg`);
    assert.equal(S.combatBackground({ dungeon: data.id }),
      BG_DIR + slugs[i] + '.svg', `combatBackground(dungeon: ${data.id})`);
    assert.ok(exists(BG_DIR + slugs[i] + '.svg'),
      `нет файла фона боя: ${slugs[i]}.svg`);
  });
  assert.deepEqual(ids, [0, 1, 2, 3, 4], 'множество id каталога ≠ {0..4}');
});

// --- Персональный арт мобов (задача 000062) ---
//
// Таблица в sprites.js — литерал (зеркало combat.js арта не содержит,
// см. комментарий в src/sprites.js). Расхождение таблицы с JSON-
// каталогом ловят два теста: здесь (пути из «art» == пути из
// mobArtFrames, файлы существуют) и в mob-art.test.js (структура
// самих SVG).

const MOBS_JSON_DIR = path.join(ROOT, 'assets', 'mobs');

function mobJsons() {
  return fs.readdirSync(MOBS_JSON_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(
      fs.readFileSync(path.join(MOBS_JSON_DIR, f), 'utf8')))
    .sort((a, b) => a.id < b.id ? -1 : 1);
}

test('mobArtFrames: все 36 id → move 2 / attack 2 / dead 1, файлы существуют', () => {
  const ids = Object.keys(C.MOB_TYPES);
  assert.equal(ids.length, 36, 'MOB_TYPES — 36 мобов');
  assert.deepEqual(Object.keys(S.MOB_ART_FRAME_COUNTS),
    ['move', 'attack', 'dead'], 'действия арта: move/attack/dead');
  assert.equal(S.MOB_ART_FRAME_COUNTS.move, 2, 'move — 2 кадра');
  assert.equal(S.MOB_ART_FRAME_COUNTS.attack, 2, 'attack — 2 кадра');
  assert.equal(S.MOB_ART_FRAME_COUNTS.dead, 1, 'dead — 1 кадр');
  for (const id of ids) {
    const mv = S.mobArtFrames(id, 'move');
    const at = S.mobArtFrames(id, 'attack');
    const dd = S.mobArtFrames(id, 'dead');
    assert.deepEqual(mv, [
      `assets/sprites/mobs/${id}_move_1.svg`,
      `assets/sprites/mobs/${id}_move_2.svg`,
    ], `${id}: move`);
    assert.deepEqual(at, [
      `assets/sprites/mobs/${id}_attack_1.svg`,
      `assets/sprites/mobs/${id}_attack_2.svg`,
    ], `${id}: attack`);
    assert.deepEqual(dd, [
      `assets/sprites/mobs/${id}_dead_1.svg`,
    ], `${id}: dead`);
    for (const p of mv.concat(at, dd)) {
      assert.ok(exists(p), `${id}: нет файла ${p}`);
    }
  }
});

test('mobArtFrames: неизвестный id/действие → [] (фолбэк на базовые 6 видов)', () => {
  for (const id of ['no_such_mob', '', null, undefined, 'WOLF', 'orc_chief ']) {
    for (const a of ['move', 'attack', 'dead']) {
      assert.deepEqual(S.mobArtFrames(id, a), [], `unknown id ${String(id)}`);
    }
  }
  for (const a of ['idle', 'walk', '', null, 5]) {
    assert.deepEqual(S.mobArtFrames('wolf', a), [], `unknown action ${String(a)}`);
  }
});

test('mobArtFrames: «art» из JSON-каталога == таблице (source of truth)', () => {
  const jsons = mobJsons();
  assert.equal(jsons.length, 36, 'JSON-каталог — 36 мобов');
  for (const j of jsons) {
    for (const a of ['move', 'attack', 'dead']) {
      assert.deepEqual(j.art[a], S.mobArtFrames(j.id, a),
        `${j.id}: JSON-art.${a} ≠ mobArtFrames`);
    }
  }
});

test('allAssetPaths: содержит все 180 путей персонального арта', () => {
  const paths = S.allAssetPaths();
  let n = 0;
  for (const id of Object.keys(C.MOB_TYPES)) {
    for (const a of ['move', 'attack', 'dead']) {
      for (const p of S.mobArtFrames(id, a)) {
        assert.ok(paths.includes(p), `нет в allAssetPaths: ${p}`);
        n++;
      }
    }
  }
  assert.equal(n, 36 * 5, '180 путей (36 × (2+2+1))');
  // Старые базовые 6 видов (12 файлов) — на месте, фолбэк жив.
  for (const frames of Object.values(S.MOB_FRAMES)) {
    for (const p of frames) assert.ok(paths.includes(p), 'базовый вид потерялся: ' + p);
  }
});

// --- Задача 000057: группы мобов — из каталога assets/mob_groups ---
//
// MOB_KINDS (groupType → базовый спрайт-вид) уходит в каталог
// (поле «спрайт», id − 1 = тип). sprites.js НЕ требует combat.js/
// dungeon.js (паттерн 000049); vm-песочницы (combat-ui) грузят
// sprites.js БЕЗ mob-groups-data.js — гард обязан дать фолбэк
// (ровно текущие 7 видов).

const vmS = require('node:vm');
function loadInSandbox(file, sandbox) {
  const code = fs.readFileSync(path.join(ROOT, 'src', file), 'utf8');
  vmS.runInNewContext(code, sandbox);
}

test('vm без каталога mob_groups: фолбэк MOB_KINDS — ровно текущие 7 видов (гард)', () => {
  // vm-песочница combat-ui: sprites.js грузится без данных модуля —
  // таблица не падает и не уезжает (прецедент 000055: фолбэк =
  // значения master).
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  loadInSandbox('sprites.js', sandbox);
  const G = sandbox.Game;
  assert.equal(G.MOB_KINDS[0], 'orc', 'фолбэк вид 0');
  assert.equal(G.MOB_KINDS[1], 'orc', 'фолбэк вид 1');
  assert.equal(G.MOB_KINDS[2], 'skeleton', 'фолбэк вид 2');
  assert.equal(G.MOB_KINDS[3], 'wolf', 'фолбэк вид 3');
  assert.equal(G.MOB_KINDS[4], 'spider', 'фолбэк вид 4');
  assert.equal(G.MOB_KINDS[5], 'elemental', 'фолбэк вид 5');
  assert.equal(G.MOB_KINDS[6], 'abyss', 'фолбэк вид 6');
  assert.equal(G.mobKind(0), 'orc', 'mobKind через фолбэк');
  assert.equal(G.mobKind(999), null, 'вне диапазона — null');
});

test('vm: MobGroupsData ДО загрузки sprites.js — виды из каталога (не фолбэк)', () => {
  // Каталог — source of truth: искажённый каталог (группа 0 —
  // 'spider', фолбэк — 'orc') обязан отразиться в MOB_KINDS при
  // загрузке (браузерная ветка читает Game.MobGroupsData из
  // снапшота зависимостей).
  const sandbox = {};
  loadInSandbox('perlin.js', sandbox);
  sandbox.Game = {
    MobGroupsData: {
      MOB_GROUPS: [{
        id: 1,
        название: 'тестовая группа',
        состав: { название: 't_group', мобы: ['spider'] },
        спрайт: 'spider',
        особые_параметры: {},
      }],
    },
  };
  loadInSandbox('map.js', sandbox);
  loadInSandbox('sprites.js', sandbox);
  assert.equal(sandbox.Game.mobKind(0), 'spider', 'вид из каталога');
  assert.equal(sandbox.Game.mobKind(1), null, 'вне каталога — null');
});
