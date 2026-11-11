# 000359 — крафтовые навыки построек: исполнитель = активный лист

## Баг и корень

«Нанести руну»/«Стереть руну» (рунический камень 40, '40_inscribe'/
'40_erase') считали навык «Рунопись» ВСЕГДА с Флогистона:
applyRuneInscribe/applyRuneErase (src/building-effects.js) читали
heroRuneLevel(st.hero). Единая точка выбора исполнителя 000147 —
Game.LearnTarget.activeSheet(hero) — уже использовалась в
applyRuneSpell («Расшифровка (заклинание)») и applyMentorSpell
(«Наставник»), но инскрайб/эрэйз её миновали (000328.02 писалась из
паттерна gold-гейта, а не из learn-цепочки 000147). Итог: при выбранном
в оверлее спутнике/Эфире — спутник с runes=0 проходил при runes героя
≥1; спутник с runes=30 не давал скидки; при runes героя=0 — отказ даже
с сильным рунописцем.

## Фикс (единая точка)

НОВЫЙ модульный helper craftExecutor(hero) в src/building-effects.js
(ровно прежний inline-паттерн 000147: есть Game.LearnTarget.activeSheet
→ activeSheet(hero), иначе hero). Применён:
  * applyRuneInscribe: R = heroRuneLevel(craftExecutor(hero)) — гейт
    R≥1 ('нужен навык «Рунопись»') И скидка inscriptionCost;
  * applyRuneErase: то же для eraseCost;
  * applyRuneSpell/applyMentorSpell — прежние inline-точки СВЕДЕНЫ к
    helper (bit-identical, поведение не меняется).

Семантика (осознанно): исполнитель даёт НАВЫК; ЭКИПИРОВКА-ЦЕЛЬ и
ЗОЛОТО остаются на герое — прецедент mentor D5 «казна партии — герой»
+ прямое требование не ломать списание золота; у merc/Эфира gold нет
вовсе. Эфир: «дух чертит руну на экипировке героя за золото партии» —
Эфир не экипируется (allyReject 000230.06), перенос цели на лист
сломал бы Эфир-путь и расширил бы контракт 000328.02 без требования ТЗ.
Листья-исполнители — generic secondary.runes (000147 D8): миграция
сейвов merc/efir НЕ нужна (листы несут те же 11 полей sheet.js).

Спец-модуль мира src/building-effect-runecraft.js навык НЕ читает
(setItemRunes(герой, slot, next), hero.gold -= r.cost) — 0-diff;
пин неизменности — T6 нового теста.

## Свип-таблица эффектов построек с навык-зависимостью

| эффект | навык | источник до | решение |
|---|---|---|---|
| '40_inscribe' | Рунопись (гейт+скидка) | HERO | ИСПРАВЛЕНО (craftExecutor) |
| '40_erase' | Рунопись (скидка) | HERO | ИСПРАВЛЕНО (craftExecutor) |
| '40_spell'/'42_spell' | Рунопись (canLearn) | activeSheet (000147) | guard-пин T7 |
| NN_mentor (17/18/19/21/38) | canLearn source | activeSheet (000147) | guard-пин T7 |
| спец 'craft' (кузницы 8+25, алхимия 3+17+18, зачарование 12+18+25, столярное 5, резьба 40+48, рунопись 40+16+42 — src/craft.js/craft-ui.js) | forge/alchemy/runes/dexterity | HERO | ДОЧЕРНЯЯ 000359.01: performer-API craft.js + поля craft/craftXp/craftTypes в copyMercSheet/serializeEfir (сейчас НЕ сохраняются — тихая потеря прогресса при сейве) + designer-решение маны зачарования у листов без mp ⇒ миграция сейва |
| '40' «Расшифровать» | Рунопись (шанс/XP) | HERO | НЕ трогать: НЕ крафт; XP-проводка героя (000074/000076); follow-up-кандидат ретро |
| 'coin' фонтан 49 | Ловкость (шанс) | HERO | НЕ трогать (не крафт; золото героя) |
| '45' колодец | Тать (derived) | HERO | НЕ трогать |
| '48' руины | Интеллект | HERO | НЕ трогать |
| '44_perform' таверна | Выступление | HERO | НЕ трогать (gold-проводка героя); follow-up-кандидат |
| heal/fullrest/camp/resurrect/storage/43/39/41/37/36 | — | — | нет гейтов |

SKILL_CRAFT_TYPE/CRAFT_TYPE_SKILL — src/craft.js (рунопись→runes,
кузнечное→forge, алхимия→alchemy, столярное→dexterity); экран крафта
рун идёт этим экраном, НЕ инскрайтом.

## Тесты

tests/building-craft-skills-000359.test.js — 7. Харнесс: паттерн
spells-any-party (withGame/withState set/restore, РЕАЛЬНЫЕ
Party/LearnTarget, sheetLike-листы, roster-запись 000143) + applyGame
фейк runes-mechanics-000328.02. Golden: common-шляпа, база 20 ⇒ R30
(кап 0.5) даёт 10/стирание 5; R0 — 20/10.
  * T1/T2 наёмник 0/30, T3 Эфир (обе ветки), T4 erase-скидка листа,
    T6 «Мало золота…стоит 10 з.» (скидка листа + плата героя
    одновременно) + runecraft-пин; T7 свип {inscribe,erase}×{merc,efir}
    позитив+негатив + guard 40_spell/mentor + реестр «не чиним».
  * T5 guard (зелёный на базе): без пикера — герой-путь bit-identical
    (контракты 000133/000147 D2).
Ре-пины существующих тестов НЕ потребовались: фейки
runes-mechanics-000328.02/building-effects НЕ содержат LearnTarget ⇒
fallback hero — golden-поведение intact (проверено срезом).

## Мутации (стейдж перед матрицей)

  * M1 craftExecutor→hero в обоих apply → краснеют T1–T4/T6/T7, T5 зелёный;
  * M2 только erase вернуть на hero → T4/T7-erase краснеют;
  * M3 безусловный LearnTarget.activeSheet в craftExecutor (слом
    fallback) → T5 краснеет (старый контракт);
  * M4 перенос золота/экипировки на лист → T6 краснеет.
Артефакты: /tmp/000359-m{1..4}.tap; матрица — tasks/result/000359.md.

## Условия ре-пина

Если спец-модуль '40_inscribe'/'40_erase' начнёт читать навык или
переносить цель на лист — ре-пин T6 + этого файла. Если 000359.01
введёт performer в craft.js — свип-таблица расширяется строкой 'craft'.
Если волна вернёт в effect-записи каталога текст навыка — ничего.

## Коллизии

Живые волны 11-11: 000321.05 (items/craft-ассеты, зеркала items-data/
craft-data — src/craft.js НЕ тронут), 000320.18 (npc-data), 000348
(spells/dungeon), 000355 (combat FX) — 0-diff пересечений с этой
правкой (секция руны в building-effects.js :1120–1270). CHANGELOG —
общая секция даты мержа (прецедент changelog-merge-date-section).
