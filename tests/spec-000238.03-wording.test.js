// Задача 000238.03 (Ретро-правки 000238: SPEC кадр-свитч + stale-JSDoc +
// пин BA-7 viewBox; протокол 000218 — wording-пины) — RED-тесты
// (docs+tests; на красной стадии spec/buildings.md, JSDoc src/sprites.js
// и существующие тесты НЕ меняются: новый H2 «Анимация (кадр-свитч)» +
// строка лагеря + JSDoc buildingFrames/cityFrames — зелёная стадия;
// BA-7 viewBox-цикл + комментарий dungeon-ui + репин spec-split — зелёная
// стадия, В ТОМ ЖЕ коммите).
//
// ТЗ (tasks/pending/000238.03.md):
//   W1. spec/buildings.md — НОВЫЙ H2 «## Анимация (кадр-свитч)» (между
//       «## Типы построек» и «## Эффекты построек»): механизм кадр-свитча
//       слотовых построек (BUILDING_FRAMES — слоты 0/2/3/5/7/11), городов
//       (CITY_FRAMES — 51/52/53/54), лагеря (CAMP_FRAMES — 47, campSprite,
//       000131); выбор кадра — buildingFrameIndex(nowMs, tx, ty, n) —
//       детерминированный, БЕЗ RNG; кадр 1 = байт-копия статичной базы;
//       кадры — ЛИТЕРАЛЬНЫЕ таблицы вне каталога assets/buildings;
//       строгая готовность (fallback на базу запрещён).
//   W2. spec/buildings.md «### Лагерь» — строка спрайта: восстановление
//       трассируемости (префикс assets/sprites/buildings/ + campSprite/
//       000131); смысл wording сохранён дословно (ретро-000238.02
//       finding 2).
//   W3. JSDoc buildingFrames (src/sprites.js L779-788) — stale
//       «анимированные слоты (3 — …, 5 — кузница)» → слоты
//       0/2/3/5/7/11 + остальные (1, 4, 6, 8, 9, 10, 12 — без анимации)
//       (ретро-000238.01 finding 3).
//   W4. JSDoc cityFrames (src/sprites.js L835-849) — stale «Волна 1:
//       строка 53» → строки 51/52/53/54 (волна 1: 53; волна 2, 000238.01:
//       51/52/54) (ретро-000238.01 finding 4).
//
// Контракт: memory/000238.03-retro-spec-frame-switch.md (§3 — ФИНАЛЬНОЕ
// слово S1/S2/S3/S4 + T1). Протоколы: 000218 (wording-пины; нормализация
// белых ОБЯЗАТЕЛЬНА — spec переносит строки ~64-70 кол.; needle на старые
// фразы — ИЗ ЧАСТЕЙ), 000159 §5.1 (репин spec-split — зелёная стадия,
// В ТОМ ЖЕ коммите).
//
// Красные «отсутствием» (осмысленно — правок spec/JSDoc ещё нет, не
// синтаксис: оба файла существуют и читаются; все падения — ERR_ASSERTION
// по отсутствию нового текста / наличию stale-фраз). Хелперы esc/h1/h2/norm
// — 1:1 из tests/spec-combat-wording.test.js, h3 — 1:1 из
// tests/spec-000222-wording.test.js. readFileSync каждого файла ОТДЕЛЬНО
// (срез — в пределах ОДНОГО файла; перетекания в соседний нет; паттерн
// 000230.03.01). Мутаций НЕТ; файлов в spec/ НЕ создаёт (R1 spec-split:
// ровно 23).
//
// expectedRedCount = 4 (W1–W4). Красная стадия (тест закоммичен, spec/
// JSDoc НЕ правлены): npm test — 2930 базовых + 4 новых = 2934, ровно 4
// «not ok». Файл НЕ содержит цельных старых W3/W4-фраз (needles — из
// частей; self-scan), литерала «SPEC » + «453» (SPEC-453-GONE сканит
// tests/+src/), маркера «(v1)».

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// 000159: SPEC.md разбит на spec/*.md — пины читают подфайлы напрямую.
// 000238.03: оба затронутых файла — ОТДЕЛЬНО (W1/W2 — spec/buildings.md,
// W3/W4 — JSDoc src/sprites.js; срез — в пределах одного файла).
const BUILDINGS = fs.readFileSync(
  path.join(ROOT, 'spec', 'buildings.md'), 'utf8');
const SPRITES = fs.readFileSync(path.join(ROOT, 'src', 'sprites.js'), 'utf8');

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Срез H1-раздела: строка '# <name>' → до следующего '\n# '.
function h1(file, name) {
  const m = file.match(new RegExp('^' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: раздел «' + name + '» не найден');
  const i = m.index;
  const j = file.indexOf('\n# ', i + 1);
  return file.slice(i, j === -1 ? file.length : j);
}

// Срез H2-подраздела «## <name>» внутри текста (до следующего '\n## ').
function h2(sec, name) {
  const m = sec.match(new RegExp('^## ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: подраздел «' + name + '» не найден');
  const i = m.index;
  const j = sec.indexOf('\n## ', i + 1);
  return sec.slice(i, j === -1 ? sec.length : j);
}

// Срез H3-подраздела «### <name>» (до следующего '\n### ').
function h3(text, name) {
  const m = text.match(new RegExp('^### ' + esc(name) + '\\s*$', 'm'));
  assert.ok(m, 'spec: раздел «' + name + '» не найден');
  const i = m.index;
  const j = text.indexOf('\n### ', i + 1);
  return text.slice(i, j === -1 ? text.length : j);
}

// Нормализация белых: фразы, сломавшиеся переносом, встают в строку.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

// JSDoc-блок функции: от ближайшего '/**' перед 'function name(' до
// объявления (блок непосредственно над функцией — проверено).
function jsdoc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  assert.ok(i !== -1, 'src/sprites.js: функция ' + name + ' не найдена');
  return norm(src.slice(src.lastIndexOf('/**', i), i));
}

// W-срезы (norm).
const ANIM = () => norm(h2(h1(BUILDINGS, '# Постройки'),
  'Анимация (кадр-свитч)'));
const CAMP = () => norm(h3(BUILDINGS, 'Лагерь'));
// W3/W4-негатив — needle ИЗ ЧАСТЕЙ (цельных старых фраз в тест-файле нет —
// протокол 000187/000218; файл сканит сам себя).
const OLD_BUILDING = 'анимированные ' + 'слоты (3 — магазин магии, 5 — кузница)';
const OLD_CITY = 'Волна 1: ' + 'строка 53';

test('SPEC 000238.03 W1: buildings.md — НОВЫЙ H2 «Анимация (кадр-свитч)» — кадр-свитч: BUILDING_FRAMES слоты 0/2/3/5/7/11, CITY_FRAMES города 51/52/53/54, buildingFrameIndex(nowMs, tx, ty, n) — ДЕТЕРМИНИРОВАННЫЙ БЕЗ RNG (t/phase; BUILDING_FRAME_MS = 800 мс), кадр 1 = БАЙТ-КОПИЯ базы, кадры — ЛИТЕРАЛЬНЫЕ таблицы вне каталога, лагерь — campSprite (000131), строгая готовность (fallback на базу запрещён)', () => {
  const b = ANIM();
  const needles = [
    'BUILDING_FRAMES — слоты 0/2/3/5/7/11',
    'CITY_FRAMES — города 51/52/53/54',
    'Выбор кадра — ДЕТЕРМИНИРОВАННЫЙ, БЕЗ RNG',
    'buildingFrameIndex(nowMs, tx, ty, n):',
    't = max(0, floor(nowMs / 800)); phase = (((tx*5 + ty*9) % n) + n) % n;',
    'кадр = (t + phase) % n (BUILDING_FRAME_MS = 800 мс',
    'КАДР 1 = БАЙТ-КОПИЯ статичной базы',
    'CAMP_FRAMES — лагерь 47 (ключ — buildingId; база — campSprite, 000131',
    'ЛИТЕРАЛЬНЫЕ таблицы src/sprites.js, ВНЕ каталога assets/buildings',
    'legacy-маркер/skip; FALLBACK НА СТАТИЧНУЮ БАЗУ ЗАПРЕЩЁН',
  ];
  for (const n of needles) {
    assert.ok(b.includes(n),
      '«Анимация (кадр-свитч)» (spec/buildings.md): нет «' + n + '»');
  }
});

test('SPEC 000238.03 W2: buildings.md «Лагерь» — строка спрайта: трассируемость (assets/sprites/buildings/camp.svg (база, campSprite, 000131) + кадры camp_1..4.svg (CAMP_FRAMES, 000238)); строгая готовность (000224): кадр не готов — legacy-маркер/skip, fallback на базу запрещён; генерация/якоря не меняются — смысл wording сохранён', () => {
  const b = CAMP();
  const needles = [
    'Спрайт — assets/sprites/buildings/camp.svg (база, campSprite, 000131)',
    '+ кадры camp_1..4.svg (CAMP_FRAMES, 000238)',
    'строгая готовность (000224): кадр не готов — legacy-маркер/skip, ' +
      'fallback на базу запрещён',
    'генерация/якоря не меняются',
  ];
  for (const n of needles) {
    assert.ok(b.includes(n),
      '«Лагерь» (spec/buildings.md): нет «' + n + '»');
  }
});

test('SPEC 000238.03 W3: JSDoc buildingFrames (src/sprites.js) — анимированные слоты 0/2/3/5/7/11 + остальные слоты (1, 4, 6, 8, 9, 10, 12 — без анимации); stale «анимированные слоты (3 — …, 5 — кузница)» ОТСУТСТВУЕТ', () => {
  const b = jsdoc(SPRITES, 'buildingFrames');
  assert.ok(b.includes('анимированные слоты 0/2/3/5/7/11'),
    'JSDoc buildingFrames: нет «анимированные слоты 0/2/3/5/7/11»');
  assert.ok(b.includes('остальные слоты (1, 4, 6, 8, 9, 10, 12 — без анимации)'),
    'JSDoc buildingFrames: нет «остальные слоты (1, 4, 6, 8, 9, 10, 12 — ' +
      'без анимации)»');
  assert.ok(!b.includes(OLD_BUILDING),
    'JSDoc buildingFrames: stale-фраза «' + OLD_BUILDING + '» на месте');
});

test('SPEC 000238.03 W4: JSDoc cityFrames (src/sprites.js) — Строки ' +
  '51/52/53/54 (волна 1: 53; волна 2, 000238.01: 51/52/54; по 4 кадра ' +
  'city_NN_1..4.svg); stale «Волна 1: ' +
  'строка 53» ОТСУТСТВУЕТ', () => {
  const b = jsdoc(SPRITES, 'cityFrames');
  assert.ok(
    b.includes('Строки 51/52/53/54 (волна 1: 53; волна 2, 000238.01: ' +
      '51/52/54; по 4 кадра city_NN_1..4.svg)'),
    'JSDoc cityFrames: нет «Строки 51/52/53/54 (волна 1: 53; волна 2, ' +
      '000238.01: 51/52/54; по 4 кадра city_NN_1..4.svg)»');
  assert.ok(!b.includes(OLD_CITY),
    'JSDoc cityFrames: stale-фраза «' + OLD_CITY + '» на месте');
});
