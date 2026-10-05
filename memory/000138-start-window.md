# 000138: src/start-window.js — стартовое окно (логотип + «Продолжить»/«Начать заново», тройное подтверждение)

Статус: РЕАЛИЗАЦИЯ завершена 2026-10-05; весь набор 1639/1639
зелёный (после правок по итогам ревью: гард reply() от stray-клика
+ пин SW-E5c).
Worktree .worktrees/task-000138, ветка task/000138, база master
0397799. ТЗ: tasks/pending/000138.md (короткое: окно с
логотипом assets/logo.svg при загрузке вместо «Загрузка карты»; кнопки
«Продолжить» (зелёный фон) / «Начать заново» (красный фон); по
«Начать заново» — удаление локальных данных после ТРОЙНОГО
переспрашивания, составленного так, что подтверждение требует то
«Да», то «Нет»).
Входы: /tmp/thegame-wf-000138/a1-domain.md, a2-arch.md, a3-tests.md
(расхождения между ними разрешены в §2/§7/§11 и зафиксированы здесь).
Базовый прогон до изменений: 1625/1625 зелёные.

## 1. Что добавлено / что НЕ трогается

ДОБАВЛЕНО (новые файлы/строки):
* `src/start-window.js` — НОВЫЙ UMD-модуль (единственный новый
  JS-файл), ~170 строк. Неймспейс в Game: `startWindow` (нижний
  регистр — конвенция серии 000127/000128/000129: locations /
  buildingActions / hud; коллизий нет — проверено grep:
  start-window/startWindow/startScreen нигде не упоминаются).
* `index.html` — CSS-блок `.start-window*` в КОНЦЕ `<style>` (после
  правила .squad-xp-fill, до `</style>`) + тег
  `<script src="src/start-window.js">` МЕЖДУ src/motion.js (L806) и
  src/main.js (L807) — т.е. СРАЗУ ПЕРЕД main.js, со своим
  комментарием (UMD-ловушка 000038).
* `src/main.js` — проводка ТОЛЬКО в зоне init/загрузка + кнопки +
  удаление данных (§7): флаг `resetPending` + guard в saveNow,
  блок создания окна после `window.addEventListener('beforeunload',
  saveNow)` (L677), поле `startWindow` в объекте `__game` (L2341+).
* `tests/start-window.test.js` — НОВЫЙ файл, 12 тестов (SW-N1–N3
  node-юнит + SW-E1–E8 vm-e2e), ~520 строк (свой harness-дубль по
  образцу bootSandbox из tests/loot-e2e.test.js + spy location.reload).
* `tests/index-order.test.js` — additive: 1 строка
  `'src/start-window.js'` в массиве теста «нужные модули подключены»
  (после строки 'src/motion.js') + СВОЙ test-блок SW-O1 в конце
  файла (pos-пин).
* `CHANGELOG.md` — на стадии мержа (задача меняет интерфейс для
  игрока): отдельный коммит «Задача 000138: CHANGELOG — …», дата
  2026-10-05, подраздел «### Интерфейс» под существующим
  «## 2026-10-05».

НЕ ТРОГАЕТСЯ (явная граница):
* `src/save.js` — не меняется: «удаление локальных данных» =
  существующий `G.clear(saveStorage)` (removeItem(SAVE_KEY));
  save.js уже используется в ветках migration_failed/corrupt (L569,
  573).
* `#hud` «Загрузка мира…» (index.html L667) и `src/hud.js` — текст
  и рендер НЕ меняются: окно — непрозрачная полноэкранная подложка
  z-index 40 — визуально ЗАМЕНЯЕТ сообщение о загрузке; начальный
  текст «Загрузка мира…» никем не закреплён (grep — только
  index.html L667 + комментарий main.js), пины не сдвигаются.
* `src/main.js` ЗА ПРЕДЕЛАМИ §7 — детерминизм боя, seed,
  restoreFromSave, frame-цикл, старт `loadMapPixels().then(...)`
  (L2534-2549) — БЕЗ ИЗМЕНЕНИЙ: игра автостартует ПОД окном как
  сейчас (обоснование — §4).
* `tests/svg.test.js` и `assets/` — НОВЫХ SVG-АССЕТОВ НЕТ:
  assets/logo.svg уже существует (900×900, viewBox 0 0 900 900,
  61 КБ) и уже в скопе обхода svg.test.js (категория logo: 1,
  зелёный); окно ссылается на него через `<img src>`.
* Существующие тесты — НИКАКИХ семантических правок: CHAIN в
  vm-песочницах читается matchAll'ем из index.html (новый тег
  подхватывается АВТОМАТИЧЕСКИ); DOM-стабы снисходительные
  (makeEl: style — обычный объект, listeners, appendChild,
  closest, querySelector); окна в каждом full-chain boot'е
  создаётся и не шумит (модуль чист, проводка без console.error
  при нормальной загрузке → errors.length === 0 сохраняется).
  craft-ui.test.js:363 и craft-mentor.test.js:456 ищут оверлеи
  через `h.body.children.find(el => className.includes(...))` —
  лишний child body (.start-window) их НЕ ломает; combat-ui.test.js
  (body.children[0]) НЕ грузит main.js → окна там нет.

## 2. Контракт модуля: Game.startWindow

UMD-обёртка ТОЧНО по образцу src/fullscreen.js / src/hud.js
(module.exports в node; в браузере `root.Game =
Object.assign({}, root.Game, factory())`). factory() БЕЗ аргументов,
БЕЗ init: в момент загрузки — НОЛЬ зависимостей (ни require, ни DOM,
ни чтения Game, ни console, ни Math.random — 000038/000053;
vm-цепочки подхватывают тег с errors.length === 0). Зависимостей у
модуля НЕТ (чистая UI-стейт-машина + колбэки) — ленивых ссылок
Game (rootRef/lazyGame) НЕ НУЖНО ВООБЩЕ: сброс данных делает
main.js.

Экспорт (один объект):

```
Game.startWindow = {
  LOGO: 'assets/logo.svg',
  BUTTONS: { continue: 'Продолжить', restart: 'Начать заново',
             yes: 'Да', no: 'Нет' },
  CONFIRM_QUESTIONS: [
    { text: 'Точно удалить сохранение?',                     expect: 'yes' },
    { text: 'Продолжить игру (сохранить прогресс)?',         expect: 'no'  },
    { text: 'В последний раз: удалить ВСЕ данные безвозвратно?',
                                                  expect: 'yes' },
  ],
  createConfirmFlow,
  createStartWindow,
};
```

### 2.1 createConfirmFlow(onConfirm, onAbort) — ЧИСТАЯ машина

Без DOM и сайд-эффектов (тестится в node, SW-N3). onConfirm /
onAbort — опциональные fn (undefined допустимо). Возвращает:

```
{
  state: () => 'idle' | 'pending' | 'aborted' | 'confirmed',
  question: () => string | null,   // текст текущего вопроса (null,
                                   // если state !== 'pending')
  start: () => string,             // (пере)запуск с Q1: step=1,
                                   // state='pending', возвращает
                                   // Q1.text. Допустим из ЛЮБОГО
                                   // состояния (после аборта —
                                   // цепочка начинается СНАЧАЛА).
  answer: (a) => string | null,    // a: 'yes' | 'no'
}
```

Семантика answer:
* state !== 'pending' → бросает Error («answer() вне процесса
  подтверждения») — фиксируется SW-N3.
* a не в {'yes','no'} → бросает Error.
* ВЕРНО (a === CONFIRM_QUESTIONS[step-1].expect) → step++;
  step > 3 → state='confirmed', onConfirm() РОВНО 1 раз (за
  цепочку), вернуть null.
* НЕВЕРНО → state='aborted', onAbort() (1 раз, если задан),
  вернуть null. Данные НЕ тронуты (машина ничего не знает о
  данных — это контракт main.js).

Почему отдельная чистая машина: ядро «трёх вопросов» — вся логика
задачи — покрывается node-тестами без vm/DOM (быстро, точно,
детерминированно); DOM-фабрика — тонкая обёртка над ней.

### 2.2 createStartWindow(opts) — DOM-фабрика оверлея

```
opts = {
  document,           // ОБЯЗАТЕЛЕН: document-подобный с body и
                      // createElement (браузер — глобальный
                      // document; node/vm-тесты — фейк makeEl)
  onContinue,         // опц. fn — клик «Продолжить» (ДО hide)
  onRestartConfirmed, // опц. fn — полный проход Да/Нет/Да (ровно 1×
                      // за цепочку); окно остаётся на экране до
                      // перезагрузки страницы (reload делает
                      // main.js)
}
```

* Валидация: !opts || !opts.document || !document.body ||
  typeof document.createElement !== 'function' → вернуть null
  (БЕЗ бросков и без console — деградация 000053; main.js
  обрабатывает null гардом).
* При создании СРАЗУ строит DOM в body и ПОКАЗЫВАЕТ окно
  (окно — синхронно при загрузке; игра под ним уже идёт).
* Возвращает `{ root, dom, isActive(), hide() }`:
  * `dom = { logo, main, continue, restart, confirm, question,
    yes, no }` — прямые ссылки (querySelector НЕ используется).
  * `isActive()` → `root.style.display !== 'none'` (начинается
    true).
  * `hide()` → `root.style.display = 'none'`; идемпотентна
    (повторный вызов — без броска); root ОСТАЁТСЯ в body
    (решение §4.3).

Клики (addEventListener('click') на каждом button):
* «Продолжить» → `onContinue?.()`; `hide()`. Состояние игры НЕ
  меняется (сейв уже восстановлен бут'ом — «игра стартует как
  сейчас»).
* «Начать заново» → `flow.start()`; `question.textContent = Q1`;
  `confirm.style.display = 'flex'` (панель подтверждения).
* «Да»/«Нет» → `next = flow.answer('yes'|'no')`; next != null →
  `question.textContent = next`; next == null → терминал:
  confirmed → `onRestartConfirmed()` (окно НЕ прячется — страница
  перезагружается); aborted → `confirm.style.display = 'none'`
  (возврат на main-вид: логотип + 2 кнопки).

DOM-контракт (пины e2e; дерево СТАТИЧНО, вид переключается
inline-display панелей + классом-состоянием НЕ используется):

```
div.start-window                       (в document.body)
  ├─ img.start-window-logo             src="assets/logo.svg"
  │                                    alt="Флогистон"
  ├─ div.start-window-main
  │    ├─ button.start-window-btn
  │    │  .start-window-btn--continue  «Продолжить»
  │    └─ button.start-window-btn
  │       .start-window-btn--restart   «Начать заново»
  └─ div.start-window-confirm          (style.display='none'
                                         inline с создания)
       ├─ div.start-window-question    textContent — текст
       │                                текущего вопроса
       └─ div.start-window-ans
            ├─ button.start-window-btn
            │  .start-window-ans--yes  «Да»
            └─ button.start-window-btn
               .start-window-ans--no   «Нет»
```

Примитивы DOM — ТОЛЬКО то, что есть во ВСЕХ vm-стабах:
createElement / body.appendChild / addEventListener('click') /
className (СТРОКИ, не classList — у makeEl classList нет,
прецедент ui.js:1457) / textContent / style / src / alt. Без
fetch, без querySelector, без classList — file:// (двойной клик)
и vm-песочницы равнозначны.

## 3. Формулировки трёх вопросов (последовательность кнопок)

ФИКСИРОВАННАЯ схема — **Да / Нет / Да** (защита от случайного
удаления по ТЗ: серию «Да, Да, Да» подтверждением не является —
на Q2 неверный ответ):

| шаг | текст вопроса (точно, пины SW-N2/SW-E*) | верная кнопка |
|---|---|---|
| Q1 | «Точно удалить сохранение?» | «Да» |
| Q2 | «Продолжить игру (сохранить прогресс)?» | «Нет» |
| Q3 | «В последний раз: удалить ВСЕ данные безвозвратно?» | «Да» |

* Q2 — ОТРИЦАТЕЛЬНАЯ формулировка: «продолжить игру (сохранить
  прогресс)?» → для удаления нужно ответить «Нет». Именно чередование
  требует ЧТЕНИЯ вопроса (анти-случайный-клик по ТЗ).
* Кнопки подтверждения — НЕЙТРАЛЬНАЯ `.start-window-btn` (без
  цветовой привязки к действию: на Q2 «правильное» действие даёт
  «Нет» — цвет бы вёл в заблуждение; цветовой код остаётся только
  у «Продолжить» (зелёный) / «Начать заново» (красный) по ТЗ).
* Любой неверный ответ на любом шаге → АБОРТ: возврат на main-вид
  (логотип + 2 кнопки), данные НЕ тронуты, onRestartConfirmed НЕ
  вызывается; повторный «Начать заново» — цепочка заново с Q1.
* Тексты зафиксированы в экспорт-константе CONFIRM_QUESTIONS
  (один источник) — юнит-пин SW-N2 по точным строкам, e2e-пины по
  textContent.

## 4. Как показывается/скрывается окно; где было сообщение о загрузке

* Сообщение о загрузке: СТАТИЧЕСКИЙ `<div id="hud">Загрузка мира…
  </div>` (index.html L667; точной фразы «Загрузка карты» в коде
  НЕТ — дельта по формулировке ТЗ, зафиксирована). Каждый кадр
  renderHud() (src/hud.js) перезаписывает #hud. Окно НЕ меняет его
  текст — оно полноэкранное НЕПРОЗРАЧНОЕ (background #101418)
  z-index 40 и визуально его ЗАМЕНЯЕТ.
* Окно показывается СИНХРОННО при загрузке main.js — сразу после
  блока сейва (L677), ДО асинхронного `loadMapPixels().then(...)`
  (L2534): т.е. пользователь видит окно МИГНОВЕННО, а карта
  грузится ПОД ним (Image map.png → onerror → generateSeedPixels,
  микротаск).
* КЛЮЧЕВОЕ АРХИТЕКТУРНОЕ РЕШЕНИЕ — окно НЕ БЛОКИРУЕТ СТАРТ ИГРЫ:
  все 14 full-chain vm-e2e тестов (main-visuals, save, save-restore,
  camp-map-e2e, city-screen, city-interact, loot-e2e, hud.js HU5,
  squad-panel FULL_CHAIN, craft-mentor, craft-ui, building-actions,
  companions-cycle, locations LOC-12) бутят цепочку и ОЖИДАЮТ, что
  после drain() мир создан (state.map truthy), сейв восстановлен,
  rAF зарегистрирован. Гейт (блокировка старта до «Продолжить»)
  сломал бы весь набор (инвариант «весь набор зелёный»). Оверлей —
  единственная форма, удовлетворяющая и ТЗ («при загрузке …
  стартовое окно»), и инварианту.
* Скрытие: «Продолжить» → hide() (root.style.display='none').
  «Начать заново» → полный проход → reload страницы (окно не
  прячется — страница перезагружается; в vm reload — spy, окно
  остаётся).
* Почему hide = display:none, а НЕ remove() из body: стабильный
  DOM-контракт (root живёт в body всегда → e2e-доступ
  __game.startWindow.root), идемпотентность без re-append,
  отсутствие DOM-churn; существующие тесты ищут оверлеи по
  className через find(), лишний/скрытый child не влияет.
* Почему НЕТ гашения игровых клавиш (стрелки/WASD/ЦФЫВ/E/I/C)
  capture-слушателем, пока окно открыто (вариант a3-tests.md): ТЗ
  МОЛЧИТ, инвариант «не больше и не меньше, чем просит ТЗ»;
  pointer уже закрыт непрозрачным оверлеем z-40 (D-pad/.fs-btn/
  canvas накрываются); оставлено как КАНДИДАТ БУДУЩЕЙ МЕЛКОЙ
  ЗАДАЧИ (удержанная стрелка может сдвинуть Флогистона в первые
  кадры — §10).
* Z-ЛЕСТНИЦА: новая ступень 40 — ВЕРХНЯЯ (было 10/11/15/20/30,
  максимум — #touch-controls 30; комментарий лестницы в
  index.html L184-191 НЕ трогается — ступень задокументирована в
  СВОЁМ комментарии CSS-блока + здесь).

## 5. «Начать заново»: что именно удаляется; поведение после удаления

* ЕДИНСТВЕННЫЕ локальные данные игры — localStorage, ключ
  `SAVE_KEY = 'phlogiston.save'` (src/save.js; других
  localStorage-ключей в проекте НЕТ — проверено grep). Структура —
  оболочка { version: 1, savedAt, data: {...} } (день, шаги,
  позиция, hero+quests, npcStocks, defeatedAt, building*, teleports,
  explored, companions, efir, dead_mercs, cities, campStocks,
  efir_met — collectSaveData, main.js L578+).
* УДАЛЯЕТСЯ ИМЕННО КЛЮЧ: `G.clear(saveStorage)` =
  `storage.removeItem(SAVE_KEY)` (save.js L188-195; true/false).
  Новых save-кода нет. Guard: `if (saveStorage && G.clear)` —
  в средах без localStorage (file://-приватный режим) — no-op,
  данные и так отсутствуют; reload всё равно выполняется.
* ПОСЛЕДОВАТЕЛЬНОСТЬ (main.js, onRestartConfirmed, СИНХРОННО):
  1. `resetPending = true;` (флаг §6 — ДО всего, иначе beforeunload
     на reload перезапишет старый сейв и «сброс» откатится);
  2. `if (saveStorage && G.clear) G.clear(saveStorage);`
  3. `const loc = window.location; if (loc &&
     typeof loc.reload === 'function') loc.reload();` — полный
     reload (в vm — spy; в песочницах БЕЗ reload в location
     (location: {search:''}) — no-op-гард, краха нет).
* Почему reload, а НЕ ин-памяти-сброс: состояние main.js — десятки
  топ-уровневых переменных (clock, hero, roster, questBook,
  defeatedAt, npcStocks, cityStates, campStocks, teleports, buffs,
  building*, explored, efir, efirMet, deadMercs, map, tileCache,
  mover, cam…). Ин-памяти-сброс = крупная непокрытая поверхность в
  горячем main.js (конфликт с 000135). reload = 1 строка,
  детерминированный полный старт с нуля; «повторная загрузка — окно
  снова» (ТЗ) выполняется АВТОМАТИЧЕСКИ (окно показывается при
  КАЖДОЙ загрузке).
* Поведение после: свежий boot с пустым хранилищем → loadedSave
  null → restoreFromSave() no-op → день 1, спавн, окно снова
  (фиксатор SW-E6). Детерминизм не затронут: ноль новых RNG, окно —
  чистый UI, старт-поток main.js без изменений.

## 6. КЛЮЧЕВОЙ БАГ (пойман на анализе): re-сейв через beforeunload

`window.addEventListener('beforeunload', saveNow)` (main.js L677):
location.reload() fires beforeunload → saveNow() → G.save()
перезаписывает текущее in-memory состояние (ВОССТАНОВЛЕННЫЙ старый
сейв) обратно в localStorage СРАЗУ ПОСЛЕ clear → «сброс» ТИХО НЕ
СОСТОИТСЯ в реальном браузере. Ловит фиксатор SW-E5b (dispatch
beforeunload после полного подтверждения → хранилище ОСТАЛОСЬ
ПУСТЫМ).

Решение — флаг-подавление (НЕ removeEventListener):

```
  let resetPending = false;   // рядом с let saveWarned (L667)
  function saveNow() {
    if (resetPending) return; // 000138: не перезаписывать после сброса
    ... (тело без изменений)
  }
```

* Флаг живёт до reload; семантически корректен НАВСЕГДА в сессии:
  после подтверждённого сброса перезапись СТАРОГО состояния
  неправильна в любой момент (saveNow вызывается и на каждом
  мировом шаге, и на beforeunload).
* Почему флаг, а не removeEventListener('beforeunload', saveNow):
  существующие vm-harness'ы уже ловят window-слушатели
  (winListeners) и умеют dispatch'ить beforeunload
  (save-restore.test.js:246) — новый тест не требует новых
  примитивов стаба; флаг атомарнее (кроет ЛЮБОЙ будущий путь
  saveNow, не только beforeunload).
* Порядок операций (флаг → clear → reload) синхронный — между
  шагами нет микротасков, окна для saveNow нет.

## 7. Проводка в src/main.js (конкретные правки, 3 точки)

* Точка 1 (L667-677, блок сейва): `let resetPending = false;`
  рядом с `let saveWarned = false;` + первая строка saveNow
  `if (resetPending) return;` (комментарий — про beforeunload-
  re-сейв, §6).
* Точка 2 (СРАЗУ ПОСЛЕ `window.addEventListener('beforeunload',
  saveNow);` — L677), свой раздел:

```
  // --- Стартовое окно (задача 000138) ---
  // Логотип assets/logo.svg + «Продолжить» (зелёный) /
  // «Начать заново» (красный). Игра ПОД окном стартует как
  // сейчас (окно — оверлей, не гейт: пины e2e бута). Ядро —
  // src/start-window.js (Game.startWindow, чистая стейт-машина,
  // тестируется в node); здесь — DOM-привязка, сброс данных
  // (G.clear + reload) и подавление re-сейва (resetPending).
  // Модуль не загружен (регрессия порядка — UMD-ловушка 000038):
  // окна нет, игра стартует как раньше (деградация, не крах).
  let startWindow = null;
  if (G.startWindow &&
      typeof G.startWindow.createStartWindow === 'function') {
    startWindow = G.startWindow.createStartWindow({
      document,
      onRestartConfirmed: () => {
        // 000138: флаг ДО clear+reload — иначе beforeunload на
        // reload перезапишет старый сейв (saveNow выше).
        resetPending = true;
        if (saveStorage && G.clear) G.clear(saveStorage);
        const loc = window.location;
        if (loc && typeof loc.reload === 'function') loc.reload();
      },
    });
  } else {
    console.error('main.js: start-window.js не загружен (обязан ' +
      'стоять ДО src/main.js — UMD-ловушка 000038, задача ' +
      '000138) — нет стартового окна');
  }
```

  * onContinue НЕ передаётся: модуль сам себя прячет (hide) после
    клика «Продолжить» (контракт §2.2); хук остаётся в API на
    будущее.
  * createStartWindow вернул null (нет document.body — невозможно
    в цепочке index.html, но контракт §2.2) → startWindow ===
    null → поля __game null, игры это не касается.
* Точка 3 (объект `globalThis.__game`, L2341+): обычное поле
  (НЕ в getter state, РЯДОМ с actions):

```
    // Стартовое окно (000138): объект src/start-window.js
    // (createStartWindow) — { root, dom, isActive, hide } — или
    // null (модуль не загружен). Точка e2e/смоук-тестов.
    startWindow,
```

* Ленивые ссылки / guards: `G.startWindow` — из снапшота
  `const G = globalThis.Game` (L13, UMD-ловушка 000038) — поэтому
  тег ОБЯЗАН быть ДО main.js (пин SW-O1). `saveStorage`,
  `saveNow`, `resetPending` — IIFE-скоуп, в точке 2 доступны.
  `G.clear` — guard (save.js не загрузился — краха нет).
  `window.location.reload` — guard typeof (vm-песочницы без
  reload). Деградация 000053: console.error — ТОЛЬКО при
  отсутствии модуля → при нормальной загрузке full-chain тесты
  сохраняют errors.length === 0.
* ОБЛАСТЬ: L545-690 (секция сейва) + L2341 (поле __game). НЕ
  пересекается с 000135 (maybeStartCombat/зоны ~L1307+/L1595-1650)
  и с 000132 (onEnd-окна) — ребейз чистый.

## 8. index.html (2 правки, свои строки)

1. CSS-блок в КОНЦЕ `<style>` (после .squad-xp-fill L657-662, до
   `</style>` L663) — ТОЛЬКО новые классы `.start-window*`
   (паттерн 000126 .craft-*: чужие правила/комментарии не
   трогаются). Суть:
   * `.start-window` — position:fixed; inset:0; **z-index:40**
     (новая верхняя ступень — выше #touch-controls 30); flex
     column center; gap 28px; padding 16px; background:#101418
     (непрозрачная подложка — заменяет «Загрузка мира…»);
     color:#e8dcc0; font:16px/1.5 ui-monospace,monospace;
     text-align:center.
   * `.start-window-logo` — width:min(42vh,42vw,300px);
     height:auto; display:block.
   * `.start-window-main` / `.start-window-ans` — flex, gap 24px
     (main: wrap + justify-center).
   * `.start-window-confirm` — display:none (базовое скрытие;
     показ — inline display:flex из модуля, §2.2); flex column
     center; gap 18px; max-width 560px.
   * `.start-window-question` — font-size:18px; font-weight:700.
   * `.start-window-btn` — база: min-width:220px; padding
     12px 28px; border:1px solid #6b6248; border-radius:10px;
     background:#2c3040; color:#e8dcc0; font:700 16px
     ui-monospace,monospace; cursor:pointer.
   * `.start-window-btn--continue` — **background:#6fdc6f;
     color:#101418** (зелёный — ТЗ; канон 000038, уже в
     index.html L318 / memory/000038); hover #8bf58b.
   * `.start-window-btn--restart` — **background:#d9483b;
     color:#fff** (красный — ТЗ; канон 000038: ROLE_COLORS/
     dungeon-ui.js); hover #e65f52.
   * Пин SW-E1 читает hex'ы из index.html и асертит доминантные
     каналы: у --continue g > r, у --restart r > g (фиксатор ТЗ
     «на зелёном/красном фоне» без зависимости от CSS-движка).
2. Скрипт-тег между `src/motion.js` (L806) и `src/main.js`
   (L807) + комментарий (UMD-ловушка 000038: main.js снимает
   Game один раз при загрузке — Game.startWindow обязан быть в
   снапшоте; чистая загрузка, DOM при загрузке не трогается).
   Слот = утилиты/хвост ДО main.js; 000137 добавляет свой тег
   (44_perform) в слоте спец-модулей МЕЖДУ building-actions.js и
   hud.js (~L755) — строки не соседствуют → чистый ребейз.

## 9. Карта тестов (13 новых; red-ожидание 1638 тестов / 1624 pass
/ 14 fail — падают ТОЛЬКО новые + 1 существующий массивный тест)

`tests/start-window.test.js` (НОВЫЙ; harness — дубль bootSandbox
loot-e2e/camp-map-e2e: makeEl/makeGl/makeContext2d, CHAIN из
index.html, Image-стаб (map.png → onerror), makeStorage(seed),
winListeners, drain ×3, performance NOW=1000; ЕДИНСТВЕННЫЕ
отличия: `location: { search: '', reload: <spy> }` и helper
fireBeforeUnload() по образцу save-restore.test.js:246):

* SW-N1 — UMD node: require('../src/start-window.js') — API
  (LOGO === 'assets/logo.svg'; BUTTONS точный объект;
  CONFIRM_QUESTIONS — массив; createConfirmFlow/createStartWindow
  — function). [red: ENOENT]
* SW-N2 — схема: CONFIRM_QUESTIONS.length === 3; expect ===
  ['yes','no','yes']; точные тексты Q1/Q2/Q3 (§3). [red: ENOENT]
* SW-N3 — createConfirmFlow (чисто, без DOM): start() → pending,
  Q1; q1 «Нет» → aborted, onConfirm 0×; [Да,Да] → aborted (Q2
  требует «Нет»); [Да,Нет,Нет] → aborted; [Да,Нет,Да] →
  confirmed, onConfirm РОВНО 1×; answer() после терминала —
  бросает; start() после aborted — цепочка с Q1; полный второй
  проход → onConfirm 2-й раз (2 прохода = 2 вызова). [red: ENOENT]
* SW-E1 — boot (пустое хранилище) → в body div.start-window:
  dom.logo.src === 'assets/logo.svg'; «Продолжить»
  (.start-window-btn--continue) и «Начать заново»
  (.start-window-btn--restart); __game.startWindow.isActive()
  === true; errors.length === 0 (цепочка с новым тегом чистая);
  index.html содержит оба color-правила с доминантными каналами
  (g>r / r>g). [red: __game.startWindow undefined]
* SW-E2 — boot с досеянным сейвом (v1, day 5, позиция) → клик
  «Продолжить» (dom.continue.listeners.click[0]) → isActive()
  false, root.style.display === 'none'; игра как сейчас:
  state.map есть, state.save.version === 1, state.day === 5
  (restoreFromSave сработал при бут'е — окно НЕ блокировало);
  игрок ходит: keydown ArrowRight + последний rAF-колбэк →
  state.player.x +1. [red: __game.startWindow undefined]
* SW-E3 — seed-сейв → «Начать заново» → confirm-вид:
  dom.question.textContent === Q1, confirm виден
  (style.display === 'flex'), кнопки «Да»/«Нет» → клик «Нет»
  (неверно для Q1) → main-вид (confirm display 'none'), хранилище
  БИТО-В-БИТО НЕ ИЗМЕНИЛОСЬ (строка сейва === seeded), reload
  spy 0×. [red: __game.startWindow undefined]
* SW-E4 — seed → «Начать заново» → «Да» → Q2 → «Да» (неверно) →
  aborted: сейв цел, reload 0×; повтор: → «Да» → «Нет» → Q3 →
  «Нет» (неверно) → aborted: сейв цел, reload 0×. [red: как E3]
* SW-E5 — seed → «Да» → «Нет» → «Да» → хранилище ПУСТО
  (storage.getItem(SAVE_KEY) === null, G.clear), reload spy
  РОВНО 1×. [red: как E3]
* SW-E5b — ЛОВИТЕЛЬ КЛЮЧЕВОГО БАГА (§6): после сценария E5
  fireBeforeUnload() (dispatch winListeners['beforeunload']) →
  хранилище ОСТАЛОСЬ ПУСТЫМ (resetPending подавил saveNow).
  [red: __game.startWindow undefined; после green — ловит
  отсутствие флага]
* SW-E6 — «повторная загрузка»: НОВЫЙ независимый bootSandbox
  (свежая цепочка, ПУСТОЕ хранилище) → окно снова активно, та же
  структура (логотип + 2 кнопки), state.save === null,
  state.day === 1. [red: __game.startWindow undefined]
* SW-E7 — детерминизм/сейв НЕ сломаны: boot с досеянным сейвом,
  КЛИКОВ НЕТ → errors === 0, state.map есть, state.day === день
  сейва, state.player === позиция сейва, state.save.version === 1.
  [red: __game.startWindow undefined — бут-ассерты сейчас
  зелёные, красный именно по отсутствию окна]
* SW-E8 — ПРОВАЛЕННЫЙ ПОРЯДОК (деградация 000053): цепочка =
  CHAIN МИНУС 'start-window.js' (тег удалён) → boot не падает:
  errors содержит РОВНО наш console.error main.js («start-window.js
  не загружен…» — includes-проверка), __game существует и
  __game.startWindow === null, state.map есть (игра стартует
  без окна). [red: в текущем main.js гарда нет → errors пусто и
  __game.startWindow undefined — падает осмысленно]

`tests/index-order.test.js` (additive, свои строки — чистый
ребейз с 000137):
* строка `'src/start-window.js',` в массиве теста «нужные модули
  подключены» (после 'src/motion.js', до 'src/main.js').
  [red: pos === -1 → существующий тест падает]
* SW-O1 — СВОЙ test-блок в КОНЦЕ файла:
  pos('src/start-window.js') !== -1 &&
  pos('src/start-window.js') < pos('src/main.js')
  («UMD-ловушка 000038: main.js снимает Game один раз», образец —
  пин motion.js L251). [red: тега нет]

ОЖИДАНИЕ RED-ПРОГОНА: `npm test` → 1638 тестов, 1624 pass, 14
fail; падают ТОЛЬКО: 12 тестов tests/start-window.test.js + 2 в
tests/index-order.test.js (массивный + SW-O1). Все остальные
файлы — зелёные (сходство с базовым 1625/1625).

## 10. Что важно будущим задачам

* Окно — оверлей z-40, верхняя ступень лестницы (10/11/15/20/30 →
  40). Любая будущая МОДАЛЬНАЯ вещь должна либо встать в z-41+,
  либо использовать то же окно; лестница задокументирована в
  комментарии .start-window CSS-блока (комментарий 184-191
  НЕ обновлялся — своя ступень, свой комментарий).
* Гашение игровых клавиш, пока окно открыто (удержанная стрелка
  сдвигает Флогистона в первые кадры) — НЕ сделано осознанно (ТЗ
  молчит, «не больше и не меньше»); кандидат на будущую мелкую
  задачу (capture-keydown на window + пропуск Enter/Space/Tab для
  нативной активации кнопок).
* `resetPending` — сессионный флаг main.js: после подтверждённого
  «Начать заново» saveNow молчит до reload. Если когда-нибудь
  появится ЛЕГКИЙ ин-памяти-сброс без reload — флаг надо снимать
  там (сейчас reload всегда).
* `__game.startWindow` — точка e2e/смоук: { root, dom:
  {logo,main,continue,restart,confirm,question,yes,no},
  isActive, hide } | null. Будущие e2e (напр. «окно закрывается
  по X»/hotkey) ходят через него.
* Тексты кнопок/вопросов — в Game.startWindow.BUTTONS /
  CONFIRM_QUESTIONS (один источник): локализация/редакция —
  правка констант + пины SW-N2.
* 000135 (maybeStartCombat/зоны) и 000137 (44_perform) — параллельные
  ветки: при мерже этой задачи проверить, что их правки main.js /
  index.html не задели L545-690/L677/L2341 (000135) и слот
  спец-модулей/массив index-order (000137) — наши правки в других
  ханках.

## 11. Подводные камни

1. beforeunload → saveNow re-сейв (§6) — ГЛАВНЫЙ: без resetPending
   «Начать заново» в реальном браузере откатывается тихо. Пин
   SW-E5b.
2. UMD-ловушка 000038: тег start-window.js ПОСЛЕ main.js →
   G.startWindow в снапшоте не будет → окно молча отсутствует
   (гард console.error). Пины SW-O1 + SW-E8.
3. main.js снимает `const G = globalThis.Game` ОДИН раз (L13) —
   модуль обязан давать API при ЗАГРУЗКЕ (браузерная ветка UMD),
   factory() без аргументов.
4. errors.length === 0 во ВСЕХ 14 full-chain vm-тестах: проводка
   main.js не должна писать console.error при нормальной загрузке
   (гард — только при отсутствии модуля); show-путь (build DOM) —
   дефенсивный (createStartWindow null-safe, клики — простые
   обработчики).
5. DOM-стабы vm-песочниц: classList НЕТ (только className-строки),
   style — обычный объект (поэтому видимость — inline
   display, CSS не применяется — e2e проверяет style.display, а не
   computed style), window.location БЕЗ reload в чужих
   песочницах (reload — только в нашей, spy; на чужие тесты
   restart-путь не влияет: он не вызывается при загрузке).
6. textContent-сеттер makeEl СБРАСЫВАЕТ children (как в DOM) —
   вопрос в .start-window-question ставится textContent'ом на
   пустой div (детей там нет) — безопасно.
7. Зависимость от body: createStartWindow требует document.body —
   в index.html body существует ДО скриптов (теги в <body>,
   после canvases/hud) — ок; в node-тестах — фейк body (makeEl).
8. 000137 тоже расширяет массив «нужные модули» и дописывает
   index-order-пины — свои строки (строка в массиве — рядом с
   motion.js/main.js, их строка — в группе building-effect-*),
   при конфликте мержа — ревьюить блоками.
9. Двойной клик / file://: логотип — <img> (грузится),
   localStorage может быть недоступен (guard saveStorage — no-op),
   fetch/mодули НЕ используются.
10. Детерминизм: ноль новых RNG; SW-E7 + существующие goldens
    (main-visuals, camp-map-e2e CP-9) — двойная страховка.

## 12. Коммиты (план ветки task/000138)

1. «Задача 000138: красные тесты стартового окна» —
   tests/start-window.test.js (новый), tests/index-order.test.js
   (additive), memory/000138-start-window.md (этот файл —
   коммитится на красной стадии вместе с тестами).
   Ожидание: 1638/1624/14, падают только новые.
2. «Задача 000138: стартовое окно — логотип и
   Продолжить/Начать заново» — src/start-window.js (новый),
   src/main.js, index.html. Ожидание: 1638/1638 зелёные.
3. (стадия мержа) «Задача 000138: CHANGELOG — стартовое окно» —
   CHANGELOG.md, раздел «Интерфейс», дата 2026-10-05.
4. (стадия мержа) «Задача 000138: отчёт, память, перенос задачи
   в done» — tasks/pending/000138.md → tasks/done/000138.md
   (git mv), tasks/result/000138.md.
(Каждый: 1-я строка «Задача 000138: …», последний параграф —
Co-Authored-By: Claude Code <noreply@anthropic.com>.)

## 13. Расхождения ТЗ с кодом (deltas)

1. ТЗ: «сообщение "Загрузка карты"» → факт: «Загрузка мира…»
   (index.html L667). Формулировка; оверлей замещает оба.
2. ТЗ не задаёт точные тексты/схему вопросов → зафиксировано
   Да/Нет/Да, тексты — §3 (константа CONFIRM_QUESTIONS).
3. ТЗ не задаёт механизм «с нуля» → G.clear + location.reload()
   (совпадает с подсказкой «повторная загрузка — окно снова»).
4. Файл задачи минимальный (без разделов «Тесты/Ограничения/
   Файлы») — требования из 8 строк ТЗ + инвариантов workflow.
5. ТЗ молчит об автостарте под окном — следствие инварианта
   «весь набор тестов зелёный»: гейт ломает 14 full-chain e2e →
   оверлей (§4).
