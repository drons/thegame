# 000249 — Бой: «последнее заклинание» сохраняется между боями

ТЗ — `tasks/pending/000249.md`. Родительская: нет. Зависимости: СЕРИЙНО с
000246/000248 (общий `src/combat-ui.js`) — выполнять ПОСЛЕ. База старта:
master babb1e9 (000248 уже в базе) — 000227 и 000248 в коде.
Базовый сьют: 3127/3127 зелёный (не перегонять на каждом шаге — один
полный `npm test` на worktree).

## Чтение ТЗ (ВАЖНО: раздел «Состояние сейчас» устарел)

ТЗ писали от master 1c5aaec — ДО 000227. 000227 (уже в master) РЕАЛИЗОВАЛ
кнопки: «Последнее заклинание» (hero, `act='lastSpell'`, иконка
`assets/ui/combat_lastspell.svg`), «Каст» (Эфир, `act='cast'`, KeyK),
«Лечение» (наёмник с книгой, `act='heal'`, KeyH); единый
`lastSpellPress(c, act)`; `lastSpellChk` (порядок причин);
`lastSpellVis`; бейджи `.combat-actcount`; модульный `let lastSpells = {}`
в `combat-ui.js` (L218, ключи `'player'`/`u.id`); семантика D3 000227 —
выбор записывается на ЛЮБОМ тапе по строке книги, прошедшей гейт,
независимо от исхода.

Следовательно 000249 — НЕ «создать кнопки», а доводка 000227 по 4 осям:

- **S1** — «последнее» = последнее УСПЕШНО откастованное (r.ok).
  Неуспешный каст/отказ/гейт — не записывает и не сбрасывает. ПРЯМОЕ
  инвертирование 000227 D3 — предписано ТЗ («последнее УСПЕШНО
  откастованное (неуспешный каст/отказ — не сбрасывает); решение
  зафиксировать в memory»).
- **S2** — id заклинания ПЕРСИСТИРУЕТСЯ МЕЖДУ БОЯМИ (новое top-level
  поле сейва `last_spells`, v1, без миграции).
- **S3** — герой: в начале боя кнопки НЕТ, пока он не использует магию;
  после ПЕРВОГО УСПЕШНОГО каста в этом бою — появляется.
- **S4** — Эфир/наёмник: кнопка доступна СРАЗУ, если есть «последнее
  заклинание» (из сейва) И оно кастуемо; «сразу» = на ходу данного
  персонажа (turnOrder — по инициативе, НЕ «Эфир всегда первый»).

ТЗ «иначе — disabled с причиной» прочитано как «выбор ЕСТЬ, но каст
недоступен (мана/пул)» — это уже реализовано 000227
(`lastSpellChk` → `rowChk`: «не хватает маны (N)» / «действий
«Заклинание» (…) больше нет»). Случай «выбора НЕТ ВООБЩЕ» — legacy-фолбэк
000227 D4 (strongestKnown/mostWounded) СОХРАНЯЕТСЯ бит-в-байт: 000227
явно отклонил disabled-альтернативу («свежий бой — кнопка мёртвая, пока
не открыл книгу» — «больше, чем просит ТЗ»), а «состояние до фичи»
из ТЗ §4 для старых сейвов = legacy. Красный тест 249-ALLY-DISABLED
из анализа (a3) ОТКЛОНЁН.

## Что добавлено (дизайн; код — на красной/зелёной станциях)

ОДИН live-объект на всё:

- `src/main.js` — `const lastSpells = {}` (рядом с `const allyQuick = {}`,
  L265). Ключи: `'flogiston'` (герой — id, устоявшийся в инвентаре
  playerUI), `'efir'` (всегда, прецедент ally_quick), `npcId` (наёмники —
  roster). Единое хранилище → один раздел сейва, один санитайзер, один
  restore.
- `src/main.js` — `sanitizeLastSpells(map)` (рядом с `sanitizeAllyQuick`,
  L489).
- `src/main.js` — раздел сейва `last_spells` в `collectSaveData` (после
  L790 `ally_quick`); restore-блок в `restoreFromSave` (после блока
  ally_quick L1127-1146).
- `src/main.js` — `opts.lastSpells: lastSpells` (live-ссылка) в ТРЁХ
  местах `startCombat` (рядом с `allyQuick`/`allyQuickLive`, L1800-1802,
  L2499-2501, L3091-3093).
- `src/main.js` — `__game.state.lastSpells` — зеркало в GETTER'е
  `__game.state` (L3827+): `lastSpells: Object.assign({}, lastSpells)`
  после `roster,` (паттерн mobCharge: копия на каждый доступ, read-only).
- `src/combat-ui.js` — `startCombat`: `ctx.lastSpells` с null-guard
  (паттерн `combat._allyQuickLive`, L3210-3212) в ctx-объект (L3225+).
- `src/combat-ui.js` — `build()`: сидирование ТОЛЬКО союзников из
  `ctx.lastSpells` (после module-reset `lastSpells = {}`, L305; c на L319).
  Герой НЕ сидируется.
- `src/combat-ui.js` — `castRow` (L2537-2579): УБРАТЬ pre-cast запись
  L2549; в ветке `if (r && r.ok)` (ПОСЛЕ блока FX 000248 — строки FX
  бит-в-байт) — вызов хелпера `recordLastSpell(c, u, spellId)`.
- `src/combat-ui.js` — `recordLastSpell(c, u, spellId)`: модульный
  `lastSpells[u === c.player ? 'player' : u.id] = spellId` +
  `if (ctx && ctx.lastSpells) ctx.lastSpells[u === c.player
  ? 'flogiston' : u.id] = spellId`.

Файлы НЕ трогаем: `src/combat.js` (ядро не читает запись — детерминизм),
`src/save.js` (v1, MIGRATIONS пусто — пин 000072), `src/ally-spells.js`,
`src/spells.js`, `src/spells-data.js`, `src/player.js`,
`src/combat-keys.js`, `index.html`, `assets/`, CSS.

## Контракты и границы

- **D1 (ключи)**: `'flogiston'` / `'efir'` / `npcId`.
- **D2 (сейв)**: top-level `last_spells` — объект `{key: string}`.
  Версия 1, БЕЗ повышения, БЕЗ миграций. Пишется ВСЕГДА (даже `{}` —
  прецедент 000194, пин 194-SAVE-OLD). СТАРЫЙ сейв без раздела —
  восстановление чисто, БЕЗ warn (000109 R5), состояние «до фичи»:
  герой — кнопка скрыта (выбора в этом бою нет), союзники — legacy.
- **D3 (санитайзер)**: не-объект → `{}` (restore — console.warn
  «Сейв: раздел last_spells некорректен — сбрасываю.» — строка как у
  ally_quick; игра не роняется, 0 errors). Ключи: `'flogiston'`/`'efir'`
  всегда + `roster`-npcIds (призраки обрезаются). Значение — строка И
  член `G.SpellsData.SPELLS_BY_ID` (spells-data.js L1643-1646);
  каталог отсутствует → fail-closed `{}`. Остальное — отбрасывается.
  Restore — in-place merge (delete-all + set-clean, паттерн L1141-1142):
  live-ссылка НЕ меняется.
- **D4 (сидинг, build())**: только `u !== c.player`;
  `v = ctx.lastSpells[u.id]`; запись, если `typeof v === 'string'`
  И `u.spells` — массив И `u.spells.indexOf(v) >= 0` (забытое/подделанное
  id → без сидинга → legacy, без ошибок). Герой — без сидинга (S3).
- **D5 (запись — success-only)**: ТОЛЬКО в ветке r.ok castRow. Отказ
  (logRejection) и гейты — без записи И без сброса. Строка «Воскрешение»
  в КНИГЕ героя — записывается (идёт через castRow; 000227 D3 по книге
  сохранён). КНОПКА «Воскрешение» (`resurrectCast`) — НЕ записывается
  (автономный один-тап-путь, не «из книги» — решение 000227 D3; запись
  дала бы видимую-но-disabled кнопку в вырожденных случаях). Legacy-путь
  (`runAction` → autoSpellFor/allyHealAction) — НЕ записывается: запись
  перенаправила бы будущие касты через castRow и ИЗМЕНИЛА ЛОГ-СТРОКИ
  (ядро «Медик лечит Флогистон (+6).» vs castAllySpell «Медик лечит себя
  (+6).»).
- **D6 (гейт героя — НОЛЬ нового кода)**: `lastSpellVis` НЕ МЕНЯЕТСЯ
  (`c.phase === 'player' && !c.result && unitOf(c) === c.player &&
  !!lastSpells.player && !resurrectChk(c).ok`): герой не сидируется +
  success-only ⇒ «успешный каст героя В ЭТОМ бою». Строка причины
  «нет выбранного заклинания» (L2714) — дословно.
- **D7 (союзники)**: «сразу» = на их ходу (castHealVis/castVis без
  изменений). Выбор есть, но не кастуем — disabled с причиной (rowChk,
  код 000227). Выбора нет — legacy бит-в-байт.
- **D8 (yield)**: сохранён — lastSpell скрыта, пока resurrectChk ok
  (9-я видимая клетка; правило ≤8).
- **D9 (детерминизм)**: запись — UI-bookkeeping; combat.js не читает;
  0 новых c._rng; бит-в-бит сяд боевого ядра.
- **D10 (UI-поверхность)**: НЕТ новых кнопок/DOM/ключей/иконок — кнопки
  000227 те же: 8 кнопок, порядок DOM, combat_lastspell.svg, K/H,
  ≤8-я клетка, счётчик svg 'ui'=12, index.html, index-order — всё без
  изменений.

## Ленивые ссылки и guards

- `G` — снапшот globalThis.Game один раз (000038); typeof-guards +
  console.error-деградация (000038/000053) — новые обращения
  (`G.SpellsData`) только в санитайзере, fail-closed.
- `ctx.lastSpells` — null-guard
  (`typeof === 'object' && !Array.isArray`, как `combat._allyQuickLive`
  L3210-3212). combat-ui читает ЕГО в build(), ПИШЕТ на успех —
  mid-combat синк не нужен (единый объект).
- vm-сандбокс БЕЗ `opts.lastSpells` → `ctx.lastSpells = null` → сидинг
  и live-запись не работают, запись остаётся per-combat (модульная карта)
  — CU227-RESET остаётся зелёным.
- `u.spells` — валидация сидируемого id (массив + indexOf).
- `c.player` — ШИТА (000227 D2 «не мутировать под состояние UI»):
  hero-поля (lastSpellId на объекте героя) ОТОРВАНЫ — иначе
  sanitizeSavedHero (whitelist, player.js L128-189) молча обрезал бы
  поле при сейве и нарушился бы инвариант.

## Что важно будущим задачам (из ТЗ-ссылок)

- Контракт кнопок 000227 — `memory/000227-combat-last-spell-button.md`
  (D1-D15; D3 с 000249 инвертирован: запись — на УСПЕШНОМ касте).
- Паттерн live-карты + раздел сейва + in-place restore — 000194/000195
  (ally_quick): last_spells — копия этого паттерна (memory 000194).
- 000171/000178 — паттерны выделенных кнопок («Воскрешение»,
  castHealVis); 000178 — видимость кнопок союзников по активному.
- 000038 — G-снапшот/guards; 000109 R5 — отсутствующий раздел сейва —
  без warn; 000072 — формат v1, MIGRATIONS пусто (пин save.test).
- E2E-бой в harness save-restore (паттерн loot-e2e):
  `g.actions.startCombat(0)` → `c.phase='over'; c.result={outcome:
  'victory', xp, gold, defeated, allyXp: [], items: []}` →
  `G.combatUI.handleCode('Escape')` → finish → onEnd (debug onEnd:
  `combatEndCompanions` + `saveNow()`, main.js L1857/L1862).
- Новых модулей/SVG/тегов `<script>` — НЕТ (index.html без изменений).

## Подводные камни

1. «Состояние сейчас» в ТЗ stale (pre-000227) — объём работ = доводка,
   не создание. Не дублировать кнопки 000227.
2. RE-PIN (только D3 failed-tap тесты — «выбор по отказу»):
   - CU227-EFIR (b) L7430: whitebox `c.efs.spellInt = 2` + bootstrap
     УСПЕШНЫМ кастом строки (mp 11→8); затем кнопка — spark (8→5).
   - CU227-MERC (b) L7527: whitebox `medic.mp = 8; medic.spellWis = 2` +
     bootstrap (8→5); кнопка (5→2). Лог-строка «+6» — amount, не healed
     (ally-spells.js L338) — работает и на полном HP.
   - CU227-BADGE (1) L7587: whitebox `spellInt = 4 / spellWis = 3`;
     успешный spark (бейдж «3» — как было) → spellInt 0 → «0» → KeyQ
     (книга закрылась после успеха — ПЕРЕОТКРЫТЬ) → успешный mend →
     «2». Лечение по полной HP — r.ok (spells.js L601-613, healed 0,
     лог «Заговор: 0.») — выбор записывается.
   - CU227-YIELD L7775: coverage-репин — добавить цель (m0 adjacent +
     selectTarget), bootstrap успешным spark (mp 50→47); turn НЕ
     сгорает (каст ≠ endTurn — castRow без endTurn) → белый turnIndex
     НЕ нужен; assert-ы без изменений.
   - CU236-GATE (a) L10120 / (b) L10183: whitebox `volk.mp = 10;
     volk.spellWis = 2` + bootstrap; после отказа — assert «выбор НЕ
     записан (000249)» + legacy disabled.
   - CU236-KH (K) L10233 / (H) L10286: whitebox `c.efs.spellInt = 2`
     / `medic.mp = 8; medic.spellWis = 2` + bootstrap; log-пин
     («Искра», −3 маны; «себя (+6)») — без изменений.
   Строки отказа («не хватает маны (3)») — без изменений (logRejection
   не тронут); сообщения «выбор записан (D3)» → «выбор НЕ записан
   (000249)». НЕ репинаем (остаются зелёные): CU227-BUILD/PLAYER
   (bootstrap уже успешным)/FLEE/RESET (hero-семантика «не переносится»
   для героя осталась верна), CU178-*, CU168-UI-2, CU198-UI-3,
   CU226-*, CU236-AURA, 194-*, save.test 000072, svg 'ui'=12,
   index-order, combat-keys, gold 000084.
3. Касти из книги НЕ сгорают ход (000171 «каст ≠ endTurn») — bootstrap
   в любом сценарии не двигает turnIndex.
4. FX-блок 000248 в ветке r.ok castRow — сохранить бит-в-байт; строка
   recordLastSpell — ПОСЛЕ него.
5. Новые боевые тесты — блок `// ===== Задача 000249` в
   tests/combat-ui.test.js ПОСЛЕ CU227-блока, ПЕРЕД якорем
   `// ===== 000193.01` (L7813) — НЕ в EOF (000226 пишет в EOF этого
   файла). `scene227` (L7241) расширить: `...(opts.lastSpells ?
   { lastSpells: opts.lastSpells } : {})`. «Бой 2» — тот же sandbox +
   test-owned live-объект, прокинутый в opts.
6. Новые сейв-тесты — EOF tests/save-restore.test.js (файл заканчивается
   194-блоком, L1122; никто в EOF не пишет).
7. «Эфир первый» — НЕ инвариант: turnOrder сортируется по инициативе
   (combat.js buildTurnOrder); «efir» первым — только в конкретных
   фикстурах (seed 42 + состав). «Сразу» = на ходу персонажа.
8. Один полный `npm test` на worktree; известный флейк «160k tileAt» —
   протокол: пересчёт одного файла, фиксировать в отчёте.
9. SPEC-тройка + пины: bullets в spec/spells.md (L43-47 — «выбор — на
   попытке, независимо от исхода» → «записано на УСПЕШНОМ касте; id —
   между боями; герой — после первого успешного каста в бою»),
   spec/efir-spirit.md (L62-64, K-bullet), spec/companions.md (L40-49,
   H-bullet) + пересчёт SPEC_FILE_LINES (tests/spec-split.test.js:
   spells 237, companions 141, efir-spirit 145 — в ТОМ ЖЕ коммите) +
   2 wording-пина (tests/spec-combat-wording.test.js L185-188;
   tests/spec-mobs-companions-efir-wording.test.js L119-127).
10. CHANGELOG.md — отдельный коммит «Задача 000249: CHANGELOG — …»,
    дата 2026-10-24 (меняется геймплей/управление).

## Красные тесты (план для красной станции)

Бой — блок `// ===== Задача 000249` (см. камень 5):
- CU249-HERO-GATE: live `{flogiston:'spark'}` → старт: display none
  (гейт per-combat, герой не сидируется) → успешный каст из книги →
  display '' + enabled, тап — каст ТОГО ЖЕ; whitebox: live-карта
  обновлена записью.
- CU249-HERO-FAIL-NORESET: после успешного — неудачный каст (дорогое
  заклинание, мана <) → кнопка всё ещё предшествующее заклинание
  (не сбросилась, не подменилась).
- CU249-EFIR-IMMEDIATE: live `{efir:'spark'}` (у Эфира книга
  spark+frost_bolt) → на ходу Эфира «Каст» enabled, бейдж — пул spark,
  тап — «Искра» (legacy дал бы «Морозная стрела»).
- CU249-MERC-IMMEDIATE: live `{a0:'mend'}` (ROSTER_MEDIC) → на ходу
  Медика «Лечение» — «Медик лечит себя (+6).» (legacy дал бы
  «нет раненых»).
- CU249-LEGACY-NORECORD: выбора нет → legacy-каст кнопкой → live-карта
  НЕ ИЗМЕНЕНА ({} → {}).

Сейв — EOF save-restore.test.js:
- 249-SAVE-ROUNDTRIP: seed `last_spells {flogiston:'spark',
  efir:'spark', merc_volk:'mend'}` (+companions merc_volk) → boot →
  `g.state.lastSpells` deepEqual → fireBeforeUnload →
  `readSave().data.last_spells` deepEqual, version 1.
- 249-SAVE-OLD: без раздела → boot: 0 errors, 0 warns про last_spells →
  state.lastSpells `{}` → новый сейв: `last_spells: {}` (пишется
  всегда).
- 249-SAVE-SANITIZE: `{ghost_npc:'mend', flogiston:42, efir:'nope_spell'}`
  → `{}` (42 — не строка, nope_spell — не в каталоге, ghost — не в
  отряде); (b) `merc_volk:'mend'` + roster — переживает перезагрузку;
  не-объект → `{}` без падения.
- 249-E2E-2FIGHTS (реальный main.js, паттерн loot-e2e): hero/efir
  spells + seed last_spells → boot → `g.actions.startCombat(0)` →
  герой: кнопка скрыта; Эфир (на его ходу, KeyK): персистный «Искра»
  (НЕ legacy) → герой: успешный каст из книги → кнопка видима →
  `c.phase='over'` + `c.result` victory + Escape → onEnd → saveNow →
  readSave: last_spells персистированы (flogiston + efir) → ВТОРОЙ
  `startCombat(0)`: Эфир сразу с персистным, герой — скрыт на старте.

## План по файлам (ожидаемые дельты)

- `src/combat-ui.js` ±~25 строк: коммент L212-217 (000227 D3 → 000249);
  build(): ~6 строк сидинга (после L319); castRow: −1 (L2549), +1 (вызов
  в r.ok после FX); +~8 recordLastSpell; +~2 ctx.lastSpells (startCombat,
  рядом с _allyQuickLive) + JSDoc.
- `src/main.js` ±~45 строк: const lastSpells + коммент (~L265);
  sanitizeLastSpells ~15 строк (после sanitizeAllyQuick L489-502);
  collectSaveData +1 (после L790); restore ~12 строк (после L1146);
  3× +1 `lastSpells: lastSpells` (L1802/L2501/L3093); __game.state +1
  (после `roster,`).
- `tests/combat-ui.test.js` +~280-350 (новый блок) ±~60 (репины 6
  тестов выше); scene227 +1.
- `tests/save-restore.test.js` +~150-220 (EOF, 4 теста).
- `spec/spells.md`, `spec/companions.md`, `spec/efir-spirit.md` ±5-10
  каждый; `tests/spec-split.test.js` — 3 значения линий;
  `tests/spec-combat-wording.test.js`,
  `tests/spec-mobs-companions-efir-wording.test.js` — 2 репина ±3.
- `memory/000249-combat-last-spell-persist.md` (этот файл).
- `CHANGELOG.md` — отдельный коммит.

## Исправление красных (станция реализации, 2026-10-24)

- tests/save-restore.test.js использует `node:assert/strict` — там
  `assert.deepEqual` === `deepStrictEqual` (сравнивает прототипы).
  `g.state.lastSpells` — объект realm'а vm-песочницы (GETTER
  `__game.state` main.js; `Object.assign({}, lastSpells)` — VM
  Object.prototype), литерал — host-realm → сравнение всегда падает
  (даже `{}` против `{}`). Прецедент кодовой базы для cross-realm
  assert'ов `__game.state` — JSON-нормализация (tests/
  building-effects.test.js L7294: `JSON.parse(JSON.stringify(
  g.state.hero.inventory))`; tests/main-loot.test.js —
  `JSON.stringify(g.state.hero.inventory)`). Ре-пин: 4 ассерта в
  красном блоке 249 (ROUNDTRIP L1148, SAVE-OLD L1171, SANITIZE
  (a) L1197, (b) L1215) — actual обёрнут `JSON.parse(JSON.stringify(
  g.state.lastSpells))`; намерение (зеркало live-карты) и expected
  без изменений. src/ — без изменений (зеркало — ровно
  `Object.assign({}, lastSpells)`, как в контракте).
- Строка лога лечения героя: каталог spells-data название «Заговора»
  (род. п.) → лог «Заговора: 0.» (не «Заговор»): regex репина
  CU227-BADGE(1) — `/^Заговора: \d+\.$/`.

## Правки по итогам ревью (станция ревью, 2026-10-24)

- Finding (minor, покрываемость): 249-E2E-2FIGHTS сидирует
  last_spells только для flogiston/efir — путь НАЁМНИКА в реальном
  main.js (npcId-ключ → id боевого юнита из allyDataForEntry
  `id: npc.id`) был покрыт опосредованно (CU249-MERC-IMMEDIATE —
  индексный id 'a0' из makeAlly; 249-SAVE-SANITIZE(b) — только
  уровень сейва). Дефекта по чтению кода НЕТ (ID-пространство
  записи u.id в recordLastSpell, чтения ctx.lastSpells[u.id] в
  build() и roster-валидации sanitizeLastSpells совпадает). Дописан
  аддитивный E2E 249-E2E-MERC (tests/save-restore.test.js, EOF):
  production-ID-шов сейв → live → build → кнопка (npcId-ключ),
  запись npcId-ключом (каст строкой книги) и старт боя 2 с
  обновлённым значением (ТЗ «Тесты» (а): «Эфир/наёмник: бой 1 —
  каст X → бой 2 — кнопка доступна СРАЗУ с тем же X»).
- Фикстура 249-E2E-MERC — НАТУРАЛЬНЫЙ support-наёмник merc_mira
  (Мира, найм-каталог: spells ['mend','light_heal'], без whitebox
  sheet; старый формат записи companions → backfill createMercSheet):
  Вольк (merc_volk) — melee, spells [] — кнопка «Лечение» у него
  НЕ строится (гейт build: непустая книга). Инициатива (000167,
  Дexterity+Intelligence): Эфир 4 (1+3) = Мира 4 (1+3) > игрок 2
  (1+1) — очередь р1: efir, merc_mira, player, мобы (тай-брейк —
  стаб-сортировка, порядок базы). Мана наёмника makeAlly =
  5+Int+Wis = 10 (Мира); mend — 3 маны/+6, light_heal — 6 маны/+6
  (степень 1 у обоих — строка лога ОДИНАКОВА «Мира лечит себя
  (+6).»; дискриминатор обновлённого выбора — расход маны: бой 2
  10→4 (light_heal) vs 10→7 (mend)).
- ПОДВОДНЫЙ КАМЕНЬ vm-песочницы save-restore.test.js: makeEl —
  `querySelectorAll() { return []; }` → render-цикл
  `overlay.querySelectorAll('.combat-actions button').forEach(...)`
  — no-op в этой песочнице: display/disabled/бейджи КНОПОК
  панели в ней НЕ обновляются (поэтому 249-E2E-2FIGHTS
  ассертит только строки лога/траты, не DOM-состояние кнопок).
  Ассерты 249-E2E-MERC — только то, что живёт в ядре/синхронно:
  activeUnitId, c.log, u.mp/u.spellWis, __game.state.lastSpells,
  раздел сейва.
- Cross-realm повторился на МИРР-массиве: `mira.spells` —
  vm-realm Array (host-realm литерал) — `assert.deepEqual`
  (strict) падает на прототипе даже при идентичных значениях →
  JSON-нормализация перед сортировкой (прецедент — см. «Исправление
  красных» выше).
