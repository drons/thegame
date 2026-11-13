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
  ['radiant_heal_scroll.json', 'radiant_heal_scroll'],
  ['life_bloom_scroll.json', 'life_bloom_scroll'],
  ['purify_scroll.json', 'purify_scroll'],
  ['mass_heal_scroll.json', 'mass_heal_scroll'],
  ['holy_mending_scroll.json', 'holy_mending_scroll'],
  ['mass_holy_light_scroll.json', 'mass_holy_light_scroll'],
  ['regeneration_scroll.json', 'regeneration_scroll'],
  ['blessing_scroll.json', 'blessing_scroll'],
  ['divine_favor_scroll.json', 'divine_favor_scroll'],
  ['guardian_blessing_scroll.json', 'guardian_blessing_scroll'],
  ['swift_prayer_scroll.json', 'swift_prayer_scroll'],
  ['faith_shield_scroll.json', 'faith_shield_scroll'],
  ['smite_scroll.json', 'smite_scroll'],
  ['unholy_wrath_scroll.json', 'unholy_wrath_scroll'],
  ['stun_of_light_scroll.json', 'stun_of_light_scroll'],
  ['holy_bind_scroll.json', 'holy_bind_scroll'],
  ['light_sprite_scroll.json', 'light_sprite_scroll'],
  ['spirit_healer_scroll.json', 'spirit_healer_scroll'],
  ['holy_guardian_scroll.json', 'holy_guardian_scroll'],
  ['circle_of_light_scroll.json', 'circle_of_light_scroll'],
  ['holy_ground_scroll.json', 'holy_ground_scroll'],
  ['prayer_scroll.json', 'prayer_scroll'],
  ['divine_protection_scroll.json', 'divine_protection_scroll'],
  ['holy_light_scroll.json', 'holy_light_scroll'],
  ['miracle_scroll.json', 'miracle_scroll'],
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
