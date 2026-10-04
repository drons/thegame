# Задача 000118: UX боя Эфира — лог-строки, fx «Вдоха Эфира», подсказка состава

Статус: проектирование завершено (2026-10-04). Код пишется по плану ниже.
Родительская: 000035. Зависимости (все в master на 614c6c5): 000112,
000113, 000114. Параллельно в чужом worktree — 000119 (tests/combat.test.js
+ global-settings.js) — наш дифф в tests/combat.test.js — ТОЛЬКО регион
CB-* (пины строк, строки 3336–4314), 000119 дописывает СВОИ секции —
ребейз = region-union.

## 1. Решения (openQuestions закрыты)

### Д1 — Лог-строки: 3 строки combat.js переименованы в ТЗ-паттерны
ТЗ (источник правды) предписывает ПРОВЕРЯЕМЫЕ паттерны; текущие формулировки
в master им НЕ соответствуют (разночтение «строки уже там» в ТЗ неточно:
efir.js содержит только «Вдох Эфира!» и первую встречу; heal/cast/touch —
литералы combat.js). Инвариант «не менять существующее поведение» имеет
явное исключение «если ТЗ не предписывает иное» — ТЗ предписывает.

Точные новые литералы (пины красной фазы сверяются по ним):
* heal (src/combat.js ~1560, приоритет (1) efirTurn):
  `` `Эфир исцеляет ${W.player ? c.player.name : W.unit.name} (+${actual}).` ``
  (было «Эфир лечит … (+N).»)
* cast (~1604, приоритет (3)):
  `` `Эфир: «${s['название']}» — ${e.name}: ${r.dmg}.` ``
  (em-dash U+2014, кавычки «» сохранены; было «… по Волк: 5.»)
* touch (~1619, приоритет (4)):
  `` `Касание духа: ${r.dmg}.` `` (без имени — ТЗ буквально «Касание духа: N»)

НЕ ТРОГАТЬ: строка щита (~1580 «Эфир: «…»: +N брони на 2 раунда.» — её нет
в ТЗ-списке) и «Вдох Эфира!» (BREATH_INFO.logLine, 000113).
ВАЖНО: блоку Вдоха (000113) НОВЫХ строк не добавлять — пин BR-2
(combat.test.js ~3943) deepEqual'ит полный лог блока Вдоха; строка
лечения живёт в приоритете (1), а не в блоке Вдоха.

Обновление пинов (GREEN-фаза, 6 мест — техническая правка под новый путь):
* tests/combat.test.js: 3336 и 3378 («лечит»→«исцеляет»), 3512
  (→`'Касание духа: 4.'`), 3599 (→`'Эфир: «Альфа» — Волк: 5.'`),
  guard BR-2 ~3939 (`l.includes('Эфир исцеляет')`). deepEqual 3943–3945
  и строку щита 3415 — без изменений.
* tests/efir.test.js: 724 и 736 (+ тексты сообщений 725/737).
* BR-8 (4219+) — без изменений (createCombat без opts.efirMet — см. Д2).

### Д2 — Первая встреча: вариант (a) — флаг в сейве (ТОП-УРОВЕНЬ, вне
state.efir — она заморожена 5 полями пинами 000085/000115)
* main.js: `let efirMet = false;` (рядом с `let efir = null;`, ~231).
* collectSaveData(): топ-уровневое поле `efir_met: efirMet,` (в конце,
  после campStocks) + комментарий «Неломкое расширение v1 (000031):
  версию НЕ поднимаем». CURRENT_VERSION остаётся 1 (пин save.test.js).
  Поле ВСЕГДА пишется (true/false) — паттерн 000109 R5. MIGRATIONS —
  не нужны.
* restoreFromSave(): новая секция ПОСЛЕ campStocks (до «Позиция»),
  паттерн per-section try/catch+console.warn:
  `d.efir_met === true` → efirMet = true; `d.efir_met != null &&
  !== true` → console.warn('efir_met: невалидное значение, сброс') +
  false; отсутствует → молча false. Направление деградации безопасное:
  строка максимум РАЗ повторится, не пропадёт.
* Установка: helper `noteEfirCombat(combat)` в main.js (перед
  startCombatAt ~1206):
  ```js
  function noteEfirCombat(combat) {
    if (combat && !efirMet &&
        combat.units.some((u) => u && u.id === 'efir' && u.side === 'ally')) {
      efirMet = true;
    }
  }
  ```
  Проверяет РЕАЛЬНЫЕ c.units (а не модульную переменную `efir`) —
  корректно, если Эфир не попал в бой. Вызов — сразу после ВСЕХ трёх
  точек startCombat: startCombatAt (~1206), maybeStartCombat (~1537),
  startDungeonCombat (~1811).
* main.js → opts: `efirMet,` в opts всех трёх startCombat +
  `efirMet,` в __game.state getter (~2250, рядом с `efir: efir || null`)
  — для debug/e2e.
* combat-ui startCombat: JSDoc `@param {boolean} [opts.efirMet]` +
  `efirMet: !!opts.efirMet,` в вызове G.createCombat (~932–962).
* combat.js createCombat: в shове первой встречи (~2054–2068) условие
  `… u.id === 'efir' && u.side === 'ally'` + `&& !opts.efirMet` +
  JSDoc `@param {boolean} [opts.efirMet]`. opts.efirMet undefined →
  falsy → `!undefined` = true → старое поведение БИТ-В-БИТ (BR-8 зелёный
  без правок).
* NEW-сохраняется: efir.js НЕ ТРОГАЕМ — сессионный one-shot
  takeFirstEncounterLine остаётся ВТОРОЙ преградой (в пределах сессии
  строка не повторится даже без флага; двойная преграда = R1, см. ниже).
* saveNow точек НОВОГО не добавляем (000085 D10: onEnd/step/beforeunload).
  Крах до точки сейва → строка повторится ОДИН раз (задокументировано).

### Д3 — FX «Вдоха Эфира»: edge-detect в render + подобъект c._fx.breath +
отдельный слой drawBreathFx
Почему edge-detect в render (а не в runAction): контракт 000113 §8 прямо
говорит «UI видит переключение при рендере». Почему под-объект c._fx.breath
(а не замена c._fx = {action:'breath'}): c._fx — слот действия ГЕРОЯ
(000030/000047, {action, until}); под-объект НЕ читается селектором
кадра героя (`c._fx.action` — undefined → 'idle') → НУЛЬ правок в
hero-ветке drawUnits и существующие пины c._fx (undefined до действия /
action==='attack' после KeyJ / until) не задеты.

Точечные правки (src/combat-ui.js):
* `const BREATH_FX_MS = 600;` (2×FX_MS, пиновый) после `const FX_MS = 300;`
  (строка 73).
* ctx в startCombat (976–986): добавить `breathedPrev: false,`.
* render(), сразу после `const now = nowMs();`:
  ```js
  // FX «Вдох Эфира» (000118): edge-detect c.efirBreathed (000113 —
  // выставляется один раз за бой в алли-фазе). Ядро не знает о fx:
  // c._fx.breath — под-объект, НЕ слот действия героя {action, until}.
  const breathed = !!c.efirBreathed;
  if (breathed && !ctx.breathedPrev) {
    const fx = c._fx || (c._fx = {});
    fx.breath = { at: now, until: now + BREATH_FX_MS };
  }
  ctx.breathedPrev = breathed;
  ```
* Новая функция `drawBreathFx(c, now)` (рядом с drawUnits) + вызов в
  render() СРАЗУ ПОСЛЕ `drawUnits(c, now, hpFrac, hpColor);`
  (z-порядок закреплён комментом: фон → сетка → препятствия → юниты →
  эффекты; 000114 §4: FX ПОВЕРХ всех слоёв юнита):
  ```js
  function drawBreathFx(c, now) {
    const fx = c._fx && c._fx.breath;
    if (!fx || now >= fx.until) return;
    const t = (now - fx.at) / (fx.until - fx.at); // [0, 1)
    // (1) Аура на каждом ЖИВОМ союзнике (side 'ally' в c.units, включая
    //     Эфира; герой НЕ в c.units — «не больше, чем ТЗ»):
    //     beginPath + arc(центр клетки, CELL*(0.35 + 0.15*t), 0, 2π),
    //     fill ALLY_MARKER_UNDERLAY, stroke ALLY_MARKER, lineWidth 2.
    // (2) Волна от Эфира (у.id === 'efir', живой; фолбэк — центр поля
    //     (c.width/2, c.height/2)): растущее кольцо
    //     r = CELL*0.5 + Math.max(c.width, c.height)*CELL*0.5*t,
    //     stroke ALLY_MARKER, lineWidth 2.
    // (3) Малые кольца на живых недобежавших врагах (side 'enemy',
    //     !u.alive=false, !u.fled): arc(центр, CELL*(0.2 + 0.2*t), …),
    //     stroke ALLY_MARKER, lineWidth 1.5.
  }
  ```
  Центры клеток: `(u.x + ((u.size && u.size.w) || 1) / 2) * CELL`,
  аналогично по y (у союзников ВСЕГДА 1×1, makeAlly).
* Палитра: ТОЛЬКО существующие константы ALLY_MARKER '#8cf2fc' /
  ALLY_MARKER_UNDERLAY 'rgba(140,242,252,0.25)' (000038: новых цветов НЕТ).
* Детерминизм: НУЛЬ c._rng; мутируется только c._fx (UI-поле, ядро его
  не читает). Красная сигнатура: 'arc' ВООБЩЕ не встречается в текущем
  combat-ui.js (grep-проверено) → после триггера arc в drawCalls, без —
  нет.
* Экспирация: pин `c._fx.breath.until = NOW − 1` → drawBreathFx early
  return; под-объект в c._fx может остаться (инертен: рандер гвардится
  by until, hero-селектор .action не видит).

### Д4 — Подсказка состава: строка «Отряд: …» в stateEl (.combat-state)
Почему строка stateEl (а не новый div .combat-roster): НУЛЬ правок
index.html/CSS/finish() (stateEl не ноложится иначе — finish() его
не трогает; .combat-state — white-space:pre-line, высоты/overflow НЕТ →
лишняя строка безопасна, R7); в a3-мапе красных тестов ассерты именно по
.combat-state; ТЗ «минимальное аддитивное расширение HUD».
* render(): между строкой «Шаги:…» и строкой БЛОК/ЯД+«Цель:…» вставить
  ```js
  const RN = G.ROLE_NAMES || {};
  const allies = c.units.filter((u) => u.side === 'ally');
  const roster = allies.length
    ? 'Отряд: ' + allies.map(
        (u) => `${u.name} (${RN[u.role] || u.role})`)
        .join(', ') + '\n'
    : '';
  ```
  (ROLE_NAMES — экспорт combat.js:91/2106, G-снапшот combat-ui включает
  combat.js — order закреплён index-order.test.js; fallback — raw role).
* Состав = ТОЛЬКО side 'ally' (герой НЕ в c.units — автоматически нет;
  «не больше, не меньше»: ТЗ «имена/роли юнитов side 'ally'»). Порядок =
  c.units (Эфир первым). МЁРТВЫЕ союзники ВКЛЮЧЕНЫ (состав стабилен;
  ТЗ молчит; не больше/не меньше = не фильтровать без основания).
  Пустой отряд → строки НЕТ (существующий вывод бит-в-бит).
* Пины stateEl-текста в тестах НЕТ (grep-проверено).

### Д5 — Memory: этот файл (полный контракт) + memory/000118-combat-ux-efir.md
(короткий дайджест + указатель). memoryFile = этот.

## 2. Контракты и границы
* src/combat.js — 3 литерала + shov `&& !opts.efirMet` + JSDoc/комменты.
  Механики 000112/000113 НЕ ТРОГАЕМ; блоку Вдоха новых строк НЕТ (BR-2).
* src/combat-ui.js — только добавления: константа, ctx-поле, edge-detect
  в render, drawBreathFx + вызов, строка stateEl, opts-проходка efirMet.
  Существующие пины c._fx / hero-кадры / order / 000084-золотые сцены —
  бит-в-бит (сцены без Вдоха: c.efirBreathed undefined → ничего).
* src/main.js — efirMet (let + сейв + restore + 3× opts + noteEfirCombat +
  state getter). Геймплейные механики не трогаем.
* src/efir.js — НЕТ ИЗМЕНЕНИЙ (R1: 18 экспортов зафиксированы).
* index.html / assets / src/save.js / src/global-settings.js — НЕТ.
* Формат сейва: +1 топ-уровневое поле `efir_met` (boolean, ВСЕГДА
  пишется); версия 1 (ПИН); state.efir — 5 полей (ПИН, не трогаем).
* Определимость: опция opts.efirMet опциональна; c._fx.breath — UI-only;
  c.efirBreathed — ядро (000113), мы только ЧИТАЕМ.

## 3. Ленивые ссылки и guards
* combat.js shov: `const G = typeof globalThis !== 'undefined' ?
  globalThis.Game : null; const f = G && G.efir &&
  G.efir.takeFirstEncounterLine; if (typeof f === 'function') …` —
  существующий, НЕ МЕНЯЕМ (только `&& !opts.efirMet` в if).
* combat-ui: `G.ROLE_NAMES || {}` + `RN[u.role] || u.role` (fallback raw
  role — деградация без краха).
* drawBreathFx: `c._fx && c._fx.breath` + `now >= fx.until` → return;
  поиск Эфира: `c.units.find((u) => u.id === 'efir' && u.alive)` →
  фолбэк центр поля (fx без Эфира невозможен, но краха не будет).
* restore: `d.efir_met === true` строго; мусор → warn+false; отсутствуe —
  молча false (старые сейвы — работают).
* noteEfirCombat: `combat && !efirMet && combat.units.some(…)` — все
  guards, вызовы не крашат (combat — объект startCombat, но защита
  бесплатна).
* vm cross-realm (000082): в тестах сравниваем примитивы (строки/boolean),
  не объекты между realm'ами.

## 4. Что важно будущим задачам (из ТЗ-ссылок)
* 000119 (параллель): трогает tests/combat.test.js (СВОИ новые секции) и
  global-settings.js. Наш регион в combat.test.js — только CB-*piны
  строк (~3336–4314). Ребейз = union по регионам; global-settings.js
  НЕ ТРОГАЕМ вообще.
* 000116/000117: efir.js заморожен (R1, breathInfo-алиас EFIR_BREATH,
  practiceEfir-хук 000117) — 000118 efir.js не правит → конфликтов нет.
* Флаг `efir_met` — канон «Эфир встретился в бою» для будущих задач
  (диалоги, квесты): читать из __game.state.efirMet (debug) или сейва;
  НЕ изобретать второй флаг (000113 §3.5: «НЕ изобретать второй флаг»).
* c._fx.breath — контракт fx Вдоха: {at, until}, BREATH_FX_MS = 600;
  будущие fx Эфира — аналогичные под-объекты c._fx.<имя> (слот
  {action,until} героя НЕ занимать).
* FX-слой drawBreathFx — первый «эффект поверх юнитов» в бою (000062-
  паттерн); будущие боевые эффекты — вызывать в render() после drawUnits.
* Строка «Отряд: …» — канон HUD-подсказки состава; расширение ролей —
  только через ROLE_NAMES (combat.js:91, экспорт).

## 5. Подводные камни
* R1 (двойная преграда первой встречи): персистентный флаг efir_met +
  сессионный one-shot efir.js. Флаг true → one-shot НЕ расходуется
  (shov не дойдёт до f()) — строка не повторится; если флаг вручную
  сбросить → строка ещё раз (безопасное направление: максимум один
  лишний показ).
* R2 (косметика): действие героя ПОСЛЕ Вдоха заменяет c._fx целиком
  (`c._fx = {action:'attack', …}`) → c._fx.breath теряется → эффект
  заканчивается досрочно. Косметически допустимо (окно 600 мс);
  задокументировать, не чинить (не больше ТЗ).
* R3: main.js — горячий файл параллельных workflow; наши регионы
  (efir-блок ~231, collectSaveData хвост, restore после campStocks,
  helper перед startCombatAt, 3 точки startCombat, state getter) —
  стабильные якоря.
* R4: `efir_met` ВСЕГДА пишется → старые сейвы получат поле при первом
  saveNow после апгрейда; пинов Object.keys(saved.data) в тестах НЕТ
  (grep-проверено) — безопасно.
* R5: tests/combat.test.js пересекается с 000119 по ФАЙЛУ (не по
  регионам) — при ребейзе не слепить: CB-*piны = наши, новые секции =
  000119.
* R6: stateEl +1 строка — .combat-state без фиксированной высоты
  (pre-line) → безопасно; но НЕ вешать на неё новые пины длины.
* R7: в vm-тестах breath требует у. mp = 20 ПОСЛЕ startCombat
  (buildEfirUnit переписывает mp; maxMP L1 = 11 → старт mp < 20),
  hero.hp = 10 (40% от 25 ТОЧНО: 10/25 === 0.4), c._rng = () => 0.99
  (детерминизм), сценарий — scene84({efir:true}).
* R8: эмуляция «второго боя после сейва» в e2e = bootWithSave(st,
  null, saved.data) (паттерн 000115 V2 в хвосте save.test.js) — НОВЫЙ
  sandbox, т.к. сессионный one-shot живёт в sandbox'е; флаг проверяется
  ЧЕРЕЗ сейв (state.efirMet === true → shov молчит, даже если one-shot
  в новом sandbox'е свободен — это и есть CU118-FE2).
* R9: BR-8 createCombat БЕЗ opts.efirMet → поведение старое — НЕ лезть
  в этот тест «подправить» (он — пин обратной совместимости).

## 6. Красные тесты (map, GREEN-фаза делает их зелёными)
tests/combat-ui.test.js (vm, loadCombatUi, scene84):
* CU118-FX: scene84({efir:true}); тик ДО — drawCalls без 'arc',
  c._fx.breath === undefined; hero.hp = 10; u.mp = 20; c._rng = () => 0.99;
  press Space → c.efirBreathed === true, c.log содержит «Вдох Эфира!»,
  c._fx.breath = {at, until} (until = at + 600); tickSlice → drawCalls
  содержит 'arc', styledCalls — '#8cf2fc' и 'rgba(140, 242, 252, 0.25)';
  `c._fx.breath.until = NOW84 - 1` → следующий тик — новых 'arc' нет;
  повторный Space (mp 0) — новых заявлений fx нет (one-shot ядра).
* CU118-FX-негатив: полный HP / u.mp = 19 / смена без withEfir →
  c.efirBreathed undefined, c._fx без .breath, 'arc' нет.
* CU118-LOG: белая каталогизация ВНУТРИ теста `G.combatInternals.allySpells
  = require('../src/spells-data.js').SPELLS_BY_ID` (restore в finally);
  heal: hero 17/25 (mostWounded 0.7 → 17.5), волк d > 4 → «Эфир
  исцеляет Флогистон (+6).»; cast: книга ['spark'], волк d 2 →
  «Эфир: «Искра» — Волк: 5.»; touch: книга [], волк d 1 →
  «Касание духа: 4.» (значения — пересчитать в GREEN-фазе по ядру,
  паттерны — канон).
* CU118-HUD: scene84({efir:true}) + addMerc84 → .combat-state
  textContent содержит «Отряд:», «Эфир», «поддержка», «Орк»,
  «дальний бой»; смена БЕЗ союзников → «Отряд:» отсутствует.
* CU118-FE1 (GUARD, уже зелёный): свежий sandbox, бой 1 — LINE
  «Эфир материализуется рядом с Флогистоном…» (U+2026) в c.log;
  закрыть, бой 2 — LINE нет.
* CU118-FE2 (красный, вариант a): СВЕЖИЙ sandbox, startCombat
  opts.efirMet: true → LINE нет (one-shot свободен, но флаг режет shov).
tests/save.test.js (e2e, bootWithSave):
* CU118-SAVE: bootWithSave(st, null, {day:1}) → drain → c =
  __game.actions.startCombat(0) → LINE в c.log → winListeners
  ['beforeunload'][0]() → saved.data.efir_met === true, version === 1;
  bootWithSave(st2, null, saved.data) → state.efirMet === true →
  startCombat(0) → LINE НЕТ; seed {efir_met:true} → без линии;
  {efir_met:'junk'} → state.efirMet === false + warns упоминает
  'efir_met'.
Красных: 5 (FX, FX-негатив, LOG, HUD, FE2) + SAVE + FE2… итого 6 красных
тестов + 1 зелёный guard (FE1).

## 7. План по файлам (ожидаемый дельта строк)
* src/combat.js: ~15–20 (3 литерала, shov-условие + JSDoc + комменты).
* src/combat-ui.js: ~70–85 (BREATH_FX_MS, ctx.breathedPrev, edge-detect
  ~8, drawBreathFx ~40–50 + вызов, строка Отряда ~10, efirMet-проходка ~5).
* src/main.js: ~35–40 (let ~4, collectSaveData ~4, restore ~12,
  noteEfirCombat ~8, 3×(opts ~2 + вызов ~1), state ~3).
* tests/combat-ui.test.js: +~200 (6 тестов).
* tests/save.test.js: +~80 (2 теста).
* tests/combat.test.js: 4 пина + 1 guard (GREEN).
* tests/efir.test.js: 2 пина + 2 сообщения (GREEN).
* memory/000118-efir-combat-ux.md + memory/000118-combat-ux-efir.md.
* CHANGELOG.md: 1 буллет (стадия мержа, 2026-10-04, игрока-ориентированно).
* НУЛЬ: src/efir.js, index.html, assets/, src/save.js,
  src/global-settings.js.

## 8. Регистр рисков
R1 двойная преграда (см. §5) — безопасное направление.
R2 hero-действие режет c._fx.breath досрочно — косметика, задокументировать.
R3 main.js — горячий файл — региональная изоляция.
R4 efir_met всегда пишется — пинов полноты ключей НЕТ.
R5 пересечение с 000119 по файлу combat.test.js — union по регионам.
R6 stateEl +1 строка — pre-line, без высоты — безопасно.
R7 vm-детали breath (mp после startCombat, hp 10/25, c._rng) — см. §5.
R8 e2e «второй бой» = новый sandbox + флаг через сейв — паттерн 000115 V2.
R9 BR-8 — пин обратной совместимости, НЕ править.
R10 определяемость: opts.efirMet / c._fx.breath / d.efir_met — все
опциональные, отсутствующие = старое поведение (бит-в-бит).
