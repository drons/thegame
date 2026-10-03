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

  /** Внутренний размер layout: footprint × 2 УНИФОРМНО (1→2x2, 2→4x4,
   *  5→10x10, 7→14x14; хутор fp1 — вырожденный 2x2). */
  function cityLayoutSize(footprint) {
    if (!Number.isInteger(footprint) || footprint < 1) {
      throw new Error(
        'cities.js: footprint — целое ≥ 1 (получено ' + String(footprint) + ')');
    }
    return footprint * 2;
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
   * entrance — южный периметр (y = height−1), exit — северный
   * (y = 0); x — из rng(mulberry32(seed)) по колоннам 1..width−2
   * (порядок вызовов rng: СНАЧАЛА entrance.x, затем exit.x —
   * golden-пин; при width=2 оба x=0 — клетки смежные, BFS
   * проходит). Layout СТАТИЧЕН: один якорь → один layout навсегда.
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
    // Колонны входа/выхода: 1..W−2 (при W=2 — 0; клетки (0,H−1) и
    // (0,0) смежны по вертикали через край, BFS проходит).
    const col = () => (W >= 3 ? 1 + Math.floor(rng() * (W - 2)) : 0);
    const entrance = { x: col(), y: H - 1 };
    const exit = { x: col(), y: 0 };
    cells[entrance.y * W + entrance.x] = CELL_FLOOR;
    cells[exit.y * W + exit.x] = CELL_FLOOR;
    return { width: W, height: H, cells, entrance, exit, seed,
      kind: 'city' };
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
  //  * хутор (fp1): FLOOR только entrance/exit → buildings: []
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
   * @returns {{ buildings:{x:number, y:number, buildingId:number}[],
   *             seed:number }}
   *   seed — для стоков 000108 и сейва 000109. buildings.length <
   *   count — легитимно (GRACEFUL-стоп: валидных мест с сохранной
   *   достижимостью меньше, чем count).
   */
  function generateCityContents(layout, cityX, cityY, cityRecord, wealth) {
    validateContentLayout(layout);
    validateWealth(wealth);
    const { min, shares } = validateCityRecord(cityRecord);

    const seed = cityContentSeed(cityX, cityY);
    const rng = mulberry32(seed);

    const W = layout.width, H = layout.height;
    const cells = layout.cells.slice(); // своя копия — layout не мутируем
    const entrance = layout.entrance, exit = layout.exit;

    // Кандидатные места: FLOOR минус entrance/exit, стабильный
    // порядок y→x — считаем ОДИН раз (паттерн takeSpot).
    const spots = [];
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (cells[y * W + x] !== CELL_FLOOR) continue;
        if ((x === entrance.x && y === entrance.y) ||
            (x === exit.x && y === exit.y)) continue;
        spots.push([x, y]);
      }
    // Хутор (fp1): FLOOR только entrance/exit → мест нет →
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

    const occupied = new Set();
    const buildings = [];
    const count = min + wealth;
    const tavernInPool = shares.some((t) => t.id === TAV_ID);

    // Разместить на (x, y) не ломает ли достижимость: BFS,
    // постройки (occupied ∪ {кандидат}) = стены.
    const placeable = (x, y) => {
      const blocked = new Set(occupied);
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
        if (occupied.has(k)) continue;
        if (!placeable(s[0], s[1])) continue;
        occupied.add(k);
        return { x: s[0], y: s[1] };
      }
      for (const s of spots) {
        const k = s[0] + ',' + s[1];
        if (occupied.has(k)) continue;
        if (!placeable(s[0], s[1])) continue;
        occupied.add(k);
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
  // дублирования логики (SPEC.md: «лавки — стоки makeShop с офсетом
  // координат города (сток ключируется по (город, клетке))»).
  // Решения закреплены в memory/000108-city-shops.md; golden-пины —
  // в tests/cities.test.js (раздел «Лавки города»).

  // Базис инъективной кодировки (город, клетка) → координаты
  // makeShop: x′ = cityX*256+tx, y′ = cityY*256+ty. 256 > любого
  // layout (2×footprint−1 ≤ 14): две РАЗНЫЕ пары (город, клетка)
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

  // Запись раздела: { lastVisitDay: int ≥ 1, stock: plain-объект } в
  // окне респауна: lastVisitDay ≤ day И day − lastVisitDay <
  // respawnDays («будущее»/истёкшее — отброс, формула — dueForRespawn
  // day.js:96). Чистая копия; null — запись отбрасывается.
  function validateCityState(rec, day, respawnDays) {
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) return null;
    const last = rec.lastVisitDay;
    if (!Number.isInteger(last) || last < 1) return null;
    if (last > day || day - last >= respawnDays) return null;
    if (rec.stock === null || typeof rec.stock !== 'object' ||
        Array.isArray(rec.stock)) return null;
    return { lastVisitDay: last, stock: validateCityStock(rec.stock) };
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
  };
});
