// Задача 000370 — flavor-описание assets/spells/show_enemies.json приведено к
// коду и норме spec/spells.md §«Каст вне боя» (закрытие долга 000365 /
// b20-кросс Т7(б)): текст не обещает окружности вокруг мобов без ограничения
// триггерящими группами и активным эффектом; старый оверклейм verbatim в
// файлах пакета не цитируется вообще — только склейкой (ловушка 000368:
// ложные литералы в форме паттерна ломают приёмочные грепы). Факт кода
// (база 9d41e9f8, якоря — grep-ом):
//   * src/main.js Проход 2.5: фильтр `!info || !info.triggers
//     || !(info.radius > 0)` — круги только ТРИГГЕРЯЩИХ групп
//     (aggressive/territorial, groupZoneInfo src/combat.js) с радиусом > 0;
//     поверженных сегодня отсекает groupVisible;
//   * src/main.js: весь проход под гейтом seOn =
//     isHeroEnemiesShown(hero, clock.day) — вне эффекта кругов нет вовсе
//     (инверсия дефолта 000350);
//   * src/spells.js isHeroEnemiesShown: expiresDay > day — «пока активен»;
//   * src/spells.js showEnemiesDays: 1 + Math.floor(Инт/10) — длительностная
//     часть текста сохраняется дословно («1 + Интеллект/10 дней»).
// Параметры JSON НЕ трогались: DYNAMIC_DAYS-исключение (src/spells.js), ключа
// «параметры» нет и не добавлять (валидатор 000235.02 «внебой → days 1..3»
// обходится множеством исключений).
//
// Тесты:
//   F-1 — критерии приёмки (а)/(б): нет оверклея; есть ограничение по
//         группам («только» + триггер-семантика + радиус) и временной гейт;
//   F-2 — страж длительности и ПАРАМЕТРОВ: префикс «1 + Интеллект/10 дней»,
//         прочие 13 полей литералами, KEY_ORDER, «параметры»/«предметы» нет;
//   F-3 — свип уникальности «описание» по каталогу spells (все непустые,
//         0 коллизий; счётчик каталога пинит spells.test.js — не дублируем);
//   F-4 — roundtrip-канон правленного файла (2 пробела + \\n);
//   F-5 — зеркало src/spells-data.js: описание ≡ JSON (зуб против позабытого
//         scripts/sync-spells-data.js в том же коммите);
//   F-6 — evidence-контракты в исходниках (чтение ТЕКСТА src/ — прецедент AV1
//         tests/aggro-visibility.test.js): если код поменяют и норма снова
//         разойдётся с flavor — краснеет этот тест, а не молчит.
//
// КРАСНЫЕ до правки JSON: F-1 (в файле ещё оверклейм) и S-JSON-1 из
// tests/spell-show-enemies-000350.test.js (константа DESC ре-пинится в том же
// коммите). Зелёными обязаны быть F-2…F-6 (стражи «вне scope не тронуто»).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SPELL_FILE = path.join(ROOT, 'assets', 'spells', 'show_enemies.json');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const KEY_ORDER = ['id', 'название', 'школа', 'база', 'степень', 'атрибут',
  'уровень', 'мани', 'действие', 'вне_боя', 'здания',
  'описание', 'icon', 'icon_prompt'];

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function fnBody(src, marker) {
  const i = src.indexOf(marker);
  assert.ok(i >= 0, marker + ' — маркер не найден в исходнике');
  const end = src.indexOf('\n  }', i);
  assert.ok(end > i, marker + ' — тело функции не найдено');
  return src.slice(i, end + 4);
}

// Оверклейм строится склейкой (старый текст verbatim не носим ни в коде,
// ни в сообщениях — приёмочные грепы по фрагментам должны давать 0 хитов).
const OVERCLAIM_RE = new RegExp(
  ['(все|всех|всем) видим', '[а-яё]* моб'].join(''), 'i');

test('F-1: описание show_enemies — без оверклейма про мобов подряд; ограничение триггерящими группами с радиусом > 0; временной гейт «пока эффект активен»', () => {
  assert.ok(fs.existsSync(SPELL_FILE));
  const d = String(readJson(SPELL_FILE)['описание']);
  assert.ok(!OVERCLAIM_RE.test(d),
    'критерий (а): текст обещает окружности вокруг мобов подряд, без '
    + 'ограничения триггерящими — против src/main.js Проход 2.5 '
    + '(фильтр !info.triggers || !(radius > 0)) и нормы spec/spells.md');
  assert.ok(/только[^.]*?(агрессивн|территориальн|враждебн)/i.test(d),
    'критерий (а): нет ограничения по типам групп («только» + '
    + 'триггер-семантика aggressive/territorial)');
  assert.ok(/радиус[^.]*(нуля|нул[ие]|положитель)/i.test(d),
    'критерий (а): нет ограничения радиуса (> 0) — в коде radius > 0');
  assert.ok(/пока[^.]*активен/i.test(d),
    'критерий (б): нет временного гейта («пока эффект активен») — '
    + 'в коде seOn = isHeroEnemiesShown, expiresDay > day');
});

test('F-2: страж текста и ПАРАМЕТРОВ — префикс «1 + Интеллект/10 дней» сохранён, прочие 13 полей и порядок ключей литералами, «параметры»/«предметы» нет (DYNAMIC_DAYS-контракт)', () => {
  const s = readJson(SPELL_FILE);
  assert.match(String(s['описание']), /1 \+ Интеллект\/10 дней/,
    'длительностная часть обязана совпадать со showEnemiesDays '
    + '(1 + Math.floor(Инт/10))');
  assert.deepEqual(Object.keys(s), KEY_ORDER,
    'порядок ключей — decadance-шейп (S-JSON-1 000350)');
  const rest = Object.assign({}, s);
  delete rest['описание'];
  assert.deepEqual(rest, {
    id: 'show_enemies',
    'название': 'Показать врагов',
    'школа': 'защита',
    'база': null,
    'степень': 1,
    'атрибут': 'wisdom',
    'уровень': 2,
    'мани': 8,
    'действие': 'внебой',
    'вне_боя': true,
    'здания': [
      'assets/buildings/monastery.json',
      'assets/buildings/healing_temple.json',
      'assets/buildings/mountain_temple.json',
    ],
    icon: 'assets/spell-icons/show_enemies.svg',
    icon_prompt: 'Плоская одноцветная иконка для игры «Приключения '
      + 'Флогистона»: глаз в пунктирном кольце радиуса, школа защита, '
      + 'степень 1. 24×24, заливка #e8dcc0, тёмный фон, единый силуэт, '
      + 'без обводки, без градиентов, без текста.',
  }, 'правка ТОЛЬКО ключа «описание»: прочие поля без изменений');
  assert.ok(!('параметры' in s),
    '«параметры» НЕ добавляем: длительность динамическая (DYNAMIC_DAYS)');
  assert.ok(!('предметы' in s), 'свитка нет (прецедент 000350/.349)');
});

test('F-3: свип уникальности «описание» по каталогу spells — все непустые, коллизий 0', () => {
  const files = fs.readdirSync(SPELLS_DIR)
    .filter((f) => f !== 'schema.json' && /^[a-z][a-z0-9_]*\.json$/.test(f));
  assert.ok(files.includes('show_enemies.json'));
  assert.ok(files.length > 100,
    'каталог не пустой (числовой пин состава — spells.test.js/spells-rename)');
  const descs = files.map(
    (f) => String(readJson(path.join(SPELLS_DIR, f))['описание'] ?? ''));
  descs.forEach((d, i) => {
    assert.ok(d.trim().length > 0,
      'описание пустое у ' + files[i]);
  });
  assert.equal(new Set(descs).size, descs.length,
    'описания уникальны (0 коллизий по каталогу)');
});

test('F-4: roundtrip-канон assets/spells/show_enemies.json — JSON.stringify(s, null, 2) + перевод строки', () => {
  const raw = fs.readFileSync(SPELL_FILE, 'utf8');
  assert.equal(raw, JSON.stringify(JSON.parse(raw), null, 2) + '\n',
    'правка текста обязана сохранять канон каталога (пин S-JSON-1 000350)');
});

test('F-5: зеркало src/spells-data.js — описание show_enemies ≡ JSON (sync-spells-data в том же коммите)', () => {
  const dataMod = require('../src/spells-data.js');
  const m = dataMod.SPELLS_BY_ID.show_enemies;
  assert.ok(m, 'show_enemies отсутствует в зеркале');
  assert.equal(m['описание'], String(readJson(SPELL_FILE)['описание']),
    'зеркало отстало от каталога: нужен node scripts/sync-spells-data.js');
});

test('F-6: evidence-контракты в исходниках — фильтр Прохода 2.5, seOn-гейт, формула дней, expiresDay > day (flavor обязан тексту кода)', () => {
  const mainSrc = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(
    mainSrc.includes('!info || !info.triggers || !(info.radius > 0)'),
    'фильтр триггерящих групп с радиусом > 0 исчез из Прохода 2.5 — '
    + 'ограничение в flavor-тексте больше не обеспечено кодом');
  assert.ok(mainSrc.includes('isHeroEnemiesShown(hero, clock.day)'),
    'seOn-гейт исчез — круги рисуются вне эффекта; «пока эффект активен» '
    + 'расходится с кодом');
  const spellsSrc = fs.readFileSync(
    path.join(ROOT, 'src', 'spells.js'), 'utf8');
  assert.ok(
    /1 \+ Math\.floor\(\s*v\s*\/ 10\)/.test(
      fnBody(spellsSrc, 'function showEnemiesDays')),
    'showEnemiesDays разошёлся с формулой «1 + Интеллект/10 дней» в тексте');
  assert.ok(fnBody(spellsSrc, 'function isHeroEnemiesShown')
    .includes('expiresDay > day'),
    'isHeroEnemiesShown больше не «expiresDay > day» — временной гейт '
    + 'текста не обеспечен');
});
