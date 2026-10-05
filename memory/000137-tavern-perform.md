# 000137 (шпаргалка): «Выступление» в Таверне + городской daily-ключ

Полный контракт — memory/000137-tavern-perform-city-daily.md.
Статус: СТАДИЯ ПРОЕКТИРОВАНИЯ (2026-10-05). Задача 000137: таверна
(44) — действие «Выступление» (EFFECTS['44_perform'], раз в день,
доход золотом) + превентивный фикс городского daily-ключа.

## 1. Формула дохода

```
income = Math.round( Math.round(база + шаг × L) × mult )   // ЦЕЛОЕ
```

* **база = 10, шаг = 2, навык = 'artist'** — ИЗ КАТАЛОГА
  `assets/buildings/000044.json → особые_параметры.эффект.выступление`
  (000053: код каталог-драйвен, хардкода нет; масштаб — золотой доход
  фонтана 000049.json: золото_база 10 / золото_шаг 2).
* **L** = `G.skillLevel(hero, 'artist')` (= hero.secondary.artist || 0).
* **mult** = `G.derived(hero).performanceIncomeMult` — **LIVE-чтение**
  в apply (player.js:247: 1 + 0.1×L; закрывает мёртвый стат).
  Не-finite → 1 (fail-open).
* Детерминизм: чистая функция (каталог, L, mult) — НЕТ Math.random/
  Date/(tile,day)-сидов (в отличие от монеты фонтана 49).
* Золотые пины: L=0 → **10** (10×1.0); L=5 → **30** (20×1.5);
  L=10 → **60** (30×2.0); дробный случай: L=1 → 13 (12×1.1=13.2).
* Чистое ядро: `BE.performGold(eff, level, mult)` (export, паттерн
  coinGold; не-числа → 0). Apply-слой: `BE.applyTavernPerform(st)` →
  `{ ok, success, gold, message: 'Выступление: +N золота.' }` (+
  re-check марки из снапшота → отказ 'выступал сегодня').

## 2. Формат городского daily-ключа (для ВСЕХ будущих городских
эффектов с лимитом — audit §7)

```
ключ buildingOncePerDay ВСЕГДА = '<X>,<Y>:<effectId>'
  мир:    X,Y = тайл постройки (deps.player.x/y) — БЕЗ ИЗМЕНЕНИЙ
  город:  X,Y = ЯКОРЬ ГОРОДА (buildingAnchor входного тайла)
```

* Якорь: `ds.worldKey` ('ex,ey') → `map.tileAt(ex,ey).buildingAnchor`
  (резолв в interactCity building-actions.js — зеркало
  prepareCityState main.js:1726-1745); доводится строкой
  `t.cityAnchor = 'ax,ay' | null` → state.tile.cityAnchor (оверлей)
  + state.cityAnchor (apply).
* Единый хелпер: `BE.dailyKeyFor(tile, effectId)` (tile.cityAnchor —
  строка → `cityAnchor + ':' + id`; иначе `tile.x + ',' + tile.y +
  ':' + id`) — mark (onBuildingAction), read (buildingActions),
  performAvailable, re-check в apply — ВСЕ через него.
* Почему без клетки: `<ax>,<ay>:<tx>,<ty>:<effectId>` не проходит
  DAY_MAP_KEY_RE (day.js:203, одно двоеточие) → restoreDayMap молча
  сбрасывал бы марку; day.js не трогаем. Семантика — per-(город,
  эффект) (несколько таверн города шарят один лимит — «выступает
  один раз в день в городе»). Миграции нет (городских ключей не
  существовало).
* Строка отказа: **«выступал сегодня»** (performAvailable — до
  generic «уже использовано сегодня»; re-check в apply — тот же текст).

## 3. Спец-модуль 44_perform (src/building-effect-44_perform.js)

* Шаблон 1:1 — src/building-effect-44_rest.js (000128 §2.3): UMD;
  node — `{ tavernPerform }` (без регистрации); browser —
  саморегистрация `registerSpecial('44_perform', (ctx) =>
  tavernPerform(ctx && ctx.r, ctx && ctx.hero))` в МОМЕНТ загрузки.
* Гарды: без Game — тихо; без Game.buildingActions — console.error
  («…Game.buildingActions отсутствует — src/building-actions.js обязан
  грузиться ДО…») + без регистрации; root Game НЕ переприсваивается
  (000038).
* `tavernPerform(r, h)` — паттерн handlerCoin (building-effect-49.js):
  только при r.success && r.gold > 0 → `h.gold += r.gold` (h — ЖИВАЯ
  ссылка hero); `{ ok:true, message: r.message }`.
* Мир-действие БЕЗ «стороны»: **день НЕ проходит** (clock не
  трогать — в отличие от 44_rest). saveNow/марка/flash/render —
  автоматика роутера (onBuildingAction).

## 4. index.html (порядок тегов)

```
src/building-actions.js          (L754)
src/building-effect-44_rest.js   (L755)
src/building-effect-44_perform.js ← НОВЫЙ тег СРАЗУ ПОСЛЕ 44_rest
src/building-content.js          (L761)
…
src/main.js                      (L807)
```

Слот спец-модулей: ПОСЛЕ building-actions.js (нужен registerSpecial),
ДО main.js (UMD-ловушка 000038 — снапшот Game снимается один раз).
Пин — tests/index-order.test.js: список «нужные модули» +
не-смежный пин порядка (building-actions < 44_perform < main.js,
44_rest < 44_perform) + vm-self-registration (standalone тихо /
без buildingActions — console.error + specials нет / с —
specials['44_perform'] function).

## 5. Каталог 000044.json (3 правки)

* `эффекты` += "44_perform" (аппенд → оверлей dialog/44_rest/
  44_rumors/44_perform);
* `раз_в_день: { "44_perform": true }` — per-эффектный объект
  (000092; boolean нельзя — лимиты 44_rest/44_rumors);
* `эффект.выступление: { "база": 10, "шаг": 2, "навык": "artist" }`.
* Зеркало src/buildings.js — `npm run sync:buildings` (JSON + зеркало
  одним коммитом; byte-пин tests/buildings.test.js).
