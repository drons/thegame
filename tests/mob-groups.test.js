// Стационарные группы мобов: каталог assets/mob_groups (задача 000057,
// подзадача 000053 — JSON в assets/ первичный источник).
//
// Проверяем:
//  * каталог assets/mob_groups: ровно 000001..000007.json + schema.json,
//    id = номер файла (1..7);
//  * миграция 1:1 — названия/составы/спрайт-виды = ТЕКУЩИЕ значения
//    кода master (literal'ы зашиты в тест: не читаем FALLBACK_* из
//    src/ — иначе циклично);
//  * ссылочную целостность: id мобов в состав.мобы ∈ assets/mobs;
//    число — [min,max], min<=max; размер группы 2..6 (SPEC «Состав
//    групп»);
//  * фолбэк-модуль src/mob-groups-data.js: шапка GENERATED, НОЛЬ
//    require внутри (vm-песочницы не должны тянуть его зависимости,
//    паттерн 000049), браузерная ветка — Game.MobGroupsData;
//  * зеркала: MOB_GROUPS (mob-groups-data.js) ≡ JSON; GROUP_RECIPES
//    (combat.js) ≡ каталог (id−1 = тип группы); MOB_KINDS (sprites.js)
//    ≡ каталог (спрайт, id−1 = тип);
//  * ленивый доступ map.js: mobGroupCount()/mobGroupName(index)
//    (паттерн buildingCount/buildingNames из 000055);
//  * golden: составы createCombat на фиксированных сидах — детерминизм
//    (значение ДО миграции; после переноса тест обязан пройти без
//    изменений).
//
// Схему каталога (разрешённые ключи, валидация файлов, отрицательный
// контроль) покрывает общий tests/assets-schemas.test.js (CATALOGS +=
// 'mob_groups').

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'assets', 'mob_groups');
const MOBS_DIR = path.join(ROOT, 'assets', 'mobs');

function catalogFiles() {
  // Ровно 7 файлов 000001..000007.json (без schema.json).
  const files = fs.readdirSync(DIR).filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(files.length, 7, 'ровно 7 файлов группы: ' + files.join(', '));
  return files.map((f) => {
    assert.equal(f, String(files.indexOf(f) + 1).padStart(6, '0') + '.json',
      'пропуск в нумерации: ' + f);
    return JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8'));
  });
}

// id мобов каталога assets/mobs (source of truth — задача 000022).
function mobIds() {
  const files = fs.readdirSync(MOBS_DIR).filter((f) => /^\d{6}\.json$/.test(f));
  const ids = new Set();
  for (const f of files) {
    ids.add(JSON.parse(fs.readFileSync(path.join(MOBS_DIR, f), 'utf8')).id);
  }
  return ids;
}

// --- Миграционный 1:1 (закрытый литерал master) ---
// Текущие значения (src/map.js MOB_GROUP_NAMES, src/combat.js
// GROUP_RECIPES, src/sprites.js MOB_KINDS) — перенос обязан сохранить
// их ДОСЛОВНО: имя рецепта живёт в логе боя (src/combat.js) и тестах,
// ПОРЯДОК мобов определяет расстановку юнитов (детерминизм боя).

const EXPECTED_GROUPS = [
  {
    id: 1,
    название: 'орочий лагерь',
    состав: {
      название: 'orc_camp',
      мобы: ['orc_warrior', 'orc_warrior', 'orc_archer', 'orc_shaman'],
    },
    спрайт: 'orc',
  },
  {
    id: 2,
    название: 'орочий набеги',
    состав: {
      название: 'orc_raid',
      мобы: ['orc_rider', 'orc_rider', 'orc_mad'],
    },
    спрайт: 'orc',
  },
  {
    id: 3,
    название: 'логово скелетов',
    состав: {
      название: 'skeleton_den',
      мобы: ['skeleton', 'skeleton', 'skeleton', 'crawling_bones', 'crawling_bones'],
    },
    спрайт: 'skeleton',
  },
  {
    id: 4,
    название: 'волчья стая',
    состав: {
      название: 'wolf_pack',
      число: [3, 6],
      мобы: ['wolf'],
    },
    спрайт: 'wolf',
  },
  {
    id: 5,
    название: 'паучье гнездо',
    состав: {
      название: 'spider_nest',
      мобы: ['spider', 'spider', 'spider', 'centipede'],
    },
    спрайт: 'spider',
  },
  {
    id: 6,
    название: 'круг стихийников',
    состав: {
      название: 'elemental_circle',
      мобы: ['fire_elemental', 'wind_elemental', 'water_elemental', 'fairy'],
    },
    спрайт: 'elemental',
  },
  {
    id: 7,
    название: 'дух бездны',
    состав: {
      название: 'abyss_spirit',
      мобы: ['abomination', 'lower_demon', 'succubus'],
    },
    спрайт: 'abyss',
  },
];

test('каталог assets/mob_groups: ровно 000001..000007.json + schema.json, id = номер файла', () => {
  assert.ok(fs.existsSync(DIR), 'каталога assets/mob_groups нет (задача 000057)');
  const files = fs.readdirSync(DIR).sort();
  for (const f of files) {
    assert.ok(/^\d{6}\.json$/.test(f) || f === 'schema.json',
      'чужой файл в assets/mob_groups: ' + f);
  }
  const dataFiles = files.filter((f) => /^\d{6}\.json$/.test(f));
  assert.equal(dataFiles.length, 7, 'ровно 7 групп');
  for (let i = 0; i < 7; i++) {
    const num = String(i + 1).padStart(6, '0');
    assert.equal(dataFiles[i], num + '.json', `файл ${dataFiles[i]} вместо ${num}.json`);
    const data = JSON.parse(fs.readFileSync(path.join(DIR, dataFiles[i]), 'utf8'));
    assert.equal(data.id, i + 1, `${num}.json: id = номер файла`);
  }
  assert.ok(fs.existsSync(path.join(DIR, 'schema.json')), 'нет schema.json');
});

test('миграция 1:1: названия/составы (имя рецепта + порядок мобов + число)/спрайт-виды = текущие значения master', () => {
  const files = catalogFiles();
  for (let i = 0; i < 7; i++) {
    const f = files[i], e = EXPECTED_GROUPS[i];
    assert.equal(f.название, e.название,
      `${e.id}: название «${f.название}» ≠ «${e.название}»`);
    assert.equal(typeof f.состав, 'object', `${e.id}: нет поля «состав»`);
    assert.equal(f.состав.название, e.состав.название,
      `${e.id}: имя рецепта «${f.состав.название}» ≠ «${e.состав.название}» (живёт в логе боя)`);
    assert.deepEqual(f.состав.мобы, e.состав.мобы,
      `${e.id}: порядок/состав мобов изменился`);
    if (e.состав.число) {
      assert.deepEqual(f.состав.число, e.состав.число,
        `${e.id}: число ${JSON.stringify(f.состав.число)} ≠ ${JSON.stringify(e.состав.число)}`);
    } else {
      assert.ok(!('число' in f.состав), `${e.id}: лишнее поле «число»`);
    }
    assert.equal(f.спрайт, e.спрайт,
      `${e.id}: спрайт «${f.спрайт}» ≠ «${e.спрайт}»`);
  }
});

test('ссылочная целостность: id мобов ∈ assets/mobs; число [min,max], min<=max; размер группы 2..6 (SPEC)', () => {
  const ids = mobIds();
  const files = catalogFiles();
  for (let i = 0; i < 7; i++) {
    const f = files[i];
    for (const m of f.состав.мобы) {
      assert.ok(ids.has(m), `${f.id}: моб «${m}» нет в assets/mobs`);
    }
    if ('число' in f.состав) {
      const [min, max] = f.состав.число;
      assert.ok(Number.isInteger(min) && Number.isInteger(max),
        `${f.id}: число — целые [min,max]`);
      assert.ok(min <= max, `${f.id}: число[0] > число[1]`);
      assert.ok(min >= 2 && max <= 6, `${f.id}: размер группы вне 2..6 (SPEC «Состав групп»)`);
    } else {
      const n = f.состав.мобы.length;
      assert.ok(n >= 2 && n <= 6, `${f.id}: размер группы ${n} вне 2..6 (SPEC «Состав групп»)`);
    }
    // Доминирующий тип локации — всегда есть (SPEC): moby[0].
    assert.ok(ids.has(f.состав.мобы[0]), `${f.id}: доминирующий моб неизвестен`);
  }
});

// --- Фолбэк-модуль src/mob-groups-data.js ---

test('src/mob-groups-data.js: шапка GENERATED (интерфейс sync-скриптов, 000054/000059)', () => {
  const p = path.join(ROOT, 'src', 'mob-groups-data.js');
  assert.ok(fs.existsSync(p), 'src/mob-groups-data.js не существует (задача 000057)');
  const src = fs.readFileSync(p, 'utf8');
  assert.ok(src.includes('GENERATED — не править руками, синхронизируется из assets/mob_groups (scripts/sync-mob-groups-data.js)'),
    'в шапке нет пометки «GENERATED — не править руками»');
});

test('src/mob-groups-data.js: НОЛЬ require внутри; браузерная ветка — Game.MobGroupsData (vm без require)', () => {
  // Паттерн 000049/000053: vm-песочницы (combat-ui/sprites) не должны
  // тянуть зависимости модуля — ни require, ни module/exports.
  const code = fs.readFileSync(path.join(ROOT, 'src', 'mob-groups-data.js'), 'utf8');
  assert.ok(!code.includes('require('), 'модуль содержит require( — vm-песочница упадёт');
  const sandbox = {};
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'mob-groups-data.js' });
  const MG = sandbox.Game.MobGroupsData;
  assert.ok(MG && Array.isArray(MG.MOB_GROUPS),
    'браузерная ветка: Game.MobGroupsData.MOB_GROUPS — массив');
  assert.equal(MG.MOB_GROUPS.length, 7, '7 записей');
});

test('зеркало ≡ JSON: MOB_GROUPS из src/mob-groups-data.js deepEqual файлам каталога (позиция = id−1)', () => {
  const { MOB_GROUPS } = require(path.join(ROOT, 'src', 'mob-groups-data.js'));
  const files = catalogFiles();
  assert.equal(MOB_GROUPS.length, 7, '7 записей в зеркале');
  for (let i = 0; i < 7; i++) {
    assert.equal(MOB_GROUPS[i].id, i + 1, `позиция ${i}: id = позиция + 1`);
    assert.deepEqual(MOB_GROUPS[i], files[i],
      `00000${i + 1}.json совпадает с JS-зеркалом`);
  }
});

test('sync-mob-groups-data.js: существует, exit 0, идемпотентен (повторный запуск — byte-identical)', () => {
  const { spawnSync } = require('node:child_process');
  const script = path.join(ROOT, 'scripts', 'sync-mob-groups-data.js');
  assert.ok(fs.existsSync(script), 'scripts/sync-mob-groups-data.js не существует');
  const outFile = path.join(ROOT, 'src', 'mob-groups-data.js');
  const before = fs.readFileSync(outFile);
  const res = spawnSync(process.execPath, [script], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(res.status, 0,
    'скрипт завершился с ошибкой: ' + (res.stderr || res.stdout));
  assert.deepEqual(fs.readFileSync(outFile), before,
    'повторный запуск скрипта изменил src/mob-groups-data.js (не идемпотентно)');
});

test('sync-mob-groups-data.js: выход пишется атомарно через scripts/lib/write-atomic.js (конвенция 000054)', () => {
  // Окно гонки: node --test гоняет тесты параллельными процессами;
  // регенерация src/mob-groups-data.js (например, sync-all.js из 000054
  // под CI) неатомарным fs.writeFileSync (truncate+write) позволила бы
  // параллельному воркеру с top-level require зеркала (этот тест,
  // транзитивно map/combat/sprites-тесты) прочитать частичный файл →
  // редкий ложный красный. Конвенция: ВСЕ sync-скрипты пишут выход
  // через write-atomic.js (tmp + rename).
  const script = path.join(ROOT, 'scripts', 'sync-mob-groups-data.js');
  const src = fs.readFileSync(script, 'utf8');
  assert.ok(/require\(['"][^'"]*write-atomic\.js['"]\)/.test(src),
    'sync-mob-groups-data.js обязан использовать scripts/lib/write-atomic.js (конвенция 000054)');
  assert.ok(!/fs\.writeFileSync\s*\(/.test(src),
    'прямой fs.writeFileSync — неатомарная запись; нужен writeFileAtomic');
  assert.ok(fs.existsSync(path.join(ROOT, 'scripts', 'lib', 'write-atomic.js')),
    'scripts/lib/write-atomic.js не существует');
});

test('package.json: npm-скрипт sync:mobgroups (интерфейс единый с sync:buildings)', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['sync:mobgroups'], 'node scripts/sync-mob-groups-data.js');
});

// --- Зеркала в потребителях (id − 1 = тип группы, как в hash2 % 7) ---

test('зеркало: GROUP_RECIPES (combat.js) ≡ каталогу (название/мобы/число по id−1)', () => {
  const { GROUP_RECIPES } = require(path.join(ROOT, 'src', 'combat.js'));
  const files = catalogFiles();
  const keys = Object.keys(GROUP_RECIPES).map(Number).sort((a, b) => a - b);
  assert.deepEqual(keys, [0, 1, 2, 3, 4, 5, 6], 'ровно 7 рецептов, типы 0..6');
  for (let i = 0; i < 7; i++) {
    const r = GROUP_RECIPES[i], f = files[i];
    assert.equal(r.name, f.состав.название,
      `тип ${i}: recipe.name «${r.name}» ≠ каталожному «${f.состав.название}»`);
    assert.deepEqual(r.mobs, f.состав.мобы, `тип ${i}: состав мобов ≠ каталогу`);
    if ('число' in f.состав) {
      assert.deepEqual(r.count, f.состав.число, `тип ${i}: count ≠ каталогу`);
    } else {
      assert.equal(r.count, undefined, `тип ${i}: лишнее count`);
    }
  }
});

test('зеркало: MOB_KINDS (sprites.js) ≡ каталогу (спрайт по id−1)', () => {
  const S = require(path.join(ROOT, 'src', 'sprites.js'));
  const files = catalogFiles();
  for (let i = 0; i < 7; i++) {
    assert.equal(S.MOB_KINDS[i], files[i].спрайт,
      `тип ${i}: MOB_KINDS «${S.MOB_KINDS[i]}» ≠ каталожному «${files[i].спрайт}»`);
  }
});

test('map.js: mobGroupCount()/mobGroupName(index) — 7 и текущие 7 имён; неизвестный индекс — пустая строка', () => {
  const M = require(path.join(ROOT, 'src', 'map.js'));
  assert.equal(typeof M.mobGroupCount, 'function', 'map.js: нет функции mobGroupCount()');
  assert.equal(typeof M.mobGroupName, 'function', 'map.js: нет функции mobGroupName()');
  assert.equal(M.mobGroupCount(), 7, 'ровно 7 стационарных групп');
  for (let i = 0; i < 7; i++) {
    assert.equal(M.mobGroupName(i), EXPECTED_GROUPS[i].название,
      `имя ${i} — из каталога/фолбэка (текущее значение)`);
  }
  assert.equal(M.mobGroupName(7), '', 'индекс за каталогом — пустая строка');
  assert.equal(M.mobGroupName(-1), '', 'отрицательный индекс — пустая строка');
});

// --- Golden: детерминизм составов боя (закрытый до миграции) ---
// createCombat при фиксированном сиде: последовательность mobId НЕ
// меняется после переноса GROUP_RECIPES в каталог. Волчья стая
// (число [3,6]) — разные сиду дают разные размеры: seed 1 → 3,
// seed 5 → 6 (диапазон закреплён).

const GOLDEN_COMPOSITIONS = {
  42: [
    ['orc_warrior', 'orc_warrior', 'orc_archer', 'orc_shaman'], // орочий лагерь
    ['orc_rider', 'orc_rider', 'orc_mad'],                        // орочий набеги
    ['skeleton', 'skeleton', 'skeleton', 'crawling_bones', 'crawling_bones'], // логово скелетов
    ['wolf', 'wolf', 'wolf', 'wolf'],                              // волчья стая
    ['spider', 'spider', 'spider', 'centipede'],                   // паучье гнездо
    ['fire_elemental', 'wind_elemental', 'water_elemental', 'fairy'], // круг стихийников
    ['abomination', 'lower_demon', 'succubus'],                    // дух бездны
  ],
};

test('golden: createCombat — составы всех 7 типов при фиксированном сиде 42 (до/после переноса — идентично)', () => {
  const { createCombat } = require(path.join(ROOT, 'src', 'combat.js'));
  const { createCharacter } = require(path.join(ROOT, 'src', 'player.js'));
  for (let t = 0; t < 7; t++) {
    const p = createCharacter();
    const c = createCombat({ player: p, groupType: t, seed: 42 });
    assert.deepEqual(
      c.units.map((u) => u.mobId),
      GOLDEN_COMPOSITIONS[42][t],
      `тип ${t}, seed 42: состав юнитов изменился`);
    // SPEC «Состав групп»: 2–6 мобов.
    assert.ok(c.units.length >= 2 && c.units.length <= 6,
      `тип ${t}: ${c.units.length} мобов вне 2..6`);
  }
});

test('golden: волчья стая — число [3,6] детерминировано сидом (seed 1 → 3, seed 5 → 6)', () => {
  const { createCombat } = require(path.join(ROOT, 'src', 'combat.js'));
  const { createCharacter } = require(path.join(ROOT, 'src', 'player.js'));
  const c3 = createCombat({ player: createCharacter(), groupType: 3, seed: 1 });
  assert.deepEqual(c3.units.map((u) => u.mobId), ['wolf', 'wolf', 'wolf'],
    'seed 1: ровно 3 волка');
  const c6 = createCombat({ player: createCharacter(), groupType: 3, seed: 5 });
  assert.deepEqual(c6.units.map((u) => u.mobId),
    ['wolf', 'wolf', 'wolf', 'wolf', 'wolf', 'wolf'],
    'seed 5: ровно 6 волков');
});
