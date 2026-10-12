// Задача 000153.05 (SPEC-коррекции: spec/world-map.md +
// spec/dungeons-storage.md — глубина, формулы, сейв) — RED-тесты
// (docs only; код игры и существующие тесты НЕ меняются на красной
// стадии).
//
// ТЗ (tasks/pending/000153.05.md): буллет «Процедурно генерируемый
// лабиринт» spec/world-map.md (L21-27) — канон «глубина» (целое ≥ 1,
// первый этаж = 1, код d.depth), форма/сид = f(координаты, глубина)
// (контент — + опыт персонажа), сложность = глубина: уровень мобов =
// уровень персонажа + (глубина−1), первый этаж — база = уровень
// персонажа (ЗАМЕНА L27 — фраза «зависеть от уровня персонажа»
// УДАЛЕНА), W = min(63, round(base·1.1^(глубина−1))), cap 63
// (решение 000153.02), stairs-down + подъём, спавн на клетке-выходе
// (000153.03), переходы не тратят день (день — только выход в мир
// depth=1), уровень моба на карте не отображается (в бою —
// отображается) → spec/mobs.md «Отображение уровня» (000153.04),
// группы 1-3 моба (dungeon.js nMobs). spec/dungeons-storage.md —
// «размер» = БАЗОВЫЙ размер (глубина 1) + рост формулой в
// src/dungeon.js, НОВЫЙ seed-буллет «сид этажа d.seed» (координаты +
// глубина; контент — d.seed + опыт), ПЕРЕПИСЬ сейв-буллета L69-72 →
// раздел dungeonMemory (ключ 'x,y:depth', contents/lastVisitDay/pos?,
// неломко: версия сейва не повышается, обрезка по
// dungeon_memory_days, contents = seed/mobs/chests/step + deposits —
// КОНСИСТЕНТНО с H2 «## Залежи» и validateDungeonContents), РЕФРАЗ
// L117-121 (2-е вхождение «в сейв НЕ пишутся» — file-wide ТЗ-греп).
//
// Контракты: memory/000153.05-spec-corrections.md (§2 — дословные
// ассерты, ФИНАЛЬНОЕ слово; §1 — карта ханков),
// memory/000153.05-depth-spec.md (канон/формулы/сейв — финальный
// дизайн .01–.03), memory/000153.01-dungeon-depth-save.md,
// memory/000153.02-floor-generation.md,
// memory/000153.03-floor-transitions.md,
// memory/000153.04-dungeon-mob-level-hidden.md.
//
// Красные «отсутствием» (осмысленно — правок SPEC ещё нет, не
// синтаксис: оба spec-файла существуют и читаются, все падения —
// ERR_ASSERTION по отсутствию/присутствию ТЕКСТА): WM-1..7, DS-1..4,
// CANON-1 = ровно 12. 2 guard'а (CANON-2, DS-5) — зелёные с рождения
// (паттерн SZ-3 000153.02), НЕ входят в expectedRedCount. Нормализация
// белых — осознанная (прецедент 000181/000184: хелперы скопированы 1:1
// из tests/spec-combat-wording.test.js): SPEC ломает строки, фразы-
// ассерты встанут в строку после norm.
//
// expectedRedCount = 12. Красная стадия (тест закоммичен, spec НЕ
// правлен): npm test — 2201 зелёных (база fcf7d82) + 2 новых зелёных
// guard'а = 2203 pass / 12 not ok (всего 2215); tests/spec-split.
// test.js ПОЛНОСТЬЮ зелёный (R7 = 52/121 = факт, spec не правлен).
// Зелёная стадия (правки spec + R7-пересчёт В ТОМ ЖЕ коммите) —
// 2215/2215. SPEC-453-GONE (spec-split.test.js, скан tests/+src/ на
// старую линейную цитату) — в этом файле старой цитаты НЕТ.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
// 000159: SPEC.md разбит на spec/*.md — пины читают подфайлы напрямую.
const WORLD_MAP = fs.readFileSync(path.join(ROOT, 'spec', 'world-map.md'), 'utf8');
const DUNGEONS_STORAGE = fs.readFileSync(
  path.join(ROOT, 'spec', 'dungeons-storage.md'), 'utf8');

function esc(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Нормализация белых: фразы, сломавшиеся переносом, встают в строку.
function norm(s) {
  return s.replace(/\s+/g, ' ');
}

const WM_N = norm(WORLD_MAP);
const DS_N = norm(DUNGEONS_STORAGE);
const WM_LINES = WORLD_MAP.split('\n');
const DS_LINES = DUNGEONS_STORAGE.split('\n');

// Срез буллета: от стартовой строки до следующей БУЛЛЕТ-строки
// (любой индент: « * » — топ-уровень, «   * » — суб-список полей
// JSON-каталога dungeons-storage). В буллет НЕ вставляются
// буллет-строки — продолжения индентом БЕЗ «*» (D9); иначе срез
// усекается и WM-2..7 ложно краснеют/зеленеют.
const BULLET_LINE = /^\s*\* /;
function bulletSlice(lines, start) {
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i += 1) {
    if (BULLET_LINE.test(lines[i])) { end = i; break; }
  }
  return norm(lines.slice(start, end).join('\n'));
}

// W-буллет: от строки «Процедурно генерируемый лабиринт» до следующей
// буллет-строки (L21 сохраняется на зелёной стадии дословно — якорь
// стабилен).
function wBullet() {
  const anchor = new RegExp(esc('Процедурно генерируемый лабиринт'));
  const start = WM_LINES.findIndex((l) => anchor.test(l));
  assert.ok(start !== -1,
    'world-map.md: буллет «Процедурно генерируемый лабиринт» не найден');
  return bulletSlice(WM_LINES, start);
}

// Буллет «`размер`» (суб-список полей JSON-каталога dungeons-storage,
// индент «   * »).
function sizeBullet() {
  const start = DS_LINES.findIndex(
    (l) => BULLET_LINE.test(l) && l.includes('`размер`'));
  assert.ok(start !== -1,
    'dungeons-storage.md: буллет «`размер`» не найден');
  return bulletSlice(DS_LINES, start);
}

// Буллет «сид этажа d.seed» — НОВЫЙ (вставка после «размер», до
// «постройка», D11; тот же уровень суб-списка «   * »). null — пока не
// существует (красная стадия).
function seedBullet() {
  const start = DS_LINES.findIndex(
    (l) => BULLET_LINE.test(l) && l.toLowerCase().includes('сид этажа'));
  if (start === -1) return null;
  return bulletSlice(DS_LINES, start);
}

// Срез H2 «## Залежи»: до EOF (единственный H2 файла; строка-заголовок
// обязана выжить — R2 spec-split).
function zSlice() {
  const start = DS_LINES.findIndex((l) => l.startsWith('## Залежи'));
  assert.ok(start !== -1,
    'dungeons-storage.md: H2 «## Залежи» не найден');
  return norm(DS_LINES.slice(start).join('\n'));
}

// --- world-map.md: буллет «Процедурно генерируемый лабиринт» (W) ---

test('SPEC 000153.05 WM-1: world-map — старая формула «зависеть от уровня персонажа» отсутствует (ТЗ-греп а)', () => {
  assert.ok(!WM_N.includes('зависеть от уровня персонажа'),
    'spec/world-map.md: старая формула «Сложность прохождения (уровень ' +
    'мобов и лута) должна зависеть от уровня персонажа» (L27) обязана ' +
    'быть удалена — сложность теперь растёт с глубиной');
  assert.ok(!WM_N.includes('зависет от уровня персонажа'),
    'spec/world-map.md: старая формула в любой инфлексии «зависет от ' +
    'уровня персонажа» отсутствует');
});

test('SPEC 000153.05 WM-2: W-буллет — форма = f(координаты, глубина); сид содержимого — + опыт персонажа', () => {
  const w = wBullet();
  assert.ok(w.includes('глубина'),
    'W-буллет: каноническое «глубина» (именительный, точное подстрочно) — ' +
    'форма/сид обязаны зависеть от глубины (сейчас только «глубиной» — ' +
    'буллет залежей 000157.03, чужая тема)');
  assert.ok(w.includes('координат'),
    'W-буллет: форма/сид — от координат на мировой карте');
  assert.ok(w.includes('опыта персонажа'),
    'W-буллет: сид содержимого = координаты + глубина + количество опыта ' +
    'персонажа (contentSeed — без изменений)');
});

test('SPEC 000153.05 WM-3: W-буллет — сложность = глубина (+1 уровень мобов/этаж; уровень персонажа — база первого этажа)', () => {
  const w = wBullet();
  assert.ok(/уровень персонажа \+ \(глубина [−-]\s?1\)/.test(w),
    'W-буллет: формула «уровень мобов = уровень персонажа + (глубина − ' +
    '1)» (код: effLevel = level + (d.depth−1), dungeon.js:653; допустимы ' +
    'знаки «−»/«-»)');
  assert.ok(w.includes('база'),
    'W-буллет: первый этаж — база = уровень персонажа (токен «база»)');
  assert.ok(!w.includes('зависеть от уровня персонажа'),
    'W-буллет: старая формула «зависеть от уровня персонажа» не осталась');
});

test('SPEC 000153.05 WM-4: W-буллет — размер W = min(63, round(base·1.1^(глубина−1))), cap 63 (000153.02)', () => {
  const w = wBullet();
  assert.ok(w.includes('1.1'),
    'W-буллет: коэффициент роста стороны 1.1 за этаж (площадь ×1.21/этаж, ' +
    'решение 000153.02)');
  assert.ok(w.includes('63'),
    'W-буллет: cap 63 (schema 5..63; 63 — CAP, не база, D6)');
});

test('SPEC 000153.05 WM-5: W-буллет — каждый этаж: stairs-down и подъём, спавн на клетке-выходе, переходы не тратят день', () => {
  const w = wBullet();
  assert.ok(w.includes('stairs-down') || w.includes('лестница вниз'),
    'W-буллет: лестница вниз (stairs-down) — вход на нижний этаж');
  assert.ok(w.includes('подъём') || w.includes('вверх'),
    'W-буллет: подъём на верхний этаж');
  assert.ok(w.includes('клетке-выходе'),
    'W-буллет: при входе на этаж спавн на клетке-выходе (000153.03)');
  assert.ok(w.includes('не тратят день') || w.includes('день — только'),
    'W-буллет: переходы не тратят день (день — только при выходе из ' +
    'подземелья depth=1 в мир, exitDungeon)');
});

test('SPEC 000153.05 WM-6: W-буллет — уровень моба на карте не отображается (в бою — отображается) → mobs.md «Отображение уровня»', () => {
  const w = wBullet();
  assert.ok(w.includes('не отображается'),
    'W-буллет: уровень моба на карте подземелья не отображается');
  assert.ok(w.includes('в бою'),
    'W-буллет: уровень отображается в бою');
  assert.ok(w.includes('Отображение уровня'),
    'W-буллет: ссылка на spec/mobs.md H2 «Отображение уровня» дословно ' +
    '(H2 mobs.md:117, 000153.04 — цель ссылки)');
});

test('SPEC 000153.05 WM-7: W-буллет — группы подземелья 1-3 моба (dungeon.js nMobs)', () => {
  const w = wBullet();
  assert.ok(w.includes('1-3 моба'),
    'W-буллет: размер групп 1-3 моба (ASCII-дефис, D14; код: nMobs = ' +
    '1 + floor(rng·3) ∈ {1,2,3}, dungeon.js:709)');
});

// --- dungeons-storage.md ---

test('SPEC 000153.05 DS-1: dungeons-storage — «в сейв НЕ пишутся» отсутствует (ТЗ-греп б; SCOPE = файл)', () => {
  assert.ok(!DS_N.includes('в сейв НЕ пишутся'),
    'spec/dungeons-storage.md: «в сейв НЕ пишутся» (сейчас ДВЕ вхождения: ' +
    'L69 сейв-буллет и L117 в теле «## Залежи») — обе переписаны: с ' +
    '000153.01 есть неломная секция dungeonMemory, с 000157.03 — deposits; ' +
    'SCOPE = файл (items.md:89 «Визуалы в сейв НЕ пишутся» легитимно, D8)');
});

test('SPEC 000153.05 DS-2: буллет «размер» — БАЗОВЫЙ размер (глубина 1); рост — формулой в src/dungeon.js (1.1, cap 63)', () => {
  const s = sizeBullet();
  assert.ok(s.includes('глубина 1'),
    'буллет «`размер`»: «размер» = БАЗОВЫЙ размер лабиринта в клетках ' +
    '(квадрат) — глубина 1 (JSON-каталог хранит базу, D6)');
  assert.ok(s.includes('src/dungeon.js'),
    'буллет «`размер`»: рост этажей — формулой в src/dungeon.js');
  assert.ok(s.includes('1.1'),
    'буллет «`размер`»: формула W = min(63, round(размер·1.1^(глубина−' +
    '1))) — коэффициент 1.1 (решение 000153.02)');
  assert.ok(s.includes('63'),
    'буллет «`размер`»: cap 63 (schema max — CAP, не база)');
});

test('SPEC 000153.05 DS-3: seed-буллет — «сид этажа d.seed»: координаты + глубина; контент — d.seed + опыт персонажа', () => {
  const s = seedBullet();
  assert.ok(s !== null,
    'dungeons-storage.md: буллет «сид этажа `d.seed`» отсутствует (вставка ' +
    'после буллета «`размер`», до «`постройка`», D11: сид формы = f(' +
    'координат входа, шумов Перлина, assets/map.png, глубина); содержимое ' +
    '— от d.seed + опыта персонажа)');
  assert.ok(s.includes('координат'),
    'seed-буллет: сид формы — от координат входа');
  assert.ok(s.includes('глубина'),
    'seed-буллет: глубина 1 — от координат, глубины ниже — от сида формы ' +
    'первого этажа + глубина (детерминированно, без rng — dungeonDepthSeed)');
  assert.ok(s.includes('опыта персонажа'),
    'seed-буллет: содержимое (мобы, сундуки, залежи) — от d.seed + ' +
    'количества опыта персонажа (зависит от глубины, 000153)');
});

test('SPEC 000153.05 DS-4: сейв-секция — dungeonMemory, ключ «x,y:depth», contents/lastVisitDay/pos, обрезка по dungeon_memory_days, неломко', () => {
  assert.ok(DS_N.includes('dungeonMemory'),
    'dungeons-storage.md: раздел сейва `dungeonMemory` (000153.01)');
  assert.ok(/x,y:depth/.test(DS_N),
    'dungeons-storage.md: ключ записи «x,y:depth» (координата входа + ' +
    'глубина; dungeon.js dungeonMemoryKey)');
  assert.ok(DS_N.includes('lastVisitDay'),
    'dungeons-storage.md: запись { contents, lastVisitDay, pos? } — поле ' +
    'lastVisitDay');
  assert.ok(/\bpos\b/.test(DS_N),
    'dungeons-storage.md: поле pos — позиция героя только в in-flight-' +
    'сейве (восстановление на этаж, fallback — клетка-вход)');
  assert.ok(DS_N.includes('dungeon_memory_days'),
    'dungeons-storage.md: обрезка записей старше `dungeon_memory_days` ' +
    '(при сейве и при восстановлении)');
  assert.ok(DS_N.includes('deposits'),
    'dungeons-storage.md: contents = seed/createdAtXp/step, mobs, chests ' +
    '+ deposits (с 000157.03) — КОНСИСТЕНТНО с H2 «## Залежи» и ' +
    'validateDungeonContents (dungeon.js:835-904)');
  assert.ok(DS_N.includes('версия сейва не повышается'),
    'dungeons-storage.md: неломко — версия сейва не повышается, миграций ' +
    'нет, старый сейв без раздела → молча пусто (fail-open)');
});

// --- канон «глубина» (цель ссылки 000157 «растёт с глубиной (000153)») ---

test('SPEC 000153.05 CANON-1: «глубина» (case-sensitive, точное подстрочно) в world-map.md (ТЗ-греп в)', () => {
  assert.ok(WM_N.includes('глубина'),
    'spec/world-map.md: каноническое имя шкалы «глубина» (целое ≥ 1, ' +
    'первый этаж = 1, код d.depth) — ОБЯЗАТЕЛЬНО (ТЗ п.3; цель ссылки ' +
    '000157 в этом файле; сейчас только «глубиной» — substring НЕ ' +
    'содержит «глубина»)');
});

// Guard (зелёный с рождения; НЕ входит в expectedRedCount): канон не
// теряется при переписи dungeons-storage (D5).
test('SPEC 000153.05 CANON-2 (guard): «глубина» (case-sensitive, точное подстрочно) в dungeons-storage.md', () => {
  assert.ok(DS_N.includes('глубина'),
    'spec/dungeons-storage.md: канон «глубина» (сейчас L86 «глубина 1 даёт ' +
    'добычу во всех типах» + скобка-повтор в буллете «`размер`»)');
});

// Guard (зелёный с рождения; НЕ входит в expectedRedCount): контракт
// H2 «## Залежи» (000157.02/.03) переживает рефраз L117-121.
test('SPEC 000153.05 DS-5 (guard): срез «## Залежи» — dungeonMemory/deposits/gathered/версия сейва не повышается', () => {
  const z = zSlice();
  assert.ok(z.includes('dungeonMemory'),
    '«## Залежи»: ссылка на секцию `dungeonMemory` (000153.01)');
  assert.ok(z.includes('deposits'),
    '«## Залежи»: `contents` этажа несёт `deposits`');
  assert.ok(z.includes('gathered'),
    '«## Залежи»: собранность (`gathered`) — ПРАВО как opened');
  assert.ok(z.includes('версия сейва не повышается'),
    '«## Залежи»: версия сейва не повышается');
});
