# 000169 — [I] panel text regression (companion to 000169-panel-i-text.md)

Short reference: root cause, affected surfaces, fix pattern. Full
contracts (in Russian) — `memory/000169-panel-i-text.md`.

## Root cause (introduced by the 000145 merge)

Commit 9d8b9ed (task 000145, merge f4fd4e3) added a stale-portrait sweep
to the "Character" tab render hook — `src/ui-tab-skills.js:612`:

```js
for (const ch of row.children.slice()) {   // row = div.cp-portraits
```

In a real browser `element.children` is an **HTMLCollection**: iterable,
with `length` / `item(i)` / index access — but **no Array methods**
(`.slice` / `.forEach` / `.find` / `.map` / …). The call throws
`TypeError: row.children.slice is not a function` on every
`toggle(true)` / `render()`. Every vm DOM stub in the project defines
`children: []` as a plain Array, so `.slice()` is legal in tests and the
regression stayed invisible (1905/1905 green on the buggy code).

## Affected panels and CSS classes

Panel: `.char-panel` (KeyI), two `.cp-column` × three `.cp-tabpane`;
six tabs in registration order (= `<script>` order in index.html):
left column — `character`, `inventory`, `settings`; right column —
`equipment`, `shop`, `quests`.

Text lost (everything the render hooks write):
- character pane: `.cp-stats` (4-line "Уровень … | Опыт … | Золото: …"
  template, written after the portrait loop), skill levels
  (`.cp-btn` rows stay build placeholders), spellbook body;
- inventory pane: `.cp-items` / `.cp-itemrow` item rows ("Железный меч …");
- equipment pane: equipped weapon/armor rows (placeholders
  "— без оружия —" / "— без брони —" are never replaced);
- shop pane: stock rows + header ("… , богатство N/3",
  ui-tab-shop.js L85);
- quests pane: quest journal rows.

What remains visible: the static `.cp-section` headings from `build()`
("Инвентарь", "Снаряжение", "Быстрые слоты (бой)", "Магазин",
"Квесты") — the exact symptom: "no text, only section headings".

Side effects of the same throw (fixed by the same line): uncaught
TypeError from `toggle()` on [I]/touch (main.js KeyI L1597, no guard);
`attachEsc()` skipped (called after `render()` in toggle) so [Esc] stops
closing the panel; `setShop()` key change with an already-built panel
calls `render()` inside the rAF frame loop (main.js frame → renderHud →
hud.js L270) and the throw breaks the rAF chain before
`requestAnimationFrame(frame)` → game freeze until reload.

## Fix pattern

One line at `src/ui-tab-skills.js:612`:

```js
for (const ch of Array.from(row.children)) {
```

`Array.from` copies the child list before the `ch.remove()` loop (same
semantics as the original `.slice()`) and works both on a real
HTMLCollection (iterable) and on the plain-Array test stubs.
`Array.from` is the established codebase idiom (src/items.js:119,
src/sprites.js:785, src/building-effects.js:2681, src/main.js:2651).
The core render loop in `src/ui.js` intentionally gets NO try/catch
("no more, no less" — a core guard would mask future per-tab errors as
a silent partial render).

## Why the settings panel works while the [I] panels do not

The core render loop (`render()` in src/ui.js, L341–351) iterates
`panelTabs` **without try/catch**. "Character" is the FIRST registered
tab (script-tag order), so its exception kills the loop before the
inventory / equipment / shop / quests render hooks ever run — their
bodies (empty after `build()`) show no text. The settings tab has **no
render hook at all** (ui-tab-settings.js L8: the whole form is built
once in `build()`, focus liveness contract 000098) — its text is
independent of the render loop, which is exactly why "настройки видны"
while the other five tabs are blank.
