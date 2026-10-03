// Вкладка «Эфир» панели персонажа (задача 000116, подзадача 000035):
// ОТОБРАЖЕНИЕ прокачки Эфира — уровень/XP-копилка, атрибуты,
// пул навыков с практикой «банк/нужно» и пометкой потолка,
// книга заклинаний + таблица открытий, описание «Вдоха Эфира».
// Данные — src/efir.js (000111), порог — G.xpForNext (src/player.js);
// панель READ-ONLY (мутирующих точек НЕТ: reprocessEfirSkills из
// UI не вызывается, практика из панели — не v1, SPEC «Дух Эфира»:
// «очков навыков нет (v1)»).
//
// Чистый UMD-модуль (образец src/ui-tab-skills.js, канон 000130 §2):
// node — require-ветка возвращает определение вкладки (без
// регистрации);
// браузер — САМОРЕГИСТРАЦИЯ в Game.uiTabs при загрузке (src/ui-tabs.js
// обязан грузиться ДО этого файла — иначе console.error + без
// регистрации, игра не падает — паттерн 000053). При загрузке —
// НОЛЬ DOM, НОЛЬ require, НОЛЬ RNG, НОЛЬ console.error (правильный
// порядок). Позиция — ПОСЛЕДНЯЯ (4-я) в левом столбце (контракт
// memory/000116-efir-tab.md §4; позиция тега в index.html).
//
// ЖИВЫЕ данные — ЛЕНИВО rootRef.__game.state.efir в момент render
// (точка, зарезервированная в main.js «для 000086/000116», контракт
// 000086 §5): снапшот G НЕ содержит __game (main.js грузится ПОСЛЕ
// вкладочных модулей — снапшот-ловушка 000038). Мутация live-объекта
// + render() — новые значения в ТЕХ ЖЕ узлах (in place). Деградация
// (__game отсутствует — vm-песочницы без main.js; efir = null) —
// ТИХАЯ: без console.error (полные буты пинят errors === 0),
// заглушка «Данные Эфира недоступны», xp-бар скрыт; секция «Вдох
// Эфира» РЕНДЕРИТСЯ (статичное описание не зависит от live-состояния).
//
// Панель НЕ трогает сейв (сейв — только main.js; паттерн
// 000051/000101). КНОПОК во вкладке НЕТ вообще (ловушка 000098:
// .cp-btn → G.raiseSkill(character, undefined)); .cp-level — класс
// ЯЧЕЙКИ (предписан ТЗ).
//
// Переход из панели «Отряд» (000086) — data-атрибут
// row.dataset.efirtab + click-ветка в src/ui.js squad-IIFE (строка
// Эфира НЕ переделывается — 000086 P3: в ней нет кнопки).
//
// Контракт: memory/000116-efir-tab.md. Тесты: tests/ui-efir.test.js
// (E1–E11).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(null, null);   // node: определение, без
                                            // регистрации
  } else {
    const G0 = typeof root.Game === 'object' ? root.Game : {};
    const m = factory(G0, root);
    const reg = G0.uiTabs;
    if (reg && typeof reg.register === 'function') {
      reg.register(m.tab);
    } else if (root) {
      console.error('src/ui-tab-efir.js: Game.uiTabs не найден — ' +
        'src/ui-tabs.js должен грузиться ДО вкладочных модулей ' +
        '(задача 000130)');
    }
    // «Модуль заменяет Game» (000018/000038): тот же объект-ссылка
    // (мутация in place, не новый объект — 000038-ловушка a3).
    root.Game = Object.assign({}, G0, m.game || {});
  }
})(typeof globalThis !== 'undefined' ? globalThis : self,
function (G0, rootRef) {
  'use strict';
  // ОДИН снапшот Game (000038): все провайдеры G.* (efir/player/
  // skills-data/spells-data) грузятся ВЫШЕ в index.html — все
  // обращения G.* — при ВЫЗОВЕ, не при загрузке.
  const G = G0 || {};

  // «Вдох Эфира» — СТАТИЧЕСКОЕ описание (SPEC «Дух Эфира» → «Бой»,
  // 000035 §7) — данные модуля (паттерн 000053: НЕ каталог),
  // фолбэк до смержа данных 000113.
  const BREATH_FALLBACK =
    '1 раз за бой, авто-триггер на его ходу: игрок ≤ 40% HP и ' +
    'мана Эфира ≥ 20.\n' +
    'Расходует 20 маны и весь ход: лечение всем союзным ' +
    'round(10 + 0.8 * Мудрость);\n' +
    'ослабление всех врагов: их урон ×0.8 на 2 хода.';

  // Данные «Вдоха Эфира» (000113): ЛЕНИВЫЙ read будущего экспорта
  // G.efir.EFIR_BREATH (кандидатное имя; ТОЧКА АДАПТАЦИИ ОДНА —
  // при мерже 000113 сверить имя/форму и заменить). Нет — статичные
  // строки модуля (SPEC — source of truth).
  function breathText() {
    const E = G.efir;
    const B = E ? E.EFIR_BREATH : null;
    if (B && typeof B === 'object') {
      const lines = B.lines || B.текст || B.text;
      if (Array.isArray(lines) && lines.length) return lines.join('\n');
      if (typeof lines === 'string' && lines) return lines;
    }
    return BREATH_FALLBACK;
  }

  // Имя атрибута — из каталога (ОДИН источник — G.PRIMARY_SKILLS:
  // «Интеллект»/«Мудрость»/«Телосложение»); нет — голый id.
  function attrName(id) {
    const p = (Array.isArray(G.PRIMARY_SKILLS)
      ? G.PRIMARY_SKILLS : []).find((x) => x && x.id === id);
    return p && p.name ? p.name : id;
  }

  // Имя навыка — из каталога (G.SECONDARY_SKILLS); нет — голый id.
  function skillName(id) {
    const s = G.SECONDARY_SKILLS ? G.SECONDARY_SKILLS[id] : null;
    return s && s.name ? s.name : id;
  }

  // requires-текст (идиома 000041: «Повелитель огня 5»).
  function requiresText(d) {
    if (!d || !d.requires) return '';
    return skillName(d.requires.skill) + ' ' + d.requires.level;
  }

  // Имя заклинания — из каталога
  // (G.SpellsData.SPELLS_BY_ID[id].название); нет — голый id.
  function spellName(id) {
    const s = (G.SpellsData && G.SpellsData.SPELLS_BY_ID)
      ? G.SpellsData.SPELLS_BY_ID[id] : null;
    return s && s.название ? s.название : id;
  }

  // Тултип строки навыка (идиома skillTipText, 000097): desc +
  // потолок + требование — ТОЛЬКО из каталогов.
  function tipText(d) {
    const s = G.SECONDARY_SKILLS ? G.SECONDARY_SKILLS[d.id] : null;
    const lines = [];
    if (s && s.desc) lines.push(s.desc);
    lines.push('Потолок: ' + attrName(d.primary) + ' × 2');
    lines.push('Требование: ' + (requiresText(d) || '—'));
    return lines.join('\n');
  }

  // Живой объект {level, xp, skillXp, skills, spells} (5 полей,
  // 000111) — ЛЕНИВО rootRef.__game.state.efir (снапшот G НЕ
  // содержит __game — снапшот-ловушка 000038). Валидация формы
  // 000111: не объект / level не int ≥ 1 → null (тихая деградация).
  function efirState() {
    const gs = (rootRef && rootRef.__game && rootRef.__game.state)
      ? rootRef.__game.state : null;
    const e = gs ? gs.efir : null;
    if (!e || typeof e !== 'object' || Array.isArray(e)) return null;
    if (!Number.isInteger(e.level) || e.level < 1) return null;
    return e;
  }

  // «с уровня N» строки книги: старт (efirSpellsByLevel(1) —
  // [spark, mend]) → 1; unlock — порог таблицы EFIR_SPELL_UNLOCKS;
  // id вне таблицы → null (строка БЕЗ суффикса).
  function bookLevel(E, id) {
    const t = (Array.isArray(E.EFIR_SPELL_UNLOCKS)
      ? E.EFIR_SPELL_UNLOCKS : [])
      .find((u) => u && u[1] === id);
    if (t) return t[0];
    if (typeof E.efirSpellsByLevel === 'function') {
      const start = E.efirSpellsByLevel(1);
      if (Array.isArray(start) && start.indexOf(id) >= 0) return 1;
    }
    return null;
  }

  const tab = {
    column: 0,
    id: 'efir',
    label: 'Эфир',
    // СКОЛЕТ (ОДИН раз в buildPanel): заголовок, XP-строка/бар,
    // «Атрибуты» (5 строк), «Навыки» (таблица пула), «Книга
    // заклинаний» (тело render'ится in place), «Открытия» (статичная
    // таблица — пороги не меняются), «Вдох Эфира» (описание).
    build(pane, ctx) {
      const P = ctx.panel;

      // Заголовок + строка уровня/XP (идиома 000041/000130: ДВА
      // пробела по бокам |) + xp-бар (идиома 000081/000086).
      P._efirTitle = ctx.el('div', 'cp-title', 'Эфир');
      pane.appendChild(P._efirTitle);
      P._efirXpText = ctx.el('div', 'cp-stats', '');
      pane.appendChild(P._efirXpText);
      P._efirXpBar = ctx.el('div', 'squad-xp');
      P._efirXpFill = ctx.el('div', 'squad-xp-fill');
      P._efirXpFill.style.width = '0%';
      P._efirXpBar.appendChild(P._efirXpFill);
      pane.appendChild(P._efirXpBar);

      // «Атрибуты» — 5 строк (render: efirStats(level); имена —
      // из каталога, один источник G.PRIMARY_SKILLS).
      const attrs = ctx.el('div', 'cp-section', 'Атрибуты');
      const mkAttr = (name) => {
        const row = ctx.el('div', 'cp-itemrow');
        row.appendChild(ctx.el('span', 'cp-itemname', name));
        const meta = ctx.el('span', 'cp-itemmeta', '—');
        row.appendChild(meta);
        attrs.appendChild(row);
        return meta;
      };
      P._efirAttrInt = mkAttr(attrName('intelligence'));
      P._efirAttrWis = mkAttr(attrName('wisdom'));
      P._efirAttrCon = mkAttr(attrName('constitution'));
      P._efirAttrHp = mkAttr('maxHP');
      P._efirAttrMp = mkAttr('maxMP');
      pane.appendChild(attrs);

      // «Навыки» — пул (G.efir.EFIR_SKILLS, порядок зависимый):
      // имя (СТАТИЧНО, из каталога — ранги/титулы не требуются),
      // .cp-req (requires-цепочки / пометка потолка — render),
      // .cp-level «lvl (банк/нужно)» (render; ТЗ), .cp-tip
      // (идиома 000097: ядро панели само подсвечивает tip по
      // клику на tr). КНОПОК НЕТ (v1 read-only — ловушка 000098).
      const skills = ctx.el('div', 'cp-section', 'Навыки');
      const table = ctx.el('table', 'cp-table');
      for (const d of (G.efir && Array.isArray(G.efir.EFIR_SKILLS)
        ? G.efir.EFIR_SKILLS : [])) {
        const tr = ctx.el('tr');
        tr.appendChild(ctx.el('td', 'cp-name', skillName(d.id)));
        const req = ctx.el('td', 'cp-req', '');
        tr.appendChild(req);
        const lv = ctx.el('td', 'cp-level', '—');
        tr.appendChild(lv);
        const tipcell = ctx.el('td', 'cp-tipcell');
        const tip = ctx.el('div', 'cp-tip', '');
        tipcell.appendChild(tip);
        tr.appendChild(tipcell);
        table.appendChild(tr);
        P['_efirRow_' + d.id] = tr;
        P['_efirReq_' + d.id] = req;
        P['_efirLvl_' + d.id] = lv;
        P['_efirTip_' + d.id] = tip;
      }
      skills.appendChild(table);
      pane.appendChild(skills);

      // «Книга заклинаний» — строки по state.spells (render: in
      // place; пустая/нет — строка «—»).
      const bookSec = ctx.el('div', 'cp-section', 'Книга заклинаний');
      P._efirBook = ctx.el('div', 'cp-items');
      bookSec.appendChild(P._efirBook);
      pane.appendChild(bookSec);

      // «Открытия» — СТАТИЧЕСКАЯ таблица EFIR_SPELL_UNLOCKS
      // (build ОДИН раз: 8 строк «название — уровень N», порядок
      // канонический).
      const unSec = ctx.el('div', 'cp-section', 'Открытия');
      P._efirUnlocks = ctx.el('div', 'cp-items');
      for (const u of (G.efir && Array.isArray(G.efir.EFIR_SPELL_UNLOCKS)
        ? G.efir.EFIR_SPELL_UNLOCKS : [])) {
        const row = ctx.el('div', 'cp-itemrow');
        row.appendChild(ctx.el('span', 'cp-itemname',
          u ? spellName(u[1]) : ''));
        row.appendChild(ctx.el('span', 'cp-itemmeta',
          u ? 'уровень ' + u[0] : ''));
        P._efirUnlocks.appendChild(row);
      }
      unSec.appendChild(P._efirUnlocks);
      pane.appendChild(unSec);

      // «Вдох Эфира» — описание (render: ВСЕГДА; данные 000113 —
      // ленивый read — или статичный SPEC-фолбэк).
      const brSec = ctx.el('div', 'cp-section', 'Вдох Эфира');
      P._efirBreath = ctx.el('div', 'cp-stats', '');
      brSec.appendChild(P._efirBreath);
      pane.appendChild(brSec);
    },
    // КАЖДЫЙ render(), in place (скрытые pane тоже); read-only.
    render(ctx) {
      const P = ctx.panel;
      if (!P || !P._efirXpText) return; // панель не построена — no-op
      // «Вдох Эфира» — ВСЕГДА (описание не зависит от live-состояния;
      // в деградации тоже).
      P._efirBreath.textContent = breathText();
      const e = efirState();
      const E = G.efir;
      if (!e || !E) {
        // ТИХАЯ деградация (vm-песочницы без main.js; efir = null):
        // без console.error — полные буты пинят errors === 0.
        P._efirXpText.textContent = 'Данные Эфира недоступны';
        P._efirXpBar.style.display = 'none';
        P._efirXpFill.style.width = '0%';
        P._efirAttrInt.textContent = '—';
        P._efirAttrWis.textContent = '—';
        P._efirAttrCon.textContent = '—';
        P._efirAttrHp.textContent = '—';
        P._efirAttrMp.textContent = '—';
        for (const d of (E && Array.isArray(E.EFIR_SKILLS)
          ? E.EFIR_SKILLS : [])) {
          P['_efirLvl_' + d.id].textContent = '0';
          P['_efirReq_' + d.id].textContent = '';
          P['_efirTip_' + d.id].textContent = tipText(d);
        }
        P._efirBook.textContent = '';
        const row = ctx.el('div', 'cp-itemrow');
        row.appendChild(ctx.el('span', 'cp-itemname', '—'));
        P._efirBook.appendChild(row);
        return;
      }
      // 1. Уровень/XP (порог G.xpForNext — лениво, typeof-гард;
      // не finite/≤0 — уровень без XP-части, бар скрыт).
      const lv = e.level;
      const xp = (typeof e.xp === 'number' && Number.isFinite(e.xp)
        && e.xp >= 0) ? e.xp : 0;
      const need = (typeof G.xpForNext === 'function')
        ? G.xpForNext(lv) : null;
      if (typeof need === 'number' && Number.isFinite(need)
          && need > 0) {
        P._efirXpText.textContent =
          'Уровень ' + lv + '  |  Опыт ' + xp + '/' + need;
        P._efirXpBar.style.display = '';
        P._efirXpFill.style.width =
          Math.min(100, Math.max(0, Math.round(xp / need * 100))) + '%';
      } else {
        P._efirXpText.textContent = 'Уровень ' + lv;
        P._efirXpBar.style.display = 'none';
      }
      // 2. Атрибуты — G.efir.efirStats(level) (чистая функция).
      const st = (typeof E.efirStats === 'function')
        ? E.efirStats(lv) : null;
      P._efirAttrInt.textContent = st ? String(st.intelligence) : '—';
      P._efirAttrWis.textContent = st ? String(st.wisdom) : '—';
      P._efirAttrCon.textContent = st ? String(st.constitution) : '—';
      P._efirAttrHp.textContent = st ? String(st.maxHP) : '—';
      P._efirAttrMp.textContent = st ? String(st.maxMP) : '—';
      // 3. Пул: .cp-level «lvl (банк/нужно)» — паттерн 000041:
      // скобки ТОЛЬКО при bank > 0 и ниже потолка (000117 не
      // смержена — skillXp = {} — bank 0 — НОРМАЛЬНАЯ деградация:
      // просто «lvl»); .cp-req — потолок (lvl ≥ cap) иначе
      // requires (lvl = 0); .cp-tip — desc + потолок + требование.
      for (const d of (Array.isArray(E.EFIR_SKILLS) ? E.EFIR_SKILLS : [])) {
        const lvl = (e.skills && e.skills[d.id]) || 0;
        const bank = (e.skillXp && e.skillXp[d.id]) || 0;
        const cap = (typeof E.efirSkillCap === 'function')
          ? E.efirSkillCap(e, d.id) : 0;
        const needSk = (typeof E.efirSkillXpForNext === 'function')
          ? E.efirSkillXpForNext(lvl) : null;
        P['_efirLvl_' + d.id].textContent =
          (bank > 0 && cap > 0 && lvl < cap &&
           typeof needSk === 'number' && needSk > 0)
            ? lvl + ' (' + bank + '/' + needSk + ')'
            : String(lvl);
        P['_efirReq_' + d.id].textContent =
          (cap > 0 && lvl > 0 && lvl >= cap)
            ? 'потолок практикой: ' + attrName(d.primary) + ' ' +
              (cap / 2) + '×2 — растёт с уровнем Эфира'
            : (lvl === 0 && d.requires ? requiresText(d) : '');
        P['_efirTip_' + d.id].textContent = tipText(d);
      }
      // 4. Книга — state.spells (in place: textContent '' сбрасывает
      // детей — семантика DOM).
      const book = P._efirBook;
      book.textContent = '';
      const spells = Array.isArray(e.spells) ? e.spells : [];
      if (spells.length === 0) {
        const row = ctx.el('div', 'cp-itemrow');
        row.appendChild(ctx.el('span', 'cp-itemname', '—'));
        book.appendChild(row);
      }
      for (const id of spells) {
        if (typeof id !== 'string') continue;
        const row = ctx.el('div', 'cp-itemrow');
        row.appendChild(ctx.el('span', 'cp-itemname', spellName(id)));
        const n = bookLevel(E, id);
        if (n != null) {
          row.appendChild(ctx.el('span', 'cp-itemmeta',
            'с уровня ' + n));
        }
        book.appendChild(row);
      }
    },
  };

  return { tab };
});
