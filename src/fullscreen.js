// Полноэкранный режим (задача 000017): чистое ядро поверх Fullscreen API.
//
// Чистое ядро без DOM — тестируется в node с мок-документом
// (tests/fullscreen.test.js). DOM-привязка (кнопка в углу экрана) —
// в src/main.js.
// Униформный модуль: в браузере — globalThis.Game, в node — require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // Варианты Fullscreen API: стандартный + вендорные префиксы
  // для старых браузеров (задача 000017).
  const VARIANTS = [
    { request: 'requestFullscreen', exit: 'exitFullscreen',
      element: 'fullscreenElement', event: 'fullscreenchange' },
    { request: 'webkitRequestFullscreen', exit: 'webkitExitFullscreen',
      element: 'webkitFullscreenElement', event: 'webkitfullscreenchange' },
    { request: 'mozRequestFullScreen', exit: 'mozCancelFullScreen',
      element: 'mozFullScreenElement', event: 'mozfullscreenchange' },
    { request: 'msRequestFullscreen', exit: 'msExitFullscreen',
      element: 'msFullscreenElement', event: 'msfullscreenchange' },
  ];

  /**
   * Контроллер полноэкранного режима (задача 000017).
   * @param {object} doc document-подобный объект: documentElement с
   *   request/exit-методом, свойство с элементом и add/removeEventListener.
   *   API недоступен — supported: false, все вызовы безопасны (нет бросков).
   */
  function createFullscreenController(doc) {
    const root = doc && doc.documentElement;
    const v = VARIANTS.find(
      (c) => root && typeof root[c.request] === 'function');
    const supported = !!v;

    const listeners = [];
    let state = supported ? !!doc[v.element] : false;

    // Перечитываем состояние из документа; при смене зовём слушателей.
    function sync() {
      const cur = supported ? !!doc[v.element] : false;
      if (cur !== state) {
        state = cur;
        for (const fn of [...listeners]) fn(state);
      }
      return state;
    }

    // Отклонённый request/exit (браузер отказал) — глотаем, игра не падает.
    function settle(p) {
      if (!p || typeof p.then !== 'function') return null;
      return p.catch(() => {}).then(() => sync());
    }

    // Вызов API: в экзотических средах (старые браузеры, iframe без
    // allowfullscreen) request может бросить DOMException синхронно,
    // а не отклонить Promise — глотаем (задача 000017).
    function callApi(fn) {
      if (typeof fn !== 'function') return null;
      let p;
      try { p = fn(); } catch { p = null; }
      return settle(p);
    }

    const onChangeHandler = () => sync();
    if (supported) doc.addEventListener(v.event, onChangeHandler);

    function enter() {
      if (!supported) return null;
      return callApi(() => root[v.request]());
    }

    function exit() {
      if (!supported) return null;
      const fn = typeof doc[v.exit] === 'function'
        ? doc[v.exit]
        : typeof root[v.exit] === 'function' ? root[v.exit] : null;
      if (!fn) return null;
      return callApi(() => fn.call(doc));
    }

    return {
      supported,
      // Текущее состояние (перечитывается из документа — отражает
      // внешние смены, например выход по Esc).
      get isFullscreen() { return sync(); },
      /** Переключить полноэкранный режим; Promise или null. */
      toggle() { return sync() ? exit() : enter(); },
      enter,
      exit,
      /** Подписка на смену состояния: fn(isFullscreen). */
      onChange(fn) { listeners.push(fn); return this; },
      /** Отписаться от события документа (уборка). */
      destroy() {
        if (supported) doc.removeEventListener(v.event, onChangeHandler);
        listeners.length = 0;
      },
    };
  }

  return { createFullscreenController };
});
