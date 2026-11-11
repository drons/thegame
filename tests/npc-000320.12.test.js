// Задача 000320.12: «Полынь» — торговка травами (Аптекарь, 3-й NPC
// постройки; 12-я из 100 дочерних 000320).
//
// Контракт (ТЗ tasks/done/000320.12.md; механизм мульти-NPC —
// 000320.01, spec/npc.md «Несколько NPC на постройку»,
// memory/000320-npcs-batch.md):
//   * assets/npc/000030.json — id herbalist (резерв ТЗ, sweep —
//     свободен), имя «Полынь» (выбор агента: прозвище по сушёной
//     траве с вешал — сама сушит, отсюда и прозвище; прецеденты
//     не-личного имени 000018 «Кочевник», прозвища 000026 «Опилка»,
//     000027 «Чекан», 000028 «Глыба», 000029 «Отвар»; НЕ пересекается
//     с темой .11 — там котёл и веса, здесь сушка), роль «торговка
//     травами» (фикс ТЗ; строка НОВА в каталоге — свипов уникальности
//     ролей нет, уникальны по контракту id/имя/описание; прецедент
//     дубля роли .09), постройка assets/buildings/apothecary.json
//     (Аптекарь — ТРЕТИЙ NPC: Мила ПЕРВАЯ, npcForBuilding(3)
//     продолжает возвращать Милу), хук истории «Знает все травы
//     долины; продаёт только сушёные» (последнее предложение
//     описания, с заглавной — прецеденты .02–.11);
//   * профиль — ТОРГОВЛЯ + ПОДСКАЗКА (клон механики .09/.11, без
//     квестов/обучения/найма): ≥1 опций с действием «торговля»;
//     счётчики npc-refs goal 2 / reward 5 НЕ растут; trade 60 → 63 —
//     три травы Травницы, уникальные предметы 41 — травы уже в
//     множестве (их продаёт Мила — дедуп по пути, прецедент зелий
//     .11);
//   * торговля — 3 травы каталога (000039/000040/000041, kind
//     reagent, формат 000322: base_price в JSON предмета — ловушка
//     R1, mult_покупки при 1 — ключа нет), множители НЕ ВЫШЕ
//     купецких Милы на тот же предмет (пересчёт против 000003.json
//     в T6 — «тон аптекаря»), количества 1..99 (schema);
//   * опций с «для» — РОВНО 0: травница торгует с каждым; контракт
//     A8a (tests/npc-dialog-scope) — динамический свип ждёт 0 «для»
//     у всех, кроме Берты/Элдиры/Корда; добавление «для» =
//     ослабление пина, запрещено;
//   * тема hint — сушёные травы: сушка/сбор/распознание на вид и
//     запах (НЕ «варка» — тема Отвара); темы брони-звонка (.09),
//     големов (.10), ковки-хвостовика (.06), коллекции (.05), старых
//     походов/арены (.04), наёма/жалованья (.07), метлы/стены
//     клинков (.08) и тексты Милы и Отвара НЕ дублируются дословно
//     в текстах диалога (запрет-лист — к ТЕКСТАМ диалога, НЕ к
//     описанию: собственный хук с «травы/сушёные» иначе нарушил бы
//     ассерт; «трав»/«суш»/«вес» не банятся — категории своего дома,
//     правило «брон» из .09);
//   * [E]-оверлей Аптекаря — РОВНО ТРИ dialog-строки в порядке
//     каталога: 'dialog' (Мила) → 'dialog:brewer' (Отвар) →
//     'dialog:herbalist' (Полынь); хоткеи Digit1..3 — общий механизм
//     src/building-ui.js /^Digit([1-9])$/ по индексу строки. Пин
//     оверлея Аптекаря — в .11 (T9, был ДВЕ строки); ростер Бронника
//     (ТРИ) и Оружейной (ДЕВЯТЬ) НЕ затрагивается. РЕ-ПИН 000320.13:
//     +dialog:alchemy_instructor (Тигель) — ЧЕТЫРЕ строки, Digit1..4
//     (T7/T8).
//
// КРАСНЫЕ (TDD): T1..T8 красные до зелёной стадии (000030.json нет,
// каталог 29, ростер Аптекаря 2, оверлей 2 строки), без краха загрузки.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { validateData } = require('./json-schema.js');

const ROOT = path.join(__dirname, '..');
const NDIR = path.join(ROOT, 'assets', 'npc');
const NEW = path.join(NDIR, '000030.json');
const SCHEMA = JSON.parse(
  fs.readFileSync(path.join(NDIR, 'schema.json'), 'utf8'));

const N = require('../src/npc.js');
const { NPCS } = require('../src/npc-data.js');
const BE = require('../src/building-effects.js');

const HOOK = 'Знает все травы долины; продаёт только сушёные';
const ID = 'herbalist';
const NAME = 'Полынь';

function listNpcFiles() {
  return fs.readdirSync(NDIR)
    .filter((f) => /^\d{6}\.json$/.test(f))
    .sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// --- T1: размер каталога ---------------------------------------------------

test('T1: каталог — ровно 33 файла 000001..000033 подряд; зеркало NPCS 33 записи с herbalist', () => {
  const files = listNpcFiles();
  assert.equal(files.length, 33,
    'в каталоге NPC 33 файла (000320.09: +Специалист по броне; 000320.10: '
    + '+Наставник-големовед; 000320.11: +Торговец зельями; 000320.12: '
    + '+Торговка травами; 000320.13: +Алхимик-наставник; 000320.14: +Фельдшер; 000320.15: +Торговец свитками), факт: ' + files.length);
  for (let i = 0; i < files.length; i++) {
    assert.equal(files[i],
      String(i + 1).padStart(6, '0') + '.json',
      'нумерация подряд без пропусков: индекс ' + i);
  }
  assert.equal(NPCS.length, 33,
    'зеркало src/npc-data.js — 33 записи (sync не прогнан?), факт: '
    + NPCS.length);
  const last = NPCS[29];
  assert.ok(last, '30-я запись зеркала существует');
  assert.equal(last.id, ID,
    '30-я запись зеркала — herbalist (порядок = нумерация файлов)');
});

// --- T2: 000030.json валиден по схеме + порядок ключей + roundtrip ---------

test('T2: assets/npc/000030.json валиден по schema; ключи в порядке 000001/000019/000024/000027 (торговля после диалога); roundtrip-канон; негативы — мимо схемы', () => {
  assert.ok(fs.existsSync(NEW),
    'RED: assets/npc/000030.json отсутствует (NPC задачи ещё не создан)');
  const data = readJson(NEW);
  assert.deepEqual(validateData(SCHEMA, data, 'npc/000030'), [],
    '000030.json обязан проходить assets/npc/schema.json');
  assert.deepEqual(Object.keys(data),
    ['id', 'имя', 'роль', 'описание', 'постройки', 'диалог', 'торговля'],
    'порядок ключей — как 000001/000019/000024/000027 (id, имя, роль, '
    + 'описание, постройки, диалог, торговля) — профиль торговля');
  const raw = fs.readFileSync(NEW, 'utf8');
  assert.equal(raw, JSON.stringify(data, null, 2) + '\n',
    '000030.json — roundtrip JSON.stringify(obj,null,2)+перевод строки');
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
  badPath.постройки = ['000001.json'];
  assert.notDeepEqual(validateData(SCHEMA, badPath, 'npc/badpath'), [],
    'постройки без пути assets/buildings/ — вне паттерна схемы');
  const badQty = JSON.parse(JSON.stringify(data));
  badQty.торговля.предметы[0].количество = 0;
  assert.notDeepEqual(validateData(SCHEMA, badQty, 'npc/badqty'), [],
    'количество 0 — вне схемы (minimum 1, maximum 99)');
  const legacyEntry = JSON.parse(JSON.stringify(data));
  legacyEntry.торговля.предметы[0] = {
    предмет: 'assets/items/000039.json',
    цена_покупки: 2, цена_продажи: 1, количество: 1,
  };
  assert.notDeepEqual(validateData(SCHEMA, legacyEntry, 'npc/legacy'), [],
    'legacy-вход торговли (цена_покупки/цена_продажи) — невалиден (000322)');
});

// --- T3: id и имя уникальны (sweep) ----------------------------------------

test('T3: id herbalist и имя «Полынь» уникальны в sweep каталога', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000030.json отсутствует');
  const ids = new Set();
  const names = new Set();
  for (const f of listNpcFiles()) {
    const d = readJson(path.join(NDIR, f));
    assert.ok(!ids.has(d.id), 'дубликат id «' + d.id + '» (файл ' + f + ')');
    assert.ok(!names.has(d.имя), 'дубликат имени «' + d.имя + '» (файл ' + f + ')');
    ids.add(d.id);
    names.add(d.имя);
  }
  assert.ok(ids.has(ID), 'id herbalist в каталоге');
  assert.ok(names.has(NAME), 'имя «Полынь» в каталоге');
});

// --- T4: роль-фикс, описание с хуком и уникально ----------------------------

test('T4: роль РОВНО «торговка травами»; описание непустое, хук «Знает все травы долины» — последнее предложение, и НЕ копия описания другого NPC', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000030.json отсутствует');
  const data = readJson(NEW);
  assert.ok(typeof data.описание === 'string' && data.описание.trim() !== '',
    'описание непустое');
  assert.equal(data.роль, 'торговка травами',
    'роль — фикс-строка «торговка травами» (ТЗ)');
  assert.ok(data.описание.includes(HOOK),
    'хук истории «' + HOOK + '» (ТЗ) в описании дословно');
  assert.ok(data.описание.endsWith(HOOK + '.'),
    'хук — ПОСЛЕДНЕЕ предложение описания (с заглавной, с точкой на конце — '
    + 'прецеденты .02–.11); факт: ' + JSON.stringify(data.описание.slice(-60)));
  for (const f of listNpcFiles()) {
    if (f === '000030.json') continue;
    const d = readJson(path.join(NDIR, f));
    assert.notEqual(d.описание, data.описание,
      'описание совпадает с ' + f + ' (не копия существующего)');
  }
});

// --- T5: диалог — профиль торговля+подсказка, без «для» ---------------------

test('T5: диалог валиден по схеме, РОВНО 3 опции, ≥1 опция «торговля», действия ⊆ {подсказка, торговля}, ровно одна с {харизма:3}, id опций уникальны, опций с «для» — ровно 0, темы .04–.10 и тексты Милы/Отвара не дублируются', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000030.json отсутствует');
  const data = readJson(NEW);
  assert.ok(Array.isArray(data.диалог) && data.диалог.length >= 1,
    'диалог непустой (schema minItems 1)');
  assert.equal(data.диалог.length, 3,
    'диалог — ровно 3 опции (prives / торговля / hint — конвенция '
    + 'профиля торговля .09/.11), факт: ' + data.диалог.length);
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
    'профиль ТОРГОВЛЯ+ПОДСКАЗКА (без квестов/обучения/найма): опций с '
    + 'действием вне {подсказка, торговля} — ровно 0');
  const ids = data.диалог.map((o) => o.id);
  assert.equal(new Set(ids).size, ids.length, 'id опций диалога уникальны');
  assert.equal(data.диалог.filter((o) => o.для !== undefined).length, 0,
    'опций с «для» — ровно 0: травница торгует с каждым; добавление '
    + '«для» требует ре-пина A8a (tests/npc-dialog-scope) и запрещено');
  const withReq = data.диалог.filter((o) => o.требования !== undefined);
  assert.equal(withReq.length, 1,
    'ровно одна опция с требованиями (прецедент hint_wood/hint_old/hint_blade/hint_collection/hint_anvil/hint_march/hint_ring/hint_weight)');
  assert.deepEqual(withReq[0].требования, { харизма: 3 },
    'требование опции — {харизма: 3}');
  const texts = data.диалог.map((o) => o.текст).join(' ');
  for (const w of ['хвостовик', 'наковальн', 'штампов', 'коллекци', 'позолот',
    'старые походы', 'арен', 'жалован', 'знамен', 'задаток', 'табель',
    'метл', 'стена клинков', 'звон', 'дребезг', 'нагрудник', 'закалк',
    'трещин', 'молотк', 'примеря',
    'старые дела', 'храм солнц', 'старейшин', 'посмееш',
    'на весах', 'сонной мяты', 'клонит в сон']) {
    assert.ok(!texts.includes(w),
      'тема чужого NPC (.04 «старые походы»/арена, .05 коллекция, .06 ковка/'
      + 'хвостовик, .07 наём/жалованье, .08 метла/стена клинков, .09 '
      + 'броня-звонок, .10 големы; тексты Милы — «старые дела»/«храм '
      + 'солнца»/«старейшина»/«посмеешь»; тексты Отвара — «на весах»/'
      + '«сонной мяты»/«клонит в сон») не дублируется: подстрока «'
      + w + '»');
  }
});

// --- T6: профиль-гарант + торговля — 3 травы, формат 000322, тон Милы -------

test('T6: блоков квесты/обучение/найм НЕТ (ни в JSON, ни в зеркале — goal 2/reward 5 не растут); торговля ЕСТЬ там и там; РОВНО 3 входа трав с base_price; kind reagent; mult ∈ (0,1] и НЕ выше множителя Милы на тот же предмет; mult_покупки отсутствует; количество 1..99; зеркало: постройки [3], торговля резолвится в id; ассортимент = {herb_bitter, herb_healing, herb_mana}', () => {
  assert.ok(fs.existsSync(NEW), 'RED: assets/npc/000030.json отсутствует');
  const data = readJson(NEW);
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in data),
      'в JSON нет блока «' + block + '»: профиль торговля без квестов — '
      + 'счётчики npc-refs goal 2 / reward 5 не растут');
  }
  assert.ok(data.торговля && Array.isArray(data.торговля.предметы),
    'в JSON есть блок «торговля» с предметами (trade 60 → 63)');
  const items = data.торговля.предметы;
  assert.equal(items.length, 3,
    'витрина — ровно 3 позиции (травы Аптекаря), факт: ' + items.length);
  const mirror = NPCS[29];
  assert.ok(mirror && mirror.id === ID,
    'зеркало: 30-я запись herbalist');
  assert.equal(mirror.роль, 'торговка травами',
    'роль в зеркале — «торговка травами» (фикс ТЗ)');
  for (const block of ['квесты', 'обучение', 'найм']) {
    assert.ok(!(block in mirror),
      'в зеркале нет блока «' + block + '» (следует из JSON)');
  }
  assert.ok(mirror.торговля && Array.isArray(mirror.торговля.предметы),
    'в зеркале есть блок «торговля» (следует из JSON)');
  assert.deepEqual(mirror.постройки, [3],
    'зеркало: постройки [3] — sync резолвит ссылку Аптекаря в id');
  assert.deepEqual(mirror.диалог, data.диалог,
    'зеркало NPCS[29].диалог ≡ JSON-диалог бит-в-бит');
  assert.deepEqual(mirror.описание, data.описание,
    'зеркало NPCS[29].описание ≡ JSON');
  const mila = readJson(path.join(NDIR, '000003.json'));
  const milaMult = new Map(mila.торговля.предметы
    .map((e) => [e.предмет, e.mult_продажи]));
  assert.ok(milaMult.size > 0, 'у Милы есть торговля для сверки тона');
  const ids = new Set();
  items.forEach((p, j) => {
    assert.match(p.предмет, /^assets\/items\/\d{6}\.json$/,
      'путь предмета — якорная ссылка: ' + p.предмет);
    const target = path.join(ROOT, p.предмет);
    assert.ok(fs.existsSync(target), 'предмет существует по пути: ' + p.предмет);
    const it = readJson(target);
    assert.equal(it.kind, 'reagent',
      p.предмет + ': торговка травами торгует травами — kind reagent');
    assert.ok(Number.isInteger(it.base_price) && it.base_price >= 1,
      p.предмет + ': base_price в JSON предмета (000322) — предметы без '
      + 'base_price в ассортимент forbidden (невидимы свипу R1, '
      + 'ловушка traveler_cloak .09)');
    ids.add(it.id);
    assert.equal(mirror.торговля.предметы[j].предмет, it.id,
      'зеркало резолвит путь в id: ' + p.предмет);
    assert.ok(p.mult_продажи > 0 && p.mult_продажи <= 1,
      p.предмет + ': mult_продажи ∈ (0,1]: ' + p.mult_продажи);
    assert.ok(milaMult.has(p.предмет),
      p.предмет + ': предмет — из ассортимента Милы (травы уже в '
      + 'множестве 41 — дедуп по пути, unique не растёт)');
    assert.ok(p.mult_продажи <= milaMult.get(p.предмет),
      p.предмет + ': множитель НЕ ВЫШЕ купецкого Милы '
      + milaMult.get(p.предмет) + ' — «торговка в тон аптекарю», '
      + 'факт: ' + p.mult_продажи);
    assert.ok(!('mult_покупки' in p),
      p.предмет + ': mult_покупки при 1 — КЛЮЧ обязан ОТСУТСТВОВАТЬ (000322)');
    assert.ok(Number.isInteger(p.количество) && p.количество >= 1
      && p.количество <= 99,
      p.предмет + ': количество int 1..99, факт: ' + p.количество);
  });
  assert.deepEqual([...ids].sort(),
    ['herb_bitter', 'herb_healing', 'herb_mana'],
    'ассортимент — травы Аптекаря по диску (000039/000040/000041)');
});

// --- T7: ростер Аптекаря — ПЯТЬ записей, Мила первая -------------------------

test('T7: npcsForBuilding(NPCS, 3) — ПЯТЬ записей Аптекаря в порядке каталога [apothecary, brewer, herbalist, alchemy_instructor, village_doctor] (ре-пины 000320.13/000320.14); npcForBuilding(3) — по-прежнему Мила; Бронник — ТРИ и Оружейная — ДЕВЯТЬ не тронуты', () => {
  const list = N.npcsForBuilding(NPCS, 3);
  assert.deepEqual(list.map((n) => n.id),
    ['apothecary', 'brewer', ID, 'alchemy_instructor',
      'village_doctor'],
    'Аптекарь (3): Мила (000003) + Зельевар (000029) + Травница '
    + '(000030) + Алхимик-наставник (000031, 000320.13) + Фельдшер '
    + '(000032, 000320.14), порядок = нумерация файлов; факт: '
    + JSON.stringify(list.map((n) => n.id)));
  assert.equal(N.npcForBuilding(NPCS, 3).id, 'apothecary',
    'npcForBuilding — ПЕРВЫЙ по номеру файла (Мила; HUD/«Здесь:» не тронуты)');
  const brunnik = N.npcsForBuilding(NPCS, 2);
  assert.deepEqual(brunnik.map((n) => n.id),
    ['armor_merchant', 'armor_specialist', 'golem_instructor'],
    'Бронник (2) — ТРИ NPC не тронуты (новый NPC — Аптекарь): '
    + JSON.stringify(brunnik.map((n) => n.id)));
  const armory = N.npcsForBuilding(NPCS, 1);
  assert.deepEqual(armory.map((n) => n.id),
    ['weapons_merchant', 'blade_merchant', 'fencing_instructor',
      'duelist', 'veteran_blade', 'sword_collector', 'blade_smith',
      'ex_mercenary', 'armory_apprentice'],
    'Оружейная (1) — ДЕВЯТЬ NPC не тронута: '
    + JSON.stringify(armory.map((n) => n.id)));
});

// --- T8: оверлей Аптекаря — ровно 5 dialog-строк -----------------------------

test('T8: [E]-оверлей Аптекаря — ровно 5 строк: dialog (Мила), dialog:brewer (Отвар), dialog:herbalist (Полынь), dialog:alchemy_instructor (Тигель), dialog:village_doctor (Жгут) — ре-пины 000320.13/000320.14 (было 3 в .12)', () => {
  const b = readJson(path.join(ROOT, 'assets', 'buildings', 'apothecary.json'));
  const list = N.npcsForBuilding(NPCS, 3);
  const rows = BE.buildingActions(b, list, { day: 5 });
  assert.deepEqual(rows.map((r) => r.id),
    ['dialog', 'dialog:brewer', 'dialog:' + ID,
      'dialog:alchemy_instructor', 'dialog:village_doctor'],
    'у здания 3 эффектов нет — список = dialog-строки по каждому NPC; '
    + 'ре-пин при появлении шестого NPC Аптекаря; '
    + 'факт: ' + JSON.stringify(rows.map((r) => r.id)));
  assert.deepEqual(rows.map((r) => r.имя),
    ['Диалог: Мила', 'Диалог: Отвар', 'Диалог: ' + NAME,
      'Диалог: Тигель', 'Диалог: Жгут'],
    'подписи — «Диалог: <имя>», факт: ' + JSON.stringify(rows.map((r) => r.имя)));
  assert.deepEqual(rows.map((r) => r.npcId),
    ['apothecary', 'brewer', ID, 'alchemy_instructor',
      'village_doctor'],
    'каждая строка несёт npcId своего NPC (роутинг клика); хоткеи '
    + 'Digit1..5 — общий механизм /^Digit([1-9])$/ (src/building-ui.js) '
    + 'по индексу строки');
});
