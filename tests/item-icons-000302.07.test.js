// Задача 000302.07 — КРАСНЫЕ ТЕСТЫ (TDD): 20 книг + legacy-свитков
// (000019–000032 — 11 skill_book; 000043–000051 — 8 spell_scroll +
// resurrect_scroll) — поле "icon" в JSON КОНЦОМ объекта + SVG
// assets/sprites/items/<id>.svg (имя файла = id предмета).
//
// ТЗ — tasks/pending/000302.07.md (фикс-список 20); конвенция и
// палитра акцентов — memory/000302-icon-registry.md §2/§3.
// kind=node; require — только node:test/assert/fs/path (без
// src-require).
//
// КРАСНЫЕ (20 — по одному тесту на предмет, краснота осмысленная:
// 'icon' in j === false, свойства нет — не краш загрузки):
//   icon === "assets/sprites/items/<id>.svg"; svg-файл существует
//   (path.join(ROOT, it.icon)). Полный прогон до GREEN: только
//   20 новых красных (+база).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const BOOKS_LEGACY_00030207 = [
  ['alchemy_manual.json', 'alchemy_manual'],
  ['sword_treatise.json', 'sword_treatise'],
  ['archery_manual.json', 'archery_manual'],
  ['stone_fist_grimoire.json', 'stone_fist_grimoire'],
  ['iron_hide_tome.json', 'iron_hide_tome'],
  ['fire_spellbook.json', 'fire_spellbook'],
  ['ice_spellbook.json', 'ice_spellbook'],
  ['heavy_tome.json', 'heavy_tome'],
  ['archer_scroll.json', 'archer_scroll'],
  ['meditation_scroll.json', 'meditation_scroll'],
  ['nature_scroll.json', 'nature_scroll'],
  ['fireball_scroll.json', 'fireball_scroll'],
  ['flame_burst_scroll.json', 'flame_burst_scroll'],
  ['frost_bolt_scroll.json', 'frost_bolt_scroll'],
  ['blizzard_scroll.json', 'blizzard_scroll'],
  ['chill_scroll.json', 'chill_scroll'],
  ['light_heal_scroll.json', 'light_heal_scroll'],
  ['magic_shield_scroll.json', 'magic_shield_scroll'],
  ['vine_scroll.json', 'vine_scroll'],
  ['resurrect_scroll.json', 'resurrect_scroll'],
];

for (const [file, id] of BOOKS_LEGACY_00030207) {
  test('000302.07 ' + file + ' (' + id + '): "icon" = '
    + 'assets/sprites/items/' + id + '.svg, svg-файл существует',
    () => {
      const jp = path.join(ITEMS_DIR, file);
      assert.ok(fs.existsSync(jp),
        file + ': JSON в assets/items (краснота: файла нет)');
      const j = JSON.parse(fs.readFileSync(jp, 'utf8'));
      assert.equal(j.id, id,
        file + ': id = ' + id + ' (фикс-список ТЗ 000302.07)');
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
