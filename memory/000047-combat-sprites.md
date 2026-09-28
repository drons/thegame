# 000047: анимированные спрайты героя и мобов на поле боя

Подзадача 000030 (модернизация экрана боя, направление 1). Статус:
выполнено (код + тесты; коммит — оркестратор).

## Ключевые решения

### 1. mobSpriteKind — таблица-литерал в src/sprites.js

`MOB_SPRITE_KINDS` (константа) + чистая `mobSpriteKind(mobId)` →
ключ `MOB_FRAMES` или null. Оба экспортированы. Таблица НЕ зависит
от combat.js (нет цикла): vm-песочница combat-ui.test.js грузит
combat.js без require-цепочки sprites.js, а browser-ветка UMD
не знает о node-require. Равноценность с фактическими 36 id
MOB_TYPES закрывает тест (tests/sprites.test.js импортирует
combat.js в node).

Маппинг (8+7+5+5+8+3 = 36, сверено скриптом 1:1):

| вид MOB_FRAMES | id MOB_TYPES |
|---|---|
| orc (8) | orc_grunt, orc_warrior, orc_archer, orc_shaman, orc_rider, orc_mad, orc_captain, orc_chief |
| skeleton (7) | skeleton, skeleton_archer, crawling_bones, giant_larva, vampire, rot, bone_coloss |
| wolf (5) | wolf, wolf_pack, boar, cave_bear, troll |
| spider (5) | spider, ant, ant_queen, scorpion, centipede |
| elemental (8) | fire/water/wind/earth_elemental, imp, salamander, fairy, stone_golem |
| abyss (3) | lower_demon, succubus, abomination |

Расхождение (косметическое): заголовок задачи говорит «6 диких
зверей, 4 насекомых» — это срез по коммент-блокам combat.js, где
'spider' стоит в блоке «Дикие звери»; строки таблицы дают 5→wolf +
5→spider. Таблица авторитетна; все 36 id маппятся 1:1,
функционального расхождения нет.

### 2. c._fx — UI-состояние действия героя (ТОЛЬКО в combat-ui.js)

`c._fx = { action: 'attack'|'cast', until: <nowMs()+300> }`:
пишет runAction ПОСЛЕ успешного вызова ядра (r.ok): attack →
'attack', fire/heal → 'cast'. Невыполненное действие (ok:false)
анимации не даёт; промах (ok:true, hit:false) — даёт (действие
потрачено). render() c._fx ТОЛЬКО читает (heroAction =
c._fx.action пока now < until, иначе 'idle'). Ядро combat.js
это поле не читает (в ядре только c._rng) — ядро НЕ трогать.
Длительность — FX_MS = 300 мс.

### 3. rAF-цикл и typeof-гарды (vm-песочница!)

В песочнице tests/combat-ui.test.js НЕТ requestAnimationFrame и
performance (хостовые глобалы не попадают в vm-контекс; Date —
встроен). Поэтому наверху combat-ui.js:

```js
const nowMs = () => (typeof performance !== 'undefined' && performance.now)
  ? performance.now() : Date.now();
const raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : null;
const caf = (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : null;
```

Цикл: `tick() { if (!isActive()) { rafId = null; return; } render(); rafId = raf(tick); }`
— старт в startCombat после `build(); render();`
(`if (raf) rafId = raf(tick);`), стоп в finish() В САМОМ НАЧАЛЕ
(до overlay.remove()): `if (rafId != null && caf) { caf(rafId); rafId = null; }`.
Цикл живёт пока оверлей открыт (включая баннер результата).
Событные render() по keydown/клику ОСТАЮТСЯ синхронными — тесты
работают на них; двойной рендер (событие + tick) допустим
(рендер идемпотентен и дешёв). render() не получает now извне —
берёт ОДИН `const now = nowMs()` на весь render.

### 4. drawUnits — отдельная функция (для 000050)

render(): база #0d1117 → фон SVG (000049) → сетка → **drawUnits
(c, now, hpFrac, hpColor)** → DOM-часть. Слой препятствий
(000050, ещё в pending) вставится между сеткой и вызовом
drawUnits без переделки.

### 5. y-сортировка (глубина)

Список: живые не-fled-мобы + герой. bottomY: моб — `u.y + size.h`
(якорь верхний левый + высота, задача 000040), герой — `c.py + 1`.
Сортировка восходящая (дальние раньше); тай-брейк детерминированный:
x, затем id.

### 6. Размеры и слой

* Моб: спрайт на весь прямоугольник `px+8, py+8, pw-16, ph-16`
  (тот же запас 8px, что у прежнего fillRect — HP-полоса
  px+8/py+2/pw-16 согласована). 1×1 → 32px, 3×3 → 128px.
* Герой: `size = CELL*1.15` (55.2px; аналог zoom*1.15 мира,
  drawSprites main.js), центр `((px+0.5)*CELL, (py+0.5)*CELL)`.
  По краям поля вылезает за клетку — задумано, clipping не нужен.
* Мини-полоса HP героя: ПОСЛЕ спрайта; якорь — верх спрайта
  (`by = cy - size/2 - 8`), ширина `round(size)`; в фолбэке —
  прежняя формула (верх ромба, ширина 2s).
* Кламп миниполосы в canvas (фикс ревью, проход 2): canvas ровно
  7×48 = 336×336, а якорь «8px над верхом спрайта» (size/2+8 =
  35.6 > 24) у краёв поля уходил ЗА КРАЙ canvas: py=0 → by = -12 —
  полоса 4px целиком невидима (регрессия 000038: фолбэк-ромб там же
  by = 2); px=0/6 → срез 3–4px. Фикс: `bx = max(2, min(canvas.width
  - bw - 2, round(hx - bw/2)))`, `by = max(2, round(hy - size/2 - 8))`
  — запас 2px как у полосы мобов; на внутренних клетках не
  срабатывает. Спрайт НЕ сжимали (≈CELL×1.15 — по п. 5 задачи;
  вылезание за клетку/кромку canvas у краёв поля — задумано).
  Тест: tests/combat-ui.test.js «миниполоса HP героя у краёв поля»
  (на старом коде падает с геометрией (-3, -12, 55, 4)).
* Полоса HP (4px), номер уровня, подсветка цели — БЕЗ ИЗМЕНЕНИЙ
  поверх спрайта (по всему прямоугольнику).

### 7. Фолбэки (по юниту, не по всему полю)

Каждый юнит независимо: `image() → null` / spriteLoader = null /
sprites.js отсутствует (withSprites=false) — только этот юнит
остаётся прямоугольником (моб) / ромбом (герой). Все обращения
через G.* — с гардами (G.mobSpriteKind / G.MOB_FRAMES /
G.phlogistonFrames / G.frameIndex) — паттерн hpBarColor/
combatBackground (UMD-ловушка «G снимается один раз»). Спрайт,
загрузившийся ПОСЛЕ старта боя, подхватывается на следующем
render/tick (паттерн фона 000049).

### 8. Выбор кадров — чистые функции

Только `G.frameIndex(now, x, y, n)`: мобы — idle 2 кадра
(`frameIndex(now, u.x, u.y, 2)`); герой — 2 кадра действия
(`frameIndex(now, c.px, c.py, 2)`). now — АРГУМЕНТ (один
nowMs()-снимок на render), времени внутри селекторов нет.
Анимации атаки мобов и 'walk' героя в бою — за рамками.

## Интеграция

* main.js — НЕ менялся: spriteLoader уже во ВСЕХ 3 вызовах
  startCombat (задача 000049: строки ~587, ~665, ~1032).
* index.html — порядок не меняется (sprites.js до combat-ui.js,
  закреплено tests/index-order.test.js).
* NPC-диалог (ui.js) и dungeon-ui.js переиспользуют классы
  .combat-overlay/.combat-side — НЕ трогались; rAF-цикл живёт
  только внутри combat-ui, пока isActive().

## Отдельно (НЕ входит в коммит)

Ветка `wip/task-000047-mobart` — незакрытая итерация «ассеты»
(коммит «WIP, НЕ МЕРЖИТЬ»: мастер-арты 36 мобов + artDescription +
tests/mob-art.test.js, 89 файлов). Не мержена, на 000047 не влияет:
спецификация использует СУЩЕСТВУЮЩИЕ MOB_FRAMES (6 семейств × 2
кадра). При желании — отдельная подзадача: производство базовых
кадров 6 семейств из мастеров.
