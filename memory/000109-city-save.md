# 000109 (кратко): раздел cities, city_respawn_days, обрезка, дни

Дубль-заключение главной записи
memory/000109-city-save-respawn.md (контракты/границы/ловушки —
там). Это — быстрые факты для параллельных задач.

## Раздел сейва `data.cities`

* Формат (контракт 000108, НЕ переименовывать):
  `{'cx,cy': { lastVisitDay: N, stock: { 'tx,ty': {itemId: qty} } }}`.
* `'cx,cy'` — ЯКОРЬ города (buildingAnchor, НЕ тайл входа);
  `'tx,ty'` — локальная клетка лавки (x/y shop-объекта 000108).
* Валидный: ключ — целые координаты (отрицательные возможны);
  lastVisitDay — целое ≥ 1; qty — целое ≥ 0 (0 = лавка продадена,
  легитимно). Мусор/не-объект/битый stock — тихий отброс записи
  (000029); битый раздел целиком — console.warn + сброс
  (игру не роняем).
* Пишется/читается в main.js (collectSaveData/restoreFromSave)
  через `G.Cities.serializeCityStates` /
  `G.Cities.restoreCityStates` (src/cities.js, чистые функции;
  restore — Map, паттерн restoreDayMap/restoreTeleports/
  restoreBuildingQuests из 000072).
* Версия сейва НЕ поднимается (v1, неломкое расширение —
  000031/000029; прецеденты quests/npcStocks/buildingOncePerDay).
* Состояние в памяти — `cityStates` Map (main.js), stock —
  LIVE-объекты; `__game.cities` — getter для 000107.
* ds.contents у города — null (состояние НЕ там — ловушка
  dungeon-ui.js:318 / __game.dungeon).

## city_respawn_days

* Новый параметр src/global-settings.js: **3** по умолчанию
  (int, min 1; «несколько игровых дней» — SPEC «Города и деревни»
  → «Состояние, сейв, респаун»; симметрия respawn_days=3,
  dungeon_memory_days=3).
* Есть запись в META (S1 «META 1:1» требует); ре-пин списка
  ключей — tests/global-settings.test.js (15 → 16).
* Семантика: при ВХОДЕ в город, если `day − lastVisitDay >=
  city_respawn_days` — ПЕРЕГЕНЕРАЦИЯ стока (новый полный сток,
  детерминированный — без соли по дню), иначе — восстановление
  из сейва; lastVisitDay = day при входе.

## Обрезка (мир бесконечен)

* Просроченные записи (`day − lastVisitDay >= city_respawn_days`)
  удаляются И при СЕЙВЕ (serializeCityStates), И при
  ВОССТАНОВЛЕНИИ (restoreCityStates) — «будущие»
  (lastVisitDay > day — подделка) тоже. onDay-очистки для городов
  НЕТ (fastForward при restore без слушателей — 000031; день
  города не тратится — 000105).

## Дни

* АБСОЛЮТНЫЕ (000031): сейв — снимок; fastForward НЕ оповещает
  onDay; restore сам сверяет записи с clock.day.
* «Раз в день»/респаун-формула — слой 000072
  (dueForRespawn `day − last >= respawnDays`, canUseToday,
  serializeDayMap/restoreDayMap) — свой слой НЕ изобретается;
  cities.js не требует day.js (require-пин perlin/items/buildings).

## save() false (квота)

saveNow (main.js) обрабатывает false-возврат save() (квота
localStorage) — console.warn ОДИН раз за сессию (флаг), падения
нет; confirm не нужен (только migration_failed/corrupt при
загрузке).
