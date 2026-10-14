'use strict';
// JSON-справочники: общий резолвер ссылки (задача 000211.01, родитель 000211).
//
// Node-only CommonJS (образец scripts/lib/write-atomic.js), без внешних
// зависимостей (package.json без deps). <script>-тега в index.html НЕТ
// (ТЗ §1, пин tests/index-order.test.js): потребители — только Node-тесты
// (tests/assets-refs.test.js) и sync-*.js сборщиков подзадач 000211.02–.08,
// 000207/208/209. Контракт формата ссылки и правила sweep —
// memory/000211.01-json-ref-format.md.
//
// Резолвер НЕ делает: сверку id с прежним значением (тесты подзадач),
// валидацию схем (tests/assets-schemas.test.js), проверку существования
// svg (collectSvgs только собирает — existsSync в общем тесте).

const fs = require('fs');
const path = require('path');

// Якорные паттерны — ЕДИНЫЙ источник для подзадач (memory §1).
const REF_RE = /^assets\/(items|skills|spells|mobs|mob_groups|buildings|craft|dungeons|npc)\/\d{6}\.json$/;
const PORTRAITS_RE = /^assets\/portraits\/(efir|flogiston|npc-\d{6})\.json$/;

// 11 каталогов общего sweep (данные файлы; visuals — каталог прямых
// svg-путей, ВНЕ якорного паттерна; portraits — именованные файлы).
const REF_CATALOGS = ['items', 'skills', 'spells', 'mobs', 'mob_groups',
  'buildings', 'craft', 'dungeons', 'npc', 'visuals', 'portraits'];

function isRef(v) {
  return typeof v === 'string'
    && (REF_RE.test(v) || PORTRAITS_RE.test(v));
}

// root — позиционный, ОБЯЗАТЕЛЕН, дефолта НЕТ (негативные фикстуры
// изолируются в mkdtemp tmp-корне). БЕЗ бросаний: структурный результат,
// reason — not-a-ref | no-file | not-json | no-id. «Содержит id» —
// hasOwnProperty, НЕ truthiness: assets/dungeons/000001.json — id = 0.
function resolveRef(root, ref) {
  if (!isRef(ref)) return { ok: false, reason: 'not-a-ref' };
  let st;
  try {
    st = fs.statSync(path.join(root, ref));
  } catch (_) {
    return { ok: false, reason: 'no-file' };
  }
  if (!st.isFile()) return { ok: false, reason: 'no-file' };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(path.join(root, ref), 'utf8'));
  } catch (_) {
    return { ok: false, reason: 'not-json' };
  }
  if (typeof data !== 'object' || data === null
    || !Object.prototype.hasOwnProperty.call(data, 'id')) {
    return { ok: false, reason: 'no-id' };
  }
  return { ok: true, id: data.id };
}

// Чистый walker без fs: путь — where-стиль валидатора (tests/
// json-schema.js): верхний уровень — голые ключи, массивы [i], объекты
// .k → «loot[0].item», «art.move[0]».
function walk(value, prefix, visit) {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], prefix + '[' + i + ']', visit);
    }
  } else if (value !== null && typeof value === 'object') {
    for (const k of Object.keys(value)) {
      walk(value[k], prefix ? prefix + '.' + k : k, visit);
    }
  } else if (typeof value === 'string') {
    visit(prefix, value);
  }
}

// ВСЕ строки под якорным паттерном во вложенной структуре.
function collectRefs(value) {
  const out = [];
  walk(value, '', (p, s) => {
    if (isRef(s)) out.push({ path: p, ref: s });
  });
  return out;
}

// ВСЕ строки «assets/…*.svg» (root-абсолютные пути; голые имена — вне
// скоупа, волна 2). Проверку существования делает тест, не резолвер.
function collectSvgs(value) {
  const out = [];
  walk(value, '', (p, s) => {
    if (s.startsWith('assets/') && s.endsWith('.svg')) {
      out.push({ path: p, svg: s });
    }
  });
  return out;
}

module.exports = {
  REF_RE, PORTRAITS_RE, REF_CATALOGS,
  isRef, resolveRef, collectRefs, collectSvgs,
};
