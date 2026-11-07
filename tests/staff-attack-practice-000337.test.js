// Задача 000337 — практика за удары посохом (баг из ретро b5-20261107,
// tasks/result/000325-retro-b5-20261107.md; ТЗ tasks/pending/000337.md;
// контракт memory/000337-staff-practice.md).
//
// RED (TDD): attackSkillId (src/combat.js:266) для subtype 'staff'
// возвращает 'staff' (src/combat.js:270), но навыка 'staff' в каталоге
// assets/skills НЕТ → Sheet.practice (src/sheet.js:369) тихо отказывает
// «неизвестный навык: staff» и practice.applied = 0 (src/sheet.js:378)
// — опыт за попадания посохом теряется. Фикс (решение дизайнера (a)):
// новый вторичный навык staff «Владение посохом» + зеркало.
//
// Осмысленная краснота — ERR_ASSERTION («applied 0 вместо 3», «id staff
// вне каталога», «SECONDARY_SKILLS.staff undefined»), НЕ крах загрузки:
// все каталоги читаются динамически (fs.readdir), файл навыка ищется по
// id среди файлов каталога.
//
// Красные: T1 (applied 0, «неизвестный навык» в причине), T2 (sweep:
// литерал 'staff' из attackSkillId вне каталога), T3 (файла/зеркала нет),
// T4 (все дисковые посохи — applied 0). Харнес — 1:1 путь R10
// combat.test.js (strongHero + addItem/equip + createCombat groupType 3
// + c._rng=()=>0.01 + standNextTo + attack).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCombat, PRACTICE_XP } = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');
const I = require('../src/items.js');
const Sheet = require('../src/sheet.js');
const SD = require('../src/skills-data.js');
const { isRef, resolveRef } = require('../scripts/lib/json-ref.js');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

// Каталог id навыков — с диска (без канареек: рост каталога не ломает
// тест, разрыв ловит подмножество-проверка).
const skillIdsFromDisk = () => new Set(
  fs.readdirSync(SKILLS_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .map((f) => JSON.parse(
      fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8')).id));

const skillFileById = (id) => {
  for (const f of fs.readdirSync(SKILLS_DIR)
    .filter((x) => /^\d{6}\.json$/.test(x)).sort()) {
    const j = JSON.parse(fs.readFileSync(path.join(SKILLS_DIR, f), 'utf8'));
    if (j.id === id) return { file: f, data: j };
  }
  return null;
};

// Все дисковые посохи (kind weapon, subtype staff) — динамически.
const staffItems = () => fs.readdirSync(ITEMS_DIR)
  .filter((f) => /^\d{6}\.json$/.test(f)).sort()
  .map((f) => ({
    file: f,
    data: JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')),
  }))
  .filter(({ data }) => data.kind === 'weapon' && data.subtype === 'staff')
  .map(({ file, data }) => ({ file, id: data.id }));

function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// 1:1 из tests/combat.test.js (игрок — c.px/c.py, НЕ юнит в c.units).
function standNextTo(c, u) {
  const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
  const taken = (x, y) => c.units.some((v) => v.alive && !v.fled
    && x >= v.x && x < v.x + ((v.size && v.size.w) || 1)
    && y >= v.y && y < v.y + ((v.size && v.size.h) || 1));
  const candidates = [];
  for (let x = u.x - 1; x <= u.x + w; x++) {
    candidates.push([x, u.y - 1], [x, u.y + h]);
  }
  for (let y = u.y; y < u.y + h; y++) {
    candidates.push([u.x - 1, y], [u.x + w, y]);
  }
  const near = (x, y) => {
    const dx = x < u.x ? u.x - x : (x > u.x + w - 1 ? x - (u.x + w - 1) : 0);
    const dy = y < u.y ? u.y - y : (y > u.y + h - 1 ? y - (u.y + h - 1) : 0);
    return dx + dy <= 1;
  };
  const spot = candidates.find(([x, y]) =>
    x >= 0 && y >= 0 && x < c.width && y < c.height && !taken(x, y)
    && !(c.obstacles && c.obstacles.has(x + ',' + y)) && near(x, y));
  assert.ok(spot, 'нет свободной клетки рядом с мобом');
  c.px = spot[0];
  c.py = spot[1];
}

// Попадание посохом через РЕАЛЬНЫЙ путь playerAttack (combat.js:1534 —
// skillPractice(p, attackSkillId(eq), PRACTICE_XP.hit)).
function staffHitPractice(itemId) {
  const p = strongHero();
  assert.equal(I.addItem(p, itemId).ok, true, itemId + ': выдача');
  assert.equal(I.equip(p, itemId).ok, true, itemId + ': equip');
  const c = createCombat({
    player: p, groupType: 3, seed: 5, width: 7, height: 4,
  });
  c._rng = () => 0.01; // попадание гарантировано
  standNextTo(c, c.units[0]);
  const res = c.attack(c.units[0].id);
  assert.equal(res.ok, true, itemId + ': атака');
  assert.equal(res.hit, true, itemId + ': попадание');
  return { p, res };
}

test('000337 T1: попадание посохом (реальный ember_staff 000345) через playerAttack — practice.skill ∈ каталога assets/skills И applied = PRACTICE_XP.hit > 0, опыт в копилке; прямой Sheet.practice(staff) — ok без причины «неизвестный навык» (RED: applied 0 + «неизвестный навык: staff»)', () => {
  const ids = skillIdsFromDisk();
  const { p, res } = staffHitPractice('ember_staff');
  assert.equal(res.practice.skill, 'staff',
    'attackSkillId для subtype staff — маркер «staff» (D-02 сохраняется)');
  assert.ok(ids.has(res.practice.skill),
    'practice.skill «' + res.practice.skill + '» ДОЛЖЕН быть id навыка '
    + 'из каталога assets/skills (RED: навыка staff в каталоге нет — '
    + 'практика тихо теряется)');
  assert.equal(res.practice.xp, PRACTICE_XP.hit, 'xp = hit');
  assert.ok(res.practice.applied > 0,
    'applied > 0 (RED: applied ' + res.practice.applied
    + ' — тихий отказ «неизвестный навык: staff»)');
  assert.equal(res.practice.applied, PRACTICE_XP.hit,
    'applied = PRACTICE_XP.hit (копилка пуста, порог 15 — весь опыт принят)');
  assert.equal(res.practice.level, 0, 'level 0 (3 < skillXpForNext(0) = 15)');
  assert.equal(p.skillXp[res.practice.skill], PRACTICE_XP.hit,
    'опыт записан в копилку навыка практики');

  const fresh = createCharacter();
  const pr = Sheet.practice(fresh, 'staff', PRACTICE_XP.hit);
  assert.equal(pr.ok, true,
    'Sheet.practice(staff) — ok (RED: ok=false, reason='
    + JSON.stringify(pr.reason) + ')');
  assert.equal(pr.reason, undefined,
    'причины «неизвестный навык» быть не должно (RED: reason='
    + JSON.stringify(pr.reason) + ')');
  assert.equal(pr.applied, PRACTICE_XP.hit, 'прямой practice — applied 3');
  assert.equal(fresh.skillXp.staff, PRACTICE_XP.hit, 'копилка staff = 3');
});

test('000337 T2: sweep-гард регресса — ВСЕ литеральные id, возвращаемые attackSkillId (swordsman/archer/heavy/staff/fists-ветки), ∈ каталогу assets/skills (RED: staff вне каталога; ловит будущий разрыв того же класса)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src', 'combat.js'), 'utf8');
  const m = src.match(/function attackSkillId\(eq\)\s*\{[\s\S]*?\n  \}/);
  assert.ok(m,
    'attackSkillId найдена в src/combat.js (text-extract — паттерн '
    + '000325 T1; при реформате — обновить свип)');
  const literals = [...m[0].matchAll(/return\s+'([a-z_]+)'/g)]
    .map((x) => x[1]);
  assert.ok(literals.length >= 5,
    'свип нашёл литералы return (swordsman/archer/heavy/staff/fists): '
    + JSON.stringify(literals));
  const ids = skillIdsFromDisk();
  const missing = literals.filter((id) => !ids.has(id));
  assert.deepEqual(missing, [],
    'attackSkillId возвращает id вне каталога assets/skills: '
    + JSON.stringify(missing) + ' — Sheet.practice тихо откажет '
    + '«неизвестный навык» (RED: staff)');
});

test('000337 T3: зеркало src/skills-data.js содержит SECONDARY_SKILLS.staff 1:1 к JSON каталога (primary-resolved, requires:null — паттерн T4 000325) (RED: файла навыка staff/записи зеркала нет)', () => {
  const found = skillFileById('staff');
  assert.ok(found,
    'RED: файл навыка с id «staff» отсутствует в assets/skills '
    + '(решение (a): новый secondary «Владение посохом»)');
  const j = found.data;
  assert.equal(j.type, 'secondary', found.file + ': secondary');
  assert.ok(SD.SECONDARY_SKILLS.staff,
    'RED: SECONDARY_SKILLS.staff отсутствует в зеркале src/skills-data.js');
  const mirror = SD.SECONDARY_SKILLS.staff;
  const expectedPrimary = isRef(j.primary)
    ? resolveRef(ROOT, j.primary).id : j.primary;
  const expectedRequires = j.requires
    ? { skill: resolveRef(ROOT, j.requires.skill).id, level: j.requires.level }
    : null;
  assert.deepEqual(mirror, {
    id: j.id,
    type: j.type,
    name: j.name,
    primary: expectedPrimary,
    requires: expectedRequires,
    effect: j.effect,
    effectType: j.effectType,
    desc: j.desc,
    names: j.names,
  }, found.file + ': зеркало SECONDARY_SKILLS.staff ≡ JSON (primary/requires — резолвятся sync-скриптом)');
});

test('000337 T4: все дисковые посохи (kind weapon, subtype staff) — попадание даёт applied = PRACTICE_XP.hit > 0 в копилку навыка практики (динамический ростер — на случай новых посохов; RED: applied 0 у каждого)', () => {
  const staffs = staffItems();
  assert.ok(staffs.length >= 7,
    'на диске не менее 7 посохов (волна 000230.12): найдено '
    + staffs.length);
  for (const { id } of staffs) {
    const { p, res } = staffHitPractice(id);
    assert.equal(res.practice.skill, 'staff', id + ': skill «staff»');
    assert.ok(res.practice.applied > 0,
      id + ': applied > 0 (RED: ' + res.practice.applied
      + ' — тихий отказ практики)');
    assert.equal(res.practice.applied, PRACTICE_XP.hit,
      id + ': applied = PRACTICE_XP.hit');
    assert.equal(p.skillXp.staff, PRACTICE_XP.hit,
      id + ': опыт в копилке skillXp.staff');
  }
});
