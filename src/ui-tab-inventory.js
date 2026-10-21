// Вкладки «Инвентарь» (column 0) и «Снаряжение» (column 1) панели
// персонажа (задача 000130 — разбиение ui.js): инвентарь,
// экипировка (оружие/броня) и быстрые слоты боя. ДВЕ вкладки в ОДНОМ
// файле: pending-задач на обе нет (зона 000101 — только магазин) →
// изолироваться не обязаны; связующий критерий ТЗ (следующая
// вкладка — БЕЗ правок ui.js и чужих вкладочных файлов) выполнен.
//
// Чистый UMD-модуль (образец src/cities.js): node — require()
// возвращает определения вкладок (без регистрации); браузер —
// САМОРЕГИСТРАЦИЯ обеих в Game.uiTabs при загрузке (src/ui-tabs.js
// обязан грузиться ДО этого файла — иначе console.error + без
// регистрации, игра не падает — паттерн 000053). При загрузке — НОЛЬ
// DOM, НОЛЬ require, НОЛЬ RNG.
//
// Строки предметов — ОБЩИЙ механизм ядра (ctx.itemRow/ctx.itemTipText,
// 000097 — доступен ЛЮБОЙ вкладке, как ctx.el); кнопки data-act
// обрабатывает ядро (doItemAction). Модуль БЕЗСОСТОЯТЕЛЕН: персонаж —
// closure ядра ui.js, чтение — через ctx.character.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null, null);   // node: определение, без
                                            // регистрации
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const m = factory(G0, root);
    const reg = G0.uiTabs;
    if (reg && typeof reg.register === 'function') {
      // ДВЕ вкладки в одном файле: m.tabs (m.tab — первая).
      for (const t of (m.tabs || [m.tab])) reg.register(t);
    } else if (root) {
      console.error('src/ui-tab-inventory.js: Game.uiTabs не найден — ' +
        'src/ui-tabs.js должен грузиться ДО вкладочных модулей ' +
        '(задача 000130)');
    }
    // «Модуль заменяет Game» (000018/000038): реестр — ТОТ ЖЕ
    // объект-ссылка (мутация in place, не новый объект — 000038-
    // ловушка a3).
    root.Game = Object.assign({}, G0, m.game || {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function (G0, rootRef) {
  'use strict';
  // ОДИН снапшот Game (000038): все провайдеры G.* (player/items/
  // buildings и др.) грузятся ВЫШЕ в index.html — все обращения G.* —
  // при ВЫЗОВЕ, не при загрузке.
  const G = G0 || {};

  function iconOf(it) {
    return (it && typeof it.icon === 'string' && it.icon !== '')
      ? it.icon : null;
  }

  // 000230.07: подписи строк «Снаряжения» (порядок/подписи — ДАННЫЕ
  // UI, не данные каталога; порядок СЛотов — G.EQUIP_SLOTS/
  // G.RING_SLOTS, единый источник .02). Неизвестный слот (будущий) —
  // голый id (тихо, паттерн 000029).
  const SLOT_LABELS = {
    head: 'Голова', ears: 'Уши', neck: 'Шея', torso: 'Корпус',
    forearms: 'Предплечья', right_hand: 'Правая рука',
    left_hand: 'Левая рука', palms: 'Ладони', legs: 'Ноги',
    feet: 'Ступни',
    ring_left_1: 'Левое кольцо 1', ring_left_2: 'Левое кольцо 2',
    ring_left_3: 'Левое кольцо 3', ring_left_4: 'Левое кольцо 4',
    ring_right_1: 'Правое кольцо 1', ring_right_2: 'Правое кольцо 2',
    ring_right_3: 'Правое кольцо 3', ring_right_4: 'Правое кольцо 4',
  };
  const RING_GROUP_LABEL = 'Кольца';
  const EFIR_BLOCKED = '— дух не экипируется —';

  // Строка «Снаряжения»: meta бит-в-бит с прежними строками оружия/
  // брони (пин 237-INV-2 «урон 5»); без статов (tool/ring/shield/
  // artifact) — '' (шов .02 «урон undefined» закрыт).
  function equipMeta(it) {
    if (it.stats && typeof it.stats.damage === 'number') {
      return 'урон ' + it.stats.damage;
    }
    if (it.stats && typeof it.stats.armor === 'number') {
      return 'броня +' + it.stats.armor;
    }
    return '';
  }

  // 000230.07: «надеть» — для ВСЕХ 6 kind'ов EQUIP_KINDS (контракт
  // memory/000230.02 §5); ядро отсутствует (регрессия порядка) —
  // прежняя ветка weapon/armor (деградация, игра не падает).
  function isEquipKind(it) {
    const K = G.EQUIP_KINDS;
    if (K && typeof K.has === 'function') return K.has(it.kind);
    return it.kind === 'weapon' || it.kind === 'armor';
  }

  // Деградация без ядра «Снаряжения» — ОДИН раз (паттерн core-
  // error-флагов ui.js).
  let equipCoreErrorShown = false;

  const inventoryTab = {
    column: 0,
    id: 'inventory',
    label: 'Инвентарь',
    build(pane, ctx) {
      const sec = ctx.el('div', 'cp-section', 'Инвентарь');
      const invBody = ctx.el('div', 'cp-items');
      sec.appendChild(invBody);
      pane.appendChild(sec);
      ctx.panel._invBody = invBody;
    },
    render(ctx) {
      const panel = ctx.panel;
      const c = ctx.character;
      if (!c) return;
      const inv = c.inventory || { slots: [], quick: [] };

      // Инвентарь.
      panel._invBody.textContent = '';
      if (!inv.slots.length) {
        panel._invBody.appendChild(ctx.el('div', 'cp-itemmeta',
          'пусто (' + G.INVENTORY_SLOTS + ' слотов)'));
      }
      for (const e of inv.slots) {
        const it = G.getItem(e.id);
        if (!it) continue;
        const btns = [];
        if (it.kind === 'potion' || it.kind === 'food'
            || it.kind === 'skill_book'
            || it.kind === 'spell_scroll'
            || it.kind === 'craft_scroll') { // 000133: изучение свитком;
                                             // 000232: чертёж вида крафта
          btns.push(['исп.', 'use', { item: e.id }]);
        }
        if (isEquipKind(it)) {
          btns.push(['надеть', 'equip', { item: e.id }]);
        }
        btns.push(['быстр.', 'quick', { item: e.id }]);
        btns.push(['−1', 'remove', { item: e.id }]);
        panel._invBody.appendChild(ctx.itemRow(
          it.name + (e.qty > 1 ? ' ×' + e.qty : ''),
          (it.weight * e.qty).toFixed(1) + ' кг, ' + it.value + ' з',
          btns,
          ctx.itemTipText(it, c),
          iconOf(it),
          it.rarity));
      }
    },
  };

  const equipmentTab = {
    column: 1,
    id: 'equipment',
    label: 'Снаряжение',
    build(pane, ctx) {
      const equipSec = ctx.el('div', 'cp-section', 'Снаряжение');
      const equipBody = ctx.el('div', 'cp-items');
      equipSec.appendChild(equipBody);
      pane.appendChild(equipSec);
      ctx.panel._equipBody = equipBody;

      const quickSec = ctx.el('div', 'cp-section', 'Быстрые слоты (бой)');
      const quickBody = ctx.el('div', 'cp-items');
      quickSec.appendChild(quickBody);
      pane.appendChild(quickSec);
      ctx.panel._quickBody = quickBody;
    },
    render(ctx) {
      const panel = ctx.panel;
      const c = ctx.character;
      if (!c) return;
      const inv = c.inventory || { slots: [], quick: [] };

      // 000230.07: Снаряжение — лист АКТИВНОГО member (live-getter
      // ядра; hero — ctx.character бит-в-бит; merc — live-лист
      // 000230.06; efir — заблокированные строки «дух не
      // экипируется»). READ-БЕЗ-ensureEquipment (D-READ, memory §6):
      // render без побочных эффектов; сейв-загрузка уже
      // нормализует (sanitizeEquipment, 000230.02 §2.6).
      const m = ctx.activeMember;
      const sheet = (m && m.kind === 'merc') ? m.sheet : c;
      const isEfir = !!(m && m.kind === 'efir');
      const eq = (sheet.equipment && typeof sheet.equipment === 'object'
        && !Array.isArray(sheet.equipment)) ? sheet.equipment : {};

      panel._equipBody.textContent = '';
      const groups = (G.EQUIP_SLOTS && typeof G.EQUIP_SLOTS === 'object'
        && !Array.isArray(G.EQUIP_SLOTS)) ? G.EQUIP_SLOTS : null;
      const rings = Array.isArray(G.RING_SLOTS) ? G.RING_SLOTS : null;
      if (!groups || !rings) {
        // items.js не загрузился (недостижимо: порядок пин index-
        // order) — поведение ДО .07: 2 строки weapon/armor.
        if (!equipCoreErrorShown) {
          equipCoreErrorShown = true;
          console.error('src/ui-tab-inventory.js: ' +
            'Game.EQUIP_SLOTS/RING_SLOTS не найдены — src/items.js ' +
            'обязан грузиться ДО вкладочных модулей (задача ' +
            '000230.02); «Снаряжение» — 2 строки weapon/armor');
        }
        const wep = eq.weapon ? G.getItem(eq.weapon) : null;
        panel._equipBody.appendChild(ctx.itemRow(
          wep ? wep.name : '— без оружия —',
          wep ? 'урон ' + wep.stats.damage : '',
          wep ? [['снять', 'unequip', { equipslot: 'weapon' }]] : [],
          wep ? ctx.itemTipText(wep) : null,
          wep ? iconOf(wep) : null));
        const arm = eq.armor ? G.getItem(eq.armor) : null;
        panel._equipBody.appendChild(ctx.itemRow(
          arm ? arm.name : '— без брони —',
          arm ? 'броня +' + arm.stats.armor : '',
          arm ? [['снять', 'unequip', { equipslot: 'armor' }]] : [],
          arm ? ctx.itemTipText(arm) : null,
          arm ? iconOf(arm) : null));
      } else {
        let ringFilled = 0;
        for (const rs of rings) {
          if (typeof eq[rs] === 'string') ringFilled++;
        }
        const addRow = (name, meta, buttons, tip, icon, rarity) => {
          panel._equipBody.appendChild(ctx.itemRow(
            name, meta, buttons, tip, icon, rarity));
        };
        // Заполненный физ. слот: «<Часть>: <предмет>» + «снять»
        // (data-equipslot = ФИЗ. СЛОТ, не алиас — пин EQ-2) +
        // тултип (000097, лист member: set-строки по sheet) +
        // иконка/рамка.
        const addSlot = (label, slot) => {
          if (isEfir) {
            addRow(label + ': ' + EFIR_BLOCKED, '', [], null, null);
            return;
          }
          const id = (typeof eq[slot] === 'string') ? eq[slot] : null;
          const it = id ? G.getItem(id) : null;
          if (it) {
            addRow(label + ': ' + it.name, equipMeta(it),
              [['снять', 'unequip', { equipslot: slot }]],
              ctx.itemTipText(it, sheet), iconOf(it), it.rarity);
          } else {
            addRow(label + ': — пусто —', '', [], null, null);
          }
        };
        // 19 строк (контракт memory §2): 11 групп EQUIP_SLOTS в
        // канон-порядке (группа 'ring' — сводная «Кольца: N/8» БЕЗ
        // кнопки/tip/иконки) + 8 физ. строк RING_SLOTS концом.
        for (const key of Object.keys(groups)) {
          const g = groups[key];
          if (g === 'ring') {
            addRow(isEfir
              ? RING_GROUP_LABEL + ': ' + EFIR_BLOCKED
              : RING_GROUP_LABEL + ': ' + ringFilled + '/8',
              '', [], null, null);
          } else {
            addSlot(SLOT_LABELS[g] || g, g);
          }
        }
        for (const rs of rings) {
          addSlot(SLOT_LABELS[rs] || rs, rs);
        }
      }

      // Быстрые слоты (000194): запись АКТИВНОГО персонажа
      // (ctx.activeCharId, 000145): Флогистон (дефолт,
      // activeCharId == null) — hero.inventory.quick бит-в-бит;
      // остальные ('efir'/npcId) — запись ОБЩЕЙ map ctx.allyQuick
      // (G.playerUI.setAllyQuick, live-ссылка main.js); без записи —
      // 3 «— пусто —» (раздать можно). 000230.07: +рамка (у
      // расходников null) + c в тултип (строки не меняются).
      panel._quickBody.textContent = '';
      const mid = ctx.activeCharId == null
        ? 'flogiston' : String(ctx.activeCharId);
      const quick = mid === 'flogiston'
        ? (inv.quick || [null, null, null])
        : ((ctx.allyQuick && Array.isArray(ctx.allyQuick[mid]))
           ? ctx.allyQuick[mid] : [null, null, null]);
      for (let i = 0; i < G.QUICK_SLOTS; i++) {
        const qid = quick[i];
        const q = qid ? G.getItem(qid) : null;
        panel._quickBody.appendChild(ctx.itemRow(
          'Слот ' + (i + 1) + ': ' + (q ? q.name : '— пусто —'),
          '',
          q ? [['убрать', 'quick-clear', { slot: i }]] : [],
          q ? ctx.itemTipText(q, c) : null,
          q ? iconOf(q) : null,
          q ? q.rarity : null));
      }
    },
  };

  return { tab: inventoryTab, tabs: [inventoryTab, equipmentTab] };
});
