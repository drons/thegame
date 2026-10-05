// Стартовое окно (задача 000138): логотип assets/logo.svg +
// «Продолжить» (зелёный фон) / «Начать заново» (красный фон).
// «Начать заново» — удаление локальных данных (localStorage, SAVE_KEY,
// src/save.js) ПОСЛЕ тройного переспрашивания: вопросы составлены так,
// что подтвердить удаление нужно ответами «Да» / «Нет» / «Да»
// поочерёдно (ТЗ: «переспросить трижды… то на Да, то на Нет» — защита
// от случайного удаления; серия «Да, Да, Да» подтверждением НЕ является).
//
// Чистый UMD-модуль (паттерн src/hud.js / src/locations.js): node —
// require(), браузер — Game.startWindow. В момент загрузки — НОЛЬ
// зависимостей: ни require, ни DOM, ни чтения Game, ни console, ни
// Math.random (000038/000053, прецеденты 000127/000128). Зависимостей
// у модуля НЕТ (чистая UI-стейт-машина + колбэки) — ленивых ссылок
// Game не нужно ВООБЩЕ: сброс данных делает main.js (G.clear +
// location.reload; проводка — §7 memory/000138-start-window.md).
//
// Контракт: memory/000138-start-window.md — §2 (API), §3 (вопросы),
// §2.2 (DOM-дерево, прямые ссылки, className-строки). Тесты:
// tests/start-window.test.js (SW-N1..N3 node-юниты + SW-E1..E8 vm-e2e),
// пин порядка — tests/index-order.test.js (SW-O1).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();               // node: ноль взаимных require
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { startWindow: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Логотип (ТЗ) — СУЩЕСТВУЮЩИЙ ассет (уже в скопе обхода
  // tests/svg.test.js; новых SVG нет).
  const LOGO = 'assets/logo.svg';

  // Точные тексты кнопок (один источник; пины SW-N1/SW-E1).
  const BUTTONS = {
    continue: 'Продолжить',
    restart: 'Начать заново',
    yes: 'Да',
    no: 'Нет',
  };

  // Три вопроса (ТЗ: «переспросить трижды точно ли он собирается
  // удалить… то на "Да", то на "Нет"»). expect — ВЕРНЫЙ для удаления
  // ответ: [yes, no, yes]. Q2 — ОТРИЦАТЕЛЬНАЯ формулировка: чтобы
  // удалить, нужно ответить «Нет» — чередование требует ЧТЕНИЯ вопроса
  // (анти-случайный-клик); серия «Да, Да, Да» на Q2 терпит абор-т.
  const CONFIRM_QUESTIONS = [
    { text: 'Точно удалить сохранение?', expect: 'yes' },
    { text: 'Продолжить игру (сохранить прогресс)?', expect: 'no' },
    { text: 'В последний раз: удалить ВСЕ данные безвозвратно?',
      expect: 'yes' },
  ];

  /**
   * Чистая машина «трёх вопросов» (без DOM и сайд-эффектов —
   * тестируется в node, SW-N3). onConfirm/onAbort — опциональные fn
   * (undefined допустимо): onConfirm — РОВНО 1× за полный проход,
   * onAbort — 1× на абор-т. Машина ничего не знает о данных —
   * контракт main.js: при абор-те данные НЕ трогаются.
   * @param {(function()|undefined)} onConfirm полный проход (Да/Нет/Да)
   * @param {(function()|undefined)} onAbort   неверный ответ на любом шаге
   * @returns {{state: () => string, question: () => (string|null),
   *   start: () => string, answer: (a: string) => (string|null)}}
   *   state: 'idle' | 'pending' | 'aborted' | 'confirmed';
   *   question() — текст текущего вопроса (null, если
   *                state !== 'pending');
   *   start() — (пере)запуск с Q1 из ЛЮБОГО состояния (после абор-та
   *             цепочка начинается СНАЧАЛА), возвращает текст Q1;
   *   answer(a) — a: 'yes'|'no'. ВЕРНО → текст следующего вопроса
   *             (терминал — null, state='confirmed', onConfirm);
   *             НЕВЕРНО → state='aborted', onAbort, null. Вне процесса
   *             подтверждения (или a вне {'yes','no'}) — бросает Error.
   */
  function createConfirmFlow(onConfirm, onAbort) {
    let step = 0;
    let state = 'idle';

    function start() {
      step = 1;
      state = 'pending';
      return CONFIRM_QUESTIONS[0].text;
    }

    function question() {
      return state === 'pending'
        ? CONFIRM_QUESTIONS[step - 1].text
        : null;
    }

    function answer(a) {
      if (state !== 'pending') {
        throw new Error('answer() вне процесса подтверждения');
      }
      if (a !== 'yes' && a !== 'no') {
        throw new Error("answer(): ожидается 'yes' или 'no', получено "
          + a);
      }
      if (a === CONFIRM_QUESTIONS[step - 1].expect) {
        step++;
        if (step > CONFIRM_QUESTIONS.length) {
          state = 'confirmed';
          if (typeof onConfirm === 'function') onConfirm();
          return null;
        }
        return CONFIRM_QUESTIONS[step - 1].text;
      }
      state = 'aborted';
      if (typeof onAbort === 'function') onAbort();
      return null;
    }

    return {
      state: () => state,
      question,
      start,
      answer,
    };
  }

  /**
   * DOM-фабрика стартового окна (контракт §2.2).
   * opts = {
   *   document,           // ОБЯЗАТЕЛЕН: document-подобный с body и
   *                       // createElement (браузер — глобальный
   *                       // document; node/vm-тесты — фейк makeEl)
   *   onContinue,         // опц. fn — клик «Продолжить» (ДО hide)
   *   onRestartConfirmed, // опц. fn — полный проход Да/Нет/Да (ровно 1×
   *                       // за цепочку); окно остаётся на экране до
   *                       // перезагрузки страницы (reload — main.js)
   * };
   * Валидация (деградация 000053): нет opts/document/body/
   * createElement → null БЕЗ бросков и без console (main.js
   * обрабатывает null гардом). При создании СРАЗУ строит DOM в body и
   * ПОКАЗЫВАЕТ окно (игра под ним уже идёт — окно оверлей, не гейт:
   * пины e2e бута).
   * @returns {{root, dom, isActive: () => boolean, hide: () => void}|null}
   *   dom = { logo, main, continue, restart, confirm, question, yes, no }
   *   — прямые ссылки (querySelector НЕ используется); hide() —
   *   идемпотентна, root ОСТАЁТСЯ в body (стабильный DOM-контракт:
   *   e2e-доступ __game.startWindow.root, отсутствие DOM-churn).
   */
  function createStartWindow(opts) {
    const doc = opts && opts.document;
    if (!doc || !doc.body || typeof doc.createElement !== 'function') {
      return null;
    }

    const flow = createConfirmFlow(
      opts.onRestartConfirmed || null, null);

    // DOM-примитивы — ТОЛЬКО то, что есть во ВСЕХ vm-стабах:
    // createElement / appendChild / addEventListener('click') /
    // className (СТРОКИ, не classList — у makeEl его нет) /
    // textContent / style / src / alt. Дерево СТАТИЧНО; вид
    // переключается inline-display панелей (CSS-движка в vm нет —
    // e2e читает style.display).
    const root = doc.createElement('div');
    root.className = 'start-window';
    const logo = doc.createElement('img');
    logo.className = 'start-window-logo';
    logo.src = LOGO;
    logo.alt = 'Флогистон';
    const main = doc.createElement('div');
    main.className = 'start-window-main';
    const cont = doc.createElement('button');
    cont.className = 'start-window-btn start-window-btn--continue';
    cont.textContent = BUTTONS.continue;
    const rest = doc.createElement('button');
    rest.className = 'start-window-btn start-window-btn--restart';
    rest.textContent = BUTTONS.restart;
    // Панель подтверждения скрыта С СОЗДАНИЯ (inline; базовый
    // display:none в CSS — страховка для браузера).
    const confirm = doc.createElement('div');
    confirm.className = 'start-window-confirm';
    confirm.style.display = 'none';
    const question = doc.createElement('div');
    question.className = 'start-window-question';
    const ans = doc.createElement('div');
    ans.className = 'start-window-ans';
    // Кнопки подтверждения — НЕЙТРАЛЬНАЯ .start-window-btn (без
    // цветовой привязки к действию: на Q2 «правильное» действие даёт
    // «Нет» — цвет бы вёл в заблуждение; ТЗ-цвета — только у
    // «Продолжить»/«Начать заново»).
    const yes = doc.createElement('button');
    yes.className = 'start-window-btn start-window-ans--yes';
    yes.textContent = BUTTONS.yes;
    const no = doc.createElement('button');
    no.className = 'start-window-btn start-window-ans--no';
    no.textContent = BUTTONS.no;

    ans.appendChild(yes);
    ans.appendChild(no);
    confirm.appendChild(question);
    confirm.appendChild(ans);
    main.appendChild(cont);
    main.appendChild(rest);
    root.appendChild(logo);
    root.appendChild(main);
    root.appendChild(confirm);
    doc.body.appendChild(root);

    function hide() { root.style.display = 'none'; }
    function isActive() { return root.style.display !== 'none'; }

    cont.addEventListener('click', () => {
      if (typeof opts.onContinue === 'function') opts.onContinue();
      hide(); // окно само себя прячет (контракт §2.2); состояние игры
      // НЕ меняется — сейв уже восстановлен бут'ем («игра стартует
      // как сейчас»).
    });
    rest.addEventListener('click', () => {
      question.textContent = flow.start();
      confirm.style.display = 'flex';
    });
    function reply(a) {
      const next = flow.answer(a);
      if (next != null) {
        question.textContent = next;
        return;
      }
      // Терминал: confirmed — окно НЕ прячется (страница
      // перезагружается, reload делает main.js); aborted — возврат
      // на main-вид (логотип + 2 кнопки), данные не тронуты.
      if (flow.state() !== 'confirmed') confirm.style.display = 'none';
    }
    yes.addEventListener('click', () => reply('yes'));
    no.addEventListener('click', () => reply('no'));

    return {
      root,
      dom: {
        logo, main, continue: cont, restart: rest, confirm, question,
        yes, no,
      },
      isActive,
      hide,
    };
  }

  return {
    LOGO,
    BUTTONS,
    CONFIRM_QUESTIONS,
    createConfirmFlow,
    createStartWindow,
  };
});
