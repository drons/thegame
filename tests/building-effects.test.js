// Задача 000071: основание эффектов построек — реестр
// src/building-effects.js (чистый UMD-модуль) + оверлей Game.buildingUI
// (src/building-ui.js) + ЕДИНЫЙ роутинг [E] через него (src/main.js).
//
// Задача 000075: телепорт-круг (id 41, подтип слота 10 — 000073) —
// пары, активация, перемещение:
//   * ЧИСТЫЕ функции (секция A20+): linkTeleportCircles,
//     teleportDestination, teleportCharge, serializeTeleports,
//     restoreTeleports — контракты в блоке перед A20.
//   * Запись EFFECTS['41'] (имя «Активировать/Телепорт», БЕЗ лимита
//     раз-в-день; available/apply — по СНИМКУ сейва, секция A30+).
//   * wiring (секция B13+): main.js РЕШАЕТ запись тайла ПО buildingId
//     (подтип, а не базовая запись слота — RESOLVE-БУГ: без этого
//     действие «41» никогда не появится в оверлее); скан пары — при
//     ПЕРВОМ подходе (openBuildingUI), кэш в разделе сейва `teleports`
//     (имя зафиксировано 000072); активация — разовое списание
//     (стоимость из каталога 000041.особые_параметры.эффект.стоимость)
//     + перенос на dest + снап мувера; повтор — без списания.
//   * РЕВОРК существующих B-тестов (критик): findBuilding резолвит
//     запись по buildingId + опциональный pred; временные записи
//     EFFECTS — под СИНТЕТИЧЕСКИМИ id (88..97) с save/restore в
//     try/finally (реальные записи '40'/'41'/'43' — 000074/000075/
//     000077 — не затираются); B12 — постройка БЕЗ каталожного
//     раз_в_день (первая без NPC — id 43, у НЕГО флаг в каталоге).
//   * A1 (пустой реестр 000071) переопределён: первая РЕАЛЬНАЯ
//     запись — '41' (000074/000076 добавят свои — правка A1
//     «кто смержился первым», см. memory/000075-teleport-circles.md).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации; падают до зелёной стадии.
//
// Контракты, зафиксированные здесь (решения —
// memory/000071-building-ui.md; полный отчёт — tasks/result/000071.md
// на стадии Finalize):
//   * REЕСТР EFFECTS: в 000071 был ПУСТ; с 000075 в нём первая
//     РЕАЛЬНАЯ запись — '41' (телепорт-круг); подзадачи 000074/000076
//     добавляют только СВОИ записи: id → { имя, разВДень?,
//     available?(state), apply(state) → { ok, message? } }.
//     available?(state) — НЕДНЕВНАЯ доступность (state — тот же
//     СНИМОК { day, tile, hero, save }): истина (не строка) —
//     доступно; false/null/undefined/'' — недоступно (reason
//     «недоступно»); непустая строка — недоступно, строка — reason
//     (пример: круг без пары «молчит»). buildingActions опрашивает
//     available ДО лимита раз-в-день: недоступная строка disabled —
//     нажатие не доходит до apply (ревью раунда 2: дыра контракта).
//   * Чистая buildingActions(building, npc, state) →
//     [{ id, имя, доступен, reason? }]: сначала «Диалог» (id 'dialog',
//     имя 'Диалог'; если npc != null), затем эффекты.
//   * state = { day, tile: {x, y}, hero, save } — save: СНИМОК
//     collectSaveData() (обычный объект; 000072), строка buildingActions
//     СНИМОК не мутирует (чистота).
//   * Связка «постройка → эффекты»: массив особых_параметры.эффекты
//     (порядок из каталога) ИЛИ, если массива нет, запись
//     EFFECTS[String(building.id)] (1-к-1: камень 40, обелиск 42,
//     круг 43). Id без записи в реестре — пропускается.
//   * «Раз в день»: флаг из КАТАЛОГА (принцип 000053):
//     hasDailyLimit(building, effectId) — особые_параметры.раз_в_день
//     (boolean; каталог побеждает), fallback — запись реестра
//     разВДень === true. Лимит — canUseToday (day.js, лениво из
//     globalThis.Game; fallback last !== day) + раздел сейва
//     buildingOncePerDay (000072): ключ 'x,y:effectId' (целые
//     координаты, могут быть отрицательными), значение — день.
//   * reason при сгоревшем лимите: «уже использовано сегодня».
//   * buildingUI = { open({ title, actions, onAction(action) }),
//     close(), isActive() }: 1..9 — выполнить строку N (до 9 строк),
//     ↑↓ — курсор по доступным строкам (wrap, недоступные пропускаются;
//     строка под курсором помечена «▸ » в тексте имени),
//     Enter/NumpadEnter — выполнить строку под курсором (10+ строк —
//     единственная альтернатива 1..9), клик по строке — выполнить
//     (тач, 000123), [Esc]/[E] — закрыть; недоступные строки —
//     disabled (data-buid — id действия); после onAction — закрывается
//     САМ.
//   * ЕДИНЫЙ путь [E] (SPEC 453, задача 000071): постройка с NPC и БЕЗ
//     эффектов — оверлей из одного пункта «Диалог» (НЕ прямой npcUI);
//     Digit1 → npcUI.open с теми же параметрами, что сейчас. Пустой
//     список (нет NPC и нет эффектов) — ничего (как сейчас).
//   * apply(state) → { ok, message? }: при ok main.js ПРЯМО маркирует
//     buildingOncePerDay.set('x,y:'+id, clock.day) (если hasDailyLimit)
//     и вызывает saveNow() СРАЗУ (фиксатор прецедента _lastUnkillDay,
//     000072) + hudFlash(message). При НЕ-ok: message (если есть)
//     тоже в hudFlash — отказ не гаснет молча; маркировки раз-в-день
//     и saveNow НЕТ (ревью раунда 2).
//   * Оверлей блокирует движение (keydown-гейт, как npcUI); открытие
//     боя поверх buildingUI — закрывает его (стек оверлеев, паттерн
//     startCombat закрывает playerUI); при открытии buildingUI панель
//     персонажа закрывается.
//
// main.js в node не грузится (IIFE: WebGL + DOM) — секция B исполняет
// ВЕСЬ <script>-цепочку из index.html в vm-песочнице с DOM/WebGL-стабами
// (паттерн tests/save-restore.test.js) с МОКОМ localStorage — сейвы
// читаются/пишутся; мир детерминированный (map.png onerror →
// G.generateSeedPixels, фикс. сид), игрок ходит ключами (протокол
// tests/main-visuals.test.js).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');

// --- Чистая часть: node-require модуля ---
//
// Модуль создаётся на зелёной стадии; до неё require падает — каждый
// тест секции A падает на нём (красный). node кэширует: повторные
// require дёшевы.
function loadBE() {
  return require('../src/building-effects.js');
}

// Базовый state — форма зафиксирована контрактом: { day, tile, hero,
// save }. save — снимок collectSaveData (обычный объект).
function makeState(over = {}) {
  return Object.assign({
    day: 1,
    tile: { x: 5, y: 7 },
    hero: { hp: 10, gold: 0 },
    save: {},
  }, over);
}

const NPC = () => ({ id: 'npc_x', имя: 'Тест' });

test('A1. building-effects (UMD node): реестр и чистые функции на месте', () => {
  const BE = loadBE();
  assert.ok(BE, 'модуль существует');
  assert.ok(BE.EFFECTS && typeof BE.EFFECTS === 'object',
    'EFFECTS — объект-реестр');
  // Пин «кто смержился первым» (memory/000075-teleport-circles.md):
  // смержены 000075 ('41'), 000076 ('36'/'37'/'38') и 000074
  // ('40'/'42'); 000093 добавляет '46' (смотровая башня,
  // memory/000093-explored-tower.md); 000077 добавляет '39' (храм)
  // и '43' (круг); 000094 добавляет '48' (развалины — осмотр,
  // memory/000094-ruins-inspect.md); 000091 добавляет
  // '44_rest'/'44_rumors' (таверна, memory/000091-tavern-rest-
  // rumors.md); 000092/95 расширят список при своих мержах
  // (правка при ребейзе: union,
  // memory/000076-temple-blessings.md / 000074-rune-stone-obelisk.md
  // / 000077-building-content.md §8 / 000094-ruins-inspect.md
  // / 000091-tavern-rest-rumors.md).
  // Форм-пин — ЧЛЕНСТВО
  // (отклонение от точного deepEqual: точный union не замкнулся бы
  // до мержей 000091–000095, добавляющих собственные записи):
  //   * все смерженные записи НА МЕСТЕ (анти-дрейф при ребейзе);
  //   * чужих id НЕТ (параллельные P3 не затирают состав).
  // Присутствие '39'/'43' — закреплён A59 (красный до 000077).
  // Ребейз 000077 на мастер (2026-10-03): union += '46' (000093) —
  // пин регенерирован по фактическому коду.
  // Ребейз 000094 на мастер (2026-10-03): MERGED/UNION += '48'
  // (000094) — пин регенерирован по фактическому коду.
  // Ребейз 000091 на мастер (2026-10-03): MERGED/UNION +=
  // '44_rest'/'44_rumors' (000091) — пин регенерирован по
  // фактическому коду.
  const MERGED = ['36', '37', '38', '40', '41', '42', '46', '48',
    '44_rest', '44_rumors'];
  const UNION = ['36', '37', '38', '39', '40', '41', '42', '43', '46',
    '48', '44_rest', '44_rumors'];
  const regKeys = Object.keys(BE.EFFECTS);
  for (const id of MERGED) {
    assert.ok(regKeys.includes(id),
      'реестр: смерженная запись «' + id + '» на месте');
  }
  for (const id of regKeys) {
    assert.ok(UNION.includes(id),
      'реестр: чужой id «' + id + '» (union 000074/000075/000076/' +
      '000077/000093/000094/000091)');
  }
  for (const id of ['36', '37', '38']) {
    assert.equal(typeof BE.EFFECTS[id].имя, 'string', id + ': имя');
    assert.equal(typeof BE.EFFECTS[id].apply, 'function',
      id + ': apply(state)');
  }
  for (const m of ['buildingActions', 'effectIds', 'hasEffects',
    'hasDailyLimit', 'linkTeleportCircles', 'teleportDestination',
    'teleportCharge', 'serializeTeleports', 'restoreTeleports',
    'moonDreamHint',
    // 000093: смотровая башня — explored (чистые экспорты,
    // память 000093-explored-tower.md §2.2).
    'markExplored', 'exploredCount', 'serializeExplored',
    'restoreExplored']) {
    assert.equal(typeof BE[m], 'function', 'BE.' + m + ' — функция');
  }
});

test('A2. buildingActions: постройки без записи в реестре, NPC нет — пустой список', () => {
  const BE = loadBE();
  // СИНТЕТИЧЕСКИЙ id (000075): тест обязан проходить при ЛЮБОМ составе
  // реестра (000074/000075/000076 добавляют реальные записи).
  const res = BE.buildingActions(
    { id: 97, особые_параметры: {} }, null, makeState());
  assert.deepEqual(res, [], 'ни «Диалога», ни эффектов');
});

test('A3. buildingActions: NPC есть, эффектов нет — ровно «Диалог»', () => {
  const BE = loadBE();
  // id 96 — СИНТЕТИЧЕСКИЙ (000075): тест обязан проходить при ЛЮБОМ
  // составе реестра; 36 с 000076 — «Благословение» (не «без эффектов»).
  const res = BE.buildingActions(
    { id: 96, особые_параметры: {} }, NPC(), makeState());
  assert.equal(res.length, 1, 'один пункт');
  assert.equal(res[0].id, 'dialog', 'id зафиксирован');
  assert.equal(res[0].имя, 'Диалог', 'имя зафиксировано');
  assert.equal(res[0].доступен, true, 'диалог всегда доступен');
});

test('A4. buildingActions: связь 1-к-1 по building.id; «Диалог» ПЕРВЫМ', () => {
  const BE = loadBE();
  // СИНТЕТИЧЕСКИЙ id 90 (000075): временные записи реестра не должны
  // затенять/тирать РЕАЛЬНЫЕ записи ('40' — 000074, '41' — 000075).
  BE.EFFECTS['90'] = { имя: 'Тест-действие' };
  try {
    const b = { id: 90, особые_параметры: {} };
    const r1 = BE.buildingActions(b, null, makeState());
    assert.equal(r1.length, 1, 'без NPC — только эффект');
    assert.equal(r1[0].id, '90', 'id эффекта = String(building.id)');
    assert.equal(r1[0].имя, 'Тест-действие');
    assert.equal(r1[0].доступен, true);
    const r2 = BE.buildingActions(b, NPC(), makeState());
    assert.deepEqual(r2.map((r) => r.id), ['dialog', '90'],
      'порядок: «Диалог» первым, затем эффекты');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A5. buildingActions: порядок эффектов — из каталога (спец.эффекты); чужой id — пропуск', () => {
  const BE = loadBE();
  BE.EFFECTS['b'] = { имя: 'Бэ' };
  BE.EFFECTS['a'] = { имя: 'А' };
  try {
    const b = { id: 99, особые_параметры: { эффекты: ['b', 'a', 'nope'] } };
    const r1 = BE.buildingActions(b, null, makeState());
    assert.deepEqual(r1.map((r) => r.id), ['b', 'a'],
      'порядок из каталога, не порядок вставки в реестр; без записи — пропуск');
    assert.deepEqual(r1.map((r) => r.имя), ['Бэ', 'А']);
    const r2 = BE.buildingActions(b, NPC(), makeState());
    assert.deepEqual(r2.map((r) => r.id), ['dialog', 'b', 'a'],
      '«Диалог» первым и с массивом эффектов');
  } finally {
    delete BE.EFFECTS['b'];
    delete BE.EFFECTS['a'];
  }
});

test('A6. effectIds/hasEffects: дешёвая проверка БЕЗ сейва (хук HUD)', () => {
  const BE = loadBE();
  // СИНТЕТИЧЕСКИЕ id (000075): «без записи» проверяем на id, которых в
  // реестре НЕ БУДЕТ НИКОГДА (97/98), — реальные записи '40' (000074)
  // и '41' (000075) этот тест не ломают.
  assert.equal(BE.hasEffects({ id: 97, особые_параметры: {} }), false,
    'id без записи в реестре — эффектов нет');
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    assert.deepEqual(BE.effectIds({ id: 90, особые_параметры: {} }), ['90']);
    assert.equal(BE.hasEffects({ id: 90, особые_параметры: {} }), true);
    BE.EFFECTS['b'] = { имя: 'Бэ' };
    try {
      assert.deepEqual(
        BE.effectIds({ id: 99, особые_параметры: { эффекты: ['b', 'a'] } }),
        ['b'], 'только id с записями в реестре (порядок каталога)');
      assert.equal(BE.hasEffects({ id: 98, особые_параметры: {} }), false);
    } finally {
      delete BE.EFFECTS['b'];
    }
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A7. раз-в-день: флаг каталога раз_в_день — тот же день заблокирован, следующий — свободен', () => {
  const BE = loadBE();
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    const b = { id: 90, особые_параметры: { раз_в_день: true } };
    const used = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:90': 3 } },
    });
    const r1 = BE.buildingActions(b, null, used);
    assert.equal(r1[0].доступен, false, 'использовано в день 3, день 3');
    assert.equal(r1[0].reason, 'уже использовано сегодня',
      'reason зафиксирован текстом');
    const r2 = BE.buildingActions(b, null,
      Object.assign({}, used, { day: 4 }));
    assert.equal(r2[0].доступен, true, 'следующий день — свободно');
    assert.equal(r2[0].reason, undefined, 'без причины доступность');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A8. раз-в-день: флага НУГДЕ — эффект доступен, даже с записью в сейве (лимит не наследуется)', () => {
  const BE = loadBE();
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    const b = { id: 90, особые_параметры: {} };
    const r = BE.buildingActions(b, null, makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:90': 3 } },
    }));
    assert.equal(r[0].доступен, true, 'без флага лимита нет');
    assert.equal(r[0].reason, undefined);
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A9. раз-в-день: флаг ЧИТАЕТСЯ ИЗ КАТАЛОГА (принцип 000053): две постройки, одна запись реестра', () => {
  const BE = loadBE();
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    const st = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:90': 3 } },
    });
    const withFlag = { id: 90, особые_параметры: { раз_в_день: true } };
    const withoutFlag = { id: 90, особые_параметры: {} };
    assert.equal(BE.hasDailyLimit(withFlag, '90'), true, 'флаг каталога — true');
    assert.equal(BE.hasDailyLimit(withoutFlag, '90'), false, 'без флага — false');
    assert.equal(BE.buildingActions(withFlag, null, st)[0].доступен, false,
      'с флагом каталога — заблокировано');
    assert.equal(BE.buildingActions(withoutFlag, null, st)[0].доступен, true,
      'без флага каталога — доступно');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A10. раз-в-день: флага в каталоге нет — fallback на запись реестра разВДень; каталог false побеждает', () => {
  const BE = loadBE();
  BE.EFFECTS['90'] = { имя: 'Тест', разВДень: true };
  try {
    const st = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:90': 3 } },
    });
    const noFlag = { id: 90, особые_параметры: {} };
    assert.equal(BE.hasDailyLimit(noFlag, '90'), true,
      'fallback: разВДень записи реестра');
    assert.equal(BE.buildingActions(noFlag, null, st)[0].доступен, false,
      'fallback-лимит работает через сейв');
    const falseFlag = { id: 90, особые_параметры: { раз_в_день: false } };
    assert.equal(BE.hasDailyLimit(falseFlag, '90'), false,
      'каталог false побеждает над fallback true');
    assert.equal(BE.buildingActions(falseFlag, null, st)[0].доступен, true,
      'с явным false в каталоге — доступно');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A11. раз-в-день: ключ сейва «x,y:effectId» с ОТРИЦАТЕЛЬНЫМИ координатами', () => {
  const BE = loadBE();
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    const b = { id: 90, особые_параметры: { раз_в_день: true } };
    const st = makeState({
      day: 3, tile: { x: -3, y: -7 },
      save: { buildingOncePerDay: { '-3,-7:90': 3 } },
    });
    assert.equal(BE.buildingActions(b, null, st)[0].доступен, false,
      'запись «-3,-7:90» читается');
    // Запись ДРУГОГО тайла не блокирует этот.
    const st2 = makeState({
      day: 3, tile: { x: -3, y: -7 },
      save: { buildingOncePerDay: { '-3,-8:90': 3 } },
    });
    assert.equal(BE.buildingActions(b, null, st2)[0].доступен, true,
      'другой тайл — не блокирует');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A12. buildingActions: чистая — building/npc/state (снимок) не мутируются', () => {
  const BE = loadBE();
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    const building = { id: 90, особые_параметры: { раз_в_день: true } };
    const npc = NPC();
    const state = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:90': 3 } },
    });
    const b0 = JSON.parse(JSON.stringify(building));
    const n0 = JSON.parse(JSON.stringify(npc));
    const s0 = JSON.parse(JSON.stringify(state));
    BE.buildingActions(building, npc, state);
    assert.deepEqual(building, b0, 'building не мутирован');
    assert.deepEqual(npc, n0, 'npc не мутирован');
    assert.deepEqual(state, s0, 'state (снимок сейва) не мутирован');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A13. раз-в-день: сейв отсутствует/мусорный — fail-open (000029), игра не ломается', () => {
  const BE = loadBE();
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    const b = { id: 90, особые_параметры: { раз_в_день: true } };
    assert.equal(BE.buildingActions(b, null, makeState({ save: {} }))[0]
      .доступен, true, 'save без раздела — доступно');
    assert.equal(BE.buildingActions(b, null,
      makeState({ save: { buildingOncePerDay: 'junk' } }))[0].доступен, true,
      'мусорный раздел — доступно (fail-open)');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A14. building-effects (UMD vm): грузится БЕЗ других модулей — взаимных require в момент загрузки нет (000053)', () => {
  // Песочница ТОЛЬКО с building-effects.js: браузерная ветка обязан дать
  // Game.buildingEffects без require (в отличие от npc.js/day.js, у них
  // есть node-зависимости) и без чтения Game при загрузке (Game.pустой).
  const modPath = path.join(ROOT, 'src', 'building-effects.js');
  const code = fs.readFileSync(modPath, 'utf8'); // красный: файла нет
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'building-effects.js' });
  const BE = sandbox.Game.buildingEffects;
  assert.ok(BE, 'Game.buildingEffects создан браузерной веткой');
  assert.equal(typeof BE.buildingActions, 'function');
  // Работоспособность в чужом realm БЕЗ day.js (canUseToday — fallback
  // last !== day): блокировка/свобода по снимку сейва.
  const res1 = BE.buildingActions(
    { id: 90, особые_параметры: {} },
    { id: 'npc_x', имя: 'Тест' },
    { day: 1, tile: { x: 0, y: 0 }, hero: {}, save: {} });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'dialog');
  assert.equal(res1[0].имя, 'Диалог');
  assert.equal(res1[0].доступен, true);
  // Лимит без Game.canUseToday: fallback-сравнение дней.
  BE.EFFECTS['90'] = { имя: 'Тест' };
  try {
    const b = { id: 90, особые_параметры: { раз_в_день: true } };
    const r1 = BE.buildingActions(b, null,
      { day: 3, tile: { x: 5, y: 7 }, hero: {},
        save: { buildingOncePerDay: { '5,7:90': 3 } } });
    assert.equal(r1[0].доступен, false, 'fallback блокирует тот же день');
    const r2 = BE.buildingActions(b, null,
      { day: 4, tile: { x: 5, y: 7 }, hero: {},
        save: { buildingOncePerDay: { '5,7:90': 3 } } });
    assert.equal(r2[0].доступен, true, 'fallback освобождает следующий');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

test('A15. available?(state): недневная доступность — reason по строке/false, истина — доступно (ревью раунда 2)', () => {
  const BE = loadBE();
  // available(state) — строка: недоступно, строка — reason.
  BE.EFFECTS['88'] = {
    имя: 'Тест',
    available: (st) => (st.save && st.save.открыт ? true : 'тест: молчит'),
  };
  try {
    const closed = BE.buildingActions(
      { id: 88, особые_параметры: {} }, null,
      makeState({ save: { открыт: false } }));
    assert.equal(closed[0].доступен, false, 'available → строка: недоступно');
    assert.equal(closed[0].reason, 'тест: молчит',
      'reason — строка, возвращённая available');
    const open = BE.buildingActions(
      { id: 88, особые_параметры: {} }, null,
      makeState({ save: { открыт: true } }));
    assert.equal(open[0].доступен, true, 'available → true: доступно');
    assert.equal(open[0].reason, undefined, 'без причины доступность');
  } finally {
    delete BE.EFFECTS['88'];
  }
  // false/null/'' — недоступно, reason «недоступно»; available нет —
  // доступно (регрессия: прежние записи реестра без available).
  // СИНТЕТИЧЕСКИЕ id 89..92 (000075): 41 — РЕАЛЬНАЯ запись этой
  // задачи, временные записи её не затирают.
  BE.EFFECTS['89'] = { имя: 'Т', available: () => false };
  BE.EFFECTS['90'] = { имя: 'Т', available: () => null };
  BE.EFFECTS['91'] = { имя: 'Т', available: () => '' };
  BE.EFFECTS['92'] = { имя: 'Т' };
  try {
    const st = makeState();
    for (const id of ['89', '90', '91']) {
      const r = BE.buildingActions(
        { id: Number(id), особые_параметры: {} }, null, st);
      assert.equal(r[0].доступен, false,
        id + ': false/null/\'\' — недоступно');
      assert.equal(r[0].reason, 'недоступно', id + ': reason по умолчанию');
    }
    const r92 = BE.buildingActions(
      { id: 92, особые_параметры: {} }, null, st);
    assert.equal(r92[0].доступен, true,
      'без available — доступно (регрессия)');
  } finally {
    for (const id of ['89', '90', '91', '92']) delete BE.EFFECTS[id];
  }
});

test('A16. available ПЕРВОЙ: недневная причина перебивает «уже использовано сегодня»; state не мутирован', () => {
  const BE = loadBE();
  BE.EFFECTS['88'] = {
    имя: 'Тест',
    available: () => 'тест: молчит',
    apply: () => ({ ok: true }),
  };
  try {
    const b = { id: 88, особые_параметры: { раз_в_день: true } };
    const state = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:88': 3 } },
    });
    const s0 = JSON.parse(JSON.stringify(state));
    const r = BE.buildingActions(b, null, state);
    assert.equal(r[0].доступен, false, 'недоступно по available');
    assert.equal(r[0].reason, 'тест: молчит',
      'reason available, а не лимитный «уже использовано сегодня»');
    assert.deepEqual(state, s0, 'state (снимок) не мутирован');
  } finally {
    delete BE.EFFECTS['88'];
  }
});

test('A17. building-effects (UMD vm): available?(state) работает в песочнице БЕЗ других модулей', () => {
  const modPath = path.join(ROOT, 'src', 'building-effects.js');
  const code = fs.readFileSync(modPath, 'utf8');
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'building-effects.js' });
  const BE = sandbox.Game.buildingEffects;
  BE.EFFECTS['88'] = {
    имя: 'Тест',
    available: (st) => (st.day > 2 ? true : 'тест: ещё спит'),
  };
  try {
    const r1 = BE.buildingActions(
      { id: 88, особые_параметры: {} }, null,
      { day: 1, tile: { x: 0, y: 0 }, hero: {}, save: {} });
    assert.equal(r1[0].доступен, false, 'в чужом realm: недоступно');
    assert.equal(r1[0].reason, 'тест: ещё спит');
    const r2 = BE.buildingActions(
      { id: 88, особые_параметры: {} }, null,
      { day: 3, tile: { x: 0, y: 0 }, hero: {}, save: {} });
    assert.equal(r2[0].доступен, true, 'в чужом realm: доступно');
  } finally {
    delete BE.EFFECTS['88'];
  }
});

test('A18. раз-в-день: apply БЕЗ флага — лимита НЕТ (implicit-лимит убран, ревью раунда 3)', () => {
  // Контракт плана 000064: «фонтан: исцеление лимит / монета — нет».
  // До ревью раунда 3 hasDailyLimit возвращал true на любое
  // «исполняемое» (есть apply) — фонтан монет получал бы ложный
  // лимит раз в день.
  const BE = loadBE();
  BE.EFFECTS['90'] = {
    имя: 'Монета',
    apply: () => ({ ok: true, message: '+1' }),
  };
  try {
    const b = { id: 90, особые_параметры: {} };
    assert.equal(BE.hasDailyLimit(b, '90'), false,
      'apply без флага — без лимита');
    // И через buildingActions: в тот же день — снова доступно.
    const st = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:90': 3 } },
    });
    assert.equal(BE.buildingActions(b, null, st)[0].доступен, true,
      'запись в сейве без флага — не блокирует');
  } finally {
    delete BE.EFFECTS['90'];
  }
});

// --- Задача 000075: телепорт-круг — ЧИСТЫЕ контракты (секция A) ---
//
// Контракты, зафиксированные здесь (решения — memory/000075-
// teleport-circles.md; полный отчёт — tasks/result/000075.md):
//   * linkTeleportCircles(circles, x, y, R, tieHash) →
//     { pairId: 'x,y' | null, reason?: 'no_pair' }: ближайший другой
//     круг по РАССТОЯНИЮ CHEBYSHEV в радиусе R (граница включительно);
//     якорь (x, y) сам (если в списке) игнорируется; при равенстве
//     расстояний — MIN tieHash(x, y); финальный лекс. тай-брейк
//     (x, затем y). Пары АССИМЕТРИЧНЫ: каждый круг — к СВОЕМУ
//     ближайшему (симметрия НЕ гарантируется — зафиксировано A25).
//   * teleportDestination(anchor, size, passable, tieHash) →
//     { x, y } | null: проходимый тайл в footprint-соседстве парного
//     круга (кольцо: dx -1..width, dy -1..height; внутренние тайлы
//     footprint'а — не кандидаты); oracle passable(x, y) — мир-
//     предикат main.js (t.passable && !t.inBuilding && !t.hasMobGroup);
//     порядок: ближайшие к якорь-тайлу по Чебышеву, затем tieHash,
//     затем лекс.; нет проходимых → null (в игре: переноса нет,
//     золото не тратится).
//   * teleportCharge(hero, active, cost) → { ok: true, gold } |
//     { ok: false, message: 'недостаточно золота', gold }: первое
//     использование списывает стоимость, повтор (active) — НЕ
//     списывает, мало золота — отказ БЕЗ списания; hero не мутируется.
//   * serializeTeleports(Map) / restoreTeleports(объект) — раздел
//     сейва data.teleports (имя зафиксировано 000072):
//     'x,y' → { pair: 'px,py'|null, dest: 'dx,dy'|null,
//     active: boolean }; мусорный раздел (не-объект/массив) — пустой
//     Map без исключения; мусорная запись — отброс записи (fail-open,
//     000029); roundtrip.
//   * EFFECTS['41'] — имя «Активировать/Телепорт», БЕЗ лимита
//     раз-в-день (ни каталог 000041, ни запись реестра): разовая
//     оплата, дальше бесплатно. available(state) — пара в
//     save.teleports[tile] → true, иначе «круг молчит: нет пары
//     вблизи»; apply(state) — ЧИСТАЯ валидация по СНИМКУ (мира и
//     каталога у apply НЕТ — dest и стоимость читает main.js):
//     нет пары → not-ok «круг молчит: нет пары вблизи»; пара, но
//     dest:null → not-ok «нет проходимого тайла рядом с парным
//     кругом»; пара + dest → { ok: true, message: TELEPORT_MSG,
//     teleport: {x, y} } — dest ИЗ СНИМКА сейва (скан делает main.js
//     при первом подходе и кэширует). apply НЕ мутирует снимок,
//     НЕ трогает hero.gold и НЕ перемещает — исполнение (списание,
//     hero.gold, player.x/y, mover.teleport, saveNow) — в onBuildingAction
//     main.js в общей ok-ветке по r.teleport (контракт — memory).

const TELEPORT_MSG = 'телепорт: перенос к парному кругу';

test('A20. link: ближайший по CHEBYSHEV (не евклидов)', () => {
  const BE = loadBE();
  const tie = (x, y) => ((x * 31 + y) & 0xffffffff) >>> 0;
  // (5,5): cheb 5, eucl 7.07; (6,0): cheb 6, eucl 6 — евклидово
  // ближе (6,0), чебышефово — (5,5).
  const r = BE.linkTeleportCircles(
    [{ x: 5, y: 5 }, { x: 6, y: 0 }], 0, 0, 100, tie);
  assert.equal(r.pairId, '5,5', 'расстояние — Чебышев, не евклидов');
});

test('A21. link: граница R включительно; за R — «спит» (no_pair)', () => {
  const BE = loadBE();
  const tie = (x, y) => x;
  assert.equal(BE.linkTeleportCircles(
    [{ x: 100, y: 0 }], 0, 0, 100, tie).pairId, '100,0',
    'граница R=100 — пара');
  const r = BE.linkTeleportCircles([{ x: 101, y: 0 }], 0, 0, 100, tie);
  assert.deepEqual(r, { pairId: null, reason: 'no_pair' },
    'за R — «спит» (НЕ ошибка)');
});

test('A22. link: тай-брейк по tieHash — перестановка списка НЕ меняет результат', () => {
  const BE = loadBE();
  // Три круга на одном чебышевском расстоянии (1 от (0,0));
  // min tieHash — у (0,1).
  const tie = (x, y) => ((x === 0 && y === 1) ? 0 : (x === 1 ? 1 : 2));
  const base = [{ x: 1, y: 0 }, { x: 0, y: 1 }, { x: -1, y: 1 }];
  const perms = [
    base,
    [base[1], base[0], base[2]],
    [base[1], base[2], base[0]],
    [base[2], base[0], base[1]],
    [base[2], base[1], base[0]],
    [base[0], base[2], base[1]],
  ];
  for (const p of perms) {
    assert.equal(BE.linkTeleportCircles(p, 0, 0, 10, tie).pairId, '0,1',
      'все 6 перестановок списка → одна пара (детерминизм по tieHash)');
  }
});

test('A23. link: пустой список / одиночный круг / круг НА якорном тайле — no_pair, без исключения', () => {
  const BE = loadBE();
  const tie = () => 0;
  assert.deepEqual(BE.linkTeleportCircles([], 0, 0, 100, tie),
    { pairId: null, reason: 'no_pair' }, 'пустой список');
  assert.deepEqual(
    BE.linkTeleportCircles([{ x: 0, y: 0 }], 0, 0, 100, tie),
    { pairId: null, reason: 'no_pair' }, 'круг на якорном тайле — не пара');
  assert.equal(BE.linkTeleportCircles(
    [{ x: 0, y: 0 }, { x: 5, y: 5 }], 0, 0, 100, tie).pairId, '5,5',
    'сам якорь игнорируется — пара найдена среди остальных');
});

test('A24. link: детерминизм «в двух мирах» + лекс. финальный тай-брейк (tieHash константа)', () => {
  const BE = loadBE();
  // Тот же набор кругов, разные порядки списка, один tieHash —
  // одна пара («два мира» — один и тот же мир, другой порядок скана).
  const circles = [{ x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 }];
  const tie = (x, y) => x * 7 + y;
  const r1 = BE.linkTeleportCircles(circles, 0, 0, 5, tie);
  const r2 = BE.linkTeleportCircles([...circles].reverse(), 0, 0, 5, tie);
  assert.equal(r1.pairId, r2.pairId, 'перестановка списка — та же пара');
  assert.equal(r1.pairId, '-1,0', 'выбор по tieHash (min x*7+y)');
  // tieHash константа (hash2 32-битный — коллизия теоретически
  // возможна): финальный тай-брейк лексикографический (x, затем y).
  assert.equal(
    BE.linkTeleportCircles(circles, 0, 0, 5, () => 0).pairId, '-1,0',
    'лекс. финальный тай-брейк: min x, затем min y');
});

test('A25. link: АССИМЕТРИЯ пар ЗАФИКСИРОВАНА — каждый круг к СВОЕМУ ближайшему (A→B, B→C, C→B)', () => {
  const BE = loadBE();
  const tie = (x, y) => x;
  // A(0,0), B(10,0), C(19,0): cheb A-B 10, B-C 9, A-C 19.
  // Пара A — B, но пара B — C: телепорт из A ведёт к B, хотя «связка»
  // B ведёт дальше. Это ОСОЗНАННОЕ поведение (каждый круг парится со
  // своим ближайшим, симметрия НЕ гарантируется) — зафиксировано.
  assert.equal(BE.linkTeleportCircles(
    [{ x: 10, y: 0 }, { x: 19, y: 0 }], 0, 0, 100, tie).pairId, '10,0',
    'A → B (10 < 19)');
  assert.equal(BE.linkTeleportCircles(
    [{ x: 0, y: 0 }, { x: 19, y: 0 }], 10, 0, 100, tie).pairId, '19,0',
    'B → C (9 < 19)');
  assert.equal(BE.linkTeleportCircles(
    [{ x: 0, y: 0 }, { x: 10, y: 0 }], 19, 0, 100, tie).pairId, '10,0',
    'C → B (9 < 19)');
});

test('A26. teleportDestination: 1x1 — цель в footprint-соседстве (кольцо cheb 1) по tieHash; 2x2 — ближайший к якорю', () => {
  const BE = loadBE();
  const allPass = () => true;
  // 1x1 в (10,20): все 8 соседей проходимы; min x*7+y — (9,19).
  const r1 = BE.teleportDestination(
    { x: 10, y: 20 }, { width: 1, height: 1 }, allPass, (x, y) => x * 7 + y);
  assert.deepEqual(r1, { x: 9, y: 19 }, '1x1: кольцо + тай-брейк по tieHash');
  assert.equal(Math.max(Math.abs(r1.x - 10), Math.abs(r1.y - 20)), 1,
    'цель — footprint-соседство (cheb 1 от круга)');
  assert.notDeepEqual(r1, { x: 10, y: 20 }, 'НЕ сам тайл круга');
  // 2x2 в (10,20): footprint (10,20)-(11,21); кольцо — 12 тайлов.
  // tieHash константа → ближайшие к якорь-тайлу по Чебышеву (cheb 1):
  // (9,19),(9,20),(9,21),(10,19),(11,19) → лекс. — (9,19).
  const r2 = BE.teleportDestination(
    { x: 10, y: 20 }, { width: 2, height: 2 }, allPass, () => 0);
  assert.deepEqual(r2, { x: 9, y: 19 },
    '2x2: ближайший к якорю (не дальний угол кольца), затем лекс.');
  const inFoot = (p) => p.x >= 10 && p.x < 12 && p.y >= 20 && p.y < 22;
  assert.ok(!inFoot(r2), 'цель — не тайл ВНУТРИ footprint (2x2)');
});

test('A27. teleportDestination: непроходимые соседи пропускаются (oracle); все непроходимы → null', () => {
  const BE = loadBE();
  const tie = (x, y) => x * 7 + y;
  // 1x1 в (0,0): проходимы только (1,0) и (0,1); tieHash: (0,1)=1 < (1,0)=7.
  const somePass = (x, y) => (x === 1 && y === 0) || (x === 0 && y === 1);
  assert.deepEqual(BE.teleportDestination(
    { x: 0, y: 0 }, { width: 1, height: 1 }, somePass, tie),
    { x: 0, y: 1 }, 'непроходимые пропускаются; из проходимых — по tieHash');
  assert.equal(BE.teleportDestination(
    { x: 0, y: 0 }, { width: 1, height: 1 }, () => false, tie), null,
    'все соседи непроходимы → null (в игре: переноса нет, золото не тратится)');
});

test('A28. teleportCharge: первое — списывает, повтор — не списывает, мало золота — отказ без списания; чистота', () => {
  const BE = loadBE();
  const hero = { gold: 100 };
  const h0 = JSON.parse(JSON.stringify(hero));
  const r1 = BE.teleportCharge(hero, false, 25);
  assert.equal(r1.ok, true, 'первое использование — ok');
  assert.equal(r1.gold, 75, 'списана стоимость (25)');
  const r2 = BE.teleportCharge({ gold: 24 }, false, 25);
  assert.equal(r2.ok, false, 'мало золота — отказ');
  assert.equal(r2.message, 'недостаточно золота', 'сообщение отказов зафиксировано');
  assert.equal(r2.gold, 24, 'отказ БЕЗ списания');
  const r3 = BE.teleportCharge({ gold: 75 }, true, 25);
  assert.equal(r3.ok, true, 'повтор (active) — ok');
  assert.equal(r3.gold, 75, 'повтор — НЕ списывает');
  const r4 = BE.teleportCharge({ gold: 100 }, false, 0);
  assert.equal(r4.ok, true, 'cost 0 — ok');
  assert.equal(r4.gold, 100, 'cost 0 — без списания');
  assert.deepEqual(hero, h0, 'hero не мутирован (чистота)');
});

test('A29. serialize/restoreTeleports: roundtrip; мусорный раздел — пустой Map; мусорная запись — отброс', () => {
  const BE = loadBE();
  const m = new Map([
    ['1,2', { pair: '3,4', dest: '5,6', active: true }],
    ['-7,0', { pair: null, dest: null, active: false }],
  ]);
  const s = BE.serializeTeleports(m);
  assert.deepEqual(s, {
    '1,2': { pair: '3,4', dest: '5,6', active: true },
    '-7,0': { pair: null, dest: null, active: false },
  }, 'сериализация — обычный объект зафиксированной формы');
  assert.deepEqual(BE.serializeTeleports(new Map()), {}, 'пустой Map — {}');
  const back = BE.restoreTeleports(s);
  assert.equal(back.size, 2, 'roundtrip: обе записи');
  assert.deepEqual(back.get('1,2'), { pair: '3,4', dest: '5,6', active: true });
  assert.deepEqual(back.get('-7,0'), { pair: null, dest: null, active: false });
  // Мусорный раздел — пустой Map БЕЗ исключения (fail-open, 000029).
  for (const junk of ['junk', [], null, undefined, 42]) {
    assert.equal(BE.restoreTeleports(junk).size, 0,
      'мусорный раздел ' + String(junk) + ' — пустой Map');
  }
  // Мусорная запись — отброс записи, валидные выживают.
  const mixed = BE.restoreTeleports({
    '1,2': { pair: '3,4', dest: '5,6', active: true },
    'junk-key': { pair: null, dest: null, active: false }, // key не 'x,y'
    '4,5': { pair: 'x,y', dest: null, active: false }, // pair не 'x,y'
    '6,7': { pair: null, dest: 5, active: false }, // dest не 'x,y'
    '8,9': { pair: null, dest: null, active: 'yes' }, // active не boolean
    '10,11': { pair: null, dest: null }, // нет active
  });
  assert.equal(mixed.size, 1, 'выживает только валидная запись');
  assert.deepEqual(mixed.get('1,2'), { pair: '3,4', dest: '5,6', active: true });
});

test('A30. EFFECTS[41] на месте: имя «Активировать/Телепорт»; лимита раз-в-день НЕТ', () => {
  const BE = loadBE();
  const e = BE.EFFECTS['41'];
  assert.ok(e, 'запись реестра 41 (красный: до реализации её нет)');
  assert.equal(e.имя, 'Активировать/Телепорт', 'имя действия зафиксировано');
  assert.equal(typeof e.available, 'function', 'available(state) на месте');
  assert.equal(typeof e.apply, 'function', 'apply(state) на месте');
  assert.notEqual(e.разВДень, true, 'в записи реестра НЕТ флага раз-в-день');
  // Каталог (зеркало 000055): флага НЕТ и там — разовая оплата,
  // дальше бесплатно вечно (явный false не нужен: отсутствие флага
  // = без лимита, A18).
  const cat = require('../src/buildings.js').getBuilding(41);
  assert.ok(cat, 'каталожная запись 41 существует');
  assert.equal(BE.hasDailyLimit(cat, '41'), false,
    'телепорт — БЕЗ лимита раз-в-день');
});

test('A31. available: пара в сейве → true; «спит»/нет записи → «круг молчит: нет пары вблизи»; state не мутирован', () => {
  const BE = loadBE();
  const b = { id: 41, особые_параметры: {} };
  const withPair = makeState({
    save: { teleports: { '5,7': { pair: '10,20', dest: '11,21', active: true } } },
  });
  const sleeping = makeState({
    save: { teleports: { '5,7': { pair: null, dest: null, active: false } } },
  });
  const missing = makeState({ save: {} });
  for (const [name, st] of [['пара', withPair], ['спит', sleeping],
    ['нет записи', missing]]) {
    const s0 = JSON.parse(JSON.stringify(st));
    const r = BE.buildingActions(b, null, st);
    assert.equal(r.length, 1, name + ': ровно одна строка');
    assert.equal(r[0].id, '41', name + ': id действия 41');
    assert.deepEqual(st, s0, name + ': state (снимок) не мутирован');
  }
  const r1 = BE.buildingActions(b, null, withPair);
  assert.equal(r1[0].доступен, true, 'пара в сейве — доступно');
  assert.equal(r1[0].reason, undefined, 'без причины доступность');
  const r2 = BE.buildingActions(b, null, sleeping);
  assert.equal(r2[0].доступен, false, '«спит» (pair: null) — недоступно');
  assert.equal(r2[0].reason, 'круг молчит: нет пары вблизи',
    'reason «спит» зафиксирован текстом (ТЗ)');
  const r3 = BE.buildingActions(b, null, missing);
  assert.equal(r3[0].доступен, false, 'записи в сейве нет — недоступно');
  assert.equal(r3[0].reason, 'круг молчит: нет пары вблизи',
    'нет записи — тот же reason (скана ещё не было / пары нет)');
});

test('A32. apply: нет пары — not-ok «спит»; пара + dest:null — «нет проходимого тайла»; пара + dest — ok + teleport ИЗ СНИМКА; снимок не мутирован', () => {
  const BE = loadBE();
  const apply = BE.EFFECTS['41'].apply;
  // Нет пары («спит»).
  const r1 = apply(makeState({
    save: { teleports: { '5,7': { pair: null, dest: null, active: false } } },
  }));
  assert.equal(r1.ok, false, 'нет пары — not-ok');
  assert.equal(r1.message, 'круг молчит: нет пары вблизи');
  // Записи в сейве нет вовсе — то же (скана ещё не было).
  const r1b = apply(makeState({ save: {} }));
  assert.equal(r1b.ok, false, 'нет записи — not-ok');
  assert.equal(r1b.message, 'круг молчит: нет пары вблизи');
  // Пара есть, но при скане не нашлось проходимого тайла (dest: null).
  const r2 = apply(makeState({
    save: { teleports: { '5,7': { pair: '10,20', dest: null, active: false } } },
  }));
  assert.equal(r2.ok, false, 'пара + dest:null — not-ok (переноса не будет)');
  assert.equal(r2.message, 'нет проходимого тайла рядом с парным кругом',
    'reason «нет проходимого» зафиксирован текстом');
  // Пара + dest — ok; teleport — ровно dest ИЗ СНИМКА сейва (apply мира
  // не имеет: dest кэширован сканом при первом подходе, main.js).
  const ok = makeState({
    save: { teleports: { '5,7': { pair: '10,20', dest: '11,21', active: false } } },
  });
  const s0 = JSON.parse(JSON.stringify(ok));
  const r3 = apply(ok);
  assert.equal(r3.ok, true, 'пара + dest — ok');
  assert.deepEqual(r3.teleport, { x: 11, y: 21 },
    'teleport — ровно dest из СНИМКА сейва');
  assert.equal(r3.message, TELEPORT_MSG, 'сообщение успеха зафиксировано');
  assert.deepEqual(ok, s0,
    'apply не мутирует СНИМОК (hero.gold, save — глубокое сравнение)');
});

// --- Задача 000076: благословения храма (36 солнце / 38 гора) и «Сон»
// храма луны (37) — КРАСНЫЕ тесты (TDD), падают до реализации. ---
//
// Контракты (решения — memory/000076-temple-blessings.md):
//   * Реестр: записи '36' (Благословение, солнце — kind 'damage'),
//     '38' (Благословение, гора — kind 'armor'), '37' («Сон» —
//     подсказка, без раз-в-день). '39' — НЕ здесь (000077).
//   * apply('36'/'38') → { ok, buffs, message }: buffs — НОВЫЙ массив
//     от ЛЕНИВОГО Game.grantBuff(state.save.buffs, 'x,y', day, kind)
//     (паттерн canUseTodayLazy; Game из globalThis в момент вызова);
//     grantBuff отсутствует — { ok:false, message:'недоступно' }
//     (fail-open, 000029). СНИМОК (state) НЕ мутируется (000071/A12):
//     живой массив buffs меняет main.js (общий хук r.buffs).
//   * moonDreamHint(map, x, y) — ЧИСТАЯ: скан ОКНА max(w,h)×max(w,h),
//     ЦЕНТРИРОВАННОГО на (x,y) (ревью раунд 1: мир бесконечен,
//     [0,w)×[0,h) — размер пиксельной сетки, не мира),
//     вход = hasBuilding && building === CAVE_ENTRANCE
//     (ленивый Game.BUILDING_TYPES, fallback 9) && buildingId !== 48
//     (развалины — 000073); ближайший по Чебышеву, тай-брейк —
//     лексикографически меньший (x, затем y); dungeonType — ленивый
//     Game.dungeonTypeFor(terrain, альфа map.pixelAt(x,y)[3],
//     fallback 255); нет входов в окне / map бит — { entrance:null,
//     dungeonType:null } без исключений.

// ЛЕНИВЫЕ Game-функции (как canUseTodayLazy): на время вызова
// устанавливаем globalThis.Game, затем восстанавливаем (node-realm;
// vm-песочницы секции B — другие realm, не затрагиваются).
function withGame(fake, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'Game');
  const prev = globalThis.Game;
  globalThis.Game = fake;
  try {
    return fn();
  } finally {
    if (had) globalThis.Game = prev;
    else delete globalThis.Game;
  }
}

// Синтетическая карта для moonDreamHint: cells — Map 'x,y' → тайл;
// прочее — пустые тайлы (трава, без постройки). pixelAt — по
// умолчанию альфа 255 (тесты переопределяют).
function synthMap(cells) {
  return {
    width: 16,
    height: 16,
    tileAt(x, y) {
      const t = cells.get(x + ',' + y);
      if (t) return t;
      return {
        x, y, terrain: 3, passable: true, hasBuilding: false,
        building: -1, buildingId: null,
      };
    },
    pixelAt() { return [0, 0, 0, 255]; },
  };
}

// Тайл входа в пещеру (слот 9): базовая 31, подтипы 31..35,
// развалины — buildingId 48 (000073).
function caveTile(x, y, over = {}) {
  return Object.assign(
    { x, y, terrain: 3, passable: true, hasBuilding: true,
      building: 9, buildingId: 31 }, over);
}

test('A33. каталог (зеркало 000055): 36/38 — «эффект» + раз_в_день; 37 — «эффект» БЕЗ лимита (подсказка бесплатна)', () => {
  const B = require('../src/buildings.js');
  const p36 = B.getBuilding(36).особые_параметры;
  const p37 = B.getBuilding(37).особые_параметры;
  const p38 = B.getBuilding(38).особые_параметры;
  // Солнце: +5% урона, 1 день, раз в день (паттерн 000043).
  assert.equal(p36.раз_в_день, true, '36: раз_в_день — true');
  assert.equal(typeof p36.эффект, 'string', '36: эффект — текст');
  assert.match(p36.эффект, /5%/i, '36: текст — +5%');
  assert.match(p36.эффект, /урон/i, '36: текст — урон');
  assert.match(p36.эффект, /1 день/i, '36: текст — 1 день');
  // Гора: +1 броня, 1 день, раз в день.
  assert.equal(p38.раз_в_день, true, '38: раз_в_день — true');
  assert.equal(typeof p38.эффект, 'string', '38: эффект — текст');
  assert.match(p38.эффект, /броня/i, '38: текст — броня');
  assert.match(p38.эффект, /1 день/i, '38: текст — 1 день');
  // Луна: подсказка — БЕЗ раз_в_день (подсказка бесплатна).
  assert.equal(typeof p37.эффект, 'string', '37: эффект — текст');
  assert.match(p37.эффект, /подсказк|сон/i, '37: текст — подсказка/сон');
  assert.ok(!p37.раз_в_день, '37: флага раз_в_день НЕТ');
});

test('A34. apply(«36») — благословение солнца: grantBuff(save.buffs, «x,y», day, «damage») → НОВЫЙ массив в r.buffs; снимок не мутирован', () => {
  const BE = loadBE();
  const state = makeState({
    day: 5, tile: { x: 7, y: -3 }, save: { buffs: [] },
  });
  const s0 = JSON.parse(JSON.stringify(state));
  const calls = [];
  const sentinel = [{ source: '7,-3', day: 5, kind: 'damage' }];
  withGame({
    grantBuff: (buffs, source, day, kind) => {
      calls.push([buffs, source, day, kind]);
      return sentinel;
    },
  }, () => {
    const r = BE.EFFECTS['36'].apply(state);
    assert.equal(r.ok, true, 'ok');
    assert.equal(r.buffs, sentinel,
      'r.buffs — тот самый массив grantBuff (мировые buffs не тронуты)');
    assert.equal(typeof r.message, 'string', 'message есть');
    assert.match(r.message, /благословение/i, 'message — «благословение»');
    assert.match(r.message, /5%/i, 'message — +5%');
    assert.deepEqual(calls, [[state.save.buffs, '7,-3', 5, 'damage']],
      'grantBuff(save.buffs, «7,-3», 5, «damage»)');
    assert.deepEqual(state, s0, 'СНИМОК (state) не мутирован');
  });
});

test('A35. apply(«38») — благословение горы: kind «armor»', () => {
  const BE = loadBE();
  const state = makeState({
    day: 5, tile: { x: 7, y: -3 }, save: { buffs: [] },
  });
  const calls = [];
  withGame({
    grantBuff: (buffs, source, day, kind) => {
      calls.push([buffs, source, day, kind]);
      return [{ source: '7,-3', day: 5, kind: 'armor' }];
    },
  }, () => {
    const r = BE.EFFECTS['38'].apply(state);
    assert.equal(r.ok, true, 'ok');
    assert.deepEqual(calls, [[state.save.buffs, '7,-3', 5, 'armor']]);
    assert.match(r.message, /благословение/i, 'message — «благословение»');
    assert.match(r.message, /броня/i, 'message — «броня»');
  });
});

test('A36. apply(«36»/«38») БЕЗ Game.grantBuff — fail-open: ok:false, без исключений (000029)', () => {
  const BE = loadBE();
  withGame({}, () => {
    for (const id of ['36', '38']) {
      const r = BE.EFFECTS[id].apply(makeState({
        day: 5, tile: { x: 1, y: 2 }, save: { buffs: [] },
      }));
      assert.equal(r.ok, false, id + ': ok:false');
      assert.equal(r.message, 'недоступно', id + ': reason «недоступно»');
    }
  });
});

test('A37. apply(«36»/«38») → РЕАЛЬНЫЙ day.js buffMods: активен день выдачи, на следующий — истёк (контракт 000072)', () => {
  const BE = loadBE();
  const D = require('../src/day.js');
  withGame({ grantBuff: D.grantBuff }, () => {
    const st = makeState({
      day: 10, tile: { x: 0, y: 0 }, save: { buffs: [] },
    });
    const rd = BE.EFFECTS['36'].apply(st);
    assert.equal(rd.ok, true);
    assert.deepEqual(D.buffMods(rd.buffs, 10),
      { damageMult: 1.05, armor: 0 }, 'солнце: активен в день выдачи');
    assert.deepEqual(D.buffMods(rd.buffs, 11),
      { damageMult: 1, armor: 0 }, 'солнце: истёк на следующий день');
    const ra = BE.EFFECTS['38'].apply(st);
    assert.equal(ra.ok, true);
    assert.deepEqual(D.buffMods(ra.buffs, 10),
      { damageMult: 1, armor: 1 }, 'гора: armor +1 в день выдачи');
    assert.deepEqual(D.buffMods(ra.buffs, 11),
      { damageMult: 1, armor: 0 }, 'гора: истёк на следующий день');
  });
});

test('A38. moonDreamHint: ближайший по Чебышеву; развалины (48) и другие слоты — НЕ кандидаты; тип — dungeonTypeFor', () => {
  const BE = loadBE();
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  const cells = new Map();
  cells.set('2,2', caveTile(2, 2, { terrain: 7 })); // болото → затопленная
  cells.set('8,2', caveTile(8, 2)); // та же дистанция (3), x больше
  cells.set('2,8', caveTile(2, 8, { buildingId: 48 })); // развалины — не вход
  cells.set('5,4', {
    x: 5, y: 4, terrain: 3, passable: true, hasBuilding: true,
    building: 8, buildingId: 37, // храм ближе (1) — но НЕ пещера
  });
  const map = synthMap(cells);
  withGame({ BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor }, () => {
    const h = BE.moonDreamHint(map, 5, 5);
    assert.deepEqual(h.entrance, { x: 2, y: 2 },
      'ближайший (2,2); развалины (2,8) и (8,2) не выбраны');
    assert.equal(h.dungeonType, D.DUNGEON_TYPES.DROWNED,
      'болото (terrain 7) → затопленная пещера');
  });
});

test('A38b. moonDreamHint: холмистый вход — тип по альфа-каналу пикселя (альфа читаётся из map.pixelAt)', () => {
  const BE = loadBE();
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  const cells = new Map();
  cells.set('5,2', caveTile(5, 2, { terrain: 5 })); // холм
  const map = synthMap(cells);
  map.pixelAt = (x, y) =>
    (x === 5 && y === 2 ? [0, 0, 0, 10] : [0, 0, 0, 255]);
  withGame({ BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor }, () => {
    const h = BE.moonDreamHint(map, 5, 5);
    assert.deepEqual(h.entrance, { x: 5, y: 2 });
    assert.equal(h.dungeonType, D.DUNGEON_TYPES.ABYSS,
      'холм + тёмная альфа (10 < 64) → бездна');
  });
});

test('A39. moonDreamHint: входов нет / map отсутствует/бит — null-подсказка, без исключений; без Game — fallback (вход да, тип null)', () => {
  const BE = loadBE();
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  withGame({ BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor }, () => {
    assert.deepEqual(
      BE.moonDreamHint(synthMap(new Map()), 5, 5),
      { entrance: null, dungeonType: null }, 'входов нет — null');
    assert.deepEqual(BE.moonDreamHint(null, 5, 5),
      { entrance: null, dungeonType: null }, 'map=null — без исключений');
    assert.deepEqual(BE.moonDreamHint({ width: 4, height: 4 }, 1, 1),
      { entrance: null, dungeonType: null }, 'tileAt нет — fail-open');
  });
  // Чужой realm БЕЗ dungeon.js (как A14): CAVE_ENTRANCE fallback 9,
  // тип — null (вход всё равно виден).
  withGame({}, () => {
    const cells = new Map();
    cells.set('3,3', caveTile(3, 3));
    const h = BE.moonDreamHint(synthMap(cells), 5, 5);
    assert.deepEqual(h.entrance, { x: 3, y: 3 },
      'fallback CAVE_ENTRANCE = 9: вход найден без Game.BUILDING_TYPES');
    assert.equal(h.dungeonType, null,
      'dungeonTypeFor нет — тип null (без исключения)');
  });
});

test('A40. apply(«37») — «Сон»: сообщение с координатами входа и именем типа (DUNGEON_NAMES); state без map — ok:false; входов нет — ok:true (сообщение, не ошибка)', () => {
  const BE = loadBE();
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  withGame({
    BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor,
    DUNGEON_NAMES: D.DUNGEON_NAMES,
  }, () => {
    const cells = new Map();
    cells.set('2,2', caveTile(2, 2, { terrain: 7 }));
    const st = makeState({ day: 3, tile: { x: 5, y: 5 }, save: {} });
    st.map = synthMap(cells);
    const r = BE.EFFECTS['37'].apply(st);
    assert.equal(r.ok, true, 'ok');
    assert.ok(r.message.includes('(2, 2)'),
      'сообщение — координаты входа: ' + r.message);
    assert.ok(r.message.includes(
      D.DUNGEON_NAMES[D.DUNGEON_TYPES.DROWNED]),
      'сообщение — имя типа из DUNGEON_NAMES: ' + r.message);
    // state без map — недоступно (не исключение).
    const r2 = BE.EFFECTS['37'].apply(makeState());
    assert.equal(r2.ok, false, 'без map — ok:false');
    // Входов нет — ок (подсказка «не видно»), не ошибка.
    const r3 = BE.EFFECTS['37'].apply(
      Object.assign(makeState(), { map: synthMap(new Map()) }));
    assert.equal(r3.ok, true, 'входов нет — не ошибка');
    assert.match(r3.message, /не видны/i,
      'сообщение «входы не видны»: ' + r3.message);
  });
});

test('A41. moonDreamHint: детерминизм (повтор — тот же результат); равнодистантные — лексикографически меньший (x, затем y)', () => {
  const BE = loadBE();
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  const mk = () => {
    const cells = new Map();
    cells.set('2,2', caveTile(2, 2));
    cells.set('8,2', caveTile(8, 2)); // равная Чебышёвская (3), x больше
    cells.set('2,8', caveTile(2, 8)); // равная дистанция, y больше
    return synthMap(cells);
  };
  withGame({ BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor }, () => {
    const h1 = BE.moonDreamHint(mk(), 5, 5);
    const h2 = BE.moonDreamHint(mk(), 5, 5);
    assert.deepEqual(h1, h2, 'повторный вызов — тот же результат');
    assert.deepEqual(h1.entrance, { x: 2, y: 2 },
      'тай-брейк: меньший x, при равенстве — меньший y');
  });
});

test('A28. moonDreamHint: окно ЦЕНТРИРОВАНО на постройке (ревью раунд 1): вход ВНЕ [0,w)×[0,h) но ближе — выбран; вне окна — не кандидат', () => {
  const BE = loadBE();
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  withGame({ BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor }, () => {
    // Синтетическая карта 16×16 → окно 16×16 по центру (5,5):
    // [-3,13)×[-3,13) (R=8). Старая семантика сканировала бы
    // [0,16)×[0,16).
    // (a) (-2,5) — ВНЕ старого окна (x<0), д. Чебышёва 7; (13,5) —
    //     в старом окне, д. 8. Старая семантика → (13,5) (ближайший
    //     в окне); центрированное окно → (-2,5) — ИСТИННО ближе.
    const cells = new Map();
    cells.set('-2,5', caveTile(-2, 5));
    cells.set('13,5', caveTile(13, 5));
    const h1 = BE.moonDreamHint(synthMap(cells), 5, 5);
    assert.deepEqual(h1.entrance, { x: -2, y: 5 },
      'вход вне [0,16)², но ближе к храму — выбран');
    // (b) Окно КОНЕЧНО: единственный вход (-12,5) вне окна
    //     (|dx|=17 > R=8) → null-подсказка (не исключение, не
    //     «виден через всё поле»).
    const cells2 = new Map();
    cells2.set('-12,5', caveTile(-12, 5));
    const h2 = BE.moonDreamHint(synthMap(cells2), 5, 5);
    assert.deepEqual(h2, { entrance: null, dungeonType: null },
      'вне центрированного окна — не кандидат');
  });
});

// --- Задача 000074: рунический камень (40) + обелиск (42) ---
// Контракты: memory/000074-rune-stone-obelisk.md (apply/каталог/
// детерминизм/сиды) и memory/000074-rune-obelisk.md («уровень мира»
// = hero.level, квест постройки source 'building', grantXpRaw).
// Золотые (детерминированный seed-мир, замерено реальным
// perlin.hash2 по зафиксированным сидам):
//   * ролл камня на (-25,34) при runes 5 (chance 0.5): день 1 —
//     провал (0.695932), день 2 — успех (0.499819);
//   * фрагмент камня (5,7): день 1 — провал (0.994353), день 3 —
//     успех (0.040535), фрагмент дня 3 — T40[1];
//   * фрагменты обелиска (80,-51): день 1 — T42[2], день 2 — T42[1],
//     день 3 — как день 1 (T42[2]); (5,7) день 1 — T42[1].
// (T40/T42 — каталожные «тексты» 000040/000042, фиксация —
// memory/000074-rune-stone-obelisk.md.)

// Герой с ядром createCharacter (player.js): реальный derived()
// (runePowerMult/xpMult) работает без моков; over — merge полей.
const P = require('../src/player.js');
function mkHero(over = {}) {
  return Object.assign(P.createCharacter(), over);
}

test('A42. реестр: записи камня (40) и обелиска (42); «раз в день» — из каталога', () => {
  const BE = loadBE();
  assert.ok(BE.EFFECTS['40'],
    'запись 40 в реестре (red: нет до реализации)');
  assert.ok(BE.EFFECTS['42'], 'запись 42 в реестре');
  assert.equal(BE.EFFECTS['40'].имя, 'Расшифровать', '40: имя по ТЗ');
  assert.equal(BE.EFFECTS['42'].имя, 'Прикоснуться', '42: имя по ТЗ');
  assert.equal(typeof BE.EFFECTS['40'].apply, 'function',
    '40: apply(state)');
  assert.equal(typeof BE.EFFECTS['42'].apply, 'function',
    '42: apply(state)');
  // «Раз в день» — ИЗ КАТАЛОГА (принцип 000053): реальные записи.
  const B = require('../src/buildings.js');
  const c40 = B.getBuilding(40);
  const c42 = B.getBuilding(42);
  assert.equal(BE.hasDailyLimit(c40, '40'), true,
    'каталог 40: раз_в_день → true (red: флага нет)');
  assert.equal(BE.hasDailyLimit(c42, '42'), true,
    'каталог 42: раз_в_день → true');
  // В записях реестра разВДень НЕ ставят — каталог побеждает
  // (ТЗ: «флаг раз_в_день добавить в каталог»).
  assert.notEqual(BE.EFFECTS['40'].разВДень, true,
    '40: разВДень в реестре не ставится (каталог побеждает)');
  assert.notEqual(BE.EFFECTS['42'].разВДень, true,
    '42: разВДень в реестре не ставится (каталог побеждает)');
});

test('A43. каталог 40/42: эффект — ОБЪЕКТ (параметры, тексты, квест) + зеркало buildings.js', () => {
  const B = require('../src/buildings.js');
  const p40 = B.getBuilding(40).особые_параметры;
  const p42 = B.getBuilding(42).особые_параметры;
  // 40: эффект — объект (конвенция 000075), числа SPEC, навык runes.
  assert.equal(typeof p40.эффект, 'object',
    '40: эффект — объект (red: сейчас строка)');
  assert.equal(p40.эффект.шанс_база, 0.25, '40: шанс_база');
  assert.equal(p40.эффект.шанс_шаг, 0.05, '40: шанс_шаг');
  assert.equal(p40.эффект.опыт_база, 10, '40: опыт_база');
  assert.equal(p40.эффект.опыт_шаг, 2, '40: опыт_шаг');
  assert.equal(p40.эффект.навык, 'runes', '40: навык — «Рунопись»');
  assert.ok(Array.isArray(p40.эффект.тексты)
    && p40.эффект.тексты.length >= 3, '40: тексты ≥ 3');
  assert.ok(p40.эффект.тексты
    .every((s) => typeof s === 'string' && s.length > 0),
    '40: тексты — непустые строки');
  assert.equal(p40.раз_в_день, true, '40: раз_в_день — true');
  // Тексты зафиксированы (memory/000074-rune-stone-obelisk.md:
  // «стадия кода только транслитерирует в JSON»).
  assert.deepEqual(p40.эффект.тексты, [
    '…и семь печатей скрепят слово, что не должно было быть сказано…',
    '…камень помнит руку, что вырезала его в эпоху до карт…',
    '…число девять повторено трижды — это не совпадение, это приказ…',
    '…когда руны замолчат — ищите обелиск. Он молчит дольше…',
    '…флогистон не стихия. флогистон — имя того, кто зажёг первую…',
    '…тот, кто расшифрует эту запись, получит знание, от которого боги отвели глаза…',
  ], '40: тексты — зафиксированные (T40)');
  // 42: эффект — объект; квест — объект формы npc.квесты.
  assert.equal(typeof p42.эффект, 'object',
    '42: эффект — объект (red: сейчас строка)');
  assert.equal(p42.эффект.опыт_база, 5, '42: опыт_база');
  assert.equal(p42.эффект.опыт_шаг, 2, '42: опыт_шаг');
  assert.ok(Array.isArray(p42.эффект.тексты)
    && p42.эффект.тексты.length >= 3, '42: тексты ≥ 3');
  assert.ok(p42.эффект.тексты
    .every((s) => typeof s === 'string' && s.length > 0),
    '42: тексты — непустые строки');
  assert.equal(p42.раз_в_день, true, '42: раз_в_день — true');
  assert.deepEqual(p42.эффект.тексты, [
    '…старый мир держался на трёх обелисках; третий стоит там, где теперь море…',
    '…наследники Флогистона научились читать камни, но не научились их замолчать…',
    '…каждое прикосновение к обелиску — вопрос; мир отвечает опытом…',
    '…карты старейшего архива называют долину «Ртом». Почему — не помнит никто…',
    '…когда рунические камни замолчали, обелиски продолжили говорить — с теми, кто коснётся…',
    '…в основание обелиска вложено одно слово на старом наречии: «ждите»…',
  ], '42: тексты — зафиксированные (T42)');
  const q = p42.квест;
  assert.equal(typeof q, 'object',
    '42: квест — объект (red: отсутствует)');
  assert.equal(q.id, 'obelisk_touch', '42: квест.id');
  assert.equal(q.название, 'Камни помнят', '42: квест.название');
  assert.equal(q.описание,
    'Обелиск принял твоё прикосновение. Вернись к нему на другой день и коснись ещё раз — тогда память передастся целиком.',
    '42: квест.описание — зафиксировано');
  assert.deepEqual(q.цель, { тип: 'прикосновение', количество: 1 },
    '42: квест.цель');
  assert.deepEqual(q.награда, { опыт: 25, золото: 20, предметы: [] },
    '42: квест.награда');
  // Зеркало src/buildings.js — byte-в-byte с каталогом (000055;
  // регенерация npm run sync:buildings).
  const j40 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', '000040.json'), 'utf8'));
  const j42 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', '000042.json'), 'utf8'));
  assert.deepEqual(B.getBuilding(40), j40, 'зеркало 40: buildings.js ≡ JSON');
  assert.deepEqual(B.getBuilding(42), j42, 'зеркало 42: buildings.js ≡ JSON');
});

test('A44. камень: шанс min(1, 0.25 + 0.05·Рунопись) — таблица с капом 1.0', () => {
  const BE = loadBE();
  assert.equal(typeof BE.stoneChance, 'function',
    'stoneChance(эффект, R) (red: отсутствует)');
  const B = require('../src/buildings.js');
  const eff = B.getBuilding(40).особые_параметры.эффект;
  assert.equal(BE.stoneChance(eff, 0), 0.25, 'R=0 → 0.25');
  assert.equal(BE.stoneChance(eff, 5), 0.5, 'R=5 → 0.5');
  assert.equal(BE.stoneChance(eff, 20), 1, 'R=20 → сырое 1.25 → КАП 1.0');
});

test('A45. камень: XP round((10 + 2·Рунопись) · runePowerMult); xpMult НЕ применяется', () => {
  const BE = loadBE();
  assert.equal(typeof BE.stoneXp, 'function',
    'stoneXp(эффект, R, runePowerMult) (red: отсутствует)');
  const B = require('../src/buildings.js');
  const eff = B.getBuilding(40).особые_параметры.эффект;
  // Учёный 5 → xpMult 1.1 ≠ 1: ошибка «прогнал через addXp/xpMult»
  // дала бы 11/28/110 — тест падал бы.
  for (const [R, xp] of [[0, 10], [5, 25], [20, 100]]) {
    const hero = mkHero({ secondary: { runes: R, scholar: 5 } });
    assert.equal(BE.stoneXp(eff, R, P.derived(hero).runePowerMult), xp,
      'R=' + R + ': round(' + (10 + 2 * R) + '·'
        + (1 + 0.05 * R) + ')');
  }
});

test('A46. обелиск: XP round((5 + 2·уровень) · xpMult); «уровень мира» = hero.level', () => {
  const BE = loadBE();
  assert.equal(typeof BE.obeliskXp, 'function',
    'obeliskXp(эффект, L, xpMult) (red: отсутствует)');
  const B = require('../src/buildings.js');
  const eff = B.getBuilding(42).особые_параметры.эффект;
  // Фиксирует решение: отдельного «уровня мира» нет — уровень
  // персонажа (memory/000074-rune-obelisk.md; 000092 — та же
  // трактовка).
  for (const [L, scholar, xp] of [[3, 0, 11], [3, 5, 12], [3, 20, 15],
    [1, 0, 7], [1, 5, 8], [1, 20, 10]]) {
    const hero = mkHero({ level: L, secondary: { scholar } });
    assert.equal(BE.obeliskXp(eff, L, P.derived(hero).xpMult), xp,
      'L=' + L + ', scholar=' + scholar + ': round(' + (5 + 2 * L)
        + '·' + (1 + 0.02 * scholar) + ')');
  }
});

test('A47. ролл/тексты: детерминизм по (tile, day) — две сессии; разные (tile, day) — различаются', () => {
  const BE = loadBE();
  assert.equal(typeof BE.deterministicRoll, 'function',
    'deterministicRoll(x, y, day, seed, hash) (red: отсутствует)');
  assert.equal(typeof BE.pickFragment, 'function',
    'pickFragment(тексты, x, y, day, seed, hash) (red: отсутствует)');
  // Свои сид-константы (паттерн TELEPORT_TIE_SEED 000075) —
  // экспортированы для golden-пинов (B21/B22/B23).
  assert.equal(BE.STONE_ROLL_SEED, 0x53544e52, 'STONE_ROLL_SEED (STNR)');
  assert.equal(BE.STONE_TEXT_SEED, 0x53544e54, 'STONE_TEXT_SEED (STNT)');
  assert.equal(BE.OBELISK_TEXT_SEED, 0x4f424c54, 'OBELISK_TEXT_SEED (OBLT)');
  const PL = require('../src/perlin.js');
  const hash = PL.hash2;
  const texts = ['а', 'б', 'в', 'г', 'д', 'е'];
  const cases = [[5, 7, 1, BE.STONE_TEXT_SEED],
    [-25, 34, 2, BE.STONE_TEXT_SEED],
    [80, -51, 3, BE.OBELISK_TEXT_SEED]];
  for (const [x, y, day, seed] of cases) {
    // Формулы зафиксированы контрактом:
    // roll = hash(x, y, seed ^ day) / 2^32;
    // фрагмент = тексты[hash(x, y, seed ^ day) % len].
    const v = BE.deterministicRoll(x, y, day, seed, hash);
    assert.equal(v, hash(x, y, seed ^ day) / 4294967296,
      'формула ролла: hash(x, y, seed ^ day) / 2^32');
    assert.ok(v >= 0 && v < 1, 'ролл ∈ [0, 1)');
    assert.equal(BE.pickFragment(texts, x, y, day, seed, hash),
      texts[hash(x, y, seed ^ day) % texts.length],
      'формула фрагмента: тексты[hash % len]');
  }
  // Две независимые сессии (свежий require после очистки кэша) —
  // тот же фрагмент/ролл по тому же (tile, day).
  const f1 = (x, y, d, s) => BE.pickFragment(texts, x, y, d, s, hash);
  const r1 = (x, y, d, s) => BE.deterministicRoll(x, y, d, s, hash);
  delete require.cache[require.resolve('../src/building-effects.js')];
  const BE2 = loadBE();
  for (const [x, y, day, seed] of cases) {
    assert.equal(f1(x, y, day, seed),
      BE2.pickFragment(texts, x, y, day, seed, hash),
      'две сессии — тот же фрагмент');
    assert.equal(r1(x, y, day, seed),
      BE2.deterministicRoll(x, y, day, seed, hash),
      'две сессии — тот же ролл');
  }
  // Разные (tile, day) — не все фрагменты совпадают.
  const frags = new Set();
  for (let d = 1; d <= 6; d++) {
    frags.add(BE.pickFragment(texts, 5, 7, d, BE.STONE_TEXT_SEED, hash));
  }
  assert.ok(frags.size >= 2, 'разные (tile, day) — фрагменты различаются');
  // Мусорные входы: пустые/не-массив тексты → null (без исключения).
  assert.equal(BE.pickFragment([], 5, 7, 1, BE.STONE_TEXT_SEED, hash),
    null, 'пустые тексты → null');
  assert.equal(BE.pickFragment('мусор', 5, 7, 1, BE.STONE_TEXT_SEED, hash),
    null, 'не-массив тексты → null');
});

test('A48. «раз в день» для 40/42: buildingActions на реальных записях каталога', () => {
  const BE = loadBE();
  const B = require('../src/buildings.js');
  const c40 = B.getBuilding(40);
  const c42 = B.getBuilding(42);
  // День 1 + марки дня 1 — оба действия сгорели.
  const used = makeState({ day: 1, tile: { x: 5, y: 7 },
    save: { buildingOncePerDay: { '5,7:40': 1, '5,7:42': 1 } } });
  const row40 = BE.buildingActions(c40, null, used)[0];
  assert.ok(row40,
    'строка 40 в списке (red: нет записи «40» → список пуст)');
  assert.equal(row40.id, '40');
  assert.equal(row40.имя, 'Расшифровать');
  assert.equal(row40.доступен, false, 'день 1 + марка → недоступно');
  assert.equal(row40.reason, 'уже использовано сегодня');
  const row42 = BE.buildingActions(c42, null, used)[0];
  assert.ok(row42, 'строка 42 в списке');
  assert.equal(row42.id, '42');
  assert.equal(row42.имя, 'Прикоснуться');
  assert.equal(row42.доступен, false, 'день 1 + марка → недоступно');
  assert.equal(row42.reason, 'уже использовано сегодня');
  // День 2 — снова доступны (через 000072: марка < день).
  const next = Object.assign({}, used, { day: 2 });
  assert.equal(BE.buildingActions(c40, null, next)[0].доступен, true,
    '40: день 2 → доступно');
  assert.equal(BE.buildingActions(c42, null, next)[0].доступен, true,
    '42: день 2 → доступно');
});

test('A49. apply(«40»): успех — XP + фрагмент + message; провал — попытка сгорела (ok:true); чистота', () => {
  const BE = loadBE();
  assert.ok(BE.EFFECTS['40']
    && typeof BE.EFFECTS['40'].apply === 'function',
    'apply(«40») в реестре (red: отсутствует)');
  const PL = require('../src/perlin.js');
  const N = require('../src/npc.js');
  const B = require('../src/buildings.js');
  const c40 = B.getBuilding(40);
  const texts = c40.особые_параметры.эффект.тексты;
  // Реальные Game-функции: perlin.hash2, player.derived,
  // npc.skillLevel (версия npc.js — для 'runes' та же, что
  // secondary).
  const G = { hash2: PL.hash2, derived: P.derived,
    skillLevel: N.skillLevel };
  withGame(G, () => {
    // День-УСПЕХ (golden): (5,7), день 3 — ролл 0.040535 < 0.5
    // (runes 5 → chance 0.5).
    const hero = mkHero({ secondary: { runes: 5, scholar: 5 } });
    const state = makeState({ day: 3, tile: { x: 5, y: 7 }, hero,
      save: {}, catalog: c40 });
    const s0 = JSON.parse(JSON.stringify(state));
    const r = BE.EFFECTS['40'].apply(state);
    assert.equal(r.ok, true, 'успех — ok:true');
    assert.equal(r.success, true, 'успех — success:true');
    assert.equal(r.xp, 25, 'XP = round((10 + 2·5)·1.25) — A45');
    assert.ok(texts.includes(r.fragment), 'фрагмент — из каталога');
    assert.equal(r.fragment,
      '…камень помнит руку, что вырезала его в эпоху до карт…',
      'golden-фрагмент (5,7) день 3');
    assert.equal(r.message,
      'Расшифровка: успех (+25 оп.). «' + r.fragment + '»',
      'message зафиксирован контрактом');
    assert.deepEqual(state, s0, 'чистота: state не мутирован');
    // День-ПРОВАЛ (golden): (5,7), день 1 — ролл 0.994353 ≥ 0.5.
    const state2 = makeState({ day: 1, tile: { x: 5, y: 7 },
      hero: mkHero({ secondary: { runes: 5, scholar: 5 } }),
      save: {}, catalog: c40 });
    const s2 = JSON.parse(JSON.stringify(state2));
    const r2 = BE.EFFECTS['40'].apply(state2);
    assert.equal(r2.ok, true,
      'провал — ok:true (R3: попытка СГОРЕЛА → ok-ветка main.js '
      + 'ставит daily-марк + saveNow)');
    assert.equal(r2.success, false, 'успех — false');
    assert.equal(r2.xp, undefined, 'провал — без XP');
    assert.equal(r2.fragment, undefined, 'провал — без фрагмента');
    assert.equal(r2.message,
      'Расшифровка: руны молчат — попытка сгорела.',
      'message провала зафиксирован');
    assert.deepEqual(state2, s2, 'чистота при провале');
  });
  // Деградация (песочница без perlin/player) — «недоступно»
  // (паттерн A14; в игре функции всегда в цепочке).
  withGame({}, () => {
    const r = BE.EFFECTS['40'].apply(makeState({ catalog: c40 }));
    assert.equal(r.ok, false, 'нет Game-функций — ok:false');
    assert.equal(r.message, 'недоступно');
  });
});

test('A50. apply(«42»): XP по формуле + лор; quest/questComplete — по СНИМКУ buildingQuests', () => {
  const BE = loadBE();
  assert.ok(BE.EFFECTS['42']
    && typeof BE.EFFECTS['42'].apply === 'function',
    'apply(«42») в реестре (red: отсутствует)');
  const PL = require('../src/perlin.js');
  const B = require('../src/buildings.js');
  const c42 = B.getBuilding(42);
  const texts = c42.особые_параметры.эффект.тексты;
  const G = { hash2: PL.hash2, derived: P.derived };
  withGame(G, () => {
    // Пустой снимок — ВЫДАЧА квеста (первое прикосновение).
    const state = makeState({ day: 1, tile: { x: 5, y: 7 },
      hero: mkHero({ level: 3, secondary: { scholar: 5 } }),
      save: {}, catalog: c42 });
    const s0 = JSON.parse(JSON.stringify(state));
    const r = BE.EFFECTS['42'].apply(state);
    assert.equal(r.ok, true);
    assert.equal(r.xp, 12, 'XP = round((5 + 2·3)·1.1) — A46');
    assert.ok(texts.includes(r.fragment), 'фрагмент — из каталога');
    assert.equal(r.fragment,
      '…наследники Флогистона научились читать камни, но не научились их замолчать…',
      'golden-фрагмент (5,7) день 1');
    assert.equal(r.message,
      'Обелиск: +12 оп. «' + r.fragment + '»',
      'message зафиксирован контрактом');
    assert.ok(r.quest, 'пустой снимок — выдача квеста');
    assert.equal(r.quest.questId, 'obelisk_touch_5_7',
      'per-tile questId = квест.id + _x_y');
    assert.equal(r.quest.day, 1, 'quest.day — из state');
    assert.equal(r.questComplete, undefined, 'выдача — без questComplete');
    assert.deepEqual(state, s0, 'чистота: state не мутирован');
    // Активный снимок — ВЫПОЛНЕНИЕ (пёрсистированный questId).
    const st2 = makeState({ day: 2, tile: { x: 5, y: 7 },
      hero: mkHero({ level: 3, secondary: { scholar: 5 } }),
      save: { buildingQuests: {
        '5,7': { questId: 'obelisk_touch_5_7', day: 1,
          status: 'active' }, } },
      catalog: c42 });
    const s2 = JSON.parse(JSON.stringify(st2));
    const r2 = BE.EFFECTS['42'].apply(st2);
    assert.equal(r2.ok, true);
    assert.equal(r2.xp, 12, 'XP — при каждом прикосновении');
    assert.equal(r2.questComplete, 'obelisk_touch_5_7',
      'active → questComplete (пёрсистированный questId)');
    assert.equal(r2.quest, undefined, 'повторной выдачи нет');
    assert.deepEqual(st2, s2, 'чистота при выполнении');
    // Done — ни выдачи, ни выполнения (повторно не выдаётся).
    const st3 = makeState({ day: 3, tile: { x: 5, y: 7 },
      hero: mkHero({ level: 3, secondary: { scholar: 5 } }),
      save: { buildingQuests: {
        '5,7': { questId: 'obelisk_touch_5_7', day: 1,
          status: 'done' }, } },
      catalog: c42 });
    const r3 = BE.EFFECTS['42'].apply(st3);
    assert.equal(r3.ok, true);
    assert.equal(r3.xp, 12);
    assert.equal(r3.quest, undefined, 'done — повторной выдачи нет');
    assert.equal(r3.questComplete, undefined, 'done — без выполнения');
    // Мусорная запись — как done (fail-open: не даёт двойной
    // награды).
    const st4 = makeState({ day: 4, tile: { x: 5, y: 7 },
      hero: mkHero({ level: 3, secondary: { scholar: 5 } }),
      save: { buildingQuests: { '5,7': { questId: 'x' } } },
      catalog: c42 });
    const r4 = BE.EFFECTS['42'].apply(st4);
    assert.equal(r4.ok, true);
    assert.equal(r4.quest, undefined, 'мусор — выдачи нет');
    assert.equal(r4.questComplete, undefined, 'мусор — без выполнения');
  });
  // Деградация (паттерн A14).
  withGame({}, () => {
    const r = BE.EFFECTS['42'].apply(makeState({ catalog: c42 }));
    assert.equal(r.ok, false, 'нет Game-функций — ok:false');
    assert.equal(r.message, 'недоступно');
  });
});

test('A51. квест постройки: source «building», лимит 5 NPC + 1 building, выполнение, без ре-выдачи', () => {
  const N = require('../src/npc.js');
  const B = require('../src/buildings.js');
  const I = require('../src/items.js');
  // npc.js: API квеста постройки (новый source «building»,
  // аддитивно; ЛОГИКА NPC-квестов — без изменений).
  assert.equal(typeof N.acceptBuildingQuest, 'function',
    'acceptBuildingQuest (red: отсутствует)');
  assert.equal(typeof N.completeBuildingQuest, 'function',
    'completeBuildingQuest (red: отсутствует)');
  // Определение — из КАТАЛОГА обелиска (не из npc.квесты).
  const def = B.getBuilding(42).особые_параметры.квест;
  assert.ok(def && typeof def === 'object',
    'каталог 42: квест — объект');
  const QID = 'obelisk_touch_5_7';
  const capNpc = {
    id: 'm',
    имя: 'Хранителька',
    постройки: [44],
    квесты: [1, 2, 3, 4, 5, 6].map((i) => ({
      id: 'c' + i,
      название: 'Задание ' + i,
      описание: 'Простое задание.',
      цель: { тип: 'kill_group', группа: 0, количество: 1 },
      награда: { опыт: 5, золото: 5 },
      предыдущий: null,
    })),
  };
  // Форма инстанса (NPC-квеста): {source:'building', tile, questId,
  // status, progress, day} — БЕЗ npcId (квест не NPC-инициирован).
  const book = N.createQuestBook();
  const acc = N.acceptBuildingQuest(book, QID, '5,7', 3);
  assert.equal(acc.ok, true, 'выдача — ok');
  assert.deepEqual(book.active[QID],
    { source: 'building', tile: '5,7', questId: QID,
      status: 'active', progress: 0, day: 3 },
    'форма инстанса зафиксирована (без npcId)');
  // Повторная выдача, пока active — отказ.
  assert.equal(N.acceptBuildingQuest(book, QID, '5,7', 4).ok, false,
    'повторная выдача, пока active — отказ');
  // serializeQuestBook: building-инстанс НЕ в секцию quests
  // (R2: deserializeQuestBook строгий); NPC-формы —
  // байт-идентичны.
  N.acceptQuest(book, [capNpc], capNpc, 'c1');
  const s = N.serializeQuestBook(book);
  assert.deepEqual(Object.keys(s.active), ['c1'],
    'секция quests — только NPC-инстансы');
  assert.deepEqual(s.active.c1,
    { npcId: 'm', questId: 'c1', status: 'active', progress: 0 },
    'NPC-форма — без изменений');
  assert.deepEqual(s.done, [], 'done — без изменений');
  // Лимит: building-квест НЕ считается в MAX_ACTIVE_QUESTS.
  const book2 = N.createQuestBook();
  for (let i = 1; i <= 4; i++) {
    assert.equal(N.acceptQuest(book2, [capNpc], capNpc, 'c' + i).ok,
      true, 'NPC ' + i + ' — ok');
  }
  assert.equal(N.acceptBuildingQuest(book2, 'obelisk_touch_1_2', '1,2', 1).ok,
    true, '4 NPC + 1 building — ok');
  assert.equal(N.acceptQuest(book2, [capNpc], capNpc, 'c5').ok, true,
    '5 NPC + 1 building СОСУЩЕСТВУЮТ (зафиксировано)');
  assert.equal(N.acceptQuest(book2, [capNpc], capNpc, 'c6').reason,
    'слишком много активных квестов (5)',
    '6-й NPC — лимит (NPC-логика без изменений)');
  // acceptBuildingQuest — БЕЗ лимит-проверки.
  const book3 = N.createQuestBook();
  for (let i = 1; i <= 5; i++) {
    assert.equal(N.acceptQuest(book3, [capNpc], capNpc, 'c' + i).ok,
      true, 'NPC ' + i + ' — ok');
  }
  assert.equal(N.acceptBuildingQuest(book3, 'obelisk_touch_2_3', '2,3', 2).ok,
    true, '5 NPC + building — ok (лимит-проверки нет)');
  // Выполнение: награда — золото + XP ШТАТНЫМ addXp (с Учёным).
  const hero = mkHero({ secondary: { scholar: 5 } }); // gold 100, xp 0
  const res = N.completeBuildingQuest(book, def, hero, QID);
  assert.equal(res.ok, true, 'выполнение — ok');
  assert.equal(book.active[QID], undefined, 'active — удалён');
  assert.equal(book.done[book.done.length - 1], QID,
    'done — questId (per-tile)');
  assert.equal(hero.gold, 120, 'золото +20 (каталожная награда)');
  assert.equal(hero.xp, 28,
    'XP — штатный addXp: round(25·1.1) = 28 (Учёный 5)');
  assert.equal(hero.totalXp, 28, 'totalXp — вестись');
  assert.deepEqual(res.reward, { xp: 25, gold: 20, items: [] },
    'reward — каталожный');
  // Повторное выполнение — отказ.
  assert.equal(N.completeBuildingQuest(book, def, hero, QID).reason,
    'квест не в работе', 'повторное выполнение — отказ');
  // Ре-выдача после done — отказ (повторно не выдаётся).
  assert.equal(N.acceptBuildingQuest(book, QID, '5,7', 5).ok, false,
    'done — повторной выдачи нет');
  // Атомарность предметов: инвентарь полон → НЕ выполняется,
  // квест остаётся active (повтор — следующее прикосновение;
  // паттерн turnInQuest, для обелиска — no-op).
  // Технически: у персонажа с back-50 лимит веса позволяет
  // заполнить все 20 слотов уникальными предметами (иначе весовая
  // проверка checkAdd остановит заполнение раньше слотовой).
  const heroFull = mkHero({ secondary: { back: 50 } });
  for (const it of I.allItems()) {
    if (I.slotCount(heroFull) >= I.INVENTORY_SLOTS) break;
    const rAdd = I.addItem(heroFull, it.id, 1);
    assert.ok(rAdd.ok, 'заполнение инвентаря: ' + it.id);
  }
  assert.equal(I.slotCount(heroFull), I.INVENTORY_SLOTS,
    'инвентарь полон');
  const book4 = N.createQuestBook();
  const QID4 = 'obelisk_touch_9_9';
  assert.equal(N.acceptBuildingQuest(book4, QID4, '9,9', 1).ok, true);
  const defItems = Object.assign({}, def, {
    награда: { опыт: 10, золото: 5,
      предметы: [{ предмет: 'moonstone', количество: 1 }] } });
  const rFull = N.completeBuildingQuest(book4, defItems, heroFull, QID4);
  assert.equal(rFull.ok, false, 'инвентарь полон — не выполняется');
  assert.equal(rFull.reason, 'инвентарь полон');
  assert.ok(book4.active[QID4], 'квест остаётся active (повтор)');
  assert.equal(heroFull.gold, 100, 'золото не тронуто');
  assert.equal(heroFull.totalXp, 0, 'XP не тронуто');
  // Журнал: activeQuests — building-инстанс → quest null (без
  // краха; ui.js-фолбэк — голый id).
  const aj = N.activeQuests([capNpc], book2);
  const bRec = aj.find((r) => r.instance.source === 'building');
  assert.ok(bRec, 'building-инстанс в списке журнала');
  assert.equal(bRec.quest, null, 'questDef без npcId — null');
});

test('A52. сейв buildingQuests: serialize/restore (fail-open) + rehydrateBuildingQuests', () => {
  const BE = loadBE();
  const N = require('../src/npc.js');
  assert.equal(typeof BE.serializeBuildingQuests, 'function',
    'serializeBuildingQuests (red: отсутствует)');
  assert.equal(typeof BE.restoreBuildingQuests, 'function',
    'restoreBuildingQuests (red: отсутствует)');
  assert.equal(typeof N.rehydrateBuildingQuests, 'function',
    'rehydrateBuildingQuests (red: отсутствует)');
  // Roundtrip: Map → объект → Map.
  const m = new Map([
    ['5,7', { questId: 'obelisk_touch_5_7', day: 3, status: 'active' }],
    ['-25,34', { questId: 'obelisk_touch_-25_34', day: 1,
      status: 'done' }],
  ]);
  const s = BE.serializeBuildingQuests(m);
  assert.deepEqual(s, {
    '5,7': { questId: 'obelisk_touch_5_7', day: 3, status: 'active' },
    '-25,34': { questId: 'obelisk_touch_-25_34', day: 1,
      status: 'done' },
  }, 'сериализация — plain-объект зафиксированной формы');
  assert.deepEqual(BE.serializeBuildingQuests(new Map()), {},
    'пустой Map — {}');
  const back = BE.restoreBuildingQuests(s);
  assert.ok(back instanceof Map, 'restore — Map');
  assert.equal(back.size, 2, 'roundtrip: обе записи');
  assert.deepEqual(back.get('5,7'),
    { questId: 'obelisk_touch_5_7', day: 3, status: 'active' });
  assert.deepEqual(back.get('-25,34'),
    { questId: 'obelisk_touch_-25_34', day: 1, status: 'done' });
  // Мусорный раздел (не-объект/массив) — пустой Map БЕЗ исключения
  // (fail-open 000029; warn делает main.js).
  for (const junk of ['мусор', [], null, undefined, 42]) {
    assert.equal(BE.restoreBuildingQuests(junk).size, 0,
      'мусорный раздел — пустой Map');
  }
  // Мусорная ЗАПИСЬ — отброс записи, валидные выживают.
  const mixed = BE.restoreBuildingQuests({
    '5,7': { questId: 'q', day: 1, status: 'active' },
    'junk-key': { questId: 'q', day: 1, status: 'active' },
    '1,2': { questId: 5, day: 1, status: 'active' },
    '3,4': { questId: 'q', day: 0, status: 'active' },
    '6,7': { questId: 'q', day: 1, status: 'nope' },
    '8,9': { questId: 'q', day: 1 },
    '10,11': 'мусор',
  });
  assert.equal(mixed.size, 1, 'выживает только валидная запись');
  assert.deepEqual(mixed.get('5,7'), { questId: 'q', day: 1,
    status: 'active' });
  // rehydrate: active → журнал; done — НЕ зеркалируется;
  // идемпотентно (существующий ключ не затирается).
  const book = N.createQuestBook();
  const m2 = new Map([
    ['5,7', { questId: 'q1', day: 1, status: 'active' }],
    ['1,2', { questId: 'q2', day: 1, status: 'done' }],
  ]);
  N.rehydrateBuildingQuests(book, m2);
  assert.deepEqual(book.active.q1,
    { source: 'building', tile: '5,7', questId: 'q1',
      status: 'active', progress: 0, day: 1 },
    'active — воссоздан в журнале');
  assert.equal(book.active.q2, undefined, 'done — не зеркалируется');
  // Идемпотентно: существующий ключ не затирается.
  book.active.q1.day = 99;
  N.rehydrateBuildingQuests(book, m2);
  assert.equal(book.active.q1.day, 99, 'существующий ключ — не затёрт');
  N.rehydrateBuildingQuests(book, new Map([
    ['5,7', { questId: 'q1', day: 5, status: 'active' }]]));
  assert.equal(book.active.q1.day, 99,
    'повторный вызов с новым Map — тоже не затирает');
  // Мусорный ввод — без исключений.
  N.rehydrateBuildingQuests(book, null);
  N.rehydrateBuildingQuests(book, 'мусор');
  N.rehydrateBuildingQuests(book, new Map([
    ['5,7', { questId: 'q1', day: 1 }]])); // битая запись — отброс
  assert.equal(book.active.q1.day, 99, 'мусор — без изменений');
});

test('A53. невалидный hero (null/не-объект) — 40/42 деградируют «недоступно» БЕЗ исключения (ревью: асимметрия applyRuneStone/applyObelisk)', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const N = require('../src/npc.js');
  const B = require('../src/buildings.js');
  const c40 = B.getBuilding(40);
  const c42 = B.getBuilding(42);
  const G40 = { hash2: PL.hash2, derived: P.derived,
    skillLevel: N.skillLevel };
  const G42 = { hash2: PL.hash2, derived: P.derived };
  const badHeroes = [null, undefined, 'hero', 42, [1, 2]];
  withGame(G40, () => {
    for (const bad of badHeroes) {
      const r = BE.EFFECTS['40'].apply(
        makeState({ catalog: c40, hero: bad }));
      assert.equal(r.ok, false,
        '40: hero=' + String(bad) + ' — ok:false (не TypeError)');
      assert.equal(r.message, 'недоступно', '40: деградация');
    }
  });
  withGame(G42, () => {
    for (const bad of badHeroes) {
      const r = BE.EFFECTS['42'].apply(
        makeState({ catalog: c42, hero: bad }));
      assert.equal(r.ok, false,
        '42: hero=' + String(bad) + ' — ok:false (не TypeError)');
      assert.equal(r.message, 'недоступно', '42: деградация (симметрия)');
    }
  });
});

test('A54. квест обелиска без «название» — определение невалидно: без r.quest/r.questComplete, XP/фрагмент — как прежде (ревью)', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const B = require('../src/buildings.js');
  const c42real = B.getBuilding(42);
  const mkCat = (name) => {
    const quest = Object.assign({}, c42real.особые_параметры.квест);
    if (name === undefined) delete quest.название;
    else quest.название = name;
    return {
      id: 42,
      особые_параметры: {
        раз_в_день: true,
        эффект: c42real.особые_параметры.эффект,
        квест: quest,
      },
    };
  };
  const G = { hash2: PL.hash2, derived: P.derived };
  const hero = mkHero({ level: 3, secondary: { scholar: 5 } });
  withGame(G, () => {
    // Пустой снимок, «название» отсутствует — выдачи НЕТ.
    const r1 = BE.EFFECTS['42'].apply(makeState({
      day: 1, tile: { x: 5, y: 7 }, hero,
      save: {}, catalog: mkCat(undefined) }));
    assert.equal(r1.ok, true, 'XP/фрагмент — не бьёт');
    assert.equal(r1.xp, 12, 'XP — по формуле (A46)');
    assert.ok(r1.fragment, 'фрагмент — есть');
    assert.equal(r1.quest, undefined, 'без названия — выдачи нет');
    assert.equal(r1.questComplete, undefined);
    // Пустая строка — тоже невалидно.
    const r1b = BE.EFFECTS['42'].apply(makeState({
      day: 1, tile: { x: 5, y: 7 }, hero,
      save: {}, catalog: mkCat('') }));
    assert.equal(r1b.ok, true);
    assert.equal(r1b.quest, undefined, 'пустое название — выдачи нет');
    // Активный снимок, «название» отсутствует — выполнения НЕТ
    // (квест остаётся active в сейве; повторной выдачи тоже нет).
    const r2 = BE.EFFECTS['42'].apply(makeState({
      day: 2, tile: { x: 5, y: 7 }, hero,
      save: { buildingQuests: {
        '5,7': { questId: 'obelisk_touch_5_7', day: 1,
          status: 'active' }, } },
      catalog: mkCat(undefined) }));
    assert.equal(r2.ok, true);
    assert.equal(r2.xp, 12, 'XP — как при каждом прикосновении');
    assert.equal(r2.questComplete, undefined,
      'без названия — без выполнения');
    // Контроль: ВАЛИДНЫЙ квест (реальный каталог) — выдача есть.
    const r3 = BE.EFFECTS['42'].apply(makeState({
      day: 1, tile: { x: 5, y: 7 }, hero,
      save: {}, catalog: c42real }));
    assert.ok(r3.quest, 'валидный квест — выдача (A50)');
  });
});

// --- Задача 000093: смотровая башня — «Взглянуть» (explored) ---
//
// Чистые контракты (контракт — memory/000093-explored-tower.md,
// данные раздела — memory/000093-explored.md):
//   * markExplored(explored, towerKey, tiles, R) → НОВЫЙ plain
//     object (иммутабельно): 'x,y' башни → каноническая строка
//     'x,y;x,y;…' (row-major: y по возрастанию, затем x, ЧИСЛЕННАЯ
//     сортировка); граница Чебышёва R ВКЛЮЧИТЕЛЬНО; защитный R-
//     фильтр (тайлы вне окна — SKIP); чужие башни — как есть;
//     мусорный вход (не-object) — {} (fail-open, НЕ бросает);
//     towerKey/R — программные ошибки → THROW (тест-пин).
//   * exploredCount(object) — СУММА валидных сегментов ПО БАШНЯМ
//     (пересечения СЧИТАЮТСЯ ДВАЖДЫ — union НЕ здесь, отсрочка
//     миникарты).
//   * serializeExplored(Map) / restoreExplored(object) — ser/de
//     раздела сейва explored (паттерн 000072/teleports): restore —
//     ТИХИЙ fail-open (ни throw, ни console — warn в main.js);
//     roundtrip byte-identical (каноника на обеих сторонах).
//   * EFFECTS['46'] — «Взглянуть»: apply ЧИСТО (снимок), Р — ТОЛЬКО
//     из каталога (особые_параметры.эффект.радиус, 000053); фолбэк
//     20 — только когда объект эффект есть, но радиус не integer
//     ≥ 0. Лимита раз-в-день НЕТ нигде (взгляд бесплатен и
//     идемпотентен, ТЗ). message «Взгляд: исследовано N тайлов.»
//     (N — сумма по всем башням ПОСЛЕ пометки; текст зафиксирован).
//   * Каталог 46: особый_параметр эффект = { радиус: 20 }; зеркала
//     buildings.js ≡ JSON (000055, npm run sync:buildings).

// Окно Чебышёва R вокруг (tx, ty) — массив {x, y} (row-major).
function chebWindow(tx, ty, R) {
  const out = [];
  for (let dy = -R; dy <= R; dy++) {
    for (let dx = -R; dx <= R; dx++) out.push({ x: tx + dx, y: ty + dy });
  }
  return out;
}

test('A55. markExplored: окно 41×41 (R=20, граница включительно), защитный R-фильтр, иммутабельно', () => {
  const BE = loadBE();
  assert.equal(typeof BE.markExplored, 'function',
    'markExplored (red: отсутствует)');
  const R = 20;
  const T = { x: 36, y: -21 };
  const windowTiles = chebWindow(T.x, T.y, R);
  assert.equal(windowTiles.length, 1681, 'окно 41×41 — 1681 тайлов');
  const res = BE.markExplored(null, '36,-21', windowTiles, R);
  assert.ok(res && typeof res === 'object' && !Array.isArray(res),
    'результат — plain object (формат снимка)');
  const segs = String(res['36,-21']).split(';');
  assert.equal(segs.length, 1681, 'ВСЕ тайлы окна помечены');
  const set = new Set(segs);
  assert.equal(set.size, 1681, 'дубликатов нет');
  // Граница R=20 ВКЛЮЧИТЕЛЬНО: 4 угла + середины рёбер.
  for (const c of ['16,-41', '56,-41', '16,-1', '56,-1',
    '36,-41', '36,-1', '16,-21', '56,-21']) {
    assert.ok(set.has(c), 'граница (' + c + '): R=20 включительно');
  }
  // Снаружи (|dx| или |dy| = 21) — НЕ помечено.
  for (const c of ['15,-21', '57,-21', '36,-42', '36,0', '15,-41', '57,0']) {
    assert.ok(!set.has(c), 'вне окна (' + c + '): не помечено');
  }
  // Иммутабельно: входной explored НЕ мутируется, НОВЫЙ объект;
  // старые валидные сегменты башни — сохраняются (объединение).
  const input = { '9,9': '1,1;2,2' };
  const r2 = BE.markExplored(input, '9,9', [{ x: 1, y: 1 }], 5);
  assert.notEqual(r2, input, 'возврат НОВОГО объекта');
  assert.equal(input['9,9'], '1,1;2,2', 'вход не мутирован');
  assert.equal(r2['9,9'], '1,1;2,2', 'старые валидные сегменты — union');
  // ЗАЩИТНЫЙ фильтр: 2000 «лишних» тайлов далеко от башни → только
  // окно Чебышёва ≤ R (кап ≤1681 даже при «мусорном» входе).
  const junk = [];
  for (let i = 0; i < 2000; i++) {
    junk.push({ x: i % 100, y: 300 + Math.floor(i / 100) });
  }
  const r3 = BE.markExplored(null, '36,-21', junk.concat(windowTiles), R);
  assert.equal(String(r3['36,-21']).split(';').length, 1681,
    'защитный R-фильтр: вне Чебышёва ≤20 от башни — SKIP');
});

test('A56. apply(«46»): непроходимые тайлы помечаются — проходимость НЕ читается (данные разведки)', () => {
  const BE = loadBE();
  assert.ok(BE.EFFECTS['46']
    && typeof BE.EFFECTS['46'].apply === 'function',
    'запись «46» в реестре (red: отсутствует)');
  const B = require('../src/buildings.js');
  const c46 = B.getBuilding(46);
  // Синтетическая карта: ВСЕ тайлы окна — вода/горы (passable:false).
  // Если код «помощник» отфильтрует по проходимости — окно будет
  // пустым и тест упадёт (ТЗ: НЕЗАВИСИМО ОТ ПРОХОДИМОСТИ).
  let calls = 0;
  const map = {
    tileAt: (x, y) => {
      calls++;
      return { x, y, terrain: ((x + y) % 2) ? 2 : 1, passable: false };
    },
  };
  const state = makeState({
    day: 1, tile: { x: 36, y: -21 }, save: {}, catalog: c46, map,
  });
  const r = BE.EFFECTS['46'].apply(state);
  assert.equal(r.ok, true, 'взгляд — ok (red: без эффекта «недоступно»)');
  assert.ok(r.explored && typeof r.explored === 'object'
    && !Array.isArray(r.explored),
    'r.explored — НОВОЕ значение раздела (plain object, не дельта)');
  const segs = String(r.explored['36,-21']).split(';');
  assert.equal(segs.length, 1681,
    'непроходимые (вода/горы) помечаются РАВНО проходимым');
  assert.equal(new Set(segs).size, 1681, 'дубликатов нет');
  assert.ok(calls >= 1681, 'окно собрано через tileAt (1681 вызовов)');
  // message зафиксирован контрактом: N — сумма по всем башням ПОСЛЕ
  // пометки (пустой снимок → одна башня, 1681).
  assert.equal(r.message, 'Взгляд: исследовано 1681 тайлов.',
    'message: стиль «Префикс: результат.» (A-пин)');
  // Чистота: снимок state не мутирован.
  assert.deepEqual(state.save, {}, 'save-снимок не мутирован');
  assert.deepEqual(state.tile, { x: 36, y: -21 }, 'tile не мутирован');
});

test('A57. markExplored: идемпотентность — повторный «взгляд» — тот же explored (deepEqual), без дубликатов', () => {
  const BE = loadBE();
  const R = 20;
  const T = { x: 36, y: -21 };
  const windowTiles = chebWindow(T.x, T.y, R);
  const first = BE.markExplored(null, '36,-21', windowTiles, R);
  const second = BE.markExplored(first, '36,-21', windowTiles, R);
  assert.deepEqual(second, first, 'повтор — тот же explored (deepEqual)');
  assert.notEqual(second, first, 'но НОВЫЙ объект (иммутабельно)');
  // Вторая башня с ПЕРЕСЕКАЮЩИМСЯ окном: union, без дубликатов,
  // первая башня не изменяется.
  const T2 = { x: 50, y: -5 }; // пересечение с окном (36,-21) ≠ ∅
  const both = BE.markExplored(first, '50,-5',
    chebWindow(T2.x, T2.y, R), R);
  assert.deepEqual(both['36,-21'], first['36,-21'],
    'первая башня — как была');
  assert.equal(String(both['50,-5']).split(';').length, 1681,
    'вторая башня — полное окно');
  // Повтор на мультибашенном объекте — deepEqual (Set: дублей нет).
  const again = BE.markExplored(both, '36,-21', windowTiles, R);
  assert.deepEqual(again, both, 'повторный взгляд — deepEqual');
});

test('A58. serializeExplored/restoreExplored: roundtrip deepEqual, канонический row-major (численный), мусор — только валидные', () => {
  const BE = loadBE();
  assert.equal(typeof BE.serializeExplored, 'function',
    'serializeExplored (red: отсутствует)');
  assert.equal(typeof BE.restoreExplored, 'function',
    'restoreExplored (red: отсутствует)');
  // Две башни; у первой — ПЕРЕМЕШАННЫЙ (неканонический) порядок +
  // «лишние» тайлы.
  const m = new Map();
  m.set('36,-21', new Set(['56,-1', '36,-21', '9,-100', '16,-41', '10,-2']));
  m.set('-5,7', new Set(['-5,7', '-6,6', '-4,8']));
  const s = BE.serializeExplored(m);
  assert.ok(s && typeof s === 'object' && !Array.isArray(s),
    'снимок — plain object');
  assert.deepEqual(Object.keys(s).sort(), ['-5,7', '36,-21'],
    'ключи — башни');
  // Каноника row-major: y по возрастанию, затем x.
  assert.equal(s['-5,7'], '-6,6;-5,7;-4,8',
    'row-major: сначала y (6 < 7 < 8), затем x');
  // Roundtrip: restore(serialize(m)) deepEqual m (контракт §2.2).
  const back = BE.restoreExplored(s);
  assert.ok(back instanceof Map, 'restore — Map');
  assert.deepEqual(back, m, 'roundtrip deepEqual');
  // Перемешанный вход — ТА ЖЕ каноническая строка (byte-identical).
  const m2 = new Map();
  m2.set('36,-21', new Set(['16,-41', '36,-21', '9,-100', '56,-1', '10,-2']));
  assert.equal(BE.serializeExplored(m2)['36,-21'], s['36,-21'],
    'порядок во входе НЕ влияет на канонику');
  // ЧИСЛЕННАЯ (не строковая!) сортировка: y 9 < 10 (строковая даст
  // «0,10» < «0,9» — баг, ловим пином).
  const m3 = new Map([['0,0', new Set(['0,10', '0,9', '0,0', '0,-10'])]]);
  assert.equal(BE.serializeExplored(m3)['0,0'], '0,-10;0,0;0,9;0,10',
    'числовая сортировка row-major');
  // Пустая башня (size 0) — НЕ пишется; пустой Map/null → {}.
  const s4 = BE.serializeExplored(new Map([
    ['1,1', new Set()], ['2,2', new Set(['2,2'])],
  ]));
  assert.deepEqual(s4, { '2,2': '2,2' }, 'пустая башня — не пишется');
  assert.deepEqual(BE.serializeExplored(new Map()), {}, 'пустой Map — {}');
  assert.deepEqual(BE.serializeExplored(null), {}, 'null — {}');
  assert.deepEqual(BE.serializeExplored(undefined), {}, 'undefined — {}');
});

test('A59. restoreExplored: битый раздел — ТИХИЙ fail-open (ни throw, ни console), валидные выживают', () => {
  const BE = loadBE();
  const consoleCalls = [];
  const origWarn = console.warn;
  const origErr = console.error;
  console.warn = (x) => consoleCalls.push('warn: ' + String(x));
  console.error = (x) => consoleCalls.push('error: ' + String(x));
  try {
    // Мусорный РАЗДЕЛ (не-объект/массив/null): ни throw, ни console,
    // пустой Map (warn живёт в main.js restoreFromSave — паттерн
    // 000072/A52: restoreTeleports/restoreBuildingQuests — тихие).
    for (const junk of ['junk', 42, [1, 2], null, undefined, NaN, {}]) {
      const mm = BE.restoreExplored(junk);
      assert.ok(mm instanceof Map,
        'мусорный раздел ' + String(junk) + ' — Map возвращается');
      assert.equal(mm.size, 0, 'мусорный раздел — пустой Map');
    }
    // Мусорная ЗАПИСЬ: некорректный ключ/значение — отброс;
    // некорректные сегменты — отброс; дубли — дедупликация.
    const mixed = BE.restoreExplored({
      '36,-21': '36,-21;16,-41;junk;56,-1', // сегмент «junk» — SKIP
      'not-a-key': '1,1',                    // ключ не 'x,y' — SKIP
      '9,9': 42,                             // значение не строка — SKIP
      '5,5': '5,5;5,5;6,6',                  // валидная (дубль — дедуп)
    });
    assert.equal(mixed.size, 2, 'валидных записей — ровно 2');
    assert.ok(mixed.has('36,-21') && mixed.has('5,5'),
      'валидные ключи на месте');
    assert.ok(!mixed.has('not-a-key'), 'ключ не «x,y» — отброшен');
    assert.ok(!mixed.has('9,9'), 'значение не строка — отброшено');
    assert.equal(mixed.get('36,-21').size, 3,
      'некорректный сегмент «junk» — отброшен');
    assert.ok(mixed.get('36,-21').has('36,-21')
      && mixed.get('36,-21').has('16,-41')
      && mixed.get('36,-21').has('56,-1'),
      'валидные сегменты сохранены');
    assert.equal(mixed.get('5,5').size, 2, 'дубли — дедупликация');
    assert.equal(consoleCalls.length, 0,
      'restoreExplored — ТИХИЙ (ни console.warn, ни console.error): '
      + consoleCalls.join(' | '));
  } finally {
    console.warn = origWarn;
    console.error = origErr;
  }
});

test('A60. markExplored: ограничение роста — на башню ≤ 1681 ключей (41×41, закладка ТЗ)', () => {
  const BE = loadBE();
  const R = 20;
  const T = { x: 36, y: -21 };
  // Большой tiles-массив: 5000 тайлов ДАЛЕКО от башни + полное окно.
  const tiles = [];
  for (let i = 0; i < 5000; i++) {
    tiles.push({ x: -200 + (i % 100), y: -200 + Math.floor(i / 100) });
  }
  tiles.push(...chebWindow(T.x, T.y, R));
  const res = BE.markExplored(null, '36,-21', tiles, R);
  const segs = String(res['36,-21']).split(';');
  assert.ok(segs.length <= 1681,
    'на башню ≤ 1681 ключей (ловушка разрастания localStorage)');
  assert.equal(segs.length, 1681, 'полное окно — ровно 41×41');
  assert.equal(new Set(segs).size, 1681, 'без дубликатов');
  // Повторный вызов с другим «мусорным» массивом — кап держится.
  const res2 = BE.markExplored(res, '36,-21', tiles.slice(0, 2500), R);
  assert.ok(String(res2['36,-21']).split(';').length <= 1681,
    'кап сохраняется при повторе');
});

test('A61. exploredCount: null → 0; сумма валидных сегментов ПО БАШНЯМ (пересечение — дважды, НЕ union)', () => {
  const BE = loadBE();
  assert.equal(typeof BE.exploredCount, 'function',
    'exploredCount (red: отсутствует)');
  assert.equal(BE.exploredCount(null), 0, 'null → 0');
  assert.equal(BE.exploredCount(undefined), 0, 'undefined → 0');
  assert.equal(BE.exploredCount('junk'), 0, 'не-object → 0');
  assert.equal(BE.exploredCount(42), 0, 'не-object → 0');
  assert.equal(BE.exploredCount({}), 0, 'пусто → 0');
  // Сумма по башням: невалидные сегменты НЕ считаются; пересечение
  // окон двух башен СЧИТАЕТСЯ ДВАЖДЫ (union — задача миникарты,
  // отсрочено; формат раздела union-совместим).
  const e = {
    '36,-21': '36,-21;16,-41;junk;56,-1;16,-41', // 3 валидных (дубль)
    '50,-5': '50,-5;36,-21',                      // 2 (пересечение '36,-21')
  };
  assert.equal(BE.exploredCount(e), 5,
    'сумма по башням: 3 + 2 (union дал бы 4 — НЕ union)');
});

test('A62. каталог 46: эффект.радиус = 20 (раз_в_день НЕТ) + зеркало ≡ JSON; реестр «Взглянуть» без лимита', () => {
  const BE = loadBE();
  const B = require('../src/buildings.js');
  const p46 = B.getBuilding(46).особые_параметры;
  // Эффект — ОБЪЕКТ параметров (конвенция 000075; модель 000041):
  // радиус ЧИТАЕТСЯ КОДОМ (окно), не хардкодится.
  assert.equal(typeof p46.эффект, 'object',
    '46: эффект — объект (red: поле отсутствует в каталоге)');
  assert.equal(p46.эффект.радиус, 20, '46: эффект.радиус — 20 (ТЗ)');
  // Лимит «раз в день» НЕТ (ТЗ: взгляд бесплатен и идемпотентен):
  // флага раз_в_день в каталоге нет.
  assert.equal(p46.раз_в_день, undefined,
    '46: раз_в_день НЕ добавляется (взгляд бесплатен)');
  // Реестр: запись «Взглянуть» БЕЗ разВДень (каталог побеждает,
  // 000053 — и каталог без флага → лимита нет).
  assert.ok(BE.EFFECTS['46'], 'запись «46» в реестре (red: отсутствует)');
  assert.equal(BE.EFFECTS['46'].имя, 'Взглянуть', '46: имя по ТЗ');
  assert.equal(typeof BE.EFFECTS['46'].apply, 'function',
    '46: apply(state)');
  assert.notEqual(BE.EFFECTS['46'].разВДень, true,
    '46: разВДень в реестре не ставится');
  assert.equal(BE.hasDailyLimit(B.getBuilding(46), '46'), false,
    'hasDailyLimit(каталог 46, «46») === false');
  // Зеркало src/buildings.js — byte-в-byte с каталогом (000055;
  // регенерация npm run sync:buildings; паттерн A43).
  const j46 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', '000046.json'), 'utf8'));
  assert.deepEqual(B.getBuilding(46), j46, 'зеркало 46: buildings.js ≡ JSON');
});

test('A63. apply(«46»): деградации — без эффекта/без карты → «недоступно»; радиус не-integer → фолбэк R=20', () => {
  const BE = loadBE();
  assert.ok(BE.EFFECTS['46']
    && typeof BE.EFFECTS['46'].apply === 'function',
    'запись «46» в реестре (red: отсутствует)');
  const mapOk = { tileAt: () => ({ x: 0, y: 0, passable: true }) };
  const tile = { x: 36, y: -21 };
  // (a) Каталог БЕЗ эффекта (нет объекта особых_параметры.эффект):
  // радиус НЕ гадаем (000053) — «недоступно».
  const noEff = { id: 46, особые_параметры: { малая: true } };
  const r1 = BE.EFFECTS['46'].apply(makeState({
    day: 1, tile, save: {}, catalog: noEff, map: mapOk }));
  assert.equal(r1.ok, false, 'без эффекта — ok:false');
  assert.equal(r1.message, 'недоступно', 'деградация: текст зафиксирован');
  // (b) Карта отсутствует/мусор — «недоступно» (гард-карты, паттерн
  // записи «37»).
  for (const badMap of [null, undefined, 'карта', 42]) {
    const r = BE.EFFECTS['46'].apply(makeState({
      day: 1, tile, save: {},
      catalog: { id: 46, особые_параметры: { эффект: { радиус: 20 } } },
      map: badMap,
    }));
    assert.equal(r.ok, false, 'map=' + String(badMap) + ' — ok:false');
    assert.equal(r.message, 'недоступно', 'гард-карты');
  }
  // (c) Радиус НЕ integer ≥ 0 (1.5) — объект эффект ЕСТЬ, но параметр
  // бит → фолбэк 20 (ТЗ-фиксированный R): окно 1681.
  const badR = { id: 46, особые_параметры: { эффект: { радиус: 1.5 } } };
  const r3 = BE.EFFECTS['46'].apply(makeState({
    day: 1, tile, save: {}, catalog: badR, map: mapOk }));
  assert.equal(r3.ok, true, 'эффект есть, радиус не-integer — ok');
  assert.equal(String(r3.explored['36,-21']).split(';').length, 1681,
    'радиус 1.5 → фолбэк R=20 (окно 41×41)');
});

test('A64. markExplored: towerKey/R — программные ошибки → THROW TypeError (тест-пин)', () => {
  const BE = loadBE();
  // towerKey — не строка по шаблону «x,y» (XY_KEY_RE):
  assert.throws(
    () => BE.markExplored(null, 'не-ключ', [], 5),
    TypeError,
    'towerKey вне шаблона «x,y» — throw (программная ошибка)');
  assert.throws(
    () => BE.markExplored(null, 42, [], 5),
    TypeError,
    'towerKey не строка — throw');
  // R — не integer ≥ 0:
  assert.throws(
    () => BE.markExplored(null, '1,2', [], 1.5),
    TypeError,
    'R дробный — throw');
  assert.throws(
    () => BE.markExplored(null, '1,2', [], -1),
    TypeError,
    'R отрицательный — throw');
});

// --- Задача 000077: «ежедневный контент» круга (43) / храма (39) ---
// Единый механизм: один детерминированный ролл по (tile, day)
// РАЗ В ДЕНЬ → 'chest'|'boss'|'relic' (доли — каталог
// особые_параметры.эффект.доли) → мир-эффект → запись в раздел
// сейва buildingContent ('x,y' → { day, type }). Контракты:
// memory/000077-building-content.md (§2 сиды, §3 сейв, §7 тексты),
// переиспользуемый контракт — memory/000077-daily-content.md.

test('A55. 000077: экспорты building-effects — 4 чистые (tile,day)-функции + serialize/restore + 4 ASCII-сида', () => {
  const BE = loadBE();
  // ASCII-сиды (контракт 000077 §2: НЕ GLOBAL_SEED; экспорт — для
  // golden-пинов, паттерн TELEPORT_TIE_SEED 000075).
  assert.equal(BE.CONTENT_ROLL_SEED, 0x434f4e54,
    'CONTENT_ROLL_SEED = 0x434f4e54 ("CONT")');
  assert.equal(BE.CHEST_LOOT_SEED, 0x43484553,
    'CHEST_LOOT_SEED = 0x43484553 ("CHES")');
  assert.equal(BE.BOSS_COMBAT_SEED, 0x424f5353,
    'BOSS_COMBAT_SEED = 0x424f5353 ("BOSS")');
  assert.equal(BE.RELIC_ITEM_SEED, 0x52454c49,
    'RELIC_ITEM_SEED = 0x52454c49 ("RELI")');
  for (const m of ['rollBuildingContent', 'chestLoot', 'bossGroup',
    'relicItem', 'serializeBuildingContent', 'restoreBuildingContent']) {
    assert.equal(typeof BE[m], 'function',
      'BE.' + m + ' — функция (red: отсутствует)');
  }
});

test('A56. 000077: rollBuildingContent — доли каталога 60/30/10 на N=10000 (tile,day) ±2%', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const B = require('../src/buildings.js');
  assert.equal(typeof BE.rollBuildingContent, 'function',
    'rollBuildingContent(x, y, day, доли, hash) (red: отсутствует)');
  const доли = B.getBuilding(43).особые_параметры.эффект.доли;
  assert.ok(доли && typeof доли === 'object' && !Array.isArray(доли),
    'каталог 43: эффект.доли — объект (red: эффект — строка)');
  const counts = { chest: 0, boss: 0, relic: 0, null: 0 };
  const N = 10000;
  // 10000 РАЗНЫХ (tile, day): x ∈ [0,100), y ∈ [1000,1100),
  // day ∈ [1,400).
  for (let i = 0; i < N; i++) {
    const x = i % 100;
    const y = 1000 + Math.floor(i / 100);
    const day = 1 + (i % 400);
    const t = BE.rollBuildingContent(x, y, day, доли, PL.hash2);
    counts[t == null ? 'null' : t] += 1;
  }
  assert.equal(counts.null, 0, 'валидные доли — null нет');
  for (const [type, key] of [['chest', 'сундук'], ['boss', 'босс'],
    ['relic', 'реликвия']]) {
    const expect = доли[key] * N;
    const got = counts[type];
    assert.ok(Math.abs(got - expect) <= 0.02 * N,
      type + ': ' + got + '/' + N + ' ≠ доля ' + доли[key] +
      ' ±2% (ожидалось ≈' + expect + ')');
  }
});

test('A57. 000077: детерминизм — тот же (tile,day) → тот же тип+лут (две сессии); разные дни — различаются', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const B = require('../src/buildings.js');
  const D = require('../src/dungeon.js');
  const eff = B.getBuilding(43).особые_параметры.эффект;
  assert.ok(eff && typeof eff === 'object' && !Array.isArray(eff)
    && Array.isArray(eff.реликвии),
    'каталог 43: эффект { доли, реликвии } (red: эффект — строка)');
  const доли = eff.доли;
  const relics = eff.реликвии;
  const table0 = D.DUNGEON_ITEMS[0];
  const cases = [[5, 7, 1], [-42, -31, 2], [4, 3, 3]];
  // Формулы (контракт §2): roll = hash(x,y,seed^day)/2^32
  // (deterministicRoll, CONTENT_ROLL_SEED); лут/реликвия —
  // pickFragment-паттерн; босс — ЧИСЛО hash (боевой сид).
  const t1 = (x, y, d) => BE.rollBuildingContent(x, y, d, доли, PL.hash2);
  const l1 = (x, y, d) => BE.chestLoot(x, y, d, table0, PL.hash2);
  const b1 = (x, y, d) => BE.bossGroup(x, y, d, PL.hash2);
  const r1 = (x, y, d) => BE.relicItem(x, y, d, relics, PL.hash2);
  // Две независимые сессии (свежий require после очистки кэша —
  // паттерн A47): тот же результат — скрытого состояния НЕТ.
  delete require.cache[require.resolve('../src/building-effects.js')];
  const BE2 = loadBE();
  for (const [x, y, day] of cases) {
    assert.equal(t1(x, y, day),
      BE2.rollBuildingContent(x, y, day, доли, PL.hash2),
      '(' + x + ',' + y + ', день ' + day + '): тип');
    assert.equal(l1(x, y, day),
      BE2.chestLoot(x, y, day, table0, PL.hash2),
      '(' + x + ',' + y + ', день ' + day + '): лут сундука');
    assert.equal(b1(x, y, day),
      BE2.bossGroup(x, y, day, PL.hash2),
      '(' + x + ',' + y + ', день ' + day + '): боевой сид');
    assert.equal(r1(x, y, day),
      BE2.relicItem(x, y, day, relics, PL.hash2),
      '(' + x + ',' + y + ', день ' + day + '): реликвия');
  }
  // Разные (tile, day) — не все типы совпадают (день ВКЛЮЧЁН в
  // сид: день D+1 — НОВЫЙ ролл, может отличаться).
  const types = new Set();
  for (let d = 1; d <= 60; d++) {
    types.add(BE.rollBuildingContent(5, 7, d, доли, PL.hash2));
  }
  assert.ok(types.size >= 2,
    'разные (tile,day) — типы различаются (60 дней)');
});

test('A58. 000077: каталог 39/43 — эффект-объект { доли, реликвии } + раз_в_день (39) + зеркало buildings.js', () => {
  const B = require('../src/buildings.js');
  const j39 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', '000039.json'), 'utf8'));
  const j43 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', '000043.json'), 'utf8'));
  // 8 СУЩЕСТВУЮЩИХ id (контракт §6; новых предметов НЕТ — ТЗ).
  const RELICS = [
    'phoenix_feather', 'heavy_tome', 'stone_fist_grimoire',
    'knight_plate', 'moonstone', 'fire_spellbook', 'ice_spellbook',
    'iron_hide_tome',
  ];
  const itemIds = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'items'))) {
    if (f.endsWith('.json')) {
      itemIds.add(JSON.parse(fs.readFileSync(
        path.join(ROOT, 'assets', 'items', f), 'utf8')).id);
    }
  }
  const checkEff = (eff, name) => {
    assert.ok(eff && typeof eff === 'object' && !Array.isArray(eff),
      name + ': эффект — объект (red: 39 — поля нет / 43 — строка)');
    assert.deepEqual(eff.доли,
      { сундук: 0.6, босс: 0.3, реликвия: 0.1 },
      name + ': доли 60/30/10 (ТЗ)');
    assert.ok(Array.isArray(eff.реликвии) && eff.реликвии.length === 8,
      name + ': реликвии — массив 8 id');
    assert.deepEqual([...eff.реликвии].sort(), [...RELICS].sort(),
      name + ': реликвии — 8 фиксированных id (контракт §6)');
    for (const id of eff.реликвии) {
      assert.ok(itemIds.has(id),
        name + ': реликвия «' + id + '» ∈ assets/items');
    }
  };
  checkEff(j43.особые_параметры.эффект, '43');
  assert.equal(j43.особые_параметры.раз_в_день, true,
    '43: раз_в_день — true (было)');
  assert.equal(j39.особые_параметры.раз_в_день, true,
    '39: раз_в_день — true (red: поля нет)');
  checkEff(j39.особые_параметры.эффект, '39');
  assert.equal(j39.особые_параметры.даёт,
    'случайный контент: ловушки, босс, реликвия',
    '39: «даёт» сохранён (потребителей нет — не трогаем)');
  // Зеркало src/buildings.js — регенерация npm run sync:buildings
  // (паттерн A43: deepEqual с каталогом).
  assert.deepEqual(B.getBuilding(39), j39, 'зеркало 39: buildings.js ≡ JSON');
  assert.deepEqual(B.getBuilding(43), j43, 'зеркало 43: buildings.js ≡ JSON');
});

test('A59. 000077: реестр — записи «39» (Храм) и «43» (Круг); buildingActions — строки по каталогу', () => {
  const BE = loadBE();
  const B = require('../src/buildings.js');
  assert.ok(Object.prototype.hasOwnProperty.call(BE.EFFECTS, '43'),
    'запись «43» в реестре (red: нет)');
  assert.ok(Object.prototype.hasOwnProperty.call(BE.EFFECTS, '39'),
    'запись «39» в реестре (red: нет)');
  assert.equal(BE.EFFECTS['43'].имя, 'Круг', '43: имя «Круг» (ТЗ)');
  assert.equal(BE.EFFECTS['39'].имя, 'Храм', '39: имя «Храм» (ТЗ)');
  for (const id of ['39', '43']) {
    assert.equal(typeof BE.EFFECTS[id].available, 'function',
      id + ': available(st) — по СНИМКУ сейва');
    assert.equal(typeof BE.EFFECTS[id].apply, 'function',
      id + ': apply(st) — чистый');
  }
  // buildingActions: по каталожным записям (NPC нет) — строка
  // эффекта, доступна (день 1, записей нет).
  const row43 = BE.buildingActions(B.getBuilding(43), null, makeState());
  assert.equal(row43.length, 1, '43: ровно одна строка (эффект)');
  assert.equal(row43[0].id, '43');
  assert.equal(row43[0].имя, 'Круг');
  assert.equal(row43[0].доступен, true, '43: день 1 — доступно');
  const row39 = BE.buildingActions(B.getBuilding(39), null, makeState());
  assert.equal(row39.length, 1, '39: ровно одна строка (эффект)');
  assert.equal(row39[0].id, '39');
  assert.equal(row39[0].имя, 'Храм');
  assert.equal(row39[0].доступен, true, '39: день 1 — доступно');
});

test('A60. 000077: повтор в тот же день — «круг молчит: содержимое уже получено»; день D+1 / нет записи — новый ролл (ok:true)', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const B = require('../src/buildings.js');
  const D = require('../src/dungeon.js');
  const I = require('../src/items.js');
  const c43 = B.getBuilding(43);
  const c39 = B.getBuilding(39);
  assert.ok(BE.EFFECTS['43'] && BE.EFFECTS['39'],
    'записи «43»/«39» в реестре (red: нет)');
  const eff43 = c43.особые_параметры.эффект;
  assert.ok(eff43 && typeof eff43 === 'object' && Array.isArray(eff43.реликвии),
    'каталог 43: эффект { доли, реликвии } (red: строка)');
  // state.map — как в пайплайне (контракт §2 R-4): terrain тайла +
  // альфа pixelAt (fallback 255). terrain 3 (песок/трава-класс) →
  // тип подземелья 0 (CAVE).
  const mapFake = {
    tileAt: () => ({ terrain: 3 }),
    pixelAt: () => [0, 0, 0, 142],
  };
  const G = {
    hash2: PL.hash2,
    dungeonTypeFor: D.dungeonTypeFor,
    DUNGEON_ITEMS: D.DUNGEON_ITEMS,
    getItem: I.getItem,
  };
  const st43 = (day, save) => makeState({
    day, tile: { x: 5, y: 7 }, hero: mkHero(), save,
    catalog: c43, map: mapFake,
  });
  const st39 = (day, save) => makeState({
    day, tile: { x: -42, y: -31 }, hero: mkHero(), save,
    catalog: c39, map: mapFake,
  });
  withGame(G, () => {
    // Повтор: запись с day === СЕГОДНЯ → reason-строка ТЗ
    // (available ПЕРВЫМ, ДО daily-лимита — пайплайн 000128).
    const same = st43(3, { buildingContent: { '5,7': { day: 3, type: 'chest' } } });
    assert.equal(BE.EFFECTS['43'].available(same),
      'круг молчит: содержимое уже получено',
      '43: повтор в тот же день — reason (ТЗ-текст)');
    const rowSame = BE.buildingActions(c43, null, same)[0];
    assert.equal(rowSame.доступен, false, 'строка — disabled');
    assert.equal(rowSame.reason,
      'круг молчит: содержимое уже получено',
      'строка: reason — ТЗ-текст (НЕ «уже использовано сегодня»)');
    // 39 — ОБЩИЙ механизм: та же строка.
    const same39 = st39(3, { buildingContent: { '-42,-31': { day: 3, type: 'boss' } } });
    assert.equal(BE.EFFECTS['39'].available(same39),
      'круг молчит: содержимое уже получено',
      '39: повтор — тот же ТЗ-текст');
    // День D+1 — запись НЕ блокирует (сравнение rec.day === today).
    const next = st43(4, { buildingContent: { '5,7': { day: 3, type: 'chest' } } });
    const aNext = BE.EFFECTS['43'].available(next);
    assert.ok(aNext && typeof aNext !== 'string',
      'день D+1 — доступно (не reason-строка)');
    // Записи нет — доступно.
    const aFresh = BE.EFFECTS['43'].available(st43(1, {}));
    assert.ok(aFresh && typeof aFresh !== 'string', 'без записи — доступно');
    // apply: новый ролл — ok:true, type ∈ {chest,boss,relic};
    // сообщения — в apply (контракт §7); снимок НЕ мутирует.
    const snap = { buildingContent: {} };
    const snapBefore = JSON.stringify(snap);
    const seen = new Set();
    for (let day = 1; day <= 200; day++) {
      const r = BE.EFFECTS['43'].apply(st43(day, snap));
      assert.equal(r.ok, true, 'день ' + day + ': ok:true');
      assert.ok(['chest', 'boss', 'relic'].includes(r.type),
        'день ' + day + ': type — «' + r.type + '»');
      seen.add(r.type);
      if (r.type === 'chest') {
        const type = D.dungeonTypeFor(3, 142);
        assert.ok(D.DUNGEON_ITEMS[type].includes(r.item),
          'сундук: предмет «' + r.item + '» ∈ таблицы типа ' + type);
        assert.ok(/^Круг: сундук — „.+“\.$/.test(r.message),
          'сундук: message «Круг: сундук — „<название>“.»: ' + r.message);
      } else if (r.type === 'boss') {
        assert.equal(typeof r.seed, 'number',
          'босс: боевой сид — ЧИСЛО (opts.seed createCombat)');
        assert.equal(r.message, 'Круг: босс — к бою!',
          'босс: message (контракт §7)');
      } else {
        assert.ok(eff43.реликвии.includes(r.item),
          'реликвия: «' + r.item + '» ∈ эффект.реликвии');
        assert.ok(/^Круг: реликвия — „.+“\.$/.test(r.message),
          'реликвия: message «Круг: реликвия — „<название>“.»: ' + r.message);
      }
    }
    assert.ok(seen.has('chest') && seen.has('boss') && seen.has('relic'),
      '200 дней: все три типа выпали (60/30/10)');
    assert.equal(JSON.stringify(snap), snapBefore,
      'apply ЧИСТ (000071): снимок сейва не мутирован');
  });
});

test('A61. 000077: босс — рецепт BUILDING_BOSS (1–3 troll) + createCombat по (tile,day)-сиду', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const C = require('../src/combat.js');
  // Рецепт — в КОДЕ, не каталоге (R-2: схема 000057 запрещает
  // 1–3 моба; 8-я группа ломала бы карты).
  const r = C.GROUP_RECIPES.BUILDING_BOSS;
  assert.ok(r, 'GROUP_RECIPES.BUILDING_BOSS (red: рецепт не добавлен)');
  assert.equal(typeof r.name, 'string', 'name — string');
  assert.ok(Array.isArray(r.mobs) && r.mobs.length >= 1,
    'mobs — массив id');
  for (const id of r.mobs) {
    assert.ok(C.MOB_TYPES[id], 'mobs: «' + id + '» ∈ MOB_TYPES');
  }
  assert.deepEqual(r.count, [1, 3],
    'count [1,3] (каталожные 2..6 — не для босса)');
  // Боевой сид — ЧИСЛО по (tile, day) (BOSS_COMBAT_SEED).
  const seed = BE.bossGroup(5, 7, 1, PL.hash2);
  assert.equal(typeof seed, 'number', 'bossGroup → числовой боевой сид');
  assert.ok(Number.isFinite(seed), 'сид — finite');
  // Smoke: groupType-путь — тот, что использует игра (контракт §5):
  // recipe найден СТРОКОВЫМ ключом; rng — mulberry32(seed).
  const hero = mkHero();
  const c = C.createCombat({ player: hero, groupType: 'BUILDING_BOSS', seed: 7 });
  assert.ok(c.units.length >= 1 && c.units.length <= 3,
    'состав 1–3 моба: ' + c.units.length);
  for (const u of c.units) {
    assert.ok(C.MOB_TYPES[u.mobId], 'моб «' + u.mobId + '» ∈ MOB_TYPES');
    assert.ok(u.level >= 1, 'уровень ≥ 1');
  }
  // Детерминизм: тот же seed → тот же состав [mobId, level]
  // (стандартные формулы ядра, НЕ собственные).
  const c2 = C.createCombat({ player: hero, groupType: 'BUILDING_BOSS', seed: 7 });
  assert.deepEqual(
    c.units.map((u) => [u.mobId, u.level]),
    c2.units.map((u) => [u.mobId, u.level]),
    'тот же seed — тот же состав босса');
});

test('A62. 000077: сундук — id ∈ DUNGEON_ITEMS[type]; реликвия — id ∈ эффект.реликвии ∩ assets/items; мусор → null', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const B = require('../src/buildings.js');
  const D = require('../src/dungeon.js');
  const eff = B.getBuilding(43).особые_параметры.эффект;
  assert.ok(eff && typeof eff === 'object' && !Array.isArray(eff)
    && Array.isArray(eff.реликвии),
    'каталог 43: эффект { доли, реликвии } (red: эффект — строка)');
  const itemIds = new Set();
  for (const f of fs.readdirSync(path.join(ROOT, 'assets', 'items'))) {
    if (f.endsWith('.json')) {
      itemIds.add(JSON.parse(fs.readFileSync(
        path.join(ROOT, 'assets', 'items', f), 'utf8')).id);
    }
  }
  // Сундук: 5 типов подземелий × 50 (tile,day) — id ∈ таблицы
  // типа ∩ assets/items (таблицы передаёт ВЫЗЫВАЮЩИЙ — чистота).
  for (let type = 0; type < 5; type++) {
    const table = D.DUNGEON_ITEMS[type];
    assert.ok(Array.isArray(table) && table.length > 0,
      'DUNGEON_ITEMS[' + type + '] — непустая таблица');
    for (let i = 0; i < 50; i++) {
      const x = i % 10;
      const y = 2000 + type * 10 + Math.floor(i / 10);
      const day = 1 + i;
      const id = BE.chestLoot(x, y, day, table, PL.hash2);
      assert.ok(typeof id === 'string' && table.includes(id)
        && itemIds.has(id),
        'chestLoot(тип ' + type + ') → «' + id + '» ∈ таблицы ∩ items');
    }
  }
  // Реликвия: 50 (tile,day) — id ∈ эффект.реликвии ∩ assets/items.
  for (let i = 0; i < 50; i++) {
    const id = BE.relicItem(i % 10, 3000 + Math.floor(i / 10), 1 + i,
      eff.реликвии, PL.hash2);
    assert.ok(eff.реликвии.includes(id) && itemIds.has(id),
      'relicItem → «' + id + '» ∈ эффект.реликвии ∩ items');
  }
  // Мусорные входы → null БЕЗ исключения (fail-open; apply сам
  // деградирует «недоступно»).
  assert.equal(BE.chestLoot(5, 7, 1, null, PL.hash2), null,
    'null-таблица → null');
  assert.equal(BE.chestLoot(5, 7, 1, [], PL.hash2), null,
    'пустая таблица → null');
  assert.equal(BE.relicItem(5, 7, 1, 'мусор', PL.hash2), null,
    'не-массив реликвий → null');
  assert.equal(BE.relicItem(5, 7, 1, [], PL.hash2), null,
    'пустые реликвии → null');
  assert.equal(BE.rollBuildingContent(5, 7, 1, null, PL.hash2), null,
    'null-доли → null');
  assert.equal(BE.rollBuildingContent(5, 7, 1,
    { сундук: NaN, босс: 0.3, реликвия: 0.7 }, PL.hash2), null,
    'не-finite доля → null');
});

test('A63. 000077: buildingContent — serialize/restore (roundtrip) + fail-open (мусор — отброс, игра не падает)', () => {
  const BE = loadBE();
  // Форма зафиксирована (ТЗ/контракт §3): 'x,y' →
  // { day: integer ≥ 1, type: 'chest'|'boss'|'relic' }.
  const m = new Map([
    ['5,7', { day: 3, type: 'chest' }],
    ['-42,-31', { day: 1, type: 'boss' }],
  ]);
  const s = BE.serializeBuildingContent(m);
  assert.deepEqual(s, {
    '5,7': { day: 3, type: 'chest' },
    '-42,-31': { day: 1, type: 'boss' },
  }, 'сериализация — plain-объект зафиксированной формы');
  assert.deepEqual(BE.serializeBuildingContent(new Map()), {},
    'пустой Map — {}');
  const back = BE.restoreBuildingContent(s);
  assert.ok(back instanceof Map, 'restore — Map');
  assert.equal(back.size, 2, 'roundtrip: обе записи');
  assert.deepEqual(back.get('5,7'), { day: 3, type: 'chest' });
  assert.deepEqual(back.get('-42,-31'), { day: 1, type: 'boss' });
  // Мусорный раздел (не-объект/массив) — пустой Map БЕЗ исключения
  // (fail-open 000029; warn делает main.js).
  for (const junk of ['мусор', [], null, undefined, 42]) {
    assert.equal(BE.restoreBuildingContent(junk).size, 0,
      'мусорный раздел — пустой Map');
  }
  // Мусорная ЗАПИСЬ — отброс записи, валидные выживают
  // (ключ — XY_KEY_RE: целые, отрицательные — храм (-42,-31);
  // type — whitelist).
  const mixed = BE.restoreBuildingContent({
    '5,7': { day: 3, type: 'chest' },
    'junk-key': { day: 1, type: 'boss' },
    '1,2': { day: 0, type: 'boss' },
    '3,4': { day: 1.5, type: 'boss' },
    '6,7': { day: 1, type: 'nope' },
    '8,9': { day: 1 },
    '10,11': 'мусор',
    '12,13': null,
  });
  assert.equal(mixed.size, 1, 'выживает только валидная запись');
  assert.deepEqual(mixed.get('5,7'), { day: 3, type: 'chest' });
});

// --- Задача 000094: развалины (id 48) — «Осмотр» (лут/ловушка/запись) ---
//
// Контракты — memory/000094-ruins-inspect.md; числа/формулы —
// memory/000094-ruins.md. Ролл содержимого — детерминированный по
// (tile, day): 40/30/30 (доли — каталог); лут — предмет id из
// каталога (детерминированно); ловушка — урон 2 БЕЗ БОЯ, HP ≥ 1
// (clamp — спец-хендлер, НЕ apply); запись — фрагмент лора +
// проверка ИНТЕЛЛЕКТА (порог — каталог; уровень ≥ порога → текст).
// Чистота apply (A12): урон/лут — НЕ в apply (мир-сторона —
// спец-модуль src/building-effect-48.js). Семантика попытки (R3):
// ЛЮБОЙ валидный исход — ok:true (попытка сгорела, daily-марка +
// saveNow — роутером); ok:false — только «недоступно».

test('A55. реестр: запись «48» «Осмотреть»; «раз в день» — из каталога 48 (A48-паттерн на реальной записи)', () => {
  const BE = loadBE();
  assert.ok(BE.EFFECTS['48'],
    'запись 48 в реестре (red: нет до реализации)');
  assert.equal(BE.EFFECTS['48'].имя, 'Осмотреть', '48: имя по ТЗ');
  assert.equal(typeof BE.EFFECTS['48'].apply, 'function',
    '48: apply(state)');
  // «Раз в день» — ИЗ КАТАЛОГА (принцип 000053; ТЗ: «флаг добавить
  // в каталог id 48»); в записи реестра разВДень НЕ ставится.
  const B = require('../src/buildings.js');
  const c48 = B.getBuilding(48);
  assert.equal(c48.особые_параметры.раз_в_день, true,
    'каталог 48: раз_в_день — true (red: флага нет)');
  assert.equal(BE.hasDailyLimit(c48, '48'), true,
    '48: hasDailyLimit — по каталогу');
  assert.notEqual(BE.EFFECTS['48'].разВДень, true,
    '48: разВДень в реестре не ставится (каталог побеждает)');
  // День 1 + марка дня 1 — действие сгорело (A48-паттерн).
  const used = makeState({ day: 1, tile: { x: 5, y: 7 },
    save: { buildingOncePerDay: { '5,7:48': 1 } } });
  const rows = BE.buildingActions(c48, null, used);
  assert.equal(rows.length, 1, 'одна строка (NPC у развалин нет)');
  assert.equal(rows[0].id, '48', 'id строки — «48»');
  assert.equal(rows[0].имя, 'Осмотреть');
  assert.equal(rows[0].доступен, false, 'день 1 + марка → недоступно');
  assert.equal(rows[0].reason, 'уже использовано сегодня');
  // День 2 — снова доступно (через 000072: марка < день).
  const next = Object.assign({}, used, { day: 2 });
  assert.equal(BE.buildingActions(c48, null, next)[0].доступен, true,
    'день 2 → доступно');
});

test('A56. каталог 000048: раз_в_день + эффект (доли 40/30/30, урон 2, порог 5, 16 предметов, 8 текстов) + зеркало', () => {
  const B = require('../src/buildings.js');
  const p48 = B.getBuilding(48).особые_параметры;
  assert.equal(p48.раз_в_день, true,
    '48: раз_в_день — true (red: поля нет)');
  assert.equal(typeof p48.эффект, 'object',
    '48: эффект — объект (red: поля нет)');
  const eff = p48.эффект;
  assert.deepEqual(eff.доли, { лут: 40, ловушка: 30, запись: 30 },
    '48: доли — целые проценты, сумма 100');
  assert.equal(eff.урон_ловушки, 2, '48: урон_ловушки — 2');
  assert.equal(eff.порог_интеллект, 5, '48: порог_интеллект — 5');
  // Порядок массива = индекс для `% len` (не менять без регенерации
  // golden, memory/000094-ruins.md).
  assert.deepEqual(eff.предметы, [
    'minor_healing', 'healing_potion', 'mana_potion', 'bread',
    'meat', 'honey_cake', 'wood_sword', 'leather_armor',
    'iron_ore', 'copper_ore', 'coal', 'stone_chunk',
    'hide', 'sulfur', 'moonstone', 'herb_healing',
  ], '48: предметы — зафиксированные 16 id');
  // Кросс-сверка id с каталогом assets/items: НОВЫХ предметов НЕ
  // ВВОДИТЬ (ТЗ); у apply каталога items глобально нет (000053),
  // поэтому сверка — здесь (fs), не в apply.
  const itemsDir = path.join(ROOT, 'assets', 'items');
  const itemIds = new Set();
  for (const f of fs.readdirSync(itemsDir)) {
    if (f === 'schema.json') continue;
    itemIds.add(JSON.parse(
      fs.readFileSync(path.join(itemsDir, f), 'utf8')).id);
  }
  for (const id of eff.предметы) {
    assert.ok(itemIds.has(id),
      '48: предмет ' + id + ' существует в assets/items');
  }
  assert.deepEqual(eff.тексты, [
    '…стены города, которого нет на картах, рушатся, но держатся — пока кто-то их помнит…',
    '…на камне у входа выбит знак, которого нет ни в одном словаре: три спирали и точка…',
    '…жители долины говорят: не тратьте железо на эти обломки — камни здесь не каменные…',
    '…в пепле развалин иногда вспыхивает флогистон. Днём — голубой, ночью — зелёный…',
    '…тот, кто нашёл здесь записку, дописал её: «не читайте вслух после заката»…',
    '…под обвалившейся аркой видна вторая арка, и под ней — третья. Куда они ведут — не спрашивайте…',
    '…развалины помнят пожар. Пожар ничего не помнит. Это несправедливо, но так…',
    '…в основании колонны выбита дата на старом счёте — и число, повторённое четырежды…',
  ], '48: тексты — зафиксированные 8 фрагментов');
  // Зеркало src/buildings.js — byte-в-byte с каталогом (000055;
  // регенерация npm run sync:buildings).
  const j48 = JSON.parse(fs.readFileSync(
    path.join(ROOT, 'assets', 'buildings', '000048.json'), 'utf8'));
  assert.deepEqual(B.getBuilding(48), j48, 'зеркало 48: buildings.js ≡ JSON');
});

test('A57. rollRuinsContent/ruinsLoot: доли 40/30/30 (N=10000), детерминизм (tile, day), сиды, мусор', () => {
  const BE = loadBE();
  assert.equal(typeof BE.rollRuinsContent, 'function',
    'rollRuinsContent(tileKey, day, eff, hash) (red: отсутствует)');
  assert.equal(typeof BE.ruinsLoot, 'function',
    'ruinsLoot(tileKey, day, items, hash) (red: отсутствует)');
  // Свои ASCII-сид-константы экспортированы (golden-пины); различны
  // между собой и с сидами чужих задач (STNR/STNT/OBLT/TELP — A47).
  assert.equal(BE.RUINS_ROLL_SEED, 0x5255494e,
    'RUINS_ROLL_SEED ("RUIN" — ролл содержимого)');
  assert.equal(BE.RUINS_LOOT_SEED, 0x52554c54,
    'RUINS_LOOT_SEED ("RULT" — выбор предмета лута)');
  assert.equal(BE.RUINS_NOTE_SEED, 0x52554e54,
    'RUINS_NOTE_SEED ("RUNT" — выбор фрагмента записи)');
  const PL = require('../src/perlin.js');
  const hash = PL.hash2;
  const B = require('../src/buildings.js');
  const eff = B.getBuilding(48).особые_параметры.эффект;
  // Доли: N=10000 (tile, day) — 40/30/30 ±2% (ТЗ); сетка
  // x=i, y=j (i, j ∈ 0..99), day = i*100 + j (замер: 4004/2951/3045).
  let loot = 0, trap = 0, note = 0;
  for (let i = 0; i < 100; i++) {
    for (let j = 0; j < 100; j++) {
      const c = BE.rollRuinsContent(i + ',' + j, i * 100 + j, eff, hash);
      if (c === 'loot') loot++;
      else if (c === 'trap') trap++;
      else if (c === 'note') note++;
    }
  }
  assert.equal(loot + trap + note, 10000, 'все роллы — валидные исходы');
  assert.ok(Math.abs(loot - 4000) <= 200, 'лут ≈ 40% (±200): ' + loot);
  assert.ok(Math.abs(trap - 3000) <= 200,
    'ловушка ≈ 30% (±200): ' + trap);
  assert.ok(Math.abs(note - 3000) <= 200, 'запись ≈ 30% (±200): ' + note);
  // Голден (2,-4) — замерено (memory/000094-ruins.md):
  // день 1 — лут (roll 0.3639…), день 2 — ловушка (0.4830…),
  // день 5 — запись (0.7590…).
  assert.equal(BE.rollRuinsContent('2,-4', 1, eff, hash), 'loot',
    'golden (2,-4) день 1 — лут');
  assert.equal(BE.rollRuinsContent('2,-4', 2, eff, hash), 'trap',
    'golden (2,-4) день 2 — ловушка');
  assert.equal(BE.rollRuinsContent('2,-4', 5, eff, hash), 'note',
    'golden (2,-4) день 5 — запись');
  // Детерминизм: тот же (tileKey, day) — тот же content И тот же
  // itemId И тот же фрагмент текста (два вызова).
  assert.equal(BE.rollRuinsContent('2,-4', 1, eff, hash),
    BE.rollRuinsContent('2,-4', 1, eff, hash),
    'тот же (tile, day) — тот же content');
  assert.equal(BE.ruinsLoot('2,-4', 1, eff.предметы, hash), 'meat',
    'golden (2,-4) день 1 — лут «meat»');
  assert.equal(BE.ruinsLoot('2,-4', 1, eff.предметы, hash),
    BE.ruinsLoot('2,-4', 1, eff.предметы, hash),
    'тот же (tile, day) — тот же itemId');
  // Фрагмент — pickFragment + RUINS_NOTE_SEED (та же формула, что в
  // applyRuins; день 5 — golden-день «запись» (A59)).
  assert.equal(
    BE.pickFragment(eff.тексты, 2, -4, 5, BE.RUINS_NOTE_SEED, hash),
    BE.pickFragment(eff.тексты, 2, -4, 5, BE.RUINS_NOTE_SEED, hash),
    'тот же (tile, day) — тот же фрагмент текста');
  // Две независимые сессии (свежий require после очистки кэша,
  // A47-паттерн) — те же результаты.
  const c1 = BE.rollRuinsContent('2,-4', 1, eff, hash);
  const l1 = BE.ruinsLoot('2,-4', 1, eff.предметы, hash);
  const f1 = BE.pickFragment(eff.тексты, 2, -4, 5, BE.RUINS_NOTE_SEED,
    hash);
  delete require.cache[require.resolve('../src/building-effects.js')];
  const BE2 = loadBE();
  assert.equal(c1, BE2.rollRuinsContent('2,-4', 1, eff, hash),
    'две сессии — тот же content');
  assert.equal(l1, BE2.ruinsLoot('2,-4', 1, eff.предметы, hash),
    'две сессии — тот же itemId');
  assert.equal(f1,
    BE2.pickFragment(eff.тексты, 2, -4, 5, BE.RUINS_NOTE_SEED, hash),
    'две сессии — тот же фрагмент текста');
  // Разные (tile, day) — не все исходы/предметы совпадают.
  const contents = new Set();
  const items = new Set();
  for (let d = 1; d <= 10; d++) {
    contents.add(BE.rollRuinsContent('2,-4', d, eff, hash));
    items.add(BE.ruinsLoot('2,-4', d, eff.предметы, hash));
  }
  assert.ok(contents.size >= 2,
    'разные (tile, day) — содержимое различается');
  assert.ok(items.size >= 2, 'разные (tile, day) — предметы различаются');
  // Мусорные входы (без исключения): tileKey 'abc' → null; доли {} →
  // null; предметы [] → null.
  assert.equal(BE.rollRuinsContent('abc', 1, eff, hash), null,
    'tileKey "abc" → null');
  assert.equal(BE.rollRuinsContent('2,-4', 1, { доли: {} }, hash), null,
    'доли {} → null');
  assert.equal(BE.ruinsLoot('2,-4', 1, [], hash), null,
    'предметы [] → null');
});

test('A58. readNote: порог Интеллекта — граничные кейсы (чистое сравнение, НЕ ролл)', () => {
  const BE = loadBE();
  assert.equal(typeof BE.readNote, 'function',
    'readNote(level, threshold) (red: отсутствует)');
  const B = require('../src/buildings.js');
  const threshold = B.getBuilding(48)
    .особые_параметры.эффект.порог_интеллект;
  assert.ok(Number.isFinite(threshold),
    'порог — реальное значение каталога 48 (red: поля нет)');
  assert.equal(BE.readNote(threshold - 1, threshold), false,
    'level = порог−1 → false (граница)');
  assert.equal(BE.readNote(threshold, threshold), true,
    'level = порог → true (граница — успех)');
  assert.equal(BE.readNote(threshold + 1, threshold), true,
    'level = порог+1 → true');
  // Мусор: NaN/не-числа → false (без исключения).
  assert.equal(BE.readNote(NaN, threshold), false, 'NaN level → false');
  assert.equal(BE.readNote(5, NaN), false, 'NaN threshold → false');
  assert.equal(BE.readNote('5', threshold), false,
    'не-числовой level → false');
});

test('A59. apply(«48») «Осмотреть»: голден (2,-4) дни 1/2/5 — лут/ловушка/запись; порог Интеллекта; чистота; деградация', () => {
  const BE = loadBE();
  assert.ok(BE.EFFECTS['48']
    && typeof BE.EFFECTS['48'].apply === 'function',
    'apply(«48») в реестре (red: отсутствует)');
  const PL = require('../src/perlin.js');
  const N = require('../src/npc.js');
  const B = require('../src/buildings.js');
  const c48 = B.getBuilding(48);
  const texts = c48.особые_параметры.эффект.тексты;
  // Имена предметов — из РЕАЛЬНОГО каталога assets/items (stub
  // G.getItem по нему; каталога items у apply глобально нет — 000053).
  const itemsDir = path.join(ROOT, 'assets', 'items');
  const itemNames = new Map();
  for (const f of fs.readdirSync(itemsDir)) {
    if (f === 'schema.json') continue;
    const it = JSON.parse(
      fs.readFileSync(path.join(itemsDir, f), 'utf8'));
    itemNames.set(it.id, it.name);
  }
  const getItem = (id) => (itemNames.has(id)
    ? { id, name: itemNames.get(id) } : null);
  const hero = mkHero();
  hero.primary.intelligence = 5; // === порога (каталог 48)
  const G = { hash2: PL.hash2, skillLevel: N.skillLevel, getItem };
  withGame(G, () => {
    // День 1 — ЛУТ (golden): 'meat', message с именем предмета.
    let state = makeState({ day: 1, tile: { x: 2, y: -4 }, hero,
      save: {}, catalog: c48 });
    let s0 = JSON.parse(JSON.stringify(state));
    let r = BE.EFFECTS['48'].apply(state);
    assert.equal(r.ok, true, 'лут — ok:true');
    assert.equal(r.content, 'loot', 'день 1 — content «лоут» (golden)');
    assert.equal(r.itemId, 'meat', 'golden: лут — «meat»');
    assert.equal(r.message, 'Осмотр развалин: лут — «Жареное мясо».',
      'message лута: имя из G.getItem');
    assert.deepEqual(state, s0, 'чистота: state не мутирован');
    // День 2 — ЛОВУШКА (golden): урон 2 ЗАЯВЛЕН (исполнение —
    // спец-хендлер, A60); apply hp НЕ трогает.
    state = makeState({ day: 2, tile: { x: 2, y: -4 }, hero,
      save: {}, catalog: c48 });
    s0 = JSON.parse(JSON.stringify(state));
    r = BE.EFFECTS['48'].apply(state);
    assert.equal(r.ok, true, 'ловушка — ok:true (попытка сгорела, R3)');
    assert.equal(r.content, 'trap', 'день 2 — content «ловушка» (golden)');
    assert.equal(r.damage, 2, 'урон — из каталога (2)');
    assert.equal(r.message, 'Осмотр развалин: ловушка! −2 HP.',
      'message ловушки зафиксирован (Unicode-минус)');
    assert.equal(state.hero.hp, s0.hero.hp,
      'чистота: apply hp НЕ меняет (сторона — спец-хендлер)');
    assert.deepEqual(state, s0, 'чистота при ловушке');
    // День 5 — ЗАПИСЬ (golden), УСПЕХ: intelligence === порога.
    state = makeState({ day: 5, tile: { x: 2, y: -4 }, hero,
      save: {}, catalog: c48 });
    s0 = JSON.parse(JSON.stringify(state));
    r = BE.EFFECTS['48'].apply(state);
    assert.equal(r.ok, true, 'запись — ok:true');
    assert.equal(r.content, 'note', 'день 5 — content «запись» (golden)');
    assert.equal(r.success, true,
      'intelligence 5 === порог 5 → успех');
    assert.equal(r.fragment, texts[7],
      'golden: фрагмент №7 (день 5, fragIdx 7)');
    assert.ok(texts.includes(r.fragment), 'фрагмент — из каталога');
    assert.equal(r.message,
      'Осмотр развалин: запись: «' + r.fragment + '»',
      'message записи-успеха зафиксирован');
    assert.deepEqual(state, s0, 'чистота при записи');
    // Детерминизм (ТЗ «тот же результат и тот же текст»): повторный
    // apply(«48») с тем же (tile, day) — тот же фрагмент (уровень
    // apply: ловит недетерминизм на всём пути, не только формулу).
    const r5b = BE.EFFECTS['48'].apply(makeState({
      day: 5, tile: { x: 2, y: -4 }, hero, save: {}, catalog: c48 }));
    assert.equal(r5b.fragment, r.fragment,
      'тот же (tile, day) — тот же фрагмент текста');
    // День 5 — ЗАПИСЬ, ПРОВАЛ: intelligence 4 < порога → фрагмент
    // НЕ выдаётся (ТЗ).
    const hero4 = mkHero();
    hero4.primary.intelligence = 4;
    const st4 = makeState({ day: 5, tile: { x: 2, y: -4 }, hero: hero4,
      save: {}, catalog: c48 });
    const s4 = JSON.parse(JSON.stringify(st4));
    const r4 = BE.EFFECTS['48'].apply(st4);
    assert.equal(r4.ok, true, 'провал — ok:true (попытка сгорела, R3)');
    assert.equal(r4.content, 'note', 'день 5 — запись');
    assert.equal(r4.success, false, 'intelligence 4 < 5 → провал');
    assert.equal(r4.fragment, undefined, 'провал — фрагмент НЕ выдаётся');
    assert.equal(r4.message, 'Осмотр развалин: запись не читается.',
      'message провала зафиксирован (строка ТЗ дословно)');
    assert.deepEqual(st4, s4, 'чистота при провале');
  });
  // Fallback: G.getItem ОТСУТСТВУЕТ — message лута БЕЗ имени
  // (НЕ «недоступно»).
  withGame({ hash2: PL.hash2, skillLevel: N.skillLevel }, () => {
    const r = BE.EFFECTS['48'].apply(makeState({
      day: 1, tile: { x: 2, y: -4 }, hero, save: {}, catalog: c48 }));
    assert.equal(r.ok, true, 'без getItem — всё равно ok:true');
    assert.equal(r.message, 'Осмотр развалин: лут.',
      'fallback-message без имени предмета');
  });
  // Деградация: Game-функций нет — «недоступно» (A36-паттерн).
  withGame({}, () => {
    const r = BE.EFFECTS['48'].apply(makeState({ catalog: c48 }));
    assert.equal(r.ok, false, 'нет Game-функций — ok:false');
    assert.equal(r.message, 'недоступно');
  });
  // Каталог без эффекта / hero не-объект — «недоступно» (A53-паттерн).
  withGame(G, () => {
    const rCat = BE.EFFECTS['48'].apply(makeState({
      catalog: { id: 48, особые_параметры: {} } }));
    assert.equal(rCat.ok, false, 'каталог без эффекта — ok:false');
    assert.equal(rCat.message, 'недоступно');
    const rHero = BE.EFFECTS['48'].apply(makeState({
      hero: null, catalog: c48 }));
    assert.equal(rHero.ok, false, 'hero null — ok:false (не TypeError)');
    assert.equal(rHero.message, 'недоступно');
  });
});

test('A60. спец-хендлер (src/building-effect-48.js): ловушка — clamp HP ≥ 1; лут — addItem, отказ → r.message (R6); запись — без мир-сторон', () => {
  const M = require('../src/building-effect-48.js');
  assert.equal(typeof M.handle, 'function',
    'node-экспорт handle (red: модуль отсутствует)');
  assert.equal(typeof M.register, 'function',
    'node-экспорт register(G)');
  const trap = (hp) => {
    const hero = { hp };
    const r = { ok: true, content: 'trap', damage: 2, message: 'x' };
    const res = M.handle({ hero, r, world: { game: {} } });
    return { res, hero };
  };
  assert.equal(trap(10).res.ok, true, 'ловушка — { ok: true }');
  assert.equal(trap(10).hero.hp, 8, 'hp 10 → 8 (урон 2, без боя)');
  assert.equal(trap(4).hero.hp, 2, 'hp 4 → 2');
  assert.equal(trap(2).hero.hp, 1, 'hp 2 → 1 (clamp ≥ 1 — ТЗ-кейс)');
  assert.equal(trap(1).hero.hp, 1, 'hp 1 → 1 (не убивает — герой жив)');
  // Дефенсивный fallback урона 2 при мусоре r.damage.
  const heroFb = { hp: 10 };
  M.handle({ hero: heroFb, r: { ok: true, content: 'trap' },
    world: { game: {} } });
  assert.equal(heroFb.hp, 8, 'r.damage мусор → fallback 2');
  // Лут: G.addItem(hero, itemId, 1); успех — r НЕ мутирован
  // (message — уже от apply).
  const calls = [];
  const G = {
    addItem: (hero, itemId, qty) => {
      calls.push([hero, itemId, qty]);
      return { ok: true };
    },
  };
  const heroL = { hp: 10 };
  const r0 = { ok: true, content: 'loot', itemId: 'meat',
    message: 'Осмотр развалин: лут — «Жареное мясо».' };
  const res0 = M.handle({ hero: heroL, r: r0, world: { game: G } });
  assert.equal(res0.ok, true, 'лут-успех — { ok: true }');
  assert.deepEqual(calls, [[heroL, 'meat', 1]],
    'G.addItem(hero, itemId, 1)');
  assert.equal(r0.message, 'Осмотр развалин: лут — «Жареное мясо».',
    'лут-успех — r не мутирован');
  // Лут-ОТКАЗ (R6): попытка ВСЁ РАВНО сгорает ({ ok: true });
  // r.message — причина (роутер флэшит r.message ПЕРВЫМ).
  const G2 = { addItem: () => ({ ok: false,
    reason: 'нет свободных слотов инвентаря' }) };
  const r1 = { ok: true, content: 'loot', itemId: 'meat',
    message: 'Осмотр развалин: лут — «Жареное мясо».' };
  const res1 = M.handle({ hero: heroL, r: r1, world: { game: G2 } });
  assert.equal(res1.ok, true, 'отказ — { ok: true } (попытка сгорела)');
  assert.equal(r1.message,
    'Осмотр развалин: не удалось подобрать лут '
    + '(нет свободных слотов инвентаря).',
    'отказ — r.message = причина (R6-фиксатор)');
  // Запись: мир-сторон НЕТ (текст — в r.message); hero/r не
  // мутированы.
  const heroN = { hp: 10 };
  const rN = { ok: true, content: 'note', success: true, fragment: '…',
    message: 'Осмотр развалин: запись: «…»' };
  const sN = JSON.parse(JSON.stringify({ hero: heroN, r: rN }));
  const resN = M.handle({ hero: heroN, r: rN, world: { game: G } });
  assert.equal(resN.ok, true, 'запись — { ok: true }');
  assert.deepEqual({ hero: heroN, r: rN }, sN,
    'запись — hero/r не мутированы');
  // Дефенсив: ctx.r null / ctx без world.game / ctx null — no-op
  // { ok: true }, без краха.
  assert.deepEqual(M.handle({ hero: heroL, r: null }), { ok: true },
    'ctx.r null — no-op { ok: true }');
  assert.deepEqual(M.handle({ hero: heroL, r: r0 }), { ok: true },
    'ctx без world.game — no-op { ok: true } (без краха)');
  assert.deepEqual(M.handle(null), { ok: true }, 'ctx null — no-op');
});

test('A61. vm-загрузка спец-модуля: пара с building-actions.js — саморегистрация; без него — console.error, без регистрации (000053)', () => {
  const errors = [];
  const sandbox = {
    console: { log: () => {}, warn: () => {},
      error: (m) => errors.push(String(m)) },
  };
  vm.createContext(sandbox);
  // (а) Пара в порядке index.html (слот спец-модулей: ПОСЛЕ
  // building-actions.js) — ошибок 0, саморегистрация specials['48']
  // БЕЗ правок main.js (критерий 000128).
  for (const f of ['src/building-actions.js', 'src/building-effect-48.js']) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, f), 'utf8'), sandbox,
      { filename: f });
  }
  assert.equal(errors.length, 0,
    'ошибок загрузки пары нет: ' + errors.join('; '));
  const BA = sandbox.Game && sandbox.Game.buildingActions;
  assert.ok(BA && typeof BA.specials['48'] === 'function',
    'саморегистрация Game.buildingActions.specials["48"]'
    + ' (red: модуль отсутствует)');
  // (б) Модуль БЕЗ building-actions.js — без краша, console.error,
  // регистрации нет (деградация 000053: игра не падает).
  const errors2 = [];
  const sandbox2 = {
    console: { log: () => {}, warn: () => {},
      error: (m) => errors2.push(String(m)) },
  };
  vm.createContext(sandbox2);
  assert.doesNotThrow(() => vm.runInContext(
    fs.readFileSync(path.join(ROOT, 'src', 'building-effect-48.js'),
      'utf8'),
    sandbox2, { filename: 'building-effect-48.js' }),
    'без building-actions.js — без краха');
  assert.ok(errors2.length >= 1, 'console.error при битом порядке');
  assert.ok(String(errors2[0]).includes('Game.buildingActions не найден'),
    'текст ошибки — про порядок: ' + errors2[0]);
  assert.ok(!sandbox2.Game
    || !sandbox2.Game.buildingActions
    || !sandbox2.Game.buildingActions.specials['48'],
    'регистрации нет (buildingActions нет)');
});

// --- Задача 000091: таверна (44) — отдых и слухи (подзадача 000064) ---
// Контракты: memory/000091-tavern-rest-rumors.md (реестр 44_rest/
// 44_rumors, спец-модуль building-effect-44_rest.js, чистое ядро
// tavernRumors + сиды RUMC/RUMT/RUM2, applyTavernRumors, каталог
// 000044). Красные: падают ДО зелёной стадии (реестр/каталог/модуль
// отсутствуют). main.js и building-actions.js НЕ трогаются (контракт
// 000128) — «Отдых» = существующий clock.rest() + onDay-подписчики.

test('A55. реестр + каталог 44: «Отдых» (44_rest, БЕЗ apply) и «Слухи» (44_rumors, apply); лимитов НЕТ; оверлей dialog+эффекты; зеркало каталога (задача 000091)', () => {
  const BE = loadBE();
  // Реестр: две записи (id — префикс здания 44_, namespace 000091).
  assert.ok(BE.EFFECTS['44_rest'],
    'запись 44_rest в реестре (red: нет до реализации)');
  assert.equal(BE.EFFECTS['44_rest'].имя, 'Отдых',
    '44_rest: имя «Отдых»');
  assert.notEqual(typeof BE.EFFECTS['44_rest'].apply, 'function',
    '44_rest: БЕЗ apply (мир-действие — спец-модуль, не чистый apply)');
  assert.ok(BE.EFFECTS['44_rumors'],
    'запись 44_rumors в реестре (red: нет до реализации)');
  assert.equal(BE.EFFECTS['44_rumors'].имя, 'Слухи',
    '44_rumors: имя «Слухи»');
  assert.equal(typeof BE.EFFECTS['44_rumors'].apply, 'function',
    '44_rumors: apply(state) — чистые данные (каталог + map RO)');
  // Зеркало каталога 44 (000053: каталог-драйвен; sync-скрипт, byte-match).
  const B = require('../src/buildings.js');
  const p44 = B.getBuilding(44).особые_параметры;
  assert.deepEqual(p44.эффекты, ['44_rest', '44_rumors'],
    'каталог 44: особые_параметры.эффекты — массив ДВУХ действий (red: нет)');
  const texts = p44.эффект && p44.эффект.слухи && p44.эффект.слухи.тексты;
  assert.ok(Array.isArray(texts) && texts.length === 8,
    'каталог 44: эффект.слухи.тексты — ровно 8 строк (red: нет)');
  for (const t of texts) {
    assert.equal(typeof t, 'string', 'текст слуха — строка');
    assert.ok(t.length > 0, 'текст слуха — non-empty');
  }
  assert.equal(p44.раз_в_день, undefined,
    'каталог 44: БЕЗ раз_в_день (ТЗ: лимитов нет)');
  // НЕ трогать (000060/000064): map_index 11, виды, малая.
  assert.equal(p44.map_index, 11, 'каталог 44: map_index 11 не тронут');
  assert.deepEqual(p44.виды, ['food', 'potion'],
    'каталог 44: виды [food, potion] не тронуты (магазин 000060)');
  assert.equal(p44.малая, true, 'каталог 44: малая true не тронута');
  // Лимитов НЕТ для обоих эффектов (каталог без флага + запись без разВДень).
  assert.equal(BE.hasDailyLimit(B.getBuilding(44), '44_rest'), false,
    'hasDailyLimit(44, 44_rest) — false (без лимита)');
  assert.equal(BE.hasDailyLimit(B.getBuilding(44), '44_rumors'), false,
    'hasDailyLimit(44, 44_rumors) — false (без лимита)');
  // Связка «постройка → эффекты» — через массив (1-к-1 НЕ покрывает два).
  assert.deepEqual(BE.effectIds(B.getBuilding(44)),
    ['44_rest', '44_rumors'], 'effectIds(44) — из массива каталога');
  // Оверлей: «Диалог» (NPC Берта) ПЕРВЫМ, затем эффекты в порядке каталога.
  const res = BE.buildingActions(B.getBuilding(44), NPC(), makeState());
  assert.deepEqual(res.map((a) => a.id),
    ['dialog', '44_rest', '44_rumors'],
    'buildingActions(44, npc): dialog + эффекты (red: нет записей)');
  for (const a of res) {
    assert.equal(a.доступен, true, 'строка «' + a.id + '» — доступна');
  }
});

test('A56. «Отдых» (44_rest) — полный пайплайн onBuildingAction: день 1→2 (reason rest), шаги 0, восстановление, saveNow, БЕЗ отметки; отказ без clock (задача 000091)', () => {
  const BE = loadBE();
  const BA = require('../src/building-actions.js');
  const D = require('../src/day.js');
  // Спец-модуль (НОВЫЙ, первый в проекте): node-ветка module.exports =
  // { tavernRest } (без регистрации — в node Game нет; тест регистрирует
  // вручную, паттерн §2.3 memory). RED: файла нет → MODULE_NOT_FOUND.
  const mod = require('../src/building-effect-44_rest.js');
  assert.equal(typeof mod.tavernRest, 'function',
    'спец-модуль экспортирует tavernRest(clock)');
  const B = require('../src/buildings.js');
  const b44 = B.getBuilding(44);
  const t44 = { x: 5, y: 7, hasBuilding: true, building: 11, buildingId: 44 };
  // Регистрация вручную (node — нет Game; browser саморегистрируется).
  BA.registerSpecial('44_rest', (ctx) => mod.tavernRest(ctx && ctx.clock));
  // Часы + onDay-подписчик 1:1 main.js L659 (восстановление + респаун).
  function restClock(hero) {
    const clock = D.createClock();
    const defeatedAt = new Map();
    const buffs = [];
    clock.onDay(({ day }) => {
      P.restoreDay(hero); // часть HP/MP по формулам навыков (SPEC)
      const due = D.dueForRespawn(defeatedAt, day);
      for (const k of due) defeatedAt.delete(k);
      for (let i = buffs.length - 1; i >= 0; i--) {
        if (buffs[i].day < day) buffs.splice(i, 1);
      }
    });
    return clock;
  }
  function makeDeps(clock, hero) {
    const calls = { saveNow: 0, flash: [], playerRender: 0 };
    const deps = {
      game: {
        buildingEffects: {
          EFFECTS: BE.EFFECTS, hasDailyLimit: BE.hasDailyLimit,
        },
        npcUI: { open: () => {} },
        hash2: () => 0, xpForNext: () => 100, POINTS_PER_LEVEL: 1,
        derived: P.derived,
      },
      clock,
      hero, // ЖИВАЯ ссылка (спец-хендлер/restoreDay мутируют)
      player: { x: 5, y: 7 },
      prevPos: { x: 5, y: 7 },
      getMap: () => null,
      mover: null,
      npcs: [],
      questBook: {},
      npcShopFor: () => ({}),
      collectSaveData: () => ({ day: clock.day }),
      saveNow: () => { calls.saveNow++; },
      flash: (m) => { calls.flash.push(m); },
      buildingOncePerDay: new Map(),
      buffs: [],
      teleports: new Map(),
      buildingQuests: new Map(),
      playerRender: () => { calls.playerRender++; },
      moveHero: () => {},
      startCombat: () => {},
    };
    return { calls, deps };
  }
  function runRest(hero, clockOverride) {
    const clock = clockOverride || restClock(hero);
    const { calls, deps } = makeDeps(clock, hero);
    BA.init(deps);
    BA.onBuildingAction(
      { id: '44_rest', имя: 'Отдых', доступен: true }, t44, b44, null);
    return { clock, calls, deps };
  }
  // Вариант 1: базовый герой (без навыков) — 0.10/0.10 → +3/+2 → hp 8 / mp 6.
  let hero = mkHero({ hp: 5, mp: 4 });
  let res = runRest(hero);
  assert.equal(res.clock.day, 2, 'базовый: день 1→2 (clock.rest)');
  assert.equal(res.clock.steps, 0, 'базовый: шаги сброшены (rest)');
  assert.equal(hero.hp, 8, 'базовый: hp 5→8 (0.10 от maxHP 25)');
  assert.equal(hero.mp, 6, 'базовый: mp 4→6 (0.10 от maxMP 16)');
  assert.equal(res.calls.saveNow, 1, 'базовый: saveNow вызван');
  assert.equal(res.calls.playerRender, 1, 'базовый: playerRender');
  assert.deepEqual(res.calls.flash,
    ['Отдых: вы выспались — день 2.'],
    'базовый: flash — message спец-а с НОВЫМ днём: ' + res.calls.flash);
  assert.equal(res.deps.buildingOncePerDay.size, 0,
    'базовый: БЕЗ отметки (лимитов нет)');
  // Вариант 2: +Медитация 1 — 0.12/0.12 → +3/+2 → hp 8 / mp 6.
  hero = mkHero({ hp: 5, mp: 4, secondary: { meditation: 1 } });
  res = runRest(hero);
  assert.equal(res.clock.day, 2, '+Медитация 1: день 1→2');
  assert.equal(hero.hp, 8, '+Медитация 1: hp 5→8');
  assert.equal(hero.mp, 6, '+Медитация 1: mp 4→6');
  // Вариант 3: +Медитация 2 + Вдох 1 (B24-герой) — 0.19/0.14 → +5/+2
  // → hp 10 / mp 6 (таблица §5 memory).
  hero = mkHero({ hp: 5, mp: 4, secondary: { meditation: 2, breath: 1 } });
  res = runRest(hero);
  assert.equal(res.clock.day, 2, 'B24-герой: день 1→2');
  assert.equal(hero.hp, 10, 'B24-герой: hp 5→10 (0.19 от maxHP 25)');
  assert.equal(hero.mp, 6, 'B24-герой: mp 4→6 (0.14 от maxMP 16)');
  assert.deepEqual(res.calls.flash,
    ['Отдых: вы выспались — день 2.'], 'B24-герой: flash');
  // Отказ: спец-модуль без clock (нет rest) → {ok:false, message:
  // 'недоступно'} → БЕЗ saveNow/отметки/render, flash «недоступно»
  // (семантика отказа §2.6).
  const brokenClock = { day: 1 }; // .day — да, .rest — нет
  hero = mkHero({ hp: 5, mp: 4 });
  res = runRest(hero, brokenClock);
  assert.equal(res.calls.saveNow, 0, 'отказ: saveNow НЕ вызван');
  assert.equal(res.calls.playerRender, 0, 'отказ: playerRender нет');
  assert.equal(res.deps.buildingOncePerDay.size, 0, 'отказ: отметки нет');
  assert.deepEqual(res.calls.flash, ['недоступно'],
    'отказ: flash «недоступно» (без saveNow): ' + res.calls.flash);
  assert.equal(hero.hp, 5, 'отказ: герой НЕ восстановлен');
});

test('A57. tavernRumors — чистое ядро: детерминизм (tile, day); число/индексы фрагментов; ближайший вход (Чебышев, не развалины, лекс. тай-брейк); fail-open (задача 000091)', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  const hash = PL.hash2;
  assert.equal(typeof BE.tavernRumors, 'function',
    'tavernRumors экспортирована (red: отсутствует)');
  for (const s of ['RUMORS_COUNT_SEED', 'RUMORS_TEXT_SEED',
    'RUMORS_TEXT2_SEED']) {
    assert.equal(typeof BE[s], 'number', s + ' — сид экспортирован');
  }
  withGame({
    BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor,
    DUNGEON_NAMES: D.DUNGEON_NAMES,
  }, () => {
    const texts = ['сплетня один', 'сплетня два', 'сплетня три'];
    // Детерминизм «два мира»: два synthMap с одними cell → deepEqual.
    const mkCells = () => {
      const m = new Map();
      m.set('7,7', caveTile(7, 7));
      return m;
    };
    const r1 = BE.tavernRumors(synthMap(mkCells()), 5, 5, 1, texts, hash);
    const r2 = BE.tavernRumors(synthMap(mkCells()), 5, 5, 1, texts, hash);
    assert.deepEqual(r1, r2, 'детерминизм: два мира — идентичный результат');
    assert.equal(typeof r1, 'object', 'ВЕРНЁТ ОБЪЕКТ (никогда не null)');
    // Число фрагментов 1..2; с входом подсказок 2–3 (фрагменты + вход).
    for (const day of [1, 2, 3]) {
      const r = BE.tavernRumors(synthMap(mkCells()), 5, 5, day, texts, hash);
      assert.ok(r.fragments.length >= 1 && r.fragments.length <= 2,
        'день ' + day + ': фрагментов 1..2');
      assert.ok(r.fragments.length + 1 >= 2 && r.fragments.length + 1 <= 3,
        'день ' + day + ': подсказки 2–3 (фрагменты + вход)');
      // Фрагменты — из каталога, БЕЗ повтора (L≥2).
      assert.equal(new Set(r.fragments).size, r.fragments.length,
        'день ' + day + ': без повтора фрагментов');
    }
    // Повтор по тому же (tile, day) — бит-в-бит (детерминизм).
    assert.deepEqual(
      BE.tavernRumors(synthMap(mkCells()), 5, 5, 1, texts, hash), r1,
      'повтор (tile, day) — идентичен');
    // Ближайший вход: пещеры (10,0) и (5,3) от (4,2) → (5,3) (Чебышев:
    // (5,3) d=1, (10,0) d=6).
    const cellsN = new Map();
    cellsN.set('10,0', caveTile(10, 0));
    cellsN.set('5,3', caveTile(5, 3));
    const rN = BE.tavernRumors(synthMap(cellsN), 4, 2, 1, texts, hash);
    assert.deepEqual(rN.entrance, { x: 5, y: 3 },
      'ближайший по Чебышеву — (5,3)');
    assert.equal(rN.dungeonType, D.dungeonTypeFor(3, 255),
      'dungeonType — через dungeonTypeFor(terrain, alpha)');
    // Развалины (buildingId 48) рядом — НЕ кандидат (000073, 000094).
    const cellsR = new Map();
    cellsR.set('5,3', caveTile(5, 3, { buildingId: 48 }));
    const rR = BE.tavernRumors(synthMap(cellsR), 4, 2, 1, texts, hash);
    assert.equal(rR.entrance, null, 'развалины (48) — НЕ вход');
    // Тай-брейк при равенстве дистанции — лексикографически меньший (x, y).
    const cellsT = new Map();
    cellsT.set('6,5', caveTile(6, 5));
    cellsT.set('4,5', caveTile(4, 5));
    const rT = BE.tavernRumors(synthMap(cellsT), 5, 5, 1, texts, hash);
    assert.deepEqual(rT.entrance, { x: 4, y: 5 },
      'тай-брейк — лексикографически меньший (x)');
    // Входа нет (пустая карта) → entrance: null, фрагменты на месте.
    const rE = BE.tavernRumors(synthMap(new Map()), 5, 5, 1, texts, hash);
    assert.equal(rE.entrance, null, 'входа нет — entrance null');
    assert.ok(rE.fragments.length >= 1, 'входа нет — фрагменты на месте');
    // map: null → без исключения, entrance: null, фрагменты (fail-open).
    const rN2 = BE.tavernRumors(null, 5, 5, 1, texts, hash);
    assert.equal(rN2.entrance, null, 'map=null — без исключения, null');
    assert.ok(rN2.fragments.length >= 1, 'map=null — фрагменты (fail-open)');
    // texts.length === 1 → f=1 (повтор невозможен по построению).
    const r1t = BE.tavernRumors(synthMap(mkCells()), 5, 5, 1, ['один'], hash);
    assert.equal(r1t.fragments.length, 1, 'texts.length===1 → f=1');
  });
});

test('A58. applyTavernRumors (= EFFECTS[44_rumors].apply): реальный каталог 44 + synthMap; message «Слухи:…»; снапшот не мутирован; fail-open без карты; отказ без содержимого/без hash2 (задача 000091)', () => {
  const BE = loadBE();
  const PL = require('../src/perlin.js');
  const D = require('../src/dungeon.js');
  const M = require('../src/map.js');
  const B = require('../src/buildings.js');
  const p44 = B.getBuilding(44).особые_параметры;
  const texts = p44.эффект.слухи.тексты; // 8 строк (A55)
  const real44 = B.getBuilding(44);
  withGame({
    BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor,
    DUNGEON_NAMES: D.DUNGEON_NAMES,
    hash2: PL.hash2,
  }, () => {
    // Реальный каталог 44 + synthMap с caveTile(7,7) → ok, message.
    const cells = new Map();
    cells.set('7,7', caveTile(7, 7));
    const st = makeState({
      day: 1, tile: { x: 5, y: 5 }, save: {}, catalog: real44,
    });
    // Снимок чистоты — ДО подвешивания map: map — live-ссылка с
    // ФУНКЦИЯМИ (000076), а JSON их в снимок не переносит.
    const snap = JSON.parse(JSON.stringify(st));
    st.map = synthMap(cells);
    const r = BE.EFFECTS['44_rumors'].apply(st);
    assert.equal(r.ok, true, 'ok (каталог + вход)');
    assert.ok(r.message.startsWith('Слухи:\n· '),
      'message — «Слухи:\n· …» (мультисайновый flash): ' + r.message);
    // Первый фрагмент — i0 = hash(x,y,RUMT^day) % L (тот же код, что
    // apply: сиды переименованы RUMC/RUMT/RUM2, §5/§9 memory).
    const i0 = PL.hash2(5, 5, BE.RUMORS_TEXT_SEED ^ 1) % texts.length;
    assert.ok(r.message.includes('«' + texts[i0] + '»'),
      'message — «фрагмент» i0 (сид RUMT): ' + r.message);
    assert.ok(r.message.includes('(7, 7)'),
      'message — координаты входа: ' + r.message);
    assert.ok(r.message.includes(D.DUNGEON_NAMES[0]),
      'message — имя типа подземелья (DUNGEON_NAMES): ' + r.message);
    // Снапшот НЕ мутирован (apply-профиль; map — live-ссылка, часть
    // данных снимка — day/tile/hero/save/catalog).
    const stData = Object.assign({}, st);
    delete stData.map;
    assert.deepEqual(stData, snap, 'снапшот не мутирован');
    // Без карты → НЕ отказ (fail-open, §2.6): ok + «Входы в пещеры
    // не видны.» (лор из каталога всё равно).
    const r2 = BE.EFFECTS['44_rumors'].apply(Object.assign(
      makeState({ tile: { x: 5, y: 5 }, save: {}, catalog: real44 }),
      { map: null }));
    assert.equal(r2.ok, true, 'без карты — НЕ отказ (fail-open)');
    assert.ok(r2.message.includes('Входы в пещеры не видны.'),
      'без карты — «Входы в пещеры не видны.»: ' + r2.message);
    assert.ok(r2.message.startsWith('Слухи:\n· '),
      'без карты — фрагменты на месте: ' + r2.message);
    // Каталог БЕЗ текстов (эффект без слухи) + карта БЕЗ входа →
    // отказ «недоступно» (fail-open: без исключений).
    const noText44 = Object.assign({}, real44, {
      особые_параметры: Object.assign({}, p44, { эффект: {} }),
    });
    const r3res = BE.EFFECTS['44_rumors'].apply(Object.assign(
      makeState({ day: 1, tile: { x: 5, y: 5 }, save: {},
        catalog: noText44 }),
      { map: synthMap(new Map()) }));
    assert.deepEqual(r3res, { ok: false, message: 'недоступно' },
      'без текстов И без входа — отказ «недоступно»');
  });
  // Без G.hash2 → отказ (паттерн applyRuneStone; hash2 — lazyGame()).
  withGame({
    BUILDING_TYPES: M.BUILDING_TYPES,
    dungeonTypeFor: D.dungeonTypeFor,
    DUNGEON_NAMES: D.DUNGEON_NAMES,
  }, () => {
    const st = makeState({
      day: 1, tile: { x: 5, y: 5 }, save: {}, catalog: real44,
    });
    const cells = new Map();
    cells.set('7,7', caveTile(7, 7));
    st.map = synthMap(cells);
    const r = BE.EFFECTS['44_rumors'].apply(st);
    assert.deepEqual(r, { ok: false, message: 'недоступно' },
      'без G.hash2 — отказ (fail-open)');
  });
});

test('A59. tavernRest — node (спец-модуль): clock.rest → {ok, message с новым днём}; guard (null/нет rest) → «недоступно»; чистота (задача 000091)', () => {
  // RED: файла src/building-effect-44_rest.js нет → MODULE_NOT_FOUND.
  const mod = require('../src/building-effect-44_rest.js');
  assert.equal(typeof mod.tavernRest, 'function',
    'tavernRest(clock) экспортирована (node-ветка)');
  // Фейковый clock: rest() инкрементит day (как createClock).
  let restCalls = 0;
  const clock = {
    day: 1,
    rest() { restCalls += 1; this.day += 1; },
  };
  const r = mod.tavernRest(clock);
  assert.equal(r.ok, true, 'ok (clock.rest — функция)');
  assert.equal(r.message, 'Отдых: вы выспались — день 2.',
    'message — «Отдых: вы выспались — день N.» (N — НОВЫЙ день): ' +
      r.message);
  assert.equal(restCalls, 1, 'clock.rest() вызван ровно 1 раз');
  // Guard: null / нет rest → {ok:false, message:'недоступно'} (не
  // исключение, 000029).
  assert.deepEqual(mod.tavernRest(null),
    { ok: false, message: 'недоступно' }, 'null — «недоступно»');
  assert.deepEqual(mod.tavernRest({}),
    { ok: false, message: 'недоступно' }, 'без rest — «недоступно»');
  assert.deepEqual(mod.tavernRest({ day: 3 }),
    { ok: false, message: 'недоступно' }, 'rest не функция — «недоступно»');
  // Чистота node-ветки: нет зависимости от Game (тест прогнал без
  // globalThis.Game — сработало).
});

// --- Секция B: wiring через ВЕСЬ index.html в vm (браузерный realm) ---
//
// Паттерн tests/save-restore.test.js: DOM/WebGL-стабы + МОК
// localStorage (сейвы реально пишутся/читаются). Мир — детерминированный
// фолбэк (map.png onerror → G.generateSeedPixels, фикс. сид). Игрок
// ходит как в игре: keydown(направление) → кадры frame(now) по +200 мс
// (tryMove — в frame при now−lastMove ≥ stepMs; stepMs базовый 420 мс,
// 000063) → keyup (протокол tests/main-visuals.test.js).

const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const CHAIN = Array.from(html.matchAll(/<script\s+src="([^"]+)"/g), (m) => m[1])
  .map((p) => p.replace(/^src\//, ''));
const NOW = 1000; // performance.now() в песочнице заморожен на NOW

// --- WebGL-стаб (main.js: compile/link/буферы; как save-restore) ---

function makeGl() {
  const noop = () => {};
  const gl = {
    VERTEX_SHADER: 35633, FRAGMENT_SHADER: 35632,
    COMPILE_STATUS: 35713, LINK_STATUS: 35714,
    ARRAY_BUFFER: 34962, DYNAMIC_DRAW: 35048, FLOAT: 5126,
    COLOR_BUFFER_BIT: 1024, TRIANGLES: 4,
  };
  gl.createShader = () => ({});
  gl.shaderSource = noop;
  gl.compileShader = noop;
  gl.getShaderParameter = () => true; // иначе main.js бросит Error
  gl.getShaderInfoLog = () => '';
  gl.createProgram = () => ({});
  gl.attachShader = noop;
  gl.linkProgram = noop;
  gl.getProgramParameter = () => true;
  gl.getProgramInfoLog = () => '';
  gl.useProgram = noop;
  let attrib = 0;
  gl.getAttribLocation = () => attrib++;
  gl.getUniformLocation = () => ({});
  gl.enableVertexAttribArray = noop;
  gl.createBuffer = () => ({});
  gl.bindBuffer = noop;
  gl.bufferData = noop;
  gl.vertexAttribPointer = noop;
  gl.viewport = noop;
  gl.clearColor = noop;
  gl.clear = noop;
  gl.uniformMatrix4fv = noop;
  gl.drawArrays = noop;
  return gl;
}

function makeContext2d(el) {
  const calls = el.drawCalls = [];
  return new Proxy({}, {
    get: (t, k) => (k in t ? t[k] : (...args) => { calls.push([k, args]); }),
    set: (t, k, v) => { t[k] = v; return true; },
  });
}

// --- «Снисходительный» DOM-элемент с ДЕРЕВОМ (дети/родитель, dataset,
// closest) — как main-visuals + ui-panel: нужен для оверлея (строки
// действий, делегированный клик). ---

function matchesSel(el, sel) {
  // Поддерживает: 'tag', '.class', '[attr]', '[attr="value"]' и их
  // композиты без пробела ('button[data-buid]') — то, что использует
  // ui.js (npcUI: closest('button[data-npcact]')).
  let rest = String(sel).trim();
  let tag = null;
  let cls = null;
  let attr = null;
  const bm = rest.match(/\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (bm) {
    attr = [bm[1], bm[2]];
    rest = rest.slice(0, bm.index);
  }
  const cm = rest.match(/\.([A-Za-z0-9_-]+)$/);
  if (cm) {
    cls = cm[1];
    rest = rest.slice(0, cm.index);
  }
  if (rest) tag = rest;
  if (tag && String(el.tagName || '').toLowerCase() !== tag.toLowerCase()) {
    return false;
  }
  if (cls &&
      !String(el.className || '').split(/\s+/).includes(cls)) {
    return false;
  }
  if (attr) {
    // attr = [имя, значение]: attr[0] — имя (bm[1]), attr[1] —
    // значение (bm[2], undefined у '[data-buid]').
    if (!attr[0].startsWith('data-')) return false;
    const v = el.dataset ? el.dataset[attr[0].slice(5)] : undefined;
    if (v === undefined) return false;
    return attr[1] === undefined ? true : String(v) === attr[1];
  }
  return true;
}

function findAll(root, sel) {
  const out = [];
  const walk = (n) => {
    for (const ch of n.children || []) {
      if (matchesSel(ch, sel)) out.push(ch);
      walk(ch);
    }
  };
  walk(root);
  return out;
}

function makeEl(tag) {
  const target = {
    tagName: tag,
    className: '',
    _text: '',
    title: '',
    disabled: false,
    style: {},
    dataset: {},
    children: [],
    parent: null,
    listeners: {},
    // children хранят СУРЫЕ target (а не прокси): remove() ищёт в
    // массиве target по identity — прокси в массиве нашёл бы -1 и
    // «удалённый» оверлей остался бы в body (B2: countOverlays).
    appendChild(ch) {
      const raw = ch && ch.__raw ? ch.__raw : ch;
      if (raw.parent) {
        raw.parent.children.splice(raw.parent.children.indexOf(raw), 1);
      }
      raw.parent = target;
      target.children.push(raw);
      return ch;
    },
    remove() {
      if (!target.parent) return;
      const i = target.parent.children.indexOf(target);
      if (i >= 0) target.parent.children.splice(i, 1);
      target.parent = null;
    },
    addEventListener(type, fn) {
      (target.listeners[type] || (target.listeners[type] = [])).push(fn);
    },
    removeEventListener(type, fn) {
      const a = target.listeners[type];
      if (!a) return;
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    },
    // data-* → dataset (атрибутов, которые нужен играм, только data-*).
    setAttribute(name, value) {
      if (name.startsWith('data-')) {
        target.dataset[name.slice(5)] = value;
      }
    },
    // canvas: 2d/WebGL-контексты — no-op-прокси. combat-ui.js создаёт
    // СВОЙ canvas боя (document.createElement('canvas')) — без
    // getContext-стаба render() роняет TypeError (B8). Явные
    // переопределения #game/#sprites в bootSandbox сохраняются
    // (прокси set поверх этого метода).
    getContext(kind) {
      if (tag !== 'canvas') return null;
      return kind === 'webgl' ? makeGl() : makeContext2d(target);
    },
    getBoundingClientRect() { return { left: 0, top: 0 }; },
    blur() {},
    closest(sel) {
      let n = target;
      while (n) {
        if (matchesSel(n, sel)) return n;
        n = n.parent;
      }
      return null;
    },
    querySelector(sel) { return findAll(target, sel)[0] || null; },
    querySelectorAll(sel) { return findAll(target, sel); },
  };
  // textContent — как в DOM: сбрасывает детей (render() очищает секции).
  Object.defineProperty(target, 'textContent', {
    get() { return this._text; },
    set(v) {
      this._text = String(v);
      for (const ch of target.children) ch.parent = null;
      target.children.length = 0;
    },
  });
  // Ссылка прокси → сырой target (appendChild нормализует детей).
  target.__raw = target;
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => undefined; // неизвестный метод DOM — no-op
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

// Рекурсивный текст элемента (для ассертов содержимого оверлея).
function textOf(n) {
  let s = String(n.textContent || '');
  for (const ch of n.children || []) s += textOf(ch);
  return s;
}

// --- localStorage-мок (паттерн save-restore) ---
// seed (000075): ДОСЕЯННЫЙ сейв (v1) ДО запуска цепочки — main.js
// читает его синхронно при загрузке (G.load в самом верху IIFE),
// поэтому посеять после bootSandbox() поздно (restoreFromSave уже
// прошёл): паттерн tests/save-restore.test.js.

function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// Оболочка досеянного сейва актуальной версии (v1).
function seedSave(data) {
  return { version: 1, savedAt: new Date(0).toISOString(), data };
}

// --- Песочница: вся цепочка index.html ---

function bootSandbox(seed) {
  const winListeners = {};
  const raf = [];
  const errors = [];
  const gameCanvas = makeEl('canvas');
  const spriteCanvas = makeEl('canvas');
  const hud = makeEl('div');
  // #game — WebGL (без него main.js уходит в фолбэк-ветку и не стартует).
  gameCanvas.getContext = (kind) => (kind === 'webgl'
    ? makeGl() : makeContext2d(gameCanvas));
  spriteCanvas.getContext = (kind) => (kind === '2d'
    ? makeContext2d(spriteCanvas) : null);
  const storage = makeStorage(seed);
  const body = makeEl('body');
  const document = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => (
      id === 'game' ? gameCanvas
        : id === 'sprites' ? spriteCanvas
          : id === 'hud' ? hud
            : null),
    body,
    addEventListener() {},
    removeEventListener() {},
    querySelector: () => null,
    hidden: false,
  };
  const window = {
    innerWidth: 1280,
    innerHeight: 720,
    location: { search: '' },
    localStorage: storage,
    confirm: () => false,
    // Семантика браузерного window: повторный add одного и того же
    // слушателя — no-op, remove — реально снимает. Без этого
    // no-op-«удаление» накапливало в winListeners УСТАРЕВШИЕ
    // buildingUI-keyHandler (общий замыкатель onKeyDown) — и каждое
    // нажатие обрабатывалось дважды (B9: курсор прыгал на 2 строки).
    addEventListener: (t, f) => {
      const a = winListeners[t] || (winListeners[t] = []);
      if (!a.includes(f)) a.push(f);
    },
    removeEventListener: (t, f) => {
      const a = winListeners[t];
      if (!a) return;
      const i = a.indexOf(f);
      if (i >= 0) a.splice(i, 1);
    },
  };
  // Image-стаб: assets/map.png ВСЕГДА onerror (детерминированный фолбэк
  // G.generateSeedPixels, main.js loadMapPixels), остальные — onload.
  function Image() {
    const self = this;
    self.naturalWidth = 0;
    self.naturalHeight = 0;
    Object.defineProperty(self, 'src', {
      configurable: true,
      get() { return self.__src; },
      set(v) {
        self.__src = v;
        Promise.resolve().then(() => {
          if (v === 'assets/map.png') {
            if (typeof self.onerror === 'function') self.onerror();
          } else if (typeof self.onload === 'function') {
            self.onload();
          }
        });
      },
    });
  }
  const sandbox = {
    console: {
      warn: () => {},
      error: (m) => errors.push(String(m)),
      log: () => {},
    },
    document,
    window,
    Image,
    performance: { now: () => NOW },
    requestAnimationFrame: (fn) => { raf.push(fn); return raf.length; },
    // Таймеры не гоняем (flаши UI): no-op, чтобы не держать процесс.
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  vm.createContext(sandbox);
  for (const f of CHAIN) {
    vm.runInContext(
      fs.readFileSync(path.join(ROOT, 'src', f), 'utf8'), sandbox,
      { filename: f });
  }
  return { sandbox, winListeners, raf, errors, storage, body, hud };
}

// Промывка микротасков (загрузки Image + loadMapPixels().then: карта,
// спавн, requestAnimationFrame).
const drain = () => new Promise((r) => setImmediate(r));

async function boot(seed) {
  const h = bootSandbox(seed);
  await drain();
  await drain();
  await drain();
  return h;
}

// --- Ввод: диспетч по захваченным window-слушателям ---
//
// ВАЖНО: массив слушателей снапшотится ПЕРЕД диспетчем — слушатель,
// зарегистрированный ВО ВРЕМЯ диспетча (buildingUI.open вешает свой
// keydown), текущее событие НЕ видит (семантика браузерного DOM).
// Без снапшота for...of по массиву увидит добавленный элемент и
// «двойное нажатие» сломало бы сценарий (оверлей закроется тем же
// событием, что открыл его).
function key(h, code, extra = {}) {
  const e = Object.assign({ code, preventDefault() {}, stopPropagation() {} },
    extra);
  for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
  return e;
}

function keyup(h, code, extra = {}) {
  const e = Object.assign({ code }, extra);
  for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
  return e;
}

// Один кадр с заданным now (время в песочнице «идёт» только через
// аргумент frame(now) — performance.now() заморожен на NOW).
function frameAt(h, now) {
  h.raf[h.raf.length - 1](now);
}

// --- Ход игрока (протокол tests/main-visuals.test.js) ---
//
// BFS по правилам игрока (4 направления, только passable), исключая:
//   * тайлы групп мобов (шаг = startCombat — мир останавливается);
//   * входы пещер (шаг = лабиринт);
//   * городские тайлы (000103: building = -1 — слотовой записи нет;
//     предикат города — по building, с 000073 у слотовых 8..12 тоже
//     есть buildingId — подтип).
// Задача 000075 (RESOLVE-БУГ, критик): каталожная запись тайла
// резолвится ПО buildingId (подтип слотов 8..12 — РЕАЛЬНАЯ запись
// тайла; базовая запись слота buildingForMapIndex(t.building) —
// «обобщённое» имя, НЕ запись тайла). main.js обязан резолвить ТАК
// ЖЕ (одинаковое однострочное выражение — memory/000075-
// teleport-circles.md): без этого действие «41» никогда не появится
// в оверлее. pred — опциональный фильтр по РЕШЁННОЙ записи
// (B12: постройка без каталожного раз_в_день; B13: id 41).
function findBuilding(G, myMap, start, wantNpc, pred) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const npcList = G.NpcData.NPCS;
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 300 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding) {
          if (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
          // Задача 000073: город — по building = NONE (до 000073 —
          // buildingId != null; слотовые входы тоже получили
          // buildingId — подтип, и они обязаны оставаться целями).
          if (t.building === G.BUILDING_TYPES.NONE) continue; // город (000103)
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (t.hasBuilding) {
          // 000075: запись ПО buildingId (подтип), fallback — базовая
          // запись слота (слоты 0..7: buildingId null).
          const b = t.buildingId != null
            ? G.getBuilding(t.buildingId)
            : G.buildingForMapIndex(t.building);
          if (b) {
            const npc = G.npcForBuilding(npcList, b.id);
            if (!!npc === !!wantNpc && (!pred || pred(b))) {
              const steps = [];
              let kk = k;
              while (kk !== startKey) {
                const [px, py] = kk.split(',').map(Number);
                steps.unshift([px, py]);
                kk = prev.get(kk);
              }
              return { tile: t, building: b, npc, steps };
            }
          }
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Задача 000094: BFS до ближайших развалин (t.buildingId === 48) —
// БЕЗ пропуска слота 9 (findBuilding пропускает CAVE_ENTRANCE: для
// него цель — входы в подземелье, а развалины — ПОДТИП слота 9 и
// обязаны оставаться целью; «не вход в подземелье» — гард 000073
// maybeEnterDungeon, не обход). Голден: (2,-4), 6 шагов от спавна
// (0,0) — детерминированный пин достижимости (замерено на HEAD,
// memory/000094-ruins.md).
function findRuins(G, myMap, start) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 300 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding && t.building === G.BUILDING_TYPES.NONE) {
          continue; // город (000103)
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (t.hasBuilding && t.buildingId === 48) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Задача 000076: BFS по id каталожной записи (t.buildingId — подтип,
// 000073), НЕ по слоту: все храмы слота 8 имеют building=8 (TEMPLE),
// подтип — в buildingId (36 солнце / 37 луна / 38 гора / 39
// заброшенный). Детерминированная карта (фикс. сид, замерено на базе
// worktree, см. memory/000076-temple-blessings.md): ближайший
// достижимый 36 → (7,30), 38 → (50,3), 37 → (41,-19).
function findTempleById(G, myMap, start, wantId) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 400 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding) {
          if (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
          if (t.building === G.BUILDING_TYPES.NONE) continue; // город
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (t.hasBuilding && t.building === G.BUILDING_TYPES.TEMPLE
            && t.buildingId === wantId) {
          const steps = [];
          let kk = k;
          while (kk !== startKey) {
            const [px, py] = kk.split(',').map(Number);
            steps.unshift([px, py]);
            kk = prev.get(kk);
          }
          return { tile: t, steps };
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Задача 000076 (B12): BFS, как findBuilding(false), НО запись
// роутера цели (t.buildingId, 000073) обязана иметь и NPC нет, и
// каталожного раз_в_день НЕТ: лимит — из каталога (принцип 000053),
// и первая постройка без NPC — (4,3), подтип 43 — флаг В каталоге
// есть (там «без лимита» не проверить). На детерминированной карте
// (замерено): (36,-21), слот 12, buildingId 46, 57 шагов.
function findBuildingNoDailyLimit(G, myMap, start) {
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const startKey = start.x + ',' + start.y;
  const visited = new Set([startKey]);
  const prev = new Map();
  let frontier = [{ x: start.x, y: start.y }];
  for (let depth = 0; depth < 300 && frontier.length; depth++) {
    const next = [];
    for (const cur of frontier) {
      for (const [dx, dy] of DIRS) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const k = nx + ',' + ny;
        if (visited.has(k)) continue;
        const t = myMap.tileAt(nx, ny);
        if (!t.passable || t.hasMobGroup) continue;
        if (t.hasBuilding) {
          if (t.building === G.BUILDING_TYPES.CAVE_ENTRANCE) continue;
          if (t.building === G.BUILDING_TYPES.NONE) continue; // город
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (t.hasBuilding) {
          const b = (t.buildingId != null && G.getBuilding(t.buildingId))
            || G.buildingForMapIndex(t.building);
          const npc = G.npcForBuilding(G.NpcData.NPCS, b.id);
          const flag = !!(b.особые_параметры
            && b.особые_параметры.раз_в_день === true);
          if (!npc && !flag) {
            const steps = [];
            let kk = k;
            while (kk !== startKey) {
              const [px, py] = kk.split(',').map(Number);
              steps.unshift([px, py]);
              kk = prev.get(kk);
            }
            return { tile: t, building: b, steps };
          }
        }
        next.push({ x: nx, y: ny });
      }
    }
    frontier = next;
  }
  return null;
}

// Доход до цели по шагам BFS: на каждый шаг keydown → кадры по +200 мс
// ПОКА игрок не перешёл (один кадр = не более одного хода) → keyup.
// В конце — 4 осадочных кадра (глейд мувера/камеры).
function walkTo(h, steps) {
  const g = h.sandbox.__game;
  let now = NOW;
  for (let i = 0; i < steps.length; i++) {
    const [fx, fy] = i === 0
      ? [g.state.player.x, g.state.player.y]
      : steps[i - 1];
    const [tx, ty] = steps[i];
    const dx = tx - fx, dy = ty - fy;
    assert.ok(Math.abs(dx) + Math.abs(dy) === 1, 'BFS: шаг по соседнему');
    const code = dx === 1 ? 'ArrowRight' : dx === -1 ? 'ArrowLeft'
      : dy === 1 ? 'ArrowDown' : 'ArrowUp';
    const e = { code, preventDefault() {} };
    for (const fn of (h.winListeners['keydown'] || []).slice()) fn(e);
    let guard = 0;
    do {
      now += 200;
      frameAt(h, now);
    } while ((g.state.player.x !== tx || g.state.player.y !== ty)
      && ++guard < 12);
    for (const fn of (h.winListeners['keyup'] || []).slice()) fn(e);
    assert.ok(g.state.player.x === tx && g.state.player.y === ty,
      `сценарий: игрок не перешёл на (${tx},${ty}) за ${guard} кадров`);
  }
  for (let i = 0; i < 4; i++) {
    now += 200;
    frameAt(h, now);
  }
  return now;
}

// Сейв из мок-хранилища ({version, savedAt, data}) или null.
function readSave(h) {
  const text = h.storage.getItem(SAVE_KEY);
  return text == null ? null : JSON.parse(text);
}

// Оверлей buildingUI — единственный .combat-overlay без npc-overlay
// (npcUI тоже combat-overlay; его отличаем классом npc-overlay).
function findOverlay(h) {
  const all = findAll(h.body, '.combat-overlay');
  return all.find((o) => !String(o.className).includes('npc-overlay'))
    || null;
}

function countOverlays(h) {
  return findAll(h.body, '.combat-overlay')
    .filter((o) => !String(o.className).includes('npc-overlay')).length;
}

// Строка действия по id (dataset.buid).
function findRow(overlay, id) {
  return findAll(overlay, '[data-buid]')
    .find((r) => r.dataset.buid === id) || null;
}

// Клик по строке: ЕДИНСТВЕННЫЙ делегированный обработчик оверлея
// (паттерн npcUI onOverlayClick: overlay.listeners.click[0]({target})).
function clickRow(h, overlay, id) {
  const clickers = overlay.listeners.click || [];
  assert.ok(clickers.length >= 1,
    'на оверлее есть делегированный click-обработчик');
  const row = findRow(overlay, id);
  assert.ok(row, 'строка действия ' + id + ' найдена в оверлее');
  clickers[0]({ target: row });
  return row;
}

// --- Тесты: wiring ---

test('B1. wiring: Game.buildingUI и Game.buildingEffects в браузерном realm (цепочка index.html)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const G = h.sandbox.Game;
  const be = G.buildingEffects;
  assert.ok(be, 'Game.buildingEffects существует (src/building-effects.js)');
  assert.ok(be.EFFECTS && typeof be.EFFECTS === 'object', 'реестр в Game');
  for (const m of ['buildingActions', 'effectIds', 'hasEffects',
    'hasDailyLimit']) {
    assert.equal(typeof be[m], 'function', 'Game.buildingEffects.' + m);
  }
  const bui = G.buildingUI;
  assert.ok(bui, 'Game.buildingUI существует (src/building-ui.js)');
  for (const m of ['open', 'close', 'isActive']) {
    assert.equal(typeof bui[m], 'function', 'Game.buildingUI.' + m);
  }
});

test('B2. buildingUI: 1..9/клик — действие + само-закрытие; недоступное — disabled и не выполняется; [Esc] — закрыть', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  assert.ok(G.buildingUI, 'Game.buildingUI существует');
  const bui = G.buildingUI;
  const calls = [];
  const a1 = { id: 'a1', имя: 'Первое', доступен: true };
  const a2 = { id: 'a2', имя: 'Второе', доступен: false,
    reason: 'уже использовано сегодня' };
  const open = () => bui.open({
    title: 'Тестовая постройка', actions: [a1, a2],
    onAction: (a) => calls.push(a),
  });
  open();
  assert.equal(bui.isActive(), true, 'оверлей открыт');
  assert.equal(countOverlays(h), 1, 'один оверлей в body');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей .combat-overlay подвешен к body');
  assert.ok(textOf(ov).includes('Тестовая постройка'),
    'заголовок в оверлее');
  const r1 = findRow(ov, 'a1');
  const r2 = findRow(ov, 'a2');
  assert.ok(r1 && r2, 'строки действий (data-buid) на месте');
  assert.ok(!r1.disabled, 'доступная строка — не disabled');
  assert.equal(r2.disabled, true, 'недоступная строка — disabled');
  assert.ok(textOf(ov).includes('уже использовано сегодня'),
    'reason недоступной строки виден');
  // Digit1 → onAction(action) + оверлей закрывается сам.
  key(h, 'Digit1');
  assert.deepEqual(calls, [a1], 'onAction получает САМО действие');
  assert.equal(bui.isActive(), false, 'после onAction оверлей закрыт');
  assert.equal(countOverlays(h), 0, 'оверлей удалён из body');
  // Недоступное: Digit2 не выполняет.
  open();
  key(h, 'Digit2');
  assert.equal(calls.length, 1, 'недоступное действие (1..9) не выполняется');
  assert.equal(bui.isActive(), true, 'оверлей остаётся открытым');
  // Клик по доступной строке (тач-сценарий, 000123).
  clickRow(h, findOverlay(h), 'a1');
  assert.equal(calls.length, 2, 'клик по строке выполняет действие');
  assert.deepEqual(calls[1], a1);
  assert.equal(bui.isActive(), false, 'после клика оверлей закрыт');
  // Клик по недоступной строке — не выполняет.
  open();
  clickRow(h, findOverlay(h), 'a2');
  assert.equal(calls.length, 2, 'клик по disabled-строке — без действия');
  assert.equal(bui.isActive(), true, 'оверлей остаётся открытым');
  // [Esc] — закрыть.
  key(h, 'Escape');
  assert.equal(bui.isActive(), false, '[Esc] закрывает оверлей');
});

test('B3. [E] end-to-end: постройка БЕЗ NPC — оверлей, apply(state), saveNow СРАЗУ, маркировка раз-в-день, HUD-подсказка, повторный [E] — закрыть, тот же день — заблокировано', async () => {
  // Проблема рунического камня (задача 000071): [E] на постройке без
  // NPC ничего не делал. Тест регистрирует СВОЮ временную запись
  // EFFECTS; РЕАЛЬНЫЕ записи (000074 '40', 000075 '41', 000077 '43')
  // НЕ затираются — save/restore в try/finally (критик, 000075).
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findBuilding(G, myMap, g.state.player, false);
  assert.ok(found, 'сценарий: найдена достижимая постройка без NPC');
  assert.ok(found.steps.length > 0, 'сценарий: путь до постройки не пуст');
  walkTo(h, found.steps);
  const st = g.state;
  const t = myMap.tileAt(st.player.x, st.player.y);
  assert.ok(t.hasBuilding, 'игрок стоит на тайле постройки');
  // 000075 (RESOLVE-БУГ): запись тайла — ПО buildingId (found.building
  // — решённая запись). Первая достижимая постройка без NPC в seed-мире
  // — (4,3), id 43 (подтип слота 10; базовая запись слота — 40 — НЕ
  // запись тайла). main.js обязан резолвить ТАК ЖЕ — иначе оверлей
  // увидит базовую запись и действие '43'/'41' не откроется.
  const b = found.building;
  assert.ok(b && !G.npcForBuilding(G.NpcData.NPCS, b.id),
    'постройка без NPC (id ' + (b && b.id) + ')');
  assert.equal(b.id, 43, 'golden: первая достижимая без NPC — id 43 (4,3)');
  const fxId = String(b.id);
  const applied = [];
  // Лимит — каталог (id 43: раз_в_день true, принцип 000053) И явный
  // флаг записи разВДень (fallback): оба источника активны. Без
  // флага — см. B12.
  const priorEntry = G.buildingEffects.EFFECTS[fxId];
  const hadEntry = Object.prototype.hasOwnProperty.call(
    G.buildingEffects.EFFECTS, fxId);
  G.buildingEffects.EFFECTS[fxId] = {
    имя: 'Тест-действие',
    разВДень: true,
    apply: (state) => {
      applied.push(state);
      return { ok: true, message: 'тест-эффект сработал' };
    },
  };
  try {
    // HUD-подсказка (ЕЩЁ до действия): эффекты есть, NPC нет.
    frameAt(h, NOW + 200);
    const hudLine = String(h.hud.textContent);
    assert.ok(hudLine.includes('([E] действия)'),
      'строка «Здесь:» — «([E] действия)»: ' + hudLine);
    assert.ok(hudLine.includes('  |  [E] действия'),
      'топ-строка — «  |  [E] действия»: ' + hudLine);
    // [E] → buildingUI (не npcUI — NPC нет).
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
    assert.equal(G.npcUI.isActive(), false, 'npcUI НЕ открывается');
    // Повторный [E] — закрыть.
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), false,
      'повторный [E] закрывает оверлей');
    // Снова [E] → Digit1 → apply + само-закрытие.
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), true, 'снова открыт');
    // Сейв до действия — без маркировки.
    const key1 = st.player.x + ',' + st.player.y + ':' + fxId;
    const saveBefore = readSave(h);
    assert.ok(saveBefore, 'сейв есть (saveNow после шага)');
    assert.equal((saveBefore.data.buildingOncePerDay || {})[key1],
      undefined, 'до действия маркировки нет');
    key(h, 'Digit1');
    assert.equal(G.buildingUI.isActive(), false,
      'оверлей закрывается после действия');
    assert.equal(applied.length, 1, 'apply вызвана ровно один раз');
    // apply(state): форма { day, tile, hero, save } (контракт 000072).
    const s = applied[0];
    assert.equal(typeof s.day, 'number', 'state.day — число');
    assert.equal(s.day, st.day, 'state.day — день мира');
    assert.equal(s.tile.x, st.player.x, 'state.tile — тайл героя');
    assert.equal(s.tile.y, st.player.y);
    assert.ok(s.hero, 'state.hero на месте');
    assert.ok(s.save && typeof s.save === 'object',
      'state.save — снимок (обычный объект)');
    // saveNow() СРАЗУ: маркировка в разделе сейва БЕЗ beforeunload
    // (фиксатор прецедента _lastUnkillDay, 000072).
    const saveAfter = readSave(h);
    assert.ok(saveAfter.data.buildingOncePerDay,
      'раздел buildingOncePerDay в сейве');
    assert.equal(saveAfter.data.buildingOncePerDay[key1], saveAfter.data.day,
      'маркировка «x,y:effectId» → день — ПРЯМО в сейве');
    // Лимит переживает «перезагрузку» (beforeunload → сейв).
    const fns = h.winListeners['beforeunload'];
    assert.ok(fns && fns.length, 'слушатель beforeunload зарегистрирован');
    for (const fn of fns) fn({});
    const saveFinal = readSave(h);
    assert.equal(saveFinal.data.buildingOncePerDay[key1],
      saveFinal.data.day, 'маркировка пережила «перезагрузку»');
    // hudFlash(message).
    frameAt(h, NOW + 400);
    assert.ok(String(h.hud.textContent).includes('тест-эффект сработал'),
      'hudFlash(message) эффекта виден в HUD');
    // Повторный [E] в тот же день — действие заблокировано.
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), true, 'оверлей открывается');
    const row = findRow(findOverlay(h), fxId);
    assert.ok(row, 'строка действия в оверлее');
    assert.equal(row.disabled, true,
      'использовано сегодня — строка disabled');
    key(h, 'Digit1');
    assert.equal(applied.length, 1, 'повторно в тот же день — НЕ выполнено');
    assert.equal(G.buildingUI.isActive(), true, 'оверлей остаётся открытым');
    key(h, 'Escape');
    assert.equal(G.buildingUI.isActive(), false);
  } finally {
    if (hadEntry) G.buildingEffects.EFFECTS[fxId] = priorEntry;
    else delete G.buildingEffects.EFFECTS[fxId];
  }
});

test('B4. [E]: постройка С NPC (без эффектов) — единый путь: сначала оверлей, Digit1 → npcUI (регрессия HUD-подсказки)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findBuilding(G, myMap, g.state.player, true);
  assert.ok(found, 'сценарий: найдена достижимая постройка с NPC');
  assert.ok(found.npc, 'NPC найден');
  walkTo(h, found.steps);
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  // РЕГРЕССИЯ: NPC без эффектов — ТЕКУЩИЙ текст HUD не меняется.
  assert.ok(hudLine.includes('  |  [E] диалог'),
    'топ-строка: «  |  [E] диалог»: ' + hudLine);
  assert.ok(hudLine.includes('  ([E] ' + found.npc.имя + ')'),
    'строка «Здесь:»: «  ([E] ' + found.npc.имя + ')»');
  // Единый путь (000071/000076): [E] → оверлей, НЕ прямой npcUI.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    'единый путь: сначала оверлей действий');
  assert.equal(G.npcUI.isActive(), false, 'npcUI НЕ открывается сразу');
  // Digit1 (первое действие — «Диалог») → npcUI с тем же NPC.
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрыт');
  assert.equal(G.npcUI.isActive(), true, 'диалог NPC открыт');
  const ov = findAll(h.body, '.npc-overlay')[0];
  assert.ok(ov, 'оверлей .npc-overlay подвешен к body');
  assert.ok(textOf(ov).includes(found.npc.имя),
    'диалог — того NPC, что у постройки (' + found.npc.имя + ')');
  // РЕГРЕССИЯ (ревью): повторный [E] при ОТКРЫТОМ диалоге закрывает
  // диалог — поведение master (в toggleNpcDialog проверка
  // npcUI.isActive() шла до открытия). Без неё buildingUI открывался
  // СВЕРХУ открытого npcUI — оба оверлея активны одновременно.
  key(h, 'KeyE');
  assert.equal(G.npcUI.isActive(), false,
    'повторный [E] закрывает открытый диалог');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей НЕ открывается поверх открытого диалога');
});

test('B5. [E]: постройка без NPC и без эффектов — ничего (текущее поведение сохранено)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  // 000077: первая постройка без NPC — (4,3), id 43 — ПОСЛЕ задачи
  // ИМЕТЬ эффекты (круг) — предикат «без эффектов» исключает её
  // (и 39/36–38/40/41/42): смысл («без NPC и без эффектов —
  // ничего») сохраняется; цель — следующая постройка без эффектов
  // (замерено: (36,-21), id 46).
  const found = findBuilding(G, myMap, g.state.player, false,
    (b) => !G.buildingEffects.hasEffects(b));
  assert.ok(found, 'сценарий: найдена достижимая постройка без NPC');
  walkTo(h, found.steps);
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  // Цель — без эффектов и без NPC: ни подсказки «[E] действия»,
  // ни «[E] диалог».
  assert.ok(!hudLine.includes('[E] действия'),
    'без эффектов — подсказки «[E] действия» нет: ' + hudLine);
  assert.ok(!hudLine.includes('[E] диалог'),
    'без NPC — подсказки «[E] диалог» нет: ' + hudLine);
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), false, 'buildingUI не открывается');
  assert.equal(G.npcUI.isActive(), false, 'npcUI не открывается');
});

test('B6. buildingUI открыт: движение заблокировано (keydown-гейт, как npcUI)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const pos0 = { x: g.state.player.x, y: g.state.player.y };
  assert.ok(G.buildingUI, 'Game.buildingUI существует');
  G.buildingUI.open({
    title: 'Тест', actions: [{ id: 'x', имя: 'Х', доступен: true }],
    onAction: () => {},
  });
  assert.equal(G.buildingUI.isActive(), true);
  const e = key(h, 'ArrowUp');
  keyup(h, 'ArrowUp');
  frameAt(h, NOW + 500);
  assert.equal(g.state.keys.length, 0,
    'клавиша движения НЕ принята при открытом оверлее');
  assert.equal(g.state.player.x, pos0.x, 'игрок не сдвинулся (x)');
  assert.equal(g.state.player.y, pos0.y, 'игрок не сдвинулся (y)');
  G.buildingUI.close();
  assert.equal(G.buildingUI.isActive(), false, 'close() работает');
});

test('B7. стек оверлеев: при открытии buildingUI панель персонажа закрывается', async () => {
  // Паттерн startCombat (main.js): полноэкранная панель не должна
  // накрывать мир вместе с оверлеем; Esc-гейт playerUI не знает про
  // buildingUI (ui.js — зона 000097), поэтому закрытие — нашей стороной.
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  // Постройка с NPC: единый путь даёт оверлей из одного «Диалог» —
  // открывается БЕЗ регистраций в (пустом) реестре.
  const found = findBuilding(G, myMap, g.state.player, true);
  assert.ok(found, 'сценарий: найдена достижимая постройка с NPC');
  walkTo(h, found.steps);
  assert.ok(G.playerUI, 'Game.playerUI существует');
  G.playerUI.toggle(true);
  assert.equal(G.playerUI.isOpen(), true, 'панель открыта');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'buildingUI открыт');
  assert.equal(G.playerUI.isOpen(), false,
    'buildingUI открыт → панель персонажа закрыта');
});

test('B8. стек оверлеев: открытие боя поверх buildingUI закрывает оверлей', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  assert.ok(G.buildingUI, 'Game.buildingUI существует');
  G.buildingUI.open({
    title: 'Тест', actions: [{ id: 'x', имя: 'Х', доступен: true }],
    onAction: () => {},
  });
  assert.equal(G.buildingUI.isActive(), true);
  const c = h.sandbox.__game.actions.startCombat(0);
  assert.ok(c, 'отладочный бой запущен');
  assert.equal(G.combatUI.isActive(), true, 'бой активен');
  assert.equal(G.buildingUI.isActive(), false,
    'buildingUI закрыт под боевым оверлеем (паттерн startCombat)');
});

test('B9. buildingUI: ↑↓ — курсор (wrap, пропускает недоступные), Enter — выполнить под курсором (10+ строк — альтернатива 1..9)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  assert.ok(G.buildingUI, 'Game.buildingUI существует');
  const bui = G.buildingUI;
  const mk = (id, avail = true, reason) =>
    ({ id, имя: 'Действие ' + id, доступен: avail, reason });
  const acts = [mk('x1', true), mk('x2', false, 'уже использовано сегодня'),
    mk('x3', true)];
  const calls = [];
  const open3 = () => bui.open({
    title: 'Курсор', actions: acts, onAction: (a) => calls.push(a.id),
  });

  open3();
  assert.equal(bui.isActive(), true, 'оверлей открыт');
  const ov = findOverlay(h);
  // Курсор — на ПЕРВОЙ доступной строке (маркер «▸ » в имени).
  assert.ok(textOf(findRow(ov, 'x1')).includes('▸'),
    'курсор на первой доступной строке (x1)');
  assert.ok(!textOf(findRow(ov, 'x2')).includes('▸'),
    'второй строки (x2) маркера нет');
  // ArrowDown — следующая доступная: x2 (недоступная) пропускается.
  key(h, 'ArrowDown');
  assert.ok(textOf(findRow(ov, 'x3')).includes('▸'),
    'ArrowDown пропускает недоступную строку (x2 → x3)');
  assert.ok(!textOf(findRow(ov, 'x2')).includes('▸'),
    'курсор НЕ встаёт на недоступную строку');
  // ArrowDown — wrap: с последней доступной на первую.
  key(h, 'ArrowDown');
  assert.ok(textOf(findRow(ov, 'x1')).includes('▸'),
    'wrap: с последней доступной — на первую');
  // ArrowUp — wrap в обратную сторону: на последнюю доступную.
  key(h, 'ArrowUp');
  assert.ok(textOf(findRow(ov, 'x3')).includes('▸'),
    'ArrowUp wrap: на последнюю доступную');
  // NumpadEnter — выполнить строку под курсором + само-закрытие.
  key(h, 'NumpadEnter');
  assert.deepEqual(calls, ['x3'], 'Enter выполняет строку под курсором');
  assert.equal(bui.isActive(), false, 'после Enter оверлей закрыт');

  // 10+ строк: 10-я строка НЕДОСТИЖИМА 1..9 — только ↑↓+Enter
  // (каталог открыт — длина списка не ограничена; оверлей единый,
  // последующие подзадачи его не трогают).
  const many = [];
  for (let i = 1; i <= 10; i++) many.push(mk('m' + i));
  const calls10 = [];
  bui.open({ title: '10 строк', actions: many,
    onAction: (a) => calls10.push(a.id) });
  for (let i = 0; i < 9; i++) key(h, 'ArrowDown');
  assert.equal(calls10.length, 0, 'стрелки сами по себе НЕ выполняют');
  assert.ok(textOf(findRow(findOverlay(h), 'm10')).includes('▸'),
    'курсор дошёл до 10-й строки (стрелками)');
  key(h, 'Enter');
  assert.deepEqual(calls10, ['m10'], '10-я строка — через ↑↓+Enter');
  assert.equal(bui.isActive(), false, 'после Enter оверлей закрыт');

  // Регрессия: 1..9 — прямое выполнение; недоступное — по-прежнему
  // не выполняется; [Esc] — закрыть.
  open3();
  key(h, 'Digit2');
  assert.equal(calls.length, 1, 'недоступное (цифра) — не выполняется');
  key(h, 'Digit1');
  assert.deepEqual(calls, ['x3', 'x1'], '1..9 — прямое выполнение');
  assert.equal(bui.isActive(), false, 'после цифры оверлей закрыт');
});

test('B10. apply → НЕ-ok: message — в hudFlash (не гаснет молча), без маркировки раз-в-день (ревью раунда 2)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findBuilding(G, myMap, g.state.player, false);
  assert.ok(found, 'сценарий: найдена достижимая постройка без NPC');
  walkTo(h, found.steps);
  const st = g.state;
  // 000075: запись — по buildingId (found.building), как в main.js.
  const b = found.building;
  const fxId = String(b.id);
  const applied = [];
  const priorEntry = G.buildingEffects.EFFECTS[fxId];
  const hadEntry = Object.prototype.hasOwnProperty.call(
    G.buildingEffects.EFFECTS, fxId);
  G.buildingEffects.EFFECTS[fxId] = {
    имя: 'Тест-отказ',
    apply: (state) => {
      applied.push(state);
      return { ok: false, message: 'тест: эффект отказался' };
    },
  };
  try {
    const key1 = st.player.x + ',' + st.player.y + ':' + fxId;
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
    key(h, 'Digit1');
    assert.equal(applied.length, 1, 'apply вызвана');
    assert.equal(G.buildingUI.isActive(), false, 'оверлей закрывается сам');
    // Отказ ВИДЕН: message — в hudFlash (до ревью раунда 2 message
    // неуспешного apply отбрасывался — нажатие умирало молча).
    frameAt(h, NOW + 200);
    assert.ok(String(h.hud.textContent).includes('тест: эффект отказался'),
      'message неуспешного apply виден в HUD');
    // Эффект не сработал — без маркировки раз-в-день (успешный apply
    // С флагом разВДень помечал бы этот же ключ — B3; у этой записи
    // флага нет: без маркировки и успех, и отказ — B12).
    const saveAfter = readSave(h);
    const m = saveAfter.data.buildingOncePerDay;
    assert.ok(m == null || m[key1] == null,
      'неудавшееся действие НЕ маркируется раз-в-день');
  } finally {
    if (hadEntry) G.buildingEffects.EFFECTS[fxId] = priorEntry;
    else delete G.buildingEffects.EFFECTS[fxId];
  }
});

test('B11. available?(state) end-to-end: строка disabled + reason, нажатие не доходит до apply (ревью раунда 2)', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findBuilding(G, myMap, g.state.player, false);
  assert.ok(found, 'сценарий: найдена достижимая постройка без NPC');
  walkTo(h, found.steps);
  const st = g.state;
  // 000075: запись — по buildingId (found.building), как в main.js.
  const b = found.building;
  const fxId = String(b.id);
  const applied = [];
  const priorEntry = G.buildingEffects.EFFECTS[fxId];
  const hadEntry = Object.prototype.hasOwnProperty.call(
    G.buildingEffects.EFFECTS, fxId);
  G.buildingEffects.EFFECTS[fxId] = {
    имя: 'Тест-молчит',
    available: () => 'тест: круг молчит',
    apply: () => {
      applied.push(1);
      return { ok: true, message: 'не должно выполниться' };
    },
  };
  try {
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
    const row = findRow(findOverlay(h), fxId);
    assert.ok(row, 'строка действия в оверлее');
    assert.equal(row.disabled, true,
      'недневная недоступность — строка disabled (не «доступно»)');
    assert.ok(textOf(row).includes('тест: круг молчит'),
      'reason available виден в строке');
    key(h, 'Digit1');
    assert.equal(applied.length, 0, 'недоступное действие НЕ вызывает apply');
    assert.equal(G.buildingUI.isActive(), true, 'оверлей остаётся открытым');
    key(h, 'Escape');
    assert.equal(G.buildingUI.isActive(), false);
  } finally {
    if (hadEntry) G.buildingEffects.EFFECTS[fxId] = priorEntry;
    else delete G.buildingEffects.EFFECTS[fxId];
  }
});

test('B12. раз-в-день: эффект БЕЗ флага — повторяем в тот же день (контракт плана 000064, ревью раунда 3)', async () => {
  // «Фонтан: исцеление лимит / монета — нет». До ревью раунда 3
  // implicit «есть apply → лимит» блокировал повторное нажатие
  // в тот же день; маркировки buildingOncePerDay быть НЕ должно.
  // Задача 000076: цель — постройка БЕЗ каталожного раз_в_день
  // (принцип 000053: каталог побеждает над записью реестра). Первая
  // достижимая без NPC — с флагом в каталоге (id 43), и храмы 36/38
  // — тоже (000076) — поэтому findBuildingNoDailyLimit (BFS по записи
  // роутера, без пина конкретного id).
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findBuildingNoDailyLimit(G, myMap, g.state.player);
  assert.ok(found, 'сценарий: найдена постройка без NPC и без ' +
    'каталожного раз_в_день');
  walkTo(h, found.steps);
  const st = g.state;
  // 000075: запись — по buildingId (found.building), как в main.js.
  const b = found.building;
  const fxId = String(b.id);
  const applied = [];
  const priorEntry = G.buildingEffects.EFFECTS[fxId];
  const hadEntry = Object.prototype.hasOwnProperty.call(
    G.buildingEffects.EFFECTS, fxId);
  G.buildingEffects.EFFECTS[fxId] = {
    имя: 'Тест-монета',
    apply: () => {
      applied.push(1);
      return { ok: true, message: 'монета +1' };
    },
  };
  try {
    const key1 = st.player.x + ',' + st.player.y + ':' + fxId;
    // Первое нажатие.
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
    key(h, 'Digit1');
    assert.equal(applied.length, 1, 'первый apply');
    assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
    // ВТОРОЕ нажатие в тот же день — строка доступна, apply снова.
    key(h, 'KeyE');
    assert.equal(G.buildingUI.isActive(), true, 'оверлей открывается');
    const row = findRow(findOverlay(h), fxId);
    assert.ok(row, 'строка действия в оверлее');
    assert.equal(row.disabled, false,
      'без флага — НЕ заблокировано в тот же день');
    key(h, 'Digit1');
    assert.equal(applied.length, 2,
      'повторно в тот же день — ВЫПОЛНЕНО (без флага)');
    // Маркировки раз-в-день в сейве нет.
    const saveAfter = readSave(h);
    const m = saveAfter.data.buildingOncePerDay;
    assert.ok(m == null || m[key1] == null,
      'без флага — ключ «x,y:effectId» не пишется в сейв');
  } finally {
    if (hadEntry) G.buildingEffects.EFFECTS[fxId] = priorEntry;
    else delete G.buildingEffects.EFFECTS[fxId];
  }
});

// --- Задача 000075: телепорт-круг — wiring E2E (секция B13+) ---
//
// ФАКТЫ seed-МИРА (детерминированный: map.png onerror →
// G.generateSeedPixels, фикс. сид; проверено пробом BFS из спавна
// (0,0) — при смене генерации мира эти goldens требуют пересмотра,
// тесты упадут ВИДИМО):
//   * ближайший от спавна круг id 41 — (-17, 36) (61 шаг);
//   * его пара — '25,-50' (Чебышев 86 ≤ R=100; в окне R других кругов
//     нет — пара ЕДИНСТВЕННЫЙ кандидат, тай-брейк не нужен);
//   * все 8 footprint-соседей пары (25,-50) проходимы, без построек
//     и групп мобов; DEST '24,-51' — первый из кольца (golden B14);
//   * кругов id 41 в мире 29 — все, КРОМЕ (314,-27), имеют пару
//     (у него — «спит»; в стандартном мире «спящий» круг
//     недостижимым путём — B15 покрывает pre-seeded сейвом).

const CIRCLE_KEY = '-17,36';
const CIRCLE = { x: -17, y: 36 };
const PAIR_KEY = '25,-50';
const PAIR = { x: 25, y: -50 };
const DEST = '24,-51';

test('B13. телепорт E2E: первый подход — скан, пара в сейве (golden); активация — списание ИЗ КАТАЛОГА, перенос на dest, active, снап мувера, hudFlash', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // СЦЕНАРИЙ: ближайший круг id 41 (BFS-предикат по РЕШЁННОЙ записи).
  const found = findBuilding(G, myMap, g.state.player, false,
    (b) => b.id === 41);
  assert.ok(found, 'сценарий: найдена достижимая постройка id 41');
  assert.equal(found.building.id, 41,
    'запись РЕШЕНА по buildingId (не базовая запись слота 10 → 40)');
  assert.equal(found.tile.x, CIRCLE.x, 'golden: ближайший круг — x');
  assert.equal(found.tile.y, CIRCLE.y, 'golden: ближайший круг — y');
  walkTo(h, found.steps);
  const goldBefore = g.state.hero.gold; // 100 (старт героя, player.js)
  // HUD-подсказка ДО действия: bHere — по buildingId → эффекты есть.
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  assert.ok(hudLine.includes('([E] действия)'),
    'строка «Здесь:» — «([E] действия)»: ' + hudLine);
  // [E] → СКАН при ПЕРВОМ подходе: сразу после открытия оверлея в
  // сейве (saveNow) — пара (golden) + dest + active:false.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен');
  // Заголовок — имя САМОГО круга (не базовое «рунический камень»
  // слота; регистр не зафиксирован — сравнение в нижнем).
  assert.ok(String(textOf(ov)).toLowerCase().includes('телепорт-круг'),
    'заголовок оверлея — имя круга: ' + textOf(ov));
  const saveScan = readSave(h);
  assert.ok(saveScan.data.teleports,
    'раздел teleports в сейве (скан при первом подходе)');
  const eScan = saveScan.data.teleports[CIRCLE_KEY];
  assert.ok(eScan, 'запись круга (-17,36) в разделе');
  assert.equal(eScan.pair, PAIR_KEY, 'golden: пара круга (-17,36)');
  assert.ok(typeof eScan.dest === 'string' && eScan.dest !== 'null' &&
    eScan.dest !== '', 'dest вычислен (проходимый тайл рядом с парой)');
  assert.equal(eScan.active, false, 'ещё не активирован');
  const row = findRow(ov, '41');
  assert.ok(row, 'строка действия 41 в оверлее');
  assert.equal(row.disabled, false, 'пара найдена — строка доступна');
  // Digit1 → apply (ok) + перенос: списание, перенос, active, saveNow.
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрывается после действия');
  // Игрок — на dest (ИЗ сейва-кэша скана): dest проходим, не в
  // постройке, без группы мобов, в footprint-соседстве пары.
  const pos = g.state.player;
  const [dx, dy] = String(eScan.dest).split(',').map(Number);
  assert.equal(pos.x, dx, 'перенос: игрок на dest (x)');
  assert.equal(pos.y, dy, 'перенос: игрок на dest (y)');
  const tDest = myMap.tileAt(dx, dy);
  assert.ok(tDest.passable && !tDest.inBuilding && !tDest.hasMobGroup,
    'dest — проходимый тайл, не постройка, без группы мобов');
  assert.equal(Math.max(Math.abs(dx - PAIR.x), Math.abs(dy - PAIR.y)), 1,
    'dest — в footprint-соседстве пары (25,-50)');
  // Списание: стоимость ИЗ КАТАЛОГА (000041.особые_параметры.эффект.
  // стоимость), не хардкод в main.js/тесте.
  const cost = G.getBuilding(41).особые_параметры.эффект.стоимость;
  assert.equal(typeof cost, 'number',
    'каталог 41: стоимость — число (поле эффект — объект, 000075)');
  assert.equal(g.state.hero.gold, goldBefore - cost,
    'золото: разовое списание стоимости ИЗ КАТАЛОГА');
  // active — в сейве (saveNow сразу после действия; переживёт
  // перезагрузку — повтор бесплатно, B14).
  const saveAfter = readSave(h);
  assert.equal(saveAfter.data.teleports[CIRCLE_KEY].active, true,
    'активирован — active:true в сейве');
  assert.equal(saveAfter.data.teleports[CIRCLE_KEY].pair, PAIR_KEY,
    'пара не изменилась');
  // Снап мувера (mover.teleport, паттерн restoreFromSave):
  // playerRender == player — персонаж не «скользит» от старой точки.
  const pr = g.state.playerRender;
  assert.equal(pr.x, pos.x, 'снап мувера (x)');
  assert.equal(pr.y, pos.y, 'снап мувера (y)');
  // hudFlash (сообщение успеха — зафиксировано A32/TELEPORT_MSG).
  frameAt(h, NOW + 400);
  assert.ok(String(h.hud.textContent).includes(TELEPORT_MSG),
    'hudFlash сообщения переноса виден в HUD');
});

test('B14. телепорт: повторная активация — НЕ списывает (pre-seeded сейв: active:true, повторного скана нет)', async () => {
  // Сейв ДОСЕЯН до запуска цепочки (restoreFromSave читает его при
  // boot): позиция — на круге, запись телепорта — active:true.
  // hero в сейве НЕТ — персонаж по умолчанию (золото 100).
  const h = await boot(seedSave({
    day: 1,
    position: { x: CIRCLE.x, y: CIRCLE.y },
    teleports: {
      [CIRCLE_KEY]: { pair: PAIR_KEY, dest: DEST, active: true },
    },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, CIRCLE.x, 'позиция сейва — круг (x)');
  assert.equal(g.state.player.y, CIRCLE.y, 'позиция сейва — круг (y)');
  // Pre-seeded dest — валиден в мире (проходим, не постройка, без
  // мобов, footprint-соседство пары).
  const [dx, dy] = DEST.split(',').map(Number);
  const tD = myMap.tileAt(dx, dy);
  assert.ok(tD.passable && !tD.inBuilding && !tD.hasMobGroup,
    'pre-seeded dest валиден в мире');
  assert.equal(Math.max(Math.abs(dx - PAIR.x), Math.abs(dy - PAIR.y)), 1,
    'dest — в footprint-соседстве пары');
  // Сейв в хранилище — досеянный (restoreFromSave НЕ вызывает
  // saveNow, 000031).
  const text0 = h.storage.getItem(SAVE_KEY);
  assert.ok(text0, 'сейв в хранилище (досеянный)');
  const goldBefore = g.state.hero.gold;
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const row = findRow(findOverlay(h), '41');
  assert.ok(row, 'строка действия 41 в оверлее');
  assert.equal(row.disabled, false,
    'пара в сейве — строка доступна (БЕЗ повторного скана)');
  // ПОВТОРНОГО скана нет: ключ в сейве — saveNow при открытии
  // оверлея НЕ вызывается (скан переписал бы сейв — savedAt
  // изменился; текст хранилища неизменен).
  assert.equal(h.storage.getItem(SAVE_KEY), text0,
    'при открытии оверлея saveNow нет (кэш в сейве — скана нет)');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  assert.equal(g.state.player.x, dx, 'перенос на dest (x)');
  assert.equal(g.state.player.y, dy, 'перенос на dest (y)');
  assert.equal(g.state.hero.gold, goldBefore,
    'повторная активация — НЕ списывает (gold неизменен)');
  const saveAfter = readSave(h);
  assert.equal(saveAfter.data.teleports[CIRCLE_KEY].active, true,
    'active не изменился (true → true)');
  assert.deepEqual(saveAfter.data.teleports,
    JSON.parse(text0).data.teleports,
    'раздел teleports не переписан (повторного скана нет)');
});

test('B15. телепорт «спит» E2E (pre-seed pair:null): строка disabled с reason, Digit1 — НЕ выполнено', async () => {
  // «Спящий» круг в стандартном seed-мире отсутствует (все ближние
  // круги имеют пары) — сценарий покрывается pre-seeded сейвом
  // (pair:null — круг без пары в радиусе; результат скана).
  const h = await boot(seedSave({
    day: 1,
    position: { x: CIRCLE.x, y: CIRCLE.y },
    teleports: {
      [CIRCLE_KEY]: { pair: null, dest: null, active: false },
    },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, CIRCLE.x, 'позиция сейва — круг');
  const goldBefore = g.state.hero.gold;
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const row = findRow(findOverlay(h), '41');
  assert.ok(row, 'строка действия 41 в оверлее');
  assert.equal(row.disabled, true, '«спит» — строка disabled');
  assert.ok(textOf(row).includes('круг молчит: нет пары вблизи'),
    'reason «спит» виден в строке: ' + textOf(row));
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), true,
    'оверлей остаётся открытым (действие НЕ выполнено)');
  assert.equal(g.state.player.x, CIRCLE.x, 'переноса нет (x)');
  assert.equal(g.state.player.y, CIRCLE.y, 'переноса нет (y)');
  assert.equal(g.state.hero.gold, goldBefore, 'золото не потрачено');
  const saveAfter = readSave(h);
  assert.equal(saveAfter.data.teleports[CIRCLE_KEY].active, false,
    'active не изменился');
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
});

test('B16. телепорт «нет проходимого» E2E (pre-seed pair, dest:null): строка доступна; Digit1 — hudFlash, без переноса, без списания, раздел не изменён', async () => {
  // Пара найдена (pair: '25,-50'), но при скане проходимого тайла
  // рядом не оказалось (dest: null) — перенос невозможен: отказ
  // apply, золото НЕ тратится, сейв не переписывается (saveNow
  // только при ok — контракт 000071).
  const h = await boot(seedSave({
    day: 1,
    position: { x: CIRCLE.x, y: CIRCLE.y },
    teleports: {
      [CIRCLE_KEY]: { pair: PAIR_KEY, dest: null, active: false },
    },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, CIRCLE.x, 'позиция сейва — круг');
  const goldBefore = g.state.hero.gold;
  const text0 = h.storage.getItem(SAVE_KEY);
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const row = findRow(findOverlay(h), '41');
  assert.ok(row, 'строка действия 41 в оверлее');
  assert.equal(row.disabled, false,
    'пара в сейве — строка доступна (dest проверит apply)');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрывается (действие выполнено — apply not-ok)');
  frameAt(h, NOW + 200);
  assert.ok(
    String(h.hud.textContent).includes(
      'нет проходимого тайла рядом с парным кругом'),
    'message отказа в hudFlash (не гаснет молча)');
  assert.equal(g.state.player.x, CIRCLE.x, 'переноса нет (x)');
  assert.equal(g.state.player.y, CIRCLE.y, 'переноса нет (y)');
  assert.equal(g.state.hero.gold, goldBefore, 'золото НЕ списано');
  assert.equal(h.storage.getItem(SAVE_KEY), text0,
    'apply not-ok → saveNow нет: сейв (раздел teleports) не изменён');
});

// --- Задача 000076: e2e — благословения храмов и «Сон» луны ---
//
// Мир детерминированный (фикс. сид, замерено сканом): храмы —
// подтипы слота 8 (000073), ищутся по t.buildingId:
//   36 (солнце, NPC Элдира) — ближайший достижимый (7,30), 39 шагов;
//   38 (гора, NPC нет)      — (50,3), 55 шагов;
//   37 (луна, NPC нет)      — (41,-19), 60 шагов (BFS от спавна (0,0);
//     карта БЕСКОНЕЧНА — период 256x256, спавн не в углу, 000056);
//   39 (заброшенный) — 000077, здесь не покрывается.
// Ближайший вход в пещеру к (41,-19) — (44,-1) (buildingId 31, трава,
// alpha 166; dungeonTypeFor → «простая пещера»), дистанция Чебышёва
// 18, единственен (без тай-брейка); развалины (48) — не кандидаты.
// Окно moonDreamHint ЦЕНТРИРОВАНО на храме (ревью раунд 1): (44,-1)
// ВНЕ пиксельной сетки [0,256)² (y=-1) — старое окно [0,256)² дало
// бы (72,9), д. 31, — НЕ истинно ближайший. Координаты замерены на
// базе мастер-сборки worktree (см. memory/000076-temple-blessings.md).
//
// КРАСНОЕ до реализации: реестра '36'/'37'/'38' нет, роутер [E]
// (main.js) использует запись БАЗОВУЮ слота (36) — у 37/38 свои
// действия не появятся (переключение на t.buildingId — часть задачи),
// c.buffMods в бое нет, data.buffs не пишется действием.

test('B17. «Благословение» e2e: храм солнца (36) — «Диалог» (Элдира) ПЕРВЫМ, затем «Благословение»: buffs в сейве, маркировка раз-в-день, buffMods в бою', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findTempleById(G, myMap, g.state.player, 36);
  assert.ok(found, 'сценарий: достижимый храм солнца (buildingId 36)');
  assert.ok(found.steps.length > 0, 'сценарий: путь не пуст');
  walkTo(h, found.steps);
  const st = g.state;
  const t = myMap.tileAt(st.player.x, st.player.y);
  assert.equal(t.buildingId, 36, 'игрок на храме солнца');
  const key1 = st.player.x + ',' + st.player.y + ':36';
  // HUD: NPC (Элдира) + эффект — топ-строка «[E] диалог»,
  // «Здесь:» — диалог + действия (запись '36' в реестре).
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  assert.ok(hudLine.includes('[E] диалог'),
    'топ-строка «  |  [E] диалог»: ' + hudLine);
  assert.ok(hudLine.includes('([E] Элдира, действия)'),
    '«Здесь:» — диалог + действия: ' + hudLine);
  // [E] → buildingUI (НЕ прямой npcUI).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  assert.equal(G.npcUI.isActive(), false, 'npcUI НЕ открывается сразу');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.deepEqual(
    findAll(ov, '[data-buid]').map((r) => r.dataset.buid),
    ['dialog', '36'],
    'строки: «Диалог» (Элдира) ПЕРВЫМ, затем «Благословение» (36)');
  // До действия — благословений в сейве нет.
  const saveBefore = readSave(h);
  assert.ok(saveBefore.data.buffs == null
    || saveBefore.data.buffs.length === 0,
    'до действия в data.buffs пусто');
  // Digit2 — «Благословение» (первая строка — диалог, B20).
  key(h, 'Digit2');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 400);
  assert.ok(String(h.hud.textContent).match(/благословение/i),
    'hudFlash «Благословение…»: ' + String(h.hud.textContent));
  // Сейв СРАЗУ (saveNow): data.buffs + data.buildingOncePerDay.
  const save = readSave(h);
  assert.deepEqual(save.data.buffs,
    [{
      source: st.player.x + ',' + st.player.y, day: st.day, kind: 'damage',
    }], 'data.buffs — благословение солнца (kind damage) в сейве');
  assert.equal(save.data.buildingOncePerDay[key1], st.day,
    'маркировка «x,y:36» → день (раз_в_день из каталога)');
  // Повторный [E] в тот же день — строка disabled (лимит).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'оверлей открывается');
  const row = findRow(findOverlay(h), '36');
  assert.ok(row, 'строка «Благословение» в оверлее');
  assert.equal(row.disabled, true, 'использовано сегодня — disabled');
  assert.ok(textOf(row).includes('уже использовано сегодня'),
    'reason виден в строке');
  key(h, 'Escape');
  // Благословение действует во ВСЕХ боях дня: отладочный бой →
  // c.buffMods (wiring main.js → combat-ui.js → createCombat).
  const c = g.actions.startCombat(3);
  assert.ok(c, 'отладочный бой запущен');
  // c.buffMods — объект из vm-песочницы (чужой realm): deepStrictEqual
  // сравнивает Object.prototype между realm'ами и падает даже на
  // равных по структуре — сравнение через JSON-нормализацию
  // (контракт — точные значения).
  assert.deepEqual(JSON.parse(JSON.stringify(c.buffMods)),
    { damageMult: 1.05, armor: 0 },
    'бой получил buffMods (солнце: ×1.05 урона, броня 0)');
});

test('B18. «Благословение» e2e: храм горы (38) — NPC нет («Диалог» отсутствует), kind armor: buffMods {1, 1}', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findTempleById(G, myMap, g.state.player, 38);
  assert.ok(found, 'сценарий: достижимый храм горы (buildingId 38)');
  walkTo(h, found.steps);
  const st = g.state;
  const t = myMap.tileAt(st.player.x, st.player.y);
  assert.equal(t.buildingId, 38, 'игрок на храме горы');
  const key1 = st.player.x + ',' + st.player.y + ':38';
  // HUD: жреца у 38 в каталоге NPC нет — «[E] действия»,
  // НЕ «[E] диалог» (без переключения роутера на buildingId здесь
  // показался бы «[E] диалог» Элдиры — запись базовой 36).
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  assert.ok(hudLine.includes('[E] действия'),
    'топ-строка «  |  [E] действия»: ' + hudLine);
  assert.ok(!hudLine.includes('[E] диалог'),
    'NPC нет — «[E] диалог» нет: ' + hudLine);
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  assert.equal(G.npcUI.isActive(), false, 'npcUI не открывается');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.deepEqual(
    findAll(ov, '[data-buid]').map((r) => r.dataset.buid),
    ['38'], 'ровно ОДНА строка: «Благословение» (38), «Диалога» нет');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 400);
  const save = readSave(h);
  assert.deepEqual(save.data.buffs,
    [{
      source: st.player.x + ',' + st.player.y, day: st.day, kind: 'armor',
    }], 'data.buffs — благословение горы (kind armor)');
  assert.equal(save.data.buildingOncePerDay[key1], st.day,
    'маркировка «x,y:38» → день');
  key(h, 'KeyE');
  const row = findRow(findOverlay(h), '38');
  assert.equal(row.disabled, true, 'использовано сегодня — disabled');
  key(h, 'Escape');
  const c = g.actions.startCombat(3);
  assert.ok(c, 'отладочный бой запущен');
  // JSON-нормализация: c.buffMods — из vm-песочницы (чужой realm,
  // см. комментарий в B13).
  assert.deepEqual(JSON.parse(JSON.stringify(c.buffMods)),
    { damageMult: 1, armor: 1 },
    'бой получил buffMods (гора: +1 броня)');
});

test('B19. «Сон» e2e: храм луны (37) — подсказка: ближайший вход (не развалины) + тип подземелья; лимита раз-в-день НЕТ', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findTempleById(G, myMap, g.state.player, 37);
  assert.ok(found, 'сценарий: достижимый храм луны (buildingId 37)');
  walkTo(h, found.steps);
  const st = g.state;
  const t = myMap.tileAt(st.player.x, st.player.y);
  assert.equal(t.buildingId, 37, 'игрок на храме луны');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.deepEqual(
    findAll(ov, '[data-buid]').map((r) => r.dataset.buid),
    ['37'], 'ровно ОДНА строка: «Сон» (37)');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 400);
  const hudLine = String(h.hud.textContent);
  // Детерминированная карта: храм (41,-19) → ближайший вход (44,-1)
  // (buildingId 31, трава, alpha 166 → dungeonTypeFor: «простая
  // пещера»), д. Чебышёва 18, единственен (замерено, см. шапку;
  // вход ВНЕ сетки [0,256)² — окно подсказки центрировано на храме,
  // ревью раунд 1).
  assert.ok(hudLine.includes('(44, -1)'),
    'подсказка — координаты ближайшего входа: ' + hudLine);
  assert.ok(hudLine.includes('простая пещера'),
    'подсказка — имя типа (DUNGEON_NAMES): ' + hudLine);
  // Лимита НЕТ (флага раз_в_день в каталоге 37 нет):
  // маркировки в сейве нет, повтор в тот же день — доступен.
  const save = readSave(h);
  assert.ok(save.data.buildingOncePerDay[
    st.player.x + ',' + st.player.y + ':37'] == null,
    'маркировки раз-в-день НЕТ (подсказка бесплатна)');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'оверлей открывается снова');
  const row = findRow(findOverlay(h), '37');
  assert.equal(row.disabled, false, 'в тот же день — ДОСТУПНО (без лимита)');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false,
    'повторный «Сон» в тот же день — выполняется');
  frameAt(h, NOW + 600);
  assert.ok(String(h.hud.textContent).includes('(44, -1)'),
    'повторная подсказка — та же (детерминированно)');
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
});

test('B20. регрессия храма солнца: «Диалог» с Элдирой — ПЕРВАЯ строка (npcUI), «Благословение» — независимое действие', async () => {
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findTempleById(G, myMap, g.state.player, 36);
  assert.ok(found, 'сценарий: достижимый храм солнца (36)');
  walkTo(h, found.steps);
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  const ov = findOverlay(h);
  const rows = findAll(ov, '[data-buid]');
  assert.deepEqual(rows.map((r) => r.dataset.buid),
    ['dialog', '36'], '«Диалог» — ПЕРВАЯ строка');
  assert.equal(rows[0].disabled, false, '«Диалог» доступен');
  key(h, 'Digit1'); // «Диалог»
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  assert.equal(G.npcUI.isActive(), true, 'открыт диалог npcUI');
  const nov = findAll(h.body, '.npc-overlay')[0];
  assert.ok(nov && textOf(nov).includes('Элдира'),
    'диалог — Элдира (NPC храма солнца, постройки [20, 36])');
  // Повторный [E] закрывает диалог (регрессия B4).
  key(h, 'KeyE');
  assert.equal(G.npcUI.isActive(), false, 'повторный [E] закрыл диалог');
  // «Благословение» — независимое действие: доступно после диалога.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'оверлей открывается снова');
  const row = findRow(findOverlay(h), '36');
  assert.ok(row, 'строка «Благословение» есть');
  assert.equal(row.disabled, false,
    '«Благословение» — доступно (действия независимы)');
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
});

// --- Задача 000074: камень (40) + обелиск (42) — wiring E2E (B21+) ---
// Золотые (детерминированный seed-мир, замерено; контракты —
// memory/000074-rune-stone-obelisk.md):
//   * камень id 40 — (-25, 34), 71 шаг от спавна (БЛИЖАЙШИЙ);
//   * обелиск id 42 — (80, -51), 131 шаг (B22/B23 — позиция
//     PRE-SEED'ом на тайле, паттерн B14; тайл проходим);
//   * ролл камня (-25,34) при runes 5 (chance 0.5): день 1 — провал
//     (0.695932), день 2 — успех (0.499819);
//   * фрагменты: камень (-25,34) день 2 — T40[2]; обелиск (80,-51)
//     день 1 — T42[2], день 2 — T42[1].
const STONE_KEY = '-25,34';
const OBELISK_KEY = '80,-51';
const OBELISK_QID = 'obelisk_touch_80_-51';
const STONE_FAIL_MSG = 'Расшифровка: руны молчат — попытка сгорела.';
const STONE_TEXT_D2 =
  '…число девять повторено трижды — это не совпадение, это приказ…';
const OBELISK_TEXT_D1 =
  '…каждое прикосновение к обелиску — вопрос; мир отвечает опытом…';
const OBELISK_TEXT_D2 =
  '…наследники Флогистона научились читать камни, но не научились их замолчать…';

test('B21. камень e2e: [E] «Расшифровать», исход по (tile, day), попытка сгорела, daily-марка, смена дня', async () => {
  // Позиция PRE-SEED'ом на камне (паттерн B14): ХОД к камню (71 шаг)
  // при steps_per_day=40 СМЕНИЛ БЫ ДЕНЬ (день 1 → 2) и сломал бы
  // golden-исходы; pre-seed держит день 1.
  const h = await boot(seedSave({
    day: 1,
    position: { x: -25, y: 34 },
    hero: mkHero({ secondary: { runes: 5, scholar: 5 } }),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // Голден: ближайший камень — (-25, 34), 71 шаг от спавна (0,0) —
  // BFS-пин (сценарий достижимости; ходим по сейву, а не шагами).
  const found = findBuilding(G, myMap, { x: 0, y: 0 }, false,
    (b) => b.id === 40);
  assert.ok(found, 'сценарий: достижимый камень (id 40)');
  assert.equal(found.building.id, 40,
    'запись резолвлена по buildingId');
  assert.equal(found.tile.x, -25, 'golden: x камня');
  assert.equal(found.tile.y, 34, 'golden: y камня');
  assert.equal(found.steps.length, 71, 'golden: 71 шаг от спавна');
  assert.equal(g.state.player.x, -25, 'позиция сейва — камень (x)');
  assert.equal(g.state.player.y, 34, 'позиция сейва — камень (y)');
  assert.equal(g.state.day, 1, 'день 1 (pre-seed)');
  assert.equal(g.state.hero.xp, 0, 'hero: xp 0 до действия');
  // HUD: «Здесь: рунический камень  ([E] действия)».
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  assert.ok(hudLine.includes('[E] действия'),
    'топ-строка «([E] действия)» (red: у 40 нет эффектов → нет '
    + 'хинта): ' + hudLine);
  // [E] → оверлей: заголовок, строка «Расшифровать».
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.ok(String(textOf(ov)).toLowerCase().includes('рунический камень'),
    'заголовок оверлея: ' + textOf(ov));
  const row = findRow(ov, '40');
  assert.ok(row, 'строка 40 в оверлее (red: нет записи «40» → строки нет)');
  assert.ok(textOf(row).includes('Расшифровать'),
    'имя строки: «Расшифровать»');
  assert.equal(row.disabled, false, 'день 1 — доступно');
  // Digit1 — ДЕНЬ 1: ПРОВАЛ (golden-ролл 0.695932 ≥ 0.5): message,
  // XP нет, НО попытка сгорела (ok:true) — daily-марка + saveNow.
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 400);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes(STONE_FAIL_MSG),
    'hudFlash — message провала: ' + hud1);
  assert.equal(g.state.hero.xp, 0, 'провал — XP не изменился');
  const saveF = readSave(h);
  assert.ok(saveF, 'saveNow — сразу после действия');
  assert.equal(saveF.data.hero.totalXp, 0, 'провал — totalXp нет');
  assert.equal(saveF.data.buildingOncePerDay[STONE_KEY + ':40'], 1,
    'провал — попытка сгорела: daily-марка (R3)');
  // Повтор в тот же день — disabled.
  key(h, 'KeyE');
  const rowSame = findRow(findOverlay(h), '40');
  assert.equal(rowSame.disabled, true, 'в тот же день — disabled');
  assert.ok(textOf(rowSame).includes('уже использовано сегодня'),
    'reason «уже использовано сегодня»: ' + textOf(rowSame));
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
  // День 2 — доступно (golden-ролл 0.499819 < 0.5 — успех).
  g.actions.setDay(2);
  key(h, 'KeyE');
  const row2 = findRow(findOverlay(h), '40');
  assert.equal(row2.disabled, false, 'день 2 — доступно');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 600);
  const hud2 = String(h.hud.textContent);
  assert.ok(hud2.includes('Расшифровка: успех (+25 оп.)'),
    'hudFlash — успех + XP: ' + hud2);
  assert.ok(hud2.includes(STONE_TEXT_D2),
    'hudFlash: фрагмент из каталога (golden день 2): ' + hud2);
  assert.equal(g.state.hero.xp, 25,
    'XP = 25 = round((10 + 2·5)·1.25) (A45; НЕ 28 — xpMult не '
    + 'применяется)');
  const saveS = readSave(h);
  assert.equal(saveS.data.hero.totalXp, 25,
    'totalXp — вестись (R4: grantXpRaw — зеркало addXp)');
  assert.equal(saveS.data.buildingOncePerDay[STONE_KEY + ':40'], 2,
    'марка → день 2');
});

test('B22. обелиск e2e: «Прикоснуться» — XP + лор + выдача квеста (source «building»)', async () => {
  const h = await boot(seedSave({
    day: 1,
    position: { x: 80, y: -51 },
    hero: mkHero({ level: 3, secondary: { scholar: 5 } }),
    quests: { active: {}, done: [] },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, 80, 'позиция сейва — обелиск (x)');
  assert.equal(g.state.player.y, -51, 'позиция сейва — обелиск (y)');
  assert.equal(myMap.tileAt(80, -51).buildingId, 42,
    'на тайле — обелиск');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.ok(String(textOf(ov)).toLowerCase().includes('обелиск'),
    'заголовок оверлея: ' + textOf(ov));
  const row = findRow(ov, '42');
  assert.ok(row, 'строка 42 в оверлее (red: нет записи «42» → строки нет)');
  assert.ok(textOf(row).includes('Прикоснуться'),
    'имя строки: «Прикоснуться»');
  assert.equal(row.disabled, false, 'день 1 — доступно');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 200);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes('Обелиск: +12 оп.'),
    'hudFlash: XP = round((5 + 2·3)·1.1) = 12 (A46): ' + hud1);
  assert.ok(hud1.includes(OBELISK_TEXT_D1),
    'hudFlash: лор-фрагмент (голен день 1): ' + hud1);
  assert.ok(hud1.includes('Квест получен: Камни помнят'),
    'hudFlash: выдача квеста (название из каталога): ' + hud1);
  assert.equal(g.state.hero.xp, 12,
    'XP = 12 (Учёный 5 действует на формулу обелиска)');
  // Раздел сейва: buildingQuests — source of truth (имя — 000072).
  const save1 = readSave(h);
  assert.deepEqual(save1.data.buildingQuests[OBELISK_KEY],
    { questId: OBELISK_QID, day: 1, status: 'active' },
    'buildingQuests: запись active (red: раздела нет)');
  assert.equal(save1.data.buildingOncePerDay[OBELISK_KEY + ':42'], 1,
    'daily-марка');
  // Журнал: инстанс source «building»…
  const inst = g.quests.active.find((i) => i.questId === OBELISK_QID);
  assert.ok(inst, 'журнал: активный building-инстанс');
  assert.equal(inst.source, 'building', 'source «building»');
  assert.equal(inst.tile, OBELISK_KEY, 'tile «x,y»');
  // …но НЕ в секции quests сейва (R2: deserialize строгий).
  assert.deepEqual(save1.data.quests, { active: {}, done: [] },
    'секция quests — только NPC-инстансы (building не пишется)');
  // Повтор в тот же день — disabled; день 2 — доступно, квест
  // по-прежнему active.
  key(h, 'KeyE');
  assert.equal(findRow(findOverlay(h), '42').disabled, true,
    'в тот же день — disabled');
  key(h, 'Escape');
  g.actions.setDay(2);
  key(h, 'KeyE');
  assert.equal(findRow(findOverlay(h), '42').disabled, false,
    'день 2 — доступно');
  key(h, 'Escape');
  assert.ok(g.quests.active.some(
    (i) => i.questId === OBELISK_QID && i.status === 'active'),
    'квест по-прежнему active на день 2');
});

test('B23. квест постройки e2e: выполнение → done, награда, без ре-выдачи; rehydrate на restore; «будущий» день отброшен', async () => {
  const h = await boot(seedSave({
    day: 2,
    position: { x: 80, y: -51 },
    hero: mkHero({ level: 3, secondary: { scholar: 5 } }),
    buildingQuests: {
      [OBELISK_KEY]: { questId: OBELISK_QID, day: 1,
        status: 'active' },
      // «Будущий» день (гигиена 000029): rehydrate не воссоздаёт,
      // на restore отброшен.
      '1,2': { questId: 'obelisk_touch_1_2', day: 99,
        status: 'active' },
    },
    quests: { active: {}, done: [] },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, 80, 'позиция — обелиск');
  // rehydrate: building-инстанс воссоздан из buildingQuests
  // (в секции quests его НЕТ — R2).
  const inst0 = g.quests.active.find((i) => i.questId === OBELISK_QID);
  assert.ok(inst0, 'rehydrate: активный инстанс после restore');
  assert.equal(inst0.source, 'building', 'source «building»');
  assert.ok(!g.quests.active.some((i) => i.questId === 'obelisk_touch_1_2'),
    '«будущий» день (99 > 2) — отброшен, не rehydrated');
  const gold0 = g.state.hero.gold; // createCharacter: 100
  assert.equal(gold0, 100, 'золото до действия');
  assert.equal(g.state.hero.xp, 0, 'xp 0 до действия');
  // Прикосновение (день 2): марки дня 1 НЕ блокируют.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  assert.equal(findRow(findOverlay(h), '42').disabled, false,
    'день 2 — доступно');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 200);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes('Обелиск: +12 оп.'),
    'hudFlash: XP касания: ' + hud1);
  assert.ok(hud1.includes(
    'Квест выполнен: Камни помнят (+25 оп., +20 з.)'),
    'hudFlash: выполнение квеста (награда из каталога): ' + hud1);
  assert.equal(g.state.hero.xp, 40,
    'XP = 12 (касание) + 28 (round(25·1.1) — награда ШТАТНЫМ addXp, '
    + 'Учёный действует на награду)');
  assert.equal(g.state.hero.gold, gold0 + 20, 'золото +20 (каталог)');
  const save1 = readSave(h);
  assert.deepEqual(save1.data.buildingQuests[OBELISK_KEY],
    { questId: OBELISK_QID, day: 1, status: 'done' },
    'buildingQuests → done');
  assert.ok(save1.data.quests.done.includes(OBELISK_QID),
    'журнал done: questId (per-tile)');
  assert.deepEqual(save1.data.quests.active, {}, 'active — пусто');
  assert.ok(save1.data.buildingQuests['1,2'] == null,
    '«будущий» день — не в сейве (отброшен на restore)');
  // День 3: третье касание — XP снова, квест НЕ повторно.
  g.actions.setDay(3);
  key(h, 'KeyE');
  assert.equal(findRow(findOverlay(h), '42').disabled, false,
    'день 3 — доступно');
  key(h, 'Digit1');
  assert.equal(g.state.hero.xp, 52, 'третье касание: +12 (без награды)');
  assert.equal(g.state.hero.gold, gold0 + 20, 'повторной награды нет');
  const save2 = readSave(h);
  assert.deepEqual(save2.data.buildingQuests[OBELISK_KEY],
    { questId: OBELISK_QID, day: 1, status: 'done' },
    'buildingQuests не изменился');
  assert.deepEqual(save2.data.quests.done, [OBELISK_QID],
    'done не растёт');
  assert.deepEqual(save2.data.quests.active, {}, 'active — пусто');
  // ТЭЙЛ: перезагрузка — квест НЕ выдан повторно (done держится).
  const h2 = await boot(save2);
  const g2 = h2.sandbox.__game;
  assert.equal(h2.errors.length, 0,
    'перезагрузка: ошибок нет: ' + h2.errors.join('; '));
  assert.ok(!g2.quests.active.some((i) => i.questId === OBELISK_QID),
    'перезагрузка: активного инстанса нет');
  // g2.quests.active — массив из realm vm-песочницы (Object.values):
  // deepStrictEqual сравнивает прототипы между realm'ами и падает
  // даже на равных по структуре — сравнение через JSON-нормализацию
  // (конвенция файла, паттерн B17 c.buffMods).
  assert.deepEqual(JSON.parse(JSON.stringify(g2.quests.active)), [],
    'перезагрузка: журнал пуст');
  assert.ok(g2.quests.done.includes(OBELISK_QID),
    'перезагрузка: done держится');
  const save3 = readSave(h2);
  assert.deepEqual(save3.data.buildingQuests[OBELISK_KEY],
    { questId: OBELISK_QID, day: 1, status: 'done' },
    'перезагрузка: раздел не изменился');
  assert.ok(save3.data.buildingQuests['1,2'] == null,
    'перезагрузка: «будущей» записи нет');
});

test('B24. смотровая башня e2e: «Взглянуть» — explored-раздел (окно 1681), без лимита раз-в-день, HUD «Исследовано: 1681 тайлов»', async () => {
  // Pre-seeded сейв (B14): день 1, игрок НА башне (36,-21) — золотой
  // факт стандартного seed-мира (башня id 46, проходимый тайл,
  // window (16..56, -41..-1) целиком в карте 256×256 → ровно 1681).
  const h = await boot(seedSave({ day: 1, position: { x: 36, y: -21 } }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, 36, 'позиция сейва (x)');
  assert.equal(g.state.player.y, -21, 'позиция сейва (y)');
  assert.equal(g.state.day, 1, 'день 1');
  // Тайл — башня: проходим, hasBuilding, buildingId 46, NPC нет.
  const myMap = G.createMap(G.generateSeedPixels());
  const t = myMap.tileAt(36, -21);
  assert.ok(t.passable, 'тайл башни проходим');
  assert.ok(t.hasBuilding, 'на тайле постройка');
  assert.equal(t.buildingId, 46, 'golden: buildingId 46');
  assert.ok(!G.npcForBuilding(G.NpcData.NPCS, 46), 'на башне NPC нет');
  // HUD-подсказка ДО действия (red: без записи «46» в реестре — нет).
  frameAt(h, NOW + 200);
  const hud0 = String(h.hud.textContent);
  assert.ok(hud0.includes('  |  [E] действия'),
    'топ-строка — «  |  [E] действия»: ' + hud0);
  assert.ok(!hud0.includes('Исследовано'),
    'до взгляда строки «Исследовано» нет (раздел пуст)');
  // [E] → оверлей ровно С ОДНОЙ строкой «Взглянуть».
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает buildingUI');
  assert.equal(G.npcUI.isActive(), false, 'npcUI НЕ открывается');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  const rows = findAll(ov, '[data-buid]');
  assert.equal(rows.length, 1,
    'ровно одна строка действия (red: записи «46» нет)');
  assert.equal(rows[0].dataset.buid, '46', 'строка — id 46');
  assert.equal(rows[0].disabled, false, 'строка доступна');
  assert.ok(textOf(rows[0]).includes('Взглянуть'),
    'имя действия: ' + textOf(rows[0]));
  // Сейв до действия — без explored (досеянный сейв).
  assert.equal((readSave(h).data.explored || null) == null, true,
    'до действия explored в сейве нет');
  // Digit1 → apply + само-закрытие.
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false,
    'оверлей закрылся после действия');
  // saveNow СРАЗУ: explored-раздел в сейве — окно башни.
  const save1 = readSave(h);
  assert.ok(save1.data.explored && typeof save1.data.explored === 'object'
    && !Array.isArray(save1.data.explored),
    'раздел explored в сейве (red: раздел не пишется)');
  const str = save1.data.explored['36,-21'];
  assert.equal(typeof str, 'string', 'ключ башни «36,-21» → строка');
  const segs = str.split(';');
  assert.equal(segs.length, 1681, 'окно 41×41 — ровно 1681 тайлов');
  assert.equal(new Set(segs).size, 1681, 'дубликатов нет');
  for (const s of segs) {
    const parts = s.split(',').map(Number);
    assert.ok(parts.length === 2
      && Math.abs(parts[0] - 36) <= 20
      && Math.abs(parts[1] - -21) <= 20,
      'сегмент ' + s + ' внутри окна Чебышёва ≤ 20 от башни');
  }
  // БЕЗ лимита раз-в-день (ТЗ: взгляд бесплатен): маркировки НЕТ.
  assert.equal((save1.data.buildingOncePerDay || {})['36,-21:46'],
    undefined, 'buildingOncePerDay: «36,-21:46» НЕ ставится');
  // HUD: строка «Исследовано: 1681 тайлов» (top-блок, red: строки нет).
  frameAt(h, NOW + 400);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes('Исследовано: 1681 тайлов'),
    'HUD «Исследовано: 1681 тайлов»: ' + hud1);
});

test('B25. смотровая башня e2e: повторный «Взглянуть» в тот же день — НЕ заблокирован (лимит НЕТ), explored deepEqual, день не сдвинулся', async () => {
  const h = await boot(seedSave({ day: 1, position: { x: 36, y: -21 } }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // Первый взгляд.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает (1-й раз)');
  const row1 = findRow(findOverlay(h), '46');
  assert.ok(row1, 'строка «Взглянуть» (1-й раз)');
  assert.equal(row1.disabled, false, '1-й раз — доступна');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, '1-й раз: оверлей закрыт');
  const save1 = readSave(h);
  assert.ok(save1.data.explored, '1-й взгляд: explored записан');
  // ПОВТОРНЫЙ взгляд — тот же день: лимита раз-в-день НЕТ (ТЗ: взгляда
  // днём может быть сколько угодно): оверлей открывается, строка
  // доступна (НЕ «уже использовано сегодня»).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true,
    '[E] открывает (2-й раз, тот же день)');
  const row2 = findRow(findOverlay(h), '46');
  assert.ok(row2, 'строка «Взглянуть» (2-й раз)');
  assert.equal(row2.disabled, false,
    '2-й раз — НЕ заблокирован «уже использовано сегодня»');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, '2-й раз: оверлей закрыт');
  const save2 = readSave(h);
  assert.deepEqual(save2.data.explored, save1.data.explored,
    'explored идентичен (идемпотентное объединение — дублей нет)');
  // Маркировки нет, день не сдвинулся.
  assert.equal((save2.data.buildingOncePerDay || {})['36,-21:46'],
    undefined, 'маркировки раз-в-день нет (лимит НЕТ)');
  assert.equal(g.state.day, 1, 'день не сдвинулся (живо)');
  assert.equal(save2.data.day, 1, 'день сейва = 1');
});

// --- Задача 000077: «ежедневный контент» — wiring E2E (B24) ---
// Золотые (детерминированный seed-мир, замерено):
//   * круг id 43 — (4,3), 7 шагов от (0,0) (B3 golden);
//   * храм id 39 — (-42,-31), 73 шага от (0,0).
// Позиция PRE-SEED'ом на тайле (паттерн B21): ХОД к храму (73 шага)
// при steps_per_day=40 СМЕНИЛ БЫ ДЕНЬ и сломал бы golden-исходы.
// Босс: бой развязываем ТЕСТОВОЙ мутацией c.result = { outcome:
// 'fled' } + handleCode('Space') (playerFlee — вероятностный;
// finish() — стандартный). ПРИБАВИТЕЛЬНО: в бою main-loop
// «замораживается» (последний rAF — tick боя), поэтому flash/HUD
// НЕ ЧИТАЕМ, пока бой активен или после него (hud-флэш сундука/
// реликвии проверяем ДО боя — main-loop жив).

test('B24. круг (43) + храм (39) e2e: [E] «Круг»/«Храм» — ролл по (tile,day), предмет/бой, сейв buildingContent + daily-марка, повтор «молчит», день D+1 — новый ролл', async () => {
  // --- Часть 1: круг (4,3), id 43 ---
  const h = await boot(seedSave({
    day: 1,
    position: { x: 4, y: 3 },
    hero: mkHero(),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // Голден: круг — (4,3), 7 шагов от спавна (BFS-пин).
  const found = findBuilding(G, myMap, { x: 0, y: 0 }, false,
    (b) => b.id === 43);
  assert.ok(found, 'сценарий: достижимый круг (id 43)');
  assert.equal(found.building.id, 43, 'запись резолвлена по buildingId');
  assert.equal(found.tile.x, 4, 'golden: x круга');
  assert.equal(found.tile.y, 3, 'golden: y круга');
  assert.equal(found.steps.length, 7, 'golden: 7 шагов от спавна');
  assert.equal(myMap.tileAt(4, 3).buildingId, 43, 'на тайле — круг');
  assert.equal(g.state.player.x, 4, 'позиция сейва — круг (x)');
  assert.equal(g.state.player.y, 3, 'позиция сейва — круг (y)');
  assert.equal(g.state.day, 1, 'день 1 (pre-seed)');
  // HUD: «[E] действия» — НОВОЕ поведение (red: у 43 нет эффектов
  // → hasEffects false → хинта нет).
  frameAt(h, NOW + 200);
  const hud0 = String(h.hud.textContent);
  assert.ok(hud0.includes('[E] действия'),
    'топ-строка «([E] действия)» (red: нет хинта): ' + hud0);
  // [E] → оверлей: строка «Круг».
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  const row = findRow(ov, '43');
  assert.ok(row, 'строка 43 в оверлее (red: нет записи «43» → строки нет)');
  assert.ok(textOf(row).includes('Круг'),
    'имя строки: «Круг»: ' + textOf(row));
  assert.equal(row.disabled, false, 'день 1 — доступно');
  // Digit1 — ролл дня 1 по (tile,day).
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  // Сейв СРАЗУ: buildingContent['4,3'] = { day, type } + daily-марка.
  const save1 = readSave(h);
  assert.ok(save1, 'saveNow — сразу после действия');
  const rec1 = save1.data.buildingContent
    && save1.data.buildingContent['4,3'];
  assert.ok(rec1, 'сейв: buildingContent[«4,3»] (red: раздела нет)');
  assert.equal(rec1.day, 1, 'запись: день 1');
  assert.ok(['chest', 'boss', 'relic'].includes(rec1.type),
    'запись: тип контента «' + rec1.type + '»');
  assert.equal(save1.data.buildingOncePerDay['4,3:43'], 1,
    'daily-марка «4,3:43»');
  if (rec1.type === 'boss') {
    // Босс — бой СТАРТОВАН (стандартный поток), состав 1–3 troll.
    assert.equal(G.combatUI.isActive(), true, 'босс — бой активен');
    const c = G.combatUI.current();
    // Мобы — БЕЗ союзников (Эфир — постоянный союзник 000081: в
    // c.units после concat, side 'ally', без mobId — паттерн
    // u.side === 'mob', tests/combat.test.js).
    const mobs1 = c.units.filter((u) => u.side === 'mob');
    assert.ok(mobs1.length >= 1 && mobs1.length <= 3,
      'состав 1–3: ' + mobs1.length);
    for (const u of mobs1) {
      assert.equal(u.mobId, 'troll', 'босс — troll (рецепт BUILDING_BOSS)');
    }
    // Тестовая развязка (playerFlee — вероятностный).
    if (!c.result) { c.phase = 'over'; c.result = { outcome: 'fled' }; }
    G.combatUI.handleCode('Space');
    assert.equal(G.combatUI.isActive(), false,
      'бой закрыт (тестовая развязка)');
  } else {
    // Сундук/реликвия — предмет в инвентаре (старт — пустой) +
    // flash (main-loop жив — боя нет).
    frameAt(h, NOW + 400);
    const hud1 = String(h.hud.textContent);
    const slots = g.state.hero.inventory;
    assert.equal(slots.length, 1, 'предмет выдан: ровно 1 слот');
    const id = slots[0].id;
    if (rec1.type === 'chest') {
      // Таблица — ПО ТАЙЛУ (R-4): dungeonTypeFor(terrain, альфа).
      const D = require('../src/dungeon.js');
      const t = D.dungeonTypeFor(myMap.tileAt(4, 3).terrain,
        myMap.pixelAt(4, 3)[3]);
      assert.ok(D.DUNGEON_ITEMS[t].includes(id),
        'сундук: «' + id + '» ∈ таблицы типа ' + t);
      assert.ok(hud1.includes('Круг: сундук — „'),
        'hudFlash «Круг: сундук — „…».: ' + hud1);
    } else {
      const B = require('../src/buildings.js');
      const relics = B.getBuilding(43)
        .особые_параметры.эффект.реликвии;
      assert.ok(relics.includes(id),
        'реликвия: «' + id + '» ∈ каталог 43 эффект.реликвии');
      assert.ok(hud1.includes('Круг: реликвия — „'),
        'hudFlash «Круг: реликвия — „…».: ' + hud1);
    }
  }
  // Повтор в тот же день — disabled, ТЗ-строка; apply повторно НЕ
  // вызывается (запись не изменилась).
  key(h, 'KeyE');
  const rowSame = findRow(findOverlay(h), '43');
  assert.ok(rowSame, 'повтор: строка 43 в оверлее');
  assert.equal(rowSame.disabled, true, 'повтор в тот же день — disabled');
  assert.ok(textOf(rowSame)
    .includes('круг молчит: содержимое уже получено'),
    'reason (ТЗ-текст): ' + textOf(rowSame));
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
  const saveSame = readSave(h);
  assert.deepEqual(saveSame.data.buildingContent['4,3'], rec1,
    'повтор — запись не изменилась (apply повторно не вызван)');
  // День 2 — НОВЫЙ ролл (запись дня 1 не блокирует: rec.day !== 2).
  g.actions.setDay(2);
  key(h, 'KeyE');
  const row2 = findRow(findOverlay(h), '43');
  assert.equal(row2.disabled, false, 'день 2 — доступно');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  const save2 = readSave(h);
  const rec2 = save2.data.buildingContent['4,3'];
  assert.ok(rec2, 'день 2: запись есть');
  assert.equal(rec2.day, 2, 'день 2: запись ПЕРЕЗАПИСАНА (ключ один)');
  assert.ok(['chest', 'boss', 'relic'].includes(rec2.type),
    'день 2: тип контента «' + rec2.type + '»');
  assert.equal(save2.data.buildingOncePerDay['4,3:43'], 2,
    'марка → день 2');
  if (rec2.type === 'boss') {
    assert.equal(G.combatUI.isActive(), true, 'день 2: босс — бой активен');
    const c2 = G.combatUI.current();
    const mobs2 = c2.units.filter((u) => u.side === 'mob');
    assert.ok(mobs2.length >= 1 && mobs2.length <= 3,
      'день 2: состав 1–3');
    if (!c2.result) {
      c2.phase = 'over'; c2.result = { outcome: 'fled' };
    }
    G.combatUI.handleCode('Space');
    assert.equal(G.combatUI.isActive(), false,
      'день 2: бой закрыт (тестовая развязка)');
  } else {
    const slots2 = g.state.hero.inventory;
    assert.ok(slots2.length >= 1, 'день 2: предмет выдан');
  }

  // --- Часть 2: храм (-42,-31), id 39 — тот же механизм ---
  const h2 = await boot(seedSave({
    day: 1,
    position: { x: -42, y: -31 },
    hero: mkHero(),
  }));
  const G2 = h2.sandbox.Game;
  const g2 = h2.sandbox.__game;
  const myMap2 = G2.createMap(G2.generateSeedPixels());
  assert.equal(h2.errors.length, 0,
    'храм: ошибок загрузки нет: ' + h2.errors.join('; '));
  const found2 = findBuilding(G2, myMap2, { x: 0, y: 0 }, false,
    (b) => b.id === 39);
  assert.ok(found2, 'сценарий: достижимый храм (id 39)');
  assert.equal(found2.building.id, 39, 'запись резолвлена по buildingId');
  assert.equal(found2.tile.x, -42, 'golden: x храма');
  assert.equal(found2.tile.y, -31, 'golden: y храма');
  assert.equal(found2.steps.length, 73, 'golden: 73 шага от спавна');
  assert.equal(myMap2.tileAt(-42, -31).buildingId, 39, 'на тайле — храм');
  assert.equal(g2.state.player.x, -42, 'позиция сейва — храм (x)');
  assert.equal(g2.state.player.y, -31, 'позиция сейва — храм (y)');
  assert.equal(g2.state.day, 1, 'день 1 (pre-seed)');
  frameAt(h2, NOW + 200);
  const hud20 = String(h2.hud.textContent);
  assert.ok(hud20.includes('[E] действия'),
    'храм: топ-строка «([E] действия)» (red: у 39 нет эффектов → '
    + 'нет хинта): ' + hud20);
  key(h2, 'KeyE');
  assert.equal(G2.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov2 = findOverlay(h2);
  assert.ok(ov2, 'оверлей подвешен к body');
  const row39 = findRow(ov2, '39');
  assert.ok(row39,
    'строка 39 в оверлее (red: нет записи «39» → строки нет)');
  assert.ok(textOf(row39).includes('Храм'),
    'имя строки: «Храм»: ' + textOf(row39));
  assert.equal(row39.disabled, false, 'день 1 — доступно');
  key(h2, 'Digit1');
  assert.equal(G2.buildingUI.isActive(), false, 'оверлей закрылся');
  const saveA = readSave(h2);
  assert.ok(saveA, 'храм: saveNow — сразу после действия');
  const recA = saveA.data.buildingContent
    && saveA.data.buildingContent['-42,-31'];
  assert.ok(recA,
    'храм: сейв buildingContent[«-42,-31»] (red: раздела нет)');
  assert.equal(recA.day, 1, 'храм: запись — день 1');
  assert.ok(['chest', 'boss', 'relic'].includes(recA.type),
    'храм: тип контента «' + recA.type + '»');
  assert.equal(saveA.data.buildingOncePerDay['-42,-31:39'], 1,
    'храм: daily-марка «-42,-31:39»');
  if (recA.type === 'boss') {
    assert.equal(G2.combatUI.isActive(), true, 'храм: босс — бой активен');
    const cA = G2.combatUI.current();
    const mobsA = cA.units.filter((u) => u.side === 'mob');
    for (const u of mobsA) {
      assert.equal(u.mobId, 'troll', 'храм: босс — troll');
    }
    if (!cA.result) {
      cA.phase = 'over'; cA.result = { outcome: 'fled' };
    }
    G2.combatUI.handleCode('Space');
    assert.equal(G2.combatUI.isActive(), false,
      'храм: бой закрыт (тестовая развязка)');
  }
  // Повтор — disabled, ОБЩИЙ ТЗ-текст (для 43 и 39).
  key(h2, 'KeyE');
  const row39Same = findRow(findOverlay(h2), '39');
  assert.ok(row39Same, 'храм: повтор — строка 39 в оверлее');
  assert.equal(row39Same.disabled, true,
    'храм: повтор в тот же день — disabled');
  assert.ok(textOf(row39Same)
    .includes('круг молчит: содержимое уже получено'),
    'храм: reason (ТЗ-текст, общий с кругом): ' + textOf(row39Same));
  key(h2, 'Escape');
  assert.equal(G2.buildingUI.isActive(), false);
});

// --- Задача 000077 (ревью): смерть в бою с боссом — подъём (000008) ---
// onEnd startCombatAt (debug/босс-бой, одна точка истины) обязан
// отражать onEnd боя мира: 'dead' → подъём (alive, половина maxHP,
// −20% золота) + флэш, не-'victory' → возврат на точку боя (prev —
// текущий тайл, герой остаётся на месте) + снап мувера, saveNow —
// существующая пост-боевая точка (без него мёртвый герой/штраф
// фиксировались бы только следующей точкой сейва, а restore
// принудительно оживлял без штрафа).
// Золотой: (4,3) день 1 — ролл «boss» (детерминированно, как B24).
// Смерть — ТЕСТОВОЙ мутацией, как в ядре (combat.js ~L588-599):
// c.player (ЖИВОЙ герой) — alive=false, hp=0, затем c.result =
// { outcome: 'dead' } + handleCode('Space') (finish → onEnd).
// Примечание B24: после босс-боя main-loop «заморожен» (последний
// rAF — тик боя), поэтому флэш/HUD НЕ ЧИТАЕМ — проверяем состояние
// (ЖИВОГО героя c.player) и сейв (saveNow — точка фиксации).
test('B25. босс «ежедневного контента»: исход «dead» — подъём (alive, половина maxHP, −20% золота), герой на тайле, сейв', async () => {
  const h = await boot(seedSave({
    day: 1,
    position: { x: 4, y: 3 },
    hero: mkHero(),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(myMap.tileAt(4, 3).buildingId, 43, 'golden: тайл — круг');
  assert.equal(g.state.player.x, 4, 'позиция сейва — круг (x)');
  assert.equal(g.state.player.y, 3, 'позиция сейва — круг (y)');
  assert.equal(g.state.day, 1, 'день 1 (pre-seed)');
  // [E] → «Круг» → Digit1: золотой (4,3) день 1 — ролл «boss».
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const row = findRow(findOverlay(h), '43');
  assert.ok(row, 'строка 43 в оверлее');
  assert.equal(row.disabled, false, 'день 1 — доступно');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  assert.equal(G.combatUI.isActive(), true,
    'golden (4,3) день 1: ролл «boss» — бой активен');
  const c = G.combatUI.current();
  const mobs = c.units.filter((u) => u.side === 'mob');
  assert.ok(mobs.length >= 1 && mobs.length <= 3,
    'состав 1–3: ' + mobs.length);
  for (const u of mobs) {
    assert.equal(u.mobId, 'troll', 'босс — troll (рецепт BUILDING_BOSS)');
  }
  // ЖИВОЙ герой в бою = c.player (createCombat: player: opts.hero).
  const hero = c.player;
  assert.equal(hero.gold, 100, 'старт: золото 100 (createCharacter)');
  const maxHP = G.derived(hero).maxHP;
  assert.equal(maxHP, 25, 'L1 (телосложения 1): maxHP = 20 + 1·5');
  assert.equal(hero.hp, maxHP, 'старт: полное HP');
  // Тестовая смерть (как ядро: урон → p.alive=false, hp=0, result).
  hero.alive = false;
  hero.hp = 0;
  if (!c.result) { c.phase = 'over'; c.result = { outcome: 'dead' }; }
  G.combatUI.handleCode('Space');
  assert.equal(G.combatUI.isActive(), false,
    'бой закрыт (тестовая развязка)');
  // ПОДЪЁМ (ревью: до фикса герой оставался мёртвым до конца сессии).
  assert.equal(hero.alive, true,
    'подъём: hero.alive = true (до фикса: мёртв до перезагрузки)');
  assert.equal(hero.hp, Math.max(1, Math.round(maxHP / 2)),
    'подъём: hp = половина maxHP (25 → 13)');
  // ШТРАФ: −20% золота.
  assert.equal(hero.gold, Math.floor(100 * 0.8),
    'штраф: золото −20% (100 → 80)');
  // Позиция: герой остаётся на тайле боя (prev — текущий тайл).
  assert.equal(g.state.player.x, 4, 'позиция: x — тайл круга');
  assert.equal(g.state.player.y, 3, 'позиция: y — тайл круга');
  // saveNow (ревью: до фикса — только следующей точкой сейва).
  const save = readSave(h);
  assert.ok(save, 'сейв существует');
  assert.equal(save.data.hero.alive, true,
    'сейв: hero.alive = true (saveNow после боя)');
  assert.equal(save.data.hero.hp, Math.max(1, Math.round(maxHP / 2)),
    'сейв: hero.hp — половина maxHP');
  assert.equal(save.data.hero.gold, 80, 'сейв: hero.gold = 80');
  assert.equal(save.data.position.x, 4, 'сейв: позиция x — тайл круга');
  assert.equal(save.data.position.y, 3, 'сейв: позиция y — тайл круга');
  // День НЕ отменяется: запись «boss» цела (контент уже явлен).
  assert.deepEqual(save.data.buildingContent['4,3'],
    { day: 1, type: 'boss' },
    'buildingContent: запись дня цела (смерть не отменяет день)');
  assert.equal(save.data.buildingOncePerDay['4,3:43'], 1,
    'daily-марка: день 1 (не сбросилась)');
});

// --- Задача 000094: развалины (48) — «Осмотр» wiring E2E (B24+) ---
//
// Золотые (детерминированный seed-мир, замерено на HEAD; контракты —
// memory/000094-ruins.md):
//   * ближайшая развалина от спавна (0,0) — тайл (2,-4), 6 шагов BFS
//     (slot 9 НЕ пропускатся; тайл: passable, building 9,
//     buildingId 48, isEntrance true — вход в подземелье всё равно
//     исключён гардом 000073);
//   * (2,-4) день 1 — ЛУТ 'meat' («Жареное мясо»), день 2 — ЛОВУШКА
//     (урон 2, clamp HP ≥ 1), день 5 — ЗАПИСЬ (fragIdx 7).
// Позиция PRE-SEED'ом на тайле (паттерн B14/B21): ХОД НЕ используется
// (pre-seed держит день).
const RUINS_KEY = '2,-4';
const RUINS_LOOT_MSG = 'Осмотр развалин: лут — «Жареное мясо».';
const RUINS_TRAP_MSG = 'Осмотр развалин: ловушка! −2 HP.';

test('B24. развалины e2e: [E] «Осмотреть», день 1 = голден ЛУТ: инвентарь + flash + daily-марка; повтор в тот же день — недоступно, новый день — доступно', async () => {
  const h = await boot(seedSave({
    day: 1,
    position: { x: 2, y: -4 },
    hero: mkHero(),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  // Голден: ближайшая развалина — (2,-4), 6 шагов от спавна
  // (findRuins — слот 9 НЕ пропускается; ХОД НЕ используется —
  // pre-seed держит день).
  const found = findRuins(G, myMap, { x: 0, y: 0 });
  assert.ok(found, 'сценарий: достижимые развалины (buildingId 48)');
  assert.equal(found.tile.x, 2, 'golden: x развалин');
  assert.equal(found.tile.y, -4, 'golden: y развалин');
  assert.equal(found.steps.length, 6, 'golden: 6 шагов от спавна');
  assert.equal(found.tile.building, 9, 'развалины — подтип слота 9');
  assert.equal(found.tile.buildingId, 48,
    'запись резолвлена по buildingId 48');
  assert.equal(g.state.player.x, 2, 'позиция сейва — развалины (x)');
  assert.equal(g.state.player.y, -4, 'позиция сейва — развалины (y)');
  assert.equal(g.state.day, 1, 'день 1 (pre-seed)');
  // g.state.hero.inventory — УЖЕ массив слотов (main.js:1544:
  // `(hero.inventory || {slots:[]}).slots`), а не объект инвентаря.
  // JSON-нормализация: массив из vm-realm (прототипы между realm'ами
  // не равны для deepStrictEqual, паттерн B23).
  assert.deepEqual(
    JSON.parse(JSON.stringify(g.state.hero.inventory)), [],
    'инвентарь пуст до действия');
  // HUD: «Здесь: развалины  ([E] действия)» (хинт — автоматически
  // через hasEffects, 000071).
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  assert.ok(hudLine.includes('Здесь: развалины'),
    'HUD: «Здесь: развалины»: ' + hudLine);
  assert.ok(hudLine.includes('[E] действия'),
    'топ-строка «([E] действия)» (red: у 48 нет эффектов → хинта '
    + 'нет): ' + hudLine);
  // [E] → оверлей: заголовок, строка «Осмотреть».
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  assert.ok(String(textOf(ov)).toLowerCase().includes('развалины'),
    'заголовок оверлея: ' + textOf(ov));
  const row = findRow(ov, '48');
  assert.ok(row,
    'строка 48 в оверлее (red: нет записи «48» → строки нет)');
  assert.ok(textOf(row).includes('Осмотреть'),
    'имя строки: «Осмотреть»');
  assert.equal(row.disabled, false, 'день 1 — доступно');
  // Digit1 — ДЕНЬ 1: ЛУТ (golden): инвентарь + 'meat', flash
  // message, saveNow + daily-марка (попытка сгорела, R3).
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 400);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes(RUINS_LOOT_MSG),
    'hudFlash — голден лут день 1 (red: нет спец-модуля/записи): '
    + hud1);
  assert.ok(g.state.hero.inventory
    .some((s) => s.id === 'meat'),
    'лут в инвентаре: meat (red: спец-хендлер не зарегистрирован)');
  const saveF = readSave(h);
  assert.ok(saveF, 'saveNow — сразу после действия');
  assert.equal(saveF.data.buildingOncePerDay[RUINS_KEY + ':48'], 1,
    'попытка сгорела: daily-марка (R3)');
  // Повтор в тот же день — disabled.
  key(h, 'KeyE');
  const rowSame = findRow(findOverlay(h), '48');
  assert.equal(rowSame.disabled, true, 'в тот же день — disabled');
  assert.ok(textOf(rowSame).includes('уже использовано сегодня'),
    'reason «уже использовано сегодня»: ' + textOf(rowSame));
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
  // День 2 — доступно (golden: ловушка).
  g.actions.setDay(2);
  key(h, 'KeyE');
  const row2 = findRow(findOverlay(h), '48');
  assert.equal(row2.disabled, false, 'день 2 — доступно');
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
});

test('B25. развалины e2e: ловушка (день 2 = голден) — HP −2 (кейс ТЗ) и clamp HP ≥ 1 (hp 2 → 1, НЕ смерть)', async () => {
  // Сценарий 1: свежий герой (hp 25), день 2 — голден ЛОВУШКА.
  const h = await boot(seedSave({
    day: 2,
    position: { x: 2, y: -4 },
    hero: mkHero(),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, 2, 'позиция сейва — развалины (x)');
  assert.equal(g.state.player.y, -4, 'позиция сейва — развалины (y)');
  assert.equal(g.state.day, 2, 'день 2 (pre-seed)');
  assert.equal(g.state.hero.hp, 25, 'hero: hp 25 до действия');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const row = findRow(findOverlay(h), '48');
  assert.ok(row, 'строка 48 в оверлее (red: нет записи «48»)');
  assert.equal(row.disabled, false, 'день 2 — доступно');
  key(h, 'Digit1');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 200);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes(RUINS_TRAP_MSG),
    'hudFlash — ловушка (red: нет спец-модуля): ' + hud1);
  assert.equal(g.state.hero.hp, 23,
    'HP −2 (кейс ТЗ; red: без спец-хендлера hp не меняется)');
  const save1 = readSave(h);
  assert.equal(save1.data.hero.hp, 23, 'saveNow: hp — в сейве');
  assert.equal(save1.data.buildingOncePerDay[RUINS_KEY + ':48'], 2,
    'daily-марка день 2');
  // Сценарий 2: герой с hp 2 (свежий boot) — clamp ≥ 1, НЕ смерть
  // (restore-clamp main.js сохраняет hp=2 — tests/save-restore).
  const h2 = await boot(seedSave({
    day: 2,
    position: { x: 2, y: -4 },
    hero: mkHero({ hp: 2 }),
  }));
  const g2 = h2.sandbox.__game;
  assert.equal(h2.errors.length, 0,
    'ошибок загрузки нет (сценарий 2): ' + h2.errors.join('; '));
  assert.equal(g2.state.hero.hp, 2, 'hero: hp 2 (restore-clamp)');
  key(h2, 'KeyE');
  const row2 = findRow(findOverlay(h2), '48');
  assert.ok(row2, 'строка 48 в оверлее (сценарий 2)');
  assert.equal(row2.disabled, false, 'день 2 — доступно (свежий сейв)');
  key(h2, 'Digit1');
  frameAt(h2, NOW + 200);
  assert.equal(g2.state.hero.hp, 1,
    'clamp HP ≥ 1: hp 2 → 1 (НЕ смерть, герой жив)');
  assert.equal(g2.state.hero.alive, true, 'герой жив — игра идёт');
  const save2 = readSave(h2);
  assert.equal(save2.data.hero.hp, 1, 'saveNow: hp=1 — в сейве');
  assert.equal(save2.data.buildingOncePerDay[RUINS_KEY + ':48'], 2,
    'daily-марка день 2 (сценарий 2)');
});

// --- Задача 000091: таверна (44) — отдых и слухи — wiring E2E (B24+) ---
// Золотые (детерминированный seed-мир, замерено; контракты —
// memory/000091-tavern-rest-rumors.md):
//   * ближайшая к спавну (0,0) таверна id 44 = (41, 2), 43 шага (BFS) —
//     > steps_per_day (40) → e2e ОБЯЗАНЫ pre-seedовать позицию (паттерн
//     B14/B21: walkTo утащил бы в новый день и сломал golden);
//   * тайл (41,2): buildingId 44 (слот 11, terrain 3), NPC Берта
//     (tavern_keeper, id 9) — «Диалог» ПЕРВАЯ строка;
//   * moonDreamHint((41,2)) → вход (44, -1) (buildingId 31, alpha 166)
//     → dungeonType 0 «простая пещера» (совпадает с B19-голденом «Сона»);
//   * B24-герой: Медитация 2 + Вдох 1 → hpRegen 0.19 / mpRegen 0.14
//     (maxHP 25 / maxMP 16 у level-1): hp 5→10, mp 4→6 (таблица §5).
//   * e2e-чтение mp: readSave(h).data.hero.mp — g.state.hero.mp НЕТ.

test('B24. «Отдых» e2e: таверна (41,2) — HUD «([E] Берта, действия)», оверлей [dialog,44_rest,44_rumors], Digit2 — день 1→2, hero 10/6, flash, БЕЗ отметки; повтор в тот же день (ТЗ) (задача 000091)', async () => {
  // Позиция PRE-SEED'ом на таверне (паттерн B14/B21): ХОД к таверне
  // (43 шага) при steps_per_day=40 СМЕНИЛ БЫ ДЕНЬ (1→2); pre-seed держит
  // день 1. B24-герой: Медитация 2 + Вдох 1 (0.19/0.14, таблица §5).
  const h = await boot(seedSave({
    day: 1,
    position: { x: 41, y: 2 },
    hero: mkHero({ hp: 5, mp: 4, secondary: { meditation: 2, breath: 1 } }),
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.player.x, 41, 'позиция сейва — таверна (x)');
  assert.equal(g.state.player.y, 2, 'позиция сейва — таверна (y)');
  assert.equal(g.state.day, 1, 'день 1 (pre-seed)');
  const t = myMap.tileAt(41, 2);
  assert.equal(t.buildingId, 44, 'тайл (41,2) — таверна (buildingId 44)');
  // HUD: «Здесь: …  ([E] Берта, действия)» (eHint 000129: NPC + эффекты).
  // RED: до задачи effectIds(44) = [] → eHint '  ([E] Берта)' (без
  // «действий») — assertion падает (нет эффектов).
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  assert.ok(hudLine.includes('([E] Берта, действия)'),
    '«Здесь:» — диалог + действия (red: нет эффектов → «([E] Берта)»): '
    + hudLine);
  // [E] → оверлей: [dialog, 44_rest, 44_rumors] (dialog ПЕРВЫМ — Берта).
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  assert.equal(G.npcUI.isActive(), false, 'npcUI не открывается сразу');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  const rows = findAll(ov, '[data-buid]');
  assert.deepEqual(rows.map((r) => r.dataset.buid),
    ['dialog', '44_rest', '44_rumors'],
    'строки: «Диалог» (Берта) ПЕРВЫМ + «Отдых» + «Слухи» '
    + '(red: нет записей в реестре/каталоге)');
  for (const r of rows) {
    assert.equal(r.disabled, false,
      'строка «' + r.dataset.buid + '» — доступна');
  }
  // Digit2 — «Отдых» (1=dialog, 2=44_rest).
  key(h, 'Digit2');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  assert.equal(g.state.day, 2, 'день 1→2 (clock.rest)');
  assert.equal(g.state.stepsToday, 0, 'шаги сброшены (rest)');
  frameAt(h, NOW + 400);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes('Отдых: вы выспались — день 2.'),
    'hudFlash — message спец-а с НОВЫМ днём: ' + hud1);
  // saveNow: день 2 в сейве; герой восстановлен (mp — через readSave).
  const save = readSave(h);
  assert.equal(save.data.day, 2, 'saveNow: data.day === 2');
  assert.equal(g.state.hero.hp, 10, 'hero hp 5→10 (0.19, таблица §5)');
  assert.equal(save.data.hero.mp, 6,
    'hero mp 4→6 (0.14, через readSave — §5 memory)');
  // Лимитов НЕТ → отметки нет (ключ «41,2:44_rest» никогда).
  assert.ok(save.data.buildingOncePerDay['41,2:44_rest'] == null,
    'НЕТ отметки «41,2:44_rest» (лимитов нет)');
  // Повтор в тот же день (ТЗ): строка доступна, Digit2 → день 3.
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'оверлей открывается снова');
  const rowRest = findRow(findOverlay(h), '44_rest');
  assert.ok(rowRest, 'строка 44_rest в оверлее');
  assert.equal(rowRest.disabled, false,
    'в тот же день — ДОСТУПНО (без лимита)');
  key(h, 'Digit2');
  assert.equal(g.state.day, 3, 'повторный «Отдых» — день 3');
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
});

test('B25. «Слухи» e2e: таверна (41,2), день 1 — flash «Слухи:…» (фрагмент каталога + вход (44,-1) «простая пещера»), день НЕ тратится, БЕЗ отметки, повтор — детерминированно (задача 000091)', async () => {
  // Позиция PRE-SEED'ом на таверне (паттерн B14/B21): 43 шага > 40.
  const h = await boot(seedSave({
    day: 1,
    position: { x: 41, y: 2 },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.day, 1, 'день 1 (pre-seed)');
  const t = myMap.tileAt(41, 2);
  assert.equal(t.buildingId, 44, 'тайл (41,2) — таверна');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  assert.ok(ov, 'оверлей подвешен к body');
  const rows = findAll(ov, '[data-buid]');
  assert.deepEqual(rows.map((r) => r.dataset.buid),
    ['dialog', '44_rest', '44_rumors'],
    'строки: dialog + 44_rest + 44_rumors (red: нет записей)');
  const rowR = findRow(ov, '44_rumors');
  assert.ok(rowR, 'строка 44_rumors в оверлее (red: строки нет)');
  assert.equal(rowR.disabled, false, 'день 1 — доступно');
  // Digit3 — «Слухи» (1=dialog, 2=44_rest, 3=44_rumors).
  key(h, 'Digit3');
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  frameAt(h, NOW + 400);
  const hud1 = String(h.hud.textContent);
  assert.ok(hud1.includes('Слухи:'),
    'hudFlash — «Слухи:…»: ' + hud1);
  // Голден-фрагмент дня 1 — ИЗ каталога (000053: без хардкода):
  // i0 = hash(41, 2, RUMT ^ 1) % L (тот же код, что apply; сиды
  // RUMC/RUMT/RUM2 — ⚠ переименованы, a1-таблица на 'TAVR' невалидна).
  const BE = require('../src/building-effects.js');
  const PL = require('../src/perlin.js');
  const B = require('../src/buildings.js');
  const T44 = B.getBuilding(44).особые_параметры.эффект.слухи.тексты;
  const i0 = PL.hash2(41, 2, BE.RUMORS_TEXT_SEED ^ 1) % T44.length;
  assert.ok(hud1.includes('«' + T44[i0] + '»'),
    'hudFlash — фрагмент дня 1 (i0, сид RUMT): ' + hud1);
  assert.ok(hud1.includes('(44, -1)'),
    'hudFlash — координаты ближайшего входа: ' + hud1);
  assert.ok(hud1.includes('простая пещера'),
    'hudFlash — имя типа подземелья (DUNGEON_NAMES): ' + hud1);
  // День НЕ тратится (слухи — чистые данные, не event/rest).
  assert.equal(g.state.day, 1, 'день НЕ тратится (слухи — данные)');
  // Лимитов НЕТ → отметки нет.
  const save1 = readSave(h);
  assert.ok(save1.data.buildingOncePerDay['41,2:44_rumors'] == null,
    'НЕТ отметки «41,2:44_rumors» (без лимита)');
  // Повтор в тот же день — детерминированно (по (tile, day)): тот же
  // фрагмент и тот же вход.
  key(h, 'KeyE');
  const rowR2 = findRow(findOverlay(h), '44_rumors');
  assert.equal(rowR2.disabled, false, 'повтор в тот же день — доступно');
  key(h, 'Digit3');
  frameAt(h, NOW + 600);
  const hud2 = String(h.hud.textContent);
  assert.equal(hud2, hud1,
    'повтор — flash БИТ-в-БИТ идентичен (детерминизм)');
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
});

test('B26. регрессия: диалог Берты (NPC таверны) — «Диалог» ПЕРВАЯ строка, npcUI, повторный [E] закрывает (задача 000091)', async () => {
  // GREEN-GUARD: НЕ красный — защита от регрессии (NPC-схема НЕ
  // трогается; НАЙМ — задача 000065, не здесь). Все ассерты проходят
  // на текущем коде (оверлей до задачи = ['dialog']); «Диалог» ПЕРВЫЙ
  // — сосуществование dialog + эффекты покрывает B24 (красный).
  const h = await boot(seedSave({
    day: 1,
    position: { x: 41, y: 2 },
  }));
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  assert.equal(g.state.day, 1, 'день 1 (pre-seed)');
  const t = myMap.tileAt(41, 2);
  assert.equal(t.buildingId, 44, 'тайл (41,2) — таверна');
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, '[E] открывает оверлей');
  const ov = findOverlay(h);
  const rows = findAll(ov, '[data-buid]');
  assert.ok(rows.length >= 1, 'строка действия есть');
  assert.equal(rows[0].dataset.buid, 'dialog',
    '«Диалог» — ПЕРВАЯ строка (NPC Берта)');
  assert.equal(rows[0].disabled, false, '«Диалог» доступен');
  key(h, 'Digit1'); // «Диалог»
  assert.equal(G.buildingUI.isActive(), false, 'оверлей закрылся');
  assert.equal(G.npcUI.isActive(), true, 'открыт диалог npcUI');
  const nov = findAll(h.body, '.npc-overlay')[0];
  assert.ok(nov && textOf(nov).includes('Берта'),
    'диалог — Берта (NPC таверны, постройки [44]): '
    + (nov ? textOf(nov) : '(нет оверлея)'));
  // Повторный [E] закрывает диалог (регрессия B4).
  key(h, 'KeyE');
  assert.equal(G.npcUI.isActive(), false, 'повторный [E] закрыл диалог');
  // [E] снова → оверлей снова содержит строку «Диалог».
  key(h, 'KeyE');
  assert.equal(G.buildingUI.isActive(), true, 'оверлей открывается снова');
  const rows2 = findAll(findOverlay(h), '[data-buid]');
  assert.ok(rows2.some((r) => r.dataset.buid === 'dialog'),
    'оверлей снова содержит «Диалог»');
  key(h, 'Escape');
  assert.equal(G.buildingUI.isActive(), false);
});
