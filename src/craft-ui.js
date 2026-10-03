// Экран крафта (задача 000126, follow-up 000046): полноэкранный
// оверлей «.combat-overlay .craft-overlay» — список рецептов ЭТОЙ
// постройки (recipe.здания включает building.id), сгруппированный по
// видам крафта: уровень виду (Game.Craft.craftLevel), по рецепту —
// «нужно ур./есть», исходники (нехватка помечена — Game.hasItem),
// шансы качества/выхода (qualityChance/yieldChance), результат (имя
// предмета), зачарование — пикер заклинания (ТОЛЬКО изученные
// hero.spells ∩ recipe.заклинания, с маной spell.мани). Кнопка
// «изготовить» — disabled + title по Game.Craft.canCraft (зеркало,
// без rng/мутаций); нажатие — Game.Craft.craft + лог результата
// (предмет, качество, заклинание, выход, xp/уровень виду) + перерисовка
// + onChange (сейв, паттерн 000029) + G.playerUI.render().
//
// Ядро Game.Craft (000046, СМЕРЖЕНО) — только ЧТЕНИЕ/ВЫЗОВ, ни одной
// правки. Точка входа: [E] у крафтовой постройки (11 зданий — union
// зданий рецептов) → строка «Крафт» в оверлее buildingUI (синтез
// building-effects.js, решение 1 контракта) → onBuildingAction →
// спец-хендлер 'craft' (саморегистрация ЭТОГО модуля при загрузке,
// specials-таблица 000128) → Game.craftUI.open({ building, hero }).
// «В поле» (building=null) — БЕЗ UI-точки входа (решение 6 контракта,
// memory/000126-craft-ui.md): API craft({building:null}) остаётся для
// будущих задач.
//
// UMD (паттерн 000038, образец cities.js/building-effects.js):
// браузер — Game.craftUI = factory(G0, null, null, rootRef), node —
// require(). При ЗАГРУЗКЕ — чисто (000053): DOM не трогает, Game-
// функции не читает (кроме саморегистрации спец-а: гард — нет
// buildingActions → console.error, без краша). ВСЕ Game-функции —
// ЛЕНИВО в момент ВЫЗОВА через rootRef/globalThis (UMD-ловушка 000038:
// «const G = globalThis.Game» для позднего использования — ЗАПРЕЩЕНО —
// поздний UMD-модуль заменит Game, снапшот устареет). Деградация без
// Game.Craft: open() — console.error, экран не открывается, игра не
// роняется (тест CU-7).
//
// Контракты — memory/000126-craft-screen.md (главный) и
// memory/000126-craft-ui.md (структура DOM/CSS, порядок модулей).
// CSS — свой скоуп .craft-* в конце <style> index.html (общие
// .cp-*/.combat-* — НОЛЬ правок, стража G2 tests/craft-layout).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const api = factory(G0, null, null, root);
    if (api) {
      root.Game = Object.assign({}, G0, { craftUI: api });
      // Саморегистрация спец-действия 'craft' (000128) — при ЗАГРУЗКЕ:
      // registerSpecial работает ДО init (dispatch читает таблицу в
      // момент вызова). Гард (000053): нет buildingActions →
      // console.error, без краха (игра не роняется, ошибка заметна).
      const BA = root.Game.buildingActions;
      if (BA && typeof BA.registerSpecial === 'function') {
        BA.registerSpecial('craft', api.specialHandler);
      } else {
        console.error(
          'craft-ui.js: не найден Game.buildingActions — спец-действие '
          + '«craft» не зарегистрировано (строка «Крафт» у постройки '
          + 'не откроет экран; загрузите src/building-actions.js до '
          + 'src/craft-ui.js)');
      }
    }
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function (G0, _unused1, _unused2, rootRef) {
  'use strict';
  // G0 (снапшот при загрузке) намеренно НЕ используется для позднего
  // доступа — только rootRef/globalThis в момент ВЫЗОВА (000038).
  void G0;

  // Game в момент ВЫЗОВА (ленивый захват, 000038/000053).
  function curGame() {
    const r = (rootRef && typeof rootRef === 'object')
      ? rootRef
      : (typeof globalThis !== 'undefined' ? globalThis : null);
    return (r && r.Game && typeof r.Game === 'object') ? r.Game : null;
  }

  // --- Состояние (DOM-операции ТОЛЬКО внутри open()/close()) ---

  let overlay = null;
  let bodyEl = null;
  let logEl = null;
  let building = null;
  let hero = null;
  let onChange = null;
  let active = false;
  let keyHandler = null;
  const log = [];          // строки лога (.craft-log)
  const spellPick = {};    // recipeId → выбранный spellId (зачарование)

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function isActive() {
    return active;
  }

  function syncLog() {
    if (!logEl) return;
    logEl.textContent = log.join('\n');
    logEl.scrollTop = logEl.scrollHeight; // автораскрутка вниз
  }

  function logLine(text) {
    if (!text) return;
    log.push(String(text));
    if (log.length > 40) log.splice(0, log.length - 40);
    syncLog();
  }

  // Имя стата бонуса (ключ — из craft.js resultStatKey).
  function statName(key) {
    if (key === 'damage') return 'урон';
    if (key === 'armor') return 'броня';
    if (key === 'amount') return 'эффект';
    return key;
  }

  // Строка лога успешного крафта: результат, качество (бонус),
  // заклинание, выход, xp/уровень виду (р.xp из ядра 000046).
  function describeCraft(G, res) {
    const it = G.getItem ? G.getItem(res.item) : null;
    let s = (it ? it.name : res.item) + ' ×' + res.qty;
    if (res.quality && res.bonus) {
      s += ' (качество: '
        + Object.keys(res.bonus)
          .map((k) => '+' + res.bonus[k] + ' ' + statName(k))
          .join(', ') + ')';
    } else if (res.quality) {
      s += ' (качество)';
    }
    if (res.spell) {
      s += ', заклинание: ' + (res.spell.название || res.spell.id);
    }
    if (res.extra) s += ', выход: +1';
    const xp = res.xp;
    if (xp) {
      s += ' [опыт виду: +' + xp.applied + ', уровень ' + xp.level
        + (xp.leveledUp ? ' ↑' : '') + ']';
      if (xp.reason) s += ' (' + xp.reason + ')';
    }
    return s;
  }

  // --- Строка рецепта (.craft-recipe) ---
  //
  // canCraft — ТОЛЬКО для метки disabled (зеркало 000046: без rng, без
  // мутаций); craft() — единственный мутатор (ветка onOverlayClick).
  function recipeEl(G, C, r, level) {
    const row = el('div', 'craft-recipe');
    row.appendChild(el('div', 'craft-recipe-name', r.название));
    const need = r.уровень;
    row.appendChild(el('div', 'craft-recipe-meta',
      'нужно ур. ' + need + ' / есть ' + level
      + (level < need ? ' (недостаточный уровень)' : '')));
    // Исходники — имена предметов, нехватка помечена (Game.hasItem).
    const inputs = (Array.isArray(r.исходники) ? r.исходники : [])
      .map((inp) => {
        const it = G.getItem ? G.getItem(inp.предмет) : null;
        const name = it ? it.name : inp.предмет;
        const has = G.hasItem ? G.hasItem(hero, inp.предмет, inp.количество)
          : false;
        return name + ' ×' + inp.количество + (has ? '' : ' (нет)');
      });
    row.appendChild(el('div', 'craft-recipe-inputs',
      'Исходники: ' + (inputs.length ? inputs.join(', ') : '—')));
    // Шансы: у постройки качество > 0 (в поле — 0, SPEC «Рецепты»).
    const q = C.qualityChance(hero, r.id, building.id);
    const y = C.yieldChance(hero, r.id, building.id);
    row.appendChild(el('div', 'craft-recipe-chance',
      'Качество: ' + Math.round(q * 100) + '%'
      + ' · Выход: ' + Math.round(y * 100) + '%'));
    // Результат: имя предмета ×qty.
    const resIt = G.getItem ? G.getItem(r.результат.предмет) : null;
    row.appendChild(el('div', 'craft-recipe-result',
      'Результат: ' + (resIt ? resIt.name : r.результат.предмет)
      + ' ×' + r.результат.количество));
    // Зачарование: пикер ТОЛЬКО изученных (hero.spells ∩
    // recipe.заклинания), с маной; по умолчанию — первое изученное.
    // НЕ-зачарование с полем «заклинания» (steel_sword) — БЕЗ пикера
    // и БЕЗ spellId (осознанное ограничение скоупа, контракт §5).
    let spellId = null;
    if (r.тип === 'зачарование') {
      const learned = (Array.isArray(r.заклинания) ? r.заклинания : [])
        .filter((s) => Array.isArray(hero.spells)
          && hero.spells.includes(s));
      if (learned.length) {
        const pick = el('div', 'craft-spell');
        pick.appendChild(el('span', 'craft-spell-label', 'Заклинание: '));
        let sel = spellPick[r.id];
        if (sel == null || !learned.includes(sel)) sel = learned[0];
        spellPick[r.id] = sel;
        for (const s of learned) {
          // Каталог — Game.Spells (spells.js), а не Game.getSpell.
          const Sp = G.Spells;
          const sp = (Sp && typeof Sp.getSpell === 'function')
            ? Sp.getSpell(s) : null;
          const b = el('button',
            'cp-btn' + (s === sel ? ' craft-spell-on' : ''),
            (sp ? sp.название : s)
            + (sp && sp.мани != null ? ' (' + sp.мани + ' мана)' : ''));
          b.dataset.craftact = 'spell';
          b.dataset.recipe = r.id;
          b.dataset.spell = s;
          pick.appendChild(b);
        }
        row.appendChild(pick);
        spellId = sel;
      }
    }
    // Кнопка «изготовить»: disabled + title по canCraft.
    const btn = el('button', 'cp-btn', 'изготовить');
    btn.dataset.craftact = 'craft';
    btn.dataset.recipe = r.id;
    const opts = { building: building.id };
    if (r.тип === 'зачарование' && spellId != null) opts.spellId = spellId;
    const chk = C.canCraft(hero, r.id, opts);
    if (!chk.ok) {
      btn.disabled = true;
      btn.title = chk.reason || 'недоступно';
    }
    row.appendChild(btn);
    return row;
  }

  // --- Перерисовка тела (после крафта: уровень/исходники/шансы
  //     могли измениться). Оверлей/заголовок/лог НЕ пересоздаются
  //     (делегированный click живёт на оверлее — паттерн npcUI). ---
  function render() {
    if (!active || !bodyEl) return;
    const G = curGame();
    const C = G && G.Craft;
    if (!C) return;
    bodyEl.textContent = ''; // очистка (DOM: убирает детей)
    const recipes = (Array.isArray(C.CRAFT) ? C.CRAFT : []).filter(
      (r) => r && Array.isArray(r.здания)
        && r.здания.includes(building.id));
    const types = Array.isArray(C.CRAFT_TYPES) ? C.CRAFT_TYPES : [];
    for (const type of types) {
      const rs = recipes.filter((r) => r.тип === type);
      if (!rs.length) continue;
      const sec = el('section', 'craft-type');
      const L = C.craftLevel ? C.craftLevel(hero, type) : 1;
      sec.appendChild(el('div', 'craft-type-name',
        type + ' — уровень ' + L));
      for (const r of rs) sec.appendChild(recipeEl(G, C, r, L));
      bodyEl.appendChild(sec);
    }
  }

  // --- Кнопки (ОДИН делегированный click на оверлее, паттерн npcUI) ---

  function onOverlayClick(e) {
    if (!active) return;
    const t = e && e.target;
    if (!t || typeof t.closest !== 'function') return;
    const src = t.closest('[data-craftact]');
    if (!src) return;
    const G = curGame();
    const C = G && G.Craft;
    if (!C) return;
    const act = src.dataset.craftact;
    if (act === 'close') {
      close();
      return;
    }
    if (act === 'spell') {
      // Пикер: смена выбранного заклинания → перерисовка (кнопка
      // «изготовить» пересчитывает canCraft с новым spellId).
      if (src.dataset.recipe) spellPick[src.dataset.recipe] = src.dataset.spell;
      render();
      return;
    }
    if (act === 'craft') {
      const id = src.dataset.recipe;
      const recipe = C.CRAFT_BY_ID ? C.CRAFT_BY_ID[id] : null;
      if (!recipe) return;
      const opts = { building: building.id };
      //spellId — ТОЛЬКО для зачарования и ТОЛЬКО изученный (контракт
      // §5/подводный камень 6: дефолт ядра spells[0] может быть НЕ
      // изучен — нельзя полагаться; не-зачарование — БЕЗ spellId,
      // иначе блок заклинания canCraft сработал бы ложно).
      if (recipe.тип === 'зачарование' && spellPick[id] != null) {
        opts.spellId = spellPick[id];
      }
      // Отказ (в т.ч. клик по disabled-кнопке) — причина в лог,
      // инвентарь/мана не трогаются (атомарность ядра 000046).
      const chk = C.canCraft(hero, id, opts);
      if (!chk.ok) {
        logLine(chk.reason || 'недоступно');
        return;
      }
      const res = C.craft(hero, id, opts);
      if (!res.ok) {
        logLine(res.reason || 'изготовление не удалось');
        return;
      }
      logLine(describeCraft(G, res));
      if (typeof onChange === 'function') onChange(); // сейв (000029)
      render();
      if (G.playerUI && typeof G.playerUI.render === 'function') {
        G.playerUI.render();
      }
    }
  }

  // --- Закрытие: [Esc] (слушатель на window живёт, пока оверлей
  //     открыт — паттерн npcUI escHandler) и кнопка «закрыть» ---

  function onKeyDown(e) {
    if (!active) return;
    if (e && (e.code === 'Escape' || e.key === 'Escape')) {
      if (typeof e.preventDefault === 'function') e.preventDefault();
      if (typeof e.stopPropagation === 'function') e.stopPropagation();
      close();
    }
  }

  function closeDom() {
    if (keyHandler) {
      window.removeEventListener('keydown', keyHandler);
      keyHandler = null;
    }
    if (overlay) {
      overlay.remove();
      overlay = null;
    }
    bodyEl = null;
    logEl = null;
  }

  function close() {
    if (!active && !overlay) return;
    active = false;
    closeDom();
    building = null;
    hero = null;
    onChange = null;
    for (const k of Object.keys(spellPick)) delete spellPick[k];
    log.length = 0;
  }

  // --- Сборка DOM (ТОЛЬКО здесь — и в closeDom) ---

  function buildDom() {
    closeDom(); // повторное открытие — разбирать прежний оверлей
    // Оверлей несёт ОБА класса: .combat-overlay (база fixed/inset:0/
    // z-20/фон — не трогается) + .craft-overlay (маркер-фильтр, свой
    // CSS-скоуп: display:block + непрозрачный фон — конец <style>).
    overlay = el('div', 'combat-overlay craft-overlay');
    const panel = el('div', 'craft-panel');
    const title = el('div', 'cp-title');
    title.appendChild(el('span', '',
      (building.название || 'Постройка') + ' — крафт'));
    const closeBtn = el('button', 'cp-close', 'закрыть [Esc]');
    closeBtn.dataset.craftact = 'close';
    title.appendChild(closeBtn);
    panel.appendChild(title);
    bodyEl = el('div', 'craft-body');
    panel.appendChild(bodyEl);
    logEl = el('div', 'combat-state craft-log');
    panel.appendChild(logEl);
    overlay.appendChild(panel);
    overlay.addEventListener('click', onOverlayClick);
    document.body.appendChild(overlay);
    keyHandler = onKeyDown;
    window.addEventListener('keydown', keyHandler);
    render();
    syncLog();
  }

  // --- Публичная поверхность (как Game.buildingUI) ---

  /**
   * Открыть экран крафта постройки.
   * @param {object} o
   * @param {object} o.building запись каталога (id, название)
   * @param {object} o.hero персонаж (живая ссылка)
   * @param {function} [o.onChange] изменение → сейв (main.js saveNow)
   * Деградация (000053): нет Game.Craft → console.error, экран НЕ
   * открывается, isActive() false, игра не роняется.
   */
  function open(o) {
    const G = curGame();
    if (!G || !G.Craft || typeof G.Craft.craft !== 'function'
        || typeof G.Craft.canCraft !== 'function') {
      console.error(
        'craft-ui.js: не найден Game.Craft — экран крафта не '
        + 'открывается (загрузите src/craft.js до src/craft-ui.js)');
      return;
    }
    const b = o && o.building;
    const h = o && o.hero;
    if (!b || typeof b !== 'object' || !h || typeof h !== 'object') {
      console.error('craft-ui.js: open — не переданы building/hero');
      return;
    }
    close();
    building = b;
    hero = h;
    onChange = (typeof o.onChange === 'function') ? o.onChange : null;
    active = true;
    buildDom();
  }

  // --- Спец-действие 'craft' (таблица 000128) ---
  //
  // ctx — пайплайн building-actions.js onBuildingAction: b — каталожная
  // запись постройки, hero — ЖИВАЯ ссылка, world — deps-бандл (saveNow).
  // Успех — { ok: true }: общий пайплайн сделает saveNow/flash/render
  // (марка раз-в-день у 40/42 — осознанно осиротевшая, решение 5
  // контракта: доступность строки 'craft' её не читает).
  function specialHandler(ctx) {
    const G = curGame();
    if (!G || !G.Craft) {
      console.error(
        'craft-ui.js: не найден Game.Craft — крафт недоступен '
        + '(загрузите src/craft.js до src/craft-ui.js)');
      return { ok: false, message: 'Крафт недоступен' };
    }
    const b = ctx && ctx.b;
    const h = ctx && ctx.hero;
    if (!b || !h) {
      return { ok: false, message: 'Не удалось определить постройку' };
    }
    const w = ctx && ctx.world;
    G.craftUI.open({
      building: b,
      hero: h,
      onChange: (w && typeof w.saveNow === 'function') ? w.saveNow : null,
    });
    return { ok: true };
  }

  return { open, close, isActive, specialHandler };
});
