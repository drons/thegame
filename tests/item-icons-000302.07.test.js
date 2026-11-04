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
  ['000019.json', 'alchemy_manual'],
  ['000020.json', 'sword_treatise'],
  ['000021.json', 'archery_manual'],
  ['000025.json', 'stone_fist_grimoire'],
  ['000026.json', 'iron_hide_tome'],
  ['000027.json', 'fire_spellbook'],
  ['000028.json', 'ice_spellbook'],
  ['000029.json', 'heavy_tome'],
  ['000030.json', 'archer_scroll'],
  ['000031.json', 'meditation_scroll'],
  ['000032.json', 'nature_scroll'],
  ['000043.json', 'fireball_scroll'],
  ['000044.json', 'flame_burst_scroll'],
  ['000045.json', 'frost_bolt_scroll'],
  ['000046.json', 'blizzard_scroll'],
  ['000047.json', 'chill_scroll'],
  ['000048.json', 'light_heal_scroll'],
  ['000049.json', 'magic_shield_scroll'],
  ['000050.json', 'vine_scroll'],
  ['000051.json', 'resurrect_scroll'],
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
    });
}
