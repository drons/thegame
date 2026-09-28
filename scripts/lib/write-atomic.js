'use strict';
// Атомарная запись файла (задача 000054, правки по итогам ревью).
//
// writeFileSync() в СУЩЕСТВУЮЩИЙ файл не атомарен: truncate + write.
// Параллельный читатель (node --test гоняет файлы тестов параллельно;
// tests/npc-data.test.js / tests/skills.test.js делают top-level
// require('../src/*-data.js')) может попасть в окно записи и прочитать
// частичный файл → редкий ложный красный CI.
//
// Здесь: пишем во временный файл В ТОМ ЖЕ каталоге (rename только внутри
// одной файловой системы — tmpdir может быть другим fs), затем
// fs.renameSync() — атомарная замена на POSIX. Читатель видит только
// старую или новую версию целиком, никогда — полуфайл.
//
// Временное имя — скрытый файл «.<имя>.<pid>-<rand>.tmp» (dotfile):
// если процесс умрёт между записью и rename, остаток виден в git status
// (подсказка «сбой при регенерации», а не молчаливое повреждение) и не
// смешивается с выходом sync-скриптов (convention: src/<имя>-data.js).
//
// Без внешних зависимостей (node:fs, node:path, node:crypto) — в рамках
// конвенции синк-скриптов.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir,
    '.' + path.basename(filePath) + '.' + process.pid + '-' +
    crypto.randomBytes(4).toString('hex') + '.tmp');
  try {
    fs.writeFileSync(tmp, content, 'utf8');
    fs.renameSync(tmp, filePath);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch (_) { /* уже переименован/удалён */ }
    throw e;
  }
}

module.exports = { writeFileAtomic };
