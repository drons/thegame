// Вкладка «Игровые настройки» панели персонажа (задача 000130 —
// разбиение ui.js). Текущий контент — PLACEHOLDER: форму настроек по
// SETTINGS+META добавит задача 000098 (зона 000098 — ЭТОТ файл;
// build один раз — форма живёт, apply — по change своих input'ов;
// pane-уровневые слушатели делегированным кликом панели не считаются).
//
// Чистый UMD-модуль (образец src/cities.js): node — require()
// возвращает определение вкладки (без регистрации); браузер —
// САМОРЕГИСТРАЦИЯ в Game.uiTabs при загрузке (src/ui-tabs.js обязан
// грузиться ДО этого файла — иначе console.error + без регистрации,
// игра не падает — паттерн 000053). При загрузке — НОЛЬ DOM, НОЛЬ
// require, НОЛЬ RNG.
//
// render() нет — статичный placeholder (000098 добавит).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null, null);   // node: определение, без
                                            // регистрации
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const m = factory(G0, root);
    const reg = G0.uiTabs;
    if (reg && typeof reg.register === 'function') {
      for (const t of (m.tabs || [m.tab])) reg.register(t);
    } else if (root) {
      console.error('src/ui-tab-settings.js: Game.uiTabs не найден — ' +
        'src/ui-tabs.js должен грузиться ДО вкладочных модулей ' +
        '(задача 000130)');
    }
    // «Модуль заменяет Game» (000018/000038): реестр — ТОТ ЖЕ
    // объект-ссылка (мутация in place, не новый объект — 000038-
    // ловушка a3).
    root.Game = Object.assign({}, G0, m.game || {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function (G0, rootRef) {
  'use strict';

  const tab = {
    column: 0,
    id: 'settings',
    label: 'Игровые настройки',
    build(pane, ctx) {
      // Placeholder: 000098 добавит сюда форму настроек.
      pane.appendChild(ctx.el('div', 'cp-section', 'Игровые настройки'));
      pane.appendChild(ctx.el('div', 'cp-itemmeta',
        'настройки появятся позже (задача 000098)'));
    },
  };

  return { tab };
});
