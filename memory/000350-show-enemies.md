# 000350 — «Показать врагов» (защита, lvl2): круги радиуса агрессии на N дней

## Что сделано
Заклинание `show_enemies` (школа защита, уровень 2, мани 8, степень 1,
атрибут wisdom, действие «внебой», вне_боя true, здания
monastery(19) + healing_temple(21) + mountain_temple(38) — сет
warding_circle, свитка НЕТ — items 0-diff, прецедент .349). Длительный
эффект: `1 + Math.floor(Интеллект/10)` ДНЕЙ через штатный механизм
hero.outOfCombatEffects (expiresDay) — В ОТЛИЧИЕ от мгновенных
.348/.349. Проход 2.5 (агро-окружности 000172/000233) теперь рисуется
ТОЛЬКО при активном эффекте: по умолчанию круги скрыты (ТЗ 000350).

## Фиксированные решения
- **Дни от активации, день НЕ тратится** (бриф зафиксировал): каст из
  книги пишет expiresDay = day + showEnemiesDays(Инт) и не дёргает
  clock (spellbook-oc не содержит addStep — контракт 000235.02).
  Снапшот в момент каста: рост Интеллекта позже не продлевает;
  перезаклинание — in place от НОВОГО дня.
- **Формула читает hero.primary.intelligence** (ТЗ «Интеллект/10»),
  JSON-атрибут — wisdom (инвариант школы защита — все 29 защит
  wisdom); прецедент .349 Ф2 (attractionRadius/decadanceLevels).
  Границы: undefined/0/9→1, 10/19→2, 20→3, 55→6; мусор (¬число,
  NaN, ±∞, <0)→база 1 (пол — конвенция floor).
- **Гейт рендера**: `isHeroEnemiesShown(hero, clock.day)` — паттерн
  isHeroLit (`expiresDay > day`, НЕ «>=» квирка isHeroCamped);
  нет экспорта — тихая деградация (кругов нет). Гейт оборачивает ВСЁ
  тело П2.5, включая сужение cold_breath/dark_presence — стиль,
  z-порядок, фильтры, dash-гигиена 000172 D1–D5/000233 §3.2 бит-в-бит.
- **Радиус — ЕДИНЫЙ источник G.groupZoneInfo** (combat.js, 000135);
  никаких констант в spell-механике; нейтральные/timid — круга нет
  (triggers=false, D1 000172) — «для каждого моба» из брифа читается
  через единый источник (радиус агрессии не-триггеров = 0).
- **Каст только на героя**: книга кастует строго opts.hero
  (spellbook-oc:250), outOfCombatEffects живёт только на hero —
  «кто-то из персонажей» = герой (единственный cast-путь вне боя).
- **Валидатор days**: действие «внебой» требует статические
  параметры.days 1..3 (000235.02) — динамическая длительность
  статикой не выражается ⇒ `DYNAMIC_DAYS = new Set(['show_enemies'])`
  — исключение ПО ID в outOfCombatDays (прочие spell-ы — бит-в-бит,
  включая synthetic-пины IV3 и волновые свипы); ветка castOutOfCombat
  раннего возврата (позиция — сразу после attraction, до generic-
  mutation-блока): mp после проверок с free-check, запись in place,
  return {ok, spell, expiresDay}.
- **Сейв 0-diff**: sanitize/expire-механика generic, новый id проходит
  SPELLS_BY_ID-гейм sanitizeOutOfCombatEffects; версий сейва нет.
- **Бой**: действие «внебой» ∈ OUT_OF_COMBAT — боевой отказ БЕСПЛАТНЫЙ
  по действию, без новой проводки (000235.01).

## Таблица ре-пинов (база dbd238bf; счётчики — ПО ДИСКУ; каталог 171→172)
| файл | было → стало |
|---|---|
| spells.test.js зеркало/R1 | files/SPELLS/BY_ID 171→172 |
| spells.test.js R2 | 171→172; buildingRefs 283→286 (+3 — все 3 здания УЖЕ цели); Σ 484→487; baseRefs 34 / itemRefs 167 / filesWithItems 164 / targets 34/156/7 НЕ двигались |
| spells.test.js W-08 | spells-data 171→172 (items 764 не тронут — свитка нет) |
| spells.test.js W-01/W-02 | name-uniqueness/sweep 171→172 |
| spells.test.js «36 из 171» | «36 из 172» ×4 (Показать врагов — не урон; assert 36 не двигался) |
| spells-rename-000318.05 | SPELLS_SLUGS += "show_enemies" (между shield_wall и shroud); T1/T7 171→172 |
| magic-schools-000324 | A3 171→172; шапка «28/29/27/29/29/28» → «29/29/27/29/30/28» (защита 28→29; природа 29→30 — попутно исправлен дрейф .349, шапка не была обновлена) |
| spellbook.test.js | SB9 171→172; SB11 172→173 SVG (172 иконки + кнопка) |
| svg.test.js | реестр 'spell-icons' 171→172; W-05 ×6 assert+name →172; итог SVG из реестра (1521→1522 автоматически) |
| efir.test.js | SPELL_CATALOG 171→172 (пересечение волны 000359.01 — единственная разрешённая строка + шапочный коммент) |
| save.test.js | EFIR_SPELL_CATALOG 171→172 (то же пересечение) |

Дуговая цепочка (инверсия «по умолчанию не видно» авторизована ТЗ):
mob-aggro-circle scene(), aggro-visibility scene(), render-frame-subsets
boot(), chunk-render CC-2 (после assertReady; без сида z-слой «агро-
окружности» пуст и Math.min(...[])===Infinity), lunge-visibility-e2e
scenarioZoneAttack() — СИД `{spellId:'show_enemies', expiresDay:999}`
в общий live-массив (state.hero.outOfCombatEffects — та же ссылка,
main.js:4551); ассерты/ожидалки 0-diff (меняется только сцена).

НЕ ре-пинить (0-diff, бит-в-бит): spell-links-000237/000327,
scroll-links-000326 (свитка нет), волновые «вне_боя ровно 3/4» (25-id
scope), assets-schemas, SPEC_FILE_LINES/spec/ (spells.md — см. ниже),
GOLDEN/universam (rng цел — новых предметов нет), SCHOOLS/school-icons 6,
index.html (тот же canvas-проход, нового CSS-слоя нет), save.js,
dungeon.js, items/зеркало items-data.

Условия будущих ре-пинов: +1 spell = та же сетка (spells.test 172,
rename-множество, magic-schools A3, SB9/SB11, svg-реестр, efir/save);
свиток на show_enemies — items-цепочка 764→765 + GOLDEN-проба
(прецедент 000348); +длительный spell с формульной длительностью —
id в DYNAMIC_DAYS + ветка-ранний-возврат (иначе «неполные параметры:
days»).

## docs-дрейф (вне SCOPE, зафиксирован)
spec/spells.md §«Вне боя» не описывает динамические длительности;
перечень механик «внебой» в тексте — только warding_circle-подобные
static-days. Контракт ТЗ-уровня зафиксирован здесь и в
tasks/result/000350.md; spec/ 0-diff (SPEC_FILE_LINES) — кандидат в
будущий docs-errata-пасс.

## Ловушки
- deepStrictEqual на vm-массиве/объекте — чужой realm: гнать через
  JSON-рондтрип host() (S-VM-BOOK-11 краснел «равные» записи).
- Дефолтный Интеллект героя = 1 (createSheet hero) ⇒ каст из книги
  даёт 1 день; границы формулы ловит node-свип S-DAYS-4, не книга.
- mp в снапшоте __game.state.hero НЕТ — читать через beforeunload-сейв
  (паттерн saveHero из spellbook-oc-e2e; localStorage-стаб обязателен).
- Start window активен сразу после boot — KeyB блокируется; для
  book-контурa нужен startWindow.hide() (000138).
- Валидатор-исключение обязано матчить по spell.id, НЕ по действию
  (иначе ослабление контракта 000235.02 для всех «внебой»).
- sync:check/W-08 на грязном дереве краснеет штатно — зелёный после
  коммита (конвенция .12–.16/000344).
- render-frame-subsets — самый чувствительный харнес: ожидаемая
  секвенция строит агро-проход безусловно; сид обязан попадать ДО
  первого frameAt (boot) — иначе красный по всему join.

## Мутации (поверх коммита; git restore между; ФАКТИЧЕСКИЕ красные)
- M1 снять гейт рендера (арки всегда) → красные РОВНО S-VM-OFF-8 +
  S-VM-BOUND-10 + S-VM-BOOK-11 (BOOK ловит и пост-rollback «арки
  исчезли») — /tmp/000350-m1.tap.
- M2 удалить show_enemies из DYNAMIC_DAYS → из нового файла РОВНО
  S-CAST-5 + S-VM-BOOK-11 с «неполные параметры: days»; чужой IV3
  (spells.test ok 74) ЗЕЛЁНЫЙ; W-08 краснеет как sync-guard грязного
  дерева (артефакт мутации, не сигнал) — /tmp/000350-m2.tap.
- M3 floor→ceil в showEnemiesDays → РОВНО S-DAYS-4 + S-CAST-5 +
  S-VM-BOOK-11 (Инт=1: ceil даёт 2 дня) — /tmp/000350-m3.tap.
- M4 статический day+1 в ветке → РОВНО S-CAST-5 (BOOK при Инт=1
  совпадает) — /tmp/000350-m4.tap.
- M5 isHeroEnemiesShown матчит любой spellId → РОВНО S-GUARDS-7 —
  /tmp/000350-m5.tap.
- M6 «>= day» вместо «> day» в helper (точно строка 1492 внутри
  isHeroEnemiesShown — глобальный sed задел бы isHeroLit) → РОВНО
  S-EXPIRE-6 + S-VM-BOUND-10 + S-VM-BOOK-11 — /tmp/000350-m6.tap.
- M7 перезаклинание push вместо in-place (условие if→false; первый
  вариант «sePrior<0» НЕгоден — падает TypeError[-1], не ассертом) →
  РОВНО S-CAST-5 — /tmp/000350-m7.tap.
- Финал после restore: новый файл 11/11 + дуговая пятёрка зелёная
  (45/45) — /tmp/000350-m-final.tap.

## Тесты
tests/spell-show-enemies-000350.test.js — 11: S-JSON-1 схема/ключи/
roundtrip; S-SWEEP-2 уникальности каталога + sha256 иконки; S-MIRROR-3
зеркало (здания→[19,21,38], лекс.позиция shield_wall/show_enemies/
shroud) + items 0-diff; S-DAYS-4 границы формулы + мусор; S-CAST-5
castOutOfCombat-цепочка (expiresDay/day, РОВНО 1 запись, чужие записи
целы, −8 ровно, in place, mp<8 0-мутаций, бой бесплатный); S-EXPIRE-6
граница «>» + expire-вырезка; S-GUARDS-7 fail-closed + spellId-гейт;
S-VM-OFF-8 дефолт: РОВНО 0 арков при ≥2 групп в кадре; S-VM-ON-9 сид:
арки == expectedAgroCircles + 9-токенный стиль-окно 000233;
S-VM-BOUND-10 expiresDay=day → нет / +1 → есть; S-VM-BOOK-11 полный
контур [B]→клик строки→запись+сейв (mp −8)→арки→откат→арки нет.
RED 11/11 ERR_ASSERTION /tmp/000350-red.tap → GREEN 11/11
/tmp/000350-green.tap; срез 13 файлов (count+arc цепочки) 321/322
(красна только W-08 sync-guard грязного дерева — конвенция)
/tmp/000350-slice1.tap; повтор среза после коммита 322/322
/tmp/000350-slice2.tap; sync:check (scripts/sync-all.js --check) = 0
на чистом дереве; ПОЛНЫЙ прогон (гейт «node --test»=0,
--test-concurrency=1) 4464/4464/0 на базе dbd238bf (4453) + 11 новых;
РЕ-БАЗА dbd238bf→89a9c39c (000360+ретро-b18; пересечение — только
CHANGELOG, разные секции «11-12»/«11-10», авто; 000360 не менял число
тестов — 1 added/1 removed rewrite): кросс-срез 14 файлов 335/335
/tmp/000350-rebase-slice.tap; ФИНАЛ 4464/4464/0 на 89a9c39c
/tmp/000350-final-full.tap (маркеры базы: D-JSON-1/D-TELEPORT-8,
«ровно 30 файлов»; история первого прогона:
/tmp/000350-final-full-base-dbd238bf.tap).
