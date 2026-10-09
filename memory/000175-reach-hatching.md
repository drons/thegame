# 000175 — Reachable-tile hatching for the selected combat mob

English summary of `memory/000175-mob-reach-hatch.md` (the contract of record
is the Russian file). Task: in combat, when a mob is selected, lightly hatch
the tiles it can reach in one turn.

## How reachable tiles are computed

Core pure function `mobReachCells(c, u)` in `src/combat.js` (exported next to
`reachableCells` in the module return object).

- Forward BFS over **anchor cells** (top-left corner of the mob's w×h
  rectangle, canon of `combat.js`), starting at `(u.x, u.y)`.
- Budget: depth ≤ `u.movePerTurn || 1` (fast mobs — 2 steps). FIFO queue =
  array + index; the 4 neighbors are expanded in the canonical `PATH_DIRS`
  order (`[0,-1], [0,1], [-1,0], [1,0]`) — deterministic insertion order.
- Passability: `rectFree(c, nx, ny, w, h, u)` with `ignore = u` itself — the
  exact walls of a real mob step (board bounds, player cell, `c.obstacles`,
  other living non-fled units). No other unit moves during a mob's turn, so
  preview walls == real walls.
- Result: `Set` of `'x,y'` strings — the union of all cells covered by the
  w×h rectangle at every reachable anchor. The mob's **own starting
  rectangle is excluded** (it is already there; we hatch where it can GO).
- Pure: no `c._rng`, no mutations of `c`/`u`, no new fields on `c` — saves
  and battle determinism are untouched. This is a movement range, NOT an AI
  simulation (ranged/support/leader AI actually moves 1 step per turn even
  when fast — the preview intentionally shows the full step budget).

Selection semantics: the selected mob is `c.targetId` — auto-set to the
nearest living mob at combat start and on the player's slot (nearestEnemy
during ally input turns, 000168), changed by clicking a mob. So the hatching
is visible from the first render and follows click re-targeting.

## The hatching render

`src/combat-ui.js`: new `drawMobReachHatch(c)` (placed after `drawBreathFx`)
called inside `render()` **between the grid and the obstacles** (z-order:
background → grid → hatch → obstacles → units → FX — a base layer under the
units, like the 000166 underlay).

- Gate: render only when `c.targetId` resolves to a living, non-fled unit
  with `side === 'mob'` — exactly the yellow target-ring condition in
  `drawUnits`. No phase/result gates. Any other state (null, dead target,
  ally target, fled) produces **zero** new canvas calls, so existing scenes
  render bit-for-bit identical.
- Style: `MOB_REACH_HATCH = 'rgba(255, 226, 122, 0.35)'` — low alpha of the
  target highlight #ffe27a (derived-from-palette pattern of the 000084
  underlay). Set once before the loop: `strokeStyle` + `lineWidth = 1`.
- Geometry: one 45° diagonal per tile, 8px inset (unit-sprite convention):
  `beginPath(); moveTo(px+8, py+40); lineTo(px+40, py+8); stroke()` where
  `px = x*48`, `py = y*48` (CELL = 48). One stroke == one tile.
- Degradation: `typeof G.mobReachCells === 'function'` guard (UMD load-order
  trap 000038); if missing — one `console.error` (`reachWarned` flag,
  `measureWarned` pattern) and no hatching, no crash.
- No new modules, script tags, CSS, or SVG assets; `createPattern`
  deliberately avoided (the test canvas stub lacks it; manual lines give
  deterministic `drawCalls` pins).

## How the red tests assert the tile set

Node (`tests/combat.test.js`, block at the end, `require` header gains
`mobReachCells` — meaningful TypeError until green):

- R1–R8 pin the set semantics directly against `mobReachCells`: 4 neighbors
  for a 1×1 (start excluded), 12 for a fast mob (Manhattan ≤ 2 minus start),
  obstacle shadowing + the step LIMIT (Manhattan-2 cell absent at steps=1),
  unit/player walls (dead/fled do not block, self is ignored for multi-cell
  mobs), exact 7-cell union for a 2×2 in a corner, 2 cells in a board
  corner, empty Set in a dead end, purity (structural snapshot unchanged,
  0 `c._rng` calls, two calls → equal sorted arrays).

VM (`tests/combat-ui.test.js`, same helpers as 000050/000084 scenes):

- H1: wolf scene (seed 42, sprite loader, auto-target = wolf) → render →
  **decoded tile set deepEqual `G.mobReachCells(c, wolf)`** — the key
  assertion "the correct set is actually rendered". Decode formula (fixed
  off-by-one of the draft formula): for each `stroke` whose active
  `strokeStyle` is `MOB_REACH_HATCH` with its `moveTo m` / `lineTo l` pair,
  tile = `(trunc((l[0] − 40)/48), trunc((m[1] − 40)/48))` — exact integers
  (40 = CELL − 8). Also pinned: per-tile diagonal signature, hatch stroke
  count == `cells.size`, the color string, and z-order
  `lastGridStroke < firstHatch < firstObstacle < firstUnit`.
- H2: re-targeting swaps the set (m1's tiles stop being hatched).
- H3–H5: dead target / null / ally target → 0 hatch strokes (the gate).
- H6: regression pins in the H1 scene — `calls[0]`/`calls[1]` unchanged,
  `#ffe27a` (target ring) count unchanged.
- Anchor A175-1 (green from the start): no hatching for null / dead / ally /
  fled targets — protects the just-merged 000166/000168 scenes.

Safety of the layer insertion: the only absolute `drawCalls` index pins are
`calls[0]`/`calls[1]`; the 000050 pin `iObs > lastGridStroke` (last
`stroke` in the whole render) is what forces the hatch to sit BEFORE the
obstacles; style-count pins filter by exact color and the hatch color is
unique; the 000084 golden sets `targetId = null` (no hatch at all).
