// Задача 000327 — sweep: ссылки тэгов assets/spells на каталоги.
// «школа» — кириллический id школы (enum 000301) — резолв в JSON школы
// assets/skills (000324: 000038–000043) по name.toLowerCase();
// «атрибут» — id навыка assets/skills (000004 intelligence / 000005 wisdom);
// «параметры.summon» при «действие» «призыв» — id моба assets/mobs
// (движок: MOB_TYPES[summon], src/spells.js fail-closed гейт + makeAlly).
// Формат ссылки = id каталога (НЕ путь файла) — факт потребителей:
// SCHOOL_BONUS/PRACTICE_BY_SCHOOL/SCROLL_SCHOOLS/CAST_FX_SCHOOLS
// (src/spells.js, src/combat.js, src/ally-spells.js, src/spellbook-oc.js,
// src/combat-ui.js), ATTR_POOL + spellInt/spellWis (src/spells.js,
// src/combat.js); пути в JSON заклинаний — только у файла-ссылок
// (база/предметы/здания/icon). Контракт — memory/000327-spell-links.md.
// Sweep ДИНАМИЧЕСКИЙ — без канареек счёта заклинаний/призывов
// (000332/000333 добавят заклинания; счётные пины — A3 000324 и
// W-08 spells.test.js). S4 — self-check чекера фикстурами в os.tmpdir()
// (паттерн 000335: осмысленная краснота БЕЗ фиксации кривого реального
// файла). S5 — roundtrip-заморозка формата JSON каталога; 18 legacy-
// файлов с inline-массивами (000001–000017 + schema.json) — exclusion-
// список FORMAT_EXCEPTIONS_000327 (конвенция 000335 LEGACY_STROKE).
// kind=node; require — только node:test/assert/fs/path/os (без
// src-require).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');
const SPELLS_DIR = path.join(ROOT, 'assets', 'spells');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const MOBS_DIR = path.join(ROOT, 'assets', 'mobs');

// 000318.05: те же 17 legacy-файлов (000001–000017) переименованы в
// slug по id (spark…resurrect) + schema.json; порядок — новый lex.
const FORMAT_EXCEPTIONS_000327 = [
  'blizzard.json', 'chill.json', 'fireball.json', 'flame_burst.json',
  'frost_bolt.json', 'greater_heal.json', 'inferno.json',
  'light_heal.json', 'magic_shield.json', 'mend.json',
  'nature_blessing.json', 'resurrect.json', 'schema.json',
  'shadow_bolt.json', 'spark.json', 'stone_skin.json', 'vine.json',
  'ward.json',
];

function jsonFiles(dir) {
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
}

function readJson(dir, f) {
  return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
}

function spellFilesOf(dir) {
  // 000318.05: spells — slug из живого реестра; schema.json — исключение.
  const JR = require('../scripts/lib/json-ref.js');
  return jsonFiles(dir).filter((f) => f !== 'schema.json'
    && JR.SHAPE_BASENAME_RES[JR.ASSET_NAME_SHAPES.spells].test(f));
}

function checkCatalog(spellDir, skillsDir, mobsDir) {
  const v = { school: [], attr: [], summon: [], seenSchools: [], seenAttrs: [] };
  const schools = [];
  const skillIds = new Set();
  for (const f of jsonFiles(skillsDir)) {
    const j = readJson(skillsDir, f);
    if (typeof j.id === 'string' && j.id) skillIds.add(j.id);
    if (j.type === 'school' && typeof j.name === 'string') {
      schools.push({ f, key: j.name.toLowerCase() });
    }
  }
  const seenKeys = new Set();
  for (const s of schools) {
    if (seenKeys.has(s.key)) {
      v.school.push('skills ' + s.f + ': дубль школы по name.toLowerCase() «' + s.key + '»');
    }
    seenKeys.add(s.key);
  }
  const mobIds = new Set();
  for (const f of jsonFiles(mobsDir)) {
    const id = readJson(mobsDir, f).id;
    if (typeof id === 'string' && id) mobIds.add(id);
  }
  for (const f of spellFilesOf(spellDir)) {
    const j = readJson(spellDir, f);
    const school = j['школа'];
    if (typeof school === 'string' && school) {
      v.seenSchools.push(school);
      const hits = schools.filter((s) => s.key === school).length;
      if (hits === 0) {
        v.school.push(f + ': «школа» «' + school + '» — не резолвится в assets/skills (type=school, name.toLowerCase())');
      } else if (hits > 1) {
        v.school.push(f + ': «школа» «' + school + '» — резолвится в ' + hits + ' JSON школы (должно быть ровно 1)');
      }
    } else {
      v.school.push(f + ': «школа» — отсутствует');
    }
    const attr = j['атрибут'];
    if (typeof attr === 'string' && attr) {
      v.seenAttrs.push(attr);
      if (!skillIds.has(attr)) {
        v.attr.push(f + ': «атрибут» «' + attr + '» — не резолвится в assets/skills (id)');
      }
    } else {
      v.attr.push(f + ': «атрибут» — отсутствует');
    }
    const isSummon = j['действие'] === 'призыв';
    const params = j['параметры'];
    const summon = (params && typeof params === 'object') ? params.summon : undefined;
    if (isSummon && typeof summon !== 'string') {
      v.summon.push(f + ': «действие» «призыв» — параметры.summon отсутствует');
    } else if (!isSummon && typeof summon === 'string') {
      v.summon.push(f + ': «параметры.summon» «' + summon + '» — без «действие» «призыв»');
    }
    if (typeof summon === 'string' && !mobIds.has(summon)) {
      v.summon.push(f + ': «параметры.summon» «' + summon + '» — не резолвится в assets/mobs (id)');
    }
  }
  return v;
}

test('000327 S1: sweep — «школа» каждого заклинания резолвится в ровно ОДИН JSON школы assets/skills (name.toLowerCase(), уникальность совпадения); значения ⊆ enum схемы', () => {
  const files = spellFilesOf(SPELLS_DIR);
  assert.ok(files.length > 0, 'каталог assets/spells не пуст');
  const v = checkCatalog(SPELLS_DIR, SKILLS_DIR, MOBS_DIR);
  assert.deepEqual(v.school, [], v.school.join('; '));
  const schema = readJson(SPELLS_DIR, 'schema.json');
  const enumSchool = new Set(schema.properties['школа'].enum);
  const out = [...new Set(v.seenSchools)].filter((x) => !enumSchool.has(x));
  assert.deepEqual(out, [], '«школа» вне enum схемы: ' + out.join(', '));
});

test('000327 S2: sweep — «атрибут» каждого заклинания = id JSON assets/skills; значения ⊆ enum схемы (intelligence/wisdom)', () => {
  const v = checkCatalog(SPELLS_DIR, SKILLS_DIR, MOBS_DIR);
  assert.deepEqual(v.attr, [], v.attr.join('; '));
  const schema = readJson(SPELLS_DIR, 'schema.json');
  const enumAttr = new Set(schema.properties['атрибут'].enum);
  const out = [...new Set(v.seenAttrs)].filter((x) => !enumAttr.has(x));
  assert.deepEqual(out, [], '«атрибут» вне enum схемы: ' + out.join(', '));
});

test('000327 S3: sweep — биекция гейта: «действие» «призыв» ⇔ параметры.summon, и summon резолвится в assets/mobs по id; у НЕ-призывов параметров.summon нет', () => {
  const v = checkCatalog(SPELLS_DIR, SKILLS_DIR, MOBS_DIR);
  assert.deepEqual(v.summon, [], v.summon.join('; '));
});

test('000327 S4: self-check чекера — чистая фикстура []; кривые школа/атрибут/summon/биекция/дубль школы — нарушения с маркером (ос.tmpdir(), не каталог)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spell-links-000327-'));
  try {
    const goodSkills = {
      '000001.json': { id: 'fire', type: 'school', name: 'Огонь' },
      '000002.json': { id: 'ice', type: 'school', name: 'Лёд' },
      '000003.json': { id: 'intelligence', type: 'primary', name: 'Интеллект' },
      '000004.json': { id: 'wisdom', type: 'primary', name: 'Мудрость' },
    };
    const goodMobs = { '000001.json': { id: 'imp' } };
    const spell = (over) => Object.assign({
      id: 'fx',
      школа: 'огонь',
      атрибут: 'intelligence',
      действие: 'урон',
      параметры: { stat: 'урон', value: 5 },
    }, over);
    const mk = (name, { spells, skills = goodSkills, mobs = goodMobs }) => {
      const d = path.join(tmp, name);
      for (const sub of ['spells', 'skills', 'mobs']) {
        fs.mkdirSync(path.join(d, sub), { recursive: true });
      }
      const put = (dir, entries) => {
        for (const [f, obj] of Object.entries(entries)) {
          fs.writeFileSync(path.join(dir, f), JSON.stringify(obj, null, 2) + '\n');
        }
      };
      put(path.join(d, 'spells'), spells);
      put(path.join(d, 'skills'), skills);
      put(path.join(d, 'mobs'), mobs);
      return checkCatalog(path.join(d, 'spells'), path.join(d, 'skills'), path.join(d, 'mobs'));
    };
    const clean = mk('clean', {
      spells: {
        'fx.json': spell({}),
        'fx2.json': spell({ id: 'fx2', школа: 'лёд', атрибут: 'wisdom', действие: 'призыв', параметры: { summon: 'imp', turns: 4 } }),
      },
    });
    assert.deepEqual(clean, { school: [], attr: [], summon: [], seenSchools: ['огонь', 'лёд'], seenAttrs: ['intelligence', 'wisdom'] }, 'чистая фикстура — без нарушений: ' + JSON.stringify(clean));
    const badSchool = mk('bad-school', { spells: { 'fx.json': spell({ школа: 'взрыв' }) } });
    assert.ok(badSchool.school.some((s) => s.includes('«взрыв»')), 'кривая школа «взрыв»: ' + JSON.stringify(badSchool));
    const badAttr = mk('bad-attr', { spells: { 'fx.json': spell({ атрибут: 'agility' }) } });
    assert.ok(badAttr.attr.some((s) => s.includes('«agility»')), 'кривой атрибут «agility»: ' + JSON.stringify(badAttr));
    const badSummon = mk('bad-summon', { spells: { 'fx.json': spell({ действие: 'призыв', параметры: { summon: 'dragon', turns: 4 } }) } });
    assert.ok(badSummon.summon.some((s) => s.includes('«dragon»')), 'кривой summon «dragon»: ' + JSON.stringify(badSummon));
    const noParam = mk('summon-no-param', { spells: { 'fx.json': spell({ действие: 'призыв', параметры: { turns: 4 } }) } });
    assert.ok(noParam.summon.some((s) => s.includes('параметры.summon отсутствует')), 'призыв без summon: ' + JSON.stringify(noParam));
    const noAction = mk('param-no-summon', { spells: { 'fx.json': spell({ параметры: { summon: 'imp' } }) } });
    assert.ok(noAction.summon.some((s) => s.includes('без «действие» «призыв»')), 'summon без призыва: ' + JSON.stringify(noAction));
    const dup = mk('dup-school', {
      spells: { 'fx.json': spell({}) },
      skills: Object.assign({}, goodSkills, { '000005.json': { id: 'fire2', type: 'school', name: 'Огонь' } }),
    });
    assert.ok(dup.school.some((s) => s.includes('дубль школы')), 'дубль школы: ' + JSON.stringify(dup));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('000327 S5: roundtrip-заморозка — множество файлов assets/spells/*.json, где JSON.stringify(obj, null, 2) + nl ≠ исходник, = exclusion-списку (18 legacy с inline-массивами) БИТ-В-БИТ', () => {
  const drift = [];
  for (const f of jsonFiles(SPELLS_DIR)) {
    const raw = fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8');
    if (JSON.stringify(JSON.parse(raw), null, 2) + '\n' !== raw) drift.push(f);
  }
  assert.deepEqual(drift, FORMAT_EXCEPTIONS_000327, 'дрейф формата JSON vs заморозка 000327');
});
