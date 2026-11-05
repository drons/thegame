# 000334 — ретро-фикс 000300: покрытие major/minor-пробелов

Ретро b2-20261105 (tasks/result/000300-retro-b2-20261105.md) по
задаче 000300 (обучение у NPC — активный персонаж партии). Код
на момент анализа (master 97bf78f, до смержа 000314) ВСЕ
мажорные/минорные контракты УЖЕ ВЕРЕН — задача = ПИНЫ
существующего поведения (зелёные с первого запуска, прецедент
000311) + РЕШЕНИЕ info-1 (1 строка src) + РЕ-ПИН doc-комментов
info-2 + фикс ложного пункта memory/000300 (minor-4).

## Контракты (источник правды — код)

* major-1 (payChar-чек): `canSchoolTrain(npc, character, skillId,
  payChar)` — gold-чек `payChar.gold < price` (src/npc.js), НИКОГДА
  НЕ `character.gold` (у Эфира/наёмного gold = undefined —
  NaN-ловушка: `undefined < price` = false — регрессия проходила
  бы все success-only тесты). Отказ «мало золота (нужно N)» —
  ДО каких-либо мутаций; `schoolTrain` списывает `payChar.gold`
  первым после can-чека. Пины: A7 (ядро: efir swordsman L=2 →
  цена 60, hero.gold 10 → `{ok:false, reason:'мало золота
  (нужно 60)'}` + no-mutation hero.gold/efir.trainPoints/
  efir.secondary) и B5 (vm-зеркало: bTrain.disabled + title) в
  tests/npc-party-training-000300.test.js.
* major-2 (санация trainPoints в deserializeEfir, НОВЫЙ формат):
  absent → 10; int 0..10 → как есть (3 → 3); forged 99/'x'/-1/
  2.5/null → 10 (лист ЖИВ, НЕ null); СТАРЫЙ 5-полевой формат →
  backfill 10. Пин: ES-7 в tests/efir-sheet.test.js (каталоги из
  assets — id-валидация вкл.).
* minor-1 (sanitizeMercSheet — ВСЕГДА): trainPoints ВСЕГДА
  материализуется (absent/не int/вне 0..10 → 10) — все
  runtime-листы наёмников получают поле (прецедент
  sanitizeSavedHero 000298 L4). Пин: CS-6 расширен
  (delete sheet.trainPoints → жива + 10; trainPoints 99 → 10).
* minor-2 (copyMercSheet — УСЛОВНАЯ): `typeof s.trainPoints ===
  'number'` → копия; absent → absent. БЕЗУСЛОВНАЯ копия сломала бы
  бит-в-бит hand-crafted-листы T1 sh() / 000230.06 S1–S4
  (tests/save.test.js) — они БЕЗ trainPoints. Пин: CS-8
  (serializeRoster: листа без trainPoints → `'trainPoints' in
  snap.sheet === false`; с 4 → 4; fresh-copy: мутация input после
  снапшота снапшот не трогает).
* minor-3 (B1 точная строка): train-таб npcUI рендерит
  «Свободные очки: N» ОТ trainChar (activeSheetNow) — src/ui.js
  renderTrainTab. B1: st.efir.points = 3 (hero.points = 0) →
  ТОЧНЫЙ ассерт `metas.includes('Свободные очки: 3')` (раньше —
  только some(startsWith) без значения). Мутация, где UI читал бы
  c.points вместо trainChar.points → красный.
* minor-4 ([I]-видимость): строка «Очки обучения: N» на панели
  [I] (000298) — ТОЛЬКО hero-ветка src/ui-tab-skills.js (единственное
  вхождение в кодовой базе, 5-строчный hero-шаблон); у Эфира/
  наёмного — 2-строчный статы-лейаут (`Уровень | Опыт` +
  `Свободные очки: points`) БЕЗ строки обучения — остаток
  trainPoints активного (не Флогистона) НЕ отображается. Зафиксировано
  в spec/npc.md (+4 строки, 37→41) + phrase-пин 000300 W1
  'ТОЛЬКО у Флогистона' + 5 guard-репинов 37→41 (spec-split +
  wording 000296 R3 / 000297 W1 / 000298 S1+S2). ЛОЖНЫЙ буллет
  memory/000300 («по листу вкладки (активному)») ЗАМЕНЁН.
* info-1 РЕШЕНИЕ (createEfir() fallback, src/efir.js): ДОБАВИТЬ
  `trainPoints: 10,` после `points: 0,` в fallback-литерал
  (10 → 11 ключей — канонический паритет). Обоснование:
  (а) doc-комментарий утверждает «fallback-литерал того же
  лейаута», канон — 11 ключей; (б) trainPoints — поле ЛЮБОГО
  листа (000300); (в) потребители БЕЗОПАСНЫ: npc.js typeof-guard
  (до фикса fallback-эфир имел trainPoints=undefined → guard
  ложится на 10 после deserialize; после — те же 10),
  serializeEfir до фикса отдавал 10 ключей (JSON дропал
  undefined, на загрузке backfill 10), после — 11 с явным 10:
  roundtrip-состояние ОДИНАКОВО; (г) пин key-set fallback'а НЕ
  существовало. Пин: ES-8 (RED до фикса — 10 ключей ≠ SHEET_KEYS
  11). FALLBACK НЕ ДОСТИЖИМ В БРАУЗЕРЕ (index.html: sheet.js
  до efir.js; fallback — только при Game.Sheet отсутствием, в
  браузере никогда) → ИЗМЕНЕНИЯ ПРОИЗВОДСТВЕННОГО ПОВЕДЕНИЯ НЕТ →
  CHANGELOG НЕ ТРЕБУЕТСЯ.
* info-2 (ре-пины «10 ключей» → «11 ключей», ТОЛЬКО current-
  утверждения): src/efir.js 10 мест (7 «ключей» + 3 «полей»;
  ОБЁРНУТОЕ вхождение L621-622 «новый формат (10\n// ключей)» —
  ТЗ считало 6, реально 7), src/companions.js 3 (канон-коммент +
  enumeration, «10/12 ключей» → «11/13», JSDoc @returns),
  tests/resurrect-e2e.test.js L459 (+ пометка «10 — old-format-
  фикстура ниже»), tests/companions.test.js ×2 (сообщения
  ассертов), tests/sheet.test.js (enumeration-коммент L82-84 —
  trainPoints В перечне; ссылка ТЗ :84 была устала — L84 =
  createSheet-вызов), tests/movement-freeze-e2e.test.js L486.
  НЕ ТРОГАТЬ (точно описывают 10-ключевые hand-crafted
  old-format-фикстуры): tests/items.test.js L4722 «Живой лист
  наёмника (10 ключей…)» + фикстура mercSheet00023006,
  литералы save.test.js sh()/S1–S4.

## Подводные камни

* enumeration'ы комментов (efir.js L37-38/L686-687, companions.js
  L497-499) — ДОПОЛНИТЬ trainPoints, а не только подменить цифру.
* Исторические guard-числа в ЗАГОЛОВКАХ НЕ ре-пинить (прецеденты
  000300/000312): spec-000297 W1 «(guard 26)», spec-000298
  S1/S2 «26 строк» — сохранены; заголовок 000300 W1 (собственный
  файл) — обновлён.
* А7/B5 — та же фикстура, что A1–A6, сменён ТОЛЬКО gold (и
  swordsman 2 — цена 60): иначе краснота была бы от другой
  причины (лимит/макс), не от gold-чека.
* B1 зависит от hero.points = 0 И efir.points = 3; в метках
  train-таба других строк «Свободные очки» нет (уникальная).
* Мутации — БЕЗ коммита (git restore): payChar→character в
  gold-чеке → A7/B5 красный; `?? 10` → `: 99` в deserializeEfir →
  ES-7 красный; УСЛОВНАЯ → безусловная в copyMercSheet → CS-8
  красный; drop trainPoints из sanitizeMercSheet → CS-6 красный.

## Ре-баз (значения — по диску)

ТЗ-база 97bf78f; master к финалу — f60357f+ (000314:
npc-storage 87→91, buildings 543→546, spec-000296 R4/000297 W2
87→91, +1 строка src/ui.js renderTradeTab). Пересечение файлов
000314×000334: spec-split + wording-000296/000297 — РАЗНЫЕ строки
(npc-storage vs npc.md) → авто-мерж чистый. Post-rebase-гвард:
npc-storage guard = 91 (НЕ 87), npc.md = 41.
