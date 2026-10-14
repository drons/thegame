# Задача 000195 — БОЙ: кнопка «Предмет» открывает панель [I]; переложить 1 предмет в быстрые (контракт Проектирования)

Worktree: `/home/sas/Documents/Art/thegame/.worktrees/task-000195` (ветка `task/000195`,
база master `7f61aee`). Базовый прогон: **2454 pass / 0 fail**.

ТЗ (`tasks/pending/000195.md`, дословно):

> Во время боя кнопка доступа к инвентарю ничего не делает, а должна открывать панель
> инвентаря с возможностью переложить текущему персонажу ОДИН предмет из общего
> инвентаря в быитрые предметы.

Прямое продолжение 000194 (быстрые предметы союзников, мерж). Механизм «переложить
предмет в быстрые» УЖЕ существует и протестирован (000194); 000195 — сделать [I]-панель
доступной в бою и открыть её боевой кнопкой «Предмет».

---

## 1. Трактовка (разбор расхождения станций a1/a2/a3 — единое решение)

Три станции дали три трактовки; зафиксирована ЕДИНАЯ:

| | a1-domain | a3-tests | **Принято (контракт)** |
|---|---|---|---|
| «кнопка» | [I]-клавиша + touch-[I] | боевая «Предмет» + НОВЫЙ список `.combat-invlist` | **боевая кнопка «Предмет [T]»** (act=invItem, KeyT/KeyU) |
| «должна открывать» | [I] уже открывает (скрытую) — сделать видимой | новый контейнер + новое ядро `c.invToQuick` | **существующую [I]-панель** (видимую в бою) |
| «переложить в быстрые» | уже есть (000194) — не трогаем | новое ядро `c.invToQuick(itemId)` | **уже есть (000194, кнопка «быстр.») — не трогаем** |

Обоснование:

1. **«кнопка» = «Предмет [T]» (act=invItem).** В бою на десктопе единственный видимый
   контрол доступа к инвентарю — кнопка «Предмет» в `.combat-actions`
   (иконка `combat_invitem.svg`, `src/combat-ui.js` L1719-1727, таблица
   `src/combat-keys.js` L61-62: `['KeyT','invItem',true]`, `['KeyU','invItem',false]`,
   label «Предмет»). Клик/клавиша → thunk `c.invItem()` БЕЗ itemId (combat-ui.js L803)
   → ядро `playerInvItem`/`allyInvItem` (combat.js L1499: `if (!itemId) return
   { ok:false, reason:'выберите предмет из инвентаря' }`) — причина уходит ТОЛЬКО в
   журнал, на экране ничего не происходит. Это буквально «ничего не делает».
   - [I]-клавиша «делает» (открывает панель, скрытую под оверлеем z-20 < z-10...
     точнее z-10 ПОД z-20) — симптом «панель под боем», лечится ПОСЛЕДСТВИЕМ (D4,
     подъём), без изменения обработчика KeyI (main.js L1883-1886).
   - Touch-[I] в бою ВООБЩЕ НЕТ (скрыта решением 000150) — это «кнопка отсутствует»,
     не «ничего не делает»; НЕ трогаем (D-TOUCH, §8).
2. **«должна открывать панель инвентаря»** — «панель инвентаря» в кодовой базе =
   [I]-панель (`.char-panel`, вкладка «Инвентарь»). Кнопка открывает ЕЁ. Отклонён
   вариант a3 (`.combat-invlist` + `c.invToQuick`): ТЗ говорит «панель», не
   «список/мини-меню»; в-бой выбор предмета для ИСПОЛЬЗОВАНИЯ — отсроченная 000037
   (memory/000194 §4); новый контейнер ломал бы `CU199-MPBAR-1`/`CU196-POS`
   (side.children deepEqual) — репины ради чужой задачи.
3. **«переложить ОДИН предмет»** — панель ЭТОЙ возможностью уже обладает (000194):
   на КАЖДОЙ строке общего инвентаря кнопка `['быстр.', 'quick', { item: e.id }]`
   (ui-tab-inventory.js, без фильтра по типу); назначение — активному персонажу
   панели (`activeCharId`, 000145): Флогистон → `G.freeQuickSlot`+`G.setQuick`
   (hero.inventory.quick — live); союзник → живой `allyQuickMap` (setAllyQuick,
   персист save.ally_quick). «ОДИН предмет» = один предмет на одно нажатие
   (первый свободный слот) — СУЩЕСТВУЮЩАЯ семантика; нового лимита НЕ вводим.

**Итог: 000195 = сделать [I]-панель доступной в бою + открыть её кнопкой «Предмет»
на ТЕКУЩЕМ персонаже боя + live-sync быстрых СОЮЗНИКОВ (чтобы переложение действовало
в текущем бою).** Ни ядра combat.js, ни ui.js, ни новых UI-контейнеров.

## 2. Что добавлено / перенесено

НОВЫХ: механик НЕТ, модулей НЕТ, `<script>` НЕТ, CSS-правил НЕТ, SVG НЕТ,
save-полей НЕТ, вызовов c._rng НЕТ.

Добавлено (точечно, 2 файла src):

1. **Открытие панели кнопкой** — thunk `invItem` (combat-ui.js L803) открывает
   существующую [I]-панель на активном юните (D1).
2. **Подъём панели над боем** — условие `applyLayer` в frame() (main.js L3321-3327)
   расширяется: подъём «25» теперь и в бою (D4).
3. **Live-sync быстрых слотов СОЮЗНИКОВ в бою** — `allyQuickLive`-опт →
   `combat._allyQuickLive` → `syncAllyQuickLive(c)` (D5).

Переиспользовано (НЕ дублируется):

- **000206/000212 frame-driven подъём**: `applyLayer` (ui.js L497-502) идемпотентен,
  inline `zIndex '25'`/`''` при `isOpen()`; базовый CSS `.char-panel { z-index: 10 }`
  (index.html L62) НЕ меняется; '25' — СУЩЕСТВУЮЩИЙ динамический слот
  (лестница: oверлеи 20 < динамический 25 < touch-controls 30).
- **000194 [I]-дипатч «быстр.»**: `doItemAction 'quick'` (ui.js L277-324) по
  `activeCharId` + `setAllyQuick` + save `ally_quick` — как есть.
- **000145 `activeCharId`** + 3-аргументный `toggle(force, tabId, charId)`
  (ui.js L457-495) — как есть.
- **000121 touch routing** / `onInventory` (main.js L2035-2037) — как есть.
- **000167 `G.activeUnitId`** через `activeUnit(c)` (combat-ui.js L1839-1845) —
  как есть (typeof-guard, игрок/моб → null).

## 3. Контракты и границы

### 3.1 D1 — thunk `invItem` открывает [I]-панель (combat-ui.js L803)

```js
invItem: () => {
  if (G.playerUI && typeof G.playerUI.toggle === 'function') {
    const u = activeUnit(c);
    G.playerUI.toggle(true, 'inventory', u ? u.id : 'flogiston');
    return { ok: true };
  }
  return c.invItem();
},
```

- `G.playerUI.toggle(true, 'inventory', charId)` — 3-аргументная форма с 000145:
  force-show, вкладка «Инвентарь», `activeCharId = String(charId)`.
- **«Текущий персонаж» = активный юнит хода** (`activeUnit(c)` — L1839-1845,
  `G.activeUnitId(c)`, null для игрока/моба):
  - ход Флогистона/моба → `u === null` → `'flogiston'`;
  - ход Эфира/наёмника → `u.id` — РЕАЛЬНЫЕ id продакшена ('efir'/npcId; makeAlly
    combat.js L353: `id: data.id || 'a'+idx`; production-аллисы ВСЕГДА с id —
    party.js L74/L83/L99: `"flogiston"`/`"efir"`/`entry.npcId` — те же id, что
    `dataset.memberid` портретов 000145 → подсветка активного портрета согласована).
- **Открытие БЕСПЛАТНО**: `{ok:true}` → `logRejection` (L595-597) молчит; пул
  `c.ps.invItem`/`u.invItem` НЕ тратится; c._rng НЕ трогается — паттерн
  UI-действий spellbook/quickItem/flee (thunk-таблица L759+, предпроверка гейта
  УЖЕ сделана: по клавише — в handleCode (st.canDo, L888-900), по кнопке — кнопка
  disabled при !ok (L1736-1747)).
- **Кнопка ≡ клавиша**: кнопка (L349-362) → `runAction(c, item.action)`;
  KeyT/KeyU → handleCode → resolveCombatKey → `runAction`. ОДИН thunk.
- **Деградация**: нет `G.playerUI` (vm-цепочка без ui.js — стандартная статика) →
  старый путь `c.invItem()` бит-в-бит (пин 195-CUI-DEGRADE).
- Метка/aria-label «Предмет» (describeCombatKeys) НЕ меняется (динамический пин
  aria-label combat-ui.test.js L1187 зелёный).

### 3.2 D2 — ГЕЙТ КНОПКИ НЕ МЕНЯЕТСЯ

Кнопка/клавиша остаются гейтнуты `canDoAction(c, 'invItem')` (combat.js L1753-1770
герой / L2390-2404 союзник): **свой ход + не блок + пул > 0 + ≥1 применимый предмет
(potion/food/skill_book) в ОБЩЕМ инвентаре**. Отклонён вариант «гейт = только ход»:
ломает существующие СЕМАНТИЧЕСКИЕ пины (000168-UI-2 a/b: disabled + title «нет
применимых предметов в инвентаре»; combat.test.js canDoAction L1372-1392, L6641) —
запрещено инвариантом; ТЗ гейт не предписывает («не больше и не меньше»).
Последствия (сохраняются, всё зелёное):

- без хода/при блоке/без пула — кнопка disabled, клавиша → reason в лог (как раньше);
- пустой инвентарь → disabled + «нет применимых предметов в инвентаре» (пин 195-CUI-GATE);
- инвентарь с НЕ-применимыми предметами (броня/материалы) → кнопка disabled, но [I]
  (видимый в бою, D4) даёт «быстр.» на любой строке — полная способность ТЗ
  сохраняется через [I], кнопка — шорткат (D2 — осознанно);
- handleCode-поток БЕЗ ИЗМЕНЕНИЙ: `st.canDo`-снимок → resolveCombatKey → `r.reason`
  в лог (отказ) ИЛИ runAction (успех → thunk открывает панель).

### 3.3 D3 — «текущему персонажу» — пре-селект активного юнита

При открытии ПО КНОПКЕ панель получает `charId` (D1) → `activeCharId` = активный
юнит → «быстр.» кладёт предмет СРАЗУ текущему персонажу (без ручного
переключения по портретам). Ручное переключение (портрет-строки, 000145)
продолжает работать (перекладывание тогда — выбранному персонажу).
**Обработчик KeyI в main.js (L1883-1886) НЕ ТРОГАЕМ** (`G.playerUI.toggle()` —
generic toggle, последний персонаж per-session): [I] = общий переключатель
(существующая семантика), кнопка = «панель на текущем персонаже боя» (ТЗ).
Меньше риска по Esc-пинам (ui-panel.test.js L600-661).

### 3.4 D4 — Подъём панели над боем (main.js frame(), механизм 000206)

Текущее (main.js L3321-3327):

```js
      if (G.playerUI && typeof G.playerUI.applyLayer === 'function') {
        G.playerUI.applyLayer(!!inDungeon && !inCombat && !inNpc
          && !inBuilding && !inCraft && !inResurrect && !(
            G.buildingActions
            && typeof G.buildingActions.renameInputActive === 'function'
            && G.buildingActions.renameInputActive()));
      }
```

Новое (убрать `!inCombat`, обобщить `inDungeon` → `inDungeon || inCombat`):

```js
      if (G.playerUI && typeof G.playerUI.applyLayer === 'function') {
        // 000195: в бою панель ПОДНЯТА над боевым оверлеем (z-25 > z-20) —
        // граница 000206 «бой — подъёма нет» снята (кнопка «Предмет [T]»
        // открывает панель в бою).
        G.playerUI.applyLayer(!!(inDungeon || inCombat) && !inNpc
          && !inBuilding && !inCraft && !inResurrect && !(
            G.buildingActions
            && typeof G.buildingActions.renameInputActive === 'function'
            && G.buildingActions.renameInputActive()));
      }
```

- Переиспользуем frame-driven подъём 000206/000212: `applyLayer` идемпотентен,
  пишет inline `panel.style.zIndex = '25'`/`''` при `isOpen()`; базовый CSS
  z-10 НЕ меняется (пин ui-panel.test.js L487-519 зелёный); z-25 — СУЩЕСТВУЮЩИЙ
  динамический слот — нового CSS НЕТ.
- Бой может быть в городе (debug `startCombatAt`), подземелье, зоне — все три
  поднимают (конъюнкт не зависит от локации в бою).
- Гарды СОХРАНЕНЫ: `!inNpc`/`!inBuilding`/`!inCraft`/`!inResurrect`/
  renameInputActive → CI-3 (мир: нет), CI-4 (выход с открытой панелью),
  CI-5 (buildingUI), CI-7 (мир+диалог: нет), CI-8 (rename input: нет) —
  зелёные БЕЗ изменений.
- **000212 hudOver НЕ ТРОГАТЬ** (L3328-3336: `inDungeon && … && !inCombat` —
  HUD ПОД боевым оверлеем, как раньше). Не «упрощать» вместе с applyLayer.
- Побочный (правильный) эффект: [I] в бою тоже поднимает панель (applyLayer не
  знает, ЧТО открыло панель — только isOpen) → CI-6 репин покрывает оба пути.
- Touch-кнопки [I]/[E] в бою ПО-ПРЕЖНЕМУ скрыты (000150,
  `touchControlsVisibility` controls.js L346-354 — НЕ ТРОГАЕМ; TV2/TV4 зелёные).
- Визуальный эффект: панель (z-25) перекрывает боевой UI — ожидаемо (это [I]-панель);
  Esc/клик-закрыть — существующие; конец боя с открытой панелью — lift снимается
  условием frame (inCombat false → город z-10 / подземелье z-25), НОВЫХ
  close-правил НЕТ (семантика CI-4/000206).
- **ПРАВКА РЕВЬЮ (фаза banner)**: в ветке `c.result` render() (combat-ui.js) —
  guarded-автозакрытие player-панели (`G.playerUI.isOpen()` → `toggle(false)`;
  идемпотентно — render каждый кадр; нет ui.js — no-op). Причина: поднятая панель
  (z-25) накрывала баннер РЕЗУЛЬТАТА (z-20, тот же .combat-overlay), а ui.js-гард
  Esc (`cc.result → return`) в фазе результата панель НЕ закрывает — игрок
  пропускал текст «ПОБЕДА!/гибель», пока не закрыл панель [I] вручную.
  Отклонён вариант «ограничить подъём фазой активного боя в main.js frame()»:
  applyLayer frame-driven и не знает о result; закрытие в combat-ui — одна точка
  показа баннера. Пост-finish-семантика (CI-4) не меняется: закрытие — в момент
  показа баннера, не в finish; если render с c.result не выполняется (vm без
  rAF), панель после finish открыта — семантика master. Пин: CI-11
  (city-inventory-e2e; красный до фикса / зелёный после).

### 3.5 D5 — Live-sync быстрых слотов СОЮЗНИКОВ в бою (allyQuickLive)

**Проблема.** `u.quick` у союзника — СНИМОК с момента `createCombat` (makeAlly
combat.js L387-388: `quick: [0,1,2].map(...data.quick...)`; opts.allyQuick =
`sanitizeAllyQuick(allyQuick)`). Без синка: ход союзника → панель → «быстр.» →
запись в ЖИВУЮ карту (setAllyQuick, main.js L258-260) → панель ПОКАЗЫВАЕТ слот
заполненным (equipmentTab читает `ctx.allyQuick[mid]`), но `u.quick` — устаревший
снимок → [E]/quicklist/гейт quickItem «ничего» В ТЕКУЩЕМ бою. Это воспроизводит
симптом ТЗ для союзника и ломает смысл «переложить ТЕКУЩЕМУ персонажу».
Для ГЕРОЯ синк НЕ нужен: `c.player` — ЖИВАЯ ссылка на hero (createCombat
combat.js L3155), `playerQuickItem` (L1454-1490) читает `p.inventory.quick`
при каждом ходе.

**Решение (минимальное, без ядра):**

1. `src/main.js` — на ВСЕХ ТРЁХ startCombat-вызовах рядом с существующим
   `allyQuick: sanitizeAllyQuick(allyQuick),` добавить:

   ```js
   allyQuickLive: allyQuick,
   ```

   Точки: L1717 (`startCombatAt`, debug-бой), L2197 (бой мира), L2771 (бой
   подземелья). `allyQuick` — live-замыкатель (main.js L258), тот же объект,
   что у `G.playerUI.setAllyQuick(allyQuick)` (L260) и restore `ally_quick`
   (L1120-1121 — мутация in place, live-ссылка НЕ меняется) — конвенция 000194.

2. `src/combat-ui.js` — startCombat (после `const combat = G.createCombat(…)`
   и блока buildEfirUnit, до `ctx = {…}`, ~L2560):

   ```js
   combat._allyQuickLive = (opts.allyQuickLive && typeof opts.allyQuickLive === 'object'
     && !Array.isArray(opts.allyQuickLive)) ? opts.allyQuickLive : null;
   ```

   UI-only поле (конвенция `c._fx`/`c._unitFx`: ядро combat.js его НЕ читает);
   + JSDoc `@param` рядом с `opts.allyQuick` (L2502-2506): «000195: live-карта
   (тот же объект, что setAllyQuick) — re-sync u.quick в бою; не читается ядром;
   не передан → null (снимок, бит-в-бит)».

3. `src/combat-ui.js` — новая чистая функция (рядом с `activeUnit`, L1839-1845):

   ```js
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
   ```

   (валидация зеркалит makeAlly: нестрока → null-слот; НУЛЬ c._rng; u.quick —
   поле, которое ядро читает в allyQuickItem/firstAllyQuickSlot/гейтах, записанное
   UI-слоем — паттерн c._fx «ядро не знает»; детерминизм не задет: содержимое
   слотов не входит в c._rng-потоки, предмет берётся из ОБЩЕГО инвентаря, как и
   сейчас; герой в c.units НЕТ (c.player отдельно) — герой не трогается; efir.js
   buildEfirUnit u.quick НЕ трогает (проверено: 0 ссылок на quick в efir.js)).

4. Точки вызова (ОБЕ обязательны):
   - **НАЧАЛО `handleCode`** (L850-852, сразу после `const c = ctx.combat;`,
     ДО снимка `st.canDo` L888-900): иначе KeyE после перекладывания увидит
     УСТАРЕВШИЙ `u.quick` (гейт quickItem/quickOpenable считают «снимок до
     runAction»). КРИТИЧНОЕ размещение.
   - **НАЧАЛО `render()`** (L1467-1469, после `const c = ctx.combat;`):
     состояние кнопок/quicklist/бейджей свежее между нажатиями (браузер — rAF
     каждый кадр; vm — по событию; идемпотентна).

**Границы/последствия:**

- Персист: НОВОЙ save-секции НЕТ (`ally_quick` — та же, 000194; записи из панели
  попадают в сейв, как раньше, через live-карту L783).
- Live/snapshot-матрица: герой — live-quick СРАЗУ (как было); союзник — sync'ом
  СРАЗУ (было: следующий бой); персист — `ally_quick` без изменений.
- Тестовые id `'aN'` (без записи в live-карту) → `live[u.id] === undefined` →
  `Array.isArray` false → skip (юнит не трогается, бит-в-бит). Продакшен:
  'efir'/npcId всегда в карте после restore.
- **Фолбэк для ревью**: если live-sync отклонят — выключается локально
  (main.js: 3 строки opts; combat-ui: поле + функция + 2 вызова). Поведение
  деградирует до контракта 000194: назначение союзнику действует СЛЕДУЮЩИЙ бой.
  Фолбэк НЕ ломает D1-D4 (hero-путь и подъём — независимы).

### 3.6 ЧАСОВЫХ / ЯСНО НЕ ДЕЛАЕМ («не больше, чем ТЗ»)

1. Новый в-бой контейнер списка (`.combat-invlist`) — НЕТ (это 000037).
2. Новое ядро `c.invToQuick` / изменения `c.invItem(itemId)` — НЕТ (combat.js
   бит-в-бит; «использовать предмет» — семантика якорей combat.test.js L756/L418,
   combat-quick-ally L219 «выберите предмет из инвентаря»).
3. Touch-видимость в бою (000150) — НЕТ (D-TOUCH, §8).
4. Расслабление гейта invItem — НЕТ (D2).
5. Изменение обработчика KeyI / squadUI / Esc-стека — НЕТ.
6. Новые `<script>`, CSS-правила, SVG-ассеты — НЕТ → **index.html НЕ МЕНЯЕТСЯ**,
   tests/index-order.test.js и tests/svg.test.js — без изменений.
7. Новый UMD-модуль — НЕТ (правки внутри существующих combat-ui.js/main.js —
   браузерные скрипты, не UMD; G-снимок 000038 не затрагивается: `G.playerUI`
   читается в МОМЕНТ ВЫЗОВА, как все G.* в combat-ui).
8. 000212 hudOver (HUD в бою ПОД оверлеем) — НЕТ (D4).

## 4. Ленивые ссылки и guards

- **`G.playerUI`** — снапшот G один раз при загрузке (000038); в thunk читается
  в МОМЕНТ ВЫЗОВА; guard `typeof G.playerUI.toggle === 'function'` → деградация
  на старый путь `c.invItem()` бит-в-бит (195-CUI-DEGRADE). Играть не падает:
  thunk возвращает результат ядра (reason в лог), исключений нет.
- **`G.activeUnitId`** — typeof-guard ВНУТРИ `activeUnit` (существующий, 000167:
  фолбэк до 000167 — null → `'flogiston'` — бит-в-бит).
- **`opts.allyQuickLive`** — guard объект + `!Array.isArray` → иначе null
  (снимок, бит-в-бит); **`syncAllyQuickLive`** — guard `live` объект,
  `u.side === 'ally'`, `u.id`, `Array.isArray(live[u.id])`, typeof string на
  слот; любой мусор → skip/null-слот, без исключений.
- **`applyLayer`** — идемпотентен, guard `isOpen()`; закрытая панель → z `''`
  даже с подъёмом (195-LIFT).
- **Боевые состояния**: `fleeOpen` (000210) — handleCode ранним return true
  (KeyT/клик не доходят до thunks); `c.result` — Space/Enter закрывает, прочее
  consumed=false; `lungeGate` — ранний return; panel `attachEsc` — только Esc
  (движение/панель не конфликтуют: keydown main.js → combatUI.handleCode ПЕРВЫМ
  при активном оверлее, существующее).
- **KeyI под KeyT-конфликтом**: в main.js ветки KeyT НЕТ (сверено grep) —
  конфликтов обработчиков нет.

## 5. Что важно будущим задачам (из ссылок ТЗ/соседних)

- **000037 (мини-меню выбора предмета для ИСПОЛЬЗОВАНИЯ в бою) — ОТСРОЧЕНА.**
  Контракт 000194 §4: «c.invItem для союзника УЖЕ готов, нужна только UI-раздача
  itemId (оверлей-список по образцу quicklist)». Когда прилетит: текущий thunk
  D1 (панель на активном юните) — точка расширения (список/меню вместо панели
  ИЛИ панель + раздача itemId); сохранить: открытие БЕСПЛАТНО, гейт D2,
  деградацию. Оверлей-список (если решат) — по вердикту 000196 живёт в
  `.combat-box` (append ДО bannerEl, banner ВСЕГДА последним — 000210).
- **000150 (touch-пара [I]/[E])** — видимость в бою НЕ возвращена (D-TOUCH);
  если будущая ТЗ потребует — отдельная правка `touchControlsVisibility`
  (controls.js L346-354) + репины TV2/TV4.
- **000194** — save-контракт `ally_quick` НЕ изменился; НОВОЕ: u.quick re-sync'ится
  с live-карты в бою (syncAllyQuickLive) — назначение союзнику действует В ТЕКУЩЕМ
  бою (было: следующий бой).
- **000206** — граница «бой (ручной [I] — панель скрыта)… НЕ МЕНЯЕТСЯ» СНЯТА
  000195: в бою панель поднята (z-25). Сноски в memory/000206 (3 места, §9).
- **Z-лестница** (index.html): базовый `.char-panel` 10 < боевой оверлей 20 <
  динамический 25 (applyLayer 000206 + hudOver 000212) < touch-controls 30.
  Новых ступеней НЕТ.
- **Панель в бою раскрывает ВСЕ действия панели** (use/equip/remove для hero) —
  ПРЕСУЩЕСТВУЮЩАЯ семантика (на master панель уже открывалась скрыто); ТЗ 000195
  не вводит новых действий — только делает панель видимой. Если будущая ТЗ
  ограничит — отдельная задача.

## 6. Подводные камни (проверены при проектировании)

1. **sync ДО st.canDo** (handleCode): иначе KeyE после перекладывания гейтится
   по устаревшему u.quick. Точка — после `const c = ctx.combat;` (L852), до
   L888-900.
2. **`'aN'`-фолбэк**: тестовые союзники без id не в live-карте → sync skip;
   продакшен id всегда в карте. Не «чинить» fill-записью (создаст мусор в сейве).
3. **c._rng**: 0 новых вызовов в любых новых путях; в тестах фиксировать
   счётчиком-обёрткой (`let n=0; const old=c._rng; c._rng=(...a)=>(n++,old(...a));`)
   — assert n===0 после открытия панели (паттерн изоляции combat-ui.test.js
   `c._rng = () => 0.99`).
4. **Не смешивать с 000212 hudOver**: правка ТОЛЬКО applyLayer-конъюнкта;
   hudOver (`!inCombat`) остаётся — HUD ПОД боем.
5. **vm full-chain роняет document-listeners** (Esc) — закрывать панель вторым
   KeyI (паттерн CI-6).
6. **Гейт кнопки строгий** (≥1 применимый): «быстр.» на НЕ-применимых
   предметах (броня/материалы) — ТОЛЬКО через [I] (D2, осознанно).
7. **Открытие БЕСПЛАТНО** — не добавлять трату пула в thunk (паттерн
   spellbook/quickItem); пул тратится при ИСПОЛЬЗОВАНИИ предмета.
8. **CI-6 — ТЗ-обязанный репин**: комментарий «ТЗ бой не касается» устаревает;
   новый assertion — `panel.style.zIndex === '25'`.
9. **Один worktree = один полный `node --test`** (тест 000054 мутирует
   src/npc-data.js) — не параллелить прогоны.
10. **Конец боя с открытой панелью**: finish() — panel остаётся открыта,
    lift снимается frame-условием (город → `''`, подземелье → `'25'`);
    НОВЫХ close-правил не вводить (CI-4-семантика).
11. **Комментарии**: конвенция файла — краткие task-тегированные (2-4 строки,
    ЧТО/зачем, без повторов); весь глубокий контекст — здесь (memory/000195).

## 7. Тест-карта

### 7.1 НОВЫЙ `tests/combat-inventory-panel.test.js` (vm)

Цепочка: ДИНАМИЧЕСКИЙ парсинг `<script src>` из index.html до ui.js включительно
(паттерн CHAIN_194, tests/ui-ally-quick.test.js — автоматически отражает порядок
браузера: ui-tabs → ui-tab-* → ui) + добавить combat-ui.js (следующий боевой
скрипт; в index.html он после ui.js). DOM-стаб — дерево-стаб ui-ally-quick
(matchesSel/findAll/closest/querySelector, textContent-setter, listeners.click);
расширить под нужды build() combat-ui (canvas-оверлей, .combat-box, .combat-side,
кнопки с dataset.act; `overlay.querySelectorAll('.combat-actions button')` — по
реальным потомкам). Дублирование харнеса — принятая конвенция (CHAIN_000130).
ВТОРОЙ лоадер — стандартная статика БЕЗ ui.js (паттерн loadCombatUi194) — для
195-CUI-DEGRADE.

Проводка (как main.js L252-260): `G.playerUI.setCharacter(c.player)` +
`G.playerUI.setAllyQuick(liveMap)`; startCombat-опции — `allyQuick:
sanitizeAllyQuick(liveMap)` + `allyQuickLive: liveMap` (тестируем проводку D5
в статике — мок-опт).

Сцены (паттерн loadCombatUi194/194-QUI-*): hero (пустые quick) + союзник
(makeAlly + push units/turnOrder; id 'a1', в live-карте); общий инвентарь
`G.addItem(c.player, 'healing_potion')` (c.player = live hero — тот же объект);
пул по default; ход героя — start, ход союзника — Space (endTurn).

| id | Проверяет | Красный сейчас? |
|---|---|---|
| 195-CUI-OPEN | ход hero, зелье: KeyT → `G.playerUI.isOpen()===true`; `getActiveCharId()==='flogiston'`; вкладка inventory активна (в `_invBody` строка с `data-act="quick"`); `c.ps.invItem` нетронут; c._rng 0 вызовов (счётчик); в c.log НЕТ «выберите предмет из инвентаря» | ДА: thunk → c.invItem() → строка в лог, панели нет |
| 195-CUI-BTN | то же, но клик по кнопке act=invItem (listener, паттерн 194-QUI-BTN) — кнопка ≡ клавиша | ДА |
| 195-CUI-HERO-QUICK | после KeyT: `findAll(panel,'.cp-btn')` data-act=quick → `panel.listeners.click[0]({target: btn})` (паттерн ui-ally-quick clickBtn) → `c.player.inventory.quick[0]==='healing_potion'`; totalQty предмета НЕ изменилось (переложить, не использовать); инв-слоты нетронуты; пул нетронут | ДА: панели нет |
| 195-CUI-ALLY-OPEN | ход союзника: KeyT → панель открыта, `getActiveCharId()==='a1'` (пре-селект активного юнита, D1/D3) | ДА |
| 195-CUI-ALLY-SYNC | ход союзника, `liveMap={a1:[null,null,null]}`: KeyT → «быстр.» → `liveMap.a1[0]==='healing_potion'` → KeyE (handleCode → sync на входе) → `u.quick[0]==='healing_potion'` → quicklist строка → клик по строке → hp союзника + (allyQuickItem), предмет ПОТРЕБЛЁН из c.player.inventory, `u.quickItem` 1→0, quick героя нетронут | ДА: без sync u.quick — снимок [null×3] |
| 195-CUI-GATE | hero, ПУСТОЙ инвентарь: KeyT → панель НЕ открыта; c.log содержит «нет применимых предметов в инвентаре» (гейт сохранён, D2) | НЕТ (якорь: гейт жив) |
| 195-CUI-DEGRADE | статика БЕЗ ui.js: ход hero + зелье → KeyT → c.log «выберите предмет из инвентаря» (старый путь, D1-деградация) | НЕТ (якорь) |
| 195-LIFT | поверхность applyLayer: `toggle(true)` + `applyLayer(true)` → `panel.style.zIndex==='25'`; `applyLayer(false)` → `''`; закрытая + `applyLayer(true)` → `''` (idempotent, isOpen-зависимость) | НЕТ (якорь 000206) |

Красных: 5 (OPEN/Btn/HERO-QUICK/ALLY-OPEN/ALLY-SYNC); якоря зелёные ДО и ПОСЛЕ.

### 7.2 `tests/city-inventory-e2e.test.js` (полная цепочка с main.js)

- **CI-6 — РЕПИН (ТЗ-обязан)**: «подъёма НЕТ (!inCombat)» → «подъём '25'»:
  enterDungeon → startCombat (debug, панель закрыл — 000096, остаётся) → KeyI →
  `isOpen true` → `h.frameFn(NOW+16)` → **`panel.style.zIndex==='25'`**
  (было `!panel.style.zIndex`) → KeyI (закрыть) → кадр → `zIndex===''` →
  resolveCombat → локация цела (остаток без изменений). Название/комментарии —
  обновить (граница 000206 «бой — подъёма нет» снята 000195 — требование ТЗ;
  семантический репин ОБОСНОВАН ТЗ — инвариант допускает: «если ТЗ предписывает
  иначе»).
- **CI-9 (НОВЫЙ, полный loop ТЗ в full-chain)**: мир → `g.actions.startCombat()`
  (debug-бой на тайле; возвращает c — `startCombatAt`) → `G.addItem(c.player,
  'healing_potion')` (c.player = live hero) → KeyT → `frameFn` → панель open +
  `zIndex==='25'` + вкладка inventory + `getActiveCharId()==='flogiston'` +
  `c.ps.invItem` нетронут → «быстр.»-клик (паттерн CI-8:
  `panel.listeners.click[0]({target: btn})`, btn — `findAll` по
  `data-act="quick"`) → `c.player.inventory.quick[0]==='healing_potion'` →
  KeyI → кадр → `zIndex===''` → resolveCombat.
- **CI-10 (НОВЫЙ, гейт-якорь в full-chain)**: мир → debug-бой (новый hero,
  ПУСТОЙ инвентарь) → KeyT → панель НЕ открыта + c.log содержит «нет
  применимых предметов в инвентаре» + `zIndex` falsy → resolveCombat.

Красная дисциплина: red-прогон — с НОВЫМ статичным файлом (5 fail из
2454+8=2462); правки e2e (CI-6/CI-9/CI-10) — в реализационном коммите
(CI-9 до фикса тоже красный — не смешивать с red-стадией). Финал:
2454 + 10 новых (8 + CI-9 + CI-10) = **2464 pass, 0 fail** (CI-6 — на месте).

### 7.3 Зелёные БЕЗ изменений (инвариант «существующий набор — зелёный»)

- TV2/TV4 (ui-touch-visibility) — touch НЕ тронут (D6.3).
- 000168-UI-2 a/b (combat-ui.test.js L3424-3530) + canDoAction-пины
  (combat.test.js L1372-1392, L6641) — гейт не тронут (D2).
- CU199-MPBAR-1 (L6613) / CU196-POS (L7273/7286) / CU182-ORDER / CU210-* —
  DOM боя НЕ меняется (D6.6: контейнеров нет).
- 194-QUI-* / 194-CORE-* / 194-SAVE-* — quicklist/ядро/save не тронуты.
- CI-3/CI-4/CI-5/CI-7/CI-8 — гарды applyLayer сохранены (D4).
- ui-panel (z-10 CSS, Esc), index-order, svg, save-restore, боевые goldens/
  determinism — combat.js бит-в-бит, 0 новых c._rng, 0 новых save-полей.

## 8. Решения openQuestions (станция Проектирование)

- **Q1 (контейнер: side vs box)** — не применимо: НОВОГО контейнера НЕТ (а3
  отклонена); «панель» = существующая `.char-panel` (D4) → репинов
  CU199-MPBAR-1/CU196-POS НЕТ, нового CSS НЕТ. — почему: ТЗ говорит «панель»,
  а новый список — отсроченная 000037 («не больше, чем ТЗ»).
- **Q2 (охват списка: все vs применимые)** — не применимо: «быстр.» — на ВСЕХ
  строках общего инвентаря (существ. паритет [I], ui-tab-inventory.js без
  фильтра); строгий гейт (≥1 применимый) — ТОЛЬКО у кнопки (D2). — почему:
  не изобретать фильтрацию, которой нет в [I].
- **Q3 (персистентность союзника)** — опция A: live-карта доп. оптом
  (`allyQuickLive`, D5). — почему: live-ссылка = конвенция setAllyQuick/000194
  (выживает save во время боя; тестируемо в статике мок-оптом); вариант B
  (sync в onEnd) теряет переложение при загрузке во время боя.
- **Q4 (трата пула)** — открытие БЕСПЛАТНО (thunk `{ok:true}`, пул/c._rng не
  тратятся); клик «быстр.» в панели — пул боевой НЕ тратится вообще
  (существ. 000194: переложение — панельное действие; пулы тратятся при
  ИСПОЛЬЗОВАНИИ quick-предмета: c.ps.quickItem / u.quickItem); требование
  пула > 0 в ГЕЙТЕ кнопки сохраняется (D2: пул 0 → кнопка disabled, полная
  способность — через [I]). — почему: паттерн spellbook/quickItem; ТЗ не
  вводит новой траты.
- **Q5 (строка лога переложения)** — НОВОЙ строки в c.log НЕТ: переложение —
  панельное действие (фидбек существующий: .cp-notice flashNotice при отказе,
  «Быстрые слоты (бой)» equipmentTab показывает слот); причины отказов —
  существующие («все быстрые слоты заняты» / «предмета нет в инвентаре»). —
  почему: не дублировать фидбек; пины логов 000194 не трогаются.
- **D-TOUCH (a1: A — вернуть пару [I]+[E] в бой / B — расщепить пару)** — ОТКЛОНЁНЫ
  ОБА: touch-видимость НЕ меняется. — почему: (1) touch-[I] в бою «отсутствует»,
  а не «ничего не делает» (ТЗ — про бездействие); (2) откат задокументированного
  решения 000150 = «больше, чем ТЗ»; (3) репины TV2/TV4 — СЕМАНТИЧЕСКИЕ
  (запрещены инвариантом). TV2/TV4 зелёные без изменений.
- **D-ALLY (a1: (1) snapshot — следующий бой / (2) live-sync)** — (2) в
  МИНИМАЛЬНОЙ форме без ядра (D5): u.quick re-sync'ится UI-слоем из live-карты.
  — почему: ТЗ — «переложить ТЕКУЩЕМУ персонажу» (тому, чей ход); (1)
  воспроизводит симптом ТЗ для союзника; ядро combat.js при этом НЕ трогается
  (узел-поле записывается UI-слоем — паттерн c._fx), фолбэк локален.

## 9. Дельты против старых memory (сноски — стадия Реализации)

- **memory/000206-inventory-over-city.md** (3 сноски):
  1. L119-120 «Границы поведения (НЕ МЕНЯЕТСЯ) … бой (ручной [I] — панель
     скрыта, как раньше)» → «бой — ПОДНЯТА (z-25, 000195: кнопка «Предмет [T]»
     открывает панель в бою); граница снята»;
  2. L183-185 (CI-6: «подъёма НЕТ») → «подъём '25' (000195)»;
  3. L218-220 (отклонённый (a1): «ручной [I] в бою — панель становится ВИДНА
     поверх боя — вне скоупа ТЗ») → «…; СНЯТ в бою 000195 (кнопка «Предмет [T]»
     открывает панель)».
- **memory/000194-ally-quick-items.md** (1 строка в §2.2 «Ядро боя: снапшоты
  и пулы», рядом с описанием u.quick-снимка): «000195: u.quick re-sync'ится
  с live-карты в бою (combat-ui syncAllyQuickLive, opts.allyQuickLive) —
  назначение союзнику действует В ТЕКУЩЕМ бою; save-контракт ally_quick
  не изменился (см. memory/000195)».

## 10. Файлы и ожидаемая дельта (план реализации)

| Файл | Что делаем | Дельта |
|---|---|---|
| `src/combat-ui.js` | (1) thunk `invItem` L803 → D1; (2) `syncAllyQuickLive` после `activeUnit` (~L1845); (3) startCombat: `combat._allyQuickLive` после buildEfirUnit-блока (~L2560) + JSDoc `@param allyQuickLive`; (4) `syncAllyQuickLive(c);` в начале handleCode (после `const c = ctx.combat;` L852); (5) `syncAllyQuickLive(c);` в начале render() (после `const c = ctx.combat;` L1469) | ~+30 строк |
| `src/main.js` | (1) applyLayer-условие L3321-3327 → D4 (+комментарий-сноска 000195); (2) 3× `allyQuickLive: allyQuick,` после `allyQuick: sanitizeAllyQuick(allyQuick),` (L1717/2197/2771, +1 строка-комментария) | ~+8 строк |
| `tests/combat-inventory-panel.test.js` | НОВЫЙ: 2 лоадера (динамика до ui.js + combat-ui.js; статика без ui.js) + DOM-стаб + проводка playerUI + 8 тестов (§7.1) | ~+400 строк |
| `tests/city-inventory-e2e.test.js` | CI-6 репин (assertion + title/комментарии) + CI-9 + CI-10 (§7.2) | ~+80 строк |
| `memory/000195-combat-inventory-panel.md` | НОВЫЙ (этот файл — стадия Проектирование) | ~+250 строк |
| `memory/000206-inventory-over-city.md` | 3 сноски (§9) | ~+3 строки |
| `memory/000194-ally-quick-items.md` | 1 строка-сноска (§9) | ~+2 строки |
| `CHANGELOG.md` | `## 2026-10-14` → `### Игровой процесс` — упоминание (игрок-видимое: кнопка «Предмет» открывает панель в бою, переложение в быстрые действует в этом же бою, [I]-панель видна поверх боя); отдельный коммит «Задача 000195: CHANGELOG — …»; программная часть не перечисляется | ~+8 строк |
| `tasks/pending/000195.md` → `tasks/done/000195.md` + `tasks/result/000195.md` | перенос + краткий отчёт (ссылки на memory/тесты/CHANGELOG) | ~+25 строк |

НЕ ТРОГАТЬ: src/ui.js, src/combat.js, src/combat-keys.js, src/controls.js,
src/ui-tab-inventory.js, src/efir.js, index.html, spec/, все остальные тесты,
.merge-pending (создаёт только merge-стадия).

Итого: 2 файла src (~40 строк), 2 файла тестов (~480 строк, 1 новый,
10 новых тестов + 1 репин), 3 memory (~255 строк, 1 новый), CHANGELOG,
tasks done/result.

Коммит (ветка task/000195): 1 коммит, первая строка
`Задача 000195: БОЙ — кнопка «Предмет» ([T]) открывает панель инвентаря поверх
боя; переложить 1 предмет в быстрые текущему персонажу; [I]-панель видна в бою;
быстрые слоты союзников синхронизируются в бою` + финальный абзац
`Co-Authored-By: Claude Code <noreply@anthropic.com>`.
