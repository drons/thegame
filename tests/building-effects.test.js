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
  // ('40'/'42') — полный НАБОР ['36', '37', '38', '40', '41', '42'];
  // 000077 ('39') расширит список при своём мерже (правка при
  // ребейзе: union, memory/000076-temple-blessings.md /
  // 000074-rune-stone-obelisk.md).
  assert.deepEqual(Object.keys(BE.EFFECTS).sort(),
    ['36', '37', '38', '40', '41', '42'],
    'реестр: 000075 (41) + 000076 (36/37/38) + 000074 (40/42)');
  for (const id of ['36', '37', '38']) {
    assert.equal(typeof BE.EFFECTS[id].имя, 'string', id + ': имя');
    assert.equal(typeof BE.EFFECTS[id].apply, 'function',
      id + ': apply(state)');
  }
  assert.equal(Object.prototype.hasOwnProperty.call(BE.EFFECTS, '39'),
    false, '39 (заброшенный храм) — задача 000077, не в реестре');
  for (const m of ['buildingActions', 'effectIds', 'hasEffects',
    'hasDailyLimit', 'linkTeleportCircles', 'teleportDestination',
    'teleportCharge', 'serializeTeleports', 'restoreTeleports',
    'moonDreamHint']) {
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
  const found = findBuilding(G, myMap, g.state.player, false);
  assert.ok(found, 'сценарий: найдена достижимая постройка без NPC');
  walkTo(h, found.steps);
  frameAt(h, NOW + 200);
  const hudLine = String(h.hud.textContent);
  // Реестр пуст — ни подсказки «[E] действия», ни «[E] диалог».
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
