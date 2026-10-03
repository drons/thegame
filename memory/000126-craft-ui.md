# 000126: Экран крафта — детали UI (точки входа, структура, порядок модулей)

Вспомогательный контракт к memory/000126-craft-screen.md (главный).
Здесь — то, что главному файлу не по формату: точки входа, DOM/
CSS-структура, порядок модулей (UMD/index-order), решение «в поле»,
подзадачи.

## Точки входа

1. **Клавиша [E] на тайле крафтовой постройки** (11 зданий: 3,5,8,
   12,16,17,18,25,40,42,48 — чей `id` ∈ union `рецепт.здания`):
   main.js KeyE → `G.buildingActions.toggle()` → оверлей
   `Game.buildingUI` со строкой «Крафт» → клик/Enter →
   `onBuildingAction('craft')` → спец-хендлер (craft-ui.js) →
   `Game.craftUI.open({building, hero})`.
   * С NPC: оверлей показывает «Диалог» (→ npcUI) и «Крафт» (→
     экран) — обе доступны, игрок выбирает.
   * Тач-кнопка «E» (000018/000123) → тот же `toggle()` — работает
     автоматически (единый роутинг).
2. **Ментор (отдельно от экрана):** в диалоге NPC (npcUI, вкладка
   «диалог») — опция «обучить <вид>» (у NPC, чьи `обучение.навыки`
   маппятся в вид через `Game.Craft.SKILL_CRAFT_TYPE` И стоит в
   постройке этого вида). Клик → `Game.Craft.mentorCraft` (+1 уровень
   виду за `обучение.цена_за_уровень`). Живой пример: Торн (Кузница
   [8,25], forge → кузнечное_дело, 20 з).
3. **«В поле» (building=null) — БЕЗ точки входа.** Решение: ТЗ скоуп
   = постройки; крафт в поле (шанс качества 0) строго хуже; отдельная
   UI-поверхность без тайла постройки — вне скоупа. API
   `Game.Craft.craft(hero, id, {building:null})` остаётся (логика
   000046) для будущих задач/тестов. ЗАФИКСИРОВАНО.

## Закрытие экрана / стек оверлеев (000096)

* [Esc] и кнопка «закрыть» — закрывают сам экран (слушатель keydown
  на window, паттерн npcUI escHandler: preventDefault+stopPropagation).
* Бой закрывает экран: main.js `startCombatAt` / `maybeStartCombat` /
  `startDungeonCombat` — после `G.buildingUI.close()` добавить
  `if (G.craftUI && G.craftUI.isActive()) G.craftUI.close();`.
* Движение заблокировано, пока экран открыт: main.js frame —
  `const inCraft = G.craftUI && G.craftUI.isActive();` + `!inCraft`
  в условии движения; keydown-гейт `if (G.craftUI &&
  G.craftUI.isActive()) return;` после buildingUI-гейта.
* [E] не открывает buildingUI СВЕРХУ открытого экрана: building-
  actions.js `toggle()` — гард `if (deps.game.craftUI &&
  deps.game.craftUI.isActive()) return;` ПОСЛЕ dungeonUI-гарда
  (KeyE обрабатывается ДО keydown-гейтов main.js — гард в toggle()
  — несущий).

## Структура экрана (DOM)

Полноэкранный оверлей, паттерн 000125 (свой класс панели, декэплинг
от .combat-side). Оверлей несёт ОБА класса `combat-overlay craft-
overlay` (база fixed/inset:0/z-20/фон + маркер-фильтр для CSS/
building-effects `findAll('.combat-overlay')`).

```
.craft-overlay (div, className 'combat-overlay craft-overlay')
  .craft-panel (div, flex-колонка 100%×100%)
    .cp-title
      span  — «<имя постройки> — крафт»
      button.cp-close (data-craftact='close') — «закрыть [Esc]»
    .craft-body (flex:1 1 auto; min-height:0; overflow-y:auto)
      [для каждого вида, представленных рецептов этого здания,
       в порядке CRAFT_TYPES]
      .craft-type (section)
        .craft-type-name — «<вид> — уровень <craftLevel>»
        [для каждого рецепта вида]
        .craft-recipe
          .craft-recipe-name — recipe.название
          .craft-recipe-meta — «нужно ур. <уровень> / есть <L>»
            (+пометка «(недостаточно уровня)» если L < уровень)
          .craft-recipe-inputs — «Исходники: <имя> ×n, …»
            (нехватка — «(нет)»/подсветка: !G.hasItem(hero, id, n))
          .craft-recipe-chance — «Качество: X%  Выход: Y%»
            (qualityChance/yieldChance; X>0 у постройки)
          .craft-recipe-result — «Результат: <имя> ×n»
          [если recipe.тип === 'зачарование']
          .craft-spell — выбор: «Заклинание: <button на каждое
            изученное из recipe.заклинания, с маной>»
            (data-craftact='spell' data-recipe=id data-spell=spellId)
            — выбранное подсвечено; по умолчанию первое изученное
          button.cp-btn (data-craftact='craft' data-recipe=id
            data-spell=<выбранное|—>) — «изготовить»
            (disabled + title по canCraft(hero, id, {building,spellId}))
    .craft-log (combat-state craft-log; flex:0 0 auto; max-height vh;
      overflow-y:auto) — результат крафта / причины отказов
```

* Кнопки/строки — делегированный `onOverlayClick` (паттерн npcUI/
  buildingUI): `e.target.closest('[data-craftact]')`.
* Перерисовка: после успешного крафта — перестроить `.craft-body`
  (уровень/исходники/шансы могли измениться) + `G.playerUI.render()`
  + `onChange()` (сейв, паттерн 000029).
* Лог — автораскрутка вниз (scrollTop = scrollHeight, паттерн npcUI
  renderTab).

## CSS (конец `<style>`, перед `</style>` строка 574)

Все правила — В СВОЁМ СКОУПЕ (`.craft-overlay`/`.craft-panel`/
`.craft-body`/`.craft-log`/`.craft-*`); общие `.cp-*`/.combat-* —
НЕ ТРОГАТЬ. Позиция: ПОСЛЕ dungeon/npc-правил (каскад — по порядку).

```
.craft-overlay { display: block; background: #101418; }
.craft-panel   { width:100%; height:100%; box-sizing:border-box;
                 display:flex; flex-direction:column;
                 padding:12px 14px; background:rgba(16,18,24,0.95); }
.craft-panel .cp-title { display:flex; align-items:center;
                 justify-content:space-between; gap:8px; flex:0 0 auto; }
.craft-body    { flex:1 1 auto; min-height:0; overflow-y:auto; }
.craft-log     { flex:0 0 auto; max-height:30vh; overflow-y:auto; }
.контент-колонка (.craft-body/.craft-log в скоупе) — max-width 680px +
  margin-left/right:auto (диапазон ТЗ 640…720 — тест пинит диапазон)
```

## Порядок модулей (UMD / index-order)

* `src/craft-ui.js` — UMD (000038): browser-ветка
  `root.Game = Object.assign({}, G0, {craftUI: factory(G0, null,
  null, rootRef)})` (rootRef — 4-й аргумент, паттерн cities.js;
  ленивый globalThis.Game в момент вызова). Node-ветка
  `module.exports = factory()`.
* Слот в index.html: ПОСЛЕ hud.js (670), ДО visuals-data.js (671) —
  слот спец-модулей 000128 (между building-actions.js 664 и main.js
  678). НЕ закреплять adjacency к main.js (слот общий: 000077/
  000091–95).
* Цепочка: craft.js (616) → ui.js (653) → building-ui.js (658) →
  building-actions.js (664) → hud.js (670) → **craft-ui.js (новый,
  ~671)** → visuals-data.js → … → main.js (678).
* Пины tests/index-order.test.js: craft.js < craft-ui.js; building-
  actions.js < craft-ui.js < main.js. + 'src/craft-ui.js' в «нужные
  модули».
* Саморегистрация спец-а `'craft'` — при ЗАГРУЗКЕ craft-ui.js
  (browser-ветка, после `root.Game=…`): `root.Game.buildingActions.
  registerSpecial('craft', fn)` (гард: нет buildingActions →
  console.error). registerSpecial работает ДО init (000128 §2.6) —
  dispatch читает таблицу в момент вызова.

## Подзадачи

НЕ БЫЛО (решение 7 главного файла: ~600–750 строк кода, все границы
от 000046/000128/000125; файлы не пересекаются с параллельными
pending). ТЗ «разбить, если слишком большая» — НЕ сработало.

## Будущее (вынесено из скоупа, зафиксировано)

* Крафт «в поле» (building=null) — отдельная задача (UI-поверхность
  вне построек; шанс качества 0).
* Магические не-зачарование рецепты (steel_sword ['fireball'],
  кузнечное_дело) — выбор/применение заклинания вне вида «зачаро-
  вание» — отдельная задача (эта задача — только зачарование-вид).
* HUD-хинт «([E] действия)» для крафтовых зданий без эффектов —
  отдельная задача (hasEffects/hud.js; ТЗ молчит).
