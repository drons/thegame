# 000354 — Хранилище [E]: лента вырезана, апгрейд был и есть

## Корень «старого интерфейса» (гипотеза двойного оверлея ОПРОВЕРГНУТА)

Двух слоёв никогда не было: `buildingUI.open` всегда закрывает прежний
оверлей (`src/building-ui.js` buildDom → closeDom), `executeAction`
закрывает оверлей ДО вызова onAction. «Старый интерфейс с огромной
лентой без прокрутки» = ОДНОСЛОЙНОЕ [E]-меню, раздутое
`storageMenuRows` (src/building-actions.js, путь города:
interactCity → extraActions → openBuildingUI → buildingUI.open БЕЗ
layout): по строке «Сложить/Вынуть» на КАЖДЫЙ слот инвентаря и КАЖДУЮ
запись склада. Голый `.combat-overlay` не имеет overflow (скроллятся
только `.combat-overlay--build .cp-items` и `.storage-col`) ⇒ панель
выше вьюпорта и обрезана. Отсюда же жалоба «кнопка улучшения не
видна»: строка «Улучшить…» (000222) тонула в ленте (~по позиции 3 из
60+). Новый путь 000313 был корректен — достигался вторым шагом (клик
строки «Хранилище»).

## Фикс

УДАЛЕНО в src/building-actions.js: функция `storageMenuRows` и
`.concat(storageMenuRows(...))` в extraActions interactCity (итог
файла −72/+3, правки += только микрочистка чужих комментариев,
которые иначе противоречили бы коду).
НЕ тронуты: делегирование put-*/take-* пайплайном спец-у «storage»
(onBuildingAction — прямой put остаётся ОДНОЙ мутацией, контракт
S7c/000221 — пин T4 нового теста + S7c); спец-модуль
building-effect-storage.js (лента panels — buildRows); CSS;
мёртвый `isStorageBuilding` (мёртв с 000222 — вне scope). После [E]
меню = ['storage','upgrade','demolish'] (3 строки, хоткеи 1..3);
лента в DOM старого пути не создаётся вообще (ТЗ «вырезать
инициализацию, не display:none»).

## Часть 2 (апгрейд) — НИЧЕГО ЧИНИТЬ НЕ ТРЕБОВАЛОСЬ

Цепь 000222 полная: storage.json `особые_параметры.хранилище`
(слоты 40/прирост 20) → Cities.isLevelableBuilding (хранилище-ветка)
→ upgradeActionRow (строка в [E]-МЕНЮ — позиция сразу после
«Хранилище»; в ПАНЕЛИ кнопки апгрейда нет по контракту 000222 R11)
→ спец 'upgrade' (внутри building-actions.js) → upgradeBuildingAt
(level+1 в built-записи) → ёмкость storageCapacity(id, level).
Доказательство работы — тест 000354-T3 (node: −100 з./исходники/
level:2/flash/панель capacity.m 60) + building-levels R11/R12/R14.
« (улучш.)» в building-effect-storage.js:26-28 — суффикс бонуса
ПРЕДМЕТА, к уровню постройки отношения не имеет (не путать).

## Ре-пины (санкционированы ТЗ: «старого DOM не создаётся вообще»)

Двигалось ТОЛЬКО утверждение «put/take-строки есть в [E]-МЕНЮ»;
панельные контракты (S1–S6, заголовки, dnd, кнопки, ёмкость) — бит-в-
бит:

- tests/storage-panels-000313.test.js S7: (a) ids меню →
  ['storage','upgrade','demolish']; (c) put-строк в меню НЕТ, прямой
  `menu.onAction({id:'put-0'})` — пин делегирования/одной мутации.
- tests/building-levels.test.js: в шапке ЯВНАЯ регистрация
  `require building-effect-storage → registerSpecial('storage')`
  (R5 читает панель); R5 (a)/(b)/(c) — клик «storage» → панель;
  R11(b) idsB → 3 ids (+шапка названия); R12 ре-энтри → 3 ids;
  R14 блоки ovF/ovR — клик «storage» перед чтением put-0 (в ovF —
  neg-пин «put-0 в [E] нет»).
- tests/city-storage.test.js: 8 мест «close → interactCity → чтение
  put/take» получили `lastOverlay(t).onAction({id:'storage'})`
  (R8 d/f/g, R9 (2)/(3), boot-B take-0, три merge-блока). R6/R7/R10
  не двигались (R6 уже ждал 3 ids, R7/R10 читают панель/demolish).
- Тестовые ЧУЖИЕ файлы не тронуты: city-interact, city-inventory-e2e,
  movement-freeze-e2e, spec-split (упоминания «Сложить» — только
  текст комментариев/счёта spec, DOM не читают).

## Новый тест

tests/storage-e-double-open-000354.test.js — 6 (node-фикстура
city-storage-паттерна + vm full-chain building-levels-паттерна;
харнессы — копия 000206): T1 ids меню РОВНО 3 (RED на базе);
T2 панель владеет лентой (layout/capacity/ids — гард); T3 апгрейд
(доказательство части 2 — гард на базе); T4 прямой put через
pipeline — делегирование спец-у (гард); T5 vm: [E]-оверлей без
«Сложить:/Вынуть:», put-0/take-0 == null, РОВНО 3 [data-buid] (RED
на базе); T6 vm: клик «Хранилище» — РОВНО 1 buildingUI-оверлей с
--storage и 2×.storage-col (гард). В T6 `overlayNodes` фильтрует
dungeon-overlay/npc-overlay (городской слой входа — своя подсистема,
не buildingUI). RED /tmp/000354-red.tap (fail ровно T1,T5) → GREEN
/tmp/000354-green.tap 6/6.

## Мутации (стейдж перед матрицей; git restore между; финал 6/6)

Срез M1/M2/M3 — 3 файла (новый + storage-panels-000313 +
building-levels), TAP /tmp/000354-m1..m3.tap, финальный зелёный
прогон /tmp/000354-m-final.tap (6/6):

- M1 вернуть put/take-строки в extraActions (симуляция старого
  storageMenuRows) — красные РОВНО 6: T1+T5 (новый тест) И ре-пины
  S7 + R11+R12+R14 (ловят возврат ленты — задумано); 36 зелёных.
- M2 `upgradeActionRow` → безусловный `return null` — красные 10:
  T3 (апгрейд-доказательство) + T1/T5/S7/R11/R12/R14 (3-id пины) +
  R15/R16/R17 (vm/магазин/ментор — общий upgradeActionRow).
- M3 убрать `layout:'storage'` из openOverlay (building-effect-
  storage.js) — красные 7: 000313-S2 (обязательный пин класса/
  колонок) + S3/S4/S5 (панель деградирует без layout) + S7
  (ADDITIVE layout-пин) + T2/T6 (layout-пины нового теста).

## Полный прогон (финал)

`node --test --test-concurrency=1 tests/` в worktree, гейт
`pgrep -x node|…|grep -c "node --test"` == 0 (двойная проверка через
20 с) взят в 03:34 после ~2.5 ч непрерывного удержания очереди:
волны 000321.05/000353/000359.01 гоняли файлы + оркестраторские
полные прогоны (000359, 000355) стартовали в каждый открывшийся
просвет — ждун побеждает только при пустой очереди. Результат:
4367/4367/0 = master 4361 + 6 новых, 21.3 мин,
/tmp/000354-full.tap; база подтверждена маркерами
«Шафран»/«D-pad невыделяем», W-08 sync-тест зелёный (дерево чистое
закоммиченное).

## Условия ре-пина для будущих задач

- Любая задача, возвращающая put/take-строки в [E]-меню, обязана
  ре-пинуть S7a/S7c, R11b, R12, R5, R8/R9 вставки и T1/T5 — иначе
  «лента без прокрутки» вернётся (это и был баг).
- 4-й NPC/новый эффект дома — на счёт строк [E]-менёк 55 НЕ влияет
  (у 55 NPC нет); но смена числа строк меню 55 ломает Т5-пин
  «РОВНО 3 [data-buid]» — пересчёт по диску.
- Удаление/перенос спец-а «storage» — синхронно с registration-
  вставками в building-levels.test.js и fixture storage-panels /
  city-storage / storage-e-double-open.

## Коллизии волн

Тронуты: src/building-actions.js (ОСТОРОЖНО: очередь task/000359 —
craftExecutor в src/building-effects.js, пересечения нет), тесты
city-storage/building-levels/storage-panels-000313 (+новый файл),
CHANGELOG (секция даты мержа), tasks, memory. 0-diff:
building-effects.js, building-ui.js, building-effect-storage.js,
cities.js, main.js, index.html, spec/, ассеты, сейв-формат.
