// Задача 000347.02: «Торговля свитками в Храмах и Магазине магии» —
// ассортиментная часть 000347 (ценовая — 000347.01, уже в мастерe:
// memory/000347-scroll-prices-magic.md, резолвер spellScrollPriceMult).
//
// Контракт (ТЗ tasks/pending/000347.02.md; профиль NPC — батч 000320,
// прецедент .20; формат торговли — 000322; цены — 000322+000346+000347.01):
//   * ТРИ новых жреца — 000039/000040/000041 подряд (резерв волны
//     000039–000044, ровно 3, дыш запрещены): жрец Храма солнца
//     sun_priest «Яровит» → 26 свитков исцеления (temple, id 36);
//     жрица Храма луны moon_priestess «Велена» → 27 свитков тени
//     (moon_temple, id 37); жрец Храма горы mountain_priest «Утёс» →
//     54 свитка природа+защита (mountain_temple, id 38). Привязка
//     ЧИСТО data-driven (NPC.постройки + строки «Диалог: <имя>»
//     building-effects); КОД src/ задачу не решает вообще.
//   * Пергамент (000033) — ассортимент → боевая элементалика: РОВНО
//     огонь+лёд = 54 свитка; light_heal_scroll ПЕРЕНОС к солнцу
//     (строгий профиль лавки; дубль отвергнут оркестратором).
//   * ПОКРЫТИЕ: каждый из 161 spell_scroll каталога — РОВНО у ОДНОГО
//     продавца, школа→продавец по таблице (54/26/27/54); прочие NPC
//     свитков НЕ торгуют.
//   * ВАРИАНТ Е1 (фикс оркестратора, прецедент 000320.15): у ВСЕХ
//     свитков в торговле «base_price»: value ПОСЛЕ value (канон KEYS
//     sync-items-data.js:95) ⇒ 158 файлов +1 ключ, инвариант R1
//     000322 «base_price у каждого торгуемого» НЕ ослабляется
//     (44 → 202); 000043/45/48 уже были — 0-diff.
//   * цены жрецов/Пергамента — формула .347.01:
//     max(1, round((base_price??value) × 8^(уровень−1) × mult × derived));
//     уровни в T5 берутся ЛОКАЛЬНО с assets/spells/*.json (анти-
//     самоуспокоение .346/.347.01 — не через резолвер).
//   * негативы: abandoned_temple (id 39) — NPC null by design; mult_покупки
//     у жрецов — ключ ОТСУТСТВУЕТ; диалоги — запрет-лист 67 подстрок
//     (весь дисковый список .20 T5 (63 с 000364 — уже с живым
//     «храме солнца», тема Милы 000003.json) + 4 резерва Барыша из
//     memory/000320-caravan_trader.md для .21+; set-равен списку T5 .21;
//     мёртвый pre-000360 литерал «храм солнц» не входит ни в один
//     живой список (правило memory/000364-npc20-t5-matcher.md);
//     4 своих оборота жрецов зарезервированы в memory и к СВОИМ текстам
//     не применяются).
//
// КРАСНЫЕ (TDD): T1–T8 краснеют ОСМЫСЛЕННЫМИ ERR_ASSERTION до зелёной
// стадии (жрецов нет, каталог 38, base_price у 44, Пергамент — 3 свитка),
// без краха загрузки: сначала existsSync/зеркало, потом чтение.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const IDIR = path.join(ROOT, 'assets', 'items');
const SPDIR = path.join(ROOT, 'assets', 'spells');
const BDIR = path.join(ROOT, 'assets', 'buildings');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));
const ITEM_SCHEMA = JSON.parse(
  fs.readFileSync(path.join(IDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const { ITEMS } = require('../src/items-data.js');
const BE = require('../src/building-effects.js');
const P = require('../src/player.js');

const SUN = {
  file: '000039.json', id: 'sun_priest', name: 'Яровит',
  building: 'temple.json', buildingId: 36, count: 26,
  schools: ['исцеление'],
};
const MOON = {
  file: '000040.json', id: 'moon_priestess', name: 'Велена',
  building: 'moon_temple.json', buildingId: 37, count: 27,
  schools: ['тень'],
};
const MOUNTAIN = {
  file: '000041.json', id: 'mountain_priest', name: 'Утёс',
  building: 'mountain_temple.json', buildingId: 38, count: 54,
  schools: ['природа', 'защита'],
};
const NEWNPCS = [SUN, MOON, MOUNTAIN];
const SCROLL_SELLERS = ['scroll_merchant', SUN.id, MOON.id, MOUNTAIN.id];
const SCHOOL_SELLER = {
  'огонь': 'scroll_merchant', 'лёд': 'scroll_merchant',
  'исцеление': SUN.id, 'тень': MOON.id,
  'природа': MOUNTAIN.id, 'защита': MOUNTAIN.id,
};
const SELLER_COUNT = {
  scroll_merchant: 54, [SUN.id]: 26, [MOON.id]: 27, [MOUNTAIN.id]: 54,
};

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Локальная таблица: spell id → {школа, уровень} ПРЯМО с assets/spells
// (анти-самоуспокоение .346/.347.01: не через spellCatalog/резолвер/зеркало).
function localSpellTable() {
  const t = {};
  for (const f of fs.readdirSync(SPDIR)) {
    if (!/^\S+\.json$/.test(f) || f === 'schema.json') continue;
    const sp = readJson(path.join(SPDIR, f));
    if (!sp || typeof sp.id !== 'string') continue;
    t[sp.id] = { school: sp['школа'], level: sp['уровень'] };
  }
  return t;
}

function diskScrolls() {
  const spells = localSpellTable();
  const out = {};
  for (const f of fs.readdirSync(IDIR)) {
    if (!/^\d{6}\.json$/.test(f)) continue;
    const it = readJson(path.join(IDIR, f));
    if (it.kind !== 'spell_scroll') continue;
    out[it.id] = {
      file: f,
      school: spells[it.effect.spell].school,
      level: spells[it.effect.spell].level,
      value: it.value,
    };
  }
  return out;
}

// sellerId → Set(item id) по ДИСКУ (все NPC; свитковые продавцы — свои)
function scrollAssortments() {
  const scrolls = diskScrolls();
  const bySeller = {};
  for (const f of listNpcFiles()) {
    const npc = readJson(path.join(NDIR, f));
    const list = npc.торговля && npc.торговля.предметы;
    if (!Array.isArray(list)) continue;
    for (const e of list) {
      const it = readJson(path.join(ROOT, e.предмет));
      if (!scrolls[it.id]) continue;
      (bySeller[npc.id] = bySeller[npc.id] || new Set()).add(it.id);
    }
  }
  return bySeller;
}

const charWithMerchant = (lvl) => {
  const c = P.createCharacter();
  c.secondary.merchant = lvl;
  return c;
};

// запрет-лист ТЕКСТОВ диалога жрецов: 67 = весь дисковый список .20 T5
// (63 с 000364 — уже с живым «храме солнца», тема Милы 000003.json
// стоит в самом списке .20; мёртвый pre-000360 литерал «храм солнц»
// не входит ни в один живой список — memory/000364-npc20-t5-matcher.md)
// + 4 резерва Барыша (memory/000320-caravan_trader.md для .21+;
// set-равен списку T5 .21). СВОИ обороты жрецов (резерв для будущих батчей,
// memory/000347-temple-scroll-trade.md: «с солнечной полки», «у этой
// залы слух длинный», «гора лишних слов не держит», «про спуск») к
// СВОИМ текстам не применяются (правило «к своему хуку запрет-лист не
// применяется» — .20), поэтому в списке ниже их нет.
const FORBIDDEN = [
  'храме солнца',
  'хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
  'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
  'метл', 'стена клинков', 'звон', 'дребезг', 'нагрудник', 'закалк',
  'трещин', 'молотк', 'примеря',
  'старые дела', 'старейшин', 'посмееш',
  'на весах', 'сонной мяты', 'клонит в сон',
  'завянет', 'пучками', 'почерневш', 'разотрёшь',
  'где болит', 'выше раны', 'доживают до старости',
  'не бывает лишнего', 'с далёких гор', 'договоримся о цене',
  'между строк', 'при дневном свете', 'чернила помнят',
  'прощает торопливому', 'из-под пальцев', 'выберем тебе школу',
  'описк', 'чистовик', 'по концу листа', 'копию без торгу', 'вкривь',
  'кормит', 'от кузницы до кузницы', 'не пожалеешь',
  'пока повозка полная',
  'на дневку', 'сколько сгрузил', 'ближе к холке',
  'сырьё кончается', 'спрашивай про руду',
  'то в моих вьюках', 'ищи меня',
  'до площади раньше колокола', 'понюхай сначала',
  'каменная соль', 'в самом конце',
  'три металла на прилавке', 'три монеты в коше',
  'два языка служат', 'монету берут на глаз',
];

// --- T1: покрытие — каждый свиток РОВНО у одного продавца ------------------

test('T1: покрытие 161 spell_scroll — РОВНО один продавец на свиток; таблица школа→продавец (огонь+лёд 54 Пергамент, исцеление 26 солнце, тень 27 луна, природа+защита 54 гора); свитковые продавцы торгуют ТОЛЬКО своими школами; прочие NPC свитков НЕ торгуют', () => {
  const scrolls = diskScrolls();
  assert.equal(Object.keys(scrolls).length, 161,
    'каталог spell_scroll — 161 (ре-пин 000348); факт: '
    + Object.keys(scrolls).length);
  const bySeller = scrollAssortments();
  const sellers = Object.keys(bySeller).sort();
  assert.deepEqual(sellers, [...SCROLL_SELLERS].sort(),
    'свитками торгуют РОВНО ЧЕТЫРЕ продавца {scroll_merchant, '
    + 'sun_priest, moon_priestess, mountain_priest}, факт: '
    + JSON.stringify(sellers));
  const seen = new Map();
  for (const seller of SCROLL_SELLERS) {
    const own = bySeller[seller];
    assert.ok(own, 'продавец в торговле: ' + seller
      + ' (RED: жрец не создан / Пергамент без ассорта?)');
    assert.equal(own.size, SELLER_COUNT[seller],
      seller + ': витрина РОВНО ' + SELLER_COUNT[seller]
      + ' свитков (покрытие 54/26/27/54); факт: ' + own.size);
    const want = Object.keys(SCHOOL_SELLER)
      .filter((s) => SCHOOL_SELLER[s] === seller);
    for (const id of own) {
      assert.ok(want.includes(scrolls[id].school),
        seller + ': продаёт ТОЛЬКО свои школы ' + JSON.stringify(want)
        + ', а в витрине ' + id + ' школы «' + scrolls[id].school + '»');
      seen.set(id, (seen.get(id) || 0) + 1);
    }
  }
  for (const [id, sc] of Object.entries(scrolls)) {
    assert.equal(seen.get(id) || 0, 1,
      id + ': свиток продаёт РОВНО ОДИН продавец (школьная таблица '
      + '→ ' + SCHOOL_SELLER[sc.school] + '); факт: '
      + (seen.get(id) || 0));
  }
});

// --- T2: три новых NPC — схема/ключи/roundtrip/уникальности/зеркало --------

test('T2: assets/npc/000039/40/41 — существуют, валидны по схеме; ключи в порядке эталона торговли (id, имя, роль, описание, постройки, диалог, торговля); roundtrip-канон; id/имя/описание — свип-уникальны по каталогу; зеркало NPCS резолвит постройки в [36]/[37]/[38], торговля — в id, диалог/описание deepEqual', () => {
  const allNames = [];
  const allIds = [];
  const allDesc = [];
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    allNames.push(d.имя); allIds.push(d.id);
    if (d.описание) allDesc.push(d.описание);
  }
  for (const s of NEWNPCS) {
    const file = path.join(NDIR, s.file);
    assert.ok(fs.existsSync(file),
      'RED: assets/npc/' + s.file + ' отсутствует (жрец не создан)');
    const raw = fs.readFileSync(file, 'utf8');
    const data = JSON.parse(raw);
    assert.deepEqual(validateData(SCHEMA, data, 'npc/' + s.file), [],
      s.file + ': обязан проходить assets/npc/schema.json');
    assert.deepEqual(Object.keys(data),
      ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
      s.file + ': порядок ключей — эталон торговли .15/.18/.19/.20; '
      + 'факт: ' + JSON.stringify(Object.keys(data)));
    assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
      s.file + ': roundtrip-канон JSON.stringify(obj,null,2)+перевод строки');
    assert.equal(data.id, s.id, s.file + ': id = ' + s.id);
    assert.equal(data.имя, s.name, s.file + ': имя = ' + s.name);
    assert.deepEqual(data.постройки,
      ['assets/buildings/' + s.building],
      s.file + ': постройка — slug-ссылка ' + s.building);
    assert.equal(allIds.filter((x) => x === s.id).length, 1,
      'id ' + s.id + ' — уникален по каталогу');
    assert.equal(allNames.filter((x) => x === s.name).length, 1,
      'имя «' + s.name + '» — уникально по каталогу');
    assert.equal(allDesc.filter((x) => x === data.описание).length, 1,
      'описание ' + s.file + ' — уникально (без копипасты)');
    const mirror = NPCS.find((n) => n.id === s.id);
    assert.ok(mirror, 'зеркало NPCS: запись ' + s.id + ' (sync не прогнан?)');
    assert.deepEqual(mirror.постройки, [s.buildingId],
      'зеркало: постройки [' + s.buildingId + '] — sync резолвит ссылку');
    assert.deepEqual(mirror.диалог, data.диалог,
      'зеркало ' + s.id + '.диалог ≡ JSON бит-в-бит');
    assert.deepEqual(mirror.описание, data.описание,
      'зеркало ' + s.id + '.описание ≡ JSON');
    assert.deepEqual(mirror.торговля.предметы.map((e) => e.предмет).sort(),
      data.торговля.предметы.map((e) => {
        const it = readJson(path.join(ROOT, e.предмет));
        return it.id;
      }).sort(),
      'зеркало ' + s.id + ': торговля резолвится путь→id (161-й контракт sync)');
  }
});

// --- T3: привязка храмов и [E]-строки; негатив abandoned_temple ------------

test('T3: npcsForBuilding(36/37/38) — жрец в порядке каталога (в храме солнца 36 — ВТОРЫМ после Элдир «elder», в 37/38 — ПЕРВЫМ); buildingActions — «dialog:sun_priest» «Диалог: Яровит», у 37/38 «dialog» «Диалог: Велена/Утёс»; НЕГАТИВ: abandoned_temple (39) — npcsForBuilding пуст (NPC null by design, не трогать)', () => {
  assert.deepEqual(N.npcsForBuilding(NPCS, 36).map((n) => n.id),
    ['elder', SUN.id],
    'храм солнца 36: два NPC — Элдира (000010, elder) ПЕРВАЯ по номеру '
    + 'файла, Яровит (000039) ВТОРОЙ; факт: '
    + JSON.stringify(N.npcsForBuilding(NPCS, 36).map((n) => n.id)));
  for (const s of [MOON, MOUNTAIN]) {
    assert.deepEqual(N.npcsForBuilding(NPCS, s.buildingId).map((n) => n.id),
      [s.id],
      'храм ' + s.buildingId + ': РОВНО один NPC — ' + s.id + '; факт: '
      + JSON.stringify(N.npcsForBuilding(NPCS, s.buildingId).map((n) => n.id)));
  }
  for (const s of NEWNPCS) {
    const list = N.npcsForBuilding(NPCS, s.buildingId);
    assert.ok(list.some((n) => n.id === s.id),
      'храм ' + s.buildingId + ': жрец ' + s.id + ' в списке постройки '
      + '(RED: жрец не привязан)');
    const b = readJson(path.join(BDIR, s.building));
    assert.equal(b.id, s.buildingId, s.building + ': id постройки');
    const rows = BE.buildingActions(b, list, { day: 5 });
    assert.ok(rows.length > 0,
      'храм ' + s.buildingId + ': [E]-список непустой (RED: жрец не привязан)');
    const mine = rows.filter((r) => r.npcId === s.id);
    assert.equal(mine.length, 1,
      'храм ' + s.buildingId + ': ровно одна строка «Диалог: ' + s.name + '»');
    assert.equal(mine[0].имя, 'Диалог: ' + s.name,
      'храм ' + s.buildingId + ': подпись «Диалог: ' + s.name
      + '»; факт: ' + mine[0].имя);
    if (s.buildingId === 36) {
      assert.equal(mine[0].id, 'dialog:' + SUN.id,
        'храм 36: жрец — НЕ первый NPC (Элдира занимает «dialog»), '
        + 'её id «dialog:sun_priest»');
      assert.equal(rows[0].id, 'dialog',
        'храм 36: первая строка — «dialog» (Элдира — HUD/роутер не тронуты)');
      assert.equal(rows[0].имя, 'Диалог: Элдира',
        'храм 36: «Диалог» первой строки — Элдира (pin B17/B20); факт: '
        + rows[0].имя);
    } else {
      assert.equal(mine[0].id, 'dialog',
        'храм ' + s.buildingId + ': жрец — ПЕРВАЯ строка «dialog» '
        + '(RED: до задачи «Диалога» у ' + s.buildingId + ' нет)');
    }
  }
  const abandoned = readJson(path.join(BDIR, 'abandoned_temple.json'));
  assert.equal(abandoned.id, 39, 'abandoned_temple — id 39');
  assert.deepEqual(N.npcsForBuilding(NPCS, 39), [],
    'abandoned_temple — NPC НЕ привязан (null by design — босс/ловушки/реликвия)');
});

// --- T4: base_price-инвариант Е1 — 158 вставок, позиция, зеркало -----------

test('T4: base_price — РОВНО у 202 предметов каталога; у 161 свитка base_price === value и ПОСЛЕ value (raw-текст и KEYS); 000043/45/48 не тронуты (60/45/70); 41 не-свитковый торг — без изменений; зеркало items-data несёт base_price в той же позиции', () => {
  let withBase = 0;
  const scrolls = diskScrolls();
  for (const f of fs.readdirSync(IDIR)) {
    if (!/^\d{6}\.json$/.test(f)) continue;
    const file = path.join(IDIR, f);
    const raw = fs.readFileSync(file, 'utf8');
    const it = JSON.parse(raw);
    if (!('base_price' in it)) {
      assert.equal(raw.includes('"base_price"'), false,
        f + ': «base_price» в raw без ключа в объекте?');
      continue;
    }
    withBase++;
    assert.deepEqual(validateData(ITEM_SCHEMA, it, f), [],
      f + ': с base_price обязан проходить схему items');
    const keys = Object.keys(it);
    assert.equal(keys.indexOf('base_price'), keys.indexOf('value') + 1,
      f + ': base_price ПОСЛЕ value (канон KEYS sync-items-data.js); '
      + 'факт: ' + JSON.stringify(keys));
    assert.ok(raw.indexOf('"base_price"') > raw.indexOf('"value"'),
      f + ': raw-текст — байт «base_price» идёт после «value»');
    if (scrolls[it.id]) {
      assert.equal(it.base_price, it.value,
        f + ': свиток — base_price === value (Е1; прецедент 000320.15); '
        + 'факт: base=' + it.base_price + ' value=' + it.value);
    }
  }
  assert.equal(withBase, 202,
    'base_price — РОВНО у 202 (41 не-свитковый торг + 161 свиток; '
    + 'ре-пин 000322 R6: было 44 = 41+3); факт: ' + withBase);
  for (const [f, bp] of [['000043.json', 60], ['000045.json', 45],
    ['000048.json', 70]]) {
    assert.equal(readJson(path.join(IDIR, f)).base_price, bp,
      f + ': base_price НЕ двигается (миграция 000320.15); факт: '
      + readJson(path.join(IDIR, f)).base_price);
  }
  let mirrorBase = 0;
  for (const it of ITEMS) {
    if (it.base_price === undefined) continue;
    mirrorBase++;
    const keys = Object.keys(it);
    assert.equal(keys.indexOf('base_price'), keys.indexOf('value') + 1,
      'зеркало ' + it.id + ': base_price ПОСЛЕ value');
  }
  assert.equal(mirrorBase, 202,
    'зеркало items-data — base_price у 202 (sync в том же коммите); '
    + 'факт: ' + mirrorBase);
});

// --- T5: цены жрецов/Пергамента по формуле .347.01 --------------------------

test('T5: цены свитковых продавцов — бит-в-бит max(1,round((base_price??value)×8^(ур−1)×mult×derived)) (ЛОКАЛЬНАЯ таблица уровней с assets/spells); спот-литералы: fireball у Пергамента 480/240 (T0) и 360/300 (T5), light_heal у СОЛНЦА 560/280 и 420/350 (перенесённый пин .347.01 T4), frost_bolt 45/23 и 34/28, decadance у ЛУНЫ 7360/3680 (ур3 ×64), way_up у ГОРЫ 480/240 и 360/300 (ур2 ×8)', () => {
  const spells = localSpellTable();
  const lit = [
    ['scroll_merchant', 'fireball_scroll', 480, 240, 360, 300],
    ['scroll_merchant', 'frost_bolt_scroll', 45, 23, 34, 28],
    [SUN.id, 'light_heal_scroll', 560, 280, 420, 350],
    [MOON.id, 'decadance_scroll', 7360, 3680, 5520, 4600],
    [MOUNTAIN.id, 'way_up_scroll', 480, 240, 360, 300],
  ];
  for (const [sellerId, itemId, b0, s0, b5, s5] of lit) {
    const npc = NPCS.find((n) => n.id === sellerId);
    assert.ok(npc && npc.торговля,
      'продавец ' + sellerId + ' в зеркале (RED: жрец не создан)');
    const shop = N.createNpcShop(npc);
    assert.ok(shop.stock[itemId] >= 1,
      sellerId + ': ' + itemId + ' в стоке (витрина)');
    const c0 = charWithMerchant(0);
    const c5 = charWithMerchant(5);
    assert.equal(N.npcBuyPrice(shop, itemId, c0), b0,
      sellerId + '/' + itemId + ': buy T0 === ' + b0);
    assert.equal(N.npcSellPrice(shop, itemId, c0), s0,
      sellerId + '/' + itemId + ': sell T0 === ' + s0);
    assert.equal(N.npcBuyPrice(shop, itemId, c5), b5,
      sellerId + '/' + itemId + ': buy T5 === ' + b5);
    assert.equal(N.npcSellPrice(shop, itemId, c5), s5,
      sellerId + '/' + itemId + ': sell T5 === ' + s5);
  }
  // полный свип 234 входов четырёх свитковых продавцов × {0,5}
  let checked = 0;
  for (const f of listNpcFiles()) {
    const data = readJson(path.join(NDIR, f));
    if (!SCROLL_SELLERS.includes(data.id)) continue;
    const npc = NPCS.find((n) => n.id === data.id);
    const shop = N.createNpcShop(npc);
    for (const lvl of [0, 5]) {
      const c = charWithMerchant(lvl);
      const d = P.derived(c);
      for (const e of data.торговля.предметы) {
        const it = readJson(path.join(ROOT, e.предмет));
        const step = Math.pow(8,
          Math.max(0, Math.floor(spells[it.effect.spell].level) - 1));
        const base = (it.base_price ?? it.value) * step;
        assert.equal(N.npcBuyPrice(shop, it.id, c),
          Math.max(1, Math.round(
            base * (e.mult_покупки || 1) * d.buyPriceMult)),
          data.id + '/' + it.id + ': buy Торговец ' + lvl);
        assert.equal(N.npcSellPrice(shop, it.id, c),
          Math.max(1, Math.round(
            base * e.mult_продажи * d.sellPriceMult)),
          data.id + '/' + it.id + ': sell Торговец ' + lvl);
        checked++;
      }
    }
  }
  assert.equal(checked, 322,
    'свип свитковых продавцов — РОВНО 322 прогона (54+26+27+54 = 161 '
    + 'свитковый вход × {Т0, Т5}; остальные 73 входа не-свитковых '
    + 'торговцев здесь не свипуются); факт: ' + checked);
});

// --- T6: счётные пины каталога/торговли -------------------------------------

test('T6: каталог — ровно 43 файла 000001..000043 подряд; зеркало NPCS 43; входов торговли 234 (76 − 3 Пергамента + 54+26+27+54); торгующих NPC 20; уникальных торгуемых 202', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 43,
    'в каталоге NPC 43 файла (000320.01..20 + 000347.02: +Яровит '
    + '(солнце), +Велена (луна), +Утёс (гора); 000320.21: +Проводник; 000320.22: +Перекати (кочевник)); факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i], String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 43,
    'зеркало NPCS — 43 записи; факт: ' + NPCS.length);
  // Ре-пин 000320.21: каталог 42 — slice(38) захватил бы Проводника,
  // жреческий guard явно ограничен хвостом 39–41.
  // 000320.22: каталог 43 — 43-я запись (Перекати) вне окна, guard не расширяется.
  assert.deepEqual(NPCS.slice(38, 41).map((n) => n.id),
    [SUN.id, MOON.id, MOUNTAIN.id],
    'записи 39–41 — жрецы в нумерации файлов; факт: '
    + JSON.stringify(NPCS.slice(38, 41).map((n) => n.id)));
  let entries = 0;
  let traders = 0;
  const traded = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    const list = d.торговля && d.торговля.предметы;
    if (!Array.isArray(list)) continue;
    traders++;
    for (const e of list) {
      entries++;
      traded.add(e.предмет);
    }
  }
  assert.equal(entries, 234,
    'входов торговли — 234 (73 прочие + 54+26+27+54); факт: ' + entries);
  assert.equal(traders, 20,
    'торгующих NPC — 20 (17 + три жреца); факт: ' + traders);
  assert.equal(traded.size, 202,
    'уникальных торгуемых — 202 (41 + 161 свитков); факт: ' + traded.size);
});

// --- T7: профиль диалога жрецов + запрет-лист + форма торговли --------------

test('T7: жрецы — РОВНО 3 опции диалога (подсказка/торговля/подсказка с {харизма:3}), РОВНО одна «торговля», «для» — ровно 0, блоков квесты/обучение/найм нет (goal 2/reward 5 не растут), запрет-лист 67 подстрок (.20 62 + «храме солнца» Милы + резервы Барыша 4; битый «храм солнц» осознанно НЕ воспроизведён; свои 4 оборота к своему хуку не применяются) по текстам; торговля: mult_продажи РОВНО 0.5, mult_покупки — ключ ОТСУТСТВУЕТ, количество РОВНО 1', () => {
  for (const s of NEWNPCS) {
    const file = path.join(NDIR, s.file);
    assert.ok(fs.existsSync(file), 'RED: assets/npc/' + s.file + ' отсутствует');
    const data = readJson(file);
    for (const block of ['квесты', 'обучение', 'найм']) {
      assert.ok(!(block in data),
        s.file + ': нет блока «' + block + '» — счётчики npc-refs '
        + 'goal 2 / reward 5 не растут');
    }
    const opts = data.диалог;
    assert.equal(opts.length, 3,
      s.file + ': РОВНО 3 опции (форма .15/.18/.19/.20); факт: '
      + opts.length);
    for (const o of opts) {
      assert.ok(['подсказка', 'торговля'].includes(o.действие),
        s.file + '/' + o.id + ': действие ⊆ {подсказка, торговля}');
      assert.ok(!('для' in o),
        s.file + '/' + o.id + ': «для» — ровно 0 (контракт A8a)');
    }
    assert.equal(opts.filter((o) => o.действие === 'торговля').length, 1,
      s.file + ': РОВНО одна «торговля»');
    const withReq = opts.filter((o) => o.требования);
    assert.equal(withReq.length, 1,
      s.file + ': ровно одна опция с требованиями');
    assert.deepEqual(withReq[0].требования, { харизма: 3 },
      s.file + ': требование — {харизма: 3} (харизма-прецедент батча)');
    assert.equal(new Set(opts.map((o) => o.id)).size, 3,
      s.file + ': id опций уникальны');
    const texts = opts.map((o) => o.текст).join(' ');
    for (const w of FORBIDDEN) {
      assert.ok(!texts.includes(w),
        s.file + ': оборот чужого NPC (запрет-лист .20/резервы) — '
        + 'подстрока «' + w + '»');
    }
    const items = data.торговля.предметы;
    assert.equal(items.length, s.count,
      s.file + ': витрина — РОВНО ' + s.count + ' входов; факт: '
      + items.length);
    for (const e of items) {
      assert.equal(e.mult_продажи, 0.5,
        s.file + '/' + e.предмет + ': mult_продажи РОВНО 0.5 '
        + '(тон свиткового товара — паттерн Пергамента)');
      assert.ok(!('mult_покупки' in e),
        s.file + '/' + e.предмет + ': mult_покупки при 1 — КЛЮЧ ОТСУТСТВУЕТ');
      assert.equal(e.количество, 1,
        s.file + '/' + e.предмет + ': количество РОВНО 1 (паттерн Пергамента)');
    }
  }
});

// --- T8: Пергамент — боевая элементалика; light_heal ПЕРЕНЕСЁН --------------

test('T8: Пергамент — ассортимент РОВНО огонь+лёд (54, ДИНАМИЧЕСКИ с диска: = {spells школа ∈ {огонь,лёд}}), light_heal_scroll/000048 УБРАН (перенос к солнцу — строго один продавец), 000043/000045 ОСТАЛИСЬ; жрец солнца торгует 000048; у всех 234 входов жреческих+Пергамента пути — отсортированы по номеру файла', () => {
  const scrolls = diskScrolls();
  const elemental = Object.keys(scrolls)
    .filter((id) => ['огонь', 'лёд'].includes(scrolls[id].school))
    .sort();
  const perg = readJson(path.join(NDIR, '000033.json'));
  const paths = perg.торговля.предметы.map((e) => e.предмет);
  const ids = paths.map((p) => readJson(path.join(ROOT, p)).id).sort();
  assert.equal(ids.length, 54,
    'Пергамент — РОВНО 54 свитка (было 3); факт: ' + ids.length);
  assert.deepEqual(ids, elemental,
    'ассортимент Пергамента = множество свитков школ огонь+лёд '
    + '(динамически с диска, 000347.02 «боевая элементалика»)');
  assert.ok(ids.includes('fireball_scroll') && ids.includes('frost_bolt_scroll'),
    '000043/000045 — на месте (цены .347.01 не двигаются)');
  assert.equal(ids.includes('light_heal_scroll'), false,
    '000048 light_heal_scroll — ВЫЧЕРКНУТ из Пергамента (перенос к солнцу)');
  assert.ok(fs.existsSync(path.join(NDIR, SUN.file)),
    'RED: assets/npc/' + SUN.file + ' отсутствует');
  const sun = readJson(path.join(NDIR, SUN.file));
  const sunIds = sun.торговля.предметы
    .map((e) => readJson(path.join(ROOT, e.предмет)).id);
  assert.ok(sunIds.includes('light_heal_scroll'),
    'light_heal_scroll — у жреца СОЛНЦА (перенесённый пин .347.01 T5)');
  for (const s of [null, ...NEWNPCS]) {
    const data = s === null
      ? perg : readJson(path.join(NDIR, s.file));
    assert.ok(fs.existsSync(path.join(ROOT, data.постройки[0])),
      'постройка резолвится: ' + data.постройки[0]);
    const nums = data.торговля.предметы
      .map((e) => e.предмет.match(/(\d{6})\.json$/)[1]);
    assert.deepEqual(nums, [...nums].sort(),
      (s ? s.file : '000033.json')
      + ': витрина отсортирована по номеру файла');
  }
});
