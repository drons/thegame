# 000098 — Вкладка «Игровые настройки»: форма по SETTINGS + META, кламп, сброс (контракт)

Статус: ПРОЕКТИРОВАНИЕ (workflow задачи 000098; worktree .worktrees/task-000098,
ветка task/000098, база = master c9c99d6 — 000130 и 000081 смержены;
2026-10-02). Текст АВТОРИТЕТЕН для RED/GREEN стадий задачи и для следующих
задач (000099 — применение на лету; кандидат — персистентность в сейв).
Дополнительно: memory/000098-settings-tab.md (контракт самой вкладки: форма,
apply, session-only).

## 1. Что добавлено / перенесено

1. `src/global-settings.js` (117 → ~260 строк) — НОВЫЕ ЧИСТЫЕ экспорты рядом
   со SETTINGS: META, DEFAULTS, clampValue, resetKey, resetAll. Объект
   SETTINGS — БЕЗ ИЗМЕНЕНИЙ (тот же живой объект; ПЕРВЫЙ deepEqual-тест
   15 ключей — зелёный без правок).
2. `src/ui-tab-settings.js` (53 → ~230 строк) — placeholder (000130) →
   ФОРМА. Запись вкладки `{ column: 0, id: 'settings',
   label: 'Игровые настройки' }` — ПОБАЙТОВО БЕЗ ИЗМЕНЕНИЙ (пины R2);
   render-хука НЕТ (контракт 000130 §4.4 «settings (нет render)»).
3. `index.html` — ТОЛЬКО `<style>`-блок .cp-set* (позиция §2.3);
   script-тегов НЕТ (тег L564 уже есть, 000130; пины index-order
   L745–788 — без правок).
4. Тесты: секция 000098 (S1–S7 в tests/global-settings.test.js, U1–U5 в
   tests/ui-panel.test.js — RED) + ЕДИНСТВЕННАЯ техническая правка
   существующего теста — деструктурирование L6 (см. §5.13).
5. Память: этот файл + memory/000098-settings-tab.md.

**ТЗ УСТАРЕЛО (дельты, зафиксированы; отчёт должен их содержать):**
* SETTINGS на master — **15 ключей**, а не 8 из ТЗ (смержены после ТЗ:
  000103 city_channel; 000050 combat_obstacle_min/max_frac; 000079
  max_companions/companion_loyalty/companion_refusal; 000082
  companion_xp_share). Форма покрывает ВСЕ 15.
* Зона вкладки после 000130 — `src/ui-tab-settings.js`, НЕ `src/ui.js`
  (ui.js — 0 строк; анти-прецедент 000130 R4 + зона-карта §5:
  «000098 (настройки) → ui-tab-settings.js»).
* «8 полей: select + 6 number» в ТЗ — арифметическая ошибка (1+6=7);
  тесты пинят СТРУКТУРУ (ровно 1 select + ровно 6 number в подсекции
  «Сложности боя»), не число 8.
* Кламп level_delta_max «int ≥ 1» в ТЗ — устарел: смерженный тест
  global-settings.test.js L175–180 фиксирует 0 как ВАЛИДНОЕ значение →
  META min 0 (отклонение ТЗ).

## 2. Контракты и границы

### 2.1 src/global-settings.js — новое API (чистое, node-тестируемое)

Экспорт factory(): `{ SETTINGS, META, DEFAULTS, clampValue, resetKey,
resetAll }`. Браузерная ветка — без изменений:
`root.Game = Object.assign({}, root.Game, { GlobalSettings: factory() })`
→ браузерный путь несёт ТЕ ЖЕ экспорты (тест S7). Зависимостей НЕТ (первый
скрипт index.html L496) — motion.js require-ить НЕ МОЖЕТ (см. min 60 ниже).

**META** — ОТДЕЛЬНЫЙ объект (НЕ внутри SETTINGS); ЯВНАЯ запись на КАЖДЫЙ из
15 ключей Object.keys(SETTINGS). Форма записи:
```
{ label: string (рус.),
  unit?: string,
  type: 'int' | 'float' | 'enum' | 'nested',
  step?: number, min?: number, max?: number,
  positive?: true,          // строго > 0 (только множители боя)
  options?: string | string[],  // enum: ИМЯ ключа SETTINGS (live-источник:
                                // Object.keys(SETTINGS[имя])) или статический
                                // массив
  subkeys?: { [имя]: запись },  // nested: рекурсия
  group?: string,           // общий подзаголовок для СОСЕДНИХ ключей
}
```
Таблица (фикс — текущие 15 ключей):

| ключ | label | type | границы | особые |
|---|---|---|---|---|
| steps_per_day | Шагов за день | int | min 1 | day.js:54 `while (steps >= perDay)` — БЕСКОНЕЧНЫЙ цикл при ≤ 0 (критично) |
| respawn_days | Респаун групп (дн.) | int | min 1 | |
| dungeon_memory_days | Память подземелья (дн.) | int | min 1 | |
| level_delta_max | Разброс уровня мобов (±) | int | **min 0** | ОТКЛОНЕНИЕ ТЗ (≥1): тест L175–180 пиножит 0 валидным |
| points_per_level | Очков за уровень | int | min 1 | |
| move_interval_ms | Интервал шага (мс) | int | min 60, max 10000, step 20 | 60 = MIN_MOVE_INTERVAL_MS (motion.js L134) — ЛИТЕРАЛ, синхронизация комментарием + структурным под-ассертом S2; 10000 — «разумный максимум» (ТЗ не задало) |
| combat_difficulty | Сложность | enum | options: 'combat_difficulties' (live-ключи) | group 'Сложности боя' |
| combat_difficulties | Сложности боя | nested | subkeys easy/medium/hard → { hp: float positive, damage: float positive } (labels: Лёгкая/Средняя/Сложная; hp/damage — HP/Урон) | group 'Сложности боя' |
| city_channel | Городской канал | nested | subkeys: fbm float [0,1], rarity float [0,1] (step 0.01) | **type_shares НЕ в subkeys — в форму НЕ ИДЁТ** (решение D4) |
| combat_obstacle_min_frac | Препятствия: мин. доля поля | float | [0,1], step 0.01 | |
| combat_obstacle_max_frac | Препятствия: макс. доля поля | float | [0,1], step 0.01 | |
| max_companions | Спутников в отряде | int | min 1 | 0 — дегенеративный «выкл. спутников», ядро под него не проектировалось |
| companion_loyalty | Лояльность спутников | nested | start int [0,100]; paid int min 1; unpaid int min 1; quit_low int [1,99]; quit_high int [1,99]; quit_chance_mid float [0,1] | кросс quit_low<quit_high формой НЕ гоняется (ядро мягко деградирует, companions.js L264–267) |
| companion_refusal | Отказ спутников | nested | base float [0,1]; charisma_per_level float [0,1]; artist_per_level float [0,1] | 0 = «без бонуса» — валидно |
| companion_xp_share | Доля опыта спутников | float | [0,1], step 0.01 | 0 — валидно («не получают», SPEC/000082); **generic min=1 СЛОМАЛ бы долю** (предупреждение 000082) — отсюда явные записи |

**Generic-фолбэк** (ключ БЕЗ записи в META — будущие; внутренняя функция
metaFor, НЕ экспорт; TЗ: «новый ключ НЕ падает»):
* число → 'int' (Number.isInteger) / 'float'; **min = 1 (ТЗ)** — hazard:
  доля < 1 требует ЯВНОЙ записи (прецеденты companion_xp_share,
  combat_obstacle_*);
* строка → 'enum' с options = [текущее значение] (select с одним option —
  писать мусор невозможно; редактируемость — явной записью с options);
* объект (не массив) → 'nested' со subkeys по скалярным листьям (те же
  правила; не-скалярные листья — вне формы);
* массив → только label-строка + сброс объекта (скалярного представления
  нет).
При добавлении ключа в SETTINGS без META тест S1 (META 1:1 с SETTINGS)
ломается ОСОЗНАННО — добавление ключа только с обновлением теста и
метаданных (ТЗ; паттерн ре-пинов 000103/000079/000082).

**DEFAULTS** — `deepFreeze(JSON.parse(JSON.stringify(SETTINGS)))` в момент
загрузки модуля (значения на тот момент = дефолты). deepFreeze — РЕКУРСИВНЫЙ
Object.freeze (вложенные объекты/массивы заморожены — фиксатор S3).
structuredClone НЕ использовать (ТЗ: Node 24/браузеры). Независим от
SETTINGS (глубина клона: DEFAULTS.combat_difficulties !==
SETTINGS.combat_difficulties; направление мутации SETTINGS→DEFAULTS закрыто —
S3/S6).

**clampValue(key, raw)** → `{ ok: true, value, clamped: boolean } |
{ ok: false, reason: string }`.
`key` — топовый ключ ИЛИ DOT-PATH ('combat_difficulties.easy.hp'); мета
берётся по сегментам (запись → subkeys → generic). Чистая: без DOM, без
мутаций, НИКОГДА не бросает.
* int: n = Number(raw); raw = ''/NaN/±Inf/нечисловая строка → { ok:false,
  reason } (НЕ принимается — ТЗ); v = Math.round(n); v < min → min;
  max != null && v > max → max; → { ok, value, clamped }.
* float: то же без round; **positive: true && v ≤ 0 → { ok:false,
  reason } — ОТКАЗ, не кламп** (у (0,∞) «ближайшего допустимого» нет;
  0×HP = поломка боя; альтернатива a1 «кламп в 0.01» ОТКЛОНЕНА); v < min →
  min; v > max → max.
* enum: String(raw) ∈ options (live) → { ok, value }; иначе { ok:false }.
* Нарушение границ — ВСЕГДА «ближайшее допустимое» (clamped: true, заметка
  в UI); мусор — value не принимается (заметка в UI).
* КРОСС-ПОЛЯ (obstacle min≤max; quit_low<quit_high) формой НЕ гоняются:
  ядро мусоростойкое (combat.js L1472–1481: `if (max<min) max=min`;
  companions — мягкая деградация) — осознанно, зафиксировано.

**resetKey(key)** — топовый ключ ИЛИ dot-path: SETTINGS[key] = JSON-клон
DEFAULTS[key] (вложенный объект — ЦЕЛИКОМ; лист — значение). Ссылка на
SETTINGS НЕ меняется.
**resetAll()** — `Object.assign(SETTINGS, JSON.parse(JSON.stringify
(DEFAULTS)))` (формулировка ТЗ: «вложенные объекты целиком»). Ссылка на
SETTINGS — та же (тест: ref === SETTINGS после).

### 2.2 src/ui-tab-settings.js — форма (контракт 000130)

UMD-обёртка — БЕЗ ИЗМЕНЕНИЙ (node: factory(null,null) → { tab }; браузер:
self-registration; «модуль заменяет Game» — game-экспорта НЕТ, как сейчас).
Запись: `{ column: 0, id: 'settings', label: 'Игровые настройки', build }` —
id/label/column ПОБАЙТОВО (пины R2). **render-хука НЕТ** (форма живёт;
ТЗ: «ФОРМА ПЕРЕСОБИРАЕТСЯ ОДИН РАЗ в buildPanel; render() её НЕ трогает» —
живость focus).

build(pane, ctx) — ОДИН раз (buildPanel; toggle: `if (!panel)
buildPanel()` — панель строится один раз за жизнь):
1. **Guard в build (НЕ при загрузке)**: нет G0.GlobalSettings/SETTINGS →
   console.error('src/ui-tab-settings.js: Game.GlobalSettings не найден —
   …') + строка `ctx.el('div', 'cp-itemmeta', 'Настройки недоступны')` +
   return (паттерн 000053: игра не падает). При ЗАГРУЗКЕ — ничего (load-
   чистота: R6, index-order vm { console } БЕЗ DOM — errors.length === 0).
2. Тело: `const body = ctx.el('div', 'cp-set'); pane.appendChild(body);
   ctx.panel._settingsBody = body;` — СВОЁ имя (существующие
   _title/_stats/_invBody/_equipBody/_quickBody/_shopSec/_shopBody/
   _questsBody не трогаются).
3. Генерация из Object.keys(GS.SETTINGS) (порядок ВСТАВКИ) + GS.META
   (единый источник):
   * верхний заголовок `div.cp-section` «Игровые настройки» (существующий
     класс, как в placeholder — сохраняется);
   * плоский int/float → строка `div.cp-setrow`: `span.cp-setlabel`
     (META.label) + `input.cp-setinput` (type='number'; int: step 1;
     float: step из META) + `button.cp-setbtn` «сброс»;
   * enum → строка: label + `select.cp-setinput` (option'ы: value = ключ,
     textContent = label из subkeys || имя; options — LIVE Object.keys(
     SETTINGS[options-имя])) + кнопка «сброс»;
   * **у ВСЕХ контролов и кнопок `dataset.key` = dot-path** (топовый ключ
     или 'combat_difficulties.hard.hp');
   * nested → секция: шапка-строка `div.cp-setrow.cp-sethead` (label +
     `button.cp-setbtn` «сброс» data-key=topKey — сброс ОБЪЕКТА целиком) +
     строки на скалярные листья (label строки = конкатенация label'ов по
     пути, напр. «Лёгкая · HP»);
   * СОСЕДНИЕ ключи с одинаковым непустым META.group → ОДИН подзаголовок
     (имя group): «Сложности боя» = строка select combat_difficulty + 6
     листьев combat_difficulties под одной шапкой (ТЗ дословно); nested
     без явного group — шапка со СВОИМ label («Городской канал»,
     «Лояльность спутников», «Отказ спутников»);
   * **type_shares — НЕ РЕНДЕРИТСЯ** (решение D4);
   * в конце: `button.cp-setbtn.cp-setall` «Сбросить всё»,
     dataset.all='all';
   * значения контролов на сборке: String(SETTINGS[path]) (enum —
     текущее; если его нет в options — добавить option, деградация без
     краха);
   * **СЧЁТЫ (пины)**: 28 контролов = 27 input[type=number] + 1 select;
     33 кнопки = 15 toповых сбросов + 17 leaf-сбросов + 1 «Сбросить всё»;
     32 строки .cp-setrow = 28 контрольных + 4 шапки .cp-sethead.
4. Слушатели — НА ПАНЕ (pane-level), НЕ на panel (пин
   panel.listeners.click.length === 1 intact — контракт 000130 §5):
   * `pane.addEventListener('change', h)` (НЕ 'input' — ТЗ): t = e.target;
     guard t.dataset.key; r = GS.clampValue(t.dataset.key, t.value):
     — r.ok: setByPath(GS.SETTINGS, path, r.value) (мутация НА МЕСТЕ —
       ссылка SETTINGS не меняется); t.value = String(r.value)
       (нормализация клампом — «value переживает render» +
       «соответствует SETTINGS»); r.clamped → заметка;
     — !r.ok: t.value = String(текущее SETTINGS-значение) (restore);
       заметка r.reason.
   * `pane.addEventListener('click', h)`: b = e.target.closest
     ('.cp-setbtn');
     — b.dataset.all: GS.resetAll() + refresh значений ВСЕХ inputs из
       SETTINGS + renderIfAvailable();
     — b.dataset.key: GS.resetKey(key) + refresh inputs этого ключа
       (топовый + листья: prefix 'key.'). **render() НЕ зовётся**
       (ТЗ: render — только у «сбросить всё»).
5. Заметка — ЛЕНИВО: `ctx.panel.querySelector('.cp-notice')` В МОМЕНТ
   СОБЫТИЯ (ядро создаёт notice в buildPanel ПОСЛЕ столбцов — ui.js
   L146–147 — на момент build её ЕЩЁ НЕТ; в стабе querySelector работает) +
   локальный мини-flash: textContent + style.opacity='1' + setTimeout
   (opacity '0', 2500 мс) + clearTimeout предыдущего (closure-переменная).
   .cp-notice — ЕДИНЫЙ ядровой элемент (ТЗ явно называет его; flashNotice
   в ctx НЕ идёт — контракт §4.3). Guard null-узла: значение всё равно
   применяется, заметка пропускается.
6. renderIfAvailable() — ЛЕНИВО в момент вызова:
   `const live = (rootRef && rootRef.Game) || G0 || {};
    if (live.playerUI && typeof live.playerUI.render === 'function')
      live.playerUI.render();`
   — ui.js грузится ПОЗЖЕ вкладочных модулей → В СНАПШОТЕ G0 playerUI НЕТ
   (ловушка 000038); GlobalSettings — снапшот при загрузке ДОСТАТОЧЕН
   (global-settings.js — ПЕРВЫЙ скрипт; объект общий по ССЫЛКЕ через
   Object.assign-цепочку).
7. При загрузке — **НОЛЬ DOM, НОЛЬ require, НОЛЬ RNG, НОЛЬ
   console.error**, НОЛЬ мутаций SETTINGS (000053/000038).

setByPath/getByPath — локальные ЧИСТЫЕ хелперы модуля (split('.'), walk;
неэкспортируемые).

### 2.3 index.html — ТОЛЬКО <style>

Позиция: в существующем блоке .cp-*, ПОСЛЕ правила .cp-tip (L148 `}`) и
ПЕРЕД комментарием «Кнопка полноэкранного режима» (L149). Свой hunk, чужие
правила — НЕ ТРОГАТЬ (000101 тоже добавит свои классы — малый hunk-
конфликт при ребейзе решается объединением). Все цвета — из существующей
палитры файла. Комментарий «Форма игровых настроек (задача 000098)»:

```
.cp-set { margin-top: 4px; }
.cp-setrow { display: flex; align-items: center; gap: 6px; padding: 1px 0; }
.cp-setlabel { flex: 1; font-size: 12px; }
.cp-sethead { margin-top: 8px; font-weight: 700; color: #d8c27a; }
.cp-setinput { width: 76px; background: #101418; color: #e8dcc0;
  border: 1px solid #6b6248; border-radius: 4px; padding: 1px 4px;
  font-size: 12px; }
.cp-setbtn { width: auto; min-width: 24px; padding: 0 6px; height: 20px;
  border: 1px solid #6b6248; border-radius: 5px; background: #2c3040;
  color: #e8dcc0; cursor: pointer; font-size: 11px; }
.cp-setall { margin-top: 8px; }
```
Составных селекторов НЕТ (cssRule-пины — поимённые regex). SCRIPT-ТЕГОВ
НЕТ (тег ui-tab-settings.js L564 на месте; index-order L745–788 +
самоперечисление — зелёные без правок).

### 2.4 Персистентность — SESSION-ONLY (решение ТЗ, ЗАФИКСИРОВАНО)

В сейв НЕ пишутся; после перезагрузки страницы — DEFAULTS; «сбросить
всё» ≡ перезагрузке. save.js, формат сейва v1, round-trip-тесты — НЕ
ТРОГАТЬ. Литерал `saveNow` НЕ появляется в ui-tab-settings.js (существующий
скан 000130 по readdirSync ui-tab-*.js подхватит автоматически).
Персистентность (data.settings в сейве, санитайзер по паттернам
000029/000045, round-trip-тесты save.js, versioning 000031) — КАНДИДАТ В
ОТДЕЛЬНУЮ ЗАДАЧУ.

## 3. Ленивые ссылки и guards

* G0 — снапшот ОДИН раз при загрузке (000038): G0.GlobalSettings — ссылка на
  ТОТ ЖЕ объект (общий через всю Object.assign-цепочку) → мутации SETTINGS
  видимы везде. G0.playerUI — НЕТ (ui.js ниже) → только rootRef.Game
  ЛЕНИВО в момент вызова + typeof-guard.
* Guard отсутствия GlobalSettings — ТОЛЬКО в build (не при загрузке).
* Guard .cp-notice — в момент события (может быть null в экзотических
  песочницах → заметка пропускается, значение применяется).
* clampValue/resetKey на dot-path: мета по сегментам; отсутствующий
  сегмент → generic (не throw).
* enum: текущее значение не в options → добавляется option (деградация,
  без краха).
* НИГДЕ не создаётся/не заменяется объект реестра uiTabs и объект
  GlobalSettings (000038-ловушка a3).

## 4. Что важно будущим задачам (из ТЗ-ссылок)

* **000099 (применение на лету — «следующая за этой»)**: ядро
  (day/player/dungeon/main/motion) читает SETTINGS при ВЫЗОВЕ, а не
  снапшотом при загрузке. Фиксаторы 000098, на которые 000099 опирается:
  S6 (SETTINGS — живой объект; DEFAULTS — независим; мутация без
  re-require видна) и то, что форма пишет в ЖИВОЙ SETTINGS (ссылка не
  меняется). Экспортируемые константы-снапшоты ядра (STEPS_PER_DAY и пр.)
  и их тесты — 000098 НЕ ТРОГАЕТ (live-чтение — 000099). main.js
  (MOVE_INTERVAL_MS L58–65) — 000099 правит, 000098 — 0 строк (пересечений
  нет).
* **Кандидат: персистентность в сейв** (отдельная задача): data.settings +
  санитайзер 000029/000045 + versioning 000031. Форма уже пишет значения
  ТОЛЬКО через clampValue/resetKey/resetAll — единая точка контроля,
  санитайзеру достаточно повторить эти правила.
* **Новые ключи SETTINGS** (напр. city_respawn_days — SPEC «Города»,
  000109 P3): ЯВНАЯ запись в META (для долей — НИКОГДА generic min=1) +
  ре-пин ПЕРВОГО deepEqual-теста (паттерн 000103/000079/000082) — форму
  подхватит автоматически (генерация из Object.keys(SETTINGS) + META).
* **Контракт 000130** — АВТОРИТЕТЕН (реестр, запись вкладки, ctx, деградации,
  рецепт): зона 000098 → ui-tab-settings.js; pane-слушатели делегированным
  кликом панели не считаются; ui.js не правится.

## 5. Подводные камни (фиксаторы)

1. **Ловушка .cp-btn**: делегированный click ядра (ui.js L156–195): .cp-btn
   БЕЗ data-act → G.raiseSkill(character, btn.dataset.skill=undefined) —
   кнопка «сброс» с классом .cp-btn стала бы «прокачкой навыка». Классы
   формы — ТОЛЬКО .cp-set*.
2. **Ловушка .cp-itemrow/tr**: клик по строке этих классов → ветка
   flashNotice(tip). Строки формы — .cp-setrow.
3. **panel.listeners.click.length === 1** (ui-panel L695): слушатели формы
   (change+click) — на ПАНЕ, не на панели.
4. **.cp-notice создаётся в buildPanel ПОСЛЕ столбцов** (ui.js L146–147) —
   на момент build её нет → только ленивый querySelector в момент события.
5. **playerUI нет в снапшоте G0** — ui.js грузится ПОЗЖЕ вкладочных
   модулей; доступ при загрузке = undefined (000038).
6. **Load-чистота**: при загрузке — ни DOM, ни console.error (index-order
   vm-тест { console } БЕЗ DOM: errors.length === 0; R6 node-require;
   CHAIN'и ui-panel/ui-skills/npc-hire).
7. **Литерал saveNow** не должен появиться в файле (скан 000130).
8. **steps_per_day ≤ 0 → БЕСКОНЕЧНЫЙ цикл** (day.js:54) — META min 1 +
   clampValue; фиксатор U5.
9. **move_interval_ms < 60 «съедает» «Ловкий шаг»** (motion.js L147–153
   `min(max(60, raw), base)`; memory/000063: «база > 60» — фиксатор) —
   META min 60.
10. **Generic min=1 ломает доли** (companion_xp_share 0.5,
    combat_obstacle_* 0.10/0.20 — предупреждение 000082) — ВСЕ 15 текущих
    ключей — явные записи; generic — только будущие.
11. **Детерминизм/сейвы/RNG**: build — НОЛЬ RNG; apply — мутация SETTINGS
    только по действию игрока; golden-ворота (main-visuals/save-restore/
    city-screen/combat/map) панель не открывают — поток RNG не сдвигается;
    формат сейва v1 без изменений (session-only).
12. **level_delta_max = 0 валиден** — форма с min 1 запрещала бы
    задокументированное значение (тест L175–180).
13. **Техническая правка существующего теста — ОДНА**: L6
    tests/global-settings.test.js — расширить деструктурирование
    (+META, DEFAULTS, clampValue, resetKey, resetAll; в RED-фазе —
    undefined, без throw). ВСЁ ОСТАЛЬНОЕ без правок (CHAIN L264 и CHAIN
    ui-skills L129 уже содержат ui-tab-settings.js — тех. правка 000130).
14. **Параллельная 000101** расширяет tests/ui-panel.test.js (своя
    секция в конец) + <style> — минимальное пересечение, ребейз поглотит
    (append).

## 6. Тесты (RED-план; expectedRedCount = 12)

### tests/global-settings.test.js — секция «000098» (kind: node; конец
файла; обращения к новым символам — ТОЛЬКО в телах тестов)
* **S1** `META — покрывает ВСЕ ключи SETTINGS 1:1 + форма записи` —
  Object.keys(META).sort() deepEqual Object.keys(SETTINGS).sort()
  (ДИНАМИЧЕСКИ — не хардкод: будущие ключи, 000082); у каждой записи —
  label непустая строка, type из домена, min/max — числа при наличии.
* **S2** `META — типы и границы` — steps_per_day {int, min 1};
  move_interval_ms {int, min 60, max — конечное число > min}; структурный
  под-ассерт: src/motion.js содержит 'MIN_MOVE_INTERVAL_MS = 60';
  combat_difficulty — enum, options = Object.keys(SETTINGS.
  combat_difficulties); combat_difficulties — nested: easy/medium/hard,
  у каждого hp/damage float positive; companion_xp_share min 0;
  combat_obstacle_* [0,1]; level_delta_max min 0.
* **S3** `DEFAULTS — frozen глубокий клон, независим` — JSON-roundtrip
  deepEqual DEFAULTS ↔ SETTINGS (паттерн L94–95: кросс-realm);
  Object.isFrozen на DEFAULTS и вложенных (combat_difficulties,
  combat_difficulties.easy, city_channel, companion_loyalty);
  DEFAULTS.combat_difficulties !== SETTINGS.combat_difficulties;
  мутация SETTINGS (t.after) DEFAULTS не трогает.
* **S4** `clampValue — мусор/кламп` — steps_per_day: 0→1, −5→1, 40.6→41
  (round), 'abc'→ok:false, ''→ok:false, NaN→ok:false; move_interval_ms:
  10→60, 1e9→max; combat_difficulty: 'hard'→ok, 'x'→ok:false;
  вложенный 'combat_difficulties.easy.hp': 0→ok:false, −1→ok:false,
  0.7→ok 0.7, 'abc'→ok:false; 'city_channel.fbm': 5→1; мутаций НЕТ
  (чистая).
* **S5** `resetKey/resetAll — DEFAULTS, ссылка SETTINGS не меняется` —
  ref = SETTINGS; steps=9 → resetKey('steps_per_day') → 40;
  combat_difficulties.easy.hp=0.9 → resetKey('combat_difficulties.easy.
  hp') → 0.3; resetKey('combat_difficulties') → вложенное ЦЕЛИКОМ;
  resetAll() → deepEqual DEFAULTS (JSON), SETTINGS === ref,
  SETTINGS.combat_difficulties !== DEFAULTS.combat_difficulties.
* **S6** `SETTINGS — живой объект, DEFAULTS — независим` — мутация без
  re-require видна в экспорте (тот же объект); DEFAULTS не изменился.
  ФИКСАТОР: live-чтение ядра — НЕ ЭТА задача (000099).
* **S7** `браузерный UMD-путь несёт те же экспорты` — loadInSandbox(
  'global-settings.js', { Game: { Marker: 1 } }) →
  sandbox.Game.GlobalSettings.{META, DEFAULTS, clampValue, resetKey,
  resetAll} существуют; Game.Marker сохранён.
* RED-падения: S1/S2/S3 — undefined (META/DEFAULTS не экспортируются);
  S4/S5 — TypeError «not a function»; S6 — DEFAULTS-часть; S7 — undefined
  в браузерном экспорте. НЕ SyntaxError, не срыв файла (существующие 14
  тестов — зелёные).

### tests/ui-panel.test.js — секция «000098» (kind: vm-chain; конец файла)
Лоадер — СУЩЕСТВУЮЩИЙ динамический CHAIN_000130 + loadTabsUi (L1674–1721) —
МЕЖДУ ФАЗАМИ НЕ ПРАВИТСЯ (цепочка уже содержит ui-tab-settings.js).
Локальный расширенный стаб (дублирование стабов принято, ТЗ): copy makeEl +
value/type у элементов; helpers: dispatchChange(el) =
pane.listeners.change[0]({ target: el }), поиск контролов по
findAll(pane, 'input[key]') / 'select[key]' / 'button[key=…]' (matchesSel
поддерживает 'тег[атрибут=значение]').
* **U1** `форма строится ОДИН раз: значения = SETTINGS; введённый value и
  узлы переживают render()` — openPanel → clickTab(лево, 2) (pane
  «Игровые настройки»); 28 контролов (27 number + 1 select), у ВСЕХ
  dataset.key; value каждого = String(SETTINGS[path]) (dot-path);
  select: option'ы = ключи combat_difficulties (3), value =
  SETTINGS.combat_difficulty; ручное input.value='123' (БЕЗ change) →
  G.playerUI.render() → ТОТ ЖЕ узел (референс), value '123' сохранён,
  SETTINGS НЕ изменился; panel.listeners.click.length === 1 (invariant);
  33 кнопки (15 toповых + 17 leaf + 1 «Сбросить всё»).
* **U2** `change → SETTINGS обновлён (кламп); мусор — НЕ принят + заметка`
  — steps '7' → change → SETTINGS.steps_per_day === 7, input.value '7',
  ссылка SETTINGS та же; steps 'abc' → SETTINGS не изменился (40), input
  restore '40', .cp-notice (noticeOf) text ≠ ''; panel.listeners.click.
  length === 1 intact.
* **U3** `«сбросить всё» → inputs = DEFAULTS` — мутации через change
  (вкл. вложенное) → pane.listeners.click[0]({ target: btnAll }) →
  SETTINGS deepEqual DEFAULTS (JSON); ВСЕ inputs = значения DEFAULTS;
  ссылка SETTINGS та же; pane-узел тот же.
* **U4** `«Сложности боя»: select + ровно 6 number редактируемы` — ровно 1
  select (dataset.key='combat_difficulty', options easy/medium/hard) +
  ровно 6 number (dataset.key='combat_difficulties.<d>.hp|damage');
  change select 'hard' → SETTINGS.combat_difficulty === 'hard'; change
  combat_difficulties.hard.hp '0.7' → 0.7; '0' → не принят + заметка.
  (ТЗ-«8 полей» = 7 контролов — расхождение зафиксировано, пиним
  структуру.)
* **U5** `steps_per_day 0/−5 из input → SETTINGS ≥ 1 + заметка` —
  '0' → change → SETTINGS.steps_per_day === 1 (≥ 1), input.value '1',
  заметка ≠ ''; '−5' → ≥ 1. ФИКСАТОР опасности day.js:54 (while
  steps>=perDay — бесконечный цикл при perDay ≤ 0).
* RED-падения: в pane НЕТ input/select/кнопок (placeholder — 2 div) →
  assert по наличию контрола падает.
* Регрессия: 52 существующих теста файла + секция 000130 — БЕЗ ИЗМЕНЕНИЙ;
  полный npm test.

### Верификация RED
`npm test` (≈45 с) → **ровно 12 новых fail** (S1–S7, U1–U5); осмысленные
падения (§6 выше); НЕ SyntaxError/срыв загрузки/падения в чужих файлах.
Итого: 1267 + 12 = 1279 тестов; 1267 pass / 12 fail. Флейк чужого теста —
перепуск `node --test tests/<файл>` + запись в отчёт (прецедент 000130 F3).
GREEN: те же 12 → pass; полный набор зелёный; побайтовые фиксаторы §5 —
без правок.

## 7. План реализации (по файлам, ожидаемая дельта)

1. `src/global-settings.js` — 117 → ~260 (+~145): META (~120, явная
   таблица 15 ключей + subkeys), deepFreeze+DEFAULTS (~15), metaFor +
   clampValue (~60), resetKey/resetAll (~25), строка экспорта, комментарии.
2. `src/ui-tab-settings.js` — 53 → ~230 (+~180): генерация формы (~90),
   handlers change/click (~50), заметка/refresh/renderIfAvailable/get-
   setByPath (~30), комментарии.
3. `index.html` — +~12 строк (style-блок .cp-set*, §2.3).
4. `tests/global-settings.test.js` — 327 → ~480 (+~150): S1–S7 + тех.
   правка L6.
5. `tests/ui-panel.test.js` — 2064 → ~2300 (+~230): секция 000098 (стаб-
   helpers + U1–U5).
6. `memory/000098-game-settings-tab.md` (этот файл) +
   `memory/000098-settings-tab.md`.
7. `tasks/result/000098.md` — отчёт; `tasks/pending/000098.md` →
   `tasks/done/` (коммитом).
8. `CHANGELOG.md` — ОТДЕЛЬНЫЙ коммит: под существующим `## 2026-10-02`
   НОВАЯ секция `### Интерфейс`:
   > **Игровые настройки.** Вкладка «Игровые настройки» в панели
   > персонажа ([I]) стала рабочей формой: шаги за день, респаун групп,
   > память подземелья, разброс уровня мобов, очки за уровень, интервал
   > шага, сложность боя и её множители, параметры отряда и спутников,
   > препятствия поля боя, городской канал. Сброс по ключу и «сбросить
   > всё». Настройки действуют на сессию: после перезагрузки страницы —
   > значения по умолчанию.
   (БЕЗ обещаний live-применения — это 000099; формулировка точна на
   момент мержа 000098.)
9. `src/ui.js`, `src/main.js`, `src/save.js`, `src/motion.js`, `src/day.js`,
   `src/combat.js`, прочие `src/ui-tab-*.js` — **0 строк**.
   `tests/index-order.test.js` — без изменений; `tests/svg.test.js` —
   без изменений (НОВЫХ SVG-ассетов НЕТ — текстовые кнопки/поля).

Коммиты (ветка task/000098): (1) RED — красные тесты (S1–S7, U1–U5) +
тех. правка L6 + memory (красная стадия закоммитит memory вместе с
тестами); (2) GREEN — реализация (global-settings.js, ui-tab-settings.js,
index.html) + отчёт + задача pending→done; (3) CHANGELOG. Первая строка —
«Задача 000098: …» (рус.), последняя — Co-Authored-By: Claude Code
<noreply@anthropic.com>. Пуш — ЗАПРЕЩЁН; .merge-pending — НЕ создавать
(только стадия мержа); основной репозиторий и чужие worktrees не трогать.
