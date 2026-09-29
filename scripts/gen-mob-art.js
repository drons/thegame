#!/usr/bin/env node
// Задача 000062: генератор высокодетальных SVG-кадров мобов.
//
// По каждому из 36 мобов assets/mobs создаёт кадры в
// assets/sprites/mobs/<mob_id>_<state>_<n>.svg (MOBS.md, «Именование»):
//   move_1, move_2 — цикл движения (поза покоя → шаг);
//   attack_1, attack_2 — замах → выброс;
//   dead_1 — «сваленная» фигура (без лица/свечения глаз).
//
// Правила — MOBS.md: канвас 100·w × 100·h (клетка = 100 ед.), якорь
// низ-центр, фигура 75–95% высоты, тень-эллипс rgba(0,0,0,~0.28),
// единый ракурс 3/4 сверху, палитра моба (5–8 HEX из его «описания»),
// тонкий контур, 2–3 тона. Бюджет деталей: ≥ 30·w·h на КАЖДЫЙ кадр
// (проверяется scripts/count-svg-details.js).
//
// Палитры, черты и описания — scripts/mob-art-data.js. Генерация
// полностью детерминирована (сид = хэш id, фиксированный порядок
// элементов, округление до 0.1) — повторный запуск даёт
// byte-identical файлы.
//
// Запуск: node scripts/gen-mob-art.js

'use strict';

const { writeFileSync, mkdirSync, readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');
const { MOBS_ART } = require('./mob-art-data.js');
const { countDetails } = require('./count-svg-details.js');

const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'assets', 'sprites', 'mobs');

// --- Детерминированность ---

function hashId(id) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Число с 1 знаком (устойчивый вывод).
function f(v) {
  const r = Math.round(v * 10) / 10;
  return Object.is(r, -0) ? 0 : r;
}

// --- Позы кадров (MOBS.md: кадры различаются конечностями/челюстями/
// энергией, а не общим сдвигом) ---

const POSES = {
  move_1:   { step: 0,   lean: 0,    crouch: 0,   armF: 0,    armB: 0,    head: 0,    jaw: 0,   wing: 0.2,  flame: 0,   tail: 0 },
  move_2:   { step: 1,   lean: 0.5,  crouch: 0.5, armF: 1,    armB: -1,   head: 1,    jaw: 0.3, wing: 0.7,  flame: 1,   tail: 1 },
  attack_1: { step: 0,   lean: -0.7, crouch: 0.7, armF: -1,   armB: 0.4,  head: -0.5, jaw: 0.9, wing: -0.6, flame: 0.4, tail: -0.5 },
  attack_2: { step: 1.2, lean: 0.8,  crouch: 0.3, armF: 1.3,  armB: -0.6, head: 1,    jaw: 1,   wing: 1,    flame: 1.6, tail: 1 },
  dead_1:   { step: 0,   lean: 0,    crouch: 0,   armF: 0,    armB: 0,    head: 0,    jaw: 0,   wing: 0,    flame: 0,   tail: 0, dead: true },
};

// --- Контекст и примитивы ---
//
// Координаты — в ЕДИНИЧНОМ пространстве 100×100 (один код для
// 1x1/2x2/3x3); масштаб до канваса (u = S/100) применяется ОДНИМ
// корневым <g transform="scale(u)"> в assembleSvg.

function makeCtx(mob, size, poseName) {
  const S = 100 * size.w;
  const P = {};
  for (const [role, [hex]] of Object.entries(mob.palette)) P[role] = hex;
  P.light = P.light || P.base;
  P.dark = P.dark || P.line;
  P.line = P.line || P.dark;
  P.eye = P.eye || P.light;
  const C = {
    mob, P, S, u: S / 100,
    poseName,
    rnd: mulberry32(hashId(mob.id + '_' + poseName)),
    pose: POSES[poseName],
    dead: !!(POSES[poseName] && POSES[poseName].dead),
    parts: [],
    gradients: [],
  };
  // Координаты уже в единичном пространстве — только округление.
  const U = (v) => f(v);
  C.U = U;
  C.add = (s) => C.parts.push(s);
  C.el = {
    c: (cx, cy, r, fill, extra) =>
      `<circle cx="${U(cx)}" cy="${U(cy)}" r="${U(r)}" fill="${fill}"${extra || ''}/>`,
    e: (cx, cy, rx, ry, fill, extra) =>
      `<ellipse cx="${U(cx)}" cy="${U(cy)}" rx="${U(rx)}" ry="${U(ry)}" fill="${fill}"${extra || ''}/>`,
    ln: (x1, y1, x2, y2, c, w, extra) =>
      `<line x1="${U(x1)}" y1="${U(y1)}" x2="${U(x2)}" y2="${U(y2)}" stroke="${c}" stroke-width="${U(w)}"${extra || ''}/>`,
    pth: (d, fill, c, w) =>
      `<path d="${d}" fill="${fill}"${c ? ` stroke="${c}" stroke-width="${U(w)}" stroke-linejoin="round"` : ''}/>`,
    curve: (d, c, w, extra) =>
      `<path d="${d}" fill="none" stroke="${c}" stroke-width="${U(w)}" stroke-linecap="round"${extra || ''}/>`,
    poly: (pts, fill, c, w, extra) => {
      // Точки «x,y x,y ...» в единичном пространстве — масштабируются.
      const scaled = pts.split(' ').map((p) => {
        const [x, y] = p.split(',');
        return `${f(Number(x))},${f(Number(y))}`;
      }).join(' ');
      return `<polygon points="${scaled}" fill="${fill}"${c ? ` stroke="${c}" stroke-width="${U(w)}" stroke-linejoin="round"` : ''}${extra || ''}/>`;
    },
    rect: (x, y, w2, h2, fill, rx) =>
      `<rect x="${U(x)}" y="${U(y)}" width="${U(w2)}" height="${U(h2)}" fill="${fill}"${rx ? ` rx="${U(rx)}"` : ''}/>`,
  };
  return C;
}

// Тень опорной базы (MOBS.md: отступ 1–3% высоты канваса).
function shadow(C, rx) {
  C.add(C.el.e(50, 94, rx, 4, 'rgba(0,0,0,0.28)'));
}

// Глаза: свечение (halo + ядро) или тёмные (dead — «без свечения глаз»).
function eyes(C, x1, y, x2, r) {
  if (C.dead) {
    C.add(C.el.c(x1, y, r * 0.8, C.P.line));
    C.add(C.el.c(x2, y, r * 0.8, C.P.line));
    return;
  }
  C.add(C.el.c(x1, y, r * 2.1, C.P.eye, ' opacity="0.3"'));
  C.add(C.el.c(x2, y, r * 2.1, C.P.eye, ' opacity="0.3"'));
  C.add(C.el.e(x1, y, r * 0.8, r * 0.6, C.P.eye));
  C.add(C.el.e(x2, y, r * 0.8, r * 0.6, C.P.eye));
}

// Градиент тела (light → base) — один на файл, id с префиксом <mob_id>_.
function bodyGradient(C) {
  C.gradients.push(
    `<linearGradient id="${C.mob.id}_g1" x1="0" y1="0" x2="0.6" y2="1">` +
    `<stop offset="0" stop-color="${C.P.light}"/>` +
    `<stop offset="1" stop-color="${C.P.base}"/>` +
    `</linearGradient>`
  );
  return `url(#${C.mob.id}_g1)`;
}

// --- Чертёжная сетка фигур (единичное пространство) ---
// Якорь низ-центр: опорная база в y≈92–96, фигура растёт вверх
// (75–95% высоты канваса).

// Ноги двуногой: бёдра (44,60)/(56,60); step — фаза шага.
function humanoidLegs(C, footY) {
  const P = C.P, st = C.pose.step;
  // Задняя (левая) нога.
  const lFoot = st > 0 ? { x: 36, y: footY } : { x: 42, y: footY };
  const lKnee = { x: 42, y: (60 + footY) / 2 + 1 };
  C.add(C.el.curve(`M44 60 Q${f(lKnee.x)} ${f(lKnee.y)} ${f(lFoot.x)} ${f(lFoot.y)}`, P.dark, 9));
  C.add(C.el.e(lFoot.x, lFoot.y + 1, 6, 3.2, P.dark, ` stroke="${P.line}" stroke-width="1.5"`));
  // Передняя (правая) нога: на шаге — согнута и подхвачена.
  const rFoot = st > 0 ? { x: 62, y: footY - (st * 5) } : { x: 58, y: footY };
  const rKnee = st > 0 ? { x: 58, y: 72 } : { x: 57, y: (60 + footY) / 2 + 1 };
  C.add(C.el.curve(`M56 60 Q${f(rKnee.x)} ${f(rKnee.y)} ${f(rFoot.x)} ${f(rFoot.y)}`, P.base, 9));
  C.add(C.el.e(rFoot.x, rFoot.y + 1, 6, 3.2, P.base, ` stroke="${P.line}" stroke-width="1.5"`));
}

// Рука: плечо → кисть; t ∈ [-1..1] — замах (-1) / покой (0) / выпад (1).
function arm(C, sx, sy, t, w) {
  const P = C.P;
  const hx = sx + (t >= 0 ? 1 : -1) * (6 + 14 * Math.abs(t) * (t >= 0 ? 1 : 0.6));
  const hy = sy + 22 - 14 * Math.abs(t) * (t < 0 ? 1 : 0.4) - (t > 0 ? 4 : 0);
  const ex = (sx + hx) / 2 + (t < 0 ? -4 : 4) * Math.min(1, Math.abs(t));
  const ey = (sy + hy) / 2 + 3;
  C.add(C.el.curve(`M${f(sx)} ${f(sy)} Q${f(ex)} ${f(ey)} ${f(hx)} ${f(hy)}`, P.base, w));
  C.add(C.el.c(hx, hy, 4.2, P.light, ` stroke="${P.line}" stroke-width="1.5"`));
  return { x: hx, y: hy };
}

// Голова двуногой: центр (cx, cy), радиус r. jaw — оскал 0..1.
function head(C, cx, cy, r, opts) {
  const P = C.P;
  const hdy = C.pose.head * 1.2;
  const y = cy + hdy;
  C.add(C.el.e(cx, y, r, r * 0.94, `url(#${C.mob.id}_g1)`, ` stroke="${P.line}" stroke-width="2"`));
  // Тень правой половины.
  C.add(C.el.e(cx + r * 0.45, y + r * 0.1, r * 0.5, r * 0.42, P.dark, ' opacity="0.45"'));
  if (opts.ears) {
    C.add(C.el.poly(`${f(cx - r - 1)},${f(y - 2)} ${f(cx - r - 10)},${f(y - 8)} ${f(cx - r + 2)},${f(y - 7)}`, P.dark, P.line, 1.5));
    C.add(C.el.poly(`${f(cx + r + 1)},${f(y - 2)} ${f(cx + r + 10)},${f(y - 8)} ${f(cx + r - 2)},${f(y - 7)}`, P.dark, P.line, 1.5));
  }
  if (opts.horns) {
    C.add(C.el.curve(`M${f(cx - r * 0.6)} ${f(y - r * 0.8)} Q${f(cx - r * 1.1)} ${f(y - r * 1.5)} ${f(cx - r * 0.55)} ${f(y - r * 1.9)}`, P.a1 || P.line, 3.4));
    C.add(C.el.curve(`M${f(cx + r * 0.6)} ${f(y - r * 0.8)} Q${f(cx + r * 1.1)} ${f(y - r * 1.5)} ${f(cx + r * 0.55)} ${f(y - r * 1.9)}`, P.a1 || P.line, 3.4));
  }
  if (opts.hair) {
    C.add(C.el.pth(
      `M${f(cx - r)} ${f(y)} C${f(cx - r - 6)} ${f(y + 8)} ${f(cx - r - 3)} ${f(y + 18)} ${f(cx - r + 2)} ${f(y + 20)} ` +
      `C${f(cx - r * 0.4)} ${f(y + 14)} ${f(cx - r * 0.3)} ${f(y + 6)} ${f(cx - r * 0.5)} ${f(y - r * 0.6)} Z`,
      P.a1 || P.dark));
    C.add(C.el.pth(
      `M${f(cx + r)} ${f(y)} C${f(cx + r + 6)} ${f(y + 8)} ${f(cx + r + 3)} ${f(y + 18)} ${f(cx + r - 2)} ${f(y + 20)} ` +
      `C${f(cx + r * 0.4)} ${f(y + 14)} ${f(cx + r * 0.3)} ${f(y + 6)} ${f(cx + r * 0.5)} ${f(y - r * 0.6)} Z`,
      P.a1 || P.dark));
  }
  // Брови и глаза.
  C.add(C.el.ln(cx - r * 0.55, y - r * 0.28, cx - r * 0.12, y - r * 0.12, P.line, 2.4));
  C.add(C.el.ln(cx + r * 0.55, y - r * 0.28, cx + r * 0.12, y - r * 0.12, P.line, 2.4));
  eyes(C, cx - r * 0.34, y - r * 0.02, cx + r * 0.34, 2.3);
  // Нос и пасть (jaw — оскал).
  C.add(C.el.poly(`${f(cx - 2.5)},${f(y + r * 0.25)} ${f(cx + 2.5)},${f(y + r * 0.25)} ${f(cx)},${f(y + r * 0.5)}`, P.dark));
  const jaw = C.pose.jaw;
  if (jaw > 0.15) {
    C.add(C.el.e(cx, y + r * 0.66, r * (0.3 + 0.3 * jaw), r * (0.16 + 0.3 * jaw), P.line));
    if (opts.fangs) {
      C.add(C.el.poly(`${f(cx - r * 0.25)},${f(y + r * 0.6)} ${f(cx - r * 0.15)},${f(y + r * 0.95)} ${f(cx - r * 0.05)},${f(y + r * 0.62)}`, P.a4 || P.light));
      C.add(C.el.poly(`${f(cx + r * 0.05)},${f(y + r * 0.62)} ${f(cx + r * 0.15)},${f(y + r * 0.95)} ${f(cx + r * 0.25)},${f(y + r * 0.6)}`, P.a4 || P.light));
    }
  } else {
    C.add(C.el.ln(cx - r * 0.3, y + r * 0.62, cx + r * 0.3, y + r * 0.62, P.line, 1.8));
    if (opts.fangs) {
      C.add(C.el.poly(`${f(cx - r * 0.2)},${f(y + r * 0.6)} ${f(cx - r * 0.13)},${f(y + r * 0.82)} ${f(cx - r * 0.06)},${f(y + r * 0.6)}`, P.a4 || P.light));
      C.add(C.el.poly(`${f(cx + r * 0.06)},${f(y + r * 0.6)} ${f(cx + r * 0.13)},${f(y + r * 0.82)} ${f(cx + r * 0.2)},${f(y + r * 0.6)}`, P.a4 || P.light));
    }
  }
}

// Крыло (летун): от плеча (sx, sy), раскрытие t ∈ [-0.6..1].
function wing(C, side, sx, sy, t) {
  const P = C.P;
  const s = side; // -1 лево, +1 право
  const spread = 16 + 14 * Math.max(0, t);
  const up = 10 + 16 * Math.max(0, t);
  const bx = sx + s * spread, by = sy - up;
  C.add(C.el.pth(
    `M${f(sx)} ${f(sy)} C${f(sx + s * spread * 0.5)} ${f(sy - up * 1.2)} ${f(bx - s * 2)} ${f(by + 6)} ${f(bx)} ${f(by)} ` +
    `C${f(bx + s * 10)} ${f(by + 2)} ${f(bx + s * 12)} ${f(by + 12)} ${f(bx + s * 4)} ${f(by + 16)} ` +
    `C${f(sx + s * spread * 0.5)} ${f(sy - up * 0.4)} ${f(sx + s * 6)} ${f(sy + 4)} ${f(sx)} ${f(sy + 8)} Z`,
    P.a1 || P.dark, P.line, 1.5));
  // Пальцы крыла.
  C.add(C.el.ln(sx + s * 4, sy + 2, bx + s * 2, by + 8, P.line, 1.2));
  C.add(C.el.ln(sx + s * 6, sy + 4, bx + s * 6, by + 12, P.line, 1.2));
}

// Хвост (демоны): от бедра (48,62), фаза t.
function demonTail(C, t) {
  const P = C.P;
  const tipX = 82 + 6 * t, tipY = 40 - 10 * t;
  C.add(C.el.curve(`M48 62 C66 66 ${f(tipX - 10)} ${f(tipY + 18)} ${f(tipX)} ${f(tipY)}`, P.a1 || P.dark, 4));
  if (!C.dead) {
    C.add(C.el.pth(`M${f(tipX)} ${f(tipY)} q6 -8 0 -14 q-6 8 0 14 Z`, P.a3 || P.eye));
  } else {
    C.add(C.el.c(tipX, tipY, 2.4, P.a1 || P.dark));
  }
}

// Оружие в правой кисти (hx, hy): направление — от плеча к кисти.
function weapon(C, w, hx, hy) {
  const P = C.P;
  const t = C.pose.armF;
  // Направление удара: в покое — вниз-вбок, в замахе — назад-вверх, в выпаде — вперёд.
  const ang = t < 0 ? -1.9 : (t > 0 ? 0.5 : 1.1);
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const wood = P.a1, metal = P.a2, glow = P.eye;
  switch (w) {
    case 'club': {
      C.add(C.el.ln(hx, hy, hx + dx * 22, hy + dy * 22, wood, 5.5));
      C.add(C.el.c(hx + dx * 26, hy + dy * 26, 7, P.a2 || wood, ` stroke="${P.line}" stroke-width="1.5"`));
      C.add(C.el.c(hx + dx * 24, hy + dy * 24, 1.6, P.a4 || P.light));
      C.add(C.el.c(hx + dx * 28, hy + dy * 27, 1.6, P.a4 || P.light));
      break;
    }
    case 'sword': {
      C.add(C.el.ln(hx, hy, hx + dx * 26, hy + dy * 26, metal || wood, 3.4));
      C.add(C.el.ln(hx + dx * 6, hy + dy * 6 - 3, hx + dx * 6, hy + dy * 6 + 3, P.a2 || P.line, 2.4));
      C.add(C.el.ln(hx, hy, hx - dx * 4, hy - dy * 4, P.a2 || wood, 3));
      break;
    }
    case 'hammer': {
      C.add(C.el.ln(hx, hy, hx + dx * 24, hy + dy * 24, wood, 4.6));
      C.add(C.el.rect(hx + dx * 24 - 5, hy + dy * 24 - 7, 10, 14, metal || P.a2 || wood, 2));
      C.add(C.el.c(hx + dx * 24, hy + dy * 24, 1.4, P.a4 || P.light));
      break;
    }
    case 'bow': {
      C.add(C.el.curve(`M${f(hx + dx * 4 - 10)} ${f(hy + dy * 4 + 16)} Q${f(hx + dx * 16)} ${f(hy + dy * 16)} ${f(hx + dx * 4 + 10)} ${f(hy + dy * 4 - 16)}`, wood, 3.2));
      C.add(C.el.ln(hx + dx * 4 - 10, hy + dy * 4 + 16, hx + dx * 4 + 10, hy + dy * 4 - 16, P.a2 || P.line, 1));
      C.add(C.el.ln(hx - 12, hy + 8, hx + 16, hy - 8, wood, 1.6));
      C.add(C.el.poly(`${f(hx + 16)},${f(hy - 8)} ${f(hx + 20)},${f(hy - 10)} ${f(hx + 18)},${f(hy - 4)}`, metal || P.a2 || wood));
      break;
    }
    case 'staff': {
      C.add(C.el.ln(hx, hy + 10, hx + dx * 26, hy + dy * 26 - 8, wood, 3.6));
      C.add(C.el.c(hx + dx * 28, hy + dy * 28 - 10, 5.4, P.a3 || P.light, ` stroke="${P.line}" stroke-width="1.5"`));
      C.add(C.el.ln(hx + dx * 27, hy + dy * 27 - 12, hx + dx * 30, hy + dy * 30 - 8, P.a4 || P.eye, 1.6));
      break;
    }
    case 'torch': {
      C.add(C.el.ln(hx, hy + 8, hx + dx * 20, hy + dy * 20 - 6, wood, 3.2));
      if (!C.dead) {
        const fx = hx + dx * 22, fy = hy + dy * 22 - 8;
        C.add(C.el.pth(`M${f(fx)} ${f(fy)} q5 -8 0 -14 q-6 7 0 14 Z`, P.a1));
        C.add(C.el.pth(`M${f(fx - 3)} ${f(fy + 2)} q3 -6 0 -10 q-4 5 0 10 Z`, P.a2));
        C.add(C.el.pth(`M${f(fx + 3)} ${f(fy + 2)} q3 -6 0 -10 q-4 5 0 10 Z`, P.a2));
      } else {
        C.add(C.el.c(hx + dx * 20, hy + dy * 20 - 6, 2.2, P.a1));
      }
      break;
    }
    case 'wand': {
      C.add(C.el.ln(hx, hy + 8, hx + dx * 18, hy + dy * 18 - 6, P.a1 || wood, 2.6));
      if (!C.dead) {
        C.add(C.el.c(hx + dx * 20, hy + dy * 20 - 8, 4.6, glow, ' opacity="0.35"'));
        C.add(C.el.c(hx + dx * 20, hy + dy * 20 - 8, 2.4, glow));
      } else {
        C.add(C.el.c(hx + dx * 20, hy + dy * 20 - 8, 2, glow));
      }
      break;
    }
    default:
      break;
  }
}

// Когти (безоружный): три крюка на кисти.
function claws(C, hx, hy) {
  const P = C.P;
  C.add(C.el.ln(hx - 3, hy - 4, hx - 7, hy - 10, P.a4 || P.light, 1.8));
  C.add(C.el.ln(hx, hy - 5, hx - 1, hy - 11, P.a4 || P.light, 1.8));
  C.add(C.el.ln(hx + 3, hy - 4, hx + 5, hy - 10, P.a4 || P.light, 1.8));
}

// Щит в левой руке.
function shield(C, hx, hy) {
  const P = C.P;
  C.add(C.el.e(hx - 6, hy - 2, 10, 12, P.a2 || P.dark, ` stroke="${P.a1 || P.line}" stroke-width="2"`));
  C.add(C.el.c(hx - 6, hy - 2, 3, P.a1 || P.line));
  C.add(C.el.c(hx - 11, hy - 8, 1.2, P.a1 || P.line));
  C.add(C.el.c(hx - 1, hy - 8, 1.2, P.a1 || P.line));
  C.add(C.el.c(hx - 11, hy + 4, 1.2, P.a1 || P.line));
  C.add(C.el.c(hx - 1, hy + 4, 1.2, P.a1 || P.line));
}

// Мантия/плащ (за корпусом).
function cloak(C, wide) {
  const P = C.P;
  const w = wide ? 26 : 20;
  C.add(C.el.pth(
    `M${f(50 - w * 0.8)} 38 C${f(50 - w)} ${f(64)} ${f(50 - w * 0.9)} ${f(88)} ${f(50 - w * 0.7)} ${f(92)} ` +
    `L${f(50 + w * 0.7)} ${f(92)} C${f(50 + w * 0.9)} ${f(88)} ${f(50 + w)} ${f(64)} ${f(50 + w * 0.8)} 38 ` +
    `C${f(50 + w * 0.4)} 32 ${f(50 - w * 0.4)} 32 ${f(50 - w * 0.8)} 38 Z`,
    P.a1 || P.dark, P.line, 1.5));
  C.add(C.el.ln(50 - w * 0.55, 46, 50 - w * 0.4, 88, P.line, 1.2, ' opacity="0.5"'));
  C.add(C.el.ln(50 + w * 0.55, 46, 50 + w * 0.4, 88, P.line, 1.2, ' opacity="0.5"'));
}

// --- Построитель: двуногие (орки, тролль, вампир, гниль, имп, фея,
// суккуб, демон, уродство) ---

function buildHumanoid(C) {
  const P = C.P, m = C.mob, ft = C.pose, feat = m.features || {};
  shadow(C, 26);
  const g1 = bodyGradient(C);
  // Трансформ позы: прогиб (crouch) + наклон (lean) вокруг базы.
  const leanDeg = f(ft.lean * 8);
  const cr = f(ft.crouch * 3);
  let tf = '';
  if (C.dead) {
    tf = ` transform="translate(50 84) rotate(82) scale(0.72) translate(-50 -58)"`;
  } else if (leanDeg || cr) {
    tf = ` transform="translate(0 ${cr}) rotate(${leanDeg} 50 90)"`;
  }
  C.add(`<g${tf}>`);
  // Сначала — то, что за корпусом.
  if (feat.cloak) cloak(C, feat.pose === 'wide');
  if (feat.wings) {
    wing(C, -1, 34, 40, ft.wing);
    wing(C, 1, 66, 40, ft.wing);
  }
  if (feat.tail) demonTail(C, ft.tail);
  if (feat.pose === 'hunched') {
    // Гниль: сгорбленная поза — корпус ниже, голова вперёд.
  }
  // Ноги.
  humanoidLegs(C, 92);
  // Торс.
  const shY = feat.pose === 'hunched' ? 46 : 38;
  C.add(C.el.pth(
    `M36 ${f(shY)} C33 ${f(shY + 12)} 36 ${f(shY + 20)} 40 62 ` +
    `C44 65 56 65 60 62 C64 ${f(shY + 20)} 67 ${f(shY + 12)} 64 ${f(shY)} ` +
    `C58 31 42 31 36 ${f(shY)} Z`,
    g1, P.line, 2));
  // Свет слева, тень справа.
  C.add(C.el.pth(`M36 ${f(shY)} C33 ${f(shY + 12)} 36 ${f(shY + 20)} 40 62 C40 50 38 ${f(shY + 8)} 40 ${f(shY + 3)} Z`, P.light, null, 0, ' opacity="0.5"'));
  C.add(C.el.pth(`M64 ${f(shY)} C67 ${f(shY + 12)} 64 ${f(shY + 20)} 60 62 C62 50 64 ${f(shY + 8)} 62 ${f(shY + 3)} Z`, P.dark, null, 0, ' opacity="0.6"'));
  // Пояс.
  C.add(C.el.rect(39, 57, 22, 4.5, P.a2 || P.dark, 1.5));
  C.add(C.el.c(50, 59.2, 1.8, P.a1 || P.line));
  // Горб (тролль/медведь-человекоид).
  if (feat.hump) {
    C.add(C.el.e(50, shY + 2, 16, 7, P.base, ` stroke="${P.line}" stroke-width="1.5"`));
    C.add(C.el.e(45, shY, 8, 3.5, P.light, ' opacity="0.6"'));
  }
  // Руки.
  const handL = arm(C, 36, shY + 4, ft.armB, 7.5);
  const handR = arm(C, 64, shY + 4, ft.armF, 7.5);
  // Оружие / когти / щит.
  if (feat.weapon) weapon(C, feat.weapon, handR.x, handR.y);
  if (feat.claws) { claws(C, handR.x, handR.y); claws(C, handL.x, handL.y); }
  if (feat.shield) shield(C, handL.x, handL.y);
  if (feat.quiver) {
    C.add(C.el.rect(24, 40, 6, 16, P.a2 || P.dark, 2));
    C.add(C.el.ln(25.5, 40, 25, 32, P.a1 || P.line, 1.4));
    C.add(C.el.ln(28, 40, 28.5, 32, P.a1 || P.line, 1.4));
  }
  if (feat.totem) {
    C.add(C.el.rect(54, 48, 5, 12, P.a1 || wood2(C), 1));
    C.add(C.el.ln(55.5, 50, 57.5, 52, P.a4 || P.eye, 1.2));
    C.add(C.el.ln(56.5, 54, 55, 56, P.a4 || P.eye, 1.2));
  }
  if (feat.pauldron) {
    C.add(C.el.e(63, shY + 2, 8.5, 6, P.a1 || P.line, ` stroke="${P.line}" stroke-width="1.5"`));
    C.add(C.el.c(60, shY, 1.1, P.a2 || P.base));
    C.add(C.el.c(66, shY, 1.1, P.a2 || P.base));
  }
  if (feat.helmet) {
    C.add(C.el.pth(
      `M38 24 C38 14 44 9 50 9 C56 9 62 14 62 24 C56 20 44 20 38 24 Z`,
      P.a1 || P.line, P.line, 1.5));
    C.add(C.el.curve(`M40 14 Q34 8 36 2`, P.a4 || P.light, 3));
    C.add(C.el.curve(`M60 14 Q66 8 64 2`, P.a4 || P.light, 3));
  }
  if (feat.runes) {
    C.add(C.el.ln(60, shY + 8, 63, shY + 12, P.a4 || P.eye, 1.6));
    C.add(C.el.ln(63, shY + 8, 60, shY + 12, P.a4 || P.eye, 1.6));
    C.add(C.el.ln(61.5, shY + 6, 61.5, shY + 14, P.a4 || P.eye, 1.6));
  }
  if (feat.tattered) {
    C.add(C.el.pth(`M36 56 L32 74 L38 70 L40 80 L44 68 Z`, P.a1 || P.dark, P.line, 1));
    C.add(C.el.pth(`M64 56 L68 72 L62 70 L60 78 L57 68 Z`, P.a1 || P.dark, P.line, 1));
  }
  if (feat.slime) {
    C.add(C.el.e(42, 66, 4, 5, P.a1 || P.dark, ' opacity="0.7"'));
    C.add(C.el.e(58, 70, 3, 4, P.a1 || P.dark, ' opacity="0.7"'));
    C.add(C.el.e(47, 74, 2.5, 3, P.a1 || P.dark, ' opacity="0.6"'));
  }
  // Голова.
  const hx = feat.pose === 'hunched' ? 53 : 50;
  head(C, hx, 24, 12.5, {
    ears: /orc/.test(m.family) || m.id === 'troll',
    horns: !!feat.horns,
    hair: !!feat.hair || feat.pose === 'elegant',
    fangs: !!feat.fangs || /orc/.test(m.family) || m.family === 'demon',
  });
  // Клыки-«ивы» (уродство): два крупных светлых из нижней челюсти.
  if (feat.tusks) {
    C.add(C.el.curve(`M${f(hx - 6)} 34 Q${f(hx - 10)} 40 ${f(hx - 5)} 44`, P.a2 || P.light, 3));
    C.add(C.el.curve(`M${f(hx + 6)} 34 Q${f(hx + 10)} 40 ${f(hx + 5)} 44`, P.a2 || P.light, 3));
  }
  // Дополнительные руки (уродство): две короткие у пояса.
  if (feat.multiArm) {
    arm(C, 40, 56, 0.2, 6);
    arm(C, 60, 56, -0.2, 6);
  }
  // Швы (уродство): фиолетовые стежки через торс.
  if (feat.stitches) {
    C.add(C.el.ln(40, 42, 48, 46, P.a1 || P.eye, 1.8));
    C.add(C.el.ln(42, 48, 50, 44, P.a1 || P.eye, 1.8));
    C.add(C.el.ln(52, 52, 60, 56, P.a1 || P.eye, 1.8));
    C.add(C.el.ln(54, 58, 62, 54, P.a1 || P.eye, 1.8));
    for (let i = 0; i < 3; i++) {
      C.add(C.el.c(41 + i * 2, 44 + (i % 2) * 2, 1.2, P.a2 || P.eye, ' opacity="0.8"'));
    }
  }
  C.add('</g>');
  C.region = { cx: 50, cy: 48, rx: 15, ry: 14 };
  C.fillerStyle = m.family === 'orc' ? 'scars' : (feat.slime ? 'drips' : 'scars');
}

function wood2(C) { return C.P.a1; }

// --- Построитель: скелеты (скелет, лучник, ползучие кости, личинка,
// колосс) ---

function buildSkeleton(C) {
  const P = C.P, m = C.mob, ft = C.pose, feat = m.features || {};
  shadow(C, feat.pile ? 34 : 24);
  // Личинка — отдельный низкий силуэт.
  if (feat.worm) return buildWorm(C);
  // Ползучие кости — грудная клетка на лапах, без черепа.
  if (feat.pile) return buildBonePile(C);
  const leanDeg = f(ft.lean * 8), cr = f(ft.crouch * 3);
  let tf = '';
  if (C.dead) tf = ` transform="translate(50 84) rotate(82) scale(0.72) translate(-50 -58)"`;
  else if (leanDeg || cr) tf = ` transform="translate(0 ${cr}) rotate(${leanDeg} 50 90)"`;
  C.add(`<g${tf}>`);
  // Ноги-кости: бедро + голень.
  const st = ft.step;
  C.add(C.el.ln(45, 60, 42 - (st > 0 ? 6 : 0), 78, P.base, 4));
  C.add(C.el.ln(42 - (st > 0 ? 6 : 0), 78, 40 - (st > 0 ? 4 : 0), 92, P.base, 3.4));
  C.add(C.el.ln(40 - (st > 0 ? 4 : 0), 92, 34 - (st > 0 ? 4 : 0), 93, P.base, 3));
  C.add(C.el.ln(55, 60, 58 + (st > 0 ? 4 : 0), st > 0 ? 76 : 78, P.light, 4));
  C.add(C.el.ln(58 + (st > 0 ? 4 : 0), st > 0 ? 76 : 78, 62 + (st > 0 ? 3 : 0), st > 0 ? 87 : 92, P.light, 3.4));
  C.add(C.el.ln(62 + (st > 0 ? 3 : 0), st > 0 ? 87 : 92, 68 + (st > 0 ? 3 : 0), (st > 0 ? 87 : 92) + 1, P.light, 3));
  // Таз.
  C.add(C.el.e(50, 60, 9, 4.5, P.base, ` stroke="${P.line}" stroke-width="1.5"`));
  // Грудная клетка: рёбра + позвоночник.
  for (let i = 0; i < 5; i++) {
    const y = 38 + i * 4.6;
    C.add(C.el.curve(`M40 ${f(y)} Q50 ${f(y + 4)} 60 ${f(y)}`, P.base, 3));
    C.add(C.el.curve(`M42 ${f(y + 2)} Q50 ${f(y + 6)} 58 ${f(y + 2)}`, P.light, 1.6));
  }
  C.add(C.el.ln(50, 34, 50, 58, P.light, 3));
  for (let i = 0; i < 4; i++) C.add(C.el.c(50, 38 + i * 6, 1.6, P.base));
  // Обрывки кожи на бедре.
  C.add(C.el.pth(`M44 64 q4 6 0 10 q-4 -4 0 -10 Z`, P.a1 || P.dark, ' opacity="0.8"'));
  // Руки-кости.
  const hR = { x: 70 + (ft.armF > 0 ? 8 : 0) - (ft.armF < 0 ? 4 : 0), y: 56 - (ft.armF < 0 ? 12 : 0) - (ft.armF > 0 ? 2 : 0) };
  C.add(C.el.ln(62, 40, 66, 50, P.base, 3.6));
  C.add(C.el.ln(66, 50, hR.x, hR.y, P.base, 3.2));
  C.add(C.el.c(hR.x, hR.y, 3, P.light));
  const hL = { x: 30 - (ft.armB < 0 ? 4 : 0) + (ft.armB > 0 ? 3 : 0), y: 56 - (ft.armB < 0 ? 6 : 0) };
  C.add(C.el.ln(38, 40, 34, 50, P.light, 3.6));
  C.add(C.el.ln(34, 50, hL.x, hL.y, P.light, 3.2));
  C.add(C.el.c(hL.x, hL.y, 3, P.light));
  if (feat.weapon) weapon(C, feat.weapon, hR.x, hR.y);
  if (feat.quiver) {
    C.add(C.el.rect(26, 40, 6, 15, P.a2 || P.dark, 2));
    C.add(C.el.ln(28, 40, 27, 32, P.a1 || P.line, 1.4));
    C.add(C.el.ln(30, 40, 31, 32, P.a1 || P.line, 1.4));
  }
  // Колосс: вросшие пластины доспеха.
  if (feat.armor) {
    C.add(C.el.poly('42,38 58,36 60,46 44,48', P.a1 || P.line, P.line, 1.5));
    C.add(C.el.poly('40,50 56,52 54,58 42,56', P.a1 || P.line, P.line, 1.5));
    C.add(C.el.poly('58,52 70,50 72,58 60,58', P.a1 || P.line, P.line, 1.5));
    C.add(C.el.c(46, 42, 1.2, P.a2 || P.base));
    C.add(C.el.c(56, 44, 1.2, P.a2 || P.base));
    C.add(C.el.c(46, 54, 1.2, P.a2 || P.base));
    C.add(C.el.c(66, 54, 1.2, P.a2 || P.base));
  }
  // Череп.
  const hx = 50 + ft.head * 1.2, hy = 24 + ft.head * 1;
  C.add(C.el.e(hx, hy, 11, 10, P.light, ` stroke="${P.line}" stroke-width="2"`));
  C.add(C.el.e(hx + 4, hy + 2, 5, 4, P.base, ' opacity="0.6"'));
  // Гланицы + свет.
  if (C.dead) {
    C.add(C.el.e(hx - 4.4, hy - 1.5, 2.6, 2.2, P.line));
    C.add(C.el.e(hx + 4.4, hy - 1.5, 2.6, 2.2, P.line));
  } else {
    C.add(C.el.e(hx - 4.4, hy - 1.5, 2.6, 2.2, P.line));
    C.add(C.el.e(hx + 4.4, hy - 1.5, 2.6, 2.2, P.line));
    C.add(C.el.c(hx - 4.4, hy - 1.5, 1.1, P.eye, ' opacity="0.9"'));
    C.add(C.el.c(hx + 4.4, hy - 1.5, 1.1, P.eye, ' opacity="0.9"'));
  }
  // Челюсть и зубы.
  C.add(C.el.ln(hx - 6, hy + 5, hx + 6, hy + 5, P.line, 2));
  for (let i = 0; i < 5; i++) {
    C.add(C.el.ln(hx - 5 + i * 2.5, hy + 5, hx - 5 + i * 2.5, hy + 8, P.light, 1.6));
  }
  C.add('</g>');
  C.region = { cx: 50, cy: 48, rx: 12, ry: 13 };
  C.fillerStyle = 'cracks';
}

// Ползучие кости: грудная клетка на четырёх костяных лапах.
function buildBonePile(C) {
  const P = C.P, ft = C.pose;
  const bob = ft.step > 0 ? -1.5 : 0;
  // dead — грудная клетка проседает ближе к земле.
  const squash = C.dead ? ' scale(1 0.8)' : '';
  C.add(`<g transform="translate(0 ${f(bob + (C.dead ? 8 : 0))})${squash}">`);
  // Четыре «лапы».
  C.add(C.el.ln(34, 74, 24, 90, P.base, 3.6));
  C.add(C.el.ln(48, 76, 42, 92, P.light, 3.6));
  C.add(C.el.ln(58, 76, 64, 92, P.base, 3.6));
  C.add(C.el.ln(70, 74, 78, 90, P.light, 3.6));
  C.add(C.el.c(24, 90, 2.6, P.base));
  C.add(C.el.c(42, 92, 2.6, P.light));
  C.add(C.el.c(64, 92, 2.6, P.base));
  C.add(C.el.c(78, 90, 2.6, P.light));
  // Грудная клетка (низко, прижата).
  for (let i = 0; i < 6; i++) {
    const y = 58 + i * 4;
    C.add(C.el.curve(`M32 ${f(y)} Q50 ${f(y + 7)} 68 ${f(y)}`, P.base, 3.4));
  }
  C.add(C.el.ln(50, 56, 50, 80, P.light, 3));
  // Вросший клинок.
  C.add(C.el.ln(58, 52, 66, 68, P.a2 || P.line, 3));
  C.add(C.el.ln(66, 68, 70, 76, P.a2 || P.line, 2));
  // Кожаные мостики.
  C.add(C.el.pth(`M38 62 q3 5 0 8 q-3 -3 0 -8 Z`, P.a1 || P.dark, ' opacity="0.8"'));
  C.add(C.el.pth(`M60 70 q3 5 0 8 q-3 -3 0 -8 Z`, P.a1 || P.dark, ' opacity="0.8"'));
  // «Голова» — обломок хребта.
  C.add(C.el.ln(70, 58, 76, 50, P.base, 3.4));
  C.add(C.el.ln(72, 60, 79, 55, P.light, 3));
  C.add(C.el.c(77, 52, 2, P.base));
  // Свет в щели (dead — гаснет).
  if (!C.dead) C.add(C.el.c(50, 74, 2.2, P.a2 || P.line, ' opacity="0.55"'));
  C.add('</g>');
  C.region = { cx: 50, cy: 70, rx: 20, ry: 12 };
  C.fillerStyle = 'cracks';
}

// Личинка: вереница сегментов.
function buildWorm(C) {
  const P = C.P, ft = C.pose;
  const ph = ft.step * 2.4;
  // Сегменты: S-изгиб (dead — прижатая к земле вереница).
  const dead = C.dead;
  for (let i = 0; i < 7; i++) {
    const x = 78 - i * 9;
    const y = dead ? 80 + Math.sin(i * 0.9) * 1.5
      : 62 + Math.sin(i * 0.9 + ph) * 3;
    const r = (dead ? 8 : 11) - i * 0.9;
    C.add(C.el.e(x, y, r, r * 0.88, i % 2 ? P.light : P.base, ` stroke="${P.line}" stroke-width="1.5"`));
    if (!dead) C.add(C.el.e(x, y - r * 0.3, r * 0.6, r * 0.3, P.light, ' opacity="0.5"'));
  }
  // Опоры (у живой личинки).
  if (!dead) {
    for (let i = 1; i < 7; i++) {
      const x = 78 - i * 9;
      const y = 62 + Math.sin(i * 0.9 + ph) * 3;
      C.add(C.el.ln(x - 4, y + 8, x - 6, 92, P.dark, 3));
      C.add(C.el.ln(x + 4, y + 8, x + 6, 92, P.dark, 3));
    }
  }
  // Мандибулы (dead — сжаты).
  if (dead) {
    C.add(C.el.curve(`M84 78 q6 -2 8 1`, P.a1 || P.line, 2));
    C.add(C.el.curve(`M84 82 q6 2 8 -1`, P.a1 || P.line, 2));
  } else {
    C.add(C.el.curve(`M84 58 q8 -4 10 2 q-6 4 -10 -2 Z`, P.a1 || P.line));
    C.add(C.el.curve(`M84 66 q8 4 10 -2 q-6 -4 -10 2 Z`, P.a1 || P.line));
  }
  // Обонятельные пятна.
  C.add(C.el.c(80, dead ? 77 : 57, 1.6, P.line));
  C.add(C.el.c(83, dead ? 81 : 64, 1.6, P.line));
  C.region = { cx: 50, cy: dead ? 80 : 64, rx: 30, ry: 10 };
  C.fillerStyle = 'scales';
}

// --- Построитель: четвероногие (волки, вепрь, медведь, саламандра) ---

function buildQuadruped(C) {
  const P = C.P, m = C.mob, ft = C.pose, feat = m.features || {};
  const st = ft.step;
  shadow(C, feat.double ? 38 : 32);
  // Гибель: фигура горизонтальная — «падает» сжатием к земле
  // (без поворота: лапы не выйдут за канвас).
  if (C.dead) C.add(`<g transform="translate(0 28) scale(1 0.68)">`);
  // Стая: второй, более мелкий волк — за первым.
  if (feat.double) {
    C.add(`<g opacity="0.92">`);
    drawWolfBody(C, 0.8, -12, -6, P.dark, st * 0.5 + 0.5);
    C.add('</g>');
  }
  drawWolfBody(C, 1, 0, 0, null, st);
  if (C.dead) C.add('</g>');
  C.region = { cx: 50, cy: 60, rx: 30, ry: 13 };
  C.fillerStyle = 'fur';
}

function drawWolfBody(C, scale, ox, oy, baseOverride, st) {
  const P = C.P;
  const base = baseOverride || P.base;
  // Единичное пространство; сдвиг/масштаб вокруг центра фигуры (50, 66)
  // (масштаб канваса — в корневом g, см. assembleSvg).
  const tx = (v) => f(50 + (v - 50) * scale + ox);
  const ty = (v) => f(66 + (v - 66) * scale + oy);
  const ts = (v) => f(v * scale);
  const E = {
    c: (cx, cy, r, fill, extra) => `<circle cx="${tx(cx)}" cy="${ty(cy)}" r="${ts(r)}" fill="${fill}"${extra || ''}/>`,
    e: (cx, cy, rx, ry, fill, extra) => `<ellipse cx="${tx(cx)}" cy="${ty(cy)}" rx="${ts(rx)}" ry="${ts(ry)}" fill="${fill}"${extra || ''}/>`,
    ln: (x1, y1, x2, y2, c, w, extra) => `<line x1="${tx(x1)}" y1="${ty(y1)}" x2="${tx(x2)}" y2="${ty(y2)}" stroke="${c}" stroke-width="${ts(w)}"${extra || ''}/>`,
    curve: (d, c, w, extra) => {
      // d — в локальных координатах; пересобираем для 4 контрольных точек
      // (Q: M x0 y0 Q cx cy x1 y1) или прямой линии.
      const mm = d.match(/M([\d.]+) ([\d.]+) Q([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)/);
      if (mm) {
        return `<path d="M${tx(+mm[1])} ${ty(+mm[2])} Q${tx(+mm[3])} ${ty(+mm[4])} ${tx(+mm[5])} ${ty(+mm[6])}" fill="none" stroke="${c}" stroke-width="${ts(w)}" stroke-linecap="round"${extra || ''}/>`;
      }
      const lm = d.match(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/);
      if (lm) return `<path d="M${tx(+lm[1])} ${ty(+lm[2])} L${tx(+lm[3])} ${ty(+lm[4])}" fill="none" stroke="${c}" stroke-width="${ts(w)}" stroke-linecap="round"${extra || ''}/>`;
      return '';
    },
    poly: (pts, fill, c, w) => `<polygon points="${pts}" fill="${fill}"${c ? ` stroke="${c}" stroke-width="${ts(w)}" stroke-linejoin="round"` : ''}/>`,
    pth: (d, fill, c, w, extra) => `<path d="${d}" fill="${fill}"${c ? ` stroke="${c}" stroke-width="${ts(w)}"` : ''}${extra || ''}/>`,
  };
  const P2 = { ...P, base };
  // Тело: дуга от зада (x24) к голове (x84).
  C.add(`<path d="M${tx(22)} ${ty(56)} C${tx(24)} ${ty(42)} ${tx(42)} ${ty(36)} ${tx(58)} ${ty(39)} C${tx(72)} ${ty(41)} ${tx(80)} ${ty(47)} ${tx(84)} ${ty(55)} C${tx(86)} ${ty(62)} ${tx(80)} ${ty(70)} ${tx(70)} ${ty(72)} L${tx(30)} ${ty(72)} C${tx(22)} ${ty(70)} ${tx(20)} ${ty(63)} ${tx(22)} ${ty(56)} Z" fill="${E.pth ? base : base}" stroke="${P2.line}" stroke-width="${ts(2)}" stroke-linejoin="round"/>`);
  // Свет хребта, тень брюха.
  C.add(`<path d="M${tx(26)} ${ty(52)} C${tx(32)} ${ty(42)} ${tx(48)} ${ty(38)} ${tx(62)} ${ty(41)} C${tx(50)} ${ty(44)} ${tx(36)} ${ty(48)} ${tx(28)} ${ty(56)} Z" fill="${P2.light}" opacity="0.55"/>`);
  C.add(`<path d="M${tx(34)} ${ty(72)} L${tx(68)} ${ty(72)} C${tx(78)} ${ty(70)} ${tx(84)} ${ty(63)} ${tx(83)} ${ty(58)} C${tx(78)} ${ty(66)} ${tx(66)} ${ty(70)} ${tx(36)} ${ty(70)} Z" fill="${P2.dark}" opacity="0.6"/>`);
  // Ноги: четыре опоры; на шаге передняя и задняя сдвигаются.
  const legs = [
    [30, 70, st > 0 ? 24 : 28, 92, P2.dark],
    [44, 72, st > 0 ? 40 : 46, 93, base],
    [64, 72, st > 0 ? 68 : 60, 93, P2.dark],
    [76, 70, st > 0 ? 82 : 78, 92, base],
  ];
  for (const [x1, y1, x2, y2, col] of legs) {
    C.add(E.ln(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2 + 2, col, 6.5));
    C.add(E.ln((x1 + x2) / 2, (y1 + y2) / 2 + 2, x2, y2, col, 5));
    C.add(E.e(x2, y2 + 0.5, 4, 2.4, col, ` stroke="${P2.line}" stroke-width="1.2"`));
  }
  // Хвост.
  C.add(E.curve(`M24 54 Q14 48 ${st > 0 ? 8 : 12} ${st > 0 ? 40 : 46}`, P2.dark, 4));
  C.add(E.e(st > 0 ? 8 : 12, st > 0 ? 40 : 46, 3.4, 3.4, P2.base));
  // Голова: череп + рыло.
  C.add(E.e(84, 50, 9, 8.4, base, ` stroke="${P2.line}" stroke-width="1.8"`));
  C.add(`<path d="M${tx(88)} ${ty(48)} L${tx(98)} ${ty(52)} L${tx(92)} ${ty(57)} Z" fill="${P2.dark}" stroke="${P2.line}" stroke-width="${ts(1.4)}" stroke-linejoin="round"/>`);
  C.add(E.c(97, 52.5, 1.5, P2.line));
  // Уши.
  C.add(`<polygon points="${tx(80)},${ty(43)} ${tx(77)},${ty(33)} ${tx(84)},${ty(41)}" fill="${P2.dark}" stroke="${P2.line}" stroke-width="${ts(1.2)}" stroke-linejoin="round"/>`);
  C.add(`<polygon points="${tx(88)},${ty(43)} ${tx(90)},${ty(34)} ${tx(92)},${ty(44)}" fill="${P2.dark}" stroke="${P2.line}" stroke-width="${ts(1.2)}" stroke-linejoin="round"/>`);
  // Глаз.
  if (!C.dead) {
    C.add(E.c(84, 48, 1.8, P2.eye, ' opacity="0.35"'));
    C.add(E.c(84, 48, 1, P2.eye));
  } else {
    C.add(E.c(84, 48, 1.1, P2.line));
  }
  // Пасть (jaw).
  const jaw = C.pose.jaw;
  if (jaw > 0.15) {
    C.add(`<path d="M${tx(90)} ${ty(56)} Q${tx(94)} ${ty(58 + jaw * 3)} ${tx(97)} ${ty(55)}" fill="none" stroke="${P2.line}" stroke-width="${ts(1.6)}"/>`);
    C.add(`<polygon points="${tx(91)},${ty(55)} ${tx(92)},${ty(58 + jaw * 2)} ${tx(93)},${ty(55)}" fill="${P2.light}"/>`);
  }
  // Черты по фичам.
  if (C.mob.features && C.mob.features.tusks) {
    C.add(E.curve(`M94 57 Q99 60 97 65`, P2.light, 2.2));
    C.add(E.curve(`M90 58 Q93 62 91 66`, P2.light, 2.2));
  }
  if (C.mob.features && C.mob.features.bristles) {
    for (let i = 0; i < 7; i++) {
      const x = 30 + i * 8;
      C.add(`<polygon points="${tx(x)},${ty(42 - (i % 2) * 2)} ${tx(x + 3)},${ty(36 - (i % 2) * 2)} ${tx(x + 5)},${ty(43 - (i % 2) * 2)}" fill="${P2.light}"/>`);
    }
  }
  if (C.mob.features && C.mob.features.hump) {
    C.add(`<path d="M${tx(30)} ${ty(46)} C${tx(34)} ${ty(34)} ${tx(52)} ${ty(32)} ${tx(60)} ${ty(40)} C${tx(50)} ${ty(38)} ${tx(38)} ${ty(42)} ${tx(32)} ${ty(50)} Z" fill="${base}" stroke="${P2.line}" stroke-width="${ts(1.5)}"/>`);
    C.add(E.ln(34, 40, 36, 46, P2.line, 1.4));
    C.add(E.ln(44, 36, 45, 44, P2.line, 1.4));
    C.add(E.ln(54, 37, 53, 45, P2.line, 1.4));
  }
  if (C.mob.features && C.mob.features.claws) {
    C.add(E.ln(44, 92, 42, 97, P2.light, 2));
    C.add(E.ln(48, 92, 48, 98, P2.light, 2));
    C.add(E.ln(66, 92, 64, 97, P2.light, 2));
    C.add(E.ln(70, 92, 70, 98, P2.light, 2));
  }
  if (C.mob.features && C.mob.features.fireSpots) {
    for (let i = 0; i < 5; i++) {
      C.add(E.c(34 + i * 9, 52 + (i % 2) * 6, 2.2, P2.eye || P2.base, C.dead ? '' : ' opacity="0.85"'));
    }
    // Пламя на хвосте (не в dead).
    if (!C.dead) {
      C.add(`<path d="M10 44 q4 -8 0 -13 q-4 6 0 13 Z" fill="${P2.a1 || P2.light}" transform=""/>`);
      C.add(`<path d="M6 46 q3 -6 0 -10 q-3 5 0 10 Z" fill="${P2.a2 || P2.base}"/>`);
    }
  }
}

// --- Построитель: членистоногие (паук, муравьи, скорпион, многоножка) ---

// Одна нога членистоногого: три звена (из корпуса наружу-вверх, затем
// вниз к земле). t — фаза шага (ноги в шахматном порядке).
function bugLeg(C, x1, y1, dir, i, t, seg) {
  const P = C.P;
  const phase = (i % 2 === 0 ? t : -t) * 4;
  const mx = x1 + dir * (10 + (i % 3) * 2), my = y1 - 12 - (i % 2) * 3;
  const fx = x1 + dir * (16 + (i % 3) * 3) + phase, fy = 92;
  C.add(C.el.curve(`M${f(x1)} ${f(y1)} Q${f(mx)} ${f(my)} ${f((mx + fx) / 2)} ${f(70)}`, P.base, 3.2));
  C.add(C.el.curve(`M${f((mx + fx) / 2)} ${f(70)} L${f(fx)} ${f(fy)}`, P.dark, 2.6));
  C.add(C.el.c(fx, fy, 1.6, P.dark));
  if (seg) C.add(C.el.c(mx, my, 1.4, P.a1 || P.base));
}

function buildArthropod(C) {
  const P = C.P, m = C.mob, ft = C.pose, feat = m.features || {};
  const t = ft.step;
  // Гибель: тело горизонтальное — сжатие к земле (лапы не выйдут
  // за канвас), а не поворот.
  let tf = C.dead ? ` transform="translate(0 30) scale(1 0.62)"` : '';
  C.add(`<g${tf}>`);
  shadow(C, 30);
  // Многоножка: вереница сегментов с ногами.
  if (feat.segments) {
    for (let i = 0; i < 9; i++) {
      const x = 20 + i * 7.4;
      const y = 64 - Math.sin(i * 0.8 + t * 2) * 2.5;
      const r = 6 - i * 0.35;
      C.add(C.el.e(x, y, r, r * 0.9, i % 2 ? P.light : P.base, ` stroke="${P.line}" stroke-width="1.4"`));
      if (i > 0 && i < 8) {
        bugLeg(C, x, y + r * 0.5, -1, i, t * 0.6, false);
        bugLeg(C, x, y + r * 0.5, 1, i + 1, t * 0.6, false);
      }
      if (i % 2 === 0) C.add(C.el.c(x, y - 2, 1.2, P.a3 || P.light));
    }
    // Голова: щиток + глаза + мандибулы.
    C.add(C.el.poly('86,58 94,60 92,68 84,66', P.a1 || P.plate || P.base, P.line, 1.4));
    if (!C.dead) {
      C.add(C.el.c(90, 61, 1.4, P.eye));
      C.add(C.el.c(87, 63, 1.1, P.eye));
    } else {
      C.add(C.el.c(90, 61, 1.1, P.line));
    }
    C.add(C.el.curve(`M94 62 q4 -2 6 1`, P.a2 || P.mid || P.dark, 2));
    C.add(C.el.curve(`M94 66 q4 2 6 -1`, P.a2 || P.mid || P.dark, 2));
    C.add(C.el.curve(`M92 58 q2 -6 6 -8`, P.a2 || P.mid || P.dark, 1.4));
    C.add(C.el.curve(`M89 57 q0 -6 4 -9`, P.a2 || P.mid || P.dark, 1.4));
    C.add('</g>');
    C.region = { cx: 50, cy: 62, rx: 34, ry: 8 };
    C.fillerStyle = 'scales';
    return;
  }
  // Скорпион: клещи + хвост-крюк со жалом.
  if (feat.stinger) {
    // Хвост: пять сегментов-«шарниров» вверх.
    let px = 30, py = 62;
    const pts = [[30, 62], [26, 52], [30, 42], [38, 34], [46, 30]];
    for (let i = 1; i < pts.length; i++) {
      C.add(C.el.ln(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], P.a1 || P.mid || P.base, 4 - i * 0.5));
      C.add(C.el.c(pts[i][0], pts[i][1], 2.4 - i * 0.3, P.base));
    }
    C.add(C.el.c(48, 27, 3.2, C.dead ? P.line : P.eye));
    if (!C.dead) C.add(C.el.c(48, 27, 6, P.eye, ' opacity="0.25"'));
    // Карапакс.
    C.add(C.el.e(50, 60, 13, 11, P.base, ` stroke="${P.line}" stroke-width="1.8"`));
    C.add(C.el.e(46, 56, 6, 4, P.light, ' opacity="0.5"'));
    // Клещи-щипцы.
    C.add(C.el.curve(`M62 56 Q74 50 78 58 Q72 64 62 60 Z`, P.a3 || P.spot || P.light, P.line, 1.4));
    C.add(C.el.curve(`M62 64 Q76 66 78 60 Q74 70 62 70 Z`, P.a3 || P.spot || P.light, P.line, 1.4));
    C.add(C.el.c(78, 58, 2, P.dark));
    C.add(C.el.c(78, 61, 2, P.dark));
    // Глаза (четыре пары).
    for (let i = 0; i < 4; i++) {
      const ex = 54 + (i % 2) * 4, ey = 54 + Math.floor(i / 2) * 4;
      C.add(C.el.c(ex, ey, i < 2 ? 1.8 : 1, C.dead ? P.line : P.eye));
    }
    // Ноги (восемь).
    for (let i = 0; i < 4; i++) {
      bugLeg(C, 44 - i * 4, 62, -1, i, t, true);
      bugLeg(C, 54 + i * 3, 64, 1, i + 1, t, true);
    }
    C.add('</g>');
    C.region = { cx: 48, cy: 56, rx: 24, ry: 14 };
    C.fillerStyle = 'scales';
    return;
  }
  // Паук: брюхо + карапакс + восемь ног.
  const isSpider = !!feat.legs;
  if (isSpider) {
    C.add(C.el.e(38, 52, 16, 14, P.base, ` stroke="${P.line}" stroke-width="2"`));
    C.add(C.el.e(34, 46, 8, 6, P.light, ' opacity="0.5"'));
    for (let i = 0; i < 3; i++) C.add(C.el.c(32 + i * 6, 56 + (i % 2) * 4, 2.6, P.a3 || P.spot || P.light));
    // Щитки карапакса.
    C.add(C.el.e(62, 58, 10, 9, P.a1 || P.plate || P.base, ` stroke="${P.line}" stroke-width="1.8"`));
    C.add(C.el.poly('56,52 62,49 68,52 64,56 58,56', P.light, P.line, 1.2));
    // Мандибулы.
    C.add(C.el.curve(`M70 62 q6 -2 8 2`, P.a2 || P.mid || P.dark, 2.6));
    C.add(C.el.curve(`M70 66 q6 2 8 -2`, P.a2 || P.mid || P.dark, 2.6));
    // Глаза: пара крупных + шесть мелких.
    if (!C.dead) {
      C.add(C.el.c(66, 55, 2, P.eye));
      C.add(C.el.c(70, 57, 1.6, P.eye));
      for (let i = 0; i < 6; i++) {
        C.add(C.el.c(60 + (i % 3) * 3.4, 61 + Math.floor(i / 3) * 3, 0.9, P.eye));
      }
    } else {
      C.add(C.el.c(66, 55, 1.4, P.line));
      C.add(C.el.c(70, 57, 1.1, P.line));
    }
    // Восемь ног (четыре на сторону).
    for (let i = 0; i < 4; i++) {
      bugLeg(C, 56 - i * 3, 56 + i, -1, i, t, true);
      bugLeg(C, 62 + i * 2, 64 - i, 1, i + 1, t, true);
    }
    // Паутинки сзади.
    C.add(C.el.curve(`M24 48 q-8 -4 -12 -10`, P.light, 0.8, ' opacity="0.6"'));
    C.add(C.el.curve(`M24 54 q-10 -2 -14 -6`, P.light, 0.8, ' opacity="0.6"'));
  } else {
    // Муравей / матка: три сегмента.
    const abdR = feat.bigAbdome ? 14 : 11;
    C.add(C.el.e(28, 62, abdR, abdR * 0.86, P.base, ` stroke="${P.line}" stroke-width="1.8"`));
    C.add(C.el.e(24, 57, abdR * 0.5, abdR * 0.35, P.light, ' opacity="0.5"'));
    for (let i = 0; i < 2; i++) C.add(C.el.c(24 + i * 8, 64 + (i % 2) * 3, 2.2, P.a3 || P.spot || P.light));
    C.add(C.el.e(50, 58, 9, 8, P.a1 || P.plate || P.base, ` stroke="${P.line}" stroke-width="1.6"`));
    C.add(C.el.e(47, 54, 4, 3, P.light, ' opacity="0.5"'));
    // Голова.
    C.add(C.el.e(70, 60, 8, 7.4, P.base, ` stroke="${P.line}" stroke-width="1.8"`));
    // Мандибулы.
    C.add(C.el.curve(`M76 58 q6 -3 8 1`, P.a4 || P.light, 2.2));
    C.add(C.el.curve(`M76 63 q6 3 8 -1`, P.a4 || P.light, 2.2));
    // Усики.
    C.add(C.el.curve(`M74 54 q3 -7 9 -9`, P.a2 || P.mid || P.dark, 1.4));
    C.add(C.el.curve(`M71 53 q1 -7 6 -11`, P.a2 || P.mid || P.dark, 1.4));
    // Глаза.
    if (!C.dead) {
      C.add(C.el.c(72, 58, 1.6, P.eye));
      C.add(C.el.c(67, 60, 1.2, P.eye));
    } else {
      C.add(C.el.c(72, 58, 1.1, P.line));
    }
    // Корона (матка): пять золотых шипов.
    if (feat.crown) {
      for (let i = 0; i < 5; i++) {
        const a = -1.9 + i * 0.28;
        C.add(C.el.ln(66 + i * 2, 54, 66 + i * 2 + Math.cos(a) * 8, 54 + Math.sin(a) * 8, P.a3 || P.gold || P.light, 2));
      }
    }
    // Шесть ног (три на сторону).
    for (let i = 0; i < 3; i++) {
      bugLeg(C, 46 - i * 4, 62, -1, i, t, true);
      bugLeg(C, 52 + i * 3, 64, 1, i + 1, t, true);
    }
  }
  C.add('</g>');
  C.region = { cx: 48, cy: 58, rx: 26, ry: 11 };
  C.fillerStyle = 'scales';
}

// --- Построитель: стихийники (огонь/вода/ветер/земля/голем) ---

function buildFlame(C) {
  const P = C.P, m = C.mob, ft = C.pose, feat = m.features || {};
  const kind = feat.kind || 'fire';
  // Гибель стихийника — не «сваленная» фигура, а остывший остаток.
  if (C.dead) return buildFlameDead(C, kind);
  const g1 = bodyGradient(C);
  const sw = ft.step * 2; // колебание
  if (kind === 'fire') {
    shadow(C, 30);
    // Основание — вал пепла с углями.
    C.add(C.el.e(50, 90, 26, 7, P.line, ' opacity="0.85"'));
    C.add(C.el.e(40, 88, 8, 4, P.a4 || P.line, ' opacity="0.6"'));
    C.add(C.el.e(60, 89, 9, 4, P.a4 || P.line, ' opacity="0.6"'));
    for (let i = 0; i < 5; i++) {
      C.add(C.el.c(34 + i * 8, 88 + (i % 2) * 3, 1.6, P.a2 || P.core));
    }
    // Внешнее пламя (тело).
    C.add(C.el.pth(
      `M50 ${f(92 - sw * 0.5)} C30 ${f(84)} 26 ${f(62)} 34 ${f(46)} C38 ${f(38)} 36 ${f(30)} 42 ${f(26 - sw)} ` +
      `C46 ${f(34)} 50 ${f(38)} 52 ${f(30 - sw * 1.4)} C56 ${f(38)} 54 ${f(20)} 62 ${f(16)} ` +
      `C60 ${f(26)} 66 ${f(34)} 64 ${f(44)} C74 ${f(52)} 78 ${f(72)} 68 ${f(84)} ` +
      `C62 ${f(90)} 56 ${f(92 - sw * 0.5)} 50 ${f(92 - sw * 0.5)} Z`,
      g1, P.line, 2));
    // Внутреннее пламя.
    C.add(C.el.pth(
      `M50 ${f(86)} C38 ${f(80)} 36 ${f(64)} 42 ${f(52)} C46 ${f(44)} 50 ${f(46)} 52 ${f(40)} ` +
      `C56 ${f(48)} 60 ${f(52)} 60 ${f(62)} C64 ${f(70)} 60 ${f(80)} 54 ${f(84)} Z`,
      P.a1 || P.flame, null, 0, ' opacity="0.9"'));
    // Ядро.
    C.add(C.el.e(50, 62, 9, 11, P.a2 || P.core, ` stroke="${P.line}" stroke-width="1.5"`));
    C.add(C.el.curve(`M45 56 q4 6 0 12`, P.a3 || P.tip, 1.4));
    C.add(C.el.curve(`M54 54 q3 7 1 14`, P.a3 || P.tip, 1.4));
    // Глаза-«угли» в ядре.
    C.add(C.el.c(46, 58, 1.8, P.a3 || P.tip));
    C.add(C.el.c(53, 58, 1.8, P.a3 || P.tip));
    // Языки пламени на макушке (фламм-фаза меняет их длину/наклон).
    const tongues = 6;
    for (let i = 0; i < tongues; i++) {
      const bx = 36 + i * 7;
      const h = 10 + 8 * Math.max(0, ft.flame) * Math.sin(i * 1.7 + sw * 3) * (0.7 + 0.3 * Math.sin(i));
      C.add(C.el.pth(
        `M${f(bx)} ${f(30 - i % 2 * 4)} q4 ${f(-h * 0.6)} 0 ${f(-h)} q-4 ${f(h * 0.6)} 0 ${f(h)} Z`,
        i % 2 ? P.a3 || P.tip : P.a1 || P.flame));
    }
    // Искры.
    for (let i = 0; i < 4; i++) {
      C.add(C.el.c(30 + i * 13, 24 + (i % 2) * 6, 1.1, P.a2 || P.core));
    }
  } else if (kind === 'water') {
    shadow(C, 32);
    // Основание — расстил.
    C.add(C.el.e(50, 91, 34, 6, P.a1 || P.waterD, ' opacity="0.7"'));
    // Купол.
    C.add(C.el.pth(
      `M24 ${f(92)} C${f(22 - sw)} ${f(70)} 30 ${f(50)} 44 ${f(44 - sw)} ` +
      `C50 ${f(40)} 58 ${f(40 + sw)} 64 ${f(46)} C76 ${f(54)} 80 ${f(72)} ${f(78 + sw)} ${f(92)} Z`,
      g1, P.line, 2));
    // Гребень волны.
    C.add(C.el.curve(`M28 ${f(76 - sw)} Q40 ${f(60)} 50 ${f(58 + sw)} T${f(72)} ${f(66)}`, P.a2 || P.tip, 2.4));
    // Течения.
    C.add(C.el.curve(`M32 ${f(80)} Q44 ${f(70 + sw)} 56 ${f(72)} T${f(72)} ${f(80)}`, P.a1 || P.waterD, 2));
    C.add(C.el.curve(`M36 ${f(64)} Q48 ${f(56 - sw)} 60 ${f(58)}`, P.deep || P.a1 || P.line, 1.8));
    // Брызги по кромке.
    for (let i = 0; i < 6; i++) {
      C.add(C.el.c(26 + i * 10, 88 + (i % 3) * 2, 1.6 - (i % 2) * 0.5, P.a2 || P.tip));
    }
    // Глаза-«капли» в глубине.
    C.add(C.el.e(44, 66, 2.4, 3.2, P.deep || P.a1 || P.line));
    C.add(C.el.e(56, 66, 2.4, 3.2, P.deep || P.a1 || P.line));
    C.add(C.el.c(43.4, 65, 0.8, P.a2 || P.tip));
    C.add(C.el.c(55.4, 65, 0.8, P.a2 || P.tip));
    // Пена на верхушке.
    C.add(C.el.c(48, 44, 2.4, P.a2 || P.tip, ' opacity="0.8"'));
    C.add(C.el.c(54, 42, 1.8, P.a2 || P.tip, ' opacity="0.8"'));
  } else if (kind === 'wind') {
    shadow(C, 26);
    // Основание — обрывки.
    C.add(C.el.e(50, 90, 24, 5, P.a3 || P.dark, ' opacity="0.5"'));
    for (let i = 0; i < 5; i++) {
      C.add(C.el.poly(`${f(30 + i * 10)},${f(86)} ${f(34 + i * 10)},${f(80)} ${f(38 + i * 10)},${f(88)}`, P.a3 || P.dark, null, 0, ' opacity="0.6"'));
    }
    // Ленты вихря (три, с фазой).
    C.add(C.el.curve(`M${f(28 - sw)} 84 C${f(18)} ${f(64)} ${f(30)} ${f(48 - sw)} ${f(50)} ${f(50)} C${f(70)} ${f(52)} ${f(78)} ${f(40)} ${f(66)} ${f(30 - sw * 2)}`, P.base, 5));
    C.add(C.el.curve(`M${f(32)} ${f(80 - sw)} C${f(26)} ${f(62)} ${f(40)} ${f(54)} ${f(54)} ${f(56 + sw)} C${f(68)} ${f(58)} ${f(70)} ${f(46)} ${f(60)} ${f(38)}`, P.a1 || P.light, 3));
    C.add(C.el.curve(`M${f(64 + sw)} ${f(84)} C${f(78)} ${f(66)} ${f(66)} ${f(54)} ${f(50)} ${f(52 - sw)} C${f(36)} ${f(50)} ${f(30)} ${f(62)} ${f(38)} ${f(70)}`, P.a2 || P.waterD, 2.6));
    // Ядро вихря.
    C.add(C.el.c(50, 54, 5, P.a2 || P.waterD, ' opacity="0.8"'));
    C.add(C.el.c(50, 54, 2.6, P.a1 || P.light));
    // Глаза-«точки» в центре.
    C.add(C.el.c(47, 53, 1.4, P.line));
    C.add(C.el.c(53, 53, 1.4, P.line));
    // Частички.
    for (let i = 0; i < 5; i++) {
      C.add(C.el.c(26 + i * 11, 30 + (i % 3) * 8, 1.2, P.a1 || P.light));
    }
  } else {
    // Земля / голем.
    shadow(C, 32);
    const golem = !!feat.golem;
    // Основание — глыбы.
    C.add(C.el.poly('18,92 30,80 44,88 36,92', P.dark, P.line, 1.5));
    C.add(C.el.poly('56,92 66,78 82,92', P.dark, P.line, 1.5));
    // Тело-валун.
    C.add(C.el.poly('28,88 24,64 34,48 50,42 66,48 76,64 72,88', P.base, P.line, 2.2));
    // Пластины (мозаика).
    C.add(C.el.poly('30,84 27,66 38,56 44,68 36,82', P.light, P.line, 1.4));
    C.add(C.el.poly('48,84 44,66 52,52 62,62 58,80', P.dark, P.line, 1.4));
    C.add(C.el.poly('64,82 60,62 70,54 72,68', P.light, P.line, 1.4));
    C.add(C.el.poly('36,52 44,46 52,50 42,58', P.dark, P.line, 1.2));
    C.add(C.el.poly('56,50 64,54 62,62 54,58', P.light, P.line, 1.2));
    // Трещины.
    C.add(C.el.ln(40, 70, 46, 76, P.line, 1.4));
    C.add(C.el.ln(58, 68, 54, 78, P.line, 1.4));
    C.add(C.el.ln(64, 74, 70, 80, P.line, 1.2));
    C.add(C.el.ln(34, 62, 38, 66, P.line, 1.2));
    // Прожилки земли.
    C.add(C.el.curve(`M32 76 q6 4 12 2`, P.a1 || P.soil || P.dark, 1.4));
    C.add(C.el.curve(`M56 82 q8 2 14 -2`, P.a1 || P.soil || P.dark, 1.4));
    if (golem) {
      // Голова-«блок».
      C.add(C.el.rect(38, 20, 24, 20, P.light, 4));
      C.add(C.el.ln(38, 28, 62, 28, P.line, 1.4));
      C.add(C.el.ln(50, 20, 50, 40, P.line, 1.4));
      // Глаза в трещине.
      C.add(C.el.c(45, 34, 2, P.a2 || P.core));
      C.add(C.el.c(55, 34, 2, P.a2 || P.core));
      if (!C.dead) {
        C.add(C.el.c(45, 34, 4, P.a2 || P.core, ' opacity="0.25"'));
        C.add(C.el.c(55, 34, 4, P.a2 || P.core, ' opacity="0.25"'));
      }
      // Рука-«глыба» и руна на груди.
      C.add(C.el.poly('72,56 84,52 88,66 78,72 70,66', P.base, P.line, 1.8));
      C.add(C.el.poly('50,58 56,64 50,70 44,64', P.a2 || P.core, P.line, 1.4));
      C.add(C.el.ln(47, 64, 53, 64, P.a3 || P.flame || P.line, 1.6));
      C.add(C.el.ln(50, 61, 50, 67, P.a3 || P.flame || P.line, 1.6));
    } else {
      // Ядро в трещине (земляной стихийник).
      C.add(C.el.e(50, 58, 7, 8, P.a3 || P.flame || P.line, ' opacity="0.9"'));
      C.add(C.el.e(50, 58, 4, 5, P.a2 || P.core));
      C.add(C.el.c(48, 56, 1.6, P.a3 || P.tip));
      C.add(C.el.c(52, 59, 1.6, P.a3 || P.tip));
    }
  }
  C.region = { cx: 50, cy: 56, rx: 22, ry: 24 };
  C.fillerStyle = kind === 'fire' ? 'embers' : (kind === 'water' ? 'droplets' : (kind === 'wind' ? 'motes' : 'cracks'));
}

// Гибель стихийника: остывший остаток (пепел/лужа/тишина/осколки).
function buildFlameDead(C, kind) {
  const P = C.P;
  shadow(C, 30);
  if (kind === 'fire') {
    C.add(C.el.e(50, 86, 28, 8, P.line, ' opacity="0.9"'));
    C.add(C.el.e(42, 82, 12, 6, P.a4 || P.line, ' opacity="0.7"'));
    C.add(C.el.e(58, 83, 14, 7, P.a4 || P.line, ' opacity="0.7"'));
    C.add(C.el.e(50, 76, 8, 5, P.dark, ' opacity="0.6"'));
    for (let i = 0; i < 7; i++) {
      C.add(C.el.c(32 + i * 6, 84 + (i % 2) * 3, 1.4, P.a2 || P.core, ' opacity="0.5"'));
    }
    // Дымок.
    C.add(C.el.curve(`M46 70 q-4 -8 0 -14`, P.line, 1.2, ' opacity="0.4"'));
    C.add(C.el.curve(`M54 72 q4 -10 0 -16`, P.line, 1.2, ' opacity="0.4"'));
  } else if (kind === 'water') {
    C.add(C.el.e(50, 88, 36, 7, P.base, ` stroke="${P.line}" stroke-width="1.5"`));
    C.add(C.el.e(50, 87, 24, 4, P.a1 || P.waterD, ' opacity="0.7"'));
    C.add(C.el.e(50, 86, 12, 2.5, P.a2 || P.tip, ' opacity="0.6"'));
    for (let i = 0; i < 6; i++) {
      C.add(C.el.c(28 + i * 8, 84 + (i % 2) * 4, 1.2, P.a2 || P.tip));
    }
  } else if (kind === 'wind') {
    C.add(C.el.e(50, 88, 26, 4, P.a3 || P.dark, ' opacity="0.4"'));
    C.add(C.el.curve(`M30 84 q10 -4 20 0 t20 0`, P.base, 2, ' opacity="0.5"'));
    C.add(C.el.curve(`M34 80 q10 -4 20 0`, P.a1 || P.light, 1.4, ' opacity="0.5"'));
    for (let i = 0; i < 5; i++) {
      C.add(C.el.c(30 + i * 10, 82 + (i % 2) * 3, 1, P.a1 || P.light, ' opacity="0.6"'));
    }
  } else {
    // Земля/голем: осколки.
    C.add(C.el.poly('24,92 34,76 46,88 38,92', P.base, P.line, 1.6));
    C.add(C.el.poly('48,92 58,74 70,92', P.light, P.line, 1.6));
    C.add(C.el.poly('64,92 72,82 80,92', P.dark, P.line, 1.4));
    C.add(C.el.poly('36,92 42,84 50,92', P.dark, P.line, 1.2));
    C.add(C.el.ln(30, 88, 40, 82, P.line, 1.2));
    C.add(C.el.ln(52, 86, 62, 80, P.line, 1.2));
    // Погасшая руна (тёмная, контур).
    C.add(C.el.poly('54,80 58,84 54,88 50,84', P.a2 || P.core, P.line, 1));
    C.add(C.el.ln(51, 84, 57, 84, P.line, 1));
    C.add(C.el.ln(54, 81, 54, 87, P.line, 1));
  }
  C.region = { cx: 50, cy: 84, rx: 28, ry: 8 };
  C.fillerStyle = 'pebbles';
}

// --- Бюджет деталей (MOBS.md: ≥ 30·w·h примитивов на кадр) ---
//
// База-фигура даёт 25–60 деталей; остаток добирается слоем «чертёжной
// детализации» (шрамы/трещины/шерсть/чешуя/капли/угли), позиционируемым
// детерминированно (rnd из makeCtx) в пределах C.region.

function fillBudget(C, target) {
  let count = countDetails(C.parts.join('\n'));
  const margin = 6; // запас над минимальным порогом
  let guard = 0;
  while (count < target + margin && guard < 400) {
    guard++;
    const a = C.rnd() * 2 * Math.PI;
    const rr = Math.sqrt(C.rnd());
    const x = C.region.cx + Math.cos(a) * rr * C.region.rx;
    const y = C.region.cy + Math.sin(a) * rr * C.region.ry;
    const s = C.rnd();
    const P = C.P;
    let el = null;
    switch (C.fillerStyle) {
      case 'scales': // чешуя: пары дуг
        el = C.el.curve(`M${f(x)} ${f(y)} q${f(2 + s * 2)} ${f(1 + s)} ${f(4 + s * 2)} 0`,
          s < 0.5 ? P.dark : P.line, 1.1);
        if (C.rnd() < 0.4) el += C.el.c(x + 2, y + 1, 0.7, P.a3 || P.light);
        break;
      case 'cracks': // трещины: ломаные линии
        el = C.el.ln(x, y, x + 2 + s * 3, y + 1 - s * 2, P.line, 1.1);
        if (C.rnd() < 0.4) el += C.el.ln(x + 2 + s * 3, y + 1 - s * 2,
          x + 4 + s * 3, y + 2, P.line, 0.9);
        break;
      case 'fur': // шерсть: короткие штрихи
        el = C.el.ln(x, y, x + 1 + s, y - 2 - s * 2, s < 0.5 ? P.dark : P.light, 1.2);
        break;
      case 'scars': // шрамы и пятна
        if (s < 0.6) el = C.el.curve(`M${f(x)} ${f(y)} q${f(2)} ${f(1 + s)} ${f(4)} 0`,
          P.line, 1.2);
        else el = C.el.e(x, y, 1.4 + s, 0.9, P.dark, ' opacity="0.55"');
        break;
      case 'drips': // капли/соки
        el = C.el.c(x, y, 0.8 + s * 0.8, s < 0.5 ? P.a2 || P.dark : P.a1 || P.light);
        break;
      case 'embers': // угли/искры
        el = C.el.c(x, y, 0.7 + s * 0.9, P.a2 || P.core);
        if (C.rnd() < 0.35) el += C.el.c(x + 1.5, y - 1.5, 0.5, P.a3 || P.tip);
        break;
      case 'droplets': // брызги
        el = C.el.e(x, y, 0.8, 1.2 + s, P.a2 || P.tip, ' opacity="0.8"');
        break;
      case 'motes': // частицы воздуха
        el = C.el.c(x, y, 0.6 + s * 0.7, P.a1 || P.light, ' opacity="0.7"');
        break;
      case 'pebbles': // камешки
        el = C.el.e(x, y, 1 + s, 0.7, s < 0.5 ? P.dark : P.light, ` stroke="${P.line}" stroke-width="0.8"`);
        break;
      default:
        el = C.el.c(x, y, 0.8 + s * 0.8, P.dark);
    }
    C.add(el);
    count = countDetails(C.parts.join('\n'));
  }
  if (count < target) {
    throw new Error(`${C.mob.id}: деталей ${count} < бюджета ${target} ` +
      `(заполнитель не справился за ${guard} итераций)`);
  }
}

// --- Сборка файла ---

function assembleSvg(C) {
  const S = C.S;
  const defs = C.gradients.length
    ? `<defs>\n${C.gradients.join('\n')}\n</defs>\n`
    : '';
  // Вся фигура — в единичном пространстве 100×100; до канваса
  // (S × S) растягивает один корневой group.
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}">\n` +
    `<!-- ${C.mob.name} — кадр ${C.poseName}: ${C.mob.id} -->\n` +
    `<g transform="scale(${C.u})">\n` +
    defs +
    C.parts.join('\n') + '\n' +
    `</g>\n` +
    `</svg>\n`;
}

// --- Диспетчер по семействам ---

function build(C) {
  const fam = C.mob.family;
  if (fam === 'flame') {
    buildFlame(C);
  } else if (fam === 'arthropod') {
    buildArthropod(C);
  } else if (fam === 'quadruped') {
    buildQuadruped(C);
  } else if (fam === 'skeleton') {
    buildSkeleton(C);
  } else {
    // orc / humanoid / demon → общая двуногая фигура.
    buildHumanoid(C);
  }
}

// --- Запуск ---

function main() {
  const mobsDir = join(ROOT, 'assets', 'mobs');
  const sizes = {};
  for (const file of readdirSync(mobsDir)) {
    if (/^\d{6}\.json$/.test(file)) {
      const d = JSON.parse(readFileSync(join(mobsDir, file), 'utf8'));
      sizes[d.id] = { w: d.size.w, h: d.size.h };
    }
  }
  const mobList = Object.values(MOBS_ART);
  if (Object.keys(sizes).length !== mobList.length) {
    throw new Error(`несовпадение: в assets/mobs ${Object.keys(sizes).length} ` +
      `JSON-файлов, в MOBS_ART — ${mobList.length} записей`);
  }
  mkdirSync(OUT, { recursive: true });
  const POSE_NAMES = ['move_1', 'move_2', 'attack_1', 'attack_2', 'dead_1'];
  let files = 0, minMargin = Infinity;
  for (const m of mobList) {
    const size = sizes[m.id];
    if (!size) throw new Error(`нет размера для ${m.id}`);
    const target = 30 * size.w * size.h;
    for (const pn of POSE_NAMES) {
      const C = makeCtx(m, size, pn);
      build(C);
      fillBudget(C, target);
      const text = assembleSvg(C);
      const real = countDetails(text);
      if (real < target) {
        throw new Error(`${m.id}_${pn}: деталей ${real} < ${target}`);
      }
      minMargin = Math.min(minMargin, real - target);
      const name = `${m.id}_${pn}.svg`;
      writeFileSync(join(OUT, name), text, 'utf8');
      files++;
    }
  }
  console.log(`Готово: ${files} файлов в assets/sprites/mobs, ` +
    `минимальный запас деталей над бюджетом: ${minMargin}`);
}

main();
