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

const BUILDING_REF = /^assets\/buildings\/\d{6}\.json$/;
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

test('npc: постройки — строки-ссылки assets/buildings, резолюция, id цели = id зеркала (20/14)', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 18, 'в каталоге NPC 18 файлов');
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
  assert.equal(total, 20, 'ссылок на постройки: 20');
  assert.equal(unique.size, 14, 'уникальных зданий: 14');
});

test('npc: предметы — строки-ссылки assets/items (торговля/цель bring_item/награда), резолюция (50/41, ре-пин 000232)', () => {
  const files = listNpcFiles();
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
  // 35→41 — 6 новых уникальных id).
  assert.equal(trade, 46, 'ссылок в торговле: 46');
  assert.equal(goal, 1, 'ссылок в целях bring_item: 1');
  assert.equal(reward, 3, 'ссылок в наградах: 3');
  assert.equal(trade + goal + reward, 50, 'ссылок на предметы: 50');
  assert.equal(unique.size, 41, 'уникальных предметов: 41');
});

test('npc: schema — 4 ссылочных под-схемы зафиксированы, старые значения — отрицательная валидация', () => {
  const schema = JSON.parse(
    fs.readFileSync(path.join(DIR, 'schema.json'), 'utf8'));
  const buildingSub = schema.properties.постройки.items;
  assert.deepEqual(buildingSub,
    { type: 'string', pattern: '^assets/buildings/\\d{6}\\.json$' },
    'постройки.items — строка с якорным паттерном buildings');
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
  assert.deepEqual(
    validateData(buildingSub, 'assets/buildings/000047.json', 'постройки'),
    [], 'якорная ссылка на здание — валидна');
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
  'assets/buildings/000047.json': JSON.stringify({ id: 47 }),
  'assets/buildings/000044.json': JSON.stringify({ id: 44 }),
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
  fs.copyFileSync(path.join(ROOT, 'scripts', 'lib', 'write-atomic.js'),
    path.join(dir, 'scripts', 'lib', 'write-atomic.js'));
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
    NPC_BODY(['assets/buildings/000099.json']),
    GOOD_ASSETS,
    (dir) => expectSyncFailure(dir, ['000001.json']));

  withTmpRepo(
    NPC_BODY(['assets/buildings/000047.json']),
    { ...GOOD_ASSETS, 'assets/buildings/000047.json': '{ не JSON' },
    (dir) => expectSyncFailure(dir, ['000047.json']));

  withTmpRepo(
    NPC_BODY(['assets/buildings/000047.json']),
    { ...GOOD_ASSETS, 'assets/buildings/000047.json': JSON.stringify({ имя: 'без id' }) },
    (dir) => expectSyncFailure(dir, ['000047.json']));

  withTmpRepo(
    NPC_BODY([44], { предметы: [{ предмет: 'wood_sword', цена_покупки: 1, цена_продажи: 1, количество: 1 }] }),
    GOOD_ASSETS,
    (dir) => expectSyncFailure(dir, ['000001.json']));

  withTmpRepo(
    NPC_BODY(['assets/buildings/000047.json'],
      { предметы: [{ предмет: 'assets/items/000001.json', цена_покупки: 1, цена_продажи: 1, количество: 1 }] }),
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
