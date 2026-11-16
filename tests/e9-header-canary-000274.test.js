const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../src/items.js');

const E9_HEADER_RE = /E9 \(каталог — (\d+) предметов/g;
const E9_LS_RE = /E9 \(каталог — ls-предикат/g;

test('000274: шапка E9 (tests/items.test.js) — ls-предикат (миграция 000397); возврат числовой «E9 (каталог — N предметов» запрещён — CANARY', () => {
  const src = fs.readFileSync(path.join(__dirname, 'items.test.js'), 'utf8');
  const numeric = [...src.matchAll(E9_HEADER_RE)];
  assert.equal(numeric.length, 0, 'числовая форма «E9 (каталог — N предметов» в items.test.js запрещена (миграция 000397: счётчик каталога = ls-предикат, ручной ре-пин шапки снят); найдено: ' + numeric.length);
  const ls = [...src.matchAll(E9_LS_RE)];
  assert.equal(ls.length, 1, 'ls-шапка «E9 (каталог — ls-предикат» обязана встречаться ровно 1 раз (шапка E9 в items.test.js); найдено: ' + ls.length);
  const live = I.allItems().length;
  assert.ok(live >= 1064, 'каталог — ls-пол ≥ 1064 (миграция 000397), факт: ' + live);
});
