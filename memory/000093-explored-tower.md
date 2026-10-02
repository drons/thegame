# Задача 000093: смотровая башня — «Взглянуть» (разведка без миникарты)

Статус: спроектировано — контракт реализации (задача выполняется по нему).
Контракт ДАННЫХ раздела сейва `explored` — `memory/000093-explored.md`.
ТЗ: `tasks/pending/000093.md` (дочь 000064; SPEC «Эффекты построек» → Смотровая башня).

## 1. Что добавлено / что перенесено

Файловый список ТЗ СТОЛ (до разделения 000074/000128): ТЗ описывает «main.js:
действие из buildingUI — сбор тайлов окна, markExplored, saveNow». В текущем
мастере архитектура ИНАЯ — вся доменная логика эффектов в
`src/building-effects.js` (чистые функции), проводка сторон в мире — в
`src/building-actions.js` (роутер + р.-хунки). Реализация идёт по ПОСТ-000128
архитектуре — СТАНДАРТНЫЙ ПУТЬ (memory/000128-building-actions.md §5:
«000093+ … стандартный путь — р.-хунки из ЧИСТОГО apply, спец-модуль НЕ
нужен»). НЕТ нового модуля, НЕТ тега в index.html, НЕТ изменения
index-order.test.js.

| Файл | Изменение |
|---|---|
| `src/building-effects.js` | +4 ЧИСТЫХ экспорта: `markExplored`, `exploredCount`, `serializeExplored`, `restoreExplored`; внутренний чистый `applyExplore(st)` (НЕ экспортируется, паттерн `applyRuneStone`); запись реестра `EFFECTS['46']` |
| `src/building-actions.js` | +1 ОБЩИЙ ханк `r.explored` (после ханка `r.buffs`, до `r.xp`) — заменяет содержимое живого Map `explored` ДО `saveNow` |
| `src/main.js` | 5 ханков: (1) `const explored = new Map();` после `buildingQuests` (L280); (2) поле `explored` в `collectSaveData` после `buildingQuests` (L356-358); (3) блок `explored` в `restoreFromSave` ПОСЛЕ блока `buildingQuests` (L548-585), ДО «--- Позиция ---»; (4) `explored,` в бандле `buildingActions.init` после `buildingQuests` (L775); (5) `renderHud` — вычисление `exploredCount` (сумма `Set.size`, O(башен), БЕЗ сериализации в кадре) и передача в ctx |
| `src/hud.js` | 1 ханк `buildLine`: строка «Исследовано: N тайлов» — отдельная строка ПОСЛЕ top-блока (после `[I] персонаж …`, до веток `dungeonState`/`hereLine`/mobgroup), рендерится ТОЛЬКО при N>0; заголовочный комментарий «ctx 14 полей» → «15 полей» (только документация) |
| `assets/buildings/000046.json` | +`особые_параметры.эффект = { "радиус": 20 }` (ключ ПОСЛЕ `размещение` — порядок ключей JSON определяет зеркало). `раз_в_день` НЕ добавляется (лимит раз-в-день НЕТ — ТЗ) |
| `src/buildings.js` | зеркало — РЕГЕНЕРАЦИЯ `npm run sync:buildings` (только GENERATED-блок; byte-идентичность; gate — `npm run sync:check` и deepEqual-пин A62) |

НЕ переносится / НЕ меняется: имя раздела `explored` — ФИКСАЦИЯ 000072
(не переименовывать); схема NPC — не трогается; МИНИКАРТА — НЕ ЗДЕСЬ
(отсрочена, отдельная задача при потребности, НОМЕРА НЕ резервируются);
prose `даёт`/`функция` в 000046.json (упоминают миникарту) — НЕ читаются
кодом — НЕ трогаем.

## 2. Контракты и границы

### 2.1 Живая и снимковая формы

- Живая (владеет main.js, НЕ `__game.state`): `explored` —
  `Map<towerKey, Set<tileKey>>`; ключи — `'x,y'` (формат `XY_KEY_RE`).
- Снимок (сейв, `r.explored`): plain object `{ towerKey: 'x,y;x,y;…' }` —
  каноническая строка на башню (подробности — 000093-explored.md).
- `apply` возвращает ЦЕЛОЕ НОВОЕ значение раздела (НЕ дельту):
  `r.explored = markExplored(st.save.explored, towerKey, tiles, R)`;
  ханк заменяет Map целиком (`clear()` + `set()`).

### 2.2 Публичный API (extensions экспортов building-effects.js)

Все функции ЧИСТЫЕ, без load-time зависимостей (UMD-правило 000038/000053),
без console (warn — в main.js, §3).

```
markExplored(explored, towerKey, tiles, R) → новое plain object (иммутабельно)
  explored: plain object {towerKey:'x,y;…'} | null/undefined → {};
            не-object / Array → {} (fail-open, НЕ бросает)
  towerKey: строка, совпадает XY_KEY_RE — иначе THROW (программная ошибка;
            тест-пин)
  R: integer ≥ 0 — иначе THROW (программная ошибка; applyExplore сам
     валидирует до вызова)
  tiles: массив {x: int, y: int} | null/undefined → [];
            элемент не {x,y}-целые-конечные → SKIP (fail-open);
            tile c Chebyshev-расстоянием > R от башни → SKIP
            (ЗАЩИТНЫЙ фильтр: вызовчик передаёт точное окно, поведение
            идентично; гарантирует ТЗ-кап ≤1681 при «лишних» тайлах)
  Мерж: валидные сегменты старшего значения (XY_KEY_RE) ∪ новые тайлы
  Значение = канонический порядок row-major (y по возрастанию, затем
  x, ЧИСЛЕННО), join(';') — единая сериализация, roundtrip byte-identical
  Чужие башни во входном объекте — копируются как есть

exploredCount(explored) → number
  explored — plain object (снимок) | null/undefined → 0; не-object → 0
  на башню — количество ВАЛИДНЫХ сегментов (split(';'), фильтр XY_KEY_RE,
  дедупликация); итог — СУММА ПО БАШНЯМ
  (пересечения башен СЧИТАЮТСЯ ДВАЖДЫ; union по башням — задача
  миникарты, решение отложено — §4)

serializeExplored(m) → plain object
  m — live Map<towerKey, Set<tileKey>> | null/undefined → {}
  запись: ключ — строка; значение — Set (не Set → SKIP);
  значение = row-major sort + join(';'); пустая башня (size 0) → НЕ пишется

restoreExplored(raw) → Map
  raw — plain object | null/undefined/не-object/Array → пустой Map
  (тихо: НИ throw, НИ console — паттерн restoreTeleports/
  restoreBuildingQuests; warn — в main.js restoreFromSave)
  запись: ключ совпадает XY_KEY_RE && значение — строка → сегменты
  фильтруются XY_KEY_RE, дедупликация, row-major sort → Set;
  пустой результат → запись SKIP
```

Roundtrip-инвариант: `restoreExplored(serializeExplored(m))` deepEqual `m`
(каноника на обеих сторонах).

### 2.3 `EFFECTS['46']`

```
// ПОСЛЕ присваивания EFFECTS['42'] (конец группы реестра, до effectIds)
EFFECTS['46'] = {
  имя: 'Взглянуть',
  apply: (st) => applyExplore(st),
};
// разВДень НЕ ставится (нет и в каталоге → hasDailyLimit('46') === false)
```

`applyExplore(st)` — внутренний ЧИСТЫЙ (паттерн applyRuneStone/applyObelisk;
НЕ экспортируется):

1. `catalogEffect(st)` → null → `{ ok: false, message: 'недоступно' }`
   (каталог/запись отсутствуют — 000053: радиус НЕ гадаем без эффекта).
2. `!st.map || typeof st.map !== 'object' || typeof st.map.tileAt !== 'function'`
   → `{ ok: false, message: 'недоступно' }` (гард-карты, паттерн '37').
3. `R = (Number.isInteger(eff.радиус) && eff.радиус >= 0) ? eff.радиус : 20`
   — радиус ТОЛЬКО из каталога (000053); фолбэк 20 — ТОЛЬКО когда объект
   эффект есть, но радиус не целое/отрицательное (ТЗ-фиксированный R=20).
4. Окно: `dy` от -R..R (внешний цикл), `dx` от -R..R (внутренний) —
   row-major; `st.map.tileAt(tx+dx, ty+dy)` в try/catch → falsy → skip;
   ПРОХОДИМОСТЬ НЕ ЧИТАЕТСЯ (ТЗ: данные разведки, не проходимость —
   вода/горы помечаются). 1681 вызов tileAt разово (НЕ в кадре), кэш
   не нужен (идемпотентно).
5. `towerKey = tileKeyOf(st)` — тайл, на котором стоит ИГРОК (конвенция [E]:
   действие доступно только на тайле постройки — конкретная башня).
6. `next = markExplored(st.save && st.save.explored, towerKey, tiles, R)`.
7. Возврат:
   `{ ok: true, explored: next, message: 'Взгляд: исследовано ' + exploredCount(next) + ' тайлов.' }`
   — N = СУММА ПО ВСЕМ БАШНЯМ ПОСЛЕ пометки (согласовано с HUD-индикатором;
   повторная строка при идемпотентном повторе — та же).
   Текст ФИКСИРОВАН (тест-пин): стиль кодовой базы «Префикс: результат.»
   («Расшифровка: …», «Обелиск: …»).

### 2.4 Ханк `building-actions.js` (стандартный путь 000128)

ПОСЛЕ ханка `r.buffs` (L219-222), ДО `r.xp` (L223-226):

```js
// Задача 000093: r.explored — ОБЩИЙ ханк (паттерн r.buffs, 000076):
// ЦЕЛОЕ новое значение раздела (plain object, каноническая форма)
// заменяет живую Map explored ДО saveNow.
if (r.explored && typeof r.explored === 'object' &&
    !Array.isArray(r.explored) && deps.explored &&
    typeof BE.restoreExplored === 'function') {
  const m = BE.restoreExplored(r.explored);
  deps.explored.clear();
  for (const [k, v] of m) deps.explored.set(k, v);
}
```

- `deps.explored` — живой Map из бандла main.js (контракт явного бандла
  000128 §2.2); гард защищает фейковые deps тестов building-actions.
- `typeof BE.restoreExplored === 'function'` — гард деградированного
  модуля (в ветке apply `BE` реален — запись взята из `BE.EFFECTS`).
- Позиция ДО `saveNow` (L319) — снимок уже содержит новое значение.
- БЕЗ r.explored у чужих эффектов — no-op (регрессия B12: синтетическая
  запись-замена EFFECTS['46'] не несёт r.explored → ханк не срабатывает).

### 2.5 main.js — 5 ханков (точки вставки — актуальные master-строки)

1. **Состояние** — после `const buildingQuests = new Map();` (L280):
   `const explored = new Map();` + комментарий (tower 'x,y' → Set<'x,y'>;
   раздел сейва explored — 000072; идемпотентно; лимита раз-в-день нет).
2. **collectSaveData** — после поля `buildingQuests` (L356-358), 1:1 паттерн:
   `explored: (G.buildingEffects && G.buildingEffects.serializeExplored) ? G.buildingEffects.serializeExplored(explored) : {},`
3. **restoreFromSave** — ПОСЛЕ блока buildingQuests (L548-585), ДО
   «--- Позиция ---» (L587): СВОЙ try/catch, 1:1 шаблон блока teleports
   (L527-546):
   - `rawE = d.explored; if (rawE != null) {`
   - не-object/Array → `console.warn('Сейв: раздел explored некорректен — сбрасываю.'); explored.clear();`
   - else if `G.buildingEffects && G.buildingEffects.restoreExplored` →
     `m = G.buildingEffects.restoreExplored(rawE); explored.clear(); for (const [k,v] of m) explored.set(k,v);`
     + `if (m.size === 0 && Object.keys(rawE).length > 0) console.warn('Сейв: explored — валидных записей нет — сбрасываю.');`
   - catch → `console.warn('Сейв: не удалось восстановить explored:', err);`
   - версия сейва НЕ повышается, миграций НЕТ (000031).
4. **Бандл init** — после `buildingQuests,` (L775):
   `explored, // live Map 'x,y' → Set<'x,y'> (000093)`.
5. **renderHud** (L1424-1434) — перед `G.hud.update`:
   `let exploredCount = 0; for (const s of explored.values()) exploredCount += s.size;`
   и в ctx поле `exploredCount` (ctx 15 полей).

### 2.6 hud.js (строка HUD)

```js
// в buildLine, перед «let line = …»:
const exploredCount = Number.isFinite(ctx.exploredCount) ? ctx.exploredCount : 0;
// top-блок (оканчивается «[I] персонаж» + подсказки) дополняется:
  + (exploredCount > 0 ? '\nИсследовано: ' + exploredCount + ' тайлов' : '');
```

- Позиция: отдельная строка ПОСЛЕ `[I] персонаж …`, ДО веток
  dungeonState/hereLine/mobgroup.
- ТОЛЬКО при N>0 → байт-пины HU4/HU5 (makeCtx без exploredCount → 0) —
  byte-identical, зелёные.
- Грамматика «N тайлов» — БЕЗ склонений (ТЗ-текст «исследовано N тайлов»).
- Гард `Number.isFinite` → NaN/не-число → 0 (строки нет).
- Счёт идёт в main.js (сумма `Set.size` по живой Map) — hud.js ЧИСТАЯ
  (как и вся строка), buildingEffects для подсчёта НЕ нужен.

### 2.7 Каталог

- `assets/buildings/000046.json`: `особые_параметры.эффект = { "радиус": 20 }`
  (модель — 000041.json: «эффект» — ОБЪЕКТ параметров, конвенция 000075).
- `раз_в_день` — НЕТ (ТЗ: взгляд бесплатен и идемпотентен).
- `npm run sync:buildings` — регенерация зеркала; строка id 46 в
  `src/buildings.js` получает `эффект: { радиус: 20 }` (порядок ключей —
  из JSON).

## 3. Ленивые ссылки и guards

- UMD: building-effects.js — ноль load-time зависимостей (как сейчас);
  новые функции — чистые, `Game`/DOM/консоль — только в вызываемом коде.
- main.js: `G.buildingEffects && G.buildingEffects.serializeExplored`
  (collectSaveData) / `G.buildingEffects && G.buildingEffects.restoreExplored`
  (restoreFromSave) — деградированная цепочка (модуль отсутствует) →
  раздел `{}` / пустой Map, игра не роняется (паттерн 000038/000053).
- building-actions.js: гарды `deps.explored` + `typeof BE.restoreExplored`
  (см. §2.4).
- hud.js: `Number.isFinite(ctx.exploredCount)` (см. §2.6).
- applyExplore: `catalogEffect(st)` null → «недоступно» (каталог без
  эффекта); гард карты (§2.3 п. 2); try/catch tileAt (бесконечная карта —
  на деле недостижимо, но дешёво и детерминированно).
- ЛЕНИВОСТИ по кадрам: HUD не сериализует explored (сумма Set.size,
  O(башен)); 1681 tileAt — только в момент действия, не в кадре.

## 4. Что важно будущим задачам (из ТЗ-ссылок)

- **МИНИКАРТА — ОТСРОЧЕНА** (ТЗ явно; отдельная задача при потребности,
  НОМЕРА НЕ резервировать). Данные готовы: живая `Map<towerKey, Set<tileKey>>`
  в main.js + раздел сейва `explored`. Будущая задача: рендер миникарты из
  этих данных.
- **Счёт пересечений**: `exploredCount` — СУММА ПО БАШНЯМ (пересечения
  окон двух башен считаются дважды). UNION по башням НЕ реализован — это
  решение БУДУЩЕЙ задачи миникарты (показать ли пересечение один раз).
  Формат раздела union-совместим (по башням ключи разделены).
- **Формат сейва компактный** (ловушка localStorage). Сжатие
  (delta/RLE) — «при необходимости в задаче, но не раньше» (ТЗ) — будущая
  задача, имя раздела и форма ключей сохраняются.
- **R — параметр каталога**: код окна не хардкодит 20 (только фолбэк).
  Изменение `радиус` в 000046.json автоматически меняет окно.
- Прочие «особые» постройки (000091/92/94/95) — параллельные задачи:
  стандартный путь 000128 (р.-хунки из чистого apply), спец-модули НЕ
  нужны; их хунки — свои, см. §6.

## 5. Подводные камни

1. **Файловый список ТЗ устарел** (main.js — сбор окна): решено по
   000128 — чистая логика в building-effects.js, ханк в building-actions.js
   (см. §1). Контракт ТЗ (чистые функции, формат сейва, HUD, каталог) —
   соблюдён дословно.
2. **B-e2e НЕ ходит к башне**: (36,-21) — 57 шагов от спавна, а
   steps_per_day = 40 — ходьба скатит день. Присеиваем позицию:
   `seedSave({ day: 1, position: { x: 36, y: -21 } })` (прецедент B14 —
   позиция сейва на тайле постройки восстанавливается; тайл (36,-21)
   проходимость true — ПРОВЕРЕНО зондом: buildingId 46, passable true).
3. **Окно башни (36,-21) содержит 387 НЕПРОХОДИМЫХ тайлов** (зонд,
   детерминированный мир: seed-генерация, map.png onerror →
   G.generateSeedPixels) — e2e-пин ТОЧНО 1681 сегментов: если код будет
   читать проходимость — тест ловит. В окне есть и чужие постройки
   (25, 31, 36×9, 37, 38, 51×3, 52×12) — их тайлы тоже помечаются
   (данные разведки).
4. **Байт-пины HU4/HU5** (tests/hud.js.test.js): новая строка — только
   при N>0; makeCtx() без exploredCount → 0 → строки нет → пины зелёные.
   НЕ рендерить строку при N=0 («Исследовано: 0 тайлов» — сломало бы
   пины и против дизайна).
5. **A1 — пин списка EFFECTS-ключей** (`deepEqual(Object.keys(BE.EFFECTS).sort(), …)`)
   — ТЕХНИЧЕСКИЙ union: добавляем `'46'` (паттерн «кто смержился первым»
   при параллельных 000091/92/94/95) + 4 функции в список экспортов.
6. **B12** (замена EFFECTS['46'] синтетикой в try/finally): синтетический
   apply не возвращает r.explored → новый ханк no-op → тест зелёный
   БЕЗ изменений.
7. **Не добавлять `раз_в_день` в каталог 46** — строка действия заблокировалась
   бы на тот же день (контра-пин B25: повтор в тот же день — строка
   доступна).
8. **restoreExplored — ТИХИЙ** (без console) — warn'ы живут ТОЛЬКО в
   main.js restoreFromSave (паттерн 000072); тест «битый раздел → warn»
   идёт через vm (save-restore.test.js), не через чистую функцию.
9. **Зеркало byte-identical**: правка JSON БЕЗ `npm run sync:buildings`
   → sync:check / A62 падают. Коммитить JSON и mirror ВМЕСТЕ.
10. **Канонический порядок row-major** (y, затем x, ЧИСЛЕННО, а не
    строково!) — при |y|>9 строковая сортировка даст «10» < «9» →
    roundtrip-пины и deepEqual-тесты сломаются.
11. **Раздел пишется ВСЕГДА** (даже `{}`): v1-сейв без explored →
    восстановлен пустым → записан обратно `{}` (пин save-restore «старый
    v1-сейв»).
12. **towerKey = тайл ИГРОКА** (а не башни из поиска): [E] доступен
    только на тайле постройки → игрок И на башне.

## 6. Изоляция хунков (параллельные 000091/92/94/95)

Все правки — АДДИТИВНЫЕ, в разных строках:
- building-effects.js: запись EFFECTS['46'] — свой id; 4 функции — свой
  блок (конце файла, перед exports); exports — свои строки. Чужие id —
  свои записи.
- building-actions.js: ханк r.explored — своя строка после r.buffs
  (чужие спец-модули — registerSpecial, свой механизм).
- main.js: 5 ханков — свои строки (своё поле collectSaveData, свой блок
  restoreFromSave, свой бандл, свой ctx-поле).
- hud.js: один hunk в top-блоке buildLine (чужие строки — не предвидится;
  при конфликте — union по строкам).
- Каталог: 000046.json — свой файл (чужие — 000047-000051); зеркало
  регенерируется скриптом (конфликт в GENERATED-блоке — пересинк).
- Тесты: building-effects.test.js — A1 (union), свои A55-A63/B24/B25
  (чужие — свои номера/имена); save-restore.test.js — union двух
  существующих тестов (свой ввод explored + свои assert'ы); hud.js.test.js —
  свой HU8.

## 7. Тест-пины (план; детально — в отчёте)

RED (до кода падают, после — зелёные):
- A1 (union): `'46'` в EFFECTS-ключах + 4 функции в экспортах.
- A55: markExplored — полное окно 41×41: 1681 сегмент, граница R=20
  включительно (углы (x±20,y±20) есть), снаружи — нет (защитный R-фильтр:
  2000 тайлов c лишними → только окно).
- A56: непроходимые тайлы помечаются (applyExplore, синтетическая карта с
  terrain 'вода'/'горы', passable:false → r.explored полное окно).
- A57: идемпотентность: повторный markExplored/applyExplore — deepEqual,
  дубликатов нет.
- A58: roundtrip serialize/restore deepEqual (включая канонизацию
  перемешанного порядка).
- A59: restoreExplored — 'junk'/'42'/[1]/{к:42} → пусто/только-валидные;
  НИ throw, НИ console (spy).
- A60: рост ограничен: ≤1681 ключей на башню (большой tiles-массив +
  объединение двух разных окон той же башни).
- A61: exploredCount — null/undefined → 0; объект → сумма валидных;
  две башни с пересечением — сумма по башням (не union).
- A62: каталог 46 — `p46.эффект.радиус === 20`; `p46.раз_в_день === undefined`;
  реестр: имя 'Взглянуть', разВДень отсутствует, hasDailyLimit(catalog46,'46')
  === false; зеркало deepEqual ≡ JSON (паттерн A43).
- A63: applyExplore-деградации: без каталога-эффекта → {ok:false,'недоступно'};
  без карты → то же; eff.радиус=1.5 → фолбэк R=20 (окно 1681).
- B24: e2e — seedSave({day:1, position:{x:36,y:-21}}) → KeyE → строка '46'
  → Digit1 → сейв: explored['36,-21'] — 1681 сегмента, ВСЕ в Чебышёве ≤20
  от (36,-21), уникальны; buildingOncePerDay БЕЗ ключа '36,-21:46';
  день не сдвинулся; HUD строит «Исследовано: 1681 тайлов»; errors 0.
- B25: e2e повтор — вторая [E]+1 в тот же день: строка НЕ заблокирована,
  explored deepEqual первому (роста нет), errors 0.
- HU8 (hud.js.test.js): `buildLine(makeCtx({exploredCount:1681}))` —
  точные байты: top-блок + `'\nИсследовано: 1681 тайлов'` перед
  «Здесь:»/контекстом; exploredCount:1 → «…1 тайлов» (без склонений);
  exploredCount:0 / NaN / отсутствует → byte-identical базовой строке.
- save.test.js (000093, паттерн 000072): v1-сейв без explored — ok
  (данные как есть); roundtrip раздела через S.save/S.load +
  BE.restoreExplored → Map deepEqual.
- save-restore.test.js (union существующих): «битые разделы» — +ввод
  `explored:'junk'` → errors 0, warn содержит 'explored', после
  beforeunload `saved.data.explored` deepEqual {}; «старый v1-сейв» —
  `saved.data.explored` deepEqual {}.

НЕ трогается (семантически): HU4/HU5, B3, B13-B23, A2-A54 (кроме
технического union A1), source-text пины save.test.js, index.html,
index-order.test.js, SVG/CSS-ассеты (нет — svg.test.js N/A).

## 8. Голден-факты (зонд, детерминированный мир)

- Башня id 46 — (36,-21): passable true, buildingId 46 (terrain 3).
- Окно R=20 (1681 тайлов): 387 непроходимых; чужие постройки в окне:
  {25:1, 31:1, 36:9, 37:1, 38:1, 46:1, 51:3, 52:12}.
- Спавн — первый проходимый без mobgroup по спирали от (0,0); башня —
  57 шагов → B-e2e присеивает позицию (B14-прецедент).
- Пин перепроверить после rebase на свежий мастер (мир детерминирован,
  но код findSpawn/seed мог сдвинуться в чужом мердже).
