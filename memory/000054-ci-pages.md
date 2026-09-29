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
  (OIDC, без токена): сборка сайта в dist/ (явная копия
  index.html + src + assets — не корень репозитория),
  configure-pages@v6, upload-pages-artifact@v5 (path: dist — ОДИН
  каталог; input не принимает список), deploy-pages@v5. npm ci/install
  нет (ноль зависимостей, нет lock-файла).
* package.json: `sync:all`, `sync:check`.
* SPEC.md: раздел «CI и публикация на GitHub Pages» (после
  «Запуск и тесты») — workflow, npm-скрипты, конвенция sync-*.js,
  ограничение дрейф-чека, инструкция после пуша.
* Красные тесты (стадия Red, коммит с темой «Задача 000054: красные
  тесты» — хэш не фиксируем: смещается при ребейзах): tests/ci.test.js,
  tests/sync-all.test.js.

## Правки по итогам ревью (раунд 1)

* Гонка write/require под параллельным `node --test` (редкий ложный
  красный CI): тест `CLI: дрейф src/npc-data.js` мутирует реальный
  `src/npc-data.js`, sync-скрипты неатомарно переписывают
  `src/npc-data.js`/`src/skills-data.js`, а top-level
  `require('../src/npc-data.js')` (tests/npc-data.test.js) /
  `require('../src/skills-data.js')` (tests/skills.test.js) в
  параллельных файлах тестов мог попасть в окно записи и прочитать
  частичный файл. FIX — ВСЕ записи в реальные зеркала атомарны:
  новый общий модуль `scripts/lib/write-atomic.js` (tmp-файл в том же
  каталоге — rename только внутри одной fs — + `fs.renameSync`;
  tmp-имя — скрытый dotfile `.<имя>.<pid>-<rand>.tmp`), используют
  sync-npc-data.js, sync-skills-data.js и сам тест (drift-маркер и
  restore). Тест также проверяет, что в src/ не остаётся `*.tmp`.
  Конвенция «выход пишется атомарно» зафиксирована в SPEC — новые
  sync-скрипты (000055/000059) обязаны её соблюдать.
* sync-all.js, обычный режим, git недоступен: был вводящий в
  заблуждение отчёт «синхронно (ничего не изменилось)» (предупреждение
  было только в --check). FIX: `gitStatusSrc` → null после
  регенерации → предупреждение «git недоступен — список изменений не
  собран; проверьте `git status`…», exit 0. Зафиксировано в SPEC и
  покрыто тестом (каталог вне git-репозитория = тот же путь кода).

## Правки по итогам ревью (раунд 2)

* scripts/sync-all.js, `--check`, git недоступен (до старта ИЛИ
  умер в процессе: `!gitOk || gitDown`): вывод оканчивался
  «синхронно (JSON-каталоги и JS-зеркала совпадают)» — утверждение
  без какой-либо проверки, противоречащее предупреждению
  «дрейф-чек пропущен». FIX: в этой ситуации в `--check` вместо
  «синхронно» — предупреждение «дрейф-чек не выполнен, синхронность
  НЕ подтверждена (локальный режим)», exit 0 (гейт — для CI, где git
  всегда доступен; локально fail-open по задокументированному
  дизайну). Для моделирования «git умер в процессе» в runAll
  добавлен опциональный хук `opts.gitStatus` (замена gitStatusSrc).
  Зафиксировано в SPEC; тесты: каталог вне git-репозитория (тот же
  путь кода) + flaky-хук в tmp-репозитории.
* tests/sync-all.test.js, тест «CLI: дрейф src/npc-data.js»: после
  регенерации требовал `git status --porcelain -- src/` == '' для
  ВСЕГО дерева — незакоммиченная правка любого другого файла src/
  (например, src/main.js в работе) при локальной разработке делала
  npm test ложно красным. FIX: тест сравнивает множество изменённых
  файлов src/ до и после себя (gitStatusSrc до старта и после
  finally) — регенерация byte-идентична, чужие локальные правки не
  повод для красного; прединд — git доступен.

## Правки по итогам ревью (раунд 2)

* Публикация на Pages никогда не работала: input `path` у
  actions/upload-pages-artifact@v5 — «Path of the directory containing
  the static assets», ОДИН каталог; реализация —
  `tar --directory "$INPUT_PATH"`. YAML-список
  `[ index.html, src, assets ]` сериализуется в строку
  «index.html, src, assets» — такого каталога нет → tar падает → шаг
  загрузки артефакта детерминированно красный → deploy-pages не
  выполняется (сверено с исходником v5). Строковые тесты
  tests/ci.test.js фиксировали именно сломанную форму. FIX: шаг
  «Сборка сайта» в deploy-pages явно копирует index.html + src +
  assets в dist/ (состав тот же: НЕ корень репозитория — tasks/,
  memory/, tests/, scripts/, .github/ не попадают) и
  upload-pages-artifact грузит ОДИН каталог `path: dist`. Тесты
  фиксируют: path — одно имя каталога (не список) и копирование
  index.html/src/assets в тот же каталог.
* sync-buildings-data.js (master, 000055) и sync-spells-data.js
  (master, 000045) писали выход неатомарным fs.writeFileSync —
  нарушение конвенции «выход пишется атомарно» (SPEC + этот файл).
  Последствие: тест «CLI: дрейф src/npc-data.js» под npm test спавнит
  sync-all.js, который регенерирует ВСЕ зеркала (включая
  src/buildings.js / src/spells-data.js), а tests/buildings.test.js /
  tests/spells.test.js делают top-level require в параллельных
  процессах node --test → окно частичного файла → редкий ложный
  красный CI. FIX: оба скрипта переведены на writeFileAtomic
  (scripts/lib/write-atomic.js). Тест «конвенция: ВСЕ sync-скрипты
  пишут выход атомарно» (tests/sync-all.test.js) покрывает и
  БУДУЩИЕ скрипты 000059 (items/visuals) — по конвенции имён
  подхватятся автоматически.
* SPEC.md не был актуализирован после мержа 000045: «mobs/spells/
  craft — зеркал не имеют» — фактическая ошибка (spells с 000045 имеет
  src/spells-data.js + scripts/sync-spells-data.js). FIX: список
  каталогов с зеркалом — (npc, skills, затем buildings, spells,
  items, visuals); mobs/craft — без зеркал. Зафиксировано тестом в
  tests/ci.test.js.
* assets/items и assets/visuals в сборку не участвуют — принятое
  решение (отсрочка в pending 000059, «привести все sync-скрипты к
  единому интерфейсу»). Атомарность новых sync-скриптов 000059
  обеспечена тестом-конвенцией (пункт выше).

## Правки по итогам ревью (раунд 3)

* .github/workflows/ci.yml — файл был НЕПАРСИРУЕМ как YAML:
  `- name: Сборка сайта (явная выборка: index.html + src + assets →
  dist/)` — неэкранированная «колонка+пробел» внутри plain-скаляра
  (PyYAML: ScannerError 65:42; js-yaml: bad indentation 65:42 —
  сверено двумя независимыми парсерами). Последствие детерминированное:
  GitHub отклоняет workflow («Workflow is not valid»), НИ ОДИН job не
  запускается — ни тесты, ни deploy. FIX: значение name: закрыто в
  двойные кавычки (после правки файл парсится чисто, структура
  сверена: steps, path: dist, branches: [master]).
* tests/ci.test.js — строковые ассерты синтаксис НЕ видели (именно
  этот пробел пропустил ошибку). FIX: структурная проверка
  YAML-подмножества `yamlSubsetErrors` (без npm-зависимостей):
  «колонка+пробел» в plain-скаляре, незакрытые кавычки/flow-
  коллекции, « # » в plain-скаляре, дублирующиеся ключи в маппинге,
  строки-не-«ключ: значение», граница блок-скаляра (|). Подмножество
  зафиксировано: ci.yml обязано избегать multiline flow-коллекций и
  inline-комментариев; значения с «:» — в кавычках. Тест-фиксатор:
  исходная сломанная строка падает, кавычная — чистая.
* memory: «коммит 735caa9» — такого хэша в ветке нет (сместился при
  ребейзах) — ссылка теперь по теме коммита; «logo.json не
  публикуется» — неточно: в репозитории assets/logo.svg, и он
  публикуется вместе с assets/.

## Фиксированные решения / ограничения

* «Сборка» assets/*/*.json в CI — НЕ бандлер, а sync-скрипты +
  дрейф-гейт: в бандлы только каталоги с JS-зеркалом под file://
  (npc, skills, затем buildings, items, visuals); mobs/spells/craft —
  данные в коде, зеркал не имеют.
* Формат ci.yml зафиксирован tests/ci.test.js: структурной проверкой
  YAML-подмножества (yamlSubsetErrors — ноль зависимостей, полного
  парсера нет) + строковыми ассертами: flow-список
  (`branches: [ master ]`), `path: dist` у upload-pages-artifact
  (ОДИН каталог, НЕ список — input action'а принимает только
  каталог, реализация tar --directory), `environment: github-pages`
  в строковой форме — НЕ переформатировать.
* Версии action-мажоров сверены с GitHub (2026-09): checkout@v7,
  setup-node@v7, configure-pages@v6, upload-pages-artifact@v5,
  deploy-pages@v5. Тесты проверяют presence шагов, не версии —
  при обновлении major-тегов workflow правится руками.
* Состав сайта — явная копия в dist/ (шаг «Сборка сайта»): новый
  корневой файл (favicon и т.п.) надо добавлять в этот шаг.
  `path` у upload-pages-artifact остаётся `dist`. (assets/logo.svg
  публикуется — он в assets/.)
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
