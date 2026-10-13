(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null);
  } else {
    factory(root);
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (root) {
  function fullRest(ctx) {
    const r = ctx && ctx.r;
    if (!r || r.ok !== true || r.success !== true) {
      return { ok: false, message: 'недоступно' };
    }
    const h = ctx && ctx.hero;
    if (!h || typeof h !== 'object') {
      return { ok: false, message: 'недоступно' };
    }
    const g = Number.isFinite(h.gold) ? h.gold : 0;
    if (g < r.цена) {
      return { ok: false, message: 'мало золота (нужно ' + r.цена + ')' };
    }
    h.gold = g - r.цена;
    h.hp = r.maxHP;
    h.mp = r.maxMP;
    return { ok: true };
  }
  if (root === null) {
    return { fullRest };
  }
  const G = typeof root.Game === 'object' ? root.Game : null;
  if (!G) {
    return;
  }
  if (!G.buildingActions ||
      typeof G.buildingActions.registerSpecial !== 'function') {
    console.error('building-effect-fullrest.js: Game.buildingActions ' +
      'отсутствует — src/building-actions.js обязан грузиться ДО ' +
      'этого модуля («Полный отдых» не работает)');
    return;
  }
  G.buildingActions.registerSpecial(
    'fullrest', (ctx) => fullRest(ctx));
});
