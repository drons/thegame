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
            || it.kind === 'spell_scroll') { // 000133: изучение свитком
          btns.push(['исп.', 'use', { item: e.id }]);
        }
        if (it.kind === 'weapon' || it.kind === 'armor') {
          btns.push(['надеть', 'equip', { item: e.id }]);
        }
        btns.push(['быстр.', 'quick', { item: e.id }]);
        btns.push(['−1', 'remove', { item: e.id }]);
        panel._invBody.appendChild(ctx.itemRow(
          it.name + (e.qty > 1 ? ' ×' + e.qty : ''),
          (it.weight * e.qty).toFixed(1) + ' кг, ' + it.value + ' з',
          btns,
          ctx.itemTipText(it)));
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

      // Снаряжение.
      const eq = c.equipment || { weapon: null, armor: null };
      panel._equipBody.textContent = '';
      const wep = eq.weapon ? G.getItem(eq.weapon) : null;
      // Тултипы (000097) — только у ЗАПОЛНЕННЫХ строк; пустые
      // («— без оружия —» и т.п.) их не получают.
      panel._equipBody.appendChild(ctx.itemRow(
        wep ? wep.name : '— без оружия —',
        wep ? 'урон ' + wep.stats.damage : '',
        wep ? [['снять', 'unequip', { equipslot: 'weapon' }]] : [],
        wep ? ctx.itemTipText(wep) : null));
      const arm = eq.armor ? G.getItem(eq.armor) : null;
      panel._equipBody.appendChild(ctx.itemRow(
        arm ? arm.name : '— без брони —',
        arm ? 'броня +' + arm.stats.armor : '',
        arm ? [['снять', 'unequip', { equipslot: 'armor' }]] : [],
        arm ? ctx.itemTipText(arm) : null));

      // Быстрые слоты.
      panel._quickBody.textContent = '';
      for (let i = 0; i < G.QUICK_SLOTS; i++) {
        const qid = inv.quick[i];
        const q = qid ? G.getItem(qid) : null;
        panel._quickBody.appendChild(ctx.itemRow(
          'Слот ' + (i + 1) + ': ' + (q ? q.name : '— пусто —'),
          '',
          q ? [['убрать', 'quick-clear', { slot: i }]] : [],
          q ? ctx.itemTipText(q) : null));
      }
    },
  };

  return { tab: inventoryTab, tabs: [inventoryTab, equipmentTab] };
});
