#!/usr/bin/env node
'use strict';
// Общий запуск синк-скриптов (задача 000054) + дрейф-гейт для CI.
//
// «Сборка» assets/*/*.json в JS-бандлы — это НЕ бандлер, а запуск
// устоявших sync-скриптов по конвенции имён scripts/sync-*.js
// (JSON — source of truth, src/*-data.js — фолбэк под file://).
// Конвенция (SPEC, раздел «CI и публикация на GitHub Pages»):
// синк-скрипт — без внешних зависимостей, идемпотентный
// (повторный запуск byte-идентичен), вход — assets/<каталог>/*.json,
// выход — src/<имя>-data.js. Генераторы gen-*.js синк-скриптами НЕ
// являются; sync-all.js сам себя не запускает. Новые каталоги
// (buildings — 000055; items, visuals — 000059) подключаются
// автоматически — workflow править не нужно.
//
// Режимы:
//   node scripts/sync-all.js [root]           — регенерация всех
//     JS-зеркал + отчёт «изменилось N, закоммитьте / синхронно»,
//     exit 0 даже при дрейфе (регенерация восстанавливает состояние
//     JSON, и это ожидаемо); git недоступен → предупреждение, что
//     список изменений не собран («синхронно (ничего не изменилось)»
//     без git не утверждается).
//   node scripts/sync-all.js [root] --check   — дрейф-гейт для CI:
//     непустой git-статус src/ ДО регенерации (локальные правки —
//     не переписывать их молча; скрипты не запускаются) или ПОСЛЕ
//     (закоммиченный дрейф — сценарий CI: правили JS-зеркало или
//     JSON без регенерации) → exit 1 с именами файлов и подсказкой.
//     Git недоступен (до старта или умер в процессе) → предупреждение
//     «дрейф не проверен» и утверждение «синхронно» НЕ выдаётся
//     (локальный режим, exit 0 — в CI git всегда доступен).
//
// root — корень «репозитория» (по умолчанию parent of __dirname,
// т.е. каталог, содержащий scripts/; опционально в argv — чтобы
// тесты могли работать в tmp-каталоге).
//
// Дрейф-чек ограничен `git status --porcelain -- src/`: по конвенции
// все sync-скрипты пишут только в src/. Если git недоступен —
// предупреждение: в --check дрейф-чек пропускается и «синхронно» НЕ
// утверждается (не проверено — не утверждаем), в обычном режиме
// вместо «синхронно (ничего не изменилось)» — предупреждение, что
// список изменений не собран (локальный режим, exit 0).
//
// Exports (CommonJS, для тестов):
//   listSyncScripts(root) → отсортированные имена sync-*.js;
//   runAll(root, { check, gitStatus }) →
//     { code: 0|1, output: string, changed: string[] }
//     (changed — пути из git-status src/ после регенерации,
//     repo-relative; gitStatus — опциональная замена gitStatusSrc,
//     чтобы тесты могли смоделировать недоступность git);
//   gitStatusSrc(root) → string[] | null (null — git недоступен).

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('node:child_process');

const SYNC_RE = /^sync-.+\.js$/;
const SELF = 'sync-all.js';

// Имена синк-скриптов в <root>/scripts по конвенции (без gen-*.js и
// без самого себя), отсортированные.
function listSyncScripts(root) {
  return fs.readdirSync(path.join(root, 'scripts'), { withFileTypes: true })
    .filter((e) => e.isFile() && SYNC_RE.test(e.name) && e.name !== SELF)
    .map((e) => e.name)
    .sort();
}

// `git status --porcelain -- src/` в root → repo-relative пути (sorted)
// или null, если git недоступен / команда упала.
function gitStatusSrc(root) {
  const r = spawnSync(
    'git', ['-C', root, 'status', '--porcelain', '--', 'src/'],
    { encoding: 'utf8' });
  if (r.error || r.status !== 0) return null;
  return parsePorcelain(r.stdout);
}

// Строка porcelain «XY<path>» → path. «XY» — 2 символа статуса, затем
// пробел, затем путь (возможно, в кавычках; rename — «old -> new»).
function parsePorcelain(out) {
  const res = [];
  for (const line of String(out).split('\n')) {
    if (line.length < 4) continue;
    let p = line.slice(3);
    if (p.startsWith('"') && p.endsWith('"') && p.length >= 2) {
      try { p = JSON.parse(p); } catch (_) { /* путь как есть */ }
    }
    const arrow = p.indexOf(' -> ');
    if (arrow !== -1) p = p.slice(arrow + 4); // для rename важен новый путь
    if (p) res.push(p);
  }
  return res.sort();
}

// Прогоняет все sync-скрипты по очереди (node, без зависимостей).
// { check } — дрейф-гейт, см. заголовок; { gitStatus } — опциональная
// замена gitStatusSrc (тесты: моделирование недоступности git).
// Возвращает { code: 0|1, output: string, changed: string[] }.
function runAll(root, opts = {}) {
  const check = Boolean(opts.check);
  const gitStatus = typeof opts.gitStatus === 'function'
    ? opts.gitStatus
    : gitStatusSrc;
  const out = [];
  const scripts = listSyncScripts(root);
  out.push(scripts.length
    ? 'sync-all: синк-скрипты: ' + scripts.join(', ')
    : 'sync-all: синк-скрипты не найдены (scripts/sync-*.js) — нечего делать');

  // До регенерации: незакоммиченные правки src/ не переписываем молча.
  let gitOk = true;
  if (check) {
    const pre = gitStatus(root);
    if (pre === null) {
      gitOk = false;
      out.push('sync-all: предупреждение: git недоступен — дрейф-чек ' +
        'пропущен (локальный режим).');
    } else if (pre.length > 0) {
      out.push('sync-all: --check: в src/ есть незакоммиченные изменения — ' +
        'регенерация не выполняется (не переписываю их молча):');
      for (const f of pre) out.push('  ' + f);
      out.push('sync-all: выполните npm run sync:all локально и ' +
        'закоммитьте изменения.');
      return { code: 1, output: out.join('\n'), changed: pre };
    }
  }

  // Прогон синк-скриптов по очереди; ошибка любого = провал.
  for (const s of scripts) {
    const r = spawnSync(process.execPath,
      [path.join(root, 'scripts', s)], { cwd: root, encoding: 'utf8' });
    if (r.stdout) out.push(r.stdout);
    if (r.stderr) out.push(r.stderr);
    if (r.error || r.status !== 0) {
      out.push('sync-all: ' + s + (r.error
        ? ' не запущен: ' + r.error.message
        : ' завершился с кодом ' + r.status));
      return { code: 1, output: out.join('\n'), changed: [] };
    }
  }

  let changed = [];
  let gitDown = false;
  if (gitOk) {
    const post = gitStatus(root);
    if (post === null) {
      gitDown = true; // git недоступен: список изменений собрать нельзя
    } else {
      changed = post;
    }
  }

  if (check) {
    if (!gitOk || gitDown) {
      // git-статус после регенерации собрать нельзя (git недоступен
      // до старта или умер в процессе): «синхронно» утверждать
      // нельзя — дрейф-чек не выполнен, и такое утверждение
      // противоречило бы предупреждению «дрейф-чек пропущен»
      // (правки по итогам ревью, задача 000054). Локальный режим,
      // exit 0 — в CI git всегда доступен.
      out.push('sync-all: предупреждение: git недоступен — дрейф-чек ' +
        'не выполнен, синхронность НЕ подтверждена (локальный режим).');
      return { code: 0, output: out.join('\n'), changed };
    }
    if (changed.length > 0) {
      out.push('sync-all: --check: после регенерации в src/ есть ' +
        'изменения — JS-зеркала отстали от JSON (дрейф):');
      for (const f of changed) out.push('  ' + f);
      out.push('sync-all: выполните npm run sync:all локально и ' +
        'закоммитьте изменения.');
      return { code: 1, output: out.join('\n'), changed };
    }
    out.push('sync-all: синхронно (JSON-каталоги и JS-зеркала совпадают).');
    return { code: 0, output: out.join('\n'), changed };
  }

  if (gitDown) {
    // Без git «синхронно (ничего не изменилось)» утверждать нельзя —
    // это вводит в заблуждение (правки по итогам ревью, задача 000054).
    out.push('sync-all: предупреждение: git недоступен — список ' +
      'изменений не собран; проверьте `git status` и закоммитьте ' +
      'результат регенерации вручную.');
  } else if (changed.length > 0) {
    out.push('sync-all: изменилось ' + changed.length
      + ' — закоммитьте вместе с JSON:');
    for (const f of changed) out.push('  ' + f);
  } else {
    out.push('sync-all: синхронно (ничего не изменилось).');
  }
  return { code: 0, output: out.join('\n'), changed };
}

// --- CLI ---
if (require.main === module) {
  const argv = process.argv.slice(2);
  const check = argv.includes('--check');
  const rootArg = argv.find((a) => !a.startsWith('--'));
  const root = rootArg
    ? path.resolve(rootArg)
    : path.join(__dirname, '..');
  const r = runAll(root, { check });
  process.stdout.write(r.output + '\n');
  process.exit(r.code);
}

module.exports = { listSyncScripts, runAll, gitStatusSrc };
