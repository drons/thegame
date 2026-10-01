// Вкладка «Квесты» панели персонажа (задача 000130 — разбиение ui.js;
// сама вкладка — задача 000100). ПЕРЕНОСИТСЯ ПЕРВОЙ — демонстрация
// паттерна саморегистрирующейся вкладки (ТЗ 000130).
//
// Чистый UMD-модуль (образец src/cities.js): node — require()
// возвращает определение вкладки + плоский game-экспорт (без
// регистрации); браузер — САМОРЕГИСТРАЦИЯ в Game.uiTabs при загрузке
// (src/ui-tabs.js обязан грузиться ДО этого файла — иначе
// console.error + без регистрации, игра не падает — паттерн 000053).
// При загрузке — НОЛЬ DOM, НОЛЬ require, НОЛЬ RNG.
//
// ПЛОСКИЙ game-экспорт (контракт memory/000130-ui-tabs.md §2,
// прецедент чистых хелперов на Game: G.activeQuests,
// G.refreshBringItems):
//   Game.buildActiveQuestRow — ОДИН рендерер строк «В работе» на
//     диалог NPC (npcUI — с кнопкой «сдать») и на панель (read-only —
//     без кнопок; 000100);
//   Game.findQuestInCatalog — квест по id по всему каталогу (журнал
//     хранит только id).
//
// БЕЗСОСТОЯТЕЛЬНА: живое состояние журнала — closure ядра ui.js
// (G.playerUI.setQuests), чтение — через ctx.quests = { npcs, book }
// (оба null или оба заданы; day НЕ передаётся — в рендере не
// используется, 000100).

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
      console.error('src/ui-tab-quests.js: Game.uiTabs не найден — ' +
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
  // ОДИН снапшот Game (000038): все провайдеры G.* (player/items/
  // buildings/npc/map/skills-data/companions) грузятся ВЫШЕ в
  // index.html — все обращения G.* — при ВЫЗОВЕ, не при загрузке.
  const G = G0 || {};

  // DOM-фабрика строки (строк «В работе» общий рендерер вызывается
  // и из npcUI — там свой el; строка строится независимо от панели).
  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // --- Строки активных квестов: ОДИН рендерер (000100) ---
  // Общий источник строк «В работе» для диалога NPC (npcUI — с
  // кнопкой «сдать») и панели персонажа (read-only — без кнопок):
  // дублирование текстов запрещено (тексты — дословно как в npcUI).
  // Порядок детей строки сохранён как в npcUI: name → [кнопка] → meta
  // (DOM оверлея идентичен).
  function buildActiveQuestRow(quest, instance, c, withTurninButton) {
    const row = el('div', 'cp-itemrow');
    row.appendChild(el('span', 'cp-itemname', quest.название));
    const goal = quest.цель;
    let meta;
    if (goal.тип === 'kill_group') {
      // Имя группы — из каталога (задача 000057); гард —
      // UMD-ловушка «G снимается один раз».
      meta = 'повержено ' + instance.progress + ' из ' + goal.количество +
        ' — ' + ((G.mobGroupName && G.mobGroupName(goal.группа))
          || 'группа ' + goal.группа);
    } else {
      const it = G.getItem(goal.предмет);
      meta = 'предмет: ' + (it ? it.name : goal.предмет) + ' ×' +
        goal.количество + ' (есть: ' + G.totalQty(c, goal.предмет) + ')';
    }
    if (instance.status === 'ready') {
      meta += ' — готов к сдаче';
      if (withTurninButton) {
        const b = el('button', 'cp-btn', 'сдать');
        b.dataset.npcact = 'turnin';
        b.dataset.quest = instance.questId;
        row.appendChild(b);
      }
    } else {
      meta += ' — в работе';
    }
    row.appendChild(el('span', 'cp-itemmeta', meta));
    return row;
  }

  // Квест по id по всему каталогу (журнал хранит только id) — общий
  // для npcUI («Выполнено») и панели (000100).
  function findQuestInCatalog(npcs, qid) {
    for (const n of npcs) {
      const q = (n.квесты || []).find((x) => x.id === qid);
      if (q) return q;
    }
    return null;
  }

  const tab = {
    column: 1,
    id: 'quests',
    label: 'Квесты',
    build(pane, ctx) {
      // Журнал квестов (000100): read-only зеркало; render()
      // обновляет тело in place (панель не пересобирает panes).
      const questsSec = ctx.el('div', 'cp-section', 'Квесты');
      const questsBody = ctx.el('div', 'cp-items');
      questsSec.appendChild(questsBody);
      pane.appendChild(questsSec);
      ctx.panel._questsBody = questsBody;
    },
    render(ctx) {
      const body = ctx.panel._questsBody;
      if (!body) return;
      const c = ctx.character;
      // Вкладка «Квесты» (000100): read-only зеркало журнала.
      // bring_item-квесты сверяем с инвентарем перед отрисовкой
      // (refreshBringItems мутирует book — идемпотентно, тот же
      // паттерн npcUI); записью в сейв из панели НЕ занимается
      // (сейв — только main.js / диалог NPC при обычных
      // сохранениях).
      const q = ctx.quests;
      const book = q.book;
      body.textContent = '';
      if (!book) {
        body.appendChild(ctx.el('div', 'cp-itemmeta',
          'Журнал квестов недоступен.'));
        return;
      }
      if (G.refreshBringItems && q.npcs) {
        G.refreshBringItems(q.npcs, book, c);
      }
      const NPCS = q.npcs || [];

      // «В работе» — общий рендерер строк (ОДИН источник с npcUI),
      // read-only: кнопки «сдать» в панели нет.
      const active = ctx.el('div', 'cp-section', 'В работе');
      const actives = G.activeQuests(NPCS, book);
      if (!actives.length) {
        active.appendChild(ctx.el('div', 'cp-itemmeta',
          'нет активных квестов'));
      }
      for (const { quest, instance } of actives) {
        if (!quest) continue;
        active.appendChild(buildActiveQuestRow(quest, instance, c, false));
      }
      body.appendChild(active);

      // «Выполнено» — счётчик + краткий список названий (id вне
      // каталога — голый id, фолбэк npcUI).
      const done = ctx.el('div', 'cp-section', 'Выполнено');
      if (!book.done.length) {
        done.appendChild(ctx.el('div', 'cp-itemmeta', 'пока ничего'));
      } else {
        done.appendChild(ctx.el('div', 'cp-itemmeta',
          'Выполнено: ' + book.done.length));
        for (const qid of book.done) {
          const found = findQuestInCatalog(NPCS, qid);
          done.appendChild(ctx.el('div', 'cp-itemrow',
            found ? found.название : qid));
        }
      }
      body.appendChild(done);
    },
  };

  return {
    tab,
    game: { buildActiveQuestRow, findQuestInCatalog },
  };
});
