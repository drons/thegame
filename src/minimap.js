(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    const G0 = (typeof root.Game === "object" && root.Game)
      ? root.Game : {};
    const api = factory();
    if (api) root.Game = Object.assign({}, G0, { minimap: api });
  }
})(typeof globalThis !== "undefined" ? globalThis : self,
function () {
  "use strict";

  const CELL = 4;
  const XY_RE = /^-?\d+,-?\d+$/;
  const CELL_FILL = "#3f6f4a";
  const HERO_FILL = "#d8c27a";

  let opts = null;
  let ready = false;
  let open = false;
  let dom = null;
  let domResolved = false;
  let btnWired = false;
  let sig = null;

  function curDoc() {
    return (typeof document !== "undefined") ? document : null;
  }

  function resolveDom() {
    if (domResolved) return dom;
    domResolved = true;
    const d = curDoc();
    if (!d || typeof d.getElementById !== "function") { dom = null; return dom; }
    const panel = d.getElementById("minimap");
    const canvas = d.getElementById("minimap-canvas");
    if (!panel || !canvas || typeof canvas.getContext !== "function") {
      dom = null;
      return dom;
    }
    const ctx = canvas.getContext("2d");
    dom = ctx ? { panel, canvas, ctx } : null;
    return dom;
  }

  function wireButton() {
    if (btnWired) return;
    const d = curDoc();
    if (!d || typeof d.getElementById !== "function") return;
    const btn = d.getElementById("minimap-toggle");
    if (!btn || typeof btn.addEventListener !== "function") return;
    btn.addEventListener("click", () => toggle());
    btnWired = true;
  }

  function radius() {
    const r = (opts && typeof opts.getRadius === "function")
      ? opts.getRadius() : null;
    return (Number.isInteger(r) && r >= 0) ? r : 0;
  }

  function eachTower(explored, fn) {
    if (!explored || typeof explored !== "object") return;
    if (typeof explored.forEach === "function") {
      if (typeof explored.get === "function") {
        explored.forEach((v, k) => {
          if (typeof k === "string" && XY_RE.test(k)) fn(v);
        });
      }
      return;
    }
    const keys = Object.keys(explored);
    for (const k of keys) {
      if (XY_RE.test(k)) fn(explored[k]);
    }
  }

  function eachTile(value, fn) {
    if (!value) return;
    if (typeof value === "object"
        && typeof value.forEach === "function") {
      value.forEach((t) => fn(t));
      return;
    }
    if (typeof value === "string") {
      const segs = value.split(";");
      for (const s of segs) fn(s);
    }
  }

  function buildModel(explored) {
    const out = new Set();
    eachTower(explored, (v) => eachTile(v, (k) => {
      if (typeof k === "string" && XY_RE.test(k)) out.add(k);
    }));
    return out;
  }

  function windowKeys(model, cx, cy, r) {
    const out = [];
    if (!model || typeof model.forEach !== "function") return out;
    if (!Number.isInteger(cx) || !Number.isInteger(cy)
        || !Number.isInteger(r) || r < 0) return out;
    for (const k of model) {
      if (typeof k !== "string" || !XY_RE.test(k)) continue;
      const p = k.split(",");
      const dx = Number(p[0]) - cx;
      const dy = Number(p[1]) - cy;
      if (dx >= -r && dx <= r && dy >= -r && dy <= r) out.push(k);
    }
    out.sort((a, b) => {
      const pa = a.split(",");
      const pb = b.split(",");
      const ya = Number(pa[1]);
      const yb = Number(pb[1]);
      if (ya !== yb) return ya - yb;
      return Number(pa[0]) - Number(pb[0]);
    });
    return out;
  }

  function signature(px, py, r) {
    let towers = 0;
    let cells = 0;
    if (opts) {
      eachTower(opts.explored, (v) => {
        towers++;
        if (v && typeof v.size === "number") cells += v.size;
        else if (typeof v === "string") cells += v.length;
      });
    }
    return towers + ":" + cells + ":" + px + ":" + py + ":" + r;
  }

  function heroPos() {
    const p = opts ? opts.player : null;
    if (!p || !Number.isInteger(p.x) || !Number.isInteger(p.y)) {
      return null;
    }
    return { x: p.x, y: p.y };
  }

  function syncPanel() {
    const el = resolveDom();
    if (el && el.panel.style) {
      el.panel.style.display = open ? "" : "none";
    }
  }

  function render() {
    if (!ready || !open) return;
    const hero = heroPos();
    const r = radius();
    const model = buildModel(opts.explored);
    const keys = hero ? windowKeys(model, hero.x, hero.y, r) : [];
    sig = signature(hero ? hero.x : null, hero ? hero.y : null, r);
    const el = resolveDom();
    if (!el) return;
    wireButton();
    const side = 2 * r + 1;
    const w = side * CELL;
    el.canvas.width = w;
    el.canvas.height = w;
    const ctx = el.ctx;
    ctx.clearRect(0, 0, w, w);
    ctx.fillStyle = CELL_FILL;
    for (const k of keys) {
      const p = k.split(",");
      const col = Number(p[0]) - (hero.x - r);
      const row = Number(p[1]) - (hero.y - r);
      ctx.fillRect(col * CELL, row * CELL, CELL, CELL);
    }
    if (hero) {
      ctx.fillStyle = HERO_FILL;
      ctx.fillRect(r * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2);
    }
  }

  function init(o) {
    if (ready) return;
    const explored = o && o.explored;
    const player = o && o.player;
    if (!explored || typeof explored !== "object" || Array.isArray(explored)
        || !player || typeof player !== "object" || Array.isArray(player)) {
      console.error("minimap.js: init — explored/player отсутствуют или "
        + "некорректны (main.js обязан передать {explored, player, "
        + "getRadius}) — мировая миникарта не работает (000419)");
      return;
    }
    opts = {
      explored,
      player,
      getRadius: (typeof o.getRadius === "function") ? o.getRadius : null,
    };
    ready = true;
  }

  function toggle() {
    if (!ready) {
      console.error("minimap.js: мировая миникарта не инициализирована "
        + "(init из main.js) — 000419");
      return;
    }
    open = !open;
    if (open) {
      sig = null;
      render();
    }
    wireButton();
    syncPanel();
  }

  function isOpen() { return open; }

  function close() {
    open = false;
    syncPanel();
  }

  function applyVisibility() {
    if (!ready || !open) return;
    const hero = heroPos();
    const r = radius();
    if (signature(hero ? hero.x : null, hero ? hero.y : null, r) !== sig) {
      render();
    }
    wireButton();
    syncPanel();
  }

  return { init, toggle, isOpen, close, applyVisibility,
    buildModel, windowKeys, render };
});
