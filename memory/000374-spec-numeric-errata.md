# 000374 — spec-эррата numeric-путей уже флипнутых каталогов + индекс мёртвых ссылок в pending

База станции: первичная 9a08623a (после ff 000318.08), финальная 5c978b06
(ре-базы №1 212495ce/ff 000372, №2 bae5c0f1/ff 000373, №3 0c17f66b/ff 000345,
№4 abdc9314/ff 000375, №5 5f0f1f5c/ff ретро-b22, №6 96f1d232/ff 000320.27,
№7 5278ba73/ff 000381, №8 5c978b06/ff 000318.09 — пакеты файлов не пересекаются, все
rebase --onto ЧИСТЫЕ, range-diff везде побайтово тот же патч; ФИНАЛЬНЫЙ полный прогон
4633/4633/0 на базе 5278ba73/дереве af2fdd06 (v6), ранее 4623/4623/0 на abdc9314 и
5f0f1f5c; на дереве №8 — читательский срез 47 файлов 1104/1104/0 + ядро 66/66/0).
Docs-only: src/ assets/ scripts/ golden/ index.html CHANGELOG.md — 0-diff.
Источники: ретро-b21 (P3, Т5), долги memory/000318-asset-rename.md и memory/000370.

## 1. Дисковая классификация каталогов на базе (гейт-каталог для будущих свипов)

slug (numeric-путь мёртв): items (.318.08, 864 файла + schema), craft (.07),
buildings (.06), spells (.05), mobs/mob_groups/dungeons (.04), runes (.02), visuals (.03).
numeric (путь ЖИВОЙ, НЕ трогать до флипа): skills (44 JSON; флип — pending 000318.09),
npc (47 JSON; флип — pending 000318.10).

## 2. Внесённые эрраты (все line-neutral, правка внутри одной физической строки)

| # | Якорь | Было | Стало | Основание (живой факт) |
|---|-------|------|-------|------------------------|
| E1 | spec/items.md, H2 «Чертёж вида крафта (craft_scroll)», строка с `assets/craft/…` | `assets/craft/NNNNNN.json` | `assets/craft/<id>.json` | craft slug с 000318.07 (ASSET_NAME_SHAPES.craft='slug', scripts/lib/json-ref.js); долг, объявленный в memory/000318-asset-rename.md |
| E2 | spec/items.md, H2 «Архитектура хранения (каталог assets/items)», строка «отдельный JSON-файл …» | `(000001.json, 000002.json, …)` | `` `<id>.json` (basename === `id` + '.json'; переименован 000318.08) `` | каталог 864 slug-файлов, basename===id (tests/items-rename-000318.08.test.js T1); форма скопирована с шаблона spec/craft.md «Архитектура хранения»; именно эта строка названа «ложной прозой» в тестовом сообщении T9 того же файла |
| E3 | spec/buildings.md, абзац «Цена — особые_параметры.стройка», строка «`предмет` — ссылка на файл …» | `assets/items/NNNNNN.json` | `assets/items/<id>.json` | живой контракт схемы: tests/buildings.test.js R1 пинует pattern `^assets/items/<id>.json$` (ре-пин .318.08) — spec догонял код |
| E4 | spec/spells.md, § «Каст вне боя» / show_enemies, строка «пугливые (радиус 0) …» | «пугливые (радиус 0) — без окружности» | «пугливые — без окружности (в коде: radius = 1, отсечение флагом !info.triggers)» | src/combat.js groupZoneInfo → `return { radius: triggers ? 2 : 1, triggers };` — у нетриггерящих radius==1, НЕ 0; отсечение — src/main.js Проход 2.5 `if (!info || !info.triggers || !(info.radius > 0)) continue;` (долг 000370) |
| E5 | spec/spells.md, H2 «Навигационные заклинания», строка «Свитки изучения — assets/items …» | `assets/items 000512/000513` | `assets/items way_up_scroll/way_down_scroll` | реестр tests/scripts/items-num2id-000318.08.json: 000512→way_up_scroll, 000513→way_down_scroll; файлы assets/items/way_up_scroll.json / way_down_scroll.json на диске; тестовых пинов на строку нет (свип «Свитки изучения» по tests/ = 0) |

Побочный обязательный ре-синхрон: memory/000230.16-spec-equipment-doc.md §2 c9
«Текущий spec/items.md: 477 строк … байт» — байты пересняты ПО ДИСКУ финального
дерева (Buffer.byteLength utf8; счётчик канона tests/scripts/canon-items-sync-core.js
specMeta.bytes): 41580 → 41624 (+44 байта, E1+E2, line-neutral). Заставлено
tests/canon-items-sync-000284.02.test.js T10 и tests/items-rename-000318.08.test.js T9
(HEAD-guard: оба теста краснеют в ГРЯЗНОМ дереве до коммита — ожидаемый класс,
саморезолвится коммитом; полный прогон только на чистом закоммиченном дереве).
H2=13, H3=0, lines=477, trailing-\n=нет — НЕ двигались (SPEC_FILE_LINES items/spells/
buildings/mobs = 477/523/572/146 побитово в силе).

## 3. Сознательно НЕ правится (обоснование; зубья проверены чтением тестов)

* spec/items.md, H2 «Каталог новых предметов экипировки» (диапазон 000205–000240) и
  строки «Свитки навигационных заклинаний (000333): 000512 … 000513» (000294–000295):
  ГОЛЫЕ номера без `assets/`-пути — историческая проза волн, не путь; блок Е канона
  memory/000230.16 побайтово синхронен с H2 (canon-items-sync T-E) + игла
  W8A (tests/spec-000230.16-wording.test.js) держат region — правка = канон-бойня без
  выигрыша. Конвенция memory/000318-asset-rename.md §5: «числовые номера в текстах —
  история, а не путь».
* spec/mobs.md «(радиус агрессии 0 — может пройти мимо)» и «нейтральные/пугливые
  (радиус 0)» в §«Состав групп» / «Агрессивность» — фрейминг «не триггерит агро»,
  зафиксированный wording-пином tests/spec-mobs-companions-efir-wording.test.js;
  контракты, заставленные тестами, по ТЗ не ослабляются. Ложное ЧИСЛО здесь —
  семантическая метафора (дистанция провокации), в отличие от E4, где spec описывал
  поле radius, прямо противопоказанное кодом.
* spec/skills.md (000038–000043 — enum школ), spec/skills-storage.md, spec/npc-storage.md,
  spec/spells.md «резолв в JSON школы assets/skills (000038–000043)» — каталоги skills/npc
  ЕЩЁ numeric на базе; НЕ предвосхищать .318.09/.10 (Т1).
* Корневой SPEC.md — numeric-путей flip-каталогов 0 (гейт-свип базы), не тронут.

## 4. ИНДЕКС мёртвых numeric-ссылок в ТЕКСТАХ tasks/pending (Т3)

Скан базы 9a08623a; ТЕКСТЫ ЗАДАЧ НЕ ПРАВЯТСЯ (tasks/CLAUDE.md: закоммиченные в master
не менять). Волнам при старте — переснимать с диска своей базы.

* (а) `assets/buildings/<6 цифр>.json` — 76 файлов pending / 76 вхождений, все мертвы
  с 000318.06: серия 000320.27…000320.100 (74 файла, строка «Размещение (фикс):
  assets/buildings/NNNNNN.json — …») + 000373.md + 000374.md (сами цитируют дефект;
  000373 чинит свою строку по своему ТЗ). Встреченные номера (occurrences):
  000007×7 (arena), 000008×3 (blacksmith), 000010×6 (archery_range), 000011×4 (academy),
  000025×10 (npc_house), 000031×2 (cave_entrance), 000036×2 (temple), 000037×2 (moon_temple),
  000038×2 (mountain_temple), 000039×2 (abandoned_temple), 000040×1 (rune_stone),
  000041×1 (teleport_circle), 000042×1 (obelisk), 000043×1 (magic_circle),
  000044×17 (tavern), 000045×2 (well), 000046×2 (watchtower), 000047×6 (camp),
  000048×2 (ruins), 000049×3 (fountain). Полный ростер id→slug: memory/000318-buildings.md §1.
* (б) Шаблонная форма `assets/<каталог>/NNNNNN.json` в ТЗ волн:
  000321.11.md:14 `assets/spells/NNNNNN.json`, 000321.11.md:22 `assets/items/NNNNNN.json`,
  000321.13.md:20 `assets/craft/NNNNNN.json` (+000374.md:8 как цитата дефекта) —
  каталоги уже slug; брифам — читать как «<id>.json».
* (в) «каталог — 511 предметов (max 000511; иконки 478/33)» — 000321.08…000321.13
  (все по строке 5) + вариант 000321.md:11 «(каталог 511 предметов, 000230)».
  Диск: 864 предмета (после
  .321.07; .321.08+ добавят свои) — «max 000511» мертва дважды (рост каталога + rename).
* (г) «583 referrer-JSON» в tasks/done/000318.08.md:7,14 — первичная оценка ТЗ;
  факт мержа 942 файла / 3163 вхождения (сообщение коммита 9a08623a, T5 теста).
  В pending литерала «583» нет, кроме цитаты в 000374.md:29.
* (д) «391 referrer-JSON: craft 344, mobs 28, buildings 19» в 000318.09.md:7 — устарело
  на базе; НА ДИСКЕ 9a08623a numeric-путь `assets/skills/<6 цифр>` содержат 770 JSON
  в assets/: craft 693, skills (самоссылки школ) 32, mobs 27, buildings 18, npc 0.
  Волне .318.09 — пересчитать своей формулой isRef при старте.
* Нулевые категории (проверено, фиксация против ложных тревог будущих свипов):
  numeric-литералов `assets/(items|craft|spells|mobs|runes|dungeons|mob_groups)/<6 цифр>`
  в tasks/pending — 0 (только buildings, см. (а)); space-формы «assets/<flip-каталог> 000NNN» — 0.

## 5. Приёмочный гейт (переснимать грепом на каждой базе)

`grep -rnE 'assets/(items|craft|spells|mobs|buildings|runes|dungeons|mob_groups|visuals)[ /]+(0[0-9]{5}|N{4,})' spec/ SPEC.md` = 0
(до задачи: 3 — items.md:305, buildings.md:491, spells.md:409; после: 0).
Негативный контроль от перегиба: numeric-хиты skills/npc ОБЯЗАНЫ остаться
(spec/skills.md «000038–000043», spec/spells.md «(enum 000301) … assets/skills (000038–000043)»,
spec/skills-storage.md, spec/npc-storage.md).
