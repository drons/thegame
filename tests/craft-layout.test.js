// Задача 000126: экран крафта — статические тесты layout
// (CSS index.html + src/craft-ui.js).
//
// Паттерн — статический разбор <style> index.html (как
// tests/npc-layout.test.js и tests/combat-layout.test.js):
// CSS-текст и текст craft-ui.js — источник правды, браузер/vm не
// нужны. vm-часть контракта (оверлей .craft-overlay, состав
// панели) — tests/craft-ui.test.js.
//
// Контракт — memory/000126-craft-screen.md §4 +
// memory/000126-craft-ui.md («Структура экрана», «CSS»):
//  * Оверлей несёт ОБА класса `combat-overlay craft-overlay`
//    (база fixed/inset:0/z-20 + маркер-фильтр .combat-overlay).
//  * .craft-panel — весь экран (100%×100% относительно fixed
//    inset:0 оверлея) + flex-колонка; сама панель НЕ скроллится.
//  * Тело (.craft-body) — flex: 1, min-height: 0, overflow-y: auto.
//  * Лог (.craft-log) — фиксированная зона внизу: max-height
//    20…40vh (контракт 30vh) + свой скролл.
//  * Колонка контента (в craft-скоупе) — max-width 640…720px +
//    центрирование (диапазон ТЗ 640…720 — тест пинит диапазон).
//  * src/craft-ui.js: панель строится `el('div', 'craft-panel')`.
//  * Общие .cp-*/.combat-*/чужие оверлеи — НОЛЬ правок (стража G2).
//
// Разбор ВСЕХ правил <style>: правила 000126 — в craft-скоупе
// (селектор содержит .craft-…). Комментарии CSS сняты ДО разбора
// (скобка в комментарии иначе режет правило).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
// src/craft-ui.js — новый файл задачи: в стадии красных тестов ещё
// не создан — читаем лениво (пин CL-6 падает с осмысленным сообщением,
// остальные тесты файла работают).
const craftUiPath = path.join(ROOT, 'src', 'craft-ui.js');
const craftUiSrc = fs.existsSync(craftUiPath)
  ? fs.readFileSync(craftUiPath, 'utf8') : null;

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

// --- КРАСНЫЕ: CSS полноэкранного экрана крафта ---

test('CL-1. .craft-panel — весь экран (100%×100% или inset:0) + flex-колонка, без скролла самой панели', () => {
  const d = ruleExact('.craft-panel');
  const full = (d['width'] === '100%' && d['height'] === '100%')
    || d['inset'] === '0';
  assert.ok(full,
    '.craft-panel — весь вьюпорт (width/height: 100% относительно '
    + 'fixed inset:0 оверлея, либо inset: 0); факт: width: '
    + d['width'] + '; height: ' + d['height'] + '; inset: ' + d['inset']);
  assert.equal(d['display'], 'flex',
    'flex-контейнер: display: flex (колонка заголовок/тело/лог)');
  assert.equal(d['flex-direction'], 'column',
    'flex-direction: column (стек сверху вниз)');
  assert.ok(!('overflow-y' in d),
    'панель сама НЕ скроллится (overflow-y не задан — скролл только '
    + 'в теле и логе)');
});

test('CL-2. .craft-body (тело) — flex: 1, min-height: 0, overflow-y: auto', () => {
  const d = ruleExact('.craft-body');
  assert.ok(d['flex'] && /^\s*1/.test(d['flex']),
    'тело — flex: 1 (всё среднее место); факт: ' + d['flex']);
  assert.equal(d['min-height'], '0',
    'min-height: 0 — flex-тело реально сжимается и скроллится само');
  assert.equal(d['overflow-y'], 'auto',
    'overflow-y: auto — основной скролл экрана в теле');
});

test('CL-3. .craft-log — max-height 20…40vh + overflow-y: auto', () => {
  const d = ruleExact('.craft-log');
  const m = /^(\d+)vh$/.exec(d['max-height'] || '');
  assert.ok(m, '.craft-log — max-height в vh (фиксированная зона '
    + 'внизу); факт: ' + d['max-height']);
  const vh = parseInt(m[1], 10);
  assert.ok(vh >= 20 && vh <= 40,
    '.craft-log max-height в коридоре 20…40vh (контракт 30vh); '
    + 'факт: ' + d['max-height']);
  assert.equal(d['overflow-y'], 'auto',
    'лог — свой скролл (overflow-y: auto)');
});

test('CL-4. .craft-overlay — display: block + непрозрачный фон', () => {
  const d = ruleExact('.craft-overlay');
  assert.equal(d['display'], 'block',
    'display: block — отсечение от flex-center базы .combat-overlay '
    + '(каскад: правило 000126 идёт ПОСЛЕ общих)');
  const bg = d['background'] || d['background-color'] || '';
  assert.ok(bg && bg !== 'transparent' && bg !== 'none',
    'оверлей — непрозрачный фон (экран закрывает мир); факт: '
    + (bg || 'нет'));
});

test('CL-5. колонка контента в craft-скоупе — max-width 640…720px + центрирование', () => {
  // Контракт: контент-колонка (.craft-body/.craft-log в скоупе) —
  // max-width 680px + margin-left/right: auto (диапазон ТЗ
  // 640…720 — тест пинит диапазон).
  const list = RULES.filter((r) =>
    (r.selector.includes('.craft-body') || r.selector.includes('.craft-log')
      || r.selector.includes('.craft-panel'))
    && r.selector.includes('craft'));
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
    'правило колонки контента (craft-скоуп): max-width 640…720px '
    + '+ центрирование (margin auto / flex-center) — читабельность '
    + 'на широких экранах, фон панели весь экран; факт: '
    + (facts || 'таких правил нет'));
});

test('CL-6. src/craft-ui.js — панель строится el(«div», «craft-panel»)', () => {
  assert.ok(craftUiSrc !== null,
    'src/craft-ui.js создан (задача 000126)');
  assert.match(craftUiSrc, /el\(\s*'div'\s*,\s*'craft-panel'\s*\)/,
    'экран строит панель СОБСТВЕННЫМ классом .craft-panel '
    + '(декэплинг от .combat-side/.npc-panel)');
});

// --- ЗЕЛЁНЫЕ с первого запуска: стража чужих оверлеев и общих .cp-* ---

test('G2. стража: общие .cp-*/.combat-* и чужие оверлеи не тронуты', () => {
  // Все правила с «craft» в селекторе — строго в craft-скоупе
  // (в стадии красных тестов таких правил ещё нет — цикл пустой).
  for (const r of RULES) {
    if (r.selector.includes('craft')) {
      assert.ok(r.selector.includes('.craft-')
          || r.selector === '.craft-overlay',
        'правило с «craft» в селекторе — в craft-скоупе; факт: '
        + r.selector);
    }
  }
  // Чужие оверлеи — на месте.
  const d = ruleExact('.dungeon-overlay .combat-side');
  assert.equal(d['width'], '270px',
    'мини-панель подземелья — 270px (000066, вне скоупа)');
  assert.equal(d['position'], 'absolute',
    'мини-панель подземелья — плавающая (вне скоупа)');
  assert.equal(ruleExact('.combat-side')['width'], '320px',
    'база .combat-side — 320px (бой/подземелье/постройка)');
  assert.equal(ruleExact('.combat-overlay--combat .combat-side')['width'],
    '256px', 'панель боя (скоуп 000124) — 256px');
  assert.ok(ruleExact('.npc-panel'), 'панель диалога NPC на месте');
  // Общие .cp-* базы.
  assert.equal(ruleExact('.cp-items')['margin-top'], '4px',
    'база .cp-items на месте');
  const row = ruleExact('.cp-itemrow');
  assert.equal(row['display'], 'flex', 'база .cp-itemrow на месте');
  assert.ok(!('flex-wrap' in row),
    'в БАЗОВОЙ .cp-itemrow wrap нет (wrap — только в npc-скоупе)');
  assert.equal(ruleExact('.cp-title')['font-weight'], '700',
    'база .cp-title на месте');
});
