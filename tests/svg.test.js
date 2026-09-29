// Задача 000120: XML-схема ВСЕХ SVG-ассетов (defect-fix от 000062).
//
// Сломанный SVG браузер не грузит как картинку — спрайт молча
// исчезает в игре, и npm test (до этой задачи) на SVG не смотрел:
// 29 файлов assets/sprites/mobs/ (баг генератора 000062) живущие
// в каталоге: 25 — невалидный XML, 4 — NaN в атрибутах.
//
// Что проверяет этот тест (ноль npm-зависимостей, как весь проект):
//  * обход ВСЕХ assets/**/*.svg (271 файл: tiles 12, combat/bg 11,
//    dungeon 21 (floor 15 + walls 6 — 000070), sprites 226, logo.svg 1);
//  * XML well-formedness — минимальный парсер ограниченного
//    SVG-подмножества, реально встречающегося в ассетах: теги с
//    атрибутами name="value" (двойные ИЛИ одинарные кавычки; значение
//    может содержать другую кавычку — см. logo.svg), самозакрытие />,
//    пары открытие/закрытие, текстовый контент, комментарии <!-- -->,
//    <?xml?>. DOCTYPE/CDATA/сущностей &…; в ассетах НЕТ — парсер
//    строгий: «&» в тексте, DOCTYPE и неэкранированный «<» в комментарии
//    — ошибки. При ошибке — путь файла + строка/колонка;
//  * структурная схема: корневой элемент <svg>;
//    xmlns="http://www.w3.org/2000/svg"; есть viewBox (или width/height);
//    viewBox — ровно 4 конечных числа (нетокенный разбор Number(),
//    не regex);
//  * значения атрибутов (во ВСЕХ элементах): без NaN/Infinity
//    (case-insensitive, токеном значения), без пустых значений.
//
// ЗАДОКУМЕНТИРОВАННОЕ ИСКЛЮЧЕНИЕ: transform="" (пустая строка) —
// легальный identity-трансформ; 4 ЧИСТЫХ кадра salamander_move_1/2,
// attack_1/2 его содержат. Иное пустое значение (fill="" и т.п.) —
// ошибка. Исключение зафиксировано в memory/000120-svg-schema.md.
//
// ЧТО НАМЕРЕННО НЕ ПРОВЕРЯЕТСЯ ЗДЕСЬ:
//  * размеры viewBox по каталогам (tiles 64×64, моб 100·w×100·h…) —
//    мобы уже закреплены tests/mob-art.test.js (regex-сканер +
//    100·w×100·h), единого источника правды для остальных каталогов
//    нет → таблица = риск ложных срабатываний. Решение: в memory;
//  * запрещённые теги мобов (SMIL/<text>/href/foreignObject),
//    палитры HEX, тень, префиксы id — только mob-art.test.js.
//    logo.svg легально «тяжёлый» (SMIL <animate>, <text>,
//    xlink:href+href, xmlns:xlink) — общий парсер обязан его
//    переварить, а НЕ запрещать такие теги.
//
// Красная фаза (до ремонта 29 файлов): обход-тест красный именно на
// 29 путях (25 well-formedness + 4 NaN), остальные 236 — чистые.

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const ROOT = path.join(__dirname, '..');

// --- Парсер XML-подмножества (well-formedness) ---
//
// Возвращает { errors: [{line, col, message}], elements, root }.
// elements — все открытые элементы (для проверки значений атрибутов),
// даже в файлах с синтаксическими ошибками (сколько успел распарсить).

const NAME_RE = /^[A-Za-z_:][A-Za-z0-9_:.\-]*/;
const WS_RE = /[ \t\r\n]/;

// Таблица «позиция → строка/колонка» (строки 1-based, колонки 1-based).
function makePosOf(text) {
  const starts = [0];
  for (let k = 0; k < text.length; k++) if (text[k] === '\n') starts.push(k + 1);
  return function posOf(p) {
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (starts[mid] <= p) lo = mid; else hi = mid - 1;
    }
    return { line: lo + 1, col: p - starts[lo] + 1 };
  };
}

function parseSvgXml(text, posOf) {
  const errors = [];
  const elements = [];
  const stack = [];
  let root = null;
  let rootClosed = false;
  const err = (p, message) => {
    const { line, col } = posOf(Math.min(Math.max(p, 0), Math.max(text.length - 1, 0)));
    errors.push({ line, col, message });
  };
  const n = text.length;
  let i = 0;

  const skipWs = (from) => {
    let k = from;
    while (k < n && WS_RE.test(text[k])) k++;
    return k;
  };
  // Резинхронизация после синтаксической ошибки внутри тега: до
  // следующего «>» (ошибка уже записана — файл красный, дальше
  // сканируем, чтобы поймать и другие дефекты того же файла).
  const resyncToGt = (from) => {
    const g = text.indexOf('>', from);
    return g === -1 ? -1 : g;
  };

  while (i < n) {
    i = skipWs(i);
    if (i >= n) break;

    if (rootClosed) {
      err(i, 'содержимое после закрытия корневого элемента (после </svg> допустимы только пробельные символы)');
      break;
    }

    if (text[i] !== '<') {
      // Текстовый контент (<title>, <text>, <textPath> — в logo.svg).
      // В ассетах текст не содержит «<» и «&» — парсер строгий.
      const lt = text.indexOf('<', i);
      const segment = lt === -1 ? text.slice(i) : text.slice(i, lt);
      if (!root && segment.trim() !== '') {
        err(i, 'текст до корневого элемента (XML: допустимы только BOM/WS/комментарий/PI)');
      }
      if (segment.includes('&')) {
        err(i, 'неэкранированный «&» в тексте (сущности &…; в подмножестве ассетов запрещены)');
      }
      i = lt === -1 ? n : lt;
      continue;
    }

    if (text.startsWith('<!--', i)) {
      const end = text.indexOf('-->', i + 4);
      if (end === -1) { err(i, 'комментарий <!-- не закрыт'); break; }
      if (text.slice(i + 4, end).includes('<')) {
        err(i, 'комментарий <!-- ... --> содержит «<» (недопустимо в XML)');
      }
      i = end + 3;
      continue;
    }

    if (text.startsWith('<?', i)) {
      const end = text.indexOf('?>', i + 2);
      if (end === -1) { err(i, 'обработка <?...?> не закрыта'); break; }
      i = end + 2;
      continue;
    }

    if (text.startsWith('<!', i)) {
      err(i, 'неожиданный «<!» (DOCTYPE/CDATA запрещены в подмножестве ассетов)');
      const g = resyncToGt(i + 2);
      if (g === -1) break;
      i = g + 1;
      continue;
    }

    if (text[i + 1] === '/') {
      // Закрывающий тег.
      const cpos = i + 2;
      const m = NAME_RE.exec(text.slice(cpos));
      if (!m) {
        err(cpos, 'закрывающий тег без имени');
        const g = resyncToGt(cpos);
        if (g === -1) break;
        i = g + 1;
        continue;
      }
      const name = m[0];
      const k = skipWs(cpos + name.length);
      if (text[k] !== '>') {
        err(k, `закрывающий тег </${name}> не закрыт знаком ">"`);
        const g = resyncToGt(k);
        if (g === -1) break;
        i = g + 1;
        continue;
      }
      const top = stack[stack.length - 1];
      if (!top) {
        err(i, `закрывающий тег </${name}> — нечего закрывать (нет открытых элементов)`);
      } else if (top.name !== name) {
        err(i, `</${name}> не совпадает с открытым <${top.name}>`);
        // Резинхронизация: откатить до совпадения, если оно есть.
        for (let s = stack.length - 1; s >= 0; s--) {
          if (stack[s].name === name) { stack.length = s; break; }
        }
      } else {
        stack.pop();
      }
      if (!stack.length && root && !root.selfClosing) rootClosed = true;
      i = k + 1;
      continue;
    }

    // Открывающий тег.
    const openAt = i;
    const m = NAME_RE.exec(text.slice(i + 1));
    if (!m) {
      err(i + 1, 'тег без имени');
      const g = resyncToGt(i + 1);
      if (g === -1) break;
      i = g + 1;
      continue;
    }
    const name = m[0];
    const attrs = [];
    const seen = new Set();
    let selfClosing = false;
    let k = i + 1 + name.length;

    for (;;) {
      k = skipWs(k);
      if (k >= n) { err(openAt, `тег <${name}> не закрыт (конец файла)`); i = n; break; }
      const c = text[k];

      if (c === '>') { i = k + 1; break; }

      if (c === '/') {
        if (text[k + 1] === '>') { selfClosing = true; i = k + 2; break; }
        err(k, `тег <${name}>: лишняя «/» (ожидалось имя атрибута или "/>")`);
        const g = resyncToGt(k + 1);
        if (g === -1) { err(openAt, `тег <${name}> не закрыт (конец файла)`); i = n; break; }
        // Резинхронизация на «/» + «>» — тег всё-таки самозакрылся:
        // не оставляем его «открытым» в стеке (нет каскадных ошибок).
        selfClosing = text[g - 1] === '/';
        i = g + 1; break;
      }

      if (c === '"' || c === "'") {
        err(k, `тег <${name}>: кавычка без имени атрибута (сломанный атрибут)`);
        const g = resyncToGt(k + 1);
        if (g === -1) { err(openAt, `тег <${name}> не закрыт (конец файла)`); i = n; break; }
        // Резинхронизация на «/» + «>» — тег всё-таки самозакрылся:
        // не оставляем его «открытым» в стеке (нет каскадных ошибок).
        selfClosing = text[g - 1] === '/';
        i = g + 1; break;
      }

      const nm = NAME_RE.exec(text.slice(k));
      if (!nm) {
        // Лишний токен: «0.8» после склеенных кавычек (паттерн 1 из
        // 000062), «1.4» перед "/>" (паттерн 2), мусор и т.п.
        const bad = text.slice(k, k + 16).replace(/\s+/g, ' ').trim();
        err(k, `тег <${name}>: лишний токен «${bad}» (ожидалось имя атрибута или "/>")`);
        const g = resyncToGt(k + 1);
        if (g === -1) { err(openAt, `тег <${name}> не закрыт (конец файла)`); i = n; break; }
        // Резинхронизация на «/» + «>» — тег всё-таки самозакрылся:
        // не оставляем его «открытым» в стеке (нет каскадных ошибок).
        selfClosing = text[g - 1] === '/';
        i = g + 1; break;
      }

      const aname = nm[0];
      let a2 = skipWs(k + aname.length);
      if (text[a2] !== '=') {
        err(a2, `тег <${name}>: атрибут "${aname}" без значения (подмножество: только name="value")`);
        k = a2; // дальше — либо конец тега, либо следующий атрибут
        continue;
      }
      a2 = skipWs(a2 + 1);
      const q = text[a2];
      if (q !== '"' && q !== "'") {
        err(a2, `тег <${name}>: значение атрибута "${aname}" без кавычек`);
        const g = resyncToGt(a2);
        if (g === -1) { err(openAt, `тег <${name}> не закрыт (конец файла)`); i = n; break; }
        // Резинхронизация на «/» + «>» — тег всё-таки самозакрылся:
        // не оставляем его «открытым» в стеке (нет каскадных ошибок).
        selfClosing = text[g - 1] === '/';
        i = g + 1; break;
      }
      const qend = text.indexOf(q, a2 + 1);
      if (qend === -1) {
        err(a2, `тег <${name}>: атрибут "${aname}" — кавычка не закрыта (конец файла)`);
        i = n;
        break;
      }
      const value = text.slice(a2 + 1, qend);
      if (seen.has(aname)) err(a2, `тег <${name}>: атрибут "${aname}" задан дважды`);
      seen.add(aname);
      attrs.push({ name: aname, value, pos: a2 });
      k = qend + 1;
    }

    const el = { name, attrs, selfClosing, pos: openAt };
    elements.push(el);
    if (!root) root = el;
    if (selfClosing) {
      if (root === el) rootClosed = true;
    } else {
      stack.push(el);
    }
  }

  if (stack.length) {
    const top = stack[stack.length - 1];
    err(top.pos, `тег <${top.name}> не закрыт (нет </${top.name}>)`);
  }
  return { errors, elements, root };
}

// Полная проверка одного SVG: well-formedness + схема + значения.
// Возвращает [{line, col, message}] (пусто = файл чистый).
function checkSvg(text) {
  const posOf = makePosOf(text);
  const { errors, elements, root } = parseSvgXml(text, posOf);
  const out = errors.slice();
  const push = (p, message) => {
    const { line, col } = posOf(p);
    out.push({ line, col, message });
  };

  // --- Структурная схема ---
  if (!root) {
    push(0, 'нет корневого элемента');
  } else {
    if (root.name !== 'svg') {
      push(root.pos, `корневой элемент обязан быть <svg>, а не <${root.name}>`);
    }
    const xmlns = root.attrs.find((a) => a.name === 'xmlns');
    if (!xmlns) {
      push(root.pos, 'корень не имеет xmlns="http://www.w3.org/2000/svg"');
    } else if (xmlns.value !== 'http://www.w3.org/2000/svg') {
      push(xmlns.pos, `xmlns со значением "${xmlns.value}" (ожидается http://www.w3.org/2000/svg)`);
    }
    const vb = root.attrs.find((a) => a.name === 'viewBox');
    const w = root.attrs.find((a) => a.name === 'width');
    const h = root.attrs.find((a) => a.name === 'height');
    if (!vb) {
      if (!(w && h)) push(root.pos, 'нет viewBox (и нет width/height)');
    } else {
      const toks = vb.value.split(/\s+/).filter((t) => t !== '');
      if (toks.length !== 4) {
        push(vb.pos, `viewBox обязан содержать 4 числа, а не ${toks.length}: "${vb.value}"`);
      } else {
        for (const t of toks) {
          if (!Number.isFinite(Number(t))) {
            push(vb.pos, `viewBox: «${t}» не конечное число`);
            break;
          }
        }
      }
    }
  }

  // --- Значения атрибутов (все элементы) ---
  for (const el of elements) {
    for (const a of el.attrs) {
      if (a.value.trim() === '') {
        // Исключение: transform="" — легальный identity-трансформ
        // (4 чистых кадра salamander_*). Задокументировано в
        // memory/000120-svg-schema.md.
        if (!(a.name === 'transform' && a.value === '')) {
          push(a.pos, `тег <${el.name}>: пустое значение атрибута "${a.name}"`);
        }
        continue;
      }
      for (const t of a.value.split(/\s+/)) {
        if (/^[+-]?(NaN|Infinity)$/i.test(t)) {
          push(a.pos, `тег <${el.name}>: атрибут "${a.name}" со значением "${a.value}" (NaN/Infinity — не число)`);
          break;
        }
      }
    }
  }
  return out;
}

// --- Обход assets/**/*.svg ---

function findSvgFiles(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) findSvgFiles(p, out);
    else if (e.name.toLowerCase().endsWith('.svg')) out.push(p);
  }
  return out;
}

// Чистый SVG для самопроверок парсера (обобщённый формат ассетов:
// defs/градиенты/stop, комментарий, text, кавычки-вложенные).
const GOOD_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">\n' +
  '<defs>\n' +
  '<linearGradient id="t_g1"><stop offset="0%" stop-color="#6b8a4a"/>' +
  '<stop offset="100%" stop-color="#3f5427"/></linearGradient>\n' +
  '</defs>\n' +
  '<!-- кадр: comment -->\n' +
  '<title>чистый SVG: вложенные кавычки в значениях</title>\n' +
  '<g fill="#6b8a4a" stroke="#3f5427" stroke-width="1.5">\n' +
  '<circle cx="50" cy="50" r="20" fill="url(#t_g1)"/>\n' +
  '<path d="M10 10 L90 90 Z" fill="none" stroke-linecap="round"/>\n' +
  '</g>\n' +
  '</svg>\n';

// Тяжёлый «логотипный» положительный пример: SMIL, <text>,
// xlink:href+href, xmlns:xlink, одиночные кавычки внутри двойных.
const GOOD_HEAVY_SVG =
  '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="900" height="900" viewBox="0 0 900 900">\n' +
  '<title>Флогистон — эмблема</title>\n' +
  '<defs>\n' +
  '<radialGradient id="sky" cx="50%" cy="38%" r="75%">\n' +
  '<stop offset="0%" stop-color="#34306a" stop-opacity="0.9"/>\n' +
  '<stop offset="100%" stop-color="#131030" stop-opacity="0"/>\n' +
  '</radialGradient>\n' +
  '<path id="flame" d="M0,0 C-13,-16 -11,-36 0,-52 C11,-36 13,-16 0,0 Z"/>\n' +
  '</defs>\n' +
  '<g>\n' +
  '<use xlink:href="#flame" href="#flame" transform="translate(0,-13) scale(0.5)">\n' +
  '<animate attributeName="opacity" values="0.7;0.95;0.6;0.9;0.7" dur="0.9s" repeatCount="indefinite"/>\n' +
  '</use>\n' +
  '</g>\n' +
  '<text x="450" y="834" text-anchor="middle" font-family="Georgia, \'Times New Roman\', serif" font-size="48" fill="url(#sky)">ФЛОГИСТОН</text>\n' +
  '</svg>\n';

// Проверка через временный файл (полный путь обхода: readFileSync →
// checkSvg) — как в боевом тесте, только в os.tmpdir.
function checkTmpSvg(name, content) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'svg-test-'));
  const p = path.join(dir, name);
  fs.writeFileSync(p, content, 'utf8');
  try {
    return checkSvg(fs.readFileSync(p, 'utf8'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// --- Боевой обход (красный ДО ремонта 29 файлов из 000062) ---

// Ожидаемое число SVG ПО КАТАЛОГАМ — единственная точка, которую
// обновляет задача, ДОБАВЛЯЮЩАЯ SVG в assets/ (иначе этот тест падает:
// защита от «обход молча не видит файлы»). Категория = каталог файла
// относительно assets/ (для assets/logo.svg — имя без расширения).
// При добавлении SVG правится ровно одна строка этой таблицы;
// сообщение об ошибке показывает разницу по КАЖДОМУ каталогу, поэтому
// протухший счётчик виден сразу и без догадок.
const EXPECTED_SVG_BY_DIR = {
  tiles: 12,                          // тайлы карты мира
  'combat/bg': 11,                    // фоны боя
  'dungeon/floor': 15,                // полы подземелья (задача 000069)
  'dungeon/walls': 6,                 // «непроходимые» стены (задача 000070)
  'sprites/buildings': 13,
  'sprites/mobs': 192,
  'sprites/phlogiston': 8,
  'sprites/visuals': 13,
  logo: 1,                            // assets/logo.svg
};

test('обход: в assets/ ровно ' +
  Object.values(EXPECTED_SVG_BY_DIR).reduce((a, b) => a + b, 0) +
  ' SVG-файлов (защита от «обход молча не видит файлы»)', () => {
  const files = findSvgFiles(path.join(ROOT, 'assets'));
  const byDir = {};
  for (const f of files) {
    const rel = path.relative(path.join(ROOT, 'assets'), f).split(path.sep);
    // файл в корне assets (logo.svg) → категория по имени файла
    const dir = rel.length === 1
      ? rel[0].replace(/\.svg$/i, '')
      : rel.slice(0, -1).join(path.sep);
    byDir[dir] = (byDir[dir] || 0) + 1;
  }
  const expectedTotal = Object.values(EXPECTED_SVG_BY_DIR).reduce((a, b) => a + b, 0);
  const diffs = [];
  const dirs = new Set([...Object.keys(EXPECTED_SVG_BY_DIR), ...Object.keys(byDir)]);
  for (const d of dirs) {
    const e = EXPECTED_SVG_BY_DIR[d] || 0;
    const a = byDir[d] || 0;
    if (e !== a) diffs.push(`${d}: ожидается ${e}, найдено ${a}`);
  }
  if (diffs.length) {
    assert.fail(
      `ожидается ${expectedTotal} SVG, найдено ${files.length} (по каталогам):\n  ` +
      diffs.join('\n  ') + '\n' +
      'фактически: ' +
      Object.keys(byDir).sort().map((d) => `${d}=${byDir[d]}`).join(', ') +
      '\n(новая SVG в каталоге — обновите EXPECTED_SVG_BY_DIR в tests/svg.test.js)'
    );
  }
});

test('обход: все SVG-файлы assets/ валидны (well-formedness + схема + значения)', () => {
  const files = findSvgFiles(path.join(ROOT, 'assets')).sort();
  const defective = [];
  for (const f of files) {
    const errs = checkSvg(fs.readFileSync(f, 'utf8'));
    if (errs.length) defective.push({ rel: path.relative(ROOT, f), errs });
  }
  if (defective.length) {
    // Все ошибки ВСЕХ дефектных файлов (путь:строка:колонка), а не
    // только первая: на текущем master это 29 файлов (25 невалидных
    // XML + 4 с NaN) — «25+4» обязан собираться из вывода.
    const lines = [
      `дефектных SVG: ${defective.length} из ${files.length} (ожидается 0):`,
    ];
    for (const d of defective) {
      lines.push(d.rel + ':');
      for (const e of d.errs) lines.push(`  ${e.line}:${e.col} ${e.message}`);
    }
    assert.fail(lines.join('\n'));
  }
  assert.ok(files.length > 0, 'обход не нашёл ни одного .svg');
});

// --- Самопроверки парсера (зелёные сразу: тестируют checkSvg) ---

test('самопроверка: чистые SVG (включая «тяжёлый» логотипный) — 0 ошибок', () => {
  assert.deepEqual(checkSvg(GOOD_SVG), [], 'GOOD_SVG обязан быть чистым');
  assert.deepEqual(checkTmpSvg('heavy.svg', GOOD_HEAVY_SVG), [],
    'SMIL/<text>/xlink:href+href/xmlns:xlink/одиночные кавычки в значениях — легально');
});

test('самопроверка: паттерн 1 (000062) — склеенные кавычки атрибутов', () => {
  // Реальный дефект skeleton/crawling_bones/bone_coloss:
  // stroke=" opacity="0.8"" stroke-width="NaN" — две кавычки слиплись.
  const bad = GOOD_SVG.replace(
    '<circle cx="50" cy="50" r="20" fill="url(#t_g1)"/>',
    '<circle cx="50" cy="50" r="20" fill="#fff" stroke=" opacity="0.8"" stroke-width="NaN"/>'
  );
  const errs = checkTmpSvg('fused.svg', bad);
  assert.ok(errs.length >= 1, 'склеенные кавычки не пойманы');
  const line = bad.split('\n').indexOf('<circle cx="50" cy="50" r="20" fill="#fff" stroke=" opacity="0.8"" stroke-width="NaN"/>') + 1;
  assert.ok(errs.some((e) => e.line === line),
    'ошибка обязана указывать строку дефекта: ' + errs.map((e) => e.line + ':' + e.message).join(' | '));
});

test('самопроверка: паттерн 2 (000062) — лишний токен перед "/>"', () => {
  // Реальный дефект scorpion: stroke-linecap="round"1.4/>
  const bad = GOOD_SVG.replace(
    '<circle cx="50" cy="50" r="20" fill="url(#t_g1)"/>',
    '<circle cx="50" cy="50" r="20" fill="none" stroke="#ffb09a" stroke-width="1.4" stroke-linecap="round"1.4/>'
  );
  const errs = checkTmpSvg('extra-token.svg', bad);
  assert.ok(errs.length >= 1, 'лишний токен «1.4» перед "/>" не пойман');
  assert.ok(errs.some((e) => /лишний токен/.test(e.message)),
    'ошибка — «лишний токен»: ' + errs.map((e) => e.message).join(' | '));
});

test('самопроверка: паттерн 3 (000062) — NaN/Infinity в значениях атрибутов', () => {
  const nan = GOOD_SVG.replace('stroke-width="1.5"', 'stroke-width="NaN"');
  const errs = checkTmpSvg('nan.svg', nan);
  assert.ok(errs.some((e) => /NaN|Infinity/.test(e.message) && /stroke-width/.test(e.message)),
    'stroke-width="NaN" не пойман: ' + errs.map((e) => e.message).join(' | '));
  const inf = GOOD_SVG.replace('stroke-width="1.5"', 'stroke-width="Infinity"');
  const errs2 = checkTmpSvg('inf.svg', inf);
  assert.ok(errs2.some((e) => /NaN|Infinity/.test(e.message)),
    'stroke-width="Infinity" не пойман');
  const negInf = GOOD_SVG.replace('stroke-width="1.5"', 'stroke-width="-infinity"');
  const errs3 = checkTmpSvg('neginf.svg', negInf);
  assert.ok(errs3.some((e) => /NaN|Infinity/.test(e.message)),
    'stroke-width="-infinity" (case-insensitive) не пойман');
});

test('самопроверка: схема — нет xmlns / корень не svg / нет viewBox / viewBox-мусор', () => {
  assert.ok(checkTmpSvg('no-xmlns.svg', GOOD_SVG.replace(
    '<svg xmlns="http://www.w3.org/2000/svg" ', '<svg '
  )).length >= 1, 'отсутствующий xmlns не пойман');
  assert.ok(checkTmpSvg('not-svg.svg', GOOD_SVG.replace('<svg ', '<g ')).some(
    (e) => /корневой элемент/.test(e.message)), 'корень <g> не пойман');
  assert.ok(checkTmpSvg('no-vb.svg', GOOD_SVG.replace(
    ' viewBox="0 0 100 100" width="100" height="100"', '')).some(
    (e) => /viewBox/.test(e.message)), 'отсутствующий viewBox/width/height не пойман');
  const badVb = GOOD_SVG.replace('viewBox="0 0 100 100"', 'viewBox="0 0 abc 100"');
  assert.ok(checkTmpSvg('bad-vb.svg', badVb).some(
    (e) => /viewBox/.test(e.message)), 'viewBox="0 0 abc 100" не пойман');
  const threeVb = GOOD_SVG.replace('viewBox="0 0 100 100"', 'viewBox="0 0 100"');
  assert.ok(checkTmpSvg('vb3.svg', threeVb).some(
    (e) => /viewBox/.test(e.message)), 'viewBox из 3 чисел не пойман');
});

test('самопроверка: well-formedness — незакрытая кавычка / тег / мусор после корня', () => {
  assert.ok(checkTmpSvg('noquote.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">\n<circle fill="#fff\n').length >= 1,
    'незакрытая кавычка атрибута не поймана');
  assert.ok(checkTmpSvg('notag.svg',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10">\n<g transform="scale(1)">'
  ).length >= 1, 'незакрытый <g> не пойман');
  assert.ok(checkTmpSvg('junk.svg',
    GOOD_SVG.replace('</svg>', '</svg>junk')).length >= 1,
    'мусор после </svg> не пойман');
  assert.ok(checkTmpSvg('mismatch.svg',
    GOOD_SVG.replace('</g>', '</circle>')).length >= 1,
    'несоответствие закрывающего тега не поймано');
  assert.ok(checkTmpSvg('doctype.svg',
    '<?xml version="1.0"?>\n<!DOCTYPE svg>\n' + GOOD_SVG).length >= 1,
    'DOCTYPE не пойман');
});

test('самопроверка: пустое значение атрибута; transform="" — исключение', () => {
  assert.ok(checkTmpSvg('empty.svg',
    GOOD_SVG.replace('fill="#6b8a4a"', 'fill=""')).some(
    (e) => /пустое значение/.test(e.message)), 'fill="" не пойман');
  // Легальный identity-трансформ (чистые кадры salamander_*):
  // transform="" НЕ ошибка.
  const identity = GOOD_SVG.replace(
    '<g fill="#6b8a4a"', '<g transform="" fill="#6b8a4a"');
  assert.deepEqual(checkTmpSvg('identity.svg', identity), [],
    'transform="" обязан проходить (документированное исключение)');
});

test('самопроверка: дубликат атрибута и «&» в тексте — ошибки', () => {
  assert.ok(checkTmpSvg('dup.svg',
    GOOD_SVG.replace('<circle cx="50"', '<circle fill="#fff" fill="#fff" cx="50"')).length >= 1,
    'дубликат атрибута не пойман');
  assert.ok(checkTmpSvg('amp.svg',
    GOOD_SVG.replace('чистый SVG', 'a & b')).some(
    (e) => /&/.test(e.message)), 'неэкранированный «&» в тексте не пойман');
});

module.exports = { checkSvg, parseSvgXml, findSvgFiles };
