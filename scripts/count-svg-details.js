#!/usr/bin/env node
// scripts/count-svg-details.js — счётчик «деталей» SVG-ассетов мобов.
// Правила — MOBS.md (задача 000062).
//
// Деталь = один контурный элемент в теле SVG:
//   path, circle, ellipse, polygon, rect, line
// Элементы внутри <defs>, <clipPath>, <mask> и тег <use> в счёт НЕ
// идут: это переиспользование (градиенты, шаблоны), а не новые детали.
// XML-комментарии в подсчёт не входят.
//
// Запуск:
//   node scripts/count-svg-details.js [--min N] FILE.svg [FILE.svg ...]
//
// Для каждого файла печатает «файл: K деталей». Если --min задан и
// хотя бы один файл ниже порога (или файл не удалось прочитать) —
// код выхода 1. Node.js, без внешних зависимостей.

'use strict';

const fs = require('node:fs');

const DETAIL_TAGS = new Set(['path', 'circle', 'ellipse', 'polygon', 'rect', 'line']);
// Контейнеры, содержимое которых не считается (тег <use> детальной
// не является и в DETAIL_TAGS не входит). Имена в нижнем регистре —
// теги из XML перед сравнением приводятся к нижнему регистру.
const EXCLUDE_TAGS = new Set(['defs', 'clippath', 'mask']);

const USAGE =
  'Использование: node scripts/count-svg-details.js [--min N] FILE.svg [FILE.svg ...]';

// Вытаскивает содержимое тегов («<...» без угловых скобок): учитывает
// кавычки внутри атрибутов и пропускает комментарии <!-- -->.
function extractTags(svgText) {
  const tags = [];
  let i = 0;
  while (i < svgText.length) {
    const lt = svgText.indexOf('<', i);
    if (lt === -1) break;
    if (svgText.startsWith('<!--', lt)) {
      const end = svgText.indexOf('-->', lt + 4);
      i = end === -1 ? svgText.length : end + 3;
      continue;
    }
    let j = lt + 1;
    let quote = null;
    while (j < svgText.length) {
      const ch = svgText[j];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'") {
        quote = ch;
      } else if (ch === '>') {
        break;
      }
      j += 1;
    }
    if (j >= svgText.length) break; // тег без закрывающего '>'
    tags.push(svgText.slice(lt + 1, j));
    i = j + 1;
  }
  return tags;
}

// Считает «детали» (см. правила в MOBS.md) в тексте SVG.
function countDetails(svgText) {
  let count = 0;
  let excluded = 0; // вложенность внутри defs/clipPath/mask
  for (const raw of extractTags(svgText)) {
    if (raw[0] === '?' || raw[0] === '!') continue; // <?xml ...?>, <!DOCTYPE ...>
    const closing = raw[0] === '/';
    const m = raw.match(
      closing ? /^\/\s*([a-zA-Z][a-zA-Z0-9._:-]*)/ : /^([a-zA-Z][a-zA-Z0-9._:-]*)/,
    );
    if (!m) continue;
    const name = m[1].toLowerCase();
    if (closing) {
      if (EXCLUDE_TAGS.has(name)) excluded = Math.max(0, excluded - 1);
      continue;
    }
    if (excluded === 0 && DETAIL_TAGS.has(name)) count += 1;
    if (EXCLUDE_TAGS.has(name) && !/\/\s*$/.test(raw)) excluded += 1;
  }
  return count;
}

function plural(n) {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'деталь';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'детали';
  return 'деталей';
}

function main(argv) {
  const args = argv.slice(2);
  let min = null;
  const files = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--min' || a === '--min=' || a.startsWith('--min=')) {
      const v = a === '--min' ? args[++i] : a.slice(6);
      const n = Number(v);
      if (!Number.isInteger(n) || n < 0) {
        process.stderr.write(`Ошибка: --min принимает целое число >= 0, получено "${v}"\n${USAGE}\n`);
        return 1;
      }
      min = n;
    } else if (a === '-h' || a === '--help') {
      process.stdout.write(USAGE + '\n');
      return 0;
    } else if (a.startsWith('-')) {
      process.stderr.write(`Ошибка: неизвестный флаг ${a}\n${USAGE}\n`);
      return 1;
    } else {
      files.push(a);
    }
  }
  if (files.length === 0) {
    process.stderr.write(USAGE + '\n');
    return 1;
  }
  let failed = false;
  for (const f of files) {
    let text;
    try {
      text = fs.readFileSync(f, 'utf8');
    } catch (e) {
      process.stderr.write(`Ошибка: не удалось прочитать ${f}: ${e.message}\n`);
      failed = true;
      continue;
    }
    const n = countDetails(text);
    process.stdout.write(`${f}: ${n} ${plural(n)}\n`);
    if (min !== null && n < min) {
      process.stderr.write(`${f}: ниже порога (${n} < ${min})\n`);
      failed = true;
    }
  }
  return failed ? 1 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv));
}

module.exports = { countDetails };
