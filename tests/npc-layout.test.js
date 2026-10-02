// Задача 000125: диалог NPC на весь экран — статические тесты
// layout (CSS index.html + src/ui.js).
//
// Паттерн — статический разбор <style> index.html (как
// tests/combat-layout.test.js и cssRule в tests/ui-panel.test.js):
// CSS-текст и текст ui.js — источник правды, браузер/vm не нужны.
// ВМ-часть контракта (класс панели .npc-panel, состав, оверлей
// .npc-overlay) — секция 000125 в tests/ui-panel.test.js.
//
// Контракт — memory/000125-npc-fullscreen.md:
//  * .npc-panel — весь экран (100%×100% относительно fixed inset:0
//    оверлея) + flex-колонка; сама панель НЕ скроллится (скролл —
//    только тело и лог).
//  * Тело (.cp-items в npc-скоупе) — flex: 1, min-height: 0,
//    overflow-y: auto — всё среднее место, основной скролл.
//  * Лог (.npc-log) — фиксированная зона внизу: max-height 20…40vh
//    (коридор ТЗ ~25…35vh) + свой скролл; старый потолок 140px УБРАН.
//  * Колонка контента (вкладки/тело/лог в npc-скоупе) — max-width
//    640…720px + центрирование (margin auto / flex-center); фон
//    панели — весь экран.
//  * Строка вкладок (.cp-itemrow в npc-скоупе) — flex-wrap: wrap
//    (5 подписей зафиксированы тестами npc-hire — влезание при
//    320px через wrap).
//  * Старые правила `.npc-overlay .combat-side { max-height: 84vh }`
//    и `.npc-log { max-height: 140px }` — УБРАНЫ (ТЗ п. 3).
//  * src/ui.js: npcBuild строит панель `el('div', 'npc-panel')`;
//    `el('div', 'combat-side')` в ui.js отсутствует (декэплинг).
//  * Остальные оверлеи НЕ ТРОГАЮТСЯ (стража G2): .dungeon-overlay
//    .combat-side (270px/absolute, 000066), база .combat-side (320px),
//    скоуп боя .combat-overlay--combat .combat-side (256px, 000124),
//    общие базы .cp-title/.cp-itemrow/.cp-items.
//
// Разбор ВСЕХ правил <style> (в отличие от cssRule — первое вхождение
// с точным селектором): правила 000125 — в npc-скоупе
// (селектор содержит .npc-panel/.npc-overlay), и часть — топ-
// уровнем (.npc-log). @media-блок 000124 даёт «мусорный» матч
// (селектор — «media (max-width: …) …») — не содержит 'npc'/'cp-
// items' и фильтрами отбрасывается. Комментарии CSS сняты ДО
// разбора (скобка в комментарии иначе режет правило).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const uiSrc = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');

const style = (() => {
  const m = html.match(/<style[^>]*>([\s\S]*?)<\/style>/);
  assert.ok(m, '<style>-блок найден в index.html');
  return m[1].replace(/\/\*[\s\S]*?\*\//g, ' ');
})();

function parseDecls(block) {
  const decls = {};
  for (const part of block.split(';')) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const prop = part.slice(0, i).trim().toLowerCase();
    if (prop) decls[prop] = part.slice(i + 1).trim();
  }
  return decls;
}

// ВСЕ правила: [{ selector, decls }]; мульти-селектор — по записи
// на каждый селектор (общий набор деклараций).
const RULES = (() => {
  const out = [];
  for (const m of style.matchAll(/([^{}@]+)\{([^}]*)\}/g)) {
    for (const selRaw of m[1].split(',')) {
      const sel = selRaw.trim();
      if (!sel) continue;
      out.push({ selector: sel, decls: parseDecls(m[2]) });
    }
  }
  return out;
})();

// Правило с ТОЧНЫМ селектором.
function ruleExact(selector) {
  const r = RULES.find((x) => x.selector === selector);
  assert.ok(r, 'CSS-правило ' + selector + ' { … } найдено в index.html');
  return r.decls;
}

// Правила, чей селектор содержит ВСЕ needles (npc-скоуп).
function rulesScoped(...needles) {
  return RULES.filter((r) => needles.every((n) => r.selector.includes(n)));
}

// --- КРАСНЫЕ: CSS полноэкранного диалога (TЗ «Что сделать» п. 3) ---

test('000125 RED: .npc-panel — весь экран (100%×100% или inset:0) + flex-колонка, без скролла самой панели', () => {
  const d = ruleExact('.npc-panel');
  const full = (d['width'] === '100%' && d['height'] === '100%')
    || d['inset'] === '0';
  assert.ok(full,
    '.npc-panel — весь вьюпорт (width/height: 100% относительно '
    + 'fixed inset:0 оверлея, либо inset: 0); факт: width: '
    + d['width'] + '; height: ' + d['height'] + '; inset: ' + d['inset']);
  assert.equal(d['display'], 'flex',
    'flex-контейнер: display: flex (колонка заголовок/вкладки/тело/лог)');
  assert.equal(d['flex-direction'], 'column',
    'flex-direction: column (стек сверху вниз)');
  assert.ok(!('overflow-y' in d),
    'панель сама НЕ скроллится (overflow-y не задан — скролл только '
    + 'в теле и логе)');
});

test('000125 RED: тело .cp-items в npc-скоупе — flex: 1, min-height: 0, overflow-y: auto', () => {
  const list = rulesScoped('.cp-items')
    .filter((r) => r.selector.includes('npc-panel')
      || r.selector.includes('npc-overlay'));
  assert.ok(list.length >= 1,
    'правило .cp-items в npc-скоупе (селектор содержит .npc-panel/'
    + '.npc-overlay) найдено в index.html');
  const d = list[0].decls;
  assert.ok(d['flex'] && /^\s*1/.test(d['flex']),
    'тело — flex: 1 (всё среднее место); факт: ' + d['flex']);
  assert.equal(d['min-height'], '0',
    'min-height: 0 — flex-тело реально сжимается и скроллится само');
  assert.equal(d['overflow-y'], 'auto',
    'overflow-y: auto — основной скролл диалога в теле');
});

test('000125 RED: лог .npc-log — max-height 20…40vh + overflow-y: auto; 140px убран', () => {
  const list = RULES.filter((r) => r.selector === '.npc-log');
  assert.ok(list.length >= 1, 'правило .npc-log найдено в index.html');
  const facts = list.map((r) => r.decls['max-height']).join(', ');
  assert.ok(list.some((r) => {
    const m = /^(\d+)vh$/.exec(r.decls['max-height'] || '');
    return m && parseInt(m[1], 10) >= 20 && parseInt(m[1], 10) <= 40;
  }), 'среди правил .npc-log — max-height в коридоре 20…40vh '
    + '(ТЗ: ~25…35vh — фиксированная зона внизу); факт: ' + facts);
  assert.ok(list.some((r) => r.decls['overflow-y'] === 'auto'),
    'лог — свой скролл (overflow-y: auto); факт: ' + facts);
  assert.ok(!list.some((r) => r.decls['max-height'] === '140px'),
    'старый потолок .npc-log { max-height: 140px } УБРАН');
});

test('000125 RED: колонка контента — max-width 640…720px + центрирование в npc-скоупе', () => {
  const list = RULES.filter((r) =>
    (r.selector.includes('npc-panel') || r.selector.includes('npc-overlay'))
    && (r.selector.includes('.cp-items') || r.selector.includes('.cp-itemrow')));
  const facts = list.map((r) => r.selector + ' { '
    + JSON.stringify(r.decls) + ' }').join(' | ');
  const ok = list.find((r) => {
    const m = /^(\d+)px$/.exec(r.decls['max-width'] || '');
    const w = m ? parseInt(m[1], 10) : NaN;
    const centered = (r.decls['margin-left'] === 'auto'
      && r.decls['margin-right'] === 'auto')
      || (r.decls['display'] === 'flex'
      && (r.decls['justify-content'] === 'center'
      || r.decls['align-items'] === 'center'));
    return w >= 640 && w <= 720 && centered;
  });
  assert.ok(ok,
    'правило колонки контента (.cp-items/.cp-itemrow в npc-скоупе): '
    + 'max-width 640…720px + центрирование (margin auto / flex-center) '
    + '— читабельность на широких экранах, фон панели весь экран; '
    + 'факт: ' + (facts || 'таких правил нет'));
});

test('000125 RED: строка вкладок .cp-itemrow в npc-скоупе — flex-wrap: wrap (влезает при 320px)', () => {
  const list = rulesScoped('.cp-itemrow')
    .filter((r) => r.selector.includes('npc-panel')
      || r.selector.includes('npc-overlay'));
  assert.ok(list.length >= 1,
    'правило .cp-itemrow в npc-скоупе найдено в index.html');
  const facts = list.map((r) => 'flex-wrap: '
    + (r.decls['flex-wrap'] || '—')).join('; ');
  assert.ok(list.some((r) => r.decls['flex-wrap'] === 'wrap'),
    'строка вкладок — flex-wrap: wrap (5 подписей зафиксированы '
    + 'npc-hire, компактные подписи меняли бы состав — wrap обязан '
    + 'впритык при 320px); факт: ' + facts);
});

test('000125 RED: старые правила УБРАНЫ — .npc-overlay .combat-side (84vh) и .npc-log (140px)', () => {
  assert.doesNotMatch(style, /\.npc-overlay\s+\.combat-side/,
    'правило .npc-overlay .combat-side { max-height: 84vh … } УБРАНО '
    + '(панель диалога — свой .npc-panel, декэплинг от .combat-side)');
  assert.ok(!RULES.some((r) => r.selector === '.npc-log'
      && r.decls['max-height'] === '140px'),
    'правило .npc-log { max-height: 140px … } УБРАНО (лог — зона '
    + 'vh внизу)');
});

test('000125 RED: src/ui.js — npcBuild: el(«div», «npc-panel»); el(«div», «combat-side») отсутствует', () => {
  assert.match(uiSrc, /el\(\s*'div'\s*,\s*'npc-panel'\s*\)/,
    'npcBuild создаёт панель СОБСТВЕННЫМ классом .npc-panel');
  assert.doesNotMatch(uiSrc, /el\(\s*'div'\s*,\s*'combat-side'\s*\)/,
    'в src/ui.js нет el(' + "'div', 'combat-side')"
    + ' — диалог декэплен от боевой боковой панели');
});

// --- ЗЕЛЁНЫЕ с первого запуска: стражи чужих оверлеев и общих .cp-* ---

test('000125: стража — остальные оверлеи не тронуты (подземелье 270px, бой 256px, база 320px, .cp-*)', () => {
  const d = ruleExact('.dungeon-overlay .combat-side');
  assert.equal(d['width'], '270px',
    'мини-панель подземелья — 270px (000066, вне скоупа)');
  assert.equal(d['position'], 'absolute',
    'мини-панель подземелья — плавающая (вне скоупа)');
  assert.equal(ruleExact('.combat-side')['width'], '320px',
    'база .combat-side — 320px (бой/подземелье/постройка — не NPC)');
  assert.equal(ruleExact('.combat-overlay--combat .combat-side')['width'],
    '256px', 'панель боя (скоуп 000124) — 256px');
  assert.equal(ruleExact('.cp-items')['margin-top'], '4px',
    'база .cp-items на месте');
  const row = ruleExact('.cp-itemrow');
  assert.equal(row['display'], 'flex', 'база .cp-itemrow на месте');
  assert.ok(!('flex-wrap' in row),
    'в БАЗОВОЙ .cp-itemrow wrap нет (wrap — только в npc-скоупе)');
  assert.equal(ruleExact('.cp-title')['font-weight'], '700',
    'база .cp-title на месте');
});
