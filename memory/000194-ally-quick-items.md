# 000194 — Быстрые предметы союзников/Эфира + общий инвентарь + раздача на [I]

Станция: ПРОЕКТИРОВАНИЕ (контракт до кода). База: master 0fc24f1
(мерж 000201/000192/000193.02/000206); перед мержем — rebase на ≥ c2a1ebc
(000203) + полный `node --test tests/` (ОДИН прогон в worktree).
Baseline на 0fc24f1: 2326/2326 зелёных.

## 1. ТЗ и интерпретации (source of truth — tasks/pending/000194.md)

1. Союзные NPC и Эфир — доступ к СВОИМ быстрым предметам и ОБЩЕМУ
   инвентарю, как и Флогистон.
2. Кнопка быстрых предметов → СПИСОК с выбором нужного предмета.
3. Список с ОПИСАНИЕМ — ПОВЕРХ экрана боя.
4. Панель [I] — раздать ВСЕМ персонажам свои быстрые предметы.

Интерпретации (дельты ТЗ ↔ код):

* «Общий инвентарь» = `hero.inventory` (c.player в бою). Отдельной
  структуры НЕТ: весь лут/магазин/крафт партии уже в инвентаре героя.
  «Доступ союзника» = расход предмета с c.player.
* Быстрые слоты союзника — СВОИ, персистентные, хранятся в НОВОЙ
  top-level секции сейва `ally_quick` (НЕ в листах — см. §2).
* ТЗ п.2/3 МЕНЯЕТ существующее поведение кнопки быстрого предмета
  ДЛЯ ВСЕХ, включая героя: было — мгновенно применить первый занятый
  слот (c.quickItem() → playerQuickItem); стало — открыть оверлей-список
  (3 слота активного персонажа с desc), клик по строке → c.quickItem(slot).
  Осознанная semantic-смена, закреплена тестами (S1) и CHANGELOG.
* invItem-мини-меню выбора предмета из боя — НЕ делаем (000037 —
  отдельная отложенная задача). Кнопка «Предмет [T]» на ходу союзника
  теперь ВКЛЮЧЕНА (ветка allyCanDo), но клик → ядро с itemId=undefined →
  «выберите предмет из инвентаря» — ТОЧНО как у героя сегодня (паритет
  ТЗ п.1).
* SPEC spec/companions.md L36 «блок/предметы/побег — только игрок.» —
  ПРОСТАРЕЛО для «предметы» ПОСЛЕ этой задачи. В этой задаче spec НЕ
  правим (пины spec-combat-wording L92 / spec-mobs-companions-efir-
  wording строгие + SPEC_FILE_LINES): ретро-анализ создаст задачу по
  правке SPEC. Блок/побег — player-only СОХРАНЯЮТСЯ (SPEC-инвариант,
  якорь 194-CANDO-FBF).

## 2. Контракты и границы

### 2.1 Хранение: top-level секция сейва `ally_quick` (решение)

* Форма: `{ [memberId]: (string|null)[3] }`, memberId = 'efir' | npcId
  (ID-пространство 000145). Герой НЕ включается (его quick —
  hero.inventory.quick, sanitizeInventory уже покрывает).
* Неломкое расширение v1: версию НЕ поднимаем, миграций НЕТ (паттерн
  000031 / efir_met 000118 / campStocks 000095). Старый сейв без секции
  → {} (дефолт, БЕЗ warn). Секция пишется ВСЕГДА (даже {}).
* Почему НЕ листы персонажей (альтернатива a1-анализа): пины ключей
  строгие — efir sheet/serializeEfir ровно 10 ключей, merc sheet ровно
  10, runtime-запись отряда ровно 6, save-запись ровно 4 (tests
  companions/efir-*.test.js). Расширение листов ломало бы их;
  ally_quick top-level — листы/записи не трогаются.
* sanitizeAllyQuick(d) — ЧИСТАЯ функция в main.js (используется И при
  сейве И при ресторе И в opts.allyQuick):
  * d не-объект/массив → {};
  * ключ: непустой string; 'efir' разрешён ВСЕГДА; прочие — только при
    roster.some(e => e && e.npcId === k) (prune мёртвых/уволенных — на
    сейве И на ресторе, НЕ на каждой правке UI);
  * значение: массив; каждый из 3 индексов — (typeof v[i]==='string'
    && G.getItem(v[i])) ? v[i] : null (валидация по каталогу — зеркало
    sanitizeInventory; невалидный id → null, тихий сброс 000029).
* main.js: `const allyQuick = {}` — closure (до вызова setAllyQuick
  L252). Мутации in place, переприсваиваний НЕТ (паттерн roster/
  deadMercs).
* collectSaveData: `ally_quick: sanitizeAllyQuick(allyQuick)` (рядом с
  companions/efir/dead_mercs).
* Restore: ПОСЛЕ roster-блока (нужен актуальный roster для prune):
  очистить in place (delete всех ключей) + записать
  sanitizeAllyQuick(d.ally_quick).
* UI-проводка: G.playerUI.setAllyQuick(map) (ui.js, паттерн setQuests:
  `allyQuickMap = (m && typeof m==='object' && !Array.isArray(m)) ? m
  : null; if (panel) render();`) + panelCtx getter `allyQuick`.
  main.js вызывает ОДИН раз при загрузке (рядом с setCharacter L252,
  typeof-guard). Дальше — ЖИВАЯ ссылка: мутации in place + существующие
  G.playerUI.render() main.js достаточны (re-wiring не нужен).

### 2.2 Ядро боя: снапшоты и пулы

* makeAlly (combat.js): +3 поля в возвращаемый объект:
  * `quick`: `[0,1,2].map(i => data.quick && typeof data.quick[i]==='string' ? data.quick[i] : null)`
    (нормализация string|null; data.quick — опциональный снимок; нет →
    [null,null,null]). Каталог в makeAlly НЕ валидируется: невалидный
    id отклонится ядром «неизвестный предмет: id» (как у героя через
    useItem).
  * `quickItem`: `1 + Math.floor(((data.attrs && data.attrs.dexterity) || 0) / 10)`
    — ЗЕРКАЛО refillPools героя (1 + floor(dex/10)).
  * `invItem`: 1 — зеркало c.ps.invItem.
* startRound: в цикл livingAllies (рядом с spellInt/spellWis):
  `a.quickItem = 1 + Math.floor(((a.attrs && a.attrs.dexterity) || 0) / 10);
   a.invItem = 1;`
  Round 1 — инициализация makeAlly (инвариант, как у spellInt).
* ДАННЫЕ БОЯ: main.js на ВСЕХ 3 точках startCombat (мир L1655, мир-бой
  L2132, подземелье L2699) рядом с rosterData:
  `allyQuick: sanitizeAllyQuick(allyQuick),` (снимок D5).
  combat-ui.js startCombat: собрать `alliesArr = (efirData ? [efirData]
  : []).concat(Array.isArray(opts.rosterData) ? opts.rosterData : [])`
  и ПЕРЕД createCombat:
  ```
  if (opts.allyQuick && typeof opts.allyQuick === 'object')
    for (const a of alliesArr) {
      const q = opts.allyQuick[a.id];
      if (Array.isArray(q))
        a.quick = [0,1,2].map((i) => (typeof q[i]==='string' ? q[i] : null));
    }
  ```
  a.id: 'efir' / npcId — совпадает с ключами ally_quick. Без
  opts.allyQuick — бой бит-в-бит (пулы есть, слоты пусты).
  JSDoc startCombat: + @param opts.allyQuick.
* Боевой u — СНАПШОТ: HP/MP-эффект предмета → на u (не на лист);
  расход — ВСЕГДА с c.player. Лист/секция мутируются только раздаткой
  на [I] (мир) и сейвом.

### 2.3 Новые функции ядра (combat.js, рядом с playerQuickItem L1432)

`allyQuickItem(c, u, slot)` — зеркало playerQuickItem 1:1 по
последовательности проверок и причинами:

1. `checkTurn(c)` → «бой закончен» / «не ваш ход».
2. **checkBlocked НЕ вызывается** (см. ПОДВОХ №1) — все существующие
   союзные ядра (allyStrike/allyMove/allyHealAction/efirCastAction)
   его не гоняют; c.ps.blocked — флаг ИГРОКА (сброс startRound), на
   ходу союзника он мог бы restare true (игрок заблокировался раньше в
   том же раунде) и дал бы неверное «блок — только последнее действие».
3. `u.quickItem <= 0` → «действий «Быстрый предмет» больше нет».
4. `s = Number.isInteger(slot) ? slot : firstAllyQuickSlot(u)`
   (новый внутренний: первый непустой u.quick[i] или null);
   `s == null` → «быстрые слоты пусты».
5. `itemId = u.quick[s] || null`; нет → «быстрый слот N пуст» (N = s+1).
6. `it = I.getItem(itemId)`; нет → «неизвестный предмет: id».
7. `!I.hasItem(c.player, itemId)` → «предмета нет в инвентаре».
8. resurrection (it.kind === 'resurrection_scroll'):
   `t = c.units.find(x => x.side==='ally' && !x.alive && !x.fled)`;
   нет t → «нет погибших союзников» (return ДО сброса пула);
   успех: `u.quickItem -= 1; resurrectAlly(c, t);
   I.removeItem(c.player, it.id, 1, true);` →
   {ok:true, slot:s, item: it.name}. Лог — «Возвращён в бой.»
   (из resurrectAlly — как у героя).
9. Иначе: `u.quickItem -= 1; r = I.useItem(c.player, itemId, 1, null, u);`
   отказ → `u.quickItem += 1` (действие не сгорает, паттерн
   playerQuickItem) + reason; успех → `log(c, u.name + ': ' + r.message)`
   + {ok:true, slot:s, item: r.name}.

`allyInvItem(c, u, itemId)` — зеркало playerInvItem 1:1:
checkTurn → пул u.invItem («действий «Предмет из инвентаря» больше
нет») → `!itemId` («выберите предмет из инвентаря») → getItem
(«неизвестный предмет: id») → hasItem(c.player) («предмета нет в
инвентаре») → resurrection-кейс (тот же, что в quick) → иначе
`u.invItem -= 1; I.useItem(c.player, itemId, 1, null, u)` (отказ →
возврат пула) → log «Имя: …» / {ok:true, item: r.name}.

Структурные замечания:

* weapon/armor/reagent в ядре НЕ проверяются явно — как у героя:
  useItem отклонит, пул вернётся (зеркало; причины из useItem).
* Stale-слот (id в u.quick, предмета нет в ОБЩЕМ — qty→0 вне боя,
  removeItem чистит только quick ГЕРОЯ): u.quick НЕ очищается (копия)
  → отказ «предмета нет в инвентаре», пул не сгорает. Озвучено в
  логике — осознанно.
* 0 c._rng во всех новых путях (детерминизм; гольдены не трогаются).

### 2.4 Диспатч (combat.js L3157-3163)

```
c.quickItem = (slot) => {
  if (activeUnitId(c) === 'player') return playerQuickItem(c, slot);
  const u = activeAlly(); if (!u) return null;
  return allyQuickItem(c, u, slot);
};
c.invItem = (itemId) => {
  if (activeUnitId(c) === 'player') return playerInvItem(c, itemId);
  const u = activeAlly(); if (!u) return null;
  return allyInvItem(c, u, itemId);
};
```
Паттерн c.attack (000168/000198). c.spell/c.block/c.flee — НЕ трогаем
(player-guarded; блок/побег — player-only). На ходу МОБА activeAlly()
null → null (якорь 194-CORE-MOB-NULL).

### 2.5 allyCanDo (combat.js L2159+)

* УБРАТЬ 'quickItem' и 'invItem' из хвостовой группы
  `fire|block|quickItem|invItem|flee` (остаются fire/block/flee →
  «недоступно активному персонажу»).
* +ветка 'quickItem' (ДО «неизвестное», рядом с 'spellbook'):
  ЗЕРКАЛО героической ветки canDoAction 1:1 по причинам, но с
  прямым чтением u.quick/u.quickItem и p.inventory (БЕЗ I.* —
  ensureInventory лениво СОЗДАЁТ инвентарь; canDoAction — 0 side
  effects):
  пул → «действий «Быстрый предмет» больше нет»;
  slot = (a.slot != null и Integer) ? a.slot : первый непустой u.quick[i];
  нет slot → «быстрые слоты пусты»; u.quick[slot] пуст →
  «быстрый слот N пуст»; I.getItem → «неизвестный предмет: id»;
  has в p.inventory.slots → «предмета нет в инвентаре»;
  weapon → «оружие — экипируется»; armor → «броня — экипируется»;
  reagent → «реагент нельзя применить (торговый товар)»;
  resurrection_scroll без мёртвого союзника → «нет погибших союзников»;
  иначе ok.
* +ветка 'invItem': пул u.invItem → «действий «Предмет из инвентаря»
  больше нет»; ≥1 potion/food/skill_book в p.inventory.slots (те же
  kind, что героическая) → «нет применимых предметов в инвентаре»;
  иначе ok.
* checkTurn — общий (сверху allyCanDo); checkBlocked — НЕ вызывается
  (см. №1); «неизвестное действие» — без изменений.

### 2.6 canDoAction player-ветка 'quickItem' (L1616) — args.slot

* АДДИТИВНО: `a.slot` (Integer) → слот ЯВНЫЙ (пустой → «быстрый слот
  N пуст»); без a.slot — текущий scan первого занятого (БИТ-В-БИТ для
  всех существующих вызовов, включая UI-цикл кнопок и старые тесты).
* Нужен для per-row предпросмотра в оверлее (паттерн rowChk 000149).

### 2.7 items.js: useItem — 5-й аргумент effectTarget

```
function useItem(c, itemId, qty = 1, learnTarget = null, effectTarget = null)
```
* c — ВСЕГДА носитель инвентаря: расход (removeItem), bonus-слот
  (000046), множители potionPowerMult/foodPowerMult — из P.derived(c)
  (НОСИТЕЛЯ — героя; боевой юнит без primary → derived невозможен —
  множители героя осознанное решение: «общий инвентарь — общая
  экономика»).
* T (внутри useItem, одна проверка):
  `const T = (effectTarget && typeof effectTarget === 'object'
    && !Array.isArray(effectTarget) && effectTarget !== c
    && typeof effectTarget.hp === 'number'
    && typeof effectTarget.maxHP === 'number') ? effectTarget : null;`
* potion heal / food: `if (T) { const b = T.hp;
  T.hp = Math.min(T.maxHP, b + amt); hp += T.hp - b; }
  else { P.heal(c, amt); hp += amt; }`
  (кап — T.maxHP; счётчик — ФАКТУАЛЬНАЯ дельта; героический путь
  БИТ-В-БИТ: P.heal + полный amt).
* potion mp: `if (T) { const b = T.mp; T.mp = Math.min(T.maxMP, b + amt);
  mp += T.mp - b; } else { ...существующий (d.maxMP, c.mp)... }`
* skill_book / spell_scroll / практика (алхимия/природа) — НА НОСИТЕЛЯ
  (c) — БЕЗ ИЗМЕНЕНИЙ: союзник «применяет» свиток/книгу — изучает
  герой (носитель); свиток расходится из общего.
* resurrection_scroll — ветка combat.js (useItem в бою для него не
  вызывается; мирно — «только в бою», как сейчас).
* Без 5-го аргумента — БИТ-В-БИТ (все 2/3/4-арг. вызовы, пины
  items.test.js). JSDoc — обновить (снять с effectTarget — по стилю
  файла: JSDoc есть у useItem, дополнить строкой).
* Почему не P.heal(T): P.heal → derived(sheet) → у боевого юнита
  primary НЕТ → d = null → no-op.

### 2.8 UI боя: оверлей-список (combat-ui.js) — п.2/3

Шаблон — книга заклинаний 000149/000193 (bookBox/renderBook/castRow).

* build(): ПОСЛЕ `side.appendChild(actions)`, ДО bookBox:
  `quickBox = div.combat-quicklist` (display 'none') + closure-состояние
  quickOpen=false/quickSig=null. Позиция — МЕЖДУ .combat-actions и
  .combat-spellbook: R11-контракт книги (между actions и .combat-log)
  не ломается (относительный порядок сохранён). См. ПОДВОХ №2
  (CU199-MPBAR-1 deepEqual).
* runAction: thunk 'quickItem' ЗАМЕНЯЕТСЯ (паттерн 'spellbook'):
  ```
  quickItem: () => {
    const r = G.canDoAction(c, 'quickItem', { targetId: c.targetId });
    if (r.ok) toggleQuickList();
    return r;
  },
  ```
  Клик по кнопке И KeyE (combat-keys.js БЕЗ ИЗМЕНЕНИЙ: ['KeyE',
  'quickItem', false]) → runAction → новый путь автоматически.
  Отказ (canDo не ok) → logRejection (ниже в runAction), список НЕ
  открывается.
* Правка по ревью (кнопка ≡ клавиша): в цикле кнопок render
  (overlay.querySelectorAll('.combat-actions button')) для
  act==='quickItem' применяется ТОТ ЖЕ гейт: `ok = r.ok ||
  quickOpenable(c)` (b.disabled/b.title от ok). Stale-слот НЕ гасит
  кнопку (клик открывает список, причина на строке — тест
  194-QUI-ALLY-STALE); блок — quickOpenable false → кнопка
  disabled, title «блок — только последнее действие» (тест
  194-QUI-BLOCK). quickOpenable гатит ТОЛЬКО ветку героя
  c.ps.blocked (флаг игрока; ветка союзника — нет, ядро союзника
  checkBlocked не вызывает — §2.3).
* quickUnit(c) = unitOf(c) (activeUnit(c) || c.player) — ЕДИНАЯ точка.
* renderQuickList(c) (вызов в render() рядом с renderBook(c)):
  display из quickOpen; при открытии — строки; перестроение ТОЛЬКО при
  смене сигнатуры (паттерн bookSig): сигнатура = activeUnitId(c) +
  слоты (герой — p.inventory.quick, союзник — u.quick) + пул
  (c.ps.quickItem / u.quickItem) + ok/reason по строкам.
  Строки — ВСЕГДА 3 (слоты 1..3), div (НЕ <button> — паттерн R9):
  * заполненный: .combat-quickrow → .combat-quickrow-body →
    .combat-quickrow-top (.combat-quickname = it.name + «Слот N»;
    .combat-quickmeta = эффект по it.effect, как itemTipText) +
    .combat-quickrow-desc = it.desc (ОПИСАНИЕ — ТЗ п.3; desc есть у
    100% каталога — проверено: 76/76). Иконок НЕТ (в каталоге их нет).
  * пустой: .combat-quickrow.combat-quickrow-off, «— пусто —», без
    meta/desc, курсор default, слушателя НЕТ (паттерн empty-строки книги).
  * stale (id есть, предмета нет в ОБЩЕМ — только союзники): -off +
    title = причина (превью rowChk: G.canDoAction(c, 'quickItem',
    {slot: i})).
  * off-строка (стале/неприменимый — по canDo reason) — слушатель ЕСТЬ
    (паттерн R9 книги: клик даёт reason в журнал — не тишина).
* quickUseRow(c, slot): гейт spellbookUnitGate(c) (ПЕРЕИСПОЛЬЗОВАТЬ
  как есть; ВЕРНАЕТ null | {ok:false,reason} — использовать `if (g)
  { logRejection(c, g); render(); return; }` — КАК castRow, НЕ
  `if (!g.ok)` — см. ПОДВОХ №3) → `r = c.quickItem(slot)` →
  успех: quickOpen = false + render() (FX НЕ вводим — предметных артов
  нет; c._fx не пишем); отказ: logRejection, список остаётся
  ОТКРЫТЫМ (паттерн castRow).
* finish(): +очистка quickBox=null/quickOpen=false/quickSig=null
  (рядом с bookBox-refs L2169-2171) И в catch-ветке startCombat
  (L2334-2336).
* toggleQuickList(): quickOpen = !quickOpen; (паттерн toggleBook).
  Кнопка-тоггл при открытии: повторное нажатие KeyE — ЗАКРЫТЬ (тот же
  toggle; canDo при открытии — пул/слоты ещё ok).

### 2.9 CSS (index.html <style>)

СРАЗУ ПОСЛЕ правила .combat-spellrow-desc (L867-871), ДО comment-строки
000162 (L872), в скоупе .combat-overlay--combat, 1-в-1 по геометрии с
книгой (000124: базовые классы не трогаем, своих классов; новых цветов
НЕТ — наследование + opacity + font-size):
* .combat-quicklist { flex:0 1 auto; min-height:0; max-height:40%;
  overflow-y:auto; margin:4px 0; padding:2px 0; }
* .combat-quickrow { display:flex; align-items:flex-start; gap:6px;
  padding:4px 6px; cursor:pointer; }
* .combat-quickrow-off { opacity:0.4; cursor:default; }
* .combat-quickrow-body { flex:1 1 auto; min-width:0; }
* .combat-quickrow-top { display:flex; align-items:baseline; gap:6px; }
* .combat-quickname { font-weight:bold; }
* .combat-quickmeta { font-size:11px; opacity:0.75; white-space:nowrap; }
* .combat-quickrow-desc { font-size:11px; opacity:0.85;
  white-space:pre-line; }
Новых <script>-тегов НЕТ → index-order.test.js — без изменений.
svg.test.js — не затронут (новых ассетов НЕТ).

### 2.10 Панель [I] (ui.js + ui-tab-inventory.js) — п.4

* ui.js: closure `let allyQuickMap = null;` + G.playerUI.setAllyQuick
  (§2.1) + panelCtx getter `allyQuick`.
* doItemAction: 'quick'/'quick-clear' — dispatch по АКТИВНОМУ
  персонажу: `mid = activeCharId == null ? 'flogiston' :
  String(activeCharId)`:
  * 'quick':
    * mid === 'flogiston' → СУЩЕСТВУЮЩИЙ путь бит-в-бит
      (G.freeQuickSlot(c) → null «все быстрые слоты заняты» /
      G.setQuick(c, s, id) → «предмета нет в инвентаре» из setQuick
      — hasItem(c) проверкой setQuick; ПРЯМОЙ вызов G.hasItem в
      ui.js ДО setQuick НЕ вводится — setQuick сам проверяет).
    * иначе: `q = allyQuickMap && Array.isArray(allyQuickMap[mid])
      ? allyQuickMap[mid] : null`; null → создать
      `allyQuickMap[mid] = [null,null,null]` (in place — ЖИВАЯ ссылка
      на main.js allyQuick); slot = первый null;
      slot == null → {ok:false, reason:'все быстрые слоты заняты'};
      иначе ПЕРЕД записью: `!G.hasItem(c, id)` →
      {ok:false, reason:'предмета нет в инвентаре'} (порядок: СНАЧАЛА
      свободный слот, ПОТОМ hasItem — как геройский: freeQuickSlot →
      setQuick); успех → `q[slot] = id`.
  * 'quick-clear':
    * 'flogiston' → G.clearQuick(c, slot) (бит-в-бит).
    * иначе → `if (allyQuickMap && Array.isArray(allyQuickMap[mid]))
      allyQuickMap[mid][Number(btn.dataset.slot)] = null;`
      (без записи — тихий no-op; r = {ok:true}).
  * Остальные act (use/equip/unequip/remove/buy/sell) — БЕЗ
    ИЗМЕНЕНИЙ (против героя-носителя; «исп.» на активном союзнике —
    применяется к герою — осознанно, ТЗ не требует больше).
* ui-tab-inventory.js:
  * inventoryTab — БЕЗ ИЗМЕНЕНИЙ: общий инвентарь (герой-носитель);
    «быстр.» в строке предмета = раздача АКТИВНОМУ (dispatch 2.10).
  * equipmentTab.render: секция «Быстрые слоты (бой)» — слоты
    АКТИВНОГО member'а:
    ```
    mid = ctx.activeCharId == null ? 'flogiston' : String(ctx.activeCharId);
    quick = mid === 'flogiston'
      ? (inv.quick || [null,null,null])
      : (ctx.allyQuick && Array.isArray(ctx.allyQuick[mid])
         ? ctx.allyQuick[mid] : [null,null,null]);
    ```
    Строки как сейчас (itemRow «Слот N: имя/— пусто —», «убрать»
    data-act=quick-clear data-slot) — dispatch сам знает, чьё.
    Без записи у союзника — 3 «— пусто —» (раздавать МОЖНО).
  * РЯД ПОРТРЕТОВ в equipmentTab НЕ добавляем: ui-tab-skills.js уже
    владеет .cp-portraits (panel._portraits) и клик по портрету
    УЖЕ ставит activeCharId (ui.js L214, делегированный click) —
    переключение активного member'а — существующий путь вкладки
    «Персонаж». Дублирование ряда дало бы конфликт panel._portraits
    и второе состояние.
* Реестр uiTabs НЕ меняется (новых вкладок нет) → registry-пин
  (['character','inventory','equipment','settings','shop','quests'])
  без изменений.

## 3. Ленивые ссылки и guards (UMD 000038/000053)

* combat.js: I/P — из аргументов factory (снапшот) — I.getItem/hasItem/
  removeItem/useItem/firstQuickSlot доступны в node и браузере.
  Новые функции — только I.* и P.* — без новых Game-чтений.
* items.js: useItem 5-й арг — только математика; G.* (Spells/Craft)
  — лениво при вызове, как сейчас (без изменений).
* ui.js: setAllyQuick — приём ссылки (без G.*); doItemAction — G.hasItem/
  G.freeQuickSlot/G.setQuick/G.clearQuick — уже в снапшоте, при вызове.
* main.js: sanitizeAllyQuick — G.getItem при вызове (каталог — items.js,
  грузится первым; в node-тестах save-restore — полная цепочка).
* Никаких НОВЫХ require/зависимостей/порядковых требований.
  Все правки — в существующих файлах; порядок <script> не меняется.

## 4. Что важно будущим задачам (из ссылок ТЗ)

* 000037 (мини-меню выбора предмета из боя): when it lands, c.invItem
  для союзника УЖЕ готов (ядро + пул + ветка allyCanDo) — нужна только
  UI-раздача itemId (оверлей-список инвентаря по образцу quicklist).
* 000196 (книга заклинаний, параллельная, тот же combat-ui.js): наши
  hunks — runAction-thunk 'quickItem', quickBox в build (между actions
  и bookBox), renderQuickList, finish/catch-очистка, CSS-блок.
  Rebase на свежий master ПЕРЕД мержем; минимальные hunks.
* SPEC-правка (после ретро): spec/companions.md L36 «блок/предметы/
  побег — только игрок.» → «блок/побег — только игрок; быстрый предмет
  — активный персонаж (свои слоты, предмет — из общего инвентаря,
  000194)» + ре-пины spec-combat-wording L92 /
  spec-mobs-companions-efir-wording (+ SPEC_FILE_LINES при изменении
  числа строк). НЕ наша задача.
* Сейв-версия: ally_quick — n-ная top-level секция без повышения v1;
  будущие разделы — тот же паттерн (000031).

## 5. Подводные камни (проверены при проектировании)

1. **checkBlocked НЕ в allyQuickItem/allyInvItem** (а в черновике a2
   было). Все существующие союзные ядра (allyStrike L2017, allyMove,
   allyHealAction, efirCastAction) его не вызывают; c.ps.blocked —
   flag ИГРОКА (playerBlock; сброс startRound) — мог restare true на
   ходу союзника (игрок заблокировался раньше раунда, init выше) →
   ложный отказ «блок — только последнее действие» + асимметрия с
   allyCanDo (который checkBlocked НЕ зовёт) → нарушение «1 причина —
   1 поведение».
2. **CU199-MPBAR-1 (tests/combat-ui.test.js L6497-6503) — deepEqual
   ВСЕХ детей .combat-side**:
   ['combat-turnorder','combat-hpbar','combat-mpbar','combat-state',
   'combat-actions','combat-spellbook','combat-log']. Вставка
   .combat-quicklist МЕЖДУ actions и spellbook его ЛОМАЕТ — технический
   ре-пин S7 (добавить 'combat-quicklist' в массив). АНАЛИЗ a3 ЭТОТ
   ПИН ПРОПУСТИЛ — единственный точный deepEqual-пин .combat-side в
   тестах (остальные children.length-пины — bookBox/кнопки).
3. **spellbookUnitGate возвращает null | {ok:false, reason}** (НЕ
   {ok:true}) — черновик a2 `if (!g.ok)` упал бы на null. Использовать
   как castRow: `const g = spellbookUnitGate(c); if (g) { logRejection;
   render(); return; }`.
4. **resurrect_scroll — id каталога `resurrect_scroll`** (000051.json),
   kind 'resurrection_scroll' (a3-таблица писала id = kind — в тестах
   использовать 'resurrect_scroll').
5. P.heal(T) — no-op на боевом юните (derived() → null без primary) →
   HP/MP применять НАПРЯМУЮ (§2.7).
6. useItem-счётчик hp/mp: героический путь — ПРЯМОЙ amt (даже при капе
   — «+15 HP» при полном HP — БИТ-В-БИТ, не чинить); путь T —
   ФАКТУАЛЬНАЯ дельта («+0 HP» при полном — честный лог).
7. Stale u.quick: removeItem чистит ТОЛЬКО hero.quick; u.quick —
   копия → отказ «предмета нет в инвентаре» (пул не сгорает). Общий
   случай: союзник допил последний общий экземпляр, у героя quick
   очищен, у союзника слот stale.
8. canDoAction — 0 side effects: allyCanDo-ветки — прямые чтения
   (p.inventory.slots.some, u.quick); БЕЗ I.ensureInventory/
   I.firstQuickSlot (ensureInventory ЛЕНИВО СОЗДАЁТ p.inventory —
   создание в canDo — побочный эффект).
9. args.slot — аддитивный аргумент; ВСЕ существующие вызовы canDoAction
   без него — бит-в-бит. UI-цикл кнопок (без slot) — не меняется.
10. activeCharId — per-session (000145): НЕ сбрасывается при закрытии
    панели; dispatch 'quick'/'quick-clear' использует ТЕКУЩЕЕ.
11. 3 точки startCombat в main.js (L1655/L2132/L2699) — менять ВСЕ
    (мир-отладка/мир-бой/подземелье).
12. Порядок restore: ally_quick — ПОСЛЕ roster (prune по
    roster.some); G.getItem доступен всегда (items.js — первый скрипт).
13. Пины ключей 10/6/4 (efir/merc/roster) — НЕ расширять; ally_quick
    строго top-level.
14. vm-песочницы: innerHTML='' — no-op в DOM-стабе → при перестроении
    строки quicklist ДОБАВЛЯЮТСЯ (тесты читают хвост children —
    паттерн R9/книги); в реальном DOM — чистка typeof-guard'ом (как
    renderBook).
15. Фикстуры ре-пинов: strongHero()/hero112() — НОВЫЕ персонажи
    (инвентарь ПУСТ); ALLY_VOLK_168 attrs {dexterity:4} → пул
    1+floor(4/10)=1. Значит quickItem → «быстрые слоты пусты»,
    invItem → «нет применимых предметов в инвентаре» (S4/S5/S6 —
    предсказуемо). scene84-герой (000168-UI-2) — тоже без potion в
    инвентаре (проверить фактом при ре-пине; a3: «по факту scene84»).

## 6. Тест-карта (красная стадия — 26 RED + 8 якорей)

Новые файлы (паттерны — a3, проверены при проектировании):
* tests/combat-quick-ally.test.js (node; паттерн combat.test.js):
  194-CORE-INIT / REFILL / ALLY-USE / ALLY-SLOT / ALLY-SHALE /
  ALLY-REJ / ALLY-RES / ALLY-INV + 194-CANDO-ALLY-Q / ALLY-I (10 RED)
  + якоря 194-CORE-HERO / CORE-MOB-NULL / CANDO-FBF / CANDO-HERO.
* tests/items-effect-target.test.js (node; паттерн items.test.js —
  createCharacter из src/player.js): 194-ET-POTION / ET-MP / ET-FOOD /
  ET-MULT (4 RED) + 194-ET-REGR.
* tests/combat-ui-quicklist.test.js (vm; статическая цепь — копировать
  loadCombatUi-паттерн из combat-ui.test.js; ОПЦИОНАЛЬНО — export
  loadCombatUi в helper, техническая правка без смены пинов):
  194-QUI-BUILD / OPEN / CLICK / REJ / ALLY (5 RED) + 194-QUI-FINISH.
* tests/ui-ally-quick.test.js (vm; ДИНАМИЧЕСКАЯ цепь до ui.js —
  CHAIN_000130-паттерн ui-panel.test.js, дублирование стаба принято):
  194-PNL-API / GIVE-ALLY / CLEAR-ALLY / EQUIPTAB (4 RED) +
  194-PNL-QUICK-HERO / PNL-EQUIPTAB-HERO.
* tests/save-restore.test.js (APPEND, vm-boot-харнесс
  seedSave/boot/readSave/fireBeforeUnload): 194-SAVE-ROUNDTRIP /
  SAVE-OLD / SAVE-SANITIZE (3 RED).

Ре-пины существующих (ТЗ-предписанные семантические + 1 технический):
* S1: combat-ui.test.js (г) L1413-1428 — KeyE: пустые слоты → 1 строка
  «быстрые слоты пусты» (как сейчас); ЗАПОЛНЕННЫЕ (hero.inventory.quick
  + slots) → 0 строк, .combat-quicklist display '' (ТЗ п.2).
* S2/S3: combat-ui.test.js 000168-UI-2 (a) L3367 / (b) L3413 — loop
  ['block','quickItem','invItem','flee'] → quickItem/invItem ВЫНЕСЕНЫ:
  quickItem — disabled «быстрые слоты пусты»; invItem — disabled
  «нет применимых предметов в инвентаре» (по факту scene84);
  block/flee — «недоступно активному персонажу» (без изменений).
  + НОВЫЕ асерты: союзник с quick-слотом (opts.allyQuick) + potion в
  hero-инвентаре → обе кнопки ENABLED на ходу союзника.
* S4/S5: combat.test.js 000168-CANDO-1 L6539 / CANDO-2 L6604 — loop
  ['fire','block','quickItem','invItem','flee'] → quickItem/invItem
  ВЫНЕСЕНЫ (причины по §15: «быстрые слоты пусты» / «нет применимых
  предметов в инвентаре»); fire/block/flee — без изменений.
* S6: combat.test.js 000198-SEL-5 §6 L7521 — loop
  ['fire','block','flee','quickItem','invItem'] — то же.
* S7 (ТЕХНИЧЕСКИЙ, найден в проектировании): combat-ui.test.js
  CU199-MPBAR-1 L6498-6501 — deepEqual детей .combat-side: добавить
  'combat-quicklist' между 'combat-actions' и 'combat-spellbook'.

НЕ трогаются: hero-путь L724/L1340, CU182-ORDER (порядок КНОПОК —
dataset.act), combat-keys (KeyE → «Быстрый предмет [E]»), ui-panel
L875/L916/L1089 (hero-быстрые — бит-в-бит), items.test.js,
companions/efir 10/6/4-ключи, save.test.js, combat-layout (базовые
правила — стражи), index-order, goldens (новые пути — 0 c._rng),
R9/R11-пины книги (quicklist div-строки; книга остаётся между
actions и log).

## 7. Файлы и ожидаемая дельта

| Файл | Что | Дельта |
|---|---|---|
| src/combat.js | makeAlly +3 поля; startRound +2 строки; firstAllyQuickSlot; allyQuickItem/allyInvItem; canDoAction args.slot (player 'quickItem'); allyCanDo 2 ветки + сужение хвоста; диспатч c.quickItem/c.invItem | ~+140 |
| src/items.js | useItem: 5-й аргумент + T + 3 ветки (heal/mp/food) | ~+20 |
| src/combat-ui.js | build: quickBox; runAction-thunk; quickRows/quickRowChk/buildQuickRow/quickUseRow/toggleQuickList/renderQuickList; render(): вызов; finish+catch очистка | ~+120 |
| src/ui.js | allyQuickMap + setAllyQuick + getter; doItemAction dispatch | ~+35 |
| src/ui-tab-inventory.js | equipmentTab.render — слоты активного member'а | ~+15 |
| src/main.js | allyQuick closure + sanitizeAllyQuick; setAllyQuick-проводка; collectSaveData; restore; 3× startCombat allyQuick | ~+45 |
| index.html | CSS .combat-quicklist* (8 правил, после .combat-spellrow-desc) | ~+35 |
| tests/ (5 файлов) | 26 RED + 8 якорей + ре-пины S1-S7 | ~+1100 / ~−20 |
| memory/000194-ally-quick-items.md | контракт (этот файл) | новый |
| CHANGELOG.md | секция 2026-10-14 (отдельный коммит) | ~+10 |
| tasks/pending→done + tasks/result/000194.md | по правилам tasks/ | — |

НЕ трогаются: src/combat-keys.js, src/efir.js, src/companions.js,
src/party.js, src/save.js, реестр uiTabs, spec/ (см. §4),
hero-пулы/инвентарь, c.spell/c.block/c.flee, все <script>-теги.

## 8. Решения openQuestions (станция Проектирование)

1. KeyE/кнопка — список ДЛЯ ВСЕХ (герой + союзники), не «герой —
   мгновенно». — ТЗ п.2 формулировка общая («кнопка быстрых
   предметов»), п.1 «как и Флогистон» требует паритета; двойной UX
   противоречил бы «список с возможностью выбрать».
2. skill_book/spell_scroll в слоте союзника — РАЗРЕШИТЬ, эффект на
   НОСИТЕЛЯ (героя). — useItem-паритет (единственный механизм; предмет
   расходится из общего, герой учится); альтернатива «для героя»-отказ
   ввела бы причину, которой нет у героя (нарушение 1:1).
3. Имя секции сейва — `ally_quick`. — стиль существующих top-level
   ключей (companions/efir/dead_mercs — англ. snake_case).
4. CSS-классы — .combat-quicklist* (рядом с .combat-spellbook*). —
   самоописательность в тестах + параллельная иерархия имён.
5. Хранение — top-level ally_quick, НЕ листы. — пины ключей 10/6/4
   строгие (см. §2.1); nеломкость v1 без миграций.
6. checkBlocked — НЕ в allyQuickItem/allyInvItem (исправление a2). —
   союзная конвенция (0 вызовов в ally-ядрах) + c.ps.blocked —
   player-флаг (ПОДВОХ №1) + 1:1 зеркало allyCanDo.
7. Позиция quicklist — между .combat-actions и .combat-spellbook. —
   a2/a3; R11 не ломается (относительный порядок); требует S7-ре-пин
   (ПОДВОХ №2).
8. spec/ — НЕ правим в этой задаче. — ТЗ не требует; строгие пины
   (2 файла + SPEC_FILE_LINES); ретро создаст follow-up (§4).
9. quickUseRow — гейт как castRow (`if (g)` на null-возврат). —
   сигнатура spellbookUnitGate (ПОДВОХ №3).
10. Кнопка «Предмет [T]» союзника — ВКЛЮЧЕНА, клик без itemId →
    «выберите предмет из инвентаря» (ядро c.invItem готово, UI-пикер —
    000037). — паритет с героем (сегодняшний KeyT), ТЗ п.1.
11. [I]: без нового ряда портретов; dispatch по activeCharId
    (существующий механизм 000145 + ui-tab-skills портреты). —
    panel._portraits уже владеет ui-tab-skills.js; дублирование ряда =
    конфликт состояния.
12. effectTarget-счётчик — фактическая дельта (T), геройский — бит-в-бит
    (прямой amt). — честный лог у юнита при капе; геройский путь не
    чинить (пины).

## 9. Заметки реализации (станция Реализация)

1. **Кросс-реалм deepEqual** — массивы из vm-песочницы ([I]-тесты,
   tests/ui-ally-quick.test.js) имеют чужой Array.prototype:
   assert.deepEqual падает даже на бит-в-бит структурах («Values have
   same structure but are not reference-equal»; даже c.inventory.quick
   из vm createCharacter не проходит). Сравнение — JSON.stringify
   (конвенция проекта: tests/ui-panel.test.js L1318).
2. **quickOpenable-гейт (combat-ui.js)** — canDoAction('quickItem')
   без slot смотрит ПЕРВЫЙ слот; stale-первый (нет предмета) при
   заполненных остальных давал false → список бы не открылся. Прегейт
   quickOpenable(c) (хоть один ок-слот или пустые) + override в
   handleCode (`st.canDo = {ok:true}`) + runAction-тханк возвращает
   {ok:true} при открытии (logRejection не пишется); открытие
   ничего не расходует.
3. **Restore IN PLACE** — allyQuick (main.js) — live-объект: его
   держит G.playerUI (setAllyQuick, live-ссылка). restoreFromSave
   мутирует объект (delete ключей + запись санитизированных), НЕ
   заменяет — замена сломала бы ссылку панели.
4. **sanitizeAllyQuick (main.js)** — чистая, НОВЫЙ объект: ключ
   'efir' — всегда, остальные — только в-отряде (roster.npcId),
   слот — `(typeof v==='string' && G.getItem(v))` иначе null.
   Используется в collectSaveData + 3 startCombat (снимок, live-карта
   не мутирует). В restore — копирование ключей in place.
5. **startCombat opts.allyQuick (combat-ui.js)** — ключ = data.id
   ('efir' — efir.js efirAllyData; npc.id — companions
   allyDataForEntry); вставка — shallow-copy `Object.assign({}, a,
   {quick: q})` ПО записи (данные main.js не мутируют); makeAlly
   читает data.quick.
6. **Строка списка — FLAT** — div.combat-quickrow: прямые дети
   span.combat-quickname / span.combat-quickmeta /
   div.combat-quickrow-desc (тесты читают rows[0].children); -off —
   opacity+cursor, НО click-слушатель ЕСТЬ (reason в лог); пустой
   слот — без слушателя.
7. **sig-ре-билд** — quickSig (unit id + [itemId, ok, reason]×3) —
   как bookSig (000149): innerHTML='' + пере-аппенд только при
   изменении (vm-стаб innerHTML не чистит children).
8. **Ре-пины (технические, по S1–S7)** — tests/combat.test.js
   (CANDO-1/CANDO-2/000198-SEL-5: циклы ['fire','block','flee'] +
   отдельные quickItem/invItem + ok-кейсы с a.quick/addItem),
   tests/combat-ui.test.js (000168-UI-2: заголовок кнопки при пустых
   пулах + enable после заполнения; CU199-MPBAR-1: +combat-quicklist
   между actions и spellbook).

## 10. Стадия мержа — rebase-чеклист (правка по ревью, major)

Ветка зелёна на базе 0fc24f1 (факт станции ревью: 2399 тестов после
правок по ревью, до них 2396; base 2362 + 34 новых + 3 ревью);
master сдвинулся (000203,
000200, 000191, 000196, 000204, 000202, 000212, 000213 → c7c39b8).
000196 (29e0e5b, уже в master) перенёс .combat-spellbook ИЗ
.combat-side (между actions и log) В .combat-box (поле, после
canvas). Rebase на свежий master ПЕРЕД мержем + ОДИН полный
node --test tests/ (baseline master + наши тесты; ожидание — все
зелёные). Конфликтные зоны и перепины (ПОСЛЕ rebasa):

* **src/combat-ui.js build() (~L445)** — сохранить ОБА изменения:
  quickBox (000194) создаётся и appendChild'ится ПОСЛЕ
  side.appendChild(actions) и ДО bookBox-блока; bookBox (000196)
  — перенесён в .combat-box (side.appendChild(bookBox) удалён,
  box.appendChild(bookBox)). Итог: .combat-side — actions,
  quicklist, log; .combat-box — …, bookBox.
* **tests/combat-ui.test.js CU199-MPBAR-1 (~L6533, deepEqual детей
  .combat-side)** — финальный пин:
  ['combat-turnorder','combat-hpbar','combat-mpbar','combat-state',
  'combat-actions','combat-quicklist','combat-log'] ('combat-spellbook'
  ИЗ МАССИВА — книга больше не в side).
* **tests/combat-ui-quicklist.test.js 194-QUI-BUILD / 194-QUI-FINISH** —
  убрать ссылки на 'combat-spellbook' в детях .combat-side (книга
  теперь в .combat-box); контракт позиции quicklist — actions <
  quicklist < log в .combat-side (R11-относительный порядок
  сохранён).
* **CHANGELOG.md** — master уже имеет секцию '## 2026-10-14' (5
  задач): вставить запись 000194 ВНУТРЬ неё, НЕ создавать дубль
  секции.
* **tests/save-restore.test.js** — 000191 добавил 122 строки в КОНЕЦ
  файла; наш append (3 RED-теста) — в ту же точку: склеить, порядок
  ханков не важен (конфликт хвоста).
* **Лайфсикл (tasks/CLAUDE.md)** — в финальный squash-коммит:
  `git mv tasks/pending/000194.md tasks/done/000194.md` + новый
  `tasks/result/000194.md` (краткий отчёт: что сделано, 34+3 новых
  теста, rebase-решения по позиции quicklist, ссылки на этот
  memory-файл). Один коммит задачи (squash 3+1 — red/impl/CHANGELOG/
  правки-ревью; паттерн memory one-commit-per-task-squash).

Дизайн-вопрос РЕШЁН (правка по ревью): .combat-quicklist ОСТАЁТСЯ
в .combat-side (между actions и log) — ТЗ требует только «список
поверх экрана боя», оба варианта (side/поле-оверлей) проходят;
CSS-секция .combat-quicklist* валидна в side, перенос в .combat-box
не требуется (минимальная дельта).
