// Ядро NPC: диалоги, торговля, школы навыков, квесты (задача 000010).
// Фикстуры — inline-объекты: данные NPC передаются функциям аргументом,
// файлы assets/npc ядро не читает (консистентность данных — npc-data.test.js).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const P = require('../src/player.js');
const I = require('../src/items.js');
const N = require('../src/npc.js');

// --- Фикстуры ---

const trainNpc = {
  id: 't',
  имя: 'Каркаш',
  роль: 'наставник',
  постройки: [7],
  диалог: [
    { id: 'open', текст: 'Тренировка — или просто смотри?', действие: 'обучение' },
    { id: 'char', текст: 'Слух для решительных', действие: 'подсказка', требования: { харизма: 3 } },
    { id: 'orator', текст: 'Слух для красноречивых', действие: 'подсказка', требования: { навык: { id: 'orator', уровень: 2 } } },
    { id: 'check', текст: 'Слух для знатоков', действие: 'подсказка', требования: { проверка: 3 } },
  ],
  обучение: {
    навыки: ['swordsman', 'heavy', 'archer', 'accuracy'],
    цена_за_уровень: 25,
    цена_переноса_за_уровень: 40,
  },
};

const tradeNpc = {
  id: 's',
  имя: 'Бренна',
  роль: 'торговец оружием',
  постройки: [1],
  диалог: [{ id: 'trade', текст: 'Товары', действие: 'торговля' }],
  торговля: {
    предметы: [
      { предмет: 'wood_sword', цена_покупки: 10, цена_продажи: 6, количество: 2 },
      { предмет: 'moonstone', цена_покупки: 25, цена_продажи: 15, количество: 1 },
    ],
  },
};

const questNpc = {
  id: 'q',
  имя: 'Элдина',
  роль: 'старейшина',
  постройки: [36],
  диалог: [{ id: 'quests', текст: 'Задания храма', действие: 'квесты' }],
  квесты: [
    {
      id: 'q1',
      название: 'Лунный обряд',
      описание: 'Храму нужны два лунных камня.',
      цель: { тип: 'bring_item', предмет: 'moonstone', количество: 2 },
      награда: { опыт: 60, золото: 50, предметы: [{ предмет: 'mana_elixir', количество: 1 }] },
      предыдущий: null,
    },
    {
      id: 'q2',
      название: 'Орочий набег',
      описание: 'Повергни группу набеговых орков.',
      цель: { тип: 'kill_group', группа: 1, количество: 1 },
      награда: { опыт: 40, золото: 30 },
      предыдущий: 'q1',
    },
    {
      id: 'q3',
      название: 'Дух бездны',
      описание: 'Останови дух бездны.',
      цель: { тип: 'kill_group', группа: 6, количество: 1 },
      награда: { опыт: 10, золото: 10 },
      предыдущий: null,
    },
  ],
};

const smithNpc = {
  id: 'k',
  имя: 'Торна',
  роль: 'кузнец',
  постройки: [8, 25],
  диалог: [{ id: 'open', текст: 'По делу — заходи.', действие: 'подсказка' }],
};

const capNpc = {
  id: 'm',
  имя: 'Хранителька',
  роль: 'старейшина',
  постройки: [44],
  диалог: [{ id: 'quests', текст: 'Задания', действие: 'квесты' }],
  квесты: [1, 2, 3, 4, 5, 6].map((i) => ({
    id: 'c' + i,
    название: 'Задание ' + i,
    описание: 'Простое задание.',
    цель: { тип: 'kill_group', группа: 0, количество: 1 },
    награда: { опыт: 5, золото: 5 },
    предыдущий: null,
  })),
};

const comboNpc = {
  id: 'w',
  имя: 'Шептун',
  роль: 'тавернщик',
  постройки: [44],
  диалог: [{
    id: 'combo',
    текст: 'Слух для убеждённых и красноречивых',
    действие: 'подсказка',
    требования: { харизма: 2, навык: { id: 'orator', уровень: 1 } },
  }],
};

// --- 1. Справочные ---

test('справочные: npcById, npcsForBuilding, npcForBuilding, skillLevel', () => {
  const npcs = [trainNpc, smithNpc, tradeNpc, questNpc];
  assert.equal(N.npcById(npcs, 's'), tradeNpc);
  assert.equal(N.npcById(npcs, 'nope'), null);
  assert.deepEqual(N.npcsForBuilding(npcs, 8), [smithNpc]);
  assert.deepEqual(N.npcsForBuilding(npcs, 25), [smithNpc], 'NPC с [8, 25] найден по обоим');
  assert.deepEqual(N.npcsForBuilding(npcs, 7), [trainNpc]);
  assert.deepEqual(N.npcsForBuilding(npcs, 99), []);
  assert.equal(N.npcForBuilding(npcs, 8), smithNpc);
  assert.equal(N.npcForBuilding(npcs, 99), null);
  const c = P.createCharacter();
  assert.equal(N.skillLevel(c, 'charisma'), 1, 'основной навык');
  assert.equal(N.skillLevel(c, 'orator'), 0, 'нет вторичного — 0');
  c.secondary.orator = 4;
  assert.equal(N.skillLevel(c, 'orator'), 4, 'вторичный навык');
});

// --- 2. Диалоги: доступность опций ---

test('диалог: доступность опций по Харизме, навыку и проверке', () => {
  const c = P.createCharacter(); // Харизма 1, вторичных навыков нет
  const o = N.dialogOptions(trainNpc, c);
  assert.equal(o.length, 4);
  // Без требований — доступна, причина null.
  assert.deepEqual(o[0], { option: trainNpc.диалог[0], доступен: true, причина: null });
  // Харизма 3: ниже порога — заблокирована с причиной.
  assert.equal(o[1].доступен, false);
  assert.equal(o[1].причина, 'нужна Харизма 3');
  // Навык «Оратор» 2: ниже порога — заблокирован, причина с именем и уровнем.
  assert.equal(o[2].доступен, false);
  assert.match(o[2].причина, /Оратор/);
  assert.match(o[2].причина, /2/);
  // Проверка 3: бонус к диалогу 0 — заблокирована.
  assert.equal(o[3].доступен, false);
  assert.match(o[3].причина, /бонус к диалогу/);

  // Ровно на пороге Харизмы — доступна.
  c.primary.charisma = 2;
  assert.equal(N.dialogOptions(trainNpc, c)[1].доступен, false);
  c.primary.charisma = 3;
  assert.equal(N.dialogOptions(trainNpc, c)[1].доступен, true);

  // Прокачка «Оратор» до 2 — опция навыка открывается.
  c.points += 2;
  assert.equal(P.raiseSkill(c, 'orator').ok, true);
  assert.equal(P.raiseSkill(c, 'orator').ok, true);
  assert.equal(N.dialogOptions(trainNpc, c)[2].доступен, true);
  // Бонус к диалогу = «Старейшина» + «Оратор» = 2 — проверка всё ещё закрыта.
  assert.equal(N.dialogOptions(trainNpc, c)[3].доступен, false);
  // Ровно на пороге: бонус 3 — доступна.
  c.points += 1;
  assert.equal(P.raiseSkill(c, 'elder').ok, true);
  assert.equal(P.derived(c).dialogueBonus, 3);
  assert.equal(N.dialogOptions(trainNpc, c)[3].доступен, true);
});

test('диалог: комбинация требований — первая невыполненная (харизма → навык)', () => {
  const c = P.createCharacter();
  let o = N.dialogOptions(comboNpc, c)[0];
  assert.equal(o.доступен, false);
  assert.equal(o.причина, 'нужна Харизма 2', 'сначала проверяется Харизма');
  c.primary.charisma = 2;
  o = N.dialogOptions(comboNpc, c)[0];
  assert.equal(o.доступен, false);
  assert.match(o.причина, /Оратор/, 'потом — навык');
  c.points += 1;
  assert.equal(P.raiseSkill(c, 'orator').ok, true);
  o = N.dialogOptions(comboNpc, c)[0];
  assert.equal(o.доступен, true);
  assert.equal(o.причина, null);
});

// --- 3. Школы: прокачка за монеты ---

test('школа: справки о навыках и ценах', () => {
  assert.deepEqual(N.schoolSkills(trainNpc), ['swordsman', 'heavy', 'archer', 'accuracy']);
  assert.equal(N.schoolTrainPrice(trainNpc), 25);
  assert.equal(N.schoolRefundPrice(trainNpc, 2), 80);
  assert.deepEqual(N.schoolSkills(tradeNpc), [], 'без обучения — пусто');
  assert.equal(N.schoolTrainPrice(tradeNpc), null);
  assert.equal(N.schoolRefundPrice(tradeNpc, 1), null);
});

test('школа: прокачка за монеты, без траты очков', () => {
  const c = P.createCharacter(); // gold 100, points 0
  const r = N.schoolTrain(trainNpc, c, 'swordsman');
  assert.deepEqual(r, { ok: true, level: 1, price: 25 });
  assert.equal(c.gold, 75);
  assert.equal(c.secondary.swordsman, 1);
  assert.equal(c.points, 0, 'очки не тратятся');

  // Мало золота — ничего не изменилось.
  c.gold = 10;
  assert.deepEqual(N.schoolTrain(trainNpc, c, 'swordsman'),
    { ok: false, reason: 'мало золота (нужно 25)' });
  assert.equal(c.gold, 10);
  assert.equal(c.secondary.swordsman, 1);

  // Ветка: «Стрелок» требует «Меткость» 5.
  const c2 = P.createCharacter();
  assert.deepEqual(N.schoolTrain(trainNpc, c2, 'archer'),
    { ok: false, reason: 'нужен Меткость 5' });
  c2.secondary.accuracy = 5;
  const r3 = N.schoolTrain(trainNpc, c2, 'archer');
  assert.equal(r3.ok, true);
  assert.equal(r3.level, 1);
  assert.equal(c2.gold, 75);

  // Навык вне списка / не вторичный / максимум / нет основного.
  assert.equal(N.schoolTrain(trainNpc, c2, 'thief').reason, 'навык не обучается здесь');
  assert.equal(N.schoolTrain(trainNpc, c2, 'strength').reason, 'навык не обучается здесь',
    'основной навык не входит в список школы');
  // Защита от некорректных данных: id основного навыка в списке школы.
  const badNpc = {
    id: 'bad', постройки: [7], диалог: [],
    обучение: { навыки: ['strength'], цена_за_уровень: 25, цена_переноса_за_уровень: 40 },
  };
  assert.equal(N.schoolTrain(badNpc, c2, 'strength').reason, 'не вторичный навык');
  const c3 = P.createCharacter();
  c3.secondary.swordsman = 100;
  assert.equal(N.schoolTrain(trainNpc, c3, 'swordsman').reason, 'максимальный уровень');
  const c4 = P.createCharacter();
  c4.primary.strength = 0;
  assert.equal(N.schoolTrain(trainNpc, c4, 'swordsman').reason, 'недостаточно: Сила');
});

test('школа: canSchoolTrain согласован с schoolTrain', () => {
  const cases = [
    [P.createCharacter(), 'swordsman'], // ok
    [Object.assign(P.createCharacter(), { gold: 10 }), 'swordsman'], // мало золота
    [P.createCharacter(), 'thief'], // вне списка
    [P.createCharacter(), 'strength'], // не вторичный
    [Object.assign(P.createCharacter(), { secondary: { swordsman: 100 } }), 'swordsman'], // максимум
  ];
  for (const [c, id] of cases) {
    const can = N.canSchoolTrain(trainNpc, c, id);
    const did = N.schoolTrain(trainNpc, c, id);
    assert.equal(can.ok, did.ok, id + ': решение can/execute расходится');
    if (!can.ok) assert.equal(can.reason, did.reason, id + ': причина расходится');
  }
});

// --- 4. Школы: перенос очков ---

test('школа: перенос очков — возврат уровней в пул за монеты', () => {
  const c = P.createCharacter();
  c.gold = 1000;
  c.secondary.swordsman = 3;
  const r = N.schoolRefund(trainNpc, c, 'swordsman', 2);
  assert.deepEqual(r, { ok: true, level: 1, points: 2, price: 80 });
  assert.equal(c.gold, 920);
  assert.equal(c.secondary.swordsman, 1);
  assert.equal(c.points, 2, 'уровни возвращены в пул очков');
});

test('школа: защита дерева при переносе', () => {
  const c = P.createCharacter();
  c.gold = 1000;
  c.secondary.accuracy = 5;
  c.secondary.archer = 1;
  // 5 − 2 < 5 — «Стрелок» остался бы без требования.
  const r = N.schoolRefund(trainNpc, c, 'accuracy', 2);
  assert.equal(r.ok, false);
  assert.match(r.reason, /Стрелок/);
  assert.match(r.reason, /5/);
  assert.equal(c.secondary.accuracy, 5, 'ничего не изменилось');
  // До самого требуемого уровня — можно.
  c.secondary.accuracy = 6;
  const r2 = N.schoolRefund(trainNpc, c, 'accuracy', 1);
  assert.equal(r2.ok, true);
  assert.equal(r2.level, 5);
  assert.equal(c.points, 1);
});

test('школа: ошибки переноса (уровни, количество, золото)', () => {
  const c = P.createCharacter();
  c.gold = 1000;
  c.secondary.swordsman = 1;
  assert.equal(N.schoolRefund(trainNpc, c, 'swordsman', 2).reason, 'недостаточно уровней');
  assert.equal(N.schoolRefund(trainNpc, c, 'swordsman', 0).reason, 'неверное количество уровней');
  assert.equal(N.schoolRefund(trainNpc, c, 'swordsman', 1.5).reason, 'неверное количество уровней');
  assert.equal(N.schoolRefund(trainNpc, c, 'archer', 1).reason, 'недостаточно уровней');
  assert.equal(N.canSchoolRefund(trainNpc, c, 'swordsman', 1).ok, true);

  const c2 = P.createCharacter();
  c2.gold = 10;
  c2.secondary.swordsman = 2;
  assert.deepEqual(N.schoolRefund(trainNpc, c2, 'swordsman', 1),
    { ok: false, reason: 'мало золота (нужно 40)' });
  assert.equal(c2.gold, 10);
  assert.equal(c2.secondary.swordsman, 2);
  assert.equal(c2.points, 0);
});

// --- 5. Торговля NPC ---

test('торговля: сток и цены (с учётом «Торговца»)', () => {
  const shop = N.createNpcShop(tradeNpc);
  assert.deepEqual(shop.stock, { wood_sword: 2, moonstone: 1 });
  assert.equal(shop.npc, tradeNpc);
  assert.equal(N.createNpcShop(trainNpc), null, 'нет торговли — нет магазина');
  assert.equal(N.npcBuyPrice(shop, 'knight_plate', P.createCharacter()), null);
  assert.equal(N.npcSellPrice(shop, 'knight_plate', P.createCharacter()), null);

  const c = P.createCharacter();
  c.secondary.merchant = 5; // buyPriceMult 0.75, sellPriceMult 1.25
  assert.equal(N.npcBuyPrice(shop, 'wood_sword', c), 8, 'round(10*0.75)');
  assert.equal(N.npcSellPrice(shop, 'wood_sword', c), 8, 'round(6*1.25)');
  const c0 = P.createCharacter();
  assert.equal(N.npcBuyPrice(shop, 'wood_sword', c0), 10);
  assert.equal(N.npcSellPrice(shop, 'wood_sword', c0), 6);
});

test('торговля: покупка, сток, мало золота, полный инвентарь', () => {
  const shop = N.createNpcShop(tradeNpc);
  const c = P.createCharacter(); // gold 100
  assert.deepEqual(N.npcBuy(shop, c, 'wood_sword'),
    { ok: true, item: 'wood_sword', qty: 1, price: 10 });
  assert.equal(c.gold, 90);
  assert.equal(I.totalQty(c, 'wood_sword'), 1);
  assert.equal(shop.stock.wood_sword, 1);
  assert.equal(N.npcBuy(shop, c, 'wood_sword').ok, true);
  assert.equal(shop.stock.wood_sword, 0);
  assert.equal(N.npcBuy(shop, c, 'wood_sword').reason, 'нет в наличии');
  assert.equal(c.gold, 80);
  assert.equal(N.npcBuy(shop, c, 'moonstone', 5).reason, 'нет в наличии');
  assert.equal(N.npcBuy(shop, c, 'knight_plate').reason, 'NPC не продаёт такой предмет');

  // Мало золота — ничего не изменилось (инвариант gold ≥ 0).
  const c2 = P.createCharacter();
  c2.gold = 5;
  const shop2 = N.createNpcShop(tradeNpc);
  assert.deepEqual(N.npcBuy(shop2, c2, 'wood_sword'),
    { ok: false, reason: 'мало золота (нужно 10)' });
  assert.equal(c2.gold, 5);
  assert.equal(shop2.stock.wood_sword, 2);
  assert.equal(I.slotCount(c2), 0);

  // Полный инвентарь — причина addItem пробрасывается.
  const c3 = P.createCharacter();
  c3.secondary.back = 10; // 60 кг — лимит веса не мешает заполнить слоты
  for (const it of I.allItems()) {
    if (I.slotCount(c3) >= I.INVENTORY_SLOTS) break;
    assert.equal(I.addItem(c3, it.id, 1).ok, true, it.id);
  }
  assert.equal(I.slotCount(c3), I.INVENTORY_SLOTS);
  const shop3 = N.createNpcShop(tradeNpc);
  assert.deepEqual(N.npcBuy(shop3, c3, 'moonstone'),
    { ok: false, reason: 'нет свободных слотов инвентаря' });
  assert.equal(shop3.stock.moonstone, 1, 'сток не тронут');
  assert.equal(c3.gold, 100, 'золото не тронуто');
});

test('торговля: продажа NPC', () => {
  const shop = N.createNpcShop(tradeNpc);
  const c = P.createCharacter();
  assert.equal(I.addItem(c, 'wood_sword', 1).ok, true);
  assert.deepEqual(N.npcSell(shop, c, 'wood_sword'),
    { ok: true, item: 'wood_sword', qty: 1, price: 6 });
  assert.equal(c.gold, 106);
  assert.equal(I.totalQty(c, 'wood_sword'), 0);
  assert.equal(N.npcSell(shop, c, 'wood_sword').reason, 'предмета нет в инвентаре');
  assert.equal(I.addItem(c, 'knight_plate', 1).ok, true);
  assert.equal(N.npcSell(shop, c, 'knight_plate').reason, 'NPC не скупает такие предметы');
});

// --- 6. Квесты: приём, цепочки, лимит ---

test('квесты: журнал, доступность, цепочки, лимит активных', () => {
  const npcs = [questNpc];
  const book = N.createQuestBook();
  assert.deepEqual(book, { active: {}, done: [] });

  // Цепочка: q2 закрыт, пока q1 не выполнен; q1 и q3 доступны.
  assert.deepEqual(N.availableQuests(npcs, book, questNpc).map((q) => q.id), ['q1', 'q3']);
  assert.equal(N.questDef(npcs, 'q', 'q2').название, 'Орочий набег');
  assert.equal(N.questDef(npcs, 'q', 'nope'), null);
  assert.equal(N.questDef(npcs, 'nope', 'q1'), null);

  assert.equal(N.acceptQuest(book, npcs, questNpc, 'q1').ok, true);
  assert.deepEqual(book.active.q1,
    { npcId: 'q', questId: 'q1', status: 'active', progress: 0 });
  assert.equal(N.acceptQuest(book, npcs, questNpc, 'q1').reason, 'квест недоступен');
  assert.equal(N.acceptQuest(book, npcs, questNpc, 'q2').reason, 'квест недоступен', 'цепочка закрыта');
  assert.equal(N.acceptQuest(book, npcs, questNpc, 'nope').reason, 'квест недоступен');

  // Лимит: 6 простых квестов — шестой не помещается.
  const capBook = N.createQuestBook();
  for (let i = 1; i <= 5; i++) {
    assert.equal(N.acceptQuest(capBook, [capNpc], capNpc, 'c' + i).ok, true);
  }
  assert.equal(N.acceptQuest(capBook, [capNpc], capNpc, 'c6').reason,
    'слишком много активных квестов (5)');
  assert.equal(N.MAX_ACTIVE_QUESTS, 5);
});

// --- 7. Квесты: награды ---

test('квесты: bring_item — цель, награда ровно один раз, цепочка открылась', () => {
  const npcs = [questNpc];
  const book = N.createQuestBook();
  assert.equal(N.acceptQuest(book, npcs, questNpc, 'q1').ok, true);
  const c = P.createCharacter(); // gold 100

  // Цель ещё не достигнута.
  assert.equal(N.turnInQuest(npcs, book, c, 'q1').reason, 'цель ещё не достигнута');
  assert.equal(N.turnInQuest(npcs, book, c, 'nope').reason, 'квест не в работе');

  I.addItem(c, 'moonstone', 2);
  assert.deepEqual(N.refreshBringItems(npcs, book, c), ['q1']);
  assert.equal(book.active.q1.status, 'ready');

  const r = N.turnInQuest(npcs, book, c, 'q1');
  assert.equal(r.ok, true);
  assert.equal(r.quest, questNpc.квесты[0]);
  assert.deepEqual(r.reward,
    { xp: 60, gold: 50, items: [{ предмет: 'mana_elixir', количество: 1 }] });
  assert.equal(I.totalQty(c, 'moonstone'), 0, 'принесённый предмет списан');
  assert.equal(I.totalQty(c, 'mana_elixir'), 1, 'наградной предмет выдан');
  assert.equal(c.gold, 150, '+50 золота');
  assert.equal(c.totalXp, 60, '+60 опыта (без «Учёного» — ×1)');
  assert.ok(!book.active.q1, 'квест больше не активен');
  assert.deepEqual(book.done, ['q1']);

  // Награда выдаётся ровно один раз.
  const again = N.turnInQuest(npcs, book, c, 'q1');
  assert.equal(again.ok, false);
  assert.equal(again.reason, 'квест не в работе');
  assert.equal(c.gold, 150, 'золото не выросло повторно');
  assert.equal(I.totalQty(c, 'mana_elixir'), 1);

  // Цепочка: q2 стал доступен.
  assert.deepEqual(N.availableQuests(npcs, book, questNpc).map((q) => q.id), ['q2', 'q3']);
});

test('квесты: kill_group — победа над группой, прогресс, награда', () => {
  const npcs = [questNpc];
  const book = N.createQuestBook();
  assert.equal(N.acceptQuest(book, npcs, questNpc, 'q3').ok, true);
  const c = P.createCharacter();

  // Не тот тип группы — ничего не меняется.
  assert.deepEqual(N.notifyGroupDefeated(npcs, book, 1), []);
  assert.equal(book.active.q3.status, 'active');
  assert.equal(book.active.q3.progress, 0);
  assert.equal(N.turnInQuest(npcs, book, c, 'q3').reason, 'цель ещё не достигнута');

  // Верная группа — квест готов к сдаче.
  assert.deepEqual(N.notifyGroupDefeated(npcs, book, 6), ['q3']);
  assert.equal(book.active.q3.status, 'ready');
  assert.equal(N.notifyGroupDefeated(npcs, book, 6).length, 0, 'повторно «готовым» не становится');

  // activeQuests перед сдачей.
  const act = N.activeQuests(npcs, book);
  assert.equal(act.length, 1);
  assert.equal(act[0].quest.id, 'q3');
  assert.equal(act[0].instance, book.active.q3);

  const r = N.turnInQuest(npcs, book, c, 'q3');
  assert.equal(r.ok, true);
  assert.equal(c.gold, 110, '+10 золота');
  assert.equal(c.totalXp, 10, '+10 опыта');
  assert.deepEqual(book.done, ['q3']);
  assert.deepEqual(N.activeQuests(npcs, book), [], 'после сдачи — пусто');
});

// --- 8. Инварианты ---

test('инварианты: золото ≥ 0, сток ≥ 0, журнал без выполненных', () => {
  const npcs = [questNpc, tradeNpc];
  const book = N.createQuestBook();
  const shop = N.createNpcShop(tradeNpc);
  const c = P.createCharacter();

  c.gold = 10;
  assert.equal(N.npcBuy(shop, c, 'wood_sword').ok, true);
  assert.equal(c.gold, 0, 'до нуля можно, ниже — нет');
  assert.equal(N.npcBuy(shop, c, 'wood_sword').ok, false);
  assert.ok(c.gold >= 0);

  N.acceptQuest(book, npcs, questNpc, 'q1');
  I.addItem(c, 'moonstone', 2);
  N.refreshBringItems(npcs, book, c);
  assert.equal(N.turnInQuest(npcs, book, c, 'q1').ok, true);

  assert.ok(c.gold >= 0, 'золото не отрицательное');
  assert.ok(Object.values(shop.stock).every((q) => q >= 0), 'сток не отрицательный');
  for (const id of book.done) assert.ok(!book.active[id], id + ': в active нет выполненного');
  assert.ok(c.points >= 0, 'очки не в минусе');
});
