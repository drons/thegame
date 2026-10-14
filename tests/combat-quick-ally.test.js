// Задача 000194: быстрые предметы союзников/Эфира + общий инвентарь.
// ЯДРО (src/combat.js): c.quickItem/c.invItem на ходу союзника (активный
// юнит — паттерн c.attack/activeAlly), пулы u.quickItem/u.invItem
// (makeAlly + рефилл startRound), предмет — из ОБЩЕГО инвентаря героя,
// эффект — на союзнике; canDoAction-ветки quickItem/invItem для хода
// союзника (зеркало hero-веток 1:1 — те же причины, прямые чтения
// u.quick/инвентаря героя БЕЗ I.* — canDoAction без побочных эффектов).
//
// Красные (26 всего по задаче; здесь 10): падение — по ОТСУТСТВИЮ
// функциональности (c.quickItem → null: player-guard; u.quick —
// undefined; «недоступно активному персонажу» — текущий хвост
// allyCanDo), не по синтаксису. Якоря (4): hero-пути бит-в-бит,
// null на слоте моба, fire/block/flee союзника — без изменений.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  createCombat, canDoAction, activeUnitId,
} = require('../src/combat.js');
const { createCharacter } = require('../src/player.js');
const I = require('../src/items.js');

// Сильный персонаж (много HP — не умирает в контролируемых сценариях;
// паттерн tests/combat.test.js).
function strongHero() {
  const c = createCharacter();
  c.primary.constitution = 50;
  c.hp = 9999;
  return c;
}

// Наёмник с инициативой ВЫШЕ волка (3) и игрока (2): attrs 4+4 = 8 —
// pre-roll ОСТАНОВИЛСЯ на его слоте 'a0' (паттерн 000168).
const ALLY_VOLK_HI = {
  name: 'Вольк', role: 'melee', level: 1, dmg: 1.2, hp: 1.1,
  skills: [], spells: [], attrs: { dexterity: 4, intelligence: 4 },
};

// Бой с наёмником: ход СОЮЗНИКА (activeUnitId 'a0').
function allyCombat(p, allies) {
  return createCombat({
    player: p, mobs: ['wolf'], mobLevel: 1, seed: 5,
    allies: allies || [ALLY_VOLK_HI],
  });
}

// --- makeAlly: быстрые поля (красные) ---

test('194-CORE-INIT: makeAlly — quick (data.quick || [null×3]), quickItem = 1 + floor(Дек/10), invItem = 1', () => {
  const c = createCombat({
    player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 5,
    allies: [Object.assign({}, ALLY_VOLK_HI, {
      attrs: { dexterity: 30, intelligence: 4 },
      quick: ['healing_potion', null, null],
    })],
  });
  const a = c.units.find((x) => x.id === 'a0');
  assert.deepEqual(a.quick, ['healing_potion', null, null],
    'u.quick = data.quick (краснота: ' + JSON.stringify(a.quick) + ')');
  assert.equal(a.quickItem, 4,
    'u.quickItem = 1 + floor(30/10) (краснота: ' + a.quickItem + ')');
  assert.equal(a.invItem, 1,
    'u.invItem = 1 (краснота: ' + a.invItem + ')');
  // Без data.quick — три пустых слота.
  const c2 = createCombat({
    player: strongHero(), mobs: ['wolf'], mobLevel: 1, seed: 5,
    allies: [{ name: 'Вольк', role: 'melee', level: 1, dmg: 1.2,
      hp: 1.1, skills: [], spells: [] }],
  });
  const a2 = c2.units.find((x) => x.id === 'a0');
  assert.deepEqual(a2.quick, [null, null, null],
    'без data.quick — [null×3] (краснота: ' + JSON.stringify(a2.quick) + ')');
});

// --- startRound: рефилл пулов союзника (красный) ---

test('194-CORE-REFILL: startRound — quickItem/invItem живых союзников рефиллится в 1/1', () => {
  const c = allyCombat(strongHero());
  const a = c.units.find((x) => x.id === 'a0');
  a.quickItem = 0;
  a.invItem = 0;
  c.endTurn();
  c.endTurn();
  assert.equal(c.round, 2, 'round 2');
  assert.equal(activeUnitId(c), 'a0', 'round 2 — снова наёмник');
  assert.equal(a.quickItem, 1,
    'u.quickItem рефилл 0→1 (краснота: ' + a.quickItem + ')');
  assert.equal(a.invItem, 1,
    'u.invItem рефилл 0→1 (краснота: ' + a.invItem + ')');
});

// --- c.quickItem на ходу союзника (красные) ---

test('194-CORE-ALLY-USE: быстрый предмет — из ОБЩЕГО инвентаря, эффект на СОЮЗНИКЕ, пул u.quickItem', () => {
  const p = strongHero();
  I.addItem(p, 'healing_potion');
  const c = allyCombat(p);
  const a = c.units.find((x) => x.id === 'a0');
  a.quick = ['healing_potion', null, null];
  a.hp = 10; // maxHP 13 — кап виден
  const pool = a.quickItem;
  const logLen = c.log.length;
  const r = c.quickItem(0);
  assert.ok(r && r.ok === true,
    'c.quickItem на ходу союзника (краснота: null — player-guard): '
    + JSON.stringify(r));
  assert.equal(r.slot, 0);
  assert.equal(I.totalQty(p, 'healing_potion'), 0,
    'зелье потрачено из ОБЩЕГО инвентаря героя');
  assert.equal(a.hp, 13,
    'эффект на СОЮЗНИКЕ: +15 HP с капом maxHP (10→13)');
  assert.equal(p.hp, 9999, 'игрок не тронут');
  assert.equal(a.quickItem, pool - 1, 'пул u.quickItem 1→0');
  assert.ok(c.log.length > logLen, 'строка лога добавлена');
  assert.ok(c.log[c.log.length - 1].startsWith('Вольк: '),
    'лог — «Вольк: …» (краснота: ' + c.log.slice(logLen).join(' | ') + ')');
});

test('194-CORE-ALLY-SLOT: без аргумента — первый ЗАНЯТЫЙ слот; «быстрый слот N пуст»; «быстрые слоты пусты»', () => {
  const mk = () => {
    const p = strongHero();
    I.addItem(p, 'healing_potion');
    const c = allyCombat(p);
    const a = c.units.find((x) => x.id === 'a0');
    return { c, a };
  };
  {
    const { c, a } = mk();
    a.quick = [null, 'healing_potion', null];
    const r = c.quickItem();
    assert.ok(r && r.ok === true, 'краснота: ' + JSON.stringify(r));
    assert.equal(r.slot, 1, 'первый ЗАНЯТЫЙ слот (1), не 0');
  }
  {
    const { c, a } = mk();
    a.quick = ['healing_potion', null, null];
    const r = c.quickItem(2);
    assert.ok(r && r.ok === false, 'явный пустой слот — отказ');
    assert.equal(r.reason, 'быстрый слот 3 пуст',
      'причина дословно (краснота: ' + (r && r.reason) + ')');
  }
  {
    const { c } = mk();
    const r = c.quickItem();
    assert.ok(r && r.ok === false, 'краснота: ' + JSON.stringify(r));
    assert.equal(r.reason, 'быстрые слоты пусты',
      'причина дословно (краснота: ' + (r && r.reason) + ')');
  }
});

test('194-CORE-ALLY-SHALE: слот на предмет, которого нет в общем инвентаре — отказ, пул и лог не тронуты', () => {
  const p = strongHero();
  const c = allyCombat(p);
  const a = c.units.find((x) => x.id === 'a0');
  a.quick = ['healing_potion', null, null]; // зелья в инвентаре НЕТ
  const pool = a.quickItem;
  const logLen = c.log.length;
  const r = c.quickItem(0);
  assert.ok(r && r.ok === false, 'краснота: ' + JSON.stringify(r));
  assert.equal(r.reason, 'предмета нет в инвентаре',
    'причина дословно (краснота: ' + (r && r.reason) + ')');
  assert.equal(a.quickItem, pool, 'пул не тратится');
  assert.equal(c.log.length, logLen, 'лог не растёт');
});

test('194-CORE-ALLY-REJ: неприменимый предмет (оружие) — причина useItem, пул восстанавливается', () => {
  const p = strongHero();
  I.addItem(p, 'iron_sword');
  const c = allyCombat(p);
  const a = c.units.find((x) => x.id === 'a0');
  a.quick = ['iron_sword', null, null];
  const pool = a.quickItem;
  const r = c.quickItem(0);
  assert.ok(r && r.ok === false, 'краснота: ' + JSON.stringify(r));
  assert.equal(r.reason, 'оружие — экипируется',
    'причина useItem дословно (краснота: ' + (r && r.reason) + ')');
  assert.equal(a.quickItem, pool, 'действие не сгорает (пул восстановлен)');
});

test('194-CORE-ALLY-RES: быстрый свиток воскрешения — первый мёртвый СОЮЗНИК, 50% HP, 0 c._rng', () => {
  const p = strongHero();
  I.addItem(p, 'resurrect_scroll');
  const ashka = Object.assign({}, ALLY_VOLK_HI, { name: 'Ашка' });
  const c = allyCombat(p, [ALLY_VOLK_HI, ashka]);
  const a0 = c.units.find((x) => x.id === 'a0');
  const a1 = c.units.find((x) => x.id === 'a1');
  a1.alive = false; // мёртвый союзник
  a0.quick = ['resurrect_scroll', null, null];
  let rngCalls = 0;
  c._rng = () => { rngCalls += 1; return 0.01; };
  const pool = a0.quickItem;
  const r = c.quickItem(0);
  assert.ok(r && r.ok === true, 'краснота: ' + JSON.stringify(r));
  assert.equal(r.item, 'Свиток воскрешения', 'r.item — имя предмета');
  assert.equal(a1.alive, true, 'первый мёртвый СОЮЗНИК воскрес');
  assert.equal(a1.hp, Math.round(a1.maxHP / 2), 'hp = 50% maxHP (ядро)');
  assert.equal(I.totalQty(p, 'resurrect_scroll'), 0,
    'свиток потрачен из общего инвентаря');
  assert.equal(a0.quickItem, pool - 1, 'пул 1→0');
  assert.ok(c.log.includes('Возвращён в бой.'), 'строка ядра в логе');
  assert.equal(rngCalls, 0, '0 c._rng (детерминированное правило)');
});

test('194-CORE-ALLY-INV: c.invItem на ходу союзника — предмет из общего инвентаря, эффект на союзнике', () => {
  const p = strongHero();
  I.addItem(p, 'healing_potion');
  const c = allyCombat(p);
  const a = c.units.find((x) => x.id === 'a0');
  a.hp = 10;
  const pool = a.invItem;
  const r = c.invItem('healing_potion');
  assert.ok(r && r.ok === true,
    'c.invItem на ходу союзника (краснота: null — player-guard): '
    + JSON.stringify(r));
  assert.equal(I.totalQty(p, 'healing_potion'), 0,
    'потрачено из общего инвентаря');
  assert.equal(a.hp, 13, 'эффект на союзнике (кап maxHP)');
  assert.equal(a.invItem, pool - 1, 'пул u.invItem 1→0');
  // Без аргумента — «выберите предмет из инвентаря».
  a.invItem = 1;
  const r2 = c.invItem();
  assert.ok(r2 && r2.ok === false, 'краснота: ' + JSON.stringify(r2));
  assert.equal(r2.reason, 'выберите предмет из инвентаря',
    'причина дословно (краснота: ' + (r2 && r2.reason) + ')');
  // Нет в инвентаре — пул не тратится.
  const pool2 = a.invItem;
  const r3 = c.invItem('bread');
  assert.ok(r3 && r3.ok === false, 'краснота: ' + JSON.stringify(r3));
  assert.equal(r3.reason, 'предмета нет в инвентаре',
    'причина дословно (краснота: ' + (r3 && r3.reason) + ')');
  assert.equal(a.invItem, pool2, 'пул не тратится');
});

// --- canDoAction: quickItem/invItem на ходу союзника (красные) ---

test('194-CANDO-ALLY-Q: canDoAction quickItem на ходу союзника — зеркало hero-ветки (у. quick / инвентарь героя)', () => {
  const mk = (mutate) => {
    const p = strongHero();
    const c = allyCombat(p);
    const a = c.units.find((x) => x.id === 'a0');
    mutate(p, a);
    return { p, c, a };
  };
  assert.equal(activeUnitId(allyCombat(strongHero())), 'a0',
    'сценарий: активен наёмник');
  // Применимое зелье в первом слоте — ok.
  {
    const { p, c, a } = mk((pp, aa) => {
      I.addItem(pp, 'healing_potion');
      aa.quick = ['healing_potion', null, null];
    });
    assert.deepEqual(canDoAction(c, 'quickItem'), { ok: true },
      'применимое зелье — ok (краснота: «недоступно активному персонажу»)');
  }
  // Пул 0 — «действий «Быстрый предмет» больше нет».
  {
    const { p, c, a } = mk((pp, aa) => {
      I.addItem(pp, 'healing_potion');
      aa.quick = ['healing_potion', null, null];
      aa.quickItem = 0;
    });
    assert.equal(canDoAction(c, 'quickItem').reason,
      'действий «Быстрый предмет» больше нет',
      'причина дословно (краснота: «недоступно активному персонажу»)');
  }
  // Слоты пусты.
  {
    const { c } = mk(() => {});
    assert.equal(canDoAction(c, 'quickItem').reason, 'быстрые слоты пусты',
      'причина дословно (краснота: «недоступно активному персонажу»)');
  }
  // Неизвестный id в слоте.
  {
    const { c, a } = mk((pp, aa) => { aa.quick = ['nope_item', null, null]; });
    assert.equal(canDoAction(c, 'quickItem').reason,
      'неизвестный предмет: nope_item',
      'причина дословно (краснота: «недоступно активному персонажу»)');
  }
  // Слот на предмет, которого нет в инвентаре.
  {
    const { c, a } = mk((pp, aa) => { aa.quick = ['healing_potion', null, null]; });
    assert.equal(canDoAction(c, 'quickItem').reason,
      'предмета нет в инвентаре',
      'причина дословно (краснота: «недоступно активному персонажу»)');
  }
  // Оружие/броня/реагент — причины useItem-применимости.
  for (const [id, reason] of [
    ['iron_sword', 'оружие — экипируется'],
    ['leather_armor', 'броня — экипируется'],
    ['sulfur', 'реагент нельзя применить (торговый товар)'],
  ]) {
    const { p, c, a } = mk((pp, aa) => {
      I.addItem(pp, id);
      aa.quick = [id, null, null];
    });
    assert.equal(canDoAction(c, 'quickItem').reason, reason,
      id + ' (краснота: «недоступно активному персонажу»)');
  }
  // Свиток воскрешения: без мёртвого союзника — отказ.
  {
    const { p, c, a } = mk((pp, aa) => {
      I.addItem(pp, 'resurrect_scroll');
      aa.quick = ['resurrect_scroll', null, null];
    });
    assert.equal(canDoAction(c, 'quickItem').reason,
      'нет погибших союзников',
      'причина дословно (краснота: «недоступно активному персонажу»)');
  }
  {
    const p = strongHero();
    I.addItem(p, 'resurrect_scroll');
    const ashka = Object.assign({}, ALLY_VOLK_HI, { name: 'Ашка' });
    const c = allyCombat(p, [ALLY_VOLK_HI, ashka]);
    const a0 = c.units.find((x) => x.id === 'a0');
    const a1 = c.units.find((x) => x.id === 'a1');
    a1.alive = false;
    a0.quick = ['resurrect_scroll', null, null];
    assert.deepEqual(canDoAction(c, 'quickItem'), { ok: true },
      'свиток + погибший союзник — ok (краснота: «недоступно активному персонажу»)');
  }
});

test('194-CANDO-ALLY-I: canDoAction invItem на ходу союзника — применимый предмет в общем инвентаре', () => {
  const mk = (mutate) => {
    const p = strongHero();
    const c = allyCombat(p);
    const a = c.units.find((x) => x.id === 'a0');
    mutate(p, a);
    return { p, c, a };
  };
  // Зелье в инвентаре — ok.
  {
    const { p, c } = mk((pp) => { I.addItem(pp, 'healing_potion'); });
    assert.deepEqual(canDoAction(c, 'invItem'), { ok: true },
      'применимое зелье — ok (краснота: «недоступно активному персонажу»)');
  }
  // Пустой инвентарь.
  {
    const { c } = mk(() => {});
    assert.equal(canDoAction(c, 'invItem').reason,
      'нет применимых предметов в инвентаре',
      'причина дословно (краснота: «недоступно активному персонажу»)');
  }
  // Только неприменимые (реагент/оружие/броня).
  {
    const { p, c } = mk((pp) => {
      I.addItem(pp, 'sulfur');
      I.addItem(pp, 'iron_sword');
      I.addItem(pp, 'leather_armor');
    });
    assert.equal(canDoAction(c, 'invItem').reason,
      'нет применимых предметов в инвентаре',
      'реагент/оружие/броня — неприменимы (краснота: «недоступно активному персонажу»)');
  }
  // Пул 0.
  {
    const { p, c, a } = mk((pp, aa) => {
      I.addItem(pp, 'bread');
      aa.invItem = 0;
    });
    assert.equal(canDoAction(c, 'invItem').reason,
      'действий «Предмет из инвентаря» больше нет',
      'причина дословно (краснота: «недоступно активному персонажу»)');
  }
});

// --- Якоря (зелёные до и после реализации) ---

test('194-CORE-HERO (якорь): быстрый предмет героя — без изменений (бит-в-бит)', () => {
  const p = strongHero();
  I.addItem(p, 'healing_potion');
  assert.equal(I.setQuick(p, 0, 'healing_potion').ok, true);
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 1, seed: 5 });
  p.hp = 10;
  const pool = c.ps.quickItem;
  const r = c.quickItem(0);
  assert.equal(r.ok, true);
  assert.equal(r.slot, 0);
  assert.equal(p.hp, 25, '+15 HP от зелья');
  assert.equal(c.ps.quickItem, pool - 1, 'действие потрачено');
  assert.equal(I.totalQty(p, 'healing_potion'), 0, 'зелье в слоте потрачено');
});

test('194-CORE-MOB-NULL (якорь): c.quickItem/c.invItem на слоте МОБА — null (диспатч без союзников)', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
  assert.equal(c.turnOrder[0], 'm0', 'волк (инит 3) — первый в очереди');
  c.turnIndex = 0;
  c.phase = 'mob';
  assert.equal(c.quickItem(), null, 'слот моба — null');
  assert.equal(c.invItem('healing_potion'), null, 'слот моба — null');
});

test('194-CANDO-FBF (якорь): fire/block/flee на ходу союзника — «недоступно активному персонажу» (без изменений)', () => {
  const c = allyCombat(strongHero());
  assert.equal(activeUnitId(c), 'a0', 'активен наёмник');
  for (const act of ['fire', 'block', 'flee']) {
    const r = canDoAction(c, act);
    assert.equal(r.ok, false, act + ' — недоступно');
    assert.equal(r.reason, 'недоступно активному персонажу',
      act + ' — причина дословно');
  }
});

test('194-CANDO-HERO (якорь): canDoAction quickItem/invItem на ходу героя — без изменений (бит-в-бит)', () => {
  const p = strongHero();
  const c = createCombat({ player: p, mobs: ['wolf'], mobLevel: 2, seed: 5 });
  assert.equal(c.ps.quickItem, 1, 'старт: пул 1');
  assert.equal(canDoAction(c, 'quickItem').reason, 'быстрые слоты пусты');
  I.addItem(p, 'healing_potion');
  I.setQuick(p, 0, 'healing_potion');
  assert.deepEqual(canDoAction(c, 'quickItem'), { ok: true },
    'применимое зелье — ok');
  c.ps.quickItem = 0;
  assert.equal(canDoAction(c, 'quickItem').reason,
    'действий «Быстрый предмет» больше нет');
  c.ps.quickItem = 1;
  assert.deepEqual(canDoAction(c, 'invItem'), { ok: true },
    'зелье в инвентаре — применимо');
  c.ps.invItem = 0;
  assert.equal(canDoAction(c, 'invItem').reason,
    'действий «Предмет из инвентаря» больше нет');
});
