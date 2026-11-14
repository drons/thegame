// Задача 000320.27: «Чемпион арены» — id arena_champion, имя «Кремень»
// (Арена, 3-й NPC постройки; 27-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/pending/000320.27.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md; профиль-эталон КВЕСТЫ+ПОДСКАЗКА —
// .03 «Скарн» (000021)/.23 «Сарбон» (000044); блокировка вилки (а) —
// memory/000320-arena_champion.md):
//   * assets/npc/000048.json — id arena_champion (свип по 47 занятым —
//     свободен), имя «Кремень» (выбор агента: пояс чемпиона, который
//     «не отдавали семь сезонов»; конвенция батча — прозвище, не
//     роль-слово), роль «чемпион арены» (фикс ТЗ — точным равенством;
//     свипов уникальности ролей нет), постройка
//     assets/buildings/arena.json (ТЗ-путь 000007.json мёртв с
//     000318.06 — zero-sweep tests/buildings-rename-000318.06.test.js
//     T5; путь — SLUG), 3-й NPC дома: Карк ПЕРВЫЙ, npcForBuilding(7)
//     продолжает возвращать Карка; хук истории «Действующий чемпион;
//     титул защищает на арене» — последнее предложение описания
//     (конвенция .22–.26: endsWith от ПОЛНОЙ строки хука с точкой;
//     ТЗ-опечатка «ДействУующий» в хук не переносится);
//   * профиль диалога — КВЕСТЫ + ПОДСКАЗКА (форма эталона .03/.23):
//     РОВНО 3 опции prives/«подсказка» → quests/«квесты» → hint_title/
//     «подсказка», РОВНО одна (последняя) с {харизма:3}; блоков
//     торговля/найм НЕТ → торговля 234 / R7=20 НЕ растут;
//   * ВИЛКА (а) — placement Арена + ДАННЫЕ обучения без диалоговой
//     опции «обучение»: блок обучение {навыки [swordsman, heavy] ≡
//     тренирует Арены — контракт 000211.07 tests/npc-data.test.js
//     «школы» для КАЖДОГО NPC категории школа_навыков с тренирует
//     требует равенства множеств, quest-only NPC без блока его ЛОМАЛ
//     БЫ; цены 25/40 — шкала боевых школ Карк/Родар/Глыба/Тигель/
//     Пробник/Насечка}. Блок ИНЕРТЕН: train-вкладка UI открывается
//     только опцией диалога с действием «обучение» (src/ui.js), которой
//     здесь нет (пин T5: действия РОВНО подсказка/квесты/подсказка);
//     кузнечное наставничество (heavy ∈ SKILL_CRAFT_TYPE →
//     «кузнечное_дело») отсекается постройкой: typeBuildings(кузнечное)=
//     [8, 25] ∌ 7 → canMentorCraft даёт reason «нет постройки этого
//     вида» (пин T6; прецедент Карка 000005 — тот же блок на той же
//     Арене живёт в каталоге с .0-эпохи). Зуб вилки: удаление блока
//     красит чужой «школы» + свои T2/T6 (мутация M1);
//   * квесты — 2, формат schema: champion_proof (bring_item hide x2 →
//     50/40 + healing_potion x2) → champion_pack (kill_group группа 3
//     WOLF_PACK x1 → 100/80 + mana_elixir x1, цепочка «предыдущий» по
//     прецеденту .23: bring → kill); группа 3 свободна у квестов
//     (использованы 1,6,1,2); награды по шкале диска (40/50…120/100);
//     npc-refs: goal 3→4, reward 7→9, сумма 244→247, уникальные
//     предметы 202 НЕ растёт (hide/healing_potion/mana_elixir уже в
//     множестве), постройки 49→50 при уникальных 17 (Арена уже
//     референсирована Карком и Насечкой — антон F2-случая .26);
//   * опций с «для» — РОВНО 0: контракт A8a (tests/npc-dialog-scope);
//   * тема диалога — титул/круг/вызов; запрет-лист ТЕКСТОВ диалога
//     95 = дисковый список .26 T5 ЦЕЛИКОМ (91) + 4 зарезервированных
//     оборота Костяшки (memory/000320-fist_instructor.md для .27+:
//     «кулак не прощает суеты», «бьёт не рука, а весь человек»,
//     «сначала держи, потом давай», «двор помнит каждого, кто встал в
//     круг»); СВОИ 4 оборота зарезервированы для .28 —
//     memory/000320-arena_champion.md; токен «арен» в списке с .04 и
//     действует на ДИАЛОГ — «на арене» живёт только в описании (T5
//     сканирует тексты диалога);
//   * [E]-оверлей Арены — ТРИ dialog-строки в порядке каталога:
//     'dialog' (Карк) → 'dialog:sword_instructor' (Насечка) →
//     'dialog:arena_champion' (Кремень); хоткеи Digit1..3 — общий
//     механизм src/building-ui.js /^Digit([1-9])$/; пин создан в .05
//     (ОДНА), поднят .25 (ДВЕ) и здесь (ТРЁХ) — ре-пинуты T7 (.25/.26).
//
// ЗУБ forbid-цепи 000372: T9 против .26 (own 95 / prev 91 / дельта ≡
// MINE-константа файла .26 — 4 Костяшки).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000048.json нет,
// каталог 47, ростер Арены — ДВОЕ, оверлей 2 строки), без краха
// загрузки; T9 зелёный и здесь, и после (цепь читается «назад»).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000048.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const { mobGroupCount } = require('../src/map.js');
const BE = require('../src/building-effects.js');
const C = require('../src/craft.js');

const HOOK = 'Действующий чемпион; титул защищает на арене';
const ID = 'arena_champion';
const NAME = 'Кремень';

const MINE = ['зрители забывают даже имя',
  'проигравших не забывают',
  'вызов принимают, а не ждут',
  'титул тяжелее пояса'];

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 48 файлов 000001..000048 подряд; зеркало NPCS 48 записей с arena_champion', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 48,
    'в каталоге NPC 48 файлов (000320.17: +Переписчик; 000320.18: '
    + '+Странствующий торговец; 000320.19: +Торговец специями; '
    + '000320.20: +Торговец каравана; 000347.02: +жрец солнца, жрица '
    + 'луны, горный жрец; 000320.21: +Проводник; 000320.22: +Перекати; '
    + '000320.23: +Сарбон; 000320.24: +Просол; 000320.25: +Насечка; '
    + '000320.26: +Костяшка; 000320.27: +Кремень), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 48,
    'зеркало src/npc-data.js — 48 записей (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[47];
  assert.ok(last, '48-я запись зеркала существует');
  assert.equal(last.id, ID,
    '48-я запись зеркала — arena_champion (порядок = нумерация файлов)');
  assert.equal(NPCS[46].id, 'fist_instructor',
    'guard: 47-я запись — Костяшка (позиционные NPCS[..] не '
    + 'сдвинуты)');
});

// --- T2: 000048.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000048.json валиден по schema; ключи в порядке гибрида вилки (а) — КВЕСТЫ .23 + обучение после диалога (id, имя, роль, описание, постройки, диалог, квесты, обучение — без торговля/найм); roundtrip-канон; негативы — мимо схемы и мимо порядка ключей', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000048.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000048'), [],
    '000048.json обязан проходить assets/npc/schema.json');
  const KEYS = ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог',
    'квесты', 'обучение'];
  assert.deepEqual(Object.keys(data), KEYS,
    'порядок ключей — квестовый эталон .23 «Сарбон» (…, диалог, квесты) '
    + 'плюс «обучение» последней строкой (вилка (а): данные школы без '
    + 'диалоговой опции — порядок зафиксирован решением анализа, '
    + 'memory/000320-arena_champion.md); блоков торговля/найм нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000048.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badCharisma = JSON.parse(JSON.stringify(data));
  const reqOpt = badCharisma.диалог.find((o) => o.требования);
  assert.ok(reqOpt, 'есть опция с требованиями (харизма-прецедент батча)');
  reqOpt.требования.харизма = 0;
  assert.notDeepEqual(validateData(SCHEMA, badCharisma, 'npc/badcharisma'), [],
    'требование харизма 0 — вне схемы (minimum 1)');
  const badAction = JSON.parse(JSON.stringify(data));
  badAction.диалог[0].действие = 'дар';
  assert.notDeepEqual(validateData(SCHEMA, badAction, 'npc/badaction'), [],
    'действие «дар» — вне enum схемы');
  const badPath = JSON.parse(JSON.stringify(data));
  badPath.постройки = ['000007.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ (numeric-форма) — вне паттерна схемы');
  const numericPath = JSON.parse(JSON.stringify(data));
  numericPath.постройки = ['assets/buildings/' + '000007' + '.json'];
  assert.notDeepEqual(validateData(SCHEMA, numericPath, 'npc/numericpath'), [],
    'numeric-путь постройки — вне паттерна схемы: база содержит 000318.06, '
    + 'здания — slug-именование, numeric-форма мертва (zero-sweep '
    + 'tests/buildings-rename-000318.06.test.js T5); ТЗ-путь '
    + '000007.json устарел — живая ссылка assets/buildings/arena.json');
  const numericItem = JSON.parse(JSON.stringify(data));
  numericItem.квесты[0].цель.предмет = 'assets/items/' + '000014' + '.json';
  assert.notDeepEqual(validateData(SCHEMA, numericItem, 'npc/numericitem'), [],
    'numeric-путь предмета квеста — вне паттерна схемы (база содержит '
    + '000318.08: items — slug-именование, «урок .07»); перевёрнутый '
    + 'негатив: numeric-фикстура краснела бы НЕ по проверяемой причине, '
    + 'если бы паттерн схемы ослабли');
  const badGroup = JSON.parse(JSON.stringify(data));
  badGroup.квесты[1].цель.группа = 9;
  assert.notDeepEqual(validateData(SCHEMA, badGroup, 'npc/badgroup'), [],
    'группа 9 — вне 0..6 MOB_GROUP_TYPES (схема квеста)');
  const badPrice = JSON.parse(JSON.stringify(data));
  badPrice.обучение.цена_за_уровень = 0;
  assert.notDeepEqual(validateData(SCHEMA, badPrice, 'npc/badprice'), [],
    'цена_за_уровень 0 — вне схемы (minimum 1, максимум 10000)');
  const badSkill = JSON.parse(JSON.stringify(data));
  badSkill.обучение.навыки = ['Кулак'];
  assert.notDeepEqual(validateData(SCHEMA, badSkill, 'npc/badskill'), [],
    'навык «Кулак» — вне паттерна id ^[a-z][a-z0-9_]*$');
  const withTrade = JSON.parse(JSON.stringify(data));
  withTrade.торговля = { предметы: [{ предмет: 'assets/items/hide.json',
    mult_продажи: 0.5, количество: 1 }] };
  assert.notDeepEqual(Object.keys(withTrade), KEYS,
    'лишний блок «торговля» — вне эталона ключей: схема блок допускает '
    + '(невидимость свипам пинит не схема, а T2/T6), профиль квесты '
    + 'держится СЛОВОМ, не витриной');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id arena_champion и имя «Кремень» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000048.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id arena_champion в каталоге');
  assert.ok(names.has(NAME), 'имя «Кремень» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «чемпион арены» (точная строка ТЗ; свипов уникальности ролей нет — роль-слово ТЗ именем не стало, правило ландромина .22: имя «Кремень»; у Карка 000005 роль ДРУГАЯ строка — «мастер арены» в каталоге не встречается как роль); описание непустое, хук «Действующий чемпион; титул защищает на арене» — последнее предложение, и НЕ копия описания другого NPC (Скарн 000021 лишь УПОМИНАЕТ чемпиона в своём тексте — описания не равны)', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000048.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'чемпион арены',
    'роль — фикс-строка «чемпион арены» (ТЗ); Т4 пишет точное равенство '
    + '(свипов уникальности ролей нет; «наставник-боец» Костяшки .26 и '
    + '«наставник-мечник» Насечки .25 — ДРУГИЕ роль-строки)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ, ТЗ-опечатка «ДействУующий» не '
    + 'переносится — memory/000320-arena_champion.md) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на '
    + 'конце — прецеденты .02–.26; endsWith идёт от ПОЛНОЙ строки '
    + 'хука, конвенция .22–.26); факт: '
    + JSON.stringify(data.описание.slice(-80)));
  for (const f of listNpcFiles()) {
    if (f === '000048.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль квесты, без «для», запрет-лист 95 -----------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .03/.23 (prives/подсказка, quests/квесты, hint_title/подсказка), ровно одна «квесты», РОВНО одна с {харизма:3} на последней, id опций уникальны, опций с «для» — ровно 0, ДЕЙСТВИЙ «обучение» — ровно 0 (вилка (а): данные школы без train-опции), запрет-лист 95 подстрок (дисковый список .26 ЦЕЛИКОМ = 91 + 4 оборота Костяшки) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000048.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / quests / hint_title — форма '
    + 'эталона квесты+подсказка .03 «Скарн» / .23 «Сарбон»), факт: '
    + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.deepEqual(data.диалог.map((o) => o.id),
    ['prives', 'quests', 'hint_title'],
    'id опций — причесон квестового профиля .03/.23: prives первым, '
    + 'quests второй, подсказка-хит последней');
  assert.deepEqual(data.диалог.map((o) => o.действие),
    ['подсказка', 'квесты', 'подсказка'],
    'РОВНО одна опция «квесты» — профиль квесты+подсказка; опции '
    + '«обучение» НЕТ: train-вкладка UI открывается только действием '
    + '«обучение» (src/ui.js), её отсутствие и есть инертность блока '
    + 'обучения в вилке (а)');
  assert.equal(data.диалог.filter((o) => o.действие !== 'подсказка'
    && o.действие !== 'квесты').length, 0,
    'профиль квесты+подсказка (клон .03/.23): опций с действием вне '
    + '{подсказка, квесты} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: чемпион говорит со всеми; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_road .23 и '
    + 'всей цепи .17–.26)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  assert.equal(data.диалог.indexOf(withReq[0]), 2,
    'опция с требованием — ПОСЛЕДНЯЯ (эталон .03/.23: hint_* последней)');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of [
    'хвостовик', 'наковальн', 'штампов', 'коллекци',
    'позолот', 'старые походы', 'арен', 'жалован',
    'знамен', 'задаток', 'табель', 'метл',
    'стена клинков', 'звон', 'дребезг', 'нагрудник',
    'закалк', 'трещин', 'молотк', 'примеря',
    'старые дела', 'храме солнца', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон', 'завянет',
    'пучками', 'почерневш', 'разотрёшь', 'где болит',
    'выше раны', 'доживают до старости', 'не бывает лишнего', 'с далёких гор',
    'договоримся о цене', 'между строк', 'при дневном свете', 'чернила помнят',
    'прощает торопливому', 'из-под пальцев', 'выберем тебе школу', 'описк',
    'чистовик', 'по концу листа', 'копию без торгу', 'вкривь',
    'кормит', 'от кузницы до кузницы', 'не пожалеешь', 'пока повозка полная',
    'на дневку', 'сколько сгрузил', 'ближе к холке', 'сырьё кончается',
    'спрашивай про руду', 'то в моих вьюках', 'ищи меня', 'до площади раньше колокола',
    'понюхай сначала', 'каменная соль', 'в самом конце', 'три металла на прилавке',
    'три монеты в коше', 'два языка служат', 'монету берут на глаз', 'вода по колено',
    'кривой указатель', 'указатель врёт', 'дорога — мой хлеб', 'с солнечной полки',
    'у этой залы слух длинный', 'гора лишних слов не держит', 'про спуск', 'мой дом там, где ночевал',
    'вьюки легче всякого сундука', 'базара без дорог не бывает', 'новости ногами приходят', 'обоз — это стена, которая ходит',
    'груз считается привезённым, только когда он на площади', 'дорогу берегут до разбоя, а не после', 'караван держат не узлы, а порядок', 'товар помнит того, кто его привёз',
    'полог не прячет брака', 'старые весы не льстят', 'у старого угла всегда длиннее очередь', 'рука помнит дольше головы',
    'сильный удар не бывает первым', 'пот на лбу дешевле крови на песке', 'урока без пота не бывает', 'кулак не прощает суеты',
    'бьёт не рука, а весь человек', 'сначала держи, потом давай', 'двор помнит каждого, кто встал в круг']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»; токен «арен» в списке с '
      + '.04 действует на ДИАЛОГ — наш титул живёт в описании '
      + '(«…защищает на арене»), а разговор — про круг/вызов/пояс; '
      + '.05 коллекция, .06 ковка/хвостовик, .07 наём/жалованье, '
      + '.08 метла/стена клинков, .09 броня-звонок, .10 големы; '
      + 'тексты Милы, Отвара, Травницы, Жгута, Зиры, Пергамента, '
      + 'Пробника, Грифеля, Хольда, Хомута, Шафрана, Барыша, '
      + 'Проводника, жрецов 000347.02, Перекати, Сарбона, Просола, '
      + 'Насечки и Костяшки — дисковый список .26 ЦЕЛИКОМ, формула '
      + 'наследования memory/000372-forbidden-chain-teeth.md) не '
      + 'дублируется: подстрока «' + w + '»');
  }
  for (const w of MINE) {
    assert.ok(texts.includes(w),
      'СВОЙ оборот «' + w + '» живёт в текстах 000048.json — резерв '
      + '.28+ по memory/000320-arena_champion.md (формула наследования: '
      + 'список .28 = дисковый .27 ЦЕЛИКОМ + эти 4)');
  }
});

// --- T6: квесты валидны по диску + обучение ИНЕРТНО (вилка (а) -------------

test('T6: профиль квесты (1–2: id/цель/награды валидны по диску — группа ∈ 0..mobGroupCount−1, предметы существуют, награды ненулевые, цепочка «предыдущий», id квестов уникальны в каталоге) + ДАННЫЕ обучения вилки (а): блок {навыки ≡ тренирует Арены [swordsman, heavy] (зуб контракта 000211.07 «школы»), цена 25/40} при отсутствии диалоговой опции «обучение» и отказе canMentorCraft(кузнечное) «нет постройки этого вида» (тип ∌ Арена 7); блоков торговля/найм НЕТ; постройки [assets/buildings/arena.json]; зеркало NPCS[47]: постройки [7], диалог/описание/обучение deepEqual, квесты deepEqual с резолвом items→id', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000048.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['торговля', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль квесты+подсказка — '
      + 'счётчики npc-refs торговля 234 и R7 торгующих 20 '
      + '(tests/item-prices-000322) не растут');
  }
  assert.ok(!JSON.stringify(data).includes('"торговля"'),
    'ни блока, ни действия «торговля» в JSON нет (свипы '
    + 'item-prices-000322 пропускают неторговцев: Кремень невидим)');
  assert.ok(Array.isArray(data.квесты)
    && data.квесты.length >= 1 && data.квесты.length <= 2,
    'квесты — 1–2 по ТЗ; факт: '
    + (Array.isArray(data.квесты) ? data.квесты.length : typeof data.квесты));
  const qids = data.квесты.map((q) => q.id);
  assert.equal(new Set(qids).size, qids.length,
    'id квестов уникальны внутри NPC');
  const seenQ = new Map();
  for (const f of listNpcFiles()) {
    for (const q of (readJson(path.join(NDIR, f)).квесты || [])) {
      assert.ok(!seenQ.has(q.id),
        'id квеста «' + q.id + '» уже занят в ' + seenQ.get(q.id));
      seenQ.set(q.id, f);
    }
  }
  assert.deepEqual([seenQ.get('champion_proof'), seenQ.get('champion_pack')],
    ['000048.json', '000048.json'],
    'наши квесты champion_proof/champion_pack сидят ровно по одному '
    + 'разу в 000048.json');
  const mobGroups = fs.readdirSync(path.join(ROOT, 'assets', 'mob_groups'))
    .filter((f) => f.endsWith('.json') && f !== 'schema.json');
  assert.equal(mobGroupCount(), mobGroups.length,
    'mobGroupCount() = каталог assets/mob_groups (source of truth 000057): '
    + mobGroupCount() + ' vs файлов ' + mobGroups.length);
  for (const q of data.квесты) {
    assert.match(q.id, /^[a-z][a-z0-9_]*$/,
      'id квеста «' + q.id + '» вне паттерна схемы');
    const goal = q.цель;
    if (goal.тип === 'kill_group') {
      assert.ok(Number.isInteger(goal.группа) && goal.группа >= 0
        && goal.группа < mobGroupCount(),
        'квест ' + q.id + ': группа ' + goal.группа + ' вне 0..'
        + (mobGroupCount() - 1) + ' (MOB_GROUP_TYPES src/map.js)');
      assert.equal(goal.группа, 3,
        'квест ' + q.id + ': группа РОВНО 3 (WOLF_PACK — стая у стен; '
        + 'группы 1,6,1,2 уже заняты квестами каталога, 0/4/5 — резерв '
        + 'следующих волн, решение анализа)');
    } else {
      assert.equal(goal.тип, 'bring_item',
        'квест ' + q.id + ': тип цели «' + goal.тип + '» вне {kill_group, bring_item}');
      assert.match(goal.предмет, /^assets\/items\/[a-z][a-z0-9_]*\.json$/,
        'квест ' + q.id + ': предмет цели «' + goal.предмет + '» вне пути');
      assert.ok(fs.existsSync(path.join(ROOT, goal.предмет)),
        'квест ' + q.id + ': предмет цели ' + goal.предмет + ' нет на диске');
      assert.equal(goal.предмет, 'assets/items/hide.json',
        'квест ' + q.id + ': цель bring_item — шкуры (hide; тема '
        + 'пояса/трофеев; путь SLUG — база 000318.08)');
    }
    assert.ok(goal.количество >= 1 && goal.количество <= 99,
      'квест ' + q.id + ': количество цели вне 1..99');
    assert.ok(q.награда.опыт > 0 && q.награда.золото > 0,
      'квест ' + q.id + ': награда ненулевая (опыт/золото > 0 — масштаб '
      + 'диска: существующие квесты дают 40/50…120/100); факт: '
      + q.награда.опыт + '/' + q.награда.золото);
    for (const r of (q.награда.предметы || [])) {
      assert.match(r.предмет, /^assets\/items\/[a-z][a-z0-9_]*\.json$/,
        'квест ' + q.id + ': предмет награды «' + r.предмет + '» вне пути');
      assert.ok(fs.existsSync(path.join(ROOT, r.предмет)),
        'квест ' + q.id + ': предмет награды ' + r.предмет + ' нет на диске');
    }
    assert.ok(q.предыдущий === null || q.предыдущий === undefined
      || qids.includes(q.предыдущий),
      'квест ' + q.id + ': предыдущий «' + q.предыдущий + '» не у этого NPC');
  }
  assert.equal(data.квесты[0].награда.опыт, 50,
    'champion_proof — 50 опыта (приносная цепочка дешевле боевой — '
    + 'прецедент .23: 50/40 → 60/50; у дуэлянтов Скарна 50/40 → 100/80)');
  assert.equal(data.квесты[1].награда.опыт, 100,
    'champion_pack — 100 опыта (боевая вершина пары, шкала Скарна 100/80)');
  assert.ok('обучение' in data,
    'в JSON есть блок «обучение» — вилка (а): Арена категория '
    + 'школа_навыков, контракт «школы» требует равенства без '
    + 'диалоговой опции');
  assert.deepEqual(Object.keys(data.обучение),
    ['навыки', 'цена_за_уровень', 'цена_переноса_за_уровень'],
    'ключи блока — формат эталона 000005.json');
  assert.equal(data.обучение.цена_за_уровень, 25,
    'цена_за_уровень 25 — шкала боевых школ каталога (Карк/Родар/'
    + 'Глыба/Тигель/Пробник/Насечка — 25/40; runtime их не читает: цена = '
    + 'schoolTrainPrice 20+10·L², src/npc.js)');
  assert.equal(data.обучение.цена_переноса_за_уровень, 40,
    'цена_переноса_за_уровень 40 — та же шкала');
  const arena = readJson(path.join(ROOT, 'assets', 'buildings', 'arena.json'));
  assert.equal(arena.id, 7, 'здание arena — id 7 (фикс размещения ТЗ)');
  assert.equal(arena.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  const trains = arena.особые_параметры.тренирует;
  assert.deepEqual(trains, ['assets/skills/000007.json',
    'assets/skills/000008.json'],
    'тренирует Арены по диску базы — swordsman (000007) + heavy (000008)');
  const trainIds = trains.map((v) => {
    assert.ok(fs.existsSync(path.join(ROOT, v)),
      'ссылка тренирует «' + v + '» существует');
    return readJson(path.join(ROOT, v)).id;
  });
  assert.deepEqual([...trainIds].sort(), [...data.обучение.навыки].sort(),
    'id целей тренирует ≡ навыки обучения (зуб контракта 000211.07 '
    + 'tests/npc-data.test.js «школы»; удаление/подмена блока красит '
    + 'чужой «школы» + этот T2/T6 — мутация M1)');
  assert.deepEqual([...data.обучение.навыки].sort(), ['heavy', 'swordsman'],
    'навыки — РОВНО [swordsman, heavy] (≡ тренирует Арены; ТЗ-профиль '
    + '«квесты» сохранён: опции «обучение» в диалоге нет — пин T5)');
  assert.equal(data.диалог.filter((o) => o.действие === 'обучение').length, 0,
    'ДЕЯСТВИЙ «обучение» в диалоге ровно 0 — train-вкладка UI не '
    + 'открывается (src/ui.js входит в неё только по этому действию); '
    + 'инертность данных обучения, часть 1');
  assert.equal(C.SKILL_CRAFT_TYPE.heavy, 'кузнечное_дело',
    'heavy маппится в кузнечное дело (src/craft.js) — риск synthesis '
    + 'наставничества проверяется ниже постройкой');
  assert.ok(!C.typeBuildings('кузнечное_дело').includes(7),
    'кузнечное_дело не имеет Арены среди зданий рецептов '
    + '(typeBuildings=' + JSON.stringify(C.typeBuildings('кузнечное_дело'))
    + ') — инертность данных обучения, часть 2 (прецедент Карка 000005 '
    + 'с тем же блоком на той же Арене)');
  assert.deepEqual(C.canMentorCraft(NPCS[47], { alive: true },
    'кузнечное_дело'),
    { ok: false, reason: 'нет постройки этого вида' },
    'canMentorCraft(Кремень, …, кузнечное) отказывает по постройке '
    + '(не по навыку: heavy ∈ npcCraftTypes, но дом 7 ∉ [8, 25])');
  assert.deepEqual(C.canMentorCraft(NPCS[47], { alive: true }, 'алхимия'),
    { ok: false, reason: 'не обучает этот вид крафта' },
    'алхимия/столярное недоступны вдвойне (навыков нет в блоке)');
  assert.deepEqual(data.постройки, ['assets/buildings/arena.json'],
    'постройка — Арена (фикс ТЗ; путь — SLUG: база содержит 000318.06, '
    + 'numeric-путь зданий больше НЕ ref; уникальные постройки npc-refs '
    + '17 НЕ растут — Арена уже в множестве у Карка и Насечки, total '
    + '49→50)');
  const mirror = NPCS[47];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 48-я запись arena_champion');
  assert.equal(mirror.роль, 'чемпион арены',
    'роль в зеркале — «чемпион арены» (фикс ТЗ)');
  for (const block of ['торговля', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.deepEqual(mirror.постройки, [7],
    'зеркало: постройки [7] — sync резолвит ссылку Арены в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[47].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[47].описание ≡ JSON');
  assert.deepEqual(mirror.обучение, data.обучение,
    'зеркало NPCS[47].обучение ≡ JSON (резолвинга нет — навыки живут '
    + 'строками id, прецедент .26 T6)');
  const expected = JSON.parse(JSON.stringify(data.квесты));
  for (const q of expected) {
    if (q.цель.тип === 'bring_item') {
      q.цель.предмет = readJson(path.join(ROOT, q.цель.предмет)).id;
    }
    for (const r of (q.награда.предметы || [])) {
      r.предмет = readJson(path.join(ROOT, r.предмет)).id;
    }
  }
  assert.deepEqual(mirror.квесты, expected,
    'зеркало NPCS[47].квесты ≡ JSON с резолвом путей предметов в id '
    + '(sync-npc-data.js; прецедент .23 T6 duelist_trial→iron_sword)');
});

// --- T7: ростер Арены — ТРОЕ, Карк первый; двор 9 и дом 5 не тронуты --------

test('T7: npcsForBuilding(NPCS, 7) — ТРОЕ Арены в порядке каталога [arena_master, sword_instructor, arena_champion]; npcForBuilding(7) — по-прежнему Карк; Гладиаторский двор (9) — ОДИН не тронут (.26); дом 5 Лавки странника — ВОСЕМЬ не тронут; Магазин магии — ЧЕТЫРЕ, Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 7);
  assert.deepEqual(list.map((n) => n.id),
    ['arena_master', 'sword_instructor', ID],
    'Арена (7): Карк (000005) + Насечка (000046) + чемпион Кремень '
    + '(000048), порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 7).id, 'arena_master',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Карк; HUD/«Здесь:» '
    + 'не тронуты — города и cities-снапы не двигаются)');
  const yard = N.npcsForBuilding(NPCS, 9);
  assert.deepEqual(yard.map((n) => n.id), ['fist_instructor'],
    'Гладиаторский двор (9) — ОДИН не тронут (.26-ростер Костяшки; '
    + '.27 поселилась на Арену): '
    + JSON.stringify(yard.map((n) => n.id)));
  const lavka = N.npcsForBuilding(NPCS, 5);
  assert.deepEqual(lavka.map((n) => n.id),
    ['wanderer_merchant', 'wanderer_trader', 'spice_trader',
      'caravan_trader', 'path_guide', 'tumbleweed', 'caravan_leader',
      'old_trader'],
    'Лавка странника (5) — ВОСЕМЬ не тронуты (.27 — НЕ дом 5): '
    + JSON.stringify(lavka.map((n) => n.id)));
  const magic = N.npcsForBuilding(NPCS, 4);
  assert.deepEqual(magic.map((n) => n.id),
    ['magic_merchant', 'scroll_merchant', 'magic_instructor', 'scribe'],
    'Магазин магии (4) — ЧЕТЫРЕ NPC не тронуты: '
    + JSON.stringify(magic.map((n) => n.id)));
  const apteka = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(apteka.map((n) => n.id),
    ['apothecary', 'brewer', 'herbalist', 'alchemy_instructor',
      'village_doctor'],
    'Аптекарь (3) — ПЯТЬ NPC не тронуты: '
    + JSON.stringify(apteka.map((n) => n.id)));
  const brunnik = N.npcsForBuilding(NPCS, 2);
  assert.deepEqual(brunnik.map((n) => n.id),
    ['armor_merchant', 'armor_specialist', 'golem_instructor'],
    'Бронник (2) — ТРИ NPC не тронуты: '
    + JSON.stringify(brunnik.map((n) => n.id)));
  const armory = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(armory.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', 'blade_smith',
      'ex_mercenary',
      'armory_apprentice'],
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута (Скарн-дуэлянт остаётся '
    + 'там — наш чемпион живёт на Арене): '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: оверлей Арены — ровно 3 dialog-строки --------------------------------

test('T8: [E]-оверлей Арены — ровно 3 строки: dialog (Карк), dialog:sword_instructor (Насечка), dialog:arena_champion (Кремень) — пин создан в .05 (ОДНА), поднят в .25 (ДВЕ) и здесь (ТРЁХ); у дома 7 эффектов нет — EFFECTS не содержит ключа «7», только dialog-строки; хоткеи Digit1..3 — граница /^Digit([1-9])$/ не превышена (диапазон Арены .25–.31: следующие росты — .28…)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'arena.json'));
  assert.equal(b.id, 7, 'здание arena — id 7 (фикс размещения)');
  assert.equal(b.категория, 'школа_навыков',
    'категория — школа_навыков (контракт «школы» её и свипует)');
  assert.ok(!('7' in BE.EFFECTS),
    'у дома 7 эффектов НЕТ (EFFECTS не содержит ключа «7») — список '
    + 'здания = только dialog-строки (прецедент .25)');
  const list = N.npcsForBuilding(NPCS, 7);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.equal(rows.length, 3,
    'у здания 7 эффектов нет — список = dialog-строки по каждому NPC '
    + '(РОВНО ТРИ после .27), факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:sword_instructor', 'dialog:' + ID],
    'порядок строк = нумерация файлов каталога, Карк по-прежнему '
    + 'ПЕРВЫЙ (суффикс «:<id>» со второй строки — механизм '
    + 'building-actions); факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Карк', 'Диалог: Насечка', 'Диалог: ' + NAME],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['arena_master', 'sword_instructor', ID],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..3 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});

// --- T9: forbid-цепь — зуб длины/уникальности/включения (000372) -------------

test('T9: forbid-цепь 000372 (.26→.27) — guard-массив T5 этого файла РОВНО 95 и без дублей, предыдущего звена .26 РОВНО 91 и без дублей, prev ⊆ own, дельта — РОВНО 4 оборота Костяшки (формула наследования; хвост цепи — резерв 4 Кремень НЕ в списке, он для .28)', () => {
  const extract = (file) => {
    const src = fs.readFileSync(file, 'utf8');
    const anchor = "test('" + "T5:";
    const at = src.indexOf(anchor);
    assert.ok(at >= 0,
      path.basename(file) + ': якорь T5 не найден — порча имени '
      + 'теста-носителя цепи ловится здесь (ERR_ASSERTION, не крах '
      + 'загрузки)');
    const m = src.slice(at).match(/for \(const w of \[([\s\S]*?)\]\)/);
    assert.ok(m,
      path.basename(file) + ': guard-массив не найден после якоря T5');
    return [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
  };
  const EXPECT_ADDS = [
    'кулак не прощает суеты', 'бьёт не рука, а весь человек',
    'сначала держи, потом давай', 'двор помнит каждого, кто встал в круг',
  ];
  const own = extract(__filename);
  const prevFile = path.join(__dirname, 'npc-000320.26.test.js');
  assert.ok(fs.existsSync(prevFile),
    'предыдущее звено цепи tests/npc-000320.26.test.js существует');
  const prev = extract(prevFile);
  assert.equal(own.length, 95,
    'guard-массив T5 этого файла — РОВНО 95 (пин по диску; вырез или '
    + 'лишний элемент ловятся здесь); факт: ' + own.length);
  assert.equal(new Set(own).size, own.length,
    'guard-массив этого файла — элементы уникальны (дубль ловится здесь)');
  assert.equal(prev.length, 91,
    'guard-массив T5 .26 — РОВНО 91 (то же число пинует T9 файла .26 — '
    + 'двойное покрытие); факт: ' + prev.length);
  assert.equal(new Set(prev).size, prev.length,
    'guard-массив .26 — элементы уникальны');
  const ownSet = new Set(own);
  const lost = [...new Set(prev)].filter((x) => !ownSet.has(x));
  assert.deepEqual(lost, [],
    'строгое включение prev ⊆ own — ни один элемент .26 не потерян; '
    + 'потеряно: ' + JSON.stringify(lost));
  const prevSet = new Set(prev);
  const adds = own.filter((x) => !prevSet.has(x));
  assert.deepEqual([...adds].sort(), [...EXPECT_ADDS].sort(),
    'дельта (own минус prev) — РОВНО 4 оборота Костяшки = MINE-константа '
    + 'файла .26 (формула наследования memory/000320-fist_instructor.md); '
    + 'СВОИ 4 оборота Кремня (резерв .28 по '
    + 'memory/000320-arena_champion.md) в списке НЕ сидят; факт: '
    + JSON.stringify(adds));
});
