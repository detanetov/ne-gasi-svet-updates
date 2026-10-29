// Персонаж игрока: цельное тело со скелетом. Форма задаётся полем расстояний (как в скульптинге),
// из него строится гладкая поверхность (surface nets), вершины привязываются к костям. Одежда — утолщение
// поверхности в нужных местах, поэтому манжеты, пояс и капюшон получаются частью тела, а не отдельными цилиндрами
import * as THREE from 'three';

// ---------------- Параметры внешности ----------------
export const LOOK_GROUPS = ['тело', 'лицо', 'волосы', 'голова', 'верх', 'низ', 'обувь', 'аксессуары'];
export const LOOK_OPTIONS = {
  gender: { g: 0, label: 'телосложение', values: ['мужское', 'женское'] },
  height: { g: 0, label: 'рост', values: ['низкий', 'ниже среднего', 'средний', 'выше среднего', 'высокий'] },
  build: { g: 0, label: 'фигура', values: ['худая', 'обычная', 'крепкая', 'полная'] },
  skin: { g: 0, label: 'кожа', values: ['#f3d2b4', '#e8bb96', '#d6a07a', '#bf8560', '#a06a48', '#80533a', '#5e3b28', '#3e271b'] },
  face: { g: 1, label: 'лицо', values: ['овальное', 'широкое', 'узкое', 'квадратное'] },
  nose: { g: 1, label: 'нос', values: ['маленький', 'обычный', 'большой', 'с горбинкой'] },
  eyes: { g: 1, label: 'глаза', values: ['#5a3a1e', '#3a6a9a', '#4a7a4a', '#7a8088', '#1a1210', '#8a6a2a'] },
  brows: { g: 1, label: 'брови', values: ['тонкие', 'обычные', 'густые'] },
  beard: { g: 1, label: 'борода', values: ['нет', 'щетина', 'борода', 'усы', 'бородка'] },
  hairStyle: { g: 2, label: 'причёска', values: ['коротко', 'ёжик', 'каре', 'длинные', 'хвост', 'кудри', 'ирокез', 'пучок', 'лысый'] },
  hair: { g: 2, label: 'цвет волос', values: ['#14100c', '#3a2416', '#5e3b20', '#8a5a2b', '#b5844a', '#d8b878', '#e8e0d0', '#8a8a88', '#8a1f1a', '#2a4a8a'] },
  hat: { g: 3, label: 'на голове', values: ['ничего', 'кепка', 'кепка назад', 'шапка', 'каска с фонарём', 'капюшон', 'бандана', 'панама'] },
  hatColor: { g: 3, label: 'цвет убора', values: ['#1d1f22', '#b8322a', '#2f5f8f', '#3f6b3a', '#d0a020', '#e8e4dc', '#6b4a8a', '#c45a1a', '#4a4a4e', '#e06a9a'] },
  top: { g: 4, label: 'верх', values: ['футболка', 'худи', 'куртка', 'ветровка', 'пуховик', 'свитер', 'жилет'] },
  topColor: { g: 4, label: 'цвет', values: ['#2b2e33', '#7a1f1a', '#1f3b5c', '#3d5232', '#b3812a', '#6b4a8a', '#d8d2c4', '#c45a1a', '#e8e4dc', '#141414', '#2a6a6a', '#c8a0a0'] },
  pattern: { g: 4, label: 'рисунок', values: ['однотонный', 'полоски', 'надпись канала', 'клетка'] },
  bottom: { g: 5, label: 'низ', values: ['джинсы', 'спортивные', 'карго', 'шорты'] },
  bottomColor: { g: 5, label: 'цвет', values: ['#22304a', '#1b1b1d', '#4a4a3c', '#5a3b26', '#7a7a80', '#3a4a2a', '#c8c0b0', '#6a1a1a'] },
  shoes: { g: 6, label: 'обувь', values: ['кроссовки', 'кеды', 'ботинки', 'сапоги'] },
  shoeColor: { g: 6, label: 'цвет', values: ['#e8e6e0', '#1a1a1a', '#7a1f1a', '#3a2a1a', '#2f5f8f', '#5a5a5a', '#d0a020', '#3d5232'] },
  glasses: { g: 7, label: 'очки', values: ['нет', 'обычные', 'круглые', 'тёмные'] },
  backpack: { g: 7, label: 'рюкзак', values: ['нет', 'городской', 'туристический'] },
  extra: { g: 7, label: 'ещё', values: ['ничего', 'шарф', 'наушники', 'маска', 'перчатки'] }
};
export const DEFAULT_LOOK = { v: 2, gender: 0, height: 2, build: 1, skin: 2, face: 0, nose: 1, eyes: 0, brows: 1, beard: 0, hairStyle: 0, hair: 1, hat: 0, hatColor: 0, top: 2, topColor: 0, pattern: 0, bottom: 0, bottomColor: 0, shoes: 0, shoeColor: 0, glasses: 0, backpack: 1, extra: 0 };
export function randomLook() {
  const l = { v: 2 }; for (const k in LOOK_OPTIONS) l[k] = Math.floor(Math.random() * LOOK_OPTIONS[k].values.length);
  if (l.gender === 1) l.beard = 0; if (Math.random() < 0.6) l.hat = 0; if (Math.random() < 0.6) l.extra = 0; if (Math.random() < 0.5) l.glasses = 0; return l;
}
// старые сохранения: переводим прежние варианты в новые
export function cleanLook(l) {
  const o = { ...DEFAULT_LOOK };
  if (!l) return o;
  if (l.v !== 2) {
    const hs = [0, 1, 3, 4, 8], top = [2, 1, 6, 4], hat = [0, 1, 3, 4, 5, 6];
    if (l.skin != null) o.skin = [0, 2, 3, 5, 6][l.skin] ?? 2; if (l.hair != null) o.hair = [0, 1, 3, 5, 6, 8][l.hair] ?? 1;
    if (l.hairStyle != null) o.hairStyle = hs[l.hairStyle] ?? 0; if (l.jacketStyle != null) o.top = top[l.jacketStyle] ?? 2;
    if (l.jacket != null) o.topColor = l.jacket; if (l.pants != null) o.bottomColor = l.pants; if (l.shoes != null) o.shoeColor = l.shoes;
    if (l.hat != null) o.hat = hat[l.hat] ?? 0; if (l.hatColor != null) o.hatColor = l.hatColor; if (l.glasses != null) o.glasses = [0, 1, 3][l.glasses] ?? 0; if (l.backpack != null) o.backpack = l.backpack ? 1 : 0;
    return o;
  }
  for (const k in LOOK_OPTIONS) { const v = l[k] | 0; if (v >= 0 && v < LOOK_OPTIONS[k].values.length) o[k] = v; }
  return o;
}

// ---------------- Поле расстояний ----------------
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);
function ell(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = (x - cx) / rx, py = (y - cy) / ry, pz = (z - cz) / rz;
  const k0 = Math.sqrt(px * px + py * py + pz * pz); const qx = px / rx, qy = py / ry, qz = pz / rz; const k1 = Math.sqrt(qx * qx + qy * qy + qz * qz);
  return k1 > 1e-9 ? k0 * (k0 - 1) / k1 : -Math.min(rx, ry, rz);
}
// капсула с разными радиусами на концах; T — где на отрезке ближайшая точка (0..1)
let T = 0;
function cap(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const px = x - ax, py = y - ay, pz = z - az, dx = bx - ax, dy = by - ay, dz = bz - az;
  const L2 = dx * dx + dy * dy + dz * dz; let t = (px * dx + py * dy + pz * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t; T = t;
  const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t; return Math.sqrt(qx * qx + qy * qy + qz * qz) - (ra + (rb - ra) * t);
}
const sph = (x, y, z, cx, cy, cz, r) => Math.hypot(x - cx, y - cy, z - cz) - r;
function box(x, y, z, cx, cy, cz, hx, hy, hz, r) { const qx = Math.abs(x - cx) - hx + r, qy = Math.abs(y - cy) - hy + r, qz = Math.abs(z - cz) - hz + r; return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r; }

// Surface nets: гладкая сетка по нулевому уровню поля. f(x,y,z) -> расстояние
function surfaceNets(f, min, max, step) {
  const nx = Math.ceil((max[0] - min[0]) / step) + 1, ny = Math.ceil((max[1] - min[1]) / step) + 1, nz = Math.ceil((max[2] - min[2]) / step) + 1;
  const V = new Float32Array(nx * ny * nz); const id = (i, j, k) => (k * ny + j) * nx + i;
  for (let k = 0; k < nz; k++) for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) V[id(i, j, k)] = f(min[0] + i * step, min[1] + j * step, min[2] + k * step);
  const vIdx = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1); const cid = (i, j, k) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos = []; const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0; for (let c = 0; c < 8; c++) { const [a, b, d] = corners[c]; cv[c] = V[id(i + a, j + b, k + d)]; if (cv[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [e0, e1] of edges) { const a = cv[e0], b = cv[e1]; if ((a < 0) === (b < 0)) continue; const t = a / (a - b); const c0 = corners[e0], c1 = corners[e1]; sx += c0[0] + (c1[0] - c0[0]) * t; sy += c0[1] + (c1[1] - c0[1]) * t; sz += c0[2] + (c1[2] - c0[2]) * t; n++; }
    vIdx[cid(i, j, k)] = pos.length / 3; pos.push(min[0] + (i + sx / n) * step, min[1] + (j + sy / n) * step, min[2] + (k + sz / n) * step);
  }
  const ind = [];
  for (let k = 1; k < nz - 1; k++) for (let j = 1; j < ny - 1; j++) for (let i = 1; i < nx - 1; i++) {
    const v0 = V[id(i, j, k)] < 0;
    // ребро вдоль x
    if (i < nx - 1 && (V[id(i + 1, j, k)] < 0) !== v0) { const a = vIdx[cid(i, j - 1, k - 1)], b = vIdx[cid(i, j, k - 1)], c = vIdx[cid(i, j, k)], d = vIdx[cid(i, j - 1, k)]; if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? ind.push(a, b, c, a, c, d) : ind.push(a, c, b, a, d, c); }
    if (j < ny - 1 && (V[id(i, j + 1, k)] < 0) !== v0) { const a = vIdx[cid(i - 1, j, k - 1)], b = vIdx[cid(i, j, k - 1)], c = vIdx[cid(i, j, k)], d = vIdx[cid(i - 1, j, k)]; if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? ind.push(a, c, b, a, d, c) : ind.push(a, b, c, a, c, d); }
    if (k < nz - 1 && (V[id(i, j, k + 1)] < 0) !== v0) { const a = vIdx[cid(i - 1, j - 1, k)], b = vIdx[cid(i, j - 1, k)], c = vIdx[cid(i, j, k)], d = vIdx[cid(i - 1, j, k)]; if (a >= 0 && b >= 0 && c >= 0 && d >= 0) v0 ? ind.push(a, b, c, a, c, d) : ind.push(a, c, b, a, d, c); }
  }
  // нормали — по градиенту поля: поверхность выглядит гладкой, как вылепленная
  const nrm = new Float32Array(pos.length); const e = step * 0.5;
  for (let v = 0; v < pos.length; v += 3) {
    const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    let gx = f(x + e, y, z) - f(x - e, y, z), gy = f(x, y + e, z) - f(x, y - e, z), gz = f(x, y, z + e) - f(x, y, z - e); const l = Math.hypot(gx, gy, gz) || 1;
    nrm[v] = gx / l; nrm[v + 1] = gy / l; nrm[v + 2] = gz / l;
  }
  // ориентация треугольников по нормали поля
  for (let t = 0; t < ind.length; t += 3) {
    const a = ind[t] * 3, b = ind[t + 1] * 3, c = ind[t + 2] * 3;
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2], vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
    const fx = uy * vz - uz * vy, fy = uz * vx - ux * vz, fz = ux * vy - uy * vx;
    if (fx * (nrm[a] + nrm[b] + nrm[c]) + fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]) < 0) { const k = ind[t + 1]; ind[t + 1] = ind[t + 2]; ind[t + 2] = k; }
  }
  return { pos: new Float32Array(pos), nrm, ind };
}
// сетка с разбивкой треугольников по материалам: tagFn(x,y,z) -> номер материала
function buildGeometry(net, tagFn, nMat, uvFn) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(net.pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(net.nrm, 3));
  const uv = new Float32Array(net.pos.length / 3 * 2);
  for (let v = 0, w = 0; v < net.pos.length; v += 3, w += 2) { const [u, vv] = uvFn ? uvFn(net.pos[v], net.pos[v + 1], net.pos[v + 2]) : [Math.atan2(net.pos[v], net.pos[v + 2]) / (Math.PI * 2) + 0.5, net.pos[v + 1]]; uv[w] = u; uv[w + 1] = vv; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (nMat > 1 && tagFn) {
    const buckets = Array.from({ length: nMat }, () => []); const P = net.pos, I = net.ind;
    for (let t = 0; t < I.length; t += 3) { const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3; const m = tagFn((P[a] + P[b] + P[c]) / 3, (P[a + 1] + P[b + 1] + P[c + 1]) / 3, (P[a + 2] + P[b + 2] + P[c + 2]) / 3); buckets[m].push(I[t], I[t + 1], I[t + 2]); }
    const all = []; let off = 0; buckets.forEach((b, m) => { if (b.length) g.addGroup(off, b.length, m); off += b.length; all.push(...b); });
    g.setIndex(all);
  } else g.setIndex(net.ind);
  g.computeBoundingSphere();
  return g;
}

// ---------------- Тело ----------------
// T-поза с чуть разведёнными руками; персонаж смотрит в −z, ступни на y=0
function bodyParams(L) {
  const F = L.gender === 1 ? 1 : 0, W = [0.88, 1, 1.12, 1.18][L.build], fat = L.build === 3 ? 1 : 0;
  return { F, W, fat };
}
const TOPS = { // утолщение ткани, длина рукава (0 — без рукава, 1 — по локоть, 2 — до запястья)
  'футболка': { inf: 0.005, sleeve: 1 }, 'худи': { inf: 0.016, sleeve: 2 }, 'куртка': { inf: 0.02, sleeve: 2 }, 'ветровка': { inf: 0.012, sleeve: 2 },
  'пуховик': { inf: 0.038, sleeve: 2, quilt: true }, 'свитер': { inf: 0.013, sleeve: 2, knit: true }, 'жилет': { inf: 0.022, sleeve: 1, vest: true }
};
const BOTTOMS = { 'джинсы': { inf: 0.006, len: 2 }, 'спортивные': { inf: 0.012, len: 2 }, 'карго': { inf: 0.015, len: 2, pockets: true }, 'шорты': { inf: 0.008, len: 1 } };
let TAG = 0, TT = 0; // 1 туловище, 2 таз, 3 шея, 4 плечо, 5 предплечье, 6 бедро, 7 голень, 8 дельта
function bodyRaw(x, y, z, P) {
  const { F, W, fat } = P; const ax = Math.abs(x), s = x < 0 ? -1 : 1;
  let d = 1, t;
  // туловище
  const pel = ell(x, y, z, 0, 0.95, 0.005, (0.158 + 0.03 * F) * W, 0.1, 0.105 * W);
  const bel = ell(x, y, z, 0, 1.07, -0.005 - fat * 0.02, (0.14 - 0.014 * F + fat * 0.02) * W, 0.11, (0.098 + fat * 0.035) * W);
  const che = ell(x, y, z, 0, 1.27, 0.0, (0.172 - 0.018 * F) * W, 0.148, 0.103 * W);
  const trp = ell(x, y, z, 0, 1.405, 0.014, 0.15 * W - 0.015 * F, 0.068, 0.072);
  let tor = smin(smin(bel, che, 0.06), trp, 0.05);
  if (F) { const br = Math.min(sph(ax, y, z, 0.058, 1.255, -0.072, 0.054), sph(ax, y, z, 0.058, 1.255, -0.072, 0.054)); tor = smin(tor, br, 0.03); }
  d = smin(pel, tor, 0.05); TAG = pel < tor ? 2 : 1; TT = 0;
  // шея
  const nk = cap(x, y, z, 0, 1.42, 0.012, 0, 1.555, 0.006, 0.053 - 0.006 * F, 0.048 - 0.006 * F); if (nk < d) { TAG = 3; TT = T; } d = smin(d, nk, 0.03);
  // плечи и руки (по стороне x)
  const dl = ell(ax, y, z, 0.182, 1.395, 0.0, 0.058 * W - 0.006 * F, 0.055, 0.055 * W); if (dl < d) { TAG = 8; TT = 0; } d = smin(d, dl, 0.035);
  const ua = cap(ax, y, z, 0.19, 1.385, 0.0, 0.232, 1.125, 0.006, 0.046 * W - 0.004 * F, 0.037 * W - 0.003 * F); t = T; if (ua < d) { TAG = 4; TT = t; } d = smin(d, ua, 0.022);
  const fa = cap(ax, y, z, 0.232, 1.125, 0.006, 0.258, 0.885, -0.004, 0.037 * W - 0.003 * F, 0.026); t = T; if (fa < d) { TAG = 5; TT = t; } d = smin(d, fa, 0.018);
  // ноги
  const th = cap(ax, y, z, 0.094, 0.93, 0.0, 0.1, 0.5, -0.006, (0.074 + 0.008 * F + fat * 0.012) * W, 0.05); t = T; if (th < d) { TAG = 6; TT = t; } d = smin(d, th, 0.03);
  const sh = cap(ax, y, z, 0.1, 0.5, -0.006, 0.104, 0.1, 0.01, 0.048, 0.032); t = T; const calf = ell(ax, y, z, 0.1, 0.36, 0.02, 0.044 * W, 0.085, 0.044 * W); const leg = smin(sh, calf, 0.03);
  if (leg < d) { TAG = 7; TT = t; } d = smin(d, leg, 0.02);
  void s; return d;
}
// какая одежда покрывает точку: 0 кожа, 1 верх, 2 низ
function coverAt(tag, tt, y, TOP, BOT) {
  if (tag === 1 || tag === 8) return y < 1.0 ? 2 : 1;
  if (tag === 2) return y > 1.0 ? 1 : 2;
  if (tag === 3) return (TOP.high && tt < 0.4) ? 1 : 0;
  if (tag === 4) return TOP.vest ? 0 : TOP.sleeve >= 2 || (TOP.sleeve === 1 && tt < 0.62) ? 1 : 0;
  if (tag === 5) return TOP.sleeve >= 2 && tt < 0.93 ? 1 : 0;
  if (tag === 6) return BOT.len >= 1 && tt < (BOT.len === 1 ? 0.78 : 2) ? 2 : 0;
  if (tag === 7) return BOT.len >= 2 && tt < 0.97 ? 2 : 0;
  return 0;
}
function makeBodyGeo(L) {
  const P = bodyParams(L); const TOP = { ...TOPS[LOOK_OPTIONS.top.values[L.top]], high: L.top === 1 || L.top === 4 || L.top === 5 }; const BOT = BOTTOMS[LOOK_OPTIONS.bottom.values[L.bottom]];
  const f = (x, y, z) => {
    let d = bodyRaw(x, y, z, P); const c = coverAt(TAG, TT, y, TOP, BOT);
    if (c === 1) { let i = TOP.inf; if (TOP.vest && (TAG === 1 || TAG === 8)) i += 0.004; if (TOP.quilt) i += 0.007 * Math.abs(Math.sin(y * 42 + (TAG === 4 || TAG === 5 ? TT * 20 : 0))); if (TOP.knit) i += 0.0007 * Math.sin(y * 260); d -= i; }
    else if (c === 2) { let i = BOT.inf; if (BOT.pockets && TAG === 6 && TT > 0.3 && TT < 0.6 && Math.abs(x) > 0.1) i += 0.012; d -= i; }
    else if (TOP.vest && (TAG === 4)) d -= 0.004; // футболка под жилетом
    return d;
  };
  const net = surfaceNets(f, [-0.36, 0.05, -0.21], [0.36, 1.655, 0.21], 0.0095);
  const g = buildGeometry(net, (x, y, z) => { bodyRaw(x, y, z, P); return coverAt(TAG, TT, y, TOP, BOT); }, 3, (x, y, z) => [Math.atan2(x, -z) / (Math.PI * 2) + 0.5, y]);
  // веса костей: по ближайшей части тела и положению вдоль неё
  const pos = g.attributes.position, n = pos.count; const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (let v = 0; v < n; v++) {
    const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v); bodyRaw(x, y, z, P); const L0 = x < 0; const side = L0 ? 0 : 1;
    let a = B.hips, b = B.hips, w = 1;
    const bl = (p, c, t0, t1, t) => { if (t < t0) { const k = 0.5 + 0.5 * (t / t0); a = c; b = p; w = k; } else if (t > t1) { const k = 0.5 + 0.5 * ((1 - t) / (1 - t1)); a = c; b = -1; w = k; } else { a = c; b = c; w = 1; } };
    if (TAG === 2) { a = B.hips; b = y > 0.98 ? B.spine : B.hips; w = y > 0.98 ? 0.6 : 1; }
    else if (TAG === 1) { if (y > 1.33) { a = B.chest; b = B.chest; w = 1; } else if (y > 1.17) { a = B.chest; b = B.spine; w = (y - 1.17) / 0.16 * 0.5 + 0.5; } else if (y > 1.02) { a = B.spine; b = y > 1.1 ? B.chest : B.hips; w = 0.75; } else { a = B.hips; b = B.spine; w = 0.7; } }
    else if (TAG === 3) { a = B.neck; b = TT < 0.3 ? B.chest : B.head; w = TT < 0.3 ? 0.5 + TT : 1 - (TT > 0.85 ? (TT - 0.85) * 2 : 0); }
    else if (TAG === 8) { a = B.ua[side]; b = B.chest; w = 0.55; }
    else if (TAG === 4) { bl(B.chest, B.ua[side], 0.12, 0.85, TT); if (b === -1) b = B.fa[side]; }
    else if (TAG === 5) { bl(B.ua[side], B.fa[side], 0.15, 0.92, TT); if (b === -1) b = B.hand[side]; }
    else if (TAG === 6) { bl(B.hips, B.ul[side], 0.12, 0.88, TT); if (b === -1) b = B.ll[side]; }
    else if (TAG === 7) { bl(B.ul[side], B.ll[side], 0.1, 0.92, TT); if (b === -1) b = B.foot[side]; }
    si[v * 4] = a; si[v * 4 + 1] = b; sw[v * 4] = w; sw[v * 4 + 1] = 1 - w;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4)); g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  return g;
}
// номера костей
const B = { root: 0, hips: 1, spine: 2, chest: 3, neck: 4, head: 5, sh: [6, 10], ua: [7, 11], fa: [8, 12], hand: [9, 13], ul: [14, 17], ll: [15, 18], foot: [16, 19] };
function makeSkeleton() {
  const bones = []; const mk = (parent, x, y, z) => { const b = new THREE.Bone(); bones.push(b); if (parent) { parent.add(b); b.position.set(x - parent.userData.w[0], y - parent.userData.w[1], z - parent.userData.w[2]); } else b.position.set(x, y, z); b.userData.w = [x, y, z]; return b; };
  const root = mk(null, 0, 0, 0), hips = mk(root, 0, 0.95, 0), spine = mk(hips, 0, 1.08, 0), chest = mk(spine, 0, 1.27, 0), neck = mk(chest, 0, 1.44, 0.01), head = mk(neck, 0, 1.538, 0.006);
  const arm = (s) => { const sh = mk(chest, s * 0.15, 1.4, 0); const ua = mk(sh, s * 0.19, 1.385, 0); const fa = mk(ua, s * 0.232, 1.125, 0.006); const hd = mk(fa, s * 0.258, 0.885, -0.004); return { sh, ua, fa, hd }; };
  const aL = arm(-1), aR = arm(1);
  const leg = (s) => { const ul = mk(hips, s * 0.094, 0.93, 0); const ll = mk(ul, s * 0.1, 0.5, -0.006); const ft = mk(ll, s * 0.104, 0.1, 0.01); return { ul, ll, ft }; };
  const lL = leg(-1), lR = leg(1);
  return { bones, root, hips, spine, chest, neck, head, arms: [aL, aR], legs: [lL, lR] };
}

// ---------------- Голова (в системе кости головы: начало у основания черепа) ----------------
function headParams(L) {
  const F = L.gender === 1 ? 1 : 0;
  const jaw = [1, 1.12, 0.9, 1.15][L.face] * (F ? 0.9 : 1), narrow = [1, 1.06, 0.93, 1.04][L.face], chin = [1, 1, 1.1, 1.25][L.face];
  const nose = [0.8, 1, 1.22, 1.1][L.nose], hump = L.nose === 3 ? 1 : 0;
  return { F, jaw, narrow, chin, nose, hump };
}
let HTAG = 0;
function headRaw(x, y, z, H) {
  const { F, jaw, narrow, chin, nose, hump } = H; const ax = Math.abs(x);
  let d = ell(x, y, z, 0, 0.105, 0.012, 0.074 * narrow, 0.094, 0.094);
  d = smin(d, ell(x, y, z, 0, 0.068, -0.028, 0.064 * narrow, 0.078, 0.074), 0.03);
  d = smin(d, ell(x, y, z, 0, 0.028, -0.028, 0.056 * jaw, 0.046, 0.066), 0.035);
  d = smin(d, sph(x, y, z, 0, 0.004, -0.074, 0.021 * chin), 0.025);
  d = smin(d, sph(ax, y, z, 0.044 * narrow, 0.07, -0.066, 0.021), 0.02);
  d = smin(d, cap(x, y, z, -0.046, 0.105, -0.077, 0.046, 0.105, -0.077, F ? 0.008 : 0.012, F ? 0.008 : 0.012), 0.02);
  // нос
  const nb = cap(x, y, z, 0, 0.098, -0.085, 0, 0.06, -0.1 - 0.012 * nose, 0.0085 * nose, 0.0095 * nose);
  let ns = smin(nb, sph(x, y, z, 0, 0.058, -0.101 - 0.013 * nose, 0.0135 * nose), 0.008);
  if (hump) ns = smin(ns, sph(x, y, z, 0, 0.083, -0.094 - 0.006 * nose, 0.008), 0.006);
  ns = smin(ns, sph(ax, y, z, 0.013 * nose, 0.056, -0.093, 0.009 * nose), 0.006);
  d = smin(d, ns, 0.012);
  // губы и рот
  const lu = ell(x, y, z, 0, 0.035, -0.091, 0.021, 0.0068 + 0.0015 * F, 0.011), ll = ell(x, y, z, 0, 0.025, -0.089, 0.019, 0.0078 + 0.0018 * F, 0.012);
  const lips = Math.min(lu, ll); d = smin(d, lips, 0.006);
  // глазницы
  d = smax(d, -sph(ax, y, z, 0.032, 0.085, -0.086, 0.0175), 0.012);
  // уши
  let ear = ell(ax, y, z, 0.074 * narrow, 0.083, 0.006, 0.0105, 0.027, 0.019); ear = smax(ear, -sph(ax, y, z, 0.081 * narrow, 0.083, 0.004, 0.009), 0.004);
  d = smin(d, ear, 0.005);
  // шея снизу — уходит в тело
  d = smin(d, cap(x, y, z, 0, -0.05, 0.008, 0, 0.03, 0.01, 0.046, 0.05), 0.03);
  HTAG = lips < 0.003 && z < -0.08 ? 1 : 0;
  return d;
}
function makeHeadGeo(L) {
  const H = headParams(L);
  const net = surfaceNets((x, y, z) => headRaw(x, y, z, H), [-0.1, -0.05, -0.15], [0.1, 0.21, 0.12], 0.0034);
  return buildGeometry(net, (x, y, z) => { headRaw(x, y, z, H); return HTAG; }, 2, (x, y, z) => [x * 4 + 0.5, y * 4]);
}
// волосы и борода: оболочка вокруг головы в нужной области
function makeHairGeo(L) {
  const H = headParams(L); const st = LOOK_OPTIONS.hairStyle.values[L.hairStyle]; if (st === 'лысый') return null;
  const hat = LOOK_OPTIONS.hat.values[L.hat]; const covered = hat === 'капюшон' || hat === 'каска с фонарём';
  const th = { 'коротко': 0.012, 'ёжик': 0.005, 'каре': 0.016, 'длинные': 0.014, 'хвост': 0.01, 'кудри': 0.026, 'ирокез': 0.004, 'пучок': 0.01 }[st];
  const f = (x, y, z) => {
    const hd = headRaw(x, y, z, H);
    // линия роста волос: выше лба спереди, ниже сзади
    const front = z < -0.03; const line = front ? 0.118 - (Math.abs(x) > 0.05 ? 0.02 : 0) : z > 0.04 ? 0.03 : 0.07;
    let reg = y - line; // >0 — область волос
    if (Math.abs(x) > 0.07 && y < 0.11 && z < 0.03 && st !== 'каре' && st !== 'длинные') reg = Math.min(reg, -1); // уши открыты
    let d = hd - th; if (st === 'кудри') d -= 0.006 * Math.sin(x * 180) * Math.sin(y * 170) * Math.sin(z * 160);
    if (st === 'ирокез') { d = Math.min(Math.max(hd - th, -reg), box(x, y, z, 0, 0.16, 0.01, 0.012, 0.05, 0.08, 0.01) + (hd < 0.04 ? 0 : 1)); return d; }
    let out = Math.max(d, -reg * 2);
    if (st === 'каре') out = Math.min(out, Math.max(ell(x, y, z, 0, 0.08, 0.018, 0.092 * H.narrow, 0.1, 0.1), -(z + 0.035), 0.0 - y));
    if (st === 'длинные') out = Math.min(out, Math.max(ell(x, y, z, 0, 0.02, 0.04, 0.095, 0.2, 0.07), -(z + 0.01), -(y + 0.17)));
    if (st === 'хвост') out = Math.min(out, cap(x, y, z, 0, 0.12, 0.09, 0, -0.06, 0.13, 0.022, 0.012));
    if (st === 'пучок') out = Math.min(out, sph(x, y, z, 0, 0.19, 0.06, 0.035));
    if (front && st === 'коротко') out = Math.min(out, Math.max(ell(x, y, z, 0.015, 0.165, -0.06, 0.07, 0.025, 0.04), -hd - 0.02));
    return out;
  };
  if (covered && st !== 'длинные' && st !== 'хвост') return null;
  const net = surfaceNets(f, [-0.12, st === 'длинные' ? -0.2 : st === 'хвост' ? -0.1 : 0.0, -0.13], [0.12, 0.25, 0.17], 0.0042);
  return buildGeometry(net, null, 1, (x, y, z) => [Math.atan2(x, z) * 2, y * 6]);
}
function makeBeardGeo(L) {
  const H = headParams(L); const b = LOOK_OPTIONS.beard.values[L.beard]; if (b === 'нет' || L.gender === 1) return null;
  const th = { 'щетина': 0.0016, 'борода': 0.008, 'усы': 0.004, 'бородка': 0.006 }[b];
  const f = (x, y, z) => {
    const hd = headRaw(x, y, z, H);
    const mouth = ell(x, y, z, 0, 0.031, -0.09, 0.026, 0.011, 0.03); // вокруг губ без волос
    let reg;
    if (b === 'усы') reg = Math.min(0.05 - y, y - 0.037, 0.03 - Math.abs(x), -0.07 - z);
    else if (b === 'бородка') reg = Math.max(Math.min(0.022 - y, 0.03 - Math.abs(x), -0.045 - z), Math.min(0.05 - y, y - 0.037, 0.028 - Math.abs(x), -0.075 - z));
    else reg = Math.min(0.064 - y + Math.max(0, Math.abs(x) - 0.04) * 0.3, 0.012 - z, y + (b === 'борода' ? 0.028 : 0.012), 0.072 - Math.abs(x));
    if (b !== 'усы') reg = Math.min(reg, mouth);
    const taper = b === 'борода' ? th * (0.75 + Math.max(0, 0.012 - y) * 22) : th;
    return Math.max(hd - taper, -reg);
  };
  const net = surfaceNets(f, [-0.1, -0.07, -0.15], [0.1, 0.09, 0.06], 0.0032);
  return buildGeometry(net, null, 1);
}
// кисть (правая, для левой отражаем): висит вниз, ладонь к телу
function makeHandGeo() {
  const f = (x, y, z) => {
    let d = ell(x, y, z, 0, -0.045, -0.002, 0.016, 0.046, 0.04);
    for (let i = 0; i < 4; i++) { const zz = -0.027 + i * 0.018, len = [0.072, 0.08, 0.077, 0.062][i]; d = smin(d, cap(x, y, z, 0.002, -0.085, zz, -0.012, -0.085 - len, zz - 0.012, 0.0085, 0.0072), 0.008); }
    d = smin(d, cap(x, y, z, -0.012, -0.03, -0.035, -0.024, -0.075, -0.058, 0.011, 0.0085), 0.01);
    return d;
  };
  const net = surfaceNets(f, [-0.05, -0.18, -0.08], [0.04, 0.01, 0.05], 0.0032);
  return buildGeometry(net, null, 1);
}
// обувь в системе кости стопы (начало — щиколотка)
function makeShoeGeo(style) {
  const boot = style === 'ботинки', tall = style === 'сапоги', keds = style === 'кеды';
  const f = (x, y, z) => {
    let d = smin(box(x, y, z, 0, -0.06, -0.06, 0.047, 0.036, 0.13, 0.03), ell(x, y, z, 0, -0.07, -0.16, 0.046, 0.032, 0.06), 0.02);
    d = smin(d, cap(x, y, z, 0, -0.06, 0.02, 0, boot ? 0.07 : tall ? 0.24 : -0.0, 0.01, 0.045, 0.042), 0.02);
    d = Math.max(d, -y - 0.1);
    return d;
  };
  const net = surfaceNets(f, [-0.07, -0.11, -0.25], [0.07, tall ? 0.27 : 0.1, 0.09], 0.005);
  return buildGeometry(net, (x, y, z) => (y < -0.083 ? 1 : keds && z < -0.17 && y < -0.05 ? 1 : 0), 2, (x, y, z) => [x * 4, y * 4 + z]);
}

// ---------------- Материалы ----------------
const TEX = {};
function noiseTex(key, draw, size = 256) {
  if (TEX[key]) return TEX[key];
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; TEX[key] = t; return t;
}
function nrmFromHeight(key, hfn, size = 256) {
  return noiseTex(key, (g, s) => {
    const H = new Float32Array(s * s); for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) H[y * s + x] = hfn(x / s, y / s);
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) { const l = H[y * s + (x + s - 1) % s], r = H[y * s + (x + 1) % s], u = H[((y + s - 1) % s) * s + x], d = H[((y + 1) % s) * s + x]; let nx = (l - r) * 3, ny = (u - d) * 3; const L = Math.hypot(nx, ny, 1); const k = (y * s + x) * 4; img.data[k] = (nx / L * 0.5 + 0.5) * 255; img.data[k + 1] = (-ny / L * 0.5 + 0.5) * 255; img.data[k + 2] = (1 / L * 0.5 + 0.5) * 255; img.data[k + 3] = 255; }
    g.putImageData(img, 0, 0);
  }, size);
}
const hash = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
const weaveN = () => nrmFromHeight('weave', (u, v) => (Math.sin(u * Math.PI * 2 * 64) * Math.sin(v * Math.PI * 2 * 64) * 0.5 + 0.5) * 0.6 + hash(Math.floor(u * 256), Math.floor(v * 256)) * 0.2);
const denimN = () => nrmFromHeight('denim', (u, v) => ((u * 90 + v * 90) % 1 < 0.5 ? 0.6 : 0.2) + hash(Math.floor(u * 256), Math.floor(v * 256)) * 0.25);
const knitN = () => nrmFromHeight('knit', (u, v) => { const cu = (u * 40) % 1, cv = (v * 60) % 1; return Math.abs(Math.sin((cu + (cv < 0.5 ? cv : 1 - cv)) * Math.PI)) * 0.8; });
const skinN = () => nrmFromHeight('skin', (u, v) => hash(Math.floor(u * 256), Math.floor(v * 256)) * 0.15 + Math.sin(u * 600) * 0.02);
const hairN = () => nrmFromHeight('hair', (u, v) => Math.sin(u * Math.PI * 2 * 70 + Math.sin(v * 20) * 2) * 0.5 + 0.5 + hash(Math.floor(u * 256), 0) * 0.4);
function patternTex(kind, base, chan) {
  const key = 'pat' + kind + base + chan;
  return noiseTex(key, (g, s) => {
    const c = new THREE.Color(base), dark = c.clone().multiplyScalar(0.55), light = c.clone().lerp(new THREE.Color(0xffffff), 0.35);
    g.fillStyle = '#' + c.getHexString(); g.fillRect(0, 0, s, s);
    if (kind === 1) { g.fillStyle = '#' + light.getHexString(); for (let y = 0; y < s; y += 32) g.fillRect(0, y, s, 12); }
    if (kind === 3) { g.globalAlpha = 0.45; g.fillStyle = '#' + dark.getHexString(); for (let i = 0; i < s; i += 40) { g.fillRect(i, 0, 14, s); g.fillRect(0, i, s, 14); } g.globalAlpha = 1; }
    if (kind === 2) { // надпись канала на груди: на развёртке грудь — около u=0.5
      g.save(); g.translate(s * 0.5, s * 0.72); g.scale(-1, 1); g.fillStyle = '#' + light.getHexString(); g.font = 'bold 15px "Courier New", monospace'; g.textAlign = 'center'; g.fillText(String(chan || 'НОЧНОЙ ЭФИР').toUpperCase().slice(0, 14), 0, 0); g.beginPath(); g.arc(-58, -5, 4, 0, 7); g.fillStyle = '#e0392c'; g.fill(); g.restore();
    }
  }, 256);
}
function irisTex(col) {
  return noiseTex('iris' + col, (g, s) => {
    const cx = s / 2, cy = s / 2; const gr = g.createRadialGradient(cx, cy, 2, cx, cy, s * 0.5); gr.addColorStop(0, col); gr.addColorStop(0.85, col); gr.addColorStop(1, '#1a1410');
    g.fillStyle = gr; g.fillRect(0, 0, s, s);
    g.strokeStyle = 'rgba(255,255,255,.18)'; for (let i = 0; i < 40; i++) { const a = i / 40 * 7; g.beginPath(); g.moveTo(cx + Math.cos(a) * s * 0.2, cy + Math.sin(a) * s * 0.2); g.lineTo(cx + Math.cos(a) * s * 0.46, cy + Math.sin(a) * s * 0.46); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(cx - s * 0.16, cy - s * 0.16, s * 0.08, 0, 7); g.fill();
  }, 128);
}

// ---------------- Сборка ----------------
const GEO = new Map();
const cached = (key, fn) => { if (!GEO.has(key)) GEO.set(key, fn()); return GEO.get(key); };
export function makeHuman(name, lookIn, tagSprite, opts = {}) {
  const L = cleanLook(lookIn), O = LOOK_OPTIONS; const val = (k) => O[k].values[L[k]];
  const skinC = new THREE.Color(val('skin')), topC = new THREE.Color(val('topColor')), botC = new THREE.Color(val('bottomColor'));
  const skin = new THREE.MeshStandardMaterial({ color: skinC, roughness: 0.62, normalMap: skinN(), normalScale: new THREE.Vector2(0.25, 0.25) });
  skin.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * vec3(0.10, 0.03, 0.02);'); }; // лёгкое подповерхностное тепло
  const topNorm = L.top === 5 ? knitN() : weaveN();
  const topM = new THREE.MeshStandardMaterial({ color: L.pattern ? 0xffffff : topC, map: L.pattern ? patternTex(L.pattern, val('topColor'), opts.chan) : null, roughness: L.top === 3 ? 0.45 : L.top === 4 ? 0.5 : 0.88, normalMap: topNorm, normalScale: new THREE.Vector2(0.22, 0.22) });
  topNorm.repeat.set(3, 3);
  if (topM.map) topM.map.repeat.set(1, 1);
  const botM = new THREE.MeshStandardMaterial({ color: botC, roughness: 0.9, normalMap: L.bottom === 0 ? denimN() : weaveN(), normalScale: new THREE.Vector2(0.6, 0.6) });
  const hairM = new THREE.MeshStandardMaterial({ color: new THREE.Color(val('hair')), roughness: 0.55, normalMap: hairN(), normalScale: new THREE.Vector2(0.8, 0.8) });
  const lipM = new THREE.MeshStandardMaterial({ color: skinC.clone().lerp(new THREE.Color(0x9a4a44), 0.35), roughness: 0.45 });
  const shoeM = new THREE.MeshStandardMaterial({ color: new THREE.Color(val('shoeColor')), roughness: L.shoes >= 2 ? 0.45 : 0.75, normalMap: weaveN(), normalScale: new THREE.Vector2(0.3, 0.3) });
  const soleM = new THREE.MeshStandardMaterial({ color: L.shoes >= 2 ? 0x1a1612 : 0xe8e4dc, roughness: 0.8 });
  const hatM = new THREE.MeshStandardMaterial({ color: new THREE.Color(val('hatColor')), roughness: 0.75, normalMap: weaveN(), normalScale: new THREE.Vector2(0.4, 0.4) });
  const metal = new THREE.MeshStandardMaterial({ color: 0x222224, metalness: 0.8, roughness: 0.35 });
  const black = new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 0.4 });

  const g = new THREE.Group(); const body = new THREE.Group(); g.add(body);
  const S = makeSkeleton(); body.add(S.root);
  const bodyGeo = cached('b' + [L.gender, L.build, L.top, L.bottom].join(), () => makeBodyGeo(L));
  for (const m of [topM, botM]) m.side = THREE.DoubleSide;
  const bskin = skin.clone(); bskin.side = THREE.DoubleSide; bskin.onBeforeCompile = skin.onBeforeCompile;
  const mesh = new THREE.SkinnedMesh(bodyGeo, [bskin, topM, botM]); mesh.frustumCulled = false;
  body.add(mesh); S.root.updateMatrixWorld(true); mesh.updateMatrixWorld(true); mesh.bind(new THREE.Skeleton(S.bones), new THREE.Matrix4());
  const A = { human: true, group: g, body, S, legs: [], arms: [], hips: S.hips, torso: S.spine, head: S.head, mats: { skin, topM, botM } };
  // голова
  const headGeo = cached('h' + [L.gender, L.face, L.nose].join(), () => makeHeadGeo(L));
  const head = new THREE.Mesh(headGeo, [skin, lipM]); S.head.add(head);
  const hairGeo = cached('r' + [L.gender, L.face, L.nose, L.hairStyle, L.hat === 5 || L.hat === 4 ? 1 : 0].join(), () => makeHairGeo(L)); if (hairGeo) S.head.add(new THREE.Mesh(hairGeo, hairM));
  const beardGeo = cached('d' + [L.gender, L.face, L.nose, L.beard].join(), () => makeBeardGeo(L));
  if (beardGeo) { const bm = L.beard === 1 ? new THREE.MeshStandardMaterial({ color: new THREE.Color(val('hair')).lerp(skinC, 0.45), roughness: 0.9, transparent: true, opacity: 0.75 }) : hairM; S.head.add(new THREE.Mesh(beardGeo, bm)); }
  const H = headParams(L);
  for (const s of [-1, 1]) {
    const eye = new THREE.Group(); eye.position.set(s * 0.032, 0.084, -0.0778); S.head.add(eye);
    eye.add(new THREE.Mesh(new THREE.SphereGeometry(0.0104, 18, 14), new THREE.MeshStandardMaterial({ color: 0xece6dc, roughness: 0.2 })));
    const iris = new THREE.Mesh(new THREE.CircleGeometry(0.0064, 20), new THREE.MeshStandardMaterial({ map: irisTex(val('eyes')), roughness: 0.1 })); iris.position.z = -0.0101; iris.rotation.y = Math.PI; eye.add(iris);
    const pup = new THREE.Mesh(new THREE.CircleGeometry(0.0024, 14), new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.05 })); pup.position.z = -0.01015; pup.rotation.y = Math.PI; eye.add(pup);
    eye.rotation.y = s * 0.06;
    const bw = [0.0028, 0.0042, 0.0058][L.brows]; const brow = new THREE.Mesh(new THREE.CapsuleGeometry(bw, 0.024, 3, 6), hairM); brow.rotation.z = Math.PI / 2 + s * (H.F ? 0.18 : 0.08); brow.position.set(s * 0.033, 0.106, -0.088 - (H.F ? 0 : 0.003)); S.head.add(brow);
  }
  // кисти
  const handGeo = cached('hand', makeHandGeo);
  const gloves = val('extra') === 'перчатки';
  const handM = gloves ? new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7, normalMap: weaveN(), normalScale: new THREE.Vector2(0.4, 0.4) }) : skin;
  for (let i = 0; i < 2; i++) { const s = i ? 1 : -1; const h = new THREE.Mesh(handGeo, handM); h.scale.x = s; S.arms[i].hd.add(h); A.arms.push({ sh: S.arms[i].ua, el: S.arms[i].fa, hand: S.arms[i].hd, s, shoulder: S.arms[i].sh }); }
  // обувь
  const shoeGeo = cached('s' + L.shoes, () => makeShoeGeo(val('shoes')));
  for (let i = 0; i < 2; i++) { const sm = new THREE.Mesh(shoeGeo, [shoeM, soleM]); S.legs[i].ft.add(sm); A.legs.push({ hip: S.legs[i].ul, knee: S.legs[i].ll, foot: S.legs[i].ft, s: i ? 1 : -1 }); }
  // головные уборы (в системе головы; череп: центр (0, 0.105, 0.012), радиус около 0.094)
  const hat = val('hat'); const hg = new THREE.Group(); hg.position.set(0, 0.105, 0.012); S.head.add(hg);
  const sph2 = (r, m, phi = Math.PI * 0.5) => new THREE.Mesh(new THREE.SphereGeometry(r, 28, 16, 0, Math.PI * 2, 0, phi), m);
  if (hat === 'кепка' || hat === 'кепка назад') {
    const c = sph2(0.1, hatM, Math.PI * 0.52); c.scale.set(0.9, 0.92, 1.0); c.position.y = 0.0; hg.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.008, 24, 1, false, Math.PI * 0.5, Math.PI), hatM); brim.position.set(0, 0.012, -0.085); brim.scale.set(0.95, 1, 0.85); brim.rotation.x = 0.12;
    const back = hat === 'кепка назад'; if (back) { brim.rotation.y = Math.PI; brim.position.z = 0.09; brim.rotation.x = -0.12; } hg.add(brim);
    const btn = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), hatM); btn.position.y = 0.093; hg.add(btn);
  } else if (hat === 'шапка') {
    const c = sph2(0.104, hatM, Math.PI * 0.58); c.scale.set(0.92, 1.12, 1.0); hg.add(c); c.material = hatM.clone(); c.material.normalMap = knitN(); c.material.normalScale = new THREE.Vector2(0.8, 0.8);
    const fold = new THREE.Mesh(new THREE.TorusGeometry(0.094, 0.016, 8, 30), c.material); fold.rotation.x = Math.PI / 2; fold.scale.set(0.92, 1, 1); fold.position.y = 0.008; hg.add(fold);
  } else if (hat === 'каска с фонарём') {
    const c = sph2(0.112, hatM, Math.PI * 0.5); c.scale.set(0.92, 0.95, 1.02); hg.add(c);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.008, 30), hatM); brim.scale.set(0.9, 1, 1.05); brim.position.y = 0.006; hg.add(brim);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.022, 0.2), hatM); ridge.position.y = 0.1; hg.add(ridge);
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.03, 14), metal); lamp.rotation.x = Math.PI / 2; lamp.position.set(0, 0.05, -0.106); hg.add(lamp);
    const lg = new THREE.Mesh(new THREE.CircleGeometry(0.017, 14), new THREE.MeshBasicMaterial({ color: 0xfff0c0 })); lg.position.set(0, 0.05, -0.122); lg.rotation.y = Math.PI; hg.add(lg);
  } else if (hat === 'капюшон' && (L.top === 1 || true)) {
    const c = new THREE.Mesh(new THREE.SphereGeometry(0.125, 28, 18, Math.PI * 1.5 + 0.75, Math.PI * 2 - 1.5, 0, Math.PI * 0.72), L.top === 1 ? topM : hatM); c.scale.set(1, 1.1, 1.12); c.position.set(0, -0.01, 0.006); hg.add(c);
  } else if (hat === 'бандана') {
    const c = sph2(0.1, hatM, Math.PI * 0.46); c.scale.set(0.94, 0.96, 1.02); c.rotation.x = -0.15; hg.add(c);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), hatM); knot.position.set(0, -0.02, 0.098); hg.add(knot);
    for (const s of [-1, 1]) { const tail = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.004), hatM); tail.position.set(s * 0.012, -0.055, 0.1); tail.rotation.z = s * 0.3; hg.add(tail); }
  } else if (hat === 'панама') {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.098, 0.07, 28, 1, true), hatM); c.position.y = 0.045; hg.add(c);
    const top = new THREE.Mesh(new THREE.CircleGeometry(0.085, 28), hatM); top.rotation.x = -Math.PI / 2; top.position.y = 0.08; hg.add(top);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 0.035, 30, 1, true), hatM); brim.position.y = 0.0; hg.add(brim);
    hatM.side = THREE.DoubleSide;
  }
  // очки
  const gl = val('glasses');
  if (gl !== 'нет') {
    const fr = new THREE.MeshStandardMaterial({ color: gl === 'круглые' ? 0x8a6a3a : 0x111111, roughness: 0.3, metalness: gl === 'круглые' ? 0.9 : 0.4 });
    const lensM = gl === 'тёмные' ? new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.05, metalness: 0.6 }) : new THREE.MeshStandardMaterial({ color: 0xa8c0d0, transparent: true, opacity: 0.22, roughness: 0.05 });
    for (const s of [-1, 1]) {
      const r = gl === 'круглые' ? new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.0018, 6, 24), fr) : new THREE.Mesh(new THREE.TorusGeometry(0.021, 0.0026, 4, 4), fr);
      if (gl !== 'круглые') { r.rotation.z = Math.PI / 4; r.scale.set(1.25, 0.8, 1); }
      r.position.set(s * 0.033, 0.087, -0.103); S.head.add(r);
      const l = new THREE.Mesh(new THREE.CircleGeometry(gl === 'круглые' ? 0.018 : 0.02, 20), lensM); l.position.set(s * 0.033, 0.087, -0.1035); l.rotation.y = Math.PI; if (gl !== 'круглые') l.scale.set(1.15, 0.78, 1); S.head.add(l);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.002, 0.003, 0.09), fr); arm.position.set(s * 0.066, 0.09, -0.06); arm.rotation.y = s * 0.12; S.head.add(arm);
    }
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0025, 0.003), fr); br.position.set(0, 0.092, -0.106); S.head.add(br);
  }
  // шарф, наушники, маска
  const ex = val('extra');
  if (ex === 'шарф') { const sm = new THREE.MeshStandardMaterial({ color: new THREE.Color(val('hatColor')), roughness: 0.95, normalMap: knitN(), normalScale: new THREE.Vector2(0.8, 0.8) }); const t = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.024, 10, 26), sm); t.rotation.x = Math.PI / 2 - 0.1; t.position.set(0, 0.02, -0.01); S.neck.add(t); const end = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.014), sm); end.position.set(0.035, 0.09, -0.125); end.rotation.z = 0.1; S.chest.add(end); }
  if (ex === 'наушники') { const band = new THREE.Mesh(new THREE.TorusGeometry(0.088, 0.006, 6, 24, Math.PI), black); band.position.set(0, 0.1, 0.01); S.head.add(band); for (const s of [-1, 1]) { const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.02, 18), black); cup.rotation.z = Math.PI / 2; cup.position.set(s * 0.084, 0.085, 0.006); S.head.add(cup); } }
  if (ex === 'маска') { const mm = new THREE.MeshStandardMaterial({ color: 0x3a5a7a, roughness: 0.9, normalMap: weaveN(), normalScale: new THREE.Vector2(0.5, 0.5) }); const m = new THREE.Mesh(new THREE.SphereGeometry(0.07, 22, 14, Math.PI * 1.5 - 0.9, 1.8, Math.PI * 0.42, Math.PI * 0.34), mm); m.scale.set(1, 1, 1.2); m.position.set(0, 0.07, -0.02); S.head.add(m); }
  // рюкзак на спине
  if (L.backpack) {
    const big = L.backpack === 2; const bpM = new THREE.MeshStandardMaterial({ color: topC.clone().multiplyScalar(0.5).lerp(new THREE.Color(0x3a3a30), 0.5), roughness: 0.85, normalMap: weaveN(), normalScale: new THREE.Vector2(0.6, 0.6) });
    const bp = new THREE.Group(); bp.position.set(0, 1.25 - 1.27, 0.13 + (TOPS[val('top')].inf)); S.chest.add(bp);
    const main = new THREE.Mesh(new THREE.CapsuleGeometry(big ? 0.11 : 0.09, big ? 0.3 : 0.18, 6, 14), bpM); main.scale.set(1.25, 1, 0.65); bp.add(main);
    const pk = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.06, 4, 10), bpM); pk.scale.set(1.4, 1, 0.5); pk.position.set(0, -0.08, 0.06); bp.add(pk);
    if (big) { const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.3, 14), new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 0.9 })); roll.rotation.z = Math.PI / 2; roll.position.set(0, 0.27, 0); bp.add(roll); }
    for (const s of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.32, 0.012), black); st.position.set(s * 0.085, 0.02, -0.22 - TOPS[val('top')].inf); st.rotation.x = 0.12; bp.add(st); }
  }
  // молния на куртке и пуховике, шнурки худи
  if (L.top === 2 || L.top === 4 || L.top === 3) { const zp = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.36, 0.004), metal); zp.position.set(0, 1.24 - 1.27, -(0.108 + TOPS[val('top')].inf) * [0.88, 1, 1.12, 1.18][L.build]); S.chest.add(zp); }
  if (L.top === 1 && L.hat !== 5) { const hood = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.035, 10, 20, Math.PI), topM); hood.position.set(0, 1.47 - 1.27, 0.06); hood.rotation.set(-0.6, 0, 0); hood.scale.set(1, 1, 0.8); S.chest.add(hood); }
  // фонарь в правой руке, телефон в левой
  const R = A.arms[1], Lh = A.arms[0];
  const torch = new THREE.Group(); torch.position.set(-0.005, -0.1, -0.03); torch.rotation.x = Math.PI; R.hand.add(torch); A.torch = torch;
  torch.add(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.026, 0.17, 14), metal));
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.024, 16), new THREE.MeshBasicMaterial({ color: 0xfff2d8 })); lens.position.y = 0.087; lens.rotation.x = -Math.PI / 2; torch.add(lens); A.lens = lens;
  const phone = new THREE.Group(); phone.position.set(0.005, -0.11, -0.04); phone.rotation.set(-0.2, 0, 0); Lh.hand.add(phone); A.phone = phone; phone.visible = false;
  phone.add(new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.148, 0.008), new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.35, metalness: 0.6 })));
  const scrM = new THREE.MeshBasicMaterial({ color: 0x9fb2c4 }); const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.064, 0.136), scrM); scr.position.z = 0.0042; phone.add(scr); A.phoneScr = scrM;
  const rec = new THREE.Mesh(new THREE.CircleGeometry(0.006, 10), new THREE.MeshBasicMaterial({ color: 0xff2a1a })); rec.position.set(0.024, 0.06, -0.0045); rec.rotation.y = Math.PI; phone.add(rec); A.phoneRec = rec; rec.visible = false;
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  if (tagSprite) { tagSprite.position.y = 2.0; g.add(tagSprite); A.tag = tagSprite; }
  g.scale.setScalar([0.93, 0.965, 1, 1.035, 1.07][L.height] * (L.gender === 1 ? 0.96 : 1));
  A.walk = 0;
  return A;
}

// поза: ходьба, бег, присед, лежит; правая рука с фонарём смотрит туда же, куда игрок
export function poseHuman(A, { moving, running, crouch, down, pitch = 0, dt = 0.016, relaxed = false, phone = false, rec = false }) {
  A.walk += dt * (moving ? (running ? 10.5 : crouch ? 5 : 7.2) : 0);
  const s = moving ? Math.sin(A.walk) : 0, c2 = moving ? Math.cos(A.walk * 2) : 0, amp = running ? 0.85 : crouch ? 0.35 : 0.55;
  const S = A.S;
  S.hips.position.y = crouch ? 0.62 : 0.95 + (moving ? Math.abs(Math.cos(A.walk)) * 0.025 - 0.01 : 0);
  S.hips.rotation.y = s * 0.08; S.hips.rotation.z = moving ? s * 0.03 : 0;
  A.legs.forEach((l, i) => {
    const ph = i ? -s : s;
    l.hip.rotation.x = crouch ? 1.05 + ph * amp * 0.4 : ph * amp + (running ? 0.15 : 0);
    l.knee.rotation.x = crouch ? -1.75 : -Math.max(0, -ph) * amp * 1.5 - 0.06 - (running ? 0.3 : 0);
    l.foot.rotation.x = crouch ? 0.55 : Math.max(0, ph) * 0.25;
  });
  S.spine.rotation.x = crouch ? -0.38 : running ? -0.18 : -0.02 + c2 * 0.01;
  S.spine.rotation.y = -s * 0.1; S.chest.rotation.x = crouch ? -0.1 : 0;
  A.arms.forEach((a) => {
    const back = S.spine.rotation.x + S.chest.rotation.x;
    if (a.s > 0 && !relaxed) { a.sh.rotation.set(1.25 + pitch * 0.9 - back, 0.1, 0.1); a.el.rotation.x = 0.3; a.hand.rotation.set(0, 0, 0); }
    else if (a.s < 0 && phone && !relaxed && !down) { a.sh.rotation.set(1.15 + pitch * 0.9 - back, -0.25, -0.35); a.el.rotation.x = 0.6; a.hand.rotation.set(0.2, 0, 0); }
    else if (relaxed) { a.sh.rotation.set(0.06 + Math.sin(A.walk * 0.5 + a.s) * 0.02, 0, a.s * 0.05); a.el.rotation.x = 0.22; a.hand.rotation.set(0, 0, 0); }
    else { a.sh.rotation.set(-s * a.s * amp * 0.8, 0, a.s * 0.06); a.el.rotation.x = 0.3 + (running ? 0.9 : 0); a.hand.rotation.set(0, 0, 0); }
  });
  S.neck.rotation.x = -pitch * 0.25; S.head.rotation.x = -pitch * 0.3 + (crouch ? 0.25 : 0);
  A.body.rotation.x = down ? -1.45 : 0; A.body.position.y = down ? 0.15 : 0; A.body.position.z = down ? 0.95 : 0;
  if (A.phone) { A.phone.visible = phone && !down; A.phoneRec.visible = rec && Math.sin(performance.now() / 160) > -0.2; }
}
