# 000239 — flame_step: лендинг = полная после-шажная последовательность — КОНТРАКТ (проектирование)

Статус: ЗАВЕРШЕНО (финализация 2026-10-23; проектирование
2026-10-22). Реализация 521f5ae, красные 5df2cf3, отчёт
tasks/result/000239.md, задача перенесена в done. База — master
1c5aaec (000235.09 Волна Тень уже в master — shadow_step
переиспользует performFlameStep, main.js:2004 — до D1; после
000239 shadowStep: performShadowStep, §3). ТЗ: tasks/done/000239.md.
Источник: findings #1–#6 ретро tasks/result/000235.07-retro-20261022.md.
Анализы: a1-domain / a2-arch / a3-tests (/tmp/thegame-wf-000239/).
Базовая линия: npm test в worktree — 3057/3057 pass, 0 fail.
Связанные: memory/000235.07-fire-wave-content.md (§2.4 — обновлён этой
задачей), memory/000235.09-shadow-wave-content.md (§5.4 — суперсидирован
§3 ниже, файл НЕ трогается), memory/000235.04-portals-mechanic.md (gate —
бит-в-бит).

Координаты ТЗ (по 3e76a12) сдвинуты — фактические на 1c5aaec:
performFlameStep — main.js:1942-1992; gate-ctx — main.js:2005-2021
(passable :2010-2015, teleport :2016); frame world-шаг — main.js:
3705-3728; dungeonOnMove — main.js:2829-2876 (chest-блок 2841-2875);
dungeonMove — locations.js:403-457 (хвост 426-456); moveHero —
main.js:1725-1730; maybeStartCombat — main.js:2376+; enterLocation —
main.js:2528-2556; tileAt — map.js:1075-1131; findZoneCombat/
groupZoneInfo — combat.js.

=====================================================================
§1. ЧТО ДОБАВЛЕНО / ПЕРЕНОСЕНО — Контракт post-landing
=====================================================================

1.1 Порядок вызовов ПОСЛЕ успешного ландинга (успех = resolveTeleportStep
    вернул ok:true; постановка героя — как сейчас, см. §1.2). Паритет с
    обычным шагом — НИ ОДИН существующий вызов/порядок не меняется;
    новые вызовы — только после постановки:

    ДЗ: постановка + mover.step (НЕ МЕНЯЕТСЯ) →
        ev = G.locations.dungeonPostMove(ds)  [typeof-гард, §6]
        → dayBefore = clock.day → clock.addStep(1)
        → ev.type === 'combat' → startDungeonCombat(ev.group)
        | ev.chest → applyDungeonChest(ds, ev.chest, dayBefore)
        → saveNow()
    МИР: moveHero(...) (prevPos-снап, НЕ МЕНЯЕТСЯ)
        → clock.addStep(1)
        → if (!maybeStartCombat(true, now)) enterLocation()
        → saveNow()

    Почему именно так: зеркало frame() (main.js:3716-3727: addStep ДО
    скана/входа, saveNow ВСЕГДА после, в т.ч. при старте боя) и
    dungeonOnMove (main.js:2835-2875: addStep ДО combat-ветки — T-6
    «шаг, запускающий бой, считается»; chest-награда ПОСЛЕ addStep —
    dayBefore для флэша смены дня). Бой-ландинг в ДЗ: wanderStep НЕ
    вызывается (дungeonPostMove ранний return — паритет dungeonMove/
    LOC-8); на бой-ландинге saveNow — НОВАЯ точка сейва (обычный
    dungeon-шаг на бою сейва не делал — onEnd сейвит в конце боя);
    намеренно (цель ТЗ: «телепорт не обходит сейвы»).

1.2 Что перенесено (чистые экстракции, БИТ-В-БИТ — фиксаторы без
    ре-пинов):

    src/locations.js:
    * dungeonPostMove(ds) — НОВЫЙ экспорт: дословный хвост
      dungeonMove (старые :426-456): c.mobs.find(!defeated &&
      x===ds.x && y===ds.y) → {type:'combat', group} (wanderStep НЕ
      вызывается) | c.chests.find(!opened && ...) → G.openChest
      (гард + console.error дословно) → {gold, item} → G.wanderStep
      (гард + console.error дословно) → {type:'moved', chest}.
      Без аргумента now (now используется только в mover.step —
      остаётся в dungeonMove). G — lazyGame() в момент вызова
      (rootRef-паттерн модуля, как в оригинале). null НЕ возвращает
      (гарды головы — в dungeonMove).
    * dungeonMove(ds, dx, dy, now, opts) — голова (гарды
      !ds/inCombat/границы/CELL_FLOOR, постановка ds.prevX/prevY/x/y,
      mover.step) НЕ МЕНЯЕТСЯ; хвост заменён
      `return dungeonPostMove(ds);` — поведение бит-в-бит
      (LOC-6/LOC-8: порядок mover.step → openChest → wanderStep).
    * Экспорт (return-объект :821-824): += dungeonPostMove.

    src/main.js:
    * applyDungeonChest(ds, chest, dayBefore) — НОВЫЙ function-
      декларатив в том же IIFE (размещение — рядом с dungeonOnMove;
      hoisting закрывает обращение из performFlameStep): дословный
      chest-блок main.js:2841-2875 (hero.gold += gold; item:
      G.getItem → G.addItem / overflow-золото по value / « (не
      влезло: +N золота)»; msg «Сундук: +N золота…»; ds.log.push;
      hudFlash = (clock.day !== dayBefore ? hudFlash+'\n' : '') +
      msg; hudFlashUntil = now+5000; G.playerUI.render()).
      dungeonOnMove вызывает его — бит-в-бит (T-11-пины).
    * tileLandingPassable(tx, ty, allowEntrance) — НОВЫЙ world-
      предикат (§4).
    * dungeonCellPassableAt(cx, cy) — НОВЫЙ (дословно dungeon-ветка
      старого cellPassable: !d/!d.cells → false; bounds;
      d.cells[cy*d.width+cx] === G.CELL_FLOOR).
    * resolveTeleportStep(passableFactory) — НОВОЕ ядро (общее для
      flame/shadow): город-гард «в городе телепорт недоступен» →
      inDungeon → sx/sy/dx/dy из ds.prevX/prevY | prevPos →
      |dx|+|dy| !== 1 → «нет направления движения» → ray k=1..10 по
      passableFactory(inDungeon) (landing = дальший проходный) →
      landing === 0 → «некуда шагнуть». Возврат { ok:false, reason }
      | { ok:true, inDungeon, sx, sy, dx, dy, landing }. Отказы
      СЛОВО-В-СЛОВО.
    * shadowStepPassable(inDungeon) / flameStepPassable(inDungeon) —
      НОВЫЕ фабрики предикатов (возвращают (cx,cy)=>bool):
      shadow: dungeon → dungeonCellPassableAt / world → t.passable
      (СТАРОЕ); flame: dungeon → dungeonCellPassableAt (D2 —
      БЕЗ ИЗМЕНЕНИЙ) / world → tileLandingPassable(cx,cy,true) (D3).
    * applyTeleportPlacement(r) — НОВОЕ общее тело постановки
      (идентично в обоих хэндлерах, дословно из старого тела):
      dungeon — ds.prevX/prevY = old; ds.x/y += dx*landing;
      ds.mover.step(prev→next, now) | world — moveHero(sx+dx*
      landing, sy+dy*landing).
    * performShadowStep() — НОВОЕ имя СТАРОГО тела (D1):
      resolveTeleportStep(shadowStepPassable) → отказ |
      applyTeleportPlacement → {ok:true}. БЕЗ post-step — бит-в-бит
      с performFlameStep master 1c5aaec.
    * performFlameStep() — НОВОЕ тело: resolveTeleportStep(
      flameStepPassable) → отказ | applyTeleportPlacement →
      post-landing по §1.1 → {ok:true}.
    * Wiring main.js:2003-2004: `flameStep: performFlameStep,
      shadowStep: performShadowStep`.
    * Gate-ctx: `passable: (tx,ty) => tileLandingPassable(tx,ty,
      false)` — семантика БИТ-В-БИТ (та же таблица истинности, §4).
      teleport-строка и всё остальное ctx — НЕ МЕНЯЕТСЯ.

    НЕ ТРОГАЕТСЯ: src/spells.js (castOutOfCombat — cbKey уже по
    spellId, :851; мана ДО cb; записей нет), src/spellbook-oc.js
    (оба ctx-ключа flameStep/shadowStep уже прокинуты),
    src/dungeon-ui.js, index.html, tests/index-order.test.js,
    assets/, SPEC (контентные волны SPEC не пишут — 000235.06 п.5),
    формат сейва v1 (collectSaveData не трогаем).

1.3 Владение состоянием (без изменений): ds (позиции/prev/contents/
    log) — владеет caller (main.js), locations.js — чистые функции
    (ds — аргумент); hero.gold/инвентарь — main.js; defeatedAt —
    main.js (Map); clock — main.js; tileCache — map.js (mutable-кэш,
    не пересчитывается). НОВЫХ полей состояния НЕТ.

1.4 Брейкпоинты/ассеты: НЕТ. Новых модулей, script-тегов, SVG, JSON
    каталогов НЕТ → index.html/index-order/svg.test.js — ноль правок.

=====================================================================
§2. РЕШЕНИЯ D1–D9 (фиксация станции Проектирование)
=====================================================================

D1. Декаплинг shadow_step: старое тело performFlameStep →
    performShadowStep (бит-в-бит); новый performFlameStep — с
    post-landing. Почему: ТЗ «shadow_step — НЕ трогать и НЕ
    синхронизировать», а shadowStep: performFlameStep (main.js:2004) —
    одна функция: фикс на месте АВТОМАТИЧЕСКИ синхронизировал бы
    shadow_step (нарушение ограничения); альтернативы без раздвоения
    нет. Провал у shadow_step (тот же — НЕТ post-landing) —
    ОТДЕЛЬНАЯ задача, 000239 её НЕ чинит (§3).
D2. ТЗ п.2 = вариант (а) (приоритет ТЗ): dungeon-предикат flame НЕ
    меняется (bounds + CELL_FLOOR); ландинг на тайл undefeated-группы
    РАЗРЕШЁН → post-landing-чек → бой. Почему: ретро #1 — бой
    ДОЛЖЕН начинаться (паритет с обычным шагом: шаг на тайл группы =
    бой), а не исключаться; «мобы/сундуки НЕ блокируют луч» — часть
    §2.4, НЕ опровергнутая (опровергнут только «САЙД-ЭФФЕКТОВ НЕТ»).
    Вариант (б) отвергнут.
D3. World-предикат = gate-семантика + ИСКЛЮЧЕНИЕ ВХОДА:
    tileLandingPassable(tx,ty,allowEntrance); flame — allowEntrance=
    true, gate — false (бит-в-бит). Почему: enterLocation →
    maybeEnterCity срабатывает ТОЛЬКО на тайле hasBuilding, а
    hasBuilding = ровно тайл ВХОДА (map.js:1092); входной тайл —
    ЕДИНСТВЕННЫЙ inBuilding-тайл с passable=true (остальной footprint
    passable=false, map.js:1081) — без исключения луч остановится
    ПЕРЕД входом и ТЗ-тест (б) «лендинг на вход → город зашёл сразу»
    недостижим. Разрешает внутренний конфликт ТЗ (п.1 буквальная
    gate-форма vs тест (б)).
D4. Часы ТИКАЮТ (дефолт ТЗ п.4): clock.addStep(1) после успешного
    ландинга в ОБЕИХ ветках; ДЗ — wanderStep ровно 1 раз (внутри
    dungeonPostMove на нон-бой ландинге; бой-ландинг — 0, ранний
    return). Почему: симметрия с обычным шагом; альтернатива
    «телепорт вне часов» = 10 клеток за нулевую цену дня + заморозка
    блуждания мобов (ретро #4).
D5. saveNow() после успешного ландинга в ОБЕИХ ветках, в КОНЦЕ
    последовательности (мировая — после maybeStartCombat/enterLocation,
    в т.ч. при старте боя — как frame():3727). Почему: ретро #6 —
    crash сразу после каста не должен терять позицию; у gate-
    телепорта сейв есть (main.js:2016) — паритет телепортных
    механиков.
D6. prevPos: мир — снап moveHero на ТАЙЛ ЛАНДИНГА (moveHero НЕ
    меняется); ДЗ — ds.prevX/prevY = ТЧКА СТАРТА (постановка НЕ
    меняется). Почему (мир): (a) frame-loop автоуок использует
    prevPos как якорь глейда (mover.step(prevPos→player)) —
    восстановление точки каста = обратный 10-клеточный слайд
    спрайта; (b) зона-бой стартует «на месте» (скан ПОСЛЕ
    постановки): «тайл, с которого зашёл в бой» = тайл ландинга;
    побег/смерть — герой остаётся на лендинге (возврат на
    prevPos в onEnd). Почему (ДЗ): побег/смерть в dungeon-бою возвращают на
    старт прыжка; коридор старт→лендинг гарантированно чист (ray:
    ВСЕ клетки 1..landing — CELL_FLOOR). Ответ на флаг a3
    «принять/снапать до moveHero» — ПРИНЯТЬ снап moveHero (без
    правок).
D7. Порядок — паритет с обычным шагом; существующий порядок вызовов/
    RNG НЕ меняется (новые вызовы — только после постановки, §1.1).
    Почему: «те же проверки и побочные эффекты, что обычный шаг»
    (ТЗ-цель); T-6/T-11-семантика (addStep до combat/chest-ветки).
D8. Деградация (UMD): G.locations.dungeonPostMove отсутствует
    (недостижимо — index-order-пины, но guard обязателен — UMD-
    ловушка старого билда) → call-time typeof-гард + console.error
    (ОДИН раз, паттерн флагов lootWarned/saveWarned main.js:600/832)
    + пропуск чек-хвоста (бой/сундук не проверяются), ландинг/
    часы/сейв выполняются — деградация до pre-fix поведения, игра
    не падает. Почему: паттерн 000038/000053 (отсутствие
    зависимости — console.error + деградация).
D9. НОЛЬ новых RNG: openChest — без RNG (содержимое
    предгенерировано, dungeon.js); wanderStep — СОБСТВЕННЫЙ
    детерминированный поток mulberry32(hash2(contents.step,
    contents.seed, 0x7777)) — глобальный rng не трогает; зона-бой —
    seed hash2(тайл ГРУППЫ, 0x5eedc0de); enterLocation — по
    сидам/памяти. Формат сейва v1 — без изменений. Единственный
    сдвиг дет-потоков: содержимое ДЗ — contents.step теперь тикает
    на ландинге → последующие wander-ходы обычных шагов сдвинуты
    относительно master — НАМЕРЕННО (ТЗ п.4: телепорт — движение,
    тикает день как шаг).

=====================================================================
§3. ДЕКОПЛИНГ SHADOW (суперсидирует memory/000235.09 §5.4 п.4)
=====================================================================

* memory/000235.09 §5.4 п.4: «shadowStep — второй колбэк-ключ на
  performFlameStep (flameStep не переименован — .07-пины)» —
  УСТАРЕЛО после 000239: ctx-КЛЮЧ shadowStep жив (spells.js:851
  cbKey, spellbook-oc.js :206-209/:249-252 — всё как было), но
  ОБРАБОТЧИК больше не общий: main.js:2004 `shadowStep:
  performShadowStep` (новая функция — старое тело бит-в-бит).
  Файл memory/000235.09 НЕ трогается (мастер) — supersede этой
  заметкой.
* performShadowStep = performFlameStep master 1c5aaec Дословно:
  предикаты dungeon CELL_FLOOR+границы / world t.passable (без
  !inBuilding, без !hasMobGroup), постановка, БЕЗ post-landing
  (нет combat/chest/wanderStep/addStep/saveNow/zone-скана/
  enterLocation).
* ТОТ ЖЕ ПРОВАЛ у shadow_step (нет после-шажной последовательности)
  — ОТДЕЛЬНАЯ задача (создать после мержа 000239, если решено
  чинить); 000239 shadow НЕ синхронизирует (ТЗ «Ограничения»
  дословно).
* Следствие для тестов: shadow W-10b (tests/spellbook-oc-e2e.test.
  js:1262) — БЕЗ ре-пинов (поведение shadow бит-в-бит: позиция-
  пины A–D/E, mp −5, отказы); коммент в шапке теста про
  «переиспользование performFlameStep» станет неточным по имени —
  правка текста коммента — техническая, по факту (не обязательна
  в скоупе; поведение не меняется).
* Новые тесты 000239 — ТОЛЬКО для flame_step; shadow-сценарии
  (часы/бой/сундук с ландинга) НЕ пиняются (т.к. не реализованы).

=====================================================================
§4. WORLD-ПРЕДИКАТ: gate-семантика + isEntrance-исключение
=====================================================================

* Формула (main.js):
  tileLandingPassable(tx, ty, allowEntrance) =
    !! (t && t.passable
        && (!t.inBuilding || (allowEntrance && t.isEntrance))
        && !(t.hasMobGroup && !defeatedAt.has(tx + ',' + ty)))
  где t = map && map.tileAt(tx, ty).
* Дельта против старого flame world-предиката (t.passable only):
  (1) + «не на тайле ЖИВОЙ группы» (gate-семантика, ретро #4):
  луч останавливается ПЕРЕД undefeated-группой → ландинг на/за
  группу невозможен; повержённая группа (defeatedAt) — проходима
  (бит-в-бит с gate); (2) входной тайл проходим ТОЛЬКО при
  allowEntrance=true.
* Таблица истинности (tileAt, map.js:1075-1131):
  - вход (isEntrance): passable=true, inBuilding=true, hasMobGroup
    = false (hasMobGroup требует !cover, :1096) → flame: ЛАНДАБЕЛ
    → enterLocation открывает город/пещеру сразу; gate: НЕ
    (allowEntrance=false).
  - footprint non-entrance: passable=false → блокирован t.passable
    (исключение не срабатывает).
  - тайл живой группы: passable=true, inBuilding=false,
    hasMobGroup=true → flame: блокирован (новый отказ/остановка
    луча); gate: как был.
  - вода/горы: passable=false → блокирован (как был).
* Gate: `passable: (tx,ty) => tileLandingPassable(tx,ty,false)` —
  при allowEntrance=false клауза `(!t.inBuilding || (false &&
  t.isEntrance))` ≡ `!t.inBuilding` — ТА ЖЕ таблица истинности,
  что main.js:2012-2014 → БИТ-В-БИТ; E1–E6
  (portal-mechanic-e2e) — без ре-пинов (проверка на зелёной
  стадии; ТЗ п.1 «предикат выносится, поведение не меняется»).
* Асимметрия world/дungeon — НАМЕРЕННАЯ (ТЗ п.1 для мира +
  приоритет (а) для подземелья; тест-строка ТЗ «отказ или бой —
  по решению п.2»): мир — луч останавливается перед живой группой
  (отказ/ранее ландинг); dungeon — луч проходит ЧЕРЕЗ тайл группы
  (D2: лендинг на группе → бой). Dungeon «построек» не имеет —
  !inBuilding-клаузы в ДЗ-ветке не существует.
* frost_walk НЕ учтён (луч не знает heroPassable: герой на воде
  не может телепортироваться по воде) — предсуществующая
  непоследовательность (ретро info #11), НЕ в скоупе ТЗ; не чинить
  здесь (§8).

=====================================================================
§5. PREVPOS-СЕМАНТИКИ (D6 — развёрнуто)
=====================================================================

* Мир: prevPos = тайл ЛАНДИНГА (снап moveHero, main.js:1728 — НЕ
  меняется). Повторный каст после телепорта в мире — отказ «нет
  направления движения» ВСЕГДА (было так же на master — a1 D-D).
  Побег/смерть в зона-бое, стартовавшем с ландинга — возврат НА
  ТАЙЛ ЛАНДИНГА (возврат на prevPos в onEnd): герой остаётся на
  месте, бой не «расползается» на точку каста.
* Dungeon: ds.prevX/prevY = ТЧКА СТАРТА (постановка main.js:1981 —
  НЕ меняется). Побег/смерть в dungeon-бою — возврат на старт
  прыжка; коридор гарантированно чист (ray: все клетки 1..landing —
  CELL_FLOOR), герой не «возвращается в стену/группу».
* Известное ПРЕДСУЩЕСТВУЮЩЕЕ поведение (задокументировано, НЕ
  чинится — вне скоупа ТЗ): dungeon-лендинг с landing=1 оставляет
  (ds.x−ds.prevX, ds.y−ds.prevY) = (dx, dy) → повторный каст
  ВАЛИДЕН — цепочка телепортов по 10 (было на master, a1 D-D).
  Отказ «закрыть цепочку» (вариант a1 R7 — нулевой шаг
  dungeonMove(ds,0,0) перезаписывает prevX/prevY на ландинг) —
  ОТВЕРГНУТ: это изменение поведения ВНЕ ТЗ (TЗ молчит о повторном
  касте; пины W-10b не покрывают). После фикса цепочка не
  «бесплатна»: каждый прыжок = +1 день-шаг (addStep) + 1 wanderStep
  + saveNow + возможные бой/сундук.

=====================================================================
§6. ЛЕНИВЫЕ ССЫЛКИ И ДЕГРАДАЦИЯ (UMD)
=====================================================================

* main.js: G — снапшот const на входе IIFE (UMD-ловушка 000038);
  G.locations — свойство снапшота (locations.js пинан index-order
  ДО main.js). Новая ссылка G.locations.dungeonPostMove читается в
  момент ВЫЗОВА (как G.locations.dungeonMove в dungeonOnMove:2832) —
  не фиксировать на входе (прецедент 000038: снапшот Game один
  раз; свойства — live).
* locations.js: dungeonPostMove — lazyGame() в момент вызова
  (rootRef-паттерн :62, как в хвосте, из которого извлечён):
  G.openChest / G.wanderStep — лениво; гарды + console.error —
  дословно из оригинала (отсутствуют → сундук не открывается /
  блуждание пропущено — деградация, не крах).
* Хэндлер: `G.locations && typeof G.locations.dungeonPostMove ===
  'function'` — иначе console.error ОДИН раз (новый let-флаг рядом
  с хэндлерами, паттерн lootWarned/saveWarned) + ev = null →
  combat/chest-ветки пропускаются, addStep/saveNow выполняются —
  деградация до pre-fix поведения, игра не падает. Недостижимо в
  здоровом билде (export + index-order), но guard обязателен
  (UMD-ловушка).
* map/defeatedAt/clock/hero — замыкания main.js (let/const IIFE) —
  читаются live, как в gate-ctx. `map` — let (переприсваивается
  при загрузке мира) — чтение в момент вызова (паттерн
  outOfCombatCtx-функции).
* Новых модулей/тегов НЕТ → index.html, tests/index-order.test.js —
  ноль правок (scriptTagPosition: «нет новых модулей»).

=====================================================================
§7. ТЕСТ-ПИНЬЫ (tests/spellbook-oc-e2e.test.js — ЕДИНСТВЕННЫЙ
    тестовый файл; harness уже имеет boot/seedSave/press/clickRow/
    learn/saveHero/resolveCombat/walkTiles/findCityFor/enterCity/
    makeStepper; CHAIN из index.html)
=====================================================================

RED (7 — падают на master осмысленно: отсутствуют ВЫЗОВЫ
post-landing-последовательности в performFlameStep, не
синтаксис/фикстуры):
* FS-D1 (ДЗ): досеянная моб-группа НА ТАЙЛЕ ЛАНДИНГА (seeded
  ds.contents.mobs {id, mobIds, x, y, level, defeated:false},
  комната-фикстура W-10b) → каст → бой (combatUI.isActive, group —
  из contents, герой на тайле группы, mp −7, записей НЕТ, книга
  закрыта); contents.step НЕ тронут (бой → wanderStep НЕ вызван —
  зеркало LOC-8); победа (resolveCombat 9999) → group.defeated +
  stepsToday +1 (зеркало T-6: шаг/лендинг, запускающий бой,
  СЧИТАЕТСЯ).
* FS-D2 (ДЗ): сундук НА ТАЙЛЕ ЛАНДИНГА (ds.contents.chests {id,
  x, y, opened:false, gold, item?}) → каст → chest-поток:
  ch.opened=true, hero.gold +gold, ds.log «Сундук: +N золота»
  (+item-строка), hudFlash (день не сдвинулся → без «День N.»),
  contents.step +1 (wanderStep отиктил), mp −7.
* FS-W1 (МИР): старт ВНЕ зоны (Чебышёв ≥ 3 от тайла триггерящей
  группы), каст → луч останавливается ПЕРЕД тайлом живой группы
  (новый предикат) → ландинг ВНУТРИ зоны (Чебышёв ≤ 2) → зона-бой:
  spyStartCombat calls===1, opts.seed === G.hash2(gx, gy,
  0x5eedc0de), opts.tile — ТАЙЛ ГРУППЫ, combatUI активен, герой на
  ландинге ПЕРЕД тайлом группы. ВНИМАНИЕ: радиус зоны — ФАКТ 5×5
  (radius 2, только aggressive/territorial), НЕ «11×11/≤5» из ТЗ
  (неточность — §8).
* FS-W2 (МИР): лендинг РОВНО на ТАЙЛ ВХОДА города → g.dungeon.kind
  === 'city' СРАЗУ после clickRow (оверлей в body), НЕ «на
  следующем шаге».
* FS-W3 (МИР): RAW-чтение localStorage (БЕЗ beforeunload — saveHero
  дёргает сейв и замаскирует пин) СРАЗУ после clickRow →
  data.position === тайл ландинга (пин saveNow ИЗ хэндлера; на
  master — позиция до каста).
* FS-T1 (ДЗ): после успешного (non-combat) ландинга: stepsToday +1
  (день не сдвинулся) И wanderStep РОВНО РАЗ: contents.step +1,
  досеянная группа (НЕ на тайле ландинга) сдвинулась по своим
  правилам (новая позиция по mulberry32(hash2(step+1, seed,
  0x7777))).
* FS-T3 (МИР): после успешного ландинга stepsToday +1 (день не
  сдвинулся).

ЗЕЛЁНЫЕ coverage-пины (2 — зелёные и на master, ОБЯЗАТЕЛЬНЫ по ТЗ):
* FS-W4 (МИР): окружение тупиком (T проходим, T+d непроходим, T−d
  проходим; герой на T, направление d) → «некуда шагнуть»,
  позиция/mp/stepsToday без изменений (покрытие surface-ветки —
  ретро #5: ноль тестов).
* FS-P1 (МИР): луч блокируется ПОСТРОЙКОЙ (footprint non-entrance
  passable=false): ландинг ПЕРЕД footprint-тайлом; «некуда
  шагнуть» при footprint на k=1 (пин вынесенного предиката —
  был зелёным и на master; входной тайл покрывает FS-W2).

ФИКСТУРЫ (ассерты ВНУТРИ теста — краснота не от фикстур):
* FS-W1: паучье гнездо (2,3) g4 (триггерящее, mob-zones-e2e-карта):
  старт (−1,3) (dist 3 — вне зоны), направление (+1,0) реальным
  шагом (−2,3)→(−1,3), ландинг (1,3) (dist 1 — в зоне). Assert:
  (0,3)/(1,3) проходимы БЕЗ живых групп; (2,3) hasMobGroup +
  триггерящий класс.
* FS-W2: кандидат-город + направление D_in: E = вход (isEntrance,
  hasBuilding); E+D_in — inBuilding && !isEntrance (passable
  false — луч остановится на k=1); T = E−D_in проходим; НЕТ живой
  триггерящей группы в Чебышёве ≤ 2 от E (иначе зона-бой перекроет
  enterLocation — «бой > вход», frame-коммент). Герой: BFS-ход к
  T−D_in + реальный шаг T−D_in→T (задаёт направление), каст.
  Перебор кандидатов по findCityFor; если на seeded-карте
  кандидата нет — другой boot-seed (зафиксировать в имени теста).
* FS-W4: поиск тупика в детерминированной карте + assert-фикстура.
* ВСЕ новые сценарии: суммарные шаги < 40 (steps_per_day) →
  day НЕ сдвигается (явно ассертить «день не сдвинулся»);
  предупреждение ТЗ про «набегающие шаги» (hearthfire/firelight/
  frost_walk e2e) — ПРОВЕРЕНО: flame_step в них НЕ кастуется → не
  применимо.

БЕЗ РЕ-ПИНОВ (бит-в-бит — проверить на зелёной стадии; ЛЮБОЙ
ре-пин = сдвиг поведения = стоп):
* W-10b flame A–D/E (пустые contents: ландинги k=10/k=2/отказы
  — новые post-step на пустом = no-op: wanderStep на пустых
  mobs = только contents.step+1, clock+1 — пины A–D/E не читают
  часы/contents.step; день 1, << 40 шагов → rollover невозможен;
  E-город — отказ до луча);
* shadow W-10b (D1 — поведение бит-в-бит);
* gate E1–E6 (D3 — та же таблица истинности);
* Z1–Z8 (скан после ОБЫЧНОГО шага не тронут); T-1…T-11
  (dungeonOnMove — экстракция applyDungeonChest бит-в-бит);
  W-10a/W-04/W-10a-shadow (spells.js — НЕ ТРОГАЕТСЯ); LOC-6/LOC-8
  (дungeonMove — экстракция бит-в-бит); dungeon goldens; OC11–
  OC15, W-12b hearthfire, W-10b/W-10c frost_walk, W-11b/W-12b
  .08/.09 (не кастуют flame_step).
* Опционально (аддитивно, без правок существующих): LOC-кейсы на
  dungeonPostMove в tests/locations.test.js (контракт хвоста уже
  зажат LOC-8 через dungeonMove — по усмотрению red-стадии).

=====================================================================
§8. ВАЖНОЕ ДЛЯ БУДУЩИХ ЗАДАЧ / OPEN ITEMS
=====================================================================

* SHADOW_STEP — тот же провал (нет post-landing) — НАМЕРЕННО не
  чинится (D1, ТЗ «не синхронизировать»): после мержа 000239 —
  ОТДЕЛЬНАЯ задача (фикс shadow = зеркало flame: post-landing в
  performShadowStep).
* free_cast × flame_step (ретро major #3: дублирующая free-проверка
  в блоке castOutOfCombat не зафиксирована тестом) — задача
  000240 (pending).
* frost_walk × flame_step-луч (ретро info #11: луч не знает
  heroPassable — герой на воде «некуда шагнуть») — НЕ в скоупе
  ТЗ; отдельная задача при необходимости.
* Dungeon «цепочка бесплатных» телепортов при landing=1 (повторный
  каст валиден — §5) — предсуществующее поведение, сохранено;
  закрытие = отдельное решение (требует перезаписи prevX/prevY на
  ландинг — поведение ВНЕ ТЗ).
* ТЗ-неточность «зона 11×11, Чебышёв ≤5»: факт 000135 — зоны ТОЛЬКО
  aggressive/territorial, radius 2 = 5×5 (Чебышёв ≤ 2); neutral/
  timid — radius 1 (бой только на тайле) — combat.js
  groupZoneInfo/findZoneCombat, spec/mobs.md:107. Тесты — по
  факту.
* Координаты ТЗ устарели (список — шапка файла).
* memory/000235.07 §2.4 — ОБНОВЛЁН этой задачей: «САЙД-ЭФФЕКТОВ
  НЕТ» — УСТАРЕЛО; «мобы/сундуки НЕ блокируют луч» — В СИЛЕ в
  ДЗ (D2); мир — луч теперь останавливается перед живой группой
  (D3).
* CHANGELOG — решение станции мержа; РЕКОМЕНДАЦИЯ: ДА, одна строка
  ТОЛЬКО о flame_step (видимый игроку фикс: «Пламенный шаг» больше
  не обходит тайл-бой/сундуки/вход в город/игровое время). ВАЖНО:
  shadow_step НЕ меняется (D1) — в строке НЕ упоминается.
* Конфликтная зона: tests/spellbook-oc-e2e.test.js — волны
  000235.10/.11/.12 добавляют свои e2e-тесты в КОНЕЦ файла →
  новые тесты 000239 — В КОНЕЦ файла + перебазирование на master
  перед мержем (стандартный протокол); main.js (1942-1993,
  2829-2876) — параллельные pending-задачи сюда не бьют.

=====================================================================
§9. ПОДВОДНЫЕ КАМНИ
=====================================================================

* Экстракции ЧИСТЫЕ: LOC-8 (порядок mover.step → openChest →
  wanderStep), T-11 (chest-флэш + «День N.»), E1–E6, W-10b —
  красные линии; любой ре-пин = стоп.
* ПОРЯДОК addStep относительно combat/chest-веток СИГНИФИКАНТЕН:
  addStep ДО веток (T-6: шаг, запускающий бой, считается;
  dayBefore — ДО addStep, флэш смены дня — ПОСЛЕ).
* saveNow (мир) — ПОСЛЕ maybeStartCombat/enterLocation, в т.ч. при
  старте боя (паритет frame():3727); сейв при бое — НОВЫЙ для ДЗ
  (D5) — намеренно.
* Книга после каста: close() в castOutOfCombat — синхронно ок;
  applyVisibility после close — no-op.
* saveHero(h) в harness сам дёргает beforeunload→saveNow: FS-W3
  читает RAW storage ДО beforeunload (иначе пин зелёный ложно).
* spyStartCombat — ОТКАТ после под-сценария (или отдельный boot).
* enterLocation() из каст-хэндлера — мгновенная смена оверлея
  (startLocationUI) внутри click-обработчика — идентично обычному
  шагу (frame); guard `if (dungeonState) return` (main.js:2529)
  исключает двойной вход.
* Заряд рывка (000173) в зона-бое с ландинга: chargeTo = тайл
  игрока — штатный случай зона-атаки, без отклонений.
* inCombat-гард: performFlameStep вызывается ТОЛЬКО из
  castOutOfCombat (вне боя) → между кастом и post-landing бой
  невозможен → dungeonPostMove без inCombat-гарда безопасен
  (гард нужен только в голове dungeonMove, где вызовчик —
  dungeon-ui onMove).
* Код БЕЗ комментариев (CLAUDE.md): переносимый код сохраняет
  СУЩЕСТВУЮЩИЕ комментарии (бит-в-бит перенос); НОВЫЕ строки —
  без комментариев; информация — в этом файле.
* Полный npm test — ОДИН за раз в worktree (memory: параллельные
  полные прогоны запрещены; тест 000054 мутирует src/npc-data.js);
  flake — одиночный ре-ран + запись в отчёт.

=====================================================================
§10. ПЛАН РЕАЛИЗАЦИИ (по файлам, ожидаемая дельта)
=====================================================================

1. src/locations.js — НЕТ чужих правок кроме экстракции:
   + dungeonPostMove(ds) (~30 строк, перенос хвоста 426-456
   с комментариями); − хвост dungeonMove → 1 строка `return
   dungeonPostMove(ds);`; + 1 строка в export. Net: ~+8..12.
2. src/main.js:
   + dungeonCellPassableAt (~8), tileLandingPassable (~6),
   resolveTeleportStep (~24), shadowStepPassable/flameStepPassable
   (~12), applyTeleportPlacement (~14), performShadowStep (~6),
   performFlameStep (~36, вкл. post-landing + typeof-гард),
   applyDungeonChest (~30, перенос 2841-2875 с комментариями);
   − старое тело performFlameStep (51); − chest-блок
   dungeonOnMove → 1 строка; gate passable 5 строк → 2.
   Net: ~+60..70.
3. tests/spellbook-oc-e2e.test.js — +9 test() (7 red: FS-D1,
   FS-D2, FS-W1, FS-W2, FS-W3, FS-T1, FS-T3; 2 green: FS-W4,
   FS-P1) В КОНЕЦ файла, ~+280..380 строк (фикстуры + переис-
   пользование harness).
4. memory/000239-flame-step-landing.md — новый файл (этот).
5. memory/000235.07-fire-wave-content.md — §2.4: «САЙД-ЭФФЕКТОВ
   НЕТ…» → УСТАРЕЛО (000239) + ссылка сюда; «мобы/сундуки НЕ
   блокируют луч» — уточнение (ДЗ — в силе; мир — D3); R8 —
   пометка. ~±6 строк.
6. НЕ ТРОГАТЬСЯ: index.html, tests/index-order.test.js,
   src/spells.js, src/spellbook-oc.js, src/dungeon-ui.js,
   assets/, SPEC, tests/ (кроме п.3).
7. Красная стадия: 7 red падают осмысленно (остальные 3057+2
   зелёные); зелёная: все зелёные; ре-пины = 0. Коммит ОДИН:
   «Задача 000239: …» + Co-Authored-By (memory коммитится
   вместе). CHANGELOG — станция мержа.
