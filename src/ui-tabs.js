// Реестр вкладок панели персонажа (задача 000130 — разбиение ui.js).
//
// Чистый UMD-модуль (образец src/cities.js/src/building-effects.js):
// node — require() возвращает экземпляр реестра; браузер —
// Game.uiTabs. При загрузке — НОЛЬ зависимостей: ни require, ни DOM,
// ни RNG, ни console.error в правильном порядке.
//
// Отдельный файл (не ui.js): вкладочные модули src/ui-tab-*.js
// грузятся ДО ui.js и регистрируются ПРИ ЗАГРУЗКЕ — реестр обязан
// существовать раньше первой вкладки (контракт
// memory/000130-ui-tabs.md §7.1). ui.js читает реестр ЛЕНИВО в
// buildPanel (без реестра — деградация: два пустых столбца +
// console.error, без краха).
//
// ФОРМА ЗАПИСИ ВКЛАДКИ (контракт §4.1; name/onKey/isDefault/order
// отклонены — нет потребителей):
//   { column: 0 | 1,      // 0 — левый столбец, 1 — правый
//     id: 'quests',       // уникальная строка (ключ get)
//     label: 'Квесты',    // подпись .cp-tab
//     build(pane, ctx),   // ОДИН раз в buildPanel ядра
//     render?(ctx), }     // КАЖДЫЙ render(), в порядке регистрации
//
// register() НИКОГДА не бросает: нарушение — console.error + skip
// (игнор записи). Дубликат id — сохраняется ПЕРВАЯ запись: порядок
// регистрации = порядок script-тегов (единственное поле правды,
// зафиксировано пином tests/index-order.test.js).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { uiTabs: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function () {
  'use strict';
  const tabs = [];

  function register(tab) {
    if (!tab || typeof tab !== 'object') {
      console.error('src/ui-tabs.js: register — запись не объект, ' +
        'игнорирую');
      return;
    }
    if (typeof tab.id !== 'string' || !tab.id) {
      console.error('src/ui-tabs.js: register — id — непустая строка, ' +
        'игнорирую запись');
      return;
    }
    if (tabs.some((t) => t.id === tab.id)) {
      // Дубликат — ПЕРВАЯ запись авторитетна (порядок скриптов).
      console.error('src/ui-tabs.js: дубликат вкладки с id "' +
        tab.id + '" — авторитетна первая запись');
      return;
    }
    if (typeof tab.label !== 'string' || !tab.label) {
      console.error('src/ui-tabs.js: вкладка "' + tab.id + '" — ' +
        'label — непустая строка, игнорирую запись');
      return;
    }
    if (tab.column !== 0 && tab.column !== 1) {
      console.error('src/ui-tabs.js: вкладка "' + tab.id + '" — ' +
        'column — строго 0 или 1, игнорирую запись');
      return;
    }
    if (typeof tab.build !== 'function') {
      console.error('src/ui-tabs.js: вкладка "' + tab.id + '" — ' +
        'build(pane, ctx) — функция, игнорирую запись');
      return;
    }
    if (tab.render != null && typeof tab.render !== 'function') {
      console.error('src/ui-tabs.js: вкладка "' + tab.id + '" — ' +
        'render(ctx) — функция (или нет поля), игнорирую запись');
      return;
    }
    tabs.push(tab);
  }

  function get(id) {
    for (const t of tabs) if (t.id === id) return t;
    return null;
  }

  // КОПИЯ в порядке регистрации: мутация возвращённого массива не
  // влияет на реестр (фиксатор тестом).
  function list() {
    return tabs.slice();
  }

  return { register, get, list };
});
