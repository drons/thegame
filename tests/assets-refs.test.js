// Задача 000211.01 (родитель 000211): JSON-справочники — формат ссылки +
// общий резолвер + общий тест целостности.
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации; падают, пока
// scripts/lib/json-ref.js не существует (assert existsSync → осмысленная
// причина «модуля нет» в каждом из 9 тестов, не синтаксическая).
// После реализации — зелёные с первого прогона: якорных ссылок в данных
// сейчас 0 (гейт миграций 000211.02–.08, 000207/208/209), все 210
// svg-строк существуют (перепроверено станцией a3).
//
// Резолвер — Node-only CommonJS (scripts/lib/json-ref.js, образец
// scripts/lib/write-atomic.js): <script>-тега в index.html НЕТ (ТЗ §1,
// пин tests/index-order.test.js). Формат ссылки и правила sweep —
// memory/000211.01-json-ref-format.md.
//
// Контракты, зафиксированные здесь:
//   * AR1 — модуль на месте, поверхность РОВНО: REF_RE/PORTRAITS_RE
//     (RegExp), REF_CATALOGS (11 каталогов), isRef/resolveRef/
//     collectRefs/collectSvgs (функции); пути collectRefs/collectSvgs —
//     стиль where валидатора (голый ключ, [i], .k).
//   * AR2 — isRef: якорный паттерн 9 каталогов (+/−); visuals ВНЕ
//     паттерна; 5/7 цифр, .bak, id и путь к js — не ссылки; не-строка —
//     false.
//   * AR3 — isRef: portraits — именованные (efir/flogiston/npc-NNNNNN)
//     (+/−).
//   * AR4 — resolveRef(root, ref): файл существует, парсится как JSON,
//     содержит id — hasOwnProperty, НЕ truthiness: dungeons/simple_cave —
//     id = 0 (falsy) резолюция ОБЯЗАНА пройти; id строковый и числовой.
//   * AR5 — resolveRef: отрицательный контроль — битый путь (считается
//     ДИНАМИЧЕСКИ: макс. номер items + 1, без хардкода) → 'no-file';
//     строка вне паттерна (visuals, id) → 'not-a-ref'.
//   * AR6 — resolveRef: отрицательный контроль — не-JSON файл →
//     'not-json' (изолирован в mkdtemp tmp-корне; root — позиционный
//     параметр, дефолта нет).
//   * AR7 — resolveRef: отрицательный контроль — JSON-объект без
//     верхнеуровневого id → 'no-id' (tmp-корень).
//   * AR8 — sweep 11 каталогов (REF_CATALOGS): только ДАННЫЕ файлы
//     (9 каталогов — \d{6}.json, portraits — ВСЕ *.json; schema.json
//     исключён), каждая строка под якорным паттерном (collectRefs)
//     резолвится ok. Сейчас 0 ссылок — тест ГЕЙТ последующих миграций.
//   * AR9 — sweep 11 каталогов: каждая строка «assets/…*.svg»
//     (collectSvgs) существует от корня (existsSync). Анти-вакуум:
//     прецедент «спрайт» assets/visuals/grass_blades_light.json (000318.03)
//     "assets/sprites/visuals/grass_blades_light.svg" обязателен в
//     результате. Голые имена иконок portraits (efir.svg …) — вне скоупа
//     (волна 2, memory §3).
//
// Тест НЕ пиннит КОЛИЧЕСТВО ссылок/svg (0 сейчас, 45+ после миграций).
//
// Дополнение 000318.01 (per-catalog shape, без переименований): AR1–AR9 —
// прежние кейсы БЕЗ изменений результатов; новые кейсы обеих форм:
//   * AR10 — поверхность шейпов: ASSET_NAME_SHAPES (11 нумерованных →
//     'number', portraits → 'named'), SHAPE_BASENAME_RES {number, slug},
//     REF_LINKED_CATALOGS (РОВНО 9), refPath/isRefPath/isRefPathFull.
//   * AR11 — REF_RE.source ПОБайтово = прежний литерал (при всех 'number';
//     носитель рантайма — pattern в assets/skills/schema.json, SR5).
//   * AR12 — эквивалентность isRefPathFull ↔ isRef ↔ REF_RE на табличных
//     примерах (обратная совместимость разборки REF_RE).
//   * AR13 — slug принимается ТОЛЬКО для каталога со slug-шейпом
//     (временная подмена шейпа в try/finally; resolveRef slug-цели в mkdtemp).
//   * AR14 — ref-eligibility ≠ name-shape: visuals/runes/portraits —
//     НЕ ref при ЛЮБОМ шейпе (негативы AR2/AR5 навсегда).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const MOD_PATH = path.join(ROOT, 'scripts', 'lib', 'json-ref.js');

function loadRef() {
  assert.ok(fs.existsSync(MOD_PATH),
    'scripts/lib/json-ref.js не существует (задача 000211.01: красные тесты)');
  return require(MOD_PATH);
}

const REF_CATALOGS_EXPECTED = ['items', 'skills', 'spells', 'mobs',
  'mob_groups', 'buildings', 'craft', 'dungeons', 'npc', 'visuals',
  'portraits'];

function dataFiles(mod, cat) {
  const dir = path.join(ROOT, 'assets', cat);
  // Форма имени — из ЖИВОГО реестра lib (000318.01; .02 — runes slug,
  // .03 — visuals slug); slug-regex матчит и schema.json — исключаем явно.
  // portraits — вне SHAPE_BASENAME_RES ('named'), прежняя ветка PORTRAITS_RE.
  const files = cat === 'portraits'
    ? fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort()
    : (() => {
      const re = mod.SHAPE_BASENAME_RES[mod.ASSET_NAME_SHAPES[cat]];
      assert.ok(re instanceof RegExp,
        cat + ': шейп «' + mod.ASSET_NAME_SHAPES[cat] + '» без формы в lib');
      return fs.readdirSync(dir)
        .filter((f) => f !== 'schema.json' && re.test(f)).sort();
    })();
  assert.ok(files.length >= 1, cat + ': sweep прошёл 0 файлов (анти-вакуум)');
  return { dir, files };
}

function sweep(mod, pick) {
  const out = [];
  for (const cat of mod.REF_CATALOGS) {
    const { dir, files } = dataFiles(mod, cat);
    for (const f of files) {
      const data = JSON.parse(
        fs.readFileSync(path.join(dir, f), 'utf8'));
      for (const item of pick(data)) {
        out.push(Object.assign({ cat, file: f }, item));
      }
    }
  }
  return out;
}

function withTmpRoot(files, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-refs-'));
  try {
    for (const [rel, content] of files) {
      const p = path.join(dir, rel);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content, 'utf8');
    }
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('AR1: json-ref.js — модуль на месте, поверхность', () => {
  const mod = loadRef();
  assert.ok(mod && typeof mod === 'object' && !Array.isArray(mod),
    'module.exports — объект (CommonJS)');
  assert.ok(mod.REF_RE instanceof RegExp, 'REF_RE — RegExp');
  assert.ok(mod.PORTRAITS_RE instanceof RegExp, 'PORTRAITS_RE — RegExp');
  assert.ok(Array.isArray(mod.REF_CATALOGS), 'REF_CATALOGS — массив');
  assert.deepEqual([...mod.REF_CATALOGS].sort(),
    [...REF_CATALOGS_EXPECTED].sort(),
    'REF_CATALOGS — РОВНО 11 каталогов sweep; факт: '
    + JSON.stringify(mod.REF_CATALOGS));
  for (const fn of ['isRef', 'resolveRef', 'collectRefs', 'collectSvgs']) {
    assert.equal(typeof mod[fn], 'function', fn + ' — функция');
  }
  // Пути — стиль where валидатора: голый ключ, [i], .k.
  assert.deepEqual(mod.collectRefs({
    loot: [{ item: 'assets/items/000001.json', name: 'не ссылка' }],
    skill: 'fists',
    nested: { ref: 'assets/dungeons/simple_cave.json' },
  }), [
    { path: 'loot[0].item', ref: 'assets/items/000001.json' },
    { path: 'nested.ref', ref: 'assets/dungeons/simple_cave.json' },
  ], 'collectRefs: только якорные строки, путь where-стиля');
  assert.deepEqual(mod.collectSvgs({
    art: { move: ['assets/sprites/mobs/x_move1.svg'] },
    icon: 'efir.svg',
    map: 'assets/sprites/loot/x.png',
  }), [
    { path: 'art.move[0]', svg: 'assets/sprites/mobs/x_move1.svg' },
  ], 'collectSvgs: только «assets/…*.svg» (голое имя и .png — мимо)');
});

test('AR2: isRef — якорный паттерн 9 каталогов (+/−)', () => {
  const mod = loadRef();
  for (const s of [
    'assets/items/000001.json',
    'assets/skills/000037.json',
    'assets/dungeons/abyss.json',        // dungeons — slug с 000318.04
    'assets/mobs/abomination.json',      // mobs — slug с 000318.04
    'assets/mob_groups/abyss_spirit.json',  // mob_groups — slug с 000318.04
    'assets/buildings/000054.json',
    'assets/craft/000031.json',
    'assets/spells/resurrect.json',    // spells — slug с 000318.05
    'assets/npc/000018.json',
  ]) {
    assert.equal(mod.isRef(s), true, 'ссылка: ' + s);
  }
  for (const s of [
    'assets/visuals/000001.json',  // visuals вне паттерна (прямые svg-пути)
    'assets/mobs/000001.json',     // mobs slug с 000318.04: номер — не ref
    'assets/mobs/00001.json',      // 5 цифр
    'assets/mobs/0000001.json',    // 7 цифр
    'assets/items/1.json',
    'assets/items/000001.json.bak',
    'assets/items/000001.JSON',
    'fists',                       // id, не путь
    'src/items-data.js',
  ]) {
    assert.equal(mod.isRef(s), false, 'не ссылка: ' + s);
  }
  for (const v of [42, null, undefined, {}]) {
    assert.equal(mod.isRef(v), false, 'не-строка — false: '
      + JSON.stringify(v));
  }
});

test('AR3: isRef — portraits (efir/flogiston/npc-NNNNNN) (+/−)', () => {
  const mod = loadRef();
  for (const s of [
    'assets/portraits/efir.json',
    'assets/portraits/flogiston.json',
    'assets/portraits/npc-000012.json',
    'assets/portraits/npc-000017.json',
  ]) {
    assert.equal(mod.isRef(s), true, 'ссылка: ' + s);
  }
  for (const s of [
    'assets/portraits/npc-12.json',
    'assets/portraits/npc-0000123.json',
    'assets/portraits/unknown.json',
    'assets/portraits/efir.svg',
    'assets/portraits/npc-000012.json.bak',
  ]) {
    assert.equal(mod.isRef(s), false, 'не ссылка: ' + s);
  }
});

test('AR4: resolveRef — файл существует, парсится, содержит id (id=0)', () => {
  const mod = loadRef();
  const cases = [
    ['assets/items/000001.json', 'wood_sword'],  // id — строка
    ['assets/dungeons/simple_cave.json', 0],     // id = 0 (falsy!)
    ['assets/buildings/000001.json', 1],         // id — число
    ['assets/portraits/efir.json', 'efir'],      // именованный portraits
  ];
  for (const [ref, id] of cases) {
    const r = mod.resolveRef(ROOT, ref);
    assert.deepEqual(r, { ok: true, id },
      ref + ': {ok:true, id:' + JSON.stringify(id) + '}; факт: '
      + JSON.stringify(r));
  }
});

test('AR5: resolveRef — отрицательный: битый путь (no-file), не-ссылка (not-a-ref)', () => {
  const mod = loadRef();
  const items = fs.readdirSync(path.join(ROOT, 'assets', 'items'))
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.ok(items.length > 0, 'assets/items пуст — предпосылка нарушена');
  const maxNum = parseInt(items[items.length - 1], 10);
  const missing = 'assets/items/'
    + String(maxNum + 1).padStart(6, '0') + '.json';
  assert.equal(mod.isRef(missing), true,
    'предпосылка: битый путь под якорным паттерном');
  assert.deepEqual(mod.resolveRef(ROOT, missing),
    { ok: false, reason: 'no-file' },
    missing + ': файла нет → no-file');
  assert.deepEqual(mod.resolveRef(ROOT, 'assets/visuals/000001.json'),
    { ok: false, reason: 'not-a-ref' },
    'visuals вне паттерна → not-a-ref');
  assert.deepEqual(mod.resolveRef(ROOT, 'fists'),
    { ok: false, reason: 'not-a-ref' }, 'id, не путь → not-a-ref');
});

test('AR6: resolveRef — отрицательный: не-JSON файл (not-json)', () => {
  const mod = loadRef();
  withTmpRoot([['assets/items/000001.json', 'не JSON {']
  ], (dir) => {
    assert.deepEqual(mod.resolveRef(dir, 'assets/items/000001.json'),
      { ok: false, reason: 'not-json' });
  });
});

test('AR7: resolveRef — отрицательный: файл без id (no-id)', () => {
  const mod = loadRef();
  withTmpRoot([['assets/items/000001.json',
    JSON.stringify({ name: 'без id', kind: 'weapon' })]
  ], (dir) => {
    assert.deepEqual(mod.resolveRef(dir, 'assets/items/000001.json'),
      { ok: false, reason: 'no-id' });
  });
});

test('AR8: sweep 11 каталогов — каждая якорная ссылка резолвится (гейт)', () => {
  const mod = loadRef();
  const refs = sweep(mod, (data) => mod.collectRefs(data));
  const bad = refs
    .filter(({ ref }) => !mod.resolveRef(ROOT, ref).ok)
    .map(({ cat, file, path: where, ref }) =>
      cat + '/' + file + ' ' + where + ' → ' + ref);
  assert.deepEqual(bad, [], 'нерезолвящиеся ссылки: ' + bad.join('; '));
});

test('AR9: sweep 11 каталогов — каждая «assets/…*.svg» существует', () => {
  const mod = loadRef();
  const svgs = sweep(mod, (data) => mod.collectSvgs(data));
  const missing = svgs
    .filter(({ svg }) => !fs.existsSync(path.join(ROOT, svg)))
    .map(({ cat, file, path: where, svg }) =>
      cat + '/' + file + ' ' + where + ' → ' + svg);
  assert.deepEqual(missing, [],
    'несуществующие svg: ' + missing.join('; '));
  const v1 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'visuals', 'grass_blades_light.json'), 'utf8'));
  assert.ok(mod.collectSvgs(v1).some((x) =>
    x.svg === 'assets/sprites/visuals/grass_blades_light.svg'),
    'анти-вакуум: прецедент «спрайт» visuals/grass_blades_light в sweep '
    + '(000318.03: имя — slug по спрайту)');
});

function loadShapes() {
  const mod = loadRef();
  assert.ok(mod.ASSET_NAME_SHAPES
    && typeof mod.ASSET_NAME_SHAPES === 'object'
    && !Array.isArray(mod.ASSET_NAME_SHAPES),
    'ASSET_NAME_SHAPES отсутствует (000318.01: красные до появления шейпов в lib)');
  assert.ok(mod.SHAPE_BASENAME_RES
    && mod.SHAPE_BASENAME_RES.number instanceof RegExp
    && mod.SHAPE_BASENAME_RES.slug instanceof RegExp,
    'SHAPE_BASENAME_RES.number/.slug — RegExp');
  for (const fn of ['refPath', 'isRefPath', 'isRefPathFull']) {
    assert.equal(typeof mod[fn], 'function', fn + ' — функция');
  }
  assert.ok(Array.isArray(mod.REF_LINKED_CATALOGS),
    'REF_LINKED_CATALOGS — массив');
  return mod;
}

test('AR10: поверхность 000318.01 — реестр шейпов и резолверы формы', () => {
  const mod = loadShapes();
  for (const cat of ['items', 'skills', 'buildings', 'craft', 'npc']) {
    assert.equal(mod.ASSET_NAME_SHAPES[cat], 'number',
      cat + ': не переименован дочерними 000318 — шейп number');
  }
  for (const cat of ['mobs', 'mob_groups', 'dungeons']) {
    assert.equal(mod.ASSET_NAME_SHAPES[cat], 'slug',
      cat + ': переименован 000318.04 — шейп slug');
    const real = { mobs: 'abomination', mob_groups: 'abyss_spirit',
      dungeons: 'abyss' }[cat];
    assert.equal(mod.isRefPath(cat, real + '.json'), true,
      cat + ' (000318.04): slug-имя — ref');
    assert.equal(mod.isRefPath(cat, '000001.json'), false,
      cat + ' (000318.04): прежняя номерная форма — НЕ ref');
  }
  assert.equal(mod.ASSET_NAME_SHAPES.spells, 'slug',
    'spells — slug (переименован 000318.05: имя = строковый id)');
  assert.equal(mod.isRefPath('spells', 'resurrect.json'), true,
    'spells (000318.05): slug-имя — ref');
  assert.equal(mod.isRefPath('spells', '000017.json'), false,
    'spells (000318.05): прежняя номерная форма — НЕ ref');
  assert.equal(mod.ASSET_NAME_SHAPES.runes, 'slug',
    'runes — slug (переименован 000318.02; мишенью ссылок не был никогда)');
  assert.equal(mod.ASSET_NAME_SHAPES.visuals, 'slug',
    'visuals — slug (переименован 000318.03: имя — basename «спрайт»; '
    + 'мишенью ссылок не был никогда — AR2/AR5/AR14)');
  assert.equal(mod.ASSET_NAME_SHAPES.portraits, 'named',
    'portraits — named (только PORTRAITS_RE)');
  assert.deepEqual([...mod.REF_LINKED_CATALOGS], [
    'items', 'skills', 'spells', 'mobs', 'mob_groups',
    'buildings', 'craft', 'dungeons', 'npc',
  ], 'REF_LINKED_CATALOGS — РОВНО 9 мишеней (REF_CATALOGS минус visuals/portraits)');
  assert.equal(mod.refPath('craft', '000031.json'),
    'assets/craft/000031.json', 'refPath — сборка корневого пути');
  assert.equal(mod.isRefPath('items', '000001.json'), true);
  assert.equal(mod.isRefPath('items', '0000001.json'), false, '7 цифр — не ref');
  assert.equal(mod.isRefPath('items', 'wood_sword.json'), false,
    'slug в number-каталоге — НЕ ref');
  assert.equal(mod.isRefPathFull('assets/spells/resurrect.json'), true,
    'spells — slug с 000318.05');
  assert.equal(mod.isRefPathFull('assets/spells/000017.json'), false,
    'spells — slug с 000318.05: номерная форма — НЕ ref');
  assert.equal(mod.isRefPathFull('assets/items/000001.json.bak'), false);
});

test('AR11: REF_RE.source — побайтовый пин обратной совместимости', () => {
  const mod = loadRef();
  assert.equal(mod.REF_RE.source,
    '^assets\\/(items|skills|buildings|craft|npc)\\/\\d{6}\\.json$'
    + '|^assets\\/(spells|mobs|mob_groups|dungeons)\\/[a-z][a-z0-9_]*\\.json$',
    'REF_RE выводится из шейпов группами; с 000318.05 — ДВЕ группы '
    + '(number: items/skills/buildings/craft/npc; slug: spells/mobs/'
    + 'mob_groups/dungeons). Прежний литерал ДО .05 (spells в number-'
    + 'группе); рантайм-носитель: pattern в assets/skills/schema.json, '
    + 'SR5/skills.test');
});

test('AR12: isRefPathFull ≡ REF_RE (9 каталогов) — эквивалентность на таблице', () => {
  const mod = loadRef();
  assert.equal(typeof mod.isRefPathFull, 'function',
    'isRefPathFull отсутствует (000318.01: красные до появления резолвера в lib)');
  const samples = [];
  for (const cat of ['items', 'skills', 'spells', 'mobs', 'mob_groups',
    'buildings', 'craft', 'dungeons', 'npc']) {
    for (const b of ['000001.json', '00001.json', '0000001.json',
      'wood_sword.json', '000001.json.bak', '000001.JSON']) {
      samples.push('assets/' + cat + '/' + b);
    }
  }
  samples.push('assets/visuals/000001.json', 'assets/runes/000001.json',
    'assets/mobs/abomination.json', 'assets/mob_groups/orc_camp.json',
    'assets/dungeons/simple_cave.json',
    'assets/portraits/efir.json', 'fists', 'assets',
    'assets//000001.json', 'assets/items/000001/000002.json');
  for (const s of samples) {
    assert.equal(mod.isRefPathFull(s), mod.REF_RE.test(s),
      'isRefPathFull ≡ REF_RE: ' + s);
    assert.equal(mod.isRef(s),
      mod.REF_RE.test(s) || mod.PORTRAITS_RE.test(s),
      'isRef ≡ REF_RE ∪ PORTRAITS_RE: ' + s);
  }
});

test('AR13: slug — только для каталога со slug-шейпом (подмена в try/finally)', () => {
  const mod = loadShapes();
  assert.equal(mod.isRefPath('items', 'wood_sword.json'), false,
    'number-шейп (текущий диск): slug — не ref');
  assert.equal(mod.isRef('assets/items/wood_sword.json'), false);
  assert.equal(mod.isRef('assets/items/0000001.json'), false,
    '7 цифр — не ref ни при каком шейпе');
  const saved = mod.ASSET_NAME_SHAPES.items;
  mod.ASSET_NAME_SHAPES.items = 'slug';
  try {
    assert.equal(mod.isRefPath('items', 'wood_sword.json'), true,
      'slug-шейп: basename со slug — ref');
    assert.equal(mod.isRefPath('items', '000001.json'), false,
      'slug-шейп: голый номер — НЕ ref');
    assert.equal(mod.isRefPath('items', '0000001.json'), false,
      'slug-шейп: 7 цифр — НЕ ref');
    assert.equal(mod.isRefPath('items', 'Wood_sword.json'), false,
      'slug — с заглавной НЕ slug');
    assert.equal(mod.isRefPath('skills', 'wood_sword.json'), false,
      'slug принимается только каталогом со slug-шейпом (skills — number)');
    assert.equal(mod.isRef('assets/items/wood_sword.json'), true);
    withTmpRoot([['assets/items/wood_sword.json',
      JSON.stringify({ id: 'wood_sword' })]
    ], (dir) => {
      assert.deepEqual(mod.resolveRef(dir, 'assets/items/wood_sword.json'),
        { ok: true, id: 'wood_sword' },
        'resolveRef slug-цели в tmp-корне');
    });
  } finally {
    mod.ASSET_NAME_SHAPES.items = saved;
  }
  assert.equal(mod.ASSET_NAME_SHAPES.items, 'number',
    'шейп восстановлен после finally');
  assert.equal(mod.isRef('assets/items/wood_sword.json'), false,
    'после восстановления — прежние негативы вернулись');
  assert.equal(mod.isRef('assets/items/000001.json'), true,
    'после восстановления — прежние позитивы вернулись');
});

test('AR14: ref-eligibility ≠ name-shape — visuals/runes/portraits не ref при любом шейпе', () => {
  const mod = loadShapes();
  for (const cat of ['visuals', 'runes']) {
    for (const shape of ['number', 'slug']) {
      const saved = mod.ASSET_NAME_SHAPES[cat];
      mod.ASSET_NAME_SHAPES[cat] = shape;
      try {
        assert.equal(mod.isRefPath(cat, '000001.json'), false,
          cat + ' при шейпе ' + shape + ': не мишень ссылок');
        assert.equal(mod.isRefPath(cat, 'spring_meadow.json'), false,
          cat + ' при шейпе ' + shape + ': slug-имя тоже не делает ref');
        assert.equal(mod.isRef('assets/' + cat + '/000001.json'), false,
          cat + ': не-ref навсегда (AR2/AR5)');
      } finally {
        mod.ASSET_NAME_SHAPES[cat] = saved;
      }
      assert.equal(mod.ASSET_NAME_SHAPES[cat], saved,
        cat + ': шейп восстановлен после finally (с сохранённого — '
        + 'после 000318.02 у runes сохранённый «slug»)');
    }
  }
  assert.equal(mod.isRefPath('portraits', 'efir.json'), false,
    'portraits — вне шейпов');
  assert.equal(mod.isRef('assets/portraits/efir.json'), true,
    'portraits остаётся ref только через PORTRAITS_RE (AR3)');
});
