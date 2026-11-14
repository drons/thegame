# 000376 — d-pad скрыт на время окна расстановки (контракт 000260)

Задача пользователя: экранный d-pad (.tc-dpad, z-30, pointer-events:auto)
перекрывал клики по угловым клеткам нижних строк расстановки перед боем.
Движение d-pad'ом в расстановке уже мертво (000305) — контрол только
мешает. Цель: на время активного окна расстановки d-pad скрыт; после
ЛЮБОГО выхода — ровно то же состояние видимости.

## Механизм (ортогональный флаг в ui.js-каскаде)

* src/ui.js (touchControls-IIFE): closure `let dpadSuppressed = false`;
  запись dpad в applyVisibility — `(dpad && !dpadSuppressed) ? '' : 'none'`
  (КОМПОЗИЦИЯ обязательна И здесь: кадр main.js, меняющий buttons,
  иначе перезаписал бы '' поверх скрытия — мутация M6); НОВЫЙ метод
  поверхности `setDpadSuppressed(on)` — строгая нормализация `=== true`,
  change-guard (повтор без DOM-записей), после смены пишет эффектив
  `(parts.dpad && !dpadSuppressed)`. Null-guard'ы: `!root` → return
  (pre-init), `dpadEl === null` (клавиатурная схема 000123) — запись
  только в кнопки.
* src/combat-ui.js: хелпер `syncPlacementDpad(on)` — ЛЕНИВОЕ чтение
  `liveGame().touchControls` (UMD-замена Game 000038: снапшот G обязан
  видеть поздних потребителей и spy-подмены тестов; паттерн motion.js
  000174) + typeof-guard метода (mixed-версии: старый ui.js без нового
  метода → деградация «d-pad видим» = прежнее поведение, не крах —
  пин D5).
* Точки вызова (РОВНО 4): build() сразу после `placeOpen = true` →
  true; closePlacementWindow() СРАЗУ ПОСЛЕ раннего return-гарда
  `if (!placeOpen || !ctx)` → false — ОДНА точка покрывает ОБА хвоста
  (обычный и result-ветку) и все выходы 000260 идут через эту функцию
  (кнопки панели/«В бой»/побег-да/Enter/KeyH/KeyK/табличное действие);
  finish() и catch startCombat (обе teardown-точки правила 000170) →
  false (идемпотентно при уже закрытом окне — change-guard в ui.js).
  Ранний return closePlacementWindow — БЕЗ вызова (уже false; пин
  D3 «да» побега: повторный close не порождает уведомлений).
* 0-diff (Т2): src/controls.js (чистый touchControlsVisibility —
  «прочие поля снимаются, но не потребляются» 000150 не расширяется),
  src/main.js (клей кадра), index.html (инлайн display работает поверх
  каскада, !important в .tc-dpad нет), spec/, assets/.

## ФОРМУЛА для будущих потребителей

Любой новый код, решающий показать/скрыть d-pad, обязан учитывать
dpadSuppressed: эффективная видимость = touchControlsVisibility(screens)
&& !dpadSuppressed. Прямая запись dpadEl.style.display в обход
applyVisibility/setDpadSuppressed рассинхронизирует closure parts.
Скрытие окна расстановки — ВСЕГДА через closePlacementWindow()/finish()/
catch (новые места выхода из 000260 обязаны быть внутри них; проверка:
grep 'placeOpen = false' в combat-ui.js даёт РОВНО 5 совпадений:
объявление let + result-ветка + хвост closePlacementWindow (оба закрыты
хуком сразу после guard'а функции) + finish + catch (оба со своими
хуками). Любое НОВОЕ место записи — сигнал добавить хук.)
Инвариант «РОВНО 5 + покрытие» отныне запинен зубом 000376-D10
(задача 000381, тот же файл): при легитимной НОВОЙ покрытой записи
счётчик зуба переснимать ПО ДИСКУ финальной базы; окно близости хука
к записи в зубе — ±8 строк (teardown-блоки finish/catch сидят на +5).

## Карта ре-пинов (база e90bc26e)

* tests/ui-touch-visibility.test.js TV4 — ЕДИНСТВЕННЫЙ сломанный
  поведением существующий тест (ассертил dpad visible сразу после
  startCombat+frame, а окно расстановки открыто в каждом старте боя):
  ре-пин «в расстановке скрыт → после Enter видим → после конца боя
  восстановлено». Префикс-маркер «TV4» в имени сохранён (TAP-зуб).
* Ре-проверено свипом — НЕ требуют ре-пина: combat-ui.test.js (цепь без
  ui.js → touchControls undefined → guard no-op, бит-в-бит), TV1-TV3,
  TV5-TV8 (TV8 пинует только buttons-единицу), squad-placement-e2e,
  movement-freeze-e2e (dpad-тапы — мир/пикер, display не читают),
  lunge-visibility-e2e (overlay, не dpad), ui-button-* (состав детей/
  CSS), controls.test/index-order (список методов touchControls —
  проверка существования, аддитивный метод безопасен).
* Счётных golden/rng-пинов нет (данные и ассеты не тронуты), sync-зеркала
  не тронуты, sync:check=0 на чистом дереве.

## Тесты

tests/combat-placement-dpad-000376.test.js — 9 (D1..D9), три слоя:
минимальный vm ui.js (D1 подавление/ресторн/идемпотентность/=== true/
keyboard-guard, D2 композиция с applyVisibility в обе стороны — M6/M7/M8),
spy-цепь combat-ui (D3 матрица вызовов: старт [true], Enter/«В бой»/
действие/побег/result/finish → false, НЕ-выходы reset/Escape/шаг/отказ/
клик-по-мобу — без вызовов; D4 catch через ядовитый canvas.getContext —
build бросает ПОСЛЕ placeOpen=true; D5 деградация), e2e полная цепь
?controls=touch (D6 скрытие сквозь кадр + ресторн по Enter, D7 клик
«В бой», D8 победа при незакрытом окне → finish), D9 — guard-пин Т2
(таблица предиката + не-потребление чужих полей + applyVisibility без
подавления бит-в-бит). D5/D9 зелёнют в обеих фазах; RED = 7
осмысленных ERR_ASSERTION (/tmp/dpad-placement-red.tap), GREEN 9/9.
