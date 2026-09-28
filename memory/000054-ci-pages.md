# 000054: GitHub CI (тесты + «сборка» JSON-каталогов) и публикация на Pages

Статус: реализовано (задача в pending → done переносится на Finalize
вместе с tasks/result/000054.md). Пуш НЕ выполнялся — его делает
пользователь.

## Что сделано

* `scripts/sync-all.js` — общий запуск синк-скриптов + дрейф-гейт:
  * `listSyncScripts(root)` — имена `scripts/sync-*.js` по конвенции
    (sorted; gen-*.js и сам себя не включает) — новые каталоги
    (buildings 000055; items/visuals 000059) подключатся к CI
    автоматически, workflow не меняется;
  * `runAll(root, {check})` → `{ code, output, changed }`: прогон
    синк-скриптов по очереди (spawnSync node), ошибка любого = fail;
    дрейф — `git status --porcelain -- src/` (конвенция «выход —
    src/<имя>-data.js»); git недоступен → предупреждение, чек пропущен;
  * CLI: `node scripts/sync-all.js [--check] [root]`. `--check`:
    незакоммиченные правки src/ ДО регенерации → exit 1 и файлы НЕ
    переписываются (не разрушаем чужую работу); дрейф ПОСЛЕ регенерации
    (сценарий CI) → exit 1 с именами файлов. Обычный режим: регенерация,
    отчёт «изменилось N / синхронно», exit 0.
* `.github/workflows/ci.yml` — «CI и Pages»: push в master +
  workflow_dispatch; concurrency group pages, cancel-in-progress.
  Job test: checkout@v7, setup-node@v7 (node-version 22), npm test,
  node scripts/sync-all.js --check. Job deploy-pages (needs: test):
  environment github-pages, permissions pages:write + id-token:write
  (OIDC, без токена), configure-pages@v6, upload-pages-artifact@v5
  (path: [ index.html, src, assets ] — явный список, не корень),
  deploy-pages@v5. npm ci/install нет (ноль зависимостей, нет
  lock-файла).
* package.json: `sync:all`, `sync:check`.
* SPEC.md: раздел «CI и публикация на GitHub Pages» (после
  «Запуск и тесты») — workflow, npm-скрипты, конвенция sync-*.js,
  ограничение дрейф-чека, инструкция после пуша.
* Красные тесты (стадия Red, коммит 735caa9): tests/ci.test.js,
  tests/sync-all.test.js.

## Фиксированные решения / ограничения

* «Сборка» assets/*/*.json в CI — НЕ бандлер, а sync-скрипты +
  дрейф-гейт: в бандлы только каталоги с JS-зеркалом под file://
  (npc, skills, затем buildings, items, visuals); mobs/spells/craft —
  данные в коде, зеркал не имеют.
* Формат ci.yml зафиксирован строковыми ассертами tests/ci.test.js
  (YAML-парсера нет — ноль зависимостей): flow-списки
  (`branches: [ master ]`, `path: [ index.html, src, assets ]`),
  `environment: github-pages` в строковой форме — НЕ переформатировать.
* Версии action-мажоров сверены с GitHub (2026-09): checkout@v7,
  setup-node@v7, configure-pages@v6, upload-pages-artifact@v5,
  deploy-pages@v5. Тесты проверяют presence шагов, не версии —
  при обновлении major-тегов workflow правится руками.
* Состав артефакта — явный список: новый корневой файл (favicon и т.п.)
  надо добавлять в `path` у upload-pages-artifact. logo.json не
  публикуется (ниоткуда не читается).
* Если появятся npm-зависимости — в workflow добавить `npm ci`
  (сейчас её тест запрещает).

## Инструкцию пользователю после пуша (дублируется в tasks/result)

1. Пушнуть мастер в GitHub: `git push origin master`
   (репозиторий — github.com:drons/thegame; в worktree пуш запрещён).
2. GitHub → Settings → Pages → Build and deployment → Source:
   **GitHub Actions** (ветку выбирать не нужно — деплой делает
   workflow; вариант «Deploy from a branch» выбирать НЕ надо).
3. Токен не нужен (OIDC; permissions заданы в workflow).
4. Первый деплой создаёт environment `github-pages` автоматически.
5. Сайт: https://drons.github.io/thegame
6. Workflow — `CI и Pages` (ci.yml): триггеры — push в master +
   ручной «Run workflow» (workflow_dispatch, перепубликация).
   Публикация идёт только при зелёных тестах и синхронных бандлах.
   Пока Pages не включён, job deploy-pages будет падать с ошибкой
   Pages/OIDC — это ожидаемо до шага 2.
