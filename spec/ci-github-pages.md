# CI и публикация на GitHub Pages
 * Workflow `.github/workflows/ci.yml` (триггеры: push в master + ручной
   `workflow_dispatch`; `concurrency` — группа `pages` с отменой старых
   запусков). Job `test`: `npm test` + проверка дрейфа JS-зеркал
   (`node scripts/sync-all.js --check`) — публикация идёт только с
   зелёными тестами и синхронными бандлами. Job `deploy-pages`
   (`needs: test`): собирает сайт в `dist/` (явная копия `index.html` +
   `src/` + `assets/` — НЕ корень репозитория: в сайт не попадают
   tasks/, memory/, tests/, scripts/, spec/, .github/) и публикует ОДИН
   каталог `dist/`: input `path` у `actions/upload-pages-artifact`
   принимает только один каталог (реализация — `tar --directory`),
   список в `path` сериализуется в несуществующий путь и ломает деплой
   — через `actions/deploy-pages` (environment `github-pages`;
   permissions `pages: write` + `id-token: write` — OIDC, без токена).
 * npm-скрипты: `npm run sync:all` — регенерация всех JS-зеркал из
   JSON-каталогов + отчёт «что изменилось, закоммитьте / синхронно»;
   `npm run sync:check` — то же + ошибка при рассинхроне (используется
   в CI как дрейф-гейт).
 * Конвенция синк-скриптов (общий идемпотентный интерфейс для CI):
   скрипт синхронизации каталога — `scripts/sync-*.js`, без внешних
   зависимостей, идемпотентный (повторный запуск byte-идентичен),
   вход — `assets/<каталог>/*.json`, выход — `src/<имя>-data.js`.
   Выход пишется АТОМАРНО (`scripts/lib/write-atomic.js`: tmp-файл в
   том же каталоге + `rename`) — параллельные читатели (файлы `npm test`
   гоняются `node --test` параллельно и делают top-level
   `require('../src/*-data.js')`) не видят частичный файл.
   `scripts/sync-all.js` находит синк-скрипты по конвенции имён
   автоматически — новые каталоги (buildings — задача 000055; items,
   visuals — задача 000059) подключаются к CI без изменения workflow.
   Генераторы `gen-*.js` (generate-map-png.js, gen-combat-bg.js)
   синк-скриптами не являются.
 * «Сборка» в CI — это sync-скрипты + дрейф-гейт, а не бандлер: в
   JS-бандлы попадают только каталоги, имеющие JS-зеркало под file://
   (npc, skills, затем buildings, spells, items, visuals, portraits);
   mobs/craft — данные живут в коде, зеркал не имеют, в сборку не
   участвуют. (spells — зеркало `src/spells-data.js`, задача 000045;
   items/visuals — задача 000059; portraits — задача 000142.)
 * Дрейф-чек ограничен `git status --porcelain -- src/` (конвенция
   «выход — src/<имя>-data.js» обязательна). Незакоммиченные локальные
   правки в src/ тоже краснят `sync:check` — это подсказка, а не ошибка
   (`--check` не переписывает их молча; обычный режим exit 0).
   Git недоступен (до старта или в процессе) → предупреждение: в
   `--check` дрейф-чек пропускается и «синхронно (…совпадают)» НЕ
   утверждается — не проверено; в обычном режиме отчёт «синхронно
   (ничего не изменилось)» НЕ выдаётся — вместо него предупреждение,
   что список изменений не собран (локальный режим, exit 0; в CI git
   всегда доступен).
 * Node в CI закреплён (`actions/setup-node`, node-version 22);
   `npm ci`/`npm install` в workflow нет — в проекте ноль зависимостей
   и нет package-lock.json (если появятся зависимости — нужен шаг
   `npm ci`; состав сайта — явная копия в `dist/`, новый корневой файл
   (favicon и т.п.) надо добавлять в шаг сборки сайта).
 * Формат `ci.yml` зафиксирован тестами tests/ci.test.js (ноль
   зависимостей — YAML-парсера нет, только строковые ассерты):
   flow-список (`branches: [ master ]`), `path: dist` у
   upload-pages-artifact (ОДИН каталог — input action'а, не список) и
   `environment: github-pages` в строковой форме не переформатировать.
 * После пуша (пуш делает пользователь; в репозитории git push запрещён):
   Settings → Pages → Build and deployment → Source: GitHub Actions
   (ветку выбирать не нужно — деплой делает workflow); токен не нужен
   (OIDC); первый деплой создаёт environment `github-pages`
   автоматически; сайт — `drons.github.io/thegame`.

