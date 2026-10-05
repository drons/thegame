# 000142: Портреты партии — справочник по данным и SVG

Компаньон к memory/000142-portraits-catalog.md (контракты, решения
D1–D16, подводные камни — там). Здесь: структура каталога, решение по
SVG (новые vs reuse), API зеркала portraits-data, позиция тега.
База master 45bbada, 2026-10-06. Worktree: .worktrees/task-000142.

## 1. Структура каталога assets/portraits/

Ровно 8 JSON + 8 SVG (source of truth — JSON; паттерн 000053).
Канонический порядок (зеркало генерирует в нём, не по readdir):

| # | файл | id | имя | title | kind | роль наёма |
|---|---|---|---|---|---|---|
| 1 | flogiston.json / flogiston.svg | flogiston | Флогистон | Герой | hero | — (герой) |
| 2 | efir.json / efir.svg | efir | Эфир | Дух | efir | — (постоянный союзник) |
| 3 | npc-000012.json / .svg | merc_volk | Вольк | Наёмник | merc | melee (swordsman) |
| 4 | npc-000013.json / .svg | merc_ashka | Ашка | Наёмница | merc | ranged (archer) |
| 5 | npc-000014.json / .svg | merc_baldor | Бальдор | Наёмник | merc | shield (heavy) |
| 6 | npc-000015.json / .svg | merc_mira | Мира | Наёмница | merc | support (meditation) |
| 7 | npc-000016.json / .svg | merc_torga | Торга | Наёмник | merc | melee (fists) |
| 8 | npc-000017.json / .svg | merc_rena | Рена | Наёмница | merc | ranged (archer + молнии) |

Схема записи (порядок ключей — канонический, генератор его сохраняет):
`{"id","имя","icon","title","kind","description"}`.
Для наёмных: id/имя/роль/описание — из assets/npc/0000NN.json; sync
сверяет id, имя, description (равенство) и title = upperFirst(роль)
(контракт — catalog-память §3.2).

description (зафиксированные тексты):
* flogiston: «Одинокий странник с посохом и вечным огнём: первый в
  отряде, последний, кто сдаётся.»
* efir: «Дух, привязавшийся к Флогистону: горячее пламя снаружи —
  тёплая забота внутри.»
* наёмные: РОВНО «описание» из assets/npc/0000NN.json (verbatim;
  не переписывать — sync сверяет равенство).

Имена файлов наёмных = npc-<номер npc-каталога>.json — номер напрямую
связывает портрет с assets/npc/<номер>.json.

## 2. Решение по SVG: НОВЫЕ (не reuse боевой фреймы) — D3

ТЗ дало выбор: reuse боевой фреймы ('sprites.efir.idle_0') или новые
простые SVG (по умолчанию — новые). ВЫБРАНО: новые. Почему:
* Боевые фреймы (assets/sprites/phlogiston|efir/*.svg, 64×64) — кадры в
  полный рост (idle_1/2, move, attack, dead), а не портрет; бюст из 64px
  в иконке 128px теряет детали и нарушает «в стиле logo.svg».
* reuse ломал бы тест ТЗ «файл svg существует» (иконка вне каталога
  assets/portraits/) и счётчик EXPECTED_SVG_BY_DIR по каталогам.
* Кросс-каталогная ссылка (portraits → sprites) добавила бы риск дрейфа:
  правка боевого арта 000145+ молча меняла бы иконки.
* ТЗ: «по умолчанию — новые» — дефолт не пересмотрен.

## 3. Спецификация SVG (8 иконок)

Заголовок каждого файла (фикс 128×128 — D13; ТЗ «≤128px»: фикс на
максимум, 000145 масштабирует CSS-шириной img):
```
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
  <title>Имя — портрет партии</title>
  …
</svg>
```
Статичные (без SMIL), плоский вектор. Без <text>/<filter>/xlink —
дизайн-решение (чистота иконок); гейт 000120 их НЕ запрещает
(logo.svg — «тяжёлый» позитивный пример) — не путать в отчётах
(catalog-память, камень 11).

Общая композиция (медальон, стиль logo.svg):
* фон: скруглённый rect x=4 y=4 120×120 rx=14, fill #0b0a1a,
  stroke #241f4a w=2 (logo: bg rect L228);
* золотое кольцо: circle cx=64 cy=64 r=54 stroke url(#ring) w=2
  (#f0d284→#8a5f1d, как ringG logo L25-28) + circle r=51 stroke #caa24a
  w=1 opacity 0.8 (logo L231);
* звёзды: 3–4 малых ромба (path dmd logo L32: M0,-7 L7,0 L0,7 L-7,0 Z)
  цвета #d9a63a / #cfd8ff — по углам внутри кольца;
* персонаж: бюст (голова + плечи) в clipPath circle r=50 (прецедент
  badgeClip logo L220), 4–8 плоских фигур;
* ОДИН ролевой аксессуар — главная отличительная черта персонажа.

Палитра (источники — assets/logo.svg + кадры спрайтов):
* фон #0b0a1a, #131030; кольцо #f0d284/#8a5f1d/#caa24a; звёзды
  #d9a63a/#cfd8ff;
* огонь: flameG #ff5a1f→#ff9d2e→#ffd35e→#fff3b8, свечение glowG
  #ffdf8a (op 0.9→0) — logo L9-19;
* циан: #8df2ff/#a5ecff/#7fe3ff (глаза нежити logo, пламяки Эфира);
* сталь #8f97a3/#cfd6dd/#8b95a0 (skelArcher/skelWar logo), дерево
  #6b4f33 (logo), кожа #f0c49e и оттенки #e8b98a/#e0b088/#d9a878;
* волосы/одежда — из логотипного семейства: #3a3468, #2e2957, #221d4f,
  #3a4a3f (трава logo L675), #7a68b8 (облака logo L250), #6b4f33,
  #c9a06a (ножка стрелы logo L157), #a5e86b (глаз орка logo, лечебный
  свет), #b0562e (рыжий — оттенок #8a5c33), #d9d3bf (skel logo L60).
Id градиентов — префикс per-file: fl_, ef_, m12_, m13_, m14_, m15_,
m16_, m17_ (гигиена, коллизий в <img> и так нет — namespace изолирован).

Силуэты (аксессуар — 1-й элемент отличия):
1. **flogiston.svg — Флогистон**: широкополая синяя шляпа (тулья
   #322c66, ободок #d9a63a), лицо #f0c49e, синий кафтан #322c66 с
   золотой окантовкой #c8963a; у правого плеча — наконечник посоха с
   языком пламени (flameG + круг glowG). Референс —
   assets/sprites/phlogiston/idle_1.svg («широкополая синяя шляпа с
   золотым ободком, синий кафтан, деревянный посох с огненным
   свечением»).
2. **efir.svg — Эфир**: циан-дух: пламя-макушка (#a5ecff), тело
   bodyG (#f4fffe→#b7f0fb→#52c4e8) stroke #1c7fa3, глаза #0d3a4a +
   белая искра, свечение (radial #7fe3ff op 0.28→0), маленькие
   руки-пламёны #8fe8fa. Референс — assets/sprites/efir/idle_1.svg.
3. **npc-000012.svg — Вольк (melee)**: рыжие волосы #b0562e, шрам на
   щеке (линия #8a4a3a), тёмная туника #3a3468; меч через плечо
   (клинок #8f97a3, рукоять #6b4f33, гарда #d9a63a).
4. **npc-000013.svg — Ашка (ranged)**: серо-зелёный капюшон #3a4a3f,
   светлые волосы под капюшоном #d9d3bf, глаза #2c3550; лук через
   плечо (дерево #6b4f33, струна #d8d3c5 — цвета skelArcher logo).
5. **npc-000014.svg — Бальдор (shield)**: крупная голова, борода
   #6b4f33, лицо #e8b98a; большой круглый щит перед плечом (#cfd6dd,
   золотая окантовка #d9a63a, заклёпка-босс #d9a63a).
6. **npc-000015.svg — Мира (support)**: коса #c9a06a, лицо #f0c49e,
   мягкая туника #5a626e; ветка с листьями (#3a4a3f/#a5e86b) и
   маленький лечебный свет (#a5e86b op 0.5) — аксессуар «лечит».
7. **npc-000016.svg — Торга (melee)**: бритая голова #e0b088, кожаная
   повязка #6b4f33 с золотой застёжкой #d9a63a; сжатый кулак на
   переднем плане (костяшки #e0b088, обводка #6b4f33).
8. **npc-000017.svg — Рена (ranged)**: фиолетовые волосы #7a68b8,
   глаза-искра #8df2ff; зигзаг-молния (#8df2ff) у плеча + колчан
   со стрелами (дерево #6b4f33, оперение #8df2ff/#e8c56a).

Проверка каждой иконки: npm test (svg-гейт 000120 — ДО коммита) +
`xmllint --noout` (независимая well-formedness; NaN ловит только
svg.test.js). Лёгкая схема (viewBox "0 0 128 128", width/height 128,
<title> с именем, без NaN) — тест P3 tests/portraits.test.js.

## 4. API зеркала src/portraits-data.js

Генерируется scripts/sync-portraits.js (НЕ редактировать вручную;
`npm run sync:all`). UMD (оболочка — как src/npc-data.js):
* браузер: `globalThis.Game.PortraitsData.PORTRAITS` — массив из 8
  записей в каноническом порядке (flogiston, efir, npc-000012…17);
* node: `require('src/portraits-data.js').PORTRAITS`.
Запись: `{id, имя, icon, title, kind, description}`.
Без хелперов (D6) — 000145 строит lookup сам:
`PORTRAITS.find(p => p.id === npcId)` (npcId — companions.js), 'flogiston'
для героя, 'efir' для духа; `p.kind` — готовый kind листа персонажа
000139. icon — имя файла; полный путь собирает потребитель:
`'assets/portraits/' + p.icon` (D2).

## 5. Позиция тега в index.html

ОДИН тег (с комментом), после тега `src/mob-groups-data.js` (L755),
перед тега `src/map.js` (L756) — конец блока данных:
```html
  <!-- Портреты партии (задача 000142): данные каталога
       assets/portraits (фолбэк file://). ПОСЛЕ блока данных
       (mob-groups-data.js), ДО map.js и ui.js (потребитель —
       вкладка «Персонаж», 000145; UMD-ловушка 000038). -->
  <script src="src/portraits-data.js"></script>
```
«После данных, до ui.js» (ТЗ) — выполнено: конец блока *-data.js;
ui.js — L817, main.js — L904 (тег строго до них — запинено).
Пин — tests/index-order.test.js, тест P7:
pos(mob-groups-data) < pos(portraits-data) < pos(map.js),
pos(portraits-data) < pos(ui.js) (не-смежный/union — совместим с
тегом sheet.js 000140 между map.js и player.js; контракт C4).
Контракт vm-цепочек: модуль обязан грузиться чисто (без console.error,
без DOM, без require) — ~20 песочниц с динамической цепочкой из
index.html подхватят тег автоматически (тест 000130, ui-efir и др.).
