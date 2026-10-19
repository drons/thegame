# 000227 — БОЙ: кнопка последнего заклинания из книги + счётчик остатка (Флогистон, Эфир, союзные NPC)

**СТАТУС: РЕАЛИЗОВАНО (станция имплементации выполнена). H1–H13 в
src/combat-ui.js + autoSpellFor в src/combat.js, SVG в assets/,
ре-пины + спек D14 + SPEC_FILE_LINES — всё зелёное (2613/2613).**
Worktree `.worktrees/task-000227`, ветка `task/000227`, база master 28fb20a
(чистая, baseline npm test = 2602/2602 зелёные).
ТЗ `tasks/pending/000227.md` (4 строки, секций нет):

> Флогистону, Эфиру и союзным NPC добавить кнопку применения последнего
> выбранного заклинания из книги заклинаний. На этой кнопке, как и на
> остальных, отображать число, сколько осталось раз применить в этот ход.
> Похожие кнопки у Эфира (четырёхлучевая звезда) и у Миры (крест лечения)
> уже есть, их надо немного переделать.

Анализы: /tmp/thegame-wf-000227/a1-domain.md, a2-arch.md, a3-tests.md
(расхождения между ними решены ниже — этот файл — ИТОГОВОЕ решение).

## 0. Станция красных тестов (выполнена)

* 11 красных: 8 vm CU227-* (BUILD/PLAYER/EFIR/MERC/BADGE/FLEE/RESET/
  YIELD) — блок `// ===== Задача 000227` в СЕРЕДИНЕ
  tests/combat-ui.test.js (перед якорем `// ===== 000193.01`, НЕ в
  EOF — параллельная 000226 пишет в хвост файла) + 3 node
  autoSpellFor (AF-1/AF-2/AF-3, EOF tests/combat.test.js).
* Краснота — осмысленная (функциональности нет, не окружение):
  vm — assert.ok на отсутствии кнопки lastSpell / бейджа
  .combat-actcount на cast+heal (CU227-BUILD падает на
  «8 кнопок … : 7»); node — TypeError «C.autoSpellFor is not a
  function» (прецеденты 000132/000155/000167).
* Зелёные guard ВНУТРИ красных тестов (проходят и до, и после
  имплементации — часть того же test()): CU227-EFIR(a) legacy
  strongestKnown бит-в-байт («Эфир: «Искра» — Волк: 6.», сцены
  CU178-CAST), CU227-MERC(a) legacy mostWounded+strongestKnown
  (отказ «не хватает маны (6)» при light_heal/мана 5), CU227-FLEE —
  открытая flee-диалог + проглатывание 000210 (краснота — только
  assert.ok на lastSpell после зелёных кликов cast/K/H).
* Фикстуры (self-contained, mid-file): scene227 = копия scene178 +
  withAllySpells (scene178 НЕ грузит ally-spells.js — книга на ходу
  Эфира/Медика идёт через G.AllySpells, паттерн CU179) + heroSpells;
  scene227yield = копия scene166 + hero.spells ['resurrect','spark']
  (yield D8). Выбор БЕЗ каста — цикл отказа (D3): whitebox
  mp < мана строки → KeyQ → клик строки → 1 строка причины, трат
  НЕТ, книга открыта → выбор записан после H10.
* РАСХОЖДЕНИЕ код-дизайн (исходник правды — код):
  src/ally-spells.js L333 пишет `${u.name} лечит себя (+${amount}).`
  (НЕ «лечит Медика» из заметки D15) — CU227-MERC(p) закреплён на
  дословном «Медик лечит себя (+6).» (формула: (4 + 0.5·0 + 2)·1 = 6,
  Медик level 2, attrs.wisdom 0).

## 1. Решения (Q1–Q4 + расхождения анализов; «решение — почему»)

* **D1. Архитектура: UI-only + 1 аддитивный чистый экспорт в ядре.**
  Всё новое (состояние, обработчики, chk, бейджи, видимость) — в
  `src/combat-ui.js`; `src/combat.js` — только НОВАЯ чистая
  `autoSpellFor(u, action)` → spell id | null (обёртка strongestKnown
  по id; 0 изменения поведения, 0 полей c, 0 c._rng). — Ядро
  (canDoAction 'cast'/'heal', efirCastAction, allyHealAction, c.cast/
  c.heal, детерминизм/сейвы/RNG) — бит-в-бит; UI-слою нужен
  strongestKnown для бейджа на legacy-пути, а хардкод/дублирование
  логики выбора отклонены (коммент combat.js L2501-2509: хардкоды пулов
  отменены).
* **D2. Состояние выбора — module-level `let lastSpells = {}` в
  combat-ui.js** (рядом с `countEls`, L169). Ключи: `'player'` (игрок)
  и `u.id` (союзник) → spellId. Сброс `lastSpells = {}` в ТРЁХ точках,
  как countEls: build() L279, finish() L2510, catch startCombat L2719.
  — Выбор — UI-состояние (ТЗ «в этот ход»), бой не сериализуется
  (save.js поля combat не имеет — save-safe), `c.player` —
  персистентная шита, мутацией не трогаем (сэйв-формат не меняется).
* **D3. Момент выбора — в `castRow`, ПОСЛЕ `spellbookUnitGate`, ДО
  попытки каста.** Записывается на ЛЮБОЙ тап по строке, прошедшей
  гейт, независимо от исхода каста (отказ «нет маны» — выбор
  остаётся). Строка «Воскрешение» в книге — тоже записывается (это
  заклинание из книги; цель — авто по ядру 000163, бит-в-бит с
  книжной строкой). Кнопка «Воскрешение» (resurrectCast) выбор НЕ
  устанавливает (не «из книги» — автономный один-тап-путь 000171).
  — «выбранное» = намерение; кнопка — повторный путь после отказа
  (игрок видит причину, чинит, жмёт кнопку).
* **D4. БЕЗ выбора — LEGACY-ФОЛБЭК (ключевое решение; a2-альтернатива
  ОТКЛОНЕНА).** Клик «Каст»/«Лечение» и K/H: есть выбор →
  `castRow(c, выбранный)` (книжный путь целиком); НЕТ выбора →
  ТЕКУЩЕЕ поведение (Эфир — strongestKnown('урон'), наёмник —
  strongestKnown('лечение') на mostWounded). У Флогистона legacy-
  пути НЕТ: кнопка lastSpell без выбора — disabled + НОВАЯ строка
  «нет выбранного заклинания» (только наша кнопка). — ТЗ «немного
  переделать» + инвариант «семантических правок существующих тестов
  нет»: CU178-CAST/HEAL (лог/мана/пулы), CU178-OFF, 000168-UI-2
  (KeyK), 198-UI-3 — все сцены БЕЗ выбора → бит-в-бит зелёные.
  Отклонённая альтернатива (a2: «заклинание не выбрано» на всех
  трёх) = семантические ре-пины CU178-CAST/HEAL + деградация
  тач-пути 000178 (свежий бой — кнопка мёртвая, пока не открыл
  книгу) — «больше, чем просит ТЗ».
* **D5. Клавиши K/H СЛЕДУЮТ за кнопкой (тап = клавиша 1:1, 000178 /
  одно действие — одно поведение, 000037).** KeyH: тело ветки
  (L883-893) → `lastSpellPress(c, 'heal')` (условие ветки без
  изменений: `c.phase==='player' && !c.result && activeUnit(c)`).
  KeyK: НОВАЯ dedicated-ветка `code==='KeyK' && activeIsEfir(c)`
  (до lookup таблицы, стиль 000168 D9/P4) → `lastSpellPress(c,
  'cast')`; СТАРЫЙ remap KeyK→'cast' (L905-907) УДАЛЁН. Без выбора —
  бит-в-бит с текущим (та же предпроверка/строки/ядро); с выбором —
  выбранный. — Контракт «КНОПКА = КЛАВИША» не ломается: иначе после
  выбора кнопка и клавиша расходились бы (тап = spark, K =
  fireball — баг). Ноль влияния на существующие пины (все K/H-сцены
  без книги). Таблица combat-keys.js НЕ ТРОГАЕТСЯ (KeyK='attack'
  frozen; KeyH в таблице нет — как было).
* **D6. Q1 (объём «союзным NPC»): кнопка «Лечение» — у ЛЮБОГО
  наёмника с непустой книгой.** Гейт build(): `kind==='merc' &&
  spells.length>0` (было `role==='support' && kind==='merc'`);
  видимость: activeIsSupportMerc → activeIsMercWithBook. — ТЗ
  «союзным NPC» без оговорок (множественное): ranged-лучник
  (найм 120, ['spark','frost_bolt']) — союзный NPC с книгой, без
  расширения остался бы без кнопки; melee/shield — книга [] →
  гейт ложится и для них (кнопка без книги бессмысленна).
  Legacy-фолбэк лучника (без выбора) — disabled «недоступно
  активному персонажу» (строка ядра allyCanDo, без изменений) →
  безопасно; после выбора из книги H/кнопка работают. Расширение
  интерпретации ТЗ — зафиксировать в tasks/results.
* **D7. Кнопка Флогистона — НОВАЯ НЕТАБЛИЧНАЯ** (как 000171/000178):
  `dataset.act='lastSpell'` (имя свободно — grep 0; 'cast'/'heal'
  заняты — дубль ломает byAct-локапы), ariaLabel «Последнее
  заклинание» (точная; «Каст» — а2-вариант отклонён: дублирует
  aria Эфира у другого носителя), иконка — НОВЫЙ
  `assets/ui/combat_lastspell.svg` (не переиспользуем
  combat_cast/combat_spellbook — путаница), гейт build():
  `c.player && Array.isArray(c.player.spells) && c.player.spells
  .length>0` (дефолтный герой ['spark','mend'] → кнопка строится в
  ВСЕХ дефолтных сценах → все пины «7 кнопок» → 8; ре-пин мандатен
  ТЗ). — Таблица COMBAT_KEYS заморожена (7 действий; табличная
  кнопка = новая клавиша + ре-пины — прецеденты D10 000168 /
  000178 «кнопок новых в таблицу НЕТ»).
* **D8. DOM-порядок [7 табличных, cast, heal, lastSpell, resurrect]
  + display-yield.** Блок lastSpell вставляется МЕЖДУ блоком
  «Лечение» (L426) и блоком «Воскрешение» (L427) — правило
  «новая включаемая кнопка — ПЕРЕД блоком resurrect» (000178
  §3.3/§7); игрок-кнопки (lastSpell + resurrect) группируются
  вместе. YIELD в render: `lastSpellVis` = false, когда
  `resurrectChk(c).ok`. — Портрет 390×844: 9-я ВИДИМАЯ клетка
  (row 3 col 1) ПОД D-падом; включённая кнопка обязана быть ≤8-й
  видимой; resurrect видна ВЕСЬ бой (без display-тогла, 000171) —
  сценарий «ход игрока + выбор + мёртвый союзник (resurrect
  enabled)» = 9 включённых клеток без yield. С yield: resurrect —
  8-я, lastSpell достижима через книгу (2 тапа). a2-порядок
  [7, lastSpell, cast, heal, resurrect] — геометрически тождественен
  (кнопки никогда не видимы одновременно: cast — только ход Эфира,
  heal — только ход наёмника, lastSpell — только ход игрока), но
  нарушает группировку «после ally-кнопок, перед resurrect»; a1+a3
  за этот порядок. Перебор сценариев (все включённые ≤8-й видимой):
  ход игрока без выбора — 7 (как сейчас, resurrect disabled 8-я);
  +выбор — 8 (lastSpell 8-я, resurrect disabled 9-я — допустимо по
  §3.3); +выбор+resurrect enabled — yield → 8; ход Эфира/наёмника
  — 8 (cast/heal 8-я, lastSpell скрыта, resurrect disabled 9-я);
  ход моба — 7+resurrect disabled.
* **D9. Видимость lastSpell: `display=''` ТОЛЬКО когда
  `c.phase==='player' && !c.result && unitOf(c)===c.player &&
  lastSpells.player && !resurrectChk(c).ok`; иначе 'none'.** —
  Дефолтный видимый сценарий (7 видимых) бит-в-байт как сейчас;
  кнопка появляется ровно когда есть что применить; ПРОВЕРКА ФАЗЫ
  ОБЯЗАТЕЛЬНА — на ходу МОБА `unitOf(c) === c.player` (activeUnit
  null → фолбэк c.player), без `c.phase` кнопка бы светилась на
  ходу моба.
* **D10. Гашение — `lastSpellChk(c, act)` (спец-кейс в render-цикле
  ДО общего canDoAction, паттерн resurrectChk L1759-1761).**
  Порядок ПРИЧИН фиксирован:
  * 'lastSpell': (1) `c.result` → «бой закончен»; (2)
    `c.phase!=='player'` → «не ваш ход»; (3) `unitOf(c)!==c.player`
    → «недоступно активному персонажу»; (4) нет `lastSpells.player`
    → «нет выбранного заклинания»; (5)
    `G.Spells.canCastSpell(c, sel, {targetId: c.targetId})`
    (G.Spells нет → «Заклинания недоступны», строка rowChk).
  * 'cast'/'heal': `u=unitOf(c); sel = (u && u!==c.player) ?
    lastSpells[u.id] : null;` — есть sel → `rowChk(c, {id: sel})`;
    нет → `G.canDoAction(c, act, {targetId})` (legacy, бит-в-бит).
  — Ядро 'lastSpell' не знает («неизвестное действие» = вечный
  disabled с неверным title, урок 000171); rowChk напрямую для
  кнопки игрока НЕЛЬЗЯ — на ходу союзника его dispatch ушёл бы в
  canCastAllySpell по КНИГЕ СОЮЗНИКА (гейт 3). На ходу владельца
  rowChk = поведение книги: 1 reason — 1 поведение (000037).
* **D11. Единый обработчик `lastSpellPress(c, act)`** — один код для
  кликов ТРЁХ кнопок и клавиш K/H: (1) `if (fleeOpen) return;`
  (ВОСЬМОЙ входной пункт 000210/000216); (2) `lastSpellChk` —
  отказ: `logRejection` (ровно 1 строка) + `render()`, действия
  НЕТ; (3) успех: 'lastSpell' → `castRow(c, lastSpells.player)`;
  'cast'/'heal' с sel → `castRow(c, sel)`; без sel →
  `runAction(c, act); render();` (legacy — тело allyBtn).
  `allyBtn` УДАЛЁН (вызывающих нет); thunk'и runAction 'cast'/'heal'
  (c.cast/c.heal) СОХРАНЕНЫ (legacy-путь живой). — castRow =
  ЕДИНЫЙ воронка кастов из книги (000149/000193): диспатч
  player→G.Spells.castSpell / ally→G.AllySpells.castAllySpell,
  _fx cast 300 мс, книга закрывается при успехе, logRejection при
  отказе, render в конце — кнопка ведёт себя КАК книжная строка
  (зеркало rowChk); запись выбора в castRow (D3) идемпотентна для
  повторного каста кнопкой.
* **D12. Бейджи — `.combat-actcount` на ВСЕХ ТРЁХ кнопках**
  (персистентный span, create-once в build, `countEls['lastSpell'/
  'cast'/'heal']`, children кнопки = [img, span]; render — только
  textContent/display, урок 000149). Значение = ОСТАТОК ПУЛА
  заклинания, которое кнопка применит СЕЙЧАС: выбор → `poolKey`
  строки книги (`bookRows(c).find(r=>r.id===sel)` — spellbook.js
  уже отдаёт poolKey: intelligence→spellInt, иначе spellWis,
  зеркало efirPool); без выбора → legacy-спелл
  (`G.autoSpellFor(u, 'урон'/'лечение')`) → его строка; источник
  пула: игрок `c.ps`, Эфир `c.efs` (null-guard), наёмник `u`.
  Неизвестного спелла нет (лучник без лечения legacy) или кнопка
  скрыта → display 'none' + text '' (конвенция 000199: «нет пула»
  ≠ «0»). «0» ВИДИМО (D3/D4 000199 — паритет с «Ударом»).
  `actionCounts(c)` получает поле `spellBtn` (ОДИН чистый расчёт на
  render, контракт 000199). — ТЗ «как и на остальных, отображать
  число»: конвенция бейджей 000199 = остаток ПУЛА (мана — на
  отдельной MP-полосе 000199); a3-альтернатива min(пул,
  floor(мпа/маны)) отклонена (отступает от конвенции).
* **D13. Новый SVG — `assets/ui/combat_lastspell.svg`.** 24×24,
  `viewBox="0 0 24 24"`, ОДИН `<path>` fill `#e8dcc0`; Силуэт:
  ромб-«рунический камень» (вершины 12,2 / 22,12 / 12,22 / 2,12) с
  круглым ядром-вырезом в центре (evenodd-подпуть) — «сохранённое
  заклинание»; не конфликтует с четырёхлучевой звездой (cast),
  крестом (heal), открытой книгой (spellbook), мечом (attack). —
  Система иконок 000124: flat моно-#e8dcc0; ОБЯЗАТЕЛЬНО пройти
  tests/svg.test.js (well-formed + root + xmlns + viewBox + без
  NaN) ДО записи в assets/; ре-пин `'ui': 11→12`.
* **D14. Спек — 3 файла + SPEC_FILE_LINES + wording-ре-пин**
  (прецеденты 000178/000193/000199 — спек обновлялся в том же
  коммите; после задачи старые формулировки лгут):
  * `spec/efir-spirit.md` L62-64: K-буллет → «последнее выбранное
    из книги урон-заклинание (K; до выбора — сильнейшее известное,
    000227)»; определение «Сильнейшего» (L64-66) остаётся
    (описывает фолбэк).
  * `spec/companions.md`: H-буллет (wording-пин
    spec-mobs-companions-efir-wording L119-126) → «…000227:
    последнее выбранное из книги, до выбора — самый раненый»;
    «support-наёмник лечит самого раненого из [игрок, союзники]» →
    квалифицируется «до выбора из книги»; + кнопка — у любого
    наёмника с книгой (D6).
  * `spec/spells.md` секция «## Книга заклинаний»: НОВЫЙ буллет —
    кнопка «Последнее заклинание» (Флогистон/Эфир/наёмник с книгой):
    тап/K/H применяет последнее заклинание, выбранное кликом по
    строке книги (выбор — на попытке, независимо от исхода, 000227);
    число на кнопке — остаток пула по «атрибуту»; до выбора — как
    раньше (сильнейшее известное / самый раненый, 000178/000168).
  * `tests/spec-split.test.js` SPEC_FILE_LINES: пересчёт 3 строк
    (companions.md 117→?, efir-spirit.md 144→?, spells.md 98→?).
* **D15. КРАСНЫЕ тесты — 8 vm CU227-\* в НОВОМ блоке
  `// ===== Задача 000227` ВНУТРИ tests/combat-ui.test.js: ПОСЛЕ
  блока CU199.01 (заканчивается ~L7175), ПЕРЕД якоря `// =====
  000193.01` (L7177). НЕ в EOF: EOF занят 000210/000216 и
  параллельной 000226 (append-конфликт).**
  1. CU227-BUILD: дефолт scene84 — 8 кнопок; lastSpell: act,
     иконка combat_lastspell.svg (файл существует), aria «Последнее
     заклинание», children [img, span.combat-actcount], display
     'none' (выбора нет); hero.spells=[] — 7 кнопок, lastSpell нет
     (гейт).
  2. CU227-PLAYER: без выбора (ход игрока) — display 'none' +
     стаб-клик → ровно 1 строка «нет выбранного заклинания», трат
     НЕТ; KeyQ → тап строки 'spark' (каст, запись выбора) → кнопка
     display '' + enabled, бейдж = c.ps.spellInt; клик → каст,
     spellInt 1→0, бейдж «0» видимо; исчерпано → disabled +
     «действий «Заклинание» (Интеллект) больше нет».
  3. CU227-EFIR: scene178({efir,spells}); white-box
     u.spells=['spark','frost_bolt'] (frost_bolt — fallback, мана
     4 > 3): (a) БЕЗ выбора клик cast → legacy «Эфир: «Искра» —
     Волк: 6.» (guard, зелёный и до имплементации — strongestKnown
     = spark единственный урон в ['spark','mend'] дефолта —
     сцена с дефолтной книгой); (b) выбор 'spark' из книги →
     клик cast → «Искра» (НЕ frost_bolt = краснота до
     имплементации), efs.spellInt 1→0, u.mp 11→8; (c) бейдж cast:
     без выбора = legacy-пул (autoSpellFor → frost_bolt →
     spellInt), с выбором = spellInt, после каста «0».
  4. CU227-MERC: scene178({spells, roster: ROSTER_MEDIC}), ход
     медика (паттерн CU178-HEAL); white-box u.spells=
     ['mend','light_heal'], u.mp=5: fallback strongestKnown('лечение')
     = light_heal (6 маны > 5 → отказ); выбор 'mend' → клик heal →
     castAllySpell САМО-цель (000193 Д-Ф): «Медик лечит Медика
     (+N).», u.mp 5→2, u.spellWis 1→0, бейдж heal «1»→«0»
     (краснота: до имплементации — отказ/mostWounded).
  5. CU227-BADGE: бейджи на всех трёх (children [img, span]);
     значение — остаток пула АКТИВНОГО по атрибуту текущего
     спелла (white-box c.ps.spellInt=3 → «3»; игрок mend →
     spellWis); «0» видимо; скрытая кнопка (чужой ход) → display
     'none' + text '' (паттерн CU199-BTN-BOOK(b)).
  6. CU227-FLEE: fleeOpen (паттерн 000210) → клики всех трёх +
     K/H: 0 кастов, 0 трат, 0 строк, 0 c._rng.
  7. CU227-RESET: выбор сделан → новый startCombat (пересборка) →
     lastSpells очищен: display 'none', стаб-клик → «нет выбранного
     заклинания» (выбор не живёт между боями).
  8. CU227-YIELD: scene166({deadAllies:1, resurrect:true}) +
     hero.spells=['resurrect','spark'], выбор 'spark' → resurrect
     enabled (мёртвый союзник) → lastSpell display 'none' (yield
     D8), resurrect display '' + enabled.
  Плюс NODE-тесты autoSpellFor (EOF tests/combat.test.js, 3 шт.):
  Эфир ['spark','mend'] → 'урон'='spark' / 'лечение'='mend';
  ['spark','frost_bolt'] → 'урон'='frost_bolt' (max маны,
  тай-брейк id) / 'лечение'=null; пустая книга / id вне каталога →
  null (паттерн CB-6 strongestKnown).

## 2. Что добавлено/перенесено (карта изменений, file:line)

ЕДИНСТВЕННЫЕ src-файлы: `src/combat-ui.js` (~13 hunks, +~120 строк)
и `src/combat.js` (+~6 строк: `function autoSpellFor(u, action)`
ПОСЛЕ strongestKnown L2498 — `const s = strongestKnown(u, action);
return s ? s.id : null;` + имя в return-объекте Game). Новый ассет:
`assets/ui/combat_lastspell.svg`. index.html — 0 строк (CSS
`.combat-actcount` уже есть; скриптов нет — index-order зелёный).

`src/combat-ui.js`:
* H1 ~L193: `let lastSpells = {};` (блок модульных ссылок, рядом с
  quickSig; countEls L169).
* H2 build() L279: `lastSpells = {};` рядом с `countEls = {};`.
* H3 build() блок «Каст» L389-408: клик → `lastSpellPress(c,
  'cast')`; + span `countEls['cast']` (children [img, span]).
  Гейт/иконка/aria — БЕЗ ИЗМЕНЕНИЙ.
* H4 build() блок «Лечение» L409-426: гейт → `u.kind==='merc' &&
  Array.isArray(u.spells) && u.spells.length>0`; клик →
  `lastSpellPress(c, 'heal')`; + span `countEls['heal']`.
  Иконка/aria — БЕЗ ИЗМЕНЕНИЙ.
* H5 build() НОВЫЙ блок lastSpell МЕЖДУ L426 и L427 (гейт D7,
  иконка/aria/act/click/бейдж/`style.display='none'`).
* H6 render-цикл L1758-1765: `const r = resurrect ?
  resurrectChk(c) : (act lastSpell|cast|heal) ? lastSpellChk(c,
  act) : G.canDoAction(...)`.
* H7 render-цикл L1771-1773 (display): castHealVis — ветка heal →
  activeIsMercWithBook; + `else if (act==='lastSpell') b.style.
  display = lastSpellVis(c) ? '' : 'none';`.
* H8 render-цикл L1784-1803 (бейджи): НОВАЯ ветка ДО
  spellbook-fallback: act lastSpell|cast|heal → `b.style.display
  === 'none' || actCnt.spellBtn == null` → none+'' иначе
  `String(actCnt.spellBtn)`.
* H9 actionCounts L1921-1936: + поле `spellBtn: spellBtnOf(c)`
  (хелпер: unitOf → sel (lastSpells) || (не игрок: G.autoSpellFor)
  → row из bookRows → source[poolKey]; игрок без выбора → null;
  typeof-guard G.autoSpellFor → null).
* H10 castRow L2081-2084 (после гейта, ДО `let r;`):
  `lastSpells[u === c.player ? 'player' : u.id] = spellId;`
  (u = unitOf(c), вынесен до ветки).
* H11 handleCode L883-907: тело KeyH → `lastSpellPress(c, 'heal')`;
  НОВАЯ ветка `else if (code==='KeyK' && activeIsEfir(c)) {
  lastSpellPress(c, 'cast'); }`; remap L905-907 УДАЛЁН.
* H12 хелперы ПОСЛЕ resurrectCast (~L2193, НЕ после
  canResurrect/activeIsEfir — там hunk 000168, урок 000171 §8.2):
  `lastSpellPress`, `lastSpellChk`, `lastSpellVis`,
  `activeIsMercWithBook` (переименование activeIsSupportMerc —
  единственный вызывающий castHealVis), `spellBtnOf`; `allyBtn`
  УДАЛЁН.
* H13 finish() L2510 + catch L2719: `lastSpells = {};` рядом с
  `countEls = {};`.

Тесты/спек/ассеты:
* tests/combat-ui.test.js — блок 000227 (D15) + РЕ-ПИНЫ (раздел 5).
* tests/combat.test.js — 3 node-теста autoSpellFor (EOF).
* tests/spellbook.test.js — SB1 L247: 7→8.
* tests/svg.test.js — L464 `'ui': 11→12`.
* tests/spec-split.test.js — SPEC_FILE_LINES (3 файла).
* tests/spec-mobs-companions-efir-wording.test.js — H-буллет.
* spec/efir-spirit.md, spec/companions.md, spec/spells.md (D14).
* memory/000227-combat-last-spell-button.md (этот файл).
* CHANGELOG.md — ОТОБРЕЛЫЙ коммит (D17).

## 3. Контракты и границы

* Кнопка = книжная строка: lastSpellPress с выбором вызывает
  castRow → те же причины/траты/лог/FX, что тап по строке (1
  reason — 1 поведение, 000037); predcheck (lastSpellChk) —
  зеркало rowChk (1 строка причины при стаб-клике, ДЕЙСТВИЯ НЕТ,
  трат НЕТ, 0 c._rng).
* Кнопка = клавиша: lastSpellPress — общий код клика и K/H
  (000178); dedicated-ветки keydown ДО lookup таблицы (000168
  D9/P4-прецедент); таблица combat-keys.js не меняется.
* Legacy-бит-в-бит: во ВСЕХ состояниях без выбора (кнопки, K/H,
  гашение, бейджи-legacy) поведение = master 28fb20a — CU178-*,
  000168-UI-2, 198-UI-3, CU196-CAST зелёные без правок.
* Ядро — контракты: efirCastAction/allyHealAction/strongestKnown/
  c.cast/c.heal/allyCanDo — без изменений (strongestKnown
  используется также auto-rescue ядра L2613/2637/2659). AI
  (efirTurn/allyAct) НЕ вызывает c.cast/c.heal — blast radius 0.
* Сейвы: lastSpells — замыкание UI, в save.js не уходит (полей
  combat нет); c.player не мутируется; 0 новых полей c, 0 c._rng.
* Дегрaдация: G.autoSpellFor нет (битый порядок — нереалистичен,
  combat.js = ядро) → typeof-guard → legacy-бейдж скрыт (нет
  краха); G.Spells нет → «Заклинания недоступны» (строка rowChk);
  G.AllySpells нет → «недоступно активному персонажу» (строка
  rowChk).
* Resurrect: кнопка/строка книги/маркеры — без изменений; строка
  «Воскрешение» в книге ДОПУСКАЕТСЯ как выбор (D3) — цель авто по
  ядру 000163 (spells.js evalSpell: targetId не мёртвый союзник →
  find первого мёртвого союзника), кнопка lastSpell ведёт себя
  бит-в-бит с книжной строкой.
* Flee (000210/000216): fleeOpen-гард ПЕРВОЙ строкой
  lastSpellPress — 8-й входной пункт (таблички, allyBtn→
  lastSpellPress, resurrectCast, castRow, handleCode, KeyH-ветка
  → lastSpellPress, quickItem).

## 4. Ре-пины (ТЗ-обусловленные/технические — полный список)

tests/combat-ui.test.js:
* L337-344 «7 штук»: 7→8 + 'lastSpell' в deepEqual (sort).
* L1167-1215 (000124): 7→8; цикл byAction[b.dataset.act] —
  спец-ветка для 'lastSpell' (НЕ из describeCombatKeys: иконка
  exists, aria «Последнее заклинание», бейдж-child существует,
  textContent бейджа в дефолте '' — читать как child, ВНИМАНИЕ:
  vm-стаб не пересчитывает button.textContent из children).
* L4410 (CU171-GATE): 7→8.
* L5347/5354 (CU178-GATE, обе сцены): 7→8.
* L5542-5548 (CU182-BTN8): 8→9; [...'endTurn', 'lastSpell',
  'resurrect'] (scene166 hero.spells=['resurrect'] ≠ пусто →
  гейт lastSpell истинен).
* L5912-5918 (CU182-ORDER): 10→11; [...'endTurn', 'cast', 'heal',
  'lastSpell', 'resurrect'].
* L5140 (CU178-CAST) / L5256 (CU178-HEAL): children 1→2 (img +
  span) — ЕДИНСТВЕННАЯ правка этих тестов (поведение legacy —
  без изменений, D4).
* L7015-7021 (CU199-BTN-BOOK (c)): skip-list «бейджа НЕТ» +=
  'cast', 'heal', 'lastSpell' (у всех трёх теперь span; resurrect —
  БЕЗ бейджа, как был).
* L8329 (CU210-POS): 7→8.
ЗЕЛЁНЫЕ БЕЗ ПРАВОК: CU178-VIS/CAST-OFF/HEAL-OFF, 000168-UI-2,
198-UI-3, CU196-CAST, CU182-VIS-MOB/GATE-ORDER/NOSP, CU199-ATK/
BOOK(a)(b)/000199.01-*, CU171-* (поиск по dataset.act), CU210-*
(прочие), ally-spells N1-N7/CU193-*, spells/combat/efir ядро,
SB2-SB14/SB7, combat-keys L239, index-order, combat-layout,
e2e-цепи (пинов панели нет, проверено grep).
tests/spellbook.test.js L247 (SB1): 7→8 (остальные ассерты —
сцена без Эфира/наёмников — верны).
tests/svg.test.js L464: 'ui' 11→12.
tests/spec-split.test.js: SPEC_FILE_LINES companions/efir-spirit/
spells — пересчёт по факту правки.
tests/spec-mobs-companions-efir-wording.test.js L119-126: H-буллет
(новая фраза 000227) + «самого раненого»-каллифкатор (если
закреплён — grep 'самого раненого' в этом файле на имплементации).

## 5. Ленивые ссылки и guards

* `const G = globalThis.Game` (L91) — снапшот ОДИН раз (000038):
  новый экспорт combat.js виден (порядок combat.js → … →
  combat-ui.js закреплён tests/index-order.test.js — не трогаем).
* `G.autoSpellFor` — typeof-guard в spellBtnOf (деградация:
  бейдж legacy скрыт; не console.error — combat.js = ядро, без
  него Game нет).
* `G.Spells.canCastSpell` — typeof-guard в lastSpellChk (строка
  «Заклинания недоступны», паттерн rowChk).
* `G.AllySpells` — rowChk/castRow несут свои guards
  (allySpellsWarned) — не дублируем.
* `c.efs` — null-guard в spellBtnOf (degradation-сцены).
* resurrectChk(c) в lastSpellVis — чистое чтение, двойной вызов на
  render допустим (render — каждый кадр, steady-state дешёв).

## 6. Что важно будущим задачам

* **000226 (параллельная, «анимация применения заклинаний») пишет
  в EOF tests/combat-ui.test.js** — блок 000227 ВНУТРИ файла
  (якорь `// ===== 000193.01`, L7177) — при мерже/ребейзе
  учитывать (см. также 000221-000232 в pending).
* Клавиши K/H — dedicated-ветки в combat-ui.js (таблица
  combat-keys.js НЕ менялась, SB7/combat-keys зелёные);
  KeyK='attack' в таблице — фолбэк на ходу не-Эфира (игрок бьёт
  мечом по K — как было).
* `lastSpells` — per-бой (сброс build/finish/catch), между боями
  НЕ живёт; c.player — шита (не мутировать под состояние UI).
* Гейт heal-кнопки ОБЩЁН (D6): будущие сцены с ranged-лучником
  (найм 120, ['spark','frost_bolt']) в rosterData ДО build —
  «Лечение» построена; на ходу лучника до выбора — disabled
  «недоступно активному персонажу» (строка ядра), после выбора —
  каст из книги. addMerc84-ПОСЛЕ build гейт не проходит
  (build-статичность, 000178 §3.4) — как у cast/heal раньше.
* Бейдж-конвенция 000199: бейдж = остаток ПУЛА (не маны);
  «нет пула» ≠ «0» (скрыт); «0» видимо. `actionCounts().spellBtn`
  — единая точка расчёта на render.
* D-pad-геометрия (memory/000178 §3.3): включённая кнопка ≤8-й
  видимой; 9-я (row 3 col 1) под D-падом; yield lastSpell→
  resurrect (D8) — при будущих кнопках повторить перебор сценариев.
* `efirCastAction`/`allyHealAction` — после задачи UI-вызывающих
  только legacy-пути (c.cast/c.heal через runAction); auto-rescue
  ядра (strongestKnown L2613/2637/2659) — живой; очистка/рефактор
  — отдельная задача (ретро).

## 7. Подводные камни (VM + ре-пины)

* vm-стаб: button.textContent НЕ пересчитывается из children —
  бейдж читать как child (`b.children.find(ch => ch.className ===
  'combat-actcount')`, паттерн badgeOf199 L6539); НОВЫХ
  ассертов `b.textContent === ''` на кнопках с бейджем не писать
  (ложь в реальном DOM).
* стаб querySelectorAll('.combat-actions button') — ВСЕ кнопки
  песочницы — искать по dataset.act (byActOf178).
* стаб-клик работает на disabled/hidden (listeners.click[0]()) —
  предпроверка гарантирует 1 строку (паттерн CU178-OFF).
* Сцены с Эфиром/наёмником — отряд через `efir`/`rosterData` ДО
  startCombat (гейты build() статичны; addMerc84-после build НЕ
  проходит).
* `unitOf(c) === c.player` на ходу МОБА (activeUnit null →
  фолбэк c.player) — видимость lastSpell требует ПРОВЕРКИ ФАЗЫ (D9),
  иначе кнопка светится на ходу моба.
* Rebase-конфликты: hunk'и combat-ui.js (build L350-448,
  render L1758-1803, хелперы ~L2193, resets L2510/L2719) —
  параллельные 000221-000232 могут трогать combat-ui; вставки НЕ
  рядом с регионами 000168 (canResurrect/activeUnit/activeIsEfir)
  и 000193 (castRow-тело — вставка H10 минимальна: 2 строки после
  гейта).
* known-флейк «перформанс: 160k tileAt» (tests/map.test.js) —
  протокол: ОДИН полный node --test на worktree (no-parallel-full-
  tests; 000054 мутирует src/npc-data.js), флейк → повтор
  одиночного файла + запись в tasks/results.
* Порядок операций станции имплементации: (1) SVG → svg.test.js
  (красный 11≠12 + валидность) → файл + ре-пин → зелёный; (2)
  красные CU227-* (блок 000227) — красные; (3) H1-H13 +
  autoSpellFor; (4) ре-пины (раздел 4) по одному файлу, полный
  сьют после; (5) спек + SPEC_FILE_LINES + wording → зелёный;
  (6) этот memory-файл; (7) коммит 1 (задача: код+тесты+ассет+
  спек+memory) → CHANGELOG → коммит 2; (8) мерж-стадия:
  .merge-pending «000227» → rebase на master → полный сьют →
  ff-only мерж (без мерж-коммита) → удалить файл.

## 8. Порядок работы станции имплементации

1. Новый SVG → `node --test tests/svg.test.js` (красный: 11≠12 +
   валидность) → положить файл → ре-пин 11→12 → зелёный.
2. Красные тесты: блок 000227 (D15, 8 vm) в combat-ui.test.js +
   3 node-теста autoSpellFor в combat.test.js — красные (осмысленные:
   нет кнопки/бейджа/ветки/состояния).
3. Имплементация: src/combat.js (autoSpellFor + экспорт) →
   src/combat-ui.js H1-H13.
4. Ре-пины (раздел 4) — по одному файлу; после каждого — полный
   сьют `npm test` в worktree (один процесс; параллельно в этом
   worktree НЕ гонять — память no-parallel-full-tests).
5. Спек (D14) + SPEC_FILE_LINES + wording → зелёный.
6. Memory (этот файл — дописать статус РЕАЛИЗОВАНО с hash
   ребейза), tasks/results/000227-*.md (краткий отчёт + расширение
   интерпретации D6), task pending→done.
7. Коммиты (2) → CHANGELOG-коммит → (мерж-стадия: .merge-pending →
   rebase master → тесты → ff-only → удалить файл).

## 9. Станция имплементации — факт (РЕАЛИЗОВАНО)

* src/combat.js: `autoSpellFor(u, action)` — чистая обёртка
  strongestKnown (id | null), экспорт после `activeUnitId`.
* src/combat-ui.js: H1 `let lastSpells = {}` (модульная ссылка);
  H2/H13 reset в build()/finish()/catch startCombat (3 точки, рядом
  с countEls); H3/H4 — клик «Каст»/«Лечение» → lastSpellPress +
  бейдж-спаны countEls['cast'/'heal'] (children [img, span]);
  H5 — НОВЫЙ блок lastSpell МЕЖДУ heal и resurrect (гейт D7,
  иконка combat_lastspell.svg, aria «Последнее заклинание»,
  dataset.act='lastSpell', display 'none'); H6/H7 — render-цикл:
  lastSpellChk-спец-кейс (resurrect → lastSpell/cast/heal →
  canDoAction) + display (castHealVis / lastSpellVis); H8 —
  бейдж-ветка (b.style.display==='none' || spellBtn==null →
  none+'', иначе String(spellBtn)); H9 — actionCounts.spellBtn =
  spellBtnOf(c); H10 — castRow записывает lastSpells после гейта
  (Д3); H11 — handleCode: KeyH → lastSpellPress(c,'heal')
  (условие ветки без изменений), НОВАЯ ветка
  `code==='KeyK' && activeIsEfir(c)` → lastSpellPress(c,'cast'),
  старый remap KeyK→'cast' УДАЛЁН (`const action = entry ? ...`);
  H12 — ПОСЛЕ resurrectCast: lastSpellPress/lastSpellChk/
  lastSpellVis/activeIsMercWithBook (переименование
  activeIsSupportMerc, гейт D6: любой наёмник с книгой; единственный
  вызывающий castHealVis обновлён)/spellBtnOf; allyBtn УДАЛЁН
  (вызывающих нет; thunk'и runAction c.cast/c.heal — live).
  Таблица combat-keys.js НЕ тронута (SB7/combat-keys зелёные).
* ПРАВИКИ КРАСНЫХ ТЕСТОВ (наша же задача, не чужие пины):
  1. CU227-YIELD — 2 ассерта resurrect.style.display: '' →
     notEqual 'none' (vm-стаб: display кнопок БЕЗ display-тогла
     (resurrect, 000171) НЕ ставится кодом — undefined ≠ '';
     D8 «resurrect видна весь бой (без display-тогла)»).
  2. CU178-HEAL-OFF case (c) — roster spells: [] → ['spark']:
     Д6-гейт (кнопка — только у наёмника с НЕПУСТОЙ книгой) убил
     сценарий «пустая книга → disabled «нет лечения»»; пин ядра
     «нет лечения» сохранён (книга с урон-спеллом: раненый есть →
     каталог пуст → «нет лечения»). Контракт §4 ошибочно
     записывал «HEAL-OFF зелёный без правок» — по факту Д6
     требует этот ре-пин (зафиксировано в tasks/results).
* Ре-пины (факт): combat-ui.test.js — «7 штук» 7→8+lastSpell,
  000124 7→8+ветка lastSpell (aria/бейдж ''), CU171-GATE 7→8,
  CU178-CAST/HEAL children 1→2, CU178-HEAL-OFF (c) ['spark'],
  CU178-GATE 7→8 (обе сцены), CU182-BTN8 8→9 [...,'lastSpell',
  'resurrect'], CU182-ORDER 10→11 [...,'heal','lastSpell',
  'resurrect'], CU199-BTN-BOOK skip+cast/heal/lastSpell,
  CU210-POS 7→8; spellbook.test.js SB1 7→8; svg.test.js 'ui'
  11→12; spec-split.test.js SPEC_FILE_LINES: companions 117→119,
  efir-spirit 144→145, spells 98→104; wording:
  spec-mobs-companions-efir-wording (H-буллет → «Лечение наёмника —
  клавиша (H) … 000227: последнее выбранное из книги, до выбора —
  самый раненый; тач-кнопка «Лечение» — 000178/000227: у любого
  наёмника с книгой; …») + spec-combat-wording («support-наёмник
  (до выбора из книги, 000227) лечит самого раненого …»).
* Спек (D14): efir-spirit.md K-буллет; companions.md H-буллет +
  «до выбора из книги» + любой наёмник с книгой; spells.md новый
  буллет «Кнопка «Последнее заклинание»».
* npm test в worktree: 2613/2613 (baseline 2602 + 11 красных,
  ставших зелёными).

## 10. Станция финализации — факт (2026-10-16)

* Полный прогон 1 — 2612/2613 (1 флейк; имя теста потеряно — пайп
  tail обрезал лог); полный прогон 2 — **2613/2613, exit 0** (known-
  флейк map «160k tileAt» — ok 1801). Сьют зелёный.
* Отчёт (tasks/result/000227.md) — секция «Риски ребейза»: master
  на 13 коммитов впереди базы 28fb20a; файлы ветки трогает ТОЛЬКО
  000223 (01034d3) — конфликты: spec/companions.md (общий абзац,
  ручной мерж — обе 000223+000227 формулы + оба wording-пина),
  tests/spec-split.test.js (строка companions.md: 117→119 у обоих,
  решение 121 с объединённым комментом), CHANGELOG.md (master уже
  имеет `## 2026-10-16` — наши буллеты влить в существующую секцию,
  дубль не создавать). Чистый авто-мерж: combat.js/combat-ui.js
  (hunk 000223 comment-only)/combat.test.js (наш EOF)/wording.
  Сьют после ребейза ожидается 2655 (2644 master + 11 наших).

## 11. Закрытие ретро-20261017 finding'ов — задача 000236 (2026-10-19)

Отчёт: tasks/result/000227-retro-20261017.md (анализ на master
38dbd89, отчёт закоммичен 33c3a4b). Все 3 major закрыты 000236
(worktree .worktrees/task-000236; контракты —
memory/000236-retro-combat-k-heal-fx.md; отчёт — tasks/result/
000236.md). Код src/ не менялся (фиксы — SPEC-формулировка +
тесты):
* major #1 (spec/efir-spirit.md L62-63) — K-буллит описывал
  «последнее выбранное из книги урон-заклинание», код
  (lastSpellPress → castRow) кастит последнее выбранное ЛЮБОГО
  типа: буллит переведён на кодовое поведение — «последнее
  выбранное из книги заклинание (K; до выбора — сильнейшее
  известное урон, 000227)» (строково-нейтрально, 145→145,
  spec-split не ре-пинился) + новый wording-пин W236-K (tests/
  spec-combat-wording.test.js, EFIR(); «урон» — только в
  fallback до выбора, strongestKnown). Фильтр «действие»='урон'
  в код НЕ добавлен (D5 000227 — задуманное).
* major #2 (src/combat-ui.js:443) — гейт «Лечение» у любого
  наёмника с книгой был покрыт только негативно (support /
  melee без книги): добавлен позитивный CU236-GATE — Вольк
  (melee, НЕ support), книга ['mend'] в rosterData ДО build:
  кнопка построена, видимость по активному, до выбора disabled
  «недоступно активному персонажу» (стаб-клик: 1 строка, 0
  трат, 0 c._rng), после выбора mend — каст ВЫБРАННОГО кнопкой
  и клавишей H «Вольк лечит себя (+5).», mp 5→2, spellWis 1→0,
  игрок не тронут. «Подводные камни» § (сцена ranged-лучника)
  закрыта в форме melee-Волька (гейт роль-инвариантен, D6).
* major #3 (src/combat-ui.js:963-979) — D5 «кнопка = клавиша
  1:1» с выбором из книги не был нажат в тестах: добавлен
  CU236-KH — Эфир + 'spark' → KeyK → «Эфир: «Искра» — Волк:
  6.» (НЕ strongestKnown «Морозная стрела», −3 маны не −4);
  Медик + 'mend' → KeyH → «Медик лечит себя (+6).» (игрок при
  5 HP — самый раненый — НЕ тронут: каст выбранный, не
  mostWounded).
