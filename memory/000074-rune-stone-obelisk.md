# 000074: рунический камень (id 40) и обелиск (id 42) — контракты и границы

Статус: СТАДИЯ ПРОЕКТИРОВАНИЯ (итоговая архитектура зафиксирована
анализами a1/a2/a3 + сверкой с кодом master c99cfca). Красная стадия
коммитит этот файл вместе с тестами.
Родитель: 000064 (план — memory/000064-building-effects-plan.md);
разделы сейва — имена из memory/000072-building-effect-state.md;
паттерны оверлея — memory/000071-building-ui.md; паттерны r.*/seed —
memory/000075-teleport-circles.md. Решение «уровень мира» + контракт
квеста постройки — ОТДЕЛЬНО: memory/000074-rune-obelisk.md.
Файл задачи tasks/pending/000074.md НЕ ИЗМЕНЯЕТСЯ (закоммичен в master —
правило tasks/CLAUDE.md): решения фиксируются здесь.

## Что добавлено (область задачи)

* Реестр building-effects.js: записи EFFECTS['40'] «Расшифровать» и
  EFFECTS['42'] «Прикоснуться» (первые действия с каталожным
  раз_в_день для 40/42).
* Чистые формулы/роллы (tile, day) — детерминизм, свои ASCII-сиды.
* Каталог 000040/000042: эффект string → ОБЪЕКТ (конвенция 000075) +
  раз_в_день + (42) квест; зеркало src/buildings.js — РЕГЕНЕРАЦИЯ
  `npm run sync:buildings` (не руками; byte-тесты tests/buildings.
  test.js).
* src/npc.js: источник квестов 'building' (новые функции, аддитивно).
* src/main.js: wiring (ханки r.xp/r.quest в onBuildingAction, раздел
  сейва buildingQuests, rehydrate, локальный grantXpRaw).
* 14 красных тестов (A42–A52 node, B21–B23 vm) в tests/building-
  effects.test.js + технический пере-пин A1.

НЕ ТРОГАТЬ: index.html (новых script/CSS НЕТ), src/player.js, src/
save.js (v1), src/ui.js, src/building-ui.js, src/day.js, src/map.js,
SPEC.md, assets/buildings/schema.json (особые_параметры — открытый
объект — новые поля проходят БЕЗ правки схемы), tests/npc.test.js
(регрессия — зелёный БЕЗ ПРАВОК), tests/index-order / map / save* /
buildings / assets-schemas (без правок), новые ассеты (звук/иконки —
НЕ в задаче), чужие записи EFFECTS ('39' — 000077, '43' — 000077),
.merge-pending, push.

## Файлы и точки (file:line по baseline c99cfca)

| Файл | Точка | Что |
|---|---|---|
| src/building-effects.js | после EFFECTS['38'] (≈231) | записи '40'/'42' + групповой комментарий 000074 |
| src/building-effects.js | рядом applyBlessing (≈314) | чистые: stoneChance, stoneXp, obeliskXp, deterministicRoll, pickFragment, questIdForTile, readBuildingQuestEntry + serializeBuildingQuests/restoreBuildingQuests (≈595, паттерн teleports); сиды-константы |
| src/building-effects.js | export (≈634) | + 8 функций + 3 сида |
| src/npc.js | после turnInQuest (≈426) | acceptBuildingQuest, completeBuildingQuest, rehydrateBuildingQuests |
| src/npc.js | acceptQuest (333) | счёт лимита — только НЕ-building-инстансы (1 строка, D-решение) |
| src/npc.js | serializeQuestBook (447) | guard: инстансы source 'building' — НЕ в секцию quests (2 строки) |
| src/npc.js | export (560) | + 3 функции |
| src/main.js | после teleports Map (≈261) | `const buildingQuests = new Map();` |
| src/main.js | collectSaveData (333) | + поле buildingQuests (гард serializeBuildingQuests, ПОСЛЕ teleports) |
| src/main.js | restoreFromSave, ПОСЛЕ teleports-блока (≈523) | СВОЙ try/catch-блок buildingQuests (форма → warn + clear; restoreBuildingQuests; active && day > clock.day → отброс + warn) |
| src/main.js | ПОСЛЕ quests-блока (≈570) | `G.rehydrateBuildingQuests(questBook, buildingQuests)` (гард) |
| src/main.js | onBuildingAction | state += `catalog: b`; ханки r.xp / r.quest / r.questComplete — ПОСЛЕ r.buffs (≈726), ДО маркировки раз-в-день (≈727); локальный grantXpRaw (IIFE) |
| src/main.js | openBuildingUI (≈815) | state для buildingActions += `catalog: b` |
| assets/buildings/000040.json | особые_параметры | эффект-объект + раз_в_день (ниже, D-каталог) |
| assets/buildings/000042.json | особые_параметры | эффект-объект + раз_в_день + квест |
| src/buildings.js | GENERATED (522-533, 544-553) | РЕГЕНЕРАЦИЯ `npm run sync:buildings` |
| tests/building-effects.test.js | A1 (136-138) | пин → ['36','37','38','40','41','42'] (свой же комментарий пина это предусматривает) |
| tests/building-effects.test.js | конец секции A (после A41, 1122) | A42–A52 |
| tests/building-effects.test.js | конец секции B (после B20, 2735) | B21–B23 |
| memory/000074-*.md | новый | этот файл + 000074-rune-obelisk.md |
| CHANGELOG.md | (стадия finalize) | «Игровой процесс», дата = день мержа |

Ожидаемая дельта: building-effects.js ≈ +220; npc.js ≈ +100; main.js
≈ +95; каталог 40 ≈ +14, 42 ≈ +28; buildings.js — регенерация
(≡ каталог); тесты ≈ +660; memory ≈ +250; CHANGELOG ≈ +10. Итого
≈ +1400 строк / 10 файлов.

## Контракт apply (расширение, аддитивно; ЧИСТОТА — 000071/A12)

state (расширение): `{ day, tile:{x,y}, hero, save: СНИМОК
collectSaveData(), map, catalog }` — `catalog` = РЕШЁННАЯ каталожная
запись постройки (buildingId-first, buildingRecForTile main.js:846;
прецедент расширения state — `map` у 000076). main.js добавляет
`catalog: b` в ОБА вызова (buildingActions в openBuildingUI И apply в
onBuildingAction). apply читает параметры ТОЛЬКО из
`st.catalog.особые_параметры.эффект` (объект) и `.квест` (обелиск) —
каталога ГЛОБАЛЬНОго в apply НЕТ.

apply НЕ мутирует state/hero/save и НЕ вызывает G.addXp / accept* —
только ВОЗВРАЩАЕТ результат; исполнение — ханки main.js (паттерн
r.teleport 000075 / r.buffs 000076). Недневной отказ (нет Game /
мусор каталога) — `{ ok:false, message:'недоступно' }` (паттерн
applyBlessing) → в main.js: hudFlash, БЕЗ маркировки/без saveNow
(контракт 000071).

### Запись '40' — «Расшифровать» (камень)
Требуемые поля каталога (иначе 'недоступно'): эффект.шанс_база,
эффект.шанс_шаг, эффект.опыт_база, эффект.опыт_шаг (конечные числа),
эффект.навык (строка), эффект.тексты (массив ≥1 непустых строк).
R = G.skillLevel(st.hero, эффект.навык) (лениво; fallback
`st.hero.secondary[навык]||0` — для героя вторичный; в цепочке
G.skillLevel = версия npc.js — для 'runes' результат тот же: runes не
основной).
chance = stoneChance(эффект, R) = min(1, шанс_база + шанс_шаг·R).
success = deterministicRoll(x, y, day, STONE_ROLL_SEED, G.hash2) <
chance, где roll = hash2(x, y, STONE_ROLL_SEED ^ day)/4294967296.
fragment = pickFragment(тексты, x, y, day, STONE_TEXT_SEED, G.hash2)
= тексты[hash2(x, y, STONE_TEXT_SEED ^ day) % тексты.length].
Результат:
* успех: `{ ok:true, success:true, xp: stoneXp(эффект, R,
  G.derived(st.hero).runePowerMult), fragment,
  message: 'Расшифровка: успех (+' + xp + ' оп.). «' + fragment + '»' }`
  где stoneXp = round((опыт_база + опыт_шаг·R) · runePowerMult).
* провал: `{ ok:true, success:false, message: 'Расшифровка: руны
  молчат — попытка сгорела.' }` (БЕЗ xp/fragment). **ok:true ОСОЗНАННО
  (решение)**: ТЗ «провал — попытка сгорела» + тест «повтор в тот же
  день → недоступно» — а ок-ветка main.js ставит daily-марк + saveNow
  ТОЛЬКО при ok. ok:false означал бы «попытка не сгорела».

### Запись '42' — «Прикоснуться» (обелиск)
Требуемые поля: эффект.опыт_база, эффект.опыт_шаг, эффект.тексты;
квест — объект { id: string, название: string, описание: string,
цель, награда } (для r.quest; цель — ОПИСАТЕЛЬНАЯ, см.
000074-rune-obelisk.md).
L = st.hero.level (ЦЕЛОЕ; «уровень мира» = hero.level — РЕШЕНИЕ,
000074-rune-obelisk.md). xp = obeliskXp(эффект, L,
G.derived(st.hero).xpMult) = round((опыт_база + опыт_шаг·L) · xpMult).
fragment = pickFragment(тексты, x, y, day, OBELISK_TEXT_SEED, G.hash2).
Квест (по СНИМКУ, прототип-безопасно, readBuildingQuestEntry):
key = 'x,y' (tileKeyOf);
* запись buildingQuests[key] ОТСУТСТВУЕТ + квест-определение валидно →
  `quest: { questId: questIdForTile(квест.id, x, y), day: st.day }`
  (questId = `квест.id + '_' + x + '_' + y` — per-tile, уникален);
* запись status 'active' → `questComplete: запись.questId`
  (используется ПЕРСИСТИРОВАННЫЙ questId — каталог мог измениться);
* запись status 'done' (или мусор) → ни quest, ни questComplete.
Результат: `{ ok:true, xp, fragment,
message: 'Обелиск: +' + xp + ' оп. «' + fragment + '»', quest?,
questComplete? }` (quest и questComplete — взаимоисключающи).
ДЕГРAДАЦИЯ обоих эффектов (G.hash2/G.derived/G.skillLevel отсутствуют
— песочница без player/perlin): `{ ok:false, message:'недоступно' }`
(Тест: A-деградация, паттерн A14). В игре — всегда присутствуют
(цепочка index.html: perlin 497, player 508, buildings 511, npc 512,
building-effects 518, main 562).

### Лимит раз-в-день — ИЗ КАТАЛОГА
`особые_параметры.раз_в_день: true` (top-level, паттерн 000072/000043);
в записях реестра разВДень НЕ ставить (каталог побеждает; ТЗ: «флаг
в каталог»). hasDailyLimit/buildingActions/readOncePerDay/canUseToday
— БЕЗ ИЗМЕНЕНИЙ: строка действия появляется, reason
«уже использовано сегодня», ключ 'x,y:40'/'x,y:42' — из коробки.
effectIds — 1-к-1 `EFFECTS[String(id)]` (массив `эффекты` в каталоге
НЕ нужен).

## Каталог (числа — SPEC «Эффекты построек»; тексты — авторские,
фиксируются ЗДЕСЬ — стадия кода только транслитерирует в JSON)

000040.json `особые_параметры`:
```json
{
  "эффект": {
    "шанс_база": 0.25, "шанс_шаг": 0.05,
    "опыт_база": 10, "опыт_шаг": 2,
    "навык": "runes",
    "тексты": [
      "…и семь печатей скрепят слово, что не должно было быть сказано…",
      "…камень помнит руку, что вырезала его в эпоху до карт…",
      "…число девять повторено трижды — это не совпадение, это приказ…",
      "…когда руны замолчат — ищите обелиск. Он молчит дольше…",
      "…флогистон не стихия. флогистон — имя того, кто зажёг первую…",
      "…тот, кто расшифрует эту запись, получит знание, от которого боги отвели глаза…"
    ]
  },
  "раз_в_день": true,
  "map_index": 10,
  "название_карты": "Рунический камень"
}
```
000042.json `особые_параметры`:
```json
{
  "эффект": {
    "опыт_база": 5, "опыт_шаг": 2,
    "тексты": [
      "…старый мир держался на трёх обелисках; третий стоит там, где теперь море…",
      "…наследники Флогистона научились читать камни, но не научились их замолчать…",
      "…каждое прикосновение к обелиску — вопрос; мир отвечает опытом…",
      "…карты старейшего архива называют долину «Ртом». Почему — не помнит никто…",
      "…когда рунические камни замолчали, обелиски продолжили говорить — с теми, кто коснётся…",
      "…в основание обелиска вложено одно слово на старом наречии: «ждите»…"
    ]
  },
  "раз_в_день": true,
  "квест": {
    "id": "obelisk_touch",
    "название": "Камни помнят",
    "описание": "Обелиск принял твоё прикосновение. Вернись к нему на другой день и коснись ещё раз — тогда память передастся целиком.",
    "цель": { "тип": "прикосновение", "количество": 1 },
    "награда": { "опыт": 25, "золото": 20, "предметы": [] }
  },
  "размещение": { "слот": 10, "доля": 15 }
}
```
ИМЕНА ПОЛЕЙ ЗАФИКСИРОВАНЫ (русские — конвенция каталога; эффект-
ОБЪЕКТ — конвенция 000041/000075). Потребители старой СТРОВОЙ формы
эффект у 40/42 — проверено grep'ом: main.js onBuildingAction читает
op.эффект только для 41 (гард `typeof === 'object'`), map.js — только
размещение/map_index → форма string→object других потребителей не
бьёт (R7 закрыт анализом; при реализации — повторить grep).
Зеркало: `npm run sync:buildings` ПОСЛЕ правки JSON.

## Детерминизм (tile, day) — НИКАКОГО Math.random/Date/seed-мира

* hash2(x, y, seed) — perlin.js:110 (murmur3-finalizer, `>>> 0`), в
  Game с perlin.js (497 — ДО building-effects.js). ЛЕНИВЫЙ захват
  `lazyGame().hash2` в момент apply; отсутствие → 'недоступно'
  (НЕ параллельный встроенный hash — ветвление поведения между
  песочницами отвергнуто).
* Сиды — СВОИ константы модуля building-effects.js (паттерн
  TELEPORT_TIE_SEED 000075, ASCII, НЕ GLOBAL_SEED), ЭКСПОРТ для
  golden-пинов:
  * `STONE_ROLL_SEED = 0x53544E52` ('STNR') — ролл успеха камня;
  * `STONE_TEXT_SEED = 0x53544E54` ('STNT') — фрагмент камня;
  * `OBELISK_TEXT_SEED = 0x4f424c54` ('OBLT') — фрагмент обелиска.
* Формулы (day ВКЛЮЧЁН — ТЗ «(tile, day)»; вариант a2 без day в
  ролле ОТВЕРГНУТ — нарушал бы детерминизм по дню):
  * `deterministicRoll(x, y, day, seed, hash)` =
    `hash(x, y, seed ^ day) / 4294967296` ∈ [0,1);
  * `pickFragment(тексты, x, y, day, seed, hash)` =
    `тексты[hash(x, y, seed ^ day) % тексты.length]` (null — тексты
    не массив/пусто; apply уже валидирует);
  * `questIdForTile(baseId, x, y)` = `baseId + '_' + x + '_' + y`.
* Чистые функции принимают hash-функцию ПАРАМЕТРОМ (инжект в A-тестах;
  в игре — G.hash2). А-тесты детерминизма: два require/loadBE — тот же
  результат; перебор (tile,day) — ≥2 различных фрагментов.

## Контракт квеста постройки — СМ. memory/000074-rune-obelisk.md

(кратко: source 'building', per-tile questId, выдача на ПЕРВОМ
прикосновении (apply → r.quest), выполнение на СЛЕДУЮЩЕМ
прикосновении (apply → r.questComplete), награда каталожная
25 оп./20 з. без предметов, раздел сейва buildingQuests = source of
truth, лимит 5 — только по NPC-квестам, «5 NPC + 1 building»
сосуществуют.)

## main.js: wiring (минимально, вставочными ханками)

1. `const buildingQuests = new Map();` (после teleports, ≈261).
2. collectSaveData: `buildingQuests: (G.buildingEffects &&
   G.buildingEffects.serializeBuildingQuests) ? … : {}` (ПОСЛЕ
   teleports).
3. restoreFromSave: СВОЙ try/catch-блок ПОСЛЕ teleports-блока (≈523):
   явная проверка формы (объект-не-массив → console.warn 'Сейв:
   раздел buildingQuests некорректен — сбрасываю.' + clear);
   restoreBuildingQuests(raw); `active && day > clock.day → отброс`
   (+ warn; done — ДЕРЖИМ: отброс done-«будущего» позволил бы
   ре-выдачу + повторную награду — хуже, чем поддельная дата);
   warn «валидных записей нет» при непустом разделе (паттерн
   buildingOncePerDay 448-468).
4. ПОСЛЕ quests-блока (≈570, после восстановления questBook):
   `G.rehydrateBuildingQuests(questBook, buildingQuests)` (гард
   `questBook && G.rehydrateBuildingQuests &&`) — идемпотентно.
5. openBuildingUI: state для buildingActions += `catalog: b`.
6. onBuildingAction: state для apply += `catalog: b`; между r.buffs-
   ханком (≈726) и маркировкой (≈727):
   ```js
   if (Number.isFinite(r.xp)) grantXpRaw(hero, r.xp);
   const def = b && b.особые_параметры && b.особые_параметры.квест;
   if (r.quest) {
     const acc = G.acceptBuildingQuest
       ? G.acceptBuildingQuest(questBook, r.quest.questId,
           player.x + ',' + player.y, clock.day)
       : { ok: false, reason: 'недоступно' };
     if (acc.ok) {
       buildingQuests.set(player.x + ',' + player.y,
         { questId: r.quest.questId, day: clock.day, status: 'active' });
       r.message += '\nКвест получен: ' + def.название;
     } else {
       r.message += '\n' + acc.reason; // дефенсивно; не ожидается
     }
   } else if (r.questComplete) {
     const res = G.completeBuildingQuest
       ? G.completeBuildingQuest(questBook, def, hero, r.questComplete)
       : { ok: false, reason: 'недоступно' };
     if (res.ok) {
       const key = player.x + ',' + player.y;
       const e = buildingQuests.get(key) ||
         { questId: r.questComplete, day: clock.day };
       buildingQuests.set(key, Object.assign({}, e, { status: 'done' }));
       r.message += '\nКвест выполнен: ' + def.название +
         ' (+' + def.награда.опыт + ' оп., +' + def.награда.золото + ' з.)';
     } else {
       r.message += '\nКвест не сдан: ' + res.reason;
       // (инвентарь полон — квест остаётся active; повтор —
       //  следующее прикосновение; daily-марк и saveNow ВСЁ РАВНО —
       //  касание случилось)
     }
   }
   ```
   saveNow/маркировка/hudFlash/r.playerUI.render — общим потоком
   (ПОСЛЕ ханков — строки 727-736 не смещаются, только вставка).
   hudFlash многострочный — допустимо (прецедент 000076).
7. grantXpRaw — ЛОКАЛЬНАЯ функция IIFE main.js (решение — см.
   000074-rune-obelisk.md, D-XP): ТОЧНОЕ зеркало addXp
   (player.js:317-334) БЕЗ xpMult: totalXp += amount; xp += amount;
   лупа `while (xp >= G.xpForNext(level)) { xp -= …; level++;
   points += G.POINTS_PER_LEVEL; }`; clamp hp/mp через G.derived
   (как в addXp — на сегодня no-op, но зеркало точное). Комментарий
   ОБЯЗАТЕЛЕН: «зеркало addXp player.js:317 — при изменении addXp
   синхронизировать». player.js НЕ ТРОГАЕТСЯ (вне списка файлов ТЗ).
8. clock.onDay — НЕ ТРОГАТЬ (buildingQuests не истекает; раз-в-день —
   buildingOncePerDay, уже есть).

## Раздел сейва buildingQuests (имя — 000072)

`data.buildingQuests['x,y'] = { questId: string, day: integer≥1,
status: 'active'|'done' }` (в памяти — Map той же формы). Чистые
serializeBuildingQuests(Map) → объект / restoreBuildingQuests(raw) →
Map — в building-effects.js (паттерн serializeTeleports/
restoreTeleports 595-635): ключ — XY_KEY_RE (`/^-?\d+,-?\d+$/`,
90); мусорная запись → отброс ЗАПИСИ (fail-open, 000029); раздел не
объект/массив → пустой Map БЕЗ исключения (warn делает main.js).
Roundtrip с serializeBuildingQuests — тест A52. Неломкое v1: версию
НЕ поднимать (000031), save.js не трогать. onDay-очистки НЕТ
(записи не истекают).

## Ленивые ссылки и guards (инвариант UMD, 000038/000053)

* building-effects.js: новых require НЕТ; Game снимается ОДИН раз
  ЛЕНИВО (lazyGame()) только в момент apply; отсутствие G.hash2 /
  G.derived / G.skillLevel → `{ ok:false, message:'недоступно' }`
  (консоль-шума нет — fail-open в виде аккуратного отказа; игра не
  падает; A14-песочницы без perlin/player — деградация, не падение).
* npc.js: новые функции — ЧИСТОЕ ядро (DI P/I уже есть; каталог НЕ
  нужен — def передаёт вызывающий из main.js); acceptBuildingQuest
  валидирует формы book/questId/tileKey (не-строка → отказ, не
  TypeError).
* main.js: все G.*-хуки под гардами (`G.acceptBuildingQuest ? …` и т.д.
  — паттерн collectSaveData/restoreFromSave); G.skillLevel/G.derived/
  G.xpForNext/G.POINTS_PER_LEVEL в цепочке ВСЕГДА (player.js 508) —
  гарды не нужны, но grantXpRaw оборачивает в try-безопасный код
  (вызывается только внутри ok-ветки, где hero жив).

## Тесты: 14 красных (A42–A52 node, B21–B23 vm) — все в tests/
building-effects.test.js; RED-контракт: первый assert.ok — недостающий
символ/запись/поле/функция/раздел; остальные 1225 — зелёные.

Node (loadBE/makeState/withGame; каталог — реальный src/buildings.js):
* **A42.** реестр: EFFECTS['40']/['42'] существуют (имена
  «Расшифровать»/«Прикоснуться» — сверка с каталогом), hasDailyLimit
  (реальная запись 40/42, '40'/'42') === true через каталог.
* **A43.** каталог: 000040 — раз_в_день true, эффект-объект
  (0.25/0.05/10/2, навык 'runes', тексты ≥3 непустых), 000042 —
  (5/2, тексты ≥3, квест {id, название, описание, цель, награда}),
  зеркало src/buildings.js deepEqual JSON.
* **A44.** stoneChance таблица: R 0/5/20 → 0.25/0.5/1.0 (сырое 1.25 →
  КАП 1.0).
* **A45.** stoneXp при scholar 5 (xpMult=1.1 ≠ 1 — ловля «прогнал
  через addXp»/«перепутал множители»): R 0/5/20 → 10/25/100
  (ошибочный ×xpMult дал бы 11/28/110; забытый runePowerMult — 10/20/
  40).
* **A46.** obeliskXp: уровень 3, scholar 0/5/20 → 11/12/15
  (round(12.1)=12, round(15.4)=15); уровень 1 → 7/8/10. Фиксирует
  решение «уровень мира» = hero.level.
* **A47.** pickFragment/deterministicRoll: детерминизм (два
  loadBE — тот же фрагмент/ролл по (tile,day)); перебор (tile,day) —
  ≥2 различных; fragment ∈ каталог; мусорные входы (пустые тексты →
  null; 0 ≤ roll < 1).
* **A48.** buildingActions на РЕАЛЬНЫХ записях каталога (getBuilding
  40/42): save.buildingOncePerDay {'5,7:40':1} → строка
  {доступен:false, reason:'уже использовано сегодня'}; day 2 →
  доступен. То же для 42.
* **A49.** apply('40') (withGame: hash2 — реальный perlin.js,
  derived/skillLevel — реальный player.js, catalog — реальный 40;
  hero {secondary:{runes:5}, scholar…}): день-успех (перебор
  (tile,day) по тем же сидам — независим от B-golden) → ok:true,
  success:true, xp === 25 (A45), fragment ∈ тексты, message;
  день-провал → ok:true, success:false, БЕЗ xp; PURITY:
  deepEqual-снимки state/hero/save ДО/ПОСЛЕ равны.
* **A50.** apply('42'): hero.level 3 + scholar 5 → xp === 12 (A46),
  fragment ∈ тексты 42; r.quest при ПУСТОМ снимке buildingQuests
  (questId === 'obelisk_touch_5_7', day — из state); при
  save.buildingQuests['5,7'] = {…status:'active'} → r.questComplete
  === questId, БЕЗ r.quest; status 'done' → ни того, ни другого;
  purity как A49.
* **A51.** квест (реальный npc.js): acceptBuildingQuest — форма
  инстанса {source:'building', tile, questId, status:'active',
  progress:0, day} + СТРОГИЙ roundtrip: инстанс НЕ попадает в
  serializeQuestBook (секция quests — только NPC; NPC-формы
  байт-идентичны — deepEqual старого и нового serialize на чисто-
  NPC-book); лимит: book с 4 NPC + 1 building → 5-й NPC ok; 5 NPC +
  1 building → 6-й NPC reason «слишком много активных квестов (5)»;
  acceptBuildingQuest БЕЗ лимит-проверки (5 NPC + building → ok:true);
  повторный accept на тот же questId → отказ; completeBuildingQuest →
  delete active + done.push(questId) + reward {25,20,[]} на hero
  (gold +20; xp через addXp — с Учёным: round(25·xpMult)); повторный
  complete → «квест не в работе»; activeQuests — building-инстанс
  даёт quest:null (журнал прокидывает — без краха, ui.js-фолбэк).
* **A52.** serialize/restoreBuildingQuests: roundtrip deepEqual;
  раздел-мусор (строка/массив) → пустой Map БЕЗ исключения; битая
  запись → отброс, валидные выживают; rehydrateBuildingQuests:
  active → инстанс в book.active (идемпотентно: повтор — no-op,
  существующий ключ не затирается), done → не зеркалируется.

VM-chain (boot/seedSave/walkTo/key/findBuilding/readSave, паттерн
B14/B17-20; golden-мир):
* **B21. камень e2e.** golden (-25,34), buildingId 40, 71 шаг (BFS,
  сверено с B3/B12/teleport-пинами). Pre-seed hero
  {secondary:{runes:5, scholar:5}} (ядро createCharacter-совместимо).
  walkTo → HUD «([E] действия)»; [E] → оверлей «рунический камень»,
  строка '40' «Расшифровать»; Digit1 → hudFlash содержит фрагмент ИЗ
  каталога + префикс (Исход дня 1 — ИЗМЕРЯЕТСЯ при первой зелёной
  сборке и пинится: успех → xp-дельта героя 25 (НЕ 28 — защита от
  xpMult; НЕ 22 — защита от перепутанных множителей) + totalXp-дельта
  25 (readSave); провал → xp не изменился); readSave().data.
  buildingOncePerDay['-25,34:40'] === 1 (saveNow сразу); повтор в тот
  же день → строка disabled «уже использовано сегодня»; setDay(2) →
  доступна. Если день 1 — провал: дополнительно setDay(день-успех,
  замерить перебором 2..7) → вторая ветка (xp 25).
* **B22. обелиск e2e.** golden (80,-51), buildingId 42, 131 шаг →
  позиция PRE-SEED'ом на тайле (паттерн B14; тайл проходим — 1×1
  magic_sign, как круг). Pre-seed { day:1, position:(80,-51), hero:
  { ядро, level:3, secondary:{scholar:5} }, quests:{active:{},done:[]}
  }. [E] → строка '42' «Прикоснуться»; Digit1 → xp-дельта 12
  (round(11·1.1)); hudFlash: фрагмент лора + «Квест получен: Камни
  помнят»; readSave().data.buildingQuests['80,-51'] ===
  {questId:'obelisk_touch_80_-51', day:1, status:'active'};
  __game.quests.active содержит инстанс source 'building';
  buildingOncePerDay['80,-51:42'] === 1; повтор в тот же день →
  disabled; setDay(2) → доступна, квест по-прежнему active.
* **B23. квест: выполнение.** Pre-seed (паттерн B14-16) { day:2,
  position:(80,-51), hero:{ядро, level:3, secondary:{scholar:5}, gold
  G0, xp 0}, buildingQuests:{'80,-51':{questId:'obelisk_touch_80_-
  _51', day:1, status:'active'}}, quests:{active:{},done:[]} } —
  building-инстанса в quests НЕТ (serialize его не пишет) — restore
  + REHYDRATE воссоздаёт его из buildingQuests (регрессия rehydrate
  e2e). «Прикоснуться» (день 2 — марки дня 1 не блокирует) → xp-
  дельта 40 (= касание 12 + награда round(25·1.1)=28 — Учёный действует
  на НАГРАДУ, штатный паттерн turnInQuest), gold G0+20; book.done
  содержит 'obelisk_touch_80_-51', active пуст; buildingQuests
  status 'done'; hudFlash «Квест выполнен: Камни помнят (+25 оп., +20
  з.)». setDay(3) → третье касание: xp снова (12), квест НЕ
  повторно (done не растёт, buildingQuests не меняется, active пуст).
  ТЭЙЛ: перезагрузка (boot(readSave-данными, паттерн save-restore)) →
  квест НЕ выдан повторно (done держится, active пуст).

npc.test.js — БЕЗ ИЗМЕНЕНИЙ (затвор ТЗ). assets-schemas / buildings /
map / index-order / save* — БЕЗ ИЗМЕНЕНИЙ.

## Золотые пины (seed-мир; BFS сверен с существующими пинами)

* Камень id 40: **(-25, 34)**, 71 шаг от спавна (buildingId=40 —
  базовая запись слота 10: subtypeFor возвращает id БАЗОВОЙ записи
  для остатка — слотовые якоря ВСЕГДА имеют buildingId, 000073).
* Обелиск id 42: **(80, -51)**, 131 шаг (B22/B23 — pre-seed позиции).
* Существующие goldens НЕ сдвигаются: 40/42 — в РЕЕСТРЕ, а не в
  генерации (мировая генерация не меняется; B3 (4,3) id 43 — первая
  без NPC; B12 — первая без NPC без каталожного раз_в_день: у 40/42
  раз_в_день ЕСТЬ → поиск не тронут).
* Исход ролла камня на (-25,34) — замеряется при первой зелёной
  сборке (дeterministicRoll по зафиксированным сидам), пинится в B21.

## Что важно будущим задачам

* **000092 (фонтан, «уровень мира»)**: ЕДИНАЯ трактовка — hero.level
  (зафиксировано memory/000074-rune-obelisk.md; зарезервировано
  memory/000064:117-119). Следовать за этим файлом, не изобретать.
* **000077 ('39'/'43')**: правило «кто смержился первым» (memory/
  000075): A1-пин расширяется по факту состава master при ребейзе
  (union ['36','37','38','39','40','41','42']). Конфликт — 1 строка.
* **000077/000091-000095**: ханки onBuildingAction — изолированные
  (свои r.-поля); наши r.xp/r.quest/r.questComplete — компактные
  вставки; collectSaveData/restoreFromSave — 000077 добавит
  buildingContent, 000093 explored — блоки держать ОТДЕЛЬНЫМИ
  (паттерн 000072/000075).
* **Квесты зданий — follow-up**: вкладка «Квесты» (000100) НЕ
  рендерит building-квесты в «В работе» (activeQuests → quest null →
  skip; ui.js вне файла задачи) — в «Выполнено» — голый per-tile id
  (существующий фолбэк). Рендер названий — кандидат на ОТДЕЛЬНУЮ
  задачу (нужен каталог в рендере вкладки или 3-й аргумент
  activeQuests).
* **Конвенция effectId** (000072): '40'/'42' — без ':'/',' — ок.
* Новые эффекты зданий (000091-000095): r.xp — ОБЩИЙ ханк
  (amount — ГОТОВАЯ формула, grantXpRaw) — переиспользовать, не
  дублировать; роллы — паттерн deterministicRoll/свои сиды; раз-в-день
  — каталог.

## Подводные камни (регрессии, которых избежали)

* **R1 grantXpRaw-дрейф**: дубль лупы уровней в main.js (player.js
  вне списка файлов ТЗ) — при будущем изменении addXp (новый
  множитель) дубль устареет. Митигация: комментарий-ссылка на
  player.js:317 + тест A45/B21 (scholar>0: XP камня НЕ зависит от S).
* **R2 deserializeQuestBook СТРОГИЙ**: инстанс без npcId → null →
  сброс ВЕСЬ журнал (NPC-квесты теряются). Поэтому building-инстансы
  НЕ ПИШУТСЯ в секцию quests (guard serializeQuestBook) и
  Воссоздаются rehydrate из buildingQuests. Тест A51 (roundtrip +
  NPC-формы байт-идентичны).
* **R3 провал = ok:true** — осознанное отклонение от «не-ok = не
  сработало»: действие СРАБОТАЛО (попытка потреблена) — иначе daily-
  марка не проставилась бы (ТЗ: повтор в тот же день недоступен).
* **R4 totalXp**: grantXpRaw ОБЯЗАН вести hero.totalXp (addXp:320 —
  c.totalXp += gained) — иначе инвариант totalXp/xp сломается.
  Пин: B21 totalXp-дельта.
* **R5 rebuild-порядок restore**: rehydrate — ПОСЛЕ quests-блока
  (questBook должен быть восстановлен); buildingQuests-блок — ПОСЛЕ
  teleports (порядок коллектов/рестор symmetric). day-гигиена
  (active > clock.day → отброс) — в buildingQuests-блоке ДО rehydrate
  (fastForward слушателей не оповещает — 000031).
* **R6 onBuildingAction-регион**: чужие задачи (000077/000091-000095)
  правят ту же функцию — ханки вставочные, компактные; полный npm
  test ПОСЛЕ перебазирования (memory/000072:132).
* **R7 string→object эффект**: grep всех потребителей
  особых_параметры.эффект у 40/42 ПЕРЕД правкой (на baseline — только
  main.js:699-701 для 41, typeof-гард; map.js — размещение).
* **R8 buildings.js — только sync:buildings** (byte-тесты; руками —
  NEVER; при конфликте генблока на ребейзе — перегенерировать).
* **R9 UI-видимость building-квеста в «В работе» = НЕТ** (осознанно;
  см. «Что важно будущим задачам») — не «чинить» в этой задаче
  (ui.js вне списка).
* **R10 лимит**: acceptQuest считает только НЕ-building (1 строка) —
  npc.test.js (без building-инстансов) — идентичное поведение;
  MAX_ACTIVE_QUESTS === 5 не меняется.

## Коммиты (ветка task/000074; последняя строка — Co-Authored-By)

1. «Задача 000074: красные тесты + память — формулы, раз-в-день,
   квест постройки, детерминизм (tile, day)» (A42–A52, B21–B23 +
   пере-пин A1 + оба memory-файла; 1225 → +14 red).
2. «Задача 000074: каталог id 40/42 — эффект/квест/раз_в_день +
   зеркало buildings.js» (JSON + sync:buildings).
3. «Задача 000074: building-effects.js — записи 40/42, чистые
   формулы, сиды, раздел buildingQuests; npc.js — источник
   'building'» (реестр + функции; лимит-строка + serialize-guard).
4. «Задача 000074: main.js — wiring (grantXpRaw, ханки r.xp/r.quest,
   сейв buildingQuests + rehydrate, state.catalog)».
5. «Задача 000074: правки по итогам ревью» (при наличии).
6. «Задача 000074: CHANGELOG — рунический камень и обелиск»
   (дата = день мержа; «Игровой процесс»: камень — расшифровка раз в
   день (шанс по «Рунописи», опыт, фрагменты шифра), обелиск —
   прикосновение (опыт, фрагменты лора, одноразовый квест с наградой)).
7. «Задача 000074: отчёт, память, перенос задачи в done».
