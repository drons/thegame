// Задача 000062: высокодетальные SVG-ассеты мобов — проверки каталога.
//
// Для каждого из 36 мобов assets/mobs:
//  * «описание» — непустая строка (800+ знаков), со «сводами»:
//    Силуэт, Цветовая схема (HEX-палитра 5–8 цветов), Арт-дирекшн
//    (движение/удар/гибель);
//  * «art» — move 2–3 кадра, attack 2–3, dead ровно 1; пути — плоский
//    паттерн assets/sprites/mobs/<mob_id>_<state>_<n>.svg (MOBS.md),
//    файлы существуют;
//  * каждый кадр — структурно корректный SVG: viewBox 100·w × 100·h,
//    без запрещённых тегов (script/text/image/SMIL/foreignObject),
//    без внешних ссылок, id в <defs> с префиксом <mob_id>_,
//    тень-эллипс rgba(0,0,0,0.2x);
//  * в кадре ≥ 30·w·h «деталей» (path/circle/ellipse/polygon/rect/line
//    вне defs/clipPath/mask) — счётчик scripts/count-svg-details.js;
//  * в SVG использованы ТОЛЬКО HEX-цвета из палитры «описания»;
//  * кадры одного состояния различаются (move_1 ≠ move_2,
//    attack_1 ≠ attack_2) — анимация не «мертвая».
//
// Отдельный тест — зеркало combat.js — в combat.test.js (поле «art»
// в зеркало не попадает).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { countDetails } = require('../scripts/count-svg-details.js');

const ROOT = path.join(__dirname, '..');
const MOBS_DIR = path.join(ROOT, 'assets', 'mobs');

function mobFiles() {
  return fs.readdirSync(MOBS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function loadMob(f) {
  return JSON.parse(
    fs.readFileSync(path.join(MOBS_DIR, f), 'utf8'));
}

// --- Сканер SVG-кадров ---
//
// Лёгкий структурный контроль (без внешних зависимостей):
//  * баланс парных тегов (g/defs/linearGradient/clipPath/mask);
//  * запрещённые теги и внешние ссылки;
//  * viewBox, тень, префикс id в defs.

const PAIRED_TAGS = ['g', 'defs', 'linearGradient', 'clipPath', 'mask'];
const FORBIDDEN_TAGS = ['script', 'text', 'image', 'foreignObject',
  'animate', 'animatetransform', 'set'];

function checkMobSvgErrors(file, text, mobId, size) {
  const errors = [];
  // Корневой svg + xmlns + viewBox 100·w × 100·h.
  if (!/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 (\d+) (\d+)" width="\1" height="\2">/.test(text)) {
    errors.push('нет корневого <svg> с xmlns и viewBox');
  } else {
    const m = text.match(/viewBox="0 0 (\d+) (\d+)"/);
    if (Number(m[1]) !== 100 * size.w || Number(m[2]) !== 100 * size.h) {
      errors.push(`viewBox ${m[1]}×${m[2]} ≠ 100·${size.w}×100·${size.h}`);
    }
  }
  if (!/\s*<\/svg>\s*$/.test(text)) errors.push('нет закрывающего </svg>');
  // Баланс парных тегов.
  for (const t of PAIRED_TAGS) {
    const open = (text.match(new RegExp(`<${t}(?:\\s[^>]*)?>`, 'g')) || []).length;
    const close = (text.match(new RegExp(`</${t}\\s*>`, 'g')) || []).length;
    if (open !== close) errors.push(`тег <${t}> не сбалансирован: ${open} vs ${close}`);
  }
  // Запрещённые теги (без учёта вхождения в xmlns-атрибут и т.п. —
  // ищем именно начало тега).
  for (const t of FORBIDDEN_TAGS) {
    if (new RegExp(`<${t}(?:\\s|/|>)`, 'i').test(text)) errors.push(`запрещённый тег <${t}>`);
  }
  // Внешние ссылки (xmlns-пространства не в счёт).
  const noXmlns = text.replace(/xmlns="[^"]*"/g, '');
  if (/https?:\/\//.test(noXmlns)) errors.push('внешняя http(s)-ссылка');
  if (/xlink|href\s*=/i.test(noXmlns)) errors.push('атрибут-ссылка href/xlink');
  // Тень-эллипс rgba(0,0,0,0.2x) (MOBS.md: 0.25–0.3).
  if (!/rgba\(0,\s*0,\s*0,\s*0\.2[5-9]\)/.test(text)) errors.push('нет тени rgba(0,0,0,0.2x)');
  // id в defs — с префиксом <mob_id>_ (MOBS.md).
  const defs = text.match(/<defs[^>]*>[\s\S]*?<\/defs>/);
  if (defs) {
    for (const idm of defs[0].matchAll(/id="([^"]+)"/g)) {
      if (!idm[1].startsWith(mobId + '_')) {
        errors.push(`id "${idm[1]}" в defs без префикса "${mobId}_"`);
      }
    }
  }
  return errors;
}

test('сканер: отрицательный контроль — ловит намеренные поломки', () => {
  const good =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">\n' +
    '<defs><linearGradient id="t_g1"></linearGradient></defs>\n' +
    '<ellipse cx="50" cy="94" rx="30" ry="4" fill="rgba(0,0,0,0.28)"/>\n' +
    '<circle cx="50" cy="50" r="20" fill="#6b8a4a" stroke="#3f5427"/>\n' +
    '</svg>\n';
  assert.deepEqual(checkMobSvgErrors('t.svg', good, 't', { w: 1, h: 1 }), []);

  const noShadow = good.replace('rgba(0,0,0,0.28)', '#111111');
  assert.ok(checkMobSvgErrors('t.svg', noShadow, 't', { w: 1, h: 1 }).length > 0,
    'сканер: пропавшую тень не поймал');

  const withScript = good.replace('</svg>', '<script>alert(1)</script></svg>');
  assert.ok(checkMobSvgErrors('t.svg', withScript, 't', { w: 1, h: 1 }).length > 0,
    'сканер: <script> не поймал');

  const badViewBox = good.replace('viewBox="0 0 100 100"', 'viewBox="0 0 64 64"');
  assert.ok(checkMobSvgErrors('t.svg', badViewBox, 't', { w: 1, h: 1 }).length > 0,
    'сканер: чужой viewBox не поймал');

  const badId = good.replace('id="t_g1"', 'id="other_g1"');
  assert.ok(checkMobSvgErrors('t.svg', badId, 't', { w: 1, h: 1 }).length > 0,
    'сканер: чужой префикс id не поймал');

  const external = good.replace('<circle', '<circle href="http://x.y/z"');
  assert.ok(checkMobSvgErrors('t.svg', external, 't', { w: 1, h: 1 }).length > 0,
    'сканер: внешнюю ссылку не поймал');

  const broken = good.replace('</svg>', '<g></svg>');
  assert.ok(checkMobSvgErrors('t.svg', broken, 't', { w: 1, h: 1 }).length > 0,
    'сканер: несбалансированный <g> не поймал');
});

// --- «Описания» ---

test('у всех 36 мобов есть «описание»: 800+ знаков, своды, палитра HEX', () => {
  const files = mobFiles();
  assert.equal(files.length, 36, 'в каталоге ровно 36 JSON мобов');
  for (const f of files) {
    const m = loadMob(f);
    const d = m['описание'];
    assert.equal(typeof d, 'string', f + ': «описание» — строка');
    assert.ok(d.length >= 800,
      `${f}: «описание» короче 800 знаков (${d.length})`);
    assert.match(d, /силуэт/i, f + ': нет свода «Силуэт»');
    assert.match(d, /цветовая схема|палитра/i, f + ': нет свода «Цветовая схема»');
    assert.match(d, /арт-дирекшн/i, f + ': нет свода «Арт-дирекшн»');
    const hexes = d.match(/#[0-9a-fA-F]{6}\b/g) || [];
    assert.ok(hexes.length >= 5, f + ': в палитре меньше 5 HEX');
    assert.ok(new Set(hexes.map((h) => h.toLowerCase())).size >= 5,
      f + ': в палитре меньше 5 разных HEX');
    assert.ok(hexes.length <= 12, f + ': палитра подозрительно велика (' + hexes.length + ')');
    assert.match(d, /движение:/i, f + ': арт-дирекшн без «Движение:»');
    assert.match(d, /удар:/i, f + ': арт-дирекшн без «Удар:»');
    assert.match(d, /гибель:/i, f + ': арт-дирекшн без «Гибель:»');
  }
});

// --- «art»: форма, пути, файлы, детали, палитра ---

const STATE_RE = {
  move: /_move_[123]\.svg$/,
  attack: /_attack_[123]\.svg$/,
  dead: /_dead_1\.svg$/,
};

test('у всех 36 мобов «art»: move 2-3, attack 2-3, dead 1; пути и файлы', () => {
  const files = mobFiles();
  for (const f of files) {
    const m = loadMob(f);
    const art = m.art;
    assert.ok(art && typeof art === 'object', f + ': нет «art»');
    for (const st of ['move', 'attack']) {
      assert.ok(Array.isArray(art[st]), f + ': art.' + st + ' — массив');
      assert.ok(art[st].length >= 2 && art[st].length <= 3,
        f + ': art.' + st + ' — 2..3 кадра (получено ' + art[st].length + ')');
    }
    assert.ok(Array.isArray(art.dead) && art.dead.length === 1,
      f + ': art.dead — ровно 1 кадр');
    for (const [st, arr] of Object.entries(art)) {
      for (const p of arr) {
        assert.match(p, new RegExp('^assets/sprites/mobs/' + m.id + STATE_RE[st].source),
          f + ': путь ' + p + ' не по паттерну ' + st);
        assert.ok(fs.existsSync(path.join(ROOT, p)),
          f + ': нет файла ' + p);
      }
    }
  }
});

test('кадры: viewBox/структура/тень/префикс id + ≥ 30·w·h деталей', () => {
  const files = mobFiles();
  for (const f of files) {
    const m = loadMob(f);
    for (const [st, arr] of Object.entries(m.art)) {
      for (const p of arr) {
        const text = fs.readFileSync(path.join(ROOT, p), 'utf8');
        const errors = checkMobSvgErrors(p, text, m.id, m.size);
        assert.deepEqual(errors, [], p + ': ' + errors.join('; '));
        const need = 30 * m.size.w * m.size.h;
        const have = countDetails(text);
        assert.ok(have >= need,
          `${p}: деталей ${have} < бюджета ${need} (30·w·h)`);
      }
    }
  }
});

test('кадры: в SVG только HEX-цвета из палитры «описания»', () => {
  const files = mobFiles();
  for (const f of files) {
    const m = loadMob(f);
    const palette = new Set(
      ((m['описание'].match(/#[0-9a-fA-F]{6}\b/g) || []).map((h) => h.toLowerCase())));
    const seen = new Set();
    for (const arr of Object.values(m.art)) {
      for (const p of arr) {
        const text = fs.readFileSync(path.join(ROOT, p), 'utf8');
        for (const h of (text.match(/#[0-9a-fA-F]{6}\b/g) || [])) {
          seen.add(h.toLowerCase());
        }
      }
    }
    const outside = [...seen].filter((h) => !palette.has(h));
    assert.deepEqual(outside, [],
      f + ': в SVG цвета вне палитры «описания»: ' + outside.join(', '));
  }
});

test('кадры одного состояния различаются (move_1≠move_2, attack_1≠attack_2)', () => {
  const files = mobFiles();
  for (const f of files) {
    const m = loadMob(f);
    for (const st of ['move', 'attack']) {
      for (let i = 0; i < m.art[st].length - 1; i++) {
        const a = fs.readFileSync(path.join(ROOT, m.art[st][i]), 'utf8');
        const b = fs.readFileSync(path.join(ROOT, m.art[st][i + 1]), 'utf8');
        assert.notEqual(a, b,
          f + ': кадры ' + st + ' ' + (i + 1) + ' и ' + (i + 2) + ' идентичны');
      }
    }
  }
});
