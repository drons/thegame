const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const I = require('../src/items.js');

const E9_HEADER_RE = /E9 \(каталог — (\d+) предметов/g;

test('000274: шапка E9 (tests/items.test.js) синхронна каталогу — CANARY («шапка ≠ тело»): «E9 (каталог — N предметов» == I.allItems().length', () => {
  const src = fs.readFileSync(path.join(__dirname, 'items.test.js'), 'utf8');
  const matches = [...src.matchAll(E9_HEADER_RE)];
  assert.equal(matches.length, 1, 'шаблон «E9 (каталог — N предметов» обязан встречаться ровно 1 раз (шапка); 0 или >1 = шапку переписали/дублировали — re-pin canary-regex 000274 (найдено: ' + matches.length + ')');
  const headerN = Number(matches[0][1]);
  const live = I.allItems().length;
  assert.equal(headerN, live, 'шапка E9 ≠ каталог: шапка «' + headerN + ' предметов», каталог ' + live + ' — синхронизируйте шапку в том же коммите, что и re-pin тела E9 (canary 000274, memory/000274-e9-header-canary.md)');
});
