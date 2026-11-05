# 000336 — ретро-фикс батча b3-20261105: doc-дрейф + GUARD SKILL_META. Контракты

Задача: tasks/pending/000336.md (ретро батч b3-20261105, отчёты
tasks/result/*-retro-b3-20261105.md; master 965a35f; 0 major, 5
minor). docs/tests-only: src/ assets/ spec/ schema.json index.html
CHANGELOG.md — 0-diff. Задача = ПИНЫ/ДОКИ существующего поведения
(прецедент 000311/000334/000335: зелёные с первого запуска +
мутационные проверки осмысленности).

## 1. Что где поправлено (findings → file:line)

| finding | файл | место | фикс |
|---|---|---|---|
| 000323-1 | tests/sprites.test.js | L1702-1722 (шапка floor-секции) | «три пути/1..3/красные ещё не существуют» → «8 путей, n = 1..8, 40 файлов; 1..8; floorSeed — основной путь; легаси 3-арг. — API для фикстур; реализация существует — тесты зелёные»; line-count 21→21 |
| 000323-2 | memory/000323-dungeon-tiles.md | L98 | «203 → 206» → «203 → 213» (wc -l spec/dungeons-storage.md = 213; пин spec-split L132 = 213) |
| 000323-3 | memory/000323-dungeon-tiles.md | L73, L107-111 | легаси-ветка: «для chunk-render/wall-autotile … вызовы без формы подземелья» → «API для фикстур без формы подземелья (3-арг. вызовы — только тесты); производные точки рендера (обе в src/dungeon-ui.js: bakeDungeonChunk L325-326 + прямой цикл L793-794) — ВСЕ 4-арг. с d.floorSeed» |
| 000324-1a | memory/000324-magic-schools.md | L6, новый раздел перед «## Следующая задача» | «29/29/28/27/27/27» → «28/29/27/29/27/27» (факт диска: защита 28, исцеление 29, лёд 27, огонь 29, природа 27, тень 27; 167) + раздел «Уникальность id — ВНУТРИ type» + [info] sync-скрипт |
| 000324-1b | tests/efir.test.js | конец файла (после L2043) | НОВЫЙ GUARD (единственный новый тест задачи) — §2 |
| 000324-2 | tests/magic-schools-000324.test.js | L6 | коммент «29/29/28/27/27/27» → «28/29/27/29/27/27» (не ассерт) |
| 000324-3 | tests/efir.test.js | L170 | «skills — 37 записей, spells — 17 записей» → «skills — 43 записи (ре-пин 000324: 37→43, +6 школ), spells — 167 (ре-пин 000235.12: 142→167)» (ассерты не задеты: L832 = 43, L840 = 167) |
| 000324-3 dev (ОТКЛОНЕНИЕ) | tests/efir-sheet.test.js | L102 | тот же класс doc-дрейфа: «skills — 37 записей (6 primary + 31 secondary), spells — 16» → «skills — 43 записи (6 primary + 31 secondary + 6 school, ре-пин 000324: 37→43), spells — 167 (ре-пин 000235.12: 142→167)»; в явном списке ТЗ НЕТ — включено решением исполнителя (прецедент 000334 «ТЗ 6 мест, реально 7»; length-ассертов рядом НЕТ — проверено) |
| 000283.01.01 | memory/000283.01.01-control-consumer.md | L36, L76-83 | RNG-1: «легаси-моб (без debuff): 0 новых c._rng» → «фикстура = Суккуб (traits.debuff=true) с c._rng = () => 0.99 — ВЕЧНЫЙ промах ДО гейта debuff» — §3 |
| 000335 | tests/item-svg-flat-000335.test.js | L3, L10 | «218 иконок/218 SVG» → «193» (ТЗ «шапка L4» — реально L3+L10) |
| 000335 | memory/000335-icon-position-pin.md | L54, L82 | «218 SVG» → «193 SVG» (ТЗ «L54-55» — токен на L54) |
| батч-2 | — (фиксация, не правка) | — | tasks/result/000324.md:36 — круговая ссылка — §5 |
| батч-3 | — (фиксация, не правка) | — | TAP /tmp/000314-green-full.tap отсутствует — §5 |
| info | — (фиксация) | — | формулировка коммита f5b6d91 (sync-скрипт) — §5 |

tests/combat.test.js — ЧТЕНИЕ ТОЛЬКО (findings про формулировки
memory/коммитов, не про код).

## 2. id-коллизия «nature» — семантика + GUARD

ФАКТ (master): assets/skills — 43 файла (6 primary + 31 secondary +
6 school, ре-пин 000324) → 42 уникальных id: 000042 {id nature,
school, «Природа»} и 000031 {id nature, secondary, «Сердце
природы»} — ОДИН id на ДВА файла. Это ЕДИНСТВЕННАЯ коллизия каталога.

СЕМАНТИКА: id уникальны ВНУТРИ type, НЕ по всему каталогу. ТЗ 000324
«id уникальны (sweep каталога)» — НЕВАЛИДНА по master. Функционального
слома НЕТ: зеркало — отдельные контейнеры (SECONDARY_SKILLS-карта vs
SCHOOLS-массив в src/skills-data.js); EFIR_SKILL_CATALOG
(src/main.js:310-317: PRIMARY_SKILLS.concat(Object.values(
SECONDARY_SKILLS))) школы НЕ включает — 37 = 6 + 31; schema.json без
unique; A2 пинит набор id.

РЕШЕНИЕ 000336: НЕ переименовывать (rename рванул бы mirror/иконки/
spec/ссылки 000327).

SKILL_META (tests/efir.test.js L146-165): Map по id по ВСЕМ 43
файлам, порядок readdirSync, last-wins. Порядок на диске (проверено):
000031 — idx 30, 000042 — idx 41 → выигрывает ПОЗДНЕЕ — школа:
SKILL_META.get('nature') = {type: 'school', name: 'Природа'}.

Дизайн GUARD (tests/efir.test.js, последний test-блок): 43 файла /
42 уникальных id / dups = [['nature', 2]] / shape (ровно 1 secondary
+ 1 school) / имена (Сердце природы / Природа) / winner = school /
ВСЕ 37 id EFIR_SKILL_CATALOG за исключением «nature» — НЕ-school.
Порядок shape-ассерта — лексикографический: ['school', 'secondary']
(JS .sort(): 'sch' < 'sec' по 2-му символу 'c' < 'e') — от порядка
readdirSync НЕ зависит.

ОТКЛОНЕНИЕ ОТ ТЗ (критическое, прецедент 000334): буквальное
требование ТЗ «для ВСЕХ 37 id EFIR_SKILL_CATALOG SKILL_META.get(id)
— запись НЕ-school» КРАСНОЕ на master — 'nature' ∈ EFIR_SKILL_CATALOG
и SKILL_META.get('nature').type === 'school' (верифицировано прогоном
реплики L140-177 по диску) — противоречит императиву «зелёные с
первого запуска». Исправленный дизайн: «nature» закреплена КАК
ЕДИНСТВЕННОЕ задокументированное исключение + shape-пин. Утверждение
«без shape-пина мутация из ТЗ (000031 → type school) guard НЕ красит»
верно для МИНИМАЛЬНОГО ТЗ-дизайна (цикл по 37 id с исключением
«nature», без shape/name/length-ассертов): множество school-перекрытых
каталожных id остаётся ровно {nature}. В guard как написан мутацию
ловят ещё shape/name/length-ассерты (см. §7).

[info] Байт-байтность SCHOOLS с src/spellbook-oc.js (000301) —
СВОЙСТВО ДАННЫХ (пин A2): scripts/sync-skills-data.js КОПИРУЕТ из
JSON и НЕ сравнивает со spellbook-oc.js — формулировка коммита
f5b6d91 недостоверна; история master не переписывается.

## 3. Факт RNG-1 (000283.01.01)

tests/combat.test.js L11592-11631 (ТЗ «L11592-11614» — начало блока,
полный тест до L11631): фикстура = mobs: ['succubus']
(assets/mobs/000035.json L12: traits.debuff = true) с c._rng = () =>
0.99 — ВЕЧНЫЙ промах: 0.99 ≥ hitChance (ранний return по промаху —
ДО гейта debuff) и ≥ 0.25/mult. Гард: a.calls === b.calls (с бафом
fortitude = без бафа по call-счёту) + deepEqual снапшотов — стат НЕ
добавляет роллов в debuff-канале. Формулировка memory
«легаси-моб (без debuff)» — НЕВЕРНА. Покрытие мобов БЕЗ debuff
(short-circuit гейта &&, src/combat.js L2065:
u.traits.debuff && c._rng() < 0.25 / d.magicResistMult; L2120:
dealt > 0 && u.traits.debuff && c._rng() < 0.25) — RNG-гварды
REF-1 (L11278) / REF-1b (L11342) / REF-2 (L11383): mobs: ['wolf'],
assets/mobs/000016.json — traits НЕТ. Коммит 5cd354f (master) —
НЕИЗМЕНЯЕМ; правка — только в memory/000283.01.01-control-consumer.md.

## 4. «218» → «193» (000335)

8 коммитов волн 000302.01–.08 (7454d38/905eb73/55405bc/ce205f1/
c4be717/284bc1c/769f7de/dc38d36) затронули ровно 193 файла
assets/sprites/items (25×6 + 20 + 23; проверено git show --name-only
по каждому). memory/000302-icon-registry.md L68: «финал
000243.01: 318 с icon + 193 без» — 193 = файлы, которым волны
000302 создали иконки (итог .08: 511 = 511 с icon + 0 без). «218»
нигде не закреплён. Ассерты числа НЕ используют (пины: 478 в
svg.test.js, 46 заморозка, 183 в списках .01–.08) — правки
коммент-репины, 0 поведений. НЕИЗМЕНЯЕМО (master): «218» в
tasks/result/000335.md L36-37 и в коммит-сообщении 4234a98 — не
переписываются, фиксация здесь.

## 5. Батч-факты (фиксации, 0 правок master)

* TAP /tmp/000314-green-full.tap (имя из коммита f60357f) ОТСУТСТВУЕТ
  — tmp-артефакт невосстановим; на диске есть /tmp/000314-finalize-
  full.tap (3905/3905 — тот же счёт, другое имя). 5 прочих TAP батча
  на месте (проверено): 000335-precommit-full 3899/3899,
  000335-merge-full 3929/3929, 000283.01.01-postsquash-full
  3927/3927, 000323-postsquash-full 3923/3923, 000334-final-full
  3934/3934.
* tasks/result/000324.md:36 — круговая ссылка («…cluster 79/79
  (см. полный прогон в коммите)»): post-squash 3916/3916 в result
  НЕТ. Result по master НЕИЗМЕНЯЕМ. 3916 восстановимо: 3905 (база
  f60357f по отчёту 000314) + 11 (тесты 000324) и из
  tasks/result/000323.md:47 «база master f5b6d91 = 3916 + 7».
* [info] sync-скрипт — §2: байт-байтность SCHOOLS = свойство данных,
  НЕ действие scripts/sync-skills-data.js; формулировка коммита
  f5b6d91 недостоверна (master не переписывается).
* Отклонение [000324-3 dev] (tests/efir-sheet.test.js:102) — §1;
  включено с документацией (прецедент 000334).

## 6. Остатки вне SCOPE (кандидаты на follow-up, НЕ чинятся)

* spec/dungeons-storage.md L92-93 — «легаси 3-арг. вызовы
  (chunk-render)» тоже устарела (spec/ — 0-diff).
* tests/dungeon-floor-tiles-000323.test.js:182 — R6 test title
  «(chunk-render/wall-autotile)» — title ≠ коммент, не трогать.
* memory/000230-equipment-research.md:606 — «assets/skills — 37» —
  исторический файл (счёт на момент 000230), не переписывается
  (прецедент 000334/000143).

## 7. Подводные камни

* GUARD-exception «nature»: любой БУДУЩИЙ файл с id из 37
  каталожных (≠ nature) и type school — guard красный (notEqual по
  id); ренейм школы «nature» (например, nature2) — красный
  assert.equal(SKILL_META.size, 42) с фактом 43; добавление школьного
  файла — красный assert.equal(SKILL_FILES().length, 43).
* Мутация 000031 → type school красит guard в трёх местах (dups
  остаётся [['nature',2]] — count по id форма не меняет): shape-пин
  assert.deepEqual(types, ['school','secondary']) с фактом
  ['school','school']; name-ассерт secondary-записи (find по типу
  'secondary' → undefined → TypeError); assert.equal(catalog.length,
  37) → 36 (школ становится 7 — каталожный «nature» выпадает из
  не-school фильтра). «Только shape-пин» — про минимальный ТЗ-дизайн
  без этих ассертов (§2).
* Winner-ассерт зависит от порядка readdirSync (на этом диске
  стабилен: 000031 idx 30 < 000042 idx 41). Если ФС отдаст другой
  порядок — winner-ассерт покраснеет = явный ре-пин; коллизия как
  факт закреплена ассертами dups/types — они от порядка НЕ зависят.
* W-08 sync:check (tests/spells.test.js:3366, sync-all.js --check) в
  mutation-окне (мутация assets/skills/*.json) ТОЖЕ красный
  (регенерация src/skills-data.js из мутированного JSON ≠
  закоммиченному зеркалу) — ОЖИДАЕМО/транзиентно; slice-прогон по
  tests/efir.test.js его не включает. В полном прогоне по ЧИСТОМУ
  дереву W-08 красный = src/ задет = BUG (по ТЗ).
* Полный прогон (node --test tests/) — ТОЛЬКО в worktree, один за
  раз (pgrep -af «node --test» — пусто от чужих прогонов). База
  master 8ca9ecc = 3934 (по /tmp/000334-final-full.tap) + 1 GUARD =
  ожидание 3935/3935. После REBASE на актуальный master — повторный
  прогон; ожидание = свежая база + 1.
* File-count-пинов по tests/efir.test.js НЕТ — добавление test-блока
  в конец файла безопасно (новые require НЕТ:
  SKILL_FILES/SKILL_META/SKILL_CATALOG/SKILLS_DIR — существующие
  module-константы L139-177, fs/path/assert — в шапке).
