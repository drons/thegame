// Задача 000292 (BUG «призванные существа в бою иногда спавнятся на
// препятствиях»; ТЗ tasks/pending/000292.md; контракт
// memory/000292-summon-spawn.md) — RED-тесты (фикстуры только; код игры
// и существующие тесты НЕ меняются на красной стадии).
//
// Корень (контракт §1): каст «призыв» (case 'призыв' src/spells.js —
// место placeAllies(c, [u]) и fail-closed гейт allyRoom ДО расхода
// пула/маны) исполняет free() (src/combat.js placeAllies/allyRoom) =
// «в границах && !occ», где occ = клетка игрока + прямоугольники всех
// c.units. c.obstacles НЕ читался → призывной ложится на первый
// «свободный по occ» якорь, даже если там камень/стена. Баг достигается
// только мид-комбат-кастом: в createCombat placeAllies исполняется ДО
// generateObstacles (c.obstacles пуст → состав бит-в-бит, контракт §3).
// Красные падают «отсутствием» (прецедент 000290): фикстура грузится,
// каст «успевает», призывной в c.units — отсутствует ТОЛЬКО свойство
// клетки (∉ c.obstacles / fail-closed) — ERR_ASSERTION, не ENOENT.
//
// expectedRedCount (файл) = 2 (000292-SPAWN-1, 000292-FAIL-1).
// Гварды 000292-ANCHOR-1/000292-DET-1 — зелёные на обеих стадиях
// (бит-в-бит без камней + детерминизм расстановки, 0 c._rng).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCombat } = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');
const { castSpell } = require('../src/spells.js');

const SPELLS_DIR = path.join(__dirname, '..', 'assets', 'spells');

// Каталог source of truth: ВСЕ заклинания с действием «призыв» (13 —
// обход подхватит будущие автоматически, шаблон 000290).
function summonSpells() {
  return fs.readdirSync(SPELLS_DIR).filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(
      fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')))
    .filter((s) => s.действие === 'призыв');
}

// Сильный персонаж (много HP — не умирает сам). Хелперы — свои копии
// (прецедент 000290/000272: экспортов нет).
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// Бой: 7×7 (default), wolf, mobLevel 2, seed 13 — фиксированный сценарий
// (контракт §6). Игрок (3,6) → якоря (2,5),(4,5),(3,5),(2,6),(4,6);
// волк читается из РЕАЛЬНОЙ c.units (pre-roll 000167: (1,0) —
// intelligence-спеллы / (1,1) — wisdom-спеллы, контракт §8) — вне ряда 6,
// поэтому пин (0,6) от его позиции не зависит.
function summonCombat(spellId) {
  const s = summonSpells().find((x) => x.id === spellId);
  const p = strongHero();
  p.primary[s.атрибут] = 11;
  p.spells = [spellId];
  p.mp = 40;
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 13 });
  return { p, c };
}

// 5 якорей вокруг (c.px, c.py) В ФИКСИРОВАННОМ ПОРЯДКЕ placeAllies
// (контракт §2) — white-box зеркало, НЕ вызов production-функции.
function anchors(c) {
  return [
    [c.px - 1, c.py - 1], [c.px + 1, c.py - 1], [c.px, c.py - 1],
    [c.px - 1, c.py], [c.px + 1, c.py],
  ];
}

test('000292-SPAWN-1: ВСЕ 13 «призыв» (каталог) — якоря заняты препятствиями → призывной на СВОБОДНОЙ клетке: в границах, ∉ c.obstacles, ≠ игрок, ∉ прямоугольников юнитов; сильное пин (0,6) — первая свободная построчного скана снизу (красный, 000292)', () => {
  const summons = summonSpells();
  assert.equal(summons.length, 13,
    'каталог: ровно 13 заклинаний «призыв» (таблица аудита 000290)');
  for (const s of summons) {
    const { c } = summonCombat(s.id);
    assert.equal(c.px + ',' + c.py, '3,6',
      s.id + ': игрок (3,6) — 7×7 (якоря (2,5),(4,5),(3,5),(2,6),(4,6))');
    c.obstacles.clear();
    for (const [x, y] of anchors(c)) c.obstacles.add(x + ',' + y);
    const r = castSpell(c, s.id);
    assert.equal(r.ok, true,
      s.id + ': каст ok (свободные клетки есть): ' + (r.reason || ''));
    const a = c.units.find((u) => u.id === r.summoned);
    assert.ok(a, s.id + ': призывной в c.units');
    assert.ok(a.x >= 0 && a.y >= 0 && a.x < c.width && a.y < c.height,
      s.id + ': клетка в границах (' + a.x + ',' + a.y + ')');
    assert.ok(!c.obstacles.has(a.x + ',' + a.y),
      s.id + ': RED — клетка не в c.obstacles; факт: (' + a.x + ',' + a.y
      + ') — камень/стена (якорь/скан игнорирует c.obstacles)');
    assert.ok(a.x !== c.px || a.y !== c.py,
      s.id + ': не на клетке игрока');
    for (const u of c.units) {
      if (u.id === a.id) continue;
      const overlap = a.x < u.x + (u.size.w || 1)
        && a.x + (a.size.w || 1) > u.x
        && a.y < u.y + (u.size.h || 1)
        && a.y + (a.size.h || 1) > u.y;
      assert.ok(!overlap,
        s.id + ': не на клетке юнита ' + (u.id || u.name)
        + ' (' + u.x + ',' + u.y + ')');
    }
    assert.equal(a.x + ',' + a.y, '0,6',
      s.id + ': RED — (0,6): все 5 якорей каменные → построчный скан '
      + 'снизу-вверх, слева-направо (контракт §6); факт: (' + a.x + ','
      + a.y + ')');
  }
});

test('000292-FAIL-1: 3×3 — все клетки кроме игрока/юнитов = камни (0 свободных) → fail-closed «нет места для призыва»: призывного нет, пул/мана не тратятся (зеркало allyRoom; красный, 000292)', () => {
  const spellId = 'flame_imp';
  const s = summonSpells().find((x) => x.id === spellId);
  const p = strongHero();
  p.primary[s.атрибут] = 11;
  p.spells = [spellId];
  p.mp = 40;
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2,
    seed: 13, width: 3, height: 3 });
  assert.equal(c.px + ',' + c.py, '1,2', 'игрок (1,2) — 3×3');
  const wolf = c.units[0];
  const taken = new Set([c.px + ',' + c.py]);
  for (let yy = wolf.y; yy < wolf.y + (wolf.size.h || 1); yy++) {
    for (let xx = wolf.x; xx < wolf.x + (wolf.size.w || 1); xx++) {
      taken.add(xx + ',' + yy);
    }
  }
  c.obstacles.clear();
  let stones = 0;
  for (let y = 0; y < c.height; y++) {
    for (let x = 0; x < c.width; x++) {
      if (!taken.has(x + ',' + y)) {
        c.obstacles.add(x + ',' + y);
        stones++;
      }
    }
  }
  assert.equal(stones, 7,
    '3×3: все 7 клеток, кроме игрока и волка, — камни (0 свободных)');
  const mp0 = p.mp;
  const pool0 = c.ps.spellInt;
  const r = castSpell(c, spellId);
  assert.equal(r.ok, false,
    'RED: fail-closed — свободных (не-каменных) клеток нет; '
    + 'факт: ok=' + r.ok + (r.summoned ? ' (призывной на камне: '
      + r.summoned + ')' : ''));
  assert.equal(r.reason, 'нет места для призыва');
  assert.equal(c.units.length, 1, 'призывного нет в c.units');
  assert.equal(p.mp, mp0, 'мана не тратится (гейт ДО расхода)');
  assert.equal(c.ps.spellInt, pool0, 'пул не тратится (гейт ДО расхода)');
});

test('000292-ANCHOR-1: 7×7 без камней — flame_imp ровно на ПЕРВОМ ЯКОРЕ (px−1,py−1) = (2,5): алгоритм без препятствий не изменился, бит-в-бит (гварда, 000292)', () => {
  const { c } = summonCombat('flame_imp');
  assert.equal(c.px + ',' + c.py, '3,6', 'игрок (3,6) — 7×7');
  c.obstacles.clear();
  const r = castSpell(c, 'flame_imp');
  assert.equal(r.ok, true, 'каст ok: ' + (r.reason || ''));
  const a = c.units.find((u) => u.id === r.summoned);
  assert.ok(a, 'призывной в c.units');
  assert.equal(a.x + ',' + a.y, '2,5',
    'первый якорь (px−1,py−1) (порядок якорей не тронут, контракт §2); '
    + 'факт: (' + a.x + ',' + a.y + ')');
});

test('000292-DET-1: два идентичных прогона (SPAWN-1-раскладка, seed 13) → идентичные координаты призывного: 0 c._rng в расстановке (гварда, 000292)', () => {
  const run = () => {
    const { c } = summonCombat('flame_imp');
    c.obstacles.clear();
    for (const [x, y] of anchors(c)) c.obstacles.add(x + ',' + y);
    const r = castSpell(c, 'flame_imp');
    assert.equal(r.ok, true, 'каст ok: ' + (r.reason || ''));
    const a = c.units.find((u) => u.id === r.summoned);
    return a.x + ',' + a.y;
  };
  const pos1 = run();
  const pos2 = run();
  assert.equal(pos2, pos1,
    'детерминизм: один сид + одна раскладка → одна позиция '
    + '(' + pos1 + ' vs ' + pos2 + ')');
});
