// Храмы 36/37/38 «Воскрешение» — спец-модуль (задача 000162;
// контракт — memory/000162-temple-resurrection.md).
//
// ПЕРВЫЙ ИНТЕРАКТИВНЫЙ спец-модуль (шаблон 000128 §2.3 + паттерн
// интерактивных спец-ов camp/49/45): «Воскрешение» — платная услуга:
// выбор погибшего наёмного из dead_mercs (СВОЙ DOM-пикер, НЕ
// buildingUI/controls) + мутации live-мира (gold −= цена,
// splice/push, saveNow/flash/playerRender). Синхронный роутер
// (onBuildingAction) выбор в себя НЕ влезает: resurrectPick
// открывает пикер и возвращает {ok:false} БЕЗ message — роутер
// молчаливо no-op (нет flash/mark/saveNow/render — R-1); подтверждение
// мутации делает confirmResurrect САМ через ctx.world (единственная
// точка saveNow/flash на успех — роутер на этом пути уже no-op).
//
// Чистый UMD (образец src/building-effect-camp.js): node — require()
// → { register, resurrectPick, open, close, isActive,
// confirmResurrect } (без саморегистрации — в node Game нет).
// Браузер — САМОРЕГИСТРАЦИЯ в Game.buildingActions.specials в момент
// загрузки + переназначение root.Game = Object.assign({}, G0, {…})
// (прецедент camp/49/45) — main.js снимает `const G = globalThis.Game`
// ОДИН раз при загрузке (UMD-ловушка 000038): тег ОБЯЗАТЕЛЬНО до
// main.js, иначе G.resurrectUI не в снапшоте. Пин порядка —
// tests/index-order.test.js (IO2).
//
// Гарды загрузки (деградация 000053 — игра не роняется; пин
// RES-BA1/IO2(b1/b2)):
//   * Game отсутствует (standalone-загрузка) — тихий выход
//     (0 console.error);
//   * Game есть, но Game.buildingActions отсутствует (нарушен
//     порядок: building-actions.js должен грузиться РАНЬШЕ) —
//     console.error (фиксированный текст) + регистрация НЕ
//     происходит.
//
// В момент загрузки — НОЛЬ зависимостей: ни require, ни DOM, ни
// чтения Game-функций (кроме регистрации), ни console (кроме ветки
// деградации), ни RNG (0 Math.random/Date — цена только Math.round,
// и то в ЧИСТОМ ядре building-effects.js, не здесь).
//
// Пикер — самодостаточный оверлей (СВОЙ класс .resurrect-overlay, НЕ
// .combat-overlay — R-12: чужие findOverlay/обработчики его не видят):
// div.cp-title «Воскрешение» (существующий класс) + по кандидату
// div.resurrect-row (курсор-префикс '▸ ' + «имя · ур. N · M оп.» +
// span.resurrect-price «−K зол.») + div.resurrect-hint. Ввод:
// ArrowUp/ArrowDown (wrap-around), Enter/NumpadEnter — подтвердить,
// Escape — тихая отмена (без flash/save). ОТКАЗ в confirm (мало
// золота / отряд полон) — пикер ОСТАЁТСЯ ОТКРЫТЫМ (Q-2).
//
// Гейты ввода — 3 точки main.js (R-3): keydown (гейт isActive),
// tryMove (inResurrect), touchControlsVisibility (building).
//
// Инвариант 000085: roster/deadMercs — const live-ссылки из
// deps-бандла — только splice/push, ПЕРЕЗАПИСЫВАТЬ ссылки НЕЛЬЗЯ.
// Регидратация reviveEntryFromRecord (чистая) — ДО мутаций: при
// null — нулевые мутации (запись-подделка/призрак).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = (typeof root.Game === 'object' && root.Game !== null
      && root.Game) ? root.Game : null;
    const mod = factory();
    mod.register(G0);
    if (G0) {
      root.Game = Object.assign({}, G0, {
        buildingEffectResurrect: mod,
        resurrectUI: {
          open: mod.open,
          close: mod.close,
          isActive: mod.isActive,
        },
      });
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // --- Состояние пикера (модульное; один пикер за раз) ---
  let active = false;
  let thisCtx = null;
  let thisCandidates = null;
  let cursor = 0;
  let overlay = null;
  let rows = [];
  let onKey = null;

  /**
   * Лимит отряда (зеркало src/companions.js deserializeRoster:
   * Number.isInteger && >= 1, иначе 3). Ленивое чтение из ctx.world
   * (Game.GlobalSettings, src/global-settings.js); мусор/отсутствие —
   * 3. Чистая.
   * @param {object} w world (deps-бандл main.js)
   * @returns {number}
   */
  function maxCompanions(w) {
    const gs = w && w.game && w.game.GlobalSettings;
    const raw = gs && gs.SETTINGS && gs.SETTINGS.max_companions;
    return (Number.isInteger(raw) && raw >= 1) ? raw : 3;
  }

  /**
   * Имя кандидата: мир-каталог npcs (live NPCS — чистый lookup) по
   * record.npcId; не найден / мусор — String(record.npcId).
   * record — запись dead_mercs (000161) или, в деградации, строка
   * npcId (backfill-форма).
   * @param {object} w world
   * @param {object|string} record
   * @returns {string}
   */
  function nameOf(w, record) {
    const id = (typeof record === 'string')
      ? record : (record && record.npcId);
    const npcs = w && w.npcs;
    if (typeof id === 'string' && id !== '' && Array.isArray(npcs)) {
      for (let i = 0; i < npcs.length; i++) {
        const n = npcs[i];
        if (n && n.id === id && typeof n.имя === 'string'
            && n.имя.length > 0) {
          return n.имя;
        }
      }
    }
    return (typeof id === 'string' && id !== '') ? id : 'наёмник';
  }

  /** Число sheet.level (целое > 0), иначе dflt. Мусор — dflt. */
  function sheetLevel(rec, dflt) {
    const s = rec && rec.sheet;
    const v = (s && typeof s === 'object') ? s.level : undefined;
    return (typeof v === 'number' && Number.isFinite(v) && v > 0)
      ? Math.floor(v) : dflt;
  }

  /** Число sheet.xp (целое ≥ 0), иначе dflt. Мусор — dflt. */
  function sheetXp(rec, dflt) {
    const s = rec && rec.sheet;
    const v = (s && typeof s === 'object') ? s.xp : undefined;
    return (typeof v === 'number' && Number.isFinite(v) && v >= 0)
      ? Math.floor(v) : dflt;
  }

  /**
   * Рендер строк пикера: курсор-префикс '▸ ' (text-маркер, паттерн
   * building-ui) + «имя · ур. N · M оп.» + span.resurrect-price
   * «−K зол.» (K = кандидата.цена, из ЧИСТОГО ядра building-effects).
   * textContent-сеттер сбрасывает детей — цену переподвязываем
   * после текста (каждый рендер — новая span, 0 DOM-утечек).
   */
  function renderRows() {
    const w = thisCtx && thisCtx.world;
    for (let i = 0; i < rows.length; i++) {
      const c = thisCandidates[i];
      const rec = c.record;
      const price = document.createElement('span');
      price.className = 'resurrect-price';
      price.textContent = '−' + c.цена + ' зол.';
      rows[i].textContent = (i === cursor ? '▸ ' : '') + nameOf(w, rec)
        + ' · ур. ' + sheetLevel(rec, 1)
        + ' · ' + sheetXp(rec, 0) + ' оп.';
      rows[i].appendChild(price);
    }
  }

  /**
   * Подтверждение кандидата — МУТАЦИОННОЕ ядро (без DOM). Порядок
   * КРИТИЧЕН (контракт §4): регидратация ДО мутаций — при null
   * ноль мутаций. Отказ — flash БЕЗ saveNow/мутаций, пикер ОТКРЫТ
   * (Q-2). Успех — ЕДИНСТВЕННАЯ точка saveNow/flash на успех
   * (роутер на этом пути уже no-op'нул — R-1).
   * @param {object} ctx ctx спец-хендлера (world — deps-бандл)
   * @param {object} record запись dead_mercs (ссылка из снимка)
   * @param {number} price цена кандидата (целое ≥ 0)
   * @returns {{ok: boolean, message?: string}}
   */
  function confirmResurrect(ctx, record, price) {
    const w = ctx && ctx.world;
    if (!w) return { ok: false, message: 'недоступно' };
    const dead = w.deadMercs;
    if (!Array.isArray(dead)) return { ok: false, message: 'недоступно' };
    // Запись в live-списке (снимок — shallow-копия: ссылки на записи
    // совпадают; fallback — по npcId, 000161).
    let i = dead.indexOf(record);
    if (i < 0) {
      i = dead.findIndex((r) => r && r.npcId === record.npcId);
    }
    if (i < 0) return { ok: false, message: 'недоступно' };
    const hero = w.hero;
    const g = hero && hero.gold;
    // Золото (DO мутации): цена кандидата, не min (контракт §4.2).
    if (Number.isFinite(g) && Number.isFinite(price) && g < price) {
      w.flash('мало золота');
      return { ok: false };
    }
    // Cap повторно (между apply и confirm мог измениться — страховка).
    const roster = w.roster;
    if (Array.isArray(roster) && roster.length >= maxCompanions(w)) {
      w.flash('отряд полон');
      return { ok: false };
    }
    const companions = w.game && w.game.companions;
    if (!companions ||
        typeof companions.reviveEntryFromRecord !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    // Регидратация (чистая) ДО мутаций: null — подделка/призрак →
    // нулевые мутации (запись остаётся в deadMercs).
    const entry = companions.reviveEntryFromRecord(w.npcs, record);
    if (!entry) return { ok: false, message: 'недоступно' };
    // Мутации (000085: splice/push, const-ссылки НЕ перезаписывать).
    if (Number.isFinite(g)) hero.gold = g - (Number.isFinite(price)
      ? price : 0);
    dead.splice(i, 1);
    roster.push(entry);
    // Завершение: saveNow/flash/playerRender — ТОЛЬКО здесь (R-1).
    w.saveNow();
    w.flash(nameOf(w, record) + ' снова в отряде.');
    w.playerRender();
    close();
    return { ok: true };
  }

  /**
   * Закрытие пикера: снимаем СВОЙ window-keydown-слушатель и DOM.
   * Тихое (без flash/save) — и на Escape, и после успеха. 0 console.
   */
  function close() {
    if (!active) return;
    active = false;
    if (onKey && typeof window !== 'undefined'
        && typeof window.removeEventListener === 'function') {
      window.removeEventListener('keydown', onKey);
    }
    if (overlay && typeof overlay.remove === 'function') {
      overlay.remove();
    }
    onKey = null;
    overlay = null;
    rows = [];
    thisCtx = null;
    thisCandidates = null;
    cursor = 0;
  }

  /** Пикер открыт? (гейты main.js, R-3; boolean). */
  function isActive() {
    return active;
  }

  /**
   * Открытие пикера (из resurrectPick; НЕ вызывается напрямую из
   * UI-кода). СВОЙ оверлей на document.body + СВОЙ window-keydown
   * (добавляется при open, снимается при close — main.js-гейт
   * делает главный обработчик no-op на время пикера; оба
   * слушателя срабатывают в порядке регистрации — stopPropagation
   * НЕ нужен, контракт §4).
   * @param {object} ctx ctx спец-хендлера
   * @param {Array<{record: object, цена: number}>} candidates
   */
  function open(ctx, candidates) {
    if (active) close();
    thisCtx = ctx;
    thisCandidates = candidates;
    cursor = 0;
    overlay = document.createElement('div');
    overlay.className = 'resurrect-overlay';
    const title = document.createElement('div');
    title.className = 'cp-title';
    title.textContent = 'Воскрешение';
    overlay.appendChild(title);
    rows = [];
    for (let i = 0; i < candidates.length; i++) {
      const row = document.createElement('div');
      row.className = 'resurrect-row';
      overlay.appendChild(row);
      rows.push(row);
    }
    const hint = document.createElement('div');
    hint.className = 'resurrect-hint';
    hint.textContent = '↑↓ — выбор · Enter — подтвердить · Esc — отмена';
    overlay.appendChild(hint);
    document.body.appendChild(overlay);
    onKey = (e) => {
      if (!active) return;
      const code = e && e.code;
      const prevent = e && typeof e.preventDefault === 'function';
      if (code === 'ArrowDown') {
        if (thisCandidates.length > 1) {
          cursor = (cursor + 1) % thisCandidates.length;
          renderRows();
        }
        if (prevent) e.preventDefault();
        return;
      }
      if (code === 'ArrowUp') {
        if (thisCandidates.length > 1) {
          cursor = (cursor - 1 + thisCandidates.length)
            % thisCandidates.length;
          renderRows();
        }
        if (prevent) e.preventDefault();
        return;
      }
      if (code === 'Enter' || code === 'NumpadEnter') {
        const c = thisCandidates[cursor];
        if (c) confirmResurrect(thisCtx, c.record, c.цена);
        if (prevent) e.preventDefault();
        return;
      }
      if (code === 'Escape') {
        close();
      }
    };
    window.addEventListener('keydown', onKey);
    active = true;
    renderRows();
  }

  /**
   * Синхронный обработчик роутера (registerSpecial('resurrect', …)):
   * 1) candidates — из ctx.r (результат ЧИСТОГО apply); пусто —
   *    «нет погибших» (двойная страховка — apply уже отфильтровал);
   * 2) отряд полон — «отряд полон» (роутер flash'ит БЕЗ
   *    mark/saveNow/render — отказ виден, лимит не сгорает);
   * 3) DOM-стража (в браузере недостижимо) — «недоступно»;
   * 4) пикер ОТКРЫТ → возврат {ok:false} БЕЗ message — ОТЛОЖЕННЫЙ
   *    результат (R-1): роутер молчаливый no-op, пикер
   *    перехватывает ввод (гейты §7 main.js).
   * @param {object} ctx ctx спец-хендлера (building-actions.js)
   * @returns {{ok: boolean, message?: string}}
   */
  function resurrectPick(ctx) {
    const w = ctx && ctx.world;
    const candidates = (ctx && ctx.r && Array.isArray(ctx.r.candidates))
      ? ctx.r.candidates : [];
    if (candidates.length === 0) {
      return { ok: false, message: 'нет погибших' };
    }
    const roster = w && w.roster;
    if (Array.isArray(roster) && roster.length >= maxCompanions(w)) {
      return { ok: false, message: 'отряд полон' };
    }
    // DOM-стража (в браузере недостижимо): document — ГЛОБАЛ (не
    // window.document — e2e-хarness выставляет document глобалом).
    if (typeof document === 'undefined' || !document.body) {
      return { ok: false, message: 'недоступно' };
    }
    open(ctx, candidates);
    return { ok: false };
  }

  /**
   * Саморегистрация в МОМЕНТ загрузки (браузерная ветка UMD).
   * Деградация 000053 (пин RES-BA1/IO2): Game нет — тихий выход;
   * Game есть, а buildingActions/registerSpecial нет — console.error
   * (фиксированный текст про порядок загрузки) + без регистрации,
   * игра не роняется.
   * @param {object|null} G Game (root.Game) или null (standalone)
   */
  function register(G) {
    if (!G) return; // standalone (без Game) — тихо (000053)
    if (!G.buildingActions ||
        typeof G.buildingActions.registerSpecial !== 'function') {
      console.error('building-effect-resurrect.js: ' +
        'Game.buildingActions отсутствует — src/building-actions.js ' +
        'обязан грузиться ДО этого модуля («Воскрешение» храма не ' +
        'работает)');
      return;
    }
    G.buildingActions.registerSpecial('resurrect', resurrectPick);
  }

  return {
    register,
    resurrectPick,
    open,
    close,
    isActive,
    confirmResurrect,
    // Чистые помощники (тестируемые; экспорт — паттерн camp/49/45).
    maxCompanions,
    nameOf,
  };
});
