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
  }

  function close() {
    if (!active) return;
    active = false;
    closeDom();
    actions = [];
    onAction = null;
    rows = [];
    cursor = -1;
  }

  function buildDom(o) {
    closeDom(); // повторное открытие — разбирать прежний оверлей
    overlay = el('div', 'combat-overlay');
    const side = el('div', 'combat-side');

    const title = el('div', 'cp-title');
    title.appendChild(el('span', '', o.title || ''));
    const closeBtn = el('button', 'cp-close', 'закрыть [Esc]');
    closeBtn.setAttribute('data-buact', 'close');
    title.appendChild(closeBtn);
    side.appendChild(title);

    // Строки действий: 1..9 — нумерация, data-buid — id действия
    // (тач-клик 000123); недоступные — disabled + reason виден.
    // Строка — div.cp-itemrow по образцу itemRow npcUI (ui.js:288):
    // span.cp-btn — чип номера (CSS .cp-itemrow .cp-btn: width auto,
    // не 24px), span.cp-itemname (flex:1), span.cp-itemmeta (reason).
    // Клик — по ВСЕЙ строке (hit-area широкая); голый button.cp-btn
    // (24px) был тесен: текст не влезал, кликалась только кнопка.
    const list = el('div', 'cp-items');
    rows = [];
    actions.forEach((a, i) => {
      const row = el('div', 'cp-itemrow');
      row.setAttribute('data-buid', String(a.id));
      row.disabled = !a.доступен;
      if (!a.доступен) row.style.opacity = '0.3'; // как .cp-btn:disabled
      row.appendChild(el('span', 'cp-btn', String(i + 1)));
      const nameSpan = el('span', 'cp-itemname');
      row.appendChild(nameSpan);
      if (a.reason) {
        row.appendChild(el('span', 'cp-itemmeta', ' — ' + a.reason));
      }
      rows.push({ row, nameSpan, action: a });
      list.appendChild(row);
    });
    side.appendChild(list);

    // Курсор — первая доступная строка (доступных нет — -1); маркер
    // «▸ » — только в тексте имени (новых CSS-классов нет).
    const avail = availableIndexes();
    cursor = avail.length ? avail[0] : -1;
    renderCursor();

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
