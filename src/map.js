// Генерация тайлов карты мира (SPEC.md, раздел «Карта мира»).
//
// Состояние тайла полностью определяется:
//   1) несколькими октавами шума Перлина (высота, влажность, фичи) с
//      фиксированным глобальным сидом;
//   2) одним пикселем из assets/map.png (1 пиксель = 1 тайл, выборка с
//      повтором — карта бесконечна).
//
// Все функции чистые: одинаковые координаты всегда дают одинаковый тайл.
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./perlin.js'), require('./buildings.js'));
  } else {
    root.Game = Object.assign({}, root.Game,
      factory(typeof root.Game === 'object' ? root.Game : {}, null, root));
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function (perlin, catalog, root) {

  const createPerlin2D = perlin.createPerlin2D;
  const hash2 = perlin.hash2;

  // Каталог построек (src/buildings.js) для footprint'а (задача 000026).
  // В node приходит через require; в браузере buildings.js грузится ПОСЛЕ
  // map.js (index.html), поэтому доступ ЛЕНИВЫЙ — из Game в момент
  // вызова tileAt (все скрипты загружены до старта main.js).
  function catalogRef() {
    if (catalog) return catalog;
    const g = root && root.Game;
    return g && typeof g.placeBuilding === 'function' ? g : null;
  }

  // --- Производные данные «картовых» построек (задача 000055) ---
  //
  // Число «картовых» индексов, их имена и максимальный footprint
  // выводятся из каталога (assets/buildings: записи с числовым
  // особых_параметры.map_index) ЛЕНИВО — в браузере buildings.js
  // грузится ПОСЛЕ map.js (index.html), а vm-песочницы (combat-ui)
  // грузят map.js БЕЗ buildings.js: на момент загрузки каталога ещё
  // может не быть. Фолбэк без каталога — ровно значения генерации
  // до 000055 (13 типов, окно 3×3), иначе карта в песочнице уедет.
  //
  // ВАЖНО: функции, а НЕ константы на момент загрузки и не getter'ы —
  // между map.js и buildings.js в index.html грузятся player/day/items,
  // каждый делает Object.assign({}, Game, …): значение getter'а застыло
  // бы на момент копирования (до каталога), а функция переживает
  // копирование по ссылке и разрешает каталог в момент вызова.
  //
  // Кэш ПУСТОГО вывода запрещён: если каталог ещё не подхвачен,
  // результат НЕ кэшируется (иначе первый вызов «до загрузки»
  // закэшировал бы фолбэк/пустоту навсегда).
  const FALLBACK_BUILDING_COUNT = 13;
  const FALLBACK_BUILD_MAX_W = 3;
  const FALLBACK_BUILD_MAX_H = 3;

  let _buildingDerived = null;

  // Вывод из каталога или null (каталог ещё не загружен — не кэшируем).
  function buildingDerived() {
    if (_buildingDerived) return _buildingDerived;
    const c = catalogRef();
    if (!c || !Array.isArray(c.BUILDINGS)) return null;
    const entries = [];
    let maxW = 1;
    let maxH = 1;
    for (const b of c.BUILDINGS) {
      const p = b && b.особые_параметры;
      const mi = p && p.map_index;
      if (typeof mi !== 'number') continue;
      entries[mi] = b;
      const s = typeof c.buildingSize === 'function'
        ? c.buildingSize(b) : { width: 1, height: 1 };
      maxW = Math.max(maxW, s.width);
      maxH = Math.max(maxH, s.height);
    }
    _buildingDerived = {
      count: entries.length,
      // Имена — данные каталога, каталожный регистр (название_карты;
      // фолбэк — название). Обобщённые имена (idx 9/11/12) заведены в
      // JSON, не в коде.
      names: entries.map(
        (b) => (b.особые_параметры.название_карты || b.название)),
      maxW,
      maxH,
    };
    return _buildingDerived;
  }

  /** Число «картовых» индексов (13, пока каталог не подхвачен — фолбэк). */
  function buildingCount() {
    const d = buildingDerived();
    return d ? d.count : FALLBACK_BUILDING_COUNT;
  }

  /**
   * Имена «картовых» индексов (каталожный регистр, порядок по
   * map_index). Без каталога — пустой массив (не кэшируется).
   * @returns {string[]}
   */
  function buildingNames() {
    const d = buildingDerived();
    return d ? d.names : [];
  }

  /** Максимальная ширина «картового» footprint'а (сейчас 3). */
  function buildMaxW() {
    const d = buildingDerived();
    return d ? d.maxW : FALLBACK_BUILD_MAX_W;
  }

  /** Максимальная высота «картового» footprint'a (сейчас 3). */
  function buildMaxH() {
    const d = buildingDerived();
    return d ? d.maxH : FALLBACK_BUILD_MAX_H;
  }

  /**
   * UI-вывод имени «картового» индекса: данные каталога + конвенция
   * UI «первая буква в нижнем регистре» (тесты/buildings.test.js).
   * Не whole-string lowercase («Дом NPC» → «дом NPC»). Неизвестный
   * индекс — пустая строка.
   * @param {number} index 0..buildingCount()-1
   * @returns {string}
   */
  function buildingNameUi(index) {
    const names = buildingNames();
    const name = Number.isInteger(index) ? names[index] : undefined;
    if (typeof name !== 'string' || name === '') return '';
    return name.charAt(0).toLowerCase() + name.slice(1);
  }

  // Фиксированный глобальный сид (SPEC.md). Смена сида или assets/map.png
  // генерирует полностью другую карту.
  const GLOBAL_SEED = 0xf10c7a26;

  const TERRAIN = {
    DEEP_WATER: 0,
    WATER: 1,
    SAND: 2,
    GRASS: 3,
    FOREST: 4,
    HILL: 5,
    MOUNTAIN: 6,
    SWAMP: 7,
  };

  const TERRAIN_NAMES = {
    [TERRAIN.DEEP_WATER]: 'глубокая вода',
    [TERRAIN.WATER]: 'вода',
    [TERRAIN.SAND]: 'песок',
    [TERRAIN.GRASS]: 'трава',
    [TERRAIN.FOREST]: 'лес',
    [TERRAIN.HILL]: 'холмы',
    [TERRAIN.MOUNTAIN]: 'горы',
    [TERRAIN.SWAMP]: 'болото',
  };

  // Проходимые тайлы (пока что): вода и горы непроходимы.
  const PASSABLE = new Set([
    TERRAIN.SAND, TERRAIN.GRASS, TERRAIN.FOREST, TERRAIN.HILL, TERRAIN.SWAMP,
  ]);

  // Типы построек (подмножество из SPEC.md, раздел «Постройки»).
  const BUILDING_TYPES = {
    NONE: -1,
    WEAPONS_SHOP: 0,
    ARMOR_SHOP: 1,
    APOTHECARY: 2,
    MAGIC_SHOP: 3,
    ARENA: 4,
    BLACKSMITH: 5,
    ARCHERY_RANGE: 6,
    ACADEMY: 7,
    TEMPLE: 8,
    CAVE_ENTRANCE: 9,
    RUNE_STONE: 10,
    TAVERN: 11,
    NPC_HOUSE: 12,
  };
  // Число «картовых» типов, их имена и максимальный footprint —
  // производные из каталога ЛЕНИВО: buildingCount()/buildingNames()/
  // buildMaxW()/buildMaxH()/buildingNameUi() (см. блок после
  // catalogRef, задача 000055). Константы на момент загрузки были
  // удалены: buildings.js грузится ПОСЛЕ map.js (index.html), а
  // vm-песочницы — вообще без него.

  // Типы стационарных групп мобов (SPEC.md, раздел «Мобы»).
  const MOB_GROUP_TYPES = {
    NONE: -1,
    ORC_CAMP: 0,
    ORC_RAIDERS: 1,
    SKELETON_DEN: 2,
    WOLF_PACK: 3,
    SPIDER_NEST: 4,
    ELEMENTAL_CIRCLE: 5,
    ABYSS_SPIRIT: 6,
  };
  const MOB_GROUP_COUNT = 7;
  const MOB_GROUP_NAMES = {
    [MOB_GROUP_TYPES.ORC_CAMP]: 'орочий лагерь',
    [MOB_GROUP_TYPES.ORC_RAIDERS]: 'орочий набеги',
    [MOB_GROUP_TYPES.SKELETON_DEN]: 'логово скелетов',
    [MOB_GROUP_TYPES.WOLF_PACK]: 'волчья стая',
    [MOB_GROUP_TYPES.SPIDER_NEST]: 'паучье гнездо',
    [MOB_GROUP_TYPES.ELEMENTAL_CIRCLE]: 'круг стихийников',
    [MOB_GROUP_TYPES.ABYSS_SPIRIT]: 'дух бездны',
  };

  // Масштаб «крупных» фич шума (в тайлах) и фич построек/мобов.
  const NOISE_SCALE = 1 / 48;
  // Фичи построек/мобов меняются на масштабе десятков тайлов —
  // получается кластеризация «деревнями» вместо континентальных пятен.
  // Масштаб нецелочисленный: целочисленный масштаб заставлял бы сетку тайлов
  // бить шум в одну фиксированную фазу в каждой клетке решётки, где
  // амплитуда Перлина гасит себя (см. тест «сэмпл мира»).
  const FEATURE_SCALE = 0.618;

  /**
   * Создаёт генератор карты.
   * @param {{width:number, height:number, data:ArrayBuffer|Uint8Array|Buffer}|null} [pixels]
   *   Пиксели assets/map.png. Если null — синтетические 8x8 (для тестов/
   *   предпросмотра без ресурса).
   */
  function createMap(pixels = null) {
    const px = pixels || syntheticPixels(8, 8, 128, 128, 128, 255);
    const data = px.data;
    const W = px.width;
    const H = px.height;

    // Три независимых канала шума (сдвиги сидов декоррелируют их).
    const elevation = createPerlin2D(GLOBAL_SEED);
    const moisture = createPerlin2D(GLOBAL_SEED ^ 0x9e3779b9);
    const features = createPerlin2D(GLOBAL_SEED ^ 0x85ebca6b);

    // Один пиксель = один тайл; карта бесконечна — выборка с повтором.
    function pixelAt(x, y) {
      const ix = ((x % W) + W) % W;
      const iy = ((y % H) + H) % H;
      const o = (iy * W + ix) * 4;
      return [data[o], data[o + 1], data[o + 2], data[o + 3]];
    }

    /**
     * Террейн тайла (без построек/мобов) — чистая функция координат.
     * Вынесена из tileAt: разрешение footprint'ов построек (задача
     * 000026) проверяет проходимости соседних тайлов.
     * @returns {{terrain:number, passable:boolean}}
     */
    function terrainAt(x, y) {
      const [r, g, b] = pixelAt(x, y);

      const e = elevation.fbm(x * NOISE_SCALE, y * NOISE_SCALE, 4);
      const m = moisture.fbm(x * NOISE_SCALE + 137.5, y * NOISE_SCALE + 137.5, 4);

      // Глобальная затравка (пиксель map.png) смещает пороги
      // (конвенция: тёмный канал усиливает свой эффект):
      //   R — уровень моря (тёмный R = море поднимается),
      //   G — горная линия (тёмный G = горы чаще),
      //   B — лесная линия (тёмный B = леса чаще).
      const seaLevel = -0.20 + 0.12 * (1 - 2 * r / 255);
      const mountainLine = 0.30 - 0.18 * (1 - 2 * g / 255);
      const forestLine = 0.05 - 0.20 * (1 - 2 * b / 255);

      let terrain;
      if (e < seaLevel - 0.18) terrain = TERRAIN.DEEP_WATER;
      else if (e < seaLevel) terrain = TERRAIN.WATER;
      else if (e < seaLevel + 0.06) terrain = TERRAIN.SAND;
      else if (e >= mountainLine) terrain = TERRAIN.MOUNTAIN;
      else if (e >= mountainLine - 0.10) terrain = TERRAIN.HILL;
      else if (m >= forestLine + 0.25) terrain = TERRAIN.FOREST;
      else if (m >= forestLine + 0.10 && e < seaLevel + 0.15) terrain = TERRAIN.SWAMP;
      else terrain = TERRAIN.GRASS;

      return { terrain, passable: PASSABLE.has(terrain) };
    }

    // --- Постройки с footprint (задача 000026) ---
    //
    // Постройка «живёт» на якорном тайле (то же правило, что до
    // задачи: проходимый + fbm-порог + hash для типа) и занимает
    // прямоугольник w×h от якоря (размер из каталога, assets/buildings,
    // поле «размер»). Если весь прямоугольник не поместился (тайл
    // непроходим или занят постройкой с лексикографически РАНЬШИМ
    // якорем) — размер уменьшается по цепочке sizeChain (5x4 → 3x3 →
    // 1x1); даже 1x1 не влезло — постройки нет. Порядок «раньше/позже»
    // делает размещение детерминированным и без пересечений: поздняя
    // постройка уступает ранней, сжимаясь (или исчезая), а не
    // пересекаясь.
    // Тайлы footprint'а (кроме входа) — стены: непроходимы, без групп
    // мобов. Вход — единственный тайл, где работает взаимодействие
    // (старое поле hasBuilding, его читает src/main.js).

    // Кэш развёртывания якорей: якорь → запись постройки или null.
    // Чистая мемоизация (результат детерминирован), иначе каждый
    // tileAt просчитывал бы окно 3x3 якорей заново.
    const fpCache = new Map();

    // Якорь в (x, y): true, если здесь рождается постройка.
    // Правило порога — как было до 000026 (канал A = плотность).
    function anchorAt(x, y) {
      if (!terrainAt(x, y).passable) return null;
      const a = pixelAt(x, y)[3];
      const fb = features.fbm(x * FEATURE_SCALE + 511.1, y * FEATURE_SCALE + 511.1, 3);
      const rarity = 1 - a / 255; // 0..1, тёмный A → реже
      if (fb <= 0.33 + 0.14 * rarity) return null;
      return { x, y, type: hash2(x, y, GLOBAL_SEED) % buildingCount() };
    }

    // Свободен ли тайл (tx, ty) для постройки с якорем (ax, ay):
    // проходимый И не занят постройкой с РАНЬШИМ якорем.
    // Ссылка только на «раньше» — пористый порядок, циклов нет.
    function isFreeForBuilding(ax, ay, tx, ty) {
      if (!terrainAt(tx, ty).passable) return false;
      for (let oay = ty - buildMaxH() + 1; oay <= ty; oay++) {
        for (let oax = tx - buildMaxW() + 1; oax <= tx; oax++) {
          if (oax > ax || (oax === ax && oay >= ay)) continue; // только «раньше»
          const rec = buildingAtAnchor(oax, oay);
          if (rec && tx >= rec.x && tx < rec.x + rec.w &&
                  ty >= rec.y && ty < rec.y + rec.h) {
            return false;
          }
        }
      }
      return true;
    }

    // --- Вход не замурован (правки по итогам ревью задачи 000026) ---
    //
    // Игрок ходит в 4 направлениях (src/main.js) и заходит в
    // постройку СВОИМ тайлом входа. Если у входного тайла нет ни
    // одного проходимого соседа (собственные стены + вода/горы/стены
    // соседа), постройка генерируется, но в неё нельзя войти никогда.
    // Поэтому при размещении размер принимается, только если:
    //   1) у собственного входа есть свободный сосед вне footprint'а;
    //   2) footprint не замуровывает вход РАНЬШЕЙ постройки: каждый
    //      более ранний вход, соседний с footprint'ом, сохраняет
    //      свободный сосед помимо тайлов нового footprint'а.
    // Иначе placeBuilding берёт следующий (меньший) размер, а если
    // не влезает и 1x1 — постройки нет. Из этих двух условий следует
    // индукция по порядку якорей: в готовом мире у входа КАЖДОЙ
    // постройки есть проходимый сосед.
    //
    // «Свободный сосед» входного тайла — проходимый тайл, не занятый
    // постройкой с РАНЬШИМ якорем и не являющийся стеной
    // кандидатного footprint'а (сам вход кандидата проходим).

    function isFreeEntranceNeighbor(ax, ay, rx, ry, rw, rh, rex, rey, tx, ty) {
      if (!terrainAt(tx, ty).passable) return false;
      if (tx >= rx && tx < rx + rw && ty >= ry && ty < ry + rh) {
        return tx === rex && ty === rey; // вход кандидата — проходим
      }
      return isFreeForBuilding(ax, ay, tx, ty);
    }

    // Есть ли у входа (ex, ey) хотя бы один свободный сосед (4
    // направления) при размещении кандидата (rx, ry, rw, rh).
    function entranceHasFreeNeighbor(ax, ay, ex, ey, rx, ry, rw, rh, rex, rey) {
      return (
        isFreeEntranceNeighbor(ax, ay, rx, ry, rw, rh, rex, rey, ex + 1, ey) ||
        isFreeEntranceNeighbor(ax, ay, rx, ry, rw, rh, rex, rey, ex - 1, ey) ||
        isFreeEntranceNeighbor(ax, ay, rx, ry, rw, rh, rex, rey, ex, ey + 1) ||
        isFreeEntranceNeighbor(ax, ay, rx, ry, rw, rh, rex, rey, ex, ey - 1)
      );
    }

    // Постройка с РАНЬШИМ якорем, вход которой в (x, y), или null.
    // Якорь в 2 тайлах от входа (footprint ≤ buildMaxW() × buildMaxH()).
    function buildingWithEntranceAt(ax, ay, x, y) {
      for (let oay = y - buildMaxH() + 1; oay <= y; oay++) {
        for (let oax = x - buildMaxW() + 1; oax <= x; oax++) {
          if (oax > ax || (oax === ax && oay >= ay)) continue; // только «раньше»
          const rec = buildingAtAnchor(oax, oay);
          if (rec && rec.entrance[0] === x && rec.entrance[1] === y) return rec;
        }
      }
      return null;
    }

    // Допустим ли кандидатный footprint (rx, ry, rw, rh) с входом
    // (rex, rey) для постройки (ax, ay): см. условия (1) и (2) выше.
    function entranceReachable(ax, ay, rx, ry, rw, rh, rex, rey) {
      if (!entranceHasFreeNeighbor(ax, ay, rex, rey, rx, ry, rw, rh, rex, rey)) {
        return false;
      }
      // Соседние с footprint'ом тайлы, которые могут быть чужими
      // входами (без повторов: угловые тайлы дают общих соседей).
      const neighborPts = new Set();
      for (let dy = 0; dy < rh; dy++) {
        for (let dx = 0; dx < rw; dx++) {
          const tx = rx + dx, ty = ry + dy;
          neighborPts.add((tx + 1) + ',' + ty);
          neighborPts.add((tx - 1) + ',' + ty);
          neighborPts.add(tx + ',' + (ty + 1));
          neighborPts.add(tx + ',' + (ty - 1));
        }
      }
      for (const s of neighborPts) {
        const sep = s.indexOf(',');
        const nx = Number(s.slice(0, sep));
        const ny = Number(s.slice(sep + 1));
        const rec = buildingWithEntranceAt(ax, ay, nx, ny);
        if (rec &&
            !entranceHasFreeNeighbor(ax, ay, nx, ny, rx, ry, rw, rh, rex, rey)) {
          return false; // новый wall замуровал бы соседний вход
        }
      }
      return true;
    }

    // Постройка, якорь которой в (ax, ay): запись или null (якоря нет
    // или не поместилось даже 1x1). Кэшируется.
    function buildingAtAnchor(ax, ay) {
      const key = ax + ',' + ay;
      if (fpCache.has(key)) return fpCache.get(key);
      let rec = null;
      const anchor = anchorAt(ax, ay);
      if (anchor) {
        const c = catalogRef();
        const b = c ? c.buildingForMapIndex(anchor.type) : null;
        const placed = c
          ? c.placeBuilding(
              b || {}, ax, ay,
              (tx, ty) => isFreeForBuilding(ax, ay, tx, ty),
              // Вход не должен оказаться замурован, и footprint не
              // должен замуровывать вход ранней постройки.
              (rx, ry, rw, rh, entrance) =>
                entranceReachable(ax, ay, rx, ry, rw, rh, entrance[0], entrance[1]),
            )
          : { x: ax, y: ay, w: 1, h: 1, entrance: [ax, ay] };
        if (placed) {
          // «Богатство» 0-3 — из шума в якорном тайле (SPEC «Постройки»):
          // влияет на ассортимент и цены торговли (src/items.js).
          // Принадлежит постройки как целого: все её тайлы отдают одно
          // и то же значение.
          const wf = features.fbm(ax * FEATURE_SCALE + 222.9, ay * FEATURE_SCALE + 444.1, 3);
          rec = {
            anchor: [ax, ay],
            type: anchor.type,
            x: placed.x,
            y: placed.y,
            w: placed.w,
            h: placed.h,
            entrance: placed.entrance,
            wealth: Math.max(0, Math.min(3, Math.round((wf + 0.5) * 4))),
          };
        }
      }
      if (fpCache.size > 65536) fpCache.clear();
      fpCache.set(key, rec);
      return rec;
    }

    // Покрывающая (x, y) постройка: якорь в окне
    // [x-(W-1)..x] × [y-(H-1)..y]. Постройки не пересекаются,
    // поэтому найденная в лексикографическом порядке — единственная.
    function coveringFootprint(x, y) {
      for (let ax = x - buildMaxW() + 1; ax <= x; ax++) {
        for (let ay = y - buildMaxH() + 1; ay <= y; ay++) {
          const rec = buildingAtAnchor(ax, ay);
          if (!rec) continue;
          if (x >= rec.x && x < rec.x + rec.w &&
              y >= rec.y && y < rec.y + rec.h) {
            return rec;
          }
        }
      }
      return null;
    }

    /**
     * Состояние тайла в целочисленных координатах (x, y).
     * @returns {{
     *   x:number, y:number, terrain:number, passable:boolean,
     *   hasBuilding:boolean, building:number, buildingWealth:number,
     *   hasMobGroup:boolean, mobGroup:number,
     *   inBuilding:boolean, isEntrance:boolean,
     *   buildingAnchor:[number,number]|null,
     * }}
     */
    function tileAt(x, y) {
      const { terrain, passable } = terrainAt(x, y);
      const cover = coveringFootprint(x, y);
      const isEntrance = !!(cover &&
        cover.entrance[0] === x && cover.entrance[1] === y);
      // Стены постройки (тайлы footprint'а, кроме входа) непроходимы.
      const walkable = passable && !(cover && !isEntrance);

      // Группы мобов — только на проходимых тайлах, не занятых
      // постройкой (до 000026 «занято» = якорный тайл; теперь весь
      // footprint). Канал A пикселя — «плотность» (тёмный A = реже).
      const fm = features.fbm(x * FEATURE_SCALE + 903.7, y * FEATURE_SCALE + 903.7, 3);
      const a = pixelAt(x, y)[3];
      const rarity = 1 - a / 255;

      // hasBuilding (старое поле, его читает src/main.js) — только на
      // тайле ВХОДА: магазин/пещера/диалог NPC работают именно там.
      const hasBuilding = !!(cover && isEntrance);
      const building = cover ? cover.type : BUILDING_TYPES.NONE;
      const buildingWealth = cover ? cover.wealth : 0;

      const hasMobGroup = passable && !cover && fm > 0.31 + 0.14 * rarity;
      const mobGroup = hasMobGroup ? hash2(x, y, GLOBAL_SEED ^ 0xabcdef) % MOB_GROUP_COUNT : MOB_GROUP_TYPES.NONE;

      return {
        x, y, terrain,
        passable: walkable,
        hasBuilding,
        building,
        buildingWealth,
        hasMobGroup,
        mobGroup,
        // Задача 000026: тайл принадлежит footprint'у постройки;
        // isEntrance — где взаимодействие; buildingAnchor — якорь.
        inBuilding: !!cover,
        isEntrance,
        buildingAnchor: cover ? cover.anchor : null,
      };
    }

    // Небольшой шум для визуального разнообразия оттенков тайлов.
    function brightness(x, y) {
      return elevation.noise2(x * 0.7 + 0.31, y * 0.7 + 0.17);
    }

    return {
      width: W,
      height: H,
      pixelAt,
      tileAt,
      brightness,
    };
  }

  /** Синтетические пиксели фиксированного цвета (для тестов и fallback). */
  function syntheticPixels(width, height, r, g, b, a) {
    const data = new Uint8Array(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      data[i * 4 + 0] = r;
      data[i * 4 + 1] = g;
      data[i * 4 + 2] = b;
      data[i * 4 + 3] = a;
    }
    return { width, height, data };
  }

  // --- Зум камеры (задача 000019): пикселей на тайл ---
  const ZOOM_MIN = 4;
  const ZOOM_MAX = 128;
  // Стартовый зум — крупный, чтобы Флогистон был хорошо виден
  // (по решению игрока вдвое крупнее среднего детального, 80 = 2×40).
  // Обзорный зум (14px) держит во вьюпорте десятки тысяч тайлов,
  // от которых браузер тормозит.
  const ZOOM_START = 80;

  /**
   * Диапазон тайлов, который нужно отрисовать (задача 000019):
   * видимая область окна плюс небольшой запас. Чистая функция —
   * зависит только от камеры, размера окна и зума, не от карты.
   * @param {number} camX центр камеры X (в тайлах)
   * @param {number} camY центр камеры Y (в тайлах)
   * @param {number} viewW ширина окна (пиксели)
   * @param {number} viewH высота окна (пиксели)
   * @param {number} zoom пикселей на тайл
   * @param {number} [margin=2] дополнительные тайлы за окном (на ось)
   * @returns {{x0:number, y0:number, x1:number, y1:number}} целочисленные границы, обе включительно
   */
  function visibleTileRange(camX, camY, viewW, viewH, zoom, margin = 2) {
    const countX = Math.ceil(viewW / zoom) + margin;
    const countY = Math.ceil(viewH / zoom) + margin;
    const x0 = Math.floor(camX - countX / 2);
    const y0 = Math.floor(camY - countY / 2);
    return { x0, y0, x1: x0 + countX - 1, y1: y0 + countY - 1 };
  }

  /**
   * Кэш сгенерированных тайлов (задача 000019): мир статичен —
   * tileAt чистая функция координат, поэтому уже сгенерированные
   * тайлы не пересчитываются: при перемещении/зуме генерируются
   * только новые тайлы по краям видимой области.
   * Ограниченный FIFO: при переполнении вытесняется самый старый
   * тайл (худший случай — пересчёт, результат рендера не меняется).
   * @param {{tileAt:function}} map генератор из createMap
   * @param {number} [maxSize=65536] максимум тайлов в кэше
   * @returns {{tile:Function, size:Function}}
   */
  function createTileCache(map, maxSize = 65536) {
    const cache = new Map();

    /** Тайл в (x, y): из кэша, либо сгенерированный и положенный в кэш. */
    function tile(x, y) {
      const key = x + ',' + y;
      let t = cache.get(key);
      if (!t) {
        t = map.tileAt(x, y);
        cache.set(key, t);
        if (cache.size > maxSize) {
          cache.delete(cache.keys().next().value); // самый старый
        }
      }
      return t;
    }

    /** Сколько тайлов сейчас в кэше. */
    function size() {
      return cache.size;
    }

    return { tile, size };
  }

  // --- Проекция «мир → экран» глобальной карты (задача 000061) ---
  //
  // Единая конвенция для ВСЕХ слоёв и сцен: y растёт ВНИЗ — и в мире
  // (строки карты), и на экране (та же, что в подземелье/бою; закреплена
  // тестом controls.js «DELTA: y растёт вниз»). До задачи 000061
  // спрайт-слой src/main.js зеркалил ось y («cam.y − ty»), из-за чего
  // «вниз» двигало вверх. Оба преобразования живут здесь, в чистом
  // модуле, чтобы main.js был только потребителем — и слои не могли
  // снова разъехаться (тест «оба слоя согласованы»).

  /**
   * Мир → экран: слой спрайтов (2D-canvas).
   * Конвенция: x вправо, y ВНИЗ; камера — в центре окна.
   * @param {number} tx X мира (тайлах)
   * @param {number} ty Y мира (тайлах, растёт вниз)
   * @param {number} camX центр камеры X
   * @param {number} camY центр камеры Y
   * @param {number} zoom пикселей на тайл (>0)
   * @param {number} viewW ширина окна, пиксели (>0)
   * @param {number} viewH высота окна, пиксели (>0)
   * @returns {{x:number, y:number}} пиксели; невалидные аргументы
   *   (NaN/Infinity/размер<=0/зум<=0) → {x: NaN, y: NaN}, без исключения.
   */
  function worldToScreen(tx, ty, camX, camY, zoom, viewW, viewH) {
    const args = [tx, ty, camX, camY, zoom, viewW, viewH];
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] !== 'number' || !Number.isFinite(args[i])) {
        return { x: NaN, y: NaN };
      }
    }
    if (zoom <= 0 || viewW <= 0 || viewH <= 0) return { x: NaN, y: NaN };
    return {
      x: viewW / 2 + (tx - camX) * zoom,
      y: viewH / 2 + (ty - camY) * zoom, // y-вниз: юг НИЖЕ центра
    };
  }

  /**
   * Орто-матрица 4x4 (column-major, Float32Array) для WebGL-слоя:
   * ТО ЖЕ мир→экран, что и worldToScreen — тайл южнее камеры рисуется
   * НИЖЕ центра экрана.
   * Ловушка (зафиксирована тестом): в WebGL NDC +y = ВЕРХ экрана,
   * поэтому y-строка матрицы НАМЕРЕННО имеет отрицательный склон
   * («0, −1/halfH, 0, 0» + трансляция «+camY/halfH») — южный тайл
   * получает ndc.y < 0 → пиксель (1 − ndc.y)·H/2 = H/2 + (ty−camY)·zoom.
   * «Исправлять» склон на положительный нельзя: это зеркало.
   * @returns {Float32Array} 16 чисел; невалидные аргументы —
   *   Float32Array(16) из NaN, без исключения.
   */
  function orthoMatrix(zoom, camX, camY, viewW, viewH) {
    const args = [zoom, camX, camY, viewW, viewH];
    for (let i = 0; i < args.length; i++) {
      if (typeof args[i] !== 'number' || !Number.isFinite(args[i])) {
        return new Float32Array(16).fill(NaN);
      }
    }
    if (zoom <= 0 || viewW <= 0 || viewH <= 0) {
      return new Float32Array(16).fill(NaN);
    }
    const halfW = viewW / (2 * zoom);
    const halfH = viewH / (2 * zoom);
    return new Float32Array([
      1 / halfW, 0, 0, 0,
      0, -1 / halfH, 0, 0,
      0, 0, -1, 0,
      -camX / halfW, camY / halfH, 0, 1,
    ]);
  }

  return {
    GLOBAL_SEED,
    TERRAIN, TERRAIN_NAMES,
    BUILDING_TYPES,
    buildingCount, buildingNames, buildingNameUi,
    buildMaxW, buildMaxH,
    MOB_GROUP_TYPES, MOB_GROUP_COUNT, MOB_GROUP_NAMES,
    ZOOM_MIN, ZOOM_MAX, ZOOM_START,
    createMap, syntheticPixels,
    visibleTileRange, createTileCache,
    worldToScreen, orthoMatrix, // проекция мир→экран (задача 000061)
    hash2, // детерминированный хэш (perlin.js) — нужен src/sprites.js
  };
});
