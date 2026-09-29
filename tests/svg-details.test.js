// Задача 000062: счётчик «деталей» SVG-ассетов мобов
// (scripts/count-svg-details.js). Правила — MOBS.md:
// деталь = контурный элемент (path, circle, ellipse, polygon, rect, line)
// в теле SVG; внутри <defs>, <clipPath>, <mask> и тег <use> — в счёт
// не идут; комментарии не считаются.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { countDetails } = require('../scripts/count-svg-details.js');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'scripts', 'count-svg-details.js');

// 7 контурных элементов (последний line в форме открытия/закрытия —
// это один элемент).
const BODY =
  '<path d="M0 0h10v10z"/>' +
  '<circle cx="1" cy="1" r="1"/>' +
  '<ellipse cx="2" cy="2" rx="2" ry="1"/>' +
  '<polygon points="0,0 10,0 5,10"/>' +
  '<rect width="5" height="5"/>' +
  '<line x1="0" y1="0" x2="9" y2="9"/>' +
  '<line x1="0" y1="1" x2="9" y2="1"></line>';
// Ни одной детали: defs (градиент + шаблон), clipPath, mask, use.
const NO_DETAILS =
  '<defs>' +
  '<linearGradient id="g1"><stop offset="0" stop-color="#fff"/></linearGradient>' +
  '<path id="tpl" d="M0 0h5v5z"/>' +
  '</defs>' +
  '<clipPath id="c1"><rect x="0" y="0" width="50" height="50"/></clipPath>' +
  '<mask id="m1"><ellipse cx="5" cy="5" rx="5" ry="5"/></mask>' +
  '<use href="#tpl"/>';

test('countDetails: считаются только контурные элементы в теле SVG', () => {
  assert.equal(countDetails(BODY), 7);
  assert.equal(countDetails(NO_DETAILS), 0);
  // Комментарий не считается, <g> не деталь, но контур внутри <g> — да.
  assert.equal(
    countDetails('<!-- <path d="M0 0h10z"/> --><g transform="rotate(10)"><rect width="1" height="1"/></g>'),
    1,
  );
});

test('CLI: «файл: K деталей», --min порога и коды выхода', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-details-'));
  const f7 = path.join(tmp, 'orc_grunt_move_1.svg');
  const f0 = path.join(tmp, 'orc_grunt_attack_1.svg');
  try {
    fs.writeFileSync(
      f7,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${BODY}</svg>`,
    );
    fs.writeFileSync(
      f0,
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${NO_DETAILS}</svg>`,
    );

    // Без --min: подсчёт, код 0.
    const out = execFileSync(process.execPath, [SCRIPT, f7, f0], { encoding: 'utf8' });
    assert.equal(out, `${f7}: 7 деталей\n${f0}: 0 деталей\n`);

    // --min 7: f0 ниже порога — код 1.
    let status = 0;
    try {
      execFileSync(process.execPath, [SCRIPT, '--min', '7', f7, f0], { encoding: 'utf8' });
    } catch (e) {
      status = e.status;
    }
    assert.equal(status, 1);

    // --min 7 только по f7 — код 0; --min=0 — код 0.
    execFileSync(process.execPath, [SCRIPT, '--min', '7', f7], { encoding: 'utf8' });
    execFileSync(process.execPath, [SCRIPT, '--min=0', f0], { encoding: 'utf8' });

    // Нечитаемый файл — код 1; без файлов — код 1.
    for (const arg of [[path.join(tmp, 'nope.svg')], []]) {
      status = 0;
      try {
        execFileSync(process.execPath, [SCRIPT, ...arg], { encoding: 'utf8' });
      } catch (e) {
        status = e.status;
      }
      assert.equal(status, 1, `arg=${JSON.stringify(arg)}`);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('счётчик работает на существующих семейных ассетах', () => {
  const dir = path.join(ROOT, 'assets', 'sprites', 'mobs');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort();
  assert.ok(files.length >= 12, `ожидалось >= 12 семейных SVG, найдено ${files.length}`);
  for (const f of files) {
    const n = countDetails(fs.readFileSync(path.join(dir, f), 'utf8'));
    assert.ok(n >= 1, `${f}: не найдено ни одной детали`);
  }
});
