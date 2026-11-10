// Задача 000326 — sweep: ссылки свитков assets/items на каталоги.
// Формат ссылки — по ФАКТУ КОДА (две РАЗНЫЕ формы):
// * spell_scroll: effect.spell = id заклинания (латиница
//   ^[a-z][a-z0-9_]*$, ключ id JSON assets/spells; src/items.js validate
//   пинит ФОРМУ id, каталожность — canLearn/getSpell при применении и
//   этот sweep); НЕ путь файла.
// * craft_scroll: effect.recipe в JSON-каталоге — ФАЙЛОВАЯ ссылка
//   assets/craft/NNNNNN.json (source of truth, src/items/schema.json
//   паттерн), в зеркале src/items-data.js — id рецепта
//   (scripts/sync-items-data.js резолвит через scripts/lib/json-ref.js,
//   битая ссылка — exit 1; convention 000211 «пути в assets, id в src»;
//   runtime — C.CRAFT_BY_ID[it.effect.recipe], src/items.js useItem).
// * resurrection_scroll (id resurrect_scroll, 000051): ссылки на
//   заклинание НЕТ BY DESIGN — effect {kind:'resurrect'} без полей
//   (контракт D6 000165); в sweep — «resurrect ⇔ нет spell/recipe»,
//   НЕ нарушение.
// Schema effect.spell/effect.recipe описаны (0-diff); spec/items.md
// формат уже задокументирован («Свиток заклинания» / «Чертёж вида
// крафта») → задача = ЗАКРЕПЛЕНИЕ (pin, прецедент 000327). Контракт —
// memory/000326-scroll-spell-links.md.
// Sweep ДИНАМИЧЕСКИЙ — без канареек счёта свитков (счётные пины —
// items.test.js S1 «158 запечатан» и craft-тесты). T3 — self-check
// чекера фикстурами в os.tmpdir() (паттерн 000327 S4 / 000335:
// осмысленная краснота БЕЗ фиксации кривого реального файла).
// T4 — roundtrip-заморозка свитков (конвенция 000335 LEGACY_STROKE:
// у свитков legacy-исключений нет — exclusion-список пуст).
// kind=node; require — node:test/assert/fs/path/os + в T2 зеркала
// src/items-data.js и src/spells-data.js.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const CRAFT_DIR = path.join(ROOT, 'assets', 'craft');

const SPELL_ID_RE = /^[a-z][a-z0-9_]*$/;
const CRAFT_REF_RE = /^assets\/craft\/\d{6}\.json$/;

const SCROLL_FORMAT_EXCEPTIONS_000326 = [];

function dataFiles(dir) {
  return fs.readdirSync(dir).filter((f) => /^\d{6}\.json$/.test(f)).sort();
}

// 000318.05: spells — slug из живого реестра; schema.json — исключение.
function spellDataFiles(dir) {
  const JR = require('../scripts/lib/json-ref.js');
  return fs.readdirSync(dir)
    .filter((f) => f !== 'schema.json'
      && JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells].test(f)).sort();
}

function readJson(dir, f) {
  return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}

function checkScrollLinks(itemsDir, spellsDir, craftDir) {
  const v = [];
  const spellIds = new Set();
  for (const f of spellDataFiles(spellsDir)) {
    const id = readJson(spellsDir, f).id;
    if (typeof id === 'string' && id) spellIds.add(id);
  }
  const craftRefs = new Map();
  for (const f of dataFiles(craftDir)) {
    const j = readJson(craftDir, f);
    if (j !== null && typeof j === 'object'
      && Object.prototype.hasOwnProperty.call(j, 'id')) {
      craftRefs.set('assets/craft/' + f, j.id);
    }
  }
  for (const f of dataFiles(itemsDir)) {
    const j = readJson(itemsDir, f);
    const kind = j.kind;
    if (typeof kind !== 'string' || !kind.endsWith('_scroll')) continue;
    const e = j.effect;
    if (e === null || typeof e !== 'object') {
      v.push(f + ': свиток без effect');
      continue;
    }
    if (kind === 'spell_scroll') {
      if (e.kind !== 'spell') {
        v.push(f + ': spell_scroll — effect.kind ≠ «spell»');
      } else if (typeof e.spell !== 'string' || !SPELL_ID_RE.test(e.spell)) {
        v.push(f + ': свиток — неверный формат id заклинания «' + String(e.spell) + '»');
      } else if (!spellIds.has(e.spell)) {
        v.push(f + ': «effect.spell» «' + e.spell + '» — не резолвится в assets/spells (id)');
      }
    } else if (kind === 'craft_scroll') {
      if (e.kind !== 'craft_recipe') {
        v.push(f + ': craft_scroll — effect.kind ≠ «craft_recipe»');
      } else if (typeof e.recipe !== 'string' || !CRAFT_REF_RE.test(e.recipe)) {
        v.push(f + ': «effect.recipe» «' + String(e.recipe)
          + '» — не файловая ссылка assets/craft/NNNNNN.json (в JSON — путь, id — только в зеркале)');
      } else if (!craftRefs.has(e.recipe)) {
        v.push(f + ': «effect.recipe» «' + e.recipe + '» — no-file/no-id в assets/craft');
      }
    } else if (kind === 'resurrection_scroll') {
      if (e.kind !== 'resurrect') {
        v.push(f + ': resurrection_scroll — effect.kind ≠ «resurrect»');
      }
      if ('spell' in e) {
        v.push(f + ': resurrection_scroll — поле spell (ссылки на заклинание нет BY DESIGN, D6 000165)');
      }
      if ('recipe' in e) {
        v.push(f + ': resurrection_scroll — поле recipe (ссылки на заклинание нет BY DESIGN, D6 000165)');
      }
    }
  }
  return v;
}

test('000326 T1: sweep JSON-каталога — spell_scroll: effect.kind «spell» + effect.spell ∈ id assets/spells; craft_scroll: effect.kind «craft_recipe» + recipe — путь assets/craft/NNNNNN.json, файл существует с id; resurrection_scroll: effect {kind:«resurrect»} БЕЗ spell/recipe (by design); свитков без effect — 0', () => {
  const files = dataFiles(ITEMS_DIR);
  assert.ok(files.length > 0, 'каталог assets/items не пуст');
  const v = checkScrollLinks(ITEMS_DIR, SPELLS_DIR, CRAFT_DIR);
  assert.deepEqual(v, [], v.join('; '));
});

test('000326 T2: зеркало src/items-data.js — effect.spell spell_scroll ≡ JSON И ∈ SPELLS_BY_ID; recipe craft_scroll — id-форма ∈ id assets/craft и ≡ id резолва JSON-пути; resurrect — {kind:«resurrect»}', () => {
  const { ITEMS } = require('../src/items-data.js');
  const { SPELLS_BY_ID } = require('../src/spells-data.js');
  const byId = new Map();
  for (const f of dataFiles(ITEMS_DIR)) {
    const j = readJson(ITEMS_DIR, f);
    byId.set(j.id, { f, j });
  }
  const craftIds = new Set();
  for (const f of dataFiles(CRAFT_DIR)) {
    const id = readJson(CRAFT_DIR, f).id;
    if (typeof id === 'string' && id) craftIds.add(id);
  }
  const seen = { spell: 0, craft: 0, resurrect: 0 };
  for (const it of ITEMS) {
    if (typeof it.kind !== 'string' || !it.kind.endsWith('_scroll')) continue;
    const src = byId.get(it.id);
    assert.ok(src, 'зеркало: свиток «' + it.id + '» отсутствует в JSON-каталоге');
    if (it.kind === 'spell_scroll') {
      seen.spell++;
      assert.deepEqual(it.effect, src.j.effect,
        it.id + ': effect зеркала ≡ effect JSON (spell — pass-through)');
      assert.equal(typeof it.effect.spell, 'string', it.id + ': effect.spell — строка');
      assert.ok(SPELLS_BY_ID[it.effect.spell],
        it.id + ': effect.spell «' + it.effect.spell + '» — нет в SPELLS_BY_ID (src/spells-data.js)');
    } else if (it.kind === 'craft_scroll') {
      seen.craft++;
      assert.equal(it.effect.kind, 'craft_recipe', it.id + ': effect.kind');
      assert.match(it.effect.recipe, SPELL_ID_RE,
        it.id + ': recipe зеркала — id-форма ^[a-z][a-z0-9_]*$ (не путь): «' + it.effect.recipe + '»');
      assert.ok(craftIds.has(it.effect.recipe),
        it.id + ': recipe «' + it.effect.recipe + '» — нет среди id assets/craft');
      assert.match(src.j.effect.recipe, CRAFT_REF_RE,
        it.id + ': recipe JSON — файловая ссылка assets/craft/NNNNNN.json');
      const refFile = path.join(ROOT, src.j.effect.recipe);
      assert.ok(fs.existsSync(refFile),
        it.id + ': JSON-ссылка «' + src.j.effect.recipe + '» — файла нет (no-file)');
      const resolved = readJson(path.dirname(refFile), path.basename(refFile));
      assert.equal(resolved.id, it.effect.recipe,
        it.id + ': recipe зеркала ≡ id резолва JSON-ссылки «' + src.j.effect.recipe + '»');
    } else if (it.kind === 'resurrection_scroll') {
      seen.resurrect++;
      assert.deepEqual(it.effect, { kind: 'resurrect' },
        it.id + ': resurrect — эффект без ссылок (D6 000165)');
    }
  }
  assert.ok(seen.spell > 0 && seen.craft > 0 && seen.resurrect > 0,
    'все три вида свитков в зеркале: ' + JSON.stringify(seen));
});

test('000326 T3: self-check чекера — чистая фикстура []; кривые spell-id/recipe-в-id-форме/битый путь craft/свиток без effect/resurrect со spell — нарушения с маркером (os.tmpdir(), не каталог)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'scroll-spell-links-000326-'));
  try {
    const mk = (name, { items, spells = { 'fireball.json': { id: 'fireball' } },
      craft = { '000001.json': { id: 'iron_sword' } } }) => {
      const d = path.join(tmp, name);
      for (const sub of ['items', 'spells', 'craft']) {
        fs.mkdirSync(path.join(d, sub), { recursive: true });
      }
      const put = (dir, entries) => {
        for (const [f, obj] of Object.entries(entries)) {
          fs.writeFileSync(path.join(dir, f), JSON.stringify(obj, null, 2) + '\n');
        }
      };
      put(path.join(d, 'items'), items);
      put(path.join(d, 'spells'), spells);
      put(path.join(d, 'craft'), craft);
      return checkScrollLinks(path.join(d, 'items'), path.join(d, 'spells'), path.join(d, 'craft'));
    };
    const clean = mk('clean', {
      items: {
        '000001.json': { id: 's1', kind: 'spell_scroll', effect: { kind: 'spell', spell: 'fireball' } },
        '000002.json': { id: 'c1', kind: 'craft_scroll', effect: { kind: 'craft_recipe', recipe: 'assets/craft/000001.json' } },
        '000003.json': { id: 'r1', kind: 'resurrection_scroll', effect: { kind: 'resurrect' } },
      },
    });
    assert.deepEqual(clean, [], 'чистая фикстура — без нарушений: ' + JSON.stringify(clean));
    const badSpell = mk('bad-spell', {
      items: { '000001.json': { id: 's1', kind: 'spell_scroll', effect: { kind: 'spell', spell: 'bad_spell_x' } } },
    });
    assert.ok(badSpell.some((s) => s.includes('bad_spell_x')),
      'чекер не сообщил нарушение для кривого spell-id «bad_spell_x»: ' + JSON.stringify(badSpell));
    const idFormRecipe = mk('id-form-recipe', {
      items: { '000001.json': { id: 'c1', kind: 'craft_scroll', effect: { kind: 'craft_recipe', recipe: 'iron_sword' } } },
      craft: { '000001.json': { id: 'iron_sword' } },
    });
    assert.ok(idFormRecipe.some((s) => s.includes('iron_sword') && s.includes('assets/craft')),
      'чекер не сообщил нарушение для recipe в id-форме вместо пути: ' + JSON.stringify(idFormRecipe));
    const noFile = mk('craft-no-file', {
      items: { '000001.json': { id: 'c1', kind: 'craft_scroll', effect: { kind: 'craft_recipe', recipe: 'assets/craft/999999.json' } } },
    });
    assert.ok(noFile.some((s) => s.includes('999999')),
      'чекер не сообщил нарушение для битого пути craft «assets/craft/999999.json»: ' + JSON.stringify(noFile));
    const noEffect = mk('no-effect', {
      items: { '000001.json': { id: 's1', kind: 'spell_scroll' } },
    });
    assert.ok(noEffect.some((s) => s.includes('effect')),
      'чекер не сообщил нарушение для свитка без effect: ' + JSON.stringify(noEffect));
    const resWithSpell = mk('resurrect-spell', {
      items: { '000001.json': { id: 'r1', kind: 'resurrection_scroll', effect: { kind: 'resurrect', spell: 'fireball' } } },
      spells: { 'fireball.json': { id: 'fireball' } },
    });
    assert.ok(resWithSpell.some((s) => s.includes('resurrect') && s.includes('spell')),
      'чекер не сообщил нарушение для resurrect с полем spell (by design — без ссылок): ' + JSON.stringify(resWithSpell));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000326 T4: roundtrip-заморозка свитков — множество файлов kind *_scroll, где JSON.stringify(obj, null, 2) + nl ≠ исходник, = exclusion-списку (пуст — у свитков legacy нет) БИТ-В-БИТ', () => {
  const drift = [];
  for (const f of dataFiles(ITEMS_DIR)) {
    const raw = fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8');
    const j = JSON.parse(raw);
    if (typeof j.kind !== 'string' || !j.kind.endsWith('_scroll')) continue;
    if (JSON.stringify(j, null, 2) + '\n' !== raw) drift.push(f);
  }
  assert.deepEqual(drift, SCROLL_FORMAT_EXCEPTIONS_000326, 'дрейф формата JSON свитков vs заморозка 000326');
});
