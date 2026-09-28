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
      render();
      if (!r.ok) {
        // Краткая обратная связь: причина неудачи в .cp-req на 1.5 с.
        // Пишется ПОСЛЕ render(), чтобы вспышка была видна; а через 1.5 с
        // снова render() — вернёт постоянный текст ячейки (пометка потолка
        // практикой / требование), а не зальёт её пустой строкой.
        const tr = btn.closest('tr');
        const req = tr.querySelector('.cp-req');
        if (req) {
          req.textContent = r.reason;
          setTimeout(render, 1500);
        }
      }
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
      (G.buildingNameUi(shop.buildingType) || 'магазин') + ', богатство ' + shop.wealth + '/3'));
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
        // Опыт практики: копилка и сколько нужно до следующего уровня (000013).
        const bank = (c.skillXp && c.skillXp[skill]) || 0;
        lvTd.textContent = bank > 0 && lvl < G.MAX_SKILL_LEVEL
          ? `${lvl} (${bank}/${G.skillXpForNext(lvl)})`
          : String(lvl);
        const cap = G.practiceCap(c, skill);
        if (reqTd) {
          if (lvl > 0 && lvl < G.MAX_SKILL_LEVEL && lvl >= cap) {
            const pName = ((G.PRIMARY_SKILLS.find((p) => p.id === s.primary) || {}).name) || s.primary;
            reqTd.textContent = 'потолок практикой: ' + pName + ' ' + (cap / 2) + '×2 — дальше растёт только очками и книгами';
          } else {
            reqTd.textContent = lvl > 0 ? '' : requiresText(s);
          }
        }
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

  // --- Диалог NPC (задача 000010) ---
  // Оверлей с вкладками: диалог / торговля / школа / квесты.
  // Ядро — src/npc.js (тестируется в node): доступность опций диалога,
  // торговля, обучение и журнал квестов; здесь — тонкий DOM-слой.
  // Каталог NPC — Game.NpcData.NPCS (зеркало src/npc-data.js); журнал
  // квестов передаётся из main.js (один на всю сессию игры).
  if (typeof G.dialogOptions === 'function' &&
      typeof G.createNpcShop === 'function') {
    let npc = null;          // текущий NPC (запись каталога)
    let c = null;            // персонаж (в игре — hero)
    let book = null;         // журнал квестов
    let tab = 'dialog';      // 'dialog' | 'trade' | 'train' | 'quests'
    let npcShop = null;      // сток NPC (общий на сессию; создаётся лениво)
    let onChange = null;     // хук main.js: изменение состояния → сейв
    let day = null;          // день мира на момент открытия (день выдачи квестов)
    let log = [];            // строки лога (область .combat-state)
    let overlay = null, body = null, titleText = null, logEl = null;
    let escHandler = null;   // window keydown (Esc): вешается на open, снимается на close

    const npcs = () => (G.NpcData && G.NpcData.NPCS) || [];

    function npcLog(text) {
      if (!text) return;
      log.push(text);
      if (log.length > 30) log = log.slice(-30);
    }

    // Квест по id по всему каталогу (для секции «Выполнено»: book.done
    // хранит только id).
    function questById(qid) {
      for (const n of npcs()) {
        const q = (n.квесты || []).find((x) => x.id === qid);
        if (q) return q;
      }
      return null;
    }

    // --- Вкладки ---

    function renderDialogTab() {
      for (const entry of G.dialogOptions(npc, c)) {
        const row = el('div', 'cp-itemrow');
        const btn = el('button', 'cp-btn', entry.option.текст);
        btn.dataset.npcact = 'opt';
        btn.dataset.optid = entry.option.id;
        row.appendChild(btn);
        if (!entry.доступен) {
          btn.disabled = true;
          btn.title = entry.причина;
          row.appendChild(el('span', 'cp-itemmeta', entry.причина));
        }
        body.appendChild(row);
      }
    }

    function renderTradeTab() {
      // Сток создаётся лениво и переиспользуется внутри сессии диалога.
      if (!npcShop) npcShop = G.createNpcShop(npc);
      if (!npcShop) {
        body.appendChild(el('div', 'cp-itemmeta', 'Этот NPC не торгует.'));
        return;
      }
      body.appendChild(el('div', 'cp-itemmeta', 'Золото: ' + c.gold));
      for (const p of npc.торговля.предметы) {
        const it = G.getItem(p.предмет);
        if (!it) continue;
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname',
          it.name + ' (ост. ' + (npcShop.stock[p.предмет] || 0) + ')'));
        row.appendChild(el('span', 'cp-itemmeta',
          'покупка ' + G.npcBuyPrice(npcShop, p.предмет, c) + ' з / ' +
          'продажа ' + G.npcSellPrice(npcShop, p.предмет, c) + ' з'));
        const bBuy = el('button', 'cp-btn', 'купить');
        bBuy.dataset.npcact = 'buy';
        bBuy.dataset.item = p.предмет;
        row.appendChild(bBuy);
        const bSell = el('button', 'cp-btn', 'продать');
        bSell.dataset.npcact = 'sell';
        bSell.dataset.item = p.предмет;
        if (!G.hasItem(c, p.предмет, 1)) {
          bSell.disabled = true;
          bSell.title = 'предмета нет в инвентаре';
        }
        row.appendChild(bSell);
        body.appendChild(row);
      }
    }

    function renderTrainTab() {
      const skills = G.schoolSkills(npc);
      if (!skills.length) {
        body.appendChild(el('div', 'cp-itemmeta', 'Этот NPC не обучает.'));
        return;
      }
      const price = G.schoolTrainPrice(npc);
      const refund = G.schoolRefundPrice(npc, 1);
      body.appendChild(el('div', 'cp-itemmeta', 'Свободные очки: ' + c.points));
      for (const id of skills) {
        const s = G.SECONDARY_SKILLS[id] || { name: id };
        const lvl = c.secondary[id] || 0;
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname',
          (lvl > 0 ? G.secondaryName(id, lvl) : s.name) + ' (' + lvl + ')'));
        row.appendChild(el('span', 'cp-itemmeta',
          '+1 за ' + price + ' з / вернуть 1 за ' + refund + ' з'));
        const bTrain = el('button', 'cp-btn', '+ (' + price + ' з)');
        bTrain.dataset.npcact = 'train';
        bTrain.dataset.skill = id;
        const can = G.canSchoolTrain(npc, c, id);
        if (!can.ok) { bTrain.disabled = true; bTrain.title = can.reason; }
        row.appendChild(bTrain);
        const bRefund = el('button', 'cp-btn', 'вернуть (' + refund + ' з)');
        bRefund.dataset.npcact = 'refund';
        bRefund.dataset.skill = id;
        const canRefund = G.canSchoolRefund(npc, c, id, 1);
        if (!canRefund.ok) {
          bRefund.disabled = true;
          bRefund.title = canRefund.reason;
        }
        row.appendChild(bRefund);
        body.appendChild(row);
      }
    }

    function renderQuestsTab() {
      if (!book) {
        body.appendChild(el('div', 'cp-itemmeta', 'Журнал квестов недоступен.'));
        return;
      }
      const NPCS = npcs();
      // bring_item-квесты сверяем с инвентарем перед отрисовкой.
      if (G.refreshBringItems) G.refreshBringItems(NPCS, book, c);

      const avail = el('div', 'cp-section', 'Доступны');
      const list = G.availableQuests(NPCS, book, npc);
      if (!list.length) avail.appendChild(el('div', 'cp-itemmeta', 'квестов нет'));
      for (const q of list) {
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname', q.название));
        row.appendChild(el('span', 'cp-itemmeta', q.описание));
        const b = el('button', 'cp-btn', 'взять');
        b.dataset.npcact = 'accept';
        b.dataset.quest = q.id;
        row.appendChild(b);
        avail.appendChild(row);
      }
      body.appendChild(avail);

      const active = el('div', 'cp-section', 'В работе');
      const actives = G.activeQuests(NPCS, book);
      if (!actives.length) active.appendChild(el('div', 'cp-itemmeta', 'нет активных квестов'));
      for (const { quest, instance } of actives) {
        if (!quest) continue;
        const row = el('div', 'cp-itemrow');
        row.appendChild(el('span', 'cp-itemname', quest.название));
        const goal = quest.цель;
        let meta;
        if (goal.тип === 'kill_group') {
          meta = 'повержено ' + instance.progress + ' из ' + goal.количество +
            ' — ' + (G.MOB_GROUP_NAMES[goal.группа] || 'группа ' + goal.группа);
        } else {
          const it = G.getItem(goal.предмет);
          meta = 'предмет: ' + (it ? it.name : goal.предмет) + ' ×' +
            goal.количество + ' (есть: ' + G.totalQty(c, goal.предмет) + ')';
        }
        if (instance.status === 'ready') {
          meta += ' — готов к сдаче';
          const b = el('button', 'cp-btn', 'сдать');
          b.dataset.npcact = 'turnin';
          b.dataset.quest = instance.questId;
          row.appendChild(b);
        } else {
          meta += ' — в работе';
        }
        row.appendChild(el('span', 'cp-itemmeta', meta));
        active.appendChild(row);
      }
      body.appendChild(active);

      const done = el('div', 'cp-section', 'Выполнено');
      if (!book.done.length) done.appendChild(el('div', 'cp-itemmeta', 'пока ничего'));
      for (const qid of book.done) {
        const q = questById(qid);
        done.appendChild(el('div', 'cp-itemrow', q ? q.название : qid));
      }
      body.appendChild(done);
    }

    // --- Кнопки (один обработчик на весь оверлей) ---

    function onOverlayClick(e) {
      const btn = e.target.closest('button[data-npcact]');
      if (!btn || btn.disabled || !npc) return;
      const act = btn.dataset.npcact;
      if (act === 'close') { npcClose(); return; }
      if (act === 'tab') { tab = btn.dataset.tab; renderTab(); return; }
      if (act === 'opt') {
        const entry = G.dialogOptions(npc, c)
          .find((x) => x.option.id === btn.dataset.optid);
        if (!entry || !entry.доступен) return;
        const o = entry.option;
        if (o.действие === 'подсказка') {
          npcLog(o.текст);
          renderTab();
        } else if (o.действие === 'торговля') {
          tab = 'trade';
          renderTab();
        } else if (o.действие === 'обучение') {
          tab = 'train';
          renderTab();
        } else if (o.действие === 'квесты') {
          tab = 'quests';
          renderTab();
        }
        return;
      }
      if (act === 'buy' || act === 'sell') {
        const r = act === 'buy'
          ? G.npcBuy(npcShop, c, btn.dataset.item, 1)
          : G.npcSell(npcShop, c, btn.dataset.item, 1);
        if (r.ok) {
          npcLog((act === 'buy' ? 'Куплено: ' : 'Продано: ') +
            G.getItem(r.item).name + ' за ' + r.price + ' з');
          if (onChange) onChange();
        } else {
          npcLog(r.reason);
        }
        renderTab();
        G.playerUI && G.playerUI.render();
        return;
      }
      if (act === 'train') {
        const r = G.schoolTrain(npc, c, btn.dataset.skill);
        npcLog(r.ok ? 'Уровень: ' + r.level + ' (−' + r.price + ' з)' : r.reason);
        if (r.ok && onChange) onChange();
        renderTab();
        G.playerUI && G.playerUI.render();
        return;
      }
      if (act === 'refund') {
        const r = G.schoolRefund(npc, c, btn.dataset.skill, 1);
        npcLog(r.ok ? 'Очко возвращено: +1 (−' + r.price + ' з)' : r.reason);
        if (r.ok && onChange) onChange();
        renderTab();
        G.playerUI && G.playerUI.render();
        return;
      }
      if (act === 'accept') {
        const r = G.acceptQuest(book, npcs(), npc, btn.dataset.quest, day);
        npcLog(r.ok ? 'Квест взят: ' + r.quest.название : r.reason);
        if (r.ok && onChange) onChange();
        renderTab();
        return;
      }
      if (act === 'turnin') {
        const r = G.turnInQuest(npcs(), book, c, btn.dataset.quest);
        if (r.ok) {
          let msg = 'Квест сдан: ' + r.quest.название + '. +' +
            r.reward.xp + ' опыта, +' + r.reward.gold + ' з';
          if (r.reward.items.length) {
            msg += '; ' + r.reward.items.map((g) => {
              const it = G.getItem(g.предмет);
              return (it ? it.name : g.предмет) +
                (g.количество > 1 ? ' ×' + g.количество : '');
            }).join(', ');
          }
          npcLog(msg);
        } else {
          npcLog(r.reason);
        }
        if (r.ok && onChange) onChange();
        renderTab();
        G.playerUI && G.playerUI.render();
      }
    }

    // --- Оверлей: сборка/разборка ---

    function npcCloseDom() {
      if (escHandler) {
        window.removeEventListener('keydown', escHandler);
        escHandler = null;
      }
      if (overlay) {
        overlay.remove();
        overlay = null;
      }
      body = null;
      titleText = null;
      logEl = null;
    }

    function npcClose() {
      npcCloseDom();
      npc = null;
      c = null;
      book = null;
      npcShop = null;
      onChange = null;
    }

    function npcBuild() {
      npcCloseDom(); // повторное открытие — разбирать прежний оверлей
      overlay = el('div', 'combat-overlay npc-overlay');
      const side = el('div', 'combat-side');

      const title = el('div', 'cp-title', '');
      titleText = el('span', '');
      const closeBtn = el('button', 'cp-close', 'закрыть [Esc]');
      closeBtn.dataset.npcact = 'close';
      title.appendChild(titleText);
      title.appendChild(closeBtn);
      side.appendChild(title);

      // Переключение вкладок.
      const tabsRow = el('div', 'cp-itemrow');
      for (const [t, label] of [
        ['dialog', 'диалог'], ['trade', 'торговля'],
        ['train', 'школа'], ['quests', 'квесты'],
      ]) {
        const b = el('button', 'cp-btn', label);
        b.dataset.npcact = 'tab';
        b.dataset.tab = t;
        tabsRow.appendChild(b);
      }
      side.appendChild(tabsRow);

      body = el('div', 'cp-items');
      side.appendChild(body);

      // Лог: подсказки, результаты сделок, наград.
      logEl = el('div', 'combat-state npc-log');
      side.appendChild(logEl);

      overlay.appendChild(side);
      overlay.addEventListener('click', onOverlayClick);
      document.body.appendChild(overlay);

      // Esc закрывает диалог (слушатель живёт только пока экран открыт).
      escHandler = (e) => {
        if (e.code === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          npcClose();
        }
      };
      window.addEventListener('keydown', escHandler);

      renderTab();
    }

    function renderTab() {
      if (!overlay || !npc) return;
      titleText.textContent = npc.имя + ' — ' + npc.роль;
      logEl.textContent = log.join('\n');
      logEl.scrollTop = logEl.scrollHeight;
      body.textContent = '';
      if (tab === 'dialog') renderDialogTab();
      else if (tab === 'trade') renderTradeTab();
      else if (tab === 'train') renderTrainTab();
      else renderQuestsTab();
    }

    G.npcUI = {
      /**
       * Открыть диалог NPC.
       * @param {object} o
       * @param {object} o.npc       запись каталога (Game.NpcData.NPCS)
       * @param {object} o.character персонаж
       * @param {object} o.book      журнал квестов (G.createQuestBook())
       * @param {object} o.tile      тайл постройки (x, y, building, buildingWealth)
       */
      open(o) {
        npc = o.npc;
        c = o.character;
        book = o.book;
        tab = 'dialog';
        // Сток — общий на сессию (main.js, задача 000029): переиспользуем,
        // не создавая новый; onChange — хук на изменение состояния (сейв).
        npcShop = o.shop || null;
        onChange = typeof o.onChange === 'function' ? o.onChange : null;
        day = Number.isInteger(o.day) && o.day >= 1 ? o.day : null;
        log = [npc.описание || (npc.имя + ', ' + npc.роль)];
        npcBuild();
      },
      close: npcClose,
      isActive() {
        return !!overlay;
      },
      render: () => { if (npc) renderTab(); },
    };
  }

  // --- On-screen-контролы для тачскрина (задача 000018) ---
  // Чистая логика (выбор схемы, раскладка, хит-тест, детект устройства) —
  // в src/controls.js (тестируется в node); здесь только DOM-привязка.
  // D-pad (внизу слева): удержание — движение, скольжение пальца —
  // переключение направления; кнопка «E» (внизу справа) — действие
  // (диалог NPC / вход в подземелье), то же, что клавиша [E].
  (function () {
    // controls.js ОБЯЗАН быть загружен раньше ui.js (см. index.html):
    // при отсутствии функций контролы не собираются — это ошибка порядка
    // загрузки, видимая в консоли (не «тихий» fallback).
    if (!G.layoutTouchControls || !G.touchActionAt) {
      console.error('ui.js: on-screen-контролы не собраны — ' +
        'src/controls.js должен загружаться ДО src/ui.js');
      return;
    }
    let root = null, dpadEl = null, actionEl = null;
    const arrows = {}; // dir -> span
    let shown = false;
    let layout = null;
    let heldPointer = null; // pointerId, удерживающий D-pad (один)
    let heldDir = null;
    let onHold = null, onRelease = null, onInteract = null;

    // Под кнопку полноэкранного режима (внизу справа, если она есть)
    // оставляем место: action-кнопку раскладка поднимет вверх.
    function bottomInset() {
      const fsBtn = document.querySelector('.fs-btn');
      return fsBtn ? fsBtn.offsetHeight + 12 : 0;
    }

    function applyLayout() {
      if (!root || !dpadEl || !actionEl) return;
      layout = G.layoutTouchControls(
        window.innerWidth, window.innerHeight, { bottomInset: bottomInset() });
      const place = (node, r) => {
        node.style.left = r.x + 'px';
        node.style.top = r.y + 'px';
        node.style.width = r.w + 'px';
        node.style.height = r.h + 'px';
      };
      place(dpadEl, layout.dpad);
      place(actionEl, layout.action);
      // Стрелки — в центре «лучей» D-pad (координаты внутри dpadEl).
      const d = layout.dpad;
      const off = d.w * 0.30;
      const pos = {
        up: [d.w / 2, d.w / 2 - off],
        down: [d.w / 2, d.w / 2 + off],
        left: [d.w / 2 - off, d.h / 2],
        right: [d.w / 2 + off, d.h / 2],
      };
      for (const dir of G.DIRS) {
        arrows[dir].style.left = pos[dir][0] + 'px';
        arrows[dir].style.top = pos[dir][1] + 'px';
      }
    }

    // Направление по точке, если это направление (не 'interact'/null).
    function dirAt(x, y) {
      const act = G.touchActionAt(x, y, layout);
      return act && G.DIRS.indexOf(act) >= 0 ? act : null;
    }

    function releasePointer(id) {
      if (id !== null && id !== heldPointer) return;
      heldPointer = null;
      if (heldDir && onRelease) onRelease(heldDir);
      heldDir = null;
    }

    function build() {
      root = el('div');
      root.id = 'touch-controls';
      dpadEl = el('div', 'tc-dpad');
      for (const dir of G.DIRS) {
        const a = el('span', 'tc-arrow',
          dir === 'up' ? '▲' : dir === 'down' ? '▼'
            : dir === 'left' ? '◀' : '▶');
        a.style.transform = 'translate(-50%, -50%)';
        arrows[dir] = a;
        dpadEl.appendChild(a);
      }
      actionEl = el('button', 'tc-action', 'E');
      actionEl.setAttribute('aria-label', 'Действие (диалог NPC)');

      // D-pad: down → держать направление; move → скольжение (смена
      // направления, мёртвая зона — текущее); up/cancel → отпустить.
      // setPointerCapture — pointerup доедет до D-pad даже поверх
      // оверлеев (бой/диалог), поэтому «залипший» палец не останется.
      dpadEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (heldPointer !== null) return; // второй палец на D-pad — нет
        const dir = dirAt(e.clientX, e.clientY);
        if (!dir) return; // мёртвая зона/снаружи лучей — не берём
        heldPointer = e.pointerId;
        heldDir = dir;
        if (onHold) onHold(dir);
        try { dpadEl.setPointerCapture(e.pointerId); } catch (err) { /* ie */ }
      });
      dpadEl.addEventListener('pointermove', (e) => {
        if (e.pointerId !== heldPointer || !heldDir) return;
        const dir = dirAt(e.clientX, e.clientY);
        if (!dir || dir === heldDir) return; // мёртвая зона — держим текущее
        const old = heldDir;
        heldDir = dir;
        if (onRelease) onRelease(old);
        if (onHold) onHold(dir);
      });
      const end = (e) => {
        if (e.pointerId !== heldPointer) return;
        releasePointer(e.pointerId);
      };
      dpadEl.addEventListener('pointerup', end);
      dpadEl.addEventListener('pointercancel', end);

      // Кнопка «E» — действие (аналог клавиши [E] в main.js).
      // blur() — чтобы Enter/Space на гибридных устройствах не
      // «перепечатывали» сфокусированную кнопку.
      actionEl.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (onInteract) onInteract();
        actionEl.blur();
      });

      root.appendChild(dpadEl);
      root.appendChild(actionEl);
      document.body.appendChild(root);
      window.addEventListener('resize', applyLayout);
      // Вкладка в фоне / системный жест — палец «срезан»: отпускаем.
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) releasePointer(null);
      });
    }

    G.touchControls = {
      /**
       * Инициализировать on-screen-контролы (один раз).
       * @param {{onHold: (dir: string) => void,
       *          onRelease: (dir: string) => void,
       *          onInteract: () => void}} h
       *   onHold/onRelease — 'up'|'down'|'left'|'right' (направление
       *   удерживается / отпущено), onInteract — действие (диалог).
       */
      init(h) {
        if (root) return;
        onHold = h.onHold;
        onRelease = h.onRelease;
        onInteract = h.onInteract;
        build();
      },
      show() {
        if (!root) return;
        root.classList.add('visible');
        shown = true;
        applyLayout();
      },
      hide() {
        if (!root) return;
        root.classList.remove('visible');
        shown = false;
        releasePointer(null);
      },
      isActive() { return shown; },
      releaseAll() { releasePointer(null); },
    };
  })();
})();
