// Задача 000350 — заклинание школы защиты «Показать врагов» (show_enemies):
// длительный (дни) эффект, включающий отрисовку окружностей радиуса
// агрессии на глобальной карте.
//
// Контракт (tasks/done/000350.md, memory/000350-show-enemies.md):
//   * длительность 1 + Math.floor(Интеллект/10) ДНЕЙ (конвенция floor —
//     прецедент decadanceLevels/attractionRadius; формула читает
//     hero.primary.intelligence, JSON-атрибут — wisdom, инвариант школы
//     защита — прецедент .349 Ф2); снапшот в момент каста:
//     expiresDay = day + days, перезаклинание — in place;
//   * запись в hero.outOfCombatEffects {spellId, expiresDay} — механизм
//     длительных эффектов 000235.02 (В ОТЛИЧИЕ от мгновенных .348/.349);
//     истечение — expireOutOfCombatEffects на смене дня;
//   * рендер — Проход 2.5 (000172/000233) поверх глобальной карты:
//     тонкая красная пунктирная полупрозрачная окружность радиуса
//     агрессии (ЕДИНЫЙ источник G.groupZoneInfo — 000135/000233) для
//     каждой триггерящей группы; ПО УМОЛЧАНИЮ НЕ ВИДНО — только при
//     активном эффекте (гейт isHeroEnemiesShown(hero, clock.day),
//     expiresDay > day — паттерн isHeroLit);
//   * свитка НЕТ (прецедент .349) — items 0-diff; learnability — здания
//     monastery + healing_temple + mountain_temple (сет warding_circle).
//
// Валидатор 000235.02: действие «внебой» требует статические
// параметры.days 1..3 — здесь длительность ДИНАМИЧЕСКАЯ, поэтому id в
// множестве исключений (days считается формулой); для всех прочих
// spell-ов валидатор бит-в-бит (мутация M2 ловит ослабление).
//
// КРАСНЫЕ до реализации (осмысленные ERR_ASSERTION, без краха загрузки):
//   S-JSON-1 / S-SWEEP-2 — файла нет;
//   S-MIRROR-3 — записи нет в зеркале spells-data;
//   S-DAYS-4 — экспорт showEnemiesDays отсутствует;
//   S-CAST-5 — «неизвестное заклинание» вместо ветки;
//   S-EXPIRE-6 / S-GUARDS-7 — экспорт isHeroEnemiesShown отсутствует;
//   S-VM-OFF-8 — гейта нет: арки рисуются в дефолтном кадре (красный);
//   S-VM-ON-9 — guard-пресуппозиция: гейт-хелпера нет в G.Spells;
//   S-VM-BOUND-10 — (а) арки при expiresDay===day (мастер рисует всегда);
//   S-VM-BOOK-11 — строки книги нет (спелла нет в каталоге).
//
// Харнес vm — дубль tests/mob-aggro-circle.test.js (000172: set-trap
// 2d-журнал, детерминированный фолбэк-мир) + localStorage-стаб и
// клик-по-строке из tests/spellbook-oc-e2e.test.js (000235.02).
// Дублирование харнессов принято (000083/000087).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { createCharacter } = require('../src/player.js');
const { createCombat } = require('../src/combat.js');
const { validate } = require('./json-schema.js');
const S = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
const SPELL_FILE = path.join(ROOT, 'assets', 'spells', 'show_enemies.json');
const SPELL_ICON = path.join(ROOT, 'assets', 'spell-icons',
  'show_enemies.svg');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const ICONS_DIR = path.join(ROOT, 'assets', 'spell-icons');
const SPELL_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(SPELLS_DIR, 'schema.json'), 'utf8'));

const MANA = 8;
const KEY_ORDER = ['id', 'название', 'школа', 'база', 'степень', 'атрибут',
  'уровень', 'мани', 'действие', 'вне_боя', 'здания',
  'описание', 'icon', 'icon_prompt'];
const DESC = 'Показать врагов: 1 + Интеллект/10 дней — пока эффект активен, '
  + 'на глобальной карте видны окружности радиуса агрессии только вокруг '
  + 'видимых агрессивных и территориальных групп с радиусом больше нуля.';

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}
function loadSpellsData() { return require('../src/spells-data.js'); }
function loadSpells() { return require('../src/spells.js'); }

function spellHero({ spells, intelligence = 10, mp = 30, level = 3 } = {}) {
  const p = createCharacter();
  p.primary.intelligence = intelligence;
  p.level = level;
  p.mp = mp;
  p.spells = spells.slice();
  return p;
}
function soloCombat(p, mobId = 'wolf') {
  const c = createCombat({ player: p, mobs: [mobId], mobLevel: 2, seed: 5 });
  const u = c.units[0];
  u.x = c.px; u.y = c.py - 1;
  return c;
}

// Длительность — ЛОКАЛЬНАЯ таблица (анти-самоуспокоение: не зовём
// showEnemiesDays из-под теста, а пересчитываем формулу ТЗ сами).
function localDays(intelligence) {
  const v = (typeof intelligence === 'number'
    && Number.isFinite(intelligence) && intelligence > 0)
    ? intelligence : 0;
  return 1 + Math.floor(v / 10);
}

// =====================================================================
// S-JSON-1 — файл заклинания: схема, slug-шейп, порядок ключей, roundtrip
// =====================================================================

test('S-JSON-1: assets/spells/show_enemies.json — есть, схема чиста, basename==id+.json, порядок ключей (внебой БЕЗ «параметры»/«предметы»), roundtrip-канон, поля по фиксированному решению', () => {
  assert.ok(fs.existsSync(SPELL_FILE),
    'RED: файл assets/spells/show_enemies.json отсутствует');
  const raw = fs.readFileSync(SPELL_FILE, 'utf8');
  const s = JSON.parse(raw);
  const errors = [];
  validate(SPELL_SCHEMA, s, 'show_enemies.json', errors);
  assert.deepEqual(errors, [], 'схема каталога spells: '
    + JSON.stringify(errors));
  assert.equal(s.id, 'show_enemies');
  assert.equal('show_enemies.json', path.basename(SPELL_FILE),
    'slug-именование (ref-шейп spells, прецедент .348/.349)');
  assert.deepEqual(Object.keys(s), KEY_ORDER,
    'порядок ключей — decadance-шейп без «предметы»; «параметров» НЕТ '
    + '(длительность динамическая — формула, а не статика 1..3)');
  assert.equal(raw, JSON.stringify(s, null, 2) + '\n',
    'roundtrip-канон: 2-пробела + \\n');
  assert.equal(s['название'], 'Показать врагов');
  assert.equal(s['школа'], 'защита');
  assert.equal(s['база'], null);
  assert.equal(s['степень'], 1);
  assert.equal(s['атрибут'], 'wisdom',
    'инвариант школы защита — атрибут wisdom (все защиты); формула '
    + 'при этом читает Интеллект — прецедент .349 Ф2');
  assert.equal(s['уровень'], 2);
  assert.equal(s['мани'], MANA);
  assert.equal(s['действие'], 'внебой',
    'действие «внебой» ∈ OUT_OF_COMBAT ⇒ боевой отказ бесплатный');
  assert.equal(s['вне_боя'], true);
  assert.ok(!('параметры' in s),
    '«параметры» НЕТ: days динамический (1+floor(Инт/10))');
  assert.ok(!('предметы' in s), 'свитка НЕТ (бриф, прецедент .349)');
  assert.deepEqual(s['здания'], [
    'assets/buildings/monastery.json',
    'assets/buildings/healing_temple.json',
    'assets/buildings/mountain_temple.json',
  ], 'здания — сет warding_circle (единственный внебоевой защиты)');
  assert.equal(s['описание'], DESC);
  assert.equal(s['icon'], 'assets/spell-icons/show_enemies.svg');
  assert.ok(typeof s['icon_prompt'] === 'string' && s['icon_prompt'],
    'icon_prompt — schema.required');
});

// =====================================================================
// S-SWEEP-2 — каталожный свип: уникальности id/названия/иконки/sha256
// =====================================================================

test('S-SWEEP-2: свип каталога — show_enemies ∈ каталога, id/название/иконка уникальны, sha256 иконки уникален среди всех spell-icons', () => {
  const files = fs.readdirSync(SPELLS_DIR)
    .filter((f) => f !== 'schema.json' && /^[a-z][a-z0-9_]*\.json$/.test(f));
  assert.ok(files.includes('show_enemies.json'),
    'RED: show_enemies.json отсутствует в каталоге');
  const rec = readJson(SPELL_FILE);
  assert.equal(rec.id, 'show_enemies');
  const ids = files.map((f) => readJson(path.join(SPELLS_DIR, f)).id);
  assert.equal(new Set(ids).size, ids.length, 'id уникальны');
  const names = files.map((f) => readJson(path.join(SPELLS_DIR, f))['название']);
  assert.equal(new Set(names).size, names.length, 'названия уникальны');
  const icons = files.map((f) => readJson(path.join(SPELLS_DIR, f)).icon);
  assert.equal(new Set(icons).size, icons.length, 'icon уникальны');
  assert.ok(fs.existsSync(SPELL_ICON), 'RED: иконка отсутствует');
  const svgFiles = fs.readdirSync(ICONS_DIR).filter((f) => f.endsWith('.svg'));
  const digests = new Map();
  for (const f of svgFiles) {
    const d = crypto.createHash('sha256')
      .update(fs.readFileSync(path.join(ICONS_DIR, f))).digest('hex');
    assert.ok(!digests.has(d),
      'sha256-коллизия иконок: ' + f + ' == ' + digests.get(d));
    digests.set(d, f);
  }
  const mine = crypto.createHash('sha256')
    .update(fs.readFileSync(SPELL_ICON)).digest('hex');
  assert.equal(digests.get(mine), 'show_enemies.svg');
});

// =====================================================================
// S-MIRROR-3 — зеркало spells-data (резолв refs, лекс. позиция); items —
// НЕ двигается (свитка нет)
// =====================================================================

test('S-MIRROR-3: зеркало — SPELLS_BY_ID.show_enemies ≡ JSON (здания→[19,21,38], база null, без «предметы»), лекс. позиция между shield_wall и shroud, items 0-diff', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.show_enemies,
    'RED: show_enemies отсутствует в зеркале src/spells-data.js '
    + '(нужен node scripts/sync-spells-data.js в том же коммите)');
  assert.ok(fs.existsSync(SPELL_FILE), 'RED: файл заклинания отсутствует');
  const s = readJson(SPELL_FILE);
  const m = dataMod.SPELLS_BY_ID.show_enemies;
  const expected = Object.assign({}, s);
  expected['здания'] = s['здания'].map(
    (p) => readJson(path.join(ROOT, p)).id);
  assert.deepEqual(expected['здания'], [19, 21, 38],
    'фикстура: monastery → 19, healing_temple → 21, mountain_temple → 38');
  assert.deepEqual(m, expected,
    'зеркало — JSON с REF-резолвом sync (здания → цели-id, база null '
    + 'сохраняется, «вне_боя» переезжает в конец — контракт 000318)');
  const ids = dataMod.SPELLS.map((x) => x.id);
  assert.equal(ids.filter((x) => x === 'show_enemies').length, 1);
  const at = ids.indexOf('show_enemies');
  assert.ok(at > 0, 'запись в зеркале не первая');
  assert.equal(ids[at - 1], 'shield_wall',
    'lex по id: между shield_wall и shroud');
  assert.equal(ids[at + 1], 'shroud');
  const itemsMod = require('../src/items-data.js');
  assert.ok(!itemsMod.ITEMS.some((x) => x.id === 'show_enemies'
      || x.id === 'show_enemies_scroll'),
    'items 0-diff: свиток show_enemies_scroll НЕ создавался (бриф)');
});

// =====================================================================
// S-DAYS-4 — showEnemiesDays: 1 + floor(Инт/10)
// =====================================================================

test('S-DAYS-4: Spells.showEnemiesDays — 1 + Math.floor(инт/10): undefined/0/9→1, 10/19→2, 20/29→2, 30/39→3, 20→3, 55→6; мусор (¬число/NaN/−5/∞)→1', () => {
  const Spells = loadSpells();
  assert.equal(typeof Spells.showEnemiesDays, 'function',
    'RED: экспорт showEnemiesDays в src/spells.js отсутствует');
  const cases = [
    [undefined, 1], [0, 1], [9, 1], [9.9, 1], [10, 2], [19, 2],
    [20, 3], [29, 3], [30, 4], [39, 4], [50, 6], [55, 6],
  ];
  for (const [int, want] of cases) {
    assert.equal(Spells.showEnemiesDays(int), want,
      'Интеллект ' + String(int) + ' → ' + want + ' дней (пол — '
      + 'конвенция floor, прецедент decadanceLevels)');
  }
  for (const junk of ['x', null, NaN, Infinity, -Infinity, -5, {}]) {
    assert.equal(Spells.showEnemiesDays(junk), 1,
      'мусор ' + String(junk) + ' → база 1 день');
  }
});

// =====================================================================
// S-CAST-5 — castOutOfCombat: ветка show_enemies + боковой бой
// =====================================================================

test('S-CAST-5: castOutOfCombat show_enemies — expiresDay = day + (1+floor(Инт/10)), РОВНО 1 запись, мана −8 ровно; перезаклинание in place; чужие записи целы; mp<8 / не изучено / неизвестный — 0 мутаций; в бою — бесплатный отказ по действию', () => {
  const dataMod = loadSpellsData();
  assert.ok(dataMod.SPELLS_BY_ID.show_enemies,
    'RED: show_enemies отсутствует в каталоге/зеркале');
  const { castOutOfCombat, castSpell, canCastSpell } = loadSpells();
  const p = spellHero({ spells: ['show_enemies'], intelligence: 12, mp: 30 });
  p.outOfCombatEffects = [{ spellId: 'firelight', expiresDay: 9 }];
  const r = castOutOfCombat(p, 'show_enemies', 5, {});
  assert.equal(r.ok, true, 'каст ок; reason: ' + r.reason);
  assert.equal(localDays(12), 2, 'фикстура: Инт 12 → 2 дня');
  assert.equal(r.expiresDay, 5 + 2,
    'expiresDay = день каста + длительность (дни от активации, '
    + 'день НЕ тратится — фиксация решения)');
  assert.equal(r.spell.id, 'show_enemies');
  assert.deepEqual(p.outOfCombatEffects, [
    { spellId: 'firelight', expiresDay: 9 },
    { spellId: 'show_enemies', expiresDay: 7 },
  ], 'чужая запись цела, новая — ровно {spellId, expiresDay} без хвостов');
  assert.equal(p.mp, 30 - MANA, 'мана списана ровно 8');
  const r2 = castOutOfCombat(p, 'show_enemies', 8, {});
  assert.equal(r2.ok, true, 'перезаклинание в более поздний день ок');
  assert.equal(r2.expiresDay, 8 + 2, 'обновление от НОВОГО дня');
  assert.deepEqual(p.outOfCombatEffects, [
    { spellId: 'firelight', expiresDay: 9 },
    { spellId: 'show_enemies', expiresDay: 10 },
  ], 'in place: дублей нет, expiresDay обновлён');
  assert.equal(p.mp, 30 - 2 * MANA, 'вторая мана списана ровно');
  const poor = spellHero({ spells: ['show_enemies'], intelligence: 12 });
  poor.mp = MANA - 1;
  const rPoor = castOutOfCombat(poor, 'show_enemies', 5, {});
  assert.equal(rPoor.ok, false);
  assert.equal(rPoor.reason, 'не хватает маны');
  assert.equal(poor.mp, MANA - 1, 'отказ ⇒ мана цела');
  assert.deepEqual(poor.outOfCombatEffects || [], [],
    'отказ ⇒ 0 записей');
  const rUnknown = castOutOfCombat(
    spellHero({ spells: [] }), 'show_enemies', 5, {});
  assert.equal(rUnknown.reason, 'заклинание не изучено');
  const c = soloCombat(p, 'wolf');
  const poolBefore = c.ps.spellInt;
  const mirror = canCastSpell(c, 'show_enemies');
  const core = castSpell(c, 'show_enemies');
  assert.equal(core.ok, false, 'в бою не кастуется');
  assert.equal(core.reason, 'внебоевое заклинание',
    'гейт по действию «внебой» ∈ OUT_OF_COMBAT (000235.01); факт: «'
    + core.reason + '»');
  assert.equal(mirror.ok, false, 'зеркало: тот же отказ');
  assert.equal(mirror.reason, core.reason);
  assert.equal(c.ps.spellInt, poolBefore, 'пул не тронут');
  assert.equal(p.mp, 30 - 2 * MANA, 'мана не тронута боевым отказом');
});

// =====================================================================
// S-EXPIRE-6 — граница дней: активен при expiresDay > day; expire-вырезка
// =====================================================================

test('S-EXPIRE-6: isHeroEnemiesShown активна при expiresDay > day (=day — уже нет); expireOutOfCombatEffects вырезает запись на дне истечения', () => {
  const Spells = loadSpells();
  assert.equal(typeof Spells.isHeroEnemiesShown, 'function',
    'RED: экспорт isHeroEnemiesShown в src/spells.js отсутствует');
  const p = { outOfCombatEffects: [
    { spellId: 'show_enemies', expiresDay: 7 },
  ] };
  assert.equal(Spells.isHeroEnemiesShown(p, 5), true, 'день 5 < 7 — видно');
  assert.equal(Spells.isHeroEnemiesShown(p, 6), true, 'день 6 < 7 — видно');
  assert.equal(Spells.isHeroEnemiesShown(p, 7), false,
    'день 7 == expiresDay — истекло (паттерн isHeroLit «>», НЕ «>=» '
    + 'квирка isHeroCamped); длительность «2 дня» от дня 5 = дни 5,6');
  assert.equal(Spells.isHeroEnemiesShown(p, 8), false);
  const kept = Spells.expireOutOfCombatEffects(p.outOfCombatEffects, 6);
  assert.equal(kept.length, 1, 'на день 6 запись жива');
  const expired = Spells.expireOutOfCombatEffects(p.outOfCombatEffects, 7);
  assert.deepEqual(expired, [], 'на день 7 (onDay) — вырезана');
});

// =====================================================================
// S-GUARDS-7 — isHeroEnemiesShown: fail-closed на мусоре, spellId-гейт
// =====================================================================

test('S-GUARDS-7: isHeroEnemiesShown — не-объект/нет массива/мусор-записи/битый expiresDay/другой spellId → false; generic-«внебой» (warding_circle) НЕ матчится', () => {
  const Spells = loadSpells();
  assert.equal(typeof Spells.isHeroEnemiesShown, 'function',
    'RED: экспорт isHeroEnemiesShown отсутствует');
  const f = Spells.isHeroEnemiesShown;
  assert.equal(f(null, 5), false);
  assert.equal(f(undefined, 5), false);
  assert.equal(f(42, 5), false);
  assert.equal(f({}, 5), false, 'нет массива outOfCombatEffects');
  assert.equal(f({ outOfCombatEffects: 'x' }, 5), false);
  assert.equal(f({ outOfCombatEffects: [null, 'x', 7, []] }, 5), false,
    'мусорные записи пропускаются');
  assert.equal(f({ outOfCombatEffects: [
    { spellId: 'firelight', expiresDay: 99 },
  ] }, 5), false, 'другой spellId');
  assert.equal(f({ outOfCombatEffects: [
    { spellId: 'show_enemies', expiresDay: '99' },
  ] }, 5), false, 'expiresDay не число');
  assert.equal(f({ outOfCombatEffects: [
    { spellId: 'show_enemies', expiresDay: NaN },
  ] }, 5), false);
  assert.equal(f({ outOfCombatEffects: [
    { spellId: 'show_enemies' },
  ] }, 5), false, 'expiresDay отсутствует');
  assert.equal(f({ outOfCombatEffects: [
    { spellId: 'warding_circle', expiresDay: 99 },
  ] }, 5), false,
    'spellId-гейт: generic-«внебой» (warding_circle) не включает круги');
});

// =====================================================================
// vm-харнес (дубль mob-aggro-circle + oc-e2e)
// =====================================================================

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));

const VIEW_W = 1280;
const VIEW_H = 720;
const NOW = 1000;
const EPS = 1e-6;

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true;
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  const norm = (v) => (Array.isArray(v) ? [...v] : v);
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k]
      : (...args) => { calls.push([k, args.map(norm)]); }),
    set: (t, k, v) => {
      t[k] = v;
      calls.push(['set:' + k, [norm(v)]]);
      return true;
    },
  });
}

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    textContent: '',
    title: '',
    style: {},
    dataset: {},
    attrs: {},
    children: [],
    listeners: {},
    appendChild(ch) { target.children.push(ch); return ch; },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; },
    closest() { return null; },
    setAttribute(k, v) { target.attrs[k] = v; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    remove() {},
    blur() {},
  };
  if (tag === 'canvas') {
    target.getContext = (kind) => (kind === '2d'
      ? makeContext2d(target) : null);
  }
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined;
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function bootSandbox() {
  const winListeners = {};
  const raf = [];
  const warns = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage();
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null
    ),
    body: makeEl('body'),
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: VIEW_W,
    innerHeight: VIEW_H,
    location: { search: '' },
    localStorage: storage,
    addEventListener: (t, f) => {
      (winListeners[t] || (winListeners[t] = [])).push(f);
    },
    removeEventListener() {},
  };
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        self.__asset = v;
        Promise.resolve().then(() => {
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: (m) => warns.push(String(m)),
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return {
    sandbox, winListeners, raf, warns, errors, storage,
    gameCanvas, spriteCanvas, hud,
    body: document.body,
  };
}

const drain = () => new Promise((r) => setImmediate(r));

async function boot() {
  const h = bootSandbox();
  await drain();
  await drain();
  await drain();
  return h;
}

function frameOnce(h) {
  const n0 = h.spriteCanvas.drawCalls.length;
  h.raf[h.raf.length - 1](NOW);
  return h.spriteCanvas.drawCalls.slice(n0);
}

function tileDraws(calls) {
  return calls.filter((c) => c[0] === 'drawImage'
    && c[1][0]
    && typeof c[1][0].__asset === 'string'
    && c[1][0].__asset.startsWith('assets/tiles/'));
}

function arcsOf(calls) {
  const out = [];
  for (let i = 0; i < calls.length; i++) {
    if (calls[i][0] === 'arc') {
      out.push({
        i,
        cx: calls[i][1][0], cy: calls[i][1][1], r: calls[i][1][2],
        a0: calls[i][1][3], a1: calls[i][1][4],
      });
    }
  }
  return out;
}

function expectedAgroCircles(G, myMap, cam, zoom) {
  const range = G.visibleTileRange(cam.x, cam.y, VIEW_W, VIEW_H, zoom);
  const out = [];
  for (let ty = range.y0; ty <= range.y1; ty++) {
    for (let tx = range.x0; tx <= range.x1; tx++) {
      const t = myMap.tileAt(tx, ty);
      if (!t.hasMobGroup) continue;
      const info = G.groupZoneInfo(t.mobGroup);
      if (!info || !info.triggers || !(info.radius > 0)) continue;
      const c = G.worldToScreen(tx + 0.5, ty + 0.5, cam.x, cam.y,
        zoom, VIEW_W, VIEW_H);
      out.push({ x: tx, y: ty, cx: c.x, cy: c.y, r: info.radius * zoom });
    }
  }
  return out;
}

// Чистая загрузка + первый кадр (паттерн scene() из mob-aggro-circle).
async function scene() {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет (порядок цепочки): ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const st = g.state;
  assert.ok(st.map, 'карта сгенерирована');
  assert.equal(st.map.fromPng, false,
    'map.png в стабе провалился → фолбэк G.generateSeedPixels');
  assert.ok(st.player, 'спавн найден');
  assert.equal(st.sprites.ready, st.sprites.total, 'все ассеты загрузились');
  const calls = frameOnce(h);
  assert.ok(tileDraws(calls).length > 0,
    'текстуры тайлов нарисованы (слой спрайтов не пустой)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  return { h, g, st, calls, G, myMap };
}

// Сид эффекта: state.hero.outOfCombatEffects — та же ссылка, что live-hero
// (main.js:4551 «outOfCombatEffects: hero.outOfCombatEffects»).
function seedEffect(g, expiresDay) {
  const arr = g.state.hero.outOfCombatEffects;
  assert.ok(Array.isArray(arr), 'сценарий: live-массив outOfCombatEffects');
  arr.push({ spellId: 'show_enemies', expiresDay: expiresDay });
}

function assertAgsMatchExpected(arcs, expected, label) {
  assert.equal(arcs.length, expected.length,
    label + ': окружностей в кадре ' + arcs.length + ', ожидалось '
    + expected.length);
  const pool = expected.slice();
  for (const a of arcs) {
    const i = pool.findIndex((e) =>
      Math.abs(e.cx - a.cx) < EPS
      && Math.abs(e.cy - a.cy) < EPS
      && Math.abs(e.r - a.r) < EPS);
    assert.ok(i >= 0, label + ': неожиданная окружность (' + a.cx + ','
      + a.cy + ',' + a.r + ')');
    pool.splice(i, 1);
  }
  assert.equal(pool.length, 0, label + ': не нарисованы: '
    + JSON.stringify(pool.slice(0, 3)));
}

function key(h, code) {
  const e = { code, preventDefault() {}, stopPropagation() {} };
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
}

function findRows(el, id, out) {
  if (el && el.attrs && el.attrs['data-spell-id'] === id) out.push(el);
  for (const ch of (el && el.children) || []) findRows(ch, id, out);
  return out;
}

function clickRow(h, id) {
  const rows = findRows(h.body, id, []);
  assert.equal(rows.length, 1, 'строка ' + id + ' в книге — ровно 1');
  const l = rows[0].listeners && rows[0].listeners.click;
  assert.ok(l && l.length > 0, 'строка ' + id + ' — свой click-listener');
  l[l.length - 1]();
}

function saveHero(h) {
  const bu = h.winListeners['beforeunload'];
  assert.ok(bu && bu.length > 0, 'beforeunload зарегистрирован');
  bu[0]();
  const raw = h.storage.getItem(S.SAVE_KEY);
  assert.ok(raw, 'сейв в localStorage');
  return JSON.parse(raw).data.hero;
}

// Стиль-байты 000233 §3.2: 9-токенное окно вокруг каждого arc —
// beginPath → dash[6,6] → strokeStyle → lineWidth → fillStyle → arc →
// fill → stroke → dash-гигиена.
function assertCircleStyle(calls, a) {
  const win = calls.slice(a.i - 5, a.i + 4);
  assert.equal(win.length, 9, 'arc: окно из 9 токенов (стиль пер-круг)');
  assert.equal(win[0][0], 'beginPath');
  assert.deepEqual(win[1], ['setLineDash', [[6, 6]]]);
  assert.deepEqual(win[2], ['set:strokeStyle', ['rgba(255, 64, 56, 0.9)']]);
  assert.deepEqual(win[3], ['set:lineWidth', [2]]);
  assert.deepEqual(win[4], ['set:fillStyle', ['rgba(255, 64, 56, 0.10)']]);
  assert.equal(win[5][0], 'arc');
  assert.equal(win[6][0], 'fill', 'fill СРАЗУ после arc');
  assert.equal(win[7][0], 'stroke', 'stroke СРАЗУ после fill');
  assert.deepEqual(win[8], ['setLineDash', [[]]],
    'dash-гигиена после stroke');
}

// =====================================================================
// S-VM-OFF-8 — по умолчанию НЕ видно (ТЗ)
// =====================================================================

test('S-VM-OFF-8: (vm) по умолчанию — при >=2 триггерящих группах в кадре РОВНО 0 окружностей; слой не пустой, load-clean', async () => {
  const { st, calls, G, myMap } = await scene();
  const expected = expectedAgroCircles(G, myMap, st.cam, st.zoom);
  assert.ok(expected.length >= 2,
    'сценарий: >= 2 триггерящих группы в кадре (найдено '
    + expected.length + ') — иначе проверка вакуумна');
  const arcs = arcsOf(calls);
  assert.equal(arcs.length, 0,
    'ТЗ: «по умолчанию окружности не видны» — в дефолтном кадре арков '
    + 'быть не может; найдено ' + arcs.length
    + ' (гейт isHeroEnemiesShown отсутствует/не сработал)');
  assert.ok(tileDraws(calls).length > 0, 'анти-вакуум: тайлы рисуются');
});

// =====================================================================
// S-VM-ON-9 — сид эффекта: арки == expectedAgroCircles + стиль 000233
// =====================================================================

test('S-VM-ON-9: (vm) активный эффект — мультимножество арков == expectedAgroCircles (радиус из groupZoneInfo), стиль/порядок 000233 бит-в-бит, лишних нет', async () => {
  const { h, g, st, G, myMap } = await scene();
  const S2 = h.sandbox.Game.Spells;
  assert.equal(typeof S2.isHeroEnemiesShown, 'function',
    'RED: гейт-хелпер Spells.isHeroEnemiesShown не экспортирован');
  seedEffect(g, 999);
  const calls = frameOnce(h);
  const arcs = arcsOf(calls);
  const expected = expectedAgroCircles(G, myMap, st.cam, st.zoom);
  assert.ok(expected.length >= 2, 'сценарий: >= 2 группы в кадре');
  assertAgsMatchExpected(arcs, expected, 'эффект активен');
  for (const a of arcs) assertCircleStyle(calls, a);
  assert.equal(arcs.filter((a) => !(a.a0 === 0 && Math.abs(a.a1 - Math.PI * 2) < EPS)).length, 0,
    'дуги — полные окружности 0..2π');
});

// =====================================================================
// S-VM-BOUND-10 — граница дней в рендере
// =====================================================================

test('S-VM-BOUND-10: (vm) expiresDay === clock.day — арков нет; clock.day + 1 — арки есть (граница «>», день истечения — уже темно)', async () => {
  const exp = await scene();
  const day = exp.st.day;
  seedEffect(exp.g, day);
  const offCalls = frameOnce(exp.h);
  assert.equal(arcsOf(offCalls).length, 0,
    'expiresDay === day — эффект истёк (паттерн isHeroLit «>»); арки '
    + 'не рисуются');
  const on = await scene();
  seedEffect(on.g, on.st.day + 1);
  const onCalls = frameOnce(on.h);
  const arcs = arcsOf(onCalls);
  const expected = expectedAgroCircles(on.G, on.myMap, on.st.cam, on.st.zoom);
  assert.ok(expected.length >= 2, 'сценарий: >= 2 группы в кадре');
  assertAgsMatchExpected(arcs, expected, 'день до истечения');
});

// =====================================================================
// S-VM-BOOK-11 — полный контур: книга [B] → клик строки → запись + мана
// → арки в следующем кадре → истечение гасит арки
// =====================================================================

test('S-VM-BOOK-11: (vm) полный контур — изучен в книге [B] → клик строки → РОВНО 1 запись (expiresDay = day + 1 + floor(Инт/10)), мана −8 (сейв), в следующем кадре арки; expiresDay=day → арки исчезли', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const g = h.sandbox.__game;
  const st = g.state;
  const sw = g.startWindow;
  assert.ok(sw && typeof sw.hide === 'function',
    'фикстура: __game.startWindow (000138)');
  sw.hide();
  const heroSpells = st.hero.spells;
  assert.ok(Array.isArray(heroSpells), 'сценарий: live hero.spells');
  heroSpells.push('show_enemies');
  key(h, 'KeyB');
  clickRow(h, 'show_enemies');
  const day = st.day;
  // Дефолтный Интеллект героя — 1 (createSheet hero; тот же код и в vm,
  // и в node) ⇒ длительность 1 день ⇒ expiresDay = day + 1.
  const hero = createCharacter();
  assert.equal(localDays(hero.primary.intelligence), 1,
    'фикстура: Инт дефолтного героя → 1 день');
  assert.deepEqual(JSON.parse(JSON.stringify(st.hero.outOfCombatEffects)), [
    { spellId: 'show_enemies', expiresDay: day + 1 },
  ], 'запись РОВНО {spellId, expiresDay=день+длительность}');
  const saved = saveHero(h);
  assert.equal(saved.mp, hero.mp - MANA,
    'мана −8 ровно (чистый перед кастом — ' + saved.mp + ')');
  assert.deepEqual(saved.outOfCombatEffects, [
    { spellId: 'show_enemies', expiresDay: day + 1 },
  ], 'сейв уносит эффект (generic-перенос 000235.02, версий сейва нет)');
  const G = h.sandbox.Game;
  const myMap = G.createMap(G.generateSeedPixels());
  const calls = frameOnce(h);
  const arcs = arcsOf(calls);
  const expected = expectedAgroCircles(G, myMap, st.cam, st.zoom);
  assert.ok(expected.length >= 2, 'сценарий: >= 2 группы в кадре');
  assertAgsMatchExpected(arcs, expected, 'после каста из книги');
  st.hero.outOfCombatEffects[0].expiresDay = day;
  const after = frameOnce(h);
  assert.equal(arcsOf(after).length, 0,
    'expiresDay откатан в день — арки исчезли (тот же гейт, без перезагрузки)');
});
