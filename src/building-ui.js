// Оверлей «действия постройки» (задача 000071): ЕДИНЫЙ роутинг [E] —
// список действий тайла постройки: «Диалог» (если у постройки есть
// NPC) + действия эффектов из каталога (src/building-effects.js).
//
// Браузерный модуль (IIFE, паттерн ui.js — НЕ ui.js: её параллельно
// правит задача 000097). Оверлей .combat-overlay > .combat-side по
// образцу Game.npcUI (ui.js:881) — ТОЛЬКО существующие CSS-классы
// (.combat-overlay/.combat-side/.cp-*), новых нет.
//
// Game.buildingUI = { open({ title, actions, onAction }), close(),
// isActive() }:
//   * 1..9 — выбрать/выполнить действие; ↑↓ не нужны (список короткий —
//     строки нумерованы);
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
  // npcUI, ui.js:920-927). 1..9 — выполнить, [Esc] — закрыть.
  function onKeyDown(e) {
    if (!active) return;
    if (e.code === 'Escape') {
      e.preventDefault();
      close();
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
    const row = t.closest('button[data-buid]');
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
  }

  function buildDom(o) {
    closeDom(); // повторное открытие — разбирать прежний оверлей
    overlay = el('div', 'combat-overlay building-overlay');
    const side = el('div', 'combat-side');

    const title = el('div', 'cp-title');
    title.appendChild(el('span', '', o.title || ''));
    const closeBtn = el('button', 'cp-close', 'закрыть [Esc]');
    closeBtn.setAttribute('data-buact', 'close');
    title.appendChild(closeBtn);
    side.appendChild(title);

    // Строки действий: 1..9 — нумерация, data-buid — id действия
    // (тач-клик 000123); недоступные — disabled + reason виден.
    const list = el('div', 'cp-items');
    actions.forEach((a, i) => {
      const row = el('button', 'cp-btn building-action');
      row.setAttribute('data-buid', String(a.id));
      row.disabled = !a.доступен;
      row.appendChild(el('span', 'building-action-num', String(i + 1)));
      row.appendChild(el('span', 'cp-itemname', a.имя || String(a.id)));
      if (a.reason) {
        row.appendChild(el('span', 'cp-itemmeta', ' — ' + a.reason));
      }
      list.appendChild(row);
    });
    side.appendChild(list);

    side.appendChild(el('div', 'cp-itemmeta',
      '1–9 — действие, [Esc] — закрыть'));

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
