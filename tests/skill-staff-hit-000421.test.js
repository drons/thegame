// Задача 000421 — «Владение посохом» получает потребителя стата
// staffHitBonus (ТЗ tasks/pending/000421.md; контракт —
// memory/000421-staff.md; прецедент wiring — мечник: swordHitBonus в
// derived() + sword-ветка equipmentStats).
//
// До задачи: src/sheet.js derived() не содержит staffHitBonus,
// src/items.js equipmentStats для subtype 'staff' не задаёт hitBonus,
// assets/skills/staff.json — effectType/desc ОТСРОЧЕНО-маркёры,
// spec/skills.md — сноска «(ОТСРОЧЕНО: потребителей стата в коде нет)»
// у строки «Владение посохом», spec/items.md — ряд Оружие утверждает
// «посох — только урон (без бонусов…)».
//
// Осмысленная краснота — ERR_ASSERTION (undefined-ключ derived,
// hitBonus 0 против 0.05·L, ОТСРОЧЕНО-маркёры), НЕ крах загрузки:
// каталоги читаются динамически (fs.readdir), perLevel — из
// SECONDARY_SKILLS.staff.effect, уровень моба — из сцены. Харнес —
// staff-attack-practice-000337 (strongHero + addItem/equip +
// createCombat groupType 3 + standNextTo + attack). Ожидания пробоев —
// формулой hitChance (src/combat.js), граничный метод: c._rng = () => q,
// попадание ⟺ q < clamp(0.55 + 0.03·Δуровней + atkBonus, 0.05, 0.95).

'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCombat } = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');
const I = require('../src/items.js');
const Sheet = require('../src/sheet.js');
const SD = require('../src/skills-data.js');
const { isRef, resolveRef } = require('../scripts/lib/json-ref.js');

const ROOT = path.join(__dirname, '..');
const SKILLS_DIR = path.join(ROOT, 'assets', 'skills');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');

const PER_LEVEL = SD.SECONDARY_SKILLS.staff.effect.perLevel;

// Все дисковые посохи (kind weapon, subtype staff) — динамически
// (ls-доктрина 000397/000410: без числовых литералов-счётчиков).
const staffItems = () => fs.readdirSync(ITEMS_DIR)
  .filter((f) => f !== 'schema.json'
    && /^[a-z][a-z0-9_]*\.json$/.test(f)).sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')))
  .filter((d) => d.kind === 'weapon' && d.subtype === 'staff')
  .map((d) => d.id);

function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// 1:1 из tests/staff-attack-practice-000337.test.js.
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

// Дословно hitChance из src/combat.js (баффы/дебаффы «попадание» на
// голом герое — 0) — ожидания пробоев СЧИТАЮТСЯ формулой, руками не
// выдумываются.
function expectedHitChance(atkLevel, atkBonus, defLevel) {
  return Math.max(0.05,
    Math.min(0.95, 0.55 + 0.03 * (atkLevel - defLevel) + atkBonus));
}

// Один пробой: свежий герой (чистые копилки), оружие itemId (null —
// без оружия), бой groupType 3, c._rng = () => q, attack по units[0].
function probe(q, itemId, secondary) {
  const p = strongHero();
  for (const [id, v] of Object.entries(secondary || {})) p.secondary[id] = v;
  if (itemId) {
    assert.equal(I.addItem(p, itemId).ok, true, itemId + ': выдача');
    assert.equal(I.equip(p, itemId).ok, true, itemId + ': equip');
  }
  const c = createCombat({
    player: p, groupType: 3, seed: 5, width: 7, height: 4,
  });
  c._rng = () => q;
  standNextTo(c, c.units[0]);
  let res;
  try {
    res = c.attack(c.units[0].id);
  } catch (e) {
    assert.fail('attack: ' + e.message + ' (краснота: derived/hitBonus'
      + ' сломаны — бой не должен кидать)');
  }
  assert.equal(res.ok, true, 'атака дошла до броска попадания');
  return { p, c, res };
}

test('000421 T1: derived() содержит ключ staffHitBonus = perLevel·S(staff) (зеркально swordHitBonus; RED: ключа нет — undefined)', () => {
  const base = Sheet.derived(strongHero());
  assert.ok('staffHitBonus' in base,
    'RED: derived() без ключа staffHitBonus');
  assert.equal(base.staffHitBonus, 0, 'без уровня посоха — 0');
  for (const L of [1, 3, 7]) {
    const h = strongHero();
    h.secondary.staff = L;
    assert.equal(Sheet.derived(h).staffHitBonus, PER_LEVEL * L,
      'staffHitBonus = perLevel·S(staff) при S(staff)=' + L);
  }
});

test('000421 T2: equipmentStats — посох даёт hitBonus = staffHitBonus (perLevel·L), dmgBonus 0, damage = stats.damage; меч/лук — прежние ветки (RED: hitBonus 0 при любом L)', () => {
  const staff = staffItems()[0];
  assert.ok(staff, 'на диске есть хотя бы один посох');
  const p = strongHero();
  p.secondary.staff = 6;
  p.secondary.swordsman = 2;
  I.addItem(p, staff);
  I.equip(p, staff);
  const st = I.equipmentStats(p);
  assert.equal(st.subtype, 'staff', staff + ': subtype');
  assert.equal(st.hitBonus, PER_LEVEL * 6,
    'RED: staff-ветка equipmentStats отсутствует — hitBonus ' + st.hitBonus
    + ' вместо ' + PER_LEVEL * 6);
  assert.equal(st.dmgBonus, 0, 'посох — урон без бонуса');
  assert.equal(st.armor, 0, 'посох — без брони');
  I.addItem(p, 'iron_sword');
  I.equip(p, 'iron_sword');
  const stSw = I.equipmentStats(p);
  assert.equal(stSw.hitBonus,
    SD.SECONDARY_SKILLS.swordsman.effect.perLevel * 2,
    'меч — swordHitBonus (уровень посоха 6 его не двигает)');
  I.addItem(p, 'short_bow');
  I.equip(p, 'short_bow');
  const stBow = I.equipmentStats(p);
  assert.equal(stBow.hitBonus,
    SD.SECONDARY_SKILLS.archer.effect.perLevel * (p.secondary.archer || 0),
    'лук — archerHitBonus (staff-уровень не при чём)');
});

test('000421 T3: e2e playerAttack с посохом — hitChance монотонно растёт с уровнем staff и упирается в кап 0.95 (граничные пробои: q === hc → промах, q чуть ниже → попадание)', () => {
  const staff = staffItems()[0];
  const levels = [0, 1, 2, 3, 4, 5];
  const thresholds = [];
  for (const L of levels) {
    const { p, c } = probe(0.99, staff, { staff: L });
    const hc = expectedHitChance(p.level, PER_LEVEL * L, c.units[0].level);
    assert.ok(hc < 0.95,
      'проба монотонности на L=' + L + ' должна быть вне капа (hc=' + hc + ')');
    thresholds.push(hc);
    assert.equal(probe(hc, staff, { staff: L }).res.hit, false,
      'L=' + L + ': q === hc — промах (строгое >= в combat.js)');
    assert.equal(probe(hc - 1e-6, staff, { staff: L }).res.hit, true,
      'L=' + L + ': q чуть ниже hc — попадание');
  }
  for (let i = 1; i < thresholds.length; i++) {
    assert.ok(thresholds[i] > thresholds[i - 1],
      'монотонность: hc(L=' + levels[i] + ')=' + thresholds[i]
      + ' > hc(L=' + levels[i - 1] + ')=' + thresholds[i - 1]);
  }
  // Кап: высокий уровень посоха обязан упираться ровно в 0.95.
  const L = 20;
  const capScene = probe(0.99, staff, { staff: L });
  const raw = 0.55 + 0.03 * (capScene.p.level - capScene.c.units[0].level)
    + PER_LEVEL * L;
  assert.ok(raw > 0.95,
    'без капа hc=' + raw + ' — проба капа была бы бессмысленна');
  assert.equal(probe(0.9499, staff, { staff: L }).res.hit, true,
    'кап 0.95: q=0.9499 — попадание');
  assert.equal(probe(0.95, staff, { staff: L }).res.hit, false,
    'кап 0.95: q=0.95 — промах (RED: cap 0.99 — попал бы)');
});

test('000421 T4: регресс-гейт боевой формулы — меч/кулаки/тяжёлое бьют бит-в-бит по-прежнему (staffHitBonus их не касается; фолбэк без оружия — swordHitBonus)', () => {
  for (const staffL of [0, 20]) {
    const { p, c } = probe(0.99, 'iron_sword',
      { swordsman: 3, staff: staffL });
    const hc = expectedHitChance(p.level,
      SD.SECONDARY_SKILLS.swordsman.effect.perLevel * 3, c.units[0].level);
    assert.equal(probe(hc, 'iron_sword',
      { swordsman: 3, staff: staffL }).res.hit, false,
      'меч (staff=' + staffL + '): q === hc — промах');
    assert.equal(probe(hc - 1e-6, 'iron_sword',
      { swordsman: 3, staff: staffL }).res.hit, true,
      'меч (staff=' + staffL + '): q ниже hc — попадание');
  }
  {
    const { p, c } = probe(0.99, null, { staff: 20 });
    const hc = expectedHitChance(p.level, 0, c.units[0].level);
    assert.equal(probe(hc, null, { staff: 20 }).res.hit, false,
      'кулаки при staff=20: граница НЕ сдвинута (фолбэк swordHitBonus=0)');
    assert.equal(probe(hc - 1e-6, null, { staff: 20 }).res.hit, true,
      'кулаки: попадание ровно под старой границей');
  }
  {
    const heavy = fs.readdirSync(ITEMS_DIR)
      .filter((f) => f !== 'schema.json'
        && /^[a-z][a-z0-9_]*\.json$/.test(f))
      .map((f) => JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8')))
      .find((d) => d.kind === 'weapon' && d.subtype === 'heavy');
    assert.ok(heavy, 'на диске есть тяжёлое оружие');
    const p = strongHero();
    p.secondary.staff = 20;
    I.addItem(p, heavy.id);
    I.equip(p, heavy.id);
    const st = I.equipmentStats(p);
    assert.equal(st.hitBonus, 0,
      heavy.id + ': тяжёлое — hitBonus 0 (staff-уровень не при чём)');
    assert.equal(st.dmgBonus,
      SD.SECONDARY_SKILLS.heavy.effect.perLevel * (p.secondary.heavy || 0),
      heavy.id + ': dmgBonus = heavyDamageBonus (прежняя ветка)');
  }
});

test('000421 T5: assets/skills/staff.json — effectType/desc больше не ОТСРОЧЕНО; зеркало src/skills-data.js перегенерировано 1:1 (RED: маркёры на месте)', () => {
  const file = path.join(SKILLS_DIR, 'staff.json');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(j.effectType, 'Бой',
    'RED: effectType остаётся «' + j.effectType + '» (прецедент swordsman.json)');
  assert.equal(j.desc, '+5% вероятность попадания посохом за уровень',
    'RED: desc остаётся «' + j.desc + '»');
  const raw = fs.readFileSync(file, 'utf8');
  assert.equal(raw.includes('ОТСРОЧЕНО'), false,
    'RED: в staff.json остался ОТСРОЧЕНО-маркёр');
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
  }, 'RED: зеркало skills-data.js отстало от JSON (нужен sync-skills-data)');
});

test('000421 T6 (ре-пин 000422): spec/skills.md — сноска ОТСРОЧЕНО снята и у «Владение посохом» (000421), и у «Акробатика» (000422); маркёр «потребителей стата в коде нет» = 0', () => {
  const src = fs.readFileSync(path.join(ROOT, 'spec', 'skills.md'), 'utf8');
  const rows = src.split('\n');
  assert.equal(src.split('потребителей стата в коде нет').length - 1, 0,
    'RED: маркёр «потребителей стата в коде нет» снят 000422 и у '
    + '«Акробатика» (acroBonus получил горного потребителя); '
    + 'фактических вхождений: '
    + (src.split('потребителей стата в коде нет').length - 1));
  const staffRow = rows.find((r) => r.includes('Владение посохом'));
  assert.ok(staffRow, 'строка «Владение посохом» в таблице');
  assert.equal(staffRow.includes('ОТСРОЧЕНО'), false,
    'RED: строка посоха несёт ОТСРОЧЕНО-сноску: ' + staffRow);
  assert.ok(staffRow.includes('вероятность попадания посохом'),
    'строка посоха описывает реализованное влияние: ' + staffRow);
  const acroRow = rows.find((r) => r.includes('Акробатика'));
  assert.ok(acroRow, 'строка «Акробатика» в таблице');
  assert.equal(acroRow.includes('ОТСРОЧЕНО'), false,
    'RED: acro-строка обязана быть без ОТСРОЧЕНО (000422): ' + acroRow);
  assert.ok(acroRow.includes('взойти в горы'),
    'acro-строка обязана описывать горный потребитель (000422): ' + acroRow);
});

test('000421 T7: spec/items.md — ряд Оружие больше не лжёт «посох — только урон (без бонусов…)»; новая форма в той же строке (line-neutral, без trailing-переноса)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'spec', 'items.md'), 'utf8');
  assert.equal(src.includes('посох — только урон'), false,
    'RED: старая ложная формулировка ряда Оружие ещё в spec/items.md');
  const weaponRow = src.split('\n').find((r) => r.startsWith(' | Оружие |'));
  assert.ok(weaponRow, 'ряд Оружие на месте');
  assert.equal(weaponRow.includes('ОТСРОЧЕНО'), false,
    'в ряду Оружие не появилось ОТСРОЧЕНО: ' + weaponRow);
  assert.ok(weaponRow.includes('посох — попадание «Владение посохом»'),
    'новая форма (попадание «Владение посохом»): ' + weaponRow);
  assert.equal(src.endsWith('\n'), false,
    'items.md остаётся БЕЗ trailing-\\n (c9-зуб: trailingNL false)');
});
