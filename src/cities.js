// Layout города (задача 000104, дочерняя 000052 «Города и деревни»).
//
// Детерминированный dungeon-совместимый layout города: периметр —
// стены, внутренность — открытое пространство (город НЕ лабиринт),
// вход — южный периметр, выход — северный. Seed — от ПОЗИЦИИ города
// (hash2(cityX, cityY, CITY_LAYOUT_CONST)), НЕ от опыта персонажа:
// layout статичен, один якорь → один layout навсегда. Содержимое
// (постройки/NPC/лавки) — 000106, экран/состояние — 000105.
//
// Чистое ядро без DOM — тестируется в node (tests/cities.test.js).
// Униформный модуль: в браузере — globalThis.Game (неймспейс
// Game.Cities), в node — require(). Зависимости: perlin.js
// (hash2, mulberry32 — load-time), items.js (makeShop) и
// buildings.js (каталог: buildingId → особые_параметры.map_index) —
// для makeCityShop (000108); взаимных require в момент загрузки нет
// (items.js/buildings.js cities.js НЕ требуют — цикла нет; цепочки
// vm-песочниц без items.js — cities.js грузится, а makeCityShop
// бросает ленивый гард при вызове). Решения закреплены в
// memory/000104-cities-layout.md и memory/000108-city-shops.md;
// golden-пины — в tests/cities.test.js (смена CITY_LAYOUT_CONST /
// CITY_SHOP_CELL_BASE после мержа недопустима — сменит ВСЕ города).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('./perlin.js'),
      require('./items.js'),
      require('./buildings.js'));
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0,
      { Cities: factory(G0, null, null, root) });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function (perlin, items, buildings, rootRef) {

  if (!perlin || typeof perlin.hash2 !== 'function' ||
      typeof perlin.mulberry32 !== 'function') {
    throw new Error(
      'cities.js: не найден perlin.js — загрузите perlin.js до cities.js');
  }

  const hash2 = perlin.hash2;
  const mulberry32 = perlin.mulberry32;

  // Значения клеток — те же, что в dungeon.js (дungeon-совместимость:
  // dungeon-ui рисует 0/1 без изменений; константы переопределены —
  // взаимный require невозможен, равенство закреплено тестом).
  const CELL_WALL = 0;
  const CELL_FLOOR = 1;

  // Соль сида layout: НОВАЯ константа (не GLOBAL_SEED, не
  // CITY_SEED_CONST 000103, не сиды dungeon.js). GOLDEN-ПИН: смена
  // после мержа = смена ВСЕХ городских layout'ов — недопустима.
  // GLOBAL_SEED НЕ смешивается: cities.js не тянет map.js, а
  // дублировать его литерал в константе нельзя (аудит 000053).
  const CITY_LAYOUT_CONST = 0x4c41594f;

  /** Внутренний размер layout: 4×footprint − 2 (1→2x2, 2→6x6,
   *  5→18x18, 7→26x26; хутор fp1 — вырожденный 2x2; интерьер ровно
   *  ×4 при f≥2 — 000148.01). */
  function cityLayoutSize(footprint) {
    if (!Number.isInteger(footprint) || footprint < 1) {
      throw new Error(
        'cities.js: footprint — целое ≥ 1 (получено ' + String(footprint) + ')');
    }
    return 4 * footprint - 2;
  }

  /** Сид layout от ПОЗИЦИИ города (не totalXp, не террейн). */
  function cityLayoutSeed(cityX, cityY) {
    return hash2(cityX, cityY, CITY_LAYOUT_CONST) >>> 0;
  }

  /**
   * Layout города: dungeon-совместимая структура city-shape.
   *   { width, height, cells, entrance:{x,y}, exit:{x,y}, seed,
   *     kind: 'city' }
   * ровно 7 полей — БЕЗ type/rooms/wallObjs (город — НЕ тип
   * подземелья; 000105 не читает dungeon-поля у kind === 'city').
   *
   * Периметр — CELL_WALL; внутренность — сплошное CELL_FLOOR
   * (открытое пространство; «улицы/кварталы» не делаются).
   * 000177: ОДИН тайл = вход и выход — ДВЕРЬ на южном периметре
   * (y = height−1, сторона спавна): entrance = exit (deepEqual-
   * инвариант); x — из rng(mulberry32(seed)) по колоннам 1..width−2
   * (ОДИН вызов col() — golden-пин; при width=2 x=0). Старая
   * северная клетка выхода больше не проставляется FLOOR —
   * остаётся WALL (периметр). Layout СТАТИЧЕН: один якорь →
   * один layout навсегда.
   * @param {number} cityX координата якоря на основной карте
   * @param {number} cityY координата якоря на основной карте
   * @param {number} footprint сторона квадрата типа города (каталог
   *        000102: 1/2/5/7; новое целое ≥ 1 — тоже валидно)
   */
  function createCityLayout(cityX, cityY, footprint) {
    const W = cityLayoutSize(footprint);
    const H = W;
    const seed = cityLayoutSeed(cityX, cityY);
    const rng = mulberry32(seed);
    const cells = new Array(W * H).fill(CELL_WALL);
    // Внутренность — открытое пространство (у хутора W=2 её нет —
    // цикл по пустому диапазону; все 4 клетки — периметр).
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) cells[y * W + x] = CELL_FLOOR;
    }
    // Дверь (000177: единый тайл входа-выхода): колонна 1..W−2
    // (при W=2 — 0), южный периметр. ОДИН вызов col() — rng-поток
    // layout короче на один вызов, чем до 000177 (ТЗ-принуждение;
    // entrance — ПЕРВЫЙ вызов, позиция двери не меняется).
    const col = () => (W >= 3 ? 1 + Math.floor(rng() * (W - 2)) : 0);
    const door = { x: col(), y: H - 1 };
    cells[door.y * W + door.x] = CELL_FLOOR;
    return { width: W, height: H, cells, entrance: door, exit: door,
      seed, kind: 'city' };
  }

  // ============================================================
  // Содержимое города (задача 000106) — generateCityContents
  // ============================================================
  //
  // Что ВНУТРИ города: внутренние постройки 1x1 на FLOOR-клетках
  // layout'а (ничего на entrance/exit). Все решения зафиксированы
  // в memory/000106-city-contents.md; golden-пины — в
  // tests/cities.test.js (раздел «Содержимое города»):
  //  * seed = hash2(cityX, cityY, CITY_CONTENT_CONST) >>> 0 — от
  //    ПОЗИЦИИ якоря; НЕ totalXp/террейн, НЕ wealth (один якорь →
  //    один rng-поток на все wealth);
  //  * count = мин_постройки + wealth; ассортимент — топ-(1+wealth)
  //    ключей доли_типов по (доля убыв, id растущ); квоты только из
  //    cityRecord (source of truth 000053 — код не хардкодит);
  //  * таверна (id 44) строится ПЕРВОЙ (минимум 1 в каждом городе,
  //    найм 000065/000078; тип без rng-выбора), остальные —
  //    взвешенный выбор по долям активных (1 rng, кумулятивная
  //    сумма в порядке сортировки);
  //  * размещение — паттерн takeSpot (src/dungeon.js): ≤200
  //    случайных попыток из rng; КАЖДАЯ попытка проверяется
  //    4-направленным BFS от entrance (постройки = стены):
  //    недостижимый FLOOR (включая exit) → отклонение; после 200
  //    провалов — детерминированный y→x скан (БЕЗ rng); валидных
  //    мест нет — GRACEFUL-стоп (buildings.length < count — норма:
  //    достижимость > минимум);
  //  * хутор (fp1): FLOOR только единый тайл (000177: вход =
  //    выход = дверь) → мест нет → buildings: []
  //    (задокументированное исключение, 000102/000104);
  //  * result — plain {buildings, seed} (сериализуемо — сейв
  //    000109); layout НЕ мутируется (своя копия cells);
  //  * порядок вызовов rng (таверна: место; дальше: тип → место)
  //    = GOLDEN-ПИН — смена после мержа сменит ВСЕ города.

  // Соль сида содержимого: НОВАЯ константа (не CITY_LAYOUT_CONST,
  // не GLOBAL_SEED, не сиды dungeon.js — аудит 000053). GOLDEN-ПИН:
  // смена после мержа = смена ВСЕХ городских содержимых.
  const CITY_CONTENT_CONST = 0x434f4e54; // ASCII «CONT»

  const TAV_ID = 44; // Таверна — минимум 1 в каждом городе
  const PLACE_ATTEMPTS = 200; // паттерн takeSpot (src/dungeon.js)

  /** Сид содержимого от ПОЗИЦИИ города (не totalXp/террейн/wealth). */
  function cityContentSeed(cityX, cityY) {
    return hash2(cityX, cityY, CITY_CONTENT_CONST) >>> 0;
  }

  /** Валидация layout: width/height/cells/entrance/exit. */
  function validateContentLayout(layout) {
    if (layout === null || typeof layout !== 'object')
      throw new Error('cities.js: layout — объект с width/height/cells/' +
        'entrance/exit');
    if (!Number.isInteger(layout.width) || layout.width < 1)
      throw new Error('cities.js: layout.width — целое ≥ 1');
    if (!Number.isInteger(layout.height) || layout.height < 1)
      throw new Error('cities.js: layout.height — целое ≥ 1');
    if (!Array.isArray(layout.cells) ||
        layout.cells.length !== layout.width * layout.height)
      throw new Error('cities.js: layout.cells — массив width×height');
    for (const d of [layout.entrance, layout.exit]) {
      if (d === null || typeof d !== 'object' ||
          !Number.isInteger(d.x) || !Number.isInteger(d.y) ||
          d.x < 0 || d.x >= layout.width ||
          d.y < 0 || d.y >= layout.height)
        throw new Error('cities.js: layout.entrance/exit — {x, y} ' +
          'в пределах layout');
    }
  }

  /** Валидация wealth: целое 0..3. */
  function validateWealth(wealth) {
    if (!Number.isInteger(wealth) || wealth < 0 || wealth > 3)
      throw new Error('cities.js: wealth — целое 0..3 (получено ' +
        String(wealth) + ')');
  }

  /** Валидация cityRecord (запись каталога города, 000102):
   *  особые_параметры / мин_постройки (целое ≥ 0) / доли_типов
   *  (непустой объект: числовые ключи, числовые доли > 0).
   *  @returns {{ min:number, shares:{id:number, share:number}[] }} */
  function validateCityRecord(cityRecord) {
    if (cityRecord === null || typeof cityRecord !== 'object' ||
        Array.isArray(cityRecord))
      throw new Error('cities.js: cityRecord — запись каталога города');
    const pp = cityRecord.особые_параметры;
    if (pp === null || typeof pp !== 'object' || Array.isArray(pp))
      throw new Error('cities.js: cityRecord.особые_параметры — объект');
    const min = pp.мин_постройки;
    if (!Number.isInteger(min) || min < 0)
      throw new Error('cities.js: мин_постройки — целое ≥ 0 (получено ' +
        String(min) + ')');
    const доли = pp.доли_типов;
    if (доли === null || typeof доли !== 'object' || Array.isArray(доли))
      throw new Error('cities.js: доли_типов — объект (id → доля)');
    const shares = [];
    for (const [k, v] of Object.entries(доли)) {
      const id = Number(k); // ключи JSON — строки
      if (!Number.isInteger(id))
        throw new Error('cities.js: доли_типов — числовые ключи (получено «' +
          k + '»)');
      if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0)
        throw new Error('cities.js: доли_типов — доля > 0 (id ' + id + ')');
      shares.push({ id, share: v });
    }
    if (!shares.length)
      throw new Error('cities.js: доли_типов — непустой объект');
    return { min, shares };
  }

  /** 4-направленный BFS от entrance (своя копия логики
   *  reachableFrom src/dungeon.js — require dungeon.js невозможен;
   *  8-направление было бы ошибкой): blocked (постройки) = стены.
   *  @returns {boolean} все НЕ заблокированные FLOOR-клетки
   *  (включая exit) достижимы от entrance. */
  function reachOK(cells, W, H, entrance, blocked) {
    const seen = new Set();
    const q = [[entrance.x, entrance.y]];
    seen.add(entrance.x + ',' + entrance.y);
    while (q.length) {
      const cur = q.shift();
      const x = cur[0], y = cur[1];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const k = nx + ',' + ny;
        if (seen.has(k) || blocked.has(k)) continue;
        if (cells[ny * W + nx] !== CELL_FLOOR) continue;
        seen.add(k);
        q.push([nx, ny]);
      }
    }
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (cells[y * W + x] !== CELL_FLOOR) continue;
        const k = x + ',' + y;
        if (!blocked.has(k) && !seen.has(k)) return false;
      }
    return true;
  }

  /**
   * Содержимое города: внутренние постройки 1x1 на FLOOR-клетках.
   * Чистая функция (без DOM/totalXp): (позиция, wealth, cityRecord)
   * → данные для 000105/000107/000108/000109.
   * @param {object} layout createCityLayout(...) — НЕ мутируется
   * @param {number} cityX координата якоря на основной карте
   * @param {number} cityY координата якоря на основной карте
   * @param {object} cityRecord запись каталога города (000102):
   *        особые_параметры.мин_постройки / доли_типов (000053)
   * @param {number} wealth богатство якоря 0..3 (из tileAt, 000103)
   * @param {Set<string>|Array<string>} [occupied] 000148.05 (D10):
   *        ключи 'x,y' клеток, занятых ПОСТРОЙКАМИ ИГРОКА (built —
   *        builtOccupied): базовый набор ИХ НЕ ЗАНИМАЕТ. Нормализуется
   *        (D-.05c, паттерн canBuildAt: Set | массив ключей | absent;
   *        прочее → пустой Set — fail-open). НОВЫХ rng-вызовов НЕТ:
   *        фильтр ТОЛЬКО в spots-цикле — absent/пусто → БИТ-В-БИТ с
   *        5-арг. вызовом (GOLDEN_CONTENT); занятые spots СМЕЩАЮТ
   *        базовый состав (намеренно — осознанный ре-пин 000148.05).
   * @returns {{ buildings:{x:number, y:number, buildingId:number}[],
   *             seed:number }}
   *   seed — для стоков 000108 и сейва 000109. buildings.length <
   *   count — легитимно (GRACEFUL-стоп: валидных мест с сохранной
   *   достижимостью меньше, чем count; ВСЕ spots occupied → []).
   */
  function generateCityContents(layout, cityX, cityY, cityRecord, wealth,
                                occupied) {
    validateContentLayout(layout);
    validateWealth(wealth);
    const { min, shares } = validateCityRecord(cityRecord);

    const seed = cityContentSeed(cityX, cityY);
    const rng = mulberry32(seed);

    const W = layout.width, H = layout.height;
    const cells = layout.cells.slice(); // своя копия — layout не мутируем
    const entrance = layout.entrance, exit = layout.exit;

    // 000148.05 (D10/D-.05c): occupied — клетки ПОСТРОЕК ИГРОКА
    // (built): базовый набор их НЕ занимает. Нормализация — дословно
    // canBuildAt (Set | массив ключей | absent; прочее → пустой Set).
    // absent/пусто → spots идентичен 5-арг. вызову — БИТ-В-БИТ.
    const occSet = new Set(occupied instanceof Set
      ? occupied : (Array.isArray(occupied) ? occupied : []));
    // Кандидатные места: FLOOR минус entrance/exit минус occupied,
    // стабильный порядок y→x — считаем ОДИН раз (паттерн takeSpot).
    const spots = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (cells[y * W + x] !== CELL_FLOOR) continue;
        if ((x === entrance.x && y === entrance.y) ||
            (x === exit.x && y === exit.y)) continue;
        if (occSet.has(x + ',' + y)) continue; // 000148.05 (D10)
        spots.push([x, y]);
      }
    // Хутор (fp1): FLOOR только единый тайл (000177) → мест нет →
    // buildings: [] (задокументированное исключение, 000102/000104).
    if (!spots.length) return { buildings: [], seed };

    // Ассортимент: топ-(1+wealth) по (доля убыв, id растущ).
    const sorted = shares.slice().sort((a, b) =>
      b.share - a.share || a.id - b.id);
    const active = sorted.slice(0, 1 + wealth);
    const totalShare = active.reduce((s, t) => s + t.share, 0);

    // 1 rng-вызов: взвешенный выбор по долям активных типов
    // (кумулятивная сумма в порядке сортировки).
    const pickType = () => {
      const r = rng() * totalShare;
      let acc = 0;
      for (const t of active) {
        acc += t.share;
        if (r < acc) return t.id;
      }
      return active[active.length - 1].id; // r на границе суммы
    };

    // taken — базовые постройки ТОЛЬКО (000148.05: параметр occupied
    // — клетки ИГРОКА — в достижимости НЕ участвует: герой ходит по
    // постройкам, .03; имя — параметр не затеняется).
    const taken = new Set();
    const buildings = [];
    const count = min + wealth;
    const tavernInPool = shares.some((t) => t.id === TAV_ID);

    // Разместить на (x, y) не ломает ли достижимость: BFS,
    // постройки (taken ∪ {кандидат}) = стены.
    const placeable = (x, y) => {
      const blocked = new Set(taken);
      blocked.add(x + ',' + y);
      return reachOK(cells, W, H, entrance, blocked);
    };

    // takeSpot (src/dungeon.js): ≤200 случайных попыток из rng
    // (каждая с BFS-проверкой); после 200 провалов — детерминированный
    // y→x скан (БЕЗ rng); валидных мест нет → null.
    const takeSpot = () => {
      for (let i = 0; i < PLACE_ATTEMPTS; i++) {
        const s = spots[Math.floor(rng() * spots.length)];
        const k = s[0] + ',' + s[1];
        if (taken.has(k)) continue;
        if (!placeable(s[0], s[1])) continue;
        taken.add(k);
        return { x: s[0], y: s[1] };
      }
      for (const s of spots) {
        const k = s[0] + ',' + s[1];
        if (taken.has(k)) continue;
        if (!placeable(s[0], s[1])) continue;
        taken.add(k);
        return { x: s[0], y: s[1] };
      }
      return null;
    };

    for (let i = 0; i < count; i++) {
      // Порядок вызовов rng = GOLDEN-ПИН: постройка 0 — таверна
      // (тип без rng), остальные — тип (1 rng) → место (≤200 rng).
      const buildingId = (i === 0 && tavernInPool) ? TAV_ID : pickType();
      const spot = takeSpot();
      if (!spot) break; // достижимость > минимум — GRACEFUL-стоп
      buildings.push({ x: spot.x, y: spot.y, buildingId });
    }

    return { buildings, seed };
  }

  // ============================================================
  // Лавки города (задача 000108) — makeCityShop
  // ============================================================
  //
  // У городских лавок — СВОИ стоки, ключируемые по (город, клетка),
  // а не по npcId (ловушка-прецедент: мировой npcStocks в main.js —
  // «все тайлы храма солнца делят один сток»). Лавка = обёртка
  // СУЩЕСТВУЮЩего items.makeShop с офсетом координат города:
  // makeShop(cityX*256+tx, cityY*256+ty, map_index, wealth) —
  // seed/сток/ассортимент/универсам-w3 — семантика makeShop без
  // дублирования логики (spec/buildings.md «Содержимое города»: «лавки —
  // стоки makeShop с офсетом координат города (сток ключируется по
  // (город, клетке))»).
  // Решения закреплены в memory/000108-city-shops.md; golden-пины —
  // в tests/cities.test.js (раздел «Лавки города»).

  // Базис инъективной кодировки (город, клетка) → координаты
  // makeShop: x′ = cityX*256+tx, y′ = cityY*256+ty. 256 > любого
  // layout (4×footprint−1 ≤ 27, tx ≤ 25 < 256 — 000148.01): две
  // РАЗНЫЕ пары (город, клетка)
  // никогда не дают общие координаты — ВКЛЮЧАЯ СОСЕДНИЕ якоря
  // (наивная сумма cityX+tx дала бы коллизию (100,−40)+tx=1 и
  // (101,−40)+tx=0 — оба x′=101 → общий сток). GOLDEN-ПИН: смена
  // после мержа = смена ВСЕХ городских стоков — недопустима.
  const CITY_SHOP_CELL_BASE = 256;

  // Ленивый референс items.js (паттерн гарда perlin в этом модуле и
  // buildingsCatalogRef items.js, 000055/000060): в node —
  // require-модуль; в браузере — rootRef.Game в МОМЕНТ ВЫЗОВА
  // (function переживает Object.assign({}, Game, …) и любую
  // перегрузку). Load-time-гарда НЕТ: цепочки vm-песочниц
  // perlin→cities (000104/000106) обязаны грузиться без items.js —
  // гард срабатывает на первом вызове makeCityShop.
  function itemsRef() {
    if (items && typeof items.makeShop === 'function') return items;
    const g = rootRef && rootRef.Game;
    if (g && typeof g.makeShop === 'function') return g;
    throw new Error(
      'cities.js: не найден items.js (makeShop) — загрузите items.js ' +
      'до вызова cities.makeCityShop');
  }

  // Ленивый референс каталога построек (buildingId → запись).
  function buildingsRef() {
    if (buildings && typeof buildings.getBuilding === 'function')
      return buildings;
    const g = rootRef && rootRef.Game;
    if (g && typeof g.getBuilding === 'function') return g;
    throw new Error(
      'cities.js: не найден buildings.js (каталог) — загрузите ' +
      'buildings.js до вызова cities.makeCityShop');
  }

  /**
   * Лавка города: СВОЙ сток по (город, клетка) — обёртка
   * items.makeShop(cityX*256+tx, cityY*256+ty, map_index, wealth).
   * Чистая функция; каждый вызов — НОВЫЕ объекты (общего стока нет,
   * анти-прецедент npcStocks). buy/sell — существующие
   * buyItem/sellItem/buyPrice/sellPrice без изменений (shop-объект
   * влезает в playerUI.setShop как есть).
   * @param {number} cityX координата якоря города (любая, incl. < 0)
   * @param {number} cityY координата якоря города (любая, incl. < 0)
   * @param {number} tx клетка лавки в layout города, 0..255
   * @param {number} ty клетка лавки в layout города, 0..255
   * @param {number} buildingId id каталога (1..54) — запись каталога
   *        ОБЯЗАТЕЛЬНА (нет → throw — ошибка вызывающего)
   * @param {number} wealth богатство якоря 0..3 (tileAt, cities.js-
   *        конвенция: throw вне 0..3 — как generateCityContents)
   * @returns {null|{x:tx, y:ty, buildingType, wealth, stock, seed}}
   *   РОВНО 6 полей makeShop/setShop-формата, где x/y = ЛОКАЛЬНАЯ
   *   клетка (ключ состояния 000109 «tx,ty»), buildingType =
   *   особые_параметры.map_index (НЕ id каталога). null — не лавка:
   *   map_index нет (города 51..54) или «виды» нет (Арена 7 /
   *   Стрельбище 10 / Дом кузнеца 25).
   */
  function makeCityShop(cityX, cityY, tx, ty, buildingId, wealth) {
    for (const [n, v] of [['cityX', cityX], ['cityY', cityY],
        ['tx', tx], ['ty', ty], ['buildingId', buildingId]])
      if (!Number.isInteger(v))
        throw new Error('cities.js: ' + n + ' — целое (получено ' +
          String(v) + ')');
    if (tx < 0 || tx >= CITY_SHOP_CELL_BASE ||
        ty < 0 || ty >= CITY_SHOP_CELL_BASE)
      throw new Error('cities.js: tx/ty — [0,' + CITY_SHOP_CELL_BASE +
        ') (получено ' + tx + ',' + ty + ')');
    validateWealth(wealth);
    // Гард порядка: СНАЧАЛА items.js (без него лавку не собрать),
    // потом buildings.js (каталог).
    const I = itemsRef();
    const B = buildingsRef();
    const rec = B.getBuilding(buildingId);
    if (!rec)
      throw new Error('cities.js: buildingId ' + buildingId +
        ' — нет в каталоге построек (ошибка вызывающего)');
    const pp = rec.особые_параметры;
    if (!pp || typeof pp.map_index !== 'number')
      return null; // город (51..54) — лавок нет
    const shop = I.makeShop(cityX * CITY_SHOP_CELL_BASE + tx,
      cityY * CITY_SHOP_CELL_BASE + ty, pp.map_index, wealth);
    if (!shop)
      return null; // «виды» нет — не лавка (Арена/Стрельбище/кузнец)
    // x/y — ЛОКАЛЬНАЯ клетка города (ключ 000109 «tx,ty»), а не
    // смещённые координаты makeShop; stock/seed/buildingType/wealth —
    // из makeShop как есть (обёртка без дублирования логики).
    return { x: tx, y: ty, buildingType: shop.buildingType,
      wealth: shop.wealth, stock: shop.stock, seed: shop.seed };
  }

  // ============================================================
  // Состояние города для сейва (задача 000109) — ЧИСТЫЕ функции
  // ============================================================
  //
  // Раздел сейва `cities` (имя зафиксировано 000072; формат —
  // контракт 000108, НЕ переименовывать):
  //   { 'cx,cy': { lastVisitDay: N, stock: { 'tx,ty': {itemId: qty} } } }
  // 000148.05 (D6): + PERSISTENT-поля name (string, 1–32) / built
  // ([{x, y, buildingId, player: true}]) — живут ВНЕ окна респауна и
  // регенерации; пишутся в сейв ТОЛЬКО при наличии (absent = default,
  // неломко v1 — версия НЕ поднимается, 000031); окно (3 дня) обрезает
  // ТОЛЬКО transient-пару {lastVisitDay, stock} (D-.05i).
  // где 'cx,cy' — ЯКОРЬ города (buildingAnchor, НЕ тайл входа),
  // 'tx,ty' — локальная клетка лавки (x/y shop-объекта
  // makeCityShop), дни АБСОЛЮТНЫЕ (000031: fastForward при
  // восстановлении НЕ оповещает слушателей — restore обрезает сам).
  // Мир БЕСКОНЕЧЕН: ОБРЕЗКА просроченных (сток всё равно
  // перегенерируется при входе) и «будущих» (подделка) записей
  // обязательна И при сейве, И при восстановлении — без неё раздел
  // раздует localStorage до квоты (save() → false). day/respawnDays
  // — ПАРАМЕТРАМИ (конвенция 000072 restoreBuffs — дефолтов нет,
  // не дрейфуют от настроек). Функции — в доменном модуле (прецедент
  // 000072: npc.js/building-effects.js), НЕ в day.js (require-пин
  // tests/cities.test.js: perlin/items/buildings — не расширяется).

  // Ключи города/клетки — целые координаты (отрицательные возможны),
  // тот же формат, что у day.js COORD_RE: 'x,y'.
  const CITY_KEY_RE = /^-?\d+,-?\d+$/;

  /**
   * Валидация стока города: ЧИСТАЯ копия { 'tx,ty': {itemId: qty} }.
   * Ключ 'tx,ty' — целые координаты (ре CITY_KEY_RE); qty — целое
   * ≥ 0 (0 ЛЕГИТИМНО: buyItem доводит сток до 0, items.js);
   * мусорные записи — тихий отброс (000029); не-объект/массив → {};
   * вход не мутируется (новые объекты).
   * @returns {object}
   */
  function validateCityStock(stock) {
    const out = {};
    if (!stock || typeof stock !== 'object' || Array.isArray(stock))
      return out;
    for (const [k, items] of Object.entries(stock)) {
      if (typeof k !== 'string' || !CITY_KEY_RE.test(k)) continue;
      if (!items || typeof items !== 'object' || Array.isArray(items))
        continue;
      const cleaned = {};
      for (const [id, qty] of Object.entries(items)) {
        if (Number.isInteger(qty) && qty >= 0) cleaned[id] = qty;
      }
      // Клетка без валидных предметов — мусор (живой сток makeShop
      // всегда непуст).
      if (Object.keys(cleaned).length) out[k] = cleaned;
    }
    return out;
  }

  // 000148.05 (D7, D-.05g): ИМЯ ГОРОДА — единая точка правил: 1–32
  // символа, буквы кириллицы/латиницы (Ё/ё — да), цифры, пробелы;
  // ввод обрезается (trim); пустое после trim / >32 / посторонние
  // символы / не-строка → null (отказ). ЧИСТАЯ; load-time-чистая
  // (CITY_NAME_RE — константа без side-effect — 0 warn/error при
  // загрузке, cities.test.js:1155). Применение (record/ds.name/
  // flash/saveNow) — building-actions.js (D-.05g).
  const CITY_NAME_RE = /^[А-Яа-яЁёA-Za-z0-9 ]+$/;

  /**
   * @param {*} raw введённое/сохранённое имя
   * @returns {string|null} тримнутое имя (1–32, charset) | null
   */
  function validateCityName(raw) {
    if (typeof raw !== 'string') return null;
    const s = raw.trim();
    if (s.length < 1 || s.length > 32) return null;
    if (!CITY_NAME_RE.test(s)) return null;
    return s;
  }

  /**
   * Клетки built (ПОСТРОЙКИ ИГРОКА) записи города → Set<'x,y'>
   * (000148.05, D10): occupied для generateCityContents — ОДИН
   * источник для ОБЕИХ точек генерации (maybeEnterCity +
   * prepareCityState — рассинхрон = «фантомные» базовые на
   * player-клетках, §3.5 контракта).
   * null — record не-объект/массив ИЛИ built не-массив (вызывающий
   * → occupied absent = no-op, БИТ-В-БИТ с 5-арг.). Записи: не-
   * объект/массив/не-целые x/y/buildingId → skip; player !== true →
   * skip (в достижимых записях всегда true — placeBuilding /
   * validateCityState-нормализация); id ∉ каталогу → skip (fail-open
   * 000029; каталог ЛЕНИВ buildingsRef — только на вызове, load-time
   * чистота сохраняется). footprint w×h (B.buildingSize, default 1×1)
   * от ВЕРХНЕГО-ЛЕВОГО угла (D-C 000148.03). БЕЗ интерьерной
   * проверки (spots — interior FLOOR по построению; чужие ключи в
   * Set не влияют; интерьер-проверка — у merge-цикла main.js).
   * Пустой Set — легитимен (built: []).
   * @returns {Set<string>|null}
   */
  function builtOccupied(record) {
    if (!record || typeof record !== 'object' || Array.isArray(record))
      return null;
    const built = record.built;
    if (!Array.isArray(built)) return null;
    const out = new Set();
    const B = buildingsRef();
    for (const e of built) {
      if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
      if (!Number.isInteger(e.x) || !Number.isInteger(e.y) ||
          !Number.isInteger(e.buildingId)) continue;
      if (e.player !== true) continue;
      const b = B.getBuilding ? B.getBuilding(e.buildingId) : null;
      if (!b) continue; // id ∉ каталогу — fail-open (000029)
      const size = B.buildingSize
        ? B.buildingSize(b) : { width: 1, height: 1 };
      const { width, height } = size;
      for (let dy = 0; dy < height; dy++)
        for (let dx = 0; dx < width; dx++)
          out.add((e.x + dx) + ',' + (e.y + dy));
    }
    return out;
  }

  // Запись раздела — ДВЕ ПРИРОДЫ ПОЛЕЙ (000109 + 000148.05, D6):
  //  * TRANSIENT-пара {lastVisitDay, stock} — ВСЕ-ИЛИ-НИЧЕГО, ТЕКУЩИЕ
  //    правила 000109 БЕЗ ИЗМЕНЕНИЙ (D-.05i): lastVisitDay целое ≥ 1,
  //    last ≤ day, day − last < respawnDays («будущее»/истёкшее —
  //    формула dueForRespawn day.js:96) И stock — plain-объект (не
  //    null/массив) → пара пишется (stock — validateCityStock);
  //    ИНАЧЕ — пара ТИХО отбрасывается («тихий отброс» 000109, без
  //    warn).
  //  * PERSISTENT-поля (000148.05): name (validateCityName) / built
  //    (массив; по-входу — каноничная копия {x, y, buildingId,
  //    player: true}, D-.05o — player НЕ требуется от входа; id по
  //    каталогу НЕ проверяется — D-.05n, fail-open на стороне
  //    потребления builtOccupied/merge-цикл main.js) — живут ВНЕ окна
  //    респауна и регенерации. absent → поля нет (без warn, неломко
  //    v1); битое ПОЛЕ → console.warn (msg содержит «cities», 000029)
  //    + отброс ПОЛЯ, запись жива; мусорный ВХОД built → warn + отброс
  //    входа; пустой результат built → поле omitted (D-.05f).
  // Запись живёт, если ≥ 1 валидного поля; иначе → null (отброс).
  // Чистая копия; вход не мутируется.
  function validateCityState(rec, day, respawnDays) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
    const out = {};
    // TRANSIENT-пара (000109, all-or-nothing, тихий отброс).
    const last = rec.lastVisitDay;
    const stockOk = rec.stock !== null && typeof rec.stock === 'object'
      && !Array.isArray(rec.stock);
    if (Number.isInteger(last) && last >= 1 && last <= day
        && day - last < respawnDays && stockOk) {
      out.lastVisitDay = last;
      out.stock = validateCityStock(rec.stock);
    }
    // PERSISTENT: name (битое ПОЛЕ → warn + отброс ПОЛЯ, 000029).
    if (rec.name !== undefined) {
      const name = validateCityName(rec.name);
      if (name !== null) out.name = name;
      else console.warn('cities.js: города — name некорректно (1–32: '
        + 'буквы, цифры, пробелы) — поле отброшено (000148.05): '
        + JSON.stringify(rec.name));
    }
    // PERSISTENT: built (не-массив → warn + отброс ПОЛЯ; мусорный
    // вход → warn + отброс входа; пустой результат → omitted).
    if (rec.built !== undefined) {
      if (!Array.isArray(rec.built)) {
        console.warn('cities.js: города — built не массив — поле '
          + 'отброшено (000148.05): ' + JSON.stringify(rec.built));
      } else {
        const built = [];
        for (const e of rec.built) {
          if (!e || typeof e !== 'object' || Array.isArray(e) ||
              !Number.isInteger(e.x) || !Number.isInteger(e.y) ||
              !Number.isInteger(e.buildingId)) {
            console.warn('cities.js: города — мусорная запись built — '
              + 'вход отброшен (000148.05): ' + JSON.stringify(e));
            continue;
          }
          built.push({ x: e.x, y: e.y, buildingId: e.buildingId,
            player: true });
        }
        if (built.length) out.built = built;
      }
    }
    return Object.keys(out).length ? out : null;
  }

  /**
   * Живое состояние (Map) или plain-объект → JSON-объект раздела
   * (копии; НЕ мутирует вход). Принимает Map (main.js) и
   * plain-объект (roundtrip-тесты); не-объект/массив → {}.
   * ОБРЕЗКА: истёкшие (day − lastVisitDay >= respawnDays) и
   * «будущие» (lastVisitDay > day) — отброс; невалидные записи —
   * тихий отброс (000029).
   * @param {Map|object} cityStates
   * @param {number} day текущий день мира
   * @param {number} respawnDays city_respawn_days
   * @returns {object}
   */
  function serializeCityStates(cityStates, day, respawnDays) {
    const out = {};
    if (!cityStates || typeof cityStates !== 'object' ||
        Array.isArray(cityStates)) return out;
    const entries = (typeof cityStates.entries === 'function')
      ? cityStates.entries()
      : Object.entries(cityStates);
    for (const [k, rec] of entries) {
      if (typeof k !== 'string' || !CITY_KEY_RE.test(k)) continue;
      const rec2 = validateCityState(rec, day, respawnDays);
      if (rec2) out[k] = rec2;
    }
    return out;
  }

  /**
   * JSON-объект раздела → Map (паттерн restoreDayMap/
   * restoreTeleports/restoreBuildingQuests, 000072). Не-объект/
   * массив → пустой Map (тихо, 000029); невалидные записи и ОБРЕЗКА
   * — те же, что serialize: fastForward без слушателей (000031) —
   * onDay-очистка не пройдёт, restore сам отбрасывает «будущее» и
   * «истёкшее». Вход не мутируется (копии).
   * @param {object} saved
   * @param {number} day текущий день мира
   * @param {number} respawnDays city_respawn_days
   * @returns {Map<string, {lastVisitDay:number, stock:object}>}
   */
  function restoreCityStates(saved, day, respawnDays) {
    const out = new Map();
    if (!saved || typeof saved !== 'object' || Array.isArray(saved))
      return out;
    for (const [k, rec] of Object.entries(saved)) {
      if (typeof k !== 'string' || !CITY_KEY_RE.test(k)) continue;
      const rec2 = validateCityState(rec, day, respawnDays);
      if (rec2) out.set(k, rec2);
    }
    return out;
  }

  // ============================================================
  // Строительство в городе: ядро (задача 000148.03) — ЧИСТЫЕ функции
  // ============================================================
  //
  // Решения зафиксированы в memory/000148.03-city-building-core.md:
  //  * набор D3 — ДАННЫЕ каталога (000053): map_index ИЛИ
  //    размещение.слот И .стройка.золото int>0; исключения (31-35
  //    пещеры — dungeon-система, 41 телепорт-круг — пары на карте
  //    мира, 47 лагерь — мировая механика, 50 мост — резерв 000064,
  //    51-54 города — само-вложение) — ОТСУТСТВИЕ поля .стройка;
  //  * cap D4 — ВКЛЮЧАЮЩИЙ: занятые интерьерные клетки ВСЕМИ
  //    постройками ≤ floor(интерьер/2) (деревня 6×6: интерьер 16,
  //    потолок 8 — 8-я клетка ОК, 9-я отказ);
  //  * порядок проверок canBuildAt: space → cap → reach (reachOK —
  //    СУЩЕСТВУЮЩИЙ, blocked = footprint НОВОЙ постройки ТОЛЬКО:
  //    городские постройки НЕ блокируют движение — герой ходит ПО
  //    ним для [E], locations.js cityMove);
  //  * built — ANCHOR-записи {x, y, buildingId, player: true} в
  //    записи cityStates (per-cell view — ds.cityContents.buildings,
  //    000107/000148.02); placeBuilding/demolishCity — ЧИСТЫЕ
  //    (копии, вход не мутируется);
  //  * разборка — 30% floor золота ЦЕЛОЧИСЛЕННО: floor((золото×3)/10)
  //    (10 → 3; НЕ золото×0.3 — float-края).
  // НОЛЬ новых require (require-пин tests/cities.test.js: строго
  // perlin+items+buildings): каталог — лениво через buildingsRef().
  // НОЛЬ вызовов RNG (D10): размещение — ввод игрока;
  // generateCityContents/createCityLayout/cityLayoutSeed НЕ ТРОГАЮТСЯ.

  /**
   * Набор buildable-типов (D3): id из каталога в порядке BUILDINGS
   * (id-порядок). Правило ДАННЫХ, без хардкода исключений: запись
   * входит ⇔ (особые_параметры.map_index != null) ИЛИ (особые_
   * параметры.размещение — объект с числовым .слот) И особые_
   * параметры.стройка.золото — целое > 0. Новые типы — поле .стройка
   * в JSON + regen зеркала (код не меняется).
   * @returns {number[]}
   */
  function buildableBuildingIds() {
    const B = buildingsRef();
    const out = [];
    for (const b of B.BUILDINGS) {
      if (!b || !Number.isInteger(b.id)) continue;
      const pp = b.особые_параметры;
      if (!pp || typeof pp !== 'object' || Array.isArray(pp)) continue;
      const hasMapIndex = pp.map_index != null;
      const razm = pp.размещение;
      const hasSlot = razm && typeof razm === 'object' &&
        !Array.isArray(razm) && Number.isFinite(razm.слот);
      if (!hasMapIndex && !hasSlot) continue;
      const s = pp.стройка;
      const gold = s && s.золото;
      if (!(Number.isInteger(gold) && gold > 0)) continue; // исключение
      out.push(b.id);
    }
    return out;
  }

  /**
   * Цена постройки (каталожное ДАННОЕ, 000053): .стройка.золото +
   * .стройка.исходники (000148.04: цена — золото + ингредиенты).
   * @returns {{ золото: number, исходники: {предмет: string,
   *   количество: number}[] }} — .исходники — НОРМАЛИЗОВАННАЯ КОПИЯ
   *   каталожной (не-массив → []; запись принимается, если предмет —
   *   непустая строка И количество — целое ≥ 1; мусор — пропуск,
   *   fail-open 000029; ДУБЛИ одного предмета — агрегация по
   *   количеству, порядок первого появления — ревью 000148.04:
   *   атомарность проверки/списания; на уровне данных дубли
   *   запрещает пин уникальности тест R13). Нет .стройки /
   *   золото не int>0 →
   *   { золото: 0, исходники: [] } (форма стабильна для ВСЕХ
   *   потребителей — строки меню/flash/разборка, R12 000148.04).
   *   id вне каталога — throw (ошибка вызывающего: меню отдаёт только
   *   buildable id).
   */
  function buildCost(id) {
    if (!Number.isInteger(id))
      throw new Error('cities.js: buildCost — id — целое (получено ' +
        String(id) + ')');
    const B = buildingsRef();
    const b = B.getBuilding ? B.getBuilding(id) : null;
    if (!b)
      throw new Error('cities.js: buildCost — id ' + id +
        ' — нет в каталоге построек (ошибка вызывающего)');
    const pp = b.особые_параметры;
    const s = pp && typeof pp === 'object' ? pp.стройка : null;
    const gold = s && s.золото;
    if (!(Number.isInteger(gold) && gold > 0))
      return { золото: 0, исходники: [] };
    const agg = new Map();
    const arr = s.исходники;
    if (Array.isArray(arr)) {
      for (const e of arr) {
        if (e && typeof e === 'object' && !Array.isArray(e) &&
            typeof e.предмет === 'string' && e.предмет.trim() !== '' &&
            Number.isInteger(e.количество) && e.количество > 0) {
          const id2 = e.предмет;
          agg.set(id2, (agg.has(id2) ? agg.get(id2) : 0) +
            e.количество);
        }
      }
    }
    const src = [];
    for (const [предмет, количество] of agg)
      src.push({ предмет, количество });
    return { золото: gold, исходники: src };
  }

  /**
   * Клетки footprint (ВЕРХНИЙ-ЛЕВЫЙ угол — (x, y), row-major — порядок
   * tiles placeBuilding buildings.js:823-824).
   * @returns {[number, number][]} — id ∉ каталогу / не-целые — throw.
   */
  function buildingCells(buildingId, x, y) {
    if (!Number.isInteger(buildingId) || !Number.isInteger(x) ||
        !Number.isInteger(y)) {
      throw new Error('cities.js: buildingCells — buildingId/x/y — ' +
        'целые (получено ' + buildingId + ',' + x + ',' + y + ')');
    }
    const B = buildingsRef();
    const b = B.getBuilding ? B.getBuilding(buildingId) : null;
    if (!b)
      throw new Error('cities.js: buildingCells — id ' + buildingId +
        ' — нет в каталоге построек (ошибка вызывающего)');
    const size = B.buildingSize
      ? B.buildingSize(b) : { width: 1, height: 1 };
    const { width, height } = size;
    const out = [];
    for (let dy = 0; dy < height; dy++)
      for (let dx = 0; dx < width; dx++) out.push([x + dx, y + dy]);
    return out;
  }

  /**
   * Занятые клетки города (Set 'x,y'): объединение клеток всех записей
   * (базовые 000106 — 1×1; per-cell записи игрока 000148.03 — каждая
   * клетка footprint своей записью). Записи без целых координат или
   * с buildingId ∉ каталогу — пропускаются (fail-open, 000029).
   * @returns {Set<string>}
   */
  function cityOccupied(buildings) {
    const out = new Set();
    if (!Array.isArray(buildings)) return out;
    const B = buildingsRef();
    for (const p of buildings) {
      if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
      if (!Number.isInteger(p.x) || !Number.isInteger(p.y) ||
          !Number.isInteger(p.buildingId)) continue;
      const b = B.getBuilding ? B.getBuilding(p.buildingId) : null;
      if (!b) continue; // запись без каталожной buildingId — мимо
      out.add(p.x + ',' + p.y);
    }
    return out;
  }

  /**
   * Допустимо ли поставить постройку id ANCHOR (верхний-левый угол) в
   * (anchor.x, anchor.y). Порядок проверок: space → cap → reach.
   *  (1) space — все w×h клеток footprint в интерьерных FLOOR-клетках
   *      [1, W−2]×[1, H−2] и не в occupied. ДВЕРЬ (периметр, y=H−1)
   *      интерьером НЕ ЯВЛЯЕТСЯ — заблокировать её нельзя (защитный
   *      диапазон ниже);
   *  (2) cap D4 — занятое интерьерное + w·h ≤ floor(интерьер/2)
   *      ВКЛЮЧАЮЩИЙ (потолок достигнут — допустимо);
   *  (3) reach — reachOK(cells, W, H, entrance, blocked=footprint
   *      НОВОЙ постройки): ВСЕ непрохожие FLOOR (улицы + клетки всех
   *      существующих построек + дверь) достижимы от двери. Занятые
   *      клетки ЧУЖИХ построек НЕ блокируют (герой ходит по
   *      постройкам, cityMove).
   * @param {object} layout createCityLayout(...) (width/height/
   *        cells/entrance; форма — throw, ошибка вызывающего)
   * @param {{x: number, y: number}} anchor верхний-левый угол
   * @param {number} id id каталога (∉ — throw)
   * @param {Set<string>|Array} occupied cityOccupied(...) | массив
   *        ключей (нормализуется в Set)
   * @returns {{ok: true}|{ok: false, reason: 'space'|'cap'|'reach'}}
   */
  function canBuildAt(layout, anchor, buildingId, occupied) {
    if (!layout || typeof layout !== 'object')
      throw new Error('cities.js: canBuildAt — layout — объект ' +
        'createCityLayout');
    if (!Number.isInteger(layout.width) || layout.width < 1 ||
        !Number.isInteger(layout.height) || layout.height < 1)
      throw new Error('cities.js: canBuildAt — layout.width/height — ' +
        'целые ≥ 1');
    if (!Array.isArray(layout.cells) ||
        layout.cells.length !== layout.width * layout.height)
      throw new Error('cities.js: canBuildAt — layout.cells — массив ' +
        'width×height');
    if (layout.entrance === null || typeof layout.entrance !== 'object' ||
        !Number.isInteger(layout.entrance.x) ||
        !Number.isInteger(layout.entrance.y) ||
        layout.entrance.x < 0 ||
        layout.entrance.x >= layout.width ||
        layout.entrance.y < 0 ||
        layout.entrance.y >= layout.height)
      throw new Error('cities.js: canBuildAt — layout.entrance — {x, y} ' +
        'в пределах layout');
    if (!anchor || typeof anchor !== 'object' ||
        !Number.isInteger(anchor.x) || !Number.isInteger(anchor.y))
      throw new Error('cities.js: canBuildAt — anchor — {x, y} целые');
    const B = buildingsRef();
    const b = B.getBuilding ? B.getBuilding(buildingId) : null;
    if (!b)
      throw new Error('cities.js: canBuildAt — id ' + buildingId +
        ' — нет в каталоге построек (ошибка вызывающего)');
    const { width: w, height: h } = B.buildingSize
      ? B.buildingSize(b) : { width: 1, height: 1 };
    const W = layout.width, H = layout.height;
    const cells = layout.cells;
    const occ = new Set(occupied instanceof Set
      ? occupied : (Array.isArray(occupied) ? occupied : []));
    // (1) space: footprint ⊆ интерьерным FLOOR, без перекрытий.
    // Дверь — периметр (y = H−1) — НЕ интерьер: диапазон [1, W−2]×
    // [1, H−2] ниже её исключает автоматически (дверь «заблокировать»
    // постройкой невозможно; достижимость двери проверяет reach).
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const cx = anchor.x + dx, cy = anchor.y + dy;
        if (cx < 1 || cx >= W - 1 || cy < 1 || cy >= H - 1)
          return { ok: false, reason: 'space' };
        if (cells[cy * W + cx] !== CELL_FLOOR)
          return { ok: false, reason: 'space' };
        if (occ.has(cx + ',' + cy))
          return { ok: false, reason: 'space' };
      }
    // (2) cap D4: занятое интерьерное + w·h ≤ floor(интерьер/2).
    let interiorCount = 0, occInterior = 0;
    for (let y = 1; y < H - 1; y++)
      for (let x = 1; x < W - 1; x++)
        if (cells[y * W + x] === CELL_FLOOR) interiorCount++;
    for (const k of occ) {
      const i = k.indexOf(',');
      const ox = Number(k.slice(0, i)), oy = Number(k.slice(i + 1));
      if (!Number.isInteger(ox) || !Number.isInteger(oy)) continue;
      if (ox < 1 || ox >= W - 1 || oy < 1 || oy >= H - 1) continue;
      if (cells[oy * W + ox] === CELL_FLOOR) occInterior++;
    }
    if (occInterior + w * h > Math.floor(interiorCount / 2))
      return { ok: false, reason: 'cap' };
    // (3) reach: footprint НОВОЙ постройки — стены; всё остальное
    // FLOOR (включая дверь) достижимо от двери.
    const blocked = new Set();
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++)
        blocked.add((anchor.x + dx) + ',' + (anchor.y + dy));
    if (!reachOK(cells, W, H, layout.entrance, blocked))
      return { ok: false, reason: 'reach' };
    return { ok: true };
  }

  /**
   * Разместить постройку в записи города: НОВЫЙ record (копия, вход не
   * мутируется) + ANCHOR-запись {x, y, buildingId, player: true} в
   * built. ГЕОМЕТРИИ НЕТ (зона canBuildAt — caller).
   * НЕ ПУТАТЬ с placeBuilding src/buildings.js (МИРОВОЙ пайплайн карты
   * мира: sizeChain/validateSize/isFree) — другой модуль, другое имя.
   * @returns {object} новый record; record не-объект / не-целые x/y /
   *   id ∉ каталогу — throw 'cities.js: …' (ошибка вызывающего).
   */
  function placeBuilding(record, x, y, buildingId) {
    if (!record || typeof record !== 'object' || Array.isArray(record))
      throw new Error('cities.js: placeBuilding — record — запись ' +
        'города (объект)');
    if (!Number.isInteger(x) || !Number.isInteger(y))
      throw new Error('cities.js: placeBuilding — x/y — целые ' +
        '(получено ' + x + ',' + y + ')');
    if (!Number.isInteger(buildingId))
      throw new Error('cities.js: placeBuilding — buildingId — целое');
    const B = buildingsRef();
    const b = B.getBuilding ? B.getBuilding(buildingId) : null;
    if (!b)
      throw new Error('cities.js: placeBuilding — id ' + buildingId +
        ' — нет в каталоге построек (ошибка вызывающего)');
    const built = Array.isArray(record.built) ? record.built.slice() : [];
    built.push({ x, y, buildingId, player: true });
    return Object.assign({}, record, { built });
  }

  /**
   * Разобрать постройку ИГРОКА (built, player === true), чей footprint
   * накрывает (x, y) (поиск С КОНЦА массива — верхняя постройка).
   * @returns {null|{record, buildingId, x, y, refund, refundItems}} —
   *   record — НОВЫЙ record без удалённой записи; x/y — АНКЕР удалённой
   *   записи; refund = demolishReturn(buildCost(buildingId).золото);
   *   refundItems = refundItemsFor(buildingId) (000148.04: возврат
   *   30% floor ПРЕДМЕТОВ, каталожные данные; при отказе (null)
   *   результата нет вовсе).
   *   null — не-player (базовая: затрачено = 0, не разбирается) / без
   *   built / (x, y) не покрыт (без броска — отказ UI).
   */
  function demolishCity(record, x, y) {
    if (!record || typeof record !== 'object' || Array.isArray(record))
      return null;
    if (!Number.isInteger(x) || !Number.isInteger(y)) return null;
    const built = record.built;
    if (!Array.isArray(built)) return null;
    const B = buildingsRef();
    for (let i = built.length - 1; i >= 0; i--) {
      const e = built[i];
      if (!e || typeof e !== 'object' || e.player !== true) continue;
      if (!Number.isInteger(e.x) || !Number.isInteger(e.y) ||
          !Number.isInteger(e.buildingId)) continue;
      const b = B.getBuilding ? B.getBuilding(e.buildingId) : null;
      if (!b) continue; // мусор — fail-open (000029)
      const { width, height } = B.buildingSize
        ? B.buildingSize(b) : { width: 1, height: 1 };
      let covers = false;
      for (let dy = 0; dy < height && !covers; dy++)
        for (let dx = 0; dx < width; dx++)
          if (e.x + dx === x && e.y + dy === y) { covers = true; break; }
      if (!covers) continue;
      return {
        record: Object.assign({}, record,
          { built: built.filter((_, j) => j !== i) }),
        buildingId: e.buildingId,
        x: e.x,
        y: e.y,
        refund: demolishReturn(buildCost(e.buildingId).золото),
        // 000148.04: возврат 30% floor ПРЕДМЕТОВ (каталог .стройка.
        // исходники; e.buildingId проверен каталогом выше — throw
        // недостижим).
        refundItems: refundItemsFor(e.buildingId),
      };
    }
    return null;
  }

  /**
   * Возврат при разборке: 30% floor золота, ЦЕЛОЧИСЛЕННАЯ арифметика
   * floor((золото × 3) / 10) (10 → 3, 30 → 9, 35 → 10, 400 → 120;
   * НЕ золото × 0.3 — float-края). Предметы — 000148.04.
   * @returns {number} — не-число — throw (ошибка вызывающего).
   */
  function demolishReturn(gold) {
    if (typeof gold !== 'number' || !Number.isFinite(gold))
      throw new Error('cities.js: demolishReturn — число (получено ' +
        String(gold) + ')');
    return Math.floor((gold * 3) / 10);
  }

  /**
   * Возврат при разборке: 30% floor ОДНОГО КОЛИЧЕСТВА ПРЕДМЕТА,
   * ЦЕЛОЧИСЛЕННАЯ арифметика floor((qty × 3) / 10) (1 → 0, 2 → 0,
   * 4 → 1, 8 → 2, 10 → 3; НЕ qty × 0.3 — float-края). Зеркало
   * demolishReturn (золото) на предметы (000148.04, TDD-фиксации
   * 1→0, 2→0, 4→1, 10→3).
   * @returns {number} — не-число — throw (ошибка вызывающего).
   */
  function demolishItemReturn(qty) {
    if (typeof qty !== 'number' || !Number.isFinite(qty))
      throw new Error('cities.js: demolishItemReturn — число (получено ' +
        String(qty) + ')');
    return Math.floor((qty * 3) / 10);
  }

  /**
   * Каталожный список возврата ПРЕДМЕТОВ при разборке постройки
   * (000148.04): floor 30% (demolishItemReturn) по КАЖДОМУ исходнику
   * .стройка, нуль-количества ОТБРОШЕНЫ (addItem(qty<1) — INVALID,
   * items.js; строки меню/flash не рендерят «×0»). Единая точка
   * логики для demolishCity и строки «Разобрать».
   * @returns {{предмет: string, количество: number}[]} — id ∉
   *   каталогу — throw (через buildCost; ошибка вызывающего).
   */
  function refundItemsFor(buildingId) {
    const src = buildCost(buildingId).исходники;
    const out = [];
    for (const e of src) {
      const q = demolishItemReturn(e.количество);
      if (q > 0) out.push({ предмет: e.предмет, количество: q });
    }
    return out;
  }

  return {
    CELL_WALL, CELL_FLOOR,
    CITY_LAYOUT_CONST,
    cityLayoutSize, cityLayoutSeed,
    createCityLayout,
    CITY_CONTENT_CONST,
    generateCityContents,
    CITY_SHOP_CELL_BASE,
    makeCityShop,
    validateCityStock,
    serializeCityStates,
    restoreCityStates,
    buildableBuildingIds,
    buildCost,
    buildingCells,
    cityOccupied,
    canBuildAt,
    placeBuilding,
    demolishCity,
    demolishReturn,
    demolishItemReturn,
    refundItemsFor,
    // 000148.05: имя города (правила D7) + occupied для перегенерации.
    validateCityName,
    builtOccupied,
  };
});
