# 000029: журнал квестов и сток торговцев в сейве

Статус: выполнено и закоммичено (тесты 212 → 222 pass).

## Решения

* **Согласованность с датой** — штамп дня выдачи: `acceptQuest(book,
  npcs, npc, questId, day)` (day — опциональный) пишет `day` в инстанс
  квеста. При восстановлении `pruneQuestBookByDay(book, worldDay)`
  (чистая, `{book, dropped}`) отбрасывает активные квесты с `day >
  worldDay` + console.warn — «квест, выданный в будущем», противоречащий
  дате мира, не «чинится», а отбрасывается (прогресс `kill_group`
  терять осознанно).
* **Сток живёт в main.js**, не в NPC-объекте и не в ui.js: реестр
  `npcStocks[npcId]` + `npcShopFor(npcId)` создаёт сток один раз
  (`G.createNpcShop`) и держит его; диалог (ui.js) принимает `shop` и
  не пересоздаёт сток на сессию. NPC-данные каталога неизменяемы.
* **ui.js**: `open({shop, onChange, day})`; `onChange` вызывается после
  ЛЮБОГО мутирующего действия (покупка/продажа, прокачка, перенос,
  возврат, принятие/сдача квеста) — в main.js это `saveNow`. `day`
  передаётся в `G.acceptQuest`.
* **Поля сейва** — `quests` (serializeQuestBook) и `npcStocks`
  (serializeNpcStocks) — неломкое расширение v1: версия НЕ поднимается,
  миграция не нужна (правило 000031); сейвы без полей восстанавливаются
  как есть.
* **Невалидные разделы** — тихий сброс раздела + console.warn, игра не
  падает (принцип 000029): `deserializeQuestBook`/`restoreNpcStocks`
  бросаются только внутри try/catch restoreFromSave; `null` → журнал не
  тронут.
* **Валидация** (npc.js, чистое ядро): `deserializeQuestBook` — active
  объект инстансов (`questId === key`, `npcId` строка, status
  'active'|'ready', progress int ≥ 0, day int ≥ 1 при наличии), done —
  массив строк; любой дефект → null. `restoreNpcStocks` — qty clamp
  min(saved, initial), отрицательное → initial, «призрак»-предметы
  отбрасываются, неизвестный NPC / не-торговец пропускается.
* **Правки по итогам ревью — «битый сейв не роняет игру» (000029):**
  то же правило «призрак-предмет отбрасывается, а не падает» теперь
  применяется к ИНВЕНТАРЮ героя: `G.sanitizeInventory`/
  `G.sanitizeEquipment` (items.js) + `G.sanitizeSavedHero` (player.js)
  чистят персонаж из сейва до `Object.assign` (раньше слот с id,
  удалённым из каталога между сборками, давал `null.weight` в
  inventoryWeight при рендере панели и ронял старт — статус сейва
  при этом был 'ok', оболочка валидна).

## Тесты

tests/npc.test.js +10: штамп дня выдачи; serialize/deserialize журнала
(18 деформаций → null, мусор в done фильтруется); pruneQuestBookByDay
(граница, не-целой worldDay, чистота входа); defaultStock;
serialize/restoreNpcStocks; JSON-roundtrip; мусор из битого сейва.
