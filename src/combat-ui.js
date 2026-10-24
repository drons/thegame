// Мини-карта боя (HTML-оверлей): сетка, юниты, действия, журнал.
// Браузерный модуль (ядро — src/combat.js, тестируется в node).
//
// Управление в бою — единая таблица src/combat-keys.js (задача 000048;
// aria-label кнопок и keydown строятся из неё же, хардкода нет):
//   стрелки / WASD / ЦФЫВ — шаг (те же e.code, что в мире — controls.js),
//   J — удар (K — дубль),  Q/R — книга заклинаний,
//   B — блок,  E — быстрый предмет,  T — предмет (U — дубль),
//   F — побег,  Space — конец хода,
//   клик по мобо — выбор цели,
//   Esc / Space / Enter — закрыть оверлей (только после боя).
// «Книга заклинаний» (задача 000149): пара кнопок «Огонь»/«Исцел.»
// объединена в одну — .combat-spellbook (между .combat-actions и
// .combat-log): строки 1:1 с книгой активного персонажа (пока —
// герой, c.player; «активная единица» — 000167), каст —
// G.Spells.castSpell (движок 000045), предпросмотр строки —
// G.Spells.canCastSpell (причина — title + класс -off), строка —
// div, не <button> (R9). Иконки строк — assets/spell-icons/<id>.svg
// (поле icon в JSON каталога assets/spells; prompt — icon_prompt).
// Союзники (задача 000084): на мини-карте — спрайт (Эфир —
// efirFrames 000034, наёмник — MOB_FRAMES orc), полоса HP
// (hpBarColor, паттерн 000038), рамка/подложка «активный» (задача
// 000197: голубая = активный; жёлтое кольцо хода удалено);
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
// Масштаб боя (задача 000151): бэкинг canvas = размер отображения
// × dpr (кап Game.combatScale.MAX_SCALE, чистая функция —
// src/combat-scale.js); весь рендер — в логических единицах
// (клетки × CELL) через setTransform, клик — по логическому размеру
// поля (контракт — memory/000151-combat-scale.md).
// На русской раскладке: J=О, K=Л, U=Г (e.code — физическая клавиша,
// задача 000028). Невозможное действие/шаг — причина в журнал
// (canDoAction, задача 000037; раньше — тишина).
// «Воскрешение» в бою (задача 000166): выбор цели — мёртвый союзник
// (клетка/подсветка). ГЕЙТ canResurrect(c) (носитель знает 'resurrect'
// через unitOf — следует за будущим 000168): без него сцена бит-в-байт.
// Маркеры — ранний проход drawUnits (ПОД всеми юнитами): подложка
// ALLY_MARKER_UNDERLAY на клетке каждого мёртвого союзника/мёртвого
// героя; кольцо #ffe27a (геометрия подсветки цели моба) — на выбранной
// (союзник: u.id === c.targetId; герой: c.targetId === null — автоцель).
// Клик по клетке мёртвого союзника — c.targetId = u.id (прямой write:
// ядро selectTarget союзников отклоняет 000080, а resurrection-ветка
// evalSpell 000163 мёртвого союзника принимает; все остальные читатели
// c.targetId самовалидируют); клик по клетке мёртвого героя —
// c.targetId = null (автоцель: игрок приоритетно, он НЕ в c.units).
// Строка «Воскрешение» в книге и каст — data-driven 000149 (0 строк).
// Контракты — memory/000166-combat-resurrect-ui.md /
// memory/000166-player-cast-ui.md.
// «Воскрешение» (задача 000171): выделенная кнопка в панели действий
// (.combat-actions, 8-я клетка) — мобильный путь БЕЗ книги (тап =
// нативный click, как у 7 табличных кнопок; новых pointer-обработчиков
// нет). ГЕЙТ canResurrect — кнопка создаётся только у носителя
// 'resurrect'; гашение — спец-кейс resurrectChk в цикле render
// (canDoAction ядро 'resurrect' не знает — «неизвестное действие»),
// каст — resurrectCast (предпроверка + цель resurrectTargetId).
// Контракты — memory/000171-combat-resurrect-button.md /
// memory/000171-touch-buttons.md.
// «Каст»/«Лечение» (задача 000178): ДВЕ выделенные кнопки панели —
// тач-пути для клавиш K (каст Эфира) и H (лечение support-наёмника,
// 000168). ГЕЙТ — состав партии в build() (Эфир в c.units /
// support-наёмник role 'support' && kind 'merc' — условие ядра
// allyCanDo ДОСЛОВНО); видимость — по активному юниту в цикле render
// (display ''/'none' на персистентном элементе — «появляется только
// на ходу X»); гашение — СТАНДАРТНЫЙ canDoAction (ветки 'cast'/'heal'
// в ядре 000168 — строки причины 1:1 с клавишами); клик — allyBtn
// (предпроверка + runAction — зеркало клавиши; стаб-клик — причина в
// журнал, трат нет). Иконки — assets/ui/combat_cast.svg /
// combat_heal.svg. Контракты — memory/000178-combat-cast-heal-
// buttons.md.
// Рамки (задача 000197): голубая рамка 39×39 (ALLY_MARKER) и
// подложка 44×44 союзника — ТОЛЬКО у активного (isCurrent — та же
// формула, что токены ряда очереди, 000036): «убрать постоянно
// горящую голубую; голубая = активный персонаж; жёлтая =
// выбранный/цель». Жёлтое кольцо хода 41×41 УДАЛЕНО — роль «чей
// ход» перенята голубой рамкой (000199 L4); жёлтая рамка цели моба
// (39×39, u.id === c.targetId) — сохранена; герой — без рамок ни в
// каком состоянии (ТЗ: «NPC и Эфир»). Контракт —
// memory/000197-combat-frames.md (вытесняет «рамка + кольцо» слои
// memory/000084-ally-render.md).

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

  // Живой Game в момент вызова (UMD-ловушка 000038 выше): motion.js
  // (ядро глейда 000174 — lerpPos/easeInOut/stepProgress)
  // доигрывается ПОСЛЕ нашей загрузки (index.html: combat-ui.js →
  // motion.js); снапшот G снят один раз — в нём motion-функций
  // НЕТ (UMD подмешивает их в НОВЫЙ объект Game), читать только
  // лениво в момент вызова. Коп dungeon-ui.js (задача 000033).
  function liveGame() {
    return (typeof globalThis !== 'undefined' && globalThis.Game) || G;
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
  // Штриховка зоны досягаемости выбранного моба (задача 000175):
  // производное подсветки цели #ffe27a (семья «выделенный моб» — как
  // жёлтое кольцо) + низкая альфа, «новых цветов не вводим» (паттерн
  // 000038/000084 ALLY_MARKER_UNDERLAY). Строка УНИКАЛЬНА — не
  // совпадает ни с одним закреплённым styleCalls-значением (контракт
  // memory/000175-mob-reach-hatch.md D9).
  const MOB_REACH_HATCH = 'rgba(255, 226, 122, 0.35)';
  const CAST_FX_SCHOOLS = {
    'огонь': ROLE_COLORS.ranged,
    'лёд': ALLY_MARKER,
    'тень': ROLE_COLORS.leader,
    'исцеление': '#6fdc6f',
    'природа': ROLE_COLORS.support,
    'защита': ROLE_COLORS.swarm,
  };
  const CAST_FX_FALLBACK = '#ffe27a';
  const CAST_FX_TARGETED = { 'урон': 1, 'ослабление': 1, 'контроль': 1 };
  const CAST_FX_TEXT = '6px ui-monospace, monospace';

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
  // 000118: «Вдох Эфира» — длительность fx-заявки c._fx.breath, мс
  // (2×FX_MS — эффект «всей команды» дольше герой-кадра; пин
  // tests/combat-ui.test.js CU118-FX).
  const BREATH_FX_MS = 600;
  const SPELL_FX_MS = 600;
  // 000174: длительность глейда передвижения моба на СЕГМЕНТ
  // (1 тайл), мс (порядок FX_MS 000062): волна fast-моба (2 тайла) —
  // 600 мс. Поотрезочный smoothstep — «шаг по клеткам» (000033).
  const MOB_MOVE_MS = 300;
  const ATTACK_FX_MS = 600;
  const LUNGE_CELLS = 0.5;

  let ctx = null; // { combat, hero, onEnd, open, bgPath, spriteLoader }
  let overlay = null, canvas = null, g2 = null;
  let stateEl = null, logEl = null, bannerEl = null, turnorderEl = null;
  let hpbarEl = null, hpbarFillEl = null, hpbarTextEl = null;
  // 000199: полоска MP (третий элемент .combat-side — под HP) и
  // счётчики действий на кнопках «Удар»/«Книга заклинаний»
  // (countEls — персистентные span, key = действие; обнуление —
  // build()/finish()/catch startCombat, паттерн hpbarEl 000038).
  let mpbarEl = null, mpbarFillEl = null, mpbarTextEl = null;
  let countEls = {};
  // «Книга заклинаний» (задача 000149): контейнер .combat-spellbook
  // и флаг открытости (toggle — кнопка/KeyQ/KeyR; строки — renderBook).
  let bookBox = null;
  let bookOpen = false;
  let fleeBox = null;
  let fleeOpen = false;
  let spellBookWarned = false; // деградация без G.SpellBook — 1 console.error
  // 000193: деградация без G.AllySpells (битый порядок загрузки) —
  // 1 console.error на сессию (паттерн spellBookWarned, 000149).
  let allySpellsWarned = false;
  // 000170 (D4/D5): console.error ОДИН раз — исключение в
  // startCombat (build/render), в addEfirXp/onEnd (finish).
  let startCombatErrLogged = false;
  let xpErrLogged = false;
  let onEndErrLogged = false;
  // Сигнатура строк (правки ревью 000149): перестроение книги — ТОЛЬКО
  // при её изменении (см. renderBook); null — перестроить при открытии.
  let bookSig = null;
  // «Быстрый предмет» — список (задача 000194): контейнер
  // .combat-quicklist, флаг открытости и сигнатура строк (паттерн
  // bookBox/bookOpen/bookSig 000149).
  let quickBox = null;
  let quickOpen = false;
  let quickSig = null;
  let boxEl = null;
  let lootEl = null;
  let atkLayer = null;
  let atkKids = {};
  // 000227/000249: выбор «последнего заклинания из книги» —
  // UI-состояние пер БОЯ: ключ 'player' (игрок) / u.id (союзник)
  // → spellId. Запись — castRow, ТОЛЬКО ветка успешного каста
  // (r.ok, ПОСЛЕ блока FX 000248 — 000249 S1: неудачный каст/
  // отказ/гейт — не записывает и не сбрасывает). build() сидирует
  // ТОЛЬКО союзников из live-карты ctx.lastSpells (000249 S2/S4 —
  // id живёт между боями, раздел сейва last_spells main.js); герой
  // НЕ сидируется (S3: гейт — первый успешный каст в этом бою).
  // Сброс — build()/finish()/catch startCombat (как countEls:
  // МОДУЛЬНЫЙ выбор не живёт между боями; персист между боями —
  // live-карта main.js, не модульная карта).
  let lastSpells = {};
  let ended = false;
  let rafId = null; // id rAF-цикла анимации (задача 000047); null — нет rAF
  // 000174: глейд передвижения мобов — null | Map id → { path, at }:
  // path — полилиния [якорь старта, … «to»-тайлы], at — время drain
  // (nowMs). null — анимаций нет (steady-state: якорь = модель,
  // px/py бит-в-бит, 0 новых draw-вызовов — golden-пины держатся).
  let moveAnims = null;
  // 000151: масштаб осей бэкинга (build()/onResize() перезаписывают на
  // каждый бой; finish() НЕ сбрасывает — следующий build перезапишет).
  let sx = 1, sy = 1;
  let measureWarned = false; // console.error об отсутствующем combatScale — ОДИН раз
  // 000175: console.error об отсутствующем Game.mobReachCells — ОДИН раз
  // (УМД-ловушка 000038: битый порядок загрузки).
  let reachWarned = false;

  function isActive() {
    return !!ctx && ctx.open;
  }

  function current() {
    return ctx ? ctx.combat : null;
  }

  // --- Бэкинг и масштаб отображения (задача 000151) ---
  //
  // Бэкинг = размер отображения × dpr, кап Game.combatScale.MAX_SCALE
  // (чистая функция — src/combat-scale.js; контракт —
  // memory/000151-combat-scale.md). Измерение — ТОЛЬКО build() и
  // onResize(); НИКОГДА в rAF-тике (rect на кадр — дорого; CSS 000124
  // меняет размер только с вьюпортом).
  // Деградация (УМД-ловушка 000038 — битый порядок загрузки):
  // Game.combatScale отсутствует → console.error ОДИН раз
  // (measureWarned — не на каждый resize) + 1:1 (бэкинг 336 —
  // поведение ДО 000151, бой играбелен — паттерн 000081).
  // getBoundingClientRect — try/catch → null → 1:1 (стабы/патология);
  // lenient-стабы (rect без width/height) и нулевой rect → 1:1
  // (фолбэки computeBacking).
  function measureBacking() {
    const c = ctx.combat;
    const baseW = c.width * CELL;
    const baseH = c.height * CELL;
    let dispW = 0, dispH = 0;
    try {
      const r = canvas.getBoundingClientRect();
      if (r) { dispW = r.width; dispH = r.height; }
    } catch (e) {
      dispW = 0; dispH = 0; // → 1:1 (фолбэк computeBacking)
    }
    const dpr = (typeof window !== 'undefined' &&
      typeof window.devicePixelRatio === 'number')
      ? window.devicePixelRatio : 1;
    const cs = G.combatScale;
    if (!cs || typeof cs.computeBacking !== 'function') {
      if (!measureWarned) {
        measureWarned = true;
        console.error('combat-ui.js: Game.combatScale недоступен ' +
          '(src/combat-scale.js обязан грузиться до src/combat-ui.js, ' +
          'задача 000151) — 1:1 (бэкинг 336)');
      }
      return { w: baseW, h: baseH, sx: 1, sy: 1 };
    }
    return cs.computeBacking(baseW, baseH, dispW, dispH, dpr);
  }

  // window «resize» (задача 000151): переизмерить бэкинг под ТЕКУЩИЙ
  // масштаб отображения (CSS 000124 отвечает на вьюпорт мгновенно).
  // ТОЛЬКО при смене w/h: присвоение + sx/sy + render() (синхронная
  // перерисовка; в vm rAF нет — событийный рендер). Сброс состояния
  // контекста при смене canvas.width безвреден: трансформ ставится
  // следующим render (D7).
  function onResize() {
    if (!isActive()) return;
    const b = measureBacking();
    if (b.w !== canvas.width || b.h !== canvas.height) {
      canvas.width = b.w;
      canvas.height = b.h;
      sx = b.sx;
      sy = b.sy;
      render();
    }
  }

  // --- Оверлей ---

  function build() {
    countEls = {}; // 000199: пересборка — карта бейджей свежая
    lastSpells = {}; // 000227: пересборка — выбор не живёт между боями
    // 000249 (S2/S4): союзников (Эфир/наёмники) сидируем из
    // live-карты main.js (ctx.lastSpells: 'efir'/npcId → id
    // заклинания; у боевого юнита тот же ключ — 'efir' у Эфира
    // (efirAllyData), npcId у наёмника (allyDataForEntry)). Герой —
    // НЕ сидируется (S3: выбор героя — в этом бою). Забытое/
    // подделанное id (нет в u.spells) — без сидинга (legacy-путь,
    // без ошибок).
    if (ctx.lastSpells) {
      for (const u of ctx.combat.units) {
        if (u === ctx.combat.player) continue;
        const v = ctx.lastSpells[u.id];
        if (typeof v === 'string' && Array.isArray(u.spells)
            && u.spells.indexOf(v) >= 0) lastSpells[u.id] = v;
      }
    }
    overlay = document.createElement('div');
    // Скоуп-класс (задача 000124): вся геометрия боевого layout живёт
    // в CSS .combat-overlay--combat; базовые .combat-overlay,
    // .combat-side, .combat-log НЕ ТРОГАЕМ (их переиспользуют диалог
    // NPC, подземелье, постройка — контракт memory/000124-combat-
    // layout.md).
    overlay.className = 'combat-overlay combat-overlay--combat';

    const box = document.createElement('div');
    box.className = 'combat-box';
    boxEl = box;

    canvas = document.createElement('canvas');
    const c = ctx.combat;
    canvas.width = c.width * CELL;
    canvas.height = c.height * CELL;
    box.appendChild(canvas);

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

    // Полоска MP (задача 000199): ТРЕТИЙ элемент .combat-side —
    // сразу ПОСЛЕ .combat-hpbar, ПЕРЕД .combat-state. Геометрия 1-в-1
    // с .combat-hpbar* (16px, CSS .combat-overlay--combat); ширина
    // заполнения и текст «MP x/y» (без maxMP — деградация «MP —»,
    // 000199/000193.01) — из render(),
    // несёт активного персонажа (barUnit, как HP-полоса 000199).
    mpbarEl = document.createElement('div');
    mpbarEl.className = 'combat-mpbar';
    mpbarFillEl = document.createElement('div');
    mpbarFillEl.className = 'combat-mpbar-fill';
    mpbarTextEl = document.createElement('span');
    mpbarTextEl.className = 'combat-mpbar-text';
    mpbarEl.appendChild(mpbarFillEl);
    mpbarEl.appendChild(mpbarTextEl);
    side.appendChild(mpbarEl);

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
        if (fleeOpen) return;
        // Как по клавише: зеркало ok, но ядро отклонило (сейчас 'invItem'
        // без itemId) — причину в журнал, а не тишина (задача 000037).
        runAction(c, item.action);
        render();
      });
      // Счётчик действий (задача 000199, 000199.01): персистентный
      // <span class="combat-actcount"> на «Удар»/«Книга
      // заклинаний»/«Конец хода» (ТЗ: количество действий — числом
      // на кнопке; «Шаги» — на «Конец хода» — ратификация D4 000199,
      // 000199.01). Создаётся ОДИН раз здесь, как кнопки (урок
      // 000149: пересоздание в render убивает клик); render
      // обновляет только textContent/display. Прочие 4 кнопки — БЕЗ
      // бейджа (пины 000124/CU171/CU178).
      if (item.action === 'attack' || item.action === 'spellbook'
          || item.action === 'endTurn') {
        const cnt = document.createElement('span');
        cnt.className = 'combat-actcount';
        cnt.textContent = '';
        b.appendChild(cnt);
        countEls[item.action] = cnt;
      }
      actions.appendChild(b);
    }
    // «Каст» (задача 000178): тач-путь для клавиши K (каст Эфира,
    // 000168) — выделенная кнопка панели, паттерн 000171 (тап =
    // нативный click; геометрия/:disabled — правила .combat-actions
    // button). ГЕЙТ build() — Эфир в партии: c.units до build —
    // production-путь 000087 (allies = [efir, ...rosterData] ДО
    // startCombat; в бою состав не меняется — статический гейт
    // честен). Видимость — по активному юниту (castHealVis в render:
    // «появляется только на ходу Эфира»); гашение — СТАНДАРТНЫЙ
    // canDoAction (ветка 000168 — строки 1:1 с клавишей); клик —
    // allyBtn. Позиция — ПЕРЕД «Воскрешением»: включённая кнопка —
    // 8-я видимая клетка (row 2 col 4; row 3 col 1 закрыта D-падом —
    // memory/000178-combat-cast-heal-buttons.md §3.3).
    if (c.units.some((u) => u.side === 'ally' && u.kind === 'efir')) {
      const cb = document.createElement('button');
      const icon = document.createElement('img');
      icon.src = 'assets/ui/combat_cast.svg';
      icon.alt = '';
      cb.appendChild(icon);
      cb.ariaLabel = 'Каст';
      cb.dataset.act = 'cast';
      cb.addEventListener('click', () => lastSpellPress(c, 'cast'));
      // 000227: бейдж остатка пула (конвенция 000199): персистентный
      // span, ОДИН раз в build; render — только textContent/display.
      const cbCnt = document.createElement('span');
      cbCnt.className = 'combat-actcount';
      cbCnt.textContent = '';
      cb.appendChild(cbCnt);
      countEls['cast'] = cbCnt;
      // Начальное значение — display 'none': первый render
      // синхронен в startCombat (build(); render();), видимость —
      // castHealVis; защищает гипотетический build без render.
      cb.style.display = 'none';
      actions.appendChild(cb);
    }
    // «Лечение» (задача 000178): тач-путь для клавиши H (лечение
    // support-наёмника, 000168) — паттерн 000171. ГЕЙТ build() —
    // 000227: ЛЮБОЙ наёмник с непустой книгой (было support;
    // кнопка без книги бессмысленна — гейт ложится). КРИТИЧНО
    // kind==='merc' — у Эфира role 'support' ТОЖЕ. Остальное — как
    // у «Каста» выше.
    if (c.units.some((u) => u.side === 'ally' && u.kind === 'merc'
        && Array.isArray(u.spells) && u.spells.length > 0)) {
      const hb = document.createElement('button');
      const icon = document.createElement('img');
      icon.src = 'assets/ui/combat_heal.svg';
      icon.alt = '';
      hb.appendChild(icon);
      hb.ariaLabel = 'Лечение';
      hb.dataset.act = 'heal';
      hb.addEventListener('click', () => lastSpellPress(c, 'heal'));
      const hbCnt = document.createElement('span');
      hbCnt.className = 'combat-actcount';
      hbCnt.textContent = '';
      hb.appendChild(hbCnt);
      countEls['heal'] = hbCnt;
      hb.style.display = 'none'; // видимость — render (castHealVis)
      actions.appendChild(hb);
    }
    // «Последнее заклинание» (задача 000227): тач-путь применения
    // последнего заклинания, выбранного кликом по строке книги
    // (lastSpells.player; запись — castRow). ГЕЙТ build() —
    // непустая книга ИГРОКА (дефолтный герой ['spark','mend'] —
    // кнопка строится во всех дефолтных сценах). НЕТABЛИЧНАЯ
    // (паттерн 000171/000178: таблица COMBAT_KEYS заморожена,
    // клавишей — K у Эфира / H у наёмника / кнопка — свой путь).
    // Видимость — lastSpellVis (render): только ход игрока +
    // выбор есть + не уступает resurrect (D8). Позиция — ПЕРЕД
    // «Воскрешением» (игрок-кнопки группируются; включённая — ≤8-й
    // видимой клетке, memory/000178 §3.3).
    if (c.player && Array.isArray(c.player.spells)
        && c.player.spells.length > 0) {
      const lb = document.createElement('button');
      const icon = document.createElement('img');
      icon.src = 'assets/ui/combat_lastspell.svg';
      icon.alt = '';
      lb.appendChild(icon);
      lb.ariaLabel = 'Последнее заклинание';
      lb.dataset.act = 'lastSpell';
      lb.addEventListener('click', () => lastSpellPress(c, 'lastSpell'));
      const lbCnt = document.createElement('span');
      lbCnt.className = 'combat-actcount';
      lbCnt.textContent = '';
      lb.appendChild(lbCnt);
      countEls['lastSpell'] = lbCnt;
      lb.style.display = 'none'; // видимость — render (lastSpellVis)
      actions.appendChild(lb);
    }
    // «Воскрешение» (задача 000171): выделенная кнопка панели —
    // мобильный путь БЕЗ книги (цепочка «книга → строка → клетка» на
    // таче не discoverable). ГЕЙТ canResurrect (000166, бит-в-байт):
    // создаётся ТОЛЬКО если носитель знает 'resurrect'; дефолтный
    // герой (['spark','mend']) — панель 7 табличных кнопок бит-в-байт
    // (пины «7 штук»/000124/000168-UI-2 — без ре-пина). Позиция —
    // 8-я клетка сетки НА ХОДУ ИГРОКА (CSS index.html: «8 кнопок =
    // 2 ряда», grid 4×2); с 000178 — УСЛОВНО: включённые
    // «Каст»/«Лечение» стоят ПЕРЕД этим блоком (8-я видимая на ходу
    // союзника), здесь resurrect — 9-я видимая (row 3 col 1) —
    // memory/000178-combat-cast-heal-buttons.md §3.3.
    // Геометрия/:disabled — правила .combat-actions button.
    // Тап = нативный click (как у 7 кнопок; pointerdown НЕ добавлять
    // — двойное срабатывание). Гашение — спец-кейс resurrectChk
    // (render): canDoAction 'resurrect' = «неизвестное действие» —
    // вечный disabled с неверным title. Контракт —
    // memory/000171-combat-resurrect-button.md.
    if (canResurrect(c)) {
      const rb = document.createElement('button');
      const icon = document.createElement('img');
      icon.src = 'assets/spell-icons/resurrect.svg';
      icon.alt = '';
      rb.appendChild(icon);
      rb.ariaLabel = 'Воскрешение';
      rb.dataset.act = 'resurrect';
      rb.addEventListener('click', () => resurrectCast(c));
      actions.appendChild(rb);
    }

    // «Быстрый предмет» — список (задача 000194): контейнер строк —
    // МЕЖДУ .combat-actions и .combat-log. Строки (div, не
    // <button> — R9-паттерн книги) строит renderQuickList в render();
    // скрыт по умолчанию, открытие — toggleQuickList (кнопка/KeyE).
    quickBox = document.createElement('div');
    quickBox.className = 'combat-quicklist';
    quickBox.style.display = 'none';
    quickOpen = false;
    quickSig = null;

    bookBox = document.createElement('div');
    bookBox.className = 'combat-spellbook';
    bookBox.style.display = 'none';
    bookOpen = false;
    bookSig = null;

    logEl = document.createElement('div');
    logEl.className = 'combat-log';
    side.appendChild(logEl);
    side.appendChild(quickBox);
    side.appendChild(actions);

    box.appendChild(bookBox);

    fleeBox = document.createElement('div');
    fleeBox.className = 'combat-flee-confirm';
    fleeBox.style.display = 'none';
    fleeOpen = false;
    const fleeQuestion = document.createElement('div');
    fleeQuestion.className = 'combat-flee-question';
    fleeQuestion.textContent = 'Вы точно хотите сбежать?';
    const fleeAns = document.createElement('div');
    fleeAns.className = 'combat-flee-ans';
    const fleeYes = document.createElement('div');
    fleeYes.className = 'combat-flee-btn combat-flee-btn--yes';
    fleeYes.textContent = 'да';
    fleeYes.addEventListener('click', () => confirmFlee(c));
    const fleeNo = document.createElement('div');
    fleeNo.className = 'combat-flee-btn combat-flee-btn--no';
    fleeNo.textContent = 'нет';
    fleeNo.addEventListener('click', () => {
      closeFleeConfirm();
      render();
    });
    fleeAns.appendChild(fleeYes);
    fleeAns.appendChild(fleeNo);
    fleeBox.appendChild(fleeQuestion);
    fleeBox.appendChild(fleeAns);
    box.appendChild(fleeBox);

    bannerEl = document.createElement('div');
    bannerEl.className = 'combat-banner';
    bannerEl.style.display = 'none';
    bannerEl.onclick = finish; // обработчик постоянный (render только показывает)
    box.appendChild(bannerEl);

    overlay.appendChild(box);
    overlay.appendChild(side);
    document.body.appendChild(overlay);
    if (ctx.lungeGate) {
      overlay.style.visibility = 'hidden';
      overlay.style.pointerEvents = 'none';
    }

    // Бэкинг = размер отображения × dpr (задача 000151): canvas уже в
    // DOM — CSS-размер (000124) доступен для rect. getContext — ровно
    // ОДИН раз на бой, ПОСЛЕ присваиваний canvas.width/height
    // (присвоение сбрасывает состояние контекста; в DOM-стабе каждый
    // getContext пересоздаёт drawCalls).
    const b = measureBacking();
    canvas.width = b.w;
    canvas.height = b.h;
    sx = b.sx;
    sy = b.sy;
    g2 = canvas.getContext('2d');

    canvas.addEventListener('click', (e) => {
      if (fleeOpen) return;
      const r = canvas.getBoundingClientRect();
      // Нормализация по ЛОГИЧЕСКОМУ (базовому) размеру поля
      // (задача 000151, D5; 000124 — по фактическому): canvas
      // CSS-масштабируется под вьюпорт, а БЭКИНГ следует за
      // отображением (b = rect·dpr, кап 8), поэтому коэффициент
      // canvas.width/r.width включал бы масштаб бэкинга — клик
      // попадал бы мимо на s клеток (s 2..8). Числитель — логическое
      // поле baseW = c.width·CELL: коэффициент baseW/rw НЕ зависит от
      // масштаба (s сокращается); при 1:1 baseW === canvas.width —
      // бит-в-бит (3 клика-теста 000124 без правок).
      // Фолбэк r.width || baseW — нулевой/отсутствующий rect
      // (DOM-стабы, патология) → 1:1.
      // Border 2px входит в rect (border-box) — смещение < 0.1 клетки,
      // не компенсируется (конвенция 000124, не усложняем).
      const baseW = c.width * CELL;
      const baseH = c.height * CELL;
      const rw = r.width || baseW;
      const rh = r.height || baseH;
      const cx = Math.floor((e.clientX - r.left) * (baseW / rw) / CELL);
      const cy = Math.floor((e.clientY - r.top) * (baseH / rh) / CELL);
      // Клик в любую клетку прямоугольника моба (задача 000040).
      const u = c.units.find((x) => x.alive && !x.fled
        && cx >= x.x && cx < x.x + (x.size.w || 1)
        && cy >= x.y && cy < x.y + (x.size.h || 1));
      if (u) {
        c.selectTarget(u.id);
        render();
      } else if (canResurrectPick(c)) {
        // «Воскрешение» (задача 000166; 000193.02: гейт canResurrectPick
        // — игрок ИЛИ активный союзник-носитель): ДВЕ ветки ПОСЛЕ живой (порядок
        // определён: живой > мёртвый союзник > клетка мёртвого героя).
        // Мёртвый СОЮЗНИК в прямоугольнике (та же формула rect, что у
        // живой ветки) — прямой write c.targetId (ядро selectTarget
        // союзников отклоняет 000080; resurrection-ветка evalSpell
        // 000163 мёртвого союзника ПРИНИМАЕТ; остальные читатели
        // c.targetId самовалидируют — атака/огонь/спеллы на мёртвом →
        // «нет цели»). Выбор — не действие: лог НЕ растёт.
        const d = c.units.find((x) => x.side === 'ally' && !x.alive
          && !x.fled && cx >= x.x && cx < x.x + (x.size.w || 1)
          && cy >= x.y && cy < x.y + (x.size.h || 1));
        if (d) {
          c.targetId = d.id;
          render();
        } else if (!c.player.alive && cx === c.px && cy === c.py) {
          // Мёртвый ИГРОК: снять явную цель → автоцель (evalSpell
          // 000163: мёртвый игрок приоритетно; игрок НЕ в c.units —
          // поля id нет, адресоваться может только null).
          c.targetId = null;
          render();
        }
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

  // --- Анимация передвижения мобов по пути A* (задача 000174) ---
  //
  // Фаза мобов синхронная (combat.js) — раньше рендер читал финальный
  // тайл и «телепортировал» моба. Теперь ядро ЗАПИСЫВАЕТ принятые
  // «to»-тайлы волны (c._uiMoves — пишут замыкания mobAct, ядро поле
  // не читает), UI drain'ит их в endTurn-тханке (startMoveAnims) и
  // рисует ИМЕННО эту последовательность тайлов: глейд 300 мс на
  // сегмент, поотрезочный smoothstep (motion.js 000033). НОВЫХ rAF
  // НЕТ — playback на существующем tick-цикле 000047 (якорь —
  // функция (состояние, now); в vm — событийный синхронный рендер).
  // Pre-roll не анимируется (ядро выбрасывает его шаги — решение C).
  //
  // API motion.js (lerpPos/easeInOut/stepProgress) — НАПРЯМУЮ на
  // объекте Game (UMD: Object.assign — прецеденты G.cameraStep/
  // G.createMover main.js, live.cameraStep dungeon-ui.js), НЕ в
  // именованном неймспейсе. Деградация: motion.js не загружен
  // (битый порядок / vm без motion.js в цепочке) — ТИХИЙ фолбэк в
  // модельный тайл (= поведение до 000174, играбельно); БЕЗ
  // console.error (пины console.error = 0, паттерн «fallback, если
  // motion.js не загрузился» main.js).

  // Визуальный якорь моба в момент now: {x, y} — ДРОБНЫЙ (в глейде)
  // или модельный тайл. Чистый по (u, moveAnims, now) кроме
  // self-cleaning: завершённый entry удаляется (мутация в render —
  // прецедент ctx.breathedPrev 000118; идемпотентно при том же now —
  // golden-пин :1618). Мультиклеточные мобы — якорь верхний-левый
  // (u.x, u.y), весь прямоугольник движется как одно.
  function mobAnchor(u, now) {
    const entry = moveAnims && moveAnims.get(u.id);
    if (!u.alive || !entry) return { x: u.x, y: u.y };
    const motion = liveGame();
    const segs = entry.path.length - 1;
    if (!motion || typeof motion.stepProgress !== 'function'
        || segs <= 0) {
      moveAnims.delete(u.id);
      if (!moveAnims.size) moveAnims = null;
      return { x: u.x, y: u.y };
    }
    const tAll = motion.stepProgress(now, entry.at, segs * MOB_MOVE_MS);
    if (tAll >= 1) {
      moveAnims.delete(u.id);
      if (!moveAnims.size) moveAnims = null;
      return { x: u.x, y: u.y };
    }
    const raw = tAll * segs;
    const i = Math.max(0, Math.min(segs - 1, Math.floor(raw)));
    return motion.lerpPos(entry.path[i], entry.path[i + 1],
      motion.easeInOut(raw - i));
  }

  // Drain записи ядра (после фазы endTurn): c._uiMoves → moveAnims.
  // По каждому мобы: path = [from, … «to»-тайлы в порядке записей],
  // at = now. `from` — ТЕКУЩИЙ визуальный якорь (моб ещё глейдит
  // предыдущую фазу — re-timing от текущей точки: непрерывность без
  // snap-back при быстром Space; прецедент createMover 000033) либо
  // снимок beforePos (до фазы). Истёкший БЕЗ рендера глейд (окно до
  // следующего тика — Space в момент, когда моб «доехал») — тоже
  // beforePos (старый финальный тайл), а НЕ mobAnchor: тот при tAll≥1
  // self-cleaning-обнуляет moveAnims (moveAnims.set ниже — TypeError)
  // и вернул бы НОВУЮ модель — reverse-глейд от нового финала
  // (регрессии R7/R8, правки по итогам ревью). ЗАМЕНА entry (не
  // накопление). ТОЛЬКО мобы: союзники/герой — ввод игрока, дискретно
  // (фильтр side). Prune: юнит исчез/мёртв/сбежал — entry удалён
  // (труп — на модели).
  function startMoveAnims(c, beforePos, now) {
    const moves = c._uiMoves;
    c._uiMoves = null;
    if (!moves || !moves.length) return;
    if (moveAnims) {
      for (const id of Array.from(moveAnims.keys())) {
        const u = c.units.find((x) => x.id === id);
        if (!u || !u.alive || u.fled) moveAnims.delete(id);
      }
      if (!moveAnims.size) moveAnims = null;
    }
    const seen = new Set();
    for (const m of moves) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      const u = c.units.find((x) => x.id === m.id);
      if (!u || u.side !== 'mob' || !u.alive || u.fled) continue;
      // Старый entry — «живой» (тот же now, та же формула, что в
      // mobAnchor: tAll < 1, сегменты есть, motion-ядро на месте),
      // только тогда from = mobAnchor (re-timing от дробного якоря).
      // Истёкший без рендера — завершённый: from = beforePos. mobAnchor
      // при tAll≥1 self-cleaning-обнуляет moveAnims — звать его здесь
      // нельзя (moveAnims.set ниже упёрся бы в null; TypeError в
      // handleCode — регрессия R7), и он вернул бы НОВУЮ модель —
      // reverse-глейд (R8).
      const oldEntry = moveAnims ? moveAnims.get(u.id) : null;
      let oldAlive = false;
      if (oldEntry) {
        const segs0 = oldEntry.path.length - 1;
        const m0 = liveGame();
        oldAlive = segs0 > 0
          && !!m0 && typeof m0.stepProgress === 'function'
          && m0.stepProgress(now, oldEntry.at, segs0 * MOB_MOVE_MS) < 1;
      }
      const from = oldAlive
        ? mobAnchor(u, now)
        : (beforePos.get(u.id) || { x: u.x, y: u.y });
      // Перенесено СЮДА — ПОСЛЕ вычисления from (мог вызваться
      // mobAnchor, чей self-cleaning обнуляет map; R7).
      if (!moveAnims) moveAnims = new Map();
      const path = [{ x: from.x, y: from.y }];
      for (const mm of moves)
        if (mm.id === u.id) path.push({ x: mm.x, y: mm.y });
      moveAnims.set(u.id, { path, at: now });
    }
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
    // 000149: fire/heal из таблицы убраны — их заменило действие
    // 'spellbook' (toggle книги; каст — клик по строке, castRow).
    // 000168: thunk'и cast (Эфир — K, handleCode-remap) и heal
    // (support — KeyH-ветка); attack — БЕЗ ИЗМЕНЕНИЙ (Эфир-Касание
    // раскатывается диспатчем ядра c.attack).
    const run = {
      attack: () => c.attack(c.targetId),
      cast: () => c.cast(c.targetId),
      heal: () => c.heal(),
      spellbook: () => {
        // «Книга заклинаний» — действие UI, не ядра: предпроверка —
        // canDoAction (книга не пуста; по клавише она уже пройдена в
        // handleCode, здесь она нужна для клика по кнопке). Отказ —
        // причину logRejection запишет в c.log ниже; книга не
        // открывается.
        const r = G.canDoAction(c, 'spellbook', { targetId: c.targetId });
        if (r.ok) toggleBook();
        return r;
      },
      block: () => c.block(),
      quickItem: () => {
        // 000194: «Быстрый предмет» — СПИСОК (контракт
        // memory/000194-ally-quick-items.md §2.8): KeyE/клик кнопки —
        // toggle списка ПОВЕРХ экрана боя; выбор предмета — кликом по
        // строке (quickUseRow). canDoAction здесь — для клика кнопки
        // (по клавише предпроверка уже в handleCode). quickOpenable —
        // stale-слот (canDo «предмета нет в инвентаре»): список
        // всё-таки ОТКРЫВАЕТСЯ (строка приглушена, причина — на
        // строке и в журнале при клике, тест 194-QUI-REJ). Открытие
        // НЕ тратит действие (возврат {ok:true} — logRejection
        // молчит; пул/предмет тратятся только в quickUseRow).
        const r = G.canDoAction(c, 'quickItem', { targetId: c.targetId });
        if (r.ok || quickOpenable(c)) {
          toggleQuickList();
          return { ok: true };
        }
        return r;
      },
      invItem: () => {
        // 000195: «Предмет [T]» — [I]-панель на ТЕКУЩЕМ персонаже боя
        // (активный юнит хода; игрок/моб — 'flogiston'); «быстр.»
        // (000194) перекладывает предмет общего инвентаря. Открытие
        // бесплатно: пул/ c._rng не тратятся (паттерн spellbook).
        // Деградация (нет ui.js) — старый путь c.invItem() бит-в-бит
        // (195-CUI-DEGRADE).
        if (G.playerUI && typeof G.playerUI.toggle === 'function') {
          const u = activeUnit(c);
          G.playerUI.toggle(true, 'inventory', u ? u.id : 'flogiston');
          return { ok: true };
        }
        return c.invItem();
      },
      flee: () => {
        const r = G.canDoAction(c, 'flee', { targetId: c.targetId });
        if (r.ok && !fleeOpen) openFleeConfirm();
        return r;
      },
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
        // 000174: drain записи принятых шагов — глейд мобов по
        // A*-полилинии (вместо телепортации); beforePos — «до».
        startMoveAnims(c, beforePos, nowMs());
        return r;
      },
    }[action];
    const healToId = action === 'heal' ? healFxTargetId(c) : null;
    const hpBefore = action === 'attack'
      ? new Map(c.units.map((u) => [u.id, u.hp])) : null;
    const r = run ? run() : undefined;
    logRejection(c, r);
    // Анимация героя (задача 000047): UI-состояние ТОЛЬКО в UI-слое —
    // поле c._fx (ядро combat.js его не читает; там есть только c._rng).
    // Пишется после УСПЕШНОГО действия (r.ok): атака — 'attack', на
    // ~300 мс. Невыполненное действие (ok:false — отклонено ядром)
    // анимации не даёт. Промасх (ok:true, hit:false) — действие
    // потрачено, анимация уместна (удар есть, цель не задета).
    // 000149: 'cast'-анимация — в castRow (успешный каст из строки
    // книги); ветка fire/heal удалена (действий больше нет).
    if (r && r.ok) {
      // 000168 (P11/R15): hero-анимация — ТОЛЬКО на ударе игрока;
      // на ударе наёмника/Касании Эфира герой не анимируется
      // (активен союзник — activeUnit ≠ null).
      if (action === 'attack' && !activeUnit(c)) {
        c._fx = { action: 'attack', until: nowMs() + FX_MS };
        c._attackFx = attackFxOf(c, 'player', nowMs(),
          heroBowKind(c), r, hpBefore);
      } else if (action === 'attack') {
        const au = activeUnit(c);
        if (au) {
          c._attackFx = attackFxOf(c, au, nowMs(),
            au.role === 'ranged' ? 'ranged' : 'melee', r, hpBefore);
        }
      } else if (action === 'cast' || action === 'heal') {
        const u = activeUnit(c);
        if (u) {
          const n = nowMs();
          const sid = typeof G.autoSpellFor === 'function'
            ? G.autoSpellFor(u, action === 'heal' ? 'лечение' : 'урон')
            : null;
          const entry = (sid && G.SpellsData && G.SpellsData.SPELLS_BY_ID)
            ? G.SpellsData.SPELLS_BY_ID[sid] : null;
          c._fx = {
            action: 'cast', until: n + FX_MS,
            castFx: entry
              ? castFxOf(c, u, entry,
                action === 'heal' ? healToId : c.targetId, n)
              : null,
          };
        }
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
    // 000195: sync ДО снимка st.canDo — иначе гейты (quickItem и пр.)
    // после «быстр.» панели видели бы устаревший u.quick (снапшот).
    syncAllyQuickLive(c);
    if (ctx.lungeGate && !c.result) return false;
    if (fleeOpen) return true;
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
    } else if (code === 'KeyH' && c.phase === 'player' && !c.result
        && activeUnit(c)) {
      // 000168 (D9/P4): лечение АКТИВНОГО support-наёмника — отдельная
      // ветка ДО lookup таблицы (KeyH в застывшей таблице
      // combat-keys.js НЕТ — «кнопок новых НЕТ», D10). 000227: единый
      // обработчик lastSpellPress (кнопка = клавиша): выбор из книги →
      // castRow; без выбора — legacy c.heal() бит-в-бит. На ходу
      // ИГРОКА ветка не срабатывает — фоллбук в таблицу, где KeyH
      // отсутствует (бит-в-бит).
      lastSpellPress(c, 'heal');
    } else if (code === 'KeyK' && activeIsEfir(c)) {
      // 000168 (D9/P3): на ходу Эфира KeyK — КАСТ; 000227: единый
      // обработчик lastSpellPress (кнопка = клавиша; старый remap
      // KeyK→'cast' УДАЛЁН): выбор из книги → выбранный; без выбора —
      // legacy strongestKnown бит-в-бит. На ходу не-Эфира — фоллбук
      // в таблицу (KeyK → 'attack', бит-в-бит).
      lastSpellPress(c, 'cast');
    } else {
      // Единая таблица (src/combat-keys.js, задача 000048): движение и
      // действия. Снимок для resolveCombatKey: canDo — результат
      // canDoAction именно для действия этой клавиши (000037).
      const entry = G.CombatKeys.COMBAT_KEYS[code];
      const st = { phase: c.phase, result: c.result };
      const action = entry ? entry.action : null;
      if (entry && entry.type === 'action') {
        st.canDo = G.canDoAction(c, action, { targetId: c.targetId });
      }
      // 000194: «Быстрый предмет» — список: canDoAction смотрит ПЕРВЫЙ
      // занятой слот — stale-слот (предмета нет в инвентаре) гасит бы
      // список, хотя у активного персонажа есть остальные слоты.
      // quickOpenable — занятый слот + пул: список ОТКРЫВАЕТСЯ,
      // причина видна на приглушённой строке (тест 194-QUI-REJ).
      if (action === 'quickItem' && st.canDo && !st.canDo.ok
          && quickOpenable(c)) {
        st.canDo = { ok: true };
      }
      const r = G.CombatKeys.resolveCombatKey(code, st);
      if (r.kind === 'move') {
        // playerMove/allyMove само проверяет ход/шаги/стену/моба и
        // возвращает reason — в журнал, а не тишина (задача 000048;
        // 000168: c.move стал контекстным — диспатч по активному).
        logRejection(c, c.move(r.dx, r.dy));
      } else if (r.kind === 'action') {
        if (r.reason) {
          c.log.push(r.reason); // действие невозможно — причина в журнал
        } else {
          runAction(c, action);
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
  // Масштаб отображения (задача 000151): window «resize» — тот же
  // паттерн, что keydown: слушатель ОДИН раз при загрузке, guard
  // isActive() ВНУТРИ (onResize), в finish() НЕ снимается. CSS 000124
  // меняет размер отображения мгновенно — бэкинг переизмеряется под
  // него (canvas.width/height + sx/sy + render, только при смене b).
  window.addEventListener('resize', onResize);

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
  // только кадр; у героя — миниполоса HP ПОСЛЕ спрайта, а на его ход — голубая рамка 39×39 на клетке (000213, без подложки). У союзника
  // (задачи 000084/000197): (активен: подложка 44×44) →
  // спрайт/фолбэк → полоса HP (трек + заполнение hpBarColor) →
  // уровень → (активен: голубая рамка 39×39) — подложка и рамка
  // ТОЛЬКО у активного (isCurrent); индикатор хода (кольцо 41×41)
  // удалён — «чей ход» показывает голубая рамка (000199 L4) —
  // контракт memory/000197-combat-frames.md (вытесняет «рамка +
  // кольцо» слои memory/000084-ally-render.md).
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

    // Маркеры «Воскрешения» (задача 000166; 000193.02: гейт
    // canResurrectPick — игрок ИЛИ активный союзник-носитель): РАННИЙ
    // проход — маркеры рисуются ПОД всеми юнитами (z-порядок
    // «подложка — первая», как у живых союзников). ГЕЙТ canResurrectPick
    // — ПЕРВАЯ строка: без него (все существующие сцены:
    // createCharacter = ['spark','mend']) — бит-в-байт. Подложка
    // ALLY_MARKER_UNDERLAY (геометрия подложки
    // живого союзника: +2/inset, pw−4×ph−4) — на клетке КАЖДОГО мёртвого
    // союзника (side 'ally', !alive, !fled) и мёртвого героя; кольцо
    // #ffe27a lw2 (геометрия подсветки цели моба: +4.5/inset, pw−9×ph−9)
    // — ТОЛЬКО на выбранной: союзник u.id === c.targetId; герой
    // c.targetId === null (автоцель — «вы»). Мёртвые МОБЫ маркеров НЕ
    // получают (только side 'ally'). Мутаций c в отрисовке НЕТ (только
    // g2-вызовы), ноль c._rng.
    if (canResurrectPick(c)) {
      for (const u of c.units) {
        if (u.side !== 'ally' || u.alive || u.fled) continue;
        const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
        const px = u.x * CELL, py = u.y * CELL;
        const pw = w * CELL, ph = h * CELL;
        g2.fillStyle = ALLY_MARKER_UNDERLAY;
        g2.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        if (u.id === c.targetId) {
          g2.strokeStyle = '#ffe27a';
          g2.lineWidth = 2;
          g2.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);
        }
      }
      if (c.player && !c.player.alive) {
        // Мёртвый игрок: подложка на клетке героя (всегда, в гейте);
        // кольцо — при c.targetId === null (автоцель — игрок).
        const hx = c.px * CELL, hy = c.py * CELL;
        g2.fillStyle = ALLY_MARKER_UNDERLAY;
        g2.fillRect(hx + 2, hy + 2, CELL - 4, CELL - 4);
        if (c.targetId === null) {
          g2.strokeStyle = '#ffe27a';
          g2.lineWidth = 2;
          g2.strokeRect(hx + 4.5, hy + 4.5, CELL - 9, CELL - 9);
        }
      }
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
    // наёмник С npcId — G.mercFrames(u.id, action) (задача 000152:
    // у каждого нанимаемого NPC — свой вид, каталог
    // assets/sprites/mercs/; u.id = npc.id — проводка makeAlly,
    // combat.js не правится); наёмник без npcId (тестовые fix-наёмники,
    // id 'a'+idx) и неизвестные id — G.MOB_FRAMES[ALLY_MERC_KIND]
    // (orc-архетип-заглушка, пин 000084 — без правок). Чистая
    // селекция (аналог mobSprite): кадры → G.frameIndex(now, x, y, n)
    // (детерминизм, now — один на render) → spriteLoader.image()
    // (картинка, загрузившаяся ПОСЛЕ старта боя — подхватывается
    // следующим render, паттерн фона 000049). v1: action = 'idle'
    // всегда (MOB_FRAMES/MERC_FRAMES действий не имеют; c._unitFx —
    // player-центричная эвристика 000062, в ally-ветке НЕ читается —
    // ложный 'attack'). Без кадров/лоадера — null → фолбэк-прямоугольник
    // по роли в вызывающей ветке (деградация, не падение).
    function allyFrames(u, now, action) {
      let frames = [];
      if (u.kind === 'efir') frames = G.efirFrames ? G.efirFrames(action) : [];
      else if (u.kind === 'merc' && u.id) {
        // 000152: per-npcId спрайт; пустой результат (id без npcId,
        // например 'a1', или неизвестный id) — orc-fallback.
        frames = G.mercFrames ? G.mercFrames(u.id, action) : [];
        if (!frames.length)
          frames = G.MOB_FRAMES ? (G.MOB_FRAMES[ALLY_MERC_KIND] || []) : [];
      }
      else frames = G.MOB_FRAMES ? (G.MOB_FRAMES[ALLY_MERC_KIND] || []) : [];
      if (!frames.length || !ctx.spriteLoader) return null;
      const idx = (frames.length > 1 && G.frameIndex)
        ? G.frameIndex(now, u.x, u.y, frames.length) : 0;
      return ctx.spriteLoader.image(frames[idx]) || null;
    }

    for (const item of list) {
      if (item.kind === 'ally') {
        // Союзник (задачи 000084/000197): слои ПОРЯДКОМ — (активен:
        // подложка) → спрайт/фолбэк → полоса HP (трек + заполнение)
        // → уровень → (активен: голубая рамка). Подложка И рамка —
        // ТОЛЬКО у активного союзника (isCurrent, задача 000197:
        // «убрать постоянно горящую голубую; голубая = активный;
        // жёлтая = выбранный/цель»); жёлтое кольцо хода 41×41
        // УДАЛЕНО — роль «чей ход» перенята голубой рамкой (000199
        // L4). Контракт — memory/000197-combat-frames.md.
        // Геометрия 1×1 (makeAlly: ВСЕГДА size {w:1,h:1}), формулы —
        // через w/h, как в mob-ветке.
        const u = item.u;
        const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
        const px = u.x * CELL, py = u.y * CELL;
        const pw = w * CELL, ph = h * CELL;
        // «Активен» — ОДИН раз в начале ветви (ДО подложки): гейтит
        // и подложку, и рамку. Формула — БИТ-В-БИТ токены
        // renderTurnOrder (000036; семантика 000167/000168: активен
        // = c.turnOrder[c.turnIndex]).
        const isCurrent = !c.result && c.turnOrder
          && c.turnOrder[c.turnIndex] === u.id && u.alive && !u.fled;
        // Подложка — ПЕРВАЯ (под всеми слоями юнита), ТОЛЬКО у
        // активного (задача 000197).
        if (isCurrent) {
          g2.fillStyle = ALLY_MARKER_UNDERLAY;
          g2.fillRect(px + 2, py + 2, pw - 4, ph - 4);
        }
        // Спрайт (запас 8px — как у мобов) или фолбэк-прямоугольник.
        const cfx = c._fx && c._fx.castFx;
        const allyAction = (c._fx && c._fx.action === 'cast'
          && now < c._fx.until && cfx && cfx.from === u.id
          && u.kind === 'efir') ? 'cast' : 'idle';
        const img = allyFrames(u, now, allyAction);
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
        // Уровень (правый верхний угол, 6px, 000204) — как у мобов.
        g2.fillStyle = '#fff';
        g2.font = '6px ui-monospace, monospace';
        g2.textAlign = 'right';
        g2.fillText(String(u.level), px + pw - 4, py + 12);
        // Голубая рамка — ПОВЕРХ спрайта (паттерн подсветки цели),
        // ТОЛЬКО у активного союзника (задача 000197; жёлтое кольцо
        // хода 41×41 удалено — 000199 L4, «чей ход» показывает рамка).
        if (isCurrent) {
          g2.strokeStyle = ALLY_MARKER;
          g2.lineWidth = 2;
          g2.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);
        }
      } else if (item.kind === 'mob') {
        const u = item.u;
        const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
        // 000174: ОДИН визуальный якорь для всех слоёв моба (спрайт,
        // HP-полоса, уровень, подсветка цели, труп): дробный в глейде,
        // иначе модель (у !u.alive — модель; steady-state бит-в-бит).
        // z-порядок — по финальной модели (сортировка list выше).
        const ap = mobAnchor(u, now);
        const px = ap.x * CELL, py = ap.y * CELL;
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
        // Уровень (правый верхний угол, 6px, 000204).
        g2.fillStyle = '#fff';
        g2.font = '6px ui-monospace, monospace';
        g2.textAlign = 'right';
        g2.fillText(String(u.level), px + pw - 4, py + 12);
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
        const heroCurrent = !c.result && c.turnOrder
          && c.turnOrder[c.turnIndex] === 'player' && c.player && c.player.alive;
        const cfxH = c._fx && c._fx.castFx;
        const action = (c._fx && c._fx.action && now < c._fx.until
          && !(c._fx.action === 'cast' && cfxH && cfxH.from !== 'player'))
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
          // Кламп в ЛОГИЧЕСКОЕ поле (задача 000151, D8): canvas.width
          // — бэкинг (поле × масштаб); при активном трансформе старый
          // кламп «выключался» (bэкинг >> поля). При s = 1 c.width·
          // CELL === canvas.width — бит-в-бит.
          const bw = Math.round(size);
          const bx = Math.max(2,
            Math.min(c.width * CELL - bw - 2, Math.round(hx - bw / 2)));
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
        if (heroCurrent) {
          g2.strokeStyle = ALLY_MARKER;
          g2.lineWidth = 2;
          g2.strokeRect(c.px * CELL + 4.5, c.py * CELL + 4.5, CELL - 9, CELL - 9);
        }
      }
    }
  }

  // FX «Вдох Эфира» (000118): отдельный слой эффектов — вызов в
  // render() СРАЗУ ПОСЛЕ drawUnits (z-порядок: фон → сетка →
  // препятствия → юниты → эффекты; 000114 §4: FX ПОВЕРХ всех слоёв
  // юнита). Источники: (1) аура на каждом ЖИВОМ союзнике
  // (side 'ally' в c.units, включая Эфира; герой НЕ в c.units —
  // «не больше, чем ТЗ»): beginPath + arc(центр клетки,
  // CELL·(0.35 + 0.15·t), 0, 2π), fill ALLY_MARKER_UNDERLAY +
  // stroke ALLY_MARKER (lineWidth 2); (2) волна от Эфира
  // (u.id === 'efir', живой; фолбэк — центр поля): растущее кольцо
  // r = CELL·0.5 + max(width, height)·CELL·0.5·t, stroke ALLY_MARKER
  // (lineWidth 2); (3) малые кольца на живых врагах (side 'mob',
  // не fled): arc(центр, CELL·(0.2 + 0.2·t), …), stroke ALLY_MARKER
  // (lineWidth 1.5). Палитра — ТОЛЬКО существующие константы
  // ALLY_MARKER/ALLY_MARKER_UNDERLAY (000038: новых цветов НЕТ).
  // Детерминизм: НУЛЬ c._rng — мутируется только c._fx (UI-поле,
  // ядро его не читает). t = (now − at)/(until − at) ∈ [0, 1) —
  // плавный рост; экспирация — now ≥ until → ничего (ранний
  // возврат; под-объект в c._fx может остаться — инертен: рендер
  // гвардится by until, hero-селектор c._fx.action его не видит).
  // Риск (контракт 000118 §5 R2, задокументировано, НЕ чинится —
  // «не больше ТЗ»): действие героя ПОСЛЕ Вдоха заменяет c._fx
  // целиком (runAction: {action:'attack'|'cast', …}) →
  // c._fx.breath теряется → эффект заканчивается досрочно (окно
  // 600 мс — косметически допустимо).
  function drawBreathFx(c, now) {
    const fx = c._fx && c._fx.breath;
    if (!fx || now >= fx.until) return;
    const t = (now - fx.at) / (fx.until - fx.at); // [0, 1)
    const center = (u) => [
      (u.x + ((u.size && u.size.w) || 1) / 2) * CELL,
      (u.y + ((u.size && u.size.h) || 1) / 2) * CELL,
    ];
    // (1) Аура на живых союзниках.
    for (const u of c.units) {
      if (u.side !== 'ally' || !u.alive) continue;
      const [ax, ay] = center(u);
      g2.beginPath();
      g2.arc(ax, ay, CELL * (0.35 + 0.15 * t), 0, Math.PI * 2);
      g2.fillStyle = ALLY_MARKER_UNDERLAY;
      g2.fill();
      g2.strokeStyle = ALLY_MARKER;
      g2.lineWidth = 2;
      g2.stroke();
    }
    // (2) Волна от Эфира.
    const efirU = c.units.find((u) => u.id === 'efir' && u.alive);
    const [wx, wy] = efirU
      ? center(efirU)
      : [c.width / 2 * CELL, c.height / 2 * CELL];
    g2.beginPath();
    g2.arc(wx, wy,
      CELL * 0.5 + Math.max(c.width, c.height) * CELL * 0.5 * t,
      0, Math.PI * 2);
    g2.strokeStyle = ALLY_MARKER;
    g2.lineWidth = 2;
    g2.stroke();
    // (3) Малые кольца на живых врагах.
    for (const u of c.units) {
      if (u.side !== 'mob' || !u.alive || u.fled) continue;
      const [ex, ey] = center(u);
      g2.beginPath();
      g2.arc(ex, ey, CELL * (0.2 + 0.2 * t), 0, Math.PI * 2);
      g2.strokeStyle = ALLY_MARKER;
      g2.lineWidth = 1.5;
      g2.stroke();
    }
  }

  function rgba(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', '
      + (n & 255) + ', ' + a + ')';
  }

  function autoResurrectId(c) {
    if (c.player && !c.player.alive) return 'player';
    const d = c.units.find((u) => u.side === 'ally' && !u.alive && !u.fled);
    return d ? d.id : null;
  }

  function healFxTargetId(c) {
    if (!c.player) return null;
    let best = null, bestFrac = null;
    const consider = (frac, ref) => {
      if (frac >= 1) return;
      if (bestFrac == null || frac < bestFrac) { best = ref; bestFrac = frac; }
    };
    consider(c.player.hp / G.derived(c.player).maxHP, { player: true });
    for (const u of c.units) {
      if (u.side !== 'ally' || !u.alive || u.fled) continue;
      if (!(u.maxHP > 0)) continue;
      consider(u.hp / u.maxHP, { unit: u });
    }
    if (!best) return null;
    return best.player ? 'player' : best.unit.id;
  }

  function castFxOf(c, caster, spell, toId, at) {
    if (!spell) return null;
    return {
      at: at,
      until: at + SPELL_FX_MS,
      spellId: spell.id,
      name: spell['название'],
      school: spell['школа'],
      from: caster === c.player ? 'player' : caster.id,
      toId: toId || null,
    };
  }

  function toIdOf(c, spell, targetId) {
    const act = spell && spell['действие'];
    if (act === 'воскрешение') return targetId || autoResurrectId(c);
    if (act && CAST_FX_TARGETED[act]) return targetId || null;
    return 'self';
  }

  function castFxCenter(c, who) {
    if (who === 'player') {
      return [(c.px + 0.5) * CELL, (c.py + 0.5) * CELL];
    }
    const u = c.units.find((x) => x.id === who);
    if (!u) return null;
    return [
      (u.x + ((u.size && u.size.w) || 1) / 2) * CELL,
      (u.y + ((u.size && u.size.h) || 1) / 2) * CELL,
    ];
  }

  function heroBowKind(c) {
    const p = c.player;
    const eq = p && p.equipment;
    const w = (eq && eq.weapon && typeof G.getItem === 'function')
      ? G.getItem(eq.weapon) : null;
    return !!(w && w.subtype === 'bow') ? 'ranged' : 'melee';
  }

  function attackVictimId(c, hpBefore) {
    if (!hpBefore) return null;
    for (const u of c.units) {
      if (u.side !== 'mob') continue;
      const before = hpBefore.get(u.id);
      if (before > 0 && (!u.alive || u.hp < before)) return u.id;
    }
    return null;
  }

  function attackIntendedId(c) {
    if (!c.targetId) return null;
    const t = c.units.find((u) => u.id === c.targetId);
    if (!t || t.side !== 'mob' || !t.alive || t.fled) return null;
    return t.id;
  }

  function attackFxOf(c, from, at, kind, r, hpBefore) {
    return {
      at: at,
      until: at + ATTACK_FX_MS,
      kind: kind,
      from: from === 'player' ? 'player' : (from ? from.id : null),
      toId: attackVictimId(c, hpBefore) || attackIntendedId(c),
      hit: r.hit !== false,
    };
  }

  function atkCell(c, who) {
    if (who === 'player') return { x: c.px, y: c.py, w: 1, h: 1 };
    const u = c.units.find((x) => x.id === who);
    if (!u) return null;
    return { x: u.x, y: u.y,
             w: (u.size && u.size.w) || 1, h: (u.size && u.size.h) || 1 };
  }

  function atkDir(fromCell, toCell) {
    const dx = toCell.x + toCell.w / 2 - (fromCell.x + fromCell.w / 2);
    const dy = toCell.y + toCell.h / 2 - (fromCell.y + fromCell.h / 2);
    const dist = Math.sqrt(dx * dx + dy * dy);
    return dist > 0 ? { ux: dx / dist, uy: dy / dist } : null;
  }

  function atkRect(el, cell, c) {
    el.style.left = (cell.x / c.width * 100) + '%';
    el.style.top = (cell.y / c.height * 100) + '%';
    el.style.width = (cell.w / c.width * 100) + '%';
    el.style.height = (cell.h / c.height * 100) + '%';
  }

  function drawCastFx(c, now) {
    const fx = c._fx && c._fx.castFx;
    if (!fx || now >= fx.until) return;
    const t = (now - fx.at) / (fx.until - fx.at);
    const color = CAST_FX_SCHOOLS[fx.school] || CAST_FX_FALLBACK;
    const cu = fx.from === 'player'
      ? { x: c.px, y: c.py, size: { w: 1, h: 1 } }
      : c.units.find((x) => x.id === fx.from);
    if (!cu) return;
    const ccx = (cu.x + ((cu.size && cu.size.w) || 1) / 2) * CELL;
    const ccy = (cu.y + ((cu.size && cu.size.h) || 1) / 2) * CELL;
    const ccTop = cu.y * CELL;
    g2.font = CAST_FX_TEXT;
    g2.textAlign = 'center';
    g2.fillStyle = color;
    g2.fillText(fx.name, ccx, Math.max(2, ccTop - 6 - 10 * t));
    const ringR = CELL * (0.3 + 0.3 * t);
    if (fx.toId === 'self') {
      g2.fillStyle = rgba(color, 0.25);
      g2.strokeStyle = color;
      g2.lineWidth = 2;
      g2.beginPath();
      g2.arc(ccx, ccy, ringR, 0, Math.PI * 2);
      g2.fill();
      g2.stroke();
      return;
    }
    g2.strokeStyle = color;
    g2.lineWidth = 2;
    g2.beginPath();
    g2.arc(ccx, ccy, ringR, 0, Math.PI * 2);
    g2.stroke();
    const tc = castFxCenter(c, fx.toId);
    if (!tc) return;
    if (t < 0.5) {
      const m = liveGame();
      const k = (m && typeof m.easeInOut === 'function')
        ? m.easeInOut(t / 0.5) : t / 0.5;
      const ox = ccx + (tc[0] - ccx) * k;
      const oy = ccy + (tc[1] - ccy) * k;
      g2.fillStyle = rgba(color, 0.3);
      g2.beginPath();
      g2.arc(ox, oy, CELL * 0.16, 0, Math.PI * 2);
      g2.fill();
      g2.fillStyle = color;
      g2.beginPath();
      g2.arc(ox, oy, CELL * 0.07, 0, Math.PI * 2);
      g2.fill();
      g2.strokeStyle = color;
      g2.lineWidth = 2;
      g2.beginPath();
      g2.arc(ox, oy, CELL * 0.12, 0, Math.PI * 2);
      g2.stroke();
      const dx = tc[0] - ccx, dy = tc[1] - ccy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0) {
        g2.fillStyle = rgba(color, 0.18);
        g2.beginPath();
        g2.arc(ox - (dx / dist) * CELL * 0.14,
          oy - (dy / dist) * CELL * 0.14, CELL * 0.06, 0, Math.PI * 2);
        g2.fill();
      }
    } else {
      const q = (t - 0.5) * 2;
      const r = CELL * (0.25 + 0.45 * q);
      g2.fillStyle = rgba(color, 0.35 * (1 - q));
      g2.beginPath();
      g2.arc(tc[0], tc[1], r, 0, Math.PI * 2);
      g2.fill();
      g2.strokeStyle = color;
      g2.lineWidth = 2;
      g2.beginPath();
      g2.arc(tc[0], tc[1], r, 0, Math.PI * 2);
      g2.stroke();
    }
  }

  function syncAttackFx(c, now) {
    if (!boxEl) return;
    const sources = [];
    const afx = c._attackFx;
    if (afx && now < afx.until) {
      sources.push({ t: afx.at, from: afx.from, kind: afx.kind,
        toId: afx.toId, hit: afx.hit });
    }
    const ufx = c._unitFx;
    if (ufx) {
      for (const u of c.units) {
        if (u.side !== 'mob' || !u.alive || u.fled) continue;
        const f = ufx[u.id];
        if (!f || f.action !== 'attack' || now >= f.until) continue;
        sources.push({ t: f.until, from: u.id,
          kind: u.role === 'ranged' ? 'ranged' : 'melee',
          toId: 'player', hit: true, mob: true });
      }
    }
    if (!sources.length) {
      if (atkLayer) {
        atkLayer.remove();
        atkLayer = null;
      }
      atkKids = {};
      return;
    }
    if (!atkLayer) {
      atkLayer = document.createElement('div');
      atkLayer.className = 'combat-atk-layer';
      boxEl.appendChild(atkLayer);
    }
    const keep = {};
    for (const s of sources) {
      const fc = atkCell(c, s.from);
      if (!fc) continue;
      const tc = s.toId ? atkCell(c, s.toId) : null;
      const dir = tc ? atkDir(fc, tc) : null;
      const dkey = 'src-' + s.from + '-' + s.t;
      keep[dkey] = 1;
      if (!atkKids[dkey]) {
        const el = document.createElement('div');
        el.className = s.kind === 'melee'
          ? 'combat-atk combat-atk-lunge'
          : 'combat-atk combat-atk-draw';
        atkRect(el, fc, c);
        el.style['--fx-lx'] =
          ((dir ? dir.ux * LUNGE_CELLS : 0) / fc.w * 100) + '%';
        el.style['--fx-ly'] =
          ((dir ? dir.uy * LUNGE_CELLS : 0) / fc.h * 100) + '%';
        atkLayer.appendChild(el);
        atkKids[dkey] = el;
      }
      if (tc && s.kind === 'ranged') {
        const akey = 'arrow-' + s.from + '-' + s.toId + '-' + s.t;
        keep[akey] = 1;
        if (!atkKids[akey]) {
          const el = document.createElement('div');
          el.className = 'combat-atk combat-atk-arrow';
          const fx = (fc.x + fc.w / 2) / c.width * 100;
          const fy = (fc.y + fc.h / 2) / c.height * 100;
          const tx = (tc.x + tc.w / 2) / c.width * 100;
          const ty = (tc.y + tc.h / 2) / c.height * 100;
          el.style.left = fx + '%';
          el.style.top = fy + '%';
          el.style['--fx-x0'] = fx + '%';
          el.style['--fx-y0'] = fy + '%';
          el.style['--fx-x1'] = tx + '%';
          el.style['--fx-y1'] = ty + '%';
          el.style['--fx-angle'] =
            (Math.atan2(ty - fy, tx - fx) * 180 / Math.PI) + 'deg';
          if (s.mob) el.style['--fx-arrow-dur'] = '300ms';
          atkLayer.appendChild(el);
          atkKids[akey] = el;
        }
      }
      if (tc && s.hit) {
        const hkey = 'hit-' + s.toId + '-' + s.t;
        keep[hkey] = 1;
        if (!atkKids[hkey]) {
          const el = document.createElement('div');
          el.className = 'combat-atk combat-atk-hit';
          atkRect(el, tc, c);
          const tightHit = s.kind === 'melee' || s.mob;
          el.style['--fx-hit-delay'] = (tightHit ? 100 : 380) + 'ms';
          el.style['--fx-hit-dur'] = (tightHit ? 200 : 220) + 'ms';
          atkLayer.appendChild(el);
          atkKids[hkey] = el;
        }
      }
    }
    for (const key of Object.keys(atkKids)) {
      if (!keep[key]) {
        atkKids[key].remove();
        delete atkKids[key];
      }
    }
  }

  // Штриховка клеток, до которых выбранный моб доходит за один ход
  // (задача 000175): ядро — G.mobReachCells (BFS по u.movePerTurn;
  // контракт memory/000175-mob-reach-hatch.md §2).
  // ГЕЙТ (D6): c.targetId → ЖИВОЙ не-fled юнит side === 'mob' —
  // ТО ЖЕ условие, что жёлтое кольцо цели в drawUnits: штриховка
  // появляется и исчезает ровно тогда, когда кольцо. Фазовых и
  // result-гейтов НЕТ. z-порядок — слой МЕЖДУ сеткой и препятствиями
  // (вызов в render() — после сетки, до «Состояние героя»/препятствий).
  // Геометрия (D8): ОДНА диагональ 45° на клетку, inset 8px (конвенция
  // спрайта юнита 000084): moveTo(px+8, py+40) → lineTo(px+40, py+8).
  // Стиль — ОДИН раз до цикла (MOB_REACH_HATCH + lineWidth 1).
  // Итерация по Set (порядок вставки BFS — детерминирован, паттерн
  // итерации по c.obstacles). Рендер ЧИСТЫЙ: 0 log-push, 0 drawImage
  // (штриховка — stroke-only), 0 мутаций c (G.mobReachCells чистая).
  // Деградация (D10, УМД-ловушка 000038): G.mobReachCells отсутствует
  // в снапшоте (битый порядок загрузки) → console.error ОДИН раз
  // (reachWarned) + штриховка не рисуется, рендер не падает.
  function drawMobReachHatch(c) {
    const u = c.targetId
      ? c.units.find((x) => x.id === c.targetId) : null;
    if (!u || u.side !== 'mob' || !u.alive || u.fled) return;
    if (typeof G.mobReachCells !== 'function') {
      if (!reachWarned) {
        reachWarned = true;
        console.error('combat-ui.js: Game.mobReachCells недоступен ' +
          '(src/combat.js обязан грузиться ДО src/combat-ui.js, ' +
          'задача 000175) — без штриховки зоны досягаемости');
      }
      return;
    }
    const cells = G.mobReachCells(c, u);
    if (!cells.size) return;
    g2.strokeStyle = MOB_REACH_HATCH;
    g2.lineWidth = 1;
    for (const key of cells) {
      const sep = key.indexOf(',');
      const px = Number(key.slice(0, sep)) * CELL;
      const py = Number(key.slice(sep + 1)) * CELL;
      g2.beginPath();
      g2.moveTo(px + 8, py + 40);
      g2.lineTo(px + 40, py + 8);
      g2.stroke();
    }
  }

  function render() {
    if (!ctx || !ctx.open) return;
    const c = ctx.combat;
    // 000195: свежие быстрые слоты союзников — состояние кнопок/
    // quicklist/бейджей актуально между нажатиями (идемпотентно).
    syncAllyQuickLive(c);
    // ОДНО время на весь render (задача 000047): чистые селекторы
    // кадров (G.frameIndex) получают его аргументом — весь кадр
    // выбирается детерминированно (тот же now → те же кадры).
    const now = nowMs();

    // FX «Вдох Эфира» (000118): edge-detect c.efirBreathed (ядро
    // 000113 — выставляется один раз за бой в алли-фазе; контракт
    // 000113 §8: «UI видит переключение при рендере»). Ядро НЕ знает
    // о fx: c._fx.breath — ПОД-ОБЪЕКТ, НЕ слот действия героя
    // {action, until} (hero-ветка drawUnits читает c._fx.action —
    // undefined → 'idle'; существующие пины c._fx не задеты).
    // ctx.breathedPrev — на боевом ctx (сброс на каждый startCombat).
    const breathed = !!c.efirBreathed;
    if (breathed && !ctx.breathedPrev) {
      const fxB = c._fx || (c._fx = {});
      fxB.breath = { at: now, until: now + BREATH_FX_MS };
    }
    ctx.breathedPrev = breathed;

    // Масштаб отображения (задача 000151): АБСОЛЮТНЫЙ трансформ — в
    // НАЧАЛЕ render, ТОЛЬКО при sx≠1||sy≠1 (условие ОБЯЗАТЕЛЬНО: при
    // 1:1 вызова НЕТ — пины индексов drawCalls бит-в-бит, якорь A1).
    // Идемпотентен и самовосстанавливается после сброса контекста
    // при resize (присвоение canvas.width). Всё далее — в логических
    // единицах (клетки × CELL): W/H — логическое поле (canvas.
    // width/height — это БЕКИНГ = поле × масштаб, не поле — D8).
    if (sx !== 1 || sy !== 1) g2.setTransform(sx, 0, 0, sy, 0, 0);
    const W = c.width * CELL, H = c.height * CELL;
    g2.fillStyle = '#0d1117';
    g2.fillRect(0, 0, W, H);
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
    if (bgImg) g2.drawImage(bgImg, 0, 0, W, H);
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
      g2.lineTo(x * CELL + 0.5, H);
      g2.stroke();
    }
    for (let y = 0; y <= c.height; y++) {
      g2.beginPath();
      g2.moveTo(0, y * CELL + 0.5);
      g2.lineTo(W, y * CELL + 0.5);
      g2.stroke();
    }

    // Штриховка зоны досягаемости выбранного моба (задача 000175):
    // слой строго МЕЖДУ сеткой и препятствиями (z-порядок: фон → сетка
    // → ШТРИХОВКА → препятствия → юниты → эффекты). Пин 000050
    // «iObs > последний 'stroke' всего render'а» держится без правок:
    // штриховка — stroke и рисуется ДО препятствий.
    drawMobReachHatch(c);

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

    // FX «Вдох Эфира» (000118): слой эффектов ПОСЛЕ drawUnits
    // (z-порядок: фон → сетка → препятствия → юниты → эффекты;
    // 000062-паттерн — будущие боевые эффекты вызываются здесь).
    // Без c._fx.breath / после until — ранний возврат (ничего).
    drawBreathFx(c, now);
    drawCastFx(c, now);
    syncAttackFx(c, now);

    // Панель состояния.
    const t = c.units.find((u) => u.id === c.targetId && u.alive && !u.fled);
    // «Воскрешение» (задача 000166): выбранная МЁРТВАЯ цель — строка
    // «— мёртв» (без неё у видимого кольца/подложки было бы «Цели нет»).
    // Приоритет: живой t (существующий, без правок) → td (мёртвый
    // союзник = c.targetId) → tHero (мёртвый игрок + targetId === null
    // — автоцель «вы») → «Цели нет».
    const td = t ? null : c.units.find((u) => u.id === c.targetId
      && u.side === 'ally' && !u.alive && !u.fled);
    // tHero — внутри гейта canResurrectPick (000193.02: игрок ИЛИ
    // активный союзник-носитель; инвариант D2: без гейта — бит-в-бит):
    // без «Воскрешения» — ни кольца на герое, ни строки «цель» для
    // заклинания, которого нет в книге.
    const tHero = (!t && !td && canResurrectPick(c) && c.player
      && !c.player.alive && c.targetId === null) ? c.player : null;
    // 000199: stateEl — ровно ДВЕ фиксированные строки (обе
    // БЕУСЛОВНЫ — «Цели нет» — fallback, поэтому white-space:
    // pre-line даёт фикс. высоту и кнопки НЕ прыгают):
    //   строка 1 — с кем бьёмся + номер раунда;
    //   строка 2 — выбранная цель (побайтово как до 000199: живой t
    //     / td «— мёртв» / tHero «(вы) — мёртв» / «Цели нет»).
    // Убрано (ТЗ 000199, D1/D2): «Ход: …» (чей ход — рамка 000197,
    // подсветка .turn-token--current остаётся), «HP x/y | MP x/y»
    // (значения — на полосках, следуют за активным), «Шаги|Удар|
    // Огонь|Леч» (счётчики — бейджи кнопок), строка активного
    // союзника и «Отряд: …» (состав не дублируется), префиксы
    // «БЛОК»/«ЯД» (статус — title кнопки «Блок»/журнал).
    stateEl.textContent =
      `${c.groupName}, раунд ${c.round}\n` +
      (t ? `Цель: ${t.name} (ур. ${t.level}, HP ${t.hp}/${t.maxHP})`
        : td ? `Цель: ${td.name} (ур. ${td.level}) — мёртв`
        : tHero ? `Цель: ${tHero.name} (вы) — мёртв` : 'Цели нет');

    // Строка очерёдности хода (задача 000036).
    renderTurnOrder(c);

    // DOM-полосы HP/MP (000038 / 000199): единственный путь
    // обновления — render() (как строка очереди и stateEl), отдельных
    // слушателей/timers нет; rAF-цикл (000047) обновит их тем же
    // render() — без дублей логики.
    // 000199 (D3): полосы следуют за АКТИВНЫМ персонажем:
    // barUnit = activeUnit(c) || c.player (рамка 000197 — своя
    // формула токенов 000036 + alive/fled-гарды, не общий источник —
    // эквивалентны, пока advanceQueue пропускает мёртвых/сбежавших;
    // игрок и фаза мобов — герой: полоса исторически наша сторона).
    // На герое — те же p/d/hpFrac/hpColor (общие с
    // canvas-миниполосой — она ОСТАЁТСЯ геройской, drawUnits бит-в-
    // бит); на союзнике — свои hp/maxHP (Эфир и наёмник) и мана:
    // Эфир — u.mp / u.maxMP (снапшот stats.maxMP в buildEfirUnit,
    // 000199-ревью; fallback — legacy efirStats для юнитов без поля),
    // наёмник — u.mp / u.maxMP (снапшот makeAlly 000193/000193.01;
    // без поля maxMP — деградация fill 0%, «MP —», D5 000199 →
    // Superseded).
    // Гвард G.efir: юнит Эфира существует только если efir.js
    // загружен. Цвет MP — фиксированный #8cf2fc (CSS; пороговой
    // функции для маны нет — 000038).
    const barUnit = activeUnit(c) || p;
    let barHP, barMaxHP, barFrac, barColor;
    if (barUnit === p) {
      barHP = p.hp; barMaxHP = d.maxHP;
      barFrac = hpFrac; barColor = hpColor;
    } else {
      barHP = barUnit.hp; barMaxHP = barUnit.maxHP;
      barFrac = barMaxHP > 0 ? barHP / barMaxHP : 0;
      barColor = (G.hpBarColor ? G.hpBarColor(barFrac) : '#6fdc6f');
    }
    let mpVal, mpMax;
    if (barUnit === p) {
      mpVal = p.mp; mpMax = d.maxMP;
    } else if (barUnit.kind === 'efir') {
      // 000199 (ревью): знаменатель — СНАПШОТ с юнита (buildEfirUnit:
      // u.maxMP = stats.maxMP — Sheet-истина 5+Int+Wis, растёт
      // ОЧКАМИ 000144), НЕ замороженная legacy-таблица
      // efirStats(level) — та расходится с фактом после level-up/
      // роста primary (L3 без очков: полные 11 маны, а таблица
      // скажет «/13»). Fallback — legacy (юнит без поля, деградация
      // buildEfirUnit / юнит, собранный до апгрейда).
      const snap = (typeof barUnit.maxMP === 'number'
        && Number.isFinite(barUnit.maxMP)) ? barUnit.maxMP : null;
      const est = (G.efir && typeof G.efir.efirStats === 'function')
        ? G.efir.efirStats(barUnit.level) : null;
      mpVal = barUnit.mp; mpMax = (snap != null) ? snap
        : (est ? est.maxMP : 0);
    } else if (barUnit.kind === 'merc') {
      // 000193.01: мана наёмника — С ЮНИТА (снапшоты makeAlly
      // 000193/000193.01: u.mp/u.maxMP = 5+Int+Wis; тратят касты из
      // книги, регена в бою нет). Юнит БЕЗ поля maxMP (node-фикстура
      // до апгрейда / white-box delete) — деградация D5 000199
      // СОХРАНЕНА: mpMax 0 → «MP —», fill 0%; гарды зеркалят ветку
      // Эфира (typeof/Number.isFinite) — NaN-краха нет.
      mpVal = (typeof barUnit.mp === 'number'
        && Number.isFinite(barUnit.mp)) ? barUnit.mp : 0;
      mpMax = (typeof barUnit.maxMP === 'number'
        && Number.isFinite(barUnit.maxMP)) ? barUnit.maxMP : 0;
    } else {
      mpVal = 0; mpMax = 0; // неизвестный kind союзника — маны нет
      // (деградация D5 000199)
    }
    const mpFrac = mpMax > 0
      ? Math.min(1, Math.max(0, mpVal / mpMax)) : 0;
    if (hpbarFillEl) {
      hpbarFillEl.style.width =
        (Math.min(1, Math.max(0, barFrac)) * 100).toFixed(1) + '%';
      hpbarFillEl.style.background = barColor;
      hpbarTextEl.textContent = `HP ${barHP}/${barMaxHP}`;
    }
    if (mpbarFillEl) {
      mpbarFillEl.style.width = (mpFrac * 100).toFixed(1) + '%';
      mpbarTextEl.textContent = (mpMax > 0)
        ? `MP ${mpVal}/${mpMax}` : 'MP —';
    }

    // Журнал: последние строки.
    logEl.textContent = c.log.slice(-9).join('\n');

    // Кнопки: неактивны вне очереди игрока или когда действие невозможно
    // (canDoAction, задача 000037); причина — в title (tooltip).
    // Кнопка «Книга заклинаний» (act=spellbook) — в том же цикле:
    // disabled/title из ветки canDoAction 'spellbook' (000149).
    // Кнопка «Воскрешение» (act=resurrect, 000171) — спец-кейс:
    // resurrectChk (canDoAction ядро 'resurrect' не знает — «неизвестное
    // действие» — вечный disabled с неверным title); строки
    // disabled/title ниже — без изменений (для resurrect гаснут через
    // resurrectChk, прочие кнопки — бит-в-байт).
    // Кнопки «Каст»/«Лечение» (act=cast/heal, 000178) — спец-кейс
    // ТОЛЬКО ВИДИМОСТИ: display ''/'none' по активному юниту на
    // ПЕРСИСТЕНТНОМ элементе (создан один раз в build(); пересоздание
    // в render убивает клик — урок 000149). Гашение — стандартный
    // canDoAction выше (ветки 000168 — 1:1 с клавишами K/H); строки
    // disabled/title для них — без изменений.
    if (overlay) {
      // 000199/000199.01: значения счётчиков — ОДИН раз на render
      // (actionCounts — чистое чтение c; бейджей только на
      // attack/spellbook/endTurn — countEls, остальные кнопки —
      // undefined).
      const actCnt = actionCounts(c);
      overlay.querySelectorAll('.combat-actions button').forEach((b) => {
        const act = b.dataset.act;
        // 000227: «Последнее заклинание»/«Каст»/«Лечение» — спец-кейс
        // гашения lastSpellChk (ядро «lastSpell» не знает; cast/heal
        // с выбором — rowChk, зеркало книжной строки; без выбора —
        // canDoAction бит-в-байт).
        const r = act === 'resurrect'
          ? resurrectChk(c)
          : (act === 'lastSpell' || act === 'cast' || act === 'heal')
            ? lastSpellChk(c, act)
            : G.canDoAction(c, act, { targetId: c.targetId });
        // 000194 (правка по ревью): «Быстрый предмет» — тот же гейт,
        // что и KeyE (quickOpenable): stale-слот не гасит кнопку
        // (клик открывает список, причина — на строке); блок —
        // quickOpenable false, кнопка disabled (причина в журнал).
        const ok = act === 'quickItem'
          ? (r.ok || quickOpenable(c))
          : r.ok;
        b.disabled = c.phase !== 'player' || !!c.result || !ok;
        b.title = ok ? '' : r.reason;
        if (act === 'cast' || act === 'heal') {
          b.style.display = castHealVis(c, act) ? '' : 'none';
        } else if (act === 'lastSpell') {
          b.style.display = lastSpellVis(c) ? '' : 'none';
        }
        // Счётчик действий (000199/000199.01): персистентный span
        // (build, урок 000149) — render обновляет ТОЛЬКО
        // textContent/display. «Удар» — ВСЕГДА видим (включая 0,
        // D3); «Книга заклинаний» — «int/wis» на ходу игрока и в
        // фазе мобов, на ходу союзника скрыта (книга ему
        // структурно недоступна — allyCanDo; «0» отклонено —
        // смешивает «нет пула» и «недоступно»); «Конец хода» —
        // остаток шагов активного (ратификация D4 000199,
        // 000199.01), ВСЕГДА видим, включая 0 (исчерпанность пула —
        // видно; ветка ДО spellbook-fallback — иначе «int/wis»).
        // 000227: «Каст»/«Лечение»/«Последнее заклинание» — остаток
        // ПУЛА заклинания, которое кнопка применит СЕЙЧАС (actCnt.
        // spellBtn — единый расчёт на render): «0» видно (паритет
        // «Удара», D3/D4 000199); «нет пула» / скрытая кнопка —
        // 'none' + '' (000199: «нет пула» ≠ «0»).
        const cnt = countEls[act];
        if (cnt) {
          if (act === 'attack') {
            cnt.style.display = '';
            cnt.textContent = String(actCnt.attack);
          } else if (act === 'endTurn') {
            cnt.style.display = '';
            cnt.textContent = String(actCnt.steps);
          } else if (act === 'lastSpell' || act === 'cast'
              || act === 'heal') {
            if (b.style.display === 'none' || actCnt.spellBtn == null) {
              cnt.style.display = 'none';
              cnt.textContent = '';
            } else {
              cnt.style.display = '';
              cnt.textContent = String(actCnt.spellBtn);
            }
          } else if (actCnt.spell == null) {
            cnt.style.display = 'none';
            cnt.textContent = '';
          } else {
            cnt.style.display = '';
            cnt.textContent = actCnt.spell;
          }
        }
      });
    }

    // «Книга заклинаний» (задача 000149): display из bookOpen; при
    // открытии — строки 1:1 с книгой (перестроение — только при
    // изменении сигнатуры, renderBook — единый путь обновления).
    renderBook(c);
    if (fleeBox) fleeBox.style.display = (fleeOpen && !c.result) ? '' : 'none';

    // «Быстрый предмет» — список (задача 000194): display из
    // quickOpen; строки — слоты активного персонажа (перестроение —
    // только при изменении сигнатуры, renderQuickList).
    renderQuickList(c);

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
      // 000195 (ревью): поднятая панель (z-25 > z-20) накрывает
      // баннер результата; Esc в этой фазе панель НЕ закрывает
      // (ui.js-гард cc.result) — закрываем, чтобы результат был
      // виден. Идемпотентно (render — каждый кадр); нет ui.js — no-op.
      if (G.playerUI && typeof G.playerUI.isOpen === 'function'
          && G.playerUI.isOpen()) {
        G.playerUI.toggle(false);
      }
    }
    renderVictoryLoot(c);
  }

  // --- Лут победы (задача 000237) ---

  function renderVictoryLoot(c) {
    if (lootEl) return;
    if (!boxEl || !c.result || c.result.outcome !== 'victory') return;
    const items = Array.isArray(c.result.items) ? c.result.items : [];
    const div = document.createElement('div');
    div.className = 'combat-victory-loot';
    for (const e of items) {
      const it = (e && G.getItem) ? G.getItem(e.id) : null;
      const row = document.createElement('div');
      row.className = 'cp-itemrow';
      if (it && typeof it.icon === 'string' && it.icon !== '') {
        const img = document.createElement('img');
        img.className = 'cp-itemicon';
        img.src = it.icon;
        img.alt = '';
        row.appendChild(img);
      }
      const nm = document.createElement('span');
      nm.className = 'cp-itemname';
      nm.textContent = (it ? it.name : (e ? String(e.id) : ''))
        + (e && e.qty > 1 ? ' ×' + e.qty : '');
      row.appendChild(nm);
      div.appendChild(row);
    }
    if (!items.length) div.style.display = 'none';
    lootEl = div;
    boxEl.appendChild(div);
  }

  // --- «Книга заклинаний» (задача 000149) ---

  // Активный персонаж книги — ЕДИНАЯ точка «активной единицы» очереди
  // ходов: 000167 — очередь, 000193 — реализация: на ходу СОЮЗНИКА
  // (наёмник/Эфир, c.phase === 'player' — 000168 D9) книга показывает
  // ЕГО книгу (unitOf → activeUnit), на ходу игрока — c.player.
  function unitOf(c) {
    return activeUnit(c) || c.player;
  }

  // «Воскрешение» (задача 000166): ГЕЙТ всей новой функциональности —
  // маркеры/клик-выбор мёртвой цели работают ТОЛЬКО когда носитель
  // знает 'resurrect' (каталожный id 000017 — стабилен). Чистое чтение
  // unitOf(c).spells — НЕТ Game-чтений (G.Spells не требуется — работает
  // в песочницах без withSpells), мутаций, console, c._rng. Через
  // unitOf(c) (НЕ c.player хардкод) — после 000168 гейт автоматически
  // про активного юнита. Без гейта: (а) маркеры не рисуются, (б) клик
  // по мёртвому союзнику/герою — no-op (цель не меняется, лог не
  // растёт) → все существующие сцены бит-в-байт.
  function canResurrect(c) {
    // 000193 (Д-H): закреплён на c.player (НЕ unitOf — 000193 меняет
    // unitOf на активного юнита): бит-в-байт 000166/000171 во всех
    // фазах; resurrectChk своей activeUnitId-веткой уже гасит кнопку
    // на ходу союзника (книга союзника в воскрешение не вливается).
    const u = c.player;
    return !!(u && Array.isArray(u.spells)
      && u.spells.indexOf('resurrect') >= 0);
  }

  function canResurrectPick(c) {
    if (canResurrect(c)) return true;
    const a = activeUnit(c);
    return !!(a && a.alive && !a.fled && Array.isArray(a.spells)
      && a.spells.indexOf('resurrect') >= 0);
  }

  // 000168 (D10): активный СОЮЗНИК (наёмник/Эфир — ход игрока) по
  // очереди (G.activeUnitId — экспорт 000167; typeof-guard — фолбэк
  // до 000167: «Вы»). Игрок/моб — null.
  function activeUnit(c) {
    const id = (typeof G.activeUnitId === 'function')
      ? G.activeUnitId(c) : null;
    if (!id || id === 'player') return null;
    return c.units.find((x) => x.id === id && x.side === 'ally') || null;
  }
  // 000195: live-sync быстрых слотов СОЮЗНИКОВ — с live-карты
  // (opts.allyQuickLive = тот же объект, что G.playerUI.setAllyQuick)
  // в u.quick: «быстр.» панели действует В ТЕКУЩЕМ бою (у ядра —
  // снапшот createCombat). Ядро combat.js c._allyQuickLive не читает;
  // 000223: ядро ЧИСТИТ live-слот при расходе (clearAllyQuickUnit —
  // иначе live→u.quick sync возродил бы потраченную единицу); c._rng
  // не вызывается. Валидация — зеркало makeAlly (нестрока → null-слот);
  // id не в карте — skip.
  function syncAllyQuickLive(c) {
    const live = c._allyQuickLive;
    if (!live || typeof live !== 'object') return;
    const units = c.units;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      if (!u || u.side !== 'ally' || !u.id) continue;
      const q = live[u.id];
      if (!Array.isArray(q)) continue;
      u.quick = [0, 1, 2].map((j) => (typeof q[j] === 'string') ? q[j] : null);
    }
  }
  function activeIsEfir(c) {
    const u = activeUnit(c);
    return !!(u && u.kind === 'efir');
  }

  // 000199/000199.01: счётчики действий для бейджей кнопок — ОДИН
  // чистый расчёт на render (чтения: c.ps/c.efs + activeUnit;
  // мутаций, c._rng, Game-чтений сверх G.activeUnitId в activeUnit
  // — нет):
  //  * «Удар» (attack) — ВСЕГДА видим (включая 0, D3): игрок и фаза
  //    мобов — c.ps.attack; наёмник — u.attackLeft; Эфир — c.efs.
  //    touch (null-guard → 0, ветка 000180 fallback);
  //  * «Книга заклинаний» (spellbook) — «int/wis» (c.ps.spellInt /
  //    c.ps.spellWis — два пула отдельно, порядок как в убранной
  //    строке «Огонь|Леч»; сумма отклонена — смешивает пулы) ТОЛЬКО
  //    на ходу игрока и в фазе мобов; на ходу СОЮЗНИКА — null
  //    (книга структурно недоступна — allyCanDo 'spellbook'; бейдж
  //    «0» отклонён: смешивает «нет пула» с «недоступно»);
  //  * «Конец хода» (endTurn) — остаток шагов активного (ратификация
  //    D4 000199, 000199.01; поле `steps` — по концепции метки
  //    «Шаги» убранной строки): игрок и фаза мобов — c.ps.moveLeft
  //    (D3-фолбэк, паритет attack); наёмник — u.moveLeft; Эфир —
  //    c.efs.move (null-guard → 0, паритет touch);
  //  * 000227 «Каст»/«Лечение»/«Последнее заклинание» (spellBtn) —
  //    остаток ПУЛА заклинания, которое кнопка применит СЕЙЧАС
  //    (spellBtnOf: выбор из книги || legacy strongestKnown;
  //    «нет пула» → null — бейдж скрыт).
  function actionCounts(c) {
    const au = activeUnit(c);
    if (au) {
      if (au.kind === 'efir') {
        return { attack: c.efs ? c.efs.touch : 0, spell: null,
                 steps: c.efs ? c.efs.move : 0,
                 spellBtn: spellBtnOf(c) };
      }
      return { attack: au.attackLeft, spell: null, steps: au.moveLeft,
               spellBtn: spellBtnOf(c) };
    }
    return { attack: c.ps.attack,
             spell: c.ps.spellInt + '/' + c.ps.spellWis,
             steps: c.ps.moveLeft, spellBtn: spellBtnOf(c) };
  }

  // Открыть/закрыть книгу. Строки строит renderBook в render() —
  // тот же путь обновления, что остальной DOM боя (нет отдельных
  // слушателей/таймеров).
  function toggleBook() {
    bookOpen = !bookOpen;
  }

  // Строки книги — Game.SpellBook.entriesFor (src/spellbook.js):
  // 1:1 с книгой активного персонажа + данные каталога (имя/описание/
  // мана/атрибут/иконка). Деградация при битом порядке загрузки
  // (UMD-ловушка 000038): G.SpellBook нет (spellbook.js ПЕРЕД
  // combat-ui.js — пин index-order) → ОДИН console.error + строки с
  // голым id из листа (книга не падает, как ui-tab-skills.js);
  // G.SpellsData нет → entriesFor сам даёт [] (каталог = данные строк).
  function bookRows(c) {
    const unit = unitOf(c);
    const catalog = G.SpellsData ? G.SpellsData.SPELLS_BY_ID : null;
    if (G.SpellBook) {
      return G.SpellBook.entriesFor(unit, catalog);
    }
    if (!spellBookWarned) {
      spellBookWarned = true;
      console.error('combat-ui.js: не найдена Game.SpellBook — ' +
        'загрузите src/spellbook.js ДО src/combat-ui.js (задача 000149);' +
        ' строки книги — без данных каталога');
    }
    const spells = (unit && Array.isArray(unit.spells)) ? unit.spells : [];
    return spells.map((id) => ({
      id: id, name: String(id), desc: '',
      mana: 0, poolKey: null, poolName: null, icon: null,
    }));
  }

  // ГЕЙТ СТРОК книги: порядок проверок ФИКСИРОВАН (result → phase).
  // 000179-ветка (activeUnitId !== 'player' → «недоступно активному
  // персонажу») СНЯТА 000193: книга — АКТИВНОГО персонажа (unitOf →
  // activeUnit); на ходу СОЮЗНИКА строки и каст — через G.AllySpells
  // (rowChk/castRow, ветка u !== c.player). 'не ваш ход' остаётся:
  // на ходу МОБА книга по-прежнему закрыта/затемнена. Возврат
  // { ok:false, reason } | null (null — проход к rowChk/касту).
  function spellbookUnitGate(c) {
    if (c.result) return { ok: false, reason: 'бой закончен' };
    if (c.phase !== 'player') return { ok: false, reason: 'не ваш ход' };
    return null;
  }

  // canCast (чистый предпросмотр строки, без побочных эффектов —
  // зеркало каста, 000037) — ПОСЛЕ гейта spellbookUnitGate. 000193:
  // книга — АКТИВНОГО персонажа (unitOf): урон-путь зависит от того,
  // ЧЬЯ книга на экране:
  //  * u === c.player — G.Spells.canCastSpell (движок 000045) —
  //    бит-в-байт (пин SB14: 'Заклинания недоступны' при битом
  //    порядке);
  //  * u — союзник (наёмник/Эфир) — G.AllySpells.canCastAllySpell
  //    (src/ally-spells.js, 000193): те же механики, что у игрока
  //    (пул/мана активного персонажа, 1 reason — 1 поведение).
  //    G.AllySpells нет (битый порядок загрузки) — ОДИН
  //    console.error (флаг allySpellsWarned, паттерн spellBookWarned)
  //    + отказ «недоступно активному персонажу» (строка 000179 —
  //    деградация, не крах). Вызывается renderBook: ОДИН раз на
  //    строку на рендер (и для сигнатуры, и для строки — пары не
  //    дублируются).
  function rowChk(c, row) {
    const g = spellbookUnitGate(c);
    if (g) return g;
    const u = unitOf(c);
    if (u !== c.player) {
      if (G.AllySpells && typeof G.AllySpells.canCastAllySpell === 'function') {
        return G.AllySpells.canCastAllySpell(c, u, row.id, c.targetId);
      }
      if (!allySpellsWarned) {
        allySpellsWarned = true;
        console.error('000193: Game.AllySpells не загружен — строки книги '
          + 'союзника недоступны (загрузите src/ally-spells.js ДО '
          + 'src/combat-ui.js)');
      }
      return { ok: false, reason: 'недоступно активному персонажу' };
    }
    return (G.Spells && typeof G.Spells.canCastSpell === 'function')
      ? G.Spells.canCastSpell(c, row.id, { targetId: c.targetId })
      : { ok: false, reason: 'Заклинания недоступны' };
  }

  // Строка книги: div (НЕ <button> — R9: DOM-счётчики кнопок в
  // тестах; div и без :disabled). Доступность — chk (аргумент,
  // rowChk): отказ — класс .combat-spellrow-off + reason в title
  // (tooltip); клик по строке — castRow (клик по off-строке тоже даёт
  // reason в журнал — не тишина).
  function buildSpellRow(c, row, chk) {
    const el = document.createElement('div');
    el.className = 'combat-spellrow';
    el.dataset.spell = row.id;
    if (!chk || !chk.ok) {
      el.className += ' combat-spellrow-off';
      el.title = (chk && chk.reason) || 'Заклинание недоступно';
    }
    if (row.icon) {
      const img = document.createElement('img');
      img.className = 'combat-spellicon';
      img.src = row.icon;
      img.alt = row.name;
      el.appendChild(img);
    }
    const body = document.createElement('div');
    body.className = 'combat-spellrow-body';
    const top = document.createElement('div');
    top.className = 'combat-spellrow-top';
    const name = document.createElement('span');
    name.className = 'combat-spellname';
    name.textContent = row.name;
    const meta = document.createElement('span');
    meta.className = 'combat-spellmeta';
    meta.textContent = 'Мана ' + row.mana + ' · Заклинание ('
      + (row.poolName || '—') + ')';
    top.appendChild(name);
    top.appendChild(meta);
    const desc = document.createElement('div');
    desc.className = 'combat-spellrow-desc';
    desc.textContent = row.desc;
    body.appendChild(top);
    body.appendChild(desc);
    el.appendChild(body);
    el.addEventListener('click', () => castRow(c, row.id));
    return el;
  }

  // Клик по строке (задача 000149): каст ЧЕРЕЗ КНИГУ АКТИВНОГО
  // персонажа (000193): u === c.player — G.Spells.castSpell (движок
  // 000045, зеркало предпросмотра canCastSpell); u — союзник —
  // G.AllySpells.castAllySpell (src/ally-spells.js: те же механики,
  // расход — пул/мана союзника). Успех — ОБА пути: 'cast'-FX 300 мс
  // (паттерн 000047, то же поле c._fx, что у атаки) + книга
  // закрывается (действие сделано). Отказ — причину в журнал
  // (logRejection), книга остаётся ОТКРЫТОЙ (видна причина, можно
  // поправить: цель/ману/очередь). Предпроверка — гейт
  // spellbookUnitGate (000193: только result/phase). G.AllySpells
  // нет (битый порядок) — деградация: ОДИН console.error
  // (allySpellsWarned) + отказ «недоступно активному персонажу»
  // (ровно одна строка в лог, КАСТА НЕТ, трат НЕТ, c._fx не
  // пишется — зеркало 000179-поведения).
  function castRow(c, spellId) {
    if (fleeOpen) return;
    const g = spellbookUnitGate(c);
    if (g) {
      logRejection(c, g);
      render();
      return;
    }
    const u = unitOf(c);
    let r;
    if (u !== c.player) {
      if (G.AllySpells && typeof G.AllySpells.castAllySpell === 'function') {
        r = G.AllySpells.castAllySpell(c, u, spellId, c.targetId);
      } else {
        if (!allySpellsWarned) {
          allySpellsWarned = true;
          console.error('000193: Game.AllySpells не загружен — строки книги '
            + 'союзника недоступны (загрузите src/ally-spells.js ДО '
            + 'src/combat-ui.js)');
        }
        r = { ok: false, reason: 'недоступно активному персонажу' };
      }
    } else {
      r = (G.Spells && typeof G.Spells.castSpell === 'function')
        ? G.Spells.castSpell(c, spellId, c.targetId)
        : { ok: false, reason: 'Заклинания недоступны' };
    }
    if (r && r.ok) {
      const n = nowMs();
      c._fx = {
        action: 'cast', until: n + FX_MS,
        castFx: castFxOf(c, u, r.spell, toIdOf(c, r.spell, c.targetId), n),
      };
      bookOpen = false;
      recordLastSpell(c, u, spellId);
    } else {
      logRejection(c, r);
    }
    render();
  }

  // 000249 (S1): запись «последнего заклинания» — ТОЛЬКО на
  // успешном касте (ветка r.ok castRow, ПОСЛЕ блока FX 000248 —
  // строки FX бит-в-байт): неудачный каст/отказ/гейт — не
  // записывает и не сбрасывает (кнопка держит предыдущий выбор).
  // Герой — 'player' в модульной карте + 'flogiston' в live-карте
  // main.js; союзник — u.id в обеих (Эфир 'efir', наёмник — npcId).
  // ctx.lastSpells — live-объект main.js (единый объект: mid-combat
  // синк не нужен); null (vm-песочница без opts.lastSpells) — только
  // модульная карта (выбор пер-бой). UI-bookkeeping: combat.js не
  // читает (детерминизм, D9).
  function recordLastSpell(c, u, spellId) {
    lastSpells[u === c.player ? 'player' : u.id] = spellId;
    if (ctx && ctx.lastSpells) {
      ctx.lastSpells[u === c.player ? 'flogiston' : u.id] = spellId;
    }
  }

  // --- «Воскрешение» — кнопка панели (задача 000171) ---
  //
  // Контракт — memory/000171-combat-resurrect-button.md: кнопка —
  // единственный путь «один тап = воскрешение» (мобильный сценарий
  // без книги/тапа по клетке). Вставка ПОСЛЕ castRow (не после
  // canResurrect — там hunk 000168: rebase-конфликт).
  // resurrectChk — поряДОК ПРОВЕРОК ФИКСИРОВАН (result → phase →
  // activeUnitId → canCastSpell): перестановка 3/4 даст «недоступно
  // активному персонажу» на ходу моба (неверный tooltip).
  function resurrectChk(c) {
    if (c.result) return { ok: false, reason: 'бой закончен' };
    if (c.phase !== 'player') return { ok: false, reason: 'не ваш ход' };
    // Гейт 3 (с 000168 на ходу СОЮЗНИКА c.phase === 'player'):
    // каст 'resurrect' тратит ману/пул ИГРОКА (000163) — на ходу
    // наёмника/Эфира кнопка гаснет (та же строка, что allyCanDo
    // 000168). До 000168 — мёртвая ветка (activeUnitId === 'player'
    // всегда на ходу игрока) → ноль изменения поведения. typeof-guard
    // (экс-порт 000167, ДО combat-ui.js — пин index-order): фолбэк
    // 'player' — поведение до 000167 (гейт не срабатывает).
    const id = (typeof G.activeUnitId === 'function')
      ? G.activeUnitId(c) : 'player';
    if (id !== 'player') {
      return { ok: false, reason: 'недоступно активному персонажу' };
    }
    // canCastSpell — ТО ЖЕ resurrectTargetId (не сырой c.targetId:
    // начальная авто-цель хода — живой моб; иначе кнопка была бы
    // disabled «нет цели» до тапа по клетке, хотя цель есть).
    // G.Spells нет — строка-фолбэк rowChk (000149).
    return (G.Spells && typeof G.Spells.canCastSpell === 'function')
      ? G.Spells.canCastSpell(c, 'resurrect',
          { targetId: resurrectTargetId(c) })
      : { ok: false, reason: 'Заклинания недоступны' };
  }

  // Эффективная цель (000171): явный выбор 000166 (клик по клетке
  // мёртвого СОЮЗНИКА) уважается; любая другая цель (живой моб —
  // начальная авто-цель, чужой id) → null → автоцель ядра 000163
  // R-1/R-2 (мёртвый ИГРОК приоритетно, иначе первый мёртвый союзник
  // в порядке c.units; дальности нет).
  function resurrectTargetId(c) {
    const t = c.targetId;
    if (!t) return null;
    const u = c.units.find((x) => x.id === t);
    return u && u.side === 'ally' && !u.alive && !u.fled ? t : null;
  }

  // Тап кнопки (000171): ЗЕРКАЛО castRow, НО (а) цель —
  // resurrectTargetId (не сырой c.targetId — «нет цели» на одном
  // тапе), (б) предпроверка ПЕРВОЙ строкой (стаб-клик/смена состояния
  // между рендером и кликом → причина в журнал, КАСТА НЕТ, трат НЕТ —
  // зеркало 'spellbook'-thunk runAction). Ход НЕ сгорает (каст ≠
  // endTurn — паттерн книги 000149/000166). bookOpen=false — только
  // при успехе (зеркало castRow; при отказе игрок видит причину).
  // 0 новых c._rng (воскрешение без RNG, 000163), 0 новых полей c
  // (c._fx/c.targetId — runtime-only; формат сейва не тронут).
  function resurrectCast(c) {
    if (fleeOpen) return;
    const chk = resurrectChk(c);
    if (!chk.ok) {
      logRejection(c, chk);
      render();
      return;
    }
    const tid = resurrectTargetId(c);
    const r = (G.Spells && typeof G.Spells.castSpell === 'function')
      ? G.Spells.castSpell(c, 'resurrect', tid)
      : { ok: false, reason: 'Заклинания недоступны' };
    if (r && r.ok) {
      const n = nowMs();
      c._fx = {
        action: 'cast', until: n + FX_MS,
        castFx: castFxOf(c, c.player, r.spell, tid || autoResurrectId(c), n),
      };
      bookOpen = false;
    } else {
      logRejection(c, r);
    }
    render();
  }

  // --- «Каст»/«Лечение»/«Последнее заклинание» — кнопки панели
  //     (задачи 000178/000227) ---
  //
  // Контракт — memory/000178-combat-cast-heal-buttons.md +
  // memory/000227-combat-last-spell-button.md. 000227: ЕДИНЫЙ
  // обработчик lastSpellPress на три кнопки + клавиши K/H (кнопка =
  // клавиша = книжная строка): с выбором из книги — castRow (та же
  // воронка, что тап по строке); без выбора — legacy (c.cast/c.heal
  // через runAction — strongestKnown/mostWounded, бит-в-бит). Гашение
  // — lastSpellChk (спец-кейс render-цикла, ДО canDoAction):
  // 'cast'/'heal' с выбором — rowChk (книга активного), без выбора —
  // canDoAction (legacy, бит-в-бит); 'lastSpell' — свой порядок
  // причин. allyBtn УДАЛЁН (вызывающих нет); thunk'и runAction
  // 'cast'/'heal' сохранены (legacy-путь). Предпроверка ПЕРВОЙ
  // строкой (паттерн 000178/resurrectCast): стаб-клик / смена
  // состояния между рендером и кликом → ровно ОДНА строка причины в
  // журнал, ДЕЙСТВИЯ НЕТ, трат НЕТ (ядро ПЕРЕПРОВЕРЯЕТ — двойная
  // защита). Ход НЕ сгорает (действие ≠ endTurn). 0 новых c._fx:
  // строку лога строит ЯДРО — свою строку/FX НЕ вводить. Вставка
  // ПОСЛЕ resurrectCast (НЕ после canResurrect — там hunk 000168
  // activeUnit/activeIsEfir: rebase-конфликт, урок 000171 §8.2).
  // activeUnit — существующий typeof-guard (фолбэк null → скрыта —
  // безопасная деградация).
  function lastSpellPress(c, act) {
    if (fleeOpen) return;
    const chk = lastSpellChk(c, act);
    if (!chk.ok) {
      logRejection(c, chk);
      render();
      return;
    }
    if (act === 'lastSpell') {
      castRow(c, lastSpells.player);
      return;
    }
    const u = unitOf(c);
    const sel = (u && u !== c.player) ? lastSpells[u.id] : null;
    if (sel) {
      castRow(c, sel);
      return;
    }
    runAction(c, act);
    render();
  }
  function lastSpellChk(c, act) {
    if (act === 'lastSpell') {
      if (c.result) return { ok: false, reason: 'бой закончен' };
      if (c.phase !== 'player') return { ok: false, reason: 'не ваш ход' };
      const u = unitOf(c);
      if (u !== c.player) {
        return { ok: false, reason: 'недоступно активному персонажу' };
      }
      const sel = lastSpells.player;
      if (!sel) return { ok: false, reason: 'нет выбранного заклинания' };
      if (G.Spells && typeof G.Spells.canCastSpell === 'function') {
        return G.Spells.canCastSpell(c, sel, { targetId: c.targetId });
      }
      return { ok: false, reason: 'Заклинания недоступны' };
    }
    const u = unitOf(c);
    const sel = (u && u !== c.player) ? lastSpells[u.id] : null;
    if (sel) return rowChk(c, { id: sel });
    return G.canDoAction(c, act, { targetId: c.targetId });
  }
  // Видимость «Последнее заклинание» (000227 D9): '' ТОЛЬКО когда
  // фаза игрока, бой не кончен, активен ИГРОК (unitOf — фолбэк
  // c.player на ходу МОБА — проверка c.phase ОБЯЗАТЕЛЬНА), выбор
  // есть и «Воскрешение» не включено (yield D8: 9-я видимая клетка
  // row 3 col 1 ПОД D-падом).
  function lastSpellVis(c) {
    return c.phase === 'player' && !c.result
      && unitOf(c) === c.player
      && !!lastSpells.player
      && !resurrectChk(c).ok;
  }
  // 000227 (D6): гейт «Лечение» ОБЩЁН — ЛЮБОЙ наёмник с непустой
  // книгой (было: support-наёмник — условие ядра allyCanDo 'heal'
  // ДОСЛОВНО; у Эфира role 'support' ТОЖЕ — kind-гейт обязателен).
  // До выбора из книги legacy-поведение ядра без изменений:
  // support-наёмник — mostWounded/strongestKnown, прочие —
  // «недоступно активному персонажу», пока выбора нет.
  function activeIsMercWithBook(c) {
    const u = activeUnit(c);
    return !!(u && u.kind === 'merc' && Array.isArray(u.spells)
      && u.spells.length > 0);
  }
  // Видимость «Каст»/«Лечение» — по активному СОЮЗНИКУ: «Каст» —
  // только на ходу Эфира; «Лечение» — только на ходу наёмника с
  // книгой (000227 D6). Игрок/моб/конец боя — activeUnit null →
  // скрыта.
  function castHealVis(c, act) {
    return act === 'cast' ? activeIsEfir(c) : activeIsMercWithBook(c);
  }
  // 000227 (D12): ОСТАТОК ПУЛА заклинания, которое кнопка применит
  // СЕЙЧАС: выбор из книги (lastSpells) → строка книги; без выбора —
  // legacy G.autoSpellFor(u, 'урон'/'лечение') → его строка. poolKey
  // строки (spellbook.js: intelligence→spellInt, иначе spellWis);
  // источник пула: игрок c.ps, Эфир c.efs (null-guard), наёмник u.
  // Нет строки/пула → null (бейдж скрыт; «нет пула» ≠ «0», 000199).
  // Чистое чтение — в actionCounts (ОДИН расчёт на render);
  // typeof-guard G.autoSpellFor (деградация: legacy-бейдж скрыт).
  function spellBtnOf(c) {
    const u = unitOf(c);
    if (!u) return null;
    let sel = (u === c.player) ? lastSpells.player : lastSpells[u.id];
    if (!sel && u !== c.player && typeof G.autoSpellFor === 'function') {
      sel = G.autoSpellFor(u, u.kind === 'efir' ? 'урон' : 'лечение');
    }
    if (!sel) return null;
    const row = bookRows(c).find((r) => r.id === sel);
    if (!row || !row.poolKey) return null;
    const src = (u === c.player) ? c.ps
      : (u.kind === 'efir' ? (c.efs || null) : u);
    if (!src || typeof src[row.poolKey] !== 'number') return null;
    return src[row.poolKey];
  }

  function openFleeConfirm() {
    fleeOpen = true;
  }

  function closeFleeConfirm() {
    fleeOpen = false;
  }

  function confirmFlee(c) {
    closeFleeConfirm();
    const chk = G.canDoAction(c, 'flee', { targetId: c.targetId });
    if (!chk.ok) {
      logRejection(c, chk);
      render();
      return;
    }
    logRejection(c, c.flee());
    render();
  }

  // Рендер книги (вызывается из render()): display = bookOpen.
  // Идентичность DOM-элементов строк между рендерами (правки ревью
  // 000149): rAF-цикл (000047) в браузере рендерит КАЖДЫЙ кадр;
  // прежняя пересборка строк на каждый кадр (innerHTML='' + append)
  // убивала клик по строке: по спецификации HTML click срабатывает на
  // ближайшем общем предке целей mousedown/mouseup, и если элемент
  // строки, на котором началось нажатие, заменён до mouseup, click
  // приземляется на .combat-spellbook, у которого слушателей НЕТ —
  // каст терялся (строки — единственная точка применения
  // заклинания). Перестроение — ТОЛЬКО при изменении сигнатуры:
  // поля строк (id/name/desc/mana/poolName/icon) + ok/reason
  // canCastSpell каждой (цель/фаза/мана/пулы — через canCastSpell).
  // Стаб-ловушка та же, что была: в vm-песочнице innerHTML/textContent
  // НЕ чистят children — при перестроении строки ДОБАВЛЯЮТСЯ, тесты
  // читают хвост children.slice(-N).
  function renderBook(c) {
    if (!bookBox) return;
    bookBox.style.display = bookOpen ? '' : 'none';
    if (!bookOpen) return;
    const rows = bookRows(c);
    const pairs = rows.map((row) => [row, rowChk(c, row)]);
    const sig = rows.length
      ? pairs.map(([row, chk]) => [
          row.id, row.name, row.desc, row.mana, row.poolName, row.icon,
          chk ? !!chk.ok : false, (chk && chk.reason) || '',
        ].join('¦')).join('§')
      : 'empty';
    if (sig === bookSig) return; // steady-state: элементы строк не трогаем
    bookSig = sig;
    if (typeof document !== 'undefined'
        && typeof bookBox.innerHTML === 'string') {
      bookBox.innerHTML = ''; // реальное DOM: чистим до перестроения
    }
    if (rows.length === 0) {
      // Пустая книга — одна строка «—» (паттерн 000145). Класс -off:
      // строка НЕ кликабельна (слушателей нет) — без pointer-курсора
      // (ревью 000149: «одно действие — одно поведение», 000037).
      const empty = document.createElement('div');
      empty.className = 'combat-spellrow combat-spellrow-off';
      empty.textContent = '—';
      bookBox.appendChild(empty);
      return;
    }
    for (const [row, chk] of pairs) {
      bookBox.appendChild(buildSpellRow(c, row, chk));
    }
  }

  // --- «Быстрый предмет» — список поверх экрана боя (задача 000194) ---
  //
  // Контракт — memory/000194-ally-quick-items.md. Список — три быстрых
  // слота АКТИВНОГО персонажа (unitOf, паттерн книги 000193): герой —
  // inventory.quick, союзник (наёмник/Эфир) — u.quick (свои слоты,
  // makeAlly 000194). 000223: расход — СВОЯ единица слота (ядро
  // c.quickItem — диспатч playerQuickItem/allyQuickItem; слот — не
  // ссылка на инвентарь). Строки — div (не <button>,
  // R9-паттерн книги) с ИМЕНЕМ и ОПИСАНИЕМ предмета. Открытие
  // (KeyE/кнопка «Быстрый предмет») НИЧЕГО не тратит: пул и предмет —
  // только при клике по строке (quickUseRow, путь ядра).

  // Можно ли открыть список: фаза игрока, нет результата, у активного
  // персонажа есть пул И хотя бы один ЗАНЯТЫЙ слот. Stale-слот
  // (предмета нет в инвентаре) открытие НЕ блокирует — причина на
  // строке (тест 194-QUI-REJ). Блок — блокирует (книга-референс:
  // в блоке список не открывается, причина в журнал). c.ps.blocked —
  // флаг ИГРОКА: ветка героя гатится, ветка союзника — НЕТ (ядро
  // союзника checkBlocked не вызывает, контракт §2.3). Чистые чтения,
  // 0 мутаций, 0 c._rng.
  function quickOpenable(c) {
    if (c.phase !== 'player' || c.result) return false;
    const u = unitOf(c);
    if (!u) return false;
    if (u === c.player) {
      if (c.ps && c.ps.blocked) return false;
      const quick = (c.player.inventory
        && c.player.inventory.quick) || null;
      return !!(c.ps && c.ps.quickItem > 0
        && Array.isArray(quick)
        && quick.some((x) => x != null));
    }
    return !!(u.quickItem > 0 && Array.isArray(u.quick)
      && u.quick.some((x) => x != null));
  }

  function toggleQuickList() {
    quickOpen = !quickOpen;
  }

  // Краткая подпись эффекта предмета (строка списка). Чистое чтение
  // каталога — без Game-чтений, мутаций, console, c._rng.
  function quickMeta(it) {
    const ef = it && it.effect;
    if (ef && typeof ef === 'object') {
      if (ef.kind === 'heal') return 'Лечит +' + ef.amount;
      if (ef.kind === 'mp') return 'Мана +' + ef.amount;
      if (ef.kind === 'eat') return 'Еда +' + ef.amount;
      if (ef.kind === 'resurrect') return 'Воскрешение';
    }
    return '';
  }

  // Строка списка (R9-паттерн buildSpellRow): div.combat-quickrow с
  // ПРЯМЫМИ детьми (тесты читают row.children): .combat-quickname
  // (имя + номер слота), .combat-quickmeta (подпись эффекта),
  // .combat-quickrow-desc (ОПИСАНИЕ предмета дословно). canDoAction
  // {slot} — предпросмотр применения (ok/reason — sig
  // renderQuickList; отказ — класс -off + title + КЛИК ЕСТЬ: причина
  // в журнал, список остаётся открыт, 194-QUI-REJ). Пустой слот:
  // «— пусто —», -off, без слушателя (книга 000149).
  function buildQuickRow(c, slot, itemId, chk) {
    const el = document.createElement('div');
    el.className = 'combat-quickrow';
    el.dataset.slot = String(slot);
    const name = document.createElement('span');
    name.className = 'combat-quickname';
    const it = itemId ? (G.getItem ? G.getItem(itemId) : null) : null;
    if (!itemId || !it) {
      // Пустой слот (или id, которого нет в каталоге — ядро отклонит
      // «неизвестный предмет»): приглушён, НЕ кликабелен.
      el.className += ' combat-quickrow-off';
      name.textContent = '— пусто —';
      el.appendChild(name);
      return el;
    }
    if (!chk || !chk.ok) {
      el.className += ' combat-quickrow-off';
      el.title = (chk && chk.reason) || 'Предмет недоступен';
    }
    name.textContent = it.name + ' — слот ' + (slot + 1);
    el.appendChild(name);
    const meta = document.createElement('span');
    meta.className = 'combat-quickmeta';
    meta.textContent = quickMeta(it);
    el.appendChild(meta);
    const desc = document.createElement('div');
    desc.className = 'combat-quickrow-desc';
    desc.textContent = it.desc;
    el.appendChild(desc);
    el.addEventListener('click', () => quickUseRow(c, slot));
    return el;
  }

  // Клик по строке (задача 000194): применение ПЕРЕДАННЫМ слотом через
  // ДИСПАТЧ ядра (герой — playerQuickItem, союзник — allyQuickItem;
  // расход — ОБЩИЙ инвентарь c.player). Успех — список ЗАКРЫВАЕТСЯ
  // (действие сделано, паттерн книги castRow 000149); c._fx НЕ
  // пишется (применение предмета — без каст-эвристики). Отказ —
  // причина в журнал (logRejection), список остаётся ОТКРЫТЫМ (видна
  // причина, можно поправить). Предпроверка — гейт
  // spellbookUnitGate (000193: только result/phase).
  function quickUseRow(c, slot) {
    if (fleeOpen) return;
    const g = spellbookUnitGate(c);
    if (g) {
      logRejection(c, g);
      render();
      return;
    }
    const r = c.quickItem(slot);
    if (r && r.ok) {
      quickOpen = false;
    } else {
      logRejection(c, r);
    }
    render();
  }

  // Рендер списка (вызывается из render()): display = quickOpen.
  // Перестроение — ТОЛЬКО при изменении сигнатуры (паттерн
  // renderBook 000149): активный юнит + 3 слота + ok/reason
  // canDoAction {slot} каждой строки. Стаб-ловушка та же, что у
  // книги: в vm-песочнице innerHTML='' НЕ чистит children — при
  // перестроении строки ДОБАВЛЯЮТСЯ (тесты читают хвост).
  function renderQuickList(c) {
    if (!quickBox) return;
    quickBox.style.display = quickOpen ? '' : 'none';
    if (!quickOpen) return;
    const u = unitOf(c);
    const quick = (u && u !== c.player)
      ? (Array.isArray(u.quick) ? u.quick : [null, null, null])
      : ((c.player && c.player.inventory
         && c.player.inventory.quick) || [null, null, null]);
    const pairs = [0, 1, 2].map((i) => {
      const itemId = quick[i] || null;
      const chk = G.canDoAction(c, 'quickItem', {
        targetId: c.targetId, slot: i,
      });
      return [i, itemId, chk];
    });
    const sig = (u && u !== c.player ? u.id : 'p') + '§'
      + pairs.map(([i, itemId, chk]) => [
          i, itemId, !!chk.ok, chk.reason || '',
        ].join('¦')).join('§');
    if (sig === quickSig) return;
    quickSig = sig;
    if (typeof document !== 'undefined'
        && typeof quickBox.innerHTML === 'string') {
      quickBox.innerHTML = '';
    }
    for (const [i, itemId, chk] of pairs) {
      quickBox.appendChild(buildQuickRow(c, i, itemId, chk));
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
    // Эфир (задачи 000081/000205): его равная доля боевого опыта —
    // result.efirXp (base = floor(xp/N), считает checkVictory; 0, если
    // юнита Эфира в бою нет) — в его пул ДО onEnd (следующий бой сразу
    // видит новый уровень) и ДО ctx = null. Правило: ТОЛЬКО victory,
    // ВЕСЬ result.efirXp, БЕЗ условия выживания Эфира (000035#11:
    // погиб в бою — доля всё равно в пул). Ручной result БЕЗ поля
    // efirXp (legacy-мутация) — guard false, тихий skip. ctx.efir
    // != null только когда G.efir был доступен на startCombat —
    // снапшот G неизменен.
    if (ctx.efir && result.outcome === 'victory' && result.efirXp > 0) {
      // 000170 (D5a): исключение в addEfirXp (abnormal sheet —
      // S.addXp/appendSpells/reprocessEfirSkills) НЕ роняет finish:
      // xp-начисление пропущено (logged once), оверлей снят, ctx
      // обнулён, onEnd применён (награды/подъём/dead-mercs не
      // потеряны). Порядок happy path не меняется.
      try {
        G.efir.addEfirXp(ctx.efir, result.efirXp);
      } catch (err) {
        if (!xpErrLogged) {
          xpErrLogged = true;
          console.error('combat-ui.js: исключение в addEfirXp — опыт ' +
            'Эфира не начислен (повторные предупреждения ' +
            'подавлены).', err);
        }
      }
    }
    if (overlay) overlay.remove();
    overlay = canvas = g2 = stateEl = logEl = bannerEl = turnorderEl =
      boxEl = null;
    hpbarEl = hpbarFillEl = hpbarTextEl = null;
    mpbarEl = mpbarFillEl = mpbarTextEl = null;
    countEls = {}; // 000199: как hpbar-refs — обе точки (D5b 000170)
    lastSpells = {}; // 000227: как countEls — обе точки (finish/catch)
    bookBox = null;
    bookOpen = false;
    bookSig = null;
    quickBox = null;
    lootEl = null;
    quickOpen = false;
    quickSig = null;
    fleeBox = null;
    fleeOpen = false;
    moveAnims = null;
    atkLayer = null;
    atkKids = {};
    ctx = null;
    ended = false;
    // 000170 (D5b): исключение в onEnd (side effects — награды/
    // подъём/dead-mercs-записи 000161) НЕ улетает вызывателю
    // (keydown/frame): боевое состояние уже снято чисто (оверлей,
    // ctx, ended), onEnd-эффекты потеряны (logged once).
    if (onEnd) {
      try {
        onEnd(result);
      } catch (err) {
        if (!onEndErrLogged) {
          onEndErrLogged = true;
          console.error('combat-ui.js: исключение в onEnd — побочные ' +
            'эффекты конца боя потеряны (повторные предупреждения ' +
            'подавлены).', err);
        }
      }
    }
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
     * @param {boolean} [opts.efirMet] первая встреча Эфира (задача
     *   000118, вариант (a)): true — «Эфир уже встречен в бою» (флаг
     *   из сейва main.js) — строка первой встречи в createCombat не
     *   показывается. Опционально: undefined/фальс — старое
     *   поведение (бит-в-бит; BR-8).
     * @param {Object<string, (string|null)[]>} [opts.allyQuick]
     *   быстрые предметы СОЮЗНИКОВ (задача 000194): ключ — id боевого
     *   юнита ('efir' / npcId), значение — [3] id предметов ОБЩЕГО
     *   инвентаря (null — пусто). Не передан / не-объект — бит-в-бит
     *   (makeAlly сам валидирует: нестрока → null-слот).
     * @param {Object<string, (string|null)[]>} [opts.allyQuickLive]
     *   000195: live-карта быстрых предметов союзников (тот же объект,
     *   что G.playerUI.setAllyQuick, main.js) — combat-ui re-sync'ит
     *   u.quick из неё в бою (syncAllyQuickLive): раздача на [I]-панели
     *   действует В ТЕКУЩЕМ бою. UI-only: ядро combat.js не читает;
     *   не передан / не-объект → null (снапшот createCombat, бит-в-бит).
     * @param {Object<string, string>} [opts.lastSpells]
     *   000249: live-карта «последнего заклинания» (тот же объект,
     *   что lastSpells main.js): ключ 'flogiston' (герой) / 'efir' /
     *   npcId → id заклинания. build() сидирует из неё союзников
     *   (герой — нет, S3); recordLastSpell пишет в неё на успешном
     *   касте. UI-only: ядро combat.js не читает; не передан /
     *   не-объект → null (модульная карта, выбор пер-бой).
     */
    startCombat(opts) {
      if (isActive()) return null;
      ended = false;
      moveAnims = null;
      atkLayer = null;
      atkKids = {};
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
      // 000194: быстрые предметы СОЮЗНИКОВ — opts.allyQuick
      // (map id боевого юнита 'efir'/npcId → [3] id предметов ОБЩЕГО
      // инвентаря). Запись в данные makeAlly (a.quick) ПЕРЕД
      // createCombat — makeAlly сам снапшотит и валидирует
      // (нестрока → null-слот, ядро отклонит «неизвестный предмет»).
      // Шаллоу-копия записи — данные main.js не мутируются; без
      // записи в opts.allyQuick — запись бит-в-бит.
      const alliesArr = (efirData ? [efirData] : []).concat(
        Array.isArray(opts.rosterData) ? opts.rosterData : []);
      if (opts.allyQuick && typeof opts.allyQuick === 'object'
          && !Array.isArray(opts.allyQuick)) {
        for (let i = 0; i < alliesArr.length; i++) {
          const a = alliesArr[i];
          const q = (a && a.id) ? opts.allyQuick[a.id] : null;
          if (Array.isArray(q)) {
            alliesArr[i] = Object.assign({}, a, { quick: q });
          }
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
        // 000194: a.quick — из opts.allyQuick (запись выше).
        allies: alliesArr,
        // 000118 (вариант (a)): флаг «уже встречались» — из сейва
        // main.js (top-level efir_met) → ядро (шов первой встречи).
        // undefined → старое поведение (бит-в-бит; BR-8).
        efirMet: !!opts.efirMet,
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
      // 000195: live-карта быстрых слотов союзников (тот же объект, что
      // G.playerUI.setAllyQuick, main.js) — syncAllyQuickLive re-sync'ит
      // u.quick из неё (handleCode/render): раздача на [I]-панели
      // действует в текущем бою. Ядро не читает; 000223: ядро чистит
      // live-слот при расходе (clearAllyQuickUnit). Не передан → null
      // (снапшот, бит-в-бит).
      combat._allyQuickLive = (opts.allyQuickLive
        && typeof opts.allyQuickLive === 'object'
        && !Array.isArray(opts.allyQuickLive)) ? opts.allyQuickLive : null;
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
        // Эфир (задачи 000081/000205): состояние — finish() начисляет
        // равную долю result.efirXp (000205). null — Эфир НЕ участвует
        // в бою (opts.efir нет или деградация — XP начислять нечего).
        efir: efirData ? opts.efir : null,
        // 000118: edge-detect c.efirBreathed в render() — «уже видел
        // Вдох» на уровне боя (сброс на каждый startCombat: новый
        // ctx → false; one-shot ядра — один раз за бой).
        breathedPrev: false,
        lungeGate: !!opts.lungeGate,
        // 000249 (S2): live-карта «последнего заклинания» (тот же
        // объект, что lastSpells main.js) — build() сидирует из неё
        // союзников, recordLastSpell пишет на успешном касте.
        // Не передан / не-объект → null (модульная карта).
        lastSpells: (opts.lastSpells
          && typeof opts.lastSpells === 'object'
          && !Array.isArray(opts.lastSpells)) ? opts.lastSpells : null,
      };
      try {
        build();
        render();
        // Цикл анимации (задача 000047): rAF-тики пока оверлей
        // открыт. Без rAF (vm-песочница) — null, событийный
        // синхронный рендер.
        if (raf) rafId = raf(tick);
      } catch (err) {
        // 000170 (D4): исключение build/render (DOM/canvas в
        // реальном браузере: null-элементы, canvas-context,
        // combat-scale getBoundingClientRect) — САМОИСЦЕЛЕНИЕ:
        // исключение не улетает вызывателю, активного состояния
        // НЕ остаётся (иначе isActive()===true вечно гейтит
        // мир/подземелье/exit-тайл — все 4 пути ввода мёртвы).
        // Пост-состояние — зеркало finish(): ended=false, ctx=null,
        // оверлей снят, DOM-ссылки обнулены → следующий startCombat
        // стартует норм (забытый ended=true отравил бы finish()
        // следующего боя). Вызывающие в main.js null-safe
        // (noteEfirCombat, maybeStartCombat: true → enterLocation
        // откладывается на следующий кадр, гейт открыт — безопасная
        // деградация).
        if (rafId != null && caf) { caf(rafId); rafId = null; }
        if (overlay && typeof overlay.remove === 'function') {
          try { overlay.remove(); } catch (e2) {
            // снятие обломка — косметика: состояния очищены ниже
          }
        }
        overlay = canvas = g2 = stateEl = logEl = bannerEl = turnorderEl =
          boxEl = null;
        hpbarEl = hpbarFillEl = hpbarTextEl = null;
        mpbarEl = mpbarFillEl = mpbarTextEl = null;
        countEls = {}; // 000199: как hpbar-refs — обе точки (D5b 000170)
        lastSpells = {}; // 000227: как countEls — обе точки (finish/catch)
        bookBox = null;
        bookOpen = false;
        bookSig = null;
        quickBox = null;
        lootEl = null;
        quickOpen = false;
        quickSig = null;
        fleeBox = null;
        fleeOpen = false;
        moveAnims = null;
        atkLayer = null;
        atkKids = {};
        ctx = null;
        ended = false;
        if (!startCombatErrLogged) {
          startCombatErrLogged = true;
          console.error('combat-ui.js: исключение в build/render — бой ' +
            'не начался (повторные предупреждения подавлены).', err);
        }
        return null;
      }
      return combat;
    },
    isActive,
    current,
    // Единый путь «code → действие боя» (задача 000121): клавиатура
    // (keydown выше) и тач-D-pad (main.js → touchKeyCode → handleCode).
    handleCode,
    setLungeGate(on) {
      if (!ctx || !overlay) return;
      if (!!on === !!ctx.lungeGate) return;
      overlay.style.visibility = on ? 'hidden' : '';
      overlay.style.pointerEvents = on ? 'none' : '';
      ctx.lungeGate = !!on;
    },
  };
})();

