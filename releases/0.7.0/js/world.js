// Генерация подземелья, процедурные текстуры и сборка сцены
import * as THREE from 'three';
import { makeCart, makeCrate } from './props.js';
import { KITS, kitTexture, makeFurniture, makeTube, buildTrees, buildSky, buildColumns, buildWagons, buildRoofs } from './kits.js';

export const TILE = 2.4;
export const WALL_H = 3.3;

export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- Планировки ----------------
// grid: 0 — пол, 1 — стена; kind уточняет, чем рисовать занятую клетку: 1 стена, 2 дерево, 3 колонна, 4 вагон
function carveMaze(grid, kind, G, cells, R) {
  const idx = (x, y) => y * G + x;
  const seen = new Uint8Array(cells * cells); const stack = [[0, 0]]; seen[0] = 1; grid[idx(1, 1)] = 0;
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const opts = dirs.filter(([dx, dy]) => { const nx = cx + dx, ny = cy + dy; return nx >= 0 && ny >= 0 && nx < cells && ny < cells && !seen[ny * cells + nx]; });
    if (!opts.length) { stack.pop(); continue; }
    const [dx, dy] = opts[Math.floor(R() * opts.length)]; const nx = cx + dx, ny = cy + dy;
    seen[ny * cells + nx] = 1; grid[idx(cx * 2 + 1 + dx, cy * 2 + 1 + dy)] = 0; grid[idx(nx * 2 + 1, ny * 2 + 1)] = 0; stack.push([nx, ny]);
  }
  for (let i = 0; i < cells * cells * 0.16; i++) {
    const x = 1 + Math.floor(R() * (G - 2)), y = 1 + Math.floor(R() * (G - 2)); if (grid[idx(x, y)] !== 1) continue;
    const h = grid[idx(x - 1, y)] === 0 && grid[idx(x + 1, y)] === 0 && grid[idx(x, y - 1)] === 1 && grid[idx(x, y + 1)] === 1;
    const v = grid[idx(x, y - 1)] === 0 && grid[idx(x, y + 1)] === 0 && grid[idx(x - 1, y)] === 1 && grid[idx(x + 1, y)] === 1;
    if (h || v) grid[idx(x, y)] = 0;
  }
  const rooms = [];
  for (let i = 0; i < 4; i++) { const w = 3 + Math.floor(R() * 2) * 2, hh = 3 + Math.floor(R() * 2) * 2; const x0 = 1 + Math.floor(R() * (G - w - 2)), y0 = 1 + Math.floor(R() * (G - hh - 2)); for (let y = y0; y < y0 + hh; y++) for (let x = x0; x < x0 + w; x++) grid[idx(x, y)] = 0; rooms.push({ x0, y0, w, h: hh }); }
  return rooms;
}
// здание: коридоры и комнаты с дверями (больница, школа, НИИ, бункер, завод)
function carveBuilding(grid, kind, G, R, o) {
  const idx = (x, y) => y * G + x; const set = (x, y, v) => { if (x > 0 && y > 0 && x < G - 1 && y < G - 1) grid[idx(x, y)] = v; };
  const cw = o.corridor || 2, minR = o.minRoom || 4, maxR = o.maxRoom || 7;
  const hs = [], vs = [];
  const nH = o.hCorr || 2, nV = o.vCorr || 2;
  for (let i = 1; i <= nH; i++) hs.push(Math.round(i * (G - 2) / (nH + 1)));
  for (let i = 1; i <= nV; i++) vs.push(Math.round(i * (G - 2) / (nV + 1)));
  for (const y of hs) for (let x = 1; x < G - 1; x++) for (let k = 0; k < cw; k++) set(x, y + k, 0);
  for (const x of vs) for (let y = 1; y < G - 1; y++) for (let k = 0; k < cw; k++) set(x + k, y, 0);
  // кварталы между коридорами режем на комнаты
  const xs = [1, ...vs.flatMap((x) => [x - 1, x + cw + 1]), G - 1], ys = [1, ...hs.flatMap((y) => [y - 1, y + cw + 1]), G - 1];
  const rooms = [];
  for (let bi = 0; bi < xs.length; bi += 2) for (let bj = 0; bj < ys.length; bj += 2) {
    const bx0 = xs[bi], bx1 = xs[bi + 1], by0 = ys[bj], by1 = ys[bj + 1]; if (bx1 - bx0 < 2 || by1 - by0 < 2) continue;
    const splitX = []; let x = bx0; while (x < bx1) { const w = Math.min(bx1 - x, minR + Math.floor(R() * (maxR - minR + 1))); splitX.push([x, x + w]); x += w + 1; }
    const splitY = []; let y = by0; while (y < by1) { const h = Math.min(by1 - y, minR + Math.floor(R() * (maxR - minR + 1))); splitY.push([y, y + h]); y += h + 1; }
    for (const [x0, x1] of splitX) for (const [y0, y1] of splitY) {
      if (x1 - x0 < 2 || y1 - y0 < 2) continue;
      if (o.merge && R() < o.merge) continue; // пропуск — монолит
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) set(xx, yy, 0);
      rooms.push({ x0, y0, w: x1 - x0, h: y1 - y0 });
      // дверь в ближайший коридор
      const doors = [];
      if (hs.includes(y1 + 1)) doors.push([x0 + Math.floor(R() * (x1 - x0)), y1]);
      if (hs.some((h) => h + cw === y0 - 1 || h + cw === y0)) doors.push([x0 + Math.floor(R() * (x1 - x0)), y0 - 1]);
      if (vs.includes(x1 + 1)) doors.push([x1, y0 + Math.floor(R() * (y1 - y0))]);
      if (vs.some((v) => v + cw === x0 - 1 || v + cw === x0)) doors.push([x0 - 1, y0 + Math.floor(R() * (y1 - y0))]);
      if (!doors.length) doors.push(R() < 0.5 ? [x1, y0 + Math.floor((y1 - y0) / 2)] : [x0 + Math.floor((x1 - x0) / 2), y1]);
      doors.forEach(([dx, dy], i) => { if (i === 0 || R() < 0.5) set(dx, dy, 0); });
      if (R() < 0.35) set(x1, y0 + Math.floor(R() * (y1 - y0)), 0); // смежная дверь к соседу
    }
  }
  return rooms;
}
// метро: два тоннеля, платформа с колоннами между ними, служебки по краям
function carveMetro(grid, kind, G, R, ex) {
  const idx = (x, y) => y * G + x; const set = (x, y, v, k) => { if (x > 0 && y > 0 && x < G - 1 && y < G - 1) { grid[idx(x, y)] = v; if (k) kind[idx(x, y)] = k; } };
  const rooms = carveBuilding(grid, kind, G, R, { corridor: 1, minRoom: 3, maxRoom: 5, hCorr: 2, vCorr: 3 });
  const mid = Math.floor(G / 2), t1 = mid - 5, t2 = mid + 3;
  for (let x = 1; x < G - 1; x++) for (let y = t1 - 1; y <= t2 + 3; y++) set(x, y, 1, 1);
  for (let x = 1; x < G - 1; x++) for (let k = 0; k < 3; k++) { set(x, t1 + k, 0); set(x, t2 + k, 0); }
  const px0 = Math.floor(G * 0.2), px1 = Math.floor(G * 0.8);
  for (let x = px0; x < px1; x++) for (let y = t1 + 3; y < t2; y++) set(x, y, 0);
  for (let x = px0 + 2; x < px1 - 1; x += 3) set(x, mid - 1, 1, 3);
  // переходы из служебок к тоннелям
  for (let x = 4; x < G - 4; x += 5 + Math.floor(R() * 4)) { set(x, t1 - 1, 0); set(x, t2 + 3, 0); }
  rooms.push({ x0: px0, y0: t1 + 3, w: px1 - px0, h: t2 - t1 - 3 });
  ex.tracks.push({ y: t1 + 1, x0: 1, x1: G - 2 }, { y: t2 + 1, x0: 1, x1: G - 2 });
  ex.platform = { x0: px0, x1: px1 - 1, y0: t1 + 3, y1: t2 - 1 };
  return rooms;
}
// пионерлагерь: открытая местность, лес по краям и деревья, домики с дверями
function carveCamp(grid, kind, G, R, ex) {
  const idx = (x, y) => y * G + x;
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) grid[idx(x, y)] = 0;
  for (let i = 0; i < G * G; i++) if (grid[i]) kind[i] = 2;
  const rooms = [];
  for (let i = 0; i < 80 && rooms.length < 8; i++) {
    const big = i === 0; const w = big ? 8 : 4 + Math.floor(R() * 3), h = big ? 6 : 4 + Math.floor(R() * 2);
    const x0 = 5 + Math.floor(R() * (G - w - 8)), y0 = 5 + Math.floor(R() * (G - h - 8));
    if (rooms.some((r) => x0 < r.x0 + r.w + 3 && x0 + w + 3 > r.x0 && y0 < r.y0 + r.h + 3 && y0 + h + 3 > r.y0)) continue;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const edge = x === x0 || y === y0 || x === x0 + w - 1 || y === y0 + h - 1; grid[idx(x, y)] = edge ? 1 : 0; kind[idx(x, y)] = edge ? 1 : 0; }
    grid[idx(x0 + Math.floor(w / 2), y0 + h - 1)] = 0; kind[idx(x0 + Math.floor(w / 2), y0 + h - 1)] = 0;
    if (R() < 0.5) { grid[idx(x0, y0 + 1 + Math.floor(R() * (h - 2)))] = 0; }
    rooms.push({ x0: x0 + 1, y0: y0 + 1, w: w - 2, h: h - 2 });
  }
  for (let i = 0; i < G * G * 0.1; i++) { const x = 2 + Math.floor(R() * (G - 4)), y = 2 + Math.floor(R() * (G - 4)); if (x < 6 && y < 6) continue; if (grid[idx(x, y)] === 0 && !rooms.some((r) => x >= r.x0 - 2 && x <= r.x0 + r.w + 1 && y >= r.y0 - 2 && y <= r.y0 + r.h + 1) && !ex.trees.some((t) => t[0] === x && t[1] === y)) ex.trees.push([x, y]); }
  return rooms;
}
// депо: большой цех, ряды вагонов, конторки по периметру
function carveDepot(grid, kind, G, R) {
  const idx = (x, y) => y * G + x;
  const rooms = carveBuilding(grid, kind, G, R, { corridor: 1, minRoom: 3, maxRoom: 4, hCorr: 1, vCorr: 1 });
  const x0 = 5, x1 = G - 5, y0 = 5, y1 = G - 5;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { grid[idx(x, y)] = 0; kind[idx(x, y)] = 0; }
  for (let y = y0 + 2; y < y1 - 2; y += 4) { let x = x0 + 2 + Math.floor(R() * 3); while (x < x1 - 6) { const len = 4 + Math.floor(R() * 4); for (let k = 0; k < len && x + k < x1 - 2; k++) { grid[idx(x + k, y)] = 1; kind[idx(x + k, y)] = 4; } x += len + 2 + Math.floor(R() * 3); } }
  for (let x = x0; x < x1; x += 6) { grid[idx(x, y0 - 1)] = 0; grid[idx(x, y1)] = 0; }
  for (let y = y0; y < y1; y += 6) { grid[idx(x0 - 1, y)] = 0; grid[idx(x1, y)] = 0; }
  rooms.push({ x0, y0, w: x1 - x0, h: y1 - y0 });
  return rooms;
}

// все островки пола соединяются с входом прямыми ходами
function connectAll(grid, kind, G) {
  const idx = (x, y) => y * G + x;
  for (let it = 0; it < 80; it++) {
    const d = bfs(grid, G, 2, 2); let lone = -1;
    for (let i = 0; i < G * G; i++) if (grid[i] === 0 && d[i] >= 1e9) { lone = i; break; }
    if (lone < 0) return;
    const lx = lone % G, ly = (lone / G) | 0; let best = -1, bd = 1e9;
    for (let i = 0; i < G * G; i++) if (grid[i] === 0 && d[i] < 1e9) { const dd = Math.abs(i % G - lx) + Math.abs(((i / G) | 0) - ly); if (dd < bd) { bd = dd; best = i; } }
    if (best < 0) return;
    let x = lx, y = ly; const bx = best % G, by = (best / G) | 0;
    while (x !== bx) { x += Math.sign(bx - x); if (x > 0 && x < G - 1) { grid[idx(x, y)] = 0; kind[idx(x, y)] = 0; } }
    while (y !== by) { y += Math.sign(by - y); if (y > 0 && y < G - 1) { grid[idx(x, y)] = 0; kind[idx(x, y)] = 0; } }
  }
}

export function generateMaze(seed, cells = 12, counts = {}, layout = 'maze', lopts = {}) {
  const C = Object.assign({ collect: 5, stations: 0, notes: 5, batteries: 9, flares: 0 }, counts);
  const R = rng(seed);
  const G = cells * 2 + 1;
  const grid = new Uint8Array(G * G).fill(1);
  const kind = new Uint8Array(G * G).fill(1);
  const idx = (x, y) => y * G + x;
  let rooms;
  const ex = { trees: [], tracks: [], platform: null };
  if (layout === 'building') rooms = carveBuilding(grid, kind, G, R, lopts);
  else if (layout === 'metro') rooms = carveMetro(grid, kind, G, R, ex);
  else if (layout === 'camp') rooms = carveCamp(grid, kind, G, R, ex);
  else if (layout === 'depot') rooms = carveDepot(grid, kind, G, R);
  else rooms = carveMaze(grid, kind, G, cells, R);
  // стартовая площадка у входа и проход от неё
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) { grid[idx(x, y)] = 0; kind[idx(x, y)] = 0; }
  for (let x = 1; x < G - 1 && x < 8; x++) if (grid[idx(x, 2)] === 1) { grid[idx(x, 2)] = 0; kind[idx(x, 2)] = 0; } else if (x > 3) break;
  for (let y = 1; y < G - 1 && y < 8; y++) if (grid[idx(2, y)] === 1) { grid[idx(2, y)] = 0; kind[idx(2, y)] = 0; } else if (y > 3) break;
  for (let i = 0; i < G * G; i++) if (grid[i] === 0) kind[i] = 0;
  connectAll(grid, kind, G);
  const treeSet = new Set(ex.trees.map(([x, y]) => idx(x, y)));
  const isWall = (x, y) => x < 0 || y < 0 || x >= G || y >= G || grid[idx(x, y)] === 1;
  // BFS от старта
  const dist = bfs(grid, G, 2, 2);
  let far = [2, 2], fd = 0;
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const d = dist[idx(x, y)];
    if (d > fd && d < 1e9) { fd = d; far = [x, y]; }
  }
  // Тупики
  const deadEnds = [], open = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y) || dist[idx(x, y)] >= 1e9 || treeSet.has(idx(x, y))) continue;
    const n = (isWall(x - 1, y) ? 1 : 0) + (isWall(x + 1, y) ? 1 : 0) + (isWall(x, y - 1) ? 1 : 0) + (isWall(x, y + 1) ? 1 : 0);
    if (n === 3) deadEnds.push([x, y]);
    open.push([x, y]);
  }
  const pick = (list, count, minD, avoid) => {
    const out = [];
    const sh = list.slice().sort(() => R() - 0.5);
    for (const p of sh) {
      if (out.length >= count) break;
      if (dist[idx(p[0], p[1])] < 6) continue;
      if (avoid.concat(out).some((q) => Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) < minD)) continue;
      out.push(p);
    }
    return out;
  };
  const spread = Math.max(5, Math.round(cells * 0.7));
  let stations = pick(deadEnds, C.stations, spread + 2, [far]);
  if (stations.length < C.stations) stations = stations.concat(pick(open, C.stations - stations.length, spread, [far, ...stations]));
  let fuses = pick(deadEnds, C.collect, spread, [far, ...stations]);
  if (fuses.length < C.collect) fuses = fuses.concat(pick(open, C.collect - fuses.length, 6, [far, ...stations, ...fuses]));
  const used = () => [far, [2, 2], ...stations, ...fuses];
  const batteries = pick(deadEnds.concat(open), C.batteries, 5, used());
  const notes = pick(deadEnds.concat(open), C.notes, 5, [...used(), ...batteries]);
  const flares = pick(deadEnds.concat(open), C.flares, 4, [...used(), ...batteries, ...notes]);
  const props = pick(open, Math.round(cells * cells * 0.3 * (C.propK || 1)), 2, [...used(), ...batteries, ...notes, ...flares]);
  return { G, grid, kind, isWall, dist, start: [2, 2], exit: far, fuses, stations, batteries, notes, flares, props, rooms, R, layout, trees: ex.trees, tracks: ex.tracks, platform: ex.platform };
}

export function bfs(grid, G, sx, sy) {
  const dist = new Float32Array(G * G).fill(1e9);
  const q = new Int32Array(G * G);
  let h = 0, t = 0;
  dist[sy * G + sx] = 0; q[t++] = sy * G + sx;
  while (h < t) {
    const c = q[h++]; const x = c % G, y = (c / G) | 0;
    const d = dist[c] + 1;
    const nb = [c - 1, c + 1, c - G, c + G];
    const ok = [x > 0, x < G - 1, y > 0, y < G - 1];
    for (let i = 0; i < 4; i++) {
      if (!ok[i]) continue; const n = nb[i];
      if (grid[n] === 0 && dist[n] > d) { dist[n] = d; q[t++] = n; }
    }
  }
  return dist;
}

export const tileCenter = (x, y) => new THREE.Vector3(x * TILE + TILE / 2, 0, y * TILE + TILE / 2);
export const toTile = (v) => [Math.floor(v.x / TILE), Math.floor(v.z / TILE)];

// ---------------- Процедурные текстуры ----------------
export function noise2(seed) {
  const R = rng(seed); const P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i++) P[i] = R();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const sm = (t) => t * t * (3 - 2 * t);
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = sm(x - xi), yf = sm(y - yi);
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
  return (x, y, oct = 4) => { let s = 0, a = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; a *= 0.5; f *= 2; } return s; };
}

export function makeMaps(size, fn, seed) {
  // fn(u,v) -> {h, r, g, b, rough}
  const H = new Float32Array(size * size);
  const col = document.createElement('canvas'); col.width = col.height = size;
  const rgh = document.createElement('canvas'); rgh.width = rgh.height = size;
  const nrm = document.createElement('canvas'); nrm.width = nrm.height = size;
  const cc = col.getContext('2d'), rc = rgh.getContext('2d'), nc = nrm.getContext('2d');
  const ci = cc.createImageData(size, size), ri = rc.createImageData(size, size), ni = nc.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const o = fn(x / size, y / size, x, y);
    const i = y * size + x; H[i] = o.h;
    ci.data[i * 4] = o.r; ci.data[i * 4 + 1] = o.g; ci.data[i * 4 + 2] = o.b; ci.data[i * 4 + 3] = 255;
    const rv = Math.max(0, Math.min(255, o.rough * 255));
    ri.data[i * 4] = rv; ri.data[i * 4 + 1] = rv; ri.data[i * 4 + 2] = rv; ri.data[i * 4 + 3] = 255;
  }
  const S = 5.0 * size / 512;
  const aoc = document.createElement('canvas'); aoc.width = aoc.height = size; const ac = aoc.getContext('2d'); const ai = ac.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = Math.max(0, Math.min(255, (0.35 + H[i] * 1.1) * 255)); ai.data[i * 4] = ai.data[i * 4 + 1] = ai.data[i * 4 + 2] = v; ai.data[i * 4 + 3] = 255; }
  ac.putImageData(ai, 0, 0);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const hl = H[y * size + ((x - 1 + size) % size)], hr = H[y * size + ((x + 1) % size)];
    const hu = H[((y - 1 + size) % size) * size + x], hd = H[((y + 1) % size) * size + x];
    let nx = (hl - hr) * S, ny = (hu - hd) * S, nz = 1; const l = Math.hypot(nx, ny, nz);
    nx /= l; ny /= l; nz /= l; const i = (y * size + x) * 4;
    ni.data[i] = (nx * 0.5 + 0.5) * 255; ni.data[i + 1] = (-ny * 0.5 + 0.5) * 255; ni.data[i + 2] = (nz * 0.5 + 0.5) * 255; ni.data[i + 3] = 255;
  }
  cc.putImageData(ci, 0, 0); rc.putImageData(ri, 0, 0); nc.putImageData(ni, 0, 0);
  const tex = (c, srgb) => { const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: tex(col, true), roughnessMap: tex(rgh), normalMap: tex(nrm), aoMap: tex(aoc) };
}

function brickTexture(size) {
  const N = noise2(11), N2 = noise2(23);
  const rows = 8, cols = 4;
  return makeMaps(size, (u, v) => {
    const ry = v * rows; const row = Math.floor(ry); const off = (row % 2) * 0.5;
    const rx = u * cols + off; const colI = Math.floor(rx);
    const fx = rx - colI, fy = ry - row;
    const wob = 0.7 + N(u * 40, v * 40, 2) * 0.6;
    const mortar = Math.min(Math.min(fx, 1 - fx) / (0.035 * wob), Math.min(fy, 1 - fy) / (0.07 * wob));
    const bseed = (row * 31 + ((colI % cols) + cols) % cols * 17) % 97;
    const bv = Math.abs((Math.sin(bseed * 12.9898) * 43758.5453) % 1);
    const n = N(u * 18, v * 18, 5);
    const chip = N2(u * 30 + bseed, v * 30, 3);
    const chipped = mortar >= 1 && mortar < 2.2 && chip > 0.62;
    const stain = Math.max(0, N2(u * 3, v * 1.2, 3) - 0.45) * 1.6 + v * 0.25;
    let h, r, g, b, rough;
    if (mortar < 1) {
      h = 0.15 * mortar + n * 0.08;
      const k = 55 + n * 30; r = k * 0.9; g = k * 0.88; b = k * 0.82; rough = 0.95;
    } else {
      const bump = Math.min(1, (mortar - 1) * 0.6);
      h = 0.4 + bump * 0.25 + n * 0.35;
      const base = 70 + bv * 60 + (n - 0.5) * 80;
      const hue = bv > 0.7 ? [0.95, 0.9, 0.85] : bv < 0.25 ? [1.05, 0.8, 0.65] : [1.0, 0.86, 0.74];
      r = base * hue[0]; g = base * hue[1]; b = base * hue[2]; rough = 0.8 - n * 0.25;
      if (chipped) { h -= 0.3; r *= 0.7; g *= 0.7; b *= 0.7; }
      const moss = N2(u * 6 + 3, v * 6, 4); if (moss > 0.66 && v > 0.55) { const k = (moss - 0.66) * 3; r = r * (1 - k) + 40 * k; g = g * (1 - k) + 55 * k; b = b * (1 - k) + 30 * k; }
    }
    const dk = 1 - Math.min(0.75, stain);
    r *= dk; g *= dk * 1.02; b *= dk * 0.98;
    if (stain > 0.5) rough -= 0.25; // мокрые подтёки
    return { h, r, g, b, rough };
  }, 1);
}

function floorTexture(size) {
  const N = noise2(5), N2 = noise2(77);
  return makeMaps(size, (u, v) => {
    const s = 2; const fx = (u * s) % 1, fy = (v * s) % 1;
    const tx = Math.floor(u * s), ty = Math.floor(v * s);
    const gap = Math.min(fx, 1 - fx, fy, 1 - fy);
    const n = N(u * 24, v * 24, 5);
    const crack = Math.abs(N2(u * 9 + tx, v * 9 + ty, 4) - 0.5) < 0.012 ? 1 : 0;
    const puddle = N2(u * 2.2, v * 2.2, 3);
    let h = gap < 0.02 ? 0.05 : 0.5 + n * 0.3 - crack * 0.3;
    const tint = ((tx * 7 + ty * 13) % 5) * 6;
    let k = 70 + n * 50 + tint - crack * 30; if (gap < 0.02) k = 30;
    let rough = 0.85 - n * 0.2;
    if (puddle > 0.6) { rough = 0.08; k *= 0.55; h = 0.45; }
    return { h, r: k * 0.92, g: k * 0.9, b: k * 0.88, rough };
  }, 2);
}

function ceilTexture(size) {
  const N = noise2(9);
  return makeMaps(size, (u, v) => {
    const n = N(u * 12, v * 12, 6); const k = 35 + n * 45;
    return { h: n, r: k, g: k * 0.95, b: k * 0.9, rough: 0.95 };
  }, 3);
}

function woodTexture(size) {
  const N = noise2(41);
  return makeMaps(size, (u, v) => {
    const plank = Math.floor(v * 5); const fy = (v * 5) % 1;
    const n = N(u * 3, v * 40 + plank * 7, 4);
    const grain = Math.sin((u * 60 + n * 8 + plank * 3)) * 0.5 + 0.5;
    const gap = fy < 0.04 || fy > 0.96;
    const k = gap ? 18 : 60 + grain * 30 + n * 30;
    return { h: gap ? 0 : 0.5 + grain * 0.2, r: k * 1.0, g: k * 0.72, b: k * 0.45, rough: 0.8 };
  }, 4);
}

export function flashlightCookie() {
  const s = 256, c = document.createElement('canvas'); c.width = c.height = s;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  grd.addColorStop(0, '#fffaf0'); grd.addColorStop(0.18, '#fff4dd'); grd.addColorStop(0.22, '#c9bda5');
  grd.addColorStop(0.5, '#8a8072'); grd.addColorStop(0.62, '#a39684'); grd.addColorStop(0.7, '#5a524a');
  grd.addColorStop(0.95, '#151311'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, s, s);
  // пыль и царапины на линзе
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(Math.random() * s, Math.random() * s, 2 + Math.random() * 10, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function sackTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5a4b38'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { const v = Math.random(); g.fillStyle = `rgba(${v > 0.5 ? 120 : 30},${v > 0.5 ? 100 : 22},${v > 0.5 ? 70 : 14},.25)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 1 + Math.random() * 3); }
    g.filter = 'blur(8px)'; for (let i = 0; i < 6; i++) { g.fillStyle = 'rgba(50,8,4,.55)'; g.beginPath(); g.ellipse(Math.random() * w, h * 0.5 + Math.random() * h * 0.5, 15 + Math.random() * 30, 20 + Math.random() * 50, 0, 0, 7); g.fill(); }
  });
}
function trailTexture() {
  return canvasTex(128, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.filter = 'blur(3px)';
    for (let i = 0; i < 5; i++) { g.strokeStyle = `rgba(${45 + Math.random() * 20},4,2,${0.35 + Math.random() * 0.3})`; g.lineWidth = 6 + Math.random() * 16; g.beginPath(); let x = 40 + Math.random() * 48; g.moveTo(x, 0); for (let y = 0; y < h; y += 32) { x += (Math.random() - 0.5) * 10; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(40,3,2,.7)'; g.beginPath(); g.ellipse(64, h - 60, 45, 55, 0, 0, 7); g.fill();
  });
}
function webTexture() {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h); g.strokeStyle = 'rgba(220,215,200,.5)'; g.lineWidth = 1;
    const cx = 0, cy = 0;
    for (let i = 0; i < 9; i++) { const a = i / 8 * Math.PI / 2; g.beginPath(); g.moveTo(cx, cy); g.lineTo(Math.cos(a) * 300, Math.sin(a) * 300); g.stroke(); }
    for (let r = 20; r < 260; r += 16 + Math.random() * 10) { g.beginPath(); for (let i = 0; i <= 8; i++) { const a = i / 8 * Math.PI / 2; const rr = r * (0.92 + Math.random() * 0.1); const x = Math.cos(a) * rr, y = Math.sin(a) * rr; i ? g.quadraticCurveTo(Math.cos(a - 0.1) * rr * 0.9, Math.sin(a - 0.1) * rr * 0.9, x, y) : g.moveTo(x, y); } g.stroke(); }
    g.fillStyle = 'rgba(200,195,180,.15)'; g.filter = 'blur(6px)'; g.fillRect(0, 0, 90, 90);
  });
}
function scratchTexture(R) {
  return canvasTex(256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let set = 0; set < 3; set++) {
      const ox = 30 + R() * 160, oy = 20 + R() * 80, ang = (R() - 0.5) * 0.5;
      for (let f = 0; f < 4; f++) {
        g.save(); g.translate(ox + f * 14, oy); g.rotate(ang);
        g.strokeStyle = 'rgba(15,10,8,.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(4, 50, -3, 100, 2, 130 + R() * 40); g.stroke();
        g.strokeStyle = 'rgba(190,170,140,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(1.5, 0); g.bezierCurveTo(5.5, 50, -1.5, 100, 3.5, 128); g.stroke();
        if (R() < 0.5) { g.fillStyle = 'rgba(60,6,4,.6)'; g.fillRect(-1, 120, 3, 20 + R() * 40); }
        g.restore();
      }
    }
  });
}

// ---------------- Сборка сцены ----------------
function rockTexture(size, seed = 31, dark = 1) {
  const N = noise2(seed), N2 = noise2(seed + 7);
  return makeMaps(size, (u, v) => {
    const n = N(u * 6, v * 6, 6), m = N2(u * 22, v * 22, 4);
    const crack = Math.abs(N2(u * 4 + 3, v * 4, 5) - 0.5) < 0.015 ? 1 : 0;
    const strata = Math.sin(v * 40 + n * 6) * 0.5 + 0.5;
    let h = n * 0.7 + m * 0.3 - crack * 0.4;
    let k = (45 + n * 60 + m * 25 + strata * 12) * dark;
    const wet = N(u * 2 + 9, v * 3, 3) > 0.6;
    return { h, r: k * 0.95, g: k * 0.9, b: k * 0.86, rough: wet ? 0.25 : 0.9 - m * 0.2 };
  }, 5);
}
function plankWallTexture(size) {
  const N = noise2(51), N2 = noise2(52);
  return makeMaps(size, (u, v) => {
    const cols = 6; const pl = Math.floor(u * cols); const fx = (u * cols) % 1;
    const gap = fx < 0.04 || fx > 0.96;
    const n = N(u * 4 + pl * 3, v * 30, 4);
    const grain = Math.sin(v * 80 + n * 10 + pl * 4) * 0.5 + 0.5;
    const rot = Math.max(0, N2(u * 3, v * 3, 3) - 0.55) * 2;
    const nail = (Math.abs(fx - 0.5) < 0.04 && (Math.abs(v - 0.15) < 0.012 || Math.abs(v - 0.85) < 0.012));
    let k = gap ? 10 : 38 + grain * 22 + n * 20; k *= 1 - rot * 0.6;
    if (nail) return { h: 0.8, r: 50, g: 45, b: 40, rough: 0.4 };
    return { h: gap ? 0 : 0.5 + grain * 0.15 - rot * 0.2, r: k * 1.0, g: k * 0.78, b: k * 0.58, rough: 0.85 };
  }, 6);
}
function concreteTexture(size) {
  const N = noise2(61), N2 = noise2(62);
  return makeMaps(size, (u, v) => {
    const n = N(u * 10, v * 10, 5), m = N2(u * 40, v * 40, 3);
    const seam = Math.abs(v - 0.5) < 0.006 || Math.abs(u - 0.5) < 0.006;
    const stripe = v > 0.82 && v < 0.9 && Math.floor((u + v) * 14) % 2 === 0;
    const stain = Math.max(0, N2(u * 2, v * 1.5, 3) - 0.5) * 1.5 + Math.max(0, v - 0.75);
    let r, g, b; const k = 95 + n * 40 + m * 15;
    if (stripe) { r = 150; g = 110; b = 20; } else { r = k; g = k * 0.98; b = k * 0.95; }
    const d = 1 - Math.min(0.6, stain); r *= d; g *= d; b *= d;
    if (seam) { r *= 0.5; g *= 0.5; b *= 0.5; }
    const pit = m > 0.78 ? 1 : 0;
    return { h: 0.5 + n * 0.2 - pit * 0.3 - (seam ? 0.3 : 0), r, g, b, rough: 0.9 - (stain > 0.4 ? 0.3 : 0) };
  }, 7);
}
function gravelTexture(size) {
  const N = noise2(71), N2 = noise2(72);
  return makeMaps(size, (u, v) => {
    const n = N(u * 30, v * 30, 4), m = N2(u * 80, v * 80, 2);
    const stone = m > 0.55 ? (m - 0.55) * 2.2 : 0;
    const k = 35 + n * 40 + stone * 50;
    const puddle = N(u * 2.5, v * 2.5, 3) > 0.62;
    return { h: n * 0.4 + stone * 0.6, r: k * 0.95, g: k * 0.9, b: k * 0.85, rough: puddle ? 0.1 : 0.9 };
  }, 8);
}

const LEGACY_PROPS = ['crate', 'hanger', 'bones', 'trail', 'lamp', 'hanger2', 'scratch', 'web'];
export function buildWorld(scene, maze, quality, theme = 'brick') {
  const { G, isWall } = maze;
  const R = rng(maze.seedProps || 1234);
  const texSize = quality === 'low' ? 256 : quality === 'ultra2' ? 1536 : quality === 'ultra' ? 1024 : quality === 'high' ? 768 : 512;
  const wallTex = { brick: () => brickTexture(texSize), water: () => brickTexture(texSize), shaft: () => brickTexture(texSize), rock: () => rockTexture(texSize), cave: () => rockTexture(texSize, 37, 0.8), wood: () => plankWallTexture(texSize), concrete: () => concreteTexture(texSize) };
  const kit = KITS[theme] || null;
  const legacyWall = (n) => (n === 'wood' ? wallTex.wood : n === 'concrete' ? wallTex.concrete : n === 'brick' ? wallTex.brick : null);
  const brick = kit ? (legacyWall(kit.wall) ? legacyWall(kit.wall)() : kitTexture(kit.wall, texSize)) : (wallTex[theme] || wallTex.brick)();
  const floor = kit ? kitTexture(kit.floor, texSize) : (theme === 'cave' || theme === 'rock' || theme === 'wood') ? gravelTexture(texSize) : floorTexture(texSize);
  const ceil = kit ? (kit.ceil === 'concrete' ? concreteTexture(256) : kit.ceil ? kitTexture(kit.ceil, Math.min(512, texSize)) : null) : theme === 'concrete' ? concreteTexture(256) : ceilTexture(256), wood = woodTexture(256);
  const KIND = maze.kind || new Uint8Array(G * G).fill(1);
  const kindAt = (x, y) => (x < 0 || y < 0 || x >= G || y >= G ? 1 : KIND[y * G + x] || 1);

  const wallMat = new THREE.MeshStandardMaterial({ ...brick, color: 0xffffff, roughness: 1, aoMapIntensity: 1, normalScale: new THREE.Vector2(1.4, 1.4) });
  brick.map.repeat.set(1, 1);
  const boxGeo = new THREE.BoxGeometry(TILE, WALL_H, TILE);
  // растянуть UV по высоте, чтобы кирпичи не вытягивались
  const uv = boxGeo.attributes.uv, nrmA = boxGeo.attributes.normal;
  if (!kit || kit.wallUV !== 'full') for (let i = 0; i < uv.count; i++) if (Math.abs(nrmA.getY(i)) < 0.5) uv.setY(i, uv.getY(i) * WALL_H / TILE);
  const walls = [], treeSpots = [], columns = [], wagonTiles = [];
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    if (!isWall(x, y)) continue;
    if (isWall(x - 1, y) && isWall(x + 1, y) && isWall(x, y - 1) && isWall(x, y + 1)) continue;
    const kd = kindAt(x, y);
    if (kd === 2) { treeSpots.push([x * TILE + TILE / 2 + (R() - 0.5) * 1.2, y * TILE + TILE / 2 + (R() - 0.5) * 1.2, 1.1]); if (R() < 0.6) treeSpots.push([x * TILE + TILE / 2 + (R() - 0.5) * 2, y * TILE + TILE / 2 + (R() - 0.5) * 2, 0.8]); continue; }
    if (kd === 3) { columns.push([x, y]); continue; }
    if (kd === 4) { wagonTiles.push([x, y]); continue; }
    walls.push([x, y]);
  }
  const inst = new THREE.InstancedMesh(boxGeo, wallMat, walls.length);
  const m4 = new THREE.Matrix4();
  walls.forEach(([x, y], i) => { m4.makeTranslation(x * TILE + TILE / 2, WALL_H / 2, y * TILE + TILE / 2); inst.setMatrixAt(i, m4); });
  inst.castShadow = true; inst.receiveShadow = true;
  scene.add(inst);

  const size = G * TILE;
  const fGeo = new THREE.PlaneGeometry(size, size); fGeo.rotateX(-Math.PI / 2);
  { const fr = kit ? kit.frep : 1.5; for (const k of ['map', 'roughnessMap', 'normalMap', 'aoMap']) floor[k].repeat.set(G / fr, G / fr); }
  const floorMesh = new THREE.Mesh(fGeo, new THREE.MeshStandardMaterial({ ...floor, roughness: 1, metalness: 0.0, normalScale: new THREE.Vector2(1.2, 1.2) }));
  floorMesh.position.set(size / 2, 0, size / 2); floorMesh.receiveShadow = true; scene.add(floorMesh);

  if (ceil) {
    const cGeo = new THREE.PlaneGeometry(size, size); cGeo.rotateX(Math.PI / 2);
    for (const k of ['map', 'roughnessMap', 'normalMap', 'aoMap']) ceil[k].repeat.set(G / 2, G / 2);
    const ceilMesh = new THREE.Mesh(cGeo, new THREE.MeshStandardMaterial({ ...ceil, roughness: 1 }));
    ceilMesh.position.set(size / 2, WALL_H, size / 2); ceilMesh.receiveShadow = true; scene.add(ceilMesh);
  }
  let outdoor = null; const treeCol = [];
  if (kit && kit.outdoor) { outdoor = buildSky(scene); buildRoofs(scene, maze.rooms || []); }
  if (maze.trees) for (const [x, y] of maze.trees) { const px = x * TILE + TILE / 2 + (R() - 0.5) * 0.8, pz = y * TILE + TILE / 2 + (R() - 0.5) * 0.8; treeSpots.push([px, pz, 0.9]); treeCol.push({ x: px, z: pz, r: 0.45 }); }
  buildTrees(scene, treeSpots, quality, R);
  buildColumns(scene, columns, texSize);
  { const runs = []; const set = new Set(wagonTiles.map(([x, y]) => y * G + x)); for (const [x, y] of wagonTiles) { if (set.has(y * G + x - 1)) continue; let n = 1; while (set.has(y * G + x + n)) n++; runs.push({ x0: x, y, n }); } if (runs.length) buildWagons(scene, runs, R); }

  // Деревянные балки под потолком
  const beamMat = new THREE.MeshStandardMaterial({ ...wood, roughness: 0.9 });
  const beamGeo = new THREE.BoxGeometry(TILE, 0.25, 0.3);
  const beams = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y) || kit) continue;
    if (isWall(x, y - 1) && isWall(x, y + 1) && (x + y) % 2 === 0) beams.push([x, y, 0]);
    else if (isWall(x - 1, y) && isWall(x + 1, y) && (x + y) % 2 === 0) beams.push([x, y, 1]);
  }
  const beamInst = new THREE.InstancedMesh(beamGeo, beamMat, beams.length);
  const q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
  beams.forEach(([x, y, r], i) => {
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r ? 0 : Math.PI / 2);
    m4.compose(new THREE.Vector3(x * TILE + TILE / 2, WALL_H - 0.13, y * TILE + TILE / 2), q, sc);
    beamInst.setMatrixAt(i, m4);
  });
  beamInst.castShadow = true; beamInst.receiveShadow = true; scene.add(beamInst);

  // Стойки крепи под балками
  const postGeo = new THREE.BoxGeometry(0.22, WALL_H - 0.25, 0.22);
  const postInst = new THREE.InstancedMesh(postGeo, beamMat, beams.length * 2);
  beams.forEach(([x, y, r], i) => {
    for (const s of [-1, 1]) {
      const px = x * TILE + TILE / 2 + (r ? s * (TILE / 2 - 0.12) : 0), pz = y * TILE + TILE / 2 + (r ? 0 : s * (TILE / 2 - 0.12));
      q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (R() - 0.5) * 0.05);
      m4.compose(new THREE.Vector3(px, (WALL_H - 0.25) / 2, pz), q, sc); postInst.setMatrixAt(i * 2 + (s + 1) / 2, m4);
    }
  });
  postInst.castShadow = true; postInst.receiveShadow = true; scene.add(postInst);

  const crateMat = new THREE.MeshStandardMaterial({ ...wood, roughness: 0.85 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.45, metalness: 0.85 });
  const rustMat = new THREE.MeshStandardMaterial({ color: 0x4a2c1e, roughness: 0.8, metalness: 0.5 });
  const boneMat = new THREE.MeshStandardMaterial({ color: 0xb3a68a, roughness: 0.7 });
  const sackMat = new THREE.MeshStandardMaterial({ map: sackTexture(), roughness: 1 });
  const ropeMat = new THREE.MeshStandardMaterial({ color: 0x4a3c2a, roughness: 1 });
  const colliders = [...treeCol], candles = [], lamps = [], hangers = [], drips = [];
  const wallSide = (x, y) => {
    const s = []; const solid = (a, b) => isWall(a, b) && (!kit || kindAt(a, b) === 1);
    if (solid(x - 1, y)) s.push([-1, 0]); if (solid(x + 1, y)) s.push([1, 0]);
    if (solid(x, y - 1)) s.push([0, -1]); if (solid(x, y + 1)) s.push([0, 1]);
    return s;
  };
  // Трубы вдоль стен под потолком: длинные прямые участки
  const pipeGeo = new THREE.CylinderGeometry(0.07, 0.07, TILE, 12); pipeGeo.rotateZ(Math.PI / 2);
  const pipeList = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y)) continue;
    if (kit ? !kit.pipes : (theme === 'cave' || theme === 'wood')) continue;
    if (isWall(x, y - 1) && !isWall(x - 1, y) && !isWall(x + 1, y) && (y % 4 === 1)) pipeList.push([x, y, 0, -1]);
    if (isWall(x - 1, y) && !isWall(x, y - 1) && !isWall(x, y + 1) && (x % 4 === 3)) pipeList.push([x, y, 1, -1]);
  }
  const pipeInst = new THREE.InstancedMesh(pipeGeo, rustMat, pipeList.length * 2);
  pipeList.forEach(([x, y, vert, s], i) => {
    const c = tileCenter(x, y);
    for (let k = 0; k < 2; k++) {
      const off = TILE / 2 - 0.12 - k * 0.17, h = WALL_H - 0.45 - k * 0.05;
      if (!vert) { q.identity(); m4.compose(new THREE.Vector3(c.x, h, c.z + s * off), q, sc); }
      else { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2); m4.compose(new THREE.Vector3(c.x + s * off, h, c.z), q, sc); }
      pipeInst.setMatrixAt(i * 2 + k, m4);
    }
    if (R() < 0.12) drips.push(new THREE.Vector3(vert ? c.x - off2() : c.x, WALL_H - 0.5, vert ? c.z : c.z - off2()));
  });
  function off2() { return TILE / 2 - 0.12; }
  pipeInst.castShadow = true; pipeInst.receiveShadow = true; scene.add(pipeInst);

  // Пятна на полу: волок, лужи крови
  const trailTex = trailTexture();
  // Паутина в углах
  const webTex = webTexture();
  const webMat = new THREE.MeshStandardMaterial({ map: webTex, transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, alphaTest: 0.02 });

  maze.props.forEach(([x, y], k) => {
    const sides = wallSide(x, y); if (!sides.length) return;
    const [sx, sy] = sides[Math.floor(R() * sides.length)];
    const c = tileCenter(x, y);
    const wx = c.x + sx * (TILE / 2 - 0.45), wz = c.z + sy * (TILE / 2 - 0.45);
    const PL = kit ? kit.props : LEGACY_PROPS;
    let pname = PL[k % PL.length];
    const inRoom = (maze.rooms || []).some((r) => x >= r.x0 && x < r.x0 + r.w && y >= r.y0 && y < r.y0 + r.h);
    if (kit && kit.outdoor && (pname === 'hanger' || pname === 'hanger2' || pname === 'lamp' || pname === 'tube') && !inRoom) pname = 'bones';
    const kind = { crate: 0, hanger: 1, bones: 2, trail: 3, lamp: 4, hanger2: 5, scratch: 6, web: 7 }[pname];
    if (pname === 'tube') {
      const t = makeTube(R); t.group.position.add(new THREE.Vector3(c.x, WALL_H, c.z)); t.group.rotation.y = sx !== 0 ? Math.PI / 2 : 0; scene.add(t.group);
      lamps.push({ pos: new THREE.Vector3(c.x, WALL_H - 0.1, c.z), mat: t.mat, group: t.group }); return;
    }
    if (kind == null) {
      const f = makeFurniture(pname, R); if (!f) return;
      const off = TILE / 2 - f.depth / 2 - 0.06;
      f.group.position.set(c.x + sx * off, 0, c.z + sy * off); f.group.rotation.y += Math.atan2(-sx, -sy);
      scene.add(f.group); colliders.push({ x: c.x + sx * off, z: c.z + sy * off, r: f.r }); return;
    }
    if (kind === 0) {
      const s = 0.65 + R() * 0.25;
      const crate = makeCrate(s, Math.floor(R() * 1e6) + 1);
      crate.position.set(wx, 0, wz); crate.rotation.y = R() * 0.6 - 0.3; scene.add(crate);
      if (R() > 0.5) { const c2 = makeCrate(s * 0.65, Math.floor(R() * 1e6) + 1); c2.position.set(wx + (R() - 0.5) * 0.1, s, wz + (R() - 0.5) * 0.1); c2.rotation.y = R() * 6; scene.add(c2); }
      colliders.push({ x: wx, z: wz, r: s * 0.7 });
    } else if (kind === 1 || kind === 5) {
      // висящее тело в мешке
      const g = new THREE.Group(); const len = 1.5 + R() * 0.3;
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, len - 0.4, 6, 14), sackMat); body.position.y = -0.55 - len / 2;
      const bp = body.geometry.attributes.position; for (let i = 0; i < bp.count; i++) { const yy = bp.getY(i); const kk = 1 + Math.sin(yy * 6 + i) * 0.04 - (yy > len * 0.3 ? 0.25 : 0); bp.setX(i, bp.getX(i) * kk); bp.setZ(i, bp.getZ(i) * kk * 0.8); } body.geometry.computeVertexNormals();
      const tie = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), ropeMat); tie.rotation.x = Math.PI / 2; tie.position.y = -0.62; g.add(tie);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 6), ropeMat); rope.position.y = -0.3; g.add(rope, body);
      const cx = c.x + (R() - 0.5) * 0.5, cz = c.z + (R() - 0.5) * 0.5;
      g.position.set(cx, WALL_H, cz); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
      hangers.push({ group: g, pos: new THREE.Vector3(cx, 0, cz), t: R() * 100, trigger: kind === 5, dropped: false, len, vy: 0, body });
      colliders.push({ x: cx, z: cz, r: 0.28, hanger: true });
    } else if (kind === 2) {
      // кости и череп
      const g = new THREE.Group();
      const skull = new THREE.Mesh(new THREE.SphereGeometry(0.1, 14, 12), boneMat); skull.scale.set(0.85, 0.9, 1.1); skull.position.y = 0.09; g.add(skull);
      const sockets = new THREE.MeshStandardMaterial({ color: 0x050403 });
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), sockets); e.position.set(s * 0.035, 0.11, -0.095); g.add(e); }
      skull.rotation.set(R() - 0.5, R() * 6, R() - 0.5);
      for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.3 + R() * 0.2, 6), boneMat); b.rotation.set(Math.PI / 2, 0, R() * 6); b.position.set((R() - 0.5) * 0.6, 0.02, (R() - 0.5) * 0.6); g.add(b); }
      g.position.set(wx, 0, wz); g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); scene.add(g);
    } else if (kind === 3) {
      // след волочения
      const m = new THREE.Mesh(new THREE.PlaneGeometry(0.8, TILE * 1.6), new THREE.MeshStandardMaterial({ map: trailTex, transparent: true, depthWrite: false, roughness: 0.3, polygonOffset: true, polygonOffsetFactor: -1 }));
      m.rotation.x = -Math.PI / 2; m.rotation.z = (sx !== 0 ? 0 : Math.PI / 2) + (R() - 0.5) * 0.3; m.position.set(c.x, 0.01, c.z); m.receiveShadow = true; scene.add(m);
    } else if (kind === 4) {
      // мёртвая лампа в решётке на потолке
      const g = new THREE.Group();
      const bulbMat = new THREE.MeshStandardMaterial({ color: 0x222018, emissive: 0xffd7a0, emissiveIntensity: 0, roughness: 0.2 });
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 10), bulbMat); bulb.position.y = -0.3; g.add(bulb);
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.25, 4), ropeMat); cord.position.y = -0.12; g.add(cord);
      for (let i = 0; i < 6; i++) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 12, Math.PI), ironMat); w.rotation.y = i / 6 * Math.PI; w.position.y = -0.3; g.add(w); }
      g.position.set(c.x, WALL_H, c.z); g.traverse((o) => { if (o.isMesh) o.castShadow = true; }); scene.add(g);
      lamps.push({ pos: new THREE.Vector3(c.x, WALL_H - 0.3, c.z), mat: bulbMat, group: g });
    } else if (kind === 6) {
      // царапины ногтями на стене
      const tex = scratchTexture(R);
      const dm = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      dm.position.set(c.x + sx * (TILE / 2 - 0.01), 0.9 + R() * 0.6, c.z + sy * (TILE / 2 - 0.01)); dm.lookAt(c.x, dm.position.y, c.z); dm.receiveShadow = true; scene.add(dm);
    } else {
      // паутина в верхнем углу
      const web = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), webMat);
      web.position.set(c.x + sx * (TILE / 2 - 0.35), WALL_H - 0.35, c.z + sy * (TILE / 2 - 0.35));
      web.lookAt(c.x, WALL_H - 0.6, c.z); web.rotateZ(R() * 6); scene.add(web);
    }
  });
  // Вода по колено
  let water = null;
  if (theme === 'water') {
    const wg = new THREE.PlaneGeometry(G * TILE, G * TILE); wg.rotateX(-Math.PI / 2);
    const wn = floor.normalMap.clone(); wn.repeat.set(G / 3, G / 3); wn.needsUpdate = true;
    water = new THREE.Mesh(wg, new THREE.MeshStandardMaterial({ color: 0x0b0d0c, roughness: 0.04, metalness: 0.6, transparent: true, opacity: 0.82, normalMap: wn, normalScale: new THREE.Vector2(0.25, 0.25) }));
    water.position.set(G * TILE / 2, 0.22, G * TILE / 2); water.receiveShadow = true; scene.add(water);
  }
  // Кружки с землёй в логове
  if (theme === 'cave') {
    const cupMat = new THREE.MeshStandardMaterial({ color: 0x6b6258, roughness: 0.45, metalness: 0.7 });
    const dirtMat = new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 });
    const cupGeo = new THREE.CylinderGeometry(0.045, 0.04, 0.09, 10, 1, true), dirtGeo = new THREE.CircleGeometry(0.043, 10); dirtGeo.rotateX(-Math.PI / 2);
    const cups = [];
    for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) if (!isWall(x, y) && R() < 0.35) for (let k = 0; k < 2 + R() * 5; k++) cups.push([x, y]);
    const ci = new THREE.InstancedMesh(cupGeo, cupMat, cups.length), di = new THREE.InstancedMesh(dirtGeo, dirtMat, cups.length);
    cups.forEach(([x, y], i) => { const c = tileCenter(x, y); const px = c.x + (R() - 0.5) * 2, pz = c.z + (R() - 0.5) * 2; m4.makeTranslation(px, 0.045, pz); ci.setMatrixAt(i, m4); m4.makeTranslation(px, 0.08, pz); di.setMatrixAt(i, m4); });
    ci.castShadow = true; scene.add(ci, di);
  }
  // Рельсы узкоколейки вдоль прямых штреков и брошенные вагонетки
  const railMat = new THREE.MeshStandardMaterial({ color: 0x3d3a36, roughness: 0.35, metalness: 0.9 });
  const sleeperMat = new THREE.MeshStandardMaterial({ ...wood, roughness: 0.95, color: 0x8a7a66 });
  const railSeg = [], sleepers = [];
  for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) {
    if (isWall(x, y)) continue;
    const alongX = isWall(x, y - 1) && isWall(x, y + 1) && !isWall(x - 1, y) && !isWall(x + 1, y) && y % 4 === 1;
    const alongZ = isWall(x - 1, y) && isWall(x + 1, y) && !isWall(x, y - 1) && !isWall(x, y + 1) && x % 4 === 1;
    if ((alongX || alongZ) && !kit && !['cave', 'wood', 'rock'].includes(theme)) railSeg.push([x, y, alongX]);
  }
  const railGeo = new THREE.BoxGeometry(TILE, 0.05, 0.045);
  const railInst = new THREE.InstancedMesh(railGeo, railMat, railSeg.length * 2);
  const slGeo = new THREE.BoxGeometry(0.16, 0.05, 0.9);
  const slInst = new THREE.InstancedMesh(slGeo, sleeperMat, railSeg.length * 4);
  railSeg.forEach(([x, y, ax], i) => {
    const c = tileCenter(x, y);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ax ? 0 : Math.PI / 2);
    for (let k = 0; k < 2; k++) { const o = k ? 0.3 : -0.3; m4.compose(new THREE.Vector3(c.x + (ax ? 0 : o), 0.075, c.z + (ax ? o : 0)), q, sc); railInst.setMatrixAt(i * 2 + k, m4); }
    for (let k = 0; k < 4; k++) { const o = -TILE / 2 + 0.3 + k * 0.6; m4.compose(new THREE.Vector3(c.x + (ax ? o : 0), 0.025, c.z + (ax ? 0 : o)), q, sc); slInst.setMatrixAt(i * 4 + k, m4); }
  });
  railInst.receiveShadow = slInst.receiveShadow = true; railInst.castShadow = true; scene.add(railInst, slInst);
  // метро: балласт, рельсы, контактный рельс и жёлтая линия у края платформы
  if (maze.tracks && maze.tracks.length) {
    const gr = gravelTexture(Math.min(512, texSize));
    const third = new THREE.MeshStandardMaterial({ color: 0x5a5046, roughness: 0.5, metalness: 0.8 });
    for (const t of maze.tracks) {
      const len = (t.x1 - t.x0 + 1) * TILE, cx = t.x0 * TILE + len / 2, cz = t.y * TILE + TILE / 2;
      const bg = new THREE.PlaneGeometry(len, TILE * 3); bg.rotateX(-Math.PI / 2);
      const gm = { ...gr }; for (const k of ['map', 'roughnessMap', 'normalMap', 'aoMap']) { gm[k] = gr[k].clone(); gm[k].repeat.set(len / 3, 3); gm[k].needsUpdate = true; }
      const bal = new THREE.Mesh(bg, new THREE.MeshStandardMaterial({ ...gm, roughness: 1 })); bal.position.set(cx, 0.015, cz); bal.receiveShadow = true; scene.add(bal);
      for (const o of [-0.76, 0.76]) { const r = new THREE.Mesh(new THREE.BoxGeometry(len, 0.14, 0.07), railMat); r.position.set(cx, 0.09, cz + o); r.castShadow = r.receiveShadow = true; scene.add(r); }
      const tr = new THREE.Mesh(new THREE.BoxGeometry(len, 0.1, 0.12), third); tr.position.set(cx, 0.2, cz + 1.3); scene.add(tr);
      const n = Math.floor(len / 0.6); const sl = new THREE.InstancedMesh(new THREE.BoxGeometry(0.2, 0.08, 2.2), sleeperMat, n);
      for (let i = 0; i < n; i++) { m4.makeTranslation(t.x0 * TILE + 0.3 + i * 0.6, 0.04, cz); sl.setMatrixAt(i, m4); } sl.receiveShadow = true; scene.add(sl);
    }
    const P = maze.platform;
    if (P) {
      const ym = new THREE.MeshStandardMaterial({ color: 0x8a7020, roughness: 0.6 });
      const len = (P.x1 - P.x0 + 1) * TILE, cx = P.x0 * TILE + len / 2;
      for (const z of [P.y0 * TILE + 0.35, (P.y1 + 1) * TILE - 0.35]) { const l = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.18), ym); l.rotation.x = -Math.PI / 2; l.position.set(cx, 0.012, z); l.receiveShadow = true; scene.add(l); }
    }
  }
  const cartSpots = railSeg.filter(() => R() < 0.08).slice(0, 4);
  for (const [x, y, ax] of cartSpots) {
    const c = tileCenter(x, y); const g = makeCart(Math.floor(R() * 1e6) + 1);
    g.position.set(c.x, 0.05, c.z); g.rotation.y = (ax ? 0 : Math.PI / 2) + (R() - 0.5) * 0.05; scene.add(g);
    colliders.push({ x: c.x, z: c.z, r: 0.7 });
  }
  // мелкий мусор на полу: обломки, бумаги, осколки — на высоких настройках
  const litterK = { high: 0.5, ultra: 1, ultra2: 2 }[quality] || 0;
  if (litterK) {
    const spots = [];
    for (let y = 1; y < G - 1; y++) for (let x = 1; x < G - 1; x++) if (!isWall(x, y) && !(maze.trees || []).some((t) => t[0] === x && t[1] === y)) { const near = wallSide(x, y).length; const n = Math.round((near ? 3 : 1) * litterK * (0.5 + R())); for (let i = 0; i < n; i++) spots.push([x, y, near ? wallSide(x, y)[Math.floor(R() * near)] : null]); }
    const rubGeo = new THREE.DodecahedronGeometry(0.05, 0); const rubMat = new THREE.MeshStandardMaterial({ color: 0x5a554e, roughness: 0.95, flatShading: true });
    const papGeo = new THREE.PlaneGeometry(0.21, 0.29); papGeo.rotateX(-Math.PI / 2);
    const papTex = canvasTex(128, 176, (g, w, h) => { g.fillStyle = '#a49c88'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(40,34,28,.45)'; for (let i = 0; i < 14; i++) g.fillRect(12, 14 + i * 10, 40 + Math.random() * 60, 2); g.filter = 'blur(10px)'; g.fillStyle = 'rgba(70,50,30,.35)'; g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 30, 0, 7); g.fill(); });
    const papMat = new THREE.MeshStandardMaterial({ map: papTex, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 });
    const rub = new THREE.InstancedMesh(rubGeo, rubMat, spots.length), pap = new THREE.InstancedMesh(papGeo, papMat, spots.length);
    let ri = 0, pi = 0; const e = new THREE.Euler(), v = new THREE.Vector3(), s3 = new THREE.Vector3();
    for (const [x, y, side] of spots) {
      const c = tileCenter(x, y); let px = c.x + (R() - 0.5) * TILE * 0.9, pz = c.z + (R() - 0.5) * TILE * 0.9;
      if (side && R() < 0.7) { px = c.x + side[0] * (TILE / 2 - 0.1 - R() * 0.3) + (side[0] ? 0 : (R() - 0.5) * TILE); pz = c.z + side[1] * (TILE / 2 - 0.1 - R() * 0.3) + (side[1] ? 0 : (R() - 0.5) * TILE); }
      if (R() < 0.7) { const k = 0.4 + R() * 1.4; e.set(R() * 3, R() * 3, R() * 3); q.setFromEuler(e); s3.set(k, k * (0.5 + R() * 0.5), k); v.set(px, 0.02 * k, pz); m4.compose(v, q, s3); rub.setMatrixAt(ri++, m4); }
      else { e.set((R() - 0.5) * 0.1, R() * 6, (R() - 0.5) * 0.1); q.setFromEuler(e); s3.set(1, 1, 1); v.set(px, 0.006 + R() * 0.004, pz); m4.compose(v, q, s3); pap.setMatrixAt(pi++, m4); }
    }
    rub.count = ri; pap.count = pi; rub.castShadow = true; rub.receiveShadow = pap.receiveShadow = true; scene.add(rub, pap);
  }
  return { wallMat, colliders, candles, lamps, hangers, drips, floorMesh, water, outdoor: !!outdoor, moon: outdoor && outdoor.moon };
}

// Луч видимости по сетке
export function lineOfSight(maze, a, b) {
  const dx = b.x - a.x, dz = b.z - a.z; const d = Math.hypot(dx, dz);
  const steps = Math.ceil(d / 0.3);
  for (let i = 1; i < steps; i++) {
    const t = i / steps; const x = a.x + dx * t, z = a.z + dz * t;
    if (maze.isWall(Math.floor(x / TILE), Math.floor(z / TILE))) return false;
  }
  return true;
}
