# Задача 000419: мировая миникарта смотровой башни [ui]

Первый настоящий потребитель раздела сейва `explored` (контракт данных —
`memory/000093-explored.md`, контракт действия — `memory/000093-explored-tower.md`).
Слой именуется **мировая миникарта**; ТАКТИЧЕСКАЯ мини-карта 7×7 боя
(000084, `memory/000084-ally-minimap.md`) — ДРУГОЙ слой, здесь не затронут.

## 1. Состав реализации

| Файл | Изменение |
|---|---|
| `src/minimap.js` | НОВЫЙ чистый UMD-модуль (паттерн spellbook-oc 000235.02): surface `{init, toggle, isOpen, close, applyVisibility, buildModel, windowKeys, render}`; load-clean (ноль DOM/Game/консоли на загрузке), ленивый DOM при первом обращении |
| `index.html` | CSS-блок `#minimap`/`#minimap-canvas`/`#minimap-toggle` (правый верхний угол), static-разметка контейнеров, `<script src="src/minimap.js">` в слоте ПОСЛЕ `building-effect-storage.js`, ДО `hud.js`/`main.js`, лестница z-комментария обновлена |
| `src/main.js` | 4 ханка: комментарий у `explored` (~:749), `G.minimap.init({explored, player, getRadius})` после spellbookOC-init, `KeyM`-ветка сразу после `KeyB`, `G.minimap.applyVisibility()` рядом со `spellbookOC.applyVisibility()` в frame |
| `src/building-effects.js` | ТОЛЬКО комментарии: якоря :492/:502 «ОТСРОЧЕНА/без миникарты» → ссылка на src/minimap.js; jsdoc `exploredCount` — union живёт в миникарте, счётчик остаётся суммой |
| `spec/buildings.md` | строка 286 «МИНИКАРТА — ОТСРОЧЕНА…» → снятие (line-neutral, 572 строки — R7) |
| `tests/minimap-000419.test.js` | 12 тестов «000419 T1–T12» (pure + vm-e2e полной цепью) |
| `tests/index-order.test.js` | «нужные модули» += src/minimap.js; НОВЫЙ пин IO5 порядка тега |

## 2. Принятые технические решения (остаточные после анализа)

1. **z-ниша 16.** Лестница index.html: `.char-panel 10 < .cp-tip 11 <
   .fs-btn 15 < #minimap 16 < оверлеи боя/подземелья/resurrect 20 <
   #touch-controls 30 < .spellbook-oc 35 < start-window 40`. Ниша 16 даёт
   штатное гашение панели ВСЕМИ верхними оверлеями автоматически —
   блок-список (spellbook-образный) НЕ нужен. Тест T2 ПЕРЕСНИМАЕТ z из
   CSS-правил (`.fs-btn`/`#minimap`/`.resurrect-overlay`/`.spellbook-oc`),
   не литералом.
2. **Окно вокруг героя.** Панель показывает клеточное окно Чебышёва
   стороны `2R+1` ЦЕНТРОМ НА ГЕРОЕ (не на башне): миникарта — про
   «где я», башня лишьsource тайлов. `R` — из каталога 46
   (`эффект.радиус`, 000053); `buildModel`/`windowKeys` — чистые, радиус
   приходит параметром; литералы 20/41/1681 в src/minimap.js запрещены
   source-scan-пином T5 (ls-доктрина).
3. **union vs сумма.** `buildModel(explored)` — union-`Set` (тайл
   пересечения башен РОВНО ОДИН раз) — это модель ОТРИСОВКИ; HUD-счётчик
   `exploredCount` — СУММА по башням («удвоение» пересечений — контракт
   000093, неизменен). Оба конца закреплены e2e T9 (HUD 3362=2·1681 при
   пересечении 675 тайлов — рисуется 1681 уникальных).
4. **KeyM до гейтов** (как KeyB/KeyC). В бою/подземелье нажатие молча
   переключает СОСТОЯНИЕ скрытой панели — визуально гасится оверлеем
   z≥20; сознательное решение (клавиша не перехватывается оверлеями,
   состояние просто ждёт возврата в мир).
5. **Рисование — СВОЙ canvas** `#minimap-canvas` поверх bake-слоёв:
   чанковый контракт 000263 (frameTiles/exploredVersion-кэш main.js)
   НЕ затронут — миникарта не пишет в #game/#sprites и не инвалидирует
   кэш; tests/chunk-* бит-в-бит зелёные.
6. **signature-охрана кадров.** `applyVisibility` при открытой панели
   сравнивает дешёвую сигнатуру (башни/сумма-мощностей/позиция/радиус —
   O(башен)) — ре-рендер только на изменение; закрыта — no-op до DOM.
   Повторное открытие — форсированный полный ре-рендер (T10).
7. **Кнопка-дублёр** `#minimap-toggle` (внешняя fixed той же ниши —
   панель скрыта вместе с содержимым): click wire-ится лениво при первом
   обращении к DOM (T11).
8. **Пересечение realm-ловушек vm**: чистые функции миникарты принимают
   Map/Set И plain-формы duck-typing'ом (`forEach`+`get`), НЕ
   `instanceof` — тесты гоняют нодовые Map в sandbox-модуль и обратно;
   массивы/строки результата сравнивать spread'ом (прототипы realm'ов
   разные — deepStrictEqual кросс-realm краснеет на пустых []).

## 3. Что НЕ тронуто (проверено срезами)

- explored сейв: serializeExplored/restoreExplored, канон row-major,
  roundtrip byte-identical (T8: seed → boot → beforeunload — тот же
  снимок), версия v1 без бампа, save.js 0-diff;
- hud.js строка «Исследовано: N тайлов» побайтово (HU-пины зелёные);
- туман подземелий (000136), heroPassable/frost_walk район main.js
  (за ним 000422 — ханки миникарты в других строках), чанковый кэш;
- task/000359-01 (craft/items/companions/efir) и task/000354
  (building-actions/storage) — 0-diff;
- assets/, зеркала src/*-data.js — sync:check=0 без перегенерации.

## 4. Деградации

- Нет `G.minimap` (битая цепь) — main.js тихо работает без панели
  (в отличие от spellbookOC — здесь НЕ fatal, панель опциональна);
- нет DOM-элементов (чужие vm-песочницы getElementById→null) — init/
  toggle/applyVisibility/render не бросают (T6), рисование — no-op;
- каталог 46 без эффекта → getRadius→0 → пустое окно (честная деградация);
  эффект с некорректным радиусом → фолбэк 20 (как applyExplore).
