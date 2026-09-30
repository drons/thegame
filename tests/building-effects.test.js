// Задача 000071: основание эффектов построек — ПУСТЫЙ реестр
// src/building-effects.js (чистый UMD-модуль) + оверлей Game.buildingUI
// (src/building-ui.js) + ЕДИНЫЙ роутинг [E] через него (src/main.js).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации; падают до зелёной стадии.
//
// Контракты, зафиксированные здесь (решения —
// memory/000071-building-ui.md; полный отчёт — tasks/result/000071.md
// на стадии Finalize):
//   * REЕСТР EFFECTS = {} (в этой задаче ПУСТ — подзадачи 000074+
//     добавляют только СВОИ записи): id → { имя, разВДень?,
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
  assert.equal(Object.keys(BE.EFFECTS).length, 0,
    'в задаче 000071 реестр ПУСТ (записи — в подзадачах 000074+)');
  for (const m of ['buildingActions', 'effectIds', 'hasEffects',
    'hasDailyLimit']) {
    assert.equal(typeof BE[m], 'function', 'BE.' + m + ' — функция');
  }
});

test('A2. buildingActions: пустой реестр, NPC нет — пустой список', () => {
  const BE = loadBE();
  const res = BE.buildingActions(
    { id: 40, особые_параметры: {} }, null, makeState());
  assert.deepEqual(res, [], 'ни «Диалога», ни эффектов');
});

test('A3. buildingActions: NPC есть, эффектов нет — ровно «Диалог»', () => {
  const BE = loadBE();
  const res = BE.buildingActions(
    { id: 36, особые_параметры: {} }, NPC(), makeState());
  assert.equal(res.length, 1, 'один пункт');
  assert.equal(res[0].id, 'dialog', 'id зафиксирован');
  assert.equal(res[0].имя, 'Диалог', 'имя зафиксировано');
  assert.equal(res[0].доступен, true, 'диалог всегда доступен');
});

test('A4. buildingActions: связь 1-к-1 по building.id; «Диалог» ПЕРВЫМ', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест-действие' };
  try {
    const b = { id: 40, особые_параметры: {} };
    const r1 = BE.buildingActions(b, null, makeState());
    assert.equal(r1.length, 1, 'без NPC — только эффект');
    assert.equal(r1[0].id, '40', 'id эффекта = String(building.id)');
    assert.equal(r1[0].имя, 'Тест-действие');
    assert.equal(r1[0].доступен, true);
    const r2 = BE.buildingActions(b, NPC(), makeState());
    assert.deepEqual(r2.map((r) => r.id), ['dialog', '40'],
      'порядок: «Диалог» первым, затем эффекты');
  } finally {
    delete BE.EFFECTS['40'];
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
  assert.equal(BE.hasEffects({ id: 40, особые_параметры: {} }), false,
    'пустой реестр — эффектов нет');
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    assert.deepEqual(BE.effectIds({ id: 40, особые_параметры: {} }), ['40']);
    assert.equal(BE.hasEffects({ id: 40, особые_параметры: {} }), true);
    BE.EFFECTS['b'] = { имя: 'Бэ' };
    try {
      assert.deepEqual(
        BE.effectIds({ id: 99, особые_параметры: { эффекты: ['b', 'a'] } }),
        ['b'], 'только id с записями в реестре (порядок каталога)');
      assert.equal(BE.hasEffects({ id: 41, особые_параметры: {} }), false);
    } finally {
      delete BE.EFFECTS['b'];
    }
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A7. раз-в-день: флаг каталога раз_в_день — тот же день заблокирован, следующий — свободен', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    const b = { id: 40, особые_параметры: { раз_в_день: true } };
    const used = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:40': 3 } },
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
    delete BE.EFFECTS['40'];
  }
});

test('A8. раз-в-день: флага НУГДЕ — эффект доступен, даже с записью в сейве (лимит не наследуется)', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    const b = { id: 40, особые_параметры: {} };
    const r = BE.buildingActions(b, null, makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:40': 3 } },
    }));
    assert.equal(r[0].доступен, true, 'без флага лимита нет');
    assert.equal(r[0].reason, undefined);
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A9. раз-в-день: флаг ЧИТАЕТСЯ ИЗ КАТАЛОГА (принцип 000053): две постройки, одна запись реестра', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    const st = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:40': 3 } },
    });
    const withFlag = { id: 40, особые_параметры: { раз_в_день: true } };
    const withoutFlag = { id: 40, особые_параметры: {} };
    assert.equal(BE.hasDailyLimit(withFlag, '40'), true, 'флаг каталога — true');
    assert.equal(BE.hasDailyLimit(withoutFlag, '40'), false, 'без флага — false');
    assert.equal(BE.buildingActions(withFlag, null, st)[0].доступен, false,
      'с флагом каталога — заблокировано');
    assert.equal(BE.buildingActions(withoutFlag, null, st)[0].доступен, true,
      'без флага каталога — доступно');
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A10. раз-в-день: флага в каталоге нет — fallback на запись реестра разВДень; каталог false побеждает', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест', разВДень: true };
  try {
    const st = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:40': 3 } },
    });
    const noFlag = { id: 40, особые_параметры: {} };
    assert.equal(BE.hasDailyLimit(noFlag, '40'), true,
      'fallback: разВДень записи реестра');
    assert.equal(BE.buildingActions(noFlag, null, st)[0].доступен, false,
      'fallback-лимит работает через сейв');
    const falseFlag = { id: 40, особые_параметры: { раз_в_день: false } };
    assert.equal(BE.hasDailyLimit(falseFlag, '40'), false,
      'каталог false побеждает над fallback true');
    assert.equal(BE.buildingActions(falseFlag, null, st)[0].доступен, true,
      'с явным false в каталоге — доступно');
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A11. раз-в-день: ключ сейва «x,y:effectId» с ОТРИЦАТЕЛЬНЫМИ координатами', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    const b = { id: 40, особые_параметры: { раз_в_день: true } };
    const st = makeState({
      day: 3, tile: { x: -3, y: -7 },
      save: { buildingOncePerDay: { '-3,-7:40': 3 } },
    });
    assert.equal(BE.buildingActions(b, null, st)[0].доступен, false,
      'запись «-3,-7:40» читается');
    // Запись ДРУГОГО тайла не блокирует этот.
    const st2 = makeState({
      day: 3, tile: { x: -3, y: -7 },
      save: { buildingOncePerDay: { '-3,-8:40': 3 } },
    });
    assert.equal(BE.buildingActions(b, null, st2)[0].доступен, true,
      'другой тайл — не блокирует');
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A12. buildingActions: чистая — building/npc/state (снимок) не мутируются', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    const building = { id: 40, особые_параметры: { раз_в_день: true } };
    const npc = NPC();
    const state = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:40': 3 } },
    });
    const b0 = JSON.parse(JSON.stringify(building));
    const n0 = JSON.parse(JSON.stringify(npc));
    const s0 = JSON.parse(JSON.stringify(state));
    BE.buildingActions(building, npc, state);
    assert.deepEqual(building, b0, 'building не мутирован');
    assert.deepEqual(npc, n0, 'npc не мутирован');
    assert.deepEqual(state, s0, 'state (снимок сейва) не мутирован');
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A13. раз-в-день: сейв отсутствует/мусорный — fail-open (000029), игра не ломается', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    const b = { id: 40, особые_параметры: { раз_в_день: true } };
    assert.equal(BE.buildingActions(b, null, makeState({ save: {} }))[0]
      .доступен, true, 'save без раздела — доступно');
    assert.equal(BE.buildingActions(b, null,
      makeState({ save: { buildingOncePerDay: 'junk' } }))[0].доступен, true,
      'мусорный раздел — доступно (fail-open)');
  } finally {
    delete BE.EFFECTS['40'];
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
    { id: 40, особые_параметры: {} },
    { id: 'npc_x', имя: 'Тест' },
    { day: 1, tile: { x: 0, y: 0 }, hero: {}, save: {} });
  assert.equal(res1.length, 1);
  assert.equal(res1[0].id, 'dialog');
  assert.equal(res1[0].имя, 'Диалог');
  assert.equal(res1[0].доступен, true);
  // Лимит без Game.canUseToday: fallback-сравнение дней.
  BE.EFFECTS['40'] = { имя: 'Тест' };
  try {
    const b = { id: 40, особые_параметры: { раз_в_день: true } };
    const r1 = BE.buildingActions(b, null,
      { day: 3, tile: { x: 5, y: 7 }, hero: {},
        save: { buildingOncePerDay: { '5,7:40': 3 } } });
    assert.equal(r1[0].доступен, false, 'fallback блокирует тот же день');
    const r2 = BE.buildingActions(b, null,
      { day: 4, tile: { x: 5, y: 7 }, hero: {},
        save: { buildingOncePerDay: { '5,7:40': 3 } } });
    assert.equal(r2[0].доступен, true, 'fallback освобождает следующий');
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A15. available?(state): недневная доступность — reason по строке/false, истина — доступно (ревью раунда 2)', () => {
  const BE = loadBE();
  // available(state) — строка: недоступно, строка — reason.
  BE.EFFECTS['40'] = {
    имя: 'Тест',
    available: (st) => (st.save && st.save.открыт ? true : 'тест: молчит'),
  };
  try {
    const closed = BE.buildingActions(
      { id: 40, особые_параметры: {} }, null,
      makeState({ save: { открыт: false } }));
    assert.equal(closed[0].доступен, false, 'available → строка: недоступно');
    assert.equal(closed[0].reason, 'тест: молчит',
      'reason — строка, возвращённая available');
    const open = BE.buildingActions(
      { id: 40, особые_параметры: {} }, null,
      makeState({ save: { открыт: true } }));
    assert.equal(open[0].доступен, true, 'available → true: доступно');
    assert.equal(open[0].reason, undefined, 'без причины доступность');
  } finally {
    delete BE.EFFECTS['40'];
  }
  // false/null/'' — недоступно, reason «недоступно»; available нет —
  // доступно (регрессия: прежние записи реестра без available).
  BE.EFFECTS['41'] = { имя: 'Т', available: () => false };
  BE.EFFECTS['42'] = { имя: 'Т', available: () => null };
  BE.EFFECTS['43'] = { имя: 'Т', available: () => '' };
  BE.EFFECTS['44'] = { имя: 'Т' };
  try {
    const st = makeState();
    for (const id of ['41', '42', '43']) {
      const r = BE.buildingActions(
        { id: Number(id), особые_параметры: {} }, null, st);
      assert.equal(r[0].доступен, false,
        id + ': false/null/\'\' — недоступно');
      assert.equal(r[0].reason, 'недоступно', id + ': reason по умолчанию');
    }
    const r44 = BE.buildingActions(
      { id: 44, особые_параметры: {} }, null, st);
    assert.equal(r44[0].доступен, true,
      'без available — доступно (регрессия)');
  } finally {
    for (const id of ['41', '42', '43', '44']) delete BE.EFFECTS[id];
  }
});

test('A16. available ПЕРВОЙ: недневная причина перебивает «уже использовано сегодня»; state не мутирован', () => {
  const BE = loadBE();
  BE.EFFECTS['40'] = {
    имя: 'Тест',
    available: () => 'тест: молчит',
    apply: () => ({ ok: true }),
  };
  try {
    const b = { id: 40, особые_параметры: { раз_в_день: true } };
    const state = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:40': 3 } },
    });
    const s0 = JSON.parse(JSON.stringify(state));
    const r = BE.buildingActions(b, null, state);
    assert.equal(r[0].доступен, false, 'недоступно по available');
    assert.equal(r[0].reason, 'тест: молчит',
      'reason available, а не лимитный «уже использовано сегодня»');
    assert.deepEqual(state, s0, 'state (снимок) не мутирован');
  } finally {
    delete BE.EFFECTS['40'];
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
  BE.EFFECTS['40'] = {
    имя: 'Тест',
    available: (st) => (st.day > 2 ? true : 'тест: ещё спит'),
  };
  try {
    const r1 = BE.buildingActions(
      { id: 40, особые_параметры: {} }, null,
      { day: 1, tile: { x: 0, y: 0 }, hero: {}, save: {} });
    assert.equal(r1[0].доступен, false, 'в чужом realm: недоступно');
    assert.equal(r1[0].reason, 'тест: ещё спит');
    const r2 = BE.buildingActions(
      { id: 40, особые_параметры: {} }, null,
      { day: 3, tile: { x: 0, y: 0 }, hero: {}, save: {} });
    assert.equal(r2[0].доступен, true, 'в чужом realm: доступно');
  } finally {
    delete BE.EFFECTS['40'];
  }
});

test('A18. раз-в-день: apply БЕЗ флага — лимита НЕТ (implicit-лимит убран, ревью раунда 3)', () => {
  // Контракт плана 000064: «фонтан: исцеление лимит / монета — нет».
  // До ревью раунда 3 hasDailyLimit возвращал true на любое
  // «исполняемое» (есть apply) — фонтан монет получал бы ложный
  // лимит раз в день.
  const BE = loadBE();
  BE.EFFECTS['40'] = {
    имя: 'Монета',
    apply: () => ({ ok: true, message: '+1' }),
  };
  try {
    const b = { id: 40, особые_параметры: {} };
    assert.equal(BE.hasDailyLimit(b, '40'), false,
      'apply без флага — без лимита');
    // И через buildingActions: в тот же день — снова доступно.
    const st = makeState({
      day: 3, tile: { x: 5, y: 7 },
      save: { buildingOncePerDay: { '5,7:40': 3 } },
    });
    assert.equal(BE.buildingActions(b, null, st)[0].доступен, true,
      'запись в сейве без флага — не блокирует');
  } finally {
    delete BE.EFFECTS['40'];
  }
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

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

// --- Песочница: вся цепочка index.html ---

function bootSandbox() {
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
  const storage = makeStorage();
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

async function boot() {
  const h = bootSandbox();
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
//   * городские тайлы (000103: buildingId != null, building = -1 —
//     слотовой записи нет).
function findBuilding(G, myMap, start, wantNpc) {
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
          if (t.buildingId != null) continue; // город (000103)
        }
        visited.add(k);
        prev.set(k, cur.x + ',' + cur.y);
        if (t.hasBuilding) {
          const b = G.buildingForMapIndex(t.building);
          if (b) {
            const npc = G.npcForBuilding(npcList, b.id);
            if (!!npc === !!wantNpc) {
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
  // NPC ничего не делал. Реестр в этой задаче ПУСТ — тест регистрирует
  // СВОЮ запись EFFECTS (подзадачи 000074+ добавят свои).
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
  const b = G.buildingForMapIndex(t.building);
  assert.ok(b && !G.npcForBuilding(G.NpcData.NPCS, b.id),
    'постройка без NPC (id ' + (b && b.id) + ')');
  const fxId = String(b.id);
  const applied = [];
  // Лимит — ЯВНЫЙ флаг записи реестра разВДень (ревью раунда 3:
  // implicit «есть apply → лимит» убран — контракт плана 000064:
  // «фонтан: исцеление лимит / монета — нет»; без флага — см. B12).
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
    delete G.buildingEffects.EFFECTS[fxId];
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
  const t = myMap.tileAt(st.player.x, st.player.y);
  const b = G.buildingForMapIndex(t.building);
  const fxId = String(b.id);
  const applied = [];
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
    delete G.buildingEffects.EFFECTS[fxId];
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
  const t = myMap.tileAt(st.player.x, st.player.y);
  const b = G.buildingForMapIndex(t.building);
  const fxId = String(b.id);
  const applied = [];
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
    delete G.buildingEffects.EFFECTS[fxId];
  }
});

test('B12. раз-в-день: эффект БЕЗ флага — повторяем в тот же день (контракт плана 000064, ревью раунда 3)', async () => {
  // «Фонтан: исцеление лимит / монета — нет». До ревью раунда 3
  // implicit «есть apply → лимит» блокировал повторное нажатие
  // в тот же день; маркировки buildingOncePerDay быть НЕ должно.
  const h = await boot();
  const G = h.sandbox.Game;
  const g = h.sandbox.__game;
  const myMap = G.createMap(G.generateSeedPixels());
  const found = findBuilding(G, myMap, g.state.player, false);
  assert.ok(found, 'сценарий: найдена достижимая постройка без NPC');
  walkTo(h, found.steps);
  const st = g.state;
  const t = myMap.tileAt(st.player.x, st.player.y);
  const b = G.buildingForMapIndex(t.building);
  const fxId = String(b.id);
  const applied = [];
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
    delete G.buildingEffects.EFFECTS[fxId];
  }
});
