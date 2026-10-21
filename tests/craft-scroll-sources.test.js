// Задача 000232: источники свитков/чертежей — NPC, сундуки, мобы
// (ТЗ строка 3).
//
// Контракты — memory/000232-craft-learned-kinds.md:
//   D5 — NPC: каждый из 6 чертежей — ≥1 продавец (цена_покупки > 0,
//        количество ≥ 1, статичный сток, RNG 0); НАСТАВНИК вида
//        обязан продавать чертёж этого вида (data-driven по
//        canMentorCraft; сейчас единственный живой наставник крафта
//        — Торн (blacksmith) → кузнечное_дело).
//   D6 — сундуки: каждый чертёж — РОВНО в одном пуле, append КОНЦОМ
//        «предметов» (ref-форма assets/items/NNNNNN.json); простая
//        пещера (id 0) — БЕЗ ИЗМЕНЕНИЙ; зеркало src/dungeons-data.js
//        ≡ JSON (ref→id); FALLBACK_DUNGEONS (src/dungeon.js,
//        DUNGEON_ITEMS) — синхронно 1:1 с зеркалом.
//   D7 — мобы: каждый чертёж — ≥1 лут-таблица (chance 0.05, append
//        КОНЦОМ таблицы, ref-форма); ДВУХФАЙЛОВЫЙ lockstep:
//        assets/mobs/*.json ≡ MOB_TYPES (src/combat.js, id-форма) —
//        sync-скрипта НЕТ, держит deepEqual-зеркальный тест.
//
// КРАСНЫЕ — 3 (expectedRedCount = 3): источники пустые — никто не
// продаёт / пулы без чертежей / лут без чертежей. Зеркальные
// deepEqual-гарды (dungeons-data, MOB_TYPES, FALLBACK) — зелёные с
// рождения (lockstep: правка JSON без зеркала сломает сьют).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../src/craft.js');
const { NPCS } = require('../src/npc-data.js');
const { DUNGEONS } = require('../src/dungeons-data.js');
const DUN = require('../src/dungeon.js');
const { MOB_TYPES } = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');
const { isRef } = require('../scripts/lib/json-ref.js');

const ROOT = path.join(__dirname, '..');
const readJson = (rel) =>
  JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// D-items: чертёж → вид (через якорный рецепт) и → ссылка в assets.
const BLUEPRINT_TYPE = {
  blueprint_forge: 'кузнечное_дело',
  blueprint_alchemy: 'алхимия',
  blueprint_carving: 'резьба_по_камню',
  blueprint_woodwork: 'столярное_дело',
  blueprint_enchant: 'зачарование',
  blueprint_runecraft: 'рунопись',
};
const BLUEPRINT_REF = {
  'assets/items/000077.json': 'blueprint_forge',
  'assets/items/000078.json': 'blueprint_alchemy',
  'assets/items/000079.json': 'blueprint_carving',
  'assets/items/000080.json': 'blueprint_woodwork',
  'assets/items/000081.json': 'blueprint_enchant',
  'assets/items/000082.json': 'blueprint_runecraft',
};

function track() {
  const m = new Map();
  return {
    m,
    push(key, name) {
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(name);
    },
  };
}

test('SRC-1: NPC — каждый из 6 чертежей продаётся ≥1 NPC (цена_покупки > 0, количество ≥ 1); наставник вида — продаёт чертёж этого вида (Торн → кузнечное_дело); RED: чертежей никто не продаёт', () => {
  const t = track();
  for (const n of NPCS) {
    const items = (n.торговля && Array.isArray(n.торговля.предметы))
      ? n.торговля.предметы : [];
    for (const e of items) {
      if (BLUEPRINT_TYPE[e.предмет] === undefined) continue;
      assert.equal(typeof e.цена_покупки, 'number',
        n.имя + ': цена_покупки — число; факт: ' + JSON.stringify(e));
      assert.ok(e.цена_покупки > 0,
        n.имя + ': цена_покупки > 0; факт: ' + e.цена_покупки);
      assert.ok(Number.isInteger(e.количество) && e.количество >= 1,
        n.имя + ': количество ≥ 1; факт: ' + e.количество);
      t.push(e.предмет, n.имя);
    }
  }
  for (const bp of Object.keys(BLUEPRINT_TYPE)) {
    assert.ok(t.m.has(bp),
      bp + ': продаёт ≥1 NPC (краснота: нет продавца); '
      + 'факт: ' + JSON.stringify(t.m.get(bp)));
  }
  // Наставник ⇔ продавец вида (data-driven по canMentorCraft):
  const hero = createCharacter();
  hero.gold = 100000;
  for (const n of NPCS) {
    for (const type of C.CRAFT_TYPES) {
      const chk = C.canMentorCraft(n, hero, type);
      if (!chk.ok) continue;
      const bp = Object.keys(BLUEPRINT_TYPE)
        .find((b) => BLUEPRINT_TYPE[b] === type);
      assert.ok(bp, 'вид «' + type + '» — чертёж существует (D-items)');
      const items = (n.торговля && Array.isArray(n.торговля.предметы))
        ? n.торговля.предметы : [];
      assert.ok(items.some((e) => e.предмет === bp),
        n.имя + ' (' + n.роль + '): наставник «' + type + '» продаёт '
        + bp + ' (краснота: не продаёт)');
    }
  }
});

test('SRC-2: сундуки — каждый из 6 чертежей ≥1 пуле (ref-форма, резолвится в id чертежа); простая пещера (id 0) — БЕЗ чертежей (пул не тронут); зеркало dungeons-data ≡ JSON (ref→id); FALLBACK_DUNGEONS (src/dungeon.js) синхронно 1:1; RED: пулы без чертежей', () => {
  const files = fs.readdirSync(path.join(ROOT, 'assets', 'dungeons'))
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, DUNGEONS.length,
    'пулов — ровно как записей dungeons-data');
  const t = track();
  for (const f of files) {
    const j = readJson('assets/dungeons/' + f);
    const mirror = DUNGEONS.find((d) => d.id === j.id);
    assert.ok(mirror, f + ': запись в dungeons-data (mirror)');
    const items = j.предметы;
    assert.ok(Array.isArray(items), f + ': «предметы» — массив');
    // Lockstep: зеркало ≡ JSON (ref→id) — guard синхронности:
    assert.deepEqual(
      mirror.предметы,
      items.map((ref) => readJson(ref).id),
      f + ': зеркало dungeons-data ≡ JSON (ref→id)');
    for (const ref of items) {
      assert.ok(isRef(ref),
        f + ': предметы — строки-ссылки; факт: ' + JSON.stringify(ref));
      const bp = BLUEPRINT_REF[ref];
      if (bp) t.push(bp, j.название);
    }
    if (j.id === 0) {
      assert.ok(!items.some((ref) => BLUEPRINT_REF[ref]),
        'простая пещера (id 0) — БЕЗ чертежей (D6: пул не тронут)');
    }
  }
  for (const bp of Object.keys(BLUEPRINT_TYPE)) {
    assert.ok(t.m.has(bp),
      bp + ': ≥1 пул сундуков (краснота: нет пула); '
      + 'факт: ' + JSON.stringify(t.m.get(bp)));
    // 000232.01 (D6): presence-цикл — track() пушит на КАЖДОЕ
    // вхождение → единственность: чертёж РОВНО в одном пуле.
    assert.equal(t.m.get(bp).length, 1,
      bp + ': РОВНО в одном пуле (D6, 000232.01); '
      + 'факт: ' + JSON.stringify(t.m.get(bp)));
  }
  // FALLBACK (src/dungeon.js) — синхронно 1:1 с зеркалом:
  for (const d of DUNGEONS) {
    assert.deepEqual(DUN.DUNGEON_ITEMS[d.id], d.предметы,
      'FALLBACK_DUNGEONS пул ' + d.id + ' ≡ зеркало (D6: синхронно)');
  }
});

test('SRC-3: мобы — каждый из 6 чертежей ≥1 лут-таблицы (chance 0.05, append КОНЦОМ таблицы, ref-форма); MOB_TYPES (src/combat.js) ≡ JSON (ref→id) — двухфайловый lockstep; RED: лут без чертежей', () => {
  const files = fs.readdirSync(path.join(ROOT, 'assets', 'mobs'))
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  const t = track();
  for (const f of files) {
    const j = readJson('assets/mobs/' + f);
    const mirror = MOB_TYPES[j.id];
    assert.ok(mirror, j.id + ': запись MOB_TYPES (src/combat.js)');
    const loot = j.loot || [];
    // Lockstep: зеркало ≡ JSON (ref→id) — guard синхронности:
    assert.deepEqual(
      mirror.loot,
      loot.map((e) => ({ item: readJson(e.item).id, chance: e.chance })),
      j.id + ': MOB_TYPES.loot ≡ JSON (ref→id)');
    loot.forEach((e, idx) => {
      assert.ok(isRef(e.item),
        j.id + ': loot[' + idx + '].item — строка-ссылка; '
        + 'факт: ' + JSON.stringify(e.item));
      const bp = BLUEPRINT_REF[e.item];
      if (!bp) return;
      assert.equal(e.chance, 0.05,
        j.id + ': чертёж в луте — chance 0.05 (D7); факт: ' + e.chance);
      assert.equal(idx, loot.length - 1,
        j.id + ': чертёж — append КОНЦОМ лут-таблицы (D7); '
        + 'факт: позиция ' + idx + ' из ' + loot.length);
      t.push(bp, j.id);
    });
  }
  for (const bp of Object.keys(BLUEPRINT_TYPE)) {
    assert.ok(t.m.has(bp),
      bp + ': ≥1 моб с чертежом (краснота: нет источника); '
      + 'факт: ' + JSON.stringify(t.m.get(bp)));
  }
});
