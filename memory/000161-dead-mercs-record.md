# 000161 — dead_mercs: запись {npcId, sheet, loyalty, hiredDay} вместо голого npcId (контракт D1)

Статус: РЕАЛИЗАЦИЯ завершена (2026-10-07): 1767/1767 зелёных;
ПРОЕКТИРОВАНИЕ завершено (2026-10-06). Worktree:
`.worktrees/task-000161`, ветка `task/000161`, база = master `6fcb664`
(чистая). Тест-базовая: **1758 pass / 0 fail** (мерена ВНУТРИ worktree,
memory/test-runner-worktrees.md — рекурсивный scan из корня подхватывает
чужие worktrees).
ТЗ: `tasks/pending/000161.md` (родитель 000156, ФУНДАМЕНТ воскрешения;
блокирует 000162/000164). Контракт D1: `memory/000156-resurrection-
design.md` §3.D1/§5/§9.5; лист: `memory/000143-merc-sheet.md` §2.1/
§2.4–§2.6; restore-паттерн: `memory/000085-save-party-efir.md`; тихий
сброс: 000029. SPEC.md УЖЕ обновлён мержем 000156 («Спутники → Сейв»
L770-781: форма записи + backfill «тихий сброс»; «Контракт и жалованье» —
«С СОХРАНЕНИЕМ уровня/опыта/лояльности»; пины spec-resurrection.test.js
зелёные) — в 000161 SPEC НЕ трогать (и в НЕ ТРОГАТЬ).

## 1. Что добавлено / перенесено

Новых модулей/require/script-тегов НЕТ — правки в существующих
src/companions.js + src/main.js + тесты.

### 1.1 src/companions.js (2 новых экспорта + адаптер, регион сериализации)

1. **`serializeDeadRecord(entry) → record | null`** (ВСТАВКА: сразу ПОСЛЕ
   `serializeRoster`, L719 — рядом с близнецом). Реализация — REUSE:
   `const s = serializeRoster([entry]); return s.length ? s[0] : null;`
   * Чистая проекция ровно 4 полей `{npcId, sheet, loyalty, hiredDay}`;
     sheet — СВЕЖАЯ глубокая копия (copyMercSheet — fresh-copy-пин
     T1/CS-5 наследуется).
   * entry не-объект / без строки npcId / БЕЗ sheet (инвариант-нарушение,
     в игре недостижимо) → **null** (тихий skip serializeRoster). Тихая
     (0 console). Валидный runtime-entry (6 ключей) → ВСЕГДА non-null.
2. **`reviveEntryFromRecord(npcs, raw) → entry | null`** (ВСТАВКА: сразу
   ПОСЛЕ `deserializeRoster`, L823 — рядом с близнецом). Единственная
   точка нормализации «запись о погибшем → RUNTIME-запись отряда»;
   принимает **string | record**; возвращает RUNTIME-запись 6 ключей
   `{npcId, sheet, level, xp, loyalty, hiredDay}` (зеркала =
   sheet.level/sheet.xp) | null. Тихая (0 console) — warn печатает
   main.js по bad-списку. Полная таблица решений — §2.2.
   * Ключевые решения: backfill string = `createMercSheet(npc)` +
     loyalty 50 + hiredDay 0 (тихий сброс 000029, данные утрачены до
     появления воскрешения); подделанный record (битое ядро sheet / нет
     sheet / битые loyalty·hiredDay) → **null** (DROP — сброс ЗАПИСИ,
     НЕ починка значения — 000085/000143); hiredDay — finite ≥ 0
     (0 — легитимный sentinel backfill; гейт ≥ 1 из deserializeRoster
     НЕ переносить).
3. **`candidatesForTavern(npcs, roster, deadMercs)`** — АДАПТЕР двух
   форматов (ТЗ п.4), Л402:
   `const dead = new Set((deadMercs || []).map((r) => (typeof r ===
   'string' ? r : r && r.npcId)).filter((id) => typeof id ===
   'string'));`
   * Принимает ОБА формата (строки — legacy/тест-фикстуры G2/U3 +
     записи — runtime + транзиентный fallback). Мусор (42, объект без
     строки npcId) — отфильтрован, не падает.
   * Инвариант «повторный найм после гибели нельзя» (D1) СОХРАНЯЕТСЯ:
     record.npcId в deadMercs → отфильтрован; возврат — только
     воскрешением (000162). ui.js L667 — passthrough live-ссылки,
     правки ui.js НЕ требуются (и НЕ трогаем).
4. **Return-объект (L825-837)**: + `serializeDeadRecord`,
   `reviveEntryFromRecord` в группе «Сериализация отряда» (коммент
   «Фундамент воскрешения (000161, D1 000156): запись о погибшем
   наёмнике»).
5. **Шапка модуля (L19-30)**: дополнить — форма dead_mercs = массив
   записей 4 полей (000161, D1); backfill — тихий сброс 50/0; зеркала —
   «ровно 4 точки» (L23-24) + L416 «ровно 3 точки» → «ровно 4 точки
   (000161: + reviveEntryFromRecord)» + L625 «3 точки» → «4 точки»
   (технические комменты; пин на текст комментов НЕТ).

### 1.2 src/main.js (3 точки кода, остальное — комменты)

1. **`combatEndCompanions` (L421-449, тело гибели L439-446) — ГЛАВНАЯ
   ПРАВКА (ТЗ п.2)**: гибель мерса → ЗАПИСЬ вместо голого id:
   ```
   if (u.side === 'ally' && u.kind === 'merc' && !u.alive) {
     const i = roster.findIndex((e) => e && e.npcId === u.id);
     if (!deadMercs.some((r) => (typeof r === 'string' ? r :
         r && r.npcId) === u.id)) {
       let rec = (i !== -1 &&
           typeof G.companions.serializeDeadRecord === 'function')
         ? G.companions.serializeDeadRecord(roster[i]) : null;
       if (rec == null) rec = u.id;
       // rec == null: entry без sheet — инвариант-нарушение,
       // в игре недостижимо — голый id (backfill при restore, 000029).
       deadMercs.push(rec);
     }
     if (i !== -1) roster.splice(i, 1);
     deadLines.push(npcName(u.id) + ' погиб в бою.');
   }
   ```
   * Serialize ПЕРЕД splice (entry обязан быть ещё в roster).
   * Дедуп — по npcId (string|record-адаптер, first-wins — 000085);
     splice — ВСЕГДА (как сейчас, снаружи dedup-if).
   * Литерал `deadMercs.push(` СОХРАНЕН (пин S2 L465 — НЕ
     индексное присваивание). Строка «<имя> погиб в бою.» и порядок
     xpLines→deadLines — БИТ-В-БИТ.
   * Fallback на голый id (НЕ на базовую запись): деградация =
     бит-в-бит пре-000161 поведение при отсутствии экспорта (000038);
     в игре недостижимо.
2. **`restoreFromSave`, блок dead_mercs (L871-903) — ВТОРАЯ ГЛАВНАЯ
   ПРАВКА (ТЗ п.3)**: ОБА формата через пайплайн revive → serialize.
   Структура 000085 СОХРАНЯЕТСЯ: свой try/catch, warn-сообщения БЕЗ
   ИЗМЕНЕНИЙ, мутация in place (`deadMercs.length = 0; for … push`),
   live-ссылка. Тело:
   ```
   const rawD = d.dead_mercs;
   if (rawD != null) {
     if (!Array.isArray(rawD)) {
       console.warn('Сейв: раздел dead_mercs некорректен — сбрасываю.');
       deadMercs.length = 0;
     } else {
       const canRevive = hasCompanions &&
         typeof G.companions.reviveEntryFromRecord === 'function' &&
         typeof G.companions.serializeDeadRecord === 'function';
       const kept = [];      // записи 4 полей (деградация: legacy-строки)
       const bad = [];
       const keptIds = new Set();
       for (const it of rawD) {
         const id = typeof it === 'string' ? it
           : (it && typeof it === 'object' && !Array.isArray(it) &&
              typeof it.npcId === 'string') ? it.npcId : null;
         if (id == null) continue; // мусор — тихий skip (как не-строка)
         const npc = NPCS.find((n) => n && n.id === id &&
           n.найм && typeof n.найм === 'object');
         if (!npc || keptIds.has(id)) { bad.push(id); continue; }
         let rec = null;
         if (canRevive) {
           const e = G.companions.reviveEntryFromRecord(NPCS, it);
           rec = e ? G.companions.serializeDeadRecord(e) : null;
           if (rec == null) { bad.push(id); continue; } // подделка — сброс
         } else if (typeof it === 'string') {
           rec = it; // деградация (нет экспорта): legacy-путь бит-в-бит
         } else {
           bad.push(id); continue; // record без модуля — не восстановить
         }
         keptIds.add(id);
         kept.push(rec);
       }
       deadMercs.length = 0;
       for (const rec of kept) deadMercs.push(rec);
       if (bad.length) {
         console.warn('Сейв: dead_mercs — неизвестные/дубли npcId: ' +
           bad.join(', '));
       }
     }
   }
   ```
   * backfill string → запись через revive+serialize: `{npcId,
     sheet: createMercSheet(npc), loyalty: 50, hiredDay: 0}`.
   * record → sanitize (revive) → запись 4 полей (fresh-копия sheet).
     Валидный record round-trip'ится БЕЗ ПОТЕРЬ.
   * Подделка (битое ядро sheet / нет sheet / битые loyalty·hiredDay)
     → bad[] + warn (сообщение НЕ меняется — bad = список id, причина
     одна для всех — как сейчас ghost+дубли) → запись ИЗ dead_mercs
     ОТБРАСЫВАЕТСЯ (§2.5-решение).
   * Призрак (id не в каталоге по критерию найм-объекта — self-cleaning
     000085) / дубли — bad+warn (first-wins). Мусор (не string, не
     объект-с-строкой-npcId) — тихий skip.
   * `canRevive`-деградация: в игре недостижимо (companions.js всегда в
     index.html ДО main.js); в vm-тестах со срезанной цепочкой —
     legacy-путь бит-в-бит; try/catch — страховка (catch-сообщение
     «не удалось восстановить dead_mercs:» без изменений).
3. **`collectSaveData` (L641) — КОДА НЕ ТРОГАТЬ**: `dead_mercs:
   deadMercs.slice()` — «форма без изменений» (ТЗ п.5): live-массив =
   массив записей. Только коммент L628-635: «…и погибшие наёмники
   (записи, 000161)».
4. **Комменты (технические, прецедент 000143)**: L381 `// [npcId]
   погибших` → `// записи {npcId, sheet, loyalty, hiredDay} погибших
   (000161, D1)`; шапка combatEndCompanions L411-420 («→ deadMercs-
   запись (окончательно, dedup по npcId; serializeDeadRecord, 000161)»);
   L1486 deps-бандл `deadMercs, // live Array [npcId]` → `// live Array
   записей (000083/000085/000161)`; L2558-2559 smoke-state «live-массив
   npcId» → «live-массив записей»; restore L871-877 («массив записей +
   legacy-строки (backfill: новый лист из каталога, loyalty 50,
   hiredDay 0 — тихий сброс 000029; подделка — сброс записи, 000161)»).
   Скан-пины на эти строки: W2 (building-actions) проверяет
   идентификаторы, НЕ комменты → безопасны.

### 1.3 НЕ ТРОГАТЬ (границы)

* **index.html — БЕЗ ИЗМЕНЕНИЙ** (правки внутри существующих тегов
  L772 companions.js / L914 main.js). **tests/index-order.test.js —
  новых пинов НЕТ.**
* **CSS/SVG — НЕТ** (UI воскрешения — 000162).
* combat.js (000155/000164/000167 — чужие), efir.js, ui.js (000145),
  building-*, SPEC.md, assets/*, CHANGELOG.md — без изменений.
* **collectSaveData — код** (только коммент); CURRENT_VERSION = 1,
  MIGRATIONS = {} (пин save.test.js L49-53) — без изменений (000031).
* Эфир — НИКОГДА в deadMercs (инвариант 000087; фильтр
  `u.kind === 'merc'` в combatEndCompanions — не тронут; пин V5 L764 —
  технический репин в `.some((d) => d.npcId === 'efir')`, семантика
  та же, §5-3).
* allyDataForEntry (D7-шов 000167, L660-682), очередь хода combat.js
  (000167) — дифф 000161 держится в РЕГИОНЕ СЕРИАЛИЗАЦИИ (L684-837) +
  1 строка candidatesForTavern (L400-405) — текстово не пересекается.
* Потребители deadMercs: candidatesForTavern (значения) + pass-through
  (building-actions L129 → ui.js L667, deps-бандл L1486, smoke-state
  L2560) — форма pass-through'ов не важна; скан-пины W1 (live-ссылка)/
  W2 (идентификаторы) — сохраняются.
* combat.js НЕ читает deadMercs (доля 50% allyXp — от livingAllies).
* loot-e2e-пин: `combatEndLoot` — сразу ПОСЛЕ `combatEndCompanions` —
  хелпер НЕ переносить (вставка кода ВНУТРИ тела — ок).
* S1/S3/S4-сканы (onDay/rosterData/squadUI) — НЕ ТРОНУТЬ.

## 2. Контракты и границы (D1-исполнение)

### 2.1 Форма данных — КЛЮЧЕВОЕ

**Live-массив `deadMercs` (main.js, const L381) — массив записей СЕЙВ-
формы, ровно 4 поля `{npcId, sheet, loyalty, hiredDay}`** (форма
serializeRoster, 000143) — НЕ runtime-записи 6 ключей. Основание: D1
(«запись … ровно 4 поля serializeRoster … кладётся в deadMercs») +
collectSaveData `slice()` без изменений → форма сейва НЕ меняется.
Следствия:
* level/xp ВНУТРИ sheet (в записи-4-поля зеркал НЕТ);
* цена храма (000162) — `record.sheet.totalXp` — читается напрямую;
* голой строке в live-массиве место ТОЛЬКО как транзиентный fallback
  (деградация serialize — недостижимо в игре) + в vm-тестах с
  canRevive-деградацией; при restore string backfill'ится в запись.
* Валидный record round-trip'ится БЕЗ ПОТЕРЬ: restore → тот же record
  (чистка полей sanitizeMercSheet, ядро — как есть) → save → тот же
  record; version 1.
* Неломкое расширение (000031): старый сейв (строки) грузится, новый
  (записи) — грузится; обратного пути нет (первый save после load
  пишет записи) — паттерн 000143 «непрерывность».

### 2.2 `reviveEntryFromRecord(npcs, raw)` — таблица решений

```
id = (typeof raw === 'string') ? raw
     : (raw объект-не-массив, typeof raw.npcId === 'string') ? raw.npcId
     : null
id == null                        → null   (мусор: null/42/массив/
                                            объект без строки npcId —
                                            тихий skip, как не-строка
                                            в restore 000085)
npcForEntry(npcs, {npcId:id})
  → null (нет в каталоге / найм-данных — призрак) → null
raw — string (legacy, ДАННЫЕ УТРАЧЕНЫ — тихий сброс 000029):
  sheet   = createMercSheet(npc)   // НОВЫЙ лист из каталога найма:
                                   // level 1, xp 0, totalXp 0, points 0,
                                   // primary = базовые_характеристики,
                                   // secondary = начальные_навыки
                                   // (int ≥ 1), spells — каталог
  loyalty = 50, hiredDay = 0       // документированные значения
                                   // (SPEC «Спутники → Сейв» L777-779)
raw — record (объект):
  sheet   = sanitizeMercSheet(raw.sheet, id)
  sheet == null (ЯДРО: не-объект/массив, kind≠'merc', npcId≠,
    level не int≥1, xp не finite≥0, primary не 6× finite≥1;
    ИЛИ sheet отсутствует/null) → null   // ПОДДЕЛКА — сброс ЗАПИСИ
  loyalty не finite → null               // 000085: битое число →
  hiredDay не finite ИЛИ < 0 → null      //   запись в dropped (не
                                         //   чиним значение)
  loyalty = clamp(0..100, без округления — 77.5 валиден, прецедент
    deserializeRoster); hiredDay = floor (2.7 → 2; 0 → 0)
Возврат: { npcId: id, sheet, level: sheet.level, xp: sheet.xp,
           loyalty, hiredDay }  // зеркала (000143 §2.1)
```

* Чистка ПОЛЕЙ (secondary/skillXp/spells/totalXp/points) — запись
  ЖИВЁТ (sanitizeMercSheet, 000143 §2.6): чужой id навыка
  отфильтрован, totalXp −1 → xp (инвариант totalXp ≥ xp), points
  дробное → 0.
* Тихая (0 console) — warn печатает main.js по bad-списку.
* **Зеркала level/xp — 4-я легитимная точка их происхождения**
  (000143 §2.1: hire, applyCombatXp-lazy-backfill, deserializeRoster,
  + reviveEntryFromRecord). Другой код e.level/e.xp НЕ пишет.

### 2.3 Backfill string → record (тихий сброс, 000029 — ЗАДОКУМЕНТИРОВАНО)

`'merc_baldor'` → `{npcId:'merc_baldor', sheet: createMercSheet(baldor),
loyalty: 50, hiredDay: 0}`. Почему 50/0: данные (лояльность/день
найма) УТРАЧЕНЫ до появления функции воскрешения — старые сейвы
предшествовали ей (SPEC L778-779: «данные утрачены до появления
воскрешения»); 50 = базовая лояльность найма (SETTINGS
companion_loyalty.start-паттерн), 0 = «день неизвестен». Детерминизм:
каталог + константы, ноль новых RNG.

### 2.4 `hiredDay` — finite ≥ 0 (НЕ ≥ 1)

0 — ЛЕГИТИМНЫЙ sentinel backfill-записи. ГЕЙТ `hiredDay ≥ 1` из
deserializeRoster (L794-797) ПЕРЕНОСИТЬ НЕЛЬЗЯ: backfill пишет
hiredDay = 0, и при переносе гейта каждый следующий restore отбрасывал
бы легитимную backfilled-запись (тихая потеря прогрессии — regression).
Валидация record-формы dead — СВОЯ (sheet — sanitizeMercSheet; loyalty
— finite → clamp; hiredDay — finite ≥ 0 → floor): deserializeRoster
НЕЛЬЗЯ реюзить целиком (гейт hiredDay противоречит backfill).

### 2.5 Подделанный record → DROP (решение, открытое в D1)

Битое ядро sheet / отсутствие sheet / битые loyalty·hiredDay →
`reviveEntryFromRecord` → null → restore: id в bad[] + СУЩЕСТВУЮЩИЙ
warn «Сейв: dead_mercs — неизвестные/дубли npcId: …» → запись
УБИРАЕТСЯ из dead_mercs (НЕ чинится, НЕ сбрасывается до базовой).
Почему (рассматривалась альтернатива «сброс до базовой записи
каталог-sheet/50/0 — запись живёт», отклонена):
1. SPEC L781 «невалидные записи — тихий сброс (паттерн 000029)» —
   канон-гloss 000085 (memory L63-64): «сброс ЗАПИСИ, а не починка
   значения; не выдумывать фолбэки вместо прогрессии».
2. D1 формулирует «sanitize через deserializeRoster/sanitizeMercSheet»
   — контракт sanitize (000143 §2.6): битое ядро → null.
3. Прецедент 000143 roster: битое ядро → dropped, БЕЗ fallback.
4. Подделка недостижима в игре (записи пишет только наш код); ручная
   подделка сейва с битым sheet ≡ удалённой записи — drop не создаёт
   нового вектора читов сверх «запись удалена» (наёмник и так
   нанимался бы заново).
Ghost (npcId не в каталоге) — drop+warn, как 000085.
String-кейс — ОТДЕЛЬНО (backfill, §2.3): строка = ЛЕГИТИМНЫЙ старый
формат, не подделка.

### 2.6 Дедуп и порядок

* combatEndCompanions: `.some((r) => (typeof r === 'string' ? r :
  r && r.npcId) === u.id)` — first-wins; не дублирует при смешанных
  форматах (string-fallback + record одного npcId).
* restore: `keptIds` Set, first-wins; дубль → bad[]+warn (000085).
  Порядок валидных — порядок сейва (как сейчас).

## 3. Ленивые ссылки и guards (деградация 000038/000053)

* Новых require НЕТ: обе функции живут в замыкании factory
  companions.js и читают только существующие внутренние (serializeRoster,
  copyMercSheet, createMercSheet, sanitizeMercSheet, npcForEntry) +
  G.Sheet (уже прогварден при загрузке L109-114). Node-тест
  (API-поверхность) и BROWSER_CHAIN (companions.test.js L149-155) — без
  изменений; 000038-ловушка (взаимные require) не задета.
* main.js: `typeof G.companions.serializeDeadRecord === 'function'` в
  combatEndCompanions (fallback на голый id — бит-в-бит legacy) и
  `canRevive` (hasCompanions + оба typeof) в restore (string → legacy
  бит-в-бит; record → bad+warn). Guard СТОИТ в моменте ВЫЗОВА (лениво),
  не при загрузке.
* createMercSheet — свой guard каталога (базовые_характеристики
  повреждены → 1 + console.error ОДИН РАЗ — деградация 000038/000053;
  в игре недостижимо — 000141 гарантирует полноту): backfill наследует.
* В игре деградации недостижимы: companions.js в index.html ДО main.js
  (L772 → L914), каталог найма полон (000141: 6 наёмников, у всех
  полные найм-данные — проверено).

## 4. Что важно будущим задачам (из ссылок ТЗ, D1/§5/§9.5)

* **000162 (храм — воскрешение, БЛОКИРУЕТСЯ этой задачей):**
  * Пикер — список `{record, цена}` из `state.save.dead_mercs`
    (снимок) / live `deadMercs`; цена — `round(база + за_опыт ×
    record.sheet.totalXp)` (параметры `база`/`за_опыт` — каталог
    постройки `особые_параметры.воскрешение`, 000053).
  * Подтверждение: cap `max_companions` (3) — roster полон → ОТКАЗ;
    запись удаляется из live deadMercs — МУТАЦИЯ length/push
    (ПЕРЕЗАПИСЫВАТЬ нельзя — const-ссылка, deps-бандл/npcUI держат
    ссылки, 000085); roster — rehydrate через
    `G.companions.reviveEntryFromRecord(NPCS, record)` → готовая
    runtime-запись 6 ключей с зеркалаМИ (не собирать вручную — единая
    точка, §2.2); лояльность/жалованье воскрешённого — из записи
    (D7: hiredDay сохранён; жалованье — существующая механика смены дня).
  * Эфир воскрешению НЕ подлежит (не в deadMercs, D4.3).
* **000164 (partyLost — гибель Флогистона, БЛОКИРУЕТСЯ):** при
  `res.partyLost` — ВСЕ записи roster (не только !alive-юниты) →
  `serializeDeadRecord` → deadMercs (тот же хелпер/дедуп) + splice +
  строки «X погиб в бою.»; без partyLost — бит-в-бит (пин S2).
* **000163/000165 (боевое воскрешение):** действует на юниты боя
  (c.units / окно смерти) — к dead_mercs НЕ обращается; контракт
  этой задачи для них — только «record несёт всё для воскрешения»
  (round-trip §2.1).
* **000167 (параллельно, очередь хода + D7-шов):** держим дифф в
  регионе сериализации (L684-837) + candidatesForTavern (L400-405);
  их шов — allyDataForEntry (L660-682) — не пересекается; при
  add/modify-конфликте в companions.js — РЕБЕЙЗ на актуальный master
  (обязателен против 000167 и 000155). API_KEYS-репин при мерже —
  слить наборы ключей (оба репилят один массив).

## 5. Подводные камни

1. **hiredDay 0 ≠ «битое»**: НЕ реюзить deserializeRoster (гейт ≥ 1)
   — backfilled-запись отбрасывалась бы на каждом restore (тихая
   потеря). Валидация dead-record — своя (§2.4). Пин-тест: round-trip
   legacy → record (hiredDay 0) → save → restore → запись на месте
   (T4/T8).
2. **API_KEYS-репин 15 → 17** (tests/companions.test.js L166-171:
   + 'reviveEntryFromRecord', + 'serializeDeadRecord' — алфавитно):
   НЕ перечислен в ТЗ-«Тесты», но ОБЯЗАТЕЛЕН (deepEqual Object.keys
   L179 + vm-ассерт L709 — один массив покрывает оба). Прецедент
   ре-пинов в том же файле L157-165.
3. **V5 L764 `.includes('efir')` — РЕПИН ОБЯЗАТЕЛЕН** в
   `.some((d) => d.npcId === 'efir')`: с объектами `.includes`
   всегда false — тихий green с СЛОМАННОЙ семантикой (ассерт-призрак).
4. **S2-пин (companions-cycle L465)** `hwin.includes('deadMercs.push(')`
   — сохранить литерал `deadMercs.push(rec)` (НЕ
   `deadMercs[deadMercs.length] =`); окно хелпера до «// Задача
   000093:» не меняется; якоры applyCombatXp/allyXp/«повысил
   уровень»/«погиб в бою.» — на месте. S2 ПРОХОДИТ БЕЗ ПРАВОК.
5. **String-адаптер candidatesForTavern ОБЯЗАТЕЛЕН**: G2
   (companions.test.js L1268-1276) и U3 (npc-hire-ui L492-510) —
   deadMercs ГОЛЫМИ строками — остаются зелёными БЕЗ правок (запрет
   семантических правок + «всё существующее зелёное»).
6. **Warn-сообщения БЕЗ ИЗМЕНЕНИЙ**: «Сейв: dead_mercs —
   неизвестные/дубли npcId: …» (подделка тоже попадает в bad — одна
   причина для всех), «раздел dead_mercs некорректен — сбрасываю.»,
   «Сейв: не удалось восстановить dead_mercs: …». Пин T6 L1032-1033
   ('dead_mercs' + 'ghost_dead') — без правок.
7. **V5-репин: лист** — seed V5 — СТАРАЯ 5-полевая форма → на restore
   backfill (sheet — каталог L1/xp 0/totalXp 0/points 0) → запись
   при гибели = {sheet: каталог-лист, loyalty: 65, hiredDay: 2}
   (loyalty/hiredDay — из seed-записи, НЕ 50/0 — это запись отряда,
   не legacy-строка). Билдер — backfilledEntry (L366) → 4 поля.
8. **Флейки vm-e2e**: при случайном падении ЧУЖОГО теста — перепуск
   `node --test tests/<файл>` + запись в отчёт (memory/test-runner-
   worktrees.md).
9. **Мерить тесты только ВНУТРИ worktree** (npm test из корня
   /home/sas/Documents/Art/thegame подхватит чужие worktrees).
10. **НИКАКИХ push в remote**; основной репозиторий — только чтение;
    чужие worktrees не трогать; .merge-pending НЕ создавать (стадия
    мержа).

## 6. Тесты (красные → зелёные)

### 6.1 Красные (НОВЫЕ) — expectedRedCount = 9

* **tests/dead-mercs.test.js** (НОВЫЙ ФАЙЛ, node; require
  companions.js + npc-data.js — паттерн companions.test.js):
  * DM-1 `serializeDeadRecord`: ровно 4 поля (Object.keys().sort()
    deepEqual ['hiredDay','loyalty','npcId','sheet']), значения =
    entry; fresh-copy (мутация entry.sheet.xp — снапшот не меняется);
    без sheet → null; мусор (null/42/массив/без npcId) → null; тихая
    (0 console.warn/error). Краснота: экспорта НЕТ.
  * DM-2 `reviveEntryFromRecord` (record): валидный → 6 ключей,
    зеркала = sheet.level/sheet.xp; loyalty clamp (150→100, −5→0,
    77.5→77.5); hiredDay floor (2.7→2), **hiredDay 0 → 0**; чистка
    полей (чужой id secondary отфильтрован, totalXp −1 → xp, points
    дробное → 0). Краснота: экспорта НЕТ.
  * DM-3 backfill string: 'merc_volk' → entry: sheet = канонический
    merc-лист каталога (level 1, xp 0, totalXp 0, points 0, primary/
    secondary/spells — найм-каталог 000141), loyalty 50, hiredDay 0,
    зеркала 1/0. Краснота: экспорта НЕТ.
  * DM-4 подделки/мусор → null (тихий сброс): sheet kind ≠ 'merc';
    sheet.npcId ≠ record.npcId; primary неполное; sheet level 0;
    sheet null/отсутствует; record.loyalty NaN/'x'; record.hiredDay
    NaN/−1; ghost string; ghost record; null/42/массив/объект без
    npcId → null. Тихая (0 console). Краснота: экспорта НЕТ.
  * DM-5 round-trip: entry (6 ключей) → serializeDeadRecord →
    reviveEntryFromRecord → deepEqual entry (D1: «запись несёт всё
    для воскрешения»). Краснота: экспорта НЕТ.
  * DM-6 candidatesForTavern-адаптер: [{npcId:'merc_rena',…}] → rena
    отфильтрован; ['merc_rena'] → отфильтрован; микс [record,
    'merc_baldor'] → оба; мусор в списке — не падает; остальные
    кандидаты — порядок каталога; roster-фильтр независим; «повторный
    найм после гибели — НЕЛЬЗЯ» (пин ТЗ). Краснота: `new Set` держит
    объекты, `dead.has(n.id)` = false → мёртвый В кандидатах.
* **tests/npc-hire-ui.test.js** — НОВЫЙ тест (U10, VM-цепочка):
  npcUI.open с `deadMercs: [record('merc_rena')]` (+ roster) → вкладка
  «найм»: строк/кнопок «нанять» по merc_rena НЕТ; остальные — порядок
  каталога. Краснота: то же, что DM-6 (ui.js L667 → Set объектов).
* **tests/save.test.js** — НОВЫЕ тесты (VM, bootWithSave):
  * T7 round-trip НОВОГО формата: seed `dead_mercs: [record('merc_
    baldor')]` (канон. sheet, loyalty 77, hiredDay 3) → state.deadMercs
    = [та же запись (sanitized)] → beforeunload → saved.data.dead_mercs
    deepEqual записи; saved.version = 1. Краснота: restore L887
    typeof-гвард молча дропает записи → [].
  * T8 round-trip СТАРОГО формата: seed `['merc_baldor']` →
    state.deadMercs = [backfilled record 50/0] → save → [та же запись]
    (НЕ строка); version 1. Краснота: backfill не существует → строки.

### 6.2 Технические репины (семантика БЕЗ изменений)

* **tests/companions.test.js**: API_KEYS L166-171 +2 (один массив —
  оба ассерта L179/L709); G2 (L1268-1276, string-фикстура) и
  candidatesForTavern-тесты (L611-655) — БЕЗ ПРАВОК (адаптер).
* **tests/companions-cycle.test.js V5 (L734-784)**:
  * L760-761 `deepEqual(host(g.state.deadMercs), ['merc_volk'])` →
    `[{npcId:'merc_volk', sheet: backfilledEntry({npcId:'merc_volk',
    level:1, xp:0, loyalty:65, hiredDay:2}).sheet, loyalty: 65,
    hiredDay: 2}]`;
  * L764 `!…includes('efir')` → `!host(…).some((d) => d.npcId ===
    'efir')` (§5-3);
  * L774 `saved.data.dead_mercs` → та же запись;
  * L768-769 (HUD «погиб в бою.»), L778-781 (повторный найм — НЕЛЬЗЯ
    на live-записях) — БЕЗ ПРАВОК (адаптер — e2e-проверка).
  * S2 (L454-466) — БЕЗ ПРАВОК (якоры на месте).
* **tests/save.test.js**:
  * T4 (L921-980): seed НЕ трогать (['merc_baldor'] — вход старого
    формата); L952-953 → [backfilled record baldor (50/0)]; L979 →
    та же запись (roundtrip legacy→record). Билдер — от
    backfilledEntry (L676): `{npcId, sheet: e.sheet, loyalty: 50,
    hiredDay: 0}`.
  * T6 (L1012-1063): seed НЕ трогать; L1049-1050 → [backfilled record
    rena (50/0)]; L1062 → та же запись; warn-ассерт L1032-1033,
    42-тихий-skip, дубль — БЕЗ ПРАВОК.
  * T5 (старый сейв → []) — БЕЗ ПРАВОК.
* **tests/npc-hire-ui.test.js U3** (L492-510, string-фикстура) — БЕЗ
  ПРАВОК (адаптер).
* **НЕ ТРОГАТЬ**: tests/combat.test.js, spec-resurrection.test.js
  (SPEC-ассерты — зелёные после 000156), building-actions W1/W2,
  city-interact, index-order, sheet, npc-data, main-visuals,
  npc-hire.test.js (цепочка без companions.js).

### 6.3 Итоги прогонов

* **Красный прогон (2026-10-06, стадия красных, worktree, `npm test`):
  1767 тестов = 1758 pass + 9 fail; падают ТОЛЬКО новые DM-1..6
  (tests/dead-mercs.test.js), U10 (npc-hire-ui), T7/T8 (save.test.js) —
  осмысленно: DM-1..5 — экспорта НЕТ (typeof ≠ function); DM-6/U10 —
  поведение: `new Set(deadMercs)` держит ОБЪЕКТЫ → `dead.has(n.id)`
  false → мёртвый В кандидатах; T7 — typeof-гвард restore молча дропает
  запись → `[]`; T8 — backfill не существует → строка остаётся строкой.
  Остальные 1758 (включая save T4/T5/T6, companions-cycle S1-S4/V1-V5,
  companions G2/G3 + API_KEYS-15, npc-hire-ui U1-U9, spec-resurrection,
  index-order, main-visuals) — ЗЕЛЁНЫЕ; флейков не было (прогоны:
  полный ×1 94.8 c + прицельные по трём файлам).
* **Зелёный прогон (2026-10-07, стадия реализации, worktree, `npm
  test`): 1767 тестов = 1767 pass + 0 fail (88.9 c); флейков НЕ
  было (прогоны: полный ×1 + прицельные 5 файлов: dead-mercs 6/6,
  save 47/47, npc-hire-ui 10/10, companions 55/55, companions-cycle
  9/9). Красные → зелёные: DM-1..6 (экспорты + адаптер), U10
  (adapter в vm-цепочке), T7/T8 (restore revive→serialize +
  backfill); репины зелёные: API_KEYS 15→17, V5 (запись volk
  65/2 + .some d.npcId==='efir'), T4/T6 (backfilled-записи 50/0).
  Базовые 1758 (кроме репинов — T4/T6/V5/API_KEYS) — без правок,
  зелёные (S2/G2/U3/T5/T6-warn-ассерты — без правок, §5-4..7).

## 7. Решения (фиксируются — для ревью)

| # | Вопрос | Решение | Почему (1 строка) |
|---|---|---|---|
| R-1 | Форма live deadMercs | записи 4 полей (форма сейва), не runtime-entry 6 ключей | D1: «ровно 4 поля serializeRoster кладётся в deadMercs»; collectSaveData slice() без изменений → форма сейва не меняется (ТЗ п.5) |
| R-2 | 3-й экспорт deserializeDeadMercs(npcs, raw) (a3) или 2 экспорта (D1) | **2 экспорта** (serializeDeadRecord + reviveEntryFromRecord); restore compose'ит revive→serialize в main.js | D1/ТЗ называет ровно 2 API («не больше и не меньше»); ВСЕ bullets ТЗ-«Тесты» node-тестируемы через 2 экспорта (backfill = revive(string)+serialize; подделка = revive(record) → null); array-семантика (ghost/дубли/порядок) — vm-пины T4/T6/T7/T8; inline-restore паттерн 000085 и warn-сообщения сохраняются бит-в-бит |
| R-3 | Подделанный record: DROP или сброс до базовой записи (каталог/50/0) | **DROP** (null → bad[] + существующий warn) | SPEC «невалидные записи — тихий сброс» + 000085-gloss «сброс ЗАПИСИ, а не починка значения; не выдумывать фолбэки» + 000143 «битое ядро → dropped, без fallback» + D1 «sanitize»-контракт (sanitizeMercSheet: битое ядро → null); подделка недостижима в игре, ≡ удалённой записи |
| R-4 | Битые скаляры (loyalty не finite / hiredDay не finite, < 0) | запись → DROP (revive → null), не сброс полей к 50/0 | 000085 house-правило «Числа: невалидные → запись в dropped; валидные → as-is/нормализация»; 50/0 — документированный backfill ТОЛЬКО для string-формата, где данные реально отсутствовали |
| R-5 | hiredDay-гейт: ≥ 1 (reuse deserializeRoster) или ≥ 0 | **≥ 0** (0 — легитимный sentinel backfill) | ≥ 1 отбрасывал бы backfilled-запись (hiredDay 0) на каждом следующем restore — тихая потеря прогрессии (regression) |
| R-6 | Backfill-sheet: createMercSheet(npc) или чистый createSheet('merc') | **createMercSheet(npc)** | ТЗ «sheet из каталога по 000143» + прецедент backfill roster (deserializeRoster L803); «createSheet('merc')» в ТЗ/D1 — сокращение (createMercSheet внутри вызывает createSheet('merc', …)) |
| R-7 | Fallback combatEndCompanions при serializeDeadRecord → null | голый id (u.id), не базовая запись через revive | деградация = бит-в-бит пре-000161 поведение (legacy-путь + backfill при restore, 000029); без лишнего вызова каталога; недостижимо в игре (entry из roster всегда со sheet) |
| R-8 | Дедуп | по npcId через string\|record-адаптер, first-wins (обе точки) | 000085 (первое вхождение wins, дубль → bad); адаптер обязателен (смешанные форматы в транзиентном fallback) |
| R-9 | Размещение функций в companions.js | serializeDeadRecord — после serializeRoster (L719); reviveEntryFromRecord — после deserializeRoster (L823); экспорт — в группе «Сериализация» | рядом с близнецом; дифф в регионе сериализации (L684-837) — не пересекается с D7-шовом 000167 (allyDataForEntry L660-682) |
| R-10 | Размещение красных тестов | НОВЫЙ tests/dead-mercs.test.js (node, DM-1..6) + U10 (npc-hire-ui) + T7/T8 (save, vm) | house-паттерн «один файл под задачу» (прецедент companions-sheet.test.js 000143); UI-уровень — в npc-hire-ui (пасхальник ТЗ «npc-hire»); save-формат — в save.test.js (bootWithSave) |
| R-11 | V5 L764 `.includes('efir')` | репин в `.some((d) => d.npcId === 'efir')` | с объектами .includes — всегда false: тихий green со сломанной семантикой (ассерт-призрак); технический репин, смысл тот же |
| R-12 | Warn при подделке | существующий «Сейв: dead_mercs — неизвестные/дубли npcId: …» без изменений | 000085: bad = список id, одна причина для всех; пин T6 ('ghost_dead') — без правок; ТЗ: «сообщение не меняется» |
| R-13 | Тест «npc-hire: повторный найм после гибели нельзя» | полный цикл — V5 (companions-cycle, репин закрывает e2e) + U10 (npc-hire-ui, record) + DM-6 (node-адаптер) | ТЗ не привязывает к файлу; три уровня (core/UI/e2e) закрывают контракт D1 без семантических правок U3/G2 |

## 8. Дельты (ТЗ vs фактический master 6fcb664)

* ТЗ сверено с 3c0e1b4; на master 6fcb664 доменных сдвигов НЕТ (±2
  строки): combatEndCompanions L421-449 (тело L437-447), restore
  L871-903, serializeRoster L703-719, candidatesForTavern L400-405 —
  все точки сверены.
* SPEC.md уже правлен 000156 — правки SPEC в 000161 НЕ требуются.
* ТЗ-«sanitize через deserializeRoster/sanitizeMercSheet» (п.3) —
  deserializeRoster НЕЛЬЗЯ реюзить как есть (гейт hiredDay ≥ 1, §2.4);
  реальный реюз: sanitizeMercSheet (sheet) + скалярные правила.
* Базовая линия: 1758/0 на 6fcb664 (ТЗ цитирует 1732/0 на 3c0e1b4 —
  рост: мержи 000156/000154).
