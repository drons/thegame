# 000168 — Бой: игрок управляет Эфиром и нанятыми NPC (ход спутника — ввод)

**СТАТУС: РЕАЛИЗОВАНО + РЕБЕЙЗИРОВАНО на master @ `ab6c08d`
(4 конфликта разрешены, обе стороны сохранены). Стадия мержа
(2026-10-09): ре-пин ПЯТИ тестов окна смерти 000164 под новый
тайминг D9/P1 (см. §16), полный npm test 1913/1913, коммит
«ре-пин тестов окна смерти 000164 под ввод спутников (D9/P1)»;
самого мержа ещё НЕТ — его делает оркестратор по новому протоколу
(один squashed-коммит + fast-forward, merge-commit НЕТ).**
Worktree `.worktrees/task-000168`, ветка `task/000168`, base = master @ `ec08e19`
(000167 ИНИЦИАТИВА смержена). Родитель 000154 (дизайн-контракт
`memory/000154-initiative.md`, D9–D12); предшественник СТРОГО 000167
(`memory/000167-initiative-core.md` §11 — точка развилки). Источники: ТЗ
`tasks/pending/000168.md`; анализы a1-domain/a2-arch/a3-tests
(`/tmp/thegame-wf-000168/`). Базис: `npm test` = 1851/1851 зелёных (~88 с).

## 1. Суть (одной строкой)

На ходу ЛЮБОГО союзника (наёмник ИЛИ Эфир) активным становится ИГРОК
(`c.phase='player'`, новых phase НЕТ — D9): управление теми же органами
(стрелки/WASD/D-pad — движение, J — удар/Касание, K — каст Эфира, H —
лечение support-наёмника, Space — конец хода); ИИ-путь (`allyAct`/`efirTurn`)
ОТКЛЮЧАЕТСЯ (включая pre-roll). «Вдох Эфира» остаётся АВТО-ТРИГГЕРОМ в НАЧАЛЕ
хода Эфира (сжигает весь ход → немедленное продвижение очереди).
Block/предметы/побег/книга — ТОЛЬКО игрок (контекстный disabled через
canDoAction, причина дословно «недоступно активному персонажу»). UI: строка
«Ход: <имя активного>» + HP/шаги/удары активного союзника; новых кнопок/тегов/
модулей НЕТ. combat-keys.js / index.html / main.js — БЕЗ ИЗМЕНЕНИЙ.
НОЛЬ новых `c._rng`.

## 2. Что добавлено / перенесено (карта изменений)

### src/combat.js (основной; ~2624 строки) — ОБЛАСТЬ: ход-фазы/ввод/пулы
| Локация (baseline ec08e19) | Изменение |
|---|---|
| `makeAlly` L336–374 | + поля `moveLeft: 1, attackLeft: 1` (ВСЕМ союзникам; у Эфира — fallback, в браузере затмевается c.efs). |
| `startRound` L2030–2088 | + блок round-rollover живых союзников ПОСЛЕ рефилла c.efs (L2062–2069): `for (const a of livingAllies(c)) { a.moveLeft = a.movePerTurn \|\| 1; a.attackLeft = 1; }` (НЕ рядом с poison-тиком — ханка 000164). |
| `efirTurn` L1890–2019 | Блок (0) «Вдох» (L1902–1914) ЗАМЕНЯЕТСЯ на `if (efirBreath(c, u)) return;` + комментарий «000168: ИИ заменён вводом игрока; функции allyAct/efirTurn сохранены для регрессии, из advanceQueue НЕ вызываются». Приоритеты (1)–(5) — мёртвый код без изменений. |
| НОВЫЕ internal (после `allyHeal` ~L1712): | `efirBreath(c,u)`, `allyMove(c,u,dx,dy)`, `allyStrike(c,u,targetId)`, `allyHealAction(c,u)`, `efirCastAction(c,u,targetId)`, `allyCanDo(c,u,action,a)` — сигнатуры/причины §4. |
| `canDoAction` L1340–1485 | + ТОП-ФОРК в начале: активен союзник → `allyCanDo`; игровые ветки БИТ-В-БИТ; + ветка `'move'` (игрок: зеркало `c.ps.moveLeft>0` → 'шаги на ход исчерпаны' — аддитивная, UI её не использует; союзник — в allyCanDo); + ветка `'cast'` (игрок: 'используйте книгу заклинаний' — defensive; Эфир — в allyCanDo). Сигнатура `canDoAction(c, action, args)` БЕЗ ИЗМЕНЕНИЙ. |
| `advanceQueue` L2105–2134 | Союзная ветка Л2118–2133 ЗАМЕНЯЕТСЯ (§3.1). Параметра `syncAllies` НЕТ — ветка ЕДИНАЯ для pre-roll и endTurn. |
| `createCombat` L2396–2578 | D6-гварды: `c.attack`/`c.move` → ДИСПАТЧ по активному (§3.3); НОВЫЕ обёртки `c.cast`, `c.heal` (после `c.selectTarget`, до `c.endTurn`). Прочие гварды (spell/block/flee/quickItem/invItem/selectTarget) и `c.endTurn` — БЕЗ ИЗМЕНЕНИЙ. Преролл `advanceQueue(c)` — вызов БЕЗ ИЗМЕНЕНИЙ (единая ветка). |
| `combatInternals` L2585–2599 | + `efirBreath, allyMove, allyStrike, allyHealAction, efirCastAction, allyCanDo` (паттерн 000112/000113; фабрика-экспорты Л2601–2623 НЕ меняются — НОВЫХ module-exports НЕТ). |

### src/combat-ui.js — ОБЛАСТЬ: stateEl/handleCode/runAction
| Локация | Изменение |
|---|---|
| НОВЫЕ хелперы (рядом с `unitOf` ~L1124): | `activeUnit(c)` (`G.activeUnitId` typeof-guard → `c.units.find(x=>x.id===id) \|\| null`; игрок → null), `activeIsEfir(c)` (активен союзник `kind==='efir'`). |
| `handleCode` L441–481 | + ветка `code==='KeyH'` ДО lookup таблицы (только при `c.phase==='player' && !c.result` и активен союзник: `canDoAction 'heal'` → ok: `logRejection(c, c.heal())`, отказ: `c.log.push(r.reason)`; игрок → `consumed=false` — бит-в-бит, KeyH в таблице нет). + remap: `let action = entry?.action; if (code==='KeyK' && action==='attack' && activeIsEfir(c)) action='cast';` — `st.canDo` и `runAction` получают `action`; `runAction(c, action)` (ревью 000168: без мёртвого `code`). Движение (`r.kind==='move'` → `c.move(dx,dy)`) — БЕЗ ИЗМЕНЕНИЙ (ядро c.move стало контекстным). |
| `runAction` L382–434 | Сигнатура `runAction(c, action)` (ревью 000168: мёртвый 3-й параметр `code` удалён — нигде не читался). + thunk'и `cast: () => c.cast(c.targetId)`, `heal: () => c.heal()`. thunk `attack` — БЕЗ ИЗМЕНЕНИЙ (`c.attack(c.targetId)` — Эфир-касание раскатывается диспатчем ядра). + FX-гейт: `c._fx = {action:'attack',…}` ТОЛЬКО если `action==='attack'` и активен игрок (R15). endThunK/move/spellbook/block/… — без изменений. |
| `render()` stateEl L1064–1070 | + ПЕРВАЯ строка: `Ход: ${имя активного союзника \|\| 'Вы'}\n` (имя по `activeUnit(c)`; игрок/моб-фаза — «Вы»/имя). + строка характеристик АКТИВНОГО СОЮЗНИКА сразу ПОСЛЕ строки «Шаги: …» игрока: наёмник `${u.name}: HP ${u.hp}/${u.maxHP}  |  Шаги: ${u.moveLeft}  |  Удар: ${u.attackLeft}\n`; Эфир `${u.name}: HP ${u.hp}/${u.maxHP}  |  Мана: ${u.mp}  |  Шаги: ${c.efs?c.efs.move:0}  |  Касание: ${c.efs?c.efs.touch:0}\n` (у Эфира без c.efs — fallback-цифры 0, строка всё равно рисуется). Базовые строки (groupName/HP/Шаги/Отряд/БЛОК/ЯД/Цель) — БИТ-В-БИТ. |
| Кнопки L1093–1099, `unitOf` L1124, книга, `startCombat`, `renderTurnOrder` | БЕЗ ИЗМЕНЕНИЙ: цикл кнопок сам становится контекстным (canDoAction-контекст + `c.phase==='player'` на ходу союзника); `unitOf` остаётся `c.player` (книга союзников — не v1); подсветка активного по `turnIndex` уже верна. |

### SPEC.md (D12 — 3 правки)
1. «Боевая система» (L714–716, правило инициативы 000167): + «Игрок управляет
   каждым членом партии на его ходу».
2. «Спутники → Бой» (L746–748): «Спутник — отдельный союзный юнит на
   мини-карте боя (ИИ: ход к ближайшему врагу + действия по своей роли;
   роль «поддержка» лечит самого раненого союзника, включая игрока).» →
   «на своём ходу спутником управляет игрок: движение, удар (дальность по
   роли), лечение самого раненого у поддержки; блок/предметы/побег — только
   игрок».
3. «Дух Эфира → Бой» (L874–886): буллеты «Приоритеты ИИ: …» + «Движение: …
   (эскорт)» → «на своём ходу Эфиром управляет игрок: движение — 3 клетки,
   «Касание духа» (J), сильнейшее известное урон-заклинание (K); лечения и
   щита у Эфира в бою нет»; буллет «Вдох Эфира» (L899–902) — БЕЗ ИЗМЕНЕНИЙ
   (авто-триггер на его ходу — уже описан).

### CHANGELOG.md
Секция `## 2026-10-07` → `### Игровой процесс` → пуллет (формат — по
существующим записям; программная часть не перечисляется): «На ходу Эфира и
нанятых спутников их управляет игрок: движение, удар, лечение самого
раненого (поддержка). У Эфира — «Касание духа» (J) и сильнейшее
урон-заклинание (K); «Вдох Эфира» срабатывает автоматически в начале его
хода. В панели боя появилась строка «Ход: …» с именем действующего».

## 3. Контракты

### 3.1 Где диспатч активного (ядро)

Точка развилки — СОЮЗНАЯ ВЕТКА `advanceQueue` (combat.js L2121–2127 после
серого слота), единая для ВСЕХ вызовов (pre-roll из createCombat И endTurn):

```js
const u = c.units.find((x) => x.id === id);
if (!u || !u.alive || u.fled) { c.turnIndex += 1; continue; } // серый слот — без изменений
// 000168: союзник — ход игрока (D9): «Вдох Эфира» — авто-триггер в НАЧАЛЕ
// хода Эфира (SPEC 000113/000168); сработал — ход СГОРАЕТ (очередь
// продвигается, остановки нет); иначе — ввод игрока, ОСТАНОВКА.
if (u.side === 'ally') {
  if (u.kind === 'efir' && efirBreath(c, u)) { c.turnIndex += 1; continue; }
  c.targetId = (nearestEnemy(c, u) || {}).id || null;
  c.phase = 'player';
  return;
}
c.phase = 'mob';
mobAct(c, u);
if (c.result) return;
c.turnIndex += 1;
```

Последствия (зафиксировано):
* `c.phase === 'player'` на ходу союзника → `checkTurn` проходит без
  изменений; кнопки НЕ дизейблятся по phase — только по canDoAction
  (tooltip-причины — по дизайну D9).
* Свежая цель на входе союзного слота — `nearestEnemy(c, u)` (аналог
  player-слота; цель = ближайший живой МОБ от союзника, тай-брейк c.units).
* **PRE-ROLL (createCombat) — та же ветка**: быстрый союзник останавливает
  старт боя для ввода (бой может начать с хода союзника, активен союзник).
  AI-поведения союзников в pre-roll БОЛЬШЕ НЕТ (а2-вариант
  `syncAllies=true` ОТКЛОНЁН: красный тест 000168-BREATH-1 non-trigger пинит
  «после createCombat — активен Эфир, phase 'player', AI-строк в логе НЕТ»;
  ТЗ: действия Эфира — только ввод + Вдох). 000167-WEAK-1 (Вдох против
  быстрого моба) — внешняя семантика сохраняется: триггер в pre-roll
  сжигает ход (проверить при ребазе).
* Инвариант 000036 сохранён: в момент остановки `c.turnOrder[c.turnIndex]`
  = id активного; `renderTurnOrder` подсвечивает союзника по turnIndex
  (без изменений).
* `endTurn` — без изменений (000167: без гварды): «конец хода» любого
  активного player-side юнита → `turnIndex++` + advanceQueue.
* `c.result` в любой точке — стоп (без изменений).

### 3.2 «Вдох Эфира» — авто-триггер

* Тело блока (0) `efirTurn` (L1902–1914) вынесено **VERBATIM** в
  `efirBreath(c, u)` (возврат `true`/`false`): условия `u.breath && !c.efirBreathed
  && player.hp/pMax <= B.playerFrac && u.mp >= B.mpCost`; порядок операций
  зафиксирован: `c.efirBreathed = true` → `u.mp -= B.mpCost` → `healAlly`
  игрока → `healAlly` живых союзников (порядок c.units, включая Эфира) →
  `weakenAllEnemies` → `log(B.logLine)` → `return true`. 0 c._rng.
* Проверяется ТОЛЬКО в союзной ветке `advanceQueue` (у `kind==='efir'`) —
  в НАЧАЛЕ его хода, ДО ввода; сработал → `c.turnIndex += 1; continue`
  (ход сгорел: движения/кастов/Касания НЕТ).
* `efirTurn` теперь вызывает `if (efirBreath(c, u)) return;` (одна точка
  истины; efirTurn — мёртвый код, но остаётся корректным для регрессии).
* FX 000118 (`drawBreathFx`, edge-detect `c.efirBreathed`) — БЕЗ ИЗМЕНЕНИЙ.
* Без снапшота `u.breath` (node-фикстуры без buildEfirUnit) — триггер
  недостижим (B undefined, null-safe — бит-в-бит 000113).

### 3.3 Публичный API (объект боя) — диспатч по активному

```
c.attack(targetId)  // player → playerAttack (бит-в-бит) | Эфир (hasEfs) →
                    // Касание (d≤1, c.efs.touch, u.damage, always-hit/armor-ignore,
                    // log «Касание духа: N.») | наёмник/Эфир-fallback →
                    // nearestEnemy, д≤1 (d≤4 ranged), allyAttack-бросок, u.attackLeft
c.move(dx, dy)      // player → playerMove (бит-в-бит) | Эфир → allyMove (c.efs.move)
                    // | наёмник/Эфир-fallback → allyMove (u.moveLeft)
c.cast(targetId)    // player → {ok:false, reason:'используйте книгу заклинаний'}
                    // (defensive — UI не вызывает) | союзник не-Эфир →
                    // {ok:false, reason:'недоступно активному персонажу'}
                    // | Эфир → efirCastAction (nearestEnemy d≤4, strongestKnown('урон'),
                    //   c.efs[efirPool(s)]−1, u.mp−=мани, lord-множитель,
                    //   dealDamageToMob(…,true), log 000118, efirPractice)
c.heal()            // player → {ok:false, reason:'используйте книгу заклинаний'}
                    // (defensive) | Эфир/не-support →
                    // {ok:false, reason:'недоступно активному персонажу'}
                    // | support-наёмник → allyHealAction (u.attackLeft−1, allyHeal)
c.spell/c.block/c.flee/c.quickItem/c.invItem/c.selectTarget — БЕЗ ИЗМЕНЕНИЙ
                    // (D6-гварды 000167 `activeUnitId(c)!=='player' → null`;
                    //  UI их на ходу союзника не вызывает — canDoAction disabled)
c.endTurn           — БЕЗ ИЗМЕНЕНИЙ
```

* Диспатч: `const aid = activeUnitId(c); aid==='player' → playerX; иначе
  u = c.units.find(x => x.id===aid && x.side==='ally' && x.alive && !x.fled);
  u ? allyX : null` (defensive null — нет союзника, например phase 'mob').
* `hasEfs = u.kind==='efir' && c.efs` — единый дискриминатор Эфир-пулы
  (c.efs) vs fallback (u.moveLeft/u.attackLeft, как melee-наёмник). В браузере
  c.efs ВСЕГДА до первого ввода (startCombat: createCombat → buildEfirUnit →
  render); fallback — только node-фикстуры.
* `targetId` у союзных действий ИГНОРИРУЕТСЯ (v1): цель = `nearestEnemy(c, u)`
  (детерминировано, как в ИИ). `c.selectTarget` — только игрок;
  перенацеливание союзника — НЕ v1 (ОQ1).
* НОВЫХ module-exports НЕТ (`activeUnitId` уже экспортирован 000167).

### 3.4 Новые internal-функции (сигнатуры, пулы, причины)

```
efirBreath(c, u)            → boolean — верbatim-блок (0) efirTurn (§3.2).
allyMove(c, u, dx, dy)      → {ok, reason?} — зеркало playerMove:
                              checkTurn → пул (hasEfs? c.efs.move : u.moveLeft) ≤0 →
                              'шаги на ход исчерпаны' → !inBounds → 'стена' →
                              c.obstacles → 'препятствие' → unitAt →
                              'тут стоит союзник'/'тут стоит моб' →
                              (nx===c.px && ny===c.py) → 'тут стоит игрок' (НОВАЯ
                              проверка: игрок НЕ в c.units, unitAt его не видит) →
                              успех: u.x/u.y = nx/ny; пул−−; {ok:true}. 0 c._rng.
allyStrike(c, u, targetId)  → {ok, reason?, hit?, dmg?, killed?} — цель =
                              nearestEnemy(c, u) (targetId игнорируется v1):
                              нет живой моб-цели → 'нет цели'.
                              Эфир (hasEfs): c.efs.touch ≤0 →
                              'действий «Касание духа» больше нет'; d>1 →
                              'цель слишком далеко (ближний бой)';
                              c.efs.touch−−; dealDamageToMob(c,t,u.damage,true);
                              log «Касание духа: N.» (паттерн 000118, без имени).
                              Наёмник/Эфир-fallback: u.attackLeft ≤0 →
                              'действий «Удар» больше нет'; maxDist =
                              role==='ranged' ? 4 : 1; d>maxDist →
                              'цель слишком далеко (' + (maxDist===1?'ближний
                              бой':'даль 4') + ')'; u.attackLeft−−;
                              allyAttack(c,u,t) (существующий бросок — ТОТ ЖЕ
                              вызов c._rng, что в ИИ; строки лога allyAttack).
allyHealAction(c, u)        → {ok, reason?} — role!=='support' || kind!=='merc'
                              → 'недоступно активному персонажу'; u.attackLeft ≤0
                              → 'действий «Удар» больше нет'; allyHealTarget(c)
                              null → 'нет раненых'; allyHeal(c,u) false →
                              'нет лечения'; иначе u.attackLeft−−; {ok:true}.
                              (лечение ЗАНИМАЕТ слот действия — паттерн ИИ; ТЗ
                              молчит — решение Проектирования).
efirCastAction(c, u, targetId) → {ok, reason?, dmg?, killed?} — тело
                              приоритета (3) efirTurn VERBATIM:
                              s=strongestKnown(u,'урон') null → 'заклинаний нет';
                              pool=efirPool(s); c.efs[pool] ≤0 → 'действий
                              «Заклинание» (' + (pool==='spellInt'?'Интеллект':
                              'Мудрость') + ') больше нет'; u.mp < мани →
                              'не хватает маны (N)'; t=nearestEnemy null →
                              'нет цели'; d>SPELL_MAX_DIST → 'цель слишком далеко
                              (дальность 4)'; списание пула/маны; lord =
                              u.efirSkills[школа==='лёд'?'icelord':'firelord']||0;
                              dmg=round((3+0.5·int)·(1+0.05·lord));
                              dealDamageToMob(c,t,dmg,true); log «Эфир:
                              «<заклинание>» — <имя>: N.»; efirPractice. 0 c._rng.
allyCanDo(c, u, action, a)  → {ok, reason?} — контекстная таблица §3.5.
allyHealTarget(c)           → {player:true}|{unit:a}|null — pure-зеркало
                              «самый раненый» allyHeal (frac < 1, пул
                              [игрок, живые союзники], тай — порядок пула) =
                              mostWounded(c, 1) (переиспользование существующей
                              чистой функции — отдельного хелпера НЕ создаём).
```

### 3.5 canDoAction — контекстная таблица (action × активный)

Сигнатура `canDoAction(c, action, args)` БЕЗ ИЗМЕНЕНИЙ. Топ-форк в начале
функции: `const aid = activeUnitId(c); const au = aid && aid!=='player' ?
c.units.find(x => x.id===aid && x.side==='ally' && x.alive && !x.fled) : null;
if (au) return allyCanDo(c, au, action, a);` — игровые ветки (ниже) БИТ-В-БИТ.

| action | Игрок (без изменений) | Наёмник | Эфир |
|---|---|---|---|
| endTurn | ok | ok | ok |
| move (НОВОЕ) | ps.moveLeft>0 → 'шаги на ход исчерпаны' (зеркало; UI не использует — движение через c.move+logRejection) | u.moveLeft>0 → то же | c.efs.move>0 (fallback u.moveLeft) → 'шаги на ход исчерпаны' |
| attack | (существующее: пул/цель/дальность лука) | 'нет цели' → 'действий «Удар» больше нет' → дальность d≤1 (ranged d≤4) 'цель слишком далеко (ближний бой|даль 4)' | 'нет цели' → 'действий «Касание духа» больше нет' → d≤1 'цель слишком далеко (ближний бой)' |
| cast (НОВОЕ) | 'используйте книгу заклинаний' (defensive) | 'недоступно активному персонажу' | 'заклинаний нет' → 'действий «Заклинание» (Интеллект|Мудрость) больше нет' → 'не хватает маны (N)' → 'нет цели' → d≤4 'цель слишком далеко (дальность 4)' |
| heal | (существующее legacy: c.ps.spellWis/мана/HP) | support: 'действий «Удар» больше нет' (u.attackLeft≤0) → 'нет раненых' (mostWounded(c,1) null) → 'нет лечения' (нет каталога/спелла) — порядок 1:1 с allyHealAction (ревью 000168); не-support → 'недоступно активному персонажу' | 'недоступно активному персонажу' (у Эфира heal-действия v1 НЕТ — ОQ4) |
| fire / block / quickItem / invItem / flee / spellbook | (существующее) | 'недоступно активному персонажу' | 'недоступно активному персонажу' |
| прочее | 'неизвестное действие: …' | 'неизвестное действие: …' | 'неизвестное действие: …' |

* Зеркало ядра (паттерн 000037): одна причина — одно поведение; причины
  allyCanDo 1:1 с core-функциями (§3.4). Порядок проверок в ветке — тот же,
  что в core.
* 'heal'-зеркало — 1:1 с allyHealAction (ревью 000168: до правки ветка
  пропускала `u.attackLeft` и шла каталог → раненые, т.е. порядок
  отличался от ядра): `u.attackLeft ≤ 0` → `mostWounded(c, 1)` →
  каталог `combatInternals.allySpells` + «лечение» в `u.spells` (те же
  условия, что в allyHeal). canDoAction остаётся без побочных эффектов
  (чтение каталога — чистое). Пин — тест 000168-CANDO-3 (причина canDo =
  причина ядра в каждом отказе).
* Приоритет имён (ОQ/D4): Касание Эфира = контекстный `'attack'` (KeyJ идёт
  через него); каст Эфира = `'cast'`; отдельное имя `'touch'` НЕ создаётся
  (минимальный дифф; J уже маппится на 'attack').

### 3.6 Пулы

* Наёмник: `u.moveLeft` (движение, 1 клетка за c.move) и `u.attackLeft`
  (слот действия: удар ИЛИ лечение, 1 за ход). Инициализация — `makeAlly`
  (все союзники: `moveLeft: 1, attackLeft: 1`); round-rollover — `startRound`
  (все живые: `a.moveLeft = a.movePerTurn || 1; a.attackLeft = 1`).
* Эфир (в браузере): пулы — `c.efs` (move=3, touch=1, spellInt/spellWis —
  зеркальная формула buildEfirUnit; рефилл — startRound L2062–2069 — НЕ
  ТРОГАТЬ); мана — `u.mp` (без регена). `u.moveLeft/u.attackLeft` у Эфира —
  только fallback (node-фикстуры без c.efs): поведение = melee-наёмник
  (бросок allyAttack, d≤1).
* Игрок: `c.ps` (refillPools L2148) — БЕЗ ИЗМЕНЕНИЙ.

## 4. UI-контракт (combat-ui.js)

* stateEl: строка 1 `Ход: ${activeUnit ? activeUnit.name : 'Вы'}`; строка
  активного союзника — сразу после строки «Шаги: …» игрока (формат §2).
  Базовые строки — бит-в-бит (пин CU118-HUD — includes-based, выдержит).
* `handleCode`: KeyH-ветка (до lookup; гейт «активен союзник» — игрок:
  KeyH → kind 'none' бит-в-бит); KeyK-remap (активен Эфир → 'cast');
  `runAction(c, action)` (ревью 000168: без мёртвого `code`) — thunk'и
  cast/heal; FX-гейт (hero-анимация только при активном игроке).
* Кнопки: цикл disabled БЕЗ ИЗМЕНЕНИЙ — контекстный canDoAction сам делает
  fire/block/quickItem/invItem/flee/spellbook disabled c title «недоступно
  активному персонажу» (phase на ходу союзника = 'player' — D9). КНОПОК
  НОВЫХ НЕТ (D10). `unitOf` = `c.player` (книга — не v1 для союзников).

## 5. Решения (проектирование; ОQ закрыты)

| # | Решение | Почему |
|---|---------|--------|
| P1 | Единая союзная ветка advanceQueue, pre-roll БЕЗ AI-режима (без syncAllies). | Красный 000168-BREATH-1 non-trigger пинит «стоп на союзнике + AI-строк нет» сразу после createCombat; ТЗ: действия Эфира = только ввод + Вдох (а2-вариант «pre-roll ИИ бит-в-бит» противоречит и тесту, и ТЗ). |
| P2 | Вдох — верbatim-вынос в `efirBreath`, вызов в союзной ветке advanceQueue; efirTurn/allyAct — мёртвый код без удаления. | ТЗ: «проверка в НАЧАЛЕ его хода», «ход СГОРАЕТ = немедленное продвижение»; одна точка истины триггера; ноль удалений — минимальный риск ребейса. |
| P3 | J/K различаются ТОЛЬКО в UI (handleCode-remap KeyK→'cast' для Эфира) + ядре (c.attack Эфира = Касание; c.cast = каст); COMBAT_KEYS (KeyJ/KeyK→'attack', KeyH отсутствует) — бит-в-бит. | ТЗ D10: «combat-keys.js — БЕЗ ИЗМЕНЕНИЙ» + «K — сильнейшее урон-заклинание» — несовместимы иначе. |
| P4 | KeyH — отдельная ветка handleCode (до lookup таблицы), активен союзник → canDoAction 'heal' → c.heal(); клавиши/кнопки нет. | KeyH нет в застывшей таблице; ТЗ-тесты проверяют canDoAction('heal'), не press('KeyH'); v1-ограничение задокументировано. |
| P5 | Цель союзного удара/каста = nearestEnemy(c,u); targetId игнорируется; selectTarget — player-only. | Единственный детерминированный вариант без новых органов управления (ОQ1: v2 — selectTarget для союзников); как в ИИ. |
| P6 | canDoAction: топ-форк на союзника (allyCanDo) + новые действия 'move' (аддитивно, UI не использует) и 'cast'; игровые ветки бит-в-бит. | ТЗ-тест «на ходу наёмника attack/move — ok» требует ветки 'move' (её нет в кодебейсе); ТЗ-тест «Эфир — touch / strongest-cast» — контекстный 'attack' + 'cast'. |
| P7 | Имена: Касание = 'attack' (контекстно), каст = 'cast'; 'touch' НЕ создаётся. | J уже идёт через 'attack'; camelCase-конвенция ('quickItem'); минимальный дифф (ОQ/D4). |
| P8 | Лечение support ЗАНИМАЕТ слот действия (u.attackLeft−1 в allyHealAction). | Паттерн ИИ (heal вместо attack); ТЗ молчит — решение зафиксировано. |
| P9 | heal-зеркало в canDoAction проверяет каталог+спелл+раненых (полное зеркало allyHeal), НЕ только раненых. | Зеркало ядра 000037: canDoAction.ok ⇒ core не отклонится с «нет лечения» (ОQ5). |
| P10 | Эфир: урон-каст (K) и Касание (J) — player-действия v1; лечения (priority 1) и щита (priority 2) у Эфира в бою НЕТ вообще (ИИ отключён полностью, включая pre-roll). | ТЗ: действия Эфира — движение/J/K/Space + авто-Вдох; «щит Эфира — не v1»; c.efirShield в v1 НЕ ставится (тик в startRound остаётся — мёртвый, безвредный). |
| P11 | FX 'attack' (hero-анимация) — только при активном игроке. | Визуальная корректность: герой не анимируется на ударе наёмника (R15). |
| P12 | stateEl: «Ход: …» — ПЕРВАЯ строка; строка активного союзника — после «Шаги: …»; базовые строки бит-в-бит. | D10; существующие пины — includes-based ('Отряд:'), точных пинов stateEl НЕТ (проверено grep). |
| P13 | Пулы makeAlly ВСЕМ союзникам + round-rollover ВСЕМ живым в startRound (в т.ч. Эфиру — fallback). | Единая инвариантная форма; fallback Эфира без c.efs (node-фикстуры) работает (Р6). |
| P14 | combatInternals: + 6 новых internal (efirBreath/allyMove/allyStrike/allyHealAction/efirCastAction/allyCanDo); module-exports НЕ меняются. | Паттерн 000112/000113; прямой путь для future-тестов причин; публичные c.* уже покрывают красные тесты. |
| P15 | Дельты ТЗ-vs-код зафиксированы: KeyH нет (→ P4), KeyK='attack' (→ P3), 'move'-ветки нет (→ P6), c.endTurn уже без гварды (0 правок), гварды player-only действий не трогаются (отказ — в canDoAction/UI). | Сверка с кодом ec08e19; ТЗ-строки «БЕЗ ИЗМЕНЕНИЙ» соблюдены. |
| P16 | D-pad на тач-устройствах K не выражает (таблица заморожена: D-pad шлёт только коды движения + KeyE) — каст Эфира на таче v1 невозможен; ограничение задокументировано. | ОQ2; ТЗ молчит; «кнопок новых НЕТ». |

## 6. Что НЕ v1 (задокументировано)

* Заклинания союзников через книгу (000149: книга — «для активного
  персонажа», `unitOf` = c.player; кнопка книги на ходу союзника disabled).
* Щит Эфира (priority 2) и лечение Эфира (priority 1) — ИИ отключён.
* Перенацеливание союзника (selectTarget — player-only; цель — auto
  nearestEnemy).
* K на D-pad (таблица заморожена).
* Кнопки «Лечение»/«Каст» — НЕТ (контекстный disabled существующих + клавиши).

## 7. Что НЕ тронуто (жёсткие границы)

`checkTurn` (тело), `mobAct`/`stepToward`/`allyStepToward`/`allyStepAway`
(000155), рендер-путь canvas (000151), `main.js`, `index.html`,
`combat-keys.js`, `tests/index-order.test.js`, `src/efir.js` (efirStats
заморожена; buildEfirUnit-контракт; u.breath/u.mp/u.damage/c.efs — как есть),
`src/companions.js`, `unitOf` (книга), `drawBreathFx`, `startCombat`,
`renderTurnOrder`, цикл кнопок, тела `playerX` (playerMove/playerAttack/…),
`refillPools` (игроковские строки), D6-гварды `c.spell/block/flee/
quickItem/invItem/selectTarget`, `c.endTurn`, рефилл `c.efs` в startRound.
Новых SVG/CSS/модулей/тегов НЕТ.

## 8. Ленивые ссылки и guards (UMD-паттерны)

* `hasEfs = u.kind==='efir' && c.efs` — во ВСЕХ союзных путях (allyMove/
  allyStrike/allyCanDo 'move'|'attack'): без c.efs — fallback u.*-пулы,
  ноль крахов (node-фикстуры; в браузере c.efs гарантирован до ввода).
* `combatInternals.allySpells` — ленивый каталог (spells.js ставит при
  загрузке): strongestKnown/allyHeal/efirCastAction/allyHealAction/
  allyCanDo('heal'|'cast') — без каталога ТИХО null/false (паттерн 000080/
  000112; console.error НЕТ).
* `efirPractice` — ленивое `Game.efir.practiceEfir` (typeof-guard, тихий
  no-op — без изменений, переиспользуется в efirCastAction).
* combat-ui: `G.activeUnitId` — typeof-guard в `activeUnit(c)` (фолбэк до
  000167 — «Вы»); `G.CombatKeys`/`G.canDoAction` — уже лениво (без
  load-time cross-require). Новых модулей НЕТ (D11) → load-order не меняется.
* Guards публичных обёрток: нет живого союзника на активном слоте (например
  phase 'mob') → `null` (defensive; UI не вызывает).

## 9. Детерминизм (чек-лист)

* НОВЫХ вызовов `c._rng` = 0. Единственный бросок на ходу союзника —
  существующий `allyAttack` (hitChance) для наёмника J; Касание/каст/
  лечение/Вдох — 0 RNG (как в ИИ).
* Порядок потока RNG ИЗМЕНЯЕТСЯ ПО ДИЗАЙНУ: броски союзников — в момент
  ввода, а не в момент ИИ (это и есть новая механика ТЗ).
* Инвариант: фикс. сид + фикс. вводы → фикс. исход/логи. self-determinism-
  снапшоты — зелёные.
* `canDoAction` — без побочных эффектов (чтение каталога чистое).
* BAL-119 (000119) — ПЕРЕЧИСЛЕНО 2026-10-07 (ревью 000168; детерминированный
  свип, 7 групп × сиды 1–5, бот autoPlay119 БЕЗ ПРАВОК): Зависания НЕТ —
  все бои завершаются (утверждение проекта «без водения Эфира бой зависнет,
  b.r === null» НЕВЕРНО — допроверено прогонком). На ходу Эфира c.attack/
  c.move раскатываются диспатчем по активному (решения бота — по дистанции
  ИГРОКА до цели, uDist), поэтому Эфир в свипе ДВИЖЕТСЯ (199 шагов за 35
  боёв), но «Касания духа» НЕ выполняет (0: бот целится по дистанции игрока)
  и не кастует (c.cast бот не вызывает) — ИИ-путь (лечение/щит/каст) отключён.
  Пересчитанные метрики (a) medium: avg rounds 9.686 (min 4, orc_raid/
  spider_nest), avg hpFrac 0.9138, min hpFrac 0.5968 (abyss_spirit);
  (b) hard + пассив: 35/35 'dead', avg 22.0 раунда (min 13, max 41).
  Интервальные пины EFIR_BAL119 удерживаются с запасом; комментарии баннера
  000119, EFIR_BAL119 и BAL-3 обновлены (2026-10-07).

## 10. Важно будущим задачам (из ссылок ТЗ и параллельных workflow)

* **000154 (родитель)**: строка 1 ТЗ 000154 выполнена ЭТОЙ задачей; D9–D11
  реализованы, D12 (SPEC) — этой же. Следующих дочерних у 000154 нет.
* **000149 (книга)**: будущая «книга для активного персонажа» подключается в
  ОДНОЙ точке — `unitOf(c)` (сейчас c.player) + кнопка 'spellbook' в
  canDoAction (сейчас player-only reason). Контекст allyCanDo('spellbook')
  — готовое место расширения.
* **000164 (окно смерти)**: ОБЩИЙ файл combat.js; её ханки — dealDamageToPlayer/
  poison-death в startRound; мои ханки startRound — рядом с c.efs-рефиллом
  (L2062–2069), НЕ рядом с poison-тиком. РЕБЕЙЗ ОБЯЗАТЕЛЕН (ТЗ + риск) —
  ВЫПОЛНЕН 2026-10-09; тесты окна смерти 000164 РЕ-ПИНЕНЫ под D9/P1
  (см. §16) — их master-версии валидны под 000168.
* **000166 (UI каста воскрешения)**: ОБЩИЙ файл combat-ui.js; её регион —
  строки книги/выбор цели (castRow/bookRow); мой — stateEl/handleCode/
  runAction. Диффы в разных регионах; РЕБЕЙЗ ОБЯЗАТЕЛЕН.
* **000165 (свиток/ядро воскрешения)**: ОБЩИЙ файл combat.js — её ханка
  ВНУТРИ ветки canDoAction 'quickItem' (L1418–1451) + playerQuickItem; моя
  вставка союзной проверки — В НАЧАЛЕ canDoAction (топ-форк), не внутри
  веток → композируемо, но ТЕКСТОВЫЙ КОНФЛИКТ при мерже вероятен →
  РЕБЕЙЗ ОБЯЗАТЕЛЕН.
* **000167 §9 D-1** (round-1 000080-fallback Эфира) — ПЕРЕЗАПИСАНА: в
  браузере к первому вводу c.efs есть; pre-roll на слоте Эфира — стоп для
  ввода (не AI); внешняя семантика WEAK-1 сохраняется через breath.

## 11. Подводные камни

1. **Массовый re-pin тестов на ИИ-поведении союзников** (ТЗ разрешает:
   «технические под новый путь»): combat.test.js L2300 (инвариант фазы →
   phase 'player' на ходу союзника), L2346/2400/2448/2491/2529/2549/2633/
   2668 (AI-ходы → ввод), L2991/3085 (000081 Эфир — через ввод),
   CB-1..CB-7 L3428–3889 (приоритеты ИИ → ввод; heal/shield Эфира
   НЕНАБЛЮДАЕМЫ — переделать/сократить), PC-1 L3889, BR-2..BR-8 L4051–4460
   (механика Вдоха сохраняется, сценарная обвязка — стоп+ввод), BAL-1..3
   L4693–4843 (бот водит Эфира + перечислить метрики); combat-ui.test.js
   L1210 (pre-roll «Эфир шагнул на 2» → Эфир на спавне, ждёт ввода),
   CU118-FX L1924 (Вдох — на 2-м ходу Эфира), CU118-LOG L2028 (AI-строки
   heal/shield недостижимы); efir.test.js L758/912/992 + сценарии
   L1150–1688; companions.test.js L890 (проверить — вероятно зелёный).
2. **Байтовые пины, которые обязаны пройти БЕЗ ПРАВОК**: CU118-HUD
   ('Отряд:' includes), 7 кнопок/acts, canDoAction player-контекст
   L1213–1440, детерминизм/рендер-золото игрока L672/L1612, makeAlly
   формат-пин (assert по полям — новые moveLeft/attackLeft не ломают),
   combat-layout (.cp-*), combat-keys, index-order, e2e-победы,
   000167 «игрок+мобы» L1499–1712, efir-sheet ES-4, 0 новых c._rng.
3. **Вдох в pre-roll**: быстрый Эфир + игрок ≤40% HP на старте → breath
   сгорает в pre-roll (внешняя семантика 000167-WEAK-1 совпадает —
   проверить при ребазе).
4. **Эфир без c.efs (node)**: все союзные пути null-safe (hasEfs-fallback);
   breath — B undefined → не триггерится (бит-в-бит).
5. **c.targetId на входе союзника** = nearestEnemy(c,u) — для UI-строки
   «Цель: …»; ядро союзных ударов цель считает САМО (nearestEnemy) —
   расхождения после движения союзника в v1 допускаются (цель — auto).
6. **Мёртвый код efirTurn/allyAct** остаётся в файле — НЕ удалять, НЕ
   чинить «по пути» (регрессия/ревью); комментарии 000168 обязательны.
7. **quickItem-конфликт 000165** — главный хотспот мержа (§10).
8. **BAL-119** — НЕ зависает (ревью 000168, допроверено прогонком):
   бот autoPlay119 без правок доводит все бои до c.result (35/35 medium
   victory, 35/35 hard dead). Эфир в симуляции слабее ИИ (движется
   диспатчем по активному, «Касаний»/кастов 0) — метрики перечислены в
   §9 и в комментариях баннера 000119/BAL-3; re-pin бота НЕ нужен.

## 12. Красные тесты (первый коммит; 7 штук, id 000168-*)

* 000168-ALLY-1 (node): наёмник выше игрока по инициативе — pre-roll
  ОСТАНОВИЛСЯ на его слоте (activeUnitId==='a0', phase 'player');
  c.move → u.x/u.y сместились, u.moveLeft 1→0, c.ps.moveLeft не тронут;
  повтор → {reason:'шаги на ход исчерпаны'}; round-rollover — u.moveLeft=1
  (Эфир — c.efs.move=3). Краснота: u.moveLeft не существует; c.move →
  null (D6-guard).
* 000168-ALLY-2 (node): c.attack на ходу наёмника (d≤1 melee / d≤4 ranged)
  → бросок allyAttack, u.attackLeft 1→0, c.ps не тронут; повтор → reason;
  вне дальности → reason; support — c.heal() → allyHeal (самый раненый,
  0 c._rng — без расхода сида). Краснота: u.attackLeft не существует.
* 000168-CANDO-1 (node): на ходу наёмника canDoAction 'attack'/'move' → ok;
  'fire'/'block'/'quickItem'/'invItem'/'flee' → reason ДОСЛОВНО
  «недоступно активному персонажу»; 'endTurn' → ok. Краснота: строка reason
  отсутствует в кодебейсе (grep exit=1).
* 000168-CANDO-2 (node): на ходу Эфира canDoAction 'attack' (Касание:
  c.efs.touch>0, враг d≤1 → ok; д>1/touch=0 → reason) и 'cast'
  (spell+pool+mana+враг d≤4 → ok; без цели/д>4 → reason); block/quickItem/
  invItem/flee → «недоступно активному персонажу».
* 000168-BREATH-1 (node): Эфир первый в очереди, u.breath+mp инжект.
  Триггер (player ≤40% HP, mp≥20): после createCombat — очередь продвинулась
  ЧЕРЕЗ 'efir' (activeUnitId!=='efir'), c.efirBreathed===true, u.mp−=20,
  heal (игрок +B.heal / союзники +B.heal), weaken мобов, лог B.logLine,
  позиция Эфира не изменилась, ИИ-кастов/Касания/движения НЕТ. Non-trigger
  (player >40%): activeUnitId==='efir' && phase 'player', позиции не
  сдвинулись, AI-строк в логе НЕТ.
* 000168-UI-1 (vm): scene84 + addMerc84 (инициатива наёмника > игрока):
  .combat-state textContent содержит «Ход: <имя>» + строку
  «HP … | Шаги: 1 | Удар: 1»; на ходу игрока — «Ход: Вы»; базовые строки
  (HP/MP, «Шаги: … | Удар: … | Огонь: … | Леч: …», «Отряд: …») — presentes
  (includes, паттерн CU118-HUD).
* 000168-UI-2 (vm): на ходу наёмника кнопка attack ВКЛЮЧЕНА; block/
  quickItem/invItem/flee/spellbook ЗАПРЕЩЕНЫ, title = «недоступно активному
  персонажу»; Конец хода enabled. На ходу Эфира: J/K работают (Касание/
  strongest-cast), player-only кнопки запрещены.

Проверка RED: `npm test` — падают ТОЛЬКО 7 новых (осмысленная краснота:
отсутствующие поля/диспатч/reason/строка UI, НЕ синтаксис), остальные
1851 — зелёные. После GREEN: 1851+7 = 1858. Ревью 000168: +1 тест
(000168-CANDO-3 — heal-зеркало 1:1) → итого 1859/1859.

## 13. Порядок работ (рекомендация станциям)

1. Красные тесты (7 test-блоков: 5 node + 2 vm) + memory-файл (этот) —
   коммит «Задача 000168: красные тесты» (memory коммитится вместе
   с тестами).
2. combat.js: efirBreath (+ efirTurn-замена) → advanceQueue-ветка →
   allyMove/allyStrike/allyHealAction/efirCastAction/allyCanDo →
   makeAlly-пулы + startRound-rollover → canDoAction топ-форк + 'move'/
   'cast' → обёртки c.attack/c.move/c.cast/c.heal → combatInternals.
3. combat-ui.js: activeUnit/activeIsEfir → handleCode (KeyH + KeyK-remap) →
   runAction (thunk'и + FX-гейт) → stateEl (2 строки).
4. Re-pin (§11.1) по мере покраснения; BAL-119: бот без правок (зависания
   НЕТ — допроверено), метрики ПЕРЕЧИСЛЕНЫ (ревью 2026-10-07, см. §9).
5. SPEC.md (D12) — в коммите реализации.
6. Все тесты зелёные → ревью-анализ → РЕБЕЙЗ на актуальный master
   (хотспот §10.3) → повторный полный прогон.
7. CHANGELOG (отдельный коммит) → memory/отчёт/done — финализация.

## 14. Коммит-план (ветка task/000168)

1. `Задача 000168: красные тесты` (b93e358) — 7 тестов (7 test-блоков)
   + этот memory-файл.
2. `Задача 000168: ход спутника — ввод игрока (наёмники и Эфир)`
   (28f5682) — combat.js + combat-ui.js + re-pin + SPEC.md (D12).
3. `Задача 000168: правки по итогам ревью` — heal-зеркало 1:1 (allyCanDo:
   + `u.attackLeft`, порядок — как в ядре) + тест 000168-CANDO-3;
   runAction без мёртвого параметра `code`; пересчёт метрик BAL-119 в
   комментариях (баннер 000119/EFIR_BAL119/BAL-3); этот memory-файл
   (статус/§2/§3.5/§4/§9/§11.8/§12/§13/§14).
4. `Задача 000168: CHANGELOG — управление спутниками в бою` — дата =
   2026-10-07, секция «Игровой процесс» (отдельный коммит, паттерн
   000149/000164).
5. Финализация (стадия мержа): отчёт tasks/result/000168.md + перенос в done.

Формат: 1-я строка «Задача 000168: …» (рус.), последняя — отдельный
параграф `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

## 15. План по файлам (дельта)

| Файл | Операция | ~Дельта |
|---|---|---|
| src/combat.js | правки (12 локаций §2) | +~230 / −~15 |
| src/combat-ui.js | правки (4 локации §2) | +~70 / −~5 |
| tests/combat.test.js | 7 красных (4 node) + re-pin (~12 блоков) | +~260 / ~±120 |
| tests/combat-ui.test.js | 2 красных (vm) + re-pin (~4 блока) | +~150 / ~±60 |
| tests/efir.test.js | re-pin (~5 блоков) | ~±80 |
| SPEC.md | 3 правки (D12) | +~6 / −~8 |
| CHANGELOG.md | 1 пуллет | +~7 |
| memory/000168-companion-control.md | новый (этот файл) | +~330 |
| Итого | | ~890 строк по ~8 файлам |

## 16. Ре-пин тестов окна смерти 000164 (стадия мержа, 2026-10-09)

D9/P1 (единая союзная ветка `advanceQueue`: союзник — ОСТАНОВКА на ввод,
ИИ `allyAct`/`efirTurn` из очереди НЕ вызываются; pre-roll — та же ветка)
сдвинул тайминг: pre-roll больше не играет ИИ-tail (мобы/Эфир до игрока),
один endTurn = один player-side слот. ПЯТЬ тестов 000164 (писанных
под «один endTurn авто-играет всё») ре-пинены в `tests/combat.test.js`
(только тесты — `src/` НЕ тронут; поведение окна: каскад/auto-
возрождение/спасение/partyLost/RNG-детерминизм — НИЧЕГО не ослаблено):

* **RESCUE-1**: 1 `c.endTurn()` (ход Эфира — no-op) → окно в **round 1**
  (m0 убивает → rescue → m1 действует → очередь у игрока). Ре-пины:
  `c.round` 2→**1**; `turnOrder` 5→**6 записей**
  `['efir','m0','m1','player','a0','a1']` (a1 погиб ПОСЛЕ buildTurnOrder
  round 1 → серый слот; откат-воскрешение mid-round очередь НЕ
  пересчитывает — a1 действует в round 1, слот ti 5). Остальное то же:
  ti 3, phase 'player', p.hp 10 (13−3), efir.mp 6, spellWis 0,
  a0/a1 = round(maxHP/2).
* **RESCUE-2**: Эфир-ход — ввод: тест кастует сам — `c.cast(c.targetId)`
  (spark: spellInt 1→0, mp 11→8, m0 6→1), затем 1 `c.endTurn()` → окно
  round 1 → partyLost. Все поведенческие пины сохранены (reset полный:
  mp 11, spellWis 1, m0.hp 1, каста «Воскрешения» нет).
* **RESCUE-3 (a)**: 1 `c.endTurn()` (Эфир no-op — в книге нет «урон») →
  окно round 1 → mp-гейт (reset-mp 11 < 15) → partyLost. Пины без
  изменений (mp 11, spellWis 1).
* **RESCUE-3 (b)**: 5 `c.endTurn()` (Эфир, игрок, a0, a1, Эфир-round-2)
  с мутацией m0.damage 5→50 ПОСЛЕ endTurn #1: окно открывается ПОСЛЕ
  startRound-refill round 2 (spellWis = 1 + floor(−10/10) = 0 — РЕФОРМУЛА
  отработала естественно, без фикстура-мутаций пула) → pool-гейт →
  partyLost. Пины без изменений (mp 15, spellWis 0).
* **RNG-1**: 4 `c.endTurn()` (Эфир, игрок, a0, a1→round-2-Эфир) с
  мутацией m0.damage 12→30 после endTurn #1. Счётчик **n = 4** (2+2
  hit-ролла мобов × 2 раунда) — БЕЗ ИЗМЕНЕНИЙ; окно 0 rng; финал:
  **round 2** (было 3), ti 3, p.hp 11, efir.mp 6, spellWis 0, turnOrder
  5 записей (a1 мёртв на старте round 2 — вне; добор — round 3).
* **PRE-1 (GUARD)**: pre-roll теперь ОСТАНОВИТСЯ на любом player-side
  юните (в т.ч. на Эфире) → убийца обязан быть СТРОГО самым быстрым.
  Старые attrs Эфира 8/8 давали init 9 > 4 (лучник) → стоп на Эфире,
  pre-roll-смерть недостижима. Новая мутация ДАННЫХ: attrs
  `{intelligence: 3, wisdom: 10, dexterity: 0}` → init **3 < 4** (лучник
  СТРОГО первым), reset-mp **18 ≥ 15** (mp-гейт прошёл бы — гейт падает
  именно на c.efs, смысл гварда сохранён: «готовый к спасению» Эфир +
  pre-roll-смерть → ВСЕГДА partyLost). Ре-пины: `efir.mp` 21→**18**,
  «мана 21 ≥ 15» → «18 ≥ 15».

Итог: полный `npm test` = **1913/1913** (0 fail; два независимых
прогона ПОСЛЕ ре-пина). Прогон ДО ре-пина: 5 fail (RESCUE-1/2/3,
RNG-1, PRE-1); тот же прогон сосчитал общий тотал 1908 (vs 1913
после) — файл combat.test.js при изолированном запуске отсчитывает
194 теста и в той, и в другой версии, так что дельта 5 — артефакт
подсчёта полного параллельного прогона (машина под нагрузкой:
длительность 129 с против ~90 с), НЕ потерянные тесты.
