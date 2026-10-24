// Задача 000124: статические тесты layout экрана боя в index.html.
//
// Паттерн — статический разбор <style> index.html (как cssRule в
// tests/ui-panel.test.js и разбор html в tests/index-order.test.js):
// CSS-текст — источник правды, браузер/vm не нужны.
//
// Контракт — memory/000124-combat-layout.md:
//  * БАЗА .combat-side (320px), .combat-log (170px) НЕ ТРОГАЮТСЯ
//    (стражи ниже, зелёные): эти классы переиспользуют чужие
//    оверлеи — постройка, NPC; правило .dungeon-overlay .combat-side
//    (панель оверлея локации, 000066) УДАЛЕНО в 000247 — панели в
//    оверлее локации нет в обоих kind'ах. Вся геометрия боя 000124
//    живёт ТОЛЬКО в скоупе .combat-overlay--combat. Диалог NPC
//    декэплен от .combat-side в 000125 (свой класс .npc-panel,
//    правило .npc-overlay .combat-side удалено) — его layout не
//    зависит от этих правил при ЛЮБОМ порядке мержей 000124/000125.
//  * .combat-actions — класс только боевой (grep по src/), его базовое
//    правило правится: 4 колонки (8 кнопок = 2 ряда, ТЗ п. 2).
//  * .combat-overlay--combat .combat-log — flex: 1 без фиксированной
//    высоты (журнал — между state и кнопками, ТЗ п. 3).
//  * Правки ревью 2026-10-01: portrait-кап панели 512px и формула
//    canvas без циркулярного 100%; баннер результата = размер canvas.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// ПЕРВОЕ вхождение правила с ТОЧНЫМ селектором (селектор в начале
// строки — сложное правило вида «.a .b {» не матчит селектору «.b»):
// возвращается объект { свойство: значение }.
function cssRule(selector) {
  const re = new RegExp('^[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}', 'm');
  const m = html.match(re);
  assert.ok(m, 'CSS-правило ' + selector + ' { … } найдено в index.html');
  const decls = {};
  for (const part of m[1].split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

// --- Стражи базовых правил (подземелье / постройка) ---

test('index.html: стража — база .combat-side = 320px (000124 не переписывает базу)', () => {
  assert.equal(cssRule('.combat-side')['width'], '320px',
    'база .combat-side — 320px (геометрия боя — только в скоупе '
    + '.combat-overlay--combat)');
});

test('index.html: стража — база .combat-log = 170px (бой)', () => {
  assert.equal(cssRule('.combat-log')['height'], '170px',
    'база .combat-log — 170px (журнал боя; боевой скоуп переопределяет '
    + 'flex: 1)');
});

// Правило диалога NPC (.npc-overlay .combat-side) — УДАЛЕНО в 000125:
// диалог декэплен от .combat-side, панель — свой класс .npc-panel
// (стража — tests/npc-layout.test.js, секция 000125).
test('index.html: стража — .dungeon-overlay .combat-side УБРАНО (000247: панели в оверлее локации нет в обоих kind\'ах)', () => {
  assert.ok(!html.includes('.dungeon-overlay .combat-side'),
    'правило .dungeon-overlay .combat-side УБРАНО (000247: панель '
    + 'убрана из оверлея локации СОВСЕМ — оверлей = canvas); '
    + 'база .combat-side/.combat-log — живые (бой/постройка)');
});

// --- Красные: layout боя по ТЗ 000124 ---

test('index.html: .combat-actions — ЧЕТЫРЕ колонки (repeat(4, …)) (000124)', () => {
  const decls = cssRule('.combat-actions');
  assert.match(decls['grid-template-columns'] || '', /repeat\(\s*4\s*,/,
    'база .combat-actions — 4 колонки (8 кнопок = 2 ряда), '
    + 'факт: ' + decls['grid-template-columns']);
});

test('index.html: .combat-overlay--combat .combat-log — flex: 1, без фиксированной высоты (000124)', () => {
  const decls = cssRule('.combat-overlay--combat .combat-log');
  assert.ok(decls['flex'] && /^\s*1(\s|$)/.test(decls['flex']),
    'журнал боя — flex: 1 (между state и кнопками), '
    + 'факт: ' + decls['flex']);
  assert.ok(!decls['height'] || !/^\s*\d/.test(decls['height']),
    'фиксированной высоты нет (height: 170px — только база), '
    + 'факт: ' + decls['height']);
});

// --- Правки по итогам ревью (2026-10-01) ---
//
// Пины layout-математики, которую старым тестам не видно (статический
// разбор не моделирует flex): (a) в portrait при заполненном журнале
// панель превышала бюджет и canvas вылезал за верх вьюпорта;
// (b) ширина canvas min(100%, …) — циркулярный процент (box в колонке
// определяется самим canvas) — риск схлопнуться в 0; (c) баннер
// перестал совпадать с canvas, когда .combat-box растянулся.
//
// cssRule() берёт ПЕРВОЕ вхождение в файле (row-скоуп); правила ВНУТРИ
// portrait-медиазапроса разбираем отдельно.

function portraitMediaBody() {
  const m = html.match(/@media \(max-width: 640px\)\s*and\s*\(orientation: portrait\)\s*\{([\s\S]*?)\n    \}/);
  assert.ok(m, 'portrait-медиазапрос (max-width: 640px) найден в index.html');
  return m[1];
}

function portraitRule(selector) {
  const re = new RegExp('[ \\t]*'
    + selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '[ \\t]*\\{([^}]*)\\}');
  const mm = portraitMediaBody().match(re);
  assert.ok(mm, 'правило ' + selector + ' найдено в portrait-медиазапросе');
  // Комментарии внутри блока объявлений режем (конвенция — до
  // правила, но парсер не должен от них ломаться: } в комментарии
  // иначе режет блок).
  const block = mm[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
  const decls = {};
  for (const part of block.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

test('index.html: portrait — панель в капе 512px, canvas без циркулярного 100% (ревью 2026-10-01)', () => {
  const side = portraitRule('.combat-overlay--combat .combat-side');
  assert.equal(side['max-height'], '512px',
    'портрет: панель ограничена бюджетом 512px — иначе при '
    + 'заполненном журнале (до 9 строк) и кнопках, растущих с '
    + 'шириной, canvas вылезает за верх вьюпорта (390×844/568×748/'
    + '430×932); факт: ' + side['max-height']);
  assert.equal(side['min-height'], '0',
    'портрет: min-height 0 — max-height действительно ограничивает '
    + 'панель; факт: ' + side['min-height']);
  const cv = portraitRule('.combat-overlay--combat .combat-box canvas');
  assert.ok(!/100%/.test(cv['width'] || ''),
    'портрет: в формуле ширины canvas нет 100% — ширина .combat-box '
    + 'в колонке определяется самим canvas (циркулярный процент → '
    + 'риск схлопнуться в 0); факт: ' + cv['width']);
  assert.equal(cv['width'], 'min(100vw - 16px, 100vh - 16px - 520px)',
    'портрет: canvas = доступная ширина (100vw − padding 8×2) ∩ '
    + 'высотный бюджет (100vh − 16 − (gap 8 + кап панели 512)); '
    + 'факт: ' + cv['width']);
  assert.ok(!/\.combat-overlay--combat \.combat-log/.test(portraitMediaBody()),
    'портрет: своего правила .combat-log нет — журнал берёт '
    + 'min-height: 0 из скоупа и скроллится (кап 512px держится и '
    + 'при широких вьюпортах, где 2 ряда кнопок ≈ 294px)');
});

test('index.html: баннер результата — ровно размером с canvas в скоупе боя (ревью 2026-10-01)', () => {
  const cv = cssRule('.combat-overlay--combat .combat-box canvas');
  const bn = cssRule('.combat-overlay--combat .combat-banner');
  assert.equal(bn['transform'], 'translate(-50%, -50%)',
    'баннер центрируется в .combat-box (box больше canvas: row — '
    + 'высота оверлея, portrait — остаток колонки); факт: '
    + bn['transform']);
  assert.equal(bn['width'], cv['width'],
    'баннер (row) = формула ширины canvas — как на master, где box '
    + 'был размером с canvas; факт: ' + bn['width']);
  assert.equal(bn['height'], cv['width'],
    'баннер (row) квадратен, та же формула; факт: ' + bn['height']);
  const pcv = portraitRule('.combat-overlay--combat .combat-box canvas');
  const pb = portraitRule('.combat-overlay--combat .combat-banner');
  assert.equal(pb['width'], pcv['width'],
    'баннер (portrait) = формула ширины canvas (portrait); факт: '
    + pb['width']);
  assert.equal(pb['height'], pcv['width'],
    'баннер (portrait) квадратен, та же формула; факт: ' + pb['height']);
});

// --- 000199: компактный верхний инфоблок боя (MP-полоска +
// счётчики действий) ---
//
// Новые CSS-правила — ТОЛЬКО в скоупе .combat-overlay--combat
// (контракт memory/000199-combat-info-block.md D6: базовые правила
// .combat-state/.combat-hpbar*/.combat-actions button переиспользуют
// подземелье/NPC/города — контракт 000124, правок НЕТ). Краснота —
// осмысленная: правил .combat-mpbar*/.combat-actcount в index.html
// ещё нет (cssRule — assert «правило не найдено»).

test('index.html: 000199 — MP-полоска и счётчики действий: новые правила в скоупе .combat-overlay--combat; база .combat-hpbar/.combat-state НЕ ИЗМЕНЕНА (CU199-CSS-MPBAR)', () => {
  // MP-полоска — зеркало .combat-hpbar (16px); дорожка #12262e —
  // пара .turn-token--hero («новых цветов не вводим», паттерн 000038).
  const track = cssRule('.combat-overlay--combat .combat-mpbar');
  assert.equal(track['height'], '16px',
    '000199: .combat-mpbar — 16px (зеркало HP-полоски), '
    + 'факт: ' + track['height']);
  assert.equal(track['background'], '#12262e',
    '000199: дорожка — #12262e (пара .turn-token--hero), '
    + 'факт: ' + track['background']);
  // Fill — ФИКСИРОВАННЫЙ #8cf2fc (пороговой функции для маны НЕ
  // вводится — D5).
  const fill = cssRule('.combat-overlay--combat .combat-mpbar-fill');
  assert.equal(fill['background'], '#8cf2fc',
    '000199: fill — #8cf2fc (фиксированный), '
    + 'факт: ' + fill['background']);
  // Бейдж счётчика — absolute top-right кнопки, #ffe27a
  // (highlight .turn-token--current).
  const badge = cssRule('.combat-overlay--combat .combat-actcount');
  assert.equal(badge['position'], 'absolute',
    '000199: .combat-actcount — absolute (top-right кнопки), '
    + 'факт: ' + badge['position']);
  assert.equal(badge['color'], '#ffe27a',
    '000199: цвет бейджа — #ffe27a (highlight), '
    + 'факт: ' + badge['color']);
  // СТРАЖИ: базовые правила (общие с подземельем/NPC/городами —
  // контракт 000124) НЕ ИЗМЕНЕНЫ.
  const hp = cssRule('.combat-hpbar');
  assert.equal(hp['height'], '16px',
    'стража: база .combat-hpbar — 16px');
  assert.equal(hp['background'], '#3a0d0d',
    'стража: дорожка .combat-hpbar — #3a0d0d');
  const st = cssRule('.combat-state');
  assert.equal(st['white-space'], 'pre-line',
    'стража: .combat-state — white-space: pre-line (фикс. высота '
    + 'по 2 строкам)');
});

test('index.html: 000196 — .combat-spellbook — оверлей поверх экрана боя: зеркало формулы canvas (row), фон баннера, pointer-events none (контейнер) / auto (строки) (CU196-CSS-OVERLAY)', () => {
  const cv = cssRule('.combat-overlay--combat .combat-box canvas');
  const bn = cssRule('.combat-banner');
  const sb = cssRule('.combat-overlay--combat .combat-spellbook');
  assert.equal(sb['position'], 'absolute',
    '000196: книга — absolute в .combat-box (краснота: секция панели без '
    + 'position): факт: ' + sb['position']);
  assert.equal(sb['top'], '50%',
    '000196: центрирование в .combat-box (центр box ≡ центр canvas); '
    + 'факт: ' + sb['top']);
  assert.equal(sb['left'], '50%',
    '000196: центрирование: факт: ' + sb['left']);
  assert.equal(sb['transform'], 'translate(-50%, -50%)',
    '000196: баннерный transform центрирования; факт: ' + sb['transform']);
  assert.equal(sb['box-sizing'], 'border-box',
    '000196: box-sizing border-box (padding внутри размера поля); '
    + 'факт: ' + sb['box-sizing']);
  assert.equal(sb['width'], cv['width'],
    '000196: ширина — зеркало формулы canvas (row), 1:1 с полем; '
    + 'факт: ' + sb['width']);
  assert.equal(sb['height'], cv['width'],
    '000196: высота — квадрат, та же формула; факт: ' + sb['height']);
  assert.equal(sb['overflow-y'], 'auto',
    '000196: overflow-y auto (длинная книга скроллится); факт: '
    + sb['overflow-y']);
  assert.equal(sb['background'], bn['background'],
    '000196: фон = фон .combat-banner (существующий цвет, новых не '
    + 'вводим); факт: ' + sb['background']);
  assert.equal(sb['background'], 'rgba(10, 12, 16, 0.85)',
    '000196: фон rgba(10, 12, 16, 0.85) (поле и маркеры читаются '
    + 'сквозь открытую книгу); факт: ' + sb['background']);
  assert.equal(sb['pointer-events'], 'none',
    '000196: контейнер — pointer-events none (клики мимо строк проходят '
    + 'в canvas — выбор цели воскрешения при открытой книге); '
    + 'факт: ' + sb['pointer-events']);
  const rowRule = cssRule(
    '.combat-overlay--combat .combat-spellbook .combat-spellrow');
  assert.equal(rowRule['pointer-events'], 'auto',
    '000196: строки — pointer-events auto (клик-каст по строке сохранён); '
    + 'факт: ' + rowRule['pointer-events']);
});

test('index.html: 000196 — старая секционная геометрия книги убрана: в правиле НЕТ flex/max-height/margin/min-height (CU196-CSS-NOCAP)', () => {
  const d = cssRule('.combat-overlay--combat .combat-spellbook');
  assert.ok(!('flex' in d),
    '000196: в правиле нет flex (секционная flex: 0 1 auto убрана — '
    + 'замена, не заплатка): факт: ' + d['flex']);
  assert.ok(!('max-height' in d),
    '000196: в правиле нет max-height (кап 40% сжимал секцию): факт: '
    + d['max-height']);
  assert.ok(!('margin' in d),
    '000196: в правиле нет margin (секционный margin: 4px 0): факт: '
    + d['margin']);
  assert.ok(!('min-height' in d),
    '000196: в правиле нет min-height (секционный min-height: 0): факт: '
    + d['min-height']);
});

test('index.html: 000196 — portrait: .combat-spellbook — зеркало формулы canvas (portrait), квадрат (CU196-CSS-PORTRAIT)', () => {
  const pcv = portraitRule('.combat-overlay--combat .combat-box canvas');
  const psb = portraitRule('.combat-overlay--combat .combat-spellbook');
  assert.equal(psb['width'], pcv['width'],
    '000196: portrait — ширина книги = ширине canvas (portrait); '
    + 'факт: ' + psb['width']);
  assert.equal(psb['height'], pcv['width'],
    '000196: portrait — книга квадратная, та же формула; факт: '
    + psb['height']);
});

// --- 000210: подтверждение побега (диалог .combat-flee-confirm) ---
//
// Контракт — memory/000210-flee-confirm.md §2.2/§4.2 (Д9): контейнер
// — зеркало формулы canvas (row И portrait), absolute-центр в
// .combat-box, фон баннера, pointer-events в правиле НЕТ (auto —
// модал-подложка ест клики по canvas; противоположно pass-through
// книги 000196); кнопки — палитра start-window (000138): «да» =
// #d9483b/#fff (hover #e65f52, .start-window-btn--restart), «нет» =
// #6fdc6f/#101418 (hover #8bf58b, .start-window-btn--continue).
// vm не применяет CSS — ТЗ-цвета «красная/зелёная» закреплены ТОЛЬКО
// здесь (статика). Краснота — осмысленная: правил в index.html нет
// (cssRule/portraitRule — assert «правило не найдено»).

test('index.html: 000210 — .combat-flee-confirm — зеркало формулы canvas (row), absolute-центр, фон баннера, БЕЗ pointer-events (модал-подложка) (CU210-CSS-OVERLAY)', () => {
  const cv = cssRule('.combat-overlay--combat .combat-box canvas');
  const bn = cssRule('.combat-banner');
  const fc = cssRule('.combat-overlay--combat .combat-flee-confirm');
  assert.equal(fc['position'], 'absolute',
    '000210: контейнер — absolute в .combat-box (центр box ≡ центр '
    + 'canvas); факт: ' + fc['position']);
  assert.equal(fc['top'], '50%', '000210: центрирование; факт: ' + fc['top']);
  assert.equal(fc['left'], '50%', '000210: центрирование; факт: ' + fc['left']);
  assert.equal(fc['transform'], 'translate(-50%, -50%)',
    '000210: баннерный transform; факт: ' + fc['transform']);
  assert.equal(fc['box-sizing'], 'border-box',
    '000210: box-sizing; факт: ' + fc['box-sizing']);
  assert.equal(fc['width'], cv['width'],
    '000210: ширина — зеркало формулы canvas (row), 1:1 с полем; '
    + 'факт: ' + fc['width']);
  assert.equal(fc['height'], cv['width'],
    '000210: высота — квадрат, та же формула; факт: ' + fc['height']);
  assert.equal(fc['display'], 'flex',
    '000210: flex-column-center; факт: ' + fc['display']);
  assert.equal(fc['flex-direction'], 'column',
    '000210: flex-direction; факт: ' + fc['flex-direction']);
  assert.equal(fc['align-items'], 'center',
    '000210: align-items; факт: ' + fc['align-items']);
  assert.equal(fc['justify-content'], 'center',
    '000210: justify-content; факт: ' + fc['justify-content']);
  assert.equal(fc['gap'], '18px',
    '000210: вопрос → ответ 18px (1:1 .start-window-confirm); '
    + 'факт: ' + fc['gap']);
  assert.equal(fc['background'], bn['background'],
    '000210: фон = фон .combat-banner (существующий цвет, новых не '
    + 'вводим); факт: ' + fc['background']);
  assert.equal(fc['background'], 'rgba(10, 12, 16, 0.85)',
    '000210: фон rgba(10, 12, 16, 0.85); факт: ' + fc['background']);
  assert.equal(fc['border-radius'], '8px',
    '000210: radius 8px (баннер/книга); факт: ' + fc['border-radius']);
  assert.ok(!('pointer-events' in fc),
    '000210: в правиле НЕТ pointer-events — auto (модал-подложка ест '
    + 'клики по canvas и строки открытой книги; отличие от pass-'
    + 'through книги 000196): факт: ' + fc['pointer-events']);
});

test('index.html: 000210 — «да» — красная, «нет» — зелёная (палитра start-window 000138), геометрия кнопок, вопрос #e8dcc0 (CU210-CSS-BTN)', () => {
  const yes = cssRule('.combat-overlay--combat .combat-flee-btn--yes');
  const yesH = cssRule('.combat-overlay--combat .combat-flee-btn--yes:hover');
  const no = cssRule('.combat-overlay--combat .combat-flee-btn--no');
  const noH = cssRule('.combat-overlay--combat .combat-flee-btn--no:hover');
  assert.equal(yes['background'], '#d9483b',
    '000210: «да» — красная #d9483b (.start-window-btn--restart); '
    + 'факт: ' + yes['background']);
  assert.equal(yes['color'], '#fff',
    '000210: «да» — текст #fff; факт: ' + yes['color']);
  assert.equal(yesH['background'], '#e65f52',
    '000210: «да» hover #e65f52; факт: ' + yesH['background']);
  assert.equal(no['background'], '#6fdc6f',
    '000210: «нет» — зелёная #6fdc6f (.start-window-btn--continue); '
    + 'факт: ' + no['background']);
  assert.equal(no['color'], '#101418',
    '000210: «нет» — текст #101418; факт: ' + no['color']);
  assert.equal(noH['background'], '#8bf58b',
    '000210: «нет» hover #8bf58b; факт: ' + noH['background']);
  const btn = cssRule('.combat-overlay--combat .combat-flee-btn');
  assert.equal(btn['border'], '1px solid #6b6248',
    '000210: рамка .start-window-btn; факт: ' + btn['border']);
  assert.equal(btn['border-radius'], '10px',
    '000210: radius 10px; факт: ' + btn['border-radius']);
  assert.equal(btn['padding'], '12px 28px',
    '000210: padding .start-window-btn; факт: ' + btn['padding']);
  assert.equal(btn['cursor'], 'pointer',
    '000210: cursor; факт: ' + btn['cursor']);
  const fontOf = (d) => d['font']
    || [d['font-weight'], d['font-size'], d['font-family']]
      .filter(Boolean).join(' ');
  assert.ok(String(btn['font'] || '').includes('ui-monospace'),
    '000210: font кнопок ui-monospace (.start-window-btn); факт: '
    + btn['font']);
  assert.match(fontOf(btn), /16px/,
    '000210: font кнопок 16px; факт: ' + fontOf(btn));
  const q = cssRule('.combat-overlay--combat .combat-flee-question');
  assert.equal(q['color'], '#e8dcc0',
    '000210: текст вопроса #e8dcc0 (текст .combat-overlay); факт: '
    + q['color']);
  assert.ok(String(q['font'] || '').includes('ui-monospace'),
    '000210: font вопроса ui-monospace; факт: ' + q['font']);
  assert.match(fontOf(q), /700/,
    '000210: weight вопроса 700; факт: ' + fontOf(q));
  assert.match(fontOf(q), /18px/,
    '000210: font вопроса 18px; факт: ' + fontOf(q));
  const ans = cssRule('.combat-overlay--combat .combat-flee-ans');
  assert.equal(ans['display'], 'flex',
    '000210: ответ — flex; факт: ' + ans['display']);
  assert.equal(ans['gap'], '24px',
    '000210: между кнопками 24px (1:1 .start-window-ans); факт: '
    + ans['gap']);
});

test('index.html: 000210 — portrait: .combat-flee-confirm — зеркало формулы canvas (portrait), квадрат (CU210-CSS-PORTRAIT)', () => {
  const pcv = portraitRule('.combat-overlay--combat .combat-box canvas');
  const pfc = portraitRule('.combat-overlay--combat .combat-flee-confirm');
  assert.equal(pfc['width'], pcv['width'],
    '000210: portrait — ширина диалога = ширине canvas (portrait); '
    + 'факт: ' + pfc['width']);
  assert.equal(pfc['height'], pcv['width'],
    '000210: portrait — диалог квадратный, та же формула; факт: '
    + pfc['height']);
});

// --- 000237: лента лута победы (.combat-victory-loot) ---
//
// Контракт — memory/000237-victory-loot-icons.md §2.3 (решение D5):
// absolute-лента ПОД центрированным баннером (victory — 2 строки
// 22px ≈53px → верх ленты на 28px ниже центра), wrap-граница =
// формула canvas (конвенция 000124/000196/000210 — каждый
// absolute-элемент боя зеркалит геометрию canvas), pointer-events
// none (клик проходит в баннер → finish), без фона/цветов (фон
// баннера за узлом; текст наследует базу .combat-overlay).
// Краснота — осмысленная: правил в index.html нет (cssRule/
// portraitRule — assert «правило не найдено»).

test('index.html: 000237 — .combat-victory-loot — absolute под центрированным баннером (+28px), flex-лента = формуле canvas, pointer-events: none; portrait — зеркало формулы canvas; 000261: столбик, влево, 22px, цвет текста по редкости (237-CSS)', () => {
  const d = cssRule('.combat-overlay--combat .combat-victory-loot');
  assert.equal(d['position'], 'absolute',
    '000237: лента лута — absolute (in-flow сдвинул бы центр '
    + '.combat-box — контракт 000124); факт: ' + d['position']);
  assert.equal(d['top'], '50%',
    '000237: центрирование в .combat-box; факт: ' + d['top']);
  assert.equal(d['left'], '50%',
    '000237: центрирование; факт: ' + d['left']);
  assert.equal(d['transform'], 'translate(-50%, calc(50% + 28px))',
    '000237: верх ленты на 28px НИЖЕ центра (victory-баннер — 2 '
    + 'строки ≈53px); факт: ' + d['transform']);
  assert.equal(d['width'], 'min(100vh - 32px, 100vw - 304px)',
    '000237: wrap-граница = формула canvas (конвенция 000124/000196/'
    + '000210); факт: ' + d['width']);
  assert.equal(d['display'], 'flex',
    '000237: строки-чипы [иконка 22px + имя] — flex-лента; факт: '
    + d['display']);
  assert.equal(d['flex-wrap'], 'wrap',
    '000237: перенос строк под текст баннера; факт: ' + d['flex-wrap']);
  assert.equal(d['justify-content'], 'center',
    '000237: лента центрирована; факт: ' + d['justify-content']);
  assert.equal(d['pointer-events'], 'none',
    '000237: pointer-events none — клик проходит в баннер (finish); '
    + 'факт: ' + d['pointer-events']);
  const p = portraitRule('.combat-overlay--combat .combat-victory-loot');
  assert.equal(p['width'], 'min(100vw - 16px, 100vh - 16px - 520px)',
    '000237: portrait — зеркало формулы canvas (portrait); факт: '
    + p['width']);
});

// --- 000246: кнопки — в самый низ панели (ревью 2026-10-23) ---
//
// .combat-actions — последний ребёнок .combat-side (пин
// 000246-ACT-LAST, tests/ui.test.js): базовый margin-bottom 10px
// (общее правило .combat-actions, 000124) остался бы ПОД кнопками:
// 10px + padding панели 12px = 22px пустоты до низа при 12px
// прочих краях. ТЗ — «кнопки в САМЫЙ НИЗ»: скоуп-правило обнуляет
// margin-bottom ТОЛЬКО в .combat-overlay--combat (база — контракт
// 000124, не трогаем — стража на месте).

test('index.html: .combat-overlay--combat .combat-actions — margin-bottom: 0 (кнопки впритык к низу панели, 12px = padding панели); стража: база .combat-actions не переписана (000246)', () => {
  const decls = cssRule('.combat-overlay--combat .combat-actions');
  assert.equal(decls['margin-bottom'], '0',
    '000246: .combat-actions — последний ребёнок .combat-side: '
    + 'базовый margin-bottom 10px (000124) дал бы 22px пустоты до '
    + 'низа панели (10 + padding 12) при 12px прочих краях — ТЗ '
    + '«кнопки в САМЫЙ НИЗ»; обнуление — только в боевом скоупе; '
    + 'факт: ' + decls['margin-bottom']);
  const base = cssRule('.combat-actions');
  assert.equal(base['margin-bottom'], '10px',
    'стража: база .combat-actions — margin-bottom 10px (общее '
    + 'правило, контракт 000124 — НЕ переписано); факт: '
    + base['margin-bottom']);
});

// Заделка хвостов ретро 2026-10-23 (000246, findings б/в/г):
// декларации ТЗ 000246 п.1, которые до 000254 не читал ни один
// тест. НОЛЬ CSS-диффа: все четыре декларации уже соответствуют
// контракту (сверка — memory/000254-combat-layout-pins.md), поэтому
// пины зелёные с первого запуска; краснота процессная — future-правка
// CSS без ре-пина пройдёт зелёной, эти пины её ловят.

test('index.html: .combat-log — «внутренний скролл» overflow-y: auto (000254-LOG-SCROLL)', () => {
  const d = cssRule('.combat-log');
  assert.equal(d['overflow-y'], 'auto',
    '000246 п.1: лог — «внутренний скролл» (overflow-y: auto); по '
    + 'flexbox-специации overflow ≠ visible → автоматический '
    + 'min-size 0 — без него скоуп-лог не сжался бы до остатка, а '
    + 'вытолкнул бы панель с кнопками вниз; факт: '
    + d['overflow-y']);
});

test('index.html: .combat-actions (база) и боевой скоуп — фиксированный блок: нет flex-grow и нет flex (000254-ACTIONS-FIXED)', () => {
  const base = cssRule('.combat-actions');
  assert.ok(!('flex-grow' in base) && !('flex' in base),
    '000246 п.1: .combat-actions — фиксированный блок, не '
    + 'растягивается: запинается ОТСУТСТВИЕ (и шорткат flex — '
    + 'future-правка flex: 1 1 auto обошла бы пин только на '
    + 'лонгхэнде); факт: ' + JSON.stringify(base));
  const scoped = cssRule('.combat-overlay--combat .combat-actions');
  assert.ok(!('flex-grow' in scoped) && !('flex' in scoped),
    '000246 п.1: боевой скоуп — тоже без растяжения (правило '
    + 'обнуляет только margin-bottom); факт: '
    + JSON.stringify(scoped));
});

test('index.html: .combat-overlay--combat .combat-log — min-height: 0 (000254-LOG-MINHEIGHT)', () => {
  const d = cssRule('.combat-overlay--combat .combat-log');
  assert.equal(d['min-height'], '0',
    '000246 п.1: min-height: 0 в скоупе — лог сжимается до '
    + 'остатка (текст пина 000246-LOG-FLEX и portrait-пина '
    + 'ссылаются на декларацию — до 000254 без ассерта); факт: '
    + d['min-height']);
});

// --- 000261: лут на экране победы — столбик, влево, 22px, цвет ---
//
// Контракт — memory/000261-victory-loot-style.md: D2 (три декларации
// в базовом правиле: column / flex-start / 22px), D7 (6 color-правил
// в скоупе узла лута — 5 hex рамок :108-112 + фолбэк #e8dcc0), D6
// (border: 0 — рамка на строках лута отключена, глобальные правила
// рамок 000230.07 НЕ трогаются). Краснота — осмысленная: декларации
// отсутствуют (undefined) / правил нет (cssRule — assert «правило не
// найдено»).

test('index.html: 000261 — .combat-victory-loot — font-size 22px (линия .combat-banner), align-items: flex-start (выравнивание влево) (261-CSS)', () => {
  const d = cssRule('.combat-overlay--combat .combat-victory-loot');
  assert.equal(d['font-size'], '22px',
    '000261: шрифт лута — 22px, «как у золота/опыта»; факт: '
    + d['font-size']);
  assert.equal(d['font-size'], cssRule('.combat-banner')['font-size'],
    '000261: font-size = линии .combat-banner (кросс-пин); факт: '
    + d['font-size']);
  assert.equal(d['align-items'], 'flex-start',
    '000261: выравнивание строк — ВЛЕВО (столбик от левого края); '
    + 'факт: ' + d['align-items']);
});

test('index.html: 000261 — .combat-victory-loot — flex-direction: column (одна строка предмета на строку — структурный пин «в столбик») (261-CSS-COL)', () => {
  const d = cssRule('.combat-overlay--combat .combat-victory-loot');
  assert.equal(d['flex-direction'], 'column',
    '000261: лут — в столбик (column); факт: ' + d['flex-direction']);
});

test('index.html: 000261 — .combat-victory-loot .cp-rarity-… — цвет ТЕКСТА = 5 hex рамок + фолбэк #e8dcc0; border: 0 на строках лута (261-CSS-RAR)', () => {
  const rarities = {
    common: '#a39b8b',
    rare: '#58a858',
    epic: '#5b8fd4',
    legendary: '#9b6bd4',
    impossible: '#e0952f',
    none: '#e8dcc0',
  };
  for (const [r, hex] of Object.entries(rarities)) {
    const rule = cssRule('.combat-victory-loot .cp-rarity-' + r);
    assert.equal(rule['color'], hex,
      '000261: цвет текста редкости «' + r + '» = hex рамки 000230.07; '
      + 'факт: ' + rule['color']);
  }
  const row = cssRule('.combat-victory-loot .cp-itemrow');
  assert.equal(row['border'], '0',
    '000261: рамка на строках лута ОТКЛЮЧЕНА (ТЗ — только цвет текста; '
    + 'глобальные cp-rarity-рамки :108-112 не трогаются); факт: '
    + row['border']);
  const borderZeroAt = html.indexOf('.combat-victory-loot .cp-itemrow {');
  const globalBorderAt = html.indexOf('.cp-itemrow.cp-rarity-common {');
  assert.ok(borderZeroAt > globalBorderAt,
    '000261: порядок — border: 0 ПОЗЖЕ глобальных рамок cp-rarity-* '
    + ':108-112 (специфичности равны (0,2,0) — выигрывает позднее; '
    + 'перенос блока выше = тихий возврат рамок при зелёном пине); '
    + 'факт: border-0 @' + borderZeroAt + ', глобальная рамка @'
    + globalBorderAt);
});
