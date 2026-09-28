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
