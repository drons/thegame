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
  ['000133.json', 'ice_lance_scroll'],
  ['000134.json', 'rime_bolt_scroll'],
  ['000135.json', 'hail_scroll'],
  ['000136.json', 'shatter_scroll'],
  ['000137.json', 'glacial_spike_scroll'],
  ['000138.json', 'permafrost_scroll'],
  ['000139.json', 'absolute_zero_scroll'],
  ['000140.json', 'ice_field_scroll'],
  ['000141.json', 'wall_of_ice_scroll'],
  ['000142.json', 'blizzard_field_scroll'],
  ['000143.json', 'frost_aura_scroll'],
  ['000144.json', 'ice_armor_scroll'],
  ['000145.json', 'winter_haste_scroll'],
  ['000146.json', 'frostbite_blessing_scroll'],
  ['000147.json', 'slow_scroll'],
  ['000148.json', 'frostbite_scroll'],
  ['000149.json', 'arctic_touch_scroll'],
  ['000150.json', 'deep_freeze_scroll'],
  ['000151.json', 'freeze_scroll'],
  ['000152.json', 'glacier_grasp_scroll'],
  ['000153.json', 'frost_wisp_scroll'],
  ['000154.json', 'winter_elemental_scroll'],
  ['000155.json', 'frost_walk_scroll'],
  ['000156.json', 'cold_breath_scroll'],
  ['000157.json', 'frozen_stillness_scroll'],
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
    });
}
