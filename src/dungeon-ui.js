// Подземелье (HTML-оверлей): карта лабиринта, состояние, журнал.
// Браузерный модуль (ядро — src/dungeon.js, тестируется в node).
//
// Управление: стрелки / WASD / ЦФЫВ — шаг. Выход — клетка «X».
// Логика (мобы, сундуки, выход) живёт в main.js; оверлей — только
// отрисовка и передача клавиш в onMove.

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G || !G.createDungeon) return;

  let ctx = null; // { get state, onMove, open }
  let overlay = null, canvas = null, g2 = null, stateEl = null, logEl = null;
  let cell = 20;

  function isActive() {
    return !!ctx && ctx.open;
  }

  // state — функция или само состояние (getter из main.js).
  function state() {
    const s = ctx.state;
    return typeof s === 'function' ? s() : s;
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
    if (G.combatUI && G.combatUI.isActive()) return; // бой выше по стеку
    const d = keyDir(e.code);
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    ctx.onMove(d[0], d[1]);
    render();
  });

  function build() {
    overlay = document.createElement('div');
    overlay.className = 'combat-overlay dungeon-overlay';

    const box = document.createElement('div');
    box.className = 'combat-box';

    const s = state();
    const d = s.dg;
    cell = d.width <= 27 ? 22 : 18;
    canvas = document.createElement('canvas');
    canvas.width = d.width * cell;
    canvas.height = d.height * cell;
    box.appendChild(canvas);
    g2 = canvas.getContext('2d');

    const side = document.createElement('div');
    side.className = 'combat-side';
    stateEl = document.createElement('div');
    stateEl.className = 'combat-state';
    side.appendChild(stateEl);
    logEl = document.createElement('div');
    logEl.className = 'combat-log';
    side.appendChild(logEl);
    const hint = document.createElement('div');
    hint.className = 'combat-state';
    hint.textContent = 'Стрелки/WASD — шаг.\nЖёлтая клетка «X» — выход.\nЗолотое — сундук, красное — мобы.';
    side.appendChild(hint);

    overlay.appendChild(box);
    overlay.appendChild(side);
    document.body.appendChild(overlay);
  }

  function render() {
    if (!ctx || !ctx.open) return;
    const s = state();
    if (!s) return;
    const d = s.dg, c = s.contents;

    g2.fillStyle = '#0a0d12';
    g2.fillRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < d.height; y++) {
      for (let x = 0; x < d.width; x++) {
        if (d.cells[y * d.width + x] !== G.CELL_FLOOR) continue;
        g2.fillStyle = '#182029';
        g2.fillRect(x * cell, y * cell, cell, cell);
      }
    }
    // Выход.
    g2.fillStyle = '#d4b45a';
    g2.fillRect(d.exit.x * cell + 2, d.exit.y * cell + 2, cell - 4, cell - 4);
    g2.fillStyle = '#101418';
    g2.font = 'bold ' + (cell - 8) + 'px ui-monospace, monospace';
    g2.textAlign = 'center';
    g2.fillText('X', d.exit.x * cell + cell / 2, d.exit.y * cell + cell - 5);
    // Вход (откуда зашли).
    g2.fillStyle = '#3f9d55';
    g2.fillRect(d.entrance.x * cell + 4, d.entrance.y * cell + 4, cell - 8, cell - 8);

    // Сундуки.
    for (const ch of c.chests) {
      if (ch.opened) continue;
      g2.fillStyle = '#e0b13c';
      g2.fillRect(ch.x * cell + 3, ch.y * cell + 3, cell - 6, cell - 6);
      g2.fillStyle = '#7a5c16';
      g2.fillRect(ch.x * cell + 3, ch.y * cell + cell / 2 - 1, cell - 6, 2);
    }
    // Мобы (блуждающие группы).
    for (const m of c.mobs) {
      if (m.defeated) continue;
      g2.fillStyle = m.boss ? '#b06ad4' : '#d9483b';
      g2.fillRect(m.x * cell + 3, m.y * cell + 3, cell - 6, cell - 6);
      g2.fillStyle = '#fff';
      g2.font = (cell - 10) + 'px ui-monospace, monospace';
      g2.fillText(String(m.level), m.x * cell + cell / 2, m.y * cell + cell / 2 + 3);
    }
    // Игрок.
    const px = (s.x + 0.5) * cell, py = (s.y + 0.5) * cell, r = cell * 0.3;
    g2.fillStyle = '#8cf2fc';
    g2.beginPath();
    g2.moveTo(px, py - r);
    g2.lineTo(px + r, py);
    g2.lineTo(px, py + r);
    g2.lineTo(px - r, py);
    g2.closePath();
    g2.fill();

    const p = s.heroRef ? s.heroRef() : null;
    const dist = Math.abs(s.x - d.exit.x) + Math.abs(s.y - d.exit.y);
    stateEl.textContent =
      G.DUNGEON_NAMES[d.type] + '  (' + s.x + ', ' + s.y + ')\n' +
      'До выхода: ' + dist + ' клеток (на глаз)\n' +
      'Группы: ' + c.mobs.filter((m) => !m.defeated).length +
      '  |  Сундуки: ' + c.chests.filter((x) => !x.opened).length;
    logEl.textContent = (s.log || []).slice(-8).join('\n');
  }

  G.dungeonUI = {
    start(opts) {
      if (isActive()) return;
      ctx = { open: true, ...opts };
      build();
      render();
    },
    close() {
      if (!ctx) return;
      if (overlay) overlay.remove();
      overlay = canvas = g2 = stateEl = logEl = null;
      ctx = null;
    },
    isActive,
    render,
  };
})();
