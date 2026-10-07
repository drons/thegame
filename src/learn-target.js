// Единое изучение заклинаний (задача 000147): Game.LearnTarget =
// { activeSheet(hero) } — ОДИН резолвер активного носителя изучения
// (000145): ВСЕ источники (свиток — 4-й аргумент useItem, руна —
// applyRuneSpell/handleRuneSpell, наставник — applyMentorSpell/
// handleMentorSpell, панель «Персонаж») разрешают ОДНОГО и того же
// активного персонажа ВСЕХ kinds (hero/efir/merc). canLearn/learn
// (src/spells.js) — БЕЗ ИЗМЕНЕНИЙ (generic с 000133: носитель-
// агностичны — p.spells любой массив, ранг школы — p.primary[
// spell.атрибут], Рунопись — p.secondary.runes для 'rune' only):
// обобщение — только в обёртках-потребителях (D8).
//
// Чистый UMD (форма 1:1 по src/party.js): node — require() →
// { activeSheet } (тесты); браузер — root.Game = Object.assign(
// {}, G0, { LearnTarget: factory() }) — саморегистрация в момент
// загрузки (снапшот G0 — 000038). При загрузке — НОЛЬ require/
// DOM/console/чтений Game-данных (000053): ВСЕ чтения — лениво
// через rootRef в момент ВЫЗОВА (объект Game ЗАМЕНЯЕТСЯ каждым
// модулем — актуальный — в rootRef.Game; __game — отладочный
// крюк main.js — в цепочках без main.js его нет — норма).
//
// Fallback-цепочка (ВСЕ → переданный hero, D2): нет
// Game.Party.list/active; нет __game.state; партия = [hero]
// (roster пуст + Эфир не встречен); id null/stale → первый
// (hero — дефолт 000145, тихий fallback). БЕЗ console.error —
// чистый data-путь: отсутствие __game — норма node-тестов; битый
// порядок тегов пинят tests/index-order.test.js.
//
// __game.state.hero — СНАПШОТ (getter строит НОВЫЙ объект при
// каждом доступе; НЕТ primary/secondary → canLearn дал бы level 0
// → отказы ВСЕГО): hero — ТОЛЬКО live-ссылка вызывающего (D3);
// efir/roster — live-ссылки, efirMet — значение — из state.
// Efir-гейт: Party.list включает Эфир ТОЛЬКО при efirMet === true
// (fresh-игра: «активный = не встреченный Эфир» запрещено, 000145;
// stale id 'efir' → первый = hero, тихо).
//
// Контракт: memory/000147-unified-spell-learning.md §3.1.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { LearnTarget: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // rootRef — СТАБИЛЬНАЯ глобальная ссылка (объект Game заменяется
  // модулями при загрузке — актуальный — в rootRef.Game в момент
  // ВЫЗОВА; снапшот G0 выше — только для Object.assign, 000038).
  const rootRef = typeof globalThis !== 'undefined' ? globalThis : self;

  function isObj(x) {
    return !!x && typeof x === 'object' && !Array.isArray(x);
  }

  /**
   * Активный лист партии — live-ссылка ВЫЗЫВАЮЩЕГО (learn/raise —
   * in place; __game.state.hero — снапшот — НЕ использовать, D3).
   * hero не-объект/мусор → вернуть как есть (degrade).
   * @param {object} hero герой (live; носитель инвентаря)
   * @returns {object} sheet (hero — fallback-цепочка)
   */
  function activeSheet(hero) {
    if (!isObj(hero)) return hero;
    const G = rootRef.Game;
    if (!isObj(G) || !isObj(G.Party) ||
        typeof G.Party.list !== 'function' ||
        typeof G.Party.active !== 'function') {
      return hero;
    }
    // Активный (000145) — closure ядра ui.js; null/'' — дефолт
    // (первый member — Флогистон).
    const id = (isObj(G.playerUI) &&
        typeof G.playerUI.getActiveCharId === 'function')
      ? G.playerUI.getActiveCharId() : null;
    const st = isObj(rootRef.__game) ? rootRef.__game.state : null;
    if (!isObj(st)) return hero;
    const npcs = (isObj(G.NpcData) && Array.isArray(G.NpcData.NPCS))
      ? G.NpcData.NPCS : [];
    const members = G.Party.list({
      hero: hero, // live — вызывающего (D3)
      efir: isObj(st.efir) ? st.efir : null, // live-ссылка state
      efirMet: st.efirMet === true, // гейт (Эфир не встречен — нет)
      roster: Array.isArray(st.roster) ? st.roster : [], // live
      npcs: npcs,
    });
    const m = G.Party.active(members, id);
    return (isObj(m) && isObj(m.sheet)) ? m.sheet : hero;
  }

  return { activeSheet };
});
