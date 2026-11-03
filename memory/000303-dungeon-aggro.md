# 000303: дельта-агрессия мобов подземелий/пещер (контракт)

Станция: Проектирование (worktree .worktrees/task-000303, ветка
task/000303, база master 4a49523). РЕШЕНИЯ ЗАКРЫТЫ (анализ завершён
перед написанием кода; «предварительный анализ» ТЗ — по строкам
ориентировочный, фактические строки сверены с файлами на HEAD).

## 1. Формула (FIXED, verbatim из ТЗ)

```
D = m.level − hero.level
aggroDistance(D) = D ≤ 0 ? 0 : min(4, ceil(D / 2))
aggroChance(D)   = D ≤ 0 ? 0 : min(0.6, 0.1 · D)
```

Таблица (канон для spec и тестов):

| D | ≤0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | ≥8 |
|---|----|---|---|---|---|---|---|---|----|
| distance | 0 | 1 | 1 | 2 | 2 | 3 | 3 | 4 | 4 |
| chance | 0 | 0.1 | 0.2 | 0.3 | 0.4 | 0.5 | 0.6 | 0.6 | 0.6 |

Константы (src/dungeon.js, экспортированы): `AGGRO_DIST_MAX = 4`,
`AGGRO_CHANCE_PER_LV = 0.1`, `AGGRO_CHANCE_CAP = 0.6`.

Анкеры (почему именно эти кап-ы):
- кап 4 < VISION_BASE_RADIUS 5 (src/dungeon-ui.js:160) — погоня
  начинается ДО того, как группа видна игроку в пределах обычной
  дальности: группа может «подкрасться» и оказаться в зоне видимости
  уже следующей к герою;
- шанс 0.6 на шаге (не кап 1.0): даже разность в 6+ уровней — не
  гарантия сближения на каждом шаге;
- D ≤ 0 — бит-в-бит legacy (Ни одной строки кода ветки не выполняется
  — доп. ролл НЕ делается);
- типичный D: глубина подземелья даёт группы +1..+3 к уровню игрока
  (makeDungeonContents, mobLevel = depth + 1 + rand(0..2)); босс
  ABYSS — ещё выше (~+7).

Отклонённые варианты:
- кап шанса 1.0 — погоня стала бы детерминированной, потерялась
  элемент риска/обхода;
- класс агрессии из MOB_TYPES/MOB_DATA как условие — ТЗ формулирует
  условие ЧЕРЕЗ D (уровни), класс не участвует; привязка по классу —
  это глобальная карта (НЕ ТРОГАТЬ, §4).

## 2. Механика (src/dungeon.js wanderStep)

Сигнатура: `wanderStep(contents, d, player)` — 3-й аргумент
`player = {x, y, level}` (hero-координаты ПЕРЕМЕЩЕНИЯ: после
успешного шага, ДО вызова). Возврат:
- 2-арг (player не передан) — `contents` (Бит-в-бит как было:
  и код, и ретёрн);
- 3-арг — `{ contents, landed }` (landed — группа, вышедшая по
  погоне на клетку героя, или null).

Поток на каждый шаг (одна и та же rng-цепочка на шаг:
`mulberry32((hash2(contents.step, contents.seed, 0x7777)) >>> 0)`,
step инкрементируется первым):
1. legacy-ролл направления — ТОТ ЖЕ слот, ТОТ ЖЕ порядок вызовов,
   ТОТ ЖЕ значение: `dirs[floor(rng()*4)]`;
2. ТОЛЬКО если `player && typeof player.level === 'number'` и
   `(m.level || 0) − player.level > 0` и `1 ≤ chebyshev(m, player) ≤
   aggroDistance(D)` — ОДИН доп. вызов `rng()`: значение <
   `aggroChance(D)` — группа делает ШАГ (единицу) по chaseDir,
   legacy-ролл потреблён (значение игнорируется); значение ≥ —
   legacy-шаг по своему направлению;
3. chebyshev = 0 (группа уже на клетке героя) — доп. ролл НЕ
   делается (ветка не выполняется): случай legacy-перемещения группы
   со своей клетки — НЕВЕРЯТНОСТЬ (quirk legacy, не чиним — §6);
4. chebyshev > aggroDistance(D) — доп. ролл НЕ делается (слоты
   потока не сдвигаются — бит-в-бит с 2-арг);
5. defeated-группы — пропуск (как в legacy).

chaseDir (единичный шаг за шаг игрока — «делает шаг к герою»):
- dx = player.x − m.x, dy = player.y − m.y;
- главная ось — с БОЛЬШЕГО |дeltas|, ТИР (|dx| = |dy|) — ГОРИЗОНТАЛЬ;
- кандидат — ЕДИНИЦА по оси: `sign(dx)`/`sign(dy)`;
- клетка занята (стена / граница / taken-клетка другой группы) →
  вторая ось (если её дельта ≠ 0);
- обе заняты → null — группа НЕ ДВИГАЕТСЯ (legacy-ролл тоже
  игнорируется — ветка chase);
- нулевой шаг (дельта по оси = 0) — кандидат не строится (guard
  `(primary[0] || primary[1])`).

taken — общий с блужданием (те же правила: занятость = другие ЖИВЫЕ
группы; собственная клетка освобождается до занятия новой).
Лендинг: если nx === player.x && ny === player.y — `landed = m`.

Состояния: НОВЫХ полей НЕТ (сави бит-в-бит; contents.step/seed —
как было). Босс ABYSS — группа в contents.mobs — УЧАСТВУЕТ
(`m.level` у босса = уровень содержимого, §5).

## 3. Проводка (src/locations.js, src/main.js)

src/locations.js:
- `dungeonMove(ds, dx, dy, now, opts)` — opts += `level` (уровень
  Флогистона); строка 426 `return dungeonPostMove(ds);` →
  `return dungeonPostMove(ds, opts);` (forwarding opts —
  ДОБАВЛЕНО: на HEAD opts НЕ передавались — отклонение от ТЗ,
  которое предполагало «уже передаётся»; без этого проводка
  3-арг не может существовать);
- `dungeonPostMove(ds)` → `dungeonPostMove(ds, opts)`; после блока
  сундуков: `const lvl = (opts && typeof opts.level === 'number')
  ? opts.level : null;`;
- ветка wanderStep (было L457-463): `if (lvl != null)` →
  `const r = G.wanderStep(c, d, { x: ds.x, y: ds.y, level: lvl });
  if (r && r.landed) return { type: 'combat', group: r.landed };`
  иначе legacy `G.wanderStep(c, d);`; ветка `else` (G.wanderStep не
  функция) — конвей error — БЕЗ ИЗМЕНЕНИЙ;
- pre-move combat-проверка (группа уже на клетке героя → бой ДО
  wanderStep) — БЕЗ ИЗМЕНЕНИЙ; логика сундуков — БЕЗ ИЗМЕНЕНИЙ;
- заголовок модуля (L28) — ОБНОВЛЕНИЕ существующей строки-дока:
  `{ inCombat }` → `{ inCombat, level }` (единственное разрешённое
  изменение комментария).

src/main.js — ТОЧНО 2 строки:
- L2133 (performFlameStep, после `G.state.hero.x = nx; ...y = ny;`):
  `ev = G.locations.dungeonPostMove(ds);` →
  `ev = G.locations.dungeonPostMove(ds, { level: hero.level });`
- L3032-3033 (dungeonOnMove, после hero.x/hero.y):
  `const ev = G.locations.dungeonMove(ds, dx, dy, performance.now(),
  { inCombat: !!(G.combatUI && G.combatUI.isActive()) });` → opts
  += `, level: hero.level`.
- hero — L253 `const hero = G.createCharacter('Флогистон');` (в
  области видимости обеих точек);
- performShadowStep (L2118-2123) — НЕ ТРОГАЕТСЯ (не вызывает
  dungeonPostMove — подтверждено по коду).

Событие `{type:'combat', group}` — ПРОВОДИТСЯ (main.js startDungeon
Combat — существует): `combatUI.start(..., { mobLevel: g.level, ...
})` — мобы в бою получают level = уровень группы (combat.js L3599
`Math.max(1, opts.mobLevel != null ? opts.mobLevel : p.level)`).

## 4. Глобальная карта — НЕ ТРОГАТЬ

src/combat.js — 0 diff (фрост-пины 000135/000172/000233/000235.08):
groupZoneInfo (L534: radius по классу + triggers), findZoneCombat
(L561, 5 формальных параметров: mobTiles, heroX, heroY,
combatUI-колбэк, aggroReduceRadius), HUD-круг, MOB_TYPES-классы
(агрессивный 5×5 + триггер, нейтральный 3×3 без, пугливый — бег).
Радиус триггера на глобальной карте — ПО КЛАССУ (не по D) — буллет
«Состав групп» (spec/mobs.md, строка 126→138) без изменений.

## 5. Босс ABYSS включён

Босс — обычный элемент contents.mobs (`boss: true`, level = уровень
содержимого глубины) — ветка D работает на нём так же (ТЗ: «все
типы, включая босса»). Отдельной ветки нет — уровень босса выше
уровня героя → D > 0 → погоня по формуле.

## 6. Quirks legacy — НЕ чиним

- случайное блуждание группы (2-арг / D ≤ 0 / вне зоны) ВЫХОДОМ на
  клетку героя — НЕ бой (legacy-поведение; бой на клетке группы
  возникает только при ШАГЕ ИГРОКА на неё — pre-move проверка);
- chebyshev = 0 (группа уже на клетке героя) — ветка не
  выполняется: ни доп. ролл, ни погоня; legacy-ролл — как был.

## 7. Инварианты 0-diff

- `wanderStep(c, d)` (2-арг) — код И ретёрн бит-в-бит (тест AGG-4);
- 3-арг при D ≤ 0 — бит-в-бит с 2-арг (тест AGG-4: D<0 и D=0);
- 3-арг при D > 0 вне зоны (чебышёв > aggroDistance) — бит-в-бит
  (тест AGG-7: доп. ролл не делается, слоты не сдвигаются);
- 0 diff: index.html, src/combat.js, src/map.js, src/combat-ui.js,
  src/save.js, src/perlin.js, assets/**, SPEC.md, все spec/*.md
  кроме mobs.md, все tests/* кроме перечисленных в ТЗ,
  tests/locations.test.js (легаси-стаб `(c, d) => D.wanderStep(c, d)`
  работает с 3-арг: лишний аргумент отбрасывается, ретёрн —
  contents без `.landed` — legacy-ветка);
- сави: НОВЫХ полей нет (сави бит-в-бит).

## 8. Ре-пины (по факту, в том же GREEN-коммите)

- spec/mobs.md: 126 → 139 (+13, буллет в хвост H2 «Агрессивность»,
  БЕЗ новых H2/H3);
- tests/spec-split.test.js L115: `"mobs.md": 126,` → `139` (+
  префикс комментария `000303: +13 (буллет «Агрессивность»:
  дельта-агрессия подземелий)`); nH2=68 / nH3=41 — БЕЗ ИЗМЕНЕНИЙ;
- tests/spec-000275-wording.test.js G2: 126 → 139 (заголовок +
  assert + сообщение);
- tests/spec-dungeon-depth-wording.test.js WM-6: ИМЯ В СООБЩЕНИИ
  (не assert!): H2 «Отображение уровня» 125 → 138 (125 + 13).
  ОТКЛОНЕНИЕ от ТЗ: план называл «фактическую новую строку H2
  «Состав групп»» — ФАКТ: якорь-ссылка в сообщении WM-6 ведёт на
  «Отображение уровня» (L125); «Состав групп» (L131→144) не
  фигурирует в WM-6. Актуализировано по факту (138).

## 9. Тесты (tests/dungeon-aggro-000303.test.js +
tests/spec-000303-wording.test.js)

Файл A (9 тестов, 8 игровых + e2e):
- AGG-1 (RED): экспорты + D ≤ 0 → (0,0) + константы 4/0.1/0.6;
- AGG-2 (RED): aggroDistance таблица + кап 4 + неубывание свип 0..30;
- AGG-3 (RED): aggroChance таблица + кап 0.6 + неубывание свип 0..30;
  P(3) — ТОЛЬКО 1e-9 (FP: 0.1·3 = 0.30000000000000004); P(1)/P(2)/
  P(4)/P(5)/P(6) — строгие пины (min даёт ровно 0.6);
- AGG-4 (зелёный на red): 30 шагов 2-арг == 3-арг (D=0, D<0,
  D>0-вне-зоны не задействованы: группы a L3, b L1, c L4, герой
  L4) — deepEqual позиций;
- AGG-5 (RED): реальная 3-арг == симуляция потока (deepEqual на
  каждый из 30 шагов); симуляция встроена в тест (red-фаза:
  экспортов ещё нет); chase-роллы seed 1 — в комментарии заголовка;
- AGG-6 (RED): locations.js — hero (2,2) L1, группа (4,2) L7
  (D=6: P=0.6, чебышёв 2 после шага… на момент шага чебышёв 3),
  seed 2: r0=0.146884 (legacy, игнорируется), r1=0.434612 < 0.6 →
  chase [−1,0] → (3,2) = клетка героя → {type:'combat', group};
- AGG-7 (зелёный): 30 шагов 3-арг == 2-арг вне зоны (seed 95:
  группа (1,4) L4, D=3 → aggroDistance 2, 30 legacy-шагов
  чебышёв ≥ 3);
- AGG-8 (зелёный): combat.js без правок — groupZoneInfo(0) =
  {2,true}, (3) = {1,false}; findZoneCombat.length === 5; dist 2 →
  бой / 3 → null / neutral dist 1 → null / 5-й арг 2 → dist 2 null
  / dist 0 → бой;
- E2E-1 (RED): vm-песочница (дубль harness 000083/000087/000214,
  performance.now() = NOW), enterDungeon (debug), герой L1,
  ds.contents = группа (B = E+2d) L7, contents.seed = 2, шаг на
  A = E+d → combatUI.isActive() = true, мобы в бою level 7.
  Покрывает ОБЕ проводочные строки main.js (dungeonOnMove —
  dungeonMove → dungeonPostMove → 3-арг wanderStep → landed →
  combat).

Сиды (пробой /tmp/probe-aggro.js, потоки mulberry32/hash2 из
src/perlin.js; значения — реальные вычисления):
- AGG-5: seed 1, hero (4,4) L1, g1 (3,4) L4 (D=3, в зоне), g2
  (1,4) L4 (D=3, вне зоны), 9×9 пол 1..7; chase-роллы g1 (P=0.3):
  шаг 2: 0.081399 (dir [1,0], legacy [−1,0]), 5: 0.116965,
  7: 0.045733, 11: 0.189949, 14: 0.076055, 20: 0.245192,
  24: 0.056633, 28: 0.026983 — 8 роллов, на 6 dir ≠ legacy;
- AGG-6/E2E-1: contents.seed = 2 (step 1: r0=0.146884,
  r1=0.434612 < 0.6). seed 1 ОТВЕРГНУТ для E2E (r1=0.8683 ≥ 0.6 →
  боя не было бы на зелёной фазе);
- AGG-7: seed 95 (30 legacy-шагов: мин чебышёв = 3 > 2).

Файл B (1 тест W): spec/mobs.md — h2 «Агрессивность», needles:
D-формула с (000303), «D ≤ 0 — без изменений», обе формулы,
«Мобы глобальной карты — не затронуты»; guard specLines = 139.
Канон: − U+2212, · U+00B7, ≤ U+2264, «» U+00AB/BB.

expectedRedCount (файл A) = 6 (AGG-1..3, AGG-5, AGG-6, E2E-1) +
файл B = 1 (W) → суммарно 7 осмысленных red на красной стадии;
AGG-4/AGG-7/AGG-8 — зелёные (2-арг-совместимость + 0-diff).

## 10. Подводные камни

- знак D противоположен lootChance 000245 (там D = hero − group,
  «чем герой сильнее, тем больше лут»); здесь D = group − hero;
- FP: 0.1·3 ≠ 0.3 в JS — тест P(3) ТОЛЬКО с 1e-9 (остальные пины
  точные: 0.1, 0.2, 0.4, 0.5 и 0.6 = min(0.6, 0.6) — точно);
- ceil(D/2): D=1 → 1, D=2 → 1, D=3 → 2, … строгие пины (целые);
- legacy-стаб в tests/locations.test.js `(c, d) => D.wanderStep(c, d)`
  — намеренно НЕ меняется: с 3-арг вызовом лишний аргумент
  отбрасывается, ретёрн — contents (без .landed) → legacy-ветка
  dungeonPostMove;
- performance.now() в e2e зафиксирован на NOW = 1000 (паттерн
  000083); intervalMs-таймер dungeon-моба в vm не тикает — только
  keydown (1 press = 1 step, dungeon-ui);
- полный прогон — ТОЛЬКО в этом worktree (`node --test tests/`);
  ps-check перед полным прогоном; в main repo `npm test` без пути —
  запрещён (сканирует .worktrees/*);
- spec/mobs.md — ЕДИНСТВЕННЫЙ spec-файл с правкой (13 строк, хвост
  H2 «Агрессивность»); H2/H3 не добавляются — SPEC_SECTIONS /
  nH2 / nH3 в spec-split не меняются.
