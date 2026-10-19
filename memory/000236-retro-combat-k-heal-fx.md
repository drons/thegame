# 000236 — ретро-фикс 000226/000227: SPEC-булит K + 3 coverage-теста combat-книги (контракт станции Проектирование)

## 0. Статус / ссылки

* ТЗ: `tasks/pending/000236.md` (4 major ретро-2026-10-17: отчёты
  `tasks/result/000227-retro-20261017.md` findings 1-3,
  `tasks/result/000226-retro-20261017.md` finding major L1602).
* База: master cd8ebc2; worktree `.worktrees/task-000236`, ветка
  task/000236. Baseline: 2687/2687 (node --test tests/, exit 0, ~197 с).
* Тип: **рефакторинг без смены поведения** — src/ 0 diff, index.html
  0 diff, CHANGELOG нет. 4 фикса = 1 правка SPEC-формулировки +
  1 wording-пин (RED→GREEN) + 3 coverage-теста (зелёные с момента
  написания; падение = регрессия → finding + отдельная задача, код НЕ
  чинить — ТЗ «Ограничения»).
* Анализы: /tmp/thegame-wf-000236/a1-domain.md (домен), a2-arch.md
  (архитектура, якоря #1-#8), a3-tests.md (карта тестов),
  efir-spirit.sim.md (симуляция SPEC-правки — пройдена: new present,
  old absent, хвост-пин цел, 145 строк, (v1)=0).
* Счёт после: 2687 + 4 = **2691 зелёных**.
* **Финализация (2026-10-19)**: задача выполнена, файл в
  tasks/done/. Полный npm test — 2691/2691, exit 0 (перепроверен
  на станции финализации). Коммиты: 7c97946 (красные: тесты +
  контракты), f318d40 (зелёные: SPEC-правка + закрытие +
  pending→done + отчёт), коммит финализации (дополнения отчёта:
  «Подводные камни (для мержа)»/«Файлы (+/−)»/«Как проверяли» +
  этот хвост). На момент финализации master = e3e7891
  (000230.01) — пересечения файлов с diff задачи нет (ребейз
  ожидается чистым; после ребейза — полный npm test).

## 1. Решения станции Проектирование (open questions закрыты)

* **D1 — фикстура GATE-теста: `Вольк` melee, level 1, dmg 1.2, hp 1.1,
  `spells: ['mend']` (новая константа `ROSTER_WOLK_BOOK` в блоке
  000236), книга в rosterData ДО build** — ТЗ прямо допускает «melee-
  или ranged-наёмник»; это прямой позитив/негатив-пар с CU178-GATE
  (тот же Вольк БЕЗ книги → кнопки «Лечение» нет, панель 8) — гейт
  закреплён за персонажем, а не за ролью; минимальная книга ['mend']
  убирает неоднозначность в цикле выбора; +5 (level 1) отличает строку
  лога от Медика (+6). Скеч «Подводных камней» 000227 (ranged
  ['spark','frost_bolt']) — только урон, ТЗ требует выбор ЛЕЧЕБНОГО →
  ТЗ авторитетна (delta зафиксирована в a1 §6).
* **D2 — AURA-тест: кастер — ЭФИР** (`scene226({ efir: true, spells:
  true, allySpells: true })`, без roster; castFx `from: 'efir'`) —
  ближайший к gap 000226 (успешный книжный каст союзника с
  НЕурон-действием; во всём блоке 000226 книжные касты — только spark),
  даёт extra-пин quirk-000226 (efirCast-кадр в окне, heroCast НЕТ),
  не требует roster/Space (pre-roll сам стоп на 'efir').
* **D3 — ранение Эфира в AURA: `G.combatInternals.dealDamageToAlly(c, u, 6)`
  → hp 16→10** (maxHP 16 = 10 + 2·Тел3) — лечение становится
  осмысленным и даёт hp-delta-пин 10→16 (кламп в maxHP); паттерн
  scene227yield.
* **D4 — арк-пины срезов AURA: первично ГЛОБАЛЬНЫЙ «ровно 1 arc за
  срез» + точная аура + точечные негативы**; фолбэк — если первичный
  прогон покажет чужие arc в срезе T+150/T+450, сузить до scoped
  негативов (0 arc на клетке волка (168,216) и в mid (216,216) +
  точная аура), отключив глобальный счёт. Оба варианта фиксируют
  finding (аура есть, полётных/импактных на цели нет). Оправдание
  первичного: steady-state = 0 arc (прецедент CU226-REJ), подсветка
  цели — strokeRect (не arc, combat-ui.js L1370-1374), reach-штриховка
  — lineTo, breath-FX гейтится c._fx.breath (не задан).
* **D5 — значения лечения — точные строки, выверенные по формуле ядра**
  `Math.round((4 + 0.5·attrVal + level)·(1 + 0.15·(степень−1)))`,
  mend: степень 1, атрибут wisdom, мани 3 (assets/spells/000009.json):
  Вольк (level 1, attrs {}) → «Вольк лечит себя (+5).»; Медик (ROSTER_
  MEDIC, level 2, attrs {}) → «Медик лечит себя (+6).» (бит-в-байт
  CU227-MERC); Эфир (level 1, attrs.wisdom = 3 — sheet primary старт
  Инт=Муд=Тел=3, efirAllyData efir.js L379-384) → round(6.5) = 7 →
  «Эфир лечит себя (+7).» + hp-delta 10→16. Если первичный прогон
  даст отклонение от факта — ре-пин по факту (формула — ядра, не
  наша) + запись в tasks/result/000236.md; src/ НЕ трогать.
* **D6 — W236-K: wording-пин НОВОЙ формулировки** в tests/
  spec-combat-wording.test.js (EOF), ассерты по `EFIR()` (norm —
  схлопывает перенос L62/L63): (1) `includes('последнее выбранное из
  книги заклинание (K; до выбора — сильнейшее известное урон, 000227)')`
  — RED до правки; (2) `!includes('последнее выбранное из книги
  урон-заклинание')` — защита от отката, тоже RED до. ЕДИНСТВЕННЫЙ
  RED-тест задачи; осмысленный красный = отсутствие текста SPEC, не
  модуля (прецедент «красное отсутствием» 000181).
* **D7 — SPEC-правка строково-нейтральна (145→145)** —
  `SPEC_FILE_LINES` (tests/spec-split.test.js:106) НЕ ре-пинить;
  гейт-проверка после правки: `wc -l spec/efir-spirit.md` = 145.
  Формулировка — дословно из ТЗ/ретро fixSuggestion; эм-дефис U+2014
  и «» копировать дословно (типографика = ложный красный).
* **D8 — pre-roll**: сцены с Эфиром (CU227-EFIR/CU226-EFIRBOOK) — стоп
  на 'efir' (assert `activeUnitId` сразу после сцены — фикстура); без
  Эфира — стоп на 'player', ОДИН `press(S.keydown,'Space')` → ход 'a0'
  (turnOrder 'm0,player,a0', паттерн CU227-MERC). Допдоходов НЕ надо
  (подтверждено фикстурами-прецедентами).
* **D9 — D3-цикл выбора (общий для всех трёх coverage-тестов)**:
  mp < мани (2 < 3) → `KeyQ` → клик строки → ровно
  `['не хватает маны (3)']` — отказ: трат НЕТ, книга остаётся
  ОТКРЫТОЙ (bookOpen=false только при r.ok), НО выбор ЗАПИСАН
  (lastSpells[u.id] = spellId на любом тапе, прошедшем гейт, 000227
  D3 — castRow combat-ui.js L2342); затем восстановить mp → каст.
  Без записи выбора клавиша ушла бы в legacy — тест обязан доказывать
  именно «выбранный» (strongestKnown/mostWounded НЕ должны сработать).
* **D10 — ID-префикс CU236-** (CU236-GATE / CU236-KH / CU236-AURA;
  wording-пин — W236-K) — прецеденты CU226-/CU227- + номер задачи.
* **D11 — расположение**: блок 000236 — в **EOF** tests/combat-ui.
  test.js ПОСЛЕ CU226-NOMOTION (последний тест файла, L10038); блок
  000227 (середина файла, якорь 000193.01) НЕ трогать. Хелперы
  переиспользовать, не копировать: `loadCombatUi`, `scene226`/
  `scene227`, `press`, `findByClass`, `byActOf178`, `badgeOf199`,
  `arcsAt226`, `fillAt226`, `nameEvIdx226`, `snapC226`, `tickSlice`,
  `makeRafStubs`, `ROSTER_MEDIC` (L5048).
* **D12 — технических правок существующих тестов НЕТ** (a3 §5): ни
  require, ни re-пинов, ни правок ассертов — SPEC-правка
  строково-нейтральна, src/ 0 diff, новых модулей нет.
* **D13 — падение coverage-теста ≠ красная фаза**: фиксировать finding
  в tasks/result/000236.md + создать отдельную задачу; src/ НЕ чинить
  (ТЗ «Ограничения», а2 R8.4).

## 2. SPEC-реворд (finding #1, major 000227)

* Файл: `spec/efir-spirit.md` L62-63 (секция «## Бой»), дословно:
  ```
  -    «Касание духа» (J), последнее выбранное из книги урон-заклинание
  -    (K; до выбора — сильнейшее известное, 000227), лечение и щит —
  +    «Касание духа» (J), последнее выбранное из книги заклинание
  +    (K; до выбора — сильнейшее известное урон, 000227), лечение и щит —
  ```
  («урон» переезжает со 2-й части в 1-ю: K — ЛЮБОГО типа, fallback —
  только урон).
* Код-основания (якоря a2 #1): `lastSpellPress(c,'cast')` (combat-ui.
  js L2477) → `sel ? castRow(c, sel) : runAction(c,'cast')`; `castRow`
  (L2330) записывает `lastSpells[u.id]` на ЛЮБОМ тапе по строке (L2342);
  `castAllySpell` (ally-spells.js) исполняет ВСЕ 6 «действие»
  (KNOWN_ACTIONS L50-51: урон/лечение/защита/ослабление/контроль/
  воскрешение); фильтра по «действие»='урон' в коде НЕТ. Fallback без
  выбора — `strongestKnown(u, 'урон')` (combat.js, булит «Сильнейшее»
  L66-67: макс «мани», тай-брейк id) → отсюда «до выбора — сильнейшее
  известное УРОН».
* Фильтр «действие»='урон' в код НЕ добавлять (D5 000227 — задуманное
  поведение; spec/spells.md L39-44 того же коммита уже согласован:
  «применяет последнее заклинание, выбранное кликом по строке книги»).
* Влияние на пины: К-булит текстом НИГДЕ не пинится (перебор tests/
  a1 §1: только исторический КОММЕНТ в spec-split.test.js:106 и
  тестовые заголовки); H-булит companions.md L41-43 (wording-пин
  spec-mobs-companions-efir-wording.test.js L127) НЕ задевается;
  хвост булита efir-spirit «лечение и щит — из книги …» (пин
  spec-combat-wording.test.js L138) НЕ задевается; «(v1)» не
  добавляется (счётчик 0, L151). Иные spec-файлы НЕ трогать.

## 3. CU236-GATE — гейт «Лечение» у НЕsupport-наёмника (finding #2, major 000227)

* Сцена: `scene227({ spells: true, allySpells: true,
  roster: ROSTER_WOLK_BOOK })`; новая константа в блоке 000236:
  ```js
  const ROSTER_WOLK_BOOK = [{ name: 'Вольк', role: 'melee', level: 1,
    dmg: 1.2, hp: 1.1, skills: [], spells: ['mend'] }];
  ```
  Статисты makeAlly (combat.js L356-431): maxHP = round((8+4)·1.1) = 13,
  mp 5, spellWis 1, spellInt 1, attrs {}, kind 'merc'.
* КРИТИЧНО: книга — в rosterData ДО build: гейт build() (combat-ui.js
  L443-445: `u.side==='ally' && u.kind==='merc' && Array.isArray(
  u.spells) && u.spells.length > 0`) читает u.spells в момент build
  (построенная кнопка не перестраивается; паттерн ROSTER_MEDIC).
* Шаги (ОДИН test(), блоки {}):
  1. `byAct.heal` существует (гейт по ЛЮБОМУ наёмнику с книгой):
     `ariaLabel 'Лечение'`, иконка `assets/ui/combat_heal.svg`.
     Глобальное число кнопок НЕ пинать (у героя дефолтная книга
     [spark, mend] → lastSpell тоже есть; пины строго по dataset.act,
     паттерн byActOf178 / a1 §5-10).
  2. turnOrder 'm0,player,a0' (assert); pre-roll — 'player' (волк m0
     уже отыграл — игрок ранен; паттерн CU227-MERC); на ходу ИГРОКА
     `byAct.heal.style.display === 'none'` (castHealVis L2544: активен
     не наёмник); `press(S.keydown,'Space')` → 'a0' → `display === ''`
     (activeIsMercWithBook L2535); СРАЗУ после Space —
     `c.player.hp = c.player.maxHP` (сброс фикстуры, паттерн
     CU227-MERC блок (b)) — далее игрок НЕ трогается ни одним
     шагом (пины «не изменился» детерминированы).
  3. ДО выбора: `disabled === true`, `title === 'недоступно активному
     персонажу'` ДОСЛОВНО (legacy allyCanDo 'heal', combat.js L2386-
     2413: guard SUPPORT+merc не прошёл → финальный return). Стаб-клик
     (`byAct.heal.listeners.click[0]()` — vm-стаб не гасит disabled,
     паттерн CU227-MERC блок (a)): ровно ОДНА строка лога с той же
     причиной; трат НЕТ (mp 5→5, spellWis 1→1, hp игрока не тронут);
     `0 c._rng` (обёртка-счётчик); ход НЕ сгорел (activeUnitId 'a0').
  4. D3-цикл (D9): `mp = 2` → `KeyQ` → книга открыта, строка 'mend'
     (`bookBox.children.slice(-2).find(rw => rw.dataset.spell ===
     'mend')`) → клик → ровно `['не хватает маны (3)']`; трат НЕТ;
     книга ОТКРЫТА (отказ → bookOpen не сбрасывается); выбор записан
     (последствия — в п.5).
  5. `mp = 5` → render: `disabled === false`, `title ''` (rowChk →
     canCastAllySpell: пул 1 > 0, мана 5 ≥ 3); бейдж (badgeOf199)
     `textContent '1'` (спул spellWis выбранного). Тап кнопки → лог
     ровно `['Вольк лечит себя (+5).']`; `mp 5→2`, `spellWis 1→0`,
     бейдж `'0'` (виден); `0 c._rng`; книга ЗАКРЫТА (r.ok); ход НЕ
     сгорел; `c.player.hp` НЕ изменился (расход — пул/мана НАЁМНИКА:
     c.ps.spellInt/c.player.mp не тронуты).
  6. Блок (b) — КЛАВИША H: НОВАЯ сцена той же фикстуры, те же шаги
     1-4, затем `press(S.keydown, 'KeyH')` → лог ровно `['Вольк лечит
     себя (+5).']`, те же траты (mp 5→2, spellWis 1→0), `0 c._rng` —
     контракт D5 «кнопка = клавиша = 1:1» (handleCode L963-972 →
     lastSpellPress(c,'heal') → sel → castRow).

## 4. CU236-KH — K/H 1:1 С выбором из книги (finding #3, major 000227)

Один test(), два блока. Сцены — `scene227` (фикс. NOW84; FX не пинать).

* **Блок K (Эфир)**: `scene227({ efir: true, spells: true,
  allySpells: true })`; pre-roll стоп на 'efir' (assert); u (3,5),
  wolf m0 (3,4), wolf.maxHP = 100/hp = 100 (запас; auto-target — в
  упор, ЯВНЫЙ selectTarget НЕ нужен — паттерн CU227-EFIR);
  `u.spells = ['spark','frost_bolt']` ПОСЛЕ build (строки книги
  рендерятся live — фикстура CU227-EFIR); assert `u.mp === 11`,
  `c.efs.spellInt === 1`. Контраст: `strongestKnown(['spark',
  'frost_bolt'], 'урон')` = frost_bolt (мани 4 > 3) → legacy KeyK дал
  бы «Морозная стрела» (−4).
  D3 (D9): `u.mp = 2` → KeyQ → клик строки 'spark' → ровно
  `['не хватает маны (3)']`; `c.efs.spellInt 1` (не потрачен),
  `u.mp 2`; `u.mp = 11`.
  `press(S.keydown, 'KeyK')` → лог ровно `['Эфир: «Искра» — Волк: 6.']`
  (em-dash U+2014; ВЫБРАННЫЙ spark, НЕ strongestKnown «Морозная
  стрела»); `c.efs.spellInt 1→0`; `u.mp 11→8` (−3, не −4);
  `wolf.hp 100→94`; `0 c._rng`; ход НЕ сгорел ('efir').
* **Блок H (Медик)**: `scene227({ spells: true, allySpells: true,
  roster: ROSTER_MEDIC })`; turnOrder 'm0,player,a0' (assert);
  Space → 'a0'; `c.player.hp = 5` (25 max — игрок САМЫЙ раненый: frac
  0.8 против 0 у медика → legacy KeyH без выбора дал бы «Медик лечит
  Флогистон (+6).»); Медик цел (17/17), assert `medic.mp === 5`,
  `medic.spellWis === 1`.
  D3 (D9): `medic.mp = 2` → KeyQ → клик 'mend' → ровно
  `['не хватает маны (3)']`; `medic.mp = 5`.
  `press(S.keydown, 'KeyH')` → лог ровно `['Медик лечит себя (+6).']`
  (ВЫБРАННЫЙ, НЕ «самый раненый» — `c.player.hp === 5` НЕ изменился);
  `medic.mp 5→2`; `medic.spellWis 1→0`; `0 c._rng`; ход НЕ сгорел.

## 5. CU236-AURA — FX-аура toId='self' из книги (finding #4, major 000226)

* Сцена: `scene226({ efir: true, spells: true, allySpells: true })`
  (T.v-время, LOADER226, fakeLoader84); pre-roll стоп на 'efir'
  (assert); u (3,5) → клетка кастера cc = (168, 264); wolf m0 (3,4)
  → tc = (168, 216); mid = (216, 216). CELL = 48.
* Ранить Эфира (D3): `G.combatInternals.dealDamageToAlly(c, u, 6)` →
  hp 16→10 (maxHP 16 = 10 + 2·Тел3, assert). Книга Эфира дефолт
  [spark, mend] (без правок); assert `u.mp === 11`,
  `c.efs.spellWis === 1`; assert `c._fx === undefined` до каста
  (волк ещё не действовал — pre-roll стоп на 'efir'; паттерн
  CU226-CAST).
* Каст: KeyQ → клик строки 'mend' → УСПЕХ: лог ровно `['Эфир лечит
  себя (+7).']` (D5; regex `/^Эфир лечит себя \+(\d+)\.$/` + точное
  значение; при расхождении с прогоном — ре-пин по факту); `u.hp
  10→16` (кламп maxHP); `c.efs.spellWis 1→0`; `u.mp 11→8`; `0 c._rng`;
  книга закрыта; ход НЕ сгорел.
* **Контракт формы (ключевое)**: `c._fx` = `{ action: 'cast', until: 300 }`
  (T=0, FX_MS 300 — паттерн CU226-EFIRBOOK); `c._fx.castFx` deepEqual
  `{ at: 0, until: 600, spellId: 'mend', name: 'Заговора',
  school: 'исцеление', from: 'efir', toId: 'self' }` — toId 'self':
  'лечение' ∉ CAST_FX_TARGETED {урон, ослабление, контроль}
  (toIdOf combat-ui.js L1566-1571; запись — castRow L2361-2368 при
  r.ok).
* **Sрез T+150** (t = 0.25) — `tickSlice`:
  * первично: ровно 1 arc во ВСЁМ срезе (D4); этот arc — в (168, 264),
    `r = 48·(0.3 + 0.3·0.25) = 18`, `fill 'rgba(111, 220, 111, 0.25)'`
    + `stroke '#6fdc6f'` (arcsAt226 — стиль обратным обходом; в коде
    порядок fillStyle/strokeStyle → beginPath → arc → fill → stroke
    СОБЛЮДЁН, ловушка 000226 §8);
  * точечные негативы (и первично, и в фолбэке): 0 arc в (168, 216)
    (клетка цели — полётных/импактных НЕТ: ветка 'self' return'ит до
    полёта) и 0 arc в (216, 216) (flight-линия);
  * имя: fillText 'Заговора' x = 168, y = max(2, 240 − 6 − 2.5) =
    231.5, fill '#6fdc6f' (fillAt226), font '6px ui-monospace,
    monospace', textAlign 'center' (textStyleSets/styleCalls среза);
  * кадра: `__fake 'efirCast'` ЕСТЬ в окне позы (300 мс),
    `__fake 'heroCast'` НЕТ (quirk-фикс 000226).
* **Sрез T+450** (t = 0.75): аура продолжается — arc (168, 264)
  `r = 48·(0.3 + 0.3·0.75) = 25.2`, те же fill/stroke; на клетке
  волка 0 arc (не-ветка дала бы импакт r = 48·(0.25+0.45·0.5) = 22.8
  fill rgba(111,220,111,0.175) — НЕТ); поза истекла — кадр 'efir'
  (idle), 'efirCast' НЕТ.
* **T+650**: 0 arc, 0 fillText 'Заговора' (окно 600 мс истекло —
  гард, паттерн CU226-CAST).
* `0 c._rng` на всё окно (обёртка-счётчик).

## 6. Контракты и границы (якоря, бит-в-байт)

* Гейт «Лечение» build() — combat-ui.js L443-445 (kind 'merc'
  КРИТИЧЕН: у Эфира role 'support' ТОЖЕ); видимость — castHealVis
  L2544 → activeIsMercWithBook L2535; гашение — lastSpellChk L2498:
  без выбора → G.canDoAction(c,'heal') → ядро allyCanDo (combat.js
  L2386-2413: guard SUPPORT+merc → «недоступно активному
  персонажу»); с выбором → rowChk → AllySpells.canCastAllySpell.
* Клавиши — handleCode combat-ui.js L963-972 (KeyH: phase 'player' +
  activeUnit → lastSpellPress(c,'heal'); на ходу ИГРОКА — фоллбук в
  таблицу, KeyH в COMBAT_KEYS нет — бит-в-бит) и L973-979 (KeyK:
  activeIsEfir → lastSpellPress(c,'cast'); на ходу не-Эфира —
  фоллбук KeyK → 'attack').
* D3 — castRow L2342: запись lastSpells на любом тапе по строке,
  прошедшей гейт (spellbookUnitGate: только result/phase); успех →
  c._fx + bookOpen=false; отказ → logRejection + книга открыта.
* lastSpellPress L2477-2495: fleeOpen-гард → lastSpellChk →
  ('lastSpell' → castRow(player)); иначе sel = lastSpells[u.id] →
  castRow(sel); без sel → runAction legacy (strongestKnown/mostWounded
  бит-в-байт).
* Лечение — ally-spells.js: evalAllySpell (порядок: пул → мана;
  «не хватает маны (N)») → castAllySpell: pools[poolKey]−1 (mend:
  'атрибут' wisdom → spellWis), u.mp − мани; ветка 'лечение'
  (L325-336): СЕБЕ (t = u, Д-F), amount — формула §1-D5, лог
  «<имя> лечит себя (+N).» (em-dash в урон-строке, не в леч-строке).
* FX — combat-ui.js: castFxOf L1553-1564 ({at, until: at+600,
  spellId, name, school, from, toId}); toIdOf L1566-1571;
  drawCastFx L1585-1660: имя ВСЕГДА (fillText до веток); ветка
  toId==='self' L1602-1610: ОДИН arc (fill rgba(color,0.25) + stroke
  color, lineWidth 2, r = CELL·(0.3+0.3t)) + RETURN — полётных
  (t<0.5: 3 arc + хвост) и импактных (t≥0.5: 2 arc) arc в этой ветке
  НЕ СУЩЕСТВУЕТ; цвет 'исцеление' = '#6fdc6f' (CAST_FX_SCHOOLS
  L132-139).
* Сейвы: боевое c — транзиент (не сериализуется); полей сейва не
  трогаем; [E]-путь и гарды isActive (dungeonUI/buildingUI/npcUI) —
  вне домена, 0 правок. Детерминизм: 0 новых точек RNG в каст-путях
  (c._rng-обёртка в каждом тесте — обязательный ассерт 0 вызовов).

## 7. Что важно будущим задачам

* К-булит efir-spirit.md — ТЕПЕРЬ закреплён wording-пином W236-K
  (spec-combat-wording.test.js, EFIR()): формулировка
  «последнее выбранное из книги заклинание (K; до выбора — сильнейшее
  известное урон, 000227)» — правки булита требуют ре-пина.
* Гейт «Лечение» — закреплён за Вольком (melee + книга) позитивно
  (CU236-GATE) и за Вольком без книги негативно (CU178-GATE); откат
  гейта к role==='support' или добавление фильтра по «действие»
  теперь ловятся.
* K/H С выбором — закреплены (CU236-KH): восстановление старого
  remap KeyK→'cast' или legacy-целей по умолчанию с выбором —
  ловятся.
* Аура toId='self' — закреплена (CU236-AURA): удаление/ломка
  fill/stroke/r-формулы или добавление полётных arc в ветку 'self' —
  ловится.
* Блок 000236 — в EOF tests/combat-ui.test.js (после CU226-NOMOTION):
  будущие задачи, претендующие на EOF, мержатся после (known-риск
  a1 §5-7; прецедент: 000226 «пишет в EOF» — блок 000227 вставлен в
  середину по якорю 000193.01).
* Ретроспективно: tasks/result/000227.md «Подводные камни» (сцена
  ranged-лучника) закрыта 000236 в форме melee-Волька (Д1) — при
  будущих задачах про ranged-наёмника с книгой: гейт/кнопка/видимость
  роль-инвариантны (D6 000227) — повторного гейт-теста не нужно,
  нужен только специфика-ролевой сценарий.

## 8. Подводные камни

* **Line-neutral — критично**: после правки `wc -l spec/efir-spirit.
  md` обязан быть 145 (иначе красный spec-split; ТЗ допускает ре-пин
  «по факту», но строково-нейтрально устраняет необходимость).
* **Типографика**: em-dash U+2014 «—», «» — копировать дословно из
  SPEC/ТЗ; norm() схлопывает ТОЛЬКО белые (перенос L62/L63 →
  одиночный пробел). Расхождение = ложный красный.
* **Строки ядра — дословно**: «Вольк лечит себя (+5).» / «Медик лечит
  себя (+6).» / «Эфир лечит себя (+7).» / «Эфир: «Искра» — Волк: 6.»
  (em-dash в урон-строке) / «не хватает маны (3)» (порядок
  evalAllySpell: пул → мана) / «недоступно активному персонажу».
* **D3-отказ записывает выбор и оставляет книгу ОТКРЫТОЙ** — после
  D3-цикла ОБЯЗАТЕЛЬНО восстановить mp перед K/H-кастом, иначе
  клавиша даст строку отказа (тихий красный в deepEqual лога).
* **Две независимые сцены для тапа и KeyH в GATE** (блок (b) — новая
  scene227): после каста блока (a) spellWis = 0 → повторный каст
  упрётся в «действий «Заклинание» (Мудрость) больше нет».
* **arcsAt226 — обратный обход стилей**: пары стиль→arc в
  drawCastFx в порядке (fillStyle/strokeStyle → arc) — пин
  fill/stroke надёжен; глобальный «ровно 1 arc» держится на
  steady-state = 0 arc (CU226-REJ) — при чужом arc не чинить тест
  «в лоб», а применить фолбэк D4 и записать факт в result.
* **Кнопки**: пины строго по dataset.act (byActOf178); глобальные
  числа кнопок (8/9/10) в новых тестах НЕ вводить (хрупкость к
  параллельным задачам; a1 §5-10).
* **vm-стаб**: button.textContent НЕ пересчитывается из children —
  бейдж читать как child (badgeOf199); click — через
  `listeners.click[0]()` (работает и на disabled — осознанно, паттерн
  CU227-MERC).
* **Параллельные задачи** (НЕ трогать файлы): 000235.02 (spells.
  js/main.js/hud.js/spellbook-oc.js/index.html), 000222 (cities/
  buildings), 000230.01 (items-схема/items.js) — пересечений с нашим
  набором (spec/efir-spirit.md, tests/spec-combat-wording.test.js,
  tests/combat-ui.test.js, memory/000226*, memory/000227*) нет
  (проверено a1 §5-8 / a2).

## 9. План реализации (по файлам) + инварианты

1. `tests/spec-combat-wording.test.js` — НОВЫЙ test W236-K в EOF
   (после L176): +18 строк. Имя: `SPEC 000227; 000236 (ретро-
   20261017): «Дух Эфира → Бой» — K: последнее выбранное из книги
   заклинание (до выбора — сильнейшее известное урон)`.
2. `tests/combat-ui.test.js` — блок в EOF (после CU226-NOMOTION,
   L10038): header-комментарий `// ===== Задача 000236 …` +
   `ROSTER_WOLK_BOOK` + CU236-GATE (~120 строк) + CU236-KH (~110) +
   CU236-AURA (~110) — итого ~360-380 строк.
3. **Красная фаза**: `node --test tests/` в worktree → ровно 1
   осмысленный fall (W236-K: оба ассерта — new absent / old present),
   2687 baseline + 3 coverage — зелёные. Точечные итерации:
   `node --test tests/spec-combat-wording.test.js tests/combat-ui.
   test.js`.
4. `spec/efir-spirit.md` — строково-нейтральная правка L62-63
   (2 строки; 145→145; гейт wc -l). W236-K → зелёный.
5. `memory/000227-combat-last-spell-button.md` — хвост, новый
   §11: ретро 2026-10-17 major #1 (K-булит), #2 (гейт «Лечение»),
   #3 (K/H 1:1 с выбором) закрыты 000236 (CU236-GATE/CU236-KH +
   W236-K; ссылка memory/000236-retro-combat-k-heal-fx.md, tasks/
   result/000236.md) — ~10 строк.
6. `memory/000226-combat-cast-anim.md` — хвост, новый §9: ретро
   2026-10-17 major (аура toId='self' не покрыта) закрыт 000236
   (CU236-AURA; ссылки те же) — ~8 строк.
7. Полный `npm test` (= node --test) в worktree: **2691/2691**.
   Флейк чужого теста → перепуск `node --test tests/<файл>` + запись
   в result.
8. Завершение: `tasks/pending/000236.md` → `tasks/done/000236.md` +
   `tasks/result/000236.md` (краткий отчёт: счёт 2687→2691,
   finding'ы 1-4 закрыты, факт D5-репинов/фолбэков). Коммит ОДИН на
   task/000236: первая строка `Задача 000236: …` (рус.), последний
   параграф `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
* **Инварианты финального diff**: src/ — 0 diff; index.html — 0
  diff; CHANGELOG — нет (не игровой процесс, не графика);
  spec-split.test.js — 0 правок (145 не изменилось); других
  spec-файлов — 0; существующих тестов — 0 правок (D12).
  Файлы коммита: spec/efir-spirit.md, tests/spec-combat-wording.
  test.js, tests/combat-ui.test.js, memory/000236-retro-combat-k-
  heal-fx.md (новый), memory/000226-combat-cast-anim.md, memory/
  000227-combat-last-spell-button.md, tasks/pending→done + tasks/
  result/000236.md.
