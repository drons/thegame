// Задача 000302.08 — КРАСНЫЕ ТЕСТЫ (TDD): 23 legacy-снаряжение/
// расходники (000001–000010 — оружие + броня; 000011–000015 — зелья;
// 000016–000018 — еда; 000022/000024/000036/000038/000042 — реагенты)
// — поле "icon" в JSON + SVG assets/sprites/items/<id>.svg (имя
// файла = id предмета) + SWEEP «0 без иконки» (финальная дочерняя
// 000302).
//
// ТЗ — tasks/pending/000302.08.md (фикс-список 23); конвенция и
// палитра акцентов — memory/000302-icon-registry.md §2/§3.
// kind=node; require — только node:test/assert/fs/path (без
// src-require).
//
// КРАСНЫЕ (24 = 23 контрпримера + 1 SWEEP, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). SWEEP: live-каталог — без icon === 0
//   (краснота: 23 на диске) + у всех 511 icon по паттерну схемы +
//   existsSync. Полный прогон до GREEN: только 24 новых красных
//   (+база).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const LEGACY_GEAR_00030208 = [
  ['000001.json', 'wood_sword'],
  ['000002.json', 'iron_sword'],
  ['000003.json', 'steel_sword'],
  ['000004.json', 'short_bow'],
  ['000005.json', 'hunting_bow'],
  ['000006.json', 'battle_axe'],
  ['000007.json', 'war_hammer'],
  ['000008.json', 'leather_armor'],
  ['000009.json', 'chainmail'],
  ['000010.json', 'knight_plate'],
  ['000011.json', 'minor_healing'],
  ['000012.json', 'healing_potion'],
  ['000013.json', 'greater_healing'],
  ['000014.json', 'mana_potion'],
  ['000015.json', 'mana_elixir'],
  ['000016.json', 'bread'],
  ['000017.json', 'meat'],
  ['000018.json', 'honey_cake'],
  ['000022.json', 'sulfur'],
  ['000024.json', 'phoenix_feather'],
  ['000036.json', 'stone_chunk'],
  ['000038.json', 'coal'],
  ['000042.json', 'stone_chisel'],
];

const NON_EQUIP_000335 = new Set([
  'minor_healing', 'healing_potion', 'greater_healing', 'mana_potion',
  'mana_elixir', 'bread', 'meat', 'honey_cake', 'sulfur',
  'phoenix_feather', 'stone_chunk', 'coal', 'stone_chisel',
]);

for (const [file, id] of LEGACY_GEAR_00030208) {
  test('000302.08 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.08)');
      assert.ok('icon' in j,
        id + ': поле "icon" есть в JSON (краснота: свойства нет — '
        + '"icon" in j === false; предмет не тронут)');
      const icon = 'assets/sprites/items/' + id + '.svg';
      assert.equal(j.icon, icon,
        id + ': icon = ' + icon + ' (краснота: иконки нет); факт: '
        + JSON.stringify(j.icon));
      assert.ok(fs.existsSync(path.join(ROOT, j.icon)),
        icon + ': svg-файл существует (path.join(ROOT, it.icon))');
      if (NON_EQUIP_000335.has(id)) {
        assert.equal(Object.keys(j).at(-1), 'icon',
          id + ': "icon" — КОНЕЦ объекта в JSON (позиционный пин '
          + '000335); факт: ' + JSON.stringify(Object.keys(j).at(-1)));
      }
    });
}

test('000302.08 SWEEP: live-каталог — 0 без icon (финальная дочерняя 000302); у всех 764 icon по паттерну схемы + svg-файл существует (ре-пин 000333: +2 свитка навигации; ре-пин 000321.01: +50 оружия с icon 000514–000563; ре-пин 000321.02: +50 брони с icon 000564–000613; ре-пин 000321.03: +50 щитов с icon 000614–000663; ре-пин 000321.04: +50 артефактов с icon 000664–000713; ре-пин 000321.05: +50 инструментов с icon 000714–000763; ре-пин 000348: +1 свиток Декаданс с icon 000764)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 764,
    'каталог — ровно 764 JSON (live-скан; ре-пин 000333: 511 → 513; '
    + 'ре-пин 000321.01: 513 → 563; ре-пин 000321.02: 563 → 613; '
    + 'ре-пин 000321.03: 613 → 663; '
    + 'ре-пин 000321.04: 663 → 713; ре-пин 000321.05: 713 → 763; ре-пин 000348: 763 → 764); '
    + 'факт: ' + files.length);
  let noIcon = 0;
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(
      path.join(ITEMS_DIR, f), 'utf8'));
    if (typeof j.icon !== 'string' || j.icon === '') {
      noIcon++;
      continue;
    }
    assert.match(j.icon, /^assets\/sprites\/(loot|items)\/[\w_]+\.svg$/,
      j.id + ': icon — по паттерну схемы (loot|items); факт: '
      + JSON.stringify(j.icon));
    assert.ok(fs.existsSync(path.join(ROOT, j.icon)),
      j.id + ': svg-файл существует по пути icon: ' + j.icon);
  }
  assert.equal(noIcon, 0,
    'без icon — 0 предметов (финал 000302.08: каталог иконирован '
    + 'полностью); факт: ' + noIcon
    + ' (краснота: 23 на диске — legacy-снаряжение/расходники)');
});
