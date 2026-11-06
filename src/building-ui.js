// Оверлей «действия постройки» (задача 000071): ЕДИНЫЙ роутинг [E] —
// список действий тайла постройки: «Диалог» (если у постройки есть
// NPC) + действия эффектов из каталога (src/building-effects.js).
//
// Браузерный модуль (IIFE, паттерн ui.js — НЕ ui.js: её параллельно
// правила задача 000097; решение и обоснование —
// memory/000071-building-ui.md). Оверлей .combat-overlay > .combat-side
// по образцу Game.npcUI (ui.js:881) — ТОЛЬКО существующие CSS-классы
// (.combat-overlay/.combat-side/.cp-*), новых нет.
//
// Game.buildingUI = { open({ title, actions, onAction }), close(),
// isActive() }:
//   * 1..9 — выполнить строку N напрямую (до 9 строк);
//   * ↑↓ — курсор по доступным строкам (wrap, недоступные пропускаются),
//     Enter/NumpadEnter — выполнить строку под курсором: ЕДИНСТВЕННЫЙ
//     способ достичь 10-й и следующих строк (каталог открыт — длина
//     списка не ограничена 9; оверлей создаётся в 000071 ЕДИНЫМ,
//     последующие подзадачи добавляют только записи реестра и НЕ
//     трогают оверлей — отсрочка ↑↓ была бы необратимой);
//   * строка под курсором помечена «▸ » (текстовый маркер в имени —
//     новых CSS-классов НЕТ);
//   * клик по строке — выполнить (тач-сценарий 000123: ОДИН
//     делегированный click на оверлее, паттерн npcUI onOverlayClick);
//   * [Esc] — закрыть (слушатель на window живёт, пока оверлей открыт,
//     паттерн escHandler npcUI); [E] — закрывает РОУТЕР main.js
//     (toggleNpcDialog) — здесь не дублируется;
//   * недоступные строки — disabled + reason виден;
//   * после onAction(action) оверлей закрывается САМ.
//
// DOM-операции ТОЛЬКО внутри open(): при загрузке — присвоение
// G.buildingUI (vm-песочницы main-visuals/save-restore/sprites
// подхватывают скрипт из CHAIN index.html — не должны ронять загрузку).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G) return;

  let overlay = null;
  let actions = [];
  let onAction = null;
  let active = false;
  let keyHandler = null;
  let rows = [];    // [{ row, nameSpan, action }] — параллельно actions
  let cursor = -1;  // индекс строки под курсором (-1 — нет доступных)
  let portraitsRow = null;      // 000299.01: ряд портретов партии
  let portraitsErrorShown = false;
  let dragging = null;  // 000313: {id, side} — активный dnd-перенос

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function isActive() {
    return active;
  }

  function findAction(id) {
    for (const a of actions) {
      if (a && String(a.id) === String(id)) return a;
    }
    return null;
  }

  // 000299.01: ряд портретов партии (активный персонаж). Состав —
  // Game.Party.list, мир — LIVE __game.state (state.hero — снимок,
  // для ряда достаточен: id/имя/роль; primary/secondary не нужен)
  // + squadUI.liveState() (песочница без main.js — ТИХО, 000145).
  // ТОЛЬКО существующие классы .cp-portraits/.cp-portrait/
  // .cp-portrait-active (index.html; новых CSS НЕТ); КНОПКА НЕ
  // .cp-btn (ловушка делегирования 000098). PortraitsData нет — ряд
  // не рисуется, console.error ОДИН раз (000053); __game нет —
  // тихо (000145); Party нет — hero-фолбэк (одномемберный, тихо).
  function renderPortraitsRow(row) {
    // G — снимок Game на момент загрузки (ловушка UMD 000038):
    // PortraitsData/Party/NpcData/playerUI читаем из globalThis.Game
    // в момент вызова (паттерн rootRef, 000147).
    const game = globalThis.Game || G;
    const PD = game.PortraitsData;
    if (!PD || !Array.isArray(PD.PORTRAITS)) {
      if (!portraitsErrorShown) {
        portraitsErrorShown = true;
        console.error('src/building-ui.js: Game.PortraitsData ' +
          'не найден — ряд портретов партии не рисуется ' +
          '(000299.01)');
      }
      row.textContent = '';
      return;
    }
    const g = globalThis.__game;
    const st = (g && g.state && typeof g.state === 'object' &&
        !Array.isArray(g.state)) ? g.state : null;
    const sq = (G.squadUI && typeof G.squadUI.liveState === 'function')
      ? G.squadUI.liveState() : null;
    const hero = (st && st.hero && typeof st.hero === 'object' &&
        !Array.isArray(st.hero)) ? st.hero : null;
    const roster = (st && Array.isArray(st.roster)) ? st.roster
      : (sq && Array.isArray(sq.roster) ? sq.roster : null);
    const efir = (st && st.efir && typeof st.efir === 'object' &&
        !Array.isArray(st.efir)) ? st.efir
      : (sq && sq.efir && typeof sq.efir === 'object' &&
          !Array.isArray(sq.efir) ? sq.efir : null);
    const P = game.Party;
    let members = null;
    if (P && typeof P.list === 'function' &&
        typeof P.active === 'function') {
      members = P.list({
        hero: hero,
        efir: efir,
        efirMet: !!(st && st.efirMet === true),
        roster: roster,
        npcs: (game.NpcData && game.NpcData.NPCS) || null,
      });
    } else if (hero) {
      members = [{
        kind: 'hero',
        id: 'flogiston',
        name: (typeof hero.name === 'string' && hero.name)
          ? hero.name : 'Флогистон',
        role: 'Герой',
        sheet: hero,
      }];
    }
    if (!members || !members.length) {
      row.textContent = '';
      return;
    }
    const activeId = (game.playerUI &&
        typeof game.playerUI.getActiveCharId === 'function')
      ? game.playerUI.getActiveCharId() : null;
    const active = members.find((m) => m.id === activeId) ||
      members[0];
    row.textContent = '';
    for (const m of members) {
      const p = PD.PORTRAITS.find((x) => x && x.id === m.id);
      if (!p || typeof p.icon !== 'string' || !p.icon) continue;
      const btn = el('button', m === active
        ? 'cp-portrait cp-portrait-active' : 'cp-portrait');
      btn.dataset.memberid = m.id;
      btn.title = m.name + ' — ' + m.role;
      const img = el('img');
      img.src = 'assets/portraits/' + p.icon;
      img.alt = m.name;
      btn.appendChild(img);
      row.appendChild(btn);
    }
  }

  // --- Курсор (↑↓) ---
  // Курсор бывает ТОЛЬКО на доступных строках (стрелки их пропускают):
  // выполнить из-под курсора можно лишь доступное. -1 — доступных нет.

  function availableIndexes() {
    const out = [];
    for (let i = 0; i < actions.length; i++) {
      if (actions[i] && actions[i].доступен) out.push(i);
    }
    return out;
  }

  function renderCursor() {
    rows.forEach((r, i) => {
      r.nameSpan.textContent = (i === cursor ? '▸ ' : '') +
        (r.action.имя || String(r.action.id));
    });
  }

  function setCursor(i) {
    cursor = i;
    renderCursor();
  }

  // dir: +1 (ArrowDown) / -1 (ArrowUp); wrap по доступным строкам.
  function moveCursor(dir) {
    const avail = availableIndexes();
    if (!avail.length) return;
    const from = avail.indexOf(cursor);
    // Курсор не на доступной (после повторного open — не бывает, но
    // defensively): к краю в сторону движения.
    if (from === -1) {
      setCursor(dir > 0 ? avail[0] : avail[avail.length - 1]);
      return;
    }
    setCursor(avail[(from + dir + avail.length) % avail.length]);
  }

  // Выполнить действие: недоступное — игнор (оверлей остаётся);
  // доступное — onAction(САМО действие) и оверлей закрывается САМ
  // (контракт 000071). Закрытие — ДО вызова: обработчик (main.js)
  // на том же нажатии может открыть npcUI («Диалог»).
  function executeAction(action) {
    if (!action || !action.доступен) return;
    const fn = onAction;
    close();
    if (typeof fn === 'function') fn(action);
  }

  // Клавиши: вешаются на open, снимаются на close (паттерн escHandler
  // npcUI, ui.js:920-927). 1..9 — выполнить строку N, ↑↓ — курсор,
  // Enter/NumpadEnter — выполнить под курсором, [Esc] — закрыть.
  // preventDefault у стрелок/Enter: не скроллить страницу; движение
  // игрока всё равно не сработает (гейт main.js: buildingUI.isActive()).
  function onKeyDown(e) {
    if (!active) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
      e.preventDefault();
      moveCursor(e.code === 'ArrowDown' ? 1 : -1);
      return;
    }
    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      e.preventDefault();
      if (cursor >= 0) executeAction(actions[cursor]);
      return;
    }
    const dm = /^Digit([1-9])$/.exec(String(e.code || ''));
    if (!dm) return;
    const a = actions[Number(dm[1]) - 1];
    if (!a) return;
    executeAction(a);
  }

  // ОДИН делегированный click на оверлее (паттерн npcUI
  // onOverlayClick): кнопка «закрыть» в заголовке + строки действий
  // (data-buid; недоступные — disabled, без действия).
  function onOverlayClick(e) {
    if (!active) return;
    const t = e && e.target;
    if (!t || typeof t.closest !== 'function') return;
    // 000299.01: портрет партии — СВОЯ ветка (НЕ data-buid,
    // executeAction НЕ вызывается): setActiveCharId + ин-плейс
    // перерисовка ряда; оверлей НЕ закрывается, saveNow/flash нет.
    const pb = t.closest('button.cp-portrait');
    if (pb) {
      if (G.playerUI &&
          typeof G.playerUI.setActiveCharId === 'function') {
        G.playerUI.setActiveCharId(pb.dataset.memberid);
      }
      if (portraitsRow) renderPortraitsRow(portraitsRow);
      return;
    }
    if (t.closest('button[data-buact="close"]')) {
      close();
      return;
    }
    // Строка — div.cp-itemrow (не button): closest('[data-buid]').
    // row.disabled — JS-свойство (ставится при buildDom; у div в
    // реальном браузере нет нативного disabled — двойная защита:
    // executeAction ещё раз проверяет action.доступен).
    const row = t.closest('[data-buid]');
    if (!row || row.disabled) return;
    executeAction(findAction(row.dataset.buid));
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
    portraitsRow = null;
  }

  function close() {
    if (!active) return;
    active = false;
    closeDom();
    actions = [];
    onAction = null;
    rows = [];
    cursor = -1;
    dragging = null;
  }

  // --- 000313: layout 'storage' — две панели «инвентарь | склад» ---
  // Панель по стороне действия (side из buildRows: put-* → 'inv',
  // take-*/'empty' → 'stock'); заголовки — «Инвентарь» /
  // «Склад (N/M)» (capacity из payload). dnd: dragstart строки
  // фиксирует {id, side} (dataTransfer.setData — только id); dragover
  // — preventDefault ТОЛЬКО на колонке-ЦЕЛИ (противоположная сторона);
  // drop — executeAction(findAction(id)) — ОДНА и та же мутация, что
  // клик/кнопка (executeAction → close + onAction).

  function colSideOf(a) {
    return a && a.side === 'inv' ? 'inv' : 'stock';
  }

  function onRowDragStart(e, a) {
    if (!a || !a.доступен) return;
    dragging = { id: String(a.id), side: colSideOf(a) };
    const dt = e && e.dataTransfer;
    if (dt) {
      dt.effectAllowed = 'move';
      dt.setData('text/plain', String(a.id));
    }
  }

  function onRowDragEnd() {
    dragging = null;
  }

  function onColDragOver(e, side) {
    if (dragging && dragging.side !== side) e.preventDefault();
  }

  function onColDrop(e, side) {
    if (!dragging || dragging.side === side) return;
    e.preventDefault();
    const id = dragging.id;
    dragging = null;
    executeAction(findAction(id));
  }

  function makeItemRow(a, i, o, opts) {
    const row = el('div', (typeof opts.rarity === 'string' && opts.rarity !== '')
      ? 'cp-itemrow cp-rarity-' + opts.rarity : 'cp-itemrow');
    row.setAttribute('data-buid', String(a.id));
    row.disabled = !a.доступен;
    if (opts.draggable) row.draggable = !!a.доступен;
    if (!a.доступен && (opts.dimAlways || !o.reasonRed)) {
      row.style.opacity = '0.3';
    }
    if (typeof a.icon === 'string' && a.icon !== '') {
      const icon = el('img', 'cp-itemicon');
      icon.src = a.icon;
      icon.alt = '';
      row.appendChild(icon);
    } else {
      row.appendChild(el('span', 'cp-btn', String(i + 1)));
    }
    const nameSpan = el('span', 'cp-itemname');
    row.appendChild(nameSpan);
    if (typeof opts.meta === 'string' && opts.meta !== '') {
      row.appendChild(el('span', 'cp-itemmeta', opts.meta));
    }
    if (a.reason) {
      row.appendChild(el('span',
        o.reasonRed ? 'cp-itemmeta cp-itemreason' : 'cp-itemmeta',
        ' — ' + a.reason));
    }
    if (typeof opts.btn === 'string' && opts.btn !== '') {
      const btn = el('button', 'cp-btn', opts.btn);
      btn.disabled = !a.доступен;
      row.appendChild(btn);
    }
    if (opts.draggable) {
      row.addEventListener('dragstart', (ev) => onRowDragStart(ev, a));
      row.addEventListener('dragend', onRowDragEnd);
    }
    return { row, nameSpan, action: a };
  }

  function buildStorageDom(o, side) {
    const wrap = el('div', 'storage-cols');
    const invCol = el('div', 'storage-col storage-col--inv');
    const stockCol = el('div', 'storage-col storage-col--stock');
    invCol.appendChild(el('div', 'cp-title', 'Инвентарь'));
    const cap = o && o.capacity;
    stockCol.appendChild(el('div', 'cp-title',
      cap && Number.isFinite(cap.n) && Number.isFinite(cap.m)
        ? 'Склад (' + cap.n + '/' + cap.m + ')' : 'Склад'));
    rows = [];
    actions.forEach((a, i) => {
      const r = makeItemRow(a, i, o, {
        rarity: a.rarity, meta: a.meta, btn: a.btn,
        draggable: true, dimAlways: true,
      });
      rows.push(r);
      (colSideOf(a) === 'inv' ? invCol : stockCol).appendChild(r.row);
    });
    invCol.addEventListener('dragover', (e) => onColDragOver(e, 'inv'));
    invCol.addEventListener('drop', (e) => onColDrop(e, 'inv'));
    stockCol.addEventListener('dragover', (e) => onColDragOver(e, 'stock'));
    stockCol.addEventListener('drop', (e) => onColDrop(e, 'stock'));
    wrap.appendChild(invCol);
    wrap.appendChild(stockCol);
    side.appendChild(wrap);
    const avail = availableIndexes();
    cursor = avail.length ? avail[0] : -1;
    renderCursor();
  }

  function buildDom(o) {
    closeDom(); // повторное открытие — разбирать прежний оверлей
    overlay = el('div', o.layout === 'storage'
      ? 'combat-overlay combat-overlay--storage'
      : (o.scroll
        ? 'combat-overlay combat-overlay--build' : 'combat-overlay'));
    const side = el('div', 'combat-side');

    const title = el('div', 'cp-title');
    title.appendChild(el('span', '', o.title || ''));
    const closeBtn = el('button', 'cp-close', 'закрыть [Esc]');
    closeBtn.setAttribute('data-buact', 'close');
    title.appendChild(closeBtn);
    side.appendChild(title);

    // 000299.01: ряд портретов партии (активный персонаж) — ПЕРЕД
    // строками действий (контракт DOM: .combat-side > .cp-portraits
    // — второй ребёнок); клик — своя ветка в onOverlayClick.
    portraitsRow = el('div', 'cp-portraits');
    renderPortraitsRow(portraitsRow);
    side.appendChild(portraitsRow);

    // Строки действий: 1..9 — нумерация, data-buid — id действия
    // (тач-клик 000123); недоступные — disabled + reason виден.
    // Строка — div.cp-itemrow по образцу itemRow npcUI (ui.js:288):
    // span.cp-btn — чип номера (CSS .cp-itemrow .cp-btn: width auto,
    // не 24px), span.cp-itemname (flex:1), span.cp-itemmeta (reason).
    // Клик — по ВСЕЙ строке (hit-area широкая); голый button.cp-btn
    // (24px) был тесен: текст не влезал, кликалась только кнопка.
    if (o.layout === 'storage') {
      buildStorageDom(o, side);
    } else {
      const list = el('div', 'cp-items');
      rows = [];
      actions.forEach((a, i) => {
        const r = makeItemRow(a, i, o, {});
        rows.push(r);
        list.appendChild(r.row);
      });
      side.appendChild(list);

      // Курсор — первая доступная строка (доступных нет — -1); маркер
      // «▸ » — только в тексте имени (новых CSS-классов нет).
      const avail = availableIndexes();
      cursor = avail.length ? avail[0] : -1;
      renderCursor();
    }

    side.appendChild(el('div', 'cp-itemmeta',
      '1–9 — действие, ↑↓ — выбор, Enter — действие, [Esc] — закрыть'));

    overlay.appendChild(side);
    overlay.addEventListener('click', onOverlayClick);
    document.body.appendChild(overlay);

    // Слушатель живёт, пока оверлей открыт (паттерн npcUI).
    keyHandler = onKeyDown;
    window.addEventListener('keydown', keyHandler);
  }

  G.buildingUI = {
    /**
     * Открыть оверлей действий постройки.
     * @param {object} o
     * @param {string} o.title заголовок (имя постройки)
     * @param {Array<{id: string, имя: string, доступен: boolean,
     *               reason?: string}>} o.actions список действий
     *        (1..9 — порядок)
     * @param {(action: object) => void} o.onAction выполнить действие;
     *        после него оверлей закрывается сам
     */
    open(o) {
      close(); // повторное открытие — разбирать прежний оверлей
      // Стек оверлеев (паттерн startCombat, 000096): полноэкранная
      // панель персонажа (z-10) не должна накрывать мир вместе с
      // оверлеем (z-20). Esc-гейт playerUI не знает про buildingUI
      // (ui.js — зона 000097), поэтому закрытие — нашей стороной.
      if (G.playerUI && typeof G.playerUI.isOpen === 'function'
          && G.playerUI.isOpen()) {
        G.playerUI.toggle(false);
      }
      actions = Array.isArray(o.actions) ? o.actions.slice() : [];
      onAction = typeof o.onAction === 'function' ? o.onAction : null;
      active = true;
      buildDom(o);
    },
    close,
    isActive,
  };
})();
