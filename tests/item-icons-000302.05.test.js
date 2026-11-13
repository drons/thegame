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
  ['iron_bulwark_scroll.json', 'iron_bulwark_scroll'],
  ['aegis_scroll.json', 'aegis_scroll'],
  ['shield_wall_scroll.json', 'shield_wall_scroll'],
  ['magical_barrier_scroll.json', 'magical_barrier_scroll'],
  ['stony_hide_scroll.json', 'stony_hide_scroll'],
  ['iron_bastion_scroll.json', 'iron_bastion_scroll'],
  ['bulwark_ward_scroll.json', 'bulwark_ward_scroll'],
  ['resilience_scroll.json', 'resilience_scroll'],
  ['thorns_scroll.json', 'thorns_scroll'],
  ['fortitude_scroll.json', 'fortitude_scroll'],
  ['guardian_oath_scroll.json', 'guardian_oath_scroll'],
  ['stalwart_scroll.json', 'stalwart_scroll'],
  ['aura_of_protection_scroll.json', 'aura_of_protection_scroll'],
  ['weaken_defense_scroll.json', 'weaken_defense_scroll'],
  ['corrode_scroll.json', 'corrode_scroll'],
  ['stone_grasp_scroll.json', 'stone_grasp_scroll'],
  ['time_slow_scroll.json', 'time_slow_scroll'],
  ['stone_wall_scroll.json', 'stone_wall_scroll'],
  ['guardian_field_scroll.json', 'guardian_field_scroll'],
  ['stone_golem_scroll.json', 'stone_golem_scroll'],
  ['iron_sentinel_scroll.json', 'iron_sentinel_scroll'],
  ['stone_anchor_scroll.json', 'stone_anchor_scroll'],
  ['recall_scroll.json', 'recall_scroll'],
  ['gate_scroll.json', 'gate_scroll'],
  ['warding_circle_scroll.json', 'warding_circle_scroll'],
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
      assert.equal(Object.keys(j).at(-1), 'icon',
        id + ': "icon" — КОНЕЦ объекта в JSON (позиционный пин '
        + '000335); факт: ' + JSON.stringify(Object.keys(j).at(-1)));
    });
}
