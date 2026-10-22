# Задача 000240 — flame_step × free_cast (000230.17) — пины (tests-only)

База: master 1c5aaec (после мержа 000235.09). Тип: tests-only, НОЛЬ src.
Источник: finding #3 (major, линза «Тесты») tasks/result/000235.07-retro-20261022.md.
Поведение в коде УЖЕ корректно — новые кейсы зелёные с первого запуска
(ТЗ «Тесты»); «краснота» = временная НЕКОММИТЯЩАЯСЯ мутация строк ветки.

## 1. Что зафиксировано (пин-цели)

src/spells.js, `castOutOfCombat`, ветка `if (spellId === 'flame_step' ||
spellId === 'shadow_step')`:
- `:843` — условие ветки; ОБЩАЯ для flame_step И shadow_step (000235.09).
  ТЗ написан до .09 и называет flame_step — пиним flame_step по ТЗ;
  явный shadow-кейс НЕ добавляем (не ТЗ).
- `:844` `const free = isHeroFreeCast(p, spellId);` — СОБСТВЕННАЯ
  дублирующая free-проверка ветки; именно эта строка вручную резолвлена
  в конфликте ребейза 000235.07 без пина (ретро «Финальный мерж»).
- `:845-848` — мана-чек: `if (!free && (typeof p.mp !== 'number' ||
  p.mp < (spell['мани'] || 0))) return { ok: false, reason: 'не хватает маны' }`.
- `:849-862` — ctx → cb `flameStep`/`shadowStep`; вызов cb ПОСЛЕ мана-чека
  (порядок мутаций: каталог → книга → вне_боя → days → free/мана → cb →
  списание); отказ cb → reason пробрасывается, списания ещё нет.
- `:863` `if (!free) p.mp -= spell['мани'] || 0;` — списание только после
  успешного cb.
- `:864` `return { ok: true, spell, expiresDay: null };` — ветка early-
  return ДО общего пути: в outOfCombatEffects записей НЕ создаётся.

Общий путь (`:866` `const free = isHeroFreeCast(p, spellId);`, `:878`
списание) — условия, reason и порядок мутаций БИТ-В-БИТ идентичны ветке.
Семантического расхождения НЕТ → ограничение ТЗ «создать отдельную задачу
на согласование» НЕ сработало, задача не создаётся.

flame_step = src/spells-data.js:733-749 (000042.json): `мани: 7`,
`действие: 'телепорт'`, `вне_боя: true`, `параметры` нет (outOfCombatDays
null), `уровень: 2`. ТЗ-«< 7» совпадает с каталогом.

## 2. Почему VM (и почему node-пин невозможен)

- Реальный каталог НЕ содержит free_cast-предмета с flame_step: всего 6
  free_cast-предметов (src/items-data.js:1194/1222/2082/2438/2781/2812 —
  mend / light_heal / ward / greater_heal / heat_shield / stone_skin,
  все боевые).
- Каталог items.js — приватный Map, строится при ЗАГРУЗКЕ; `DATA.ITEMS`
  читается один раз — шва пост-load-инъекции НЕТ. → в plain-require мире
  `isHeroFreeCast(p, 'flame_step') === true` недостижим (прецедент
  memory/000230.17-oc-freecast.md §5 «позитивный node-кейс невозможен»).
- Единственный путь — vm-песочница с фикстурой `Game.ITEMS` ДО load
  items.js (домашний паттерн FC1–FC8, tests/spellbook-oc-freecast.test.js).
  flame_step — КАТАЛОЖНЫЙ спелл (реальный spells-data.js в цепи) →
  гость-инъекция НЕ нужна (отличие от 000230.17, где гость был нужен).

Ленивые ссылки/guards (не трогаем, фиксируем): isHeroFreeCast
(src/spells.js:357-377) — node: `itemsThunk()` = require('./items.js')
(кэш heroItemsApi); browser/vm: `rootRef.Game.equipmentAffixes` (call-time).
equipmentAffixes (src/items.js:1410-1433) — ЧИСТАЯ, raw-read p.equipment,
итерация EQUIP_PHYS_SLOTS (ring_left_1 ∈), affixes[].spell → freeCast Set.
Деградация без items-API — молчаливый false (тихий платный путь, FC6).

## 3. Тесты (2 test()-блока, имя-префикс `000240 W-10a`, EOF файла)

Файл: tests/spells.test.js, APPEND в EOF (после блока '000235.09 W-15',
после строки 4591 базы) — EOF-паттерн файла (.07/.08/.09 дописаны по
порядку мержей). ТЗ п.1 «рядом с W-10a-кейсами» vs ограничение
«дописать в ... W-10a-секцию (EOF-паттерн файла)» — решено в пользу EOF
(явное упоминание в ограничении + конвенция файла + vm-хелперы не
входят в чужой plain-node-блок). Существующие W-10a-кейсы (:3365-3423)
не трогаются ни одной строкой.
Топ-уровень файла — НУЛЕВОЙ diff: assert(:17), fs(:18), path(:19),
vm(:1017, модульный const) уже требуются; повторный require/const в EOF
запрещён (дубль). Топ-уровенного `ROOT` в spells.test.js НЕТ (только
E1_ROOT) — хелперы строят путь инлайн: path.join(__dirname, '..', 'src', f).
Имена хелперов — с суффиксом 240 (нет коллизий с топ-уровнем).
Локальные хелперы в EOF-секции (дубли loadVm/fcRing/hero из
tests/spellbook-oc-freecast.test.js, путь к src через path.join(__dirname,
'..', 'src', f)):
- `loadVm240(fixtures)` — цепь FULL_CHAIN дубль 000230.17:
  [global-settings, perlin, map, skills-data, sheet, player, items,
  combat, spells-data, spells]; `sandbox.Game.ITEMS = fixtures` перед
  items.js; errors — console.error-коллекция.
- `fcRing240(id, spell)` — форма ПОБайТОВО как fcRing (прецедент F1,
  проходит validateItem): `{ id, name: 'Тестовое кольцо', kind: 'ring',
  slot: 'ring', weight: 0.1, value: 30, desc: 'т', affixes:
  [{ type: 'free_cast', spell }] }`.
- `hero240(G, { mp, equipment })` — G.createCharacter(), p.spells =
  ['flame_step'], p.mp = mp, p.equipment (опц.).
spy — host-функция в ctx (`flameStep: () => { calls += 1; return
{ ok: true }; }`), вызывается из vm (прецедент teleport-spy FC7/FC8);
ассерты — только примитивы (ok/expiresDay/mp/calls/undefined) — без
fromVm (vm-realm, прецедент items.test.js:963); формат cb-аргументов —
как в W-10a (позиции не передаются).

1. ГЛАВНЫЙ ПИН:
   test('000240 W-10a (vm): flame_step × free_cast — hero с кольцом
   free_cast «flame_step», mp 2 < 7: каст УДАЁТСЯ (ok:true, expiresDay
   null), mp НЕ изменилась (2), cb ровно 1 раз, записей нет — пин :844/
   :863 ветки flame_step (ретро 000235.07 finding #3)'):
   fixtures [fcRing240('x240_fs', 'flame_step')]; hero mp 2 (< 7),
   equipment { ring_left_1: 'x240_fs' }.
   Ассерты: deepEqual(errors, []) (load-clean); r.ok === true;
   r.expiresDay === null; p.mp === 2 (НЕ 23/−5 — ПИН); calls === 1
   (телепорт выполнен); p.outOfCombatEffects === undefined (записей нет).
2. КОНТРОЛЬ + ПИН СПИСАНИЯ:
   test('000240 W-10a (vm): flame_step × free_cast — контроль: кольцо
   free_cast «mend» (аффикс не на flame_step), mp 2 → «не хватает маны»
   ДО cb (calls 0, mp 2); mp 30 → mp 23 (paid); без экипировки, mp 2 →
   отказ; кольцо «flame_step», mp 30 → mp 30 (не 23) — free-проверка не
   «всегда true» и не «любые affixes»'):
   fixtures [fcRing240('x240_mend', 'mend'), fcRing240('x240_fs',
   'flame_step')]; одна песочница, 4 саб-кейса:
   (a) кольцо 'mend' (аффикс НЕ на flame_step), mp 2 → r.ok false,
       r.reason 'не хватает маны' (побайто), calls 0, p.mp 2,
       outOfCombatEffects undefined — free-проверка не «всегда true»,
       проверка по spellId, не «есть affixes»; дифференциал с пин-1 при
       ОДИНАКОВОМ mp 2;
   (b) кольцо 'mend', mp 30 → r.ok true, p.mp 23 (30−7), calls 1 —
       paid-списание при экипировке без free_cast-flame_step (не
       «экипировка = free всё»);
   (c) БЕЗ equipment, mp 2 → r.ok false, 'не хватает маны', calls 0,
       mp 2 — само-достаточность блока (дубль голых W-10a-кейсов
       :3397-3421, но в free-контексте; выживет при вырезании чужих);
   (d) кольцо 'flame_step', mp 30 → r.ok true, p.mp === 30 (НЕ 23) —
       независимый якорь :863 в высоком mp-регионе.

## 4. Чувствительность (стадия Тесты; мутацию НЕ коммитить)

- MUT1: src/spells.js:844 → `const free = false;` (или выкинуть `!free &&`
  в :845) → главный пин RED: r.ok false, reason 'не хватает маны',
  calls 0 (роняет ok-ассерт).
- MUT2: src/spells.js:863 → `p.mp -= spell['мани'] || 0;` без условия →
  главный пин RED ровно на mp-ассерте (expected 2, actual −5 = 2−7) —
  именно «mp-ассерт» ТЗ.
- Контроль-блок: саб-кейсы (a)–(c) GREEN при обеих мутациях (не
  дискриминаторы — по замыслу: пинят «не всегда true», мутации бьют по
  free-пути); саб-кейс (d) (кольцо flame_step, mp 30) RED при ОБЕИХ —
  независимый якорь :863 в высоком mp-регионе (зафиксировано прогоном).
- Пара ассертов (ok + mp + calls) ловит ОБЕ строки :844/:863 → пин робастен.
- Откат: `git checkout -- src/spells.js`; обязательный `git status --short`
  = пустой перед коммитом (коммит tests-only, src бит-в-бит).
- Верифицировано в /tmp-копии: /tmp/thegame-wf-000240/verify (шаблон
  tests/smoke-000240.test.js — 2/2 pass с первого запуска; MUT1/MUT2 →
  RED; src восстановлен бит-в-бит).

## 5. Решения «в анализе»

- vm вместо node-require: реальный каталог 6 free_cast-предметов — все
  боевые, flame_step нет; шва инъекции в node-каталог нет; канонический
  прецедент FC1–FC8 зелёный на HEAD (memory/000230.17-oc-freecast.md §5).
- e2e-зеркало W-10b (ТЗ п.3, «опционально, решение в анализе») —
  СКРАПЛЕНО: (a) целевые строки :844/:863 полностью держатся vm-пинами,
  а performFlameStep (main.js) mp не трогает → e2e не добавляет нового
  пина; (b) bootSandbox (tests/spellbook-oc-e2e.test.js) грузит реальную
  цепочку index.html с реальным items-data.js — хука Game.ITEMS нет,
  фикстура потребовала бы правки ОБЩЕГО full-boot-харнеса (риск чужим
  e2e-кейсам) — непропорционально P2 tests-only пину; (c) живая 000239
  (ветка task/000239) расширяет ровно W-10b в этом файле → правка
  харнеса гарантированно в конфликтной зоне параллельного workflow.
- Буква ТЗ п.2 («mp < стоимости → мана списывается») саморазоривается
  (paid + mp < стоимости → отказ, не списание). Контроль = саб-кейс (a):
  отказ при том же mp 2 с экипировкой БЕЗ free_cast-flame_step;
  paid-списание (30→23) уже зафиксировано W-10a :3381 (голый) + (b).
- Расхождения ветки flame_step с общим путем НЕТ (бит-в-бит) → задачи
  на согласование не создаётся (условие ограничения ТЗ не сработало).
- Размещение — EOF, а не внутри W-10a: см. §3 (vm-хелперы не входят в
  чужой plain-node-блок; EOF-паттерн файла; позиционный конфликт с
  000235.10 решается ребейзом — у блока нет count-ассертов).
- CHANGELOG — НЕ нужен (ТЗ явно: player-visible изменений нет).
- index.html / script-теги / CSS / index-order / svg-пины — не затронуты
  (0 src, 0 ассетов, 0 модулей).

## 6. Подводные камни / что важно будущим задачам

- Ветка :843 ОБЩАЯ: вырезание :844/:863 роняет и shadow_step-free-каст
  (косвенно зафиксировано; явный shadow-кейс не добавлен — не ТЗ).
  Будущий ретро может пинить shadow_step аналогично.
- Фикстура кольца валидируется items.js при load в vm (validateItem) —
  отклонение формы fcRing240 даст load-time throw вместо осмысленного RED.
- vm-realm: ассерты только примитивами; p.outOfCombatEffects === undefined
  (assert.equal, без deepStrictEqual на vm-объекты).
- Реальный require-каталог node-рейма tests/spells.test.js (items.js :21)
  не мутируется (vm — отдельный realm) → W-08 (spells-data 92 /
  items-data 257 / sync:check), items.test.js, svg.test.js не задеты.
- EOF-конфликт: 000235.10 (жива) дописывает свой блок в тот же EOF
  tests/spells.test.js → чисто позиционный конфликт, решается ребейзом +
  повторным прогоном; count-ассертов у нового блока нет.
- Пин — по ПОВЕДЕНИЮ (mp/calls/reason), не по исходной строке: при
  рефакте ветки (вынос дублирующей проверки в общий путь) пин переживает
  рефакт, если поведение сохранено; при изменении семантики — роняется.
- Побочный эффект мутационной верификации (зафиксировано прогоном):
  временная правка src/spells.js роняет W-08 (spells.test.js:3348,
  sync:check) — sync-all.js --check ОТКАЗЫВАЕТСЯ от проверки при
  незакоммиченных изменениях в src/ (guard, НЕ рассинхрон зеркал).
  После отката мутации W-08 снова зелёный; в отчётах мутационных
  прогонов не считать W-08 регрессией.
