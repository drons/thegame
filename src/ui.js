// Панель персонажа (HTML-оверлей): статы, навыки, расход очков.
// Браузерный модуль (не тестируется в node; ядро — src/player.js).
//
// Задача 000130: ВКЛАДКИ переехали в саморегистрирующиеся модули —
// src/ui-tabs.js (реестр Game.uiTabs) + src/ui-tab-*.js (вкладки,
// грузятся ДО ui.js и регистрируются ПРИ ЗАГРУЗКЕ). Ядро остаётся:
// два столбца, переключение вкладок, тултипы (000097), [I]/Esc,
// проводка setShop/setQuests, render-цикл (хуки вкладок в порядке
// регистрации). Реестр читается ЛЕНИВО в buildPanel: ui.js обязан
// грузиться чисто БЕЗ реестра (деградация — два пустых столбца +
// console.error, без краха). ДОБАВЛЕНИЕ вкладки = новый файл
// src/ui-tab-*.js + script-тег в index.html; ui.js не правится
// (контракт memory/000130-ui-tabs.md).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G) return;

  let panel = null;
  let character = null;
  let shop = null;      // текущий магазин (main.js передаёт стоящий тайл)
  let shopKey = '';
  let notice = null;
  // Журнал квестов (000100): каталог, журнал и день проводки —
  // вкладка «Квесты» (модуль src/ui-tab-quests.js) — read-only
  // зеркало (действия — только в диалоге NPC). day — снимок на
  // момент проводки, в рендере не используется (спецификация
  // задачи требует только текущие квесты).
  let questNpcs = null;
  let questBook = null;
  let questDay = null;
  // 000130: ctx ядро→вкладки (контракт §4.3) и записи реестра,
  // зафиксированные при buildPanel (копия list(); поздняя
  // саморегистрация до ПЕРВОГО toggle успевает — buildPanel ленивый).
  let panelCtx = null;
  let panelTabs = [];

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // --- Data-driven ряды вкладок (000051, задача 000096) — 000130 ---
  // Вкладки — записи реестра Game.uiTabs (src/ui-tabs.js); модули
  // src/ui-tab-*.js САМОРЕГИСТРИРУЮТСЯ при загрузке (ДО ui.js).
  // Новая вкладка = новый модуль + script-тег в index.html: ui.js
  // НЕ правится (анти-прецедент закреплён тестом). Порядок записей =
  // порядок регистрации = порядок тегов (пин index-order).
  // build(pane, ctx) вызывается ОДИН раз при сборке панели; render()
  // pane НЕ пересобирает — только обновляет существующие тела in
  // place (форма 000098 опирается на живость focus). Реестр читается
  // ЛЕНИВО в buildPanel (не при загрузке!).

  // Состояние вкладок по столбцам (closure; ЖИВЁТ через render() —
  // pane не пересобираются). rec: { active, buttons, panes, apply }.
  const columnState = [];

  function makeColumn(defs, colIndex) {
    const col = el('div', 'cp-column');
    const tabsRow = el('div', 'cp-tabs');
    col.appendChild(tabsRow);
    // 000130: guard ПУСТОГО столбца (реестра нет — деградация:
    // столбец строится, вкладок в нём нет, без краха).
    const rec = { active: defs.length ? defs[0].id : null,
      buttons: {}, panes: {} };
    for (const t of defs) {
      const btn = el('button', 'cp-tab', t.label);
      btn.dataset.col = String(colIndex);
      btn.dataset.tabid = t.id;
      rec.buttons[t.id] = btn;
      tabsRow.appendChild(btn);
      const pane = el('div', 'cp-tabpane');
      rec.panes[t.id] = pane;
      t.build(pane, panelCtx);
      col.appendChild(pane);
    }
    rec.apply = function () {
      for (const t of defs) {
        const on = t.id === rec.active;
        rec.panes[t.id].style.display = on ? '' : 'none';
        // Активная кнопка подсвечивается тоже через style (в DOM-стабе
        // нет classList).
        const st = rec.buttons[t.id].style;
        st.background = on ? '#4a4433' : '#2c3040';
        st.borderColor = on ? '#d8c27a' : '#6b6248';
      }
    };
    rec.apply();
    columnState[colIndex] = rec;
    return col;
  }

  function activateTab(colIndex, id) {
    const rec = columnState[colIndex];
    if (!rec || !rec.panes[id]) return;
    rec.active = id;
    rec.apply();
  }

  function buildPanel() {
    panel = el('div', 'char-panel');
    panel.style.display = 'none';

    const closeBtn = el('button', 'cp-close', 'закрыть [I]/[Esc]');
    closeBtn.addEventListener('click', () => toggle(false));
    panel.appendChild(closeBtn);

    // 000130: ctx ядро→вкладка (контракт memory/000130-ui-tabs.md
    // §4.3) — строится ОДИН раз: panel (тела — panel._*), el
    // (DOM-фабрика ядра — НЕ дублировать в модулях), itemRow/
    // itemTipText (общий механизм строк, 000097) и ЖИВЫЕ getters
    // closure-состояния ядра (character/shop/quests).
    panelCtx = {
      panel,
      el,
      itemRow,
      itemTipText,
      get character() { return character; },
      get shop() { return shop; },
      get quests() { return { npcs: questNpcs, book: questBook }; },
    };

    // Два столбца: лево — Персонаж/Инвентарь/настройки,
    // право — Снаряжение/Магазин/Квесты. 000130: ЗАПИСИ — из
    // реестра Game.uiTabs (модули src/ui-tab-*.js, загруженные ДО
    // ui.js); читается ЛЕНИВО — ui.js грузится чисто без реестра.
    const reg = G.uiTabs;
    if (!reg || typeof reg.list !== 'function') {
      console.error('ui.js: Game.uiTabs не найден — src/ui-tabs.js ' +
        'должен грузиться ДО src/ui.js (задача 000130); панель — ' +
        'два пустых столбца');
      panelTabs = [];
    } else {
      panelTabs = reg.list();
    }
    const columns = el('div', 'cp-columns');
    columns.appendChild(makeColumn(
      panelTabs.filter((t) => t.column === 0), 0));
    columns.appendChild(makeColumn(
      panelTabs.filter((t) => t.column === 1), 1));
    panel.appendChild(columns);

    notice = el('div', 'cp-notice', '');
    panel.appendChild(notice);

    // Один обработчик кликов на всю панель: вкладки + прокачка +
    // предметы/торговля. Ветка вкладок ПЕРВАЯ: вкладка — .cp-tab
    // (не .cp-btn), в item/skill-обработчик попасть не должна.
    // Ветка КНОПОК (.cp-btn) — без изменений (контракт ui-skills);
    // ПОСЛЕ неё — ветка СТРОК (000097): клик/тап по не-кнопочной
    // части строки навыка/предмета — полное описание (.cp-tip) в
    // .cp-notice (touch-fallback: hover на таче нет).
    panel.addEventListener('click', (e) => {
      const tab = e.target.closest('.cp-tab');
      if (tab) {
        activateTab(Number(tab.dataset.col), tab.dataset.tabid);
        return;
      }
      const btn = e.target.closest('.cp-btn');
      if (btn) {
        if (!character) return;
        if (btn.dataset.act) {
          doItemAction(btn);
          render();
          return;
        }
        const r = G.raiseSkill(character, btn.dataset.skill);
        render();
        if (!r.ok) {
          // Краткая обратная связь: причина неудачи в .cp-req на 1.5 с.
          // Пишется ПОСЛЕ render(), чтобы вспышка была видна; а через 1.5 с
          // снова render() — вернёт постоянный текст ячейки (пометка потолка
          // практикой / требование), а не зальёт её пустой строкой.
          const tr = btn.closest('tr');
          const req = tr.querySelector('.cp-req');
          if (req) {
            req.textContent = r.reason;
            setTimeout(render, 1500);
          }
        }
        return;
      }
      // Строка (не кнопка): .cp-itemrow (предмет) или tr (навык).
      // Строки магазина .cp-tip НЕ имеют — клик по ним ничего не
      // делает (магазин — зона 000101).
      if (!character) return;
      const owner = e.target.closest('.cp-itemrow') || e.target.closest('tr');
      if (owner) {
        const tip = owner.querySelector('.cp-tip');
        if (tip && tip.textContent) flashNotice(tip.textContent);
      }
    });

    document.body.appendChild(panel);
  }

  // Краткая обратная связь по действиям с предметами.
  function flashNotice(text) {
    if (!notice || !text) return;
    notice.textContent = text;
    notice.style.opacity = '1';
    clearTimeout(flashNotice._t);
    flashNotice._t = setTimeout(() => { notice.style.opacity = '0'; }, 2500);
  }

  // Действия с предметами (кнопки dataset.act в секциях панели).
  function doItemAction(btn) {
    const c = character;
    const id = btn.dataset.item;
    let r = { ok: true };
    switch (btn.dataset.act) {
      case 'use': r = G.useItem(c, id); break;
      case 'equip': r = G.equip(c, id); break;
      case 'unequip': r = G.unequip(c, btn.dataset.equipslot); break;
      case 'remove': r = G.removeItem(c, id, 1); break;
      case 'quick': {
        const s = G.freeQuickSlot(c);
        r = s == null ? { ok: false, reason: 'все быстрые слоты заняты' }
                      : G.setQuick(c, s, id);
        break;
      }
      case 'quick-clear': r = G.clearQuick(c, Number(btn.dataset.slot)); break;
      case 'buy': if (shop) r = G.buyItem(shop, c, id, 1); break;
      case 'sell': if (shop) r = G.sellItem(shop, c, id, 1); break;
    }
    if (r && !r.ok) flashNotice(r.reason || 'не удалось');
    else if (r && r.message) flashNotice(r.message);
    else if (r && r.ok && btn.dataset.act === 'buy') {
      flashNotice('Куплено: ' + G.getItem(id).name + ' за ' + r.price + ' з');
    } else if (r && r.ok && btn.dataset.act === 'sell') {
      flashNotice('Продано: ' + G.getItem(id).name + ' за ' + r.price + ' з');
    }
    return r;
  }

  // Строка предмета в секциях панели. tip (000097) — АДДИТИВНЫЙ
  // 4-й аргумент: текст тултипа заполненной строки (снаряжение/
  // быстрые/инвентарь); пустые строки и строки магазина (зона
  // 000101) его не получают. 000130: ОСТАЁТСЯ в ядре и идёт
  // вкладкам через ctx (общий механизм строк — ЛЮБОЙ вкладке, как el).
  function itemRow(name, meta, buttons, tip) {
    const div = el('div', 'cp-itemrow');
    div.appendChild(el('span', 'cp-itemname', name));
    if (meta) div.appendChild(el('span', 'cp-itemmeta', meta));
    for (const [label, act, data] of buttons || []) {
      const b = el('button', 'cp-btn', label);
      b.dataset.act = act;
      for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
      div.appendChild(b);
    }
    if (tip != null) div.appendChild(el('div', 'cp-tip', tip));
    return div;
  }

  // Строка предмета: desc + строка kind (статы оружия/брони или эффект
  // расходника; у реагента эффекта в каталоге нет — строки нет) +
  // вес + цена. (000097; 000130: остаётся в ядре, вкладки — через
  // ctx.itemTipText.)
  function itemTipText(it) {
    const lines = [it.desc];
    if (it.kind === 'weapon') {
      lines.push('Урон: ' + it.stats.damage);
    } else if (it.kind === 'armor') {
      lines.push('Броня: ' + it.stats.armor);
    } else if (it.effect) {
      if (it.effect.kind === 'heal') lines.push('Эффект: +' + it.effect.amount + ' HP');
      else if (it.effect.kind === 'mp') lines.push('Эффект: +' + it.effect.amount + ' MP');
      else if (it.effect.kind === 'eat') lines.push('Эффект: +' + it.effect.amount + ' HP');
      else if (it.effect.kind === 'skill_xp') {
        const sk = G.SECONDARY_SKILLS[it.effect.skill] || { name: it.effect.skill };
        lines.push('Эффект: +' + it.effect.amount + ' опыта («' + sk.name + '»)');
      }
    }
    lines.push('Вес: ' + it.weight + ' кг');
    lines.push('Цена: ' + it.value + ' з');
    return lines.join('\n');
  }

  function render() {
    if (!panel || !character) return;
    // 000130: тела вкладок — хуки render(ctx) в ПОРЯДКЕ РЕГИСТРАЦИИ
    // (panelTabs — копия с buildPanel; в списке render НЕ
    // перечитывается — саморегистрация действует при ЗАГРУЗКЕ
    // страницы, до первой сборки панели). Каждый хук пишет ТОЛЬКО в
    // СВОИ panel._* — тела независимы, порядок хуков DOM не меняет.
    for (const t of panelTabs) {
      if (typeof t.render === 'function') t.render(panelCtx);
    }
  }

  function isOpen() {
    return !!panel && panel.style.display === 'flex';
  }

  // [Esc] закрывает панель (единообразие с npcUI: тот вешается на
  // window, панель — на document). Слушатель живёт только пока панель
  // открыта: вешается на open, снимается на close, guard isOpen().
  // Открыт верхний слой, закрываемый по Esc (диалог NPC —
  // npcUI.isActive(), оверлей РЕЗУЛЬТАТА боя —
  // combatUI.isActive() && current().result; оба — .combat-overlay,
  // z-20) — Esc его закрывает, панель не трогаем. Терпимо к стабам
  // без add/removeEventListener (typeof-guard, как bottomInset() —
  // минимальный DOM).
  let escHandler = null;
  function attachEsc() {
    if (escHandler) return;
    escHandler = (e) => {
      if (e.code !== 'Escape' || !isOpen()) return;
      // Диалог NPC (KeyE, .combat-overlay, z-20) ВЫШЕ панели
      // (KeyI, .char-panel, z-10): Esc закрывает верхний слой,
      // панель остаётся открытой — без гарда одно нажатие закрывало
      // оба сразу (ревью 000096, раунд 2). Гард здесь, а не
      // stopPropagation: слушатель npcUI вешается на window и
      // срабатывает ПОСЛЕ document (bubble: document → window).
      if (G.npcUI && typeof G.npcUI.isActive === 'function' &&
          G.npcUI.isActive()) return;
      // Оверлей РЕЗУЛЬТАТА боя (combat-ui.js, тот же .combat-overlay,
      // z-20) ВЫШЕ панели: Esc закрывает оверлей (c.result) — без
      // гарда одно нажатие закрывало и панель, и результат (ревью
      // 000096, раунд 3). Во время самого боя (result не установлен)
      // Esc оверлей НЕ закрывает — и панель тогда закрывается:
      // KeyI/Esc в бою — штатное управление панелью (000096).
      if (G.combatUI && typeof G.combatUI.isActive === 'function' &&
          G.combatUI.isActive()) {
        const cc = (typeof G.combatUI.current === 'function')
          ? G.combatUI.current() : null;
        if (cc && cc.result) return;
      }
      toggle(false);
    };
    if (typeof document.addEventListener === 'function') {
      document.addEventListener('keydown', escHandler);
    }
  }
  function detachEsc() {
    if (!escHandler) return;
    if (typeof document.removeEventListener === 'function') {
      document.removeEventListener('keydown', escHandler);
    }
    escHandler = null;
  }

  function toggle(force, tabId) {
    if (!panel) buildPanel();
    if (!character) return;
    const show = force != null ? force : panel.style.display === 'none';
    // 'flex', а не 'block': CSS .char-panel { display:flex;
    // flex-direction:column } обязан действовать — инлайн-блок ломал
    // верстку (ревью 000096, раунд 1): .cp-columns/.cp-tabpane
    // (flex:1, min-height:0, overflow-y:auto) не ограничивались
    // высотой (контент не скроллился), .cp-close (align-self:flex-end)
    // уходил на левый край.
    panel.style.display = show ? 'flex' : 'none';
    if (show) {
      // 000123: явная вкладка (тач-кнопка [I] → 'inventory').
      // Активируем ДО render(): render() тела перерисовывает, но
      // display паней меняет только rec.apply() (activateTab) —
      // порядок: activateTab → render. Неизвестный id — тихо
      // игнорируется (activateTab сам гардится по rec.panes[id]).
      if (tabId) {
        for (let i = 0; i < columnState.length; i++) {
          const rec = columnState[i];
          if (rec && rec.panes[tabId]) {
            activateTab(i, tabId);
            break;
          }
        }
      }
      render();
      attachEsc();
    } else {
      detachEsc();
    }
  }

  G.playerUI = {
    setCharacter(c) {
      character = c;
      if (panel) render();
    },
    // Магазин текущего тайла (или null) — вкладка «Магазин».
    // 000130: shopKey-гард ОСТАЁТСЯ в ядре — main.js (L1695) зовёт
    // setShop КАЖДЫЙ кадр; перенос гарда во вкладочный модуль дал бы
    // render() 30 раз/с (контракт §6.5).
    setShop(s) {
      shop = s;
      const key = s ? s.x + ',' + s.y + ',' + s.buildingType + ',' + s.wealth : '';
      if (key === shopKey) return;
      shopKey = key;
      if (panel) render();
    },
    // Журнал квестов (000100) — вкладка «Квесты» (read-only зеркало).
    // o: { npcs — каталог NPC, book — журнал (G.createQuestBook())
    // или null, day — день проводки (снимок) }. Порядок вызовов не
    // важен: до построения панели — состояние хранится, первый
    // render (toggle) нарисует; после — сеттер сам шлёт render().
    setQuests(o) {
      questNpcs = (o && o.npcs) || null;
      questBook = (o && o.book) || null;
      questDay = (o && o.day != null) ? o.day : null;
      if (panel) render();
    },
    toggle,
    render,
    isOpen,
  };

  // --- Диалог NPC (задача 000010) ---
  // Оверлей с вкладками: диалог / торговля / школа / квесты / найм (000078).
  // Ядро — src/npc.js (тестируется в node): доступность опций диалога,
  // торговля, обучение и журнал квестов; здесь — тонкий DOM-слой.
  // Каталог NPC — Game.NpcData.NPCS (зеркало src/npc-data.js); журнал
  // квестов передаётся из main.js (один на всю сессию игры).
  if (typeof G.dialogOptions === 'function' &&
      typeof G.createNpcShop === 'function') {
    let npc = null;          // текущий NPC (запись каталога)
    let c = null;            // персонаж (в игре — hero)
    let book = null;         // журнал квестов
    let tab = 'dialog';      // 'dialog' | 'trade' | 'train' | 'quests' | 'hire'
    let npcShop = null;      // сток NPC (общий на сессию; создаётся лениво)
    let onChange = null;     // хук main.js: изменение состояния → сейв
    let day = null;          // день мира на момент открытия (день выдачи квестов)
    let roster = null;       // 000083: ЖИВАЯ ссылка на отряд main.js (Array | null)
    let deadMercs = null;    // 000083: ЖИВАЯ ссылка [npcId] main.js (Array | null)
    let log = [];            // строки лога (область .combat-state)
    let overlay = null, body = null, titleText = null, logEl = null;
    let escHandler = null;   // window keydown (Esc): вешается на open, снимается на close

    const npcs = () => (G.NpcData && G.NpcData.NPCS) || [];

    function npcLog(text) {
      if (!text) return;
      log.push(text);
      if (log.length > 30) log = log.slice(-30);
    }

    // Квест по id по всему каталогу (для секции «Выполнено»: book.done
    // хранит только id) — общий findQuestInCatalog (000100).
    // 000130: извлечён в src/ui-tab-quests.js (плоский game-экспорт
    // Game.findQuestInCatalog) — ЛЕНИВЫЙ typeof-guard в момент вызова
    // (песочница без модуля — null → «Выполнено» рисует голый id,
    // фолбэк npcUI; на загрузке ошибок нет).
    function questById(qid) {
      return (typeof G.findQuestInCatalog === 'function')
        ? G.findQuestInCatalog(npcs(), qid) : null;
    }

    // --- Вкладки ---

    function renderDialogTab() {
      for (const entry of G.dialogOptions(npc, c)) {
        const row = el('div', 'cp-itemrow');
        const btn = el('button', 'cp-btn', entry.option.текст);
        btn.dataset.npcact = 'opt';
        btn.dataset.optid = entry.option.id;
        row.appendChild(btn);
        if (!entry.доступен) {
          btn.disabled = true;
          btn.title = entry.причина;
          row.appendChild(el('span', 'cp-itemmeta', entry.причина));
        }
        body.appendChild(row);
      }
    }

    function renderTradeTab() {
      // Сток создаётся лениво и переиспользуется внутри сессии диалога.
      if (!npcShop) npcShop = G.createNpcShop(npc);
      if (!npcShop) {
        body.appendChild(el('div', 'cp-itemmeta', 'Этот NPC не торгует.'));
        return;
      }
      body.appendChild(el('div', 'cp-itemmeta', 'Золото: ' + c.gold));
      for (const p of npc.торговля.предметы) {
        const it = G.getItem(p.предмет);
        if (!it) continue;
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname',
          it.name + ' (ост. ' + (npcShop.stock[p.предмет] || 0) + ')'));
        row.appendChild(el('span', 'cp-itemmeta',
          'покупка ' + G.npcBuyPrice(npcShop, p.предмет, c) + ' з / ' +
          'продажа ' + G.npcSellPrice(npcShop, p.предмет, c) + ' з'));
        const bBuy = el('button', 'cp-btn', 'купить');
        bBuy.dataset.npcact = 'buy';
        bBuy.dataset.item = p.предмет;
        row.appendChild(bBuy);
        const bSell = el('button', 'cp-btn', 'продать');
        bSell.dataset.npcact = 'sell';
        bSell.dataset.item = p.предмет;
        if (!G.hasItem(c, p.предмет, 1)) {
          bSell.disabled = true;
          bSell.title = 'предмета нет в инвентаре';
        }
        row.appendChild(bSell);
        body.appendChild(row);
      }
    }

    function renderTrainTab() {
      const skills = G.schoolSkills(npc);
      if (!skills.length) {
        body.appendChild(el('div', 'cp-itemmeta', 'Этот NPC не обучает.'));
        return;
      }
      const price = G.schoolTrainPrice(npc);
      const refund = G.schoolRefundPrice(npc, 1);
      body.appendChild(el('div', 'cp-itemmeta', 'Свободные очки: ' + c.points));
      for (const id of skills) {
        const s = G.SECONDARY_SKILLS[id] || { name: id };
        const lvl = c.secondary[id] || 0;
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname',
          (lvl > 0 ? G.secondaryName(id, lvl) : s.name) + ' (' + lvl + ')'));
        row.appendChild(el('span', 'cp-itemmeta',
          '+1 за ' + price + ' з / вернуть 1 за ' + refund + ' з'));
        const bTrain = el('button', 'cp-btn', '+ (' + price + ' з)');
        bTrain.dataset.npcact = 'train';
        bTrain.dataset.skill = id;
        const can = G.canSchoolTrain(npc, c, id);
        if (!can.ok) { bTrain.disabled = true; bTrain.title = can.reason; }
        row.appendChild(bTrain);
        const bRefund = el('button', 'cp-btn', 'вернуть (' + refund + ' з)');
        bRefund.dataset.npcact = 'refund';
        bRefund.dataset.skill = id;
        const canRefund = G.canSchoolRefund(npc, c, id, 1);
        if (!canRefund.ok) {
          bRefund.disabled = true;
          bRefund.title = canRefund.reason;
        }
        row.appendChild(bRefund);
        body.appendChild(row);
      }
    }

    function renderQuestsTab() {
      if (!book) {
        body.appendChild(el('div', 'cp-itemmeta', 'Журнал квестов недоступен.'));
        return;
      }
      const NPCS = npcs();
      // bring_item-квесты сверяем с инвентарем перед отрисовкой.
      if (G.refreshBringItems) G.refreshBringItems(NPCS, book, c);

      const avail = el('div', 'cp-section', 'Доступны');
      const list = G.availableQuests(NPCS, book, npc);
      if (!list.length) avail.appendChild(el('div', 'cp-itemmeta', 'квестов нет'));
      for (const q of list) {
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname', q.название));
        row.appendChild(el('span', 'cp-itemmeta', q.описание));
        const b = el('button', 'cp-btn', 'взять');
        b.dataset.npcact = 'accept';
        b.dataset.quest = q.id;
        row.appendChild(b);
        avail.appendChild(row);
      }
      body.appendChild(avail);

      const active = el('div', 'cp-section', 'В работе');
      const actives = G.activeQuests(NPCS, book);
      if (!actives.length) active.appendChild(el('div', 'cp-itemmeta', 'нет активных квестов'));
      for (const { quest, instance } of actives) {
        if (!quest) continue;
        // ОДИН рендерер строк с панелью персонажа (000100): у диалога
        // NPC — с кнопкой «сдать» (withTurninButton = true).
        // 000130: извлечён в src/ui-tab-quests.js (Game.buildActive-
        // QuestRow) — ЛЕНИВЫЙ typeof-guard в момент вызова: песочница
        // без модуля — строка пропускается (console.error), без краха.
        if (typeof G.buildActiveQuestRow === 'function') {
          active.appendChild(G.buildActiveQuestRow(quest, instance, c, true));
        } else {
          console.error('ui.js: Game.buildActiveQuestRow не найден — ' +
            'src/ui-tab-quests.js должен грузиться ДО src/ui.js ' +
            '(задача 000130); строка «В работе» пропущена');
        }
      }
      body.appendChild(active);

      const done = el('div', 'cp-section', 'Выполнено');
      if (!book.done.length) done.appendChild(el('div', 'cp-itemmeta', 'пока ничего'));
      for (const qid of book.done) {
        const q = questById(qid);
        done.appendChild(el('div', 'cp-itemrow', q ? q.название : qid));
      }
      body.appendChild(done);
    }

    // Вкладка «найм» (задача 000078 — слой данных; 000083 — интерактив):
    // список кандидатов — детерминированно (порядок каталога), rng в
    // рендере не вводится (отказ найма — сид (день, npcId), 000079).
    //
    // 000083: ИНТЕРАКТИВНЫЙ путь (кнопки «нанять»/«уволить» + блок
    // «Отряд») — при НАЛИЧИИ ядра G.companions (typeof-guard на
    // candidatesForTavern/canHire/hire/dismiss — ЛЕНИВО, в момент
    // вызова, паттерн 000130: частично «отремонтированный» модуль
    // деградирует целиком) И ЖИВОГО массива roster (open). Деградация
    // (нет ядра ИЛИ нет roster) — ровно рендер 000078: console.error
    // только про отсутствующее ядро; без ЖИВОГО массива найм пушил бы
    // запись в одноразовый [] (золото списано, запись потеряна).
    // Строка кандидата (000078): имя → meta (роль/навыки/контракт/
    // жалованье) → [кнопка «нанять» — 000083].
    function hireRowMeta(h) {
      const skills = (h.skills || []).map((id) => {
        const s = G.SECONDARY_SKILLS && G.SECONDARY_SKILLS[id];
        if (s) return s.name;
        const p = G.PRIMARY_SKILLS &&
          G.PRIMARY_SKILLS.find((x) => x.id === id);
        return p ? p.name : id;
      });
      return 'роль: ' + h.роль +
        (skills.length ? ' · навыки: ' + skills.join(', ') : '') +
        ' · контракт ' + h.цена + ' з' +
        ' · жалованье ' + h.жалованье + ' з/день';
    }

    // Деградация — ровно рендер 000078 (ЧИТАЕМЫЙ список, БЕЗ кнопок
    // и БЕЗ блока «Отряд»): регрессионный пин tests/npc-hire.test.js.
    function renderHireTabReadonly() {
      const list = G.hireCandidates(npcs());
      if (!list.length) {
        body.appendChild(el('div', 'cp-itemmeta', 'Наёмников не найдено.'));
        return;
      }
      body.appendChild(el('div', 'cp-itemmeta',
        'Наёмники в дорогу: контракт + жалованье за день.'));
      for (const m of list) {
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname', m.имя));
        row.appendChild(el('span', 'cp-itemmeta', hireRowMeta(m.найм)));
        body.appendChild(row);
      }
    }

    function renderHireTab() {
      const C = G.companions;
      const haveCore = !!C &&
        typeof C.candidatesForTavern === 'function' &&
        typeof C.canHire === 'function' &&
        typeof C.hire === 'function' &&
        typeof C.dismiss === 'function';
      if (!haveCore || !Array.isArray(roster)) {
        if (!haveCore) {
          console.error('ui.js: Game.companions отсутствует — ' +
            'src/companions.js обязан грузиться ДО src/ui.js ' +
            '(задача 000079); вкладка «найм» — только список');
        }
        renderHireTabReadonly();
        return;
      }
      body.appendChild(el('div', 'cp-itemmeta',
        'Наёмники в дорогу: контракт + жалованье за день.'));
      const list = C.candidatesForTavern(npcs(), roster, deadMercs || []);
      for (const m of list) {
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname', m.имя));
        row.appendChild(el('span', 'cp-itemmeta', hireRowMeta(m.найм)));
        const b = el('button', 'cp-btn', 'нанять');
        b.dataset.npcact = 'hire';
        b.dataset.npcid = m.id;
        // Статус кнопок — при рендере; stale-кнопка (состояние
        // изменилось после отрисовки) решается re-check ВНУТРИ
        // hire() в момент клика (паттерн renderTrainTab).
        const can = C.canHire(roster, m, c);
        if (!can.ok) { b.disabled = true; b.title = can.reason; }
        row.appendChild(b);
        body.appendChild(row);
      }
      if (!list.length) {
        body.appendChild(el('div', 'cp-itemmeta', 'Наёмников не найдено.'));
      }
      // Блок «Отряд» — ПОСЛЕ списка кандидатов (000083): текущий
      // состав (live-roster) + «уволить». Пустой отряд — текст ТОЛЬКО,
      // .cp-itemrow НЕТ (ограничение-пин: деградация = 000078).
      const squad = el('div', 'cp-section', 'Отряд');
      if (!roster.length) {
        squad.appendChild(el('div', 'cp-itemmeta', 'Отряд пуст.'));
      }
      for (const e of roster) {
        const n = npcs().find((x) => x && x.id === e.npcId) || null;
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname', n ? n.имя : e.npcId));
        let meta = 'уровень ' + e.level + ' · лояльность ' + e.loyalty;
        if (n && n.найм && typeof n.найм.жалованье === 'number') {
          meta += ' · жалованье ' + n.найм.жалованье + ' з/день';
        }
        row.appendChild(el('span', 'cp-itemmeta', meta));
        const bd = el('button', 'cp-btn', 'уволить');
        bd.dataset.npcact = 'dismiss';
        bd.dataset.npcid = e.npcId;
        row.appendChild(bd);
        squad.appendChild(row);
      }
      body.appendChild(squad);
    }

    // --- Кнопки (один обработчик на весь оверлей) ---

    function onOverlayClick(e) {
      const btn = e.target.closest('button[data-npcact]');
      if (!btn || btn.disabled || !npc) return;
      const act = btn.dataset.npcact;
      if (act === 'close') { npcClose(); return; }
      if (act === 'tab') { tab = btn.dataset.tab; renderTab(); return; }
      if (act === 'opt') {
        const entry = G.dialogOptions(npc, c)
          .find((x) => x.option.id === btn.dataset.optid);
        if (!entry || !entry.доступен) return;
        const o = entry.option;
        if (o.действие === 'подсказка') {
          npcLog(o.текст);
          renderTab();
        } else if (o.действие === 'торговля') {
          tab = 'trade';
          renderTab();
        } else if (o.действие === 'обучение') {
          tab = 'train';
          renderTab();
        } else if (o.действие === 'квесты') {
          tab = 'quests';
          renderTab();
        } else if (o.действие === 'найм') {
          // 000078: доступ к найму — существующие «требования» опции
          // (entry.доступен проверен выше), новой системы нет.
          tab = 'hire';
          renderTab();
        }
        return;
      }
      if (act === 'hire') {
        // 000083: найм (ядро 000079). Состояние пересматривается в
        // момент клика: stale-кнопка (roster/золото изменились после
        // рендера) — canHire ВНУТРИ hire() → reason в лог, БЕЗ сейва.
        const C = G.companions;
        if (!C || typeof C.hire !== 'function') return;
        const m = npcs().find((x) => x && x.id === btn.dataset.npcid);
        if (!m || !Array.isArray(roster)) return;
        const d = Number.isInteger(day) && day >= 1 ? day : 1;
        const r = C.hire(roster, m, c, d);
        if (r.ok) {
          npcLog('Нанят: ' + m.имя + ' за ' + m.найм.цена + ' з');
          if (onChange) onChange();
          renderTab();
          G.playerUI && G.playerUI.render();
        } else if (r.refused) {
          // Детерминизм 000079: тот же (день, npcId) — тот же
          // исход; суффикс — игрокоориентированная версия.
          npcLog(m.имя + ': ' + r.reason +
            ' — повторить попытку можно на следующий день');
          renderTab();
        } else {
          npcLog(r.reason);
          renderTab();
        }
        return;
      }
      if (act === 'dismiss') {
        // 000083: увольнение — возврата денег НЕТ (playerUI.render
        // НЕ вызывается — прецедент ветки 'accept').
        const C = G.companions;
        if (!C || typeof C.dismiss !== 'function' ||
            !Array.isArray(roster)) return;
        const id = btn.dataset.npcid;
        const n = npcs().find((x) => x && x.id === id) || null;
        const r = C.dismiss(roster, id);
        if (r.ok) {
          // «Призрак» (npcId нет в каталоге) — голый id (тихий,
          // паттерн 000029/000085).
          npcLog('Уволен: ' + (n ? n.имя : id));
          if (onChange) onChange();
          renderTab();
        } else {
          npcLog(r.reason);
          renderTab();
        }
        return;
      }
      if (act === 'buy' || act === 'sell') {
        const r = act === 'buy'
          ? G.npcBuy(npcShop, c, btn.dataset.item, 1)
          : G.npcSell(npcShop, c, btn.dataset.item, 1);
        if (r.ok) {
          npcLog((act === 'buy' ? 'Куплено: ' : 'Продано: ') +
            G.getItem(r.item).name + ' за ' + r.price + ' з');
          if (onChange) onChange();
        } else {
          npcLog(r.reason);
        }
        renderTab();
        G.playerUI && G.playerUI.render();
        return;
      }
      if (act === 'train') {
        const r = G.schoolTrain(npc, c, btn.dataset.skill);
        npcLog(r.ok ? 'Уровень: ' + r.level + ' (−' + r.price + ' з)' : r.reason);
        if (r.ok && onChange) onChange();
        renderTab();
        G.playerUI && G.playerUI.render();
        return;
      }
      if (act === 'refund') {
        const r = G.schoolRefund(npc, c, btn.dataset.skill, 1);
        npcLog(r.ok ? 'Очко возвращено: +1 (−' + r.price + ' з)' : r.reason);
        if (r.ok && onChange) onChange();
        renderTab();
        G.playerUI && G.playerUI.render();
        return;
      }
      if (act === 'accept') {
        const r = G.acceptQuest(book, npcs(), npc, btn.dataset.quest, day);
        npcLog(r.ok ? 'Квест взят: ' + r.quest.название : r.reason);
        if (r.ok && onChange) onChange();
        renderTab();
        return;
      }
      if (act === 'turnin') {
        const r = G.turnInQuest(npcs(), book, c, btn.dataset.quest);
        if (r.ok) {
          let msg = 'Квест сдан: ' + r.quest.название + '. +' +
            r.reward.xp + ' опыта, +' + r.reward.gold + ' з';
          if (r.reward.items.length) {
            msg += '; ' + r.reward.items.map((g) => {
              const it = G.getItem(g.предмет);
              return (it ? it.name : g.предмет) +
                (g.количество > 1 ? ' ×' + g.количество : '');
            }).join(', ');
          }
          npcLog(msg);
        } else {
          npcLog(r.reason);
        }
        if (r.ok && onChange) onChange();
        renderTab();
        G.playerUI && G.playerUI.render();
      }
    }

    // --- Оверлей: сборка/разборка ---

    function npcCloseDom() {
      if (escHandler) {
        window.removeEventListener('keydown', escHandler);
        escHandler = null;
      }
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      body = null;
      titleText = null;
      logEl = null;
    }

    function npcClose() {
      npcCloseDom();
      npc = null;
      c = null;
      book = null;
      npcShop = null;
      onChange = null;
      roster = null;
      deadMercs = null;
    }

    function npcBuild() {
      npcCloseDom(); // повторное открытие — разбирать прежний оверлей
      overlay = el('div', 'combat-overlay npc-overlay');
      // Панель — СВОЙ класс .npc-panel (000125): декэплинг от боевой
      // .combat-side — layout диалога не зависит от её геометрии.
      const side = el('div', 'npc-panel');

      const title = el('div', 'cp-title', '');
      titleText = el('span', '');
      const closeBtn = el('button', 'cp-close', 'закрыть [Esc]');
      closeBtn.dataset.npcact = 'close';
      title.appendChild(titleText);
      title.appendChild(closeBtn);
      side.appendChild(title);

      // Переключение вкладок.
      const tabsRow = el('div', 'cp-itemrow');
      for (const [t, label] of [
        ['dialog', 'диалог'], ['trade', 'торговля'],
        ['train', 'школа'], ['quests', 'квесты'],
        ['hire', 'найм'],
      ]) {
        const b = el('button', 'cp-btn', label);
        b.dataset.npcact = 'tab';
        b.dataset.tab = t;
        tabsRow.appendChild(b);
      }
      side.appendChild(tabsRow);

      body = el('div', 'cp-items');
      side.appendChild(body);

      // Лог: подсказки, результаты сделок, наград.
      logEl = el('div', 'combat-state npc-log');
      side.appendChild(logEl);

      overlay.appendChild(side);
      overlay.addEventListener('click', onOverlayClick);
      document.body.appendChild(overlay);

      // Esc закрывает диалог (слушатель живёт только пока экран открыт).
      escHandler = (e) => {
        if (e.code === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          npcClose();
        }
      };
      window.addEventListener('keydown', escHandler);

      renderTab();
    }

    function renderTab() {
      if (!overlay || !npc) return;
      titleText.textContent = npc.имя + ' — ' + npc.роль;
      logEl.textContent = log.join('\n');
      logEl.scrollTop = logEl.scrollHeight;
      body.textContent = '';
      if (tab === 'dialog') renderDialogTab();
      else if (tab === 'trade') renderTradeTab();
      else if (tab === 'train') renderTrainTab();
      // Явная ветка (000078): без неё «найм» тихо рисовал бы квесты.
      else if (tab === 'hire') renderHireTab();
      else renderQuestsTab();
    }

    G.npcUI = {
      /**
       * Открыть диалог NPC.
       * @param {object} o
       * @param {object} o.npc       запись каталога (Game.NpcData.NPCS)
       * @param {object} o.character персонаж
       * @param {object} o.book      журнал квестов (G.createQuestBook())
       * @param {object} o.tile      тайл постройки (x, y, building, buildingWealth)
       * @param {Array} [o.roster]    000083: ЖИВАЯ ссылка на отряд
       *                              (записи {npcId, level, xp, loyalty,
       *                              hiredDay}, main.js) — вкладка «найм»
       * @param {Array} [o.deadMercs] 000083: ЖИВАЯ ссылка [npcId]
       *                              погибших (main.js) — вкладка «найм»
       */
      open(o) {
        npc = o.npc;
        c = o.character;
        book = o.book;
        tab = 'dialog';
        // Сток — общий на сессию (main.js, задача 000029): переиспользуем,
        // не создавая новый; onChange — хук на изменение состояния (сейв).
        npcShop = o.shop || null;
        onChange = typeof o.onChange === 'function' ? o.onChange : null;
        day = Number.isInteger(o.day) && o.day >= 1 ? o.day : null;
        // 000083: ЖИВЫЕ ссылки (main.js): мутация через
        // G.companions.hire/dismiss (push/splice) видна на всех уровнях.
        roster = Array.isArray(o.roster) ? o.roster : null;
        deadMercs = Array.isArray(o.deadMercs) ? o.deadMercs : null;
        log = [npc.описание || (npc.имя + ', ' + npc.роль)];
        npcBuild();
      },
      close: npcClose,
      isActive() {
        return !!overlay;
      },
      render: () => { if (npc) renderTab(); },
    };
  }

  // --- On-screen-контролы (задача 000018, расширено 000123) ---
  // Чистая логика (выбор схемы, раскладка, хит-тест, детект устройства) —
  // в src/controls.js (тестируется в node); здесь только DOM-привязка.
  // D-pad (внизу слева, ТОЛЬКО если init-флаг dpad === true): удержание
  // — движение, скольжение пальца — переключение направления.
  // Кнопки внизу справа (ОБЕ схемы, задача 000123): [I] (инвентарь,
  // панель персонажа) НАД [E] (действие — то же, что клавиша [E]) —
  // вертикальная пара. Содержимое кнопок — SVG-иконки assets/ui/
  // (000123, паттерн 000124: img + alt + aria-label), ТЕКСТОВЫХ букв
  // «E»/«I» на кнопках больше нет.
  (function () {
    // controls.js ОБЯЗАН быть загружен раньше ui.js (см. index.html):
    // при отсутствии функций контролы не собираются — это ошибка порядка
    // загрузки, видимая в консоли (не «тихий» fallback).
    if (!G.layoutTouchControls || !G.touchActionAt) {
      console.error('ui.js: on-screen-контролы не собраны — ' +
        'src/controls.js должен загружаться ДО src/ui.js');
      return;
    }
    let root = null, dpadEl = null, actionEl = null, inventoryEl = null;
    const arrows = {}; // dir -> span (пусто, если D-pad не строится)
    let shown = false;
    let layout = null;
    let heldPointer = null; // pointerId, удерживающий D-pad (один)
    let heldDir = null;
    let onHold = null, onRelease = null, onInteract = null,
        onInventory = null;

    // Под кнопку полноэкранного режима (внизу справа, если она есть)
    // оставляем место: action-кнопку раскладка поднимет вверх.
    function bottomInset() {
      const fsBtn = document.querySelector('.fs-btn');
      return fsBtn ? fsBtn.offsetHeight + 12 : 0;
    }

    function applyLayout() {
      // Guard — по actionEl, НЕ по dpadEl (задача 000123): в схеме
      // 'keyboard' D-pad не строится (dpadEl === null), но кнопки
      // [E]/[I] ЕСТЬ и обязаны раскладываться. Кнопки — ВСЕГДА,
      // D-pad и стрелки — только при dpadEl.
      if (!root || !actionEl) return;
      layout = G.layoutTouchControls(
        window.innerWidth, window.innerHeight, { bottomInset: bottomInset() });
      const place = (node, r) => {
        node.style.left = r.x + 'px';
        node.style.top = r.y + 'px';
        node.style.width = r.w + 'px';
        node.style.height = r.h + 'px';
      };
      place(actionEl, layout.action);
      place(inventoryEl, layout.inventory);
      if (dpadEl) {
        place(dpadEl, layout.dpad);
        // Стрелки — в центре «лучей» D-pad (координаты внутри dpadEl).
        const d = layout.dpad;
        const off = d.w * 0.30;
        const pos = {
          up: [d.w / 2, d.w / 2 - off],
          down: [d.w / 2, d.w / 2 + off],
          left: [d.w / 2 - off, d.h / 2],
          right: [d.w / 2 + off, d.h / 2],
        };
        for (const dir of G.DIRS) {
          arrows[dir].style.left = pos[dir][0] + 'px';
          arrows[dir].style.top = pos[dir][1] + 'px';
        }
      }
    }

    // Направление по точке, если это направление (не 'interact'/null).
    function dirAt(x, y) {
      const act = G.touchActionAt(x, y, layout);
      return act && G.DIRS.indexOf(act) >= 0 ? act : null;
    }

    function releasePointer(id) {
      if (id !== null && id !== heldPointer) return;
      heldPointer = null;
      if (heldDir && onRelease) onRelease(heldDir);
      heldDir = null;
    }

    function build(withDpad) {
      root = el('div');
      root.id = 'touch-controls';
      // D-pad — УСЛОВНО (задача 000123): строится строго при
      // init-флаге dpad === true (схема 'touch'); в схеме 'keyboard'
      // dpadEl остаётся null и arrows пуст — вся heldPointer-механика
      // null-guard-ится и инертна.
      if (withDpad) {
        dpadEl = el('div', 'tc-dpad');
        for (const dir of G.DIRS) {
          const a = el('span', 'tc-arrow',
            dir === 'up' ? '▲' : dir === 'down' ? '▼'
              : dir === 'left' ? '◀' : '▶');
          a.style.transform = 'translate(-50%, -50%)';
          arrows[dir] = a;
          dpadEl.appendChild(a);
        }
        // D-pad: down → держать направление; move → скольжение (смена
        // направления, мёртвая зона — текущее); up/cancel → отпустить.
        // setPointerCapture — pointerup доедет до D-pad даже поверх
        // оверлеев (бой/диалог), поэтому «залипший» палец не останется.
        dpadEl.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          if (heldPointer !== null) return; // второй палец на D-pad — нет
          const dir = dirAt(e.clientX, e.clientY);
          if (!dir) return; // мёртвая зона/снаружи лучей — не берём
          heldPointer = e.pointerId;
          heldDir = dir;
          if (onHold) onHold(dir);
          try { dpadEl.setPointerCapture(e.pointerId); } catch (err) { /* ie */ }
        });
        dpadEl.addEventListener('pointermove', (e) => {
          if (e.pointerId !== heldPointer || !heldDir) return;
          const dir = dirAt(e.clientX, e.clientY);
          if (!dir || dir === heldDir) return; // мёртвая зона — держим текущее
          const old = heldDir;
          heldDir = dir;
          if (onRelease) onRelease(old);
          if (onHold) onHold(dir);
        });
        const end = (e) => {
          if (e.pointerId !== heldPointer) return;
          releasePointer(e.pointerId);
        };
        dpadEl.addEventListener('pointerup', end);
        dpadEl.addEventListener('pointercancel', end);
        root.appendChild(dpadEl);
      }

      // Кнопки [E]/[I] — БЕЗ текстовых букв (задача 000123):
      // содержимое — SVG-иконка assets/ui/ (паттерн 000124: img +
      // alt="" — иконка презентационная, aria-label несёт имя).
      // blur() — чтобы Enter/Space на гибридных устройствах не
      // «перепечатывали» сфокусированную кнопку.
      actionEl = el('button', 'tc-action');
      const actionIcon = el('img');
      actionIcon.src = 'assets/ui/icon_action.svg';
      actionIcon.alt = '';
      actionEl.appendChild(actionIcon);
      actionEl.setAttribute('aria-label', 'Действие (диалог NPC / постройка)');
      actionEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (onInteract) onInteract();
        actionEl.blur();
      });

      inventoryEl = el('button', 'tc-action');
      const invIcon = el('img');
      invIcon.src = 'assets/ui/icon_inventory.svg';
      invIcon.alt = '';
      inventoryEl.appendChild(invIcon);
      inventoryEl.setAttribute('aria-label', 'Инвентарь');
      // Кнопка «I» — то же поведение, что [E] (аналог клавиши [I] в
      // main.js: панель персонажа, вкладка «Инвентарь»).
      inventoryEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (onInventory) onInventory();
        inventoryEl.blur();
      });

      root.appendChild(actionEl);
      root.appendChild(inventoryEl);
      document.body.appendChild(root);
      window.addEventListener('resize', applyLayout);
      // Вкладка в фоне / системный жест — палец «срезан»: отпускаем.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) releasePointer(null);
      });
    }

    G.touchControls = {
      /**
       * Инициализировать on-screen-контролы (один раз).
       * @param {{onHold?: (dir: string) => void,
       *          onRelease?: (dir: string) => void,
       *          onInteract?: () => void,
       *          onInventory?: () => void,
       *          dpad?: boolean}} h
       *   onHold/onRelease — 'up'|'down'|'left'|'right' (направление
       *   удерживается / отпущено), onInteract — действие (диалог /
       *   постройка, аналог [E]), onInventory — панель инвентаря
       *   (аналог [I]; задача 000123). dpad — собирать ли D-pad:
       *   true — схема 'touch' (D-pad + обе кнопки), false/не задано —
       *   схема 'keyboard' (только кнопки, D-pad не строится, задача
       *   000123).
       */
      init(h) {
        if (root) return;
        h = h || {};
        onHold = h.onHold;
        onRelease = h.onRelease;
        onInteract = h.onInteract;
        onInventory = h.onInventory;
        build(h.dpad === true);
      },
      show() {
        if (!root) return;
        // typeof-guard: vm-boot-станды в тестах дают classList, у которого
        // нет add/remove (см. шапку файла — прецеденты typeof-guard).
        if (typeof root.classList === 'object' && root.classList) {
          root.classList.add('visible');
        }
        shown = true;
        applyLayout();
      },
      hide() {
        if (!root) return;
        if (typeof root.classList === 'object' && root.classList) {
          root.classList.remove('visible');
        }
        shown = false;
        releasePointer(null);
      },
      isActive() { return shown; },
      releaseAll() { releasePointer(null); },
    };
  })();
})();
