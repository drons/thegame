# Разведка (ad5e16a1, завершена): ходы боя = 1 + ловкость/10

## Точка изменения
- **Одна строка**: `src/sheet.js:478` `moveCells: 3 + Math.floor(P.dexterity / 5)` → `1 + Math.floor(P.dexterity / 10)` (dexterity — int, Math.floor).
- Потребитель: `combat.js:3086-3096` refillPools `c.ps.moveLeft = d.moveCells` (createCombat :3480, startRound :2898). UI следует автоматически — бейдж на кнопке «Конец хода»: `combat-ui.js:2209-2223` actionCounts (steps: игрок c.ps.moveLeft :2222, наёмник u.moveLeft :2217, Эфир c.efs.move :2214). 0 правок combat-ui.js.
- Трата: playerMove combat.js:1545-1568 (гейт :1550, -1 :1565-1566); зеркало canDoAction 'move' :1801-1810; диспетч c.move :3557-3562.

## Что ВНЕ формулы (решения ТЗ)
- Союзники: фикс 1 (makeAlly :386/:392, startRound :2959) — spec/companions.md:34-35.
- Эфир: фикс 3 (startRound :2939) — spec/efir-spirit.md:59-61.
- Мобы: `fast ? 2 : 1` (makeMob :316) — fast: orc_rider, centipede, wind_elemental.
- Ловкость — id `dexterity` (sheet.js:56 PRIMARY_KEYS). Источники: hero sheet.primary; наёмники npc-data.js:143-183 (1-3); Эфир efir.js:152/196/204 (1); мобы MOB_TYPES combat.js:147-187 → makeMob :334.
- Сейчас ловкость влияет: ход героя (это изменение), инициатива dex+int (combat.js:696-700, buildTurnOrder :710-719), пул быстрых предметов `1+floor(dex/10)` (refillPools :3093 — ИМЕННО этот паттерн, аналог новой формулы), побег playerFlee :1575. НЕ влияет на уклонение (dodgeBonus от precog) и критов (нет).
- moveCells НЕ масштабируется affixами (memory/000230.03:84-88) — формула остаётся «flat».

## Балансное следствие (ВТОРОЙ ВАЖНЫЙ ФАКТ)
Старая формула ≥3 ВСЕГДА; новая строго меньше при любом dex (dex 1: 3→1; dex 4: 3→1; dex 15: 6→2; dex 50: 13→6; dex 100: 23→11). Герой заметно медленнее — ИСКУССТВЕННОЕ ПОСЛАБЛЕНИЕ, осознанное (запрос пользователя). Баланс-матрицы с autoPlay:
- tests/combat.test.js:932-955 «средний герой побеждает ВСЕ 7 групп × сиды 1-5» (бот ходит пока moveLeft>0, :130-137);
- :958-981 безопасная зона (мобы -3);
- :4954/4998/5012 — 000119 BAL-1/2/3: пороги EFIR_BAL119 :4940-4952 (minRounds 2, avgRounds 5-12, avgHpFrac <1.0, minHpFrac ≤0.80) — зафиксированные значения в tasks/result/000119.md → РЕ-ПИН с новыми значениями.
- Фикстуры: strongHero()/hero() dex 1 (:75-97), midGameHero() dex 4.
- Если герой dex 1-4 перестанет побеждать часть групп — это НОРМА изменения баланса (ре-пин + память), не баг; но «побеждает ВСЕ группы» (:932) может сломаться — решение ТЗ: ре-пин исходов либо ослабить группы (НЕ в этой задаче без решения).

## Ре-пины (обязательные)
- tests/player.test.js:159-167 (moveCells 3 / 6), tests/sheet.test.js:396, :421 (=3 / =6 dex 15) — прямые пины формулы.
- tests/combat-ui.test.js:7074-7110 CU199.01-STEPS-1 (бейдж «3»→«2», станет «1»→«0»; фикстурный коммент :6549-6554), :7112+ ALIAS (mob-фаза → moveLeft героя).
- tests/combat.test.js:677-691 (читает moveLeft — динамично, OK), :5707 (рефилл — динамично, OK).
- Моб-пины movePerTurn=2 (fast) НЕ зависят: :5658-5673, :7001-7280, combat-ui.test.js:3764-6552.

## SPEC
- spec/combat.md:6 «За один ход можно пройти X клеток (зависит от Ловкости)» — формулы нет; можно/нужно вписать `1 + ловкость/10` (wording-пин по прецеденту spec-combat-wording).
- spec/skills.md:8 «Дистанция хода X клеток за ход» (таблица Ловкость) — тоже вписать.
- spec/companions.md:34-35 (наёмник 1 / Эфир 3) — НЕ трогать (пин spec-combat-wording.test.js:75-77).

## Memory-референсы
- memory/000199.01-combat-steps-badge.md — таблица пулов шагов, «подсветки достижимых клеток для ИГРОКА нет» (штриховка — только мобы, drawMobReachHatch combat-ui.js:1682-1700).
- memory/000167-initiative-core.md, 000155-mob-pathfinding.md, 000174/000175 (моб-анимации/штриховка — не трогать).
- memory/000188-retro-combat-move-pins.md — паттерн гард-пинов движения.
- CHANGELOG.md обязателен (изменение игрового процесса).
