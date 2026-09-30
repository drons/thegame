# 000082 — Опыт и уровни спутников: контракты

Боевой xp делится между игроком и ВЫЖИВШИМИ спутниками; спутники
повышают уровень сами. Родитель 000065; SPEC.md «Спутники» →
«Опыт и уровни». КРАСНЫЕ тесты (TDD) — стадия red: tests/combat.test.js
(блок 000082), tests/companions.test.js (блок 000082),
tests/global-settings.test.js (ре-пин ключей + тест companion_xp_share).

## c.result.allyXp (src/combat.js, checkVictory, victory-ветка)

* ПОЛЯ allyXp — ТОЛЬКО в outcome 'victory' с победами (killed.length > 0):
  `c.result = {outcome:'victory', xp, gold, defeated, allyXp}`. allyXp —
  ВСЕГДА массив (может быть пустым — 0 союзников → `[]`).
  В 'fled' (все сбежали ИЛИ побег игрока) и 'dead' поля НЕТ —
  обработчик конца боя (000087) ОБЯЗАН гвардить `outcome === 'victory'`
  перед чтением доли (иначе NaN/undefined).
* allyXp = по каждому живому союзнику (livingAllies) с `kind === 'merc'`
  — **ПОЛОЖИТЕЛЬНЫЙ фильтр** (не `kind !== 'efir'`):
  устойчив к spelling kind Эфира — SPEC/memory/000035 пишут 'efir',
  memory/000080 пишут 'ether' (опечатка); 000081 ещё не смержен.
  Форма `{id, xp}`, порядок — c.units (порядок opts.allies).
  * id — id юнита (makeAlly data.id; для наёмника — **npcId** — 000087
    маппит allyXp → roster по нему; без data.id — индексный 'aN').
  * xp = Math.round(базовый xp × companion_xp_share). **Math.round, не
    floor** (16×0.3 = 4.8 → 5) — паттерн gold-формулы.
* Базовый xp — сумма опыта поверженных мобов — ТОЧНО то число, что
  уходит игроку, ДО бонуса «Учёный» (xpMult применяется ВНУТРИ P.addXp).
  «Учёный» спутникам НЕ идёт (навыков у них нет — v1): доля от СЫРОГО
  боевого xp.
* Доля — **КАЖДОМУ** выжившему независимо, НЕ делится на их число:
  2 спутника × 0.5 = суммарно 100% сверх 100% игрока.
* Погибший союзник (alive=false) — НЕ в списке. Отдельного fallen-списка
  НЕТ (минимальный контракт ТЗ): 000087 выведет погибших как
  (посланные в бой − ids из allyXp).
* kind 'efir' (Эфир, 000081) — вне доли: собственный пул, растёт с 100%
  c.result.xp (000081 читает сам) — исключение из allyXp убирает
  двойной подсчёт (0.5 + 100%).
* Настройка читается **ЖИВО** при вызове: `Number(SETTINGS.
  companion_xp_share) || 0` (паттерн combat.js; мусор/не число после
  000098-UI → 0, бой не падает; share 0 → записи остаются с xp 0).
* **НОЛЬ новых вызовов c._rng** в checkVictory (gold-роллы — до
  allyXp; доля — чистая арифметика) — бит-в-бит поток RNG сохранён;
  лог-строка «Победа! +… опыта…» — БЕЗ ИЗМЕНЕНИЙ (сообщения про
  спутников — 000087, только про выживших с xp > 0).

## src/companions.js

* `applyCombatXp(roster, gains)` — ЧИСТАЯ функция (без rng/DOM, паттерн
  payWages). gains = c.result.allyXp = `[{id, xp}]`.
  * Для каждого gain: запись с npcId === id → `xp += gain.xp`;
    `while (xp >= xpForNext(level)) { xp -= xpForNext(level); level++ }`
    — **while обязателен**: один бой (мобы 10+: xp ≈ 192, доля 96) даёт
    1–2 повышения сразу. Остаток xp копится между боями (в записи).
    Потолка уровня в v1 НЕТ (игрок тоже без потолка — SPEC).
  * ТИХИЙ skip (без исключений, applied не считает): запись не найдена
    («призрак»/неизвестный id), xp ≤ 0, xp не число (NaN/'мусор'),
    gains не массив (null/строка/объект/undefined) →
    `{applied:0, levelUps:0, events:[]}`, roster без изменений.
  * Возврат `{applied, levelUps, events}`:
    * applied — число применённых gains; levelUps — число повышений;
    * events — `[{type:'level_up', npcId, level}]` (level — НОВОЕ
      значение), в порядке записей roster. Паттерн payWages.events:
      000087 превращает в hudFlash («спутник повысил уровень») + saveNow
      в критической точке. Отдельных xp-событий НЕТ: текст «+N опыта»
      000087 строит сам из c.result.allyXp.
* Форма записи roster **НЕМЕНЯЕТСЯ**: ровно {npcId, level, xp, loyalty,
  hiredDay} (зафиксировано под сейв 000085) — новых полей НЕТ, очков
  навыков НЕТ, skillXp НЕТ (пин-тест Object.keys).
* `allyDataForEntry(entry, npc)` — мост в бой (для 000087): данные
  makeAlly из записи + каталога найма:
  `{id: npc.id (— npcId), name: npc.имя, role: найм.роль,
  level: entry.level, dmg: найм.dmg, hp: найм.hp, armor: найм.armor,
  skills: найм.skills, spells: найм.spells, kind: 'merc'}`.
  «Призрак» → null: npc = null/undefined, найм-данных нет,
  entry.npcId ≠ npc.id (несогласованное состояние).
* Рост статов **ИМПЛИЦИТНЫЙ**: в запись статы НЕ пишутся (форма
  зафиксирована) — makeAlly пересчитывает maxHP/damage/armor из нового
  уровня при следующем createCombat (формулы makeMob БЕЗ
  combat_difficulties/hasLeader): maxHP = max(1, round((8+4·ур)·hp·
  hpРоль)), damage = max(1, round((2+0.7·ур)·dmg·moraleMult)),
  armor = найм.armor + floor(ур/10). В найм.armor есть ТОЛЬКО у
  merc_baldor (3) — у остальных 5 наёмников рост брони только через
  floor(ур/10). В каталоге найма НЕТ поля level — уровень только из
  записи (старт 1). Повышения СРЕДИ боя НЕТ: статы юнита фиксируются
  createCombat (makeAlly с уровнем из roster на начало боя).
* НОВАЯ зависимость player.js (xpForNext): node — require('./player.js'),
  браузер — **G.xpForNext** (топовый ключ: player.js разворачивает
  экспорты прямо в Game, НЕ Game.Player); load-time guard по паттерну
  000079: «companions.js: не найден player.js — загрузите player.js
  до companions.js». Порядок index.html уже корректен (player.js до
  companions.js); BROWSER_CHAIN в tests/companions.test.js — player.js
  до companions.js (не менять).

## НЕ в этой задаче (зафиксировано)

* Проводка main.js (roster → opts.allies; c.result.allyXp →
  applyCombatXp; dead_mercs; hudFlash) — **000087** «интеграция в
  игровой цикл» (main.js запрещён: параллельные 000100/000073).
* Эфир в allies (data.id 'efir', kind 'efir', рост с 100% xp) — **000081**.
* Практика (PRACTICE_XP, c.skillXp) — ТОЛЬКО навыки игрока:
  allyAttack/allyHeal НЕ вызывают P.skillPractice (зафиксировано
  красным тестом: p.skillXp не меняется, когда врага добивает союзник).
  Опыт квестов — полностью игроку (main.js, вне combat.js). Очков
  навыков у спутников НЕТ (v1).
* Сейв (000085): структура НЕ меняется (xp/level уже в записи) → бампа
  CURRENT_VERSION НЕ нужно (000031); НО xp теперь растёт неограниченно
  за бой — валидатор 000085 обязан принимать любое целое xp ≥ 0 и
  level ≥ 1.

## Кросс-ссылки / риски

* **000081**: передать kind через makeAlly data.kind; исключение из
  allyXp зафиксировано ПОЛОЖИТЕЛЬНЫМ фильтром kind === 'merc' — оба
  spelling ('efir'/'ether') вне доли.
* **000087**: гвард `outcome === 'victory'` перед чтением доли;
  events level_up → hudFlash + saveNow; погибшие = посланные − ids
  allyXp; сообщения о доле — только про выживших с xp > 0.
* **000098** (META/DEFAULTS UI настроек, pending): META-запись для
  companion_xp_share — **min 0** (доля 0…1), НЕ generic min=1 для
  чисел — generic-фолбэк СЛОМАЕТ долю; тест 000098 «META покрывает
  ВСЕ ключи 1:1» должен учесть новый ключ.
* **000112/000113** (урон-касты Эфира, читают u.moraleMult, pending):
  риск мержа в combat.js — ханк 000082 локализован (одна ветка
  checkVictory + комментарий в шапке); при ребейзе — union + полный
  npm test + проверка бит-в-бит.
* Ре-пины (необходимые, задокументировать в коммитах): ключи SETTINGS
  (tests/global-settings.test.js, ре-пин 000079/000103) и API_KEYS
  (tests/companions.test.js, ре-пин 000079: + applyCombatXp,
  + allyDataForEntry).

## Реализация (стадия «реализация») — зафиксированные находки

* **Коллизия ключей npc.js / player.js**: оба экспортируют `skillLevel`
  (у player.js — ТОЛЬКО secondary; у npc.js — primary ПЕРЕД secondary).
  В index.html player.js (389) загружается ДО npc.js (393) → в
  браузерном Game побеждает версия npc.js. Node-UMD companions.js
  повторяет ЭТОТ порядок merge (perlin → player → npc) — иначе
  `refusalChance` (Харизма — primary) ломалась (3 теста 000079).
  Guard player.js в companions.js стоит ПОСЛЕ guard npc.js (под тестом
  browser-guard 000082 npc-API стаббится).
* **Кросс-realm семантика VM в тестах** (исправлены 2 бага красной
  стадии; пины заменены с сохранением интента):
  * Ошибка, брошенная в VM, НЕ `instanceof` хостового Error (прототип —
    Error песочницы) → браузер-тест guard проверяет свойства
    (typeof e.message + регулярки), а не instanceof.
  * Объекты/массивы, СОЗДАННЫЕ в VM, не проходят deepStrictEqual с
    хост-литералами (прототипы) → браузер-тест applyCombatXp пинит
    events через JSON.stringify (паттерн day.test.js; фиксирует контент
    и порядок ключей {type, npcId, level}).
  Для будущих vm-тестов (000085/000087): не deepStrictEqual-ить
  объекты, созданные в песочнице; не instanceof-ить её ошибки.
* Бит-в-бит подтверждён: все 1110 базовых тестов (вкл. 107 combat)
  зелёны БЕЗ правок; 0 новых вызовов c._rng в checkVictory;
  лог-строка победы не тронута.
