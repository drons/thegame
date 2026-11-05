# 000300 — обучение у NPC: активный персонаж партии (Эфир/наёмные)

## Контракт
Школа NPC (вкладка «Школа» в npcUI) — обучается АКТИВНЫЙ персонаж
партии (000299.01/000299.02: closure `activeCharId` в ui.js + LIVE
`__game.state`, резолвер `activeSheetNow()`), а не всегда Флогистон:
Флогистон, Эфир (если встречен) или наёмный. Уровень навыка, лимит
`trainPoints` (000298: 10 за уровень, плоский сброс) и стоимость
(000296: 20 + 10·L², L — текущий уровень обучающегося) — ПО
ПЕРСОНАЖУ (обучающемуся). Золото — ВСЕГДА платит Флогистон (owner,
000299.03 — лист Эфира/наёмного БЕЗ поля `gold`; NaN-ловушка).
Клик по портрету при открытой «школе» — ин-плейс ре-рендер
уровней/цен (вкладка не переключается, оверлей не закрывается).

## Механика: payChar/owner (паттерн 000299.03)
`N.canSchoolTrain(npc, character, skillId, payChar)` и
`N.schoolTrain(npc, character, skillId, payChar)` — ХВОСТОВОЙ
ОПЦИОНАЛЬНЫЙ `payChar`, дефолт = character:
* `character` — ОБУЧАЮЩИЙСЯ: `character.secondary[skillId] += 1`,
  `character.trainPoints -= 1` (typeof-guard — поле отсутствует у
  чужих/битых объектов → лимит пропускается), цена —
  `schoolTrainPrice(npc, character, skillId)` (L — его уровень).
* `payChar` — ПЛАТИЛЬЩИК: `payChar.gold < price` → отказ
  «мало золота»; `payChar.gold -= price`.
Вызовы на 3 аргументах (npc.test.js-регресс A5) — бит-в-бит
(payChar = character = hero).
UI (src/ui.js): `renderTrainTab` — `trainChar = activeSheetNow()`:
строка «Свободные очки», уровни `trainChar.secondary[id]`, цена
`schoolTrainPrice(npc, trainChar, id)`, кэн-чек
`canSchoolTrain(npc, trainChar, id, c)` (c = hero — платильщик).
Клик «+ (N з)» — `G.schoolTrain(npc, activeSheetNow(), skill, c)`.
Ветка клика по портрету — `dialog | trade | train` (расширение
000299.02: без `train` — stale-уровни/цены после переключения).

## trainPoints — поле ЛЮБОГО листа (createSheet)
* src/sheet.js: ветка efir/merc createSheet — `trainPoints:
  TRAIN_POINTS_PER_LEVEL` (10) после `points` (hero-ветка — поле
  было с 000298; порядок ключей сейва героя НЕ тронут — trainPoints
  уже стоял). Лист Эфира — 11 ключей (10 → 11), merc-лист — 11
  ключей (10 → 11).
* Сброс — плоский в 10 в `Sheet.addXp` (typeof-guard, 000298):
  Эфир/наёмный на ап-левеле получают trainPoints = 10 (тест A4).
* Сейв (неломкое расширение v1, БЕЗ бампа — 000031):
  * src/efir.js serializeEfir — `trainPoints` после `points`;
    deserializeEfir: НОВЫЙ формат — absent/не-integer/вне 0..10 →
    10 (НЕ null — санация, прецедент sanitizeSavedHero 000298 L4);
    СТАРЫЙ формат (backfill) — trainPoints = 10.
  * src/companions.js copyMercSheet — УСЛОВНАЯ копия (typeof
    number → copas; absent → absent: hand-crafted литералы тестов
    без поля не приобретают его при сериализации — T1 sh(),
    000230.06 S1–S4 бит-в-бит). sanitizeMercSheet — ВСЕ
    runtime-листы получают поле (absent/невалидно → 10).

## Ловушки
* NaN-ловушка: лист Эфира/наёмного БЕЗ `gold` — payChar НИКОГДА не
  в мутациях (в UI payChar = c = hero; тесты:
  `efir.gold === undefined` / `merc.gold === undefined` после
  обучения).
* Лимит ПО ПЕРСОНАЖУ (решение D1): `canSchoolTrain` читает
  `character.trainPoints` — у hero trainPoints 0, а у активного
  Эфира 10 → обучение Эфира проходит (тест A2-mirror).
  Реверс (лимит по owner) — анти-паттерн: герой «съел» 10
  обучений — Эфир всё ещё обучается (и наоборот).
* copyMercSheet — УСЛОВНАЯ копия (НЕ безусловная): безусловная
  добавила бы trainPoints:10 в сериализацию hand-crafted-листов
  без поля → сломала бы T1 sh()/S1–S4 бит-в-бит.
* deserializeEfir — absent → 10 (НЕ null): null в состоянии
  сломал бы typeof-guard и UI-строку; 10 — дефолт нового листа.
* [I]-панель НЕ тронута (000300 — только школа в npcUI): строка
  «Очки обучения: N» (000298) — ТОЛЬКО hero-ветка
  src/ui-tab-skills.js; у Эфира/наёмного — 2-строчный
  статы-лейаут (уровень/опыт + «Свободные очки: points») БЕЗ
  строки обучения — остаток trainPoints активного (не Флогистона)
  НЕ отображается (000334 исправил ложный буллет «по листу
  вкладки (активному)»).

## Ре-пины (значения — по диску, R5)
* SPEC: spec/npc.md 26→37 (+11 блок «Обучение в школах (задача
  000300…)» в конец раздела «Школы (обучение)»), spec/companions.md
  203→211 (буллет «Обучение партии… ЯВНО вне этого контракта» 2
  строки → «Обучение в школах (000300…)» 10 строк, +8),
  spec/efir-spirit.md 147 — LINE-NEUTRAL (лейаут «(11 ключей)» +
  backfill «trainPoints — 10», 2 строки рефлоу, счёт 147).
* SPEC_FILE_LINES (tests/spec-split.test.js): npc 26→37,
  companions 203→211; efir-spirit 147 — НЕ тронут.
* memory/000143-merc-sheet.md §2.4 «Канонический merc-лист
  (10 ключей, порядок createSheet)» — ЗАМЕНЁН 000300 (канон —
  11 ключей: trainPoints после points); файл 000143 НЕ
  переписывается (исторический контракт); источник правды —
  src/sheet.js; ре-пины «10 ключей» → «11 ключей» исполнены 000334.
* Guard wording (companions/npc-пины): spec-000295-wording L88
  203→211 (title + assert), spec-000304-wording 203→211 (title +
  assert), spec-000296-wording npc 26→37, spec-000297-wording W1
  npc 26→37, spec-000298-wording ДВА guard npc 26→37 (S1 + S2).
* Лист-пины (10 → 11 ключей, trainPoints МЕЖДУ totalXp и xp в
  отсортированных списках — 'totalXp' < 'trainPoints' < 'xp'):
  tests/save.test.js (EFIR_SHEET_KEYS +1, backfilledEntry +train
  Points:10, 16 efir-литералов +trainPoints:10, «10 ключей»→«11
  ключей» ×11; sh() T1 и 000230.06 S1–S4 — БЕЗ изменений:
  условная копия), tests/efir-sheet.test.js (SHEET_KEYS +1,
  «10 ключей»→«11» ×10), tests/efir.test.js (2 inline-списка +1,
  title/×2 сообщения), tests/companions-sheet.test.js (CS-1
  канон +1, 10→11), tests/companions-cycle.test.js
  (backfilledEntry +1, level_up-литерал +trainPoints:10, 2
  комментария), tests/spellbook-oc-e2e.test.js (W-10b: 4
  expected-листа +trainPoints:10; seed miraSheet — БЕЗ изменений).
* Формула: trainPoints — 11-й ключ ЛЮБОГО листа; каждый
  full-deepEqual листа (efir/merc) в tests/ требует +trainPoints:10;
  условная копия copyMercSheet → serialize-only литералы без поля
  НЕ меняются.

## Тесты
RED 6b33777 → GREEN: tests/npc-party-training-000300.test.js
(10 тестов; Part A ядро: A1 schoolTrain(npc, efir, 'swordsman',
hero) — мутации по trainee + payChar (efir.secondary +1,
efir.trainPoints 10→9, hero.trainPoints 10 НЕТРОНУТ, hero.gold
100→80, efir.gold undefined); A2 лимит по обучающемуся (efir
trainPoints 0 → отказ reason; mirror: hero 0, efir 10 → ok);
A3 цена по обучающемуся (efir L2 → 60, hero L0 → 20, gold −60 с
hero); A4 trainPoints 10 у fresh efir/merc + плоский сброс в 10 на
ап-левеле; A5 hero-регресс 3-арг бит-в-бит; A6 merc-зеркало A1.
Part B vm-цепочка index.html БЕЗ main.js + seedWorld (NPC
arena_master): B1 train-таб активного efir — уровни/цены efir
(«+1 за 60 з»); B2 клик — efir +1 уровень, hero.gold −60,
efir.trainPoints 9, 0 console.error; B3 efir trainPoints 0 →
bTrain.disabled + title reason, hero-бюджет 10 нетронут; B4 клик
по портрету при открытой «школе» — ин-плейс ре-рендер (цена по
новому активному, вкладка не переключена, оверлей открыт).
tests/spec-000300-wording.test.js (W1 npc.md блок: активный/
trainPoints/ПО ПЕРСОНАЖУ/ВСЕГДА платит Флогистон/000299.03/
Sheet.addXp, guard 37; W2 companions.md буллет + neg-пин «ЯВНО
вне этого контракта» (заменён), guard 211; W3 efir-spirit.md
«Сейв»: trainPoints/«11 ключей»/«trainPoints — 10», guard 147 —
line-neutral).

## Ссылки
* ТЗ: tasks/done/000300.md; отчёт: tasks/result/000300.md.
* Родитель 000299: 000299.01 (активный + портреты), 000299.02
  (activeSheetNow + ин-плейс «диалог»), 000299.03 (priceChar/
  owner-паттерн — ОТПЕЧАТОК payChar). memory/000299.03-party-
  shop-prices.md.
* 000296 (квадратичная цена — formula НЕ меняется), 000297 (нет
  «Вернуть»), 000298 (trainPoints: лимит 10/уровень, плоский
  сброс, панель [I]).
* SPEC: spec/npc.md «Школы (обучение)» (блок 000300),
  spec/companions.md H2 «Активный персонаж» (буллет «Обучение в
  школах (000300)»), spec/efir-spirit.md «Сейв» (11 ключей).
