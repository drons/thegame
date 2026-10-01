// Вкладка «Персонаж» панели персонажа (задача 000130 — разбиение
// ui.js): заголовок, статистика, таблицы основных/вторичных навыков
// и тултипы строк навыков (000097 — skillTipCell/requiresText/
// skillTipText переезжают вместе с вкладкой).
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
// buildPanel строится ДО проверки character: fallback '').

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
  // skills-data и др.) грузятся ВЫШЕ в index.html — все обращения
  // G.* — при ВЫЗОВЕ, не при загрузке.
  const G = G0 || {};

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

  const tab = {
    column: 0,
    id: 'character',
    label: 'Персонаж',
    build(pane, ctx) {
      // Заголовок — имя персонажа; render() обновляет его in place
      // (переименование — restoreFromSave). buildPanel строится ДО
      // проверки character (toggle) — null допустим (fallback '').
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
    },
    render(ctx) {
      const panel = ctx.panel;
      const c = ctx.character;
      if (!c) return;
      // Заголовок — имя персонажа (узел собран один раз в buildPanel;
      // переименование — restoreFromSave).
      if (panel._title) panel._title.textContent = c.name;
      const d = G.derived(c);
      const eqA = G.equipmentStats ? G.equipmentStats(c).armor : 0;
      const w = G.inventoryWeight(c);
      const maxW = G.maxCarryWeight(c);
      panel._stats.textContent =
        `Уровень ${c.level}  |  Опыт ${c.xp}/${G.xpForNext(c.level)}\n` +
        `HP ${c.hp}/${d.maxHP}  |  MP ${c.mp}/${d.maxMP}  |  Броня ${d.armor + eqA}\n` +
        `Золото: ${c.gold}  |  Свободные очки: ${c.points}\n` +
        `Вес: ${w.toFixed(1)}/${maxW.toFixed(1)} кг  |  Слоты: ${G.slotCount(c)}/${G.INVENTORY_SLOTS}`;

      // Все строки — по кнопке (data-skill): основные и вторичные
      // навыки. Кнопки предметов/торговли (data-act) вне таблицы —
      // пропускаем (у них dataset.skill нет).
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
          btn.disabled = !G.canRaise(c, skill).ok;
        } else {
          const s = G.SECONDARY_SKILLS[skill];
          const lvl = c.secondary[skill] || 0;
          nameTd.textContent = lvl > 0 ? `${G.secondaryName(skill, lvl)} (${lvl})` : s.name;
          // Опыт практики: копилка и сколько нужно до следующего
          // уровня (000013).
          const bank = (c.skillXp && c.skillXp[skill]) || 0;
          lvTd.textContent = bank > 0 && lvl < G.MAX_SKILL_LEVEL
            ? `${lvl} (${bank}/${G.skillXpForNext(lvl)})`
            : String(lvl);
          const cap = G.practiceCap(c, skill);
          if (reqTd) {
            if (lvl > 0 && lvl < G.MAX_SKILL_LEVEL && lvl >= cap) {
              const pName = ((G.PRIMARY_SKILLS.find((p) => p.id === s.primary) || {}).name) || s.primary;
              reqTd.textContent = 'потолок практикой: ' + pName + ' ' + (cap / 2) + '×2 — дальше растёт только очками и книгами';
            } else {
              reqTd.textContent = lvl > 0 ? '' : requiresText(s);
            }
          }
          btn.disabled = !G.canRaise(c, skill).ok;
        }
        // Тултип (000097): пересчёт в том же узле — у вторичных
        // титул зависит от уровня (меняется после прокачки); у
        // основных текст статичен, пересчёт безвреден. Вспышка
        // reason (выше, по кнопке) пишется ТОЛЬКО в .cp-req — в
        // .cp-tip не попадает.
        const tip = tr.querySelector('.cp-tip');
        if (tip) tip.textContent = skillTipText(skill, c);
      });
    },
  };

  return { tab };
});
