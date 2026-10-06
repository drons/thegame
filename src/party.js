// Партия (задача 000145): Game.Party = { list, active } — ЧИСТЫЕ
// функции: список партии (hero → Эфир → наёмные в порядке roster) и
// выбор активного персонажа по id (stale/неизвестный — тихий
// fallback на первого — наёмник уволен / Эфир не встречен — НЕ
// ошибка).
//
// Униформный JS-модуль (образец src/cities.js): в браузере —
// globalThis.Game.Party, в node — require() (CommonJS).
// При загрузке: НОЛЬ чтений Game/DOM/require/console — данных нет,
// деградировать нечему (паттерн skills-data/npc-data).
//
// ID-пространство (ОДИН id на всё — контракт §2.4): member.id =
// id портрета (000142) = data-partytab в строках «Отряда» =
// аргумент playerUI.toggle(true, "character", id):
//   hero → "flogiston"; Эфир → "efir"; наёмный → entry.npcId.
//
// Контракт: memory/000145-active-character.md §2; ТЗ —
// tasks/pending/000145.md.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    // В браузере — пространство Game.Party (не смешивать с Game).
    root.Game = Object.assign({}, root.Game, { Party: factory() });
  }
})(typeof globalThis !== "undefined" ? globalThis : self, function () {

  function isObj(x) {
    return !!x && typeof x === "object" && !Array.isArray(x);
  }

  // Имя героя — только для UI (заголовок/tooltip); лист —
  // live-ссылка как есть.
  function heroName(hero) {
    return (typeof hero.name === "string" && hero.name)
      ? hero.name : "Флогистон";
  }

  // Роль наёмного (контракт §2.2): каталожная роль + найм-класс в
  // скобках («Наёмник (melee)»/«Наёмница (ranged)»…); одна точка
  // данных — каталог npc-data (роль + найм.роль). БЕЗ каталога
  // (npc = null) — «наёмник» (тихо, паттерн 000029).
  function mercRole(npc) {
    if (!isObj(npc)) return "наёмник";
    const base = (typeof npc.роль === "string" && npc.роль)
      ? npc.роль : "наёмник";
    const cap = base.charAt(0).toUpperCase() + base.slice(1);
    const hire = isObj(npc.найм) ? npc.найм : {};
    return (typeof hire.роль === "string" && hire.роль)
      ? cap + " (" + hire.роль + ")" : cap;
  }

  /**
   * Список партии (ЧИСТАЯ функция — без мутаций аргументов).
   * @param {object} src { hero, efir, efirMet, roster, npcs } — все
   *   опциональны; не-объект/мусор — деградация без исключений → [].
   * @returns {Array<{kind,id,name,role,sheet,npc?}>} порядок
   *   hero → efir → mercs (порядок roster):
   *   * hero — ВСЕГДА первым (если src.hero — объект): sheet =
   *     live-ссылка; ПОЛЯ kind У ОБЪЕКТА ГЕРОЯ НЕТ (000140 R-1 —
   *     байты сейва 000031) — kind присваивает member-запись.
   *   * efir — только при src.efirMet === true И src.efir — объект.
   *   * mercs — по src.roster (записи 000143 {npcId, sheet, …});
   *     запись без npcId/без sheet — «призрак» — тихий skip;
   *     npc — из src.npcs (каталог) по n.id === e.npcId, или null.
   */
  function list(src) {
    const s = isObj(src) ? src : null;
    const out = [];
    if (s && isObj(s.hero)) {
      out.push({
        kind: "hero",
        id: "flogiston",
        name: heroName(s.hero),
        role: "Герой",
        sheet: s.hero,
      });
    }
    if (s && s.efirMet === true && isObj(s.efir)) {
      out.push({
        kind: "efir",
        id: "efir",
        name: "Эфир",
        role: "Дух",
        sheet: s.efir,
      });
    }
    if (s && Array.isArray(s.roster)) {
      const catalog = Array.isArray(s.npcs) ? s.npcs : [];
      for (const e of s.roster) {
        // «Призрак» (нет npcId/sheet) и мусор — тихий skip.
        if (!isObj(e) || typeof e.npcId !== "string" || !e.npcId ||
            !isObj(e.sheet)) continue;
        const npc = catalog.find((n) => isObj(n) && n.id === e.npcId)
          || null;
        out.push({
          kind: "merc",
          id: e.npcId,
          name: (npc && typeof npc.имя === "string" && npc.имя)
            ? npc.имя : String(e.npcId),
          role: mercRole(npc),
          sheet: e.sheet,
          npc: npc,
        });
      }
    }
    return out;
  }

  /**
   * Выбор активного персонажа (ЧИСТАЯ функция, ссылка на member).
   * @param {Array} listArr результат list() — не-массив/пусто → null.
   * @param {string} id id member (ID-пространство §2.4);
   *   null/"" → первый (дефолт — Флогистон); неизвестный/stale →
   *   первый (тихий fallback — без краха и без console.error).
   */
  function active(listArr, id) {
    if (!Array.isArray(listArr) || listArr.length === 0) return null;
    if (id == null || id === "") return listArr[0];
    const found = listArr.find((m) => isObj(m) && m.id === id);
    return found || listArr[0];
  }

  return { list, active };
});
