// Задача 000302.03 — КРАСНЫЕ ТЕСТЫ (TDD): 25 свитков школы Тень
// (000233–000257) — поле "icon" в JSON КОНЦОМ объекта + SVG
// assets/sprites/items/<id>.svg (имя файла = id предмета).
//
// ТЗ — tasks/pending/000302.03.md (фикс-список 25); конвенция и
// палитра Тени (#563a82/#8888e8/#3a2e5a) —
// memory/000302-icon-registry.md §2/§3. kind=node; require —
// только node:test/assert/fs/path (без src-require).
//
// КРАСНЫЕ (25 — по одному тесту на предмет, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). Полный прогон до GREEN: только
//   25 новых красных (+3696 зелёных).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const SCROLLS_SHADOW_00030203 = [
  ['000233.json', 'umbra_bolt_scroll'],
  ['000234.json', 'drain_life_scroll'],
  ['000235.json', 'void_arrow_scroll'],
  ['000236.json', 'night_strike_scroll'],
  ['000237.json', 'soul_drain_scroll'],
  ['000238.json', 'shadowflame_scroll'],
  ['000239.json', 'dark_nova_scroll'],
  ['000240.json', 'shroud_scroll'],
  ['000241.json', 'night_blade_scroll'],
  ['000242.json', 'vampire_touch_scroll'],
  ['000243.json', 'fear_scroll'],
  ['000244.json', 'doom_mark_scroll'],
  ['000245.json', 'despair_scroll'],
  ['000246.json', 'shadow_curse_scroll'],
  ['000247.json', 'shadow_bind_scroll'],
  ['000248.json', 'nightmare_scroll'],
  ['000249.json', 'dark_ensnare_scroll'],
  ['000250.json', 'shadow_pool_scroll'],
  ['000251.json', 'veil_of_night_scroll'],
  ['000252.json', 'shadow_wraith_scroll'],
  ['000253.json', 'void_horror_scroll'],
  ['000254.json', 'shadow_step_scroll'],
  ['000255.json', 'invisibility_scroll'],
  ['000256.json', 'shroud_of_night_scroll'],
  ['000257.json', 'dark_presence_scroll'],
];

for (const [file, id] of SCROLLS_SHADOW_00030203) {
  test('000302.03 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.03)');
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
