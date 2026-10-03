# 000126: Экран крафта (UI у крафтовых построек) — контракт

Статус: ПРОЕКТИРОВАНИЕ завершено (контракт зафиксирован до кода).
Реализация — стадии красных/зелёных тестов ветки task/000126 (worktree
.worktrees/task-000126, база master 05c9214). Follow-up задачи 000046
(крафт-ядро СМЕРЖЕНО — `Game.Craft`; 000046 реализовала ТОЛЬКО логику,
UI не подключила — до 000126 крафт и mentorCraft недостижимы из игры).
Входные анализы: /tmp/thegame-wf-000126/{a1-domain.md, a2-arch.md,
a3-tests.md} — расхождения арбитрированы фактическим кодом (см.
«Решения» и «Подводные камни»).
База npm test в worktree: 1356/1356 (проверено 2026-10-03).

## Что добавлено / перенесено

Переносов нет (граница «ядро/UI» сохраняется: `Game.Craft` 000046,
`Game.buildingActions` 000128, `Game.npcUI`/диалог 000010 — НЕ
ТРОГАЮТСЯ механически, только ленивые ЧТЕНИЯ и аддитивные ветки).
Добавлено:
* `src/craft-ui.js` — НОВЫЙ. Полноэкранный экран крафта (паттерн
  000125/000030/000041) + саморегистрация спец-действия `'craft'`
  (таблица 000128). UMD по образцу 000038 (см. «Порядок модулей»,
  memory/000126-craft-ui.md).
* Строка `'craft'` в `buildingActions()` (src/building-effects.js) —
  СИНТЕЗ (не запись EFFECTS, не правка каталога).
* Опция «обучить <вид>» в `dialogOptions()` (src/npc.js) — СИНТЕЗ
  (решение (b)).
* Ветка `'обучить_крафт'` в `onOverlayClick` (src/ui.js, акт 'opt').
* Гард закрытия craftUI в `toggle()` (src/building-actions.js) + 5
  инсертов в src/main.js (гейт keydown, гейт frame, 3× закрытие в
  боях).
* CSS-блок экрана в index.html (конец `<style>`, перед `</style>`
  строка 574) + `<script src="src/craft-ui.js">` в слоте спец-модулей
  (после hud.js 670, до visuals-data.js 671).
* Тесты: tests/craft-ui.test.js (vm-цепь), tests/craft-mentor.test.js
  (node + vm), tests/craft-layout.test.js (статика CSS), +1 пин и +1
  строка в tests/index-order.test.js.
* SVG — НЕТ (ТЗ не требует иконок; экран текстовый).
* Каталоги JSON (assets/buildings, assets/craft) — НЕ ТРОГАЮТСЯ
  (source of truth крафта = assets/craft; зеркало src/craft-data.js).

## Контракт и границы

### 1. Точка входа в экран (единый роутинг [E], 000071/000128)

* Стоя на тайле постройки, чей `building.id` входит в union
  `рецепт.здания` (11 зданий: 3,5,8,12,16,17,18,25,40,42,48), [E]
  открывает оверлей `Game.buildingUI` (как всегда), в котором ЕСТЬ
  строка `{ id:'craft', имя:'Крафт', доступен:true }`. Клик/Enter по
  строке → `onBuildingAction('craft', t, b, npc)` → спец-хендлер →
  `Game.craftUI.open({ building, hero })`.
* Строка `'craft'` присутствует у ВСЕХ 11 крафтовых зданий, С NPC и
  БЕЗ (решение «интерпретация входа»). У здания с NPC оверлей
  показывает и «Диалог» (→ npcUI) и «Крафт» (→ экран) — игрок сам
  выбирает. Это нативное чтение ТЗ «опция диалога» (000128): [E] у
  NPC-постройки ВСЕГДА сначала открывает buildingUI (000076/000107).
* НЕ добавляем опцию крафта ВНУТРЬ диалога NPC (npcUI): крафт — про
  ПОСТРОЙКУ, не про NPC; диалог NPC несёт только «обучить <вид>»
  (mentor, см. §3) — он про NPC-наставника.

### 2. Синтез строки 'craft' (src/building-effects.js, buildingActions)

* МЕСТО: внутри `buildingActions(building, npc, state)`, ПОСЛЕ цикла
  эффектов (`for (const id of effectIds(building))`), ПЕРЕД
  `return out`. Итоговый порядок строк: `[dialog?] + эффекты… +
  [craft?]`. Крафт — ПОСЛЕДНИЙ (минимальный риск: существующие
  строки эффектов не перенумеровываются; B21/B22 ищут `findRow(ov,
  '40')` по id — перенумерация их не рвёт).
* УСЛОВИЕ (ленивое, 000053):
  ```
  const G = lazyGame();                      // уже есть в модуле
  if (G && G.Craft && Array.isArray(G.Craft.CRAFT)) {
    const isCraftB = G.Craft.CRAFT.some(
      (r) => Array.isArray(r.здания)
        && r.здания.includes(building.id));
    if (isCraftB) out.push({ id: 'craft', имя: 'Крафт', доступен: true });
  }
  ```
* Деградация: без `Game.Craft` (vm-песочница без craft.js) — строки
  НЕТ (тест A2 `buildingActions({id:97}) → []` остаётся зелёным).
* `доступен` ВСЕГДА true (экран можно открыть всегда; «недоступно»
  помечается уже ВНУТРИ экрана — уровень/исходники/заклинание).
* id `'craft'` — латиница, без ':'/','/пробелов (конвенция 000072
  ключа сейва; не коллидирует с ключами EFFECTS '36'..'42').

### 3. Опция «обучить <вид>» в диалоге NPC (src/npc.js, dialogOptions)

* СИНТЕЗ (не из данных `npc.диалог`): после `.map()` по `npc.диалог`
  к результату ПРИДВИГАЮТСЯ опции наставничества. Ленивое чтение
  `Game.Craft` В МОМЕНТ ВЫЗОВА (npc.js 598 грузится ДО craft.js 616 —
  G-снапшот npc.js Craft НЕ несёт; паттерн уже есть в модуле —
  `craftReprocessHook`, строка 149).
* Логика (решение (b) — опция существует ТОЛЬКО если NPC обучает
  вид И стоит в постройке этого вида):
  ```
  const G = (typeof globalThis !== 'undefined' &&
             typeof globalThis.Game === 'object') ? globalThis.Game : null;
  if (G && G.Craft && Array.isArray(npc.постройки)) {
    const seen = new Set();
    for (const s of schoolSkills(npc)) {           // npc.обучение.навыки
      const t = G.Craft.SKILL_CRAFT_TYPE[s];        // вид | undefined
      if (!t || seen.has(t)) continue;
      seen.add(t);
      const of = G.Craft.typeBuildings(t);
      if (!npc.постройки.some((b) => of.includes(b))) continue; // (b)
      const check = G.Craft.canMentorCraft(npc, character, t);
      out.push({
        option: { id: 'mentor_' + t, текст: 'обучить ' + t,
                  действие: 'обучить_крафт', вид: t },
        доступен: check.ok,
        причина: check.ok ? null : check.reason,
      });
    }
  }
  ```
* `SKILL_CRAFT_TYPE` (000046): forge,heavy→'кузнечное_дело';
  alchemy,nature→'алхимия'; dexterity→'столярное_дело'; runes
  ОТКЛЮЧЕН (один навык — три вида: зачарование/резьба/рунопись).
  Дедупликация по `t` (Set) — NPC, обучающий два навыка одного вида,
  даёт ОДНУ опцию.
* canMentorCraft(npc, c, type) (000046) сам проверяет: неизвестный
  вид → мёртв → «не обучает крафт» → «не обучает этот вид крафта»
  → «нет постройки этого вида» → «максимальный уровень» → «мало
  золота (нужно N)». Успех: `{ok:true, price}`.
* Дедупликация по виду + фильтр по постройке = решение (b): опции
  нет, если `npc.постройки ∩ typeBuildings(t)` пусто (ИНАЧЕ pин
  `o.length === 4` tests/npc.test.js для trainNpc сломался бы —
  trainNpc обучает 'heavy'→кузнечное_дело, но стоит в [7] ∉ [8,25]).

### 4. Экран (src/craft-ui.js) — состав и поведение

* Полноэкранный оверлей (паттерн 000125): `combat-overlay craft-
  overlay` (оба класса — база fixed/inset:0/z-20/фон + маркер-фильтр)
  → панель `.craft-panel` (100%×100% flex-колонка). Структура:
  ```
  .craft-overlay (combat-overlay craft-overlay)
    .craft-panel
      ├─ .cp-title: span (имя постройки + «крафт») +
      │     button.cp-close «закрыть [Esc]» (data-craftact='close')
      ├─ .craft-body (flex:1, min-height:0, overflow-y:auto) — список
      │     рецептов, сгруппированный по видам (тип)
      │     для каждого вида: заголовок «<вид> — уровень L»
      │       (L = Game.Craft.craftLevel(hero, вид))
      │     для каждого рецепта вида (recipe.здания включает
      │       building.id):
      │       .craft-recipe:
      │         .craft-recipe-name  — recipe.название
      │         .craft-recipe-meta  — «нужно ур. N / есть L»
      │           (пометка, если craftLevel < recipe.уровень)
      │         исходники — «предмет ×qty» (нехватка помечена:
      │           !G.hasItem(hero, inp.предмет, inp.количество))
      │         шансы — «качество: X%» (Game.Craft.qualityChance) и
      │           «выход: Y%» (Game.Craft.yieldChance); у постройки
      │           качество > 0
      │         результат — «→ <имя предмета> ×qty»
      │           (G.getItem(recipe.результат.предмет).name)
      │         [ЕСЛИ recipe.тип === 'зачарование'] — выбор
      │           заклинания: ТОЛЬКО изученные (hero.spells ∩
      │           recipe.заклинания), с маной (G.getSpell(id).мани);
      │           по умолчанию — первое изученное
      │         button.cp-btn «изготовить»
      │           (data-craftact='craft' data-recipe=id
      │            data-spell=spellId?) — disabled + title по
      │           Game.Craft.canCraft(hero, id, {building, spellId})
      └─ .craft-log (flex:0 0 auto, max-height vh, overflow-y:auto)
            — лог результата крафта
  ```
* Группировка: рецепты `G.Craft.CRAFT.filter(r => r.здания.includes(
  building.id))`, группируются по `r.тип`. Здание 18 (Башня мага) —
  2 вида (алхимия + зачарование).
* ДЕЙСТВИЕ «изготовить»: `Game.Craft.craft(hero, recipeId, {
  building: building.id, spellId })` (спелл — явный, только для
  зачарования). Показ результата в лог: предмет, качество
  (bonus?), выход (extra?), xp/уровень виду (`r.xp.{applied,
  level, leveledUp, total, reason?}`). После успеха — `onChange`
  (сейв, как в npcUI) + перерисовка строк (исходники/шансы/уровень
  могли измениться) + `G.playerUI.render()`.
* canCraft — БЕЗ rng, без мутаций (зеркало 000046): используется
  ТОЛЬКО для метки disabled. craft() — единственный мутатор.
* Закрытие: [Esc] (слушатель на window, живёт пока оверлей открыт —
  паттерн npcUI escHandler), кнопка «закрыть». `open()`/`close()`/
  `isActive()` — публичная поверхность (как buildingUI).
* DOM-операции ТОЛЬКО внутри open()/close(); при загрузке — только
  присвоение `Game.craftUI` + саморегистрация спец-а (см. «Порядок
  модулей»).

### 5. Зачарование — выбор заклинания

* Пикер — ТОЛЬКО для `recipe.тип === 'зачарование'` (ТЗ-буква).
* Кандидаты: `recipe.заклинания` ∩ изученные `hero.spells`
  (чистое чтение; p.spells НЕ создаёт). У каждого — мана
  `G.getSpell(id).мани`.
* По умолчанию — ПЕРВОЕ изученное из списка. Выбранный id ХРАНИТСЯ
  и ВСЕГДА передаётся явным `opts.spellId` (дефолт ядра
  `spells[0]` может быть НЕ изучен — нельзя полагаться).
* Нет ни одного изученного из `recipe.заклинания` → рецепт
  недоступен (canCraft: «заклинание не изучено»), кнопка disabled.
* НЕ-зачарование рецепты с полем `заклинания` (steel_sword,
  ур.4, ['fireball'], тип кузнечное_дело) — крафтятся БЕЗ spellId,
  БЕЗ пикера (блок заклинания canCraft/craft срабатывает ТОЛЬКО при
  `тип==='зачарование' || o.spellId!=null`). Это ОСОЗНАННОЕ
  ограничение скоупа: магическая добавка к стальным мечами из
  кузницы НЕ подключается этой задачей (задача про зачарование-ВИД).
  Зафиксировано как ограничение, будущее — отдельная задача.

### 6. Границы (что НЕ входит)

* `Game.Craft` (000046) — только ЧТЕНИЕ/ВЫЗОВ, ни одной правки.
* `Game.buildingActions` onBuildingAction-пайплайн (000128) — НЕ
  правится (контракт §2.4 memory/000128: новые действия — через
  specials-таблицу + строку, main.js/building-actions.js НЕ
  переписываются). Единственная правка building-actions.js —
  АДДИТИВНЫЙ гард закрытия craftUI в toggle() (§7).
* `assets/buildings/*.json` / `assets/craft/*.json` /
  `src/craft-data.js` — НЕ ТРОГАТЬ (source of truth).
* Детерминизм/сейвы/RNG — файлы не трогаются, кроме ТЗ-точек
  (сейв через onChange — паттерн 000029, без новых полей).
* `hasDailyLimit` / `effectIds` / каталог `особые_параметры` — НЕ
  правятся (000092 переделывает лимиты — не упреждать).
* HUD-хинт «([E] действия)» (hud.js eHint → hasEffects) — НЕ
  расширяется под крафт: 9 крафтовых зданий БЕЗ эффектов (3,5,8,12,
  16,17,18,25,48) нового хинта НЕ получают (ТЗ молчит; «не больше,
  не меньше»). Игрок находит крафт через [E] (как и эффекты).
  Зафиксировано как ограничение.

## Решения (открытые вопросы ТЗ — закрыты)

1. **Вход — specials-таблица 000128 + синтез строки (НЕ EFFECTS/
   каталог).** Почему: workflow прямо предписывает проводку через
   specials-таблицу building-actions.js; синтез строки в
   buildingActions() + registerSpecial('craft') — ровно паттерн
   000128 §2.3 (3 правки: строка / спец-модуль / script-тег+пин),
   БЕЗ записи EFFECTS и БЕЗ правки каталога. РЕШАЮЩИЙ аргумент
   (найдён в коде): подход a2 (запись EFFECTS + каталог
   `эффекты`) ФУНКЦИОНАЛЬНО ЛОМАН — у 40/42 в каталоге
   `особые_приаметры.раз_в_день: true` (boolean), и
   `hasDailyLimit(building, effectId)` СНАЧАЛА читает именно его и
   возвращает true для ЛЮБОГО effectId → крафт у 40/42 стал бы
   «раз в день» (строка эффектов гасится маркой 'x,y:craft' ВНУТРИ
   цикла effectIds). Синтез строки ВОКРУГ цикла + спец-хендлер
   этого не даёт: доступность строки 'craft' НИКЕМ не гасится (см.
   «Подводные камни» п.1 про осиротевшую марку).
2. **Спец-хендлер живёт в craft-ui.js** (саморегистрация при
   загрузке), отдельного src/building-effect-craft.js НЕТ. Почему:
   «сторона» спец-а — открытие UI-экрана, владелец которого —
   craft-ui.js; отдельный модуль на одну строку — лишний скрипт.
   Отклонение от именового соглашения 000128 (building-effect-<id>)
   осознано и зафиксировано.
3. **UMD (не IIFE).** Почему: workflow предписывает UMD-паттерн
   000038 для новых модулей (образец cities.js/building-
   effects.js/building-actions.js). (building-ui.js — IIFE из-за
   параллельных правил 000097; на нас не распространяется.)
4. **Ментор — решение (b).** Почему: решение (a) (опция всегда
   видна, недоступная — с причиной) ломает pин `o.length === 4`
   tests/npc.test.js (trainNpc). Решение (b) (опция только при
   постройке вида) оставляет pин зелёным. В реальной игре живую
   опцию получает только Торн ([8,25] ∩ кузнечное_дело; forge).
   Карк ([7], heavy) — не получает (нет постройки вида). Лейна/
   Фикка/Элдира — навыки без craft-маппинга.
5. **Запись 'craft' осознанно осиротевшая (40/42).** Спец-хендлер
   проходит общий пайплайн: после успеха `hasDailyLimit(40,'craft')`
   = true (per-building флаг) → пишется марка 'x,y:craft'. Но
   доступность строки 'craft' НЕ читает эту марку (строка
   синтезирована вне цикла effectIds, где live-чек марки) → крафт
   у 40/42 БЕСКОНЕЧНЫЙ, марка — мёртвые данные в сейве. Альтернатива
   (давить hasDailyLimit) — правка общей функции + риск для 000092.
   См. «Подводные камни» п.1.
6. **«В поле» (building=null) — БЕЗ UI.** ТЗ скоуп = постройки;
   крафт в поле (качество 0) строго хуже; API
   `Game.Craft.craft(hero, id, {building:null})` остаётся для
   будущих задач/тестов. Зафиксировано в memory/000126-craft-ui.md.
7. **Не делить на подзадачи.** ТЗ: «Если задача окажется слишком
   большой — разбить». Оценка: ~600–750 строк кода + ~500–600 тестов;
   ВСЕ границы определены смерженными 000046 (ядро), 000128 (вход),
   000125 (полноэкранный layout). Разбивка (экран/диалог/зачарование)
   не снижает риск мержа — файлы не пересекаются с параллельными
   pending. Не делим.
8. **SVG — нет.** ТЗ не требует иконок; экран текстовый (имена
   видов/рецептов/предметов). Избегает requirements
   tests/svg.test.js. «Не больше, не меньше».

## Ленивые ссылки и guards

* Загрузка craft-ui.js: чистая (000053) — UMD-обёртка + factory.
  Browser-ветка: `Object.assign({}, G0, {craftUI: factory()})` +
  ОДНОРАЗОВАЯ саморегистрация спец-а (читает
  `root.Game.buildingActions` — допустимо контрактом 000128
  «саморегистрация при загрузке»; гард: нет buildingActions →
  console.error, без краха). Никаких `const G = globalThis.Game`
  для ПОЗДНЕГО использования (UMD-ловушка 000038).
* Внутри factory: ВСЕ Game-функции читаются лениво в момент ВЫЗОВА
  (open/craft/render): `globalThis.Game` (или rootRef, переданный в
  factory как 4-й аргумент — паттерн cities.js) → `.Craft`,
  `.getItem`, `.hasItem`, `.getSpell`. Node-ветка: `module.exports =
  factory()` — без Game, без регистрации.
* building-effects.js строка 'craft': `lazyGame()` (уже есть) →
  `.Craft.CRAFT` — деградация без строки.
* npc.js опция ментора: `globalThis.Game` при ВЫЗОВЕ (npc.js ДО
  craft.js — снапшот пуст; паттерн craftReprocessHook) →
  `.Craft.{SKILL_CRAFT_TYPE, typeBuildings, canMentorCraft}`.
* ui.js ветка ментора: `G.Craft && G.Craft.mentorCraft` (G-снапшот
  ui.js Craft НЕСЁТ — craft.js 616 < ui.js 653 — но typeof-гард
  оставлен по образцу 000130 `G.findQuestInCatalog`).
* main.js: ВСЕ обращения к craftUI — `G.craftUI && G.craftUI.isActive()`
  (G-снапшот main.js craftUI НЕСЁТ — craft-ui.js 671 < main.js 678;
  пин index-order). Гард && — деградация без модуля (000053).
* building-actions.js toggle(): `deps.game.craftUI &&
  deps.game.craftUI.isActive()` (deps.game — снапшот main.js).

## Что важно будущим задачам (из ссылок ТЗ)

* **000092 (фонтан 49: «Исцеление» раз в день / «Монета» без лимита,
  НЕЗАВИСИМЫЕ счётчики)** — переделывает семантику раз-в-день
  (пер-эффект счётчики вместо per-building `раз_в_день`). Эта задача
  её НЕ упреждает (hasDailyLimit не тронута). ОСИРОТЕВШАЯ марка
  'x,y:craft' у 40/42 — известная зацепка: при реворке 000092 её
  либо убрать (не писать для 'craft'), либо — если крафт решат
  лимитировать — она уже на месте. Не строить на ней логику.
* **000077/000091–95 (спец-модули)** — слот спец-модулей в index.html
  (между building-actions.js и main.js) ЗАНЯТ частично: craft-ui.js
  в нём. Новые спец-модули — сразу ПОСЛЕ craft-ui.js (порядок
  тегов: каждый новый спец-модуль после предыдущего; пин — своя
  задача).
* **SPEC.md «Крафт»** — примечание 000046 «UI крафта отложен в
  000126» обновить на «реализован (задача 000126)» (паттерн 000046:
  «Игрового кода пока нет…» → «реализован»). Числовых формул НЕ
  добавлять.
* **Крафт в поле / магические не-зачарование рецепты (steel_sword
  fireball)** — оба зафиксированы как будущие отдельные задачи (см.
  §6 Границы и memory/000126-craft-ui.md).
* **Полноэкранный layout** — контракт 000125 «Для Game.buildingUI»
  переиспользован для .craft-panel (свой класс, свой скоуп CSS,
  декэплинг от .combat-side). Если будущая задача переделывает
  buildingUI на полноэкранный — подхватит тот же паттерн.

## Подводные камни

1. **Осиротевшая марка 'x,y:craft' у 40/42.** hasDailyLimit читает
   per-building `раз_в_день: true` ПЕРВЫМ (для любого effectId) →
   общий пайплайн пишет 'x,y:craft' в buildingOncePerDay. Никто её
   не читает (доступность строки вне цикла effectIds) → крафт
   бесконечный, марка — мёртвые данные. НЕ «чинить» hasDailyLimit
   (общая функция; 000092 её реворкает). Регрессия-тест: крафт у 40
   доступен 2-й раз в тот же день (марка не гасит строку).
2. **UMD-ловушка 000038 (×2):** (а) craft-ui.js ПОСЛЕ main.js →
   G.craftUI в снапшоте main.js undefined → гейты/закрытия молча
   не срабатывают. Пин: craft-ui.js < main.js. (б) npc.js ДО
   craft.js → G-снапшот npc.js без Craft → опция ментора MUST
   читать Craft лениво (иначе опции никогда не будет). Оба
   зафиксированы.
3. **`const G = globalThis.Game` в craft-ui.js — ЗАПРЕЩЕНО.**
   Только rootRef (4-й аргумент factory) / globalThis.Game в момент
   ВЫЗОВА. Иначе 000038: поздний UMD-модуль заменит Game, G устареет.
4. **Порядок строк buildingUI.** 'craft' — ПОСЛЕ эффектов (концом).
   Вставлять ДО эффектов/между — сдвинет нумерацию 1..9 (тесты по
   id не рвутся, но тач/клавиши по номеру — да). Держать концом.
5. **Пин trainNpc `o.length === 4`.** Синтез ментор-опции MUST
   фильтровать по постройке вида (решение (b)), иначе +1 опция для
   trainNpc (heavy→кузнечное_дело, [7]∉[8,25]) → 5 → pин красный.
   Дедупликация по виду (Set) ОБЯЗАТЕЛЬНА (NPC с 2 навыками одного
   вида).
6. **Зачарование — явный spellId ВСЕГДА.** Дефолт ядра
   `recipe.заклинания[0]`/`spells[0]` может быть НЕ изучено →
   передать ТОЛЬКО изученный id. Не передавать spellId для
   не-зачарования (иначе блок заклинания canCraft сработает
   ложно).
7. **CSS-скоуп.** Все новые правила — `.craft-*` / `.craft-overlay`;
   общие `.cp-*`/.combat-* — НОЛЬ правок (пины ui-panel/ui-skills/
   building-effects/combat-layout). Блок — конец `<style>`, ПОСЛЕ
   dungeon/npc-правил (позиция каскада: `.craft-overlay {display:
   block}` побеждает по порядку).
8. **VM-песочницы подхватывают новый <script> автоматически**
   (CHAIN из index.html) — boot errors.length===0 ОБЯЗАТЕЛЕН для
   ВСЕХ существующих vm-цепей (main-visuals/save-restore/
   sprites/building-effects/combat-ui/dungeon-ui) — craft-ui.js
   должен грузиться чисто (без craft.js — деградация строки 'craft',
   без краха).
9. **npc.test.js — node-тесты** (не vm): диалог/ментор тестируются
   в node с require(npc.js) + fake Game.Craft (задать
   globalThis.Game явно, паттерн craftReprocessHook-тестов).
   globalThis.Game в node-тестах НЕ трогать глобально — задавать и
   убирать в рамках кейса.
10. **npm test — ВНУТРИ worktree** (node --test сканирует .worktrees/
    рекурсивно — memory/test-runner-worktrees.md).
11. **Коммиты:** «Задача 000126: …» + Co-Authored-By (см. системный
    reminder). Красная стадия закоммитит memory ВМЕСТЕ с красными
    тестами. CHANGELOG — отдельный коммит стадии мержа (дата
    2026-10-03).

## Карта тестов (RED — падают до реализации, ОСМЫСЛЕННО)

База npm test (worktree): 1356/1356.

* **tests/craft-ui.test.js (НОВЫЙ, vm-полная цепь index.html,
  паттерн ui-skills/combat-ui/dungeon-ui):**
  * CU-1 (wiring): `Game.craftUI` существует;
    `Game.buildingActions.specials.craft` — функция (спец-зарегистрирован).
  * CU-2 ([E] вход, без NPC): на крафтовом здании без эффектов/NPC
    buildingActions() несёт строку id 'craft'; onBuildingAction(
    'craft',…) → `Game.craftUI.isActive()` true, оверлей
    `.craft-overlay`/`.craft-panel` в DOM.
  * CU-3 ([E] вход, с NPC): у здания с NPC строки ['dialog','craft']
    (порядок), крафт-строка на месте.
  * CU-4 (состав экрана): рецепт сгруппирован по виду; вид с
    craftLevel; рецепт с «нужно ур. N / есть L»; исходники с
    пометкой нехватки; шанс качества/выхода; результат; кнопка
    «изготовить».
  * CU-5 (крафт, детерминированный Math.random в песочнице):
    нажатие «изготовить» → предмет в инвентаре, качество/выход,
    xp/уровень виду в лог; исходники списаны.
  * CU-6 (зачарование): рецепт зачарования — пикер ТОЛЬКО изученных
    заклинаний (с маной); выбор + крафт → мана списана, бонус
    заклинания применён.
  * CU-7 (деградация): цепь БЕЗ craft.js → строки 'craft' нет,
    craft-ui.js грузится чисто (console.error, без краха);
    40/42 — крафт доступен 2-й раз в день (осиротевшая марка не
    гасит).
* **tests/craft-mentor.test.js (НОВЫЙ):**
  * ND-1 (node): dialogOptions для Торна ([8,25], forge) — опция
    «обучить кузнечное_дело» (действие 'обучить_крафт', вид);
    trainNpc ([7], heavy) — опции НЕТ (o.length===4, регрессия);
    NPC без постройке вида — нет; мало золота/макс. ур. — причина.
  * ND-3 (vm): клик по ментор-опции в npcUI диалоге → mentorCraft:
    gold −цена, уровень виду +1 (лог «Уровень …»).
* **tests/craft-layout.test.js (НОВЫЙ, статика, паттерн npc-layout):**
  * CL-1: `.craft-panel` — весь экран (100%×100%/inset:0) + flex-
    колонка, без скролла панели.
  * CL-2: `.craft-body` (тело) — flex:1, min-height:0, overflow-y:auto.
  * CL-3: `.craft-log` — max-height vh + overflow-y:auto.
  * CL-4: `.craft-overlay` — display:block (отсечение от flex-center)
    + непрозрачный фон.
  * CL-5: колонка контента (в craft-скоупе) — max-width 640…720px +
    центрирование.
  * CL-6: src/craft-ui.js строит `el('div','craft-panel')`.
  * G2 (стража): общие `.cp-title`/`.cp-itemrow`/`.cp-items` и чужие
    оверлеи (.combat-side 320px, .dungeon-overlay .combat-side 270px,
    .npc-panel) — на месте, не тронуты.
* **tests/index-order.test.js:** +1 строка 'src/craft-ui.js' в
  «нужные модули»; +1 тест IO: pos(craft.js) < pos(craft-ui.js);
  pos(building-actions.js) < pos(craft-ui.js); pos(craft-ui.js) <
  pos(main.js).
* expectedRedCount (красные): CU-1…CU-7 (7) + ND-1, ND-3 (2) +
  CL-1…CL-6 (6) + IO (1) = **16** новых красных; регрессия БЕЗ
  правок: building-effects (A1 keys EFFECTS не меняется — синтеза
  строки нет в EFFECTS; A2 {id:97}→[]), npc.test (o.length===4),
  combat-layout, ui-panel, main-visuals, save-restore, craft-core.

## План реализации (файлы / дельта)

1. «Задача 000126: красные тесты + память» (один коммит):
   tests/craft-ui.test.js (~350–450), tests/craft-mentor.test.js
   (~150–200), tests/craft-layout.test.js (~120–160),
   tests/index-order.test.js (+1 тест ~15, +1 строка в массиве),
   memory/000126-craft-screen.md + memory/000126-craft-ui.md.
   npm test: 1356 зелёных + 16 красных.
2. «Задача 000126: экран крафта + ментор (код)» (один коммит):
   * src/craft-ui.js (НОВЫЙ, ~450–550: UMD + open/close/isActive +
     buildDom/render/onOverlayClick/keyHandler + саморегистрация
     спец-а 'craft').
   * src/building-effects.js (+15–25: синтез строки 'craft' в
     buildingActions, после цикла эффектов).
   * src/npc.js (+25–35: синтез ментор-опций в dialogOptions).
   * src/ui.js (+15–25: ветка 'обучить_крафт' в onOverlayClick, акт
     'opt').
   * src/building-actions.js (+4–6: гард закрытия craftUI в toggle(),
     после dungeonUI-гарда).
   * src/main.js (+8–12: гейт keydown после buildingUI-гейта; inCraft
     в frame; 3× `G.craftUI.close()` в startCombatAt/maybeStartCombat/
     startDungeonCombat).
   * index.html (+~55: CSS-блок в конце `<style>`; +1 <script> в слоте
     спец-модулей после hud.js).
   * SPEC.md «Крафт» (+~2: примечание «UI реализован (000126)»).
   npm test — весь зелёный.
3. (стадия мержа) CHANGELOG.md — `## 2026-10-03` → `### Игровой
   процесс` («Крафт у построек: [E] → «Крафт» — рецепты по видам,
   исходники, качество/выход, зачарование; наставники обучают видам
   крафта в диалоге») + `### Интерфейс` («Полноэкранный экран
   крафта у построек (Кузница, Лаборатория, Рунический камень, …)»);
   отдельный коммит «Задача 000126: CHANGELOG — …».
   tasks/pending/000126.md → tasks/done/ + tasks/result/000126.md.

Итого ~9 файлов, +~1100/−5 строк (код + тесты + память).
Спец-модулей-файлов: 1 (craft-ui.js, несёт и спец-хендлер).
Каталогов/SVG — НЕТ.
