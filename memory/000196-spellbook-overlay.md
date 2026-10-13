# 000196 — Бой: оверлей списка заклинаний с описаниями по кнопке книги

Станция «Проектирование» (2026-10-13). Worktree:
`/home/sas/Documents/Art/thegame/.worktrees/task-000196`, ветка
`task/000196`. База worktree = **2f707dd** (красный/зелёный цикл —
ВСЁ на этой базе; baseline 2317). На момент финализации Проектирования
master ушёл в **315debe** — смержились 000206, 000203, 000200
(детали ребаза — §6 п. 11). ТЗ (source of truth, ОДНА строка,
tasks/pending/000196.md):

> При нажатии на кнопку книги магии должен возникать список заклинаний
> с их описанием поверх экрана боя.

Анализы: /tmp/thegame-wf-000196/{a1-domain.md, a2-arch.md, a3-tests.md}.
Расхождение a1/a2 (перенос DOM-контейнера в `.combat-box`) vs a3
(CSS-only, `position: fixed; inset: 0` при книге в `.combat-side`)
разрешено в §1 (арбитр — код worktree, сверено grep/чтением):
**выбран вариант a1/a2 (Д1)**.

**Базовый npm test (2f707dd = база worktree, этот worktree, один
прогон): 2317/2317 green** (baseline развития; после ребаза на 315debe
— пересчитать от факта, §6 п. 11). В одном прогоне a3 зафиксирован
флейк perf-бюджета tests/map.test.js «160k tileAt» 5656>5000 мс;
одиночный `node --test tests/map.test.js` — 74/74 (протокол — §6 п. 8).

Уже в master (на момент Проектирования, 315debe): 000206 (инвентарь
z25 — ui.js/main.js, боевой скоуп НЕ тронут), 000203 (lungeGate —
src/combat-ui.js +13 строк, ханки ПОСЛЕ зоны append книги,
взаимодействие — §6 п. 11), 000200 (fullrest — script-тег в body
index.html, буллет CHANGELOG «Игровой процесс», НЕ «Интерфейс»).
В полёте (чужие worktrees): 000191, 000202 — src/combat-ui.js никто
не правит; hot-поверхность мержа — CSS-регион index.html (000194/
000195 — pending, те же формулировки «поверх экрана боя» — паттерн
задаёт эта задача, см. §5).

Все контракты §1–§4 повторно сверены с кодом worktree (2f707dd)
прямым чтением; ВСЕ номера строк в файле — по базе worktree
**2f707dd** (после rebase на 315debe смещаются на +13 в регионах
после L473 — см. 000203, §6 п. 11). Сверено: build()/renderBook/
castRow/buildSpellRow (src/
combat-ui.js L172-185/440-480/1855-1960/2085-2116), CSS (index.html
L238-260/395-450/510-545/815-890), CU199-MPBAR-1 (tests/combat-
ui.test.js L6498-6503), хелперы (L1492-1565/2982-3001), 000193.02 §5.2,
CHANGELOG 2026-10-13, 000149 R11.

---

## 1. Решения станции Проектирование (каждое — с причиной)

| # | решение | почему |
|---|---|---|
| Д1 | **ОДНА книга: контейнер `.combat-spellbook` ПЕРЕНОСИТСЯ из `.combat-side` в `.combat-box`** (append ПОСЛЕ canvas, ПЕРЕД `bannerEl`); класс, механика (bookOpen/toggleBook/bookRows/rowChk/castRow/buildSpellRow/renderBook/sig-перестроение/-off/title/закрытие-после-каста/открытость-при-отказе/resets в build/finish/catch) — **БЕЗ ИЗМЕНЕНИЙ** | ТЗ задаёт, ГДЕ возникает список («поверх экрана боя»); список с описаниями уже существует (000149/000193) — дельта = размещение; второй параллельный список = больше, чем просит ТЗ; тот же класс — ~30 `findByClass(…, 'combat-spellbook')` (рекурсивные, parent-agnostic, tests/combat-ui.test.js L291-298) + SB1-SB14 + CU193.* работают без правок; единственный структурный пин (CU199-MPBAR-1) — технический ре-пин (Д8) |
| Д1-отклонение | Отклонён CSS-only-вариант a3 (fixed inset:0, книга остаётся 6-м ребёнком `.combat-side`) | (а) книга НЕ закрывается при c.result (renderBook L2087: display = bookOpen; закрывается только finish() L2169-2171) — fixed-оверлей с z-index:1 рисуется ВЫШЕ баннера результата (position absolute, z auto, внутри `.combat-box`) → результат скрыт за слоем 0.95, finish() некликнебелен; на таче (нет KeyQ) — софтлок; (б) inset:0 накрывает ВСЮ `.combat-side` — при открытой книге 8 кнопок действий недоступны тачем (#touch-controls z30 — только D-pad сверху), закрыть книгу, если каст невозможен (нет маны/все строки -off), нельзя → софтлок; (в) 0.95-фон на всё поле гасит маркеры цели воскрешения (подложка rgba(140,242,252,0.25)) сильнее, чем 0.85-фон на size-canvas; (г) в CSS-плане a3 НЕТ pointer-events вовсе (по умолчанию auto на fixed-контейнере) — в РЕАЛЬНОМ браузере оверлей блокирует ВСЕ клики по canvas: поток 000193.02 «книга открыта → клик по клетке мёртвого союзника → c.targetId» перестаёт работать (vm-тесты это НЕ видят — кликают canvas.listeners.click напрямую, layout/hit-testing в vm отсутствуют); «не ломать существующее поведение» (реальный браузер) важнее, чем «ноль правок тестов» — ре-пин Д8 технический (см. его обоснование), а не семантический. Вывод для 000194/000195 (тот же паттерн): оверлей-список обязан жить в `.combat-box` (size-canvas, pass-through Д3, append ДО bannerEl) |
| Д2 | **Геометрия оверлея = формула баннера (1:1 с canvas), ТОЛЬКО боевой скоуп, только СУЩЕСТВУЮЩИЕ цвета** (текст CSS — в §2) | баннер — прецедент «поверх canvas» проекта (та же формула row `min(100vh - 32px, 100vw - 304px)` и portrait `min(100vw - 16px, 100vh - 16px - 520px)`; canvas центрирован в box в обеих ориентациях → 50%/50% box ≡ центр canvas); inset:0/100% в portrait НЕЛЬЗЯ (box ВЫШЕ canvas, flex 1 1 auto — панель была бы выше поля); рамка НЕ вводится (ни у баннера, ни у resurrect-overlay — минимализм); radius 8px / border-radius — семейство canvas-баннера; overflow-y: auto + padding 10px — 17 заклинаний не вписываются в portrait-квадрат (~374px при 390vw); фон = фон баннера `rgba(10, 12, 16, 0.85)` (существующий; 0.85, а не 0.95 — поле и маркеры цели читаются под открытой книгой, поток 000193.02); правила строк L834-871 БЕЗ ПРАВОК (потомковый комбинатор — не зависят от родителя) |
| Д3 | **Canvas интерактивен при ОТКРЫТОЙ книге: контейнер `pointer-events: none`, строки `pointer-events: auto`** | поток 000193.02 — «книга ОТКРЫТА → клик по клетке мёртвого союзника → c.targetId = d.id» (CU193.02-SEL L6949-6976: press KeyQ → canvas.listeners.click — в реальном браузере контейнер над canvas без pass-through съел бы клик — семантическое ломание существующего поведения); слушатели каста — НА СТРОКАХ → `auto` на строках сохраняет клик-каст; НОВЫХ JS-обработчиков НЕТ (прецедент 000171); осознанный побочный эффект: wheel-скролл списка работает только с курсором НАД СТРОКОЙ (фон прозрачен для событий) — принято (≤17 строк; скролл почти не нужен; не в ТЗ — §6 п. 5) |
| Д4 | **Строка «Воскрешение» в оверлее (кросс-нота memory/000193.02 §5.2) — выполнение СТРУКТУРНО**: оверлей строится тем же `renderBook → rowChk/castRow`; на ходу союзника-носителя rowChk('resurrect') = `G.AllySpells.canCastAllySpell(c, u, 'resurrect', c.targetId)` с СЫРЫМ targetId (stale-цель → -off «нет цели» ДO клика по клетке; клик → sig-смена → перестроение строки); каст — `castRow → castAllySpell` | нулевой новый код: контракт targetId 000193.02 (§2.2/§2.4/§2.5) живёт в ядре ally-spells.js и в rowChk/castRow, которые переносом не меняются; кнопка 000171 / canResurrect / canResurrectPick / маркеры — НЕ ТРОГАЮТСЯ; зафиксировано CU196-SEL |
| Д5 | **Ничего нового: модулей, script-тегов, обработчиков, состояния, точек c._rng, полей сейва, правок ядра, правок SPEC** | оверлей — чистый DOM/CSS внутри существующего combat-ui.js (bookBox); чтение строк — те же canCastSpell/canCastAllySpell; мутации — только существующие runtime-пути (c.targetId — canvas-клик, c._fx/книга — castRow); боевые юниты не сериализуются (000085/000143/000081); расположение UI НЕ закреплено ни в одном spec-файле (spec/companions.md L38-40 — механики/wording-пины; spec/spells.md — модель данных) → правок spec и SPEC_FILE_LINES нет (прецеденты UI-only без правок спеки: 000149, 000171, 000178, 000199) |
| Д6 | **Баннер СВЕРХУ книги при c.result — только порядком DOM** (bookBox в box ДО bannerEl; оба absolute, z auto → позднее в DOM сверху) | при окончании боя с открытой книгой баннер (клик = finish) должен накрывать книгу — иначе finish недостижим; z-index в баннер-правила НЕ вводить (базовое .combat-banner общее с dungeon/NPC — 000124, чужой регион) |
| Д7 | **Закрытие — ТОТ ЖЕ toggle** (кнопка/KeyQ/KeyR); Escape закрывать НЕ добавляем; новых клавиш/кнопок закрытия НЕТ | не больше и не меньше ТЗ («при нажатии на кнопку» — та же кнопка; toggle-семантика 000149 — «не больше»); Escape во время боя сейчас ничего не делает (handleCode L781-841) — менять поведение не в ТЗ |
| Д8 | **ОДИН технический ре-пин: CU199-MPBAR-1** (tests/combat-ui.test.js L6498-6503): из deepEqual `side.children` убрать `'combat-spellbook'` → `['combat-turnorder','combat-hpbar','combat-mpbar','combat-state','combat-actions','combat-log']` | технический, не семантический: предмет теста («mpbar ТРЕТЬИМ, после .combat-hpbar, перед .combat-state») сохраняется полностью; удалённый элемент — ровно тот, что ТЗ перемещает; новая структура закреплена НОВЫМ CU196-POS (deepEqual box.children + side.children) — покрытие не ослаблено, а перенесено; прецедент «осознанный ре-пин» — 000148.01 (3bd25ee); остальных репинов НЕТ (весь набор класс/поведение-ориентирован) |
| Д9 | **Тесты: 4 vm-теста в конец tests/combat-ui.test.js (CU196-POS/DESC/CAST/SEL, scene84 + существующие хелперы) + 3 статических CSS-пинта в конец tests/combat-layout.test.js (CU196-CSS-OVERLAY/NOCAP/PORTRAIT, существующие cssRule/portraitRule)** — детали §4 | vm-красное несёт только размещение (POS) — поведение уже закреплено ~40 зелёными (SB1-SB14, CU166/179/182/188/193/193.01/193.02/199-*); «поверх экрана» в DOM-стабе не наблюдаемо → CSS-текст-пинты (паттерн combat-layout.test.js); новый файл tests/combat-book-overlay.test.js (вариант a3) ОТКЛОНЁН — дублирует хелперы и распиливал бы один набор CU196-* на два файла; comment-aware-стража блока — СУЩЕСТВУЮЩАЯ CU201-CSS-SELECTORS (tests/combat-mpbar-css.test.js) покрывает автоматически, свой парсер не нужен |
| Д10 | **Комментарии (CLAUDE.md, e6fcbab): НОЛЬ новых комментариев в коде** | правило «Не пиши коментарии в коде, но важную информацию записывай в memory/»; устаревший CSS-комментарий index.html L819-825 (описывает УБРАННУЮ секционную конструкцию «контейнер без рамки… в .combat-side между .combat-actions и .combat-log») — УДАЛЯЕТСЯ вместе с заменой правила (его содержание заменено этим файлом; оставлять ложный 7-строчный контракт в hot-регионе нельзя); ВМЕСТО НЕГО новый комментарий НЕ ПИШЕТСЯ; существующие комментарии src/combat-ui.js (шапка L12-19, блок build L448-451 «между .combat-actions и .combat-log (контракт R11)») — НЕ ТРОГАЮТСЯ: расходятся с новым размещением, источник правды — код (git blame + этот файл); урок 000201 (`*/` в комментарии) — снят конструктивно (комментариев нет), стража CU201-CSS-SELECTORS на месте |
| Д11 | **CHANGELOG — в ОДИН финальный коммит**, не отдельный; буллет в `## 2026-10-13` → `### Интерфейс` (append после буллета 000193.02) | CLAUDE.md «финально оформлена в виде одного коммита, содержащего все изменения» > станционное «отдельный коммит CHANGELOG» (прецедент 000193/000193.01/000193.02; 000193.02 §7 зафиксировал приоритет); игрок-видимое изменение (управление/графика) — упоминание обязательно; текст — §3 п. 6 |

## 2. Контракты и границы (что где после задачи)

### 2.1 DOM (src/combat-ui.js, build())

* `.combat-box` (position: relative, база index.html L250) — дети в
  порядке создания: **`[canvas, .combat-spellbook, .combat-banner]`**
  (ранее `[canvas, .combat-banner]`). bookBox создаётся на том же
  месте кода (после `side.appendChild(actions)`), но append — в `box`
  ПЕРЕД `box.appendChild(bannerEl)`.
* `.combat-side` — дети: `['combat-turnorder','combat-hpbar',
  'combat-mpbar','combat-state','combat-actions','combat-log']`
  (книги НЕТ — было 7, стало 6; порядок остальных бит-в-байт).
* Состояние/механика без изменений: `bookBox`/`bookOpen`/`bookSig`
  (closure), `toggleBook`, `bookRows` (G.SpellBook.entriesFor,
  unitOf = activeUnit || c.player — 000193), `spellbookUnitGate`,
  `rowChk` (игрок — G.Spells.canCastSpell; союзник —
  G.AllySpells.canCastAllySpell(c, u, id, c.targetId) — сырой
  targetId; деградации: нет G.AllySpells/G.Spells → 1× console.error
  + строки-фолбэк), `buildSpellRow` (div.combat-spellrow[data-spell]
  + img.combat-spellicon + .combat-spellrow-body > .combat-spellrow-
  top (span.combat-spellname + span.combat-spellmeta «Мана N ·
  Заклинание (Атрибут)») + div.combat-spellrow-desc = каталожное
  «описание»), `castRow` (успех → c._fx cast + книга ЗАКРЫТА; отказ →
  logRejection + книга ОТКРЫТА), `renderBook` (display = bookOpen;
  перестроение ТОЛЬКО при смене сигнатуры — идентичность DOM между
  кадрами, 000149), resets в build()/finish()/catch startCombat
  (bookBox=null, bookOpen=false, bookSig=null — работают и с box-
  родителем).
* Кнопка «Книга заклинаний» (act spellbook, KeyQ primary/KeyR,
  бейдж «int/wis» 000199), canDoAction 'spellbook' (combat.js),
  canResurrect/canResurrectPick/resurrectCast (кнопка 000171) —
  **НЕ ТРОГАЮТСЯ**.

### 2.2 CSS (index.html, ТОЛЬКО боевой скоуп)

Заменённое правило (было секция панели: `flex: 0 1 auto; min-height: 0;
max-height: 40%; overflow-y: auto; margin: 4px 0; padding: 2px 0;`):

```css
.combat-overlay--combat .combat-spellbook {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  box-sizing: border-box;
  width: min(100vh - 32px, 100vw - 304px);
  height: min(100vh - 32px, 100vw - 304px);
  padding: 10px;
  overflow-y: auto;
  background: rgba(10, 12, 16, 0.85);
  border-radius: 8px;
  pointer-events: none;
}
.combat-overlay--combat .combat-spellbook .combat-spellrow {
  pointer-events: auto;
}
```

В существующий `@media (max-width: 640px) and (orientation: portrait)`
(после portrait-правила баннера, L539-542) — ДОБАВЛЕНО:

```css
.combat-overlay--combat .combat-spellbook {
  width: min(100vw - 16px, 100vh - 16px - 520px);
  height: min(100vw - 16px, 100vh - 16px - 520px);
}
```

Границы:
* ширина/высота оверлея **зеркалят формулу canvas** (row и portrait) —
  1:1 с полем, как у баннера (ревью 2026-10-01);
* фон = фон `.combat-banner` (`rgba(10, 12, 16, 0.85)`) — существующий
  цвет, «новых цветов не вводим» (000124); рамки НЕТ (как у баннера);
  text/font наследуются от `.combat-overlay` (#e8dcc0, 13px/1.5
  ui-monospace) — переопределений color/font НЕТ;
* `pointer-events: none` (контейнер) / `auto` (строки) — Д3;
  wheel-скролл — только над строками (осознано, §6 п. 5);
* правила строк `.combat-spellrow*` (L834-871) — **НЕ ТРОГАЮТСЯ**
  (потомковый комбинатор действует и из box-родителя);
* базовые `.combat-overlay/.combat-box/.combat-side/.combat-log/
  .combat-banner` и чужие оверлеи (dungeon/NPC/постройка) —
  **НЕ ТРОГАЮТСЯ** (стражи tests/combat-layout.test.js зелёные);
* stacking: книга (z auto, absolute) рисуется в своём порядке DOM
  внутри box — ПОД баннером (Д6); глобальная лестница 000121/000123
  (.combat-overlay 20 < #touch-controls 30) НЕ ТРОГАЕТСЯ — тач-
  контролы (D-pad/[E]/[I]) остаются над всем боевым оверлеем;
* в комментарии/селекторе блока НЕТ `*/` и несамостоятельного `*`
  (CU201-CSS-SELECTORS — стража 000201); в задаче новых комментариев
  нет (Д10) — риск снят конструктивно.

### 2.3 Занятое/свободное

* Занято: CSS-регион index.html L819-833 (блок 000149, замена правила
  + удаление его комментария), portrait-медиа L539-542 (append
  правила), src/combat-ui.js build() L452-467 (точка append),
  tests/combat-ui.test.js L6498-6503 (ре-пин) + конец файла (append),
  tests/combat-layout.test.js — конец файла (append), CHANGELOG
  2026-10-13 «Интерфейс» (append буллета).
* НЕ ТРОГАЕТСЯ: src/combat.js, src/spellbook.js, src/spells-data.js,
  src/spells.js, src/ally-spells.js, src/combat-keys.js, src/efir.js,
  src/main.js, assets/* (новых SVG НЕТ — иконки строк уже
  assets/spell-icons/, кнопка assets/ui/combat_spellbook.svg уже
  есть), spec/*, tests/spellbook.test.js, tests/ally-spells.test.js,
  tests/index-order.test.js, tests/svg.test.js,
  tests/combat-mpbar-css.test.js, tests/spec-*.test.js,
  детерминизм-золото, сейвы, memory/000149-* (закоммичено в master —
  менять нельзя; супersedence R11 — только здесь, §5 п. 1).

### 2.4 Ленивые ссылки и guards

* Новых модулей НЕТ → новых UMD/снапшотов Game НЕТ (combat-ui.js
  снимает G один раз при загрузке — 000038; bookBox — DOM-элемнт
  closure, Game-чтения — лениво в момент render через снапшот G —
  без изменений).
* Деградации без изменений: нет G.SpellBook → 1× console.error
  (spellBookWarned) + строки с голым id; нет G.AllySpells → 1×
  console.error (allySpellsWarned) + строки «недоступно активному
  персонажу» — обе ветки в bookRows/rowChk не тронуты (SB13/SB14,
  CU193-DEGR зелёные).
* finish()/build()/catch — resets bookBox=null и т.п. — работают с
  box-родителем без правок (overlay.remove() снимает всё).

## 3. Карта изменений (файлы, операции, Δ)

1. **src/combat-ui.js** — build(): `side.appendChild(bookBox)` →
   `box.appendChild(bookBox)` (одна строка кода переезжает на строку
   перед `box.appendChild(bannerEl)`); комментариев НЕ ТРОГАТЬ (Д10).
   Δ ≈ +1/−1.
2. **index.html** — L819-825: УДАЛИТЬ устаревший комментарий блока
   (Д10); L826-833: ЗАМЕНИТЬ правило на оверлей-геометрию (§2.2) +
   правило pointer-events строк; portrait-медиа (после L542):
   ДОБАВИТЬ portrait-правило книги. Δ ≈ +24/−15.
3. **tests/combat-ui.test.js** — (а) ре-пин CU199-MPBAR-1 L6498-6503:
   массив → `['combat-turnorder','combat-hpbar','combat-mpbar',
   'combat-state','combat-actions','combat-log']` (книги нет),
   сообщение ассерта: «краснота: 6 элементов без mpbar» → «краснота:
   5 элементов без mpbar; книга — теперь в .combat-box (000196)» —
   предмет теста («mpbar ТРЕТИЙ, после .combat-hpbar, перед
   .combat-state») сохранён полностью; (б) APPEND В КОНЕЦ 4 теста
   CU196-POS/DESC/CAST/SEL (§4). Δ ≈ +250/−2.
4. **tests/combat-layout.test.js** — APPEND В КОНЕЦ 3 статических
   пинта CU196-CSS-OVERLAY/NOCAP/PORTRAIT (существующие
   cssRule/portraitRule). Δ ≈ +90.
5. **memory/000196-spellbook-overlay.md** — этот файл (новый).
6. **CHANGELOG.md** — буллет в `## 2026-10-13` → `### Интерфейс`
   (append после буллета «Воскрешение — цель из книги спутника.»):
   `- **Книга заклинаний — над полем боя.** В бою книга заклинаний
     (кнопка или клавиши [Q]/[R]) теперь открывается списком
     известных заклинаний с описаниями прямо над полем боя: список
     читается с видом на поле, а клики мимо строк проходят в поле
     (например, для выбора цели воскрешения).` Δ ≈ +5.
7. **tasks/pending/000196.md → tasks/done/000196.md** +
   **tasks/result/000196.md** (краткий отчёт: решения §1, карта §3,
   тесты §4, baseline: развитие 2317 → 2324 (2317 + 7 новых), после
rebase — от факта (≈2342) → +7, репины:
   0 семантических / 1 технический (CU199-MPBAR-1), отклонение a3-
   варианта — §1 Д1-отклонение, отклонение «отдельный CHANGELOG-
   коммит» — Д11, флейки — по факту). Один коммит: первая строка
   «Задача 000196: БОЙ — оверлей списка заклинаний с описаниями по
   кнопке книги (книга — над полем боя, клики мимо строк проходят в
   canvas; targetId-контракт «Воскрешения» сохранён)», последний
   абзац `Co-Authored-By: Claude Code <noreply@anthropic.com>`.

Порядок работ: (1) красные (CU196-POS + CU196-CSS-*) → прогон —
красные падают осмысленно (размещение/декларации отсутствуют), остальное
зелёное; (2) фикс (combat-ui.js + index.html) + ре-пин → полный набор
зелёный; (3) memory/CHANGELOG/tasks → `npm test` полный (ОДИН прогон в
worktree); (4) rebase на свежий master → `npm test` + baseline от
факта; (5) один коммит.

## 4. Тесты CU196-*

### 4.1 tests/combat-ui.test.js (append в конец; vm; scene84 + tickSlice
+ press + findByClass + findCanvas + addMerc84 + lastRow166 +
underlayAt166/ringAt166 — ВСЕ хелперы существующие, новых цепочек
loadCombatUi НЕТ)

| id | RED до фикса | пины |
|---|---|---|
| CU196-POS | ДА (книга сейчас в side) | scene84(): (1) `side.children` deepEqual `['combat-turnorder','combat-hpbar','combat-mpbar','combat-state','combat-actions','combat-log']` (книги НЕТ); (2) `box.children` (findByClass 'combat-box') deepEqual по className с канвасом-маркером: `[canvas, 'combat-spellbook', 'combat-banner']`; (3) по умолчанию display 'none'; (4) клик по кнопке spellbook (`buttons.find(act==='spellbook').listeners.click[0]()`) → display '' + строки построены; (5) KeyQ — закрыла, KeyR — открыла (toggle) |
| CU196-DESC | НЕТ (якорь контента) | scene84({spells:true}), дефолтный герой ['spark','mend']: открытая книга → строки 1:1, `dataset.spell` порядок ['spark','mend']; КАЖДАЯ строка: `.combat-spellrow-desc` textContent === `G.SpellsData.SPELLS_BY_ID[id].описание`, `span.combat-spellname` = название, `span.combat-spellmeta` = «Мана N · Заклинание (poolName)» (N = мана строки, poolName = «Интеллект»/«Мудрость» ПО ОДНОМУ — строится из данных каталога, не хардкод), `img.combat-spellicon` src = 'assets/spell-icons/<id>.svg'; пустая книга (после открытия `c.player.spells = []` + tick, паттерн SB3) → последняя строка «—», -off, без dataset.spell |
| CU196-CAST | НЕТ (якорь проводки) | (a) SB4-паттерн: m0 на (c.px, c.py-1), m0.maxHP+=6/m0.hp+=6, c.selectTarget(m0.id), открытая книга → клик по строке «Искра» → лог «Искра по <волк>: N.», c.ps.spellInt −1, p.mp 16−3=13, c._fx.action 'cast', книга ЗАКРЫТА (display 'none'), ход не сгорел (phase 'player', активен тот же); (b) p.mp=0 → клик → c.log последняя строка «не хватает маны (3)», расход НЕТ, книга ОТКРЫТА |
| CU196-SEL | НЕТ (якорь 000193.02 §5.2 — сценарий CU193.02-SEL, перенесённый на оверлей) | scene84({efir,spells,allySpells}), mёртвый наёмник a1 (addMerc84 + dealDamageToAlly 9999), u.spells.push('resurrect'), u.mp=u.maxMP=20, c.efs.spellWis=1, stale c.targetId='m0': (1) книга ОТКРЫТА → строка resurrect (lastRow) -off, title «нет цели»; (2) canvas-клик по клетке a1 (книга при этом ОТКРЫТА — pass-through Д3) → c.targetId === a1.id, лог не вырос, подложка+кольцо в tickSlice (маркеры 000193.02 не тронуты); (3) строка ОТКРЫТОЙ книги перестроена БЕЗ -off, title ''; (4) клик по строке → лог ровно ['Возвращён в бой.'], a1.alive, a1.hp === 8, c.efs.spellWis 0, u.mp 5, мана/пулы игрока нетронуты, c._fx 'cast', книга закрыта, 0 новых c._rng |

### 4.2 tests/combat-layout.test.js (append в конец; статика;
существующие cssRule/portraitRule)

| id | RED до фикса | пины |
|---|---|---|
| CU196-CSS-OVERLAY | ДА (сейчас секция: flex 0 1 auto и т.п.) | правило `.combat-overlay--combat .combat-spellbook`: position 'absolute', top '50%', left '50%', transform 'translate(-50%, -50%)', box-sizing 'border-box', width === width `.combat-overlay--combat .combat-box canvas` (зеркало формулы, row), height === то же (квадрат), overflow-y 'auto', background === background `.combat-overlay--combat .combat-banner` (зеркало `rgba(10, 12, 16, 0.85)` — не новый цвет), pointer-events 'none'; правило `.combat-overlay--combat .combat-spellbook .combat-spellrow`: pointer-events 'auto' (Д3) |
| CU196-CSS-NOCAP | ДА (все четыре decls сейчас есть) | в том же правиле НЕТ: `flex`, `max-height`, `margin`, `min-height` — старая секционная геометрия убрана целиком (ловит «заплатку» поверх секции вместо замены) |
| CU196-CSS-PORTRAIT | ДА (portrait-правила сейчас нет) | `portraitRule('.combat-overlay--combat .combat-spellbook')`: width === width portrait-canvas (`.combat-overlay--combat .combat-box canvas` в медиа-теле), height === то же (квадрат) |

Ожидаемо красных до фикса: **4** (CU196-POS, CU196-CSS-OVERLAY,
CU196-CSS-NOCAP, CU196-CSS-PORTRAIT) — все осмысленные (факт
размещения/деклараций). CU196-DESC/CAST/SEL — зелёные якоря ДО фикса.
Весь остальной набор (2317) — зелёный. Стражи, обязанные пройти БЕЗ
правок: CU199-MPBAR-1 (после ре-пина), CU199-MPBAR-ALIAS,
CU199-CSS-MPBAR, CU182-ORDER/BTN8, CU182-GATE-ORDER, CU188-ROWCHK,
SB1-SB14, CU166-*, CU171-*, CU179-*, CU193-*, CU193.01-*, CU193.02-*
(ROW/SEL/CLEAR/GATE), 000168-UI-*, 000166-*, CU201-CSS-* (TRACK/
MIRROR/SELECTORS), стражи combat-layout.test.js (база .combat-side/
.combat-log/.dungeon-overlay/.combat-actions, portrait-математика),
svg.test.js (счётчики 11/17 — новых SVG нет), index-order.test.js
(тегов нет), spec-*.test.js (spec не тронут), детерминизм-золото,
сейвы.

## 5. Что важно будущим задачам

1. **R11 memory/000149-combat-spellbook.md СУПЕРСАИДЕНА в части
   размещения контейнера** («между .combat-actions и .combat-log в
   .combat-side»): с 000196 контейнер — в `.combat-box` (§2.1). Механика
   000149 (R7/R9/R12/R16 и т.д.) и правила строк — живы без изменений.
   Файл 000149 не редактируется (закоммичен в master); расхождение
   код>комментарий разрешается этим файлом (CLAUDE.md).
2. **Кросс-нота 000193.02 §5.2 — ВЫПОЛНЕНА**: «Воскрешение» в оверлее
   строится тем же rowChk/castRow → canCastAllySpell с сырым targetId;
   при мерже 000196 ПРОВЕРИТЬ: CU193.02-ROW/SEL/CLEAR/GATE + CU196-SEL
   зелёные (в плане работ, п. 7 §3).
3. **000194/000195 (pending, та же формулировка «поверх экрана боя»)** —
   быстрые предметы/инвентарь: если их реализация повторяет паттерн
   этой задачи (оверлей в `.combat-box`, size-canvas, pointer-events
   pass-through, append ПЕРЕД bannerEl — баннер ВСЕГДА верхний при
   c.result), поверхность мержа union-совместима; НО box.children
   order-пин CU196-POS (3 элемента) потребует ТОГДА технического
   ре-пина (как CU199-MPBAR-1 здесь) — держать это в виду.
4. **Книга следует за АКТИВНЫМ персонажем** (000193, unitOf) — оверлей
   показывает книгу активного юнита (на ходу Эфира/наёмника — их
   книга) — без изменений; бейдж/гейты 000199/000193 — без изменений.
5. **SPEC** — расположение книги в UI НЕ закреплено; если ревью
   потребует зафиксировать — буллет в spec/companions.md «Бой» +
   re-pin SPEC_FILE_LINES (companions.md: 112, tests/spec-split.
   test.js) В ТОМ ЖЕ коммите.

## 6. Подводные камни

1. **Баннер СВЕРХУ книги при c.result — только порядком DOM** (bookBox
   ДО bannerEl в box). z-index в баннер-правила НЕ вводить (базовое
   .combat-banner общее с dungeon/NPC — 000124, чужой регион);
   книгу при c.result НЕ закрывать автоматически (не в ТЗ; баннер
   накрывает — Д6/Д7).
2. **`*/` в CSS-комментарии** (регрессия 000201) — в задаче НЕТ новых
   комментариев (Д10), риск снят конструктивно; CU201-CSS-SELECTORS
   (comment-aware, все правила `<style>`) — стража на месте, блок обязан
   пережить её без правок теста.
3. **vm-стаб: parentElement НЕТ** — CU196-POS проверяет размещение
   deepEqual массивов children (box/side), не parent-ссылками;
   pointer-events в vm не хит-тестится — контракт Д3 закреплён
   CSS-текст-пинтом (CU196-CSS-OVERLAY), а не vm.
4. **vm-стаб не чистит children** (innerHTML='' no-op, 000149 §10):
   при перестроении строки ДОБАВЛЯЮТСЯ — тесты читают ХВОСТ
   (children.slice(-N) / lastRow166).
5. **Wheel-скролл только над строками** (контейнер pointer-events:
   none) — осознано (≤17 строк; не в ТЗ); если станет проблемой —
   отдельная задача, не усложняем здесь.
6. **Portrait: box ВЫШЕ canvas** (flex 1 1 auto) — inset:0/100% дали бы
   оверлей выше поля; формула баннера (50%/50% + min()) — 1:1 с
   canvas в обеих ориентациях (canvas центрирован в box — flex
   center/center).
7. **Лог воскрешения — ровно ОДНА строка** «Возвращён в бой.» (ядро
   000163; книга союзника строку актёра не добавляет — memory/000193
   §7) — deepEqual в CU196-SEL.
8. **Флейки**: tests/map.test.js perf «160k tileAt» (тайм-бюджет 5000
   мс) падает под нагрузкой (факт базиса a3: 1 падение; одиночный
   прогон 74/74) — протокол: `node --test tests/map.test.js` + запись в
   tasks/result/000196.md, НЕ баг задачи. Один полный `node --test`
   на worktree за раз (мутируемый тест 000054 — память).
9. **Кнопка 000171 / resurrectChk / resurrectCast / canResurrect /
   canResurrectPick / маркеры L1005 / tHero L1528** — НЕ ТРОГАТЬ
   (контракт 000193.02 §2.3-2.5; расширение = семантические репины
   CU171-ALLY/-EFIR, запрещены).
10. **SPEC не менять** (Д5) — размещение UI-деталь; wording-пины
    (spec-combat-wording, spec-mobs-companions-efir-wording,
    spec-resurrection, spec-split) не затрагиваются.
11. **Rebase** (на момент Проектирования master = **315debe** — 3
    коммита выше нашей базы 2f707dd; к моменту мержа может уйти
    дальше — сверять по факту):
    * 000206 (0fc24f1): ui.js z25 + main.js — наши файлы НЕ задевает.
    * 000203 (c2a1ebc): **src/combat-ui.js +13 строк (lungeGate)** —
      блок `if (ctx.lungeGate) { overlay.style.visibility/
      pointerEvents }` ПОСЛЕ `document.body.appendChild(overlay)`
      (за base L469-473), `if (ctx.lungeGate && !c.result) return
      false` в handleCode (L785-788), `lungeGate: !!opts.lungeGate`
      в ctx (L2304), экспорт `setLungeGate` (L2357-2364). Ханки ПОСЛЕ
      зоны нашего append-переезда (L452-467) — пересечения строк НЕТ.
      Семантика: лундж-гейт прячет ВЕСЬ оверлей (visibility:hidden)
      и блокирует handleCode → книга (внутри оверлея) наследует —
      взаимодействия с 000196 НЕТ. После rebase ПРОВЕРИТЬ build(): в
      box порядок [canvas, bookBox, bannerEl], лундж-блок после body-
      append, `side.appendChild(bookBox)` удалён.
    * 000200 (315debe): script-тег в BODY index.html (не `<style>`),
      CHANGELOG «Игровой процесс» (не наш «Интерфейс»), index-
      order +32 — не трогаем.
    * Hot-регионы: index.html CSS (000194/000195/000202 могут
      добавлять СВОИ блоки в `<style>` — union-конфликт разрешать по
      content-маркерам: наш маркер — селектор
      `.combat-overlay--combat .combat-spellbook`), src/combat-ui.js
      build() (маркер — «bookBox = document.createElement»), конец
      tests/combat-ui.test.js + регион CU199-MPBAR-1 (000199 —
      смержен, в полёте не правится), CHANGELOG 2026-10-13
      «Интерфейс» (append ПОСЛЕ последнего буллета «Интерфейс» —
      «Воскрешение — цель из книги спутника.»).
    * После rebase — полный тест + baseline ОТ ФАКТА (2317 + тесты
      000206/000203/000200, счёт от факта, оценка ≈ 2342); если
      rebase коснётся combat-ui.js — сверить с мержами 000201
      (CSS-комментарий) / 000193.02 (canResurrectPick L1729-1734,
      L513/L1005/L1524 — не трогаем) / 000203 (lungeGate-ханки —
      выше).

---

## 7. Станция РЕАЛИЗАЦИЯ (2026-10-14): отклонение от карты §3

Планируемая позиция row-правила (замена НА МЕСТЕ блока 000149, L826-833)
ПРОТИВОРЕЧИТ закоммиченным красным тестам: cssRule (tests/combat-
layout.test.js) берёт ПЕРВОЕ вхождение селектора в файле, а
portrait-медиа (L514) стоИТ ПЕРЕД блоком 000149 (L819) — portrait-
правило книги (обязанно быть ВНУТРИ медиа, portraitRule парсит только
медиа-тело) стало бы первым вхождением → CU196-CSS-OVERLAY читал бы
position: undefined. Факт: зелёный цикл. РЕШЕНИЕ: row-правило
`.combat-overlay--combat .combat-spellbook` (+ правило pointer-events
строк) ПЕРЕМЕЩЕНО в боевой скоуп ПОСЛЕ row-правила баннера
(L439-450, до portrait-медиа) — тот же «над полем»-паттерн, зеркало
формул; portrait-правило — в медиа после portrait-баннера (как в
плане). Блок 000149 (L819+) — только УДАЛЕНИЕ устаревшего комментария
+ старого правила; правила строк `.combat-spellrow*` остались на месте
(потомковый комбинатор — от порядка в файле не зависят; pointer-events
auto строки — специфичнее (0,3,0) > (0,2,0), каскад — бит-в-байт).
000194/000195: повторять то же (row-правило оверлея — ПЕРЕД
portrait-медиа; первый cssRule-маркер файла — row-правило).

## 8. Станция РЕВЬЮ (2026-10-14): правки по findings

6 findings (все minor), вердикты и действия — tasks/result/000196.md
§7. Код: УДАЛЁН устаревший комментарий блока build() (старые
L448-451, «контейнер строк — МЕЖДУ .combat-actions и .combat-log
(контракт R11)» + 3 строки) — Д10 в части этого блока СУПЕРСАИДЕНА:
комментарий удалён, а не «оставлен, код = источник правды»
(CLAUDE.md «не пиши комментарии в коде»; симметрия с CSS-комментарием
000149, удалённым в index.html тем же коммитом реализации). После
удаления: `box.appendChild(bookBox)` — **L458** (было L462 — все
номера строк после L451 в этом файле сдвинуты на −4; контракт
размещения §2.1 и тесты — без изменений). Остальное: ретро-флейк
прогонов ревью + оговорка о нагрузке — в «Тесты» отчёта (паттерн
флейка §6 п. 8, мерж не блокируется, ДРУГИЕ фоллы — стоп); чеклист
чистоты worktree на мерже (внешний процесс во время ревью) — §7
отчёта; сообщение squash-коммита мержа — от фактов ПОСЛЕ rebase
(2356 + 7 = 2363); wheel-скролл (§6 п. 5) — без правок.

## 9. Станция ФИНАЛИЗАЦИЯ (2026-10-14): статус

* Коммиты ветки (база f6bab66, rebase 0 конфликтов): 37852c2
  красные, ee96c48 реализация + CHANGELOG + перенос в done +
  отчёт (Д11 — единый коммит), 9f93b0f правки ревью, коммит
  финализации (отчёт §8–§10 + этот §9).
* Свежий полный `node --test tests/` — **2363/2363, 0 fail**
  (один прогон в worktree, флейков нет; = 2356 master + 7 CU196-*).
* Чеклист чистоты пройден: status пуст, diff master...HEAD — ровно
  8 файлов, `box.appendChild(bookBox)` L458, master — ancestor
  HEAD.
* CHANGELOG: упоминание есть (игрок-видимое UI) — 2026-10-14
  «Интерфейс», «Книга заклинаний — над полем боя».
* Для стадии мержа: rebase уже выполнен на f6bab66; риски
  (CSS-регион index.html / конец combat-ui.test.js / CHANGELOG /
  CU196-POS 3-элементный пин под 000194/000195) — §5 п. 3 и §6
  п. 11; сообщение squash-коммита — от фактов ПОСЛЕ (re)base,
  не из текста ee96c48 (2317→2324 устарело).
