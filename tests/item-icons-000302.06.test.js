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
  ['000487.json', 'acid_splash_scroll'],
  ['000488.json', 'thorn_whip_scroll'],
  ['000489.json', 'poison_spore_scroll'],
  ['000490.json', 'vine_lash_scroll'],
  ['000491.json', 'thorn_storm_scroll'],
  ['000492.json', 'nature_wrath_scroll'],
  ['000493.json', 'hurricane_scroll'],
  ['000494.json', 'poison_cloud_scroll'],
  ['000495.json', 'thorn_field_scroll'],
  ['000496.json', 'wall_of_thorns_scroll'],
  ['000497.json', 'life_force_scroll'],
  ['000498.json', 'barkskin_scroll'],
  ['000499.json', 'heart_of_forest_scroll'],
  ['000500.json', 'nature_haste_scroll'],
  ['000501.json', 'vitality_scroll'],
  ['000502.json', 'poison_scroll'],
  ['000503.json', 'rot_scroll'],
  ['000504.json', 'paralyzing_spore_scroll'],
  ['000505.json', 'entangle_scroll'],
  ['000506.json', 'root_grasp_scroll'],
  ['000507.json', 'forest_beast_scroll'],
  ['000508.json', 'treant_scroll'],
  ['000509.json', 'wild_growth_scroll'],
  ['000510.json', 'beast_friend_scroll'],
  ['000511.json', 'path_of_vines_scroll'],
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
