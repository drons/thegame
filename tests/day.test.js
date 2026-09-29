const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {
  STEPS_PER_DAY, RESPAWN_DAYS, createClock, dueForRespawn, canUseToday,
  serializeDefeatedAt, restoreDefeatedAt,
  // Задача 000072: состояние «раз в день» и благословения.
  serializeDayMap, restoreDayMap,
  grantBuff, activeBuffs, buffMods, restoreBuffs, serializeBuffs,
  // Задача 000122 (стадия красных тестов): функция ещё не реализована —
  // тесты ниже падают, пока её нет в day.js.
  groupVisible,
} = require('../src/day.js');

test('часы: старт на 1-м дне, шаги копятся до порога', () => {
  const c = createClock({ stepsPerDay: 5 });
  assert.equal(c.day, 1);
  assert.equal(c.steps, 0);
  c.addStep(4);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 4);
  c.addStep(1); // порог 5 → день 2
  assert.equal(c.day, 2);
  assert.equal(c.steps, 0);
});

test('часы: избыток шагов переходит в следующий день', () => {
  const c = createClock({ stepsPerDay: 3 });
  c.addStep(7); // 3 → день 2, 3 → день 3, остаток 1
  assert.equal(c.day, 3);
  assert.equal(c.steps, 1);
});

test('часы: отдых и события сразу сменяют день, слушатели получают причину', () => {
  const c = createClock();
  const seen = [];
  c.onDay((e) => seen.push(e));
  c.rest();
  c.event('dungeon');
  assert.equal(c.day, 3);
  assert.equal(c.steps, 0);
  assert.deepEqual(seen.map((e) => [e.day, e.reason]), [[2, 'rest'], [3, 'dungeon']]);
});

test('часы: по умолчанию steps_per_day = 40, respawn_days = 3', () => {
  const c = createClock();
  assert.equal(c.stepsPerDay, 40);
  assert.equal(STEPS_PER_DAY, 40);
  assert.equal(RESPAWN_DAYS, 3);
  c.addStep(STEPS_PER_DAY - 1);
  assert.equal(c.day, 1);
  c.addStep(1);
  assert.equal(c.day, 2);
});

test('респаун: группа возвращается через respawn_days дней', () => {
  const at = new Map([['1,1', 1], ['2,2', 5]]);
  // День 3: первая группа (3 - 1 = 2 < 3) ещё нет, вторая (3 - 5) — в прошлом, не считаем.
  assert.deepEqual(dueForRespawn(at, 4), ['1,1']); // 4 - 1 = 3 >= 3
  assert.deepEqual(dueForRespawn(at, 3), []);
  assert.deepEqual(dueForRespawn(at, 8, 3), ['1,1', '2,2']); // обе: 7 и 3 >= 3
  // Настраиваемый параметр.
  assert.deepEqual(dueForRespawn(at, 6, 1), ['1,1', '2,2']);
  assert.deepEqual(dueForRespawn(at, 1, 3), []);
});

test('«раз в день»: эффект нельзя применить повторно в тот же день', () => {
  assert.ok(canUseToday(undefined, 1), 'первое применение — можно');
  assert.ok(canUseToday(1, 1) === false, 'повторно в тот же день — нельзя');
  assert.ok(canUseToday(1, 2), 'на следующий день — можно снова');
});

// --- fastForward (восстановление сейва, задача 000031) ---
// Ключевое свойство: день доводится БЕЗ оповещения слушателей —
// при day=100000 это 99999 перерисовок DOM (заморозка браузера),
// а эффекты прошедших дней уже учтены в данных сейва (снимок).

test('часы: fastForward доводит день, сбрасывает шаги, слушатели НЕ вызваны', () => {
  const c = createClock({ stepsPerDay: 40 });
  const seen = [];
  c.onDay((e) => seen.push(e));
  c.addStep(35);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 35);
  c.fastForward(99999);
  assert.equal(c.day, 100000);
  assert.equal(c.steps, 0);
  assert.equal(seen.length, 0, 'слушатели onDay не должны вызываться');
});

test('часы: fastForward с n < 1 или нецелым — корректно (floor, нет-оп)', () => {
  const c = createClock({ stepsPerDay: 5 });
  c.addStep(3);
  assert.equal(c.fastForward(0), 1);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 3, 'n=0 — шаги не трогаем');
  assert.equal(c.fastForward(-7), 1);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 3, 'n<0 — шаги не трогаем');
  assert.equal(c.fastForward(2.9), 3); // floor(2.9) = 2
  assert.equal(c.steps, 0, 'n >= 1 — шаги сбрасываются');
});

test('fastForward + addStep: восстановление дня и шагов первого дня', () => {
  // Сейв {day: 1, steps: 35} — шаги первого дня должны восстановиться
  // (было: блок был вложен в d.day > clock.day и пропускался).
  const c = createClock({ stepsPerDay: 40 });
  c.fastForward(0);
  c.addStep(35);
  assert.equal(c.day, 1);
  assert.equal(c.steps, 35);
});

test('defeatedAt: serialize → restore roundtrip (включая отрицательные координаты)', () => {
  const m = new Map([['-3,7', 5], ['0,0', 2], ['12,-1', 42]]);
  const saved = serializeDefeatedAt(m);
  assert.deepEqual(saved, { '-3,7': 5, '0,0': 2, '12,-1': 42 });
  const back = restoreDefeatedAt(saved);
  assert.equal(back.size, 3);
  assert.equal(back.get('-3,7'), 5);
  assert.equal(back.get('12,-1'), 42);
});

test('defeatedAt: restoreDefeatedAt отбрасывает мусор, валидные записи сохраняет', () => {
  const saved = {
    '1,2': 4,          // валидная
    'abc': 1,          // не координаты
    '3,': 1,           // сломанный ключ
    ',4': 1,           // сломанный ключ
    '4,5': 0,          // день < 1
    '6,7': 1.5,        // нецелый день
    '8,9': 'x',        // строка
    '10,11': -2,       // отрицательный день
  };
  const m = restoreDefeatedAt(saved);
  assert.equal(m.size, 1);
  assert.equal(m.get('1,2'), 4);
});

test('defeatedAt: restoreDefeatedAt на не-объекте → пустой Map, serialize на мусоре → {}', () => {
  assert.ok(restoreDefeatedAt(null) instanceof Map);
  assert.equal(restoreDefeatedAt(null).size, 0);
  assert.equal(restoreDefeatedAt('junk').size, 0);
  assert.equal(restoreDefeatedAt([['1,2', 3]]).size, 0); // массив — не словарь
  assert.equal(restoreDefeatedAt(42).size, 0);
  assert.deepEqual(serializeDefeatedAt(null), {});
  assert.deepEqual(serializeDefeatedAt({}), {});
  assert.deepEqual(serializeDefeatedAt(new Map([['1,1', 2]])), { '1,1': 2 });
});

// --- Задача 000072: состояние эффектов построек в сейве ---
// Обобщение паттерна defeatedAt (000031) на ключи 'x,y:effectId'
// (счёт на ЭФФЕКТ, не на здание) + временные благословения (1 день)
// { source: 'x,y', day, kind: 'damage'|'armor' } с АБСОЛЮТНЫМИ днями
// (fastForward без слушателей — сейв СНИМОК). Чистые функции — в
// day.js рядом с canUseToday/serializeDefeatedAt (node-требовальность);
// реестр EFFECTS — отдельный файл (задача 000071), здесь его нет.

test('dayMap: serializeDayMap — Map → объект (:effectId, отрицательные координаты)', () => {
  const m = new Map([
    ['1,2', 3],
    ['1,2:heal', 5],
    ['-3,7:heal', 2],
    ['0,0', 1],
  ]);
  assert.deepEqual(serializeDayMap(m), {
    '1,2': 3, '1,2:heal': 5, '-3,7:heal': 2, '0,0': 1,
  });
});

test('dayMap: serializeDayMap на не-Map (мусор) → {}', () => {
  assert.deepEqual(serializeDayMap(null), {});
  assert.deepEqual(serializeDayMap(undefined), {});
  assert.deepEqual(serializeDayMap({}), {});
  assert.deepEqual(serializeDayMap('junk'), {});
  assert.deepEqual(serializeDayMap(42), {});
  assert.deepEqual(serializeDayMap([['1,2', 3]]), {}); // массив — не Map
});

test('dayMap: restoreDayMap roundtrip — :effectId и отрицательные координаты', () => {
  const saved = { '-3,7:heal': 5, '0,0': 2, '12,-1:coin': 42, '1,2': 3 };
  const m = restoreDayMap(saved);
  assert.ok(m instanceof Map);
  assert.equal(m.size, 4);
  assert.equal(m.get('-3,7:heal'), 5);
  assert.equal(m.get('0,0'), 2);
  assert.equal(m.get('12,-1:coin'), 42);
  assert.equal(m.get('1,2'), 3);
  assert.deepEqual(serializeDayMap(m), saved, 'roundtrip 1:1');
});

test('dayMap: restoreDayMap отбрасывает мусор, валидные записи сохраняет', () => {
  const saved = {
    '1,2': 4,            // валидная
    '1,2:heal': 6,       // валидная с эффектом
    'abc': 1,            // не координаты
    '1,': 1,             // сломанный ключ (нет y)
    ',2': 1,             // сломанный ключ (нет x)
    '1,2:': 1,           // пустой суффикс эффекта
    '1,2:heal:sub': 1,   // два двоеточия
    '1 2': 1,            // пробел вместо запятой
    '3,4': 0,            // день < 1
    '5,6': 1.5,          // нецелый день
    '7,8': 'x',          // день-строка
    '9,10': -2,          // отрицательный день
  };
  const m = restoreDayMap(saved);
  assert.equal(m.size, 2);
  assert.equal(m.get('1,2'), 4);
  assert.equal(m.get('1,2:heal'), 6);
});

test('dayMap: restoreDayMap на не-объекте → пустой Map', () => {
  for (const bad of [null, undefined, 'junk', ['1,2', 3], 42]) {
    const m = restoreDayMap(bad);
    assert.ok(m instanceof Map, String(bad));
    assert.equal(m.size, 0, String(bad));
  }
});

test('grantBuff: новый массив (вход не мутируется), повтор (source,kind) обновляет день', () => {
  const buffs = [{ source: '1,1', day: 5, kind: 'damage' }];
  const before = JSON.stringify(buffs);
  const out = grantBuff(buffs, '2,2', 6, 'armor');
  assert.equal(JSON.stringify(buffs), before, 'вход не мутирован');
  assert.notEqual(out, buffs, 'возвращается новый массив');
  assert.deepEqual(out, [
    { source: '1,1', day: 5, kind: 'damage' },
    { source: '2,2', day: 6, kind: 'armor' },
  ]);
  const out2 = grantBuff(out, '2,2', 7, 'armor');
  assert.deepEqual(out2, [
    { source: '1,1', day: 5, kind: 'damage' },
    { source: '2,2', day: 7, kind: 'armor' },
  ], 'повторная выдача тому же (source, kind) — день обновлён, дублей нет');
  const out3 = grantBuff(out2, '3,3', 7, 'damage');
  assert.equal(out3.length, 3, 'разные источники/kind сосуществуют');
});

test('activeBuffs: активен в тот же день (day ===), истёк при day <, новый массив', () => {
  const buffs = [
    { source: '1,1', day: 6, kind: 'damage' },
    { source: '2,2', day: 7, kind: 'armor' },
  ];
  assert.deepEqual(activeBuffs(buffs, 7),
    [{ source: '2,2', day: 7, kind: 'armor' }], '6 < 7 — истёк, 7 === 7 — активен');
  assert.equal(activeBuffs(buffs, 6).length, 2, 'в день выдачи — оба активны');
  assert.deepEqual(activeBuffs(buffs, 8), [], 'на следующий день — всё истекло');
  assert.deepEqual(activeBuffs([], 5), []);
  const out = activeBuffs(buffs, 7);
  assert.notEqual(out, buffs, 'новый массив (чисто)');
});

test('buffMods: солнце — damageMult 1.05, гора — armor +1; фиксация на вид; истечение', () => {
  assert.deepEqual(buffMods([], 5), { damageMult: 1, armor: 0 });
  assert.deepEqual(buffMods([{ source: '1,1', day: 5, kind: 'damage' }], 5),
    { damageMult: 1.05, armor: 0 }, 'активный «солнце»');
  assert.deepEqual(buffMods([{ source: '2,2', day: 5, kind: 'armor' }], 5),
    { damageMult: 1, armor: 1 }, 'активный «гора» (+1 броня)');
  assert.deepEqual(buffMods([{ source: '1,1', day: 5, kind: 'damage' }], 6),
    { damageMult: 1, armor: 0 }, 'истёк после смены дня');
  assert.deepEqual(buffMods([{ source: '1,1', day: 5, kind: 'speed' }], 5),
    { damageMult: 1, armor: 0 }, 'неизвестный kind игнорируется');
  // Два источника одного вида — множитель фиксирован на ВИД
  // (два храма солнца → 1.05, а НЕ 1.05×1.05; две горы → +1, а не +2).
  assert.deepEqual(buffMods([
    { source: '1,1', day: 5, kind: 'damage' },
    { source: '2,2', day: 5, kind: 'damage' },
  ], 5), { damageMult: 1.05, armor: 0 });
  // Оба вида одновременно.
  assert.deepEqual(buffMods([
    { source: '1,1', day: 5, kind: 'damage' },
    { source: '2,2', day: 5, kind: 'armor' },
  ], 5), { damageMult: 1.05, armor: 1 });
});

test('restoreBuffs: валидные сохраняются; будущее/истёкшее и мусор отбрасываются', () => {
  const saved = [
    { source: '1,1', day: 7, kind: 'damage' },  // сохранить: день === текущий
    { source: '2,2', day: 9, kind: 'armor' },   // отброс: «будущее» (подделка)
    { source: '3,3', day: 5, kind: 'damage' },  // отброс: уже истёк (fastForward
    //                                               без слушателей — очистка
    //                                               в onDay НЕ пройдёт)
    { source: 'abc', day: 7, kind: 'damage' },  // отброс: не координаты
    { source: '4,4', day: 7.5, kind: 'armor' }, // отброс: нецелый день
    { source: '5,5', day: 7, kind: 'speed' },   // отброс: kind вне whitelist
    { source: '6,6', day: 0, kind: 'armor' },   // отброс: день < 1
  ];
  assert.deepEqual(restoreBuffs(saved, 7),
    [{ source: '1,1', day: 7, kind: 'damage' }]);
  // Не-массив / мусор — [].
  for (const bad of [null, undefined, 'junk', { a: 1 }, 42]) {
    assert.deepEqual(restoreBuffs(bad, 7), [], String(bad));
  }
  assert.deepEqual(restoreBuffs(['junk', 42, null], 7), [], 'мусорные элементы');
});

test('serializeBuffs: массив копий {source, day, kind}; не-массив → []', () => {
  const buffs = [{ source: '1,1', day: 7, kind: 'damage' }];
  const out = serializeBuffs(buffs);
  assert.deepEqual(out, buffs);
  assert.notEqual(out, buffs, 'новый массив');
  assert.notEqual(out[0], buffs[0], 'элементы — копии (вход не сливается с сейвом)');
  assert.deepEqual(serializeBuffs(null), []);
  assert.deepEqual(serializeBuffs('junk'), []);
  assert.deepEqual(serializeBuffs({ a: 1 }), []);
});

test('«раз в день» через состояние: значение раздела → canUseToday, rest() снимает лимит', () => {
  // Раздел восстановлен из сейва: эффект использован на 5-й день.
  const m = restoreDayMap({ '1,1:heal': 5 });
  const c = createClock({ stepsPerDay: 40 });
  c.fastForward(4); // день 5, без слушателей (как при восстановлении)
  assert.equal(c.day, 5);
  assert.equal(canUseToday(m.get('1,1:heal'), c.day), false,
    'использовано на день 5 — в тот же день недоступно');
  c.rest(); // день 6 («сброс» ничего не сбрасывает — проверка canUseToday)
  assert.equal(c.day, 6);
  assert.equal(canUseToday(m.get('1,1:heal'), c.day), true,
    'на следующий день — доступно снова');
});

test('фонтан: счётчики эффектов независимы (исцеление лимит, монета — нет)', () => {
  // Ключ — по ЭФФЕКТУ: у '5,5:heal' счётчик есть, у '5,5:coin' нет
  // (флага раз_в_день в каталоге у монеты нет).
  const m = restoreDayMap({ '5,5:heal': 3 });
  assert.equal(canUseToday(m.get('5,5:heal'), 3), false,
    'исцеление использовано сегодня — недоступно');
  assert.equal(canUseToday(m.get('5,5:coin'), 3), true,
    'монета в тот же день — доступна (счётчик не ведётся)');
});

// --- Задача 000122: видимость стационарной группы на глобальной карте ---
// Поверженная группа (запись 'x,y' → день поражения в Map `defeatedAt`
// main.js) скрыта до дня респауна: drawSprites, проход 3, спрашивает
// G.groupVisible(defeatedAt, x, y) ДО drawImage спрайта группы. В день
// респауна onDay удаляет запись (dueForRespawn) — спрайт возвращается
// ровно тогда же, без доп. состояния. Формат ключа — ТОЧНО как в
// main.js (maybeStartCombat/победа): `x + ',' + y` — целые, БЕЗ
// пробелов, отрицательные возможны (мир бесконечный). Чистая функция
// живёт рядом с dueForRespawn/serializeDefeatedAt (состояние — в
// main.js; map.js детерминирован и о нём не знает — фильтрация только
// в слое отрисовки).

test('groupVisible: живая группа — true (записи нет)', () => {
  assert.equal(groupVisible(new Map(), 1, 1), true, 'пустой Map — видима');
  const m = new Map([['5,5', 3]]);
  assert.equal(groupVisible(m, 1, 1), true, 'чужая запись не скрывает чужой тайл');
});

test('groupVisible: после поражения — false; другие записи не влияют', () => {
  const m = new Map([['1,1', 3], ['9,9', 3]]);
  assert.equal(groupVisible(m, 1, 1), false, 'запись есть — скрыта');
  assert.equal(groupVisible(m, 9, 9), false, 'обе записи независимы');
  assert.equal(groupVisible(m, 2, 2), true, 'соседний тайл — виден');
});

test('groupVisible: день респауна — true после удаления записи (dueForRespawn + delete в onDay)', () => {
  // Поражение на 1-й день; respawn_days = 3 → запись гниёт на 4-й день.
  const m = new Map([['1,1', 1]]);
  assert.equal(groupVisible(m, 1, 1), false);
  assert.deepEqual(dueForRespawn(m, 3), [], 'день 3: ещё рано');
  assert.deepEqual(dueForRespawn(m, 4), ['1,1'], 'день 4: пора — onDay удалит');
  for (const k of dueForRespawn(m, 4)) m.delete(k); // действие onDay (main.js)
  assert.equal(groupVisible(m, 1, 1), true,
    'спрайт возвращается ровно в день респауна, без доп. состояния');
});

test('groupVisible: принимает объект сейва (восстановленный/сырой), не только Map', () => {
  // ТЗ: «принимает и Map, и восстановленный объект». restoreDefeatedAt
  // отдаёт Map, но сырой объект data.defeatedAt из сейва (до/вместо
  // restore) обязан работать так же.
  assert.equal(groupVisible({ '1,1': 3 }, 1, 1), false);
  assert.equal(groupVisible({ '1,1': 3 }, 5, 5), true);
  // Без прототипа — не падает и не наследует ключи (hasOwnProperty, не `in`).
  assert.equal(groupVisible(Object.create(null), 1, 1), true,
    'объект без прототипа — нет crash, не лжет о записи');
});

test('groupVisible: отрицательные координаты — тот же формат ключа, что и в main.js', () => {
  // `x + ',' + y` без пробелов: другой разделитель/пробел = тихий
  // fail-open — спрайт виден вечно, а тесты «внутри функции» прошли бы.
  const m = new Map([['-1,-2', 4]]);
  assert.equal(groupVisible(m, -1, -2), false, 'ключ \'-1,-2\' найден');
  assert.equal(groupVisible(m, -1, -1), true, 'сосед — не затронут');
  assert.equal(groupVisible(m, 1, -2), true, 'перестановка знаков — другой тайл');
  assert.equal(groupVisible({ '-1,-2': 4 }, -1, -2), false, 'тот же формат в объекте');
});

test('groupVisible: мусор — fail-open (true, без исключений); вход не мутирует', () => {
  // Принцип 000029: битое состояние не роняет игру — спрайт рисуется
  // (старое поведение), а не TypeError в rAF-цикле.
  for (const bad of [null, undefined, 'junk', 42, [['1,1', 3]], ['1,1'], true]) {
    assert.equal(groupVisible(bad, 1, 1), true, 'мусор: ' + JSON.stringify(bad));
  }
  const m = new Map([['1,1', 3]]);
  const before = JSON.stringify([...m]);
  assert.equal(groupVisible(m, 1, 1), false);
  assert.equal(JSON.stringify([...m]), before, 'Map на входе не мутирован');
  const obj = { '1,1': 3 };
  groupVisible(obj, 1, 1);
  assert.deepEqual(obj, { '1,1': 3 }, 'объект на входе не мутирован');
});

// --- main.js (клей) — структурный фиксатор (не тестируется в node) ---
// Поведенческий тест — в tests/main-visuals.test.js (vm-песочница,
// переопределение G.groupVisible); здесь — фиксатор МЕСТА вызова:
// проверка должна жить в проходе 3 drawSprites (спрайты групп), а не
// в buildFrame/проходе 1 — иначе «скрытие» приземлится не туда.

test('main.js: проход 3 спрашивает видимости группы до drawImage (структурный)', () => {
  // Окно: от комментария «Проход 3» до комментария «Флогистон:
  // idle/walk» — ТОЛЬКО проход 3. Точную форму вызова (гард, пробелы)
  // не пилим; несущее: имя G.groupVisible, вызов, первым аргументом —
  // defeatedAt (модульное состояние main.js, удаляемое в onDay).
  const text = fs.readFileSync(__dirname + '/../src/main.js', 'utf8');
  const i3 = text.indexOf('// Проход 3');
  assert.ok(i3 >= 0, 'комментарий прохода 3 на месте');
  const iPh = text.indexOf('// Флогистон: idle/walk', i3);
  assert.ok(iPh > i3, 'окно: проход 3 оканчивается до блока Флогистона');
  const pass3 = text.slice(i3, iPh);
  assert.ok(/G\.groupVisible\s*\(\s*defeatedAt\s*,/.test(pass3),
    'проход 3 вызывает G.groupVisible(defeatedAt, …) перед спрайтом группы');
});

test('браузер: day.js отдаёт groupVisible (vm-песочница)', () => {
  // Порядок как в index.html: global-settings.js ДО day.js.
  const sandbox = {};
  for (const f of ['global-settings.js', 'day.js']) {
    vm.runInNewContext(
      fs.readFileSync(__dirname + '/../src/' + f, 'utf8'), sandbox);
  }
  assert.equal(typeof sandbox.Game.groupVisible, 'function',
    'groupVisible в browser-режиме (root.Game)');
});
