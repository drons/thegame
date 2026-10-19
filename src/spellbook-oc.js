// Задача 000235.02: книга заклинаний ВНЕ боя (KeyB / хинт «  |  [B]
// книга» в строке HUD, Д-3). Оверлей .spellbook-oc (z-35, index.html):
// строки — SpellBook.entriesFor (000149) + фильтр по ФЛАГУ вне_боя
// (каталог Game.SpellsData.SPELLS_BY_ID), каст по клику —
// Spells.castOutOfCombat (000235.02): ok → close (успеха-флэша нет,
// прецедент боевой книги), fail → flash(reason) в #hud + re-render.
//
// #hud — textcontent-движок (pointer-events:none, детей нет) →
// «кнопка» = хинт + горячая клавиша (П10); сам оверлей — body-
// дочерник, НЕ внутри .dungeon-overlay (dungeon-ui.js — не хост, ТЗ
// п.6; dungeonUI НЕ в блок-списке — книга работает на всех 3 экранах).
// Активные оверлеи (startWindow 000138, combatUI/npcUI/buildingUI/
// craftUI/resurrectUI isActive, playerUI/squadUI isOpen) — toggle
// no-op + мягкое скрытие applyVisibility (isOpen остаётся true).
//
// Униформный модуль (паттерн 000034/000038/000053): load-clean (ноль
// require/console/DOM/чтений Game на загрузке), ленивые ссылки через
// curGame() при вызове; без зависимостей — console.error 1×/вызов +
// деградация, игра не роняется; surface РОВНО 6 (контракт §2.6
// memory/000235.02-spellbook-out-of-combat.md).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const G0 = (typeof root.Game === "object" && root.Game)
      ? root.Game : {};
    const api = factory(G0, root);
    if (api) root.Game = Object.assign({}, G0, { spellbookOC: api });
  }
})(typeof globalThis !== "undefined" ? globalThis : self,
function (G0, rootRef) {
  "use strict";
  void G0;

  function curGame() {
    const r = (rootRef && typeof rootRef === "object") ? rootRef
      : (typeof globalThis !== "undefined" ? globalThis : null);
    return (r && r.Game && typeof r.Game === "object") ? r.Game : null;
  }

  let opts = null;      // {hero, clock, flash, startWindow} — init (main.js)
  let ready = false;
  let open = false;
  let rootEl = null;    // .spellbook-oc (ленивая DOM, первый open)
  let rowsEl = null;    // контейнер строк
  let escAttached = false;
  let escHandler = null;
  let lastRenderDay = null;

  function curDoc() {
    return (typeof document !== "undefined") ? document : null;
  }

  // Блок-список: активные оверлеи, поверх которых книга НЕ открывается
  // (и мягко скрывается, если открылась до их появления). startWindow
  // (000138) — стартовое окно, показано при каждой загрузке до клика
  // «Продолжить» (книга — для экранов мир/подземелье/город, ТЗ п.4);
  // ссылка — через init (main.js держит её локально, НЕ в Game).
  // dungeonUI — сознательно НЕ в списке: единый #hud (000229), книга
  // работает в подземелье (ТЗ п.6). Каждый модуль — typeof-гард
  // (no-op без него).
  function blocked(g) {
    const on = (m, fn) => !!(g[m] && typeof g[m][fn] === "function"
      && g[m][fn]());
    const sw = opts ? opts.startWindow : null;
    return (sw && typeof sw.isActive === "function" && sw.isActive())
      || on("combatUI", "isActive") || on("npcUI", "isActive")
      || on("buildingUI", "isActive") || on("craftUI", "isActive")
      || on("resurrectUI", "isActive") || on("playerUI", "isOpen")
      || on("squadUI", "isOpen");
  }

  function detachEl(el) {
    if (!el) return;
    if (typeof el.remove === "function") { el.remove(); return; }
    const p = el.parentNode || el.parent;
    if (p && typeof p.removeChild === "function") p.removeChild(el);
  }

  function attachEsc() {
    const w = (typeof window !== "undefined") ? window : null;
    if (!w || typeof w.addEventListener !== "function" || escAttached) return;
    escHandler = (e) => {
      if (e && e.code === "Escape") close();
    };
    w.addEventListener("keydown", escHandler);
    escAttached = true;
  }

  function detachEsc() {
    const w = (typeof window !== "undefined") ? window : null;
    if (escAttached && w && typeof w.removeEventListener === "function"
        && escHandler) {
      w.removeEventListener("keydown", escHandler);
    }
    escAttached = false;
    escHandler = null;
  }

  function ensureDom() {
    const d = curDoc();
    if (!d || typeof d.createElement !== "function" || !d.body) return;
    if (rootEl) return;
    rootEl = d.createElement("div");
    rootEl.className = "spellbook-oc";
    const panel = d.createElement("div");
    panel.className = "spoc-panel";
    const title = d.createElement("div");
    title.className = "spoc-title";
    title.textContent = "Книга заклинаний (вне боя)";
    rowsEl = d.createElement("div");
    const hint = d.createElement("div");
    hint.className = "spoc-hint";
    hint.textContent = "[B] или [Esc] — закрыть";
    panel.appendChild(title);
    panel.appendChild(rowsEl);
    panel.appendChild(hint);
    rootEl.appendChild(panel);
    d.body.appendChild(rootEl);
  }

  // Строки: ТОЛЬКО известные (hero.spells) с вне_боя: true. R11:
  // пересборка — rowsEl.textContent = '' (сбрасывает детей) +
  // appendChild (innerHTML запрещён).
  function render() {
    if (!open || !rootEl || !rowsEl) return;
    const d = curDoc();
    const g = curGame();
    if (!d || typeof d.createElement !== "function") return;
    const hero = opts ? opts.hero : null;
    const clock = opts ? opts.clock : null;
    const day = (clock && typeof clock.day === "number") ? clock.day : 0;
    rowsEl.textContent = "";
    const ids = (hero && Array.isArray(hero.spells)) ? hero.spells : [];
    const outside = ids.filter((id) => {
      if (!g || !g.SpellsData || !g.SpellsData.SPELLS_BY_ID) return false;
      const s = g.SpellsData.SPELLS_BY_ID[id];
      return !!(s && s["вне_боя"] === true);
    });
    let entries = [];
    if (g && g.SpellBook && typeof g.SpellBook.entriesFor === "function"
        && g.SpellsData && g.SpellsData.SPELLS_BY_ID) {
      entries = g.SpellBook.entriesFor(
        { spells: outside }, g.SpellsData.SPELLS_BY_ID) || [];
    }
    if (!entries.length) {
      const empty = d.createElement("div");
      empty.className = "spoc-empty";
      empty.textContent = "Нет изученных заклинаний вне боя";
      rowsEl.appendChild(empty);
      return;
    }
    const effects = (hero && Array.isArray(hero.outOfCombatEffects))
      ? hero.outOfCombatEffects : [];
    for (const e of entries) {
      const row = d.createElement("div");
      row.className = "spoc-row";
      row.setAttribute("data-spell-id", e.id);
      const icon = d.createElement("img");
      icon.className = "spoc-icon";
      if (e.icon) icon.src = e.icon;
      icon.alt = e.name || e.id;
      const name = d.createElement("span");
      name.className = "spoc-name";
      name.textContent = e.name || e.id;
      const desc = d.createElement("span");
      desc.className = "spoc-desc";
      desc.textContent = e.desc || "";
      const mana = d.createElement("span");
      mana.className = "spoc-mana";
      mana.textContent = "Мана " + (e.mana != null ? e.mana : 0);
      const status = d.createElement("span");
      status.className = "spoc-status";
      const eff = effects.find((x) => x && x.spellId === e.id
        && x.expiresDay > day);
      status.textContent = eff
        ? "активно до дня " + eff.expiresDay : "—";
      row.addEventListener("click", () => cast(e.id));
      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(desc);
      row.appendChild(mana);
      row.appendChild(status);
      rowsEl.appendChild(row);
    }
  }

  function cast(spellId) {
    if (!ready || !opts) {
      console.error("spellbook-oc.js: каст вне боя — книга не "
        + "инициализирована (init из main.js) — 000235.02");
      return;
    }
    const g = curGame();
    if (!g || !g.Spells
        || typeof g.Spells.castOutOfCombat !== "function") {
      console.error("spellbook-oc.js: cast — Spells.castOutOfCombat "
        + "отсутствует (spells.js) — каст вне боя недоступен "
        + "(000235.02)");
      return;
    }
    const r = g.Spells.castOutOfCombat(opts.hero, spellId, opts.clock.day,
      {});
    if (r && r.ok) { close(); return; }
    const reason = (r && r.reason) ? r.reason : "неизвестное заклинание";
    if (opts.flash) opts.flash(reason);
    render();
  }

  function openBook() {
    if (open) return;
    open = true;
    ensureDom();
    if (rootEl && rootEl.style) rootEl.style.display = "";
    lastRenderDay = (opts && opts.clock
      && typeof opts.clock.day === "number") ? opts.clock.day : null;
    render();
    attachEsc();
  }

  function init(o) {
    if (ready) return;
    const hero = o && o.hero;
    const clock = o && o.clock;
    if (!hero || typeof hero !== "object" || !clock
        || typeof clock !== "object"
        || typeof clock.day !== "number") {
      console.error("spellbook-oc.js: init — hero/clock отсутствуют "
        + "(main.js обязан передать {hero, clock, flash}) — книга вне "
        + "боя не работает (000235.02)");
      return;
    }
    opts = { hero, clock,
      flash: (o && typeof o.flash === "function") ? o.flash : null,
      startWindow: (o && o.startWindow) ? o.startWindow : null };
    ready = true;
  }

  function toggle() {
    if (open) { close(); return; }
    if (!ready) {
      console.error("spellbook-oc.js: книга вне боя не инициализирована "
        + "(init из main.js) — 000235.02");
      return;
    }
    const g = curGame();
    if (g && blocked(g)) return;
    openBook();
  }

  function isOpen() { return open; }

  function close() {
    open = false;
    detachEl(rootEl);
    rootEl = null;
    rowsEl = null;
    lastRenderDay = null;
    detachEsc();
  }

  // Каждый кадр из main.js: закрыто — дешёвый no-op; открыто + блок —
  // мягкое скрытие (isOpen остаётся true, блок ушёл — показ); смена
  // дня — re-render (статусы «активно до дня N»). НИКОГДА не бросает.
  function applyVisibility() {
    if (!open || !rootEl || !rootEl.style) return;
    const g = curGame();
    rootEl.style.display = (g && blocked(g)) ? "none" : "";
    if (opts && opts.clock && typeof opts.clock.day === "number"
        && lastRenderDay !== opts.clock.day) {
      lastRenderDay = opts.clock.day;
      render();
    }
  }

  return { init, toggle, isOpen, close, applyVisibility, render };
});
