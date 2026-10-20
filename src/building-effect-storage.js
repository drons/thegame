// Задача 000221: город — здание «Хранилище» (склад предметов из
// инвентаря). UMD-спец-модуль (паттерн building-effect-fullrest.js):
// node — module.exports {storageHandler}; browser — саморегистрация
// Game.buildingActions.registerSpecial('storage', …). НОЛЬ require:
// всё — из спец-ctx 000128 ({t, b, hero, world: deps}) и world.game.
// Контракты: memory/000221-city-storage.md (D9).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  function itemName(game, itemId) {
    const g = game && typeof game === 'object' ? game : {};
    const it = typeof g.getItem === 'function' ? g.getItem(itemId) : null;
    if (it && typeof it.name === 'string' && it.name !== '')
      return it.name;
    console.error('building-effect-storage.js: предмет «' + itemId
      + '» не найден в каталоге (items.js getItem) — использован id');
    return String(itemId);
  }

  function bonusSuffix(entry) {
    return entry && entry.bonus ? ' (улучш.)' : '';
  }

  function flash(w, msg) {
    if (w && typeof w.flash === 'function') w.flash(msg);
  }

  function saveNow(w) {
    if (w && typeof w.saveNow === 'function') w.saveNow();
  }

  function playerRender(w) {
    if (w && typeof w.playerRender === 'function') w.playerRender();
  }

  // Резолв хранилища (гарды — порядок Р7): якорь → cityStates →
  // record → storageAt → capacity → buildingUI. Не-ок — {fail}
  // (message — видимый отказ пайплайна; err — wiring-сбой).
  function resolveCtx(ctx) {
    const t = ctx && ctx.t;
    const w = ctx && ctx.world;
    if (!t || !t.cityAnchor) {
      return { ok: false, fail: { ok: false,
        message: 'Город не найден (якорь не решён)' } };
    }
    const cs = w && w.cityStates;
    if (!cs || typeof cs.get !== 'function') {
      return { ok: false, fail: { ok: false,
        message: 'Состояние города недоступно' } };
    }
    const record = cs.get(t.cityAnchor);
    if (!record) {
      return { ok: false, fail: { ok: false,
        message: 'Постройка не найдена' } };
    }
    const g = w && typeof w.game === 'object' && !Array.isArray(w.game)
      ? w.game : null;
    const C = g && g.Cities;
    const storage = C && typeof C.storageAt === 'function'
      ? C.storageAt(record, t.x, t.y) : null;
    if (!storage) {
      return { ok: false, fail: { ok: false,
        message: 'Постройка не найдена' } };
    }
    const b = ctx && ctx.b;
    // 000222: ёмкость по УРОВНЮ записи (buildingLevelAt — absent/
    // мусор → 1 — 1-аргументный бит-в-бит 000221).
    const level = C && typeof C.buildingLevelAt === 'function'
      ? C.buildingLevelAt(record, t.x, t.y) : null;
    const capacity = C && typeof C.storageCapacity === 'function'
      ? C.storageCapacity(b && b.id, level) : 0;
    if (!Number.isFinite(capacity) || capacity <= 0) {
      return { ok: false, fail: { ok: false,
        message: 'Хранилище недоступно' } };
    }
    const ui = g && g.buildingUI;
    if (!ui || typeof ui.open !== 'function') {
      return { ok: false, err: true, fail: { ok: false,
        message: 'Панель недоступна (wiring-сбой)' } };
    }
    return { ok: true, w: w, g: g, C: C, record: record,
      storage: storage, capacity: capacity, hero: ctx && ctx.hero };
  }

  // Строки оверлея FLAT (buildingUI): put-* ПЕРЕД take-*; имя —
  // «Сложить: <имя> ×<qty>» / «Вынуть: <имя> ×<qty>» (+ «(улучш.)»);
  // put — доступен при месте (иначе reason «хранилище полное (N/M)»);
  // take — dry-run canAddItem (reason — из dry-run); оба пусты — одна
  // disabled-строка 'empty'.
  function buildRows(res) {
    const rows = [];
    const hero = res.hero;
    const inv = hero && hero.inventory;
    const slots = inv && Array.isArray(inv.slots) ? inv.slots : [];
    for (let i = 0; i < slots.length; i++) {
      const e = slots[i];
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      const row = { id: 'put-' + i, itemId: e.id,
        bonus: e.bonus === undefined ? null : e.bonus,
        qty: e.qty,
        имя: 'Сложить: ' + itemName(res.g, e.id) + ' ×' + e.qty
          + bonusSuffix(e),
        доступен: res.storage.length < res.capacity };
      if (!row.доступен) {
        row.reason = 'хранилище полное (' + res.storage.length + '/'
          + res.capacity + ')';
      }
      rows.push(row);
    }
    for (let j = 0; j < res.storage.length; j++) {
      const e = res.storage[j];
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      const bns = e.bonus === undefined ? null : e.bonus;
      const chk = typeof res.g.canAddItem === 'function'
        ? res.g.canAddItem(hero, e.id, e.qty, bns) : { ok: true };
      const row = { id: 'take-' + j, itemId: e.id, bonus: bns,
        qty: e.qty,
        имя: 'Вынуть: ' + itemName(res.g, e.id) + ' ×' + e.qty
          + bonusSuffix(e),
        доступен: !!(chk && chk.ok) };
      if (!row.доступен) {
        row.reason = chk && chk.reason ? chk.reason : 'недоступно';
      }
      rows.push(row);
    }
    if (!rows.length) {
      rows.push({ id: 'empty', имя: 'Хранилище и инвентарь пусты',
        доступен: false, reason: 'пусто' });
    }
    return rows;
  }

  // LIVE built-запись (точка персиста): замена массива storage на
  // запись, чей storage — резолвленный массив.
  function assignStorage(res, storage) {
    const built = res.record && res.record.built;
    if (!Array.isArray(built)) return;
    for (const e of built) {
      if (e && typeof e === 'object' && !Array.isArray(e)
          && e.storage === res.storage) {
        e.storage = storage;
        return;
      }
    }
  }

  // Re-open оверлея (новый объект: open() начинается с close() —
  // дублей нет; строки — из LIVE-состояния).
  function openOverlay(res, ctx) {
    res.g.buildingUI.open({
      title: 'Хранилище',
      actions: buildRows(res),
      onAction: (a) => perform(ctx, a),
    });
  }

  function reopen(ctx) {
    const res = resolveCtx(ctx);
    if (!res.ok) return;
    openOverlay(res, ctx);
  }

  function doPut(ctx, res, a) {
    const i = Number(a.id.slice(4));
    if (!Number.isInteger(i) || i < 0) return;
    const hero = res.hero;
    const inv = hero && hero.inventory;
    const slots = inv && Array.isArray(inv.slots) ? inv.slots : [];
    const e = slots[i];
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      reopen(ctx);
      return;
    }
    if (a.itemId !== undefined && e.id !== a.itemId) {
      reopen(ctx);
      return;
    }
    const bonus = e.bonus === undefined ? null : e.bonus;
    const put = res.C.storagePut(res.storage, e.id, e.qty, bonus,
      res.capacity);
    if (!put || put.ok !== true) {
      flash(res.w, 'Хранилище полное');
      reopen(ctx);
      return;
    }
    const at = slots.indexOf(e);
    if (at >= 0) slots.splice(at, 1);
    assignStorage(res, put.storage);
    saveNow(res.w);
    flash(res.w, 'Сложено: ' + itemName(res.g, e.id) + ' ×' + e.qty
      + bonusSuffix(e));
    playerRender(res.w);
    reopen(ctx);
  }

  function doTake(ctx, res, a) {
    const j = Number(a.id.slice(4));
    if (!Number.isInteger(j) || j < 0) return;
    const take = res.C.storageTake(res.storage, j);
    if (!take || take.ok !== true) {
      reopen(ctx);
      return;
    }
    const en = take.entry;
    if (a.itemId !== undefined && en.id !== a.itemId) {
      reopen(ctx);
      return;
    }
    const hero = res.hero;
    const g = res.g;
    const bns = en.bonus === undefined ? null : en.bonus;
    const chk = typeof g.canAddItem === 'function'
      ? g.canAddItem(hero, en.id, en.qty, bns) : { ok: true };
    if (!chk || chk.ok !== true) {
      flash(res.w, chk && chk.reason ? chk.reason
        : 'Не удалось вернуть предмет');
      reopen(ctx);
      return;
    }
    const add = typeof g.addItem === 'function'
      ? g.addItem(hero, en.id, en.qty, bns) : null;
    if (!add || add.ok !== true) {
      flash(res.w, add && add.reason ? add.reason
        : 'Не удалось вернуть предмет');
      reopen(ctx);
      return;
    }
    assignStorage(res, take.storage);
    saveNow(res.w);
    flash(res.w, 'Вынуто: ' + itemName(g, en.id) + ' ×' + en.qty
      + bonusSuffix(en));
    playerRender(res.w);
    reopen(ctx);
  }

  // put-*/take-* (строки [E]-меню И оверлея): пере-резолв LIVE,
  // исполнение, save/flash/render — САМ хендлер, возврат пайплайну
  // {ok:false} БЕЗ message («спец обработал сам»).
  function perform(ctx, a) {
    const id = a && typeof a.id === 'string' ? a.id : '';
    if (id.indexOf('put-') !== 0 && id.indexOf('take-') !== 0) return;
    const res = resolveCtx(ctx);
    if (!res.ok) {
      if (res.err) {
        console.error('building-effect-storage.js: '
          + 'Game.buildingUI отсутствует — wiring-сбой (000053), '
          + '«Хранилище» не работает');
      }
      if (res.fail && res.fail.message) flash(res.w, res.fail.message);
      return;
    }
    if (id.indexOf('put-') === 0) doPut(ctx, res, a);
    else doTake(ctx, res, a);
  }

  // Спец-«storage»: action 'storage' (или прямой вызов без action —
  // node-гарды) — оверлей «Хранилище», возврат {ok:false} БЕЗ message
  // (пайплайн молчит — §2.6 000128); put-*/take-* — perform.
  function storageHandler(ctx) {
    const a = ctx && ctx.action;
    const id = a && typeof a.id === 'string' ? a.id : '';
    if (id.indexOf('put-') === 0 || id.indexOf('take-') === 0) {
      perform(ctx, a);
      return { ok: false };
    }
    const res = resolveCtx(ctx);
    if (!res.ok) {
      if (res.err) {
        console.error('building-effect-storage.js: '
          + 'Game.buildingUI отсутствует — wiring-сбой (000053), '
          + '«Хранилище» не работает');
      }
      return res.fail;
    }
    openOverlay(res, ctx);
    return { ok: false };
  }

  if (root === null) {
    return { storageHandler };
  }
  const G = typeof root.Game === 'object' ? root.Game : null;
  if (!G) {
    return;
  }
  if (!G.buildingActions ||
      typeof G.buildingActions.registerSpecial !== 'function') {
    console.error('building-effect-storage.js: Game.buildingActions '
      + 'отсутствует — src/building-actions.js обязан грузиться ДО '
      + 'этого модуля («Хранилище» не работает)');
    return;
  }
  G.buildingActions.registerSpecial(
    'storage', (ctx) => storageHandler(ctx));
});
