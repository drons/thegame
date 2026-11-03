# Задача 000298 — школы у NPC: лимит 10 обучений за уровень + очки
# обучения на панели персонажа [I] — контракт

Дата: 2026-11-03. Worktree .worktrees/task-000298, ветка task/000298 (lane 3).
Base: master @ 82fadb8 (000297). Master УШЁЛ: 4c8370f (000301: книга
заклинаний, вкладки по школам) — rebase на старте кодовой стадии
(пересечений файлов НЕТ — §8).
ТЗ: tasks/pending/000298.md. Анализы: /tmp/thegame-wf-000298/a1-domain.md,
a2-arch.md, a3-tests.md.
Базовый полный прогон в worktree (2026-11-03): 3517/3517 зелёных, дерево
чистое.

## 1. Что сделано (проектные решения стадии Проектирование)

Три анализа разошлись в деталях (имя поля / семантика / точки сброса /
reason / API). Финальные решения — ниже; отклонённые альтернативы
помечены.

**D1. Интерпретация лимита (ТЗ: «решение в анализе, ЗАФИКСИРОВАТЬ В
SPEC»).** «Не более 10 обучений за уровень персонажа» = бюджет
**10 очков обучения** ГЕРОЯ (Флогистона) на ТЕКУЩЕМ уровне. Трата — ТОЛЬКО
обучение в школах навыков NPC (успешный schoolTrain, src/npc.js);
суммарно по ВСЕМ навыкам и ВСЕМ NPC. ВНЕ ОБЛАСТИ: наставники-маги зданий
(домен spec/spells.md), крафт-наставничество (mentorCraft, src/craft.js,
своё поле `цена_за_уровень`, домен spec/craft.md), пул «Свободные очки»
(c.points, +2/уровень — отдельная валюта, не трогается). Почему: контекст
ТЗ — «обучение у NPC» в школах (lane 000296/000297, та же
renderTrainTab-зона), диалог NPC всегда обучает героя, формулировка ТЗ —
«10 учебных действий на текущий уровень Флогистона».

**D2. Состояние — поле hero-листа `trainPoints` (целое 0..10), В ЛЕЙАУТЕ
`createSheet('hero')`, инициализация 10, ключ ПОСЛЕ `points`.** ТОЛЬКО
hero: efir/merc-листы поле НЕ получают (их save-форматы заморожены
пинами 000143/000144; все мутации гвардированы `typeof === 'number'`).
Почему: ТЗ просит показать «доступные очки обучения (остаток)» — поле
держит остаток напрямую (без вычитания в UI); неломкое расширение v1 —
прецеденты hero.spells (000045), craft/craftXp (000046). ОТКЛОНЕНО
(a3): ленивый счётчик `trainCount` (used, не в лейауте) — ради
избегания одного ре-пина SH-1 добавлял бы НЕСПРОШЕННЫЙ публичный API
(SCHOOL_TRAIN_LIMIT, schoolTrainLeft), вычисляемое отображение
(10 − used) и «отсутствие поля» как нормальное состояние — больше
подвижных частей при том же результате. Ре-пин SH-1 — технический
(разрешён инвариантом: «только технические под новый путь»). ОТКЛОНЕНО
(a1): имя `trainLeft` — `trainPoints` 1:1 соответствует слову ТЗ/UI
«очки обучения».

**D3. Трата: каждый УСПЕШНЫЙ schoolTrain → `trainPoints − 1`**
(гвардированный декремент ПОСЛЕ инкремента secondary — см. §3). Форма
результата успеха НЕ МЕНЯЕТСЯ: `{ ok: true, level, price }`
(deepEqual-пины npc.test.js). Блокировка НЕ списывает золото/очки и НЕ
поднимает навык.

**D4. Блокировка: новая проверка в canSchoolTrain ПОСЛЕ `s.requires`
И ПЕРЕД золотом** — `typeof character.trainPoints === 'number' &&
character.trainPoints <= 0` →
`{ ok: false, reason: 'нет очков обучения на этом уровне' }`.
schoolTrain — та же причина (can/execute — одно ядро). Почему: бюджет —
состояние персонажа → проверяется до ресурсов (золота); у fresh-героя
(10) ветка НИКОГДА не срабатывает → все существующие reason-пины
npc.test.js зелёные без правок. Порядок (бюджет до золота) — ЗАПИНЕН
тестом L1-б. Reason БЕЗ цифры — не связан с константой (отклонены
a1/a3: «лимит обучений за уровень исчерпан (10)» / «лимит: 10
обучений за уровень» — цифра в reason = лишняя точка связывания).

**D5. Сброс — ПЛОСКИЙ в 10 (остаток НЕ переносится; мульти-джамп N
уровней → 10, а не 10×N), в ДВУХ зеркалирующихся точках level-up, ОБЕ
внутри while-цикла уровней СРАЗУ ПОСЛЕ строки `points += …`:**
  * (a) `Sheet.addXp` — src/sheet.js (основной путь: опыт/ап-левел);
  * (b) `grantXpRaw` — src/building-actions.js (рунический камень/
    обелиск, 000074; ЕДИНСТВЕННЫЙ вызов — `grantXpRaw(deps.hero, r.xp)`,
    L312).
Почему ДВЕ точки: a1/a3 утверждали «addXp — единственный пункт
роста» — ОШИБКА: grantXpRaw — ТОЧНОЕ ЗЕРКАЛО addXp (комментарий в коде
000074: «при изменении addXp в sheet.js синхронизировать (R1: дубль
лупы уровней)»), и оно зовётся на deps.hero. Почему В ЦИКЛЕ (a1: после
цикла): 1:1 зеркало строки `points += ppl` / `c.points +=
deps.game.POINTS_PER_LEVEL` — минимум риска рассинхрона, результат
одинаков (плоский сброс идемпотентен). Мульти-джамп → 10 (не 25/35) —
красное ТЗ «лимит восстанавливается» (отклонён a2-вариант «+10 за
уровень»). Митигция рассинхрона: тест L3 проверяет ОБЕ точки.

**D6. Константа `TRAIN_POINTS_PER_LEVEL = 10` — src/sheet.js (рядом с
`MAX_SKILL_LEVEL`), экспорт sheet.js + FLAT-РЕ-ЭКСПОРТ player.js
(`Game.TRAIN_POINTS_PER_LEVEL`).** Паттерн POINTS_PER_LEVEL
(player.js L72-75: «grantXpRaw читает deps.game.POINTS_PER_LEVEL»).
Потребители: grantXpRaw — через `deps.game.TRAIN_POINTS_PER_LEVEL`
(лениво, в момент вызова); sanitizeSavedHero — через фабричный аргумент
`sheet` (жёсткий гард на sheet.createSheet уже есть). 10 — жЁСТКОЕ
игровое правило, зафиксированное в SPEC (НЕ live-настройка — в отличие
от points_per_level, 000099) → снапшот-константа корректна.
**npc.js НОВЫХ UMD-АРГУМЕНТОВ НЕ ПОЛУЧАЕТ** (отклонён a1: S-аргумент
factory(require('./player.js'), require('./items.js'),
require('./sheet.js'))) — reason не несёт цифры, константа npc.js НЕ
НУЖНА: нет смены сигнатуры фабрики, нет нового порядка загрузки, нет
browser-снапшота, нет гарда.

**D7. Сейв — НЕРАЗРУШАЮЩЕЕ расширение v1 (000031): версии/миграций НЕТ**
(пин save.test.js «000072»: CURRENT_VERSION = 1, MIGRATIONS пуст —
цел). Герой сериализуется ЦЕЛИКОМ (main.js collectSaveData — живая
ссылка) → новое поле сохраняется АВТОМАТИЧЕСКИ; restore через
sanitizeSavedHero + Object.assign (main.js БЕЗ правок).
`sanitizeSavedHero` (src/player.js): `trainPoints: (Number.isInteger(
s.trainPoints) && s.trainPoints >= 0 && s.trainPoints <=
sheet.TRAIN_POINTS_PER_LEVEL) ? s.trainPoints :
sheet.TRAIN_POINTS_PER_LEVEL` — отсутствующее (legacy-сейв) → 10 (полный
бюджет честного старта уровня — дружелюбно); валидные 0..10 → как есть;
подделка (14/−1/'3'/1.5/null) → 10. Ключ `trainPoints` не содержит
/day/i (гард save-restore.test.js цел).

**D8. Панель [I], вкладка «Персонаж», hero-ветвь: НОВАЯ строка
`Очки обучения: ${c.trainPoints}` вставляется МЕЖДУ «Золото: g  |
Свободные очки: p» И «Вес: …  |  Слоты: …» (hero-шаблон 4 → 5 строк;
последняя «Вес…» БЕЗ `\n` — паттерн).** Словесно — дословно ТЗ («количество доступных очков
обучения»). Non-hero-ветвь (2 строки, ТОЧНО запинена B2 в
ui-tab-skills-active.test.js) — НЕ ТРОГАЕТСЯ. **src/ui.js БЕЗ ПРАВКИ**:
хендлер `act === 'train'` (L1351-1357) уже вызывает
`G.playerUI.render()` после каждого обучения → панель перерисовывается
сама (10 → 9 → … → 0 без единой правки в ui.js); renderTrainTab (000296)
уже дизейблит кнопку с title=reason → новый reason подхватится
автоматически. ТЗ просит ТОЛЬКО панель [I] — строку остатка в сам
train-таб НЕ добавляем (открытый вопрос a2 Q5 закрыт: если захотят —
отдельная микрозадача).

**D9. SPEC — ТОЛЬКО spec/npc.md, раздел «## Школы (обучение)»,
ДОБАВЛЕНИЕ В КОНЕЦ РАЗДЕЛА (конец файла): +8 строк (18 → 26).**
Точный текст (контракт wording-теста S1/S2; 2-пробельный индент
раздела; «−» = U+2212):
```
  Лимит обучений (задача 000298): не более 10 обучений за уровень
  персонажа (10 учебных действий на текущий уровень Флогистона),
  суммарно по всем навыкам и всем NPC. Бюджет очков обучения:
  каждое успешное обучение в школе — −1; при повышении уровня —
  плоский сброс в 10 (остаток не переносится). Крафт-наставничество
  (раздел «Крафт») лимитом не покрывается. При исчерпании бюджета
  обучение недоступно («нет очков обучения на этом уровне»);
  остаток — на панели персонажа [I], строка «Очки обучения: N».
```
Почему только npc.md (отклонены правки skills.md): весь school-контракт
живёт в этом разделе (прецеденты 000296/000297); skills.md —
line-index-пины SKILLS[41]/[51] (spec-000273-wording) + кросс-ссылка на
раздел уже есть (L93). npc-storage.md — форма данных `обучение` НЕ
МЕНЯЕТСЯ (лимит на персонаже, не в данных NPC). НОВЫХ H2 НЕТ
(nH2 = 67 цел). Формулировка фиксирует ВСЁ из ТЗ-п.1: цифру 10,
интерпретацию (10 учебных действий на текущий уровень Флогистона),
суммарность, плоский сброс, контраст с крафтом, reason, отображение.

**D10. Новых JS-модулей/скриптов/SVG/ассетов НЕТ** → index.html,
tests/index-order.test.js, tests/svg.test.js — без правок. Все правки —
внутри существующих модулей.

**D11. НОВОГО ПУБЛИЧНОГО API НЕТ.** Экспорт npc.js без изменений
(canSchoolTrain/schoolTrain/schoolTrainPrice/schoolSkills — те же
сигнатуры); SCHOOL_TRAIN_LIMIT-экспорта и функции schoolTrainLeft НЕТ
(отклонён a3 — ТЗ не просит; тесты читают константу через экспорт
sheet.js и поле на листе напрямую).

**D12. Тесты** — §5: 9 новых красных (3 файла) + 4 технических
ре-пина, всё в ОДНОМ коммите задачи (CLAUDE.md: одна задача = один
коммит; конвенция lane 000296/000297 — красные закоммичены с решением).
Краснота ОСМЫСЛЕННАЯ: модули грузятся, панели рендерятся; падение —
ассерты на отсутствующем поле/строке/фразе, НЕ SyntaxError.

**D13. CHANGELOG — ДА** (ТЗ: «CHANGELOG — да (геймплей)») — ОТДЕЛЬНЫЙ
коммит на стадии мержа ПОСЛЕ ребейза (секция `## 2026-11-03` →
`### Игровой процесс` — уже существует от 000297; entry 000301 лежит
под `## 2026-11-02` → конфликта нет), дата мержа = 2026-11-03:
```
- **В школах наставников — лимит: 10 обучений за уровень.**
  Каждый текущий уровень персонажа даёт 10 очков обучения, на
  которые прокачиваются навыки в школах NPC (суммарно по всем
  навыкам и наставникам). Новый уровень восстанавливает очки
  полностью. Остаток — на панели персонажа [I] (строка «Очки
  обучения: N»).
```

**D14. Rebase на 4c8370f (000301) — ЧИСТЫЙ, ожидается 0 конфликтов:**
файлы 000301 (src/spellbook-oc.js, assets/school-icons/,
tests/svg.test.js, tests/spellbook-oc-tabs.test.js, index.html —
CSS .spoc-* БЕЗ новых script-тегов (проверено diff'ом), CHANGELOG под
`## 2026-11-02`, свои memory/tasks) с файлами 000298 (sheet.js,
player.js, npc.js, building-actions.js, ui-tab-skills.js, spec/npc.md,
tests/sheet.test.js, tests/spec-split.test.js,
tests/spec-000296-wording.test.js, tests/spec-000297-wording.test.js,
3 новых tests, memory) НЕ ПЕРЕСЕКАЮТСЯ. После ребейза — обязательный
полный прогон.

## 2. Контракты и границы

Контракт школы ПОСЛЕ 000298 (spec/npc.md «Школы (обучение)»,
26 строк):
* Школа NPC обучает вторичные навыки из `обучение` за золото: шаг
  L→L+1 = 20 + 10·L² (000296); требования — те же, что при трате
  очков; свободные очки НЕ тратятся (000297: возврата НЕТ).
* ЛИМИТ (000298): не более 10 обучений (учебных действий) за текущий
  уровень персонажа — суммарно по всем навыкам и NPC. Бюджет «очков
  обучения» героя (hero-лист, поле `trainPoints`, 0..10, старт 10):
  каждое успешное обучение — −1; ап-левел — плоский сброс в 10.
* canSchoolTrain — порядок проверок (первая неудача): (1) навык не в
  `обучение` → (2) не вторичный → (3) максимальный уровень (100) →
  (4) `character.primary[s.primary] < 1` → (5) `s.requires` →
  **(6) НОВОЕ: `typeof character.trainPoints === 'number' &&
  trainPoints <= 0` → reason «нет очков обучения на этом уровне»** →
  (7) мало золота.
* schoolTrain: canSchoolTrain → `gold −= price` →
  `secondary[skillId] + 1` → **`if (typeof character.trainPoints ===
  'number') character.trainPoints -= 1;`** → craftReprocessHook (000046)
  → возвращает ТОЧНО `{ ok: true, level, price }`.
* Панель [I] «Персонаж» (hero): 5 строк — уровень/опыт; HP/MP/броня;
  золото/свободные очки; **«Очки обучения: N»**; вес/слоты.
* Сейв: v1 без миграций; legacy (поля нет) → 10; валид 0..10 — как
  есть; подделка → 10.

НЕ ТРОГАЕТСЯ (границы):
* src/ui.js (хендлер train + renderTrainTab уже делают всю работу — D8),
  src/main.js (collectSaveData/restoreFromSave/debug addXp),
  src/craft.js, src/efir.js, src/companions.js, src/spellbook*.js,
  src/building-effect-mentor.js (наставники-маги — вне области D1).
* Листы efir/merc (поле trainPoints НЕ добавляют; guards — no-op).
* c.points («Свободные очки» — отдельная валюта), формула 000296,
  craftReprocessHook, `цена_за_уровень`/`цена_переноса_за_уровень`
  (данные 000297), MIGRATIONS/версию сейва, index.html, assets/,
  spec/skills.md, spec/npc-storage.md, корневой SPEC.md (nH2 = 67).
* Детерминизм боя/RNG/сейв-байты старых полей (trainPoints — новое
  поле, порядок ключей heroes: …, points, **trainPoints**, primary,
  … — байты сейва расширяются; старые поля не сдвигаются).

## 3. Точные точки изменений (якоря при base 82fadb8)

src/sheet.js (581):
* L54 `const MAX_SKILL_LEVEL = 100;` — ПОСЛЕ:
  `const TRAIN_POINTS_PER_LEVEL = 10;` (+1 строка).
* L157 hero-ветка `points: 0, // неистраченные очки навыков` — ПОСЛЕ:
  `trainPoints: TRAIN_POINTS_PER_LEVEL,` (порядок ключей: …, points,
  trainPoints, primary, … = JSON-байты сейва; efir/merc-ветка L187
  `points: 0,` — НЕ ТРОГАТЬ).
* L248 `sheet.points += ppl;` (внутри while-лупы addXp) — ПОСЛЕ:
  `if (typeof sheet.trainPoints === 'number')` +
  `sheet.trainPoints = TRAIN_POINTS_PER_LEVEL;` (2 строки).
* Экспорт L575 `KINDS, MAX_SKILL_LEVEL,` — рядом:
  `TRAIN_POINTS_PER_LEVEL,`.

src/player.js (281):
* L197-199 блок делегирования (рядом с `const addXp = sheet.addXp;`) —
  `const TRAIN_POINTS_PER_LEVEL = sheet.TRAIN_POINTS_PER_LEVEL;`
  (комментарий по образцу POINTS_PER_LEVEL L71-74: grantXpRaw читает
  deps.game.TRAIN_POINTS_PER_LEVEL; 10 — жёсткое SPEC-правило, не
  live-настройка).
* L274 `MAX_SKILL_LEVEL, POINTS_PER_LEVEL,` — рядом:
  `TRAIN_POINTS_PER_LEVEL,`.
* L185 sanitizeSavedHero (return-литерал), ПОСЛЕ `points: …`:
  `trainPoints: (Number.isInteger(s.trainPoints) && s.trainPoints >= 0
  && s.trainPoints <= sheet.TRAIN_POINTS_PER_LEVEL)
  ? s.trainPoints : sheet.TRAIN_POINTS_PER_LEVEL,`.

src/npc.js (721):
* canSchoolTrain, ПОСЛЕ L170-172 (ветка `s.requires`), ПЕРЕД L173
  `const price = schoolTrainPrice(…)`:
  `if (typeof character.trainPoints === 'number' &&` +
  `character.trainPoints <= 0) {` +
  `return { ok: false, reason: 'нет очков обучения на этом уровне' };`
  + `}` (4 строки). UMD-шапка/сигнатура фабрики/экспорты — БЕЗ ПРАВОК.
* schoolTrain, ПОСЛЕ L202 `character.secondary[skillId] = … + 1;`:
  `if (typeof character.trainPoints === 'number') {` +
  `character.trainPoints -= 1;` + `}` (3 строки; canSchoolTrain уже
  гарантирует > 0 при наличии поля — гвард против NaN на синтетических
  листах без поля).

src/building-actions.js (1977):
* grantXpRaw (L186-198), внутри while-цикла, ПОСЛЕ
  `c.points += deps.game.POINTS_PER_LEVEL;` (L193):
  `if (typeof c.trainPoints === 'number') {` +
  `c.trainPoints = deps.game.TRAIN_POINTS_PER_LEVEL;` + `}` (3 строки,
  ЗЕРКАЛО D5(b)).

src/ui-tab-skills.js (617):
* Hero-ветвь статов (L544-549), МЕЖДУ строкой
  `` `Золото: ${c.gold}  |  Свободные очки: ${c.points}\n` + `` (L548)
  И `` `Вес: …` `` (L549): `` `Очки обучения: ${c.trainPoints}\n` + ``
  (1 строка; «Вес…» остаётся последней БЕЗ `\n`).
* Комментарий L533 «ПОБАЙТОВО текущий 4-строчный шаблон» → «5-строчный»
  (правка правды существующего комментария; новых комментариев НЕ
  вводить). Non-hero-ветвь L550-554 — НЕ ТРОГАТЬ.

spec/npc.md (18 → 26): +8 строк в конец раздела «## Школы (обучение)»
(= конец файла) — ТОЧНЫЙ текст в D9.

## 4. Ленивые ссылки и guards

* Новых модулей нет → снапшот-ловушка 000038 НЕ задействована;
  browser-цепочка index.html — без изменений (sheet.js L1239 →
  player.js L1240 → npc.js L1252 → ui-tab-skills.js L1333 →
  ui.js L1338 → building-actions.js L1350 — порядок не меняется, ни
  один из них не получает новых аргументов).
* grantXpRaw читает `deps.game.TRAIN_POINTS_PER_LEVEL` ЛЕНИВО в момент
  вызова (deps.game — снапшот main.js, flat-экспорт player.js; паттерн
  POINTS_PER_LEVEL).
* Guards `typeof … === 'number'` (4 мутационные точки: addXp,
  grantXpRaw, canSchoolTrain, schoolTrain) — efir/merc и синтетические
  листы без поля — бит-в-бит нетронуто.
* sanitize — дефолт 10 для legacy/подделки (D7).
* Гард player.js на sheet.createSheet (L45-49) — уже есть;
  sheet.TRAIN_POINTS_PER_LEVEL в sanitize недостижимо-отсутствующ
  (тег sheet.js ДО player.js — пин index-order).

## 5. Тесты

### Новые КРАСНЫЕ (9; закоммичить ДО кода вместе с memory)

Файл A — tests/npc-school-limit.test.js (node; require player.js,
sheet.js, npc.js + harness-модули для L3: building-actions.js,
building-effect-runes.js, building-effects.js, buildings.js, perlin.js,
day.js; фикстура trainNpc — ДУБЛЬ 1:1 из tests/npc.test.js L14-31):
* **L1** «11-е обучение на том же уровне — заблокировано»:
  h = P.createCharacter() (gold 1e6) — `h.trainPoints === 10`
  (красно: undefined); 10× `N.schoolTrain(trainNpc, c, 'swordsman')` —
  все ok, цены 20/30/60/110/180/270/380/510/660/830 (Σ 3050), после
  i-го `c.trainPoints === 10 − i` (пошагово, не по циклу-предположению);
  после 10-го — 0; 11-й → `{ ok: false, reason: 'нет очков обучения на
  этом уровне' }`; `N.canSchoolTrain` — тот же reason дословно
  (can/execute — паттерн npc.test.js L352-366); ПОРЯДОК ПРИЧИН
  (под-ассерт): c2 с trainPoints 0 И gold 0 → reason = БЮДЖЕТ, не
  «мало золота»; 11-й отказ не трогает gold/points/secondary.
* **L2** «счётчик учебным действиям, не навыкам; guard без поля»:
  смешанные (swordsman ×5 + heavy ×5) → trainPoints 0 (лимит на
  ДЕЙСТВИЯ); персонаж БЕЗ поля (`delete c.trainPoints`) — обучение
  проходит ok:true, поле остаётся undefined (НЕ NaN), canSchoolTrain
  ok:true (typeof-guard).
* **L3** «ап-левел — плоский сброс в ДВУХ точках»:
  (a) 10 обучений (0) → `P.addXp(c, P.xpForNext(1))` → level 2,
  trainPoints 10, 11-е ok (swordsman 11);
  (b) мульти-джамп: trainPoints 5, +3 уровня за один addXp → 10
  (ПЛОСКО, не 35);
  (c) ЗЕРКАЛО grantXpRaw: полный пайплайн (harness A66:
  `BA.init(deps)` + `BA.onBuildingAction({id:'40',…}, t40, b40, null)`;
  building 40 — камень; hero c = createSheet('hero') +
  `secondary.runes = 5` + trainPoints 5 + gold; спец-модуль
  регистрируется `R.register({ buildingActions: BA })`; deps.game —
  `{ xpForNext: P.xpForNext, POINTS_PER_LEVEL: 1,
  TRAIN_POINTS_PER_LEVEL: S.TRAIN_POINTS_PER_LEVEL, derived: P.derived,
  buildingEffects: { EFFECTS: BE.EFFECTS, … }, hash2: PL.hash2, … }`);
  два золотых дня УСПЕХА находятся тестом САМ через
  `BE.deterministicRoll(5, 7, d, 0x53544e52 /* STONE_ROLL_SEED 'STNR' */,
  PL.hash2) < BE.stoneChance(eff, 5)` (deterministic — стабильно);
  2 прикосновения × 25 XP (stoneXp: round((10+2·5)·1.25), A45) = 50 =
  xpForNext(1) → level 2 → trainPoints 10.
* **L4** «sanitizeSavedHero: legacy → 10, валид 0..10, подделка → 10»:
  валидный сейв БЕЗ trainPoints (фикстура в духе validSavedHero из
  player.test.js L357) → clean.trainPoints === 10; 0→0; 7→7; 10→10;
  14→10; −1→10; '3'→10; 1.5→10; null→10; ядро clean (level/xp/gold/
  primary/secondary/…) — deepEqual без изменений.
* **L5** «инварианты»: 10-й успех — `assert.deepEqual(r, { ok: true,
  level: 10, price: 830 })` (НИКАКИХ доп. полей); 11-й отказ —
  gold-до === gold-после; craftReprocessHook (000046):
  stub Game.Craft.reprocessCraftXp со счётчиком — 10 успехов = 10
  вызовов (регрессия «школа поднимает потолок крафта»).

Файл B — tests/npc-school-limit-ui.test.js (vm; **ДИНАМИЧЕСКИЙ CHAIN —
все `<script src>` index.html до ui.js включительно** (IIFE-паттерн
tests/ui-panel-htmlcollection.test.js L178-183 — ВКЛЮЧАЕТ
ui-tabs.js/ui-tab-skills.js, которые нужны вкладке «Персонаж»; НЕ
статичный 17-теговый CHAIN 000297 — там нет ui-tab-skills.js): DOM-стаб
— дубль npc-school-no-refund.test.js (атрибут-селекторы для
onOverlayClick) + panel-утилиты ui-panel-htmlcollection.test.js
(makePartyEnv/openPanel/panesOf); NPC 000005 Карк (openNpcDialog,
вкладка data-tab='train'); герой c = P.createCharacter() gold 1e6):
* **U1** «панель [I] — «Очки обучения: 10» → 10 обучений → 0; 11-е
  заблокировано»: `G.playerUI.setCharacter(c)` +
  `G.playerUI.toggle(true)` → .char-panel в body, .cp-stats (character
  pane) содержит «Очки обучения: 10» (красно: строки НЕТ); диалог Карка
  → вкладка train → 10× клик `button[data-npcact="train"]` (swordsman)
  через делегированный click — после КАЖДОГО (хендлер сам зовёт
  G.playerUI.render()) .cp-stats «9…0»; после 10-го: bTrain
  `disabled === true`, `title === 'нет очков обучения на этом уровне'`;
  регрессии: строка «Свободные очки: 0» в train-табе на месте,
  gold === 1e6 − 3050, errors.length === 0.
* **U2** «ап-левел — лимит восстанавливается (vm)»: после 10 (0) →
  `G.addXp(c, G.xpForNext(1))` → level 2 → render → «Очки обучения:
  10», кнопка снова активна; ещё 10 обучений → 0 → disabled; 11-й
  клик — no-op (gold/level/secondary не изменились).

Файл C — tests/spec-000298-wording.test.js (Новый; конвенция
spec-000296/000297-wording: хелперы esc/h2/norm/phrase/specLines 1:1,
readFileSync spec/npc.md ОДИН раз; файл НЕ содержит литерала «SPEC» +
«453» — needle собирать из частей):
* **S1** «лимит»: h2-срез «Школы (обучение)» positive (norm-склейка):
  «не более 10 обучений за уровень персонажа», «10 учебных действий на
  текущий уровень Флогистона», «суммарно по всем навыкам и всем NPC»,
  «каждое успешное обучение в школе — −1», «плоский сброс в 10»,
  «остаток не переносится», «Крафт-наставничество (раздел «Крафт»)
  лимитом не покрывается», «нет очков обучения на этом уровне»;
  guard `specLines(NPCMD) === 26` (красно: сейчас 18).
* **S2** «отображение»: positive «остаток — на панели персонажа [I]»,
  «строка «Очки обучения: N»», «При исчерпании бюджета обучение
  недоступно»; guard 26.

**expectedRedCount = 9** (L1, L2, L3, L4, L5, U1, U2, S1, S2).
Верификация RED: `cd .worktrees/task-000298 && npm test` — 3517 + 9 =
3526 тестов, ровно 9 «not ok», 3517 зелёных; каждая краснота — по
ассерту на отсутствующем поле/строке/фразе (модули грузятся). Флейк
чужого теста — перепуск одним файлом + запись в tasks/result.

### Технические ре-пины (ТОМ ЖЕ коммите, протокол 000159 §5.1)

1. tests/sheet.test.js SH-1: deepEqual — `trainPoints: 10,` после
   `points: 0,`; `Object.keys` — `'trainPoints'` после `'points'`
   (порядок = байты сейва).
2. tests/spec-split.test.js L125: `"npc.md": 18` → `26` (+ коммент
   «000298: +8 (лимит обучений + панель [I]); wording-пин
   spec-000298-wording S1/S2 в том же коммите»).
3. tests/spec-000296-wording.test.js L120 R3: guard `specLines(NPCMD)
   === 18` → `26`.
4. tests/spec-000297-wording.test.js L120 W1: guard `=== 18` → `26`.
   (skills.md 100 / npc-storage.md 71 — без ре-пинов; nH2 67 — без.)

### Зелёные БЕЗ правок (проверено по коду тестов)

* tests/npc.test.js — все school-пины: фикстуры fresh (trainPoints 10 →
  ветка лимита не срабатывает), форма результата не меняется, reasons
  не двигаются (новая ветка ДО золота, но на fresh-персонаже мертва);
  000296-цены, 000297 T1-T3 (2 обучения ≤ 10).
* tests/sheet.test.js SH-2 (возврат addXp {levelsGained, pointsGained}
  — форма НЕ меняется), efir/merc-лейауты.
* tests/save.test.js «000072» (CURRENT_VERSION 1, MIGRATIONS пуст),
  EFIR_SHEET_KEYS, /day/i-гард (L310); tests/save-restore.test.js.
* tests/player.test.js sanitize — полевые ассерты; fixture
  validSavedHero() БЕЗ trainPoints → естественный legacy-кейс (зелёный
  после D7: поле появится в clean, старые ассерты не смотрят).
* tests/ui-tab-skills-active.test.js B2 (2 строки МЕРСА — НЕ ТРОГАЕМ);
  includes-пины .cp-stats (ui-panel-htmlcollection R1/R7,
  inventory-slots-000255) — 5-я строка добавка, не замена.
* tests/craft-core.test.js (1 schoolTrain ≤ 10), tests/craft-mentor.
  test.js (вне области D1), tests/npc-data/assets-*/sync-all (данные
  не меняются), tests/index-order (index.html не меняется),
  детерминизм боя/RNG (не затронуто).

### Счётчики (ожидаемые)

* RED-стадия: 3517 + 9 = 3526, ровно 9 «not ok».
* Зелёная/финал: 3526/3526.

## 6. Что важно будущим задачам

* ДВЕ точки level-up-сброса (addXp sheet.js + grantXpRaw
  building-actions.js) — ДУБЛИРУЮТСЯ строкой за `points += …`: при
  ЛЮБОЙ правке level-up-логики (кривая опыта, очки за уровень,
  новые источники XP) править ОБЕ — иначе рунический камень/обелиск
  не сбросит бюджет (тест L3(c) — ловушка).
* hero.trainPoints — поле ЛЕЙАУТА (порядок ключей: после points):
  SH-1 pinит deepEqual + Object.keys; любое следующее поле героя —
  ре-пин SH-1 в том же коммите.
* `Game.TRAIN_POINTS_PER_LEVEL` — flat-экспорт player.js (для
  grantXpRaw через deps.game); `Game.Sheet.TRAIN_POINTS_PER_LEVEL` —
  источник. 10 — SPEC-жёсткое правило (не live-настройка).
* Панель [I] hero — 5 строк; 4-я = «Очки обучения: N» (hero-ветвь
  ui-tab-skills.js) — кандидаты на wording/VM-пины будущих задач;
  non-hero 2 строки — ТОЧНО, не трогать.
* Reason «нет очков обучения на этом уровне» — дословно в SPEC и в
  UI (title кнопки); порядок проверок canSchoolTrain: … requires →
  БЮДЖЕТ → золото (запинено L1).
* Строка «Свободные очки» в train-табе (ui.js) — НЕ трогаем (000297 D4);
  если захотят остаток «очков обучения» и в самом диалоге школы —
  отдельная микрозадача (D8).
* Крафт-наставничество и наставники-маги зданий — ВНЕ лимита (D1,
  зафиксировано в SPEC-фразе «Крафт-наставничество (раздел «Крафт»)
  лимитом не покрывается»).

## 7. Подводные камни

1. **Три guard-ре-пина (spec-split / 000296 R3 / 000297 W1) — ВСЕ в
   том же коммите, что правка spec/npc.md** (18 → 26), иначе сьют
   красный. Значения обязаны совпасть во всех трёх местах.
2. **SH-1 — deepEqual + Object.keys**: trainPoints ИМЕННО ПОСЛЕ points
   (не в конец) — байты сейва (000031).
3. **Зеркало grantXpRaw** (D5b) — самая легко теряемая строка: без
   неё лимит не сбрасывается у рунического камня/обелиска; тест L3(c)
   обязателен. deps.game.TRAIN_POINTS_PER_LEVEL — flat-ре-экспорт
   player.js ДОЛЖЕН существовать (иначе undefined в зеркале).
4. **Порядок canSchoolTrain**: бюджет ДО золота — запинено L1-б;
   перестановка в будущем = смена видимой причины при двойной нехватке.
5. **Ноль новых аргументов npc.js** — не «чинить» factory-сигнатуру
   ради константы (D6): reason не несёт цифры.
6. **Не смешивать с c.points**: «Свободные очки» (points, +2/уровень,
   тратятся в панели навыков) и «Очки обучение» (trainPoints, 10/
   уровень, тратятся в школах) — разные валюты; SPEC-фразы не
   подменять.
7. Литерал «SPEC» + «453» в новых test-файлах — НЕТ (скан
   SPEC-453-GONE).
8. Полный прогон ТОЛЬКО `cd .worktrees/task-000298 && npm test`
   (memory/test-runner-worktrees.md; голый npm test из корня main-репа
   рекурсивно сканирует .worktrees/* — инцидент 2026-10-27); ps-проверка
   до пуска; один worktree = один полный прогон; флейк — перепуск
   файла + запись в отчёт. После ребаза (на 4c8370f) — полный прогон
   ОБЯЗАТЕЛЕН.
9. Мерж-стадия (не эта станция): .merge-pending, rebase, полный прогон,
   squash (reset --soft + commit, ff-only —
   memory/one-commit-per-task-squash), CHANGELOG-коммит, удаление
   .merge-pending; .merge-pending на этой стадии НЕ создавать.

## 8. Финализация (заполнить на merge-станции)

* (заполнить: коммиты ветки, факт ребейза на 4c8370f, полный прогон,
  SHA в master, факт CHANGELOG-коммита).

## 9. Доп. записи зелёной стадии (реализация, 2026-11-03)

* Rebase: master УШЁЛ дальше 4c8370f — до 912ce0a (000289 canvas,
  ebf197f 000244.02). Пересечений файлов с 000298 НЕТ (912ce0a:
  src/main.js + memory + tests/canvas-resize-000289.test.js; ebf197f:
  spec/spells.md + memory + tests/spec-000244-wording + tasks) —
  rebase ЧИСТЫЙ, 0 конфликтов. Базовая линия сьута после ребейза —
  не 3517 (000289 добавил тесты), финал — 100% зелёный.
* ДВА дефекта красных тестов (красная стадия фиксировала только
  «9 not ok», несовместимость ожидаемых значений с контрактом
  заметна лишь на зелёной) — исправлены в том же коммите реализации:
  1. L2 (npc-school-limit.test.js): первый цикл (swordsman ×5)
     ждал `5 − i` (5..1) — арифметически несовместимо с бюджетом 10
     (D3: старт 10, −1 за обучение; L1 в том же файле шаг 10−(i+1)):
     после i-го (0-based) — `10 − (i + 1)` (9..5); второй цикл
     (heavy ×5, `5 − (i+1)` = 4..0) был верен и не менялся.
  2. U2 (npc-school-limit-ui.test.js): ассерт `bTrain.disabled ===
     false` после `G.addXp` + `G.playerUI.render()` недостижим —
     render() playerUI перерисовывает ТОЛЬКО панель [I], вкладку
     оверлея NPC — только renderTab() (смена/повторный выбор
     вкладки, клик внутри оверлея; D8: ui.js без правок). В реальном
     потоке stale-состояние не достижимо (переключение на вкладку
     «школа» всегда ре-рендерит с свежим canSchoolTrain). В тест
     добавлен повторный клик по вкладке (реалистичный поток
     пользователя) — одна строка, остальные ассерты без изменений.
* Панель [I]: строка «Очки обучения: N» — hero-ветвь ui-tab-skills.js
  (4→5 строк); комментарий «4-строчный» → «5-строчный» (правда).
* Коммит ветки (до merge): [красные] a6aa3c1 → [реализация] bcac496 →
  [ревью] fedbc44 — см. tasks/result/000298.md.
* Финализация (2026-11-03): отчёт финализирован (tasks/result/000298.md:
  [SHA] → bcac496, список коммитов a6aa3c1/bcac496/fedbc44, секции
  «Решения»/«Подводные камни»/«Файлы»/«Как проверяли», решение по
  CHANGELOG — стадия мержа, §7.9/D13). Свежий полный прогон на
  ЧИСТОМ дереве — 3537/3537, 0 fail. §8 — заполнить на
  merge-станции.
