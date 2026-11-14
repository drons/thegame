# 000384 — канон порядка зеркала skills: дизайн-порядок = ключи замороженного реестра

Находка ретро-b23 (П1): мерж 000318.09 перефлипнул `src/skills-data.js`
компаратором по `data.id` на алфавит. `src/ui-tab-skills.js` итерирует
зеркало БЕЗ собственного sort ⇒ панель [I] «Навыки» пересортировалась
видимо и без CHANGELOG; `sanitizeSavedHero` (src/player.js) строил
`primary` в порядке зеркала и разошёлся с `PRIMARY_KEYS` (src/sheet.js,
контракт 000031 «порядок создания героя = байты сейва»).

## 1. Канон

- **Порядок записей зеркала = ПОРЯДОК КЛЮЧЕЙ замороженного реестра
  `tests/scripts/skills-num2id-000318.09.json`** (ключи 000001..000044
  идут ровно в дизайн-порядке numeric-эпохи). Не порядок readdir и не lex:
  имена файлов уже slug, порядок читать из реестра.
  - Основные: strength, dexterity, constitution, intelligence, wisdom,
    charisma.
  - Вторичные (по реестру): swordsman, heavy, fists, forge, back,
    accuracy, catseye, step, archer, acro, thief, hide, endurance, golem,
    breath, unkill, firelord, icelord, alchemy, scholar, runes, perception,
    meditation, precog, nature, elder, merchant, orator, leader, artist,
    fright, **staff (000044 — последний)**.
  - Школы: protection, healing, ice, fire, nature_school, shadow
    (≡ контракт порядка 000301 вкладок [B] и spec/skills.md).
- Реализация: `scripts/sync-skills-data.js` читает реестр, строит
  `DESIGN_POS` (Map id→позиция), сортирует известные id по позиции.
- **Фолбэк для id вне реестра — «в конец по lex»** (стабильно между собой).
  Директива «реестр НЕ расширять» (memory/000318-asset-rename.md §5)
  остаётся в силе; фолбэк достижим только до механизма роста реестра
  (задача 000387) — свип SO6 пинует, что реестр покрывает каталог
  (44/44), т.е. сегодня фолбэк недостижим.
- **Страж канона:** отсутствие/нечитаемость реестра → `console.error` +
  `exit 1` (иначе компаратор тихо деградирует в lex — ровно регрессия .09).
  Guard'ы порядка: чтение реестра идёт ПОСЛЕ цикла resolve полей —
  битый каталог (skills-refs SR8) обязан красныйеть по проверяемой
  причине «не ссылка», а не по отсутствию реестра.

## 2. Единый источник порядка primary (сейв)

- `src/sheet.js` экспортирует `PRIMARY_KEYS` (публичный API модуля Sheet;
  комментарий-контракт :56 не двигался).
- `src/player.js` `sanitizeSavedHero` обходит `sheet.PRIMARY_KEYS`
  (ранее — `PRIMARY_SKILLS` зеркала). Валидационная семантика («все шесть
  конечные ≥1, иначе null») сохранена посимвольно.
- **ВЗАИМОПОКРЫТИЕ двух половин починки:** после фикса зеркала мутация
  «вернуть sanitize на обход PRIMARY_SKILLS» ПОВЕДЕНЧЕСКИ неотличима
  (оба порядка дизайн) — ловит только структурный зуб SO3. Честно:
  байтовый round-trip SO2 эту мутацию НЕ красит.

## 3. Карта зубов порядка (все — новые или ре-пиннутые в этом коммите)

- `tests/skills-save-order-000384.test.js` SO1–SO6 (маркер «000384 SO»):
  экспорт PRIMARY_KEYS / байтовый round-trip / структура sanitize /
  структура sync (читает реестр) / tmp-страж (без реестра exit 1, с
  реестром exit 0) / порядок зеркала + свип покрытия реестром.
- `tests/ui-skills.test.js` — аддитивный зуб DOM-порядка панели [I]:
  кнопки первых строк ≡ дизайн-primary; секции вторичных — владельцы по
  порядку основных, внутри группы id-поток по реестру (staff в конце
  strength-группы); школы — резолв name→id через ЖИВОЙ SCHOOLS (пин по
  id, НЕ по переводу) ≡ protection…shadow.
- `tests/skills-rename-000318.09.test.js` — ре-пины: T2 (lex→реестровый
  порядок, шапка-ranges strength…charisma / swordsman…staff /
  protection…shadow), T6 (+игла «читает реестр»), T7 (`runSyncOn` возит
  копию реестра в tmp; mini-фикстура alpha/zeta/mid вне реестра →
  фолбэк tail-lex, ожидаемые ['alpha','zeta'] целы), T10 (сверка
  МНОЖЕСТВОМ переживает порядок, правка только формулировки).
  T1/T3/T11 НЕ тронуты — механика реестра это скоуп 000387.
- `tests/magic-schools-000324.test.js` — SCHOOLS_LEX УДАЛЁН; B1/C1/C3
  пинуют SCHOOLS_EXPECTED (= дизайн ≡ 000301); B2/B3 возят реестр
  (`withRegistry`).
- `tests/skills.test.js` — `loadCatalog()` собирает `byId` в порядке
  реестра (extras — хвост lex); «точное зеркало» зелёна по построению.
- `tests/skills-refs.test.js` — SR6/SR7 возят реестр; SR8 НЕ меняется
  (ловит и порядок guard'ов: реестр читается после resolve).

## 4. tmp-дерево с sync — обязательный инвариант

Любое tmp-дерево, где sync-skills-data.js должен завершиться exit 0,
обязано содержать `tests/scripts/skills-num2id-000318.09.json` (копию):
skills-rename runSyncOn, magic-schools B2/B3, skills-refs SR6/SR7,
SO5 dirB. Пропуск = exit 1 по стражу (краснота НЕ по проверяемой причине).
SO5 dirA — намеренно БЕЗ реестра (негативный страж).

## 5. Что специально НЕ менялось

- `src/ui-tab-skills.js` — порядок берётся из зеркала (код не трогать;
  зуб панели — тестовый).
- `src/spellbook.js` / `src/combat.js` SCROLL_SCHOOLS — свои литералы
  (вкладки [B] не ломались); `src/companions.js` PRIMARY_IDS — свой
  литерал (не пострадал).
- Замороженный реестр — read-only; `spec/` 0-diff (плечо spec/skills.md:119
  закрыто 000378); golden/rng 0-diff (skills вне rng-пулов — по-прежнему
  верно, см. урок про blast-radius); assets/ 0-diff; index.html 0-diff.
- CHANGELOG — ровно один буллет «### Интерфейс» (восстановление книжного
  порядка панели «Навыки»).

## 6. Легальная пред-коммитная краснота (саморезолвится коммитом)

- `items-rename-000318.08` T8: сравнивает `src/skills-data.js` побайтово
  с git HEAD — красна на ГРЯЗНОМ дереве (прецедент HEAD-guard класса
  .08/.09/.321.08).
- `sync:check` (sync-all --check) отказывает на грязном src/ — зелёный на
  чистом закоммиченном дереве.
