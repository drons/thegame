// Эфир: постоянный союзник (задача 000081, родитель 000065, SPEC.md
// «Дух Эфира»): «мини-персонаж» со собственным НЕЗАВИСИМЫМ пулом
// уровень/xp — частный случай фреймворка «союзный юнит» (000080,
// kind 'efir'; в бою — данные makeAlly, src/combat.js — без
// изменений).
//
// 000111: НЕЗАВИСИМАЯ прокачка (подзадача 000035) — собственные
// атрибуты (таблица efirStats: Инт = Мудр = Тел = 3 + floor((ур−1)/2);
// maxHP = 10 + 2·Тел; maxMP = 5 + Инт + Мудр), независимый пул
// вторичных навыков {firelord, icelord, perception, precog} (данные
// EFIR_SKILLS; потолок = основной атрибут НАВЫКА * 2 по ЕГО атрибутам;
// переучёт reprocessEfirSkills) и растущая книга заклинаний (старт
// [spark, mend] + пороги 5/8/10/12/15/20/25/30 — данные
// EFIR_SPELL_UNLOCKS; append-only; автоматически при level up).
//
// ЧИСТЫЙ UMD-модуль, НОЛЬ зависимостей при загрузке (прецеденты
// 000053/000038/000127): node — module.exports = factory(); браузер —
// Game.efir. Взаимных require при загрузке нет (оба ветки): порог
// xpForNext (src/player.js) читается ЛЕНИВО в момент ВЫЗОВА
// (паттерн rootRef); снапшота Game при загрузке НЕТ (000038),
// throw на загрузке — НЕТ (мягкая зависимость).
//
// Состояние — форма ЗАФИКСИРОВАНА под сейв (000085 → расширение
// 000115): ровно {level, xp, skillXp, skills, spells} (000111). HP/MP
// в состоянии НЕТ: каждый бой — новый makeAlly (hp = maxHP) →
// «возврат со 100% HP» — СТРУКТУРНО, кода восстановления нет
// (serializeEfir/deserializeEfir добавит 000085 прямо в этот файл).
// skills — КЭШ id → уровень (источник истины: skillXp + уровень через
// атрибуты → потолок; пишется ТОЛЬКО reprocessEfirSkills); spells —
// append-only данные состояния (заклинания не удаляются).
//
// Данные пула/книги/таблицы — В САМОМ МОДУЛЕ (SPEC «Дух Эфира» →
// «Данные и ассеты», паттерн 000053: НЕ каталог, НОВОГО assets/efir/
// НЕТ): EFIR_SPELL_START, EFIR_SPELL_UNLOCKS, EFIR_SKILLS (зеркало
// каталога assets/skills); ссылочная целостность id — тестом (T4).
//
// 100% боевого опыта: addEfirXp получает ВЕСЬ result.xp (тот же, что
// 100% игроку, ДО бонуса «Учёный»); companion_xp_share НЕ применяется
// (доля — для наёмников, 000082; Эфир в allyXp не попадает по
// построению — положительный фильтр kind === 'merc').
//
// Деградация (игра никогда не падает): Game.xpForNext недоступен на
// момент ВЫЗОВА addEfirXp/levelUp → console.error (один раз) + xp
// копится, уровень НЕ растёт, исключений 0. В браузере недостижимо
// (порядок закрепляет пин tests/index-order.test.js, R12).
//
// Контракты: memory/000081-efir.md (решения), memory/000081-efir-
// ally.md (стабильный API для 000084–000087), memory/000111-efir-
// growth.md (000111: форма состояния, 11 экспортов, семантика
// переучёта — контракт для 000085/000112/000115/000116/000117).
// Тесты: tests/efir.test.js (R1–R6, 000111 T1–T9).

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

  // Порог xpForNext (src/player.js: round(50·ур^1.5)) — ЛЕНИВО.
  // Деградация: порога нет на момент вызова → console.error ОДИН
  // раз (не спам при каждом бою; «видимая деградация», паттерн
  // 000053), xp копится, уровень не растёт, исключений 0.
  let xpWarned = false;
  function xpForNext() {
    const G = lazyGame();
    if (!G || typeof G.xpForNext !== 'function') {
      if (!xpWarned) {
        xpWarned = true;
        console.error('efir.js: Game.xpForNext недоступен (src/' +
          'player.js обязан грузиться до использования, задача ' +
          '000081) — xp Эфира копится, уровень не растёт');
      }
      return null;
    }
    return G.xpForNext;
  }

  /**
   * «Мини-персонаж» Эфира: состояние — ровно
   * {level, xp, skillXp, skills, spells} (000111: форма ЗАФИКСИРОВАНА
   * под сейв 000085→000115). HP/MP в состоянии НЕТ: каждый бой — новый
   * makeAlly (hp = maxHP) → «возврат со 100% HP» — структурно.
   * skillXp — копилка практики (id → число ≥ 0, ДРОБНЫЙ разрешён;
   * пишет 000117); skills — КЭШ id → уровень (выводится переучётом);
   * spells — append-only книга (старт [spark, mend] + пороги
   * 5/8/10/12/15/20/25/30 — автоматически при level up).
   * @returns {object} НОВОЕ состояние (вызовы независимы).
   */
  function createEfir() {
    return {
      level: 1,
      xp: 0,
      skillXp: {},
      skills: {},
      spells: EFIR_SPELL_START.slice(),
    };
  }

  /**
   * Повышение по порогам xpForNext (src/player.js) БЕЗ нового xp:
   * while xp ≥ xpForNext(level) — списывает порог, +1 уровень.
   * Обрабатывает xp, накопленный в деградационном окне (R6) и при
   * нормализации сейва (000085/000115). Чистая по state-мутациям.
   *
   * 000111 — ПОСЛЕ while (даже при n = 0 — идемпотентно): книга
   * append-only (старт + пороги ≤ уровня; дублей нет; «заклинания не
   * удаляются») + переучёт пула (потолок вырос — overflow банка
   * конвертируется). Нормализация старой/битой формы (сейв 000081
   * без spells): таблица уровня.
   * @returns {number} число набранных уровней; 0 — state null, xp
   *   ниже порога или порог недоступен (деградация: console.error,
   *   xp остаётся, исключений 0).
   */
  function levelUp(state) {
    if (!state || typeof state !== 'object') return 0;
    const xpForNextRef = xpForNext();
    if (!xpForNextRef) return 0;
    let n = 0;
    while (state.xp >= xpForNextRef(state.level)) {
      state.xp -= xpForNextRef(state.level);
      state.level += 1;
      n += 1;
    }
    // 000111: книга + переучёт (контракт memory/000111-efir-growth.md
    // §3а/§4).
    if (!Array.isArray(state.spells)) state.spells = [];
    for (const id of efirSpellsByLevel(state.level)) {
      if (!state.spells.includes(id)) state.spells.push(id);
    }
    reprocessEfirSkills(state);
    return n;
  }

  /**
   * Начисляет xp: ВЕСЬ (100% боевого опыта — companion_xp_share НЕ
   * применяется: доля — для наёмников, 000082). while-цикл (levelUp):
   * один бой может дать НЕСКОЛЬКО уровней; остаток копится между
   * боями. Тихие skip: state null, amount не число/≤0/NaN → 0, state
   * не мутирован.
   * @returns {number} число набранных уровней; 0 — см. тихие skip или
   *   порог недоступен (деградация: xp копится, уровень не растёт).
   */
  function addEfirXp(state, amount) {
    if (!state || typeof state !== 'object') return 0;
    if (typeof amount !== 'number' || !Number.isFinite(amount) ||
        amount <= 0) {
      return 0;
    }
    state.xp += amount;
    return levelUp(state);
  }

  /**
   * Данные makeAlly (контракт 000081 §3, 000111 D2/D3): id 'efir'
   * (дискриминатор), kind строго 'efir' (НЕ 'ether'), name 'Эфир',
   * role 'support', level — из состояния. attrs — 3 СОБСТВЕННЫХ
   * атрибута по таблице (НЕ шесть основных игрока): allyHeal (000080)
   * читает u.attrs[spell['атрибут']] — лечение масштабируется от
   * Мудрости. Явных maxHP/damage НЕТ (D2: формульный путь makeAlly —
   * маркер морали действует ЧЕРЕЗ формулу; явные боевые статы —
   * 000112 buildEfirUnit). spells — книга СОСТОЯНИЯ (свежая копия);
   * деградация на старую форму (без spells) — таблица уровня.
   * skills: [] (проекция пула в боевой юнит — 000112; НЕ путать с
   * state.skills).
   * @returns {object} данные makeAlly: {id, name, role, level, attrs,
   *   spells (свежая копия), skills: [], kind}.
   */
  function efirAllyData(state) {
    const level = (state && typeof state === 'object'
      && Number.isFinite(state.level) && state.level >= 1)
      ? state.level : 1;
    const stats = efirStats(level);
    const book = (state && Array.isArray(state.spells))
      ? state.spells : efirSpellsByLevel(level);
    return {
      id: 'efir',
      name: 'Эфир',
      role: 'support',
      level,
      attrs: {
        intelligence: stats.intelligence,
        wisdom: stats.wisdom,
        constitution: stats.constitution,
      },
      spells: book.slice(),
      skills: [],
      kind: 'efir',
    };
  }

  // --- 000111: собственные атрибуты, пул навыков, книга
  // заклинаний (подзадача 000035; SPEC «Дух Эфира») ---
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
  // Порядок = ЗАВИСИМЫЙ: requires идёт раньше зависимого
  // (firelord→icelord, perception→precog) — структурное требование
  // переучёта (prerequisite обязан быть уже переучтён в том же
  // прогоне).
  const EFIR_SKILLS = [
    { id: 'firelord', primary: 'intelligence', requires: null },
    { id: 'icelord', primary: 'intelligence',
      requires: { skill: 'firelord', level: 5 } },
    { id: 'perception', primary: 'wisdom', requires: null },
    { id: 'precog', primary: 'wisdom',
      requires: { skill: 'perception', level: 5 } },
  ];

  /**
   * Собственные атрибуты Эфира (НЕ шесть основных игрока) + maxHP/
   * maxMP — ЧИСТАЯ функция уровня (ТЗ 000111 п.1, SPEC «Дух Эфира»):
   *   Интеллект = Мудрость = Телосложение = 3 + floor((level−1)/2)
   *   maxHP = 10 + 2·Телосложение; maxMP = 5 + Интеллект + Мудрость
   * L1: 3/3/3, 16, 11; L3: 4/4/4, 18, 13; L5: 5/5/5, 20, 15 (пины
   * T1). Ключи — как в каталогах: u.attrs[spell['атрибут']] работает
   * без адаптеров (000080 allyHeal). Мусор/<1 → уровень 1.
   * @returns {object} СВЕЖИЙ объект на каждый вызов (мутация таблицы
   *   не ломает модуль).
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
   * firelord/icelord — Интеллект·2, perception/precog — Мудрость·2
   * (таблица efirStats; у Эфира атрибуты равны). def — из ДАННЫХ
   * МОДУЛЯ (лениво из каталога НЕ берём: чистый UMD — node-тестам не
   * нужен stub каталога; дрейф зеркала ловит T4).
   * @returns {number} потолок; 0 — id вне пула; state не объект →
   *   уровень 1.
   */
  function efirSkillCap(state, id) {
    const def = EFIR_SKILLS.find((d) => d.id === id);
    if (!def) return 0;
    const level = (state && typeof state === 'object'
      && Number.isFinite(state.level) && state.level >= 1)
      ? state.level : 1;
    return efirStats(level)[def.primary] * 2;
  }

  /**
   * Переучёт пула (контракт memory/000111-efir-growth.md §4):
   * ВЕДЕНИЕ С ТЕКУЩЕГО УРОВНЯ (bank = остаток в пределах уровня; на
   * потолке — overflow). НЕ «с нуля от остатка» — неидемпотентно
   * (двойное списание cost(0..ур−1) на каждом прогоне);
   * инкрементальный вариант — неподвижная точка: после прогона либо
   * level = cap, либо bank < need(level) → второй прогон ничего не
   * меняет (T7).
   *
   * Нормализация (битый кэш чинится): skillXp/skills не-объект → {};
   * bank не-число/NaN/<0 → 0; level не-число/NaN/<0 → 0, > cap → cap.
   * requires НЕ выполнен (уровень prerequisite < requires.level) —
   * уровень 0, банк ЦЕЛИКОМ (ничего не списано: level 0 → накопление
   * целиком; накопленный заранее опыт конвертируется ПОЛНОСТЬЮ, когда
   * requires выполнится). Банк за потолком ХРАНИТСЯ (overflow): рост
   * уровня Эфира → рост cap → следующий переучёт конвертирует остаток
   * (T5); отличие от _gainSkillXp игрока (бросает ВХОДЯЩИЙ опыт на
   * потолке).
   *
   * Точки вызова: levelUp (после while), deserialize (000115 —
   * ОБЯЗАТЕЛЬНО), practiceEfir (000117 — после прибавки). Возврат
   * [id…] — для событий/логов 000116/000117.
   * @returns {string[]} id, чей уровень ИЗМЕНИЛСЯ (нормализованный
   *   «до» ≠ «после»).
   */
  function reprocessEfirSkills(state) {
    if (!state || typeof state !== 'object') return [];
    if (!state.skillXp || typeof state.skillXp !== 'object' ||
        Array.isArray(state.skillXp)) {
      state.skillXp = {};
    }
    if (!state.skills || typeof state.skills !== 'object' ||
        Array.isArray(state.skills)) {
      state.skills = {};
    }
    const stats = efirStats(state.level);
    const changed = [];
    for (const def of EFIR_SKILLS) {
      let bank = state.skillXp[def.id];
      if (typeof bank !== 'number' || !Number.isFinite(bank) ||
          bank < 0) {
        bank = 0;
      }
      let level = state.skills[def.id];
      if (typeof level !== 'number' || !Number.isFinite(level) ||
          level < 0) {
        level = 0;
      }
      level = Math.floor(level);
      const cap = stats[def.primary] * 2;
      if (level > cap) level = cap;
      const before = level;
      if (def.requires &&
          ((state.skills[def.requires.skill] || 0) < def.requires.level)) {
        // requires не выполнен: НЕ растёт, банк ЦЕЛИКОМ (level 0 →
        // ничего не списано).
        level = 0;
      } else {
        let b = bank;
        while (level < cap && b >= efirSkillXpForNext(level)) {
          b -= efirSkillXpForNext(level);
          level += 1;
        }
        bank = b;
      }
      state.skills[def.id] = level;
      state.skillXp[def.id] = bank;
      if (level !== before) changed.push(def.id);
    }
    return changed;
  }

  return {
    // 000081 (сигнатуры без изменений; тела createEfir/levelUp/
    // efirAllyData расширены 000111):
    createEfir, addEfirXp, levelUp, efirAllyData,
    // 000111 (контракт memory/000111-efir-growth.md §3: новые — ПОСЛЕ
    // существующих 4; 9 функций + 2 данных):
    efirStats, efirSpellsByLevel, reprocessEfirSkills,
    efirSkillXpForNext, efirSkillCap,
    EFIR_SKILLS, EFIR_SPELL_UNLOCKS,
  };
});
