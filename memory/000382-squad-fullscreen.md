# 000382 — панель «Отряд» [C] на весь экран (симметрия 000377)

Пользовательская UI-задача из debt-реестра 000377-аудита (ретро-b22 P5).
Панель «Отряд» переведена с геометрии `top/left/right 12px + bottom 56px`
на ВЕСЬ экран и получила то же сокрытие кнопки полноэкранного режима,
что у панели персонажа [I] с 000377. Механика FullscreenController
(`src/fullscreen.js`), DOM-привязка кнопки (`src/main.js`, inline-z
15/25) и предикат 000150 `touchControlsVisibility` — 0-diff.

## ГРАБЛЯ терминологии: панель [C], а НЕ [K]

Клавиша панели «Отряд» в коде — **KeyC** (`src/main.js`, ветка keydown
после KeyI; close-кнопка «закрыть [C]/[Esc]» в ui.js; тач-кнопка
`onSquad` — тот же toggle). **KeyK — боевая атака** (`combat-keys.js`).
Метки «[K]» в текстах задач 000377/000382 и их result-файлах —
документальный артефакт; биндинг НЕ менять, в тестах/памяти писать [C].
Исторические tasks/done|result 000377 с «[K]» не переписывать.

## ФОРМУЛА изменений

### index.html
- `.squad-panel`: `top: 0; left: 0; right: 0; bottom: 0` — ЧЕТЫРЕ
  ЛОНГХЕНДА, НЕ shorthand `inset:0` (бриф говорил «inset 0» — ловушка:
  пины парсят именно keys top/left/right/bottom; тот же мотив, что у
  .char-panel в 000377). Контур `padding: 12px 14px` / border /
  border-radius 12px / z-index 10 / display:flex — 0-diff.
- РОВНО ОДНО новое правило `body.squad-panel-open .fs-btn { display: none; }`
  — СРАЗУ ПОСЛЕ char-правила `body.char-panel-open .fs-btn` (строки
  222/231 на базе 5c978b06 — после ре-базы пересчитывать grep-ом).
  Порядок база `.fs-btn` (200) < char (222) < squad (231) ОБЯЗАТЕЛЕН:
  first-match парсеры (игла 000377-P3 `body\.<токен> \.fs-btn\{`,
  `cssRule(html,'fs-btn')` в ui-panel, cssZ в CI-13) резолвят базу и
  char-токен; squad-правило ДО char перехватило бы иглу P3 молча.
- Комментарий над `.squad-panel` переписан (лгал про «полоса сохранена»).

### src/ui.js
- `markPanelOpen(on)` параметризован: `markPanelOpen(on, token = PANEL_OPEN_TOKEN)`;
  НОВЫЙ `SQUAD_PANEL_OPEN_TOKEN = 'squad-panel-open'` (имя свободно —
  свип 0 вхождений на базе). Char-вызов `markPanelOpen(show)` 0-diff
  (дефолтный параметр), null-guard / change-guard / preserve чужих
  токенов — общие, уже в хелпере.
- Хук в squad-toggle — ОДНОЙ СТРОКОЙ сразу после записи display:
  `markPanelOpen(show, SQUAD_PANEL_OPEN_TOKEN);` — зеркало char-toggle.
  Guard `!initialized` стоит ДО записи display → инвариант
  «токен ⇔ panel.style.display === 'flex'» держится и до init (no-op).
- Все входы/выходы панели идут через `toggle`: KeyC (main.js), тач
  `onSquad`, close-кнопка, Esc-диспетчер панели, `gotoCharacterTab`,
  teardown боя/локации в main.js — хук покрывает всё.
- GRAD-инвариант 000377 выдержан: `grep -c "style.display = show" src/ui.js`
  ≡ 2 (хук — СЛЕДУЮЩЕЙ строкой, display-строки не правятся).

## Контракты — выдержаны (пин-лист)

- 000086 (squadUI API): init/toggle/render/isOpen/applyLayer/liveState —
  состав без изменений.
- 000096 (паттерн playerUI): ленивый build, инлайн 'flex'/'none', ОДИН
  делегированный click, Esc-гарды — toggle не перестраивался.
- 000150 touchControlsVisibility + урок 000376: controls.js/main.js
  0-diff, squad в предикат НЕ добавлялся; tests/ui-touch-visibility
  зелёный БЕЗ ре-пинов («squad» там — тач-кнопка, не панель).
- 000017/000256 (fs-btn): сокрытие — ТОЛЬКО CSS-каскад; display кнопки
  из JS не пишется (зуб S7: `fsBtns[0].style.display === undefined`);
  tests/fullscreen-button-overlay FS-2 («в body ровно одна .fs-btn») —
  DOM-счётчик, CSS не влияет, зелёный БЕЗ правок.
- 000217 (applyLayer z-подъём панели) — инлайн zIndex не тронут.
- index-order: поверхность `Game.touchControls` (typeof-список 5
  методов) не менялась.
- spec/SPEC.md: панель «Отряд» и её геометрия в spec/ не документированы
  (свип) → spec 0-diff.

## Карта ре-пинов

- `tests/ui-panel-fullscreen-000377.test.js` P2 — ЕДИНСТВЕННЫЙ законный
  слом: закреплял `bottom 56px` как ТЕКУЩЕЕ состояние [C] (guard-пин).
  Перепинен на 0/0/0/0; имя сохраняет префикс «000377-P2» (TAP-маркер
  «000377-P»=18 не двинут) + маркер «(ре-пин 000382)» → «ре-пин 000382»=2
  в финальном TAP. Шапка файла обновлена (P2 ушёл из guard-пинов).
- `memory/000377-panel-fullscreen.md` — эррата 2 GRAD-строк (squad
  «НЕ трогать» / «bottom:56px — пин P2» стали ложными).
- НЕ ре-пинить (свип базы подтвердил зелёность): 000377-P3 (first-match
  игла остаётся char-panel-open при порядке база→char→squad),
  ui-panel.test.js (cssRule first-match — база .fs-btn раньше обоих
  scope-правил; строки с «char-panel-open» — комментарии),
  city-inventory-e2e CI-13 (cssZ non-global = база),
  fullscreen-button-overlay FS-1/FS-2, spellbook-oc-button-000332 B2
  (строка «Лестница:» целена), ui-touch-visibility, index-order,
  squad-panel.test.js / squad-panel-e2e / squad-placement-e2e-000304
  (body.className не пинуют НИ ОДИН — свип deepEqual-className только
  combat-ui/combat-spellbook, не body), e9-header-canary (index.html
  не читает), storage-000313-S1e / build-menu-layout (глобальные .cp-*
  базы не тронуты — новых скоуп-оверрайдов отступов НЕТ).
- Счётчиков «ровно N CSS-правил» / побайтовых дамп-пинов style-блока — 0.

## Унаследованные от 000377 деградации — ПРИВЫСЛИ К [C], НЕ ЧИНИТЬ

(прямое требование ТЗ 000382 «учесть … не чинить»)
- `bottomInset()` (ui.js, читает `fsBtn.offsetHeight + 12`): resize при
  открытой [C] (кнопка display:none ⇒ offsetHeight 0) опустит tc-кнопки
  на ~45px; перезапишется на следующем resize после закрытия.
- tc-кнопки (z-30) поверх нижних строк полноэкранной [C] — та же
  лестница, что у [I]; полное сокрытие tc при открытой панели запрещено
  уроком 000376 (ломает предикат 000150).
- `.squad-body { max-width: 560px }` — контент-колонка СОХРАНЕНА (рамка
  стала экраном, колонка центрируется — это контент, не «мёртвый» отступ).
- Долг-комментарий: `tests/fullscreen-button-overlay.test.js:13`
  («display:none … у .fs-btn НЕТ») ложна с 000377, стала ложнее с 000382 —
  правка чужого файла вне скоупа; фиксировать при следующем ретро.

## Тесты

`tests/ui-squad-fullscreen-000382.test.js` — 8 тестов «000382-S1…S8»,
3 слоя (стаб-дубли 000377 приняты конвенцией; VM_CHAIN дополнена
companions.js+efir.js после npc.js — иначе render() в read-only
деградацию с console.error):
- S1 геометрия .squad-panel (RED); S2 правило+порядок+кросс-контракт
  токенов matchAll ≡ {char, squad} (RED); S3 guard-пин [I]-контракта
  (зелёный и до, и после); S4–S6 vm: токен/preserve/независимость от
  char-токена, Esc + close-кнопка, display⇔токен + до-init no-op +
  null-guard body (RED); S7–S8 e2e полная цепь: KeyC + кадр + РОВНО
  одна .fs-btn с display ≡ undefined, сосуществование [C]/[I] (RED).

ГРАБЛЯ из матрицы мутаций (M3): перестановку squad-правила ПЕРЕД
char-правилом 000377-P3 НЕ ловит (его first-match игла резолвит
любой присутствующий body-токен, литерал которого есть в ui.js) —
порядок база<char<squad защищён ТОЛЬКО порядковой частью S2.
Любому следующему scope-правилу сокрытия — соблюдать порядок и
расширять matchAll-набор в S2.

## Числа станции

Ожидание финального полного прогона: 4644 (мастер 5c978b06) + 8 = 4652;
маркеры: «D-JSON-1»=2, «ровно 30 файлов»=2, «000377-P»=18 (не изменился),
«000382-S»=16, «ре-пин 000382»=2.
