# 000318.03 — assets/visuals: 0000NN.json → <slug>.json (basename «спрайт»)

Родитель 000318 (реестр — memory/000318-asset-rename.md); зависимость
000318.01 (ASSET_NAME_SHAPES/SHAPE_BASENAME_RES в scripts/lib/json-ref.js);
прецедент rename — 000318.02 (memory/000318-runes.md), НО с двумя отличиями
каталога visuals: имя ≠ id и зеркало содержит построчные комменты путей.

## 1. Имена (ростер номер→slug, id в JSON НЕ менялся)

slug = basename поля «спрайт» без «.svg» (13 уникальны; транслитерация не
нужна — спрайты уже англо-именованы):

| id | slug | id | slug |
|---|---|---|---|
| 1 | grass_blades_light | 8 | rock |
| 2 | grass_blades_dark | 9 | pebble |
| 3 | flower_red | 10 | snow_patch |
| 4 | flower_yellow | 11 | dry_tuft |
| 5 | flower_white | 12 | reed |
| 6 | bush | 13 | lily_pad |
| 7 | mushroom | | |

Иконки assets/sprites/visuals/<slug>.svg не тронуты; биекция 13≡13 json↔svg
по basename (tests/visuals-000318.03.test.js T2; tests/svg.test.js пин 13 цел).
schema.json правок не потребовала: pattern «спрайт» не зависит от имени JSON.

## 2. Контракт ПОРЯДКА (главное в задаче)

Прежняя sync-сортировка `.sort()` по имени файла была носителем порядка
записей src/visuals-data.js: lex-порядок имён нулевой ширины 000001…000013
== числовой порядок id (sync ПРЕРЫВАЛСЯ при id ≠ номер файла). Порядок входит
в формулы мира: tileVisuals (src/sprites.js) обходит VISUALS порядком массива;
seed = VISUALS_SEED + v.id·константа (сид ОТ id — он не сдвигается), но ВЫБОР
при потолке MAX_VISUALS_PER_TILE и порядок выдачи — от порядка массива ⇒
сдвиг порядка = видимое игроку изменение декора всей карты.

После rename lex-порядок slug-имён (bush=6, dry_tuft=11, flower_red=3, …) ≠
id-порядку ⇒ sync-visuals-data.js сортирует ПО ЧИСЛОВИЧ data.id — итоговый
порядок записей совпадает с прежним БИТ-В-БИТ: git diff src/visuals-data.js
показывает ИЗМЕНЕНИЯ ТОЛЬКО на comment-строках (шапка-диапазон путей,
«// <slug>.json» построчно, формулировки про id). CHANGELOG не требовался
(игрок видит то же). Проверка иглой:
`git diff -U0 src/visuals-data.js | grep -E '^[+-]' | grep -v '^[+-][+-]' | grep -vE '^[+-]\s*//'` — пусто.

Отличие от runes (.02): там компаратор был НЕНАБЛЮДАЕМ (basename==id делал
файтовый lex == id-порядку — завели tmp-тест T5). Здесь компаратор ЖИВО
наблюдается на самих slug-именах (страж T3 в тестах: lex-порядок файлов ≠
id-порядку), tmp-тест (T6) дополняет семантической проверкой.

## 3. Что где живёт

* Реестр: ASSET_NAME_SHAPES.visuals = 'slug' (единственная правка lib —
  слово). REF_RE НЕ дрейфует: visuals ∉ REF_LINKED_CATALOGS (каталог прямых
  svg-путей); побайтовый пин AR11 + страховка T4. Негативы AR2/AR5/AR14
  («assets/visuals/… — не ref») — навсегда; строковые литералы-негативы в
  AR2/AR5/AR12/RN5 с прежними путями ВАЛИДНЫ строками — не менялись.
* Sync: фильтр SHAPE_BASENAME_RES[ASSET_NAME_SHAPES.visuals] ЧЕРЕЗ
  ./lib/json-ref.js + явное `f !== 'schema.json'` (slug-regex матчит
  schema.json — грабель .02, повторён и в тестах); проверка «id = номер
  файла» убрана (номера в имени нет), множество {1..N} оставлено;
  компаратор `visuals.sort((a, b) => (a.data.id < b.data.id ? …))`
  grep-запинен (T7).
* tests/assets-renames-000318.test.js: NAME_OF_000318 — честный экстрактор
  имени slug-каталога (runes: id + '.json'; visuals: basename(спрайт)+'.json')
  ВМЕСТО ослабления свипа (basename==id дал бы 13 ЛОЖНЫХ нарушений при
  числовых id). RN2 slug-ветка: форма + NameOf-свип + уникальность id.
* Тихая деградация numeric-фильтров (визуально «зелёный вакуум»):
  assets-schemas.negative-control падал на files[0]=undefined — добавлен
  анти-вакуум guard; assets-refs dataFiles уже имел анти-вакуум ≥1.
* T6 tmp: зеркало visuals содержит построчные комменты «// <file>» — при
  перестановке содержимого между именами они ЛЕГАЛЬНО отличаются от
  закоммиченного, поэтому сравниваются РАЗОБРАННЫЕ массивы (порядок id +
  записи), а не байты (у runes .02 зеркало без построчных комментов — там
  байтовая сверка корректна). tmp-копирка ОБЯЗАТЕЛЬНО write-atomic.js +
  json-ref.js (прецедент .01/.02 M4: иначе MODULE_NOT_FOUND).
* spec/items.md — line-neutral правка буллета каталога (431 строка — пин
  spec-split.test.js сохранён, ре-пина нет).
* Сейв: визуалы в сейв не пишутся (детерминизм от seed+id) — миграции нет.

## 4. Мутации (поверх закоммиченной реализации; git restore)

* M1 сортировка обратно по имени файла → красные: T3 (lex==id страж +
  позиционный порядок), T5 (golden спрайт-путей), T6, позиционные пины
  sprites.test.js (файл ≡ каталог по позиции, 1:1 модуля), index-order —
  доказательство наблюдаемости порядка игроком/тестами.
* M2 id 13 → 14 в JSON (ростер сломан) → красные T1 (ростер) и
  assets-renames RN2; возврат → зелено.
* M3 реестр обратно 'number' при slug-диске → красные AR8/AR9 (анти-вакуум),
  AR10, RN1, RN2, assets-schemas-visuals, наши T1/T4 (живость реестра).
* M4 misname одного файла (не по спрайту) → RN2 NameOf + T1/T2.
* M5 убрать schema-исключение в sync → sync exit 1 («id отсутствует или не
  целый» на schema.json) — фиксация грабли.
