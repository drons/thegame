// Мини-карта боя (HTML-оверлей): сетка, юниты, действия, журнал.
// Браузерный модуль (ядро — src/combat.js, тестируется в node).
//
// Управление в бою — единая таблица src/combat-keys.js (задача 000048;
// подписи кнопок и keydown строятся из неё же, хардкода нет):
//   стрелки / WASD / ЦФЫВ — шаг (те же e.code, что в мире — controls.js),
//   J — удар (K — дубль),  Q — огненная стрела,  R — исцеление,
//   B — блок,  E — быстрый предмет,  T — предмет (U — дубль),
//   F — побег,  Space — конец хода,
//   клик по мобо — выбор цели,
//   Esc / Space / Enter — закрыть оверлей (только после боя).
// На русской раскладке: J=О, K=Л, U=Г (e.code — физическая клавиша,
// задача 000028). Невозможное действие/шаг — причина в журнал
// (canDoAction, задача 000037; раньше — тишина).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G || !G.createCombat || !G.CombatKeys) {
    // Видимая ошибка, а не молчание (паттерн ui.js): битый порядок
    // загрузки — tests/index-order.test.js.
    console.error('combat-ui.js: не найдены Game.createCombat или ' +
      'Game.CombatKeys — проверьте порядок загрузки: src/combat.js и ' +
      'src/combat-keys.js ДО src/combat-ui.js (задача 000048)');
    return;
  }

  const CELL = 48;
  const ROLE_COLORS = {
    melee: '#d9483b', ranged: '#e08a3c', support: '#5cb85c',
    leader: '#b06ad4', shield: '#a98545', swarm: '#e0b13c',
  };

  let ctx = null; // { combat, hero, onEnd, open }
  let overlay = null, canvas = null, g2 = null;
  let stateEl = null, logEl = null, bannerEl = null;
  let ended = false;

  function isActive() {
    return !!ctx && ctx.open;
  }

  function current() {
    return ctx ? ctx.combat : null;
  }

  // --- Оверлей ---

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'combat-overlay';

    const box = document.createElement('div');
    box.className = 'combat-box';

    canvas = document.createElement('canvas');
    const c = ctx.combat;
    canvas.width = c.width * CELL;
    canvas.height = c.height * CELL;
    box.appendChild(canvas);
    g2 = canvas.getContext('2d');

    const side = document.createElement('div');
    side.className = 'combat-side';

    stateEl = document.createElement('div');
    stateEl.className = 'combat-state';
    side.appendChild(stateEl);

    const actions = document.createElement('div');
    actions.className = 'combat-actions';
    // Кнопки — из единой таблицы src/combat-keys.js (задача 000048):
    // подпись «Имя [первичная клавиша]», порядок = порядок в таблице.
    // b.dataset.act — имя действия ядра для canDoAction (задача 000037).
    for (const item of G.CombatKeys.describeCombatKeys()) {
      const b = document.createElement('button');
      b.textContent = item.label + ' [' +
        G.CombatKeys.keyLabel(item.primaryKey) + ']';
      b.dataset.act = item.action;
      b.addEventListener('click', () => {
        // Как по клавише: зеркало ok, но ядро отклонило (сейчас 'invItem'
        // без itemId) — причину в журнал, а не тишина (задача 000037).
        runAction(c, item.action);
        render();
      });
      actions.appendChild(b);
    }
    side.appendChild(actions);

    logEl = document.createElement('div');
    logEl.className = 'combat-log';
    side.appendChild(logEl);

    bannerEl = document.createElement('div');
    bannerEl.className = 'combat-banner';
    bannerEl.style.display = 'none';
    bannerEl.onclick = finish; // обработчик постоянный (render только показывает)
    box.appendChild(bannerEl);

    overlay.appendChild(box);
    overlay.appendChild(side);
    document.body.appendChild(overlay);

    canvas.addEventListener('click', (e) => {
      const r = canvas.getBoundingClientRect();
      const cx = Math.floor((e.clientX - r.left) / CELL);
      const cy = Math.floor((e.clientY - r.top) / CELL);
      // Клик в любую клетку прямоугольника моба (задача 000040).
      const u = c.units.find((x) => x.alive && !x.fled
        && cx >= x.x && cx < x.x + (x.size.w || 1)
        && cy >= x.y && cy < x.y + (x.size.h || 1));
      if (u) {
        c.selectTarget(u.id);
        render();
      }
    });
  }

  // Расхождение «зеркало ok, ядро отклонило» (задача 000037, п. 4):
  // причину тоже в журнал, а не тишина. Сейчас единственный такой случай —
  // 'invItem': зеркало ок, когда в инвентаре есть применимый предмет, но
  // UI ещё не передаёт itemId (мини-меню выбора — отдельная задача), и
  // ядро отвечает «выберите предмет из инвентаря» (пул не сгорает).
  // С 000048 через него же проходят отклонения шагов (c.move) — раньше
  // неудачный шаг был тихим.
  function logRejection(c, r) {
    if (r && !r.ok && r.reason) c.log.push(r.reason);
  }

  // Диспетчер действия (клавиша и клик по кнопке): вызов ядра + причина
  // в журнал при отклонении (задача 000037). Предпроверку canDoAction
  // делает keydown — снимком state для resolveCombatKey (задача 000048;
  // раньше предпроверка была здесь, в keyAction). Клик по disabled-кнопке
  // в браузере невозможен, поэтому лог причины — только по клавише.
  function runAction(c, action) {
    const r = {
      attack: c.attack(c.targetId),
      fire: c.spell('fire', c.targetId),
      heal: c.spell('heal'),
      block: c.block(),
      quickItem: c.quickItem(),
      invItem: c.invItem(),
      flee: c.flee(),
      endTurn: c.endTurn(),
    }[action];
    logRejection(c, r);
  }

  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    const c = ctx.combat;
    let handled = true;
    if (e.code === 'Escape') {
      // Закрыть оверлей можно только когда бой закончен.
      if (c.result) finish();
    } else if (c.result) {
      // Закрытие — Space/Enter (ветка ДО таблицы: Space=«конец хода»
      // конфликтовать с Space=«закрыть» не может). Прочие клавиши после
      // боя не «проглатываем» (handled=false) — на геймплей не влияет,
      // main.js всё равно ранним return'ит, пока оверлей открыт.
      if (e.code === 'Space' || e.code === 'Enter') finish();
      else handled = false;
    } else {
      // Единая таблица (src/combat-keys.js, задача 000048): движение и
      // действия. Снимок для resolveCombatKey: canDo — результат
      // canDoAction именно для действия этой клавиши (000037).
      const entry = G.CombatKeys.COMBAT_KEYS[e.code];
      const st = { phase: c.phase, result: c.result };
      if (entry && entry.type === 'action') {
        st.canDo = G.canDoAction(c, entry.action, { targetId: c.targetId });
      }
      const r = G.CombatKeys.resolveCombatKey(e.code, st);
      if (r.kind === 'move') {
        // playerMove само проверяет ход/блок/шаги/стену/моба и
        // возвращает reason — в журнал, а не тишина (задача 000048).
        logRejection(c, c.move(r.dx, r.dy));
      } else if (r.kind === 'action') {
        if (r.reason) {
          c.log.push(r.reason); // действие невозможно — причина в журнал
        } else {
          runAction(c, r.action);
        }
      } else {
        handled = false;
      }
    }
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
      render();
    }
  });

  // --- Отрисовка ---

  function render() {
    if (!ctx || !ctx.open) return;
    const c = ctx.combat;

    g2.fillStyle = '#0d1117';
    g2.fillRect(0, 0, canvas.width, canvas.height);
    g2.strokeStyle = '#2a3140';
    g2.lineWidth = 1;
    for (let x = 0; x <= c.width; x++) {
      g2.beginPath();
      g2.moveTo(x * CELL + 0.5, 0);
      g2.lineTo(x * CELL + 0.5, canvas.height);
      g2.stroke();
    }
    for (let y = 0; y <= c.height; y++) {
      g2.beginPath();
      g2.moveTo(0, y * CELL + 0.5);
      g2.lineTo(canvas.width, y * CELL + 0.5);
      g2.stroke();
    }

    // Мобы: прямоугольник size.w × size.h (задача 000040).
    for (const u of c.units) {
      if (!u.alive || u.fled) continue;
      const w = (u.size && u.size.w) || 1, h = (u.size && u.size.h) || 1;
      const px = u.x * CELL, py = u.y * CELL;
      const pw = w * CELL, ph = h * CELL;
      g2.fillStyle = ROLE_COLORS[u.role] || '#888';
      g2.fillRect(px + 8, py + 8, pw - 16, ph - 16);
      // Полоса HP (по ширине прямоугольника).
      const frac = u.hp / u.maxHP;
      g2.fillStyle = '#3a0d0d';
      g2.fillRect(px + 8, py + 2, pw - 16, 4);
      g2.fillStyle = '#6fdc6f';
      g2.fillRect(px + 8, py + 2, Math.round((pw - 16) * frac), 4);
      // Уровень (центр прямоугольника).
      g2.fillStyle = '#fff';
      g2.font = '12px ui-monospace, monospace';
      g2.textAlign = 'center';
      g2.fillText(String(u.level), px + pw / 2, py + ph / 2 + 4);
      // Подсветка цели (весь прямоугольник).
      if (u.id === c.targetId) {
        g2.strokeStyle = '#ffe27a';
        g2.lineWidth = 2;
        g2.strokeRect(px + 4.5, py + 4.5, pw - 9, ph - 9);
      }
    }

    // Игрок — ромб (как в мире).
    const px = (c.px + 0.5) * CELL, py = (c.py + 0.5) * CELL, s = CELL * 0.3;
    g2.fillStyle = '#8cf2fc';
    g2.beginPath();
    g2.moveTo(px, py - s);
    g2.lineTo(px + s, py);
    g2.lineTo(px, py + s);
    g2.lineTo(px - s, py);
    g2.closePath();
    g2.fill();

    // Панель состояния.
    const p = c.player;
    const d = G.derived(p);
    const t = c.units.find((u) => u.id === c.targetId && u.alive && !u.fled);
    stateEl.textContent =
      `${c.groupName}, раунд ${c.round}\n` +
      `HP ${p.hp}/${d.maxHP}  |  MP ${p.mp}/${d.maxMP}\n` +
      `Шаги: ${c.ps.moveLeft}  |  Удар: ${c.ps.attack}  |  Огонь: ${c.ps.spellInt}  |  Леч: ${c.ps.spellWis}\n` +
      (c.ps.blocked ? 'БЛОК  ' : '') + (c.ps.poison > 0 ? `ЯД ${c.ps.poison}  ` : '') +
      (t ? `Цель: ${t.name} (ур. ${t.level}, HP ${t.hp}/${t.maxHP})` : 'Цели нет');

    // Журнал: последние строки.
    logEl.textContent = c.log.slice(-9).join('\n');

    // Кнопки: неактивны вне очереди игрока или когда действие невозможно
    // (canDoAction, задача 000037); причина — в title (tooltip).
    if (overlay) {
      overlay.querySelectorAll('.combat-actions button').forEach((b) => {
        const r = G.canDoAction(c, b.dataset.act, { targetId: c.targetId });
        b.disabled = c.phase !== 'player' || !!c.result || !r.ok;
        b.title = r.ok ? '' : r.reason;
      });
    }

    // Баннер результата.
    if (c.result) {
      const r = c.result;
      const texts = {
        victory: `ПОБЕДА!\n+${r.xp} опыта, +${r.gold} золота`,
        fled: 'Вы ушли из боя.',
        dead: 'Вы погибли.\n−20% золота, возвращение к точке боя.',
      };
      bannerEl.textContent = texts[r.outcome] || r.outcome;
      bannerEl.style.display = 'block';
    }
  }

  function finish() {
    if (!ctx || !ctx.open || !ctx.combat.result || ended) return;
    ended = true;
    ctx.open = false;
    const onEnd = ctx.onEnd;
    const result = ctx.combat.result;
    if (overlay) overlay.remove();
    overlay = canvas = g2 = stateEl = logEl = bannerEl = null;
    ctx = null;
    ended = false;
    onEnd && onEnd(result);
  }

  G.combatUI = {
    /**
     * Начать бой.
     * @param {object} opts
     * @param {object} opts.hero   персонаж
     * @param {{mobGroup:number}} opts.tile тайл с группой
     * @param {number} opts.seed   сид (детерминированная группа)
     * @param {(result:{outcome:string})=>void} opts.onEnd callback конца боя
     */
    startCombat(opts) {
      if (isActive()) return null;
      ended = false;
      const combat = G.createCombat({
        player: opts.hero,
        // opts.mobs — произвольный состав (подземелья); иначе группа тайла.
        groupType: opts.mobs ? -1 : (opts.tile ? opts.tile.mobGroup : 0),
        mobs: opts.mobs,
        mobLevel: opts.mobLevel,
        groupName: opts.groupName || (opts.tile && G.MOB_GROUP_NAMES
          ? G.MOB_GROUP_NAMES[opts.tile.mobGroup] : undefined),
        seed: opts.seed,
        day: opts.day,
      });
      ctx = { combat, hero: opts.hero, onEnd: opts.onEnd, open: true };
      build();
      render();
      return combat;
    },
    isActive,
    current,
  };
})();
