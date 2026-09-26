// Панель персонажа (HTML-оверлей): статы, навыки, расход очков.
// Браузерный модуль (не тестируется в node; ядро — src/player.js).

(function () {
  'use strict';
  const G = globalThis.Game;
  if (!G) return;

  let panel = null;
  let character = null;
  let shop = null;      // текущий магазин (main.js передаёт стоящий тайл)
  let shopKey = '';
  let notice = null;

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

    // --- Снаряжение / быстрые слоты / инвентарь / торговля (000009) ---
    const equipSec = el('div', 'cp-section', 'Снаряжение');
    const equipBody = el('div', 'cp-items');
    equipSec.appendChild(equipBody);
    panel.appendChild(equipSec);
    panel._equipBody = equipBody;

    const quickSec = el('div', 'cp-section', 'Быстрые слоты (бой)');
    const quickBody = el('div', 'cp-items');
    quickSec.appendChild(quickBody);
    panel.appendChild(quickSec);
    panel._quickBody = quickBody;

    const invSec = el('div', 'cp-section', 'Инвентарь');
    const invBody = el('div', 'cp-items');
    invSec.appendChild(invBody);
    panel.appendChild(invSec);
    panel._invBody = invBody;

    const shopSec = el('div', 'cp-section', 'Торговля');
    const shopBody = el('div', 'cp-items');
    shopSec.appendChild(shopBody);
    panel.appendChild(shopSec);
    panel._shopSec = shopSec;
    panel._shopBody = shopBody;

    notice = el('div', 'cp-notice', '');
    panel.appendChild(notice);

    // Один обработчик кликов на всю панель: прокачка + предметы/торговля.
    panel.addEventListener('click', (e) => {
      const btn = e.target.closest('.cp-btn');
      if (!btn || !character) return;
      if (btn.dataset.act) {
        doItemAction(btn);
        render();
        return;
      }
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

  // Краткая обратная связь по действиям с предметами.
  function flashNotice(text) {
    if (!notice || !text) return;
    notice.textContent = text;
    notice.style.opacity = '1';
    clearTimeout(flashNotice._t);
    flashNotice._t = setTimeout(() => { notice.style.opacity = '0'; }, 2500);
  }

  // Действия с предметами (кнопки dataset.act в секциях панели).
  function doItemAction(btn) {
    const c = character;
    const id = btn.dataset.item;
    let r = { ok: true };
    switch (btn.dataset.act) {
      case 'use': r = G.useItem(c, id); break;
      case 'equip': r = G.equip(c, id); break;
      case 'unequip': r = G.unequip(c, btn.dataset.equipslot); break;
      case 'remove': r = G.removeItem(c, id, 1); break;
      case 'quick': {
        const s = G.freeQuickSlot(c);
        r = s == null ? { ok: false, reason: 'все быстрые слоты заняты' }
                      : G.setQuick(c, s, id);
        break;
      }
      case 'quick-clear': r = G.clearQuick(c, Number(btn.dataset.slot)); break;
      case 'buy': if (shop) r = G.buyItem(shop, c, id, 1); break;
      case 'sell': if (shop) r = G.sellItem(shop, c, id, 1); break;
    }
    if (r && !r.ok) flashNotice(r.reason || 'не удалось');
    else if (r && r.message) flashNotice(r.message);
    else if (r && r.ok && btn.dataset.act === 'buy') {
      flashNotice('Куплено: ' + G.getItem(id).name + ' за ' + r.price + ' з');
    } else if (r && r.ok && btn.dataset.act === 'sell') {
      flashNotice('Продано: ' + G.getItem(id).name + ' за ' + r.price + ' з');
    }
    return r;
  }

  // Строка предмета в секциях панели.
  function itemRow(name, meta, buttons) {
    const div = el('div', 'cp-itemrow');
    div.appendChild(el('span', 'cp-itemname', name));
    if (meta) div.appendChild(el('span', 'cp-itemmeta', meta));
    for (const [label, act, data] of buttons || []) {
      const b = el('button', 'cp-btn', label);
      b.dataset.act = act;
      for (const [k, v] of Object.entries(data)) b.dataset[k] = v;
      div.appendChild(b);
    }
    return div;
  }

  // Секции снаряжения, быстрых слотов, инвентаря и торговли.
  function renderItems() {
    if (!panel || !character) return;
    const c = character;
    const inv = c.inventory || { slots: [], quick: [] };

    // Снаряжение.
    const eq = c.equipment || { weapon: null, armor: null };
    panel._equipBody.textContent = '';
    const wep = eq.weapon ? G.getItem(eq.weapon) : null;
    panel._equipBody.appendChild(itemRow(
      wep ? wep.name : '— без оружия —',
      wep ? 'урон ' + wep.stats.damage : '',
      wep ? [['снять', 'unequip', { equipslot: 'weapon' }]] : []));
    const arm = eq.armor ? G.getItem(eq.armor) : null;
    panel._equipBody.appendChild(itemRow(
      arm ? arm.name : '— без брони —',
      arm ? 'броня +' + arm.stats.armor : '',
      arm ? [['снять', 'unequip', { equipslot: 'armor' }]] : []));

    // Быстрые слоты.
    panel._quickBody.textContent = '';
    for (let i = 0; i < G.QUICK_SLOTS; i++) {
      const qid = inv.quick[i];
      const q = qid ? G.getItem(qid) : null;
      panel._quickBody.appendChild(itemRow(
        'Слот ' + (i + 1) + ': ' + (q ? q.name : '— пусто —'),
        '',
        q ? [['убрать', 'quick-clear', { slot: i }]] : []));
    }

    // Инвентарь.
    panel._invBody.textContent = '';
    if (!inv.slots.length) {
      panel._invBody.appendChild(el('div', 'cp-itemmeta',
        'пусто (' + G.INVENTORY_SLOTS + ' слотов)'));
    }
    for (const e of inv.slots) {
      const it = G.getItem(e.id);
      if (!it) continue;
      const btns = [];
      if (it.kind === 'potion' || it.kind === 'food' || it.kind === 'skill_book') {
        btns.push(['исп.', 'use', { item: e.id }]);
      }
      if (it.kind === 'weapon' || it.kind === 'armor') {
        btns.push(['надеть', 'equip', { item: e.id }]);
      }
      btns.push(['быстр.', 'quick', { item: e.id }]);
      btns.push(['−1', 'remove', { item: e.id }]);
      panel._invBody.appendChild(itemRow(
        it.name + (e.qty > 1 ? ' ×' + e.qty : ''),
        (it.weight * e.qty).toFixed(1) + ' кг, ' + it.value + ' з',
        btns));
    }

    // Торговля (видна, когда герой стоит у магазина).
    if (!shop) {
      panel._shopSec.style.display = 'none';
      return;
    }
    panel._shopSec.style.display = '';
    panel._shopBody.textContent = '';
    panel._shopBody.appendChild(el('div', 'cp-itemmeta',
      (G.BUILDING_NAMES[shop.buildingType] || 'магазин') + ', богатство ' + shop.wealth + '/3'));
    for (const [id, qty] of Object.entries(shop.stock)) {
      const it = G.getItem(id);
      if (!it || qty < 1) continue;
      panel._shopBody.appendChild(itemRow(
        it.name + ' ×' + qty,
        'покупка ' + G.buyPrice(shop, id, c) + ' з',
        [['купить', 'buy', { item: id }]]));
    }
    const kinds = G.shopKindsFor(shop.buildingType) || [];
    const sellable = {};
    for (const e of inv.slots) {
      const it = G.getItem(e.id);
      if (it && kinds.includes(it.kind)) sellable[e.id] = (sellable[e.id] || 0) + e.qty;
    }
    for (const [id, qty] of Object.entries(sellable)) {
      const it = G.getItem(id);
      panel._shopBody.appendChild(itemRow(
        it.name + ' ×' + qty,
        'продажа ' + G.sellPrice(shop, id, c) + ' з',
        [['продать', 'sell', { item: id }]]));
    }
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
    const eqA = G.equipmentStats ? G.equipmentStats(c).armor : 0;
    const w = G.inventoryWeight(c);
    const maxW = G.maxCarryWeight(c);
    panel._stats.textContent =
      `Уровень ${c.level}  |  Опыт ${c.xp}/${G.xpForNext(c.level)}\n` +
      `HP ${c.hp}/${d.maxHP}  |  MP ${c.mp}/${d.maxMP}  |  Броня ${d.armor + eqA}\n` +
      `Золото: ${c.gold}  |  Свободные очки: ${c.points}\n` +
      `Вес: ${w.toFixed(1)}/${maxW.toFixed(1)} кг  |  Слоты: ${G.slotCount(c)}/${G.INVENTORY_SLOTS}`;

    // Все строки — по кнопке (data-skill): основные и вторичные навыки.
    // Кнопки предметов/торговли (data-act) вне таблицы — пропускаем.
    panel.querySelectorAll('.cp-btn').forEach((btn) => {
      const skill = btn.dataset.skill;
      if (!skill) return;
      const tr = btn.closest('tr');
      if (!tr) return;
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

    renderItems();
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
    // Магазин текущего тайла (или null) — секция «Торговля».
    setShop(s) {
      shop = s;
      const key = s ? s.x + ',' + s.y + ',' + s.buildingType + ',' + s.wealth : '';
      if (key === shopKey) return;
      shopKey = key;
      if (panel) render();
    },
    toggle,
    render,
    isOpen() {
      return !!panel && panel.style.display === 'block';
    },
  };
})();
