# Контракт «Эфир-союзник» (000081) — для 000084, 000085, 000086, 000087 и серии 000111–000119

Детали проектирования и все решения — memory/000081-efir.md. Этот файл —
СТАБИЛЬНЫЙ КОНТРАКТ: что 000081 даёт следующим задачам и что от них
ожидаётся. Файлы задач 000084–000087/000111–000119 править нельзя;
при конфликте — уточнить через SPEC.md.

## 1. Модуль и API (Game.efir)

src/efir.js — чистый UMD (ноль require при загрузке; node:
`module.exports = factory()`; браузер: `root.Game = Object.assign({},
G0, { efir: factory() })`). Позиция в index.html: после companions.js,
до building-effects.js; ОБЯЗАТЕЛЬНО раньше combat-ui.js и main.js
(они снимают снапшот Game при загрузке, ловушка 000038).

```
Game.efir = {
  createEfir()            → state (см. §2)
  addEfirXp(state, xp)    → int (число набранных уровней; 0 — если xp ≤ 0/
                           не число или Game.xpForNext недоступен)
  levelUp(state)          → int (то же, но без нового xp)
  efirAllyData(state)     → данные для makeAlly (см. §3)
}
```

* state — ОБЫЧНЫЙ ОБЪЕКТ, живёт в main.js (`efir` в zone-состоянии),
  передаётся в combat-ui через opts.efir. Мутации — только внутри
  Game.efir; внешние потребители читают только.
* Тихая деградация: нет Game.xpForNext на момент вызова →
  console.error, xp копится, уровень не растёт, исключений 0.
* addEfirXp = «весь xp сразу, while xp ≥ xpForNext(level)»
  (xpForNext — src/player.js, round(50·ур^1.5); в node-тестах
  globalThis.Game.xpForNext задаётся тестом).

## 2. Состояние и сейв

```
state = { level: ≥1, xp: ≥0 (0..xpForNext(level)−1), skills: {} }
```

* **HP/MP в состоянии НЕТ.** Каждый бой — НОВЫЙ makeAlly (hp = maxHP).
  «Возвращение 100% HP» — СТРУКТУРНО, кода восстановления нет и
  добавлять не нужно (решение 000081).
* skills — пул вторичных навыков (id → уровень); v1: {} (000111:
  {firelord, icelord, perception, precog}).
* **СЕЙВ (000085): `efir: { level, xp, skills }`** — форма ЗАФИКСИРОВАНА
  ТЗ 000085. serializeEfir/deserializeEfir — чистые функции, добавляются
  000085 прямо в src/efir.js (ТЗ 000085 называет их); collectSaveData
  (main.js) + restoreFromSave (save.js) — тоже 000085. Неверные значения
  → тихий сброс по умолчанию (level 1, xp 0, skills {}), паттерн 000029.
  Старые сейвы без efir → createEfir() (level 1). До 000085 состояние —
  только память сессии (перезагрузка → L1; допустимо).
* **ФИНАЛЬНАЯ форма 000115:** `efir: { level, xp, skillXp, skills,
  spells }` + нормализация при чтении из формы 000085
  (000035#8: «{level, xp, skills} → нормализация»).
* Род 000117: практика (1 очко/день, потолок 20) пишет в skillXp
  (000115) — не раньше.

## 3. Данные makeAlly (efirAllyData) — контракт юнита в бою

```
{ id: 'efir', name: 'Эфир', role: 'support', level: state.level,
  attrs: {}, spells: [ ...efirSpells(level) ], skills: [], kind: 'efir' }
```

* **Идентификаторы (устойчивы на всю серию):** id `'efir'`,
  kind `'efir'` (не 'ether'!), name 'Эфир'. 000082-фильтр allyXp —
  положительный (`kind === 'merc'`) → Эфир в долю наёмников не
  попадает по построению — НИКОГДА его не «чинить» в сторону доли.
* **000081: явных maxHP/damage НЕТ** — формульный путь makeAlly
  (support): maxHP = round((8+4ур)·0.7), damage = round((2+0.7ур)·
  moraleMult), armor = floor(ур/10). moraleMult = 1 +
  companionMoraleBonus (leader, +5%/ур) применяется ТОЛЬКО к формуле —
  поэтому явные статы запрещены до 000111 (пин `!('maxHP' in data) &&
  !('damage' in data)` в efir.test.js).
* **000111 (правит ТОЛЬКО src/efir.js + tests/efir.test.js):** явные
  maxHP/damage/attrs по таблице 000035 (атрибуты 3+floor((ур−1)/2);
  maxHP = 10+2·Телосл.; L1: 16; L3: 20/12; L5: 24/18), attrs
  (телосложение/интеллект/мудрость/воля/обаяние/ловкость),
  efirSpells(level) → таблица открытий (1–4: spark+mend; 5 + light_heal;
  8 + frost_bolt; 12 + waterbolt; 16 + icearmor; 20 + heal), skills
  {firelord, icelord, perception, precog}. В 000111 мораль перестаёт
  влиять на явный damage (моральный урон тогда — урон магии, 000113).
* spells: СВЕЖАЯ КОПИЯ массива на каждый вызов (мутация данных боя не
  ломает модуль); id ∈ assets/spells (целостность — тест 000053).
* v1 бой: роль support → allyAct v1 (000080): лечит самого раненого из
  [игрок, союзники] (mend: исцеление/мудрость/степень 1) → иначе
  ближняя атака (spark в v1 НЕ кастуется — касты 000112/000113).
* attrs: {} в 000081 — allyHeal работает (формула allyHeal
  000080: round((4 + 0.5·(астр||0) + ур)·(1+0.15·(степ−1)))).

## 4. Проводка (ГДЕ — и что 000087/000084 НЕ трогают)

* **main.js** (000081): `let efir = null; if (G.efir…) efir =
  G.efir.createEfir();` в зоне состояния; `efir,` в opts ВСЕХ ТРЁХ
  startCombat (startCombatAt / maybeStartCombat / startDungeonCombat);
  `__game.state.efir` (live-ссылка {level, xp, skills} | null —
  точка для 000086/000116).
* **combat-ui.js startCombat** (000081): `allies: efirData ?
  [efirData] : []`. Эфир ПЕРВЫМ → первый якорь placeAllies (px−1, py−1)
  «всегда со мной» (000086). Очередь: player → Эфир → (roster, 000087)
  → мобы.
* **combat-ui.js finish()** (000081): `if (ctx.efir && result.outcome
  === 'victory' && result.xp > 0) G.efir.addEfirXp(ctx.efir,
  result.xp)` — ДО onEnd, ДО `ctx = null`. Правило 100%: только
  victory, весь result.xp, БЕЗ companion_xp_share, БЕЗ условия
  выживания Эфира (000035#11).
* **000087 (roster):** расширяет ТУ ЖЕ строку allies: `[efirData,
  ...rosterData]` (Эфир остаётся первым); в main.js onEnd — доля
  наёмников (result.allyXp → companions.applyCombatXp) + dead_mercs +
  saveNow. **addEfirXp НЕ дублировать** — Эфир-XP уже смержен в
  finish() (000081); пин 000082 («доля — только kind === merc») и R10
  combat-ui.test.js.
* **000084 (спрайты):** рендер СОЮЗНИКОВ (сейчас их нет: drawUnits
  рисует игрока/мобов, ряд очереди — токены) — спрайт Эфира =
  EFIR_FRAMES/efirFrames (000034, assets/sprites/efir/), маркер «свой»
  (контракт 000080), слои. Идентификация юнита — kind 'efir'.
  Раскладка (000124) и порядок отрисовки игрока/мобов — НЕ трогать.
  До 000084 Эфир рисуется как генерик 000080 (ROLE_COLORS-фолбэк +
  HP-полоса; ряд очереди — имя/уровень/роль) — это поведение 000081.
* **000086 (панель «Отряд»):** строка Эфира — «всегда со мной», без
  жалованья/лояльности/выписки; данные — `__game.state.efir`
  (level/xp/skills) + `Game.efir.efirAllyData` (spells). Вне отряда
  companions — в companions.js НЕ добавлять.

## 5. Правила (что менять нельзя)

* 100% XP только при victory (D5) — условие НЕ ослаблять (fled/
  defeat — 0; Эфир мёртв в бою — XP всё равно).
* Эфир — НЕ наёмник: жалованье/лояльность/dead_mercs/выписка (000079)
  к нему неприменимы — 000087/000116/000118 не должны его в них
  включать (фильтр: kind/отряд; Эфир не в roster).
* makeAlly/makeMob/allyXp в combat.js — НЕ править под Эфира
  (000112/000113 читают u.level/u.attrs/u.moraleMult/u.spells у
  СОЮЗНИКА — поля уже на юните: 000080 хранит u.moraleMult всегда,
  u.attrs/u.level — из данных).
* Детерминизм: проводка 000081 — ноль новых c._rng; боевой поток c._rng
  С Эфиром меняется (фича) — золотые пины С Эфиром заводить только в
  000111+ со своим сидом.
* vm-правила 000082: объекты песочницы — не deepStrictEqual/
  instanceof; пины — примитивы и наличие юнита.

## 6. Чек-лист последующих задач (что взять от 000081)

* 000084: kind 'efir' → EFIR_FRAMES (000034); маркер/слои по 000080;
  Эфир в ряду союзников уже есть (000081) — только отрисовка.
* 000085: `efir: {level, xp, skills}`; serializeEfir/deserializeEfir —
  в efir.js (чистые функции); collectSaveData/restoreFromSave.
* 000086: __game.state.efir; строка «всегда со мной»; xp-бар до
  xpForNext(level).
* 000087: allies-строка `[efirData, ...rosterData]`; onEnd — доля
  наёмников (без Эфира); не дублировать addEfirXp.
* 000111: только efir.js+efir.test.js — явные статы/атрибуты/книга/
  пул; «механика xp уже в 000081 — не переделывать раздел xp» (ТЗ).
* 000112/000113: мана/касты/«Касание духа»/«Вдох Эфира»/ИИ v2 —
  combat.js (allyAct v2, mp-касты, мораль в уроне магии); проводка
  000081 (allies/finish) — без изменений.
* 000115: финальный сейв {level, xp, skillXp, skills, spells} +
  нормализация из формы 000085.
* 000116: панель (продолжение 000086) — практика не раньше 000117.
* 000117: практика в skillXp (потолок 20; день — day.js).
* 000118: «Дух» (перерождение) — финальный пул Эфира (ТЗ 000118:
  «финальный пул Эфира») — чтение state/skills.
* 000119: баланс — симуляции боя СОДЕРЖАТ Эфира (он всегда в allies) —
  пересмотреть пороги с его лечением/уроном.
