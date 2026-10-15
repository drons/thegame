// Задача 000220 — 5 строительных reagent'ов (wood_log, hide,
// herb_healing, herb_mana, herb_bitter) — находимы на карте (map-loot)
// и в подземельях (пулы «руда» DUNGEON_ORES). ТЗ: tasks/pending/
// 000220.md; контракты и таблица «где-что»: memory/
// 000220-building-reagents-spawn.md (§2 — источник правды для REAG-T1).
//
// КРАСНЫЕ ТЕСТЫ (TDD): падают на текущем (неизменённом) коде —
// осмысленная краснота: нет поля loot / нет записи в пуле / нет icon /
// нет svg-файла / 0 тайлов на карте / 0 залежей за sweep. Зелёные
// после: +loot и +icon у 5 JSON, +5 записей «руда» (append в конец),
// regen зеркал (sync:items/sync:dungeons), FALLBACK dungeon.js,
// +5 svg в assets/sprites/loot/.
//
// node-тесты (данные читаются require/fs — vm-цепочки подхватывают
// изменения автоматически, закрыто существующими LM*/DE*/IO-DEP*).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const M = require('../src/map.js');
const D = require('../src/dungeon.js');
const { ITEMS } = require('../src/items-data.js');
const DD = require('../src/dungeons-data.js');
const refLib = require('../scripts/lib/json-ref.js');
const { createCharacter } = require('../src/player.js');
const { decodePng } = require('./png.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const DDIR = path.join(ROOT, 'assets', 'dungeons');
const VISDS = new Set(['руда', 'минерал', 'самоцвет']);

// 5 строительных reagent'ов: id → файл каталога (индексы в ITEMS
// 34/36/38/39/40 — append-only, новых файлов предметов НЕТ).
const FIVE = [
  ['wood_log', '000035.json'],
  ['hide', '000037.json'],
  ['herb_healing', '000039.json'],
  ['herb_mana', '000040.json'],
  ['herb_bitter', '000041.json'],
];
const FIVE_IDS = new Set(FIVE.map(([id]) => id));
const DUN_FILES = fs.readdirSync(DDIR)
  .filter((f) => /^\d{6}\.json$/.test(f)).sort();

function itemJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, file), 'utf8'));
}
function dungeonJson(file) {
  return JSON.parse(fs.readFileSync(path.join(DDIR, file), 'utf8'));
}
// «руда» JSON-каталога — id-форма (ссылки 000211.05 резолвятся строго).
function resolvedRuda(dj, file) {
  assert.ok(Array.isArray(dj.руда), file + ': «руда» — массив');
  return dj.руда.map((rec, i) => {
    const r = refLib.resolveRef(ROOT, rec.предмет);
    assert.ok(r.ok, file + ' руда[' + i + ']: «' + rec.предмет
      + '» не резолвится: ' + r.reason);
    return { id: r.id, kind: rec.вид };
  });
}
function heroAt(xp) {
  const c = createCharacter();
  c.totalXp = xp;
  c.level = 1;
  return c;
}

// --- REAG-M1..M5: map-loot — поле loot в JSON + зеркало ≡ JSON ---

for (const [n, [id, file]] of FIVE.entries()) {
  test('000220 REAG-M' + (n + 1) + ': ' + id
    + ' — map-loot: поле loot в assets/items/' + file
    + ' (объект; terrains — непустой ⊆ 8 имён TERRAIN_NAMES; frequency ∈ [0,1]/отс.; near_mountains bool/отс.) + зеркало src/items-data.js ≡ JSON (deepEqual)', () => {
    const j = itemJson(file);
    assert.equal(j.id, id, file + ': предмет ' + id);
    assert.ok(j.loot && typeof j.loot === 'object' && !Array.isArray(j.loot),
      id + ': поле loot в assets/items/' + file + ' — объект '
      + '(краснота: поля loot нет — 000220); факт: ' + JSON.stringify(j.loot));
    const L = j.loot;
    assert.ok(Array.isArray(L.terrains) && L.terrains.length > 0,
      id + ': loot.terrains — непустой массив; факт: ' + JSON.stringify(L.terrains));
    const NAMES = Object.values(M.TERRAIN_NAMES);
    for (const x of L.terrains) {
      assert.equal(typeof x, 'string', id + ': loot.terrains — строки');
      assert.ok(NAMES.includes(x),
        id + ': террейн «' + x + '» ∈ 8 имён TERRAIN_NAMES');
    }
    if (L.frequency !== undefined) {
      assert.equal(typeof L.frequency, 'number', id + ': loot.frequency — число');
      assert.ok(L.frequency >= 0 && L.frequency <= 1,
        id + ': loot.frequency ∈ [0,1]; факт: ' + L.frequency);
    }
    if (L.near_mountains !== undefined) {
      assert.equal(typeof L.near_mountains, 'boolean',
        id + ': near_mountains — boolean');
    }
    const mirror = ITEMS.find((it) => it.id === id);
    assert.ok(mirror, id + ': предмет в зеркале src/items-data.js');
    assert.deepEqual(mirror, j,
      id + ': зеркало src/items-data.js ≡ JSON (deepEqual)');
  });
}

// --- REAG-D1..D5: подземелья — запись {предмет, вид} в пуле «руда»
//     (трёхстороннее согласие: JSON-каталог ≡ dungeons-data.js ≡
//     D.DUNGEON_ORES; «вид» ∈ enum) ---

for (const [n, [id]] of FIVE.entries()) {
  test('000220 REAG-D' + (n + 1) + ': ' + id
    + ' — запись {предмет, вид} в пуле руды: трёхстороннее согласие assets/dungeons/*.json ≡ src/dungeons-data.js ≡ D.DUNGEON_ORES; «вид» ∈ {руда, минерал, самоцвет}', () => {
    const inJson = [];
    for (const f of DUN_FILES) {
      const dj = dungeonJson(f);
      const pool = resolvedRuda(dj, f);
      for (const o of pool) {
        assert.ok(VISDS.has(o.kind),
          f + ' «руда» «' + o.id + '»: «вид» «' + o.kind + '» — enum {руда, минерал, самоцвет}');
        if (o.id === id) inJson.push(o.kind);
      }
    }
    assert.ok(inJson.length >= 1,
      id + ': запись {предмет, вид} в «руда» assets/dungeons/*.json '
      + '(краснота: ни в одном из 5 пулов записи нет — 000220); '
      + 'факт: 0 записей');
    const inDD = [];
    for (const rec of DD.DUNGEONS) {
      for (const o of rec.руда || []) {
        if (o.предмет === id) inDD.push(o.вид);
      }
    }
    assert.ok(inDD.length >= 1,
      id + ': запись в пуле src/dungeons-data.js (id-форма) '
      + '(краснота: зеркала ещё нет записи); факт: 0 записей');
    const inOres = [];
    for (const t of Object.keys(D.DUNGEON_ORES)) {
      for (const o of D.DUNGEON_ORES[t]) {
        if (o.предмет === id) inOres.push(o.вид);
      }
    }
    assert.ok(inOres.length >= 1,
      id + ': запись в D.DUNGEON_ORES (tabl. dungeon.js) '
      + '(краснота: таблицы dungeon.js ещё нет записи); факт: 0 записей');
    const kinds = new Set([...inJson, ...inDD, ...inOres]);
    assert.equal(kinds.size, 1,
      id + ': «вид» — единообразен в трёх источниках; факт: '
      + [...kinds].join('/'));
  });
}

// --- REAG-T1: таблица «где-что» (memory/000220-*.md §2) — пин ---

const T1_TABLE = [
  { id: 'wood_log', itemFile: '000035.json',
    loot: { terrains: ['лес'], frequency: 0.02 },
    icon: 'assets/sprites/loot/wood_log.svg',
    dungeonFile: '000003.json', type: 2, kind: 'минерал' },
  { id: 'hide', itemFile: '000037.json',
    loot: { terrains: ['лес'], frequency: 0.02 },
    icon: 'assets/sprites/loot/hide.svg',
    dungeonFile: '000003.json', type: 2, kind: 'минерал' },
  { id: 'herb_healing', itemFile: '000039.json',
    loot: { terrains: ['болото', 'лес'], frequency: 0.02 },
    icon: 'assets/sprites/loot/herb_healing.svg',
    dungeonFile: '000001.json', type: 0, kind: 'минерал' },
  { id: 'herb_mana', itemFile: '000040.json',
    loot: { terrains: ['болото', 'лес'], frequency: 0.02 },
    icon: 'assets/sprites/loot/herb_mana.svg',
    dungeonFile: '000002.json', type: 1, kind: 'минерал' },
  { id: 'herb_bitter', itemFile: '000041.json',
    loot: { terrains: ['болото', 'лес'], frequency: 0.02 },
    icon: 'assets/sprites/loot/herb_bitter.svg',
    dungeonFile: '000004.json', type: 3, kind: 'минерал' },
];

test("000220 REAG-T1: таблица «где-что» — точное размещение 5 reagent'ов (terrains/frequency/icon + dungeon-файл/тип/«вид» ≡ memory §2; новые записи — В КОНЕЦ «руда», порядок таблицы; ABYSS — без записей) + составы пулов deepEqual (каталог ↔ dungeons-data ↔ D.DUNGEON_ORES)", () => {
  const ddById = new Map(DD.DUNGEONS.map((r) => [r.id, r]));
  for (const e of T1_TABLE) {
    const j = itemJson(e.itemFile);
    assert.equal(j.id, e.id, e.itemFile + ': предмет ' + e.id);
    assert.deepEqual(j.loot, e.loot,
      e.id + ': loot — точное значение таблицы (краснота: поля loot нет); '
      + 'факт: ' + JSON.stringify(j.loot));
    assert.equal(j.icon, e.icon,
      e.id + ': icon — конвенция таблицы (краснота: свойства icon нет); '
      + 'факт: ' + JSON.stringify(j.icon));
    const dj = dungeonJson(e.dungeonFile);
    assert.equal(dj.id, e.type,
      e.dungeonFile + ': dungeon id = ' + e.type + ' (таблица)');
    const pool = resolvedRuda(dj, e.dungeonFile);
    const hits = pool.filter((o) => o.id === e.id);
    assert.equal(hits.length, 1,
      e.id + ': ровно одна запись в «руда» ' + e.dungeonFile
      + ' (краснота: записи нет); факт: ' + hits.length);
    assert.equal(hits[0].kind, e.kind,
      e.id + ': «вид» = «' + e.kind + '» (таблица); факт: «' + hits[0].kind + '»');
    const ddrec = ddById.get(e.type);
    assert.ok(ddrec, 'dungeons-data.js: запись типа ' + e.type);
    const ddpool = (ddrec.руда || []).filter((o) => o.предмет === e.id);
    assert.equal(ddpool.length, 1,
      e.id + ': ровно одна запись в src/dungeons-data.js (тип ' + e.type
      + ') (краснота: записи нет); факт: ' + ddpool.length);
    assert.equal(ddpool[0].вид, e.kind,
      e.id + ': «вид» в зеркале = «' + e.kind + '»; факт: «' + ddpool[0].вид + '»');
    const opool = (D.DUNGEON_ORES[e.type] || []).filter((o) => o.предмет === e.id);
    assert.equal(opool.length, 1,
      e.id + ': ровно одна запись в D.DUNGEON_ORES[' + e.type
      + '] (краснота: записи нет); факт: ' + opool.length);
    assert.equal(opool[0].вид, e.kind,
      e.id + ': «вид» в D.DUNGEON_ORES = «' + e.kind + '»; факт: «' + opool[0].вид + '»');
    const abyss = (D.DUNGEON_ORES[D.DUNGEON_TYPES.ABYSS] || [])
      .filter((o) => o.предмет === e.id);
    assert.equal(abyss.length, 0,
      e.id + ': ABYSS-пул — БЕЗ записи (решение 000220 §3.6: +0)');
  }
  for (const f of DUN_FILES) {
    const dj = dungeonJson(f);
    const pool = resolvedRuda(dj, f);
    const tail = T1_TABLE.filter((e) => e.dungeonFile === f).map((e) => e.id);
    for (let i = 0; i < tail.length; i++) {
      const at = pool.length - tail.length + i;
      assert.ok(at >= 0, f + ': «руда» короче хвоста таблицы: ' + pool.length);
      assert.equal(pool[at].id, tail[i],
        f + ': позиция ' + at + ' — «' + tail[i] + '» (новые записи — '
        + 'В КОНЕЦ массива, порядок таблицы); факт: «' + pool[at].id + '»');
    }
    const ddrec = ddById.get(dj.id);
    assert.ok(ddrec, f + ': зеркало dungeons-data.js — запись id=' + dj.id);
    const resolved = pool.map((o) => ({ предмет: o.id, вид: o.kind }));
    assert.deepEqual(ddrec.руда, resolved,
      f + ': зеркало src/dungeons-data.js ≡ каталог (deepEqual)');
    assert.deepEqual(D.DUNGEON_ORES[dj.id], resolved,
      f + ': D.DUNGEON_ORES[' + dj.id + '] ≡ каталог (deepEqual)');
  }
});

// --- REAG-I1: icon + 5 svg ---

test("000220 REAG-I1: 5 reagent'ов — icon = assets/sprites/loot/<id>.svg (конец объекта — паттерн 000211.06) + 5 svg-файлов существуют", () => {
  for (const [id, file] of FIVE) {
    const j = itemJson(file);
    assert.equal(j.icon, 'assets/sprites/loot/' + id + '.svg',
      id + ': icon = assets/sprites/loot/<id>.svg (краснота: свойства '
      + 'icon в JSON-записи нет); факт: ' + JSON.stringify(j.icon));
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/sprites/loot/' + id + '.svg')),
      id + ': svg-файл assets/sprites/loot/' + id + '.svg существует '
      + '(краснота: файла нет)');
  }
});

// --- REAG-G1: нахождимость на карте (окно 240×240, реальный map.png) ---

test('000220 REAG-G1: нахождимость на карте — окно 240×240 (реальный assets/map.png): для каждого из 5 id ≥1 пустой тайл с tileAt.loot.item = id', () => {
  const { width, height, data } = decodePng(path.join(ROOT, 'assets/map.png'));
  const map = M.createMap({ width, height, data });
  const R = 120;
  const counts = {};
  for (let x = -R; x < R; x++) {
    for (let y = -R; y < R; y++) {
      const t = map.tileAt(x, y);
      if (!t.passable || t.inBuilding || t.hasMobGroup) continue;
      if (!t.loot || typeof t.loot !== 'object') continue;
      if (!FIVE_IDS.has(t.loot.item)) continue;
      counts[t.loot.item] = (counts[t.loot.item] || 0) + 1;
    }
  }
  for (const [id] of FIVE) {
    assert.ok(counts[id] >= 1,
      id + ': на карте ≥1 пустой тайл с loot.item = id (аналог ML4 «∃ '
      + 'тайл с лутом»; детерм. — hash2+seed фиксированы) (краснота: '
      + '0 тайлов — предмета нет в map-loot); факт: ' + (counts[id] || 0));
  }
});

// --- REAG-G2: нахождимость в подземельях (sweep 5 типов × xp × depth) ---

test('000220 REAG-G2: нахождимость в подземельях — sweep (5 типов × xp 1..123 × depth 1..8, детерм.): каждый из 5 id встречается в ≥1 сгенерированной залежи', () => {
  const PX = M.syntheticPixels(8, 8, 128, 128, 128, 255);
  const PXA = M.syntheticPixels(8, 8, 40, 40, 40, 10);
  const ENTRIES = [
    ['CAVE', 37, -12, PX, M.TERRAIN.GRASS],
    ['CRYPT', 5, 5, PX, M.TERRAIN.FOREST],
    ['RUINS', 5, 5, PX, M.TERRAIN.HILL],
    ['DROWNED', 5, 5, PX, M.TERRAIN.SWAMP],
    ['ABYSS', 11, 3, PXA, M.TERRAIN.MOUNTAIN],
  ];
  const seen = {};
  let gens = 0;
  for (const [name, x, y, px, terrain] of ENTRIES) {
    const d = D.createDungeon(x, y, px, terrain);
    assert.equal(d.type, D.DUNGEON_TYPES[name], name + ': сценарий типа');
    for (let xp = 1; xp <= 123; xp++) {
      for (let depth = 1; depth <= 8; depth++) {
        const c = D.generateDungeonContents(d, heroAt(xp), { depth });
        gens++;
        for (const dep of c.deposits) {
          if (FIVE_IDS.has(dep.item)) {
            seen[dep.item] = (seen[dep.item] || 0) + 1;
          }
        }
      }
    }
  }
  assert.equal(gens, 5 * 123 * 8,
    'sweep: 4920 генераций (5 типов × xp 1..123 × depth 1..8)');
  for (const [id] of FIVE) {
    assert.ok(seen[id] >= 1,
      id + ': ≥1 сгенерированная залежь за sweep (паттерн вероятностного '
      + 'пина ORE-5) (краснота: предмета нет в пуле — генерация никогда '
      + 'его не выдаст); факт: ' + (seen[id] || 0));
  }
});
