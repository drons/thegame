// Мини-карта боя (HTML-оверлей): сетка, юниты, действия, журнал.
// Браузерный модуль (ядро — src/combat.js, тестируется в node).
//
// Управление в бою — единая таблица src/combat-keys.js (задача 000048;
// aria-label кнопок и keydown строятся из неё же, хардкода нет):
//   стрелки / WASD / ЦФЫВ — шаг (те же e.code, что в мире — controls.js),
//   J — удар (K — дубль),  Q — огненная стрела,  R — исцеление,
//   B — блок,  E — быстрый предмет,  T — предмет (U — дубль),
//   F — побег,  Space — конец хода,
//   клик по мобо — выбор цели,
//   Esc / Space / Enter — закрыть оверлей (только после боя).
// Союзники (задача 000084): на мини-карте — спрайт (Эфир —
// efirFrames 000034, наёмник — MOB_FRAMES orc), полоса HP
// (hpBarColor, паттерн 000038), маркер «свой», индикатор хода;
// герой рисуется ПОСЛЕ всех союзников (контракт —
// memory/000084-ally-render.md).
// Экран боя (задача 000124): кнопки действий — SVG-иконки
// (assets/ui/combat_<action>.svg) БЕЗ текстовой подписи; клавиша-
// подсказка [J] и т.п. с кнопок убрана (сами клавиши работают;
// aria-label = имя действия из таблицы). ВЕСЬ layout боя (вьюпорт,
// 4 колонки, лог flex:1) — CSS в скоупе .combat-overlay--combat
// (контракт — memory/000124-combat-layout.md); canvas CSS-масштабируется
// под доступную высоту, поэтому клик по клетке нормализуется по
// фактическому размеру canvas (getBoundingClientRect).
// На русской раскладке: J=О, K=Л, U=Г (e.code — физическая клавиша,
// задача 000028). Невозможное действие/шаг — причина в журнал
// (canDoAction, задача 000037; раньше — тишина).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G || !G.createCombat || !G.CombatKeys) {
    // Видимая ошибка, а не молчание (паттерн ui.js): битый порядок
    // загрузки — tests/index-order.test.js.
    console.error('combat-ui.js: не найдены Game.createCombat или ' +
      'Game.CombatKeys — проверьте порядок загрузки: src/combat.js и ' +
      'src/combat-keys.js ДО src/combat-ui.js (задача 000048)');
    return;
  }

  const CELL = 48;
  const ROLE_COLORS = {
    melee: '#d9483b', ranged: '#e08a3c', support: '#5cb85c',
    leader: '#b06ad4', shield: '#a98545', swarm: '#e0b13c',
  };
  // Союзники (задача 000084): маркер «свой» — подложка + рамка
  // (палитра «стороны игрока»: герой-ромб #8cf2fc, --hero-токен;
  // «новых цветов не вводим», паттерн 000038). ALLY_MERC_KIND —
  // архетип-заглушка ВСЕХ ролей наёмника (per-role/per-NPC спрайты —
  // 000087/000114). Значения зафиксированы контрактом
  // memory/000084-ally-render.md (пины styleCalls R3/R5).
  const ALLY_MERC_KIND = 'orc';
  const ALLY_MARKER = '#8cf2fc';
  const ALLY_MARKER_UNDERLAY = 'rgba(140, 242, 252, 0.25)';

  // --- Время и кадры анимации (задача 000047) ---
  //
  // nowMs — источник времени ТОЛЬКО UI-слоя: в браузере
  // performance.now(), в vm-песочнице тестов — Date.now() (Date
  // встроен в vm-контекс). Чистые селекторы кадров (G.frameIndex)
  // время получают АРГУМЕНТОМ (детерминизм, как в мире —
  // drawSprites в main.js); внутри них времени нет.
  // typeof-гарды обязательны: в vm-песочнице requestAnimationFrame
  // и performance НЕ существуют (хостовые глобалы не попадают в
  // контекс) — прямой доступ дал бы ReferenceError.
  const nowMs = () => (typeof performance !== 'undefined' && performance.now)
    ? performance.now() : Date.now();
  const raf = (typeof requestAnimationFrame === 'function')
    ? requestAnimationFrame : null;
  const caf = (typeof cancelAnimationFrame === 'function')
    ? cancelAnimationFrame : null;
  // Длительность анимации действия героя (attack/cast), мс.
  const FX_MS = 300;

  let ctx = null; // { combat, hero, onEnd, open, bgPath, spriteLoader }
  let overlay = null, canvas = null, g2 = null;
  let stateEl = null, logEl = null, bannerEl = null, turnorderEl = null;
  let hpbarEl = null, hpbarFillEl = null, hpbarTextEl = null;
  let ended = false;
  let rafId = null; // id rAF-цикла анимации (задача 000047); null — нет rAF

  function isActive() {
    return !!ctx && ctx.open;
  }

  function current() {
    return ctx ? ctx.combat : null;
  }

  // --- Оверлей ---

  function build() {
    overlay = document.createElement('div');
    // Скоуп-класс (задача 000124): вся геометрия боевого layout живёт
    // в CSS .combat-overlay--combat; базовые .combat-overlay,
    // .combat-side, .combat-log НЕ ТРОГАЕМ (их переиспользуют диалог
    // NPC, подземелье, постройка — контракт memory/000124-combat-
    // layout.md).
    overlay.className = 'combat-overlay combat-overlay--combat';

    const box = document.createElement('div');
    box.className = 'combat-box';

    canvas = document.createElement('canvas');
    const c = ctx.combat;
    canvas.width = c.width * CELL;
    canvas.height = c.height * CELL;
    box.appendChild(canvas);
    g2 = canvas.getContext('2d');

    const side = document.createElement('div');
    side.className = 'combat-side';

    // Строка очерёдности хода (задача 000036): токены — герой и живые
    // мобы. ПЕРВЫЙ элемент .combat-side (над .combat-state).
    turnorderEl = document.createElement('div');
    turnorderEl.className = 'combat-turnorder';
    side.appendChild(turnorderEl);

    // Полоса HP героя (задача 000038): ВТОРОЙ элемент .combat-side —
    // после строки очереди (000036), ПЕРЕД .combat-state. Ширина
    // заполнения и цвет — из render(); текст «HP x/y» всегда виден
    // (числа не прячем — доступность/читабельность).
    hpbarEl = document.createElement('div');
    hpbarEl.className = 'combat-hpbar';
    hpbarFillEl = document.createElement('div');
    hpbarFillEl.className = 'combat-hpbar-fill';
    hpbarTextEl = document.createElement('span');
    hpbarTextEl.className = 'combat-hpbar-text';
    hpbarEl.appendChild(hpbarFillEl);
    hpbarEl.appendChild(hpbarTextEl);
    side.appendChild(hpbarEl);

    stateEl = document.createElement('div');
    stateEl.className = 'combat-state';
    side.appendChild(stateEl);

    const actions = document.createElement('div');
    actions.className = 'combat-actions';
    // Кнопки — из единой таблицы src/combat-keys.js (задача 000048):
    // порядок = порядок в таблице. Содержимое — SVG-иконка БЕЗ
    // текстовой подписи (задача 000124): имя файла — деривация из
    // имени действия (assets/ui/combat_<action>.svg; контракт иконок
    // — memory/000124-combat-layout.md), клавиша-подсказка с кнопок
    // убрана (сами клавиши работают). aria-label = имя действия
    // (доступность; alt="" — иконка презентационная).
    // b.dataset.act — имя действия ядра для canDoAction (задача 000037).
    for (const item of G.CombatKeys.describeCombatKeys()) {
      const b = document.createElement('button');
      const icon = document.createElement('img');
      icon.src = 'assets/ui/combat_' + item.action.toLowerCase() + '.svg';
      icon.alt = '';
      b.appendChild(icon);
      b.ariaLabel = item.label;
      b.dataset.act = item.action;
      b.addEventListener('click', () => {
        // Как по клавише: зеркало ok, но ядро отклонило (сейчас 'invItem'
        // без itemId) — причину в журнал, а не тишина (задача 000037).
        runAction(c, item.action);
        render();
      });
      actions.appendChild(b);
    }
    side.appendChild(actions);

    logEl = document.createElement('div');
    logEl.className = 'combat-log';
    side.appendChild(logEl);

    bannerEl = document.createElement('div');
    bannerEl.className = 'combat-banner';
    bannerEl.style.display = 'none';
    bannerEl.onclick = finish; // обработчик постоянный (render только показывает)
    box.appendChild(bannerEl);

    overlay.appendChild(box);
    overlay.appendChild(side);
    document.body.appendChild(overlay);

    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      // Нормализация по ФАКТЧЕСКОМУ размеру canvas на экране
      // (задача 000124): canvas CSS-масштабируется под вьюпорт
      // (aspect-ratio 1/1, см. .combat-overlay--combat в index.html),
      // поэтому экранные px ≠ внутренним (CELL=48): коэффициент =
      // внутренний/экранный. Фолбэк r.width || canvas.width —
      // нулевой/отсутствующий rect (DOM-стабы, патология) → 1:1.
      // Border 2px входит в rect (border-box) — смещение < 0.1 клетки
      // при масштабе ×2, не компенсируется (не усложняем).
      const rw = r.width || canvas.width;
      const rh = r.height || canvas.height;
      const cx = Math.floor((e.clientX - r.left) * (canvas.width / rw) / CELL);
      const cy = Math.floor((e.clientY - r.top) * (canvas.height / rh) / CELL);
      // Клик в любую клетку прямоугольника моба (задача 000040).
      const u = c.units.find((x) => x.alive && !x.fled
        && cx >= x.x && cx < x.x + (x.size.w || 1)
        && cy >= x.y && cy < x.y + (x.size.h || 1));
      if (u) {
        c.selectTarget(u.id);
        render();
      }
    });
  }

  // Расхождение «зеркало ok, ядро отклонило» (задача 000037, п. 4):
  // причину тоже в журнал, а не тишина. Сейчас единственный такой случай —
  // 'invItem': зеркало ок, когда в инвентаре есть применимый предмет, но
  // UI ещё не передаёт itemId (мини-меню выбора — отдельная задача), и
  // ядро отвечает «выберите предмет из инвентаря» (пул не сгорает).
  // С 000048 через него же проходят отклонения шагов (c.move) — раньше
  // неудачный шаг был тихим.
  function logRejection(c, r) {
    if (r && !r.ok && r.reason) c.log.push(r.reason);
  }

  // FX персонального арта ПОСЛЕ фазы мобов (задача 000062).
  //
  // Ядро (combat.js) событий «кто мобо что сделал» не выдаёт — фаза
  // идёт синхронно внутри c.endTurn(), поэтому UI восстанавливает
  // анимации из СНИМКА ДО / СОСТОЯНИЯ ПОСЛЕ (эвристика, детерминирована):
  //   * моб сменил позицию → 'move';
  //   * моб НЕ двигался и стоял в ударной позиции (ближние/shield/
  //     swarm/leader/support — dist ≤ 1 до прямоугольника; дальние —
  //     2..4, при dist ≤ 1 они отступают и получают 'move') И в этот
  //     ход игрок потерял HP → 'attack' (приоритет над 'move').
  // Промах (HP игрока не упало) — без 'attack'-FX (удар не нанесён);
  // точная атрибуция «какой моб нанес урон» — будущая задача (крючок
  // событий в ядре, c._uiEvents).
  // c._unitFx — состояние ТОЛЬКО UI-слоя (как c._fx): ядро его не
  // читает. Читается drawUnits: 'attack' пока until не истёк.
  function unitFxAfterMobPhase(c, beforePos, hpBefore) {
    const dist = (u) => {
      // Манхэттен-расстояние до прямоугольника юнита — та же формула,
      // что unitDist в combat.js (туда не экспортируется, не тянем).
      const x1 = u.x + ((u.size && u.size.w) || 1) - 1;
      const y1 = u.y + ((u.size && u.size.h) || 1) - 1;
      const dx = c.px < u.x ? u.x - c.px : (c.px > x1 ? c.px - x1 : 0);
      const dy = c.py < u.y ? u.y - c.py : (c.py > y1 ? c.py - y1 : 0);
      return dx + dy;
    };
    const hurt = c.player ? c.player.hp < hpBefore : false;
    const fx = {};
    const until = nowMs() + FX_MS;
    for (const u of c.units) {
      if (!u.alive || u.fled) continue;
      const b = beforePos.get(u.id);
      const moved = !b || b.x !== u.x || b.y !== u.y;
      const d = dist(u);
      const inStance = !moved
        && (d <= 1 || (u.role === 'ranged' && d >= 2 && d <= 4));
      if (hurt && inStance) {
        fx[u.id] = { action: 'attack', until };
      } else if (moved) {
        fx[u.id] = { action: 'move', until };
      }
    }
    c._unitFx = fx;
  }

  // Диспетчер действия (клавиша и клик по кнопке): вызов ядра + причина
  // в журнал при отклонении (задача 000037). Предпроверку canDoAction
  // делает keydown — снимком state для resolveCombatKey (задача 000048;
  // раньше предпроверка была здесь, в keyAction). Клик по disabled-кнопке
  // в браузере невозможен, поэтому лог причины — только по клавише.
  function runAction(c, action) {
    // Только ВЫБРАННОЕ действие (ревью 000036): прежний объект-литерал
    // жадно ВЫПОЛНЯЛ все 8 действий ядра за одно нажатие (атака +
    // заклинания + блок + предмет + побег + endTurn), пользуясь лишь
    // результатом нужного — бой мог завершиться побегом от одного
    // нажатия. Фикс: thunk'и — вызываются только нужные.
    const run = {
      attack: () => c.attack(c.targetId),
      fire: () => c.spell('fire', c.targetId),
      heal: () => c.spell('heal'),
      block: () => c.block(),
      quickItem: () => c.quickItem(),
      invItem: () => c.invItem(),
      flee: () => c.flee(),
      endTurn: () => {
        // Снимок ДО фазы мобов (задача 000062): позиции мобов и HP
        // игрока — для FX-эвристики после фазы (см.
        // unitFxAfterMobPhase). Фаза мобов синхронная (combat.js),
        // промежуточных событий нет.
        const beforePos = new Map(
          c.units.map((u) => [u.id, { x: u.x, y: u.y }]));
        const hpBefore = c.player ? c.player.hp : 0;
        const r = c.endTurn();
        unitFxAfterMobPhase(c, beforePos, hpBefore);
        return r;
      },
    }[action];
    const r = run ? run() : undefined;
    logRejection(c, r);
    // Анимация героя (задача 000047): UI-состояние ТОЛЬКО в UI-слое —
    // поле c._fx (ядро combat.js его не читает; там есть только c._rng).
    // Пишется после УСПЕШНОГО действия (r.ok): атака — 'attack',
    // заклинание (fire/heal) — 'cast', на ~300 мс. Невыполненное
    // действие (ok:false — отклонено ядром) анимации не даёт.
    // Промасх (ok:true, hit:false) — действие потрачено, анимация
    // уместна (удар есть, цель не задета).
    if (r && r.ok) {
      if (action === 'attack') {
        c._fx = { action: 'attack', until: nowMs() + FX_MS };
      } else if (action === 'fire' || action === 'heal') {
        c._fx = { action: 'cast', until: nowMs() + FX_MS };
      }
    }
  }

  // Единый путь «code → действие боя» (задача 000121): клавиатурный
  // keydown и тач-D-pad (controls.js touchKeyCode) проходят через ОДИН
  // и тот же код — единая таблица src/combat-keys.js, без дублирования.
  // Тап D-pad = ОДИН вызов handleCode — БЕЗ повтора при удержании
  // (в бою каждое действие тратит ход; удержание повторять нельзя).
  function handleCode(code) {
    if (!isActive()) return false;
    const c = ctx.combat;
    let consumed = true;
    if (code === 'Escape') {
      // Закрыть оверлей можно только когда бой закончен.
      if (c.result) finish();
    } else if (c.result) {
      // Закрытие — Space/Enter (ветка ДО таблицы: Space=«конец хода»
      // конфликтовать с Space=«закрыть» не может). Прочие клавиши после
      // боя не «проглатываем» (consumed=false) — на геймплей не влияет,
      // main.js всё равно ранним return'ит, пока оверлей открыт.
      if (code === 'Space' || code === 'Enter') finish();
      else consumed = false;
    } else {
      // Единая таблица (src/combat-keys.js, задача 000048): движение и
      // действия. Снимок для resolveCombatKey: canDo — результат
      // canDoAction именно для действия этой клавиши (000037).
      const entry = G.CombatKeys.COMBAT_KEYS[code];
      const st = { phase: c.phase, result: c.result };
      if (entry && entry.type === 'action') {
        st.canDo = G.canDoAction(c, entry.action, { targetId: c.targetId });
      }
      const r = G.CombatKeys.resolveCombatKey(code, st);
      if (r.kind === 'move') {
        // playerMove само проверяет ход/блок/шаги/стену/моба и
        // возвращает reason — в журнал, а не тишина (задача 000048).
        logRejection(c, c.move(r.dx, r.dy));
      } else if (r.kind === 'action') {
        if (r.reason) {
          c.log.push(r.reason); // действие невозможно — причина в журнал
        } else {
          runAction(c, r.action);
        }
      } else {
        consumed = false;
      }
    }
    if (consumed) render();
    return consumed;
  }

  window.addEventListener('keydown', (e) => {
    if (handleCode(e.code)) {
      e.preventDefault();
      e.stopPropagation();
    }
  });

  // --- Отрисовка ---

  // Строка очерёдности (задача 000036): полная пересборка токенов
  // (их ≤7 — дёшево), единый вызов из render() — после каждого
  // действия/клавиши/endTurn; rAF-цикл (000047) обновит её тем же
  // render(). Состояние токена — из состояния юнита (u.alive/u.fled/
  // c.player.alive), а НЕ из «наличия id в turnOrder»: моб, убитый в
  // фазе игрока, числится в очереди до конца раунда, но токен серый.
  function renderTurnOrder(c) {
    if (!turnorderEl) return;
    turnorderEl.textContent = '';
    const order = c.turnOrder || [];
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      let isHero = false, dead = false, fled = false,
          name, level, role;
      if (id === 'player') {
        isHero = true;
        name = c.player.name || 'Герой';
        level = c.player.level;
        dead = !c.player.alive;
      } else {
        const u = c.units.find((x) => x.id === id);
        if (!u) continue; // очередь строится из units — защитная ветка
        name = u.name;
        level = u.level;
        role = u.role;
        dead = !u.alive;
        fled = u.fled;
      }
      // Мёртвый/сбежавший токен не «ходит» (ревью 000036): побег
      // пугливого моба происходит в его собственном mobAct — turnIndex
      // уже указывает на него, и без этого условия серый перечёркнутый
      // токен получал бы жёлтую подсветку/свечение (latent: фаза мобов
      // синхронная, станет видно с rAF-рендером 000047).
      const isCurrent = !c.result && i === c.turnIndex && !dead && !fled;
      const cls = ['turn-token']
        .concat(isHero ? 'turn-token--hero' : '')
        .concat(dead ? 'turn-token--dead' : (fled ? 'turn-token--fled' : ''))
        .concat(isCurrent ? 'turn-token--current' : (i < c.turnIndex ? 'turn-token--acted' : ''))
        .filter(Boolean).join(' ');
      const tok = document.createElement('span');
      tok.className = cls;
      if (!isHero) tok.style.background = ROLE_COLORS[role] || '#2c3040';
      tok.textContent = isHero ? '◆' : String(level);
      // Подпись: кто ходит / уже ходил / мёртв / сбежал.
      let state;
      if (dead) state = 'мёртв';
      else if (fled) state = 'сбежал';
      else if (isCurrent) state = 'ходит';
      else if (i < c.turnIndex) state = 'уже ходил';
      tok.title = state ? `${name} (ур. ${level}) — ${state}` : `${name} (ур. ${level})`;
      turnorderEl.appendChild(tok);
    }
  }

  // --- Юниты (задача 000047): спрайты поверх фона и сетки ---
  //
  // Список: не-fled-мобы (включая МЁРТВЫХ — труп, задача 000062) +
  // живые союзники (задача 000084; мёртвый союзник — «ничего»,
  // арта смерти нет) + герой. СОРТИРОВКА по bottomY («низ» юнита =
  // якорь y + высота; герой — py+1) для «глубины»: дальние (меньше y)
  // рисуются раньше, ближние — поверх. Тай-брейк детерминированный:
  // затем x, затем id. ПОСЛЕ сортировки — перевставка героя ПОСЛЕ
  // последнего союзника (ТЗ 000084: союзники не перекрывают игрока);
  // no-op-инвариант — без союзников (или когда все союзники ВЫШЕ
  // героя) список не меняется (контракт memory/000084-ally-minimap.md
  // §5.2).
  // Выбор кадра — ТОЛЬКО чистые функции: G.frameIndex(now, x, y, n)
  // (now — аргументом; время внутри селектора нет — детерминизм
  // мира). Фолбэк — ПО ЮНИТУ, ЦЕПОЧКОЙ (задача 000062):
  //   персональный арт (G.mobArtFrames, move/attack — 2 кадра,
  //   dead — 1) → базовые шесть видов (G.MOB_FRAMES, 000047) →
  //   прямоугольник ROLE_COLORS; у мёртвого — только персональный
  //   dead-кадр, без него ничего (труп — «деталь» сцены, цветной
  //   прямоугольник-труп не рисуем).
  // Guards — УМД-ловушка «G снимается один раз»: цепочка без
  // sprites.js (vm-песочница withSprites=false) → фолбэк (деградация,
  // не падение, паттерн hpBarColor).
  // FX мобов (задача 000062): c._unitFx[id] = {action, until} —
  // пишет runAction ПОСЛЕ фазы мобов (эвристика: см.
  // unitFxAfterMobPhase); render ТОЛЬКО читает. Пока не истекло:
  // 'attack' → кадры attack, иначе → move.
  // Слои юнита: спрайт/фолбэк → полоса HP → уровень → подсветка
  // цели (по всему прямоугольнику, как до спрайтов); у мёртвого —
  // только кадр; у героя — миниполоса HP ПОСЛЕ спрайта. У союзника
  // (задача 000084): подложка «свой» → спрайт/фолбэк → полоса HP
  // (трек + заполнение hpBarColor) → уровень → рамка «свой» →
  // индикатор хода (кольцо, только ходящий) — контракт
  // memory/000084-ally-render.md.
  function drawUnits(c, now, hpFrac, hpColor) {
    const list = [];
    for (const u of c.units) {
      if (u.fled) continue;
      if (u.side === 'ally') {
        // Союзник (задача 000084): живой — в список со своей ветвью;
        // мёртвый — «ничего» (арта смерти нет — ассеты без изменений;
        // паттерн 000062: цветной прямоугольник-труп не рисуем).
        if (!u.alive) continue;
        list.push({
          kind: 'ally', u, id: u.id, x: u.x,
          bottomY: u.y + ((u.size && u.size.h) || 1),
        });
        continue;
      }
      list.push({
        kind: 'mob', u, id: u.id, x: u.x,
        bottomY: u.y + ((u.size && u.size.h) || 1),
      });
    }
    list.push({ kind: 'hero', id: 'player', x: c.px, bottomY: c.py + 1 });
    list.sort((a, b) => (a.bottomY - b.bottomY)
      || (a.x - b.x)
      || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)));
    // Союзники не перекрывают игрока (задача 000084): герой — ПОСЛЕ
    // всех союзников в отсортированном списке. NO-OP-ИНВАРИАНТ
    // (контракт §5.2): перевставка ТОЛЬКО когда последний союзник
    // НИЖЕ героя (lastAlly > hi); без союзников (lastAlly = −1) и
    // когда все союзники выше героя — список не тронут (бит-в-бит).
    // Компромисс: моб с bottomY между героем и нижним союзником —
    // герой «перепрыгивает» его (твёрдое ТЗ-требование побеждает
    // мягкое 000081 «порядок отрисовки игрока/мобов — не трогать»).
    const hi = list.findIndex((it) => it.kind === 'hero');
    let lastAlly = -1;
    for (let i = 0; i < list.length; i++) {
      if (list[i].kind === 'ally') lastAlly = i;
    }
    if (hi >= 0 && lastAlly > hi) {
      const hero = list.splice(hi, 1)[0];
      // герой удалён на hi → последний союзник сдвинулся на
      // lastAlly − 1; вставка на lastAlly ставит героя РОВНО ПОСЛЕ
      // него.
      list.splice(lastAlly, 0, hero);
    }

    // Спрайт моба цепочкой фолбэков (см. выше): персональный арт →
    // базовый вид → null (прямоугольник). Чистая по c/now/u.
    function mobSprite(u, now, action) {
      const candidates = [];
      if (G.mobArtFrames) candidates.push(G.mobArtFrames(u.mobId, action));
      const kind = G.mobSpriteKind ? G.mobSpriteKind(u.mobId) : null;
      if (kind && G.MOB_FRAMES) candidates.push(G.MOB_FRAMES[kind]);
      for (const frames of candidates) {
        if (!frames || !frames.length || !ctx.spriteLoader) continue;
        const idx = (frames.length > 1 && G.frameIndex)
          ? G.frameIndex(now, u.x, u.y, frames.length) : 0;
        const img = ctx.spriteLoader.image(frames[idx]);
        if (img) return img;
      }
      return null;
    }

    // Спрайт союзника (задача 000084): Эфир — G.efirFrames (000034:
    // кадры Флогистона переданы Эфиру, каталог assets/sprites/efir/);
    // наёмник — G.MOB_FRAMES[ALLY_MERC_KIND] (архетип-заглушка ВСЕХ
    // ролей; per-role/per-NPC — расширение 000087/000114). Чистая
    // селекция (аналог mobSprite): кадры → G.frameIndex(now, x, y, n)
    // (детерминизм, now — один на render) → spriteLoader.image()
    // (картинка, загрузившаяся ПОСЛЕ старта боя — подхватывается
    // следующим render, паттерн фона 000049). v1: action = 'idle'
    // всегда (MOB_FRAMES действий не имеют; c._unitFx — player-
    // центричная эвристика 000062, в ally-ветке НЕ читается — ложный
    // 'attack'). Без кадров/лоадера — null → фолбэк-прямоугольник
    // по роли в вызывающей ветке (деградация, не падение).
    function allyFrames(u, now, action) {
      let frames = [];
      if (u.kind === 'efir') frames = G.efirFrames ? G.efirFrames(action) : [];
      else frames = G.MOB_FRAMES ? (G.MOB_FRAMES[ALLY_MERC_KIND] || []) : [];
      if (!frames.length || !ctx.spriteLoader) return null;
      const idx = (frames.length > 1 && G.frameIndex)
        ? G.frameIndex(now, u.x, u.y, frames.length) : 0;
      return ctx.spriteLoader.image(frames[idx]) || null;
    }

    for (const item of list) {
      if (item.kind === 'ally') {
        // Союзник (задача 000084): слои ПОРЯДКОМ — подложка «свой» →
        // спрайт/фолбэк → полоса HP (трек + заполнение) → уровень →
        // рамка «свой» → индикатор хода (контракт §3, пины R3/R6).
        // Геометрия 1×1 (makeAlly: ВСЕГДА size {w:1,h:1}), формулы —
        // через w/h, как в mob-ветке.
        const u = item.u;
        const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
        const px = u.x * CELL, py = u.y * CELL;
        const pw = w * CELL, ph = h * CELL;
        // Подложка «свой» — ПЕРВАЯ (под всеми слоями юнита).
        g2.fillStyle = ALLY_MARKER_UNDERLAY;
        g2.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        // Спрайт (запас 8px — как у мобов) или фолбэк-прямоугольник.
        const img = allyFrames(u, now, 'idle');
        if (img) {
          g2.drawImage(img, px + 8, py + 8, pw - 16, ph - 16);
        } else {
          g2.fillStyle = ROLE_COLORS[u.role] || '#888';
          g2.fillRect(px + 8, py + 8, pw - 16, ph - 16);
        }
        // Полоса HP: ГЕОМЕТРИЯ — компактная (как у мобов, ТЗ); ЦВЕТ
        // заполнения — пороговый hpBarColor (паттерн 000038, как у
        // игрока): гард '#6fdc6f' — без sprites.js (деградация).
        // Кламп [0,1] — защита (u.hp ≤ u.maxHP структурно).
        const afrac = Math.min(1, Math.max(0, u.hp / u.maxHP));
        g2.fillStyle = '#3a0d0d';
        g2.fillRect(px + 8, py + 2, pw - 16, 4);
        g2.fillStyle = (G.hpBarColor ? G.hpBarColor(afrac) : '#6fdc6f');
        g2.fillRect(px + 8, py + 2, Math.round((pw - 16) * afrac), 4);
        // Уровень (центр прямоугольника) — как у мобов.
        g2.fillStyle = '#fff';
        g2.font = '12px ui-monospace, monospace';
        g2.textAlign = 'center';
        g2.fillText(String(u.level), px + pw / 2, py + ph / 2 + 4);
        // Рамка «свой» — ПОВЕРХ спрайта (паттерн подсветки цели).
        g2.strokeStyle = ALLY_MARKER;
        g2.lineWidth = 2;
        g2.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);
        // Индикатор хода — ТОЛЬКО у союзника (ТЗ «и у союзников»;
        // игроку/мобам канвас-индикатор не добавляется — «не больше,
        // чем ТЗ», 000081). Формула — та же, что токены
        // renderTurnOrder (000036). Кольцо — СНАРУЖИ рамки «свой».
        const isCurrent = !c.result && c.turnOrder
          && c.turnOrder[c.turnIndex] === u.id && u.alive && !u.fled;
        if (isCurrent) {
          g2.strokeStyle = '#ffe27a';
          g2.lineWidth = 2;
          g2.strokeRect(px + 2.5, py + 2.5, pw - 7, ph - 7);
        }
      } else if (item.kind === 'mob') {
        const u = item.u;
        const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
        const px = u.x * CELL, py = u.y * CELL;
        const pw = w * CELL, ph = h * CELL;
        if (!u.alive) {
          // Труп (задача 000062): одиночный dead-кадр; без HP-полосы,
          // уровня и подсветки цели. Картинка не готова/нет лоадера
          // (file://) → ничего не рисуем (см. заголовок).
          const img = mobSprite(u, now, 'dead');
          if (img) g2.drawImage(img, px + 8, py + 8, pw - 16, ph - 16);
          continue;
        }
        // Живой моб: действие — 'attack', пока FX атаки не истёк,
        // иначе 'move' (персональный арт, 000062). Без персонального
        // арта (или пока он грузится) — базовые кадры (idle, 000047).
        const fx = (c._unitFx && c._unitFx[u.id]) || null;
        const mobAction = (fx && now < fx.until && fx.action === 'attack')
          ? 'attack' : 'move';
        const img = mobSprite(u, now, mobAction);
        if (img) {
          // Тот же запас 8px, что у прежнего прямоугольника (полоса
          // HP px+8/py+2/pw-16 остаётся согласованной). Мультиклеточные
          // мобы (до 3×3, задача 000040) — на весь прямоугольник.
          g2.drawImage(img, px + 8, py + 8, pw - 16, ph - 16);
        } else {
          // Фолбэк (задача 000040): цветной прямоугольник по роли.
          g2.fillStyle = ROLE_COLORS[u.role] || '#888';
          g2.fillRect(px + 8, py + 8, pw - 16, ph - 16);
        }
        // Полоса HP (по ширине прямоугольника).
        const frac = u.hp / u.maxHP;
        g2.fillStyle = '#3a0d0d';
        g2.fillRect(px + 8, py + 2, pw - 16, 4);
        g2.fillStyle = '#6fdc6f';
        g2.fillRect(px + 8, py + 2, Math.round((pw - 16) * frac), 4);
        // Уровень (центр прямоугольника).
        g2.fillStyle = '#fff';
        g2.font = '12px ui-monospace, monospace';
        g2.textAlign = 'center';
        g2.fillText(String(u.level), px + pw / 2, py + ph / 2 + 4);
        // Подсветка цели (весь прямоугольник).
        if (u.id === c.targetId) {
          g2.strokeStyle = '#ffe27a';
          g2.lineWidth = 2;
          g2.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);
        }
      } else {
        // Герой (задача 000047): кадры Флогистона PHLOGISTON_ACTIONS —
        // 'idle' обычно; 'attack'/'cast' — пока c._fx не истёк
        // (~300 мс после успешного действия, пишет runAction).
        // render c._fx ТОЛЬКО читает, не мутирует. Без
        // sprites.js/лоадера — прежний ромб (фолбэк, бой играбелен).
        const action = (c._fx && c._fx.action && now < c._fx.until)
          ? c._fx.action : 'idle';
        const pf = G.phlogistonFrames ? G.phlogistonFrames(action) : [];
        const idx = (pf.length > 1 && G.frameIndex)
          ? G.frameIndex(now, c.px, c.py, pf.length) : 0;
        const img = (pf.length && ctx.spriteLoader)
          ? ctx.spriteLoader.image(pf[idx]) : null;
        const hx = (c.px + 0.5) * CELL, hy = (c.py + 0.5) * CELL;
        if (img) {
          // ≈CELL×1.15 (аналог zoom*1.15 мира, drawSprites main.js),
          // центр клетки; по краям поля спрайт вылезает за клетку —
          // задумано, clipping не нужен (герой по дизайну в пределах
          // 7×7).
          const size = CELL * 1.15;
          g2.drawImage(img, hx - size / 2, hy - size / 2, size, size);
          // Миниполоса 4px — над верхом спрайта, рисуется ПОСЛЕ
          // (поверх любого вида героя); ширина = ширина спрайта.
          // Кламп в canvas (ревью 000047): якорь «8px над верхом
          // спрайта» у краёв поля уходит за край canvas (size/2+8 =
          // 35.6 > 24 — половина клетки): верхний ряд (py=0) давал
          // by = -12 — полоса ЦЕЛИКОМ выше canvas и невидима
          // (регрессия 000038: в фолбэке-ромбе там же by = 2);
          // боковые края (px=0/6) срезали левый/правый край на
          // 3–4px. Запас 2px — как у полосы мобов (py+2) и как
          // фолбэк-позиция полосы на верхнем ряду. На внутренних
          // клетках кламп не срабатывает — вид не меняется.
          const bw = Math.round(size);
          const bx = Math.max(2,
            Math.min(canvas.width - bw - 2, Math.round(hx - bw / 2)));
          const by = Math.max(2, Math.round(hy - size / 2 - 8));
          g2.fillStyle = '#3a0d0d';
          g2.fillRect(bx, by, bw, 4);
          g2.fillStyle = hpColor;
          g2.fillRect(bx, by,
            Math.round(bw * Math.min(1, Math.max(0, hpFrac))), 4);
        } else {
          // Фолбэк: ромб (как в мире).
          const s = CELL * 0.3;
          g2.fillStyle = '#8cf2fc';
          g2.beginPath();
          g2.moveTo(hx, hy - s);
          g2.lineTo(hx + s, hy);
          g2.lineTo(hx, hy + s);
          g2.lineTo(hx - s, hy);
          g2.closePath();
          g2.fill();
          // Миниполоса 4px над ромбом (задача 000038): ширина =
          // ширина ромба, 8px над верхней вершиной.
          const bw = Math.round(2 * s);
          const bx = Math.round(hx - bw / 2);
          const by = Math.round(hy - s - 8);
          g2.fillStyle = '#3a0d0d';
          g2.fillRect(bx, by, bw, 4);
          g2.fillStyle = hpColor;
          g2.fillRect(bx, by,
            Math.round(bw * Math.min(1, Math.max(0, hpFrac))), 4);
        }
      }
    }
  }

  function render() {
    if (!ctx || !ctx.open) return;
    const c = ctx.combat;
    // ОДНО время на весь render (задача 000047): чистые селекторы
    // кадров (G.frameIndex) получают его аргументом — весь кадр
    // выбирается детерминированно (тот же now → те же кадры).
    const now = nowMs();

    g2.fillStyle = '#0d1117';
    g2.fillRect(0, 0, canvas.width, canvas.height);
    // Фон поля боя (задача 000049): ПЕРВЫЙ слой поверх сплошной базы.
    // Картинку ищем в лоадере КАЖДЫЙ render (Map.get дёшев): фон,
    // загрузившийся ПОСЛЕ начала боя (async Image), подхватится без
    // рестарта. bgPath/spriteLoader — из ctx (один расчёт в
    // startCombat). spriteLoader может быть null (нет s2/лоадера в
    // main.js) → null-guard; bgPath === null (sprites.js отсутствует
    // вовсе, см. guard в startCombat) → сплошной фолбэк, рендер не
    // падает (деградация, не поломка — паттерн hpBarColor).
    const bgImg = ctx.bgPath && ctx.spriteLoader
      ? ctx.spriteLoader.image(ctx.bgPath) : null;
    if (bgImg) g2.drawImage(bgImg, 0, 0, canvas.width, canvas.height);
    // Сетка — ПОВЕРХ фона. Цвет приглушён и полупрозрачный (задача
    // 000049): старый #2a3140 на светлом sand читался слишком резко,
    // а тёмная полупрозрачная линия (напр. rgba(18,22,30,0.55))
    // пропала бы на тёмных фонах (plain/abyss) — светлая линия
    // rgba(255,255,255,0.18) читается и на самом светлом (sand),
    // и на самом тёмном (abyss/plain), и на фолбэке #0d1117 даёт
    // ≈ старый вид (57,60,65 против #2a3140 = 42,49,64). Решение
    // «на глаз», см. tasks/result/000049.md.
    g2.strokeStyle = 'rgba(255, 255, 255, 0.18)';
    g2.lineWidth = 1;
    for (let x = 0; x <= c.width; x++) {
      g2.beginPath();
      g2.moveTo(x * CELL + 0.5, 0);
      g2.lineTo(x * CELL + 0.5, canvas.height);
      g2.stroke();
    }
    for (let y = 0; y <= c.height; y++) {
      g2.beginPath();
      g2.moveTo(0, y * CELL + 0.5);
      g2.lineTo(canvas.width, y * CELL + 0.5);
      g2.stroke();
    }

    // Состояние героя (задачи 000038/000047): ОДИН расчёт
    // p/d/hpFrac/hpColor на render на троих потребителей —
    // canvas-миниполоса (drawUnits), текст stateEl и DOM-полоса
    // (один вызов G.derived, как раньше; один вызов hpBarColor —
    // и миниполоса, и DOM-бар берут тот же цвет).
    // hpBarColor (src/sprites.js) в index.html грузится ДО combat-ui.js —
    // порядок закреплён в tests/index-order.test.js (задача 000038):
    // каждый UMD-модуль ЗАМЕНЯЕТ объект Game (Object.assign({}, Game, …)),
    // а G снимается один раз при загрузке, поэтому функция из скрипта,
    // загружающегося ПОЗЖЕ, через этот G недоступна НИКОГДА — ленивый
    // вызов «после загрузки всех скриптов» этого не решает (регрессия:
    // цвет полосы всегда был фолбэчным). В браузере G.hpBarColor есть
    // уже в момент загрузки модуля; фолбэк '#6fdc6f' (зелёный полосы
    // мобов) нужен только если sprites.js отсутствует вовсе (напр.
    // vm-песочница node) — рендер не падает (стиль деградации).
    const p = c.player;
    const d = G.derived(p);
    // maxHP всегда ≥ 25 (player.js: 20 + конст.·5, множители ≥ 1) —
    // ветка защитная. hp может быть 0 (смерть) или, теоретически,
    // больше maxHP — кламп ниже.
    const hpFrac = d.maxHP > 0 ? p.hp / d.maxHP : 0;
    const hpColor = (G.hpBarColor ? G.hpBarColor(hpFrac) : '#6fdc6f');

    // Препятствия (задача 000050): слой строго ПОСЛЕ сетки и ДО юнитов
    // (z-порядок: фон → сетка → препятствия → юниты → эффекты).
    // Вид спрайта по клетке — чистая G.obstacleSprite(x, y); guard —
    // УМД-ловушка «G снимается один раз» (паттерн hpBarColor/
    // combatBackground): нет sprites.js → null → фолбэк-квадрат.
    // Картинка — из spriteLoader КАЖДЫЙ render (паттерн фона 000049:
    // поздняя загрузка подхватывается без рестарта). Итерация по Set
    // (порядок вставки — детерминирован). Фолбэк — тёмный квадрат:
    // непроходимость — правило ядра (combat.js), а не только визуал,
    // поэтому без ассетов клетка остаётся читаемой.
    if (c.obstacles && c.obstacles.size) {
      for (const key of c.obstacles) {
        const sep = key.indexOf(',');
        const ox = Number(key.slice(0, sep));
        const oy = Number(key.slice(sep + 1));
        const px = ox * CELL, py = oy * CELL;
        const opath = G.obstacleSprite ? G.obstacleSprite(ox, oy) : null;
        const oimg = (opath && ctx.spriteLoader)
          ? ctx.spriteLoader.image(opath) : null;
        if (oimg) {
          g2.drawImage(oimg, px, py, CELL, CELL);
        } else {
          g2.fillStyle = '#3a4150';
          g2.fillRect(px + 3, py + 3, CELL - 6, CELL - 6);
        }
      }
    }

    // Юниты (мобы + герой) — ПОВЕРХ фона, сетки и препятствий, до
    // DOM-части render (задача 000047). Отдельная функция.
    drawUnits(c, now, hpFrac, hpColor);

    // Панель состояния.
    const t = c.units.find((u) => u.id === c.targetId && u.alive && !u.fled);
    stateEl.textContent =
      `${c.groupName}, раунд ${c.round}\n` +
      `HP ${p.hp}/${d.maxHP}  |  MP ${p.mp}/${d.maxMP}\n` +
      `Шаги: ${c.ps.moveLeft}  |  Удар: ${c.ps.attack}  |  Огонь: ${c.ps.spellInt}  |  Леч: ${c.ps.spellWis}\n` +
      (c.ps.blocked ? 'БЛОК  ' : '') + (c.ps.poison > 0 ? `ЯД ${c.ps.poison}  ` : '') +
      (t ? `Цель: ${t.name} (ур. ${t.level}, HP ${t.hp}/${t.maxHP})` : 'Цели нет');

    // Строка очерёдности хода (задача 000036).
    renderTurnOrder(c);

    // DOM-полоса HP героя (задача 000038): единственный путь
    // обновления — render() (как строка очереди и stateEl), отдельных
    // слушателей/timers нет; rAF-цикл (000047) обновит её тем же
    // render() — без дублей логики.
    if (hpbarFillEl) {
      hpbarFillEl.style.width =
        (Math.min(1, Math.max(0, hpFrac)) * 100).toFixed(1) + '%';
      hpbarFillEl.style.background = hpColor;
      hpbarTextEl.textContent = `HP ${p.hp}/${d.maxHP}`;
    }

    // Журнал: последние строки.
    logEl.textContent = c.log.slice(-9).join('\n');

    // Кнопки: неактивны вне очереди игрока или когда действие невозможно
    // (canDoAction, задача 000037); причина — в title (tooltip).
    if (overlay) {
      overlay.querySelectorAll('.combat-actions button').forEach((b) => {
        const r = G.canDoAction(c, b.dataset.act, { targetId: c.targetId });
        b.disabled = c.phase !== 'player' || !!c.result || !r.ok;
        b.title = r.ok ? '' : r.reason;
      });
    }

    // Баннер результата.
    if (c.result) {
      const r = c.result;
      const texts = {
        victory: `ПОБЕДА!\n+${r.xp} опыта, +${r.gold} золота`,
        fled: 'Вы ушли из боя.',
        dead: 'Вы погибли.\n−20% золота, возвращение к точке боя.',
      };
      bannerEl.textContent = texts[r.outcome] || r.outcome;
      bannerEl.style.display = 'block';
    }
  }

  // Цикл анимации (задача 000047): пока оверлей открыт — rAF-тики
  // (старт в startCombat, стоп в finish, включая время показа
  // баннера результата). render() — идемпотентен и дешёв; двойной
  // рендер (событие + ближайший tick) допустим. Событные render() по
  // keydown/клику ОСТАЮТСЯ синхронными: в vm-песочнице тестов rAF
  // нет (typeof-гард выше), бой и тесты работают на синхронном
  // рендере. tick, сработавший ПОСЛЕ finish (isActive false), сам
  // сбрасывает rafId и не рендерит.
  function tick() {
    if (!isActive()) { rafId = null; return; }
    render();
    rafId = raf(tick);
  }

  function finish() {
    if (!ctx || !ctx.open || !ctx.combat.result || ended) return;
    // Остановить rAF-цикл ДО снятия оверлея (задача 000047).
    if (rafId != null && caf) { caf(rafId); rafId = null; }
    ended = true;
    ctx.open = false;
    const onEnd = ctx.onEnd;
    const result = ctx.combat.result;
    // Эфир (задача 000081): 100% боевого опыта — в его пул ДО onEnd
    // (следующий бой сразу видит новый уровень) и ДО ctx = null.
    // Правило: ТОЛЬКО victory, ВЕСЬ result.xp (тот же, что 100%
    // игроку, до бонуса «Учёный»), БЕЗ companion_xp_share (он — для
    // наёмников, 000082), БЕЗ условия выживания Эфира (000035#11:
    // погиб в бою — опыт всё равно в пул). ctx.efir != null только
    // когда G.efir был доступен на startCombat — снапшот G неизменен.
    if (ctx.efir && result.outcome === 'victory' && result.xp > 0) {
      G.efir.addEfirXp(ctx.efir, result.xp);
    }
    if (overlay) overlay.remove();
    overlay = canvas = g2 = stateEl = logEl = bannerEl = turnorderEl = null;
    hpbarEl = hpbarFillEl = hpbarTextEl = null;
    ctx = null;
    ended = false;
    onEnd && onEnd(result);
  }

  G.combatUI = {
    /**
     * Начать бой.
     * @param {object} opts
     * @param {object} opts.hero   персонаж
     * @param {{mobGroup:number}} opts.tile тайл с группой
     * @param {number} opts.seed   сид (детерминированная группа)
     * @param {(result:{outcome:string})=>void} opts.onEnd callback конца боя
     * @param {number} [opts.terrain]   террейн тайла (бой мира, 000049)
     * @param {number} [opts.dungeonType] тип подземелья (000049)
     * @param {object} [opts.spriteLoader] загрузчик спрайтов (main.js;
     *   может быть null — тогда фон не рисуется, сплошная база)
     * @param {{damageMult?: number, armor?: number}} [opts.buffMods]
     *   благословения храма (задача 000076) — проброс в G.createCombat
     *   (единственный путь main.js → ядро боя; там нормализуется).
     * @param {Array<object>} [opts.rosterData] отряд (задача 000087):
     *   данные makeAlly (main.js companionAllies(), 000082) — в allies
     *   ПОСЛЕ Эфира. Не передан / не-массив → [] (старое поведение
     *   бит-в-бит).
     */
    startCombat(opts) {
      if (isActive()) return null;
      ended = false;
      // Эфир (задача 000081): постоянный союзник — opts.efir
      // (состояние {level, xp, skills} из main.js); данные makeAlly —
      // G.efir.efirAllyData. Эфир ПЕРВЫМ в allies — первый якорь
      // placeAllies (px−1, py−1) «всегда со мной»; 000087 расширит
      // ЭТУ ЖЕ строку: [efirData, ...rosterData]. Деградация: opts.
      // efir передан, но G.efir нет (битый порядок — UMD-ловушка
      // 000038, пин R12) → console.error + бой без Эфира (не крах —
      // R11). G снимается один раз при загрузке — efir.js обязан быть
      // до combat-ui.js (index.html, пин tests/index-order.test.js).
      let efirData = null;
      if (opts.efir) {
        if (G.efir && typeof G.efir.efirAllyData === 'function') {
          efirData = G.efir.efirAllyData(opts.efir);
        } else {
          console.error('combat-ui.js: opts.efir передан, но Game.efir ' +
            'недоступен (src/efir.js обязан грузиться до src/' +
            'combat-ui.js, задача 000081) — в бою нет Эфира');
        }
      }
      const combat = G.createCombat({
        player: opts.hero,
        // opts.mobs — произвольный состав (подземелья); иначе группа тайла.
        groupType: opts.mobs ? -1 : (opts.tile ? opts.tile.mobGroup : 0),
        mobs: opts.mobs,
        mobLevel: opts.mobLevel,
        groupName: opts.groupName || (opts.tile && G.mobGroupName
          ? G.mobGroupName(opts.tile.mobGroup) : undefined),
        seed: opts.seed,
        day: opts.day,
        // Задача 000076: благословения (000072) — до ядра боя.
        buffMods: opts.buffMods,
        // Эфир (задача 000081): постоянный союзник (см. выше).
        // Задача 000087: отряд — opts.rosterData (данные makeAlly,
        // main.js companionAllies()) — ПОСЛЕ Эфира. Без rosterData —
        // allies БАЙТ-В-БАЙТ как раньше (якорь placeAllies: Эфир
        // ПЕРВЫМ, px−1, py−1).
        allies: (efirData ? [efirData] : []).concat(
          Array.isArray(opts.rosterData) ? opts.rosterData : []),
      });
      // Эфир в бою (задача 000112): боевой профиль на СУЩЕСТВУЮЩЕМ
      // юните (buildEfirUnit — 12-й экспорт efir.js, D1/D2: ОДИН раз,
      // сразу после createCombat — createCombat остаётся
      // независимым от efir.js; апгрейд, не создание): явные
      // maxHP/hp, своя мана u.mp, пулы c.efs, «Касание духа»,
      // снапшот лордов. Без buildEfirUnit (деградация) — бой как до
      // 000112 (ветка 000080; тихая деградация — G.efir уже проверен
      // выше при efirAllyData, пин 000081 R11 без изменений).
      if (efirData && G.efir && typeof G.efir.buildEfirUnit === 'function') {
        G.efir.buildEfirUnit(opts.efir, combat);
      }
      // Путь фона (задача 000049) — ОДИН раз при старте. Guard
      // G.combatBackground — УМД-ловушка «G снимается один раз»
      // (как hpBarColor, задача 000038): sprites.js отсутствует
      // вовсе (vm-песочница с withSprites=false) → bgPath = null →
      // сплошной фон, рендер не падает (деградация, не поломка).
      // terrain и dungeonType оба опциональны; terrain приоритетнее.
      const bgPath = G.combatBackground
        ? G.combatBackground(
            opts.terrain !== undefined ? { terrain: opts.terrain }
            : opts.dungeonType !== undefined ? { dungeon: opts.dungeonType }
            : {})
        : null;
      ctx = {
        combat, hero: opts.hero, onEnd: opts.onEnd, open: true,
        bgPath,
        // opts.spriteLoader — из main.js, может быть null (нет s2 /
        // нет G.createSpriteLoader) — null-guard в render().
        spriteLoader: opts.spriteLoader || null,
        // Эфир (задача 000081): состояние — finish() начисляет 100%
        // боевого xp. null — Эфир НЕ участвует в бою (opts.efir нет
        // или деградация — XP начислять нечего).
        efir: efirData ? opts.efir : null,
      };
      build();
      render();
      // Цикл анимации (задача 000047): rAF-тики пока оверлей открыт.
      // Без rAF (vm-песочница) — null, событийный синхронный рендер.
      if (raf) rafId = raf(tick);
      return combat;
    },
    isActive,
    current,
    // Единый путь «code → действие боя» (задача 000121): клавиатура
    // (keydown выше) и тач-D-pad (main.js → touchKeyCode → handleCode).
    handleCode,
  };
})();
