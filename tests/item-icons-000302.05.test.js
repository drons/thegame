// Задача 000302.05 — КРАСНЫЕ ТЕСТЫ (TDD): 25 свитков школы Защита
// (000460–000484) — поле "icon" в JSON КОНЦОМ объекта + SVG
// assets/sprites/items/<id>.svg (имя файла = id предмета).
//
// ТЗ — tasks/pending/000302.05.md (фикс-список 25); конвенция и
// палитра Защиты (#8a744c/#c9a86a, камень #8d8fa0) —
// memory/000302-icon-registry.md §2/§3. kind=node; require —
// только node:test/assert/fs/path (без src-require).
//
// КРАСНЫЕ (25 — по одному тесту на предмет, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). Полный прогон до GREEN: только
//   25 новых красных (+3761 зелёных).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const SCROLLS_PROTECTION_00030205 = [
  ['000460.json', 'iron_bulwark_scroll'],
  ['000461.json', 'aegis_scroll'],
  ['000462.json', 'shield_wall_scroll'],
  ['000463.json', 'magical_barrier_scroll'],
  ['000464.json', 'stony_hide_scroll'],
  ['000465.json', 'iron_bastion_scroll'],
  ['000466.json', 'bulwark_ward_scroll'],
  ['000467.json', 'resilience_scroll'],
  ['000468.json', 'thorns_scroll'],
  ['000469.json', 'fortitude_scroll'],
  ['000470.json', 'guardian_oath_scroll'],
  ['000471.json', 'stalwart_scroll'],
  ['000472.json', 'aura_of_protection_scroll'],
  ['000473.json', 'weaken_defense_scroll'],
  ['000474.json', 'corrode_scroll'],
  ['000475.json', 'stone_grasp_scroll'],
  ['000476.json', 'time_slow_scroll'],
  ['000477.json', 'stone_wall_scroll'],
  ['000478.json', 'guardian_field_scroll'],
  ['000479.json', 'stone_golem_scroll'],
  ['000480.json', 'iron_sentinel_scroll'],
  ['000481.json', 'stone_anchor_scroll'],
  ['000482.json', 'recall_scroll'],
  ['000483.json', 'gate_scroll'],
  ['000484.json', 'warding_circle_scroll'],
];

for (const [file, id] of SCROLLS_PROTECTION_00030205) {
  test('000302.05 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.05)');
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
