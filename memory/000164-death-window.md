# 000164 — Гибель Флогистона: «окно смерти», каскад, auto-возрождение Эфира, спасение «Воскрешением»

**СТАТУС: ПРОЕКТИРОВАНИЕ завершено (2026-10-07); Реализация/Ревью/Финализация
впереди.** Контракт для станций Реализация/Ревью/Мерж. Worktree:
`.worktrees/task-000164`, ветка `task/000164`, база = master `ec08e19`
(000167 «инициатива» СМЕРЖЕН: тик яда — в startRound; endPlayerTurn →
endTurn; pre-roll в createCombat; D6-гварды). Тест-базовая: **1851 pass /
0 fail** (мерена ВНУТРИ worktree, `npm test`, 2026-10-07; первый
фоновый прогон базовой показал 1 флейк (vm-e2e, детали утеряны
обрезкой вывода) — контрольный прогон с полным выводом 1851/0, exit 0;
флейк записать в отчёт, паттерн 000161 §5.8).

ТЗ (source of truth): `tasks/pending/000164.md` (родитель 000156).
Контракты: `memory/000156-resurrection-design.md` §3.D4 (ЯДРО)/§5/§9.1-3;
`memory/000163-resurrection-spell.md` R-1/R-3/R-4 + §5 (прямой вызов
resurrectAlly — НЕ castSpell); `memory/000161-dead-mercs-record.md`
§4.4 (partyLost); `memory/000167-initiative-core.md` (регионы очереди).
SPEC.md — якоря УЖЕ в master (000156: «Спутники → Бой» L752-757,
«Спутники → Воскрешение» L791-813, «Дух Эфира» L905-911) — SPEC в этой
задаче НЕ правится; «формулировка — в SPEC» закрыто («X погиб в бою.»,
«Эфир возвращается…»-семантика).

Анализы: /tmp/thegame-wf-000164/a1-domain.md, a2-arch.md, a3-tests.md
(кратко — в шапке workflow-запуска; этот файл — итог, противоречия
a1↔a2 разрешены в пользу §3 ниже).

## 1. Что добавлено / перенесено (карта изменений)

| Файл | Что |
|---|---|
| src/combat.js | НОВЫЙ внутренний `onPlayerDeath(c)` (вставка ПОСЛЕ `dealDamageToPlayer` L911, ПЕРЕД `dealDamageToAlly` L918 — рядом с точками; function declarations — хоisting, порядок безопасен); ЗАМЕНА двух блоков `!alive` (dealDamageToPlayer-хвост L896-909 → Несокрушимость-ветка + `onPlayerDeath(c)`; яд-блок startRound L2080-2085 → `onPlayerDeath(c); if (c.result) return;`); ИЗМЕНЕНИЕ контракта возврата `dealDamageToPlayer`: число → `{ dmg, deathWindow }` (единственный вызов — mobAttack L1508, проверено grep; в combatInternals НЕ экспортирован) + строка обработки в `mobAttack` (D4 §3.2) |
| src/main.js | `combatEndCompanions` (L425-469): ВЕТКА `res.partyLost` (roster-цикл) — if/else-if НАД существующим !alive-циклом (тот — БИТ-В-БИТ); 3 onEnd (L1453/L1855/L2150) — БЕЗ ИЗМЕНЕНИЙ (подъём 000008 + вызов хелпера уже на месте) |
| tests/combat.test.js | 3 осознанных семантических репина (DP-1 L464-477, DP-2 L1613-1634, DP-3 L1636-1657: + partyLost-ассерты, обоснование в коммент-блоке) + 8 новых node-тестов (CASC-1, EFIR-1, RESCUE-1, RESCUE-2, RESCUE-3, RNG-1, UNKILL-1-guard) — в хвост файла (паттерн 000167-ROUND-2) |
| tests/companions-cycle.test.js | 1 новый vm-тест PC-1 (partyLost e2e, паттерн V5) |
| tests/save.test.js | 1 новый vm-тест SV-1 (partyLost — поле result, не сейва; паттерн 000118-теста: bootWithSave + actions.startCombat + handleCode/beforeunload) |
| CHANGELOG.md | 1 упоминание (игровой процесс) в СУЩЕСТВУЮЩИЙ раздел «## 2026-10-07 → ### Игровой процесс» (дата = сегодня = день мержа; формат — по записям; программная часть не перечисляется); ОТДЕЛЬНЫЙ коммит |
| НЕТ | новых модулей / script-тегов / CSS / SVG / index.html / экспортов combat.js (onPlayerDeath — внутренний; resurrectAlly уже в combatInternals L2598); efir.js / items.js / combat-ui.js / building-* / spells.js / save.js — БЕЗ ИЗМЕНЕНИЙ; tests/index-order.test.js не трогать; vm-песочницы подхватят изменения combat.js/main.js автоматически (цепочка <script> не меняется) |

## 2. Где что (точки, хендлер, контракты)

### 2.1 onPlayerDeath(c) — ЕДИНЫЙ хендлер ОБЕХ точек смерти игрока

Позиция: combat.js factory-scope, ПОСЛЕ `dealDamageToPlayer` (L911),
ПЕРЕД `dealDamageToAlly` (L918). Приватный (экспорт НЕТ — тесты идут
через публичные createCombat/endTurn + buildEfirUnit; минимальный дифф;
ТЗ не требует). Детерминизм: **НОЛЬ c._rng** (ТЗ D4; strongestKnown —
чистая, каталог лениво combatInternals.allySpells).

Порядок операций (фиксирован; пинится красными):

```
1. log(c, 'Вы погибли...');            // строка ПЕРЕЕЗЖАЕТ в хендлер
                                       // из обеих точек (одна причина —
                                       // один текст); в rescue-кейсе
                                       // лог честен: игрок умер, спасли
2. КАСКАД: for u of c.units:
     if (u.side === 'ally') { u.alive = false; u.hp = 0; }
   // ВСЕ союзники, включая Эфира (ТЗ п.2); hp=0 — каноническая
   // семантика гибели (как dealDamageToAlly: hp 0 + alive false),
   // идемпотентна для уже мёртвых
3. AUTO-ВОЗРОЖДЕНИЕ Эфира (дух):
     e = c.units.find(u => u.id === 'efir' && u.side === 'ally')
     if (e): e.alive = true; e.hp = e.maxHP;
             e.mp = 5 + ((e.attrs && e.attrs.intelligence) || 0)
                     + ((e.attrs && e.attrs.wisdom) || 0);
             log(c, 'Эфир возвращается…');   // U+2026, ТЗ-строка
   // БЕЗУСЛОВНО при наличии юнита (Эфир «всегда возрождается сам»,
   // SPEC «Дух Эфира»); поиск по c.units (НЕ c.efir — работает и до
   // buildEfirUnit; один источник — поле). e.maxHP — ВСЕГДА есть
   // (makeAlly Math.max(1,…) / buildEfirUnit). mp — ПЕРЕ-ДЕРИВАЦИЯ
   // (у юнита НЕТ поля maxMP; efir.js НЕ ТРОГАЕМ — см. §4 R-3)
4. СПАСЕНИЕ:
     s = e ? strongestKnown(e, 'воскрешение') : null
     mana = s ? (Number(s['мани']) || 0) : 0
     if (e && s && c.efs && c.efs.spellWis > 0 && e.mp >= mana):
        c.efs.spellWis -= 1;  e.mp -= mana;          // расход СНАЧАЛА
        log(c, `Эфир: «${s['название']}».`);          // атрибуция
        resurrectAlly(c, c.player);                    // 000163: alive,
                                                       // hp=round(maxHP/2),
                                                       // «Возвращён в бой.»
        for u of c.units:
          if (u.side === 'ally' && u.kind === 'merc') {
            u.alive = true; u.hp = Math.round(u.maxHP / 2); }
        return;   // бой ПРОДОЛЖАЕТСЯ: c.result/phase НЕ трогаются
5. НЕСПАСЕНИЕ:
     c.phase = 'over';
     c.result = { outcome: 'dead', partyLost: true };
   // partyLost — АДДИТИВНОЕ поле (ТЗ п.5)
```

Примечания:
* Строка «Вы погибли...» — ЕДИНСТВЕННАЯ в rescue-трейле, отличная от
  «боевого» конца; неспасение — без доп. строк (подъём-строка main.js
  «Вы очнулись. −20% золота.» — не тронута).
* Возврат — void; вызыватель проверяет c.result (паттерн существующих
  `if (c.result) return`).
* Эфир в откате НЕ через resurrectAlly (он уже полный после шага 3;
  ТЗ: откат — «все merc-юниты» — kind 'merc' только).
* ЛОГ-ПОРЯДОК rescue (зафиксировать в RESCUE-1): «Вы погибли...» →
  «Эфир возвращается…» → `Эфир: «Воскрешение».` → «Возвращён в бой.»
  (первый «Возвращён в бой.» — игрок из resurrectAlly; на merc-юниты
  логов НЕТ — откат молчаливый, §3 R-7).

### 2.2 Точки вызова (единственные 2)

**Точка 1 — `dealDamageToPlayer` (L896-909):** ветка else
(`c.phase='over'; c.result={outcome:'dead'}; log`) → `onPlayerDeath(c);`.
«Несокрушимость» (L899-903) — НЕ ТРОГАЕТСЯ: срабатывает РАНЬШЕ хендлера
(спасение 1 HP); окно в неё НЕ входит (ТЗ п.1; пин UNKILL-1 + зелёные
L570/L591).

**Точка 2 — яд-тик в `startRound` (L2080-2085; 000167 ПЕРЕНЁС из
endPlayerTurn):** `{ c.phase='over'; c.result=…; log; return; }` →
`{ onPlayerDeath(c); if (c.result) return; }`. Каскад здесь — ПОСЛЕ
`buildTurnOrder`/`turnIndex=0` (L2073-2074): спасённые союзники уже в
свежей очереди; неспасение — return как до (turnIndex 0 замирает).
В этой точке «Несокрушимости» НЕТ (как и до — только в
dealDamageToPlayer).

### 2.3 Контракт возврата dealDamageToPlayer + mobAttack (Д4 — ЗАКРЫТИЕ УДАРА)

`dealDamageToPlayer` возвращает `{ dmg, deathWindow }` (было: число):

```
if (!p.alive) {
  if (Несокрушимость) { …; return { dmg, deathWindow: false }; }
  onPlayerDeath(c);
  return { dmg, deathWindow: true };   // окно — событие, закрывающее удар
}
return { dmg, deathWindow: false };
```

`mobAttack` (L1508-1510):

```
const hit = dealDamageToPlayer(c, dmg);
if (hit.deathWindow) return;               // 000164: удар завершён окном
if (hit.dmg <= 0 || c.result) return;
if (u.traits.lifesteal) { u.hp = Math.min(u.maxHP, u.hp + hit.dmg); … }
```

Почему (обязательное решение): в СПАСЁННОМ кейсе c.result === null —
без сигнала mobAttack продолжил бы трейт-блок (лifesteal-хил,
яд-ролл L1514, дебафф-ролл L1518 — ВЫЗОВЫ c._rng) по воскресшему
игроку: (а) геймплей, не описанный ТЗ; (б) НОВЫЕ c._rng-вызовы в
спасённом пути — ломает строгое чтение ТЗ «ноль новых c._rng». Окно
закрывает действие: убивший удар больше ничто не производит.
Неспасение — c.result уже стоит → `c.result`-return бит-в-бит с
до. Вампиризм у ЖИВОГО игрока — без изменений (deathWindow false).
Документ-комментарий функции обновить («возвращает фактический урон»
→ «возвращает { dmg, deathWindow }»).

### 2.4 Каскад и его откат (границы)

* Каскад — ВСЕ `side === 'ally'` (мерсы И Эфир). Промежуточное
  состояние (все мертвы, включая Эфира) синхронно НЕ наблюдаемо —
  Эфир сразу auto-возрождается; пины — финальное состояние + лог
  (ОQ-3, зафиксировано).
* Откат (только при спасении) — **ВСЕ merc-юниты** (`side 'ally' &&
  kind 'merc'`), включая умерших РАНЬШЕ в бою (hp 0/!alive) —
  ТЗ буквально: «все merc-юниты alive = true, hp = round(maxHP/2)
  («не успели» умереть)»; пин RESCUE-1 включает мерса, погибшего до
  окна. Прямая мутация (НЕ resurrectAlly): ТЗ-лог обязателен только
  для каста на игрока; «не успели умереть» — отмена каскада, не
  реальное воскрешение → по-мерс-логов НЕТ (в трейле ровно один
  «Возвращён в бой.» — игрока). Снимка «кто жил до каскада» НЕТ —
  ТЗ не квалифицирует, чтение (b) — буквальное, минимальное,
  детерминированное (решение станции; если ревью захочет «только
  каскадные» — нужен pre-cascade снапшот, ТЗ его не требует).
* Эфир (kind 'efir') в откате не участвует (полный после шага 3).
* `u.fled` у союзников НЕВОЗМОЖЕН (устанавливается только у пугливых
  мобов, mobAct L1597 — проверено) — fled-гейты в живых-фильтрах
  ортогональны.
* «Лечить трупа» невозможно: окно синхронное — до хода союзников не
  доходит; mostWounded/allyHeal — livingAllies (контракт 000156 D4).
* После спасения turnOrder НЕ пересчитывается: воскресшие входят в
  очередь с СЛЕДУЮЩЕГО buildTurnOrder (000163 R-3.2/000167);
  СИНХРОННО в тот же раунд действует любой воскресший союзник, чей
  слот ЕЩЁ ВПЕРЕДИ в зафиксированной на старт раунда очереди (alive
  снова true → не серый слот) — естественное следствие инварианта
  000036, детерминировано; в пин-фикстурах мерсы (init 0) — после
  игрока, не действуют в пин-сценарии (зафиксировано в RESCUE-1).

### 2.5 Условие спасения (гейт)

* Выбор спелла: `strongestKnown(e, 'воскрешение')` — ТЗ-паттерн
  (максимум мани, тай-брейк id). В текущем каталоге единственный
  spell с действием «воскрешение» — 'resurrect' (000017) →
  тождественно «знает resurrect». 2-й spell в будущем — паттерн
  подхватит автоматически (НЕ хардкод id).
* Пул: `c.efs.spellWis` ЖЁСТКО (ТЗ; efirPool НЕ использовать — дал
  бы то же для wisdom, но ТЗ явно).
* Мана: из КАТАЛОГА `Number(s['мани']) || 0` (= 15 сегодня; ТЗ-15 =
  текущее каталожное значение). Паттерн ВСЕХ кастов efirTurn
  (одна причина — каталог): баланс-правка каталога → окно следует
  за каталогом (OQ-2 закрыт: каталог, не хардкод).
* Порядок: ПРОВЕРКА `e && s && c.efs && c.efs.spellWis > 0 && e.mp >=
  mana` ДО расхода; расход атомарный `c.efs.spellWis -= 1; e.mp -=
  mana` (паттерн каста efirTurn: проверка→расход→эффект); ЧАСТИЧНОГО
  расхода НЕТ (пин RESCUE-3: mp-гейт 11<15 / pool-гейт spellWis 0
  → ничего не списано; ERRATA-164).
* Каст на игрока — `resurrectAlly(c, c.player)` НАПРЯМУЮ (контракт
  000163 R-1: НЕ castSpell — тот тратит пулы/ману ИГРОКА; R-3 лог
  «Возвращён в бой.» — один механизм для игрока и merc в castSpell-
  пути).
* **Pre-roll (000167): c.efs/c.efir существуют ТОЛЬКО после
  buildEfirUnit** (combat-ui вызывает ПОСЛЕ createCombat) →
  pre-roll-смерть (моб с init выше игрока убил синхронно в
  createCombat) = ВСЕГДА partyLost (гейт `c.efs` ложен), даже при
  Эфире 22+. Принять как структурную деградацию (ТЗ-гейт требует
  пул: «нет пула — нет спасения»); краша нет. НО: auto-возрождение
  шага 3 СРАБАТЫВАЕТ (юнит есть в c.units) → на момент
  buildEfirUnit у Эфира u.alive === true → профиль строится (hp/mp
  полные, c.efs) — НЕВИДИМО (бой окончен, onEnd читает hero/roster,
  не профиль) — проверено, без последствий (зафиксировано).

### 2.6 partyLost — кто читает

* Ставится ТОЛЬКО onPlayerDeath (шаг 5). Форма: `c.result =
  { outcome: 'dead', partyLost: true }`.
* ЕДИНСТВЕННЫЙ читатель — `combatEndCompanions` (main.js).
  Существующие читатели `res.outcome`/`res.allyXp`/`res.items` —
  НЕ трогать: allyXp в 'dead' по-прежнему НЕТ (victory-guard
  checkVictory не тронут; пин L2888-2923), items — только victory.
* НЕ в сейв: collectSaveData не меняется; SV-1 пинит отсутствие
  'partyLost' в сериализованном сейве (схема v1 не расширена,
  CURRENT_VERSION не бампится).

### 2.7 main.js: 3 onEnd + combatEndCompanions

* 3 onEnd (L1453/L1855/L2150) — БЕЗ ИЗМЕНЕНИЙ: подъём 000008
  (`hero.alive=true; hp=max(1,round(derived.maxHP/2));
  gold=floor(gold*0.8); 'Вы очнулись. −20% золота.'`) — по
  `res.outcome === 'dead'` (тот же), вызов
  `combatEndCompanions(res, combat)` ДО saveNow (L1487/L1895/L2175).
* Ветка в combatEndCompanions (if/else-if; существующий цикл —
  БИТ-В-БИТ, пин S2/V5):

```
if (res && res.outcome === 'dead' && res.partyLost) {
  // 000164 (D4): партия погибла с игроком — ВСЕ ЗАПИСИ roster
  // (не только !alive-юниты: «призрак»-запись без юнита в c.units
  // тоже записывается); Эфира в roster НЕТ (000087).
  for (let i = 0; i < roster.length; i++) {
    const e = roster[i];
    if (!e || typeof e.npcId !== 'string') continue;
    if (!deadMercs.some(<ТО ЖЕ выражение-дедуп string|record,
        что в !alive-цикле L453-456> === e.npcId)) {
      let rec = (typeof G.companions.serializeDeadRecord
          === 'function') ? G.companions.serializeDeadRecord(e)
          : null;
      if (rec == null) rec = e.npcId;   // фолбэк (L457-460)
      deadMercs.push(rec);
    }
    roster.splice(i, 1); i -= 1;
    deadLines.push(npcName(e.npcId) + ' погиб в бою.');
  }
} else if (combat && Array.isArray(combat.units)) {
  … СУЩЕСТВУЮЩИЙ !alive-цикл БЕЗ ИЗМЕНЕНИЙ …
}
```

  * ROSTER, а не c.units — ТЗ: покрывает записи без юнита в бою
    («призрак»: allyDataForEntry → null, L403-411); Эфир исключён
    структурно (не в roster — 000087).
  * Прямой проход + `i -= 1` — порядок строк = порядок roster (=
    порядок союзников в c.units — companionAllies).
  * Дедуп-выражение (string|record → npcId, first-wins) — КОПИРОВАТЬ
    как есть из существующего цикла (без рефактора региона 000161).
  * serializeDeadRecord — typeof-guard + фолбэк голый id (существ.
    паттерн L457-460); «призрак»-запись — нормальный 6-ключевой
    entry (sheet есть) → serialize работает.
  * Пин S2 (source-скан main.js L454-466): литерал `deadMercs.push(`
    И строка «погиб в бою.» ОБЯЗАНЫ остаться в окне хелпера
    (ветка — ВНУТРИ тела, до `return xpLines.concat(deadLines)`);
    `function combatEndLoot(` (loot-e2e S1) — не сдвигается.
  * Двойного deadLines НЕЛЬЗЯ — именно else-if (иначе дубль строк:
    дедуп ловит push, но не строку после splice).

### 2.8 Что НЕ тронуто (явные «нет»)

* «Несокрушимость» (dealDamageToPlayer L899-903) — РАНЬШЕ хендлера;
  пины L570/L591 + UNKILL-1 (новый guard, зелёный с RED-коммита).
* Подъём 000008 (3 onEnd) — бит-в-бит; B25-пин (building-effects)
  зелёный без правок (мутация без partyLost → старый путь).
* allyXp — в 'dead' НЕТ (L2888-2923); items — только victory
  (L4945-4952).
* endTurn/advanceQueue/startRound-хвост (кроме яд-блока)/D6-гварды/
  phase-логику/ввод — регион 000168; buildTurnOrder — 000036/000167.
* efir.js (книгу/known-статус — readonly-чтение через u.spells /
  strongestKnown), items.js (playerQuickItem — 000165),
  combat-ui.js (UI-каст — 000166), building-*, spells.js, save.js,
  checkTurn, loot (combatEndLoot), index.html.
* Никаких новых SVG (rules svg.test.js — не затрагиваются: ассетов
  НЕТ), CSS, script-тегов, классов index.html.

## 3. Решения станции (финальные; OQ закрыты)

* **R-1. Хендлер — общий, приватный, в combat.js; строка
  «Вы погибли...» переезжает в него.** Почему: одна причина — один
  текст; обе точки сходятся в один код (ТЗ п.1 — рефакторинг
  дублирующихся 4 строк); rescue-кейс — лог честен (игрок умер).
  Экспорт НЕТ: тесты — публичные потоки (createCombat/endTurn/
  buildEfirUnit); минимальный дифф.
* **R-2. Поиск Эфира — `c.units.find(id==='efir' && side==='ally')`**
  (НЕ c.efir). Почему: работает и ДО buildEfirUnit (pre-roll); один
  источник — поле юнита (c.efir — alias, а не истина).
* **R-3. maxMP — ПЕРЕ-ДЕРИВАЦИЯ из `u.attrs`:
  `5 + (attrs.intelligence||0) + (attrs.wisdom||0)`.** Почему: у
  боевого юнита НЕТ поля maxMP (buildEfirUnit пишет только u.mp;
  efir.js — НЕ ТРОГАЕМ, u.maxMP НЕ добавляем); формула — ТО ЖЕ
  зеркало efirDerived (sheet: 5+Инт+Мудр от primary) / efirStats
  (legacy: 5+a+a) — u.attrs = efirAttrs от тех же primary
  (floor-integer ≥ 1; для валидных сейвов идентично stats.maxMP);
  прецедент — startRound (L2062-2069) уже пере-деривит c.efs из
  c.efir.attrs. Деградация (attrs нет/битый) — `|| 0` → mp 5
  (не краш). ПРАВИЛО НА БУДУЩЕЕ: если efir.js когда-то получит
  u.maxMP — переключиться на поле (одна причина).
* **R-4. Спасение — strongestKnown(e, 'воскрешение') + пул
  c.efs.spellWis + мана из каталога.** Почему: ТЗ дословно
  («strongestKnown-паттерн: максимум мани, тай-брейк id», «пул
  c.efs.spellWis», «mana ≥ 15» = каталожное 15); паттерн кастов
  efirTurn (каталог — одна причина); OQ-2 закрыт — каталог, не
  хардкод (баланс-правка → окно следует).
* **R-5. Логи:** «Вы погибли...» → «Эфир возвращается…» →
  `Эфир: «${s['название']}».` (атрибуция; OQ-1 закрыт — ДЕРЖАТЬ:
  house-style efirTurn «Эфир: «<заклинание>»…», одна строка сверх
  ТЗ-минимума «log», ревью может убрать — пин RESCUE-1 подправить
  одной строкой) → «Возвращён в бой.» (000163 R-3, из
  resurrectAlly; на merc-юниты — НЕТ, R-7). Неспасение — без доп.
  строк.
* **R-6. Pre-roll-смерть = ВСЕГДА partyLost** (нет c.efs до
  buildEfirUnit). Почему: структурное следствие ТЗ-гейта
  («пул c.efs.spellWis»); принять деградацию (ТЗ написано до
  000167); пин W11.
* **R-7. Откат каскада — прямая мутация ВСЕХ merc-юнитов, без
  логов.** Почему: ТЗ — «все merc-юниты alive = true, hp =
  round(maxHP/2)» (буквально, включая умерших раньше — пин
  RESCUE-1); ТЗ-лог — только для каста на игрока; «не успели
  умереть» = отмена каскада, не воскрешение → трейл не засоряется
  N строками (решение a1 «resurrectAlly на !alive» — отклонено:
  после каскада ВСЕ !alive — фильтр не отличает каскадные
  гибели от прежних, нужен несуществующий ТЗ-снапшот + лишние
  логи против R-5-трейла).
* **R-8. Д4 — закрытие удара: dealDamageToPlayer → { dmg,
  deathWindow }; mobAttack — `if (hit.deathWindow) return;` ДО
  трейт-блока.** Почему: rescue-кейс c.result === null; без
  сигнала трейт-роллы (L1514/L1518) = НОВЫЕ c._rng (ТЗ: «ноль
  новых») + лifesteal/яд по воскресшему — геймплей вне ТЗ.
  Альтернативы отклонены: (а) marker-поле на c — чужое состояние;
  (б) return числа + проверка p.alive — некорректна (Nесокрушимость
  тоже оставляет p.alive). Контракт-риск минимален: единственный
  вызов (grep), нет экспорта.
* **R-9. main.js — ROSTER-цикл, if/else-if (НЕ alongside
  !alive-цикла).** Почему: двойной проход — дубль deadLines
  (дедуп ловит push, не строку); ТЗ: «ВСЕ записи roster (не только
  !alive-юниты)»; условие `res && res.outcome === 'dead' &&
  res.partyLost` (_partyLost_ ставится только с 'dead' — явная
  проверка само-документирует подъём-ветку). 3 onEnd — без
  изменений; новые читатели partyLost — только этот хелпер.
* **R-10. Каскад — `alive = false` + `hp = 0`.** Почему:
  каноническая семантика гибели (dealDamageToAlly: hp 0 + alive
  false); UI-полоса мёртвого мерса — пуста; rescue-откат переза-
  пишит hp (round(maxHP/2)), Эфир — полный. a1-вариант
  (только alive) отклонён: hp>0 у !alive-юнита — несостояние,
  которого в коде не существует.
* **R-11. Смертельные пины — ОСОЗНАННЫЕ семантические репины
  (ТЗ):** DP-1 (L464-477), DP-2 (L1613-1634), DP-3 (L1636-1657):
  «immediate 'dead' = конец боя» → «окно: неспасение (без
  Эфира/спелла) → исход как до + аддитивное partyLost»; каждому —
  обоснование в коммент-блоке + assert partyLost: true.
  Остальные 'dead'-пины (L2888-2923, L4945-4952, L5436-5465,
  BAL-2 L4737-4749) — ЗЕЛЁНЫЕ БЕЗ ПРАВОК (partyLost аддитивно;
  Эфир L1 в battle119 — 'resurrect' НЕ знает, порог 22 → rescue
  невозможен → 'dead' сохраняется; BAL-1/3 — victory).
  L5436-5465 (000167-ROUND-2) — репин НЕ обязателен (ассерты не
  затрагивают shape result) — НЕ менять (минимальный дифф).
* **R-12. Никаких index.html/CSS/SVG/script-тегов.** Почему: правки
  в существующих combat.js/main.js; «нет новых модулей» — ТЗ/
  аналитики; tests/index-order.test.js — не трогать.
* **R-13. РЕБЕЙЗ ПЕРЕД МЕРЖЕМ ОБЯЗАТЕЛЕН** (000168 — параллельно,
  общий combat.js). Её регион = endTurn/advanceQueue/
  c.phase='player'/ввод-гварды; наш = dealDamageToPlayer-хвост +
  яд-блок startRound + onPlayerDeath (между ними) + 1 строка
  mobAttack + main.js-ветка — ДИСЪЮНКТИВНО, но текст-контекст
  сместится. Мерж может ждать .merge-pending 000168. Пины 000167
  (L1613/L1636/L5436) — НЕ откатывать; наши репины — поверх.
  Правило: при ребейзе НЕ «приводить в порядок» чужие регионы
  (ни 000168, ни очередь/фазы — инварианты 000036/000167).
* **R-14. CHANGELOG — НУЖЕН** (игровой процесс, player-visible):
  в СУЩЕСТВУЮЩИЙ «## 2026-10-07 → ### Игровой процесс» (дата =
  сегодня; раздел уже есть от 000167 — ДОБАВИТЬ пункт, НЕ новый
  раздел). Формулировка для игрока: гибель Флогистона — окно
  смерти: партия погибает с героем, дух Эфира возрождается и
  (с «Воскрешением», 22+) может спасти бой; без спасения — подъём
  (1/2 HP, −20% золота) и отряд в списке погибших. Программная
  часть — НЕ перечисляется. ОТДЕЛЬНЫЙ коммит
  «Задача 000164: CHANGELOG — …».

## 4. Красные тесты (итоговый список; ids — для отчёта)

expectedRedCount = **11** (упадут в RED-коммите); UNKILL-1 — guard,
зелёный с RED-коммита, не считается. Все фикстуры — существующие
паттерны combat.test.js (dealDamageToPlayer/яд/Эфир из 000167-
серии); новых require/модулей НЕТ. Именование — префикс 000164-
(паттерн 000167-ROUND-2).

**ERRATA-164 (красная станция, 2026-10-07):** §2.1 порядок
(3. reset `e.mp = 5+int+wis` → 4. гейт `e.mp >= mana`) — ИСТИНА;
цифры старых а3-фикстур («u.mp = 20 → 5», «mp 14/20 нетронуты»)
писались ДО финализации порядка и НЕВЫПОЛНИМЫ: reset перезаписывает
тестовый mp ДО гейта. Исправлено в таблице ниже (RESCUE-1/3,
RNG-1): спасательные кейсы — attrs Эфира {intelligence: 8,
wisdom: 8} (мутация u.attrs ПОСЛЕ buildEfirUnit: startRound
рефиллит c.efs из c.efir.attrs live, reset читает e.attrs live —
обе точки ловят мутацию) → reset-mp = 21 ≥ 15 → каст → mp 6;
не-спасение L1 — reset-mp 11 < 15 (гейт падает на мане).
RESCUE-3(b) изолирует ПОЛ: attrs {intelligence: 20, wisdom: −10}
→ reset-mp 15 ≥ 15 (проходит), refill spellWis = 1 + floor(−10/10)
= 0 (падает) — единственный путь на spellWis 0 (формула min 1
при attrs ≥ 0). RESCUE-1 turnOrder — 5 записей (a1-«погибший до
окна» МЁРТВ на старте round 2 → вне buildTurnOrder; добор — со
СЛЕДУЮЩЕГО, §2.4 — строка «6 записей» в старых заметках неверна).
Роллы-фикстуры (эмпирика scratch, base ec08e19): в геометрии
m0 (4,6)/m1 (3,7) альянсы НЕ роллят — Volk (2,5) d 3 → шаг (тихо),
Ashka (4,5) d 1 → «отступает» (тихо); роллы = ТОЛЬКО hit-роллы
мобов (сkeleton-без-трейтов: трейт-роллов 0; pre-roll — шаги, 0).

### 4.1 tests/combat.test.js (node; хвост файла)

| id | Что (кратко; детали — a3-tests.md §3) | Почему красный сейчас |
|---|---|---|
| DP-1 (репин L464-477) | «смерть: окно — без союзников»: фикстура БЕЗ ПРАВОК + `partyLost === true` + обоснование-коммент | partyLost — undefined |
| DP-2 (репин L1613-1634) | окно в mob-фазе: + partyLost; turnIndex 1 застыл, очередь НЕ пересчитана (000036) | то же |
| DP-3 (репин L1636-1657) | окно от яда в startRound: + partyLost; очередь ПЕРЕСЧИТАНА до окна (turnIndex 0 — дельта 000167) | то же |
| CASC-1 | гибель игрока (1 скелет, damage = 50 (мутация), (4,6) рядом, init 3 > 2, `_rng 0.01`; мерсы + Эфир L1, книга ['resurrect'], spellWis 1 — reset-mp 11 < 15 → каста НЕТ) → ВСЕ мерсы alive=false/hp=0 (каскад, R-10); Эфир alive (auto-reset); outcome 'dead' + partyLost; phase 'over', turnIndex 1 (застыл) | каскада нет: мерсы живы; partyLost — undefined |
| EFIR-1 | та же фикстура: Эфир alive, hp === 16 (maxHP L1), **mp === 11** (5+3+3 — полный reset из attrs, каста не было), лог «Эфир возвращается…» (U+2026); spellWis 1 нетронут | reset/лога нет (Эфир жив, mp 11 от buildEfirUnit — ассерт hp 16/mp 11/лог красный по лог-строке и по каскаду-контексту) |
| RESCUE-1 | 2 скелета (init 3, БЕЗ трейтов), m0 (4,6) d=30, m1 (3,7) d=3 (мутации); Эфир L1: buildEfirUnit ПОСЛЕ createCombat, затем мутации: u.spells = ['resurrect'], **u.attrs {intelligence: 8, wisdom: 8}** (ERRATA-164: reset-mp = 21 ≥ 15); a1 «погибший до окна» (a1.alive=false, a1.hp=0 — мутация ПОСЛЕ createCombat); 1× `c.endTurn()` → tail (a0 шаг, a1 серый) → round 2: Эфир-ноуп → m0 убивает → окно: reset (mp 21) → гейт (21 ≥ 15, spellWis 1, ['resurrect']) → каст → откат → m1 ДЕЙСТВУЕТ в том же раунде. Ассерты: c.efs.spellWis 0, efir.mp 6 (21−15), p.alive, p.hp = round(derived(p).maxHP/2) − 3 = 10 (13 − m1-удар: m1-удар = доказательство «оставшиеся мобы раунда действуют»), a0 alive hp = round(13/2) = 7, a1 alive hp = round(11/2) = 6 («не успели» — погиб до окна), c.result NULL, phase 'player', turnIndex 3, c.round 2, turnOrder 5 записей ['efir','m0','m1','player','a0'] (a1 вне — мёртв на старт round 2; НЕ пересчитан ПОСЛЕ окна: добор со следующего buildTurnOrder, §2.4), лог-порядок §2.1 (indexOf-цепочка + ровно один «Возвращён в бой.») | rescue-ветки нет: result {outcome:'dead'} сразу, m1 не действует (p.hp 0), каскад/откат/расхода нет |
| RESCUE-2 | неспасение: Эфир L1 ЕСТЕСТВЕННАЯ книга [spark, mend] (без мутаций; 'воскрешение' null); 1 скелет d=50; round 2: Эфир кастует spark (spellInt 1→0, mp 11→8, m0 6→1) → m0 убивает → окно: reset (mp 8 → **11** — полный, не 8), каста нет. Ассерты: outcome 'dead' + partyLost, мерсы мёртвы, Эфир alive hp 16 mp 11, c.efs.spellWis 1 (нетронут — spark жертовал spellInt), m0.hp === 1 (spark ДОСТУПИЛ — естественная книга жива), лог БЕЗ «Возвращён в бой.», С «Эфир возвращается…» | partyLost/каскада нет |
| RESCUE-3 | гейт — ЧАСТИЧНОГО расхода нет (ERRATA-164): (a) mp-гейт: Эфир L1 ['resurrect'], spellWis 1, attrs дефолт → reset-mp 11 < 15 → без каста: efir.mp === 11 (reset-значение; НЕ 11−15), spellWis 1 нетронут; (b) pool-гейт: attrs {intelligence: 20, wisdom: −10} → reset-mp 15 (проходит), refill spellWis 0 (падает) → без каста: efir.mp === 15 (НЕ 0), spellWis 0. Оба: partyLost, каскад полный, «Эфир возвращается…» есть, «Возвращён в бой.» НЕТ | гейта нет: расхода/ветки нет (partyLost — undefined) |
| RNG-1 | ноль новых c._rng: counting-wrapper (паттерн L1401-1403), сценарий RESCUE-1 но на 2 `c.endTurn()` (m0 d=12 → ПЕРЕМЕНА m0.d=30 → 2-й endTurn; убийство в round 3) → счётчик === ТОЧНО 4 (round 2: m0, m1; round 3: m0, m1 — только hit-роллы мобов; tail-альянсы 0 (шаг/отступление тихие), Эфир-ноуп 0 (книга ['resurrect']), окно/каскад/reset/каст — 0; скелеты без трейтов → трейт-роллов 0) + deepEqual снимка 2 независимых прогонa {result, round, phase, turnIndex, p.{alive,hp}, efir.mp, efs, turnOrder, units[{id,x,y,hp,alive}], log} (детерминизм D4). Итог: round 3, phase 'player', turnIndex 3, turnOrder 6 записей (round-3-ребилд: a1 воскрес → в очереди), p.hp 11 (13−2) | сейчас бой кончается В МОМЕНТ смерти: m1 round-3 не действует → счёт 3 + снимок иной (result {dead} без partyLost, p.alive false, turnOrder 5) |
| UNKILL-1 (GUARD, зелёный с RED) | Несокрушимость + СОЮЗНИКИ: p.secondary {unkill: 50} (survivalChance 0.5, ДО createCombat), p.hp = 1, 1 скелет (4,6) d=25, `_rng 0.01`, мерсы + «готовый к спасению» Эфир (['resurrect'], attrs 8/8, **mp 18** — < 20: Вдох НЕ срабатывает при frac 0.04 ≤ 0.4) → round 2: hit 1−25 → Несокрушимость (0.01 < 0.5 → hp 1) → окно НЕ ОТКРЫВАЕТСЯ. Ассерты: p.alive, hp 1, result NULL, phase 'player', мерсы ЖИВЫ полные (каскада нет), efir.mp 18 (reset/спасения не было), лог БЕЗ «Вы погибли...»/«Эфир возвращается…»/«Возвращён в бой.»; 1 МОБ (Несокрушимость 1/день — 2-й удар добил бы) | НЕ красный: защита от ошибочного размещения хендлера РАНЬШЕ survivalChance (ТЗ п.1); зелёный и в RED, и в GREEN |

FIXTURE-ПРАВИЛА (решение по риску a3 #2 «mend-интерференция»):
* В rescue/не-спасение-фикстурах книга Эфира = ровно ['resurrect']
  (мутация u.spells ПОСЛЕ createCombat — strongestKnown читает
  лениво в момент окна) → Эфир-ход не кастует ('лечение'/'защита'/
  'урон' → null), 0 rng, mp-ассерты детерминированы. В RESCUE-2 —
  естественная L1-книга [spark, mend]: игрок полные HP до удара
  (frac > 0.7 → mend не Eligible; Вдох — триггер ≤ 40% — не
  срабатывает).
* Убийца — melee-моб без трейтов (skeleton: lifesteal/poison/
  debuff НЕТ — mobAttack-продолжение без трейт-роллов), init 3 >
  init игрока 2; Эфир L1 init 4 — первый в очереди, но no-op.
* c._rng = () => 0.01 (попадания: 0.01 < hitChance — детерм.).
* Каталог — шапка `require('../src/spells.js')` (уже в файле);
  buildEfirUnit — ПОСЛЕ createCombat (паттерн L5400).
* «Погибший до окна» мерс (RESCUE-1): мутация a1.alive=false,
  a1.hp=0 ПОСЛЕ createCombat (до endTurn).

### 4.2 tests/companions-cycle.test.js (vm, паттерн V5)

| id | Что | Почему красный |
|---|---|---|
| PC-1 | seedSave: roster [volk (loyalty 65, hiredDay 2), ashka (40, 1)]; startCombat(0); мутация ТОЛЬКО ИГРОКА (alive false, hp 0; мерсы-юниты ЖИВЫ в c.units — ключевое: roster-ветка, не !alive-юниты) + c.phase='over' + c.result={outcome:'dead', partyLost:true}; handleCode('Escape'). Ассерты: hero alive, hp = max(1,round(derived.maxHP/2)), gold −20% (hero — `c.player` = live-объект + `G.derived` vm-реалма; `g.state.hero` — ДЕБАГ-зеркало, пересобираемое каждый кадр БЕЗ primary/secondary — derived() по нему падает TypeError 'endurance'; хост-`P.derived` не использовать — паттерн B25 building-effects); deadMercs deepEqual ДВЕ записи (4 поля, serialize из roster), roster []; hud «Вольк погиб в бою.» + «Ашка погиб в бою.» (порядок roster) + «Вы очнулись. −20% золота.»; Эфира в deadMercs нет; candidatesForTavern — volk/ashka не кандидаты | ветки нет: combatEndCompanions берёт только !alive-мерсы (юниты живы) → deadMercs [] |

«Без partyLost — бит-в-бит» — НЕ новый тест: **V5 (L706-784) —
regression-пин без правок** (victory + мерс мёртв → только мёртвый
в deadMercs).

### 4.3 tests/save.test.js (vm, bootWithSave — паттерн 000118-теста)

| id | Что | Почему красный |
|---|---|---|
| SV-1 | bootWithSave: data {hero, companions:[volk], day 1}; startCombat(0); мутация игрока + c.result={outcome:'dead', partyLost:true}; закрыть (handleCode('Escape') → onEnd → saveNow). Ассерты: saved.version === 1; `!('partyLost' in saved.data)` И 0 вхождений 'partyLost' в JSON.stringify(saved) (схема НЕ расширена); saved.data.dead_mercs deepEqual [запись volk]; saved.data.companions []; hero alive, hp половина, gold −20% | ветки нет → dead_mercs [] (ассерт «нет partyLost в сейве» при этом GREEN — он и есть гарантия «не сейва») |

### 4.4 Регрессионные пины (ЗЕЛЁНЫЕ БЕЗ ПРАВОК — карта)

* BAL-1/2/3 (000119, L4684-4758): Эфир L1 — 'resurrect' не знает →
  исходы 'dead'/'victory' те же; окно 0 rng → метрики/детерминизм-
  пины бит-в-бит.
* Несокрушимость L570/L591; allyXp L2888-2923; items L4945-4952;
  000082 L2826-2833 (гибель МЕРСА — не каскад); 000167-серия
  L1577-1657/L5436-5465 (кроме осознанных репинов DP-2/DP-3).
* V4/V5 (companions-cycle), S2-скан, S1 (loot-e2e), B25
  (building-effects: подъём бит-в-бит), T4/T6/T7/T8/T9/N1 (save),
  DM-1..6 (dead-mercs), spells R1-R9 (resurrectAlly-ядро),
  efir/efir-sheet/spellbook (книга 22+ — 000163, readonly).
* vm-песочницы (25 файлов) — подхватывают изменения автоматически.

## 5. Подводные камни (для Реализации/Ревью/Мерж)

1. **Регион 000168** (paralelly, тот же combat.js): endTurn/
   advanceQueue/c.phase='player'/ввод — НЕ ТРОГАТЬ; наш дифф =
   dealDamageToPlayer-блок (!p.alive) + яд-блок startRound
   (!c.player.alive) + onPlayerDeath + 1 строка mobAttack. REBASE
   перед мержем ОБЯЗАТЕЛЕН (см. R-13).
2. **С2-литералы**: partyLost-ветка ОБЯЗАНА писать через
   `deadMercs.push(` (литерал) + «…погиб в бою.» (SPEC) — иначе
   S2 падает; ветка ВНУТРИ тела хелпера (до `return
   xpLines.concat(deadLines)`), else-if (не alongside).
3. **Дельта 000167 — яд-тик в startRound** (ТЗ: «endPlayerTurn» —
   устарело): очередь ПЕРЕСЧИТАНА до окна (turnIndex 0); ТЗ-фраза
   «смерть от яда — ход игрока идёт дальше» → факт: раунд идёт
   с turnIndex 0 по свежей очереди. НЕ менять startRound/
   advanceQueue ради «продолжения хода» (чужой регион 000168).
4. **maxMP Эфира** — пере-деривация из attrs (R-3): пин в EFIR-1
   через фактические значения (L1: 11); НЕ читать u.maxMP (поля
   нет); НЕ править efir.js.
5. **pre-roll-смерть** (R-6): c.efs нет → partyLost всегда;
   buildEfirUnit после — harmless (профиль строится у живого
   после auto-reset — невидимо, §2.5). Не «чинить» — деградация по
   ТЗ-гейту.
6. **РNG-поток** (RNG-1): счётчик === 4 в RESCUE-1 (2+2 hit-ролла;
   окно 0; скелеты без трейтов). Если реализация добавит роулл —
   падение осмысленное. Несокрушимость-ролл — единственный ДО окна
   (как раньше).
7. **Фикстуры** — mend-интерференция (книга ['resurrect']; игрок
   полные HP до удара; убивца ПЕРВЫМ в раунде) — §4.1.
8. **Каскад hp=0** (R-10): pин CASC-1 — alive false (hp —
   зафиксировано комментом, ассерт на hp опционален); не
   «оптимизировать» до alive-only.
9. **Лог-порядок** (RESCUE-1): «Вы погибли...» → «Эфир
   возвращается…» → «Эфир: «Воскрешение».» → «Возвращён в бой.» —
   пинать indexOf-порядком (одна «Возвращён в бой.»).
10. **vm-флейки**: перепуск `node --test tests/<файл>` + запись в
    отчёт (000161 §5.8); npm test мерить ТОЛЬКО ВНУТРИ worktree
    (memory/test-runner-worktrees.md).
11. **Не трогать**: items.js, combat-ui.js, building-*, efir.js,
    spells.js, save.js, index.html, checkTurn, endTurn/advanceQueue/
    D6-гварды, playerQuickItem (000165), combatInternals (членов
    НЕ добавлять).
12. **000165/000166 (после нас)**: playerQuickItem (000165) —
    resurrectAlly на ПЕРВОМ мёртвом союзнике — другой путь
    (quick-слот, каст игрока), НЕ пересекается с окном; 000166
    (UI-каст) — castSpell-путь (цель — мёртвый СОЮЗНИК, pикер;
    игрок — авто-приоритет по 000163 R-1) — окно НЕ трогает.
    partyLost-читателей — только combatEndCompanions (не плодить).

## 6. Порядок работы (для станции Реализация)

1. RED-коммит «Задача 000164: красные тесты»: 3 репина + 8 node +
   PC-1 + SV-1 (+ UNKILL-1 guard) + этот memory-файл — падают ровно
   11 (expectedRedCount), все остальные 1848+ зелёные.
2. src/combat.js: onPlayerDeath + 2 точки + {dmg, deathWindow} →
   зелёные DP-1..3, CASC-1, EFIR-1, RESCUE-1..3, RNG-1, UNKILL-1.
3. src/main.js: partyLost-ветка → зелёные PC-1, SV-1.
4. npm test — ВЕСЬ набор зелёный (внутри worktree).
5. Само-ревью + агенты анализа; правки (отдельный коммит, если есть).
6. CHANGELOG (отдельный коммит «Задача 000164: CHANGELOG — …»),
   tasks/result/000164.md, перенос tasks/pending/000164.md →
   tasks/done/ (коммит всех изменённых файлов).
7. Стадия мержа: .merge-pending (164) → REBASE на актуальный master
   (000168 могла смержиться — регион того же файла!) → полный
   прогон → мерж в master → .merge-pending удалить.
