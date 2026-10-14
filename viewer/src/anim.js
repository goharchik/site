// Анимации: разбор файлов и вычисление значений во времени.
//
// Поддерживается:
//  - Bedrock .animation.json (формат Blockbench / Minecraft Bedrock)
//  - .anim — формат пока не известен; если файл оказался Bedrock JSON,
//    он откроется, иначе вернётся понятная ошибка с началом файла.

export class AnimFormatError extends Error {
  constructor(message, preview) { super(message); this.preview = preview; }
}

// clip: { name, length, loop, tracks: Map<имя кости/части, { rotation, position, scale }> }
export function parseAnimFile(fileName, text) {
  const trimmed = text.replace(/^﻿/, '').trimStart();
  if (trimmed.startsWith('{')) {
    let json;
    try { json = JSON.parse(trimmed); } catch (e) { throw new AnimFormatError(`Файл похож на JSON, но с ошибкой: ${e.message}`, preview(text)); }
    if (json.animations && typeof json.animations === 'object' && !Array.isArray(json.animations)) {
      return { format: 'Bedrock', clips: parseBedrock(json.animations) };
    }
    throw new AnimFormatError('Это JSON, но не анимация Bedrock (нет раздела "animations").', preview(text));
  }
  throw new AnimFormatError(`Формат файла ${fileName} пока не знаю.`, preview(text));
}

function preview(text) {
  return text.split(/\r?\n/).slice(0, 6).map((l) => (l.length > 90 ? l.slice(0, 90) + '…' : l)).join('\n');
}

// ---------- Bedrock ----------

function parseBedrock(anims) {
  const clips = [];
  for (const name in anims) {
    const a = anims[name] || {};
    const tracks = new Map();
    let maxT = 0;
    for (const bone in a.bones || {}) {
      const b = a.bones[bone] || {};
      const tr = {};
      for (const ch of ['rotation', 'position', 'scale']) {
        if (b[ch] === undefined) continue;
        tr[ch] = makeChannel(b[ch]);
        maxT = Math.max(maxT, tr[ch].end);
      }
      tracks.set(bone, tr);
    }
    const loop = a.loop === true || a.loop === 'true' || a.loop === 'hold_on_last_frame' ? a.loop : false;
    clips.push({ name, loop, length: +a.animation_length || maxT || 1, tracks });
  }
  return clips;
}

// Канал: либо постоянное значение, либо ключевые кадры { "0.5": [x,y,z] }
function makeChannel(v) {
  if (v && typeof v === 'object' && !Array.isArray(v) && !('pre' in v) && !('post' in v)) {
    const keys = Object.keys(v).map((k) => ({ t: parseFloat(k), v: v[k] })).filter((k) => isFinite(k.t)).sort((a, b) => a.t - b.t);
    const frames = keys.map((k) => {
      const val = k.v && typeof k.v === 'object' && !Array.isArray(k.v) ? k.v : { post: k.v };
      return { t: k.t, pre: vec(val.pre ?? val.post), post: vec(val.post ?? val.pre) };
    });
    return { frames, end: frames.length ? frames[frames.length - 1].t : 0 };
  }
  return { frames: [{ t: 0, pre: vec(v), post: vec(v) }], end: 0 };
}

// Значение: число, строка Molang или массив из трёх таких
function vec(v) {
  if (Array.isArray(v)) return [0, 1, 2].map((i) => expr(v[i] ?? v[0] ?? 0));
  const e = expr(v ?? 0);
  return [e, e, e];
}
function expr(x) {
  if (typeof x === 'number') return () => x;
  const s = String(x).trim();
  if (s === '') return () => 0;
  const n = Number(s);
  if (isFinite(n)) return () => n;
  return compileMolang(s);
}

export function evalChannel(ch, t) {
  if (!ch) return null;
  const f = ch.frames;
  if (!f.length) return null;
  const at = (fns) => [fns[0](t), fns[1](t), fns[2](t)];
  if (t <= f[0].t) return at(f[0].pre);
  for (let i = 0; i + 1 < f.length; i++) {
    const a = f[i], b = f[i + 1];
    if (t < b.t) {
      const k = (t - a.t) / (b.t - a.t || 1);
      const va = at(a.post), vb = at(b.pre);
      return [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k, va[2] + (vb[2] - va[2]) * k];
    }
  }
  return at(f[f.length - 1].post);
}

// ---------- Мини-Molang (без eval: только числа, + - * /, скобки, math.*, query.anim_time) ----------

const MATH = {
  sin: (d) => Math.sin(d * Math.PI / 180), cos: (d) => Math.cos(d * Math.PI / 180),
  abs: Math.abs, min: Math.min, max: Math.max, sqrt: Math.sqrt, floor: Math.floor, ceil: Math.ceil, round: Math.round,
  clamp: (v, a, b) => Math.min(Math.max(v, a), b), lerp: (a, b, k) => a + (b - a) * k, pow: Math.pow, mod: (a, b) => a % b,
};

function compileMolang(src) {
  const toks = src.toLowerCase().match(/\d*\.?\d+(?:e[+-]?\d+)?|[a-z_][a-z0-9_.]*|[-+*/(),?:<>=!&|]/g) || [];
  let i = 0;
  const peek = () => toks[i];
  const next = () => toks[i++];
  // каждая функция разбора возвращает функцию (t) => число
  const primary = () => {
    const tk = next();
    if (tk === undefined) return () => 0;
    if (tk === '(') { const e = add(); if (peek() === ')') next(); return e; }
    if (tk === '-') { const e = primary(); return (t) => -e(t); }
    if (/^[\d.]/.test(tk)) { const v = parseFloat(tk); return () => v; }
    if (peek() === '(') {
      next();
      const args = [];
      while (peek() !== undefined && peek() !== ')') { args.push(add()); if (peek() === ',') next(); }
      next();
      const fn = MATH[tk.replace(/^math\./, '')];
      if (!fn) return () => 0;
      return (t) => fn(...args.map((a) => a(t)));
    }
    if (tk === 'math.pi') return () => Math.PI;
    if (tk === 'query.anim_time' || tk === 'q.anim_time' || tk === 'query.life_time' || tk === 'q.life_time') return (t) => t;
    return () => 0; // прочие переменные — ноль
  };
  const mul = () => {
    let a = primary();
    while (peek() === '*' || peek() === '/') {
      const op = next(), b = primary(), l = a;
      a = op === '*' ? (t) => l(t) * b(t) : (t) => { const d = b(t); return d ? l(t) / d : 0; };
    }
    return a;
  };
  const add = () => {
    let a = mul();
    while (peek() === '+' || peek() === '-') {
      const op = next(), b = mul(), l = a;
      a = op === '+' ? (t) => l(t) + b(t) : (t) => l(t) - b(t);
    }
    return a;
  };
  try { const f = add(); return (t) => { const v = f(t); return isFinite(v) ? v : 0; }; } catch { return () => 0; }
}
