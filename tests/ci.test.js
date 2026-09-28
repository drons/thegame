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
// Ограничение (memory): в проекте ноль npm-зависимостей, YAML-парсера
// нет — проверяем workflow статически, строковыми/regex-ассертами
// (прецедент — tests/index-order.test.js). Формат ci.yml поэтому
// фиксируем: flow-списки ([master], [index.html, src, assets]).

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

test('workflow: состав артефакта — index.html + src + assets (и ничего лишнего)', () => {
  // Публикуем явный список, а не корень репозитория: иначе в сайт
  // попадут tasks/, memory/, tests/, scripts/, .github/. Всё, что игра
  // реально читает: index.html (он ссылается только на src/*.js) и
  // assets/ (map.png, tiles/, sprites/, combat/bg/).
  const yml = readWorkflow();
  const up = yml.indexOf('upload-pages-artifact');
  assert.ok(up !== -1, 'нет upload-pages-artifact');
  const win = yml.slice(up, up + 400);
  assert.match(win, /path:/, 'у upload-pages-artifact не задан path');
  for (const p of ['index.html', 'src', 'assets']) {
    assert.ok(win.includes(p), 'в пути артефакта нет: ' + p);
  }
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
