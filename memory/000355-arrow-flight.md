# 000355 — полёт стрелы: ФИКС ложной D11 (bracket vs setProperty)

Задача: tasks/done/000355.md. Тест: tests/combat-arrow-flight-000355.test.js
(AF1–AF6). Исправляет **ложную** запись D11 в
memory/000248-combat-attack-fx.md: «кастом-свойства — ТОЛЬКО
bracket-присвоение `el.style['--fx-x0']=v` — работает и на реальном
CSSOM». Это НЕВЕРНО.

## Корень (браузерная семантика)

У реального `CSSStyleDeclaration` НЕТ именованных свойств для custom
properties. `el.style['--x'] = v` создаёт лишь JS-expando на объекте и
НИКОГДА не попадает в cascade; единственный путь —
`el.style.setProperty('--x', v)`. На HEAD все 10 --fx-* vars
(syncAttackFx src/combat-ui.js) были(expando-)записаны и в cascade
не определены → цепочка IACVT (invalid-at-computed-value-time):

- `.combat-atk-arrow` left/top = `var(--fx-x0/y0)` без fallback → auto →
  стрела в static-позиции (угол слоя, под overflow:hidden) — ТЗ-симптом
  «рисует что-то вне поля»;
- `@keyframes combat-atk-arrow` (left/top x0→x1) нейтрализован → ПОЛЁТА
  НЕТ (инлайн left/top тоже не спасает: animation both перекрывает);
- `transform: rotate(var(--fx-angle))` → none — поворота нет;
- `.combat-atk-hit` animation-shortcut `animation: combat-atk-hit
  var(--fx-hit-dur) ease-out var(--fx-hit-delay) both` — var без
  fallback ⇒ ВСЯ декларация IACVT ⇒ animation:none ⇒ вспышка удара НЕ
  показывалась НИГДА (все типы атак);
- lunge keyframe `translate(var(--fx-lx), var(--fx-ly))` → transform:none
  — выпадения нет;
- моб `--fx-arrow-dur` терялся → fallback 400ms вместо 300ms (полёт
  резался на 75% окна моба).

Виден оставался только draw-пульс (scale без var) — «что-то анимируется».

## Почему пины 000248 были вакуумно-зелёными

`makeEl000246.style = {}` (plain object) round-trip'ит bracket-запись как
expando, и все пины читали `el.style['--fx-*']` той же дыркой. Память
000248 прямо предупреждала «CSS keyframes с var() тестами НЕ
исполняются → ВИЗУАЛЬНЫЙ QA-чекпоинт обязателен» — чекпоинт не выполнен.

## Фикс (SCOPE — только FX)

1. src/combat-ui.js `syncAttackFx`: все 10 bracket-присваиваний →
   `el.style.setProperty('--fx-*', v)`. БЕЗ typeof-фолбэка на bracket
   (фолбек = вечный вакуум — урок D11).
2. index.html `.combat-atk-arrow`: `transform: translate(-50%, -50%)
   rotate(var(--fx-angle))` — якорь ЦЕНТРА (матрица T·R: translate сносит
   центр бара в left/top, rotate вокруг центра) — контракт «старт/финиш в
   ЦЕНТРЕ клетки»; без translate бар стартовал уголком из центра. Ни один
   существующий пин transform стрелы не пинил (единственный transform-pin
   — слой) — ре-пин не требовался.

## Геометрия: слой ≡ поле (гипотезы ТЗ 1/3 — ЛОЖЬ)

Формула слоя `.combat-atk-layer` = формула canvas-поля
`min(100vh−32px, 100vw−304px)` (база) и portrait-override обе identичны
(база 000124/000248-CSS; АФ6 пинит слой С canvas напрямую, база+portrait).
`.combat-side` 256+gap16+padding32=304 ⇒ box не шринкается, canvas и слой
центрируются одними и теми же flex/translate ⇒ бокс слоя ≡ border-box
canvas при любом row-окне; остаётся 2px border canvas (<0.1 клетки —
принято D2 000248). Логическое поле квадратное (c.width==c.height) ⇒
% слоя == % поля по обеим осям; combat-scale.js к DOM-слою неприменим
(он про backing canvas). Resize пересчитывается vw/vh-формулами.
Слой НЕ измеряется в JS — источник истины проекции: тождество CSS-формул
(пин AF6).

## Контракт mock'а (обязателен для будущих FX-тестов)

style-мок боевого харнеса ОБЯЗАН воспроизводить браузер: `getPropertyValue
('--x')` отдаёт только заданное setProperty; bracket `style['--x']=v` —
expando (bracket-чтение видит, getPropertyValue — ''); реальные свойства
видны обоими способами; методы НЕ перечислимы (Object.keys чист —
tooltip-flip-пины). Реализовано: makeStyle000246 (tests/ui.test.js),
makeStyleCu000355 (tests/combat-ui.test.js), makeStyleFb000355
(tests/fled-banner-000278.test.js), makeStyle000355
(tests/combat-arrow-flight-000355.test.js).

## Ре-пины (ридеры/моки, ожидания НЕ ослаблены)

- tests/ui.test.js: makeEl000246 style → makeStyle000246; pinPct000248
  для '--*' читает getPropertyValue; MOBR-ридеры --fx-arrow-dur/hit-delay/
  hit-dur и SC arrowPts — тот же переход. Стиль-мок ранней секции
  (makeEl :111) НЕ тронут — FX туда не доходит (проверено прогонами).
- tests/combat-ui.test.js: makeEl style → makeStyleCu000355 (5 тестов
  падали TypeError'ом style.setProperty).
- tests/fled-banner-000278.test.js: makeEl style → makeStyleFb000355 (1).
Эмпирический радиус: падали ровно эти 3 файла, остальные ~45
Space/KeyJ-харнесей до FX-маркеров не доходят.

## Матрица мутаций (см. также tasks/result/000355.md)

- M1 setProperty → bracket обратно (все 10): AF1/AF2/AF4/AF5 +
  000248-ARW/MOBR/SC — 7 fail (ловят КОРЕНЬ обе стороны).
- M2 удалить setProperty --fx-x1/--fx-y1 (полёт «в никуда»): AF1/AF2.
- M3 не задавать --fx-angle: только AF2.
- M4 убрать translate(-50%,-50%) из CSS: только AF6.
- M5 mob-dur 300→400ms: только AF4.
- M6 «фейковый offset-слой» (формула ширины слоя 304→320px): только
  AF6 — негатив ТЗ «сдвинутая геометрия слоя ловится» (решение не
  измеряет layout в JS; пин тождества слой≡canvas — замена).

## Напоминания

- Визуальная часть (траектория/поворот/centering в реальном браузере)
  тестами НЕ исполняется — keyframes в vm не гоняются. Ручной QA-чекпоинт
  ОБЯЗАТЕЛЕН (урок 000248): бой с луком — стрела летит по полю от
  стрелка к цели; melee — выпад; hit — вспышка.
- Инварианты сохранены: combat.js 0-diff (даль/урон/phase), c._fx/
  c._unitFx семантика, ленивость слоя (steady 0 DOM-операций), z-порядок
  (слой последний ребёнок box), 000248-END/DET зелёные.
- Ре-пин-условие: если FX-vars станут задаваться другим средством —
  mock'ы и AF1–AF5 обязаны остаться браузерно-верными (getPropertyValue).
