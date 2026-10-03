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
// 000112: buildEfirUnit(efir, c) — боевой профиль на юните поля
// (12-й экспорт; АПГРЕЙД существующего makeAlly-юнита, не создание):
// явные maxHP/hp = efirStats (100%), своя мана u.mp = maxMP (без
// регена в бою), «Касание духа» u.damage (мораль ВНУТРИ round),
// пулы действий c.efs (паттерн refillPools), снапшот лордов
// u.efirSkills, ссылка c.efir. Контракт — memory/000112-efir-combat.md.
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
// (serializeEfir/deserializeEfir — 000085, в этом же файле, хвост
// фабрики; расширение 000115 — id-валидация + reprocess).
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
// переучёта — контракт для 000085/000112/000115/000116/000117),
// memory/000112-efir-combat.md (000112: боевой профиль buildEfirUnit,
// ход Эфира — контракт для 000113/000117/000118/000119).
// Тесты: tests/efir.test.js (R1–R6, 000111 T1–T9, 000112 EF-1..4).

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

  // --- Сериализация состояния (задача 000085; расширение 000115) ---
  // Контракт: memory/000085-save-party-efir.md (D1/D4/D5) +
  // memory/000115-efir-save-final.md (D2/D3/D5). Форма сейва = 5 полей
  // состояния (000111: state = форма сейва). Функции ЧИСТЫЕ и тихие
  // (0 console, 0 require, 0 обращений к Game — чистый UMD сохранён);
  // warn печатает main.js. 000115: DESERIALIZE валидирует id
  // скилов/заклинаний по КАТАЛОГАМ-ПАРАМЕТРАМ (чужой id → null на весь
  // раздел; каталог-параметр — UMD-чистота, 0 require) и ОБЯЗАТЕЛЬНО
  // зовёт reprocessEfirSkills до return (канон 000111 §9: выход
  // ПЛОТНЫЙ — все 4 id пула материализованы). spells «из уровня» НЕ
  // выводим (дефолт — EFIR_SPELL_START, правило 000115).

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
  // ограничен cap ≈ 2·attr(level) → ~1e15 итераций (вкладка замерзает);
  // до 000115 путь из сейва недостижим. Реальный сейв недостижим
  // (xp до L1e6 ≈ 3.3e16, ~1e14 боёв); reprocess при 1e6 — миллисекунды.
  // Прецедент MAX_SAVED_DAY (main.js): «защита от подделанного сейва».
  const EFIR_SAVE_MAX_LEVEL = 1e6;

  /**
   * Снапшот состояния Эфира для сейва (data.efir): ЧИСТАЯ копия ровно
   * 5 полей {level, xp, skillXp, skills, spells} (D4). level/xp —
   * as-is (нормализации значений НЕТ: runtime well-formed — reprocess
   * пишет Math.floor, addEfirXp — finite); skillXp/skills — копии
   * plain-объектов (нет/не объект → {}); spells — копия массива
   * (нет/не массив → []).
   * @param {*} state состояние Эфира.
   * @returns {object|null} 5 полей; не plain-object → null
   *   (main.js пишет null в data.efir — restore пропустит раздел).
   */
  function serializeEfir(state) {
    if (!isPlainObject(state)) return null;
    const copyMap = (v) => (isPlainObject(v) ? Object.assign({}, v) : {});
    return {
      level: state.level,
      xp: state.xp,
      skillXp: copyMap(state.skillXp),
      skills: copyMap(state.skills),
      spells: Array.isArray(state.spells) ? state.spells.slice() : [],
    };
  }

  /**
   * Восстановление состояния Эфира из сейва (data.efir) — структурно
   * (000085 D5) + id-валидация по каталогам (000115 D2) + ОБЯЗАТЕЛЬНЫЙ
   * reprocessEfirSkills до return (000115 D3, канон 000111 §9). ЛЮБОЙ
   * дефект → null (main.js: warn + тихий сброс на createEfir() — L1;
   * efir не мутировался между createEfir() на старте сессии и
   * restore, переназначать не нужно).
   * @param {*} raw data.efir из сейва.
   * @param {Array} [skillCatalog] записи каталога assets/skills (mirror
   *   EFIR_SKILL_CATALOG, main.js); null/нет → id-валидация ВЫКЛ
   *   (структурный режим — совместимость 000085: 1-арг. вызовы
   *   существующих тестов легальны, unknown-id инертен).
   * @param {Array} [spellCatalog] записи каталога assets/spells (mirror
   *   EFIR_SPELL_CATALOG, main.js); null/нет → ВЫКЛ.
   * @returns {object|null} НОВОЕ состояние ровно 5 полей — ВЫХОД
   *   ПЛОТНЫЙ (reprocess: ВСЕ 4 id пула материализованы в skillXp/
   *   skills; level/xp/spells — as-is, идемпотентно); null —
   *   * raw == null (старый сейв, поля нет — main.js гвардит и НЕ
   *     трогает efir: L1, ЗАФИКСИРОВАНО ТЗ, warn НЕТ);
   *   * не plain-object (строка/число/массив/null);
   *   * level — не int ≥ 1 (forged 999.5 НЕ floor'ится, прецедент
   *     sanitizeSavedHero.level);
   *   * level > EFIR_SAVE_MAX_LEVEL (000115 D5: save-integrity-
   *     граница — защита от зависания reprocess поддельным уровнем;
   *     реальный сейв недостижим, прецедент MAX_SAVED_DAY);
   *   * xp — не finite ≥ 0 (дроби как есть — прецедент hero.xp);
   *   * skillXp — есть, но не plain-object c ВСЕМИ значениями
   *     finite ≥ 0 (дроби ЛЕГИТИМНЫ — практика 000117);
   *   * skills — есть, но не plain-object c ВСЕМИ значениями
   *     int ≥ 0 (форма 000111 §2: целые; forged 2.5 — дефект формы,
   *     не floor);
   *   * (000115 D2, при переданном каталоге) ЛЮБОЙ ключ skillXp или
   *     skills ∉ каталога скилов, ИЛИ элемент spells ∉ каталога
   *     заклинаний → null на ВЕСЬ раздел (сброс ЗАПИСИ, 000029);
   *   * spells — не массив строк (элемент не-строка → null; дубли —
   *     первый остаётся). Отсутствует ИЛИ ПУСТОЙ → EFIR_SPELL_START
   *     (старт [spark, mend] — НЕ выводить из уровня, 000115:
   *     легитимная книга никогда не пуста).
   *   skillXp/skills отсутствуют → {} (3-полевая legacy-форма до
   *   000111 → 5 полей, 000111 §9).
   */
  function deserializeEfir(raw, skillCatalog, spellCatalog) {
    if (raw == null || !isPlainObject(raw)) return null;
    if (!Number.isInteger(raw.level) || raw.level < 1) return null;
    if (raw.level > EFIR_SAVE_MAX_LEVEL) return null; // D5: guard
    if (typeof raw.xp !== 'number' || !Number.isFinite(raw.xp) ||
        raw.xp < 0) {
      return null;
    }
    let skillXp = {};
    if (raw.skillXp !== undefined) {
      if (!isPlainObject(raw.skillXp)) return null;
      for (const [k, v] of Object.entries(raw.skillXp)) {
        if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) {
          return null;
        }
        skillXp[k] = v;
      }
    }
    let skills = {};
    if (raw.skills !== undefined) {
      if (!isPlainObject(raw.skills)) return null;
      for (const [k, v] of Object.entries(raw.skills)) {
        if (!Number.isInteger(v) || v < 0) return null;
        skills[k] = v;
      }
    }
    let spells;
    if (raw.spells === undefined ||
        (Array.isArray(raw.spells) && raw.spells.length === 0)) {
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
    // 000115 D2: id-валидация по каталогам-параметрам. Каталог
    // null/мусор → catalogIds null → ВЫКЛ (безопасное направление:
    // unknown-id инертен, поведение 000085; тихая — warn печатает
    // main.js при null на раздел).
    const skillIds = catalogIds(skillCatalog);
    if (skillIds) {
      for (const k of Object.keys(skillXp)) {
        if (!skillIds.has(k)) return null; // сброс ЗАПИСИ (000029)
      }
      for (const k of Object.keys(skills)) {
        if (!skillIds.has(k)) return null;
      }
    }
    const spellIds = catalogIds(spellCatalog);
    if (spellIds) {
      for (const s of spells) {
        if (!spellIds.has(s)) return null;
      }
    }
    // 000115 D3: ОБЯЗАТЕЛЬНЫЙ переучёт (канон 000111 §9): банк-дроби →
    // уровни в requires-порядке, cap, overflow; материализация ВСЕХ 4
    // id пула (выход ПЛОТНЫЙ); level/xp/spells — не трогает;
    // идемпотентен (неподвижная точка на канонической форме).
    const state = { level: raw.level, xp: raw.xp, skillXp, skills, spells };
    reprocessEfirSkills(state);
    return state;
  }

  /**
   * Боевой профиль Эфира (задача 000112, контракт
   * memory/000112-efir-combat.md §3.1): АПГРЕЙД СУЩЕСТВУЮЩЕГО боевого
   * юнита (D2 — поиск id 'efir' side 'ally'; расстановка/резервация/
   * очередь сделаны createCombat — ноль новых вызовов c._rng, ноль
   * правок createCombat). Явные статы (в обход формулы makeAlly —
   * данные efirAllyData её не несут):
   *   u.maxHP = u.hp = efirStats.maxHP (100% на старте боя; возврат
   *     после гибели — СТРУКТУРНО: каждый бой — новый makeAlly +
   *     buildEfirUnit),
   *   u.mp = efirStats.maxMP — мана СОБСТВЕННАЯ, полная, БЕЗ регена
   *     в бою (зафиксировано ТЗ),
   *   u.damage — «Касание духа»: max(1, round((2 + 0.5·Мудрость)·
   *     (u.moraleMult || 1))) — мораль ВНУТРИ round (D6: паттерн
   *     makeAlly 000080; companionMoraleBonus — как у любого союзника),
   *   c.efs — СВОИ пулы действий (паттерн refillPools, зеркальная
   *     формула в endPlayerTurn combat.js — пин EF-1): spellInt =
   *     1 + floor(Интеллект/10), spellWis = 1 + floor(Мудрость/10),
   *     touch = 1, move = 3 (клетки за ход; у Эфира нет Ловкости),
   *   u.efirSkills — СНАПШОТ пула лордов (ВСЕ ЧЕТЫРЕ id по
   *     EFIR_SKILLS из state.skills; D8: бой не зависит от мутаций
   *     state в полёте; 000117 читает как базу переучёта; НЕ путать
   *     с u.skills — список id из данных makeAlly),
   *   c.efir — ссылка на юнит (refill/тики в endPlayerTurn).
   * state (efir) — ТОЛЬКО чтение (level/skills); бой state НЕ
   * мутирует. Тихая деградация: юнита нет / c без units → null.
   * @returns {object|null} проапгрейденный юнит; null — деградация.
   */
  function buildEfirUnit(efir, c) {
    const u = (c && Array.isArray(c.units))
      ? c.units.find((x) => x.id === 'efir' && x.side === 'ally')
      : null;
    if (!u) return null;
    const stats = efirStats(u.level);
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
      u.efirSkills[def.id] = (efir && efir.skills && efir.skills[def.id]) || 0;
    }
    c.efir = u;
    return u;
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
    // 000085 (сериализация состояния под сейв; контракт
    // memory/000085-save-party-efir.md D1/D4/D5; расширения 000115 —
    // id-валидация + reprocess — в этот же хвост):
    serializeEfir, deserializeEfir,
    // 000112 (контракт memory/000112-efir-combat.md §3.1: боевой
    // профиль — в хвост return-блока, конфликт с 000085-serialize
    // минимален):
    buildEfirUnit,
  };
});
