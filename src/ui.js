// Панель персонажа (HTML-оверлей): статы, навыки, расход очков.
// Браузерный модуль (не тестируется в node; ядро — src/player.js).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G) return;

  let panel = null;
  let character = null;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function buildPanel() {
    panel = el('div', 'char-panel');
    panel.style.display = 'none';

    const title = el('div', 'cp-title', 'Флогистон');
    panel.appendChild(title);

    const stats = el('div', 'cp-stats');
    panel.appendChild(stats);
    panel._stats = stats;

    const closeBtn = el('button', 'cp-close', 'закрыть [I]');
    closeBtn.addEventListener('click', () => toggle(false));
    panel.appendChild(closeBtn);

    const primaries = el('div', 'cp-section', 'Основные навыки');
    const primTable = el('table', 'cp-table');
    for (const p of G.PRIMARY_SKILLS) {
      const tr = el('tr');
      tr.appendChild(el('td', 'cp-name', p.name));
      const lv = el('td', 'cp-level', '—');
      tr.appendChild(lv);
      const btn = el('button', 'cp-btn', '+');
      btn.dataset.skill = p.id;
      tr.appendChild(btn);
      primTable.appendChild(tr);
    }
    primaries.appendChild(primTable);
    panel.appendChild(primaries);

    // Вторичные навыки по группам основных.
    for (const p of G.PRIMARY_SKILLS) {
      const section = el('div', 'cp-section', p.name);
      const table = el('table', 'cp-table');
      for (const [id, s] of Object.entries(G.SECONDARY_SKILLS)) {
        if (s.primary !== p.id) continue;
        const tr = el('tr');
        tr.appendChild(el('td', 'cp-name')); // имя подставится при render
        tr.appendChild(el('td', 'cp-req', ''));
        const lv = el('td', 'cp-level', '—');
        tr.appendChild(lv);
        const btn = el('button', 'cp-btn', '+');
        btn.dataset.skill = id;
        tr.appendChild(btn);
        table.appendChild(tr);
      }
      section.appendChild(table);
      panel.appendChild(section);
    }

    // Кнопки прокачки — один обработчик на панель.
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('.cp-btn');
      if (!btn || !character) return;
      const r = G.raiseSkill(character, btn.dataset.skill);
      if (!r.ok) {
        // Показываем причину в названии строки (краткая обратная связь).
        const tr = btn.closest('tr');
        const req = tr.querySelector('.cp-req');
        if (req) req.textContent = r.reason;
        setTimeout(() => { if (req) req.textContent = ''; }, 1500);
      }
      render();
    });

    document.body.appendChild(panel);
  }

  function requiresText(s) {
    if (!s.requires) return '';
    const id = s.requires.skill;
    const name = G.PRIMARY_SKILLS.some((p) => p.id === id)
      ? G.PRIMARY_SKILLS.find((p) => p.id === id).name
      : (G.SECONDARY_SKILLS[id] || { name: id }).name;
    return `${name} ${s.requires.level}`;
  }

  function render() {
    if (!panel || !character) return;
    const c = character;
    const d = G.derived(c);
    panel._stats.textContent =
      `Уровень ${c.level}  |  Опыт ${c.xp}/${G.xpForNext(c.level)}\n` +
      `HP ${c.hp}/${d.maxHP}  |  MP ${c.mp}/${d.maxMP}  |  Броня ${d.armor}\n` +
      `Золото: ${c.gold}  |  Свободные очки: ${c.points}`;

    // Все строки — по кнопке (data-skill): основные и вторичные навыки.
    panel.querySelectorAll('.cp-btn').forEach((btn) => {
      const skill = btn.dataset.skill;
      const tr = btn.closest('tr');
      const nameTd = tr.querySelector('.cp-name');
      const lvTd = tr.querySelector('.cp-level');
      const reqTd = tr.querySelector('.cp-req');
      if (G.PRIMARY_SKILLS.some((p) => p.id === skill)) {
        lvTd.textContent = String(c.primary[skill]);
        btn.disabled = !G.canRaise(c, skill).ok;
      } else {
        const s = G.SECONDARY_SKILLS[skill];
        const lvl = c.secondary[skill] || 0;
        nameTd.textContent = lvl > 0 ? `${G.secondaryName(skill, lvl)} (${lvl})` : s.name;
        lvTd.textContent = String(lvl);
        if (reqTd) reqTd.textContent = lvl > 0 ? '' : requiresText(s);
        btn.disabled = !G.canRaise(c, skill).ok;
      }
    });
  }

  function toggle(force) {
    if (!panel) buildPanel();
    if (!character) return;
    const show = force != null ? force : panel.style.display === 'none';
    panel.style.display = show ? 'block' : 'none';
    if (show) render();
  }

  G.playerUI = {
    setCharacter(c) {
      character = c;
      if (panel) render();
    },
    toggle,
    render,
    isOpen() {
      return !!panel && panel.style.display === 'block';
    },
  };
})();
