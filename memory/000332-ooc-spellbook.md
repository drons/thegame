# 000332 — кнопка книги заклинаний вне боя на экране

> **ОТМЕНЕНО 000351 (7c20152a).** Контракт кнопки ниже больше НЕ
> действует: кнопка [B] — 4-я `.tc-action` в #touch-controls (ui.js,
> `<img>` combat_spellbook.svg, append последним из четырёх);
> `.spellbook-oc-btn` в src/ и index.html НЕТ, тестовое правило B2
> теперь НЕГАТИВ (CSS-правила `.spellbook-oc-btn` удалено). Актуальный
> контракт — memory/000351-button-b-block.md. Текст ниже — исторический
> (контракт на момент 000332), не переписан (пометка по прецеденту
> 000360 П.2).

Задача 000332 (пункт 3 задачи 000235). Контракт кнопки + решение
анализа + подводные камни. Механика каста вне боя, невидимость и
порталы — КОНТРАКТЫ 000235: memory/000235.02-spellbook-out-of-combat.md
(книга + [B] + castOutOfCombat: мана ровно «мани», запись
{spellId, expiresDay}, перезаклинание = обновление, КУЛДАУНОВ НЕТ,
free_cast-исключение 000230.17), 000235.03 (невидимость: подавление
зон 1..3 дня, tile-бой сохранён, срыв в 3 точках в начале боя),
000235.04 (порталы: hero.portal_marker, nearestBuiltCity — Чебышёв +
лексикографический tie-break, 0 RNG, recall к метке).

## Корень (почему дельта — только кнопка)

Всё остальное ТЗ уже реализовано на master срезом 000235.X:
внебоевая книга + KeyB + HUD-хинт (000235.02), невидимость
(000235.03), порталы (000235.04), 21 внебоевое заклинание во ВСЕХ 6
школах с иконками (000235.07–.12: огонь 3 firelight/hearthfire/
flame_step, лёд 3 frost_walk/cold_breath/frozen_stillness, тень 4
shadow_step/invisibility/shroud_of_night/dark_presence, исцеление 4
prayer/divine_protection/holy_light/miracle, защита 4
stone_anchor/recall/gate/warding_circle, природа 3 wild_growth/
beast_friend/path_of_vines). Р-2 контракта 000235.02 явно отложил
кнопку: #hud — textContent-движок (pointer-events:none, детей чистит
каждый кадр, П10) — DOM-кнопку ВНУТРИ #hud нельзя; body-уровневая —
можно. 0 НОВЫХ заклинаний → 0 JSON, 0 иконок, 0 mirror-sync,
0 схемных изменений, save v1 не меняется (hero.portal_marker — уже
в формате, 000235.04). СПЛИТ НЕ СДЕЛАН (решение анализа: дельта —
~30 строк, нет второго независимого блока работ).

## Контракт кнопки

* DOM (src/main.js, wiring-блок 000235.02, ВНУТРИ if (G.spellbookOC)):
  button.spellbook-oc-btn — child document.body (создаётся при
  загрузке main.js, ПЕРЕД любым кадром/оверлеем). type='button',
  title 'Книга заклинаний (вне боя) [B]', ariaLabel-свойство
  (прямое присвоение — паттерн combat-ui/spellbook-ariaLabel,
  vm-стаб setAttribute роняет не-data атрибуты), ОДИН дочерний img.
* Иконка — ПЕРЕИСПОЛЬЗОВАНИЕ assets/ui/combat_spellbook.svg (существующая
  UI-иконка 24×24; НЕ spell-иконка паттерна 000302 — новых ассетов 0).
* CSS (index.html): .spellbook-oc-btn — position:fixed; top:12px;
  right:12px; z-index:15; круг (border-radius:50%, 36×36, img 24px,
  flex-центрирование — паттерн .tc-action/.fs-btn), палитра .fs-btn
  (background rgba(0,0,0,0.45), border 1px solid #6b6248,
  color #e8dcc0, hover rgba(0,0,0,0.65)). Позиция — правый ВЕРХНИЙ
  угол = свободная зона (#hud — левый верх, .fs-btn/[E]/[I] — правый
  низ, D-pad — левый низ).
* Z-gating (frame-хук src/main.js, динамический z-слот 000206/000256):
  готовый конст fsOver (inDungeon && !inCombat && !inNpc &&
  !inBuilding && !inCraft && !inResurrect) ПЕРЕИСПОЛЬЗУЕТСЯ (новый
  конст не введён): подземелье/город — inline z '25' (ПОВЕРХ
  dungeon-overlay z-20); мир/бой/активные UI — inline '' → CSS-база
  z-15 (в бою под оверлеем z-20). Аналогично существующим hud/fsBtn-
  строкам.
* Клик = G.spellbookOC.toggle() — ТОТ ЖЕ роут, что KeyB
  (main.js): та же blocked-политика (startWindow/combatUI/npcUI/
  buildingUI/craftUI/resurrectUI isActive, playerUI/squadUI isOpen →
  no-op). Под оверлеями кнопка инертна (в бою ещё и z-под оверлеем).
* Кнопка ВСЕГДА видна (без per-frame display-менеджмента): при 0
  изученных внебоевых заклинаний toggle() откроет книгу с
  СУЩЕСТВУЮЩИМ empty-стейтом «Нет изученных заклинаний вне боя»
  (spellbook-oc.js .spoc-empty) — решение анализа (аффорданс
  [B]/хинт при 0 спеллов тоже не гаснет — единая семантика).
* Инициализация G.spellbookOC.init(...) — ДО кнопки в том же блоке →
  ready=true до любого клика (console.error в toggle при !ready —
  недостижим).
* Load-clean: создание кнопки — 0 console.* (гарды typeof
  document.createElement === 'function' && document.body).

## 0-diff (механика каста НЕ ТРОНУТА)

src/spellbook-oc.js, src/spellbook.js, src/spells.js, src/save.js,
src/combat-ui.js, src/dungeon-ui.js, assets/spells/ (167 JSON +
schema.json), src/spells-data.js (W-08 пин 167 не тронут — 0 новых
заклинаний, транзиента sync:check НЕ БЫЛО), assets/skills/,
assets/mobs/, save v1, боевой путь каста (castRow/resurrectCast/
spellBtnOf/lastSpells, вкл. вкладки 000331). Кнопка — только точка
входа в существующий castOutOfCombat.

## Тесты

tests/spellbook-oc-button-000332.test.js (4; RED-коммит — 4/4
осмысленных красных, не краш):
* B1 — DOM-кнопка: скан body.children по className 'spellbook-oc-btn'
  (в стаб-нодах НЕТ id — makeEl; button создаётся JS main.js →
  присутствует во всех vm-песочницах); type/title/ariaLabel, один
  img (src/alt, иконка на диске); load-clean.
* B2 — CSS-пин: правило .spellbook-oc-btn (4 свойства) + лестничный
  коммент z включает кнопку (whitespace-normalized includes).
* B3 — клик открывает книгу на ВСЕХ 3 экранах (требование ТЗ):
  мир → g.actions.enterDungeon() → [E] выход → enterCity-протокол
  OC14 (findCityFor + walkTiles, c.fp>=2); на каждом: .spellbook-oc
  в body + G.spellbookOC.isOpen()===true; закрытие по KeyB.
* B4 — z-gating: мир '' / подземелье '25' / бой '' (g.actions.
  startCombat) + клик в бою = no-op (blocked → isOpen false).
Регресс (0 новых): боевой каст (combat-ui SB1, combat-spellbook-
tabs-000331 CBT-1..3), OOC-книга (OC11–OC18), невидимость
(invisibility-e2e IV-E1..E7), порталы (portal-mechanic-e2e + save
PM1/PM2), мана/длительность (OC1–OC7, spells.test.js W-08).

Мутационные проверки (БЕЗ коммита, git restore; паттерн 000335):
* M1 — убрать document.body.appendChild(sbBtn) → B1+B3 красные
  (скан пуст), B2/B4-ноги-с-кнопкой красные; B2-правило зелёное.
* M2 — в frame-хуке '25' → '' (убрать lift) → B4 красная только в
  подземельной ноге.
* M3 — убрать addEventListener('click', …) → B1/B2 зелёные, B3 и B4
  красные (B4 — харнес clickButton гейдит наличие click-listener,
  нога «no-op в бою» не доживает до ассерта — факт прогона).

## Подводные камни

* vm-стаб (makeEl, per-file дубль harness'а): свойства задаются
  напрямую (type/title/ariaLabel/src/alt — OK); setAttribute —
  только data-*; innerHTML НЕТ (детские элементы — appendChild);
  в стаб-нодах нет id → поиск кнопки ТОЛЬКО сканом body.children по
  className (querySelector('[data-…]') для кнопки не работает).
* fsBtn в vm-песочницах НЕ создаётся (fullscreen unsupported) — наша
  кнопка от fullscreen НЕ зависит (гард document.createElement/
  document.body) — отличие важно: B-тесты ищут именно нашу кнопку.
* sbBtn — let на верхнем уровне IIFE main.js (ВНЕ if-блока):
  frame-хук (объявлен ниже) видит его; объявление ВНУТРИ if-блока
  = синтаксически ОК, но frame не видит (scope) — не делать.
* С3 count-пин (spec-000235-wording): ВСЕ вхождения корня «кулдаун»
  в spec/spells.md == вхождения «кулдаунов нет» (1==1 на момент
  задачи) — в текст кнопки слово «кулдаун» НЕ ВВОДИТЬ; 9 S3-фраз
  секции — дословно (norm(h2)+includes).
* OC18 CSS-guard (tests/index-order.test.js): правила #hud /
  .combat-overlay--combat .combat-spellbook / .resurrect-overlay /
  #touch-controls НЕТРОГАТЬ; .spellbook-oc-btn — только НОВОЕ
  правило; лестничный коммент — расширение (комменты не пинуются
  OC18; пин — мой B2 whitespace-normalized).
* body.children: точных count-пинов body-детей НЕТ (только last-
  child/lastOverlay-паттерн) — кнопка добавляется при загрузке,
  ПЕРЕД открытием оверлеев → last-child-ассерты цёлы.
* index-order: в index.html только CSS, 0 новых script-тегов →
  цепочка CHAIN 0-diff.
* PARALLEL 000333: ОБЩАЯ строка "spells.md" в tests/spec-split.
  test.js (он тоже расширяет spells.md) → rebase-конфликт;
  разрешение = пересчёт wc -l ПО ДИСКУ после rebase (прецеденты
  000334/000331/000335). CHANGELOG — буллет финально в секции
  «## 2026-11-06» «### Игровой процесс» (дате мержа в master —
  правило CLAUDE.md; секцию 11-06 создал 000322, буллет — концом
  её секции, паттерн 000331): задача писалась 11-05 в секцию
  «## 2026-11-05» — при ре-базе на master с 11-06 ПЕРЕНОСИТЬ туда
  (конфликтующая область «Боевая книга»…«### Графика» — 0-diff с master).
* src/main.js — горячая точка (000331/000283.01.01 правили): 2
  компактных hunk'а (wiring + frame), ре-база на движущийся master
  → post-rebase перепроверка ПО ДИСКУ (wc -l spec/spells.md +
  срез + полный прогон в worktree, ОДИН за раз, pgrep перед
  запуском; 000054 мутирует src/npc-data.js).
* SPEC: ре-пин tests/spec-split.test.js «spells.md» В ТОМ ЖЕ
  коммите (wc -l финального файла, не «+N» на веру); H2-список
  НЕ МЕНЯЕТСЯ (кнопка — расширение первого буллета H2 «Каст вне
  боя»); новых форм «кулдаун» в файле НЕТ.
