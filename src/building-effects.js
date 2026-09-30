// Реестр эффектов построек (задача 000071 — основание цепочки 000064).
//
// Чистый UMD-модуль: node — require(), браузер — Game.buildingEffects
// (паттерн day.js/npc.js). В момент загрузки — НОЛЬ зависимостей: ни
// require, ни захват Game-функций (взаимных require в vm-песочницах
// при загрузке НЕТ — прецедент 000053). canUseToday (day.js) — лениво
// из globalThis.Game в момент ВЫЗОВА, fallback — last !== day: модуль
// обязан работать в песочнице без day.js.
//
// Контракты (зафиксированы tests/building-effects.test.js):
//   * РЕЕСТР EFFECTS = {} (в задаче 000071 ПУСТ — подзадачи
//     000074–000077/000091–000095 добавляют только СВОИ записи):
//     id → { имя, разВДень?, available?(state),
//     apply?(state) → { ok, message? } }.
//     available?(state) — НЕДНЕВНАЯ доступность (state — тот же
//     СНИМОК { day, tile, hero, save }): истина (не строка) —
//     доступно; false/null/undefined/'' — недоступно (reason
//     «недоступно»); непустая строка — недоступно, строка — reason
//     (пример: телепорт-круг без пары — «молчит»). buildingActions
//     опрашивает available ДО проверки лимита раз-в-день:
//     недоступная строка — disabled, нажатие не доходит до apply
//     (ревью раунда 2: дыра контракта — available задокументирован,
//     но никогда не опрашивался).
//   * Чистая buildingActions(building, npc, state) →
//     [{ id, имя, доступен, reason? }]: сначала «Диалог» (id 'dialog',
//     имя 'Диалог'; если npc != null), затем эффекты (порядок каталога).
//     state = { day, tile: {x, y}, hero, save } — save: СНИМОК
//     collectSaveData() (обычный объект, 000072); строка СНИМОК не
//     мутирует (чистота).
//   * Связка «постройка → эффекты»: массив особых_параметры.эффекты
//     (порядок из каталога) ИЛИ, если массива нет, запись
//     EFFECTS[String(building.id)] — обычный 1-к-1 (камень 40,
//     обелиск 42, круг 43, …). Id без записи в реестре — пропуск.
//   * «Раз в день»: флаг ЧИТАЕТСЯ ИЗ КАТАЛОГА (принцип 000053):
//     hasDailyLimit(building, effectId) — особые_параметры.раз_в_день
//     (boolean — каталог побеждает, включая явное false); fallback (в
//     каталоге флага нет) — запись реестра разВДень === true, либо
//     исполняемый эффект (есть apply) — лимит по умолчанию (в этой
//     задаче каталог ещё без пер-эффектных флагов; 000074+ дописывает
//     раз_в_день в каталог, 000092 расширяет hasDailyLimit).
//     Лимит — canUseToday + раздел сейва buildingOncePerDay (000072):
//     ключ 'x,y:effectId' (целые координаты, могут быть отрицательными),
//     значение — день. Мусорный/отсутствующий сейв — fail-open (000029).
//   * reason при сгоревшем лимите: «уже использовано сегодня».

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    root.Game = Object.assign({}, G0, { buildingEffects: factory() });
  }
})(typeof globalThis !== 'undefined' ? globalThis : self, function () {

  // Реестр эффектов: id → { имя, разВДень?, available?(state),
  // apply?(state) → { ok, message? } }. В 000071 ПУСТ — подзадачи
  // 000074–000077/000091–000095 добавляют только СВОИ записи.
  const EFFECTS = {};

  /**
   * Ids эффектов постройки — только те, что есть в реестре; порядок —
   * из каталога (массив особых_параметры.эффекты) либо 1-к-1 запись
   * EFFECTS[String(building.id)]. Дешёвая проверка БЕЗ сейва —
   * безопасно на каждый кадр (HUD-хук 000092).
   * @param {object} building запись каталога (id, особые_параметры)
   * @returns {string[]}
   */
  function effectIds(building) {
    if (!building || typeof building !== 'object') return [];
    const op = building.особые_параметры;
    if (op && Array.isArray(op.эффекты)) {
      return op.эффекты.filter((id) => (
        typeof id === 'string'
        && Object.prototype.hasOwnProperty.call(EFFECTS, id)));
    }
    // 1-к-1: запись по id постройки (рунический камень 40, обелиск 42,
    // круг 43, …).
    const id = String(building.id);
    return Object.prototype.hasOwnProperty.call(EFFECTS, id) ? [id] : [];
  }

  /** Эффекты есть (подсказка HUD; без сейва, дешёвый lookup). */
  function hasEffects(building) {
    return effectIds(building).length > 0;
  }

  /**
   * «Раз в день»: у эффекта есть лимит?
   * Флаг читается из КАТАЛОГА (принцип 000053):
   * особые_параметры.раз_в_день (boolean — каталог побеждает, включая
   * явное false над записью реестра). Fallback (в каталоге флага нет):
   * ТОЛЬКО запись реестра разВДень === true. Эффект БЕЗ флага —
   * ВСЕГДА доступен (повторяем в тот же день сколько угодно):
   * контракт плана 000064 — «фонтан: исцеление лимит / монета — нет»
   * (закреплено тестом B3).
   * @param {object} building запись каталога (id, особые_параметры)
   * @param {string} effectId id эффекта (ключ реестра)
   */
  function hasDailyLimit(building, effectId) {
    const op = building && building.особые_параметры;
    if (op && typeof op.раз_в_день === 'boolean') return op.раз_в_день;
    const entry = EFFECTS[effectId];
    return !!(entry && entry.разВДень === true);
  }

  // Запись сейва 'x,y:effectId' → день. Отсутствует/мусор (не объект,
  // массив) — fail-open (000029): undefined. Прототип-безопасно.
  function readOncePerDay(save, key) {
    if (!save || typeof save !== 'object') return undefined;
    const m = save.buildingOncePerDay;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return undefined;
    return Object.prototype.hasOwnProperty.call(m, key) ? m[key] : undefined;
  }

  // canUseToday (day.js:105) — ЛЕНИВО из globalThis.Game в момент
  // вызова: модуль обязан грузиться в vm-песочнице БЕЗ day.js
  // (прецедент 000053); fallback — то же сравнение last !== day.
  function canUseTodayLazy(lastUsedDay, day) {
    const G = typeof globalThis !== 'undefined' ? globalThis.Game : null;
    if (G && typeof G.canUseToday === 'function') {
      return G.canUseToday(lastUsedDay, day);
    }
    return lastUsedDay !== day;
  }

  // available?(state) — недневная доступность (контракт шапки,
  // зафиксирован тестами A15/A16/A17). Возвращает undefined, если
  // действие ДОСТУПНО, и строку-reason, если НЕТ:
  //   истина (не строка: true, 1, объект) — доступно;
  //   false / null / undefined / '' — недоступно, reason «недоступно»;
  //   непустая строка — недоступно, reason = эта строка (пример:
  //   телепорт-круг без пары — «круг молчит»).
  // st — тот же СНИМОК { day, tile, hero, save }; строка
  // buildingActions снимок не мутирует (available — код записи).
  function unavailableReason(entry, st) {
    if (typeof entry.available !== 'function') return undefined;
    const res = entry.available(st);
    if (typeof res === 'string') return res === '' ? 'недоступно' : res;
    return res ? undefined : 'недоступно';
  }

  /**
   * Список действий на тайле постройки (чистая, без DOM):
   * [{ id, имя, доступен, reason? }]. Порядок: сначала «Диалог»
   * (id 'dialog', если npc != null), затем эффекты (порядок каталога).
   * Доступность эффекта: СНАЧАЛА available?(state) (недневная), затем
   * лимит раз-в-день; reason — причина недоступности (виден в
   * оверлее; строка disabled — нажатие не доходит до apply).
   * building/npc/state (снимок сейва) не мутируются.
   * @param {object} building запись каталога (id, особые_параметры)
   * @param {object|null} npc запись каталога NPC (или null)
   * @param {{day: number, tile: {x: number, y: number}, hero: object,
   *         save: object}} state — save: снимок collectSaveData()
   */
  function buildingActions(building, npc, state) {
    const out = [];
    if (npc != null) {
      out.push({ id: 'dialog', имя: 'Диалог', доступен: true });
    }
    const st = state || {};
    const tile = st.tile || { x: 0, y: 0 };
    for (const id of effectIds(building)) {
      const entry = EFFECTS[id];
      const action = { id, имя: entry.имя, доступен: true };
      // Недневная доступность — ПЕРВОЙ: если эффект в принципе
      // недоступен (круг без пары «молчит»), лимитный reason не
      // важен (ревью раунда 2: дыра контракта — available не
      // опрашивался, оверлей показывал действие доступным, а
      // нажатие умирало молча).
      let reason = unavailableReason(entry, st);
      if (reason === undefined && hasDailyLimit(building, id)) {
        // Ключ 'x,y:effectId' — конвенция 000072 (целые координаты,
        // могут быть отрицательными; effectId — без ':'/',').
        const key = tile.x + ',' + tile.y + ':' + id;
        const last = readOncePerDay(st.save, key);
        if (!canUseTodayLazy(last, st.day)) {
          reason = 'уже использовано сегодня';
        }
      }
      if (reason !== undefined) {
        action.доступен = false;
        action.reason = reason;
      }
      out.push(action);
    }
    return out;
  }

  return { EFFECTS, buildingActions, effectIds, hasEffects, hasDailyLimit };
});
