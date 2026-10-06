# 000143 — Наёмные NPC на едином листе персонажа (дизайн-контракт)

Статус: архитектура ЗАФИКСИРОВАНА (станция проектирования, 2026-10-06).
ТЗ: `tasks/pending/000143.md` (родитель 000139; данные найма — 000141;
модель листа — 000140). Заблокировано: **000145** (практика/очки UI),
**000147** (магия наёмников в бою). Базовый мастер: c627b38 (000140/000141
уже в master). Базовая зелёная линия: **1717/1717**.

## 1. Что добавлено / перенесено

1. **Запись отряда хранит `sheet`** (лист `Game.Sheet` kind `'merc'`) —
   единая модель прокачки героя/наёмника/Эфира (000140). Найм создаёт
   лист из каталога найма (000141: `базовые_характеристики`,
   `начальные_навыки`, `spells`).
2. **Боевой опыт** идёт через `Sheet.addXp` (была ручная лупа
   `while (e.xp >= G.xpForNext(e.level))` в `applyCombatXp`).
3. **Боевые статы** наёмника в бою — из `sheet.derived` через
   переопределения `data.maxHP`/`data.damage` (крюки makeAlly, 000139 §6.5);
   формулы makeAlly НЕ переписаны (работают для данных БЕЗ переопределений:
   Эфир, простые фикстуры).
4. **Сейв отряда**: форма записи `{npcId, sheet, loyalty, hiredDay}`
   (было `{npcId, level, xp, loyalty, hiredDay}`); **непрерывный backfill**
   старого формата при десериализации (C3, 000139 §4).
5. `CURRENT_VERSION` сейва **не меняется (1)**; `MIGRATIONS = {}` не
   трогается (пин save.test.js L259).

Перенесено из плоских полей записи в `sheet`: `level`, `xp` (+ новые
`totalXp`, `points`, `primary`, `secondary`, `skillXp`, `spells`).
Остаются в записи (NEVER в sheet): `npcId`, `loyalty`, `hiredDay`.

## 2. Контракты и границы

### 2.1 Форма записи RUNTIME — ровно 6 ключей

```
{ npcId, sheet, level, xp, loyalty, hiredDay }
```

- `sheet` — канонический лист (10 ключей createSheet('merc'), §2.4).
- `level`/`xp` — **плоские зеркала** `sheet.level`/`sheet.xp`. Зеркала
  нужны, чтобы ЧИТАТЕЛИ (ui.js L697/L1163, rosterSummary, makeAlly.level,
  тесты) работали без правок — это Design B (минимальный diff src строго в
  рамках файлов ТЗ: companions.js + combat.js + комментарии main.js).
- **Инвариант синхронизации**: `e.level === e.sheet.level` и
  `e.xp === e.sheet.xp` во ВСЕХ состояниях roster. Зеркала обновляются
  ровно в 3 точках: `hire` (создание), `applyCombatXp` (после addXp),
  `deserializeRoster` (backfill/sanitize). Никакой другой код НЕ пишёт
  `e.level`/`e.xp` (и не пишет в `sheet.level`/`sheet.xp` напрямую —
  уровень/опыт меняются ТОЛЬКО через `Sheet.addXp`).
  000145 (практика/очки) трогает `sheet.secondary/primary/points/skillXp`,
  НО НЕ level/xp — инвариант для неё сохраняется.

### 2.2 Форма записи SEIВ — ровно 4 поля

```
{ npcId, sheet, loyalty, hiredDay }
```

`serializeRoster`: проекция + `copyMercSheet(e.sheet)` (свежая глубокая
копия 10 ключей — fresh-copy: мутация `e.sheet` после снапшота не меняет
снапшот, пин T1). Вход без `sheet` (нарушение инварианта, недостижимо в
игре) → **тихий skip** записи. Не-массив → `[]`. Функция ТИХАЯ
(0 console; пин T1/T2).

### 2.3 API companions.js — БЕЗ ИЗМЕНЕНИЙ

15 экспортов (пин API_KEYS, companions.test.js L131-136) — те же. Внутренние
новые функции (НЕ экспортируются): `createMercSheet`, `sanitizeMercSheet`,
`copyMercSheet`, `mercModifier` (ctx-хук для derived).

### 2.4 Канонический merc-лист (10 ключей, порядок createSheet)

```
{ kind:'merc', level, xp, totalXp, points,
  primary: {strength,dexterity,constitution,intelligence,wisdom,charisma},
  secondary: {id: level}, skillXp: {id: bank}, spells: [id], npcId }
```

- `createMercSheet(npc)` (внутр.): primary — ПОКЛЮЧЕВО из
  `npc.найм.базовые_характеристики`: `finite && >= 1`, иначе **1** и
  `console.error` ОДИН РАЗ за вызов (деградационный паттерн 000038/000053;
  в игре недостижимо — 000141 гарантирует полноту). Список 6 ключей —
  константа в companions.js (совпадает с ключами каталога найма).
- `spells` — `npc.найм.spells || []` (срез).
- **ВАЖНО**: `createSheet('merc', initial)` НЕ читает `initial.skills`
  (000140: merc-ветка берёт только primary/spells/npcId) — `secondary`
  выставляется ПОСЛЕ createSheet: из `начальные_навыки` (только
  `int >= 1`). Явные уровни, **без ре-валидации requires**
  (решение A, 000141: mismatches heavy↔swordsman / archer↔accuracy —
  осознанные).
- `totalXp = 0`, `points = 0`, `level = 1`, `xp = 0` — из createSheet.

### 2.5 Backfill старого формата (deserializeRoster)

Порядок проверки записи (существующие правила 000085 НЕ меняются):
не-объект/`npcId` не строка → тихий skip (не в dropped); призрак
(`npcForEntry` — нет npc ИЛИ нет `npc.найм`) / дубль / сверх лимита →
`dropped.push(npcId)`; `level` int ≥ 1, `xp` finite ≥ 0, `loyalty` finite,
`hiredDay` finite ≥ 1 — существующие проверки.

Затем:
- **`e.sheet == null` (старый формат)**: backfill НЕПРЕРЫВНЫЙ:
  `sheet = createMercSheet(npc)`; `sheet.level = e.level; sheet.xp = e.xp;`
  `sheet.totalXp = e.xp` (инвариант `totalXp ≥ xp`; прецедент
  `sanitizeSavedHero` — fallback `s.xp`, player.js L179-180; totalXp=0 —
  нет: было бы `totalXp < xp`); `sheet.points = 0` (в старом формате
  очки не копились). Затем зеркала из sheet.
- **`e.sheet` есть (новый формат)**: `sanitizeMercSheet(e.sheet, e.npcId)`;
  `null` → `dropped.push(npcId)` (**reset**, без fallback на плоские
  поля — ТЗ «invalid → reset»).
- Итог: запись 6 ключей, зеркала = `sheet.level`/`sheet.xp`,
  `loyalty` clamp 0..100, `hiredDay` floor (существующее).

**«warn» из ТЗ** = канал `dropped[]` (000085: warn печатает main.js по
dropped; сама функция ТИХАЯ — пин T2 `q.n === 0`). Никаких console в
serialize/deserialize.

### 2.6 sanitizeMercSheet(s, npcId) → канонический лист | null

Ядро → **null** (запись в dropped): `s` объект-не-массив; `s.kind ===
'merc'`; `s.npcId === npcId` (строка); `level` int ≥ 1; `xp` finite ≥ 0;
`primary` — объект, ВСЕ 6 ключей finite ≥ 1 (прецедент sanitizeSavedHero:
ядро нечинится).
Полевая чистка (НЕ null, прецедент sanitizeSavedHero L152-173):
`secondary`/`skillXp` — только пары `id ∈ ключи G.SECONDARY_SKILLS` И
`int ≥ 0` (сформированные id из битого сейва отфильтрованы; id-имена
нужны потребителям UI 000145); `spells` — только строки; `totalXp` —
finite ≥ 0, иначе `s.xp`; `points` — int ≥ 0, иначе 0.
Возврат — канонический объект ровно 10 ключей (§2.4) со свежими
вложенными объектами.

### 2.7 applyCombatXp — через Sheet.addXp

```
const res = G.Sheet.addXp(e.sheet, g.xp);   // gained = round(xp·xpMult)
e.level = e.sheet.level; e.xp = e.sheet.xp; // зеркала
events.push({ type: 'level_up', npcId: e.npcId, level: e.sheet.level })
  // за КАЖДЫЙ levelUp (levelsGained может быть > 1 — формат/порядок
  // событий {type, npcId, level} как был)
```

- Сигнатура/ответ НЕ меняются: `{applied, levelUps, events}`; `applied` —
  число записей, получивших опыт; `levelUps` — суммарно `levelsGained`.
- Запись БЕЗ `sheet` → тихий skip (недостижимо в игре; пин — новый тест).
- Пороги/значания НЕ меняются: у свежего наёмника `xpMult = 1` (scholar
  0) — `xpForNext` 50/141/260, все пины опыта (G1, браузерный тест,
  allyXp [8,8]) сохраняются. Доля 50% и `dead_mercs` — не тронуты
  (checkVictory, combat.js L791-794).
- `derived()` (для xpMult) требует каталог навыков — в браузере
  skills-data.js ДО companions.js (index.html L748 vs L772); при
  деградации `derived → null` addXp деградирует по-000140 (не наш случай
  — пин CS-7/браузерный тест).

### 2.8 allyDataForEntry и makeAlly — переопределения

`allyDataForEntry(entry, npc)`:
- «Призрак» (как было): `npc` нет / `entry.npcId ≠ npc.id` / нет
  `npc.найм` / **`entry.sheet == null`** → `null` (тихий skip).
- Статы: `dd = G.Sheet.derived(entry.sheet, { modifier: mercModifier,
  h: npc.найм })` (S-4: modifier ВЕРНЕТ ПОЛНЫЙ объект). `dd == null`
  (деградация каталога) → `null`.
- Возврат: `{ id: npc.id, name, role: h.роль, level: entry.level
  (зеркало = sheet.level), maxHP: dd.maxHP, damage: dd.damage,
  armor: h.armor, skills: entry.sheet.secondary-ключи (id-список),
  spells: entry.sheet.spells.slice(), kind: 'merc' }`.
  **Кнопки `dmg`/`hp` УБРАНЫ** из данных (makeAlly идёт в ветку
  переопределений; других потребителей нет — только
  main.js companionAllies → makeAlly).

`mercModifier(base, sheet, ctx)` (внутр.):
```
roleMult  = { support: 0.7, shield: 1.8 }[h.роль] || 1.0;   // как hpRoleMult makeAlly
maxHP    = max(1, round(base.maxHP · (h.hp || 1) · roleMult));
damage   = max(1, round((2 + 0.7·sheet.level) · (h.dmg || 1)
                 · (1 + base.fistDamageBonus
                     + base.heavyDamageBonus
                     + base.rangedDamageBonus)));   // accuracy = rangedDamageBonus
return Object.assign({}, base, { maxHP, damage });
```
- Формула урона сохраняет ЛЕВель-форму makeAlly `(2 + 0.7·ур)` и кнопку
  каталога `dmg` (R2, a1: кнопки каталога — дифференциаторы баланса —
  ЖИВЫ в модели), + те же бонусы урона, что у героя (combat.js L900-918:
  fists/heavy/accuracy; swordsman/archer — бонусы ТРОГАНИЯ, не урона).
- `roleMult` ОБЯЗАТЕЛЕН в modifiеоре: ветка переопределений ОБХОДИТ
  формульную ветку makeAlly, где `hpRoleMult` живёт.
- maxHP наёмника НЕ зависит от уровня, пока очки не распределены
  (base maxHP = f(constitution) — модель 000140); рост статов пойдёт
  через очки/практику (000145). ОСОЗНАННОЕ следствие, зафиксировано
  ре-пином «рост статов» (§2.12).

**makeAlly (combat.js) — ОДНА строка** (ветка явного урона):
```
const damage = data.damage != null
  ? Math.max(1, Math.round(data.damage * moraleMult))   // БЫЛО: data.damage
  : Math.max(1, Math.round((2 + 0.7 * level) * (data.dmg || 1) * moraleMult));
```
Почему: инвариант «мораль × урон ВСЕХ союзников» (коммент makeAlly +
createCombat L2133-2135 + прецедент Эфира 000112 D6: урон-каст Эфира
тоже ×moraleMult, CB-4). «Формулы makeAlly не переписываются» (ТЗ) =
формульная ветка (без переопределений) — она не тронута.
Ветка `maxHP` не меняется (мораль на maxHP не действует — было/остаётся).
Коммент-блок makeAlly (L284-300) дополнить строкой про явный `damage ×
moraleMult`.

### 2.9 Зафиксированные L1-значания (красные пины)

`base maxHP = round((20 + con·5) · (1 + end/golem 0%))` у L1-наёмников:

| npcId      | роль     | con | hp-кнопка | roleMult | **maxHP** | dmg-кнопка | бонусы | **damage** |
|------------|----------|-----|-----------|----------|-----------|------------|--------|------------|
| merc_volk  | melee    | 2   | 1.1       | 1.0      | **33**    | 1.2        | —      | **3**      |
| merc_ashka | ranged   | 1   | 0.9       | 1.0      | **23**    | 1.0        | —      | **3**      |
| merc_baldor| shield   | 3   | 1.5       | 1.8      | **95**    | 1.1        | heavy 2 (10%) | **3** |
| merc_mira  | support  | 1   | 0.8       | 0.7      | **14**    | 0.5        | —      | **1**      |
| merc_torga | melee    | 2   | 0.9       | 1.0      | **27**    | 1.5        | fists 2 (10%) | **4** |
| merc_rena  | ranged   | 1   | 0.8       | 1.0      | **20**    | 1.0        | —      | **3**      |

Проверки: 30·1.1=33; 25·0.9=22.5→23; 35·1.5·1.8=94.5→95; 25·0.8·0.7=14;
30·0.9=27; 25·0.8=20. Урон: round(2.7·k·(1+b)): volk 3.24→3; ashka
2.7→3; baldor 3.267→3; mira 1.35→1; torga 4.455→4; rena 2.7→3.
(Смещения vs старые формулы 13/3 на L1 поглощены округлением — старое
поведение «рост статов» [13,3,0]/[31,7,0]/[53,11,1] → новое
**[33,3,0]/[33,7,0]/[33,11,1]** — maxHP плоский до 000145, урон прежний).

### 2.10 Красные тесты — НОВЫЙ файл `tests/companions-sheet.test.js`

- **CS-1** найм → запись 6 ключей; sheet: kind 'merc', npcId, level 1,
  xp 0, totalXp 0, points 0, primary = каталог ПОКЛЮЧЕВО, secondary =
  начальные_навыки, spells = каталог, loyalty/hiredDay как было.
  (+ тень hire-теста: Object.keys 6.)
- **CS-2** опыт через addXp: найм volk → applyCombatXp 50 → level 2,
  xp 0, totalXp 50, **points 2**, зеркала, events
  `[{type:'level_up', npcId, level:2}]`, `{applied:1, levelUps:1}`;
  +91 → level 2, points 2 (91 < 141); +50 → level 3, xp 0, points 4.
- **CS-3** backfill на ФИКСИРОВАННОМ JSON старого формата
  `[{npcId:'merc_volk', level:5, xp:30, loyalty:77, hiredDay:3}]` →
  запись: sheet {level 5, xp 30, totalXp 30, points 0, primary/secondary
  из каталога}, зеркала 5/30, loyalty 77, hiredDay 3. Старый формат —
  ВАЛИДНЫЙ вход (C3: «старый сейв грузится»).
- **CS-4** makeAlly из sheet: allyDataForEntry (volk L1) →
  {maxHP:33, damage:3, armor:undefined}; makeAlly(data, 0, 1.0) →
  maxHP 33 / damage 3; **мораль**: baldor L10 data.damage 11,
  makeAlly(data, 0, 1.05) → damage round(11.55)=12 (мораль ДЕЙСТВУЕТ на
  явный урон), maxHP 95 (мораль на maxHP НЕ действует).
- **CS-5** round-trip: найм → applyCombatXp 50 → serializeRoster →
  форма 4 поля (ровно {npcId, sheet, loyalty, hiredDay}) →
  deserializeRoster → deepEqual runtime-записи до/после.
- **CS-6** sanitize: kind ≠ 'merc' → dropped; npcId ≠ → dropped;
  primary не полон → dropped; level 0 → dropped; вторичные: чужой id /
  отрицательный уровень — отфильтрованы (запись ЖИВА, cleaned);
  totalXp -1 → fallback xp; points -3 → 0; тихая (0 console.warn).
- **CS-7** guard (vm): global-settings + perlin + стабы npc/player,
  **БЕЗ sheet.js** → companions.js бросает `/companions\.js/` И
  `/sheet\.js/`. (Существующий тест «без player.js» остаётся зелёным —
  guard player.js СТОИТ РАНЬШЕ.)

### 2.11 Catalog ре-пинов (технические, под новую форму; семантика та же)

1. **tests/companions.test.js**
   - L158-172 (форма найма): 5 → **6 ключей** `['hiredDay','level','loyalty','npcId','sheet','xp']` + пины sheet (CS-1 здесь же или ссылкой на новый файл); заголовок теста — «ровно {npcId, sheet, level, xp, loyalty, hiredDay}».
   - L726-728 (**C3**): `Object.keys(roster[0]).sort()` → 6 ключей;
     комментарий «000139, осознанный перепин + backfill-тест на
     фиксированном JSON старого формата» (обязательная формулировка C3).
   - L874-908 (allyDataForEntry): фикстуры — записи С sheet (локальный
     билдер: createSheet + secondary + level); пины: volk L5 →
     maxHP 33 / damage 7 (round(5.5·1.2)) / armor undefined; baldor →
     maxHP 95 / damage 3 / armor 3. «Призрак»-тесты + новый случай
     «entry без sheet → null».
   - L910-923 («рост статов»): [33,3,0]/[33,7,0]/[33,11,1] (коммент:
     maxHP — из sheet (без левель-члена), рост — через очки 000145).
   - L951-979 (браузер applyCombatXp): фикстура — запись с sheet
     (xp 30 → sheet.xp 30/totalXp 30 + зеркала); ОЖИДАНИЯ БЕЗ ПРАВOK
     (applied 1, levelUps 1, level 2, xp 5, JSON events).
   - L1141-1143 (G1), L1206-1208 (G3): deepEqual записи → 6-ключевая
     форма (sheet канонический).
   - L823-872 (детерминизм, реальный бой): `a.roster[0].xp` — зеркало —
     БЕЗ ПРАВOK; пин allyXp [8,8] — проверить запуском (см. §5, риск R1).
   - L1015-1059 (S2/S3 rosterSummary), G2, helpers entry()/merc() — БЕЗ
     ПРАВOK (читают плоские поля; старые записи — валидный вход).
2. **tests/save.test.js**: T1 (L671-690) — вход 6-ключевые записи,
   ожидание 4 поля, fresh-copy через `volk.sheet.xp = 99`, новый пин
   «запись без sheet → skip»; T2 (L692-764) — `q1.res.roster`/
   `q2.res.roster` → post-backfill 6-ключевые (билдер-ожидаемое);
   NUM-таблица и round-trip — **БЕЗ ПРАВOK** (плоские поля +
   serialize(deserialize) === deserialize).
3. **tests/companions-cycle.test.js**: V1 L494-496 (deepEqual roster
   post-backfill); V4 L633-635 (id), L652 (`saved.data.companions[0].xp`
   → `.sheet.xp`), L670-672 (deepEqual level 2/xp 0 → 6 ключей),
   L687-688 (`saved…level/.xp` → `.sheet.level/.sheet.xp`); V5 — seed
   старого JSON остаётся (e2e backfill). S1-S4 (source-scan main.js) —
   БЕЗ ПРАВOK (якоря — имена функций, не форма записи).
4. **tests/npc-hire-ui.test.js** L661-668 (U5): Object.keys 5 → 6;
   e.level/e.xp — без правок.
5. **tests/squad-panel.test.js** / **building-actions.test.js**:
   только комментарии про форму записи (пины на живых массивах/
   rosterSummary — без правок).

НЕ ТРОГАТЬСЯ: tests/combat.test.js (ALLY_* фикстуры — формульная ветка;
morale-тесты L2542-2575 — данные БЕЗ maxHP/damage; CB-4 — Эфир пишет
u.damage ПОСЛЕ makeAlly), tests/sheet.test.js, tests/npc-data.test.js,
tests/index-order.test.js.

### 2.12 Что осталось в companions.js БЕЗ ИЗМЕНЕНИЙ

loyalty-модель (loyaltyTick, payWages, canDismiss, quit-роллы и ЗОЛОТЫЕ
ПИНЫ REFUSE_DAYS/QUIT_SEED_VOLK_D5/roll), canHire, candidatesForTavern,
wagesTotal, dismiss, eventSeed, createRoster, npcForEntry, rosterSummary
(читает плоские зеркала), deadMercs (фильтр `kind==='merc'` в checkVictory
— не тронут), доля 50% опыта (checkVictory).

## 3. Ленивые ссылки и guards

- **UMD node**: `factory(require('./global-settings.js'), Object.assign(
  {}, require('./perlin.js'), require('./player.js'), require('./npc.js'),
  { Sheet: require('./sheet.js') }))` — циклов нет (sheet.js требует
  только global-settings/skills-data).
- **UMD browser**: `factory(G0.GlobalSettings, G0)` — G0-снапшот УЖЕ
  содержит `Game.Sheet` (index.html: sheet.js L766 ДО player.js L767 и
  companions.js L772; пин index-order.test.js). index.html не менять.
- **Новый load-time guard** в companions.js, **ПОСЛЕ guard player.js**
  (порядок критичен для теста «без player.js» L925-949 — там нет И
  player, И sheet; сначала должен сработать guard player):
  ```
  if (!G.Sheet || typeof G.Sheet.createSheet !== 'function' ||
      typeof G.Sheet.addXp !== 'function' ||
      typeof G.Sheet.derived !== 'function')
    throw new Error('companions.js: не найден Game.Sheet — загрузите
      sheet.js до companions.js (задача 000143)');
  ```
- `G.SECONDARY_SKILLS` (набор id для sanitize) — из merge/развёртки
  player.js; если не объект (деградация, недостижимо — тег
  skills-data.js перед player.js) → пустой набор (строгая чистка).
- derived()/addXp() требуют каталог навыков лениво — деградация по
  000140 (→ null + console.error ×1); в игре недостижимо.

## 4. Что важно будущим задачам

- **000145 (практика/очки UI)**: расход точек — `entry.sheet.points`
  (минус через UI, `Sheet.addSkillXp`/`practiceCap` — контракты 000140
  S-1..S-5); рост primary/secondary ИЗМЕНЯЕТ боевые статы через
  `derived` автоматически (mercModifier читает base заново каждый
  createCombat). НЕ трогать level/xp (только addXp). UI-панель читает
  `entry.level/entry.xp` (зеркала) — они остаются.
- **000147 (магия наёмников в бою)**: `sheet.spells` — ИСТОЧНИК заклинаний
  (из каталога найма при найме; mira [mend, light_heal], rena
  [spark, frost_bolt]); `allyDataForEntry` уже передаёт
  `spells: entry.sheet.spells.slice()` в makeAlly (было из каталога —
  теперь из sheet, поведение идентично до изучения новых).
- **000144 (Эфир на листе) — ПРЕДУПРЕЖДЕНИЕ**: buildEfirUnit пишет
  `u.damage` ПОСЛЕ makeAlly, сам домножая moraleMult (000112 D6, пин
  CB-4). Если Эфир перейдёт на явный `data.damage` в makeAlly, morale
  умножится ДВАЖДЫ (теперь makeAlly умножает `data.damage ×
  moraleMult`). Либо передать без morale и полагаться на makeAlly,
  либо убрать из buildEfirUnit.
- **000139 §6.5 (норматив)**: «боевые статы sheet передавать через
  data.maxHP/data.damage» — исполнено; формулы makeAlly для данных
  без переопределений (Эфир, простые фикстуры) сохраняются.
- Save: `CURRENT_VERSION = 1` НЕ меняется; backfill живёт в
  deserializeRoster (паттерн 000031/000085/000029); новые версии сейва —
  только MIGRATIONS.

## 5. Подводные камни

- **R1 (детерминизм, companions.test.js L823-872)**: у volk/ashka maxHP
  вырос (13→33, 10→23). Бой в тесте решает игрок (attack 99, волк на d=1
  от игрока) — исходы/allyXp [8,8] НЕ должны сдвинуться; ЕСЛИ сдвинулись
  (волк раньше/позже добил наёмника) — технический ре-пин ЗНАЧЕНИЙ
  (не механики) + запись в отчёт. Проверить запуском.
- **console.error при синтетических наймах**: createMercSheet печатает
  error ОДИН РАЗ, если `базовые_характеристики` биты (тесты CS-6 и
  деградационные) — тесты зелёные, вывод «грязнее» — осознано
  (паттерн 000053).
- **Зеркала — ЛОВУШКА**: любой будущий код, пишущий `e.level`/`e.xp`
  мимо addXp, ломает инвариант §2.1. Правило: level/xp — ТОЛЬКО
  addXp + 3 точки синхронизации.
- **totalXp = e.xp при backfill** (НЕ 0): инвариант totalXp ≥ xp
  нарушился бы (прецедент sanitizeSavedHero — fallback s.xp).
- **createSheet игнорирует initial.skills** — secondary выставляется
  вручную (000140/000141). Кто «оптимизирует» createMercSheet на
  `createSheet('merc', {skills})` — получит пустой secondary.
- **maxHP наёмника не растёт с уровнем** до 000145 (нет левель-члена в
  модели 000140) — осознанно (ТЗ: статы из sheet.derived); не «багом»
  чинить формулой makeAlly обратно.
- **Ветка явного damage × moraleMult** в makeAlly — новая для ВСЕХ
  будущих явных damage (Эфир-000144, см. §4).
- **Сейв**: старые сохранения (5 полей) грузятся backfill-ом НОВЫМ
  форматом при ПЕРВОМ сейве (serialize уже 4 поля) — обратного пути нет,
  это и есть «непрерывность» (играбельность сохранена; level/xp не
  теряются; primary/secondary — из каталога начальные, т.к. в старом
  формате их не было).
- **main.js — ТОЛЬКО КОММЕНТЫ** (L804, L2523-2526: форма записи в
  комменте). Код main.js не меняется (combatEndCompanions/companionAllies/
  collectSaveData/restore — через API). S1-S4 source-scan не заходят в
  комменты, но не усложнять.
- **Огромный xp (1e30) → addXp while-лупа**: теоретически долгий
  расчёт — тот же прецедент, что у героя (единая модель 000140,
  верхняя граница не вводится); в игре недостижимо (доля 50% от xp
  мобов).
- Задачи master НЕ менять; коммиты: первая строка «Задача 000143: …»,
  последняя `Co-Authored-By: Claude Code <noreply@anthropic.com>`;
  CHANGELOG — отдельным коммитом, дата 2026-10-06 (геймплей: источник
  боевых статов наёмников + очки).
