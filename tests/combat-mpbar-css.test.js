const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function withoutCssComments(t) {
  let out = '';
  let i = 0;
  while (i < t.length) {
    if (t.startsWith('/*', i)) {
      const close = t.indexOf('*/', i + 2);
      i = close < 0 ? t.length : close + 2;
    } else {
      out += t[i];
      i += 1;
    }
  }
  return out;
}

function styleBody() {
  const start = html.indexOf('<style>');
  const end = html.indexOf('</style>');
  assert.ok(start >= 0 && end > start, '<style> блок найден в index.html');
  const css = html.slice(start + '<style>'.length, end);
  const after = html.slice(end + '</style>'.length);
  const extraStyleTags =
    (withoutCssComments(css).match(/<style>/g) || []).length +
    (after.match(/<style>/g) || []).length;
  assert.equal(extraStyleTags, 0,
    'в index.html есть реальные <style>-блоки помимо первого — хелпер '
    + 'смотрит только первый и тихо теряет покрытие (000201)');
  return {
    css,
    baseLine: html.slice(0, start).split('\n').length,
  };
}

const UNIVERSAL_STAR = /(^|[\s>+~(,])\*(?=[\s>+~.,:)]|$)/g;

function preludeViolations(prelude) {
  const reasons = [];
  if (prelude.includes('*/')) reasons.push("содержит терминатор комментария '*/'");
  for (const part of prelude.split(',')) {
    const t = part.trim();
    if (!t.includes('*')) continue;
    const legalStarsRemoved = t
      .replace(/\*=/g, '')
      .replace(UNIVERSAL_STAR, '$1');
    if (legalStarsRemoved.includes('*')) {
      reasons.push("содержит несамостоятельное '*'");
    }
  }
  return reasons;
}

function cssRulesCommentAware() {
  const { css, baseLine } = styleBody();
  const n = css.length;
  const lineAt = j => baseLine + css.slice(0, j).split('\n').length - 1;
  const kept = [];
  const dropped = [];

  const skipWsComments = (i, limit) => {
    while (i < limit) {
      const c = css[i];
      if (/[ \t\n\r\f]/.test(c)) { i += 1; continue; }
      if (css.startsWith('/*', i)) {
        const close = css.indexOf('*/', i + 2);
        i = close < 0 ? limit : close + 2;
        continue;
      }
      if (css.startsWith('<!--', i)) { i += 4; continue; }
      if (css.startsWith('-->', i)) { i += 3; continue; }
      break;
    }
    return i;
  };

  const closeBrace = (open, limit) => {
    let depth = 1;
    let k = open + 1;
    while (k < limit && depth > 0) {
      if (css.startsWith('/*', k)) {
        const close = css.indexOf('*/', k + 2);
        k = close < 0 ? limit : close + 2;
        continue;
      }
      if (css[k] === '{') depth += 1;
      else if (css[k] === '}') depth -= 1;
      k += 1;
    }
    return k;
  };

  const declsOf = block => {
    const decls = {};
    for (const part of block.replace(/\/\*(?:[^*]|\*(?!\/))*\*\//g, ' ').split(';')) {
      const i = part.indexOf(':');
      if (i < 0) continue;
      const prop = part.slice(0, i).trim().toLowerCase();
      if (prop) decls[prop] = part.slice(i + 1).trim();
    }
    return decls;
  };

  const preludeBroken = prelude => preludeViolations(prelude).length > 0;

  const walk = (start, limit) => {
    let i = start;
    for (;;) {
      i = skipWsComments(i, limit);
      if (i >= limit) return;
      const c = css[i];
      if (c === '}') { i += 1; continue; }
      if (c === '<') {
        const gt = css.indexOf('>', i);
        i = gt < 0 ? limit : gt + 1;
        continue;
      }
      let k = i;
      let prelude = '';
      let atOpen = -1;
      while (k < limit) {
        if (css.startsWith('/*', k)) {
          const close = css.indexOf('*/', k + 2);
          if (close < 0) { k = limit; break; }
          k = close + 2;
          continue;
        }
        const ch = css[k];
        if (ch === '{') { atOpen = k; break; }
        if (ch === '}') break;
        prelude += ch;
        k += 1;
      }
      if (atOpen < 0) { i = k < limit ? k + 1 : limit; continue; }
      const end = closeBrace(atOpen, limit);
      const bodyStart = atOpen + 1;
      const bodyEnd = Math.max(bodyStart, end - 1);
      const rec = {
        line: lineAt(i),
        prelude: prelude.replace(/\s+/g, ' ').trim(),
        at: c === '@',
        decls: declsOf(css.slice(bodyStart, bodyEnd)),
      };
      if (rec.at) {
        kept.push(rec);
        walk(bodyStart, bodyEnd);
        i = end;
        continue;
      }
      (preludeBroken(rec.prelude) ? dropped : kept).push(rec);
      i = end;
    }
  };

  walk(0, n);
  return { kept, dropped };
}

test('index.html: 000201 — правило дорожки MP-полоски переживает реальный парсинг CSS (CU201-CSS-TRACK)', () => {
  const rules = cssRulesCommentAware();
  const track = rules.kept.find(r => !r.at && r.prelude === '.combat-overlay--combat .combat-mpbar');
  assert.ok(track,
    'правило .combat-overlay--combat .combat-mpbar с чистым селектором не найдено '
    + 'среди переживших реальный парсинг CSS правил (браузер его сбросил) — '
    + 'проверьте `*/` в комментарии блока MP-полоски (000201); сброшено: '
    + rules.dropped.map(d => 'L' + d.line).join(', '));
  assert.equal(track.decls['position'], 'relative',
    'дорожка MP-полосы — position: relative (зеркало .combat-hpbar), '
    + 'факт: ' + track.decls['position']);
  assert.equal(track.decls['height'], '16px',
    'дорожка MP-полосы — 16px (зеркало .combat-hpbar), '
    + 'факт: ' + track.decls['height']);
  assert.equal(track.decls['margin-bottom'], '10px',
    'дорожка MP-полосы — margin-bottom: 10px (зеркало .combat-hpbar), '
    + 'факт: ' + track.decls['margin-bottom']);
  assert.equal(track.decls['background'], '#12262e',
    'дорожка MP-полосы — #12262e (пара .turn-token--hero), '
    + 'факт: ' + track.decls['background']);
  assert.equal(track.decls['border-radius'], '3px',
    'дорожка MP-полосы — border-radius: 3px (зеркало .combat-hpbar), '
    + 'факт: ' + track.decls['border-radius']);
  assert.equal(track.decls['overflow'], 'hidden',
    'дорожка MP-полосы — overflow: hidden (зеркало .combat-hpbar), '
    + 'факт: ' + track.decls['overflow']);
});

const MIRROR_PAIRS = [
  ['.combat-overlay--combat .combat-mpbar', '.combat-hpbar',
    { background: ['#12262e', '#3a0d0d'] }],
  ['.combat-overlay--combat .combat-mpbar-fill', '.combat-hpbar-fill',
    { background: ['#8cf2fc', '#6fdc6f'] }],
  ['.combat-overlay--combat .combat-mpbar-text', '.combat-hpbar-text', {}],
];

test('index.html: 000201 — MP-полоска выглядит аналогично HP-полоске: 1-в-1 зеркало деклараций (CU201-CSS-MIRROR)', () => {
  const rules = cssRulesCommentAware();
  const found = sel => rules.kept.find(r => !r.at && r.prelude === sel);
  for (const [mpSel, hpSel, colorAllow] of MIRROR_PAIRS) {
    const mp = found(mpSel);
    const hp = found(hpSel);
    assert.ok(mp,
      'правило ' + mpSel + ' не найдено среди переживших реальный парсинг CSS '
      + 'правил — проверьте `*/` в комментарии блока MP-полоски (000201)');
    assert.ok(hp, 'правило ' + hpSel + ' не найдено среди переживших парсинг правил');
    const keys = new Set([...Object.keys(mp.decls), ...Object.keys(hp.decls)]);
    const diffs = [];
    for (const k of keys) {
      const a = mp.decls[k];
      const b = hp.decls[k];
      if (a === b) continue;
      if (colorAllow[k] && a === colorAllow[k][0] && b === colorAllow[k][1]) continue;
      diffs.push(k + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
    }
    assert.equal(diffs.length, 0,
      'пара ' + mpSel + ' / ' + hpSel + ' — не 1-в-1 зеркало (допускается '
      + 'только различие цветов дорожки/fill): ' + diffs.join('; '));
  }
});

test('index.html: 000201 — утечка комментария в селектор любого правила <style> невозможна (CU201-CSS-SELECTORS)', () => {
  const rules = cssRulesCommentAware();
  const total = rules.kept.length + rules.dropped.length;
  assert.ok(total > 0,
    'comment-aware парсер не извлёк ни одного правила из <style> — парсер сломан (000201)');
  const violations = [];
  for (const r of [...rules.kept, ...rules.dropped]) {
    if (r.at) continue;
    const reasons = preludeViolations(r.prelude);
    if (reasons.length) {
      violations.push('L' + r.line + ' ' + JSON.stringify(r.prelude.slice(0, 80))
        + ' — ' + reasons.join(', '));
    }
  }
  assert.equal(violations.length, 0,
    'утечка комментария в селектор (css-syntax-1: комментарий закрывается '
    + 'на ПЕРВОМ */, хвост склеивается с prelude следующего правила и '
    + 'правило отбрасывается браузером). Фиксируются терминатор '
    + "'*/' в prelude и несамостоятельное '*' (допущены universal-селектор "
    + "`*` в сложном селекторе, `:not(*)`/`:is(*)`/`:has(*)` и "
    + "[attr*=…]): " + violations.join(' | '));
});
