# 000083: вкладка «найм» в диалоге таверны (Game.npcUI) — контракт

Задача: интерактивная вкладка «найм» — найм/увольнение через диалог
(оболочка вкладки с читаемым списком кандидатов — 000078; ядро отряда
src/companions.js — 000079). Родитель — 000065
(memory/000065-companions-plan.md); данные — 000078
(memory/000078-npc-hire-data.md); ядро — 000079
(memory/000079-companions-core.md).

Статус: ПРОЕКТИРОВАНИЕ завершено (контракт зафиксирован до кода).
База worktree: master cab0d27 (05c9214 — после 000084 — перед мержем
обязателен ребейз; по файлам задачи пересечения нет, кроме CHANGELOG.md).
Базовый прогон npm test: 1345 pass, 0 fail (2026-10-02).

## 1. Что добавлено / перенесено — файлы (сведение ТЗ на мастер)

* **src/ui.js** — ТОЛЬКО блок Game.npcUI (регион L411-836; правило
  000078: ханки не выходят за блок). 5 правок:
  1. состояние замыкания: `let roster = null, deadMercs = null;`
  2. `renderHireTab()` — переписан: интерактивный путь (кнопки +
     блок «Отряд») + деградация (ровно рендер 000078);
  3. `onOverlayClick` — +2 ветки `act === 'hire'` / `act === 'dismiss'`
     (перед веткой buy/sell);
  4. `npcClose()` — +`roster = null; deadMercs = null;`;
  5. `open(o)` — +снимок `roster`/`deadMercs` (Array.isArray-гард) +
     строки JSDoc.
* **src/main.js** — 2 аддитивных ханка:
  1. состояние сессии (после `const buildingQuests = new Map();`,
     ~L280): `const roster` + `const deadMercs` (см. §4);
  2. deps-бандл `G.buildingActions.init({...})` (~L758): +`roster,`
     +`deadMercs,` (живые ссылки).
  collectSaveData/restoreFromSave НЕ ТРОГАТЬ (зона 000085).
* **src/building-actions.js** — 1 ханк: `openNpcDialog` (~L107) —
  payload `npcUI.open` += `roster: deps.roster, deadMercs: deps.deadMercs`.
* **НЕ МЕНЯЕТСЯ**:
  * **index.html** — новых тегов НЕТ: `src/companions.js` уже на месте
    (L599: после npc.js L598, до combat.js L611, до ui.js L653, до
    main.js L678 — сделано 000079) и уже запинен
    (tests/index-order.test.js L209-226). Новых CSS-классов НЕТ
    (.cp-section/.cp-itemrow/.cp-itemname/.cp-itemmeta/.cp-btn —
    index.html L91-111). Новых SVG-ассетов НЕТ (кнопки текстовые —
    как все кнопки npcUI).
  * **src/npc.js** — НЕ трогать: `hireCandidates` (L64, стабильный API
    000078), прохождение действия «найм» в `dialogOptions` — уже 000078
    (пин tests/npc.test.js).
  * **src/companions.js** — НЕ трогать (ядро 000079/000082, сигнатуры
    сверены с мастером — см. §3).
  * **src/save.js** — НЕ трогать: поля `companions`/`dead_mercs` в
    data сейва — зона 000085 (SPEC «Спутники» → «Сейв»).
  * **tests/index-order.test.js** — новых пинов НЕТ (новых модулей нет).
  * **SPEC.md** — раздел «Спутники» → «UI» вкладку уже описывает
    («Вкладка «найм» в диалоге таверны (Game.npcUI)»); правок не
    требуется (не в файлах ТЗ).
* ТЗ-строки «src/main.js — toggleNpcDialog (~467) и второй вызов
  npcUI.open (~1151)» УСТАРЕЛИ: после 000128 тело переехало в
  src/building-actions.js — ЕДИНСТВЕННЫЙ вызов `npcUI.open` в src/ —
  `openNpcDialog` (building-actions.js:107); debug `__game.actions.
  openNpc` (main.js) делегирует в тот же. Одна точка проводки
  покрывает оба пути (memory/000128-building-actions.md).

## 2. Контракт npcUI.open — новые параметры (подробно — 000083-hire-ui.md)

* `roster`, `deadMercs` — ОПЦИОНАЛЬНЫЕ ЖИВЫЕ ссылки (массивы main.js):
  `roster = Array.isArray(o.roster) ? o.roster : null;` — null ≡ []
  в рендере. Существующие параметры не меняются: npc/character/book/
  tile/shop/onChange/day.
* **interactive-условие** (в renderHireTab, в момент вызова):
  `G.companions` на месте (typeof-guard на ВСЕХ четырёх функциях:
  candidatesForTavern/canHire/hire/dismiss) **И** Array.isArray(roster).
  * Отсутствие G.companions (или функции) → console.error + ДЕГРАДАЦИЯ
    в рендер 000078 (см. §5).
  * Отсутствие roster при НАЛИЧИИ модуля → ТИХАЯ деградация в рендер
    000078 (без console.error — паттерн book=null в renderQuestsTab).
    Обоснование: без ЖИВОГО массива hire() пушит запись в одноразовый
    [] (золото списано, запись потеряна — сломанный UX); без кнопки
    «нанять» потерь нет.
  * Проверка четырёх функций (а не одной): любой частично
    «отремонтированный» модуль деградирует целиком, а не роняет
    TypeError в отдельном клике.
* `day` — СНИМОК с момента open (кламп уже есть: целое ≥1 или null);
  в ветке найма — `Number.isInteger(day) && day >= 1 ? day : 1`
  (fallback 1 — anti-вырождение сида hash2(null,…) — паттерн a1-D4;
  в игре main.js всегда передаёт clock.day ≥1, fallback для
  vm-песочниц).
* `onChange` — хук на изменение состояния (в игре = deps.saveNow —
  уже проводка 000029/000128 в openNpcDialog).

## 3. Контракты и границы — ядро (сигнатуры СВЕРЕНЫ с master)

* `G.companions` — СТРОЧНОЕ имя (браузерный ключ).
* `canHire(roster, npc, character)` → {ok, reason?}; порядок:
  найм-данные → отряд < max_companions (3, живое чтение SETTINGS) →
  не дубль → золото ≥ цена. reason (СТАБИЛЬНЫЕ строки — пины тестов):
  'у NPC нет найм-данных' / 'отряд полный (максимум 3)' /
  'NPC уже в отряде' / 'мало золота (нужно N)'.
* `hire(roster, npc, character, day)` → {ok:true, entry, loyalty} |
  {refused:true, reason:'NPC отказался вступать в отряд'} |
  {ok:false, reason}. Внутренний canHire (stale-кнопка решается в
  момент клика БЕЗ отдельного re-check в UI). При ok: entry
  {npcId, level:1, xp:0, loyalty, hiredDay} push в roster (live!),
  `character.gold -= npc.найм.цена`; loyalty = min(100, 50 + Харизма).
  Отказ: {refused} ≠ {ok:false}; золото НЕ списывается.
* `canDismiss(roster, npcId)` → {ok, reason?} ('NPC не в отряде').
* `dismiss(roster, npcId)` → splice из roster; {ok:true} |
  {ok:false, reason}. Возврата денег НЕТ.
* `candidatesForTavern(npcs, roster, deadMercs)` — найм-данные,
  не нанят, не мёртв; порядок каталога; ССЫЛКИ на записи.
  Пустые (null) roster/deadMercs — guard внутри (≡ hireCandidates).
* Детерминизм (000079, НЕ трогать): сид = perlin.hash2(day,
  npcKey(npcId), SEED_REFUSE); отказ = roll < chance, chance =
  max(0, base − 0.02·Харизма − 0.05·Артист) (base 0.30, live-чтение
  SETTINGS). Тот же (day, npcId) — тот же исход; повторный найм в
  тот же день после увольнения — тот же сид. ЛОГ ОБ ОТКАЗЕ это
  учитывает (суффикс — §6). SETTINGS читаются ЖИВО — тесты меняют
  base 0 (успех верный) / 1 (отказ верный) с восстановлением.
* Каталог (000078): 6 наёмников в таверне 44 (merc_volk 40/1,
  merc_ashka 50/1, merc_baldor 60/2, merc_mira 80/2, merc_torga
  100/3, merc_rena 120/3 — контракт/жалованье). Свежий персонаж:
  gold 100, Харизма 1 → ожидаемая лояльность найма = 50 + 1 = 51.

## 4. Проводка main.js — состояние (кросс-контракт с 000085)

```js
// Отряд спутников (задача 000083, родитель 000065; сейв — 000085):
// ЖИВЫЕ const-массивы — deps-бандл buildingActions передаёт ТЕ ЖЕ
// ссылки в npcUI.open (контракт 000128 §2.2). 000085 восстановит
// in place (length=0 + push, паттерн buffs) — ПЕРЕЗАПИСЫВАТЬ нельзя.
const hasCompanions = G.companions &&
  typeof G.companions.createRoster === 'function';
const roster = hasCompanions ? G.companions.createRoster() : [];
const deadMercs = []; // [npcId] погибших — гибель 000087, сейв 000085
if (!hasCompanions) {
  console.error('main.js: Game.companions отсутствует — ' +
    'src/companions.js обязан грузиться ДО src/main.js (000079) — ' +
    'найм/увольнение отключены');
}
```

* **const, НЕ let** (резерв OQ1): reassignment запрещён контрактом —
  deps-бандл и npcUI держат ссылки; 000085 ОБЯЗАН восстанавливать
  СТРОГО in place (length=0 + push), без переобъявления/замены.
* `createRoster()` (a не голый `[]`) — прецедент efir (main.js
  L203-209): load-time guard + ОДИН console.error при отсутствии
  модуля (регрессия порядка — пин index-order 000079). Форма записи
  рождается фабрикой модуля — единый источник при эволюции 000085.
  deadMercs — голый `[]` (модуль для него не нужен).
* deps-бандл init (~L758, после buildingQuests):
  `roster, // live Array (000083/000085): отряд — npcUI.open`
  `deadMercs, // live Array [npcId] (000083/000085)`
* До 000085 — память сессии (в сейв НЕ входит — collectSaveData
  НЕ трогать; структура data сейва инвариантна — round-trip-тесты
  save.test.js/save-restore.test.js).

## 5. Рендер вкладки «найм» (renderHireTab)

**Интерактивный путь** (interactive = §2):
* Шапка: 'Наёмники в дорогу: контракт + жалованье за день.' —
  ОСТАВЛЯЕТСЯ (регрессия 000078).
* Кандидаты: `C.candidatesForTavern(npcs(), roster, deadMercs || [])`.
  Строка = .cp-itemrow:
  1. .cp-itemname — m.имя (ПЕРВАЯ .cp-itemname — пин R2);
  2. .cp-itemmeta — 'роль: X · навыки: Y · контракт N з · жалованье
     M з/день' (ТА ЖА строка, что у 000078 — ПЕРВАЯ .cp-itemmeta);
  3. button.cp-btn 'нанять': `dataset.npcact='hire'`,
     `dataset.npcid=m.id`; `can = C.canHire(roster, m, c)`;
     `if (!can.ok) { b.disabled = true; b.title = can.reason; }`
     (паттерн renderTrainTab L520-521). Кнопка — ПОСЛЕ meta.
* Блок «Отряд» — ПОСЛЕ списка кандидатов:
  `el('div', 'cp-section', 'Отряд')` (div, НЕ .cp-itemrow):
  * пустой roster — ТОЛЬКО `el('div','cp-itemmeta','Отряд пуст.')`,
    .cp-itemrow НЕТ (ОГРАНИЧЕНИЕ-ПИН: тест 3 000078 deepEqual-ит
    ВСЕ .cp-itemrow в body именами кандидатов);
  * запись: .cp-itemrow:
    1. .cp-itemname — n ? n.имя : e.npcId («призрак» — голый id,
       тихий, паттерн 000029/000085; lookup — inline
       `npcs().find((x) => x && x.id === e.npcId)`, НЕ G.npcById —
       поверхность зависимостей ui.js не растёт);
    2. .cp-itemmeta — 'уровень ' + e.level + ' · лояльность ' +
       e.loyalty + (жалованье известно: n && typeof n.найм.жалованье
       === 'number' → ' · жалованье ' + W + ' з/день');
    3. button.cp-btn 'уволить': dataset.npcact='dismiss',
       dataset.npcid=e.npcId.

**Деградация** (нет G.companions/функций ИЛИ нет roster):
* ровно рендер 000078: шапка + читаемый список G.hireCandidates(npcs())
  (те же .cp-itemrow/.cp-itemname/.cp-itemmeta), БЕЗ кнопок, БЕЗ блока
  «Отряд» — даже если roster передан (резерв OQ3: деградация
  побайтово = 000078 — это и есть регрессионный пин).
* console.error — ТОЛЬКО при отсутствии G.companions (не при
  отсутствии roster): текст
  'ui.js: Game.companions отсутствует — src/companions.js обязан
  грузиться ДО src/ui.js (задача 000079); вкладка «найм» — только
  список' (паттерн 000130/000053).
* Гард ЛЕНИВЫЙ (в момент вызова) — на загрузке ui.js ошибок нет
  (UMD-ловушка 000038: const G снят при загрузке; G.companions в
  игре есть благодаря пину порядка — companions.js ДО ui.js).

## 6. Кнопки и лог (onOverlayClick) — фиксированные строки

Ветки ВСТАВЛЯЮТСЯ перед buy/sell (паттерн train/accept: данные
пересматриваются в момент клика, renderTab() в конце). Общий guard
сверху (`if (!btn || btn.disabled || !npc) return;`) сохраняется
(пин npc-hire 4).

```
act === 'hire':
  C = G.companions; guard (C && typeof C.hire === 'function') → return
  m = npcs().find(id === btn.dataset.npcid); guard m && Array.isArray(roster)
  d = Number.isInteger(day) && day >= 1 ? day : 1
  r = C.hire(roster, m, c, d)
  r.ok:       npcLog('Нанят: ' + m.имя + ' за ' + m.найм.цена + ' з')
              onChange(); renderTab(); G.playerUI && G.playerUI.render()
  r.refused:  npcLog(m.имя + ': ' + r.reason +
              ' — повторить попытку можно на следующий день')
              renderTab()          // БЕЗ onChange (золото/отряд не тронуты)
  r.ok===false: npcLog(r.reason)   // canHire не прошёл в момент клика
              renderTab()          // БЕЗ onChange

act === 'dismiss':
  C = G.companions; guard (C && typeof C.dismiss === 'function'
              && Array.isArray(roster)) → return
  n = npcs().find(id) || null
  r = C.dismiss(roster, btn.dataset.npcid)
  r.ok:  npcLog('Уволен: ' + (n ? n.имя : id)); onChange(); renderTab()
         // БЕЗ playerUI.render (возврата денег нет — золото не меняется;
         // прецедент ветки 'accept')
  иначе: npcLog(r.reason); renderTab()
```

* Лог-строки ЗАФИКСИРОВАНЫ (тесты гребут подстроки):
  найм — 'Нанят: <имя> за N з' (стиль 'Куплено: X за N з');
  отказ — '<имя>: NPC отказался вступать в отряд — повторить попытку
  можно на следующий день' (reason из ядра ЦЕЛИКОМ + суффикс —
  игрокоориентированная версия детерминизма «тот же день — тот же
  исход», companions.js L16-17); увольнение — 'Уволен: <имя>'
  («призрак» — голый id).
* playerUI.render() — ТОЛЬКО при успешном найме (смена золота —
  паттерн buy/sell/turnin); при увольнении и отказах — НЕТ.
* Точки saveNow: onChange() (в игре = deps.saveNow) ровно при
  успешных найме/увольнении; отказ/ok:false — без сейва (состояние
  не менялось).

## 7. Ленивые ссылки и guards (сводка)

* ui.js: G.companions — ленивый typeof-guard в МОМЕНТ ВЫЗОВА
  (renderHireTab + обе ветки клика) — паттерн 000130
  (G.findQuestInCatalog/G.buildActiveQuestRow в том же блоке).
  Отсутствие — console.error + деградация, игра не падает.
* main.js: G.companions.createRoster — load-time guard (прецедент
  efir 000081) — load-time чтение допустимо: main.js снимает G один
  раз при загрузке (000038) и уже читает G.NpcData/G.efir/G.hud.
* building-actions.js: deps.roster/deps.deadMercs — чтение на ВЫЗОВЕ
  (как все поля бандла) — чистая загрузка модуля сохраняется
  (BA1/BA6); deps без ключей (старые тестовые env) → undefined →
  open() → null → тихая деградация, краха нет.
* roster/deadMercs — ЖИВЫЕ ссылки на всех троих уровнях
  (main.js → deps → npcUI closure): мутация hire/dismiss видна
  везде без переснабоксовки (контракт 000128 §2.2 + H8-тест).

## 8. Тесты (красные) — список

1. **НОВЫЙ tests/npc-hire-ui.test.js** (vm + DOM-стаб, дубль стаба
   tests/npc-hire.test.js — дублирование принято в проекте). CHAIN =
   CHAIN npc-hire.test.js + **'companions.js' ПОСЛЕ 'npc.js'**
   (зеркало index.html 598→599). Детерминизм сценариев:
   успех — `SETTINGS.companion_refusal.base = 0` (live-чтение,
   прецедент tests/companions.test.js; t.after/finally — вернуть);
   отказ — `base = 1.0`. day — через open. Лояльность — вычислить из
   SETTINGS (start + c.primary.charisma), не хардкодом 51.
   * U1 — цепочка грузится чисто (errors===0); G.companions и
     G.npcUI в песочнице.
   * U2 — open(roster:[], deadMercs:[], day, onChange) → у каждой
     строки кандидата button[data-npcact='hire']+data-npcid; секция
     .cp-section «Отряд» с .cp-itemmeta 'Отряд пуст.', .cp-itemrow
     внутри секции НЕТ; список = все 6 в порядке каталога.
   * U3 — фильтрация: roster=[{npcId: merc_volk,…}], deadMercs=[
     'merc_rena'] → оба НЕ в списке; остальные в порядке каталога.
   * U4 — disabled+title: (a) roster из 3 записей → все disabled,
     title 'отряд полный (максимум 3)'; (b) свежий c (100 з) →
     merc_rena (120) disabled, title 'мало золота (нужно 120)';
     (c) дубль → 'NPC уже в отряде'; (г) c.gold=300 → merc_rena
     активна после render.
   * U5 — найм-успех (base=0): live-roster += {npcId, level:1, xp:0,
     loyalty:start+Харизма, hiredDay:day}; c.gold −= цена; лог
     'Нанят: <имя> за N з'; onChange ×1; playerUI.render вызван;
     кандидат исчез из списка и ПОЯВИЛСЯ в «Отряде» (имя,
     'уровень 1', 'лояльность <L>', 'жалованье W з/день',
     button dismiss).
   * U6 — найм-отказ (base=1): лог содержит имя + 'отказался' +
     'следующий день'; золото НЕ тронуто; roster не тронут;
     onChange НЕ вызван; кандидат остаётся в списке.
   * U7 — «призрак» в roster (npcId нет в каталоге): строка с голым
     id, не краш; 'уволить' работает (запись убрана, лог
     'Уволен: <id>').
   * U8 — увольнение (после найма base=0): запись вырезана из
     live-roster; кандидат ВЕРНУЛСЯ в список; лог 'Уволен: <имя>';
     onChange ×1; playerUI.render НЕ вызван (пин); повторный найм
     того же в тот же день (base=0) — успех.
   * U9 — open БЕЗ roster/deadMercs (модуль НА месте): тихая
     деградация — читаемый список, кнопок [data-npcact='hire'] НЕТ,
     секции «Отряд» НЕТ, НОВЫХ console.error НЕТ.
2. **tests/building-actions.test.js — +2 НОВЫХ теста**
   (существующие не трогать):
   * W1 — openNpcDialog: p.roster === deps.roster И p.deadMercs ===
     deps.deadMercs (ЖИВЫЕ ссылки, не копия); deps без ключей
     (makeEnv-дефолт) → p.roster === undefined, p.deadMercs ===
     undefined, краха нет. (Техническая правка makeEnv: +roster/
     deadMercs из over — ассерты BA2 не трогаются.)
   * W2 — структурный пин main.js (чтение текста): содержит
     'const roster', 'const deadMercs', 'createRoster' (guard), и в
     блоке /G\.buildingActions\.init\(\{[\s\S]*?\}\);/ присутствуют
     'roster' и 'deadMercs'. Пин ТОЛЬКО состояние+проводка —
     collectSaveData/restoreFromSave НЕ пинить (зона 000085).
3. **tests/npc-hire.test.js — +1 НОВЫЙ тест** (CHAIN без
   companions.js НЕ менять — файл теперь явная РЕГРЕССИЯ
   ДЕГРАДАЦИИ): после клика во вкладку найм — в body НЕТ
   button[data-npcact='hire'], console.error (захвачен стабом)
   содержит 'Game.companions'. Существующие 4 теста — без семан-
   тических правок (их assert errors.length===0 срабатывает на
   ОТКРЫТИИ, до рендера вкладки — остаются зелёными).
4. tests/companions.test.js — ПРАВОК НЕТ: кандидаты/увольнение —
   чистые функции, УЖЕ покрыты 000079 (строки 523/550/574); ТЗ-
   строка «расширение» удовлетворена предшественником — зафиксировать
   в отчёте tasks/result.
5. Верификация RED: npm test — падают ТОЛЬКО 12 новых
   (U1-U9 + W1 + W2 + деградация), 1345 зелёные; падения
   осмысленные (нет кнопки/ветки/состояния, не синтаксис; цепочка
   грузится чисто). GREEN: 1345 + 12 = **1357 pass, 0 fail**.
   Flake чужого vm-boot-теста — перепуск `node --test tests/<файл>`
   + запись в отчёт.
6. Ручной сценарий ТЗ (паттерн 000010/000029) — в отчёт:
   игра → таверна (постройка 44) → [E] → диалог Берты → вкладка
   «найм» → нанять (золото списано, отряд вырос, сейв) / уволить;
   отказ — текст в логе; [E] на наёмнике с найм-опцией — та же
   вкладка.

## 9. Что важно будущим задачам (из ТЗ-ссылок)

* **000085 (сейв)**: поля data — `companions` (те же записи
  {npcId, level, xp, loyalty, hiredDay}) + `dead_mercs` (live
  массив main.js). restoreFromSave — СТРОГО in place (length=0 +
  push; ПЕРЕЗАПИСЫВАТЬ const-ссылки НЕЛЬЗЯ — deps-бандл и npcUI
  держат их, §4). «Призрак» — тихий отброс + warn (000029). Точка
  конфликта: main.js — соседние регионы (состояние ~L280 +
  init-бандл vs collectSaveData/restoreFromSave L326-460); если
  000085 смержится первым и создаст roster сам — 000083
  адаптируется при ребейзе.
* **000086 (панель «Отряд», KeyC)**: ОТДЕЛЬНЫЙ оверлей (после
  000051 — истёк; mержить 000083 ПЕРЕД 000086 по порядку 000065).
  Строки «Отряда» из вкладки НЕ копировать 1:1 (панель — другой
  слой + Эфир). Конфликт: ui.js — РАЗНЫЕ регионы (npcUI-блок
  L411-836 vs buildPanel/вкладки — территория 000086); main.js —
  KeyC в keydown (~L804).
* **000087 (смена дня)**: payWages/loyaltyTick на clock.onDay
  (main.js ~L659) читает ТОТ ЖЕ live-roster main.js (через deps-
  бандл или добавив его в onDay-область); «призрак» — skip.
  deadMercs — сюда же гибель в бою (push npcId).
* **000080/000081/000082/000084** — боевые, НЕ зависят от 000083
  (000083 не трогает combat.js/efir/combat-ui.js); параллельный
  мерж допустим.
* SPEC «Спутники» → «UI» — пункт 2 («Панель «Отряд» (после
  редизайна панели персонажа, задача 000051)») — за 000086, НЕ за
  000083.

## 10. Подводные камни

1. **Регрессия tests/npc-hire.test.js** — главный: деградационный
   рендер обязан совпадать с 000078 ПОБайТОВО (тест 3 deepEqual-ит
   ВСЕ .cp-itemrow body именами кандидатов; тест 2 — читаемый
   текст; тест 4 — .cp-itemname.length===0 после disabled-клика
   опции). Кнопки/секция «Отряд» — ТОЛЬКО interactive; пустой
   «Отряд» — БЕЗ .cp-itemrow.
2. **Состав панели — ровно 4 прямых ребёнка** (tests/ui-panel.test.js
   G1 000125): блок «Отряд» и кнопки — ВНУТРЬ .cp-items (body),
   состав панели и 5 вкладок не меняются; .npc-panel (не
   .combat-side) — tests/npc-layout.test.js.
3. **Строка кандидата** (R2): ПЕРВАЯ .cp-itemname = имя; ПЕРВАЯ
   .cp-itemmeta = роль/навыки/цена/жалованье (000078); кнопка —
   ПОСЛЕ.
4. **UMD-ловушка (000038)**: ui.js снимает const G при загрузке —
   G.companions есть благодаря пину порядка (000079); гард — в
   момент ВЫЗОВА, на загрузке — ноль чтений Game.companions
   (иначе vm-песочницы без companions.js роняет загрузку ui.js).
5. **Детерминизм**: день в открытом диалоге не сменяется (движение
   заблокировано; смена дня — «отдых» в buildingUI, закрывает
   npcUI); day=null (песочницы) → fallback 1, НЕ hash2(null)
   (вырождение сида — 000079). Новый rng НЕ вводить. UI НЕ
   кэширует результат отказа и НЕ дизейблит кнопку после него
   (повторный клик — тот же исход — воспроизводимость, НЕ баг;
   суффикс лога объясняет).
6. **Stale disabled**: состояние кнопок вычисляется при рендере;
   после смены золота в другой вкладке без renderTab кнопки могут
   «просрочиться» — решается re-check ВНУТРИ hire() в момент клика
   (npcLog(reason), без onChange); то же, что у trade (acceptance).
7. **Структурные пины main.js** (combat-keys:267, day:417,
   motion:281, global-settings:291, map:834/1348, cities:1421,
   save:318, ui-panel:694/1482/1514, BA7, HU7): ханки 000083
   аддитивные (состояние ~L280 + init-бандл ~L758) — участки пинов
   не двигать.
8. **main.js load-time console.error** — срабатывает ТОЛЬКО при
   отсутствии companions.js; во всех vm-песочницах с main.js
   (полная цепочка index.html) модуль на месте → errors.length===0
   зелёные (BA5, main-visuals, save-restore, hud.js…).
9. **Мерж**: master ушёл (cab0d27 → 05c9214, 000084) — ребейз
   обязателен; единственное пересечение — CHANGELOG.md (union).
   Конфликт 000051 (ui.js) истёк (done). .merge-pending — стадия
   мержа, здесь не создаётся.
