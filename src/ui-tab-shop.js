// Вкладка «Магазин» панели персонажа (задача 000130 — разбиение
// ui.js): секция торговли (000009). Строку «Магазина здесь нет» при
// !shop добавит задача 000101 (зона 000101 — ЭТОТ файл, в render-хуке).
//
// Чистый UMD-модуль (образец src/cities.js): node — require()
// возвращает определение вкладки (без регистрации); браузер —
// САМОРЕГИСТРАЦИЯ в Game.uiTabs при загрузке (src/ui-tabs.js обязан
// грузиться ДО этого файла — иначе console.error + без регистрации,
// игра не падает — паттерн 000053). При загрузке — НОЛЬ DOM, НОЛЬ
// require, НОЛЬ RNG.
//
// БЕЗСОСТОЯТЕЛЬНА: магазин текущего тайла — closure ядра ui.js
// (G.playerUI.setShop — main.js зовёт КАЖДЫЙ кадр; shopKey-гард ОСТАЁТСЯ
// в ядре — перенос сюда дал бы render() 30 раз/с, контракт §6.5),
// чтение — через ctx.shop. Строки предметов — общий механизм ядра
// (ctx.itemRow; у строк магазина .cp-tip НЕТ — зона 000101, 000097).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null, null);   // node: определение, без
                                            // регистрации
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const m = factory(G0, root);
    const reg = G0.uiTabs;
    if (reg && typeof reg.register === 'function') {
      for (const t of (m.tabs || [m.tab])) reg.register(t);
    } else if (root) {
      console.error('src/ui-tab-shop.js: Game.uiTabs не найден — ' +
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
  // ОДИН снапшот Game (000038): все провайдеры G.* (items/buildings/
  // map и др.) грузятся ВЫШЕ в index.html — все обращения G.* — при
  // ВЫЗОВЕ, не при загрузке.
  const G = G0 || {};

  const tab = {
    column: 1,
    id: 'shop',
    label: 'Магазин',
    build(pane, ctx) {
      // Торговля (000009) переезжает в pane «Магазин» как есть:
      // render() обновляет _shopBody in place и прячет секцию,
      // когда shop === null (000101 добавит строку «Магазина здесь
      // нет» в этот же pane).
      const shopSec = ctx.el('div', 'cp-section', 'Магазин');
      const shopBody = ctx.el('div', 'cp-items');
      shopSec.appendChild(shopBody);
      pane.appendChild(shopSec);
      ctx.panel._shopSec = shopSec;
      ctx.panel._shopBody = shopBody;
    },
    render(ctx) {
      const panel = ctx.panel;
      const c = ctx.character;
      if (!c) return;
      const shop = ctx.shop;

      // Торговля (видна, когда герой стоит у магазина). Ранний
      // return прежнего renderItems переехал в хук ЦЕЛИКОМ:
      // инвентарь/снаряжение рендерятся независимо (свои хуки).
      if (!shop) {
        panel._shopSec.style.display = 'none';
        return;
      }
      panel._shopSec.style.display = '';
      panel._shopBody.textContent = '';
      panel._shopBody.appendChild(ctx.el('div', 'cp-itemmeta',
        (G.buildingNameUi(shop.buildingType) || 'магазин') + ', богатство ' + shop.wealth + '/3'));
      for (const [id, qty] of Object.entries(shop.stock)) {
        const it = G.getItem(id);
        if (!it || qty < 1) continue;
        panel._shopBody.appendChild(ctx.itemRow(
          it.name + ' ×' + qty,
          'покупка ' + G.buyPrice(shop, id, c) + ' з',
          [['купить', 'buy', { item: id }]]));
      }
      const inv = c.inventory || { slots: [], quick: [] };
      const kinds = G.shopKindsFor(shop.buildingType) || [];
      const sellable = {};
      for (const e of inv.slots) {
        const it = G.getItem(e.id);
        if (it && kinds.includes(it.kind)) sellable[e.id] = (sellable[e.id] || 0) + e.qty;
      }
      for (const [id, qty] of Object.entries(sellable)) {
        const it = G.getItem(id);
        panel._shopBody.appendChild(ctx.itemRow(
          it.name + ' ×' + qty,
          'продажа ' + G.sellPrice(shop, id, c) + ' з',
          [['продать', 'sell', { item: id }]]));
      }
    },
  };

  return { tab };
});
