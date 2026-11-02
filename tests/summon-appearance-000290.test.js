// Задача 000290 (BUG «Морозный вестник» призывает моба с видом орка +
// аудит всех заклинаний «призыв»; ТЗ tasks/pending/000290.md; контракт
// memory/000290-summon-look.md) — RED-тесты (фикстуры только; код игры
// и существующие тесты НЕ меняются на красной стадии).
//
// Корень (контракт §1, двуслойный): (а) призывной юнит не несёт id
// призываемого моба — makeAlly (src/combat.js) не пишет mobId, а
// case 'призыв' (src/spells.js) не передаёт pa.summon; (б) рендер —
// allyFrames (src/combat-ui.js) не имеет ветки 'summon': каждый
// kind 'summon' падает в else → MOB_FRAMES[ALLY_MERC_KIND] (orc-
// архетип-заглушка 000084) — все 13 заклинаний «призыв» рисуются
// орком. Красные падают «отсутствием» (прецедент 000272): фикстура
// грузится, каст ok, призывной в c.units с верными статами/именем —
// отсутствует ТОЛЬКО поле вида mobId (ERR_ASSERTION, не ENOENT).
// Рендерная половина (ветка 'summon' в allyFrames) закреплена блоком
// 000290 в tests/combat-ui.test.js (R1/R2/R3).
//
// expectedRedCount (файл) = 2 (000290-CAST-1, 000290-AUDIT-1).
// Гварды 000290-AUDIT-2/000290-DEF-1 — зелёные на обеих стадиях.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createCombat, MOB_TYPES, makeAlly } = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');
const { castSpell } = require('../src/spells.js');
const Spr = require('../src/sprites.js');

const SPELLS_DIR = path.join(__dirname, '..', 'assets', 'spells');

// Каталог source of truth: ВСЕ заклинания с действием «призыв»
// (таблица аудита 000290 — 13; счётчик пинит рост/сокращение каталога).
function summonSpells() {
  return fs.readdirSync(SPELLS_DIR).filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(
      fs.readFileSync(path.join(SPELLS_DIR, f), 'utf8')))
    .filter((s) => s.действие === 'призыв');
}

// Сильный персонаж для контролируемых сценариев (много HP — не умирает
// сам). Хелперы — свои копии (прецедент tests/summon-regen-000272.test.js:
// экспортов нет).
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// Бой с кастом spellId: атрибут СПЕЛЛА = 11 (пул c.ps 1 + 11/10 = 2),
// mp 40 (макс. стоимость каталога «призыв» — 20), mobs ['wolf']
// (allyRoom — место для призывного есть, прецедент 000272), seed 13
// — фиксированный сценарий. Возвращает {c, a} — бой + призывной.
function summonCombat(spellId) {
  const s = summonSpells().find((x) => x.id === spellId);
  const p = strongHero();
  p.primary[s.атрибут] = 11;
  p.spells = [spellId];
  p.mp = 40;
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 13 });
  const r = castSpell(c, spellId);
  assert.equal(r.ok, true, 'каст ' + spellId + ' — ok: ' + (r.reason || ''));
  const a = c.units.find((u) => u.id === r.summoned);
  assert.ok(a, spellId + ': призывной в c.units');
  return { c, a };
}

test('000290-CAST-1: frost_wisp (000063) — призывной несёт поле вида mobId = «wind_elemental» (вид призываемого из параметров.summon); контрпример — текущий рендер орка (красный, 000290)', () => {
  const { a } = summonCombat('frost_wisp');
  // Фикстура: статы/имя/роль — из MOB_TYPES[параметры.summon] (уже есть,
  // бит-в-бит); kind/summonTurns — 000235.01 (пин tests/spells.test.js
  // W-13). Отсутствует ТОЛЬКО поле вида.
  assert.equal(a.kind, 'summon', 'kind — "summon"');
  assert.equal(a.summonTurns, 4, 'summonTurns — 4 (turns 000063)');
  assert.equal(a.name, MOB_TYPES.wind_elemental.name,
    'имя — из каталога (Ветряной стихийник)');
  assert.equal(a.role, 'ranged', 'роль — из каталога');
  assert.equal(a.mobId, 'wind_elemental',
    'RED: mobId — параметры.summon (wind_elemental), а не вид по '
    + 'default; факт: ' + JSON.stringify(a.mobId));
});

test('000290-AUDIT-1: ВСЕ 13 заклинаний «призыв» (каталог) — призывной несёт mobId = параметры.summon И name = MOB_TYPES[summon].name (пин таблицы аудита, контракт §2; красные, 000290)', () => {
  const summons = summonSpells();
  assert.equal(summons.length, 13,
    'каталог: ровно 13 заклинаний «призыв» (таблица аудита 000290)');
  for (const s of summons) {
    const { a } = summonCombat(s.id);
    assert.equal(a.mobId, s.параметры.summon,
      s.id + ': RED — mobId = параметры.summon ('
      + s.параметры.summon + '); факт: ' + JSON.stringify(a.mobId));
    assert.equal(a.name, MOB_TYPES[s.параметры.summon].name,
      s.id + ': имя — из каталога по summon');
  }
});

test('000290-AUDIT-2: у ВСЕХ 13 «призыв» параметры.summon ∈ MOB_TYPES И mobSpriteKind(summon) ∈ keys(MOB_FRAMES) — нет призывного без вида (гварда, 000290)', () => {
  const summons = summonSpells();
  assert.equal(summons.length, 13, 'каталог: ровно 13 (таблица аудита)');
  for (const s of summons) {
    const id = s.параметры.summon;
    assert.ok(MOB_TYPES[id], s.id + ': ' + id + ' ∈ MOB_TYPES');
    const kind = Spr.mobSpriteKind(id);
    assert.ok(kind && Spr.MOB_FRAMES[kind],
      s.id + ': ' + id + ' → вид «' + kind + '» ∈ keys(MOB_FRAMES)');
  }
});

test('000290-DEF-1: makeAlly без mobId — поле вида отсутствует/нулевое у наёмника и Эфира (бит-в-бит; направление «с mobId → хранит» закреплено 000290-CAST-1/000290-AUDIT-1 через производственный путь castSpell → makeAlly) (гварда, 000290)', () => {
  const merc = makeAlly({ name: 'Орк', role: 'ranged', level: 2,
    dmg: 1, hp: 1 }, 1);
  assert.ok(merc.mobId == null,
    'наёмник (без mobId) — поле вида отсутствует/null (бит-в-бит)');
  assert.equal(merc.kind, 'merc', 'наёмник — kind "merc" (не тронут)');
  const efir = makeAlly({ name: 'Эфир', role: 'support', level: 2,
    dmg: 1, hp: 1, kind: 'efir' }, 2);
  assert.ok(efir.mobId == null,
    'Эфир (без mobId) — поле вида отсутствует/null (бит-в-бит)');
  assert.equal(efir.kind, 'efir', 'Эфир — kind "efir" (не тронут)');
});
