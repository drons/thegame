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
  ['wood_sword.json', 'wood_sword'],
  ['iron_sword.json', 'iron_sword'],
  ['steel_sword.json', 'steel_sword'],
  ['short_bow.json', 'short_bow'],
  ['hunting_bow.json', 'hunting_bow'],
  ['battle_axe.json', 'battle_axe'],
  ['war_hammer.json', 'war_hammer'],
  ['leather_armor.json', 'leather_armor'],
  ['chainmail.json', 'chainmail'],
  ['knight_plate.json', 'knight_plate'],
  ['minor_healing.json', 'minor_healing'],
  ['healing_potion.json', 'healing_potion'],
  ['greater_healing.json', 'greater_healing'],
  ['mana_potion.json', 'mana_potion'],
  ['mana_elixir.json', 'mana_elixir'],
  ['bread.json', 'bread'],
  ['meat.json', 'meat'],
  ['honey_cake.json', 'honey_cake'],
  ['sulfur.json', 'sulfur'],
  ['phoenix_feather.json', 'phoenix_feather'],
  ['stone_chunk.json', 'stone_chunk'],
  ['coal.json', 'coal'],
  ['stone_chisel.json', 'stone_chisel'],
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

test('000302.08 SWEEP: live-каталог — 0 без icon (финальная дочерняя 000302); у всего живого каталога (ls-предикат) icon по паттерну схемы + svg-файл существует (ре-пин 000321.11: +50 свитков zy*_scroll с icon 001015–001064; ре-пин 000321.10: +50 реагентов zy* с icon 000965–001014; ре-пин 000333: +2 свитка навигации; ре-пин 000321.01: +50 оружия с icon 000514–000563; ре-пин 000321.02: +50 брони с icon 000564–000613; ре-пин 000321.03: +50 щитов с icon 000614–000663; ре-пин 000321.04: +50 артефактов с icon 000664–000713; ре-пин 000321.05: +50 инструментов с icon 000714–000763; ре-пин 000348: +1 свиток Декаданс с icon 000764; ре-пин 000321.06: +50 колец с icon 000765–000814; ре-пин 000321.07: +50 зелий с icon 000815–000864; ре-пин 000321.08: +50 еды с icon 000865–000914)', () => {
  const files = fs.readdirSync(ITEMS_DIR)
    .filter((f) => f !== 'schema.json'
      && /^[a-z][a-z0-9_]*\.json$/.test(f)).sort();
  assert.ok(files.length >= 1064,
    'каталог — ls-пол ≥ 1064 JSON (миграция 000397; история: '
    + 'ре-пин 000321.11: 1014 → 1064 (+50 свитков); '
    + 'ре-пин 000321.10: 964 → 1014 (+50 реагентов); ре-пин 000333: 511 → 513; '
    + 'ре-пин 000321.01: 513 → 563; ре-пин 000321.02: 563 → 613; '
    + 'ре-пин 000321.03: 613 → 663; '
    + 'ре-пин 000321.04: 663 → 713; ре-пин 000321.05: 713 → 763; ре-пин 000348: 763 → 764; '
    + 'ре-пин 000321.06: 764 → 814; ре-пин 000321.07: 814 → 864; ре-пин 000321.08: 864 → 914); '
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
