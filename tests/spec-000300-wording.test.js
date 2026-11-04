// Задача 000300 — SPEC: фиксация обучения отряда (кто обучается,
// где учитывается прогресс; взаимодействие 000296/000297/000298 —
// ПО ПЕРСОНАЖУ, золото — Флогистон). ТЗ tasks/pending/000300.md п.2/3.
//
// Контракт (R5 000159 — phrase-пины + guard строк):
//   * W1: spec/npc.md H2 «Школы (обучение)» — АППЕНД блока 000300:
//     «обучается АКТИВНЫЙ персонаж», trainPoints, «ПО ПЕРСОНАЖУ»,
//     «ВСЕГДА платит Флогистон», 000299.03, Sheet.addXp. Граница:
//     позитив-фразы 000296/000297/000298 НЕ переписаны (append-only —
//     spec-000298-wording S1/S2 цёлы). specLines(npc.md) = 37.
//   * W2: spec/companions.md H2 «Активный персонаж» — ЗАМЕНА хвостового
//     буллета «Обучение партии … ЯВНО вне этого контракта (задача
//     000300)» на буллет 000300. specLines(companions.md) = 211;
//     neg-пин старой фразы.
//   * W3: spec/efir-spirit.md H2 «Сейв» — LINE-NEUTRAL: trainPoints в
//     списке ключей, «11 ключей», backfill «trainPoints — 10».
//     specLines(efir-spirit.md) = 147 (строки НЕ добавлены).
//
// Краснота: фразы/строки в SPEC отсутствуют (файлы существуют —
// осмысленная краснота, правок SPEC ещё нет).
//
// expectedRedCount (файл) = 3 (W1, W2, W3).
// Файл НЕ содержит литерала «SPEC» + «453» (скан-тест SPEC-453-GONE).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const NPCMD = fs.readFileSync(path.join(ROOT, 'spec', 'npc.md'), 'utf8');
const COMPANIONS = fs.readFileSync(path.join(ROOT, 'spec', 'companions.md'),
  'utf8');
const EFIR = fs.readFileSync(path.join(ROOT, 'spec', 'efir-spirit.md'), 'utf8');

// H2-срез по имени (до следующего H2/H1, 000159).
function h2(src, title) {
  const lines = src.split('\n');
  let i = -1;
  for (let k = 0; k < lines.length; k++) {
    if (lines[k] === '## ' + title) { i = k + 1; break; }
  }
  if (i === -1) return '';
  let j = lines.length;
  for (let k = i; k < lines.length; k++) {
    if (lines[k].startsWith('## ') || lines[k].startsWith('# ')) {
      j = k; break;
    }
  }
  return lines.slice(i, j).join('\n');
}

// Нормализация белых: фразы, сломавшиеся переносом, встают в строку.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

// positive-needle в срезе (нормализованном).
function phrase(slice, label, needle, why) {
  assert.ok(norm(slice).includes(needle),
    label + ': фраза не найдена: «' + needle + '» — ' + why);
}

// Конвенция 000159 R5: split('\n') + pop хвостового ''.
function specLines(s) {
  const lines = s.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.length;
}

test('SPEC 000300 W1: spec/npc.md «Школы (обучение)» — блок 000300: обучается АКТИВНЫЙ персонаж, trainPoints/ПО ПЕРСОНАЖУ/золото Флогистон/000299.03/Sheet.addXp; 37 строк', () => {
  const sc = h2(NPCMD, 'Школы (обучение)');
  phrase(sc, '«Школы (обучение)»', 'обучается АКТИВНЫЙ персонаж',
    'кто обучается (активный, 000299) не зафиксирован');
  phrase(sc, '«Школы (обучение)»', 'trainPoints',
    'бюджет trainPoints (000298) в контексте отряда не зафиксирован');
  phrase(sc, '«Школы (обучение)»', 'ПО ПЕРСОНАЖУ',
    'лимит/цена — по обучающемуся (не по владельцу) не зафиксировано');
  phrase(sc, '«Школы (обучение)»', 'ВСЕГДА платит Флогистон',
    'золото — ВСЕГДА Флогистон (owner) не зафиксировано');
  phrase(sc, '«Школы (обучение)»', '000299.03',
    'ссылка на NaN-ловушку (лист без gold) не зафиксирована');
  phrase(sc, '«Школы (обучение)»', 'Sheet.addXp',
    'сброс trainPoints при ап-левеле (Sheet.addXp) не зафиксирован');
  assert.equal(specLines(NPCMD), 37,
    'spec/npc.md: строк != 37 (26 → 37: +11 строк блока 000300 в '
    + 'конец раздела, append-only) + ре-пин SPEC_FILE_LINES (000159 '
    + '§5.1) и guard wording 000296/000297/000298 в том же коммите');
});

test('SPEC 000300 W2: spec/companions.md «Активный персонаж» — буллет 000300 (замена «ЯВНО вне этого контракта»); 211 строк', () => {
  const sc = h2(COMPANIONS, 'Активный персонаж');
  phrase(sc, '«Активный персонаж»', 'обучается АКТИВНЫЙ персонаж',
    'обучение — по активному (000299) не зафиксировано');
  phrase(sc, '«Активный персонаж»', 'ПО ПЕРСОНАЖУ',
    'лимит/цена — по обучающемуся не зафиксировано');
  phrase(sc, '«Активный персонаж»', 'ВСЕГДА платит Флогистон',
    'золото — ВСЕГДА Флогистон (owner) не зафиксировано');
  phrase(sc, '«Активный персонаж»', '000299.03',
    'ссылка на NaN-ловушку не зафиксирована');
  phrase(sc, '«Активный персонаж»', 'ин-плейс ре-рендер',
    'клик по портрету при открытой «школе» — ин-плейс ре-рендер не '
    + 'зафиксирован');
  assert.ok(!norm(sc).includes('ЯВНО вне этого контракта'),
    'старая фраза «ЯВНО вне этого контракта (задача 000300)» на месте '
    + '— заменена буллетом 000300');
  assert.equal(specLines(COMPANIONS), 211,
    'spec/companions.md: строк != 211 (203 → 211: буллет «Активный '
    + 'персонаж» 2 строки → 10, +8) + ре-пин SPEC_FILE_LINES (000159 '
    + '§5.1) и guard wording 000295/000304 в том же коммите');
});

test('SPEC 000300 W3: spec/efir-spirit.md «Сейв» — LINE-NEUTRAL: trainPoints в списке, «11 ключей», backfill «trainPoints — 10»; 147 строк', () => {
  const sc = h2(EFIR, 'Сейв');
  phrase(sc, '«Сейв»', 'trainPoints',
    'trainPoints — ключ листа Эфира в сейве не зафиксирован');
  phrase(sc, '«Сейв»', '11 ключей',
    'счёт ключей 10 → 11 не зафиксирован');
  phrase(sc, '«Сейв»', 'trainPoints — 10',
    'backfill старого формата: trainPoints — 10 не зафиксирован');
  assert.equal(specLines(EFIR), 147,
    'spec/efir-spirit.md: строк != 147 (LINE-NEUTRAL — строки НЕ '
    + 'добавлены, ре-пин НЕ требуется)');
});
