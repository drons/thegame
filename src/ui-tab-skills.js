// Вкладка «Персонаж» панели персонажа (задача 000130 — разбиение
// ui.js): заголовок, статистика, таблицы основных/вторичных навыков
// и тултипы строк навыков (000097 — skillTipCell/requiresText/
// skillTipText переезжают вместе с вкладкой) + 000145: ряд
// иконок-портретов СВЕРХУ страницы (000142), выбор АКТИВНОГО
// персонажа (per-session — в сейв НЕ пишем, 000031), единый лист
// (000140/000143/000144) для ВСЕХ kinds + raise на любого, «Книга
// заклинаний» (read-only) и «Вдох Эфира» (контент вкладки 000116 —
// вкладка убирается в 000146; имена секций/тел — стабильный
// контракт §8).
//
// Чистый UMD-модуль (образец src/cities.js): node — require()
// возвращает определение вкладки (без регистрации); браузер —
// САМОРЕГИСТРАЦИЯ в Game.uiTabs при загрузке (src/ui-tabs.js обязан
// грузиться ДО этого файла — иначе console.error + без регистрации,
// игра не падает — паттерн 000053). При загрузке — НОЛЬ DOM, НОЛЬ
// require, НОЛЬ RNG.
//
// БЕЗСОСТОЯТЕЛЬНА: персонаж — closure ядра ui.js (setCharacter),
// чтение — через ctx.character (может быть null в build —
// buildPanel строится ДО проверки character: fallback ''). Активный
// персонаж — closure ядра (000145 §4): live-getter ctx.activeCharId;
// партия (roster/Эфир) — ЛЕНИВО в момент render/вызова (снапшот-
// ловушка 000038: снапшот G НЕ содержит __game — main.js грузится
// ПОСЛЕ вкладочных модулей).
//
// Контракт: memory/000145-active-character.md.

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null, null);   // node: определение, без
                                            // регистрации
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const m = factory(G0, root);
    const reg = G0.uiTabs;
    if (reg && typeof reg.register === 'function') {
      for (const t of (m.tabs || [m.tab])) reg.register(t);
    } else if (root) {
      console.error('src/ui-tab-skills.js: Game.uiTabs не найден — ' +
        'src/ui-tabs.js должен грузиться ДО вкладочных модулей ' +
        '(задача 000130)');
    }
    // «Модуль заменяет Game» (000018/000038): реестр — ТОТ ЖЕ
    // объект-ссылка (мутация in place, не новый объект — 000038-
    // ловушка a3).
    root.Game = Object.assign({}, G0, m.game || {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function (G0, rootRef) {
  'use strict';
  // ОДИН снапшот Game (000038): все провайдеры G.* (player/
  // skills-data/party и др.) грузятся ВЫШЕ в index.html — все
  // обращения G.* — при ВЫЗОВЕ, не при загрузке.
  const G = G0 || {};

  // --- 000145: флаги деградации (каждый ОДИН раз, паттерн
  // coreErrorShown ядра) ---
  let partyErrorShown = false;
  let portraitsErrorShown = false;
  let sheetErrorShown = false;

  // --- Тултипы (000097): носитель для строк навыков ---
  // Отдельная ПУСТАЯ ячейка в конце <tr>: render() каждый раз
  // переписывает textContent .cp-name/.cp-level/.cp-req, а запись
  // textContent в существующем td убрала бы дочерний узел .cp-tip.
  // Текст наполняется в render() в узел .cp-tip (один текст-нод).
  function skillTipCell(ctx) {
    const td = ctx.el('td', 'cp-tipcell');
    td.appendChild(ctx.el('div', 'cp-tip', ''));
    return td;
  }

  function requiresText(s) {
    if (!s.requires) return '';
    const id = s.requires.skill;
    const name = G.PRIMARY_SKILLS.some((p) => p.id === id)
      ? G.PRIMARY_SKILLS.find((p) => p.id === id).name
      : (G.SECONDARY_SKILLS[id] || { name: id }).name;
    return `${name} ${s.requires.level}`;
  }

  // --- Тултипы (000097): текст — ТОЛЬКО из каталогов ---
  // Строки склеиваются '\n' — ОДИН текст-нод (в DOM-стабе textContent
  // детей не учитывает; в браузере — white-space: pre-line).

  // Строка навыка: основное — desc + «В бою»/«В мире» + «Требование:
  // —»; вторичное — desc + эффект (как в каталоге) + текущий титул
  // (names[] — вычисляется в render(), не в build) + требование
  // (тот же текст, что в .cp-req, иначе «—»).
  function skillTipText(id, c) {
    const p = G.PRIMARY_SKILLS.find((x) => x.id === id);
    if (p) {
      return [p.desc,
        'В бою: ' + p.combat,
        'В мире: ' + p.world,
        'Требование: —'].join('\n');
    }
    const s = G.SECONDARY_SKILLS[id];
    if (!s) return '';
    const lvl = (c.secondary && c.secondary[id]) || 0;
    // lvl = 0 — базовое имя (rankOf(0) дал бы последний ранг —
    // артефакт player.js; ранговую логику не дублируем).
    const title = lvl > 0 ? G.secondaryName(id, lvl) : s.name;
    return [s.desc,
      'Эффект: ' + s.effectType + ' (' + s.effect.stat + ' ' +
        s.effect.perLevel + ' за уровень)',
      'Уровень: ' + title,
      'Требование: ' + (requiresText(s) || '—')].join('\n');
  }

  // --- 000145: партия и активный персонаж (live, в момент вызова) ---

  // Имя героя (UI): hero.name || «Флогистон» (контракт §2.1).
  function heroMember(hero) {
    return {
      kind: 'hero',
      id: 'flogiston',
      name: (typeof hero.name === 'string' && hero.name)
        ? hero.name : 'Флогистон',
      role: 'Герой',
      sheet: hero,
    };
  }

  // Live-ссылки панели «Отряд» (000145): squadUI СОЗДАЁТ ui.js —
  // ПОСЛЕ вкладки, то есть В СНАПШОТЕ G НЕТ (снапшот-ловушка
  // 000038) — ЛЕНИВО через rootRef.Game (globalThis — стабильная
  // ссылка; объект Game ЗАМЕНЯЕТСЯ при загрузке каждого модуля —
  // актуальный — на rootRef.Game).
  function squadLive() {
    const Gnow = (rootRef && rootRef.Game &&
        typeof rootRef.Game === 'object') ? rootRef.Game : null;
    const sq = Gnow && Gnow.squadUI;
    return (sq && typeof sq.liveState === 'function')
      ? sq.liveState() : null;
  }

  // Live-ссылки партии (контракт §6): ПЕРВОЕ — rootRef.__game.state
  // (main.js выставил live-массив/объект/флаг — та же самая ссылка,
  // что и у панели «Отряд»); БЕЗ __game (vm-песочница без main.js —
  // навигация «Отряд» → «Персонаж») — liveState() панели «Отряд»
  // (те же live-ссылки, что squadUI.init). __game.state.hero —
  // СНАПШОТ — hero берём ТОЛЬКО из ctx.character.
  function partySource() {
    const gs = (rootRef && rootRef.__game && rootRef.__game.state)
      ? rootRef.__game.state : null;
    const sq = squadLive();
    const roster = (gs && Array.isArray(gs.roster)) ? gs.roster
      : (sq && Array.isArray(sq.roster) ? sq.roster : null);
    const efir = (gs && gs.efir && typeof gs.efir === 'object'
        && !Array.isArray(gs.efir)) ? gs.efir
      : (sq && sq.efir && typeof sq.efir === 'object'
        && !Array.isArray(sq.efir) ? sq.efir : null);
    return {
      efir: efir,
      efirMet: !!(gs && gs.efirMet === true),
      roster: roster,
      npcs: (G.NpcData && G.NpcData.NPCS) || null,
    };
  }

  // Партия + активный (live). G.Party отсутствует (регрессия порядка
  // тегов — пин index-order) — console.error ОДИН раз + [hero]
  // (поведение ДО задачи: активный всегда = герой).
  function partyOf(ctx, hero) {
    const P = G.Party;
    if (!P || typeof P.list !== 'function' ||
        typeof P.active !== 'function') {
      if (!partyErrorShown) {
        partyErrorShown = true;
        console.error('src/ui-tab-skills.js: Game.Party не найден — ' +
          'src/party.js обязан грузиться ДО вкладочных модулей ' +
          '(задача 000145); партия = только герой');
      }
      const members = [heroMember(hero)];
      return { members, active: members[0] };
    }
    const src = partySource();
    const members = P.list({
      hero,
      efir: src.efir,
      efirMet: src.efirMet,
      roster: src.roster,
      npcs: src.npcs,
    });
    // Разрешение активного — в момент ВЫЗОВА (stale id — тихий
    // fallback на первого, Party.active).
    const active = P.active(members, ctx.activeCharId);
    return { members, active };
  }

  // API навыков по kind (контракт §3.3): hero — плоские экспорты G
  // (player.js = делегаты Sheet — вывод ПОБАЙТОВО); efir/merc —
  // Game.Sheet (чистая модель 000140). haveS — полный набор функций.
  function sheetApi(kind) {
    const S = kind === 'hero' ? G : G.Sheet;
    const haveS = !!S && typeof S.canRaise === 'function' &&
      typeof S.practiceCap === 'function' &&
      typeof S.skillXpForNext === 'function' &&
      typeof S.MAX_SKILL_LEVEL === 'number';
    return { S, haveS };
  }

  // --- 000145: «Книга заклинаний» (read-only, паттерн строк
  // cp-itemrow/cp-itemname/cp-itemmeta вкладки «Эфир»,
  // ui-tab-efir.js) ---

  // Имя заклинания — каталог G.SpellsData.SPELLS_BY_ID[id].название;
  // отсутствует — голый id (тихо, деградация §7).
  function spellName(id) {
    const s = (G.SpellsData && G.SpellsData.SPELLS_BY_ID)
      ? G.SpellsData.SPELLS_BY_ID[id] : null;
    return (s && s.название) ? s.название : id;
  }

  // learned-книга (hero/merc): по c.spells; пусто — строка «—».
  function renderLearnedBook(ctx, c, book) {
    const spells = Array.isArray(c.spells) ? c.spells : [];
    if (spells.length === 0) {
      const row = ctx.el('div', 'cp-itemrow');
      row.appendChild(ctx.el('span', 'cp-itemname', '—'));
      book.appendChild(row);
      return;
    }
    for (const id of spells) {
      if (typeof id !== 'string') continue;
      const row = ctx.el('div', 'cp-itemrow');
      row.appendChild(ctx.el('span', 'cp-itemname', spellName(id)));
      book.appendChild(row);
    }
  }

  // «Книга заклинаний» (render, rebuild in place):
  //   hero/merc — по c.spells (read-only: кнопок «+» у строк НЕТ);
  //   efir — ВСЕГДА 10 строк (канонический порядок: старт сперва —
  //   G.efir.efirSpellsByLevel(1), затем UNLOCKS по возрастанию
  //   порога — G.efir.EFIR_SPELL_UNLOCKS): отметка «уровень N»
  //   (изучен — c.spells) / «откроется на N-м уровне» (порог) —
  //   «отметки авто-разблокировок» ТЗ. G.efir/UNLOCKS отсутствуют —
  //   тихий fallback на learned-only.
  function renderBook(ctx, active) {
    const book = ctx.panel._book;
    if (!book) return;
    book.textContent = ''; // DOM-стаб: сброс детей (rebuild in place)
    const c = active.sheet;
    if (active.kind === 'efir') {
      const E = G.efir;
      const start = (E && typeof E.efirSpellsByLevel === 'function')
        ? E.efirSpellsByLevel(1) : null;
      const un = (E && Array.isArray(E.EFIR_SPELL_UNLOCKS))
        ? E.EFIR_SPELL_UNLOCKS : null;
      if (Array.isArray(start) && un && un.length) {
        const learned = Array.isArray(c.spells) ? c.spells : [];
        const entries = [];
        for (const id of start) {
          if (typeof id === 'string') entries.push({ id, level: 1 });
        }
        for (const u of un) {
          if (u && typeof u[1] === 'string') {
            entries.push({ id: u[1], level: u[0] });
          }
        }
        for (const en of entries) {
          const row = ctx.el('div', 'cp-itemrow');
          row.appendChild(ctx.el('span', 'cp-itemname', spellName(en.id)));
          row.appendChild(ctx.el('span', 'cp-itemmeta',
            learned.indexOf(en.id) >= 0
              ? 'уровень ' + en.level
              : 'откроется на ' + en.level + '-м уровне'));
          book.appendChild(row);
        }
        return;
      }
    }
    renderLearnedBook(ctx, c, book);
  }

  // --- 000145: «Вдох Эфира» (КОПИЯ паттерна ui-tab-efir.js —
  // источник живёт до 000146): статичный текст (SPEC «Дух Эфира» →
  // «Бой») — ленивый G.efir.EFIR_BREATH .lines || .текст || .text
  // (экспорт {text: BREATH_INFO.desc}) + BREATH_FALLBACK (дословные
  // строки SPEC). В деградации тоже — как в старой вкладке. ---
  const BREATH_FALLBACK =
    '1 раз за бой, авто-триггер на его ходу: игрок ≤ 40% HP и мана ' +
    'Эфира ≥ 20.\n' +
    'Расходует 20 маны и весь ход: лечение всем союзным ' +
    'round(10 + 0.8 * Мудрость);\n' +
    'ослабление всех врагов: их урон ×0.8 на 2 хода.';

  function breathText() {
    const E = G.efir;
    const B = E && E.EFIR_BREATH;
    if (B && typeof B === 'object') {
      const lines = B.lines || B.текст || B.text;
      if (Array.isArray(lines) && lines.length) return lines.join('\n');
      if (typeof lines === 'string' && lines) return lines;
    }
    return BREATH_FALLBACK;
  }

  const tab = {
    column: 0,
    id: 'character',
    label: 'Персонаж',
    build(pane, ctx) {
      // 000145: ряд портретов (000142) — ПЕРВЫМ (СВЕРХУ страницы,
      // ТЗ); render() обновляет in place (партия меняется:
      // найм/увольнение/встреча Эфира — body без rebuild-панели).
      const portraits = ctx.el('div', 'cp-portraits');
      pane.appendChild(portraits);
      ctx.panel._portraits = portraits;

      // Заголовок — имя АКТИВНОГО персонажа; render() обновляет in
      // place (hero — побайтово как ДО: c.name; переименование —
      // restoreFromSave). buildPanel строится ДО проверки character
      // (toggle) — null допустим (fallback '').
      const ch = ctx.character;
      const title = ctx.el('div', 'cp-title', ch ? ch.name : '');
      pane.appendChild(title);
      ctx.panel._title = title;

      const stats = ctx.el('div', 'cp-stats');
      pane.appendChild(stats);
      ctx.panel._stats = stats;

      // Основные навыки (строки/классы БЕЗ ИЗМЕНЕНИЙ — DOM-контракт
      // tests/ui-skills.test.js).
      const primaries = ctx.el('div', 'cp-section', 'Основные навыки');
      const primTable = ctx.el('table', 'cp-table');
      for (const p of G.PRIMARY_SKILLS) {
        const tr = ctx.el('tr');
        tr.appendChild(ctx.el('td', 'cp-name', p.name));
        const lv = ctx.el('td', 'cp-level', '—');
        tr.appendChild(lv);
        const btn = ctx.el('button', 'cp-btn', '+');
        btn.dataset.skill = p.id;
        tr.appendChild(btn);
        tr.appendChild(skillTipCell(ctx)); // 000097: тултип строки
        primTable.appendChild(tr);
      }
      primaries.appendChild(primTable);
      pane.appendChild(primaries);

      // Вторичные навыки по группам основных.
      for (const p of G.PRIMARY_SKILLS) {
        const section = ctx.el('div', 'cp-section', p.name);
        const table = ctx.el('table', 'cp-table');
        for (const [id, s] of Object.entries(G.SECONDARY_SKILLS)) {
          if (s.primary !== p.id) continue;
          const tr = ctx.el('tr');
          tr.appendChild(ctx.el('td', 'cp-name')); // имя подставится
          // при render
          tr.appendChild(ctx.el('td', 'cp-req', ''));
          const lv = ctx.el('td', 'cp-level', '—');
          tr.appendChild(lv);
          const btn = ctx.el('button', 'cp-btn', '+');
          btn.dataset.skill = id;
          tr.appendChild(btn);
          tr.appendChild(skillTipCell(ctx)); // 000097: тултип строки
          table.appendChild(tr);
        }
        section.appendChild(table);
        pane.appendChild(section);
      }

      // 000145: «Книга заклинаний» (ВСЕГДА — для любого kind;
      // read-only) + «Вдох Эфира» (видна ТОЛЬКО при активном «Эфир»;
      // скрыта по умолчанию — render() переключает). Имена секций и
      // тела _book/_breath/_breathSec — стабильный контракт 000146.
      const bookSec = ctx.el('div', 'cp-section', 'Книга заклинаний');
      const book = ctx.el('div', 'cp-items');
      bookSec.appendChild(book);
      pane.appendChild(bookSec);
      ctx.panel._book = book;

      const breathSec = ctx.el('div', 'cp-section', 'Вдох Эфира');
      const breath = ctx.el('div', 'cp-stats', '');
      breathSec.appendChild(breath);
      pane.appendChild(breathSec);
      ctx.panel._breathSec = breathSec;
      ctx.panel._breath = breath;
      breathSec.style.display = 'none';
    },
    // 000145: raise-маршрутизация (ОДИН источник — контракт §5;
    // задел на 000147 — единое изучение заклинаний): АКТИВНЫЙ
    // персонажа (live: Party.list + Party.active в момент вызова) →
    // по kind: hero — G.raiseSkill (обёртка player.js — крафт-хук
    // 000046), efir/merc — G.Sheet.raiseSkill (чистая модель).
    // Доп. поле записи — легально (реестр 000130 валидирует
    // id/label/column/build — доп. поля игнорирует).
    raiseSkill(skillId, ctx) {
      const hero = ctx.character;
      if (!hero) return { ok: false, reason: 'Нет активного персонажа' };
      const party = partyOf(ctx, hero);
      const active = party.active;
      if (!active) return { ok: false, reason: 'Нет активного персонажа' };
      const { S } = sheetApi(active.kind);
      if (!S || typeof S.raiseSkill !== 'function') {
        return { ok: false, reason: 'Лист недоступен' };
      }
      return S.raiseSkill(active.sheet, skillId);
    },
    render(ctx) {
      const panel = ctx.panel;
      const hero = ctx.character;
      if (!hero) return;
      // 000145: АКТИВНЫЙ персонажа (live — партия может измениться:
      // найм/увольнение/встреча Эфира; stale id — тихий fallback на
      // первого).
      const party = partyOf(ctx, hero);
      const active = party.active;
      if (!active) return;
      const c = active.sheet;
      const { S, haveS } = sheetApi(active.kind);
      if (active.kind !== 'hero' && !haveS) {
        // G.Sheet отсутствует при не-hero активном (в игре
        // НЕДОСТИЖИМО — пин index-order): console.error ОДИН раз +
        // read-only (уровни рисуются, все «+» disabled).
        if (!sheetErrorShown) {
          sheetErrorShown = true;
          console.error('src/ui-tab-skills.js: Game.Sheet не найден — ' +
            'src/sheet.js обязан грузиться ДО вкладочных модулей ' +
            '(задача 000140); лист — read-only');
        }
      }

      // Заголовок — имя АКТИВНОГО (узел собран один раз в buildPanel;
      // hero — побайтово как ДО: c.name; пин ui-panel держится).
      if (panel._title) panel._title.textContent = active.name;

      // Ряд портретов (in place: существующие кнопки обновляются в
      // ТЕХ ЖЕ узлах — className/title/img пересчитываются; узлы
      // создаются/удаляются только когда изменился СОСТАВ партии:
      // найм/увольнение/встреча Эфира — порядок = порядок партии,
      // appendChild переносит существующий узел).
      if (panel._portraits) {
        const row = panel._portraits;
        const PD = G.PortraitsData;
        if (!PD || !Array.isArray(PD.PORTRAITS)) {
          if (!portraitsErrorShown) {
            portraitsErrorShown = true;
            console.error('src/ui-tab-skills.js: Game.PortraitsData ' +
              'не найден — src/portraits-data.js обязан грузиться ' +
              'ДО вкладочных модулей (задача 000142); ряд портретов ' +
              'не рисуется');
          }
          row.textContent = ''; // ряд НЕ рисуется (деградация §7)
        } else {
          const byId = {};
          for (const ch of row.children) {
            if (ch.dataset && ch.dataset.memberid) {
              byId[ch.dataset.memberid] = ch;
            }
          }
          for (const m of party.members) {
            const p = PD.PORTRAITS.find((x) => x && x.id === m.id);
            // Портрет конкретного member не найден — тихий skip
            // иконки (целостность каталога пинята 000141/000142);
            // устаревший узел (если был) уйдёт по очистке ниже.
            if (!p || typeof p.icon !== 'string' || !p.icon) continue;
            let btn = byId[m.id] || null;
            if (!btn) {
              // КНОПКА НЕ .cp-btn (ловушка 000098: делегирование
              // ядра и render итерируют .cp-btn — портрет не должен
              // попасть в цикл строк/raise) и без data-skill.
              btn = ctx.el('button', 'cp-portrait');
            }
            btn.className = (m === active)
              ? 'cp-portrait cp-portrait-active' : 'cp-portrait';
            btn.dataset.memberid = m.id;
            btn.title = m.name + ' — ' + m.role;
            let img = btn.querySelector('img');
            if (!img) {
              img = ctx.el('img');
              btn.appendChild(img);
            }
            // Префикс 'assets/portraits/' — у ПОТРЕБИТЕЛЯ (000142 D2:
            // icon в каталоге — basename).
            img.src = 'assets/portraits/' + p.icon;
            img.alt = m.name;
            row.appendChild(btn);
          }
          // Устаревшие узлы (member больше не в партии — уволен /
          // Эфир «не встречен»): убрать из ряда.
          for (const ch of row.children.slice()) {
            const id = ch.dataset && ch.dataset.memberid;
            if (!id || !party.members.some((m) => m.id === id)) {
              ch.remove();
            }
          }
        }
      }

      // Статы (in place):
      //   hero — ПОБАЙТОВО текущий 4-строчный шаблон (пины
      //   ui-panel/ui-skills; idиома ДВА пробела у | — 000041);
      //   efir/merc — 2 строки (sheet 000140/143/144: нет
      //   gold/hp/inventory-полей; xpForNext — функция только от
      //   level — работает на любом sheet).
      if (active.kind === 'hero') {
        const d = G.derived(c);
        const eqA = G.equipmentStats ? G.equipmentStats(c).armor : 0;
        const w = G.inventoryWeight(c);
        const maxW = G.maxCarryWeight(c);
        panel._stats.textContent =
          `Уровень ${c.level}  |  Опыт ${c.xp}/${G.xpForNext(c.level)}\n` +
          `HP ${c.hp}/${d.maxHP}  |  MP ${c.mp}/${d.maxMP}  |  Броня ${d.armor + eqA}\n` +
          `Золото: ${c.gold}  |  Свободные очки: ${c.points}\n` +
          `Вес: ${w.toFixed(1)}/${maxW.toFixed(1)} кг  |  Слоты: ${G.slotCount(c)}/${G.INVENTORY_SLOTS}`;
      } else {
        panel._stats.textContent =
          `Уровень ${c.level}  |  Опыт ${c.xp}/${G.xpForNext(c.level)}\n` +
          `Свободные очки: ${c.points}`;
      }

      // Все строки — по кнопке (data-skill): основные и вторичные
      // навыки. Кнопки предметов/торговли (data-act) вне таблицы —
      // пропускаем (у них dataset.skill нет). 000145: c = sheet
      // АКТИВНОГО, S — API по kind (hero: S === G — вывод
      // побайтово как ДО; literals c.skillXp[skill]/S.practiceCap —
      // структурный пин ui-skills).
      panel.querySelectorAll('.cp-btn').forEach((btn) => {
        const skill = btn.dataset.skill;
        if (!skill) return;
        const tr = btn.closest('tr');
        if (!tr) return;
        const nameTd = tr.querySelector('.cp-name');
        const lvTd = tr.querySelector('.cp-level');
        const reqTd = tr.querySelector('.cp-req');
        if (G.PRIMARY_SKILLS.some((p) => p.id === skill)) {
          lvTd.textContent = String(c.primary[skill]);
          btn.disabled = !(haveS && S.canRaise(c, skill).ok);
        } else {
          const s = G.SECONDARY_SKILLS[skill];
          const lvl = c.secondary[skill] || 0;
          nameTd.textContent = lvl > 0 ? `${G.secondaryName(skill, lvl)} (${lvl})` : s.name;
          // Опыт практики: копилка и сколько нужно до следующего
          // уровня (000013).
          const bank = (c.skillXp && c.skillXp[skill]) || 0;
          lvTd.textContent = haveS && bank > 0 && lvl < S.MAX_SKILL_LEVEL
            ? `${lvl} (${bank}/${S.skillXpForNext(lvl)})`
            : String(lvl);
          const cap = haveS ? S.practiceCap(c, skill) : 0;
          if (reqTd) {
            if (haveS && lvl > 0 && lvl < S.MAX_SKILL_LEVEL && lvl >= cap) {
              const pName = ((G.PRIMARY_SKILLS.find((p) => p.id === s.primary) || {}).name) || s.primary;
              reqTd.textContent = 'потолок практикой: ' + pName + ' ' + (cap / 2) + '×2 — дальше растёт только очками и книгами';
            } else {
              reqTd.textContent = lvl > 0 ? '' : requiresText(s);
            }
          }
          btn.disabled = !(haveS && S.canRaise(c, skill).ok);
        }
        // Тултип (000097): пересчёт в том же узле — у вторичных
        // титул зависит от уровня (меняется после прокачки); у
        // основных текст статичен, пересчёт безвреден. Вспышка
        // reason (выше, по кнопке) пишется ТОЛЬКО в .cp-req — в
        // .cp-tip не попадает.
        const tip = tr.querySelector('.cp-tip');
        if (tip) tip.textContent = skillTipText(skill, c);
      });

      // 000145: «Книга заклинаний» (rebuild in place) + «Вдох
      // Эфира» (видна ТОЛЬКО для «Эфира»).
      renderBook(ctx, active);
      if (panel._breathSec) {
        panel._breathSec.style.display = active.kind === 'efir' ? '' : 'none';
        if (active.kind === 'efir' && panel._breath) {
          panel._breath.textContent = breathText();
        }
      }
    },
  };

  return { tab };
});
