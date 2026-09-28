# 000045 — Заклинания в игровом коде (каталог assets/spells, 000023)

Реализовано по каталогу `assets/spells` (16 заклинаний) и разделу
SPEC.md «Заклинания». Тесты: tests/spells.test.js, tests/combat.test.js,
tests/index-order.test.js, tests/save.test.js.

## Модули

* `src/spells-data.js` — ГЕНЕРИРУЕМЫЙ зеркало каталога
  (`scripts/sync-spells-data.js`, стиль 000024/skills-data; npm
  `gen:spells`). Экспорты: `SPELLS` (массив в порядке файлов) и
  `SPELLS_BY_ID` (индекс). В браузере — `Game.SpellsData`.
  ВАЖНО: `SPELLS_BY_ID` строится ЦИКЛОМ от `SPELLS` — те же объекты,
  не второй литерал: сравнение идентичности «высшая степень цепочки»
  в spells.js ломается на двух экземплярах одного заклинания
  (ловлено тестом: «в бою действует высшая степень: Искра» для самой
  Искры).
* `src/spells.js` — ядро, чистый код без DOM. В браузере —
  `Game.Spells` (именованное пространство, НЕ распад в корень Game).
  Guards с console.error (паттерн 000038): нет SpellsData /
  combatInternals / Player (skillPractice,heal,derived) / PRACTICE_XP →
  console.error + Game.Spells НЕ создаётся (guard возвращает
  undefined, UMD-обёртка тогда Game не трогает — тест index-order
  «порядок битый»).
* Зависимости: `combat.combatInternals` = { log, nearestMob, unitDist,
  checkTurn, checkBlocked, dealDamageToMob } (новый экспорт combat.js),
  `Game.PRACTICE_XP`, `Game.derived/heal/skillPractice` (player.js).

## Правила (зафиксированы красными тестами)

* Ранги: SCHOOL_RANKS — Ученик 1–10 → ур.1, Знаток 11–25 → ур.2,
  Мастер 26–50 → ур.3, Аркимаг 51–100 → ур.4. `schoolRank(level) →
  {name,tier}|null` (вне 1..100 — null); `rankAllowsTier(lvl,tier)`.
  Значения обязаны совпадать с таблицей тестов данных (000023) и SPEC.
* Книга: `p.spells` — список id; `bookOf(p)` — ленивая инициализация
  ([]). Стартовая книга в createCharacter: `['spark','mend']`
  (аналоги старых кнопок «Огонь»/«Исцел.»; источников изучения этой
  задачей не заводится — отзыв ревью).
* learn/canLearn — порядок проверок: неизвестное id → уже изучено →
  ранг школы ПО АТРИБУТУ заклинания (Int/Wisdom; reason «нужен ранг
  школы «Знаток»») → базовое заклинание (reason «нужно базовое
  заклинание: <название>») → только для source='rune': Рунопись
  (p.secondary.runes) >= уровень (reason «нужна Рунопись N»).
  learn мутирует p.spells (без дублей).
* Цепочки «база»: предвычислены при загрузке (CHAIN_OF/ROOT_OF).
  `highestKnown(p, spell)` — высшая ИЗВЕСТНАЯ степень; `activeSpells(p)`
  — Map rootId → высшая известная (чисто, p.spells не создаёт).
* castSpell/canCastSpell (зеркало 000037: одна причина — одно
  поведение, общий evalSpell): checkTurn → checkBlocked → неизвестное →
  не изучено (чистое чтение книги, НЕ bookOf — canCastSpell без
  побочных эффектов, p.spells не создаёт) → высшая степень цепочки
  (reason «в бою действует высшая степень: <название>») → пул
  c.ps.spellInt/spellWis по атрибуту (reason «действий «Заклинание»
  (Интеллект/Мудрость) больше нет») → мана («не хватает маны (N)») →
  цель для урон/ослабление/контроль (default nearestMob; дальность 4;
  «нет цели» / «цель слишком далеко (дальность 4)»).
  Расход: пул −1, mpa −мани. canCastSpell не трогает c._rng/log/ps.
* Формулы (детерминированы, без RNG):
  * урон: `round((4 + 0.5*атрибут) * (1 + 0.15*(степень−1)) * (1+bonus))`,
    bonus: огонь → derived.fireDamageBonus, лёд → iceDamageBonus,
    иначе 0. Всегда попадает, броня моба игнорируется
    (dealDamageToMob ignoreArmor=true, он же вызывает checkVictory).
  * лечение: `round((4 + 0.5*wisdom + p.level) * (1 + 0.15*(степень−1)))`.
  * защита: `c.ps.shield = { armor: 1+степень, turns: 3 }`.
  * ослабление: `u.weaken = { mult: 0.75, turns: 3 }`.
  * контроль: `u.bind = { turns: 1 }`.
* Практика (PRACTICE_XP.spell=3): мапа школа → навык:
  огонь → firelord, лёд → icelord, исцеление → meditation,
  природа → nature; тень/защита — практики НЕТ (вторичного навыка нет).

## Боевое состояние и тики (правки combat.js, мелкие и локализованные)

* `c.ps.shield = { armor: 0, turns: 0 }` в createCombat; новый бой —
  всегда чистый (эффекты не переносятся — новые юниты/пулы).
* dealDamageToPlayer: пока `shield.turns > 0` — гасит `shield.armor`
  от RAW-урона (до блока/брони).
* Тик щита — в endPlayerTurn ПОСЛЕ refillPools: защищает ровно
  `turns` раундов, включая раунд каста (защита в раунде каста — до
  тика: каст в раунде 1 → тики в раундах 2, 3, 4).
* mobAct: в самом начале (после alive/fled/result) — `u.bind.turns>0` →
  тик + лог «…скован — пропускает действие.» + return (моб не бьёт,
  не двигается, НЕ ТИКАЮТ прочие эффекты).
* mobAttack: пока `u.weaken.turns>0` — урон ×mult, тик ВМЕСТЕ С
  ПРИМЕНЕНИЕМ (×0.75 ровно 3 удара: удары 1–3 ослаблены, тики 3→2→1→0).
  Если моб промахивается/не атакует — тика не будет (тик = применение).
* ЭКСПОРТ: combat.js возвращает `combatInternals` (см. выше) —
  публичный API ядра для spells.js.
* Старые `c.spell('fire'/'heal')` (playerSpell/canDoAction) НЕ
  менялись — два «огня» в бою пока сосуществуют; унификация — будущая
  UI-задача (~439 тестов закрепляют их точные reasons/сообщения).

## Порядок загрузки (UMD-ловушка 000038)

index.html: `combat.js < spells-data.js < spells.js < dungeon.js <
… < combat-ui.js < main.js` (и player.js < spells.js). spells.js при
загрузке снимает Game.SpellsData/Game.combatInternals/Game.PRACTICE_XP
и функции персонажа; combat-ui.js/main.js снимают
`const G = globalThis.Game` — spells.js обязан быть РАНЬШЕ их. Закрыто
тестами index-order (включая vm-симуляцию полной цепочки и guard
битого порядка).

## Сейв

* `hero.spells` — новое ОПЦИОНАЛЬНОЕ поле сейва, без повышения версии
  (000031). main.js restoreFromSave: `hero.spells = G.sanitizeSpellBook
  ? G.sanitizeSpellBook(d.hero.spells) : []` (паттерн inventory/
  equipment). Иначе книга молча терялась при перезагрузке.
* `sanitizeSpellBook(list)`: только строки-каталожные id, без дублей,
  порядок сохранён; не-массив → [].

## Отступление от красных тестов (баг тестов, не реализация)

tests/spells.test.js «canLearn: ранг школы»: строка
`canLearn(p, 'spark').ok === true` противоречила «learn/canLearn»
(`canLearn(p, 'spark') === {ok:false, reason:'уже изучено'}`) — spark в
стартовой книге (добавлен по отзыву ревью ПОСЛЕ написания ранговой
строки). Намерение строки — «уровень 1 — Ученик подходит» — сохранено
заменой 'spark' → 'frost_bolt' (уровень 1, Интеллект, не в стартовой
книге). Реализации, удовлетворяющей обе строки дословно, не существует
(состояние персонажа в обеих строках то же).

## Риски мержа

src/combat.js — «горячий» файл: 000050 (случайные препятствия) и
000053 (дублирование данных) могут править его параллельно. Правки
000045 локализованы: +combatInternals в return, +shield в c.ps,
3 строки в dealDamageToPlayer, тик в endPlayerTurn, bind-блок в
mobAct, 4 строки в mobAttack.
