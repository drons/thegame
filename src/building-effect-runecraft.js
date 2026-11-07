(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    factory().register(typeof root.Game === 'object' ? root.Game : {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  function handle(ctx) {
    const r = ctx && ctx.r;
    if (!r || !r.ok || !r.success) {
      return { ok: false, message: (r && r.message) || '' };
    }
    const hero = ctx.hero;
    const game = ctx.world && ctx.world.game;
    if (!hero || typeof hero !== 'object' || !game
        || typeof game.setItemRunes !== 'function') {
      return { ok: false, message: 'недоступно' };
    }
    if (!r.slot || typeof r.slot !== 'string') {
      return { ok: false, message: 'недоступно' };
    }
    if (!Number.isInteger(r.cost) || r.cost < 1) {
      return { ok: false, message: 'недоступно' };
    }
    const eb = (hero.equipmentBonus && typeof hero.equipmentBonus === 'object'
      && !Array.isArray(hero.equipmentBonus)) ? hero.equipmentBonus : {};
    const cur = eb[r.slot];
    const owned = (cur && typeof cur === 'object' && Array.isArray(cur.runes))
      ? cur.runes : [];
    let next;
    if (r.inscribe) {
      if (typeof r.runeId !== 'string') {
        return { ok: false, message: 'недоступно' };
      }
      next = owned.concat([r.runeId]);
    } else if (r.erase) {
      next = owned.slice(0, -1);
    } else {
      return { ok: false, message: 'недоступно' };
    }
    const res = game.setItemRunes(hero, r.slot, next);
    if (!res || !res.ok) return { ok: false, message: 'недоступно' };
    hero.gold = (hero.gold || 0) - r.cost;
    return { ok: true };
  }

  function register(G) {
    const BA = G && G.buildingActions;
    if (!BA || typeof BA.registerSpecial !== 'function') {
      console.error('building-effect-runecraft.js: Game.buildingActions ' +
        'не найден — спец-действия «Нанести руну»/«Стереть руну» ' +
        '(камень 40, задача 000328.02) НЕ зарегистрированы ' +
        '(src/building-actions.js обязан грузиться ДО)');
      return;
    }
    BA.registerSpecial('40_inscribe', handle);
    BA.registerSpecial('40_erase', handle);
  }

  return { handle, register };
});
