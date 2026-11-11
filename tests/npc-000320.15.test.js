// Задача 000320.15: «Пергамент» (scroll_merchant) — торговец свитками
// (Магазин магии, 2-й NPC постройки; 15-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.15.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000033.json — id scroll_merchant (резерв ТЗ, sweep
//     по 32 занятым — свободен), имя «Пергамент» (выбор агента:
//     прозвище по материалу дела — на пергаменте свитки и пишут;
//     прецеденты не-личного имени 000018 «Кочевник», прозвища 000026
//     «Опилка», 000027 «Чекан», 000028 «Глыба», 000029 «Отвар»,
//     000030 «Полынь», 000031 «Тигель», 000032 «Жгут»), роль
//     «торговец свитками» (фикс ТЗ; строка НОВА в каталоге — свипов
//     уникальности ролей нет, Т4 пишет точное равенство), постройка
//     assets/buildings/magic_shop.json (Магазин магии — ВТОРОЙ NPC: Зира
//     ПЕРВАЯ, npcForBuilding(4) продолжает возвращать Зиру), хук
//     истории «Покупает и продаёт свитки; знает, какое заклинание в
//     каком» (последнее предложение описания, с заглавной —
//     прецеденты .02–.14);
//   * профиль — ТОРГОВЛЯ (клон механики .11 «Отвар»: форма диалога и
//     блока торговли; без квестов/обучения/найма): РОВНО 3 опции,
//     действия ⊆ {подсказка, торговля}, ≥1 «торговля», РОВНО одна с
//     {харизма:3} (прецедент hint_wood/.../hint_fire — НЕ «проверка»);
//     блоков квесты/обучение/найм НЕТ — счётчики npc-refs goal 2 /
//     reward 5 НЕ растут; торговля 64 → 67, сумма 71 → 74, уникальные
//     предметы 41 → 44 — свитки 000043/000045/000048 НОВЫЕ в множестве
//     (ни один NPC их не продавал — Зира торгует реагентами/книгами/
//     чертежом; ЭТО ОТКЛОНЕНИЕ от предположения ТЗ «дедуп по пути →
//     unique не растёт» — диск первичен, прецедент .13 vs текст ТЗ);
//   * торговля — 3 свитка заклинаний (000043 fireball / 000045
//     frost_bolt / 000048 light_heal, kind spell_scroll, из
//     ассортимента постройки «свитки заклинаний»; формат 000322:
//     «цены в JSON предмета» — у spell_scroll base_price ОТСУТСТВОВАЛ,
//     R1 требует его у каждого торгуемого → задача ДОБАВЛЯЕТ
//     base_price = value (60/45/70, ПОСЛЕ value) в JSON предметов +
//     перегенерацию src/items-data.js; base:=value сохраняет семантику
//     цены — фолбэк R8 именно таков, магазинные цены идут от value
//     (R4) и не двигаются), mult_продажи РОВНО 0.5 — «тон хозяина
//     дома»: единственный свитковый товар Магазина магии у Зиры
//     (blueprint_runecraft 0.5; прецедент .13 blueprint 0.5),
//     количество 1, mult_покупки при 1 — ключа НЕТ;
//   * опций с «для» — РОВНО 0: торговец говорит с каждым; контракт
//     A8a (tests/npc-dialog-scope) — динамический свип ждёт 0 «для» у
//     всех, кроме Берты/Элдиры/Корда; добавление «для» = ослабление
//     пина, запрещено (мутация M1);
//   * тема hint — свитки/почерк/чернила: какое заклинание в каком
//     свитке; темы чужих NPC и тексты соседей по дому НЕ дублируются
//     дословно; запрет-лист ТЕКСТОВ диалога 37 = дисковый список .14
//     (31: .04–.10 + тексты Милы + обороты Отвара + обороты Травницы)
//     + СВОИ 3 оборота Жгута («где болит»/«выше раны»/«доживают до
//     старости» — зарезервированы в memory/000320-village_doctor.md
//     для .15+) + СВОИ 3 оборота Зиры («не бывает лишнего»/«с далёких
//     гор»/«договоримся о цене» — texts 000004.json);
//     «свитк»/«заклин»/«пергамен»/«чернил» НЕ банятся — категории
//     своего дома (правило «брон» .09/.10); к СВОЕМУ хуку запрет-лист
//     не применяется;
//   * [E]-оверлей Магазина магии — РОВНО ДВЕ dialog-строки в порядке
//     каталога: 'dialog' (Зира) → 'dialog:scroll_merchant'
//     (Пергамент); хоткеи Digit1..2 — общий механизм
//     src/building-ui.js /^Digit([1-9])$/ по индексу строки. ПРЕЖНИХ
//     пинов оверлея дома 4 в tests/ не было — закреплено здесь;
//     третий NPC этого дома (.16 «наставник» по плейсхолдеру) поднимет
//     оверлей до 3 и заре-пинит T7/T8 (прецедент .12 против .11).
//
// РЕ-ПИН 000320.16 (Маг-наставник/magic_instructor «Пробник» —
// ТРЕТИЙ NPC дома 4, 000034.json): T1 каталог/зеркало 33→34; T7 ростер
// дома 4 ДВА→ТРИ [magic_merchant, scroll_merchant,
// magic_instructor]; T8 оверлей РОВНО ДВЕ→ТРИ dialog-строки
// (хоткеи Digit1..3). Прецеденты .12/.13/.14 против .11.
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000033.json нет,
// каталог 32, ростер дома 4 — один NPC, оверлей 1 строка, у свитков
// нет base_price), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000033.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Покупает и продаёт свитки; знает, какое заклинание в каком';
const ID = 'scroll_merchant';
const NAME = 'Пергамент';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 34 файла 000001..000034 подряд; зеркало NPCS 34 записи с scroll_merchant', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 34,
    'в каталоге NPC 34 файла (000320.12: +Торговка травами; 000320.13: '
    + '+Алхимик-наставник; 000320.14: +Фельдшер; 000320.15: +Торговец '
    + 'свитками; 000320.16: +Маг-наставник), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 34,
    'зеркало src/npc-data.js — 34 записи (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[32];
  assert.ok(last, '33-я запись зеркала существует');
  assert.equal(last.id, ID,
    '33-я запись зеркала — scroll_merchant (порядок = нумерация файлов)');
});

// --- T2: 000033.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000033.json валиден по schema; ключи в порядке эталона торговли .11 (id, имя, роль, описание, постройки, диалог, торговля); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000033.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000033'), [],
    '000033.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
    'порядок ключей — как у эталона ТОРГОВЛЯ .11 (000029): id, имя, '
    + 'роль, описание, постройки, диалог, торговля — торговля ПОСЛЕ '
    + 'диалога, блоков обучение/квесты/найм нет');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000033.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
  const extraKey = JSON.parse(JSON.stringify(data));
  extraKey.цена = 10;
  assert.notDeepEqual(validateData(SCHEMA, extraKey, 'npc/extra'), [],
    'посторонний ключ «цена» — additionalProperties false, обязан отваливаться');
  const badCharisma = JSON.parse(JSON.stringify(data));
  const reqOpt = badCharisma.диалог.find((o) => o.требования);
  assert.ok(reqOpt, 'есть опция с требованиями (прецедент hint_weight .11)');
  reqOpt.требования.харизма = 0;
  assert.notDeepEqual(validateData(SCHEMA, badCharisma, 'npc/badcharisma'), [],
    'требование харизма 0 — вне схемы (minimum 1)');
  const badAction = JSON.parse(JSON.stringify(data));
  badAction.диалог[0].действие = 'дар';
  assert.notDeepEqual(validateData(SCHEMA, badAction, 'npc/badaction'), [],
    'действие «дар» — вне enum схемы');
  const badPath = JSON.parse(JSON.stringify(data));
  badPath.постройки = ['000004.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ — вне паттерна схемы');
  const badQty = JSON.parse(JSON.stringify(data));
  badQty.торговля.предметы[0].количество = 0;
  assert.notDeepEqual(validateData(SCHEMA, badQty, 'npc/badqty'), [],
    'количество 0 — вне схемы (minimum 1, maximum 99)');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля.предметы[0] = {
    предмет: 'assets/items/000043.json',
    цена_покупки: 60, цена_продажи: 30, количество: 1,
  };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacy'), [],
    'legacy-вход торговли (цена_покупки/цена_продажи) — невалиден (000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id scroll_merchant и имя «Пергамент» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000033.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id scroll_merchant в каталоге');
  assert.ok(names.has(NAME), 'имя «Пергамент» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «торговец свитками» (точная строка ТЗ; свипов уникальности ролей нет); описание непустое, хук «Покупает и продаёт свитки; знает, какое заклинание в каком» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000033.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'торговец свитками',
    'роль — фикс-строка «торговец свитками» (ТЗ); Т4 пишет точное равенство');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на конце — '
    + 'прецеденты .02–.14); факт: ' + JSON.stringify(data.описание.slice(-70)));
  for (const f of listNpcFiles()) {
    if (f === '000033.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля, без «для» --------------------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции как у эталона .11, ≥1 «торговля», действия ⊆ {подсказка, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, запрет-лист 37 подстрок (.04–.14 + обороты Жгута + обороты Зиры) по ТЕКСТАМ диалога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000033.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / торговля / hint — форма эталона '
    + 'ТОРГОВЛЯ .11 «Отвар»), факт: ' + data.диалог.length);
  const ACTIONS = SCHEMA.properties.диалог.items.properties.действие.enum;
  for (const o of data.диалог) {
    assert.ok(ACTIONS.includes(o.действие),
      'действие «' + o.действие + '» вне enum схемы');
    const errs = validateData(SCHEMA.properties.диалог.items, o, 'диалог');
    assert.deepEqual(errs, [],
      'опция «' + o.id + '» — вне схемы диалога: ' + JSON.stringify(errs));
  }
  assert.ok(data.диалог.some((o) => o.действие === 'торговля'),
    'профиль «торговля» — хотя бы одна опция действия «торговля»');
  assert.equal(
    data.диалог.filter((o) => o.действие !== 'подсказка'
      && o.действие !== 'торговля').length, 0,
    'профиль ТОРГОВЛЯ (без квестов/обучения/найма): опций с действием '
    + 'вне {подсказка, торговля} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: торговец свитками говорит со всеми; '
    + 'добавление «для» требует ре-пина A8a (tests/npc-dialog-scope) '
    + 'и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/'
    + 'hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/'
    + 'hint_weight/hint_dry/hint_stone/hint_fire)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3} (харизма-прецедент батча, НЕ «проверка»)');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
    'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
    'метл', 'стена клинков', 'звон', 'дребезг', 'нагрудник', 'закалк',
    'трещин', 'молотк', 'примеря',
    'старые дела', 'храм солнц', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон',
    'завянет', 'пучками', 'почерневш', 'разотрёшь',
    'где болит', 'выше раны', 'доживают до старости',
    'не бывает лишнего', 'с далёких гор', 'договоримся о цене']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена — «арен», .05 '
      + 'коллекция, .06 ковка/хвостовик, .07 наём/жалованье, .08 '
      + 'метла/стена клинков, .09 броня-звонок, .10 големы; тексты '
      + 'Милы — «старые дела»/«храм солнца»/«старейшина»/«посмеешь»; '
      + 'обороты Отвара — «на весах»/«сонной мяты»/«клонит в сон»; '
      + 'обороты Травницы — «завянет»/«пучками»/«почерневш»/«разотрёшь»; '
      + 'обороты Жгута (сосед по своду .14) — «где болит»/«выше раны»/'
      + '«доживают до старости»; обороты Зиры (хозяйка дома 4) — «не '
      + 'бывает лишнего»/«с далёких гор»/«договоримся о цене») не '
      + 'дублируется: подстрока «' + w + '»');
  }
});

// --- T6: профиль-гарант + торговля — 3 свитка, формат 000322, тон дома -------

test('T6: блоков квесты/обучение/найм НЕТ (ни в JSON, ни в зеркале), торговля ЕСТЬ там и там; РОВНО 3 входа свитков (kind spell_scroll) с base_price в JSON предмета ПОСЛЕ value; mult ∈ (0,1] и НЕ выше 0.5 (тон свиткового товара дома 4 — blueprint_runecraft Зиры); mult_покупки отсутствует; количество 1..99; зеркало: постройки [4], торговля резолвится в id, диалог/описание deepEqual; ассортимент = {fireball_scroll, frost_bolt_scroll, light_heal_scroll}', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000033.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль торговля без квестов — '
      + 'счётчики npc-refs goal 2 / reward 5 не растут');
  }
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'в JSON есть блок «торговля» с предметами (trade 64 → 67)');
  assert.deepEqual(Object.keys(data.торговля), ['предметы'],
    'блок торговли — единственный ключ «предметы» (формат 000322)');
  const items = data.торговля.предметы;
  assert.equal(items.length, 3,
    'витрина — ровно 3 позиции (свитки Магазина магии), факт: '
    + items.length);
  const mirror = NPCS[32];
  assert.ok(mirror && mirror.id === ID, 'зеркало: 33-я запись scroll_merchant');
  assert.equal(mirror.роль, 'торговец свитками',
    'роль в зеркале — «торговец свитками» (фикс ТЗ)');
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.ok(mirror.торговля && Array.isArray(mirror.торговля.предметы),
    'в зеркале есть блок «торговля» (следует из JSON)');
  assert.deepEqual(mirror.постройки, [4],
    'зеркало: постройки [4] — sync резолвит ссылку Магазина магии в id');
  const zira = readJson(path.join(NDIR, '000004.json'));
  const ziraScrollMult = zira.торговля.предметы
    .filter((e) => e.предмет === 'assets/items/000082.json')
    .map((e) => e.mult_продажи);
  assert.ok(ziraScrollMult.length === 1 && ziraScrollMult[0] === 0.5,
    'тон свиткового товара дома 4: у Зиры blueprint_runecraft mult РОВНО '
    + '0.5 — единственный свитковый товар постройки; факт: '
    + JSON.stringify(ziraScrollMult));
  const ids = new Set();
  items.forEach((p, j) => {
    assert.match(p.предмет, /^assets\/items\/\d{6}\.json$/,
      'путь предмета — якорная ссылка: ' + p.предмет);
    const target = path.join(ROOT, p.предмет);
    assert.ok(fs.existsSync(target), 'предмет существует по пути: ' + p.предмет);
    const it = readJson(target);
    assert.equal(it.kind, 'spell_scroll',
      p.предмет + ': торговец свитками торгует свитками — kind '
      + 'spell_scroll (ассортимент постройки 4: «свитки заклинаний»)');
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      p.предмет + ': base_price в JSON предмета (000322) — у свитков его '
      + 'не было ДО задачи, торговля обязана его внести (ловушка R1: '
      + 'свитки ВИДНЫ свипу «if (!npc.торговля) continue»); факт: '
      + JSON.stringify(it.base_price));
    assert.equal(it.base_price, it.value,
      p.предмет + ': base_price = value — цена NPC идентична фолбэку R8 '
      + '(base:=value), магазинные цены идут от value (R4) и не '
      + 'двигаются; факт: base=' + it.base_price + ' value=' + it.value);
    const keys = Object.keys(it);
    assert.equal(keys.indexOf('base_price'), keys.indexOf('value') + 1,
      p.предмет + ': base_price ПОСЛЕ value (канон KEYS sync-items-data); '
      + 'факт: ' + JSON.stringify(keys));
    ids.add(it.id);
    assert.equal(mirror.торговля.предметы[j].предмет, it.id,
      'зеркало резолвит путь в id: ' + p.предмет);
    assert.ok(p.mult_продажи > 0 && p.mult_продажи <= 1,
      p.предмет + ': mult_продажи ∈ (0,1]: ' + p.mult_продажи);
    assert.ok(p.mult_продажи <= 0.5,
      p.предмет + ': множитель НЕ ВЫШЕ свиткового тона дома 4 (0.5 — '
      + 'blueprint_runecraft Зиры; «второй NPC дома — в тон хозяину», '
      + 'прецедент .11/.12/.13), факт: ' + p.mult_продажи);
    assert.ok(!('mult_покупки' in p),
      p.предмет + ': mult_покупки при 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
    assert.ok(Number.isInteger(p.количество) && p.количество >= 1
      && p.количество <= 99,
      p.предмет + ': количество int 1..99, факт: ' + p.количество);
  });
  assert.deepEqual([...ids].sort(),
    ['fireball_scroll', 'frost_bolt_scroll', 'light_heal_scroll'],
    'ассортимент — три школы свитков (000043 огонь / 000045 мороз / '
    + '000048 исцеление) из исходного блока 000043–000050');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[32].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[32].описание ≡ JSON');
});

// --- T7: ростер дома 4 — ДВЕ записи, Зира первая -----------------------------

test('T7: npcsForBuilding(NPCS, 4) — ТРИ записи Магазина магии в порядке каталога [magic_merchant, scroll_merchant, magic_instructor]; npcForBuilding(4) — по-прежнему Зира; Аптекарь — ПЯТЬ, Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 4);
  assert.deepEqual(list.map((n) => n.id),
    ['magic_merchant', ID, 'magic_instructor'],
    'Магазин магии (4): Зира (000004) + Торговец свитками (000033) + '
    + 'Маг-наставник (000034, ре-пин 000320.16), порядок = нумерация '
    + 'файлов; факт: ' + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 4).id, 'magic_merchant',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Зира; HUD/«Здесь:» не тронуты)');
  const apteka = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(apteka.map((n) => n.id),
    ['apothecary', 'brewer', 'herbalist', 'alchemy_instructor',
      'village_doctor'],
    'Аптекарь (3) — ПЯТЬ NPC не тронуты (новый NPC — Магазин магии): '
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
      'ex_mercenary', 'armory_apprentice'],
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута: '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: оверлей дома 4 — ровно 2 dialog-строки ------------------------------

test('T8: [E]-оверлей Магазина магии — ровно 3 строки: dialog (Зира), dialog:scroll_merchant (Пергамент), dialog:magic_instructor (Пробник) — пин 000320.15 (ДВЕ), ре-пин 000320.16 (ТРИ)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'magic_shop.json'));
  const list = N.npcsForBuilding(NPCS, 4);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:' + ID, 'dialog:magic_instructor'],
    'у здания 4 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'РЕ-ПИН 000320.16: третий NPC дома 4 («Маг-наставник» по '
    + 'плейсхолдеру) поднял оверлей ДВЕ→ТРИ; факт: '
    + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Зира', 'Диалог: ' + NAME, 'Диалог: Пробник'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['magic_merchant', ID, 'magic_instructor'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..3 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});
