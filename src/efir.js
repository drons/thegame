// Эфир: постоянный союзник (задача 000081, родитель 000065, SPEC.md
// «Дух Эфира»): «мини-персонаж» — частный случай фреймворка «союзный
// юнит» (000080, kind 'efir'; в бою — данные makeAlly, src/combat.js
// — без изменений).
//
// 000111: НЕЗАВИСИМАЯ прокачка (подзадача 000035) — собственный рост
// (порог xpForNext — тот же, что у героя), растущая книга заклинаний
// (старт [spark, mend] + пороги 5/8/10/12/15/20/25/30 — данные
// EFIR_SPELL_UNLOCKS; append-only; автоматически при level up), пул
// вторичных навыков (данные EFIR_SKILLS; потолок = основной атрибут
// НАВЫКА * 2 по ЕГО атрибутам; переучёт reprocessEfirSkills).
//
// 000112: buildEfirUnit(efir, c) — боевой профиль на юните поля
// (АПГРЕЙД существующего makeAlly-юнита, не создание): явные
// maxHP/hp (100%), своя мана u.mp = maxMP (без регена в бою),
// «Касание духа» u.damage (мораль ВНУТРИ round), пулы действий c.efs
// (паттерн refillPools), снапшот пула u.efirSkills, ссылка c.efir.
// Контракт — memory/000112-efir-combat.md.
//
// 000117: practiceEfir(state, skillId, amount) — практика ЕГО пула
// (guards — тихий []): skillXp += amount (дроби, округла НЕТ) +
// reprocessEfirSkills (потолок/Requires/overflow). Бой читает
// снапшот u.efirSkills — рост в следующий бой. Контракт —
// memory/000117-efir-practice.md.
//
// 000113: «Вдох Эфира» — ДАННЫЕ фирменного действия (формулы +
// flavor-строки — данные модуля, НЕ каталог): константа BREATH_INFO
// + breathInfo {name, desc, firstEncounter} (экспорт для UI, имя
// ТОЧНО) + one-shot takeFirstEncounterLine() (первая встреча —
// сессионный флаг, НЕ сейв) + СНАПШОТ u.breath в buildEfirUnit
// (бой читает данные с юнита — ноль модульной зависимости).
// Контракт — memory/000113-efir-breath.md.
//
// 000144 (follow-up 000139, P1, волна B; ТЗ — tasks/pending/
// 000144.md; контракт — memory/000144-efir-sheet.md): состояние
// Эфира — ЕДИНЫЙ «лист персонажа» Game.Sheet (src/sheet.js, 000140)
// kind 'efir': ровно 10 полей {kind, level, xp, totalXp, points,
// primary, secondary, skillXp, skills, spells} — npcId НЕТ (delete
// после createSheet: у листа Эфира нет иди). Перенесено в sheet.js
// ЧЕРЕЗ API (не копией кода): порог xp (xpForNext — тот же, что у
// героя), начисление (addXp), points 2/уровень, рост характеристик
// (raiseSkill), requires-гейты (canRaise), каскад (reprocessSkillXp).
// Фирменное — ОСТАЛОСЬ: EFIR_SKILLS (4 пула) — теперь НАЧАЛЬНЫЙ
// СПИСОК листа (firelord/perception 1 — подарки; icelord/precog 0 —
// инвариант requires), полное дерево 31 навыка доступно ОЧКАМИ
// (Sheet.raiseSkill — unified with hero, 000139);
// reprocessEfirSkills — собственный движок практики (bank-overflow,
// requires-«stay»: уровень НЕ нулится, банк не тронут), уровни — ИЗ
// secondary (истина), зеркало skills; EFIR_SPELL_UNLOCKS (8
// заклинаний, 5/8/10/12/15/20/25/30) — авто-разблокировки;
// BREATH_INFO — «Вдох Эфира». Боевые статы — derived-модификатор
// kind 'efir' (efirDerived — ВНУТРЕННИЙ) поверх БАЗЫ характеристик
// sheet (БАЗА — primary; формулы SPEC сохранены: maxHP 10 + 2·Тел,
// maxMP 5 + Инт + Мудр); рост — ОЧКАМИ, уровень атрибуты НЕ растит.
// efirStats(level) — ЗАМОРОЖЕННАЯ legacy-таблица (потребители —
// вкладка 000116 / список спутников / деградация buildEfirUnit).
// Сейв — НЕЛОМАЮЩИЙ (000031/000029): старый 5-полевой формат
// {level, xp, skillXp, skills, spells} → backfill (level/xp/
// skillXp/spells — 1:1; primary — старт-формула 3/3/3/1/1/1; кэш
// skills → secondary КАК ЕСТЬ + reprocess; points/totalXp 0);
// INVALID → null → main.js warn + createEfir(). Раздел 'efir' в
// сейве не переименован; CURRENT_VERSION без бампа.
//
// ЧИСТЫЙ UMD-модуль, НОЛЬ зависимостей при загрузки (прецеденты
// 000053/000038/000127): node — module.exports = factory(); браузер
// — Game.efir. Взаимных require при загрузке нет (обе ветки):
// Game.Sheet читается ЛЕНИВО в момент ВЫЗОВА (паттерн lazyGame /
// rootRef); снапшота Game при загрузке НЕТ (000038), throw на
// загрузке — НЕТ (мягкая зависимость).
//
// Состояние — лист (10 полей, 000144; форма ЗАФИКСИРОВАНА под сейв):
// HP/MP в состоянии НЕТ: каждый бой — новый makeAlly + buildEfirUnit
// (hp = maxHP) → «возврат со 100% HP» — СТРУКТУРНО, кода
// восстановления нет (serializeEfir/deserializeEfir — 000085, в этом
// же файле; расширение 000144 — sheet-лейаут + backfill).
// primary — БАЗА характеристик (истина: raiseSkill пишет сюда);
// secondary — истина о НАВЫКАХ (raiseSkill/reprocessSkillXp пишишь
// сюда); skills — ЗЕРКАЛО 4 id пула (пишет ТОЛЬКО
// reprocessEfirSkills dense; читает вкладка 000116 до 000146);
// skillXp — копилка практики (id → число ≥ 0, ДРОБНЫЙ разрешён);
// spells — append-only данные состояния (заклинания не удаляются).
// Код, пишущий в skills напрямую, — ОШИБКА (зеркало синхронизируется
// в следующем reprocess).
//
// Данные пула/книги/таблицы — В САМОМ МОДУЛЕ (SPEC «Дух Эфира» →
// «Данные и ассеты», паттерн 000053: НЕ каталог, НОВОГО assets/efir/
// НЕТ): EFIR_SPELL_START, EFIR_SPELL_UNLOCKS, EFIR_SKILLS (зеркало
// каталога assets/skills); ссылочная целостность id — тестом (T4).
//
// 100% боевого опыта: addEfirXp — ОБЁРТКА над Game.Sheet.addXp
// (сигнатура БЕЗ ИЗМЕНЕНИЙ: src/combat-ui.js L988-990 — точка ТЗ,
// не трогать). companion_xp_share НЕ применяется (доля — для
// наёмников, 000082; Эфир в allyXp не попадает по построению —
// положительный фильтр kind === 'merc').
//
// Деградация (игра никогда не падает): Game.Sheet недоступен на
// момент ВЫЗОВА → createEfir — ТИХИЙ fallback-литерал того же
// 10-полевого лейаута (одноразовый флаг деградации должен сгореть в
// addEfirXp — пин R6); addEfirXp — console.error ОДИН РАЗ (модульный
// let) + xp копится, уровень НЕ растёт, исключений 0; levelUp — 0
// (xp не трогаем); buildEfirUnit — legacy-таблица efirStats(level)
// (старые числа). Голий 5-полевой объект (ручной вход) — легальный:
// обёртки НЕ зовут Sheet.addXp без plain primary (derived в
// sheet.js упадёт на undefined primary). В браузере недостижимо
// (порядок index.html: sheet.js до efir.js — пин
// tests/index-order.test.js).
//
// Контракты: memory/000081-efir.md (решения), memory/000081-efir-
// ally.md (стабильный API для 000084–000087), memory/000111-efir-
// growth.md (000111: семантика переучёта — контракт для
// 000085/000112/000115/000116/000117), memory/000112-efir-combat.md
// (000112: боевой профиль buildEfirUnit), memory/000113-efir-breath.md
// (000113: «Вдох Эфира» — данные действия + снапшот u.breath),
// memory/000117-efir-practice.md (000117: практика ЕГО пула + боевые
// хуки combat.js), memory/000144-efir-sheet.md (000144: лист,
// derived-модификатор, backfill, деградация).
// Тесты: tests/efir.test.js (R1–R6, 000111 T1–T9, 000112 EF-1..4,
// 000117 PR-1..PR-5, 000113 BR-1), tests/efir-sheet.test.js
// (000144 ES-1..ES-7).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    // node: ноль взаимных require (чистый UMD, прецедент 000053).
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { efir: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {
  'use strict';

  // Game в момент ВЫЗОВА (ленивый захват, прецеденты 000127/000053):
  // модуль обязан грузиться с нулём зависимостей.
  function lazyGame() {
    return typeof globalThis !== 'undefined' ? globalThis.Game : null;
  }

  // 000144: порог xpForNext и начисление — теперь в Game.Sheet
  // (src/sheet.js, тот же порог, что у героя). Локального
  // xpForNext-блока и xpWarned НЕТ (удалено 000144). Флаг
  // деградации (ОДИН РАЗ на процесс — pин R6/ES-2): createEfir —
  // ТИХИЙ fallback (флаг НЕ сжигает), console.error — в addEfirXp.
  let sheetDegraded = false;

  // 000144: старт листа (решение аудита; SPEC «Дух Эфира» задавал
  // только тройку 3 — остальное 1; зафиксировано правкой SPEC
  // задачи 000144). Эквивалентно старой таблице при lv1 (a = 3).
  const EFIR_PRIMARY_KEYS = ['strength', 'dexterity', 'constitution',
    'intelligence', 'wisdom', 'charisma'];
  const EFIR_START_PRIMARY = {
    strength: 1,
    dexterity: 1,
    constitution: 3,
    intelligence: 3,
    wisdom: 3,
    charisma: 1,
  };
  // Начальный список (решение Q-1 000144): firelord/perception 1 —
  // подарки; icelord/precog 0 — инвариант единого дерева (requires:
  // icelord ← firelord 5, precog ← perception 5 должны выполняться в
  // любой достижимой конфигурации).
  const EFIR_START_LIST = { firelord: 1, icelord: 0, perception: 1,
    precog: 0 };

  /**
   * Состояние — лист Эфира (000144)? Чистый structural guard:
   * plain-object + kind 'efir' + plain primary. Голий 5-полевой
   * объект (до-000144) → false (обёртки идут в деградацию).
   */
  function isEfirSheet(state) {
    return isPlainObject(state) && state.kind === 'efir'
      && isPlainObject(state.primary);
  }

  /**
   * Три боевых атрибута Эфира (000144): из sheet.primary (истина),
   * по ключу — floor-integer ≥ 1 (мусор/<1 → 1). Деградация (не
   * лист / null) — legacy-таблица по уровню (старое поведение:
   * efirAllyData/efirSkillCap/reprocess на «голых» объектах).
   * @returns {{intelligence: number, wisdom: number,
   *   constitution: number}}
   */
  function efirAttrs(state) {
    if (isEfirSheet(state)) {
      const p = state.primary;
      const num = (v) => (typeof v === 'number' && Number.isFinite(v)
        && v >= 1) ? Math.floor(v) : 1;
      return {
        intelligence: num(p.intelligence),
        wisdom: num(p.wisdom),
        constitution: num(p.constitution),
      };
    }
    const level = (state && typeof state === 'object'
      && Number.isFinite(state.level) && state.level >= 1)
      ? state.level : 1;
    return efirStats(level); // legacy-таблица (есть все 3 ключа)
  }

  /**
   * 000144: derived-модификатор kind 'efir' (S-4: возвращает ПОЛНЫЙ
   * объект — БАЗА sheet-характеристик + формулы SPEC «Дух Эфира»):
   *   maxHP = 10 + 2·Телосложение; maxMP = 5 + Интеллект + Мудрость
   * (Л1: 16/11 — цифры баланса НЕ меняются). БАЗА — характеристики
   * sheet (решение ТЗ 000144); рост — ОЧКАМИ (primary), уровень
   * атрибуты НЕ растит. Единственная точка вызова ctx —
   * buildEfirUnit. ВНУТРЕННЯЯ (не экспорт).
   */
  function efirDerived(base, sheet) {
    const p = sheet.primary;
    return Object.assign({}, base, {
      intelligence: p.intelligence,
      wisdom: p.wisdom,
      constitution: p.constitution,
      maxHP: 10 + 2 * p.constitution,
      maxMP: 5 + p.intelligence + p.wisdom,
    });
  }
  const EFIR_DERIVED_CTX = { modifier: efirDerived };

  /**
   * 000111: книга append-only (старт + пороги ≤ уровня; дублей нет;
   * «заклинания не удаляются»). Мутация state.spells.
   */
  function appendSpells(state) {
    if (!Array.isArray(state.spells)) state.spells = [];
    for (const id of efirSpellsByLevel(state.level)) {
      if (!state.spells.includes(id)) state.spells.push(id);
    }
  }

  /**
   * «Мини-персонаж» Эфира: состояние — лист Game.Sheet kind 'efir'
   * (000144, 10 полей, npcId НЕТ): primary — старт-формула
   * (3/3/3/1/1/1); secondary = skills — начальный список (зеркало —
   * отдельный объект); skillXp — пустой банк; spells — старт
   * [spark, mend]. HP/MP в состоянии НЕТ: каждый бой — новый
   * makeAlly + buildEfirUnit (hp = maxHP) → «возврат со 100% HP» —
   * структурно.
   * Деградация (Sheet недоступен в момент вызова) — ТИХИЙ
   * fallback-литерал того же лейаута (конструктор не логирует —
   * пин R6; в проде недостижимо: index.html — sheet.js до efir.js).
   * @returns {object} НОВОЕ состояние (вызовы независимы).
   */
  function createEfir() {
    const G = lazyGame();
    const S = G && G.Sheet;
    if (S && typeof S.createSheet === 'function') {
      const s = S.createSheet('efir', {
        primary: Object.assign({}, EFIR_START_PRIMARY),
        spells: EFIR_SPELL_START.slice(),
      });
      delete s.npcId; // у листа Эфира нет иди (10 ключей — пин 000118)
      s.secondary = Object.assign({}, EFIR_START_LIST);
      s.skills = Object.assign({}, EFIR_START_LIST); // зеркало
      return s;
    }
    return {
      kind: 'efir',
      level: 1,
      xp: 0,
      totalXp: 0,
      points: 0,
      primary: Object.assign({}, EFIR_START_PRIMARY),
      secondary: Object.assign({}, EFIR_START_LIST),
      skillXp: {},
      skills: Object.assign({}, EFIR_START_LIST),
      spells: EFIR_SPELL_START.slice(),
    };
  }

  /**
   * Повышение ПОРЯДКА (000144: обёртка над Game.Sheet.addXp(sheet, 0)
   * — обрабатывает накопленный xp, семантика >= та же; порог — из
   * sheet.js, тот же, что у героя). ОБЯЗАТЕЛЬНО ПОСЛЕ (даже при n = 0
   * — идемпотентно): книга append-only + переучёт пула (потолок
   * вырос — overflow банка конвертируется).
   * Guards: state не object → 0; Sheet недоступен / state не лист → 0
   * (тихо: xp не трогаем — как старое поведение без порога).
   * @returns {number} число набранных уровней; 0 — см. guards или xp
   *   ниже порога.
   */
  function levelUp(state) {
    if (!state || typeof state !== 'object') return 0;
    const G = lazyGame();
    const S = G && G.Sheet;
    if (!S || typeof S.addXp !== 'function' || !isEfirSheet(state)) {
      return 0;
    }
    const r = S.addXp(state, 0);
    const n = (r && Number.isFinite(r.levelsGained)) ? r.levelsGained : 0;
    // 000111: книга + переучёт (контракт memory/000111-efir-growth.md
    // §3а/§4).
    appendSpells(state);
    reprocessEfirSkills(state);
    return n;
  }

  /**
   * Начисляет xp (000144: обёртка над Game.Sheet.addXp — ВЕСЬ, 100%
   * боевого опыта; companion_xp_share НЕ применяется: доля — для
   * наёмников, 000082; бонус «Учёный» — через derived.xpMult, эффект
   * 0 до 000147). while-цикл ВНУТРИ addXp: один бой может дать
   * НЕСКОЛЬКО уровней; остаток копится между боями. Книга —
   * appendSpells БЕУСЛОВНО после addXp (даже при n = 0 —
   * идемпотентен: self-restore книги 3-полевого legacy-сейва —
   * поведение master 000111). Тихие skip:
   * state null, amount не число/≤0/NaN → 0, state не мутирован.
   * Деградация (Sheet недоступен ИЛИ state не лист — голий 5-полевой
   * объект): console.error ОДИН РАЗ + xp копится в state.xp, уровень
   * НЕ растёт, возврат 0, исключений 0 (пин R6/ES-2).
   * @returns {number} число набранных уровней; 0 — см. тихие skip или
   *   деградация.
   */
  function addEfirXp(state, amount) {
    if (!state || typeof state !== 'object') return 0;
    if (typeof amount !== 'number' || !Number.isFinite(amount)
        || amount <= 0) {
      return 0;
    }
    const G = lazyGame();
    const S = G && G.Sheet;
    if (!S || typeof S.addXp !== 'function' || !isEfirSheet(state)) {
      if (!sheetDegraded) {
        sheetDegraded = true;
        console.error('efir.js: Game.Sheet недоступен или состояние ' +
          'не лист (000144) — xp Эфира копится, уровень не растёт');
      }
      state.xp = (typeof state.xp === 'number' && Number.isFinite(
        state.xp)) ? state.xp + amount : amount;
      return 0;
    }
    const r = S.addXp(state, amount);
    const n = (r && Number.isFinite(r.levelsGained)) ? r.levelsGained : 0;
    // 000111: книга + переучёт — БЕУСЛОВНО (даже при n = 0 —
    // appendSpells идемпотентен: self-restore книги 3-полевого
    // legacy-сейва при боевом XP — поведение master).
    appendSpells(state);
    reprocessEfirSkills(state);
    return n;
  }

  /**
   * Данные makeAlly (контракт 000081 §3, 000111 D2/D3): id 'efir'
   * (дискриминатор), kind строго 'efir' (НЕ 'ether'), name 'Эфир',
   * role 'support', level — из состояния. attrs — 3 БОЕВЫХ атрибута
   * из sheet.primary (000144; fallback — legacy-таблица уровня):
   * allyHeal (000080) читает u.attrs[spell['атрибут']] — лечение
   * масштабируется от Мудрости. Явных maxHP/damage НЕТ (D2:
   * формульный путь makeAlly — маркер морали действует ЧЕРЕЗ формулу;
   * явные боевые статы — 000112 buildEfirUnit). spells — книга
   * СОСТОЯНИЯ (свежая копия); деградация на старую форму (без
   * spells) — таблица уровня. skills: [] (проекция пула в боевой
   * юнит — 000112; НЕ путать с state.skills — зеркалом).
   * @returns {object} данные makeAlly: {id, name, role, level, attrs,
   *   spells (свежая копия), skills: [], kind}.
   */
  function efirAllyData(state) {
    const level = (state && typeof state === 'object'
      && Number.isFinite(state.level) && state.level >= 1)
      ? state.level : 1;
    const a = efirAttrs(state);
    const book = (state && Array.isArray(state.spells))
      ? state.spells : efirSpellsByLevel(level);
    return {
      id: 'efir',
      name: 'Эфир',
      role: 'support',
      level,
      attrs: {
        intelligence: a.intelligence,
        wisdom: a.wisdom,
        constitution: a.constitution,
      },
      spells: book.slice(),
      skills: [],
      kind: 'efir',
    };
  }

  // --- 000111: боевые атрибуты, пул навыков, книга заклинаний
  // (подзадача 000035; SPEC «Дух Эфира») ---
  // ДАННЫЕ МОДУЛЯ (000053: НЕ каталог, НОВОГО assets/efir/ НЕТ;
  // зеркало каталогов, дрейф ловит T4). Новые функции/экспорты —
  // в хвосте factory (контракт memory/000111-efir-growth.md §11:
  // минимизация конфликта с 000085-serialize при ребейзе).

  // Стартовая книга (ТЗ: «старт [spark, mend]» — «скромный пул:
  // огонь/исцеление» 000081 — это и есть базовая книга). ВНУТРЕННЯЯ
  // константа (не экспортируется: старт = efirSpellsByLevel(1); 000115
  // пишет дефолт [spark, mend] по своему ТЗ).
  const EFIR_SPELL_START = ['spark', 'mend'];

  // Таблица открытий по уровню [порог, id] (ТЗ: 5 light_heal, 8
  // frost_bolt, 10 fireball, 12 magic_shield, 15 vine, 20
  // greater_heal, 25 ward, 30 nature_blessing). Порядок —
  // канонический (возрастание порогов); заклинания не удаляются.
  const EFIR_SPELL_UNLOCKS = [
    [5, 'light_heal'],
    [8, 'frost_bolt'],
    [10, 'fireball'],
    [12, 'magic_shield'],
    [15, 'vine'],
    [20, 'greater_heal'],
    [25, 'ward'],
    [30, 'nature_blessing'],
  ];

  // Пул вторичных навыков — ЗЕРКАЛО каталога assets/skills (000023/
  // 000024/000028/000030; source of truth — каталог, сверка — T4).
  // 000144: это НАЧАЛЬНЫЙ СПИСОК листа (firelord/perception 1 —
  // подарки; icelord/precog 0); полное дерево 31 навыка доступно
  // ОЧКАМИ (Sheet.raiseSkill). Порядок = ЗАВИСИМЫЙ: requires идёт
  // раньше зависимого (firelord→icelord, perception→precog) —
  // структурное требование переучёта (prerequisite обязан быть уже
  // переучтён в том же прогоне).
  const EFIR_SKILLS = [
    { id: 'firelord', primary: 'intelligence', requires: null },
    { id: 'icelord', primary: 'intelligence',
      requires: { skill: 'firelord', level: 5 } },
    { id: 'perception', primary: 'wisdom', requires: null },
    { id: 'precog', primary: 'wisdom',
      requires: { skill: 'perception', level: 5 } },
  ];

  // 000113: «Вдох Эфира» — ВСЕ данные фирменного действия (ТЗ:
  // «src/efir.js — данные действия (формулы + flavor-строки)» —
  // данные модуля, НЕ каталог — прецедент 000053; ОДНА точка
  // формул/строк: триггер combat.js читает СНАПШОТ u.breath, UI
  // 000116/000118 — breathInfo/EFIR_BREATH; 000119 «не тюнить» —
  // правка ИМЕННО здесь). desc = BREATH_FALLBACK вкладки 000116
  // (src/ui-tab-efir.js) ДОСЛОВНО — одна точка формулировок
  // (E7-подстроки tests/ui-efir.test.js; правка = сломать E7).
  // firstEncounter — многоточие ОДИН символ U+2026 (пин BR-1).
  const BREATH_INFO = {
    name: 'Вдох Эфира',           // label (БЕЗ «!» — лог отдельное поле)
    logLine: 'Вдох Эфира!',       // ТОЧНАЯ лог-строка (ТЗ)
    desc: '1 раз за бой, авто-триггер на его ходу: игрок ≤ 40% HP и ' +
      'мана Эфира ≥ 20.\n' +
      'Расходует 20 маны и весь ход: лечение всем союзным ' +
      'round(10 + 0.8 * Мудрость);\n' +
      'ослабление всех врагов: их урон ×0.8 на 2 хода.',
    firstEncounter: 'Эфир материализуется рядом с Флогистоном…',
    playerFrac: 0.4,              // триггер: HP игрока ≤ 40% maxHP
    mpCost: 20,                   // расход 20 маны + ВЕСЬ ход
    healBase: 10, healWisdom: 0.8, // round(10 + 0.8·Мудрость); L1: 12
    weakenMult: 0.8, weakenTurns: 2, // их урон ×0.8 на 2 хода
  };
  // Экспорт для UI (000116/000118) — ИМЯ ТОЧНО (фиксация ТЗ):
  // {name, desc, firstEncounter}; строки статичны, чтение live
  // при render (паттерн 000096).
  const breathInfo = {
    name: BREATH_INFO.name,
    desc: BREATH_INFO.desc,
    firstEncounter: BREATH_INFO.firstEncounter,
  };

  /**
   * 000111: ЗАМОРОЖЕННАЯ legacy-таблица атрибутов (ЧУСТАЯ функция
   * уровня): Интеллект = Мудрость = Телосложение = 3 +
   * floor((level−1)/2); maxHP = 10 + 2·Тел; maxMP = 5 + Инт + Мудр.
   * L1: 3/3/3, 16, 11; L3: 4/4/4, 18, 13; L5: 5/5/5, 20, 15.
   * 000144: боевой путь (buildEfirUnit) таблицу НЕ читает (кроме
   * деградации) — статы из derived + efirDerived; потребители
   * таблицы — вкладка 000116 / список спутников (ui.js) — до
   * 000145/000146; тогда таблица удаляется. Мусор/<1 → уровень 1.
   * @returns {object} СВЕЖИЙ объект на каждый вызов.
   */
  function efirStats(level) {
    const lv = (typeof level === 'number' && Number.isFinite(level)
      && level >= 1) ? Math.floor(level) : 1;
    const a = 3 + Math.floor((lv - 1) / 2);
    return {
      intelligence: a,
      wisdom: a,
      constitution: a,
      maxHP: 10 + 2 * a,
      maxMP: 5 + a + a,
    };
  }

  /**
   * Книга ЧИСТОЙ таблицей уровня: старт [spark, mend] + пороги ≤
   * level, в порядке таблицы (монотонна: заклинания не удаляются).
   * Мусор/<1 → уровень 1. СВЕЖАЯ КОПИЯ на каждый вызов.
   * @returns {string[]} [spellId…]
   */
  function efirSpellsByLevel(level) {
    const lv = (typeof level === 'number' && Number.isFinite(level)
      && level >= 1) ? level : 1;
    const book = EFIR_SPELL_START.slice();
    for (const [unlock, id] of EFIR_SPELL_UNLOCKS) {
      if (lv >= unlock) book.push(id);
    }
    return book;
  }

  /**
   * Кривая опыта вторичных навыков Эфира — КОПИЯ кривой игрока
   * (000013, src/player.js skillXpForNext = 15·(ур+1); D4: отдельная
   * чистая функция — «не переиспользование player-объекта»; правка
   * баланса — 000119 в одном месте).
   * @returns {number} xp, чтобы перейти с уровня level на level+1.
   */
  function efirSkillXpForNext(level) {
    return 15 * (level + 1);
  }

  /**
   * «Потолок практикой» Эфира (паттерн practiceCap, src/player.js:
   * основной атрибут НАВЫКА * 2 — по ЕГО атрибутам; D7):
   * firelord/icelord — Интеллект·2, perception/precog — Мудрость·2.
   * 000144: атрибуты — из sheet.primary (efirAttrs; рост — ОЧКАМИ,
   * уровень НЕ растит); state не объект / не лист → legacy-таблица
   * L1 → 6. def — из ДАННЫХ МОДУЛЯ (чистый UMD — node-тестам не
   * нужен stub каталога; дрейф зеркала ловит T4).
   * @returns {number} потолок; 0 — id вне пула.
   */
  function efirSkillCap(state, id) {
    const def = EFIR_SKILLS.find((d) => d.id === id);
    if (!def) return 0;
    return efirAttrs(state)[def.primary] * 2;
  }

  /**
   * Переучёт пула (контракт memory/000111-efir-growth.md §4;
   * 000144 — на листе): ВЕДЕНИЕ С ТЕКУЩЕГО УРОВНЯ (bank = остаток в
   * пределах уровня; на потолке — overflow). НЕ «с нуля от
   * остатка» — неидемпотентно; инкрементальный вариант —
   * неподвижная точка: после прогона либо level = cap, либо bank <
   * need(level) → второй прогон ничего не меняет (T7).
   *
   * 000144: уровни — ИЗ secondary (source of truth; raiseSkill пишет
   * только secondary); cap — efirAttrs(state)[def.primary] × 2
   * (primary, НЕ уровень); зеркало skills — ПИШЕТСЯ ТОЛЬКО здесь
   * (dense, все 4 id пула; читает вкладка 000116 до 000146);
   * requires-гейт — «stay»: prerequisite < requires.level → уровень
   * НЕ нулится, bank НЕ тронут (фирменное 000111; при старте 0
   * идентичен старому «zero»).
   *
   * Нормализация (битый кэш чинится): skillXp/secondary/skills
   * не-объект → {}; bank не-число/NaN/<0 → 0; level не-число/NaN/
   * <0 → 0, > cap → cap. Банк за потолком ХРАНИТСЯ (overflow):
   * рост cap (очками — 000144) → следующий переучёт конвертирует
   * остаток (T5); отличие от _gainSkillXp игрока (бросает ВХОДЯЩИЙ
   * опыт на потолке).
   *
   * Точки вызова: levelUp, addEfirXp (после addXp), deserialize
   * (000115 — ОБЯЗАТЕЛЬНО), practiceEfir (000117 — после прибавки).
   * Возврат [id…] — для событий/логов 000116/000117.
   * @returns {string[]} id, чей уровень ИЗМЕНИЛСЯ (нормализованный
   *   «до» ≠ «после»).
   */
  function reprocessEfirSkills(state) {
    if (!state || typeof state !== 'object') return [];
    if (!isPlainObject(state.skillXp)) state.skillXp = {};
    if (!isPlainObject(state.secondary)) state.secondary = {};
    if (!isPlainObject(state.skills)) state.skills = {};
    const attrs = efirAttrs(state);
    const changed = [];
    for (const def of EFIR_SKILLS) {
      let bank = state.skillXp[def.id];
      if (typeof bank !== 'number' || !Number.isFinite(bank) ||
          bank < 0) {
        bank = 0;
      }
      // 000144: истина — secondary (зеркало skills ниже).
      let level = state.secondary[def.id];
      if (typeof level !== 'number' || !Number.isFinite(level) ||
          level < 0) {
        level = 0;
      }
      level = Math.floor(level);
      const cap = attrs[def.primary] * 2;
      if (level > cap) level = cap;
      const before = level;
      if (def.requires &&
          ((state.secondary[def.requires.skill] || 0)
            < def.requires.level)) {
        // requires не выполнен: «stay» — уровень НЕ нулится, банк
        // ЦЕЛИКОМ (ничего не списано; накопленный заранее опыт
        // конвертируется ПОЛНОСТЬЮ, когда requires выполнится).
      } else {
        let b = bank;
        while (level < cap && b >= efirSkillXpForNext(level)) {
          b -= efirSkillXpForNext(level);
          level += 1;
        }
        bank = b;
      }
      state.secondary[def.id] = level;
      state.skills[def.id] = level; // зеркало (dense, все 4 id)
      state.skillXp[def.id] = bank;
      if (level !== before) changed.push(def.id);
    }
    return changed;
  }

  // --- Сериализация состояния (задача 000085; расширение 000115;
  // 000144 — sheet-лейаут + backfill) ---
  // Контракт: memory/000085-save-party-efir.md (D1/D4/D5) +
  // memory/000115-efir-save-final.md (D2/D3/D5) +
  // memory/000144-efir-sheet.md (D-H: backfill; D-F: serialize —
  // только лист). Функции ЧИСТЫЕ и тихие (0 console, 0 require,
  // 0 обращений к Game — чистый UMD сохранён); warn печатает
  // main.js. 000144: serialize — sheet-лейаут РОВНО 10 ключей
  // (runtime-эфир ВСЕГДА лист; backfill-пути в serialize НЕТ —
  // голий 5-полевой → null); deserialize — новый формат (10
  // ключей) + backfill старого 5-полевого + ОБЯЗАТЕЛЬНЫЙ
  // reprocessEfirSkills до return (выход ПЛОТНЫЙ).

  // plain-object (null/массивы/примитивы — нет).
  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * Набор id каталога (000115 D2): массив записей каталога (объекты со
   * строковым .id) → Set<string>. null / не-массив / пустой / без
   * валидных id → null (каталог недоступен → id-валидация ВЫКЛ —
   * безопасное направление: unknown-id остаётся инертен, поведение
   * 000085; serde-функции тихие — warn печатает main.js).
   * @param {*} catalog массив записей каталога (mirror assets).
   * @returns {Set<string>|null} id-набор; null — каталог недоступен.
   */
  function catalogIds(catalog) {
    if (!Array.isArray(catalog) || catalog.length === 0) return null;
    const ids = new Set();
    for (const e of catalog) {
      if (e && typeof e === 'object' && typeof e.id === 'string') {
        ids.add(e.id);
      }
    }
    return ids.size > 0 ? ids : null;
  }

  // 000115 D5: save-integrity-граница уровня (НЕ игровой кэп — L999
  // по-прежнему проходит). after 000115 reprocess зовётся ИЗ
  // deserialize — forged level ~1e15 + bank → while-цикл reprocess
  // ограничен cap ≈ 2·attr → ~1e15 итераций (вкладка замерзает);
  // до 000115 путь из сейва недостижим. Реальный сейв недостижим
  // (xp до L1e6 ≈ 3.3e16, ~1e14 боёв); reprocess при 1e6 —
  // миллисекунды. Прецедент MAX_SAVED_DAY (main.js): «защита от
  // подделанного сейва».
  const EFIR_SAVE_MAX_LEVEL = 1e6;

  /**
   * plain-объект id → число (000144): undefined → {}; не plain →
   * null; каждое значение — по правилу: 'int' — int ≥ 0; 'finite' —
   * finite ≥ 0 (дроби ЛЕГИТИМНЫ — практика 000117); id ∉ каталога
   * (если задан) → null (сброс ЗАПИСИ, 000029).
   * @returns {object|null} копия; null — дефект формы.
   */
  function readSkillMap(v, ids, mode) {
    if (v === undefined) return {};
    if (!isPlainObject(v)) return null;
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (mode === 'int') {
        if (!Number.isInteger(val) || val < 0) return null;
      } else if (typeof val !== 'number' || !Number.isFinite(val)
          || val < 0) {
        return null;
      }
      if (ids && !ids.has(k)) return null;
      out[k] = val;
    }
    return out;
  }

  /**
   * Снапшот состояния Эфира для сейва (data.efir): 000144 — ЧИСТАЯ
   * копия лист-лейаута РОВНО 10 ключей {kind, level, xp, totalXp,
   * points, primary, secondary, skillXp, skills, spells} (порядок —
   * единый; НИКАКОГО npcId). null при: state не plain-object, либо
   * нет plain primary (счёт не-листа — старый формат сериализовать
   * невозможно: после 000144 runtime-эфир ВСЕГДА лист, backfill —
   * только в deserialize; решение D-F). main.js пишет null в
   * data.efir — restore пропустит раздел.
   * @param {*} state состояние Эфира (лист).
   * @returns {object|null} 10 ключей; не лист → null.
   */
  function serializeEfir(state) {
    if (!isEfirSheet(state)) return null;
    return {
      kind: 'efir',
      level: state.level,
      xp: state.xp,
      totalXp: state.totalXp,
      points: state.points,
      primary: Object.assign({}, state.primary),
      secondary: Object.assign({}, state.secondary),
      skillXp: Object.assign({}, state.skillXp),
      skills: Object.assign({}, state.skills),
      spells: Array.isArray(state.spells) ? state.spells.slice() : [],
    };
  }

  /**
   * Восстановление состояния Эфира из сейва (data.efir) — структурно
   * (000085 D5) + id-валидация по каталогам (000115 D2) +
   * ОБЯЗАТЕЛЬНЫЙ reprocessEfirSkills до return (000115 D3, канон
   * 000111 §9). 000144: НОВЫЙ формат — лист (10 ключей; raw.primary
   * есть); СТАРЫЙ 5-полевой формат → backfill (решение D-H:
   * level/xp/skillXp/spells — 1:1; primary — старт-формула; кэш
   * skills → secondary КАК ЕСТЬ; points/totalXp 0). ЛЮБОЙ дефект →
   * null (main.js: warn + тихий сброс на createEfir() — 000029).
   * @param {*} raw data.efir из сейва.
   * @param {Array} [skillCatalog] записи каталога assets/skills
   *   (mirror EFIR_SKILL_CATALOG, main.js); null/нет → id-валидация
   *   ВЫКЛ (структурный режим — 1-арг. вызовы легальны).
   * @param {Array} [spellCatalog] записи каталога assets/spells;
   *   null/нет → ВЫКЛ.
   * @returns {object|null} НОВОЕ состояние — лист 10 ключей, ВЫХОД
   *   ПЛОТНЫЙ (reprocess: ВСЕ 4 id пула материализованы в
   *   secondary/skillXp/skills); null —
   *   * raw == null (старый сейв, поля нет — main.js гвардит и НЕ
   *     трогает efir: L1, ЗАФИКСИРОВАНО ТЗ, warn НЕТ);
   *   * не plain-object (строка/число/массив/null);
   *   * level — не int ≥ 1 (forged 999.5 НЕ floor'ится);
   *   * level > EFIR_SAVE_MAX_LEVEL (000115 D5: защита от
   *     зависания reprocess поддельным уровнем);
   *   * xp — не finite ≥ 0 (дроби как есть — прецедент hero.xp);
   *   * (новый формат) kind !== 'efir'; primary — не plain-object;
   *     каждое из 6 значений primary — int в [1, EFIR_SAVE_MAX_LEVEL]
   *     (отсутствующий ключ → 1; лишний ключ — игнор; forged 1e15
   *     → cap 2e15 → while-зависание reprocess — решение Q-3/R-11);
   *     totalXp — finite ≥ 0 (undefined → 0); points — int ≥ 0
   *     (undefined → 0);
   *   * secondary/skills (новый) или skills (старый) — есть, но не
   *     plain-object c ВСЕМИ значениями int ≥ 0;
   *   * skillXp — есть, но не plain-object c ВСЕМИ значениями
   *     finite ≥ 0 (дроби ЛЕГИТИМНЫ — практика 000117);
   *   * (при переданном каталоге) ЛЮБОЙ ключ secondary/skillXp/
   *     skills ∉ каталога скилов, ИЛИ элемент spells ∉ каталога
   *     заклинаний → null на ВЕСЬ раздел (сброс ЗАПИСИ, 000029);
   *   * spells — не массив строк (элемент не-строка → null; дубли —
   *     первый остаётся). Отсутствует ИЛИ ПУСТОЙ → EFIR_SPELL_START
   *     (старт [spark, mend] — НЕ выводить из уровня, 000115).
   *   skillXp/secondary/skills отсутствуют → {} (3-полевая
   *   legacy-форма до 000111 → лист, 000144).
   */
  function deserializeEfir(raw, skillCatalog, spellCatalog) {
    if (raw == null || !isPlainObject(raw)) return null;
    if (!Number.isInteger(raw.level) || raw.level < 1) return null;
    if (raw.level > EFIR_SAVE_MAX_LEVEL) return null; // D5: guard
    if (typeof raw.xp !== 'number' || !Number.isFinite(raw.xp)
        || raw.xp < 0) {
      return null;
    }
    const skillIds = catalogIds(skillCatalog);
    const spellIds = catalogIds(spellCatalog);
    // 000144: новый формат — raw.primary есть (лист); иначе —
    // старый 5-полевой формат (backfill D-H).
    const isNewFormat = raw.primary !== undefined;
    let primary;
    let totalXp;
    let points;
    let secondary;
    let mirror;
    if (isNewFormat) {
      if (raw.kind !== 'efir') return null;
      if (!isPlainObject(raw.primary)) return null;
      primary = {};
      for (const k of EFIR_PRIMARY_KEYS) {
        const v = raw.primary[k];
        if (v === undefined) {
          primary[k] = 1; // решение R-11: отсутствующий ключ → 1
          continue;
        }
        if (!Number.isInteger(v) || v < 1 || v > EFIR_SAVE_MAX_LEVEL) {
          return null;
        }
        primary[k] = v;
      }
      if (raw.totalXp === undefined) {
        totalXp = 0;
      } else if (typeof raw.totalXp !== 'number'
          || !Number.isFinite(raw.totalXp) || raw.totalXp < 0) {
        return null;
      } else {
        totalXp = raw.totalXp;
      }
      if (raw.points === undefined) {
        points = 0;
      } else if (!Number.isInteger(raw.points) || raw.points < 0) {
        return null;
      } else {
        points = raw.points;
      }
      secondary = readSkillMap(raw.secondary, skillIds, 'int');
      if (secondary === null) return null;
      mirror = readSkillMap(raw.skills, skillIds, 'int');
      if (mirror === null) return null;
    } else {
      // Старый 5-полевой формат (до 000144): backfill (D-H) —
      // level/xp/skillXp/spells — 1:1; primary — старт-формула; кэш
      // skills → secondary КАК ЕСТЬ (затем reprocess); points/
      // totalXp 0 (истории нет). Цифры 000115/000085 выживают
      // (кэш переносится — НЕ «пересчитать с нуля»).
      primary = Object.assign({}, EFIR_START_PRIMARY);
      totalXp = 0;
      points = 0;
      const cached = readSkillMap(raw.skills, skillIds, 'int');
      if (cached === null) return null;
      secondary = Object.assign({}, cached);
      mirror = Object.assign({}, cached);
    }
    const skillXp = readSkillMap(raw.skillXp, skillIds, 'finite');
    if (skillXp === null) return null;
    let spells;
    if (raw.spells === undefined
        || (Array.isArray(raw.spells) && raw.spells.length === 0)) {
      spells = EFIR_SPELL_START.slice();
    } else if (Array.isArray(raw.spells)) {
      spells = [];
      for (const s of raw.spells) {
        if (typeof s !== 'string') return null;
        if (!spells.includes(s)) spells.push(s); // дубли — первый
      }
    } else {
      return null;
    }
    if (spellIds) {
      for (const s of spells) {
        if (!spellIds.has(s)) return null;
      }
    }
    // 000115 D3 / 000144: ОБЯЗАТЕЛЬНЫЙ переучёт (канон 000111 §9):
    // банк-дроби → уровни в requires-порядке, cap, overflow;
    // материализация ВСЕХ 4 id пула (выход ПЛОТНЫЙ: secondary +
    // зеркало skills + skillXp); level/xp/totalXp/points/spells — не
    // трогает; идемпотентен (неподвижная точка на канонической
    // форме).
    const state = {
      kind: 'efir',
      level: raw.level,
      xp: raw.xp,
      totalXp: totalXp,
      points: points,
      primary: primary,
      secondary: secondary,
      skillXp: skillXp,
      skills: mirror,
      spells: spells,
    };
    reprocessEfirSkills(state);
    return state;
  }

  // Первая встреча (000113): one-shot — 1-й вызов возвращает строку,
  // следующие — null. Сессионное состояние модуля (НЕ сейв).
  // Единственный потребитель в проде — createCombat (combat.js).
  let firstEncounterUsed = false;
  function takeFirstEncounterLine() {
    if (firstEncounterUsed) return null;
    firstEncounterUsed = true;
    return BREATH_INFO.firstEncounter;
  }

  /**
   * Боевой профиль Эфира (задача 000112, контракт
   * memory/000112-efir-combat.md §3.1; 000144 — статы из derived):
   * АПГРЕЙД СУЩЕСТВУЮЩЕГО боевого юнита (D2 — поиск id 'efir' side
   * 'ally'; расстановка/резервация/очередь сделаны createCombat —
   * ноль новых вызовов c._rng, ноль правок createCombat). Статы —
   * derived + efirDerived (БАЗА — характеристики sheet: primary;
   * формулы SPEC сохранены; L1: 16/11 — цифры баланса не меняются);
   * деградация (Sheet недоступен / efir не лист) — legacy-таблица
   * efirStats(u.level) (старые числа):
   *   u.maxHP = u.hp = stats.maxHP (100% на старте боя; возврат
   *     после гибели — СТРУКТУРНО: каждый бой — новый makeAlly +
   *     buildEfirUnit),
   *   u.mp = stats.maxMP — мана СОБСТВЕННАЯ, полная, БЕЗ регена
   *     в бою (зафиксировано ТЗ),
   *   u.damage — «Касание духа»: max(1, round((2 + 0.5·Мудрость)·
   *     (u.moraleMult || 1))) — мораль ВНУТРИ round (D6),
   *   c.efs — СВОИ пулы действий (паттерн refillPools, зеркальная
   *     формула в endPlayerTurn combat.js — пин EF-1): spellInt =
   *     1 + floor(Интеллект/10), spellWis = 1 + floor(Мудрость/10),
   *     touch = 1, move = 3,
   *   u.efirSkills — СНАПШОТ пула лордов (ВСЕ ЧЕТЫРЕ id по
   *     EFIR_SKILLS: secondary[id], fallback — зеркало skills[id];
   *     D8: бой не зависит от мутаций state в полёте; 000117 читает
   *     как базу переучёта; НЕ путать с u.skills — списком id из
   *     данных makeAlly),
   *   c.efir — ссылка на юнит (refill/тики в endPlayerTurn);
   *   c.efirState — live-ссылка на state (000117: только практика
   *     — efirPractice combat.js; боевые формулы её НЕ читают);
   *   u.breath — СНАПШОТ данных «Вдоха Эфира» (000113, flat-
   *     примитивы, свежий объект на бой):
   *     боевой триггер combat.js читает данные С ЮНИТА (ноль
   *     require, ноль ленивых Game-чтений); heal ПРЕДВАРИТЕЛЬНО
   *     ВЫЧИСЛЕН от stats.wisdom — лист в бою не меняется (levelUp —
   *     после боя) → снапшот ≡ значению в момент триггера
   *     (детерминизм).
   * state (efir) — чтение + ПРАКТИКА 000117 мутирует skillXp/
   * secondary в полёте (practiceEfir); формулы боя читают СНАПШОТ
   * u.efirSkills — рост в следующий бой. Тихая деградация: юнита
   * нет / c без units → null. 0 новых точек RNG (R-9).
   * @returns {object|null} проапгрейденный юнит; null — деградация.
   */
  function buildEfirUnit(efir, c) {
    const u = (c && Array.isArray(c.units))
      ? c.units.find((x) => x.id === 'efir' && x.side === 'ally')
      : null;
    if (!u) return null;
    const G = lazyGame();
    const S = G && G.Sheet;
    const stats = (S && isEfirSheet(efir))
      ? (S.derived(efir, EFIR_DERIVED_CTX) || efirStats(u.level))
      : efirStats(u.level);
    u.maxHP = stats.maxHP;
    u.hp = stats.maxHP;
    u.mp = stats.maxMP;
    u.damage = Math.max(1, Math.round(
      (2 + 0.5 * stats.wisdom) * (u.moraleMult || 1)));
    c.efs = {
      spellInt: 1 + Math.floor(((u.attrs && u.attrs.intelligence) || 0) / 10),
      spellWis: 1 + Math.floor(((u.attrs && u.attrs.wisdom) || 0) / 10),
      touch: 1,
      move: 3,
    };
    u.efirSkills = {};
    for (const def of EFIR_SKILLS) {
      // 000144: истина — secondary; fallback — зеркало skills
      // (голый 5-полевой объект деградации: secondary нет).
      const v = (isPlainObject(efir && efir.secondary)
          && efir.secondary[def.id] != null)
        ? efir.secondary[def.id]
        : (isPlainObject(efir && efir.skills) ? efir.skills[def.id] : 0);
      u.efirSkills[def.id] = (typeof v === 'number' && Number.isFinite(v)
        && v >= 0) ? Math.floor(v) : 0;
    }
    // 000113: снапшот данных «Вдоха Эфира» (flat-примитивы —
    // vm-инвариант 000082; свежий объект на бой — боевое состояние,
    // не сейв): триггер efirTurn combat.js читает ТОЛЬКО его.
    u.breath = {
      name: BREATH_INFO.name,
      logLine: BREATH_INFO.logLine,
      playerFrac: BREATH_INFO.playerFrac,
      mpCost: BREATH_INFO.mpCost,
      heal: Math.round(BREATH_INFO.healBase
        + BREATH_INFO.healWisdom * stats.wisdom),
      weakenMult: BREATH_INFO.weakenMult,
      weakenTurns: BREATH_INFO.weakenTurns,
    };
    c.efir = u;
    c.efirState = efir; // 000117: live state — только практика
    return u;
  }

  // --- 000117: практика ЕГО пула (рост навыков от применения) ---
  /**
   * Практика Эфира (задача 000117, ТЗ п.1): прибавка amount в ЕГО
   * skillXp[skillId] + переучёт (reprocessEfirSkills — ТРЕТЬЯ точка
   * вызова, задокументирована в нём). ЧИСТАЯ функция: ноль Game,
   * ноль RNG, ноль console (UMD-чистота, R1). Тихие guards
   * (return []): state не plain-объект; skillId вне пула
   * EFIR_SKILLS (4 id); amount не finite число > 0. Дроби ЛЕГИТИМНЫ
   * (000111 §9 / 000115: serde переносит дроби без floor) — amount
   * НЕ округляется; битый банк (не-число/NaN/<0) нормализуется в 0
   * (семантика reprocessEfirSkills). Потолок = основной атрибут
   * НАВЫКА × 2 (000144: по sheet.primary через efirAttrs),
   * requires-цепочки, overflow за потолком ХРАНИТСЯ в банке — всё
   * в reprocessEfirSkills (логика не дублируется).
   * @param {object} state состояние Эфира (МУТИРУЕТСЯ: skillXp/
   *   secondary/skills).
   * @param {string} skillId id из пула (firelord/icelord/
   *   perception/precog).
   * @param {number} amount finite > 0 (дроби разрешены).
   * @returns {string[]} id, чей уровень ИЗМЕНИЛСЯ (reprocess);
   *   [] — guards (no-op) или без повышения.
   */
  function practiceEfir(state, skillId, amount) {
    if (!isPlainObject(state)) return [];
    if (!EFIR_SKILLS.some((d) => d.id === skillId)) return [];
    if (typeof amount !== 'number' || !Number.isFinite(amount)
        || amount <= 0) {
      return [];
    }
    if (!isPlainObject(state.skillXp)) state.skillXp = {};
    const bank = state.skillXp[skillId];
    const cur = (typeof bank === 'number' && Number.isFinite(bank)
      && bank >= 0) ? bank : 0;
    state.skillXp[skillId] = cur + amount;
    return reprocessEfirSkills(state);
  }

  return {
    // 000081 (сигнатуры без изменений; 000144: тела createEfir/
    // levelUp/addEfirXp/efirAllyData — на листе Game.Sheet):
    createEfir, addEfirXp, levelUp, efirAllyData,
    // 000111 (контракт memory/000111-efir-growth.md §3: новые — ПОСЛЕ
    // существующих 4; 9 функций + 2 данных):
    efirStats, efirSpellsByLevel, reprocessEfirSkills,
    efirSkillXpForNext, efirSkillCap,
    EFIR_SKILLS, EFIR_SPELL_UNLOCKS,
    // 000085 (сериализация состояния под сейв; контракт
    // memory/000085-save-party-efir.md D1/D4/D5; расширения 000115 —
    // id-валидация + reprocess; 000144 — sheet-лейаут + backfill):
    serializeEfir, deserializeEfir,
    // 000112 (контракт memory/000112-efir-combat.md §3.1: боевой
    // профиль — в хвост return-блока; 000144 — статы из derived):
    buildEfirUnit,
    // 000117 (контракт memory/000117-efir-practice.md §3.1: практика
    // ЕГО пула — 15-й экспорт, 13 функций + 2 данных):
    practiceEfir,
    // 000113 (контракт memory/000113-efir-breath.md §3.4: «Вдох
    // Эфира» — данные + одна функция; итог 18 экспортов: 14 функций
    // + 4 данных):
    breathInfo,
    // Алиас для СМЕРЖЕННОГО хука 000116 (src/ui-tab-efir.js читает
    // G.efir.EFIR_BREATH → .lines || .текст || .text — хук берёт
    // .text); не удалять, пока хук живёт.
    EFIR_BREATH: { text: BREATH_INFO.desc },
    takeFirstEncounterLine,
  };
});
