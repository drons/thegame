const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createFullscreenController } = require('../src/fullscreen.js');

// Мок-документ с Fullscreen API нужного варианта (задача 000017).
// request/exit меняют состояние синхронно и возвращают Promise,
// как в браузере; fire() имитирует событие из «снаружи».
const VARIANTS = {
  std: ['requestFullscreen', 'exitFullscreen',
        'fullscreenElement', 'fullscreenchange'],
  webkit: ['webkitRequestFullscreen', 'webkitExitFullscreen',
           'webkitFullscreenElement', 'webkitfullscreenchange'],
  moz: ['mozRequestFullScreen', 'mozCancelFullScreen',
        'mozFullScreenElement', 'mozfullscreenchange'],
  ms: ['msRequestFullscreen', 'msExitFullscreen',
       'msFullscreenElement', 'msfullscreenchange'],
};

function makeDoc(variant = 'std') {
  const [req, exit, elem, evt] = VARIANTS[variant];
  const doc = {
    [elem]: null,
    calls: [],
    listeners: Object.create(null),
    addEventListener(type, fn) {
      (this.listeners[type] = this.listeners[type] || []).push(fn);
    },
    removeEventListener(type, fn) {
      const l = this.listeners[type] || [];
      const i = l.indexOf(fn);
      if (i >= 0) l.splice(i, 1);
    },
    fire(type) {
      for (const fn of [...(this.listeners[type] || [])]) fn();
    },
  };
  doc.__elem = elem;
  doc.__evt = evt;
  doc.documentElement = {
    [req]() {
      doc[elem] = doc.documentElement;
      doc.calls.push(req);
      return Promise.resolve();
    },
  };
  doc[exit] = function () {
    doc[elem] = null;
    doc.calls.push(exit);
    return Promise.resolve();
  };
  return doc;
}

test('детект: поддерживается при API — стандартном и всех вендорных', () => {
  for (const v of Object.keys(VARIANTS)) {
    const fs = createFullscreenController(makeDoc(v));
    assert.equal(fs.supported, true, v);
    fs.destroy();
  }
});

test('детект: API отсутствует — не поддерживается и ничего не бросает', () => {
  const fs = createFullscreenController({}); // ни documentElement, ни методов
  assert.equal(fs.supported, false);
  assert.equal(fs.isFullscreen, false);
  assert.equal(fs.toggle(), null);
  assert.equal(fs.enter(), null);
  assert.equal(fs.exit(), null);
  fs.destroy(); // дестрой тоже без ошибок
  assert.equal(createFullscreenController(null).supported, false);
});

test('toggle: меняет состояние, слушатели получают новые значения', () => {
  const doc = makeDoc();
  const fs = createFullscreenController(doc);
  const changed = [];
  fs.onChange((on) => changed.push(on));
  assert.equal(fs.isFullscreen, false);
  fs.toggle(); // вход
  assert.deepEqual(doc.calls, ['requestFullscreen']);
  assert.equal(fs.isFullscreen, true);
  fs.toggle(); // выход
  assert.deepEqual(doc.calls, ['requestFullscreen', 'exitFullscreen']);
  assert.equal(fs.isFullscreen, false);
  assert.deepEqual(changed, [true, false]);
  fs.destroy();
});

test('fullscreenchange извне: состояние синхронизируется', () => {
  const doc = makeDoc();
  const fs = createFullscreenController(doc);
  const changed = [];
  fs.onChange((on) => changed.push(on));
  // Браузер перешёл в полный экран «сам» (не через toggle).
  doc[doc.__elem] = doc.documentElement;
  assert.equal(fs.isFullscreen, true);
  // И обратно — по событию (например, пользователь нажал Esc).
  doc[doc.__elem] = null;
  doc.fire(doc.__evt);
  assert.equal(fs.isFullscreen, false);
  assert.deepEqual(changed, [true, false]);
  fs.destroy();
});

test('вендорный фолбэк: без стандартного API используется webkit', () => {
  const doc = makeDoc('webkit');
  const fs = createFullscreenController(doc);
  assert.equal(fs.supported, true);
  fs.toggle();
  assert.deepEqual(doc.calls, ['webkitRequestFullscreen']);
  assert.equal(fs.isFullscreen, true);
  fs.toggle();
  assert.deepEqual(doc.calls, ['webkitRequestFullscreen', 'webkitExitFullscreen']);
  assert.equal(fs.isFullscreen, false);
  fs.destroy();
});

test('отказ браузера: отклонённый request не роняет, состояние false', async () => {
  const doc = makeDoc();
  doc.documentElement.requestFullscreen =
    () => Promise.reject(new Error('denied'));
  const fs = createFullscreenController(doc);
  const p = fs.toggle();
  assert.ok(p, 'toggle возвращает promise даже при отказе');
  await p; // отклонение глотается контроллером
  assert.equal(fs.isFullscreen, false);
  fs.destroy();
});

test('отказ браузера: синхронный DOMException в request не роняет', () => {
  // Экзотические среды (старые браузеры, iframe без allowfullscreen)
  // бросают синхронно вместо отклонённого Promise (задача 000017).
  const doc = makeDoc();
  doc.documentElement.requestFullscreen = () => {
    throw new Error('DOMException: NotAllowedError');
  };
  const fs = createFullscreenController(doc);
  assert.doesNotThrow(() => fs.enter());
  assert.equal(fs.isFullscreen, false);
  fs.destroy();
});

test('destroy: отписка от события документа', () => {
  const doc = makeDoc();
  const fs = createFullscreenController(doc);
  const changed = [];
  fs.onChange((on) => changed.push(on));
  fs.destroy();
  doc[doc.__elem] = doc.documentElement;
  doc.fire(doc.__evt);
  assert.deepEqual(changed, []);
});
