# 000343 — реюз Float32Array в buildFrame (RENDER-OPTIMIZE §5G / §5.1 G1)

## Путь (реализован)

`src/main.js`: рядом с `quadVerts` объявлен capacity-растущий склад
`uploadBuf` (замыкание модуля); в upload-регионе `buildFrame` вместо
`gl.bufferData(ARRAY_BUFFER, new Float32Array(verts), DYNAMIC_DRAW)`:

- рост: `if (uploadBuf.length < verts.length) uploadBuf = new Float32Array(verts.length)`
  (ёмкость = исторический максимум вершин, растёт редко);
- `const view = uploadBuf.subarray(0, verts.length)` — СВЕЖИЙ exact-length
  view каждый кадр;
- `view.set(verts)` — бит-в-бит ≡ прежняя аллокация (см. V8-пробы);
- `gl.bufferData(ARRAY_BUFFER, view, DYNAMIC_DRAW)` — ВСЕГДА, 1 вызов/кадр,
  в т.ч. при 0 вершин.

Экономия — data-block аллокация кадра (steady: был каждый кадр новый
Float32Array(0), теперь только лёгкий view-объект). `bindBuffer` /
`vertexAttribPointer` / `return verts` не тронуты; count drawArrays —
по-прежнему `verts.length / 6` из `frame()`, не из буфера.

## Нумерация RM (эррата 000342 — НЕ путать)

- **RM-6** = «на кадр ровно 1 rAF-планирование + 1 clearRect(#sprites)»
  (tests/global-map-draw.test.js:597) — bufferData НЕ касается.
- **RM-10** = «ровно 1 bufferData + 1 drawArrays count=0» на пустом кадре
  (тест :840, ассерции :864/:866/:868–869). Дубль пина —
  render-steady-gate-skip-000339 T4 (:473–506). Оба пина — 0-diff, без
  ре-пинов.

## Почему нельзя было иначе (запрещённые ветки ТЗ, доказано мутациями)

1. **bufferSubData при неизменной capacity** (классический путь (б)) —
   убирает вызов bufferData с тёплого кадра → RM-10 :864 краснеет.
   Мутация M4 это показала: global-map-draw RM-10 + RM-BA группа красны
   (+ T3/T7 нового теста). Путь ЗАПРЕЩЁН пинами, не стилем.
2. **Прпуск bufferData при 0 вершин** — тот же RM-10 (steady-кадр вообще
   без записей bufferData).
3. **Отдать тот же объект** (кэш EMPTY-константы / возврат всего склада) —
   красит 000339 T4 :486–488 `assert.notEqual(prevData, curData)`
   («каждый кадр — НОВЫЙ Float32Array»). Отсюда ОБЯЗАТЕЛЬНОСТЬ subarray:
   V8-проба — `subarray` всегда возвращает свежий view-объект (даже
   `subarray(0,0)` на пустом буфере; `.buffer` общий). Мутация M3
   (`view = uploadBuf` без subarray) красит и T4 нового теста, и канарейку
   000339 T4, и точную длину (T5: грузится весь capacity).
4. **«Кэш-массив» вместо склада бессмысленен** — `quadVerts` уже
   переиспользуется (plain-массив); аллоцировался только Float32Array.

## V8-пробы (Node 18.19.1, проба в /tmp задачи)

- `new Float32Array(0).buffer !== new Float32Array(0).buffer` — zero-length
  буферы НЕ шарятся ⇒ RED-пин T2 осмыслен даже на steady-серии (4 разных
  ArrayBuffer на HEAD).
- `subarray` — свежий объект каждый вызов; data-block общий с складом.
- `view.set(plain)` ≡ `new Float32Array(plain)` побайтно (Buffer-cmp на
  1.5/NaN/±Infinity/−0/1/3/2^53/denormal) ⇒ вывод GPU бит-в-бит.
- Счётчик аллокаций: `class Counted extends Float32Array` +
  `Object.defineProperty(Counted, Symbol.species, {get: () => Native})`.
  БЕЗ species-pin `subarray` идёт через TypedArraySpeciesCreate и
  ЗАСЧИТЫВАЕТСЯ аллокацией (n=2 на ctor+subarray) ⇒ «0 аллокаций»
  недостижим; со species вью нативные и не считаются. Пин вида вшит в
  харнес T6 — при его случайном удалении T6 покраснеет сам.
- `Float32Array(0).subarray(0, n)` ОБРЕЗАЕТСЯ до длины буфера (без
  исключения), а `set` в обрезанный вью кидает RangeError — мутация M2
  (убрать growth-ветку) красна именно так.

## Харнес-грабли (ловушки теста)

- **canvas.width/height = 0 до первого `frame()`** (задаётся в resize-ветке
  frame): без pump-кадра `visibleTileRange(..., 0, 0, ...)` даёт 2×2 тайла
  и НЕ растёт от зума ⇒ сценарий роста capacity в T6 недостижим без
  РАЗМЕРНОГО frameAt перед замерами.
- `__game.state` — ГЕТТЕР, собирающий новый снапшот при каждом чтении:
  кэшированный `const st = __game.state` устаревает (zoom виден старый);
  перечитывать.
- Кросс-realm: `deepStrictEqual` sandbox-typed-array против host-эталона
  падает по прототипу — сравнения нагрузок только `Array.from` (bufNorm
  000339) / `Buffer.from`; золотые литералы — host-массивы чисел.
- Золотые литералы T1 — крошечный вьюпорт 16×16 (диапазон 3×3 тайла,
  324 floats), сняты на HEAD; miss ≡ hit и повторный boot ≡ boot.

## Stale-ссылки: стаб хранит data ПО ССЫЛКЕ

Склад мутируется следующим кадром, а gl-стабы (global-map-draw, 000339,
000340, 000276, main-visuals, mob-chase-e2e) пишут payload в запись без
копии. Аудит 2026-11-11: все контентные чтения — НЕМЕДЛЕННЫЕ после
frameAt-сброса (в 276 :558/:566, main-visuals :1778, mob-chase :974,
global-map-draw :863–869 — в том же синхронном блоке после pump).
Единственное живущее между кадрами — `prevData` в 000339 T4: читает
ТОЛЬКО идентичность (notEqual), не содержимое — по замыслу.
БУДУЩИМ ТЕСТАМ: не сохранять `bds[0]` для контентных сравнений поздних
кадров — снапшотить `Array.from` сразу после кадра.

## Ёмкость склада

Склад = исторический максимум вершин кадра (худший legacy-кадр при
ZOOM_MIN частичной загрузки — единицы МБ Float32) — резидентно, но МЕНЬШЕ
прежнего пикового разового выделения каждого тяжёлого кадра; steady-режим
после лёгких кадров держит мелкий склад.

## Матрица мутаций (поверх GREEN, git restore между; TAP в /tmp)

| мутация | красное |
|---|---|
| M1 `new Float32Array(verts)` обратно | T2 (Set буферов), T6 (0 аллокаций) |
| M2 убрать growth-ветку | T1,T2,T4,T5,T6,T7 (RangeError в `view.set`) |
| M3 `view = uploadBuf` (без subarray) | T2,T4,T5 + **000339 T4** (канарейка) |
| M4 bufferSubData при неизменной capacity | T1–T5,T7 + **RM-10 global-map-draw** (+RM-BA группа) |

RED на базе 8bcf2284: 7/5/2 — красны T2,T6 (осмысленные ERR_ASSERTION).
GREEN: 7/7/0. Срез (--test-concurrency=1, 9 файлов: новый,
global-map-draw, 000339, 000340, 000276, main-visuals, mob-chase-e2e,
chunk-render, sync-all): 100/100/0. CHANGELOG без буллета (вывод
бит-в-бит, не геймплей — прецедент 000340).
