// Задача 000375: discovery-манифест глобального счётчика числа предметов
// каталога с полем base_price (ретро-b21 P4/Т3: литерал счётчика («… у 252»)
// продублирован в ДЕВЯТИ тест-файлах — scroll-trade-temples-000347.02 T4,
// item-prices-000322 R6, items-potion-000321.07 T8 и шесть items-wave
// канареек items-{weapon,armor,shield,artifact,tool,ring}-000321.0{1..6} T10;
// рассинхрон любой из девяти ловился только ПОЛНЫМ станционным прогоном —
// прецедент аннулирования прогона №1 волны 000321.07).
//
// Принцип — ОБНАРУЖЕНИЕ, А НЕ РЕЕСТР (ТЗ T2): манифест НЕ пинует число 252
// и НЕ отказывает новым держателям (вилка A-lenient): новый десятый файл с
// литералом формы иглы покрывается BP1 автоматически. Пинуются только:
// живое равенство диск ≡ зеркало, совпадение КАЖДОГО обнаруженного литерала
// с живым числом (красный с именем файла), непустота множества держателей,
// девятерка запрещённых-к-потере имён (BP2 — ловит молчаливое исчезновение
// канарейки и перефразирование мимо формы иглы) и self-match=0 исходника.
//
// ИГЛА: «base_price» + необязательное тире + слово «ровно» + «у <число>»,
// регистронезависимо (три формы держателей с диска базы различаются тире и
// капсом/строчным написанием слова «ровно»; все 18 вхождений целостны внутри
// одной строки). Исходник
// манифеста собирает регэксп concat-ом сегментов, поэтому собственный текст
// игле НЕ совпадает; BP2 сторожит это равенством 0 (грабли .318.08:
// двухстрочные/разорванные литералы).
//
// Границы покрытия (осознанно, memory/000375-base-price-manifest.md):
//   * числовые ассерт-литералы вне текстовой формы иглы (R6 «assert.equal(
//     withBase, 252…)», temples «assert.equal(mirrorBase, 252, …)») манифестом
//     НЕ ловятся — их красят собственные тесты-держатели (матрица M2);
//   * комплементарный счётчик «без — у 662» и subset-формы («stats.armor —
//     РОВНО у 12») вне иглы; форма иглы ЗАРЕЗЕРВИРОВАНА за глобальным
//     счётчиком — subset в этой форме даст ложный красный (tripwire, ТЗ T2).
//
// Вне SCOPE: ни один существующий файл не правится (держатели читаются через
// readFileSync, require чужих тестов запрещён — двойная регистрация test(),
// прецедент 000371). Источники чтения: assets/items (диск), src/items-data.js
// (require зеркалом, как у держателей), tests/**.js (тексты).
// CHANGELOG 0-diff (test-only, прецедент 000371). TAP-дельта: +2.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const ITEMS_DIR = path.join(ROOT, 'assets', 'items');
const TESTS_DIR = path.join(ROOT, 'tests');
const SELF = path.basename(__filename);

const NEEDLE_SRC = 'base_price' + '\\s*\\u2014?\\s*' + 'ровно' + '\\s+у\\s+(\\d+)';
const needle = () => new RegExp(NEEDLE_SRC, 'gi');

const FORBIDDEN_TO_LOSE = [
  'scroll-trade-temples-000347.02.test.js',
  'item-prices-000322.test.js',
  'items-potion-000321.07.test.js',
  'items-weapon-000321.01.test.js',
  'items-armor-000321.02.test.js',
  'items-shield-000321.03.test.js',
  'items-artifact-000321.04.test.js',
  'items-tool-000321.05.test.js',
  'items-ring-000321.06.test.js',
];

function diskCount() {
  let n = 0;
  for (const f of fs.readdirSync(ITEMS_DIR)) {
    if (!f.endsWith('.json') || f === 'schema.json') continue;
    const obj = JSON.parse(fs.readFileSync(path.join(ITEMS_DIR, f), 'utf8'));
    if ('base_price' in obj) n++;
  }
  return n;
}

function mirrorCount() {
  const { ITEMS } = require(path.join(ROOT, 'src', 'items-data.js'));
  return ITEMS.filter((it) => it.base_price !== undefined).length;
}

function jsFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...jsFiles(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out.sort();
}

function discover() {
  const holders = new Map();
  for (const p of jsFiles(TESTS_DIR)) {
    const rel = path.relative(TESTS_DIR, p).split(path.sep).join('/');
    if (rel === SELF) continue;
    const nums = [...fs.readFileSync(p, 'utf8').matchAll(needle())]
      .map((m) => Number(m[1]));
    if (nums.length) holders.set(rel, nums);
  }
  return holders;
}

test('000375-BP1: живое число base_price (диск ≡ зеркало) и КАЖДЫЙ обнаруженный держатель иглы в tests/ совпадает с ним (красный именуется файлом)', () => {
  const disk = diskCount();
  const mirror = mirrorCount();
  assert.equal(mirror, disk,
    'диск ≢ зеркало: assets/items («base_price» in) = ' + disk
    + ', src/items-data.js (base_price !== undefined) = ' + mirror
    + ' — зеркало обязано пересинхрониваться в том же коммите, что и каталог');
  assert.ok(disk > 0,
    'живой счётчик диска = 0 — каталог assets/items пуст или сломан (факт: '
    + disk + ')');
  const holders = discover();
  assert.ok(holders.size > 0,
    'в tests/ не обнаружено НИ ОДНОГО держателя иглы глобального счётчика —'
    + ' исчез весь класс канареек (девятерка базы зафиксирована в BP2;'
    + ' memory/000375-base-price-manifest.md)');
  for (const [rel, nums] of holders) {
    for (const n of nums) {
      assert.equal(n, disk,
        'рассинхрон держателя tests/' + rel + ': литерал ' + n
        + ' ≠ живое число ' + disk + ' — переснять ВСЕ иглы файла по диску'
        + ' (гейт 000375, matrix — tasks/result/000375.md)');
    }
  }
});

test('000375-BP2: девятерка запрещённых-к-потере держателей обнаружена (обнаружение, не реестр); self-match исходника манифеста = 0', () => {
  const holders = discover();
  for (const name of FORBIDDEN_TO_LOSE) {
    assert.ok(holders.has(name),
      'потерян держатель глобального счётчика: tests/' + name
      + ' — его литерал исчез или перефразирован мимо формы иглы'
      + ' (молчаливое исчезновение канарейки, ретро-b21); при легитимном'
      + ' удалении/переименовании файла — осознанно перенести имя из'
      + ' FORBIDDEN_TO_LOSE (memory/000375-base-price-manifest.md)');
  }
  const selfHits = [...fs.readFileSync(__filename, 'utf8').matchAll(needle())];
  assert.equal(selfHits.length, 0,
    'исходник манифеста содержит ' + selfHits.length
    + ' совпадений иглы — манифест стал бы десятым держателем с застывшим'
    + ' числом; форма собрана concat-ом сегментов, литеральную фразу сюда'
    + ' вставлять запрещено');
  assert.equal(FORBIDDEN_TO_LOSE.length, 9,
    'список запрещённых-к-потере обязан оставаться девятеркой базы задачи;'
    + ' факт: ' + FORBIDDEN_TO_LOSE.length);
});
