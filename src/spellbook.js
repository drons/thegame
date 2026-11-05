// Задача 000149: «Книга заклинаний» — список строк для активной
// единицы (кнопка «Книга заклинания» в бою, src/combat-ui.js).
//
// entriesFor(sheet, catalog):
//   * sheet — игровой лист (объект с массивом spells) ИЛИ null/{} —
//     книга пуста → [];
//   * catalog — справочник заклинаний (Game.SpellsData.SPELLS_BY_ID,
//     задача 000023) ИЛИ null/не-объект → [];
//   * на неизвестный id — строка деградации: id виден, остальное пусто
//     (имя = id, без иконки) — книга не падает, как в src/ui-tab-skills.js;
//   * аргументы НЕ мутируются.
//
// 000331 (единый рендер вкладок по школам, контракт 000301):
//   * SCHOOLS — ЕДИНЫЙ источник 6 школ (id = поле «школа» каталога,
//     icon = assets/school-icons/*.svg); перенесён из
//     src/spellbook-oc.js (книга вне боя — тоже через него, 000331);
//   * buildTabs(d, tag, onSelect) — ряд вкладок: контейнер
//     .spoc-tabs с 6 элементами `tag` (бой — div, R9; вне боя —
//     button), у каждого img.spoc-tab-icon (src/alt = SCHOOLS),
//     data-school, title = имя, click → onSelect(id); только прямые
//     присвоения свойств (без setAttribute — vm-стабы боевого UI);
//   * refreshTabs(tabsEl, activeSchool) — класс активной вкладки
//     spoc-tab--active (000301); индексная итерация children
//     (браузер: HTMLCollection — не Array).
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

  const SCHOOLS = [
    { id: "защита", name: "Защита",
      icon: "assets/school-icons/protection.svg" },
    { id: "исцеление", name: "Исцеление",
      icon: "assets/school-icons/healing.svg" },
    { id: "лёд", name: "Лёд", icon: "assets/school-icons/ice.svg" },
    { id: "огонь", name: "Огонь", icon: "assets/school-icons/fire.svg" },
    { id: "природа", name: "Природа",
      icon: "assets/school-icons/nature.svg" },
    { id: "тень", name: "Тень", icon: "assets/school-icons/shadow.svg" },
  ];

  function buildTabs(d, tag, onSelect) {
    const tabs = d.createElement('div');
    tabs.className = 'spoc-tabs';
    for (const s of SCHOOLS) {
      const tab = d.createElement(tag);
      if (tag === 'button') tab.type = 'button';
      tab.className = 'spoc-tab';
      tab.title = s.name;
      tab.ariaLabel = s.name;
      tab.dataset.school = s.id;
      const icon = d.createElement('img');
      icon.className = 'spoc-tab-icon';
      icon.src = s.icon;
      icon.alt = s.name;
      tab.appendChild(icon);
      tab.addEventListener('click', () => onSelect(s.id));
      tabs.appendChild(tab);
    }
    return tabs;
  }

  function refreshTabs(tabsEl, activeSchool) {
    const kids = tabsEl ? tabsEl.children : null;
    if (!kids || typeof kids.length !== 'number') return;
    for (let i = 0; i < kids.length; i++) {
      const t = kids[i];
      if (!t || !t.dataset || t.dataset.school === undefined) continue;
      t.className = (t.dataset.school === activeSchool)
        ? 'spoc-tab spoc-tab--active' : 'spoc-tab';
    }
  }

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

  return { entriesFor, SCHOOLS, buildTabs, refreshTabs };
});
