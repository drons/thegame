# 000210 — Бой: подтверждение побега («Вы точно хотите сбежать?»)

Станция «Проектирование» (2026-10-14). Worktree:
`/home/sas/Documents/Art/thegame/.worktrees/task-000210`, ветка
`task/000210`. База worktree = **df70297** (красный/зелёный цикл —
ВСЁ на этой базе). ТЗ (source of truth, tasks/pending/000210.md,
source — ДВЕ строки):

> В бою при нажатии на кнопку "сбежать" задавать пользователю вопрос
> "Вы точно хотите сбежать?" и две кнопки, красная "да" и зелёная "нет".

Анализы: /tmp/thegame-wf-000210/{a1-domain.md, a2-arch.md,
a3-tests.md}. Расхождения a1/a2/a3 разрешены в §1 (арбитр — код
worktree, сверено прямым чтением):

* размещение — a1/a2 (`.combat-box`) vs a3 (ребёнок корневого
  оверлея): **выбран a1/a2 (Д2)** — a3-вариант ломает геометрию
  (центр оверлея ≠ центр canvas);
* элемент кнопок — a1 (div) vs a2/a3 (`<button>` лениво): **выбран
  a1 (Д3)** — `<button>` ломает/искажает 6 кнопочных пинов и требует
  правки общего стаба;
* клавиша F — a1 (F без изменений) vs a2/a3 (F — тот же confirm):
  **выбран a2/a3 (Д4)** — кнопка = зеркало клавиши, F-обход
  обнуляет смысл подтверждения;
* модалность — a1 (non-modal pass-through) vs a2/a3 (модал):
  **выбран a2/a3 (Д7)** — Space/атака под открытым вопросом
  сжигают ход — ровно та небрежность, от которой ТЗ защищает;
* Escape — a2 (Escape = «нет») vs a3 (Escape — как сейчас):
  **выбран a3 (Д8)** — прецедент 000196 Д7: «Escape закрывать НЕ
  добавляем… менять поведение не в ТЗ».

**Базовый npm test (df70297 = база worktree, этот worktree, ОДИН
прогон, git status чист): 2386/2386 pass, 0 fail** (139 c, exit 0).
Master на момент Проектирования ушёл в **14ab048** (смержен
000212: dungeon hud — файлы дизъюнктивны с нашими, кроме CHANGELOG
2026-10-14 «Интерфейс», куда добавился буллет 000212) — rebase
перед мержем ОБЯЗАТЕЛЕН (§6 п. 10).

В полёте (чужие worktrees, не пересекаться): 000194 (быстрые
предметы поверх боя — тот же CSS-регион index.html и тот же
combat-ui.js build/render/handleCode), 000205 (XP в combat.js —
ядро, не трогаем), 000212 (смержен, см. выше), 000213 (drawUnits
рамка — canvas-функция combat-ui.js L951-1293, наши ханки дизъюнктивны).

Все контракты §1–§4 сверены с кодом worktree (df70297) прямым
чтением; ВСЕ номера строк — по базе **df70297** (после rebase
смещаются — сверять по content-маркерам, §6 п. 10).

---

## 1. Решения станции Проектирование (каждое — с причиной)

| # | решение | почему |
|---|---|---|
| Д1 | **НОВОГО МОДУЛЯ НЕТ, НОВОГО `<script>` НЕТ.** Вся логика — в src/combat-ui.js; CSS — только боевой скоуп index.html. ЯДРО src/combat.js, combat-keys.js, main.js, save.js, SPEC — БЕЗ ИЗМЕНЕНИЙ | combat-ui.js — владелец боевого DOM, G-снапшот уже снят (G.canDoAction/G.CombatKeys доступны); прецедент 000196 (оверлей «поверх экрана боя» живёт там же); новый UMD-модуль = новый load-order-риск + index-order-пин + деградация-ветка + подхват ВСЕМИ полными vm-цепочками — ничего из этого ТЗ не требует; механика побега (шанс `clamp(0.45+0.03·(lvl−avg)+0.02·dex, 0.25, 0.9)`, бросок c._rng, сжигание хода при провале, строки «Вы сбежали из боя.»/«Сбежать не удалось!») — БИТ-В-БИТ, confirm — чистый UI-гейт перед ней |
| Д2 | **Размещение: `.combat-flee-confirm` — 3-й ребёнок `.combat-box`: `[canvas, .combat-spellbook, .combat-flee-confirm, .combat-banner]`** (append ПОСЛЕ `box.appendChild(bookBox)`, ПЕРЕД `box.appendChild(bannerEl)`); единственный существующий ломаемый тест — технический ре-пин CU196-POS (3→4 ребёнка, §4.1) | (а) геометрия: banнер/книга центрируются `top/left 50%` ОТНОСИТЕЛЬНО `.combat-box` (position: relative, база L255; box обнимает canvas, canvas центрирован в box → 50% box ≡ центр canvas); a3-вариант (ребёнок КОРНЕВОГО оверлея) центрировал бы диалог ПО ВЬЮПОРТУ: в row — между canvas и панелью (canvas слева, панель справа), в portrait — над панелью, а не над полем; (б) z-порядок: append ПЕРЕД bannerEl → при c.result баннер (клик = finish) СВЕРХУ диалога (finish достижим — 000196 Д6); (в) ре-пин CU196-POS — технический (предмет пина «книга в box ПЕРЕД баннером» сохраняется; прецеденты 000196 Д8, 000148.01); overlay.children НИГДЕ не пинится (grep: city-screen/portal-exit/ui-panel — чужие оверлеи) |
| Д3 | **Кнопки «да»/«нет» — DIV (`div.combat-flee-btn--yes/--no`), строится ОДИН раз в build() (стабильный DOM), скрыт по умолчанию (display 'none'); ленивый DOM ОТКЛОНЁН** | (а) vm-стаб (tests/combat-ui.test.js L81-179): КАЖДЫЙ `createElement('button')` пушится в общий массив `buttons` СРАЗУ (не при append), `querySelectorAll()` ВСЕГО стаба возвращает ЭТОТ МАССИВ независимо от селектора — eager `<button>` ломает 6 пинтов: «7 штук» (L338), L1167, L4249, L5186, L5193, CU182-BTN8 (L5381 === 8), CU182-ORDER (L5751 === 10 + deepEqual dataset.act — у диалоговых кнопок act undefined); (б) lazy `<button>` (a3 D2) — после первого открытия render()-цикл (L1652 `overlay.querySelectorAll('.combat-actions button')` → в стабе ВСЕ кнопки) прогоняет диалоговые кнопки через `G.canDoAction(c, undefined)` → «неизвестное действие» → disabled + чужой title ВТОРОЙ раз — рассинхрон со браузером (селектор их не видит), требующий правки ОБЩЕГО стаба (a3 §5.1); (в) div НЕ виден ни счётчику, ни querySelectorAll-циклу — ПРАВКИ СТАБА НЕТ, пины бит-в-бит; (г) принятый прецедент файла R9/000149 — строки книги (buildSpellRow) — div с click-слушателем; доступностный компромисс (нет focus/:disabled) — тот же, что принят у строк книги |
| Д4 | **ЕДИНАЯ точка входа: thunk 'flee' в runAction (L740) — КНОПКА и KeyF ОТКРЫВАЮТ confirm** (тело: `const r = G.canDoAction(c, 'flee', {targetId: c.targetId}); if (r.ok && !fleeOpen) openFleeConfirm(); return r;` — 1:1-зеркало thunk 'spellbook' L727-736); c.flee() вызывает ТОЛЬКО confirmFlee («да») | (а) инвариант кодабазы «кнопка = зеркало клавиши» (000037 коммент слушателя «Как по клавише: зеркало», 000121 единый путь code→действие, 000178 «клик — allyBtn (зеркало клавиш)»): а1-вариант (спец-кейс `if (item.action==='flee')` в click-слушателе) РАСКАЛЕЧИВАЕТ одно действие на два поведения — F остался бы прямым побегом, обходя защиту, ради которой ТЗ (F — док. клавиша побега, пин tests/combat-keys.test.js L252 «Побег [F]»); (б) ПРОВЕРЕНО: ни один существующий тест не пинит KeyF→мгновенный побег в UI (grep: только табличная запись combat-keys.test.js L251-266 — таблица НЕ меняется); (в) механика/детерминизм/строки — бит-в-бит (ядро не тронуто); (г) отказ по клавише логируется в handleCode (L832-833), по клику — в logRejection runAction (L758) — ровно ОДНА строка на входе (двойного логирования нет: handleCode не вызывает runAction при r.reason); `!fleeOpen` — идемпотентность повторного входа (F-повтор/двойной клик = no-op, лог не растёт) |
| Д5 | **«да» — confirmFlee(c): close → предпроверка → c.flee() → logRejection → render** (паттерн allyBtn/resurrectCast: предпроверка ПЕРВОЙ строкой после закрытия) | (а) стаб-клик/смена состояния между рендером и кликом (white-box) → ровно ОДНА строка причины, действия НЕТ, 0 c._rng — принцип 000037 «причина в журнал, а не тишина»: без предпроверки c.flee() guard'ом вернул бы null → logRejection(null) = ТИШИНА (отклонено); (б) c.flee() напрямую, НЕ через runAction: thunk в runAction ПЕРЕОТКРЫЛ бы диалог (fleeOpen уже false → r.ok && !fleeOpen); (в) двойной «да»: в браузере невозможен (успех → c.result → render-гейт прячет диалог до второго клика; провал → диалог закрыт); в vm — предпроверка → «не ваш ход»/«бой закончен», деградация-отказ, не двойной бросок; (г) c._fx НЕ ставится: ветка flee прежнего кода её не ставила (только 'attack', L771) — бит-в-бит |
| Д6 | **«нет» — closeFleeConfirm(): тихое закрытие — 0 вызовов ядра, 0 c._rng, 0 строк c.log, phase/round/targetId/hp нетронуты** | отмена вопроса ≠ отказ ядра (000037 «не молчим» — про ОТКЛОНЕНИЯ ядра, не про выбор пользователя); зеркало: закрытие книги KeyQ — без строки лога; «не больше ТЗ» (строка не просится) |
| Д7 | **МОДАЛЬНОСТЬ, пока диалог открыт: ВСЁ глотается — клавиши (новая ветка handleCode `if (fleeOpen) return true;` ПОСЛЕ lungeGate-гарда L785, ДО `let consumed`), кнопки панели (one-liner `if (fleeOpen) return;` в ОБЩЕМ click-слушателе табличных кнопок L350 — все 7, включая повторный «Побег»; + тот же one-liner в resurrectCast L2006; + РЕВЬЮ §7: one-liner в allyBtn («Каст»/«Лечение» — в браузере скрыты castHealVis) и castRow (строки книги)), canvas/книга — CSS (контейнер на весь canvas, pointer-events по умолчанию auto — Д9) + РЕВЬЮ §7: JS-гард в canvas-слушателе — vm-обход; в браузере все пути мёртвы)** | (а) вопрос = точка решения: Space под открытым «Вы точно хотите сбежать?» СЖИГАЕТ ход — ровно та небрежность, от которой ТЗ защищает (non-modal a1 отклонён); (b) согласованность всех путей ввода: клавиша/кнопка/canvas ведут себя ОДИНАКОВО (a2-вариант «кнопки панели кликабельны, thunk no-op» — противоречив: атака кликом проходит, атака клавишей — нет); (в) диалог открывается ТОЛЬКО на ходу ИГРОКА (canDoAction 'flee' ok ⇒ checkTurn ok И НЕ ход союзника — allyCanDo 'flee' → «недоступно», combat.js L2253-2256; на ходу моба — «не ваш ход»), и пока он открыт НЕТ действия, сдвигающего очередь (Space/атака/конец хода глотаются) → состояние НЕ МОЖЕТ измениться под диалогом в реальном браузере → c.result под открытым диалогом недостижим (render-гейт Д10 — страховка); (г) gлотание = preventDefault (keydown-слушатель L845-850) — F не прокручивает страницу и т.п.; Escape под диалогом — глотается как любая клавиша (Д8) |
| Д8 | **Escape — НОВОГО поведения НЕТ** (под диалогом — глотается веткой Д7; закрытие — ТОЛЬКО «да»/«нет», дословно ТЗ) | прецедент 000196 Д7 дословно: «Escape закрывать НЕ добавляем; новых клавиш/кнопок закрытия НЕТ… Escape во время боя сейчас ничего не делает — менять поведение не в ТЗ» (a2 «Escape = нет» отклонён как «больше ТЗ»); сейчас Escape в незавершённом бою — consumed=true, видимого действия нет (L787-789) — поведение не меняется |
| Д9 | **CSS: контейнер — НА ВЕСЬ CANVAS (формула canvas 1:1, row И portrait), absolute-центр box, фон rgba(10,12,16,0.85), radius 8px, flex-column-center, gap 18px; pointer-events НА КОНТЕЙНЕРЕ НЕ ОБЪЯВЛЯЕТСЯ (auto — клики не проходят в canvas: модал-подложка); кнопки — геометрия/цвета start-window (000138)** | (а) size-canvas = тот же паттерн, что баннер/книга (000196 Д2) — 1:1 с полем, центрирование 50%/50% box ≡ центр canvas в обеих ориентациях; (б) pointer-events: none (pass-through книги 000196 Д3) здесь ПРОТИВОПОЛОЖЕН — диалог МОДАЛЕН (Д7): подложка должна есть клики по canvas (выбор цели) и лежать СВЕРХУ строк открытой книги (DOM-порядок: confirm ПОСЛЕ bookBox в box → при полном совпадении геометрии верхний = confirm; строки книги неотклиkaемы под диалогом — книга «заморожена», без JS-гардов); (в) цвета — ТОЛЬКО существующие пары старт-окна (index.html L808-821): да = #d9483b/#fff, hover #e65f52 (.start-window-btn--restart); нет = #6fdc6f/#101418, hover #8bf58b (.start-window-btn--continue); рамка #6b6248 (.combat-actions/.start-window-btn), вопрос #e8dcc0 (текст .combat-overlay), фон = фон баннера; «новых цветов не вводим» (000038/000084); (г) min-width 64px (НЕ 220px старт-окна: в portrait canvas = 308px при 390×844 — 2×220+24 gap не влезает; 2×(64+56 padding)+24 = 264 ≤ 308); gap 18px (question→ans) / 24px (между кнопками) — 1:1 .start-window-confirm/.start-window-ans |
| Д10 | **Видимость — ОДИН render-гейт (после renderBook, L1687): `fleeBox.style.display = (fleeOpen && !c.result) ? '' : 'none'`** (паттерн книги: display выводится из состояния в render, rAF-tick идемпотентен) | display — производная состояния, единая точка (никаких расхождений «флаг true, а div hidden»); `!c.result` — страховка: white-box c.result под открытым диалогом → диалог прячется, баннер (клик = finish) достижим; в браузере c.result под диалогом недостижим (Д7 в) — гейт никогда не срабатывает в живом потоке, но делает рендер тотальным |
| Д11 | **Состояние: `let fleeBox = null; let fleeOpen = false;` (closure, рядом с bookBox L172-173) + resets в 3 точках: build() (fleeOpen=false при пересборке), finish() (рядом с bookBox L2171-2173), catch startCombat (L2337-2339)** | паттерн bookBox 000149/000196 один в один: UI-состояние — closure (НЕ поле c — боевые юниты в сейв не попадают, 000085/000143; 0 новых полей c, 0 новых c._rng — потоки детерминизма бит-в-бит); обе точки сброса (D5b 000170) — finish И catch |
| Д12 | **Тексты дословно из ТЗ: вопрос «Вы точно хотите сбежать?», кнопки «да»/«нет» (СТРОЧНЫЕ), порядок «да»→«нет»** | ТЗ — source of truth, текст в кавычках; a3-капитализация «Да»/«Нет» (прецедент BUTTONS старт-окна) отклонена: старт-окно — другой контекст (там BUTTONS.yes/no — константа), ТЗ 000210 пишет строчные — пины строчные (a1 D7/a2 D6 согласны) |
| Д13 | **Новых SVG-ассетов НЕТ** (текстовые кнопки; иконок ТЗ не требует) — tests/svg.test.js не трогается | прецедент: старт-окно — текстовые кнопки; ТЗ называет только цвет и текст |
| Д14 | **SPEC/не менять** (UI-only; слов «сбежать/побег/flee» в spec/*.md нет; spec/companions.md «побег — только игрок» — правда НЕ меняется: confirm — вопрос UI, механика (шанс/RNG/сжигание хода) идентична) | прецеденты UI-only без правок спеки: 000149/000171/000178/000196/000199; wording-пины (spec-combat-wording и др.) не задеты |
| Д15 | **CHANGELOG — в ОДИН финальный коммит** (не отдельный); буллет в `## 2026-10-14` → `### Интерфейс` — ПОСЛЕ rebase, append ПОСЛЕ последнего буллета секции (после rebase там будет буллет 000212) | CLAUDE.md «финально оформлена в виде одного коммита, содержащего все изменения» > станционное «отдельный коммит CHANGELOG» (прецедент 000196 Д11; приоритет зафиксирован 000193.02 §7); игрок-видимое изменение управления — упоминание обязательно; программная часть не перечисляется. Текст: `- **Побег — с подтверждением.** В бою кнопка «Побег» (или клавиша [F]) задаёт вопрос «Вы точно хотите сбежать?»: красное «да» — побег, зелёное «нет» — остаться.` |

## 2. Контракты и границы (что где после задачи)

### 2.1 DOM (src/combat-ui.js, build())

* `.combat-box` — дети в порядке append: **`[canvas, .combat-spellbook,
  .combat-flee-confirm, .combat-banner]`** (было 3, стало 4).
* Дерево панели (строится ОДИН раз в build(), между созданием bookBox
  и append'ом bannerEl; стабильный DOM — урок 000149: пересоздание
  убивает клик):

  ```
  div.combat-flee-confirm            (style.display='none' с рождением)
  ├── div.combat-flee-question       textContent «Вы точно хотите сбежать?»
  └── div.combat-flee-ans
      ├── div.combat-flee-btn.combat-flee-btn--yes   textContent «да»
      │     click → confirmFlee(c)
      └── div.combat-flee-btn.combat-flee-btn--no    textContent «нет»
            click → closeFleeConfirm(); render()
  ```

  Классы — kebab-case 3-составные (паттерн .combat-spellbook/
  .combat-banner/.combat-mpbar); a2-однословное «fleeconfirm»
  отклонено. dataset.act у кнопок НЕТ (не действия ядра; в
  querySelectorAll-цикле render не участвуют — div, Д3).
* Состояние: `fleeBox`/`fleeOpen` (closure, блок переменных после
  bookBox L172-173). Видимость — render-гейт (Д10). Открывает:
  ТОЛЬКО thunk 'flee' runAction (кнопка/KeyF), гейт —
  `G.canDoAction(c,'flee',{targetId:c.targetId}).ok && !fleeOpen`.
* Функции (вставка ПОСЛЕ allyBtn L2070, ПЕРЕД блоком renderBook
  L2072 — ханк после стабильного хвоста 000178, ре-бейз-гигиена
  000171 §8.2):
  * `openFleeConfirm()` — `fleeOpen = true;` (render НЕ внутри —
    вызывающий рендерит: слушатель кнопки «render() после
    runAction», handleCode — `if (consumed) render()`; паттерн
    toggleBook).
  * `closeFleeConfirm()` — `fleeOpen = false;` (идемпотентна;
    render — у вызывающего).
  * `confirmFlee(c)` — Д5: `closeFleeConfirm(); const chk =
    G.canDoAction(c, 'flee', { targetId: c.targetId }); if (!chk.ok)
    { logRejection(c, chk); render(); return; } logRejection(c,
    c.flee()); render();`
* Точки входа/гарды (изменённые):
  * thunk 'flee' в runAction (L740) — Д4 (заменяет `() => c.flee()`);
  * click-слушатель табличных кнопок (L350-355) — ПЕРВАЯ строка
    `if (fleeOpen) return;` (модал-гейт всех 7, Д7);
  * handleCode (L782-843) — ПОСЛЕ `if (ctx.lungeGate && !c.result)
    return false;` (L785) ДО `let consumed = true`: `if (fleeOpen)
    return true;` (Д7; ПОРЯДОК фиксирован: lungeGate-гард →
    fleeOpen-ветка — lungeGate прячет весь оверлей, при нём ввод и
    диалог недоступны; ре-бейз-конфликт — сохранить этот порядок);
  * resurrectCast (L2006) — ПЕРВАЯ строка `if (fleeOpen) return;`
    (Д7; cast/heal — НЕ трогаем: на ходу игрока скрыты, на ходу
    союзника диалог неоткрываем → guard мёртв);
  * render() — после `renderBook(c)` (L1687): render-гейт (Д10).
* НЕ ТРОГАЕТСЯ: runAction в целом (только тело thunk 'flee'),
  handleCode-ветки Escape/c.result/KeyH/таблица (ветка ДО всех
  существующих), drawUnits (000213), renderTurnOrder,
  bookBox-механика (bookOpen/toggleBook/renderBook/castRow),
  allyBtn, castRow, resurrectChk, canResurrect, canvas-клик,
  finish-логика (только +2 строки сброса), onEnd/addEfirXp.

### 2.2 CSS (index.html, ТОЛЬКО боевой скоуп, новых комментариев НЕТ)

(а) Row-скоуп — ВСТАВКА ПОСЛЕ правила
`.combat-overlay--combat .combat-spellbook .combat-spellrow`
(L467-469, `pointer-events: auto;`), ПЕРЕД MP-комментарием (L470)
— ОБЯЗАТЕЛЬНО ПЕРЕД portrait-медиа (L536): cssRule
(tests/combat-layout.test.js) берёт ПЕРВОЕ вхождение селектора —
урок 000196 §7:

```css
.combat-overlay--combat .combat-flee-confirm {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  box-sizing: border-box;
  width: min(100vh - 32px, 100vw - 304px);
  height: min(100vh - 32px, 100vw - 304px);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  background: rgba(10, 12, 16, 0.85);
  border-radius: 8px;
}
.combat-overlay--combat .combat-flee-question {
  font: 700 18px ui-monospace, monospace;
  color: #e8dcc0;
  text-align: center;
}
.combat-overlay--combat .combat-flee-ans {
  display: flex;
  gap: 24px;
}
.combat-overlay--combat .combat-flee-btn {
  min-width: 64px;
  padding: 12px 28px;
  border: 1px solid #6b6248;
  border-radius: 10px;
  font: 700 16px ui-monospace, monospace;
  cursor: pointer;
}
.combat-overlay--combat .combat-flee-btn--yes {
  background: #d9483b;
  color: #fff;
}
.combat-overlay--combat .combat-flee-btn--yes:hover {
  background: #e65f52;
}
.combat-overlay--combat .combat-flee-btn--no {
  background: #6fdc6f;
  color: #101418;
}
.combat-overlay--combat .combat-flee-btn--no:hover {
  background: #8bf58b;
}
```

(б) Portrait-медиа — ВСТАВКА ВНУТРИ существующего
`@media (max-width: 640px) and (orientation: portrait)` ПОСЛЕ
portrait-правила книги (L565-568), ПЕРЕД закрывающим `}` (L569):

```css
.combat-overlay--combat .combat-flee-confirm {
  width: min(100vw - 16px, 100vh - 16px - 520px);
  height: min(100vw - 16px, 100vh - 16px - 520px);
}
```

Границы:
* width/height контейнера **зеркалят формулу canvas** (row и
  portrait) — 1:1 с полем (Д9 а); контейнер НАКРЫВАЕТ canvas
  целиком (модал-подложка) и лежит СВЕРХУ книги (DOM-порядок);
* `pointer-events` в правилах диалога **НЕТ** (auto по умолчанию —
  блокирует canvas/строки книги; отличие от книги 000196, где
  pass-through — Д7/Д9; пин ОТСУТСТВИЯ — CU210-CSS-OVERLAY);
* новые правила НЕ ТРОГАЮТ: базу .combat-overlay/.combat-box/
  .combat-side/.combat-banner/.combat-spellbook, правила строк
  .combat-spellrow* (L845+), MP/actcount, чужие оверлеи (стражи
  combat-layout.test.js зелёные);
* z-index НЕ вводится (лестница 000121/000123: .combat-overlay 20
  < #touch-controls 30 — тач-контролы над боевым оверлеем;
  stacking внутри box — порядком DOM, 000196 Д6);
* синтаксис обязан пережить реальный CSS-парсер
  tests/combat-mpbar-css.test.js (CU201-CSS-SELECTORS — comment-
  aware): новых комментариев нет (Д10 000196), `*/`-ловушка
  (000201) снята конструктивно.

### 2.3 Занятое/свободное

* Занято: src/combat-ui.js — L172-173 (переменные), L350 (слушатель),
  L448-464 (build: DOM+append), L740 (thunk), L785 (handleCode),
  L1687 (render-гейт), L2006 (resurrectCast-guard), L2070-2072
  (новые функции), L2171-2173 (finish), L2337-2339 (catch);
  index.html — L469-470 (row-вставка), L568-569 (portrait-вставка);
  tests/combat-ui.test.js — L7180-7189 (ре-пин CU196-POS) + конец
  файла (append CU210-*); tests/combat-layout.test.js — конец файла
  (append CU210-CSS-*); CHANGELOG 2026-10-14 «Интерфейс» (append
  ПОСЛЕ rebase); tasks/pending/000210.md → tasks/done/;
  tasks/result/000210.md (отчёт).
* НЕ ТРОГАЕТСЯ: src/combat.js, src/combat-keys.js, src/main.js,
  src/controls.js, scripts index.html (тегов НЕТ), assets/*,
  spec/*, SPEC.md, tests/index-order.test.js, tests/combat-keys.
  test.js, tests/svg.test.js, tests/combat-mpbar-css.test.js,
  tests/spec-*.test.js, детерминизм-золото (combat.test.js),
  сейвы (save.js), все существующие тесты КРОМЕ ре-пина CU196-POS.

### 2.4 Ленивые ссылки и guards

* Новых модулей НЕТ → новых UMD/снапшотов Game НЕТ (combat-ui.js
  снимает G один раз при загрузке — 000038; все чтения —
  G.canDoAction/G.CombatKeys — уже в снапшоте; G.combatScale/
  motion-паттерны не затрагиваются).
* Деградаций новых НЕТ: confirm — чистый DOM + canDoAction
  (ядро всегда есть); веток console.error нет (нет отсутствующих
  зависимостей).
* 0 новых полей c, 0 новых точек c._rng (UI не бросает — бросок
  ТОЛЬКО в playerFlee по «да» — один бросок, как до), 0 мутаций c
  на «нет»/открытии/закрытии.
* finish()/catch — overlay.remove() снимает DOM вместе с диалогом;
  resets fleeBox/fleeOpen — обе точки (Д11).

## 3. Карта изменений (файлы, операции, Δ)

1. **src/combat-ui.js** (единственный src-файл):
   * L172-173 +: `let fleeBox = null; let fleeOpen = false;` (+2)
   * build(): после блока bookBox (L448-452), append между
     `box.appendChild(bookBox)` (L458) и `box.appendChild(bannerEl)`
     (L464): DOM-дерево §2.1 (~+15, включая `fleeOpen = false;`)
   * L350 click-слушатель: +1 строка `if (fleeOpen) return;`
   * L740: `flee: () => c.flee(),` → thunk Д4 (~+4/−1)
   * L785: после lungeGate-гарда +1 строка `if (fleeOpen) return true;`
   * L1687: после renderBook(c) +1 строка render-гейта
   * L2006 resurrectCast: +1 строка guard
   * L2070-2072: блок openFleeConfirm/closeFleeConfirm/confirmFlee (~+18)
   * L2171-2173 finish / L2337-2339 catch: +2 строки сброса в каждой
   Комментариев НЕТ (CLAUDE.md). Δ ≈ +55/−1.
2. **index.html** — (а) row-блок §2.2(а) ~+40 строк после L469;
   (б) portrait-правило §2.2(б) +4 строки после L568. Δ ≈ +44.
3. **tests/combat-ui.test.js** — (а) РЕ-ПИН CU196-POS (L7180-7189,
   технический): `box.children.length` 3→4; deepEqual →
   `['', 'combat-spellbook', 'combat-flee-confirm', 'combat-banner']`;
   текст-сообщения ассерта — обновить (предмет «книга в box перед
   баннером» сохранён); (б) APPEND В КОНЕЦ 8 тестов CU210-* (§4.1).
   Δ ≈ +300/−4.
4. **tests/combat-layout.test.js** — APPEND В КОНЕЦ 3 пинта
   CU210-CSS-* (§4.2; существующие cssRule/portraitRule). Δ ≈ +110.
5. **memory/000210-flee-confirm.md** — этот файл (новый).
6. **CHANGELOG.md** — буллет Д15 в `## 2026-10-14` → `### Интерфейс`
   (append ПОСЛЕ rebase — после буллета 000212; на базе df70297
   секция содержит spellbook/уровни/строительство). Δ ≈ +4.
7. **tasks/pending/000210.md → tasks/done/000210.md** +
   **tasks/result/000210.md** (краткий отчёт: решения §1, карта §3,
   тесты §4, baseline: развитие 2386 → 2397 (= 2386 + 11 новых),
   после rebase — от факта (master 14ab048: ≈2393 + 11), репины:
   0 семантических / 1 технический (CU196-POS), отклонения
   a3-размещения/F-строгости/Escape-закрытия — §1 Д2/Д4/Д8,
   CHANGELOG-единый коммит — Д15, флейки — по факту). Один коммит:
   первая строка «Задача 000210: БОЙ — подтверждение побега: кнопка
   «Побег» (и клавиша [F]) задаёт вопрос «Вы точно хотите сбежать?»
   (красное «да» / зелёное «нет»); ядро/детерминизм/сейвы — без
   изменений», последний абзац
   `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

Порядок работ: (1) красные (CU210-* vm + CU210-CSS-*) → прогон —
красные падают осмысленно (панели/классов/правил нет; F/клик —
мгновенный побег), остальное зелёное (2386); (2) фикс
(combat-ui.js + index.html) + ре-пин CU196-POS → полный набор
зелёный; (3) memory/CHANGELOG/tasks → `npm test` полный (ОДИН прогон
в worktree — память no-parallel-full-tests); (4) rebase на свежий
master → `npm test` + baseline ОТ ФАКТА + сверить CU196-POS с
фактическими box.children (если 000194/000195 добавят ещё детей);
(5) один коммит.

## 4. Тесты CU210-*

### 4.1 tests/combat-ui.test.js (append в конец; vm; scene84 +
tickSlice + press + findByClass + findCanvas + addMerc84 — ВСЕ
хелперы существующие; c._rng — фиксация () => 0.0 / 0.99 (шанс
побега ≤ 0.9 всегда — детерминированный успех/провал) и
счётчик-обёртка `let rngCalls=0; c._rng = () => {rngCalls++; return 0.5;}`
(паттерн L4138/4993/6267/7014/7378)

| id | RED до фикса | пины |
|---|---|---|
| CU210-POS | ДА (панели нет) | scene84(): box (findByClass 'combat-box') children className deepEqual `['', 'combat-spellbook', 'combat-flee-confirm', 'combat-banner']`; панель найдена ПО КЛАССУ (findByClass, не по позиции — устойчивость к ре-пинам 000194/000195); display 'none' по умолчанию; children[0] .combat-flee-question textContent «Вы точно хотите сбежать?»; children[1] .combat-flee-ans — 2 div: [0] className содержит 'combat-flee-btn--yes' textContent «да», [1] 'combat-flee-btn--no' textContent «нет»; `S.buttons.length === 7` (div не считается стабом — пин не вырос) |
| CU210-OPEN | ДА (клик = мгновенный c.flee: лог/round меняются, панели нет) | scene84() + счётчик rng: n0=log.length, round0=c.round; клик `buttons.find(act==='flee').listeners.click[0]()` → display ≠ 'none'; c.result null; c.phase 'player'; c.round === round0; c.log.length === n0; rngCalls === 0 (ход не сгорел); S.G.activeUnitId(c) === 'player'. Суб: СВЕТЛАЯ сцена84 → press(keydown, 'KeyF') → display ≠ 'none', те же 6 ассертов (F — тот же confirm, Д4) |
| CU210-NO | ДА (кнопки нет) | открыт (клик flee); снимок {log.length, phase, round, targetId, player.hp, hp каждого u}; клик «нет» (ans.children[1].listeners.click[0]()) → display 'none'; снимок БИТ-В-БИТ; rngCalls 0; лог не вырос (Д6) |
| CU210-YES-OK | ДА | открыт; c._rng = () => 0.0; клик «да» → display 'none'; c.result.outcome === 'fled'; последняя строка лога «Вы сбежали из боя.»; баннер (findByClass 'combat-banner') display 'block', textContent «Вы ушли из боя.»; press(keydown, 'Space') → G.combatUI.isActive() === false (finish — как после победы) |
| CU210-YES-FAIL | ДА | открыт; c._rng = () => 0.99 (выше макс. шанса 0.9); round0; клик «да» → display 'none'; c.result null; лог содержит «Сбежать не удалось!»; c.round === round0+1; c.phase 'player' (волк промахнулся — 0.99, паттерн tests/combat.test.js L497); диалог НЕ открыт повторно |
| CU210-MODAL | ДА (Space = конец хода и т.д.) | открыт; ПО ОЧЕРЕДИ press: 'Space', 'KeyQ', 'KeyJ', 'ArrowUp', 'KeyF', 'Escape' — после КАЖДОЙ: display ≠ 'none' (диалог открыт), log.length и c.round и c.targetId и c.ps и позиции юнитов неизменны, rngCalls 0 (KeyQ — книга не переключилась: bookBox display 'none' до и после); затем клик «нет» → закрыт; затем 'Space' — ход прошёл (round +1 / лог вырос) — ввод НЕ заблокирован навсегда |
| CU210-GATE | ДА (стаб-клик на ходу наёмника сейчас — c.flee() → null-тишина… ПРОВЕРИТЬ: сейчас thunk без предпроверки → logRejection(null) — строки НЕТ → лог НЕ растёт; после фикса — строка) | (a) scene84(); addMerc84(c, G, 3, 5, 'melee', 'Вольк'); волк (3,4); press Space → activeUnitId 'a1'; n0; стаб-клик flee-слушателя → c.log.length === n0+1, последняя «недоступно активному персонажу»; display 'none' (НЕ открыт — canDoAction !ok, Д4). (b) светлая сцена: открыт; white-box c.phase = 'mob'; клик «да» → display 'none'; лог +1 «не ваш ход»; c.result null; 0 rng (предпроверка блокирует c.flee — Д5). (c) аналогично c.phase = 'over' → «бой закончен» |
| CU210-RESULT | ДА (сейчас: панели нет → findByClass null; гейт render тоже) | открыт; white-box: c.phase = 'over'; c.result = { outcome: 'fled' }; tickSlice(canvas, rafStubs) (rAF-tick → render) → display 'none' (render-гейт Д10), баннер display 'block' (finish достижим) |

### 4.2 tests/combat-layout.test.js (append в конец; статика;
существующие cssRule/portraitRule)

| id | RED до фикса | пины |
|---|---|---|
| CU210-CSS-OVERLAY | ДА (правила нет) | cssRule('.combat-overlay--combat .combat-flee-confirm'): position 'absolute', top/left '50%', transform 'translate(-50%, -50%)', box-sizing 'border-box', width === width row-canvas (`.combat-overlay--combat .combat-box canvas`, зеркало формулы 1:1), height === то же, display 'flex', flex-direction 'column', align-items 'center', justify-content 'center', background === background `.combat-banner` === 'rgba(10, 12, 16, 0.85)', border-radius '8px'; **`'pointer-events' in d === false`** (отсутствие — модал-подложка, Д9) |
| CU210-CSS-BTN | ДА | --yes: background '#d9483b', color '#fff'; '--yes:hover': background '#e65f52'; --no: background '#6fdc6f', color '#101418'; '--no:hover': background '#8bf58b'; .combat-flee-btn: border '1px solid #6b6248', border-radius '10px', padding '12px 28px', cursor 'pointer', font содержит 'ui-monospace'; .combat-flee-question: font-size '18px', font-weight '700', color '#e8dcc0'; .combat-flee-ans: display 'flex', gap '24px' (ТЗ «красная/зелёная» наблюдаемо ТОЛЬКО здесь — vm CSS не применяет) |
| CU210-CSS-PORTRAIT | ДА | portraitRule('.combat-overlay--combat .combat-flee-confirm'): width === width portrait-canvas ('min(100vw - 16px, 100vh - 16px - 520px)'), height === то же |

Ожидаемо красных до фикса: **11** (8 vm + 3 CSS) — все осмысленные
(отсутствие DOM-панели/классов/CSS-правил; F/клик — мгновенный
побег). Весь остальной набор (2386) — зелёный. Стражи, обязанные
пройти БЕЗ правок: «7 штук» (L338/1167/4249/5186/5193), CU182-
ORDER/BTN8, 000168-UI-2 (disabled/title flee на ходу наёмника —
render-цикл не тронут), KeyQ/KeyR-toggle (CU196-POS — после
ре-пина), SB1-SB14, CU166/CU171/CU179/CU188/CU193*/CU199*,
CU201-CSS-* (TRACK/MIRROR/SELECTORS), стражи combat-layout
(320px/170px/4 колонки/dungeon-270px), svg.test.js (ассетов нет),
index-order.test.js (тегов нет), spec-*.test.js (spec не тронут),
детерминизм-золото (combat.test.js: «побег: успех завершает бой,
провал сжигает ход» L497, canDoAction 'flee' L1406, golden по seed),
полные vm-цепочки (main-visuals/save-restore/resurrect-e2e/
mob-chase-e2e/lunge-visibility-e2e/portal-exit-e2e и др. — новых
скриптов нет → цепочки бит-в-бит).

## 5. Что важно будущим задачам

1. **Паттерн «подтверждение опасного действия в бою» (для будущих
   задач-аналогов)**: диалог-подтверждение в боевом оверлее —
   `.combat-box` (size-canvas, absolute-центр, фон баннера, append
   ПЕРЕД bannerEl), МОДАЛЕН (ветка handleCode + guard'ы кнопок +
   pointer-подложка), кнопки — DIV (не <button> — кнопочные пины
   стаба), состояние — closure + render-гейт, «да» — предпроверка
   canDoAction + прямое действие ядра (НЕ через runAction — иначе
   thunk переоткроет), «нет» — тихое закрытие. Отличие от
   start-window (000138): боевой скоуп, модал-подложка на canvas,
   div-кнопки, один вопрос (не createConfirmFlow-машина).
2. **CU196-POS теперь пинит 4 детей box**: следующая задача,
   добавляющая оверлей в `.combat-box` (000194/000195 — «поверх
   экрана боя»), ре-пнёт его ТЕХНИЧЕСКИ (как здесь) и допишет свой
   класс в deepEqual — порядок append: книга → flee-confirm → … →
   баннер (баннер ВСЕГДА последним в box — finish достижим, 000196
   Д6).
3. **F-клавиша = зеркало кнопки — ИНВАРИАНТ**: если будущее ТЗ
   поведёт действие «и по кнопке, и по клавише» — менять поведение
   ОБА вхождения (thunk в runAction — единственная точка);
   расхождение (кнопка спрашивает, клавиша — нет) — антипаттерн
   (Д4).
4. **render-цикл `overlay.querySelectorAll('.combat-actions button')`
   (L1652) в vm-стабе возвращает ВСЕ кнопки песочницы** — новые
   `<button>` в бою (если когда-нибудь понадобятся) обязаны быть
   либо в .combat-actions с валидным dataset.act, либо ломать 6
   пинтов; div-кнопки (как строки книги/этот диалог) — безопасный
   путь.
5. **SPEC** — подтверждение побега в spec НЕ закреплено (UI-деталь);
   механика побега (шанс/RNG/сжигание) — в spec/companions.md
   «побег — только игрок» — НЕ менялась; если ревью потребует
   зафиксировать — буллет в spec/companions.md + re-pin
   SPEC_FILE_LINES В ТОМ ЖЕ коммите.

## 6. Подводные камни

1. **cssRule = ПЕРВОЕ вхождение селектора в файле** (tests/combat-
   layout.test.js L34-48; урок 000196 §7): row-правило
   .combat-flee-confirm ОБЯЗАНО стоять ПЕРЕД portrait-медиа —
   вставка после L469 (до L536) это гарантирует; portrait-правило
   читается только portraitRule (медиа-тело). При rebase, если
   000194 добавит СВОЙ блок в тот же регион — проверить, что наше
   row-правило осталось ПЕРВЫМ вхождением.
2. **vm-стаб не применяет CSS** — «красная/зелёная» наблюдаема
   ТОЛЬКО CSS-пинтами (CU210-CSS-BTN); vm-сторона пинит классы
   --yes/--no + тексты. Забыть CSS-пины = ТЗ-цвета не покрыты.
3. **vm-стаб: parentElement НЕТ, querySelectorAll игнорирует
   селектор, buttons — общий массив на createElement** — CU210-POS
   ищет панель ПО КЛАССУ (findByClass, рекурсивный, parent-agnostic
   L303-310), не по позиции/родителю; pointer-events в vm не
   хит-тестится — контракт Д9 закреплён CSS-пинтом.
4. **c.flee() guard'ом возвращает null** (activeUnitId ≠ 'player',
   combat.js L3153-3156) → logRejection(null) — ТИШИНА: без
   предпроверки в confirmFlee (Д5) стаб-клик/white-box дали бы
   молчаливый no-op — предпроверка ОБЯЗАТЕЛЬНА (строка причины).
5. **canDoAction 'flee' на ходу СОЮЗНИКА** — не checkTurn, а
   allyCanDo (диспетч в начале canDoAction L1519-1522) →
   «недоступно активному персонажу» (L2253-2256): диалог
   открывается ТОЛЬКО на ходу игрока (CU210-GATE a пинит).
6. **Порядок ханков handleCode при rebase**: lungeGate-гард (L785,
   000203) → fleeOpen-ветка → `let consumed` → Escape → c.result →
   KeyH → таблица. Если 000194 добавит СВОЮ ветку в handleCode —
   наша ветка идёт ПОСЛЕ lungeGate-гарда, позиция между ветками
   свободна; конфликт — сохранить порядок «lungeGate →
   modality-ветки → остальные».
7. **lungeGate (000203)**: оверлей visibility:hidden +
   pointer-events:none — диалог (внутри оверлея) скрыт/некликабелен
   целиком; handleCode при гейте — return false ДО нашей ветки →
   диалог НЕЛЬЗЯ открыть во время гейта (и нечем: кнопки под
   pointer-events:none) → конфликта состояний нет.
8. **Флейк-протокол**: tests/map.test.js perf «160k tileAt»
   (тайм-бюджет 5000 мс) падает под нагрузкой — одиночный
   `node --test tests/map.test.js` + запись в tasks/result/000210.md
   (паттерн 000153.01 §5.9 / 000196 §6 п. 8). Один полный
   `node --test tests/` на worktree за раз (мутируемый тест 000054
   — память no-parallel-full-tests-in-worktree); после прогона
   `git status --porcelain` пуст.
9. **Никаких push в remote**; основной репозиторий
   /home/sas/Documents/Art/thegame — только для чтения; чужие
   worktrees (.worktrees/*, кроме task-000210) — не трогать;
   .merge-pending — только стадия мержа (не создавать сейчас).
10. **Rebase** (master на момент Проектирования = **14ab048** — 1
    коммит выше нашей базы df70297; к моменту мержа может уйти
    дальше — сверять по факту):
    * 000212 (14ab048, dungeon hud): dungeon-ui.js/hud.js/main.js +
      DH-тесты + CHANGELOG 2026-10-14 — с нашими файлами
      пересечение ТОЛЬКО CHANGELOG (буллет 000212 в той же секции
      «Интерфейс» — наш append идёт ПОСЛЕ него; union-конфликт
      тривиальный).
    * В полёте: 000194 (CSS-регион index.html + combat-ui.js
      build/render/handleCode — union-конфликты разрешать по
      content-маркерам: наш маркер — селектор
      `.combat-overlay--combat .combat-flee-confirm` и строка
      `fleeBox = document.createElement`), 000213 (drawUnits —
      дизъюнктивен), 000205 (combat.js — не трогаем).
    * После rebase: (а) полный `node --test tests/` + baseline ОТ
      ФАКТА (оценка ≈ 2393 + 11 = 2404); (б) сверить CU196-POS:
      фактические box.children — если 000194/000195 добавили детей
      box ПЕРЕД баннером — deepEqual ре-пина пересмотреть ПО ФАКТУ
      (порядок append: canvas, spellbook, flee-confirm, …чужие…,
      banner); (в) сверить, что наше row-правило — ПЕРВОЕ вхождение
      (п. 1); (г) CHANGELOG-буллет — после буллета 000212.
    * Сообщение squash-коммита — от фактов ПОСЛЕ rebase
      (baseline «2386→2397» устаревает — пересчитать от факта,
      паттерн 000196 §9).

## 7. Ревью (2026-10-14)

Станция «Правки по итогам ревью» (2 findings, оба minor).

**Finding 1 — РЕАЛЕН (vm-путь), исправлен.** JS-гарды fleeOpen
стояли только в handleCode, click-слушателе 7 табличных кнопок и
resurrectCast. В vm-песочнице dispatchEvent обходит display:none и
CSS: под открытым диалогом оставались достижимыми allyBtn
(«Каст»/«Лечение»), castRow (строки книги) и клик по canvas.
В реальном браузере все три пути мёртвы (castHealVis прячет
кнопки — диалог открывается только на ходу игрока;
.combat-flee-confirm — модал-подложка на весь canvas, DOM-порядок
над книгой — Д7/Д9); следствие ограничено (каст ≠ endTurn, «да»
предпроверяет canDoAction, дубль c._rng невозможен, краш
невозможен). Фикс по предложению ревьюера (паттерн resurrectCast):
`if (fleeOpen) return;` первой строкой в allyBtn, castRow и
canvas-слушателе — инвариант Д7 «под диалогом ВСЁ глотается»
теперь покрывает ВСЕ JS-точки входа; поведение браузера бит-в-бит
(пути мёртвы). Пин — новый тест CU210-MODAL-VM (красный до
фикса: каст из строки под диалогом тратил ману/закрывал книгу,
canvas-клик менял targetId, «Каст» писал чужую причину).

**Finding 2 — НЕ ДЕФЕКТ, правок нет (зафиксировано для ретро).**
CU210-GATE(a) зациклил смену поведения на vm-только пути: клик
«Побег» при активном СОЮЗНИКЕ (vm-dispatch; в браузере кнопка
disabled — 000168-UI-2) до задачи — c.flee() → null → тишина;
после — строка «недоступно активному персонажу» в лог. Осознанное
последствие Д4: кнопка — зеркало клавиши [F], которая пишет ЭТУ
ЖЕ строку с 000037/000048 (handleCode → r.reason) — одна причина
— одно поведение; прежнюю тишину не фиксировал ни один тест
(полный набор зелёный). Единственная точка, где vm-поведение
изменилось помимо новой функциональности.

## 8. Finalize (2026-10-14)

Статус: ВЫПОЛНЕНО, задача перенесена pending → done, отчёт —
tasks/result/000210.md (обновлён коммитом Finalize).

* Коммиты ветки — ДВА: aa777fa (реализация + память + CHANGELOG
  + отчёт + перенос) и 5a469be (правки ревью + CU210-MODAL-VM);
  при мерже — squash в один коммит (конвенция проекта).
* Master на момент Finalize = **4e0cbf4** (000205: деление
  опыта между участниками). Rebase task/000210 на 4e0cbf4
  ПРОВЕРЕН на временной ветке (tmp/000210-rebase-check, после
  проверки удалена): **ЧИСТО, 0 конфликтов** (000205 трогал
  src/combat-ui.js — finish()/efirXp, tests/combat-ui.test.js —
  CU1/CU2, CHANGELOG — секция «Игровой процесс»; ханки с нашими
  дизъюнктивны, append-блоки в конце combat-ui.test.js
  авто-union), полный набор на ребейзном состоянии —
  **2417/2417, 0 fail** (master 4e0cbf4 = 2405 + 12 наших:
  11 CU210-* + CU210-MODAL-VM). task/000210 (без rebase) —
  2411/2411.
* Оставшийся риск мержа — 000194 (в работе, быстрые предметы
  поверх боя: те же build()/render/handleCode combat-ui.js +
  боевой CSS-скоуп index.html); если смержится до нас —
  rebase стадии мержа может потребовать union-разрешений;
  CU210-* устойчивы (поиск по классу), CU196-POS (children
  .combat-box = 4) ре-пинить только если 000194 добавит детей
  box.
* CHANGELOG — буллет «Побег — с подтверждением» в коммите
  aa777fa (2026-10-14, секция «Интерфейс», ПОСЛЕ буллета
  000212).
* Контракты §1–§4 действительны; номера строк — по базе
  df70297 (§6 п. 10: после rebase смещаются — сверять по
  content-маркерам).
