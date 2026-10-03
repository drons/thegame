// Глобальные настройки игры: «настраиваемые» числовые параметры из SPEC.md.
//
// Единый источник значений, которые раньше были захардкожены по модулям
// (day.js, dungeon.js, player.js, combat.js). Ключи — имена параметров
// из SPEC.md:
//   steps_per_day        — «Игровое время» (по умолчанию 40)
//   respawn_days         — «Мобы» (по умолчанию 3)
//   dungeon_memory_days  — «Мобы» (по умолчанию 3)
//   city_respawn_days    — «Города и деревни» (задача 000109): дней
//                          до ПЕРЕГЕНЕРАЦИИ стока лавок города при
//                          входе (по умолчанию 3 — «несколько
//                          игровых дней»)
//   level_delta_max      — «Мобы», дельта уровня моба N (по умолчанию 3)
//   points_per_level     — «Навыки» (по умолчанию 2)
//   move_interval_ms     — «Карта мира», базовый интервал шага
//                          (по умолчанию 420 мс)
//   combat_difficulty    — «Боевая система», текущая сложность
//   combat_difficulties  — «Боевая система», множители HP/урона мобов
//                          по каждой сложности ('easy'/'medium'/'hard')
//   city_channel         — «Города и деревни» (подраздел «Размещение»,
//                          задача 000103): параметры городского канала
//                          src/map.js — порог редкости (fbm/rarity) и
//                          доли частоты типов городов
//   camp_channel         — «Лагерь» (размещение, задача 000131):
//                          параметры лагерного канала src/map.js —
//                          порог редкости (fbm/rarity) лагерей
//                          (каталог 000047, механика 000095); без
//                          type_shares — тип не выбирается (47)
//   combat_obstacle_min_frac — «Боевая система», мин. доля клеток
//                          поля, занятых препятствиями (задача 000050)
//   combat_obstacle_max_frac — «Боевая система», макс. доля (000050)
//
// Зависимостей нет — в index.html подключается ПЕРВЫМ среди src-скриптов.
// Униформный модуль: в браузере — globalThis.Game.GlobalSettings,
// в node — require() (CommonJS).
//
// 000098 — ЧИСТЫЕ экспорты рядом со SETTINGS (контракт
// memory/000098-game-settings-tab.md):
//   META     — таблица метаданных на ВСЕ ключи SETTINGS (ОТДЕЛЬНЫЙ
//              объект; label/type/step/min/max/positive/options/
//              subkeys/group) — единый источник формы вкладки
//              «Игровые настройки» (src/ui-tab-settings.js);
//   DEFAULTS — значения по умолчанию: frozen глубокий JSON-клон
//              SETTINGS в момент загрузки (structuredClone не
//              используется — только Node 24/браузеры различаются);
//   clampValue(path, raw) — валидация/кламп по dot-path: вне
//              диапазона → ближайшее допустимое, int — round;
//              clamped: true — когда принятое значение отличается
//              от входного (round/кламп → заметка в UI); мусор →
//              отказ (reason), positive ≤ 0 → отказ; чистая;
//   resetKey(path) / resetAll() — сброс к DEFAULTS; ссылка на
//              SETTINGS НЕ меняется.
// SETTINGS — БЕЗ ИЗМЕНЕНИЙ (тот же живой объект; персистентность —
// session-only: в сейв не пишутся, после перезагрузки — DEFAULTS).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.GlobalSettings (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { GlobalSettings: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  const SETTINGS = {
    steps_per_day: 40,        // успешных шагов мира за игровой день
    respawn_days: 3,          // дней до респауна побеждённой стационарной группы
    dungeon_memory_days: 3,   // дней памяти содержимого подземелья
    // Респаун города (задача 000109, SPEC «Города и деревни» →
    // «Состояние, сейв, респаун»): дней до ПЕРЕГЕНЕРАЦИИ стока
    // лавок при входе (day − lastVisitDay >= N → ресток).
    // «Несколько игровых дней» — 3 (симметрия respawn_days /
    // dungeon_memory_days).
    city_respawn_days: 3,
    level_delta_max: 3,       // уровень моба = персонаж ± N
    points_per_level: 2,      // очков навыков за игровой уровень
    // Базовый интервал шага по глобальной карте (задача 000063):
    // 140 * 3 = 420 мс — базовая СКОРОСТЬ передвижения уменьшена в три
    // раза (движение после 000033 было «очень быстрым»). Скорость =
    // 1/интервал, значит интервал ×3. НЕ 140/3 — это ускорение.
    move_interval_ms: 140 * 3,
    combat_difficulty: 'medium', // текущая сложность боя
    // Множители к HP и урону мобов по каждой сложности (задача 000027).
    // Подобраны симуляцией (tests/combat.test.js, отчёт tasks/result/000027.md):
    // на 'medium' герой уровня группы с разумной прокачкой и разумной игрой
    // (удары + блок, поддержка на первом месте) побеждает ВСЕ стандартные
    // группы на всех сидов; 'hard' — только с грамотной игрой.
    combat_difficulties: {
      easy:   { hp: 0.3, damage: 0.3 },
      medium: { hp: 0.45, damage: 0.45 },
      hard:   { hp: 0.6, damage: 0.55 },
    },
    // Городской канал размещения (задача 000103): города на глобальной
    // карте — через ОТДЕЛЬНЫЙ детерминированный канал в src/map.js
    // (anchorAt), НЕ как 14-й слот (000064/000073: `hash % 13` и
    // распределение слотов не меняются). SPEC.md («Города и деревни» →
    // «Размещение»): «параметры — global-settings».
    //   fbm    — порог по ТОМУ ЖЕ features-шуму (офсет 511.1), что у
    //            слотового якоря (0.33 + 0.14·rarity), но ВЫШЕ: город
    //            РЕЖЕ обычной постройки; обязателен порог
    //            fbm + rarity·r >= 0.33 + 0.14·r при всех r ∈ [0,1]
    //            (закреплено тестом) — город забирает СУЩЕСТВУЮЩИЕ
    //            слотовые якоря (city ⊂ slot anchor), не рождается
    //            «из ничего»;
    //   rarity — тот же коэффициент A-канала (тёмный A = реже), что у
    //            слотового якоря;
    //   type_shares — доли частоты типов, пары [id, share] ровно для
    //            4 записей каталога категории «город» (000102:
    //            51 Хутор 1x1, 52 Деревня 2x2, 53 Город 5x5, 54
    //            Столица 7x7), по возрастанию id — порядок
    //            кумулятивного выбора типа: hash2(x, y, CITY_SEED_CONST)
    //            (src/map.js) → хутор част, столица редка.
    city_channel: {
      fbm: 0.45,
      rarity: 0.10,
      type_shares: [[51, 0.6], [52, 0.3], [53, 0.08], [54, 0.02]],
    },
    // Лагерный канал размещения (задача 000131): нейтральные лагеря
    // (каталог 000047, механика 000095: костёр/барахолка/кочевник)
    // на глобальной карте — через АДДИТИВНЫЙ детерминированный канал
    // в src/map.js (anchorAt), паттерн городского (000103): лагерь
    // (1×1, type = NONE, buildingId 47) генерируется ТОЛЬКО там, где
    // слотовый якорь НЕ генерируется, по СОБСТВЕННОМУ смещению
    // features-шума (CAMP_FEATURE_OFFSET, src/map.js). «Лагерь = по
    // редкости как город» — тот же порог 0.45/0.10. БЕЗ type_shares:
    // тип не выбирается (всегда 47 — сид-константы канала НЕТ).
    camp_channel: {
      fbm: 0.45,
      rarity: 0.10,
    },
    // Препятствия на поле боя (задача 000050): диапазон ДОЛИ клеток
    // мини-карты, занятых непроходимыми клетками. Число клеток =
    // round(frac × area), равномерный бросок [min; max] — генерация
    // в createCombat (src/combat.js), детерминирована по сиду.
    combat_obstacle_min_frac: 0.10,
    combat_obstacle_max_frac: 0.20,
    // Спутники (задача 000079, SPEC.md «Спутники»): параметры ядра
    // отряда src/companions.js. Доли (не проценты) — как
    // combat_difficulties.
    max_companions: 3,        // отряд до 3 спутников
    companion_loyalty: {
      start: 50,              // лояльность новичка = start + Харизма
      paid: 2,                // + за оплаченное жалованье
      unpaid: 20,             // − за неоплату
      quit_low: 20,           // ≤ — уйдёт верно
      quit_high: 40,          // (20…40] — с вероятностью quit_chance_mid
      quit_chance_mid: 0.5,   // 50% в полосе 21…40
    },
    companion_refusal: {
      base: 0.30,             // база шанса отказа от найма
      charisma_per_level: 0.02, // − за уровень Харизмы
      artist_per_level: 0.05,   // − за уровень Артиста
    },
    // Доля боевого опыта КАЖДОГО ВЫЖИВШЕГО спутника (задача 000082,
    // SPEC.md «Спутники» → «Опыт и уровни»): игрок — 100% боевого xp
    // (без изменений), каждый выживший — эту долю (НЕ делится на число
    // спутников). Читаются ЖИВО при победе (src/combat.js,
    // checkVictory); 0 — спутники не получают (доля, не процент).
    companion_xp_share: 0.5,
  };

  // --- 000098: META — таблица метаданных (ОТДЕЛЬНЫЙ объект) ---------
  //
  // ЯВНАЯ запись на КАЖДЫЙ ключ Object.keys(SETTINGS). Ключ БЕЗ
  // записи → generic (metaFor, ниже): число → int/float с min 1,
  // строка → enum из [текущее значение], объект → nested по
  // скалярным листьям; НОВЫЙ ключ не падает, но тест S1 (META 1:1 с
  // SETTINGS) ломается ОСОЗНАННО — добавление ключа только с
  // обновлением META и ре-пином первого deepEqual-теста.
  //
  // Границы:
  //   steps_per_day min 1 — ≤ 0: БЕСКОНЕЧНЫЙ цикл
  //     while (steps >= perDay) в addStep (day.js:54) — зависание;
  //   move_interval_ms [60, 10000] — 60 = MIN_MOVE_INTERVAL_MS
  //     (src/motion.js, sync закреплён тестом S2; ниже «съедает»
  //     «Ловкий шаг», memory/000063); 10000 — «разумный максимум»;
  //   level_delta_max min 0 — 0 ВАЛИДНО (тест «±0», отклонение от
  //     формулы ТЗ «int ≥ 1» зафиксировано);
  //   множители боя — float > 0 (positive: 0×HP = поломка боя);
  //   доли — [0,1] (generic min = 1 их СЛОМАЛ бы — явные записи,
  //     предупреждение 000082).
  const META = {
    steps_per_day: { label: 'Шагов за день', type: 'int', min: 1 },
    respawn_days: { label: 'Респаун групп (дн.)', type: 'int', min: 1 },
    dungeon_memory_days: { label: 'Память подземелья (дн.)', type: 'int',
      min: 1 },
    // 000109: дни — положительные целые (min 1; 0 — «респаун каждый
    // визит», «несколько дней» SPEC этим не является).
    city_respawn_days: { label: 'Респаун города (дн.)', type: 'int',
      min: 1 },
    level_delta_max: { label: 'Разброс уровня мобов (±)', type: 'int',
      min: 0 },
    points_per_level: { label: 'Очков за уровень', type: 'int', min: 1 },
    // 60 = MIN_MOVE_INTERVAL_MS (src/motion.js L134) — синхронизация
    // комментарием + структурным под-ассертом S2.
    move_interval_ms: { label: 'Интервал шага (мс)', type: 'int',
      min: 60, max: 10000, step: 20 },
    // enum: options — ИМЯ ключа SETTINGS (live-источник:
    // Object.keys(SETTINGS[имя])). group — общий подзаголовок для
    // СОСЕДНИХ ключей с той же группой (форма: одна шапка).
    combat_difficulty: { label: 'Сложность', type: 'enum',
      options: 'combat_difficulties', group: 'Сложности боя' },
    combat_difficulties: { label: 'Сложности боя', type: 'nested',
      group: 'Сложности боя',
      subkeys: {
        easy: { label: 'Лёгкая', type: 'nested', subkeys: {
          hp: { label: 'HP', type: 'float', positive: true },
          damage: { label: 'Урон', type: 'float', positive: true },
        } },
        medium: { label: 'Средняя', type: 'nested', subkeys: {
          hp: { label: 'HP', type: 'float', positive: true },
          damage: { label: 'Урон', type: 'float', positive: true },
        } },
        hard: { label: 'Сложная', type: 'nested', subkeys: {
          hp: { label: 'HP', type: 'float', positive: true },
          damage: { label: 'Урон', type: 'float', positive: true },
        } },
      } },
    // type_shares — НЕ в subkeys (решение D4): массив пар [id, share]
    // связан с каталогом 000102 (ровно 4 типа, Σ=1 закреплён тестом
    // 000103) — скалярного представления нет, в форму не идёт;
    // восстанавливается «сбросом» объекта city_channel целиком.
    city_channel: { label: 'Городской канал', type: 'nested',
      subkeys: {
        fbm: { label: 'Порог шума', type: 'float', min: 0, max: 1,
          step: 0.01 },
        rarity: { label: 'Редкость', type: 'float', min: 0, max: 1,
          step: 0.01 },
      } },
    // Лагерный канал (000131): как city_channel, НО БЕЗ type_shares
    // — тип лагеря не выбирается (всегда 47, сид-константы канала
    // нет) — скалярных полей для доли типов не существует.
    camp_channel: { label: 'Лагерный канал', type: 'nested',
      subkeys: {
        fbm: { label: 'Порог шума', type: 'float', min: 0, max: 1,
          step: 0.01 },
        rarity: { label: 'Редкость', type: 'float', min: 0, max: 1,
          step: 0.01 },
      } },
    combat_obstacle_min_frac: { label: 'Препятствия: мин. доля поля',
      type: 'float', min: 0, max: 1, step: 0.01 },
    combat_obstacle_max_frac: { label: 'Препятствия: макс. доля поля',
      type: 'float', min: 0, max: 1, step: 0.01 },
    // 0 — дегенеративный «выкл. спутников», ядро под него не
    // проектировалось (000079) → min 1.
    max_companions: { label: 'Спутников в отряде', type: 'int', min: 1 },
    // Кросс quit_low < quit_high формой НЕ гоняется: ядро мягко
    // деградирует (companions.js) — осознанно (контракт §2.1).
    companion_loyalty: { label: 'Лояльность спутников', type: 'nested',
      subkeys: {
        start: { label: 'Старт', type: 'int', min: 0, max: 100 },
        paid: { label: '+ за жалованье', type: 'int', min: 1 },
        unpaid: { label: '− за неоплату', type: 'int', min: 1 },
        quit_low: { label: 'Уйдёт при ≤', type: 'int', min: 1, max: 99 },
        quit_high: { label: 'Полоса до', type: 'int', min: 1, max: 99 },
        quit_chance_mid: { label: 'Шанс в полосе', type: 'float',
          min: 0, max: 1, step: 0.01 },
      } },
    companion_refusal: { label: 'Отказ спутников', type: 'nested',
      subkeys: {
        base: { label: 'База шанса', type: 'float', min: 0, max: 1,
          step: 0.01 },
        charisma_per_level: { label: '− за уровень Харизмы',
          type: 'float', min: 0, max: 1, step: 0.01 },
        artist_per_level: { label: '− за уровень Артиста',
          type: 'float', min: 0, max: 1, step: 0.01 },
      } },
    // 0 — валидно («не получают», SPEC/000082); generic min = 1 СЛОМАЛ
    // бы долю — отсюда явная запись.
    companion_xp_share: { label: 'Доля опыта спутников', type: 'float',
      min: 0, max: 1, step: 0.01 },
  };

  // --- 000098: DEFAULTS — frozen глубокий клон значений при загрузке --
  //
  // JSON-клон (кросс-совместимо; structuredClone — только Node 24,
  // браузеры — разные — ТЗ) + РЕКУРСИВНЫЙ freeze. Независим от
  // SETTINGS (глубина клона: вложенные объекты не по ссылке).
  function jsonClone(v) { return JSON.parse(JSON.stringify(v)); }

  function deepFreeze(o) {
    if (o && typeof o === 'object' && !Object.isFrozen(o)) {
      Object.freeze(o);
      for (const k of Object.getOwnPropertyNames(o)) deepFreeze(o[k]);
    }
    return o;
  }

  const DEFAULTS = deepFreeze(jsonClone(SETTINGS));

  // --- 000098: внутренние хелперы (НЕ экспортируются) ----------------

  function getPath(obj, p) {
    let v = obj;
    for (const k of String(p).split('.')) {
      if (v == null || typeof v !== 'object') return undefined;
      v = v[k];
    }
    return v;
  }

  // Generic-запись для ключа БЕЗ явной записи в META (будущие ключи;
  // ТЗ: «новый ключ НЕ падает»). ЧИСЛА — min = 1: доля < 1 требует
  // ЯВНОЙ записи (hazard 000082: companion_xp_share 0.5,
  // combat_obstacle_* 0.10/0.20).
  function genericMeta(value) {
    if (typeof value === 'number') {
      return { label: '',
        type: Number.isInteger(value) ? 'int' : 'float', min: 1 };
    }
    if (typeof value === 'string') {
      return { label: '', type: 'enum', options: [value] };
    }
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      const sub = {};
      for (const k of Object.keys(value)) {
        const v = value[k];
        if (typeof v === 'number' || typeof v === 'string' ||
            (v && typeof v === 'object' && !Array.isArray(v))) {
          sub[k] = genericMeta(v);
        }
        // массив — вне скалярного представления
      }
      return { label: '', type: 'nested', subkeys: sub };
    }
    return { label: '', type: 'plain' };  // массив / undefined / прочее
  }

  // Запись META по DOT-PATH ('combat_difficulties.easy.hp'): по
  // сегментам (запись → subkeys → …); отсутствующий сегмент / ключ без
  // записи → generic по текущему значению (не throw).
  function metaFor(p) {
    const segs = String(p).split('.');
    let rec = META[segs[0]] || null;
    let i = 1;
    while (i < segs.length && rec && rec.subkeys &&
        rec.subkeys[segs[i]]) {
      rec = rec.subkeys[segs[i]];
      i++;
    }
    if (rec && i === segs.length) return rec;
    return genericMeta(getPath(SETTINGS, p));
  }

  // live-options enum: options — имя ключа SETTINGS (Object.keys
  // живого объекта) или статический массив.
  function enumOptions(rec) {
    if (typeof rec.options === 'string') {
      const src = SETTINGS[rec.options];
      if (src && typeof src === 'object' && !Array.isArray(src)) {
        return Object.keys(src);
      }
      return [];
    }
    if (Array.isArray(rec.options)) return rec.options;
    return [];
  }

  // --- 000098: публичные функции (ЧИСТЫЕ, node-тестируемые) ----------

  // Кламп/валидация значения по dot-path (ТЗ):
  //   * вне диапазона → БЛИЖАЙШЕЕ допустимое (clamped: true — заметка
  //     в UI); int — Math.round;
  //   * мусор (NaN, '', ±Inf, нечисловая строка) → ОТКАЗ: value не
  //     принимается (UI восстанавливает input), reason — заметка;
  //   * positive (только множители боя) ≤ 0 → ОТКАЗ: у (0,∞)
  //     «ближайшего допустимого» нет (0×HP = поломка боя);
  //   * enum — только live-значения.
  // Чистая: без DOM, без мутаций, НИКОГДА не бросает.
  function clampValue(p, raw) {
    const rec = metaFor(p);
    if (rec.type === 'int' || rec.type === 'float') {
      let n;
      if (typeof raw === 'number') {
        n = raw;
      } else if (typeof raw === 'string') {
        const s = raw.trim();
        n = s === '' ? NaN : Number(s);
      } else {
        n = NaN;
      }
      if (!Number.isFinite(n)) {
        return { ok: false, reason: '«' + String(raw) +
          '» — не число' };
      }
      const given = n;             // исходное конечное (до round/клампа)
      if (rec.type === 'int') n = Math.round(n);
      let v = n;
      if (rec.positive && v <= 0) {
        return { ok: false, reason: 'значение должно быть больше 0' };
      }
      if (rec.min != null && v < rec.min) v = rec.min;
      if (rec.max != null && v > rec.max) v = rec.max;
      // clamped — принятое значение ИЗМЕНИЛОСЬ относительно входного
      // (round целочисленного или кламп в min/max): 0.5 → 1 (min),
      // 40.6 → 41 (round), 1e9 → max. UI обязан показать заметку
      // (ревью 000098: сравнение УЖЕ скруглённого значения с min/max
      // пропускало 0.5 → 1 — заметки не было, тогда как '-0' → 1 —
      // была; расхождение в обратной связи закрыто).
      const clamped = v !== given;
      return { ok: true, value: v, clamped };
    }
    if (rec.type === 'enum') {
      const s = String(raw);
      if (enumOptions(rec).indexOf(s) >= 0) {
        return { ok: true, value: s, clamped: false };
      }
      return { ok: false, reason: '«' + s +
        '» — не входит в допустимые значения' };
    }
    return { ok: false, reason: 'поле не принимает значений' };
  }

  // Сброс КЛЮЧА (топовый или dot-path) к значению из DEFAULTS:
  // вложенный объект — ЦЕЛИКОМ (и клон — DEFAULTS остаётся frozen).
  // Ссылка на SETTINGS НЕ меняется.
  function resetKey(p) {
    const segs = String(p).split('.');
    const dv = getPath(DEFAULTS, p);
    if (dv === undefined) return;
    if (segs.length === 1) {
      SETTINGS[segs[0]] = jsonClone(dv);
      return;
    }
    let o = SETTINGS;
    for (let i = 0; i < segs.length - 1; i++) {
      if (o == null || typeof o !== 'object') return;
      o = o[segs[i]];
    }
    if (o == null || typeof o !== 'object') return;
    o[segs[segs.length - 1]] = jsonClone(dv);
  }

  // «Сбросить всё» (ТЗ): Object.assign-семантика — вложенные объекты
  // целиком, ссылка на SETTINGS — та же.
  function resetAll() {
    Object.assign(SETTINGS, jsonClone(DEFAULTS));
  }

  return { SETTINGS, META, DEFAULTS, clampValue, resetKey, resetAll };
});
