// Задача 000389 (ретро-b24 кросс X-2): структурный зуб дня CHANGELOG.
//
// Конвенция memory/changelog-merge-date-section требует: все буллеты одного
// дня и одного типа — в ОДНУ секцию «### <тип>», порядок типов дня —
// Интерфейс → Игровой процесс → Исправления. Машинных зубов не было: коммит
// 8e798539 (000384) довнёс свой буллет ВТОРОЙ секцией «### Интерфейс» после
// «### Исправления» — единственный дубль во всей истории (2026-11-14).
//
// Плечи зуба:
//  T1 — антидубль глобален по всем датам и всем типам секций (включая
//       легаси-типы Графика/Управление): свип истории зелёный уже на базе.
//  T2 — канонический порядок проверяется только для дат >= ORDER_FROM_DATE:
//       в 22 старых датах исторический порядок обратный (Игровой процесс
//       первым), переносы истории запрещены задачей; легаси-типы вне
//       канонической проекции в порядке игнорируются.
//  T3 — self-check предикатов на синтетике (бессрочная регрессия против
//       ложной green при склейке дат / проглатывании легаси-типов).
//  T4 — пин перенесённого буллета 000384: байт-в-байт внутри ЖИВОЙ первой
//       «### Интерфейс» дня 2026-11-14 и ровно один раз во всём файле
//       (анти-перефраз: при легитимной правке текста буллета этот пин
//       меняется сознательно вместе с CHANGELOG).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CHANGELOG_PATH = path.join(ROOT, 'CHANGELOG.md');

const CANON_RANKS = new Map([
  ['Интерфейс', 1],
  ['Игровой процесс', 2],
  ['Исправления', 3],
]);

const ORDER_FROM_DATE = '2026-11-14';

function parseDays(text) {
  const days = [];
  let current = null;
  for (const line of text.split('\n')) {
    const dateMatch = /^## (\d{4}-\d{2}-\d{2})[ \t]*$/.exec(line);
    if (dateMatch) {
      current = { date: dateMatch[1], sections: [] };
      days.push(current);
      continue;
    }
    if (/^## /.test(line)) {
      current = null;
      continue;
    }
    if (!current) continue;
    const sectionMatch = /^### (.+?)[ \t]*$/.exec(line);
    if (sectionMatch) current.sections.push(sectionMatch[1]);
  }
  return days;
}

function duplicateSectionHits(text) {
  const hits = [];
  for (const day of parseDays(text)) {
    const counts = new Map();
    for (const section of day.sections) {
      counts.set(section, (counts.get(section) ?? 0) + 1);
    }
    for (const [section, count] of counts) {
      if (count > 1) hits.push(`${day.date}: «### ${section}» ×${count}`);
    }
  }
  return hits;
}

function canonOrderHits(text, fromDate = ORDER_FROM_DATE) {
  const hits = [];
  for (const day of parseDays(text)) {
    if (day.date < fromDate) continue;
    const ranked = day.sections
      .filter((section) => CANON_RANKS.has(section))
      .map((section) => [section, CANON_RANKS.get(section)]);
    for (let i = 1; i < ranked.length; i++) {
      if (ranked[i][1] < ranked[i - 1][1]) {
        hits.push(
          `${day.date}: «### ${ranked[i][0]}» идёт после «### ${ranked[i - 1][0]}»`,
        );
      }
    }
  }
  return hits;
}

const FROZEN_BULLET_LINES = ["- **Порядок навыков на странице [I].** Панель «Навыки» снова идёт по","  книжному порядку: Сила, Ловкость, Телосложение, Интеллект, Мудрость,","  Харизма; группы вторичных — следом за своими основными (Посох — в","  конце группы Силы), школы магии — Защита, Исцеление, Лёд, Огонь,","  Природа, Тень. После переименования файлов каталога навыки на время","  выстроились по алфавиту — это заметно только взглядом: состав и значения","  навыков не менялись."];
const FROZEN_BULLET = FROZEN_BULLET_LINES.join('\n');

test('000389 T1: в каждой дате CHANGELOG не более одной ###-секции каждого типа', () => {
  const text = readFileSync(CHANGELOG_PATH, 'utf8');
  const hits = duplicateSectionHits(text);
  assert.equal(
    hits.length,
    0,
    `дубли секций дня (конвенция 000389 — все буллеты одного типа в одну секцию): ${hits.join('; ')}`,
  );
});

test('000389 T2: порядок секций Интерфейс→Игровой процесс→Исправления в датах от 2026-11-14', () => {
  const text = readFileSync(CHANGELOG_PATH, 'utf8');
  const hits = canonOrderHits(text);
  assert.equal(
    hits.length,
    0,
    `нарушения канонического порядка (легаси-типы игнорируются, даты до ${ORDER_FROM_DATE} вне скоупа): ${hits.join('; ')}`,
  );
});

test('000389 T3: self-check предикатов структуры дня на синтетических блоках', () => {
  const cases = [
    {
      name: 'а: дубль Интерфейс в дате от порога',
      content:
        '## 2026-11-15\n\n### Интерфейс\n- x\n\n### Игровой процесс\n- y\n\n### Исправления\n- z\n\n### Интерфейс\n- w\n',
      dup: 1,
      order: 1,
    },
    {
      name: 'б: Исправления раньше Интерфейс',
      content: '## 2026-11-15\n\n### Исправления\n- z\n\n### Интерфейс\n- x\n',
      dup: 0,
      order: 1,
    },
    {
      name: 'в: легаси-дубль Графика',
      content: '## 2026-11-15\n\n### Графика\n- a\n\n### Графика\n- b\n',
      dup: 1,
      order: 0,
    },
    {
      name: 'г: легаси-тип между каноническими не мешает порядку',
      content:
        '## 2026-11-15\n\n### Интерфейс\n- a\n\n### Графика\n- b\n\n### Игровой процесс\n- c\n\n### Исправления\n- d\n',
      dup: 0,
      order: 0,
    },
    {
      name: 'д: дата ниже порога с обратным порядком вне скоупа T2',
      content: '## 2026-11-13\n\n### Игровой процесс\n- a\n\n### Интерфейс\n- b\n',
      dup: 0,
      order: 0,
    },
    {
      name: 'е: чистый блок без нарушений',
      content:
        '## 2026-11-15\n\n### Интерфейс\n- a\n\n### Игровой процесс\n- b\n\n### Исправления\n- c\n',
      dup: 0,
      order: 0,
    },
    {
      name: 'ж: заголовок ## без даты не склеивает даты и не копит секции',
      content:
        '## 2026-11-15\n### Интерфейс\n- a\n\n## Приложение\n\n### Интерфейс\n- b\n\n## 2026-11-16\n### Интерфейс\n- c\n',
      dup: 0,
      order: 0,
    },
  ];
  const mismatches = [];
  for (const c of cases) {
    const dup = duplicateSectionHits(c.content).length;
    const order = canonOrderHits(c.content).length;
    if (dup !== c.dup) mismatches.push(`${c.name}: дубли ${dup}, ожидалось ${c.dup}`);
    if (order !== c.order) mismatches.push(`${c.name}: порядок ${order}, ожидалось ${c.order}`);
  }
  assert.equal(
    mismatches.length,
    0,
    `предикаты структуры лгут на синтетике: ${mismatches.join('; ')}`,
  );
});

test('000389 T4: буллет «Порядок навыков на странице [I]…» байт-в-байт в живой ### Интерфейс дня 2026-11-14 и ровно один раз в файле', () => {
  const text = readFileSync(CHANGELOG_PATH, 'utf8');
  const occurrences = text.split(FROZEN_BULLET).length - 1;
  assert.equal(
    occurrences,
    1,
    'перенесённый буллет 000384 должен встречаться в CHANGELOG ровно один раз (без перефразов и копий)',
  );
  const dayMatch = /^## 2026-11-14[ \t]*$/m.exec(text);
  assert.ok(dayMatch, 'секция «## 2026-11-14» не найдена в CHANGELOG');
  const rest = text.slice(dayMatch.index + dayMatch[0].length);
  const nextDay = /^## /m.exec(rest);
  const dayRegion = nextDay ? rest.slice(0, nextDay.index) : rest;
  const firstI = dayRegion.indexOf('### Интерфейс');
  assert.notEqual(firstI, -1, 'в дне 2026-11-14 нет ни одной «### Интерфейс»');
  const nextSection = Math.min(
    ...['\n### ', '\n## '].map((marker) => {
      const at = dayRegion.indexOf(marker, firstI + '### Интерфейс'.length);
      return at === -1 ? dayRegion.length : at;
    }),
  );
  const liveSection = dayRegion.slice(firstI, nextSection);
  assert.ok(
    liveSection.includes(FROZEN_BULLET),
    'буллет «Порядок навыков на странице [I].» должен стоять внутри ПЕРВОЙ (живой) «### Интерфейс» дня 2026-11-14, а не отдельной дубль-секцией',
  );
});
