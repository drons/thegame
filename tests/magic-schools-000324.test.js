// Задача 000324 (школы магии: JSON в assets/skills + видимость в дереве
// навыков [I]; ТЗ tasks/pending/000324.md; контракт
// memory/000324-magic-schools.md) — RED-тесты.
//
// 6 школ по факту диска (поле «школа» assets/spells — 167 заклинаний,
// 28/29/27/29/27/27; enum — 000301): защита, исцеление, лёд, огонь,
// природа, тень. Имена/иконки — байт-в-байт SCHOOLS src/spellbook-oc.js
// (000301): assets/school-icons/<id>.svg (иконки уже на диске).
//
// КРАСНЫЕ (9 — осмысленные ERR_ASSERTION, не краши):
//   A1 — 6 файлов 000038–000043.json отсутствуют (type «school»);
//   A2 — id-набор/порядок 000301, icon = assets/school-icons/<id>.svg
//        на диске, name байт-в-байт — файлы отсутствуют;
//   A3 — каждое различное «школа» из 167 spells совпадает ровно одной
//        школой каталога (name.toLowerCase()) — школ нет;
//   A4 — школьные JSON проходят schema.json — файлов нет;
//   A5 — schema.oneOf — 2 ветви, не 3 (ветви school нет);
//   B1 — зеркало src/skills-data.js: SCHOOLS undefined;
//   B3 — tmp-миникаталог (1 primary + 2 secondary + 1 школа) → sync:
//        старый скрипт exit 1 «поле type должно быть…»;
//   C1 — секции «Школы магии» в дереве [I] нет;
//   C3 — секция не переживает setCharacter (её нет).
//
// ЗЕЛЁНЫЕ с первого запуска (2 — регрессия-фиксация):
//   B2 — дрейф-пин (паттерн SR7): sync над копией реального каталога →
//        exit 0 + регенерированное зеркало deepEqual закоммиченному;
//   C2 — регресс дерева: .cp-portraits первым, 6 основных строк, ровно
//        37 .cp-btn (6 основных + 31 вторичных — школьные строки кнопок
//        не добавляют), «Книга заклинаний»/«Вдох Эфира» на месте, строки
//        книги = старт-заклинания героя (c.spells) в порядке.
//
// RED-состояние = worktree master + только этот файл.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const { validateData } = require('./json-schema.js');

// Контракт 000301 (SCHOOLS src/spellbook-oc.js): порядок файлов =
// порядок вкладок книги, name — байт-в-байт, icon — assets/school-icons.
const SCHOOLS_EXPECTED = [
  ['000038.json', 'protection', 'Защита'],
  ['000039.json', 'healing', 'Исцеление'],
  ['000040.json', 'ice', 'Лёд'],
  ['000041.json', 'fire', 'Огонь'],
  ['000042.json', 'nature', 'Природа'],
  ['000043.json', 'shadow', 'Тень'],
];

function readSchoolFile(file) {
  const p = path.join(SKILLS_DIR, file);
  if (!fs.existsSync(p)) {
    assert.fail('assets/skills/' + file + ' отсутствует '
      + '(задача 000324: JSON школы в каталоге)');
  }
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// --- A: каталог assets/skills ---

test('A1: 6 школьных файлов 000038–000043.json в каталоге, type «school»', () => {
  for (const [file, id] of SCHOOLS_EXPECTED) {
    const p = path.join(SKILLS_DIR, file);
    assert.ok(fs.existsSync(p),
      'assets/skills/' + file + ' отсутствует (школа «' + id + '»)');
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    assert.equal(d.type, 'school', file + ': type «school»');
  }
});

test('A2: id ровно {protection,healing,ice,fire,nature,shadow} в порядке 000301; icon = assets/school-icons/<id>.svg на диске; name байт-в-байт SCHOOLS', () => {
  const ids = [];
  for (const [file, id, name] of SCHOOLS_EXPECTED) {
    const d = readSchoolFile(file);
    assert.equal(d.id, id, file + ': id «' + id + '» (порядок 000301)');
    ids.push(d.id);
    assert.equal(d.icon, 'assets/school-icons/' + d.id + '.svg',
      file + ': icon = assets/school-icons/<id>.svg');
    assert.ok(fs.existsSync(path.join(ROOT, d.icon)),
      file + ': иконка на диске: ' + d.icon);
    assert.equal(d.name, name,
      file + ': name байт-в-байт «' + name + '» (SCHOOLS 000301)');
  }
  assert.deepEqual(ids,
    ['protection', 'healing', 'ice', 'fire', 'nature', 'shadow']);
});

test('A3: каждое различное «школа» 167 spells совпадает ровно одной школой каталога (name.toLowerCase())', () => {
  const present = [];
  for (const [file] of SCHOOLS_EXPECTED) {
    const p = path.join(SKILLS_DIR, file);
    if (fs.existsSync(p)) {
      present.push(JSON.parse(fs.readFileSync(p, 'utf8')).name.toLowerCase());
    }
  }
  const spellFiles = fs.readdirSync(SPELLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(spellFiles.length, 167, '167 заклинаний (факт диска)');
  const values = new Set();
  for (const f of spellFiles) {
    const d = JSON.parse(
      fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8'));
    assert.ok(typeof d.школа === 'string' && d.школа,
      f + ': поле «школа» — строка');
    values.add(d.школа);
  }
  assert.equal(values.size, 6, '6 различных школ по spells');
  for (const v of values) {
    const hits = present.filter((n) => n === v);
    assert.equal(hits.length, 1,
      'школа spells «' + v + '» — ровно одна школа каталога '
      + '(каталог: [' + present.join(', ') + '])');
  }
});

test('A4: каждый школьный JSON проходит schema.json (ветвь school)', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, 'schema.json'), 'utf8'));
  for (const [file] of SCHOOLS_EXPECTED) {
    const d = readSchoolFile(file);
    const errs = validateData(schema, d, file);
    assert.deepEqual(errs, [], file + ': ' + errs.join('; '));
  }
});

test('A5: schema.oneOf — 3 ветви; третья: type object, additionalProperties false, const «school», required [id,type,name,desc,icon]', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(SKILLS_DIR, 'schema.json'), 'utf8'));
  assert.equal(schema.oneOf.length, 3,
    'oneOf — 3 ветви (primary | secondary | school)');
  const sc = schema.oneOf[2];
  assert.equal(sc.type, 'object', 'school: type object');
  assert.equal(sc.additionalProperties, false,
    'school: additionalProperties false');
  assert.deepEqual(sc.properties.type, { const: 'school' },
    'school: type закреплено константой');
  assert.deepEqual(sc.required, ['id', 'type', 'name', 'desc', 'icon'],
    'school: required — канонический порядок');
  assert.equal(sc.properties.id.pattern, '^[a-z][a-z0-9_]*$',
    'school: id — латиница (как у навыков)');
  for (const f of ['name', 'desc', 'icon']) {
    assert.deepEqual(sc.properties[f], { type: 'string' },
      'school: ' + f + ' — string');
  }
});

// --- B: зеркало и sync ---

test('B1: зеркало — SCHOOLS: массив 6, deepEqual каталогу в порядке файлов, канон-порядок ключей', () => {
  const m = require('../src/skills-data.js');
  assert.ok(Array.isArray(m.SCHOOLS),
    'зеркало: экспорт SCHOOLS (задача 000324)');
  assert.equal(m.SCHOOLS.length, 6, 'SCHOOLS — 6 школ');
  const cat = SCHOOLS_EXPECTED.map(([file]) => readSchoolFile(file));
  assert.deepEqual(m.SCHOOLS, cat,
    'SCHOOLS — deepEqual каталогу в порядке файлов');
  for (const s of m.SCHOOLS) {
    assert.deepEqual(Object.keys(s),
      ['id', 'type', 'name', 'desc', 'icon'], 'канон-порядок ключей');
  }
});

test('B2 (пин): sync над копией реального каталога — exit 0, зеркало = закоммиченное (0 дрейфа)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-schools-drift-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'skills'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-skills-data.js'),
      path.join(dir, 'scripts', 'sync-skills-data.js'));
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
        path.join(dir, 'scripts', 'lib', f));
    }
    for (const f of fs.readdirSync(SKILLS_DIR)) {
      fs.copyFileSync(path.join(SKILLS_DIR, f),
        path.join(dir, 'assets', 'skills', f));
    }
    fs.copyFileSync(path.join(ROOT, 'src', 'skills-data.js'),
      path.join(dir, 'src', 'skills-data.js'));
    const r = spawnSync(process.execPath,
      [path.join(dir, 'scripts', 'sync-skills-data.js')],
      { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0,
      'sync → exit 0: ' + (r.stdout || '') + (r.stderr || ''));
    const regen = require(path.join(dir, 'src', 'skills-data.js'));
    const committed = require(path.join(ROOT, 'src', 'skills-data.js'));
    assert.deepEqual(regen, committed,
      'регенерированное зеркало = закоммиченное (0 дрейфа)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const SCHOOL_FIXTURE = {
  id: 'protection',
  type: 'school',
  name: 'Защита',
  desc: 'Щиты и бафы союзников, телепорт.',
  icon: 'assets/school-icons/protection.svg',
};

test('B3: sync над миникаталогом со школьным файлом → exit 0 + SCHOOLS в регенерированном зеркале', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'magic-schools-sync-'));
  try {
    fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'assets', 'skills'), { recursive: true });
    fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-skills-data.js'),
      path.join(dir, 'scripts', 'sync-skills-data.js'));
    for (const f of fs.readdirSync(path.join(ROOT, 'scripts', 'lib'))) {
      fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', f),
        path.join(dir, 'scripts', 'lib', f));
    }
    const read = (f) => JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    const files = {
      '000001.json': read('000001.json'),
      '000002.json': read('000007.json'),
      '000003.json': read('000008.json'),
      '000038.json': SCHOOL_FIXTURE,
    };
    files['000002.json'].primary = 'assets/skills/000001.json';
    files['000003.json'].primary = 'assets/skills/000001.json';
    files['000003.json'].requires.skill = 'assets/skills/000002.json';
    for (const [f, d] of Object.entries(files)) {
      fs.writeFileSync(path.join(dir, 'assets', 'skills', f),
        JSON.stringify(d, null, 2) + '\n', 'utf8');
    }
    const r = spawnSync(process.execPath,
      [path.join(dir, 'scripts', 'sync-skills-data.js')],
      { cwd: dir, encoding: 'utf8' });
    assert.equal(r.status, 0,
      'sync над каталогом со школой → exit 0: '
      + (r.stdout || '') + (r.stderr || ''));
    const mirror = require(path.join(dir, 'src', 'skills-data.js'));
    assert.deepEqual(mirror.SCHOOLS, [SCHOOL_FIXTURE],
      'SCHOOLS — школа из миникаталога (канон-порядок ключей)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- C: дерево навыков [I] (vm-цепочка, паттерн tests/ui-skills.test.js) ---

function matchesSel(el, sel) {
  if (sel.startsWith('.')) {
    return String(el.className || '').split(/\s+/).includes(sel.slice(1));
  }
  return String(el.tagName || '').toLowerCase() === sel.toLowerCase();
}

function findAll(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeEl(tag) {
  const el = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    appendChild(ch) {
      if (ch.parent) {
        ch.parent.children.splice(ch.parent.children.indexOf(ch), 1);
      }
      ch.parent = this;
      this.children.push(ch);
      return ch;
    },
    remove() {
      if (this.parent) {
        const i = this.parent.children.indexOf(this);
        if (i >= 0) this.parent.children.splice(i, 1);
        this.parent = null;
      }
    },
    addEventListener(type, fn) {
      (this.listeners[type] || (this.listeners[type] = []))
        .push(fn);
    },
    setAttribute(name, value) { this.dataset[name] = value; },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    querySelector(sel) { return findAll(this, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(this, sel); },
    closest(sel) {
      let n = this;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
  };
  Object.defineProperty(el, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of this.children) ch.parent = null;
      this.children.length = 0;
    },
  });
  return el;
}

const CHAIN = [
  'global-settings.js', 'perlin.js', 'mapseed.js',
  'skills-data.js', 'items-data.js', 'npc-data.js',
  'portraits-data.js',
  'map.js', 'sheet.js', 'player.js', 'day.js', 'items.js', 'buildings.js',
  'npc.js', 'combat.js', 'dungeon.js',
  'controls.js', 'combat-keys.js',
  'party.js',
  'ui-tabs.js', 'ui-tab-skills.js', 'ui-tab-inventory.js',
  'ui-tab-settings.js', 'ui-tab-shop.js', 'ui-tab-quests.js',
  'ui.js',
];

function loadPlayerUi() {
  const errors = [];
  const document = {
    createElement: (tag) => makeEl(tag),
    body: makeEl('body'),
    querySelector: () => null,
    addEventListener: () => {},
    hidden: false,
  };
  const window = { addEventListener: () => {} };
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
    document, window, setTimeout, clearTimeout,
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'),
      sandbox, { filename: f });
  }
  return { G: sandbox.Game, body: document.body, errors };
}

function openPanel(env, c) {
  assert.equal(env.errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + env.errors.join('; '));
  assert.ok(env.G.playerUI,
    'Game.playerUI создан (controls.js загружен ДО ui.js)');
  env.G.playerUI.setCharacter(c);
  env.G.playerUI.toggle(true);
}

function characterPane(env) {
  const cols = findAll(env.body, '.cp-column');
  assert.ok(cols && cols.length >= 1, 'панель персонажа построена');
  const panes = findAll(cols[0], '.cp-tabpane');
  assert.ok(panes && panes.length >= 1, '.cp-tabpane в первом столбце');
  return panes[0];
}

test('C1: [I] — секция «Школы магии» МЕЖДУ вторичными группами и «Книга заклинаний»: 6 строк (name/«—»/desc), кнопок нет; 0 ошибок', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  openPanel(env, c);
  const pane = characterPane(env);
  const secs = findAll(pane, '.cp-section');
  const names = secs.map((s) => s.textContent);
  const idxSchools = names.indexOf('Школы магии');
  assert.ok(idxSchools !== -1,
    'секция «Школы магии» в дереве (задача 000324): ' + JSON.stringify(names));
  const idxCharisma = names.indexOf('Харизма');
  const idxBook = names.indexOf('Книга заклинаний');
  assert.ok(idxCharisma !== -1 && idxSchools > idxCharisma,
    'секция ПОСЛЕ групп вторичных навыков: ' + JSON.stringify(names));
  assert.equal(idxSchools, idxBook - 1,
    'секция СРАЗУ ПЕРЕД «Книга заклинаний»: ' + JSON.stringify(names));
  const sec = secs[idxSchools];
  const rows = findAll(sec, 'tr');
  assert.equal(rows.length, 6, '6 строк (по школе)');
  rows.forEach((tr, i) => {
    const [file, id, name] = SCHOOLS_EXPECTED[i];
    const desc = JSON.parse(fs.readFileSync(
      path.join(SKILLS_DIR, file), 'utf8')).desc;
    const nameTd = tr.querySelector('.cp-name');
    const lvTd = tr.querySelector('.cp-level');
    const tip = tr.querySelector('.cp-tip');
    assert.equal(nameTd && nameTd.textContent, name, 'строка ' + i + ': name');
    assert.equal(lvTd && lvTd.textContent, '—',
      'строка ' + i + ': уровень «—» (у школы нет уровня)');
    assert.equal(tip && tip.textContent, desc,
      'строка ' + i + ': тултип — desc из каталога');
    assert.equal(findAll(tr, '.cp-btn').length, 0,
      'строка ' + i + ': кнопки нет (школа — не навык)');
  });
  assert.equal(env.errors.length, 0,
    '0 console.error: ' + env.errors.join('; '));
});

test('C2 (регресс): дерево не задето — .cp-portraits первым, 6 основных строк, 37 .cp-btn (6+31), «Книга заклинаний»/«Вдох Эфира», строки книги = c.spells', () => {
  const env = loadPlayerUi();
  const c = env.G.createCharacter();
  openPanel(env, c);
  const pane = characterPane(env);
  assert.equal(pane.children[0] && String(pane.children[0].className),
    'cp-portraits', 'ряд портретов — ПЕРВЫМ');
  const primaries = findAll(pane, '.cp-section')
    .find((s) => s.textContent === 'Основные навыки');
  assert.ok(primaries, 'секция «Основные навыки»');
  const primRows = findAll(primaries, 'tr');
  assert.equal(primRows.length, 6, '6 основных строк');
  primRows.forEach((tr, i) => {
    assert.equal(tr.querySelector('.cp-name').textContent,
      env.G.PRIMARY_SKILLS[i].name, 'основная строка ' + i + ' по имени');
  });
  assert.equal(findAll(pane, '.cp-btn').length, 6 + 31,
    '37 .cp-btn: 6 основных + 31 вторичных (школьные строки '
    + 'кнопок не добавляют)');
  const secs = findAll(pane, '.cp-section');
  assert.ok(secs.some((s) => s.textContent === 'Книга заклинаний'),
    '«Книга заклинаний» на месте');
  assert.ok(secs.some((s) => s.textContent === 'Вдох Эфира'),
    '«Вдох Эфира» на месте');
  const book = secs.find((s) => s.textContent === 'Книга заклинаний');
  const bookRows = findAll(book, '.cp-itemrow');
  assert.deepEqual(bookRows.map((r) => r.querySelector('.cp-itemname').textContent),
    [...c.spells], 'строки книги — старт-заклинания героя (c.spells), порядок');
  assert.equal(env.errors.length, 0,
    '0 console.error: ' + env.errors.join('; '));
});

test('C3: после setCharacter (новый персонаж) секция «Школы магии» переживает re-render (опять 6 строк)', () => {
  const env = loadPlayerUi();
  const c1 = env.G.createCharacter();
  openPanel(env, c1);
  const pane = characterPane(env);
  const before = findAll(pane, '.cp-section')
    .find((s) => s.textContent === 'Школы магии');
  assert.ok(before, 'секция до setCharacter (задача 000324)');
  const c2 = env.G.createCharacter('Путник');
  env.G.playerUI.setCharacter(c2);
  const sec = findAll(pane, '.cp-section')
    .find((s) => s.textContent === 'Школы магии');
  assert.ok(sec, 'секция переживает setCharacter (re-render in place)');
  const rows = findAll(sec, 'tr');
  assert.equal(rows.length, 6, 'опять 6 строк');
  rows.forEach((tr, i) => {
    assert.equal(tr.querySelector('.cp-name').textContent,
      SCHOOLS_EXPECTED[i][2], 'строка ' + i + ': name не задет');
  });
  assert.equal(env.errors.length, 0,
    '0 console.error: ' + env.errors.join('; '));
});
