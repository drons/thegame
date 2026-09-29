// Каталог NPC (assets/npc) — задача 000010.
//
// Проверяем:
//  * нумерация файлов 000001.json … N подряд, без чужих файлов;
//  * каждый файл валиден по assets/npc/schema.json (минимальный
//    валидатор, допустимые ключи — ALLOWED_SCHEMA_KEYS, задача 000015);
//  * консистентность: каталог JSON <-> src/npc-data.js (фолбэк file://)
//    (все NPC, все поля, порядок = нумерация файлов);
//  * правила каталога: уникальные id, постройки 1..50 из каталога зданий,
//    непустые имя/роль/диалог, допустимые действия опций;
//  * ссылочную целостность: предметы (assets/items), навыки
//    (src/skills-data.js), типы групп мобов (src/map.js), цепочки квестов;
//  * кросс-проверку школ: «тренирует» здания = обучение.навыки NPC;
//  * покрытие требований задачи: торговцы с разным ассортиментом,
//    ≥ 3 школы, старейшина с цепочкой квестов, карта покрыта NPC.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { NPCS } = require('../src/npc-data.js');
const { getBuilding } = require('../src/buildings.js');
const { getItem } = require('../src/items.js');
const { PRIMARY_SKILLS, SECONDARY_SKILLS } = require('../src/player.js');
const { mobGroupCount } = require('../src/map.js');
const { SPELLS_BY_ID } = require('../src/spells-data.js');

const DIR = path.join(__dirname, '..', 'assets', 'npc');

// Минимальный валидатор JSON-схем — общий модуль (задача 000015):
// tests/json-schema.js (допустимые ключи — ALLOWED_SCHEMA_KEYS).
const { validate, validateData, ALLOWED_SCHEMA_KEYS } = require('./json-schema.js');

// Допустимые действия опций диалога (assets/npc/schema.json).
// «найм» — действие найма спутников (задача 000078).
const ACTIONS = new Set(['торговля', 'обучение', 'квесты', 'подсказка', 'найм']);

// «Картовые» постройки с NPC (map_index → id каталога, src/map.js):
// 4 магазина, 4 школы, дом кузнеца, храм солнца, таверна.
const MAP_NPC_BUILDINGS = [1, 2, 3, 4, 7, 8, 10, 11, 25, 36, 44];

function listNpcFiles() {
  return fs.readdirSync(DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function loadSchema() {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
}

// --- Нумерация и зеркало ---

test('каталог: ровно N файлов 000001..N.json подряд, N = NPCS.length', () => {
  const files = listNpcFiles();
  assert.ok(files.length >= 1, 'каталог пустой');
  assert.equal(files.length, NPCS.length,
    'в зеркале столько же NPC, сколько файлов');
  for (let i = 0; i < files.length; i++) {
    const num = String(i + 1).padStart(6, '0');
    assert.equal(files[i], num + '.json',
      `пробел в нумерации на позиции ${i + 1}: ${files[i]}`);
  }
});

test('каталог: чужих файлов нет (только NNNNNN.json и schema.json)', () => {
  const all = fs.readdirSync(DIR).sort();
  for (const f of all) {
    assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
      `чужой файл в каталоге NPC: ${f}`);
  }
});

test('зеркало: src/npc-data.js — точная копия каталога JSON', () => {
  const files = listNpcFiles();
  assert.ok(Array.isArray(NPCS), 'NPCS — массив');
  for (let i = 0; i < files.length; i++) {
    const fromFile = JSON.parse(
      fs.readFileSync(path.join(DIR, files[i]), 'utf8'));
    assert.ok(NPCS[i] && typeof NPCS[i] === 'object' && !Array.isArray(NPCS[i]),
      `NPCS[${i}] (${files[i]}): не объект`);
    assert.deepEqual(NPCS[i], fromFile,
      `${files[i]}: зеркало совпадает с JSON (ключи и порядок)`);
  }
});

// --- Схема ---

test('schema.json: object, additionalProperties false, обязательные поля', () => {
  const schema = loadSchema();
  assert.equal(schema.type, 'object', 'верхний уровень: object');
  assert.equal(schema.additionalProperties, false,
    'верхний уровень: additionalProperties false');
  for (const r of ['id', 'имя', 'роль', 'постройки', 'диалог']) {
    assert.ok(schema.required.includes(r), `required: «${r}»`);
  }
});

test('schema.json: только ключи минимального валидатора (000015)', () => {
  const schema = loadSchema();
  let keyCount = 0;
  // Рекурсия: properties/items/oneOf/anyOf — под-схемы; массивы required
  // и enum содержат простые значения — листы.
  (function walk(node, where) {
    if (Array.isArray(node)) {
      node.forEach((v, i) => walk(v, `${where}[${i}]`));
      return;
    }
    assert.ok(node && typeof node === 'object',
      `схема: узел в ${where} не объект`);
    for (const [k, v] of Object.entries(node)) {
      keyCount += 1;
      assert.ok(ALLOWED_SCHEMA_KEYS.has(k),
        `схема: недопустимый ключ "${k}" в ${where}`);
      if (v === null) continue;
      if (k === 'properties' && v && typeof v === 'object' && !Array.isArray(v)) {
        // Ключи properties — имена полей данных, не ключи схемы.
        for (const [fname, fschema] of Object.entries(v)) {
          walk(fschema, `${where}.properties.${fname}`);
        }
      } else if (k === 'items' || k === 'oneOf' || k === 'anyOf') {
        walk(v, `${where}.${k}`);
      }
    }
  })(schema, '$');
  assert.ok(keyCount > 5, 'схема подозрительно маленькая');
});

test('каждый файл: валиден по schema.json (минимальный валидатор)', () => {
  const schema = loadSchema();
  const files = listNpcFiles();
  for (const f of files) {
    const data = JSON.parse(
      fs.readFileSync(path.join(DIR, f), 'utf8'));
    const errors = [];
    validate(schema, data, f, errors);
    assert.deepEqual(errors, [], `${f}: ${errors.join('; ')}`);
  }
});

test('схема: цель квеста требует поле по типу (oneOf)', () => {
  // {тип: "kill_group", количество} без «группа» и
  // {тип: "bring_item", количество} без «предмет» — цели, которые в
  // src/npc.js никогда не выполняются (softlock): схема их запрещает.
  const schema = loadSchema();
  const goalSchema = schema.properties.квесты.items.properties.цель;
  assert.ok(goalSchema.oneOf, 'цель — oneOf из вариантов по типу');
  const cases = [
    { goal: { тип: 'kill_group', количество: 1 }, ok: false },
    { goal: { тип: 'bring_item', количество: 2 }, ok: false },
    { goal: { тип: 'kill_group', группа: 2, количество: 1 }, ok: true },
    { goal: { тип: 'bring_item', предмет: 'moonstone', количество: 2 }, ok: true },
    // чужое поле типа — тоже мимо (additionalProperties false в варианте)
    { goal: { тип: 'kill_group', группа: 2, количество: 1,
              предмет: 'moonstone' }, ok: false },
    { goal: { тип: 'other', количество: 1 }, ok: false },
  ];
  for (const { goal, ok } of cases) {
    const errors = [];
    validate(goalSchema, goal, 'цель', errors);
    assert.equal(errors.length === 0, ok,
      `цель ${JSON.stringify(goal)}: ${errors.join('; ')}`);
  }
});

// --- Правила каталога ---

test('правила: id уникальны, постройки 1..50 из каталога, поля не пусты', () => {
  const files = listNpcFiles();
  const seenIds = new Set();
  files.forEach((f, i) => {
    const n = NPCS[i];
    assert.match(n.id, /^[a-z][a-z0-9_]*$/, `${f}: id "${n.id}"`);
    assert.ok(!seenIds.has(n.id), `дубликат id "${n.id}" в ${f}`);
    seenIds.add(n.id);
    assert.equal(typeof n.имя, 'string', `${f}: имя — строка`);
    assert.ok(n.имя.trim() !== '', `${f}: имя не пустое`);
    assert.equal(typeof n.роль, 'string', `${f}: роль — строка`);
    assert.ok(n.роль.trim() !== '', `${f}: роль не пустая`);
    assert.ok(Array.isArray(n.постройки) && n.постройки.length > 0,
      `${f}: постройки — непустой массив`);
    for (const b of n.постройки) {
      assert.ok(Number.isInteger(b) && b >= 1 && b <= 50,
        `${f}: постройка ${b} вне диапазона 1..50`);
      assert.ok(getBuilding(b) !== null,
        `${f}: здание id=${b} нет в каталоге buildings`);
    }
    assert.ok(Array.isArray(n.диалог) && n.диалог.length > 0,
      `${f}: диалог — непустой массив`);
    const optIds = new Set();
    for (const o of n.диалог) {
      assert.ok(!optIds.has(o.id), `${f}: дубль опции диалога "${o.id}"`);
      optIds.add(o.id);
      assert.ok(ACTIONS.has(o.действие), `${f}: действие "${o.действие}"`);
    }
  });
});

// --- Ссылочная целостность ---

test('целостность: предметы, навыки, типы групп мобов, цепочки квестов', () => {
  for (const n of NPCS) {
    // Торговля: предметы — из каталога assets/items.
    if (n.торговля) {
      for (const p of n.торговля.предметы) {
        assert.ok(getItem(p.предмет) !== null,
          `${n.id}: предмет "${p.предмет}" нет в items`);
      }
    }
    // Обучение: только вторичные навыки каталога.
    if (n.обучение) {
      for (const id of n.обучение.навыки) {
        assert.ok(SECONDARY_SKILLS[id] !== undefined,
          `${n.id}: "${id}" не вторичный навык`);
      }
    }
    // Диалог: требуемый навык — основной или вторичный.
    const knownSkill = (id) =>
      SECONDARY_SKILLS[id] !== undefined ||
      PRIMARY_SKILLS.some((p) => p.id === id);
    for (const o of n.диалог) {
      if (o.требования && o.требования.навык) {
        assert.ok(knownSkill(o.требования.навык.id),
          `${n.id}: опция ${o.id}: навык "${o.требования.навык.id}" неизвестен`);
      }
    }
    // Квесты.
    if (n.квесты) {
      const allIds = new Set(n.квесты.map((q) => q.id));
      assert.equal(allIds.size, n.квесты.length,
        `${n.id}: дубликаты id квестов`);
      for (const q of n.квесты) {
        const goal = q.цель;
        if (goal.тип === 'kill_group') {
          assert.ok(Number.isInteger(goal.группа) &&
            goal.группа >= 0 && goal.группа < mobGroupCount(),
            `${n.id}: квест ${q.id}: группа ${goal.группа} вне 0..${mobGroupCount() - 1}`);
        } else if (goal.тип === 'bring_item') {
          assert.ok(getItem(goal.предмет) !== null,
            `${n.id}: квест ${q.id}: предмет "${goal.предмет}" нет в items`);
        }
        for (const r of (q.награда.предметы || [])) {
          assert.ok(getItem(r.предмет) !== null,
            `${n.id}: квест ${q.id}: награда "${r.предмет}" нет в items`);
        }
        if (q.предыдущий !== null && q.предыдущий !== undefined) {
          assert.ok(allIds.has(q.предыдущий),
            `${n.id}: квест ${q.id}: предыдущий "${q.предыдущий}" не у этого NPC`);
        }
      }
      // Циклов в цепочках нет: обход по «предыдущий» завершается.
      for (const q of n.квесты) {
        const seen = new Set();
        let cur = q;
        let guard = 0;
        while (cur) {
          assert.ok(++guard <= n.квесты.length + 1,
            `${n.id}: цикл в цепочке квестов`);
          assert.ok(!seen.has(cur.id),
            `${n.id}: цикл в цепочке на квесте "${cur.id}"`);
          seen.add(cur.id);
          const prev = cur.предыдущий;
          cur = prev ? n.квесты.find((x) => x.id === prev) : null;
        }
      }
    }
  }
});

test('школы: «тренирует» здания = обучение.навыки NPC (названия)', () => {
  const lower = (s) => s.toLowerCase();
  let pairs = 0;
  for (const n of NPCS) {
    for (const bId of n.постройки) {
      const b = getBuilding(bId);
      const trains = b && b.категория === 'школа_навыков'
        ? b.особые_параметры.тренирует
        : undefined;
      if (!Array.isArray(trains)) continue;
      pairs += 1;
      const buildingNames = new Set(trains.map(lower));
      const npcNames = new Set(
        (n.обучение ? n.обучение.навыки : []).map(
          (id) => lower(SECONDARY_SKILLS[id].name)));
      assert.deepEqual([...buildingNames].sort(), [...npcNames].sort(),
        `${n.id} в здании ${bId} «${b.название}»: наборы обучаемых навыков совпадают`);
    }
  }
  // Арена, Кузница, Стрельбище, Школа акробатов, Хижина старейшин.
  assert.ok(pairs >= 5, 'проверено не меньше 5 пар «NPC — школа»');
});

// --- Покрытие требований задачи 000010 ---

test('покрытие: торговцы с разным ассортиментом, ≥ 3 школы, ≥ 4 навыков', () => {
  const traders = NPCS.filter((n) => n.торговля);
  assert.ok(traders.length >= 2, 'торговцов не меньше 2');
  const stocks = traders.map(
    (n) => n.торговля.предметы.map((p) => p.предмет).sort().join(','));
  assert.ok(new Set(stocks).size > 1,
    'наборы предметов у торговцев не совпадают полностью');
  const teachers = NPCS.filter((n) => n.обучение);
  assert.ok(teachers.length >= 3, 'школ навыков не меньше 3');
  const allSkills = new Set();
  for (const t of teachers) {
    for (const id of t.обучение.навыки) allSkills.add(id);
  }
  assert.ok(allSkills.size >= 4, 'разных обучаемых навыков не меньше 4');
});

test('покрытие: старейшина с цепочкой из ≥ 2 квестов', () => {
  const elders = NPCS.filter((n) => n.роль.includes('старейшин'));
  assert.ok(elders.length >= 1, 'старейшины нет');
  for (const e of elders) {
    assert.ok(Array.isArray(e.квесты) && e.квесты.length >= 2,
      `${e.id}: квестов не меньше 2`);
    const ids = new Set(e.квесты.map((q) => q.id));
    const chained = e.квесты.filter(
      (q) => q.предыдущий !== null && ids.has(q.предыдущий));
    assert.ok(chained.length >= 1,
      `${e.id}: есть квест, ссылающийся на предыдущий (цепочка)`);
  }
});

test('торговля: сырьё продаётся (задача 000044)', () => {
  // Аптекарь Мила продаёт травы (herb_*) — сырьё для зелий.
  const apothecary = NPCS.find((n) => n.id === 'apothecary');
  assert.ok(apothecary, 'аптекарь не найден в каталоге NPC');
  assert.ok(apothecary.торговля, 'у аптекаря нет торговли');
  const herbs = apothecary.торговля.предметы
    .filter((p) => p.предмет.startsWith('herb_'));
  assert.ok(herbs.length >= 3,
    'аптекарь продаёт не меньше 3 трав, а продаёт: ' + herbs.length);
  for (const p of herbs) {
    assert.ok(getItem(p.предмет) !== null,
      `аптекарь: траву "${p.предмет}" нет в items`);
    assert.equal(getItem(p.предмет).kind, 'reagent',
      p.предмет + ': трава — реагент из каталога');
  }

  // Лавка странника (постройка 5): странствующий торговец продаёт
  // руду, дерево, камень, кожу и уголь; весь его ассортимент —
  // reagent-предметы каталога.
  const wanderer = NPCS.find(
    (n) => n.постройки.includes(5) && n.торговля);
  assert.ok(wanderer, 'нет NPC у Лавки странника (постройка 5)');
  const RAW = new Set(['wood_log', 'stone_chunk', 'hide', 'coal',
    'iron_ore', 'copper_ore']);
  const rawStock = wanderer.торговля.предметы
    .filter((p) => RAW.has(p.предмет));
  assert.ok(new Set(rawStock.map((p) => p.предмет)).size >= 3,
    'странствующий торговец продаёт не меньше 3 видов сырья, '
    + 'а продаёт: ' + new Set(rawStock.map((p) => p.предмет)).size);
  for (const p of wanderer.торговля.предметы) {
    const it = getItem(p.предмет);
    assert.ok(it !== null,
      `${wanderer.id}: предмет "${p.предмет}" нет в items`);
    assert.equal(it.kind, 'reagent',
      `${wanderer.id}: "${p.предмет}" в лавке странника — reagent`);
  }
});

test('покрытие: все «картовые» постройки с NPC заняты хотя бы одним NPC', () => {
  const covered = new Set();
  for (const n of NPCS) {
    for (const bId of n.постройки) covered.add(bId);
  }
  for (const bId of MAP_NPC_BUILDINGS) {
    assert.ok(covered.has(bId),
      `постройка ${bId} (${getBuilding(bId).название}) без NPC`);
  }
});

test('квесты kill_group: группа — из каталога assets/mob_groups (задача 000057, source of truth)', () => {
  // Типы стационарных групп — записи каталога: допустимо 0..(N−1),
  // где N — число файлов assets/mob_groups. Старая проверка
  // (0..MOB_GROUP_COUNT−1) теперь увязана с каталогом: при изменении
  // числа групп квесты обязаны остаться валидными.
  const MG_DIR = path.join(__dirname, '..', 'assets', 'mob_groups');
  const groups = fs.readdirSync(MG_DIR)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(groups.length, 7, 'в каталоге ровно 7 групп мобов');
  let n = 0;
  for (const npc of NPCS) {
    for (const q of (npc.квесты || [])) {
      if (q.цель.тип !== 'kill_group') continue;
      n++;
      assert.ok(Number.isInteger(q.цель.группа) &&
        q.цель.группа >= 0 && q.цель.группа < groups.length,
        `${npc.id}: квест ${q.id}: группа ${q.цель.группа} вне диапазона каталога (0..${groups.length - 1})`);
    }
  }
  assert.ok(n > 0, 'хотя бы один kill_group-квест есть');
});

// --- Найм спутников: слой данных (задача 000078, родитель 000065) ---
//
// Фиксированные контракты (см. memory/000078-npc-hire-data.md):
//  * имена полей найма — {цена, жалованье, роль, dmg, hp, armor?,
//    skills, spells}: родительский контракт 000065 (SPEC «Спутники»);
//  * роль — enum melee|ranged|shield|support (роль СОЮЗНИКА — не
//    путать с вражеской 'leader');
//  * dmg/hp — МНОЖИТЕЛИ в формулах makeMob (как MOB_TYPES.dmg/hp),
//    armor — целое как у MOB_TYPES;
//  * найм только в таверне (постройка 44);
//  * ДВУСМЫСЛЕННОСТЬ ЗАДАЧИ РАЗРЕШЕНА ТАК: «кандидаты для building 44
//    (все имеют найм)» = все NPC с найм-данными находятся в building
//    44 (наёмники — новые файлы); тавернщик (первый NPC таверны,
//    единственный путь открыть диалог — npcForBuilding) обязан иметь
//    найм-ОПЦИЮ диалога, но найм-ДАННЫХ у него быть не должно
//    (он не наёмник).
const TAVERN = 44; // «Таверна (общественная)» — генерируемое здание

function hireCandidates() {
  return NPCS.filter((n) => n && n.найм && typeof n.найм === 'object');
}

function knownSkillId(id) {
  return SECONDARY_SKILLS[id] !== undefined ||
    PRIMARY_SKILLS.some((p) => p.id === id);
}

test('schema.json: опциональное закрытое поле «найм» (000078)', () => {
  const schema = loadSchema();
  const hire = schema.properties.найм;
  assert.ok(hire && typeof hire === 'object',
    'properties.найм — под-схема (задача 000078)');
  assert.equal(hire.type, 'object', 'найм: type object');
  assert.equal(hire.additionalProperties, false,
    'найм: additionalProperties false (схема закрыта)');
  assert.ok(Array.isArray(hire.required), 'найм: required — массив');
  for (const r of ['цена', 'жалованье', 'роль', 'dmg', 'hp', 'skills', 'spells']) {
    assert.ok(hire.required.includes(r), `найм.required: «${r}»`);
  }
  assert.ok(!hire.required.includes('armor'),
    'armor — ОПЦИОНАЛЬНО (не в required)');
  assert.ok(hire.properties && typeof hire.properties === 'object',
    'найм.properties');
  const p = hire.properties;
  assert.equal(p.цена.type, 'integer', 'цена — integer');
  assert.ok(p.цена.minimum >= 1 && p.цена.maximum <= 100000,
    'цена: границы 1..100000');
  assert.equal(p.жалованье.type, 'integer', 'жалованье — integer');
  assert.ok(p.жалованье.minimum >= 1 && p.жалованье.maximum <= 10000,
    'жалованье: границы 1..10000');
  assert.deepEqual(p.роль.enum, ['melee', 'ranged', 'shield', 'support'],
    'роль — enum из 4 боевых ролей союзника');
  assert.equal(p.dmg.type, 'number', 'dmg — number (множитель makeMob)');
  assert.ok(p.dmg.maximum <= 10, 'dmg: разумный максимум (<= 10)');
  assert.equal(p.hp.type, 'number', 'hp — number (множитель makeMob)');
  assert.ok(p.hp.maximum <= 10, 'hp: разумный максимум (<= 10)');
  assert.equal(p.armor.type, 'integer', 'armor — integer (опция)');
  assert.equal(p.skills.type, 'array', 'skills — массив id');
  assert.equal(p.skills.items.type, 'string', 'skills: элементы — строки');
  assert.equal(p.spells.type, 'array', 'spells — массив id');
  assert.equal(p.spells.items.type, 'string', 'spells: элементы — строки');
});

test('schema.json: enum «действие» диалога содержит «найм» (000078)', () => {
  const schema = loadSchema();
  const actions = schema.properties.диалог
    .items.properties.действие.enum;
  assert.ok(Array.isArray(actions), 'действие — enum');
  for (const a of ['торговля', 'обучение', 'квесты', 'подсказка', 'найм']) {
    assert.ok(actions.includes(a), `действие enum: «${a}»`);
  }
});

test('schema.json: найм — отрицательная валидация (лишнее поле, роль вне enum)', () => {
  const schema = loadSchema();
  const hire = schema.properties.найм;
  assert.ok(hire && typeof hire === 'object',
    'properties.найм — под-схема (задача 000078)');
  const okHire = {
    цена: 50, жалованье: 2, роль: 'melee', dmg: 1.2, hp: 1.1,
    skills: ['swordsman'], spells: [],
  };
  assert.deepEqual(validateData(hire, okHire, 'найм'), [],
    'минимальный найм (skills/spells — пустые массивы) — валиден');
  assert.deepEqual(
    validateData(hire, Object.assign({}, okHire, { armor: 2 }), 'найм'), [],
    'armor допустим (опциональное поле)');
  assert.ok(validateData(hire,
    Object.assign({}, okHire, { бонус: 5 }), 'найм').length > 0,
    'лишнее поле в найм — invalid (additionalProperties false)');
  assert.ok(validateData(hire,
    Object.assign({}, okHire, { роль: 'tank' }), 'найм').length > 0,
    'роль вне enum — invalid');
  assert.ok(validateData(hire,
    Object.assign({}, okHire, { цена: '50' }), 'найм').length > 0,
    'цена-строка — invalid');
  // Найм-опция диалога: действие «найм» — валидно; с требованиями
  // (существующий механизм доступа) — тоже.
  const optSchema = schema.properties.диалог.items;
  const opt = { id: 'hire', текст: 'Найм: наёмники в дорогу', действие: 'найм' };
  assert.deepEqual(validateData(optSchema, opt, 'опция'), [],
    'опция с действием «найм» — валидна');
  assert.deepEqual(validateData(optSchema,
    Object.assign({}, opt, { требования: { харизма: 2 } }), 'опция'), [],
    'найм-опция с требованиями (харизма) — валидна');
  assert.deepEqual(validateData(optSchema,
    Object.assign({}, opt, { требования: { навык: { id: 'orator', уровень: 1 } } }),
    'опция'), [],
    'найм-опция с требованиями (навык) — валидна');
});

test('найм: кандидаты — ≥5 NPC, все в таверне (44), найм-опция у каждого, 4 роли', () => {
  const candidates = hireCandidates();
  assert.ok(candidates.length >= 5,
    'кандидатов на найм не меньше 5, а найдено: ' + candidates.length);
  const ROLES = new Set(['melee', 'ranged', 'shield', 'support']);
  const seenRoles = new Set();
  for (const n of candidates) {
    assert.deepEqual(n.постройки, [TAVERN],
      `${n.id}: наёмник — ТОЛЬКО в таверне (постройки [44]), а постройки: ` +
      JSON.stringify(n.постройки));
    const opt = n.диалог.find((o) => o.действие === 'найм');
    assert.ok(opt, `${n.id}: нет найм-опции в диалоге (действие «найм»)`);
    assert.ok(ROLES.has(n.найм.роль),
      `${n.id}: роль найма «${n.найм.роль}» не из melee/ranged/shield/support`);
    seenRoles.add(n.найм.роль);
  }
  for (const r of ROLES) {
    assert.ok(seenRoles.has(r), `роль «${r}» не представлена среди кандидатов`);
  }
});

test('найм: экономика — контракт 30..150 з, жалованье 1..6 з/день', () => {
  // Квест у Берты даёт ~50 золота: контракт должен быть достижим
  // за 1–2 квеста, жалованье — не съедать доход. Финальный баланс —
  // золотой сценарий 000087 (правит данные, не формулы).
  const candidates = hireCandidates();
  assert.ok(candidates.length >= 1, 'кандидатов на найм нет');
  for (const n of candidates) {
    const h = n.найм;
    assert.ok(Number.isInteger(h.цена) && h.цена >= 30 && h.цена <= 150,
      `${n.id}: контракт ${h.цена} вне 30..150 з`);
    assert.ok(Number.isInteger(h.жалованье) &&
      h.жалованье >= 1 && h.жалованье <= 6,
      `${n.id}: жалованье ${h.жалованье} вне 1..6 з/день`);
    assert.ok(Number.isFinite(h.dmg) && h.dmg >= 0.1 && h.dmg <= 10,
      `${n.id}: dmg ${h.dmg} вне 0.1..10 (множитель makeMob)`);
    assert.ok(Number.isFinite(h.hp) && h.hp >= 0.1 && h.hp <= 10,
      `${n.id}: hp ${h.hp} вне 0.1..10 (множитель makeMob)`);
    if (h.armor !== undefined) {
      assert.ok(Number.isInteger(h.armor) && h.armor >= 0 && h.armor <= 100,
        `${n.id}: armor ${h.armor} вне 0..100`);
    }
  }
});

test('найм: ссылочная целостность — skills → каталог, spells → каталог', () => {
  // Найм.skills — id из каталога skills (основные И вторичные:
  // наёмник может нести primary-навык). Найм.spells — id из
  // каталога spells (assets/spells → src/spells-data.js).
  const candidates = hireCandidates();
  assert.ok(candidates.length >= 1, 'кандидатов на найм нет');
  for (const n of candidates) {
    assert.ok(Array.isArray(n.найм.skills),
      `${n.id}: найм.skills — массив`);
    assert.ok(Array.isArray(n.найм.spells),
      `${n.id}: найм.spells — массив`);
    for (const id of n.найм.skills) {
      assert.ok(knownSkillId(id),
        `${n.id}: найм.skills: навык "${id}" нет в каталоге skills`);
    }
    for (const id of n.найм.spells) {
      assert.ok(SPELLS_BY_ID[id] !== undefined,
        `${n.id}: найм.spells: заклинание "${id}" нет в каталоге spells`);
    }
  }
});

test('доступность найма: ПЕРВЫЙ NPC каталога таверны (44) имеет найм-опцию диалога', () => {
  // main.js открывает диалог таверны с ПЕРВЫМ NPC каталога на
  // постройке (npcForBuilding → npcsForBuilding[0]). Без найм-опции
  // у этого NPC вкладка «найм» недостижима в игре (новые наёмники
  // [E] не выбирают). Фиксируем договор достижимости:
  // таверна → найм-опция → вкладка «найм».
  const tavernNpc = NPCS.find((n) => n.постройки.includes(TAVERN));
  assert.ok(tavernNpc, 'NPC в таверне (44) не найден');
  const opt = tavernNpc.диалог.find((o) => o.действие === 'найм');
  assert.ok(opt,
    `у ${tavernNpc.id} (первый NPC каталога таверны) нет найм-опции ` +
    'диалога — вкладка «найм» недостижима в игре');
  // При этом тавернщик — НЕ кандидат на найм (найм-данных у него нет:
  // он не наёмник; развязка двусмысленности задачи закреплена
  // комментарием в начале секции).
  assert.ok(!tavernNpc.найм,
    `${tavernNpc.id}: тавернщик не должен быть кандидатом на найм ` +
    '(найм-данные — только у наёмников)');
});
