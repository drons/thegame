// Задача 000302.04 — КРАСНЫЕ ТЕСТЫ (TDD): 25 свитков школы Исцеление
// (000258–000282) — поле "icon" в JSON КОНЦОМ объекта + SVG
// assets/sprites/items/<id>.svg (имя файла = id предмета).
//
// ТЗ — tasks/pending/000302.04.md (фикс-список 25); конвенция и
// палитра Исцеления (#5aa469/#8ab4e8/#e0e8f0) —
// memory/000302-icon-registry.md §2/§3. kind=node; require —
// только node:test/assert/fs/path (без src-require).
//
// КРАСНЫЕ (25 — по одному тесту на предмет, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). Полный прогон до GREEN: только
//   25 новых красных (+3736 зелёных).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const SCROLLS_HEALING_00030204 = [
  ['000258.json', 'radiant_heal_scroll'],
  ['000259.json', 'life_bloom_scroll'],
  ['000260.json', 'purify_scroll'],
  ['000261.json', 'mass_heal_scroll'],
  ['000262.json', 'holy_mending_scroll'],
  ['000263.json', 'mass_holy_light_scroll'],
  ['000264.json', 'regeneration_scroll'],
  ['000265.json', 'blessing_scroll'],
  ['000266.json', 'divine_favor_scroll'],
  ['000267.json', 'guardian_blessing_scroll'],
  ['000268.json', 'swift_prayer_scroll'],
  ['000269.json', 'faith_shield_scroll'],
  ['000270.json', 'smite_scroll'],
  ['000271.json', 'unholy_wrath_scroll'],
  ['000272.json', 'stun_of_light_scroll'],
  ['000273.json', 'holy_bind_scroll'],
  ['000274.json', 'light_sprite_scroll'],
  ['000275.json', 'spirit_healer_scroll'],
  ['000276.json', 'holy_guardian_scroll'],
  ['000277.json', 'circle_of_light_scroll'],
  ['000278.json', 'holy_ground_scroll'],
  ['000279.json', 'prayer_scroll'],
  ['000280.json', 'divine_protection_scroll'],
  ['000281.json', 'holy_light_scroll'],
  ['000282.json', 'miracle_scroll'],
];

for (const [file, id] of SCROLLS_HEALING_00030204) {
  test('000302.04 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.04)');
      assert.ok('icon' in j,
        id + ': поле "icon" есть в JSON (краснота: свойства нет — '
        + '"icon" in j === false; предмет не тронут)');
      const icon = 'assets/sprites/items/' + id + '.svg';
      assert.equal(j.icon, icon,
        id + ': icon = ' + icon + ' (краснота: иконки нет); факт: '
        + JSON.stringify(j.icon));
      assert.ok(fs.existsSync(path.join(ROOT, j.icon)),
        icon + ': svg-файл существует (path.join(ROOT, it.icon))');
      assert.equal(Object.keys(j).at(-1), 'icon',
        id + ': "icon" — КОНЕЦ объекта в JSON (позиционный пин '
        + '000335); факт: ' + JSON.stringify(Object.keys(j).at(-1)));
    });
}
