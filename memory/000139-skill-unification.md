# 000139 — контракт аудита: унификация прокачки партии

Исследовательская задача 000139: Флогистон, Эфир и наёмные NPC
прокачивают ОДИН И ТОТ ЖЕ набор навыков/заклинаний; различия — только
начальные списки. Страница «Персонаж»: сверху выбор активного
персонажа (портреты), под ним — просмотр/прокачка. Отдельная страница
Эфира — убрать. Код в research НЕ менялся; подзадачи 000140-000147.
Полный аудит: /tmp/thegame-wf-000139/a2-arch.md (ссылка в tasks/result/
000139.md).

## 1. Три модели-статус-кво (доказательства)

### Герой — src/player.js
* createCharacter L95-121: primary 6×1, secondary {}, points 0,
  spells ['spark','mend'].
* addXp L329-349: xpForNext = round(50·lv^1.5), points += 2/уровень.
* raiseSkill L301-323; practiceCap L366-370 = primary×2; _gainSkillXp
  на cap **бросает** лишний XP.
* Заклинания: canLearn/learn (src/spells.js L147-186) без вызовов в src
  — источники строит 000133 (in progress).
* Мёртвые derived: acroBonus L243, fearChance L248 (000135 follow-up),
  caveVisionMult L242 (000136).

### Эфир — src/efir.js
* 5-полевой сейв (000115): {level, xp, skillXp, skills,
  spells:['spark','mend']} (createEfir L130-138). Нет points/
  primary/gold.
* Атрибуты выводятся: efirStats L318-329, a=3+floor((lv−1)/2),
  Int=Wis=Con=a, maxHP=10+2a, maxMP=5+2a.
* Пул EFIR_SKILLS L266-273 (4 id + requires); практика дробная
  (practiceEfir L737-753), пересчёт с **bank** (reprocessEfirSkills
  L402-447, cap=attr×2).
* Заклинания: авто-разблокировки EFIR_SPELL_UNLOCKS L249-258
  (5/8/10/12/15/20/25/30).
* XP 100%: addEfirXp L184-192, единственный вызов — src/combat-ui.js:990.
* UI: ui-tab-efir.js — read-only (000116).

### Наёмные — src/companions.js + assets/npc
* 6 наёмных: assets/npc/000012..000017, `найм = {цена, жалованье, роль,
  dmg, hp, armor?, skills:[id], spells:[id]}` — навыки БЕЗ уровней.
* Запись L185: {npcId, level, xp, loyalty, hiredDay}.
* XP 50% (companion_xp_share; applyCombatXp L391-412; доля —
  combat.js allyXp L786-799, kind 'merc').
* Бой — makeAlly (combat.js L301-334): (8+4·lv)·hp·roleMult и т.п.;
  уровни навыков в бой не идут.
* UI: строки «Отряда» (ui.js squadUI L995-1250) read-only + «уволить».

## 2. Целевая архитектура (обязательна для 000140-000147)

* Новый src/sheet.js (чистый UMD, node-тестируем, Game.Sheet):
  state {kind:'hero'|'efir'|'merc', level, xp, points, primary{6},
  secondary{}, skillXp{}, spells[]}. Начальный список — параметр
  createSheet(kind, initial). derived(sheet, ctx) — боевые статы из
  характеристик + kind-модификатор. Очки 2/уровень — для ВСЕХ kinds.
  Практика: cap = prim×2, перелив — в **bank** (эталон: Эфир,
  reprocessEfirSkills).
* Сейвы: 000031 — version 1 не менять; hero-лейаут не менять; efir и
  companions записи backfill'ятся при deserialize (invalid → сброс +
  warn, паттерн 000029).
* Эфир сохраняет: 100% XP, Вдох Эфира, авто-разблокировки; формула
  efirStats — как derived-модификатор.
* Наёмные сохраняют: найм/жалованье/лояльность (companions.js);
  характеристики — из каталога (000141), бой — makeAlly из sheet.
* UI: «Персонаж» = ряд портретов сверху (000142) + лист активного
  (000145); вкладка «Эфир» — удалена (000146); «Отряд» — управление +
  переход.
* SPEC-правки (делают реализующие подзадачи, не research): SPEC L748
  («очков навыков нет» — наёмные) и L801 («очков навыков нет (v1)» —
  Эфир) заменяются описанием единой модели.

## 3. Карта подзадач (parent 000139)

| # | Что | Файлы (основные) | Зависимости |
|---|-----|------------------|-------------|
| 000140 | sheet.js + герой | src/sheet.js, src/player.js, index.html | — |
| 000141 | начальные списки наёмных | assets/npc/000012-17, sync, npc-data | — |
| 000142 | портреты (8 персон) | assets/portraits, sync, portraits-data, index.html | — |
| 000143 | наёмные на sheet | src/companions.js, src/combat.js, src/main.js | 000140, 000141 |
| 000144 | Эфир на sheet | src/efir.js | 000140 |
| 000145 | UI выбор активного | src/ui-tab-skills.js, src/ui.js | 000140/2/3/4 |
| 000146 | убрать вкладку «Эфир» | ui-tab-efir.js (удал), index.html, index-order pin | 000145 |
| 000147 | единое изучение заклинаний | src/spells.js, src/items.js, UI книги | 000133(мерж), 000143/4/5/6 |

Волны: A: 140∥141∥142 → B: 143∥144 → C: 145 → D: 146∥147.

### Конфликты с текущей волной (worktrees 000133-000138 существуют)
* index.html — 000138 (in progress) + 140/142/145/146: правки тегов
  минимальные, 140 стартовать ПОСЛЕ мержа 000138 (предпочтительно).
* src/combat.js — 000135 (in progress) + 000143 (makeAlly): патч
  143 — отдельный блок, переребейз дешёвый.
* src/spells.js — 000133 (in progress) + 000147: 147 — ПОСЛЕ мержа.
* src/ui.js — 145/146 последовательно.
* player.js/efir.js/companions.js — не трогаются текущей волной.

## 4. Решения аудита (открытые вопросы закрыты)
1. Очки 2/уровень — ВСЕМ (иначе «одинаковая прокачка» невозможна).
2. Стартовые характеристики наёмных — по роли (141 фиксирует цифры).
3. Авто-разблокировки Эфира — ОСТАВЛЯЮТСЯ + единые источники (147).
4. Портреты — новый каталог assets/portraits (142 решает детали).
5. Активный персонаж — per-session, дефолт Флогистон (в сейв не писать).
6. Перелив практики — bank (эталон Эфира) для всех.
7. Стартовые primary Эфира: Int=Wis=Con=3, остальные 1.

## 5. SPEC-разрывы вне scope 000139 (кандидаты в отдельные задачи)
* 14 из 18 школ навыков недостижимы (map_index только у id 7/8/10/11).
* «Вытаскивание из инвентаря (Удача)» не реализовано (SPEC L706; «Удача»
  — плейсхолдер, SPEC L540-541).
* Lottie-анимации — ассетов нет.
