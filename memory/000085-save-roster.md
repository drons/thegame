# 000085 — Компактный контракт: отряд и Эфир в сейве (для 000083/000086/000087/000115)

Статус: РЕКОНСТРУКЦИЯ (красная станция, 2026-10-03). Оригинальный файл
дизайн-станции был утратён из worktree в середине сессии красной станции
(параллельный прогон удалил его вместе с `000085-save-party-efir.md` —
см. раздел «Конфликт параллельного прогона» в последнем).
Содержимое — СТРОГАЯ выжимка канонического контракта
`memory/000085-save-party-efir.md` (решения D1–D13); НОВЫХ решений НЕТ.
Полные обоснования — в каноне.

## Поля сейва (data, v1 — БЕЗ бампа версии, save.js — 0 изменений)

| Поле | Форма | Старый сейв (поле отсутствует) |
|---|---|---|
| `companions` | `[{npcId, level, xp, loyalty, hiredDay}]` — ровно 5 полей | `[]` (ПУСТОЙ отряд — ЗАФИКСИРОВАНО ТЗ, warn НЕТ) |
| `efir` | `{level, xp, skillXp, skills, spells}` — ровно 5 полей (D1, форма 000111) | live `createEfir()` = L1, warn НЕТ (ЗАФИКСИРОВАНО) |
| `dead_mercs` | `[npcId]` — строки, только merc (в каталоге + объект `найм`) | `[]` |

CURRENT_VERSION = 1, MIGRATIONS = {} (000031: неломкое расширение без бампа;
пин — save.test.js:256, отдельный тест не нужен).

## Game-state в main.js (СОВЕТЫ: создаёт 000085, 000083/000086/000087 — потребители)

- `let roster` — guard `createRoster`, fallback `[]` + console.error
  (D6); размещён после блока efir (~209), ДО `const NPCS` (~212).
- `const deadMercs = []` — plain array, без модульной зависимости.
- `__game.state`: `+ roster, + deadMercs,` (LIVE-объекты; 000086 — точка
  smoke-теста: читать, не менять — 000079).
- **ПРАВИЛО РЕБЕЙЗА (000083)**: если 000083 (смерженный первым) сам
  объявил `roster`/`deadMercs` в game-state — при ребейзе 000085 на него
  УДАЛЯТЬ объявление 000085 (ханк a), сохранять save/restore-ханки
  (semantic rebase). Два `let roster` → ReferenceError на load → падают
  ВСЕ vm-тесты.

## Сериализация (функции, quiet — warn печатает main.js)

```
companions.js:
  serializeRoster(roster) → Entry[]        // ЧИСТАЯ копия ровно 5 полей (D2);
                                            // !Array → []; не-объект/не-строка npcId → skip
  deserializeRoster(npcs, raw) → {roster, dropped} | null   (D3)
efir.js (ЧИСТЫЙ UMD, ноль require):
  serializeEfir(state) → object|null       // чистая копия 5 полей; не plain-object → null (D4)
  deserializeEfir(raw) → state|null        // СТРОГО структурно (D5)
```

### Валидация roster (000029 «призрак»)

- `raw == null` → `{roster: [], dropped: []}` — тихо (тотальная функция;
  main.js дополнительно гвардит `rawC != null`).
- `!Array.isArray` → `null` → main.js: warn «раздел companions некорректен»
  + `roster.length = 0`.
- Не-объект / `npcId` не строка → тихий skip (НЕ в dropped).
- **Призрак** — критерий `npcForEntry` (companions.js:114–117: id в каталоге
  + объект `найм`), дубликат npcId, сверх `max_companions` → `dropped`
  (массив строк npcId) → main.js warn «отброшены: ids».
- **Числа (D3, drop-ЗАПИСИ, не нормализация)**: `level` — int ≥ 1;
  `xp` — finite ≥ 0 (дроби КАК ЕСТЬ); `loyalty` — finite → clamp 0..100
  без округления (единственная дешёвая нормализация); `hiredDay` — finite ≥ 1
  → floor. Нарушение → запись в dropped. НЕ выдумывать фолбэки
  (loyalty → старт 50 — ОТКЛОНЕНО в каноне).
- `max_companions` — LIVE-чтение с guard `int ≥ 1, иначе 3`
  (slice(0, NaN) → [] = отряд молча испаряется).
- Порядок валидных СОХРАНЯЕТСЯ; restore — мутация in place (live-ссылка).

### Валидация efir (D5)

- Любой дефект → `null` → main.js: warn «раздел efir некорректен» + тихий
  сброс на `createEfir()` (L1): efir не мутировался между `createEfir()`
  (main.js:1659) и restore → переназначать НЕ надо, warn — единственная
  видимость.
- `raw == null` (старый сейв) → guard main.js пропускает раздел → L1,
  warn НЕТ.
- `level` — int ≥ 1 (не floor'ить); `xp` — finite ≥ 0 as-is;
  `skillXp` нет → `{}` / есть → plain-object, ВСЕ finite ≥ 0 (дроби
  ЛЕГИТИМНЫ — 000117); `skills` нет → `{}` / есть → plain-object, ВСЕ
  int ≥ 0; `spells` нет/пусто → `EFIR_SPELL_START` (внутренняя константа
  `['spark','mend']` — НЕ выводить из уровня, правило 000115), иначе
  массив строк (дубли — первый остаётся).
- **НЕ вызывать reprocessEfirSkills и НЕ валидировать id** — ОБЯЗАННОСТЬ
  000115 (её ТЗ п.3/п.4). deserialize возвращает НОВЫЙ объект; main.js
  применяет `Object.assign(efir, e)` (live-ссылка; переназначение сломает
  state/combat-finish).

### dead_mercs (INLINE в main.js, D8)

- `rawD != null`: не массив → warn + `dead_mercs = []`; не строка → тихий
  skip; призрак (npcForEntry-критерий — СТРОЖЕ чистого членства) / дубликат
  → warn; порядок сохранён.

### Общее

- Каждый раздел restoreFromSave — СВОЙ try/catch (000031); warn-текст
  содержит имя раздела. Размещение — ПОСЛЕ раздела «Персонаж» (~451),
  ДО «Побеждённые группы» (~453); порядок: companions → efir → dead_mercs.
- serialize — ЧИСТАЯ проекция (shape-guard только), без нормализации значений
  (runtime well-formed — доказано в каноне).

## Точки saveNow (000085 НОВЫХ НЕ ДОБАВЛЯЕТ — D10)

| Точка | Кто вешает |
|---|---|
| каждый шаг (main.js:1460), смена дня onDay (671), конец боя world (1032)/dungeon (1162), exitLocation (1075), beforeunload (365) | существуют ДО 000085 |
| найм / увольнение | **000083** (npcUI.open onChange → saveNow — его ТЗ) |
| гибель/уровень спутника в бою | **000087**: В НУТРИ onEnd (978–1032 / 1162) до существующего saveNow — applyCombatXp → гибель → dead_mercs.push → saveNow |
| смена дня: payWages/loyaltyTick | **000087**: ПЕРЕД saveNow(671) |
| **GAP**: debug-бой `startCombatAt` onEnd (~742–749) БЕЗ saveNow | **решение 000087** (не терять): xp/уровень/гибель отряда в debug-бою персистятся на следующем шаге/дне (как xp героя) |

Разрешённый конфликт ТЗ: 000085 = СОЗДАНИЕ состояния + разделы сейва;
сбор точек saveNow = 000083 (найм/увольнение) и 000087 (день/бой).

## Тесты (tests/save.test.js, блок «Задача 000085», D13)

- T1 (node) serializeRoster: чистая копия 5 полей, лишние отброшены,
  не-массив → [], не-объект/не-строка npcId → skip, fresh-copy (мутация
  input после serialize не меняет снапшот), тихая (0 warn).
- T2 (node) deserializeRoster (НАСТОЯЩИЙ NPCS, 6 mercs): null/undefined →
  `{[],[]}` тихо; 'junk'/42/{} → null; призрак/дубликат/сверх-max/битые
  числа → dropped; npcId:42/не-объект → тихий skip; xp 7.9 kept as-is;
  loyalty 150 → 100, 77.5 kept, 'x' → drop; hiredDay 2.7 → 2, 0 → drop;
  level 2.5/0 → drop; round-trip serialize→deserialize идентичен; тихая.
- T3 (node) serde Efir: round-trip 5 полей идентичен (свежий createEfir()
  и «после боя»; фикс-точка: skillXp 2.5 < efirSkillXpForNext(1)=30,
  xp 10 < xpForNext(2)=141); legacy 3-полевая → 5 полей; сломанные → null
  (уровни: 'junk', 42, level 0.5/0, xp 'x'/-1, skillXp 'abc'/{a:-1},
  skills 42/{a:'x'}/{a:2.5}, spells 'abc'/[1]); spells []/нет → [spark, mend];
  serializeEfir(42) → null.
- T4 (vm, полная цепочка) e2e: seed day:7 + companions[2] + efir L5
  (skillXp дроби) + dead_mercs → boot (errors 0) → state восстановлен
  (СНАЧАЛА `assert.ok(Array.isArray(state.roster))` — `host(undefined)`
  БРОСАЕТ) → beforeunload → saved.data deepEqual seed + version 1.
- T5 (vm) СТАРЫЙ сейв: errors 0; state: roster [], deadMercs [], efir L1
  (5 полей: {level:1, xp:0, skillXp:{}, skills:{}, spells:['spark','mend']});
  beforeunload → version 1, companions [], dead_mercs [], efir L1.
- T6 (vm) битые разделы + призраки: 0 errors; warns: 'companions'+ghost,
  'efir', 'dead_mercs'+ghost; state: roster [valid], efir L1,
  deadMercs [valid]; beforeunload → ЧИСТЫЕ разделы (мусор не размножается).
- Re-pins (только техническая поверхность, прецедент 000082):
  API_KEYS companions.test.js 12 → 14 (+serializeRoster, +deserializeRoster);
  R1 efir.test.js «ровно 11» → «ровно 13 (11 функций + 2 данных)»;
  пин «НОЛЬ require(» в efir.test.js — БЕЗ правок.
- Итог: **1356 → 1362** зелёных.

## Что НЕ делает 000085 (границы)

- не бампит версию, не пишет миграции; не добавляет saveNow-точки;
- не валидирует id скилов/спеллов Эфира (000115); не зовёт reprocess
  из deserialize (000115); не выводит spells из уровня (000115);
- не трогает combat.js/perlin.js/rng/ui.js/combat-ui.js (детерминизм — R5);
- не меняет UI найма (000083), не вешает payWages/opts.allies (000087);
- main.js: только ДОБАВЛЕНИЕ (4 ханка: state-зона, collectSaveData,
  restoreFromSave, __game.state + техкомменты stale-`{level,xp,skills}`).
