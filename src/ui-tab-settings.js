// Вкладка «Игровые настройки» панели персонажа (задача 000130 —
// разбиение ui.js; 000098 — форма).
//
// ФОРМА по SETTINGS + META (единый источник — src/global-settings.js):
// строка на каждый скалярный ключ (label + input[type=number]/select +
// «сброс»), секции на вложенные ключи (шапка + строки на листья),
// «Сбросить всё». ФОРМА Собирается ОДИН раз в build(pane, ctx) —
// render-хука НЕТ (живость focus: введённое значение и узлы переживают
// render()). apply — по 'change' СВОИХ input'ов (слушатели на ПАНЕ,
// НЕ на панели — пин panel.listeners.click.length === 1 intact);
// значение проходит GS.clampValue и пишется в ЖИВОЙ SETTINGS (ссылка
// не меняется, мутация in place). Заметки — в ЕДИНЫЙ ядровой
// .cp-notice (ленивый querySelector в момент события: ядро создаёт его
// ПОСЛЕ столбцов) + локальный мини-flash. Session-only: в сейв НЕ
// пишутся (решение ТЗ 000098; персистентность — отдельная задача).
//
// Классы формы — ТОЛЬКО .cp-set* (ловушки: .cp-btn без data-act →
// делегированный click ядра → raiseSkill(character, undefined) —
// «сброс» стал бы «прокачкой навыка»; .cp-itemrow/tr → ветка
// flashNotice(tip)).
//
// Чистый UMD-модуль (образец src/cities.js): node — require()
// возвращает определение вкладки (без регистрации); браузер —
// САМОРЕГИСТРАЦИЯ в Game.uiTabs при загрузке (src/ui-tabs.js обязан
// грузиться ДО этого файла — иначе console.error + без регистрации,
// игра не падает — паттерн 000053). При загрузке — НОЛЬ DOM, НОЛЬ
// require, НОЛЬ RNG, НОЛЬ console.error, НОЛЬ мутаций SETTINGS
// (GlobalSettings — снапшот G0 при загрузке ДОСТАТОЧЕН: объект общий
// по ССЫЛКЕ; guard отсутствия — ТОЛЬКО в build, не при загрузке).

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
      console.error('src/ui-tab-settings.js: Game.uiTabs не найден — ' +
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

  const tab = {
    column: 0,
    id: 'settings',
    label: 'Игровые настройки',
    build(pane, ctx) {
      // Guard — ТОЛЬКО в build (не при загрузке: load-чистота).
      // Лениво: (rootRef.Game) — текущий Game (после ui.js), G0 —
      // снапшот (GlobalSettings общий по ссылке — достаточен).
      const live = (rootRef && rootRef.Game) || G0 || {};
      const GS = live.GlobalSettings;
      if (!GS || !GS.SETTINGS || !GS.META || !GS.DEFAULTS ||
          typeof GS.clampValue !== 'function' ||
          typeof GS.resetKey !== 'function' ||
          typeof GS.resetAll !== 'function') {
        console.error('src/ui-tab-settings.js: Game.GlobalSettings ' +
          'не найден — src/global-settings.js обязан грузиться ДО ' +
          'вкладочных модулей (задача 000098); вкладка недоступна');
        pane.appendChild(ctx.el('div', 'cp-section', 'Игровые настройки'));
        pane.appendChild(ctx.el('div', 'cp-itemmeta', 'Настройки недоступны'));
        return;
      }
      const S = GS.SETTINGS;
      pane.appendChild(ctx.el('div', 'cp-section', 'Игровые настройки'));
      const body = ctx.el('div', 'cp-set');
      pane.appendChild(body);
      ctx.panel._settingsBody = body;   // своё имя (чужие _* не трогаем)

      // Все контролы (input/select) с dataset.key — для refresh после
      // сброса (пересборка ЗНАЧЕНИЙ, не формы).
      const controls = [];
      let noticeTimer = null;

      // Заметка — ЛЕНИВО в момент события (ядро создаёт .cp-notice в
      // buildPanel ПОСЛЕ столбцов — на момент build её нет) + локальный
      // мини-flash (flashNotice в ctx НЕ идёт — контракт 000130 §4.3).
      // Guard null-узла: значение всё равно применяется, заметка
      // пропускается.
      function note(msg) {
        if (!msg) return;
        const n = ctx.panel.querySelector('.cp-notice');
        if (!n) return;
        n.textContent = msg;
        n.style.opacity = '1';
        if (noticeTimer) clearTimeout(noticeTimer);
        noticeTimer = setTimeout(() => { n.style.opacity = '0'; }, 2500);
      }

      function valOf(p) {
        let v = S;
        for (const k of p.split('.')) {
          if (v == null || typeof v !== 'object') return undefined;
          v = v[k];
        }
        return v;
      }
      function put(p, value) {
        const segs = p.split('.');
        const leaf = segs.pop();
        let o = S;
        for (const k of segs) {
          if (o == null || typeof o !== 'object') return;
          o = o[k];
        }
        if (o != null && typeof o === 'object') o[leaf] = value;
      }

      // Явная запись META или generic (правила 000098 §2.1; metaFor
      // ядра — внутренний, правила дублируются локально: число →
      // int/float min 1, строка → enum [текущее], объект → nested по
      // скалярным листьям, массив → 'plain').
      function genericRec(value) {
        if (typeof value === 'number') {
          return { label: '',
            type: Number.isInteger(value) ? 'int' : 'float', min: 1 };
        }
        if (typeof value === 'string') {
          return { label: '', type: 'enum', options: [value] };
        }
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const sub = {};
          for (const k of Object.keys(value)) {
            const v = value[k];
            if (typeof v === 'number' || typeof v === 'string' ||
                (v && typeof v === 'object' && !Array.isArray(v))) {
              sub[k] = genericRec(v);
            }
          }
          return { label: '', type: 'nested', subkeys: sub };
        }
        return { label: '', type: 'plain' };
      }
      function recFor(p) {
        const segs = p.split('.');
        let rec = GS.META && GS.META[segs[0]] ? GS.META[segs[0]] : null;
        for (let i = 1; i < segs.length && rec; i++) {
          if (rec.subkeys && rec.subkeys[segs[i]]) {
            rec = rec.subkeys[segs[i]];
          } else {
            rec = genericRec(valOf(p));
            break;
          }
        }
        return rec || genericRec(valOf(p));
      }

      // enum: options — имя ключа SETTINGS (LIVE-ключи) или статический
      // массив. Текущее значение вне options — option добавляется
      // (деградация без краха).
      function enumOptions(rec) {
        if (typeof rec.options === 'string') {
          const src = S[rec.options];
          if (src && typeof src === 'object' && !Array.isArray(src)) {
            return Object.keys(src);
          }
          return [];
        }
        if (Array.isArray(rec.options)) return rec.options;
        return [];
      }
      function optionLabel(rec, name) {
        if (typeof rec.options === 'string' && GS.META[rec.options] &&
            GS.META[rec.options].subkeys &&
            typeof GS.META[rec.options].subkeys[name] === 'object' &&
            typeof GS.META[rec.options].subkeys[name].label === 'string') {
          return GS.META[rec.options].subkeys[name].label;
        }
        return name;
      }

      // --- Сборка строк (классы ТОЛЬКО .cp-set*) ---

      function makeRow(cls) { return ctx.el('div', cls || 'cp-setrow'); }
      function makeLabel(text) { return ctx.el('span', 'cp-setlabel', text); }
      function makeReset(key, extraCls) {
        const b = ctx.el('button',
          'cp-setbtn' + (extraCls ? ' ' + extraCls : ''), 'сброс');
        if (key != null) b.dataset.key = key;
        return b;
      }
      function makeControl(rec, p) {
        let el;
        if (rec.type === 'enum') {
          el = ctx.el('select', 'cp-setinput');
          const opts = enumOptions(rec);
          const cur = String(valOf(p));
          for (const o of opts) {
            const op = ctx.el('option');
            op.value = o;
            op.textContent = optionLabel(rec, o);
            el.appendChild(op);
          }
          if (opts.indexOf(cur) < 0) {
            const op = ctx.el('option');   // деградация: текущего нет
            op.value = cur;                // в options — option
            op.textContent = cur;          // добавляется, без краха
            el.appendChild(op);
          }
          el.value = cur;
        } else {
          el = ctx.el('input', 'cp-setinput');
          el.type = 'number';
          el.step = String(rec.step != null
            ? rec.step : (rec.type === 'int' ? 1 : 0.01));
          el.value = String(valOf(p));
        }
        el.dataset.key = p;                // dot-path (топ или лист)
        controls.push(el);
        return el;
      }
      function controlRow(p, rec, label) {
        const r = makeRow();
        r.appendChild(makeLabel(label));
        r.appendChild(makeControl(rec, p));
        r.appendChild(makeReset(p));
        body.appendChild(r);
      }
      // Вложенный: строки на скалярные ЛИСТЬЯ (label — конкатенация
      // label'ов по пути: «Лёгкая · HP»); не-скалярные листья (массивы
      // — напр. city_channel.type_shares, решение D4) — вне формы.
      function walkNested(rec, pathParts, labelParts) {
        const subs = rec.subkeys || {};
        for (const name of Object.keys(subs)) {
          const sub = subs[name];
          const pp = pathParts.concat([name]);
          const pl = labelParts.concat([sub.label || name]);
          if (sub.type === 'nested' && sub.subkeys) {
            walkNested(sub, pp, pl);
          } else if (sub.type === 'int' || sub.type === 'float' ||
                     sub.type === 'enum') {
            controlRow(pp.join('.'), sub, pl.join(' · '));
          }
        }
      }

      // Генерация из Object.keys(SETTINGS) (порядок ВСТАВКИ) + META —
      // будущие ключи подхватываются автоматически (generic).
      const keys = Object.keys(S);
      let i = 0;
      while (i < keys.length) {
        const k = keys[i];
        const rec = recFor(k);
        if (rec.group) {
          // СОСЕДНИЕ ключи с одинаковым непустым group → ОДИН
          // подзаголовок («Сложности боя» = select combat_difficulty +
          // 6 листьев combat_difficulties под одной шапкой).
          const members = [k];
          let j = i + 1;
          while (j < keys.length && recFor(keys[j]).group === rec.group) {
            members.push(keys[j]);
            j++;
          }
          const head = makeRow('cp-setrow cp-sethead');
          head.appendChild(makeLabel(rec.group));
          // «сброс» на шапке — ОБЪЕКТ nested-ключа группы целиком.
          const nk = members.find((x) => {
            const r = recFor(x);
            return r.type === 'nested' && r.subkeys;
          });
          if (nk) head.appendChild(makeReset(nk));
          body.appendChild(head);
          for (const x of members) {
            const r = recFor(x);
            if (r.type === 'nested' && r.subkeys) {
              walkNested(r, [x], []);     // своя шапка = шапка группы
            } else if (r.type === 'int' || r.type === 'float' ||
                       r.type === 'enum') {
              controlRow(x, r, r.label || x);
            }
          }
          i = j;
        } else if (rec.type === 'nested' && rec.subkeys) {
          // nested БЕЗ группы — шапка со СВОИМ label + «сброс» объекта
          const head = makeRow('cp-setrow cp-sethead');
          head.appendChild(makeLabel(rec.label || k));
          head.appendChild(makeReset(k));
          body.appendChild(head);
          walkNested(rec, [k], []);
          i++;
        } else if (rec.type === 'int' || rec.type === 'float' ||
                   rec.type === 'enum') {
          controlRow(k, rec, rec.label || k);
          i++;
        } else {
          // 'plain' (массив и пр.) — label-строка + сброс объекта
          // (скалярного представления нет).
          const r = makeRow();
          r.appendChild(makeLabel(rec.label || k));
          r.appendChild(makeReset(k));
          body.appendChild(r);
          i++;
        }
      }

      // «Сбросить всё» — в DEFAULTS (вложенные целиком).
      const bAll = ctx.el('button', 'cp-setbtn cp-setall', 'Сбросить всё');
      bAll.dataset.all = 'all';
      body.appendChild(bAll);

      // --- Apply (слушатели НА ПАНЕ, не на панели) ---

      function refreshKey(key) {
        for (const el of controls) {
          const q = el.dataset.key;
          if (q === key || q.indexOf(key + '.') === 0) {
            el.value = String(valOf(q));
          }
        }
      }
      function refreshAll() {
        for (const el of controls) {
          el.value = String(valOf(el.dataset.key));
        }
      }
      // ЛЕНИВО в момент вызова: ui.js грузится ПОЗЖЕ вкладочных
      // модулей → в снапшоте G0 playerUI НЕТ (ловушка 000038).
      function renderIfAvailable() {
        const live2 = (rootRef && rootRef.Game) || G0 || {};
        if (live2.playerUI && typeof live2.playerUI.render === 'function') {
          live2.playerUI.render();
        }
      }

      // apply по 'change' (НЕ input — ТЗ): кламп/валидация → живой
      // SETTINGS (ссылка НЕ меняется); мусор — restore + заметка.
      pane.addEventListener('change', (e) => {
        const t = e.target;
        if (!t || !t.dataset || typeof t.dataset.key !== 'string') return;
        const key = t.dataset.key;
        const r = GS.clampValue(key, t.value);
        if (r.ok) {
          put(key, r.value);
          t.value = String(r.value);   // нормализация клампом
          if (r.clamped) {
            note(key + ' = ' + r.value +
              ' — значение скорректировано по допустимым границам');
          }
        } else {
          t.value = String(valOf(key));  // восстановление
          note(r.reason);
        }
      });

      // Кнопки сброса (свои pane-слушатели; делегированный click
      // панели .cp-setbtn НЕ обрабатывает — классы .cp-set*).
      pane.addEventListener('click', (e) => {
        const t = e.target;
        if (!t || typeof t.closest !== 'function') return;
        const b = t.closest('.cp-setbtn');
        if (!b || !b.dataset) return;
        if (b.dataset.all) {
          GS.resetAll();
          refreshAll();
          renderIfAvailable();   // render — только у «сбросить всё»
        } else if (typeof b.dataset.key === 'string') {
          GS.resetKey(b.dataset.key);
          refreshKey(b.dataset.key);
          // render() НЕ зовётся (ТЗ: render — только у «сбросить
          // всё»); форма живёт.
        }
      });
    },
  };

  return { tab };
});
