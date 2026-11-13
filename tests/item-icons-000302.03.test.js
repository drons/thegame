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
  ['umbra_bolt_scroll.json', 'umbra_bolt_scroll'],
  ['drain_life_scroll.json', 'drain_life_scroll'],
  ['void_arrow_scroll.json', 'void_arrow_scroll'],
  ['night_strike_scroll.json', 'night_strike_scroll'],
  ['soul_drain_scroll.json', 'soul_drain_scroll'],
  ['shadowflame_scroll.json', 'shadowflame_scroll'],
  ['dark_nova_scroll.json', 'dark_nova_scroll'],
  ['shroud_scroll.json', 'shroud_scroll'],
  ['night_blade_scroll.json', 'night_blade_scroll'],
  ['vampire_touch_scroll.json', 'vampire_touch_scroll'],
  ['fear_scroll.json', 'fear_scroll'],
  ['doom_mark_scroll.json', 'doom_mark_scroll'],
  ['despair_scroll.json', 'despair_scroll'],
  ['shadow_curse_scroll.json', 'shadow_curse_scroll'],
  ['shadow_bind_scroll.json', 'shadow_bind_scroll'],
  ['nightmare_scroll.json', 'nightmare_scroll'],
  ['dark_ensnare_scroll.json', 'dark_ensnare_scroll'],
  ['shadow_pool_scroll.json', 'shadow_pool_scroll'],
  ['veil_of_night_scroll.json', 'veil_of_night_scroll'],
  ['shadow_wraith_scroll.json', 'shadow_wraith_scroll'],
  ['void_horror_scroll.json', 'void_horror_scroll'],
  ['shadow_step_scroll.json', 'shadow_step_scroll'],
  ['invisibility_scroll.json', 'invisibility_scroll'],
  ['shroud_of_night_scroll.json', 'shroud_of_night_scroll'],
  ['dark_presence_scroll.json', 'dark_presence_scroll'],
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
