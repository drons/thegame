// Мини-карта боя (HTML-оверлей): сетка, юниты, действия, журнал.
// Браузерный модуль (ядро — src/combat.js, тестируется в node).
//
// Управление в бою:
//   стрелки / WASD / ЦФЫВ — шаг,  A — удар,  Q — огненная стрела,
//   R — исцеление,  B — блок,  F — побег,  Space — конец хода,
//   клик по мобо — выбор цели,  Esc — (закрыть можно только после боя).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G || !G.createCombat) return;

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
    for (const [label, key, fn] of [
      ['Удар [A]', 'KeyA', () => c.attack(c.targetId)],
      ['Огонь [Q]', 'KeyQ', () => c.spell('fire', c.targetId)],
      ['Исцел. [R]', 'KeyR', () => c.spell('heal')],
      ['Блок [B]', 'KeyB', () => c.block()],
      ['Быстрый предмет [E]', 'KeyE', () => c.quickItem()],
      ['Предмет [T]', 'KeyT', () => c.invItem()],
      ['Побег [F]', 'KeyF', () => c.flee()],
      ['Конец хода [Space]', 'Space', () => c.endTurn()],
    ]) {
      const b = document.createElement('button');
      b.textContent = label;
      b.dataset.act = key;
      b.addEventListener('click', () => { fn(); render(); });
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
      const u = c.units.find((x) => x.alive && !x.fled && x.x === cx && x.y === cy);
      if (u) {
        c.selectTarget(u.id);
        render();
      }
    });
  }

  function keyDir(code) {
    return {
      ArrowUp: [0, -1], KeyW: [0, -1], KeyЦ: [0, -1],
      ArrowDown: [0, 1], KeyS: [0, 1], KeyЫ: [0, 1],
      ArrowLeft: [-1, 0], KeyA: [-1, 0], KeyФ: [-1, 0],
      ArrowRight: [1, 0], KeyD: [1, 0], KeyВ: [1, 0],
    }[code];
  }

  window.addEventListener('keydown', (e) => {
    if (!isActive()) return;
    const c = ctx.combat;
    let handled = true;
    if (e.code === 'Escape') {
      // Закрыть оверлей можно только когда бой закончен.
      if (c.result) finish();
    } else if (c.result) {
      if (e.code === 'Space' || e.code === 'Enter') finish();
    } else if (e.code === 'Space') {
      c.endTurn();
    } else if (e.code === 'KeyA') {
      c.attack(c.targetId);
    } else if (e.code === 'KeyQ') {
      c.spell('fire', c.targetId);
    } else if (e.code === 'KeyR') {
      c.spell('heal');
    } else if (e.code === 'KeyB') {
      c.block();
    } else if (e.code === 'KeyE') {
      c.quickItem();
    } else if (e.code === 'KeyT') {
      c.invItem();
    } else if (e.code === 'KeyF') {
      c.flee();
    } else {
      const d = keyDir(e.code);
      if (d) c.move(d[0], d[1]);
      else handled = false;
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

    // Мобы.
    for (const u of c.units) {
      if (!u.alive || u.fled) continue;
      const px = u.x * CELL, py = u.y * CELL;
      g2.fillStyle = ROLE_COLORS[u.role] || '#888';
      g2.fillRect(px + 8, py + 8, CELL - 16, CELL - 16);
      // Полоса HP.
      const frac = u.hp / u.maxHP;
      g2.fillStyle = '#3a0d0d';
      g2.fillRect(px + 8, py + 2, CELL - 16, 4);
      g2.fillStyle = '#6fdc6f';
      g2.fillRect(px + 8, py + 2, Math.round((CELL - 16) * frac), 4);
      // Уровень.
      g2.fillStyle = '#fff';
      g2.font = '12px ui-monospace, monospace';
      g2.textAlign = 'center';
      g2.fillText(String(u.level), px + CELL / 2, py + CELL / 2 + 4);
      // Подсветка цели.
      if (u.id === c.targetId) {
        g2.strokeStyle = '#ffe27a';
        g2.lineWidth = 2;
        g2.strokeRect(px + 4.5, py + 4.5, CELL - 9, CELL - 9);
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

    // Кнопки: неактивны вне очереди игрока.
    if (overlay) {
      overlay.querySelectorAll('.combat-actions button').forEach((b) => {
        b.disabled = c.phase !== 'player' || !!c.result;
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
        groupType: opts.tile.mobGroup,
        groupName: G.MOB_GROUP_NAMES && G.MOB_GROUP_NAMES[opts.tile.mobGroup],
        seed: opts.seed,
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
