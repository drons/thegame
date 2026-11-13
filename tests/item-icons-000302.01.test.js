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
  ['ember_scroll.json', 'ember_scroll'],
  ['ignite_scroll.json', 'ignite_scroll'],
  ['fire_nova_scroll.json', 'fire_nova_scroll'],
  ['lava_burst_scroll.json', 'lava_burst_scroll'],
  ['meteor_scroll.json', 'meteor_scroll'],
  ['flame_strike_scroll.json', 'flame_strike_scroll'],
  ['hellfire_scroll.json', 'hellfire_scroll'],
  ['phlogiston_blast_scroll.json', 'phlogiston_blast_scroll'],
  ['burning_ground_scroll.json', 'burning_ground_scroll'],
  ['wall_of_fire_scroll.json', 'wall_of_fire_scroll'],
  ['burning_haze_scroll.json', 'burning_haze_scroll'],
  ['blazing_speed_scroll.json', 'blazing_speed_scroll'],
  ['fire_aura_scroll.json', 'fire_aura_scroll'],
  ['heat_shield_scroll.json', 'heat_shield_scroll'],
  ['sunfire_scroll.json', 'sunfire_scroll'],
  ['scorch_scroll.json', 'scorch_scroll'],
  ['cinder_scroll.json', 'cinder_scroll'],
  ['ashen_debilitation_scroll.json', 'ashen_debilitation_scroll'],
  ['lava_snare_scroll.json', 'lava_snare_scroll'],
  ['burning_cage_scroll.json', 'burning_cage_scroll'],
  ['flame_imp_scroll.json', 'flame_imp_scroll'],
  ['phoenix_scroll.json', 'phoenix_scroll'],
  ['firelight_scroll.json', 'firelight_scroll'],
  ['hearthfire_scroll.json', 'hearthfire_scroll'],
  ['flame_step_scroll.json', 'flame_step_scroll'],
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
