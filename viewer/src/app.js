import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { PACK_FILES } from './pack-files.js';

// ============================================================
//  Файлы: либо читаем по относительному пути (fetch), либо из
//  выбранной пользователем папки / набора файлов.
// ============================================================

function normPath(p) {
  const out = [];
  for (const seg of p.replace(/\\/g, '/').split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop(); else out.push(seg);
  }
  return out.join('/');
}
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
const baseOf = (p) => p.slice(p.lastIndexOf('/') + 1);
const extOf = (p) => { const b = baseOf(p).toLowerCase(); return b.endsWith('.geo.json') ? 'geo.json' : b.slice(b.lastIndexOf('.') + 1); };

const Files = {
  mode: 'fetch',
  byLower: new Map(), // путь в нижнем регистре -> { path, file? }

  useList(paths) {
    this.mode = 'fetch';
    this.byLower.clear();
    for (const p of paths) this.byLower.set(p.toLowerCase(), { path: p });
  },

  usePicked(fileList) {
    this.mode = 'picked';
    this.byLower.clear();
    const all = [...fileList];
    // Если выбрали папку — у всех файлов общий первый сегмент, убираем его
    const rel = all.map((f) => f.webkitRelativePath || f.name);
    const firsts = new Set(rel.map((r) => (r.includes('/') ? r.split('/')[0] : '')));
    const strip = firsts.size === 1 && [...firsts][0] !== '';
    all.forEach((f, i) => {
      const p = strip ? rel[i].slice(rel[i].indexOf('/') + 1) : rel[i];
      if (baseOf(p).toLowerCase() === 'desktop.ini') return;
      this.byLower.set(p.toLowerCase(), { path: p, file: f });
    });
  },

  paths() { return [...this.byLower.values()].map((e) => e.path); },
  get(p) { return this.byLower.get(normPath(p).toLowerCase()) || null; },

  // Ищем файл по пути; если нет — по имени в любой папке (часто в .mtl кривые пути)
  find(p) {
    const e = this.get(p);
    if (e) return e;
    const b = baseOf(normPath(p)).toLowerCase();
    for (const v of this.byLower.values()) if (!v.path.includes('/') && v.path.toLowerCase() === b) return v;
    for (const v of this.byLower.values()) if (baseOf(v.path).toLowerCase() === b) return v;
    return null;
  },

  async text(entry) {
    if (entry.file) return entry.file.text();
    const r = await fetch(encodePath(entry.path));
    if (!r.ok) throw new Error(`Не удалось загрузить ${entry.path} (${r.status})`);
    return r.text();
  },

  async blob(entry) {
    if (entry.file) return entry.file;
    const r = await fetch(encodePath(entry.path));
    if (!r.ok) throw new Error(`Не удалось загрузить ${entry.path} (${r.status})`);
    return r.blob();
  },
};
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');

// ============================================================
//  Промежуточная модель: части (parts) -> куски по текстурам.
//  Всё склеивается в 1 меш на текстуру = минимум отрисовок.
// ============================================================

// Мягкое освещение «запекается» в цвет вершин — никаких источников света
// на видеокарте, поэтому работает даже на очень слабых телефонах.
const LIGHT = new THREE.Vector3(0.45, 1, 0.65).normalize();
function shadeOf(nx, ny, nz) {
  const len = Math.hypot(nx, ny, nz) || 1;
  const d = (nx * LIGHT.x + ny * LIGHT.y + nz * LIGHT.z) / len;
  const s = 0.5 + 0.5 * (0.5 + 0.5 * d); // 0.5 .. 1
  return Math.pow(s, 2.2); // цвета вершин линейные
}

class PartSink {
  constructor() { this.parts = new Map(); }
  part(name) {
    let p = this.parts.get(name);
    if (!p) { p = { name, visible: true, chunks: new Map(), tris: 0 }; this.parts.set(name, p); }
    return p;
  }
  chunk(part, tex) {
    let c = part.chunks.get(tex);
    if (!c) { c = { pos: [], uv: [], col: [] }; part.chunks.set(tex, c); }
    return c;
  }
  // Четырёхугольник: TL, TR, BL, BR + uv в тех же углах
  quad(part, tex, v, uv) {
    const [a, b, c, d] = v;
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const wx = c.x - a.x, wy = c.y - a.y, wz = c.z - a.z;
    const s = shadeOf(wy * uz - wz * uy, wz * ux - wx * uz, wx * uy - wy * ux);
    const ch = this.chunk(part, tex);
    for (const i of [0, 2, 1, 1, 2, 3]) {
      const p = v[i];
      ch.pos.push(p.x, p.y, p.z);
      ch.uv.push(uv[i][0], uv[i][1]);
      ch.col.push(s, s, s);
    }
    part.tris += 2;
  }
  finish() {
    for (const p of this.parts.values())
      for (const [t, c] of p.chunks)
        p.chunks.set(t, { pos: new Float32Array(c.pos), uv: new Float32Array(c.uv), col: new Float32Array(c.col) });
    return [...this.parts.values()].filter((p) => p.tris > 0);
  }
}

// ---------- Кубы Blockbench / Bedrock ----------

const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const D2R = Math.PI / 180;
function pivotMatrix(pivot, rot) {
  const m = new THREE.Matrix4().makeTranslation(pivot[0], pivot[1], pivot[2]);
  if (rot && (rot[0] || rot[1] || rot[2])) {
    _e.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R, 'ZYX');
    m.multiply(_m.makeRotationFromEuler(_e));
  }
  return m.multiply(_m.makeTranslation(-pivot[0], -pivot[1], -pivot[2]));
}

const FACE_CORNERS = {
  north: (a, b) => [[b[0], b[1], a[2]], [a[0], b[1], a[2]], [b[0], a[1], a[2]], [a[0], a[1], a[2]]],
  south: (a, b) => [[a[0], b[1], b[2]], [b[0], b[1], b[2]], [a[0], a[1], b[2]], [b[0], a[1], b[2]]],
  east: (a, b) => [[b[0], b[1], b[2]], [b[0], b[1], a[2]], [b[0], a[1], b[2]], [b[0], a[1], a[2]]],
  west: (a, b) => [[a[0], b[1], a[2]], [a[0], b[1], b[2]], [a[0], a[1], a[2]], [a[0], a[1], b[2]]],
  up: (a, b) => [[a[0], b[1], a[2]], [b[0], b[1], a[2]], [a[0], b[1], b[2]], [b[0], b[1], b[2]]],
  down: (a, b) => [[a[0], a[1], b[2]], [b[0], a[1], b[2]], [a[0], a[1], a[2]], [b[0], a[1], a[2]]],
};

// Раскладка Box UV (как в Blockbench)
function boxUV(u, v, size, mirror) {
  const [w, h, d] = size;
  const r = {
    east: [0, d, d, h], west: [d + w, d, d, h],
    up: [d + w, d, -w, -d], down: [d + 2 * w, 0, -w, d],
    south: [2 * d + w, d, w, h], north: [d, d, w, h],
  };
  if (mirror) {
    for (const k in r) { r[k][0] += r[k][2]; r[k][2] *= -1; }
    const t = r.east[0]; r.east[0] = r.west[0]; r.west[0] = t;
  }
  const out = {};
  for (const k in r) { const [fx, fy, sx, sy] = r[k]; out[k] = { uv: [u + fx, v + fy, u + fx + sx, v + fy + sy] }; }
  return out;
}

// from/to — в пикселях Blockbench; faces: { north: { uv:[u1,v1,u2,v2], rotation, tex } }
function emitCube(sink, part, matrix, from, to, faces, texSize) {
  const S = 1 / 16;
  for (const name in FACE_CORNERS) {
    const f = faces[name];
    if (!f || !f.uv) continue;
    const tex = f.tex ?? 0;
    if (tex === null || tex < 0) continue;
    const corners = FACE_CORNERS[name](from, to).map((c) => new THREE.Vector3(c[0], c[1], c[2]).applyMatrix4(matrix).multiplyScalar(S));
    // площадь грани 0 — пропускаем
    const e1 = corners[1].clone().sub(corners[0]), e2 = corners[2].clone().sub(corners[0]);
    if (e1.cross(e2).lengthSq() < 1e-12) continue;
    const [tw, th] = texSize(tex);
    const [u1, v1, u2, v2] = f.uv;
    // углы по кругу TL, TR, BR, BL — для поворота uv
    let ring = [[u1, v1], [u2, v1], [u2, v2], [u1, v2]];
    const steps = (((f.rotation || 0) / 90) % 4 + 4) % 4;
    for (let i = 0; i < steps; i++) ring = [ring[3], ring[0], ring[1], ring[2]];
    const uvs = [ring[0], ring[1], ring[3], ring[2]].map(([u, v]) => [u / tw, 1 - v / th]);
    sink.quad(part, tex, corners, uvs);
  }
}

// ---------- Bedrock .geo.json ----------

function listGeometries(json) {
  const out = [];
  if (Array.isArray(json['minecraft:geometry'])) {
    for (const g of json['minecraft:geometry']) {
      const d = g.description || {};
      out.push({ id: d.identifier || 'geometry', texW: d.texture_width || 64, texH: d.texture_height || 64, bones: g.bones || [] });
    }
  }
  for (const k in json) {
    if (k.startsWith('geometry.')) {
      const g = json[k];
      out.push({ id: k, texW: g.texturewidth || 64, texH: g.textureheight || 64, bones: g.bones || [] });
    }
  }
  return out;
}

function parseGeo(geo) {
  const sink = new PartSink();
  const flipP = (p = [0, 0, 0]) => [-p[0], p[1], p[2]];
  const flipR = (r = [0, 0, 0]) => [-r[0], -r[1], r[2]];
  const byName = new Map(geo.bones.map((b) => [b.name, b]));
  const world = new Map();
  const boneMatrix = (b, depth = 0) => {
    if (world.has(b.name)) return world.get(b.name);
    const parent = b.parent && byName.get(b.parent);
    const pm = parent && depth < 64 ? boneMatrix(parent, depth + 1) : new THREE.Matrix4();
    const m = pm.clone().multiply(pivotMatrix(flipP(b.pivot), flipR(b.rotation)));
    world.set(b.name, m);
    return m;
  };
  for (const b of geo.bones) {
    const bm = boneMatrix(b);
    const part = sink.part(b.name || 'bone');
    for (const c of b.cubes || []) {
      const size = c.size || [0, 0, 0];
      const o = c.origin || [0, 0, 0];
      const inf = c.inflate ?? b.inflate ?? 0;
      const from = [-(o[0] + size[0]) - inf, o[1] - inf, o[2] - inf];
      const to = [-o[0] + inf, o[1] + size[1] + inf, o[2] + size[2] + inf];
      const m = c.rotation ? bm.clone().multiply(pivotMatrix(flipP(c.pivot), flipR(c.rotation))) : bm;
      let faces = {};
      if (Array.isArray(c.uv)) faces = boxUV(c.uv[0], c.uv[1], size, c.mirror ?? b.mirror);
      else if (c.uv && typeof c.uv === 'object') {
        for (const k in c.uv) {
          const f = c.uv[k];
          if (!f || !f.uv) continue;
          const s = f.uv_size || [0, 0];
          let uv = [f.uv[0], f.uv[1], f.uv[0] + s[0], f.uv[1] + s[1]];
          if (k === 'up' || k === 'down') uv = [uv[2], uv[3], uv[0], uv[1]];
          faces[k] = { uv, rotation: f.uv_rotation };
        }
      }
      emitCube(sink, part, m, from, to, faces, () => [geo.texW, geo.texH]);
    }
  }
  return sink.finish();
}

// ---------- Проект Blockbench .bbmodel ----------

function parseBBModel(json) {
  const sink = new PartSink();
  const res = json.resolution || { width: 16, height: 16 };
  const textures = json.textures || [];
  const texIndex = (t) => {
    if (t === null || t === false) return null;
    if (t === undefined) return 0;
    if (typeof t === 'number') return t;
    const i = textures.findIndex((x) => x.uuid === t || x.id === t);
    return i >= 0 ? i : 0;
  };
  const texSize = (i) => {
    const t = textures[i] || {};
    return [t.uv_width || res.width || 16, t.uv_height || res.height || 16];
  };
  const elements = new Map((json.elements || []).map((e) => [e.uuid, e]));
  const groupData = new Map((json.groups || []).map((g) => [g.uuid, g]));
  const used = new Set();

  const emitElement = (el, parentM, partName) => {
    if (!el || el.visibility === false || el.export === false) return;
    used.add(el.uuid);
    const part = sink.part(partName || el.name || 'element');
    const m = parentM.clone().multiply(pivotMatrix(el.origin || [0, 0, 0], el.rotation));
    if (el.type === 'mesh') { emitMesh(el, m, part); return; }
    if (el.type && el.type !== 'cube') return;
    const inf = el.inflate || 0;
    const from = el.from.map((x) => x - inf), to = el.to.map((x) => x + inf);
    const faces = {};
    for (const k in el.faces || {}) {
      const f = el.faces[k];
      if (!f || !f.uv) continue;
      const ti = texIndex(f.texture);
      if (ti === null) continue;
      faces[k] = { uv: f.uv, rotation: f.rotation, tex: ti };
    }
    emitCube(sink, part, m, from, to, faces, texSize);
  };

  const emitMesh = (el, m, part) => {
    const S = 1 / 16;
    // вершины меша заданы относительно origin
    const om = m.clone().multiply(_m.makeTranslation(...(el.origin || [0, 0, 0])));
    const V = {};
    for (const k in el.vertices) V[k] = new THREE.Vector3(...el.vertices[k]).applyMatrix4(om).multiplyScalar(S);
    for (const fk in el.faces) {
      const f = el.faces[fk];
      const ti = texIndex(f.texture);
      if (ti === null || !f.vertices || f.vertices.length < 3) continue;
      const [tw, th] = texSize(ti);
      let ks = f.vertices.slice(0, 4);
      const uvOf = (k) => { const u = (f.uv && f.uv[k]) || [0, 0]; return [u[0] / tw, 1 - u[1] / th]; };
      if (ks.length === 4) {
        // приводим 4 вершины к порядку «по кругу»
        const [a, b, c, d] = ks.map((k) => V[k]);
        const n1 = b.clone().sub(a).cross(c.clone().sub(a));
        const n2 = c.clone().sub(a).cross(d.clone().sub(a));
        if (n1.dot(n2) < 0) ks = [ks[0], ks[1], ks[3], ks[2]];
        const [p0, p1, p2, p3] = ks;
        // quad() ждёт TL,TR,BL,BR => (0,1,3,2) по кругу
        sink.quad(part, ti, [V[p0], V[p1], V[p3], V[p2]], [uvOf(p0), uvOf(p1), uvOf(p3), uvOf(p2)]);
      } else {
        const [p0, p1, p2] = ks;
        sink.quad(part, ti, [V[p0], V[p1], V[p2], V[p2]], [uvOf(p0), uvOf(p1), uvOf(p2), uvOf(p2)]);
        part.tris -= 1;
      }
    }
  };

  const walk = (node, parentM, partName) => {
    if (typeof node === 'string') { emitElement(elements.get(node), parentM, partName); return; }
    const g = Object.assign({}, groupData.get(node.uuid) || {}, node);
    if (g.visibility === false || g.export === false) return;
    const m = parentM.clone().multiply(pivotMatrix(g.origin || [0, 0, 0], g.rotation));
    for (const ch of node.children || []) walk(ch, m, g.name || partName);
  };
  for (const n of json.outliner || []) walk(n, new THREE.Matrix4(), null);
  for (const el of elements.values()) if (!used.has(el.uuid)) emitElement(el, new THREE.Matrix4(), null);

  return {
    parts: sink.finish(),
    textures: textures.map((t, i) => ({ key: 'bb' + i, label: t.name || `текстура ${i + 1}`, src: t.source ? { url: t.source, done() {} } : null })),
  };
}

// ---------- OBJ + MTL ----------

function parseMTL(text) {
  const mats = new Map();
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line[0] === '#') continue;
    const sp = line.search(/\s/);
    const key = (sp < 0 ? line : line.slice(0, sp)).toLowerCase();
    const rest = sp < 0 ? '' : line.slice(sp + 1).trim();
    if (key === 'newmtl') { cur = { name: rest, kd: [1, 1, 1], d: 1, map: null }; mats.set(rest, cur); }
    else if (!cur) continue;
    else if (key === 'kd') cur.kd = rest.split(/\s+/).map(Number).slice(0, 3);
    else if (key === 'd') cur.d = parseFloat(rest);
    else if (key === 'tr') cur.d = 1 - parseFloat(rest);
    else if (key === 'map_kd') {
      const t = rest.split(/\s+/);
      let i = 0;
      while (i < t.length - 1 && t[i].startsWith('-')) { i++; while (i < t.length - 1 && /^-?[\d.]+$/.test(t[i])) i++; }
      cur.map = t.slice(i).join(' ');
    }
  }
  return mats;
}

// Растущий Float32Array: в 4+ раза экономнее обычного массива чисел
class Grow {
  constructor(n = 4096) { this.a = new Float32Array(n); this.n = 0; }
  need(k) { if (this.n + k > this.a.length) { const b = new Float32Array(Math.max(this.a.length * 2, this.n + k)); b.set(this.a); this.a = b; } }
  push2(x, y) { this.need(2); this.a[this.n++] = x; this.a[this.n++] = y; }
  push3(x, y, z) { this.need(3); this.a[this.n++] = x; this.a[this.n++] = y; this.a[this.n++] = z; }
  done() { const r = this.a.slice(0, this.n); this.a = null; return r; }
}

// Свой разбор OBJ: файл читается кусочками и сразу пишется в типизированные
// массивы, поэтому большие модели не съедают память телефона.
class ObjParser {
  constructor() {
    this.V = new Grow(); this.T = new Grow(); this.N = new Grow();
    this.parts = new Map();
    this.mats = []; this.matIndex = new Map();
    this.partName = 'без имени';
    this.mi = null; this.out = null;
    this.mtllib = null;
    this.fv = []; this.ft = []; this.fn = [];
    this.rest = '';
  }
  // кусок текста; неполную последнюю строку оставляем до следующего куска
  feed(chunk, last = false) {
    const text = this.rest + chunk;
    let pos = 0;
    const L = text.length;
    for (;;) {
      let end = text.indexOf('\n', pos);
      if (end < 0) { if (!last) break; end = L; }
      if (pos >= L) break;
      this.line(text.slice(pos, end).trim());
      pos = end + 1;
    }
    this.rest = pos < L ? text.slice(pos) : '';
  }
  target() {
    if (this.mi === null) this.useMat('');
    let part = this.parts.get(this.partName);
    if (!part) { part = { name: this.partName, visible: true, chunks: new Map(), tris: 0 }; this.parts.set(this.partName, part); }
    let c = part.chunks.get(this.mi);
    if (!c) { c = { pos: new Grow(), uv: new Grow(), col: new Grow() }; part.chunks.set(this.mi, c); }
    this.out = { c, part };
  }
  useMat(name) {
    if (!this.matIndex.has(name)) { this.matIndex.set(name, this.mats.length); this.mats.push(name); }
    this.mi = this.matIndex.get(name); this.out = null;
  }
  line(line) {
    if (line.length < 2 || line[0] === '#') return;
    const c0 = line[0], c1 = line[1];
    if (c0 === 'v' && (c1 === ' ' || c1 === '\t')) {
      const t = line.split(/\s+/); this.V.push3(+t[1], +t[2], +t[3]);
    } else if (c0 === 'v' && c1 === 't') {
      const t = line.split(/\s+/); this.T.push2(+t[1], +(t[2] || 0));
    } else if (c0 === 'v' && c1 === 'n') {
      const t = line.split(/\s+/); this.N.push3(+t[1], +t[2], +t[3]);
    } else if (c0 === 'f' && (c1 === ' ' || c1 === '\t')) {
      this.face(line);
    } else if ((c0 === 'o' || c0 === 'g') && (c1 === ' ' || c1 === '\t')) {
      this.partName = line.slice(2).trim() || 'без имени'; this.out = null;
    } else if (line.startsWith('usemtl')) {
      this.useMat(line.slice(6).trim());
    } else if (line.startsWith('mtllib') && !this.mtllib) {
      this.mtllib = line.slice(6).trim();
    }
  }
  face(line) {
    if (!this.out) this.target();
    const { fv, ft, fn } = this;
    const idx = (str, len) => { const i = parseInt(str, 10); return i < 0 ? len + i : i - 1; };
    const t = line.split(/\s+/);
    fv.length = ft.length = fn.length = 0;
    const nv = this.V.n / 3, nt = this.T.n / 2, nn = this.N.n / 3;
    for (let i = 1; i < t.length; i++) {
      const [a, b, c] = t[i].split('/');
      fv.push(idx(a, nv)); ft.push(b ? idx(b, nt) : -1); fn.push(c ? idx(c, nn) : -1);
    }
    const va = this.V.a, ta = this.T.a, na = this.N.a;
    const out = this.out;
    for (let k = 1; k + 1 < fv.length; k++) {
      // нормаль треугольника — на случай, если в файле нет своих
      const p0 = fv[0] * 3, p1 = fv[k] * 3, p2 = fv[k + 1] * 3;
      const ux = va[p1] - va[p0], uy = va[p1 + 1] - va[p0 + 1], uz = va[p1 + 2] - va[p0 + 2];
      const wx = va[p2] - va[p0], wy = va[p2 + 1] - va[p0 + 1], wz = va[p2 + 2] - va[p0 + 2];
      const flat = shadeOf(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx);
      for (const j of [0, k, k + 1]) {
        const vi = fv[j] * 3;
        out.c.pos.push3(va[vi], va[vi + 1], va[vi + 2]);
        const tj = ft[j];
        if (tj >= 0) out.c.uv.push2(ta[tj * 2], ta[tj * 2 + 1]); else out.c.uv.push2(0, 0);
        const nj = fn[j];
        let sh = flat;
        if (nj >= 0 && (na[nj * 3] || na[nj * 3 + 1] || na[nj * 3 + 2])) sh = shadeOf(na[nj * 3], na[nj * 3 + 1], na[nj * 3 + 2]);
        out.c.col.push3(sh, sh, sh);
      }
      out.part.tris++;
    }
  }
  // Материалы известны только после чтения .mtl — склеиваем одинаковые текстуры
  finish(mtl, objPath) {
    this.V = this.T = this.N = null;
    const textures = [], texKeys = new Map();
    const remap = this.mats.map((name) => {
      const m = mtl.get(name);
      const key = m ? (m.map ? 'map:' + normPath(dirOf(objPath) + m.map).toLowerCase() + '|' + m.kd.join(',') + '|' + m.d : 'mat:' + name) : 'none';
      if (!texKeys.has(key)) {
        texKeys.set(key, textures.length);
        textures.push({
          key, label: m ? (m.map ? baseOf(m.map) : `цвет ${name}`) : 'без материала',
          mapPath: m && m.map ? normPath(dirOf(objPath) + m.map) : null,
          kd: m ? m.kd : [0.8, 0.8, 0.8], opacity: m ? m.d : 1,
        });
      }
      return texKeys.get(key);
    });
    const parts = [];
    for (const p of this.parts.values()) {
      if (!p.tris) continue;
      const lists = new Map();
      for (const [mi, c] of p.chunks) {
        const ti = remap[mi];
        if (!lists.has(ti)) lists.set(ti, []);
        lists.get(ti).push({ pos: c.pos.done(), uv: c.uv.done(), col: c.col.done() });
      }
      p.chunks = new Map([...lists].map(([ti, l]) => [ti, concatChunks(l)]));
      parts.push(p);
    }
    return { parts, textures };
  }
}

// Читаем файл кусочками (без одной гигантской строки в памяти)
async function streamText(blob, onChunk) {
  if (blob.stream && window.TextDecoderStream) {
    const reader = blob.stream().pipeThrough(new TextDecoderStream()).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      onChunk(value, false);
    }
    onChunk('', true);
  } else {
    onChunk(await blob.text(), true);
  }
}

function concatChunks(list) {
  if (list.length === 1) return list[0];
  const len = (k) => list.reduce((s, c) => s + c[k].length, 0);
  const out = { pos: new Float32Array(len('pos')), uv: new Float32Array(len('uv')), col: new Float32Array(len('col')) };
  for (const k of ['pos', 'uv', 'col']) { let o = 0; for (const c of list) { out[k].set(c[k], o); o += c[k].length; } }
  return out;
}

// ============================================================
//  Сцена
// ============================================================

const $ = (id) => document.getElementById(id);
const canvas = $('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'low-power', preserveDrawingBuffer: false });
renderer.setClearColor(0x161a22, 1);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
camera.position.set(6, 4, 8);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = false;
controls.screenSpacePanning = true;
controls.addEventListener('change', () => requestRender());

const modelRoot = new THREE.Group();
scene.add(modelRoot);
let grid = null;

const QUALITY = {
  potato: { label: 'Чайник', ratio: 0.7, maxTex: 512, mip: false },
  normal: { label: 'Норм', ratio: 1, maxTex: 1024, mip: true },
  high: { label: 'Красиво', ratio: 2, maxTex: 4096, mip: true },
};

const store = {
  get(k, d) { try { return localStorage.getItem('mv.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mv.' + k, v); } catch { /* приватный режим */ } },
};

function guessQuality() {
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  return mem <= 3 || cores <= 4 ? 'potato' : 'normal';
}

const state = {
  quality: store.get('quality', guessQuality()),
  glass: store.get('glass', '1') === '1',
  wire: false,
  spin: false,
  grid: store.get('grid', '1') === '1',
  current: null, // { car, parts, textures, pixelArt, doubleSide }
  cars: new Map(),
  variant: '',
  texList: [], // загруженные THREE.Texture по индексу
  materials: [],
};
if (!QUALITY[state.quality]) state.quality = 'normal';

let needRender = true;
function requestRender() { needRender = true; }

function resize() {
  const q = QUALITY[state.quality];
  const ratio = Math.min(window.devicePixelRatio || 1, q.ratio);
  renderer.setPixelRatio(ratio);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / Math.max(h, 1);
  camera.updateProjectionMatrix();
  requestRender();
}
new ResizeObserver(resize).observe(canvas);

let frames = 0, fpsT = performance.now(), fps = 0;
function loop(t) {
  requestAnimationFrame(loop);
  if (state.spin) { controls.update(); needRender = true; }
  if (!needRender) return;
  needRender = false;
  renderer.render(scene, camera);
  frames++;
  if (t - fpsT > 1000) { fps = Math.round((frames * 1000) / (t - fpsT)); frames = 0; fpsT = t; updateStats(); }
}
requestAnimationFrame(loop);

// ---------- Текстуры ----------

// Размер картинки из заголовка файла (PNG/JPEG) — без распаковки
async function imageSize(blob) {
  const b = new Uint8Array(await blob.slice(0, 65536).arrayBuffer());
  if (b[0] === 0x89 && b[1] === 0x50) {
    const dv = new DataView(b.buffer);
    return [dv.getUint32(16), dv.getUint32(20)];
  }
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      const len = (b[i + 2] << 8) | b[i + 3];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc)
        return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
      i += 2 + len;
    }
  }
  return null;
}

async function decodeImage(blob, w, h) {
  // Сразу уменьшаем при распаковке — так большие текстуры не забивают память
  if (window.createImageBitmap) {
    try {
      return w ? await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: 'medium' }) : await createImageBitmap(blob);
    } catch { /* старый браузер — ниже запасной путь */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally { URL.revokeObjectURL(url); }
}

async function loadTexture(blob, opts) {
  if (!blob) return null;
  const q = QUALITY[state.quality];
  const size = await imageSize(blob).catch(() => null);
  let w = 0, h = 0;
  if (size && !opts.pixelArt) {
    const k = Math.min(1, q.maxTex / Math.max(size[0], size[1]));
    if (k < 1) { w = Math.max(1, Math.round(size[0] * k)); h = Math.max(1, Math.round(size[1] * k)); }
  }
  let img;
  try { img = await decodeImage(blob, w, h); } catch { return null; }
  let iw = img.width || img.naturalWidth, ih = img.height || img.naturalHeight;
  // если размер не узнали заранее — ужимаем здесь
  const k = opts.pixelArt ? 1 : Math.min(1, q.maxTex / Math.max(iw, ih));
  const cw = Math.max(1, Math.round(iw * k)), ch = Math.max(1, Math.round(ih * k));
  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = !opts.pixelArt;
  ctx.drawImage(img, 0, 0, cw, ch);
  if (img.close) img.close();
  img = null;
  // есть ли прозрачность (проверяем маленькую копию — быстро)
  let alpha = false;
  if (!/\.jpe?g$/i.test(opts.name || '')) {
    const sw = Math.min(cw, 64), sh = Math.min(ch, 64);
    const tmp = document.createElement('canvas'); tmp.width = sw; tmp.height = sh;
    const tc = tmp.getContext('2d', { willReadFrequently: true });
    tc.drawImage(cv, 0, 0, sw, sh);
    const d = tc.getImageData(0, 0, sw, sh).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { alpha = true; break; }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  if (opts.pixelArt) { tex.magFilter = THREE.NearestFilter; tex.minFilter = q.mip ? THREE.NearestMipmapLinearFilter : THREE.NearestFilter; }
  else { tex.magFilter = THREE.LinearFilter; tex.minFilter = q.mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; }
  tex.generateMipmaps = q.mip;
  if (state.quality === 'high') tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  tex.userData.alpha = alpha;
  return tex;
}

// Подмена текстуры из папки-окраски (например 81-502_blue/81-502.png)
function resolveTexturePath(p) {
  if (state.variant) {
    const v = Files.get(state.variant + '/' + baseOf(p));
    if (v) return v;
  }
  return Files.find(p);
}

function variantsFor(texPaths) {
  const names = new Set(texPaths.map((p) => baseOf(p).toLowerCase()));
  const dirs = new Map();
  for (const p of Files.paths()) {
    if (!p.includes('/')) continue;
    const d = p.slice(0, p.lastIndexOf('/'));
    if (names.has(baseOf(p).toLowerCase())) dirs.set(d, (dirs.get(d) || 0) + 1);
  }
  return [...dirs.keys()].sort();
}

// ---------- Сборка сцены из частей ----------

function clearModel() {
  for (const ch of [...modelRoot.children]) { ch.geometry.dispose(); modelRoot.remove(ch); }
  renderer.renderLists.dispose();
  state.materials.forEach((m) => m.dispose());
  state.materials = [];
}
function disposeTextures() { state.texList.forEach((t) => t && t.dispose()); state.texList = []; }

function makeMaterial(i) {
  const cur = state.current;
  const info = cur.textures[i] || {};
  const tex = state.texList[i] || null;
  const m = new THREE.MeshBasicMaterial({ map: tex, vertexColors: true, side: cur.doubleSide ? THREE.DoubleSide : THREE.FrontSide });
  if (info.kd) m.color.setRGB(info.kd[0], info.kd[1], info.kd[2], THREE.SRGBColorSpace);
  const hasAlpha = tex && tex.userData.alpha;
  const opacity = info.opacity ?? 1;
  if (state.glass && (opacity < 0.999 || hasAlpha)) {
    m.transparent = true; m.opacity = opacity; m.alphaTest = 0.02; m.depthWrite = opacity > 0.6;
  } else if (hasAlpha) {
    m.alphaTest = 0.5;
  }
  m.wireframe = state.wire;
  return m;
}

// Собираем меши один раз: по мешу на текстуру, части лежат подряд.
// Исходные куски после этого выбрасываем — модель хранится в памяти один раз.
function buildMeshes() {
  clearModel();
  const cur = state.current;
  if (!cur) return;
  const byTex = new Map();
  for (const p of cur.parts) {
    p.ranges = [];
    for (const [ti, c] of p.chunks) { if (!byTex.has(ti)) byTex.set(ti, []); byTex.get(ti).push({ p, c }); }
  }
  for (const [ti, list] of byTex) {
    const vcount = list.reduce((s, x) => s + x.c.pos.length / 3, 0);
    const pos = new Float32Array(vcount * 3), uv = new Float32Array(vcount * 2), col = new Float32Array(vcount * 3);
    let o = 0;
    for (const { p, c } of list) {
      const n = c.pos.length / 3;
      pos.set(c.pos, o * 3); uv.set(c.uv, o * 2); col.set(c.col, o * 3);
      p.ranges.push({ ti, start: o, count: n });
      o += n;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingBox();
    g.computeBoundingSphere();
    const mesh = new THREE.Mesh(g);
    mesh.userData.ti = ti;
    mesh.matrixAutoUpdate = false;
    modelRoot.add(mesh);
  }
  for (const p of cur.parts) p.chunks = null;
  refreshMaterials();
}

function refreshMaterials() {
  state.materials.forEach((m) => m.dispose());
  state.materials = [];
  for (const mesh of modelRoot.children) {
    const m = makeMaterial(mesh.userData.ti);
    state.materials.push(m);
    mesh.userData.mat = m;
  }
  applyVisibility();
}

// Скрытые части просто не рисуем (группы диапазонов), ничего не пересобирая
function applyVisibility() {
  const cur = state.current;
  if (!cur) return;
  for (const mesh of modelRoot.children) {
    const ti = mesh.userData.ti;
    const all = [], vis = [];
    for (const p of cur.parts) for (const r of p.ranges) if (r.ti === ti) { all.push(r); if (p.visible) vis.push(r); }
    const g = mesh.geometry;
    g.clearGroups();
    mesh.visible = vis.length > 0;
    if (vis.length === all.length) { mesh.material = mesh.userData.mat; continue; }
    vis.sort((a, b) => a.start - b.start);
    let s0 = -1, e0 = -1;
    for (const r of vis) {
      if (r.start === e0) { e0 += r.count; continue; }
      if (s0 >= 0) g.addGroup(s0, e0 - s0, 0);
      s0 = r.start; e0 = r.start + r.count;
    }
    if (s0 >= 0) g.addGroup(s0, e0 - s0, 0);
    mesh.material = [mesh.userData.mat];
  }
  updateStats();
  requestRender();
}

function fitCamera() {
  const box = new THREE.Box3().setFromObject(modelRoot);
  if (box.isEmpty()) return;
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) || 1;
  controls.target.copy(center);
  const dist = r * 1.35 / Math.tan((camera.fov * D2R) / 2) * 0.6;
  camera.position.copy(center).add(new THREE.Vector3(0.9, 0.55, 1).normalize().multiplyScalar(dist));
  camera.near = r / 500; camera.far = r * 50;
  camera.updateProjectionMatrix();
  controls.update();
  if (grid) { scene.remove(grid); grid.geometry.dispose(); grid.material.dispose(); }
  const gs = Math.ceil(r * 1.6);
  grid = new THREE.GridHelper(gs, Math.min(gs, 80), 0x3a4256, 0x262c3a);
  grid.position.set(center.x, box.min.y - 0.001, center.z);
  grid.visible = state.grid;
  scene.add(grid);
  requestRender();
}

// ============================================================
//  Открытие моделей
// ============================================================

const MODEL_EXT = new Set(['obj', 'geo.json', 'json', 'bbmodel']);
let loadToken = 0;

// Один файл модели -> { parts, textures, pixelArt, doubleSide }
async function loadFile(entry) {
  const ext = extOf(entry.path);
  if (ext === 'obj') {
    const parser = new ObjParser();
    await streamText(await Files.blob(entry), (chunk, last) => parser.feed(chunk, last));
    let mtl = new Map();
    const mtlEntry = (parser.mtllib && Files.find(dirOf(entry.path) + parser.mtllib))
      || Files.find(entry.path.replace(/\.obj$/i, '.mtl'));
    if (mtlEntry) mtl = parseMTL(await Files.text(mtlEntry));
    const r = parser.finish(mtl, entry.path);
    return { parts: r.parts, textures: r.textures, pixelArt: false, doubleSide: true };
  }
  const text = await Files.text(entry);
  if (ext === 'bbmodel') {
    const r = parseBBModel(JSON.parse(text));
    return { parts: r.parts, textures: r.textures, pixelArt: true, doubleSide: false };
  }
  const geos = listGeometries(JSON.parse(text));
  if (!geos.length) throw new Error('В файле нет геометрии Bedrock');
  // текстура: png с тем же именем, иначе первая картинка в папке
  const stem = baseOf(entry.path).replace(/(\.geo)?\.json$/i, '');
  const imgs = Files.paths().filter((p) => /\.(png|jpe?g)$/i.test(p) && dirOf(p) === dirOf(entry.path));
  const pick = imgs.find((p) => baseOf(p).toLowerCase().startsWith(stem.toLowerCase())) || imgs[0] || null;
  return { parts: parseGeo(geos[0]), textures: [{ key: 'geo:' + entry.path, label: pick ? baseOf(pick) : 'нет текстуры', mapPath: pick }], pixelArt: true, doubleSide: false };
}

// Склеиваем файлы вагона (bg + fg и т.п.) в одну модель
function mergeModels(car, loaded) {
  const textures = [];
  const texIndex = new Map();
  const parts = [];
  loaded.forEach((m, fi) => {
    const file = car.files[fi];
    const remap = m.textures.map((t) => {
      if (!texIndex.has(t.key)) { texIndex.set(t.key, textures.length); textures.push(t); }
      return texIndex.get(t.key);
    });
    for (const p of m.parts) {
      const chunks = new Map();
      for (const [ti, c] of p.chunks) chunks.set(remap[ti], c);
      parts.push({ ...p, chunks, file: file.tag, name: car.files.length > 1 ? `${file.tag}: ${p.name}` : p.name });
    }
  });
  return {
    parts, textures,
    pixelArt: loaded.every((m) => m.pixelArt),
    doubleSide: loaded.some((m) => m.doubleSide),
  };
}

async function openModel(car, keepCamera = false) {
  const token = ++loadToken;
  const t0 = performance.now();
  showBusy(`Загружаю ${car.label}…`);
  await new Promise((r) => setTimeout(r, 20)); // даём нарисоваться индикатору
  // сначала освобождаем прошлую модель, чтобы не держать две сразу
  clearModel();
  disposeTextures();
  state.current = null;
  try {
    const loaded = [];
    for (const f of car.files) loaded.push(await loadFile(f.entry));
    if (token !== loadToken) return;
    const model = mergeModels(car, loaded);
    model.car = car;
    state.current = model;

    // окраски (подпапки с теми же именами текстур)
    const texPaths = model.textures.map((t) => t.mapPath).filter(Boolean);
    const variants = variantsFor(texPaths);
    if (!variants.includes(state.variant)) state.variant = '';
    fillVariants(variants);

    await loadModelTextures(token);
    if (token !== loadToken) return;
    buildMeshes();
    if (!keepCamera) fitCamera();
    fillParts();
    fillFileChips();
    $('modelName').textContent = car.label;
    state.loadMs = Math.round(performance.now() - t0);
    updateStats();
    hideBusy();
  } catch (err) {
    console.error(err);
    if (token === loadToken) showError(`Не получилось открыть ${car.label}: ${err.message || err}`);
  }
}

async function loadModelTextures(token) {
  const cur = state.current;
  disposeTextures();
  const list = [];
  // строго по одной — чтобы в памяти не было сразу всех картинок
  for (const t of cur.textures) {
    if (token !== loadToken) break;
    let tex = null;
    try {
      if (t.src) tex = await loadTexture(await (await fetch(t.src.url)).blob(), { pixelArt: cur.pixelArt, name: t.label });
      else if (t.mapPath) {
        const e = resolveTexturePath(t.mapPath);
        t.missing = !e;
        if (e) tex = await loadTexture(await Files.blob(e), { pixelArt: cur.pixelArt, name: e.path });
      }
    } catch (err) { console.warn('Текстура не загрузилась', t.label, err); }
    list.push(tex);
  }
  if (token !== loadToken) { list.forEach((t) => t && t.dispose()); return; }
  state.texList = list;
}

// ============================================================
//  Интерфейс
// ============================================================

function showBusy(msg) { $('busy').hidden = false; $('busyText').textContent = msg; $('error').hidden = true; }
function hideBusy() { $('busy').hidden = true; }
function showError(msg) { hideBusy(); $('error').hidden = false; $('errorText').textContent = msg; }

function updateStats() {
  const info = renderer.info.render;
  const cur = state.current;
  const tris = cur ? cur.parts.reduce((s, p) => s + (p.visible ? p.tris : 0), 0) : 0;
  const missing = cur ? cur.textures.filter((t) => t.missing).length : 0;
  $('stats').textContent = [
    `${tris.toLocaleString('ru-RU')} треуг.`,
    `${modelRoot.children.reduce((n, m) => n + (m.visible ? Math.max(1, m.geometry.groups.length) : 0), 0)} отрисовок`,
    `${state.texList.filter(Boolean).length} текстур` + (missing ? ` (нет ${missing})` : ''),
    state.spin ? `${fps} FPS` : (state.loadMs ? `загрузка ${state.loadMs} мс` : ''),
  ].filter(Boolean).join(' · ');
  void info;
}

// Красивое имя: «81-740bg» → серия «81-740»
function seriesOf(path) {
  const b = baseOf(path).replace(/\.(obj|bbmodel|json)$/i, '').replace(/\.geo$/i, '');
  const m = /^(81-\d+|es\d+|m\d+|\d+)/i.exec(b);
  return m ? m[1] : b;
}

// Показываем только эту серию (для .obj). Пустая строка — показывать всё.
const ONLY_SERIES = '81-540';

// «81-540.1bg» и «81-540.1fg» — куски одного вагона «81-540.1»
const PIECE_NAMES = { bg: 'кузов', fg: 'детали', f: 'перед', r: 'зад' };
function carKeyOf(path) {
  if (extOf(path) !== 'obj') return { key: path, tag: baseOf(path) };
  const stem = path.replace(/\.obj$/i, '');
  const m = /^(.*\d)(bg|fg|f|r)$/i.exec(stem);
  return m ? { key: m[1], tag: m[2].toLowerCase() } : { key: stem, tag: baseOf(stem) };
}

function buildCars() {
  const cars = new Map();
  const paths = Files.paths()
    .filter((p) => MODEL_EXT.has(extOf(p)) && !(extOf(p) === 'json' && !/geo|model/i.test(p)))
    .filter((p) => extOf(p) !== 'obj' || !ONLY_SERIES || baseOf(p).toLowerCase().startsWith(ONLY_SERIES.toLowerCase() + '.'))
    .sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  for (const p of paths) {
    const { key, tag } = carKeyOf(p);
    if (!cars.has(key)) cars.set(key, { key, files: [] });
    cars.get(key).files.push({ tag, entry: Files.get(p) });
  }
  for (const car of cars.values()) {
    const name = baseOf(car.key).replace(/\.(bbmodel|json)$/i, '');
    car.label = car.files.length > 1
      ? `${name} (${car.files.map((f) => PIECE_NAMES[f.tag] || f.tag).join(' + ')})`
      : name;
  }
  state.cars = cars;
  return [...cars.values()];
}

function fillModelList() {
  const sel = $('model');
  const filter = $('search').value.trim().toLowerCase();
  const cars = buildCars().filter((c) => !filter || c.label.toLowerCase().includes(filter));
  const prev = sel.value;
  sel.innerHTML = '';
  const groups = new Map();
  for (const c of cars) {
    const s = seriesOf(c.key);
    if (!groups.has(s)) groups.set(s, []);
    groups.get(s).push(c);
  }
  for (const [s, list] of groups) {
    const og = document.createElement('optgroup');
    og.label = s;
    for (const c of list) {
      const o = document.createElement('option');
      o.value = c.key;
      o.textContent = c.label;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  if (cars.some((c) => c.key === prev)) sel.value = prev;
  $('count').textContent = `${cars.length} шт.`;
  return cars;
}

function fillVariants(variants) {
  const sel = $('variant');
  sel.innerHTML = '';
  const def = document.createElement('option');
  def.value = ''; def.textContent = 'Стандартная';
  sel.appendChild(def);
  for (const v of variants) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    sel.appendChild(o);
  }
  sel.value = state.variant;
  $('variantRow').hidden = variants.length === 0;
}

function fillParts() {
  const box = $('parts');
  const cur = state.current;
  box.innerHTML = '';
  if (!cur) return;
  $('partsCount').textContent = cur.parts.length;
  const sorted = [...cur.parts].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }));
  for (const p of sorted) {
    const l = document.createElement('label');
    l.className = 'part';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.checked = p.visible;
    cb.addEventListener('change', () => { p.visible = cb.checked; scheduleRebuild(); });
    const name = document.createElement('span');
    name.textContent = p.name;
    const n = document.createElement('small');
    n.textContent = p.tris.toLocaleString('ru-RU');
    l.append(cb, name, n);
    box.appendChild(l);
  }
}
// Кнопки «кузов / детали»: включить или выключить целый файл вагона
function fillFileChips() {
  const row = $('filesRow');
  const cur = state.current;
  row.innerHTML = '';
  const files = cur && cur.car.files.length > 1 ? cur.car.files : [];
  $('filesField').hidden = !files.length;
  for (const f of files) {
    const b = document.createElement('button');
    b.className = 'chip';
    b.textContent = `${PIECE_NAMES[f.tag] || f.tag} (${f.tag})`;
    const mine = () => cur.parts.filter((p) => p.file === f.tag);
    const sync = () => b.setAttribute('aria-pressed', String(mine().some((p) => p.visible)));
    sync();
    b.addEventListener('click', () => {
      const on = !mine().some((p) => p.visible);
      mine().forEach((p) => (p.visible = on));
      sync(); fillParts(); scheduleRebuild();
    });
    row.appendChild(b);
  }
}
let rebuildTimer = 0;
function scheduleRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(applyVisibility, 30); }

function setAllParts(v) {
  if (!state.current) return;
  state.current.parts.forEach((p) => (p.visible = v));
  fillParts();
  fillFileChips();
  applyVisibility();
}

function setQuality(q) {
  state.quality = q;
  store.set('quality', q);
  document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === q)));
  resize();
  if (state.current) openModel(state.current.car, true); // перезагружаем текстуры под новый размер
}

function toggle(id, key, after) {
  const b = $(id);
  const sync = () => b.setAttribute('aria-pressed', String(state[key]));
  sync();
  b.addEventListener('click', () => { state[key] = !state[key]; sync(); after && after(); });
}

function screenshot() {
  renderer.render(scene, camera);
  canvas.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (state.current ? state.current.car.key.replace(/[^\w.-]+/g, '_') : 'model') + '.png';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
}

function onPicked(fileList) {
  if (!fileList || !fileList.length) return;
  Files.usePicked(fileList);
  state.variant = '';
  const cars = fillModelList();
  $('needFolder').hidden = true;
  if (cars.length) openFromSelect(cars);
  else showError('Среди выбранных файлов нет моделей (.obj, .geo.json, .bbmodel).');
}

function openFromSelect(cars, preferred) {
  const sel = $('model');
  if (cars.length) {
    const def = (preferred && cars.find((c) => c.key === preferred)) || cars[0];
    sel.value = def.key;
  }
  const car = state.cars.get(sel.value);
  if (car) { store.set('last', car.key); openModel(car); }
}

// Проверяем, можно ли читать файлы рядом со страницей
async function canFetchPack() {
  if (location.protocol === 'file:') {
    try { const r = await fetch(encodePath('81-540.1bg.mtl')); return r.ok; } catch { return false; }
  }
  try { const r = await fetch(encodePath('81-540.1bg.mtl'), { method: 'GET', cache: 'no-store' }); return r.ok; } catch { return false; }
}

// Если видеокарте не хватило памяти — сообщаем, а не показываем пустой экран
canvas.addEventListener('webglcontextlost', (e) => {
  e.preventDefault();
  showError('Видеокарте телефона не хватило памяти. Включи качество «Чайник» или скрой часть вагона — страница восстановится сама.');
});
canvas.addEventListener('webglcontextrestored', () => {
  if (state.current) openModel(state.current.car, true);
});
window.addEventListener('error', (e) => showError('Ошибка: ' + (e.message || e)));
window.addEventListener('unhandledrejection', (e) => showError('Ошибка: ' + ((e.reason && e.reason.message) || e.reason)));

async function init() {
  document.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => setQuality(b.dataset.q)));
  document.querySelectorAll('[data-q]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.q === state.quality)));
  toggle('btnSpin', 'spin', () => { controls.autoRotate = state.spin; controls.autoRotateSpeed = 1.5; updateStats(); requestRender(); });
  toggle('btnGrid', 'grid', () => { store.set('grid', state.grid ? '1' : '0'); if (grid) grid.visible = state.grid; requestRender(); });
  toggle('btnWire', 'wire', () => { state.materials.forEach((m) => (m.wireframe = state.wire)); requestRender(); });
  toggle('btnGlass', 'glass', () => { store.set('glass', state.glass ? '1' : '0'); refreshMaterials(); });
  $('btnFit').addEventListener('click', fitCamera);
  $('btnShot').addEventListener('click', screenshot);
  $('allOn').addEventListener('click', () => setAllParts(true));
  $('allOff').addEventListener('click', () => setAllParts(false));
  $('model').addEventListener('change', () => { state.variant = ''; openFromSelect([]); });
  $('variant').addEventListener('change', async () => {
    state.variant = $('variant').value;
    const token = ++loadToken;
    showBusy('Меняю окраску…');
    await loadModelTextures(token);
    if (token === loadToken) { refreshMaterials(); hideBusy(); }
  });
  $('search').addEventListener('input', () => fillModelList());
  $('pickFolder').addEventListener('change', (e) => onPicked(e.target.files));
  for (const id of ['pickFolder2', 'pickFiles', 'pickFiles2']) $(id).addEventListener('change', (e) => onPicked(e.target.files));
  $('errorClose').addEventListener('click', () => ($('error').hidden = true));
  $('menuBtn').addEventListener('click', () => document.body.classList.toggle('panel-open'));

  // перетаскивание папки/файлов на компьютере
  window.addEventListener('dragover', (e) => { e.preventDefault(); document.body.classList.add('drag'); });
  window.addEventListener('dragleave', (e) => { if (!e.relatedTarget) document.body.classList.remove('drag'); });
  window.addEventListener('drop', async (e) => {
    e.preventDefault();
    document.body.classList.remove('drag');
    const files = await filesFromDrop(e.dataTransfer);
    onPicked(files);
  });

  resize();
  if (await canFetchPack()) {
    Files.useList(PACK_FILES);
    openFromSelect(fillModelList(), store.get('last', ''));
  } else {
    $('needFolder').hidden = false;
    hideBusy();
  }
}

// Папка, перетащенная мышкой: обходим всё дерево
async function filesFromDrop(dt) {
  const items = [...(dt.items || [])].map((i) => i.webkitGetAsEntry && i.webkitGetAsEntry()).filter(Boolean);
  if (!items.length) return [...dt.files];
  const out = [];
  const walk = (entry, path) => new Promise((resolve) => {
    if (entry.isFile) {
      entry.file((f) => { try { Object.defineProperty(f, 'webkitRelativePath', { value: path + f.name }); } catch { /* только чтение */ } out.push(f); resolve(); }, resolve);
    } else {
      const reader = entry.createReader();
      const all = [];
      const read = () => reader.readEntries(async (batch) => {
        if (batch.length) { all.push(...batch); read(); return; }
        for (const ch of all) await walk(ch, path + entry.name + '/');
        resolve();
      }, resolve);
      read();
    }
  });
  for (const it of items) await walk(it, '');
  return out;
}

init();
