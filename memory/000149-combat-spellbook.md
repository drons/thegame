# 000149 — Бой: книга заклинаний вместо пары кнопок «Огонь»/«Исцел.»

Станция «Проектирование» (2026-10-07). Worktree:
`/home/sas/Documents/Art/thegame/.worktrees/task-000149`, ветка
`task/000149`. База ветки = master **f4fd4e3** (000145 смержена); на
момент проектирования master **0c47f71** (смержены 000151, 000161 —
см. §11, ребейз). ТЗ (source of truth): `tasks/pending/000149.md`.
Анализы: /tmp/thegame-wf-000149/{a1-domain.md, a2-arch.md,
a3-tests.md} — расхождения между ними разрешены решениями §1
(арбитр — код worktree, сверено grep/sed).

**Базовый npm test (ветка task/000149, база f4fd4e3): 1787/1787 pass,
0 fail, 0 skip (~112 c).**

---

## 1. Решения станции Проектирование (каждое — с причиной)

| # | решение | почему |
|---|---|---|
| R1 | Иконки заклинаний — в **отдельном каталоге `assets/spell-icons/<id>.svg`**, НЕ в `assets/spells/` | Каталог заклинаний закрыт тестом «чужих файлов нет (только NNNNNN.json и schema.json)» (tests/spells.test.js L84-89) — ослаблять защитника ради ассетов нельзя; иконка — ассет, не данные (source of truth каталога — JSON + зеркало spells-data.js) |
| R2 | JSON-поля: **`"icon"`** (строка, путь ОТ КОРНЯ: `assets/spell-icons/<id>.svg`) + **`"icon_prompt"`** (строка, непустая); оба в `required` схемы | `icon` — имя поля уже существует в проекте (assets/portraits, 000142 D2); путь от корня, а не basename, т.к. иконка лежит в ДРУГОМ каталоге, чем JSON (прецедент basename работает только при colocate); `icon_prompt` самодокументирующая пара к `icon` (голое `prompt` — неоднозначно; русские `иконка`/`промпт_иконки` отклонены — поле-иконка в проекте уже английское) |
| R3 | Имя действия — **`spellbook`**; клавиши **KeyQ (primary) + KeyR** — дублирующая пара, обе открывают книгу | «Книга заклинаний» = spellbook — точное имя под aria-label; обе бывшие «магические» клавиши ведут в одну книгу (мышь/клавиатура унифицированы, muscle memory сохранён; прецедент дублей KeyJ/KeyK, KeyT/KeyU в combat-keys.js); иконка кнопки выводится деривацией `assets/ui/combat_spellbook.svg` — без спец-кейса |
| R4 | **Аддитивная ветка `canDoAction(c, 'spellbook')` в combat.js** (после ветки 'heal'): checkTurn → checkBlocked → пустая книга → `{ok:false, reason:'заклинаний нет'}` → ok | Цикл disabled-кнопок в render() (`G.canDoAction(c, b.dataset.act, …)`) и handleCode (`st.canDo = G.canDoAction(c, entry.action, …)`) уже читают canDoAction для КЛЮЧА И КНОПКИ — нулевые правки disabled-логики (красное ТЗ), контракт 000037 «одна причина — одно поведение», один источник доступности; отклонён a2-вариант «синтез st.canDo в handleCode + спецкейс в render» — дупликация canDo-логики в двух местах UI, что 000037 и запрещал |
| R5 | Кнопка книги enabled, если книга **непуста**; доступность отдельных заклинаний (мана/пул/цель) — **НЕ** сводится в кнопку, живёт в строках (зеркало canCastSpell) | Кнопка — opener; её единственная canDo-причина = «заклинаний нет»; иначе N вызовов canCastSpell на render и неоднозначный reason на кнопке (чьи «не хватает маны» показывать?) |
| R6 | Новый модуль — **`src/spellbook.js` → `Game.SpellBook = { entriesFor }`** (ЧИСТЫЕ данные, UMD, 0 зависимостей при загрузке); DOM строк — в combat-ui.js | entriesFor(sheet, catalog) — node-тестируется без DOM (красные A-тесты); состояние книги/toggle/cast-fx и так живёт в closure combat-ui (bookOpen, c._fx) — выносить DOM в третий файл только усложняет проводку; entriesFor переиспользуется 000168 (книга союзника — другой sheet); отклонён a1-вариант `combat-spellbook.js` с knownFor/rowState/render — rowState дублировал бы canCastSpell (нарушение 000037), knownFor(c) — нечистая |
| R7 | Каст строки — **`G.Spells.castSpell(c, id, c.targetId)`** (движок 000045); предпросмотр строки — **`G.Spells.canCastSpell(c, id, {targetId: c.targetId})`**; на успех — `c._fx = {action:'cast', until}` + **книга закрывается**; на отказ — reason в c.log (logRejection), **книга остаётся открыта** | Смысл задачи — унификация на каталожной системе (000045); канал c._fx и формат лога — существующие (000047/000045); закрытие после каста — атомарность «одно нажатие = одно действие» (как было с Q), возврат в базовый UI; отказ не закрывает — причина видна в строке (disabled+title) и журнале, контекст не теряется |
| R8 | **Активный персонаж = `c.player`** (000167 НЕ в master); точка подмены — **одна** в UI-коде книги + чтение `c.player.spells` в ветке canDoAction | Текущее поведение: в бою действует только игрок; очередь/activeUnitId — за 000167, провязка «книга активного юнита» — за 000168 (memory/000154-initiative.md D9: «заклинания союзников через книгу — НЕ v1»); порядок мержей 000167 → 000149 → 000168 |
| R9 | Строки книги — **`div.combat-spellrow` с click-слушателем** (НЕ `<button>`) | vm-стаб loadCombatUi считает КАЖДЫЙ `document.createElement('button')` в глобальный массив `buttons` (tests/combat-ui.test.js) — строки-кнопки попали бы в ассерты «7 кнопок»/aria; div + click-гард (disabled-строка — reason в лог, как по клавише) — прецедент строк 000145 (cp-itemrow) |
| R10 | **Удалить** `assets/ui/combat_fire.svg` и `assets/ui/combat_heal.svg`; добавить `assets/ui/combat_spellbook.svg` | После удаления fire/heal из таблицы иконоки-орфаны (прямых ссылок нет — имя выводится из action, grep по src/tests/index.html пуст); счётчики tests/svg.test.js точные: `'ui': 10 → 9`, `+'spell-icons': 16` |
| R11 | DOM книги — **между `.combat-actions` и `.combat-log`** в `.combat-side`; скрыта `style.display='none'` (конвенция bannerEl/_breathSec); CSS — **ОДИН блок в КОНЦЕ `<style>`** (после блока 000145, перед `</style>`), ВСЕ правила со скоупом `.combat-overlay--combat` | 000124: геометрия боя только в боевом скоупе, базовые классы (.combat-side/.combat-log) не трогать (стражи tests/combat-layout.test.js); 000145: новые классы — один блок в конце <style>; 7 кнопок = 2 ряда (4+3) — `.combat-actions` (grid 4 колонки) БЕЗ ПРАВОК |
| R12 | Строка: имя + **meta `Мана N · Заклинание (Интеллект/Мудрость)`** + описание каталога дословно | ТЗ: «описание и стоимость в мане и прочих ресурсах» — прочие ресурсы каста 000045 = ТОЛЬКО пул действий по атрибуту (предметы не тратятся); пул подписывается человеческим именем (Интеллект/Мудрость) + ключом не показываем (это внутреннее c.ps) |
| R13 | Проверки «здоровье полное» (legacy 'heal') и «не хватает маны (3)» в книгу **НЕ переносим** — зеркало = canCastSpell дословно | canCastSpell такой проверки не имеет; добавлять в движок 000045 — смена зафиксированного поведения (~пины spells.test.js); осознанный UX-компрометис: «Заговора» при полном HP — enabled (каст потратит ману/пул на 0 лечения); красное ТЗ не требует |
| R14 | Скрипт `src/spellbook.js` в index.html — **ПОСЛЕ `src/spells.js` (L809), ДО `src/combat-ui.js` (L934)** + пин index-order (НЕ-смежный union: spells.js < spellbook.js < combat-ui.js) + запись в «нужные модули подключены» | UMD-ловушка 000038: combat-ui.js снимает `const G` один раз при загрузке — G.SpellBook обязан быть в снапшоте; тег после spells.js — косметика (spells.js и так выше), до combat-ui.js — обязательно; union-пин не ломается при вставке чужих тегов в те же слоты (000151/000152 параллельны) |
| R15 | schema.json + KEYS sync-spells-data.js + регенерация src/spells-data.js — **атомарная тройка одной зелёной стадией** | Три защитника каталога: additionalProperties:false («каждый файл валиден»), «ключи вне схемы → exit 1» (sync-тест execFileSync), «точное зеркало» (deepEqual файл↔модуль); пропуск любого звена = красный |
| R16 | Имена полей строк/модуля: `entriesFor(sheet, catalog)` → `Array<{id, name, desc, mana, poolKey, poolName, icon}>` | Чистая функция — аргументами, не Game-чтениями: node-тест с фейковым каталогом; порядок строк = порядок `sheet.spells` (книга как изучена); poolKey: intelligence→'spellInt', wisdom→'spellWis' (та же мапа, что ATTR_POOL spells.js); icon = значение JSON как есть (путь от корня), неизвестный id → строка с голым id (name=id, desc='', mana=0, poolKey/poolName/icon=null — деградация паттерна spellName 000145), мусор → [] без исключений |
| R17 | Красные тесты — ОДИН новый файл **`tests/spellbook.test.js`** (SB1-SB11, план §6); технические репины существующих — §7 | Имя = имя модуля (конвенция tests/<module>.test.js); один файл — один осмысленный красный набор (a3: expectedRedCount=11, всё остальное зелёное) |
| R18 | Силуэты иконок (24×24, ОДИН путь, fill #e8dcc0, fill-only — система 000124): кнопка — открытая книга (две страницы со щелью по центру); огонь: spark — малая капля-пламя, fireball — шар с хвостом пламени, flame_burst — три языка, inferno — большое пламя на подставке; лёд: frost_bolt — вертикальный кристалл, blizzard — снежинка-трёхлучье; тень: chill — полумесяц, shadow_bolt — полумесяц с шаром-сгустком; исцеление: mend — скруглённый крест, light_heal — крест с лучами-ореолом, greater_heal — двойной крест; защита: magic_shield — гербовой щит, stone_skin — шестиугольный валун, ward — щит в кольце; природа: vine — лист со стеблем, nature_blessing — два листа на стебле | 16 уникальных силуэтов = читаемость в книге без подписи при 20px (иконка строки) + единая боевая палитра (000124: «новых цветов не вводим»); каждый SVG обязан пройти tests/svg.test.js ДО добавления в assets/ (инвариант 000120) |

---

## 2. Что добавлено / перенесено

**Добавлено:**
* кнопка «Книга заклинаний» (7-я в панели, позиция fire — 2-я) — из единой
  таблицы combat-keys.js; иконка `assets/ui/combat_spellbook.svg`;
  aria-label «Книга заклинаний»; клавиши KeyQ (primary) / KeyR;
* книга в бою: контейнер `.combat-spellbook` в `.combat-side` (между
  `.combat-actions` и `.combat-log`), строки `.combat-spellrow` (div,
  не button): иконка + имя + meta (мана + пул) + описание;
  disabled-строка — opacity .4, title = reason из canCastSpell;
  клик живой строки = каст (R7); пустая книга — одна строка «—»
  (паттерн 000145);
* модуль `src/spellbook.js` (`Game.SpellBook.entriesFor`) — чистые
  данные строк;
* ветка `canDoAction(c, 'spellbook')` в combat.js (аддитивная, R4);
* `assets/spell-icons/<id>.svg` ×16 (R18) + поля `icon`/`icon_prompt`
  в 16 JSON + schema.json (R2, R15) + перегенерированный
  `src/spells-data.js` (зеркало несёт и новые ключи);
* тесты: `tests/spellbook.test.js` (SB1-SB11) + технические репины
  (§7).

**Перенесено (паттерны, источники живые):**
* строки книги «Персонаж» (000145, ui-tab-skills.js: div-строка +
  span-имя + span-meta, rebuild in place, строка «—» при пустой) —
  визуальная/структурная близость;
* канал `c._fx = {action:'cast'}` (000047) — тот же, что у legacy fire;
* логики disabled/title — 000037 (canDoAction для кнопки;
  canCastSpell для строк — зеркало того же уровня).

**Удалено из UI:** действия fire/heal из таблицы COMBAT_KEYS,
ACTION_LABELS и thunk'ов runAction; иконки combat_fire/heal.svg
(орфаны). **Ядро legacy НЕ тронuto** (§4).

## 3. Где живёт книга в бою и что такое «активный персонаж»

* **Контент** — `p.spells` носителя (массив каталожных id) →
  `Game.SpellBook.entriesFor(unitOf(c), G.SpellsData.SPELLS_BY_ID)`
  в момент render (лениво, при открытой книге). Порядок = порядок
  изучения. Имена/описания/мана/атрибут — из каталога
  (SpellsData — зеркало JSON).
* **Состояние «книга открыта»** — `let bookOpen = false` в closure
  combat-ui.js; reset в build() и finish(); toggle — по кнопке
  (runAction 'spellbook', с canDo-гардом) и по KeyQ/KeyR
  (handleCode — без изменений: canDoAction даёт ok/reason).
* **Активный персонаж (v1, до 000167/000168) = `c.player` (герой).**
  Единственная точка выбора носителя в UI — `unitOf(c)` в
  combat-ui.js (возвращает c.player). Второй носитель-читатель —
  ветка canDoAction ('spellbook' → `c.player.spells`) — это точка
  ядра, менять её может ТОЛЬКО задача про очередь (000167/000168).
  **Процедура ребейза:** если на момент ребейза/мержа 000167 УЖЕ в
  master — обе точки переключить на `activeUnitId(c)` (контракт —
  memory/000167-initiative-core.md после мержа; до 000168 активный
  юнит всё равно 'player' — D5/D6 000154, так что поведение
  v1 идентично; переключение — задел). Если НЕ смержена — c.player,
  подключение к активной единице — задача 000168 (зафиксировано).
* **Каст** — `G.Spells.castSpell(c, id, c.targetId)`: движок 000045
  сам читает c.player/p.spells/c.ps (несёт пул по spell.атрибут −1,
  мана −spell.мани); целевое заклинание (урон/ослабление/контроль) —
  по c.targetId, иначе nearestMob; дальность 4; в бою действует
  высшая известная степень цепочки. Каст = действие, ход НЕ сгорает
  (как legacy fire).
* **HUD-строка `Огонь: N | Леч: N`** в render() — НЕ тронута (пулы
  spellInt/spellWis живут и расходуются каталожными кастами; ТЗ HUD
  не меняет; пинов текста HUD нет — проверено grep'ом).

## 4. Контракты и границы

**Контракт `Game.SpellBook.entriesFor(sheet, catalog)`:**
* `sheet` — лист носителя (в бою — c.player): читает только
  `sheet.spells`; не-объект/спеллс-не-массив → `[]`.
* `catalog` — объект id→заклинание (SpellsData.SPELLS_BY_ID); не-объект
  → `[]` (строки с голыми id НЕ строим — нет данных ни у кого).
* Выход: `Array<{id, name, desc, mana, poolKey, poolName, icon}>`,
  порядок = `sheet.spells`; каталожное id → поля из каталога
  (name=название, desc=описание, mana=мани, poolKey/poolName по
  атрибуту, icon=значение JSON); некаталожное id → `{id, name:id,
  desc:'', mana:0, poolKey:null, poolName:null, icon:null}`.
* Чистая функция: без Game-чтений в теле factory, без console,
  без мутаций аргументов (000038-паттерн: `const G = rootRef.Game || {}`
  в factory — но entriesFor НЕ читает G: каталог — аргумент).

**Контракт DOM (build/render combat-ui.js):**
```
div.combat-side:
  … .combat-turnorder → .combat-hpbar → .combat-state →
  .combat-actions (7 кнопок) →
  div.combat-spellbook[style.display='none']        (НОВОЕ)
     строка: div.combat-spellrow[data-spell][title]
        > img.combat-spellicon (src=row.icon, alt=name)
        + div.combat-spellrow-body
            > div.combat-spellrow-top
                > span.combat-spellname
                + span.combat-spellmeta   («Мана 3 · Заклинание (Интеллект)»)
            + div.combat-spellrow-desc    (описание каталога)
  .combat-log (flex:1)
```
* disabled-строка: className + 'combat-spellrow-off' (opacity .4,
  cursor default), title = reason canCastSpell; клик — гард: если
  off — logRejection(c, reason), каст НЕ идёт (как disabled-кнопка).
* Строка «—» пустой книги — ТОЖЕ класс -off (ревью 000149): она НЕ
  кликабельна (слушателей нет) — без pointer-курсора (CSS:
  cursor default, opacity .4); «одно действие — одно поведение» (000037).
* rebuild строк — ТОЛЬКО при изменении Сигнатуры ПРИ ОТКРЫТОЙ книге
  (правки ревью 000149, БЛОКЕР): сигнатура = на каждую строку
  [id, name, desc, mana, poolName, icon, chk.ok, chk.reason] (chk —
  canCastSpell rowChk, цель/фаза/мана/пулы — внутри) + 'empty'
  при пустой. Равенство → рендер строки ПРОПУСКАЕТСЯ (элементы
  НЕ трогаются — идентичность DOM между rAF-кадрами: в браузере
  пересборка на каждый кадр убивала click — он приземляется на
  общий предок mousedown/mouseup, .combat-spellbook слушателей не
  имеет). Перестроение: `bookBox.innerHTML=''` (только реальное
  DOM, typeof-гард) + appendChild; ЛОВУШКА СТАБА: в vm innerHTML
  НЕ чистит children — строки при перестроении ДОБАВЛЯЮТСЯ, тесты
  читают ХВОСТ `bookBox.children.slice(-N)`. Сброс bookSig — в
  build() и finish(). SB12 — пин идентичности (стаб rAF: элемент
  строки не меняется между тиками; клик после тика — каст).
* закрытая книга — не пересобирается (страница не видна, дёшево).

**Контракт ветки canDoAction (combat.js, аддитивная, после 'heal'):**
```js
if (action === 'spellbook') {
  const why = checkTurn(c);
  if (why) return { ok: false, reason: why };        // 'бой закончен'/'не ваш ход'
  const blocked = checkBlocked(c);
  if (blocked) return blocked;                        // 'блок — только последнее действие'
  const book = p.spells;
  if (!Array.isArray(book) || book.length === 0)
    return { ok: false, reason: 'заклинаний нет' };
  return { ok: true };
}
```
* checkBlocked — как у fire/heal: в блоке ничего кастовать нельзя —
  кнопка disabled (полное совпадение с поведением старых кнопок).
* ПУЛЫ/МАНА в ветке НЕ проверяются (R5) — строки показывают
  детализацию.

**Контракт runAction/handleCode (combat-ui.js):**
* thunk `spellbook: () => { const r = G.canDoAction(c, 'spellbook',
  { targetId: c.targetId }); if (r.ok) toggleBook(c);
  else logRejection(c, r); }` — canDo-гард дублирует проверку
  handleCode/браузера (обязанность: клик по disabled-кнопке
  невозможен в браузере, но thunk обязан быть безопасен сам —
  зеркало 000037).
* `fire:`/`heal:` thunk'и и `_fx`-ветка `action === 'fire' || 'heal'`
  в runAction — УДАЛЕНЫ (недостижимы: ни клавиши, ни кнопки их не
  ссылают; c._fx 'cast' пишет клик строки).
* handleCode — **БЕЗ ИЗМЕНЕНИЙ** (ветка canDoAction покрывает ключи).
* c._fx при касте из книги: `c._fx = { action: 'cast', until:
  nowMs() + FX_MS }` — та же форма, что у legacy fire (000047);
  пишется click-обработчиком строки ПРЯМО (не через runAction).

**Контракт данных (assets/spells, R2/R15):**
* schema.json: +properties `icon` `{type:'string',
  pattern:'^assets/[a-z0-9_-]+/[a-z][a-z0-9_]*\\.svg$'}` (форма:
  относительный путь от корня внутри assets/; ТОЧНЫЙ каталог
  spell-icons + имя=id+'.svg' пиняют НОВЫЕ тесты, не схема) и
  `icon_prompt` `{type:'string', pattern:'^\\S(.*\\S)?$'}` (непустая);
  +оба в `required` (конец массива); `additionalProperties:false` —
  как есть.
* 16 JSON: в конце объекта `"icon": "assets/spell-icons/<id>.svg"`,
  `"icon_prompt": "<промпт>"` — порядок в файле не значим для
  sync (канонический порядок вывода — KEYS).
* sync-spells-data.js: `KEYS += 'icon', 'icon_prompt'` (хвост
  канонического порядка — совпадает с хвостом schema.required).
* src/spells-data.js — ПЕРЕГЕНЕРАЦИЯ скриптом (не руками).
* **Формат icon_prompt (шаблон, уникальный детализирующий фрагмент на
  заклинание):** «Плоская одноцветная иконка для игры «Приключения
  Флогистона»: <силуэт из R18>, школа <школа>, степень <N>. 24×24,
  заливка #e8dcc0, тёмный фон, единый силуэт, без обводки, без
  градиентов, без текста.» — промпт для (пере)генерации иконки;
  сам SVG рисуется вручную по этому промпту (инвариант: SVG обязан
  пройти svg.test.js ДО каталога).

## 5. Ленивые ссылки и guards (000038)

* `spellbook.js` — при загрузке НОЛЬ чтений Game/DOM/console
  (entriesFor — аргументы; паттерн party.js 000145); в factory
  только `const G = (root.Game) || {}` — и тот НЕ используется
  функциями (чистота) — либо без него вовсе (как party.js).
* combat-ui.js читает `G.SpellBook` ЛЕНИВО в момент render/toggle
  (снапшот G один раз при загрузке — тег spellbook.js ДО combat-ui.js,
  пин index-order R14). Guard: `G.SpellBook` отсутствует (регрессия
  порядка) → `console.error` ОДИН раз (closure-флаг) + книга
  деградирует: открывается, строки — с голыми id (entriesFor
  недоступен → UI сам строит fallback-строки из p.spells, как
  spellName 000145), каст по строке — через G.Spells (он в снапшоте
  всегда: тег spells.js выше) — игра не падает.
* `G.SpellsData` отсутствует (каталог = null) → `entriesFor` даёт `[]`
  → пустая книга: одна строка «—» (тихо, паттерн 000145).
  (Строки с голыми id — только в ветке «нет G.SpellBook».)
* `G.Spells` отсутствует → строки рисуются, ВСЕ disabled, title
  «Заклинания недоступны» (кнопка — по ветке canDoAction: c.player —
  есть, книга непуста → ok; строки — guard).
* Пустая книга → кнопка disabled (title «заклинаний нет»), строка «—».
* `c.result` / phase ≠ player → кнопка и строки disabled (цикл
  render + ветка canDoAction).

## 6. Красные тесты (tests/spellbook.test.js — НОВЫЙ, SB1-SB11)

Часть A/B — vm (цепочка = loadCombatUi-аналог + `spells-data.js`,
`spells.js` ПОСЛЕ combat.js, ДО combat-keys.js (позиции index.html
L808/809/836) + `spellbook.js` ПЕРЕД combat-ui.js; в красной фазе —
свой helper c assert.fail «модуль не существует (задача 000149)»,
ленивый fs.readFileSync по образцу loadCombatUi L145-150):

| id | проверка | red-причина сейчас |
|---|---|---|
| SB1 | среди кнопок `.combat-actions` НЕТ `dataset.act==='fire'`/`'heal'`; ЕСТЬ ровно одна `dataset.act==='spellbook'`; всего 7 кнопок; иконка `assets/ui/combat_spellbook.svg` (существует); aria «Книга заклинаний» | 8 кнопок с fire+heal, spellbook нет |
| SB2 | книга скрыта по умолчанию; клик по кнопке И KeyQ И KeyR — toggle (display ≠ 'none', строки построены) | кода книги нет |
| SB3 | строки 1:1 с c.player.spells (порядок; имя = SPELLS_BY_ID[id].название; desc = описание; meta `Мана N · Заклинание (Интеллект/Мудрость)`); `p.spells=[]` → строка «—» | нет строк |
| SB4 | клик живой строки «Искра» (target выбран, c._rng=()=>0.99) = каст через G.Spells.castSpell: c.ps.spellInt −1, p.mp −3, log `Искра по <моб>: <N>.`, c._fx.action==='cast', книга закрылась, ход НЕ сгорел (phase 'player', тот же раунд); каст без маны (mp=0) — без расхода, reason «не хватает маны (3)» в c.log, книга открыта | нет проводки строка→castSpell |
| SB5 | disabled-логика: phase 'mob' → кнопка disabled; c.result → disabled; фаза игрока + непустая книга → enabled; пустая книга → disabled + title «заклинаний нет»; disabled-строка (mp=0) — клик без каста, reason в лог | ветки нет |
| SB6 | (node) entriesFor(createCharacter(), SPELLS_BY_ID): 2 строки (spark, mend) в порядке sheet.spells, поля name/desc/mana/poolKey/poolName/icon; неизвестный id → строка с голым id (icon=null), без исключения; мусор (null/не-массив) → [] | модуль не существует |
| SB7 | (node) COMBAT_KEYS: значений action НЕТ 'fire'/'heal'; ЕСТЬ 'spellbook'; KeyQ primary + KeyR (дубль); describeCombatKeys — 7 записей, spellbook: label «Книга заклинаний», primaryKey KeyQ, keys ['KeyQ','KeyR'] | таблица fire/heal, 8 записей |
| SB8 | (node) canDoAction(c,'spellbook'): непустая книга + фаза игрока → ok; пустая → {ok:false, reason:'заклинаний нет'}; phase 'mob' → 'не ваш ход' | «неизвестное действие: spellbook» |
| SB9 | (node) каждый из 16 JSON assets/spells: `icon` — непустая строка (форма схемы), `icon_prompt` — непустая; schema.required содержит оба | полей нет |
| SB10 | (node) файл по `icon` существует; иконки в `assets/spell-icons/` с именем `id + '.svg'`; в assets/spells — только NNNNNN.json + schema.json (регрессия закрытости) | файлов нет |
| SB11 | (node) каждый новый SVG (16 + combat_spellbook) — checkSvg → [] (well-formedness + корень svg + xmlns + viewBox 4 числа + без NaN) — DO каталога | файлов нет |

**Ожидаемо красных — ТОЛЬКО SB1-SB11** (11), весь остальной набор —
зелёный; красные — осмысленные assert'ы, не краш загрузки.

## 7. Технические репины существующих тестов (зелёная стадия)

1. `tests/combat-ui.test.js`:
   * L239-250 «8 штук» → 7; acts sorted =
     `['attack','block','endTurn','flee','invItem','quickItem','spellbook']`;
   * иконки-тест (000124, master ~L1053-1082): 8→7;
     `combat_spellbook.svg` сам проходит regex+existsSync;
   * L625 «c._fx — cast (fire)»: сценарий → KeyQ (открыл книгу) +
     клик по строке «Искра» → `c._fx.action==='cast'`;
   * `loadCombatUi` цепочка: + `'spells-data.js','spells.js'` ПОСЛЕ
     `'combat.js'`, ДО `'controls.js'` (позиции index.html; реальные
     файлы — без гарда) + `'spellbook.js'` ПЕРЕД `'combat-ui.js'`
     **с existsSync-гардом** (красная фаза: файла нет → тихий
     пропуск, осмысленный красный несёт spellbook.test.js; иначе
     54+ тестов падали бы ENOENT-крахом; паттерн combat-scale 000151);
   * L270/L294 (KeyQ — «любое действие → render») — проверить после
     реализации: KeyQ теперь toggle книги, render() всё равно идёт —
     вероятно без правки.
2. `tests/combat-keys.test.js`: ACTIONS (L27): −fire/−heal/+spellbook;
   L124 (primary-список) +spellbook; L172-179 resolve KeyQ →
   spellbook (причины — по ветке canDoAction: фаза не игрока →
   «не ваш ход»; hero с непустой книгой в фазе игрока → ok);
   L218-239 describeCombatKeys → 7 записей (spellbook: label
   «Книга заклинаний», primaryKey KeyQ, keys ['KeyQ','KeyR']);
   L241-250 подписи: −«Огонь [Q]»/−«Исцел. [R]»/
   +«Книга заклинаний [Q]».
3. `tests/svg.test.js`: EXPECTED_SVG_BY_DIR: `'ui': 10 → 9`
   (−fire, −heal, +spellbook), `+'spell-icons': 16`.
4. `tests/index-order.test.js`: + `'src/spellbook.js'` в «нужные
   модули подключены»; + pin-блок (НЕ-смежный union, паттерн
   000145/000151): существует, ПОСЛЕ `src/spells.js`, ДО
   `src/combat-ui.js`.
5. `tests/combat.test.js` — **БЕЗ ИЗМЕНЕНИЙ** (ядро: только
   аддитивная ветка; пин «неизвестное действие: dance» — 'spellbook'
   теперь известно ДО fallback, 'dance' — нет).
6. `tests/spells.test.js` — **БЕЗ ИЗМЕНЕНИЙ** (схема/JSON расширяются
   атомарно на зелёной; «чужих файлов нет» — зелёный, иконки не в
   каталоге; deepEqual-зеркало подхватит новые ключи после sync).

## 8. Что НЕ тронуто (жёсткие границы)

* `src/combat.js` — legacy `playerSpell`/`c.spell('fire'/'heal')` и
  ветки canDoAction 'fire'/'heal' — байт-в-байт (≈439 пинов
  combat.test.js: «Огненная стрела по X: N.», «здоровье полное»,
  «не хватает маны (3)» …); очередь хода/turnOrder/turnIndex — 000167;
  A* (000155) mobAct/stepToward — не трогать.
* `src/spells.js` — движок 000045 (castSpell/canCastSpell/
  evalSpell/высшая степень/пулы/практика) — новый потребитель,
  не правится; ~200 пинов spells.test.js.
* `assets/spells/` (16 JSON — только +2 поля), `schema.json` (только
  +2 properties/required), sync-скрипт (только KEYS),
  `src/spells-data.js` (только перегенерация).
* Базовые CSS `.combat-overlay/.combat-side/.combat-log/
  .combat-state` и `.combat-actions` (000124 — стражи
  combat-layout.test.js); чужие оверлеи (подземелье/NPC/постройка).
* `c.turnOrder`, пулы `c.ps` (кроме расхода существующим движком),
  RNG/детерминизм (каст — существующие формулы, `_rng` — в ядре),
  формат сейвов (`p.spells` — существующее поле), HUD-строки render()
  («Огонь: N | Леч: N» — подписи пулов, не кнопок).
* main.js — 0 строк (проводки нет: книга — внутри боевого оверлея).

## 9. Что важно будущим задачам (ссылки ТЗ)

* **000167 (инициатива, в работе)**: порядок мержей **000167 → 000149
  → 000168** (memory/000154-initiative.md §подводные камни). Наша
  правка combat.js — ОДНА аддитивная ветка в canDoAction (000167
  трогает очередь/buildTurnOrder — другие функции; если 000167
  допишет canDoAction — конфликт решается объединением веток).
  На ребейзе: сверить по content-маркерам (ветка 'heal' → 'block'
  в canDoAction; build() — после `side.appendChild(actions)`;
  render() — после disabled-цикла `.combat-actions button`), не по
  номерам (000151 сдвинул combat-ui.js на +141 строк:
  measureBacking/onResize/setTransform — регионы canvas/resize, наши
  ханки — DOM-часть, пересечения ожидаются минимальными).
* **000168 (игрок управляет спутниками)**: «заклинания союзников
  через книгу — НЕ v1» (D9 000154). Точки подмены: (1) `unitOf(c)` в
  combat-ui.js — c.player → лист активной единицы (по
  activeUnitId(c)); (2) ветка canDoAction 'spellbook' — c.player.
  spells → книга активного; (3) ГЛУБЖЕ: evalSpell/castSpell в
  spells.js сами читают c.player/c.ps — каст союзником потребует
  unit-аргумента в движке 000045 — это уже работа 000168 (зафиксировать
  в её ТЗ/памяти). entriesFor(sheet, catalog) — готов к любому
  sheet (наёмник/Эфир).
* **Legacy-уборка**: после 000168 c.spell('fire'/'heal') + ветки
  canDoAction 'fire'/'heal' — мёртвый код ядра (UI их не
  ссылаёт; ~439 пинов) — кандидат на ОТДЕЛЬНУЮ cleanup-задачу
  (НЕ в 000149: ядро не трогаем — инвариант «не больше, чем просит
  ТЗ»).
* **Иконки**: при изменении каталога `assets/spell-icons/` или
  формата `icon` — синхронно: schema (pattern), JSON (16),
  sync KEYS, spells-data.js, SB10 (имя/каталог), svg.test.js
  (счётчик). Промпт генерации — в JSON (`icon_prompt`) — source of
  truth для (пере)генерации силуэтов.

## 10. Подводные камни

1. **UMD-ловушка 000038**: тег spellbook.js ДО combat-ui.js (снапшот);
   ленивое чтение G.SpellBook в момент вызова; guard console.error 1×
   + деградация (красная фаза: файл ещё нет — existsSync-гард в
   loadCombatUi-цепочках).
2. **vm-стаб**: строки НЕ `<button>` (счётчик buttons); textContent=''
   НЕ очищает children — тесты строк читают `children.slice(-N)`;
   img.src/title/dataset/style — простые свойства стаба (работают);
   клик по строке — `row.listeners.click[0]()`.
3. **Каталог assets/spells закрыт**: иконки ТОЛЬКО в spell-icons/
   (подкаталог в spells/ — красный «чужих файлов нет»); schema —
   additionalProperties:false (новые поля — в schema, атомарно).
4. **Атомарная тройка** schema/KEYS/spells-data.js — одна стадия,
   иначе красные: «каждый файл валиден» / sync exit 1 /
   «точное зеркало».
5. **canDoAction — чистая**: в ветке 'spellbook' НОЛЬ побочных
   эффектов (не создавать p.spells — читать `p.spells` напрямую,
   как быстрые слоты в quickItem).
6. **c._fx 'cast'** пишется клик-обработчиком строки (не runAction —
   fire/heal-ветка удалена); форма `{action:'cast', until: nowMs()+
   FX_MS}` — пины 000047 (until > NOW).
7. **Rebase-горячий файл**: src/combat-ui.js (000151: +141 строка —
   canvas-sizing build, setTransform render, onResize; тесты
   +307). Наши ханки — DOM-регионы (после actions в build; thunk
   runAction; после disabled-цикла в render) — сверять по
   content-маркерам; после ребейза — ПОЛНЫЙ npm test.
8. **Детерминизм/сейвы/RNG**: книга выбирает id; каст — существующий
   движок; новых вызовов c._rng, новых полей сейва — НЕТ.
9. **CSS**: только НОВЫЕ классы со скоупом `.combat-overlay--combat`,
   один блок в конце <style>; `:disabled` у div-строк НЕТ —
   className '-off'; новые цвета не вводить (000124) — inherit +
   font-size.
10. **Флаки**: при случайном падении чужого теста — перепуск
    `node --test tests/<файл>` + запись в tasks/result/000149.md.

## 11. Итоговый план реализации (файлы / ожидаемая дельта)

Порядком коммитов (паттерн 000145):
1. **Красные**: tests/spellbook.test.js (SB1-SB11) + технические
   репины (combat-ui.test.js: 7 кнопок/acts/иконка/cast-FX/цепочка
   с гардом; combat-keys.test.js; svg.test.js счётчики; index-order)
   + этот файл. npm test: база зелёная + 11 красных.
2. **Данные**: assets/spells/schema.json + 16 JSON (icon/icon_prompt)
   + sync KEYS + регенерация spells-data.js + 16 SVG
   assets/spell-icons/ (каждый — svg.test.js ДО каталога) +
   assets/ui/combat_spellbook.svg + удаление combat_fire/heal.svg.
3. **Код**: src/spellbook.js + combat-keys.js (таблица/лейблы) +
   combat.js (ветка) + combat-ui.js (build/runAction/render/click)
   + index.html (тег + CSS-блок).
4. Правки по ревью. 5. Отчёт tasks/result/000149.md + pending→done.
6. Ребейз на master (000151/000161 в нём; сверить §9) + полный npm
   test + CHANGELOG (отдельный коммит, дата мержа): `## <дата>` →
   `### Игровой процесс` → буллит: «В бою вместо двух кнопок «Огонь»
   и «Исцел.» — одна «Книга заклинаний»: раскрывает все известные
   заклинания с описаниями, стоимостью маны и действия, иконками;
   выбор строки применяет заклинание.» (готовить текст на мерже —
   секция `## 2026-10-07` на master уже существует).

| файл | действие | Δ строк |
|---|---|---|
| `src/spellbook.js` | НОВЫЙ: UMD, `Game.SpellBook={entriesFor}`, 0 зависимостей | ~+85 |
| `src/combat-keys.js` | −fire/−heal (лейблы+таблица), +spellbook (лейбл+KeyQ primary/KeyR), шапка | ±8 |
| `src/combat.js` | аддитивная ветка canDoAction 'spellbook' (после 'heal') | +12 |
| `src/combat-ui.js` | build: bookBox (+8); runAction: −fire/−heal thunk'и, +spellbook (гард), −'cast'-ветка fire/heal (±6); render: renderBook (+~45: строки entriesFor+canCastSpell, click→cast+_fx+close, строка «—»); finish: reset (+1); шапки-комменты | ~+70/−6 |
| `index.html` | тег spellbook.js (после spells.js, +3 c комментом) + CSS-блок (конец <style>, ~22) | +25 |
| `assets/spells/schema.json` | +icon/+icon_prompt (properties+required) | +12 |
| `assets/spells/0000*.json` ×16 | +icon +icon_prompt | +2×16 |
| `assets/spell-icons/*.svg` ×16 | НОВЫЕ (24×24, #e8dcc0, один путь, R18) | ~+4×16 |
| `assets/ui/combat_spellbook.svg` | НОВОЕ (открытая книга) | +4 |
| `assets/ui/combat_fire.svg`, `combat_heal.svg` | УДАЛИТЬ | −8 |
| `scripts/sync-spells-data.js` | KEYS += icon, icon_prompt | ±1 |
| `src/spells-data.js` | ПЕРЕГЕНЕРАЦИЯ (генератором) | +32 |
| `tests/spellbook.test.js` | НОВЫЙ: SB1-SB11 (vm+node, свой helper с цепочкой) | ~+550 |
| `tests/combat-ui.test.js` | репины §7.1 (7 кнопок, acts, иконки, cast-FX, цепочка) | ±35 |
| `tests/combat-keys.test.js` | репины §7.2 | ±20 |
| `tests/svg.test.js` | 'ui': 10→9, +'spell-icons': 16 | ±2 |
| `tests/index-order.test.js` | +spellbook.js в список + pin-блок | +20 |
| `memory/000149-combat-spellbook.md` | НОВЫЙ (этот файл) | ~+380 |
| `CHANGELOG.md` | запись (отдельный коммит на мерже) | +8 |
| `tasks/result/000149.md` | отчёт (финальная стадия) | ~+60 |

Итого ~21 файл, ≈+1150/−45 строк.
GREEN-критерий: `npm test` — весь набор зелёный (база + 11 SB +
новые пины); ядро/каталог/HUD/чужие оверлеи — без правок (§8).

## 12. Итоги реализации (зелёная стадия)

* Результат: `npm test` — 1799/1799 (база 1776 + 23 красных → 0 fail).
* **4 ТЕХНИЧЕСКИЕ правки tests/spellbook.test.js** (красный коммит не
  прогнал их через vm-песочницу; смысл ассертов не изменён):
  1. SB3-прекондиция `deepEqual(c.player.spells, ['spark','mend'])` →
     `[...c.player.spells]`: c.player создан в vm-контексте, и
     deepStrictEqual сравнивает ПРОТОТИПЫ — vm-массив «не равен»
     host-литералу даже по структуре (cross-realm-ловушка Node vm);
  2. SB3: волк спавнится (seed 42) на (1,0), герой (3,6) — дистанция
     8 > дальности каталога 4 → «Искра» была бы строкой -off «цель
     слишком далеко»; добавлено перемещение волка в упор (как в SB4) —
     проверяется содержимое строк, а не дальность;
  3. SB4(a): волк ур. 1 при средней сложности (diff.hp 0.45) имеет
     maxHP 4, а «Искра» бьёт 5 — единственный моб умирал и бой
     завершался ДО проверки «ход не сгорел»; тест-буфер `m0.maxHP += 6;
     m0.hp += 6` (→ maxHP 10, число из формулы без множителя сложности)
     — проверяется экономика хода каста, не убийство;
  4. SB11 `deepEqual(errs, [])` → `[...errs]` — та же cross-realm-
     ловушка (checkSvg живёт в vm-песочнице, её [] — другой realm).
* Реализация: как в §11; строки книги — перестроение ТОЛЬКО при
  изменении сигнатуры (правки ревью 000149, §13; ранее — append на
  каждый render): ЛОВУШКА СТАБА — innerHTML в DOM-стабе тестов НЕ
  чистит children, при перестроении строки ДОБАВЛЯЮТСЯ, тесты читают
  хвост children.slice(-N); в реальном DOM чистка через
  `bookBox.innerHTML=''` под typeof-гардом — в стабе innerHTML нет;
  unitOf(c) — единственная точка замены под 000167/000168; деградации:
  нет G.SpellBook → 1× console.error + строки с голым id; нет G.Spells
  → строки -off «Заклинания недоступны», клик — в журнал.
* Иконки: 17 SVG (16 + кнопка) — 24×24, ОДИН path, fill #e8dcc0,
  silhouettes R18; все прошли checkSvg ДО каталога (инвариант 000120).
* JSON-каталог: формат исходных файлов СОХРАНЁН (компактные массивы),
  добавлены только два поля в конце объекта; src/spells-data.js —
  перегенерация скриптом (зеркало byte-идентично повторному прогону).

## 13. Правки по итогам ревью (2026-10-07, станция «Правки»)

Пять findings трёх ревьюеров — вердикты и фиксы:

1. **БЛОКЕР — строки пересоздавались каждый кадр rAF, клик терялся
   в реальном браузере** (реален): rAF-цикл (000047) → render() →
   renderBook() → `innerHTML=''` + append КАЖДЫЙ кадр; click по
   спецификации HTML — на общем предке mousedown/mouseup, элемент
   строки за нажатие (>= 50 мс) заменялся, click приземлялся на
   .combat-spellbook (0 слушателей) — каст мышью невозможен.
   vm-тесты слепы: в песочнице без стаба rAF цикла нет, стаб DOM
   без innerHTML/click-семантики. Корень — решение §4 копировать
   паттерн пересборки renderTurnOrder (нестроки НЕ интерактивны) на
   ИНТЕРАКТИВНЫЕ строки. **Фикс**: сигнатура строк (bookSig, §4),
   перестроение только при изменении; rowChk — общий предпросмотр
   (один canCastSpell на строку на рендер); сброс bookSig в build/
   finish. **Пин**: SB12 (стаб rAF: элемент строки тот же между
   тиками + клик после тика = каст; на старом коде — красный,
   проверено).
2. **МИНОР — плейсхолдер «—» пустой книги с pointer-курсором без
   кликабельности** (реален): строка «—» получила класс
   `combat-spellrow-off` (CSS: cursor default, opacity .4) —
   «одно действие — одно поведение» (000037). Пин — SB3
   (содержимое строки) + класс в коде.
3. **МИНОР — деградационные гарды (memory §5) без тестов** (реален):
   SB13 (без G.SpellBook: 1× console.error, строки с голым id, без
   иконки, повторные рендеры не пишут) + SB14 (без G.Spells: строки
   -off «Заклинания недоступны», клик — reason в журнал, без расхода/
   краха). Технически: loadBookUi({skip: [...]}) — цепочка без файла.
4. **МАЖОР — не было CHANGELOG-коммита на ветке** (реален):
   исправлено ДО этой станции — коммит 6d41469 (буллит в блоке
   ## 2026-10-07 → ### Игровой процесс, формат по записям, без
   программной части).
5. **МИНОР — в §5 неточно: «без G.SpellsData → строки с голыми id»**
   (реален, только документация): фактически — одна строка «—»
   (entriesFor(unit, null) = []); голые id — только в ветке «нет
   G.SpellBook». Исправлено ДО этой станции — коммит 8df58da.

Итог: npm test — 1802/1802 (было 1799; +3 SB12-SB14).
