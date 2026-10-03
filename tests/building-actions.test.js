// Задача 000128 (разбиение main.js 2/4): src/building-actions.js —
// роутер [E] у постройки + таблица спец-действий.
//
// Рефакторинг БЕЗ смены поведения: домен «действия у постройки [E]»
// переезжает из src/main.js (L632–917: openNpcDialog, onBuildingAction,
// scanTeleportPair, openBuildingUI, buildingRecForTile,
// toggleNpcDialog → toggle) в чистый UMD-модуль; в main.js остаётся
// тонкая проводка (KeyE/touch → G.buildingActions.toggle(), HUD-хинт,
// debug-действия) + именованные замыкания flash/moveHero/playerRender/
// startCombatAt + G.buildingActions.init(deps). Контракт зафиксирован
// в memory/000128-building-actions.md (для задач 000074+).
//
// КРАСНЫЕ тесты (TDD): написаны ДО реализации; падают, пока
// src/building-actions.js не существует и <script src> не подключён
// (MODULE_NOT_FOUND/ENOENT, Game.buildingActions undefined, pos === -1,
// main.js содержит onBuildingAction). Причина падения — отсутствие
// функциональности (не синтаксическая ошибка).
//
// Контракты, зафиксированные здесь:
//   * BA1 — модуль на месте: UMD node-ветка (module.exports — factory());
//     загрузка в ГОЛОМ realm чистая — ноль зависимостей в момент
//     загрузки (нет require/DOM/Game/console — прецедент 000053,
//     паттерн A14 building-effects); поверхность: init/toggle/
//     openBuildingUI/onBuildingAction/buildingRecForTile/
//     openNpcDialog/scanTeleportPair/registerSpecial + specials.
//   * BA2 — маршрут dialog vs effects: 'dialog' БЕЗ записи в реестре →
//     NPC-диалог с ПАРАМЕТРАМИ openNpcDialog 1:1 (контракт 000010:
//     npc, character: hero, book: questBook, tile { x, y, building,
//     buildingWealth }, shop: npcShopFor(npc.id), onChange: saveNow,
//     day: clock.day) — без saveNow/flash/render; запись с apply →
//     apply(СНИМОК { day, tile: {x, y} (новый объект), hero, save,
//     map }) ровно один раз, диалог НЕ открывается; порядок
//     apply → saveNow → flash(message) → playerRender (1:1 main.js).
//   * BA3 — РЕЕСТР ПЕРВЫМИ (000071 раунд-3): временная запись
//     EFFECTS['dialog'] перебивает диалог-фолбэк.
//   * BA4 — таблица спец-действий: registerSpecial guards (плохой
//     id/fn → console.error + НЕ зарегистрирован; дубликат id →
//     перезапись last-wins без ошибки); регистрация ДО init
//     (голый vm-скрипт — саморегистрация спец-модулей без правок
//     main.js — критерий 000074+); ctx-контракт (§2.5 memory:
//     day/tile/hero/save/map/r/action/b/t/npc + узкие точки
//     clock/moveHero/startCombat + world — весь deps-бандл);
//     отказ { ok: false } → flash БЕЗ saveNow/маркировки/render;
//     успех → saveNow + render (+ маркировка при hasDailyLimit —
//     ДЕЛАЕТ РОУТЕР, не хендлер); спец-а ПОСЛЕ apply-сторон:
//     ctx.r — результат apply, ctx.save — СВЕЖИЙ снимок (после
//     хука r.buffs).
//   * BA5 — full-chain index.html (vm): Game.buildingActions на месте
//     (вся поверхность), загрузка ЧИСТА (errors === 0), игра
//     стартовала (__game, карта, спавн), init сработан main.js при
//     ЗАГРУЗКЕ (роутерный вызов без нового console.error).
//   * BA6 — гард загрузочного пути (000053): модуль БЕЗ
//     Game.buildingEffects/Game.buildingUI — загрузка чистая (гарды —
//     только на вызове) + деградация: toggle/openBuildingUI →
//     console.error, БЕЗ исключений, openBuildingUI — false.
//   * BA7 — статика: main.js БЕЗ /\bonBuildingAction\b/ (критерий ТЗ:
//     будущие задачи вешают спец-действия БЕЗ правок main.js),
//     проводка на месте: 'G.buildingActions' + '.toggle('.
//
// Node-тесты (BA2–BA4) — через фейковые deps (бандл §2.2 memory);
// globalThis.Game в тестах НЕ трогается (в отличие от withGame-
// паттерна building-effects). vm-тест (BA5) — паттерн bootSandbox
// tests/building-effects.test.js (DOM/WebGL/localStorage-стабы,
// performance.now заморожен, мир детерминированный).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { SAVE_KEY } = require('../src/save.js');

const ROOT = path.join(__dirname, '..');
// Лазное чтение: до зелёной стадии файла нет — каждый тест падает на
// СВОЁМ require/ENOENT (осмысленный красный, не «мёртвый файл»).
const MOD = 'src/building-actions.js';
const MOD_CODE = () => fs.readFileSync(path.join(ROOT, MOD), 'utf8');

// --- Фейковые deps (бандл §2.2 memory — все 19 полей) + журнал вызовов
// (log — пин ПОРЯДКА пайплайна onBuildingAction, 1:1 main.js) ---

function makeEnv(over = {}) {
  const calls = { saveNow: 0, flash: [], playerRender: 0, moveHero: [],
    dialog: [] };
  const log = [];
  const map = over.map !== undefined ? over.map : { fakeMap: true };
  const deps = {
    game: null, // фейковый Game — ниже (циклическая ссылка допустима)
    clock: { day: 5 },
    hero: { hp: 10, gold: 100 },
    player: { x: 5, y: 7 },
    prevPos: { x: 5, y: 7 },
    getMap: () => map,
    mover: null,
    npcs: [],
    questBook: { fakeBook: true },
    npcShopFor: (id) => ({ shopFor: id }),
    // СНИМОК отражает ЖИВОЕ состояние в момент ВЫЗОВА (свежесть —
    // §2.5 memory: хендлер видит мир ПОСЛЕ apply-сторон).
    collectSaveData: () => ({
      day: 5,
      buffs: deps.buffs.map((b) => Object.assign({}, b)),
    }),
    saveNow: () => { calls.saveNow++; log.push('saveNow'); },
    flash: (m) => { calls.flash.push(m); log.push('flash:' + m); },
    buildingOncePerDay: new Map(),
    buffs: over.buffs ? over.buffs.slice() : [],
    teleports: new Map(),
    playerRender: () => { calls.playerRender++; log.push('render'); },
    moveHero: (x, y) => { calls.moveHero.push([x, y]); },
    startCombat: () => {},
  };
  // 000083: состояние отряда — только если тест передаёт (дефолт
  // makeEnv — БЕЗ ключей: W1(b) — deps без roster/deadMercs →
  // undefined в payload, краха нет). Существующие ассерты BA2
  // (payload по полям) не трогаются.
  if (over.roster !== undefined) deps.roster = over.roster;
  if (over.deadMercs !== undefined) deps.deadMercs = over.deadMercs;
  const game = {
    buildingEffects: {
      EFFECTS: {},
      hasDailyLimit: (b, id) => !!(over.dailyLimit && over.dailyLimit[id]),
    },
    npcUI: {
      open: (p) => { calls.dialog.push(p); log.push('dialog'); },
    },
  };
  deps.game = game;
  return { calls, log, game, deps, map };
}

// require + init(deps) — каждый тест получает СВОЙ мир (re-init допустим:
// init — присвоение бандла, main.js вызывает его один раз при загрузке).
function initMod(over) {
  const env = makeEnv(over);
  const BA = require('../src/building-actions.js'); // RED: MODULE_NOT_FOUND
  BA.init(env.deps);
  return Object.assign({ BA }, env);
}

test('BA1. модуль на месте: UMD node-ветка + чистая одиночная загрузка, ноль зависимостей при загрузке (задача 000128)', () => {
  const BA = require('../src/building-actions.js'); // RED: файла нет
  assert.ok(BA && typeof BA === 'object',
    'module.exports — объект (UMD node-ветка)');
  for (const m of ['init', 'toggle', 'openBuildingUI', 'onBuildingAction',
    'buildingRecForTile', 'openNpcDialog', 'scanTeleportPair',
    'registerSpecial', 'interactCity']) {
    assert.equal(typeof BA[m], 'function', 'поверхность модуля: ' + m);
  }
  assert.ok(BA.specials && typeof BA.specials === 'object',
    'specials — таблица спец-действий (обычный объект)');
  // Одиночная загрузка в голой песочнице (паттерн A14
  // building-effects): sandbox БЕЗ require/module — если бы модуль
  // тащил зависимости при загрузке, здесь ReferenceError (000053).
  const sandbox = { console };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(MOD_CODE(), sandbox, { filename: 'building-actions.js' });
  const G2 = sandbox.Game;
  assert.ok(G2 && typeof G2 === 'object',
    'браузерная ветка: root.Game заменён');
  assert.ok(G2.buildingActions, 'Game.buildingActions в голом realm');
  assert.equal(typeof G2.buildingActions.toggle, 'function',
    'toggle в голом realm');
  assert.ok(G2.buildingActions.specials, 'specials в голом realm');
});

test('BA2. маршрут dialog vs effects: диалог — 1:1 payload, эффект — apply(снимок) один раз, диалог не открывается (задача 000128)', () => {
  const e = initMod({});
  const npc = { id: 'npc_x', имя: 'Тест' };
  const t = { x: 5, y: 7, hasBuilding: true, building: 3, buildingWealth: 2 };
  const b = { id: 30, название: 'Тестовая постройка' };

  // (a) 'dialog' БЕЗ записи в реестре → NPC-диалог, ПАРАМЕТРЫ
  // openNpcDialog 1:1 (контракт 000010), без saveNow/flash/render.
  e.BA.onBuildingAction(
    { id: 'dialog', имя: 'Диалог', доступен: true }, t, b, npc);
  assert.equal(e.calls.dialog.length, 1,
    'диалог-фолбэк: npcUI.open вызван');
  assert.equal(e.calls.saveNow, 0, 'диалог: saveNow НЕТ (1:1)');
  assert.equal(e.calls.flash.length, 0, 'диалог: flash НЕТ (1:1)');
  assert.equal(e.calls.playerRender, 0, 'диалог: playerRender НЕТ (1:1)');
  const p = e.calls.dialog[0];
  assert.equal(p.npc, npc, 'payload.npc — сам NPC');
  assert.equal(p.character, e.deps.hero, 'payload.character — hero (live)');
  assert.equal(p.book, e.deps.questBook, 'payload.book — questBook');
  assert.deepEqual(p.tile,
    { x: 5, y: 7, building: 3, buildingWealth: 2 },
    'payload.tile — { x, y, building, buildingWealth } (контракт 000010)');
  assert.deepEqual(p.shop, { shopFor: 'npc_x' },
    'payload.shop — npcShopFor(npc.id) (явная ссылка)');
  assert.equal(p.onChange, e.deps.saveNow, 'payload.onChange — saveNow (ссылка)');
  assert.equal(p.day, 5, 'payload.day — clock.day');

  // (b) синтетический эффект (id 88 — паттерн 000075, save/restore в
  // try/finally): entry.apply(СНИМОК) ровно один раз, диалог НЕ
  // открывается, порядок apply → saveNow → flash(message) → render.
  const applied = [];
  const BE = e.game.buildingEffects;
  const had = Object.prototype.hasOwnProperty.call(BE.EFFECTS, '88');
  const prior = BE.EFFECTS['88'];
  try {
    BE.EFFECTS['88'] = {
      имя: 'Тест-эффект',
      apply: (st) => {
        applied.push(st); e.log.push('apply:88');
        return { ok: true, message: 'ба-э' };
      },
    };
    e.log.length = 0;
    e.calls.dialog.length = 0; // (a) уже открыл один — измеряем только (b)
    e.BA.onBuildingAction(
      { id: '88', имя: 'Тест-эффект', доступен: true }, t, b, npc);
    assert.equal(applied.length, 1, 'entry.apply — ровно один раз');
    const s = applied[0];
    assert.equal(s.day, 5, 'state.day — clock.day');
    assert.deepEqual(s.tile, { x: 5, y: 7 }, 'state.tile — { x, y } тайла героя');
    assert.notEqual(s.tile, e.deps.player, 'state.tile — НОВЫЙ объект (снимок)');
    assert.equal(s.hero, e.deps.hero, 'state.hero — live-ссылка');
    assert.ok(s.save && typeof s.save === 'object',
      'state.save — снимок (обычный объект)');
    assert.equal(s.map, e.map, 'state.map — ссылка getMap() (map || null)');
    assert.equal(e.calls.dialog.length, 0, 'эффект: диалог НЕ открывается');
    assert.deepEqual(e.log,
      ['apply:88', 'saveNow', 'flash:ба-э', 'render'],
      'порядок: apply → saveNow → flash(message) → playerRender (1:1)');
    assert.equal(e.calls.saveNow, 1, 'apply ok: saveNow один раз');
    assert.deepEqual(e.calls.flash, ['ба-э'], 'apply ok: flash(message)');
    assert.equal(e.calls.playerRender, 1, 'apply ok: playerRender один раз');
    assert.equal(e.deps.buildingOncePerDay.size, 0,
      'нет hasDailyLimit → маркировки нет');
  } finally {
    if (had) BE.EFFECTS['88'] = prior;
    else delete BE.EFFECTS['88'];
  }
});

test('BA3. реестр ПЕРВЫМИ: запись EFFECTS «dialog» перебивает диалог-фолбэк (000071 раунд-3)', () => {
  const e = initMod({});
  const npc = { id: 'npc_x', имя: 'Тест' };
  const t = { x: 5, y: 7, hasBuilding: true, building: 3, buildingWealth: 2 };
  const b = { id: 30, название: 'Тестовая постройка' };
  const applied = [];
  const BE = e.game.buildingEffects;
  const had = Object.prototype.hasOwnProperty.call(BE.EFFECTS, 'dialog');
  const prior = BE.EFFECTS['dialog'];
  try {
    BE.EFFECTS['dialog'] = {
      имя: 'Регистр-диалог',
      apply: (st) => {
        applied.push(st); e.log.push('apply:dialog');
        return { ok: true, message: 'регистр победил' };
      },
    };
    e.log.length = 0;
    e.BA.onBuildingAction(
      { id: 'dialog', имя: 'Диалог', доступен: true }, t, b, npc);
    assert.equal(applied.length, 1,
      'EFFECTS «dialog».apply — вызвана (реестр ПЕРВЫМИ)');
    assert.equal(e.calls.dialog.length, 0,
      'диалог-фолбэк НЕ перебивает запись реестра');
    assert.deepEqual(e.log,
      ['apply:dialog', 'saveNow', 'flash:регистр победил', 'render'],
      'запись реестра идёт через тот же пайплайн');
  } finally {
    if (had) BE.EFFECTS['dialog'] = prior;
    else delete BE.EFFECTS['dialog'];
  }
});

test('BA4. таблица спец-действий: guards registerSpecial, ctx-контракт, отказ/успех, саморегистрация (задача 000128)', () => {
  const e = initMod({ dailyLimit: { ba4_ok: true },
    buffs: [{ id: 'old', kind: 'old' }] });
  const BA = e.BA;
  const BE = e.game.buildingEffects;
  const t = { x: 5, y: 7, hasBuilding: true, building: 3, buildingWealth: 2 };
  const b = { id: 30, название: 'Тестовая постройка' };
  const npc = { id: 'npc_x', имя: 'Тест' };
  const resetCalls = () => {
    e.calls.saveNow = 0; e.calls.flash.length = 0;
    e.calls.playerRender = 0; e.log.length = 0;
  };

  // (a)–(f) — node: guards, ctx, отказ/успех, apply → спец-а.
  const errs = [];
  const origErr = console.error;
  console.error = (...a) => { errs.push(a.map(String).join(' ')); };
  try {
    // (a) registerSpecial guards: плохой id/fn → console.error + НЕ
    // зарегистрирован (игра не роняется — 000053). Ключ сейва
    // 'x,y:effectId' не терпит ':'/','/пробелов (000072).
    const good = () => ({ ok: true });
    for (const badId of [123, '', 'bad id', 'a:b', 'a,b']) {
      const n0 = errs.length;
      BA.registerSpecial(badId, good);
      assert.equal(BA.specials[badId], undefined,
        'плохой id ' + JSON.stringify(badId) + ' → не зарегистрирован');
      assert.ok(errs.length > n0,
        'плохой id ' + JSON.stringify(badId) + ' → console.error');
    }
    {
      const n0 = errs.length;
      BA.registerSpecial('ba4_fn', 'не функция');
      assert.equal(BA.specials.ba4_fn, undefined,
        'fn не функция → не зарегистрирован');
      assert.ok(errs.length > n0, 'fn не функция → console.error');
    }
    // (b) валидный id → зарегистрирован без ошибки; дубликат id →
    // перезапись (last-wins), без ошибки.
    const n1 = errs.length;
    const fnA = () => ({ ok: true, message: 'A' });
    const fnB = () => ({ ok: true, message: 'B' });
    BA.registerSpecial('ba4_dup', fnA);
    assert.equal(BA.specials.ba4_dup, fnA, 'валидный id → зарегистрирован');
    assert.equal(errs.length, n1, 'валидная регистрация — тихо');
    BA.registerSpecial('ba4_dup', fnB);
    assert.equal(BA.specials.ba4_dup, fnB,
      'дубликат id → перезапись (last-wins)');
    assert.equal(errs.length, n1, 'дубликат — без ошибки');

    // (c) ctx-контракт: entry БЕЗ apply + спец-а → хендлер вызывается,
    // ctx — снимок + узкие точки, ctx.r === null; успех → saveNow +
    // flash + render, без маркировки (нет hasDailyLimit).
    const seen = {};
    BA.registerSpecial('ba4_ctx', (ctx) => {
      seen.ctx = ctx; e.log.push('special:ba4_ctx');
      return { ok: true, message: 'спец сработал' };
    });
    resetCalls();
    const act = { id: 'ba4_ctx', имя: 'Спец', доступен: true };
    BA.onBuildingAction(act, t, b, npc);
    const ctx = seen.ctx;
    assert.ok(ctx, 'спец-хендлер вызван');
    assert.equal(ctx.day, 5, 'ctx.day — clock.day');
    assert.deepEqual(ctx.tile, { x: 5, y: 7 }, 'ctx.tile — { x, y } (снимок)');
    assert.notEqual(ctx.tile, e.deps.player, 'ctx.tile — НОВЫЙ объект');
    assert.equal(ctx.hero, e.deps.hero,
      'ctx.hero — ЖИВАЯ ссылка (хендлер может мутировать)');
    assert.ok(ctx.save && typeof ctx.save === 'object', 'ctx.save — снимок');
    assert.equal(ctx.map, e.map, 'ctx.map — live-ссылка (read-only)');
    assert.equal(ctx.r, null, 'entry без apply → ctx.r === null');
    assert.equal(ctx.action, act, 'ctx.action — строка оверлея');
    assert.equal(ctx.b, b, 'ctx.b — каталожная запись');
    assert.equal(ctx.t, t, 'ctx.t — тайл постройки');
    assert.equal(ctx.npc, npc, 'ctx.npc');
    assert.equal(ctx.clock, e.deps.clock, 'ctx.clock — live clock (узкая точка)');
    assert.equal(ctx.moveHero, e.deps.moveHero,
      'ctx.moveHero — узкая точка (ссылка проводки, не копание по Game)');
    assert.equal(ctx.startCombat, e.deps.startCombat,
      'ctx.startCombat — узкая точка');
    assert.ok(ctx.world && typeof ctx.world === 'object',
      'ctx.world — escape-hatch (deps-бандл)');
    for (const k of ['game', 'clock', 'hero', 'player', 'prevPos',
      'getMap', 'mover', 'npcs', 'questBook', 'npcShopFor',
      'collectSaveData', 'saveNow', 'flash', 'buildingOncePerDay',
      'buffs', 'teleports', 'playerRender', 'moveHero', 'startCombat']) {
      assert.equal(ctx.world[k], e.deps[k],
        'ctx.world.' + k + ' — deps-бандл (ссылка)');
    }
    assert.deepEqual(e.log,
      ['special:ba4_ctx', 'saveNow', 'flash:спец сработал', 'render'],
      'успех: saveNow → flash(message) → playerRender');
    assert.equal(e.calls.saveNow, 1, 'успех: saveNow один раз');
    assert.equal(e.deps.buildingOncePerDay.size, 0,
      'нет hasDailyLimit → маркировки нет');

    // (d) отказ { ok: false } → flash(message) БЕЗ saveNow/маркировки/
    // render (семантика отказа apply — §2.4/§2.6 memory).
    resetCalls();
    BA.registerSpecial('ba4_reject', () => {
      e.log.push('special:ba4_reject');
      return { ok: false, message: 'спец отказал' };
    });
    BA.onBuildingAction(
      { id: 'ba4_reject', имя: 'Отказ', доступен: true }, t, b, npc);
    assert.deepEqual(e.log, ['special:ba4_reject', 'flash:спец отказал'],
      'отказ: flash(message), больше ничего');
    assert.equal(e.calls.saveNow, 0, 'отказ: saveNow НЕ вызван');
    assert.equal(e.calls.playerRender, 0, 'отказ: playerRender НЕ вызван');
    assert.equal(e.deps.buildingOncePerDay.size, 0,
      'отказ: маркировки раз-в-день нет');
    resetCalls();
    BA.registerSpecial('ba4_reject_silent', () => ({ ok: false }));
    BA.onBuildingAction(
      { id: 'ba4_reject_silent', имя: 'Тихо', доступен: true }, t, b, npc);
    assert.deepEqual(e.log, [],
      'отказ без message — молча (нет flash/save/render)');

    // (e) успех + hasDailyLimit → маркировку ДЕЛАЕТ РОУТЕР
    // ('x,y:effectId' → clock.day, 000072), не хендлер (§5 memory).
    resetCalls();
    BA.registerSpecial('ba4_ok', () => ({ ok: true, message: 'спец ок' }));
    BA.onBuildingAction(
      { id: 'ba4_ok', имя: 'Ок', доступен: true }, t, b, npc);
    assert.deepEqual(e.log, ['saveNow', 'flash:спец ок', 'render'],
      'успех с лимитом: saveNow → flash → render');
    assert.equal(e.deps.buildingOncePerDay.get('5,7:ba4_ok'), 5,
      'маркировка «x,y:effectId» → день — роутером (000072)');

    // (f) спец-а ПОСЛЕ apply-сторон (тот же id: entry с apply +
    // спец-а): apply ПЕРВЫМ, затем хендлер; ctx.r — результат apply,
    // ctx.save — СВЕЖИЙ снимок (ПОСЛЕ хука r.buffs — §2.5/§6.6 memory).
    resetCalls();
    const applied = [];
    const rObj = { ok: true, message: 'r-сообщение',
      buffs: [{ id: 'new', kind: 'new' }] };
    BE.EFFECTS['ba4_both'] = {
      имя: 'Оба',
      apply: (st) => {
        applied.push(st); e.log.push('apply:ba4_both');
        return rObj;
      },
    };
    const seen2 = {};
    BA.registerSpecial('ba4_both', (ctx) => {
      seen2.ctx = ctx; e.log.push('special:ba4_both');
      return { ok: true, message: 's-сообщение' };
    });
    try {
      BA.onBuildingAction(
        { id: 'ba4_both', имя: 'Оба', доступен: true }, t, b, npc);
      assert.equal(applied.length, 1, 'apply — один раз (ДО спец-а)');
      const ctx2 = seen2.ctx;
      assert.ok(ctx2, 'спец-а — ПОСЛЕ apply');
      assert.equal(ctx2.r, rObj, 'ctx.r — результат apply (не null)');
      assert.deepEqual(ctx2.save.buffs, [{ id: 'new', kind: 'new' }],
        'ctx.save — СВЕЖИЙ снимок: ПОСЛЕ apply-сторон (r.buffs)');
      assert.deepEqual(applied[0].save.buffs, [{ id: 'old', kind: 'old' }],
        'apply-снимок — ДО apply-сторон');
      assert.deepEqual(e.deps.buffs, [{ id: 'new', kind: 'new' }],
        'r.buffs — заменяет живой массив (1:1 хук 000076)');
      assert.deepEqual(e.log,
        ['apply:ba4_both', 'special:ba4_both', 'saveNow',
          'flash:r-сообщение', 'render'],
        'порядок: apply → спец-а → saveNow → flash (r.message ПЕРВЫМ) → render');
    } finally {
      delete BE.EFFECTS['ba4_both'];
    }
  } finally {
    console.error = origErr;
  }

  // (g) саморегистрация: будущий спец-модуль регистрирует обработчик
  // в момент СВОЕЙ загрузки — БЕЗ правок main.js и building-actions.js
  // (критерий ТЗ 000074+). Голый vm — СВЕЖИЙ экземпляр модуля, init
  // НЕ вызван: registerSpecial работает ДО init (§2.6 memory).
  const loadErrs = [];
  const sandbox = {
    console: {
      error: (m) => loadErrs.push(String(m)),
      warn: () => {}, log: () => {},
    },
  };
  sandbox.Game = {};
  vm.createContext(sandbox);
  vm.runInContext(MOD_CODE(), sandbox, { filename: 'building-actions.js' });
  assert.equal(loadErrs.length, 0, 'загрузка в голом realm — чистая');
  vm.runInContext(
    "Game.buildingActions.registerSpecial('test_special', " +
    "function (ctx) { return { ok: true, message: 'self-registered' }; });",
    sandbox, { filename: 'synthetic-special.js' });
  assert.equal(
    typeof sandbox.Game.buildingActions.specials.test_special, 'function',
    'specials «test_special» — зарегистрирован внешним скриптом ' +
    '(БЕЗ правок main.js)');
  assert.equal(loadErrs.length, 0, 'регистрация ДО init — без ошибки');
});

// --- BA5: vm-песочница — вся цепочка index.html (паттерн
// bootSandbox tests/building-effects.test.js: DOM/WebGL/localStorage-
// стабы, performance.now заморожен на NOW, мир детерминированный —
// map.png onerror → generateSeedPixels) ---

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

// --- localStorage-мок (сейвы реально пишутся/читаются) ---
function makeStorage(seed) {
  const m = new Map();
  if (seed != null) m.set(SAVE_KEY, JSON.stringify(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
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

test('BA5. full-chain index.html: Game.buildingActions на месте, загрузка чистая, игра стартовала (задача 000128)', async () => {
  const h = await boot();
  assert.equal(h.errors.length, 0,
    'ошибок загрузки нет: ' + h.errors.join('; '));
  const ba = h.sandbox.Game.buildingActions;
  assert.ok(ba, 'Game.buildingActions на месте (src/building-actions.js)');
  for (const m of ['init', 'toggle', 'openBuildingUI', 'onBuildingAction',
    'buildingRecForTile', 'openNpcDialog', 'scanTeleportPair',
    'registerSpecial', 'interactCity']) {
    assert.equal(typeof ba[m], 'function', 'Game.buildingActions.' + m);
  }
  assert.ok(ba.specials && typeof ba.specials === 'object',
    'specials — таблица спец-действий');
  // Игра стартовала (main.js — в цепочке ПОСЛЕ модуля).
  const g = h.sandbox.__game;
  assert.ok(g, 'globalThis.__game выставлен (main.js выполнен)');
  assert.ok(g.state.map, 'карта сгенерирована');
  assert.ok(g.state.player, 'спавн найден');
  // init сработан main.js при ЗАГРУЗКЕ (wiring-блок): роутерный вызов
  // — БЕЗ нового console.error (§2.6 memory: в корректной цепочке
  // init-гард — сетка безопасности, срабатывать не обязан).
  const errCount = h.errors.length;
  assert.equal(ba.buildingRecForTile({ hasBuilding: false }), null,
    'buildingRecForTile — null без постройки (работает, init сработан)');
  assert.equal(h.errors.length, errCount,
    'роутерный вызов без нового console.error — init сработан main.js');
});

test('BA6. загрузка без buildingEffects/buildingUI: чистая загрузка + деградация без исключений (000053)', () => {
  const errors = [];
  const sandbox = {
    console: {
      error: (m) => errors.push(String(m)),
      warn: () => {}, log: () => {},
    },
  };
  sandbox.Game = {}; // НЕТ buildingEffects, buildingUI, npcUI, dungeonUI
  vm.createContext(sandbox);
  vm.runInContext(MOD_CODE(), sandbox, { filename: 'building-actions.js' });
  assert.equal(errors.length, 0,
    'загрузка без зависимостей — без ошибок (гарды — только на вызове)');
  const ba = sandbox.Game.buildingActions;
  assert.ok(ba, 'модуль создан (не «умирает» без зависимостей)');
  // Вызовы — деградация: console.error + без исключения (игра не
  // роняется — 000053).
  let threw = false;
  try { ba.toggle(); } catch (err) { threw = true; }
  assert.equal(threw, false, 'toggle — без исключения');
  assert.ok(errors.length >= 1, 'гард оставил след в консоли');
  let r = undefined;
  try { r = ba.openBuildingUI(null, null, null); } catch (err) { threw = true; }
  assert.equal(threw, false, 'openBuildingUI — без исключения');
  assert.equal(r, false, 'openBuildingUI без init — false (деградация)');
});

test('BA7. [E]-wiring вынесен из main.js: onBuildingAction нет, проводка на месте (задача 000128)', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(!/\bonBuildingAction\b/.test(main),
    'main.js после задачи 000128 не содержит onBuildingAction: домен ' +
    'переехал в src/building-actions.js (критерий ТЗ: будущие задачи ' +
    'вешают спец-действия БЕЗ правок main.js)');
  assert.ok(main.includes('G.buildingActions'),
    'main.js: тонкая проводка — G.buildingActions (init/деградация)');
  assert.ok(main.includes('.toggle('),
    'main.js: вызов .toggle() (KeyE/touch → Game.buildingActions.toggle())');
});

// --- 000083: состояние отряда (roster/deadMercs) в проводке найма ---
//
// Kонтракт (memory/000083-hire-tab-ui.md §4/§7): main.js вводит
// ЖИВЫЕ const-массивы roster (записи {npcId, level, xp, loyalty,
// hiredDay}) и deadMercs ([npcId]); deps-бандл G.buildingActions.init
// передаёт ТЕ ЖЕ ссылки в openNpcDialog → npcUI.open (контракт 000128
// §2.2): мутация hire/dismiss (push/splice) видна на всех трёх
// уровнях без переснабоксовки; 000085 восстановит in place
// (length=0 + push — ПЕРЕЗАПИСЫВАТЬ const-ссылки нельзя).

test('W1. 000083: openNpcDialog — payload несёт roster/deadMercs из deps: ЖИВЫЕ ссылки; deps без ключей — undefined, краха нет', () => {
  // (a) Живые ссылки: payload — ТОТ ЖЕ массив, что в deps (не копия):
  // 000085 restore in place, npcUI мутирует через hire/dismiss.
  const R = [];
  const D = [];
  const e = initMod({ roster: R, deadMercs: D });
  const npc = { id: 'npc_x', имя: 'Тест' };
  const t = { x: 5, y: 7, hasBuilding: true, building: 3,
    buildingWealth: 2 };
  const b = { id: 30, название: 'Тестовая постройка' };
  e.BA.onBuildingAction(
    { id: 'dialog', имя: 'Диалог', доступен: true }, t, b, npc);
  assert.equal(e.calls.dialog.length, 1, 'диалог: npcUI.open вызван');
  const p = e.calls.dialog[0];
  assert.equal(p.roster, R,
    'payload.roster — deps.roster (ЖИВАЯ ссылка, не копия)');
  assert.equal(p.deadMercs, D,
    'payload.deadMercs — deps.deadMercs (ЖИВАЯ ссылка, не копия)');

  // (b) deps БЕЗ ключей (дефолт makeEnv — старые вызовы/тесты) —
  // undefined в payload, краха нет (open() → null → тихая
  // деградация вкладки «найм»).
  const e2 = initMod({});
  e2.BA.onBuildingAction(
    { id: 'dialog', имя: 'Диалог', доступен: true }, t, b, npc);
  assert.equal(e2.calls.dialog.length, 1, 'диалог открыт (краха нет)');
  assert.equal(e2.calls.dialog[0].roster, undefined,
    'deps без roster → payload.roster undefined');
  assert.equal(e2.calls.dialog[0].deadMercs, undefined,
    'deps без deadMercs → payload.deadMercs undefined');
});

test('W2. 000083: main.js — состояние отряда: const roster (фабрика createRoster, guard) + const deadMercs; оба — в deps-бандле buildingActions.init', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  assert.ok(main.includes('const roster'),
    'main.js: const roster — ЖИВОЙ массив записей отряда (const, НЕ ' +
    'let: 000085 восстановит СТРОГО in place — length=0 + push)');
  assert.ok(main.includes('const deadMercs'),
    'main.js: const deadMercs — ЖИВОЙ массив [npcId] погибших');
  assert.ok(main.includes('createRoster'),
    'main.js: запись рождается фабрикой G.companions.createRoster ' +
    '(guard: модуль отсутствует — [] + console.error, паттерн efir ' +
    '000081)');
  // Проводка: оба — в deps-бандле G.buildingActions.init({...})
  // (~L758, после buildingQuests). collectSaveData/restoreFromSave —
  // НЕ пинить (зона 000085).
  const m = /G\.buildingActions\.init\(\{[\s\S]*?\}\);/.exec(main);
  assert.ok(m, 'main.js: G.buildingActions.init({...}) — блок проводки');
  assert.ok(m[0].includes('roster'),
    'deps-бандл init: roster (live Array → npcUI.open)');
  assert.ok(m[0].includes('deadMercs'),
    'deps-бандл init: deadMercs (live Array [npcId])');
});
