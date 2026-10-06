// Регрессия порядка загрузки скриптов в index.html (задача 000018).
//
// Буг, который ловит этот файл: scripts в index.html стояли в порядке
// ui.js → controls.js, а IIFE в ui.js, собирающая Game.touchControls,
// начиналась с guard `if (!G.layoutTouchControls || !G.touchActionAt)
// return;` — в момент выполнения ui.js этих функций ещё не было (они
// живут в controls.js). Result: Game.touchControls === undefined всегда,
// D-pad и кнопка «E» не создавались НИКОГДА, на чистом тачскрине у
// игрока не было управления, а node-тесты ядра controls.js были зелёные
// (DOM-клей не покрывался).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const uiCode = fs.readFileSync(path.join(ROOT, 'src', 'ui.js'), 'utf8');
const controlsCode = fs.readFileSync(path.join(ROOT, 'src', 'controls.js'), 'utf8');
const combatKeysCode = fs.readFileSync(
  path.join(ROOT, 'src', 'combat-keys.js'), 'utf8');
// motion.js (задача 000033) в стадии красных тестов ещё не создан —
// читаем лениво, чтобы остальные тесты этого файла продолжали работать.
const motionPath = path.join(ROOT, 'src', 'motion.js');
const motionCode = fs.existsSync(motionPath)
  ? fs.readFileSync(motionPath, 'utf8') : null;

// Порядок <script src="…"> в index.html.
const scripts = Array.from(
  html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
const pos = (f) => scripts.indexOf(f);

test('index.html: нужные модули подключены', () => {
  for (const f of [
    'src/global-settings.js', 'src/day.js', 'src/sheet.js', 'src/player.js',
    'src/items.js', 'src/controls.js', 'src/combat-keys.js',
    'src/ui.js', 'src/sprites.js', 'src/combat-ui.js', 'src/save.js',
    'src/dungeon.js', 'src/cities.js', 'src/locations.js',
    'src/dungeon-ui.js',
    'src/dungeons-data.js',
    'src/visuals-data.js',
    'src/building-effects.js',
    'src/building-ui.js',
    'src/building-actions.js',
    'src/building-effect-44_rest.js',
    // 000137: спец-модуль «Выступление» (рядом с 44_rest — слот
    // спец-модулей таверны; порядок закрепляет IO1).
    'src/building-effect-44_perform.js',
    'src/building-content.js',
    'src/building-effect-45.js',
    'src/building-effect-48.js',
    'src/building-effect-camp.js',
    'src/building-effect-49.js',
    // 000133: слот спец-модулей (после 49, до hud.js).
    'src/building-effect-runes.js',
    'src/hud.js',
    // Слот спец-модулей 000128 (после hud.js, до visuals-data.js);
    // добавлено на зелёной стадии (план красной — см. коммит
    // «Задача 000126: красные тесты»: «ОТЛОЖЕНО на зелёную стадию»).
    'src/craft-ui.js',
    'src/motion.js',
    // Стартовое окно (задача 000138): слот утилит МЕЖДУ motion.js и
    // main.js (UMD-ловушка 000038: main.js снимает Game один раз —
    // Game.startWindow обязан быть в снапшоте; пин SW-O1 ниже).
    'src/start-window.js',
    // Портреты партии (задача 000142): зеркало assets/portraits
    // (конец ведущей группы данных — после mob-groups-data.js,
    // до map.js).
    'src/portraits-data.js',
    // Партия (задача 000145): Game.Party = {list, active} — ДО
    // вкладочных модулей и ui.js (снапшот-ловушка 000038 —
    // пин порядка ниже).
    'src/party.js',
    'src/main.js',
  ]) {
    assert.notEqual(pos(f), -1, f + ' не подключён в index.html');
  }
});

test('index.html: dungeons-data.js подключён и ДО dungeon.js (UMD: каталог читается при загрузке dungeon.js)', () => {
  // dungeon.js (браузерная ветка) при ЗАГРУЗКЕ читает каталог подземелий
  // из Game.DungeonsData (src/dungeons-data.js, задача 000058). УМД-ловушка
  // (000038): данные должны быть в Game раньше, чем dungeon.js снимает его;
  // битый порядок не падает при загрузке, а тихо даёт fallback-литералы —
  // поэтому порядок закреплён здесь.
  assert.notEqual(pos('src/dungeons-data.js'), -1,
    'src/dungeons-data.js не подключён в index.html (задача 000058)');
  assert.ok(pos('src/dungeons-data.js') < pos('src/dungeon.js'),
    'src/dungeons-data.js должен быть раньше src/dungeon.js (задача 000058)');
});

// --- Задача 000059: каталог декораций (assets/visuals) ---
//
// sprites.js (браузерная ветка) при ЗАГРУЗКЕ снимает каталог декораций
// из Game.VisualsData (src/visuals-data.js, генерируется
// scripts/sync-visuals-data.js, npm sync:visuals). В node-ветке —
// require('./visuals-data.js'). Без data-модуля (vm-песочницы)
// sprites.js обязан деградировать до пустого каталога (гард, покрыт
// tests/sprites.test.js), а не падать.

test('index.html: visuals-data.js подключён и ДО sprites.js (UMD: каталог снимается при загрузке sprites.js)', () => {
  // sprites.js снимает Game один раз при загрузке (UMD-ловушка,
  // 000038): данные должны быть в Game раньше, чем sprites.js его
  // снимает. Битый порядок не падает при загрузке, а тихо даёт
  // пустой каталог (гард) — декорации пропадают молча, поэтому
  // порядок закреплён здесь (паттерн dungeons-data.js < dungeon.js,
  // задача 000058).
  assert.notEqual(pos('src/visuals-data.js'), -1,
    'src/visuals-data.js не подключён в index.html (задача 000059)');
  assert.ok(pos('src/visuals-data.js') < pos('src/sprites.js'),
    'src/visuals-data.js должен быть раньше src/sprites.js (задача 000059)');
});

test('порядок core → visuals-data.js → sprites.js: Game.VisualsData в браузерном realm, каталог 1:1 с JSON', () => {
  // Минимальная «браузерная» цепочка: data-модуль ДО потребителя.
  // В node-ветке sprites.js требует visuals-data.js напрямую (покрыто
  // tests/sprites.test.js); здесь — браузерная проводка через Game.
  const dataModule = path.join(ROOT, 'src', 'visuals-data.js');
  assert.ok(fs.existsSync(dataModule),
    'src/visuals-data.js должен существовать (задача 000059)');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of ['src/global-settings.js', 'src/perlin.js', 'src/map.js',
    'src/visuals-data.js', 'src/sprites.js']) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const G = sandbox.Game;
  assert.ok(G.VisualsData && Array.isArray(G.VisualsData.VISUALS),
    'Game.VisualsData существует после data-модуля');
  const vdir = path.join(ROOT, 'assets', 'visuals');
  const vfiles = fs.readdirSync(vdir)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  assert.equal(G.VISUALS.length, vfiles.length,
    'S.VISUALS — число файлов каталога assets/visuals');
  for (let i = 0; i < vfiles.length; i++) {
    const j = JSON.parse(
      fs.readFileSync(path.join(vdir, vfiles[i]), 'utf8'));
    // Разные realm: объекты vm-контекста — чужой прототип, сравниваем
    // по полям (паттерн теста dungeons-data выше).
    assert.equal(G.VISUALS[i].id, j.id, vfiles[i] + ': id');
    assert.equal(G.VISUALS[i].название, j.название, vfiles[i] + ': название');
    assert.deepEqual([...G.VISUALS[i].террейны], j.террейны,
      vfiles[i] + ': террейны');
    assert.equal(G.VISUALS[i].спрайт, j.спрайт, vfiles[i] + ': спрайт');
    assert.equal(G.VISUALS[i].частота, j.частота, vfiles[i] + ': частота');
    assert.equal(G.VISUALS[i].размер, j.размер, vfiles[i] + ': размер');
  }
  // tileVisuals работает в браузерном realm (каталог подхвачен).
  let nonEmpty = 0;
  for (let ty = 0; ty < 40; ty++) {
    for (let tx = 0; tx < 40; tx++) {
      if (G.tileVisuals(tx, ty, G.TERRAIN.GRASS).length) nonEmpty++;
    }
  }
  assert.ok(nonEmpty > 0, 'tileVisuals не пуст (каталог подхвачен)');
});

test('index.html: controls.js ДО dungeon-ui.js (иначе Game.deltaForEvent не виден)', () => {
  // dungeon-ui.js снимает Game один раз при загрузке
  // (const G = globalThis.Game) и передаёт нажатия в
  // Game.deltaForEvent (controls.js, задача 000043). Битый порядок не
  // падаёт при загрузке, а ломает управление подземельем тихо —
  // поэтому порядок закреплён здесь, а guard с console.error ловит
  // остаток (tests/dungeon-ui.test.js). Паттерн пары
  // controls.js → combat-keys.js (задача 000048).
  assert.ok(
    pos('src/controls.js') < pos('src/dungeon-ui.js'),
    'src/controls.js должен быть раньше src/dungeon-ui.js (задача 000043)');
});

test('index.html: controls.js ДО ui.js (иначе Game.touchControls не создаётся)', () => {
  assert.ok(
    pos('src/controls.js') < pos('src/ui.js'),
    'src/controls.js должен быть ПОСЛЕДОВАТЕЛЬНО раньше src/ui.js: ' +
      'ui.js при загрузке собирает Game.touchControls из ' +
      'Game.layoutTouchControls/Game.touchActionAt (задача 000018)');
});

test('index.html: controls.js ДО combat-keys.js, combat-keys.js ДО combat-ui.js', () => {
  // combat-keys.js при ЗАГРУЗКЕ строит строки движения таблицы боя из
  // Game.CODE_DIRS/Game.DIR_DELTA (controls.js) — иначе console.error
  // и Game.CombatKeys не создаётся.
  assert.ok(
    pos('src/controls.js') < pos('src/combat-keys.js'),
    'src/controls.js должен быть раньше src/combat-keys.js (задача 000048)');
  // combat-ui.js при ЗАГРУЗКЕ читает Game.CombatKeys (guard с
  // console.error) и из него — keydown/кнопки.
  assert.ok(
    pos('src/combat-keys.js') < pos('src/combat-ui.js'),
    'src/combat-keys.js должен быть раньше src/combat-ui.js (задача 000048)');
});

test('index.html: map.js ДО buildings.js и ДО sprites.js (единая таблица террейнов, задача 000056)', () => {
  // Единая таблица TERRAIN_DATA живёт в map.js; потребители без
  // собственных копий — buildings.js (passableTiles/denseTiles) и
  // sprites.js (TILE_BASE). map.js обязан давать таблицу ДО загрузки
  // потребителей (те берут данные из Game при вызове/загрузке) —
  // ровно тот класс «битый порядок молча» бага, ради которого создан
  // этот файл (000018). Порядок закреплён здесь, чтобы не мог сдвинуться
  // «случайно» при правке index.html.
  assert.notEqual(pos('src/map.js'), -1, 'src/map.js не подключён в index.html');
  assert.ok(
    pos('src/map.js') < pos('src/buildings.js'),
    'src/map.js должен быть раньше src/buildings.js (задача 000056)');
  assert.ok(
    pos('src/map.js') < pos('src/sprites.js'),
    'src/map.js должен быть раньше src/sprites.js (задача 000056)');
});

test('index.html: sprites.js ДО combat-ui.js (иначе Game.hpBarColor не виден)', () => {
  // Буг (ревью 000038): каждый UMD-модуль ЗАМЕНЯЕТ объект Game —
  // root.Game = Object.assign({}, root.Game, factory(...)), — а
  // combat-ui.js снимает его один раз при загрузке
  // (const G = globalThis.Game). Функция из скрипта, загружающегося
  // ПОЗЖЕ (sprites.js давал Game.hpBarColor), через захваченный G
  // недоступна НИКОГДА — ленивый вызов в render() не спасает.
  // Результат: полоса HP героя всегда рисовалась фолбэком
  // '#6fdc6f', пороговые цвета (жёлтый/красный) не срабатывали.
  assert.ok(
    pos('src/sprites.js') < pos('src/combat-ui.js'),
    'src/sprites.js должен быть раньше src/combat-ui.js (задача 000038)');
});

test('index.html: src/combat-scale.js подключён и ДО src/combat-ui.js (задача 000151)', () => {
  // UMD-ловушка (000038): combat-ui.js снимает const G =
  // globalThis.Game один раз при загрузке и читает G.combatScale
  // лениво (measureBacking) — через захваченный G функция из
  // скрипта, загружающегося ПОЗЖЕ, недоступна НИКОГДА. Битый порядок
  // не падает при загрузке: console.error ОДИН раз + деградация
  // 1:1 (бэкинг 336, бой играбелен — паттерн 000081) — поэтому
  // порядок закреплён здесь (паттерн пары sprites.js →
  // combat-ui.js, задача 000038). Пин НЕ-смежный (union): не входит
  // в общий список подключённых модулей выше — у бой-модулей свои
  // пины.
  assert.notEqual(pos('src/combat-scale.js'), -1,
    'src/combat-scale.js не подключён в index.html (задача 000151)');
  assert.ok(pos('src/combat-scale.js') < pos('src/combat-ui.js'),
    'src/combat-scale.js должен быть раньше src/combat-ui.js '
    + '(задача 000151)');
});

test('index.html: ui.js и controls.js ДО main.js', () => {
  // main.js использует Game.playerUI/npcUI/touchControls (ui.js) и
  // Game.chooseControlsScheme/moveKeyForEvent/deltaForMoveKey (controls.js).
  assert.ok(pos('src/ui.js') < pos('src/main.js'));
  assert.ok(pos('src/controls.js') < pos('src/main.js'));
  // save.js — тоже до main.js (механизм сохранения).
  assert.ok(pos('src/save.js') < pos('src/main.js'));
});

test('index.html: companions.js подключён ПОСЛЕ npc.js и ДО combat.js/ui.js/main.js (задача 000079)', () => {
  // UMD-ловушка (000018/000038): каждый UMD-модуль ЗАМЕНЯЕТ объект Game
  // (root.Game = Object.assign({}, root.Game, …)), а потребители
  // (ui.js/main.js/combat-ui.js) снимают const G = globalThis.Game один
  // раз при загрузке. companions.js обязан встать ПОСЛЕ npc.js
  // (зависимости: hireCandidates/skillLevel + perlin hash2/mulberry32 +
  // GlobalSettings) и РАНЬЕ всех, кто снимает Game и будет вызывать
  // G.companions (000083/000087 подвешивают найм/жалованье).
  assert.notEqual(pos('src/companions.js'), -1,
    'src/companions.js не подключён в index.html (задача 000079)');
  assert.ok(pos('src/npc.js') < pos('src/companions.js'),
    'src/npc.js должен быть раньше src/companions.js (задача 000079)');
  assert.ok(pos('src/companions.js') < pos('src/combat.js'),
    'src/companions.js должен быть раньше src/combat.js (задача 000079)');
  assert.ok(pos('src/companions.js') < pos('src/ui.js'),
    'src/companions.js должен быть раньше потребителя src/ui.js (задача 000079)');
  assert.ok(pos('src/companions.js') < pos('src/main.js'),
    'src/companions.js должен быть раньше потребителя src/main.js (задача 000079)');
});

test('index.html: src/mob-groups-data.js подключён и ДО src/map.js (задача 000057)', () => {
  // Каталог стационарных групп мобов (assets/mob_groups) дублируется
  // в JS-модуле для file://. Потребители — map.js (ленивые
  // mobGroupCount()/mobGroupName()), combat.js и sprites.js (чтение
  // при загрузке) — обязаны видеть Game.MobGroupsData: модуль ставим
  // в слот npc-data.js, ДО map.js.
  assert.notEqual(pos('src/mob-groups-data.js'), -1,
    'src/mob-groups-data.js не подключён в index.html (задача 000057)');
  assert.ok(pos('src/mob-groups-data.js') < pos('src/map.js'),
    'src/mob-groups-data.js должен быть раньше src/map.js (задача 000057)');
});

test('index.html: motion.js ДО main.js (main.js снимает Game один раз)', () => {
  // main.js — IIFE: const G = globalThis.Game при ЗАГРУЗКЕ. motion.js
  // обязан дать Game.createMover/CAM_TAU_MS/MIN_MOVE_INTERVAL_MS ДО
  // main.js, иначе ловушка UMD (задачи 000018/000038): захваченный G
  // не увидит функции скриптов, загруженных позже.
  assert.notEqual(pos('src/motion.js'), -1,
    'src/motion.js не подключён в index.html (задача 000033)');
  assert.ok(pos('src/motion.js') < pos('src/main.js'),
    'src/motion.js должен быть раньше src/main.js (задача 000033)');
});

// Симуляция загрузки в node: скрипты игры — обычные <script> (не модули),
// каждый собирает globalThis/Game. ui.js при ЗАГРУЗКЕ DOM не трогает
// (контролы собираются в init()), поэтому его безопасно выполнить в node.

test('порядок controls.js → ui.js: Game.touchControls существует', () => {
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(controlsCode, sandbox, { filename: 'controls.js' });
  assert.ok(sandbox.Game.layoutTouchControls,
    'controls.js должен дать Game.layoutTouchControls');
  vm.runInContext(uiCode, sandbox, { filename: 'ui.js' });
  const tc = sandbox.Game.touchControls;
  assert.ok(tc, 'Game.touchControls должен существовать после ' +
    'controls.js + ui.js (в правильном порядке)');
  for (const m of ['init', 'show', 'hide', 'isActive', 'releaseAll']) {
    assert.equal(typeof tc[m], 'function', 'touchControls.' + m);
  }
});

test('порядок ui.js → controls.js (старый битый): touchControls нет, но ошибка видна', () => {
  // Воспроизведение исходного бага: ui.js раньше controls.js → guard
  // срабатывает. Теперь он не молча возвращает, а пишет console.error
  // (регрессия: «мёртвые контролы» должны быть заметны).
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(m) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(uiCode, sandbox, { filename: 'ui.js' });
  assert.equal(sandbox.Game.touchControls, undefined,
    'без controls.js контролы не собираются');
  assert.ok(errors.length > 0, 'guard обязан оставить след в консоли');
});

test('порядок controls.js → combat-keys.js: Game.CombatKeys существует', () => {
  // Таблица боя (задача 000048) при загрузке берёт строки движения
  // из Game.CODE_DIRS/Game.DIR_DELTA — в правильном порядке модуль
  // собирается без ошибок.
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(controlsCode, sandbox, { filename: 'controls.js' });
  vm.runInContext(combatKeysCode, sandbox, { filename: 'combat-keys.js' });
  const ck = sandbox.Game.CombatKeys;
  assert.ok(ck, 'Game.CombatKeys должен существовать после ' +
    'controls.js + combat-keys.js (в правильном порядке)');
  assert.ok(ck.COMBAT_KEYS, 'COMBAT_KEYS — таблица биндингов');
  assert.equal(typeof ck.resolveCombatKey, 'function', 'resolveCombatKey');
  assert.equal(typeof ck.describeCombatKeys, 'function', 'describeCombatKeys');
  // Движ. строки действительно из controls.js: KeyA — влево, как в мире.
  // (по полям, а не deepEqual: объекты из vm-контекста — чужой realm)
  assert.equal(ck.COMBAT_KEYS.KeyA.type, 'move');
  assert.equal(ck.COMBAT_KEYS.KeyA.dx, -1);
  assert.equal(ck.COMBAT_KEYS.KeyA.dy, 0);
});

test('порядок combat-keys.js → controls.js (битый): CombatKeys нет, ошибка видна', () => {
  // combat-keys.js раньше controls.js: Game.CODE_DIRS отсутствует →
  // guard пишет console.error (паттерн ui.js), CombatKeys не создаётся.
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(m) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(combatKeysCode, sandbox, { filename: 'combat-keys.js' });
  assert.equal(sandbox.Game.CombatKeys, undefined,
    'без controls.js таблица боя не строится');
  assert.ok(errors.length > 0, 'guard обязан оставить след в консоли');
});

test('motion.js (браузерная ветка UMD): даёт Game.createMover и константы', () => {
  // motion.js — чистый модуль без зависимостей (задача 000033): в
  // браузере обязан заменить root.Game, добавив ядро плавного движения,
  // — иначе main.js (IIFE, снимает Game при загрузке) не найдёт его.
  assert.ok(motionCode !== null,
    'src/motion.js должен существовать (задача 000033)');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(motionCode, sandbox, { filename: 'motion.js' });
  for (const name of ['clamp01', 'lerp', 'lerpPos', 'easeInOut',
    'stepProgress', 'cameraStep', 'moveIntervalMs', 'createMover']) {
    assert.equal(typeof sandbox.Game[name], 'function', 'Game.' + name);
  }
  assert.ok(Number.isFinite(sandbox.Game.CAM_TAU_MS) &&
    sandbox.Game.CAM_TAU_MS > 0, 'Game.CAM_TAU_MS — положительное число');
  assert.ok(Number.isFinite(sandbox.Game.MIN_MOVE_INTERVAL_MS) &&
    sandbox.Game.MIN_MOVE_INTERVAL_MS > 0, 'Game.MIN_MOVE_INTERVAL_MS > 0');
});

// --- Задача 000045: модули заклинаний ---
//
// spells.js при ЗАГРУЗКЕ снимает боевые internals (combat.js) и каталог
// (spells-data.js) с объекта Game; combat-ui.js/dungeon-ui.js/main.js
// снимают const G = globalThis.Game один раз при загрузке (UMD-ловушка,
// задача 000038) — поэтому: combat.js < spells-data.js < spells.js <
// combat-ui.js < main.js, и spells.js — после player.js (skillPractice).

const CORE_SCRIPTS = [
  'src/global-settings.js', 'src/perlin.js', 'src/mapseed.js',
  'src/skills-data.js', 'src/items-data.js', 'src/npc-data.js',
  'src/map.js', 'src/sheet.js', 'src/player.js', 'src/day.js',
  'src/items.js', 'src/buildings.js', 'src/npc.js',
];

test('index.html: spells-data.js и spells.js подключены в правильном порядке', () => {
  assert.notEqual(pos('src/spells-data.js'), -1, 'spells-data.js не подключён');
  assert.notEqual(pos('src/spells.js'), -1, 'spells.js не подключён');
  // Ядро: player.js (P) и combat.js (internals) — раньше spells.js.
  assert.ok(pos('src/player.js') < pos('src/spells.js'),
    'src/player.js должен быть раньше src/spells.js (задача 000045)');
  assert.ok(pos('src/combat.js') < pos('src/spells-data.js'),
    'src/combat.js должен быть раньше src/spells-data.js (задача 000045)');
  // Модули идут парой, данные раньше ядра.
  assert.ok(pos('src/spells-data.js') < pos('src/spells.js'),
    'src/spells-data.js должен быть раньше src/spells.js (задача 000045)');
  // UMD-ловушка: combat-ui.js и main.js снимают Game при загрузке —
  // spells.js должен быть РАНЕЕ них (иначе Game.Spells через их G
  // недоступна никогда).
  assert.ok(pos('src/spells.js') < pos('src/combat-ui.js'),
    'src/spells.js должен быть раньше src/combat-ui.js (задача 000045)');
  assert.ok(pos('src/spells.js') < pos('src/main.js'),
    'src/spells.js должен быть раньше src/main.js (задача 000045)');
});

test('порядок core → spells-data.js → spells.js: Game.Spells существует и кастует', () => {
  // Полный «браузерный» путь: ядро из index.html (до combat.js включительно)
  // + spells-data.js + spells.js. castSpell обязан работать в чужом realm —
  // иначе UMD-проводка (internals из Game) собрана неверно.
  const files = CORE_SCRIPTS.concat(
    'src/combat.js', 'src/spells-data.js', 'src/spells.js');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const Sp = sandbox.Game.Spells;
  assert.ok(Sp, 'Game.Spells должен существовать после правильного порядка');
  for (const k of ['SPELLS', 'SPELLS_BY_ID', 'getSpell', 'schoolRank',
    'bookOf', 'canLearn', 'learn', 'highestKnown', 'activeSpells',
    'castSpell', 'canCastSpell', 'sanitizeSpellBook']) {
    assert.ok(Sp[k] !== undefined, 'Game.Spells.' + k);
  }
  // Работоспособность в браузерном realm.
  const p = sandbox.Game.createCharacter();
  p.spells = ['spark'];
  p.primary.intelligence = 10;
  const c = sandbox.Game.createCombat(
    { player: p, mobs: ['wolf'], mobLevel: 1, seed: 5 });
  const w = c.units[0];
  w.x = c.px; w.y = c.py - 1;
  const r = Sp.castSpell(c, 'spark', w.id);
  assert.equal(r.ok, true,
    'castSpell работает в браузерном realm: ' + (r.reason || 'ok'));
});

test('порядок битый: spells.js без combat.js → Game.Spells нет, guard в консоли', () => {
  // spells.js раньше combat.js (или без него): боевые internals в Game
  // отсутствуют → guard пишет console.error (паттерн 000038), модуль не
  // создаётся — «мёртвая магия» должна быть заметна.
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(m) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  const files = CORE_SCRIPTS.concat('src/spells-data.js', 'src/spells.js');
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  assert.equal(sandbox.Game.Spells, undefined,
    'без combat.js Spells не создаётся');
  assert.ok(errors.length > 0, 'guard обязан оставить след в консоли');
});

// --- Задача 000058: каталог подземелий (assets/dungeons) ---
//
// dungeon.js (браузерная ветка) при загрузке читает каталог из
// Game.DungeonsData (src/dungeons-data.js, генерируется
// scripts/sync-dungeons-data.js, npm sync:dungeons). В node-ветке —
// require('./dungeons-data.js'). Без data-модуля (vm-песочница
// tests/dungeon-ui.test.js его НЕ грузит) dungeon.js обязан деградировать
// до встроенных fallback-литералов, а не «умирать» (гард; в отличие от
// жёсткой зависимости spells.js от combat.js).

const DUNGEON_CORE = ['src/global-settings.js', 'src/perlin.js', 'src/map.js'];

test('порядок core → dungeons-data.js → dungeon.js: таблицы из каталога в браузерном realm', () => {
  const dataModule = path.join(ROOT, 'src', 'dungeons-data.js');
  assert.ok(fs.existsSync(dataModule),
    'src/dungeons-data.js должен существовать (задача 000058)');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of DUNGEON_CORE.concat('src/dungeons-data.js', 'src/dungeon.js')) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const DD = sandbox.Game.DungeonsData;
  assert.ok(DD, 'Game.DungeonsData должен существовать после data-модуля');
  assert.equal(DD.DUNGEONS.length, 5, 'DUNGEONS — 5 записей');
  // Таблицы dungeon.js (браузерная ветка) — 1:1 из каталога JSON.
  const ddir = path.join(ROOT, 'assets', 'dungeons');
  const dfiles = fs.readdirSync(ddir)
    .filter((f) => /^\d{6}\.json$/.test(f)).sort();
  for (const f of dfiles) {
    const data = JSON.parse(fs.readFileSync(path.join(ddir, f), 'utf8'));
    const t = data.id;
    assert.equal(sandbox.Game.DUNGEON_NAMES[t], data.название,
      `DUNGEON_NAMES[${t}] (${f}) — браузерная ветка`);
    // Распространение в node-массив: объекты vm-контекста — чужой realm.
    assert.deepEqual([...sandbox.Game.DUNGEON_MOBS[t]], data.мобы,
      `DUNGEON_MOBS[${t}] (${f}) — браузерная ветка`);
    assert.deepEqual([...sandbox.Game.DUNGEON_ITEMS[t]], data.предметы,
      `DUNGEON_ITEMS[${t}] (${f}) — браузерная ветка`);
    assert.equal(sandbox.Game.DUNGEON_SIZE[t], data.размер,
      `DUNGEON_SIZE[${t}] (${f}) — браузерная ветка`);
  }
  // DUNGEON_TYPES без изменений (перенумерации нет, 000049).
  for (const [name, val] of Object.entries({
    CAVE: 0, CRYPT: 1, RUINS: 2, DROWNED: 3, ABYSS: 4,
  })) {
    assert.equal(sandbox.Game.DUNGEON_TYPES[name], val,
      'DUNGEON_TYPES.' + name);
  }
});

test('dungeon.js БЕЗ dungeons-data.js: гард деградирует до fallback, таблицы и генерация целы', () => {
  // Рекурсия-гард: vm-песочница tests/dungeon-ui.test.js грузит dungeon.js
  // БЕЗ data-модуля — существующие vm-тесты обязаны работать и после
  // переноса таблиц в каталог (fallback-литералы 1:1 с каталогом).
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of DUNGEON_CORE.concat('src/dungeon.js')) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  assert.equal(sandbox.Game.DUNGEON_NAMES[0], 'простая пещера',
    'fallback: DUNGEON_NAMES[0]');
  assert.equal(sandbox.Game.DUNGEON_NAMES[4], 'бездна',
    'fallback: DUNGEON_NAMES[4]');
  assert.deepEqual([...sandbox.Game.DUNGEON_MOBS[0]],
    ['skeleton', 'ant', 'crawling_bones', 'giant_larva'],
    'fallback: DUNGEON_MOBS[0]');
  assert.deepEqual([...sandbox.Game.DUNGEON_ITEMS[4]],
    ['war_hammer', 'phoenix_feather', 'greater_healing', 'heavy_tome',
      'fire_spellbook', 'flame_burst_scroll', 'blizzard_scroll'],
    'fallback: DUNGEON_ITEMS[4]');
  assert.equal(sandbox.Game.DUNGEON_SIZE[2], 31, 'fallback: DUNGEON_SIZE[2]');
  // Генерация работает и во fallback-ветке.
  const px = sandbox.Game.syntheticPixels(8, 8, 128, 128, 128, 255);
  const d = sandbox.Game.createDungeon(37, -12, px, sandbox.Game.TERRAIN.GRASS);
  assert.equal(d.type, 0, 'fallback: createDungeon → CAVE');
  assert.equal(d.width, 25, 'fallback: размер CAVE из DUNGEON_SIZE');
});

// --- Задача 000046: модули крафта ---
//
// craft.js при ЗАГРУЗКЕ снимает с Game: каталог (craft-data.js), API
// персонажа (player.js), API инвентаря (items.js), постройки
// (buildings.js) и заклинания (spells.js — зачарование); combat-ui.js/
// main.js снимают const G = globalThis.Game один раз при загрузке
// (UMD-ловушка, 000038) — поэтому: player/items/buildings/spells <
// craft-data.js < craft.js < combat-ui.js < main.js.

test('index.html: craft-data.js и craft.js подключены в правильном порядке', () => {
  assert.notEqual(pos('src/craft-data.js'), -1, 'craft-data.js не подключён');
  assert.notEqual(pos('src/craft.js'), -1, 'craft.js не подключён');
  // Данные раньше ядра.
  assert.ok(pos('src/craft-data.js') < pos('src/craft.js'),
    'src/craft-data.js должен быть раньше src/craft.js (задача 000046)');
  // Ядро — раньше craft.js.
  for (const f of ['src/player.js', 'src/items.js', 'src/buildings.js',
    'src/spells.js']) {
    assert.ok(pos(f) < pos('src/craft.js'),
      f + ' должен быть раньше src/craft.js (задача 000046)');
  }
  // UMD-ловушка: combat-ui.js и main.js снимают Game при загрузке —
  // craft.js должен быть РАНЕЕ них.
  assert.ok(pos('src/craft.js') < pos('src/combat-ui.js'),
    'src/craft.js должен быть раньше src/combat-ui.js (задача 000046)');
  assert.ok(pos('src/craft.js') < pos('src/main.js'),
    'src/craft.js должен быть раньше src/main.js (задача 000046)');
});

// --- Задача 000126: экран крафта (src/craft-ui.js, спец-модуль) ---
//
// craft-ui.js — слот спец-модулей (000128): ПОСЛЕ building-actions.js
// (читает Game.buildingActions.specials при саморегистрации) и ПОСЛЕ
// craft.js (Game.Craft — лениво, но порядок фиксируем); ДО main.js
// (UMD-ловушка 000038: main.js снимает const G = globalThis.Game при
// загрузке — гейты/закрытия `G.craftUI && G.craftUI.isActive()`
// должны видеть модуль). Позиция в index.html — после hud.js, до
// visuals-data.js (memory/000126-craft-ui.md, «Порядок модулей»).

test('index.html: craft-ui.js подключён в порядке craft.js/building-actions.js < craft-ui.js < main.js (задача 000126)', () => {
  assert.notEqual(pos('src/craft-ui.js'), -1,
    'src/craft-ui.js не подключён в index.html (задача 000126)');
  assert.ok(pos('src/craft.js') < pos('src/craft-ui.js'),
    'src/craft.js должен быть раньше src/craft-ui.js (задача 000126)');
  assert.ok(pos('src/building-actions.js') < pos('src/craft-ui.js'),
    'src/building-actions.js должен быть раньше src/craft-ui.js '
    + '(саморегистрация спец-действия «craft» в specials)');
  assert.ok(pos('src/craft-ui.js') < pos('src/main.js'),
    'src/craft-ui.js должен быть раньше src/main.js (UMD-ловушка: '
    + 'снапшот Game в main.js несёт craftUI)');
});

test('порядок core → craft-data.js → craft.js: Game.Craft существует и крафтит', () => {
  // Полный «браузерный» путь: ядро из index.html + spells + craft.
  // craft обязан работать в чужом realm (UMD-проводка API с Game).
  const files = CORE_SCRIPTS.concat(
    'src/combat.js', 'src/spells-data.js', 'src/spells.js',
    'src/craft-data.js', 'src/craft.js');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const Cr = sandbox.Game.Craft;
  assert.ok(Cr, 'Game.Craft должен существовать после правильного порядка');
  for (const k of ['CRAFT', 'CRAFT_BY_ID', 'CRAFT_TYPES', 'CRAFT_TYPE_SKILL',
    'SKILL_CRAFT_TYPE', 'typeBuildings', 'craftOf', 'craftLevel',
    'craftXpForNext', 'craftCap', 'addCraftXp', 'reprocessCraftXp',
    'canCraft', 'craft', 'qualityChance', 'yieldChance', 'bookCraftXp',
    'canMentorCraft', 'mentorCraft', 'sanitizeCraftLevels',
    'sanitizeCraftXp']) {
    assert.ok(Cr[k] !== undefined, 'Game.Craft.' + k);
  }
  // CRAFT_BY_ID — те же объекты, что в CRAFT (идентичность).
  const wood = Cr.CRAFT.find((r) => r.id === 'wood_sword');
  assert.equal(Cr.CRAFT_BY_ID.wood_sword, wood);
  // Работоспособность в браузерном realm: крафт в поле, без роллов.
  const p = sandbox.Game.createCharacter();
  sandbox.Game.addItem(p, 'wood_log', 1);
  const r = Cr.craft(p, 'wood_sword', { building: 5, rng: () => 0.99 });
  assert.equal(r.ok, true,
    'craft работает в браузерном realm: ' + (r.reason || 'ok'));
  assert.equal(sandbox.Game.totalQty(p, 'wood_sword'), 1);
});

test('порядок битый: craft.js без spells.js → Game.Craft нет, guard в консоли', () => {
  // craft.js без spells.js (и combat.js): зачарование не может работать
  // через Game.Spells → guard пишет console.error (паттерн 000038/000045),
  // модуль не создаётся — «мёртвое ремесло» должно быть заметна.
  const errors = [];
  const sandbox = { console: { error: (m) => errors.push(m) } };
  sandbox.Game = {};
  vm.createContext(sandbox);
  const files = CORE_SCRIPTS.concat('src/craft-data.js', 'src/craft.js');
  for (const f of files) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  assert.equal(sandbox.Game.Craft, undefined,
    'без spells.js Craft не создаётся');
  assert.ok(errors.length > 0, 'guard обязан оставить след в консоли');
});

// --- Задача 000104: layout города (src/cities.js) ---
//
// cities.js (браузерная ветка) при ЗАГРУЗКЕ снимает hash2/mulberry32
// из Game (perlin.js) — UMD-ловушка (000018/000038): perlin.js обязан
// идти раньше. Модуль вставляется сразу после dungeon.js и ДО
// dungeon-ui.js/main.js: main.js снимает Game один раз при загрузке,
// а 000105 (экранный) снимет Game.Cities — cities.js обязан быть
// в Game раньше и тех, и другого. Без явного пина вставка может
// сдвинуться при правке index.html.

test('index.html: src/cities.js подключён; perlin.js → cities.js; dungeon.js → cities.js → dungeon-ui.js → main.js (задача 000104)', () => {
  assert.notEqual(pos('src/cities.js'), -1,
    'src/cities.js не подключён в index.html (задача 000104)');
  assert.ok(pos('src/perlin.js') < pos('src/cities.js'),
    'src/cities.js обязан быть позже src/perlin.js (браузерная ' +
    'ветка снимает hash2 из Game; UMD-ловушка 000018/000038)');
  assert.ok(pos('src/dungeon.js') < pos('src/cities.js'),
    'src/cities.js обязан быть после src/dungeon.js ' +
    '(слот сразу после dungeon.js)');
  assert.ok(pos('src/cities.js') < pos('src/dungeon-ui.js'),
    'src/cities.js обязан быть раньше src/dungeon-ui.js ' +
    '(000105 снимет Game.Cities)');
  assert.ok(pos('src/cities.js') < pos('src/main.js'),
    'src/cities.js обязан быть раньше src/main.js ' +
    '(main.js снимает Game один раз при загрузке)');
});

// --- Задача 000127: locations.js (разбиение main.js) ---
//
// main.js (IIFE) снимает const G = globalThis.Game ОДИН раз при
// загрузке (UMD-ловушка 000038): src/locations.js обязан быть ДО
// src/main.js, иначе G.locations — undefined всегда и домен
// «подземелье/город» молча деградирует. Слот — сразу ПОСЛЕ
// src/cities.js (доменная группа dungeon.js → cities.js →
// locations.js); motion.js может стоять позже (locations.js читает
// G.createMover лениво в момент вызова).

test('index.html: src/locations.js подключён; dungeon.js → locations.js, cities.js → locations.js → main.js (задача 000127)', () => {
  assert.notEqual(pos('src/locations.js'), -1,
    'src/locations.js не подключён в index.html (задача 000127)');
  assert.ok(pos('src/dungeon.js') < pos('src/locations.js'),
    'src/locations.js обязан быть после src/dungeon.js ' +
    '(доменная группа, задача 000127)');
  assert.ok(pos('src/cities.js') < pos('src/locations.js'),
    'src/locations.js обязан быть после src/cities.js ' +
    '(слот сразу после cities.js, задача 000127)');
  assert.ok(pos('src/locations.js') < pos('src/main.js'),
    'src/locations.js обязан быть раньше src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

// --- Задача 000071: building-effects.js и building-ui.js ---
//
// main.js (IIFE) снимает const G = globalThis.Game ОДИН раз при загрузке
// (UMD-ловушка 000038): ОБА новых модуля обязаны быть ДО src/main.js,
// иначе G.buildingUI/G.buildingEffects — undefined всегда и [E] молча
// деградирует к старому прямому npcUI. building-effects.js — после
// buildings.js и npc.js (задача: «после buildings.js/npc.js, до
// main.js»; принцип 000053 — каталожная часть цепочки); building-ui.js
// — после ui.js (оверлей по образцу npcUI).

test('index.html: building-effects.js подключён ПОСЛЕ buildings.js и npc.js и ДО main.js (задача 000071)', () => {
  assert.notEqual(pos('src/building-effects.js'), -1,
    'src/building-effects.js не подключён в index.html (задача 000071)');
  assert.ok(pos('src/buildings.js') < pos('src/building-effects.js'),
    'src/buildings.js должен быть раньше src/building-effects.js ' +
      '(задача 000071)');
  assert.ok(pos('src/npc.js') < pos('src/building-effects.js'),
    'src/npc.js должен быть раньше src/building-effects.js ' +
      '(задача 000071)');
  assert.ok(pos('src/building-effects.js') < pos('src/main.js'),
    'src/building-effects.js должен быть раньше src/main.js ' +
      '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

test('index.html: building-ui.js подключён ПОСЛЕ ui.js и ДО main.js (задача 000071)', () => {
  assert.notEqual(pos('src/building-ui.js'), -1,
    'src/building-ui.js не подключён в index.html (задача 000071)');
  assert.ok(pos('src/ui.js') < pos('src/building-ui.js'),
    'src/ui.js должен быть раньше src/building-ui.js ' +
      '(оверлей — по образцу npcUI из ui.js, задача 000071)');
  assert.ok(pos('src/building-ui.js') < pos('src/main.js'),
    'src/building-ui.js должен быть раньше src/main.js ' +
      '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

test('порядок core → building-effects.js: Game.buildingEffects в браузерном realm, buildingActions работает (задача 000071)', () => {
  // Полный «браузерный» путь: ядро из index.html + building-effects.js.
  // Модуль обязан дать Game.buildingEffects БЕЗ require в момент
  // загрузки (взаимных require НЕТ — прецедент 000053) и работать в
  // чужом realm (UMD-проводка).
  const modPath = path.join(ROOT, 'src', 'building-effects.js');
  assert.ok(fs.existsSync(modPath),
    'src/building-effects.js должен существовать (задача 000071)');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  for (const f of CORE_SCRIPTS.concat('src/building-effects.js')) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  const BE = sandbox.Game.buildingEffects;
  assert.ok(BE, 'Game.buildingEffects существует после правильного порядка');
  for (const k of ['EFFECTS', 'buildingActions', 'effectIds', 'hasEffects',
    'hasDailyLimit']) {
    assert.ok(BE[k] !== undefined, 'Game.buildingEffects.' + k);
  }
  // Работоспособность в браузерном realm: NPC — только «Диалог».
  // id 96 — СИНТЕТИЧЕСКИЙ (конвенция 000075, паттерн A3 building-
  // effects.test.js): «постройка без эффектов» вне диапазона
  // каталога (1..54), чтобы тест не зависел от состава реестра
  // (000074 добавил EFFECTS['40'] «Рунический камень» — реальный
  // id 40 теперь НЕСЁТ эффект; старый плейсхолдер id:40 его ловил).
  const res = BE.buildingActions(
    { id: 96, особые_параметры: {} },
    { id: 'npc_x', имя: 'Тест' },
    { day: 1, tile: { x: 0, y: 0 }, hero: {}, save: {} });
  assert.equal(res.length, 1, 'без эффектов — только «Диалог»');
  assert.equal(res[0].id, 'dialog');
  assert.equal(res[0].имя, 'Диалог');
  assert.equal(res[0].доступен, true);
});

// --- Задача 000128: building-actions.js ---
//
// main.js (IIFE) снимает const G = globalThis.Game ОДИН раз при
// загрузке (UMD-ловушка 000038): building-actions.js обязан быть в
// Game РАНЬШЕ, иначе G.buildingActions — undefined всегда и [E]
// молча деградирует. Слот по ТЗ: сразу ПОСЛЕ building-ui.js (доменная
// группа building-effects → building-ui → building-actions); МЕЖДУ
// building-actions.js и main.js остаётся свободный слот под будущие
// спец-модули (000077/000091–000095) и hud.js (000129) — adjacency
// к main.js НЕ закрепляется (свой пин — своя задача).

test('index.html: building-actions.js подключён ПОСЛЕ building-ui.js и ДО main.js (задача 000128)', () => {
  assert.notEqual(pos('src/building-actions.js'), -1,
    'src/building-actions.js не подключён в index.html (задача 000128)');
  assert.ok(pos('src/building-ui.js') < pos('src/building-actions.js'),
    'src/building-ui.js должен быть раньше src/building-actions.js ' +
    '(доменная группа: building-effects → building-ui → building-actions, ' +
    'задача 000128)');
  assert.ok(pos('src/building-actions.js') < pos('src/main.js'),
    'src/building-actions.js должен быть раньше src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

// --- Задача 000077: building-content.js (спец-модуль 000128 §2.3) ---
//
// building-content.js в момент ЗАГРУЗКИ читает Game.buildingActions
// (registerSpecial) и саморегистрирует хендлер «ежедневного контента»
// на ОБА id (43/39) ДО init — building-actions.js обязан быть РАНЬШЕ,
// main.js (init-бандл c world.buildingContent + extra.seed) — ПОЗЖЕ.
// Слот — зарезервированный блок спец-модулей (000128): adjacency к
// hud.js/main.js НЕ закрепляется (прецедент 000128/000129); пин —
// только «роутер → спец-модуль → main.js».

test('index.html: building-content.js подключён ПОСЛЕ building-actions.js и ДО main.js (задача 000077)', () => {
  assert.notEqual(pos('src/building-content.js'), -1,
    'src/building-content.js не подключён в index.html (задача 000077)');
  assert.ok(pos('src/building-actions.js') < pos('src/building-content.js'),
    'src/building-actions.js должен быть раньше src/building-content.js ' +
    '(регистрация registerSpecial — load-time обязанность спец-модуля, ' +
    '000128 §2.3, задача 000077)');
  assert.ok(pos('src/building-content.js') < pos('src/main.js'),
    'src/building-content.js должен быть раньше src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз; init-бандл ' +
    'получает world.buildingContent, задача 000077)');
});

// --- Задача 000094: спец-модуль «Осмотр» (развалины, id 48) ---
//
// Саморегистрация в Game.buildingActions.specials в момент загрузки
// (контракт 000128 §2.3): тег — в слоте спец-модулей ПОСЛЕ
// building-actions.js (реестр specials обязан существовать),
// ДО hud.js и ДО main.js (UMD-ловушка 000038: снапшот Game — если
// тег УЙТИ в main.js, регистрация попадёт в НОВЫЙ объект Game и
// лут/ловушка молча не сработают).

test('index.html: building-effect-48.js подключён ПОСЛЕ building-actions.js и ДО hud.js и main.js (задача 000094)', () => {
  assert.notEqual(pos('src/building-effect-48.js'), -1,
    'src/building-effect-48.js не подключён в index.html (задача 000094)');
  assert.ok(pos('src/building-actions.js') < pos('src/building-effect-48.js'),
    'src/building-actions.js должен быть раньше src/building-effect-48.js ' +
    '(саморегистрация требует Game.buildingActions, задача 000094)');
  assert.ok(pos('src/building-effect-48.js') < pos('src/hud.js'),
    'src/building-effect-48.js — слот спец-модулей: раньше src/hud.js ' +
    '(задача 000094)');
  assert.ok(pos('src/building-effect-48.js') < pos('src/main.js'),
    'src/building-effect-48.js должен быть раньше src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз)');

});

// --- Задача 000133: спец-модуль «Расшифровка (заклинание)» ---
//
// learn() source «rune» — мир-сторона ЧИСТОГО applyRuneSpell
// (000128 §2.3): саморегистрация ОДНОГО хендлера на ОБА id
// ('40_spell'/'42_spell') в Game.buildingActions.specials в момент
// загрузки. Тег — в слоте спец-модулей ПОСЛЕ building-actions.js
// (реестр specials обязан существовать), ПОСЛЕ spells.js (Game.Spells
// — при вызове; в корректной цепочке — на месте), ДО hud.js и ДО
// main.js (UMD-ловушка 000038: снапшот Game — если тег УЙТИ в main.js,
// регистрация попадёт в НОВЫЙ объект Game и действие молча мертво).

test('index.html: building-effect-runes.js подключён ПОСЛЕ building-actions.js и spells.js, ДО hud.js и main.js (задача 000133)', () => {
  assert.notEqual(pos('src/building-effect-runes.js'), -1,
    'src/building-effect-runes.js не подключён в index.html (задача 000133)');
  assert.ok(pos('src/building-actions.js') < pos('src/building-effect-runes.js'),
    'src/building-actions.js должен быть раньше src/building-effect-runes.js ' +
    '(саморегистрация требует Game.buildingActions, задача 000133)');
  assert.ok(pos('src/spells.js') < pos('src/building-effect-runes.js'),
    'src/spells.js должен быть раньше src/building-effect-runes.js ' +
    '(Game.Spells — learn source «rune», задача 000133)');
  assert.ok(pos('src/building-effect-runes.js') < pos('src/hud.js'),
    'src/building-effect-runes.js — слот спец-модулей: раньше src/hud.js ' +
    '(задача 000133)');
  assert.ok(pos('src/building-effect-runes.js') < pos('src/main.js'),
    'src/building-effect-runes.js должен быть раньше src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

// --- Задача 000130: вкладки панели — саморегистрирующиеся модули ---
//
// Вкладки (src/ui-tab-*.js) грузятся ДО ui.js и регистрируются в
// Game.uiTabs (src/ui-tabs.js) при ЗАГРУЗКЕ — реестр обязан
// существовать раньше первой вкладки; ui.js читает его лениво в
// buildPanel. ДОБАВЛЕНИЕ вкладки = новый файл + script-тег в блоке
// между ui-tabs.js и ui.js — ui.js НЕ правится (анти-прецедент —
// tests/ui-panel.test.js, секция 000130). ПОЗИЦИЯ тега = позиция
// вкладки в столбце (контракт memory/000130-ui-tabs.md §4.4/§5:
// порядок записей = порядок регистрации = порядок тегов) — без
// цепочного пина порядок .cp-tab зависел бы от случайности
// index.html. RED-фаза: тегов нет → падает по первому пиновому
// assert; GREEN-фаза: цепочка на месте.

test('index.html: ui-tabs.js + ui-tab-*.js ДО ui.js (000130)', () => {
  // Реестр — ПЕРВЫЙ (до всех вкладок); все провайдеры G.* (player/
  // items/buildings/npc/map/skills-data/companions) — ВЫШЕ в
  // index.html (основная цепочка задачей не трогается).
  assert.notEqual(pos('src/ui-tabs.js'), -1,
    'src/ui-tabs.js не подключён в index.html (задача 000130)');
  // Полная цепочка блока: порядок тегов = порядок вкладок в
  // столбцах (левый: character→inventory→settings→efir (000116),
  // правый: equipment→shop→quests; 'equipment' регистрируется из
  // ui-tab-inventory.js — ДВЕ вкладки в одном файле).
  const chain = [
    'src/ui-tabs.js',
    'src/ui-tab-skills.js',
    'src/ui-tab-inventory.js',
    'src/ui-tab-settings.js',
    'src/ui-tab-shop.js',
    'src/ui-tab-quests.js',
    'src/ui-tab-efir.js',
    'src/ui.js',
  ];
  for (let i = 0; i < chain.length - 1; i++) {
    assert.notEqual(pos(chain[i]), -1,
      chain[i] + ' не подключён в index.html (задача 000130)');
    assert.ok(pos(chain[i]) < pos(chain[i + 1]),
      chain[i] + ' должен быть раньше ' + chain[i + 1] +
        ' (задача 000130: порядок тегов = порядок вкладок в столбце)');
  }
  // Самоперечисление: каждый src/ui-tab-*.js НА ДИСКЕ подключён и
  // стоит ДО ui.js (будущее: новый вкладочный файл без тега
  // ловится здесь; RED-фаза — диска файлов нет, цикл тривиально
  // зелёный).
  const disk = fs.readdirSync(path.join(ROOT, 'src'))
    .filter((f) => /^ui-tab-.*\.js$/.test(f));
  for (const f of disk) {
    assert.notEqual(pos('src/' + f), -1,
      'src/' + f + ' существует на диске, но не подключён в ' +
      'index.html (задача 000130)');
    assert.ok(pos('src/' + f) < pos('src/ui.js'),
      'src/' + f + ' должен быть раньше src/ui.js ' +
      '(задача 000130: саморегистрация до инициализации панели)');
  }
});

test('000130: vm — цепочка index.html (до ui.js) → реестр = 7 вкладок в порядке тегов (000116: +efir) + Game.buildActiveQuestRow', () => {
  // Полный «браузерный» путь без DOM: ВСЕ модули цепи чисты при
  // загрузке (НОЛЬ DOM — 000053), поэтому песочница { console }
  // достаточна. Порядок тегов index.html = порядок РЕГИСТРАЦИИ =
  // порядок вкладок в столбцах: character → inventory → equipment →
  // settings → shop → quests (equipment — вторая вкладка из
  // ui-tab-inventory.js — ДВЕ вкладки в одном файле).
  const errors = [];
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
  };
  vm.createContext(sandbox);
  const all = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1]);
  const i = all.indexOf('src/ui.js');
  assert.ok(i >= 0, 'ui.js подключён в index.html');
  for (const f of all.slice(0, i + 1)) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox, { filename: f });
  }
  assert.equal(errors.length, 0,
    'ошибок при загрузке цепочки нет: ' + errors.join('; '));
  assert.ok(sandbox.Game, 'Game создан цепочкой');
  const reg = sandbox.Game.uiTabs;
  assert.ok(reg && typeof reg === 'object',
    'Game.uiTabs — реестр (src/ui-tabs.js)');
  // [...]: список из ЧУЖОГО realm (vm) — deepStrictEqual сравнивает
  // прототипы; спред даёт массив host-realm с теми же id.
  assert.deepEqual([...reg.list().map((t) => t.id)],
    ['character', 'inventory', 'equipment', 'settings', 'shop',
     'quests', 'efir'],
    'порядок реестра = порядок script-тегов index.html');
  assert.equal(typeof sandbox.Game.buildActiveQuestRow, 'function',
    'Game.buildActiveQuestRow — плоский game-экспорт ui-tab-quests.js');
  assert.equal(typeof sandbox.Game.findQuestInCatalog, 'function',
    'Game.findQuestInCatalog — плоский game-экспорт ui-tab-quests.js');
  assert.ok(sandbox.Game.playerUI, 'ui.js загружен (Game.playerUI)');
});

// --- Задача 000081: efir.js (Эфир — постоянный союзник) ---
//
// UMD-ловушка (000018/000038): combat-ui.js и main.js снимают
// const G = globalThis.Game ОДИН раз при загрузке — efir.js обязан
// быть РАНЬШЕ них, иначе G.efir — undefined вечно (тихая деградация:
// бои без Эфира). Позиция — в блоке спутников: ПОСЛЕ companions.js,
// ПЕРЕД building-effects.js; player.js раньше (xpForNext — лениво,
// но порядок закреплён).

test('index.html: src/efir.js подключён ПОСЛЕ player.js и companions.js, РАНЬШЕ combat-ui.js и main.js (задача 000081)', () => {
  assert.notEqual(pos('src/efir.js'), -1,
    'src/efir.js не подключён в index.html (задача 000081)');
  assert.ok(pos('src/player.js') < pos('src/efir.js'),
    'src/player.js должен быть раньше src/efir.js (xpForNext, задача 000081)');
  assert.ok(pos('src/companions.js') < pos('src/efir.js'),
    'src/efir.js — в блоке спутников: после src/companions.js (задача 000081)');
  assert.ok(pos('src/efir.js') < pos('src/combat-ui.js'),
    'src/efir.js должен быть раньше src/combat-ui.js ' +
    '(UMD-ловушка 000038: снапшот Game при загрузке)');
  assert.ok(pos('src/efir.js') < pos('src/main.js'),
    'src/efir.js должен быть раньше src/main.js ' +
    '(UMD-ловушка 000038: снапшот Game при загрузке)');
});

test('000130: vm — ПРОВАЛЕННЫЙ порядок (ui-tab-quests.js без ui-tabs.js) → console.error, без краха, без регистрации', () => {
  // Деградация (000053): битый порядок (вкладочный модуль раньше
  // реестра) не роняет загрузку — console.error + без регистрации;
  // игра не падает (фиксатор: не «тихий» fallback).
  const errors = [];
  const sandbox = {
    console: {
      log: () => {}, info: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)),
    },
  };
  vm.createContext(sandbox);
  assert.doesNotThrow(() => vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'src', 'ui-tab-quests.js'), 'utf8'),
    sandbox, { filename: 'ui-tab-quests.js' }),
    'ui-tab-quests.js без ui-tabs.js — без краха');
  assert.ok(errors.length >= 1, 'console.error при битом порядке');
  assert.ok(String(errors[0]).includes('Game.uiTabs не найден'),
    'текст ошибки — про порядок: ' + errors[0]);
  assert.ok(!sandbox.Game || !sandbox.Game.uiTabs,
    'регистрации нет (реестра нет)');
});

// --- Задача 000129: hud.js (разбиение main.js 3/4) ---
//
// main.js (IIFE) снимает const G = globalThis.Game ОДИН раз при
// загрузке (UMD-ловушка 000038): src/hud.js обязан быть в Game
// РАНЬШЕ, иначе G.hud — undefined всегда и строки HUD молча
// исчезают (тихий HUD-loss; защита — load-time гард в main.js +
// этот пин). Слот по ТЗ: сразу ПОСЛЕ building-actions.js (доменная
// группа серии 000127→000130); МЕЖДУ building-actions.js и main.js
// остаётся свободный слот под будущие спец-модули
// (000077/000091–95) — adjacency к main.js НЕ закрепляется
// (прецедент 000128).

test('index.html: src/hud.js подключён ПОСЛЕ building-actions.js и ДО main.js (задача 000129)', () => {
  assert.notEqual(pos('src/hud.js'), -1,
    'src/hud.js не подключён в index.html (задача 000129)');
  assert.ok(pos('src/building-actions.js') < pos('src/hud.js'),
    'src/building-actions.js должен быть раньше src/hud.js ' +
    '(доменная группа серии разбиения main.js, задача 000129)');
  assert.ok(pos('src/hud.js') < pos('src/main.js'),
    'src/hud.js должен быть раньше src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

// --- Задача 000091: спец-модуль «Отдыха» таверны ---
//
// Первый спец-модуль проекта (шаблон 000128 §2.3): self-registration
// в момент загрузки (Game.buildingActions.registerSpecial) — тег
// обязан стоять ПОСЛЕ building-actions.js (registerSpecial должен
// существовать) и ДО main.js (UMD-ловушка 000038: main.js снимает
// Game один раз; модуль после main.js с новым Game-объектом будет
// невидим). Пин ОТИОЛЬНЫЙ (не-смежный, как hud.js L893): параллельные
// задачи добавят СВОИ теги в тот же слот, конфликт — union'ом.

test('index.html: src/building-effect-44_rest.js подключён ПОСЛЕ building-actions.js и ДО main.js (задача 000091)', () => {
  assert.notEqual(pos('src/building-effect-44_rest.js'), -1,
    'src/building-effect-44_rest.js не подключён в index.html (задача 000091)');
  assert.ok(pos('src/building-actions.js') < pos('src/building-effect-44_rest.js'),
    'src/building-actions.js должен быть раньше src/building-effect-44_rest.js '
    + '(registerSpecial обязан существовать, задача 000091)');
  assert.ok(pos('src/building-effect-44_rest.js') < pos('src/main.js'),
    'src/building-effect-44_rest.js должен быть раньше src/main.js '
    + '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

test('000091: vm — загрузка building-effect-44_rest.js: standalone (без Game) — тихо; без buildingActions — console.error, без регистрации; с buildingActions — specials[44_rest] (задача 000091)', () => {
  // Лён-чтение: до зелёной стадии файла нет — readFileSync падает
  // ENOENT (осмысленный красный: модуль не создан).
  const restCode = fs.readFileSync(
    path.join(ROOT, 'src', 'building-effect-44_rest.js'), 'utf8');
  const actionsCode = fs.readFileSync(
    path.join(ROOT, 'src', 'building-actions.js'), 'utf8');
  const mkConsole = (sink) => ({
    log: () => {}, info: () => {}, warn: () => {},
    error: (m) => sink.push(String(m)),
  });
  // (a) standalone (без Game) — тихий выход: 0 console.error, 0 краха.
  const errorsA = [];
  const sandboxA = { console: mkConsole(errorsA) };
  vm.createContext(sandboxA);
  assert.doesNotThrow(() => vm.runInContext(
    restCode, sandboxA, { filename: 'building-effect-44_rest.js' }),
    'standalone (без Game) — без краха');
  assert.equal(errorsA.length, 0,
    'standalone (без Game) — 0 console.error: ' + errorsA.join('; '));
  // (b) Game БЕЗ buildingActions — console.error (текст §2.3),
  // без регистрации (деградация 000053: игра не роняется).
  const errorsB = [];
  const sandboxB = { Game: {}, console: mkConsole(errorsB) };
  vm.createContext(sandboxB);
  assert.doesNotThrow(() => vm.runInContext(
    restCode, sandboxB, { filename: 'building-effect-44_rest.js' }),
    'без buildingActions — без краха (деградация 000053)');
  assert.ok(errorsB.length >= 1, 'без buildingActions — console.error');
  assert.ok(String(errorsB[0]).includes('Game.buildingActions отсутствует'),
    'текст ошибки — про порядок: ' + errorsB[0]);
  // (c) с buildingActions (building-actions.js загружен ПЕРВЫМ) —
  // self-registration: specials['44_rest'] — функция.
  const errorsC = [];
  const sandboxC = { Game: {}, console: mkConsole(errorsC) };
  vm.createContext(sandboxC);
  vm.runInContext(actionsCode, sandboxC, { filename: 'building-actions.js' });
  vm.runInContext(restCode, sandboxC,
    { filename: 'building-effect-44_rest.js' });
  assert.equal(errorsC.length, 0,
    'с buildingActions — без ошибок: ' + errorsC.join('; '));
  assert.ok(sandboxC.Game.buildingActions,
    'buildingActions есть (building-actions.js загружен)');
  assert.equal(
    typeof sandboxC.Game.buildingActions.specials['44_rest'], 'function',
    'specials[44_rest] зарегистрирован (self-registration при загрузке)');
});

// --- Задача 000137: building-effect-44_perform.js (спец-модуль
// «Выступление» таверны) ---
//
// Второй спец-модуль (шаблон 44_rest, 000091/000128): саморегистрация
// в МОМЕНТ загрузки (registerSpecial('44_perform')) — тег обязан
// стоять ПОСЛЕ building-actions.js (registerSpecial должен
// существовать) и ДО main.js (UMD-ловушка 000038: main.js снимает
// Game один раз). ТЗ: рядом с 44_rest (слот спец-модулей таверны; в
// этой волне index.html только здесь тегируем — audit §6). Пин
// не-смежный (union).

test('IO1. 000137: спец-модуль «Выступление» — тег src/building-effect-44_perform.js в index.html (ПОСЛЕ building-actions.js, рядом с 44_rest, ДО main.js) + UMD-гарды (standalone тихо / без buildingActions — console.error + без регистрации / с — specials[44_perform])', () => {
  // (a) Порядок тега (красный: тег отсутствует — pos === -1).
  assert.notEqual(pos('src/building-effect-44_perform.js'), -1,
    'src/building-effect-44_perform.js не подключён в index.html '
    + '(задача 000137)');
  assert.ok(pos('src/building-actions.js')
    < pos('src/building-effect-44_perform.js'),
    'src/building-actions.js должен быть раньше '
    + 'src/building-effect-44_perform.js '
    + '(registerSpecial обязан существовать, задача 000128)');
  assert.ok(pos('src/building-effect-44_rest.js')
    < pos('src/building-effect-44_perform.js'),
    'src/building-effect-44_perform.js — рядом с 44_rest (слот '
    + 'спец-модулей таверны, задача 000137)');
  assert.ok(pos('src/building-effect-44_perform.js') < pos('src/main.js'),
    'src/building-effect-44_perform.js должен быть раньше src/main.js '
    + '(UMD-ловушка 000038: main.js снимает Game один раз)');
  // (b) vm-load (ленивое чтение: до зелёной стадии файла нет —
  // readFileSync падает ENOENT — осмысленный красный, паттерн 000091).
  const performCode = fs.readFileSync(
    path.join(ROOT, 'src', 'building-effect-44_perform.js'), 'utf8');
  const actionsCode = fs.readFileSync(
    path.join(ROOT, 'src', 'building-actions.js'), 'utf8');
  const mkConsole = (sink) => ({
    log: () => {}, info: () => {}, warn: () => {},
    error: (m) => sink.push(String(m)),
  });
  // (b1) standalone (без Game) — тихий выход: 0 console.error,
  // 0 краха.
  const errorsA = [];
  const sandboxA = { console: mkConsole(errorsA) };
  vm.createContext(sandboxA);
  assert.doesNotThrow(() => vm.runInContext(
    performCode, sandboxA,
    { filename: 'building-effect-44_perform.js' }),
    'standalone (без Game) — без краха');
  assert.equal(errorsA.length, 0,
    'standalone (без Game) — 0 console.error: ' + errorsA.join('; '));
  // (b2) Game БЕЗ buildingActions — console.error (фиксированный
  // текст), без регистрации (деградация 000053: игра не роняется).
  const errorsB = [];
  const sandboxB = { Game: {}, console: mkConsole(errorsB) };
  vm.createContext(sandboxB);
  assert.doesNotThrow(() => vm.runInContext(
    performCode, sandboxB,
    { filename: 'building-effect-44_perform.js' }),
    'без buildingActions — без краха (деградация 000053)');
  assert.ok(errorsB.length >= 1, 'без buildingActions — console.error');
  assert.ok(
    String(errorsB[0]).includes('Game.buildingActions отсутствует'),
    'текст ошибки — про порядок: ' + errorsB[0]);
  // (b3) с buildingActions (building-actions.js загружен ПЕРВЫМ) —
  // self-registration: specials['44_perform'] — функция.
  const errorsC = [];
  const sandboxC = { Game: {}, console: mkConsole(errorsC) };
  vm.createContext(sandboxC);
  vm.runInContext(actionsCode, sandboxC, { filename: 'building-actions.js' });
  vm.runInContext(performCode, sandboxC,
    { filename: 'building-effect-44_perform.js' });
  assert.equal(errorsC.length, 0,
    'с buildingActions — без ошибок: ' + errorsC.join('; '));
  assert.ok(sandboxC.Game.buildingActions,
    'buildingActions есть (building-actions.js загружен)');
  assert.equal(
    typeof sandboxC.Game.buildingActions.specials['44_perform'],
    'function',
    'specials[44_perform] зарегистрирован (self-registration при '
    + 'загрузке)');
});

// --- Задача 000095: building-effect-camp.js (спец-модуль лагеря) ---
//
// Спец-модуль регистрирует specials (fire/market) в building-actions.js
// (000128 §2.3): обязан грузиться ПОСЛЕ building-actions.js (иначе
// registerSpecial — undefined) и ДО main.js (UMD-ловушка 000038:
// main.js снимает Game один раз при загрузке). Слот общий с
// 000077/000091–95 — adjacency к hud.js/main.js НЕ закрепляется
// (контракт memory/000095-camp-fire-bazaar.md §1.2).

test('index.html: src/building-effect-camp.js подключён ПОСЛЕ building-actions.js и ДО main.js (задача 000095)', () => {
  assert.notEqual(pos('src/building-effect-camp.js'), -1,
    'src/building-effect-camp.js не подключён в index.html ' +
    '(задача 000095: спец-модуль «Костёр»/«Барахолка»)');
  assert.ok(pos('src/building-actions.js') < pos('src/building-effect-camp.js'),
    'src/building-actions.js должен быть раньше ' +
    'src/building-effect-camp.js (registerSpecial, задача 000128)');
  assert.ok(pos('src/building-effect-camp.js') < pos('src/main.js'),
    'src/building-effect-camp.js должен быть раньше src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

// --- Задача 000092: спец-модули фонтана (49) и колодца (45) ---
//
// Само-регистрирующиеся спец-модули (контракт 000128 §2.3, первый
// прецедент): при ЗАГРУЗКЕ (браузерная ветка) вызывают
// buildingActions.registerSpecial — building-actions.js обязан
// загрузиться РАНЬШЕ (иначе гард console.error + деградация:
// действие не зарегистрировано). main.js снимает Game ОДИН раз при
// загрузке (UMD-ловушка 000038) — модули должны стоять ДО main.js.
// Слот: МЕЖДУ building-actions.js и hud.js; порядок id — по возрастанию
// (45 → 49). Adjacency к main.js НЕ закрепляется — параллельные
// спец-модули 000091/000093/000094/000095 тоже живут в этом слоте
// (прецедент 000128/000129: между building-actions.js и hud.js).

test('index.html: building-effect-45.js/49.js — ПОСЛЕ building-actions.js, в порядке id, ДО hud.js и ДО main.js (задача 000092)', () => {
  assert.notEqual(pos('src/building-effect-45.js'), -1,
    'src/building-effect-45.js не подключён в index.html (задача 000092)');
  assert.notEqual(pos('src/building-effect-49.js'), -1,
    'src/building-effect-49.js не подключён в index.html (задача 000092)');
  assert.ok(pos('src/building-actions.js') < pos('src/building-effect-45.js'),
    'src/building-effect-45.js должен быть ПОСЛЕ src/building-actions.js '
    + '(само-регистрация registerSpecial при загрузке, задача 000092)');
  assert.ok(pos('src/building-effect-45.js') < pos('src/building-effect-49.js'),
    'порядок id — по возрастанию: 45 → 49 (задача 000092)');
  assert.ok(pos('src/building-effect-49.js') < pos('src/hud.js'),
    'src/building-effect-49.js должен быть ДО src/hud.js ' +
    '(слот между building-actions.js и hud.js, задача 000092)');
  assert.ok(pos('src/building-effect-49.js') < pos('src/main.js'),
    'src/building-effect-49.js должен быть ДО src/main.js ' +
    '(UMD-ловушка 000038: main.js снимает Game один раз)');
});

// --- Задача 000138: стартовое окно (src/start-window.js) ---
//
// main.js (IIFE) снимает const G = globalThis.Game ОДИН раз при
// загрузке (UMD-ловушка 000038): src/start-window.js обязан быть в
// Game РАНЬШЕ, иначе G.startWindow — undefined всегда и стартовое
// окно молча отсутствует (тихая деградация; проводка main.js
// пишет console.error, но порядок закрепляется здесь — образец
// пина motion.js < main.js выше). Слот — утилиты МЕЖДУ
// motion.js и main.js.

test('index.html: src/start-window.js подключён и ДО src/main.js (задача 000138, UMD-ловушка 000038: main.js снимает Game один раз)', () => {
  assert.notEqual(pos('src/start-window.js'), -1,
    'src/start-window.js не подключён в index.html (задача 000138)');
  assert.ok(pos('src/start-window.js') < pos('src/main.js'),
    'src/start-window.js должен быть раньше src/main.js (задача 000138)');
});

// --- Задача 000142: портреты партии (src/portraits-data.js) ---
//
// src/portraits-data.js — зеркало каталога assets/portraits (UMD:
// Game.PortraitsData; генерируется scripts/sync-portraits.js).
// «После данных, до ui.js» (ТЗ): конец ВЕДУЩЕЙ группы *-data.js —
// МЕЖДУ mob-groups-data.js и map.js (остальные *-data.js — ниже,
// у своих потребителей). UMD-ловушка 000038: тег обязан быть ДО
// main.js — транзитивно закреплено через «< ui.js» (ui.js < main.js
// уже запинено выше) — иначе Game.PortraitsData вне снапшота.
// Пин НЕ-смежный (union): не ломается, если задача 000140 вставит свой
// тег (sheet.js) между map.js и player.js — порядок обоих тегов
// держится автоматически (контракт C4, волна A).

test('index.html: src/portraits-data.js подключён ПОСЛЕ src/mob-groups-data.js (данные) и ДО src/ui.js (задача 000142)', () => {
  assert.notEqual(pos('src/portraits-data.js'), -1,
    'src/portraits-data.js не подключён в index.html (задача 000142)');
  assert.ok(pos('src/mob-groups-data.js') < pos('src/portraits-data.js'),
    'src/portraits-data.js должен быть ПОСЛЕ src/mob-groups-data.js ' +
    '(конец ведущей группы данных, задача 000142)');
  assert.ok(pos('src/portraits-data.js') < pos('src/map.js'),
    'src/portraits-data.js должен быть ДО src/map.js (задача 000142)');
  assert.ok(pos('src/portraits-data.js') < pos('src/ui.js'),
    'src/portraits-data.js должен быть ДО src/ui.js (задача 000142)');
});

// --- Задача 000140: единый «лист персонажа» (src/sheet.js) ---
//
// player.js (браузерная ветка, тонкий слой делегирования) читает
// Game.Sheet при ЗАГРУЗКЕ (UMD-ловушка 000038, паттерн skills-data/
// global-settings): src/sheet.js обязан быть в Game РАНЬШЕ, иначе
// герой — ядро — не загрузится. Слот — регион ядра МЕЖДУ src/map.js
// и src/player.js (до day.js). Чистая загрузка sheet.js — без
// зависимостей (межимодульные чтения — лениво), поэтому порядок к
// data-модулям не нужен; пин только sheet.js < player.js.

test('index.html: src/sheet.js подключён и ДО src/player.js (задача 000140, UMD-ловушка 000038: player.js читает Game.Sheet при загрузке)', () => {
  assert.notEqual(pos('src/sheet.js'), -1,
    'src/sheet.js не подключён в index.html (задача 000140)');
  assert.ok(pos('src/sheet.js') < pos('src/player.js'),
    'src/sheet.js должен быть раньше src/player.js (задача 000140)');
});

// --- Задача 000145: партия (src/party.js) ---
//
// Game.Party = {list, active} — ЧИСТЫЕ функции списка партии +
// выбора активного персонажа (контракт memory/000145-active-
// character.md §2). Вкладка «Персонаж» (src/ui-tab-skills.js)
// снимает Game ОДИН раз при загрузке (снапшот-ловушка 000038) и
// читает G.Party при ВЫЗОВЕ: тег обязан быть ДО вкладочных
// модулей (иначе Game.Party вне снапшота — вкладка деградирует в
// hero-only + console.error) и ДО src/ui.js. Слот — после
// src/combat-keys.js, до comment-блока вкладок (позиции index.html
// закреплены пин-блоком 000130). Пин НЕ-смежный (union): не
// ломается, если параллельная задача вставит свой тег в те же
// слоты — порядок party.js к обоим якорям держится.

test('index.html: src/party.js подключён ПОСЛЕ src/combat-keys.js и ДО src/ui-tab-skills.js и ДО src/ui.js (задача 000145, снапшот-ловушка 000038)', () => {
  assert.notEqual(pos('src/party.js'), -1,
    'src/party.js не подключён в index.html (задача 000145)');
  assert.ok(pos('src/combat-keys.js') < pos('src/party.js'),
    'src/party.js должен быть ПОСЛЕ src/combat-keys.js (задача 000145)');
  assert.ok(pos('src/party.js') < pos('src/ui-tab-skills.js'),
    'src/party.js должен быть ДО src/ui-tab-skills.js (снапшот-' +
    'ловушка 000038: вкладка снимает Game при загрузке)');
  assert.ok(pos('src/party.js') < pos('src/ui.js'),
    'src/party.js должен быть ДО src/ui.js (задача 000145)');
});
