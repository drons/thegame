// Сохранение состояния игры в локальное хранилище (localStorage).
//
// Чистое ядро без DOM — тестируется в node (tests/save.test.js)
// с мок-хранилищем. localStorage подставляется вызывающим кодом
// (браузер: window.localStorage) — сам модуль хранилище не знает.
//
// Структура записи (оболочка сейва):
//   { version: N, savedAt: 'ISO-8601', data: { …состояние игры… } }
//   — версия СТРУКТУР ДАННЫХ (data), а не программы; записывается
//     в хранилище вместе с данными (задача 000031).
//
// Версионирование и миграции:
//   * CURRENT_VERSION — актуальная версия структур данных в коде;
//   * при «ломающем» изменении структур данных НУЖНО:
//       1) поднять CURRENT_VERSION на единицу;
//       2) добавить в MIGRATIONS функцию N→N+1 (чистая: старая структура
//          → новая структура; ошибка = migration failed);
//     Миграции 1→2→3… применяются ПОСЛЕДОВАТЕЛЬНО при загрузке, пока
//     версия данных не догонит версию кода.
//   * Если какая-то миграция не удалась — данные восстановить
//     невозможно. UI-часть (сообщение пользователю и обнуление ТОЛЬКО
//     после его согласия) — в src/main.js.
//
// Униформный модуль: в браузере — globalThis.Game, в node — require().
// Зависимостей нет.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, factory());
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  'use strict';

  // Ключ записи в хранилище.
  const SAVE_KEY = 'phlogiston.save';

  // Актуальная версия структур данных. См. шапку — как поднимать.
  let CURRENT_VERSION = 1;

  /** Для тестов: смоделировать «код догнал/отстал» от версии данных. */
  function setCurrentVersion(v) {
    if (!Number.isInteger(v) || v < 1) {
      throw new RangeError('save.js: версия должна быть целым >= 1');
    }
    CURRENT_VERSION = v;
  }

  // Миграции N → N+1. Порядок применения — по возрастанию N.
  // При повышении версии добавлять сюда, в начало цепочки — N: (dataV_N)
  // => dataV_N+1.
  const MIGRATIONS = {
    // 1: (dataV1) => dataV2,  // — здесь появится первая миграция
  };

  /** Значение — обычный объект (не null, не массив, не экзотика). */
  function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
  }

  /**
   * Оболочка сейва актуальной версии.
   * @param {object} data состояние игры
   * @param {number} [now] время (мс; для детерминированных тестов)
   * @returns {{version: number, savedAt: string, data: object}}
   */
  function makeSave(data, now) {
    if (!isPlainObject(data)) {
      throw new TypeError('save.js: data должен быть объектом');
    }
    return {
      version: CURRENT_VERSION,
      savedAt: new Date(now == null ? Date.now() : now).toISOString(),
      data,
    };
  }

  /** Серализация оболочки в строку JSON. */
  function serialize(save) {
    return JSON.stringify(save);
  }

  /**
   * ПОСЛЕДОВАТЕЛЬНОЕ применение миграций: data версии fromVersion
   * довести до toVersion (по умолчанию — CURRENT_VERSION).
   * Чистая функция; при любой неудаче бросает исключение.
   * @param {object} data
   * @param {number} fromVersion
   * @param {number} [toVersion]
   * @returns {object} данные новой версии
   */
  function migrate(data, fromVersion, toVersion) {
    toVersion = toVersion == null ? CURRENT_VERSION : toVersion;
    if (!Number.isInteger(fromVersion) || fromVersion < 1) {
      throw new RangeError('save.js: некорректная версия данных: ' + fromVersion);
    }
    if (!Number.isInteger(toVersion) || toVersion < fromVersion) {
      throw new RangeError('save.js: версия кода ' + toVersion +
        ' ниже версии данных ' + fromVersion);
    }
    let d = data;
    for (let v = fromVersion; v < toVersion; v++) {
      const fn = MIGRATIONS[v];
      if (typeof fn !== 'function') {
        throw new Error('save.js: нет миграции ' + v + '→' + (v + 1));
      }
      d = fn(d);
    }
    return d;
  }

  /** Целостность оболочки сейва (проверять ПОСЛЕ миграций). */
  function isValidSave(save) {
    return isPlainObject(save) &&
      Number.isInteger(save.version) &&
      save.version >= 1 &&
      isPlainObject(save.data);
  }

  /**
   * Чтение сейва из хранилища (с миграцией, если данные старые).
   * @param {{getItem: Function}} storage — localStorage-совместимое
   * @returns
   *   { status: 'empty' }                                   — сейва нет;
   *   { status: 'ok', save }                                — прочитан
   *       (при необходимости промигрирован до CURRENT_VERSION);
   *   { status: 'corrupt', error }                          — запись
   *       есть, но не читается (битый JSON/оболочка): восстановить
   *       нечего, данные можно сбросить;
   *   { status: 'migration_failed', version, error }        — миграция
   *       не удалась (включая сейв «из будущего»): данные восстановить
   *       невозможно — обнулять ТОЛЬКО после согласия пользователя.
   */
  function load(storage) {
    let text;
    try {
      text = storage.getItem(SAVE_KEY);
    } catch (err) {
      return { status: 'corrupt', error: err };
    }
    if (text == null || text === '') return { status: 'empty' };
    let save;
    try {
      save = JSON.parse(text);
    } catch (err) {
      return { status: 'corrupt', error: err };
    }
    if (!isValidSave(save)) {
      return { status: 'corrupt',
        error: new Error('save.js: некорректная оболочка сейва') };
    }
    if (save.version > CURRENT_VERSION) {
      // Сейв «из будущего»: данные новее кода, догнать их миграциями
      // невозможно.
      return { status: 'migration_failed', version: save.version,
        error: new Error('save.js: версия сейва ' + save.version +
          ' новее версии кода ' + CURRENT_VERSION) };
    }
    if (save.version < CURRENT_VERSION) {
      try {
        save.data = migrate(save.data, save.version);
      } catch (err) {
        return { status: 'migration_failed', version: save.version, error: err };
      }
      save.version = CURRENT_VERSION;
      save.migrated = true;
    }
    return { status: 'ok', save };
  }

  /**
   * Запись сейва (оболочка текущей версии).
   * @returns {boolean} false — хранилище не дало (например, квота)
   */
  function save(storage, data, now) {
    try {
      storage.setItem(SAVE_KEY, serialize(makeSave(data, now)));
      return true;
    } catch (err) {
      return false;
    }
  }

  /** Обнуление сейва. Вызывать ТОЛЬКО после согласия пользователя
   *  (или для corrupt-записей, где восстанавливать нечего). */
  function clear(storage) {
    try {
      storage.removeItem(SAVE_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }

  return {
    SAVE_KEY,
    get CURRENT_VERSION() { return CURRENT_VERSION; },
    setCurrentVersion,
    MIGRATIONS,
    isPlainObject, makeSave, serialize, migrate, isValidSave,
    load, save, clear,
  };
});
