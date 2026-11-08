// Задача 000318.11: устранение коллизии id «nature» в assets/skills
// (предусловие 000318.09 — инвариант «имя файла == id» для skills).
//
// Факт ДО задачи: ДВА файла с id «nature» — 000031 «Сердце природы»
// (secondary) и 000042 «Природа» (school). GUARD tests/efir.test.js
// (000336) пинил коллизию как «единственную», winner-ассерты полагались
// на порядок readdirSync (школа 000042 лексически позже — перетирала
// вторичный в Map). Решение 000318.11 (контракт memory/000318-skills-nature.md):
// school-запись 000042 получает id «nature_school» (английский id школы
// НЕ имеет рантайм-потребителей: школы в рантайме — русские строки
// «школа» каталога spells / вкладки SpellBook.SCHOOLS; резолвинг
// школа→JSON — по name.toLowerCase(), НЕ по id), иконка переезжает
// nature.svg → nature_school.svg (контракт spec/skills.md
// «id = имя иконки» остаётся истинным без правки спеки). Вторичный
// «nature» (000031) НЕ меняется — он живой рантайм-id И ключ в сейве
// (hero.secondary[id] / hero.skillXp[id], санитайзер player.js).
// СЕЙВ-РИСК нулевой: школа в сейве не хранится вообще → миграция/алиас
// НЕ нужны; сейв v1, MIGRATIONS == [] целы (пин ниже). Решение 000336
// «НЕ переименовывать» отменено задачей 000318.11 (память 000336
// закоммичена и не правится; отмена — в memory/000318-skills-nature.md).
//
// Тесты:
//   T1 — 0 коллизий id в assets/skills (44 файла, 44 уникальных id);
//   T2 — резолв id→запись НЕ зависит от порядка readdir (winner по
//        порядку больше не механизм: «nature» — вторичный, «nature_school»
//        — школа при любом порядке обхода);
//   T3 — сейв-регресс (зелёный страж НУЛЕВОГО сейв-риска): старый сейв
//        с secondary.nature/skillXp.nature играбелен бит-в-бит;
//        MIGRATIONS == [] и CURRENT_VERSION == 1; school-ссылок в
//        save-пайплайне нет;
//   T4 — GUARD 000336 в tests/efir.test.js перепинен ЧЕСТНО: ноль
//        коллизий, winner-ассертов по readdir-порядку нет, skip «nature»
//        снят (grep-пины текста — прецедент wording/grep-пинов);
//   T5 — ссылки на изменённый id резолвятся: 000042.json проходит
//        ветвь school схемы, icon = assets/school-icons/<id>.svg на
//        диске (nature.svg НЕ существует), src/spellbook.js «природа»
//        → та же иконка, зеркало src/skills-data.js ≡ JSON, вложений
//        «school-icons/nature.svg» в репозитории не осталось.
//
// RED (база 6657e0d): T1, T2, T4, T5 — красные (коллизия «nature»×2,
// winner по readdir, GUARD пинит дубль, id/иконка ещё old); T3 — зелёный
// страж (сейв-путь вторичного не меняется по построению варианта (a)).
// Предсказуемые чужие красные ПОСЛЕ реализации до ре-пинов: efir GUARD,
// magic-schools-000324 A2, spellbook-oc-tabs, combat-spellbook-tabs-000331
// (перепины — тем же коммитом).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { validateData } = require('./json-schema.js');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const readJson = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
const skillFiles = () => fs.readdirSync(SKILLS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f));

test('000318.11 T1: 0 коллизий id в assets/skills — 44 файла, 44 уникальных id (инвариант basename==id для 000318.09)', () => {
  const files = skillFiles();
  assert.equal(files.length, 44,
    'assets/skills: 44 файла 0000NN.json (факт: ' + files.length + ')');
  const counts = new Map();
  for (const f of files) {
    const id = readJson(path.join(SKILLS_DIR, f)).id;
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  const dups = [...counts.entries()].filter(([, n]) => n > 1);
  assert.deepEqual(dups, [],
    'коллизии id (id, количество): ' + JSON.stringify(dups));
  assert.equal(counts.size, 44,
    'уникальных id = числу файлов (факт: ' + counts.size + ')');
});

test('000318.11 T2: резолв id→запись не зависит от порядка readdir — nature остаётся вторичным 000031, nature_school — школой 000042 (winner по readdir больше не механизм)', () => {
  const files = skillFiles();
  const build = (order) => {
    const m = new Map();
    for (const f of order) {
      const j = readJson(path.join(SKILLS_DIR, f));
      m.set(j.id, j);
    }
    return m;
  };
  const fwd = build(files);
  const rev = build([...files].reverse());
  assert.equal(fwd.size, 44,
    'Map(прямой порядок): 44 записей без перезатирания (факт: ' + fwd.size + ')');
  assert.equal(rev.size, 44,
    'Map(обратный порядок): 44 записей без перезатирания (факт: ' + rev.size
    + ') — размер Map зависит от порядка ⇒ есть winner по readdir');
  const natureFwd = fwd.get('nature');
  const natureRev = rev.get('nature');
  assert.ok(natureFwd && natureRev,
    'id «nature» присутствует в обоих порядках');
  assert.deepEqual(natureFwd, natureRev,
    '«nature» — ОДНА и та же запись при любом порядке readdir '
    + '(прямой: type=' + natureFwd.type + ', file-id-победитель; '
    + 'обратный: type=' + natureRev.type + ')');
  assert.equal(natureFwd.type, 'secondary',
    '«nature» — вторичный навык (000031), не школа (факт: '
    + natureFwd.type + ')');
  assert.equal(natureFwd.name, 'Сердце природы',
    '«nature» — «Сердце природы» (000031 неизменен — ключ сейва)');
  for (const m of [fwd, rev]) {
    const sc = m.get('nature_school');
    assert.ok(sc, 'id «nature_school» — в каталоге (школа 000042)');
    assert.equal(sc.type, 'school',
      '«nature_school» — school-запись (факт: ' + sc.type + ')');
    assert.equal(sc.name, 'Природа',
      '«nature_school» — «Природа» (name не меняется)');
  }
});

test('000318.11 T3: сейв-регресс (нуллевой сейв-риск) — старый сейв с secondary.nature=10/skillXp.nature=7 играбелен; MIGRATIONS==[] и версия 1 целы; school-ссылок в save-пайплайне нет', () => {
  const P = require('../src/player.js');
  function base() {
    return {
      name: 'Флогистон',
      level: 5, xp: 120, totalXp: 900, gold: 340, hp: 37, mp: 8, points: 2,
      primary: {
        strength: 3, dexterity: 2, constitution: 2,
        intelligence: 2, wisdom: 1, charisma: 1,
      },
      secondary: { endurance: 3, nature: 10 },
      skillXp: { endurance: 40, nature: 7 },
      alive: true,
    };
  }
  const clean = P.sanitizeSavedHero(base());
  assert.ok(clean, 'старый сейв восстанавливается (не null)');
  assert.deepEqual(clean.secondary, { endurance: 3, nature: 10 },
    'secondary.nature — сохранён (вторичный «nature» в каталоге, '
    + 'санитайзер не отбрасывает)');
  assert.deepEqual(clean.skillXp, { endurance: 40, nature: 7 },
    'skillXp.nature — сохранён');
  const saveSrc = fs.readFileSync(path.join(ROOT, 'src', 'save.js'), 'utf8');
  assert.match(saveSrc, /let CURRENT_VERSION = 1;/,
    'сейв остаётся версией 1 (без bump)');
  const m = saveSrc.match(/const MIGRATIONS = \{([\s\S]*?)\};/);
  assert.ok(m, 'в save.js есть const MIGRATIONS = { ... };');
  const live = m[1].split('\n').map((l) => l.trim())
    .filter((l) => l && !l.startsWith('//'));
  assert.deepEqual(live, [],
    'MIGRATIONS остаётся пустой (алиас-миграция НЕ нужна — школа в '
    + 'сейве не хранится): ' + JSON.stringify(live));
  for (const f of ['save.js', 'player.js', 'main.js', 'companions.js']) {
    const src = fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
    assert.doesNotMatch(src, /\.SCHOOLS\b/,
      'src/' + f + ': school-контейнер в save-пайплайне не используется '
      + '(английский id школы в сейв не попадает — переименование '
      + 'school-id не требует миграции)');
    assert.doesNotMatch(src, /nature_school/,
      'src/' + f + ': нового school-id в save-пайплайне нет');
  }
  const sheetSrc = fs.readFileSync(path.join(ROOT, 'src', 'sheet.js'), 'utf8');
  assert.match(sheetSrc, /foodPowerMult: 1 \+ pct\('nature'\)/,
    'формула foodPowerMult по вторичному «nature» — прежняя (000031 '
    + 'не переименован — ключ сейва/гейтов)');
});

test('000318.11 T4: GUARD 000336 в tests/efir.test.js перепинен честно — 0 коллизий, skip «nature» снят, winner-ассертов по readdir-порядку нет', () => {
  const src = fs.readFileSync(path.join(__dirname, 'efir.test.js'), 'utf8');
  const start = src.indexOf("test('000336 GUARD");
  assert.ok(start >= 0, 'GUARD-тест «000336 GUARD» в tests/efir.test.js');
  const end = src.indexOf('\ntest(', start + 10);
  const block = src.slice(start, end < 0 ? src.length : end);
  assert.match(block, /SKILL_META\.size, 44/,
    'GUARD перепинен: 44 уникальных id (было 43 при коллизии)');
  assert.match(block, /dups, \[\]/,
    'GUARD перепинен: deepEqual(dups, []) — ноль коллизий (было '
    + "[['nature', 2]])");
  assert.doesNotMatch(block, /\[\['nature', 2\]\]/,
    'GUARD больше не пинит дубль «nature»');
  assert.doesNotMatch(block, /id === 'nature'\) continue/,
    'skip «nature» в обходе каталога снят');
  assert.doesNotMatch(block, /readdir выигрывает/,
    'winner-ассертов «позднее в readdir выигрывает» не осталось');
});

test('000318.11 T5: ссылки на изменённый id резолвятся — 000042 проходит ветвь school, иконка nature_school.svg на диске (nature.svg удалён), spellbook/зеркало синхронны, вложений старого пути нет', () => {
  const schoolPath = path.join(SKILLS_DIR, '000042.json');
  const raw = fs.readFileSync(schoolPath, 'utf8');
  const d = JSON.parse(raw);
  assert.equal(d.id, 'nature_school',
    '000042.json: id «nature_school» (факт: ' + d.id + ')');
  assert.equal(d.name, 'Природа', '000042.json: name «Природа» не меняется');
  assert.equal(d.type, 'school', '000042.json: type «school»');
  assert.deepEqual(Object.keys(d), ['id', 'type', 'name', 'desc', 'icon'],
    '000042.json: канон-порядок ключей ветви school');
  assert.equal(raw, JSON.stringify(d, null, 2) + '\n',
    '000042.json: roundtrip-канон JSON.stringify(obj,null,2)+\\n');
  const schema = readJson(path.join(SKILLS_DIR, 'schema.json'));
  const errs = validateData(schema, d, '000042.json');
  assert.deepEqual(errs, [], '000042.json проходит schema.json: ' + errs.join('; '));
  assert.equal(d.icon, 'assets/school-icons/nature_school.svg',
    '000042.json: icon = assets/school-icons/<id>.svg (контракт '
    + 'spec/skills.md — спека остаётся истинной) (факт: ' + d.icon + ')');
  assert.ok(fs.existsSync(path.join(ROOT, d.icon)),
    'иконка на диске: ' + d.icon);
  assert.ok(!fs.existsSync(path.join(ROOT, 'assets', 'school-icons', 'nature.svg')),
    'assets/school-icons/nature.svg НЕ существует (git mv nature_school.svg)');
  const pb = fs.readFileSync(path.join(ROOT, 'src', 'spellbook.js'), 'utf8');
  assert.match(pb,
    /\{ id: "природа", name: "Природа",\s*\n?\s*icon: "assets\/school-icons\/nature_school\.svg" \}/,
    'src/spellbook.js: вкладка «природа» → nature_school.svg');
  const M = require('../src/skills-data.js');
  const mirrored = M.SCHOOLS.find((s) => s.id === 'nature_school');
  assert.deepEqual(mirrored, d,
    'зеркало src/skills-data.js: SCHOOLS[nature_school] ≡ JSON 000042');
  assert.equal(M.SECONDARY_SKILLS.nature.id, 'nature',
    'зеркало: вторичный SECONDARY_SKILLS.nature цел (ключ не менялся)');
  assert.equal(M.SECONDARY_SKILLS.nature.name, 'Сердце природы',
    'зеркало: вторичный «nature» — «Сердце природы»');
  const stale = [];
  const scan = (dir, skipDirs) => {
    for (const f of fs.readdirSync(dir)) {
      if (skipDirs.includes(f)) continue;
      const p = path.join(dir, f);
      if (p === __filename) continue;
      const st = fs.statSync(p);
      if (st.isDirectory()) { scan(p, skipDirs); continue; }
      if (!/\.(js|json|html|md)$/.test(f)) continue;
      const txt = fs.readFileSync(p, 'utf8');
      if (txt.includes('school-icons/nature.svg')) stale.push(p.slice(ROOT.length + 1));
    }
  };
  for (const d2 of ['src', 'tests', 'assets', 'scripts']) {
    scan(path.join(ROOT, d2), ['node_modules', '.git']);
  }
  assert.deepEqual(stale, [],
    'вложений «school-icons/nature.svg» не осталось; найдено: ' + stale.join(', '));
});
