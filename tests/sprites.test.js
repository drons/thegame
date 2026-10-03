const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
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
const { countDetails } = require('../scripts/count-svg-details.js');

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

// --- Задача 000110: спрайты городов — отдельный канал ---
//
// Город НЕ слот (000103: свой канал, type = BUILDING_TYPES.NONE,
// buildingId 51..54) — BUILDING_SPRITES (13 слотов) не расширяется
// (контракт слотов; citySprite(0..12) → null). Новые 4 SVG по типу
// города (хутор/деревня/город/столица — ids 51..54 каталога
// assets/buildings) — assets/sprites/cities/city_<id>.svg; таблица
// CITY_SPRITES — ЛИТЕРАЛ в sprites.js (паттерн BUILDING_SPRITES:
// нет require каталога при загрузке — vm-песочница без buildings.js
// работает), селектор citySprite(buildingId) — чистая функция
// (NONE/нецелое/неизвестное/слот-ид → null). Пути — в
// allAssetPaths (иначе main.js не поставит SVG в очередь загрузки).
//
// Стадия красных тестов: CITY_SPRITES/citySprite в sprites.js и 4
// файла assets/sprites/cities/ ещё не существуют — тесты падают
// (нет символа/файла), не синтаксически.

const CITIES_DIR = 'assets/sprites/cities/';
const { getBuildingsByCategory } = require('../src/buildings.js');

test('SP-C1: городские спрайты — все 4 типа каталога (категория «город») → путь к существующему SVG; NONE/неизвестное/нецелое/слот-ид → null', () => {
  const cities = getBuildingsByCategory('город');
  assert.equal(cities.length, 4,
    'сценарий: в каталоге ровно 4 типа городов');
  assert.equal(typeof S.citySprite, 'function',
    'src/sprites.js: нет селектора citySprite() (город — канал, '
    + 'отдельный от слотовых buildingSprite)');
  for (const c of cities) {
    const p = S.citySprite(c.id);
    assert.ok(p, `нет городского спрайта для «${c.название}» (id ${c.id})`);
    assert.ok(p.startsWith(CITIES_DIR),
      `путь в каталоге ${CITIES_DIR}: ${p}`);
    assert.ok(exists(p), `нет файла: ${p}`);
  }
  assert.equal(S.citySprite(BUILDING_TYPES.NONE), null,
    'NONE (−1) → null (не город)');
  assert.equal(S.citySprite(999), null, 'неизвестный id → null');
  assert.equal(S.citySprite(51.5), null, 'нецелое → null');
  assert.equal(S.citySprite('51'), null, 'строка → null');
  for (let s = 0; s < buildingCount(); s++) {
    assert.equal(S.citySprite(s), null,
      `слотовый id ${s} → null (слоты — свой канал)`);
  }
});

test('SP-C2: городские спрайты — 4 РАЗНЫХ пути в assets/sprites/cities/, CITY_SPRITES ≡ каталогу, все 4 в allAssetPaths', () => {
  const cities = getBuildingsByCategory('город');
  assert.ok(S.CITY_SPRITES && typeof S.CITY_SPRITES === 'object',
    'src/sprites.js: нет таблицы CITY_SPRITES (литерал по образцу '
    + 'BUILDING_SPRITES)');
  // Ключи ≡ id типов городов каталога (source of truth —
  // getBuildingsByCategory, не хардкод 51..54).
  assert.deepEqual(
    Object.keys(S.CITY_SPRITES).map(Number).sort((a, b) => a - b),
    cities.map((c) => c.id).sort((a, b) => a - b),
    'ключи CITY_SPRITES ≠ id городов каталога');
  const paths = cities.map((c) => S.CITY_SPRITES[c.id]);
  assert.ok(paths.every((p) => typeof p === 'string'
    && p.startsWith(CITIES_DIR) && p.endsWith('.svg')),
    'все пути — assets/sprites/cities/*.svg');
  assert.equal(new Set(paths).size, 4,
    '4 типа → 4 РАЗНЫХ файла (не «один штамп для всех»); '
    + 'дубли: ' + JSON.stringify(paths));
  // Таблица ≡ селектору (один источник для обоих).
  for (const c of cities) {
    assert.equal(S.CITY_SPRITES[c.id], S.citySprite(c.id),
      'CITY_SPRITES[' + c.id + '] ≠ citySprite(' + c.id + ')');
  }
  // Очередь загрузчика: все 4 пути в allAssetPaths (иначе main.js
  // их не загрузит — draw не отрисовался бы).
  const all = S.allAssetPaths();
  for (const p of paths) {
    assert.ok(all.includes(p), `путь не в allAssetPaths: ${p}`);
  }
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

// --- Задача 000059: данные декораций — из генерируемого модуля ---
//
// Ручная JS-копия каталога assets/visuals (литерал VISUALS) убрана из
// sprites.js: данные — в src/visuals-data.js (генерируется
// scripts/sync-visuals-data.js, npm sync:visuals; шапка GENERATED,
// идемпотентность, атомарная запись — единый интерфейс sync-скриптов,
// 000054). sprites.js — потребитель без собственной копии: браузерная
// ветка снимает Game.VisualsData при загрузке (index.html:
// visuals-data.js ДО sprites.js), node-ветка — require
// ('./visuals-data.js'). Конвенция id: id = номер файла (000001.json →
// id 1, закреплено тестом «id = номер файла» выше).
// vm-песочницы БЕЗ data-модуля (tests/combat-ui.test.js,
// tests/map.test.js грузят sprites.js без него): гард — тихая
// деградация до пустого каталога (рендер не падает и не шумит;
// паттерн 000058). В реальном браузере гард не срабатывает: порядок
// закреплён tests/index-order.test.js, а «вакуумность» цепочки —
// тестом «vm, цепочка index.html» ниже.
// VISUALS_SEED/MAX_VISUALS_PER_TILE/VISUALS_MIN_ZOOM — параметры
// рендера (логика, не данные) — остаются в sprites.js; формулы
// tileVisuals не меняются (детерминизм: существующие golden-тесты).
// Число записей — ДИНАМИЧЕСКОЕ от каталога, не хардкод.

const fromVm = (v) => JSON.parse(JSON.stringify(v));

function visualCatalog() {
  return fs.readdirSync(VDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort()
    .map((f) => JSON.parse(fs.readFileSync(path.join(VDIR, f), 'utf8')));
}

test('src/visuals-data.js: существует, шапка GENERATED (sync-visuals-data.js)', () => {
  const file = path.join(ROOT, 'src', 'visuals-data.js');
  assert.ok(fs.existsSync(file), 'src/visuals-data.js не существует');
  const src = fs.readFileSync(file, 'utf8');
  assert.ok(
    src.includes('GENERATED — не править руками, синхронизируется из assets/visuals (scripts/sync-visuals-data.js)'),
    'в шапке нет пометки «GENERATED — не править руками»');
});

test('visuals-data (node): { VISUALS } 1:1 с каталогом assets/visuals (source of truth)', () => {
  const VD = require('../src/visuals-data.js');
  assert.ok(VD && Array.isArray(VD.VISUALS), 'module.exports = { VISUALS }');
  const files = fs.readdirSync(VDIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.ok(files.length > 0, 'каталог assets/visuals не пуст');
  assert.equal(VD.VISUALS.length, files.length,
    'число записей модуля = числу файлов каталога');
  for (const f of files) {
    const n = parseInt(f, 10);
    const j = JSON.parse(fs.readFileSync(path.join(VDIR, f), 'utf8'));
    assert.equal(j.id, n, f + ': id = номер файла (конвенция каталога)');
    assert.deepEqual(VD.VISUALS[n - 1], j,
      f + ': запись модуля 1:1 с JSON (source of truth)');
  }
});

test('S.VISUALS ≡ VisualsData.VISUALS: sprites.js читает данные из модуля, собственной копии нет', () => {
  const VD = require('../src/visuals-data.js');
  assert.deepEqual(S.VISUALS, VD.VISUALS,
    'S.VISUALS ≠ каталогу из visuals-data.js');
  // Структурно: литеральные записи каталога из sprites.js УБРАНЫ —
  // спрайт-пути декораций не должны встречаться в источнике потребителя
  // (иначе «своя копия» вернётся и будет дрейфовать).
  const src = fs.readFileSync(path.join(ROOT, 'src', 'sprites.js'), 'utf8');
  for (const v of visualCatalog()) {
    assert.ok(!src.includes(v.спрайт),
      `литерал ${v.спрайт} в sprites.js (собственная копия данных)`);
  }
});

test('sync-visuals-data.js: существует, exit 0, идемпотентен (повторный запуск — byte-identical)', () => {
  const script = path.join(ROOT, 'scripts', 'sync-visuals-data.js');
  assert.ok(fs.existsSync(script), 'scripts/sync-visuals-data.js не существует');
  const outFile = path.join(ROOT, 'src', 'visuals-data.js');
  const before = fs.readFileSync(outFile);
  const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0,
    'скрипт завершился с ошибкой: ' + (res.stderr || res.stdout));
  assert.deepEqual(fs.readFileSync(outFile), before,
    'повторный запуск скрипта изменил src/visuals-data.js (не идемпотентно)');
});

test('package.json: npm-скрипт sync:visuals (интерфейс единый с sync:npc/skills)', () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync:visuals'], 'node scripts/sync-visuals-data.js');
});

test('vm: sprites.js БЕЗ visuals-data.js — гард: не падает, каталог пуст, молча', () => {
  // Реальный сценарий vm-песочниц (tests/combat-ui.test.js,
  // tests/map.test.js): sprites.js грузится без data-модулей. Жёсткая
  // зависимость от Game.VisualsData уронила бы их — гард обязан
  // деградировать до пустого каталога ТИХО (не console.error —
  // иначе шум в выводе npm test каждый запуск; паттерн 000058).
  const warns = [];
  const errors = [];
  const sandbox = {
    console: {
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log() {},
    },
  };
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  const w0 = warns.length, e0 = errors.length;
  assert.doesNotThrow(() => loadInSandbox('sprites.js', sandbox),
    'загрузка sprites.js без visuals-data.js не должна падать');
  assert.equal(warns.length, w0, 'гард без data-модуля молчалив (warn)');
  assert.equal(errors.length, e0, 'гард без data-модуля молчалив (error)');
  const G = sandbox.Game;
  assert.deepEqual(fromVm(G.VISUALS), [],
    'без data-модуля — пустой каталог (гард), рендер не падает');
  assert.deepEqual(fromVm(G.tileVisuals(1, 2, G.TERRAIN.GRASS)), [],
    'tileVisuals() = [] без данных');
  const paths = fromVm(G.allAssetPaths());
  assert.ok(Array.isArray(paths) && paths.length > 0,
    'allAssetPaths() работает без data-модуля');
  assert.ok(paths.every((p) => typeof p === 'string'), 'пути — строки');
});

test('vm, цепочка index.html: Game.VisualsData существует, S.VISUALS = каталогу, tileVisuals не пуст', () => {
  // Регрессия «вакуумного» main-visuals: цепочка берётся из
  // index.html (реальный порядок браузерной загрузки; регрессия
  // порядка — tests/index-order.test.js). visuals-data.js обязан
  // стоять ДО sprites.js, иначе гард даст пустой каталог и
  // декорации пропадут молча (тест main-visuals пересчитывает
  // ожидаемые декорации из той же песочницы — пустые данные
  // проходили бы «как ожидается»).
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const chain = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
    .map((p) => p.replace(/^src\//, ''));
  const iSprites = chain.indexOf('sprites.js');
  assert.ok(iSprites > 0, 'sprites.js в index.html');
  const prefix = chain.slice(0, iSprites + 1);
  const sandbox = { console: { warn() {}, error() {}, log() {} } };
  for (const f of prefix) {
    vmS.runInNewContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'),
      sandbox, { filename: f });
  }
  const G = sandbox.Game;
  assert.ok(G.VisualsData && Array.isArray(G.VisualsData.VISUALS),
    'Game.VisualsData в браузерном realm после цепочки index.html');
  // Не «вакуумно»: сравниваем с JSON-каталогом, а не с самим собой.
  const catalog = visualCatalog();
  assert.deepEqual(fromVm(G.VISUALS), catalog,
    'S.VISUALS = каталогу assets/visuals (данные из модуля)');
  // Детерминизм: фиксированная сетка травяных тайлов — часть
  // гарантированно с декорациями (данные 1:1, сиды не меняются).
  let nonEmpty = 0;
  for (let ty = 0; ty < 40; ty++) {
    for (let tx = 0; tx < 40; tx++) {
      if (fromVm(G.tileVisuals(tx, ty, G.TERRAIN.GRASS)).length) nonEmpty++;
    }
  }
  assert.ok(nonEmpty > 0,
    'tileVisuals не пуст: каталог реально подхвачен (не «вакуумно»)');
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

// --- Препятствия поля боя (задача 000050) ---
//
// 3 универсальных SVG (камень/валун/куст) в assets/combat/obstacles/ —
// рисуются ПОВЕРХ общего фона в слое «фон/сетка/препятствия/юниты».
// Выбор типа по клетке — чистая функция obstacleSprite(x, y)
// (литерал в sprites.js, без зависимости от combat.js — паттерн
// MOB_SPRITE_KINDS). Пути — в allAssetPaths (main.js сам кьюит их
// в spriteLoader).

const OBST_DIR = 'assets/combat/obstacles/';
const OBST_FILES = ['rock', 'boulder', 'bush'];

test('obstacleSprite: чистая функция, (x*3+y*5)%3, пути из OBSTACLE_SPRITES (000050)', () => {
  assert.equal(S.OBSTACLE_SPRITES.length, 3, 'три вида препятствий');
  for (const name of OBST_FILES) {
    assert.ok(S.OBSTACLE_SPRITES.includes(OBST_DIR + name + '.svg'),
      `нет пути ${name}.svg в OBSTACLE_SPRITES`);
    assert.ok(S.allAssetPaths().includes(OBST_DIR + name + '.svg'),
      `путь ${name}.svg не в allAssetPaths`);
    assert.ok(exists(OBST_DIR + name + '.svg'), `нет файла: ${name}.svg`);
  }
  for (let x = 0; x < 7; x++) {
    for (let y = 0; y < 7; y++) {
      const p = S.obstacleSprite(x, y);
      assert.equal(p, S.OBSTACLE_SPRITES[(x * 3 + y * 5) % 3],
        `(${x},${y}): формула (x*3+y*5)%3`);
      assert.ok(S.OBSTACLE_SPRITES.includes(p), 'путь только из таблицы');
      assert.equal(p, S.obstacleSprite(x, y), 'чистота: повтор — тот же путь');
    }
  }
  // Цикл 3: на 3×3 встречается все три вида (не «штамп» одного камня).
  const seen = new Set();
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) seen.add(S.obstacleSprite(x, y));
  assert.equal(seen.size, 3, 'все 3 вида на 3×3');
  // Клеток вне поля не существует: нецелое/отрицательное → null (фолбэк).
  for (const [x, y] of [[-1, 0], [0, -1], [0.5, 0], [0, 0.5], [NaN, 0]]) {
    assert.equal(S.obstacleSprite(x, y), null, `невалидная клетка (${x},${y})`);
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

// --- Задача 000110 (SP-C3): citySprite без каталога (vm-минимальная
// цепочка perlin→map→sprites, без buildings.js — паттерн теста
// «vm без каталога mob_groups» выше). Таблица CITY_SPRITES — ЛИТЕРАЛ
// (не require/данные каталога): загрузка ЧИСТА (0 console.error),
// селектор работает по литералу. ---

test('SP-C3: vm без каталога (perlin→map→sprites): citySprite — литерал, загрузка чистая (0 console.error)', () => {
  const errors = [];
  const sandbox = {
    console: {
      error: (m) => errors.push(String(m)),
      warn: () => {},
      log: () => {},
    },
  };
  loadInSandbox('perlin.js', sandbox);
  loadInSandbox('map.js', sandbox);
  loadInSandbox('sprites.js', sandbox);
  assert.equal(errors.length, 0,
    'загрузка sprites.js без buildings.js — чистая (нет require/'
    + 'каталога при загрузке): ' + errors.join('; '));
  const G = sandbox.Game;
  assert.equal(typeof G.citySprite, 'function',
    'citySprite есть в vm-realm (таблица-литерал, не каталог)');
  assert.equal(G.citySprite(51), 'assets/sprites/cities/city_51.svg',
    '51 → хутор (из литерала, без каталога)');
  assert.equal(G.citySprite(52), 'assets/sprites/cities/city_52.svg',
    '52 → деревня');
  assert.equal(G.citySprite(53), 'assets/sprites/cities/city_53.svg',
    '53 → город');
  assert.equal(G.citySprite(54), 'assets/sprites/cities/city_54.svg',
    '54 → столица');
  assert.equal(G.citySprite(BUILDING_TYPES.NONE), null, 'NONE → null');
  assert.equal(G.citySprite(999), null, 'неизвестный id → null');
  assert.equal(G.citySprite(0), null, 'слотовый id → null');
});

// --- Тайлы пола подземелья (задача 000069) ---
//
// DUNGEON_FLOOR_FRAMES — ЛИТЕРАЛЬНОЕ зеркало DUNGEON_TYPES (0..4 → три
// пути assets/dungeon/floor/<slug>_<n>.svg), тот же паттерн, что
// COMBAT_BG_DUNGEON (000049): sprites.js НЕ зависит от dungeon.js
// (vm-песочница tests/combat-ui.test.js dungeon.js не грузит; require
// в node-ветке UMD рассинхронил бы node/браузер — см. комментарий в
// sprites.js). Равенство зеркала с DUNGEON_TYPES и каталогом
// assets/dungeons закрывают тесты ниже (тест импортирует dungeon.js
// напрямую в node).
//
// dungeonFloorFrame(type, x, y) — чистая функция выбора варианта 1..3
// (паттерн tileVisuals: hash2 от координат, детерминизм, без
// RNG-состояния и факта загрузки). Раскладка ГЛОБАЛЬНАЯ (только
// (type, x, y), как мирские тайлы — без per-dungeon сида).
// Неизвестный type → null (рендерер 000066 рисует фолбэк #182029).
//
// Стадия красных тестов: DUNGEON_FLOOR_FRAMES / dungeonFloorFrame в
// sprites.js, scripts/gen-dungeon-tiles.js и 15 файлов
// assets/dungeon/floor ещё не существуют — тесты ниже падают, пока
// нет реализации.

const FLOOR_DIR = 'assets/dungeon/floor/';
const FLOOR_KEYS = [
  'cave_1', 'cave_2', 'cave_3',
  'crypt_1', 'crypt_2', 'crypt_3',
  'ruins_1', 'ruins_2', 'ruins_3',
  'drowned_1', 'drowned_2', 'drowned_3',
  'abyss_1', 'abyss_2', 'abyss_3',
];

test('DUNGEON_FLOOR_FRAMES: 5 типов × 3 варианта, ключи ≡ DUNGEON_TYPES, файлы существуют', () => {
  const D = require('../src/dungeon.js');
  assert.ok(S.DUNGEON_FLOOR_FRAMES, 'sprites.js экспортирует DUNGEON_FLOOR_FRAMES');
  const frames = S.DUNGEON_FLOOR_FRAMES;
  // Зеркало равно DUNGEON_TYPES: ключи — те же 5 чисел (0..4), ни одного
  // лишнего (паттерн теста COMBAT_BG_DUNGEON выше).
  assert.deepEqual(
    Object.keys(frames).map(Number).sort((a, b) => a - b),
    Object.values(D.DUNGEON_TYPES).slice().sort((a, b) => a - b),
    'ключи зеркала ≠ значения DUNGEON_TYPES');
  for (const [name, val] of Object.entries(D.DUNGEON_TYPES)) {
    const slug = BG_DUNGEON_FILES[val];
    assert.deepEqual(frames[val],
      [1, 2, 3].map((n) => FLOOR_DIR + slug + '_' + n + '.svg'),
      `тип ${name} (${val}): ровно 3 пути <slug>_<n>.svg, n = 1..3`);
    for (const p of frames[val]) assert.ok(exists(p), `нет файла: ${p}`);
  }
});

test('DUNGEON_FLOOR_FRAMES ≡ каталог assets/dungeons: порядок файлов ↔ id ↔ slug', () => {
  // Перенумерация каталога (000058) сдвигает пол так же, как фоны боя:
  // пол подземелья с id N обязан носить slug N-го файла каталога.
  const DDIR = path.join(ROOT, 'assets', 'dungeons');
  const files = fs.readdirSync(DDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
  files.forEach((f, i) => {
    const data = JSON.parse(fs.readFileSync(path.join(DDIR, f), 'utf8'));
    assert.equal(data.id, i, `${f}: id ≠ порядковому номеру файла (0..4)`);
    const frames = S.DUNGEON_FLOOR_FRAMES[data.id];
    assert.ok(Array.isArray(frames) && frames.length === 3,
      `${f}: нет 3 путей пола для подземелья id=${data.id}`);
    const slugs = [...new Set(frames
      .map((p) => path.basename(p).replace(/_\d+\.svg$/, '')))];
    // Явная связь с фоном боя того же подземелья (тихая рассинхронизация
    // «пол склепа под фоном боя пещеры» должна ловиться здесь).
    assert.deepEqual(slugs, [S.COMBAT_BG_DUNGEON[data.id]],
      `${f}: slug пола ≠ slug фона боя (COMBAT_BG_DUNGEON[${data.id}])`);
  });
});

test('dungeonFloorFrame: результат — один из трёх путей своего типа, чистая функция', () => {
  assert.equal(typeof S.dungeonFloorFrame, 'function',
    'sprites.js экспортирует dungeonFloorFrame');
  // Сетка 35×35 — размер крупнейшего подземелья (бездна, DUNGEON_SIZE).
  for (let type = 0; type < 5; type++) {
    const allowed = new Set(S.DUNGEON_FLOOR_FRAMES[type]);
    for (let x = 0; x < 35; x++) {
      for (let y = 0; y < 35; y++) {
        const r = S.dungeonFloorFrame(type, x, y);
        assert.equal(typeof r, 'string',
          `тип ${type} (${x},${y}): путь-строка, а не индекс`);
        assert.ok(allowed.has(r), `тип ${type} (${x},${y}): чужой путь ${r}`);
        assert.equal(S.dungeonFloorFrame(type, x, y), r,
          `тип ${type} (${x},${y}): повторный вызов даёт другой результат`);
      }
    }
  }
});

test('dungeonFloorFrame: в сетке 35×35 встречаются ВСЕ три варианта', () => {
  // Механически закрывает «один вариант на весь тип» (шахматка
  // вырождается в плиту) и «один вид для пяти типов» (пути каждого
  // типа различны по slug).
  for (let type = 0; type < 5; type++) {
    const seen = new Set();
    for (let x = 0; x < 35; x++)
      for (let y = 0; y < 35; y++)
        seen.add(S.dungeonFloorFrame(type, x, y));
    assert.equal(seen.size, 3,
      `тип ${type}: в сетке только ${seen.size} из 3 вариантов`);
    for (const p of seen) {
      assert.ok(S.DUNGEON_FLOOR_FRAMES[type].includes(p),
        `тип ${type}: чужой вариант ${p}`);
    }
  }
});

test('dungeonFloorFrame: неизвестный type → null, без исключений', () => {
  // Паттерн теста mobSpriteKind: мусорные type не роняют, дают null
  // (рендерер рисует фолбэк).
  for (const type of [5, 99, -1, 0.5, 'cave', null, undefined, NaN]) {
    assert.equal(S.dungeonFloorFrame(type, 3, 5), null,
      `неизвестный type: ${String(type)}`);
  }
});

test('allAssetPaths: содержит все 15 путей пола, файлы существуют', () => {
  // Явность для лоадера 000066/main.js: main.js в очередь лоадера
  // ставит ТОЛЬКО allAssetPaths() — пропущенный путь = файл не
  // загрузится в браузере.
  const paths = S.allAssetPaths();
  for (const key of FLOOR_KEYS) {
    const p = FLOOR_DIR + key + '.svg';
    assert.ok(paths.includes(p), `нет пути в allAssetPaths: ${p}`);
    assert.ok(exists(p), `нет файла: ${p}`);
  }
});

test('gen-dungeon-tiles: детерминирован, состав = 15 ключей, viewBox 64×64, 5 разных базовых тонов, одинаковая база вариантов типа', () => {
  // Скрипт — dev-инструмент (как gen-combat-bg): isMain-guard +
  // module.exports { TILES, buildDungeonFloorTile } для тестов.
  const { TILES, buildDungeonFloorTile } =
    require('../scripts/gen-dungeon-tiles.js');
  assert.equal(TILES.length, 15, 'в генераторе 15 тайлов (5 типов × 3 варианта)');
  assert.deepEqual(TILES.map((t) => t.key).slice().sort(),
    FLOOR_KEYS.slice().sort(), 'состав генератора ≠ 15 ожидаемых ключей');
  const byType = new Map(); // slug → Map(key → пара базовых тонов)
  for (const t of TILES) {
    // Повторный build — byte-identical (сид фиксирован, порядок стабилен).
    assert.equal(buildDungeonFloorTile(t), buildDungeonFloorTile(t),
      `генерация ${t.key} недетерминирована`);
    const svg = buildDungeonFloorTile(t);
    assert.ok(svg.includes('viewBox="0 0 64 64"'),
      `${t.key}: viewBox 64×64 (тот же масштаб, что у мировых тайлов)`);
    const slug = t.key.replace(/_\d$/, '');
    if (!byType.has(slug)) byType.set(slug, new Map());
    byType.get(slug).set(t.key, baseGradientPair(svg, t.key));
  }
  assert.equal(byType.size, 5, 'в генераторе 5 типов');
  const pairs = new Set();
  for (const [slug, variants] of byType) {
    // Мягкие стыки: базовый linearGradient ОДИНАКОВ для всех 3 вариантов
    // одного типа (сид меняет только раскладку деталей) — иначе при
    // по-клеточной отрисовке «шахматные» контрастные прыжки на стыках.
    assert.equal(new Set(variants.values()).size, 1,
      `${slug}: базовый градиент различается между 3 вариантами`);
    pairs.add(variants.values().next().value);
  }
  // «Пять типов — пять разных видов»: базовые пары тонов различны
  // (бурая / холодная серая / тёплая кладка / сине-зелёная /
  // чёрно-фиолетовая — палитры фонов боя 000049).
  assert.equal(pairs.size, 5, '5 типов — 5 разных пар базовых тонов');
});

test('package.json: npm-скрипт gen:dungeon запускает генератор пола', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['gen:dungeon'], 'нет npm-скрипта gen:dungeon');
  assert.match(pkg.scripts['gen:dungeon'], /gen-dungeon-tiles\.js/);
});

// Стоп-цвета ПЕРВОГО linearGradient тайла (базовый вертикальный градиент
// из двух близких тонов — приём мировых тайлов assets/tiles и
// gen-combat-bg.js). Возвращает пару «top|bottom» (lowercase).
function baseGradientPair(svg, label) {
  const m = svg.match(/<linearGradient[^>]*>([\s\S]*?)<\/linearGradient>/);
  assert.ok(m, `${label}: нет базового linearGradient`);
  const colors = [...m[1].matchAll(/stop-color="([^"]+)"/g)]
    .map((s) => s[1].toLowerCase());
  assert.equal(colors.length, 2, `${label}: базовый градиент = 2 стопа`);
  return colors.join('|');
}

// --- Задача 000070: «непроходимые» предметы стен (подзадача 000032, н.3) ---
//
// 6 SVG: assets/dungeon/walls/{rock_1,rock_2,column_1,column_2,
// stalactite_1,stalactite_2}.svg; детерминированный генератор
// scripts/gen-dungeon-walls.js (byte-identical, образец gen-combat-bg.js —
// чистый вид SVG тестом НЕ проверяется, прецедент 000049/000058).
// DUNGEON_WALL_FRAMES — ЛИТЕРАЛ в sprites.js (без require dungeon.js
// и data-модулей — vm-песочница, паттерн COMBAT_BG_DUNGEON); связь
// «матрица каталога × варианты 1..2 = эти 6 ключей = ровно 6 файлов»
// закрывается здесь и в tests/dungeon.test.js (DUNGEON_WALL_KINDS ≡
// каталог, точная матрица по типам).
// Контракт с рендером 000066: d.wallObjs — массив {x, y, obj},
// DUNGEON_WALL_FRAMES[obj] → путь SVG; опечатка в obj ловится тестом
// «каждый obj — ключ DUNGEON_WALL_FRAMES, файл существует».

const WALL_KEYS_000070 = ['column_1', 'column_2', 'rock_1', 'rock_2',
  'stalactite_1', 'stalactite_2'];
const WALLS_DIR_000070 = 'assets/dungeon/walls/';

test('000070 DUNGEON_WALL_FRAMES: 6 объектов, имена/пути, файлы существуют', () => {
  assert.ok(S.DUNGEON_WALL_FRAMES && typeof S.DUNGEON_WALL_FRAMES === 'object',
    'sprites.js: нет экспорта DUNGEON_WALL_FRAMES');
  assert.deepEqual(Object.keys(S.DUNGEON_WALL_FRAMES).sort(), WALL_KEYS_000070,
    'ключи ≠ 6 предметов стен');
  for (const k of WALL_KEYS_000070) {
    assert.equal(S.DUNGEON_WALL_FRAMES[k], WALLS_DIR_000070 + k + '.svg',
      `путь «${k}» ≠ ${WALLS_DIR_000070}${k}.svg`);
    assert.ok(exists(WALLS_DIR_000070 + k + '.svg'),
      `нет файла: ${WALLS_DIR_000070}${k}.svg`);
  }
});

test('000070 DUNGEON_WALL_FRAMES ≡ каталог: объединение предметов_стен × варианты 1..2, ровно 6 файлов', () => {
  const ddir = path.join(ROOT, 'assets', 'dungeons');
  const kinds = new Set();
  for (const f of fs.readdirSync(ddir).filter((f) => /^\d{6}\.json$/.test(f)).sort()) {
    const data = JSON.parse(fs.readFileSync(path.join(ddir, f), 'utf8'));
    assert.ok(Array.isArray(data.предметы_стен),
      `${f}: нет «предметы_стен» (связь с каталогом не проверима)`);
    for (const k of data.предметы_стен) kinds.add(k);
  }
  const expected = [];
  for (const k of [...kinds].sort()) expected.push(k + '_1', k + '_2');
  assert.ok(S.DUNGEON_WALL_FRAMES && typeof S.DUNGEON_WALL_FRAMES === 'object',
    'sprites.js: нет экспорта DUNGEON_WALL_FRAMES');
  assert.deepEqual(Object.keys(S.DUNGEON_WALL_FRAMES).sort(), expected.sort(),
    'ключи DUNGEON_WALL_FRAMES ≠ объединение(предметы_стен) × {1, 2}');
  // На диске — ровно 6 файлов, сиротских/отсутствующих нет.
  const onDisk = fs.readdirSync(path.join(ROOT, WALLS_DIR_000070)).sort();
  assert.deepEqual(onDisk, WALL_KEYS_000070.map((k) => k + '.svg').sort(),
    'файлы assets/dungeon/walls ≠ ровно 6 предметов стен');
});

test('000070 allAssetPaths: 6 wall-путей, файлы существуют', () => {
  const paths = S.allAssetPaths();
  for (const k of WALL_KEYS_000070) {
    const p = WALLS_DIR_000070 + k + '.svg';
    assert.ok(paths.includes(p), `нет пути в allAssetPaths: ${p}`);
    assert.ok(exists(p), `нет файла: ${p}`);
  }
});

test('000070 gen-dungeon-walls: детерминирован, состав = 6 ключей, viewBox 64×64', () => {
  const { WALLS, buildWall } = require('../scripts/gen-dungeon-walls.js');
  assert.deepEqual(WALLS.map((w) => w.key).sort(), WALL_KEYS_000070,
    'состав генератора ≠ 6 предметов стен');
  for (const w of WALLS) {
    // Повторный build — byte-identical (сид фиксирован, порядок стабилен).
    assert.equal(buildWall(w), buildWall(w), `генерация ${w.key} недетерминирована`);
    assert.ok(buildWall(w).includes('viewBox="0 0 64 64"'),
      `${w.key}: viewBox 64×64`);
  }
});

test('000070 d.wallObjs: каждый obj — ключ DUNGEON_WALL_FRAMES, файл существует (контракт с 000066)', () => {
  const D = require('../src/dungeon.js');
  const pxAbyss = syntheticPixels(8, 8, 40, 40, 40, 10);
  const px = syntheticPixels(8, 8, 128, 128, 128, 255);
  const entries = [
    [D.DUNGEON_TYPES.CAVE, 37, -12, px, TERRAIN.GRASS],
    [D.DUNGEON_TYPES.CRYPT, 5, 5, px, TERRAIN.FOREST],
    [D.DUNGEON_TYPES.RUINS, 5, 5, px, TERRAIN.HILL],
    [D.DUNGEON_TYPES.DROWNED, 5, 5, px, TERRAIN.SWAMP],
    [D.DUNGEON_TYPES.ABYSS, 11, 3, pxAbyss, TERRAIN.MOUNTAIN],
  ];
  for (const [type, x, y, p, terrain] of entries) {
    const d = D.createDungeon(x, y, p, terrain);
    assert.equal(d.type, type, `вход (${x}, ${y}) даёт тип ${type}`);
    assert.ok(Array.isArray(d.wallObjs) && d.wallObjs.length > 0,
      `тип ${type}: нет d.wallObjs (контракт с 000066) `);
    for (const o of d.wallObjs) {
      assert.ok(S.DUNGEON_WALL_FRAMES && S.DUNGEON_WALL_FRAMES[o.obj],
        `тип ${type}: obj «${o.obj}» не ключ DUNGEON_WALL_FRAMES`);
      assert.ok(exists(S.DUNGEON_WALL_FRAMES[o.obj]),
        `тип ${type}: нет файла для «${o.obj}»`);
    }
  }
});

// --- Задача 000034: редизайн героя (человек по assets/logo.svg) + дух Эфир ---
//
// ТЗ: переделать дизайн главного персонажа как на assets/logo.svg —
// человек в широкополой синей шляпе с золотым ободком, в синем кафтане,
// с высоким деревянным посохом с огненным свечением на верхушке. Текущие
// ассеты оставляем — это будет друг Флогистона, добрый дух Эфир
// (SPEC.md, раздел «Дух Эфира → Данные и ассеты»: «Спрайт —
// assets/sprites/efir/ создаёт задача 000034 (текущие ассеты Флогистона
// становятся ассетами Эфира; герой перерисовывается по assets/logo.svg)»).
//
// Решение (реализация — после стадии красных тестов):
// 1. Текущие духовные кадры переносятся БЕЗ ИЗМЕНЕНИЙ (git mv,
//    byte-идентично) в assets/sprites/efir/{idle,walk,attack,cast}_{1,2}.svg
//    — ровно 8 файлов, имена те же (контракт именования для 000114).
// 2. Флогистон перерисовывается человеком под ТЕМИ ЖЕ именами
//    assets/sprites/phlogiston/ — пути PHLOGISTON_ACTIONS инвариантны
//    (src/main.js, src/combat-ui.js и тесты ссылаются на пути, не
//    на содержимое).
// 3. sprites.js: таблица-литерал EFIR_FRAMES + чистая функция
//    efirFrames(action) → EFIR_FRAMES[action] || [] (имена — контракт
//    задачи 000114; паттерн PHLOGISTON_ACTIONS/phlogistonFrames),
//    СВОЙ push-блок в allAssetPaths() (конвенция: main.js в очередь
//    лоадера ставит ровно allAssetPaths() — пропущенный путь = кадр
//    никогда не загрузится в браузере).
//
// Палитры (фиксированный набор — эстетика проверяется QA-чек-листом,
// а принадлежность к палитре — тестом):
//   дух (старые кадры, bodyG): #b7f0fb, #52c4e8 — обязаны ПРОПАСТЬ из
//   кадров героя и ОСТАТЬСЯ в кадрах Эфира (идентичность переноса);
//   человек (фигура «Мага Флогистона» в assets/logo.svg, строки
//   ~708–957): шляпа #221d4f/#2a2463, кафтан #322c66/#453e8c,
//   золото #d9a63a/#c8963a, дерево посоха #6b4527/#8a5c33 — каждая
//   группа обязана встретиться в каждом кадре героя.
//
// Кадры — СТАТИЧНЫЕ (без SMIL — движок сам переключает 2 кадра;
// прецедент МОБ-арта 000062), viewBox 0 0 64 64 как у текущих кадров,
// прозрачный фон (без полноэкранного rect). Порог «высокодетальности»
// (SPEC «Графика») — >= 30 контурных деталей на кадр (бюджет 1×1-юнита
// по MOBS.md; текущие духовные кадры — 13–20, улучшать их НЕЛЬЗЯ:
// Эфиру передаются как есть).
//
// Стадия красных тестов: таблицы/функции/каталога efir/ нет, кадры
// героя — прежний дух — все тесты ниже падают, пока нет реализации.

const EFIR_ACTIONS = ['idle', 'walk', 'attack', 'cast'];
const EFIR_NAMES = EFIR_ACTIONS
  .flatMap((a) => [a + '_1.svg', a + '_2.svg']).sort();

function svgText(rel) {
  assert.ok(exists(rel), `нет файла: ${rel}`);
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const SPIRIT_COLORS = ['#b7f0fb', '#52c4e8'];
const HERO_PALETTE = [
  ['шляпа', ['#221d4f', '#2a2463']],
  ['кафтан', ['#322c66', '#453e8c']],
  ['золото', ['#d9a63a', '#c8963a']],
  ['посох (дерево)', ['#6b4527', '#8a5c33']],
];

test('Эфир: EFIR_FRAMES + efirFrames — 8 кадров (idle/walk/attack/cast × 2), файлы существуют', () => {
  assert.ok(S.EFIR_FRAMES && typeof S.EFIR_FRAMES === 'object',
    'sprites.js: нет экспорта EFIR_FRAMES');
  assert.equal(typeof S.efirFrames, 'function',
    'sprites.js: нет экспорта efirFrames(action)');
  assert.deepEqual(Object.keys(S.EFIR_FRAMES).sort(),
    ['attack', 'cast', 'idle', 'walk'],
    'ключи EFIR_FRAMES ≠ {idle, walk, attack, cast}');
  for (const a of EFIR_ACTIONS) {
    assert.deepEqual(S.efirFrames(a), [
      `assets/sprites/efir/${a}_1.svg`,
      `assets/sprites/efir/${a}_2.svg`,
    ], `эфир: кадры ${a}`);
    for (const p of S.efirFrames(a)) {
      assert.ok(exists(p), `нет файла: ${p}`);
    }
  }
  assert.deepEqual(S.efirFrames('нет-такого-действия'), [],
    'неизвестное действие → [] (паттерн phlogistonFrames)');
});

test('Эфир: каталог assets/sprites/efir — ровно 8 файлов, имена = именам phlogiston', () => {
  const dir = path.join(ROOT, 'assets', 'sprites', 'efir');
  assert.ok(fs.existsSync(dir), 'нет каталога assets/sprites/efir');
  const onDisk = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.svg')).sort();
  assert.deepEqual(onDisk, EFIR_NAMES,
    'сиротские/отсутствующие файлы assets/sprites/efir (ожидается ровно 8)');
  const phlog = fs.readdirSync(path.join(ROOT, 'assets', 'sprites', 'phlogiston'))
    .filter((f) => f.endsWith('.svg')).sort();
  assert.deepEqual(onDisk, phlog,
    'имена кадров Эфира ≠ именам кадров героя (контракт 000114: те же 8)');
});

test('allAssetPaths: содержит все 8 путей Эфира, файлы существуют; пути героя на месте', () => {
  assert.ok(S.EFIR_FRAMES && typeof S.EFIR_FRAMES === 'object',
    'нет EFIR_FRAMES');
  const paths = S.allAssetPaths();
  let n = 0;
  for (const frames of Object.values(S.EFIR_FRAMES)) {
    for (const p of frames) {
      assert.ok(paths.includes(p), `нет пути в allAssetPaths: ${p}`);
      assert.ok(exists(p), `нет файла: ${p}`);
      n += 1;
    }
  }
  assert.equal(n, 8, '8 путей Эфира');
  for (const frames of Object.values(S.PHLOGISTON_ACTIONS)) {
    for (const p of frames) {
      assert.ok(paths.includes(p), `потерян путь героя: ${p}`);
    }
  }
});

test('Флогистон-человек: все 8 кадров высокодетальные (>= 30 деталей, бюджет 1×1 по MOBS.md)', () => {
  for (const a of EFIR_ACTIONS) {
    for (const n of [1, 2]) {
      const rel = `assets/sprites/phlogiston/${a}_${n}.svg`;
      const d = countDetails(svgText(rel));
      assert.ok(d >= 30,
        `${rel}: ${d} деталей < 30 (SPEC «Графика»: высокодетальные кадры)`);
    }
  }
});

test('Герой перерисован: кадры — человек по logo.svg (дух-палитры нет, человек-палитра есть)', () => {
  for (const a of EFIR_ACTIONS) {
    for (const n of [1, 2]) {
      const rel = `assets/sprites/phlogiston/${a}_${n}.svg`;
      const t = svgText(rel).toLowerCase();
      for (const c of SPIRIT_COLORS) {
        assert.ok(!t.includes(c),
          `${rel}: дух-цвет ${c} в кадре героя (перерисовка не выполнена)`);
      }
      for (const [group, colors] of HERO_PALETTE) {
        assert.ok(colors.some((c) => t.includes(c)),
          `${rel}: нет цвета группы «${group}» (палитра из assets/logo.svg)`);
      }
    }
  }
});

test('Эфир = прежний дух: кадры несут дух-палитру и отличаются от кадров героя', () => {
  for (const a of EFIR_ACTIONS) {
    for (const n of [1, 2]) {
      const eRel = `assets/sprites/efir/${a}_${n}.svg`;
      const e = svgText(eRel);
      assert.ok(e.toLowerCase().includes('#b7f0fb'),
        `${eRel}: нет дух-палитры (#b7f0fb) — перенос не byte-идентичен?`);
      const p = svgText(`assets/sprites/phlogiston/${a}_${n}.svg`);
      assert.notEqual(p, e,
        `${a}_${n}: кадр героя = кадр Эфира (скопировано вместо переноса + перерисовки)`);
    }
  }
});

// --- Формат 16 персонажных SVG (8 героя + 8 Эфира) ---
//
// Тот же формат, что у текущих кадров phlogiston (и схема 000120,
// tests/svg.test.js, если смержится на ребейзе): корень <svg> с xmlns
// и viewBox="0 0 64 64", закрывающий </svg>, НЕТ NaN/Infinity (урок
// 000062), НЕТ запрещённых тегов (script/text/foreignObject/image/SMIL),
// НЕТ внешних ссылок (http(s):, xlink:href — xmlns-пространство не в
// счёт), НЕТ полноэкранного <rect> 64×64 (прозрачный фон).

const FORBIDDEN_FRAME_TAGS = ['script', 'text', 'foreignObject', 'image',
  'animate', 'animatetransform', 'set'];

function checkCharacterFrameErrors(rel, text) {
  const errors = [];
  const t = text.toLowerCase();
  if (!/^<svg[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(t)) {
    errors.push('нет корневого <svg> с xmlns');
  }
  if (!t.includes('viewbox="0 0 64 64"')) errors.push('нет viewBox="0 0 64 64"');
  if (!/\s*<\/svg>\s*$/.test(text)) errors.push('нет закрывающего </svg>');
  if (/NaN|Infinity/.test(text)) errors.push('подстроки NaN/Infinity (000062)');
  for (const tag of FORBIDDEN_FRAME_TAGS) {
    if (new RegExp(`<${tag}(?:\\s|/|>)`, 'i').test(text)) {
      errors.push(`запрещённый тег <${tag}> (кадр статичен)`);
    }
  }
  const noXmlns = text.replace(/xmlns="[^"]*"/g, '');
  if (/https?:\/\//i.test(noXmlns)) errors.push('внешняя http(s)-ссылка');
  if (/xlink:href/i.test(noXmlns)) errors.push('внешняя ссылка xlink:href');
  for (const m of text.matchAll(/<rect\b[^>]*>/gi)) {
    const el = m[0];
    const num = (name) => {
      const mm = el.match(new RegExp(`\\b${name}="([^"]*)"`));
      return mm ? Number(mm[1]) : 0;
    };
    if (num('x') === 0 && num('y') === 0 && num('width') === 64 && num('height') === 64) {
      errors.push('полноэкранный <rect> 64×64 (фон обязан быть прозрачным)');
      break;
    }
  }
  return errors;
}

test('16 персонажных SVG (8 героя + 8 Эфира): формат 64×64, прозрачный фон, статичны, без ссылок', () => {
  const files = [];
  for (const a of EFIR_ACTIONS) {
    for (const n of [1, 2]) {
      files.push(`assets/sprites/phlogiston/${a}_${n}.svg`);
      files.push(`assets/sprites/efir/${a}_${n}.svg`);
    }
  }
  for (const rel of files) {
    const errors = checkCharacterFrameErrors(rel, svgText(rel));
    assert.deepEqual(errors, [], rel + ': ' + errors.join('; '));
  }
});

// --- Геометрия героя: все элементы 8 кадров строго в канвасе 64×64 ---
//
// Правка по итогам ревью (раунд 1): кончики трёх искровых лучей
// attack_2 (stroke 0.7, round caps) после стека <g transform>
// (внешний rotate(±5) + внутренняя группа пламени translate/rotate)
// С учётом stroke-объёма выходили НАД верхним краем канваса на
// 0.09–0.34 px (глобальные y = -0.086 / -0.258 / -0.343). Лучи
// укорочены (кончики в локальных координатах группы пламени
// -12.6/-12.4 → -12.0/-11.8); тест закрепляет, что ни один элемент
// героя не вылезает за канвас.
// Кадры Эфира сознательно НЕ покрываются: они несут предсуществующие
// в master элементы за краем канваса (efir/attack_2.svg — дуга
// удара-плети до x=64.5; efir/cast_2.svg — круг (32,7) r=6.5 до
// y=-0.10), а byte-идентичность master — контракт (дух-арт не
// трогаем; SVG viewport их режет, как и в master).
//
// Чекер: аффинный стек (translate/rotate/scale групп <g> и элемента),
// path-токенизатор M/L/H/V/C/S/Q/T/A/Z (включая относительные); кривые
// — бокс контрольных точек (переоценка), дуги — диск радиуса 2r вокруг
// конца (переоценка); stroke — расширение на stroke-width/2 (точно:
// трансформы — повороты+сдвиги, round cap — полудиск вокруг конца).
// Well-formedness/схему не повторяем — территория tests/svg.test.js
// (000120).

const HERO_AFFINE = (() => {
  const ID = [1, 0, 0, 1, 0, 0];
  const mul = (A, B) => [ // A ∘ B: сначала B, потом A
    A[0] * B[0] + A[2] * B[1], A[1] * B[0] + A[3] * B[1],
    A[0] * B[2] + A[2] * B[3], A[1] * B[2] + A[3] * B[3],
    A[0] * B[4] + A[2] * B[5] + A[4],
    A[1] * B[4] + A[3] * B[5] + A[5],
  ];
  const tr = (x, y) => [1, 0, 0, 1, x, y];
  const rot = (deg) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [c, s, -s, c, 0, 0];
  };
  const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const parseTransform = (str) => {
    let m = ID;
    const re = /(\w+)\s*\(([^)]*)\)/g;
    let mm;
    while ((mm = re.exec(str))) {
      const args = mm[2].trim().split(/[\s,]+/).map(Number);
      let f;
      if (mm[1] === 'translate') f = tr(args[0] || 0, args[1] || 0);
      else if (mm[1] === 'rotate') f = args.length >= 3
        ? mul(mul(tr(args[1], args[2]), rot(args[0])), tr(-args[1], -args[2]))
        : rot(args[0] || 0);
      else if (mm[1] === 'scale') {
        const sx = args[0] || 1, sy = args.length > 1 ? args[1] : sx;
        f = [sx, 0, 0, sy, 0, 0];
      } else throw new Error('неподдерживаемый transform: ' + mm[1]);
      m = mul(m, f); // слева-направо в атрибуте: левый применяется ПОСЛЕДНИМ
    }
    return m;
  };
  const NUM = /-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g;
  const STEP = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 };
  // локальный бокс path d: [minX minY maxX maxY]
  const pathBBox = (d) => {
    const segs = [];
    const re = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
    let m;
    while ((m = re.exec(d))) {
      const cmd = m[1], C = cmd.toUpperCase();
      const nums = (m[2].match(NUM) || []).map(Number);
      const step = STEP[C];
      if (C === 'Z') { segs.push({ cmd, nums: [] }); continue; }
      for (let i = 0; i + step <= nums.length; i += step) {
        segs.push({ cmd, nums: nums.slice(i, i + step) });
      }
    }
    let bb = null;
    const add = (x, y) => {
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        throw new Error('неконечная координата в path-боксе: ' + d);
      }
      if (bb === null) bb = [x, y, x, y];
      else {
        bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y);
        bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y);
      }
    };
    let cur = [0, 0], start = [0, 0];
    for (const { cmd, nums: it } of segs) {
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (bb !== null) add(cur[0], cur[1]); // начало сегмента (путь уже начался)
      if (C === 'M') { cur = rel ? [cur[0] + it[0], cur[1] + it[1]] : [it[0], it[1]]; start = [cur[0], cur[1]]; }
      else if (C === 'L') { cur = rel ? [cur[0] + it[0], cur[1] + it[1]] : [it[0], it[1]]; }
      else if (C === 'H') { cur = [rel ? cur[0] + it[0] : it[0], cur[1]]; }
      else if (C === 'V') { cur = [cur[0], rel ? cur[1] + it[0] : it[0]]; }
      else if (C === 'C') {
        const c1 = rel ? [cur[0] + it[0], cur[1] + it[1]] : [it[0], it[1]];
        const c2 = rel ? [cur[0] + it[2], cur[1] + it[3]] : [it[2], it[3]];
        cur = rel ? [cur[0] + it[4], cur[1] + it[5]] : [it[4], it[5]];
        add(c1[0], c1[1]); add(c2[0], c2[1]);
      } else if (C === 'S') {
        const c2 = rel ? [cur[0] + it[0], cur[1] + it[1]] : [it[0], it[1]];
        cur = rel ? [cur[0] + it[2], cur[1] + it[3]] : [it[2], it[3]];
        add(c2[0], c2[1]);
      } else if (C === 'Q') {
        const c1 = rel ? [cur[0] + it[0], cur[1] + it[1]] : [it[0], it[1]];
        cur = rel ? [cur[0] + it[2], cur[1] + it[3]] : [it[2], it[3]];
        add(c1[0], c1[1]);
      } else if (C === 'T') { cur = rel ? [cur[0] + it[0], cur[1] + it[1]] : [it[0], it[1]]; }
      else if (C === 'A') {
        cur = rel ? [cur[0] + it[5], cur[1] + it[6]] : [it[5], it[6]];
        const r = 2 * Math.max(it[0], it[1]);
        add(cur[0] - r, cur[1] - r); add(cur[0] + r, cur[1] + r);
      } else if (C === 'Z') { cur = [start[0], start[1]]; }
      add(cur[0], cur[1]);
    }
    if (bb === null) bb = [0, 0, 0, 0];
    return bb;
  };
  const shapeBBox = (tag, attrs, d) => {
    const num = (n, dv = 0) => { const v = attrs[n]; return (v === undefined || v === '') ? dv : Number(v); };
    let bb = null;
    const add = (x, y) => {
      if (bb === null) bb = [x, y, x, y];
      else {
        bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y);
        bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y);
      }
    };
    const addRect = (x, y, w, h) => { add(x, y); add(x + w, y); add(x, y + h); add(x + w, y + h); };
    switch (tag) {
      case 'circle': addRect(num('cx') - num('r'), num('cy') - num('r'), 2 * num('r'), 2 * num('r')); break;
      case 'ellipse': addRect(num('cx') - num('rx'), num('cy') - num('ry'), 2 * num('rx'), 2 * num('ry')); break;
      case 'rect': addRect(num('x'), num('y'), num('width'), num('height')); break;
      case 'line': add(num('x1'), num('y1')); add(num('x2'), num('y2')); break;
      case 'polygon':
      case 'polyline': {
        const pts = (attrs.points || '').trim().split(/[\s,]+/).map(Number);
        for (let i = 0; i + 1 < pts.length; i += 2) add(pts[i], pts[i + 1]);
        break;
      }
      case 'path': return pathBBox(d);
      default: return null;
    }
    return bb;
  };
  const frameIssues = (text) => {
    const tags = [];
    let i = 0;
    while (i < text.length) {
      const lt = text.indexOf('<', i);
      if (lt === -1) break;
      if (text.startsWith('<!--', lt)) {
        const e = text.indexOf('-->', lt + 4);
        i = e === -1 ? text.length : e + 3;
        continue;
      }
      let j = lt + 1;
      let quote = null;
      while (j < text.length) {
        const ch = text[j];
        if (quote) { if (ch === quote) quote = null; }
        else if (ch === '"' || ch === "'") quote = ch;
        else if (ch === '>') break;
        j += 1;
      }
      if (j >= text.length) break;
      tags.push(text.slice(lt, j + 1));
      i = j + 1;
    }
    const DRAW = new Set(['path', 'circle', 'ellipse', 'rect', 'line', 'polygon', 'polyline']);
    const SKIP = new Set(['svg', 'defs', 'title', 'desc', 'metadata', 'style']);
    const stack = [ID];
    const issues = [];
    for (const t of tags) {
      const nameM = t.match(/^<\/?\s*([a-zA-Z][\w.:-]*)/);
      if (!nameM) continue;
      const name = nameM[1].toLowerCase();
      const selfClose = /\/\s*>$/.test(t);
      if (t.startsWith('</')) { stack.pop(); continue; }
      if (SKIP.has(name)) { if (!selfClose) stack.push(stack[stack.length - 1]); continue; }
      const attrs = {};
      for (const a of t.matchAll(/([a-zA-Z_][\w.:-]*)\s*=\s*"([^"]*)"/g)) attrs[a[1]] = a[2];
      let m = stack[stack.length - 1];
      if (attrs.transform) m = mul(m, parseTransform(attrs.transform));
      if (DRAW.has(name)) {
        const bb = shapeBBox(name, attrs, attrs.d || '');
        if (bb) {
          const stroked = attrs.stroke !== undefined && attrs.stroke !== 'none' && attrs.stroke !== '';
          const e = stroked ? (attrs['stroke-width'] !== undefined ? Number(attrs['stroke-width']) : 1) / 2 : 0;
          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const [x, y] of [[bb[0] - e, bb[1] - e], [bb[2] + e, bb[1] - e], [bb[0] - e, bb[3] + e], [bb[2] + e, bb[3] + e]]) {
            const g = apply(m, x, y);
            minX = Math.min(minX, g[0]); minY = Math.min(minY, g[1]);
            maxX = Math.max(maxX, g[0]); maxY = Math.max(maxY, g[1]);
          }
          if (minX < 0 || minY < 0 || maxX > 64 || maxY > 64) {
            issues.push(`${name} x[${minX.toFixed(3)};${maxX.toFixed(3)}] y[${minY.toFixed(3)};${maxY.toFixed(3)}]`);
          }
        }
      }
      if (!selfClose) stack.push(m);
    }
    return issues;
  };
  return { apply, mul, parseTransform, frameIssues };
})();

test('чекер аффинных трансформаций: самопроверка (состав = поинтовому преобразованию)', () => {
  const { apply, mul, parseTransform } = HERO_AFFINE;
  const closePt = (p, ex, ey, msg) => {
    assert.ok(Math.abs(p[0] - ex) < 1e-9 && Math.abs(p[1] - ey) < 1e-9,
      `${msg}: (${p[0]},${p[1]}) ≠ (${ex},${ey})`);
  };
  closePt(apply(parseTransform('rotate(90)'), 1, 0), 0, 1, 'rotate(90)');
  closePt(apply(parseTransform('rotate(90 1 0)'), 2, 0), 1, 1, 'rotate с pivot');
  closePt(apply(parseTransform('translate(10 0) scale(2)'), 1, 0), 12, 0,
    'порядок в атрибуте: левый — последний');
  // полная цепочка attack_2 (внешний rotate(-5 32 46) translate(1.2 0),
  // группа пламени translate(52.05 14.4) rotate(3.92)) vs независимое
  // последовательное преобразование точки — ловит ошибку порядка составa
  const R = (deg) => (p) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r);
    return [c * p[0] - s * p[1], s * p[0] + c * p[1]];
  };
  const T = (x, y) => (p) => [p[0] + x, p[1] + y];
  const RP = (deg, cx, cy) => (p) => {
    const q = R(deg)([p[0] - cx, p[1] - cy]);
    return [q[0] + cx, q[1] + cy];
  };
  const chain = (p) => RP(-5, 32, 46)(T(1.2, 0)(T(52.05, 14.4)(R(3.92)(p))));
  const m = mul(
    mul(parseTransform('rotate(-5 32 46)'), parseTransform('translate(1.2 0)')),
    mul(parseTransform('translate(52.05 14.4)'), parseTransform('rotate(3.92)')));
  for (const p of [[-3, -12.6], [3, -12.6], [0, -12.4], [0, -10.4], [0, 0]]) {
    const [gx, gy] = apply(m, p[0], p[1]);
    const [ix, iy] = chain(p);
    assert.ok(Math.abs(gx - ix) < 1e-9 && Math.abs(gy - iy) < 1e-9,
      `состав трансформов для (${p[0]},${p[1]}): ${gx},${gy} ≠ ${ix},${iy}`);
  }
});

test('герой: все элементы 8 кадров строго в канвасе 64×64 (аффинный чекер, с учётом stroke)', () => {
  for (const a of EFIR_ACTIONS) {
    for (const n of [1, 2]) {
      const rel = `assets/sprites/phlogiston/${a}_${n}.svg`;
      const issues = HERO_AFFINE.frameIssues(svgText(rel));
      assert.deepEqual(issues, [], rel + ': ' + issues.join('; '));
    }
  }
});

// --- Различие кадров действия (защита от «дубля-кадра») ---
//
// Два кадра действия различаются позами/энергией (MOBS.md), а не общим
// сдвигом и не копией файла. Измеримо: симметричная разность
// мультимножеств контурных элементов (path/circle/ellipse/polygon/rect/
// line вне defs/clipPath/mask, атрибуты нормализованы) >= 2.

function outlineSigs(text) {
  // Извлечение тегов с учётом кавычек, без комментариев —
  // паттерн scripts/count-svg-details.js (extractTags).
  const tags = [];
  let i = 0;
  while (i < text.length) {
    const lt = text.indexOf('<', i);
    if (lt === -1) break;
    if (text.startsWith('<!--', lt)) {
      const end = text.indexOf('-->', lt + 4);
      i = end === -1 ? text.length : end + 3;
      continue;
    }
    let j = lt + 1;
    let quote = null;
    while (j < text.length) {
      const ch = text[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j += 1;
    }
    if (j >= text.length) break;
    tags.push(text.slice(lt + 1, j));
    i = j + 1;
  }
  const OUTLINE = new Set(['path', 'circle', 'ellipse', 'polygon', 'rect', 'line']);
  const EXCL = new Set(['defs', 'clippath', 'mask']);
  const sigs = [];
  let excluded = 0;
  for (const raw of tags) {
    if (raw[0] === '?' || raw[0] === '!') continue;
    const closing = raw[0] === '/';
    const m = raw.match(
      closing ? /^\/\s*([a-zA-Z][a-zA-Z0-9._:-]*)/
              : /^([a-zA-Z][a-zA-Z0-9._:-]*)/);
    if (!m) continue;
    const name = m[1].toLowerCase();
    if (closing) {
      if (EXCL.has(name)) excluded = Math.max(0, excluded - 1);
      continue;
    }
    if (excluded === 0 && OUTLINE.has(name)) {
      const attrs = [...raw.matchAll(/([a-zA-Z_][a-zA-Z0-9._:-]*)="([^"]*)"/g)]
        .map((p) => `${p[1]}="${p[2]}"`).sort().join(' ');
      sigs.push(name + ' ' + attrs);
    }
    if (EXCL.has(name) && !/\/\s*$/.test(raw)) excluded += 1;
  }
  return sigs;
}

function outlineDiff(t1, t2) {
  const counts = new Map();
  for (const s of outlineSigs(t1)) counts.set(s, (counts.get(s) || 0) + 1);
  for (const s of outlineSigs(t2)) counts.set(s, (counts.get(s) || 0) - 1);
  let d = 0;
  for (const v of counts.values()) d += Math.abs(v);
  return d;
}

test('кадры действия различаются: герой и Эфир — >= 2 контурных элемента, не дубль-файл', () => {
  for (const a of EFIR_ACTIONS) {
    for (const dir of ['assets/sprites/phlogiston', 'assets/sprites/efir']) {
      const t1 = svgText(`${dir}/${a}_1.svg`);
      const t2 = svgText(`${dir}/${a}_2.svg`);
      assert.notEqual(t1, t2, `${dir}/${a}: дубль-кадр (файлы идентичны)`);
      assert.ok(outlineDiff(t1, t2) >= 2,
        `${dir}/${a}: кадры различаются < 2 контурными элементами («мёртвая» анимация)`);
    }
  }
});

test('Эфир: выбор кадров детерминирован и не зависит от факта загрузки', () => {
  assert.ok(S.EFIR_FRAMES && typeof S.efirFrames === 'function',
    'нет EFIR_FRAMES/efirFrames');
  const snap = EFIR_ACTIONS.map((a) => S.efirFrames(a));
  for (const frames of snap) {
    assert.ok(Array.isArray(frames) && frames.length === 2,
      'каждое действие Эфира — ровно 2 кадра');
  }
  // «Загружаем» всё — все ассеты падают (file:// без сети).
  const loader = S.createSpriteLoader(() => Promise.resolve(null));
  for (const p of S.allAssetPaths()) loader.queue(p);
  assert.equal(loader.readyCount(), 0);
  const again = EFIR_ACTIONS.map((a) => S.efirFrames(a));
  assert.deepEqual(again, snap,
    'повторный выбор другой после провала загрузки (кадр зависит от загрузки)');
});

// --- Задача 000114: защитные тесты (RED-фаза no-op) ---
// 000034/000084 СМЕРЖЕНЫ в базу ветки (master 7ab2c03) и
// предудовлетворили весь скоуп ТЗ 000114 — тесты фиксируют
// СУЩЕСТВУЮЩЕЕ поведение (expectedRedCount = 0). Контракт —
// memory/000114-efir-combat-render.md (§1/§2) и memory/
// 000114-efir-sprite.md.

test('Задача 000114: Эфир — кадры для каждого действия (каталог на месте); каталога нет — штатная деградация на границе лоадера, без ошибок', async () => {
  // Каталог на месте: кадры для каждого действия — ровно 2 пути,
  // файлы существуют на диске.
  const snap = EFIR_ACTIONS.map((a) => S.efirFrames(a));
  for (const a of EFIR_ACTIONS) {
    assert.deepEqual(S.efirFrames(a), [
      `assets/sprites/efir/${a}_1.svg`,
      `assets/sprites/efir/${a}_2.svg`,
    ], `кадры ${a}`);
    for (const p of S.efirFrames(a)) {
      assert.ok(exists(p), `нет файла: ${p}`);
    }
  }
  // «Каталога нет» — симуляция на ГРАНИЦЕ лоадера: loadFn → null
  // для префикса assets/sprites/efir/. Кадры не обязательны для
  // загрузки (паттерн createSpriteLoader): «не загрузилось» —
  // штатное состояние, исключений нет; мутации файловой системы
  // в тестах НЕ ДЕЛАЕМ (таблица — статичный литерал).
  const efirPaths = snap.flat();
  assert.equal(efirPaths.length, 8, '8 кадров Эфира');
  const loader = S.createSpriteLoader((p) => Promise.resolve(
    p.startsWith('assets/sprites/efir/') ? null : {}));
  for (const p of efirPaths) loader.queue(p);
  await tick();
  assert.equal(loader.readyCount(), 0,
    'ни один кадр Эфира не «загрузился» (loadFn → null)');
  for (const p of efirPaths) {
    assert.equal(loader.image(p), null, `image(${p}) → null (фолбэк)`);
  }
  // Таблица статична: повторный выбор — тот же (не зависит от
  // факта загрузки); неизвестное действие → [] без ошибок.
  assert.deepEqual(EFIR_ACTIONS.map((a) => S.efirFrames(a)), snap,
    'таблица кадров не изменилась после провала загрузки');
  assert.deepEqual(S.efirFrames('нет-такого-действия'), [],
    'неизвестное действие → [] без ошибок');
  // Включённость в allAssetPaths(): не бросает, все 8 путей на месте.
  const all = S.allAssetPaths();
  for (const p of efirPaths) {
    assert.ok(all.includes(p), `нет в allAssetPaths: ${p}`);
  }
});
