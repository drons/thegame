# 000037: canDoAction — «зеркало» проверок ядра

`G.canDoAction(c, action, args)` (src/combat.js) — чистый предпросмотр
доступности действия в бою: не трогает `c.ps`, `p.hp/mp`, инвентарь,
`c._rng`, `c.log`, `c.targetId` — можно вызывать на каждом render.

Правила зеркала (важно для будущих задач по боевому UI):
* reason — дословными формулировками ядра (одна причина — одно
  поведение): при изменении проверок в playerAttack/playerSpell/
  playerBlock/playerQuickItem/playerInvItem — обновлять canDoAction
  синхронно.
* checkBlocked идёт только в attack/fire/heal/quickItem/invItem;
  block/flee/endTurn — только checkTurn (как в ядре).
* `heal` при полном HP → «здоровье полное» (решение 000037, в ядре
  проверки нет — ядро просто тратит ману впустую).
* `invItem` (кнопка «Предмет [T]») — «есть хотя бы один применимый
  предмет» (potion/food/skill_book); применение конкретного предмета
  из боя — будущая задача с мини-меню выбора.
* `args.targetId` для attack/fire; без args — ближайший живой моб
  (как в ядре). UI передаёт `c.targetId`.
* Лог исцеления печатает восстановленную величину (`hp после − hp до`);
  результат `c.spell('heal')`: `hp` — общее HP (совместимость),
  `healed` — восстановлено.
* UI: `b.dataset.act` в combat-ui.js — имя действия (attack/fire/...),
  НЕ код клавиши; панель ui.js использует dataset.act для другой
  механики (buy/sell/...) — не перепутать.
