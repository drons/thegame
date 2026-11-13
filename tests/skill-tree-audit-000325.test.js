// Задача 000325 — sweep: аудит навыков, упоминаемых механиками изучения
// заклинаний и разборки предметов, против каталога дерева assets/skills.
// Источники по ФАКТУ КОДА (AUDIT-first), не по ТЗ-примерам:
//   * PRACTICE_BY_SCHOOL — src/spells.js и src/ally-spells.js (не
//     экспортированы — text-extract литерального блока; значения —
//     вторичные навыки, резолвер — SECONDARY_SKILLS в src/sheet.js;
//     ЛОВУШКА «nature»: в контейнере вторичных это «Сердце природы»
//     (000031), а не школа «Природа» (000042) — см. GUARD 000336);
//   * атрибут школы при изучении — p.primary[spell.атрибут]
//     (src/spells.js canLearn) + ATTR_POOL (text-extract) + значения
//     «атрибут» каталога assets/spells (динамически, прецедент 000327 S2);
//   * гейт «руна» — p.secondary.<id> (src/spells.js canLearn, 'runes');
//   * практика за зелья/еду — src/items.js USE_PRACTICE (pid 'alchemy'
//     / 'nature' — text-extract; резолвер skillPractice → SECONDARY);
//   * виды крафта и разборка — CRAFT_TYPES / CRAFT_TYPE_SKILL /
//     SKILL_CRAFT_TYPE (src/craft.js, live require; разборка 000309 —
//     тот же домен: шанс по уровню вида, вид ← тип канон-рецепта);
//   * лутируемые свитки — SCROLL_SCHOOLS (src/combat.js, live require)
//     → ровно 1 школа assets/skills по name.toLowerCase() (зеркало
//     000327 S1 — школы НЕ дублируем, 000324 смержена).
// ДИФФ аудита ПУСТ (контракт — memory/000325-skill-tree-audit.md):
// ни одного навыка вне каталога механики не резолвят ⇒ задача =
// ЗАКРЕПЛЕНИЕ (pin, прецедент 000327): T1–T4 зелёные на живых данных +
// T5 self-check чекера фикстурами os.tmpdir() (паттерн 000327 S4 /
// 000335 — осмысленная краснота БЕЗ фиксации кривого реального файла).
// «виды крафта» — отдельный домен прогрессии (c.craft), НЕ навыки
// дерева [I]: дизъюнктивность пинится по ID-домену (кириллица vs
// латиница): ids навыков ∩ CRAFT_TYPES = ∅ (омонимия вида «рунопись»
// и навыка «Рунопись» (runes) — не смешивать).
// Sweep ДИНАМИЧЕСКИЙ — без канареек счёта (43/42/167/343 — GUARD 000336
// и счётные пины вне SCOPE). kind=node; require — node:test/assert/fs/
// path/os + live-зеркала src (craft.js / combat.js / skills-data.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const SRC = path.join(ROOT, 'src');

function jsonFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

function readJson(dir, f) {
  return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}

function skillFilesOf(dir) {
  return jsonFiles(dir).filter((f) => /^\d{6}\.json$/.test(f));
}

function spellFilesOf(dir) {
  // 000318.05: spells — slug из живого реестра; schema.json — исключение.
  const JR = require('../scripts/lib/json-ref.js');
  return jsonFiles(dir).filter((f) => f !== 'schema.json'
    && JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells].test(f));
}

function readSrc(name) {
  return fs.readFileSync(path.join(SRC, name), 'utf8');
}

function objBlock(srcFile, name) {
  const m = readSrc(srcFile).match(
    new RegExp('const ' + name + ' = \\{([^}]*)\\}')
  );
  assert.ok(m, srcFile + ': блок const ' + name + ' = {…} не найден — '
    + 'sweep 000325 надо обновить вместе с точкой кода');
  return m[1];
}

function objEntries(block) {
  const out = [];
  const re = /^\s*([^\s:'"]+):\s*'([^']*)'/gm;
  let m;
  while ((m = re.exec(block))) out.push([m[1], m[2]]);
  assert.ok(out.length > 0, 'в блоке не найдено пар key: \'value\'');
  return out;
}

function practiceSkillIds(srcFile) {
  return objEntries(objBlock(srcFile, 'PRACTICE_BY_SCHOOL')).map((e) => e[1]);
}

function attrPoolKeys() {
  return objEntries(objBlock('spells.js', 'ATTR_POOL')).map((e) => e[0]);
}

function secondaryGateIds() {
  const ids = new Set();
  const re = /\.secondary\.([a-z_][a-z0-9_]*)/g;
  const txt = readSrc('spells.js');
  let m;
  while ((m = re.exec(txt))) ids.add(m[1]);
  return [...ids];
}

function usePracticePids() {
  const m = readSrc('items.js').match(
    /it\.kind === 'potion' \? '([a-z_][a-z0-9_]*)' : '([a-z_][a-z0-9_]*)'/
  );
  assert.ok(m, "items.js: блок практики USE_PRACTICE (pid 'potion' : "
    + "'food') не найден — sweep 000325 надо обновить вместе с точкой кода");
  return [m[1], m[2]];
}

function spellAttrIds() {
  const ids = new Set();
  for (const f of spellFilesOf(SPELLS_DIR)) {
    const a = readJson(SPELLS_DIR, f)['атрибут'];
    if (typeof a === 'string' && a) ids.add(a);
  }
  return [...ids];
}

function catalogOf(skillsDir) {
  const ids = new Set();
  const primaryIds = new Set();
  const secondaryIds = new Set();
  const schoolKeys = [];
  for (const f of skillFilesOf(skillsDir)) {
    const j = readJson(skillsDir, f);
    if (typeof j.id === 'string' && j.id) ids.add(j.id);
    if (j.type === 'primary') primaryIds.add(j.id);
    if (j.type === 'secondary') secondaryIds.add(j.id);
    if (j.type === 'school' && typeof j.name === 'string') {
      schoolKeys.push({ f, key: j.name.toLowerCase() });
    }
  }
  return { ids, primaryIds, secondaryIds, schoolKeys };
}

function checkSkillRefs(tables, skillsDir) {
  const v = [];
  const cat = catalogOf(skillsDir);
  for (const id of tables.practiceIds || []) {
    if (!cat.secondaryIds.has(id)) {
      v.push('навык практики «' + id + '» — не резолвится во ВТОРИЧНЫХ '
        + 'навыках assets/skills (резолвер — SECONDARY_SKILLS)');
    }
  }
  for (const id of tables.attrIds || []) {
    if (!cat.primaryIds.has(id)) {
      v.push('навык атрибута «' + id + '» — не резолвится в ПЕРВИЧНЫХ '
        + 'навыках assets/skills (p.primary[attr])');
    }
  }
  for (const id of tables.gateIds || []) {
    if (!cat.ids.has(id)) {
      v.push('навык гейта «' + id + '» — не резолвится в каталоге '
        + 'assets/skills (p.secondary.<id>)');
    }
  }
  for (const id of tables.craftTypeSkillIds || []) {
    if (!cat.ids.has(id)) {
      v.push('связанный навык вида крафта «' + id + '» — не резолвится '
        + 'в каталоге assets/skills (CRAFT_TYPE_SKILL)');
    }
  }
  for (const id of tables.skillCraftTypeKeys || []) {
    if (!cat.ids.has(id)) {
      v.push('навык книг/наставников «' + id + '» — не резолвится в '
        + 'каталоге assets/skills (SKILL_CRAFT_TYPE)');
    }
  }
  for (const t of tables.craftTypes || []) {
    if (cat.ids.has(t)) {
      v.push('вид крафта «' + t + '» — совпадает с id навыка дерева '
        + '(домены c.craft и навыки должны быть дизъюнктны)');
    }
  }
  for (const name of tables.scrollSchools || []) {
    const hits = cat.schoolKeys.filter((s) => s.key === name).length;
    if (hits !== 1) {
      v.push('школа свитка «' + name + '» — резолвится в ' + hits
        + ' JSON школы assets/skills (ожидался ровно 1 по name.toLowerCase())');
    }
  }
  return v;
}

function checkMirrorConsistency(mirror, skillsDir) {
  const v = [];
  if (!mirror || typeof mirror !== 'object') return ['зеркало — не объект'];
  const disk = { primary: [], secondary: [], school: [] };
  for (const f of skillFilesOf(skillsDir)) {
    const j = readJson(skillsDir, f);
    if (!disk[j.type]) {
      v.push(f + ': type «' + j.type + '» — вне primary/secondary/school');
      continue;
    }
    disk[j.type].push({ f, id: j.id, name: j.name });
  }
  const mir = {
    primary: Array.isArray(mirror.PRIMARY_SKILLS) ? mirror.PRIMARY_SKILLS : null,
    secondary: mirror.SECONDARY_SKILLS && typeof mirror.SECONDARY_SKILLS === 'object'
      ? Object.values(mirror.SECONDARY_SKILLS) : null,
    school: Array.isArray(mirror.SCHOOLS) ? mirror.SCHOOLS : null,
  };
  for (const kind of ['primary', 'secondary', 'school']) {
    if (!Array.isArray(mir[kind])) {
      v.push('зеркало: контейнер ' + kind + ' — отсутствует/не массив');
      continue;
    }
    const byDisk = new Map();
    for (const d of disk[kind]) {
      if (byDisk.has(d.id)) {
        v.push('каталог ' + kind + ': дубль id «' + d.id + '» ('
          + byDisk.get(d.id).f + ' и ' + d.f + ')');
      }
      byDisk.set(d.id, d);
    }
    const mirIds = new Set();
    for (const m of mir[kind]) {
      if (mirIds.has(m.id)) {
        v.push('зеркало ' + kind + ': дубль id «' + m.id + '»');
      }
      mirIds.add(m.id);
      const d = byDisk.get(m.id);
      if (!d) {
        v.push('зеркало ' + kind + ': «' + m.id + '» — нет на диске в type «'
          + kind + '»');
      } else if (d.name !== m.name) {
        v.push('зеркало ' + kind + ': имя «' + m.id + '» — «' + m.name
          + '» ≠ диску «' + d.name + '» (' + d.f + ')');
      }
    }
    for (const d of disk[kind]) {
      if (!mirIds.has(d.id)) {
        v.push('зеркало ' + kind + ': нет записи для ' + d.f
          + ' (id «' + d.id + '»)');
      }
    }
  }
  return v;
}

test('000325 T1: sweep — каждый навык-id, резолвимый механиками (практика школы, атрибут, гейт «Рунопись», практика зелий, виды крафта), существует в assets/skills; практика — во вторичных (НЕ SKILL_META — ловушка nature)', () => {
  const CR = require('../src/craft.js');
  const tables = {
    practiceIds: [
      ...practiceSkillIds('spells.js'),
      ...practiceSkillIds('ally-spells.js'),
      ...usePracticePids(),
    ],
    attrIds: [...attrPoolKeys(), ...spellAttrIds()],
    gateIds: secondaryGateIds(),
    craftTypeSkillIds: Object.values(CR.CRAFT_TYPE_SKILL),
    skillCraftTypeKeys: Object.keys(CR.SKILL_CRAFT_TYPE),
    craftTypes: [],
    scrollSchools: [],
  };
  assert.ok(tables.practiceIds.length >= 4,
    'PRACTICE_BY_SCHOOL + USE_PRACTICE — нет ни одного id: text-extract сломан');
  assert.ok(tables.gateIds.includes('runes'),
    "гейт source === 'rune' (p.secondary.runes) в src/spells.js не найден");
  const v = checkSkillRefs(tables, SKILLS_DIR);
  assert.deepEqual(v, [], v.join('; '));
});

test('000325 T2: sweep — SCROLL_SCHOOLS (src/combat.js, live): каждая строка резолвится ровно в ОДИН JSON школы assets/skills по name.toLowerCase() (лутирование свитков → изучение; зеркало 000327 S1)', () => {
  const CB = require('../src/combat.js');
  assert.ok(Array.isArray(CB.SCROLL_SCHOOLS) && CB.SCROLL_SCHOOLS.length > 0,
    'SCROLL_SCHOOLS не экспортирован/пуст — экспорт src/combat.js сломан');
  const v = checkSkillRefs(
    { practiceIds: [], attrIds: [], gateIds: [], craftTypeSkillIds: [],
      skillCraftTypeKeys: [], craftTypes: [], scrollSchools: CB.SCROLL_SCHOOLS },
    SKILLS_DIR
  );
  assert.deepEqual(v, [], 'SCROLL_SCHOOLS: ' + v.join('; '));
});

test('000325 T3: контракт домена крафта: CRAFT_TYPES ≡ ключи CRAFT_TYPE_SKILL (двусторонне); типы ВСЕХ рецептов ⊆ CRAFT_TYPES; таблица «Вид крафта | Связанный навык» spec/craft.md ≡ коду по id И имени JSON; дизъюнктивность ids навыков ∩ CRAFT_TYPES = ∅', () => {
  const CR = require('../src/craft.js');
  assert.deepEqual([...CR.CRAFT_TYPES].sort(),
    Object.keys(CR.CRAFT_TYPE_SKILL).sort(),
    'CRAFT_TYPES ≢ ключи CRAFT_TYPE_SKILL');
  const craftDir = path.join(ROOT, 'assets', 'craft');
  const JRC = require('../scripts/lib/json-ref.js');
  const types = [...new Set(jsonFiles(craftDir)
    .filter((f) => f !== 'schema.json'
      && JRC.SHAPE_BASENAME_RES[JRC.ASSET_NAME_SHAPES.craft].test(f))
    .map((f) => readJson(craftDir, f).тип))];
  assert.ok(types.length > 0, 'каталог recipes assets/craft пуст');
  const outside = types.filter((t) => !CR.CRAFT_TYPES.includes(t));
  assert.deepEqual(outside, [],
    'типы рецептов вне CRAFT_TYPES: ' + outside.join(', '));
  const byId = new Map();
  for (const f of skillFilesOf(SKILLS_DIR)) {
    const j = readJson(SKILLS_DIR, f);
    if (!byId.has(j.id)) byId.set(j.id, []);
    byId.get(j.id).push(j.name);
  }
  const unknownKeys = Object.keys(CR.SKILL_CRAFT_TYPE)
    .filter((k) => !byId.has(k));
  assert.deepEqual(unknownKeys, [],
    'SKILL_CRAFT_TYPE: навыки вне каталога: ' + unknownKeys.join(', '));
  const spec = fs.readFileSync(path.join(ROOT, 'spec', 'craft.md'), 'utf8');
  const rows = new Map();
  for (const line of spec.split('\n')) {
    const m = line.match(/^\s*\|\s*([^|]+?)\s*\|\s*([a-z][a-z0-9_]*)\s*\(([^)]+)\)\s*\|\s*$/);
    if (m) rows.set(m[1], { id: m[2], name: m[3] });
  }
  const problems = [];
  for (const t of CR.CRAFT_TYPES) {
    const row = rows.get(t);
    if (!row) {
      problems.push('spec/craft.md: нет строки вида «' + t + '»');
      continue;
    }
    if (row.id !== CR.CRAFT_TYPE_SKILL[t]) {
      problems.push('spec/craft.md «' + t + '»: id ' + row.id
        + ' ≢ коду ' + CR.CRAFT_TYPE_SKILL[t]);
    }
    const names = byId.get(row.id) || [];
    const namePart = row.name.split(',')[0].trim();
    if (!names.includes(namePart)) {
      problems.push('spec/craft.md «' + t + '»: имя «' + namePart
        + '» ≢ имени JSON навыка ' + row.id);
    }
  }
  assert.deepEqual(problems, [], problems.join('; '));
  const v = checkSkillRefs(
    { practiceIds: [], attrIds: [], gateIds: [], craftTypeSkillIds: [],
      skillCraftTypeKeys: [], craftTypes: CR.CRAFT_TYPES, scrollSchools: [] },
    SKILLS_DIR
  );
  assert.deepEqual(v, [], 'дизъюнктивность доменов: ' + v.join('; '));
});

test('000325 T4: каноничность дерева — зеркало src/skills-data.js {id,name} по контейнерам PRIMARY/SECONDARY/SCHOOLS ≡ JSON assets/skills 1:1 (тип файла = контейнер; nature: secondary «Сердце природы» + school «Природа»); имена навыков уникальны в каталоге (синонимов в дереве нет)', () => {
  const M = require('../src/skills-data.js');
  const v = checkMirrorConsistency(M, SKILLS_DIR);
  assert.deepEqual(v, [], v.join('; '));
  const names = [];
  for (const f of skillFilesOf(SKILLS_DIR)) names.push(readJson(SKILLS_DIR, f).name);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  assert.deepEqual([...new Set(dup)], [],
    'дубли имён (синонимы) в дереве: ' + [...new Set(dup)].join(', '));
});

test('000325 T5: self-check чекеров — чистые фикстуры os.tmpdir() []; кривые (практика blacksmithing, навык вида alchemy2, школа взрыв, вид-омоним alchemy, имя-дрейф зеркала, тип вне контейнеров) — нарушения с маркером (000327 S4 / 000335)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-tree-audit-000325-'));
  try {
    const goodSkills = {
      '000001.json': { id: 'strength', type: 'primary', name: 'Сила' },
      '000002.json': { id: 'intelligence', type: 'primary', name: 'Интеллект' },
      '000003.json': { id: 'meditation', type: 'secondary', name: 'Медитация' },
      '000004.json': { id: 'alchemy', type: 'secondary', name: 'Алхимик' },
      '000005.json': { id: 'runes', type: 'secondary', name: 'Рунопись' },
      '000006.json': { id: 'fire', type: 'school', name: 'Огонь' },
    };
    const mkSkills = (name, entries) => {
      const d = path.join(tmp, name);
      fs.mkdirSync(d, { recursive: true });
      for (const [f, obj] of Object.entries(entries)) {
        fs.writeFileSync(path.join(d, f), JSON.stringify(obj, null, 2) + '\n');
      }
      return d;
    };
    const cleanTables = {
      practiceIds: ['meditation'],
      attrIds: ['intelligence'],
      gateIds: ['runes'],
      craftTypeSkillIds: ['alchemy'],
      skillCraftTypeKeys: ['strength', 'alchemy'],
      craftTypes: ['алхимия'],
      scrollSchools: ['огонь'],
    };
    const goodDir = mkSkills('clean', goodSkills);
    assert.deepEqual(checkSkillRefs(cleanTables, goodDir), [],
      'чистая фикстура checkSkillRefs: ' + JSON.stringify(checkSkillRefs(cleanTables, goodDir)));
    const goodMirror = {
      PRIMARY_SKILLS: [
        { id: 'strength', name: 'Сила' },
        { id: 'intelligence', name: 'Интеллект' },
      ],
      SECONDARY_SKILLS: {
        meditation: { id: 'meditation', name: 'Медитация' },
        alchemy: { id: 'alchemy', name: 'Алхимик' },
        runes: { id: 'runes', name: 'Рунопись' },
      },
      SCHOOLS: [{ id: 'fire', name: 'Огонь' }],
    };
    assert.deepEqual(checkMirrorConsistency(goodMirror, goodDir), [],
      'чистая фикстура checkMirrorConsistency: '
      + JSON.stringify(checkMirrorConsistency(goodMirror, goodDir)));
    const bad = (over) => Object.assign({}, cleanTables, over);
    const badPractice = checkSkillRefs(bad({ practiceIds: ['blacksmithing'] }), goodDir);
    assert.ok(badPractice.some((s) => s.includes('blacksmithing')),
      'практика «blacksmithing»: ' + JSON.stringify(badPractice));
    const badPracticeWrongContainer = checkSkillRefs(
      bad({ practiceIds: ['strength'] }), goodDir);
    assert.ok(badPracticeWrongContainer.some((s) => s.includes('strength')),
      'практика вне вторичного контейнера: ' + JSON.stringify(badPracticeWrongContainer));
    const badCraftSkill = checkSkillRefs(bad({ craftTypeSkillIds: ['alchemy2'] }), goodDir);
    assert.ok(badCraftSkill.some((s) => s.includes('alchemy2')),
      'навык вида крафта «alchemy2»: ' + JSON.stringify(badCraftSkill));
    const badGate = checkSkillRefs(bad({ gateIds: ['lockpicking'] }), goodDir);
    assert.ok(badGate.some((s) => s.includes('lockpicking')),
      'гейт-навык «lockpicking»: ' + JSON.stringify(badGate));
    const badAttr = checkSkillRefs(bad({ attrIds: ['agility'] }), goodDir);
    assert.ok(badAttr.some((s) => s.includes('agility')),
      'атрибут «agility»: ' + JSON.stringify(badAttr));
    const badAttrWrongContainer = checkSkillRefs(
      bad({ attrIds: ['meditation'] }), goodDir);
    assert.ok(badAttrWrongContainer.some((s) => s.includes('meditation')),
      'атрибут вне первичного контейнера: ' + JSON.stringify(badAttrWrongContainer));
    const badSchool = checkSkillRefs(bad({ scrollSchools: ['взрыв'] }), goodDir);
    assert.ok(badSchool.some((s) => s.includes('взрыв')),
      'школа «взрыв»: ' + JSON.stringify(badSchool));
    const dupSchoolDir = mkSkills('dup-school', Object.assign({}, goodSkills, {
      '000007.json': { id: 'fire2', type: 'school', name: 'Огонь' },
    }));
    const dupSchool = checkSkillRefs(cleanTables, dupSchoolDir);
    assert.ok(dupSchool.some((s) => s.includes('огонь') && s.includes('резолвится')),
      'дубль школы «Огонь»: ' + JSON.stringify(dupSchool));
    const badDisjoint = checkSkillRefs(bad({ craftTypes: ['alchemy'] }), goodDir);
    assert.ok(badDisjoint.some((s) => s.includes('вид крафта «alchemy»')),
      'вид крафта = id навыка (домены не дизъюнктны): ' + JSON.stringify(badDisjoint));
    const driftMirror = {
      PRIMARY_SKILLS: goodMirror.PRIMARY_SKILLS,
      SECONDARY_SKILLS: Object.assign({}, goodMirror.SECONDARY_SKILLS, {
        meditation: { id: 'meditation', name: 'Медитація' },
      }),
      SCHOOLS: goodMirror.SCHOOLS,
    };
    const drift = checkMirrorConsistency(driftMirror, goodDir);
    assert.ok(drift.some((s) => s.includes('meditation')),
      'имя-дрейф зеркала: ' + JSON.stringify(drift));
    const missingMirror = {
      PRIMARY_SKILLS: [goodMirror.PRIMARY_SKILLS[0]],
      SECONDARY_SKILLS: goodMirror.SECONDARY_SKILLS,
      SCHOOLS: goodMirror.SCHOOLS,
    };
    const missing = checkMirrorConsistency(missingMirror, goodDir);
    assert.ok(missing.some((s) => s.includes('intelligence')),
      'запись зеркала отсутствует: ' + JSON.stringify(missing));
    const extraDir = mkSkills('extra', Object.assign({}, goodSkills, {
      '000008.json': { id: 'thief', type: 'secondary', name: 'Тать' },
    }));
    const extra = checkMirrorConsistency(goodMirror, extraDir);
    assert.ok(extra.some((s) => s.includes('thief')),
      'файл каталога не в зеркале: ' + JSON.stringify(extra));
    const weirdDir = mkSkills('weird-type', Object.assign({}, goodSkills, {
      '000009.json': { id: 'weird', type: 'ultimate', name: 'Странность' },
    }));
    const weird = checkMirrorConsistency(goodMirror, weirdDir);
    assert.ok(weird.some((s) => s.includes('ultimate')),
      'тип файла вне primary/secondary/school: ' + JSON.stringify(weird));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
