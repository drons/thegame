// Задача 000302.02 — КРАСНЫЕ ТЕСТЫ (TDD): 25 свитков школы Лёд
// (000133–000157) — поле "icon" в JSON КОНЦОМ объекта + SVG
// assets/sprites/items/<id>.svg (имя файла = id предмета).
//
// ТЗ — tasks/pending/000302.02.md (фикс-список 25); конвенция и
// палитра Льда (#4a94c8/#8ab8e8/#b8d8f0) —
// memory/000302-icon-registry.md §2/§3. kind=node; require —
// только node:test/assert/fs/path (без src-require).
//
// КРАСНЫЕ (25 — по одному тесту на предмет, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). Полный прогон до GREEN: только
//   25 новых красных (+3671 зелёных).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const SCROLLS_ICE_00030202 = [
  ['ice_lance_scroll.json', 'ice_lance_scroll'],
  ['rime_bolt_scroll.json', 'rime_bolt_scroll'],
  ['hail_scroll.json', 'hail_scroll'],
  ['shatter_scroll.json', 'shatter_scroll'],
  ['glacial_spike_scroll.json', 'glacial_spike_scroll'],
  ['permafrost_scroll.json', 'permafrost_scroll'],
  ['absolute_zero_scroll.json', 'absolute_zero_scroll'],
  ['ice_field_scroll.json', 'ice_field_scroll'],
  ['wall_of_ice_scroll.json', 'wall_of_ice_scroll'],
  ['blizzard_field_scroll.json', 'blizzard_field_scroll'],
  ['frost_aura_scroll.json', 'frost_aura_scroll'],
  ['ice_armor_scroll.json', 'ice_armor_scroll'],
  ['winter_haste_scroll.json', 'winter_haste_scroll'],
  ['frostbite_blessing_scroll.json', 'frostbite_blessing_scroll'],
  ['slow_scroll.json', 'slow_scroll'],
  ['frostbite_scroll.json', 'frostbite_scroll'],
  ['arctic_touch_scroll.json', 'arctic_touch_scroll'],
  ['deep_freeze_scroll.json', 'deep_freeze_scroll'],
  ['freeze_scroll.json', 'freeze_scroll'],
  ['glacier_grasp_scroll.json', 'glacier_grasp_scroll'],
  ['frost_wisp_scroll.json', 'frost_wisp_scroll'],
  ['winter_elemental_scroll.json', 'winter_elemental_scroll'],
  ['frost_walk_scroll.json', 'frost_walk_scroll'],
  ['cold_breath_scroll.json', 'cold_breath_scroll'],
  ['frozen_stillness_scroll.json', 'frozen_stillness_scroll'],
];

for (const [file, id] of SCROLLS_ICE_00030202) {
  test('000302.02 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.02)');
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
