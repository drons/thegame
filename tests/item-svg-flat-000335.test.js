// Задача 000335 — sweep: flat-SVG-контракт 000302 по
// assets/sprites/items. Ретро b2-20261105 (системная finding по
// 000302.01–.08): стиль 193 иконок 000302 (viewBox 64×64, без
// градиентов/<text>/<path>/<use>/stroke=) закреплён только в
// memory/000302-icon-registry.md §2/§3 — дрейф не ловили.
// svg.test.js НАМЕРЕННО не проверяет размеры viewBox и запрещённые
// теги (шапка «ЧТО НАМЕРЕННО НЕ ПРОВЕРЯЕТСЯ ЗДЕСЬ»): только
// well-formedness / viewBox-числа / NaN / покаталожный счёт.
// stroke= — заморозка 46 legacy-файлов 000230.x
// (LEGACY_STROKE_000335); ни один из 193 SVG волн 000302 stroke=
// не содержит. kind=node; require — только
// node:test/assert/fs/path/os (без src-require).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const SVG_DIR = path.join(ROOT, 'assets', 'sprites', 'items');

const LEGACY_STROKE_000335 = [
  'amethyst_boots.svg', 'amethyst_pants.svg', 'bone_sandals.svg',
  'cloth_loincloth.svg', 'cloth_sandals.svg', 'copper_boots.svg',
  'ember_pants.svg', 'emerald_boots.svg', 'felt_boots.svg',
  'felt_trousers.svg', 'frost_sandals.svg', 'gold_sandals.svg',
  'hemp_breeches.svg', 'hemp_sandals.svg', 'hide_boots.svg',
  'hide_wrap.svg', 'leather_boots.svg', 'leather_garter.svg',
  'leather_pants.svg', 'leather_sandals.svg', 'linen_trousers.svg',
  'mithril_boots.svg', 'mystic_breeches.svg', 'mystic_sandals.svg',
  'obsidian_sandals.svg', 'philosopher_staff.svg', 'rough_chaps.svg',
  'rune_boots.svg', 'rune_greaves.svg', 'sapphire_boots.svg',
  'silver_boots.svg', 'silver_chaps.svg', 'stone_sandals.svg',
  'storm_leggings.svg', 'storm_sandals.svg', 'straw_sandals.svg',
  'swift_boots.svg', 'titan_greaves.svg', 'travel_boots.svg',
  'traveler_breeches.svg', 'traveler_cloak.svg', 'twine_wraps.svg',
  'void_robe.svg', 'wooden_sandals.svg', 'wool_boots.svg',
  'wool_trousers.svg',
];
const LEGACY_STROKE_SET = new Set(LEGACY_STROKE_000335);

const VIEWBOX_000335 = 'viewBox="0 0 64 64"';

function checkFlatItemSvg(text) {
  const v = [];
  const vb = text.split(VIEWBOX_000335).length - 1;
  if (vb !== 1) {
    v.push('viewBox="0 0 64 64" — ровно 1 (факт: ' + vb + ')');
  }
  if (/<linearGradient[\s>\/]/.test(text)) {
    v.push('<linearGradient — запрещён (flat-SVG)');
  }
  if (/<radialGradient[\s>\/]/.test(text)) {
    v.push('<radialGradient — запрещён (flat-SVG)');
  }
  if (/<text[\s>\/]/.test(text)) {
    v.push('<text — запрещён (flat-SVG)');
  }
  if (/<path[\s>\/]/.test(text)) {
    v.push('<path — запрещён (flat-SVG)');
  }
  if (/<use[\s>\/]/.test(text)) {
    v.push('<use — запрещён (flat-SVG)');
  }
  if (/stroke=/.test(text)) {
    v.push('stroke= — запрещён (flat-SVG)');
  }
  return v;
}

const BASE_FIXTURE =
  '<svg xmlns="http://www.w3.org/2000/svg" ' + VIEWBOX_000335 + '>'
  + '<polygon points="10,10 24,10 10,24" fill="#c96f3b"/>'
  + '</svg>';

const BAD_FIXTURES_000335 = [
  ['viewBox-32', 'viewBox',
    BASE_FIXTURE.replace(VIEWBOX_000335, 'viewBox="0 0 32 32"')],
  ['viewBox-none', 'viewBox',
    '<svg xmlns="http://www.w3.org/2000/svg"><polygon '
    + 'points="10,10 24,10 10,24" fill="#c96f3b"/></svg>'],
  ['linearGradient', '<linearGradient',
    BASE_FIXTURE.replace('</svg>',
      '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"/></svg>')],
  ['radialGradient', '<radialGradient',
    BASE_FIXTURE.replace('</svg>', '<radialGradient id="g"/></svg>')],
  ['text', '<text',
    BASE_FIXTURE.replace('</svg>', '<text x="4" y="16">X</text></svg>')],
  ['path', '<path',
    BASE_FIXTURE.replace('</svg>', '<path d="M10 10 L24 10 Z"/></svg>')],
  ['use', '<use',
    BASE_FIXTURE.replace('</svg>', '<use href="#g"/></svg>')],
  ['stroke', 'stroke=',
    BASE_FIXTURE.replace('fill="#c96f3b"', 'fill="none" stroke="#c96f3b"')],
];

test('000335 checker: чистая фикстура — 0 нарушений; кривые фикстуры (временные файлы, НЕ в каталоге) — краснота с маркером', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-flat-000335-'));
  try {
    const baseP = path.join(tmp, 'base.svg');
    fs.writeFileSync(baseP, BASE_FIXTURE);
    assert.deepEqual(
      checkFlatItemSvg(fs.readFileSync(baseP, 'utf8')), []);
    for (const [name, marker, text] of BAD_FIXTURES_000335) {
      const p = path.join(tmp, name + '.svg');
      fs.writeFileSync(p, text);
      const v = checkFlatItemSvg(fs.readFileSync(p, 'utf8'));
      assert.ok(v.length > 0,
        name + ': чекер красный на кривой фикстуре');
      assert.ok(v.some((x) => x.startsWith(marker)),
        name + ': маркер «' + marker + '» в нарушениях; факт: '
        + JSON.stringify(v));
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000335 SWEEP: assets/sprites/items — flat-SVG-контракт 000302 (viewBox="0 0 64 64" ровно 1, без градиентов/text/path/use; stroke= — только 46 legacy 000230.x из заморозки)', () => {
  assert.equal(LEGACY_STROKE_000335.length, 46,
    'заморозка — ровно 46 legacy (канарейка); факт: '
    + LEGACY_STROKE_000335.length);
  const files = fs.readdirSync(SVG_DIR)
    .filter((f) => f.endsWith('.svg')).sort();
  let strokeSeen = 0;
  for (const f of files) {
    const text = fs.readFileSync(path.join(SVG_DIR, f), 'utf8');
    const v = checkFlatItemSvg(text);
    const rest = v.filter((x) => !x.startsWith('stroke='));
    assert.equal(rest.length, 0,
      f + ': flat-SVG-контракт 000302; ' + rest.join('; '));
    const st = v.filter((x) => x.startsWith('stroke='));
    if (st.length > 0) {
      strokeSeen++;
      assert.ok(LEGACY_STROKE_SET.has(f),
        f + ': stroke= вне заморозки LEGACY_STROKE_000335 '
        + '(46 legacy 000230.x)');
    }
  }
  assert.equal(strokeSeen, LEGACY_STROKE_000335.length,
    'stroke= — ровно 46 legacy (заморозка 000335); факт: ' + strokeSeen);
});
