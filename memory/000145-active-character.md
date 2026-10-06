# 000145 — «Персонаж»: выбор активного персонажа + прокачка его навыков

Станция «Проектирование» (2026-10-06, рестарт workflow). Worktree:
`/home/sas/Documents/Art/thegame/.worktrees/task-000145`, ветка
`task/000145`. База = master **3c0e1b4** (000140/000141/000142/000143/
000144 ВСЕ смержены; тестовая база 1732/1732 зелёных, проверено прогоном).
ТЗ (source of truth): `tasks/pending/000145.md`. Родитель — 000139
(унификация прокачки, контракт `memory/000139-skill-unification.md`
§2/§6.3/§9.1). Соседние контракты: `memory/000140-sheet-model.md`,
`memory/000142-portraits-catalog.md`, `memory/000143-merc-sheet.md`,
`memory/000144-efir-sheet.md`, `memory/000130-ui-tabs.md`,
`memory/000116-efir-tab.md`.

---

## 1. Что сделано (состав изменений)

**Новые файлы:**
* `src/party.js` (~100 строк) — `Game.Party = { list, active }`, чистый
  UMD (образец `src/cities.js`), НОЛЬ зависимостей при загрузке.
* `tests/ui-tab-skills-active.test.js` (~500 строк) — красные: ЧАСТЬ A
  (node: `require('src/party.js')` — A1-A8) + ЧАСТЬ B (vm-песочницы:
  B1-B9; B4 — зелёный регрессийный hero-raise). Механика — как
  существующие UI-тесты (динамический CHAIN, паттерн tests/ui-efir.
  test.js L174; стаб DOM обогащён `тег[атрибут]`-селекторами по образцу
  tests/squad-panel.test.js L63-88).
* `memory/000145-active-character.md` (этот файл) + `tasks/result/
  000145.md` (отчёт, финальная стадия).

**Меняемые файлы:**
* `src/ui-tab-skills.js` — 215 → ~370 строк (Δ+155): ряд портретов,
  активный лист, «Книга заклинаний», «Вдох Эфира», record-поле
  `raiseSkill(skillId, ctx)`, game-снапшот `G.Party`.
* `src/ui.js` — 1489 → ~1530 строк (Δ+40): closure `activeCharId`,
  `ctx.activeCharId`, ветка `.cp-portrait`, raise-маршрутизация через
  record, `toggle(force, tabId, charId)`, `G.playerUI.getActiveCharId()`,
  squad: `data-partytab` + `gotoCharacterTab` + порядок веток.
* `index.html` — Δ+25: тег `src/party.js` (после `combat-keys.js` L813,
  до comment-блока вкладок/ui-tabs.js L820) + ОДИН CSS-блок в конце
  `<style>` (перед L737).
* `tests/index-order.test.js` — Δ+25: `'src/party.js'` в «нужные
  модули подключены» (L35-71) + новый pin-блок после блока 000140
  (последний в файле): party.js существует, ПОСЛЕ combat-keys.js, ДО
  ui-tab-skills.js, ДО ui.js (НЕ-смежный union).
* `tests/ui-skills.test.js` — Δ+2 (HARDCODED CHAIN L129-138):
  `+ 'portraits-data.js'` (между `'npc-data.js'` и `'map.js'` — как в
  index.html L755→L760→L761), `+ 'party.js'` (между `'combat-keys.js'`
  и `'ui-tabs.js'` — L813/820). ТЗ прямо предписывает: «HARDCODED
  CHAIN — обновить при добавлении скриптов».
* `tests/ui-panel.test.js` — Δ+10: те же 2 вставки в HARDCODED CHAIN
  (L264) + node-require-тест (L1880+): `files += 'party.js'` +
  special-branch (`typeof m.list === 'function'`, `typeof m.active ===
  'function'`).
* `CHANGELOG.md` — 1 запись (отдельный коммит в день мержа;
  player-visible: выбор активного + прокачка всей партии).

**Не меняется (жёсткие границы):** `src/sheet.js`, `src/companions.js`,
`src/efir.js` (публичный API только — ТЗ), `src/main.js` (**0 строк** —
проводка уже есть: `setCharacter` L225, `squadUI.init({roster, efir,
onChange: saveNow})` L529-530, `__game.state` L2488+), `src/hud.js`,
`src/ui-tab-efir.js` (живёт до 000146), `src/ui-tabs.js`, остальные
`ui-tab-*.js`, `src/portraits-data.js` и `assets/portraits/*` (000142),
touchControls в ui.js (L1270+ — 000154), блок «Отряд» диалога NPC
(ui.js L689-708, data-npcact — вне ТЗ), боевые регионы (000152/000155).

**Пины, которые проходят БЕЗ правки:** ui-skills (11: банк «lvl
(bank/need)», строка потолка, структурный `/skillXp/`+`/practiceCap/`,
reason «нет свободных очков навыков» — литералы сохраняются в
hero-пути), ui-panel (76: реестр 7 вкладок с «Эфир» 4-м до 000146,
ОДИН click-обработчик, `.cp-title = c.name`, saveNow-сканнеры —
readdir-сканнер L2050 автоматически покрывает изменённый
ui-tab-skills.js), ui-efir E1-E11 (вкладка «Эфир» и её СТРОКА в
«Отряде» не тронуты — E9 зелёный), squad-panel P1-P6/S1-S3 (байты
строк, P5 «уволить»), index-order (все старые пины), все boot-тесты
(errors 0), save (нового поля НЕТ — 000031), combat/sheet/efir/
companions/player (read-only, публичный API).

**0 SVG-ассетов** (портреты — 000142; новых svg нет → svg.test.js не
затронут), **0 новых полей сейва**, **0 строк main.js**, **0 новых
setTimeout** (вспышка 1,5 с — существующая), **0 RNG**.

---

## 2. Контракт `Game.Party` (src/party.js)

```js
// UMD: node — module.exports = factory() (определение); браузер —
// root.Game = Object.assign({}, G0, { Party: factory() }) (000018/
// 000038). При загрузке: НОЛЬ чтений Game/DOM/require/console
// (данных нет — деградировать нечему; паттерн skills-data/npc-data).
Game.Party = { list(src), active(listArr, id) };
```

### 2.1 `list(src)` — список партии (ЧИСТАЯ функция)

* Вход `src = { hero, efir, efirMet, roster, npcs }` — все опциональны;
  не-объект/мусор — деградация без исключений.
* Выход: `Array<{ kind, id, name, role, sheet, npc? }>`, порядок
  **hero → efir → mercs (порядок roster)** — детерминированно:
  * hero — ВСЕГДА первым (если `src.hero` — объект):
    `{ kind:'hero', id:'flogiston', name: hero.name || 'Флогистон',
    role:'Герой', sheet: hero }`. **sheet = live-ссылка** (мутация
    in place — цель: один лист на всех). Герой БЕЗ поля `kind` в
    объекте (000140 R-1: JSON-байты сейва 000031) — kind присваивает
    list.
  * efir — только при `src.efirMet === true` И `src.efir` — объект:
    `{ kind:'efir', id:'efir', name:'Эфир', role:'Дух', sheet: efir }`.
    (ТЗ: «Эфир — только при efir_met»; гейт top-level save-поля,
    main.js L239/L248.)
  * mercs — по `src.roster` (live-массив записей 000143: `{npcId,
    sheet, level, xp, loyalty, hiredDay}`; записи roster = нанятые):
    `{ kind:'merc', id: e.npcId, name: npc.имя || String(e.npcId),
    role: <см. 2.2>, sheet: e.sheet, npc: npc||null }`. Запись без
    `npcId`/без `sheet` — «призрак», тихий skip. `npc` — из
    `src.npcs` (каталог `G.NpcData.NPCS`) по `n.id === e.npcId`.
* `name`/`role` — только для UI (заголовок/tooltip); данные листов
  (level/points/primary/secondary/skillXp/spells) — в `sheet`.
* Пуританство: без мутаций аргументов; ссылки (sheet/npc) — как есть.

### 2.2 `role` (текст tooltip/статуса)

* hero → `'Герой'`; efir → `'Дух'` (статичные = PORTRAITS.title).
* merc → каталожная роль + найм-класс: `(npc.роль || 'наёмник')` +
  (npc.hire.role — строка ? `' (' + npc.hire.role + ')'` : ``) →
  `'Наёмник (melee)'`/`'Наёмница (ranged)'`/`'Наёмник (shield)'`/
  `'Наёмница (support)'`. БЕЗ каталога (npc = null) → `'наёмник'`.
  **Почему**: ТЗ требует tooltip «Наёмник (роль)»; один источник
  данных — каталог npc-data (role top-level + найм.роль), без
  дублирования данных в UI.

### 2.3 `active(listArr, id)` — выбор активного (ЧИСТАЯ функция)

* `listArr` не-массив/пусто → `null`.
* `id == null || id === ''` → `listArr[0]` (дефолт = первый =
  Флогистон).
* `id` найден → этот member; **неизвестный/stale id → `listArr[0]`**
  (тихий fallback: наёмник уволен / Эфир не встречен — не ошибка,
  не крах, не console.error).

### 2.4 ID-пространство (ОДИН id на всё)

`member.id` = id портрета (000142: связка `entry.npcId` / `'flogiston'`
/ `'efir'` → `PORTRAITS.find(p => p.id === …)`) = значение
`data-partytab` в строках «Отряда» = аргумент
`toggle(…,'character', id)`:
* hero → `'flogiston'`; efir → `'efir'`; merc → `entry.npcId`
  (`'merc_volk'`…`'merc_rena'`).
* `p.kind` из PORTRAITS не читаем (kind уже в member — источник один);
  `p.icon`/`p.имя` — только в render ряда (лениво, §6).

---

## 3. DOM-контракт страницы «Персонаж» (src/ui-tab-skills.js)

### 3.1 Скелет build(pane, ctx) — ОДИН раз (порядок = контракт)

```
div.cp-portraits            → panel._portraits  (НОВОЕ; ПЕРВЫМ — СВЕРХУ)
div.cp-title                → panel._title      (как сейчас)
div.cp-stats                → panel._stats      (как сейчас)
div.cp-section «Основные навыки» + table.cp-table
    (6 строк БЕЗ ИЗМЕНЕНИЙ: td.cp-name, td.cp-level,
     button.cp-btn[data-skill], td.cp-tipcell > div.cp-tip)
div.cp-section (по каждому primary) + table.cp-table
    (вторичные БЕЗ ИЗМЕНЕНИЙ: td.cp-name, td.cp-req, td.cp-level,
     button.cp-btn[data-skill], td.cp-tipcell > div.cp-tip)
div.cp-section «Книга заклинаний» > div.cp-items → panel._book (НОВОЕ)
div.cp-section «Вдох Эфира» → panel._breathSec (НОВОЕ)
    > div.cp-stats → panel._breath (НОВОЕ; style.display='none'
    по умолчанию — виден только при kind 'efir')
```

Имена секций «Книга заклинаний»/«Вдох Эфира» и тела `_book/
_breath/_breathSec` — **стабильный контракт для 000146** (удаление
вкладки «Эфир» опирается на них).

### 3.2 Ряд иконок (render, in place: `P._portraits.textContent = ''`
и заполнение — партия меняется: найм/увольнение/встреча Эфира)

```
.cp-portraits > button.cp-portrait[data-memberid][title] > img
  активный: className 'cp-portrait cp-portrait-active'
  неактивные: 'cp-portrait'
  dataset.memberid = member.id
  title = m.name + ' — ' + m.role   («Флогистон — Герой»,
                                     «Эфир — Дух», «Вольк — Наёмник (melee)»)
  img.src = 'assets/portraits/' + p.icon   (префикс — у потребителя,
                                            000142 D2; icon = basename)
  img.alt = m.name
  порядок кнопок = порядок Party.list (hero → efir → roster)
```

* Кнопка **НЕ `.cp-btn`** (000098-ловушка: делегирование ядра и
  render итерируют `panel.querySelectorAll('.cp-btn')` — новая кнопка
  с .cp-btn попала бы в цикл строк/raise). Класс `.cp-portrait` —
  новый.
* Подсветка — className-строка (в DOM-стабах нет classList; CSS в
  index.html: `.cp-portrait-active` — border #d8c27a, палитра панели).
* Портрет конкретного member не найден в PORTRAITS — тихий skip
  иконки (целостность каталога пинята 000141/000142).
* `G.PortraitsData` отсутствует — `console.error` ОДИН раз (closure-
  флаг, паттерн coreErrorShown) + ряд НЕ рисуется, игра не падает
  (контракт 000142 §4).

### 3.3 Тела (render, in place)

* `P._title.textContent = active.name` (hero — побайтово как сейчас:
  c.name; пин ui-panel `.cp-title = c.name` держится).
* `P._stats`:
  * **hero — ПОБАЙТОВО текущий 4-строчный шаблон** (L162-166:
    `Уровень L  |  Опыт X/need\nHP hp/maxHP  |  MP mp/maxMP  |  Броня
    armor+eqA\nЗолото: gold  |  Свободные очки: P\nВес: w/maxW кг  |
    Слоты: n/SLOTS`; idиома ДВА пробела у `|` — 000041).
  * **efir/merc — 2 строки**:
    `` `Уровень ${c.level}  |  Опыт ${c.xp}/${G.xpForNext(c.level)}`\n +
    `Свободные очки: ${c.points}` ``
    (sheet 10 ключей 000140/143/144 — нет gold/inventory/hp-полей;
    `G.xpForNext` — функция только от level, работает на любом sheet).
* Таблицы (проход по `.cp-btn[data-skill]` — структура БЕЗ
  ИЗМЕНЕНИЙ), но `c = active.sheet`, API — по kind:
  `const S = active.kind === 'hero' ? G : G.Sheet;` —
  `S.canRaise(c, skill)` / `S.practiceCap(c, skill)` /
  `S.skillXpForNext(lvl)` / `S.MAX_SKILL_LEVEL` (hero: S === G —
  плоские экспорты player.js = делегаты Sheet, вывод побайтово;
  efir/merc: Game.Sheet — те же имена/семантики, 000140).
  bank = `(c.skillXp && c.skillXp[skill]) || 0`; строка потолка —
  ОДИН текст для всех kinds: `потолок практикой: {pName} {cap/2}×2 —
  дальше растёт только очками и книгами` (O3: нюанс «растёт с уровнем
  Эфира» старой вкладки — НЕ переносится; 000146 сверит).
  `G.Sheet` отсутствует при не-hero активном (недостижимо в игре —
  пин index-order) → console.error 1× + read-only (уровни рисуются,
  все «+» disabled, тултипы — из каталогов).
* «Книга заклинаний» `P._book` (rebuild in place), строки
  `div.cp-itemrow > span.cp-itemname + span.cp-itemmeta` (классы —
  дословно паттерн ui-tab-efir.js L231-262), ЧТЕНИЕ (кнопок «+» нет):
  * **hero/merc**: по `c.spells` (массив; пусто → одна строка
    `—`): имя = `G.SpellsData.SPELLS_BY_ID[id].название`, fallback —
    голый id (тихо).
  * **efir — ВСЕГДА 10 строк** (канонический порядок: старт сперва,
    затем UNLOCKS по возрастанию порога):
    (a) `G.efir.efirSpellsByLevel(1)` (экспортирован — 2 id:
    spark/mend) + (b) `G.efir.EFIR_SPELL_UNLOCKS` (экспортирован —
    8 пар [порог, id]: 5/8/10/12/15/20/25/30). Метка `cp-itemmeta`:
    изученный (`c.spells.indexOf(id) >= 0`) → `уровень N` (N = 1 для
    стартовых, порог из UNLOCKS для остальных); НЕизученный →
    `откроется на N-м уровне`. Это и есть «отметки авто-разблокировок»
    ТЗ. `G.efir`/UNLOCKS отсутствуют → тихий fallback на learned-only
    (книга как у hero/merc).
* «Вдох Эфира»: `P._breathSec.style.display = active.kind === 'efir'
  ? '' : 'none'`; при efir — `P._breath.textContent = breathText()`.
  `breathText()` — **КОПИЯ** паттерна ui-tab-efir.js L72-92: ленивый
  `G.efir.EFIR_BREATH.lines || .текст || .text` (экспорт `{text:
  BREATH_INFO.desc}`) + `BREATH_FALLBACK` (дословные строки SPEC).
  Секция рендерится ТОЛЬКО для Эфира; текст статичен (в деградации
  тоже — как в старой вкладке).

---

## 4. Выбор активного персонажа

* **Владелец состояния**: closure `let activeCharId = null` в
  `playerUI` (ядро `src/ui.js`) — **не** во вкладке (вкладка
  безсостоятельна, 000130).
* **per-session**: в сейв НЕ пишем (инвариант 000031; ТЗ п.5;
  переживает rebuild-панели и close/open; перезагрузка страницы —
  сброс на Флогистон). Литерал `saveNow` в ui-tab-*.js/ui.js —
  ЗАПРЕЩЁН (сканнеры ui-panel L1549/L2050).
* **`null` = дефолт = первый member = Флогистон** (Party.active
  fallback; явная установка не нужна).
* **Установка** (2 точки, обе в ui.js):
  1. клик по `button.cp-portrait` — новая ветка делегированного
     клика ядра (после `.cp-btn`, до row-tip): `activeCharId =
     String(pt.dataset.memberid); render(); return;`
  2. `playerUI.toggle(force, tabId, charId)` — ТРЕТИЙ аргумент
     (литерал ТЗ `playerUI.toggle(true, 'character', activeId)`
     реализован дословно): в блоке `if (show)` ДО `render()` —
     `if (charId != null) activeCharId = String(charId);`
     Обратная совместимость: ВСЕ существующие вызовы 2-аргументные —
     поведение не меняется. Валидации НЕТ: неизвестный id —
     `Party.active` fallback на первого.
* **Чтение**: `ctx.activeCharId` (live-getter в panelCtx — паттерн
  ctx-состояний 000130 §4.3: `get activeCharId() { return
  activeCharId; }`) для вкладки; `G.playerUI.getActiveCharId()` —
  публичный getter (ОДИН новый метод; **публичного сеттера НЕТ** —
  O5) — точка для 000147.
* **stale id** (активный уволен/не встречен): каждый render/вызов
  resolve — live (`Party.list` + `Party.active`) → тихий fallback на
  первого (Флогистон); без краха, без console.error. Разрешение
  активного — в момент ВЫЗОВА, не кэш от последнего render.

---

## 5. Маршрутизация raise (прокачка)

* **Один источник** — record-поле вкладки `raiseSkill(skillId, ctx)`
  (доп. поле записи — легально: регистр 000130 валидирует
  id/label/column/build, доп. поля игнорирует; пины реестра
  ui-panel L1750-1779 не затрагиваются):
  ```js
  raiseSkill(skillId, ctx) {
    // Party.list({hero: ctx.character, efir/efirMet/roster из
    // rootRef.__game.state, npcs: G.NpcData.NPCS}) + Party.active(
    // members, ctx.activeCharId) — live, в момент вызова
    if (!active) return { ok: false, reason: 'Нет активного персонажа' };
    const S = active.kind === 'hero' ? G : G.Sheet;
    if (!S || typeof S.raiseSkill !== 'function')
      return { ok: false, reason: 'Лист недоступен' };
    return S.raiseSkill(active.sheet, skillId);
  }
  ```
* **hero → `G.raiseSkill`** (обёртка player.js L211-223 =
  `Sheet.raiseSkill` + `craftReprocessHook` + каскад — **крафт-хук**
  pin craft-core «хук вызывается из player.js при росте навыка»);
  **efir/merc → `G.Sheet.raiseSkill`** (чистая модель 000140; у них
  нет craft-состояния — хук не нужен). reason-строки — ОДИН источник
  (sheet.js) — пин «нет свободных очков навыков» жив.
* **Ядро (ui.js L170)** — замена `G.raiseSkill(character, …)`:
  ```js
  const reg = G.uiTabs;
  const t = (reg && typeof reg.get === 'function')
    ? reg.get('character') : null;
  const r = (t && typeof t.raiseSkill === 'function')
    ? t.raiseSkill(btn.dataset.skill, panelCtx)
    : G.raiseSkill(character, btn.dataset.skill); // fallback:
                                                  // песочница без
                                                  // реестра (000130)
  ```
  Остальное ветки `.cp-btn` (render, вспышка `r.reason` в `.cp-req`
  на 1,5 с, гард `if (req)`) — БЕЗ ИЗМЕНЕНИЙ (контракт возврата
  `{ok, reason, level, …}` тот же).
* canRaise-гейты — единые для всех kinds (Sheet.canRaise: primary≥1
  + requires-дерево + очки + alive-гард `sheet.alive === false` — у
  не-героев alive нет → не погиб). Отображать ВСЕ навыки каталога
  (унаследовано от build): это «единый лист» ТЗ (пул 4 навыков
  Эфира — практика старой вкладки, не ограничение sheet-модели).
* Сейв после траты очков: НОВЫХ триггеров НЕТ (статус-кво героя:
  raise → мутация live-листа → периодический сейв main.js подхватит;
  ТЗ-строка «Сейв — через ctx» = «сейвить нельзя в ui-tab-*» —
  выдержано сканнерами).

---

## 6. Данные (источники и ленивые ссылки)

| данные | источник | примечание |
|---|---|---|
| hero | `ctx.character` (live-getter panelCtx) | live-объект closure ядра; **`__game.state.hero` — СНАПШОТ — НЕ ИСПОЛЬЗОВАТЬ** (ловушка) |
| efir | `rootRef.__game.state.efir` | live-объект (sheet kind 'efir', 000144) или null; паттерн `efirState()` ui-tab-efir.js L137-144 — ЛЕНИВО при render/вызове |
| efirMet | `rootRef.__game.state.efirMet` | live boolean (top-level save-поле) |
| roster | `rootRef.__game.state.roster` | live-массив записей 000143 или null |
| npcs | `G.NpcData.NPCS` | статичный каталог (в снапшоте — тег L750 выше вкладок); `{id, имя, роль, найм:{…}}` |
| portraits | `G.PortraitsData.PORTRAITS` | **лениво** в момент вызова (контракт 000142 §4); `{id, имя, icon, title, kind, description}` — 8 записей |
| имена заклинаний | `G.SpellsData.SPELLS_BY_ID[id].название` | деградация — голый id (тихо) |
| efir-книга | `G.efir.efirSpellsByLevel(1)` + `G.efir.EFIR_SPELL_UNLOCKS` | ОБА экспортированы (18 экспортов efir.js, R1-пин — новых НЕТ); `EFIR_SPELL_START` ВНУТРЕННИЙ — не читать |
| breath | `G.efir.EFIR_BREATH` + BREATH_FALLBACK | копия паттерна ui-tab-efir.js |
| skill-API | hero: `G.*` (player.js — делегаты Sheet); efir/merc: `G.Sheet.*` | canRaise/practiceCap/skillXpForNext/MAX_SKILL_LEVEL/raiseSkill/xpForNext — те же имена |

UMD-ловушка 000038: ВСЕ G.*-чтения — при ВЫЗОВЕ (снапшот один раз на
модуль); `__game` — через rootRef в момент вызова; в теле factory
вне функций обращений к G.* НЕТ (сейчас — только `const G = G0 || {}`).

---

## 7. Degradation-таблица (вкладка «Персонаж»)

| условие | поведение |
|---|---|
| `__game` отсутствует (vm-песочница без main.js) | ТИХО: партия = [hero], errors===0 (boot-пины) |
| `G.Party` отсутствует (регрессия порядка тегов) | console.error 1× + hero only (поведение ДО задачи) |
| `G.PortraitsData` отсутствует | console.error 1× + ряд портретов НЕ рисуется (000142 §4); лист — нормальный |
| портрет конкретного member не найден | тихо skip иконки (целостность каталога — 000141/000142) |
| `G.Sheet` отсутствует при не-hero активном | console.error 1× + read-only: уровни видны, все «+» disabled, тултипы из каталогов |
| `G.SpellsData` отсутствует | имена заклинаний = id (тихо) |
| `G.efir`/`EFIR_SPELL_UNLOCKS` отсутствует | книга Эфира = learned-only (тихо); breath — BREATH_FALLBACK |
| `ctx.character` null (build до setCharacter) | render: active null → ранний return (как сейчас `if (!c) return`) |

---

## 8. Что важно задаче 000146 (Убрать вкладку «Эфир»)

* Секции kind 'efir' **УЖЕ** на странице «Персонаж»: «Книга
  заклинаний» (10 строк с отметками «уровень N»/«откроется на N-м
  уровне») + «Вдох Эфира» — вкладка удаляется БЕЗ ПОТЕРИ КОНТЕНТА
  (ТЗ 000146 п.1: «Контент не теряется — сверить по секциям
  ui-tab-efir.js»).
* Статическая таблица «Открытия» — НЕ перенесена дословно (только
  отметки в книге) — 000146 решает «при необходимости» добавить.
* **Строка Эфира в «Отряд» НЕ тронута** (data-efirtab + gotoEfirTab +
  E9-тест зелёные): редирект в `playerUI.toggle(true, 'character',
  'efir')` — п.3 ТЗ 000146 (там же: удалить ui-tab-efir.js + тег +
  пины index-order L847/реестра, grep 'efir' по ui.js/hud.js).
* После удаления вкладки: зеркало `skills` у Эфира можно убирать
  (000144 §будущее — его читала только вкладка 000116); секция
  «Атрибуты» старой вкладки (efirStats, 5 строк) на страницу НЕ
  переносилась (O1 — см. §10).
* Имена секций/тел (`_book`, `_breath`, `_breathSec`, «Книга
  заклинаний», «Вдох Эфира») и data-атрибуты (`data-memberid`,
  `data-partytab`) — стабильный контракт; менять в 000146 — только
  осознанным перепином.

## 9. Что важно задаче 000147 (единое изучение заклинаний)

* **Активный персонаж** = `G.playerUI.getActiveCharId()` (null =
  дефолт) + `Game.Party` (list из live-данных; ВНИМАНИЕ: для
  WORLD-слоя hero — из main.js closure, а не ctx — `Party.list`
  принимает любой hero-объект; roster/efir — из `__game.state`).
* **Raise-маршрутизацию копировать по kind**: hero → `G.raiseSkill`
  (крафт-хук!), efir/merc → `G.Sheet.raiseSkill`; задел — record-поле
  `raiseSkill(skillId, ctx)` вкладки. Выносить ли общий dispatcher в
  `Game.Party` — решение 000147.
* canLearn/learn (src/spells.js L147-185) уже generic по `p.spells`
  (вызовов в src/ — 0) — 000147 строит источники на активного.

## 10. Открытое (O1): efirStats-потребители — ЗАМОРОЖЕНЫ

* `src/ui.js` L1036-1044 (`efirData()` → `G.efir.efirStats(level)
  .maxHP`) + L1119-1121 (строка Эфира «HP 16/16») +
  `src/ui-tab-efir.js` L312-314 (секция «Атрибуты») — читают
  ЗАМОРОЖЕННУЮ legacy-таблицу (000144: боевой путь уже на derived).
* **Вынос на derived НЕВОЗМОЖЕН в 000145/000146**: `efirDerived`
  ВНУТРЕННИЙ (не экспортирован из efir.js), а `src/efir.js` —
  неприкасаемо по ТЗ ОБЕИХ задач (000145: «не править»; 000146:
  «src/efir.js — НЕ трогать»).
* Удаление/миграция таблицы — **ОТДЕЛЬНАЯ follow-up задача**
  (кандидат: после 000146): экспорт `efirDerived` + миграция 3
  потребителей на `Sheet.derived(sheet, {modifier: efirDerived})` +
  удаление `efirStats` + перепин efir.test.js/squad-panel (L1-числа
  идентичны: efirStats(1).maxHP = 16 = derived — миграция
  технически безопасна для пинов).

---

## 11. Что добавлено / перенесено

* **Добавлено**: `Game.Party` (новый модуль); ряд иконок-портретов
  СВЕРХУ страницы (000142); per-session выбор активного (клик +
  toggle-аргумент); общий лист для efir/merc (2-строчные статы,
  те же таблицы/«+»/банк/потолок); record-поле `raiseSkill`;
  `getActiveCharId()`; `data-partytab` + `gotoCharacterTab(id)` в
  «Отряде» (копия gotoEfirTab, но `toggle(true, 'character', id)`);
  CSS `.cp-portraits/.cp-portrait/.cp-portrait-active`.
* **Перенесено с вкладки «Эфир» (дублированием паттернов, источник
  живёт до 000146)**: `breathText()` (BREATH_FALLBACK + ленивый
  `G.efir.EFIR_BREATH`), `bookLevel`-семантика (метки «уровень N»/
  «откроется на N-м уровне»), строки книги `cp-itemrow/cp-itemname/
  cp-itemmeta`, имена заклинаний `spellName` (SpellsData-фолбэк id).
  НЕ перенесено: секции «Атрибуты»/«Навыки» (пул) старой вкладки —
  на странице Эфира единые таблицы ВСЕХ 31 навыка (единый лист);
  статическая «Открытия» — отметки в книге (000146 решит).
* **Добавлено в «Отряд»**: навигация СТРОКОЙ наёмного (клик не по
  кнопке → страница персонажа); «уволить» — без изменений;
  G.squadUI API — без изменений; блок найма (npcUI data-npcact) —
  без изменений (ТЗ про G.squadUI — панель «Отряд»).

## 12. «Отряд»: порядок веток делегированного клика (КРИТИЧНО)

Сейчас (L1081-1105): (1) `div[data-efirtab]` → gotoEfirTab;
(2) `button[data-squadact]` → dismiss (+ render). После:

```
(1) div[data-efirtab]  — БЕЗ ИЗМЕНЕНИЙ (000146, E9 зелёный;
    в строке Эфира кнопок НЕТ — P3)
(2) button[data-squadact] — без изменений + ЯВНЫЙ return после
    render() (обязателен: кнопка ВНУТРИ строки с data-partytab —
    без return клик по «уволить» упал бы в ветку (3) и ушёл бы в
    навигацию вместо увольнения — P5 ломается)
(3) НОВОЕ: const pr = e.target.closest('div[data-partytab]');
    if (pr && initialized && pr.dataset.partytab)
      gotoCharacterTab(pr.dataset.partytab);
```

* `data-partytab` — ТОЛЬКО в основном ветке render (L1184-1197:
  `row.dataset.partytab = m.npcId`); read-only деградация (без
  core, L1156-1173) — атрибут НЕ добавляется (деградация = read-
  only, навигации нет).
* gotoCharacterTab(id): `toggle(false); G.playerUI.toggle(true,
  'character', id);` — полная замена поверхности (обе z-10),
  onChange НЕ вызывается (состояние не мутировано).
* Селектор `div[data-partytab]` — с тегом (DOM-стабы: «тег[attr]»,
  голый [attr] не поддерживается — контракт 000086 §9); тестовый
  стаб нового файла обязан поддерживать `тег[атрибут]` (паттерн
  squad-panel matchesSel L63-88).

## 13. Подводные камни (шпаргалка для реализации/ревью)

1. **`__game.state.hero` — СНАПШОТ** (main.js L2488) — НЕ использовать
   (hero — только `ctx.character`); efir/efirMet/roster — live.
2. **Портрет НЕ `.cp-btn`** (000098) и НЕ с data-skill — иначе попадёт
   в `panel.querySelectorAll('.cp-btn')` (ui.js L171 / ui-tab-skills
   L171) и в итерацию raise.
3. **Порядок веток «Отряда»**: button-ветка ПЕРЕД partytab-веткой +
   явный return (P5); efirtab-ветка — ПЕРВАЯ (E9).
4. **UMD 000038**: тег party.js ДО ui-tab-skills.js (снапшот вкладки)
   и ДО ui.js — пин index-order; в factory вне функций — НОЛЬ G.*.
5. **Структурный пин** ui-skills: текст ui-tab-skills.js обязан
   сохранить литералы `skillXp` (`c.skillXp[skill]`) и `practiceCap`
   (`S.practiceCap(c, skill)`) — не переименовывать при выносе.
6. **Гард `if (!character) return;` в ветке `.cp-btn`** (ui.js L164)
   — сохранить ДО raise-маршрутизации (без героя — no-op как сейчас).
7. **textContent = ''** в DOM-стабах сбрасывает детей — rebuild
   `_portraits`/`_book` через него (как renderItems в ядре).
8. **Cross-realm (vm)**: пины — примитивы/текст/длины; sheet-объекты
   песочницы НЕ сравнивать с node-объектами (toBe — только внутри
   одной песочницы/одного require — часть A).
9. **HARDCODED CHAINs** (ui-skills L129-138, ui-panel L264): вставить
   `portraits-data.js` + `party.js` в позиции index.html — ИНАЧЕ
   песочницы будут гонять hero-only-деградацию вместо реальной
   цепи (а новый guard PortraitsData даст console.error в render —
   не поймают, но B10/B11 покрывают деградацию ЯВНО своим
   HARDCODED-вариантом БЕЗ portraits-data).
10. **Двойной мораль не умножать** (ПРЕДУПРЕЖДЕНИЕ 000143:
    buildEfirUnit ×morale ПОСЛЕ makeAlly) — не применимо: UI юнитов
    не строит; но явное `data.damage` в боевые пути — не трогать.
11. **Плоские зеркала e.level/e.xp (000143)**: UI их НЕ пишет —
    raiseSkill мутирует только points/primary/secondary/skillXp;
    расход точек — через `entry.sheet.points` (ТЗ 000143);
    синхронизация зеркал — только addXp (боевой путь).
12. **saveNow-литерал** — не писать даже в комментах (реaddir-
    сканнер + структурный пин ui.js).
13. **Параллельные задачи**: 000154 (touchControls ui.js L1270+ /
    main.js / hud.js), 000152 (combat.js), 000155 (рендер боя),
    000156 (ассеты наёмных — portraits-data/assеты), 000151
    (README/HACKING) — наши регионы ui.js: L156-195 (ядро),
    L1017-1268 (squad IIFE) + index.html: конец <style> + слот
    L814-819 — при ребейзе сверять по content-маркерам, не по
    номерам (000133 правит ui.js ~L273 — другой блок).
14. **Fлаки**: асинхронные тайминги reason-вспышки (ui-skills ~1,5-
    1,7 с) — перепуск файлом + запись в result (политика а3).

## 14. Решения по открытым вопросам ТЗ/анализа

| вопрос | решение | почему |
|---|---|---|
| ТЗ п.1: «тонкий слой (ui.js или Game.party)» | новый модуль `src/party.js` (`Game.Party`) | ТЗ-красное требует ЧИСТУЮ node-тестируемую функцию; ui.js — браузерный модуль и чужой регион (000154); game-экспорт вкладки (пред. вариант) мёртв — аргумент оркестратора/а2-arch: отдельный чистый модуль |
| ТЗ п.2: «tooltip (имя, роль/статус)» | `title = имя + ' — ' + role`; role merc = каталожная роль + найм.роль в скобках («Наёмник (melee)») | ТЗ буквально требует «Наёмник (роль)»; один источник — каталог npc-data |
| ТЗ п.2: hero «без kind» | kind 'hero' присваивает `Party.list` | 000140 R-1: поле kind у героя НЕДОБАВЛЯЕТСЯ (байты сейва 000031) |
| ТЗ п.3: «отметки авто-разблокировок» | метки в строках книги «уровень N»/«откроется на N-м уровне»; статическая таблица «Открытия» — НЕ переносится | ТЗ требует «отметки»; таблица — «при необходимости» в 000146 |
| ТЗ п.4: `playerUI.toggle(true, 'character', activeId)` | toggle(force, tabId, charId) — 3-й аргумент опциональный | реализация ТЗ-сигнатуры дословно; обратно-совместимо |
| ТЗ п.4: строка Эфира в «Отряд» | НЕ трогать (data-efirtab → вкладка «Эфир» до 000146) | редирект — п.3 ТЗ 000146 (СТРОГО после 000145, общие файлы); E9-тест |
| ТЗ п.5: «Сейв — через ctx» | новых сейв-триггеров НЕТ; активный per-session | ctx сейв-функций не имеет (000130 §4.3); сканнеры saveNow; 000031 |
| a2 O2: временное дублирование (вкладка + страница) | осознанно до 000146 | граница ТЗ 000146 п.3 |
| a2 O3: текст потолка у Эфира | единый «…растёт только очками и книгами» | один источник; нюанс старой вкладки умрёт в 000146 |
| a2 O4: «Отряд» в npcUI (найм) | без навигации | ТЗ про G.squadUI (панель «Отряд»), диалоговый слой — другая поверхность |
| a2 O5: публичный surface playerUI | только `getActiveCharId()` | минимум; программное переключение для 000147 — уже через toggle-аргумент |
| a3 vs a2 (контракт имён) | `data-memberid` (портрет), `data-partytab` (строка), `cp-portrait-active` (класс) | a2-arch (финальный, 19:02) + формулировки ТЗ-задания; a1/a3 варианты (data-pid/data-member/data-squadrow) — отброшены |
| a3 «15 тестов» vs a2 | ЧАСТЬ A: A1-A8 (node, require party.js) + ЧАСТЬ B: B1-B9 (vm); красные — все кроме B4 (регрессийный hero-raise) | a2-arch §8.1 финальный список; a3-список построен на мёртвом game-экспорт-дизайне (module нет → A-тесты require party.js) |

---

## 15. Итоговый план реализации

**Порядком коммитов** (паттерн 000144): (1) красные тесты + memory
(эта «красная стадия» закоммитит memory вместе с тестами); (2)
реализация: `src/party.js` + `src/ui-tab-skills.js` + `src/ui.js` +
`index.html` (тег+CSS) + пины/CHAIN (tests/index-order,
tests/ui-skills, tests/ui-panel); (3) правки по ревью; (4) отчёт
`tasks/result/000145.md` + перенос задачи в done; (5) CHANGELOG
(отдельным коммитом, дата мержа).

| файл | действие | Δ строк |
|---|---|---|
| `src/party.js` | НОВЫЙ: UMD, `list`/`active`, 0 зависимостей | ~+100 |
| `src/ui-tab-skills.js` | header-коммент; helpers (liveState/portraitsOf/breathText/spellName); build: `_portraits` + секции «Книга заклинаний»/«Вдох Эфира»; render: Party.list/active, ряд иконок, kind-статы, S-развод, книга, breath; record `raiseSkill`; return `{tab}` (game-экспорта НЕТ — слой в party.js) | 215 → ~370 (+155) |
| `src/ui.js` | ядро: `activeCharId`, `ctx.activeCharId`, ветка `.cp-portrait`, raise-маршрутизация (t.raiseSkill fallback G.raiseSkill), toggle 3-й аргумент, `getActiveCharId`; squad: `data-partytab`, return в button-ветке, partytab-ветка, `gotoCharacterTab` | 1489 → ~1530 (+40) |
| `index.html` | тег party.js (после combat-keys L813) + ОДИН CSS-блок (конец `<style>` L737) | +25 |
| `tests/ui-tab-skills-active.test.js` | НОВЫЙ: A1-A8 (node) + B1-B9 (vm: dyn CHAIN, enriched matchesSel, инжект `__game.state`) | ~+500 |
| `tests/index-order.test.js` | 'src/party.js' в список + pin-блок (после блока 000140) | +25 |
| `tests/ui-skills.test.js` | CHAIN: +portraits-data.js, +party.js | +2 |
| `tests/ui-panel.test.js` | CHAIN: +portraits-data.js, +party.js; node-require: +party.js (list/active) | +10 |
| `CHANGELOG.md` | 1 запись (игровой процесс), отдельный коммит | +6 |
| `memory/000145-active-character.md` | НОВЫЙ (этот файл) | ~+400 |
| `tasks/result/000145.md` | отчёт (финальная стадия) | ~+60 |

**GREEN-критерий**: `node --test tests/ui-tab-skills-active.test.js`
→ 17/17 (16 красных после реализации + B4); полный `npm test` →
1732 + 17 = **1749/1749 pass, 0 fail** — ВСЕ фиксаторы §1 прошли
без правки; ручной smoke (ТЗ «DOM-часть — smoke file://»): ряд
иконок сверху, переключение, «+» у наёмного, из «Отряда» клик по
строке → его страница, «уволить»/строка Эфира — как было.

## 16. Решения станции «Реализация» (2026-10-06)

Красные тесты — ИТОГОВЫЙ арбитр (контракт уточняется под них).
Три решения, где контракт/механика уточнена реализацией:

1. **Данные B8 (навигация без `__game`)**: B8 создаёт roster через
   `squadUI.init({roster, efir})` и НЕ инжестирует `__game` (в
   отличие от B1-B7/B9 — makePartyEnv). Контракт §6/§7 (roster —
   только `__game.state`; без `__game` — hero-only) в B8 невыполним:
   заголовок обязан быть «Вольк». Решение: `G.squadUI.liveState()`
   — АДДЕТИВНЫЙ read-only accessor (`{roster, efir}`; существующие
   init/toggle/render/isOpen — БЕЗ ИЗМЕНЕНИЙ, пин P1 держится).
   Вкладка: `partySource()` — ПЕРВОЕ `__game.state` (игра), БЕЗ
   `__game` — liveState() (тесты). В ИГРЕ оба источника — те же
   live-ссылки (main.js проходит один и тот же массив в squadUI.init
   и __game.state) — поведение идентично; фолбэк срабатывает только
   в песочницах без main.js. efirMet — ВСЕГДА из `__game.state`
   (у «Отряда» флага нет — B8 на Эфир не опирается).
2. **Ряд портретов — RECONCILE in place** (уточнение §3.2): B2
   держит ССЫЛКИ на кнопки ДО клика и после клика требует, чтобы
   `mercBtn.className` ПЕРЕСЧИТАЛСЯ на той же ноде. Пересборка
   `textContent=''` убивала ссылки (B2 падал на подсветке).
   Реализация: существующие кнопки обновляются in place по
   `data-memberid` (className/title/img.src/img.alt); узлы
   создаются/удаляются ТОЛЬКО при смене состава партии (найм/
   увольнение/встреча Эфира); порядок = порядок партии (appendChild
   переносит). Деградация (нет PortraitsData) — `textContent=''` +
   console.error 1× (как в §7).
3. **000038-ловушка №2 (squadUI из вкладки)**: `G.squadUI` СОЗДАЁТ
   ui.js — ПОСЛЕ вкладки — в снапшоте G вкладки НЕТ. Чтение —
   ЛЕНИВО через `rootRef.Game.squadUI` (globalThis стабилен; объект
   Game заменяется каждым модулем — актуальный на rootRef.Game).
   Паттерн — sheet.js (rootRef.Game.SkillsData лениво). Остальные
   зависимости вкладки (Party/PortraitsData/Sheet/efir/SpellsData/
   NpcData) — ВЫШЕ вкладки в index.html — в снапшоте, читаются с G.

GREEN-факт: `node --test tests/ui-tab-skills-active.test.js` →
17/17; полный `npm test` → **1750/1750 pass, 0 fail** (база 1749 +
1 новый пин index-order «party.js ПОСЛЕ combat-keys, ДО
ui-tab-skills, ДО ui.js» — §15-план «+25 строк» реализован как
отдельный test).
