const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { NPCS } = require('../src/npc-data.js');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'npc');

// buildings — slug с 000318.06 (прежний numeric-паттерн — красен: номер
// более не ref).
const BUILDING_REF = /^assets\/buildings\/[a-z][a-z0-9_]*\.json$/;
const ITEM_REF = /^assets\/items\/\d{6}\.json$/;

function listNpcFiles() {
  return fs.readdirSync(DIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readNpc(file) {
  return JSON.parse(
    fs.readFileSync(path.join(DIR, file), 'utf8'));
}

function targetId(ref) {
  return JSON.parse(
    fs.readFileSync(path.join(ROOT, ref), 'utf8')).id;
}

test('npc: постройки — строки-ссылки assets/buildings, резолюция, id цели = id зеркала (37/14)', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 35, 'в каталоге NPC 35 файла (000320.01: +Корд; 000320.02: +Родар; 000320.03: +Скарн; 000320.04: +Ветеран; 000320.05: +Коллекционер; 000320.06: +Оружейник; 000320.07: +Отставной наёмник; 000320.08: +Подмастерье; 000320.09: +Специалист по броне; 000320.10: +Наставник-големовед; 000320.11: +Торговец зельями; 000320.12: +Торговка травами; 000320.13: +Алхимик-наставник; 000320.14: +Фельдшер; 000320.15: +Торговец свитками; 000320.16: +Маг-наставник; 000320.17: +Переписчик)');
  let total = 0;
  const unique = new Set();
  for (let i = 0; i < files.length; i++) {
    const data = readNpc(files[i]);
    const mirror = NPCS[i];
    assert.ok(Array.isArray(data.постройки) && data.постройки.length > 0,
      `${files[i]}: нет непустых построек`);
    for (let j = 0; j < data.постройки.length; j++) {
      const v = data.постройки[j];
      total += 1;
      assert.equal(typeof v, 'string',
        `${files[i]}: постройки[${j}] = ${JSON.stringify(v)} — ждём строку-ссылку на assets/buildings/NNNNNN.json`);
      assert.match(v, BUILDING_REF,
        `${files[i]}: постройки[${j}] = ${v} — не якорная ссылка`);
      const id = targetId(v);
      assert.ok(Number.isInteger(id),
        `${files[i]}: ${v} — id цели обязан быть целым, а не ${JSON.stringify(id)}`);
      unique.add(v);
      assert.equal(id, mirror.постройки[j],
        `${files[i]}: ссылка ${v} резолвится в ${id}, а в зеркале ${JSON.stringify(mirror.постройки[j])}`);
    }
  }
  // Ре-пин 000320.01: +1 ссылка Корда на 000001 (Оружейная — 2-й NPC).
  // Ре-пин 000320.02: +1 ссылка Родара на 000001 (Оружейная — 3-й NPC;
  // Ре-пин 000320.03: +1 ссылка Скарна на 000001 (Оружейная — 4-й NPC;
  // Ре-пин 000320.04: +1 ссылка Ветерана на 000001 (Оружейная — 5-й NPC;
  // Ре-пин 000320.05: +1 ссылка Коллекционера на 000001 (Оружейная —
  // 6-й NPC; уникальных зданий — без изменений: 000001 уже занят
  // Бренном/Кордом).
  // Ре-пин 000320.06: +1 ссылка Оружейника на 000001 (Оружейная —
  // 7-й NPC; уникальных зданий — без изменений).
  // Ре-пин 000320.07: +1 ссылка Отставного наёмника на 000001
  // (Оружейная — 8-й NPC; уникальных зданий — без изменений).
  // Ре-пин 000320.08: +1 ссылка Подмастерья на 000001 (Оружейная —
  // 9-й NPC; уникальных зданий — без изменений).
  // Ре-пин 000320.09: +1 ссылка Специалиста по броне на 000002
  // (Бронник — 2-й NPC; уникальных зданий — без изменений: 000002 уже
  // ссылаем Гротой).
  // Ре-пин 000320.10: +1 ссылка Наставника-големоведа на 000002
  // (Бронник — 3-й NPC; уникальных зданий — без изменений: 000002 уже
  // ссылаем Гротой).
  // Ре-пин 000320.11: +1 ссылка Торговца зельями на 000003
  // (Аптекарь — 2-й NPC; уникальных зданий — без изменений: 000003
  // уже ссылаем Милой).
  // Ре-пин 000320.12: +1 ссылка Торговки травами на 000003
  // (Аптекарь — 3-й NPC; уникальных зданий — без изменений: 000003
  // уже ссылаем Милой).
  // Ре-пин 000320.13: +1 ссылка Алхимика-наставника на 000003
  // (Аптекарь — 4-й NPC; уникальных зданий — без изменений: 000003
  // уже ссылаем Милой).
  // Ре-пин 000320.14: +1 ссылка Фельдшера на 000003 (Аптекарь — 5-й
  // NPC; уникальных зданий — без изменений: 000003 уже ссылаем Милой).
  // Ре-пин 000320.15: +1 ссылка Торговца свитками на 000004
  // (Магазин магии — 2-й NPC; уникальных зданий — без изменений:
  // 000004 уже ссылаем Зирой).
  // Ре-пин 000320.16: +1 ссылка Мага-наставника на 000004
  // (Магазин магии — 3-й NPC; уникальных зданий — без изменений:
  // 000004 уже ссылаем Зирой).
  // Ре-пин 000320.17: +1 ссылка Переписчика на 000004
  // (Магазин магии — 4-й NPC; уникальных зданий — без изменений:
  // 000004 уже ссылаем Зирой).
  assert.equal(total, 37, 'ссылок на постройки: 37');
  assert.equal(unique.size, 14, 'уникальных зданий: 14');
});

test('npc: предметы — строки-ссылки assets/items (торговля/цель bring_item/награда), резолюция (74/44, ре-пины 000232/000320.01/000320.03/000320.06/000320.09/000320.11/000320.12/000320.13/000320.15)', () => {
  const files = listNpcFiles();
  // 000320.14: фельдшер (village_doctor) — профиль ЧИСТАЯ подсказка,
  // блоков торговля/квесты/найм нет → торговля 64 / goal 2 / reward 5 /
  // сумма 71 / уникальные предметы 41 БЕЗ изменений (в тестовой базе —
  // как у чистой подсказки .08, чей номер в цепочке ре-пинов заголовка
  // отсутствует по той же причине).
  let trade = 0;
  let goal = 0;
  let reward = 0;
  const unique = new Set();
  const check = (v, where, mirrorValue) => {
    assert.equal(typeof v, 'string',
      `${where}: ${JSON.stringify(v)} — ждём строку-ссылку на assets/items/NNNNNN.json`);
    assert.match(v, ITEM_REF,
      `${where}: ${v} — не якорная ссылка`);
    const id = targetId(v);
    assert.equal(typeof id, 'string',
      `${where}: ${v} — id цели обязан быть строкой, а не ${JSON.stringify(id)}`);
    unique.add(v);
    assert.equal(id, mirrorValue,
      `${where}: ссылка ${v} резолвится в ${id}, а в зеркале ${JSON.stringify(mirrorValue)}`);
  };
  for (let i = 0; i < files.length; i++) {
    const data = readNpc(files[i]);
    const mirror = NPCS[i];
    if (data.торговля) {
      const mItems = (mirror.торговля || {}).предметы || [];
      for (let j = 0; j < data.торговля.предметы.length; j++) {
        trade += 1;
        check(data.торговля.предметы[j].предмет,
          `${files[i]}: торговля.предметы[${j}].предмет`,
          mItems[j] && mItems[j].предмет);
      }
    }
    const quests = data.квесты || [];
    const mQuests = (mirror.квесты || []);
    for (let k = 0; k < quests.length; k++) {
      if (quests[k].цель.тип === 'bring_item') {
        goal += 1;
        check(quests[k].цель.предмет,
          `${files[i]}: квесты[${k}].цель.предмет`,
          mQuests[k].цель.предмет);
      }
      const rItems = ((quests[k].награда || {}).предметы) || [];
      const mRItems = (((mQuests[k].награда) || {}).предметы) || [];
      for (let j = 0; j < rItems.length; j++) {
        reward += 1;
        check(rItems[j].предмет,
          `${files[i]}: квесты[${k}].награда.предметы[${j}].предмет`,
          mRItems[j] && mRItems[j].предмет);
      }
    }
  }
  // Ре-пин 000232: +6 чертежей в торговле 6 NPC (40→46, 44→50,
  // 35→41 — 6 новых уникальных id). Ре-пин 000320.01: +5 меч/лук-
  // входов торговли Корда (46→51, 50→55; уникальных — без изменений:
  // 000001–000005 уже в множестве 41). Ре-пин 000320.03: +1 цель
  // bring_item Скарна (1→2) + 2 награда-предмета его квестов (3→5);
  // уникальных — без изменений: 000002/000012/000020 уже в множестве 41.
  // 000320.05: профиль Коллекционера — чистая подсказка (блоков нет) —
  // счётчики не выросли.
  // Ре-пин 000320.06: +3 меча в торговле Дарна (51→54, 58→61;
  // уникальных — без изменений: 000001–000003 уже в множестве 41;
  // goal/reward — без изменений: профиль торговля без квестов).
  // 000320.07: профиль Отставного наёмника — чистая подсказка (блоков
  // нет) — торговля 54 / goal 2 / reward 5 / сумма 61 / уникальные
  // предметы 41 без изменений.
  // Ре-пин 000320.08: профиль Подмастерья — чистая подсказка (блоков
  // нет) — торговля 54 / goal 2 / reward 5 / сумма 61 / уникальные
  // предметы 41 без изменений.
  // Ре-пин 000320.09: +3 брони в торговле Специалиста (54→57, 61→64;
  // уникальных — без изменений: 000008–000010 уже в множестве 41 —
  // их продаёт Грота; goal/reward — без изменений: профиль торговля
  // без квестов).
  // 000320.10: профиль Наставника-големоведа — ОБУЧЕНИЕ (блоков
  // торговля/квесты/найм нет) — торговля 57 / goal 2 / reward 5 /
  // сумма 64 / уникальные предметы 41 без изменений; навыки обучения
  // — id-строки, не ссылочные свипы npc-refs (навыковых ссылок здесь
  // нет).
  // Ре-пин 000320.11: +3 зелья в торговле Зельевара (57→60, 64→67;
  // уникальных — без изменений: 000012–000014 уже в множестве 41 —
  // их продаёт Мила; goal/reward — без изменений: профиль торговля
  // без квестов).
  // Ре-пин 000320.12: +3 травы в торговле Травницы (60→63, 67→70;
  // уникальных — без изменений: 000039–000041 уже в множестве 41 —
  // их продаёт Мила; goal/reward — без изменений: профиль торговля
  // без квестов).
  // Ре-пин 000320.13: +1 чертёж алхимии в торговле Алхимика-
  // наставника (63→64, 70→71; уникальных — без изменений: 000078 уже
  // в множестве 41 — его продаёт Мила; goal/reward — без изменений:
  // блоков квесты/найм нет; торговля ОБЯЗАТЕЛЬНА контрактом D5/SRC-1
  // (000232) — наставник вида продаёт чертёж этого вида (отклонение от
  // текста ТЗ «блоков торговля нет», ТЗ вычислен без учёта SRC-1).
  // Ре-пин 000320.15: +3 свитка в торговле Торговца свитками (64→67,
  // 71→74; уникальные предметы 41→44 — свитки 000043/000045/000048
  // НОВЫЕ в множестве: ни один NPC их не продавал (Зира — реагенты/
  // книги/чертёж), ЭТО ОТКЛОНЕНИЕ от предположения ТЗ «дедуп по пути →
  // unique не растёт» — диск первичен, прецедент .13 vs текст ТЗ;
  // goal/reward — без изменений: блоков квесты/найм нет).
  assert.equal(trade, 67, 'ссылок в торговле: 67');
  assert.equal(goal, 2, 'ссылок в целях bring_item: 2');
  assert.equal(reward, 5, 'ссылок в наградах: 5');
  assert.equal(trade + goal + reward, 74, 'ссылок на предметы: 74');
  assert.equal(unique.size, 44, 'уникальных предметов: 44');
});

test('npc: schema — 4 ссылочных под-схемы зафиксированы, старые значения — отрицательная валидация', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  const buildingSub = schema.properties.постройки.items;
  assert.deepEqual(buildingSub,
    { type: 'string', pattern: '^assets/buildings/[a-z][a-z0-9_]*\\.json$' },
    'постройки.items — строка с якорным паттерном buildings (slug с '
    + '000318.06; прежний numeric-паттерн — «старое значение», ловится '
    + 'отрицательной валидацией ниже)');
  const itemSubs = [
    ['торговля.предметы[].предмет',
      schema.properties.торговля.properties.предметы.items.properties.предмет],
    ['квесты[].цель (bring_item).предмет',
      schema.properties.квесты.items.properties.цель.oneOf[1].properties.предмет],
    ['квесты[].награда.предметы[].предмет',
      schema.properties.квесты.items.properties.награда.properties.предметы.items.properties.предмет],
  ];
  for (const [name, sub] of itemSubs) {
    assert.deepEqual(sub,
      { type: 'string', pattern: '^assets/items/\\d{6}\\.json$' },
      `${name} — строка с якорным паттерном items`);
  }
  assert.notDeepEqual(validateData(buildingSub, 47, 'постройки'), [],
    'голое целое здание по новой схеме — мимо');
  assert.notDeepEqual(
    validateData(itemSubs[0][1], 'wood_sword', 'предмет'), [],
    'голый id предмета по новой схеме — мимо');
  const goalSchema = schema.properties.квесты.items.properties.цель;
  assert.notDeepEqual(
    validateData(goalSchema, { тип: 'bring_item', предмет: 'moonstone', количество: 2 }, 'цель'),
    [], 'цель bring_item с голым id предмета по новой схеме — мимо');
  assert.notDeepEqual(
    validateData(buildingSub, 'assets/buildings/' + '000047' + '.json',
      'постройки'),
    [], 'прежняя numeric-ссылка здание по схеме 000318.06 — мимо');
  assert.deepEqual(
    validateData(buildingSub, 'assets/buildings/camp.json', 'постройки'),
    [], 'якорная slug-ссылка на здание — валидна');
  assert.deepEqual(
    validateData(itemSubs[0][1], 'assets/items/000001.json', 'предмет'),
    [], 'якорная ссылка на предмет — валидна');
});

const NPC_BODY = (постройки, торговля) =>
  JSON.parse(JSON.stringify({
    id: 'test_npc',
    имя: 'Тестовый',
    роль: 'тестовая роль',
    постройки,
    диалог: [{ id: 'd', текст: 'текст', действие: 'подсказка' }],
    ...(торговля ? { торговля } : {}),
  }));

const GOOD_ASSETS = {
  'assets/buildings/camp.json': JSON.stringify({ id: 47 }),
  'assets/buildings/tavern.json': JSON.stringify({ id: 44 }),
  'assets/items/000001.json': JSON.stringify({ id: 'wood_sword' }),
};

function makeTmpNpcRepo(npc, assets) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'npc-refs-'));
  fs.mkdirSync(path.join(dir, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'assets', 'npc'), { recursive: true });
  for (const [rel, content] of Object.entries(assets)) {
    fs.mkdirSync(path.join(dir, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), content, 'utf8');
  }
  fs.writeFileSync(path.join(dir, 'assets', 'npc', '000001.json'),
    JSON.stringify(npc), 'utf8');
  fs.copyFileSync(path.join(ROOT, 'scripts', 'sync-npc-data.js'),
    path.join(dir, 'scripts', 'sync-npc-data.js'));
  for (const libFile of ['write-atomic.js', 'json-ref.js']) {
    // 000318.06: buildRefMap читает реестр имён из json-ref.js —
    // без его копирки tmp-запуск падает MODULE_NOT_FOUND (прецедент .01).
    fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', libFile),
      path.join(dir, 'scripts', 'lib', libFile));
  }
  fs.writeFileSync(path.join(dir, 'src', 'npc-data.js'),
    'SENTINEL: зеркало не испечено\n', 'utf8');
  return dir;
}

function withTmpRepo(npc, assets, fn) {
  const dir = makeTmpNpcRepo(npc, assets);
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function runNpcSync(dir) {
  return spawnSync(process.execPath,
    [path.join(dir, 'scripts', 'sync-npc-data.js')],
    { encoding: 'utf8' });
}

function expectSyncFailure(dir, stderrMustInclude) {
  const res = runNpcSync(dir);
  assert.notEqual(res.status, 0,
    'битая/чужая ссылка: sync обязан завершиться exit != 0 (получено ' +
    res.status + ', stdout: ' + (res.stdout || '').trim() + ')');
  for (const name of stderrMustInclude) {
    assert.ok(res.stderr && res.stderr.includes(name),
      `stderr обязан назвать «${name}»: ${res.stderr || ''}`);
  }
  assert.equal(fs.readFileSync(path.join(dir, 'src', 'npc-data.js'), 'utf8'),
    'SENTINEL: зеркало не испечено\n',
    'при ошибке sync зеркало не должно испекаться');
}

test('sync-npc-data.js: битая/чужая ссылка — exit 1, зеркало не испечено (tmp-дерево), корректная — id-форма', () => {
  withTmpRepo(
    NPC_BODY(['assets/buildings/' + 'camp99' + '.json']),
    GOOD_ASSETS,
    (dir) => expectSyncFailure(dir, ['000001.json']));

  withTmpRepo(
    NPC_BODY(['assets/buildings/camp.json']),
    { ...GOOD_ASSETS, 'assets/buildings/camp.json': '{ не JSON' },
    (dir) => expectSyncFailure(dir, ['camp.json']));

  withTmpRepo(
    NPC_BODY(['assets/buildings/camp.json']),
    { ...GOOD_ASSETS, 'assets/buildings/camp.json': JSON.stringify({ имя: 'без id' }) },
    (dir) => expectSyncFailure(dir, ['camp.json']));

  withTmpRepo(
    NPC_BODY([44], { предметы: [{ предмет: 'wood_sword', mult_продажи: 1, количество: 1 }] }),
    GOOD_ASSETS,
    (dir) => expectSyncFailure(dir, ['000001.json']));

  withTmpRepo(
    NPC_BODY(['assets/buildings/camp.json'],
      { предметы: [{ предмет: 'assets/items/000001.json', mult_продажи: 1, количество: 1 }] }),
    GOOD_ASSETS,
    (dir) => {
      const ok = runNpcSync(dir);
      assert.equal(ok.status, 0,
        'корректные ссылки: sync обязан завершиться exit 0: ' + (ok.stderr || ok.stdout));
      const baked = fs.readFileSync(path.join(dir, 'src', 'npc-data.js'), 'utf8');
      assert.ok(baked.includes('постройки: [47]'),
        'в зеркале постройка в id-форме (47): ' + baked);
      assert.ok(baked.includes('предмет: "wood_sword"'),
        'в зеркале предмет в id-форме ("wood_sword"): ' + baked);
      assert.ok(!baked.includes('assets/buildings/') && !baked.includes('assets/items/'),
        'ссылки не должны просочиться в зеркало: ' + baked);
    });
});

test('sync-npc-data.js: существует, exit 0, идемпотентен (byte-identical), зеркало в id-форме', () => {
  const script = path.join(ROOT, 'scripts', 'sync-npc-data.js');
  assert.ok(fs.existsSync(script), 'scripts/sync-npc-data.js не существует');
  const outFile = path.join(ROOT, 'src', 'npc-data.js');
  const committed = spawnSync('git', ['show', 'HEAD:src/npc-data.js'],
    { cwd: ROOT });
  assert.equal(committed.status, 0,
    'git show HEAD:src/npc-data.js не выполнен: ' + (committed.stderr || ''));
  const syncAndRead = () => {
    const res = spawnSync(process.execPath, [script],
      { cwd: ROOT, encoding: 'utf8' });
    assert.equal(res.status, 0,
      'скрипт завершился с ошибкой: ' + (res.stderr || res.stdout));
    return fs.readFileSync(outFile);
  };
  let after = syncAndRead();
  if (!after.equals(committed.stdout)) {
    after = syncAndRead();
  }
  assert.deepEqual(after, committed.stdout,
    'регенерация из JSON не совпала с закоммиченным src/npc-data.js ' +
    '(не идемпотентно или дрейф)');
  const leaked = [];
  (function walk(v) {
    if (Array.isArray(v)) {
      v.forEach(walk);
      return;
    }
    if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
      return;
    }
    if (typeof v === 'string' && (BUILDING_REF.test(v) || ITEM_REF.test(v))) {
      leaked.push(v);
    }
  })(NPCS);
  assert.deepEqual(leaked, [],
    'в зеркале строки-ссылки (зеркало обязано быть в id-форме): ' + leaked.join(', '));
});
