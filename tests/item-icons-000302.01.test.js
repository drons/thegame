// Задача 000302.01 — КРАСНЫЕ ТЕСТЫ (TDD): 25 свитков школы Огонь
// (000108–000132) — поле "icon" в JSON КОНЦОМ объекта + SVG
// assets/sprites/items/<id>.svg (имя файла = id предмета).
//
// ТЗ — tasks/pending/000302.01.md (фикс-список 25); конвенция и
// палитра Огня (#c96f3b/#f08050/#e87820) —
// memory/000302-icon-registry.md §2/§3. kind=node; require —
// только node:test/assert/fs/path (без src-require).
//
// КРАСНЫЕ (25 — по одному тесту на предмет, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). Полный прогон до GREEN: только
//   25 новых красных (+3635 зелёных).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const SCROLLS_FIRE_00030201 = [
  ['000108.json', 'ember_scroll'],
  ['000109.json', 'ignite_scroll'],
  ['000110.json', 'fire_nova_scroll'],
  ['000111.json', 'lava_burst_scroll'],
  ['000112.json', 'meteor_scroll'],
  ['000113.json', 'flame_strike_scroll'],
  ['000114.json', 'hellfire_scroll'],
  ['000115.json', 'phlogiston_blast_scroll'],
  ['000116.json', 'burning_ground_scroll'],
  ['000117.json', 'wall_of_fire_scroll'],
  ['000118.json', 'burning_haze_scroll'],
  ['000119.json', 'blazing_speed_scroll'],
  ['000120.json', 'fire_aura_scroll'],
  ['000121.json', 'heat_shield_scroll'],
  ['000122.json', 'sunfire_scroll'],
  ['000123.json', 'scorch_scroll'],
  ['000124.json', 'cinder_scroll'],
  ['000125.json', 'ashen_debilitation_scroll'],
  ['000126.json', 'lava_snare_scroll'],
  ['000127.json', 'burning_cage_scroll'],
  ['000128.json', 'flame_imp_scroll'],
  ['000129.json', 'phoenix_scroll'],
  ['000130.json', 'firelight_scroll'],
  ['000131.json', 'hearthfire_scroll'],
  ['000132.json', 'flame_step_scroll'],
];

for (const [file, id] of SCROLLS_FIRE_00030201) {
  test('000302.01 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.01)');
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
