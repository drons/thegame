// Задача 000149: «Книга заклинаний» — список строк для активной
// единицы (кнопка «Книга заклинания» в бою, src/combat-ui.js).
//
// Единственная функция — entriesFor(sheet, catalog):
//   * sheet — игровой лист (объект с массивом spells) ИЛИ null/{} —
//     книга пуста → [];
//   * catalog — справочник заклинаний (Game.SpellsData.SPELLS_BY_ID,
//     задача 000023) ИЛИ null/не-объект → [];
//   * на неизвестный id — строка деградации: id виден, остальное пусто
//     (имя = id, без иконки) — книга не падает, как в src/ui-tab-skills.js;
//   * аргументы НЕ мутируются.
//
// Униформный модуль (паттерн 000034/000038): в браузере —
// globalThis.Game.SpellBook, в node — require(). НОЛЬ require и ноля
// чтений Game на загрузке (зависимости приходят аргументами вызова).
// В index.html скрипт вставлен ПОСЛЕ spells.js/spells-data.js и ПЕРЕД
// combat-ui.js (combat-ui снимает снимок Game на загрузке — 000038).

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.Game = Object.assign({}, root.Game, { SpellBook: factory() });
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {
  // Пул действий по атрибуту (зеркало ATTR_POOL в src/spells.js, 000045)
  // и человекочитаемое имя атрибута для строки «Мана N · Заклинание (…)».
  const ATTR_POOL = { intelligence: 'spellInt', wisdom: 'spellWis' };
  const ATTR_NAME = { intelligence: 'Интеллект', wisdom: 'Мудрость' };

  // Строки книги: [{id, name, desc, mana, poolKey, poolName, icon}].
  // poolKey — ключ пула действий листа (spellInt/spellWis) для UI-
  // подсказок; poolName — подпись атрибута; icon — путь из JSON
  // каталога (assets/spell-icons/<id>.svg) либо null.
  function entriesFor(sheet, catalog) {
    if (!sheet || typeof sheet !== 'object') return [];
    const spells = sheet.spells;
    if (!Array.isArray(spells)) return [];
    if (!catalog || typeof catalog !== 'object') return [];
    return spells.map((id) => {
      const s = (typeof id === 'string' && id) ? catalog[id] : null;
      if (!s) {
        // Неизвестный id — деградация: показываем id как есть.
        return { id: id, name: id, desc: '', mana: 0,
          poolKey: null, poolName: null, icon: null };
      }
      return {
        id: s.id,
        name: s['название'],
        desc: s['описание'],
        mana: s['мани'],
        poolKey: ATTR_POOL[s['атрибут']] || null,
        poolName: ATTR_NAME[s['атрибут']] || null,
        icon: s.icon || null,
      };
    });
  }

  return { entriesFor };
});
