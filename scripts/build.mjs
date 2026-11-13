#!/usr/bin/env node
// Weatheo icons generator. Plain Node ESM, no dependencies.
//   node scripts/build.mjs          regenerate svg/, icons.json, docs/sheet.{svg,png}
//   node scripts/build.mjs --check  validate the generated files
//
// Every icon is a composition of primitives. A primitive is
//   fn(ctx, opts) -> SVG fragment string
// and may register gradients (ctx.grad) and CSS rules (ctx.css). Ids, classes
// and keyframes are prefixed with ctx.p ("wtc-<key>-") so icons can be inlined
// together. CSS is written only in the animated variant.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const C = {
  sunA: '#FCD34D', sunB: '#F59E0B', ray: '#F59E0B',
  moonA: '#E0E7FF', moonB: '#A5B4FC', star: '#C7D2FE',
  cloudA: '#FFFFFF', cloudB: '#E2E8F0', cloudS: '#CBD5E1',
  darkA: '#CBD5E1', darkB: '#94A3B8', darkS: '#64748B',
  rain: '#3B82F6', drizzle: '#60A5FA', snow: '#60A5FA', hail: '#93C5FD',
  bolt: '#FACC15', boltS: '#EAB308', line: '#94A3B8', dust: '#D6A35C',
};

/** Round to 2 decimals, as a short string. */
export const f = (n) => String(Math.round(n * 100) / 100);

/** New drawing context for one icon file. */
export function makeCtx(key) {
  return { key, p: `wtc-${key}-`, defs: new Map(), css: new Map() };
}

/** Linear gradient (dir 'v' top->bottom, 'd' diagonal). Returns `url(#id)`. */
export function grad(ctx, key, from, to, dir = 'v') {
  const id = ctx.p + key;
  if (!ctx.defs.has(id)) {
    const xy = dir === 'd' ? 'x1="0" y1="0" x2="1" y2="1"' : 'x1="0" y1="0" x2="0" y2="1"';
    ctx.defs.set(id, `<linearGradient id="${id}" ${xy}><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient>`);
  }
  return `url(#${id})`;
}

/** Register a CSS chunk once; "~" is replaced by the icon prefix. */
export function css(ctx, key, text) {
  if (!ctx.css.has(key)) ctx.css.set(key, text.replaceAll('~', ctx.p));
}

const FILLBOX = 'transform-box:fill-box;transform-origin:center;';

// ---------------------------------------------------------------- primitives

/** 8 round-capped rays around (cx,cy) from radius r1 to r2, stroke width w. Rotates. */
export function rays(ctx, { cx, cy, r1, r2, w = 3, n = 8 }) {
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (i * 2 * Math.PI) / n;
    const c = Math.cos(a), s = Math.sin(a);
    d += `M${f(cx + c * r1)} ${f(cy + s * r1)}L${f(cx + c * r2)} ${f(cy + s * r2)}`;
  }
  css(ctx, 'rays', `.~rays{${FILLBOX}animation:~spin 24s linear infinite}@keyframes ~spin{to{transform:rotate(360deg)}}`);
  return `<path class="${ctx.p}rays" d="${d}" stroke="${C.ray}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
}

/** Sun: rays + round gradient core of radius r. */
export function sun(ctx, { cx, cy, r }) {
  const fill = grad(ctx, 'sun', C.sunA, C.sunB, 'd');
  return rays(ctx, { cx, cy, r1: r * 1.3, r2: r * 1.75, w: Math.max(2.5, r * 0.27) }) +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}"/>`;
}

function arcTo(c, r, p1, p2, via) {
  const ang = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const norm = (a) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const d12 = norm(ang(p2) - ang(p1)), d1v = norm(ang(via) - ang(p1));
  const sweep = d1v < d12 ? 1 : 0;
  const span = sweep ? d12 : 2 * Math.PI - d12;
  return `A${f(r)} ${f(r)} 0 ${span > Math.PI ? 1 : 0} ${sweep} ${f(p2[0])} ${f(p2[1])}`;
}

/** Crescent moon of radius r, opening to the top-right. */
export function moon(ctx, { cx, cy, r }) {
  const O = [cx, cy], I = [cx + r * 0.6, cy - r * 0.45], ri = r * 0.8;
  const dx = I[0] - O[0], dy = I[1] - O[1], d = Math.hypot(dx, dy);
  const u = [dx / d, dy / d], v = [-u[1], u[0]];
  const a = (r * r - ri * ri + d * d) / (2 * d), h = Math.sqrt(r * r - a * a);
  const p1 = [O[0] + a * u[0] + h * v[0], O[1] + a * u[1] + h * v[1]];
  const p2 = [O[0] + a * u[0] - h * v[0], O[1] + a * u[1] - h * v[1]];
  const dd = `M${f(p1[0])} ${f(p1[1])}` +
    arcTo(O, r, p1, p2, [O[0] - r * u[0], O[1] - r * u[1]]) +
    arcTo(I, ri, p2, p1, [I[0] - ri * u[0], I[1] - ri * u[1]]) + 'Z';
  return `<path d="${dd}" fill="${grad(ctx, 'moon', C.moonA, C.moonB, 'd')}"/>`;
}

/** Four-point sparkle star of half-size s; i staggers the twinkle. */
export function star(ctx, { cx, cy, s, i = 0, color = C.star }) {
  const k = s * 0.2;
  const d = `M${f(cx)} ${f(cy - s)}Q${f(cx + k)} ${f(cy - k)} ${f(cx + s)} ${f(cy)}Q${f(cx + k)} ${f(cy + k)} ${f(cx)} ${f(cy + s)}` +
    `Q${f(cx - k)} ${f(cy + k)} ${f(cx - s)} ${f(cy)}Q${f(cx - k)} ${f(cy - k)} ${f(cx)} ${f(cy - s)}Z`;
  css(ctx, 'tw', `@keyframes ~tw{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}`);
  css(ctx, 'tw' + i, `.~t${i}{${FILLBOX}animation:~tw 2.4s ease-in-out ${f(-i * 1.1)}s infinite}`);
  return `<path class="${ctx.p}t${i}" d="${d}" fill="${color}"/>`;
}

/** Several stars: list of [cx, cy, s]. */
export const stars = (ctx, list) => list.map(([cx, cy, s], i) => star(ctx, { cx, cy, s, i })).join('');

/** Cloud outline path; bbox (x, y) to (x + 38.5s, y + 24s). */
export function cloudPath(x, y, s) {
  const P = (a, b) => `${f(x + a * s)} ${f(y + b * s)}`;
  return `M${P(8, 24)}A${f(8 * s)} ${f(8 * s)} 0 1 1 ${P(9.38, 8.12)}A${f(11 * s)} ${f(11 * s)} 0 0 1 ${P(30.82, 9)}` +
    `A${f(7.5 * s)} ${f(7.5 * s)} 0 1 1 ${P(31, 24)}Z`;
}
export const CLOUD_W = 38.5, CLOUD_H = 24;

/** Cloud at top-left (x,y), scale s; tone 'light' | 'dark'. i = drift phase (0/1). */
export function cloud(ctx, { x, y, s = 1, tone = 'light', i = 0 }) {
  const dark = tone === 'dark';
  const fill = dark ? grad(ctx, 'cd', C.darkA, C.darkB) : grad(ctx, 'cl', C.cloudA, C.cloudB);
  css(ctx, 'drift', `@keyframes ~drift{from{transform:translateX(-1.5px)}to{transform:translateX(1.5px)}}`);
  css(ctx, 'c' + i, `.~c${i}{animation:~drift 6s ease-in-out ${i ? '-3s ' : ''}infinite alternate${i ? '-reverse' : ''}}`);
  return `<path class="${ctx.p}c${i}" d="${cloudPath(x, y, s)}" fill="${fill}" stroke="${dark ? C.darkS : C.cloudS}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

/** Rain streaks: pts [[x, y]], each falls with a slant. */
export function drops(ctx, pts, { len = 8, w = 3, color = C.rain } = {}) {
  css(ctx, 'fall', `@keyframes ~fall{0%{transform:translate(1px,-3px);opacity:0}25%,75%{opacity:1}100%{transform:translate(-1px,4px);opacity:0}}`);
  return pts.map(([x, y], i) => {
    css(ctx, 'd' + i, `.~d${i}{animation:~fall 1.2s linear ${f(-((i * 0.45) % 1.2))}s infinite}`);
    return `<path class="${ctx.p}d${i}" d="M${f(x)} ${f(y)}l${f(-len * 0.29)} ${f(len * 0.96)}" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
  }).join('');
}

/** Six-arm snowflakes of arm length r at pts [[x, y]]; o offsets class index. */
export function flakes(ctx, pts, { r = 4.5, o = 0 } = {}) {
  css(ctx, 'snow', `@keyframes ~snow{0%{transform:translateY(-3px) rotate(0);opacity:0}20%,80%{opacity:1}100%{transform:translateY(4px) rotate(120deg);opacity:0}}`);
  return pts.map(([x, y], j) => {
    const i = j + o;
    css(ctx, 'f' + i, `.~f${i}{${FILLBOX}animation:~snow 3s linear ${f(-i * 1.15 % 3)}s infinite}`);
    const a = r * 0.866, b = r / 2;
    const d = `M${f(x)} ${f(y - r)}V${f(y + r)}M${f(x - a)} ${f(y - b)}L${f(x + a)} ${f(y + b)}M${f(x - a)} ${f(y + b)}L${f(x + a)} ${f(y - b)}`;
    return `<path class="${ctx.p}f${i}" d="${d}" stroke="${C.snow}" stroke-width="1.75" stroke-linecap="round"/>`;
  }).join('');
}

/** Hail stones of radius r with a white highlight. */
export function hail(ctx, pts, { r = 3.1 } = {}) {
  css(ctx, 'hail', `@keyframes ~bounce{0%{transform:translateY(-5px);opacity:0}40%{transform:translateY(0);opacity:1}55%{transform:translateY(-2px)}70%,90%{transform:translateY(0);opacity:1}100%{opacity:0}}`);
  return pts.map(([x, y], i) => {
    css(ctx, 'h' + i, `.~h${i}{animation:~bounce 1.6s ease-in ${f(-i * 0.37 % 1.6)}s infinite}`);
    return `<g class="${ctx.p}h${i}"><circle cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${C.hail}"/><circle cx="${f(x - r * 0.35)}" cy="${f(y - r * 0.35)}" r="${f(r * 0.35)}" fill="#fff"/></g>`;
  }).join('');
}

/** Lightning bolt, box 13s x 24s at top-left (x,y). Flashes. */
export function bolt(ctx, { x, y, s = 1 }) {
  const pts = [[7, 0], [0, 13], [5.5, 13], [3, 24], [13, 9], [7.5, 9], [11, 0]];
  const d = 'M' + pts.map(([a, b]) => `${f(x + a * s)} ${f(y + b * s)}`).join('L') + 'Z';
  css(ctx, 'bolt', `.~b{animation:~flash 2.4s linear infinite}@keyframes ~flash{0%,40%,50%,60%,100%{opacity:1}45%,55%{opacity:.2}}`);
  return `<path class="${ctx.p}b" d="${d}" fill="${C.bolt}" stroke="${C.boltS}" stroke-width="1" stroke-linejoin="round"/>`;
}

/** Horizontal fog lines [[x1, x2, y]], sliding in alternating directions. */
export function fogLines(ctx, lines, { color = C.line, w = 2.5 } = {}) {
  css(ctx, 'fog', `@keyframes ~fog{from{transform:translateX(-3px)}to{transform:translateX(3px)}}.~g0{animation:~fog 4s ease-in-out infinite alternate}.~g1{animation:~fog 4s ease-in-out infinite alternate-reverse}`);
  return lines.map(([x1, x2, y], i) =>
    `<path class="${ctx.p}g${i % 2}" d="M${f(x1)} ${f(y)}H${f(x2)}" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round"/>`).join('');
}

/** Wind (or dust) streams: SVG path strings, flowing via stroke-dashoffset. */
export function windLines(ctx, ds, { color = C.line, w = 2.5 } = {}) {
  css(ctx, 'flow', `@keyframes ~flow{0%,20%{stroke-dashoffset:0}100%{stroke-dashoffset:-200}}`);
  return ds.map((d, i) => {
    css(ctx, 'w' + i, `.~w${i}{stroke-dasharray:100 100;animation:~flow 3.2s linear ${f(-i * 0.7)}s infinite}`);
    return `<path class="${ctx.p}w${i}" pathLength="100" d="${d}" fill="none" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round"/>`;
  }).join('');
}

/** Dust particles [[x, y, r]] drifting sideways. */
export function dust(ctx, pts, { color = C.dust } = {}) {
  css(ctx, 'dust', `@keyframes ~dust{0%{transform:translateX(-3px);opacity:0}30%,70%{opacity:1}100%{transform:translateX(4px);opacity:0}}`);
  return pts.map(([x, y, r], i) => {
    css(ctx, 'p' + i, `.~p${i}{animation:~dust 2.4s linear ${f(-i * 0.55 % 2.4)}s infinite}`);
    return `<circle class="${ctx.p}p${i}" cx="${f(x)}" cy="${f(y)}" r="${f(r)}" fill="${color}"/>`;
  }).join('');
}

// Shared by the non-weather icons (moon phases, astro, measures, indices).
const PIVOT = (x, y) => `transform-box:view-box;transform-origin:${x}px ${y}px;`;
export const FONT = 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif';

/** Moon phase disc of radius r; p = phase 0..1 (0 new, .25 first quarter, .5 full, .75 last quarter).
 *  Northern hemisphere: waxing is lit on the right. Faint full disc + pulsing halo. */
export function moonPhase(ctx, { cx, cy, r, p }) {
  css(ctx, 'glow', `.~glow{${FILLBOX}animation:~glow 4s ease-in-out infinite alternate}@keyframes ~glow{from{opacity:.08;transform:scale(.94)}to{opacity:.35;transform:scale(1.04)}}`);
  let out = `<circle class="${ctx.p}glow" cx="${f(cx)}" cy="${f(cy)}" r="${f(r + 4)}" fill="${C.moonB}" opacity=".12"/>` +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${C.darkB}" fill-opacity=".22" stroke="${C.darkB}" stroke-opacity=".55" stroke-width="1.5"/>`;
  const fill = grad(ctx, 'moon', C.moonA, C.moonB, 'd');
  if (Math.abs(p - 0.5) < 1e-6) return out + `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${fill}" stroke="${C.moonB}" stroke-width="1.5"/>`;
  if (p < 1e-6 || p > 1 - 1e-6) return out;
  const waxing = p < 0.5, k = (1 - Math.cos(2 * Math.PI * p)) / 2;   // lit fraction
  const rx = r * Math.abs(1 - 2 * k), crescent = k < 0.5;
  const T = `${f(cx)} ${f(cy - r)}`, B = `${f(cx)} ${f(cy + r)}`;
  // outer limb top -> bottom on the lit side, terminator bottom -> top
  const outer = `A${f(r)} ${f(r)} 0 0 ${waxing ? 1 : 0} ${B}`;
  const viaLit = crescent; // crescent: terminator bulges toward the lit side
  const sweepT = waxing ? (viaLit ? 0 : 1) : (viaLit ? 1 : 0);
  const term = rx < 0.05 ? `L${T}` : `A${f(rx)} ${f(r)} 0 0 ${sweepT} ${T}`;
  return out + `<path d="M${T}${outer}${term}Z" fill="${fill}" stroke="${C.moonB}" stroke-width="1.5" stroke-linejoin="round"/>`;
}

/** Vertical arrow, tip at (x,y), pointing 'up' or 'down', length len. Nudges along its direction. */
export function arrow(ctx, { x, y, dir = 'up', len = 10, color = C.line, w = 2.5 }) {
  const s = dir === 'up' ? 1 : -1, h = len * 0.38;
  css(ctx, 'ar', `.~ar{animation:~ar 1.6s ease-in-out infinite alternate}@keyframes ~ar{from{transform:translateY(${s * 1.5}px)}to{transform:translateY(${-s * 1.5}px)}}`);
  const d = `M${f(x)} ${f(y + s * len)}V${f(y)}M${f(x - h)} ${f(y + s * h)}L${f(x)} ${f(y)}L${f(x + h)} ${f(y + s * h)}`;
  return `<path class="${ctx.p}ar" d="${d}" fill="none" stroke="${color}" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`;
}

/** Horizon at y with a sun or moon half-risen behind it, and an up/down arrow below. */
export function horizon(ctx, { body, dir, y = 41 }) {
  const id = ctx.p + 'hz';
  ctx.defs.set(id, `<clipPath id="${id}"><rect x="0" y="0" width="64" height="${f(y - 1.5)}"/></clipPath>`);
  const up = dir === 'up';
  css(ctx, 'rise', `.~rise{animation:~rise 3.6s ease-in-out infinite}@keyframes ~rise{0%{transform:translateY(${up ? 5 : 0}px)}50%,70%{transform:translateY(${up ? 0 : 5}px)}100%{transform:translateY(${up ? 5 : 0}px)}}`);
  let b;
  if (body === 'sun') {
    let d = '';
    for (let i = 0; i < 5; i++) {
      const a = Math.PI * (1.1 + i * 0.2), c = Math.cos(a), s = Math.sin(a);
      d += `M${f(32 + c * 18)} ${f(y + s * 18)}L${f(32 + c * 25)} ${f(y + s * 25)}`;
    }
    b = `<path d="${d}" stroke="${C.ray}" stroke-width="3.5" stroke-linecap="round"/>` +
      `<circle cx="32" cy="${f(y)}" r="13.5" fill="${grad(ctx, 'sun', C.sunA, C.sunB, 'd')}"/>`;
  } else b = moon(ctx, { cx: 30, cy: y - 3, r: 17 }) + star(ctx, { cx: 51, cy: 12, s: 4 });
  const col = body === 'sun' ? C.sunB : C.moonB;
  return `<g clip-path="url(#${id})"><g class="${ctx.p}rise">${b}</g></g>` +
    `<path d="M6 ${f(y)}H58" stroke="${C.line}" stroke-width="3" stroke-linecap="round"/>` +
    arrow(ctx, { x: 32, y: up ? y + 7 : y + 19, dir, len: 12, color: col, w: 3 });
}

/** Thermometer centred on x: tube + bulb outline, mercury that rises and falls. */
export function thermometer(ctx, { x = 32, from = '#F97316', to = '#EF4444', level = 20 }) {
  const by = 46, br = 8.5, tw = 5, yi = by - Math.sqrt(br * br - tw * tw);
  css(ctx, 'merc', `.~m{transform-box:fill-box;transform-origin:bottom;animation:~m 3s ease-in-out infinite alternate}@keyframes ~m{from{transform:scaleY(.82)}to{transform:scaleY(1)}}`);
  const merc = grad(ctx, 'merc', from, to);
  let ticks = '';
  for (let i = 0; i < 4; i++) ticks += `M${f(x + 8)} ${f(14 + i * 6)}h${i % 2 ? 2.5 : 4}`;
  return `<path d="M${f(x - tw)} ${f(yi)}V13A${tw} ${tw} 0 0 1 ${f(x + tw)} 13V${f(yi)}A${br} ${br} 0 1 1 ${f(x - tw)} ${f(yi)}Z" fill="#F8FAFC" stroke="${C.line}" stroke-width="2"/>` +
    `<rect class="${ctx.p}m" x="${f(x - 2)}" y="${f(level)}" width="4" height="${f(by - level)}" rx="2" fill="${merc}"/>` +
    `<circle cx="${f(x)}" cy="${by}" r="5.5" fill="${merc}"/>` +
    `<path d="${ticks}" stroke="${C.line}" stroke-width="1.5" stroke-linecap="round"/>`;
}

/** Water drop with a top point at (cx, cy - 22). bob = gentle up/down. */
export function waterDrop(ctx, { cx = 32, cy = 34, s = 1 }) {
  const P = (a, b) => `${f(cx + a * s)} ${f(cy + b * s)}`;
  css(ctx, 'bob', `.~bob{animation:~bob 2.4s ease-in-out infinite alternate}@keyframes ~bob{from{transform:translateY(-1.5px)}to{transform:translateY(1.5px)}}`);
  return `<path d="M${P(0, -24)}C${P(-4, -17)} ${P(-15, -5)} ${P(-15, 6)}A${f(15 * s)} ${f(15 * s)} 0 0 0 ${P(15, 6)}C${P(15, -5)} ${P(4, -17)} ${P(0, -24)}Z" fill="${grad(ctx, 'drop', '#60A5FA', '#2563EB')}"/>`;
}

/** Needle gauge (barometer): dial, ticks, swaying needle. */
export function gauge(ctx, { cx = 32, cy = 33, r = 23 }) {
  css(ctx, 'sway', `.~ndl{${PIVOT(cx, cy)}animation:~sway 3.2s ease-in-out infinite alternate}@keyframes ~sway{from{transform:rotate(-14deg)}to{transform:rotate(10deg)}}`);
  let t = '';
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI * (0.83 + i * 0.1675), c = Math.cos(a), s = Math.sin(a), r1 = i % 2 ? r - 5 : r - 7;
    t += `M${f(cx + c * r1)} ${f(cy + s * r1)}L${f(cx + c * (r - 3))} ${f(cy + s * (r - 3))}`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${grad(ctx, 'dial', C.cloudA, C.cloudB)}" stroke="${C.line}" stroke-width="2.5"/>` +
    `<path d="${t}" stroke="${C.line}" stroke-width="1.75" stroke-linecap="round"/>` +
    `<path class="${ctx.p}ndl" d="M${cx - 1.8} ${cy}L${cx + 5} ${cy - 15}L${cx + 1.8} ${cy + 1}Z" fill="#EF4444" stroke="#EF4444" stroke-width="1.5" stroke-linejoin="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="3.2" fill="${C.darkS}"/>` +
    `<path d="M${cx - 8} ${cy + 12}h16" stroke="${C.darkB}" stroke-width="2.5" stroke-linecap="round"/>`;
}

/** Rounded badge with short text (UV level). */
export function badge(ctx, { x, y, w, h, color, text, ink = '#fff', size = 17 }) {
  return `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" rx="7" fill="${color}"/>` +
    `<text x="${f(x + w / 2)}" y="${f(y + h / 2 + size * 0.36)}" fill="${ink}" font-family="${FONT}" font-size="${size}" font-weight="700" text-anchor="middle">${text}</text>`;
}

/** Pollen grain: spiky ball. i staggers the float. */
export function pollenGrain(ctx, { cx, cy, r, i = 0 }) {
  css(ctx, 'fl', `@keyframes ~fl{from{transform:translate(-1px,1.5px) rotate(-8deg)}to{transform:translate(1px,-1.5px) rotate(8deg)}}`);
  css(ctx, 'pg' + i, `.~pg${i}{${FILLBOX}animation:~fl 3s ease-in-out ${f(-i * 1.1)}s infinite alternate}`);
  let d = '';
  for (let k = 0; k < 10; k++) {
    const a = (k * Math.PI) / 5, c = Math.cos(a), s = Math.sin(a);
    d += `M${f(cx + c * r)} ${f(cy + s * r)}L${f(cx + c * (r + r * 0.32))} ${f(cy + s * (r + r * 0.32))}`;
  }
  const dots = [[-0.35, -0.3], [0.3, -0.1], [-0.05, 0.38]].map(([a, b]) => `<circle cx="${f(cx + a * r)}" cy="${f(cy + b * r)}" r="${f(r * 0.14)}" fill="#65A30D"/>`).join('');
  return `<g class="${ctx.p}pg${i}"><path d="${d}" stroke="#84CC16" stroke-width="${f(Math.max(1.5, r * 0.17))}" stroke-linecap="round"/>` +
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${grad(ctx, 'pol', '#FDE047', '#A3E635', 'd')}" stroke="#84CC16" stroke-width="1.5"/>${dots}</g>`;
}

// ---------------------------------------------------------------- icons

// Layout helpers shared by the compositions.
const PRECIP = { x: 9.85, y: 8, s: 1.15 };            // cloud above precipitation
const PART = { x: 15.5, y: 27.5, s: 1.13 };          // cloud in front of sun/moon
const SHOWER = { x: 17, y: 16, s: 1.05 };            // cloud in showers-day/night
const showerDrops = [[30, 45], [39.5, 48], [49, 45]];

export const ICONS = [
  { name: 'clear-day', title: 'Clear day', tags: ['sun', 'sunny', 'clear', 'day'], owm: ['01d'], owmIds: [800],
    draw: (c) => sun(c, { cx: 32, cy: 32, r: 13 }) },
  { name: 'clear-night', title: 'Clear night', tags: ['moon', 'night', 'clear', 'stars'], owm: ['01n'], owmIds: [800],
    draw: (c) => moon(c, { cx: 29, cy: 35, r: 19 }) + stars(c, [[47, 15, 5], [54, 30, 3.2]]) },
  { name: 'partly-cloudy-day', title: 'Partly cloudy day', tags: ['sun', 'cloud', 'partly', 'few clouds', 'day'], owm: ['02d'], owmIds: [801],
    draw: (c) => sun(c, { cx: 24, cy: 23, r: 10 }) + cloud(c, PART) },
  { name: 'partly-cloudy-night', title: 'Partly cloudy night', tags: ['moon', 'cloud', 'partly', 'few clouds', 'night'], owm: ['02n'], owmIds: [801],
    draw: (c) => moon(c, { cx: 21, cy: 23, r: 12 }) + stars(c, [[45, 12, 3.6], [54, 21, 2.4]]) + cloud(c, PART) },
  { name: 'cloudy', title: 'Cloudy', tags: ['cloud', 'clouds', 'scattered clouds'], owm: ['03d', '03n'], owmIds: [802],
    draw: (c) => cloud(c, { x: 7.95, y: 17, s: 1.25 }) },
  { name: 'overcast', title: 'Overcast', tags: ['clouds', 'overcast', 'broken clouds', 'grey'], owm: ['04d', '04n'], owmIds: [803, 804],
    draw: (c) => cloud(c, { x: 22, y: 12, s: 0.95, tone: 'dark', i: 1 }) + cloud(c, { x: 6, y: 24, s: 1.15 }) },
  { name: 'fog', title: 'Fog', tags: ['fog', 'mist', 'haze', 'smoke'], owm: ['50d', '50n'], owmIds: [701, 711, 721, 741],
    draw: (c) => cloud(c, { x: 10.8, y: 9, s: 1.1 }) + fogLines(c, [[12, 46, 40], [18, 54, 47], [10, 42, 54]]) },
  { name: 'drizzle', title: 'Drizzle', tags: ['drizzle', 'light rain', 'rain'], owm: [], owmIds: [300, 301, 302, 310, 311, 312, 313, 314, 321],
    draw: (c) => cloud(c, PRECIP) + drops(c, [[21, 42], [29, 47], [37, 42], [45, 47]], { len: 4.5, w: 2.5, color: C.drizzle }) },
  { name: 'rain', title: 'Rain', tags: ['rain', 'rainy', 'drops'], owm: ['09d', '09n'], owmIds: [500, 501],
    draw: (c) => cloud(c, PRECIP) + drops(c, [[23, 41], [33, 44], [43, 41]]) },
  { name: 'heavy-rain', title: 'Heavy rain', tags: ['heavy rain', 'downpour', 'rain', 'storm'], owm: [], owmIds: [502, 503, 504, 522, 531],
    draw: (c) => cloud(c, { ...PRECIP, tone: 'dark' }) + drops(c, [[19, 40], [26.5, 45], [34, 40], [41.5, 45], [49, 40]], { len: 9 }) },
  { name: 'showers-day', title: 'Showers (day)', tags: ['showers', 'rain', 'sun', 'day'], owm: ['10d'], owmIds: [520, 521],
    draw: (c) => sun(c, { cx: 20, cy: 18, r: 8 }) + cloud(c, SHOWER) + drops(c, showerDrops, { len: 7 }) },
  { name: 'showers-night', title: 'Showers (night)', tags: ['showers', 'rain', 'moon', 'night'], owm: ['10n'], owmIds: [520, 521],
    draw: (c) => moon(c, { cx: 19, cy: 18, r: 11 }) + star(c, { cx: 49, cy: 9, s: 3 }) + cloud(c, SHOWER) + drops(c, showerDrops, { len: 7 }) },
  { name: 'thunderstorms', title: 'Thunderstorms', tags: ['thunder', 'lightning', 'storm', 'bolt'], owm: [], owmIds: [210, 211, 212, 221],
    draw: (c) => cloud(c, { ...PRECIP, tone: 'dark' }) + bolt(c, { x: 25, y: 30, s: 1.1 }) },
  { name: 'thunderstorms-rain', title: 'Thunderstorms with rain', tags: ['thunder', 'lightning', 'storm', 'rain'], owm: ['11d', '11n'], owmIds: [200, 201, 202, 230, 231, 232],
    draw: (c) => cloud(c, { ...PRECIP, tone: 'dark' }) + drops(c, [[17, 41], [22, 49], [45, 41], [50, 49]], { len: 6 }) + bolt(c, { x: 25.5, y: 31 }) },
  { name: 'sleet', title: 'Sleet', tags: ['sleet', 'freezing rain', 'rain and snow', 'ice'], owm: [], owmIds: [511, 611, 612, 613, 615, 616],
    draw: (c) => cloud(c, PRECIP) + drops(c, [[22, 41], [44, 41]]) + flakes(c, [[32, 47]]) },
  { name: 'snow', title: 'Snow', tags: ['snow', 'snowflake', 'winter'], owm: ['13d', '13n'], owmIds: [600, 601, 620, 621],
    draw: (c) => cloud(c, PRECIP) + flakes(c, [[21, 44], [32, 50], [43, 44]]) },
  { name: 'heavy-snow', title: 'Heavy snow', tags: ['heavy snow', 'blizzard', 'snow', 'winter'], owm: [], owmIds: [602, 622],
    draw: (c) => cloud(c, { ...PRECIP, tone: 'dark' }) + flakes(c, [[18, 43], [32, 43], [46, 43], [25, 52], [39, 52]], { r: 3.75 }) },
  { name: 'hail', title: 'Hail', tags: ['hail', 'ice', 'storm'], owm: [], owmIds: [906],
    draw: (c) => cloud(c, { ...PRECIP, tone: 'dark' }) + hail(c, [[20, 43], [32, 43], [44, 43], [26, 52.5], [38, 52.5]]) },
  { name: 'wind', title: 'Wind', tags: ['wind', 'windy', 'breeze', 'gale', 'squall'], owm: [], owmIds: [771, 781, 905, 957],
    draw: (c) => windLines(c, ['M13 24H39a6 6 0 1 0-6-6', 'M9 33H49a6 6 0 1 1-6 6', 'M15 44H33a5 5 0 1 1-5 5']) },
  { name: 'dust', title: 'Dust', tags: ['dust', 'sand', 'sandstorm', 'haze'], owm: [], owmIds: [731, 751, 761, 762],
    draw: (c) => windLines(c, ['M10 22H40a6 6 0 1 0-6-6', 'M14 42H44a5 5 0 1 1-5 5'], { color: C.dust }) +
      dust(c, [[16, 31, 1.8], [26, 30, 1.4], [36, 32, 2], [47, 30, 1.5], [53, 36, 1.8], [22, 52, 1.5], [52, 50, 1.4]]) },
];

// ---------------------------------------------------------------- more icons

const PHASES = [['new', 'New moon', 0], ['waxing-crescent', 'Waxing crescent moon', 0.14], ['first-quarter', 'First quarter moon', 0.25],
  ['waxing-gibbous', 'Waxing gibbous moon', 0.36], ['full', 'Full moon', 0.5], ['waning-gibbous', 'Waning gibbous moon', 0.64],
  ['last-quarter', 'Last quarter moon', 0.75], ['waning-crescent', 'Waning crescent moon', 0.86]];
for (const [n, title, p] of PHASES) ICONS.push({ name: 'moon-' + n, title, category: 'moon',
  tags: ['moon', 'moon phase', 'lunar', ...n.split('-')], draw: (c) => moonPhase(c, { cx: 32, cy: 32, r: 20, p }) });

ICONS.push(
  { name: 'sunrise', title: 'Sunrise', category: 'astro', tags: ['sunrise', 'dawn', 'sun', 'morning'], draw: (c) => horizon(c, { body: 'sun', dir: 'up' }) },
  { name: 'sunset', title: 'Sunset', category: 'astro', tags: ['sunset', 'dusk', 'sun', 'evening'], draw: (c) => horizon(c, { body: 'sun', dir: 'down' }) },
  { name: 'moonrise', title: 'Moonrise', category: 'astro', tags: ['moonrise', 'moon', 'night'], draw: (c) => horizon(c, { body: 'moon', dir: 'up' }) },
  { name: 'moonset', title: 'Moonset', category: 'astro', tags: ['moonset', 'moon', 'night'], draw: (c) => horizon(c, { body: 'moon', dir: 'down' }) },

  { name: 'thermometer', title: 'Thermometer', category: 'measure', tags: ['temperature', 'thermometer', 'heat'], draw: (c) => thermometer(c, {}) },
  { name: 'thermometer-warmer', title: 'Temperature rising', category: 'measure', tags: ['temperature', 'warmer', 'rising', 'heat'],
    draw: (c) => thermometer(c, { x: 26, level: 16 }) + arrow(c, { x: 49, y: 12, dir: 'up', len: 14, color: '#EF4444', w: 3 }) },
  { name: 'thermometer-colder', title: 'Temperature falling', category: 'measure', tags: ['temperature', 'colder', 'falling', 'cold'],
    draw: (c) => thermometer(c, { x: 26, from: '#60A5FA', to: '#3B82F6', level: 30 }) + arrow(c, { x: 49, y: 30, dir: 'down', len: 14, color: '#3B82F6', w: 3 }) },
  { name: 'humidity', title: 'Humidity', category: 'measure', tags: ['humidity', 'moisture', 'percent', 'drop'],
    draw: (c) => `<g class="${c.p}bob">${waterDrop(c, { cy: 33 })}<circle cx="26.5" cy="35" r="3" fill="none" stroke="#fff" stroke-width="2.2"/><circle cx="37.5" cy="47" r="3" fill="none" stroke="#fff" stroke-width="2.2"/><path d="M38.5 33L25.5 49" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></g>` },
  { name: 'barometer', title: 'Barometer', category: 'measure', tags: ['pressure', 'barometer', 'gauge', 'hpa'], draw: (c) => gauge(c, {}) },
  { name: 'raindrop', title: 'Raindrop', category: 'measure', tags: ['rain', 'precipitation', 'drop', 'raindrop'],
    draw: (c) => `<g class="${c.p}bob">${waterDrop(c, { cy: 35 })}<path d="M23 40a9 9 0 0 0 5 8" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="2.5" stroke-linecap="round"/></g>` },
  { name: 'umbrella', title: 'Umbrella', category: 'measure', tags: ['umbrella', 'rain', 'precipitation', 'protection'],
    draw: (c) => drops(c, [[16, 3], [30, 1], [46, 3]], { len: 6, w: 2.5 }) +
      `<path d="M32 33V50a4 4 0 0 1-8 0" fill="none" stroke="${C.darkS}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M11 33A21 21 0 0 1 53 33Q47.75 28.5 42.5 33Q37.25 28.5 32 33Q26.75 28.5 21.5 33Q16.25 28.5 11 33Z" fill="${grad(c, 'umb', '#60A5FA', '#2563EB')}" stroke="#1D4ED8" stroke-width="1.5" stroke-linejoin="round"/>` +
      `<path d="M32 13Q26 22 26.5 31M32 13Q38 22 37.5 31" fill="none" stroke="#1D4ED8" stroke-opacity=".45" stroke-width="1.25"/>` },
  { name: 'compass', title: 'Wind direction', category: 'measure', tags: ['compass', 'wind direction', 'north', 'bearing'],
    draw: (c) => {
      css(c, 'wob', `.~ndl{transform-box:view-box;transform-origin:32px 32px;animation:~wob 2.6s ease-in-out infinite alternate}@keyframes ~wob{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}`);
      return `<circle cx="32" cy="32" r="24" fill="${grad(c, 'dial', C.cloudA, C.cloudB)}" stroke="${C.line}" stroke-width="2.5"/>` +
        `<path d="M32 8v4M56 32h-4M32 56v-4M8 32h4" stroke="${C.line}" stroke-width="2.5" stroke-linecap="round"/>` +
        `<g class="${c.p}ndl"><path d="M32 12L38 32H26Z" fill="#EF4444"/><path d="M26 32H38L32 52Z" fill="${C.darkB}"/><circle cx="32" cy="32" r="2.5" fill="#fff"/></g>`;
    } },
  { name: 'windsock', title: 'Windsock', category: 'measure', tags: ['windsock', 'wind', 'wind speed', 'airfield'],
    draw: (c) => {
      css(c, 'sock', `.~sock{transform-box:view-box;transform-origin:16px 20px;animation:~sock 1.4s ease-in-out infinite alternate}@keyframes ~sock{from{transform:rotate(1deg) scaleX(1)}to{transform:rotate(7deg) scaleX(.94)}}`);
      const seg = 4, x0 = 17, x1 = 54, t0 = 11, b0 = 29, t1 = 17, b1 = 25;
      let s = '';
      for (let i = 0; i < seg; i++) {
        const a = i / seg, b = (i + 1) / seg, X = (u) => x0 + (x1 - x0) * u, T = (u) => t0 + (t1 - t0) * u, B = (u) => b0 + (b1 - b0) * u;
        s += `<path d="M${f(X(a))} ${f(T(a))}L${f(X(b))} ${f(T(b))}V${f(B(b))}L${f(X(a))} ${f(B(a))}Z" fill="${i % 2 ? '#F8FAFC' : '#F97316'}"/>`;
      }
      return `<path d="M15 8V57" stroke="${C.darkS}" stroke-width="3" stroke-linecap="round"/>` +
        `<g class="${c.p}sock">${s}<path d="M${x0} ${t0}L${x1} ${t1}V${b1}L${x0} ${b0}Z" fill="none" stroke="${C.darkS}" stroke-width="1.5" stroke-linejoin="round"/></g>`;
    } },
);

const UV = [['low', 'UV index low', '#22C55E', '2'], ['moderate', 'UV index moderate', '#EAB308', '5'], ['high', 'UV index high', '#F97316', '7'],
  ['very-high', 'UV index very high', '#EF4444', '9'], ['extreme', 'UV index extreme', '#8B5CF6', '11+']];
for (const [n, title, color, text] of UV) ICONS.push({ name: 'uv-' + n, title, category: 'uv', tags: ['uv', 'uv index', 'sun', 'ultraviolet', n.replace('-', ' ')],
  draw: (c) => sun(c, { cx: 25, cy: 25, r: 10.5 }) + badge(c, { x: 29, y: 35, w: 31, h: 24, color, text, ink: n === 'moderate' ? '#422006' : '#fff', size: text.length > 2 ? 15 : 18 }) });

const AQI = [['good', 'Air quality good', '#22C55E'], ['moderate', 'Air quality moderate', '#EAB308'], ['unhealthy-sensitive', 'Air quality unhealthy for sensitive groups', '#F97316'],
  ['unhealthy', 'Air quality unhealthy', '#EF4444'], ['very-unhealthy', 'Air quality very unhealthy', '#8B5CF6'], ['hazardous', 'Air quality hazardous', '#7F1D1D']];
for (const [n, title, color] of AQI) ICONS.push({ name: 'aqi-' + n, title, category: 'aqi', tags: ['aqi', 'air quality', 'pollution', ...n.split('-')],
  draw: (c) => `<rect x="8" y="8" width="48" height="48" rx="14" fill="${color}"/>` +
    windLines(c, ['M17 25H37a5 5 0 1 0-5-5', 'M17 33H47', 'M17 41H35a5 5 0 1 1-5 5'], { color: '#fff', w: 3.5 }) });

ICONS.push({ name: 'pollen', title: 'Pollen', category: 'pollen', tags: ['pollen', 'allergy', 'hay fever', 'spring'],
  draw: (c) => pollenGrain(c, { cx: 25, cy: 25, r: 11, i: 0 }) + pollenGrain(c, { cx: 44, cy: 40, r: 9, i: 1 }) + pollenGrain(c, { cx: 21, cy: 49, r: 5.5, i: 2 }) });

const REDUCE = '@media (prefers-reduced-motion:reduce){*{animation:none!important}}';

/** Render one icon. key = prefix key (name, or OWM code for the copies). */
export function render(icon, { animated, key = icon.name }) {
  const ctx = makeCtx(key);
  let body = icon.draw(ctx);
  const defs = ctx.defs.size ? `<defs>${[...ctx.defs.values()].join('')}</defs>` : '';
  let style = '';
  if (animated) style = `<style>${[...ctx.css.values()].join('')}${REDUCE}</style>`;
  else body = body.replace(/ class="[^"]*"/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64" role="img"><title>${icon.title}</title>${defs}${style}${body}</svg>\n`;
}

// ---------------------------------------------------------------- output

function write(rel, text) {
  const p = path.join(ROOT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
}

/** Contact sheet of static icons at 64 and 24 px, on light and dark panels, grouped by category. */
export function sheet(icons) {
  const cols = 8, cw = 116, ch = 100, pad = 12, hh = 24;
  const cats = [...new Set(icons.map((ic) => ic.category || 'weather'))];
  const groups = cats.map((c) => [c, icons.filter((ic) => (ic.category || 'weather') === c)]);
  const ph = pad * 2 + groups.reduce((n, [, g]) => n + hh + Math.ceil(g.length / cols) * ch, 0);
  const pw = cols * cw + pad * 2;
  const syms = icons.map((ic) => {
    const s = render(ic, { animated: false, key: 'sheet-' + ic.name });
    const inner = s.replace(/^<svg[^>]*><title>[^<]*<\/title>/, '').replace(/<\/svg>\n$/, '');
    return `<symbol id="s-${ic.name}" viewBox="0 0 64 64">${inner}</symbol>`;
  }).join('');
  let out = '';
  const T = 'font-family="Helvetica,Arial,sans-serif"';
  [['#ffffff', '#334155'], ['#0d1117', '#cbd5e1']].forEach(([bg, fg], k) => {
    let y0 = k * ph + pad;
    out += `<rect x="0" y="${k * ph}" width="${pw}" height="${ph}" fill="${bg}"/>`;
    for (const [cat, g] of groups) {
      out += `<text x="${pad + 6}" y="${y0 + 16}" fill="${fg}" ${T} font-size="13" font-weight="bold">${cat.toUpperCase()}</text>`;
      y0 += hh;
      g.forEach((ic, i) => {
        const x = pad + (i % cols) * cw, y = y0 + Math.floor(i / cols) * ch;
        out += `<use href="#s-${ic.name}" x="${x + 6}" y="${y + 6}" width="64" height="64"/>`;
        out += `<use href="#s-${ic.name}" x="${x + 78}" y="${y + 26}" width="24" height="24"/>`;
        out += `<text x="${x + cw / 2}" y="${y + 88}" fill="${fg}" ${T} font-size="11" text-anchor="middle">${ic.name}</text>`;
      });
      y0 += Math.ceil(g.length / cols) * ch;
    }
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pw} ${ph * 2}" width="${pw}" height="${ph * 2}"><defs>${syms}</defs>${out}</svg>\n`;
}

export function build(icons = ICONS) {
  fs.rmSync(path.join(ROOT, 'svg'), { recursive: true, force: true });
  for (const ic of icons) {
    for (const animated of [true, false]) {
      const dir = animated ? 'svg/animated' : 'svg/static';
      write(`${dir}/${ic.name}.svg`, render(ic, { animated }));
      for (const code of ic.owm || []) write(`${dir}/owm/${code}.svg`, render(ic, { animated, key: code }));
    }
  }
  const meta = icons.map(({ name, title, category = 'weather', tags, owm = [], owmIds = [] }) => ({ name, title, category, tags, owm, owmIds }));
  write('icons.json', JSON.stringify(meta, null, 2) + '\n');
  write('docs/sheet.svg', sheet(icons));
  execFileSync('rsvg-convert', ['-o', path.join(ROOT, 'docs/sheet.png'), path.join(ROOT, 'docs/sheet.svg')]);
  console.log(`built ${icons.length} icons (+${icons.reduce((n, i) => n + (i.owm || []).length, 0)} OWM copies) x 2 variants`);
}

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : e.name.endsWith('.svg') ? [path.join(dir, e.name)] : []);
}

export function check() {
  const errs = [];
  const files = walk(path.join(ROOT, 'svg'));
  try { execFileSync('xmllint', ['--noout', ...files, path.join(ROOT, 'docs/sheet.svg')], { stdio: 'pipe' }); }
  catch (e) { errs.push('xmllint: ' + String(e.stderr).slice(0, 400)); }
  const ids = new Map();
  const max = { animated: [0, ''], static: [0, ''] };
  for (const file of files) {
    const rel = path.relative(ROOT, file), t = fs.readFileSync(file, 'utf8');
    const kind = rel.startsWith('svg/animated') ? 'animated' : 'static';
    const size = Buffer.byteLength(t);
    if (size > max[kind][0]) max[kind] = [size, rel];
    if (size > (kind === 'animated' ? 3072 : 2048)) errs.push(`${rel}: ${size} B too big`);
    if (/(href|url\()\s*=?\s*["']?\s*(https?:|\/\/)/i.test(t)) errs.push(`${rel}: external ref`);
    if (/<script/i.test(t)) errs.push(`${rel}: script`);
    if (kind === 'static' && /<style|animation/.test(t)) errs.push(`${rel}: static has style/animation`);
    if (!/role="img"/.test(t) || !/<title>/.test(t) || !/viewBox="0 0 64 64"/.test(t)) errs.push(`${rel}: root attrs`);
    if (kind === 'animated') {
      if (!t.includes('prefers-reduced-motion')) errs.push(`${rel}: no reduced-motion`);
      const prefix = 'wtc-' + path.basename(file, '.svg') + '-';
      for (const [, id] of t.matchAll(/\bid="([^"]+)"/g)) {
        if (ids.has(id)) errs.push(`duplicate id ${id} in ${rel} and ${ids.get(id)}`); else ids.set(id, rel);
        if (!id.startsWith(prefix)) errs.push(`${rel}: unprefixed id ${id}`);
      }
      for (const [, cls] of t.matchAll(/class="([^"]+)"/g)) for (const c of cls.split(' ')) if (!c.startsWith(prefix)) errs.push(`${rel}: unprefixed class ${c}`);
      for (const [, k] of t.matchAll(/@keyframes ([\w-]+)/g)) if (!k.startsWith(prefix)) errs.push(`${rel}: unprefixed keyframes ${k}`);
    }
  }
  const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'icons.json'), 'utf8'));
  for (const { name, owm = [] } of meta) {
    for (const v of ['animated', 'static']) {
      if (!fs.existsSync(path.join(ROOT, 'svg', v, name + '.svg'))) errs.push(`missing svg/${v}/${name}.svg`);
      for (const code of owm) if (!fs.existsSync(path.join(ROOT, 'svg', v, 'owm', code + '.svg'))) errs.push(`missing svg/${v}/owm/${code}.svg`);
    }
  }
  console.log(`checked ${files.length} svg files, ${meta.length} icons, ${ids.size} unique ids`);
  console.log(`largest animated: ${max.animated[1]} ${max.animated[0]} B (limit 3072)`);
  console.log(`largest static:   ${max.static[1]} ${max.static[0]} B (limit 2048)`);
  if (errs.length) { console.log(`FAIL ${errs.length}:\n` + errs.slice(0, 30).join('\n')); process.exitCode = 1; }
  else console.log('OK');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check(); else build();
}
