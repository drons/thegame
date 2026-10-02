// Домен «действия у постройки [E]» (задача 000128 — разбиение main.js
// 2/4): роутер клавиши [E] на тайле постройки + проводка его действий
// (оверлей Game.buildingUI, применение эффектов из реестра
// src/building-effects.js, таблица СПЕЦ-ДЕЙСТВИЙ — обработчики со
// «стороной», мир-действия, которых нет в чистом apply: перенос
// героя, баффы, отдых, лечение…).
//
// Таблица спец-действий (контракт для задач 000074+ — memory/000128-
// building-actions.md): будущая задача-эффект добавляет спец-действие
// БЕЗ правок main.js и этого модуля: (1) чистая запись EFFECTS в
// building-effects.js, (2) при необходимости НОВЫЙ спец-модуль с
// саморегистрацией в момент загрузки (Game.buildingActions.
// registerSpecial(id, fn)) — script-тег ПОСЛЕ building-actions.js,
// ДО main.js (пин — tests/index-order.test.js), (3) ничего более.
//
// Чистый UMD-модуль (паттерн src/building-effects.js): node —
// require(), браузер — Game.buildingActions. В момент загрузки — НОЛЬ
// зависимостей: ни require, ни DOM, ни чтения Game, ни console
// (взаимных require в vm-песочницах при загрузке НЕТ — прецедент
// 000053). Проводка — Game.buildingActions.init(deps) из main.js
// (load-time, один раз): бандл явных ссылок на мир (контракт §2.2
// memory). Game-доступ — ЛЕНИВО через deps.game (снапшот main.js,
// ОДИН — 000038), свойства читаются при ВЫЗОВЕ; map — GETTER (let,
// назначается после асинхронной загрузки карты). Гарды — только на
// вызове: init не вызван → console.error + деградация (000053, игра
// не роняется).
//
// РЕФАКТОРИНГ БЕЗ СМЕНЫ ПОВЕДЕНИЯ: шесть функций перенесены 1:1 из
// main.js (L632–917 master 1885163): openNpcDialog, onBuildingAction,
// scanTeleportPair, openBuildingUI, buildingRecForTile,
// toggleNpcDialog → toggle (имя зафиксировано ТЗ). 1:1 сохранены:
// единый [E]-путь (000071), гарды isActive — npcUI → combatUI →
// dungeonUI (000105!) → buildingUI → npcUI (стековый порядок, B4),
// console.error-текст деградации (префикс 'main.js:' — как в
// original), flash-константа 5000, маркировка 'x,y:effectId'
// (000072), ханки r.teleport (000075) и r.buffs (000076) — ОБЩИЙ
// пайплайн (после apply, ДО specials). Детерминизм: ноль RNG
// (scanTeleportPair — hash2/TELEPORT_TIE_SEED, как было).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { buildingActions: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // --- Таблица спец-действий (§2.3–2.6 memory) ---
  //
  // { effectId: fn(ctx) → { ok, message? } } — обычный объект,
  // саморегистрация спец-модулями в момент СВОЕЙ загрузки (реестр —
  // модульное поле: registerSpecial работает ДО init). Ключ —
  // effectId (= action.id из оверлея = ключ EFFECTS-реестра), НЕ
  // buildingId: латиница, БЕЗ ':'/','/пробелов (критично: ключ сейва
  // 'x,y:effectId' — мусорный ключ restoreDayMap молча отбрасывает →
  // потеря раз-в-день состояния, 000072).
  const specials = {};

  // Гард-регистрация (000053): нарушение формы → console.error + НЕ
  // регистрировать (игра не роняется). Дубликат id → ПЕРЕЗАПИСЬ
  // (last-wins, без ошибки).
  function registerSpecial(id, fn) {
    if (typeof id !== 'string' || id === '' || /[:,\s]/.test(id)) {
      console.error('building-actions.js: registerSpecial — некорректный ' +
        'id ' + JSON.stringify(id) + ': нужна непустая строка без ' +
        '":"/","/пробелов (ключ сейва «x,y:effectId»); обработчик ' +
        'НЕ зарегистрирован');
      return;
    }
    if (typeof fn !== 'function') {
      console.error('building-actions.js: registerSpecial — обработчик ' +
        'для «' + id + '» не функция; НЕ зарегистрирован');
      return;
    }
    specials[id] = fn;
  }

  // --- Проводка (main.js, load-time, один раз) ---
  //
  // Бандл явных ссылок на мир (§2.2 memory). Живые ссылки безопасны:
  // restoreFromSave восстанавливает ВСЕ разделы in place (Map
  // clear+set, Array length=0+push, Object.assign) — ссылки не
  // устаревают. Единственный перезаписываемый let — map → getter.
  // Повторный init допустим (тесты); в игре main.js вызывает один
  // раз при загрузке.
  let deps = null;

  function init(d) {
    deps = d;
  }

  // Гард на вызове (000053): init не вызван → console.error +
  // деградация (роутерный вызов — return). Чистая сетка безопасности:
  // в корректной цепочке init сработан load-time main.js.
  function needDeps() {
    if (deps) return true;
    console.error('building-actions.js: init не вызван — ' +
      'проводка main.js отсутствует');
    return false;
  }

  // Диалог NPC (задача 000010): ТЕ ЖЕ параметры, что и до 000071.
  // Экспорт — делегация debug openNpc (дедуп 1:1-тел).
  function openNpcDialog(npc, t) {
    if (!needDeps()) return;
    deps.game.npcUI.open({
      npc,
      character: deps.hero,
      book: deps.questBook,
      tile: { x: deps.player.x, y: deps.player.y,
        building: t.building, buildingWealth: t.buildingWealth },
      // Сток общий на сессию + сейв при изменениях (000029).
      shop: deps.npcShopFor(npc.id),
      onChange: deps.saveNow,
      day: deps.clock.day,
    });
  }

  // Действие эффекта из оверлея (задача 000071) + спец-действие
  // (задача 000128): «Диалог» — fallback на npcUI; эффект —
  // entry.apply(state) → при ok: спец-хендлер (если зарегистрирован),
  // маркировка раз-в-день buildingOncePerDay.set('x,y:effectId',
  // clock.day) (только если hasDailyLimit — хук 000092) + saveNow()
  // СРАЗУ (не ждать beforeunload — паттерн 000029/000072, прецедент
  // _lastUnkillDay) + flash(message). При НЕ-ok: message (если есть)
  // тоже в flash — отказ apply не гаснет молча (ревью раунда 2);
  // маркировки и saveNow НЕТ (эффект не сработал). Отказ
  // спец-хендлера — та же семантика (flash, без маркировки/saveNow/
  // render, §2.6 memory). try/catch вокруг спец-хендлера НЕ
  // добавляется (1:1: выброс из apply и сегодня роняет так же; баг
  // хендлера — баг задачи, который ловят ЕЁ тесты).
  // Начислить опыт БЕЗ множителя «Учёный» (задача 000074, решение
  // D-XP в memory/000074-rune-obelisk.md): рунический камень даёт
  // готовую формулу stoneXp (своим runePowerMult), и штатный addXp
  // умножил бы её ещё на xpMult — двойное начисление. ТОЧНОЕ ЗЕРКАЛО
  // addXp (player.js:317) БЕЗ xpMult — при изменении addXp
  // синхронизировать (R1: дубль лупы уровней; totalXp ОБЯЗАН вестись,
  // R4). player.js НЕ ТРОГАЕТСЯ (вне файлов ТЗ).
  function grantXpRaw(c, amount) {
    if (!c || !c.alive || !Number.isFinite(amount) || amount <= 0) return;
    c.totalXp += amount;
    c.xp += amount;
    while (c.xp >= deps.game.xpForNext(c.level)) {
      c.xp -= deps.game.xpForNext(c.level);
      c.level += 1;
      c.points += deps.game.POINTS_PER_LEVEL;
    }
    const d = deps.game.derived(c);
    c.hp = Math.min(d.maxHP, c.hp);
    c.mp = Math.min(d.maxMP, c.mp);
  }

  function onBuildingAction(action, t, b, npc) {
    if (!needDeps()) return;
    // Реестр эффектов — ПЕРВЫМИ (ревью раунда 3): запись
    // EFFECTS['dialog'] (если появится в каталоге) не должна
    // затеняться спецкейсом ниже. 'dialog' — fallback: NPC-диалог.
    const BE = deps.game.buildingEffects;
    const entry = BE && BE.EFFECTS ? BE.EFFECTS[action.id] : null;
    let r = null;
    if (entry && typeof entry.apply === 'function') {
      r = entry.apply({
        day: deps.clock.day,
        tile: { x: deps.player.x, y: deps.player.y },
        hero: deps.hero,
        // СНИМОК сейва (обычный объект, 000072): эффект не получает
        // живых ссылок на состояние мира. Исключение (000076): map —
        // READ-ONLY ссылка на живую карту (для «Сна» 37 — подсказка
        // сканирует тайлы; запись эффекта карту не мутирует —
        // задокументировано memory/000076-temple-blessings.md).
        save: deps.collectSaveData(),
        map: deps.getMap() || null,
        // Задача 000074: каталожная запись (READ-ONLY) — apply
        // читает параметры ТОЛЬКО из state.catalog.особые_параметры
        // (принцип 000053: код каталог-драйвен, ничего не хардкодит).
        catalog: b,
      });
      if (!r || !r.ok) {
        // Отказ apply: видимый отказ (message → flash), без
        // маркировки раз-в-день и saveNow — эффект не сработал
        // (ревью раунда 2: до этого message неуспешного apply
        // отбрасывался — нажатие умирало молча).
        if (r && r.message) deps.flash(r.message);
        return;
      }
      // Телепорт (задача 000075): р.teleport — декларация переноса
      // из ЧИСТОГО apply (dest ИЗ СНИМКА сейва). Исполнение здесь —
      // в снимке мира НЕТ: списание (стоимость ИЗ КАТАЛОГА, не
      // хардкод), hero.gold, позиция + снап мувера. Ханк
      // срабатывает ТОЛЬКО при r.teleport — чужие эффекты (в т.ч.
      // тестовые B3) не затрагиваются. Контракт — memory/000075-
      // teleport-circles.md (для 000093+).
      if (r.teleport) {
        const key = deps.player.x + ',' + deps.player.y;
        const info = deps.teleports.get(key);
        const op = b && b.особые_параметры;
        const eff = op && typeof op.эффект === 'object' ? op.эффект : null;
        const cost = eff && Number.isFinite(eff.стоимость)
          ? eff.стоимость : 0;
        const ch = BE.teleportCharge(
          deps.hero, !!(info && info.active), cost);
        if (!ch.ok) {
          // Мало золота — отказ БЕЗ списания/переноса (мировое
          // состояние не изменилось) → ДО saveNow (контракт 000071:
          // отказ — message в flash, без saveNow/маркировки).
          deps.flash(ch.message);
          return;
        }
        deps.hero.gold = ch.gold;
        if (info && !info.active) info.active = true;
        deps.moveHero(r.teleport.x, r.teleport.y);
      }
      // Задача 000076: ОБЩИЙ хук «apply вернул новое состояние» —
      // r.buffs (НОВЫЙ массив, grantBuff 000072) заменяет содержимое
      // живого массива buffs ДО saveNow (СНИМОК не мутировался —
      // main.js владеет живым состоянием). Не храм-специфично: любой
      // эффект-запись может нести новое состояние.
      if (Array.isArray(r.buffs)) {
        deps.buffs.length = 0;
        for (const b of r.buffs) deps.buffs.push(b);
      }
      // Задача 000074: р.xp — ОБЩИЙ ханк (amount — ГОТОВАЯ формула,
      // БЕЗ xpMult: grantXpRaw, решение D-XP). Ролл-эффекты (камень)
      // при провале НЕ возвращают r.xp — опыт не начисляется.
      if (Number.isFinite(r.xp)) grantXpRaw(deps.hero, r.xp);
      // Квест постройки (source 'building', пер-тайл questId):
      // ПЕРВОЕ касание обелиска — выдача (r.quest), СЛЕДУЮЩЕЕ —
      // выполнение (r.questComplete — ПЕРСИСТИРОВАННЫЙ questId).
      // Инстансы source='building' serializeQuestBook НЕ пишет
      // (строгий deserializeQuestBook — R2); источник истины —
      // buildingQuests (раздел сейва), rehydrate при загрузке.
      const def = b && b.особые_параметры &&
        b.особые_параметры.квест;
      if (r.quest) {
        const acc = deps.game.acceptBuildingQuest
          ? deps.game.acceptBuildingQuest(deps.questBook, r.quest.questId,
              deps.player.x + ',' + deps.player.y, deps.clock.day)
          : { ok: false, reason: 'недоступно' };
        if (acc.ok) {
          deps.buildingQuests.set(deps.player.x + ',' + deps.player.y,
            { questId: r.quest.questId, day: deps.clock.day,
              status: 'active' });
          r.message += '\nКвест получен: ' + def.название;
        } else {
          r.message += '\n' + acc.reason; // дефенсивно; не ожидается
        }
      } else if (r.questComplete) {
        const res = deps.game.completeBuildingQuest
          ? deps.game.completeBuildingQuest(deps.questBook, def, deps.hero,
              r.questComplete)
          : { ok: false, reason: 'недоступно' };
        if (res.ok) {
          const key = deps.player.x + ',' + deps.player.y;
          const e = deps.buildingQuests.get(key) ||
            { questId: r.questComplete, day: deps.clock.day };
          deps.buildingQuests.set(key,
            Object.assign({}, e, { status: 'done' }));
          r.message += '\nКвест выполнен: ' + def.название +
            ' (+' + def.награда.опыт + ' оп., +' +
            def.награда.золото + ' з.)';
        } else {
          r.message += '\nКвест не сдан: ' + res.reason;
          // (инвентарь полон — квест остаётся active; повтор —
          //  следующее прикосновение; daily-марк и saveNow ВСЁ РАВНО
          //  — касание случилось)
        }
      }
    }
    // Спец-действие (задача 000128): хендлер со «стороной» — ПОСЛЕ
    // apply-сторон (ctx.save — СВЕЖИЙ снимок, ctx.tile — новая
    // позиция после moveHero, ctx.r — результат apply — §2.5/§6.6
    // memory).
    let sres = null;
    const sp = specials[action.id];
    if (typeof sp === 'function') {
      sres = sp({
        day: deps.clock.day,
        tile: { x: deps.player.x, y: deps.player.y },
        hero: deps.hero, // ЖИВАЯ ссылка: хендлер МОЖЕТ мутировать
        // персонажа (gold — паттерн 000075)
        save: deps.collectSaveData(), // СВЕЖИЙ снимок (МИР ПОСЛЕ apply)
        map: deps.getMap() || null, // live-ссылка, READ-ONLY (000076)
        r,
        action, b, t, npc,
        // Узкие точки — явные ссылки проводки (не копание по Game):
        clock: deps.clock,
        moveHero: deps.moveHero,
        startCombat: deps.startCombat,
        // Escape-hatch для будущих узких точек БЕЗ правок модуля:
        // весь deps-бандл (в т.ч. world.game — полный Game-снапшот;
        // допуск, а не рекомендация — §2.5 memory).
        world: deps,
      });
      if (!sres || !sres.ok) {
        // Отказ спец-а = семантика отказа apply: flash (message,
        // если есть), БЕЗ маркировки/saveNow/render (§2.6 memory).
        if (sres && sres.message) deps.flash(sres.message);
        return;
      }
    }
    if (!r && !sres) {
      // «НЕТ ДЕЙСТВИЯ»: entry без apply и без спец-а (и без записи).
      // 'dialog' — Фолбэк NPC-диалога (1:1: без save/flash/
      // маркировки). ВНУТРИ ветки (иначе ветка выше return'ила бы
      // до него — поправка к псевдокоду a2-анализа, §6.4 memory).
      if (action.id === 'dialog' && npc) openNpcDialog(npc, t);
      return;
    }
    // Маркировка + saveNow + flash + render — единственная точка для
    // обеих веток (apply и/или спец-а). Гард BE — спец-а БЕЗ записи
    // buildingEffects (деградация 000053; в корректной цепочке BE
    // всегда на месте, в apply-ветке он гарантирован entry).
    if (BE && BE.hasDailyLimit(b, action.id)) {
      deps.buildingOncePerDay.set(
        deps.player.x + ',' + deps.player.y + ':' + action.id,
        deps.clock.day);
    }
    deps.saveNow();
    // r.message ПЕРВЫМ (1:1: в apply-ветке message был именно от
    // apply; sres — только при совмещённом действии, задача 000128).
    const msg = (r && r.message) || (sres && sres.message);
    if (msg) deps.flash(msg);
    deps.playerRender();
  }

  // Скан пары телепорт-круга (задача 000075): окно [-R..R]² вокруг
  // круга (x, y), R — каталог особые_параметры.эффект.радиус
  // (фолбэк 100). Предфильтр — necessary-условие якоря слота
  // (map.js: hash2(x, y, GLOBAL_SEED) % buildingCount() === слот) —
  // ~1 из 13 тайлов, остальные не требуют tileAt (полный скан 40k
  // tileAt ≈ 1 c — недопустимо даже при первом подходе; формулу
  // якоря фиксируют золотые пины 000073 — не менять без переписи
  // скана, memory/000075-teleport-circles.md). Подтверждение —
  // tileAt(...).buildingId === 41 (подтип, 000073). Результат — в
  // Map teleports + saveNow; ПОВТОРНОГО скана никогда (кэш в
  // сейве). Вызывается ТОЛЬКО из openBuildingUI (не в кадре).
  function scanTeleportPair(x, y, b) {
    if (!needDeps()) return;
    const map = deps.getMap();
    const op = b && b.особые_параметры;
    const eff = op && typeof op.эффект === 'object' ? op.эффект : null;
    const R = eff && Number.isFinite(eff.радиус) ? eff.радиус : 100;
    const slot = op && op.размещение && Number.isFinite(op.размещение.слот)
      ? op.размещение.слот : 10;
    const BE = deps.game.buildingEffects;
    const tie = (px, py) => deps.game.hash2(px, py, BE.TELEPORT_TIE_SEED);
    const count = deps.game.buildingCount
      ? deps.game.buildingCount() : 0;
    const circles = [];
    for (let cy = y - R; cy <= y + R; cy++) {
      for (let cx = x - R; cx <= x + R; cx++) {
        // Предфильтр якоря слота (см. выше) + свой тайл — не пара.
        if (cx === x && cy === y) continue;
        if (count > 0 && deps.game.hash2(cx, cy, deps.game.GLOBAL_SEED)
            % count !== slot) {
          continue;
        }
        const t = map.tileAt(cx, cy);
        if (t.buildingId === 41) circles.push({ x: cx, y: cy });
      }
    }
    const link = BE.linkTeleportCircles(circles, x, y, R, tie);
    let dest = null;
    if (link.pairId) {
      const sep = link.pairId.indexOf(',');
      const size = deps.game.buildingSize
        ? deps.game.buildingSize(b) : { width: 1, height: 1 };
      // мир-оракль dest (контракт memory): проходим, НЕ в footprint'е
      // постройки, без группы мобов (шаг в группу = мгновенный бой,
      // паттерн findSpawn), и не тайл исходного круга.
      dest = BE.teleportDestination(
        { x: Number(link.pairId.slice(0, sep)),
          y: Number(link.pairId.slice(sep + 1)) },
        size,
        (px, py) => {
          if (px === x && py === y) return false;
          const t = map.tileAt(px, py);
          return t.passable && !t.inBuilding && !t.hasMobGroup;
        }, tie);
      dest = dest ? dest.x + ',' + dest.y : null;
    }
    deps.teleports.set(x + ',' + y, {
      pair: link.pairId, dest, active: false,
    });
    deps.saveNow();
  }

  // Открыть оверлей «действия постройки» (задача 000071): список —
  // buildingActions (чистый модуль, src/building-effects.js). Пустой
  // список (нет NPC и нет эффектов) — ничего (как сейчас).
  function openBuildingUI(t, b, npc) {
    if (!needDeps()) return false;
    if (!deps.game.buildingEffects) return false;
    // Задача 000075: телепорт-круг — скан пары при ПЕРВОМ подходе
    // (кэш в разделе сейва teleports; повторного скана НЕТ).
    if (t.buildingId === 41 && !deps.teleports.has(t.x + ',' + t.y)) {
      scanTeleportPair(t.x, t.y, b);
    }
    const actions = deps.game.buildingEffects.buildingActions(b, npc, {
      day: deps.clock.day,
      tile: { x: deps.player.x, y: deps.player.y },
      hero: deps.hero,
      // СНИМОК (000071) + map — READ-ONLY ссылка (000076, см.
      // onBuildingAction): available?(state) эффектов получает то же
      // состояние, что apply.
      save: deps.collectSaveData(),
      map: deps.getMap() || null,
      // Задача 000074: каталожная запись (READ-ONLY) — эффекты
      // читают параметры ТОЛЬКО из state.catalog.особые_параметры
      // (принцип 000053: код каталог-драйвен, ничего не хардкодит).
      catalog: b,
    });
    if (!actions.length) return false;
    // Заголовок — имя РЕШЁННОЙ записи (000075 RESOLVE-БУГ, 000073):
    // у подтипов слотов 8..12 — своё название (b.id 41 → «телепорт-
    // круг», а не базовое имя слота 10 «рунический камень»);
    // паттерн HUD «Здесь:» (название_карты || название, первая
    // буква нижним).
    let title = deps.game.buildingNameUi
      ? deps.game.buildingNameUi(t.building) : 'Постройка';
    if (b) {
      const raw = (b.особые_параметры &&
        b.особые_параметры.название_карты) || b.название;
      if (typeof raw === 'string' && raw !== '') {
        title = raw.charAt(0).toLowerCase() + raw.slice(1);
      }
    }
    deps.game.buildingUI.open({
      title,
      actions,
      onAction: (a) => onBuildingAction(a, t, b, npc),
    });
    return true;
  }

  // Каталожная запись тайла (задача 000076, подтипы 000073):
  // ПОДТИП (t.buildingId — id каталожной записи 36..39 и пр.)
  // ПРЕВЫШАЕТ базовую запись слота — у подтипа свои NPC/эффекты/
  // имя (храм горы 38 — без Элдиры, у Элдиры постройки [20, 36]).
  // Без подтипа (слоты 0..7 — buildingId null) либо без каталога
  // (getBuilding → null) — базовая запись слота (как до задачи).
  // Город (000103: building NONE, buildingId 51..54) — запись через
  // buildingId; базовой записи слота -1 нет — поведение как до.
  // Экспорт — вызовы из main.js (hudUpdate, debug openNpc).
  function buildingRecForTile(t) {
    if (!needDeps()) return null;
    if (!t || !t.hasBuilding) return null;
    if (t.buildingId != null) {
      const rec = deps.game.getBuilding
        ? deps.game.getBuilding(t.buildingId) : null;
      if (rec) return rec;
    }
    return deps.game.buildingForMapIndex(t.building);
  }

  // Действие [E] (задача 000010, задача 000071 — ЕДИНЫЙ путь): роутинг
  // [E] на тайле постройки → оверлей Game.buildingUI (список действий:
  // «Диалог», если у постройки NPC, + эффекты каталога). Повторный
  // [E] — закрыть оверлей. Постройка с NPC и БЕЗ эффектов — тоже
  // оверлей из одного пункта «Диалог» (НЕ прямой npcUI — 000076/000107;
  // Digit1 открывает диалог). Вызывается с клавиатуры (KeyE) и с
  // on-screen-кнопки «E» тач-варианта (задача 000018) — семантика
  // кнопки «действие на тайле» совпадает автоматически.
  function toggle() {
    if (!needDeps()) return;
    if (!deps.game.npcUI) return;
    if (deps.game.combatUI && deps.game.combatUI.isActive()) return;
    if (deps.game.dungeonUI && deps.game.dungeonUI.isActive()) return;
    if (deps.game.buildingUI) {
      // Повторный [E] — закрыть оверлей действий.
      if (deps.game.buildingUI.isActive()) {
        deps.game.buildingUI.close();
        return;
      }
      // Открыт диалог NPC (после «Диалог» из оверлея): повторный [E]
      // закрывает диалог — поведение master (до 000071 проверка
      // npcUI.isActive() шла ПЕРВОЙ в toggleNpcDialog). Без неё
      // buildingUI открывался СВЕРХУ открытого npcUI — оба оверлея
      // активны одновременно (регрессия, тест B4).
      if (deps.game.npcUI.isActive()) {
        deps.game.npcUI.close();
        return;
      }
      const map = deps.getMap();
      if (map) {
        const t = map.tileAt(deps.player.x, deps.player.y);
        if (t.hasBuilding) {
          const b = buildingRecForTile(t); // 000076: подтип слота 8..12
          if (b) {
            const npc = deps.game.npcForBuilding(deps.npcs, b.id);
            openBuildingUI(t, b, npc);
          }
        }
      }
      return;
    }
    // Game.buildingUI отсутствует (регрессия порядка загрузки —
    // паттерн 000018/000038): console.error + деградация к старому
    // прямому npcUI — игра не ломается, ошибка заметна в консоли.
    // Текст 1:1 (префикс 'main.js:' — как в original; проверка
    // текста тестами НЕ пинится).
    console.error('main.js: [E], но Game.buildingUI отсутствует — ' +
      'src/building-ui.js обязан грузиться ДО src/main.js');
    if (deps.game.npcUI.isActive()) { // повторно — закрыть диалог
      deps.game.npcUI.close();
      return;
    }
    const map = deps.getMap();
    if (map) {
      const t = map.tileAt(deps.player.x, deps.player.y);
      if (t.hasBuilding) {
        const b = buildingRecForTile(t); // 000076: подтип слота 8..12
        const npc = b && deps.game.npcForBuilding(deps.npcs, b.id);
        if (npc) openNpcDialog(npc, t);
      }
    }
  }

  return {
    init,
    toggle,
    openBuildingUI,
    onBuildingAction,
    buildingRecForTile,
    openNpcDialog,
    scanTeleportPair,
    specials,
    registerSpecial,
  };
});
