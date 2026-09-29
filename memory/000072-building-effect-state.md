# 000072: состояние эффектов построек — «раз в день» и благословения

Статус: РЕАЛИЗАЦИЯ выполнена — чистые функции в src/day.js,
разделы сейва в src/main.js; весь npm test зелёный (587 pass).
Отчёт и перенос pending→done — стадия Finalize.
Родитель: 000064 (план — memory/000064-building-effects-plan.md).

## Размещение функций — src/day.js, НЕ building-effects.js

* src/building-effects.js и tests/building-effects.test.js ПРИНАДЛЕЖАТ
  000071 (не запущен — ждёт мержа 000051): он создаёт их как НОВЫЕ
  (реестр EFFECTS + свои RED-тесты). Если 000072 создаст хоть один из
  этих файлов — гарантированный add/add-конфликт при старте 000071.
  Решение зафиксировано: 000072 их НЕ создаёт.
* Чистые функции 000072 — в src/day.js рядом с
  canUseToday/serializeDefeatedAt (node-требовальность; UMD-обёртка
  day.js без изменений — функции добавляются в возврат factory):
  serializeDayMap, restoreDayMap, grantBuff, activeBuffs, buffMods,
  restoreBuffs, serializeBuffs.
* Тесты 000072 — новый раздел tests/day.test.js (задача допускает
  «или новый раздел в day.test.js»), новый раздел tests/save.test.js и
  НОВЫЙ файл tests/save-restore.test.js (vm-цепочка index.html по
  паттерну tests/main-visuals.test.js, НО с мок-хранилищем
  window.localStorage — без него сейвы в песочнице не читаются/не
  пишутся и тесты вакуумны; наблюдение — dispatch захваченного
  window-слушателя beforeunload → saveNow → чтение мок-хранилища).

## Зафиксированные имена разделов сейва (неломкое расширение v1, 000031)

* data.buildingOncePerDay — объект 'x,y:effectId' → день (в памяти —
  Map в main.js; сериализация — serializeDayMap). Имя НЕ менять:
  000071 читает его через интерфейс buildingActions
  (state { day, tile, hero, save } — `save.buildingOncePerDay` из
  СНИМКА collectSaveData()). НЕ путать с отладочным __game.state.save
  (метаданные loadedSave { version, savedAt }).
* data.buffs — массив [{ source: 'x,y', day, kind: 'damage'|'armor' }].
* main.js НЕ трогает __game.state (новые поля туда НЕ добавляет) —
  diff только в state/save-секции (объявление состояния,
  collectSaveData, restoreFromSave — каждый раздел со СВОИМ try/catch,
  битый → console.warn + отброс; порядок — ПОСЛЕ блока дня/шагов,
  кламп использует clock.day) и в колбэке clock.onDay (очистка
  истёкших — в НАЧАЛЕ колбэка, рядом с dueForRespawn, НЕ рядом с
  render/saveNow — параллельные 000042/000051 правят те строки).
* Резерв (разделы НЕ создаются, каждая подзадача добавит СВОЙ по тому
  же паттерну; имена зафиксированы здесь и в задаче, чтобы потом не
  переименовывать): teleports (000075), buildingQuests (000074),
  buildingContent (000077), explored (000093).
* Версию сейва НЕ поднимать: save.js не трогать, CURRENT_VERSION = 1,
  MIGRATIONS пустые (регрессионный тест в save.test.js).

## Ключ 'x,y:effectId' и конвенция effectId

* Счёт — по ЭФФЕКТУ, не по постройке (фонтан: исцеление лимит /
  монета — нет; тесты day.test.js с синтетическими ключами).
* Конвенция effectId: латиница, БЕЗ ':', ',' и пробелов. Регулярка
  restoreDayMap: /^-?\d+,-?\d+(?::[^\s,:]+)?$/ (целые координаты, могут
  быть отрицательными; суффикс — опционален). Каталог эффектов
  (000073+) обязан следовать конвенции: id с ':' или ',' — запись
  тихо отбрасывается (fail-open: эффект снова доступен, игра не
  ломается).

## buffMods: правило агрегации ЗАФИКСИРОВАНО

* buffMods(buffs, day) → { damageMult, armor }. Активный 'damage' →
  damageMult = 1.05 (солнце), иначе 1; активный 'armor' → armor = 1
  (гора, +1 к броне), иначе 0. Неизвестный kind — игнорируется.
* Стакк: два источника одного вида → множитель ФИКСИРОВАН на ВИД
  (два храма солнца → 1.05, а НЕ 1.05×1.05 = 1.1025; две горы → +1,
  а не +2). 000076 потребляет buffMods как есть.
* Константы именованные (SUN_DAMAGE_MULT = 1.05, MOUNTAIN_ARMOR = 1) —
  поименует 000076.
* grantBuff — ЧИСТАЯ (новый массив, вход не мутируется); повтор
  (source, kind) — обновление дня (дублей нет), разные (source, kind)
  — сосуществуют.

## Отброс «будущего» и «истёкшего» (fastForward без слушателей, 000031)

* clock.fastForward при восстановлении НЕ оповещает слушателей →
  onDay-очистка НЕ пройдёт: restoreFromSave/restoreBuffs отбрасывают
  сами.
* buildingOncePerDay: день > clock.day — ОТБРОС (подделанный сейв;
  иначе canUseToday(99, 7) === true и эффект заблокирован на N дней);
  день < clock.day — держим (вредно не может: canUseToday(5, 7) ===
  true).
* buffs: день > clock.day (будущее, подделка) И день < clock.day
  (истёкшее) — ОТБРОС при restore; активен, пока buff.day >= day;
  легитимное благословение — 1 день, поэтому в сейве day === день
  мира. Whitelist kind: {'damage','armor'}; source — 'x,y'.
* clock.onDay — очистка истёкших (buff.day < day) — на будущее
  (живая игра), как в dueForRespawn.

## Реализация: предупреждения о битых разделах (main.js)

* restoreDayMap/restoreBuffs ТИХО возвращают пустое на мусоре
  (без исключения — принцип 000029), поэтому try/catch restore
  НЕ гарантирует console.warn на `buildingOncePerDay: 'junk'`.
  Решение (реализовано): в restoreFromSave — ЯВНАЯ проверка формы
  раздела (buildingOncePerDay — объект-не-массив, buffs — массив)
  ДО вызова restore: некорректная форма → console.warn с именем
  раздела + сброс; форма ок, но валидных записей нет при
  непустом разделе → тоже warn. Тесты save-require warn с именем
  раздела именно на 'junk' (строка).

## Момент «использовано» — решение для потребителей (000071+)

* 000072 НЕ добавляет потребителей canUseToday (осознанно: слои
  независимы) — потребитель buildingActions придёт в 000071, формулы
  боя — в 000076. canUseToday менять НЕ нужно (lastUsedDay > day →
  true; подделку снимает кламп restore).
* Применение эффекта (000071+): запись в состояние
  buildingOncePerDay.set('x,y:effectId', clock.day) (или запись в
  снимок + возврат в состояние) + saveNow() СРАЗУ после действия
  (паттерн onChange → saveNow из 000029, npcUI/buildingUI) — лимит не
  должен жить до beforeunload (краш между действием и закрытием —
  потеря лимита). Хелпер markDayUsed НЕ вводится: 000071 работает с
  состоянием напрямую через интерфейс main.js (форма `save` объекта
  фиксируется тестом 000071).

## Не трогать (владение/параллельные ветки)

* src/save.js (версия 1), src/combat.js (000076 + sanitizeSavedHero —
  явный список полей hero, регрессионный тест: на hero не появляется
  «дневных» полей), SPEC.md (подраздел «Эффекты построек» уже добавлен
  в 000064), index.html (day.js уже в цепочке), assets/,
  src/buildings.js. Файлы 000071 (building-effects.js/test.js) — не
  создавать.
* vm-тест зависит от стабов DOM/WebGL и живого main.js: параллельные
  workflow правят другие регионы main.js (000042 drawSprites, 000051
  панель/HUD) и ui.js — стабы/ассерты могут потребовать правки при
  ребейзе; перед мержем ОБЯЗАТЕЛЕН полный npm test после
  перебазирования на актуальный master.
