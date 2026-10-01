# 000124: Экран боя — контракт раскладки (вьюпорт, 4 колонки, SVG-иконки)

Статус: ПРОЕКТИРОВАНИЕ завершено (станция «Проектирование», 2026-10-01).
Файл закоммитится на красной стадии вместе с красными тестами; ветка
task/000124, worktree .worktrees/task-000124, база master 1885163.
Анализы: /tmp/thegame-wf-000124/{a1-domain.md, architecture.md, a3-tests.md}.

## Что добавлено / перенесено

Переносов нет (граница «ядро/UI» 000030 сохраняется: combat.js и
combat-keys.js НЕ трогаются). Добавлено:
* скоуп-класс `.combat-overlay--combat` на боевом оверлее
  (combat-ui.js build(), `overlay.className =
  'combat-overlay combat-overlay--combat'`) — ВЕСЬ новый layout боя живёт
  только в этом скоупе;
* CSS-блок боевого layout + portrait-media-query в index.html (после
  правила `.combat-banner`, перед комментарием «Подземелье»);
* базовое правило `.combat-actions` (класс боевой, единственный
  потребитель — grep по src/) — 4 колонки и иконные кнопки;
* `assets/ui/` — 8 SVG-иконок действий (каталог общий с 000123);
* нормализация клика по canvas по фактическому размеру (combat-ui.js);
* тесты: tests/combat-layout.test.js (новый) + дополнения
  tests/combat-ui.test.js + строка `'ui': 8` в tests/svg.test.js.

## КРАЙНЕ ВАЖНО: общие классы и скоуп (контракт для 000125)

Базовые классы боевого экрана ПЕРЕИСПОЛЬЗУЮТ чужие оверлеи:
* `.combat-overlay` (fixed inset 0, flex center, gap 16, z-20, фон,
  font 13px #e8dcc0) — бой + NPC (`npc-overlay`, ui.js:1074) + подземелье
  (`dungeon-overlay`, dungeon-ui.js:217) + ПОСТРОЙКА (building-ui.js:186 —
  ГОЛЫЙ `combat-overlay`, без модификатора!);
* `.combat-side` (320px, content-box) — бой, NPC, постройка, подземелье
  (`.dungeon-overlay .combat-side` — 270px absolute top/right 16px);
* `.combat-log` (170px, overflow-y auto) — бой и подземелье
  (dungeon-ui.js:233, плавающая панель).

ПРАВИЛО: геометрия боя — ТОЛЬКО в скоупе `.combat-overlay--combat`;
базовые правила `.combat-overlay` / `.combat-side` / `.combat-log` /
`.combat-state` НЕ ТРОГАТЬ. Единственное исключение — `.combat-actions`
(только бой) правится в базе. Запрело — статические тесты-стражи в
tests/combat-layout.test.js: база `.combat-side` = 320px, база
`.combat-log` = 170px, правила `.dungeon-overlay .combat-side` и
`.npc-overlay .combat-side` на месте. Это гарантирует критерий 000125
«layout диалога не ломается при ЛЮБОМ порядке мержей 000124/000125»:
диалог NPC (декэплинг в 000125 на свой класс `.npc-panel`) и подземелье
не затрагиваются при любом порядке. Никто в JS не querySelector'ит
`'combat-overlay'` (проверено) — смена className безопасна.

## Layout-контракт (классы и размеры)

Состав боевого оверлея (build()): `.combat-box` (canvas 336×336 +
`.combat-banner` absolute) и `.combat-side` (flex-колонка:
`.combat-turnorder` → `.combat-hpbar` → `.combat-state` →
`.combat-actions` → `.combat-log`).

### Десктоп / альбомный (flex row, по умолчанию)
```css
.combat-overlay--combat { padding: 16px; align-items: stretch; }
.combat-overlay--combat .combat-box {
  flex: 0 1 auto; min-width: 0; display: flex;
  align-items: center; justify-content: center; }
.combat-overlay--combat .combat-box canvas {
  box-sizing: border-box; display: block;
  aspect-ratio: 1 / 1; height: auto;
  width: min(100vh - 32px, 100vw - 304px);  /* 32 = padding 16×2;
      304 = 32 (padding) + 16 (gap) + 256 (панель, border-box) */
  max-width: 100%; image-rendering: pixelated; }
.combat-overlay--combat .combat-side {
  box-sizing: border-box; flex: 0 0 auto; width: 256px;
  display: flex; flex-direction: column; min-height: 0; }
.combat-overlay--combat .combat-log {
  flex: 1 1 auto; min-height: 0; height: auto; }
```
* 256 = 4 кнопки × ~52px + gap 3×6 + padding 2×14 + border 2
  (кнопка 52px — в диапазоне ТЗ 44…56 px).
* Формула `min(высота − 32, ширина − 304)` гарантированно вписывает
  layout: полная ширина = W + 304 ≤ 100vw, полная высота = W + 32 ≤ 100vh
  (W — сторона квадрата). Приоритет ТЗ «вписалось > полная высота»:
  min() сам берёт меньший бюджет. Поле = весь доступный размер.
  Примеры: 1920×1080 → 1048; 1024×768 → 720 (впритык 1024);
  844×390 (альбомный мобильный) → 358 (впритык 390).
* box-sizing: border-box на canvas и side — константы 32/304 точны
  (border canvas 2px и border/padding панели не «вылезают» за бюджет).
* vh (не dvh) — согласовано с position:fixed inset:0 самого оверлея.
* `height: 100% + max-width` (альтернатива) ОТКЛОНЕНА: у replaced-элемента
  с определённой высотой max-width не корректирует высоту через
  aspect-ratio → неквадратный bitmap.

### Портретный мобильный
```css
@media (max-width: 640px) and (orientation: portrait) {
  .combat-overlay--combat { flex-direction: column; padding: 8px; gap: 8px; }
  .combat-overlay--combat .combat-box { flex: 1 1 auto; min-height: 0; }
  .combat-overlay--combat .combat-box canvas {
    width: min(100%, calc(100vh - 16px - 520px));  /* 520 = gap 8 +
        бюджет панели 512 (turnorder+hpbar+state+actions+лог min 96) */
  }
  .combat-overlay--combat .combat-side { flex: 0 0 auto; width: 100%; }
  .combat-overlay--combat .combat-log { min-height: 96px; }
}
```
* Колонка: поле ПО ШИРИНЕ (ТЗ), панель под ним во всю ширину, кнопки
  остаются в 4 колонки (крупнее — удобнее тапать), лог flex:1.
  390×844: поле ≈ 308px, панель ≈ 488px, итого ≈ 820 ≤ 844 ✓.
* Брейкпоинт 640px+portrait — решение Проектирования (ТЗ: на усмотрение):
  узкий альбомный 568×320 остаётся в row (поле 264 — влезает);
  844×390 — row (844 > 640).
* МЕДИА-ПРАВИЛА ИДУТ ПОСЛЕ основного скоуп-блока в файле (та же
  специфичность — победа по порядку каскада).
* Известное ограничение (в памяти, не в чек-листе ТЗ): вьюпорты ниже
  ~360px высотой в row — панель переполняется (лог сначала сжимается до
  0, потом вытесняются фикс-блоки). Экстремально редкие экраны.

### Кнопки (база `.combat-actions`, только бой)
```css
.combat-actions { grid-template-columns: repeat(4, 1fr); }  /* было 1fr 1fr */
.combat-actions button {
  padding: 0; display: flex; align-items: center;
  justify-content: center; aspect-ratio: 1 / 1; }  /* ~квадратные */
.combat-actions button img { width: 68%; height: 68%; display: block; }
/* :disabled (opacity 0.3) — без изменений */
```
* DOM (combat-ui.js build()): текст `«Имя [K]»` УБИРАЕТСЯ; содержимое —
  `<img src="assets/ui/combat_<action>.svg" alt="">`;
  `b.ariaLabel = item.label` (IDL-свойство, НЕ setAttribute — DOM-стабы
  тестов работают без правок; имя действия: «Удар», «Огонь», …).
  `b.dataset.act`, click-обработчик (runAction + render), логика
  disabled/title в render() — БЕЗ ИЗМЕНЕНИЙ. Клавиши [J] и т.п. с
  кнопок уходят (сами работают; таблица combat-keys.js НЕ меняется,
  keyLabel() в UI больше не вызывается, в модуле остаётся — её тесты свои).

### Клик по клетке (нормализация) — combat-ui.js
```js
const r = canvas.getBoundingClientRect();
const rw = r.width || canvas.width;   // фолбэк: DOM-стабы/патологии
const rh = r.height || canvas.height;
const cx = Math.floor((e.clientX - r.left) * (canvas.width / rw) / CELL);
const cy = Math.floor((e.clientY - r.top)  * (canvas.height / rh) / CELL);
```
* Нормализация — внутренние px / экранные px (getBoundingClientRect),
  не константа CELL (регрессия, которую закрывает ТЗ; красный тест
  672×672).
* Фолбэк `|| canvas.width`: старый DOM-стаб отдаёт {left:0, top:0} без
  width/height → 1:1-семантика, существующие тесты не затрагиваются
  (они canvas не кликают — проверено).
* Border 2px: getBoundingClientRect — border-box → смещение ≤ 2 CSS px
  (< 0.1 клетки при ×2) — допустимо, НЕ компенсируется (существующее
  поведение, не усложняем).

## Canvas: масштаб и разрешение
* Внутреннее разрешение 336×336 (CELL=48, 7×7) — НЕ ПОДНИМАТЬСЯ (решение
  ТЗ «минимум — CSS-масштаб» принято). Подъём ломает геометрические пины
  tests/combat-ui.test.js (48/336/42/[141,132]/CELL×1.15, %48===3) =
  нарушение инварианта «семантических правок существующих тестов нет».
  Размытие 336→~700 допустимо (image-rendering: pixelated); если ревью
  сочтёт плохим — ОТДЕЛЬНАЯ задача с пересчётом ассертов.
* Масштабирование — ЧИСТЫЙ CSS: без ресайза canvas, без resize-
  обработчиков, без setTransform.
* Рисующий код (включая 000084 — союзники на мини-карте) работает в
  ВНУТРЕННИХ px (клетки × CELL) — независимо от CSS-размера.

## Иконки (контракт для 000123 — общий каталог assets/ui/)
* 8 файлов, ИМЕНА ДЕТЕРМИНИРОВАНЫ: `'assets/ui/combat_' +
  item.action.toLowerCase() + '.svg'` (единострочная деривация из имени
  действия — без карты, не может дрейфовать от combat-keys.js; префикс
  combat_ не пересекается с иконками 000123):
  1. combat_attack.svg — меч (скос, остриё наверх)
  2. combat_fire.svg — пламя (капля с вырезом)
  3. combat_heal.svg — крест (латинский, скруглённый)
  4. combat_block.svg — щит (классический гербовый)
  5. combat_quickitem.svg — фляга/зелье (флакон с узким горлом)
  6. combat_invitem.svg — рюкзак (корпус + лямка/нагрудник)
  7. combat_flee.svg — ДВОЙНОЙ шеврон-стрела (» справа)
  8. combat_endturn.svg — песочные часы
* СИСТЕМА (единая для assets/ui/): `viewBox="0 0 24 24"` +
  `width="24" height="24"` (ширина/высота ОБЯЗАТЕЛЬНЫ — tests/svg.test.js)
  + `xmlns="http://www.w3.org/2000/svg"`; ЕДИНЫЙ светлый fill `#e8dcc0`
  (цвет текста UI) под тёмную кнопку `#2c3040`; fill-only (без
  градиентов/фильтров/`<text>`/xlink/stroke); силуэты читаемы при
  44…56px без подписи (ручная проверка).
* flee — двойной шеврон (НЕ бегущая фигура): чёткий при 44…56px в
  одноцветном fill; фигура с тонкими конечностями размывается в малом
  размере. Оба варианта легальны по ТЗ — выбор зафиксирован здесь.
* ОБЯЗАТЕЛЬНО: каждый SVG проходит tests/svg.test.js (правило 000120:
  well-formedness + корень svg + xmlns + viewBox + без NaN/пустых) ДО
  попадания в assets/.
* tests/svg.test.js: в EXPECTED_SVG_BY_DIR строка `'ui': 8`
  (итог 283 → 291). КОНФЛИКТ с 000123 (pending, тот же каталог): тот же
  ключ `'ui'` — при любом порядке мержей ребаза даёт СУММУ счётчиков.
* Если 000123 смержится РАНЬШЕ: её иконки обязаны соответствовать системе
  (viewBox 24, #e8dcc0, width/height); при расхождении — правим файлы
  000123 под этот контракт на ребайзе.

## Ленивые ссылки и guards
* НОВЫХ JS-МОДУЛЕЙ НЕТ (имена иконок — inline-деривация в combat-ui.js) →
  новых `<script>` НЕТ → пин tests/index-order.test.js не нужен;
  UMD-ловушки нет (combat-ui.js — browser-only IIFE, не UMD).
* Существующие guards combat-ui.js (G.createCombat/G.CombatKeys —
  console.error + деградация, игра не падает) — без изменений.
* Новый guard: фолбэк `r.width || canvas.width` в клике (защита от
  Infinity/NaN при нулевом/отсутствующем rect).

## Карта тестов
База: npm test в worktree — 1200/1200 (проверено 2026-10-01).
* tests/combat-ui.test.js (vm-песочница, DOM-стаб makeEl):
  * ТЕХНИЧЕСКАЯ правка стаба (разрешена ТЗ): getBoundingClientRect →
    `{ left: 0, top: 0, width: el.width, height: el.height }` (canvas
    после build = 336×336 = 1:1; setAttribute НЕ нужен — IDL-свойство).
    Существующие 28 тестов не кликают canvas и не читают текст/детей
    кнопок (проверено grep'ом) — их поведение неизменно.
  * КРАСНЫЕ: (R1) 8 кнопок — у каждой img с src по
    `/^assets\/ui\/combat_[a-z]+\.svg$/` + `fs.existsSync` файла,
    `b.ariaLabel` = label из describeCombatKeys(), `textContent === ''`;
    (R2) оверлей (body.children[0]) className содержит
    'combat-overlay--combat'; (R3) клик при rect 672×672 (override
    getBoundingClientRect; волк в (1,2), клик в центр клетки в 672-
    координатах) → c.targetId = волк.
  * ЗЕЛЁНЫЕ якоря: 1:1-контроль (rect 336×336 — та же цель); нулевой
    rect ({width:0,height:0}) → фолбэк 1:1, без ошибок.
* tests/combat-layout.test.js (НОВЫЙ, node-статика; хелпер-паттерн
  cssRule из tests/ui-panel.test.js — дублируется локально, берёт ПЕРВУЮ
  вхождение точного `selector {`):
  * КРАСНЫЕ: (R4) база `.combat-actions` — grid-template-columns по
    `/repeat\(\s*4\s*,/`; (R5) `.combat-overlay--combat .combat-log` —
    есть `/flex:\s*1/`, нет `height:\d+px`.
  * ЗЕЛЁНЫЕ стражи (000125/подземелье): база `.combat-side` — width 320px;
    база `.combat-log` — height 170px; правила `.dungeon-overlay
    .combat-side` и `.npc-overlay .combat-side` на месте.
* expectedRedCount = 5 (R1–R5); все 5 красные на текущем master
  (осмысленные assertion-сообщения, не синтаксис).
* Ручная (браузер): 1920×1080, ~1024×768, 390×844, 844×390 — всё вписано
  без скролла; иконки читаемы; отключённые кнопки приглушены с title;
  бой играбелен (движение, клик по цели в т.ч. при масштабе, баннер).

## Что важно будущим задачам
* 000125 (полноэкранные NPC-диалоги): критерий «не ломается при ЛЮБОМ
  порядке мержей» выполнен — вся геометрия боя в `.combat-overlay--combat`,
  база не тронута; её декэплинг на `.npc-panel` с боем не пересекается.
  Базовые свойства `.combat-overlay` (fixed inset 0, z-20, фон,
  font 13px #e8dcc0) остаются общими. Если 000125 уберёт `.combat-side`
  из диалога — правило 320px останется актуальным для боя-скоупа/
  постройки; стражи 000125 могут оставить (правила не удаляем).
* 000123 (иконки глобальной карты): каталог assets/ui/ общий — система
  иконок в разделе «Иконки»; строка `'ui'` svg.test.js — сумма при
  ребайзе.
* 000121 (тач-D-pad в бою): боевой оверлей z-20 ПОКРЫВАЕТ #touch-controls
  (z-5, контейнер pointer-events: none) — «D-pad поверх поля» решается
  самими контролами (свой слой/z, возможно внутри .combat-box);
  контракт для 000121: поле = `.combat-box canvas` (CSS-размер
  min(...), внутреннее 336×336); ЛЮБОЙ клик по canvas нормализуется по
  getBoundingClientRect (формула выше) — D-pad, эмулирующий клик, обязан
  пройти через ту же нормализацию (или звать c.move напрямую).
* 000084 (союзники на мини-карте): рисует в ВНУТРЕННИХ px (CELL=48,
  canvas 336×336) — CSS-масштаб на рисование не влияет; экранные
  координаты в draw-код не вносить.

## Подводные камни
1. Общие классы — ГЛАВНЫЙ РИСК: база .combat-overlay/.combat-side/
   .combat-log/.combat-state — чужие оверлеи (подземелье/NPC/постройка);
   геометрия боя только в скоупе; стражи в tests/combat-layout.test.js.
2. `.combat-actions` — единственное базовое правило, которое правится
   (только бой, grep'ом проверено); появится новый потребитель —
   переносить в скоуп.
3. Медиа-query ПОСЛЕ основного скоуп-блока (каскад по позиции).
4. Константы 32/304/520/256 связаны (padding/gap/панель): изменение
   ширины панели → пересчитать 304 и формулу + память.
5. Подъём внутреннего разрешения canvas — рвёт геометрические пины;
   только отдельная задача.
6. Border canvas 2px в border-box rect — смещение < 0.1 клетки, не
   компенсируется (не усложнять).
7. Merge-конфликты: строка `'ui'` svg.test.js с 000123 (сумма); index.html
   — наш hunk только в зоне боевого CSS (правила .combat-actions 302-316
   и новый блок после .combat-banner ~338), script-теги не трогаем.
8. npm test мерить ВНУТРИ worktree (node --test рекурсивно сканирует
   .worktrees/ — memory/test-runner-worktrees.md).

## План реализации (файлы / дельта)
1. Красные тесты + этот файл памяти (один коммит «Задача 000124:
   красные тесты layout…»): tests/combat-ui.test.js (+~65 строк:
   стаб + R1–R3 + 2 якоря), tests/combat-layout.test.js (новый, ~90 строк),
   memory/000124-combat-layout.md. npm test: 1200 зелёных + 5 красных.
2. «Задача 000124: SVG-иконки действий боя (assets/ui/, 8 шт, правило
   000120)»: assets/ui/combat_*.svg ×8 (~12 строк каждый) + tests/
   svg.test.js строка `'ui': 8` (283→291).
3. «Задача 000124: combat-ui — иконки вместо подписей, aria-label,
   клик по фактическому размеру»: src/combat-ui.js (~+20/−6 строк:
   className build(), цикл кнопок, клик, шапка-комментарий).
4. «Задача 000124: CSS — экран боя в вьюпорте, 4 колонки кнопок,
   лог flex:1»: index.html (~+45/−3 строки, только <style>).
5. (стадия мержа) CHANGELOG.md — раздел `## 2026-10-01`, новый
   заголовок `### Графика` (в файле пока не используется): экран боя
   вписывается в экран (десктоп/мобильные), кнопки действий —
   SVG-иконки в 4 колонки, журнал — всё оставшееся место; без
   программной части. tasks/pending/000124.md → tasks/done/ +
   tasks/result/000124.md.

Итого ~14 файлов, +~450/−10 строк.
