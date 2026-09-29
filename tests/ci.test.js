// GitHub CI и публикация на Pages (задача 000054).
//
// Workflow .github/workflows/ci.yml обязан:
//  * запускать тесты (npm test);
//  * прогонять «сборку» JS-бандлов из JSON-каталогов — sync-скрипты
//    scripts/sync-*.js через sync-all.js — с гейтом дрейфа
//    (--check: рассинхрон JSON <-> JS-зеркал = красный CI);
//  * публиковать артефакт (index.html, src/, assets/) на GitHub Pages
//    (actions/upload-pages-artifact + actions/deploy-pages) — только после
//    зелёных тестов (needs: test).
//
// Ограничение (memory): в проекте ноль npm-зависимостей — полного
// YAML-парсера нет. Проверяем workflow статически в двух слоях:
//  (1) СТРУКТУРНАЯ проверка YAML-подмножества (yamlSubsetErrors) —
//     ловит синтаксические ошибки, делающие файл непарсируемым
//     (прецедент, ревью раунда 3: неэкранированная «колонка+пробел» в
//     plain-скаляре name: → GitHub отклоняет workflow целиком);
//  (2) строковые/regex-ассерты по семантике (прецедент —
//     tests/index-order.test.js). Формат ci.yml поэтому фиксируем:
//     flow-список branches: [ master ] и path: dist у
//     upload-pages-artifact (input принимает ОДИН каталог — не список).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function readWorkflow() {
  const p = path.join(ROOT, '.github', 'workflows', 'ci.yml');
  assert.ok(fs.existsSync(p),
    '.github/workflows/ci.yml не существует (задача 000054)');
  const yml = fs.readFileSync(p, 'utf8');
  assert.ok(yml.trim().length > 0, 'ci.yml пустой');
  return yml;
}

// Структурная проверка YAML-подмножества, которым обязан пользоваться
// ci.yml: блок-маппинги, блок-/flow-последовательности, plain- и
// кавычные скаляры, блок-скаляры (|), полные строки-комментарии.
// Запрещено в подмножестве (и проверяется): «колонка+пробел» внутри
// plain-скаляра (значения с «:» — в кавычках), inline-комментарии,
// multiline flow-коллекции, дублирующиеся ключи в одном маппинге.
// Поймано ревью: - name: Сборка (выборка: ...) — неэкранированная
// «: » внутри plain-скаляра ломает парсинг ВЕГО файла, GitHub пишет
// «Workflow is not valid», ни один job не стартует.
function yamlSubsetErrors(yml) {
  const errors = [];
  const lines = yml.split('\n');
  let blockIndent = -1;          // граница вложенности блок-скаляра
  const mapping = [];            // стеки маппингов { indent, keys:Set }
  const indentOf = (s) => s.length - s.replace(/^[ \t]+/, '').length;
  const popTo = (ind) => {
    while (mapping.length && mapping[mapping.length - 1].indent > ind) mapping.pop();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, '');
    const n = i + 1;
    const ind = indentOf(line);
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;

    if (blockIndent >= 0) {
      if (ind > blockIndent) continue; // тело блок-скаляра
      blockIndent = -1;                // блок закончился
    }

    let body = line.slice(ind);
    let isItem = false;
    if (body === '-' || body.startsWith('- ')) {
      isItem = true;
      body = body.slice(1).trimStart();
      if (body === '') { errors.push(n + ': элемент «-» без содержимого'); continue; }
    }
    const keyIndent = isItem ? ind + 2 : ind;
    // Новый элемент последовательности — новое маппинг-пространство:
    // закрываем маппинг предыдущего элемента со ВСЕМ вложенным
    // (маппинг элемента — в indent+2, глубже — только его вложенность)
    if (isItem) {
      while (mapping.length && mapping[mapping.length - 1].indent >= keyIndent) mapping.pop();
    }

    const m = body.match(/^([A-Za-z0-9_-]+):(?:[ \t]+(.*))?[ \t]*$/);
    if (!m) {
      errors.push(n + ': строка не «ключ: значение» (голый скаляр в блочном контексте — ошибка): ' + trimmed);
      continue;
    }
    const key = m[1];
    const value = m[2]; // undefined или строка

    // Дублирующиеся ключи в одном маппинге
    popTo(keyIndent);
    const top = mapping.length ? mapping[mapping.length - 1] : null;
    if (top && top.indent === keyIndent) {
      if (top.keys.has(key)) errors.push(n + ': дублирующийся ключ «' + key + '» в одном маппинге');
      top.keys.add(key);
    } else if (!top || top.indent < keyIndent) {
      mapping.push({ indent: keyIndent, keys: new Set([key]) });
    }

    if (value === undefined || value === '') continue; // вложенный блок / пусто

    const first = value[0];
    if (first === '"' || first === "'") {
      // Кавычный скаляр: закрывающая кавышка — на той же строке
      let j = 1, ok = false;
      if (first === '"') {
        while (j < value.length) {
          if (value[j] === '\\') { j += 2; continue; }
          if (value[j] === '"') { ok = true; break; }
          j++;
        }
      } else {
        while (j < value.length) {
          if (value[j] === "'") {
            if (value[j + 1] === "'") { j += 2; continue; }
            ok = true; break;
          }
          j++;
        }
      }
      if (!ok) errors.push(n + ': кавычное значение «' + key + '» не закрыто');
      else if (value.slice(j + 1).trim() !== '') errors.push(n + ': мусор после закрывающей кавычки: ' + value);
      continue;
    }
    if (/^[|>][+-]?\d*$/.test(value)) {
      blockIndent = keyIndent; // тело обязано вложиться глубже ключа
      continue;
    }
    if (first === '[' || first === '{') {
      // Flow-коллекция — в подмножестве только однострочная
      const close = first === '[' ? ']' : '}';
      let depth = 0, q = null;
      for (let j = 0; j < value.length; j++) {
        const c = value[j];
        if (q === '"') { if (c === '\\') j++; else if (c === '"') q = null; }
        else if (q === "'") { if (c === "'") { if (value[j + 1] === "'") j++; else q = null; } }
        else if (c === '"' || c === "'") q = c;
        else if (c === first) depth++;
        else if (c === close) depth--;
      }
      if (q !== null || depth !== 0) errors.push(n + ': flow-коллекция «' + key + '» не закрыта (multiline запрещён)');
      continue;
    }
    // Plain-скаляр
    if (/:[ \t]/.test(value)) {
      errors.push(n + ': «колонка+пробел» внутри plain-скаляра — значение в кавычках: ' + value);
    } else if (/:$/.test(value)) {
      errors.push(n + ': plain-скаляр «' + key + '» оканчивается двоеточием (читается как ключ)');
    } else if (/[ \t]#/.test(value)) {
      errors.push(n + ': « # » внутри plain-скаляра стартует комментарий (inline-комментарии запрещены)');
    } else if (first === '#' || value === '-' || value.startsWith('- ')) {
      errors.push(n + ': plain-скаляр «' + key + '» начинается с индикатора (-/#) — вложенные списки в подмножестве запрещены');
    } else if ('?&*!|>%@`'.indexOf(first) !== -1) {
      errors.push(n + ': plain-скаляр не может начинаться с «' + first + '» (индикатор YAML)');
    }
  }
  if (mapping.length === 0 || mapping[0].indent !== 0) {
    errors.push('файл обязан быть верхнеуровневым маппингом (ключ: значение)');
  }
  return errors;
}

test('workflow: YAML — структурная валидация подмножества (без зависимостей)', () => {
  // Ревью раунда 3: - name: Сборка сайта (явная выборка: ...) —
  // неэкранированная «колонка+пробел» в plain-скаляре: PyYAML —
  // ScannerError 65:42, js-yaml — bad indentation 65:42. Файл
  // НЕПАРСИРУЕМ → GitHub: «Workflow is not valid», ни один job (и
  // тесты, и deploy) не запускается при каждом push. Строковые
  // ассерты синтаксис не видят — здесь структурная проверка.
  const yml = readWorkflow();
  const errs = yamlSubsetErrors(yml);
  assert.deepEqual(errs, [],
    'ci.yml не парсится как YAML: ' + errs.join(' | '));
});

test('yamlSubsetErrors: ловит «колонка+пробел» в plain-скаляре (прецедент ревью)', () => {
  // Регрессия-фиксатор самого проверщика: исходный баг (без кавычек)
  // обязан падать, исправленный вариант (значение в кавычках) — нет.
  const bad = 'jobs:\n  test:\n    steps:\n'
    + '      - name: Сборка (выборка: index + src)\n        run: npm test\n';
  const errs = yamlSubsetErrors(bad);
  assert.ok(errs.some((e) => e.includes('колонка+пробел')),
    'проверщик обязан поймать «: » в plain-скаляре: ' + errs.join(' | '));
  const good = 'jobs:\n  test:\n    steps:\n'
    + '      - name: "Сборка (выборка: index + src)"\n        run: npm test\n';
  assert.deepEqual(yamlSubsetErrors(good), [], 'исправленный вариант обязан быть чистым');
});

test('workflow: триггеры — push в master и ручной workflow_dispatch', () => {
  const yml = readWorkflow();
  assert.match(yml, /push:/, 'нет триггера push');
  assert.match(yml, /branches:?\s*[\[\n]\s*-?\s*master/,
    'push обязан триггериться веткой master (дефолтная ветка репозитория)');
  assert.match(yml, /workflow_dispatch:/,
    'нужен ручной запуск workflow_dispatch (перепубликация)');
});

test('workflow: concurrency — группа pages с отменой старых запусков', () => {
  const yml = readWorkflow();
  assert.match(yml, /concurrency:/, 'нет concurrency');
  assert.match(yml, /group:\s*pages/, 'concurrency.group обязан быть pages');
  assert.match(yml, /cancel-in-progress:\s*true/,
    'конкурентные деплои Pages должны отменяться (cancel-in-progress)');
});

test('workflow: job test существует и запускает npm test', () => {
  const yml = readWorkflow();
  assert.match(yml, /^ {2}test:/m, 'нет job с именем test:');
  assert.ok(yml.includes('npm test'), 'workflow обязан запускать npm test');
});

test('workflow: шаг «сборка» — дрейф-гейт sync-бандлов (red = рассинхрон)', () => {
  // После регенерации JS-зеркал обязана быть проверка дрейфа:
  // git-статус src/ непуст → CI красный. Без гейта сборка бессмысленна:
  // CI молча пересоберёт и опубликует, а ручные правки src/*-data.js
  // пройдут мимо.
  const yml = readWorkflow();
  assert.ok(/sync-all\.js\s+--check|npm run sync:check/.test(yml),
    'в CI обязан быть дрейф-гейт: sync-all.js --check (или npm run sync:check)');
});

test('workflow: деплой только после тестов (needs: test)', () => {
  const yml = readWorkflow();
  assert.match(yml, /needs:\s*test/,
    'deploy-джоб обязан быть needs: test (сломанный коммит не публикуется)');
});

test('workflow: Pages — permissions, environment, официальные actions', () => {
  const yml = readWorkflow();
  assert.match(yml, /pages:\s*write/, 'нет permission pages: write');
  assert.match(yml, /id-token:\s*write/,
    'нет permission id-token: write (OIDC, без токена)');
  assert.match(yml, /environment:\s*github-pages/,
    'deploy обязан использовать environment github-pages');
  assert.ok(yml.includes('configure-pages'), 'нет actions/configure-pages');
  assert.ok(yml.includes('upload-pages-artifact'),
    'нет actions/upload-pages-artifact');
  assert.ok(yml.includes('deploy-pages'), 'нет actions/deploy-pages');
});

test('workflow: path у upload-pages-artifact — ОДИН каталог, НЕ список', () => {
  // actions/upload-pages-artifact@v5: input path = «Path of the
  // directory containing the static assets» — ОДИН каталог; реализация
  // — tar --directory "$INPUT_PATH". YAML-массив
  // [ index.html, src, assets ] сериализуется в строку
  // «index.html, src, assets» — такого каталога нет → tar падает →
  // шаг загрузки артефакта детерминированно красный → deploy-pages
  // никогда не выполняется (ревью раунда 2).
  const yml = readWorkflow();
  const up = yml.indexOf('uses: actions/upload-pages-artifact');
  assert.ok(up !== -1, 'нет upload-pages-artifact');
  const win = yml.slice(up, up + 400);
  const m = win.match(/^ {10}path:\s*(.+)$/m);
  assert.ok(m, 'у upload-pages-artifact не задан path');
  const val = m[1].trim();
  assert.ok(!val.startsWith('['),
    'path НЕ может быть YAML-списком: input принимает один каталог: ' + val);
  assert.match(val, /^[\w][\w.-]*$/,
    'path обязан быть именем одного каталога (без пробелов): ' + val);
});

test('workflow: сборка сайта — явная копия index.html + src + assets в каталог артефакта', () => {
  // Состав сайта — явная выборка, а НЕ корень репозитория: иначе в
  // сайт попадут tasks/, memory/, tests/, scripts/, .github/. Копируется
  // ровно то, что игра реально читает: index.html (он ссылается только
  // на src/*.js) и assets/ (map.png, tiles/, sprites/, combat/bg/).
  // Каталог копирования обязан совпадать с path у upload-pages-artifact.
  const yml = readWorkflow();
  const up = yml.indexOf('uses: actions/upload-pages-artifact');
  assert.ok(up !== -1, 'нет upload-pages-artifact');
  const m = yml.slice(up, up + 400).match(/^ {10}path:\s*([\w][\w.-]*)\s*$/m);
  assert.ok(m, 'у upload-pages-artifact не задан path');
  const dir = m[1];
  assert.ok(new RegExp('cp\\s+index\\.html\\s+' + dir + '/').test(yml),
    'index.html обязан копироваться в ' + dir + '/');
  assert.ok(new RegExp('cp\\s+-r\\s+src\\s+' + dir + '/').test(yml),
    'src/ обязан копироваться в ' + dir + '/');
  assert.ok(new RegExp('cp\\s+-r\\s+assets\\s+' + dir + '/').test(yml),
    'assets/ обязан копироваться в ' + dir + '/');
});

test('SPEC: в сборку — каталоги с зеркалом (spells — с 000045), не «без зеркал»', () => {
  // Ревью раунда 2: SPEC не был актуализирован после мержа 000045 —
  // «mobs/spells/craft — зеркал не имеют» стало ошибкой: 000045 создал
  // src/spells-data.js + scripts/sync-spells-data.js (sync-all подхватил
  // автоматически). Фиксируем верный список, чтобы не откатить.
  const spec = fs.readFileSync(path.join(ROOT, 'SPEC.md'), 'utf8');
  const i = spec.indexOf('# CI и публикация на GitHub Pages');
  assert.ok(i !== -1, 'SPEC.md: нет раздела «CI и публикация на GitHub Pages»');
  const j = spec.indexOf('\n# ', i + 1);
  const sec = spec.slice(i, j === -1 ? spec.length : j);
  assert.match(sec, /npc, skills, затем buildings, spells, items, visuals/,
    'SPEC: список каталогов с JS-зеркалом обязан включать spells (000045)');
  assert.ok(!/mobs\/spells\/craft/.test(sec),
    'SPEC: spells ИМЕЕТ зеркало (000045) — не может числиться «без зеркал»');
});

test('workflow: setup-node с закреплённой версией node (не node раннера)', () => {
  const yml = readWorkflow();
  assert.match(yml, /setup-node/, 'нет actions/setup-node');
  const m = yml.match(/node-version:\s*["']?(\d{1,2})/);
  assert.ok(m, 'node-version не закреплён числом');
  assert.ok(Number(m[1]) >= 18, 'node-version слишком старый: ' + m[1]);
});

test('workflow: без npm ci / npm install (проект без зависимостей и lock-файла)', () => {
  // В CI npm ci упадёт: нет package-lock.json и зависимостей.
  // Носить devDependency (хоть YAML-парсер ради этого теста) тоже нельзя —
  // правило проекта «ноль зависимостей».
  const yml = readWorkflow();
  assert.ok(!/npm (ci|install)/.test(yml),
    'в CI нельзя npm ci / npm install: в проекте нет зависимостей и lock-файла');
});
