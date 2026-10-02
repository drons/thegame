# 000098 — Вкладка «Игровые настройки»: форма, clamp, session-only (контракт вкладки)

Дополнение к memory/000098-game-settings-tab.md (контракт ядра:
META/DEFAULTS/clampValue/resetKey/resetAll в src/global-settings.js).
Здесь — контракт САМОЙ вкладки (src/ui-tab-settings.js, зона 000098 по
000130). Статус: ПРОЕКТИРОВАНИЕ (2026-10-02, worktree .worktrees/
task-000098, ветка task/000098, база master c9c99d6); после GREEN —
«реализована».

## 1. Что вкладка

Запись реестра Game.uiTabs (контракт 000130):
`{ column: 0, id: 'settings', label: 'Игровые настройки', build(pane, ctx) }`
— ПОБАЙТОВО (пины R2: id/label/порядок в левом столбце).
**render-хука НЕТ** — форма живёт: ТЗ «ФОРМА ПЕРЕСОБИРАЕТСЯ ОДИН РАЗ в
buildPanel; render() её НЕ трогает (иначе потеря focus у пишущего
игрока)» + контракт 000130 §4.4 «settings (нет render)». Фиксатор U1:
введённый вручную value и узлы переживают G.playerUI.render().

## 2. Форма (build — один раз в buildPanel)

* Источник — Object.keys(GS.SETTINGS) (порядок вставки) + GS.META (единый
  источник; генерация — не хардкод строк: будущие ключи подхватываются).
* 15 ключей = **28 контролов (27 input[type=number] + 1 select)** +
  **33 кнопки (15 toповых «сброс» + 17 leaf-«сброс» + 1 «Сбросить
  всё»)** + 32 строки .cp-setrow (28 контрольных + 4 шапки .cp-sethead).
* Строка — `div.cp-setrow`: `span.cp-setlabel` (label из META) +
  `input.cp-setinput` (type=number; int step 1 / float step из META) ИЛИ
  `select.cp-setinput` (enum: option'ы = live-ключи источника) +
  `button.cp-setbtn` «сброс». **У ВСЕХ контролов и кнопок
  `dataset.key` = dot-path** (топовый ключ или 'combat_difficulties.
  hard.hp').
* Секции (nested-ключи): шапка-строка `div.cp-setrow.cp-sethead` (label +
  «сброс» ОБЪЕКТА целиком, data-key=topKey) + строки на скалярные листья
  (label — конкатенация по пути: «Лёгкая · HP»). СОСЕДНИЕ ключи с одним
  META.group — ОДИН подзаголовок: «Сложности боя» = select
  combat_difficulty + 6 листьев combat_difficulties (ТЗ дословно:
  «подстрока «Сложности боя»: select + 3 строки easy/medium/hard по
  hp/damage»).
* **type_shares (city_channel) — в форму НЕ ИДЁТ**: массив пар, связан с
  каталогом 000102 (ровно 4 типа), Σ=1 зафиксирован тестом 000103;
  скалярного представления нет; ТЗ не требует («не больше ТЗ»);
  восстанавливается «сбросом» объекта city_channel.
* Значения на сборке — String(SETTINGS[path]) (enum — текущее; если его
  нет в options — option добавляется, деградация без краха).
* Тело — `div.cp-set`, `ctx.panel._settingsBody` (своё имя; чужие _* —
  нетронуты). Верхний заголовок `div.cp-section` «Игровые настройки»
  (как в placeholder) сохраняется.
* Placeholder 000130 («настройки появятся позже») — заменяется; тестовых
  пинов его текста НЕТ (проверено grep'ом).

## 3. Apply — по 'change', слушатели на ПАНЕ

* `pane.addEventListener('change', h)` — ЕДИНСТВЕННЫЙ канал apply (НЕ
  'input' — ТЗ). r = GS.clampValue(t.dataset.key, t.value):
  * ok → setByPath(GS.SETTINGS, path, r.value) (мутация НА МЕСТЕ; ссылка
    на SETTINGS НЕ меняется) + t.value = String(r.value) (нормализация
    клампом); clamped → заметка;
  * !ok → t.value = String(текущее SETTINGS-значение) (restore) +
    заметка r.reason.
* `pane.addEventListener('click', h)` — `e.target.closest('.cp-setbtn')`:
  * dataset.key → GS.resetKey(key) + refresh значений inputs этого
    ключа (топовый + листья: prefix 'key.'). **render() НЕ зовётся**
    (ТЗ: render — только у «сбросить всё»);
  * dataset.all → GS.resetAll() + refresh ВСЕХ inputs + renderIfAvaila-
    ble().
* Слушатели — НА ПАНЕ (pane-level), НЕ на панели: пин
  panel.listeners.click.length === 1 (ui-panel L695) intact — контракт
  000130 §5 «pane-уровневые слушатели делегированным кликом панели не
  считаются».
* Заметка — в ЕДИНЫЙ ядровой `.cp-notice` (ТЗ явно), ЛЕНИВО
  `ctx.panel.querySelector('.cp-notice')` в момент события (создаётся в
  buildPanel ПОСЛЕ столбцов — на момент build НЕТ) + локальный мини-
  flash: textContent, opacity '1', setTimeout(opacity '0', 2500 мс),
  clearTimeout предыдущего. flashNotice в ctx НЕ идёт (контракт 000130
  §4.3) — свой мини-flash, ядро не правится.
* **Классы ТОЛЬКО .cp-set\***: кнопки НЕ .cp-btn (делегированный click
  ядра: .cp-btn без data-act → G.raiseSkill(character, undefined) —
  «сброс» стал бы прокачкой навыка) и строки НЕ .cp-itemrow/tr (ветка
  flashNotice(tip)).
* renderIfAvailable() — ЛЕНИВО: `((rootRef && rootRef.Game) || G0 || {})
  .playerUI` + typeof-guard (ui.js грузится ПОЗЖЕ вкладочных модулей — в
  снапшоте G0 playerUI НЕТ, ловушка 000038; GlobalSettings — снапшот
  достаточен, объект общий по ссылке).

## 4. Кламп (ядро: clampValue — контракт в 000098-game-settings-tab.md §2.1)

* Вне диапазона → БЛИЖАЙШЕЕ допустимое (int: Math.round → [min, max]) +
  заметка; input нормализуется к принятому значению.
* Мусор (NaN, '', нечисловая строка, ±Inf) → value НЕ принимается
  (restore) + заметка (ТЗ).
* combat-множители (positive: true) ≤ 0 → **ОТКАЗ** (не кламп: у (0,∞)
  «ближайшего» нет; 0×HP = поломка боя).
* enum — только из live-options.
* Критичные границы: **steps_per_day min 1** (≤ 0 — БЕСКОНЕЧНЫЙ цикл
  while в day.js:54 — зависание игры); **move_interval_ms [60, 10000]**
  (60 = MIN_MOVE_INTERVAL_MS motion.js — ниже «съедает» «Ловкий шаг»,
  memory/000063; 10000 — «разумный максимум», решение); доли [0,1];
  level_delta_max min 0 (0 — валидно, тест).
* Кросс-поля (obstacle min≤max, quit_low<quit_high) — формой НЕ
  гоняются: ядро мусоростойкое (combat.js: max<min → max=min;
  companions — мягкая деградация).

## 5. Персистентность — session-only (решение ТЗ, ЗАФИКСИРОВАНО)

* В сейв НЕ пишутся; save.js / формат v1 / round-trip-тесты — НЕ ТРОГАТЬ.
* После перезагрузки страницы — DEFAULTS; «сбросить всё» ≡ перезагрузке.
* Литерал `saveNow` НЕ появляется в файле (скан 000130 по readdirSync
  подхватит).
* Персистентность (data.settings в сейве, санитайзер по паттернам
  000029/000045, versioning 000031) — КАНДИДАТ В ОТДЕЛЬНУЮ ЗАДАЧУ.

## 6. Деградация и чистота

* Без Game.GlobalSettings (guard в build, НЕ при загрузке):
  console.error + строка «Настройки недоступны» (cp-itemmeta) + return —
  игра не падает (паттерн 000053).
* При загрузке — НОЛЬ DOM, НОЛЬ require, НОЛЬ RNG, НОЛЬ console.error,
  НОЛЬ мутаций SETTINGS (R6 node-require; index-order vm { console }
  БЕЗ DOM — errors.length === 0; CHAIN'и ui-panel/ui-skills/npc-hire).
* UMD-обёртка 000130 — без изменений: node-ветка factory(null,null) →
  { tab }; браузер — self-registration; game-экспорта НЕТ.

## 7. Важно для будущих задач

* **000099 (live-применение)**: форма пишет в ЖИВОЙ SETTINGS (ссылка не
  меняется) — ядру достаточно начать читать при вызове; фиксатор S6
  (SETTINGS live / DEFAULTS независим). До 000099 ядро читает снапшоты
  при загрузке — вкладка «меняет значения, которые ядро видит только
  после перезагрузки» (формулировка ТЗ; в CHANGELOG 000098 live-эффект
  НЕ обещается).
* **Кандидат персистентности**: единственная точка записи —
  clampValue/resetKey/resetAll → санитайзеру сейва достаточно повторить
  правила META.
* **Новые ключи SETTINGS**: форма подхватит автоматически; для долей —
  ЯВНАЯ запись в META (generic min=1 их ломает — 000082).
