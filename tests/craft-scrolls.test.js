// Задача 000232: «свитки/чертежи, обучающие виду крафта» — предметы.
//
// ТЗ (tasks/pending/000232.md) строка 2: особый вид предметов — при
// использовании персонаж изучает соответствующий ВИД КРАФТА; в JSON
// предмета — ЯВНАЯ ссылка на JSON рецепта.
//
// Контракты — memory/000232-craft-learned-kinds.md:
//   D1 — JSON: effect { kind:'craft_recipe',
//        recipe:'assets/craft/NNNNNN.json' } (явная файловая ссылка —
//        ТОЛЬКО в assets); зеркало src/items-data.js — id-форма;
//        schema.json: kind enum += 'craft_scroll' (append),
//        effect.kind enum += 'craft_recipe', effect.recipe — анкорный
//        паттерн (опционально; additionalProperties:false сохранён);
//        kind НЕ в STACKABLE (нестаккуем, прецедент spell_scroll 000133).
//   D2 — useItem (ветка ПОСЛЕ spell_scroll): qty>1 — «свиток: по
//        одному»; Game.Craft — ЛЕНИВО в момент вызова; !C → тихий
//        отказ «крафт недоступен» (БЕЗ console.error, 000053);
//        неизвестный рецепт → «неизвестный рецепт: <id>»; ОТКАЗ ДО
//        расхода (повтор — «вид уже изучен», свиток цел); успех →
//        ровно 1 шт. списано, { ok:true, name, craft:<тип>,
//        message: 'Изучено: «<название рецепта>»' }.
//   D-items — 6 предметов 000077-000082 (append после 000076), по
//        одному на каждый из 6 видов: name «Чертёж: <вид>», weight
//        0.2, value 80, icon assets/sprites/items/<id>.svg (НОВЫЙ
//        каталог; правила svg.test.js: well-formed XML, корень <svg>,
//        xmlns, viewBox, без NaN/Infinity/неэкранированных &).
//
// КРАСНЫЕ — 6 (expectedRedCount = 6):
//   CR-1: I.ITEM_KINDS.CRAFT_SCROLL / I.EFFECT_KINDS.CRAFT_RECIPE —
//         undefined; schema.json — enum'ы/recipe-паттерн отсутствуют;
//   CR-2: файлы 000077-000082.json отсутствуют (map-доступ — assert,
//         не крах); зеркало items-data.js без записей;
//   CR-3/CR-4/CR-5: addItem — «неизвестный предмет» (каталог пуст);
//   CR-6: каталог assets/sprites/items/ не существует.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../src/items.js');
const C = require('../src/craft.js');
const { createCharacter } = require('../src/player.js');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

// Фиксированный состав (D-items): файл → id → якорный рецепт (JSON,
// ПЕРВЫЙ/низший уровень вида) → вид. Якорь задаёт имя/вид свитка.
const BLUEPRINTS_000232 = [
  { file: '000077.json', id: 'blueprint_forge',
    name: 'Чертёж: кузнечное дело', recipe: 'assets/craft/000001.json',
    type: 'кузнечное_дело' },
  { file: '000078.json', id: 'blueprint_alchemy',
    name: 'Чертёж: алхимия', recipe: 'assets/craft/000004.json',
    type: 'алхимия' },
  { file: '000079.json', id: 'blueprint_carving',
    name: 'Чертёж: резьба по камню', recipe: 'assets/craft/000013.json',
    type: 'резьба_по_камню' },
  { file: '000080.json', id: 'blueprint_woodwork',
    name: 'Чертёж: столярное дело', recipe: 'assets/craft/000011.json',
    type: 'столярное_дело' },
  { file: '000081.json', id: 'blueprint_enchant',
    name: 'Чертёж: зачарование', recipe: 'assets/craft/000008.json',
    type: 'зачарование' },
  { file: '000082.json', id: 'blueprint_runecraft',
    name: 'Чертёж: рунопись', recipe: 'assets/craft/000019.json',
    type: 'рунопись' },
];

function itemsByFile() {
  const m = new Map();
  for (const f of fs.readdirSync(ITEMS_DIR)
      .filter((x) => /^\d{6}\.json$/.test(x))) {
    m.set(f, JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')));
  }
  return m;
}

// useItem (craft-ветка) читает globalThis.Game ЛЕНИВО в момент ВЫЗОВА
// (паттерн 000133): на время вызова Game = { Craft }, затем
// восстановление.
function withGame232(game, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = game;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

test('CR-1: items.js — ITEM_KINDS.CRAFT_SCROLL / EFFECT_KINDS.CRAFT_RECIPE; schema.json — kind enum += craft_scroll, effect.kind enum += craft_recipe, effect.recipe — анкорный паттерн ^assets/craft/\\d{6}\\.json$ (опционально), additionalProperties:false сохранён', () => {
  assert.equal(I.ITEM_KINDS.CRAFT_SCROLL, 'craft_scroll',
    'краснота: kind craft_scroll отсутствует в items.js');
  assert.equal(I.EFFECT_KINDS.CRAFT_RECIPE, 'craft_recipe',
    'краснота: effect.kind craft_recipe отсутствует в items.js');
  const schema = JSON.parse(
    fs.readFileSync(path.join(ITEMS_DIR, 'schema.json'), 'utf8'));
  assert.ok(schema.properties.kind.enum.includes('craft_scroll'),
    'краснота: schema kind enum без craft_scroll');
  assert.ok(
    schema.properties.effect.properties.kind.enum.includes('craft_recipe'),
    'краснота: schema effect.kind enum без craft_recipe');
  const recipe = schema.properties.effect.properties.recipe;
  assert.ok(recipe && typeof recipe === 'object',
    'краснота: schema effect без свойства recipe');
  assert.equal(recipe.type, 'string', 'recipe — строка-ссылка');
  assert.equal(recipe.pattern, '^assets/craft/\\d{6}\\.json$',
    'recipe — анкорный паттерн на каталог craft (явная ссылка, ТЗ)');
  assert.equal(schema.properties.effect.additionalProperties, false,
    'effect.additionalProperties:false сохранён (recipe — объявленный ключ)');
});

test('CR-2: каталог — ровно 6 чертежей (000077-000082, append после 000076), по одному на каждый из 6 видов; JSON: effect {kind craft_recipe, recipe — явная ссылка на JSON рецепта}; зеркало items-data.js ≡ JSON (recipe — id-форма); нестаккуемые', () => {
  const byFile = itemsByFile();
  for (const e of BLUEPRINTS_000232) {
    const j = byFile.get(e.file);
    assert.ok(j, e.file + ': файл в assets/items (краснота: файла нет)');
    assert.equal(j.id, e.id, e.file + ': id — ' + e.id);
    assert.equal(j.kind, 'craft_scroll', e.id + ': kind — craft_scroll');
    assert.equal(j.name, e.name, e.id + ': имя «Чертёж: <вид>»');
    assert.equal(j.weight, 0.2, e.id + ': weight 0.2 (как книги/свитки)');
    assert.equal(j.value, 80, e.id + ': value 80 (D-items)');
    assert.ok(String(j.desc).includes('Изучает вид крафта'),
      e.id + ': desc «Изучает вид крафта …»; факт: ' + j.desc);
    assert.equal(j.effect && j.effect.kind, 'craft_recipe',
      e.id + ': effect.kind — craft_recipe');
    assert.equal(j.effect && j.effect.recipe, e.recipe,
      e.id + ': effect.recipe — ЯВНАЯ ссылка на JSON рецепта (ТЗ)');
    const rec = JSON.parse(
      fs.readFileSync(path.join(ROOT, e.recipe), 'utf8'));
    assert.equal(rec.тип, e.type,
      e.recipe + ': якорь — рецепт вида «' + e.type + '»');
    // Зеркало items-data.js — id-форма ссылки, остальное ≡ JSON:
    const it = I.getItem(e.id);
    assert.ok(it, e.id + ': зеркало items-data.js (краснота: записи нет)');
    assert.equal(it.kind, 'craft_scroll', e.id + ': зеркало — kind');
    assert.equal(it.effect.kind, 'craft_recipe', e.id + ': зеркало — effect.kind');
    assert.equal(it.effect.recipe, rec.id,
      e.id + ': зеркало — recipe в id-форме (' + rec.id + ')');
    const expect = { ...j, effect: { ...j.effect, recipe: rec.id } };
    assert.deepEqual(it, expect, e.id + ': зеркало ≡ JSON (id-форма)');
    // Нестаккуемый (как spell_scroll, 000133): 2 шт — 2 слота:
    const c = createCharacter();
    const a1 = I.addItem(c, e.id, 1);
    assert.equal(a1.ok, true,
      e.id + ': выдача (краснота: неизвестный предмет)');
    const a2 = I.addItem(c, e.id, 1);
    assert.equal(a2.ok, true,
      e.id + ': второй экземпляр — отдельный слот (нестаккуем)');
    const slots = c.inventory.slots.filter((s) => s.id === e.id);
    assert.equal(slots.length, 2,
      e.id + ': нестаккуем — 2 слота; факт: ' + slots.length);
    assert.equal(slots[0].qty, 1, e.id + ': qty 1 (не стопка)');
  }
  const all = I.allItems().filter((it) => it.kind === 'craft_scroll');
  assert.equal(all.length, 6,
    'ровно 6 craft_scroll (ни больше, ни меньше); факт: ' + all.length);
  const types = all
    .map((it) => C.CRAFT_BY_ID[it.effect.recipe].тип)
    .sort();
  assert.deepEqual(types, [...C.CRAFT_TYPES].sort(),
    'по одному на каждый из 6 видов; факт: ' + JSON.stringify(types));
});

test('CR-3: useItem чертёж — успех: изучен ВИД (из якорного рецепта), ровно 1 шт. списан, res.craft = тип, message «Изучено: «<название рецепта>»»', () =>
  withGame232({ Craft: C }, () => {
    const c = createCharacter();
    const add = I.addItem(c, 'blueprint_forge', 1);
    assert.equal(add.ok, true,
      'выдача чертёжа (краснота: неизвестный предмет): ' + JSON.stringify(add));
    const res = I.useItem(c, 'blueprint_forge');
    assert.equal(res.ok, true,
      'useItem: ok (краснота: ветка craft_recipe отсутствует) — '
      + JSON.stringify(res));
    assert.equal(res.craft, 'кузнечное_дело',
      'изучен ВИД — из якорного рецепта (Д2)');
    assert.equal(res.name, 'Чертёж: кузнечное дело',
      'res.name — имя предмета');
    assert.equal(res.message, 'Изучено: «Ковка железного меча»',
      'flash «Изучено: «<название РЕЦЕПТА>»» (контракт D2); факт: '
      + res.message);
    assert.equal(I.totalQty(c, 'blueprint_forge'), 0,
      'ровно 1 шт. списано');
    assert.equal(C.isTypeLearned(c, 'кузнечное_дело'), true,
      'после useItem — вид изучен (D0b)');
  }));

test('CR-4: useItem чертёж — вид уже изучен (D0b-прогресс c.craft): отказ «вид уже изучен» ДО расхода, предмет не тратится', () =>
  withGame232({ Craft: C }, () => {
    const c = createCharacter();
    c.craft = { 'кузнечное_дело': 2 }; // «изучен» прогрессом
    const add = I.addItem(c, 'blueprint_forge', 1);
    assert.equal(add.ok, true,
      'выдача чертёжа (краснота: неизвестный предмет)');
    const res = I.useItem(c, 'blueprint_forge');
    assert.equal(res.ok, false,
      'отказ (краснота: молча тратится — ok:true)');
    assert.equal(res.reason, 'вид уже изучен',
      'причина из learnCraftType (D0b); факт: ' + res.reason);
    assert.equal(I.totalQty(c, 'blueprint_forge'), 1,
      'предмет НЕ тратится (отказ до расхода)');
  }));

test('CR-5: useItem чертёж — без Game.Craft: без исключения, тихий ok:false «крафт недоступен» (БЕЗ console.error, 000053), предмет цел', () => {
  const c = createCharacter();
  const add = I.addItem(c, 'blueprint_forge', 1);
  assert.equal(add.ok, true,
    'выдача чертёжа (краснота: неизвестный предмет)');
  let res = null;
  let threw = false;
  withGame232({}, () => { // Game без Craft — деградация
    try {
      res = I.useItem(c, 'blueprint_forge');
    } catch (e) { threw = true; }
  });
  assert.equal(threw, false, 'без исключения (000053: игра не падает)');
  assert.equal(res.ok, false,
    'ok:false (краснота: молча тратится — ok:true)');
  assert.equal(res.reason, 'крафт недоступен',
    'тихий отказ деградации (контракт D2); факт: ' + res.reason);
  assert.equal(I.totalQty(c, 'blueprint_forge'), 1, 'предмет цел');
});

test('CR-6: иконки — 6 × assets/sprites/items/<id>.svg (НОВЫЙ каталог): файл существует, правила svg.test.js (корень <svg>, xmlns, viewBox, без NaN/Infinity/неэкранированных &)', () => {
  const byFile = itemsByFile();
  for (const e of BLUEPRINTS_000232) {
    const j = byFile.get(e.file);
    assert.ok(j, e.file + ': файл в assets/items (краснота: файла нет)');
    const icon = 'assets/sprites/items/' + e.id + '.svg';
    assert.equal(j.icon, icon,
      e.id + ': icon — assets/sprites/items/<id>.svg (краснота: иконки нет)');
    assert.ok(fs.existsSync(path.join(ROOT, icon)),
      icon + ': файл существует (краснота: каталог assets/sprites/items/ '
      + 'ещё не создан)');
    const s = fs.readFileSync(path.join(ROOT, icon), 'utf8');
    const first = s.indexOf('<');
    assert.ok(first >= 0
      && (s.slice(first).startsWith('<svg')
          || s.slice(first).startsWith('<?xml')),
      icon + ': корневой элемент — <svg> (XML-пролог допустим)');
    assert.ok(/<svg[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/.test(s),
      icon + ': xmlns у корня');
    assert.ok(/viewBox="/.test(s), icon + ': viewBox');
    assert.ok(!/\bNaN\b/.test(s) && !/\bInfinity\b/.test(s),
      icon + ': без NaN/Infinity');
    assert.ok(!s.includes('&'),
      icon + ': без неэкранированных «&» (парсер svg.test.js строгий)');
  }
});
