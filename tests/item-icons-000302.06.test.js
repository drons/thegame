// Задача 000302.06 — КРАСНЫЕ ТЕСТЫ (TDD): 25 свитков школы Природа
// (000487–000511) — поле "icon" в JSON КОНЦОМ объекта + SVG
// assets/sprites/items/<id>.svg (имя файла = id предмета).
//
// ТЗ — tasks/pending/000302.06.md (фикс-список 25); конвенция и
// палитра Природы (#5a8a44/#85b771/#4a6a34) —
// memory/000302-icon-registry.md §2/§3. kind=node; require —
// только node:test/assert/fs/path (без src-require).
//
// КРАСНЫЕ (25 — по одному тесту на предмет, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). Полный прогон до GREEN: только
//   25 новых красных (+3795 зелёных, полный RED 3820 = 3795 + 25).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const SCROLLS_NATURE_00030206 = [
  ['acid_splash_scroll.json', 'acid_splash_scroll'],
  ['thorn_whip_scroll.json', 'thorn_whip_scroll'],
  ['poison_spore_scroll.json', 'poison_spore_scroll'],
  ['vine_lash_scroll.json', 'vine_lash_scroll'],
  ['thorn_storm_scroll.json', 'thorn_storm_scroll'],
  ['nature_wrath_scroll.json', 'nature_wrath_scroll'],
  ['hurricane_scroll.json', 'hurricane_scroll'],
  ['poison_cloud_scroll.json', 'poison_cloud_scroll'],
  ['thorn_field_scroll.json', 'thorn_field_scroll'],
  ['wall_of_thorns_scroll.json', 'wall_of_thorns_scroll'],
  ['life_force_scroll.json', 'life_force_scroll'],
  ['barkskin_scroll.json', 'barkskin_scroll'],
  ['heart_of_forest_scroll.json', 'heart_of_forest_scroll'],
  ['nature_haste_scroll.json', 'nature_haste_scroll'],
  ['vitality_scroll.json', 'vitality_scroll'],
  ['poison_scroll.json', 'poison_scroll'],
  ['rot_scroll.json', 'rot_scroll'],
  ['paralyzing_spore_scroll.json', 'paralyzing_spore_scroll'],
  ['entangle_scroll.json', 'entangle_scroll'],
  ['root_grasp_scroll.json', 'root_grasp_scroll'],
  ['forest_beast_scroll.json', 'forest_beast_scroll'],
  ['treant_scroll.json', 'treant_scroll'],
  ['wild_growth_scroll.json', 'wild_growth_scroll'],
  ['beast_friend_scroll.json', 'beast_friend_scroll'],
  ['path_of_vines_scroll.json', 'path_of_vines_scroll'],
];

for (const [file, id] of SCROLLS_NATURE_00030206) {
  test('000302.06 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.06)');
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
