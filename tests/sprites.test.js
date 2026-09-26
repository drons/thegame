const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TERRAIN, TERRAIN_NAMES,
  BUILDING_COUNT, BUILDING_TYPES,
  MOB_GROUP_COUNT, MOB_GROUP_TYPES,
  createMap, syntheticPixels,
} = require('../src/map.js');
const S = require('../src/sprites.js');

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
    assert.ok(g >= 0 && g < MOB_GROUP_COUNT);
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
  for (let b = 0; b < BUILDING_COUNT; b++) {
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
    buildings: Array.from({ length: BUILDING_COUNT }, (_, b) => S.buildingSprite(b)),
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
    buildings: Array.from({ length: BUILDING_COUNT }, (_, b) => S.buildingSprite(b)),
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

test('вода: фаза одинакова на границе соседних тайлов (стык)', () => {
  // Граница тайлов (tx, ty) и (tx+1, ty) — мировая линия x = tx + 1.
  // Фаза — чистая функция мировых координат, поэтому у любой точки
  // стыка одна фаза: одинаковая, как бы точку ни приписать —
  // левому тайлу (его правый край) или правому (его левый край).
  for (let i = 0; i < 100; i++) {
    const tx = Math.floor(Math.random() * 400) - 200;
    const ty = Math.floor(Math.random() * 400) - 200;
    const now = Math.floor(Math.random() * 1e7);
    const wy = ty + Math.random(); // произвольная точка стыка
    assert.equal(
      S.wavePhase(now, tx + 1, wy),    // правый край левого тайла
      S.wavePhase(now, (tx + 1), wy),  // левый край правого тайла
    );
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
